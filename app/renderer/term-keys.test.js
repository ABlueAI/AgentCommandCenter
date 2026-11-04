'use strict';
// Run: node app/renderer/term-keys.test.js
//
// Shift+Enter inserts a newline in Claude Code panes and nowhere else, and the keypress that follows
// the remapped keydown is swallowed so xterm never also sends a submitting CR.

const keys = require('./term-keys.js');

let passed = 0, failed = 0;
function assert(cond, label) {
  if (cond) { process.stdout.write(`  ✓ ${label}\n`); passed++; }
  else { process.stderr.write(`  ✗ FAIL: ${label}\n`); failed++; }
}
const ev = (type, mods) => Object.assign({ type, key: 'Enter', shiftKey: false, ctrlKey: false, altKey: false, metaKey: false }, mods);

assert(keys.NEWLINE_SEQUENCE === '\x1b\r', 'the newline sequence is ESC CR, what xterm sends for Alt+Enter');

{
  const r = keys.resolveKey(ev('keydown', { shiftKey: true }), 'claude');
  assert(r.handled === true && r.send === '\x1b\r', 'Shift+Enter keydown in a Claude pane sends ESC CR');
}
{
  const r = keys.resolveKey(ev('keypress', { shiftKey: true }), 'claude');
  assert(r.handled === true && r.send === null, 'the following keypress is swallowed without writing');
}
{
  const r = keys.resolveKey(ev('keyup', { shiftKey: true }), 'claude');
  assert(r.handled === true && r.send === null, 'and so is the keyup');
}

assert(keys.resolveKey(ev('keydown', {}), 'claude').handled === false, 'plain Enter still submits');
assert(keys.resolveKey(ev('keydown', { altKey: true }), 'claude').handled === false, 'Alt+Enter is left to xterm, unchanged');
assert(keys.resolveKey(ev('keydown', { shiftKey: true, ctrlKey: true }), 'claude').handled === false, 'Ctrl+Shift+Enter is not remapped');
assert(keys.resolveKey(ev('keydown', { shiftKey: true, altKey: true }), 'claude').handled === false, 'Alt+Shift+Enter is not remapped');

for (const cli of [null, undefined, 'codex', 'gemini', 'powershell']) {
  assert(keys.resolveKey(ev('keydown', { shiftKey: true }), cli).handled === false,
    `Shift+Enter is NOT remapped in a ${String(cli)} pane`);
}

assert(keys.resolveKey(Object.assign(ev('keydown', { shiftKey: true }), { key: 'a' }), 'claude').handled === false, 'other keys are untouched');
assert(keys.resolveKey(null, 'claude').handled === false, 'a missing event is ignored');

// S31 item 3: Ctrl+V pasted twice (once from Mako, once from the browser's own paste event).
{
  const mk = (o) => Object.assign({ type: 'keydown', key: 'v', code: 'KeyV', ctrlKey: true, shiftKey: false,
    prevented: 0, preventDefault() { this.prevented++; } }, o);
  for (const [label, o] of [['Ctrl+V', {}], ['Ctrl+Shift+V', { shiftKey: true, key: 'V' }],
    ['Ctrl+V on a non-US layout (code only)', { key: 'м' }]]) {
    const e = mk(o); let pastes = 0;
    const r = keys.handlePasteKey(e, () => { pastes++; });
    assert(r === true && pastes === 1 && e.prevented === 1, `${label}: one paste, and the browser's paste is cancelled`);
  }
  for (const [label, o] of [['plain V', { ctrlKey: false }], ['Ctrl+C', { key: 'c', code: 'KeyC' }],
    ['the keyup', { type: 'keyup' }], ['the keypress', { type: 'keypress' }]]) {
    const e = mk(o); let pastes = 0;
    const r = keys.handlePasteKey(e, () => { pastes++; });
    assert(r === false && pastes === 0 && e.prevented === 0, `${label}: not a paste, left alone`);
  }
  assert(keys.handlePasteKey(null, () => { throw new Error('no'); }) === false, 'a missing event is ignored');
}

process.stdout.write(`\nterm-keys: ${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
