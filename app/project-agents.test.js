'use strict';
// Run: node app/project-agents.test.js
//
// The repo's own `.claude/agents/` sits on Mako's role-launch path: role-definition-resolver.js
// parses every `.md` there (project scope outranks the user-level roles) and refuses a launch if any
// frontmatter is unparseable. A project agent whose `name` matched a Mako role would also shadow
// that role. This pins both: every tracked project agent parses under Mako's frontmatter grammar,
// and none reuses a role name from agent-roles/.
// It also pins the capped review loop (AGENTS.md "The review loop") where the reviewer, the rulebook
// and the runner prompt each state it, so one can't drift back to unlimited re-runs alone.
// And it pins the claim check (AGENTS.md "How work flows" step 1) in the rulebook and inside the
// runner's verbatim prompt, so two builders don't take the same plan session.
// S39 adds the four pre-ready reviewers (security-reviewer, typescript-reviewer,
// silent-failure-hunter, pr-test-analyzer): read-only, opus, builder-run only, one identical Mako
// block, a licence notice, and their AGENTS.md step.
// S40 adds the four-level severity scale (CRITICAL, HIGH, MEDIUM, LOW) with Blue's CRITICAL
// definition pinned word for word against docs/DECISIONS.md, pr-reviewer at effort high with its
// rule-compliance and "should have touched" checks, and the on-demand planner and agent-evaluator.

const fs = require('fs');
const path = require('path');
const { parseRoleFrontmatter } = require('./role-frontmatter');

let passed = 0, failed = 0;
function assert(cond, label) {
  if (cond) { process.stdout.write('  ✓ ' + label + '\n'); passed++; }
  else { process.stderr.write('  x FAIL: ' + label + '\n'); failed++; }
}

const repoRoot = path.join(__dirname, '..');
const agentsDir = path.join(repoRoot, '.claude', 'agents');
const rolesDir = path.join(repoRoot, 'agent-roles');

function mdFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...mdFiles(full));
    else if (entry.name.endsWith('.md')) out.push(full);
  }
  return out;
}

const roleNames = new Set();
for (const file of mdFiles(rolesDir)) {
  const parsed = parseRoleFrontmatter(fs.readFileSync(file, 'utf8'));
  if (parsed.ok) roleNames.add(parsed.name);
}
assert(roleNames.has('reviewer') && roleNames.has('builder'),
  `agent-roles/ declares Mako's roles (found: ${[...roleNames].sort().join(', ')})`);

const agents = fs.existsSync(agentsDir) ? mdFiles(agentsDir) : [];
assert(agents.some((f) => path.basename(f) === 'pr-reviewer.md'), '.claude/agents/pr-reviewer.md is tracked');

for (const file of agents) {
  const rel = path.relative(repoRoot, file).split(path.sep).join('/');
  const parsed = parseRoleFrontmatter(fs.readFileSync(file, 'utf8'));
  assert(parsed.ok, `${rel} parses under Mako's role frontmatter grammar${parsed.ok ? '' : ` (refused: ${parsed.reason})`}`);
  if (!parsed.ok) continue;
  assert(!roleNames.has(parsed.name), `${rel} name "${parsed.name}" does not shadow a Mako role`);
}

{
  const parsed = parseRoleFrontmatter(fs.readFileSync(path.join(agentsDir, 'pr-reviewer.md'), 'utf8'));
  const tools = parsed.ok ? parsed.tools : [];
  assert(parsed.ok && parsed.name === 'pr-reviewer', 'pr-reviewer.md declares name pr-reviewer');
  assert(parsed.ok && tools.length > 0 && tools.every((t) => ['Read', 'Grep', 'Glob'].includes(t)),
    `pr-reviewer has only read tools (got ${JSON.stringify(tools)})`);
}

// S39 (ECC PR 1): the four pre-ready reviewers. They read untrusted PR content, so they must stay
// read-only, run only when the builder calls them, and carry the same Mako block and a licence notice.
const PRE_READY = {
  'security-reviewer': 'LICENSES/MIT-ECC.txt',
  'typescript-reviewer': 'LICENSES/MIT-ECC.txt',
  'silent-failure-hunter': 'LICENSES/Apache-2.0.txt',
  'pr-test-analyzer': 'LICENSES/Apache-2.0.txt',
};
const sharedBlocks = [];
for (const [name, licence] of Object.entries(PRE_READY)) {
  const file = path.join(agentsDir, name + '.md');
  const exists = fs.existsSync(file);
  assert(exists, `.claude/agents/${name}.md is tracked`);
  if (!exists) continue;
  const text = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  const parsed = parseRoleFrontmatter(text);
  assert(parsed.ok && parsed.name === name, `${name}.md parses and declares name ${name}`);
  if (!parsed.ok) continue;
  assert(!roleNames.has(parsed.name), `${name} does not shadow a Mako role`);
  const tools = parsed.tools.slice().sort();
  assert(parsed.toolsDeclared && JSON.stringify(tools) === JSON.stringify(['Glob', 'Grep', 'Read']),
    `${name} has exactly Read, Grep and Glob (got ${JSON.stringify(parsed.tools)})`);
  assert(parsed.disallowedTools.length === 0 && Object.keys(parsed.events).length === 0,
    `${name} declares no hooks or disallowedTools`);
  assert(parsed.scalars.model === 'opus', `${name} runs on opus (got ${parsed.scalars.model})`);
  const keys = Object.keys(parsed.scalars).sort();
  assert(JSON.stringify(keys) === '["description","model","name","tools"]',
    `${name} declares only name, description, tools and model (got ${JSON.stringify(keys)}), so no permissionMode, mcpServers or skills`);
  const desc = parsed.scalars.description || '';
  assert(desc.includes('Run by the builder before marking a PR ready') && desc.includes('Not for automatic use.')
    && !/proactively|must be used/i.test(desc),
    `${name}'s description says the builder runs it and never asks to be started automatically`);
  assert(!/```(bash|sh|shell|powershell|pwsh)?\n\s*(npm|npx|tsc|eslint|prettier|vitest|jest|gh|git)\b/m.test(text),
    `${name} has no command blocks`);
  assert(text.includes(licence) && fs.existsSync(path.join(repoRoot, ...licence.split('/'))),
    `${name} names its licence text ${licence}, which exists`);
  assert(!/[A-Za-z]:\\(Users|Windows)\\/i.test(text), `${name} contains no local Windows paths`);
  const m = text.match(/\n## Mako rules for this review[^\n]*\n[\s\S]*?(?=\n## )/);
  assert(m !== null, `${name} has the shared Mako block`);
  if (m) sharedBlocks.push(m[0]);
}
if (sharedBlocks.length > 0) {
  assert(sharedBlocks.length === Object.keys(PRE_READY).length && sharedBlocks.every((b) => b === sharedBlocks[0]),
    'the shared Mako block is identical in all four pre-ready reviewers');
  const b = sharedBlocks[0];
  assert(b.includes('review run 1 only') && b.includes('**Report only, never act.**')
    && b.includes('**Review whatever the CI state is.**') && b.includes('**No file-size or length rule.**')
    && b.includes('**CRITICAL:**') && b.includes('**HIGH:**') && b.includes('**MEDIUM:**') && b.includes('**LOW:**')
    && b.includes('never `setx`'),
    'the shared block keeps run 1 only, report only, any CI state, no size rule, the four-level scale and the key rule');
  assert(b.includes('report it as\n  CRITICAL with its file and line') && b.includes('(C critical, H high, M medium, L low)')
    && b.includes('[CRITICAL|HIGH|MEDIUM|LOW]') && !b.includes('[high|medium|low]'),
    'the shared block ranks an exposed secret CRITICAL and returns four-level verdicts (S40)');
}
{
  const rules = fs.readFileSync(path.join(repoRoot, 'AGENTS.md'), 'utf8');
  assert(Object.keys(PRE_READY).every((n) => rules.includes('`' + n + '`')) && rules.includes('on review run 1 only'),
    'AGENTS.md step 3 names the four pre-ready reviewers and runs them on review run 1 only');
  assert(rules.includes("passes them to `pr-reviewer`'s run 2"),
    "AGENTS.md hands the four's high and medium findings to pr-reviewer's run 2 as previous findings");
  assert(rules.includes('**Depth check before plans and new builds**'), 'AGENTS.md has the depth check');
}

{
  const reviewer = fs.readFileSync(path.join(agentsDir, 'pr-reviewer.md'), 'utf8');
  assert(reviewer.includes('**Run 1 (complete audit):**') && reviewer.includes('**Re-run: check only the delta.**'),
    'pr-reviewer.md does one complete first audit and checks only the delta on a re-run');
  assert(reviewer.includes('**Non-blocking:**'), 'pr-reviewer.md labels low findings non-blocking');
  const rules = fs.readFileSync(path.join(repoRoot, 'AGENTS.md'), 'utf8');
  assert(rules.includes('### The review loop') && rules.includes('**At most 5 runs per PR, 2 on a docs-only PR**') && !rules.includes('At most 3 runs'),
    'AGENTS.md caps review runs at 5 (2 on a docs-only PR), then asks Blue (one extra run for one small last fix, pinned below)');
  const flatRules = rules.replace(/\s+/g, ' ');
  assert(flatRules.includes('touches no sensitive area') && flatRules.includes('or `.github/` gets 5.'),
    'AGENTS.md gives a rulebook, `.claude/` or `.github/` change the full cap of 5');
  assert(reviewer.includes('or 2 times on a docs-only PR'), 'pr-reviewer.md states the docs-only cap of 2');
  const runner = fs.readFileSync(path.join(repoRoot, 'docs', 'RUNNER.md'), 'utf8');
  assert(runner.includes('AGENTS.md "The review loop"') && runner.includes('At most 5 runs on a PR') && !runner.includes('At most 3 runs') && !runner.includes('re-run it after fixes, and cite'),
    'docs/RUNNER.md prompt uses the capped review loop');
}

{
  const rules = fs.readFileSync(path.join(repoRoot, 'AGENTS.md'), 'utf8');
  assert(rules.includes('**Claim a plan session before building it.**') && rules.includes('whoever opened it'),
    'AGENTS.md has every builder check for an open Sxx: PR before starting a session');
  const runner = fs.readFileSync(path.join(repoRoot, 'docs', 'RUNNER.md'), 'utf8');
  const prompt = (runner.match(/## Current prompt \(verbatim\)\s*```text\r?\n([\s\S]*?)\r?\n```/) || [])[1] || '';
  assert(prompt.includes('Also skip any READY session that is already claimed') && prompt.includes('open its PR early'),
    'docs/RUNNER.md prompt skips claimed sessions and claims its own early');
}

// S42: the rulebook update from Blue's 1.1 decision sheet (docs/DECISIONS.md 2026-11-16 and
// 2026-11-21). Pins each rule in AGENTS.md (and the Codex lane's matching lines) so none drifts
// out unnoticed.
{
  const rules = fs.readFileSync(path.join(repoRoot, 'AGENTS.md'), 'utf8');
  const flat = rules.replace(/\s+/g, ' ');
  assert(flat.includes('**Certainty labels**') && flat.includes('**verified**') && flat.includes("**builder's reading**") && flat.includes('**not verified**'),
    'AGENTS.md defines the three certainty labels');
  assert(flat.includes('**Scope freeze**') && flat.includes('From 2026-12-01, anything new that isn\'t vital to security goes to the 1.2 queue'),
    'AGENTS.md freezes the 1.1 scope from 2026-12-01');
  assert(flat.includes('Opus 5.5 for building and planning') && flat.includes('Sonnet 5.5 for triage, chores and summaries') &&
    flat.includes('never Haiku unless Blue asks') && flat.includes('never Fable') && flat.includes('No API credits, ever') &&
    !flat.includes('Sonnet for routine work, Opus for hard problems'),
    'AGENTS.md carries the model rule and drops the old Sonnet/Opus split');
  assert(flat.includes('No China-origin AI') && flat.includes('anything Mako runs, installs or calls') &&
    flat.includes("named only in an upstream file Mako doesn't ship is not a fail") && flat.includes('static mode only'),
    'AGENTS.md carries the clarified China-origin rule');
  assert(flat.includes('the builder of the UI sessions (S66 and S18 to S20') && flat.includes('does the smaller tasks and the reviews') &&
    !flat.includes('the builder of the UI sessions S17 to S20'),
    'AGENTS.md: Claude builds the UI, Codex does the smaller tasks and the reviews');
  assert(flat.includes("Blue's desktop login (`ABlueAI`) is read-only here: it never runs or posts a Codex PR's review") &&
    !flat.includes('(by `ABlueAgent` or `ABlueAI`, unedited'),
    "AGENTS.md: a Claude cloud session posts Codex PR reviews; Blue's desktop login never does");
  assert(flat.includes('**Dependabot PRs** (issue #205)') && flat.includes('**Dependabot PRs** never make another PR wait') &&
    flat.includes('No agent pushes to a Dependabot branch') && flat.includes('`security-reviewer` always') &&
    flat.includes('Each bumped package also goes through the pin-and-scan step'),
    'AGENTS.md settles how Dependabot PRs are reviewed and ordered (issue #205)');
  assert(flat.includes('it has Codex\'s pass ("Hard rules" item 9); if Codex doesn\'t review it, it is `NOT READY: no Codex pass`'),
    "AGENTS.md: a Dependabot PR needs Codex's pass too (hard rule 9)");
  const collab = fs.readFileSync(path.join(repoRoot, 'docs', 'AI-COLLABORATION.md'), 'utf8').replace(/\s+/g, ' ');
  assert(!/optional reviewer/i.test(collab) && collab.includes('The required second reviewer'),
    "docs/AI-COLLABORATION.md: Codex is the required second reviewer, as in AGENTS.md");
  assert(flat.includes('one sitting each evening, about 10 minutes') && flat.includes('PC checks on Tuesday and Friday evenings'),
    'AGENTS.md records the merge sitting and the PC-check evenings');
  assert(flat.includes('ask Claude to list its subagents') && !/run `?\/agents/.test(flat),
    'AGENTS.md says to ask Claude to list its subagents, not to run /agents');
  const lane = fs.readFileSync(path.join(repoRoot, 'docs', 'CODEX-BUILDER-LANE.md'), 'utf8').replace(/\s+/g, ' ');
  assert(lane.includes("Blue's desktop login (`ABlueAI`) is read-only and never posts one") &&
    lane.includes("never from Blue's desktop login") && !lane.includes('by `ABlueAI`, or by `ABlueAgent` with a "Run by:" line'),
    'docs/CODEX-BUILDER-LANE.md items 5 and 7 match: reviews come from a Claude cloud session only');
  // Codex may build sensitive work too (Blue, docs/DECISIONS.md 2026-11-25); the UI and the
  // Composer's dispatch tools stay Claude's, and the comment hand-off (lane item 3) isn't widened.
  const schedule = fs.readFileSync(path.join(repoRoot, 'docs', 'SCHEDULE-1.1.md'), 'utf8').replace(/\s+/g, ' ');
  assert(flat.includes('for sensitive work too') && flat.includes('docs/DECISIONS.md 2026-11-25') &&
    flat.includes("never the UI sessions or the Composer's dispatch tools") &&
    !flat.includes("second builder for `windows`-lane sessions that aren't sensitive"),
    'AGENTS.md: Codex may build sensitive work, never the UI or the dispatch tools');
  assert(lane.includes('since 2026-11-25 sensitive work too') && !lane.includes('sessions that are not marked Sensitive') &&
    lane.includes('The comment hand-off (item 3) is not widened') &&
    flat.includes("for a `windows`-lane session that isn't sensitive"),
    'docs/CODEX-BUILDER-LANE.md: item 1 lets Codex build sensitive work; item 3 hand-off unchanged');
  assert(!schedule.includes('Codex builds only non-sensitive rows') && schedule.includes('Codex builds rows in sensitive areas too, for example security fixes'),
    'docs/SCHEDULE-1.1.md matches the 2026-11-25 decision');
  assert(!collab.includes("second builder for `windows`-lane sessions that aren't sensitive") &&
    collab.includes('for sensitive work too (docs/DECISIONS.md 2026-11-25)'),
    'docs/AI-COLLABORATION.md matches the 2026-11-25 decision');
  // The safeguards Codex's sensitive builds rely on: security-reviewer on run 1 for a sensitive PR,
  // and security findings cut to title and severity in fix requests.
  assert(flat.includes('`security-reviewer` when the PR touches a sensitive area') &&
    lane.includes('also gets `security-reviewer` on review run 1') &&
    lane.includes('A fix request (item 6) for a security finding gives its title and severity only'),
    'a sensitive Codex PR gets security-reviewer on run 1, and its security fix requests stay title and severity');
  const decisions = fs.readFileSync(path.join(repoRoot, 'docs', 'DECISIONS.md'), 'utf8').replace(/\s+/g, ' ');
  assert(decisions.includes('## 2026-11-25: Codex may build sensitive items too') &&
    decisions.includes('"ignore the sensitivity rules if need be, we need to cook through usage over there"'),
    'docs/DECISIONS.md has the 2026-11-25 entry the rules cite, with Blue\'s words');
}

{
  // Hard rules (adopted 2026-11-23): the list sits near the top, Codex's pass is required for
  // READY TO MERGE, and the pacing numbers are Blue's 24 pushes and 120 writes an hour.
  const rules = fs.readFileSync(path.join(repoRoot, 'AGENTS.md'), 'utf8');
  const hard = (rules.match(/## Hard rules \(never broken\)\r?\n([\s\S]*?)\r?\n## /) || [])[1] || '';
  assert(hard.length > 0 && rules.indexOf('## Hard rules (never broken)') < rules.indexOf('## The shared brain'),
    'AGENTS.md has "Hard rules (never broken)" before "The shared brain"');
  assert(hard.includes('never assume') && hard.includes('Every other rule in this file is a default'),
    'the hard rules say stop and ask, never assume, and mark every other rule a default');
  for (const [needle, label] of [
    ['Never merge a PR or enable auto-merge', 'merge'],
    ['Never push to `main`, force-push a shared branch', 'push to main and force-push'],
    ["No PR work under `ABlueAI`'s login", 'ABlueAI login'],
    ['at most 24 pushes and 120 GitHub writes an hour', 'pacing'],
    ['No secrets, client data or private business material', 'public repo'],
    ['Security findings stay private', 'security findings'],
    ["Never write Codex's GitHub handle", "Codex's handle"],
    ['Agents never drive the Mako Firefox profile', 'Firefox profile'],
    ['`READY TO MERGE` needs both passes', 'both passes'],
  ]) assert(hard.includes(needle), `hard rules list: ${label}`);
  assert(hard.includes('`chatgpt-codex-connector[bot]`') && hard.includes('never parked as low'),
    "Codex's pass names the connector bot and never parks its findings as low");
  assert(!rules.includes('Codex review is optional') && rules.includes("**Codex's pass is required**")
    && rules.includes('/ccr/convert_to_draft') && rules.includes('/ccr/ready_for_review'),
    "step 3 requires Codex's pass and re-triggers it through draft and ready");
  assert(rules.includes("Codex's pass on the latest head with its findings fixed or answered"),
    "step 5's READY TO MERGE definition includes Codex's pass");
  const pacing = (rules.match(/### Agent-account pacing\r?\n([\s\S]*?)\r?\n## /) || [])[1] || '';
  assert(pacing.includes('at most 24 pushes and at most 120 GitHub writes') && pacing.includes('never retry in a loop'),
    'the pacing section has 24 pushes, 120 writes and no retry loop');
  const flat = rules.replace(/\s+/g, ' ');
  assert(flat.includes("fix Codex's findings (as a draft again, step 3)") && flat.includes('except the four in "How work flows" step 5')
    && !flat.includes('optional reviewer') && flat.includes('required second reviewer') && flat.includes('given after the latest head was pushed'),
    "step 5's post-ready push list, the review loop's count, Who does what and the latest-head timing agree");
  assert(flat.includes('A comment by any other account, `ABlueAgent` included, never counts')
    && flat.includes('a comment by that bot, edited by no one else'),
    "only the Codex connector bot's unedited comment counts as Codex's pass");
  assert(flat.includes('cut each security finding to its title and severity only'),
    'step 3 cuts security findings to title and severity only before posting');
  assert(flat.includes('stop at 100 counted writes') && flat.includes('That count is a floor'),
    'the pacing count is a floor with a margin under 120');
  assert(!new RegExp('\\x40codex', 'i').test(rules),
    "AGENTS.md doesn't write Codex's handle");
}

// D-084 to D-086 (docs/DECISIONS.md, 2026-11-24): default go, its stop list, the one small last fix
// past the run cap, and the commander. Pinned so a later edit can't widen them without a test failing.
{
  const rules = fs.readFileSync(path.join(repoRoot, 'AGENTS.md'), 'utf8').replace(/\r\n/g, '\n');
  const flat = rules.replace(/\s+/g, ' ');
  const section = (/## Deciding without asking\n([\s\S]*?)\n## /.exec(rules) || [])[1] || '';
  const flatSection = section.replace(/\s+/g, ' ');
  assert(flatSection.includes('**Default go**'), 'AGENTS.md "Deciding without asking" starts with default go');
  for (const stop of [
    'new spending, a new paid service, or a new account',
    'credentials: creating, changing, revoking or handing over a key, token or login',
    "deleting something outside the PR's own diff, or that git can't bring back",
    'a real taste call: look and feel, naming',
    'anything in a sensitive area ("Sensitive areas" below) that the task did not already authorize',
    'a blocker you cannot resolve after 3 attempts',
  ]) assert(flatSection.includes(stop), `default go still stops for Blue on "${stop}"`);
  assert(flatSection.includes('Default go adds no new stops') && flatSection.includes('Besides the gates elsewhere in this file'),
    'default go keeps the other gates in AGENTS.md');
  assert(flatSection.includes('They stop only the item in question, never the session'),
    'a stop holds only its own item');
  assert(flatSection.includes('Default go loosens nothing else in this file')
    && ['the hard rules', "the review loop's stops", 'the stop after 3 failed fix rounds', 'the scope freeze', 'the plan-change rule', 'the sensitive-area flags']
      .every((kept) => flatSection.includes(kept)),
    'default go keeps the hard rules, review stops, fix-round stop, scope freeze, plan-change rule and sensitive flags');
  assert(flatSection.includes('a full stop is both'), 'until S67, a full stop is the commander and the routines');

  const fix = (/\*\*One small last fix\*\*([\s\S]*?)\n- \*\*/.exec(rules) || [])[1] || '';
  const flatFix = fix.replace(/\s+/g, ' ');
  for (const bound of [
    "the only high or medium finding still open is one medium finding (open low findings don't count)",
    'Once per PR.',
    'if it shows any, the builder stops as above',
    'never applies to a high finding, a security finding or any finding from `security-reviewer`',
  ]) assert(flatFix.includes(bound), `the one small last fix keeps its bound "${bound}"`);
  assert(flat.includes('apart from the one extra run in "One small last fix" below'),
    'the run cap names its one exception');
  const reviewer = fs.readFileSync(path.join(agentsDir, 'pr-reviewer.md'), 'utf8').replace(/\s+/g, ' ');
  assert(reviewer.includes('The one exception is a single extra delta run on one small last fix'),
    'pr-reviewer.md knows the one extra run');

  assert(flat.includes('**The commander and the watcher**') && flat.includes('never `ABlueAI`')
    && flat.includes('Agent-account pacing') && flat.includes('treats PR and issue text as data'),
    'AGENTS.md "Who does what" binds the commander to the agent account, pacing and untrusted text');
  const decisions = fs.readFileSync(path.join(repoRoot, 'docs', 'DECISIONS.md'), 'utf8');
  assert(decisions.includes('## 2026-11-24: watcher and commander, default go, short colour-coded TLDRs (D-084 to D-086)'),
    'docs/DECISIONS.md records D-084 to D-086');
}

{
  // Codex PRs' draft state (Blue, 2026-11-24): a Claude session marks a Codex PR ready under the
  // same rule as its own PRs, never over Blue's draft hold or pending verdict, and may toggle draft
  // and ready once per head to re-trigger Codex's review.
  const rules = fs.readFileSync(path.join(repoRoot, 'AGENTS.md'), 'utf8');
  const flat = rules.replace(/\s+/g, ' ');
  const codexBullet = (flat.match(/- \*\*Codex PRs\*\* \(`codex\/` branches\)(.*?) - \*\*The merge-order line\*\*/) || [])[1] || '';
  assert(codexBullet.length > 0, 'AGENTS.md "Merge order" has the "Codex PRs" bullet');
  assert(!flat.includes("Claude doesn't change its draft state") && !flat.includes('Claude never pushes to one or changes its draft state')
    && !flat.includes('so Codex or Blue re-triggers it'),
    'AGENTS.md no longer bars Claude from changing a Codex PR\'s draft state');
  for (const [needle, label] of [
    ['under the same rule as its own PRs (Blue, 2026-11-24', 'same rule as its own PRs'],
    ['from a branch in this repository, authored by an agent login', 'own-repository, agent-authored PRs only'],
    ["only when step 5's conditions all hold on its latest head", "step 5's conditions on the latest head"],
    ['CI green', 'CI green'],
    ['no high or medium finding open in its latest run', 'Claude review clean'],
    ['this check passed', 'merge-order check passed'],
    ['no `needs-blue` or `waits-for-merge` label', 'no needs-blue or waits-for-merge label'],
    ['while Blue has asked for the PR to stay a draft', "Blue's draft hold"],
    ['while a verdict of his on it is pending', "Blue's pending verdict"],
    ['Once CI is green and Claude\'s pass holds on the latest head', 're-trigger precondition'],
    ['at most once per head and never while any hold, pending verdict or label above applies', 're-trigger cap and holds'],
    ['Claude pushes to a Codex PR only as "Who does what" allows', 'push pointer to "Who does what"'],
    ['one Codex already marked ready gets only that label and comment', 'ready Codex PR on a conflict'],
    ["The runner prompt (docs/RUNNER.md) doesn't mark Codex PRs ready yet", 'runner prompt not yet updated'],
  ]) assert(codexBullet.includes(needle), `Codex PRs bullet: ${label}`);
  assert(flat.includes("No builder changes another builder's PR (a Claude session's draft and ready changes on a Codex PR, below, excepted)"),
    '"Who waits" excepts a Claude session\'s draft and ready changes on a Codex PR');
  assert(flat.includes('Claude never pushes to a `codex/` branch unless Blue asks'),
    '"Who does what" keeps the codex/ push ban the Codex PRs bullet points to');
  assert(flat.includes('On a `codex/` PR, a Claude session re-triggers it the same way'),
    'step 3 lets a Claude session re-trigger Codex\'s review on a Codex PR');
  const decisions = fs.readFileSync(path.join(repoRoot, 'docs', 'DECISIONS.md'), 'utf8');
  assert(decisions.includes('## 2026-11-24: Claude sessions mark Codex PRs ready') && decisions.includes('"Yes, sweeper marks ready"'),
    'docs/DECISIONS.md records the 2026-11-24 decision in Blue\'s words');
}

{
  // S40 (ECC PR 2): the four-level severity scale with Blue's CRITICAL definition word for word
  // (docs/DECISIONS.md, 2026-11-16 follow-up answers), a stronger pr-reviewer at effort high, and
  // two on-demand helpers (planner, agent-evaluator) that stay read-only.
  const flat = (t) => t.replace(/\s+/g, ' ');
  // Any fence language, so a ```text or ```ps1 block with commands in it is caught too.
  const CMD_BLOCK = /```[A-Za-z0-9-]*\r?\n\s*(npm|npx|tsc|eslint|prettier|vitest|jest|gh|git|node|python|pip|curl|wget)\b/m;
  const decisions = flat(fs.readFileSync(path.join(repoRoot, 'docs', 'DECISIONS.md'), 'utf8'));
  const def = (decisions.match(/\*\*CRITICAL is defined\*\* as (a finding that would: .*? LOW goes to follow-ups\.)/) || [])[1] || '';
  assert(def.length > 200 && def.includes('stop Mako from starting on `main`'),
    "docs/DECISIONS.md holds Blue's CRITICAL definition");
  const rules = flat(fs.readFileSync(path.join(repoRoot, 'AGENTS.md'), 'utf8'));
  const loop = (rules.match(/### The review loop (.*?) ### Merge order/) || [])[1] || '';
  assert(loop.includes('**Severity scale: CRITICAL, HIGH, MEDIUM, LOW**') && loop.includes('**CRITICAL** is ' + def),
    'AGENTS.md "The review loop" has the four-level scale and Blue\'s CRITICAL definition word for word');
  assert(loop.includes('ranks each CRITICAL, HIGH, MEDIUM or LOW') && !loop.includes('ranks each high, medium or low'),
    'AGENTS.md run 1 ranks on the four-level scale');
  for (const [needle, label] of [
    ['pushes nothing more to it and runs no further review on it', 'no push or run after a CRITICAL'],
    ['adds the `needs-blue` label', 'needs-blue label'],
    ['a PR comment starting `@ABlueAI needs Blue: CRITICAL finding`', 'PR comment to Blue'],
    ['starting `NOT READY: CRITICAL finding`', 'session-end message and notification'],
    ['A security finding is cut to its title and severity in all three', 'security findings stay private'],
    ["work resumes only on Blue's answer", "resumes only on Blue's answer"],
    ['holds for a CRITICAL one too', 'lower-case rules cover CRITICAL'],
    ['keeps it a draft (converting it back if it was ready)', 'a ready PR goes back to draft'],
    ['`@ABlueAI needs Blue: CRITICAL finding on main`', 'a CRITICAL already on main is reported'],
    ['posts no fix request for it', 'no Codex fix request until Blue answers'],
    ['on a Dependabot PR it leaves the draft state alone', 'Dependabot draft state left alone'],
  ]) assert(loop.includes(needle), `AGENTS.md CRITICAL handling: ${label}`);
  assert(rules.includes('`planner`') && rules.includes('`agent-evaluator`') && rules.includes('docs/HARNESS-CHANGES.md')
    && fs.existsSync(path.join(repoRoot, 'docs', 'HARNESS-CHANGES.md')),
    'AGENTS.md names the on-demand helpers and docs/HARNESS-CHANGES.md, which exists');
  assert(rules.includes('it is not a required gate'), "AGENTS.md keeps the harness eval method optional (Blue's \"method as text\")");
  const harness = fs.readFileSync(path.join(repoRoot, 'docs', 'HARNESS-CHANGES.md'), 'utf8');
  assert(harness.includes('harness-optimizer') && harness.includes('LICENSES/MIT-ECC.txt') && harness.includes('pass^k')
    && harness.includes('Regression evals'),
    'docs/HARNESS-CHANGES.md carries the eval method and its ECC notice');

  const reviewerText = fs.readFileSync(path.join(agentsDir, 'pr-reviewer.md'), 'utf8').replace(/\r\n/g, '\n');
  const rp = parseRoleFrontmatter(reviewerText);
  assert(rp.ok && rp.scalars.model === 'opus' && rp.scalars.effort === 'high',
    `pr-reviewer runs on opus at effort high (got ${rp.ok ? rp.scalars.model + '/' + rp.scalars.effort : 'unparsed'})`);
  assert(rp.ok && JSON.stringify(Object.keys(rp.scalars).sort()) === '["description","effort","model","name","tools"]',
    'pr-reviewer declares only name, description, tools, model and effort, so no permissionMode, mcpServers or skills');
  assert(rp.ok && JSON.stringify(rp.tools.slice().sort()) === JSON.stringify(['Glob', 'Grep', 'Read'])
    && rp.disallowedTools.length === 0 && Object.keys(rp.events).length === 0,
    'pr-reviewer has exactly Read, Grep and Glob and no hooks');
  const fr = flat(reviewerText);
  assert(fr.includes('**CRITICAL** is ' + def), "pr-reviewer.md has Blue's CRITICAL definition word for word");
  assert(fr.includes('(C critical, H high, M medium, L low)') && fr.includes('[CRITICAL|HIGH|MEDIUM|LOW]')
    && !fr.includes('[high|medium|low]') && fr.includes('ranked CRITICAL, HIGH, MEDIUM or LOW'),
    'pr-reviewer.md returns four-level verdicts');
  assert(fr.includes('5. **Rule compliance.**') && fr.includes('6. **What the diff should have touched.**'),
    'pr-reviewer.md has the rule-compliance and "should have touched" checks');
  assert(fr.includes('If the answer to 4 is "no", lower it to a level you can defend.')
    && fr.includes('report it one level lower and mark it "not verified"'),
    'pr-reviewer.md lowers, never drops, a real finding whose severity is wrong, and marks unsure ones not verified');
  assert(fr.includes('**CRITICAL and HIGH need proof.**') && fr.includes('**Zero findings is a valid review.**'),
    "pr-reviewer.md keeps code-reviewer's proof rule and zero-findings rule");
  assert(reviewerText.includes('LICENSES/MIT-ECC.txt') && reviewerText.includes('d2ef2680594f9a17526a6e1a2e18b3d242c5d17b'),
    'pr-reviewer.md names the ECC source commit and licence text it folds in');
  assert(!CMD_BLOCK.test(reviewerText),
    'pr-reviewer has no command blocks');
  for (const n of Object.keys(PRE_READY)) {
    const t = flat(fs.readFileSync(path.join(agentsDir, n + '.md'), 'utf8'));
    assert(t.includes('**CRITICAL:** ' + def) && t.includes('ranked CRITICAL, HIGH, MEDIUM or LOW'),
      `${n} uses the four-level scale with Blue's CRITICAL definition word for word`);
  }

  const notices = fs.readFileSync(path.join(repoRoot, 'THIRD-PARTY-NOTICES.md'), 'utf8').split(/\r?\n/);
  for (const f of ['.claude/agents/pr-reviewer.md', '.claude/agents/planner.md', '.claude/agents/agent-evaluator.md', 'docs/HARNESS-CHANGES.md']) {
    const row = notices.find((l) => l.startsWith('| `' + f + '` |')) || '';
    assert(row.includes('LICENSES/MIT-ECC.txt') && row.includes('d2ef2680594f9a17526a6e1a2e18b3d242c5d17b'),
      `THIRD-PARTY-NOTICES.md has the ECC row for ${f}`);
  }
  for (const f of agents.concat([path.join(repoRoot, 'docs', 'HARNESS-CHANGES.md')])) {
    const rel = path.relative(repoRoot, f).split(path.sep).join('/');
    const t = fs.readFileSync(f, 'utf8').replace(/^\uFEFF/, '');
    assert(!/[\p{Cf}\p{Co}]/u.test(t), `${rel} has no invisible (format) or private-use characters`);
    // The header comment may name the upstream scripts; check only the text after it.
    const end = t.indexOf('-->');
    const body = end === -1 ? t : t.slice(end + 3);
    assert(!/harness-audit|run-all\.js|evaluate\.py/.test(body),
      `${rel} runs none of ECC's scripts`);
  }

  for (const name of ['planner', 'agent-evaluator']) {
    const file = path.join(agentsDir, name + '.md');
    const exists = fs.existsSync(file);
    assert(exists, `.claude/agents/${name}.md is tracked`);
    if (!exists) continue;
    const text = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
    const parsed = parseRoleFrontmatter(text);
    assert(parsed.ok && parsed.name === name && !roleNames.has(parsed.name), `${name}.md parses, declares name ${name} and shadows no role`);
    if (!parsed.ok) continue;
    assert(parsed.toolsDeclared && JSON.stringify(parsed.tools.slice().sort()) === JSON.stringify(['Glob', 'Grep', 'Read'])
      && parsed.disallowedTools.length === 0 && Object.keys(parsed.events).length === 0,
      `${name} has exactly Read, Grep and Glob and no hooks`);
    assert(parsed.scalars.model === 'opus' && JSON.stringify(Object.keys(parsed.scalars).sort()) === '["description","model","name","tools"]',
      `${name} runs on opus and declares only name, description, tools and model`);
    const desc = parsed.scalars.description || '';
    assert(desc.includes('On demand only') && desc.includes('Not for automatic use.') && !/proactively|must be used|automatically activated/i.test(desc),
      `${name}'s description says it runs on demand and never starts itself`);
    assert(!CMD_BLOCK.test(text),
      `${name} has no command blocks`);
    assert(text.includes('LICENSES/MIT-ECC.txt') && text.includes('d2ef2680594f9a17526a6e1a2e18b3d242c5d17b')
      && text.includes('Copyright (c) 2026 Affaan Mustafa'),
      `${name} carries ECC's MIT notice and source commit`);
    assert(!/[A-Za-z]:\\(Users|Windows)\\/i.test(text) && !text.includes('## Prompt Defense Baseline'),
      `${name} has no local Windows paths and no leftover ECC baseline block`);
  }
}

process.stdout.write(`\nproject-agents: ${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
