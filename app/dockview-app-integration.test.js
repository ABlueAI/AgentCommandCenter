'use strict';
// Run: node app/dockview-app-integration.test.js
//
// THE PRODUCTION-TRUTH GATE for the Dockview layout engine.
//
// Every claim here is measured in a REAL Electron renderer running the REAL `renderer/index.html`
// through the REAL `preload.js` and the REAL `app.js` — see `dockview-app-harness.js` for why the
// only substituted part is main, and why counting `pty-start` / `pty-kill` at the IPC boundary is
// the only honest way to prove "no PTY was started" and "the PTY was killed exactly once".
//
// It deliberately does NOT re-assert source shape. `dockview-default-path.test.js` pins the code
// structure that makes these properties cheap to keep true; this file pins that they ARE true.
//
// The claims, in the work order's own terms:
//   * normal start selects Dockview;
//   * `start:classic` selects the grid and exposes no layout operations;
//   * the dock is EMBEDDED (`#terminalDock`), never a full-screen overlay;
//   * no audio-control movement;
//   * the classic grid survives every bootstrap refusal;
//   * pre-existing panes adopt all-or-nothing;
//   * new-pane adoption is pre-PTY and transactional;
//   * Library navigation adds/focuses the singleton;
//   * close convergence kills once;
//   * maximize routes by ownership;
//   * hosted/global resize ownership does not overlap;
//   * rollback restores grid resizing;
//   * the acceptance diagnostic is read-only and is never consumed as authority.

const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

let passed = 0, failed = 0;
function assert(cond, label) {
  if (cond) { process.stdout.write(`  ✓ ${label}\n`); passed++; }
  else { process.stderr.write(`  ✗ FAIL: ${label}\n`); failed++; }
}

const APP_DIR = __dirname;
const HARNESS = path.join(APP_DIR, 'dockview-app-harness.js');

// ---------------------------------------------------------------------------
process.stdout.write('\nthe application harness runs in a real Electron renderer\n');
// ---------------------------------------------------------------------------
let electronPath = null;
try { electronPath = require('electron'); } catch { electronPath = null; }
assert(typeof electronPath === 'string' && electronPath.length > 0,
  'the repository\'s existing Electron dependency provides the executable (no new dependency)');
assert(fs.existsSync(HARNESS), 'the application harness entry point exists');

// ELECTRON_RUN_AS_NODE makes `electron` run as plain Node, so app.whenReady is undefined and the
// harness dies with a confusing stack. Strip it for the child only — never with setx.
const childEnv = Object.assign({}, process.env);
delete childEnv.ELECTRON_RUN_AS_NODE;

const run = spawnSync(electronPath, [HARNESS], {
  cwd: APP_DIR,
  env: childEnv,
  encoding: 'utf8',
  timeout: 600000,
  maxBuffer: 64 * 1024 * 1024,
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
  process.stderr.write(`  stderr: ${String(run.stderr || '').slice(0, 8000)}\n`);
  process.exit(1);
}

assert(run.status === 0, `the harness exits 0 (saw ${run.status})`);
assert(report.ok === true, `every scenario completed (fatal: ${JSON.stringify(report.fatal)})`);

const S = report.scenarios || {};
const EXPECTED_SCENARIOS = [
  'production', 'classic', 'scriptRefusal', 'adoptionRollback', 'newPaneTransaction',
  'startFailure', 'library', 'maximize', 'closeConvergence', 'diagnostic',
];
for (const name of EXPECTED_SCENARIOS) {
  assert(!!S[name], `the ${name} scenario is present in the report`);
}
// A missing scenario must not make the rest of this file silently vacuous.
if (EXPECTED_SCENARIOS.some((n) => !S[n])) {
  process.stderr.write('  ✗ FATAL: a scenario is missing; the assertions below would prove nothing\n');
  process.exit(1);
}

// ---------------------------------------------------------------------------
process.stdout.write('\nA NORMAL LAUNCH selects Dockview — no flag, no opt-in\n');
// ---------------------------------------------------------------------------
{
  const p = S.production;
  const st = p.state;
  assert(p.settled.settled === true, 'the layout engine reached a settled state');
  assert(/production layout engine active \(dockview 7\.0\.4\)/.test(st.logs),
    'the Logs tab says the production layout engine is active, naming the pinned version');
  assert(st.bridgeEnabled === true, 'the real preload published ccDockview.enabled === true');
  assert(st.bridgeFrozen === true, 'the bridge object is frozen');
  assert(JSON.stringify(st.bridgeKeys) === JSON.stringify(['enabled', 'loadLayout', 'resetLayout', 'saveLayout']),
    `the bridge exposes exactly the four production members (saw ${JSON.stringify(st.bridgeKeys)})`);
  assert(st.dockviewGlobalLoaded === true, 'the vendor bundle was loaded');
  assert(st.adapterLoaded && st.fitPolicyLoaded && st.panelPolicyLoaded,
    'the adapter and both policy modules published their exports');
  assert(st.dockviewScriptTags.length === 4,
    `exactly four Dockview scripts were injected (saw ${st.dockviewScriptTags.length})`);
  assert(st.diagnosticsActive === true, 'the engine reports itself active');
  assert(st.errors.length === 0, `no window error reached the renderer (saw ${JSON.stringify(st.errors)})`);
  assert(st.rejections.length === 0, `no unhandled rejection (saw ${JSON.stringify(st.rejections)})`);

  // THE VISIBLE WORKSPACE
  assert(st.dockHidden === false, 'the embedded dock is the visible terminal surface');
  assert(st.gridHidden === true, 'the classic grid is hidden — but still present, never destroyed');
  assert(st.dockChildren > 0, 'the dock is not an empty shell');
  assert(p.layoutIpc.save === 0 && p.layoutIpc.load === 0 && p.layoutIpc.reset === 0,
    'starting up neither saves, loads, nor resets any layout state (Phase C is not wired)');
}

// ---------------------------------------------------------------------------
process.stdout.write('\nthe dock is EMBEDDED, not a full-screen overlay\n');
// ---------------------------------------------------------------------------
{
  const st = S.production.state;
  assert(st.dockPosition === 'static',
    `#terminalDock is in normal flow (position: ${st.dockPosition}) — the prototype's position:fixed is gone`);
  assert(st.dockZIndex === 'auto', `#terminalDock has no stacking override (z-index: ${st.dockZIndex})`);
  assert(st.dockCoversViewport === false, 'the dock does not span the viewport from the top edge');
  assert(st.dockBelowBar === true,
    `the dock starts below the terminal toolbar (dock y=${st.dockBox.y}, bar bottom=${st.barBox.y + st.barBox.h})`);
  assert(st.barBox.h > 0 && st.barBox.w > 0, 'the terminal toolbar itself is laid out and non-zero');
}

// ---------------------------------------------------------------------------
process.stdout.write('\nthe app-owned audio controls do not move, and stay reachable\n');
// ---------------------------------------------------------------------------
{
  const st = S.production.state;
  assert(st.audioCount === 1, `exactly one .tts-controls surface exists (saw ${st.audioCount})`);
  assert(st.audioInBar === true, 'it is still a direct child of the Terminals toolbar');
  assert(st.audioIndex === 2, `at its original index in that toolbar (saw ${st.audioIndex})`);
  // The prototype's kill criterion, measured rather than asserted: is #sttMic the topmost element
  // at its own centre? With a full-screen overlay it is not, and Dictate is unclickable.
  assert(st.micReachable === true,
    'THE R6 REGRESSION: #sttMic is the topmost element at its own centre — Dictate is clickable');
  const classicSt = S.classic.state;
  assert(classicSt.audioInBar === true && classicSt.audioIndex === st.audioIndex,
    'classic recovery mode places the audio controls identically — the engine cannot move them');
}

// ---------------------------------------------------------------------------
process.stdout.write('\nstart:classic selects the grid and exposes NO layout operation\n');
// ---------------------------------------------------------------------------
{
  const c = S.classic;
  const st = c.state;
  assert(/CLASSIC RECOVERY MODE ACTIVE/.test(st.logs), 'recovery mode announces itself in the Logs tab');
  assert(st.bridgeEnabled === false, 'the real preload published ccDockview.enabled === false');
  assert(JSON.stringify(st.bridgeKeys) === JSON.stringify(['enabled']),
    `the bridge exposes ONLY the boolean (saw ${JSON.stringify(st.bridgeKeys)})`);
  assert(st.bridgeHasSave === false && st.bridgeHasLoad === false && st.bridgeHasReset === false,
    'saveLayout / loadLayout / resetLayout are ABSENT, not merely inert');
  assert(c.forged.called === 'undefined', 'a forged call finds nothing to reach');

  assert(st.dockHidden === true, '#terminalDock stays hidden');
  assert(st.gridHidden === false, 'the classic grid is the visible workspace');
  assert(st.dockChildren === 0, 'nothing was ever built inside the dock');
  assert(st.dockviewGlobalLoaded === false, 'window.dockview does not exist — the bundle was never fetched');
  assert(st.adapterLoaded === false && st.fitPolicyLoaded === false && st.panelPolicyLoaded === false,
    'no adapter and no policy module was loaded');
  assert(st.dockviewScriptTags.length === 0,
    `NOT ONE Dockview script tag was created (saw ${JSON.stringify(st.dockviewScriptTags)})`);
  assert(st.diagnosticsPresent === false, 'no layout diagnostic surface exists in recovery mode');

  assert(c.afterCreate.paneCount === 1 && c.afterCreate.paneInGrid === true,
    'a new terminal lands in the classic grid');
  assert(c.afterCreate.paneVisible === true, 'and is visible and reachable');
  assert(JSON.stringify(c.ptyStart) === JSON.stringify(['pty1']), 'exactly one PTY was started');
  assert(c.ptyKill.length === 0, 'and none was killed');
  assert(c.maximize.gridHasMaximized === true && c.maximize.paneMaximized === true,
    'maximize still routes to the CLASSIC grid maximizer in recovery mode');
}

// ---------------------------------------------------------------------------
process.stdout.write('\nthe classic grid survives a bootstrap refusal, in the same process\n');
// ---------------------------------------------------------------------------
{
  const r = S.scriptRefusal;
  const st = r.state;
  assert(/\[dockview\] REFUSED: script-load-failed/.test(st.logs),
    'a script that never arrives produces the bounded script-load-failed refusal');
  assert(st.dockHidden === true, 'the dock is left hidden');
  assert(st.dockChildren === 0, 'and empty — no half-built surface survives');
  assert(st.gridHidden === false, 'the classic grid is the visible workspace');
  assert(st.diagnosticsPresent === false, 'no diagnostic surface is published for an engine that never started');
  assert(st.micReachable === true, 'the audio controls remain reachable after the refusal');
  assert(r.afterCreate.paneCount === 1 && r.afterCreate.paneInGrid === true,
    'a terminal created AFTER the refusal works, and lands in the grid');
  assert(r.afterCreate.paneVisible === true, 'and is visible');
  assert(JSON.stringify(r.ptyStart) === JSON.stringify(['pty1']),
    'the refusal path starts exactly one PTY — the one the user asked for');
  assert(r.ptyKill.length === 0, 'and kills none');
  assert(st.errors.length === 0 || st.errors.every((e) => /dockview-panel-policy/.test(e)),
    `the only error is the deliberately cancelled script (saw ${JSON.stringify(st.errors)})`);
}

// ---------------------------------------------------------------------------
process.stdout.write('\ngrid owner -> Dockview owner -> failed multi-pane adoption -> grid owner\n');
// ---------------------------------------------------------------------------
{
  const r = S.adoptionRollback;
  // STAGE 1 — two panes created while the vendor bundle was still in flight. The real startup race.
  assert(r.stage1.panes === 2, `two panes exist before the engine starts (saw ${r.stage1.panes})`);
  assert(r.stage1.inGrid === true, 'both are in the classic grid');
  assert(r.stage1.engineActive === false, 'the engine has not started yet');
  assert(r.stage1.boxes.every((b) => b.w > 0 && b.h > 0), 'both are laid out with a real size');
  // ONE resize per pane: the app's own grid observer is the single owner at this stage.
  assert(r.stage1Resizes === 2,
    `a geometry change produces exactly one pty-resize per grid-owned pane (saw ${r.stage1Resizes} for 2 panes)`);

  // STAGE 2 -> 3 — the first pane IS adopted (Dockview owner) and then rolled back with the second.
  const logs = r.stage3.logs || '';
  assert(/adopt REFUSED for pty2: add-panel-failed/.test(logs), 'the second pane fails to adopt, by name');
  assert(/rolling back 1 adopted pane\(s\)/.test(logs),
    'the log states that one pane HAD been adopted and is being rolled back — stage 2 really happened');
  assert(/no PTY was created or killed/.test(logs), 'and that the rollback touched no PTY');
  assert(/REFUSED: pane-adoption-failed/.test(logs), 'the engine then refuses as a whole');

  // STAGE 4 — grid owner again, fully.
  assert(r.stage3.panes === 2, 'both panes still exist — all-or-nothing rolled back, it did not close anything');
  assert(r.stage3.allBackInGrid === true, 'both are back in the classic grid');
  assert(r.stage3.anyInDock === false, 'neither is left in the dock');
  assert(r.stage3.anyDetached === false, 'neither was left detached from the document');
  assert(r.stage3.panesVisible === true, 'both are visible and reachable');
  assert(r.stage3.gridHidden === false && r.stage3.dockHidden === true, 'the grid is the visible surface again');
  assert(r.stage3.dockChildren === 0, 'the dock was emptied — no orphan Dockview surface survives');
  assert(r.stage3.engineActive === false, 'the engine is not active');
  assert(JSON.stringify(r.ptyStart) === JSON.stringify(['pty1', 'pty2']),
    'exactly the two PTYs the user asked for were started');
  assert(r.ptyKill.length === 0, 'and the rollback killed none');

  // THE DEFECT THIS STAGE EXISTS FOR. Adoption disconnects the app's grid observer; the rollback
  // must reconnect it. Zero here means the pane silently stopped resizing forever; four would mean
  // two owners per pane.
  assert(r.stage3Resizes === 2,
    `after the rollback a geometry change again produces exactly one pty-resize per pane — not zero `
    + `(no owner) and not two per pane (both owners). Saw ${r.stage3Resizes} for 2 panes`);
}

// ---------------------------------------------------------------------------
process.stdout.write('\nhosted and grid resize ownership never overlap\n');
// ---------------------------------------------------------------------------
{
  const owners = S.production.afterCreate.resizeOwners;
  assert(Array.isArray(owners) && owners.length === 1, 'one live pane is reported');
  assert(owners[0].fitController === true, 'a hosted pane is owned by the gated fit controller');
  assert(owners[0].appObserver === false, 'and the app\'s ungated grid observer is suspended for it');
  assert(owners.every((o) => o.appObserver !== o.fitController),
    'exactly one owner per pane — never both, never neither');

  const two = S.maximize.restored.resizeOwners;
  assert(two.length === 2 && two.every((o) => o.fitController === true && o.appObserver === false),
    'the same holds for two hosted panes, after a maximize/restore cycle');

  // A hosted pane's single owner has a fixed signature: xterm's own onResize plus the controller's
  // post-fit send. It is pinned so a future change to either cannot pass unnoticed.
  assert(S.production.dockedResizes === 2,
    `a geometry change on one hosted pane produces the gated controller's two-message signature `
    + `(xterm onResize + the post-fit send). Saw ${S.production.dockedResizes}`);
}

// ---------------------------------------------------------------------------
process.stdout.write('\nnew-pane adoption is PRE-PTY and transactional (delayed IPC)\n');
// ---------------------------------------------------------------------------
{
  const t = S.newPaneTransaction;
  assert(JSON.stringify(t.baseline.ptyStart) === JSON.stringify(['pty1']),
    'the healthy pane before the failure started exactly one PTY');
  assert(/REFUSED to dock pty2: add-panel-failed/.test(t.after.logs),
    'the refused dock is reported visibly, by bounded reason');
  assert(/NO terminal process was started/.test(t.after.logs),
    'and the refusal states that no process was started');

  // THE FOUR ZEROS the work order names. `pty-start` is delayed 400ms in this scenario, which is
  // exactly the window the old "start, fail to dock, immediately kill" ordering raced inside.
  assert(JSON.stringify(t.ptyStart) === JSON.stringify(['pty1']),
    `ZERO ptyStart for the refused pane (saw ${JSON.stringify(t.ptyStart)})`);
  assert(t.ptyKill.length === 0, `ZERO ptyKill (saw ${JSON.stringify(t.ptyKill)})`);
  assert(t.after.live === 1 && JSON.stringify(t.after.liveIds) === JSON.stringify(['pty1']),
    `ZERO live panes beyond the healthy one (saw ${JSON.stringify(t.after.liveIds)})`);
  assert(JSON.stringify(t.after.panels) === JSON.stringify(['pty1']),
    `ZERO Dockview panels for the refused pane (saw ${JSON.stringify(t.after.panels)})`);

  assert(t.after.panesInGrid === 0, 'no pane was parked in the hidden classic grid');
  assert(t.after.panesInDock === 1, 'the dock holds only the one healthy pane');
  assert(t.after.emptyPanelHosts === 0, 'no empty panel shell was left behind');
  assert(JSON.stringify(t.after.owned) === JSON.stringify(['pty1']), 'ownership is unchanged');
}

// ---------------------------------------------------------------------------
process.stdout.write('\na PTY that refuses to start takes its panel and pane with it\n');
// ---------------------------------------------------------------------------
{
  const f = S.startFailure;
  assert(JSON.stringify(f.ptyStart) === JSON.stringify(['pty1']), 'ptyStart was invoked exactly once');
  assert(/\[pty\] start FAILED for pty1/.test(f.after.logs), 'the failure is reported visibly');
  assert(/removing the pane and its layout panel/.test(f.after.logs),
    'and says what it is doing about it');
  assert(f.after.panes === 0, 'no pane element survives');
  assert(f.after.live === 0, 'no live terminal survives');
  assert(JSON.stringify(f.after.panels) === JSON.stringify([]), 'no Dockview panel survives — no ghost');
  assert(JSON.stringify(f.after.owned) === JSON.stringify([]), 'no ownership survives');
  assert(f.after.ghostHosts === 0, 'no empty panel host survives');
  assert(JSON.stringify(f.ptyKill) === JSON.stringify(['pty1']),
    'exactly one kill is issued — the belt-and-braces guarantee that no process outlives a failed start');
}

// ---------------------------------------------------------------------------
process.stdout.write('\nLibrary navigation adds, focuses, and never duplicates the singleton\n');
// ---------------------------------------------------------------------------
{
  const L = S.library;
  assert(L.homeIndexBefore.parentTag === 'MAIN', 'the Library starts in the tab strip');

  assert(L.open.sameElement === true, 'clicking Library docks the SAME element — never a clone');
  assert(L.open.count === 1, 'there is exactly one #libraryPane in the document');
  assert(L.open.hostedInPanel === true, 'it is parented to a Dockview panel host');
  assert(L.open.inDock === true, 'inside the embedded dock');
  assert(L.open.terminalsTabActive === true,
    'and the Terminals workspace is activated — the Library lives there while docked');
  assert(L.open.visible === true, 'the docked Library is visible: ⟳ Refresh is reachable');
  assert(L.open.box.w > 0 && L.open.box.h > 0,
    `it has a real box despite .tabpane{display:none} (${L.open.box.w}x${L.open.box.h})`);
  assert(L.open.controls === 15, `all fifteen canonical controls survive the move (saw ${L.open.controls})`);
  assert(JSON.stringify(L.open.panels) === JSON.stringify(['library']), 'exactly one panel exists');
  assert(L.libraryListCalls.afterOpen === 1,
    'opening the Library for the first time runs the existing first-load scan exactly once');

  assert(L.again.count === 1, 'clicking Library again creates NO second element');
  assert(L.again.libraryPanels === 1, 'and no second panel');
  assert(L.again.ownedLibrary === 1, 'and no duplicate ownership');
  assert(L.again.sameElement === true, 'it is still the same singleton');
  assert(L.libraryListCalls.afterSecond === 1, 'and the first-load scan does not run a second time');

  assert(L.closed.sameElement === true, 'closing returns the IDENTICAL element object');
  assert(L.closed.parentTag === 'MAIN' && L.closed.index === L.homeIndexBefore.index,
    `to its EXACT original position (${L.homeIndexBefore.index} -> ${L.closed.index})`);
  assert(L.closed.backOutOfDock === true, 'and out of the dock');
  assert(L.closed.controls === 15, 'with all fifteen controls intact');
  assert(L.closed.placeholderLeft === false, 'the position placeholder was consumed, not left behind');
  assert(JSON.stringify(L.closed.owned) === JSON.stringify([]), 'adapter ownership was released');
  // The handler probe is the real proof that no clone happened: ⟳ Refresh was bound before the
  // round trip and must still reach main afterwards.
  assert(L.libraryListCalls.afterHandlerProbe === L.libraryListCalls.afterSecond + 1,
    'a handler bound BEFORE the round trip still fires on the returned element');

  assert(L.reopened.sameElement === true, 're-opening docks the same singleton again');
  assert(L.reopened.count === 1, 'still exactly one');
  assert(L.reopened.hostedInPanel === true, 'hosted in a panel again');
  assert(L.reopened.visible === true, 'and visible again');
  assert(JSON.stringify(L.reopened.owned) === JSON.stringify(['library']), 'and owned again');
}

// ---------------------------------------------------------------------------
process.stdout.write('\nmaximize routes by OWNERSHIP — the two mechanisms never both run\n');
// ---------------------------------------------------------------------------
{
  const M = S.maximize;
  assert(M.split.groups === 2, 'the two hosted panes are in separate groups, so a sibling is visible');
  assert(M.before.boxes.pty1.w > 0 && M.before.boxes.pty2.w > 0, 'both panes are visible before maximizing');
  assert(M.before.hasMaximizedGroup === false, 'nothing is maximized yet');
  assert(M.before.glyphs.pty1 === '⛶' && M.before.glyphs.pty2 === '⛶', 'both buttons offer Maximize');

  assert(M.maximized.hasMaximizedGroup === true, 'clicking ⛶ on a hosted pane maximizes its Dockview group');
  assert(M.maximized.boxes.pty1.w > M.before.boxes.pty1.w,
    `the maximized pane grew to the whole surface (${M.before.boxes.pty1.w} -> ${M.maximized.boxes.pty1.w})`);
  assert(M.maximized.boxes.pty2.w <= 2,
    `the sibling collapsed (${M.before.boxes.pty2.w} -> ${M.maximized.boxes.pty2.w})`);
  // THE ROUTING CLAIM: the classic maximizer left no trace, so it did not also run.
  assert(M.maximized.gridHasMaximized === false,
    'the classic grid did NOT gain `has-maximized` — the grid maximizer was not invoked');
  assert(M.maximized.paneHasMaximizedClass === false,
    'and the pane did NOT gain the classic `maximized` class');
  assert(M.maximized.glyphs.pty1 === '🗗', 'the maximized pane\'s button offers Restore');
  assert(M.maximized.glyphs.pty2 === '⛶', 'the sibling\'s button still offers Maximize');
  assert(!/maximize REFUSED/.test(M.maximized.logs), 'no refusal was logged on the success path');

  assert(M.restored.hasMaximizedGroup === false, 'clicking again exits the maximized group');
  assert(M.restored.boxes.pty1.w === M.before.boxes.pty1.w
      && M.restored.boxes.pty2.w === M.before.boxes.pty2.w,
    'both panes return to their previous geometry');
  assert(M.restored.glyphs.pty1 === '⛶' && M.restored.glyphs.pty2 === '⛶', 'both glyphs are back to Maximize');
  assert(M.restored.gridHasMaximized === false, 'the classic grid was never touched at any point');
}

// ---------------------------------------------------------------------------
process.stdout.write('\nclose convergence kills exactly once, from either direction\n');
// ---------------------------------------------------------------------------
{
  const C = S.closeConvergence;
  assert(C.killsAfterX.length === 1, `the pane's own ✕ kills exactly one PTY (saw ${JSON.stringify(C.killsAfterX)})`);
  assert(C.viaX.panels.length === 1, 'and removes its Dockview panel — no ghost panel is left');
  assert(C.viaX.owned.length === 1 && C.viaX.live === 1, 'one pane remains owned and live');

  assert(C.killsAfterPanel.length === 1,
    `removing the Dockview panel kills exactly one PTY (saw ${JSON.stringify(C.killsAfterPanel)})`);
  assert(C.viaPanel.panels.length === 0 && C.viaPanel.owned.length === 0, 'nothing is left owned');
  assert(C.viaPanel.live === 0, 'no live terminal remains');
  assert(C.viaPanel.emptyState === true, 'the app shows its own empty state again');
  assert(C.allKills.length === 2 && new Set(C.allKills).size === 2,
    `two panes, two distinct kills, no double-kill (saw ${JSON.stringify(C.allKills)})`);
}

// ---------------------------------------------------------------------------
process.stdout.write('\nthe acceptance diagnostic is read-only and is never an authority\n');
// ---------------------------------------------------------------------------
{
  const d = S.diagnostic.probe;
  assert(d.frozen === true, 'the diagnostic object is frozen');
  assert(d.writable === false, 'its window property is non-writable');
  assert(d.configurable === false, 'and non-configurable');
  assert(d.enumerable === false, 'and non-enumerable, so it does not advertise itself');
  assert(d.stillOriginal === true, 'assigning over it does not replace it');
  assert(d.redefineThrew === true, 'redefining it throws');
  assert(d.snapshotStillFunction === true, 'and its members cannot be swapped for a lie');

  // NOT AN AUTHORITY: nothing in the shipped renderer reads it. Removing it would change no
  // behaviour, which is the only real test of whether a diagnostic has become load-bearing.
  const appSrc = fs.readFileSync(path.join(APP_DIR, 'renderer', 'app.js'), 'utf8');
  const reads = (appSrc.match(/ccDockviewDiagnostics/g) || []).length;
  assert(reads === 1, `app.js names ccDockviewDiagnostics exactly once — where it DEFINES it (saw ${reads})`);
  for (const file of ['renderer/dockview-prototype.js', 'renderer/dockview-fit-policy.js',
    'renderer/dockview-panel-policy.js', 'preload.js', 'main.js']) {
    assert(!fs.readFileSync(path.join(APP_DIR, file), 'utf8').includes('ccDockviewDiagnostics'),
      `${file} never reads the diagnostic surface`);
  }
}

// ---------------------------------------------------------------------------
process.stdout.write('\nthe whole application run makes ZERO remote requests\n');
// ---------------------------------------------------------------------------
{
  assert(report.remoteRequestCount === 0,
    `zero non-file requests across every scenario (saw ${report.remoteRequestCount}: ${JSON.stringify(report.requests)})`);
  const bad = (report.consoleMessages || []).filter((m) => /SyntaxError|ReferenceError|already been declared|require is not defined/.test(m.message));
  assert(bad.length === 0, `no parse-time or scope error in any renderer (saw ${JSON.stringify(bad.slice(0, 3))})`);
}

process.stdout.write(`\ndockview-app-integration: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
