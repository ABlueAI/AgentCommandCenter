'use strict';
// Run: node app/project-agents.test.js
//
// The repo's own `.claude/agents/` sits on Mako's role-launch path: role-definition-resolver.js
// parses every `.md` there (project scope outranks the user-level roles) and refuses a launch if any
// frontmatter is unparseable. A project agent whose `name` matched a Mako role would also shadow
// that role. This pins both: every tracked project agent parses under Mako's frontmatter grammar,
// and none reuses a role name from agent-roles/.

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

process.stdout.write(`\nproject-agents: ${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
