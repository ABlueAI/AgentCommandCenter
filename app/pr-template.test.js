'use strict';
// Run: node app/pr-template.test.js
//
// Pins the PR template's TLDR (.github/pull_request_template.md) to AGENTS.md "The TLDR": every
// line AGENTS.md lists is in the template, in AGENTS.md's order, ending with "Follow-ups", then the
// "Where I stopped / what's next" line the runner prompt keeps current (docs/RUNNER.md, step 6).
// Gap audit A6 (docs/1.1-GAP-AUDIT.md): the template had no "Follow-ups" line.

const fs = require('fs');
const path = require('path');

let passed = 0, failed = 0;
function assert(cond, label) {
  if (cond) { process.stdout.write('  ✓ ' + label + '\n'); passed++; }
  else { process.stderr.write('  x FAIL: ' + label + '\n'); failed++; }
}

const repoRoot = path.join(__dirname, '..');
// Windows checkouts get CRLF line endings (git autocrlf), so normalise before matching on "\n".
const read = (...parts) => fs.readFileSync(path.join(repoRoot, ...parts), 'utf8').replace(/\r\n/g, '\n');
const template = read('.github', 'pull_request_template.md');
const agents = read('AGENTS.md');

// AGENTS.md's order, and the template label that carries each item.
const order = [
  ['what and why', 'What and why'],
  ['ready to merge or not', 'Ready to merge'],
  ['decisions Blue must make', 'Needs your decision'],
  ['uncertainty and how to check it', 'Uncertainty to check'],
  ['plan changes', 'Plan change'],
  ['sensitive areas touched', 'Sensitive'],
  ['test results', 'Tests'],
  ['review verdict and open findings', 'Review'],
  ['follow-ups', 'Follow-ups'],
];

// The rule wraps across lines, so collapse whitespace before matching phrases.
const tldrRule = ((/## The TLDR[^\n]*\n\n([\s\S]*?)\n\n/.exec(agents) || [])[1] || '').replace(/\s+/g, ' ');
assert(tldrRule.length > 0, 'AGENTS.md has a "The TLDR" section');
let last = -1;
for (const [rule] of order) {
  const at = tldrRule.indexOf(rule);
  assert(at > last, `AGENTS.md lists "${rule}" in the expected order`);
  if (at > last) last = at;
}

const tldr = (/## TLDR\n([\s\S]*?)\n## /.exec(template) || [])[1] || '';
assert(tldr.length > 0, 'the template has a TLDR section');
const labels = [...tldr.matchAll(/^- \*\*(.+?):\*\*/gm)].map((m) => m[1]);
const expected = order.map(([, label]) => label).concat(["Where I stopped / what's next"]);
assert(JSON.stringify(labels) === JSON.stringify(expected),
  `template TLDR lines are AGENTS.md's, in order, then "Where I stopped" (got: ${labels.join(' | ')})`);

process.stdout.write(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
