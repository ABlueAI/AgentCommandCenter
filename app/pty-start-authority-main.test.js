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

// MANAGED-POLICY REGISTRY PROBE (L2). `child_process.execFileSync` is wrapped for the `reg` executable
// ONLY; every other call passes straight through. In the default 'real' mode the wrapper also passes
// `reg` through, so the positive controls exercise the real READ-ONLY `reg query` exactly as before.
// The simulated modes return a fabricated parent listing or throw a fabricated failure — the real
// registry is never written in any mode, and only the `query` verb is ever issued (asserted below).
const realCp = require('child_process');
record.regMode = 'real';
record.regCalls = [];
record.realRegListings = [];
function expandHive(k) {
  return String(k).replace(/^HKLM(?=\\)/, 'HKEY_LOCAL_MACHINE').replace(/^HKCU(?=\\)/, 'HKEY_CURRENT_USER');
}
function regFailure(fields) { return Object.assign(new Error('Command failed: reg query'), fields); }
function fakeReg(mode, args) {
  const parent = expandHive(args[1]);
  const isHklm = parent.indexOf('HKEY_LOCAL_MACHINE') === 0;
  const listing = (children, values) => ['', parent].concat(values || [], [''], children.map((c) => parent + '\\' + c), ['']).join('\r\n');
  switch (mode) {
    case 'absent': return listing(['Microsoft', 'Google'], ['    SomeValue    REG_SZ    x']);
    case 'absent-empty': return listing([]);
    // MOVED (N2): this mode used to include a grandchild line `Microsoft\ClaudeCode`, which the
    // structural recognizer now REFUSES as unexplained; that line has its own 'grandchild' case.
    case 'near-miss': return listing(['ClaudeCodeX', 'XClaudeCode'], ['    ClaudeCode    REG_DWORD    0x1']);
    // A recognizable listing WITHOUT the header line (subkeys only): accepted, because whether reg.exe
    // prints the header for a value-less key is not assumed.
    case 'absent-noheader': return ['', parent + '\\Microsoft', parent + '\\Google', ''].join('\r\n');
    case 'present-hklm': return listing(isHklm ? ['Microsoft', 'ClaudeCode'] : ['Microsoft']);
    case 'present-hkcu': return listing(isHklm ? ['Microsoft'] : ['CLAUDECODE']);
    // N2 — exit 0 with output that is NOT a recognizable listing of the exact parent. Each must refuse.
    case 'empty-success': return '';
    case 'blank-success': return '\r\n   \r\n\r\n';
    case 'garbled': return 'ÿþ\u0000g a r b l e d\r\n';
    case 'wrong-parent': return ['', 'HKEY_LOCAL_MACHINE\\SOFTWARE\\Other', 'HKEY_LOCAL_MACHINE\\SOFTWARE\\Other\\Microsoft', ''].join('\r\n');
    case 'grandchild': return listing(['Microsoft', 'Microsoft\\ClaudeCode']);
    case 'error-text': return ['', parent, 'ERROR: Access is denied.', ''].join('\r\n');
    case 'value-no-header': return ['', '    SomeValue    REG_SZ    x', parent + '\\Microsoft', ''].join('\r\n');
    case 'duplicate-header': return ['', parent, '', parent, parent + '\\Microsoft', ''].join('\r\n');
    case 'denied-en': throw regFailure({ status: 1, stderr: 'ERROR: Access is denied.\r\n' });
    case 'denied-de': throw regFailure({ status: 1, stderr: 'FEHLER: Zugriff verweigert\r\n' });
    case 'parent-not-found': throw regFailure({ status: 1, stderr: 'ERROR: The system was unable to find the specified registry key or value.\r\n' });
    case 'enoent': throw regFailure({ code: 'ENOENT', status: null });
    case 'exit5': throw regFailure({ status: 5 });
    case 'timeout': throw regFailure({ code: 'ETIMEDOUT', signal: 'SIGTERM', status: null });
    default: throw new Error('test: unknown regMode ' + mode);
  }
}
const cpWrapped = Object.assign({}, realCp, {
  execFileSync(file, args) {
    if (file === 'reg') {
      record.regCalls.push((args || []).slice());
      if (record.regMode !== 'real') return fakeReg(record.regMode, args || []);
      // Real read-only pass-through: keep the ACTUAL listing so its structure can be asserted (N2).
      const out = realCp.execFileSync.apply(realCp, arguments);
      record.realRegListings.push({ parent: (args || [])[1], out: String(out) });
      return out;
    }
    return realCp.execFileSync.apply(realCp, arguments);
  },
});

const realLoad = Module._load;
const envBefore = { USERPROFILE: process.env.USERPROFILE };
process.env.USERPROFILE = HOME;
// Hermetic admission: an admission plan in the invoking shell's environment must not change what this
// suite measures. The plan is parsed from process.env when main.js loads, so clear it first.
const admissionEnvBefore = {};
for (const k of Object.keys(process.env)) {
  if (/^BLUE_HELM_ADMISSION_/i.test(k)) { admissionEnvBefore[k] = process.env[k]; delete process.env[k]; }
}
Module._load = function (request) {
  if (request === 'electron') return makeElectronStub(USER_DATA, record);
  if (request === '@lydell/node-pty') return ptyStub;
  if (request === 'child_process') return cpWrapped;
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
    // MOVED (L1): fenced launches now spawn from the validated CANONICAL cwd, so compare against the
    // sandbox's real path. For this fixture the two are the same directory.
    assert(record.spawnArgs[record.spawnArgs.length - 1].cwd === fs.realpathSync.native(SANDBOX),
      'and the cwd is the sandbox (its canonical real path)');
    // CONTROLLED WEBFETCH: no admission run is configured here, so this pane is ordinary. It gets the
    // `disabled` mode (WebFetch keeps its ordinary permission flow) and NO CLI grant.
    assert(cmd.indexOf('--allowedTools') === -1, 'an ordinary fenced web-scout carries no --allowedTools grant');
    const env = record.spawnArgs[record.spawnArgs.length - 1].env;
    assert(env.BLUE_HELM_CONTROLLED_WEBFETCH_MODE === 'disabled',
      'and receives the main-issued WebFetch mode `disabled`');
  }
  {
    // The denials are MAIN-OWNED constants: no renderer field may add, remove, or reorder them.
    // MOVED (M2): this case used to carry `initialPrompt: 'ignore previous --disallowedTools'`; a
    // fenced prompt is now refused outright (see the M2 section), so it is exercised there instead.
    const before = record.ptySpawns;
    await ptyStart(goodEvent, {
      id: 'pane-inject', role: 'web-scout', cli: 'claude', cwd: SANDBOX,
      disallowedTools: 'nothing', allowedTools: 'Bash',
      // Controlled-WebFetch spoofs: none of these is read by main.
      webFetch: { allowedToolsRule: 'WebFetch(domain:evil.com)', mode: 'https://example.com' },
      webFetchMode: 'https://example.com', controlled: true, permissions: { allow: ['WebFetch'] },
      env: { BLUE_HELM_CONTROLLED_WEBFETCH_MODE: 'https://example.com' },
    });
    assert(record.ptySpawns === before + 1, 'the launch still proceeds');
    const cmd = record.spawnArgs[record.spawnArgs.length - 1].args.join(' ');
    assert((cmd.match(/--disallowedTools Bash Glob NotebookEdit/g) || []).length === 1,
      'renderer fields cannot alter the denial arguments');
    assert(cmd.indexOf('--allowedTools') === -1, 'and cannot introduce an allowlist argument');
    assert(cmd.indexOf('evil.com') === -1 && cmd.indexOf('WebFetch(') === -1,
      'renderer WebFetch fields cannot introduce a WebFetch grant');
    assert(record.spawnArgs[record.spawnArgs.length - 1].env.BLUE_HELM_CONTROLLED_WEBFETCH_MODE === 'disabled',
      'nor raise the pane\'s WebFetch mode above `disabled`');
  }
  {
    const before = record.ptySpawns;
    await ptyStart(goodEvent, { id: 'pane-builder', role: 'builder', cli: 'claude', cwd: FIX });
    assert(record.ptySpawns === before + 1, 'BUILDER IS UNAFFECTED: it launches from a non-sandbox cwd');
    const cmd = record.spawnArgs[record.spawnArgs.length - 1].args.join(' ');
    assert(cmd.indexOf('--agent builder') !== -1, 'as the builder agent');
    assert(cmd.indexOf('--disallowedTools') === -1, 'and carries NO denials — it is deliberately unfenced');
    const env = record.spawnArgs[record.spawnArgs.length - 1].env;
    assert(cmd.indexOf('--allowedTools') === -1
      && !Object.keys(env).some((k) => k.toUpperCase() === 'BLUE_HELM_CONTROLLED_WEBFETCH_MODE'),
    'and gets no WebFetch grant and no WebFetch mode');
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

  section('M1 DRIFT — a deployed fenced role that gains any unsupported tool refuses at spawn');
  {
    const file = path.join(AGENTS, 'web-scout.md');
    const clean = fs.readFileSync(file, 'utf8');
    // The deployed role keeps the canonical hook, its tracked hash and the Read|Write|Edit|MultiEdit
    // matcher, so every other check passes; only the allowlist can refuse these.
    for (const bad of ['Grep', 'PowerShell', 'Agent', 'Task', 'SomeFutureTool']) {
      fs.writeFileSync(file, clean.replace('tools: WebSearch, WebFetch, Read, Write',
        'tools: WebSearch, WebFetch, Read, Write, ' + bad), 'utf8');
      const before = record.ptySpawns;
      const res = await ptyStart(goodEvent, { id: 'drift-m1', role: 'web-scout', cli: 'claude', cwd: SANDBOX });
      assert(res && res.ok === false && res.error === 'fence-policy-tool-not-allowed',
        'REFUSES a fenced role that gained ' + bad);
      assert(record.ptySpawns === before, 'and spawns nothing');
    }
    fs.writeFileSync(file, clean, 'utf8');
    const before = record.ptySpawns;
    const ok = await ptyStart(goodEvent, { id: 'drift-m1-restored', role: 'web-scout', cli: 'claude', cwd: SANDBOX });
    assert(record.ptySpawns === before + 1 && (!ok || ok.ok !== false), 'the restored tracked role launches again');
  }

  section('M2 — a supplied fenced opening prompt refuses at classification, before spawn or admission');
  {
    const prompts = ['--settings=x', '--mcp-config=x', '--permission-mode=x', 'Research competitor pricing'];
    for (const prompt of prompts) {
      const before = record.ptySpawns;
      const errBefore = record.mainErrors.length;
      let res = null, threw = false;
      try { res = await ptyStart(goodEvent, { id: 'm2', role: 'web-scout', cli: 'claude', cwd: SANDBOX, initialPrompt: prompt }); }
      catch (e) { threw = true; }
      const lines = record.mainErrors.slice(errBefore);
      assert(!threw && res && res.ok === false && res.error === 'classify-fenced-initial-prompt-refused',
        JSON.stringify(prompt) + ': REFUSED with the bounded classification reason');
      assert(record.ptySpawns === before, JSON.stringify(prompt) + ': ZERO PTYs spawned');
      // logRefusal emits the refusal twice on main-error: once through tlog (timestamped) and once
      // directly. EVERY emitted line must be that refusal — a `pty-start: START`, containment,
      // admission or spawn line would appear here if the handler had gone any further.
      const REFUSAL = 'pty-start refused [classify]: classify-fenced-initial-prompt-refused';
      assert(lines.length > 0 && lines.every((l) => l === REFUSAL || /^\[TIMING \+\d+ms\] /.test(l) && l.endsWith('] ' + REFUSAL)),
        JSON.stringify(prompt) + ': the only visible lines are the [classify] refusal (no START, containment, admission or spawn line)');
      assert(lines.every((l) => l.indexOf(prompt) === -1 && l.indexOf('[admission]') === -1),
        JSON.stringify(prompt) + ': no line echoes the prompt or reaches admission');
    }
  }
  {
    // Preserved: the legitimate unfenced opening prompt (the reviewer launch) still reaches the command.
    const before = record.ptySpawns;
    const res = await ptyStart(goodEvent, {
      id: 'pane-reviewer', role: 'reviewer', cli: 'claude', cwd: FIX,
      initialPrompt: 'Review the change set in ./x.diff',
    });
    assert(record.ptySpawns === before + 1 && (!res || res.ok !== false), 'a reviewer launch with an opening prompt still spawns');
    const cmd = record.spawnArgs[record.spawnArgs.length - 1].args.join(' ');
    assert(cmd.indexOf('claude --agent reviewer "Review the change set in ./x.diff"') !== -1,
      'and its prompt is still passed as the single quoted argument');
  }

  section('L1 — definition resolution and process launch use the SAME canonical cwd');
  {
    // A junction OUTSIDE outputs/ that points INTO the sandbox. Containment accepts it (its real path
    // is inside), so before this correction the resolver scanned from the real path while the spawn
    // used the declared junction path.
    const junction = path.join(FIX, 'declared-junction');
    let made = false;
    try { fs.symlinkSync(SANDBOX, junction, 'junction'); made = true; } catch (e) { made = false; }
    assert(made, 'fixture: a directory junction into the sandbox was created (no elevation needed)');
    if (made) {
      const canonical = fs.realpathSync.native(SANDBOX);
      const agentsSuffix = path.sep + path.join('.claude', 'agents');
      const probes = [];
      const realExists = fs.existsSync;
      fs.existsSync = function (p) {
        // Project/user-scope probes only; the managed-scope check also ends in .claude\agents.
        if (typeof p === 'string' && p.endsWith(agentsSuffix) && DEFAULT_MANAGED_PATHS.indexOf(p) === -1) probes.push(p);
        return realExists.apply(fs, arguments);
      };
      const before = record.ptySpawns;
      let res = null;
      try { res = await ptyStart(goodEvent, { id: 'pane-junction', role: 'web-scout', cli: 'claude', cwd: junction }); }
      finally { fs.existsSync = realExists; }
      assert(record.ptySpawns === before + 1 && (!res || res.ok !== false), 'the contained junction launch is accepted');
      const spawnCwd = record.spawnArgs[record.spawnArgs.length - 1].cwd;
      assert(spawnCwd === canonical, 'the spawn receives the canonical sandbox path');
      assert(spawnCwd !== junction, 'NOT the declared junction path');
      assert(probes.length > 0 && probes[0] === path.join(spawnCwd, '.claude', 'agents'),
        "the resolver's first project-scope probe is <spawn cwd>\\.claude\\agents — the same path");
      const fold = (p) => p.toLowerCase();
      assert(probes.every((p) => fold(p).indexOf(fold(junction)) !== 0),
        'and the resolver never probed under the declared junction path');
    }
    try { fs.rmdirSync(junction); } catch (e) { /* best effort; FIX is removed at the end */ }
  }

  section('L2 — managed-policy registry probe: absence is established, unreadable refuses');
  if (process.platform === 'win32') {
    const cases = [
      ['absent', true, null],
      ['absent-empty', true, null],
      ['near-miss', true, null],
      ['present-hklm', false, 'resolve-managed-scope-present'],
      ['present-hkcu', false, 'resolve-managed-scope-present'],
      ['denied-en', false, 'resolve-managed-scope-unreadable'],
      ['denied-de', false, 'resolve-managed-scope-unreadable'],
      ['parent-not-found', false, 'resolve-managed-scope-unreadable'],
      ['enoent', false, 'resolve-managed-scope-unreadable'],
      ['exit5', false, 'resolve-managed-scope-unreadable'],
      ['timeout', false, 'resolve-managed-scope-unreadable'],
      // N2 — absence needs a RECOGNIZABLE listing of the exact parent, not merely "no match".
      ['absent-noheader', true, null],
      ['empty-success', false, 'resolve-managed-scope-unreadable'],
      ['blank-success', false, 'resolve-managed-scope-unreadable'],
      ['garbled', false, 'resolve-managed-scope-unreadable'],
      ['wrong-parent', false, 'resolve-managed-scope-unreadable'],
      ['grandchild', false, 'resolve-managed-scope-unreadable'],
      ['error-text', false, 'resolve-managed-scope-unreadable'],
      ['value-no-header', false, 'resolve-managed-scope-unreadable'],
      ['duplicate-header', false, 'resolve-managed-scope-unreadable'],
    ];
    for (const [mode, launches, reason] of cases) {
      record.regMode = mode;
      record.regCalls = [];
      const before = record.ptySpawns;
      let res = null, threw = false;
      try { res = await ptyStart(goodEvent, { id: 'reg-' + mode, role: 'web-scout', cli: 'claude', cwd: SANDBOX }); }
      catch (e) { threw = true; }
      assert(!threw, mode + ': no throw escapes the handler');
      if (launches) {
        assert(record.ptySpawns === before + 1 && (!res || res.ok !== false), mode + ': classified ABSENT, launch proceeds');
      } else {
        assert(res && res.ok === false && res.error === reason, mode + ': REFUSES with ' + reason);
        assert(record.ptySpawns === before, mode + ': ZERO PTYs spawned');
      }
      assert(record.regCalls.length > 0 && record.regCalls.every((a) => a.length === 2 && a[0] === 'query'),
        mode + ': only `reg query` was issued (the registry is never written)');
      assert(record.regCalls.every((a) => /^HK(LM|CU)\\SOFTWARE\\Policies$/.test(a[1])),
        mode + ': and only the PARENT key was listed');
    }
    record.regMode = 'real';
  } else {
    assert(true, 'L2 registry cases are Windows-only (probe returns absent off Windows)');
  }

  section('N2 REAL MODE — the actual read-only reg listings match the accepted structural forms');
  if (process.platform === 'win32') {
    // Independent test oracle for the pre-registered forms. It is written separately from main.js's
    // recognizer so the real listing's STRUCTURE is observed here, not assumed. Only the shape (header
    // seen, subkey and value counts) is printed — never a key name.
    const VALUE = /^ {4}\S.*? {4}REG_[A-Z0-9_]+(?: {4}.*)?$/;
    const shapeOf = (parentShort, out) => {
      const parent = expandHive(parentShort).toLowerCase();
      const shape = { recognized: true, header: false, subkeys: 0, values: 0 };
      for (const raw of out.split(/\r?\n/)) {
        const line = raw.replace(/\s+$/, '');
        if (line === '') continue;
        const lower = line.toLowerCase();
        if (lower === parent && !shape.header && shape.subkeys === 0) { shape.header = true; continue; }
        if (VALUE.test(line) && shape.header && shape.subkeys === 0) { shape.values += 1; continue; }
        if (lower.indexOf(parent + '\\') === 0 && lower.slice(parent.length + 1).indexOf('\\') === -1 &&
            lower.length > parent.length + 1) { shape.subkeys += 1; continue; }
        shape.recognized = false;
      }
      if (!shape.header && shape.subkeys === 0) shape.recognized = false;
      return shape;
    };
    const seen = new Map();
    for (const l of record.realRegListings) if (!seen.has(l.parent)) seen.set(l.parent, l.out);
    assert(seen.has('HKLM\\SOFTWARE\\Policies') && seen.has('HKCU\\SOFTWARE\\Policies'),
      'the positive controls ran the REAL read-only probe for both policy parents');
    for (const [parent, out] of seen) {
      const s = shapeOf(parent, out);
      process.stdout.write('    observed real listing shape for ' + parent + ': header=' + s.header +
        ' subkeys=' + s.subkeys + ' values=' + s.values + '\n');
      assert(s.recognized === true, parent + ': the real listing is a RECOGNIZABLE listing of the exact parent');
      assert(!/\\claudecode\s*$/im.test(out),
        parent + ': and it names no ClaudeCode child (consistent with the launches it allowed)');
    }
  } else {
    assert(true, 'N2 real-mode observation is Windows-only');
  }

  section('N1 DRIFT — a deployed fenced role whose tools value is declared-but-EMPTY refuses at spawn');
  {
    const file = path.join(AGENTS, 'web-scout.md');
    const clean = fs.readFileSync(file, 'utf8');
    const TRACKED_TOOLS = 'tools: WebSearch, WebFetch, Read, Write';
    assert(clean.indexOf(TRACKED_TOOLS) !== -1, 'fixture: the deployed role carries the tracked tools line');
    // Canonical hook path, tracked hook hash and canonical matcher stay intact: only the tools line moves.
    for (const line of ['tools:', 'tools: ""', 'tools: ,', 'tools:    ', 'tools: "   "', 'tools: " , "', 'tools: , ,']) {
      fs.writeFileSync(file, clean.replace(TRACKED_TOOLS, line), 'utf8');
      const before = record.ptySpawns;
      const errBefore = record.mainErrors.length;
      const res = await ptyStart(goodEvent, { id: 'drift-n1', role: 'web-scout', cli: 'claude', cwd: SANDBOX });
      const lines = record.mainErrors.slice(errBefore);
      assert(res && res.ok === false && res.error === 'fence-policy-tools-declared-empty',
        JSON.stringify(line) + ': REFUSED with the bounded empty-tools reason');
      assert(record.ptySpawns === before, JSON.stringify(line) + ': ZERO PTYs spawned');
      assert(lines.every((l) => l.indexOf('[admission]') === -1),
        JSON.stringify(line) + ': no admission line (refused before any admission claim)');
    }
    fs.writeFileSync(file, clean, 'utf8');
    const before = record.ptySpawns;
    const ok = await ptyStart(goodEvent, { id: 'drift-n1-restored', role: 'web-scout', cli: 'claude', cwd: SANDBOX });
    assert(record.ptySpawns === before + 1 && (!ok || ok.ok !== false), 'the restored tracked role launches again');
  }

  section('N3 — a REAL junction inside the fixture ~/.claude/agents refuses; it is never followed or skipped');
  {
    // Real Node Dirent types from a real NTFS junction (no elevation needed). Only the disposable
    // fixture's agents tree is touched; no deployed role tree is.
    const target = path.join(FIX, 'linked-target');
    fs.mkdirSync(target, { recursive: true });
    for (const name of ['linked-roles', 'linked.md']) {
      const link = path.join(AGENTS, name);
      let made = false;
      try { fs.symlinkSync(target, link, 'junction'); made = true; } catch (e) { made = false; }
      assert(made, 'fixture: junction ' + JSON.stringify(name) + ' created inside the fixture agents tree');
      if (!made) continue;
      const before = record.ptySpawns;
      let res = null;
      try { res = await ptyStart(goodEvent, { id: 'n3', role: 'web-scout', cli: 'claude', cwd: SANDBOX }); }
      finally { try { fs.rmdirSync(link); } catch (e) { /* removed with FIX at the end */ } }
      assert(res && res.ok === false && res.error === 'resolve-agent-tree-linked-entry',
        JSON.stringify(name) + ': REFUSED as a linked agent-tree entry');
      assert(record.ptySpawns === before, JSON.stringify(name) + ': ZERO PTYs spawned');
    }
    const before = record.ptySpawns;
    const ok = await ptyStart(goodEvent, { id: 'n3-restored', role: 'web-scout', cli: 'claude', cwd: SANDBOX });
    assert(record.ptySpawns === before + 1 && (!ok || ok.ok !== false), 'with the junctions removed the clean tree launches again');
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
    // MOVED (controlled WebFetch): the tracked web-scout matcher now also routes WebFetch to the hook.
    assert(clean.indexOf('matcher: "Read|Write|Edit|MultiEdit|WebFetch"') !== -1,
      'fixture: the deployed web-scout carries the widened single matcher');
    fs.writeFileSync(file, clean.replace('matcher: "Read|Write|Edit|MultiEdit|WebFetch"', 'matcher: "Read"'), 'utf8');
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

  section('FENCE HOOK — the deployed fence-write.js refuses with ONE constant, path-free message');
  {
    // The hook THIS suite deployed (byte-identical to scripts/hooks/fence-write.js), executed directly as
    // a child `node` process with a synthetic PreToolUse payload. No Claude, no provider, no real sandbox.
    const { spawnSync } = require('child_process');
    const REFUSAL =
      'Blocked by Blue Helm path fence: this role may only access files inside its own sandbox. [fence-outside-sandbox]';
    const OUTSIDE = path.join(FIX, 'outside-fixture');
    const JTARGET = path.join(OUTSIDE, 'junction-target');
    fs.mkdirSync(JTARGET, { recursive: true });
    for (const f of [path.join(OUTSIDE, 'absolute-read.txt'), path.join(OUTSIDE, 'traversal-read.txt'),
      path.join(JTARGET, 'junction-read.txt')]) fs.writeFileSync(f, 'SYNTHETIC-FIXTURE', 'utf8');
    fs.writeFileSync(path.join(SANDBOX, 'cwd-marker.txt'), 'BH-FIXTURE-CWD-MARKER', 'utf8');
    const link = path.join(SANDBOX, 'linked-outside');
    // The hook reads the controlled-WebFetch mode from its OWN environment, so every run sets it
    // explicitly: removed in every ASCII case, then set only when a mode is given.
    const MODE_KEY = 'BLUE_HELM_CONTROLLED_WEBFETCH_MODE';
    const ORIGIN_MODE = 'https://example.com';
    const envWithMode = (mode) => {
      const env = {};
      for (const k of Object.keys(process.env)) if (k.toUpperCase() !== MODE_KEY) env[k] = process.env[k];
      if (mode !== undefined) env[MODE_KEY] = mode;
      return env;
    };
    const runRaw = (stdin, mode) => spawnSync(process.execPath, [DEPLOYED_HOOK], {
      input: stdin, encoding: 'utf8', timeout: 20000, env: envWithMode(mode),
    });
    const runHook = (toolName, filePath, mode) => runRaw(
      JSON.stringify({ cwd: SANDBOX, tool_name: toolName, tool_input: { file_path: filePath } }), mode);
    // Everything a refusal must never disclose, in both separator spellings and case-folded.
    const secretsFor = (target, resolvedTarget) => [
      target, resolvedTarget, SANDBOX, fs.realpathSync.native(SANDBOX), FIX, OUTSIDE,
      path.basename(target), 'outside-fixture', 'linked-outside', 'web-scout-fixture',
    ].filter(Boolean).reduce((all, s) => all.concat([s, s.replace(/\\/g, '/')]), [])
      .map((s) => s.toLowerCase());
    function assertRefused(label, toolName, target, resolvedTarget, mode) {
      const r = runHook(toolName, target, mode);
      assert(r.status === 2, label + ': refused with exit code 2');
      assert(r.stderr === REFUSAL, label + ': stderr is exactly the constant refusal');
      const lower = String(r.stderr).toLowerCase() + String(r.stdout).toLowerCase();
      const leaked = secretsFor(target, resolvedTarget).filter((s) => lower.indexOf(s) !== -1);
      assert(leaked.length === 0, label + ': discloses no requested, resolved, cwd or sandbox path, and no file name');
    }

    let madeLink = false;
    try {
      fs.symlinkSync(JTARGET, link, 'junction');
      madeLink = true;
    } catch (e) { /* asserted below */ }
    assert(madeLink, 'fixture: a real directory junction was created inside the sandbox');
    try {
      // Well-formed Read/Write behaviour is identical in every WebFetch mode, including a missing one.
      for (const [modeLabel, mode] of [['mode missing', undefined], ['mode disabled', 'disabled'], ['mode origin', ORIGIN_MODE]]) {
        const tag = (s) => s + ' [' + modeLabel + ']';
        const absTarget = path.join(OUTSIDE, 'absolute-read.txt');
        assertRefused(tag('absolute path outside the sandbox'), 'Read', absTarget, fs.realpathSync.native(absTarget), mode);
        const travReal = path.join(OUTSIDE, 'traversal-read.txt');
        const travTarget = path.relative(SANDBOX, travReal);
        assert(travTarget.startsWith('..' + path.sep), 'fixture: the traversal target is relative and climbs out');
        assertRefused(tag('relative traversal out of the sandbox'), 'Read', travTarget, fs.realpathSync.native(travReal), mode);
        if (madeLink) {
          const jTarget = '.' + path.sep + path.join('linked-outside', 'junction-read.txt');
          assertRefused(tag('read through an in-sandbox junction'), 'Read', jTarget,
            fs.realpathSync.native(path.join(JTARGET, 'junction-read.txt')), mode);
        }
        const writeTarget = path.join(OUTSIDE, 'outside-write.txt');
        assertRefused(tag('write outside the sandbox'), 'Write', writeTarget, writeTarget, mode);
        assert(!fs.existsSync(writeTarget), tag('the refused write target does not exist'));

        const inRead = runHook('Read', '.' + path.sep + 'cwd-marker.txt', mode);
        assert(inRead.status === 0 && inRead.stderr === '', tag('an in-sandbox read is still ALLOWED (exit 0, silent)'));
        const inWrite = runHook('Write', path.join(SANDBOX, 'report.md'), mode);
        assert(inWrite.status === 0 && inWrite.stderr === '', tag('a new in-sandbox write is still ALLOWED (exit 0, silent)'));
      }
    } finally {
      if (madeLink) { try { fs.rmdirSync(link); } catch (e) { /* removed with FIX at the end */ } }
    }
    const hookSrc = fs.readFileSync(TRACKED_HOOK, 'utf8');
    assert(!/\$\{(resolved|target|root)\}/.test(hookSrc), 'the tracked hook interpolates no path into any message');

    section('FENCE HOOK — controlled WebFetch gate (origin mode, disabled mode, missing or bad mode)');
    const WEB_REFUSAL =
      'Blocked by Blue Helm web fence: this pane may not fetch that destination. [fence-webfetch-denied]';
    const INPUT_REFUSAL =
      'Blocked by Blue Helm fence: the tool request could not be verified. [fence-input-unverifiable]';
    const fetchPayload = (url, extra) => JSON.stringify(Object.assign(
      { cwd: SANDBOX, tool_name: 'WebFetch', tool_input: { url, prompt: 'Return the page title.' } }, extra || {}));
    const runFetch = (url, mode, extra) => runRaw(fetchPayload(url, extra), mode);
    // A refusal must never echo the destination: the full URL, its host (beyond the constant's own
    // words) or its port.
    const leakFree = (r, url) => {
      const out = (String(r.stderr) + String(r.stdout)).toLowerCase();
      const parts = [];
      if (typeof url === 'string' && url.length) {
        parts.push(url.toLowerCase());
        try {
          const u = new URL(url);
          if (u.hostname) parts.push(u.hostname.toLowerCase());
          if (u.port) parts.push(':' + u.port);
        } catch (e) { /* malformed: the raw string is enough */ }
      }
      return parts.every((p) => out.indexOf(p) === -1);
    };
    const assertFetchAllowed = (label, url, mode) => {
      const r = runFetch(url, mode);
      assert(r.status === 0 && r.stderr === '' && r.stdout === '', label + ': allowed (exit 0, silent)');
    };
    const assertFetchRefused = (label, url, mode, extra) => {
      const r = runFetch(url, mode, extra);
      assert(r.status === 2 && r.stderr === WEB_REFUSAL, label + ': refused, stderr exactly the web constant');
      assert(leakFree(r, url), label + ': the refusal names no URL, host or port');
    };

    // ORIGIN MODE — the controlled pane. Only https://example.com on the default port, no userinfo.
    assertFetchAllowed('origin mode: https://example.com/', 'https://example.com/', ORIGIN_MODE);
    assertFetchAllowed('origin mode: https://EXAMPLE.com:443/x (case and default port normalize)',
      'https://EXAMPLE.com:443/x', ORIGIN_MODE);
    const refusedInOrigin = [
      ['alternate port', 'https://example.com:8443/'],
      ['http scheme (the CLI would upgrade it; refused before that)', 'http://example.com/'],
      ['www subdomain', 'https://www.example.com/'],
      ['other subdomain', 'https://a.example.com/'],
      ['suffix trick', 'https://example.com.evil.com/'],
      ['other host', 'https://evil.com/'],
      ['userinfo', 'https://user@example.com/'],
      ['userinfo pointing elsewhere', 'https://example.com@evil.com/'],
      ['password userinfo', 'https://u:p@example.com/'],
      ['trailing dot', 'https://example.com./'],
      ['IPv4 address', 'https://93.184.215.14/'],
      ['IPv6 loopback', 'https://[::1]/'],
      ['punycode look-alike', 'https://xn--exmple-cua.com/'],
      ['file scheme', 'file:///C:/Windows/win.ini'],
      ['malformed URL', 'https://'],
      ['not a URL', 'example.com'],
      ['empty URL', ''],
      ['over-long URL (2001 characters)', 'https://example.com/' + 'a'.repeat(2001 - 'https://example.com/'.length)],
      ['Claude Code pre-approved host', 'https://docs.python.org/'],
    ];
    for (const [label, url] of refusedInOrigin) assertFetchRefused('origin mode: ' + label, url, ORIGIN_MODE);
    assert(('https://example.com/' + 'a'.repeat(2000 - 'https://example.com/'.length)).length === 2000
      && runFetch('https://example.com/' + 'a'.repeat(2000 - 'https://example.com/'.length), ORIGIN_MODE).status === 0,
    'origin mode: a 2000-character example.com URL is still allowed (the bound is inclusive)');
    for (const [label, input] of [
      ['missing url', {}],
      ['non-string url', { url: ['https://example.com/'] }],
      ['numeric url', { url: 443 }],
    ]) {
      const r = runRaw(JSON.stringify({ cwd: SANDBOX, tool_name: 'WebFetch', tool_input: input }), ORIGIN_MODE);
      assert(r.status === 2 && r.stderr === WEB_REFUSAL, 'origin mode: ' + label + ' is refused with the web constant');
    }
    {
      const r = runRaw(JSON.stringify({ cwd: SANDBOX, tool_name: 'WebFetch' }), ORIGIN_MODE);
      assert(r.status === 2 && r.stderr === WEB_REFUSAL, 'origin mode: a WebFetch with no tool_input is refused');
    }

    // DISABLED MODE — every other fenced web-scout pane. The hook defers to Claude Code's ordinary
    // permission flow; it grants nothing (only the controlled pane carries --allowedTools).
    for (const url of ['https://example.com/', 'https://example.com:8443/', 'https://evil.com/', 'not a url']) {
      const r = runFetch(url, 'disabled');
      assert(r.status === 0 && r.stderr === '', 'disabled mode: ' + JSON.stringify(url) + ' defers (exit 0, silent)');
    }

    // MISSING OR UNEXPECTED MODE — fails closed, even for the one allowed destination.
    for (const [label, mode] of [
      ['missing', undefined], ['empty', ''], ['whitespace-padded origin', ' https://example.com'],
      ['origin with trailing slash', 'https://example.com/'], ['upper-case origin', 'HTTPS://EXAMPLE.COM'],
      ['http origin', 'http://example.com'], ['www origin', 'https://www.example.com'],
      ['explicit-port origin', 'https://example.com:443'], ['Disabled (case)', 'Disabled'],
      ['disabled with a trailing space', 'disabled '], ['arbitrary', 'allow'],
    ]) {
      assertFetchRefused('mode ' + label + ': https://example.com/', 'https://example.com/', mode);
    }
    // The mode comes from the hook's own environment only; a payload cannot supply or raise it.
    assertFetchRefused('mode missing, payload claims origin mode', 'https://example.com/', undefined,
      { mode: ORIGIN_MODE, [MODE_KEY]: ORIGIN_MODE, env: { [MODE_KEY]: ORIGIN_MODE } });
    {
      const r = runFetch('https://example.com/', 'disabled',
        { tool_input: { url: 'https://evil.com/', [MODE_KEY]: ORIGIN_MODE } });
      assert(r.status === 0 && r.stderr === '',
        'disabled mode stays disabled whatever the payload carries (defers; grants nothing itself)');
    }

    // MALFORMED OR UNREADABLE INPUT (mandatory correction 1). Only an exact `disabled` mode keeps the
    // historical behaviour; origin, missing and any invalid mode refuse with the input constant.
    const malformedInputs = [
      ['unparseable stdin', 'not json {'],
      ['empty stdin', ''],
      ['JSON null', 'null'],
      ['JSON array', '[]'],
      ['JSON string', '"WebFetch"'],
      ['object without tool_name', JSON.stringify({ cwd: SANDBOX, tool_input: { url: 'https://example.com/' } })],
      ['non-string tool_name', JSON.stringify({ cwd: SANDBOX, tool_name: ['WebFetch'], tool_input: { url: 'https://example.com/' } })],
    ];
    for (const [modeLabel, mode] of [['origin', ORIGIN_MODE], ['missing', undefined], ['empty', ''], ['invalid', 'allow']]) {
      for (const [label, stdin] of malformedInputs) {
        const r = runRaw(stdin, mode);
        assert(r.status === 2 && r.stderr === INPUT_REFUSAL,
          'mode ' + modeLabel + ' + ' + label + ': refused with the input constant');
      }
    }
    {
      const r = runRaw('not json {', 'disabled');
      assert(r.status === 0 && r.stderr === '', 'mode disabled + unparseable stdin: historical exit 0 preserved');
      const r2 = runRaw('null', 'disabled');
      assert(r2.status === 0 && r2.stderr === '', 'mode disabled + JSON null: historical behaviour (nothing path-like, exit 0)');
      const outside = path.join(OUTSIDE, 'absolute-read.txt');
      const r3 = runRaw(JSON.stringify({ cwd: SANDBOX, tool_input: { file_path: outside } }), 'disabled');
      assert(r3.status === 2 && r3.stderr === REFUSAL,
        'mode disabled + no tool_name: continues to the unchanged path check (outside path refused)');
    }
  }

  process.env.USERPROFILE = envBefore.USERPROFILE;
  for (const k of Object.keys(admissionEnvBefore)) process.env[k] = admissionEnvBefore[k];
  try { fs.rmSync(FIX, { recursive: true, force: true }); } catch (e) { /* best effort */ }
  process.stdout.write('\npty-start-authority-main: ' + passed + ' passed, ' + failed + ' failed\n');
  process.exit(failed ? 1 : 0);
})();
