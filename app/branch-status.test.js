'use strict';
// Run: node app/branch-status.test.js
//
// S47 piece 3: the porcelain v2 parser (fixtures), the git call (stubbed execFile: arguments,
// failure reasons) and a real git run in a disposable repo with an upstream, so ahead/behind,
// staged, unstaged, untracked, renamed and conflicted files are read from git itself.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile, execFileSync } = require('child_process');
const {
  parseStatusV2, readBranchStatus, readBranchStatuses, listAuthorizedDirs, answerBranchStatus, gitEnv,
  STATUS_ARGS, REASON, MAX_BUFFER, MAX_PATHS, CONCURRENCY,
} = require('./branch-status');
const { createLauncherAuthorizer } = require('./launcher-authz');

let passed = 0, failed = 0;
function assert(cond, label) {
  if (cond) { process.stdout.write('  ✓ ' + label + '\n'); passed++; }
  else { process.stderr.write('  x FAIL: ' + label + '\n'); failed++; }
}
function section(t) { process.stdout.write('\n' + t + '\n'); }
const Z = (...records) => records.join('\0') + '\0';
const OID = 'a'.repeat(40);
const H = (head, extra) => ['# branch.oid ' + OID, '# branch.head ' + head].concat(extra || []);
const ORD = (xy, p) => `1 ${xy} N... 100644 100644 100644 ${OID} ${OID} ${p}`;
const REN = (xy, p) => `2 ${xy} N... 100644 100644 100644 ${OID} ${OID} R100 ${p}`;
const UNM = (xy, p) => `u ${xy} N... 100644 100644 100644 100644 ${OID} ${OID} ${OID} ${p}`;

async function main() {
  section('parseStatusV2: headers');
  {
    const st = parseStatusV2(Z(...H('claude/s47', ['# branch.upstream origin/claude/s47', '# branch.ab +2 -1'])));
    assert(st && st.head === 'claude/s47' && st.upstream === 'origin/claude/s47', 'branch and upstream read');
    assert(st.ahead === 2 && st.behind === 1, 'ahead 2, behind 1');
    assert(st.changed === 0 && st.staged === 0 && st.unstaged === 0 && st.untracked === 0 && st.conflicted === 0, 'clean tree: every count 0');
    assert(st.oid === OID && st.detached === false, 'oid kept, not detached');
  }
  {
    const st = parseStatusV2(Z(...H('feature')));
    assert(st && st.upstream === null && st.ahead === null && st.behind === null, 'no upstream: upstream and ahead/behind null');
  }
  {
    const st = parseStatusV2(Z(...H('feature', ['# branch.upstream origin/gone'])));
    assert(st && st.upstream === 'origin/gone' && st.ahead === null, 'upstream gone: upstream named, no ahead/behind');
  }
  {
    const st = parseStatusV2(Z('# branch.oid ' + OID, '# branch.head (detached)'));
    assert(st && st.detached === true && st.head === null, 'detached HEAD');
  }
  {
    const st = parseStatusV2(Z('# branch.oid (initial)', '# branch.head main'));
    assert(st && st.oid === null && st.head === 'main', 'initial commit: oid null');
  }
  {
    const st = parseStatusV2(Z(...H('x y "quoted" <b>', [])));
    assert(st && st.head === 'x y "quoted" <b>', 'a branch name with spaces, quotes and angle brackets is kept whole');
  }

  section('parseStatusV2: entries');
  {
    const st = parseStatusV2(Z(...H('b'),
      ORD('M.', 'staged.txt'), ORD('.M', 'unstaged.txt'), ORD('MM', 'both.txt'),
      REN('R.', 'new name.txt'), 'old name.txt',
      UNM('UU', 'conflict.txt'), '? untracked one.txt', '? dir/two.txt', '! ignored.txt'));
    assert(st.changed === 7, '7 changed entries (ignored left out, rename counted once)');
    assert(st.staged === 3, 'staged: M., MM, R.');
    assert(st.unstaged === 2, 'unstaged: .M, MM');
    assert(st.untracked === 2, 'untracked 2');
    assert(st.conflicted === 1, 'conflicted 1, and not also counted as staged or unstaged');
  }
  {
    // A rename's original path is its own NUL field and may look like any record: it is skipped.
    const st = parseStatusV2(Z(...H('b'), REN('R.', 'new'), '? looks-untracked', REN('.R', 'n2'), '# branch.ab +9 -9'));
    assert(st && st.changed === 2 && st.untracked === 0 && st.ahead === null, 'a rename origin that looks like a record or header is not read as one');
  }
  {
    const st = parseStatusV2(Z(...H('b'), ORD('.M', 'line\nbreak.txt')));
    assert(st && st.changed === 1, 'a path with a newline is one entry');
  }

  section('parseStatusV2: refuses what is not porcelain v2');
  for (const [label, text] of [
    ['empty output', ''],
    ['not a string', null],
    ['no branch.oid header (porcelain v1)', ' M file.txt\0'],
    ['plain-text error', 'fatal: not a git repository'],
    ['bad ahead/behind', Z(...H('b', ['# branch.ab ahead'])),],
    ['unknown record kind', Z(...H('b'), 'X  thing')],
    ['bad XY field', Z(...H('b'), '1 zz N... rest')],
    ['record without a space after the kind', Z(...H('b'), '1M.')],
  ]) {
    assert(parseStatusV2(text) === null, `${label}: null, never a clean status`);
  }

  section('readBranchStatus: the git call (stubbed)');
  {
    let seen = null;
    const res = await readBranchStatus({ execFile: (cmd, args, opts, cb) => { seen = { cmd, args, opts }; cb(null, Z(...H('b', ['# branch.upstream o/b', '# branch.ab +0 -3'])), ''); } }, 'C:\\repo-wt');
    assert(seen.cmd === 'git', 'runs git (no shell)');
    assert(JSON.stringify(seen.args) === JSON.stringify(['-C', 'C:\\repo-wt', ...STATUS_ARGS]), 'git -C <dir> then the fixed status arguments');
    assert(seen.args.includes('--no-optional-locks'), 'takes no optional lock (never races the agent for index.lock)');
    assert(seen.args.indexOf('core.fsmonitor=false') === seen.args.indexOf('-c') + 1 && seen.args.indexOf('-c') < seen.args.indexOf('status'), 'turns off a configured fsmonitor command, before the subcommand');
    assert(seen.args.includes('--ignore-submodules=all'), 'never runs git inside a submodule');
    assert(seen.args.includes('-z') && seen.args.includes('--porcelain=v2') && seen.args.includes('--branch'), 'porcelain v2, --branch, -z');
    assert(!seen.args.includes('--ignored'), 'ignored files are not listed');
    assert(seen.opts.windowsHide === true && seen.opts.maxBuffer === MAX_BUFFER && seen.opts.timeout > 0, 'windowsHide, a buffer cap and a timeout');
    assert(seen.opts.shell === undefined, 'no shell option');
    assert(res.ok === true && res.behind === 3 && res.ahead === 0, 'parsed answer: ok, behind 3');
  }
  {
    const r = await readBranchStatus({ execFile: (c, a, o, cb) => { const e = new Error('Command failed'); e.code = 128; cb(e, '', 'fatal: not a git repository (or any of the parent directories): .git\nmore'); } }, 'D:\\x');
    assert(r.ok === false && r.error === REASON.GIT_FAILED, 'git exits non-zero: git-status-failed');
    assert(r.detail === 'fatal: not a git repository (or any of the parent directories): .git', 'detail is the first stderr line');
  }
  {
    const r = await readBranchStatus({ execFile: (c, a, o, cb) => { const e = new Error('maxBuffer'); e.code = 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER'; cb(e, '', ''); } }, 'D:\\x');
    assert(r.ok === false && r.error === REASON.TOO_LARGE, 'output past the buffer cap: git-status-too-large');
  }
  {
    const r = await readBranchStatus({ execFile: (c, a, o, cb) => { const e = new Error('killed'); e.killed = true; e.signal = 'SIGTERM'; cb(e, '', ''); } }, 'D:\\x');
    assert(r.ok === false && r.error === REASON.TIMED_OUT, 'killed at the timeout: git-status-timed-out');
  }
  {
    const r = await readBranchStatus({ execFile: (c, a, o, cb) => cb(null, 'garbage', '') }, 'D:\\x');
    assert(r.ok === false && r.error === REASON.UNPARSEABLE, 'unreadable output: git-status-unparseable, never clean');
  }
  {
    const r = await readBranchStatus({ execFile: () => { throw new Error('spawn git ENOENT'); } }, 'D:\\x');
    assert(r.ok === false && r.error === REASON.GIT_FAILED && /ENOENT/.test(r.detail), 'execFile throws: git-status-failed with the reason');
  }
  for (const bad of ['', null, 42, 'a\0b']) {
    let called = false;
    const r = await readBranchStatus({ execFile: () => { called = true; } }, bad);
    assert(r.ok === false && r.error === REASON.INVALID_INPUT && !called, `dir ${JSON.stringify(bad)}: refused before git runs`);
  }
  {
    const r = await readBranchStatus({}, 'D:\\x');
    assert(r.ok === false && r.error === REASON.INVALID_INPUT, 'no execFile: refused');
  }

  section('readBranchStatuses: the batch main answers the renderer with');
  {
    const ran = [];
    let live = 0, peak = 0;
    const deps = {
      authorize: (p) => (p.startsWith('ok') ? { ok: true, dir: 'REAL-' + p } : { ok: false, reason: 'not-authorized' }),
      execFile: (c, args, o, cb) => {
        ran.push(args[1]); live++; peak = Math.max(peak, live);
        setTimeout(() => { live--; cb(null, Z(...H(args[1]))); }, 5);
      },
    };
    const paths = ['ok1', 'evil', 'ok2', 'ok3', 'ok4', 'ok5', 'ok6'];
    const res = await readBranchStatuses(deps, paths);
    assert(res.length === paths.length, 'one answer per path');
    assert(res.map((r) => (r.ok ? r.head : r.error)).join(',') === 'REAL-ok1,not-authorized,REAL-ok2,REAL-ok3,REAL-ok4,REAL-ok5,REAL-ok6', 'answers keep the input order; git runs on the authorized real path');
    assert(!ran.includes('evil') && !ran.includes('REAL-evil'), 'a refused path never reaches git');
    assert(peak <= CONCURRENCY && peak > 1, `at most ${CONCURRENCY} git processes at once (peak ${peak})`);
  }
  {
    let called = false;
    const res = await readBranchStatuses({ authorize: () => { throw new Error('boom'); }, execFile: () => { called = true; } }, ['a']);
    assert(res[0].ok === false && res[0].error === 'enumeration-failed' && !called, 'authorize throws: that path is refused, git never runs');
  }
  {
    const res = await readBranchStatuses({ authorize: () => ({ ok: true, dir: 'x' }), execFile: (c, a, o, cb) => cb(null, Z(...H('b'))) }, []);
    assert(Array.isArray(res) && res.length === 0, 'an empty list gives an empty answer');
  }
  for (const [label, deps, paths] of [
    ['not a list', { authorize: () => ({}) }, 'a'],
    [`more than ${MAX_PATHS} paths`, { authorize: () => ({}) }, new Array(MAX_PATHS + 1).fill('a')],
    ['no authorize', {}, ['a']],
  ]) {
    let threw = false;
    try { await readBranchStatuses(deps, paths); } catch (e) { threw = e.message === REASON.INVALID_INPUT; }
    assert(threw, `${label}: refused`);
  }

  section('gitEnv: what git may see of main\'s environment');
  {
    const e = gitEnv({ Path: 'C:\\Windows', SystemRoot: 'C:\\Windows', USERPROFILE: 'D:\\profiles\\b', TEMP: 'C:\\t',
      GH_TOKEN: 'secret', GEMINI_API_KEY: 'k', ANTHROPIC_API_KEY: 'k', GIT_DIR: 'C:\\evil', GIT_CONFIG_GLOBAL: 'C:\\evil', NODE_OPTIONS: '--require x' });
    assert(e.Path === 'C:\\Windows' && e.SystemRoot && e.USERPROFILE && e.TEMP, 'keeps Path, SystemRoot, USERPROFILE and TEMP as spelled');
    for (const k of ['GH_TOKEN', 'GEMINI_API_KEY', 'ANTHROPIC_API_KEY', 'GIT_DIR', 'GIT_CONFIG_GLOBAL', 'NODE_OPTIONS']) assert(!(k in e), `drops ${k}`);
    assert(e.GIT_CONFIG_NOSYSTEM === '1' && e.GIT_TERMINAL_PROMPT === '0' && e.GIT_OPTIONAL_LOCKS === '0', 'no system config, no prompt, no optional locks');
    let seenEnv = null;
    await readBranchStatus({ env: e, execFile: (c, a, o, cb) => { seenEnv = o.env; cb(null, Z(...H('b'))); } }, 'D:\\x');
    assert(seenEnv === e, 'readBranchStatus passes deps.env to git');
  }

  section('listAuthorizedDirs: the folders this channel may read, listed without blocking');
  {
    const dirent = (name, dir) => ({ name, isDirectory: () => dir });
    const calls = [];
    const res = await listAuthorizedDirs({
      projectsRoot: 'C:\\P',
      readdir: async () => [dirent('repo', true), dirent('notrepo', true), dirent('file.txt', false), dirent('broken', true)],
      exists: (p) => p === 'C:\\P\\repo\\.git' || p === 'C:\\P\\broken\\.git',
      execFile: (c, args, o, cb) => {
        calls.push(args);
        if (args[1] === 'C:\\P\\broken') { const e = new Error('Command failed'); cb(e, '', 'fatal: bad config line 3\nmore'); return; }
        cb(null, 'worktree C:/P/repo\nHEAD abc\nbranch refs/heads/main\n\nworktree C:/P/repo-agent\nbranch refs/heads/claude/x\n', '');
      },
    });
    assert(res.dirs.includes('C:\\P\\repo') && res.dirs.includes('C:/P/repo-agent') && res.dirs.includes('C:\\P\\broken'), 'repo roots and their worktrees are listed');
    assert(!res.dirs.some((d) => /notrepo|file\.txt/.test(d)), 'folders without .git and files are not');
    assert(calls.every((a) => a[0] === '-C' && a[2] === 'worktree' && a[3] === 'list' && a[4] === '--porcelain'), 'git worktree list --porcelain, per repo');
    assert(res.failures.length === 1 && res.failures[0].step === 'git-worktree-list' && res.failures[0].repo === 'C:\\P\\broken' && res.failures[0].detail === 'fatal: bad config line 3', 'a failed listing is kept with its repo and first stderr line');
  }
  {
    const r1 = await listAuthorizedDirs({ projectsRoot: '' });
    assert(r1.dirs.length === 0 && r1.failures[0].step === 'settings', 'no projects folder: a settings failure');
    const r2 = await listAuthorizedDirs({ projectsRoot: '/p', readdir: async () => { throw new Error('ENOENT: /p'); } });
    assert(r2.dirs.length === 0 && r2.failures[0].step === 'projects-folder' && /ENOENT/.test(r2.failures[0].detail), 'an unreadable projects folder: a failure with the reason');
  }

  section('answerBranchStatus: the IPC answer, with the launchers\' real authorizer');
  {
    const fakeFs = { '/p/repo': true, '/p/repo-agent': true, '/elsewhere': true };
    const mkAuth = (listFn) => createLauncherAuthorizer({
      realpath: (p) => { if (!fakeFs[p]) throw new Error('ENOENT'); return p; },
      isDirectory: () => true, listAuthorizedDirs: listFn, isWin: false,
    });
    const ran = [];
    const exec = (c, args, o, cb) => { ran.push(args[1]); cb(null, Z(...H('h:' + args[1]))); };
    const res = await answerBranchStatus({
      listAuthorizedDirs: async () => ({ dirs: ['/p/repo', '/p/repo-agent'], failures: [] }),
      createAuthorizer: mkAuth, execFile: exec,
    }, ['/p/repo-agent', '/elsewhere', 42, null, '/p/../p/repo', '/missing']);
    assert(res[0].ok === true && res[0].head === 'h:/p/repo-agent', 'an authorized worktree is read');
    assert(res[1].ok === false && res[1].error === 'not-authorized', 'a folder outside the set: not-authorized');
    assert(res[2].error === 'not-a-string' && res[3].error === 'not-a-string', 'non-strings are refused by the launcher check');
    assert(res[4].error === 'traversal', 'a .. path is refused');
    assert(res[5].error === 'unresolved-path', 'a missing folder is refused');
    assert(JSON.stringify(ran) === JSON.stringify(['/p/repo-agent']), 'git ran only on the one authorized path');
  }
  {
    const ran = [];
    const res = await answerBranchStatus({
      listAuthorizedDirs: async () => ({ dirs: [], failures: [{ step: 'git-worktree-list', repo: '/p/repo', detail: 'fatal: x' }] }),
      createAuthorizer: (listFn) => createLauncherAuthorizer({ realpath: (p) => p, isDirectory: () => true, listAuthorizedDirs: listFn, isWin: false }),
      execFile: (c, a, o, cb) => { ran.push(a); cb(null, ''); },
    }, ['/p/repo-agent']);
    assert(res[0].ok === false && res[0].error === 'enumeration-failed' && res[0].detail === 'git-worktree-list /p/repo: fatal: x', 'when the listing failed, a path not in the set says so, with the failure');
    assert(ran.length === 0, 'and git never runs');
    const res2 = await answerBranchStatus({
      listAuthorizedDirs: async () => { throw new Error('boom'); },
      createAuthorizer: (listFn) => createLauncherAuthorizer({ realpath: (p) => p, isDirectory: () => true, listAuthorizedDirs: listFn, isWin: false }),
      execFile: () => { ran.push(1); },
    }, ['/a']);
    assert(res2[0].error === 'enumeration-failed' && /boom/.test(res2[0].detail) && ran.length === 0, 'a listing that throws refuses every path with its reason');
    let threw = false;
    try { await answerBranchStatus({}, 'x'); } catch (e) { threw = e.message === REASON.INVALID_INPUT; }
    assert(threw, 'a list that is not an array is refused');
  }

  section('main.js and preload.js wire it through the trusted-sender gate');
  {
    const mainSrc = fs.readFileSync(path.join(__dirname, 'main.js'), 'utf8');
    const preloadSrc = fs.readFileSync(path.join(__dirname, 'preload.js'), 'utf8');
    assert(/handleTrustedIpc\('worktree-branch-status',/.test(mainSrc), 'main registers worktree-branch-status with handleTrustedIpc (sender checked first)');
    assert(!/ipcMain\.handle\('worktree-branch-status'/.test(mainSrc), 'and never as a bare ipcMain.handle');
    const body = mainSrc.slice(mainSrc.indexOf("handleTrustedIpc('worktree-branch-status',"));
    const handler = body.slice(0, body.indexOf('\n});') + 4);
    assert(/answerBranchStatus\(/.test(handler) && /listBranchStatusDirs\(/.test(handler) && /createLauncherAuthorizer\(/.test(handler), 'main answers through answerBranchStatus, with the async listing and the launchers\' authorizer');
    assert(!/execFileSync|listLauncherAuthorizedDirs/.test(handler), 'no synchronous git listing on the poll');
    assert(/branchStatusGitEnv\(process\.env\)/.test(handler) && /env,?\s*\n/.test(handler), 'git gets the minimal environment');
    assert(/BRANCH_STATUS_MAX_PATHS/.test(handler) && /reportIpcRefusal\('worktree-branch-status'/.test(handler), 'a bad list is refused visibly');
    assert(/worktreeBranchStatus: \(worktrees\) => ipcRenderer\.invoke\('worktree-branch-status', worktrees\)/.test(preloadSrc), 'preload exposes cc.worktreeBranchStatus(worktrees)');
  }

  section('readBranchStatus: real git');
  const ENV = gitEnv(process.env);
  const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'mako-branch-status-'));
  const g = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    env: Object.assign({}, process.env, { GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@invalid', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@invalid' }) });
  try {
    const bare = path.join(ROOT, 'origin.git');
    const work = path.join(ROOT, 'work');
    const other = path.join(ROOT, 'other');
    g(ROOT, 'init', '-q', '--bare', '-b', 'main', bare);
    g(ROOT, 'clone', '-q', bare, work);
    g(work, 'checkout', '-q', '-b', 'main');
    fs.writeFileSync(path.join(work, 'a.txt'), 'a\n');
    fs.writeFileSync(path.join(work, 'ren.txt'), 'rename me\n');
    g(work, 'add', '.');
    g(work, 'commit', '-q', '-m', 'one');
    g(work, 'push', '-q', '-u', 'origin', 'main');

    let r = await readBranchStatus({ execFile, env: ENV }, work);
    assert(r.ok === true && r.head === 'main' && r.upstream === 'origin/main' && r.ahead === 0 && r.behind === 0 && r.changed === 0,
      'pushed and clean: in sync, nothing changed');

    // One commit behind: another clone pushes, this one fetches.
    g(ROOT, 'clone', '-q', bare, other);
    fs.writeFileSync(path.join(other, 'b.txt'), 'b\n');
    g(other, 'add', '.');
    g(other, 'commit', '-q', '-m', 'two');
    g(other, 'push', '-q');
    g(work, 'fetch', '-q');
    // Two commits ahead.
    for (const n of ['c', 'd']) {
      fs.writeFileSync(path.join(work, n + '.txt'), n + '\n');
      g(work, 'add', '.');
      g(work, 'commit', '-q', '-m', n);
    }
    // Working-tree changes: staged, unstaged, untracked (with a space), a staged rename.
    fs.writeFileSync(path.join(work, 'a.txt'), 'a changed\n');
    fs.writeFileSync(path.join(work, 'staged.txt'), 's\n');
    g(work, 'add', 'staged.txt');
    g(work, 'mv', 'ren.txt', 'renamed file.txt');
    fs.writeFileSync(path.join(work, 'new file.txt'), 'u\n');
    // Make a plain `git status` want to rewrite the index: a committed, unchanged file gets a new
    // mtime, and the index is dated before it, so git re-checks the file and would save the result.
    const indexFile = path.join(work, '.git', 'index');
    const past = new Date(Date.now() - 60000);
    fs.utimesSync(indexFile, past, past);
    fs.utimesSync(path.join(work, 'c.txt'), new Date(), new Date());
    const indexBefore = fs.statSync(indexFile).mtimeMs;

    r = await readBranchStatus({ execFile, env: ENV }, work);
    assert(r.ok === true && r.ahead === 2 && r.behind === 1, 'real git: 2 ahead, 1 behind');
    assert(r.staged === 2 && r.unstaged === 1 && r.untracked === 1 && r.changed === 4,
      `real git: 2 staged (new file, rename), 1 unstaged, 1 untracked, 4 changed (got ${JSON.stringify(r)})`);
    assert(fs.statSync(path.join(work, '.git', 'index')).mtimeMs === indexBefore, 'real git: the read left the index untouched');
    assert(!fs.existsSync(path.join(work, '.git', 'index.lock')), 'real git: no index.lock left behind');
    g(work, 'status', '--porcelain');
    assert(fs.statSync(indexFile).mtimeMs !== indexBefore, 'control: a plain git status in the same state does rewrite the index (so the check above is real)');

    // A configured fsmonitor command never runs; a plain git status runs it (the control).
    const marker = path.join(ROOT, 'fsmonitor-ran');
    const hook = path.join(ROOT, 'fsmon.sh');
    fs.writeFileSync(hook, '#!/bin/sh\necho ran > "' + marker.replace(/\\/g, '/') + '"\nexit 1\n');
    fs.chmodSync(hook, 0o755);
    g(work, 'config', 'core.fsmonitor', hook.replace(/\\/g, '/'));
    r = await readBranchStatus({ execFile, env: ENV }, work);
    assert(r.ok === true && !fs.existsSync(marker), 'real git: a core.fsmonitor command set in the repo never runs');
    g(work, 'status', '--porcelain');
    assert(fs.existsSync(marker), 'control: a plain git status does run it (so the check above is real)');
    g(work, 'config', '--unset', 'core.fsmonitor');

    // A merge conflict.
    g(work, 'stash', '-q', '-u');
    g(work, 'checkout', '-q', '-b', 'side', 'origin/main');
    fs.writeFileSync(path.join(work, 'a.txt'), 'side\n');
    g(work, 'commit', '-q', '-am', 'side');
    g(work, 'checkout', '-q', 'main');
    fs.writeFileSync(path.join(work, 'a.txt'), 'main\n');
    g(work, 'commit', '-q', '-am', 'main side');
    try { g(work, 'merge', '-q', 'side'); } catch { /* the conflict is the point */ }
    r = await readBranchStatus({ execFile, env: ENV }, work);
    assert(r.ok === true && r.conflicted === 1, 'real git: a merge conflict counts as conflicted');
    g(work, 'merge', '--abort');

    // A branch with no upstream, and a detached HEAD.
    g(work, 'checkout', '-q', '-b', 'local-only');
    r = await readBranchStatus({ execFile, env: ENV }, work);
    assert(r.ok === true && r.head === 'local-only' && r.upstream === null && r.ahead === null, 'real git: no upstream');
    g(work, 'checkout', '-q', '--detach');
    r = await readBranchStatus({ execFile, env: ENV }, work);
    assert(r.ok === true && r.detached === true, 'real git: detached HEAD');

    // A linked worktree reads its own branch.
    const wt = path.join(ROOT, 'work-agent');
    g(work, 'worktree', 'add', '-q', '-b', 'claude/agent', wt, 'main');
    fs.writeFileSync(path.join(wt, 'agent.txt'), 'x\n');
    r = await readBranchStatus({ execFile, env: ENV }, wt);
    assert(r.ok === true && r.head === 'claude/agent' && r.untracked === 1, 'real git: a linked worktree reads its own branch and files');

    // Not a repository: refused, not clean.
    const plain = path.join(ROOT, 'plain');
    fs.mkdirSync(plain);
    r = await readBranchStatus({ execFile, env: ENV }, plain);
    assert(r.ok === false && r.error === REASON.GIT_FAILED && /not a git repository/i.test(r.detail || ''), 'real git: a plain folder is refused with git\'s reason');
  } finally {
    fs.rmSync(ROOT, { recursive: true, force: true });
  }

  process.stdout.write(`\nbranch-status: ${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { process.stderr.write(`  x FAIL: unexpected error: ${(e && e.stack) || e}\n`); process.exit(1); });
