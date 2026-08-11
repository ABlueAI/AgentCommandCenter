'use strict';
// EXPERIMENT A — PROTOTYPE ONLY. Temporary, explicit, reversible Claude user-settings change.
//
// Procurement record: docs/OSS-PROCUREMENT-pane-status.md
// Blue's verdict, verbatim: BLUE SUBSYSTEM VERDICT: PROTOTYPE
//
// THE APPLICATION NEVER CALLS THIS. It is a builder-operated tool for the runtime experiment only, and
// it is deliberately NOT wired into main.js, preload.js, or any IPC handler. Blue Helm does not gain,
// and must not gain, standing authority to edit Claude's configuration. Grep the diff: the only
// callers are this module's test and the experiment runner script.
//
// What it guarantees, in order:
//   1. Identity of the original file is captured (existence, byte length, sha256) BEFORE any write.
//   2. A byte-for-byte recovery copy exists before the first mutation.
//   3. The patch ADDS hook entries and preserves every existing key and every existing hook.
//   4. A malformed settings file is REFUSED, never overwritten.
//   5. Restore puts back the exact original bytes — or the original ABSENCE — and proves it by hash.
//   6. The recovery copy is deleted only after restoration is proven.
//
// Contents are never returned, logged, or summarized. The only thing this module will tell you about
// the file is its length and hash, plus a STRUCTURAL description of what the patch changed.

const HOOK_EVENTS = Object.freeze([
  'SessionStart',
  'UserPromptSubmit',
  'Notification',
  'Stop',
  'StopFailure',
  'SessionEnd',
]);

// Marker embedded in the installed command so an orphaned entry from a crashed experiment is
// identifiable and removable without guessing.
const MARKER = 'blue-helm-pane-status-prototype';

function sha256Of(buf, cryptoModule) {
  return cryptoModule.createHash('sha256').update(buf).digest('hex');
}

/**
 * Build the hook block this experiment installs. `nodeExe` and `reporterPath` are absolute paths
 * supplied by the caller; nothing user-controlled is interpolated.
 *
 * NOTE the token is NOT here and can never be: the reporter reads it from its inherited environment.
 * A token in settings.json would be a secret written to disk in a file we do not own — precisely the
 * failure mode `AGENTS.md` bans `setx` for.
 */
function buildHookBlock(nodeExe, reporterPath, timeoutSeconds) {
  const timeout = typeof timeoutSeconds === 'number' ? timeoutSeconds : 5;
  const entry = {
    type: 'command',
    command: nodeExe,
    args: [reporterPath],
    timeout,
    statusMessage: MARKER,
  };
  const block = {};
  for (const ev of HOOK_EVENTS) block[ev] = [{ hooks: [entry] }];
  return block;
}

/** True when this hook group was installed by us (used for idempotent removal). */
function isOurGroup(group) {
  if (!group || typeof group !== 'object' || !Array.isArray(group.hooks)) return false;
  return group.hooks.some((h) => h && typeof h === 'object' && h.statusMessage === MARKER);
}

/**
 * PURE patch. Takes the parsed original settings object and returns a NEW object with our hook groups
 * appended. Every pre-existing key is preserved, and every pre-existing hook group for the same event
 * is preserved and kept FIRST — we append, we never replace.
 */
function applyPatch(original, hookBlock) {
  const base = (original && typeof original === 'object' && !Array.isArray(original)) ? original : {};
  const next = { ...base };
  const existingHooks = (base.hooks && typeof base.hooks === 'object' && !Array.isArray(base.hooks)) ? base.hooks : {};
  const nextHooks = { ...existingHooks };
  for (const ev of Object.keys(hookBlock)) {
    const prior = Array.isArray(nextHooks[ev]) ? nextHooks[ev].slice() : [];
    nextHooks[ev] = prior.concat(hookBlock[ev]);
  }
  next.hooks = nextHooks;
  return next;
}

/** PURE removal: strip only groups carrying our marker, leaving everything else byte-equivalent. */
function removePatch(patched) {
  const base = (patched && typeof patched === 'object' && !Array.isArray(patched)) ? patched : {};
  const next = { ...base };
  if (!base.hooks || typeof base.hooks !== 'object' || Array.isArray(base.hooks)) return next;
  const nextHooks = {};
  for (const ev of Object.keys(base.hooks)) {
    const groups = Array.isArray(base.hooks[ev]) ? base.hooks[ev].filter((g) => !isOurGroup(g)) : base.hooks[ev];
    if (Array.isArray(groups) && groups.length === 0) continue; // drop the key we created
    nextHooks[ev] = groups;
  }
  if (Object.keys(nextHooks).length === 0) delete next.hooks; else next.hooks = nextHooks;
  return next;
}

/**
 * STRUCTURAL description of the change — safe to show Blue. Reports event names and counts only.
 * It never reveals an unrelated setting's key value, and never the file's contents.
 */
function describeChange(originalObj, patchedObj) {
  const beforeHooks = (originalObj && originalObj.hooks) || {};
  const afterHooks = (patchedObj && patchedObj.hooks) || {};
  const rows = [];
  for (const ev of HOOK_EVENTS) {
    const before = Array.isArray(beforeHooks[ev]) ? beforeHooks[ev].length : 0;
    const after = Array.isArray(afterHooks[ev]) ? afterHooks[ev].length : 0;
    rows.push({ event: ev, groupsBefore: before, groupsAfter: after, added: after - before });
  }
  const topLevelBefore = originalObj ? Object.keys(originalObj).sort() : [];
  const topLevelAfter = patchedObj ? Object.keys(patchedObj).sort() : [];
  return {
    topLevelKeysBefore: topLevelBefore,
    topLevelKeysAfter: topLevelAfter,
    topLevelKeysAdded: topLevelAfter.filter((k) => topLevelBefore.indexOf(k) === -1),
    topLevelKeysRemoved: topLevelBefore.filter((k) => topLevelAfter.indexOf(k) === -1),
    perEvent: rows,
  };
}

/**
 * deps: fs (readFileSync/writeFileSync/existsSync/copyFileSync/unlinkSync), crypto, log(line).
 * Returns an installer object. Nothing is written until install() is called.
 */
function createSettingsGuard(deps) {
  const d = deps || {};
  const fs = d.fs;
  const cryptoModule = d.crypto;
  const settingsPath = d.settingsPath;
  const backupPath = d.backupPath;
  const log = typeof d.log === 'function' ? d.log : () => {};
  if (!fs || !cryptoModule || !settingsPath || !backupPath) {
    throw new Error('pane-status-settings: fs, crypto, settingsPath and backupPath are required');
  }

  let original = null; // { existed, bytes, sha256 }
  let installed = false;

  /** Capture identity WITHOUT exposing contents. Safe to call before anything else. */
  function captureIdentity() {
    const existed = fs.existsSync(settingsPath);
    if (!existed) { original = { existed: false, bytes: 0, sha256: null }; return original; }
    const buf = fs.readFileSync(settingsPath);
    original = { existed: true, bytes: buf.length, sha256: sha256Of(buf, cryptoModule) };
    return original;
  }

  /**
   * Install the temporary hook entries. Refuses — WITHOUT WRITING — if the existing file is not valid
   * JSON, because overwriting a file we could not parse would destroy settings we never understood.
   */
  function install(nodeExe, reporterPath, timeoutSeconds) {
    if (installed) return { ok: false, reason: 'already-installed' };
    if (!original) captureIdentity();

    let originalObj = {};
    let originalBuf = null;
    if (original.existed) {
      originalBuf = fs.readFileSync(settingsPath);
      try {
        const parsed = JSON.parse(originalBuf.toString('utf8'));
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          return { ok: false, reason: 'settings-not-an-object' };
        }
        originalObj = parsed;
      } catch {
        // The whole point: refuse and leave the file untouched.
        return { ok: false, reason: 'settings-malformed-json' };
      }
    }

    // Recovery copy BEFORE the first mutation. Byte-for-byte, via the filesystem, not a re-serialize.
    if (original.existed) {
      fs.copyFileSync(settingsPath, backupPath);
      const backupBuf = fs.readFileSync(backupPath);
      if (sha256Of(backupBuf, cryptoModule) !== original.sha256) {
        return { ok: false, reason: 'backup-verify-failed' };
      }
    } else {
      // Record the ABSENCE as the thing to restore. A sentinel file so the runner can tell "no backup
      // needed" apart from "backup step never ran".
      fs.writeFileSync(backupPath, '', 'utf8');
    }

    const hookBlock = buildHookBlock(nodeExe, reporterPath, timeoutSeconds);
    const patchedObj = applyPatch(originalObj, hookBlock);
    fs.writeFileSync(settingsPath, JSON.stringify(patchedObj, null, 2) + '\n', 'utf8');
    installed = true;
    log('[pane-status] TEMPORARY Claude hook entries installed (structural summary only; contents never logged)');
    return { ok: true, change: describeChange(original.existed ? originalObj : {}, patchedObj), original };
  }

  /**
   * Restore the original bytes, or the original absence, and PROVE it. Safe to call repeatedly and
   * safe to call when install() never ran or failed — that is what makes it usable from a finally.
   */
  function restore() {
    if (!original) return { ok: false, reason: 'no-identity-captured' };
    if (original.existed) {
      if (!fs.existsSync(backupPath)) return { ok: false, reason: 'backup-missing' };
      const backupBuf = fs.readFileSync(backupPath);
      if (sha256Of(backupBuf, cryptoModule) !== original.sha256) {
        return { ok: false, reason: 'backup-corrupt-refusing-restore' };
      }
      fs.writeFileSync(settingsPath, backupBuf);
      const afterBuf = fs.readFileSync(settingsPath);
      const afterSha = sha256Of(afterBuf, cryptoModule);
      if (afterSha !== original.sha256 || afterBuf.length !== original.bytes) {
        return { ok: false, reason: 'restore-verify-failed', afterSha, afterBytes: afterBuf.length };
      }
      installed = false;
      return { ok: true, restored: 'bytes', bytes: afterBuf.length, sha256: afterSha };
    }
    // Original did not exist: restoring means removing what we created.
    if (fs.existsSync(settingsPath)) fs.unlinkSync(settingsPath);
    if (fs.existsSync(settingsPath)) return { ok: false, reason: 'restore-absence-failed' };
    installed = false;
    return { ok: true, restored: 'absence' };
  }

  /** Delete the recovery copy. Refuses unless restoration has been proven first. */
  function discardBackup(restoreResult) {
    if (!restoreResult || restoreResult.ok !== true) return { ok: false, reason: 'restore-not-proven' };
    if (fs.existsSync(backupPath)) fs.unlinkSync(backupPath);
    return { ok: !fs.existsSync(backupPath) };
  }

  return { captureIdentity, install, restore, discardBackup, isInstalled: () => installed };
}

const api = {
  HOOK_EVENTS,
  MARKER,
  buildHookBlock,
  applyPatch,
  removePatch,
  isOurGroup,
  describeChange,
  createSettingsGuard,
};
if (typeof module === 'object' && module.exports) module.exports = api;
