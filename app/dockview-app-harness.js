// Dockview PRODUCTION APPLICATION harness — real Electron, real preload, real renderer.
//
// WHY A THIRD HARNESS, AND WHAT MAKES IT DIFFERENT.
//
//   * `dockview-tripwire.js` loads the VENDOR BUNDLE AND NOTHING ELSE. It is the evidence that
//     network behaviour is attributable to Dockview rather than to our integration code, so it must
//     stay uncontaminated.
//   * `dockview-bootstrap-harness.js` drives the ADAPTER against a synthetic host in a real
//     renderer. It proves the classic-script chain parses and that every bootstrap failure path
//     refuses cleanly.
//   * THIS harness loads `app/renderer/index.html` itself, through the REAL `preload.js`, and drives
//     the REAL `app.js`. Nothing about the renderer is mirrored, stubbed, or re-implemented: the
//     terminal panes are the app's own panes, the Library is the app's own singleton, the close path
//     is the app's own close path, and the layout decision is the one the real preload publishes
//     from its own argv.
//
// Only MAIN is replaced, and only with counting stubs for the IPC channels the renderer calls. That
// is deliberate: `pty-start` / `pty-kill` counts are the only honest way to prove "zero PTY was
// started" and "the PTY was killed exactly once", and they have to be observed at the process
// boundary rather than asserted about renderer variables.
//
// FAULT INJECTION happens at exactly two seams, both OUTSIDE the application code:
//   1. the session's request filter (hold or cancel a script the renderer asks for);
//   2. a page-side wrapper around `window.dockview.createDockview` installed BEFORE the vendor
//      bundle is fetched, which lets a specific `addPanel` call throw.
// Neither seam touches app.js, the adapter, or the policies, so what is measured is the real code
// reacting to a real failure.
//
// Output is a single JSON document on stdout; `dockview-app-integration.test.js` consumes it.

const { app, BrowserWindow, ipcMain, session } = require('electron');
const path = require('path');

// THE WINDOWS ARE SHOWN, and these switches keep them un-throttled behind other windows.
//
// Chromium suspends the rendering lifecycle for a window that is not visible, and BOTH resize
// owners under test are driven by that lifecycle: `ResizeObserver` delivery and
// `requestAnimationFrame`. A hidden window therefore reports ZERO resizes no matter which owner is
// attached — the measurement would be vacuous. Shown windows make the resize assertions real.
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('disable-renderer-backgrounding');

const INDEX_FILE = path.join(__dirname, 'renderer', 'index.html');
const PRELOAD_FILE = path.join(__dirname, 'preload.js');
const STEP_TIMEOUT_MS = 30000;

// ---------------------------------------------------------------------------
// Main-side observation. Everything privileged the renderer can reach is counted here.
// ---------------------------------------------------------------------------
const ipc = {
  ptyStart: [], ptyKill: [], ptyResize: 0, ptyWrite: 0,
  libraryList: 0, libraryRead: 0, libraryOpenReport: 0,
  layoutSave: 0, layoutLoad: 0, layoutReset: 0, savedLayouts: [],
};
function resetIpc() {
  ipc.ptyStart = []; ipc.ptyKill = []; ipc.ptyResize = 0; ipc.ptyWrite = 0;
  ipc.libraryList = 0; ipc.libraryRead = 0; ipc.libraryOpenReport = 0;
  ipc.layoutSave = 0; ipc.layoutLoad = 0; ipc.layoutReset = 0; ipc.savedLayouts = [];
}

/**
 * The saved layout file, IN MEMORY. Phase C's four operations are driven through main's real IPC
 * handlers' contract, but the harness owns the "disk" so a gate run can never touch the real
 * userData file — and never, ever the prototype evidence file.
 */
const savedLayout = { envelope: null };

/** Controls for the current scenario, reset before each window. */
const control = {
  settingsGate: null,      // a promise `get-settings` awaits, so the prelude lands before boot proceeds
  releaseSettings: () => {},
  holdPatterns: [],        // URL substrings whose requests are parked until released
  cancelPatterns: [],      // URL substrings whose requests are refused outright
  held: [],                // parked { url, callback }
  ptyStartResult: { ok: true },
  ptyStartDelayMs: 0,
  layoutIpcDelayMs: 0,     // slows save/load/reset so a concurrent click lands mid-operation
  saveResult: null,        // when set, main's save refuses with this instead of writing
};

/** Requests observed across the whole run. Metadata only — never a full URL, query, or path. */
const observed = [];
const consoleMessages = [];

function armSettingsGate() {
  control.settingsGate = new Promise((resolve) => { control.releaseSettings = resolve; });
}
function releaseHeld() {
  for (const h of control.held.splice(0)) { try { h.callback({ cancel: false }); } catch { /* window gone */ } }
}
function resetControl(options) {
  const o = options || {};
  releaseHeld();
  control.holdPatterns = o.hold || [];
  control.cancelPatterns = o.cancel || [];
  control.ptyStartResult = o.ptyStartResult || { ok: true };
  control.ptyStartDelayMs = o.ptyStartDelayMs || 0;
  control.layoutIpcDelayMs = o.layoutIpcDelayMs || 0;
  control.saveResult = o.saveResult || null;
  savedLayout.envelope = null;
  armSettingsGate();
  resetIpc();
}

function recordRequest(details) {
  let scheme = 'unknown';
  let host = '';
  try {
    const u = new URL(details.url);
    scheme = u.protocol.replace(/:$/, '');
    host = u.host;
  } catch { /* unparseable is still counted, just unattributable */ }
  observed.push({ scheme, host, resourceType: details.resourceType || 'unknown' });
  return scheme === 'file';
}

function summarize() {
  const counts = new Map();
  for (const r of observed) {
    const key = `${r.scheme}|${r.host}|${r.resourceType}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()].map(([key, count]) => {
    const [scheme, host, resourceType] = key.split('|');
    return { scheme, host, resourceType, count };
  }).sort((a, b) => (a.scheme + a.host).localeCompare(b.scheme + b.host));
}

let emitted = false;
function emit(payload, code) {
  if (emitted) return;
  emitted = true;
  process.stdout.write(JSON.stringify(payload, null, 2) + '\n');
  app.exit(code);
}

/** Progress goes to stderr so a hang is attributable to a named step rather than to "the harness". */
function progress(line) { process.stderr.write(`[harness] ${line}\n`); }

/** Nothing in this harness may block forever; every await is wrapped by this. */
function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)),
  ]);
}

const scenarios = {};
let fatal = null;

// ---------------------------------------------------------------------------
// PAGE-SIDE PRELUDE. Installed after the document's own scripts have run but BEFORE boot() gets
// past its first IPC await, because `get-settings` is gated in main until this returns.
//
// It installs three things and nothing else:
//   * an error/rejection recorder;
//   * a lazily-wrapping accessor for `window.dockview`, which captures the live DockviewApi for
//     observation and lets a named `addPanel` throw on demand;
//   * small read-only DOM probes the driver calls (`reachable`, `rect`, `waitFor`).
// It never touches app.js, the adapter, or the policy modules.
// ---------------------------------------------------------------------------
const PRELUDE = `(() => {
  const win = window;
  const doc = document;
  win.__cc = {
    errors: [],
    rejections: [],
    fault: { addPanelFailIds: [] },
    api: null,
  };
  win.addEventListener('error', (e) => {
    win.__cc.errors.push(String((e && e.message) || (e && e.target && e.target.src) || 'error'));
  });
  win.addEventListener('unhandledrejection', (e) => {
    const r = e && e.reason;
    win.__cc.rejections.push(String((r && r.message) || r || 'rejection'));
  });

  // The vendor UMD assigns \`global.dockview = {}\` and only THEN populates it, so a setter cannot
  // see createDockview. Wrap lazily on first read instead — which is exactly when app.js's host
  // calls getDockviewGlobal(), by which point the namespace is complete.
  let dv;
  let wrapped = false;
  Object.defineProperty(win, 'dockview', {
    configurable: true,
    enumerable: true,
    get() {
      if (dv && !wrapped && typeof dv.createDockview === 'function') {
        wrapped = true;
        const original = dv.createDockview;
        dv.createDockview = function (el, options) {
          const api = original.call(dv, el, options);
          win.__cc.api = api;                       // observation only; the app never reads this
          const realAdd = api.addPanel.bind(api);
          api.addPanel = (opts) => {
            if (win.__cc.fault.addPanelFailIds.includes(opts && opts.id)) {
              throw new Error('harness: synthetic addPanel failure');
            }
            return realAdd(opts);
          };
          return api;
        };
      }
      return dv;
    },
    set(v) { dv = v; wrapped = false; },
  });

  // The app opens on the Board tab and a .tabpane is display:none until its tab is active, so
  // every geometry measurement below would read 0x0 without this. Clicking the real tab is also
  // what a user does, so nothing is bypassed.
  // boot() wires the UI several IPC round-trips in. Clicking a control before wireUi() has run is
  // a silent no-op, so every driver step that clicks waits for the real handler to exist first.
  win.__cc.waitForWired = () => win.__cc.waitFor(
    () => typeof (doc.getElementById('newTermShell') || {}).onclick === 'function', 15000);
  win.__cc.showTerminals = async () => {
    [...doc.querySelectorAll('.tab')].find((t) => t.dataset.tab === 'terminals').click();
    await new Promise((r) => setTimeout(r, 120));
    return true;
  };
  // Read the resize-ownership diagnostic if this build publishes one. Deliberately tolerant: a
  // build WITHOUT it must still produce a full report in which the ownership assertions fail by
  // name, rather than aborting the harness and collapsing a negative control into one opaque error.
  win.__cc.owners = () => {
    const d = win.ccDockviewDiagnostics;
    return (d && typeof d.resizeOwners === 'function') ? d.resizeOwners() : null;
  };
  // ---- Phase C probes: the layout control bar and pane identity across a fromJSON --------------
  win.__cc.status = () => {
    const el = doc.querySelector('.dockview-prototype-status');
    return el ? el.textContent : '';
  };
  win.__cc.layoutButtons = () => [...doc.querySelectorAll('.dockview-prototype-controls button')];
  win.__cc.anyDisabled = () => win.__cc.layoutButtons().some((b) => b.disabled === true);
  win.__cc.panelIds = () => (win.__cc.api ? win.__cc.api.panels.map((p) => p.id).sort() : null);
  // Element identity across a rebuild, read from a tag stamped on the element itself. An id-keyed
  // map would prove nothing: the question is whether the SAME node survived, not whether a node
  // with that pane's id exists.
  win.__cc.identities = () => {
    const out = {};
    for (const el of doc.querySelectorAll('.term-pane')) {
      if (el.dataset.ccIdentity) out[el.dataset.ccIdentity] = true;
    }
    return Object.keys(out).sort();
  };
  win.__cc.logs = () => (doc.getElementById('logView') || {}).textContent || '';
  win.__cc.settled = () => /production layout engine active|\\[dockview\\] REFUSED|CLASSIC RECOVERY MODE ACTIVE/
    .test(win.__cc.logs());
  win.__cc.sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  win.__cc.waitFor = async (pred, ms) => {
    const deadline = Date.now() + (ms || 8000);
    while (Date.now() < deadline) {
      let ok = false;
      try { ok = !!pred(); } catch { ok = false; }
      if (ok) return true;
      await win.__cc.sleep(25);
    }
    return false;
  };
  // "Reachable" means what a user means: the element is the topmost thing at its own centre.
  win.__cc.reachable = (el) => {
    if (!el || !el.isConnected) return false;
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return false;
    const top = doc.elementFromPoint(Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2));
    return !!top && (top === el || el.contains(top));
  };
  win.__cc.box = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) };
  };
  return { installed: true };
})()`;

// ---------------------------------------------------------------------------

let currentWindow = null;
// ONE session for the whole run, with ONE request filter that reads the per-scenario `control`
// object, so the request census stays attributable to the run as a whole.
let harnessSession = null;

// EXACTLY TWO long-lived windows, reused across scenarios and RELOADED between them.
//
// This is not an optimisation. `BrowserWindow.destroy()` immediately after a load of this
// particular document reliably wedges the next window's top-level navigation with ERR_FAILED (and,
// without the request filter, hangs outright) — reproduced in isolation before this shape was
// chosen. Reloading a surviving window produces an equally fresh document: a full parse of
// index.html, a fresh preload, a fresh `boot()`, and a fresh global scope.
//
// Two, not one, because the layout decision arrives through `additionalArguments`, which is fixed
// at window construction — the same constraint main.js works under. One window IS production mode
// and the other IS classic recovery mode, exactly as the two npm scripts are.
let productionWindow = null;
let classicWindow = null;
let scenarioName = '(none)';

function makeWindow(classic) {
  const win = new BrowserWindow({
    show: false,
    width: 1280,
    height: 900,
    webPreferences: {
      session: harnessSession,
      preload: PRELOAD_FILE,          // the REAL preload — the layout bridge under test
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // LOAD-BEARING. Chromium suspends requestAnimationFrame in a window that is never shown, and
      // BOTH resize owners under test schedule their fit inside a frame — the app's grid observer
      // and the adapter's gated fit controller. Without this every resize measurement below reads
      // zero and would "prove" ownership by measuring nothing at all.
      backgroundThrottling: false,
      // Exactly what main.js forwards. `classic` reproduces `npm run start:classic`.
      additionalArguments: classic ? ['--cc-classic-layout'] : [],
    },
  });
  win.showInactive();
  win.webContents.on('console-message', (_e, level, message, line, sourceId) => {
    const file = String(sourceId || '').split('/').pop().split('\\').pop();
    consoleMessages.push({ scenario: scenarioName, level, message: String(message).slice(0, 400), line, file });
  });
  return win;
}

async function openWindow(options) {
  const o = options || {};
  scenarioName = o.name;
  resetControl(o);

  let win;
  if (o.classic) win = classicWindow || (classicWindow = makeWindow(true));
  else win = productionWindow || (productionWindow = makeWindow(false));
  currentWindow = win;

  progress(`${o.name}: loading index.html`);
  await withTimeout(win.loadFile(INDEX_FILE), STEP_TIMEOUT_MS, `${o.name}: loadFile`);
  await withTimeout(win.webContents.executeJavaScript(PRELUDE, true), STEP_TIMEOUT_MS, `${o.name}: prelude`);
  control.releaseSettings();          // boot() may now proceed past `await cc.getSettings()`
  progress(`${o.name}: booted`);
  return win;
}

/**
 * End a scenario: park the window on a blank document so the finished scenario's timers, observers
 * and pending IPC cannot bleed into the next one's counters. The window itself survives — see the
 * note above makeWindow.
 */
async function closeWindow(win) {
  releaseHeld();
  currentWindow = null;
  try { if (win && !win.isDestroyed()) await withTimeout(win.loadURL('about:blank'), 10000, 'park'); }
  catch { /* a parking failure must not mask the scenario's own result */ }
}

function run(win, source) {
  return withTimeout(win.webContents.executeJavaScript(source, true), STEP_TIMEOUT_MS, 'page step');
}

/**
 * Wait for the layout engine to have either started or refused, then bring the Terminals tab
 * forward — the app opens on Board, and an inactive `.tabpane` is display:none, so every geometry
 * assertion afterwards would otherwise measure a 0x0 box and prove nothing.
 */
const AWAIT_SETTLED = `(async () => {
  const ok = await window.__cc.waitFor(() => window.__cc.settled(), 20000);
  await window.__cc.showTerminals();
  return { settled: ok, logs: window.__cc.logs().slice(-4000) };
})()`;

/**
 * The state every scenario reports: which surface is live, where the audio controls are, whether
 * the dock is embedded rather than an overlay, and what the read-only diagnostic says.
 */
const SURFACE_STATE = `(() => {
  const doc = document;
  const win = window;
  const grid = doc.getElementById('terminalGrid');
  const dock = doc.getElementById('terminalDock');
  const bar = doc.querySelector('.term-bar');
  const audio = doc.querySelector('.tts-controls');
  const mic = doc.getElementById('sttMic');
  const dockStyle = dock ? getComputedStyle(dock) : null;
  const dockBox = win.__cc.box(dock);
  const barBox = win.__cc.box(bar);
  const diag = win.ccDockviewDiagnostics;
  return {
    bridgeEnabled: !!(win.ccDockview && win.ccDockview.enabled === true),
    bridgeHasSave: !!(win.ccDockview && typeof win.ccDockview.saveLayout === 'function'),
    bridgeHasLoad: !!(win.ccDockview && typeof win.ccDockview.loadLayout === 'function'),
    bridgeHasReset: !!(win.ccDockview && typeof win.ccDockview.resetLayout === 'function'),
    bridgeKeys: win.ccDockview ? Object.keys(win.ccDockview).sort() : null,
    bridgeFrozen: win.ccDockview ? Object.isFrozen(win.ccDockview) : null,

    dockHidden: dock ? dock.hidden : null,
    gridHidden: grid ? grid.hidden : null,
    dockChildren: dock ? dock.children.length : null,
    dockPosition: dockStyle ? dockStyle.position : null,
    dockZIndex: dockStyle ? dockStyle.zIndex : null,
    dockBox,
    barBox,
    // EMBEDDED, not an overlay: the dock starts BELOW the terminal toolbar and does not cover it.
    // The two edges are adjacent, so the comparison carries a 2px tolerance for the rounding the
    // box helper applies — it is proving "not overlapping", not a sub-pixel layout claim.
    dockBelowBar: !!(dockBox && barBox && dockBox.y + 2 >= barBox.y + barBox.h),
    dockCoversViewport: !!(dockBox && dockBox.y <= 0 && dockBox.h >= win.innerHeight),

    // The audio controls must not have moved: same parent, same index, reachable.
    audioInBar: !!(audio && bar && audio.parentNode === bar),
    audioIndex: audio && bar ? Array.prototype.indexOf.call(bar.children, audio) : -1,
    audioCount: doc.querySelectorAll('.tts-controls').length,
    micReachable: win.__cc.reachable(mic),

    dockviewGlobalLoaded: typeof win.dockview !== 'undefined' && !!win.dockview,
    adapterLoaded: !!win.ccDockviewPrototype,
    fitPolicyLoaded: !!win.ccDockviewFitPolicy,
    panelPolicyLoaded: !!win.ccDockviewPanelPolicy,
    dockviewScriptTags: [...doc.querySelectorAll('script[src]')]
      .map((s) => s.getAttribute('src')).filter((s) => /dockview/i.test(s)),

    diagnosticsPresent: !!diag,
    diagnosticsActive: diag ? diag.active() : null,
    diagnosticsSnapshot: diag ? diag.snapshot() : null,
    resizeOwners: window.__cc.owners(),

    errors: win.__cc.errors.slice(0, 20),
    rejections: win.__cc.rejections.slice(0, 20),
    panelIds: win.__cc.api ? win.__cc.api.panels.map((p) => p.id).sort() : null,
    logs: win.__cc.logs().slice(-4000),
  };
})()`;

/**
 * Click `+ Shell` and wait for the outcome — a new live terminal, or a logged refusal.
 *
 * Counting `.term-pane` elements is NOT a reliable liveness signal under Dockview: a second panel
 * added to the same group becomes a TAB, and dockview detaches the inactive tab's content from the
 * document. The pane, its xterm and its PTY are all still alive and still owned; only the element
 * is parked. So liveness is read from the app's own live-terminal count where it exists.
 */
const CLICK_NEW_SHELL = `(async () => {
  await window.__cc.waitForWired();
  const live = () => (window.ccDockviewDiagnostics
    ? window.ccDockviewDiagnostics.snapshot().liveTerminals
    : document.querySelectorAll('.term-pane').length);
  const before = live();
  const logsBefore = window.__cc.logs().length;
  document.getElementById('newTermShell').click();
  await window.__cc.waitFor(() => live() !== before || window.__cc.logs().length !== logsBefore, 5000);
  await window.__cc.sleep(200);
  return {
    live: live(),
    attachedPanes: document.querySelectorAll('.term-pane').length,
    logs: window.__cc.logs().slice(logsBefore),
  };
})()`;

// ---------------------------------------------------------------------------
// SCENARIOS
// ---------------------------------------------------------------------------

/** 1 — a normal launch. Dockview must be the live workspace, embedded, with nothing else moved. */
async function scenarioProduction() {
  const win = await openWindow({ name: 'production' });
  const settled = await run(win, AWAIT_SETTLED);
  const state = await run(win, SURFACE_STATE);
  const created = await run(win, CLICK_NEW_SHELL);
  // A real geometry change while Dockview owns the pane: the gated fit controller must handle it,
  // and the grid fitter must not (fitAllTerms skips docked panes).
  const resizeBefore = ipc.ptyResize;
  await run(win, `(async () => {
    document.querySelector('.layout').style.width = '760px';
    await window.__cc.sleep(400);
    return true;
  })()`);
  const dockedResizes = ipc.ptyResize - resizeBefore;
  const afterCreate = await run(win, `(() => {
    const doc = document;
    const pane = doc.querySelector('.term-pane');
    const host = pane ? pane.parentNode : null;
    const diag = window.ccDockviewDiagnostics;
    return {
      paneCount: doc.querySelectorAll('.term-pane').length,
      hostedInPanel: !!(host && String(host.className || '').includes('dockview-prototype-pane-host')),
      paneInGrid: !!(pane && pane.closest('#terminalGrid')),
      paneInDock: !!(pane && pane.closest('#terminalDock')),
      paneVisible: window.__cc.reachable(pane ? pane.querySelector('.term-body') : null),
      ownedPaneIds: diag ? diag.snapshot().ownedPaneIds : null,
      liveTerminals: diag ? diag.snapshot().liveTerminals : null,
      resizeOwners: window.__cc.owners(),
      panelIds: window.__cc.api ? window.__cc.api.panels.map((p) => p.id) : null,
    };
  })()`);
  const result = {
    settled, state, created, dockedResizes, afterCreate,
    ptyStart: ipc.ptyStart.slice(), ptyKill: ipc.ptyKill.slice(),
    layoutIpc: { save: ipc.layoutSave, load: ipc.layoutLoad, reset: ipc.layoutReset },
  };
  await closeWindow(win);
  return result;
}

/** 2 — `npm run start:classic`. The grid is the workspace and NO layout operation is exposed. */
async function scenarioClassic() {
  const win = await openWindow({ name: 'classic', classic: true });
  const settled = await run(win, AWAIT_SETTLED);
  const state = await run(win, SURFACE_STATE);
  const created = await run(win, CLICK_NEW_SHELL);
  const afterCreate = await run(win, `(() => {
    const pane = document.querySelector('.term-pane');
    return {
      paneCount: document.querySelectorAll('.term-pane').length,
      paneInGrid: !!(pane && pane.closest('#terminalGrid')),
      paneVisible: window.__cc.reachable(pane ? pane.querySelector('.term-body') : null),
      diagnosticsPresent: !!window.ccDockviewDiagnostics,
    };
  })()`);
  // The classic-mode maximize path must still be the GRID maximizer.
  const maximize = await run(win, `(async () => {
    const pane = document.querySelector('.term-pane');
    pane.querySelector('.max').click();
    await window.__cc.sleep(120);
    const grid = document.getElementById('terminalGrid');
    return {
      gridHasMaximized: grid.classList.contains('has-maximized'),
      paneMaximized: pane.classList.contains('maximized'),
    };
  })()`);
  // A forged layout call must find nothing: the preload never exposed one in this mode.
  const forged = await run(win, `(() => {
    try { return { called: typeof window.ccDockview.saveLayout }; }
    catch (e) { return { threw: true }; }
  })()`);
  const result = {
    settled, state, created, afterCreate, maximize, forged,
    ptyStart: ipc.ptyStart.slice(), ptyKill: ipc.ptyKill.slice(),
    layoutIpc: { save: ipc.layoutSave, load: ipc.layoutLoad, reset: ipc.layoutReset },
  };
  await closeWindow(win);
  return result;
}

/** 3 — a Dockview script never arrives. The classic grid must survive, usable, in the same process. */
async function scenarioScriptRefusal() {
  const win = await openWindow({ name: 'script-refusal', cancel: ['dockview-panel-policy.js'] });
  const settled = await run(win, AWAIT_SETTLED);
  const state = await run(win, SURFACE_STATE);
  const created = await run(win, CLICK_NEW_SHELL);
  const afterCreate = await run(win, `(() => {
    const pane = document.querySelector('.term-pane');
    return {
      paneCount: document.querySelectorAll('.term-pane').length,
      paneInGrid: !!(pane && pane.closest('#terminalGrid')),
      paneVisible: window.__cc.reachable(pane ? pane.querySelector('.term-body') : null),
      diagnosticsPresent: !!window.ccDockviewDiagnostics,
      dockChildren: document.getElementById('terminalDock').children.length,
    };
  })()`);
  const result = {
    settled, state, created, afterCreate,
    ptyStart: ipc.ptyStart.slice(), ptyKill: ipc.ptyKill.slice(),
  };
  await closeWindow(win);
  return result;
}

/**
 * 4 — the ownership transition the work order names:
 *        grid owner -> Dockview owner -> failed multi-pane adoption -> grid owner
 *
 * Two panes are created in the classic grid while the vendor bundle is HELD, which is the real
 * startup race (`+ Shell` is clickable before the engine finishes loading). Adoption of the SECOND
 * pane is then made to fail, so the all-or-nothing rule must roll the first one back too.
 *
 * At each stage a real geometry change is applied and the resulting `pty-resize` messages are
 * counted in MAIN. Zero after the rollback would mean the grid observer was never reconnected;
 * that is the defect this scenario exists to catch.
 */
async function scenarioAdoptionRollback() {
  const win = await openWindow({ name: 'adoption-rollback', hold: ['dockview/dist/dockview.js'] });

  // --- stage 1: grid owner. Two panes, created before the engine can adopt them. -----------------
  await run(win, `(async () => {
    await window.__cc.waitForWired();
    await window.__cc.showTerminals();
    document.getElementById('newTermShell').click();
    await window.__cc.waitFor(() => document.querySelectorAll('.term-pane').length === 1, 5000);
    document.getElementById('newTermShell').click();
    await window.__cc.waitFor(() => document.querySelectorAll('.term-pane').length === 2, 5000);
    await window.__cc.sleep(300);
    return true;
  })()`);
  const stage1 = await run(win, `(() => ({
    panes: document.querySelectorAll('.term-pane').length,
    inGrid: [...document.querySelectorAll('.term-pane')].every((p) => !!p.closest('#terminalGrid')),
    engineActive: !!window.ccDockviewDiagnostics,
    boxes: [...document.querySelectorAll('.term-pane')].map((p) => window.__cc.box(p)),
  }))()`);
  const resizeBefore1 = ipc.ptyResize;
  await run(win, `(async () => {
    document.querySelector('.layout').style.width = '760px';
    await window.__cc.sleep(400);
    return true;
  })()`);
  const stage1Resizes = ipc.ptyResize - resizeBefore1;

  // --- stage 2: release the engine, but make adopting the SECOND pane fail ----------------------
  await run(win, `(() => { window.__cc.fault.addPanelFailIds = ['pty2']; return true; })()`);
  releaseHeld();
  const settled = await run(win, AWAIT_SETTLED);
  await run(win, `window.__cc.sleep(300)`);

  const stage3 = await run(win, `(() => {
    const grid = document.getElementById('terminalGrid');
    const dock = document.getElementById('terminalDock');
    const panes = [...document.querySelectorAll('.term-pane')];
    return {
      panes: panes.length,
      boxes: panes.map((p) => window.__cc.box(p)),
      allBackInGrid: panes.every((p) => !!p.closest('#terminalGrid')),
      anyInDock: panes.some((p) => !!p.closest('#terminalDock')),
      anyDetached: panes.some((p) => !p.isConnected),
      gridHidden: grid.hidden,
      dockHidden: dock.hidden,
      dockChildren: dock.children.length,
      engineActive: !!window.ccDockviewDiagnostics,
      panesVisible: panes.every((p) => window.__cc.reachable(p.querySelector('.term-body'))),
      logs: window.__cc.logs().slice(-3000),
    };
  })()`);

  // --- stage 4: back under grid ownership — one geometry change, one resize per pane -------------
  const resizeBefore3 = ipc.ptyResize;
  await run(win, `(async () => {
    document.querySelector('.layout').style.width = '1180px';
    await window.__cc.sleep(400);
    return true;
  })()`);
  const stage3Resizes = ipc.ptyResize - resizeBefore3;

  const result = {
    stage1, stage1Resizes, settled, stage3, stage3Resizes,
    ptyStart: ipc.ptyStart.slice(), ptyKill: ipc.ptyKill.slice(), ptyResizeTotal: ipc.ptyResize,
  };
  await closeWindow(win);
  return result;
}

/**
 * 5 — THE PRE-PTY DOCKING TRANSACTION, under controlled delayed IPC.
 *
 * `pty-start` is deliberately slowed to 400ms. Under the previous ordering — start, fail to dock,
 * immediately kill — that delay is the race window: the kill is sent while main is still inside
 * `pty.spawn`, so `ptys` does not hold the handle yet and the kill silently does nothing, leaving an
 * orphan ConPTY. The correct ordering never opens that window, and this scenario measures it at the
 * only place it can be measured honestly: the IPC boundary.
 */
async function scenarioNewPaneTransaction() {
  const win = await openWindow({ name: 'new-pane-transaction', ptyStartDelayMs: 400 });
  const settled = await run(win, AWAIT_SETTLED);

  // One good terminal first, so the failure below is a failure to ADD, not a failure to start.
  await run(win, CLICK_NEW_SHELL);
  const baseline = {
    ptyStart: ipc.ptyStart.slice(), ptyKill: ipc.ptyKill.slice(),
    state: await run(win, `(() => {
      const d = window.ccDockviewDiagnostics.snapshot();
      return { panes: document.querySelectorAll('.term-pane').length, owned: d.ownedPaneIds, live: d.liveTerminals,
               panels: window.__cc.api.panels.map((p) => p.id) };
    })()`),
  };

  // Now make the NEXT pane's adoption fail.
  await run(win, `(() => { window.__cc.fault.addPanelFailIds = ['pty2']; return true; })()`);
  const attempt = await run(win, CLICK_NEW_SHELL);
  await run(win, `window.__cc.sleep(800)`);   // longer than the injected pty-start delay
  const after = await run(win, `(() => {
    const d = window.ccDockviewDiagnostics.snapshot();
    const dock = document.getElementById('terminalDock');
    const grid = document.getElementById('terminalGrid');
    return {
      panes: document.querySelectorAll('.term-pane').length,
      owned: d.ownedPaneIds,
      live: d.liveTerminals,
      liveIds: d.liveTerminalIds,
      panels: window.__cc.api.panels.map((p) => p.id),
      // The refused pane must exist NOWHERE: not parked in the hidden classic grid, not left in the
      // dock, and not as an empty panel shell.
      panesInGrid: grid.querySelectorAll('.term-pane').length,
      panesInDock: dock.querySelectorAll('.term-pane').length,
      emptyPanelHosts: [...dock.querySelectorAll('.dockview-prototype-pane-host')]
        .filter((h) => h.children.length === 0).length,
      logs: window.__cc.logs().slice(-2500),
    };
  })()`);

  const result = {
    settled, baseline, attempt, after,
    ptyStart: ipc.ptyStart.slice(), ptyKill: ipc.ptyKill.slice(),
  };
  await closeWindow(win);
  return result;
}

/** 6 — the PTY refuses to start AFTER a successful dock: the panel and the pane must both go. */
async function scenarioStartFailure() {
  const win = await openWindow({
    name: 'start-failure',
    ptyStartResult: { ok: false, error: 'harness: synthetic pty-start refusal' },
    ptyStartDelayMs: 150,
  });
  const settled = await run(win, AWAIT_SETTLED);
  const attempt = await run(win, CLICK_NEW_SHELL);
  await run(win, `window.__cc.sleep(700)`);
  const after = await run(win, `(() => {
    const d = window.ccDockviewDiagnostics.snapshot();
    const dock = document.getElementById('terminalDock');
    return {
      panes: document.querySelectorAll('.term-pane').length,
      owned: d.ownedPaneIds,
      live: d.liveTerminals,
      panels: window.__cc.api.panels.map((p) => p.id),
      ghostHosts: [...dock.querySelectorAll('.dockview-prototype-pane-host')]
        .filter((h) => h.children.length === 0).length,
      logs: window.__cc.logs().slice(-2500),
    };
  })()`);
  const result = {
    settled, attempt, after,
    ptyStart: ipc.ptyStart.slice(), ptyKill: ipc.ptyKill.slice(),
  };
  await closeWindow(win);
  return result;
}

/** 7 — Library navigation: add, focus, close, reopen — one singleton, no clone, handlers intact. */
async function scenarioLibrary() {
  const win = await openWindow({ name: 'library' });
  const settled = await run(win, AWAIT_SETTLED);

  const homeIndexBefore = await run(win, `(() => {
    const el = document.getElementById('libraryPane');
    return { index: Array.prototype.indexOf.call(el.parentNode.children, el), parentTag: el.parentNode.tagName };
  })()`);

  const open = await run(win, `(async () => {
    const before = document.getElementById('libraryPane');
    window.__cc.libraryIdentity = before;
    [...document.querySelectorAll('.tab')].find((t) => t.dataset.tab === 'library').click();
    await window.__cc.sleep(250);
    const el = document.getElementById('libraryPane');
    const host = el ? el.parentNode : null;
    return {
      sameElement: el === before,
      count: document.querySelectorAll('#libraryPane').length,
      hostedInPanel: !!(host && String(host.className || '').includes('dockview-prototype-pane-host')),
      inDock: !!(el && el.closest('#terminalDock')),
      terminalsTabActive: [...document.querySelectorAll('.tab')].some((t) => t.dataset.tab === 'terminals' && t.classList.contains('active')),
      visible: window.__cc.reachable(document.getElementById('libRefresh')),
      box: window.__cc.box(el),
      controls: ['libRefresh','libSearch','libMode','libRoute','libOutcome','libDateKind','libSort','libStatus','libList','libReader','libCopy','libMax','libMetaHost','libReportText','libFollowupHost']
        .filter((id) => !!document.getElementById(id)).length,
      panels: window.__cc.api.panels.map((p) => p.id),
    };
  })()`);
  const listAfterOpen = ipc.libraryList;

  const again = await run(win, `(async () => {
    [...document.querySelectorAll('.tab')].find((t) => t.dataset.tab === 'library').click();
    await window.__cc.sleep(250);
    return {
      count: document.querySelectorAll('#libraryPane').length,
      sameElement: document.getElementById('libraryPane') === window.__cc.libraryIdentity,
      panels: window.__cc.api.panels.map((p) => p.id),
      libraryPanels: window.__cc.api.panels.filter((p) => p.id === 'library').length,
      ownedLibrary: window.ccDockviewDiagnostics.snapshot().ownedPaneIds.filter((i) => i === 'library').length,
    };
  })()`);
  const listAfterSecond = ipc.libraryList;

  const closed = await run(win, `(async () => {
    const panel = window.__cc.api.getPanel('library');
    window.__cc.api.removePanel(panel);
    await window.__cc.sleep(250);
    const el = document.getElementById('libraryPane');
    return {
      sameElement: el === window.__cc.libraryIdentity,
      count: document.querySelectorAll('#libraryPane').length,
      index: el ? Array.prototype.indexOf.call(el.parentNode.children, el) : -1,
      parentTag: el ? el.parentNode.tagName : null,
      backOutOfDock: !!(el && !el.closest('#terminalDock')),
      controls: ['libRefresh','libSearch','libMode','libRoute','libOutcome','libDateKind','libSort','libStatus','libList','libReader','libCopy','libMax','libMetaHost','libReportText','libFollowupHost']
        .filter((id) => !!document.getElementById(id)).length,
      owned: window.ccDockviewDiagnostics.snapshot().ownedPaneIds,
      placeholderLeft: /Library home/.test(el && el.parentNode ? el.parentNode.innerHTML : ''),
    };
  })()`);

  // The ⟳ Refresh handler was bound before the round trip; it must still fire on the same node.
  await run(win, `(async () => { document.getElementById('libRefresh').click(); await window.__cc.sleep(300); return true; })()`);
  const listAfterHandlerProbe = ipc.libraryList;

  const reopened = await run(win, `(async () => {
    [...document.querySelectorAll('.tab')].find((t) => t.dataset.tab === 'library').click();
    await window.__cc.sleep(250);
    const el = document.getElementById('libraryPane');
    return {
      sameElement: el === window.__cc.libraryIdentity,
      count: document.querySelectorAll('#libraryPane').length,
      hostedInPanel: !!(el && String(el.parentNode.className || '').includes('dockview-prototype-pane-host')),
      visible: window.__cc.reachable(document.getElementById('libRefresh')),
      owned: window.ccDockviewDiagnostics.snapshot().ownedPaneIds,
    };
  })()`);

  const result = {
    settled, homeIndexBefore, open, again, closed, reopened,
    libraryListCalls: { afterOpen: listAfterOpen, afterSecond: listAfterSecond, afterHandlerProbe: listAfterHandlerProbe },
  };
  await closeWindow(win);
  return result;
}

/** 8 — maximize routes by ownership, and the two mechanisms never both run. */
async function scenarioMaximize() {
  const win = await openWindow({ name: 'maximize' });
  const settled = await run(win, AWAIT_SETTLED);
  await run(win, CLICK_NEW_SHELL);
  await run(win, CLICK_NEW_SHELL);
  await run(win, `window.__cc.sleep(250)`);

  // Split the two panes into separate groups, exactly as a user does by dragging a tab out.
  // Without this they are TABS in one group, only one panel is attached to the document at a time,
  // and "maximize hid the sibling" would be unmeasurable — there would be no visible sibling.
  const split = await run(win, `(async () => {
    const api = window.__cc.api;
    api.getPanel('pty2').api.moveTo({ group: api.getPanel('pty1').api.group, position: 'right' });
    await window.__cc.sleep(300);
    return { groups: api.groups.length, panels: api.panels.map((p) => p.id) };
  })()`);

  // Pane elements are addressed through the panel that owns them, so identity is never guessed
  // from DOM order.
  const PANE_PROBE = `
    const api = window.__cc.api;
    const paneOf = (id) => {
      const p = api.getPanel(id);
      return p && p.api.group && p.api.group.element ? p.api.group.element.querySelector('.term-pane') : null;
    };`;

  const before = await run(win, `(() => {${PANE_PROBE}
    return {
      boxes: { pty1: window.__cc.box(paneOf('pty1')), pty2: window.__cc.box(paneOf('pty2')) },
      hasMaximizedGroup: api.hasMaximizedGroup(),
      owned: window.ccDockviewDiagnostics.snapshot().ownedPaneIds,
      glyphs: { pty1: paneOf('pty1').querySelector('.max').textContent, pty2: paneOf('pty2').querySelector('.max').textContent },
    };
  })()`);

  const maximized = await run(win, `(async () => {${PANE_PROBE}
    paneOf('pty1').querySelector('.max').click();
    await window.__cc.sleep(350);
    const grid = document.getElementById('terminalGrid');
    const p1 = paneOf('pty1');
    const p2 = paneOf('pty2');
    return {
      boxes: { pty1: window.__cc.box(p1), pty2: window.__cc.box(p2) },
      hasMaximizedGroup: api.hasMaximizedGroup(),
      // The CLASSIC maximizer's markers must be absent: it must not have run at all.
      gridHasMaximized: grid.classList.contains('has-maximized'),
      paneHasMaximizedClass: !!(p1 && p1.classList.contains('maximized')),
      glyphs: { pty1: p1 ? p1.querySelector('.max').textContent : null, pty2: p2 ? p2.querySelector('.max').textContent : null },
      logs: window.__cc.logs().slice(-1500),
    };
  })()`);

  const restored = await run(win, `(async () => {${PANE_PROBE}
    paneOf('pty1').querySelector('.max').click();
    await window.__cc.sleep(350);
    return {
      boxes: { pty1: window.__cc.box(paneOf('pty1')), pty2: window.__cc.box(paneOf('pty2')) },
      hasMaximizedGroup: api.hasMaximizedGroup(),
      glyphs: { pty1: paneOf('pty1').querySelector('.max').textContent, pty2: paneOf('pty2').querySelector('.max').textContent },
      gridHasMaximized: document.getElementById('terminalGrid').classList.contains('has-maximized'),
      resizeOwners: window.__cc.owners(),
    };
  })()`);

  const result = { settled, split, before, maximized, restored };
  await closeWindow(win);
  return result;
}

/** 9 — close convergence: whichever direction fires, the PTY is killed exactly once. */
async function scenarioCloseConvergence() {
  const win = await openWindow({ name: 'close-convergence' });
  const settled = await run(win, AWAIT_SETTLED);
  await run(win, CLICK_NEW_SHELL);
  await run(win, CLICK_NEW_SHELL);
  await run(win, `window.__cc.sleep(250)`);

  const killsBeforeX = ipc.ptyKill.length;
  const viaX = await run(win, `(async () => {
    document.querySelectorAll('.term-pane')[0].querySelector('.x').click();
    await window.__cc.sleep(300);
    return {
      panes: document.querySelectorAll('.term-pane').length,
      panels: window.__cc.api.panels.map((p) => p.id),
      owned: window.ccDockviewDiagnostics.snapshot().ownedPaneIds,
      live: window.ccDockviewDiagnostics.snapshot().liveTerminals,
    };
  })()`);
  const killsAfterX = ipc.ptyKill.slice(killsBeforeX);

  const killsBeforePanel = ipc.ptyKill.length;
  const viaPanel = await run(win, `(async () => {
    const panel = window.__cc.api.panels[0];
    window.__cc.api.removePanel(panel);
    await window.__cc.sleep(300);
    return {
      panes: document.querySelectorAll('.term-pane').length,
      panels: window.__cc.api.panels.map((p) => p.id),
      owned: window.ccDockviewDiagnostics.snapshot().ownedPaneIds,
      live: window.ccDockviewDiagnostics.snapshot().liveTerminals,
      emptyState: !!document.getElementById('termEmpty'),
    };
  })()`);
  const killsAfterPanel = ipc.ptyKill.slice(killsBeforePanel);

  const result = { settled, viaX, killsAfterX, viaPanel, killsAfterPanel, allKills: ipc.ptyKill.slice() };
  await closeWindow(win);
  return result;
}

// ---------------------------------------------------------------------------
// PHASE C — the four layout operations, driven through the REAL controls in the REAL renderer.
// ---------------------------------------------------------------------------

/** Click one of the four layout controls by its stable id and wait for the operation to settle. */
const clickLayout = (id) => `(async () => {
  const before = window.__cc.status();
  const btn = document.getElementById(${JSON.stringify(id)});
  if (!btn) return { clicked: false, reason: 'control-missing' };
  const wasDisabled = btn.disabled === true;
  btn.click();
  // Settled = the status changed AND every control is enabled again (the busy state released).
  await window.__cc.waitFor(() => window.__cc.status() !== before && !window.__cc.anyDisabled(), 10000);
  await window.__cc.sleep(120);
  return { clicked: true, wasDisabled, status: window.__cc.status(), panels: window.__cc.panelIds() };
})()`;

/**
 * 11 — Save, Restore, Reset and Clear, end to end, against real panes and a real fromJSON.
 *
 * The arrangement is deliberately CHANGED between save and restore (two panes split into separate
 * groups, then collapsed back into one), so "restored" means the topology actually came back rather
 * than never having moved.
 */
async function scenarioLayoutOperations() {
  const win = await openWindow({ name: 'layout-operations' });
  const settled = await run(win, AWAIT_SETTLED);
  await run(win, CLICK_NEW_SHELL);
  await run(win, CLICK_NEW_SHELL);
  await run(win, `window.__cc.sleep(200)`);

  // Split, so the saved arrangement is distinguishable from the default one.
  const split = await run(win, `(async () => {
    const api = window.__cc.api;
    api.getPanel('pty2').api.moveTo({ group: api.getPanel('pty1').api.group, position: 'right' });
    await window.__cc.sleep(250);
    return { groups: api.groups.length };
  })()`);

  // Tag each live pane element WHILE the panes are in separate groups, so both are attached to the
  // document. Once they share a group only the active tab's content is attached — dockview detaches
  // the rest — and a tag applied then would land on the same node twice.
  const elementIdsBefore = await run(win, `(() => {
    const api = window.__cc.api;
    for (const id of ['pty1', 'pty2']) {
      const el = api.getPanel(id).api.group.element.querySelector('.term-pane');
      if (el && !el.dataset.ccIdentity) el.dataset.ccIdentity = id + '-' + Math.random().toString(36).slice(2);
    }
    return window.__cc.identities();
  })()`);

  const controls = await run(win, `(() => {
    const bar = document.querySelector('.dockview-prototype-controls');
    const buttons = bar ? [...bar.querySelectorAll('button')] : [];
    return {
      ids: buttons.map((b) => b.id),
      labels: buttons.map((b) => b.textContent),
      disabled: buttons.filter((b) => b.disabled).length,
      reachable: buttons.every((b) => window.__cc.reachable(b)),
    };
  })()`);

  const saved = await run(win, clickLayout('dvSaveArrangement'));
  const savedState = {
    layoutSave: ipc.layoutSave,
    ptyStart: ipc.ptyStart.slice(),
    ptyKill: ipc.ptyKill.slice(),
    // What actually crossed to main — asserted against the shared validator by the test.
    payload: ipc.savedLayouts[0] || null,
    groups: await run(win, `window.__cc.api.groups.length`),
  };

  // Move the arrangement AWAY from what was saved, so a restore has real work to do.
  const disturbed = await run(win, `(async () => {
    const api = window.__cc.api;
    api.getPanel('pty2').api.moveTo({ group: api.getPanel('pty1').api.group, position: 'center' });
    await window.__cc.sleep(250);
    return { groups: api.groups.length, panels: window.__cc.panelIds() };
  })()`);

  const restored = await run(win, clickLayout('dvRestoreArrangement'));
  const restoredState = {
    layoutLoad: ipc.layoutLoad,
    ptyStart: ipc.ptyStart.slice(),
    ptyKill: ipc.ptyKill.slice(),
    groups: await run(win, `window.__cc.api.groups.length`),
    identities: await run(win, `window.__cc.identities()`),
    live: await run(win, `window.ccDockviewDiagnostics.snapshot().liveTerminals`),
    owned: await run(win, `window.ccDockviewDiagnostics.snapshot().ownedPaneIds`),
  };

  const reset = await run(win, clickLayout('dvResetArrangement'));
  const resetState = {
    layoutSave: ipc.layoutSave, layoutLoad: ipc.layoutLoad, layoutReset: ipc.layoutReset,
    ptyStart: ipc.ptyStart.slice(),
    ptyKill: ipc.ptyKill.slice(),
    groups: await run(win, `window.__cc.api.groups.length`),
    identities: await run(win, `window.__cc.identities()`),
    owned: await run(win, `window.ccDockviewDiagnostics.snapshot().ownedPaneIds`),
    order: await run(win, `window.__cc.api.groups.map((g) => g.panels.map((p) => p.id)).flat()`),
  };

  const cleared = await run(win, clickLayout('dvClearSaved'));
  const clearedState = {
    layoutReset: ipc.layoutReset,
    fileGone: savedLayout.envelope === null,
    ptyStart: ipc.ptyStart.slice(),
    ptyKill: ipc.ptyKill.slice(),
    owned: await run(win, `window.ccDockviewDiagnostics.snapshot().ownedPaneIds`),
    identities: await run(win, `window.__cc.identities()`),
  };
  // Clearing twice: the second time there is nothing to delete, and that is still a success.
  const clearedAgain = await run(win, clickLayout('dvClearSaved'));

  // With the file gone, Restore must refuse and change nothing.
  const restoreAfterClear = await run(win, clickLayout('dvRestoreArrangement'));
  const afterClearState = {
    owned: await run(win, `window.ccDockviewDiagnostics.snapshot().ownedPaneIds`),
    identities: await run(win, `window.__cc.identities()`),
    ptyKill: ipc.ptyKill.slice(),
  };

  const result = {
    settled, split, controls,
    saved, savedState, disturbed, elementIdsBefore,
    restored, restoredState,
    reset, resetState,
    cleared, clearedState, clearedAgain,
    restoreAfterClear, afterClearState,
    logs: await run(win, `window.__cc.logs().slice(-6000)`),
  };
  await closeWindow(win);
  return result;
}

/**
 * 12 — the pane sets must match EXACTLY, proven in the real app.
 *
 * Save with three panes, close one, then restore: the saved state names a pane that is no longer
 * open, so the restore must refuse before `fromJSON` rather than mounting an empty shell.
 */
async function scenarioExactSet() {
  const win = await openWindow({ name: 'exact-set' });
  const settled = await run(win, AWAIT_SETTLED);
  await run(win, CLICK_NEW_SHELL);
  await run(win, CLICK_NEW_SHELL);
  await run(win, `(async () => {
    [...document.querySelectorAll('.tab')].find((t) => t.dataset.tab === 'library').click();
    await window.__cc.sleep(250);
    return true;
  })()`);
  const savedThree = await run(win, clickLayout('dvSaveArrangement'));

  // (a) SAVED NAMES A PANE THAT IS NOT OPEN — close one and try to restore.
  const closed = await run(win, `(async () => {
    const api = window.__cc.api;
    api.removePanel(api.getPanel('pty2'));
    await window.__cc.sleep(300);
    return { owned: window.ccDockviewDiagnostics.snapshot().ownedPaneIds, panels: window.__cc.panelIds() };
  })()`);
  const killsBefore = ipc.ptyKill.length;
  const savedNotLive = await run(win, clickLayout('dvRestoreArrangement'));
  const savedNotLiveState = {
    panels: await run(win, `window.__cc.panelIds()`),
    owned: await run(win, `window.ccDockviewDiagnostics.snapshot().ownedPaneIds`),
    killsDuring: ipc.ptyKill.length - killsBefore,
    starts: ipc.ptyStart.slice(),
  };

  // (b) A PANE IS OPEN THAT THE SAVED STATE DOES NOT MENTION — save, then add one, then restore.
  await run(win, clickLayout('dvSaveArrangement'));
  await run(win, CLICK_NEW_SHELL);
  const killsBefore2 = ipc.ptyKill.length;
  const liveNotSaved = await run(win, clickLayout('dvRestoreArrangement'));
  const liveNotSavedState = {
    panels: await run(win, `window.__cc.panelIds()`),
    owned: await run(win, `window.ccDockviewDiagnostics.snapshot().ownedPaneIds`),
    killsDuring: ipc.ptyKill.length - killsBefore2,
  };

  const result = {
    settled, savedThree, closed, savedNotLive, savedNotLiveState, liveNotSaved, liveNotSavedState,
    logs: await run(win, `window.__cc.logs().slice(-4000)`),
  };
  await closeWindow(win);
  return result;
}

/**
 * 13 — malformed saved state can never reach `fromJSON`, and a double click cannot overlap.
 *
 * The saved "file" is corrupted directly in the harness's in-memory store, which is exactly what a
 * hand-edited file on disk would look like from the renderer's side.
 */
async function scenarioMalformedAndConcurrency() {
  const win = await openWindow({ name: 'malformed-and-concurrency', layoutIpcDelayMs: 600 });
  const settled = await run(win, AWAIT_SETTLED);
  await run(win, CLICK_NEW_SHELL);
  await run(win, CLICK_NEW_SHELL);
  await run(win, `window.__cc.sleep(200)`);

  // A real save first, so there IS a saved arrangement to corrupt.
  await run(win, clickLayout('dvSaveArrangement'));
  const baseline = { panels: await run(win, `window.__cc.panelIds()`) };

  // --- corrupt the saved state in ways a hand-edited file could ---------------------------------
  const malformed = [];
  const CORRUPTIONS = [
    ['populated-params', (e) => { e.layout.panels.pty1.params = { cwd: 'D:\\Workspace\\secret' }; }],
    ['path-in-title', (e) => { e.layout.panels.pty1.title = 'C:\\Users\\levij\\key'; }],
    ['unknown-component', (e) => { e.layout.panels.pty1.contentComponent = 'iframe'; }],
    ['floating-groups', (e) => { e.layout.floatingGroups = [{}]; }],
    ['wrong-schema-version', (e) => { e.schemaVersion = 99; }],
  ];
  const pristine = JSON.parse(JSON.stringify(savedLayout.envelope));
  for (const [label, corrupt] of CORRUPTIONS) {
    savedLayout.envelope = JSON.parse(JSON.stringify(pristine));
    corrupt(savedLayout.envelope);
    const before = await run(win, `window.__cc.panelIds()`);
    const killsBefore = ipc.ptyKill.length;
    const outcome = await run(win, clickLayout('dvRestoreArrangement'));
    malformed.push({
      label,
      status: outcome.status,
      panelsBefore: before,
      panelsAfter: await run(win, `window.__cc.panelIds()`),
      killsDuring: ipc.ptyKill.length - killsBefore,
    });
  }
  savedLayout.envelope = pristine;

  // --- CONCURRENCY: hammer every control while one operation is still in flight -----------------
  // `layoutIpcDelayMs` holds main's handler open, so the second click genuinely lands mid-operation
  // rather than after it. Both halves are measured: the DOM disables the controls, and the
  // operations themselves refuse.
  const concurrency = await run(win, `(async () => {
    const ids = ['dvSaveArrangement', 'dvRestoreArrangement', 'dvResetArrangement', 'dvClearSaved'];
    const btn = (id) => document.getElementById(id);
    const before = window.__cc.status();
    btn('dvRestoreArrangement').click();
    await window.__cc.sleep(80);                       // inside the 600ms IPC hold
    const midFlight = {
      status: window.__cc.status(),
      allDisabled: ids.every((id) => btn(id).disabled === true),
      disabledCount: ids.filter((id) => btn(id).disabled === true).length,
    };
    // Click EVERY control, repeatedly, while the first one is still running. A disabled button
    // fires no handler, which is the FIRST line of defence.
    for (let i = 0; i < 3; i++) for (const id of ids) btn(id).click();
    await window.__cc.sleep(80);
    const stillMidFlight = { status: window.__cc.status(), allDisabled: ids.every((id) => btn(id).disabled === true) };

    // Now defeat that first line deliberately: force the buttons enabled and click again, so the
    // handlers really do run while an operation is in flight. The SECOND line of defence — the
    // adapter's own exclusivity — must refuse them, visibly.
    for (const id of ids) btn(id).disabled = false;
    for (const id of ids) btn(id).click();
    await window.__cc.sleep(120);
    const forced = { status: window.__cc.status() };
    // The buttons were forced enabled above, so "no control is disabled" is no longer a signal that
    // the operation finished. Wait for the in-flight operation to actually report its own outcome.
    await window.__cc.waitFor(() => !/is still running|Restoring the saved arrangement…/.test(window.__cc.status()), 10000);
    await window.__cc.sleep(200);
    return {
      before, midFlight, stillMidFlight, forced,
      afterStatus: window.__cc.status(),
      allEnabledAfter: ids.every((id) => btn(id).disabled === false),
      panels: window.__cc.panelIds(),
    };
  })()`);

  const result = {
    settled, baseline, malformed, concurrency,
    // Exactly ONE load reached main across the whole concurrency burst that follows the five
    // malformed restores; anything more would mean overlapping operations.
    layoutIpc: { save: ipc.layoutSave, load: ipc.layoutLoad, reset: ipc.layoutReset },
    ptyStart: ipc.ptyStart.slice(),
    ptyKill: ipc.ptyKill.slice(),
    owned: await run(win, `window.ccDockviewDiagnostics.snapshot().ownedPaneIds`),
    logs: await run(win, `window.__cc.logs().slice(-6000)`),
  };
  await closeWindow(win);
  return result;
}

/** 14 — a save that main refuses must not overwrite, and must say so. */
async function scenarioSaveRefused() {
  const win = await openWindow({
    name: 'save-refused',
    saveResult: { ok: false, reason: 'write-failed' },
  });
  const settled = await run(win, AWAIT_SETTLED);
  await run(win, CLICK_NEW_SHELL);
  await run(win, `window.__cc.sleep(200)`);
  const refused = await run(win, clickLayout('dvSaveArrangement'));
  const result = {
    settled, refused,
    fileStillAbsent: savedLayout.envelope === null,
    layoutSave: ipc.layoutSave,
    ptyStart: ipc.ptyStart.slice(),
    ptyKill: ipc.ptyKill.slice(),
    owned: await run(win, `window.ccDockviewDiagnostics.snapshot().ownedPaneIds`),
  };
  await closeWindow(win);
  return result;
}

/** 10 — the acceptance diagnostic is read-only and cannot be substituted. */
async function scenarioDiagnostic() {
  const win = await openWindow({ name: 'diagnostic' });
  await run(win, AWAIT_SETTLED);
  const probe = await run(win, `(() => {
    const original = window.ccDockviewDiagnostics;
    const out = { frozen: Object.isFrozen(original) };
    const d = Object.getOwnPropertyDescriptor(window, 'ccDockviewDiagnostics');
    out.writable = d.writable; out.configurable = d.configurable; out.enumerable = d.enumerable;
    try { window.ccDockviewDiagnostics = { active: () => 'lie' }; out.assignThrew = false; }
    catch (e) { out.assignThrew = true; }
    out.stillOriginal = window.ccDockviewDiagnostics === original;
    try { Object.defineProperty(window, 'ccDockviewDiagnostics', { value: 1 }); out.redefineThrew = false; }
    catch (e) { out.redefineThrew = true; }
    try { original.snapshot = () => 'lie'; out.mutateThrew = false; }
    catch (e) { out.mutateThrew = true; }
    out.snapshotStillFunction = typeof window.ccDockviewDiagnostics.snapshot === 'function';
    return out;
  })()`);
  const result = { probe };
  await closeWindow(win);
  return result;
}

// ---------------------------------------------------------------------------

app.whenReady().then(async () => {
  harnessSession = session.fromPartition('dockview-app-harness', { cache: false });
  harnessSession.webRequest.onBeforeRequest((details, callback) => {
    const allowed = recordRequest(details);
    if (!allowed) { callback({ cancel: true }); return; }
    if (control.cancelPatterns.some((p) => details.url.includes(p))) { callback({ cancel: true }); return; }
    if (control.holdPatterns.some((p) => details.url.includes(p))) { control.held.push({ url: details.url, callback }); return; }
    callback({ cancel: false });
  });

  // --- counting stubs for every channel the real renderer reaches --------------------------------
  ipcMain.handle('get-settings', async () => {
    if (control.settingsGate) await control.settingsGate;
    return { theme: 'obsidian', projectsRoot: 'D:\\Workspace', selectedRepo: '' };
  });
  ipcMain.handle('save-settings', () => ({ ok: true }));
  ipcMain.handle('list-repos', () => ({ repos: [], selectedRepo: '' }));
  ipcMain.handle('list-worktrees', () => []);
  ipcMain.handle('repo-github-url', () => '');
  ipcMain.handle('get-gemini-key-status', () => ({ hasKey: true }));
  ipcMain.handle('tlog-reset', () => ({ ok: true }));
  ipcMain.handle('pty-start', async (_e, o) => {
    ipc.ptyStart.push((o && o.id) || 'unknown');
    if (control.ptyStartDelayMs) await new Promise((r) => setTimeout(r, control.ptyStartDelayMs));
    return control.ptyStartResult;
  });
  ipcMain.on('pty-kill', (_e, id) => { ipc.ptyKill.push(id); });
  ipcMain.on('pty-write', () => { ipc.ptyWrite++; });
  ipcMain.on('pty-resize', () => { ipc.ptyResize++; });
  ipcMain.handle('library-list', () => {
    ipc.libraryList++;
    return { ok: true, entries: [], total: 0, invalidCount: 0, invalid: [], capExceeded: false };
  });
  ipcMain.handle('library-read', () => { ipc.libraryRead++; return { ok: false, status: 'not-persisted' }; });
  ipcMain.handle('library-open-report', () => { ipc.libraryOpenReport++; return { ok: false, status: 'not-persisted' }; });
  ipcMain.handle('library-followup', () => ({ ok: false, error: 'harness' }));
  ipcMain.handle('clipboard-read', () => ({ ok: true, text: '' }));
  ipcMain.handle('clipboard-write', () => ({ ok: true }));
  ipcMain.handle('open-external', () => ({ ok: true }));
  // ---- the layout boundary, exercised through the REAL shared policy ---------------------------
  // These stubs stand in for main's handlers, and they run the SAME `dockview-layout-store` code
  // main runs — validate on write, validate on read — against an in-memory file. That keeps a gate
  // run away from the real userData path while still proving the renderer talks to a validating
  // boundary rather than a permissive one.
  const layoutStore = require('./dockview-layout-store');
  const delayLayoutIpc = () => (control.layoutIpcDelayMs
    ? new Promise((r) => setTimeout(r, control.layoutIpcDelayMs)) : Promise.resolve());

  ipcMain.handle('dockview-layout-save', async (_e, layout) => {
    ipc.layoutSave++;
    ipc.savedLayouts.push(layout);
    await delayLayoutIpc();
    if (control.saveResult) return control.saveResult;
    const envelope = layoutStore.buildEnvelope(layout);
    const verdict = layoutStore.validateEnvelope(envelope);
    if (!verdict.ok) return { ok: false, reason: verdict.reason };
    savedLayout.envelope = JSON.parse(JSON.stringify(envelope));   // through JSON, exactly as a file is
    return { ok: true, savedAt: envelope.savedAt };
  });
  ipcMain.handle('dockview-layout-load', async () => {
    ipc.layoutLoad++;
    await delayLayoutIpc();
    if (!savedLayout.envelope) return { ok: false, reason: layoutStore.REASON.NOT_FOUND };
    const verdict = layoutStore.validateEnvelope(savedLayout.envelope);
    if (!verdict.ok) return { ok: false, reason: verdict.reason };
    return { ok: true, envelope: verdict.envelope };
  });
  ipcMain.handle('dockview-layout-reset', async () => {
    ipc.layoutReset++;
    await delayLayoutIpc();
    const existed = savedLayout.envelope !== null;
    savedLayout.envelope = null;
    return { ok: true, existed };
  });

  const ORDER = [
    ['production', scenarioProduction],
    ['classic', scenarioClassic],
    ['scriptRefusal', scenarioScriptRefusal],
    ['adoptionRollback', scenarioAdoptionRollback],
    ['newPaneTransaction', scenarioNewPaneTransaction],
    ['startFailure', scenarioStartFailure],
    ['library', scenarioLibrary],
    ['maximize', scenarioMaximize],
    ['closeConvergence', scenarioCloseConvergence],
    ['diagnostic', scenarioDiagnostic],
    ['layoutOperations', scenarioLayoutOperations],
    ['exactSet', scenarioExactSet],
    ['malformedAndConcurrency', scenarioMalformedAndConcurrency],
    ['saveRefused', scenarioSaveRefused],
  ];

  // A global watchdog: a harness that hangs must still produce a report naming the step it hung on,
  // because a silent 10-minute stall is indistinguishable from a broken gate.
  const watchdog = setTimeout(() => {
    emit({
      ok: false,
      fatal: { scenario: 'watchdog', error: 'the harness exceeded its overall budget' },
      scenarios, consoleMessages: consoleMessages.slice(0, 400),
      requests: summarize(), remoteRequestCount: observed.filter((r) => r.scheme !== 'file').length,
    }, 1);
  }, 8 * 60 * 1000);

  // `--only=a,b` runs a subset. Development aid only: the test always runs the whole set, and
  // asserts that every scenario it expects is present in the report.
  const onlyArg = process.argv.find((a) => a.startsWith('--only='));
  const only = onlyArg ? onlyArg.slice('--only='.length).split(',') : null;

  for (const [name, fn] of ORDER) {
    if (only && !only.includes(name)) continue;
    progress(`scenario ${name}: START`);
    try {
      scenarios[name] = await fn();
      progress(`scenario ${name}: DONE`);
    } catch (e) {
      fatal = { scenario: name, error: String((e && e.message) || e) };
      progress(`scenario ${name}: FAILED — ${fatal.error}`);
      await closeWindow(currentWindow);
      break;
    }
  }
  clearTimeout(watchdog);

  emit({
    ok: fatal === null,
    fatal,
    scenarios,
    consoleMessages: consoleMessages.slice(0, 400),
    requests: summarize(),
    remoteRequestCount: observed.filter((r) => r.scheme !== 'file').length,
  }, fatal === null ? 0 : 1);
});
