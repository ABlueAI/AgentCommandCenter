'use strict';
// Run: node app/mako-token-shim.test.js
// Plain Node.js, no framework. S35: the gh shim never exposes the token in the parent environment, runs
// the real gh by absolute path with the token in that one child's environment, and never falls back to
// another login; the launchers; App mode in the pane environment (agent-git-env.js, pty-env.js); the
// git helper as a real child process; the interim launcher; and main.js's wiring.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const cfg = require('./mako-token/config');
const { runGhShim, findRealGh, childEnv, STRIPPED } = require('./mako-token/gh-shim');
const { launcherFiles, installLaunchers, assertSafePath, gitHelperValue } = require('./mako-token/shims');
const { prepareAgentApp } = require('./mako-token/main-support');
const { launchClaude, resolveClaude } = require('./mako-token/launch');
const { buildAppAgentGitEnv, buildAppLauncherEnv, buildAgentGitEnv, isAgentToken, normalizeAgentToken, AGENT_GIT_ENV_KEYS } = require('./agent-git-env');
const { buildPtyEnv } = require('./pty-env');
const { MakoTokenError } = require('./mako-token/errors');

let passed = 0, failed = 0, skipped = 0;
function assert(cond, label) {
  if (cond) { process.stdout.write(`  ✓ ${label}\n`); passed++; }
  else { process.stderr.write(`  ✗ FAIL: ${label}\n`); failed++; }
}
async function rejects(fn) { try { await fn(); return null; } catch (e) { return e; } }

const CONFIG = { appId: 4242, installationId: 777, slug: 'mako-agents', botUserId: 99001, owner: 'ABlueAI', repo: 'AgentCommandCenter' };
const TOKEN = 'ghs_' + 'B'.repeat(36);
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'mako-shim-'));
const BIN = path.join(tmp(), 'Mako', 'bin');
const EMPTY = path.join(path.dirname(BIN), 'gh-empty');

(async () => {
  // --- the gh shim, in this process, with the real child process ----------------------------------
  {
    const parentEnv = { PATH: 'X', GH_TOKEN: 'stale-pane-token', github_token: 'lower', GH_HOST: 'evil.example', GH_ENTERPRISE_TOKEN: 'e', GH_CONFIG_DIR: 'C:\\Users\\blue\\AppData\\Roaming\\GitHub CLI', ELECTRON_RUN_AS_NODE: '1', KEEP: 'yes' };
    const snapshot = JSON.stringify(parentEnv);
    const globalBefore = process.env.GH_TOKEN;
    let asked = null;
    const probe = 'process.stdout.write(JSON.stringify({t:process.env.GH_TOKEN||null,d:process.env.GH_CONFIG_DIR||null,h:process.env.GH_HOST||null,e:process.env.GH_ENTERPRISE_TOKEN||null,g:process.env.GITHUB_TOKEN||process.env.github_token||null,r:process.env.ELECTRON_RUN_AS_NODE||null,k:process.env.KEEP||null,p:process.env.GH_PROMPT_DISABLED||null,a:process.argv.slice(1)}))';
    const captured = { out: '' };
    const code = await runGhShim({
      argv: ['-e', probe, 'pr', 'list'], env: parentEnv, realGh: process.execPath, ghConfigDir: EMPTY, binDir: BIN,
      getToken: async (p) => { asked = p; return { token: TOKEN }; },
      spawn: (c, a, o) => { const r = spawnSync(c, a, { ...o, stdio: 'pipe', encoding: 'utf8' }); captured.out = r.stdout; return r; },
      fs: { mkdirSync() {} },
    });
    const seen = JSON.parse(captured.out);
    assert(code === 0 && asked === 'writer', 'the shim asks mako-token for a writer token and returns gh\'s exit code');
    assert(seen.t === TOKEN, 'the REAL gh child gets GH_TOKEN');
    assert(JSON.stringify(parentEnv) === snapshot && process.env.GH_TOKEN === globalBefore && !JSON.stringify(parentEnv).includes(TOKEN), 'the parent environment never holds the token');
    assert(seen.d === EMPTY, 'GH_CONFIG_DIR points at the empty folder, so a stored login cannot be used');
    assert(seen.h === null && seen.e === null && seen.g === null && seen.r === null, 'GH_HOST, enterprise and GITHUB_TOKEN names, and ELECTRON_RUN_AS_NODE are removed for the child');
    assert(seen.k === 'yes' && seen.p === '1', 'ordinary variables pass through; prompts are disabled');
    assert(JSON.stringify(seen.a.slice(-2)) === '["pr","list"]', 'arguments are passed through unchanged');
    for (const n of ['GH_TOKEN', 'GITHUB_TOKEN', 'GH_ENTERPRISE_TOKEN', 'GH_HOST', 'GH_CONFIG_DIR']) assert(STRIPPED.includes(n), `${n} is stripped from the child's inherited environment`);
    const ce = childEnv({ gh_token: 'a', Github_Token: 'b', X: '1' }, { token: TOKEN, ghConfigDir: EMPTY });
    assert(Object.keys(ce).filter((k) => /gh_token|github_token/i.test(k)).join() === 'GH_TOKEN' && ce.GH_TOKEN === TOKEN, 'any-case spellings of the token names are replaced by the one GH_TOKEN');

    // the reader profile through MAKO_TOKEN_PROFILE
    await runGhShim({ argv: ['-e', '0'], env: { PATH: 'X', MAKO_TOKEN_PROFILE: 'reader' }, realGh: process.execPath, ghConfigDir: EMPTY, binDir: BIN, getToken: async (p) => { asked = p; return { token: TOKEN }; }, spawn: (c, a, o) => spawnSync(c, a, { ...o, stdio: 'ignore' }), fs: { mkdirSync() {} } });
    assert(asked === 'reader', 'MAKO_TOKEN_PROFILE=reader asks for the read-only token');
    for (const bad of ['root', 'Reader', 'read', 'writer ']) {
      let ran = false; let errText2 = '';
      const c = await runGhShim({ argv: ['pr', 'list'], env: { PATH: 'X', MAKO_TOKEN_PROFILE: bad }, realGh: process.execPath, ghConfigDir: EMPTY, binDir: BIN, getToken: async () => { ran = true; return { token: TOKEN }; }, spawn: () => { ran = true; return { status: 0 }; }, stderr: { write: (t) => { errText2 += t; } }, fs: { mkdirSync() {} } });
      assert(c === 2 && !ran && /unknown token profile/.test(errText2), `MAKO_TOKEN_PROFILE=${JSON.stringify(bad)} is refused: no token minted, gh not run (never a silent fallback to the wider writer profile)`);
    }
    asked = null;
    await runGhShim({ argv: ['-e', '0'], env: { PATH: 'X' }, realGh: process.execPath, ghConfigDir: EMPTY, binDir: BIN, getToken: async (p) => { asked = p; return { token: TOKEN }; }, spawn: (c, a, o) => spawnSync(c, a, { ...o, stdio: 'ignore' }), fs: { mkdirSync() {} } });
    assert(asked === 'writer', 'with no profile set, the default is writer (the pane profile)');

    // no token: refuses, never spawns, never falls back
    let spawned = false; let errText = '';
    const sink = { write: (s) => { errText += s; } };
    const nogo = await runGhShim({
      argv: ['pr', 'list'], env: { PATH: 'X', GH_TOKEN: 'ambient', GITHUB_TOKEN: 'ambient' }, realGh: process.execPath, ghConfigDir: EMPTY, binDir: BIN,
      getToken: async () => { throw new MakoTokenError('renewal-failed', 'could not get a new GitHub App token (offline). No other login is used instead; fix the cause and try again.'); },
      spawn: () => { spawned = true; return { status: 0 }; }, stderr: sink, fs: { mkdirSync() {} },
    });
    assert(nogo === 3 && !spawned && /No other login is used instead/.test(errText), 'renewal failure: exit 3, gh is not run, the message is visible');
    assert(!/ambient/.test(errText), 'the ambient GH_TOKEN is not used or echoed');
    errText = '';
    const other = await runGhShim({ argv: ['pr'], env: { PATH: 'X' }, realGh: process.execPath, ghConfigDir: EMPTY, binDir: BIN, getToken: async () => { throw new Error('boom ' + TOKEN); }, spawn: () => { spawned = true; return { status: 0 }; }, stderr: sink, fs: { mkdirSync() {} } });
    assert(other === 3 && !spawned && !errText.includes(TOKEN), 'an unexpected error also refuses, and a token in its text is scrubbed');

    // refused subcommands
    for (const sub of ['token', 'login', 'logout', 'refresh', 'setup-git', 'switch', 'git-credential']) {
      errText = '';
      const c = await runGhShim({ argv: ['auth', sub], env: { PATH: 'X' }, realGh: process.execPath, ghConfigDir: EMPTY, binDir: BIN, getToken: async () => { spawned = true; return { token: TOKEN }; }, spawn: () => { spawned = true; return { status: 0 }; }, stderr: sink, fs: { mkdirSync() {} } });
      assert(c === 2 && !spawned && /not available here/.test(errText), `gh auth ${sub} is refused (no token minted, gh not run)`);
    }
    for (const argv of [['auth', 'status', '--show-token'], ['auth', 'status', '-t'], ['auth', 'status', '-at'], ['auth', 'status', '--show-token=true'], ['auth', 'status', '-t=true'], ['auth', 'status', '-at=true'], ['config', 'set', 'pager', 'sh -c x'], ['extensions', 'install', 'o/r'], ['auth', 'status', '--hostname', 'github.com', '--show-token'], ['alias', 'set', 'x', 'y'], ['extension', 'install', 'o/r'], ['ext', 'list']]) {
      errText = ''; spawned = false;
      const c = await runGhShim({ argv, env: { PATH: 'X' }, realGh: process.execPath, ghConfigDir: EMPTY, binDir: BIN, getToken: async () => { spawned = true; return { token: TOKEN }; }, spawn: () => { spawned = true; return { status: 0 }; }, stderr: sink, fs: { mkdirSync() {} } });
      assert(c === 2 && !spawned && /not available here/.test(errText), `gh ${argv.join(' ')} is refused (no token minted, gh not run)`);
    }
    for (const argv of [['auth', 'status'], ['auth', 'status', '--hostname', 'github.com'], ['auth', 'status', '--hostname=github.com'], ['auth', 'status', '-h', 'github.com'], ['config', 'get', 'editor'], ['pr', 'list']]) {
      const c = await runGhShim({ argv, env: { PATH: 'X' }, realGh: process.execPath, ghConfigDir: EMPTY, binDir: BIN, getToken: async () => ({ token: TOKEN }), spawn: () => ({ status: 0 }), fs: { mkdirSync() {} } });
      assert(c === 0, `gh ${argv.join(' ')} is allowed`);
    }
    const okAuth = await runGhShim({ argv: ['auth', 'status'], env: { PATH: 'X' }, realGh: process.execPath, ghConfigDir: EMPTY, binDir: BIN, getToken: async () => ({ token: TOKEN }), spawn: () => ({ status: 0 }), fs: { mkdirSync() {} } });
    assert(okAuth === 0, 'gh auth status is allowed');

    // real gh missing
    errText = '';
    const noGh = await runGhShim({ argv: ['pr'], env: { PATH: '' }, binDir: BIN, ghConfigDir: EMPTY, getToken: async () => ({ token: TOKEN }), spawn: () => ({ status: 0 }), stderr: sink, platform: 'linux', fs: { mkdirSync() {} } });
    assert(noGh === 4 && /real gh was not found/.test(errText), 'no real gh: exit 4 with a message, no token minted first');
    const startFail = await runGhShim({ argv: ['pr'], env: { PATH: 'X' }, realGh: 'C:\\x\\gh.exe', binDir: BIN, ghConfigDir: EMPTY, getToken: async () => ({ token: TOKEN }), spawn: () => ({ error: new Error('ENOENT'), status: null }), stderr: sink, fs: { mkdirSync() {} } });
    assert(startFail === 4, 'a gh that cannot start: exit 4');
    const sig = await runGhShim({ argv: ['pr'], env: { PATH: 'X' }, realGh: 'gh', binDir: BIN, ghConfigDir: EMPTY, getToken: async () => ({ token: TOKEN }), spawn: () => ({ status: null, signal: 'SIGTERM' }), fs: { mkdirSync() {} } });
    assert(sig === 1, 'a gh killed by a signal: exit 1');
  }
  {
    // finding the real gh: never the shim itself
    const d1 = '/opt/mako/bin', d2 = '/usr/local/bin'; // fixed POSIX-style paths: this case runs the POSIX branch on any OS
    const exists = (p) => p === path.posix.join(d1, 'gh') || p === path.posix.join(d2, 'gh');
    const found = findRealGh({ env: { PATH: `${d1}:${d2}` }, binDir: d1, exists, platform: 'linux' });
    assert(found === path.posix.join(d2, 'gh'), 'findRealGh skips the shim folder even when it is first on PATH');
    assert(findRealGh({ env: { Path: d2 }, binDir: d1, exists, platform: 'linux' }) === path.posix.join(d2, 'gh'), 'findRealGh reads Path in any case');
    const w = findRealGh({ env: { Path: 'C:\\Mako\\bin;C:\\Tools', ProgramFiles: 'C:\\Program Files' }, binDir: 'C:\\Mako\\bin', exists: (p) => p === 'C:\\Program Files\\GitHub CLI\\gh.exe', platform: 'win32' });
    assert(w === 'C:\\Program Files\\GitHub CLI\\gh.exe', 'on Windows it falls back to the GitHub CLI install folder');
    assert(findRealGh({ env: { PATH: '' }, binDir: d1, exists: () => false, platform: 'linux' }) === null, 'no gh: null');
    const rel = findRealGh({ env: { PATH: `.:node_modules/.bin:bin:${d2}` }, binDir: d1, exists: (p) => p === 'gh' || p === path.posix.join('node_modules/.bin', 'gh') || p === path.posix.join('bin', 'gh') || p === path.posix.join(d2, 'gh'), platform: 'linux' });
    assert(rel === path.posix.join(d2, 'gh'), 'a relative PATH entry (., node_modules/.bin) is ignored: a gh planted in the worktree never runs with the token');
    const wrel = findRealGh({ env: { Path: '.;C:\\repo\\node_modules\\.bin;..\\x;C:\\Tools', ProgramFiles: 'C:\\Program Files' }, binDir: 'C:\\Mako\\bin', exists: (p) => p === 'C:\\Tools\\gh.exe' || p === 'gh.exe', platform: 'win32' });
    assert(wrel === 'C:\\Tools\\gh.exe', 'Windows: relative PATH entries are ignored too');
  }

  // --- launchers ------------------------------------------------------------------------------------
  {
    const runtime = { exe: 'C:\\Program Files\\Mako\\electron.exe', runAsNode: true };
    const files = launcherFiles({ runtime, ghShimJs: 'C:\\app\\mako-token\\gh-shim.js', cliJs: 'C:\\app\\mako-token\\cli.js', binDir: 'C:\\Users\\b\\AppData\\Roaming\\Mako\\bin' });
    assert(Object.keys(files).sort().join() === 'gh,gh.cmd,gh.ps1,git-credential-mako,mako-claude.cmd', 'the launcher set: gh (sh), gh.cmd, gh.ps1, git-credential-mako, mako-claude.cmd');
    assert(files.gh.startsWith('#!/bin/sh\n') && !files.gh.includes('\r') && files.gh.includes("exec 'C:/Program Files/Mako/electron.exe' 'C:/app/mako-token/gh-shim.js' \"$@\""), 'the sh shim uses LF, forward slashes and exec with "$@"');
    assert(files['git-credential-mako'].includes("'C:/app/mako-token/cli.js' git \"$@\""), 'the git helper runs `cli.js git <action>`');
    assert(files['gh.cmd'].includes('\r\n') && files['gh.cmd'].includes('"C:\\Program Files\\Mako\\electron.exe" "C:\\app\\mako-token\\gh-shim.js" %*') && files['gh.cmd'].includes('setlocal'), 'the cmd shim is CRLF, quotes its paths and keeps the variable local');
    assert(files['gh.ps1'].includes("& 'C:\\Program Files\\Mako\\electron.exe' 'C:\\app\\mako-token\\gh-shim.js' @args") && files['gh.ps1'].includes('Remove-Item Env:ELECTRON_RUN_AS_NODE'), 'the PowerShell shim passes @args and clears ELECTRON_RUN_AS_NODE');
    assert(files['mako-claude.cmd'].includes('cli.js" launch claude %*'), 'the interim launcher runs `launch claude`');
    assert(!Object.values(files).some((c) => /ghs_|GH_TOKEN|GITHUB_TOKEN|PRIVATE KEY/.test(c)), 'no launcher contains a token or a token variable');
    const plain = launcherFiles({ runtime: { exe: 'C:\\node\\node.exe', runAsNode: false }, ghShimJs: 'C:\\a\\gh-shim.js', cliJs: 'C:\\a\\cli.js', binDir: 'C:\\b' });
    assert(!/ELECTRON_RUN_AS_NODE/.test(Object.values(plain).join('\n')), 'with plain Node, ELECTRON_RUN_AS_NODE is not mentioned');
    for (const bad of ["C:\\it's\\x", 'C:\\a"b', 'C:\\100%\\x', 'C:\\a&b', 'C:\\a|b', 'C:\\a\nb', 'C:\\a$b', 'C:\\a`b', 'C:\\a!b']) {
      const e = await rejects(async () => assertSafePath(bad, 'p'));
      assert(e && e.code === 'unsafe-path', `an unsafe path is refused: ${JSON.stringify(bad)}`);
    }
    const e = await rejects(async () => launcherFiles({ runtime: { exe: "C:\\o'x\\node.exe" }, ghShimJs: 'a', cliJs: 'b', binDir: 'c' }));
    assert(e && e.code === 'unsafe-path', 'launcherFiles refuses an unsafe runtime path');
    assert(gitHelperValue('C:\\Users\\b\\AppData\\Roaming\\Mako\\bin') === "!'C:/Users/b/AppData/Roaming/Mako/bin/git-credential-mako'", 'git helper value: ! + quoted forward-slash path');

    const dir = path.join(tmp(), 'bin');
    const first = installLaunchers({ fs, binDir: dir, files });
    const second = installLaunchers({ fs, binDir: dir, files });
    assert(first.length === 5 && second.length === 0, 'installLaunchers writes once and is idempotent');
    assert(fs.readFileSync(path.join(dir, 'gh'), 'utf8') === files.gh && fs.readdirSync(dir).every((n) => !n.endsWith('.tmp')), 'the files match and no temp file is left');
    const changed = installLaunchers({ fs, binDir: dir, files: { ...files, gh: files.gh + '# x\n' } });
    assert(changed.join() === 'gh', 'only a changed launcher is rewritten');
  }

  // --- App mode in the pane environment ---------------------------------------------------------
  {
    const ambient = { Path: 'C:\\Windows;C:\\Tools', SystemRoot: 'C:\\Windows', GH_TOKEN: 'ambient', Github_Token: 'ambient2', GH_ENTERPRISE_TOKEN: 'e', GH_HOST: 'evil.example', GH_CONFIG_DIR: 'C:\\Users\\b\\AppData\\Roaming\\GitHub CLI', GIT_CONFIG_COUNT: '9', Git_Config_Key_4: 'core.pager', GIT_CONFIG_PARAMETERS: "'credential.helper=manager'", GIT_ASKPASS: 'evil', GIT_AUTHOR_NAME: 'ABlueAI', ELECTRON_RUN_AS_NODE: '1' };
    const app = { config: CONFIG, binDir: BIN, ghConfigDir: EMPTY };
    const env = buildPtyEnv({ baseEnv: ambient, fencedRole: false, videoScout: false, paneStatusEnv: {}, agentGit: true, agentGitToken: null, agentApp: app });
    const names = Object.keys(env).map((k) => k.toUpperCase());
    assert(!names.includes('GH_TOKEN') && !names.includes('GITHUB_TOKEN') && !names.includes('GH_ENTERPRISE_TOKEN') && !names.includes('GH_HOST'), 'App mode: the pane has no GH_TOKEN, GITHUB_TOKEN, enterprise token or GH_HOST, in any spelling');
    assert(env.PATH === `${BIN};C:\\Windows;C:\\Tools` && names.filter((n) => n === 'PATH').length === 1, 'App mode: the launcher folder is first on PATH, the ambient PATH follows, and only one spelling remains');
    assert(env.GH_CONFIG_DIR === EMPTY, 'App mode: GH_CONFIG_DIR is the empty folder');
    assert(env.GIT_CONFIG_COUNT === '6' && !('Git_Config_Key_4' in env) && env.GIT_CONFIG_KEY_4 === 'user.email', 'App mode: six command-scope entries replace any ambient ones');
    assert(env.GIT_CONFIG_KEY_5 === 'core.askPass' && env.GIT_CONFIG_VALUE_5 === '', 'App mode: core.askPass is reset, so a failed helper never falls back to a GUI askpass prompt');
    assert(!('GIT_CONFIG_PARAMETERS' in env) && !('GIT_ASKPASS' in env), 'App mode: ambient GIT_CONFIG_PARAMETERS and GIT_ASKPASS are removed');
    assert(env.GIT_CONFIG_KEY_0 === 'credential.helper' && env.GIT_CONFIG_VALUE_0 === '' && env.GIT_CONFIG_KEY_1 === 'credential.https://github.com.helper' && env.GIT_CONFIG_VALUE_1 === '', 'App mode: entries 0 and 1 reset every credential helper, global and github.com-specific');
    assert(env.GIT_CONFIG_KEY_2 === 'credential.https://github.com.helper' && env.GIT_CONFIG_VALUE_2 === gitHelperValue(BIN), 'App mode: entry 2 is the mako-token helper for github.com');
    assert(env.GIT_TERMINAL_PROMPT === '0', 'App mode: GIT_TERMINAL_PROMPT=0');
    const bot = cfg.botIdentity(CONFIG);
    assert(env.GIT_AUTHOR_NAME === bot.name && env.GIT_COMMITTER_NAME === bot.name && env.GIT_AUTHOR_EMAIL === bot.email && env.GIT_COMMITTER_EMAIL === bot.email && env.GIT_CONFIG_VALUE_3 === bot.name && env.GIT_CONFIG_VALUE_4 === bot.email, 'App mode: commits use the bot noreply identity');
    assert(!JSON.stringify(env).includes('ABlueAgent') && env.GIT_AUTHOR_NAME !== 'ABlueAI', 'App mode: no ABlueAgent or ABlueAI identity');
    assert(env.CLAUDE_CODE_SUBPROCESS_ENV_SCRUB === '1' && env.SystemRoot === 'C:\\Windows', 'App mode: the scrub stays forced and ordinary variables are kept');
    // App mode wins over a PAT; the PAT is never used or emitted
    const PAT = 'ghp_' + 'A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8';
    const both = buildPtyEnv({ baseEnv: ambient, fencedRole: false, videoScout: false, paneStatusEnv: {}, agentGit: true, agentGitToken: PAT, agentApp: app });
    assert(!JSON.stringify(both).includes(PAT) && !('GH_TOKEN' in both), 'App mode: a saved PAT is not emitted (no silent mixing of identities)');
    // never for plain shells, fenced roles or Video Scout
    for (const [label, o] of [['a plain shell', { agentGit: false }], ['a fenced role', { agentGit: true, fencedRole: true }], ['Video Scout', { agentGit: true, videoScout: true }]]) {
      const e = buildPtyEnv({ baseEnv: { Path: 'C:\\Windows' }, fencedRole: false, videoScout: false, paneStatusEnv: {}, agentApp: app, ...o });
      assert(!('GH_CONFIG_DIR' in e) && !JSON.stringify(e).includes(BIN), `App mode is not applied to ${label}`);
    }
    // no PATH at all
    const nopath = buildPtyEnv({ baseEnv: {}, fencedRole: false, videoScout: false, paneStatusEnv: {}, agentGit: true, agentApp: app });
    assert(nopath.PATH === BIN, 'App mode: with no ambient PATH, PATH is just the launcher folder');
    // refusals are loud, not empty
    let thrown = await rejects(async () => buildAppAgentGitEnv({ config: { ...CONFIG, botUserId: 'x' }, binDir: BIN, ghConfigDir: EMPTY, ambientPath: '' }));
    assert(thrown && /config refused/.test(thrown.message), 'an invalid config throws instead of yielding an empty environment');
    thrown = await rejects(async () => buildAppAgentGitEnv({ config: CONFIG, binDir: "C:\\it's", ghConfigDir: EMPTY, ambientPath: '' }));
    assert(thrown && thrown.code === 'unsafe-path', 'an unsafe launcher path throws');
    // every emitted name is reserved
    const emitted = Object.keys(buildAppAgentGitEnv({ config: CONFIG, binDir: BIN, ghConfigDir: EMPTY, ambientPath: 'p' })).filter((k) => k !== 'PATH');
    assert(emitted.every((k) => AGENT_GIT_ENV_KEYS.includes(k)), 'every App-mode name (except PATH) is a reserved identity name');
    assert(JSON.stringify(Object.keys(buildAppLauncherEnv({ config: CONFIG, binDir: BIN, ghConfigDir: EMPTY }))).indexOf('PATH') === -1, 'the launcher entries exclude PATH');
    // the PAT path does not take an installation token
    const inst = 'ghs_' + 'C'.repeat(36);
    assert(!isAgentToken(inst) && JSON.stringify(buildAgentGitEnv(inst)) === '{}' && !normalizeAgentToken(inst).ok, 'an installation token (ghs_) is refused by the PAT path: App mode is separate and deliberate');
    // the PAT mode is unchanged
    const pat = buildPtyEnv({ baseEnv: ambient, fencedRole: false, videoScout: false, paneStatusEnv: {}, agentGit: true, agentGitToken: PAT });
    assert(pat.GH_TOKEN === PAT && pat.GIT_CONFIG_COUNT === '4' && pat.PATH === undefined && pat.Path === 'C:\\Windows;C:\\Tools', 'without App config the PAT mode is exactly as before (4 entries, PATH untouched)');
    assert(!('GH_CONFIG_DIR' in pat), 'PAT mode: an ambient GH_CONFIG_DIR no longer leaks in');
  }

  // --- main.js wiring: prepareAgentApp -----------------------------------------------------------
  {
    const env = { APPDATA: path.join(tmp(), 'Roaming'), LOCALAPPDATA: path.join(tmp(), 'Local') };
    const layout = cfg.layout(env, os.homedir());
    let r = prepareAgentApp({ env, fs, install: () => { throw new Error('must not install'); } });
    assert(r.mode === 'pat', 'no App config: the PAT path (S06) as before');
    fs.mkdirSync(layout.dataDir, { recursive: true });
    fs.writeFileSync(layout.keyPath, 'blob');
    r = prepareAgentApp({ env, fs, install: () => { throw new Error('must not install'); } });
    assert(r.mode === 'refused' && /config .*is missing/.test(r.reason) && /Not falling back/.test(r.reason), 'a key with no config (deleted config, half-finished import) refuses the pane: no silent downgrade to the PAT or Blue\'s own login');
    fs.rmSync(layout.keyPath);
    fs.writeFileSync(layout.configPath, '{not json');
    r = prepareAgentApp({ env, fs, install: () => {} });
    assert(r.mode === 'refused' && /config is invalid/.test(r.reason), 'a corrupt App config refuses the pane (no fallback)');
    fs.writeFileSync(layout.configPath, JSON.stringify({ ...CONFIG, appId: -1 }));
    assert(prepareAgentApp({ env, fs, install: () => {} }).mode === 'refused', 'an invalid App config refuses the pane');
    fs.writeFileSync(layout.configPath, JSON.stringify(CONFIG));
    r = prepareAgentApp({ env, fs, install: () => {} });
    assert(r.mode === 'refused' && /key is not imported/.test(r.reason) && /Not falling back/.test(r.reason), 'a config without the key refuses the pane and says it will not fall back');
    fs.writeFileSync(layout.keyPath, 'blob');
    r = prepareAgentApp({ env, fs, install: () => { throw new Error('disk full'); } });
    assert(r.mode === 'refused' && /could not prepare the gh shim/.test(r.reason), 'launchers that cannot be written refuse the pane');
    let installed = 0;
    r = prepareAgentApp({ env, fs, install: () => { installed++; } });
    assert(r.mode === 'app' && installed === 1 && r.agentApp.binDir === layout.binDir && r.agentApp.ghConfigDir === layout.ghEmptyDir && r.agentApp.config.slug === 'mako-agents', 'a complete setup gives App mode with the launchers installed');
    assert(!JSON.stringify(r).includes('blob'), 'App mode carries no key material');
    const quoted = prepareAgentApp({ env: { APPDATA: path.join(tmp(), "it's"), LOCALAPPDATA: env.LOCALAPPDATA }, fs: { readFileSync: () => JSON.stringify(CONFIG), existsSync: () => true }, install: () => { throw new Error('must not install'); } });
    assert(quoted.mode === 'refused' && /launcher path/.test(quoted.reason), 'an unsafe folder path refuses the pane before anything is claimed (buildPtyEnv can no longer throw on it)');
    // the real installer writes real files
    fs.mkdirSync(layout.ghEmptyDir, { recursive: true });
    fs.writeFileSync(path.join(layout.ghEmptyDir, 'config.yml'), 'pager: sh -c evil');
    const real = prepareAgentApp({ env, fs });
    assert(!fs.existsSync(path.join(layout.ghEmptyDir, 'config.yml')), 'anything a pane planted in the shared gh config folder is cleared when the next pane starts');
    assert(real.mode === 'app' && fs.existsSync(path.join(layout.binDir, 'gh.cmd')) && fs.existsSync(layout.ghEmptyDir) && fs.readdirSync(layout.ghEmptyDir).length === 0, 'the real installer writes the launchers and an EMPTY gh config folder');
  }

  // --- the git helper and the CLI as real child processes ---------------------------------------
  {
    const root = tmp();
    const env = { APPDATA: path.join(root, 'Roaming'), LOCALAPPDATA: path.join(root, 'Local'), PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, USERNAME: 'tester' };
    const layout = cfg.layout(env, os.homedir());
    fs.mkdirSync(layout.dataDir, { recursive: true });
    fs.mkdirSync(layout.cacheDir, { recursive: true });
    fs.writeFileSync(layout.configPath, JSON.stringify(CONFIG));
    const cli = path.join(__dirname, 'mako-token', 'cli.js');
    const run = (args, input) => spawnSync(process.execPath, [cli, ...args], { env, input, encoding: 'utf8' });
    const rec = (expiresInMs, mintedAgoMs = 0) => ({
      v: 1, ...CONFIG, profile: 'writer', permissionsKey: cfg.profileKey('writer'), token: TOKEN,
      expiresAt: new Date(Date.now() + expiresInMs).toISOString(), mintedAt: new Date(Date.now() - mintedAgoMs).toISOString(),
    });
    delete rec.slug; // slug/botUserId are not part of a cache record
    const seed = (r) => { const x = { ...r }; delete x.botUserId; fs.writeFileSync(path.join(layout.cacheDir, 'token-writer.json'), JSON.stringify(x)); };
    seed(rec(40 * 60 * 1000, 20 * 60 * 1000));
    let r = run(['git', 'get'], 'protocol=https\nhost=github.com\n\n');
    assert(r.status === 0 && r.stdout === `username=x-access-token\npassword=${TOKEN}\n`, 'git get (real process, valid cache): the token in git\'s format, no key needed');
    assert(!r.stderr.includes(TOKEN), 'nothing on stderr shows the token');
    r = run(['git', 'get'], 'protocol=https\nhost=gitlab.com\n\n');
    assert(r.status === 0 && r.stdout === '', 'git get for another host prints nothing');
    r = run(['status'], '');
    assert(r.status === 0 && /reused from the cache/.test(r.stdout) && !r.stdout.includes(TOKEN) && /mako-agents/.test(r.stdout), 'status reports a cached token without printing it');
    seed(rec(2 * 60 * 1000, 58 * 60 * 1000)); // 2 minutes left: inside the margin, so it must be renewed
    r = run(['git', 'get'], 'protocol=https\nhost=github.com\n\n');
    assert(r.status !== 0 && r.stdout === '' && /App key is not imported/.test(r.stderr) && !r.stderr.includes(TOKEN), 'git get, token inside the margin and no key: non-zero, nothing on stdout, a clear message, never the old token');
    r = run(['status'], '');
    assert(r.status !== 0 && /App key is not imported/.test(r.stderr) && r.stdout === '', 'status refuses visibly too');
    fs.rmSync(layout.configPath);
    r = run(['git', 'get'], 'protocol=https\nhost=github.com\n\n');
    assert(r.status !== 0 && r.stdout === '' && /not set up on this PC/.test(r.stderr), 'no App config: git get refuses and prints no credential');
    seed(rec(40 * 60 * 1000, 20 * 60 * 1000));
    for (const bad of ['Reader', 'read']) {
      r = run(['status', '--profile', bad], '');
      assert(r.status === 2 && /unknown token profile/.test(r.stderr) && r.stdout === '', `status --profile ${bad} is refused, not treated as writer`);
    }
    r = spawnSync(process.execPath, [cli, 'git', 'get'], { env: { ...env, MAKO_TOKEN_PROFILE: 'wrter' }, input: 'protocol=https\nhost=github.com\n\n', encoding: 'utf8' });
    assert(r.status === 2 && r.stdout === '', 'MAKO_TOKEN_PROFILE misspelt: git get gives no credential');
    r = run(['bogus'], '');
    assert(r.status === 2 && /usage/.test(r.stderr), 'an unknown command is a usage error');
    r = run(['import'], '');
    assert(r.status === 2 && /usage: mako-token import/.test(r.stderr), 'import without a path is a usage error');
    r = run(['launch', 'cmd'], '');
    assert(r.status !== 0 && /launch claude/.test(r.stderr), 'launch runs claude only');

    // with the standard credential-helper dance through real git, if git is installed
    const gitv = spawnSync('git', ['--version'], { encoding: 'utf8' });
    if (gitv.status === 0) {
      fs.writeFileSync(layout.configPath, JSON.stringify(CONFIG));
      seed(rec(40 * 60 * 1000, 20 * 60 * 1000));
      const binDir = layout.binDir;
      fs.mkdirSync(binDir, { recursive: true });
      const exe = process.execPath.replace(/\\/g, '/');
      const helper = path.join(binDir, 'git-credential-mako');
      fs.writeFileSync(helper, `#!/bin/sh\nexec '${exe}' '${cli.replace(/\\/g, '/')}' git "$@"\n`, { mode: 0o755 });
      const gEnv = buildAppLauncherEnv({ config: CONFIG, binDir, ghConfigDir: layout.ghEmptyDir });
      const gitBase = { ...process.env, ...env, ...gEnv, HOME: root, USERPROFILE: root };
      for (const k of Object.keys(gitBase)) if (/^(GH_TOKEN|GITHUB_TOKEN|GIT_ASKPASS|GIT_CONFIG_PARAMETERS)$/i.test(k)) delete gitBase[k];
      const fill = spawnSync('git', ['credential', 'fill'], { env: gitBase, input: 'protocol=https\nhost=github.com\n\n', encoding: 'utf8' });
      assert(fill.status === 0 && /password=ghs_B{36}/.test(fill.stdout) && /username=x-access-token/.test(fill.stdout), 'real `git credential fill` with the App-mode environment gets the token from mako-token');
      const cfgOut = spawnSync('git', ['config', '--get-all', 'user.email'], { env: gitBase, encoding: 'utf8' });
      assert(cfgOut.stdout.trim() === cfg.botIdentity(CONFIG).email, 'real git reports the bot email from the command-scope entries');
    } else skipped++;
  }

  // --- the interim launcher -----------------------------------------------------------------------
  {
    const layout = { binDir: BIN, ghEmptyDir: EMPTY };
    let call = null;
    const code = launchClaude({
      args: ['--model', 'x'], env: { PATH: `${BIN}:/usr/bin`, GH_TOKEN: 'ambient', ELECTRON_RUN_AS_NODE: '1' }, layout, config: CONFIG, platform: 'linux',
      exists: (p) => p === '/usr/bin/claude', spawn: (c, a, o) => { call = { c, a, o }; return { status: 7 }; },
    });
    assert(code === 7 && call.c === '/usr/bin/claude' && call.a.join() === '--model,x', 'mako-claude runs the real claude (not the shim folder) with its arguments and exit code');
    const names = Object.keys(call.o.env).map((k) => k.toUpperCase());
    assert(!names.includes('GH_TOKEN') && !names.includes('ELECTRON_RUN_AS_NODE') && call.o.env.GH_CONFIG_DIR === EMPTY && call.o.env.PATH.startsWith(BIN), 'it gets the pane\'s App-mode environment: no token, the empty gh folder, the shim first');
    assert(resolveClaude({ env: { PATH: `.:/usr/bin` }, binDir: BIN, exists: (p) => p === 'claude' || p === '/usr/bin/claude', platform: 'linux' }) === '/usr/bin/claude', 'a relative PATH entry never supplies claude');
    assert(resolveClaude({ env: { PATH: `${BIN}:/x` }, binDir: BIN, exists: (p) => p === path.posix.join(BIN, 'claude'), platform: 'linux' }) === null, 'a `claude` inside the shim folder is never run');
    let err = '';
    const none = launchClaude({ args: [], env: { PATH: '' }, layout, config: CONFIG, platform: 'linux', exists: () => false, spawn: () => ({ status: 0 }), stderr: { write: (s) => { err += s; } } });
    assert(none === 4 && /not found/.test(err), 'no claude: exit 4 with a message');
    let ncall = null;
    launchClaude({ args: [], env: { Path: 'C:\\Tools', SystemRoot: 'C:\\Windows', ComSpec: 'C:\\evil\\cmd.exe' }, layout, config: CONFIG, platform: 'win32', exists: (p) => p === 'C:\\Tools\\claude.cmd', spawn: (c) => { ncall = c; return { status: 0 }; } });
    assert(ncall === 'C:\\Windows\\System32\\cmd.exe', 'cmd.exe is always the one under SystemRoot\\System32: ComSpec is never consulted');
    ncall = null;
    launchClaude({ args: [], env: { Path: 'C:\\Tools' }, layout, config: CONFIG, platform: 'win32', exists: (p) => p === 'C:\\Tools\\claude.cmd', spawn: (c) => { ncall = c; return { status: 0 }; } });
    assert(ncall === 'C:\\Windows\\System32\\cmd.exe', 'with no SystemRoot or ComSpec, cmd.exe is still an absolute C:\\Windows\\System32 path');
    let wcall = null;
    launchClaude({ args: ['--resume', 'abc'], env: { Path: 'C:\\Tools', SystemRoot: 'C:\\Windows', ComSpec: 'C:\\evil\\cmd.exe' }, layout, config: CONFIG, platform: 'win32', exists: (p) => p === 'C:\\Tools\\claude.cmd', spawn: (c, a, o) => { wcall = { c, a, o }; return { status: 0 }; } });
    assert(wcall.c === 'C:\\Windows\\System32\\cmd.exe' && wcall.a.slice(0, 3).join(' ') === '/d /s /c' && wcall.a[3] === '"' + '"C:\\Tools\\claude.cmd" "--resume" "abc"' + '"' && wcall.o.windowsVerbatimArguments === true, 'a claude.cmd is run through cmd.exe /d /s /c with quoted arguments');
    err = '';
    const mangled = launchClaude({ args: ['a"b&c'], env: { Path: 'C:\\Tools' }, layout, config: CONFIG, platform: 'win32', exists: (p) => p === 'C:\\Tools\\claude.cmd', spawn: () => { throw new Error('must not run'); }, stderr: { write: (s) => { err += s; } } });
    assert(mangled === 2 && /mangle/.test(err), 'an argument cmd.exe would mangle is refused, not passed on');
  }

  // --- hygiene: no fallback to other logins in the code --------------------------------------------
  {
    const dir = path.join(__dirname, 'mako-token');
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.js'));
    const offenders = [];
    for (const f of files) {
      const text = fs.readFileSync(path.join(dir, f), 'utf8').replace(/^\s*\/\/.*$/gm, '');
      if (/process\.env\.(GH_TOKEN|GITHUB_TOKEN)|gh auth token|credential fill|git credential-manager|ABlueAgent|ABlueAI.*password/.test(text)) offenders.push(f);
      if (/console\.log|console\.error|appendFile/.test(text)) offenders.push(`${f} (logging)`);
    }
    assert(offenders.length === 0, `mako-token code reads no other token, calls no other credential source and logs nothing (${offenders.join(', ') || 'clean'})`);
    const main = fs.readFileSync(path.join(__dirname, 'main.js'), 'utf8');
    assert(/makoTokenMain\.prepareAgentApp/.test(main) && /agentApp: agentAppPrep\.agentApp,/.test(main) && /agentAppForPane\(launch\)/.test(main), 'main.js asks for App mode before an agent pane starts and passes it to buildPtyEnv');
    assert(/Agent pane refused \[github-app\]/.test(main) && /return \{ ok: false, error: 'github-app' \}/.test(main), 'main.js refuses the pane visibly when App mode is configured but broken');
    assert(!/IPC.*mako|ipcMain\.handle\('[^']*(app-key|pem|installation-token)/i.test(main), 'no IPC channel carries the key or a token (App mode adds none)');
    const preload = fs.readFileSync(path.join(__dirname, 'preload.js'), 'utf8');
    assert(!/appKey|installationToken|pem/i.test(preload), 'the renderer bridge has no App key or token method');
  }

  process.stdout.write(`\nmako-token-shim: ${passed} passed, ${failed} failed, ${skipped} skipped\n`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { process.stderr.write(`mako-token-shim test crashed: ${e && e.stack}\n`); process.exit(1); });
