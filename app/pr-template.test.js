'use strict';
// Run: node app/pr-template.test.js
//
// Pins the PR template's TLDR (.github/pull_request_template.md) to AGENTS.md "The TLDR": AGENTS.md
// lists exactly the nine items below, in this order, and the template has one line for each, in the
// same order, ending with "Follow-ups", then the "Where I stopped / what's next" line the runner
// prompt keeps current (docs/RUNNER.md, step 6).
// Gap audit A6 (docs/1.1-GAP-AUDIT.md): the template had no "Follow-ups" line.
// D-086 (docs/DECISIONS.md, 2026-11-24): both start with the short top block for Blue (summary, most
// impactful changes, decisions made with Claude's own marked, before you merge; colour markers), and
// the nine lines follow under "Full TLDR (for the reviewers)".

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

// The rule wraps across lines, so collapse whitespace, then take the list after "in this order:" up
// to the first sentence end. The section runs from its heading to the next heading. Every item must be one of ours, in order, and none may be missing or
// extra, so a new TLDR item in AGENTS.md fails here until the template gets it too.
const tldrRule = ((/### The TLDR[^\n]*\n([\s\S]*?)\n##/.exec(agents) || [])[1] || '').replace(/\s+/g, ' ');
assert(tldrRule.length > 0, 'AGENTS.md has a "The TLDR" section');
const listStart = tldrRule.indexOf('in this order:');
const list = listStart < 0 ? '' : tldrRule.slice(listStart + 'in this order:'.length).split('. ')[0];
const items = list.split(' · ').map((x) => x.trim()).filter(Boolean);
assert(items.length === order.length,
  `AGENTS.md's TLDR list has ${order.length} items (got ${items.length}: ${items.join(' | ')})`);
order.forEach(([rule], i) => {
  assert(Boolean(items[i]) && items[i].startsWith(rule), `AGENTS.md's TLDR item ${i + 1} is "${rule}" (got "${items[i] || ''}")`);
});

const tldr = (/## TLDR\n([\s\S]*?)\n## /.exec(template) || [])[1] || '';
assert(tldr.length > 0, 'the template has a TLDR section');
const labels = [...tldr.matchAll(/^- \*\*(.+?):\*\*/gm)].map((m) => m[1]);
const expected = order.map(([, label]) => label).concat(["Where I stopped / what's next"]);
assert(JSON.stringify(labels) === JSON.stringify(expected),
  `template TLDR lines are AGENTS.md's, in order, then "Where I stopped" (got: ${labels.join(' | ')})`);

// The top block (D-086): AGENTS.md names its four parts in order, the three colour markers and the
// "Claude decided" mark, and puts the full lines under "Full TLDR (for the reviewers)".
const topParts = ['Summary:', 'Most impactful changes:', 'Decisions made:', 'Before you merge:'];
const partAt = topParts.map((part) => tldrRule.indexOf(`**${part}**`));
assert(partAt.every((at) => at >= 0), `AGENTS.md's TLDR names the top block's parts (${topParts.join(' | ')})`);
assert(partAt.every((at, i) => i === 0 || at > partAt[i - 1]), "AGENTS.md's top block parts are in order");
assert(partAt[partAt.length - 1] < listStart, "AGENTS.md's top block comes before the full TLDR lines");
['🔴', '🟡', '🟢', '🤖 Claude decided:', 'Full TLDR (for the reviewers)'].forEach((mark) => {
  assert(tldrRule.includes(mark), `AGENTS.md's TLDR says "${mark}"`);
});

// The template: the same four parts, in order, before the "### Full TLDR (for the reviewers)"
// heading, which comes before the nine lines; each colour marker and the "Claude decided" mark appear.
const templateParts = ['**Summary:**', '**Most impactful changes**', '**Decisions made**', '**Before you merge**'];
const fullAt = tldr.indexOf('### Full TLDR (for the reviewers)');
const firstLineAt = tldr.indexOf('- **What and why:**');
const tPartAt = templateParts.map((part) => tldr.indexOf(part));
assert(tPartAt.every((at) => at >= 0), `the template has the top block's parts (${templateParts.join(' | ')})`);
assert(tPartAt.every((at, i) => i === 0 || at > tPartAt[i - 1]), "the template's top block parts are in order");
assert(fullAt > tPartAt[tPartAt.length - 1] && firstLineAt > fullAt,
  'the template puts the full TLDR lines under "### Full TLDR (for the reviewers)", after the top block');
['🔴', '🟡', '🟢', '🤖 Claude decided:'].forEach((mark) => {
  assert(tldr.includes(mark), `the template says "${mark}"`);
});

process.stdout.write(`\npr-template: ${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
