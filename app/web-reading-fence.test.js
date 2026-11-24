'use strict';
// Run: node app/web-reading-fence.test.js
//
// S58 FENCED WEB-READING AGENTS (docs/PLAN-1.1.md). Every agent that reads the open web runs fenced: a
// tool allowlist plus a guard hook, as S15's page reader does. This test holds that true for the
// definitions in the repository and shows the guard refusing visibly:
//   1. the drift check itself catches each way a web-reading definition can slip its fence;
//   2. every tracked role in agent-roles/ passes it against main.js FENCED_ROLES, and the tracked set
//      equals main.js VALID_ROLES (a new role file can't arrive without the launcher knowing it);
//   3. every subagent in .claude/agents/ passes it with NO fenced set: none may read the web;
//   4. the real fence hook refuses, with exit 2 and a constant reason, every tool outside its allowlist,
//      for each fenced role's deployed matcher, and still allows what the roles need;
//   5. the hook's allowlist equals the policy's (drift tripwire; the hook is deployed standalone).

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const policy = require('./role-fence-policy');
const { parseRoleFrontmatter } = require('./role-frontmatter');

const REPO = path.join(__dirname, '..');
const ROLES_DIR = path.join(REPO, 'agent-roles');
const SUBAGENTS_DIR = path.join(REPO, '.claude', 'agents');
const HOOK_SRC = path.join(REPO, 'scripts', 'hooks', 'fence-write.js');

let passed = 0;
let failed = 0;
function assert(cond, msg) {
  if (cond) { passed++; process.stdout.write('  ok   ' + msg + '\n'); } else { failed++; process.stdout.write('  FAIL ' + msg + '\n'); }
}
function section(name) { process.stdout.write('\n' + name + '\n'); }

// main.js needs Electron, so its two role sets are read from source. A missing or reshaped
// declaration fails here, visibly, rather than reading as an empty set.
function setFromMain(name) {
  const src = fs.readFileSync(path.join(__dirname, 'main.js'), 'utf8');
  const m = new RegExp('const ' + name + " = new Set\\(\\[([^\\]]*)\\]\\);").exec(src);
  if (!m) return null;
  return new Set(m[1].split(',').map((s) => s.trim().replace(/^'|'$/g, '')).filter(Boolean));
}

function definitions(dir) {
  return fs.readdirSync(dir).filter((f) => f.endsWith('.md') && f !== 'README.md').sort()
    .map((f) => ({ file: f, text: fs.readFileSync(path.join(dir, f), 'utf8').replace(/\r\n/g, '\n') }));
}

// Deploy the hook the way sync-roles.ps1 does (a copy at a fixed path, the placeholder substituted),
// so the policy's hook-identity and matcher checks run against real files.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mako-web-fence-'));
const hookPath = path.join(tmp, 'fence-write.js');
fs.copyFileSync(HOOK_SRC, hookPath);
const sha = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const deploy = (text) => text.split('__CC_HOOK__').join(hookPath.replace(/\\/g, '/'));
const checkFenced = (role, text) => policy.assertFencedRoleDefinition({
  role, text: deploy(text), canonicalHookPath: hookPath, trackedHookSha256: sha(HOOK_SRC), fsx: fs, hashFile: sha,
});
const problemsOf = (defs, fencedRoles) => policy.webReadingFenceProblems({ definitions: defs, fencedRoles, checkFenced });

const sandboxDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mako-web-fence-hook-'));
const FENCED_ROLES = setFromMain('FENCED_ROLES');
const VALID_ROLES = setFromMain('VALID_ROLES');
const roles = definitions(ROLES_DIR);
const scoutText = roles.find((d) => d.file === 'web-scout.md').text;
const reviewerText = roles.find((d) => d.file === 'reviewer.md').text;

section('1. The drift check catches each way out of the fence');
{
  const P = policy.WEB_FENCE_PROBLEM;
  const one = (text, fenced) => problemsOf([{ file: 'x.md', text }], fenced || []);
  assert(policy.isWebReadingTool('WebFetch') && policy.isWebReadingTool('WebSearch') && policy.isWebReadingTool('mcp__any__tool'),
    'WebFetch, WebSearch and every MCP tool count as web-reading');
  assert(policy.isWebReadingTool('Agent') && policy.isWebReadingTool('Task') && policy.isWebReadingTool('SomeFutureTool') && policy.isWebReadingTool(undefined),
    'the delegation tools, an unknown tool name and a non-string also count (allowlist, not a list of web tools)');
  assert(policy.NON_WEB_TOOLS.every((t) => !policy.isWebReadingTool(t)) && policy.WEB_READING_TOOLS.every((t) => policy.NON_WEB_TOOLS.indexOf(t) === -1),
    'only the reviewed NON_WEB_TOOLS do not, and neither web tool is among them');
  const unfencedFetch = one(reviewerText.replace('tools: Read, Grep, Glob', 'tools: Read, Grep, Glob, WebFetch'));
  assert(unfencedFetch.length === 1 && unfencedFetch[0].problem === P.NOT_FENCED, 'an unfenced role that declares WebFetch is caught');
  const unfencedSearch = one(reviewerText.replace('tools: Read, Grep, Glob', 'tools: Read, WebSearch'));
  assert(unfencedSearch.length === 1 && unfencedSearch[0].problem === P.NOT_FENCED, 'an unfenced role that declares WebSearch is caught');
  const unfencedMcp = one(reviewerText.replace('tools: Read, Grep, Glob', 'tools: Read, mcp__fetch__fetch'));
  assert(unfencedMcp.length === 1 && unfencedMcp[0].problem === P.NOT_FENCED, 'an unfenced role that declares an MCP tool is caught');
  for (const t of ['Agent', 'Task', 'SomeFutureTool']) {
    const r = one(reviewerText.replace('tools: Read, Grep, Glob', 'tools: Read, Grep, Glob, ' + t));
    assert(r.length === 1 && r[0].problem === P.NOT_FENCED, 'an unfenced role that declares ' + t + ' is caught');
  }
  const spec = one(reviewerText.replace('tools: Read, Grep, Glob', 'tools: Read, WebFetch(domain:example.org)'));
  assert(spec.length === 1 && (spec[0].problem === P.UNPARSEABLE || spec[0].problem === P.NOT_FENCED), 'a tool with a permission specifier such as WebFetch(domain:x) is caught');
  const noTools = one(reviewerText.replace('tools: Read, Grep, Glob\n', ''));
  assert(noTools.length === 1 && noTools[0].problem === P.TOOLS_NOT_DECLARED, 'a role with no tools line (inherits every tool, the web ones too) is caught');
  const emptyTools = one(reviewerText.replace('tools: Read, Grep, Glob', 'tools:'));
  assert(emptyTools.length === 1 && emptyTools[0].problem === P.TOOLS_NOT_DECLARED, 'a role with an empty tools line is caught');
  const unparseable = one('no frontmatter here\n');
  assert(unparseable.length === 1 && unparseable[0].problem === P.UNPARSEABLE, 'a definition that does not parse is caught, not skipped');
  const noHook = one(scoutText.replace(/hooks:\n[\s\S]*?\n---\n/, '---\n'), ['web-scout']);
  assert(noHook.length === 1 && noHook[0].problem === P.FENCE_REFUSED && noHook[0].detail === policy.REASON.PRETOOLUSE_MISSING,
    'a fenced web role whose guard hook is gone is caught, with the policy reason');
  const bash = one(scoutText.replace('tools: WebSearch, WebFetch, Read, Write', 'tools: WebSearch, WebFetch, Read, Write, Bash'), ['web-scout']);
  assert(bash.length === 1 && bash[0].detail === policy.REASON.FORBIDDEN_TOOL, 'a fenced web role that adds Bash is caught');
  const grep = one(scoutText.replace('tools: WebSearch, WebFetch, Read, Write', 'tools: WebSearch, WebFetch, Read, Write, Grep'), ['web-scout']);
  assert(grep.length === 1 && grep[0].detail === policy.REASON.TOOL_NOT_ALLOWED, 'a fenced web role that adds a tool outside the allowlist is caught');
  const dup = problemsOf([{ file: 'a.md', text: reviewerText }, { file: 'b.md', text: reviewerText }], []);
  assert(dup.length === 1 && dup[0].problem === P.DUPLICATE_NAME && dup[0].file === 'b.md', 'two definitions with the same name are caught');
  const threw = policy.webReadingFenceProblems({ definitions: [{ file: 'w.md', text: scoutText }], fencedRoles: ['web-scout'], checkFenced: () => { throw new Error('x'); } });
  assert(threw.length === 1 && threw[0].problem === P.FENCE_REFUSED && threw[0].detail === 'check-threw:Error', 'a fence check that throws counts as refused, with the error class');
  assert(one(reviewerText).length === 0 && one(scoutText, ['web-scout']).length === 0, 'the tracked reviewer (unfenced) and web-scout (fenced) pass');
}

section('2. Every tracked role passes against main.js');
{
  assert(FENCED_ROLES instanceof Set && FENCED_ROLES.size > 0, 'main.js declares FENCED_ROLES');
  assert(VALID_ROLES instanceof Set && VALID_ROLES.size > 0, 'main.js declares VALID_ROLES');
  const names = roles.map((d) => parseRoleFrontmatter(d.text).name).sort();
  assert(JSON.stringify(names) === JSON.stringify(Array.from(VALID_ROLES || []).sort()),
    'agent-roles/ holds exactly the roles main.js can launch (' + names.join(', ') + ')');
  assert(Array.from(FENCED_ROLES || []).every((r) => VALID_ROLES.has(r)), 'every fenced role is a launchable role');
  const problems = problemsOf(roles, FENCED_ROLES || new Set());
  for (const p of problems) process.stdout.write('  problem: ' + p.file + ' ' + p.problem + (p.detail ? ' (' + p.detail + ')' : '') + '\n');
  assert(problems.length === 0, 'no tracked role reads the web unfenced, and every fenced role passes the fence policy');
  const webReaders = roles.filter((d) => parseRoleFrontmatter(d.text).tools.some(policy.isWebReadingTool))
    .map((d) => parseRoleFrontmatter(d.text).name).sort();
  assert(webReaders.length > 0 && webReaders.every((r) => FENCED_ROLES.has(r)),
    'the web-reading roles (' + webReaders.join(', ') + ') are all fenced');
}

section('3. No subagent in .claude/agents/ reads the web');
{
  const subs = definitions(SUBAGENTS_DIR);
  assert(subs.length > 0, '.claude/agents/ holds subagent definitions');
  const problems = problemsOf(subs, []);
  for (const p of problems) process.stdout.write('  problem: ' + p.file + ' ' + p.problem + '\n');
  assert(problems.length === 0, 'every subagent declares its tools and none is web-reading (they read untrusted diffs and are never fenced)');
}

section('4. The real guard hook refuses every tool outside the allowlist, visibly');
{
  const sandbox = sandboxDir;
  const run = (tool, input, mode) => {
    const env = Object.assign({}, process.env);
    if (mode === undefined) delete env.BLUE_HELM_CONTROLLED_WEBFETCH_MODE; else env.BLUE_HELM_CONTROLLED_WEBFETCH_MODE = mode;
    return spawnSync(process.execPath, [hookPath], {
      input: JSON.stringify({ cwd: sandbox, tool_name: tool, tool_input: input || {} }), env, encoding: 'utf8',
    });
  };
  const outside = ['Bash', 'PowerShell', 'Grep', 'Glob', 'NotebookEdit', 'TodoWrite', 'Agent', 'Task', 'LS', 'read', 'SomeFutureTool'];
  for (const mode of [undefined, 'disabled', 'https://example.com']) {
    for (const t of outside) {
      const r = run(t, { command: 'curl https://example.org', pattern: 'x', path: sandbox, file_path: path.join(sandbox, 'a.md') }, mode);
      assert(r.status === 2 && r.stderr.indexOf('[fence-tool-not-allowed]') !== -1 && r.stderr.indexOf(sandbox) === -1,
        t + ' refuses with exit 2 and the constant reason (mode ' + (mode === undefined ? 'unset' : mode) + ')');
    }
  }
  const mcp = run('mcp__fetch__fetch', { url: 'https://example.org' });
  assert(mcp.status === 2 && mcp.stderr.indexOf('[fence-page-denied]') !== -1, 'an MCP tool outside the page-reader grant refuses');
  assert(run('Read', { file_path: path.join(sandbox, 'page-request.json') }).status === 0, 'Read inside the sandbox is still allowed');
  assert(run('Write', { file_path: path.join(sandbox, 'report.md'), content: 'x' }).status === 0, 'Write of the report is still allowed');
  const out = run('Write', { file_path: path.join(os.tmpdir(), 'elsewhere.md'), content: 'x' });
  assert(out.status === 2 && out.stderr.indexOf('[fence-outside-sandbox]') !== -1, 'Write outside the sandbox still refuses');
  assert(run('WebSearch', { query: 'x' }).status === 0, 'WebSearch reaching the hook is allowed (it has no path or destination to gate)');
  assert(run('WebFetch', { url: 'https://example.org' }, 'disabled').status === 0, 'WebFetch in disabled mode keeps the ordinary permission flow');
  const fetchNoMode = run('WebFetch', { url: 'https://example.org' });
  assert(fetchNoMode.status === 2 && fetchNoMode.stderr.indexOf('[fence-webfetch-denied]') !== -1, 'WebFetch with no mode still refuses');

  // Every fenced role's deployed matcher routes only allowlisted tools (or its own MCP grant) to the
  // hook, so the hook never refuses a tool the role was granted.
  let rolesChecked = 0;
  let toolsRun = 0;
  for (const d of roles) {
    const parsed = parseRoleFrontmatter(deploy(d.text));
    if (!FENCED_ROLES || !FENCED_ROLES.has(parsed.name)) continue;
    rolesChecked++;
    const matcher = parsed.events.PreToolUse.map((e) => String(e.matcher)).join('|');
    const routed = matcher.split('|');
    const grant = policy.roleMcpTools(parsed.name);
    assert(routed.every((t) => policy.ALLOWED_TOOLS.indexOf(t) !== -1 || grant.indexOf(t) !== -1),
      parsed.name + ': its matcher routes only allowlisted tools to the hook (' + matcher + ')');
    for (const t of parsed.tools.filter((x) => routed.indexOf(x) !== -1 && grant.indexOf(x) === -1 && x !== 'WebFetch')) {
      const r = run(t, t === 'Read' || t === 'Write' ? { file_path: path.join(sandbox, 'report.md'), content: 'x' } : { query: 'x' });
      assert(r.status === 0, parsed.name + ': its declared tool ' + t + ' still passes the hook');
      toolsRun++;
    }
  }
  assert(FENCED_ROLES && rolesChecked === FENCED_ROLES.size && toolsRun > 0,
    'every fenced role\'s matcher was checked (' + rolesChecked + ') and its declared tools were run through the hook (' + toolsRun + ')');
}

section('5. The hook carries the policy allowlist (drift tripwire)');
{
  const hook = fs.readFileSync(HOOK_SRC, 'utf8');
  const m = /const HOOK_ALLOWED_TOOLS = \[([^\]]*)\];/.exec(hook);
  const list = m ? m[1].split(',').map((s) => s.trim().replace(/^'|'$/g, '')) : null;
  assert(list && JSON.stringify(list) === JSON.stringify(policy.ALLOWED_TOOLS), 'hook HOOK_ALLOWED_TOOLS === policy ALLOWED_TOOLS');
  assert(policy.FORBIDDEN_TOOLS.every((t) => list && list.indexOf(t) === -1), 'no forbidden tool is on the hook allowlist');
  assert(/\[fence-tool-not-allowed\]'/.test(hook), 'the hook carries the constant tool refusal');
}

fs.rmSync(tmp, { recursive: true, force: true });
fs.rmSync(sandboxDir, { recursive: true, force: true });
process.stdout.write('\nweb-reading-fence: ' + passed + ' passed, ' + failed + ' failed\n');
process.exit(failed ? 1 : 0);
