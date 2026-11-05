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
  ['a comment without that line covers the head when it was posted after the first check run on the latest head commit started', 'accepts reviews posted without a Reviewed head line'],
  ['Skip a Codex PR while a "@ABlueAI needs Blue:" comment from your login has no later reply', 'asks Blue only once about a Codex PR'],
  ['on a Codex PR you never change its row or push', 'never pushes to a Codex PR'],
  ['first remove the usage-paused label and the runner-paused marker', 'clears the paused state when it resumes a PR'],
  ['asking for something that no one else has edited', 'acts only on an unedited ABlueAI comment'],
  ['never post another needs-Blue comment on that PR', 'asks Blue only once and resumes after his reply'],
  ['rank all live locks by expiry, earliest first, and on the same minute by PR number, lowest first: if yours ranks past parallel_cap', 're-counts the global cap after placing a lock and backs off only past the cap'],
  ['and the branch has had no force-push since', 'does not count a review across a force-push'],
  ['if you can\'t check for force-pushes, the comment doesn\'t cover the head', 'treats an unreadable force-push history as not covered'],
  ['an "Independent review (Opus)" comment covers its latest head (as in 5b)', 'marks a PR ready only when a review covers its latest head'],
  ['from then on, work it only as his reply asks, and otherwise skip it', 'settles what happens on a Codex PR after Blue replies'],
  ['and it isn\'t marked ready yet (update its TLDR and mark it ready)', 'picks up a finished PR whose checks passed later'],
  ['it has no needs-blue label and no "@ABlueAI needs Blue:" comment from your login without a later reply', 'never marks a PR ready while Blue is asked'],
  ['it carries the needs-blue label and the latest "@ABlueAI needs Blue:" comment from your login has a later reply', 'resumes its own PR once per answered question'],
  ['remove the needs-blue label, set its row back from NEEDS BLUE to IN PROGRESS (#PR), and do what his reply asks', 'resumes its own PR after Blue answers'],
  ['Merge-order check (AGENTS.md "Merge order"), before marking any PR ready, the status PR too', 'test-merges every PR against the other ready PRs before marking it ready'],
  ['if you can\'t run it, any file both PRs change counts as a conflict', 'treats a test-merge it can\'t run as a conflict on any shared file'],
  ['add the waits-for-merge label (create it if missing), make its TLDR\'s "Ready to merge" line "no (waits for #X; conflicts in <files>)"', 'keeps a conflicting PR a draft with the waits-for-merge label and line'],
  ['it has no waits-for-merge label, and it isn\'t marked ready yet', 'never marks a waiting PR ready'],
  ['or it carries the waits-for-merge label and every PR it waits for is now merged or closed (merge main and resolve the conflict, run a delta review only if content changed beyond the conflict', 'clears its own waiting PR once the blocker is merged or closed'],
  ['then, once every check on the new head passes, do the merge-order check in step 6 again', 'waits for CI on the merge commit before marking a cleared PR ready'],
  ['wait until every check on the new head passes (if they haven\'t finished when the fire ends, a later fire finishes it)', 'waits for CI before marking a cleared status PR ready'],
  ['Also pick, with no review run, a Codex PR carrying the waits-for-merge label whose every PR named in that comment is now merged or closed', 'clears a Codex PR\'s waits-for-merge label without a review run'],
  ['skip a PR that conflicts with main alone and note it', 'skips a PR that conflicts with main alone'],
  ['edit that one comment to name the new blocker instead', 'renames the blocker in its one Codex comment so a failed re-check isn\'t picked every fire'],
  ['first test-merge its head with main alone (if that conflicts, keep the label', 'never clears a Codex PR\'s label while it conflicts with main'],
  ['unless you have already asked Blue on that PR, post the "@ABlueAI needs Blue:" comment and add the needs-blue label', 'asks Blue once about a Codex PR that conflicts with main, so it isn\'t picked every fire'],
  ['if a PR marked ready meanwhile conflicts with it and yours has the higher number, put yours back to draft and wait; otherwise leave the other PR as it is', 'settles two PRs marked ready at once without touching another builder\'s PR'],
  ['only add the waits-for-merge label and one comment "Waits for #X (conflicts in <files>)" without Codex\'s handle', 'only labels and comments on a waiting Codex PR'],
  ['or today\'s status PR carries the waits-for-merge label and every PR it waits for is now merged or closed', 'clears a waiting status PR'],
  ['its last line is "Merge order: #A, then #B; any order: #C, #D"', 'ends a multi-PR summary with the merge-order line'],
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
assert(digest.includes('a review comment or reply whose edit history you can\'t read doesn\'t count either')
  && digest.includes('"NOT READY: needs Blue (comment couldn\'t be checked)"'),
  'digest fails closed on comments whose edit history it cannot read');
assert(digest.includes('if you can\'t check for force-pushes it doesn\'t cover the head'),
  'digest treats an unreadable force-push history as not covered');
assert(digest.includes('First line: the gate line from step 1 if the gate failed, even when PRs are ready'),
  'digest puts a gate failure ahead of any READY TO MERGE headline');
assert(digest.includes('posted by ABlueAgent and edited by no one else') && digest.includes('never quote their text'),
  'digest counts only needs-Blue comments by the agent and never relays others\' text');
assert(digest.includes('"Reviewed head" line names it') && digest.includes('a comment without that line covers the head when it was posted after the first check run on the latest head commit started and the branch has had no force-push since'),
  'digest decides READY from the reviewed head, or the review time when the line is missing');
assert(digest.includes('no runner activity since yesterday'), 'digest reports a day with no runner activity');
assert(digest.includes('no waits-for-merge label (otherwise "NOT READY: waits for #X")'),
  'digest never calls a waiting PR READY TO MERGE');
assert(digest.includes('Last line, when the message lists more than one open PR: "Merge order: #A, then #B; any order: #C, #D"'),
  'digest ends with the merge-order line');

// Merge order (AGENTS.md "Merge order", adopted 2026-11-04).
const rules = read('AGENTS.md');
assert(rules.includes('### Merge order') && rules.includes('git merge-tree --write-tree')
  && rules.includes('any file both PRs change counts as a conflict'),
  'AGENTS.md has the merge-order check, with git merge-tree and the shared-file fallback');
assert(rules.includes('and the PR merges cleanly alongside every other ready PR ("Merge order" below)'),
  'AGENTS.md step 5 marks a PR ready only when it merges alongside every other ready PR');
assert(rules.includes('git -c user.name=merge-check -c user.email=merge-check@invalid commit-tree')
  && rules.includes('conflicts with `main` alone: skip it'),
  'AGENTS.md recipe needs no committer identity and skips a PR that conflicts with main alone');
assert(rules.includes('"Merge order: #A, then #B; any order: #C, #D"'),
  'AGENTS.md step 5 requires the merge-order line');

// Checklist numbering (AGENTS.md: a new step takes the next free number, never reused).
const numbers = [...checklist.matchAll(/^- \[[ x]\] \*\*(\d+)\. /gm)].map((m) => Number(m[1]));
const dupes = numbers.filter((n, i) => numbers.indexOf(n) !== i);
assert(dupes.length === 0, `checklist step numbers are unique (duplicates: ${dupes.join(', ') || 'none'})`);
assert(numbers.includes(27) && numbers.includes(28), 'checklist has S04 steps 27 (apply) and 28 (usage credits off)');
assert(numbers.includes(50), 'checklist has step 50 (apply the merge-order prompts)');

process.stdout.write(`\nrunner-proposal: ${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
