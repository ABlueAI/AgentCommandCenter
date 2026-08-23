'use strict';
// Blue Helm production pane status — the two-resource settings transaction.
//
// Procurement record: docs/OSS-PROCUREMENT-pane-status.md
// Blue's verdict, verbatim: BLUE SUBSYSTEM VERDICT: BUILD FRESH
//
// THE PROBLEM THIS SOLVES. Setup must change two things that cannot be changed together: a settings
// file we do NOT own, and a descriptor we do. There is no atomic operation spanning both. So the
// protocol is ordered so that every crash point is DECIDABLE from the descriptor alone:
//
//   write INTENT to the descriptor  ->  mutate settings  ->  verify  ->  FINALIZE the descriptor
//
// A crash before intent leaves nothing to reconcile. A crash after intent and before finalize leaves a
// descriptor that says "I was about to do X", and startup can go look at the settings file and see
// whether X happened. That is the entire reason the order is what it is.
//
// STARTUP RECONCILIATION MAY ONLY EVER UPDATE THE DESCRIPTOR. It never writes Claude settings —
// see pane-status-recovery.js. Every crash-point fixture proves the settings bytes are unchanged.
//
// CAS IS THE REAL PROTECTION. The lock is cooperative and cannot bind Claude Code itself or a human
// with an editor. Every write is therefore conditional on the file still hashing to what we read, and
// every rollback is conditional on the file still hashing to what we WROTE. A third-party write does
// not get overwritten; it puts us into RECONCILIATION_REQUIRED and we stop.

const fs = require('fs');
const path = require('path');

const descriptorMod = require('./pane-status-descriptor');
const doc = require('./pane-status-settings-doc');
const shimMod = require('./pane-status-runtime-shim');

const TXN = descriptorMod.TXN;

const TXN_REFUSAL = Object.freeze({
  NOT_RECONCILED: 'txn-not-reconciled',
  LOCK_HELD: 'txn-lock-held',
  SETTINGS_UNREADABLE: 'txn-settings-unreadable',
  SETTINGS_MALFORMED: 'txn-settings-malformed',
  OWNERSHIP: 'txn-ownership-refused',
  SHIM_PATH_REFUSED: 'txn-shim-path-refused',
  SHIM_WRITE_FAILED: 'txn-shim-write-failed',
  CAS_MISMATCH: 'txn-settings-changed-under-us',
  WRITE_FAILED: 'txn-settings-write-failed',
  VERIFY_FAILED: 'txn-settings-verify-failed',
  DESCRIPTOR_FAILED: 'txn-descriptor-write-failed',
  ROLLBACK_BLOCKED: 'txn-rollback-blocked-by-third-party-write',
  NO_DESCRIPTOR: 'txn-no-descriptor',
  WRITE_INDETERMINATE: 'txn-settings-write-state-indeterminate',
  REMOVAL_REFUSED: 'txn-removal-refused',
  CLEANUP_FAILED: 'txn-cleanup-not-verified',
});

function readSettings(settingsPath) {
  let text;
  try { text = fs.readFileSync(settingsPath, 'utf8'); }
  catch (e) {
    if (e && e.code === 'ENOENT') return { ok: true, text: '', value: {}, sha256: descriptorMod.sha256(''), absent: true };
    return { ok: false, reason: TXN_REFUSAL.SETTINGS_UNREADABLE };
  }
  const parsed = doc.parse(text);
  if (!parsed.ok) return { ok: false, reason: TXN_REFUSAL.SETTINGS_MALFORMED, detail: parsed.reason };
  // STRUCTURAL GATE (finding 10). A `hooks` value that is an array, a scalar, or null — or an
  // installed-event value that is not an array, or a matcher group we cannot safely preserve — is a
  // refusal here, before any install or removal decides anything. Rewriting a shape we do not
  // understand is not a repair; it is data loss in somebody else's file.
  const structure = doc.validateHooksStructure(parsed.value);
  if (!structure.ok) {
    return { ok: false, reason: TXN_REFUSAL.SETTINGS_MALFORMED, detail: structure.reason, event: structure.event };
  }
  return { ok: true, text, value: parsed.value, sha256: descriptorMod.sha256(text), absent: false };
}

/**
 * A stable fingerprint of every OTHER installation's groups: their event and their exact contents, in
 * document order, with array indices deliberately excluded. Used to prove case B removals leave a
 * coexisting installation byte-identical.
 */
function otherInstallSignature(settings, installId) {
  return JSON.stringify(doc.otherInstallGroups(settings, installId).map(([ev, , g]) => [ev, g]));
}

// What the settings file actually contains after an atomicWrite threw. This is the whole of finding 5:
// a generic WRITE_FAILED cannot be allowed to mean "nothing was written", because the read-back that
// raises EREADBACK happens AFTER the rename.
const WRITE_DISPOSITION = Object.freeze({
  NOT_LANDED: 'settings-unchanged',
  LANDED: 'settings-replaced',
  INDETERMINATE: 'settings-indeterminate',
});

/**
 * Re-read the settings file after a failed write and compare it against the two hashes that bound the
 * transaction: what it was before, and what we tried to make it.
 *
 *   current == pre-transaction  -> the replacement never landed. Safe pre-write failure.
 *   current == attempted output -> the replacement DID land. The mutation is real and still owed a
 *                                  verification; the descriptor must not say IDLE.
 *   anything else, or unreadable-> indeterminate. Never overwrite, never claim success or IDLE.
 */
function classifyWriteFailure(settingsPath, preSha256, attemptedSha256) {
  let currentText;
  try { currentText = fs.readFileSync(settingsPath, 'utf8'); }
  catch (e) {
    if (e && e.code === 'ENOENT') currentText = '';
    else return { disposition: WRITE_DISPOSITION.INDETERMINATE, landed: null, sha256: null };
  }
  const cur = descriptorMod.sha256(currentText);
  if (cur === preSha256) return { disposition: WRITE_DISPOSITION.NOT_LANDED, landed: false, sha256: cur };
  if (cur === attemptedSha256) return { disposition: WRITE_DISPOSITION.LANDED, landed: true, sha256: cur };
  return { disposition: WRITE_DISPOSITION.INDETERMINATE, landed: null, sha256: cur };
}

/**
 * Write the runtime shim atomically at its stable path and return its identity.
 * § 8: the path is stable across upgrades; only the CONTENT is rewritten, so Claude settings never
 * have to change when Electron moves.
 */
function writeShim(shimPath, runtimePath, reporterPath) {
  const verdict = shimMod.validateShimPath(shimPath);
  if (!verdict.ok) return { ok: false, reason: TXN_REFUSAL.SHIM_PATH_REFUSED, detail: verdict.reason };
  const content = shimMod.buildShimContent(runtimePath, reporterPath);
  try {
    const res = descriptorMod.atomicWriteFileSync(shimPath, content);
    return { ok: true, sha256: res.sha256, bytes: res.bytes };
  } catch (e) {
    return { ok: false, reason: TXN_REFUSAL.SHIM_WRITE_FAILED, detail: (e && e.code) || 'unknown' };
  }
}

/**
 * Compare-and-swap replacement of the settings file.
 *
 * `expectedSha256` is what the file hashed to when we read it. If it no longer does, somebody wrote in
 * the meantime and we refuse — we do not merge, and we certainly do not overwrite.
 */
function casReplace(settingsPath, expectedSha256, nextText) {
  let currentText;
  try { currentText = fs.readFileSync(settingsPath, 'utf8'); }
  catch (e) {
    if (e && e.code === 'ENOENT') currentText = '';
    else return { ok: false, reason: TXN_REFUSAL.SETTINGS_UNREADABLE };
  }
  if (descriptorMod.sha256(currentText) !== expectedSha256) {
    return { ok: false, reason: TXN_REFUSAL.CAS_MISMATCH };
  }
  const attemptedSha256 = descriptorMod.sha256(nextText);
  try { descriptorMod.atomicWriteFileSync(settingsPath, nextText); }
  catch (e) {
    // The phase the write reached is carried on the error by pane-status-descriptor; the disposition
    // is decided by re-reading the file, because the phase alone cannot see a third party's bytes.
    const disp = classifyWriteFailure(settingsPath, expectedSha256, attemptedSha256);
    return {
      ok: false,
      reason: TXN_REFUSAL.WRITE_FAILED,
      detail: (e && e.code) || 'unknown',
      phase: (e && e.paneStatusWritePhase) || 'unknown',
      disposition: disp.disposition,
      landed: disp.landed,
      attemptedSha256,
    };
  }
  return { ok: true, sha256: attemptedSha256 };
}

/**
 * Verify a write landed, both ways:
 *   * BYTES — the file hashes to exactly what we intended to write;
 *   * SEMANTICS — it still parses, and the groups we meant to add or remove are respectively present
 *     or absent. A file that hashes right but no longer parses is not a success.
 */
function verifyWrite(settingsPath, expectedSha256, expectation) {
  let text;
  try { text = fs.readFileSync(settingsPath, 'utf8'); }
  catch { return { ok: false, reason: TXN_REFUSAL.VERIFY_FAILED, detail: 'unreadable' }; }
  if (descriptorMod.sha256(text) !== expectedSha256) {
    return { ok: false, reason: TXN_REFUSAL.VERIFY_FAILED, detail: 'hash-mismatch' };
  }
  const parsed = doc.parse(text);
  if (!parsed.ok) return { ok: false, reason: TXN_REFUSAL.VERIFY_FAILED, detail: 'unparseable-after-write' };

  if (expectation && expectation.mode === 'installed') {
    const cls = doc.classifyDocument(parsed.value, expectation.groups, expectation.installId);
    if (cls.overall !== doc.OWNERSHIP.OWNED_EXACT) {
      return { ok: false, reason: TXN_REFUSAL.VERIFY_FAILED, detail: 'not-owned-exact-after-write' };
    }
  } else if (expectation && expectation.mode === 'removed') {
    // INSTALL-ID-SCOPED VERIFICATION (finding 4 / Binding Amendment A § 2).
    //
    // The previous build proved only that ONE JSON-stringified target string was absent — which is
    // trivially true for a group that was modified or whose keys were reordered, and was therefore
    // satisfied by exactly the case it needed to catch. The question that actually matters is: does
    // ANY group carrying THIS install id survive anywhere in the document? Not "in the eight events we
    // installed into" — anywhere, because a group that drifted to another event is still ours and
    // still points at the shim we are about to delete.
    const survivors = doc.groupsWithInstallId(parsed.value, expectation.installId);
    if (survivors.length > 0) {
      return {
        ok: false,
        reason: TXN_REFUSAL.VERIFY_FAILED,
        detail: 'owned-group-still-present-after-removal',
        survivingEvents: survivors.map((s) => s[0]),
      };
    }
    // ANOTHER INSTALLATION'S GROUPS MUST SURVIVE BYTE-FOR-BYTE AND IN THE SAME ORDER. This is the
    // positive half of Binding Amendment A § 2 case B: removing ours is only correct if theirs is
    // untouched, so the proof is part of verification rather than a separate hope.
    if (typeof expectation.otherInstallsBefore === 'string') {
      // Compare (event, group) pairs IN ORDER, deliberately dropping the array index. Removing our
      // group from an event shifts every later index in that event by one, so an index-sensitive
      // comparison would fail every legitimate case B removal. What must be preserved is their bytes
      // and their relative order — not the slot number a group we removed used to occupy.
      const after = otherInstallSignature(parsed.value, expectation.installId);
      if (after !== expectation.otherInstallsBefore) {
        return { ok: false, reason: TXN_REFUSAL.VERIFY_FAILED, detail: 'another-installation-group-changed' };
      }
    }
  }
  return { ok: true, text, sha256: descriptorMod.sha256(text) };
}

/**
 * CAS-GUARDED ROLLBACK.
 *
 * We restore the pre-transaction bytes ONLY if the file still contains exactly what WE wrote. If a
 * third party has written since, our "restore" would destroy their change, so we refuse and hand the
 * caller RECONCILIATION_REQUIRED instead. Refusing to roll back is the safe branch, not the unsafe one.
 */
function rollback(settingsPath, attemptedSha256, previousText) {
  let currentText;
  try { currentText = fs.readFileSync(settingsPath, 'utf8'); }
  catch (e) {
    if (e && e.code === 'ENOENT') currentText = '';
    else return { ok: false, reason: TXN_REFUSAL.ROLLBACK_BLOCKED, detail: 'unreadable' };
  }
  if (descriptorMod.sha256(currentText) !== attemptedSha256) {
    return { ok: false, reason: TXN_REFUSAL.ROLLBACK_BLOCKED, detail: 'third-party-write' };
  }
  try { descriptorMod.atomicWriteFileSync(settingsPath, previousText); }
  catch { return { ok: false, reason: TXN_REFUSAL.ROLLBACK_BLOCKED, detail: 'restore-write-failed' }; }
  return { ok: true };
}

/**
 * deps:
 *   userDataPath  -> app.getPath('userData'), or a temp dir in tests
 *   settingsPath  -> the REAL Claude settings file, or a temp file in tests. ALWAYS injected —
 *                    no test may ever resolve a real home directory.
 *   installId     -> nonsecret installation id
 *   lock          -> pane-status-lock instance
 *   cmdExe        -> absolute cmd.exe
 *   log(line)     -> bounded logger
 *   now()         -> injected clock
 */
function createSettingsTransaction(deps) {
  const d = deps || {};
  const userDataPath = d.userDataPath;
  const settingsPath = d.settingsPath;
  const installId = d.installId;
  const lock = d.lock;
  const cmdExe = d.cmdExe || shimMod.resolveCmdExe();
  const log = typeof d.log === 'function' ? d.log : () => {};
  const now = typeof d.now === 'function' ? d.now : () => Date.now();
  for (const [k, v] of [['userDataPath', userDataPath], ['settingsPath', settingsPath], ['installId', installId]]) {
    if (typeof v !== 'string' || !v) throw new Error('pane-status-settings-txn: ' + k + ' is required');
  }
  if (!lock) throw new Error('pane-status-settings-txn: lock is required');

  const shimPath = doc.buildShimPath(userDataPath, installId);
  const ownerMarker = path.join(doc.OWNER_DIR, installId);

  function putDescriptor(state, extra) {
    try {
      const descriptor = descriptorMod.buildDescriptor(Object.assign({
        installId,
        ownerMarker,
        transactionState: state,
        settingsPath,
        createdAt: now(),
        updatedAt: now(),
      }, extra || {}));
      const res = descriptorMod.write(userDataPath, descriptor);
      if (!res.ok) return { ok: false, reason: TXN_REFUSAL.DESCRIPTOR_FAILED, detail: res.reason };
      return { ok: true, descriptor };
    } catch (e) {
      return { ok: false, reason: TXN_REFUSAL.DESCRIPTOR_FAILED, detail: (e && e.message) || 'unknown' };
    }
  }

  /**
   * SETUP. Ordered exactly as § 11 requires. The caller has already passed the trusted-sender gate and
   * has already confirmed the subsystem is in a reconciled state.
   */
  async function install(options) {
    const o = options || {};
    const runtimePath = o.runtimePath;
    const reporterPath = o.reporterPath;

    return lock.withMutex(async () => {
      const held = lock.acquire();
      if (!held.ok) return { ok: false, reason: TXN_REFUSAL.LOCK_HELD, detail: held.reason };

      try {
        const before = readSettings(settingsPath);
        if (!before.ok) return before;

        const groups = doc.buildHookGroups({ cmdExe, shimPath });
        const cls = doc.classifyDocument(before.value, groups, installId);
        if (cls.overall === doc.OWNERSHIP.OTHER_INSTALL || cls.overall === doc.OWNERSHIP.AMBIGUOUS) {
          // Never adopt, replace, duplicate, or remove another installation's groups. Refuse visibly.
          log(`[pane-status] setup refused: settings classified ${cls.overall}`);
          return { ok: false, reason: TXN_REFUSAL.OWNERSHIP, ownership: cls.overall, perEvent: cls.perEvent };
        }
        if (cls.overall === doc.OWNERSHIP.OWNED_EXACT) {
          return { ok: true, alreadyInstalled: true, groups, shimPath };
        }
        if (cls.overall === doc.OWNERSHIP.OWNED_MODIFIED) {
          log('[pane-status] setup refused: our groups are present but modified or partial');
          return { ok: false, reason: TXN_REFUSAL.OWNERSHIP, ownership: cls.overall, perEvent: cls.perEvent };
        }

        // Shim first: settings that point at a shim we failed to write would be a stranded hook.
        const shimRes = writeShim(shimPath, runtimePath, reporterPath);
        if (!shimRes.ok) return shimRes;

        let runtimeSize = null, runtimeMtimeMs = null;
        try { const st = fs.statSync(runtimePath); runtimeSize = st.size; runtimeMtimeMs = st.mtimeMs; }
        catch { /* recorded as null; the reconciler treats null as "re-resolve" */ }

        const nextText = doc.serialize(doc.withInstalled(before.value, groups));
        const attemptedSha = descriptorMod.sha256(nextText);

        // INTENT BEFORE MUTATION. This is the whole two-resource protocol in one line.
        const pending = putDescriptor(TXN.INSTALL_PENDING, {
          installedGroups: groups,
          installedEvents: doc.INSTALLED_EVENTS.slice(),
          runtimePath, runtimeSize, runtimeMtimeMs,
          shimPath, shimSha256: shimRes.sha256, reporterPath,
          preTransactionSha256: before.sha256,
          attemptedOutputSha256: attemptedSha,
        });
        if (!pending.ok) return pending;

        const installedRecord = {
          installedGroups: groups, installedEvents: doc.INSTALLED_EVENTS.slice(),
          runtimePath, runtimeSize, runtimeMtimeMs,
          shimPath, shimSha256: shimRes.sha256, reporterPath,
          preTransactionSha256: before.sha256, attemptedOutputSha256: attemptedSha,
        };

        const wrote = casReplace(settingsPath, before.sha256, nextText);
        if (!wrote.ok) {
          // FINDING 5. "The write threw" is three different worlds, and only one of them is IDLE.
          if (wrote.reason === TXN_REFUSAL.WRITE_FAILED
            && wrote.disposition === WRITE_DISPOSITION.LANDED) {
            // The replacement IS on disk. Verification is still owed, so we record INSTALL_WRITTEN and
            // fall through to it. Writing IDLE here would leave eight live hook groups behind a
            // descriptor claiming nothing ever happened.
            log('[pane-status] settings replacement landed but the write reported a failure; verifying in place');
          } else if (wrote.reason === TXN_REFUSAL.WRITE_FAILED
            && wrote.disposition === WRITE_DISPOSITION.INDETERMINATE) {
            putDescriptor(TXN.RECONCILIATION_REQUIRED, installedRecord);
            log('[pane-status] settings state after a failed write is INDETERMINATE; no further automatic writes');
            return {
              ok: false, reason: TXN_REFUSAL.WRITE_INDETERMINATE, detail: wrote.phase,
              reconciliationRequired: true,
            };
          } else {
            // CAS mismatch, unreadable, or a proven pre-rename failure: the file is exactly as we found
            // it, so there is nothing to roll back and IDLE is the honest record.
            putDescriptor(TXN.IDLE, {});
            return wrote;
          }
        }
        putDescriptor(TXN.INSTALL_WRITTEN, {
          installedGroups: groups, installedEvents: doc.INSTALLED_EVENTS.slice(),
          runtimePath, runtimeSize, runtimeMtimeMs,
          shimPath, shimSha256: shimRes.sha256, reporterPath,
          preTransactionSha256: before.sha256, attemptedOutputSha256: attemptedSha,
        });

        const verified = verifyWrite(settingsPath, attemptedSha, {
          mode: 'installed', groups, installId,
        });
        if (!verified.ok) {
          const rolled = rollback(settingsPath, attemptedSha, before.text);
          if (!rolled.ok) {
            putDescriptor(TXN.RECONCILIATION_REQUIRED, {
              installedGroups: groups, installedEvents: doc.INSTALLED_EVENTS.slice(),
              runtimePath, shimPath, shimSha256: shimRes.sha256, reporterPath,
              preTransactionSha256: before.sha256, attemptedOutputSha256: attemptedSha,
            });
            return { ok: false, reason: TXN_REFUSAL.ROLLBACK_BLOCKED, reconciliationRequired: true };
          }
          putDescriptor(TXN.IDLE, {});
          return verified;
        }

        putDescriptor(TXN.INSTALL_VERIFIED, {
          installedGroups: groups, installedEvents: doc.INSTALLED_EVENTS.slice(),
          runtimePath, runtimeSize, runtimeMtimeMs,
          shimPath, shimSha256: shimRes.sha256, reporterPath,
          preTransactionSha256: before.sha256, attemptedOutputSha256: attemptedSha,
        });
        const finalized = putDescriptor(TXN.INSTALLED, {
          installedGroups: groups, installedEvents: doc.INSTALLED_EVENTS.slice(),
          runtimePath, runtimeSize, runtimeMtimeMs,
          shimPath, shimSha256: shimRes.sha256, reporterPath,
          preTransactionSha256: before.sha256, attemptedOutputSha256: attemptedSha,
        });
        if (!finalized.ok) return finalized;

        log('[pane-status] setup complete: 8 hook groups installed, descriptor finalized');
        return { ok: true, groups, shimPath, settingsSha256: verified.sha256 };
      } finally {
        lock.release(held);
      }
    });
  }

  /**
   * Finish a removal by retiring the app-owned artifacts, and REPORT WHETHER IT WORKED.
   *
   * CORRECTION (advisory review, finding 12): the previous build called `descriptorMod.remove()` and
   * `fs.unlinkSync(shimPath)` and discarded both results, then returned success unconditionally. A
   * failed shim delete leaves an orphan reporter; a failed descriptor delete leaves a record claiming
   * an installation that no longer exists, and the next startup reconciles from it.
   *
   * ORDER IS DELIBERATE. The shim goes first, and the descriptor — still at REMOVE_VERIFIED — goes
   * last, so every intermediate crash or failure leaves a state startup reconciliation can finish:
   * REMOVE_VERIFIED plus absent groups is exactly the "interrupted removal COMPLETED" branch in
   * pane-status-recovery.js.
   */
  function finishRemovalCleanup(shimTarget) {
    try { fs.unlinkSync(shimTarget); }
    catch (e) {
      if (!e || e.code !== 'ENOENT') {
        log('[pane-status] removal: settings are clean but the reporter shim could not be deleted');
        return {
          ok: false, reason: TXN_REFUSAL.CLEANUP_FAILED, detail: 'shim-delete-failed',
          reconciliationRequired: true,
        };
      }
    }
    // The shim DIRECTORY is not decisive: another file in it, or a handle held by an indexer, does not
    // change whether the removal succeeded. Best effort, and never a failure on its own.
    try { fs.rmdirSync(path.dirname(shimTarget)); } catch { /* not empty, or already gone */ }

    const retired = descriptorMod.remove(userDataPath);
    if (!retired || retired.ok !== true) {
      log('[pane-status] removal: settings and shim are clean but the descriptor could not be retired');
      return {
        ok: false, reason: TXN_REFUSAL.CLEANUP_FAILED, detail: 'descriptor-delete-failed',
        reconciliationRequired: true,
      };
    }
    return { ok: true };
  }

  /**
   * REMOVAL. Targets the descriptor's EXACT recorded group, not what this build would install today —
   * after an upgrade those differ, and removing the wrong one would strand the real entry.
   *
   * CLASSIFY FIRST, MUTATE SECOND (finding 4 / Binding Amendment A § 2). The previous build performed
   * no classification at all: it subtracted a stringified target from the current document and then
   * "verified" that the same stringified target was absent. For a group that had been modified — or
   * merely re-serialized with different key order — both steps were no-ops that agreed with each
   * other, so removal reported SUCCESS, deleted the descriptor, and deleted the shim while the hook
   * group stayed live in the settings file pointing at a reporter that no longer existed.
   */
  async function remove() {
    return lock.withMutex(async () => {
      const existing = descriptorMod.read(userDataPath);
      if (!existing.ok) return { ok: false, reason: TXN_REFUSAL.NO_DESCRIPTOR, detail: existing.reason };
      const recordedGroups = existing.value.installedGroups;
      if (!recordedGroups || typeof recordedGroups !== 'object') {
        return { ok: false, reason: TXN_REFUSAL.NO_DESCRIPTOR, detail: 'no-recorded-groups' };
      }
      // The shim path RECORDED AT INSTALL TIME, not the one this build would compute. They are the
      // same today; they need not be after an upgrade, and cleanup must retire what we really wrote.
      const recordedShimPath = (existing.value.runtime && existing.value.runtime.shimPath) || shimPath;

      const held = lock.acquire();
      if (!held.ok) return { ok: false, reason: TXN_REFUSAL.LOCK_HELD, detail: held.reason };

      try {
        const before = readSettings(settingsPath);
        if (!before.ok) return before;

        const cls = doc.classifyRemoval(before.value, recordedGroups, installId);

        // Case D — partial, modified, or ambiguous. NOTHING is written: not the settings, not the
        // descriptor, not the shim. `retained:true` tells the controller to leave the presentation and
        // the pane tokens exactly as they were and point at manual recovery instead.
        if (cls.outcome === doc.REMOVAL_OUTCOME.REFUSE) {
          log(`[pane-status] removal REFUSED: ${cls.reason} — settings, descriptor and shim untouched`);
          return {
            ok: false, reason: TXN_REFUSAL.REMOVAL_REFUSED, detail: cls.reason,
            perEvent: cls.perEvent, retained: true,
          };
        }

        // Case E — only ANOTHER installation's groups are present while our descriptor says we are
        // installed. Ours did not "already go"; something reconciled them away behind our back, and
        // claiming a successful removal of this installation would be a lie.
        if (cls.outcome === doc.REMOVAL_OUTCOME.RECONCILE) {
          log(`[pane-status] removal cannot proceed: ${cls.reason}`);
          return {
            ok: false, reason: TXN_REFUSAL.REMOVAL_REFUSED, detail: cls.reason,
            perEvent: cls.perEvent, retained: true, reconciliationRequired: true,
          };
        }

        // Case C — everything we recorded is already absent and no other installation is present. No
        // settings mutation happens at all: the file is never opened for writing. Only our own
        // artifacts are retired.
        if (cls.outcome === doc.REMOVAL_OUTCOME.ALREADY_ABSENT) {
          const marked = putDescriptor(TXN.REMOVE_VERIFIED, {
            installedGroups: recordedGroups, installedEvents: existing.value.installedEvents,
            shimPath: recordedShimPath,
            preTransactionSha256: before.sha256, attemptedOutputSha256: before.sha256,
          });
          if (!marked.ok) return marked;
          const cleaned = finishRemovalCleanup(recordedShimPath);
          if (!cleaned.ok) return cleaned;
          log('[pane-status] removal: recorded groups were already absent; descriptor and shim retired');
          return { ok: true, alreadyAbsent: true, settingsSha256: before.sha256 };
        }

        // Cases A and B — every recorded group is exact. Another installation may also be present; its
        // groups are preserved verbatim and verification proves it.
        const otherInstallsBefore = otherInstallSignature(before.value, installId);
        const nextText = doc.serialize(doc.withRemoved(before.value, recordedGroups, installId));
        const attemptedSha = descriptorMod.sha256(nextText);

        const removalRecord = {
          installedGroups: recordedGroups,
          installedEvents: existing.value.installedEvents,
          runtimePath: existing.value.runtime && existing.value.runtime.runtimePath,
          shimPath: recordedShimPath,
          shimSha256: existing.value.runtime && existing.value.runtime.shimSha256,
          reporterPath: existing.value.runtime && existing.value.runtime.reporterPath,
          preTransactionSha256: before.sha256,
          attemptedOutputSha256: attemptedSha,
        };

        const pending = putDescriptor(TXN.REMOVE_PENDING, removalRecord);
        if (!pending.ok) return pending;

        const wrote = casReplace(settingsPath, before.sha256, nextText);
        if (!wrote.ok) {
          // FINDING 5, removal side. Same three worlds as install.
          if (wrote.reason === TXN_REFUSAL.WRITE_FAILED
            && wrote.disposition === WRITE_DISPOSITION.LANDED) {
            log('[pane-status] settings replacement landed but the write reported a failure; verifying in place');
          } else if (wrote.reason === TXN_REFUSAL.WRITE_FAILED
            && wrote.disposition === WRITE_DISPOSITION.INDETERMINATE) {
            putDescriptor(TXN.RECONCILIATION_REQUIRED, removalRecord);
            log('[pane-status] settings state after a failed removal write is INDETERMINATE; stopping');
            return {
              ok: false, reason: TXN_REFUSAL.WRITE_INDETERMINATE, detail: wrote.phase,
              reconciliationRequired: true,
            };
          } else {
            // Proven untouched: the installation is exactly as it was.
            putDescriptor(TXN.INSTALLED, removalRecord);
            return wrote;
          }
        }
        putDescriptor(TXN.REMOVE_WRITTEN, removalRecord);

        const verified = verifyWrite(settingsPath, attemptedSha, {
          mode: 'removed', groups: recordedGroups, installId, otherInstallsBefore,
        });
        if (!verified.ok) {
          const rolled = rollback(settingsPath, attemptedSha, before.text);
          if (!rolled.ok) {
            putDescriptor(TXN.RECONCILIATION_REQUIRED, removalRecord);
            return { ok: false, reason: TXN_REFUSAL.ROLLBACK_BLOCKED, reconciliationRequired: true };
          }
          putDescriptor(TXN.INSTALLED, removalRecord);
          return verified;
        }

        const marked = putDescriptor(TXN.REMOVE_VERIFIED, removalRecord);
        if (!marked.ok) return marked;

        // Descriptor and shim go last, and their results decide the reported outcome.
        const cleaned = finishRemovalCleanup(recordedShimPath);
        if (!cleaned.ok) return cleaned;

        log('[pane-status] removal complete: owned groups removed, unrelated settings preserved');
        return { ok: true, settingsSha256: verified.sha256 };
      } finally {
        lock.release(held);
      }
    });
  }

  return {
    shimPath: () => shimPath,
    ownerMarker: () => ownerMarker,
    install,
    remove,
    readSettings: () => readSettings(settingsPath),
    writeShim: (runtimePath, reporterPath) => writeShim(shimPath, runtimePath, reporterPath),
  };
}

const api = {
  TXN_REFUSAL,
  WRITE_DISPOSITION,
  classifyWriteFailure,
  otherInstallSignature,
  readSettings,
  writeShim,
  casReplace,
  verifyWrite,
  rollback,
  createSettingsTransaction,
};
if (typeof module === 'object' && module.exports) module.exports = api;
