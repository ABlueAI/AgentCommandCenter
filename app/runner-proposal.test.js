'use strict';
// Run: node app/runner-proposal.test.js
//
// Pins session S04's proposed all-day runner (docs/RUNNER.md "S04: the all-day runner") so the
// prompts an interactive session will paste into the scheduled tasks can't silently lose a
// guardrail: the settings block parses, the parallel cap stays at 1 until Blue's Max upgrade
// (BLUE-CHECKLIST.md step 8) is ticked, schedules respect the documented one-hour minimum and avoid
// the on-the-hour late start, the runner prompt keeps the claim, lock, usage-limit, review-loop and
// READY TO MERGE rules, the digest stays read-only, neither writes Codex's handle, and checklist
// step numbers stay unique.

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
const runner = read('docs', 'RUNNER.md');
const checklist = read('BLUE-CHECKLIST.md');

function fenced(heading) {
  const at = runner.indexOf(heading);
  if (at < 0) return '';
  const m = /```text\n([\s\S]*?)\n```/.exec(runner.slice(at));
  return m ? m[1] : '';
}

// Settings block.
const settingsText = fenced('### Runner settings (read on every fire)');
const settings = {};
for (const line of settingsText.split('\n')) {
  const m = /^([a-z_]+): (.+)$/.exec(line.trim());
  if (m) settings[m[1]] = m[2];
}
const cap = Number(settings.parallel_cap);
assert(Number.isInteger(cap) && cap >= 1, `parallel_cap is a whole number >= 1 (got ${settings.parallel_cap})`);
const step8Ticked = /^- \[x\] \*\*8\. /m.test(checklist);
assert(step8Ticked || cap === 1, 'parallel_cap stays 1 until checklist step 8 (Max 5x) is ticked');
const expiry = Number(settings.lock_expiry_hours);
assert(expiry > 0 && expiry <= 6, `lock_expiry_hours is between 0 and 6 (got ${settings.lock_expiry_hours})`);
const hour = Number(settings.status_pr_hour);
assert(Number.isInteger(hour) && hour >= 0 && hour <= 23, 'status_pr_hour is an hour of the day');

function checkCron(name) {
  const value = settings[name] || '';
  const m = /^CRON_TZ=America\/New_York (\S+) (\S+) (\S+) (\S+) (\S+)$/.exec(value);
  assert(Boolean(m), `${name} is a 5-field cron in Eastern time (got "${value}")`);
  if (!m) return;
  // One fixed minute means at most one run an hour (the documented minimum interval); minute 0
  // can start several minutes late, so the docs advise a few minutes past the hour.
  assert(/^\d+$/.test(m[1]) && Number(m[1]) >= 1 && Number(m[1]) <= 59,
    `${name} runs at one fixed minute, not on the hour`);
}
checkCron('runner_schedule');
checkCron('digest_schedule');

// Runner prompt.
const prompt = fenced('### Proposed runner prompt (verbatim)');
assert(prompt.length > 0, 'docs/RUNNER.md has a proposed runner prompt');
const mustHave = [
  ['parallel_cap', 'reads the parallel cap from the settings'],
  ['agent-running', 'uses the agent-running lock'],
  ['runner-lock: expires=', 'lock carries an expiry'],
  ['usage-paused', 'marks a clean stop at a usage limit'],
  ['Never use paid extra usage', 'never uses paid extra usage'],
  ['ABlueAgent or ABlueAI whose title starts with the session ID', 'claim is an open Sxx: PR by the agent or Blue'],
  ['a fork PR, or one by anyone else, never counts', 'fork and stranger PRs never count as claims'],
  ['S03\'s sync issues are not claims', 'S03 sync issues are not claims'],
  ['Leave alone every PR without the runner label', 'fixes only runner-labelled PRs'],
  ['AGENTS.md "The review loop"', 'follows the capped review loop'],
  ['At most 5 runs on a PR', 'caps review runs at 5'],
  ['"Independent review (Opus)"', 'posts the Opus review'],
  ['at-codex', 'replaces Codex\'s handle'],
  ['READY TO MERGE', 'heads its summary READY TO MERGE or NOT READY'],
  ['Never merge', 'never merges'],
  ['or any scheduled task, including this one', 'never edits any scheduled task'],
  ['never stack PRs', 'never stacks PRs'],
  ['Before taking any lock, count live locks again', 're-checks the cap before every new lock'],
  ['remove only your own marker', 'backs off a lock race without dropping the other fire\'s lock'],
  ['lock a PR again (step 5, which re-checks the cap) before any later push to it', 're-locks a PR before a later push'],
  ['"Reviewed head: <full commit SHA>"', 'names the reviewed head in each posted review'],
  ['that is not a draft and whose latest head isn\'t covered', 'reviews only non-draft Codex PRs'],
  ['If 5 such reviews are already posted', 'caps Codex PR reviews at 5'],
  ['labelled runner-status', 'keeps the daily status PR on its own label'],
  ['step 5a never picks it', 'never treats the status PR as an ordinary unit'],
  ['a comment without that line covers the head when it was posted after the latest head commit', 'accepts reviews posted without a Reviewed head line'],
  ['Skip a Codex PR that already has the needs-blue label', 'asks Blue only once about a Codex PR'],
  ['on a Codex PR you never change its row or push', 'never pushes to a Codex PR'],
];
for (const [text, label] of mustHave) assert(prompt.includes(text), `runner prompt ${label}`);
assert(!/@codex/i.test(prompt), 'runner prompt never writes Codex\'s handle');
assert(!prompt.includes('Until session S04 is merged'), 'runner prompt drops the one-at-a-time line');

// Digest prompt.
const digest = fenced('### Proposed digest prompt (verbatim)');
assert(digest.length > 0, 'docs/RUNNER.md has a proposed digest prompt');
assert(digest.includes('never create, edit or comment on anything on GitHub') && digest.includes('never push'),
  'digest prompt is read-only');
assert(digest.includes('"READY TO MERGE: ') && digest.includes('"NOT READY: '), 'digest heads its first line READY TO MERGE or NOT READY');
assert(digest.includes('at-codex') && !/@codex/i.test(digest), 'digest prompt never writes Codex\'s handle');
assert(digest.includes('"NOT READY: runner gated on step N'), 'digest re-checks the runner gate and reports it');
assert(digest.includes('posted by ABlueAgent and edited by no one else') && digest.includes('never quote their text'),
  'digest counts only needs-Blue comments by the agent and never relays others\' text');
assert(digest.includes('"Reviewed head" line names it') && digest.includes('a comment without that line covers the head when it was posted after the latest head commit'),
  'digest decides READY from the reviewed head, or the review time when the line is missing');
assert(digest.includes('no runner activity since yesterday'), 'digest reports a day with no runner activity');

// Checklist numbering (AGENTS.md: a new step takes the next free number, never reused).
const numbers = [...checklist.matchAll(/^- \[[ x]\] \*\*(\d+)\. /gm)].map((m) => Number(m[1]));
const dupes = numbers.filter((n, i) => numbers.indexOf(n) !== i);
assert(dupes.length === 0, `checklist step numbers are unique (duplicates: ${dupes.join(', ') || 'none'})`);
assert(numbers.includes(27) && numbers.includes(28), 'checklist has S04 steps 27 (apply) and 28 (usage credits off)');

process.stdout.write(`\nrunner-proposal: ${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
