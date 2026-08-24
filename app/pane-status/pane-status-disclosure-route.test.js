'use strict';
// Run: node app/pane-status/pane-status-disclosure-route.test.js
//
// WO-9 — THE PROVIDER-PATH DISCLOSURE PROOF, RUN THROUGH THE REAL PRODUCTION ROUTE.
//
// WHY THIS FILE EXISTS. The first disclosure proof (pane-status-path-disclosure.test.js) claimed seven
// sinks. Two of them were MODELLED, not executed, and an independent reviewer correctly called those
// assertions vacuous:
//
//   * "console output used by tlog" replaced `console.log` around a resolver the test had built
//     itself. The real `tlog` was never on the stack, so nothing it did could have been observed.
//   * "renderer main-error payloads" watched `createPublishers`, which sends on the pane-status
//     view/setup-state channels. `main-error` is a DIFFERENT channel that `tlog` writes directly.
//     That assertion could not have caught a leak through `main-error` even in principle.
//
// This suite executes the real route instead. It evaluates the REAL `app/main.js` under a stubbed
// Electron and a stubbed `child_process`, captures what the REAL `tlog` writes to `console.log` and
// what it sends on `main-error`, and drives resolution through main.js's OWN `resolveVersion`
// dependency — the closure that calls `paneStatusVersionMod.createClaudeVersionResolver({...}).discover()`
// with `log: (line) => tlog(line)`.
//
// That closure is captured from the real `createPaneStatusController({...})` construction, not
// reconstructed here. If main.js ever stops routing provider resolution through `tlog`, the
// non-vacuity assertions below fail: no console line and no `main-error` payload would appear.
//
// SAFETY. `electron` and `@lydell/node-pty` are stubbed, so no Electron process starts, no window
// opens and no PTY spawns. `userData` is a disposable temp directory. `execFile` is stubbed, so no
// PowerShell runs and no provider is contacted. Nothing here installs a hook, mutates real settings,
// opens a provider session or consumes a paid turn. Only `resolveVersion` is driven; install and
// remove are never called on the real controller.

const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const versionMod = require('./pane-status-version');

let passed = 0, failed = 0;
function assert(cond, label) {
  if (cond) { process.stdout.write(`  ✓ ${label}\n`); passed++; }
  else { process.stderr.write(`  ✗ FAIL: ${label}\n`); failed++; }
}
function eq(a, b, label) { assert(a === b, a === b ? label : `${label} (got ${JSON.stringify(a)})`); }
function section(t) { process.stdout.write(`\n${t}\n`); }

const MAIN_PATH = path.join(__dirname, '..', 'main.js');

// A path no real machine has, so any match can only have come from here.
const POISON = 'C:\\Zzz-Provider-Disclosure\\hidden-install\\claude-poison-9f3a.exe';
const POISON_BASENAME = 'claude-poison-9f3a.exe';
const POISON_DIR = 'Zzz-Provider-Disclosure';
const RAW_MESSAGE = 'spawn ENOENT poisoned-provider-detail';
const RAW_ERRNO = 'ENOENT';
const RAW_FRAME = 'at PoisonedChildProcess';

// ---- fixtures ----------------------------------------------------------------------------------

/** 1. Successful resolution: SOURCE_TAG carries the poison path, version parses. */
function execFileSuccess(file, args, opts, cb) {
  const stdout = `${versionMod.SOURCE_TAG}${POISON}\n${versionMod.VERSION_TAG}2.1.228 (Claude Code)\n`;
  setImmediate(() => cb(null, stdout, ''));
}

/** 2. Pre-resolution process failure: the error itself carries the poison path everywhere it can. */
function makeRawError() {
  const e = new Error(`${RAW_MESSAGE} ${POISON}`);
  e.stack = `Error: ${RAW_MESSAGE} ${POISON}\n    ${RAW_FRAME} (${POISON}:1:1)`;
  e.code = RAW_ERRNO;
  e.errno = -4058;
  e.path = POISON;
  e.spawnfile = POISON;
  e.cmd = `${POISON} --version`;
  return e;
}
function execFilePreFailure(file, args, opts, cb) {
  setImmediate(() => cb(makeRawError(), '', `${RAW_MESSAGE} ${POISON}`));
}

/** 3. Post-resolution failure: Get-Command SUCCEEDED (SOURCE_TAG present), the version command did not. */
function execFilePostFailure(file, args, opts, cb) {
  const stdout = `${versionMod.SOURCE_TAG}${POISON}\n${versionMod.ERROR_TAG}the version command exited 1\n`;
  setImmediate(() => cb(null, stdout, ''));
}

// ---- the real-route harness ---------------------------------------------------------------------

function makeElectronStub(userDataDir, sends) {
  const fakeWebContents = {
    on() {}, setWindowOpenHandler() {}, openDevTools() {},
    // THE SINK UNDER TEST. `tlog` calls exactly this, with channel 'main-error'.
    send(channel, payload) { sends.push({ channel, payload }); },
    session: { setPermissionRequestHandler() {}, setPermissionCheckHandler() {} },
  };
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
    constructor() { return fakeWindow(); }
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
    ipcMain: { handle() {}, on() {} },
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

/**
 * Boot the REAL main.js, then drive ITS resolveVersion dependency once with the given execFile stub.
 * Returns the console lines and main-error payloads produced BY THE PROBE ALONE, separated from the
 * ones boot itself produced, so a startup message can never be mistaken for evidence.
 */
async function driveRealRoute(execFileStub) {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bh-disclosure-route-'));
  const sends = [];
  const consoleLines = [];
  const captured = { deps: null, constructions: 0 };

  const electronStub = makeElectronStub(userDataDir, sends);
  const realCp = require('child_process');
  const ptyStub = { spawn() { throw new Error('pty.spawn must not run in this test'); } };

  const realLoad = Module._load;
  Module._load = function (request) {
    if (request === 'electron') return electronStub;
    if (request === '@lydell/node-pty') return ptyStub;
    // main.js does `require('child_process').execFile` INSIDE the resolveVersion closure, so this
    // hook must still be installed when the closure runs, not merely while main.js evaluates.
    if (request === 'child_process') return Object.assign({}, realCp, { execFile: execFileStub });
    // Capture the deps main.js really passes, without replacing the controller's behaviour.
    if (/pane-status-controller$/.test(request)) {
      const real = realLoad.apply(this, arguments);
      return Object.assign({}, real, {
        createPaneStatusController(deps) {
          captured.deps = deps;
          captured.constructions += 1;
          return real.createPaneStatusController(deps);
        },
      });
    }
    return realLoad.apply(this, arguments);
  };

  const cacheBefore = new Set(Object.keys(require.cache));
  const realConsoleLog = console.log;
  console.log = (...a) => { consoleLines.push(a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ')); };

  let loadError = null;
  let outcome = null;
  let rejection = null;
  let bootConsoleCount = 0;
  let bootSendCount = 0;
  try {
    require(MAIN_PATH);
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));

    // Everything above is BOOT. Draw the line here so probe evidence is unambiguous.
    bootConsoleCount = consoleLines.length;
    bootSendCount = sends.length;

    if (captured.deps && typeof captured.deps.resolveVersion === 'function') {
      try { outcome = await captured.deps.resolveVersion(); }
      catch (e) { rejection = e; }
    }
  } catch (e) {
    loadError = e;
  } finally {
    console.log = realConsoleLog;
    Module._load = realLoad;
    for (const k of Object.keys(require.cache)) if (!cacheBefore.has(k)) delete require.cache[k];
  }

  try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch { /* best effort */ }

  return {
    loadError,
    outcome,
    rejection,
    constructions: captured.constructions,
    hasResolveVersion: !!(captured.deps && typeof captured.deps.resolveVersion === 'function'),
    bootConsole: consoleLines.slice(0, bootConsoleCount),
    probeConsole: consoleLines.slice(bootConsoleCount),
    bootSends: sends.slice(0, bootSendCount),
    probeSends: sends.slice(bootSendCount),
  };
}

const POISON_VALUES = [POISON, POISON_BASENAME, POISON_DIR, RAW_MESSAGE, RAW_FRAME];
function blob(parts) {
  const list = Array.isArray(parts) ? parts : [parts];
  return list.map((p) => (typeof p === 'string' ? p : JSON.stringify(p))).join('\n');
}
function assertClean(text, label) {
  let hit = null;
  for (const v of POISON_VALUES) if (text.indexOf(v) !== -1) hit = v;
  eq(hit, null, `${label}: discloses none of the poison path, filename, directory, raw message or stack frame`);
  // errno is checked separately: 'ENOENT' is short enough to warrant its own explicit assertion.
  assert(text.indexOf(RAW_ERRNO) === -1, `${label}: and no errno from the raw error`);
}

(async () => {
  // -----------------------------------------------------------------------------------------------
  section('1. The harness genuinely reaches the production wiring');
  // -----------------------------------------------------------------------------------------------
  const ok = await driveRealRoute(execFileSuccess);
  assert(ok.loadError === null,
    `the REAL main.js evaluates${ok.loadError ? ` (threw: ${ok.loadError.message})` : ''}`);
  eq(ok.constructions, 1, 'main.js constructs the pane-status controller exactly once');
  assert(ok.hasResolveVersion,
    'and its deps carry a resolveVersion function — captured from production, not reconstructed here');

  // NON-VACUITY. The probe must have produced real emissions on BOTH sinks, and they must come from
  // the version-resolution path rather than an unrelated startup message.
  assert(ok.probeConsole.length >= 1, 'the probe produced at least one REAL tlog console emission');
  assert(ok.probeSends.length >= 1, 'and at least one REAL renderer emission');
  const mainErrors = ok.probeSends.filter((s) => s.channel === 'main-error');
  assert(mainErrors.length >= 1, 'at least one of them is on the main-error channel specifically');
  assert(ok.probeConsole.every((l) => /provider (resolved|version NOT established)/.test(l)),
    'every probe console line came from the version-resolution path, not an unrelated message');
  assert(mainErrors.every((s) => /provider (resolved|version NOT established)/.test(String(s.payload))),
    'and so did every probe main-error payload');
  assert(ok.probeConsole.some((l) => /\[TIMING \+\d+ms\]/.test(l)),
    'the emissions carry the real tlog TIMING prefix — proving tlog itself was on the stack');
  assert(ok.bootSends.length >= 0 && ok.probeSends.length > 0,
    'probe emissions are counted separately from boot emissions');

  // -----------------------------------------------------------------------------------------------
  section('2. Fixture 1 — successful resolution');
  // -----------------------------------------------------------------------------------------------
  {
    // The poison genuinely entered the fixture.
    eq(ok.outcome.source, POISON, 'NON-VACUITY: the resolver really did receive the poison path as source');
    eq(ok.outcome.executable, POISON, 'and exposes it internally as `executable`');

    // Binding Amendment A § 1 — the diagnostic classification survives redaction.
    eq(ok.outcome.ok, true, 'classification: ok is true');
    eq(ok.outcome.version, '2.1.228', 'a parsed version is reported');
    eq(ok.outcome.reason, null, 'and there is no refusal reason');
    assert(versionMod.isVersionSupported(ok.outcome.version, versionMod.SUPPORTED_CLAUDE_VERSIONS),
      'the parsed version is one the gate supports');

    assertClean(blob(ok.probeConsole), 'REAL tlog console output');
    assertClean(blob(ok.probeSends), 'REAL main-error renderer payloads');
    eq(ok.rejection, null, 'the resolver did not reject');
  }

  // -----------------------------------------------------------------------------------------------
  section('3. Fixture 2 — pre-resolution execFile failure');
  // -----------------------------------------------------------------------------------------------
  {
    const r = await driveRealRoute(execFilePreFailure);
    assert(r.loadError === null, 'main.js evaluates');
    assert(r.probeConsole.length >= 1, 'the probe produced a REAL tlog console emission');
    assert(r.probeSends.filter((s) => s.channel === 'main-error').length >= 1,
      'and a REAL main-error emission');

    // NON-VACUITY: the raw error really did carry every poison value.
    const raw = makeRawError();
    assert(raw.message.indexOf(POISON) !== -1, 'NON-VACUITY: the injected error message carries the path');
    assert(raw.stack.indexOf(POISON) !== -1, 'its stack carries the path');
    assert(raw.cmd.indexOf(POISON) !== -1, 'its command metadata carries the path');
    assert(raw.path === POISON && raw.spawnfile === POISON, 'its spawn metadata carries the path');
    eq(raw.code, RAW_ERRNO, 'and it carries an errno');

    // Binding Amendment A § 1 — the distinction must survive, exactly.
    eq(r.outcome.ok, false, 'classification: not ok');
    eq(r.outcome.reason, 'version-probe-failed', 'the reason is EXACTLY version-probe-failed');
    assert(r.outcome.reason !== 'provider-not-found', 'it did not collapse to provider-not-found');
    assert(r.outcome.reason !== 'version-command-failed', 'nor to version-command-failed');
    eq(r.outcome.source, null, 'source is unavailable on this path');
    eq(r.outcome.executable, null, 'and so is executable');

    assertClean(blob(r.probeConsole), 'REAL tlog console output');
    assertClean(blob(r.probeSends), 'REAL main-error renderer payloads');
    assertClean(blob([r.outcome]), 'the resolver result surface');
    eq(r.rejection, null, 'the resolver did NOT reject — a failure is a bounded value, not an exception');
  }

  // -----------------------------------------------------------------------------------------------
  section('4. Fixture 3 — post-resolution version-command failure (SOURCE_TAG present)');
  // -----------------------------------------------------------------------------------------------
  {
    const r = await driveRealRoute(execFilePostFailure);
    assert(r.loadError === null, 'main.js evaluates');
    assert(r.probeConsole.length >= 1, 'the probe produced a REAL tlog console emission');
    assert(r.probeSends.filter((s) => s.channel === 'main-error').length >= 1,
      'and a REAL main-error emission');

    // NON-VACUITY: this fixture is the one where a path IS known at failure time.
    eq(r.outcome.source, POISON,
      'NON-VACUITY: Get-Command SUCCEEDED, so the failure outcome still carries the poison path');

    // Binding Amendment A § 1 — this must not be confused with either neighbouring failure.
    eq(r.outcome.ok, false, 'classification: not ok');
    eq(r.outcome.reason, 'version-command-failed', 'the reason is EXACTLY version-command-failed');
    assert(r.outcome.reason !== 'provider-not-found',
      'it did not collapse to provider-not-found — the provider WAS found');
    assert(r.outcome.reason !== 'version-probe-failed',
      'nor to version-probe-failed — the process ran, the version command is what failed');

    assertClean(blob(r.probeConsole), 'REAL tlog console output');
    assertClean(blob(r.probeSends), 'REAL main-error renderer payloads');
    eq(r.rejection, null, 'the resolver did not reject');
  }

  // -----------------------------------------------------------------------------------------------
  section('5. The production wiring is the thing under test, not a copy of it');
  // -----------------------------------------------------------------------------------------------
  {
    // Read the CODE, with whole-line comments stripped: this file's own explanation quotes the very
    // constructs being asserted, and so does main.js's correction comment.
    const src = fs.readFileSync(MAIN_PATH, 'utf8');
    const code = src.split(/\r?\n/).filter((l) => l.trim().indexOf('//') !== 0).join('\n');
    assert(/createClaudeVersionResolver\(\{/.test(code),
      'main.js resolves the provider through createClaudeVersionResolver');
    assert(/log:\s*\(line\)\s*=>\s*tlog\(line\)/.test(code),
      'and hands it a logger wired to tlog — if this stops being true the emissions above vanish');
    assert(/createPaneStatusController\(\{/.test(code),
      'through the controller construction this harness captures');
  }

  process.stdout.write(`\npane-status-disclosure-route: ${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
})();
