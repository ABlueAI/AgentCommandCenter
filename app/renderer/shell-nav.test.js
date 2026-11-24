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

process.stdout.write('\nquiet hours and Pause all state\n');
eq(N.normalizeSince(null), { since: null, fellBack: false }, 'off is null');
eq(N.normalizeSince(undefined), { since: null, fellBack: false }, 'never set is off, silently');
eq(N.normalizeSince('2026-11-24T19:05:00.000Z'), { since: '2026-11-24T19:05:00.000Z', fellBack: false }, 'an ISO time is kept');
eq(N.normalizeSince('yesterday'), { since: null, fellBack: true }, 'anything else is off and reported');
eq(N.normalizeSince('2026-13-45T99:99Z'), { since: null, fellBack: true }, 'an impossible time is off and reported');
eq(N.normalizeSince(1732475100000), { since: null, fellBack: true }, 'a number is off and reported');
assert(/^Quiet hours since .+\. Agents keep working\.$/.test(N.quietBannerText('2026-11-24T19:05:00.000Z')), 'the quiet banner says since when, and that agents keep working');
assert(/^Paused since .+\.$/.test(N.pausedBannerText('2026-11-24T19:05:00.000Z')), 'the paused banner says since when');

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

process.stdout.write('\nCtrl Space is exactly Ctrl+Space\n');
assert(N.isPushToTalkChord({ ctrlKey: true, code: 'Space', key: ' ' }), 'Ctrl+Space is push to talk');
assert(!N.isPushToTalkChord({ ctrlKey: true, shiftKey: true, code: 'Space', key: ' ' }), 'Ctrl+Shift+Space is not');
assert(!N.isPushToTalkChord({ ctrlKey: false, code: 'Space', key: ' ' }), 'plain Space is typing');
assert(!N.isPushToTalkChord({ ctrlKey: true, code: 'KeyK', key: 'k' }), 'Ctrl+K is not');
assert(N.SHORTCUTS.some((x) => x.keys.startsWith('Ctrl Space')), 'Ctrl Space is in the one shortcut list');

process.stdout.write('\npush to talk: hold, release, and a release before the microphone opens\n');
function ptt(opts) {
  const o = Object.assign({ recording: false, pressResult: true }, opts || {});
  const log = { presses: 0, notices: [] };
  let t = 1000;
  const m = N.createPushToTalk({
    isRecording: () => o.recording,
    press: () => { log.presses += 1; return o.pressResult; },
    notify: (text) => log.notices.push(text),
    now: () => t, pendingMs: 15000,
  });
  return { m, o, log, tick: (ms) => { t += ms; } };
}
const DOWN = { ctrlKey: true, code: 'Space', key: ' ' };
const UP = { code: 'Space', key: ' ' };
{
  const { m, o, log } = ptt();
  assert(m.keydown(DOWN) === true && log.presses === 1, 'press: Dictate pressed once, key consumed');
  assert(m.keydown(Object.assign({ repeat: true }, DOWN)) === true && log.presses === 1, 'key repeat: consumed, not pressed again');
  o.recording = true; m.onSttStatus('recording');
  assert(m.keyup(UP) === true && log.presses === 2, 'release while recording: pressed again to stop');
  assert(m.keyup(UP) === false, 'a second keyup is not ours');
}
{
  const { m, o, log } = ptt();
  m.keydown(DOWN);
  m.keyup({ key: 'Control' });
  assert(log.presses === 1 && m.state().stopWhenStarted === true, 'quick tap: the stop is remembered, not dropped');
  assert(log.notices.length === 1 && /before the microphone opened/.test(log.notices[0]), 'and it says so');
  o.recording = true; m.onSttStatus('recording');
  assert(log.presses === 2 && m.state().stopWhenStarted === false, 'the stop is sent as soon as recording starts');
}
{
  const { m, o, log, tick } = ptt();
  m.keydown(DOWN); m.keyup(UP);
  tick(20000);
  o.recording = true; m.onSttStatus('recording');
  assert(log.presses === 1, 'a remembered stop older than 15 s is dropped (a later mouse start is not stopped)');
}
{
  const { m, log } = ptt();
  m.keydown(DOWN); m.keyup(UP);
  m.onSttStatus('error');
  assert(m.state().stopWhenStarted === false && m.state().pendingAt === null, 'an error clears the pending start');
  m.onSttStatus('recording');
  assert(log.presses === 1, 'and a later recording is not stopped');
}
{
  const { m, log } = ptt({ pressResult: false });
  m.keydown(DOWN); m.keyup(UP);
  assert(m.state().stopWhenStarted === false && log.notices.length === 0, 'a refused press leaves nothing pending');
}
{
  const { m, o, log } = ptt({ recording: true });
  m.keydown(DOWN);
  assert(log.presses === 0, 'already recording (mouse): the press does not toggle it off');
  m.blur();
  assert(log.presses === 1, 'leaving the window releases and stops');
  assert(m.keydown({ ctrlKey: true, code: 'KeyK', key: 'k' }) === false, 'other keys are not ours');
}
eq(N.errorKind(Object.assign(new TypeError('secret path C:\\x'), {})), 'TypeError', 'errorKind gives the class, never the message');
eq(N.errorKind(Object.assign(new Error('x'), { code: 'EPERM' })), 'Error EPERM', 'errorKind adds an errno code');
eq(N.errorKind({ name: 'bad name with spaces', code: 'not-errno' }), 'Error', 'errorKind refuses unbounded values');
eq(N.reasonOf(new RangeError('x')), 'unknown-error, RangeError', 'reasonOf keeps the class of an unexpected error');

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
eq(N.SETTINGS_SECTIONS.map((s) => s.id), ['layout', 'general', 'shortcuts', 'shark', 'quiet', 'repos', 'voice', 'keys'], 'the Settings page has the brief\'s sections');
assert(N.SETTINGS_SECTIONS.filter((s) => !['layout', 'general', 'shortcuts'].includes(s.id)).every((s) => typeof s.pending === 'string' && s.pending.length > 10), 'every section without controls yet says what comes and when');

process.stdout.write(`\nshell-nav: ${passed} passed, ${failed} failed\n`);
if (failed) process.exit(1);
