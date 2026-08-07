'use strict';
// Run: node app/dockview-bootstrap.test.js
//
// REAL-BROWSER regression gate for the Dockview prototype's renderer bootstrap.
//
// Round 3 passed an independent Full-class code review and 1,850 Node assertions, and then failed
// human acceptance instantly: `npm run prototype:dockview` produced a full-screen blank overlay.
// Nothing in the Node suite could have caught it, because every helper was proven under `require`,
// where each file gets its own module scope. The renderer runs them as CLASSIC SCRIPTS sharing ONE
// global lexical environment, and there:
//
//   renderer/agent-dom.js       already declares a top-level `const api`
//   dockview-fit-policy.js      also declared a top-level `const api`  -> SyntaxError at PARSE time
//   dockview-panel-policy.js    also declared a top-level `const api`  -> SyntaxError at PARSE time
//   dockview-prototype.js       then reached `require` (absent under nodeIntegration:false)
//   app.js                      had already committed the full-screen overlay
//
// This gate spawns a real Electron renderer, loads the real files as real classic scripts in the
// real order, and drives the real bootstrap. It is the only test on this branch that could have
// failed before the correction, and it does fail against 8663467 (see the handoff's negative
// control).
//
// It is deliberately NOT the vendor tripwire. `dockview-tripwire.js` loads only the vendor bundle so
// that network behaviour is attributable to Dockview alone; that property must not be diluted, so
// this integration harness is separate and leaves it untouched.

const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

let passed = 0, failed = 0;
function assert(cond, label) {
  if (cond) { process.stdout.write(`  ✓ ${label}\n`); passed++; }
  else { process.stderr.write(`  ✗ FAIL: ${label}\n`); failed++; }
}

const APP_DIR = __dirname;
const HARNESS = path.join(APP_DIR, 'dockview-bootstrap-harness.js');

// The prototype must never create a layout file as a side effect of merely starting (§ 5.10 / § 9).
const LAYOUT_FILE = process.env.APPDATA
  ? path.join(process.env.APPDATA, 'command-center', 'dockview-prototype-layout.json')
  : null;
const layoutFileExisted = LAYOUT_FILE ? fs.existsSync(LAYOUT_FILE) : false;

// ---------------------------------------------------------------------------
process.stdout.write('\nthe harness runs in a real Electron renderer\n');
// ---------------------------------------------------------------------------
let electronPath = null;
try { electronPath = require('electron'); } catch { electronPath = null; }
assert(typeof electronPath === 'string' && electronPath.length > 0,
  'the repository\'s existing Electron dependency provides the executable (no new dependency)');
assert(fs.existsSync(HARNESS), 'the bootstrap harness entry point exists');

// ELECTRON_RUN_AS_NODE makes `electron` run as plain Node, so app.whenReady is undefined and the
// harness dies with a confusing stack. Strip it for the child only — never with setx.
const childEnv = Object.assign({}, process.env);
delete childEnv.ELECTRON_RUN_AS_NODE;

const run = spawnSync(electronPath, [HARNESS], {
  cwd: APP_DIR,
  env: childEnv,
  encoding: 'utf8',
  timeout: 120000,
  maxBuffer: 32 * 1024 * 1024,
});

let report = null;
let parseError = null;
try {
  const text = String(run.stdout || '');
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  report = (start >= 0 && end > start) ? JSON.parse(text.slice(start, end + 1)) : null;
} catch (e) { parseError = (e && e.message) || String(e); }

if (!report) {
  process.stderr.write(`  ✗ FAIL: the harness produced no parseable JSON report (${parseError || 'no output'})\n`);
  process.stderr.write(`  stdout: ${String(run.stdout || '').slice(0, 4000)}\n`);
  process.stderr.write(`  stderr: ${String(run.stderr || '').slice(0, 4000)}\n`);
  process.exit(1);
}

assert(run.status === 0, 'the harness exits 0');
assert(report.ok === true, 'the harness completed every stage');

// ---------------------------------------------------------------------------
process.stdout.write('\nthe classic-script chain PARSES and publishes every expected export\n');
// ---------------------------------------------------------------------------
const chain = report.chain || {};
const exps = chain.exports || {};
const fetched = (chain.results || []).filter((r) => r.fetched).map((r) => r.src);

assert((chain.results || []).length === 5, 'all five chain scripts were injected');
assert(fetched.length === 5, 'all five chain scripts were fetched');
assert(fetched.some((s) => s.includes('agent-dom')),
  'the PRE-EXISTING renderer script with a top-level `const api` is loaded FIRST (without it this gate proves nothing)');

assert(exps.agentDom === true, 'agent-dom.js published window.agentDom (its own top-level `const api` is live)');
assert(exps.dockview === true, 'the vendor UMD bundle published window.dockview.createDockview');
assert(exps.ccDockviewFitPolicy === true, 'dockview-fit-policy.js published window.ccDockviewFitPolicy');
assert(exps.ccDockviewPanelPolicy === true, 'dockview-panel-policy.js published window.ccDockviewPanelPolicy');
assert(exps.ccDockviewPrototype === true, 'dockview-prototype.js published window.ccDockviewPrototype.activate');
assert(exps.ccDockviewPrototypeBootstrap === true, 'the adapter also published bootstrap()');

// ---------------------------------------------------------------------------
process.stdout.write('\nno error of ANY kind reached the renderer\n');
// ---------------------------------------------------------------------------
const probe = (report.drive && report.drive.probe) || chain.probe || {};
const errors = probe.errors || [];
const rejections = probe.rejections || [];
const messages = (report.consoleMessages || []).map((m) => m.message);

assert(errors.length === 0, `window.onerror captured nothing (saw: ${JSON.stringify(errors).slice(0, 300)})`);
assert(rejections.length === 0, `no unhandledrejection (saw: ${JSON.stringify(rejections).slice(0, 300)})`);
assert(probe.requireTouched === false,
  'browser `require` was NEVER evaluated — the environment check short-circuits on `module` first');
assert(!messages.some((m) => /already been declared/i.test(m)),
  'no "Identifier ... has already been declared" — no module leaks a top-level lexical name');
assert(!messages.some((m) => /require is not defined/i.test(m)),
  'no "require is not defined"');
assert(!messages.some((m) => /SyntaxError/i.test(m)), 'no SyntaxError in the console');
assert(!messages.some((m) => /ReferenceError/i.test(m)), 'no ReferenceError in the console');
assert(!messages.some((m) => /TypeError/i.test(m)), 'no TypeError in the console');

// ---------------------------------------------------------------------------
process.stdout.write('\nevery bootstrap FAILURE path refuses without leaving an overlay\n');
// ---------------------------------------------------------------------------
const drive = report.drive || {};
const scenarios = drive.scenarios || [];
const byName = (n) => scenarios.find((s) => s.name === n);

const FAILURE_CASES = [
  ['missing-fit-policy', /^missing-exports:/, 'a missing fit-policy export'],
  ['missing-panel-policy', /^missing-exports:/, 'a missing panel-policy export'],
  ['missing-adapter', /^missing-exports:/, 'a missing adapter export'],
  ['missing-dockview-bundle', /^missing-exports:/, 'a missing vendor bundle'],
  ['activation-throws', /^activation-threw$/, 'activation throwing'],
  ['activation-refused', /^activation-refused/, 'activation returning {ok:false}'],
];

for (const [name, reasonPattern, label] of FAILURE_CASES) {
  const s = byName(name);
  assert(!!s, `${label}: the scenario ran`);
  if (!s) continue;
  assert(s.ok === false, `${label}: bootstrap refuses`);
  assert(reasonPattern.test(String(s.reason)), `${label}: the reason is the bounded code (${s.reason})`);
  assert(s.rootPresent === false, `${label}: NO prototype root is left in the DOM`);
  assert(s.instancePublished === false, `${label}: no partial instance is published`);
  assert(s.appSurfacePresent === true, `${label}: the existing app surface is still present`);
  assert(s.appSurfaceOnTop === true, `${label}: the app surface is UNOBSCURED (topmost at viewport centre)`);
}

// ---------------------------------------------------------------------------
process.stdout.write('\nrefusals are bounded and content-free\n');
// ---------------------------------------------------------------------------
const logs = drive.logs || [];
assert(logs.length > 0, 'the refusals were actually logged');
assert(!logs.some((l) => /synthetic/i.test(l)),
  'the thrown exception message is NEVER echoed (the synthetic error text does not appear)');
assert(!logs.some((l) => /\.js\b/.test(l)), 'no source file name appears in a refusal');
assert(!logs.some((l) => /[A-Za-z]:\\|\/\//.test(l)), 'no path or URL appears in a refusal');
assert(!logs.some((l) => /at \w+ \(/.test(l)), 'no stack frame appears in a refusal');
assert(logs.every((l) => l.length < 300), 'every log line is bounded in length');

// ---------------------------------------------------------------------------
process.stdout.write('\nno pane, PTY, layout file, or network request results from a failure\n');
// ---------------------------------------------------------------------------
const hostCalls = drive.hostCalls || {};
assert(hostCalls.createTerminalPane === 0, 'no terminal-creation function was called');
assert(hostCalls.createLibraryPane === 0, 'no Library-pane creation function was called');
assert(hostCalls.closePane === 0, 'no close/PTY-kill function was called');
assert(report.remoteRequestCount === 0, 'zero remote requests (every non-file request is cancelled)');
if (LAYOUT_FILE) {
  assert(fs.existsSync(LAYOUT_FILE) === layoutFileExisted,
    'the prototype layout file was neither created nor modified by the harness');
}

// ---------------------------------------------------------------------------
process.stdout.write('\nthe SUCCESS path renders the banner and all six controls\n');
// ---------------------------------------------------------------------------
const success = drive.success || {};
const successScenario = byName('success');
assert(!!successScenario && successScenario.ok === true, 'bootstrap reports success on the good path');
assert(success.rootPresent === true, 'the prototype root exists after a successful bootstrap');
assert(success.rootChildCount > 0, 'the prototype root is NOT an empty shell');
assert(success.instancePublished === true && success.instanceOk === true,
  'the adapter instance is published only on success');
assert(success.bannerText === 'DOCKVIEW PROTOTYPE — NOT PRODUCTION',
  `the persistent banner renders its exact text (saw: ${JSON.stringify(success.bannerText)})`);
assert(success.rootOnTop === true, 'a SUCCESSFUL prototype is the topmost surface, as intended');

// R5: the two ambiguous labels were renamed. "Use Default" read like a harmless view toggle
// while it actually created two live PTYs, and "Reset" read like it would reset the live
// workspace while it only ever deleted persisted metadata.
const EXPECTED_CONTROLS = ['Add Terminal', 'Add Library', 'Save Layout', 'Restore Layout', 'Create Default Workspace', 'Clear Saved Layout'];
const buttons = success.buttons || [];
assert(buttons.length === 6, `exactly six controls render (saw ${buttons.length})`);
for (const label of EXPECTED_CONTROLS) {
  assert(buttons.includes(label), `the "${label}" control is present in the rendered DOM`);
}

// ---------------------------------------------------------------------------
process.stdout.write('\nR5: the REAL Library surface, driven in a real renderer\n');
// ---------------------------------------------------------------------------
// Every assertion below runs against markup EXTRACTED FROM app/renderer/index.html at run time, not
// against a fixture maintained here. The harness throws if the section is missing, duplicated,
// nested, or short a canonical control, so this block cannot pass against a stand-in.
{
  const lib = (report && report.library) || {};
  assert(!lib.error, `the Library flow completed without error (saw: ${lib.error || 'none'})`);
  assert(lib.activated === true, 'the adapter activated against the real Library DOM');

  // PROOF 1 + 2 — the production selector resolves; the pre-R5 selector is the negative control.
  assert(lib.selectorResolves === true, 'the production selector #libraryPane resolves in a real renderer');
  assert(lib.legacySelectorResolves === false,
    'NEGATIVE CONTROL: the pre-R5 #libraryPanel resolves to nothing — the exact silent-null defect');

  const expectedControls = (report && report.libraryControlIds) || [];
  assert(expectedControls.length === 15, 'fifteen canonical Library controls are enumerated');
  assert((lib.controlsPresent || []).length === expectedControls.length,
    `every canonical control is present in the extracted section (saw ${(lib.controlsPresent || []).length}/${expectedControls.length})`);

  const step = (name) => ((lib.steps || []).find((x) => x.name === name) || {});

  // PROOF 3 — Add Library produces ONE visible panel holding the REAL controls.
  const add = step('add');
  assert(add.ok === true, 'Add Library succeeds against the real surface');
  assert(add.hostedInPanel === true, 'the Library is parented to a Dockview panel host');
  assert(add.controlsStillPresent === expectedControls.length,
    'all fifteen real controls survive the reparent (Refresh, filters, list, reader, Copy, Maximize, follow-up)');
  assert(add.sameElement === true, 'the docked node is the SAME singleton, not a clone');
  // Visible even though NO tab is active. The harness page carries the real `.tabpane{display:none}`
  // rule, so a non-zero box here means the docked-Library rule genuinely wins.
  assert(add.tabActiveClass === false, 'the Library tab is NOT active during this check');
  assert(add.height > 0 && add.width > 0,
    `the docked Library is visible anyway (${add.width}x${add.height}) — display:none was overridden`);

  // PROOF 5 — a duplicate Add focuses instead of duplicating.
  const dup = step('duplicate');
  assert(dup.ok === false && dup.reason === 'library-already-open', 'a duplicate Add reports library-already-open');
  assert(dup.focused === true, 'it focused the existing panel via panel.api.setActive()');
  assert(dup.panelCount === 1, 'there is still exactly ONE Library element in the document');
  assert(dup.ownedLibraryCount === 1, 'ownership was not duplicated');

  // PROOF 4 — close returns the IDENTICAL element to its EXACT original position.
  const close = step('close');
  assert(close.sameElement === true, 'closing returns the identical element object (not a clone)');
  assert(close.backInStrip === true, 'it is back inside the original tab strip');
  assert(close.homeIndexAfter === lib.homeIndexBefore,
    `it is at its EXACT original index (${lib.homeIndexBefore} -> ${close.homeIndexAfter})`);
  assert(close.controlsIntact === expectedControls.length, 'all fifteen controls survive the round trip');
  assert(close.owned === false, 'adapter ownership was released');

  // Re-adding after a close must work.
  const readd = step('readd');
  assert(readd.ok === true, 're-adding the Library after closing it succeeds');
  assert(readd.sameElement === true, 'the re-added Library is still the same singleton');
  assert(readd.owned === true, 'it is owned again');
}

// ---------------------------------------------------------------------------
process.stdout.write('\nR6: the app-owned audio controls are reachable in prototype mode\n');
// ---------------------------------------------------------------------------
// Every assertion below runs against `.tts-controls` EXTRACTED FROM app/renderer/index.html at run
// time — the same element production ships, with the same seven IDs — not a fixture maintained
// here. The harness throws if that surface is missing, duplicated, or short a control.
{
  const aud = (report && report.audio) || {};
  const install = (report && report.audioInstall) || {};
  const expected = (report && report.audioControlIds) || [];
  const step = (name) => ((aud.steps || []).find((x) => x.name === name) || {});

  assert(!aud.error, `the audio flow completed without error (saw: ${aud.error || 'none'})`);
  assert(expected.length === 7, 'seven canonical audio controls are enumerated');

  // PROOF 1 — exactly one genuine surface, carrying all seven canonical IDs.
  assert(install.installed === true, 'the genuine .tts-controls surface was installed from index.html');
  assert(install.count === 1, `exactly ONE .tts-controls surface exists (saw ${install.count})`);
  assert((install.controlsPresent || []).length === 7,
    `all seven canonical controls are present (saw ${(install.controlsPresent || []).length}/7)`);
  assert(aud.surfaceCount === 1, 'still exactly one surface when the flow begins');

  // NEGATIVE CONTROL — reproduce the human-acceptance failure LIVE before proving the fix.
  const neg = step('negative-control');
  assert(neg.micPresent === true, 'NEGATIVE CONTROL: #sttMic is present in the DOM the whole time');
  assert(neg.micInsideRoot === false,
    'NEGATIVE CONTROL: pre-correction, #sttMic is OUTSIDE the prototype root');
  assert(neg.micReachable === false,
    'NEGATIVE CONTROL: pre-correction, #sttMic is covered by the full-screen overlay and unreachable');
  assert(neg.audioReachable === false,
    'NEGATIVE CONTROL: the whole .tts-controls surface is unreachable behind the overlay');

  // PROOF 2 — activation reparents that exact object into the visible prototype slot.
  const act = step('activated');
  assert(act.slotPresent === true, 'the prototype builds a dedicated audio slot');
  assert(act.inSlot === true, 'the genuine .tts-controls is parented to that slot');
  assert(act.insideRoot === true, 'it is inside the prototype root — no longer behind it');
  assert(act.sameElement === true, 'it is the SAME element object, not a clone');
  assert(act.sameMic === true, 'the #sttMic node is the identical object it was before the move');
  assert(act.surfaceCount === 1, 'still exactly ONE .tts-controls in the document — nothing was duplicated');
  assert(act.controlsPresent === 7, 'all seven controls survive the reparent');
  assert(act.micReachable === true,
    'THE CORRECTION: the genuine #sttMic is now the topmost element at its own centre — clickable');
  assert(act.audioReachable === true, 'the whole audio surface is reachable inside the prototype');

  // PROOF 3 — handlers bound BEFORE the move still fire, exactly once.
  assert(act.micClicks === 1,
    `a listener bound before the move fires exactly once after it (saw ${act.micClicks})`);

  // PROOF 4 — discoverable by ID, so late ccSTT/ccTTS initialization can still wire it.
  assert(act.discoverableById === true,
    'every control is still findable by getElementById after the move (late STT/TTS wiring works)');

  // PROOF 5 — status text, recording class, Stop visibility, voice and speed all survive.
  assert(act.sttStatusText === 'recording', 'STT status text survives the move');
  assert(act.ttsStatusText === 'speaking', 'TTS status text survives the move');
  assert(act.micHasRecClass === true, 'the recording class survives the move');
  assert(act.stopVisible === true, 'Stop visibility state survives the move');
  assert(act.voiceValue === 'af_heart', 'the selected voice survives the move');
  assert(act.speedValue === '1.5', 'the selected speed survives the move');
  assert(act.diagnosticsDocked === true, 'diagnostics report the controls as docked');

  // PROOF 6 — splitting panes cannot hide the controls: the slot is outside the Dockview surface.
  const split = step('after-split');
  assert(split.micReachable === true, 'after splitting into two panes, #sttMic is still reachable');
  assert(split.sameMic === true, 'and it is still the identical node');
  assert(split.stillInSlot === true, 'the controls never entered a Dockview panel');

  // PROOF 7 — disposal returns the same object to its exact original index.
  const dis = step('disposed');
  assert(dis.sameElement === true, 'disposal returns the identical element object');
  assert(dis.sameMic === true, 'and the identical #sttMic node');
  assert(dis.backInBar === true, 'it is back inside the original toolbar');
  assert(dis.homeIndexAfter === aud.homeIndexBefore,
    `at its EXACT original index (${aud.homeIndexBefore} -> ${dis.homeIndexAfter})`);
  assert(dis.surfaceCount === 1, 'still exactly one surface after the round trip');
  assert(dis.controlsPresent === 7, 'all seven controls survive the round trip');
  assert(dis.micClicks === 1, 'the pre-move listener still fires exactly once after restoration');
  assert(dis.voiceValue === 'af_heart' && dis.speedValue === '1.5', 'voice and speed survive the round trip');
  assert(dis.placeholderGone === true, 'the placeholder was consumed — no marker left behind');

  // PROOF 8 — an activation failure leaves the normal renderer intact.
  const fail = step('activation-failure');
  assert(fail.audioInBar === true, 'after a failed activation the controls are still in the toolbar');
  assert(fail.audioIndex === aud.homeIndexBefore, 'at their original index');
  assert(fail.audioConnected === true, 'and still connected to the document');
  assert(fail.surfaceCount === 1, 'no duplicate surface was created by the failure');
  assert(fail.stillDocked === false, 'no dangling docked state');
  assert(fail.placeholderLeft === false, 'no orphan placeholder comment was left in the toolbar');

  // PROOF 9 — the bootstrap-level net: a refusal AFTER movement restores before removing the root.
  const boot = step('bootstrap-refusal-after-move');
  assert(boot.wasStranded === true, 'the controls really were inside a prototype root before this refusal');
  assert(boot.refused === true, `the bootstrap refused (${boot.reason})`);
  assert(boot.sameElement === true, 'the identical element was rescued');
  assert(boot.audioInBar === true, 'a refusal after movement returns the controls to the toolbar');
  assert(boot.audioIndex === aud.homeIndexBefore, 'at their exact original index');
  assert(boot.audioConnected === true, 'they are connected, not detached and lost');
  assert(boot.surfaceCount === 1, 'exactly one surface remains');
  assert(boot.stillDocked === false, 'the dock bookkeeping was cleared');
}

// ---------------------------------------------------------------------------
process.stdout.write('\nR6: missing or duplicated audio controls refuse visibly\n');
// ---------------------------------------------------------------------------
{
  const byName = (n) => ((report.drive && report.drive.scenarios) || []).find((s) => s.name === n) || {};
  for (const [name, reason] of [
    ['missing-audio-controls', 'audio-controls-missing'],
    ['duplicated-audio-controls', 'audio-controls-duplicated'],
  ]) {
    const s = byName(name);
    assert(s.ok === false, `${name}: activation refuses`);
    assert(s.reason === `activation-refused:${reason}`, `${name}: the bounded reason is ${reason} (saw ${s.reason})`);
    assert(s.rootPresent === false, `${name}: no opaque overlay is left behind`);
    assert(s.instancePublished === false, `${name}: no instance is published`);
    assert(s.appSurfaceOnTop === true, `${name}: the normal app surface is usable and unobscured`);
    assert(s.audioConnected === true, `${name}: the audio controls remain connected`);
    assert(s.audioInTermBar === true, `${name}: and remain in the normal toolbar`);
    assert(s.audioCount === 1, `${name}: exactly one surface remains`);
  }

  // Every OTHER failure scenario must also leave the audio surface untouched and at home.
  for (const s of (report.drive && report.drive.scenarios) || []) {
    if (s.name === 'success') continue;
    assert(s.audioCount === 1, `${s.name}: exactly one audio surface remains`);
    assert(s.audioConnected === true, `${s.name}: the audio surface is never left detached`);
    assert(s.audioStillDocked === false, `${s.name}: no dangling docked state after the scenario`);
  }
}

process.stdout.write(`\ndockview-bootstrap: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
