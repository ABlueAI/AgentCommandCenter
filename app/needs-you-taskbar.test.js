'use strict';
// Run: node app/needs-you-taskbar.test.js
// S19: the taskbar badge. The window and nativeImage are fakes: this does NOT verify the Windows
// taskbar itself (BLUE-CHECKLIST.md's PC check does).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createNeedsYouTaskbar, describe, DOT_PNG_BASE64 } = require('./needs-you-taskbar');

let passed = 0;
function test(label, run) { run(); passed++; console.log(`  ✓ ${label}`); }
function rig(options = {}) {
  const calls = [], logs = [];
  const win = {
    isDestroyed: () => options.destroyed === true,
    setOverlayIcon: (img, text) => { if (options.throws) throw Error('PRIVATE'); calls.push([img ? 'dot' : null, text]); },
  };
  const nativeImage = { createFromDataURL: (url) => { calls.push(['created', url.slice(0, 22)]); return { url }; } };
  const t = createNeedsYouTaskbar({ platform: options.platform || 'win32', getWindow: () => (options.noWindow ? null : win), nativeImage, log: (l) => logs.push(l) });
  const view = (paneId, state) => t.observe({ paneId, state, reason: null });
  return { t, calls, logs, view };
}

test('the dot is a PNG', () => {
  assert.equal(Buffer.from(DOT_PNG_BASE64, 'base64').subarray(1, 4).toString('latin1'), 'PNG');
});
test('a waiting pane sets the red dot with the count in words; none clears it', () => {
  const r = rig();
  r.view('pty1', 'attention');
  r.view('pty2', 'attention');
  r.view('pty1', 'working');
  r.view('pty2', 'exited');
  assert.deepEqual(r.calls, [['created', 'data:image/png;base64,'], ['dot', '1 pane needs you'], ['dot', '2 panes need you'], ['dot', '1 pane needs you'], [null, '']]);
  assert.equal(r.t.waiting(), 0);
});
test('repeats and other panes changing state set nothing new', () => {
  const r = rig();
  r.view('pty1', 'attention'); r.view('pty1', 'attention'); r.view('pty2', 'working'); r.view('pty2', 'idle');
  assert.equal(r.calls.filter((c) => c[0] === 'dot').length, 1);
});
test('not Windows, no window or a malformed view: nothing is set', () => {
  for (const r of [rig({ platform: 'linux' }), rig({ noWindow: true }), rig({ destroyed: true })]) {
    r.view('pty1', 'attention');
    assert.equal(r.calls.filter((c) => c[0] === 'dot').length, 0);
  }
  const r = rig();
  r.t.observe(null); r.t.observe({ paneId: 3, state: 'attention' });
  assert.equal(r.t.waiting(), 0);
});
test('a failing overlay is logged once with a bounded reason, never the exception', () => {
  const r = rig({ throws: true });
  r.view('pty1', 'attention'); r.view('pty2', 'attention');
  assert.deepEqual(r.logs, ['[needs-you-taskbar] the taskbar badge could not be set (overlay-failed)']);
});
test('dispose clears the badge', () => {
  const r = rig();
  r.view('pty1', 'attention'); r.t.dispose();
  assert.deepEqual(r.calls.at(-1), [null, '']);
  r.view('pty2', 'attention');
  assert.deepEqual(r.calls.at(-1), [null, ''], 'nothing after dispose');
});
test('words', () => { assert.equal(describe(1), '1 pane needs you'); assert.equal(describe(3), '3 panes need you'); });
test('main feeds it every published view and clears it on quit', () => {
  const main = fs.readFileSync(path.join(__dirname, 'main.js'), 'utf8');
  assert.match(main, /paneStatusNotifications\.observe\(view\);\s*needsYouTaskbar\.observe\(view\);/);
  assert.match(main, /app\.on\('will-quit', \(\) => \{ paneStatusNotifications\.dispose\(\); needsYouTaskbar\.dispose\(\); \}\);/);
});
test('toasts are silent (sound off)', () => {
  const src = fs.readFileSync(path.join(__dirname, 'pane-status', 'pane-status-notifications.js'), 'utf8');
  assert.match(src, /new Notification\(\{ \.\.\.MESSAGES\[state\], silent: true \}\)/);
});
console.log(`\nneeds-you-taskbar: ${passed} passed, 0 failed`);
