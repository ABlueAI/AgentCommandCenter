'use strict';
// Run: node app/pane-status/pane-status-recovery.test.js
//
// STARTUP RECONCILIATION, and the one property that governs it:
//
//     RECONCILIATION MAY UPDATE ONLY THE DESCRIPTOR. IT MAY NEVER MUTATE CLAUDE SETTINGS.
//
// Every fixture below records the settings bytes before reconcile() and asserts they are byte-identical
// afterwards. That assertion is repeated for EVERY crash point rather than written once, because the
// whole risk is that one branch grows a write.

const fs = require('fs');
const os = require('os');
const path = require('path');

const recoveryMod = require('./pane-status-recovery');
const descriptorMod = require('./pane-status-descriptor');
const doc = require('./pane-status-settings-doc');
const shimMod = require('./pane-status-runtime-shim');
const txnMod = require('./pane-status-settings-txn');
const lockMod = require('./pane-status-lock');

let passed = 0, failed = 0;
function assert(cond, label) {
  if (cond) { process.stdout.write(`  ✓ ${label}\n`); passed++; }
  else { process.stderr.write(`  ✗ FAIL: ${label}\n`); failed++; }
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bh-recovery-'));
const MINE = 'a'.repeat(32);
const THEIRS = 'b'.repeat(32);
const CMD = shimMod.resolveCmdExe();
const RUNTIME = process.execPath;
const REPORTER = path.join(__dirname, 'pane-status-reporter.js');
const TXN = descriptorMod.TXN;
const OUT = recoveryMod.OUTCOME;
const WHY = recoveryMod.RECONCILE_REASON;
let clock = 1000;

function makeEnv() {
  const dir = fs.mkdtempSync(path.join(root, 'env-'));
  const userData = path.join(dir, 'userData');
  const settingsDir = path.join(dir, 'claude');
  const settingsPath = path.join(settingsDir, 'settings.json');
  fs.mkdirSync(userData, { recursive: true });
  fs.mkdirSync(settingsDir, { recursive: true });
  const recovery = recoveryMod.createRecovery({
    userDataPath: userData, settingsPath, installId: MINE, cmdExe: CMD,
    currentRuntimePath: RUNTIME, reporterPath: REPORTER, now: () => clock, log: () => {},
  });
  return { dir, userData, settingsDir, settingsPath, recovery };
}

const myGroups = () => doc.buildHookGroups({ cmdExe: CMD, shimPath: doc.buildShimPath('C:\\ud', MINE) });
const theirGroups = () => doc.buildHookGroups({ cmdExe: CMD, shimPath: doc.buildShimPath('C:\\other', THEIRS) });

function writeDescriptor(userData, state, groups) {
  return descriptorMod.write(userData, descriptorMod.buildDescriptor({
    installId: MINE,
    ownerMarker: 'pane-status/' + MINE,
    transactionState: state,
    installedGroups: groups || null,
    installedEvents: groups ? doc.INSTALLED_EVENTS.slice() : null,
    runtimePath: RUNTIME, shimPath: doc.buildShimPath('C:\\ud', MINE), reporterPath: REPORTER,
    settingsPath: path.join(userData, 'unused'), createdAt: clock, updatedAt: clock,
  }));
}

/** Run reconcile and assert the settings bytes did not move. */
function reconcileAndProveSettingsUnchanged(e, label) {
  const before = fs.existsSync(e.settingsPath) ? fs.readFileSync(e.settingsPath, 'utf8') : null;
  const result = e.recovery.reconcile();
  const after = fs.existsSync(e.settingsPath) ? fs.readFileSync(e.settingsPath, 'utf8') : null;
  assert(before === after, `${label}: Claude settings bytes are UNCHANGED by reconciliation`);
  return result;
}

// ---------------------------------------------------------------- clean first run
{
  const e = makeEnv();
  fs.writeFileSync(e.settingsPath, doc.serialize({ theme: 'dark' }));
  const r = reconcileAndProveSettingsUnchanged(e, 'clean first run');
  assert(r.outcome === OUT.NOT_INSTALLED && r.reason === WHY.CLEAN, 'a clean machine reconciles to NOT_INSTALLED');
}

// ---------------------------------------------------------------- descriptor missing, hooks marked
{
  const e = makeEnv();
  fs.writeFileSync(e.settingsPath, doc.serialize({ hooks: myGroups() }));
  const r = reconcileAndProveSettingsUnchanged(e, 'descriptor missing + marked hooks');
  assert(r.outcome === OUT.RECONCILIATION_REQUIRED && r.reason === WHY.DESCRIPTOR_MISSING_HOOKS_PRESENT,
    'marked hooks with NO descriptor demand manual recovery — ownership is never guessed');
  assert(Array.isArray(r.markedInstallIds) && r.markedInstallIds[0] === MINE, 'and the marked install id is reported');
}

// ---------------------------------------------------------------- descriptor corrupt, hooks marked
{
  const e = makeEnv();
  fs.writeFileSync(e.settingsPath, doc.serialize({ hooks: myGroups() }));
  fs.writeFileSync(path.join(e.userData, 'pane-status-installation.json'), '{corrupt');
  const r = reconcileAndProveSettingsUnchanged(e, 'descriptor corrupt + marked hooks');
  assert(r.outcome === OUT.RECONCILIATION_REQUIRED, 'a corrupt descriptor with marked hooks demands manual recovery');
}

// ---------------------------------------------------------------- descriptor newer schema
{
  const e = makeEnv();
  fs.writeFileSync(e.settingsPath, doc.serialize({}));
  const newer = descriptorMod.buildDescriptor({
    installId: MINE, ownerMarker: 'm', transactionState: TXN.INSTALLED, settingsPath: 'x', createdAt: 1, updatedAt: 1,
  });
  newer.schemaVersion = descriptorMod.SCHEMA_VERSION + 1;
  newer.integrity = descriptorMod.integrityHashOf(newer);
  fs.writeFileSync(path.join(e.userData, 'pane-status-installation.json'), JSON.stringify(newer, null, 2) + '\n');
  const raw = fs.readFileSync(path.join(e.userData, 'pane-status-installation.json'), 'utf8');
  const r = reconcileAndProveSettingsUnchanged(e, 'newer descriptor schema');
  assert(r.outcome === OUT.RECONCILIATION_REQUIRED && r.reason === WHY.DESCRIPTOR_NEWER_SCHEMA,
    'a NEWER descriptor schema is refused');
  assert(fs.readFileSync(path.join(e.userData, 'pane-status-installation.json'), 'utf8') === raw,
    'and the future build\'s descriptor is NOT overwritten either');
}

// ---------------------------------------------------------------- interrupted install, every crash point
for (const state of [TXN.INSTALL_PENDING, TXN.INSTALL_WRITTEN, TXN.INSTALL_VERIFIED]) {
  // (a) groups DID land -> roll forward
  {
    const e = makeEnv();
    const g = myGroups();
    fs.writeFileSync(e.settingsPath, doc.serialize({ theme: 'dark', hooks: g }));
    writeDescriptor(e.userData, state, g);
    const r = reconcileAndProveSettingsUnchanged(e, `${state} with groups present`);
    assert(r.outcome === OUT.INSTALLED && r.reason === WHY.ROLLED_FORWARD,
      `${state} + groups present rolls FORWARD to installed`);
    assert(descriptorMod.read(e.userData).value.transactionState === TXN.INSTALLED, 'and the descriptor is finalized');
  }
  // (b) groups did NOT land -> roll back
  {
    const e = makeEnv();
    fs.writeFileSync(e.settingsPath, doc.serialize({ theme: 'dark' }));
    writeDescriptor(e.userData, state, myGroups());
    const r = reconcileAndProveSettingsUnchanged(e, `${state} with groups absent`);
    assert(r.outcome === OUT.NOT_INSTALLED && r.reason === WHY.ROLLED_BACK,
      `${state} + groups absent rolls BACK to idle`);
    assert(descriptorMod.read(e.userData).value.transactionState === TXN.IDLE, 'and the descriptor returns to IDLE');
  }
  // (c) something else owns them -> refuse
  {
    const e = makeEnv();
    fs.writeFileSync(e.settingsPath, doc.serialize({ hooks: theirGroups() }));
    writeDescriptor(e.userData, state, myGroups());
    const r = reconcileAndProveSettingsUnchanged(e, `${state} with another install's groups`);
    assert(r.outcome === OUT.RECONCILIATION_REQUIRED, `${state} + another installation's groups demands reconciliation`);
  }
}

// ---------------------------------------------------------------- interrupted removal, every crash point
for (const state of [TXN.REMOVE_PENDING, TXN.REMOVE_WRITTEN, TXN.REMOVE_VERIFIED]) {
  // (a) groups already gone -> finish the removal
  {
    const e = makeEnv();
    fs.writeFileSync(e.settingsPath, doc.serialize({ theme: 'dark' }));
    writeDescriptor(e.userData, state, myGroups());
    const r = reconcileAndProveSettingsUnchanged(e, `${state} with groups gone`);
    assert(r.outcome === OUT.REMOVED && r.reason === WHY.REMOVAL_COMPLETED, `${state} + groups gone COMPLETES the removal`);
    assert(descriptorMod.exists(e.userData) === false, 'and retires the descriptor');
  }
  // (b) groups still there -> revert to installed
  {
    const e = makeEnv();
    const g = myGroups();
    fs.writeFileSync(e.settingsPath, doc.serialize({ hooks: g }));
    writeDescriptor(e.userData, state, g);
    const r = reconcileAndProveSettingsUnchanged(e, `${state} with groups present`);
    assert(r.outcome === OUT.INSTALLED && r.reason === WHY.REMOVAL_REVERTED, `${state} + groups present REVERTS to installed`);
  }
}

// ---------------------------------------------------------------- steady INSTALLED, external tampering
{
  const e = makeEnv();
  const g = myGroups();
  const tampered = JSON.parse(JSON.stringify(g));
  tampered.Stop[0].hooks[0].timeout = 999;
  fs.writeFileSync(e.settingsPath, doc.serialize({ hooks: tampered }));
  writeDescriptor(e.userData, TXN.INSTALLED, g);
  const r = reconcileAndProveSettingsUnchanged(e, 'installed but externally modified');
  assert(r.outcome === OUT.RECONCILIATION_REQUIRED && r.reason === WHY.GROUPS_MODIFIED,
    'groups modified outside the app demand reconciliation');
}
{
  const e = makeEnv();
  fs.writeFileSync(e.settingsPath, doc.serialize({ theme: 'dark' }));
  writeDescriptor(e.userData, TXN.INSTALLED, myGroups());
  const r = reconcileAndProveSettingsUnchanged(e, 'installed but groups vanished');
  assert(r.outcome === OUT.RECONCILIATION_REQUIRED && r.reason === WHY.GROUPS_VANISHED,
    'groups removed outside the app demand reconciliation — we do not silently reinstall');
}

// ---------------------------------------------------------------- already reconciliation-required
{
  const e = makeEnv();
  fs.writeFileSync(e.settingsPath, doc.serialize({}));
  writeDescriptor(e.userData, TXN.RECONCILIATION_REQUIRED, myGroups());
  const r = reconcileAndProveSettingsUnchanged(e, 'already reconciliation-required');
  assert(r.outcome === OUT.RECONCILIATION_REQUIRED && r.reason === WHY.ALREADY_REQUIRED,
    'reconciliation-required is sticky until a human acts');
}

// ---------------------------------------------------------------- unreadable settings
{
  const e = makeEnv();
  fs.writeFileSync(e.settingsPath, '{ broken');
  writeDescriptor(e.userData, TXN.INSTALLED, myGroups());
  const r = reconcileAndProveSettingsUnchanged(e, 'malformed settings');
  assert(r.outcome === OUT.RECONCILIATION_REQUIRED && r.reason === WHY.SETTINGS_UNREADABLE,
    'malformed settings block reconciliation rather than being rewritten');
}

// ---------------------------------------------------------------- runtime change rewrites ONLY the shim
{
  const dir = fs.mkdtempSync(path.join(root, 'up-'));
  const userData = path.join(dir, 'userData');
  const settingsDir = path.join(dir, 'claude');
  const settingsPath = path.join(settingsDir, 'settings.json');
  fs.mkdirSync(userData, { recursive: true });
  fs.mkdirSync(settingsDir, { recursive: true });
  fs.writeFileSync(settingsPath, doc.serialize({}));

  const lock = lockMod.createPaneStatusLock({ installId: MINE, settingsDir, now: () => clock, log: () => {} });
  const txn = txnMod.createSettingsTransaction({
    userDataPath: userData, settingsPath, installId: MINE, lock, cmdExe: CMD, now: () => clock, log: () => {},
  });
  txn.install({ runtimePath: RUNTIME, reporterPath: REPORTER }).then((installed) => {
    assert(installed.ok === true, 'upgrade fixture installs');
    const settingsAfterInstall = fs.readFileSync(settingsPath, 'utf8');
    const shimBefore = fs.readFileSync(txn.shimPath(), 'utf8');

    // Simulate Electron moving: reconcile with a DIFFERENT runtime path.
    const movedRuntime = path.join(dir, 'newer-electron.exe');
    fs.writeFileSync(movedRuntime, 'not really an executable');
    const recovery = recoveryMod.createRecovery({
      userDataPath: userData, settingsPath, installId: MINE, cmdExe: CMD,
      currentRuntimePath: movedRuntime, reporterPath: REPORTER, now: () => clock, log: () => {},
    });
    const r = recovery.reconcile();

    assert(r.outcome === OUT.INSTALLED && r.reason === WHY.SHIM_REPAIRED, 'a moved runtime triggers a shim repair');
    assert(fs.readFileSync(settingsPath, 'utf8') === settingsAfterInstall,
      'and CLAUDE SETTINGS ARE NOT UPDATED — the shim indirection is what makes that possible');
    const shimAfter = fs.readFileSync(txn.shimPath(), 'utf8');
    assert(shimAfter !== shimBefore && shimAfter.indexOf(movedRuntime) !== -1,
      'the shim now points at the new runtime, at the SAME stable path');
    assert(descriptorMod.read(userData).value.runtime.runtimePath === movedRuntime,
      'and only the descriptor was updated to match');

    finish();
  }).catch((e2) => { process.stderr.write('UNCAUGHT: ' + (e2 && e2.stack) + '\n'); process.exit(1); });
}

function finish() {
  try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* best effort */ }
  process.stdout.write(`\npane-status-recovery: ${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
}
