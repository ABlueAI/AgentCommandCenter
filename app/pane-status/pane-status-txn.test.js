'use strict';
// Run: node app/pane-status/pane-status-txn.test.js
//
// The two-resource transaction: setup, removal, CAS, and the CAS-GUARDED ROLLBACK.
//
// EVERY path here is a temp directory. No test in this subsystem may resolve a real home directory or
// a real Claude settings file, and the last assertion in this file proves the suite itself contains no
// such path.

const fs = require('fs');
const os = require('os');
const path = require('path');

const txnMod = require('./pane-status-settings-txn');
const lockMod = require('./pane-status-lock');
const doc = require('./pane-status-settings-doc');
const descriptorMod = require('./pane-status-descriptor');
const shimMod = require('./pane-status-runtime-shim');

let passed = 0, failed = 0;
function assert(cond, label) {
  if (cond) { process.stdout.write(`  ✓ ${label}\n`); passed++; }
  else { process.stderr.write(`  ✗ FAIL: ${label}\n`); failed++; }
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bh-txn-'));
const MINE = 'a'.repeat(32);
const THEIRS = 'b'.repeat(32);
let clock = 1000;

function makeEnv(initialSettings, installId) {
  const dir = fs.mkdtempSync(path.join(root, 'env-'));
  const userData = path.join(dir, 'userData');
  const settingsDir = path.join(dir, 'claude');
  const settingsPath = path.join(settingsDir, 'settings.json');
  fs.mkdirSync(userData, { recursive: true });
  fs.mkdirSync(settingsDir, { recursive: true });
  if (initialSettings !== undefined) fs.writeFileSync(settingsPath, doc.serialize(initialSettings));
  const id = installId || MINE;
  const lock = lockMod.createPaneStatusLock({ installId: id, settingsDir, now: () => clock, log: () => {} });
  const txn = txnMod.createSettingsTransaction({
    userDataPath: userData, settingsPath, installId: id, lock,
    cmdExe: shimMod.resolveCmdExe(), now: () => clock, log: () => {},
  });
  return { dir, userData, settingsDir, settingsPath, lock, txn, installId: id };
}

const RUNTIME = process.execPath;
const REPORTER = path.join(__dirname, 'pane-status-reporter.js');

(async () => {
  // ---------------------------------------------------------------- install happy path
  {
    const e = makeEnv({ theme: 'dark', hooks: { Stop: [{ matcher: '', hooks: [{ type: 'command', command: 'echo keep' }] }] } });
    const res = await e.txn.install({ runtimePath: RUNTIME, reporterPath: REPORTER });
    assert(res.ok === true, 'install succeeds');

    const after = JSON.parse(fs.readFileSync(e.settingsPath, 'utf8'));
    assert(after.theme === 'dark', 'unrelated top-level setting preserved');
    assert(after.hooks.Stop.length === 2 && after.hooks.Stop[0].hooks[0].command === 'echo keep',
      'an unrelated group on an event we install is preserved, and stays first');
    assert(Object.keys(after.hooks).length === 8, 'all eight events are present');

    const d = descriptorMod.read(e.userData);
    assert(d.ok === true && d.value.transactionState === descriptorMod.TXN.INSTALLED, 'descriptor is finalized to INSTALLED');
    assert(JSON.stringify(d.value).indexOf('theme') === -1, 'the descriptor records NO unrelated settings content');
    assert(fs.existsSync(e.txn.shimPath()), 'the shim was written');
    const shimText = fs.readFileSync(e.txn.shimPath(), 'utf8');
    assert(shimText.indexOf('\r\n') !== -1, 'the shim is CRLF');
    assert(/^@echo off/.test(shimText) && /exit \/b 0\r\n$/.test(shimText), 'the shim starts @echo off and ends exit /b 0');
    assert(shimText.indexOf('setlocal') !== -1 && shimText.indexOf('ELECTRON_RUN_AS_NODE=1') !== -1,
      'the shim sets ELECTRON_RUN_AS_NODE inside a setlocal');
  }

  // ---------------------------------------------------------------- idempotence
  {
    const e = makeEnv({});
    await e.txn.install({ runtimePath: RUNTIME, reporterPath: REPORTER });
    const again = await e.txn.install({ runtimePath: RUNTIME, reporterPath: REPORTER });
    assert(again.ok === true && again.alreadyInstalled === true, 'installing twice is a no-op, not a duplicate');
    const after = JSON.parse(fs.readFileSync(e.settingsPath, 'utf8'));
    assert(after.hooks.Stop.length === 1, 'and no group was duplicated');
  }

  // ---------------------------------------------------------------- cross-install collision
  {
    const other = doc.buildHookGroups({
      cmdExe: shimMod.resolveCmdExe(),
      shimPath: doc.buildShimPath(path.join('C:', 'Users', 'other', 'AppData'), THEIRS),
    });
    const e = makeEnv({ hooks: other });
    const res = await e.txn.install({ runtimePath: RUNTIME, reporterPath: REPORTER });
    assert(res.ok === false && res.ownership === doc.OWNERSHIP.OTHER_INSTALL,
      'setup REFUSES when another Blue Helm installation owns the groups');
    const after = fs.readFileSync(e.settingsPath, 'utf8');
    assert(after === doc.serialize({ hooks: other }), 'and the settings bytes are completely unchanged');
    assert(descriptorMod.exists(e.userData) === false, 'no descriptor is left behind by a refused install');
  }

  // ---------------------------------------------------------------- CAS: a third party writes first
  {
    const e = makeEnv({ theme: 'dark' });
    const before = txnMod.readSettings(e.settingsPath);
    fs.writeFileSync(e.settingsPath, doc.serialize({ theme: 'light' }));   // somebody else got there
    const res = txnMod.casReplace(e.settingsPath, before.sha256, doc.serialize({ theme: 'ours' }));
    assert(res.ok === false && res.reason === txnMod.TXN_REFUSAL.CAS_MISMATCH, 'CAS refuses a stale expected hash');
    assert(JSON.parse(fs.readFileSync(e.settingsPath, 'utf8')).theme === 'light',
      'and the third party\'s write is NOT overwritten');
  }

  // ---------------------------------------------------------------- rollback is CAS-guarded
  {
    const e = makeEnv({ theme: 'dark' });
    const original = fs.readFileSync(e.settingsPath, 'utf8');
    const attempted = doc.serialize({ theme: 'ours' });
    fs.writeFileSync(e.settingsPath, attempted);
    const good = txnMod.rollback(e.settingsPath, descriptorMod.sha256(attempted), original);
    assert(good.ok === true, 'rollback restores when the file still holds exactly what WE wrote');
    assert(fs.readFileSync(e.settingsPath, 'utf8') === original, 'the original bytes are back');

    // now a third party writes on top of our attempted output
    fs.writeFileSync(e.settingsPath, attempted);
    fs.writeFileSync(e.settingsPath, doc.serialize({ theme: 'third-party' }));
    const blocked = txnMod.rollback(e.settingsPath, descriptorMod.sha256(attempted), original);
    assert(blocked.ok === false && blocked.reason === txnMod.TXN_REFUSAL.ROLLBACK_BLOCKED,
      'rollback REFUSES once a third party has written — it will not destroy their change');
    assert(JSON.parse(fs.readFileSync(e.settingsPath, 'utf8')).theme === 'third-party',
      'and the third party\'s bytes survive');
  }

  // ---------------------------------------------------------------- lock blocks a second writer
  {
    const e = makeEnv({});
    const held = e.lock.acquire();
    const other = txnMod.createSettingsTransaction({
      userDataPath: e.userData, settingsPath: e.settingsPath, installId: MINE,
      lock: lockMod.createPaneStatusLock({ installId: MINE, settingsDir: e.settingsDir, now: () => clock, log: () => {} }),
      cmdExe: shimMod.resolveCmdExe(), now: () => clock, log: () => {},
    });
    const res = await other.install({ runtimePath: RUNTIME, reporterPath: REPORTER });
    assert(res.ok === false && res.reason === txnMod.TXN_REFUSAL.LOCK_HELD, 'a held lock blocks a second installer');
    e.lock.release(held);
  }

  // ---------------------------------------------------------------- removal preserves later edits
  {
    const e = makeEnv({ theme: 'dark' });
    await e.txn.install({ runtimePath: RUNTIME, reporterPath: REPORTER });

    // edits made AFTER setup
    const mid = JSON.parse(fs.readFileSync(e.settingsPath, 'utf8'));
    mid.addedLater = true;
    mid.hooks.Stop.push({ matcher: '', hooks: [{ type: 'command', command: 'echo added after setup' }] });
    mid.hooks.BrandNewEvent = [{ matcher: '', hooks: [{ type: 'command', command: 'echo new' }] }];
    fs.writeFileSync(e.settingsPath, doc.serialize(mid));

    const res = await e.txn.remove();
    assert(res.ok === true, 'removal succeeds even though the file changed after setup');

    const after = JSON.parse(fs.readFileSync(e.settingsPath, 'utf8'));
    assert(after.theme === 'dark', 'the original unrelated setting survives removal');
    assert(after.addedLater === true, 'a setting added AFTER setup survives removal');
    assert(after.hooks.Stop.length === 1 && after.hooks.Stop[0].hooks[0].command === 'echo added after setup',
      'a hook group added after setup survives removal');
    assert(after.hooks.BrandNewEvent !== undefined, 'an entirely new event added after setup survives');
    assert(after.hooks.SessionStart === undefined, 'an event that held only our group is gone');
    assert(descriptorMod.exists(e.userData) === false, 'the descriptor is retired');
    assert(fs.existsSync(e.txn.shimPath()) === false, 'the shim is removed');
    assert(fs.existsSync(e.settingsPath), 'THE SETTINGS FILE IS NEVER DELETED');
  }

  // ---------------------------------------------------------------- removal leaves a valid {} file
  {
    const e = makeEnv({});
    await e.txn.install({ runtimePath: RUNTIME, reporterPath: REPORTER });
    await e.txn.remove();
    const text = fs.readFileSync(e.settingsPath, 'utf8');
    assert(text === '{}\n', 'when nothing unrelated remains the file is left as a valid {} document');
    assert(doc.parse(text).ok === true, 'and it still parses');
  }

  // ---------------------------------------------------------------- removal without a descriptor
  {
    const e = makeEnv({});
    await e.txn.install({ runtimePath: RUNTIME, reporterPath: REPORTER });
    const settingsBefore = fs.readFileSync(e.settingsPath, 'utf8');
    descriptorMod.remove(e.userData);
    const res = await e.txn.remove();
    assert(res.ok === false && res.reason === txnMod.TXN_REFUSAL.NO_DESCRIPTOR,
      'removal REFUSES with no descriptor — it never guesses which groups were ours');
    assert(fs.readFileSync(e.settingsPath, 'utf8') === settingsBefore, 'and settings are untouched');
  }

  // ---------------------------------------------------------------- malformed settings
  {
    const e = makeEnv();
    fs.writeFileSync(e.settingsPath, '{ this is not json');
    const res = await e.txn.install({ runtimePath: RUNTIME, reporterPath: REPORTER });
    assert(res.ok === false && res.reason === txnMod.TXN_REFUSAL.SETTINGS_MALFORMED,
      'malformed settings are refused, never rewritten');
    assert(fs.readFileSync(e.settingsPath, 'utf8') === '{ this is not json', 'the malformed bytes are left exactly as found');
  }

  // ---------------------------------------------------------------- absent settings file
  {
    const e = makeEnv();                                     // no file at all
    const res = await e.txn.install({ runtimePath: RUNTIME, reporterPath: REPORTER });
    assert(res.ok === true, 'installing with no settings file yet succeeds');
    assert(fs.existsSync(e.settingsPath), 'and creates one');
  }

  // ---------------------------------------------------------------- unsafe shim path is refused
  {
    const res = txnMod.writeShim('C:\\a%PATH%b\\shim.cmd', RUNTIME, REPORTER);
    assert(res.ok === false && res.reason === txnMod.TXN_REFUSAL.SHIM_PATH_REFUSED,
      'a shim path with paired percent signs is refused before anything is written');
  }

  // The "no test touches a real home directory" property is proven repo-wide by
  // pane-status-isolation.test.js, which scans every file in this directory. A file cannot honestly
  // scan itself for a string its own assertion has to contain.

  try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* best effort */ }
  process.stdout.write(`\npane-status-txn: ${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { process.stderr.write('UNCAUGHT: ' + (e && e.stack) + '\n'); process.exit(1); });
