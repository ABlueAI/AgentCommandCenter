'use strict';

const assert = require('node:assert/strict');
const { execFileSync, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test: nodeTest, after } = require('node:test');
const vm = require('node:vm');
const { validateTask } = require('./task-name');
const { createTrustedSenderGate } = require('./trusted-ipc-sender');

const script = path.join(__dirname, '..', 'scripts', 'remove-agent.ps1');
const source = fs.readFileSync(path.join(__dirname, 'main.js'), 'utf8');
const handlerSource = source.slice(source.indexOf('// Tear down an agent\'s worktree'),
  source.indexOf('// Create a dedicated, fenced outputs sandbox'));
const clean = { changes: [], commits: [], state: 'a'.repeat(64) };
const dirty = {
  ...clean,
  changes: [' M edited file.txt', '?? new file.txt'],
  commits: ['a987654 Local commit'],
};

let passed = 0;
let failed = 0;
function test(name, options, run) {
  if (typeof options === 'function') return test(name, {}, options);
  nodeTest(name, options, async (context) => {
    try {
      await run(context);
      passed++;
    } catch (error) {
      failed++;
      throw error;
    }
  });
}
after(() => process.stdout.write(`\nremove-agent: ${passed} passed, ${failed} failed\n`));

function handler({ inspection = clean, checkError, checkStdout, removeError, response = 0, trusted = true, request } = {}) {
  const calls = [];
  const entryUrl = 'file:///mako/index.html';
  const frame = { url: entryUrl };
  const win = { isDestroyed: () => false, webContents: { mainFrame: frame, send() {} } };
  let invoke;
  vm.runInNewContext(handlerSource, {
    ipcMain: { handle: (_name, fn) => { invoke = fn; } },
    dialog: { showMessageBox: async (_win, options) => {
      calls.push({ dialog: options });
      return { response };
    } },
    path, validateTask, win, createTrustedSenderGate, ENTRY_URL: entryUrl,
    SCRIPTS_DIR: path.dirname(script), tlog() {},
    execFile: (command, args, options, callback) => {
      assert.equal(command, 'powershell');
      assert.ok(args.includes(script));
      calls.push({ args, options });
      if (args.includes('-Check')) callback(checkError, checkStdout ?? JSON.stringify(inspection), 'Git check failed');
      else callback(removeError, '', 'Git refused worktree removal');
    },
  });
  const event = trusted ? { sender: win.webContents, senderFrame: frame } : {};
  const body = request === undefined ? { repo: path.join(os.tmpdir(), 'repo'), task: 'demo' } : request;
  return { calls, invoke: () => invoke(event, body) };
}

test('clean worktrees are checked first and removed without force or a prompt', async () => {
  const { calls, invoke } = handler();
  assert.equal((await invoke()).ok, true);
  assert.equal(calls.length, 2);
  assert.ok(calls[0].args.includes('-Check'));
  assert.ok(!calls[1].args.includes('-Force'));
});

for (const [label, inspection] of [
  ['dirty files', { ...dirty, commits: [] }],
  ['unpushed commits', { ...dirty, changes: [] }],
  ['both kinds of work', dirty],
]) {
  test(`${label} are listed and Cancel leaves the worktree alone`, async () => {
    const { calls, invoke } = handler({ inspection });
    assert.equal((await invoke()).cancelled, true);
    assert.equal(calls.length, 2);
    assert.ok(calls[0].args.includes('-Check'));
    assert.equal(calls[1].dialog.defaultId, calls[1].dialog.cancelId);
    for (const entry of [...inspection.changes, ...inspection.commits]) {
      assert.ok(calls[1].dialog.detail.includes(entry));
    }
  });
}

test('only explicit confirmation passes force and the inspected state', async () => {
  const { calls, invoke } = handler({ inspection: dirty, response: 1 });
  assert.equal((await invoke()).ok, true);
  assert.equal(calls.length, 3);
  const { args } = calls[2];
  assert.ok(args.includes('-Force'));
  assert.equal(args[args.indexOf('-ExpectedState') + 1], dirty.state);
});

for (const [label, options] of [
  ['a failed', { checkError: new Error('inspection failed') }],
  ['an unreadable', { checkStdout: 'invalid JSON' }],
]) {
  test(`${label} inspection refuses visibly before any removal`, async () => {
    const { calls, invoke } = handler(options);
    const result = await invoke();
    assert.equal(result.ok, false);
    assert.match(result.error, /check|inspect/i);
    assert.equal(calls.length, 1);
    assert.ok(calls[0].args.includes('-Check'));
  });
}

for (const [label, inspection] of [
  ['changes as a string', { ...clean, changes: ' M one.txt' }],
  ['commits as an object', { ...clean, commits: { value: ['a1 x'], Count: 1 } }],
  ['an empty entry', { ...clean, changes: [''] }],
  ['a non-string entry', { ...clean, commits: [7] }],
  ['a short state', { ...clean, state: 'abc' }],
  ['an upper-case state', { ...clean, state: 'A'.repeat(64) }],
  ['no state', { changes: [], commits: [] }],
]) {
  test(`a check result with ${label} refuses before any removal`, async () => {
    const { calls, invoke } = handler({ inspection });
    const result = await invoke();
    assert.equal(result.ok, false);
    assert.match(result.error, /invalid worktree state/);
    assert.equal(calls.length, 1);
  });
}

for (const [label, request] of [
  ['a relative repo', { repo: 'relative', task: 'demo' }],
  ['no repo', { task: 'demo' }],
  ['a non-string repo', { repo: ['C:\\repo'], task: 'demo' }],
]) {
  test(`${label} is refused before any git runs`, async () => {
    const { calls, invoke } = handler({ request });
    const result = await invoke();
    assert.equal(result.ok, false);
    assert.match(result.error, /repository/i);
    assert.deepEqual(calls, []);
  });
}

test('only the check has a time limit; the removal run is never cut short', async () => {
  const { calls, invoke } = handler({ inspection: dirty, response: 1 });
  assert.equal((await invoke()).ok, true);
  assert.ok(calls[0].options.timeout > 0);
  assert.equal(calls[2].options.timeout, undefined);
});

test('a check that times out says so and that nothing was removed', async () => {
  const killed = Object.assign(new Error('Command failed: powershell'), { killed: true, signal: 'SIGTERM' });
  const { calls, invoke } = handler({ checkError: killed });
  const result = await invoke();
  assert.equal(result.ok, false);
  assert.match(result.error, /timed out/i);
  assert.match(result.error, /nothing was removed/i);
  assert.equal(calls.length, 1);
});

test('the dialog pins Cancel as the default and safe button', async () => {
  const { calls, invoke } = handler({ inspection: dirty });
  await invoke();
  const { dialog } = calls[1];
  assert.equal(dialog.buttons[dialog.cancelId], 'Cancel');
  assert.equal(dialog.buttons[1], 'Remove worktree');
});

test('a nonzero removal exit reaches the renderer as an error', async () => {
  const { invoke } = handler({ removeError: Object.assign(new Error('exit 1'), { code: 1 }) });
  const result = await invoke();
  assert.equal(result.ok, false);
  assert.match(result.error, /Git refused worktree removal/);
});

test('an untrusted sender cannot start the removal check', async () => {
  const { calls, invoke } = handler({ trusted: false });
  assert.equal((await invoke()).ok, false);
  assert.deepEqual(calls, []);
});

const powershell = process.env.MAKO_TEST_POWERSHELL || (process.platform === 'win32' ? 'powershell' : 'pwsh');
const hasPowerShell = spawnSync(powershell, ['-NoProfile', '-Command', 'exit 0']).status === 0;

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mako remove-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const repo = path.join(root, 'repo');
  const worktree = path.join(root, 'repo-demo');
  const remote = path.join(root, 'remote.git');
  const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
  git(root, 'init', '-q', '-b', 'main', repo);
  git(root, 'init', '-q', '--bare', remote);
  git(repo, 'config', 'user.name', 'Fixture');
  git(repo, 'config', 'user.email', 'fixture@example.invalid');
  git(repo, 'config', 'commit.gpgsign', 'false');
  fs.writeFileSync(path.join(repo, '.gitignore'), 'ignored.txt\n');
  fs.writeFileSync(path.join(repo, 'tracked.txt'), 'base\n');
  git(repo, 'add', '.');
  git(repo, 'commit', '-qm', 'Base commit');
  git(repo, 'remote', 'add', 'fixture', remote);
  git(repo, 'push', '-q', 'fixture', 'main');
  git(repo, 'worktree', 'add', '-qb', 'agent/demo', worktree);
  const run = (...args) => spawnSync(powershell,
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script, '-Task', 'demo', ...args],
    { cwd: repo, encoding: 'utf8' });
  const inspect = () => {
    const result = run('-Check');
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(result.stdout);
  };
  return { repo, worktree, remote, git, run, inspect };
}

const skip = !hasPowerShell && process.platform !== 'win32' && !process.env.MAKO_TEST_POWERSHELL
  ? 'PowerShell is required for the worktree integration cases' : false;

test('inspection lists local work and preserves it when the removal state has changed', { skip }, (t) => {
  const { worktree, git, run, inspect, repo } = fixture(t);
  git(worktree, 'commit', '--allow-empty', '-qm', 'Local commit');
  fs.appendFileSync(path.join(worktree, 'tracked.txt'), 'change\n');
  fs.writeFileSync(path.join(worktree, 'new file.txt'), 'new\n');
  fs.writeFileSync(path.join(worktree, 'ignored.txt'), 'ignored\n');
  const { changes, commits, state } = inspect();
  for (const file of ['tracked.txt', 'new file.txt', 'ignored.txt']) {
    assert.ok(changes.some((line) => line.includes(file)));
  }
  assert.equal(commits.length, 1);
  assert.match(commits[0], /Local commit/);
  assert.ok(fs.existsSync(worktree));
  assert.notEqual(run().status, 0);

  fs.writeFileSync(path.join(worktree, 'later.txt'), 'another change\n');
  const stale = run('-Force', '-ExpectedState', state);
  assert.notEqual(stale.status, 0);
  assert.match(stale.stderr, /changed/i);
  assert.ok(fs.existsSync(worktree));

  const removed = run('-Force', '-ExpectedState', inspect().state);
  assert.equal(removed.status, 0, removed.stderr);
  assert.ok(!fs.existsSync(worktree));
  assert.equal(git(repo, 'branch', '--list', 'agent/demo'), 'agent/demo');
});

test('only live remote branch history counts, including branches with no local tracking ref', { skip }, (t) => {
  const { worktree, remote, git, inspect, run } = fixture(t);
  git(worktree, 'commit', '--allow-empty', '-qm', 'Agent commit');
  git(worktree, 'push', '-q', remote, 'HEAD:refs/heads/published');
  assert.deepEqual(inspect().commits, []);
  git(worktree, 'fetch', '-q', 'fixture');
  git(remote, 'update-ref', '-d', 'refs/heads/published');
  assert.match(inspect().commits[0], /Agent commit/);
  assert.notEqual(run().status, 0);
  assert.ok(fs.existsSync(worktree));
});

test('an agent commit reachable from a remote tip missing locally counts as published', { skip }, (t) => {
  const { repo, worktree, remote, git, inspect } = fixture(t);
  git(worktree, 'commit', '--allow-empty', '-qm', 'Agent commit');
  git(worktree, 'push', '-q', remote, 'HEAD:refs/heads/published');
  const other = path.join(path.dirname(repo), 'other');
  git(repo, 'clone', '-q', '--branch', 'published', remote, other);
  git(other, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid',
    '-c', 'commit.gpgsign=false', 'commit', '--allow-empty', '-qm', 'Remote-only commit');
  git(other, 'push', '-q', 'origin', 'published');
  assert.deepEqual(inspect().commits, []);
  assert.equal(git(repo, 'branch', '-r'), 'fixture/main');
});

test('an unreachable remote refuses visibly and leaves the worktree intact', { skip }, (t) => {
  const { repo, worktree, remote, git, run } = fixture(t);
  git(repo, 'remote', 'set-url', 'fixture', `${remote}-missing`);
  const result = run('-Check');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /remote|repository/i);
  assert.ok(fs.existsSync(worktree));
});

test('Git removal failure exits nonzero and prints no success', { skip }, (t) => {
  const { repo, worktree, git, run } = fixture(t);
  git(repo, 'worktree', 'lock', worktree);
  const result = run();
  assert.notEqual(result.status, 0);
  assert.doesNotMatch(result.stdout, /Removed worktree/);
  assert.ok(fs.existsSync(worktree));
});

test('the script restores Git prompt settings in an existing PowerShell session', { skip }, (t) => {
  const { repo } = fixture(t);
  const result = spawnSync(powershell, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command',
    '$env:GIT_TERMINAL_PROMPT = "1"; Remove-Item Env:GCM_INTERACTIVE -ErrorAction SilentlyContinue; '
    + '& $env:MAKO_TEST_REMOVE_SCRIPT -Task demo -Check | Out-Null; '
    + 'if ($env:GIT_TERMINAL_PROMPT -ne "1" -or (Test-Path Env:GCM_INTERACTIVE)) { exit 1 }'],
  { cwd: repo, encoding: 'utf8', env: { ...process.env, MAKO_TEST_REMOVE_SCRIPT: script } });
  assert.equal(result.status, 0, result.stderr);
});

test('bare -Force without the checked state never removes a worktree with local work', { skip }, (t) => {
  const { worktree, git, run } = fixture(t);
  git(worktree, 'commit', '--allow-empty', '-qm', 'Local commit');
  fs.writeFileSync(path.join(worktree, 'new file.txt'), 'new\n');
  const result = run('-Force');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /local work/i);
  assert.ok(fs.existsSync(path.join(worktree, 'new file.txt')));
});

test('the check ignores commands planted in the repository config', { skip }, (t) => {
  const { repo, worktree, git, inspect, run } = fixture(t);
  const marker = path.join(path.dirname(repo), 'planted marker');
  const shellPath = marker.replace(/\\/g, '/');
  git(repo, 'config', 'core.fsmonitor', `echo planted > "${shellPath}"`);
  git(repo, 'config', 'remote.fixture.uploadpack', `echo planted > "${shellPath}"; git-upload-pack`);
  git(worktree, 'commit', '--allow-empty', '-qm', 'Agent commit');
  const { commits, state } = inspect();
  assert.match(commits[0], /Agent commit/);
  assert.ok(!fs.existsSync(marker), 'a planted config command ran during the check');
  const removed = run('-Force', '-ExpectedState', state);
  assert.equal(removed.status, 0, removed.stderr);
  assert.ok(!fs.existsSync(marker), 'a planted config command ran during removal');
});

test('many remote branches are handled without piping object IDs through PowerShell', { skip }, (t) => {
  const { worktree, remote, git, inspect } = fixture(t);
  git(worktree, 'commit', '--allow-empty', '-qm', 'Agent commit');
  git(worktree, 'push', '-q', remote, 'HEAD:refs/heads/published');
  const main = git(remote, 'rev-parse', 'main');
  const lines = [];
  for (let i = 0; i < 450; i++) lines.push(`create refs/heads/extra-${i} ${main}`);
  execFileSync('git', ['update-ref', '--stdin'], { cwd: remote, input: lines.join('\n') + '\n' });
  assert.deepEqual(inspect().commits, []);
  git(remote, 'update-ref', '-d', 'refs/heads/published');
  assert.match(inspect().commits[0], /Agent commit/);
});
