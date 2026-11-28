'use strict';
// Run: node app/aquarium-app-integration.test.js
//
// S20's end-to-end gate (docs/DESIGN-BRIEF-1.1.md section 9, "S20"), measured in a REAL Electron
// renderer running the real index.html, preload.js, app.js, shell-nav.js, aquarium.js and
// aquarium-engine.js (aquarium-app-harness.js; only main is stubbed). It checks: one creature per
// live pane, of the species its role gives; each creature shows the right colour on the canvas
// within about 2 seconds of main reporting the pane's state (read from the canvas pixels); a click
// on a creature, and a click on its crew row, opens that pane in the control room (switching to its
// Terminals view and un-maximizing another pane); the agentId is
// stored on each creature and its crew row; a closed pane's creature goes; the tank draws nothing
// while its tab is hidden and catches up when it shows; under reduced motion the fish hold still but
// keep their colours; nothing is written to a pane; and nothing is fetched from the network.
//
// Blue's look at it with real panes on H1 is BLUE-CHECKLIST.md step 55.

const { spawnSync } = require('child_process');
const path = require('path');

let passed = 0, failed = 0;
function assert(cond, label) {
  if (cond) { process.stdout.write(`  ✓ ${label}\n`); passed++; }
  else { process.stderr.write(`  ✗ FAIL: ${label}\n`); failed++; }
}
const eq = (a, b, label) => assert(JSON.stringify(a) === JSON.stringify(b), `${label} (got ${JSON.stringify(a)})`);

let electronPath = null;
try { electronPath = require('electron'); } catch { electronPath = null; }
assert(typeof electronPath === 'string' && electronPath.length > 0, 'the existing Electron dependency provides the executable');

const childEnv = Object.assign({}, process.env);
delete childEnv.ELECTRON_RUN_AS_NODE;
const args = [path.join(__dirname, 'aquarium-app-harness.js')];
// Linux containers run Electron as root without a sandbox; Windows CI needs neither switch.
if (process.platform === 'linux') args.unshift('--no-sandbox');
const run = spawnSync(electronPath, args, { cwd: __dirname, env: childEnv, encoding: 'utf8', timeout: 240000 });

let report = null;
const line = String(run.stdout || '').split('\n').find((l) => l.startsWith('{"ok"'));
try { report = JSON.parse(line); } catch { report = null; }
assert(report !== null, 'the harness produced a JSON report');
if (!report) {
  process.stderr.write(`harness exit ${run.status} signal ${run.signal}\nstderr tail:\n${String(run.stderr || '').split('\n').slice(-25).join('\n')}\n`);
  process.stdout.write(`\naquarium-app-integration: ${passed} passed, ${failed} failed\n`);
  process.exit(1);
}
assert(report.ok === true, `every scenario ran (fatal: ${JSON.stringify(report.fatal)})`);
const S = (report.scenarios || {}).tank || {};
const R = (report.scenarios || {}).reducedMotion || {};
const ids = S.paneIds || [];

process.stdout.write('\nthe tank and the crew list\n');
assert(S.mounted === true, 'the tank and the crew list are mounted in the aquarium frame');
eq(S.tabSelected, 'aquarium', 'the app opened on the aquarium tab');
assert(/No live panes/.test(S.emptyText || ''), 'with no panes the crew list says so');
assert(/empty/.test(S.canvasLabelEmpty || ''), 'the tank\'s text alternative says it is empty');
eq(S.startState && S.startState.broken, null, 'the tank started drawing (no refusal)');
eq(S.tankTitle, 'Tank · AgentCommandCenter', 'the one tank is named after the current repo');
eq(S.placeholderGone, true, 'S66\'s placeholder note is gone once the tank starts');
eq(ids.length, 3, 'three panes started');

process.stdout.write('\none creature per live pane, its species from its role, its agentId stored\n');
const rows = S.rows || [];
eq(rows.length, 3, 'one crew row per live pane');
eq((S.creatures || []).length, 3, 'one creature per live pane');
eq(rows.map((r) => r.id).sort(), ids.slice().sort(), 'each crew row stores its pane\'s id (the agentId)');
eq((S.creatures || []).map((c) => c.agentId).sort(), ids.slice().sort(), 'each creature stores its pane\'s id');
const species = Object.fromEntries((S.stored || []).filter(Boolean).map((c) => [c.agentId, c.species]));
eq([species[ids[0]], species[ids[1]], species[ids[2]]], ['builder', 'reviewer', 'scout'], 'a shell pane is a builder, a reviewer pane a reviewer, a codebase scout a scout');
assert(rows.every((r) => /Status unknown/.test(r.text)), 'before any signal each row says its state is unknown, in words');

process.stdout.write('\nthe right colour within about 2 seconds (read from the canvas)\n');
const T = S.timing || {};
for (const [k, label] of [['working', 'working (blue)'], ['needs', 'needs you (red)'], ['ended', 'turn ended (green)']]) {
  assert(typeof T[k] === 'number' && T[k] >= 0 && T[k] <= 2000, `${label} shows on the canvas within 2 s (took ${T[k]} ms)`);
}
const after = Object.fromEntries((S.rowsAfter || []).map((r) => [r.id, r]));
eq([after[ids[0]] && after[ids[0]].state, after[ids[1]] && after[ids[1]].state, after[ids[2]] && after[ids[2]].state], ['working', 'attention', 'turn ended'], 'each crew row carries its state');
assert(after[ids[1]] && /Needs you/.test(after[ids[1]].text), 'the needs-you row says "Needs you" in words');
eq((S.rowsAfter || [])[0] && S.rowsAfter[0].id, ids[1], 'the needs-you pane is listed first');
assert(/^Reviewer Reviewer · S20 tank: Needs you$/.test(S.liveNeeds || ''), `a state change is announced in the live region, in words (got ${JSON.stringify(S.liveNeeds)})`);
assert(/: Turn ended$/.test(S.live || ''), `the next change replaces it (got ${JSON.stringify(S.live)})`);
const y = Object.fromEntries((S.after || []).map((c) => [c.id, c.y]));
assert(y[ids[1]] < y[ids[0]] && y[ids[1]] < y[ids[2]], `the needs-you fish swims highest (y ${JSON.stringify(y)})`);
assert(/1 needs you/.test(S.canvasLabel || ''), `the tank's text alternative counts who needs you (got ${JSON.stringify(S.canvasLabel)})`);

eq(S.focusAfterUpdate, ids[2], 'keyboard focus on a crew row survives a status update');
eq(S.reducedMotion, false, 'set-up: motion is on in the tank scenario');
assert(S.workingMoved === true, 'without reduced motion a working fish swims');

process.stdout.write('\nhidden means stopped\n');
assert(S.framesShowing > 0, `the tank draws while its tab shows (${S.framesShowing} frames in 0.5 s)`);
eq(S.framesHidden, 0, 'the tank draws nothing while another tab shows');
eq(S.loopWhileHidden && S.loopWhileHidden.paused, true, 'its loop is paused while hidden');
assert(typeof T.idleAfterShow === 'number' && T.idleAfterShow >= 0 && T.idleAfterShow <= 2000, `a change made while hidden shows within 2 s of coming back (took ${T.idleAfterShow} ms)`);

process.stdout.write('\na click opens the pane\n');
eq(S.afterCreatureClick, { tab: 'control', active: ids[1] }, 'a click on a creature opens its pane in the control room');
eq(S.afterRowClick, { tab: 'control', active: ids[2] }, 'a click on a crew row opens its pane in the control room');
eq(S.shownOnAgentsView, false, 'set-up: on the control room\'s Agents view the pane is hidden');
eq(S.afterAgentsViewClick, { tab: 'control', active: ids[1], shown: true }, 'a click on its creature switches to Terminals and shows the pane');
if (S.docked) {
  eq(S.targetShownBefore, false, 'set-up: the target is a background tab, hidden behind another pane');
  eq(S.afterDockedClick, { tab: 'control', active: ids[0], panelActive: true, shown: true }, 'a click on a docked pane\'s creature brings its tab forward');
} else {
  eq([S.maximizedBefore, S.targetShownBefore], [ids[2], false], 'set-up: another pane is maximized and the target is hidden');
  eq(S.afterMaximizedClick, { tab: 'control', active: ids[0], maximized: null, shown: true }, 'a click on its creature restores the grid and shows the pane');
}
eq(S.emptyClick, { hit: null, tab: 'aquarium' }, 'a click on empty water opens nothing');

process.stdout.write('\na closed pane\'s creature goes\n');
eq((S.rowsAfterClose || []).sort(), ids.slice(1).sort(), 'the closed pane\'s row is gone and the others stay');
eq(S.storedAfterClose, null, 'and its creature is gone');
eq(S.killed, [ids[0]], 'closing went through the pane\'s one close path (one pty-kill)');
eq(S.writes, [], 'the aquarium wrote nothing to any pane');
eq((S.log || []).filter((l) => /REFUSED/.test(l)), [], 'no aquarium refusals in the log');

process.stdout.write('\nreduced motion\n');
eq(R.matches, true, 'the page sees prefers-reduced-motion');
assert(typeof R.colourMs === 'number' && R.colourMs >= 0 && R.colourMs <= 2000, `the colour still shows within 2 s (took ${R.colourMs} ms)`);
eq(R.moved, false, 'the fish holds still');
assert(R.framesInWindow > 0, `the tank kept drawing while the fish held still (${R.framesInWindow} frames in 0.8 s)`);

process.stdout.write('\nnothing reached the network, and no renderer errors\n');
eq(report.remote, [], 'no remote request');
eq(report.consoleErrors, [], 'no console errors');

process.stdout.write(`\naquarium-app-integration: ${passed} passed, ${failed} failed\n`);
if (failed) process.exit(1);
