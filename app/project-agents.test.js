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
  assert(rules.includes('**Depth check before plans and new builds**'), 'AGENTS.md has the depth check');
}

{
  const reviewer = fs.readFileSync(path.join(agentsDir, 'pr-reviewer.md'), 'utf8');
  assert(reviewer.includes('**Run 1 (complete audit):**') && reviewer.includes('**Re-run: check only the delta.**'),
    'pr-reviewer.md does one complete first audit and checks only the delta on a re-run');
  assert(reviewer.includes('**Non-blocking:**'), 'pr-reviewer.md labels low findings non-blocking');
  const rules = fs.readFileSync(path.join(repoRoot, 'AGENTS.md'), 'utf8');
  assert(rules.includes('### The review loop') && rules.includes('**At most 5 runs per PR**') && !rules.includes('At most 3 runs'),
    'AGENTS.md caps review runs at 5, then asks Blue');
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

process.stdout.write(`\nproject-agents: ${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
