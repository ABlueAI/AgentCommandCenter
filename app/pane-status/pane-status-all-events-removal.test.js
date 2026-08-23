'use strict';
// Run: node app/pane-status/pane-status-all-events-removal.test.js
//
// R1 — ALL-EVENTS REMOVAL VERIFICATION.
//
// The hole: every removal decision reasoned only over the events the DESCRIPTOR names. A hook group
// carrying our installation ID that drifted to an event we do not install into was invisible to all of
// it. Every recorded event then read `absent`, removal took the already-absent branch, deleted the
// shim and retired the descriptor — and the stray group stayed live in the settings file, invoking a
// reporter that no longer existed, with the only record that could have found it now destroyed.
//
// The rule: before direct removal OR interrupted-removal recovery may report already-absent or delete
// the shim and descriptor, scan the WHOLE document for this installation ID. Anything of ours outside
// the exact recorded groups means refuse or reconcile: settings byte-identical, shim and descriptor
// retained, no success reported. Groups owned by ANOTHER installation are legitimate coexistence and
// must survive byte-identically and in their existing order.

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const controllerMod = require('./pane-status-controller');
const descriptorMod = require('./pane-status-descriptor');
const doc = require('./pane-status-settings-doc');
const recoveryMod = require('./pane-status-recovery');
const shimMod = require('./pane-status-runtime-shim');

let passed = 0, failed = 0;
function assert(cond, label) {
  if (cond) { process.stdout.write(`  ✓ ${label}\n`); passed++; }
  else { process.stderr.write(`  ✗ FAIL: ${label}\n`); failed++; }
}
function eq(a, b, label) { assert(a === b, a === b ? label : `${label} (got ${JSON.stringify(a)})`); }

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bh-allevents-'));
const OURS = 'e'.repeat(32);
const THEIRS = 'f'.repeat(32);

// An event NOTHING installs into, so a group here is unreachable by any recorded-event reasoning.
// All eight allowed events ARE installed into, so this is deliberately outside that set entirely —
// which is the realistic shape of the drift: a hand edit, or another tool, moving our group somewhere
// we would never look.
const UNRECORDED_EVENT = ['PreCompact', 'SubagentStop', 'UnrecordedEvent']
  .filter((e) => doc.INSTALLED_EVENTS.indexOf(e) === -1)[0];

let seq = 0;
function makeRig() {
  const dir = path.join(root, 'r' + (seq++));
  const userData = path.join(dir, 'userData');
  const settingsDir = path.join(dir, 'claude');
  const settingsPath = path.join(settingsDir, 'settings.json');
  fs.mkdirSync(userData, { recursive: true });
  fs.mkdirSync(settingsDir, { recursive: true });
  fs.writeFileSync(settingsPath, '{}\n');
  const logs = [];
  const c = controllerMod.createPaneStatusController({
    userDataPath: userData, settingsDir, settingsPath,
    installId: OURS,
    cmdExe: shimMod.resolveCmdExe(process.env),
    reporterPath: path.join(__dirname, 'pane-status-reporter.js'),
    currentRuntimePath: process.execPath,
    net: require('net'), crypto,
    randomToken: () => crypto.randomBytes(32).toString('hex'),
    resolveVersion: async () => ({ ok: true, raw: '9.9.9 (Claude Code)' }),
    resolveProcessStartTime: async () => ({ ok: true, running: false }),
    supportedVersions: ['9.9.9'],
    publishView: () => true, publishSetupState: () => true,
    now: () => 1000, log: (l) => logs.push(String(l)),
  });
  return { c, logs, settingsPath, userData };
}

const readSettings = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const writeSettings = (p, v) => fs.writeFileSync(p, JSON.stringify(v, null, 2) + '\n');

/** Reach an interrupted-removal state the descriptor's own way: rebuild its integrity hash. */
function setTransactionState(userData, state) {
  const cur = descriptorMod.read(userData);
  if (!cur.ok) return false;
  const v = cur.value;
  v.transactionState = state;
  v.integrity = descriptorMod.integrityHashOf(v);
  fs.writeFileSync(descriptorMod.descriptorPath(userData), descriptorMod.serialize(v), 'utf8');
  return descriptorMod.read(userData).value.transactionState === state;
}

/**
 * A group belonging to a DIFFERENT installation, built by cloning one of ours and swapping the install
 * ID inside the shim path in `args` — which is where ownership actually lives. Hand-writing a
 * plausible-looking group instead would produce something `installIdOf` returns null for, and every
 * coexistence assertion would then pass vacuously against an empty list.
 */
function reassignInstallId(group, newId) {
  const g = JSON.parse(JSON.stringify(group));
  for (const h of (g.hooks || [])) {
    if (Array.isArray(h.args)) h.args = h.args.map((a) => (typeof a === 'string' ? a.split(OURS).join(newId) : a));
  }
  return g;
}

function makeRecovery(rig) {
  return recoveryMod.createRecovery({
    userDataPath: rig.userData, settingsPath: rig.settingsPath, installId: OURS,
    cmdExe: shimMod.resolveCmdExe(process.env),
    currentRuntimePath: process.execPath,
    reporterPath: path.join(__dirname, 'pane-status-reporter.js'),
    log: () => {}, now: () => 1000,
  });
}

(async () => {
  // -----------------------------------------------------------------------------------------------
  process.stdout.write('\n0. The fixture is honest about what "unrecorded" means\n');
  // -----------------------------------------------------------------------------------------------
  assert(typeof UNRECORDED_EVENT === 'string' && UNRECORDED_EVENT.length > 0,
    'an unrecorded event name was found');
  eq(doc.INSTALLED_EVENTS.indexOf(UNRECORDED_EVENT), -1,
    `${UNRECORDED_EVENT} is genuinely outside the installed event set`);
  eq(doc.INSTALLED_EVENTS.length, 8, 'and all eight allowed events ARE installed into, so nothing else is spare');

  // -----------------------------------------------------------------------------------------------
  process.stdout.write('\n1. A group of ours COPIED to an unrecorded event blocks removal\n');
  // -----------------------------------------------------------------------------------------------
  {
    const rig = makeRig();
    await rig.c.install();
    const recorded = descriptorMod.read(rig.userData).value.installedGroups;
    const firstEvent = Object.keys(recorded)[0];

    const s = readSettings(rig.settingsPath);
    s.hooks[UNRECORDED_EVENT] = [JSON.parse(JSON.stringify(recorded[firstEvent][0]))];
    writeSettings(rig.settingsPath, s);
    const before = fs.readFileSync(rig.settingsPath, 'utf8');

    // Every recorded event is still EXACT, so nothing the old logic looked at was wrong.
    const cls = doc.classifyRemoval(readSettings(rig.settingsPath), recorded, OURS);
    eq(cls.outcome, doc.REMOVAL_OUTCOME.RECONCILE, 'classification requires reconciliation');
    eq(cls.reason, doc.REMOVAL_REFUSAL.STRAY_GROUP, 'because a group of ours sits outside the record');
    assert(cls.strayEvents.indexOf(UNRECORDED_EVENT) !== -1, `and it names the stray event ${UNRECORDED_EVENT}`);

    const res = await rig.c.remove();
    eq(res.ok, false, 'direct removal REFUSES');
    eq(res.detail, doc.REMOVAL_REFUSAL.STRAY_GROUP, 'with the all-events reason');
    eq(res.retained, true, 'and reports that nothing was changed');
    eq(res.reconciliationRequired, true, 'flagged for reconciliation');

    eq(fs.readFileSync(rig.settingsPath, 'utf8'), before, 'the settings file is BYTE-IDENTICAL');
    assert(fs.existsSync(descriptorMod.descriptorPath(rig.userData)), 'the installation record is retained');
    const shim = descriptorMod.read(rig.userData).value.runtime.shimPath;
    assert(fs.existsSync(shim), 'and the shim is retained');
  }

  // -----------------------------------------------------------------------------------------------
  process.stdout.write('\n2. This installation\'s exact group MOVED to an unrecorded event\n');
  // -----------------------------------------------------------------------------------------------
  {
    const rig = makeRig();
    await rig.c.install();
    const recorded = descriptorMod.read(rig.userData).value.installedGroups;
    const firstEvent = Object.keys(recorded)[0];

    // Genuinely moved: gone from the recorded event, present at one nothing records.
    const s = readSettings(rig.settingsPath);
    const moved = JSON.parse(JSON.stringify(recorded[firstEvent][0]));
    s.hooks[firstEvent] = s.hooks[firstEvent].filter((g) => !doc.groupBelongsTo(g, OURS));
    if (s.hooks[firstEvent].length === 0) delete s.hooks[firstEvent];
    s.hooks[UNRECORDED_EVENT] = [moved];
    writeSettings(rig.settingsPath, s);
    const before = fs.readFileSync(rig.settingsPath, 'utf8');

    const cls = doc.classifyRemoval(readSettings(rig.settingsPath), recorded, OURS);
    eq(cls.reason, doc.REMOVAL_REFUSAL.STRAY_GROUP,
      'the drift is reported as a stray group, not merely as a partial installation');

    const res = await rig.c.remove();
    eq(res.ok, false, 'direct removal REFUSES');
    eq(res.retained, true, 'nothing was written');
    eq(fs.readFileSync(rig.settingsPath, 'utf8'), before, 'settings BYTE-IDENTICAL');
    assert(fs.existsSync(descriptorMod.descriptorPath(rig.userData)),
      'the installation record is retained, so the stray can still be found');
  }

  // -----------------------------------------------------------------------------------------------
  process.stdout.write('\n3. THE DANGEROUS ONE: all recorded groups gone, one stray left behind\n');
  // -----------------------------------------------------------------------------------------------
  {
    const rig = makeRig();
    await rig.c.install();
    const recorded = descriptorMod.read(rig.userData).value.installedGroups;
    const sample = JSON.parse(JSON.stringify(recorded[Object.keys(recorded)[0]][0]));

    // Every recorded event now reads ABSENT — the old already-absent branch, which deleted the shim
    // and retired the descriptor while this stray stayed live.
    const s = readSettings(rig.settingsPath);
    for (const ev of Object.keys(recorded)) delete s.hooks[ev];
    s.hooks[UNRECORDED_EVENT] = [sample];
    writeSettings(rig.settingsPath, s);
    const before = fs.readFileSync(rig.settingsPath, 'utf8');

    const cls = doc.classifyRemoval(readSettings(rig.settingsPath), recorded, OURS);
    assert(cls.outcome !== doc.REMOVAL_OUTCOME.ALREADY_ABSENT,
      'it is NOT classified already-absent, which is the whole point of R1');
    eq(cls.reason, doc.REMOVAL_REFUSAL.STRAY_GROUP, 'it is a stray group');

    const res = await rig.c.remove();
    eq(res.ok, false, 'removal does not report success');
    eq(fs.readFileSync(rig.settingsPath, 'utf8'), before, 'settings BYTE-IDENTICAL');
    const shim = descriptorMod.read(rig.userData).value.runtime.shimPath;
    assert(fs.existsSync(shim), 'THE SHIM IS NOT DELETED — the stray hook still points at it');
    assert(fs.existsSync(descriptorMod.descriptorPath(rig.userData)),
      'and the installation record is NOT retired');
  }

  // -----------------------------------------------------------------------------------------------
  process.stdout.write('\n4. Genuinely absent: no strays anywhere, so removal completes normally\n');
  // -----------------------------------------------------------------------------------------------
  {
    const rig = makeRig();
    await rig.c.install();
    const recorded = descriptorMod.read(rig.userData).value.installedGroups;
    const shim = descriptorMod.read(rig.userData).value.runtime.shimPath;

    const s = readSettings(rig.settingsPath);
    for (const ev of Object.keys(recorded)) delete s.hooks[ev];
    writeSettings(rig.settingsPath, s);

    eq(doc.strayInstallGroups(readSettings(rig.settingsPath), recorded, OURS).length, 0,
      'nothing of ours survives anywhere');
    const cls = doc.classifyRemoval(readSettings(rig.settingsPath), recorded, OURS);
    eq(cls.outcome, doc.REMOVAL_OUTCOME.ALREADY_ABSENT, 'so this IS already-absent');

    const res = await rig.c.remove();
    eq(res.ok, true, 'removal succeeds');
    assert(fs.existsSync(shim) === false, 'the shim is retired');
    assert(fs.existsSync(descriptorMod.descriptorPath(rig.userData)) === false,
      'and the installation record is retired');
  }

  // -----------------------------------------------------------------------------------------------
  process.stdout.write('\n5. Another installation\'s groups are coexistence, never a blocker\n');
  // -----------------------------------------------------------------------------------------------
  {
    const rig = makeRig();
    await rig.c.install();
    const recorded = descriptorMod.read(rig.userData).value.installedGroups;
    const firstEvent = Object.keys(recorded)[0];

    // A neighbouring installation, deliberately placed BEFORE and AFTER ours and at an event we do
    // not record, so both order and position have something to prove.
    const theirs = () => reassignInstallId(recorded[firstEvent][0], THEIRS);
    const s = readSettings(rig.settingsPath);
    s.hooks[firstEvent] = [theirs()].concat(s.hooks[firstEvent], [theirs()]);
    s.hooks[UNRECORDED_EVENT] = [theirs()];
    writeSettings(rig.settingsPath, s);

    // NOT VACUOUS: prove the fixture really is owned by another installation before relying on it.
    eq(doc.groupsWithInstallId(readSettings(rig.settingsPath), THEIRS).length, 3,
      'the fixture really does contain three groups owned by another installation');
    // Compare [event, group] and NOT the index: removing our group from between two of theirs shifts
    // the later one from 2 to 1, which is correct behaviour, not damage. Array order still proves
    // relative order was preserved.
    const sig = (v) => JSON.stringify(doc.otherInstallGroups(v, OURS).map((g) => [g[0], g[2]]));
    const beforeOthers = sig(readSettings(rig.settingsPath));
    assert(beforeOthers.indexOf(THEIRS) !== -1, 'and they are visible as other-installation groups');
    eq(doc.strayInstallGroups(readSettings(rig.settingsPath), recorded, OURS).length, 0,
      'their groups are NOT strays of ours');

    const res = await rig.c.remove();
    eq(res.ok, true, 'our removal proceeds normally alongside them');

    const after = readSettings(rig.settingsPath);
    eq(sig(after), beforeOthers,
      'every group of theirs survives BYTE-IDENTICALLY and in the same relative order');
    eq(doc.otherInstallGroups(after, OURS).length, 3, 'all three of theirs are still present');
    eq(doc.groupsWithInstallId(after, OURS).length, 0, 'and nothing of ours is left anywhere');
    eq(after.hooks[UNRECORDED_EVENT].length, 1, 'their unrecorded-event group is untouched');
  }

  // -----------------------------------------------------------------------------------------------
  process.stdout.write('\n6. Interrupted-removal recovery holds from ALL THREE states\n');
  // -----------------------------------------------------------------------------------------------
  for (const state of ['REMOVE_PENDING', 'REMOVE_WRITTEN', 'REMOVE_VERIFIED']) {
    const rig = makeRig();
    await rig.c.install();
    const recorded = descriptorMod.read(rig.userData).value.installedGroups;
    const shim = descriptorMod.read(rig.userData).value.runtime.shimPath;
    const sample = JSON.parse(JSON.stringify(recorded[Object.keys(recorded)[0]][0]));

    // Settings look clean on every recorded event, with one stray of ours left behind.
    const s = readSettings(rig.settingsPath);
    for (const ev of Object.keys(recorded)) delete s.hooks[ev];
    s.hooks[UNRECORDED_EVENT] = [sample];
    writeSettings(rig.settingsPath, s);
    const before = fs.readFileSync(rig.settingsPath, 'utf8');

    assert(setTransactionState(rig.userData, state), `[${state}] the fixture reaches that state`);

    const out = makeRecovery(rig).reconcile();
    eq(out.outcome, recoveryMod.OUTCOME.RECONCILIATION_REQUIRED,
      `[${state}] recovery requires reconciliation instead of finishing the cleanup`);
    eq(out.reason, recoveryMod.RECONCILE_REASON.STRAY_GROUP, `[${state}] naming the stray group`);
    assert(fs.existsSync(shim), `[${state}] THE SHIM IS RETAINED`);
    assert(fs.existsSync(descriptorMod.descriptorPath(rig.userData)),
      `[${state}] and the installation record is RETAINED`);
    eq(fs.readFileSync(rig.settingsPath, 'utf8'), before, `[${state}] settings BYTE-IDENTICAL`);
  }

  // -----------------------------------------------------------------------------------------------
  process.stdout.write('\n7. Recovery still completes a genuinely clean interrupted removal\n');
  // -----------------------------------------------------------------------------------------------
  {
    const rig = makeRig();
    await rig.c.install();
    const recorded = descriptorMod.read(rig.userData).value.installedGroups;
    const shim = descriptorMod.read(rig.userData).value.runtime.shimPath;

    const s = readSettings(rig.settingsPath);
    for (const ev of Object.keys(recorded)) delete s.hooks[ev];
    writeSettings(rig.settingsPath, s);
    assert(setTransactionState(rig.userData, 'REMOVE_VERIFIED'), 'the fixture is REMOVE_VERIFIED');

    const out = makeRecovery(rig).reconcile();
    eq(out.outcome, recoveryMod.OUTCOME.REMOVED, 'recovery finishes the removal');
    assert(fs.existsSync(shim) === false, 'retiring the shim');
    assert(fs.existsSync(descriptorMod.descriptorPath(rig.userData)) === false,
      'and the installation record — R1 blocks strays, not clean cleanups');
  }

  // -----------------------------------------------------------------------------------------------
  process.stdout.write('\n8. The scan really is ALL events, not the installed set\n');
  // -----------------------------------------------------------------------------------------------
  {
    const rig = makeRig();
    await rig.c.install();
    const real = descriptorMod.read(rig.userData).value.installedGroups;
    const ourGroup = real[Object.keys(real)[0]][0];

    const settings = { hooks: { NotAnEventWeInstallInto: [JSON.parse(JSON.stringify(ourGroup))] } };
    const strays = doc.strayInstallGroups(settings, { PreToolUse: [] }, OURS);
    eq(strays.length, 1, 'a group of ours at an arbitrary unknown event is found');
    eq(strays[0][0], 'NotAnEventWeInstallInto', 'and reported with the event it was found at');
    eq(doc.strayInstallGroups(settings, { PreToolUse: [] }, THEIRS).length, 0,
      'while the same document has no strays for a different installation');
  }

  try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* best effort */ }
  process.stdout.write(`\npane-status-all-events-removal: ${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
})();
