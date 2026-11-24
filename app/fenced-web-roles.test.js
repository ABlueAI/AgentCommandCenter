'use strict';
// Run: node app/fenced-web-roles.test.js
//
// S58 FENCED WEB-READING AGENTS. Every agent role that reads the open web runs fenced: a tool allowlist
// (its `tools:` line, checked at launch by role-fence-policy.js) plus a guard hook
// (scripts/hooks/fence-write.js) that sees EVERY tool call (`matcher: "*"`) and refuses, visibly and
// with one constant message, any tool outside that role's allowlist.
//
// What this file shows:
//   1. Which roles read the web: every tracked role whose `tools:` line carries a web tool is fenced in
//      main.js, has an allowlist in the policy and in the hook, and the three lists agree.
//   2. Each tracked fenced role is wired to the hook for every tool call, naming itself.
//   3. The REAL hook, run as a child process the way Claude Code runs it, refuses every tool outside the
//      role's allowlist (exit 2, the constant message on stderr, nothing on stdout) and lets the role's
//      own tools through to their existing gates.
//   4. A missing, unknown or extra hook argument refuses every call; malformed input refuses in every
//      WebFetch mode.
//   5. The launch policy refuses a deployed role whose hook argument or matcher drifted.

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const policy = require('./role-fence-policy');
const { parseRoleFrontmatter } = require('./role-frontmatter');

let passed = 0, failed = 0;
function assert(cond, label) {
  if (cond) { process.stdout.write('  \u2713 ' + label + '\n'); passed++; }
  else { process.stderr.write('  x FAIL: ' + label + '\n'); failed++; }
}
function section(t) { process.stdout.write('\n' + t + '\n'); }

const REPO = path.join(__dirname, '..');
const ROLES_DIR = path.join(REPO, 'agent-roles');
const HOOK_SRC = path.join(REPO, 'scripts', 'hooks', 'fence-write.js');
const hook = require(HOOK_SRC); // required as a module it runs nothing and only exports its constants

const WEB_TOOLS = ['WebSearch', 'WebFetch'];
const readsWeb = (tools) => tools.some((t) => WEB_TOOLS.indexOf(t) !== -1 || /^mcp__playwright__/.test(t));
const roleText = (file) => fs.readFileSync(path.join(ROLES_DIR, file), 'utf8').replace(/\r\n/g, '\n');
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const sorted = (a) => a.slice().sort();

const mainSrc = fs.readFileSync(path.join(__dirname, 'main.js'), 'utf8');
const fencedMatch = mainSrc.match(/const FENCED_ROLES = new Set\(\[([^\]]*)\]\)/);
const FENCED_ROLES = fencedMatch ? fencedMatch[1].split(',').map((x) => x.trim().replace(/^'|'$/g, '')).filter(Boolean) : [];

section('1. Every web-reading role is fenced, and the allowlists agree');
const roleFiles = fs.readdirSync(ROLES_DIR).filter((f) => f.endsWith('.md') && f !== 'README.md');
const webRoles = [];
for (const f of roleFiles) {
  const p = parseRoleFrontmatter(roleText(f));
  assert(p.ok === true, f + ' parses');
  if (p.ok && p.toolsDeclared && readsWeb(p.tools)) webRoles.push(p.name);
}
assert(same(sorted(webRoles), ['operator', 'page-reader', 'source-scout', 'web-scout']),
  'the web-reading roles are exactly operator, page-reader, source-scout and web-scout');
assert(fencedMatch !== null, 'main.js declares FENCED_ROLES');
assert(same(sorted(FENCED_ROLES), sorted(webRoles)), 'main.js fences exactly the web-reading roles');
assert(same(sorted(Object.keys(policy.ROLE_TOOL_ALLOWLIST)), sorted(webRoles)),
  'the policy has an allowlist for exactly the web-reading roles');
assert(same(hook.ROLE_TOOLS, policy.ROLE_TOOL_ALLOWLIST),
  'the hook carries the same allowlists as the policy, role by role and in order (drift tripwire)');
assert(Object.isFrozen(hook.ROLE_TOOLS) && Object.values(hook.ROLE_TOOLS).every(Object.isFrozen),
  'the hook allowlists are frozen');
assert(Object.isFrozen(policy.ROLE_TOOL_ALLOWLIST) && Object.values(policy.ROLE_TOOL_ALLOWLIST).every(Object.isFrozen),
  'the policy allowlists are frozen');
assert(hook.WEBFETCH_GATED_ROLE === policy.CONTROLLED_WEBFETCH.role,
  'the hook origin-gates WebFetch for the same role the policy grants it to');
for (const r of webRoles) {
  const p = parseRoleFrontmatter(roleText(r + '.md'));
  assert(same(p.tools, policy.ROLE_TOOL_ALLOWLIST[r]), r + ': its tools: line is exactly its allowlist');
  assert(p.tools.every((t) => policy.FORBIDDEN_TOOLS.indexOf(t) === -1), r + ': declares no forbidden tool');
}
for (const f of roleFiles) {
  const p = parseRoleFrontmatter(roleText(f));
  if (webRoles.indexOf(p.name) !== -1) continue;
  assert(p.toolsDeclared && !readsWeb(p.tools), p.name + ' (not fenced) declares no web tool');
}

section('2. Each fenced role sends every tool call to the hook, naming itself');
for (const r of webRoles) {
  const p = parseRoleFrontmatter(roleText(r + '.md'));
  const pre = p.events && p.events.PreToolUse;
  assert(Array.isArray(pre) && pre.length === 1, r + ': one PreToolUse entry');
  assert(pre && pre[0].matcher === '*', r + ': its matcher is "*" (every tool)');
  assert(pre && pre[0].hooks.length === 1 && pre[0].hooks[0].type === 'command'
    && pre[0].hooks[0].command === 'node "__CC_HOOK__" ' + r, r + ': its command is node "__CC_HOOK__" ' + r);
}

section('3. The real hook refuses every tool outside the role\'s allowlist');
const sandbox = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'mako-s58-')));
function runHook(args, payload, mode) {
  const env = Object.assign({}, process.env);
  delete env.BLUE_HELM_CONTROLLED_WEBFETCH_MODE;
  if (mode !== undefined) env.BLUE_HELM_CONTROLLED_WEBFETCH_MODE = mode;
  const input = typeof payload === 'string' ? payload : JSON.stringify(payload);
  return spawnSync(process.execPath, [HOOK_SRC].concat(args), { input, env, encoding: 'utf8' });
}
const call = (tool, input) => ({ cwd: sandbox, tool_name: tool, tool_input: input || {} });
const refusedWith = (r, msg) => r.status === 2 && r.stderr === msg && r.stdout === '';

// A benign input for each allowlisted tool, so only the allowlist can decide.
const OK_INPUT = {
  Read: { file_path: path.join(sandbox, 'page-request.json') },
  Write: { file_path: path.join(sandbox, 'report.md'), content: 'x' },
  WebSearch: { query: 'mako' },
  WebFetch: { url: 'https://example.com', prompt: 'x' },
  mcp__playwright__browser_navigate: { url: 'https://www.reddit.com/r/x/' },
  mcp__playwright__browser_snapshot: {},
};
// Tools no web-reading role may use: the shells, search and delegation tools, notebook and edit tools,
// Claude Code's other built-ins, other Playwright and MCP tools, near-miss spellings and junk names.
const OFF_LIST = ['Bash', 'PowerShell', 'Grep', 'Glob', 'LS', 'Agent', 'Task', 'NotebookEdit', 'NotebookRead',
  'Edit', 'MultiEdit', 'TodoWrite', 'ToolSearch', 'Skill', 'SlashCommand', 'ExitPlanMode', 'KillShell',
  'mcp__playwright__browser_click', 'mcp__playwright__browser_evaluate', 'mcp__playwright__browser_run_code_unsafe',
  'mcp__playwright__browser_file_upload', 'mcp__github__create_pull_request', 'mcp__other__anything',
  'read', 'WRITE', 'Read ', ' Read', 'Read(./x)', 'WebFetch(domain:example.com)', 'webfetch', '', 'SomeFutureTool'];

for (const r of webRoles) {
  const allow = policy.ROLE_TOOL_ALLOWLIST[r];
  for (const t of allow) {
    // web-scout's WebFetch goes on to the origin gate; `disabled` is what main issues to its
    // ordinary panes and leaves Claude Code's own permission flow in charge.
    const res = runHook([r], call(t, OK_INPUT[t]), r === 'web-scout' ? 'disabled' : undefined);
    assert(res.status === 0 && res.stderr === '', r + ': its own tool ' + t + ' passes the allowlist');
  }
  const others = OFF_LIST.concat(Object.keys(OK_INPUT).filter((t) => allow.indexOf(t) === -1));
  let all = true;
  const leaks = [];
  for (const t of others) {
    for (const mode of [undefined, 'disabled', 'https://example.com']) {
      const res = runHook([r], call(t, OK_INPUT[t] || { file_path: path.join(sandbox, 'x'), command: 'whoami' }), mode);
      if (!refusedWith(res, hook.TOOL_REFUSAL_MESSAGE)) { all = false; leaks.push(JSON.stringify(t) + '@' + mode); }
    }
  }
  assert(all, r + ': all ' + others.length + ' tools outside its allowlist refuse with the constant message in every WebFetch mode'
    + (leaks.length ? ' (not refused: ' + leaks.join(', ') + ')' : ''));
}
{
  const res = runHook(['web-scout'], call('Bash', { command: 'type C:\\Users\\x\\.ssh\\id_rsa' }), 'disabled');
  assert(refusedWith(res, 'Blocked by Mako tool fence: this role may not use that tool. [fence-tool-not-allowed]'),
    'the refusal is visible: exit 2 and "Blocked by Mako tool fence: ... [fence-tool-not-allowed]" on stderr');
  assert(res.stderr.indexOf('Bash') === -1 && res.stderr.indexOf('id_rsa') === -1 && res.stderr.indexOf(sandbox) === -1,
    'and it names no tool, path or input');
}

section('3b. The role\'s own tools still meet their existing gates');
{
  const outside = path.join(os.tmpdir(), 'mako-s58-outside.md');
  for (const r of webRoles) {
    const res = runHook([r], call('Write', { file_path: outside, content: 'x' }), r === 'web-scout' ? 'disabled' : undefined);
    assert(res.status === 2 && /\[fence-outside-sandbox\]$/.test(res.stderr), r + ': a Write outside the sandbox still refuses');
  }
  const scoutNoMode = runHook(['web-scout'], call('WebFetch', { url: 'https://example.org/' }));
  assert(scoutNoMode.status === 2 && /\[fence-webfetch-denied\]$/.test(scoutNoMode.stderr), 'web-scout: WebFetch with no mode still refuses (origin gate)');
  const scoutOrigin = runHook(['web-scout'], call('WebFetch', { url: 'https://example.org/' }), 'https://example.com');
  assert(scoutOrigin.status === 2 && /\[fence-webfetch-denied\]$/.test(scoutOrigin.stderr), 'web-scout: WebFetch off the controlled origin still refuses');
  assert(runHook(['web-scout'], call('WebFetch', { url: 'https://example.com' }), 'https://example.com').status === 0,
    'web-scout: WebFetch to the controlled origin still passes');
  for (const r of ['operator', 'source-scout']) {
    assert(runHook([r], call('WebFetch', { url: 'https://example.org/' })).status === 0,
      r + ': WebFetch keeps Claude Code\'s ordinary permission flow, as before S58 (no mode is issued to it)');
  }
  const nav = runHook(['page-reader'], call('mcp__playwright__browser_navigate', { url: 'http://example.org/' }));
  assert(nav.status === 2 && /\[fence-page-denied\]$/.test(nav.stderr), 'page-reader: a non-https navigate still refuses');
  const snap = runHook(['page-reader'], call('mcp__playwright__browser_snapshot', { filename: 'x.md' }));
  assert(snap.status === 2 && /\[fence-page-denied\]$/.test(snap.stderr), 'page-reader: a snapshot to a file still refuses');
}

section('4. A missing, unknown or extra role argument refuses every call');
for (const args of [[], ['builder'], ['reviewer'], ['codebase-scout'], ['Web-Scout'], ['web-scout '], [''], ['web-scout', 'operator'], ['__proto__'], ['constructor'], ['toString']]) {
  for (const t of ['Read', 'WebSearch', 'Bash']) {
    const res = runHook(args, call(t, OK_INPUT[t] || {}), 'disabled');
    assert(refusedWith(res, hook.ROLE_REFUSAL_MESSAGE), JSON.stringify(args) + ' / ' + t + ' refuses with the constant role message');
  }
}
assert(hook.roleFromArgv(['node', 'hook', 'web-scout']) === 'web-scout', 'roleFromArgv reads one known role');
assert(hook.roleFromArgv(['node', 'hook']) === null && hook.roleFromArgv(['node', 'hook', 'hasOwnProperty']) === null
  && hook.roleFromArgv(null) === null, 'and nothing else');

section('4b. Malformed input refuses in every WebFetch mode');
for (const raw of ['not json', '', 'null', '[]', '42', '{"tool_name":7}', '{"cwd":"/"}']) {
  for (const mode of [undefined, 'disabled', 'https://example.com']) {
    const res = runHook(['web-scout'], raw, mode);
    assert(refusedWith(res, hook.INPUT_REFUSAL_MESSAGE), JSON.stringify(raw) + ' (mode ' + mode + ') refuses as unverifiable');
  }
}

section('5. The launch policy refuses a deployed role whose wiring drifted');
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mako-s58-policy-'));
  const hookPath = path.join(tmp, 'fence-write.js');
  fs.copyFileSync(HOOK_SRC, hookPath);
  const sha = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
  const fwd = hookPath.replace(/\\/g, '/');
  const check = (role, text) => policy.assertFencedRoleDefinition({
    role, text, canonicalHookPath: hookPath, trackedHookSha256: sha(HOOK_SRC), fsx: fs, hashFile: sha,
  });
  for (const r of webRoles) {
    const deployed = roleText(r + '.md').replace('__CC_HOOK__', fwd);
    assert(check(r, deployed).ok === true, r + ': the tracked role, deployed, is accepted');
    const cmd = 'command: "node \\"' + fwd + '\\" ' + r + '"';
    assert(deployed.indexOf(cmd) !== -1, r + ': fixture: the deployed command is found');
    const other = webRoles.find((x) => x !== r);
    const cases = [
      ['no argument (the pre-S58 form)', cmd.replace(' ' + r + '"', '"'), policy.REASON.HOOK_ROLE_ARGUMENT],
      ['another fenced role\'s name (' + other + ')', cmd.replace(' ' + r + '"', ' ' + other + '"'), policy.REASON.HOOK_ROLE_ARGUMENT],
      ['an upper-case name', cmd.replace(' ' + r + '"', ' ' + r.toUpperCase() + '"'), policy.REASON.HOOK_ROLE_ARGUMENT],
      ['two arguments (not the command form at all)', cmd.replace(' ' + r + '"', ' ' + r + ' ' + r + '"'), policy.REASON.HOOK_NOT_IN_PRETOOLUSE],
    ];
    for (const [label, bad, reason] of cases) {
      const res = check(r, deployed.replace(cmd, bad));
      assert(res.ok === false && res.reason === reason, r + ': ' + label + ' REFUSES with ' + reason);
    }
    const narrowed = check(r, deployed.replace('matcher: "*"', 'matcher: "' + policy.ROLE_TOOL_ALLOWLIST[r].join('|') + '"'));
    assert(narrowed.ok === false && narrowed.reason === policy.REASON.MATCHER_COVERAGE,
      r + ': a matcher naming only its own tools REFUSES (the hook would not see the rest)');
    const extraTool = check(r, deployed.replace(/^tools: (.*)$/m, (m) => m + ', Grep'));
    assert(extraTool.ok === false && extraTool.reason === policy.REASON.TOOL_NOT_ALLOWED, r + ': declaring Grep as well REFUSES');
  }
  const newRole = roleText('web-scout.md').replace('name: web-scout', 'name: news-scout')
    .replace('__CC_HOOK__\\" web-scout', '__CC_HOOK__\\" news-scout').replace('__CC_HOOK__', fwd);
  const nr = check('news-scout', newRole);
  assert(nr.ok === false && nr.reason === policy.REASON.ROLE_NO_ALLOWLIST,
    'a fenced role with no allowlist of its own REFUSES (a new web-reading role needs one first)');
  for (const r of Object.values(policy.REASON)) assert(r.indexOf('/') === -1 && r.indexOf('\\') === -1, 'reason ' + r + ' carries no path');
}

process.stdout.write('\nfenced-web-roles: ' + passed + ' passed, ' + failed + ' failed\n');
process.exit(failed ? 1 : 0);
