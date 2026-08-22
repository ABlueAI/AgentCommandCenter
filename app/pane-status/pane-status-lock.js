'use strict';
// Blue Helm production pane status — mutual exclusion over the shared settings file.
//
// Procurement record: docs/OSS-PROCUREMENT-pane-status.md
// Blue's verdict, verbatim: BLUE SUBSYSTEM VERDICT: BUILD FRESH
//
// THREE LAYERS, because there are three different races:
//   1. an IN-PROCESS promise-chain mutex — two clicks in one app instance;
//   2. an EXCLUSIVE LOCK FILE in the real Claude settings directory — two Blue Helm installations, or
//      two app instances, on one machine;
//   3. CONTENT-HASH CAS at write time (pane-status-settings-txn.js) — anything that never took the
//      lock at all, including Claude Code itself and a human with an editor.
// Layer 3 is what makes the design honest: the lock is cooperative, and a cooperative lock cannot bind
// a party that never agreed to it. CAS is the layer that actually protects the bytes.
//
// AGE IS NOT EVIDENCE. A lock is NEVER broken because it looks old. A long transaction and a dead
// process are indistinguishable by timestamp, and guessing wrong means two writers in the same file.
// The only way past a lock this process did not create is the explicit, human-confirmed
// clearStaleLock path below, which proves the owner is gone before it deletes anything.

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const LOCK_BASENAME = '.pane-status.lock';
const LOCK_SCHEMA_VERSION = 1;

const LOCK_REFUSAL = Object.freeze({
  HELD: 'lock-held-by-another-process',
  UNREADABLE: 'lock-unreadable',
  MALFORMED: 'lock-malformed',
  NOT_OURS: 'lock-not-app-owned',
  OWNER_ALIVE: 'lock-owner-still-alive',
  LIVENESS_UNKNOWN: 'lock-owner-liveness-unknown',
  CHANGED: 'lock-changed-under-us',
  MISSING: 'lock-missing',
  CREATE_FAILED: 'lock-create-failed',
});

function lockPath(settingsDir) { return path.join(settingsDir, LOCK_BASENAME); }

/**
 * This process's start time, in ms epoch, WITHOUT spawning anything. process.uptime() is seconds of
 * wall clock since start, so now - uptime is the start instant. It is stable to within a millisecond
 * or two across calls, so comparisons allow a small tolerance.
 */
function ownStartTimeMs() { return Math.round(Date.now() - (process.uptime() * 1000)); }

// Two independently derived start times for the same process can differ by a few ms. A window this
// small cannot collide with a genuinely different process: Windows does not recycle a PID and land
// within milliseconds of the original start instant.
const START_TIME_TOLERANCE_MS = 2000;

function buildLockBody(input) {
  const i = input || {};
  return {
    schemaVersion: LOCK_SCHEMA_VERSION,
    installId: i.installId,
    pid: i.pid,
    processStartTimeMs: i.processStartTimeMs,
    createdAtMs: i.createdAtMs,
  };
}

function serialize(body) { return JSON.stringify(body, null, 2) + '\n'; }

function parse(text) {
  let v;
  try { v = JSON.parse(text); } catch { return { ok: false, reason: LOCK_REFUSAL.MALFORMED }; }
  if (!v || typeof v !== 'object' || Array.isArray(v)) return { ok: false, reason: LOCK_REFUSAL.MALFORMED };
  if (v.schemaVersion !== LOCK_SCHEMA_VERSION) return { ok: false, reason: LOCK_REFUSAL.MALFORMED };
  if (typeof v.installId !== 'string' || typeof v.pid !== 'number'
    || typeof v.processStartTimeMs !== 'number' || typeof v.createdAtMs !== 'number') {
    return { ok: false, reason: LOCK_REFUSAL.MALFORMED };
  }
  return { ok: true, value: v };
}

/**
 * deps:
 *   installId    -> this installation's nonsecret id
 *   settingsDir  -> the REAL Claude settings directory (tests inject a temp dir)
 *   now()        -> injected clock
 *   log(line)    -> bounded logger
 *   resolveProcessStartTime(pid) -> { ok, startTimeMs } | Promise.  INJECTED, and reachable ONLY from
 *                   confirmClearStaleLock(). This is the second and last permitted child-process
 *                   dependency in the subsystem (§ 15B).
 */
function createPaneStatusLock(deps) {
  const d = deps || {};
  const installId = d.installId;
  const settingsDir = d.settingsDir;
  const now = typeof d.now === 'function' ? d.now : () => Date.now();
  const log = typeof d.log === 'function' ? d.log : () => {};
  const resolveProcessStartTime = typeof d.resolveProcessStartTime === 'function' ? d.resolveProcessStartTime : null;
  if (typeof installId !== 'string' || !installId) throw new Error('pane-status-lock: installId is required');
  if (typeof settingsDir !== 'string' || !settingsDir) throw new Error('pane-status-lock: settingsDir is required');

  const target = lockPath(settingsDir);

  // Layer 1. Every critical section is appended to this chain, so two callers in one process are
  // serialized even when both are async.
  let chain = Promise.resolve();

  function withMutex(fn) {
    const run = chain.then(fn, fn);
    // Keep the chain alive regardless of outcome; a rejected critical section must not wedge the lock.
    chain = run.then(() => undefined, () => undefined);
    return run;
  }

  /**
   * Layer 2. Exclusive create ('wx') is the atomic primitive: it either creates the file or fails with
   * EEXIST, with no window in between.
   *
   * Returns { ok:true, createdByUs:true, body } or { ok:false, reason }.
   */
  function acquire() {
    const body = buildLockBody({
      installId,
      pid: process.pid,
      processStartTimeMs: ownStartTimeMs(),
      createdAtMs: now(),
    });
    const text = serialize(body);
    try { fs.mkdirSync(settingsDir, { recursive: true }); } catch { /* already there */ }
    let fd = null;
    try {
      fd = fs.openSync(target, 'wx');
      fs.writeSync(fd, text, 0, 'utf8');
      fs.fsyncSync(fd);
    } catch (e) {
      if (fd !== null) { try { fs.closeSync(fd); } catch { /* ignore */ } }
      if (e && e.code === 'EEXIST') {
        log('[pane-status] settings lock is held; refusing to proceed');
        return { ok: false, reason: LOCK_REFUSAL.HELD };
      }
      return { ok: false, reason: LOCK_REFUSAL.CREATE_FAILED };
    }
    try { fs.closeSync(fd); } catch { /* already closed */ }
    return { ok: true, createdByUs: true, body, bytes: text };
  }

  /**
   * Release. A `finally` block may remove ONLY a lock this transaction created AND whose bytes are
   * still exactly what we wrote. If somebody replaced it, it is not ours to delete, and deleting it
   * would hand the file to a third writer mid-transaction.
   */
  function release(handle) {
    if (!handle || handle.createdByUs !== true) return { ok: false, reason: LOCK_REFUSAL.NOT_OURS };
    let current;
    try { current = fs.readFileSync(target, 'utf8'); }
    catch (e) {
      if (e && e.code === 'ENOENT') return { ok: true, alreadyGone: true };
      return { ok: false, reason: LOCK_REFUSAL.UNREADABLE };
    }
    if (current !== handle.bytes) {
      log('[pane-status] settings lock changed under us; leaving it in place');
      return { ok: false, reason: LOCK_REFUSAL.CHANGED };
    }
    try { fs.unlinkSync(target); } catch { return { ok: false, reason: LOCK_REFUSAL.UNREADABLE }; }
    return { ok: true };
  }

  /** Read the current lock without touching it. */
  function inspect() {
    let text;
    try { text = fs.readFileSync(target, 'utf8'); }
    catch (e) {
      if (e && e.code === 'ENOENT') return { ok: false, reason: LOCK_REFUSAL.MISSING };
      return { ok: false, reason: LOCK_REFUSAL.UNREADABLE };
    }
    const parsed = parse(text);
    if (!parsed.ok) return { ok: false, reason: parsed.reason, bytes: text };
    return { ok: true, value: parsed.value, bytes: text };
  }

  /**
   * The clearStaleLock path (§ 13). Every precondition is a REFUSAL, not a warning:
   *
   *   * the lock must exist, parse, and carry OUR installId — we never delete another installation's
   *     lock, however dead it looks;
   *   * the owning PID must be proven GONE. Liveness comes from a PID **plus process start time**
   *     match, because a recycled PID belonging to an unrelated process is otherwise
   *     indistinguishable from the original owner;
   *   * if liveness cannot be determined, we REFUSE. Unknown is not permission;
   *   * the bytes are re-read immediately before unlink and must be byte-identical to what we
   *     inspected, so a lock that was replaced between the check and the delete survives.
   *
   * The caller must already have obtained native main-process confirmation and passed the trusted
   * sender gate; this function does not and cannot check that, which is why it is not exported to the
   * renderer directly.
   */
  async function confirmClearStaleLock() {
    const seen = inspect();
    if (!seen.ok) return { ok: false, reason: seen.reason };

    if (seen.value.installId !== installId) {
      log('[pane-status] refusing to clear a lock owned by another installation');
      return { ok: false, reason: LOCK_REFUSAL.NOT_OURS };
    }

    if (!resolveProcessStartTime) return { ok: false, reason: LOCK_REFUSAL.LIVENESS_UNKNOWN };

    let liveness;
    try { liveness = await resolveProcessStartTime(seen.value.pid); }
    catch { liveness = null; }

    if (!liveness || liveness.ok !== true) {
      // Includes "the resolver failed" as well as "we could not tell". Conservative by construction.
      log('[pane-status] refusing to clear lock: owner liveness could not be determined');
      return { ok: false, reason: LOCK_REFUSAL.LIVENESS_UNKNOWN };
    }

    if (liveness.running === true) {
      // A running PID with NO usable start time tells us nothing: it could be the original owner or an
      // unrelated process that inherited the number. Conservative refusal — unknown is not permission.
      if (typeof liveness.startTimeMs !== 'number') {
        log('[pane-status] refusing to clear lock: owner PID is live but its start time is unknown');
        return { ok: false, reason: LOCK_REFUSAL.LIVENESS_UNKNOWN };
      }
      const same = Math.abs(liveness.startTimeMs - seen.value.processStartTimeMs) <= START_TIME_TOLERANCE_MS;
      if (same) {
        // The original owner is genuinely still running.
        log('[pane-status] refusing to clear lock: owning process is still alive');
        return { ok: false, reason: LOCK_REFUSAL.OWNER_ALIVE };
      }
      // PID exists but started at a different time: it is a DIFFERENT process that inherited the PID.
      // The original owner is therefore gone, and the lock is genuinely stale.
    }

    // Re-read immediately before deleting. Anything that changed in the meantime wins.
    let current;
    try { current = fs.readFileSync(target, 'utf8'); }
    catch (e) {
      if (e && e.code === 'ENOENT') return { ok: true, alreadyGone: true };
      return { ok: false, reason: LOCK_REFUSAL.UNREADABLE };
    }
    if (current !== seen.bytes) return { ok: false, reason: LOCK_REFUSAL.CHANGED };

    try { fs.unlinkSync(target); } catch { return { ok: false, reason: LOCK_REFUSAL.UNREADABLE }; }
    log('[pane-status] stale settings lock cleared after confirmed owner death');
    return { ok: true };
  }

  return {
    lockPath: () => target,
    withMutex,
    acquire,
    release,
    inspect,
    confirmClearStaleLock,
  };
}

const api = {
  LOCK_BASENAME,
  LOCK_SCHEMA_VERSION,
  LOCK_REFUSAL,
  START_TIME_TOLERANCE_MS,
  lockPath,
  ownStartTimeMs,
  buildLockBody,
  serialize,
  parse,
  createPaneStatusLock,
};
if (typeof module === 'object' && module.exports) module.exports = api;
