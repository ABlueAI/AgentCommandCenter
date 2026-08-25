'use strict';
// Run: node app/pane-status/pane-status-write-failure.test.js
//
// WHAT A FAILED WRITE ACTUALLY MEANS — advisory-review findings 5, 11 and 12.
//
// Three different "it failed" paths, each of which the previous build collapsed into a cheerful lie:
//
//   5.  A generic WRITE_FAILED was treated as "nothing was written", and the descriptor was set to
//       IDLE. But the read-back that raises EREADBACK happens AFTER renameSync, so the replacement
//       may already have landed. IDLE plus eight live hook groups is precisely the state the
//       two-resource protocol exists to make impossible.
//   11. `fs.openSync(target,'wx')` succeeding and the following write or fsync failing left an empty
//       lock file on disk forever. Every later acquire got EEXIST; clearStaleLock could not rescue it
//       because the stub does not parse. An ordinary caught I/O error manufactured the crash state
//       manual recovery exists for.
//   12. `descriptorMod.remove()` and `fs.unlinkSync(shim)` had their results discarded, and removal
//       reported success regardless — leaving an orphan reporter, or a descriptor claiming an
//       installation that no longer exists.
//
// Every path here is a temp fixture. Nothing in this file resolves a real home directory.

const fs = require('fs');
const os = require('os');
const path = require('path');

const doc = require('./pane-status-settings-doc');
const txnMod = require('./pane-status-settings-txn');
const lockMod = require('./pane-status-lock');
const descriptorMod = require('./pane-status-descriptor');
const recoveryMod = require('./pane-status-recovery');
const shimMod = require('./pane-status-runtime-shim');

let passed = 0, failed = 0;
function assert(cond, label) {
  if (cond) { process.stdout.write(`  ✓ ${label}\n`); passed++; }
  else { process.stderr.write(`  ✗ FAIL: ${label}\n`); failed++; }
}
function show(v) {
  const s = JSON.stringify(v);
  if (typeof s !== 'string') return String(v);
  return s.length > 160 ? s.slice(0, 160) + `…(${s.length} chars)` : s;
}
function eq(a, b, label) { assert(a === b, a === b ? label : `${label} (got ${show(a)})`); }

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bh-writefail-'));
const OURS = 'c'.repeat(32);
const CMD_EXE = shimMod.resolveCmdExe(process.env);
const REPORTER = path.join(__dirname, 'pane-status-reporter.js');

let seq = 0;
function makeRig(seed) {
  const dir = path.join(root, 'w' + (seq++));
  const userData = path.join(dir, 'userData');
  const settingsDir = path.join(dir, 'claude');
  const settingsPath = path.join(settingsDir, 'settings.json');
  fs.mkdirSync(userData, { recursive: true });
  fs.mkdirSync(settingsDir, { recursive: true });
  fs.writeFileSync(settingsPath, doc.serialize(seed || {}));
  const lock = lockMod.createPaneStatusLock({ installId: OURS, settingsDir, now: () => 7, log: () => {} });
  const txn = txnMod.createSettingsTransaction({
    userDataPath: userData, settingsPath, installId: OURS, lock, cmdExe: CMD_EXE, log: () => {}, now: () => 7,
  });
  return { dir, userData, settingsDir, settingsPath, lock, txn, shimPath: txn.shimPath() };
}
const install = (r) => r.txn.install({ runtimePath: process.execPath, reporterPath: REPORTER });
const descriptorState = (userData) => {
  const d = descriptorMod.read(userData);
  return d.ok ? d.value.transactionState : ('unreadable:' + d.reason);
};

/** Swap in a failing atomicWriteFileSync for exactly one call, then restore. */
function withAtomicWrite(fake, fn) {
  const real = descriptorMod.atomicWriteFileSync;
  let armed = true;
  descriptorMod.atomicWriteFileSync = function patched(target, contents) {
    // Descriptor writes must keep working — only the SETTINGS write is sabotaged.
    if (armed && path.basename(target) === 'settings.json') { armed = false; return fake(real, target, contents); }
    return real(target, contents);
  };
  return Promise.resolve(fn()).finally(() => { descriptorMod.atomicWriteFileSync = real; });
}

function boom(code, phase, renamed) {
  const e = new Error('injected ' + code);
  e.code = code;
  e.paneStatusWritePhase = phase;
  e.paneStatusRenamed = !!renamed;
  return e;
}

(async () => {
  // -----------------------------------------------------------------------------------------------
  process.stdout.write('\nthe atomic writer LABELS the phase it reached, and cleans up only what is safe\n');
  // -----------------------------------------------------------------------------------------------
  {
    const dir = path.join(root, 'phases');
    fs.mkdirSync(dir, { recursive: true });
    const target = path.join(dir, 'x.json');

    // A successful write leaves no temp file behind.
    descriptorMod.atomicWriteFileSync(target, 'hello');
    eq(fs.readFileSync(target, 'utf8'), 'hello', 'a normal write lands');
    eq(fs.readdirSync(dir).filter((f) => f.endsWith('.tmp')).length, 0, 'and leaves no temp file');

    // A pre-rename failure: the target is untouched and the temp file is removed.
    const realWrite = fs.writeFileSync;
    fs.writeFileSync = () => { throw boom('EACCES'); };
    let caught = null;
    try { descriptorMod.atomicWriteFileSync(target, 'nope'); } catch (e) { caught = e; }
    fs.writeFileSync = realWrite;
    eq(caught && caught.paneStatusWritePhase, descriptorMod.WRITE_PHASE.PRE_RENAME, 'a pre-rename failure is labelled pre-rename');
    eq(caught && caught.paneStatusRenamed, false, 'and reports that nothing was renamed');
    eq(fs.readFileSync(target, 'utf8'), 'hello', 'the target is untouched');
    eq(fs.readdirSync(dir).filter((f) => f.endsWith('.tmp')).length, 0, 'and the temp file was cleaned up');

    // A rename failure: same story, still nothing renamed.
    const realRename = fs.renameSync;
    fs.renameSync = () => { throw boom('EPERM'); };
    caught = null;
    try { descriptorMod.atomicWriteFileSync(target, 'nope2'); } catch (e) { caught = e; }
    fs.renameSync = realRename;
    eq(caught && caught.paneStatusWritePhase, descriptorMod.WRITE_PHASE.RENAME, 'a rename failure is labelled rename');
    eq(caught && caught.paneStatusRenamed, false, 'and reports that nothing was renamed');
    eq(fs.readFileSync(target, 'utf8'), 'hello', 'the target is still untouched');
    eq(fs.readdirSync(dir).filter((f) => f.endsWith('.tmp')).length, 0, 'the temp file was cleaned up');

    // A POST-rename failure: the bytes ARE there, and they must NOT be deleted by cleanup.
    const realRead = fs.readFileSync;
    fs.readFileSync = function patched(p, enc) {
      if (p === target) throw boom('EIO');
      return realRead.call(fs, p, enc);
    };
    caught = null;
    try { descriptorMod.atomicWriteFileSync(target, 'landed'); } catch (e) { caught = e; }
    fs.readFileSync = realRead;
    eq(caught && caught.paneStatusWritePhase, descriptorMod.WRITE_PHASE.POST_RENAME, 'a read-back failure is labelled post-rename');
    eq(caught && caught.paneStatusRenamed, true, 'and reports that the rename DID happen');
    eq(fs.readFileSync(target, 'utf8'), 'landed',
      'the replacement survives — cleanup never unlinks a name that is already the target');
  }

  // -----------------------------------------------------------------------------------------------
  process.stdout.write('\nclassifyWriteFailure names the world we are actually in\n');
  // -----------------------------------------------------------------------------------------------
  {
    const dir = path.join(root, 'classify');
    fs.mkdirSync(dir, { recursive: true });
    const p = path.join(dir, 's.json');
    const pre = descriptorMod.sha256('BEFORE');
    const att = descriptorMod.sha256('AFTER');

    fs.writeFileSync(p, 'BEFORE');
    eq(txnMod.classifyWriteFailure(p, pre, att).disposition, txnMod.WRITE_DISPOSITION.NOT_LANDED,
      'unchanged bytes -> the write never landed');
    fs.writeFileSync(p, 'AFTER');
    eq(txnMod.classifyWriteFailure(p, pre, att).disposition, txnMod.WRITE_DISPOSITION.LANDED,
      'the attempted bytes -> the write DID land');
    fs.writeFileSync(p, 'SOMETHING ELSE');
    eq(txnMod.classifyWriteFailure(p, pre, att).disposition, txnMod.WRITE_DISPOSITION.INDETERMINATE,
      'third-party bytes -> indeterminate, and we must not overwrite them');
    eq(txnMod.classifyWriteFailure(dir, pre, att).disposition, txnMod.WRITE_DISPOSITION.INDETERMINATE,
      'an unreadable path -> indeterminate, never an assumption');
  }

  // -----------------------------------------------------------------------------------------------
  process.stdout.write('\nfailure BEFORE the replacement: descriptor returns to IDLE, settings untouched\n');
  // -----------------------------------------------------------------------------------------------
  for (const [label, phase] of [['pre-rename', descriptorMod.WRITE_PHASE.PRE_RENAME], ['during rename', descriptorMod.WRITE_PHASE.RENAME]]) {
    const r = makeRig({ keep: 1 });
    const before = fs.readFileSync(r.settingsPath, 'utf8');
    const res = await withAtomicWrite(() => { throw boom('EACCES', phase, false); }, () => install(r));
    assert(res.ok === false, `${label}: install fails`);
    eq(res.disposition, txnMod.WRITE_DISPOSITION.NOT_LANDED, `${label}: classified as never landed`);
    eq(fs.readFileSync(r.settingsPath, 'utf8'), before, `${label}: settings are byte-identical`);
    eq(descriptorState(r.userData), descriptorMod.TXN.IDLE, `${label}: and IDLE is the honest descriptor state`);
  }

  // -----------------------------------------------------------------------------------------------
  process.stdout.write('\nread-back THROWS after a successful rename: hooks cannot coexist with IDLE\n');
  // -----------------------------------------------------------------------------------------------
  {
    const r = makeRig({});
    // The replacement really lands, and only then does the write report failure.
    const res = await withAtomicWrite((real, target, contents) => {
      fs.writeFileSync(target, contents);
      throw boom('EREADBACK', descriptorMod.WRITE_PHASE.POST_RENAME, true);
    }, () => install(r));

    const after = JSON.parse(fs.readFileSync(r.settingsPath, 'utf8'));
    const live = doc.groupsWithInstallId(after, OURS).length;
    eq(live, 8, 'the eight hook groups ARE live in the settings file');
    const state = descriptorState(r.userData);
    assert(state !== descriptorMod.TXN.IDLE,
      `hooks are installed, so the descriptor is NOT IDLE (it is ${state}) — the whole of finding 5`);
    assert(res.ok === true || res.reconciliationRequired === true || state === descriptorMod.TXN.INSTALLED,
      'and the transaction either completed its verification or escalated, never silently gave up');
  }

  // -----------------------------------------------------------------------------------------------
  process.stdout.write('\nread-back MISMATCH and a third-party write after rename: RECONCILIATION_REQUIRED\n');
  // -----------------------------------------------------------------------------------------------
  for (const [label, bytes] of [['read-back mismatch', '{"corrupted":true}\n'], ['third-party write', '{"someone":"else"}\n']]) {
    const r = makeRig({});
    const res = await withAtomicWrite((real, target) => {
      fs.writeFileSync(target, bytes);      // neither the pre-transaction bytes nor ours
      throw boom('EREADBACK', descriptorMod.WRITE_PHASE.POST_RENAME, true);
    }, () => install(r));
    assert(res.ok === false, `${label}: the install fails`);
    eq(res.reason, txnMod.TXN_REFUSAL.WRITE_INDETERMINATE, `${label}: as write-state-indeterminate`);
    assert(res.reconciliationRequired === true, `${label}: and demands reconciliation`);
    eq(fs.readFileSync(r.settingsPath, 'utf8'), bytes, `${label}: the third party's bytes are NOT overwritten`);
    eq(descriptorState(r.userData), descriptorMod.TXN.RECONCILIATION_REQUIRED,
      `${label}: the descriptor records reconciliation-required, never IDLE and never success`);
  }

  // -----------------------------------------------------------------------------------------------
  process.stdout.write('\nunreadable after rename: still reconciliation, never a guess\n');
  // -----------------------------------------------------------------------------------------------
  {
    const r = makeRig({ before: true });
    const res = await withAtomicWrite((real, target) => {
      fs.unlinkSync(target);                // the file is now unreadable/absent, matching neither hash
      throw boom('EIO', descriptorMod.WRITE_PHASE.POST_RENAME, true);
    }, () => install(r));
    assert(res.ok === false, 'the install fails');
    eq(res.reason, txnMod.TXN_REFUSAL.WRITE_INDETERMINATE, 'as write-state-indeterminate');
    eq(descriptorState(r.userData), descriptorMod.TXN.RECONCILIATION_REQUIRED, 'and reconciliation is required');
  }

  // -----------------------------------------------------------------------------------------------
  process.stdout.write('\nlock acquisition that half-succeeds cleans up after itself (finding 11)\n');
  // -----------------------------------------------------------------------------------------------
  {
    // write failure after the exclusive create
    {
      const r = makeRig({});
      const realWriteSync = fs.writeSync;
      fs.writeSync = () => { throw boom('ENOSPC'); };
      const held = r.lock.acquire();
      fs.writeSync = realWriteSync;
      assert(held.ok === false, 'acquire fails');
      eq(held.reason, lockMod.LOCK_REFUSAL.CREATE_FAILED, 'as an ordinary create failure');
      assert(!fs.existsSync(r.lock.lockPath()), 'and the stub lock file it created was REMOVED');
      const again = r.lock.acquire();
      assert(again.ok === true, 'so the very next acquire succeeds instead of being wedged forever');
      r.lock.release(again);
    }
    // fsync failure after a partial write
    {
      const r = makeRig({});
      const realFsync = fs.fsyncSync;
      fs.fsyncSync = () => { throw boom('EIO'); };
      const held = r.lock.acquire();
      fs.fsyncSync = realFsync;
      assert(held.ok === false, 'an fsync failure also fails the acquire');
      assert(!fs.existsSync(r.lock.lockPath()), 'and the partially written lock is cleaned up');
    }
    // a REPLACEMENT created by another process must survive
    {
      const r = makeRig({});
      const realWriteSync = fs.writeSync;
      const lockFile = r.lock.lockPath();
      fs.writeSync = () => {
        fs.writeFileSync(lockFile, '{"someone":"else"}\n');   // another process got here first
        throw boom('ENOSPC');
      };
      const held = r.lock.acquire();
      fs.writeSync = realWriteSync;
      assert(held.ok === false, 'acquire fails');
      eq(held.reason, lockMod.LOCK_REFUSAL.CLEANUP_FAILED, 'and reports that cleanup could NOT be completed');
      assert(fs.existsSync(lockFile), 'because the replacement is not ours to delete — it survives');
      eq(fs.readFileSync(lockFile, 'utf8'), '{"someone":"else"}\n', 'byte-identical');
    }
    // an ordinary lock still round-trips
    {
      const r = makeRig({});
      const held = r.lock.acquire();
      assert(held.ok === true, 'a healthy acquire still works');
      assert(fs.existsSync(r.lock.lockPath()), 'the lock file exists while held');
      assert(r.lock.release(held).ok === true, 'and release removes it');
      assert(!fs.existsSync(r.lock.lockPath()), 'cleanly');
    }
  }

  // -----------------------------------------------------------------------------------------------
  process.stdout.write('\ncleanup after a verified removal is VERIFIED, not assumed (finding 12)\n');
  // -----------------------------------------------------------------------------------------------
  {
    // shim delete fails -> descriptor retained, reconciliation required, NO false success
    {
      const r = makeRig({});
      await install(r);
      const realUnlink = fs.unlinkSync;
      fs.unlinkSync = function patched(p) {
        if (p === r.shimPath) throw boom('EPERM');
        return realUnlink.call(fs, p);
      };
      const res = await r.txn.remove();
      fs.unlinkSync = realUnlink;
      assert(res.ok === false, 'removal does NOT report success');
      eq(res.reason, txnMod.TXN_REFUSAL.CLEANUP_FAILED, 'it reports a cleanup failure');
      eq(res.detail, 'shim-delete-failed', 'naming the shim');
      assert(res.reconciliationRequired === true, 'and demands reconciliation');
      eq(descriptorState(r.userData), descriptorMod.TXN.REMOVE_VERIFIED,
        'the descriptor is RETAINED at REMOVE_VERIFIED so startup can finish the job');
      eq(doc.groupsWithInstallId(JSON.parse(fs.readFileSync(r.settingsPath, 'utf8')), OURS).length, 0,
        'the settings really were cleaned — only the app-owned cleanup is outstanding');

      // ---- and startup reconciliation FINISHES it
      const recovery = recoveryMod.createRecovery({
        userDataPath: r.userData, settingsPath: r.settingsPath, installId: OURS, cmdExe: CMD_EXE,
        currentRuntimePath: process.execPath, reporterPath: REPORTER, log: () => {}, now: () => 8,
      });
      const rec = recovery.reconcile();
      eq(rec.outcome, recoveryMod.OUTCOME.REMOVED, 'startup reconciliation completes the interrupted removal');
      assert(!fs.existsSync(r.shimPath), 'the shim is gone');
      assert(!descriptorMod.read(r.userData).ok, 'and so is the descriptor');
    }

    // descriptor delete fails -> reconciliation required rather than success
    {
      const r = makeRig({});
      await install(r);
      const realRemove = descriptorMod.remove;
      descriptorMod.remove = () => ({ ok: false, reason: 'descriptor-unlink-failed' });
      const res = await r.txn.remove();
      descriptorMod.remove = realRemove;
      assert(res.ok === false, 'removal does NOT report success');
      eq(res.detail, 'descriptor-delete-failed', 'naming the descriptor');
      assert(res.reconciliationRequired === true, 'and demands reconciliation');
    }

    // startup reconciliation ALSO refuses to claim a completed removal it could not finish
    {
      const r = makeRig({});
      await install(r);
      // Reach REMOVE_VERIFIED the way production does: a removal whose settings write succeeded and
      // whose shim delete failed. The descriptor is left at REMOVE_VERIFIED with the shim still there.
      const realUnlink2 = fs.unlinkSync;
      fs.unlinkSync = function patched(p) {
        if (p === r.shimPath) throw boom('EPERM');
        return realUnlink2.call(fs, p);
      };
      await r.txn.remove();
      fs.unlinkSync = realUnlink2;
      eq(descriptorState(r.userData), descriptorMod.TXN.REMOVE_VERIFIED, 'the fixture really is at REMOVE_VERIFIED');
      const recovery = recoveryMod.createRecovery({
        userDataPath: r.userData, settingsPath: r.settingsPath, installId: OURS, cmdExe: CMD_EXE,
        currentRuntimePath: process.execPath, reporterPath: REPORTER, log: () => {}, now: () => 9,
      });
      const realRemove = descriptorMod.remove;
      descriptorMod.remove = () => ({ ok: false, reason: 'descriptor-unlink-failed' });
      const rec = recovery.reconcile();
      descriptorMod.remove = realRemove;
      eq(rec.outcome, recoveryMod.OUTCOME.RECONCILIATION_REQUIRED,
        'a cleanup it cannot complete is reconciliation-required, not a completed removal');
      eq(rec.reason, recoveryMod.RECONCILE_REASON.CLEANUP_INCOMPLETE, 'with the incomplete-cleanup reason');
    }
  }

  try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* best effort */ }
  process.stdout.write(`\npane-status-write-failure: ${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
})();
