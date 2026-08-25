'use strict';
// Run: node app/pane-status/pane-status-disclosure-route.test.js
//
// WO-9/WO-11 — THE PROVIDER-PATH DISCLOSURE PROOF, RUN THROUGH THE REAL PRODUCTION ROUTE.
//
// WHY THIS FILE EXISTS. The first disclosure proof (pane-status-path-disclosure.test.js) claimed seven
// sinks. Two of them were MODELLED, not executed, and an independent reviewer correctly called those
// assertions vacuous:
//
//   * "console output used by tlog" replaced `console.log` around a resolver the test had built
//     itself. The real `tlog` was never on the stack, so nothing it did could have been observed.
//   * "renderer main-error payloads" watched `createPublishers`, which sends on the pane-status
//     view/setup-state channels. `main-error` is a DIFFERENT channel that `tlog` writes directly.
//
// This suite executes the real route instead. It evaluates the REAL `app/main.js` under a stubbed
// Electron and a fail-closed `child_process`, captures what the REAL `tlog` writes to `console.log`
// and sends on `main-error`, and drives resolution through main.js's OWN `resolveVersion` dependency —
// the closure that calls `createClaudeVersionResolver({…}).discover()` with `log: (line) => tlog(line)`.
// That closure is captured from the real `createPaneStatusController({…})` construction, not
// reconstructed here. If main.js ever stops routing provider resolution through `tlog`, the
// non-vacuity assertions below fail: no console line and no `main-error` payload would appear.
//
// WO-11 — THREE HARNESS-ISOLATION DEFECTS, ALL FOUND BY REVIEW, ALL CORRECTED HERE:
//
//   1. LEAKED PROCESS LISTENERS. Loading main.js registers process-level handlers (`uncaughtException`
//      among them) and the harness never removed them. Three fixtures meant three accumulating
//      handlers, each holding a closure over a torn-down fixture. Now a SINGLE baseline is taken
//      before any evaluation, and after every fixture only listeners introduced AFTER that baseline
//      are removed — never a blanket `removeAllListeners()`, which would destroy runner-owned
//      handlers. All three fixtures compare against that same original snapshot, so a leak from an
//      earlier fixture cannot be normalised into a later fixture's baseline.
//
//   2. SHALLOW child_process MOCK. The mock was `Object.assign({}, realCp, { execFile })`, which left
//      `spawn`, `exec`, `execSync`, `spawnSync`, `execFileSync` and `fork` REACHABLE AND REAL. A
//      startup path that reached any of them would have spawned a genuine process. The mock is now
//      built fail-closed: only the fixture's `execFile` is callable, and every other callable export
//      is replaced by a stub that records the attempt and throws.
//
//   3. CONSOLE-ONLY PREFIX PINNING. The `[TIMING +Nms]` assertion ran against console lines only, so
//      the claim that both sinks were prefix-pinned was wider than the proof. Both sinks are now
//      pinned, and — because `tlog` builds ONE string and hands the same one to both — the console
//      line and the `main-error` payload are additionally asserted BYTE-IDENTICAL per emission.
//
// SAFETY. `electron` and `@lydell/node-pty` are stubbed, so no Electron process starts, no window
// opens and no PTY spawns. `userData` is a disposable temp directory. `child_process` is fail-closed.
// Nothing here installs a hook, mutates real settings, opens a provider session or consumes a paid
// turn. Only `resolveVersion` is driven; install and remove are never called on the real controller.

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
const REAL_CHILD_PROCESS = require('child_process');

// A path no real machine has, so any match can only have come from here.
const POISON = 'C:\\Zzz-Provider-Disclosure\\hidden-install\\claude-poison-9f3a.exe';
const POISON_BASENAME = 'claude-poison-9f3a.exe';
const POISON_DIR = 'Zzz-Provider-Disclosure';
const RAW_MESSAGE = 'spawn ENOENT poisoned-provider-detail';
const RAW_ERRNO = 'ENOENT';
const RAW_FRAME = 'at PoisonedChildProcess';

// The real tlog prefix. Bounded pattern for the dynamic elapsed value.
const TIMING_PREFIX = /^\[TIMING \+\d+ms\] /;
const VERSION_LINE = /provider (resolved|version NOT established)/;

// =================================================================================================
// WO-11 § 1 + Amendment A § 2 — ONE ORIGINAL LISTENER BASELINE, TAKEN BEFORE ANY main.js EVALUATION.
// =================================================================================================

/** Record every process event, and the identity AND order of every raw listener on it. */
function snapshotProcessListeners() {
  const snap = new Map();
  for (const ev of process.eventNames()) snap.set(ev, process.rawListeners(ev).slice());
  return snap;
}

// Captured ONCE, at module scope, before a single fixture runs. Every fixture is compared against
// THIS object — a fresh per-fixture snapshot would silently adopt an earlier leak as "normal".
const ORIGINAL_LISTENERS = snapshotProcessListeners();

/** Listeners present now that were NOT in `baseline`, as [event, fn] pairs. */
function listenersIntroducedSince(baseline) {
  const out = [];
  for (const ev of process.eventNames()) {
    const before = baseline.get(ev) || [];
    for (const fn of process.rawListeners(ev)) if (before.indexOf(fn) === -1) out.push([ev, fn]);
  }
  return out;
}

/**
 * Remove ONLY what the fixture introduced. Never `removeAllListeners()`: this process also carries
 * listeners the test runner and Node itself installed, and destroying those would be a far worse
 * defect than the one being fixed.
 */
function removeIntroducedListeners(baseline) {
  const introduced = listenersIntroducedSince(baseline);
  for (const [ev, fn] of introduced) process.removeListener(ev, fn);
  return introduced.map(([ev]) => ev);
}

/** Does the current listener state match `baseline` exactly, by identity and order? */
function listenerStateMatches(baseline) {
  const problems = [];
  const seen = new Set();
  for (const ev of process.eventNames()) {
    seen.add(ev);
    const before = baseline.get(ev) || [];
    const now = process.rawListeners(ev);
    if (now.length !== before.length) { problems.push(`${String(ev)}: ${before.length} -> ${now.length}`); continue; }
    for (let i = 0; i < now.length; i++) {
      if (now[i] !== before[i]) { problems.push(`${String(ev)}[${i}]: identity or order changed`); break; }
    }
  }
  for (const ev of baseline.keys()) {
    if (!seen.has(ev) && (baseline.get(ev) || []).length > 0) problems.push(`${String(ev)}: original listeners lost`);
  }
  return problems;
}

// =================================================================================================
// WO-11 § 2 — A FAIL-CLOSED child_process MOCK.
// =================================================================================================

// Every process-creating API the order names. Anything else callable on the real module is blocked
// too, so a future Node release that adds one cannot quietly become reachable.
const NAMED_PROCESS_APIS = ['spawn', 'spawnSync', 'exec', 'execSync', 'execFileSync', 'fork'];

function makeChildProcessMock(execFileStub, record) {
  const mock = Object.create(null);

  // The ONLY callable that does anything: the fixture's own execFile.
  mock.execFile = function execFile(...args) {
    record.execFileCalls += 1;
    return execFileStub.apply(null, args);
  };

  const blocked = new Set(NAMED_PROCESS_APIS);
  for (const key of Object.keys(REAL_CHILD_PROCESS)) {
    if (key === 'execFile') continue;
    if (typeof REAL_CHILD_PROCESS[key] === 'function') blocked.add(key);
    else mock[key] = REAL_CHILD_PROCESS[key];   // non-callable exports pass through unchanged
  }

  for (const name of blocked) {
    mock[name] = function blockedChildProcessApi() {
      record.blockedCalls.push(name);
      // A fixed, test-only refusal. Visible failure, never a silent no-op and never a real spawn.
      throw new Error(`pane-status-disclosure-route: child_process.${name} is blocked in this test`);
    };
  }
  record.blockedNames = Array.from(blocked).sort();
  return mock;
}

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
 *
 * EVERY global this touches is restored in `finally`, including when evaluation throws: Module._load,
 * console.log, the module cache, process.env, the timer functions, any timer the fixture created, and
 * every process listener introduced after `baseline`.
 *
 * `baseline` is passed in rather than captured here, so all three fixtures provably share ONE original
 * snapshot (WO-11 Binding Amendment A § 2).
 */
async function driveRealRoute(execFileStub, baseline) {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bh-disclosure-route-'));
  const sends = [];
  const consoleLines = [];
  const captured = { deps: null, constructions: 0 };
  const cpRecord = { execFileCalls: 0, blockedCalls: [], blockedNames: [] };

  const electronStub = makeElectronStub(userDataDir, sends);
  const childProcessMock = makeChildProcessMock(execFileStub, cpRecord);
  const ptyStub = { spawn() { throw new Error('pty.spawn must not run in this test'); } };

  const realLoad = Module._load;
  const realConsoleLog = console.log;
  const realSetInterval = global.setInterval;
  const realSetTimeout = global.setTimeout;
  const envBefore = Object.assign(Object.create(null), process.env);
  const cacheBefore = new Set(Object.keys(require.cache));
  const timers = [];

  Module._load = function (request) {
    if (request === 'electron') return electronStub;
    if (request === '@lydell/node-pty') return ptyStub;
    // main.js does `require('child_process').execFile` INSIDE the resolveVersion closure, so this
    // hook must still be installed when the closure runs, not merely while main.js evaluates.
    if (request === 'child_process' || request === 'node:child_process') return childProcessMock;
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
  console.log = (...a) => {
    consoleLines.push(a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' '));
  };
  global.setInterval = (...a) => { const t = realSetInterval.apply(global, a); timers.push(['interval', t]); return t; };
  global.setTimeout = (...a) => { const t = realSetTimeout.apply(global, a); timers.push(['timeout', t]); return t; };

  let loadError = null;
  let outcome = null;
  let rejection = null;
  let bootConsoleCount = 0;
  let bootSendCount = 0;
  let introducedDuringFixture = [];
  let removedEvents = [];
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
    // Recorded BEFORE removal, so the cleanup assertions below cannot pass vacuously: if main.js
    // introduced nothing, that itself is reportable.
    introducedDuringFixture = listenersIntroducedSince(baseline).map(([ev]) => String(ev));
    removedEvents = removeIntroducedListeners(baseline).map(String);

    for (const [kind, t] of timers) { if (kind === 'interval') clearInterval(t); else clearTimeout(t); }
    global.setInterval = realSetInterval;
    global.setTimeout = realSetTimeout;
    console.log = realConsoleLog;
    Module._load = realLoad;
    for (const k of Object.keys(require.cache)) if (!cacheBefore.has(k)) delete require.cache[k];
    for (const k of Object.keys(process.env)) if (!(k in envBefore)) delete process.env[k];
    for (const k of Object.keys(envBefore)) if (process.env[k] !== envBefore[k]) process.env[k] = envBefore[k];
    try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch { /* best effort */ }
  }

  const probeConsole = consoleLines.slice(bootConsoleCount);
  const probeSends = sends.slice(bootSendCount);
  return {
    loadError,
    outcome,
    rejection,
    baselineUsed: baseline,
    constructions: captured.constructions,
    hasResolveVersion: !!(captured.deps && typeof captured.deps.resolveVersion === 'function'),
    cpRecord,
    childProcessMock,
    introducedDuringFixture,
    removedEvents,
    userDataDir,
    bootConsole: consoleLines.slice(0, bootConsoleCount),
    probeConsole,
    probeSends,
    probeMainErrors: probeSends.filter((s) => s.channel === 'main-error').map((s) => String(s.payload)),
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
  assert(text.indexOf(RAW_ERRNO) === -1, `${label}: and no errno from the raw error`);
}

/** WO-11 § 3 — both sinks, every emission, plus byte-identity between the paired payloads. */
function assertDualSinkEmissions(r, label) {
  const consoleHits = r.probeConsole.filter((l) => VERSION_LINE.test(l));
  const rendererHits = r.probeMainErrors.filter((l) => VERSION_LINE.test(l));

  assert(consoleHits.length >= 1, `${label}: at least one REAL tlog console emission`);
  assert(rendererHits.length >= 1, `${label}: at least one REAL main-error emission`);
  assert(consoleHits.every((l) => TIMING_PREFIX.test(l)),
    `${label}: EVERY matching console emission carries the real tlog timing prefix`);
  assert(rendererHits.every((l) => TIMING_PREFIX.test(l)),
    `${label}: EVERY matching main-error payload carries the same prefix`);

  // tlog builds ONE string and hands the same one to console and to the renderer, so the paired
  // payloads must be byte-identical. A reconstructed message would not be.
  eq(rendererHits.length, consoleHits.length, `${label}: the two sinks emitted the same number of lines`);
  let mismatch = null;
  for (let i = 0; i < consoleHits.length; i++) if (consoleHits[i] !== rendererHits[i]) mismatch = i;
  eq(mismatch, null, `${label}: each console line and its main-error payload are BYTE-IDENTICAL`);

  // Unrelated boot emissions can satisfy nothing here.
  assert(r.probeConsole.every((l) => VERSION_LINE.test(l)),
    `${label}: every probe console line is version-resolution, not an unrelated startup message`);
  assert(r.probeMainErrors.every((l) => VERSION_LINE.test(l)),
    `${label}: and so is every probe main-error payload`);
}

/** WO-11 § 1 — compared against the ORIGINAL snapshot, never a per-fixture one. */
function assertListenerHygiene(r, label) {
  assert(r.baselineUsed === ORIGINAL_LISTENERS,
    `${label}: compared against the ONE original snapshot taken before any main.js evaluation`);
  assert(r.introducedDuringFixture.indexOf('uncaughtException') !== -1,
    `${label}: NON-VACUITY — main.js really did introduce an uncaughtException listener`);

  const problems = listenerStateMatches(ORIGINAL_LISTENERS);
  eq(problems.join(' | '), '', `${label}: process listener state is identical to the original snapshot`);

  const original = ORIGINAL_LISTENERS.get('uncaughtException') || [];
  const now = process.rawListeners('uncaughtException');
  eq(now.length, original.length, `${label}: uncaughtException listener count is unchanged`);
  let same = true;
  for (let i = 0; i < now.length; i++) if (now[i] !== original[i]) same = false;
  assert(same, `${label}: and every original uncaughtException listener is the same function, in order`);
  eq(listenersIntroducedSince(ORIGINAL_LISTENERS).length, 0,
    `${label}: no process event retains a listener introduced by main.js`);
}

/** WO-11 § 2 — the mock is fail-closed and the fixture's execFile is what ran. */
function assertChildProcessIsolation(r, label) {
  eq(r.cpRecord.execFileCalls, 1, `${label}: the fixture execFile was invoked exactly once`);
  eq(r.cpRecord.blockedCalls.join(','), '', `${label}: no blocked child-process API was invoked`);
  for (const name of NAMED_PROCESS_APIS) {
    assert(typeof r.childProcessMock[name] === 'function', `${label}: ${name} is present on the mock`);
    assert(r.childProcessMock[name] !== REAL_CHILD_PROCESS[name],
      `${label}: ${name} is NOT the real implementation — no real process is reachable`);
  }
}

(async () => {
  // -----------------------------------------------------------------------------------------------
  section('1. The harness genuinely reaches the production wiring');
  // -----------------------------------------------------------------------------------------------
  const ok = await driveRealRoute(execFileSuccess, ORIGINAL_LISTENERS);
  assert(ok.loadError === null,
    `the REAL main.js evaluates${ok.loadError ? ` (threw: ${ok.loadError.message})` : ''}`);
  eq(ok.constructions, 1, 'main.js constructs the pane-status controller exactly once');
  assert(ok.hasResolveVersion,
    'and its deps carry a resolveVersion function — captured from production, not reconstructed here');
  assertDualSinkEmissions(ok, 'fixture 1');
  assertListenerHygiene(ok, 'fixture 1');
  assertChildProcessIsolation(ok, 'fixture 1');
  assert(fs.existsSync(ok.userDataDir) === false, 'fixture 1: the temp userData directory is removed');

  // -----------------------------------------------------------------------------------------------
  section('2. Fixture 1 — successful resolution');
  // -----------------------------------------------------------------------------------------------
  {
    eq(ok.outcome.source, POISON, 'NON-VACUITY: the resolver really did receive the poison path as source');
    eq(ok.outcome.executable, POISON, 'and exposes it internally as `executable`');

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
  const pre = await driveRealRoute(execFilePreFailure, ORIGINAL_LISTENERS);
  {
    assert(pre.loadError === null, 'main.js evaluates');
    assertDualSinkEmissions(pre, 'fixture 2');
    assertListenerHygiene(pre, 'fixture 2');
    assertChildProcessIsolation(pre, 'fixture 2');
    assert(fs.existsSync(pre.userDataDir) === false, 'fixture 2: the temp userData directory is removed');

    const raw = makeRawError();
    assert(raw.message.indexOf(POISON) !== -1, 'NON-VACUITY: the injected error message carries the path');
    assert(raw.stack.indexOf(POISON) !== -1, 'its stack carries the path');
    assert(raw.cmd.indexOf(POISON) !== -1, 'its command metadata carries the path');
    assert(raw.path === POISON && raw.spawnfile === POISON, 'its spawn metadata carries the path');
    eq(raw.code, RAW_ERRNO, 'and it carries an errno');

    eq(pre.outcome.ok, false, 'classification: not ok');
    eq(pre.outcome.reason, 'version-probe-failed', 'the reason is EXACTLY version-probe-failed');
    assert(pre.outcome.reason !== 'provider-not-found', 'it did not collapse to provider-not-found');
    assert(pre.outcome.reason !== 'version-command-failed', 'nor to version-command-failed');
    eq(pre.outcome.source, null, 'source is unavailable on this path');
    eq(pre.outcome.executable, null, 'and so is executable');

    assertClean(blob(pre.probeConsole), 'REAL tlog console output');
    assertClean(blob(pre.probeSends), 'REAL main-error renderer payloads');
    assertClean(blob([pre.outcome]), 'the resolver result surface');
    eq(pre.rejection, null, 'the resolver did NOT reject — a failure is a bounded value, not an exception');
  }

  // -----------------------------------------------------------------------------------------------
  section('4. Fixture 3 — post-resolution version-command failure (SOURCE_TAG present)');
  // -----------------------------------------------------------------------------------------------
  const post = await driveRealRoute(execFilePostFailure, ORIGINAL_LISTENERS);
  {
    assert(post.loadError === null, 'main.js evaluates');
    assertDualSinkEmissions(post, 'fixture 3');
    assertListenerHygiene(post, 'fixture 3');
    assertChildProcessIsolation(post, 'fixture 3');
    assert(fs.existsSync(post.userDataDir) === false, 'fixture 3: the temp userData directory is removed');

    eq(post.outcome.source, POISON,
      'NON-VACUITY: Get-Command SUCCEEDED, so the failure outcome still carries the poison path');

    eq(post.outcome.ok, false, 'classification: not ok');
    eq(post.outcome.reason, 'version-command-failed', 'the reason is EXACTLY version-command-failed');
    assert(post.outcome.reason !== 'provider-not-found',
      'it did not collapse to provider-not-found — the provider WAS found');
    assert(post.outcome.reason !== 'version-probe-failed',
      'nor to version-probe-failed — the process ran, the version command is what failed');

    assertClean(blob(post.probeConsole), 'REAL tlog console output');
    assertClean(blob(post.probeSends), 'REAL main-error renderer payloads');
    eq(post.rejection, null, 'the resolver did not reject');
  }

  // -----------------------------------------------------------------------------------------------
  section('5. Listener counts did not accumulate across the three fixtures');
  // -----------------------------------------------------------------------------------------------
  {
    // Each fixture introduced listeners and each cleaned up after itself, so after three fixtures the
    // process is exactly where it started — not three handlers deep.
    for (const [label, r] of [['fixture 1', ok], ['fixture 2', pre], ['fixture 3', post]]) {
      assert(r.introducedDuringFixture.length > 0, `${label} did introduce listeners (so cleanup is meaningful)`);
      assert(r.removedEvents.length === r.introducedDuringFixture.length,
        `${label} removed exactly what it introduced, no more`);
      assert(r.baselineUsed === ORIGINAL_LISTENERS, `${label} used the original baseline`);
    }
    eq(listenersIntroducedSince(ORIGINAL_LISTENERS).length, 0,
      'after all three fixtures, nothing introduced remains');
    eq(listenerStateMatches(ORIGINAL_LISTENERS).join(' | '), '',
      'and the whole process listener table is identity-equivalent to the original');
    eq(process.rawListeners('uncaughtException').length,
      (ORIGINAL_LISTENERS.get('uncaughtException') || []).length,
      'uncaughtException did not accumulate: the count is the original one');
  }

  // -----------------------------------------------------------------------------------------------
  section('6. A blocked child-process API fails visibly instead of spawning');
  // -----------------------------------------------------------------------------------------------
  {
    const record = { execFileCalls: 0, blockedCalls: [], blockedNames: [] };
    const mock = makeChildProcessMock(execFileSuccess, record);
    for (const name of NAMED_PROCESS_APIS) {
      let threw = false;
      try { mock[name]('cmd.exe', ['/c', 'echo']); } catch (e) { threw = /is blocked in this test/.test(e.message); }
      assert(threw, `child_process.${name} throws a fixed test-only refusal`);
    }
    eq(record.blockedCalls.join(','), NAMED_PROCESS_APIS.join(','),
      'and every attempt is recorded, in order, so a future startup call is visible rather than silent');

    // Nothing callable on the mock is a real child-process function.
    let leaked = null;
    for (const key of Object.keys(REAL_CHILD_PROCESS)) {
      if (typeof REAL_CHILD_PROCESS[key] !== 'function') continue;
      if (mock[key] === REAL_CHILD_PROCESS[key]) leaked = key;
    }
    eq(leaked, null, 'NO real child-process function is reachable through the mock');
    assert(record.blockedNames.length >= NAMED_PROCESS_APIS.length,
      `every callable export is blocked, not just the six named ones (${record.blockedNames.length} total)`);
    eq(record.execFileCalls, 0, 'and merely building the mock invokes nothing');
  }

  // -----------------------------------------------------------------------------------------------
  section('7. The production wiring is the thing under test, not a copy of it');
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
