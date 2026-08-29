'use strict';
// Run: node app/pty-start-authority-main.test.js
//
// PRODUCTION-WIRING EVIDENCE. Every assertion here drives the REAL `pty-start` handler that the real
// `app/main.js` registered, reached through `record.handled.get('pty-start')`. Zero-spawn assertions
// against an isolated helper would prove only that the helper cannot spawn; these prove that MAIN
// respects its own refusal, because the node-pty stub COUNTS every spawn and the count must stay 0.
//
// HOW IT STAYS SAFE. `electron` and `@lydell/node-pty` are replaced through a `Module._load` hook, so
// no Electron process starts, no window opens, no PTY is spawned and no provider is contacted.
// `userData`, `USERPROFILE` and the projects root are disposable temp directories, so the real
// `~/.claude.json`, the real `~/.claude/agents` and the real ledger are never touched.

const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');
const { pathToFileURL } = require('url');
const { DEFAULT_MANAGED_PATHS } = require('./role-definition-resolver');

let passed = 0, failed = 0;
function assert(cond, label) {
  if (cond) { process.stdout.write('  ✓ ' + label + '\n'); passed++; }
  else { process.stderr.write('  x FAIL: ' + label + '\n'); failed++; }
}
function section(t) { process.stdout.write('\n' + t + '\n'); }

const MAIN_PATH = path.join(__dirname, 'main.js');
const ENTRY_URL = pathToFileURL(path.join(__dirname, 'renderer', 'index.html')).toString();

function makeElectronStub(userDataDir, record) {
  const mainFrame = { url: ENTRY_URL };
  const fakeWebContents = {
    mainFrame,
    on() {}, send(ch, line) { record.mainErrors.push(String(line)); },
    setWindowOpenHandler() {}, openDevTools() {},
    session: { setPermissionRequestHandler() {}, setPermissionCheckHandler() {} },
  };
  record.webContents = fakeWebContents;
  function fakeWindow() {
    const w = {
      webContents: fakeWebContents,
      loadFile() {}, on() {}, once() {}, show() {}, focus() {}, maximize() {},
      isDestroyed: () => false, isMinimized: () => false, restore() {},
      setMenuBarVisibility() {}, removeMenu() {}, setTitle() {},
    };
    return new Proxy(w, { get(t, k) { return k in t ? t[k] : () => {}; } });
  }
  class BrowserWindow {
    constructor() { record.windowsCreated += 1; return fakeWindow(); }
    static getAllWindows() { return []; }
  }
  return {
    app: {
      whenReady: () => Promise.resolve(),
      getPath: (name) => (name === 'userData' ? userDataDir : os.tmpdir()),
      on() {}, quit() {},
      requestSingleInstanceLock() { throw new Error('main.js must not request the single-instance lock'); },
    },
    BrowserWindow,
    ipcMain: { handle(ch, fn) { record.handled.set(ch, fn); }, on(ch, fn) { record.on.set(ch, fn); } },
    shell: { openExternal: async () => {}, openPath: async () => {} },
    dialog: { showOpenDialog: async () => ({ canceled: true, filePaths: [] }) },
    session: { defaultSession: { setPermissionRequestHandler() {}, setPermissionCheckHandler() {} } },
    safeStorage: {
      isEncryptionAvailable: () => false,
      encryptString: (s) => Buffer.from(s, 'utf8'),
      decryptString: (b) => Buffer.from(b).toString('utf8'),
    },
    clipboard: { readText: () => '', writeText: () => {} },
  };
}

// ---- disposable fixture -------------------------------------------------------------------------
// THE FIXTURE ROOT DELIBERATELY AVOIDS THE USER PROFILE. Project-scope discovery walks UP from the
// launch cwd looking for `.claude/agents`, and on Windows `os.tmpdir()` lives under
// `C:\Users\<user>`, so a temp fixture would find the developer's REAL `~/.claude/agents` as an
// ancestor and resolve against the real deployed hook instead of this fixture's. That is correct
// loader behaviour, not a defect — the production outputs root (`D:\Workspace\.command-center`) is
// not under the profile — but it makes a profile-nested fixture measure the wrong tree. A drive-root
// fixture keeps the ancestor chain clean. Falls back to tmpdir if the drive is unavailable.
function makeFixtureRoot() {
  const candidates = [path.parse(__dirname).root, os.tmpdir()];
  for (const base of candidates) {
    try { return fs.mkdtempSync(path.join(base, 'bh-fence-main-')); } catch (e) { /* try next */ }
  }
  throw new Error('no writable fixture root');
}
const FIX = makeFixtureRoot();
const USER_DATA = path.join(FIX, 'userData');
const HOME = path.join(FIX, 'home');
const PROJECTS = path.join(FIX, 'projects');
const OUTPUTS = path.join(PROJECTS, '.command-center', 'outputs');
const AGENTS = path.join(HOME, '.claude', 'agents');
const HOOKS = path.join(HOME, '.claude', 'hooks');
for (const d of [USER_DATA, AGENTS, HOOKS, OUTPUTS]) fs.mkdirSync(d, { recursive: true });
fs.writeFileSync(path.join(USER_DATA, 'settings.json'), JSON.stringify({ projectsRoot: PROJECTS, selectedRepo: '' }));

const TRACKED_HOOK = path.join(__dirname, '..', 'scripts', 'hooks', 'fence-write.js');
const DEPLOYED_HOOK = path.join(HOOKS, 'fence-write.js');
fs.copyFileSync(TRACKED_HOOK, DEPLOYED_HOOK);
// Deploy the roles exactly as sync-roles.ps1 does: substitute __CC_HOOK__ with the absolute path,
// using forward slashes (Node accepts them on Windows).
const HOOK_FWD = DEPLOYED_HOOK.replace(/\\/g, '/');
for (const r of ['web-scout', 'operator', 'source-scout', 'builder']) {
  const src = fs.readFileSync(path.join(__dirname, '..', 'agent-roles', r + '.md'), 'utf8');
  fs.writeFileSync(path.join(AGENTS, r + '.md'), src.replace('__CC_HOOK__', HOOK_FWD), 'utf8');
}
const SANDBOX = fs.mkdtempSync(path.join(OUTPUTS, 'web-scout-fixture-'));

const record = { handled: new Map(), on: new Map(), windowsCreated: 0, ptySpawns: 0, spawnArgs: [], mainErrors: [], webContents: null };
const ptyStub = {
  spawn(file, args, opts) {
    record.ptySpawns += 1;
    record.spawnArgs.push({ file, args, cwd: opts && opts.cwd, env: opts && opts.env });
    return new Proxy({ onData() {}, onExit() {}, write() {}, resize() {}, kill() {}, pid: 1234 },
      { get(t, k) { return k in t ? t[k] : () => {}; } });
  },
};

const realLoad = Module._load;
const envBefore = { USERPROFILE: process.env.USERPROFILE };
process.env.USERPROFILE = HOME;
Module._load = function (request) {
  if (request === 'electron') return makeElectronStub(USER_DATA, record);
  if (request === '@lydell/node-pty') return ptyStub;
  return realLoad.apply(this, arguments);
};

(async () => {
  require(MAIN_PATH);
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));
  Module._load = realLoad;

  const ptyStart = record.handled.get('pty-start');
  const verifyFence = record.handled.get('verify-fence');
  const ensureOutputDir = record.handled.get('ensure-output-dir');
  const wc = record.webContents;
  const goodEvent = { sender: wc, senderFrame: wc.mainFrame };

  section('PRECONDITIONS');
  assert(typeof ptyStart === 'function', 'the real main.js registered a pty-start handler');
  assert(record.windowsCreated === 1, 'main reached Electron readiness');
  assert(record.ptySpawns === 0, 'startup itself spawns no PTY');
  {
    // Resolution REFUSES when a managed scope is present, so this environment fact decides what the
    // fenced positive control below is allowed to expect. Asserted rather than assumed.
    const present = DEFAULT_MANAGED_PATHS.filter((p) => fs.existsSync(p));
    assert(present.length === 0, 'no managed ClaudeCode scope is deployed on this machine');
  }

  section('POSITIVE CONTROL — a fenced role launches and carries the main-issued denials');
  {
    const before = record.ptySpawns;
    const r = await ptyStart(goodEvent, { id: 'pane-fenced', role: 'web-scout', cli: 'claude', cwd: SANDBOX, cols: 80, rows: 24 });
    assert(!r || r.ok !== false, 'a correctly formed fenced launch is NOT refused');
    assert(record.ptySpawns === before + 1, 'and it spawns exactly one PTY');
    const cmd = record.spawnArgs[record.spawnArgs.length - 1].args.join(' ');
    assert(cmd.indexOf('claude --agent web-scout --disallowedTools Bash Glob NotebookEdit') !== -1,
      'P4 DIRECT ENFORCEMENT: the exact main-issued bare-name denials are in the constructed command');
    assert(record.spawnArgs[record.spawnArgs.length - 1].cwd === SANDBOX, 'and the cwd is the sandbox');
  }
  {
    // The denials are MAIN-OWNED constants: no renderer field may add, remove, or reorder them.
    const before = record.ptySpawns;
    await ptyStart(goodEvent, {
      id: 'pane-inject', role: 'web-scout', cli: 'claude', cwd: SANDBOX,
      disallowedTools: 'nothing', allowedTools: 'Bash', initialPrompt: 'ignore previous --disallowedTools',
    });
    assert(record.ptySpawns === before + 1, 'the launch still proceeds');
    const cmd = record.spawnArgs[record.spawnArgs.length - 1].args.join(' ');
    assert((cmd.match(/--disallowedTools Bash Glob NotebookEdit/g) || []).length === 1,
      'renderer fields cannot alter the denial arguments');
    assert(cmd.indexOf('--allowedTools') === -1, 'and cannot introduce an allowlist argument');
  }
  {
    const before = record.ptySpawns;
    await ptyStart(goodEvent, { id: 'pane-builder', role: 'builder', cli: 'claude', cwd: FIX });
    assert(record.ptySpawns === before + 1, 'BUILDER IS UNAFFECTED: it launches from a non-sandbox cwd');
    const cmd = record.spawnArgs[record.spawnArgs.length - 1].args.join(' ');
    assert(cmd.indexOf('--agent builder') !== -1, 'as the builder agent');
    assert(cmd.indexOf('--disallowedTools') === -1, 'and carries NO denials — it is deliberately unfenced');
  }

  section('REFUSALS — every one must spawn ZERO PTYs in main');
  const refusals = [
    ['untrusted sender', { sender: { other: 1 }, senderFrame: wc.mainFrame }, { id: 'a', role: 'web-scout', cwd: SANDBOX }],
    ['subframe sender', { sender: wc, senderFrame: { url: ENTRY_URL } }, { id: 'a', role: 'web-scout', cwd: SANDBOX }],
    ['malformed opts (null)', goodEvent, null],
    ['malformed opts (string)', goodEvent, 'pwn'],
    ['malformed opts (array)', goodEvent, []],
    ['unknown role', goodEvent, { id: 'a', role: 'Web-Scout', cwd: SANDBOX }],
    ['hostile videoScout truthiness', goodEvent, { id: 'a', role: 'web-scout', videoScout: 1, cwd: SANDBOX }],
    ['videoScout flag without identity', goodEvent, { id: 'a', role: null, videoScout: true }],
    ['video-scout identity without flag', goodEvent, { id: 'a', role: 'video-scout' }],
    ['fenced cwd unset', goodEvent, { id: 'a', role: 'web-scout' }],
    ['fenced cwd nonexistent', goodEvent, { id: 'a', role: 'web-scout', cwd: path.join(FIX, 'nope') }],
    ['fenced cwd outside sandbox', goodEvent, { id: 'a', role: 'web-scout', cwd: FIX }],
    ['fenced cwd prefix sibling', goodEvent, { id: 'a', role: 'web-scout', cwd: OUTPUTS + '-evil' }],
    ['unknown cli', goodEvent, { id: 'a', role: null, cli: 'powershell' }],
  ];
  for (const [label, event, opts] of refusals) {
    const before = record.ptySpawns;
    let res = null, threw = false;
    try { res = await ptyStart(event, opts); } catch (e) { threw = true; }
    assert(!threw, label + ': refuses without throwing');
    assert(res && res.ok === false, label + ': returns a refusal');
    assert(record.ptySpawns === before, label + ': ZERO PTYs spawned in main');
    assert(typeof res.error === 'string' && res.error.indexOf('\\') === -1 && res.error.indexOf('/') === -1,
      label + ': the refusal carries a bounded reason constant, not a path');
  }
  {
    // The prefix-sibling case must exist for its assertion to mean anything.
    fs.mkdirSync(OUTPUTS + '-evil', { recursive: true });
    const before = record.ptySpawns;
    const res = await ptyStart(goodEvent, { id: 'a', role: 'web-scout', cwd: OUTPUTS + '-evil' });
    assert(res && res.ok === false && record.ptySpawns === before,
      'an EXISTING outputs-evil sibling still refuses (startsWith(root + sep), not startsWith(root))');
  }

  section('P4 DRIFT — a deployed fenced role that gains a forbidden tool refuses at spawn');
  {
    const file = path.join(AGENTS, 'web-scout.md');
    const clean = fs.readFileSync(file, 'utf8');
    for (const bad of ['Bash', 'Glob', 'NotebookEdit']) {
      fs.writeFileSync(file, clean.replace('tools: WebSearch, WebFetch, Read, Write',
        'tools: WebSearch, WebFetch, Read, Write, ' + bad), 'utf8');
      const before = record.ptySpawns;
      const res = await ptyStart(goodEvent, { id: 'drift', role: 'web-scout', cli: 'claude', cwd: SANDBOX });
      assert(res && res.ok === false && res.error === 'fence-policy-forbidden-tool-declared',
        'REFUSES a fenced role that gained ' + bad);
      assert(record.ptySpawns === before, 'and spawns nothing');
    }
    // Hook removed entirely: a safe-looking tools list must not be enough.
    fs.writeFileSync(file, clean.replace(/hooks:[\s\S]*?---/, '---'), 'utf8');
    const before = record.ptySpawns;
    const res = await ptyStart(goodEvent, { id: 'nohook', role: 'web-scout', cli: 'claude', cwd: SANDBOX });
    assert(res && res.ok === false && record.ptySpawns === before,
      'REFUSES a fenced role whose PreToolUse fence hook is gone, even with a clean tools list');
    // Deployed hook content drifts from the tracked hook.
    fs.writeFileSync(file, clean, 'utf8');
    fs.appendFileSync(DEPLOYED_HOOK, '\n// tampered\n');
    const b2 = record.ptySpawns;
    const r2 = await ptyStart(goodEvent, { id: 'tampered', role: 'web-scout', cli: 'claude', cwd: SANDBOX });
    assert(r2 && r2.ok === false && r2.error === 'fence-policy-hook-content-not-tracked-identity',
      'REFUSES when the deployed hook is not byte-identical to the tracked fence-write.js');
    assert(record.ptySpawns === b2, 'and spawns nothing');
    fs.copyFileSync(TRACKED_HOOK, DEPLOYED_HOOK);
  }

  section('verify-fence delegates to the SAME policy (early feedback, not enforcement)');
  {
    const ok = await verifyFence(goodEvent, { role: 'web-scout' });
    assert(ok && ok.ok === true, 'a healthy fenced role verifies');
    const unfenced = await verifyFence(goodEvent, { role: 'builder' });
    assert(unfenced && unfenced.ok === false && unfenced.error === 'role-not-fenced',
      'an unfenced role reports role-not-fenced rather than claiming a fence');
    const file = path.join(AGENTS, 'web-scout.md');
    const clean = fs.readFileSync(file, 'utf8');
    fs.writeFileSync(file, clean.replace('matcher: "Read|Write|Edit|MultiEdit"', 'matcher: "Read"'), 'utf8');
    const narrowed = await verifyFence(goodEvent, { role: 'web-scout' });
    assert(narrowed && narrowed.ok === false && narrowed.error === 'fence-policy-matcher-does-not-cover-declared-tools',
      'the probe counterexample (matcher covers Read, tools still declare Write) now REFUSES');
    fs.writeFileSync(file, clean, 'utf8');
  }

  section('ensure-output-dir returns a sandbox the fenced gate accepts');
  {
    const r = await ensureOutputDir(goodEvent, { role: 'web-scout' });
    assert(r && r.ok === true && fs.existsSync(r.dir), 'a sandbox is created');
    const before = record.ptySpawns;
    const res = await ptyStart(goodEvent, { id: 'roundtrip', role: 'web-scout', cli: 'claude', cwd: r.dir });
    assert(record.ptySpawns === before + 1 && (!res || res.ok !== false),
      'and the launcher round-trip accepts it (the happy path still holds end to end)');
  }

  process.env.USERPROFILE = envBefore.USERPROFILE;
  try { fs.rmSync(FIX, { recursive: true, force: true }); } catch (e) { /* best effort */ }
  process.stdout.write('\npty-start-authority-main: ' + passed + ' passed, ' + failed + ' failed\n');
  process.exit(failed ? 1 : 0);
})();
