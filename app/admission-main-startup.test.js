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

// ---- the Electron stub ------------------------------------------------------------------------
// Only the surface main.js actually touches: app.{whenReady,getPath,on,quit}, BrowserWindow,
// ipcMain.{handle,on}, session.defaultSession, safeStorage, shell, dialog, clipboard.
function makeElectronStub(userDataDir, record) {
  const fakeWebContents = {
    on() {}, send() {}, setWindowOpenHandler() {}, openDevTools() {},
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
    constructor() { record.windowsCreated += 1; return fakeWindow(); }
    static getAllWindows() { return []; }
  }
  return {
    app: {
      whenReady: () => Promise.resolve(),
      getPath: (name) => (name === 'userData' ? userDataDir : os.tmpdir()),
      on(evt) { record.appEvents.push(evt); },
      quit() { record.quitCalls += 1; },
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
async function bootMain(admissionEnv) {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bh-main-startup-'));
  const record = {
    handled: new Map(), on: new Map(), appEvents: [], windowsCreated: 0,
    quitCalls: 0, singleInstanceLockCalls: 0, ptySpawns: 0,
  };
  const electronStub = makeElectronStub(userDataDir, record);
  const ptyStub = {
    spawn() { record.ptySpawns += 1; throw new Error('pty.spawn must not run in this test'); },
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

  process.stdout.write('\nadmission-main-startup: ' + passed + ' passed, ' + failed + ' failed\n');
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  process.stderr.write('\nadmission-main-startup: harness error: ' + ((e && e.stack) || e) + '\n');
  process.exit(1);
});
