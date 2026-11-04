'use strict';
// Run: node .claude/hooks/account-guard.test.js
// Standing gate: scripts/account-guard-node.Tests.ps1 (run-pester.ps1, Windows CI) runs this file.
//
// Covers the account guard (.claude/hooks/account-guard.js):
//   1. command matching: `gh pr create` / `gh pr new`, `gh pr ready`, `git push`, also when chained
//      or nested, and never for text inside quotes or for other commands;
//   2. the three login cases through decide(): ABlueAI blocks (exit 2), ABlueAgent allows,
//      gh missing / not logged in allows with a one-line notice;
//   3. non-matching commands never call gh (no network);
//   4. the same cases end to end: the real script as Claude Code runs it (JSON on stdin), with a
//      fake `gh` on PATH (a copy of node that runs a stub `api.js`, so it works on Windows too);
//   5. .claude/settings.json: the hook is wired as the docs say and the deny rules are untouched.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const guard = require('./account-guard.js');

let passed = 0, failed = 0;
function assert(cond, label) {
  if (cond) { process.stdout.write(`  ✓ ${label}\n`); passed++; }
  else { process.stderr.write(`  ✗ FAIL: ${label}\n`); failed++; }
}

const HOOK = path.join(__dirname, 'account-guard.js');
const REPO_ROOT = path.resolve(__dirname, '..', '..');

// ---------------------------------------------------------------------------------------------
process.stdout.write('\ncommand matching: guarded commands\n');
const GUARDED = [
  ['gh pr create --fill', 'gh pr create'],
  ['gh pr new --title x', 'gh pr create'],
  ['gh pr ready 152', 'gh pr ready'],
  ['gh pr ready --undo 152', 'gh pr ready'],
  ['gh -R ABlueAI/AgentCommandCenter pr create', 'gh pr create'],
  ['gh pr --repo ABlueAI/AgentCommandCenter create', 'gh pr create'],
  ['gh.exe pr create', 'gh pr create'],
  ['"C:\\Program Files\\GitHub CLI\\gh.exe" pr ready 1', 'gh pr ready'],
  ['git push', 'git push'],
  ['git push -u origin feature', 'git push'],
  ['git -C ../wt push origin HEAD', 'git push'],
  ['git -c credential.helper= push', 'git push'],
  ['git --no-pager push', 'git push'],
  ['/usr/bin/git push', 'git push'],
  ['git.exe push', 'git push'],
  ['"git" "push"', 'git push'],
  ['git add -A && git commit -m "wip" && git push', 'git push'],
  ['npm test; git push', 'git push'],
  ['false || git push', 'git push'],
  ['git push 2>&1 | tail -5', 'git push'],
  ['cd app\ngit push origin x', 'git push'],
  ['(cd app && git push)', 'git push'],
  ['echo $(git push)', 'git push'],
  ['echo "result: $(gh pr create --fill)"', 'gh pr create'],
  ['echo `git push`', 'git push'],
  ['bash -c "git push origin x"', 'git push'],
  ['bash -lc \'gh pr create --fill\'', 'gh pr create'],
  ['pwsh -Command "gh pr ready 3"', 'gh pr ready'],
  ['powershell -NoProfile -Command "git push"', 'git push'],
  ['GIT_TRACE=1 git push', 'git push'],
  ['env GH_DEBUG=1 gh pr create', 'gh pr create'],
  ['sudo git push', 'git push'],
  ['if true; then git push; fi', 'git push'],
  ['git commit -m x \\\n  && git push', 'git push'],
  // Claude Code's usual commit form: a heredoc whose body has an apostrophe, then a push.
  ["git commit -m \"$(cat <<'EOF'\nDon't break Blue's build\nEOF\n)\" && git push", 'git push'],
  ["git commit -F- <<'EOF'\nit's done\nEOF\ngit push", 'git push'],
  ['git commit -F- <<EOF && git push\nbody with a " quote\nEOF', 'git push'],
  ["cat <<-'EOF' > f\n\tdon't\n\tEOF\ngh pr create --fill", 'gh pr create'],
  // An unquoted heredoc body still runs its command substitutions (Codex's finding on PR #153).
  ['cat <<EOF\n$(git push)\nEOF', 'git push'],
  ['cat <<EOF\nresult: `gh pr create --fill`\nEOF', 'gh pr create'],
  ["cat <<-EOF > out.txt\n\tdon't stop: $(echo x; gh pr ready 7)\n\tEOF", 'gh pr ready'],
  ['git commit -F- <<EOF\nmsg $(git push origin x)\nEOF', 'git push'],
  // A here-string or an arithmetic shift is not a heredoc, and never hides what follows.
  ['read a b <<< "$line"\ngit push', 'git push'],
  ["grep -q x <<< \"$out\"\ngh pr create --fill", 'gh pr create'],
  ['cat <<< "x"\ngit push', 'git push'],
  ['(( n <<= 1 ))\ngit push', 'git push'],
  ['(( x = 1 << 3 ))\ngit push', 'git push'],
  ['cat <<EOF\nno closing line\ngit push', 'git push'],
  // Unclosed quotes fall back to a text scan rather than hide what follows.
  ["echo 'unclosed && git push", 'git push'],
  ['echo "$(unclosed && gh pr ready 3', 'gh pr ready'],
];
for (const [cmd, want] of GUARDED) {
  assert(guard.findGuardedCommand(cmd) === want, `${JSON.stringify(cmd)} -> ${want}`);
}

process.stdout.write('\ncommand matching: everything else is left alone\n');
const NOT_GUARDED = [
  'git status',
  'git commit -m "then git push later"',
  'git commit -m "fix; git push; gh pr create"',
  "echo 'gh pr create'",
  'echo git push',
  'grep -rn "git push" docs',
  'git log --grep=push',
  'git push-notes', // not the push subcommand
  'git stash push -m wip', // `push` is stash's subcommand, not git's
  'gh pr view 152',
  'gh pr list --state open',
  'gh pr checks 152',
  'gh pr comment 152 --body "gh pr ready"',
  'gh api user --jq .login',
  'gh auth status',
  'npm test',
  'ls -la # git push',
  'cat .claude/hooks/account-guard.js',
  'node -e "console.log(1)"',
  "git commit -F- <<'EOF'\ngit push and gh pr create in a commit message\nEOF",
  "cat <<EOF > notes.md\nthen run git push\nEOF\nnpm test",
  // A quoted delimiter turns substitutions off, so these are only text.
  "cat <<'EOF'\n$(git push)\nEOF",
  'cat <<"EOF"\n`gh pr create`\nEOF',
  'cat <<\\EOF\n$(git push)\nEOF',
  // In an unquoted body, an escaped substitution is text too, and other substitutions are fine.
  'cat <<EOF\n\\$(git push) costs $(date)\nEOF',
  '',
];
for (const cmd of NOT_GUARDED) {
  assert(guard.findGuardedCommand(cmd) === null, `${JSON.stringify(cmd)} -> not guarded`);
}

// ---------------------------------------------------------------------------------------------
process.stdout.write('\ndecide(): the three login cases\n');
const bash = (command) => ({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command } });

{
  const v = guard.decide(bash('gh pr create --fill'), () => ({ login: 'ABlueAI' }));
  assert(v.exitCode === 2, 'ABlueAI + gh pr create: exit 2 (blocked)');
  assert(/ABlueAI/.test(v.stderr) && /cloud session/.test(v.stderr) && /Mako agent pane/.test(v.stderr),
    'the block message names the login and says to hand the work to a cloud session or a Mako agent pane');
  assert(/gh pr create/.test(v.stderr), 'the block message names the matched command');
}
assert(guard.decide(bash('git push'), () => ({ login: 'ablueai' })).exitCode === 2,
  'ablueai (any case) + git push: exit 2 (GitHub logins are case-insensitive)');
assert(guard.decide(bash('gh pr ready 1'), () => ({ login: 'ABlueAI' })).exitCode === 2,
  'ABlueAI + gh pr ready: exit 2');
{
  const v = guard.decide(bash('git push -u origin x'), () => ({ login: 'ABlueAgent' }));
  assert(v.exitCode === 0 && !v.stderr && !v.systemMessage, 'ABlueAgent + git push: exit 0, silent');
}
assert(guard.decide(bash('gh pr create'), () => ({ login: 'someone-else' })).exitCode === 0,
  'any other login: exit 0');
{
  const v = guard.decide(bash('gh pr create'), () => ({ error: 'gh is not installed or not on PATH' }));
  assert(v.exitCode === 0, 'gh not installed: exit 0 (allowed)');
  assert(/couldn't check/.test(v.systemMessage) && !/\n/.test(v.systemMessage),
    'gh not installed: a one-line notice that the account could not be checked');
}
{
  const v = guard.decide(bash('git push'), () => ({ error: 'gh could not read the login (exit 4)' }));
  assert(v.exitCode === 0 && /couldn't check/.test(v.systemMessage), 'gh not logged in: exit 0 with the notice');
}
assert(guard.decide(bash('git push'), () => undefined).exitCode === 0, 'a login reader that returns nothing: exit 0');

process.stdout.write('\ndecide(): non-matching input never calls gh\n');
let calls = 0;
const counting = () => { calls++; return { login: 'ABlueAI' }; };
for (const cmd of NOT_GUARDED) guard.decide(bash(cmd), counting);
guard.decide({ tool_name: 'Read', tool_input: { file_path: 'x' } }, counting);
guard.decide({ tool_name: 'PowerShell', tool_input: { command: 'git push' } }, counting);
guard.decide({ tool_name: 'Bash', tool_input: {} }, counting);
guard.decide(null, counting);
assert(calls === 0, `no gh call for any non-matching command or other tool (${calls} calls)`);
assert(guard.decide(bash('git status'), counting).exitCode === 0, 'non-matching command under ABlueAI: exit 0');

// ---------------------------------------------------------------------------------------------
process.stdout.write('\nend to end: the real script with a fake gh on PATH\n');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'account-guard-'));
const binDir = path.join(tmp, 'bin');
const emptyDir = path.join(tmp, 'empty');
const workDir = path.join(tmp, 'work');
const logFile = path.join(tmp, 'gh-calls.log');
for (const d of [binDir, emptyDir, workDir]) fs.mkdirSync(d);

// A fake `gh`: a copy of node. `gh api user --jq .login` then runs `node api user --jq .login`,
// which loads ./api.js from the hook's working directory: the stub below.
const ghPath = path.join(binDir, process.platform === 'win32' ? 'gh.exe' : 'gh');
try { fs.linkSync(process.execPath, ghPath); } catch { fs.copyFileSync(process.execPath, ghPath); }
fs.chmodSync(ghPath, 0o755);
fs.writeFileSync(path.join(workDir, 'api.js'), `
const fs = require('fs');
fs.appendFileSync(process.env.FAKE_GH_LOG, process.argv.slice(2).join(' ') + '\\n');
const mode = process.env.FAKE_GH_MODE;
if (mode === 'notloggedin') {
  process.stderr.write('To get started with GitHub CLI, please run:  gh auth login\\n');
  process.exit(4);
}
process.stdout.write(mode + '\\n');
`);

function runHook(command, { mode, pathDir = binDir, toolName = 'Bash' } = {}) {
  const env = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (!/^path$/i.test(k) && !/^(GH_|GITHUB_)/i.test(k)) env[k] = v;
  }
  env.PATH = pathDir;
  env.FAKE_GH_MODE = mode || 'ABlueAgent';
  env.FAKE_GH_LOG = logFile;
  const input = JSON.stringify({
    session_id: 'test', cwd: workDir, hook_event_name: 'PreToolUse',
    tool_name: toolName, tool_input: { command, description: 'test' }, tool_use_id: 'toolu_test',
  });
  return spawnSync(process.execPath, [HOOK], { cwd: workDir, env, input, encoding: 'utf8', timeout: 30000 });
}
const ghCalls = () => (fs.existsSync(logFile) ? fs.readFileSync(logFile, 'utf8').trim().split('\n').filter(Boolean) : []);

{
  const r = runHook('git add -A && git push -u origin x', { mode: 'ABlueAI' });
  assert(r.status === 2, `ABlueAI + chained git push: exit 2 (got ${r.status})`);
  assert(/Blocked by Mako's account guard/.test(r.stderr) && /cloud session/.test(r.stderr),
    'ABlueAI: stderr says why and where to hand the work');
  assert(ghCalls().pop() === 'user --jq .login', 'the fake gh was asked `api user --jq .login`');
}
{
  const r = runHook('gh pr create --fill', { mode: 'ABlueAgent' });
  assert(r.status === 0, `ABlueAgent + gh pr create: exit 0 (got ${r.status})`);
  assert(r.stdout.trim() === '' && r.stderr.trim() === '', 'ABlueAgent: nothing printed');
}
{
  const r = runHook('gh pr ready 5', { mode: 'notloggedin' });
  assert(r.status === 0, `gh not logged in + gh pr ready: exit 0 (got ${r.status})`);
  let msg = null;
  try { msg = JSON.parse(r.stdout).systemMessage; } catch { /* asserted below */ }
  assert(typeof msg === 'string' && /couldn't check/.test(msg), 'not logged in: systemMessage notice in JSON on stdout');
}
{
  const r = runHook('git push', { pathDir: emptyDir });
  assert(r.status === 0, `gh not installed + git push: exit 0 (got ${r.status})`);
  let msg = null;
  try { msg = JSON.parse(r.stdout).systemMessage; } catch { /* asserted below */ }
  assert(typeof msg === 'string' && /not installed/.test(msg), 'gh not installed: the notice says gh is missing');
}
{
  const before = ghCalls().length;
  for (const cmd of ['git status', 'npm test', 'gh pr view 1', 'git commit -m "git push"']) {
    const r = runHook(cmd, { mode: 'ABlueAI' });
    assert(r.status === 0 && r.stdout === '' && r.stderr === '', `ABlueAI + ${JSON.stringify(cmd)}: exit 0, silent`);
  }
  const r = runHook('git push', { mode: 'ABlueAI', toolName: 'Read' });
  assert(r.status === 0, 'another tool: exit 0');
  assert(ghCalls().length === before, 'non-matching commands never started gh');
}
{
  // A gh planted in the working directory (a checkout) is never run: gh comes from PATH's absolute
  // entries only (Windows would otherwise look in the current directory first).
  const planted = path.join(workDir, process.platform === 'win32' ? 'gh.exe' : 'gh');
  fs.copyFileSync(ghPath, planted);
  fs.chmodSync(planted, 0o755);
  const before = ghCalls().length;
  const r = runHook('git push', { mode: 'ABlueAI', pathDir: emptyDir });
  assert(r.status === 0 && /not installed/.test(r.stdout), 'a gh in the working directory is ignored when PATH has none');
  assert(ghCalls().length === before, 'the planted gh never ran');
  assert(guard.resolveGh({ PATH: ['.', '', 'relative/dir'].join(path.delimiter) }) === null,
    'relative and empty PATH entries are skipped');
  assert(guard.resolveGh({ PATH: binDir }) === ghPath, 'gh is found in an absolute PATH entry');
  assert(guard.resolveGh({ PATH: '"' + binDir + '"' }) === ghPath, 'a double-quoted PATH entry is read without its quotes');
  fs.unlinkSync(planted);
}
{
  const env = { ...process.env, PATH: binDir, FAKE_GH_MODE: 'ABlueAI', FAKE_GH_LOG: logFile };
  const r = spawnSync(process.execPath, [HOOK], { cwd: workDir, env, input: 'not json', encoding: 'utf8' });
  assert(r.status === 0 && /couldn't read the hook input/.test(r.stdout), 'unreadable input: exit 0 with a notice');
}
try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* temp cleanup is best effort */ }

// ---------------------------------------------------------------------------------------------
process.stdout.write('\n.claude/settings.json\n');
const settings = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, '.claude', 'settings.json'), 'utf8'));
const DENY = [
  'mcp__github__merge_pull_request',
  'mcp__github__enable_pr_auto_merge',
  'Bash(gh pr merge:*)',
  'Bash(git push origin main:*)',
  'Bash(git push origin HEAD:main:*)',
  'Bash(git push origin +main:*)',
  'Bash(git push --force:*)',
  'Bash(git push -f:*)',
  'Bash(git push --force-with-lease origin main:*)',
];
assert(JSON.stringify(settings.permissions && settings.permissions.deny) === JSON.stringify(DENY),
  'the deny rules are unchanged');
const groups = (settings.hooks && settings.hooks.PreToolUse) || [];
const entry = groups.find((g) => g.matcher === 'Bash');
const hook = entry && (entry.hooks || []).find((h) => /account-guard\.js$/.test((h.args || [])[0] || ''));
assert(!!hook, 'a PreToolUse hook with matcher "Bash" runs account-guard.js');
assert(hook && hook.type === 'command' && hook.command === 'node', 'exec form: command "node"');
assert(hook && JSON.stringify(hook.args) === JSON.stringify(['${CLAUDE_PROJECT_DIR}/.claude/hooks/account-guard.js']),
  'args point at the script through ${CLAUDE_PROJECT_DIR}');
assert(hook && !('onFailure' in hook), 'onFailure unset: in exec form a hook that fails to run never blocks (docs default)');
assert(hook && !('shell' in hook), 'no shell field (ignored in exec form anyway)');
assert(hook && typeof hook.timeout === 'number' && hook.timeout * 1000 > 10000,
  'timeout is longer than the 10-second gh call');
assert(fs.existsSync(path.join(REPO_ROOT, '.claude', 'hooks', 'account-guard.js')), 'the script exists at that path');

process.stdout.write(`\naccount-guard: ${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
