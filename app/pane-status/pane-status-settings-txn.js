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
  return { ok: true, text, value: parsed.value, sha256: descriptorMod.sha256(text), absent: false };
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
  try { descriptorMod.atomicWriteFileSync(settingsPath, nextText); }
  catch (e) { return { ok: false, reason: TXN_REFUSAL.WRITE_FAILED, detail: (e && e.code) || 'unknown' }; }
  return { ok: true, sha256: descriptorMod.sha256(nextText) };
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
    const hooks = parsed.value.hooks || {};
    for (const ev of Object.keys(expectation.groups || {})) {
      const remaining = Array.isArray(hooks[ev]) ? hooks[ev] : [];
      const targets = new Set((expectation.groups[ev] || []).map((g) => JSON.stringify(g)));
      if (remaining.some((g) => targets.has(JSON.stringify(g)))) {
        return { ok: false, reason: TXN_REFUSAL.VERIFY_FAILED, detail: 'group-still-present-after-removal' };
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

        const wrote = casReplace(settingsPath, before.sha256, nextText);
        if (!wrote.ok) {
          // Nothing was written, so there is nothing to roll back. Return to IDLE honestly.
          putDescriptor(TXN.IDLE, {});
          return wrote;
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
   * REMOVAL. Targets the descriptor's EXACT recorded group, not what this build would install today —
   * after an upgrade those differ, and removing the wrong one would strand the real entry.
   */
  async function remove() {
    return lock.withMutex(async () => {
      const existing = descriptorMod.read(userDataPath);
      if (!existing.ok) return { ok: false, reason: TXN_REFUSAL.NO_DESCRIPTOR, detail: existing.reason };
      const recordedGroups = existing.value.installedGroups;
      if (!recordedGroups || typeof recordedGroups !== 'object') {
        return { ok: false, reason: TXN_REFUSAL.NO_DESCRIPTOR, detail: 'no-recorded-groups' };
      }

      const held = lock.acquire();
      if (!held.ok) return { ok: false, reason: TXN_REFUSAL.LOCK_HELD, detail: held.reason };

      try {
        const before = readSettings(settingsPath);
        if (!before.ok) return before;

        const nextText = doc.serialize(doc.withRemoved(before.value, recordedGroups));
        const attemptedSha = descriptorMod.sha256(nextText);

        const pending = putDescriptor(TXN.REMOVE_PENDING, Object.assign({}, {
          installedGroups: recordedGroups,
          installedEvents: existing.value.installedEvents,
          runtimePath: existing.value.runtime && existing.value.runtime.runtimePath,
          shimPath: existing.value.runtime && existing.value.runtime.shimPath,
          shimSha256: existing.value.runtime && existing.value.runtime.shimSha256,
          reporterPath: existing.value.runtime && existing.value.runtime.reporterPath,
          preTransactionSha256: before.sha256,
          attemptedOutputSha256: attemptedSha,
        }));
        if (!pending.ok) return pending;

        const wrote = casReplace(settingsPath, before.sha256, nextText);
        if (!wrote.ok) {
          putDescriptor(TXN.INSTALLED, {
            installedGroups: recordedGroups, installedEvents: existing.value.installedEvents,
            preTransactionSha256: existing.value.preTransactionSha256,
            attemptedOutputSha256: existing.value.attemptedOutputSha256,
          });
          return wrote;
        }
        putDescriptor(TXN.REMOVE_WRITTEN, {
          installedGroups: recordedGroups, installedEvents: existing.value.installedEvents,
          preTransactionSha256: before.sha256, attemptedOutputSha256: attemptedSha,
        });

        const verified = verifyWrite(settingsPath, attemptedSha, { mode: 'removed', groups: recordedGroups });
        if (!verified.ok) {
          const rolled = rollback(settingsPath, attemptedSha, before.text);
          if (!rolled.ok) {
            putDescriptor(TXN.RECONCILIATION_REQUIRED, {
              installedGroups: recordedGroups, installedEvents: existing.value.installedEvents,
              preTransactionSha256: before.sha256, attemptedOutputSha256: attemptedSha,
            });
            return { ok: false, reason: TXN_REFUSAL.ROLLBACK_BLOCKED, reconciliationRequired: true };
          }
          putDescriptor(TXN.INSTALLED, {
            installedGroups: recordedGroups, installedEvents: existing.value.installedEvents,
          });
          return verified;
        }

        putDescriptor(TXN.REMOVE_VERIFIED, {
          installedGroups: recordedGroups, installedEvents: existing.value.installedEvents,
          preTransactionSha256: before.sha256, attemptedOutputSha256: attemptedSha,
        });

        // Descriptor and shim go last. Until they do, a crash still leaves a decidable record.
        descriptorMod.remove(userDataPath);
        try { fs.unlinkSync(shimPath); } catch { /* already gone */ }
        try { fs.rmdirSync(path.dirname(shimPath)); } catch { /* not empty or already gone */ }

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
  readSettings,
  writeShim,
  casReplace,
  verifyWrite,
  rollback,
  createSettingsTransaction,
};
if (typeof module === 'object' && module.exports) module.exports = api;
