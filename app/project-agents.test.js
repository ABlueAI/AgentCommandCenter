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
    && b.includes('**high:**') && b.includes('**medium:**') && b.includes('**low:**') && b.includes('never `setx`'),
    'the shared block keeps run 1 only, report only, any CI state, no size rule, high/medium/low and the key rule');
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
    'AGENTS.md caps review runs at 5 (2 on a docs-only PR), then asks Blue');
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
  // The prompt to load is "Proposed runner prompt (verbatim)"; "Current prompt" only points to it (2026-11-23).
  const prompt = (runner.match(/### Proposed runner prompt \(verbatim\)\s*```text\r?\n([\s\S]*?)\r?\n```/) || [])[1] || '';
  assert(prompt.includes('And nobody has claimed it') && prompt.includes('before any other work, open its PR as a draft titled "Sxx: <session title>"'),
    'docs/RUNNER.md prompt skips claimed sessions and claims its own early');
  assert(/## Current prompt\r?\n[\s\S]*?"Proposed runner prompt \(verbatim\)"/.test(runner),
    'docs/RUNNER.md "Current prompt" points to the proposed runner prompt');
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

process.stdout.write(`\nproject-agents: ${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
