'use strict';
// Run: node app/renderer/shell-nav.test.js
// S66: the shell's pure parts: layout and tab choice, tab keyboard order, the Ctrl K chord, palette
// ranking, and the one shortcut list. The DOM parts run in a real Electron renderer
// (shell-nav-app-integration.test.js).

const N = require('./shell-nav');

let passed = 0, failed = 0;
function assert(condition, label) {
  if (condition) { process.stdout.write(`  ✓ ${label}\n`); passed += 1; }
  else { process.stderr.write(`  ✗ FAIL: ${label}\n`); failed += 1; }
}
const eq = (a, b, label) => assert(JSON.stringify(a) === JSON.stringify(b), `${label} (got ${JSON.stringify(a)})`);

process.stdout.write('\nthree tabs, in the brief\'s order, and the layout choice\n');
eq(N.TAB_IDS, ['brain', 'control', 'aquarium'], 'tabs are brain, control room, aquarium');
eq(N.normalizeLayout('old'), { layout: 'old', fellBack: false }, 'old layout kept');
eq(N.normalizeLayout('tabs'), { layout: 'tabs', fellBack: false }, 'tab layout kept');
eq(N.normalizeLayout(undefined), { layout: 'tabs', fellBack: false }, 'no stored layout: the three-tab layout, silently (first run)');
eq(N.normalizeLayout('classic'), { layout: 'tabs', fellBack: true }, 'an unknown stored layout falls back and says so');
eq(N.normalizeTab('aquarium'), { tab: 'aquarium', fellBack: false }, 'a remembered tab is kept');
eq(N.normalizeTab(undefined), { tab: 'control', fellBack: false }, 'first run opens the control room');
eq(N.normalizeTab('board'), { tab: 'control', fellBack: true }, 'an unknown stored tab falls back and says so');

process.stdout.write('\ntab keyboard (WAI-ARIA tabs pattern)\n');
eq(N.nextTabIndex('ArrowRight', 0, 3), 1, 'Right moves on');
eq(N.nextTabIndex('ArrowRight', 2, 3), 0, 'Right wraps to the first');
eq(N.nextTabIndex('ArrowLeft', 0, 3), 2, 'Left wraps to the last');
eq(N.nextTabIndex('Home', 2, 3), 0, 'Home is the first');
eq(N.nextTabIndex('End', 0, 3), 2, 'End is the last');
eq(N.nextTabIndex('Enter', 0, 3), null, 'other keys are not the tablist\'s');

process.stdout.write('\nCtrl K is exactly Ctrl+K\n');
assert(N.isPaletteChord({ ctrlKey: true, key: 'k' }), 'Ctrl+K opens');
assert(N.isPaletteChord({ ctrlKey: true, key: 'K', code: 'KeyK' }), 'Ctrl+K with caps lock opens');
assert(!N.isPaletteChord({ ctrlKey: true, shiftKey: true, key: 'K' }), 'Ctrl+Shift+K is left to the terminal');
assert(!N.isPaletteChord({ ctrlKey: true, altKey: true, key: 'k' }), 'Ctrl+Alt+K is left alone');
assert(!N.isPaletteChord({ ctrlKey: false, key: 'k' }), 'plain k is typing');
assert(!N.isPaletteChord(null), 'no event is not a chord');

process.stdout.write('\npalette ranking\n');
const cmds = [
  { label: 'Open Settings', group: 'Mako' },
  { label: 'Go to Brain', group: 'Tabs' },
  { label: 'Repo: settings-sync', group: 'Repos' },
  { label: 'Go to Control room', group: 'Tabs' },
  { label: 'Open Logs', group: 'Control room' },
];
eq(N.rankCommands(cmds, '').map((c) => c.label), cmds.map((c) => c.label), 'an empty query lists everything in order');
eq(N.rankCommands(cmds, 'sett').map((c) => c.label), ['Open Settings', 'Repo: settings-sync'], 'a word start ranks; order kept on ties');
eq(N.rankCommands(cmds, 'go').map((c) => c.label), ['Go to Brain', 'Go to Control room'], 'a label prefix ranks first');
eq(N.rankCommands(cmds, 'control').map((c) => c.label), ['Go to Control room', 'Open Logs'], 'a group match counts after a label match');
eq(N.rankCommands(cmds, 'zzz'), [], 'no match lists nothing');
eq(N.rankCommands(cmds, '  BRAIN ').map((c) => c.label), ['Go to Brain'], 'case and spaces are ignored');

process.stdout.write('\nthe one shortcut list and the Settings sections\n');
assert(N.SHORTCUTS.some((s) => s.keys === 'Ctrl K'), 'Ctrl K is in the shortcut list');
assert(N.SHORTCUTS.every((s) => s.keys && s.action && s.scope), 'every shortcut says its keys, what it does and where');
eq(N.SETTINGS_SECTIONS.map((s) => s.id), ['layout', 'shortcuts', 'shark', 'quiet', 'repos', 'voice', 'keys'], 'the Settings page has the brief\'s sections');
assert(N.SETTINGS_SECTIONS.filter((s) => !['layout', 'shortcuts'].includes(s.id)).every((s) => typeof s.pending === 'string' && s.pending.length > 10), 'every section without controls yet says what comes and when');

process.stdout.write(`\nshell-nav: ${passed} passed, ${failed} failed\n`);
if (failed) process.exit(1);
