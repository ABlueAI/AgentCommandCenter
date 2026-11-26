'use strict';
// Run: node app/brain-app-integration.test.js
//
// S18's end-to-end gate (docs/DESIGN-BRIEF-1.1.md section 9, "S18"), measured in a REAL Electron
// renderer running the real index.html, preload.js, app.js, shell-nav.js, in-focus-card.js and
// brain-stage.js (brain-app-harness.js; only main is stubbed). It checks: nodes appear for live
// panes and sit higher when more urgent; a permission prompt always shows as a red card; a card
// answer reaches the pane (counted at the `pty-write` IPC boundary) as the menu's digit or Esc;
// a click on a node opens the In-focus card in its state; Ctrl+F (a real key event) opens find,
// which finds a node by content; more than 8 tasks group by repo and a click fans them out; Open
// pane goes to the control room; the shark draws, stops on another tab and pauses with the view;
// and nothing is fetched from the network.
//
// The shark runs on software WebGL here (SwiftShader, harness only). Its state timing, reduced
// motion and the 30 fps rule are unit-tested in renderer/shark-shape.test.js; the 30 fps frame
// time full screen and a real Claude Code permission prompt are Blue's batched PC check
// (BLUE-CHECKLIST.md). Not built yet (later steps of S18): the lines and "What Mako knows".

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
const args = [path.join(__dirname, 'brain-app-harness.js')];
// Linux containers run Electron as root without a sandbox; Windows CI needs neither switch.
if (process.platform === 'linux') args.unshift('--no-sandbox');
const run = spawnSync(electronPath, args, { cwd: __dirname, env: childEnv, encoding: 'utf8', timeout: 240000 });

let report = null;
const line = String(run.stdout || '').split('\n').find((l) => l.startsWith('{"ok"'));
try { report = JSON.parse(line); } catch { report = null; }
assert(report !== null, 'the harness produced a JSON report');
if (!report) {
  process.stderr.write(`harness exit ${run.status} signal ${run.signal}\nstderr tail:\n${String(run.stderr || '').split('\n').slice(-25).join('\n')}\n`);
  process.stdout.write(`\nbrain-app-integration: ${passed} passed, ${failed} failed\n`);
  process.exit(1);
}
assert(report.ok === true, `every scenario ran (fatal: ${JSON.stringify(report.fatal)})`);
const S = (report.scenarios || {}).stage || {};

process.stdout.write('\nthe stage: nodes from live panes, more urgent higher\n');
assert(S.mounted === true, 'stage, conversation and right panel are mounted in the brain frame');
assert(/No live tasks/.test(S.emptyText || ''), 'with no panes the stage says so');
assert(/^Shape B3 \(Heavy\) loaded/.test(S.sharkNote || ''), `the shark's shape file loads in the real app (got ${JSON.stringify(S.sharkNote)})`);
eq((S.paneIds || []).length, 3, 'three panes started');
const nodes = S.nodes || [];
eq(nodes.length, 3, 'one node per live pane');
const y = (id) => (nodes.find((n) => n.id === id) || {}).y;
const [p1, p2, p3] = S.paneIds || [];
assert(y(p1) === y(p2) && y(p1) < y(p3), 'the two waiting panes share the top row, above the working one');
eq(nodes.map((n) => n.state), ['needs', 'needs', 'working'], 'node states come from pane status');
eq(S.counts, 'Waiting on you 2 · On agents 1 · Ready 0', 'the counts line');
eq((S.lines || []).map((l) => l.state).sort(), ['needs', 'needs', 'working'], 'a line from the shark to each node');
assert((S.lines || []).every((l) => (l.state === 'needs') === (l.dash !== 'none')), 'dashed only where the task waits on Blue');

process.stdout.write('\ncards: a permission prompt is always red; answers reach the pane\n');
const cards = S.cards || [];
const perm = cards.find((c) => c.kind === 'permission');
assert(perm && /mk-card-permission/.test(perm.cls), 'the permission prompt shows as a permission card');
eq(S.permissionBorder, 'rgb(242, 96, 107)', 'its border is the needs-you red');
eq(S.needsToken, '#f2606b', 'which is the status-needs token');
assert(perm && /Mako never answers this for you/.test(perm.text), 'with "Mako never answers this for you"');
assert(cards.some((c) => c.kind === 'question' && /Which store/.test(c.text)), 'the question shows as a question card');
eq(S.writes, [{ id: p1, data: '1' }, { id: p2, data: '2' }], 'Allow once and an answer reached their panes as the menu digit, at the IPC boundary');
eq(S.focusState, 'permission', 'a click on a node opens the In-focus card in its state');
eq(S.denyWrites, [{ id: p1, data: '\u001b' }], 'Deny on the In-focus card reached the pane as Esc');
assert(S.rightNow === true, 'Back to Right now shows the counts');

process.stdout.write('\nCtrl+F, grouping and Open pane\n');
eq(S.findFocused, 'makoStageFind', 'a real Ctrl+F on the brain tab focuses find');
assert(/^1 found/.test((S.findByContent || {}).status || ''), 'find matches by content (the question on screen)');
eq(S.findNone, 'No task matches.', 'no match says so');
eq((S.groups || []).length, 1, 'nine tasks in one repo: one group node');
assert(/· 9/.test(((S.groups || [])[0] || {}).text || ''), 'the group shows its count');
eq(S.nodesWhenGrouped, 0, 'no single nodes while grouped');
eq(S.nodesFanned, 9, 'a click on the group fans its tasks out');
eq(S.afterOpenTab, 'control', 'Open pane goes to the control room');

process.stdout.write('\nthe shark: draws on the brain tab, stops when hidden, pauses with the view\n');
assert(S.sharkStarted === true, `the real Three.js renderer started (note: ${JSON.stringify(S.sharkNoteAfter)})`);
assert(S.sharkFramesPerSecond > 0 && S.sharkFramesPerSecond <= 31, `it draws, at no more than 30 fps by default (${S.sharkFramesPerSecond} frames in 1 s)`);
assert(S.sharkCanvas && S.sharkCanvas.w > 0 && S.sharkCanvas.h > 0, 'into a canvas on the stage');
eq(S.sharkFramesHidden, 0, 'on another tab it draws nothing');
eq(S.sharkRunningHidden, false, 'and its clock is stopped');
eq(S.sharkRunningShown, true, 'back on the brain tab it runs again');
eq(S.sharkPausedWithView, true, 'the stage\'s Pause freezes the shark too');

process.stdout.write('\nnothing reached the network, and no renderer errors\n');
eq(report.remote, [], 'no remote request');
eq(report.consoleErrors, [], 'no console errors');

process.stdout.write(`\nbrain-app-integration: ${passed} passed, ${failed} failed\n`);
if (failed) process.exit(1);
