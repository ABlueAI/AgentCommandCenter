'use strict';
// Run: node app/quiet-hours.test.js
// S19: main and the renderer read the stored quiet state the same way.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { isQuietSince } = require('./quiet-hours');
const { normalizeSince } = require('./renderer/shell-nav');

let passed = 0;
const failed = 0; // an assertion that fails throws and exits non-zero before the summary
function test(label, run) { run(); passed++; console.log(`  ✓ ${label}`); }

const CASES = [
  '2026-11-26T08:30:00.000Z', '2026-11-26T08:30Z', '2026-11-26T08:30:00Z', '2026-13-40T99:99:00Z',
  'not-a-time', '', ' ', '2026-11-26', '2026-11-26T08:30:00+01:00', null, undefined, 0, 1, true, {}, [],
];
test('main is quiet exactly when the renderer shows quiet hours on', () => {
  for (const v of CASES) assert.equal(isQuietSince(v), normalizeSince(v).since !== null, `value ${JSON.stringify(v)}`);
});
test('a valid time is quiet; "not-a-time", empty and null are not', () => {
  assert.equal(isQuietSince('2026-11-26T08:30:00.000Z'), true);
  for (const v of ['not-a-time', '', null]) assert.equal(isQuietSince(v), false);
});
test('main reads quiet hours through it, and releases held toasts when they end', () => {
  const main = fs.readFileSync(path.join(__dirname, 'main.js'), 'utf8');
  assert.match(main, /isQuiet: \(\) => isQuietSince\(loadSettings\(\)\.uiQuietSince\)/);
  assert.match(main, /if \(partial && Object\.hasOwn\(partial, 'uiQuietSince'\) && !isQuietSince\(partial\.uiQuietSince\) && isQuietSince\(before\.uiQuietSince\)\) \{\s*paneStatusNotifications\.releaseHeld\(\);/);
});
console.log(`\nquiet-hours: ${passed} passed, ${failed} failed`);
