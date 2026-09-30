'use strict';
// Run: node app/admission-main-startup.test.js
//
// SEMANTIC MAIN-ENTRY STARTUP TEST — the gap that let a shipped crash pass 4,826 green assertions.
//
// WHY THIS FILE EXISTS. An independent Full-class review found that `app/main.js` threw at MODULE
// EVALUATION whenever a VALID admission configuration was present:
//
//     let admissionBudget = createAdmissionBudget({ plan: admissionPlan });   // enabled plan, no storage
//
// `createAdmissionBudget` requires storage and a writer for an enabled plan, so it threw before
// `app.whenReady()`, before any uncaught-exception handler, and before a window could report it. The
// controlled run was unreachable: the app died on boot for exactly the configuration it exists to serve.
//
// EVERY EXISTING SUITE MISSED IT because main.js was only ever READ AS TEXT — a dozen `readFileSync`
// source scans and not one evaluation. A regex cannot observe a throw. So this suite EVALUATES the real
// `app/main.js` entry under all three configuration shapes and drives it to Electron readiness.
//
// HOW IT STAYS SAFE. `electron` and `@lydell/node-pty` are replaced through a `Module._load` hook, so no
// Electron process starts, no window opens, no PTY is spawned and no provider is contacted. `userData`
// is a disposable temp directory per scenario, so the real ledger store writes there and nowhere near a
// production file. Nothing here launches Claude, installs a hook, or consumes a paid turn.

const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

let passed = 0, failed = 0;
function assert(cond, label) {
  if (cond) { process.stdout.write('  ' + String.fromCharCode(10003) + ' ' + label + '\n'); passed++; }
  else { process.stderr.write('  x FAIL: ' + label + '\n'); failed++; }
}
function section(t) { process.stdout.write('\n' + t + '\n'); }

const MAIN_PATH = path.join(__dirname, 'main.js');
const ENTRY_URL = require('url').pathToFileURL(path.join(__dirname, 'renderer', 'index.html')).toString();

// ---- the Electron stub ------------------------------------------------------------------------
// Only the surface main.js actually touches: app.{whenReady,getPath,setAppUserModelId,on,quit}, BrowserWindow,
// ipcMain.{handle,on}, session.defaultSession, safeStorage, shell, dialog, clipboard.
function makeElectronStub(userDataDir, record) {
  const fakeWebContents = {
    mainFrame: { url: ENTRY_URL },
    on() {}, send(ch, line) { record.sent.push(String(line)); }, setWindowOpenHandler() {}, openDevTools() {},
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
      whenReady: () => { record.whenReadyCalls += 1; return Promise.resolve(); },
      getPath: (name) => (name === 'userData' ? userDataDir : os.tmpdir()),
      // Windows taskbar identity: record each call together with what already existed at that
      // moment, so section (8) can prove the ID is set once, before readiness and before any window.
      setAppUserModelId(id) {
        record.appUserModelIds.push({ id, whenReadyCalls: record.whenReadyCalls, windowsCreated: record.windowsCreated });
      },
      on(evt, fn) {
        record.appEvents.push(evt);
        if (!record.appHandlers.has(evt)) record.appHandlers.set(evt, []);
        record.appHandlers.get(evt).push(fn);
      },
      quit() { record.quitCalls += 1; if (record.onQuit) record.onQuit(); },
      // CORRECTION 2 TRIPWIRE. The global single-instance policy was removed. If main ever calls
      // this again, the scenario fails loudly instead of silently reinstating an app-wide startup
      // change that has no product authority and breaks `--classic-layout` recovery.
      requestSingleInstanceLock() {
        record.singleInstanceLockCalls += 1;
        throw new Error('main.js must not request the Electron single-instance lock');
      },
    },
    BrowserWindow,
    ipcMain: {
      handle(ch, fn) { record.handled.set(ch, fn); },
      on(ch, fn) { record.on.set(ch, fn); },
    },
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

const ADMISSION_KEYS = [
  'BLUE_HELM_ADMISSION_ENABLED', 'BLUE_HELM_ADMISSION_RUN_ID', 'BLUE_HELM_ADMISSION_ALLOWANCE',
  'BLUE_HELM_ADMISSION_PANE_ID', 'BLUE_HELM_ADMISSION_REBIND',
];

/**
 * Evaluate the REAL app/main.js with a given admission environment, then drive it to readiness.
 * Returns everything the assertions need, including any throw from module evaluation itself.
 */
async function bootMain(admissionEnv, options) {
  const opt = options || {};
  const userDataDir = opt.userDataDir || fs.mkdtempSync(path.join(os.tmpdir(), 'bh-main-startup-'));
  const record = {
    handled: new Map(), on: new Map(), appEvents: [], appHandlers: new Map(), windowsCreated: 0,
    quitCalls: 0, singleInstanceLockCalls: 0, ptySpawns: 0, kills: 0, sent: [], onQuit: null, spawns: [],
    whenReadyCalls: 0, appUserModelIds: [],
  };
  const electronStub = makeElectronStub(userDataDir, record);
  // Only the shutdown scenarios opt in to a spawnable PTY. It is a plain object: no process exists,
  // and its onExit callback is recorded but NEVER invoked — exactly the teardown race in which a
  // synchronous quit outruns node-pty's asynchronous exit notification.
  const ptyStub = {
    spawn(file, args, spawnOpts) {
      record.ptySpawns += 1;
      if (!opt.spawnable) throw new Error('pty.spawn must not run in this test');
      record.spawns.push({ args: (args || []).slice(), env: (spawnOpts && spawnOpts.env) || {} });
      return {
        pid: 4242, onData() {}, onExit() {}, write() {}, resize() {},
        kill() { record.kills += 1; if (opt.killThrows) throw new Error('kill failed'); },
      };
    },
  };

  // Route `electron` and the native PTY binding to the stubs for the duration of this scenario.
  const realLoad = Module._load;
  Module._load = function (request) {
    if (request === 'electron') return electronStub;
    if (request === '@lydell/node-pty') return ptyStub;
    return realLoad.apply(this, arguments);
  };

  // A fresh module registry, so main.js and every admission module re-evaluate from scratch.
  const cacheBefore = new Set(Object.keys(require.cache));
  const envBefore = {};
  for (const k of ADMISSION_KEYS) { envBefore[k] = process.env[k]; delete process.env[k]; }
  for (const k of Object.keys(admissionEnv)) process.env[k] = admissionEnv[k];

  let loadError = null;
  try {
    require(MAIN_PATH);                          // <-- the evaluation the old suite never performed
    await new Promise((r) => setImmediate(r));   // let whenReady().then(...) run
    await new Promise((r) => setImmediate(r));
  } catch (e) {
    loadError = e;
  }

  // Restore global state before the next scenario.
  Module._load = realLoad;
  for (const k of Object.keys(require.cache)) if (!cacheBefore.has(k)) delete require.cache[k];
  for (const k of ADMISSION_KEYS) {
    if (envBefore[k] === undefined) delete process.env[k]; else process.env[k] = envBefore[k];
  }
  return { record, userDataDir, loadError };
}

const VALID_ENV = {
  BLUE_HELM_ADMISSION_ENABLED: '1',
  BLUE_HELM_ADMISSION_RUN_ID: 'startup-probe-run',
  BLUE_HELM_ADMISSION_ALLOWANCE: '3',
};
const CH_SUBMIT = 'admission-submit-prompt';
const CH_STATE = 'admission-get-state';
const LEDGER = 'admission-ledger.json';

(async () => {
  // ---- (1) ABSENT configuration: the ordinary application -------------------------------------
  section('(1) admission configuration ABSENT -- ordinary Blue Helm');
  {
    const r = await bootMain({});
    assert(r.loadError === null,
      'main.js evaluates without throwing' + (r.loadError ? ' (threw: ' + r.loadError.message + ')' : ''));
    assert(r.record.windowsCreated === 1, 'main reaches readiness and creates its window');
    assert(!r.record.handled.has(CH_SUBMIT) && !r.record.handled.has(CH_STATE),
      'neither admission channel is registered -- the surface is ABSENT, not inert');
    assert(r.record.on.has('pty-write'), 'the ordinary pty-write channel is still wired');
    assert(r.record.handled.has('pty-start'), 'the ordinary pty-start channel is still wired');
    assert(!fs.existsSync(path.join(r.userDataDir, LEDGER)),
      'no ledger file is created with no run configured');
    assert(r.record.singleInstanceLockCalls === 0, 'no single-instance lock is requested');
    assert(r.record.ptySpawns === 0, 'no PTY is spawned');
  }

  // ---- (2) VALID configuration: THE REGRESSION ------------------------------------------------
  section('(2) admission configuration VALID -- the crash this suite exists to catch');
  {
    const r = await bootMain(VALID_ENV);
    assert(r.loadError === null,
      'main.js evaluates without throwing under a VALID controlled run' +
      (r.loadError ? ' (threw: ' + r.loadError.message + ')' : ''));
    assert(r.record.windowsCreated === 1, 'main reaches Electron readiness and creates its window');
    assert(r.record.handled.has(CH_SUBMIT), 'readiness registered ' + CH_SUBMIT);
    assert(r.record.handled.has(CH_STATE), 'readiness registered ' + CH_STATE);
    // The decisive proof that the LIVE, store-backed budget was constructed and initialized: only a
    // real ledger store writing to the real `userData` can produce this file.
    const ledgerPath = path.join(r.userDataDir, LEDGER);
    assert(fs.existsSync(ledgerPath), 'the real ledger store created its ledger under Electron userData');
    if (fs.existsSync(ledgerPath)) {
      const doc = JSON.parse(fs.readFileSync(ledgerPath, 'utf8'));
      const run = doc.runs && doc.runs['startup-probe-run'];
      assert(!!run, 'the configured run was recorded in the durable ledger');
      assert(!!run && run.allowance === 3, 'the persisted allowance is the configured 3');
      assert(!!run && run.admitted === 0, 'the run starts with zero admissions');
      assert(typeof doc.checksum === 'string' && /^[0-9a-f]{64}$/.test(doc.checksum),
        'the persisted ledger carries its integrity checksum');
    }
    assert(r.record.singleInstanceLockCalls === 0, 'no single-instance lock is requested');
    assert(r.record.ptySpawns === 0, 'no PTY is spawned during startup');
  }

  // ---- (3) MALFORMED requested configuration: protective, not ordinary ------------------------
  section('(3) admission configuration MALFORMED but REQUESTED -- fails closed');
  const malformed = [
    ['allowance over the cap', Object.assign({}, VALID_ENV, { BLUE_HELM_ADMISSION_ALLOWANCE: '300' })],
    ['enabled flag not "1"', Object.assign({}, VALID_ENV, { BLUE_HELM_ADMISSION_ENABLED: '0' })],
    ['run id missing', { BLUE_HELM_ADMISSION_ENABLED: '1', BLUE_HELM_ADMISSION_ALLOWANCE: '3' }],
    ['malformed pane pin', Object.assign({}, VALID_ENV, { BLUE_HELM_ADMISSION_PANE_ID: '../escape' })],
  ];
  for (const entry of malformed) {
    const label = entry[0];
    const r = await bootMain(entry[1]);
    assert(r.loadError === null, '[' + label + '] main.js evaluates without throwing');
    assert(r.record.windowsCreated === 1, '[' + label + '] main still reaches readiness');
    assert(!r.record.handled.has(CH_SUBMIT) && !r.record.handled.has(CH_STATE),
      '[' + label + '] no admission channel is registered for an invalid request');
    assert(!fs.existsSync(path.join(r.userDataDir, LEDGER)),
      '[' + label + '] no ledger is minted from an invalid request');

    // AND the protective half: an eligible Claude pane must be REFUSED before any process exists.
    const ptyStart = r.record.handled.get('pty-start');
    assert(typeof ptyStart === 'function', '[' + label + '] pty-start is registered');
    if (typeof ptyStart === 'function') {
      let res = null, threw = null;
      try { res = ptyStart({}, { id: 'pty1', cli: 'claude', cols: 80, rows: 24 }); } catch (e) { threw = e; }
      assert(r.record.ptySpawns === 0, '[' + label + '] an eligible Claude pane never reaches pty.spawn');
      assert(threw === null && !!res && res.ok === false,
        '[' + label + '] eligible Claude startup is visibly refused' +
        (res && res.error ? ' [' + res.error + ']' : ''));
    }
  }

  // ---- (4) the removed global single-instance policy -------------------------------------------
  section('(4) the global single-instance policy is GONE');
  {
    const src = fs.readFileSync(MAIN_PATH, 'utf8');
    assert(!/requestSingleInstanceLock/.test(src), 'main.js no longer references requestSingleInstanceLock');
    assert(!/second-instance/.test(src), 'main.js registers no second-instance handler');
    assert(!/single-instance/.test(src), 'main.js requires no single-instance module');
    assert(/^app\.whenReady\(\)\.then\(/m.test(src),
      'startup is the ordinary unconditional app.whenReady() shape');
    assert(!fs.existsSync(path.join(__dirname, 'single-instance.js')), 'app/single-instance.js is deleted');
    assert(!fs.existsSync(path.join(__dirname, 'single-instance.test.js')),
      'app/single-instance.test.js is deleted');
  }

  // ---- (5) the pre-ready placeholder can never be built from an enabled plan --------------------
  section('(5) the pre-ready budget is built from a DISABLED plan');
  {
    const src = fs.readFileSync(MAIN_PATH, 'utf8');
    assert(!/createAdmissionBudget\(\{\s*plan:\s*admissionPlan\s*\}\)/.test(src),
      'no module-scope construction passes the live plan without storage');
    assert(/disabledPlan\(ADMISSION_REASON\.NOT_INITIALIZED\)/.test(src),
      'the pre-ready placeholder is explicitly built from a disabled plan');
    // And the property itself, not just its spelling: a disabled plan yields a refusing object.
    const config = require('./admission-budget-config');
    const budgetModule = require('./admission-budget');
    let constructThrew = null;
    let preReady = null;
    try {
      preReady = budgetModule.createAdmissionBudget({
        plan: config.disabledPlan(budgetModule.REASON.NOT_INITIALIZED),
      });
    } catch (e) { constructThrew = e; }
    assert(constructThrew === null, 'constructing the pre-ready object never throws');
    assert(!!preReady && preReady.enabled === false, 'the pre-ready object reports itself disabled');
    assert(!!preReady && preReady.isDirectInputBlocked('pty1') === false,
      'it blocks nothing before readiness');
    assert(!!preReady && preReady.claimPane('pty1').ok === false, 'it can never claim a pane');
    const submitted = await preReady.submitPrompt('pty1', 'x');
    assert(submitted.ok === false && submitted.reason === budgetModule.REASON.NOT_INITIALIZED,
      'it can never admit a prompt, and says why');
  }

  // ---- (6) application shutdown durably closes the controlled run (run -c correction) ----------
  section('(6) application shutdown closes the controlled run before teardown can bypass it');
  {
    const SHUT_ENV = Object.assign({}, VALID_ENV, { BLUE_HELM_ADMISSION_RUN_ID: 'shutdown-probe-run' });
    const runOf = (dir) => {
      const p = path.join(dir, LEDGER);
      if (!fs.existsSync(p)) return null;
      const doc = JSON.parse(fs.readFileSync(p, 'utf8'));
      return (doc.runs && doc.runs['shutdown-probe-run']) || null;
    };
    const fire = (r, evt) => { for (const fn of (r.record.appHandlers.get(evt) || [])) fn({ preventDefault() {} }); };
    // The budget's own log line (tlog also forwards a [TIMING]-prefixed copy of every line).
    const closeLines = (r) => r.record.sent.filter((l) => /^\[admission\] pane exited; run closed/.test(l));
    async function bindControlledPane(r) {
      const ptyStart = r.record.handled.get('pty-start');
      const ev = { sender: r.record.webContents, senderFrame: r.record.webContents.mainFrame };
      return ptyStart(ev, { id: 'pty1', cli: 'claude', cols: 80, rows: 24 });
    }

    // S1 — window-all-closed with a bound pane whose onExit never fires.
    const r1 = await bootMain(SHUT_ENV, { spawnable: true });
    assert(r1.loadError === null, 'S1: main.js evaluates under a valid controlled run');
    const bound = await bindControlledPane(r1);
    assert(bound && bound.ok !== false && r1.record.ptySpawns === 1, 'S1: one eligible Claude pane spawned');
    const before = runOf(r1.userDataDir);
    assert(!!before && before.paneId === 'pty1' && before.state === 'open' && before.admitted === 0,
      'S1: the ledger shows the run bound to pty1 and open');
    let atQuit = null;
    r1.record.onQuit = () => { atQuit = runOf(r1.userDataDir); };
    fire(r1, 'window-all-closed');
    const after = runOf(r1.userDataDir);
    assert(!!after && after.state === 'closed', 'S1: window-all-closed durably CLOSED the run');
    assert(!!atQuit && atQuit.state === 'closed', 'S1: the closure was durable BEFORE app.quit() ran');
    assert(after.admitted === 0 && after.allowance === 3 && after.paneId === 'pty1',
      'S1: consumed count, allowance and pane are unchanged; the remainder is void, never transferred');
    assert(closeLines(r1).length === 1 && /3 unused admission\(s\) voided/.test(closeLines(r1)[0]),
      'S1: the closure and voided remainder are visibly logged once');
    assert(r1.record.kills >= 1, 'S1: the controlled pane was killed');

    // S1b — a kill() that throws must not prevent the durable closure.
    const r1b = await bootMain(Object.assign({}, SHUT_ENV, { BLUE_HELM_ADMISSION_RUN_ID: 'shutdown-probe-run' }),
      { spawnable: true, killThrows: true });
    await bindControlledPane(r1b);
    fire(r1b, 'window-all-closed');
    const after1b = runOf(r1b.userDataDir);
    assert(!!after1b && after1b.state === 'closed' && r1b.record.kills >= 1,
      'S1b: the run closes even when kill() throws (notePaneExit runs in finally)');

    // S2 — before-quit (app.quit() path, no window-all-closed) and then window-all-closed: ONE closure.
    const r2 = await bootMain(SHUT_ENV, { spawnable: true });
    await bindControlledPane(r2);
    fire(r2, 'before-quit');
    const afterQuit = runOf(r2.userDataDir);
    assert(!!afterQuit && afterQuit.state === 'closed', 'S2: before-quit alone durably closes the run');
    fire(r2, 'window-all-closed');
    const afterBoth = runOf(r2.userDataDir);
    assert(closeLines(r2).length === 1, 'S2: before-quit then window-all-closed closes exactly once');
    assert(!!afterBoth && afterBoth.updatedUtc === afterQuit.updatedUtc,
      'S2: the second shutdown event performed no further ledger write');

    // S3 — a later initialization with the same run id observes a CLOSED run and refuses the pane.
    const r3 = await bootMain(SHUT_ENV, { userDataDir: r1.userDataDir });
    assert(r3.loadError === null, 'S3: main.js re-evaluates against the closed ledger');
    const res3 = await bindControlledPane(r3);
    assert(!!res3 && res3.ok === false && res3.error === 'admission-run-closed',
      'S3: an eligible Claude pane is refused with admission-run-closed');
    assert(r3.record.ptySpawns === 0, 'S3: the refused pane never reaches pty.spawn');
    const run3 = runOf(r1.userDataDir);
    assert(!!run3 && run3.state === 'closed' && run3.admitted === 0, 'S3: the ledger still records the closed run');

    // S4 — source tripwire on the ordering.
    const src = fs.readFileSync(MAIN_PATH, 'utf8');
    const wac = src.slice(src.indexOf("app.on('window-all-closed'"));
    const wacBody = wac.slice(0, wac.indexOf('\n});'));
    assert(wacBody.indexOf('closeControlledRunOnShutdown()') !== -1 &&
      wacBody.indexOf('closeControlledRunOnShutdown()') < wacBody.indexOf('ptys.clear()') &&
      wacBody.indexOf('closeControlledRunOnShutdown()') < wacBody.indexOf('app.quit()'),
      'S4: window-all-closed closes the run before ptys.clear() and app.quit()');
    assert(/app\.on\('before-quit', \(\) => \{ closeControlledRunOnShutdown\(\); \}\);/.test(src),
      'S4: before-quit closes the run too');
    const helper = src.slice(src.indexOf('function closeControlledRunOnShutdown()'));
    const helperBody = helper.slice(0, helper.indexOf('\n}\n') === -1 ? helper.indexOf('\r\n}\r\n') : helper.indexOf('\n}\n'));
    assert(/try \{ p\.kill\(\); \} catch \{\} finally \{\s*admissionBudget\.notePaneExit\(id\);/.test(helperBody),
      'S4: notePaneExit is attempted in finally, even if kill() throws');
  }

  // ---- (7) controlled WebFetch grant: only the admission-controlled fenced web-scout pane ----------
  section('(7) the WebFetch grant reaches only the admission-controlled fenced web-scout pane');
  {
    // A disposable fixture home: the tracked roles deployed as sync-roles.ps1 does, the tracked hook at
    // the canonical path main checks byte-for-byte, and a sandbox under the configured outputs root.
    // Nothing here touches the real ~/.claude, launches Claude, or runs the hook. The fixture sits at
    // the drive root (as in pty-start-authority-main.test.js): role resolution walks the sandbox's
    // ancestors, and a fixture under the user profile would find the REAL ~/.claude/agents there.
    const FIX = (() => {
      for (const base of [path.parse(__dirname).root, os.tmpdir()]) {
        try { return fs.mkdtempSync(path.join(base, 'bh-webfetch-grant-')); } catch (e) { /* try next */ }
      }
      throw new Error('no writable fixture root');
    })();
    const HOME = path.join(FIX, 'home');
    const PROJECTS = path.join(FIX, 'projects');
    const AGENTS = path.join(HOME, '.claude', 'agents');
    const HOOKS = path.join(HOME, '.claude', 'hooks');
    const OUTPUTS = path.join(PROJECTS, '.command-center', 'outputs');
    for (const d of [AGENTS, HOOKS, OUTPUTS]) fs.mkdirSync(d, { recursive: true });
    const deployedHook = path.join(HOOKS, 'fence-write.js');
    fs.copyFileSync(path.join(__dirname, '..', 'scripts', 'hooks', 'fence-write.js'), deployedHook);
    for (const r of ['web-scout', 'operator', 'source-scout', 'builder']) {
      const src = fs.readFileSync(path.join(__dirname, '..', 'agent-roles', r + '.md'), 'utf8');
      fs.writeFileSync(path.join(AGENTS, r + '.md'), src.replace('__CC_HOOK__', deployedHook.replace(/\\/g, '/')), 'utf8');
    }
    const SANDBOX = fs.mkdtempSync(path.join(OUTPUTS, 'web-scout-fixture-'));
    const MODE_KEY = 'BLUE_HELM_CONTROLLED_WEBFETCH_MODE';
    const GRANT = "--allowedTools 'WebFetch(domain:example.com)'";
    const DENIALS = '--disallowedTools Bash Glob NotebookEdit';
    const userProfileBefore = process.env.USERPROFILE;
    process.env.USERPROFILE = HOME;

    async function boot(env) {
      const userDataDir = fs.mkdtempSync(path.join(FIX, 'userData-'));
      fs.writeFileSync(path.join(userDataDir, 'settings.json'), JSON.stringify({ projectsRoot: PROJECTS, selectedRepo: '' }));
      return bootMain(env, { spawnable: true, userDataDir });
    }
    async function start(r, opts) {
      const ev = { sender: r.record.webContents, senderFrame: r.record.webContents.mainFrame };
      const before = r.record.spawns.length;
      const res = await r.record.handled.get('pty-start')(ev, Object.assign({ cols: 80, rows: 24 }, opts));
      const spawned = r.record.spawns.length === before + 1 ? r.record.spawns[r.record.spawns.length - 1] : null;
      return { res, spawned, cmd: spawned ? spawned.args.join(' ') : '', env: spawned ? spawned.env : {} };
    }
    const modeNames = (env) => Object.keys(env).filter((k) => k.toUpperCase() === MODE_KEY);
    const noWebFetch = (s) => s.cmd.indexOf('--allowedTools') === -1 && s.cmd.indexOf('WebFetch(') === -1
      && modeNames(s.env).length === 0;
    const ENV = Object.assign({}, VALID_ENV, { BLUE_HELM_ADMISSION_RUN_ID: 'webfetch-probe-run' });
    // Renderer-shaped fields that must never influence the grant.
    const SPOOF = {
      allowedTools: 'WebFetch(domain:evil.com)', permissions: { allow: ['WebFetch'] },
      webFetch: { allowedToolsRule: 'WebFetch(domain:evil.com)', mode: 'https://example.com' },
      webFetchMode: 'https://example.com', controlled: true, env: { [MODE_KEY]: 'https://example.com' },
    };

    try {
      // W1 — the controlled pane, then a non-target web-scout and a non-target operator in the same run.
      const r1 = await boot(ENV);
      assert(r1.loadError === null, 'W1: main.js evaluates under a valid controlled run');
      const c = await start(r1, Object.assign({ id: 'pty1', role: 'web-scout', cli: 'claude', cwd: SANDBOX }, SPOOF));
      assert(!!c.spawned && (!c.res || c.res.ok !== false), 'W1: the controlled fenced web-scout pane spawns');
      assert(c.cmd.split(GRANT).length === 2, 'W1: its command carries the CLI grant exactly once');
      assert(c.cmd.indexOf(DENIALS + ' ' + GRANT) !== -1, 'W1: directly after the main-issued denials');
      assert(c.cmd.indexOf('evil.com') === -1 && (c.cmd.match(/WebFetch\(/g) || []).length === 1,
        'W1: renderer fields add no rule of their own');
      assert(c.env[MODE_KEY] === 'https://example.com' && modeNames(c.env).length === 1,
        'W1: and its environment carries exactly one mode, the origin');
      const ledger = JSON.parse(fs.readFileSync(path.join(r1.userDataDir, LEDGER), 'utf8'));
      assert(ledger.runs['webfetch-probe-run'].paneId === 'pty1', 'W1: the ledger binds the run to that pane');

      const nt = await start(r1, Object.assign({ id: 'pty2', role: 'web-scout', cli: 'claude', cwd: SANDBOX }, SPOOF));
      assert(!!nt.spawned, 'W1: a second web-scout in the same run launches as a non-target pane');
      assert(nt.cmd.indexOf('--allowedTools') === -1 && nt.cmd.indexOf('WebFetch(') === -1,
        'W1: the non-target web-scout gets NO CLI grant');
      assert(nt.env[MODE_KEY] === 'disabled' && modeNames(nt.env).length === 1,
        'W1: and exactly the `disabled` mode');
      const op = await start(r1, { id: 'pty3', role: 'operator', cli: 'claude', cwd: SANDBOX });
      assert(!!op.spawned && noWebFetch(op), 'W1: a non-target operator gets no grant and no mode');

      // W2 — admission absent: an ordinary web-scout, with an ambient mode variant in process.env.
      process.env.blue_helm_controlled_webfetch_mode = 'https://example.com';
      let r2;
      try {
        r2 = await boot({});
        const ws = await start(r2, Object.assign({ id: 'pty1', role: 'web-scout', cli: 'claude', cwd: SANDBOX }, SPOOF));
        assert(!!ws.spawned && ws.cmd.indexOf('--allowedTools') === -1 && ws.cmd.indexOf('WebFetch(') === -1,
          'W2: with no admission run, web-scout gets NO CLI grant');
        assert(ws.env[MODE_KEY] === 'disabled' && modeNames(ws.env).length === 1,
          'W2: and exactly the `disabled` mode, whatever the ambient environment says');
        const b = await start(r2, { id: 'pty2', role: 'builder', cli: 'claude', cwd: FIX });
        assert(!!b.spawned && noWebFetch(b), 'W2: an unfenced builder receives neither grant nor any mode variant');
        const bare = await start(r2, { id: 'pty3', cli: 'claude' });
        assert(!!bare.spawned && noWebFetch(bare), 'W2: a bare Claude pane receives neither grant nor any mode variant');
      } finally {
        delete process.env.blue_helm_controlled_webfetch_mode;
        delete process.env[MODE_KEY];
      }

      // W3 / W4 — a CONTROLLED pane of another role never gets the WebFetch grant.
      const r3 = await boot(Object.assign({}, ENV, { BLUE_HELM_ADMISSION_RUN_ID: 'webfetch-probe-operator' }));
      const cop = await start(r3, { id: 'pty1', role: 'operator', cli: 'claude', cwd: SANDBOX });
      const l3 = JSON.parse(fs.readFileSync(path.join(r3.userDataDir, LEDGER), 'utf8'));
      assert(!!cop.spawned && l3.runs['webfetch-probe-operator'].paneId === 'pty1',
        'W3: a fenced operator can be the controlled pane');
      assert(cop.cmd.indexOf(DENIALS) !== -1 && noWebFetch(cop), 'W3: and it gets its denials but no WebFetch grant or mode');
      const r4 = await boot(Object.assign({}, ENV, { BLUE_HELM_ADMISSION_RUN_ID: 'webfetch-probe-builder' }));
      const cb = await start(r4, Object.assign({ id: 'pty1', role: 'builder', cli: 'claude', cwd: FIX }, SPOOF));
      const l4 = JSON.parse(fs.readFileSync(path.join(r4.userDataDir, LEDGER), 'utf8'));
      assert(!!cb.spawned && l4.runs['webfetch-probe-builder'].paneId === 'pty1' && noWebFetch(cb),
        'W4: a controlled unfenced builder gets no WebFetch grant or mode');

      // W5 — FULL-CLASS REVIEW COUNTEREXAMPLE (FAIL at 87e2337). A partially deployed web-scout: the new
      // canonical hook is installed and hash-valid, but the role still carries the OLD matcher, so
      // WebFetch would never reach the origin gate. Under a valid controlled run it must refuse before
      // any claim or spawn, so no pane ever carries the CLI grant.
      const wsFile = path.join(AGENTS, 'web-scout.md');
      const wsClean = fs.readFileSync(wsFile, 'utf8');
      const wsOld = wsClean.replace('matcher: "Read|Write|Edit|MultiEdit|WebFetch"', 'matcher: "Read|Write|Edit|MultiEdit"');
      assert(wsOld !== wsClean, 'W5: fixture: only WebFetch removed from the deployed web-scout matcher');
      fs.writeFileSync(wsFile, wsOld, 'utf8');
      try {
        const r5 = await boot(Object.assign({}, ENV, { BLUE_HELM_ADMISSION_RUN_ID: 'webfetch-probe-drift' }));
        const before5 = r5.record.ptySpawns;
        const d = await start(r5, { id: 'pty1', role: 'web-scout', cli: 'claude', cwd: SANDBOX });
        assert(!!d.res && d.res.ok === false && d.res.error === 'fence-policy-matcher-does-not-cover-declared-tools',
          'W5: the controlled web-scout start is REFUSED for missing WebFetch matcher coverage');
        assert(r5.record.ptySpawns === before5 && d.spawned === null,
          'W5: zero PTYs are spawned, so no command ever carries the CLI grant');
        const l5 = JSON.parse(fs.readFileSync(path.join(r5.userDataDir, LEDGER), 'utf8'));
        assert(l5.runs['webfetch-probe-drift'].paneId === null && l5.runs['webfetch-probe-drift'].admitted === 0,
          'W5: the run stays unbound: the refusal precedes the admission claim');
      } finally {
        fs.writeFileSync(wsFile, wsClean, 'utf8');
      }
    } finally {
      if (userProfileBefore === undefined) delete process.env.USERPROFILE; else process.env.USERPROFILE = userProfileBefore;
      try { fs.rmSync(FIX, { recursive: true, force: true }); } catch (e) { /* best effort */ }
    }
  }

  // ---- (8) Windows taskbar identity: one explicit AppUserModelID, set before readiness ------------
  section('(8) the Windows AppUserModelID is set once, before readiness and before any window');
  {
    const onWindows = process.platform === 'win32';
    const shapes = [
      ['absent', {}],
      ['valid', VALID_ENV],
      ['malformed', Object.assign({}, VALID_ENV, { BLUE_HELM_ADMISSION_ALLOWANCE: '300' })],
    ];
    for (const [label, env] of shapes) {
      const r = await bootMain(env);
      const calls = r.record.appUserModelIds;
      assert(r.loadError === null, '[' + label + '] main.js evaluates with the identity call in place' +
        (r.loadError ? ' (threw: ' + r.loadError.message + ')' : ''));
      assert(calls.length === (onWindows ? 1 : 0),
        '[' + label + '] setAppUserModelId is called exactly ' + (onWindows ? 'once' : 'never (not Windows)') +
        ' per evaluation (saw ' + calls.length + ')');
      if (onWindows) {
        assert(calls.length === 1 && calls[0].id === 'ABlueAI.Mako',
          '[' + label + '] the identity is exactly ABlueAI.Mako');
        assert(calls.length === 1 && calls[0].whenReadyCalls === 0,
          '[' + label + '] it is set before app.whenReady() is invoked');
        assert(calls.length === 1 && calls[0].windowsCreated === 0,
          '[' + label + '] it is set before any BrowserWindow exists');
      }
      assert(r.record.whenReadyCalls === 1 && r.record.windowsCreated === 1,
        '[' + label + '] readiness and the single window still follow');
    }
  }

  process.stdout.write('\nadmission-main-startup: ' + passed + ' passed, ' + failed + ' failed\n');
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  process.stderr.write('\nadmission-main-startup: harness error: ' + ((e && e.stack) || e) + '\n');
  process.exit(1);
});
