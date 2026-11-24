'use strict';
// Run: node app/renderer/ui-tokens.test.js
// S66: the 1.1 colour tokens and the brief's contrast rules (docs/DESIGN-BRIEF-1.1.md 3.1 and 9).

const T = require('./ui-tokens');

let passed = 0, failed = 0;
function assert(condition, label) {
  if (condition) { process.stdout.write(`  ✓ ${label}\n`); passed += 1; }
  else { process.stderr.write(`  ✗ FAIL: ${label}\n`); failed += 1; }
}

process.stdout.write('\ncontrast formula matches known WCAG values\n');
assert(Math.abs(T.contrast('#ffffff', '#000000') - 21) < 1e-9, 'white on black is 21:1');
assert(Math.abs(T.contrast('#3f65f4', '#ffffff') - 4.80) < 0.01, 'on-accent on accent is 4.80:1 (the brief\'s figure)');
assert(Math.abs(T.contrast('#9466ff', '#111e3d') - 4.39) < 0.01, 'the brief\'s original violet is 4.39:1 on the brain surface-raised (why it was lightened)');

process.stdout.write('\nevery tab has the same token names\n');
const names = Object.keys(T.TAB_TOKENS.brain).sort().join(',');
for (const tab of T.TAB_IDS) assert(Object.keys(T.TAB_TOKENS[tab]).sort().join(',') === names, `${tab} defines the same tab tokens`);

process.stdout.write('\nstatus colours reach 4.5:1 and line-strong 3:1 on every surface and surface-raised\n');
for (const tab of T.TAB_IDS) {
  const tk = T.tokensFor(tab);
  for (const ground of ['surface', 'surface-raised']) {
    for (const s of T.STATUS_TOKENS) {
      const r = T.contrast(tk[s], tk[ground]);
      assert(r >= 4.5, `${tab}: ${s} on ${ground} is ${r.toFixed(2)}:1 (>= 4.5)`);
    }
    const ls = T.contrast(tk['line-strong'], tk[ground]);
    assert(ls >= 3, `${tab}: line-strong on ${ground} is ${ls.toFixed(2)}:1 (>= 3)`);
    for (const ink of ['ink', 'ink-muted', 'ink-faint', 'accent-ink']) {
      const r = T.contrast(tk[ink], tk[ground]);
      assert(r >= 4.5, `${tab}: ${ink} on ${ground} is ${r.toFixed(2)}:1 (>= 4.5)`);
    }
  }
}

process.stdout.write('\nheld violet still reads darker than red, blue and grey\n');
for (const s of ['status-needs', 'status-working', 'status-idle']) {
  assert(T.luminance(T.SHARED_TOKENS['status-held']) < T.luminance(T.SHARED_TOKENS[s]), `status-held is darker than ${s}`);
}

process.stdout.write('\nemblem ink and the message box placeholder\n');
for (let i = 1; i <= 8; i += 1) {
  const r = T.contrast(T.SHARED_TOKENS['emblem-ink'], T.SHARED_TOKENS[`emblem-${i}`]);
  assert(r >= 4.5, `emblem-ink on emblem-${i} is ${r.toFixed(2)}:1`);
}
assert(T.contrast(T.SHARED_TOKENS['composer-placeholder'], T.SHARED_TOKENS.composer) >= 4.5, 'composer placeholder reaches 4.5:1');

process.stdout.write('\napplyTabTokens sets custom properties and the tab marker; an unknown tab refuses\n');
const props = {}; const attrs = {};
const fakeRoot = { style: { setProperty: (k, v) => { props[k] = v; } }, setAttribute: (k, v) => { attrs[k] = v; } };
T.applyTabTokens(fakeRoot, 'aquarium');
assert(props['--mk-surface'] === '#05191a', 'aquarium surface set as --mk-surface');
assert(props['--mk-accent'] === '#3f65f4', 'shared accent set');
assert(attrs['data-mako-tab'] === 'aquarium', 'root marked data-mako-tab=aquarium');
let threw = false;
try { T.applyTabTokens(fakeRoot, 'board'); } catch { threw = true; }
assert(threw, 'unknown tab throws instead of falling back');
assert(attrs['data-mako-tab'] === 'aquarium', 'a refused tab leaves the previous marker alone');

const removed = [];
const fakeRoot2 = { style: { removeProperty: (k) => removed.push(k) }, removeAttribute: (k) => { delete attrs[k]; } };
T.clearTabTokens(fakeRoot2);
assert(removed.includes('--mk-surface') && removed.includes('--mk-accent') && removed.length === Object.keys(T.tokensFor('brain')).length, 'clearTabTokens takes every token off the root');
assert(!('data-mako-tab' in attrs), 'and the tab marker');

process.stdout.write(`\nui-tokens: ${passed} passed, ${failed} failed\n`);
if (failed) process.exit(1);
