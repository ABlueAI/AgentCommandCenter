'use strict';
// Run: node app/pane-status/pane-status-removal.test.js
//
// REMOVAL CLASSIFICATION — advisory-review finding 4, as replaced by Binding Amendment A § 2.
//
// THE DEFECT THIS SUITE EXISTS FOR. The previous build performed NO ownership classification before a
// removal. It subtracted `JSON.stringify(group)` from the current document and then "verified" that
// the same stringified group was absent. Those two steps are the same test, so for any group that had
// been modified — or merely re-serialized by another tool with different key order — both were no-ops
// that agreed with each other. Removal reported SUCCESS, deleted the descriptor, and deleted the
// reporter shim, while the hook group stayed live in the user-scope Claude settings file, pointing
// at a file that no longer existed. Every Claude session on the machine would then fail eight hooks
// per turn, with no Blue Helm installation left that believed it owned them.
//
// Every settings path here is a temp fixture. Nothing in this file resolves a real home directory.

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const doc = require('./pane-status-settings-doc');
const txnMod = require('./pane-status-settings-txn');
const lockMod = require('./pane-status-lock');
const descriptorMod = require('./pane-status-descriptor');
const shimMod = require('./pane-status-runtime-shim');

let passed = 0, failed = 0;
function assert(cond, label) {
  if (cond) { process.stdout.write(`  ✓ ${label}\n`); passed++; }
  else { process.stderr.write(`  ✗ FAIL: ${label}\n`); failed++; }
}
// Values here can be whole settings documents. Report them only on FAILURE, and truncated: a passing
// assertion that dumps 4KB of JSON makes the gate output unreadable and hides the failures that matter.
function show(v) {
  const s = JSON.stringify(v);
  if (typeof s !== 'string') return String(v);
  return s.length > 160 ? s.slice(0, 160) + `…(${s.length} chars)` : s;
}
function eq(a, b, label) { assert(a === b, a === b ? label : `${label} (got ${show(a)})`); }

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bh-removal-'));
const OURS = 'a'.repeat(32);
const THEIRS = 'b'.repeat(32);
const CMD_EXE = shimMod.resolveCmdExe(process.env);

let seq = 0;
/** A fresh installed fixture: temp userData, temp settings dir, hooks installed, descriptor written. */
async function rig(seedSettings) {
  const dir = path.join(root, 'r' + (seq++));
  const userData = path.join(dir, 'userData');
  const settingsDir = path.join(dir, 'claude');
  const settingsPath = path.join(settingsDir, 'settings.json');
  fs.mkdirSync(userData, { recursive: true });
  fs.mkdirSync(settingsDir, { recursive: true });
  fs.writeFileSync(settingsPath, doc.serialize(seedSettings || {}));

  const lock = lockMod.createPaneStatusLock({ installId: OURS, settingsDir, now: () => 1000, log: () => {} });
  const txn = txnMod.createSettingsTransaction({
    userDataPath: userData, settingsPath, installId: OURS, lock, cmdExe: CMD_EXE,
    log: () => {}, now: () => 1000,
  });
  const res = await txn.install({ runtimePath: process.execPath, reporterPath: path.join(__dirname, 'pane-status-reporter.js') });
  if (!res.ok) throw new Error('fixture install failed: ' + JSON.stringify(res));
  return { dir, userData, settingsDir, settingsPath, txn, lock, shimPath: txn.shimPath() };
}

const readDoc = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const writeDoc = (p, v) => fs.writeFileSync(p, doc.serialize(v));

/** A matcher group that looks exactly like ours but carries a DIFFERENT installation's id. */
function otherInstallGroup() {
  const theirShim = doc.buildShimPath(path.join(root, 'other-userdata'), THEIRS);
  return doc.buildEventGroup(doc.buildHookEntry({ cmdExe: CMD_EXE, shimPath: theirShim }));
}

(async () => {
  // -----------------------------------------------------------------------------------------------
  process.stdout.write('\nA. every recorded group exact, no other installation -> REMOVE\n');
  // -----------------------------------------------------------------------------------------------
  {
    const r = await rig({ theme: 'dark', hooks: { PreCompact: [{ matcher: '', hooks: [{ type: 'command', command: 'echo' }] }] } });
    const res = await r.txn.remove();
    assert(res.ok === true, 'removal succeeds');
    const after = readDoc(r.settingsPath);
    eq(after.theme, 'dark', 'an unrelated top-level setting survives');
    assert(Array.isArray(after.hooks.PreCompact) && after.hooks.PreCompact.length === 1,
      'an unrelated hook event survives untouched');
    eq(doc.groupsWithInstallId(after, OURS).length, 0,
      'NO group carrying this install id remains anywhere in the document');
    assert(!fs.existsSync(r.shimPath), 'the shim is retired');
    assert(!descriptorMod.read(r.userData).ok, 'and the descriptor is retired');
  }

  // -----------------------------------------------------------------------------------------------
  process.stdout.write('\nkey ORDER does not change what a group is\n');
  // -----------------------------------------------------------------------------------------------
  {
    const r = await rig({});
    // Re-serialize our own group with every object's keys reversed — semantically identical, and a
    // completely different JSON.stringify() output. This is what a formatter or another tool does.
    const reorder = (v) => {
      if (Array.isArray(v)) return v.map(reorder);
      if (v && typeof v === 'object') {
        const out = {};
        for (const k of Object.keys(v).reverse()) out[k] = reorder(v[k]);
        return out;
      }
      return v;
    };
    const before = readDoc(r.settingsPath);
    const shuffled = reorder(before);
    assert(JSON.stringify(shuffled) !== JSON.stringify(before),
      'the reordered document really is a different byte string');
    assert(doc.deepEqual(shuffled, before), 'but deepEqual says it is the same document');
    writeDoc(r.settingsPath, shuffled);

    const res = await r.txn.remove();
    assert(res.ok === true, 'removal still succeeds against the reordered file');
    eq(doc.groupsWithInstallId(readDoc(r.settingsPath), OURS).length, 0,
      'and our groups really are gone — the old stringify match would have left all eight behind');
  }

  // -----------------------------------------------------------------------------------------------
  process.stdout.write('\nD. modified, partial, or ambiguous -> REFUSE, and NOTHING is written\n');
  // -----------------------------------------------------------------------------------------------
  const refusals = [
    ['an extra field on our hook entry', (d) => { d.hooks.Stop[0].hooks[0].statusMessage = 'edited'; }],
    ['a changed value on our hook entry', (d) => { d.hooks.Stop[0].hooks[0].timeout = 99; }],
    ['a changed matcher on our group', (d) => { d.hooks.Stop[0].matcher = 'Bash'; }],
    ['one recorded event missing entirely', (d) => { delete d.hooks.Stop; }],
    ['a second copy of our group in one event', (d) => { d.hooks.Stop.push(JSON.parse(JSON.stringify(d.hooks.Stop[0]))); }],
    ['our hook sharing a matcher group with a foreign one', (d) => { d.hooks.Stop[0].hooks.push({ type: 'command', command: 'echo' }); }],
  ];
  for (const [label, mutate] of refusals) {
    const r = await rig({ keep: 'me' });
    const current = readDoc(r.settingsPath);
    mutate(current);
    writeDoc(r.settingsPath, current);
    const settingsBefore = fs.readFileSync(r.settingsPath, 'utf8');
    const descriptorBefore = fs.readFileSync(descriptorMod.descriptorPath(r.userData), 'utf8');

    const res = await r.txn.remove();
    assert(res.ok === false, `${label}: removal REFUSES`);
    eq(res.reason, txnMod.TXN_REFUSAL.REMOVAL_REFUSED, `${label}: with the removal-refused reason`);
    assert(res.retained === true, `${label}: and reports that everything was retained`);
    eq(fs.readFileSync(r.settingsPath, 'utf8'), settingsBefore, `${label}: settings are BYTE-IDENTICAL`);
    eq(fs.readFileSync(descriptorMod.descriptorPath(r.userData), 'utf8'), descriptorBefore,
      `${label}: the descriptor is BYTE-IDENTICAL`);
    assert(fs.existsSync(r.shimPath), `${label}: and the shim is still present`);
  }

  // -----------------------------------------------------------------------------------------------
  process.stdout.write('\nONE modified event refuses the WHOLE operation, not just that event\n');
  // -----------------------------------------------------------------------------------------------
  {
    const r = await rig({});
    const current = readDoc(r.settingsPath);
    current.hooks.SessionEnd[0].hooks[0].timeout = 42;      // exactly one of the eight
    writeDoc(r.settingsPath, current);

    const res = await r.txn.remove();
    assert(res.ok === false, 'the removal refuses');
    eq(res.detail, doc.REMOVAL_REFUSAL.MODIFIED, 'because one event is modified');
    const after = readDoc(r.settingsPath);
    eq(doc.groupsWithInstallId(after, OURS).length, 8,
      'and ALL EIGHT groups are still there — a partially removed hook set is worse than either endpoint');
  }

  // -----------------------------------------------------------------------------------------------
  process.stdout.write('\nC. all recorded groups already absent -> no settings mutation, cleanup proceeds\n');
  // -----------------------------------------------------------------------------------------------
  {
    const r = await rig({ untouched: true });
    writeDoc(r.settingsPath, { untouched: true });          // somebody removed them by hand
    const settingsBefore = fs.readFileSync(r.settingsPath, 'utf8');

    const res = await r.txn.remove();
    assert(res.ok === true, 'removal succeeds');
    assert(res.alreadyAbsent === true, 'and says so explicitly rather than pretending it wrote');
    eq(fs.readFileSync(r.settingsPath, 'utf8'), settingsBefore,
      'the settings file was never mutated — byte-identical');
    assert(!fs.existsSync(r.shimPath), 'the shim is still retired');
    assert(!descriptorMod.read(r.userData).ok, 'and so is the descriptor');
  }

  // -----------------------------------------------------------------------------------------------
  process.stdout.write('\nB. our exact groups PLUS another installation -> remove only ours\n');
  // -----------------------------------------------------------------------------------------------
  {
    const r = await rig({});
    const current = readDoc(r.settingsPath);
    // Their group goes FIRST in two events and LAST in a third, so order preservation is really tested.
    current.hooks.Stop.unshift(otherInstallGroup());
    current.hooks.SessionStart.unshift(otherInstallGroup());
    current.hooks.Notification.push(otherInstallGroup());
    writeDoc(r.settingsPath, current);

    // (event, group) pairs in document order — the same index-insensitive fingerprint the transaction
    // verifies against, because removing our group necessarily shifts the indices after it.
    const theirsBefore = txnMod.otherInstallSignature(current, OURS);
    eq(doc.otherInstallGroups(current, OURS).length, 3, 'the fixture really contains three foreign-install groups');

    const res = await r.txn.remove();
    assert(res.ok === true, 'removal succeeds with another installation present');
    const after = readDoc(r.settingsPath);
    eq(doc.groupsWithInstallId(after, OURS).length, 0, 'every group of OURS is gone');
    const theirsAfter = doc.otherInstallGroups(after, OURS);
    eq(theirsAfter.length, 3, 'all three of THEIRS survive');
    eq(txnMod.otherInstallSignature(after, OURS), theirsBefore,
      'BYTE-IDENTICAL, in the same events, and in the same order');
    eq(theirsAfter[0][0], 'SessionStart', 'their event keys are unchanged');
    assert(after.hooks.Stop.length === 1 && after.hooks.Notification.length === 1,
      'the events they occupy are kept rather than deleted');
  }

  // -----------------------------------------------------------------------------------------------
  process.stdout.write('\nE. ONLY another installation present, while our descriptor claims installed\n');
  // -----------------------------------------------------------------------------------------------
  {
    const r = await rig({});
    // Ours are gone and theirs are there. This is not "already removed" — something happened we did
    // not do, and claiming a successful removal of THIS installation would be a lie.
    writeDoc(r.settingsPath, { hooks: { Stop: [otherInstallGroup()] } });
    const descriptorBefore = fs.readFileSync(descriptorMod.descriptorPath(r.userData), 'utf8');
    const settingsBefore = fs.readFileSync(r.settingsPath, 'utf8');

    const res = await r.txn.remove();
    assert(res.ok === false, 'removal does NOT report success');
    assert(res.reconciliationRequired === true, 'it reports reconciliation-required');
    eq(res.detail, doc.REMOVAL_REFUSAL.OTHER_INSTALL_ONLY, 'with the specific cross-install reason');
    eq(fs.readFileSync(r.settingsPath, 'utf8'), settingsBefore, 'their group is untouched');
    eq(fs.readFileSync(descriptorMod.descriptorPath(r.userData), 'utf8'), descriptorBefore,
      'and OUR descriptor is not destroyed as if the removal had succeeded');
    assert(fs.existsSync(r.shimPath), 'the shim survives too');
  }

  // -----------------------------------------------------------------------------------------------
  process.stdout.write('\nSETUP still refuses outright when another installation already owns pane status\n');
  // -----------------------------------------------------------------------------------------------
  {
    const dir = path.join(root, 'setup-refuse');
    const userData = path.join(dir, 'userData');
    const settingsDir = path.join(dir, 'claude');
    const settingsPath = path.join(settingsDir, 'settings.json');
    fs.mkdirSync(userData, { recursive: true });
    fs.mkdirSync(settingsDir, { recursive: true });
    // Their groups on all eight events: a second installation must never add a set alongside.
    const theirs = {};
    for (const ev of doc.INSTALLED_EVENTS) theirs[ev] = [otherInstallGroup()];
    writeDoc(settingsPath, { hooks: theirs });
    const before = fs.readFileSync(settingsPath, 'utf8');

    const lock = lockMod.createPaneStatusLock({ installId: OURS, settingsDir, now: () => 1, log: () => {} });
    const txn = txnMod.createSettingsTransaction({
      userDataPath: userData, settingsPath, installId: OURS, lock, cmdExe: CMD_EXE, log: () => {}, now: () => 1,
    });
    const res = await txn.install({ runtimePath: process.execPath, reporterPath: path.join(__dirname, 'pane-status-reporter.js') });
    assert(res.ok === false, 'setup REFUSES');
    eq(res.ownership, doc.OWNERSHIP.OTHER_INSTALL, 'naming the other installation as the reason');
    eq(fs.readFileSync(settingsPath, 'utf8'), before, 'and their settings are byte-identical afterwards');
    assert(!fs.existsSync(txn.shimPath()), 'no shim was written either');
  }

  // -----------------------------------------------------------------------------------------------
  process.stdout.write('\nthe pure classifier, directly\n');
  // -----------------------------------------------------------------------------------------------
  {
    const shim = doc.buildShimPath(path.join(root, 'ud'), OURS);
    const groups = doc.buildHookGroups({ cmdExe: CMD_EXE, shimPath: shim });
    const installed = doc.withInstalled({}, groups);

    eq(doc.classifyRemoval(installed, groups, OURS).outcome, doc.REMOVAL_OUTCOME.REMOVE, 'exact -> REMOVE');
    eq(doc.classifyRemoval({}, groups, OURS).outcome, doc.REMOVAL_OUTCOME.ALREADY_ABSENT, 'empty -> ALREADY_ABSENT');
    eq(doc.classifyRemoval(installed, {}, OURS).outcome, doc.REMOVAL_OUTCOME.REFUSE, 'no recorded groups -> REFUSE');
    eq(doc.classifyRemoval(installed, {}, OURS).reason, doc.REMOVAL_REFUSAL.NO_RECORDED_GROUPS,
      'with the no-recorded-groups reason — a descriptor without a record can never authorize a write');

    // An install id we do not own must never make our classifier think a group is ours.
    eq(doc.classifyRemoval(installed, groups, THEIRS).outcome, doc.REMOVAL_OUTCOME.RECONCILE,
      'from the OTHER installation\'s point of view, this document is theirs-only -> RECONCILE');
    eq(doc.groupsWithInstallId(installed, THEIRS).length, 0, 'and it owns none of these groups');
    eq(doc.groupsWithInstallId(installed, OURS).length, 8, 'while we own all eight');
  }

  try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* best effort */ }
  process.stdout.write(`\npane-status-removal: ${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
})();
