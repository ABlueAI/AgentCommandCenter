'use strict';
// Run: node app/renderer/authority-choice.test.js
//
// S10: the renderer's level list matches main's, a stored value is validated, and Maximum routes every
// Claude launch (and only Claude launches) to the cloud session instead of a local pane.

const choice = require('./authority-choice.js');
const main = require('../authority-level.js');

let passed = 0, failed = 0;
function assert(cond, label) {
  if (cond) { process.stdout.write(`  ✓ ${label}\n`); passed++; }
  else { process.stderr.write(`  ✗ FAIL: ${label}\n`); failed++; }
}

assert(choice.LEVELS.join(',') === main.LEVELS.join(','), 'the renderer offers exactly main\'s levels, in order');
assert(choice.CLOUD_SESSION_URL === main.CLOUD_SESSION_URL, 'and the same cloud session URL');
assert(choice.LEVELS.every((l) => typeof choice.LABELS[l] === 'string'), 'every level has a label');
assert(choice.LEVELS.includes(choice.DEFAULT_LEVEL) && choice.DEFAULT_LEVEL === 'medium', 'the default level is Medium');

for (const l of choice.LEVELS) {
  const r = choice.normalizeLevel(l);
  assert(r.level === l && r.fellBack === false, `stored "${l}" is kept`);
}
for (const v of [undefined, null]) {
  const r = choice.normalizeLevel(v);
  assert(r.level === 'medium' && r.fellBack === false, `nothing stored (${String(v)}): Medium, nothing to report`);
}
for (const v of ['', 'High', 'bypassPermissions', 'auto', 3, {}]) {
  const r = choice.normalizeLevel(v);
  assert(r.level === 'medium' && r.fellBack === true, `stored ${JSON.stringify(v)}: Medium, and the fallback is reported`);
}

const claudeLaunches = [
  { role: 'builder', cli: 'claude' },
  { role: 'reviewer', cli: 'claude', initialPrompt: 'Review' },
  { role: 'web-scout', cli: 'claude' },
  { role: null, cli: 'claude' },
  { agent: 'claude' },
];
const otherLaunches = [
  { role: null, cli: 'codex' },
  { role: null, cli: 'gemini' },
  {},
  { role: 'video-scout', videoScout: true },
];
for (const o of claudeLaunches) {
  assert(choice.isClaudeLaunch(o), `${JSON.stringify(o)} is a Claude launch`);
  assert(choice.routeLaunch(o, 'maximum') === 'cloud', `${JSON.stringify(o)} at Maximum goes to the cloud`);
  for (const l of ['minimum', 'medium', 'high']) assert(choice.routeLaunch(o, l) === 'local', `${JSON.stringify(o)} at ${l} launches locally`);
}
for (const o of otherLaunches) {
  assert(!choice.isClaudeLaunch(o), `${JSON.stringify(o)} is not a Claude launch`);
  for (const l of choice.LEVELS) assert(choice.routeLaunch(o, l) === 'local', `${JSON.stringify(o)} at ${l} launches locally`);
}
assert(choice.routeLaunch(undefined, 'maximum') === 'local', 'a plain shell (no options) at Maximum launches locally');

process.stdout.write(`\nauthority-choice: ${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
