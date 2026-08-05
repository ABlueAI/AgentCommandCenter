// Dockview BOOTSTRAP harness — real-browser regression gate (prototype branch only).
//
// WHY THIS EXISTS, AND WHY IT IS NOT THE TRIPWIRE.
//
// `dockview-tripwire.js` loads the VENDOR BUNDLE AND NOTHING ELSE, on purpose: it is the evidence
// that network behaviour is attributable to Dockview rather than to our integration code. It must
// stay that way, so this is a separate harness with a separate page, partition, and purpose.
//
// This harness exists because round 3 shipped a prototype that passed 1,850 Node assertions and
// then could not start in a real renderer at all. Every helper was proven under `require`, where
// each file gets its OWN module scope. Classic browser scripts share ONE global lexical
// environment, and in that environment:
//
//   * renderer/agent-dom.js already declares a top-level `const api`;
//   * both Dockview policy modules also declared a top-level `const api`;
//   * so both policy scripts died at PARSE time with
//     "Uncaught SyntaxError: Identifier 'api' has already been declared";
//   * dockview-prototype.js then evaluated `window.X || require('...')`, and with the globals
//     missing it reached `require`, which does not exist under `nodeIntegration: false`, giving
//     "Uncaught ReferenceError: require is not defined";
//   * app.js had already created the full-screen `.dockview-prototype-root` overlay, so the user
//     saw an opaque rectangle over a working application.
//
// A Node test cannot see any of that. This harness therefore runs the REAL files, as REAL classic
// scripts, in the REAL order, in a context-isolated, sandboxed, node-integration-free renderer
// under a CSP stricter than the app's — and only then drives the REAL bootstrap.
//
// It loads agent-dom.js FIRST, deliberately: without that pre-existing top-level `const api` the
// collision does not occur and the gate would prove nothing.
//
// Output is a single JSON document on stdout so a test can consume it without scraping logs.

const { app, BrowserWindow, session } = require('electron');
const path = require('path');

const HARNESS_FILE = path.join(__dirname, 'dockview-bootstrap-harness.html');
const STEP_TIMEOUT_MS = 20000;

/** Requests observed during the run. Metadata only — never a full URL, query, or path. */
const observed = [];
/** Console output from the page. This is the surface the original defect actually appeared on. */
const consoleMessages = [];

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

function emit(payload, code) {
  process.stdout.write(JSON.stringify(payload, null, 2) + '\n');
  app.exit(code);
}

function fail(stage, message) {
  emit({
    ok: false,
    stage,
    error: String(message),
    consoleMessages,
    requests: summarize(),
    remoteRequestCount: observed.filter((r) => r.scheme !== 'file').length,
  }, 1);
}

// ---------------------------------------------------------------------------
// PAGE-SIDE SOURCES. Kept as strings so it is unambiguous that they run in the PAGE, not in main.
// ---------------------------------------------------------------------------

// Installed BEFORE any chain script, so a parse-time failure is captured rather than merely
// printed. The `require` accessor both records an attempt and reproduces the real renderer's
// behaviour (a throwing ReferenceError), so the old fallback shape fails here loudly.
const INSTALL_PROBE = `(() => {
  window.__ccHarness = { errors: [], rejections: [], requireTouched: false };
  window.addEventListener('error', (e) => {
    window.__ccHarness.errors.push(String((e && e.message) || 'error'));
  });
  window.addEventListener('unhandledrejection', (e) => {
    const r = e && e.reason;
    window.__ccHarness.rejections.push(String((r && r.message) || r || 'rejection'));
  });
  try {
    Object.defineProperty(window, 'require', {
      configurable: true,
      get() {
        window.__ccHarness.requireTouched = true;
        throw new ReferenceError('require is not defined');
      },
    });
  } catch (e) {
    window.__ccHarness.errors.push('probe-install-failed');
  }
  return { installed: true, requireIsOwnProperty: Object.prototype.hasOwnProperty.call(window, 'require') };
})()`;

// The exact chain, in the exact order, injected exactly as app.js injects it: dynamically created
// classic <script src> elements. agent-dom.js leads so the shared-global collision is live.
const LOAD_CHAIN = `(async () => {
  const load = (src) => new Promise((resolve) => {
    const el = document.createElement('script');
    el.src = src;
    el.onload = () => resolve({ src, fetched: true });
    el.onerror = () => resolve({ src, fetched: false });
    document.head.appendChild(el);
  });
  const chain = [
    'renderer/agent-dom.js',
    'node_modules/dockview/dist/dockview.js',
    'renderer/dockview-fit-policy.js',
    'renderer/dockview-panel-policy.js',
    'renderer/dockview-prototype.js',
  ];
  const results = [];
  for (const src of chain) results.push(await load(src));
  return {
    results,
    exports: {
      dockview: !!(window.dockview && typeof window.dockview.createDockview === 'function'),
      ccDockviewFitPolicy: !!(window.ccDockviewFitPolicy && typeof window.ccDockviewFitPolicy.createFitController === 'function'),
      ccDockviewPanelPolicy: !!(window.ccDockviewPanelPolicy && typeof window.ccDockviewPanelPolicy.shouldLoadDockview === 'function'),
      ccDockviewPrototype: !!(window.ccDockviewPrototype && typeof window.ccDockviewPrototype.activate === 'function'),
      ccDockviewPrototypeBootstrap: !!(window.ccDockviewPrototype && typeof window.ccDockviewPrototype.bootstrap === 'function'),
      agentDom: !!(window.agentDom && typeof window.agentDom.el === 'function'),
    },
    probe: window.__ccHarness,
  };
})()`;

// Drives the REAL bootstrap through every failure path and then the success path. Failure paths run
// FIRST, from a clean DOM, so "no overlay was left behind" is measured before anything succeeds.
const DRIVE_BOOTSTRAP = `(() => {
  const doc = document;
  const win = window;
  const ROOT_ID = 'dockviewPrototypeRoot';
  const proto = win.ccDockviewPrototype;   // held locally so the global can be removed in a scenario
  const out = { scenarios: [], logs: [], hostCalls: null, success: null };

  const hostCalls = { createTerminalPane: 0, createLibraryPane: 0, closePane: 0 };
  const log = (l) => out.logs.push(String(l));

  function makeInertHost(container, opts) {
    const o = opts || {};
    const paneEls = new Map();
    for (const id of ['pty1', 'pty2', 'library']) {
      const d = doc.createElement('div');
      d.style.width = '300px';
      d.style.height = '200px';
      doc.body.appendChild(d);
      paneEls.set(id, d);
    }
    return {
      bridge: { enabled: o.enabled === false ? false : true },
      getDockviewGlobal: () => {
        if (o.throwOnGlobal) throw new Error('synthetic activation failure with a panel id pty1 inside');
        return win.dockview;
      },
      getContainer: () => container,
      log,
      isTerminalPane: (id) => id !== 'library' && paneEls.has(id),
      getPaneElement: (id) => paneEls.get(id) || null,
      getTerminalBody: (id) => paneEls.get(id) || null,
      fitTerminal: () => {},
      measureTerminal: () => ({ cols: 80, rows: 24 }),
      sendResize: () => {},
      suspendAppResizeObserver: () => {},
      focusPane: () => {},
      createTerminalPane: async () => { hostCalls.createTerminalPane++; return null; },
      createLibraryPane: () => { hostCalls.createLibraryPane++; return null; },
      closePane: () => { hostCalls.closePane++; },
    };
  }

  function cleanRoot() {
    const r = doc.getElementById(ROOT_ID);
    if (r && r.parentNode) r.parentNode.removeChild(r);
    win.ccDockviewPrototypeInstance = undefined;
  }

  // "Unobscured" is measured, not assumed: what is actually the topmost element at the centre of
  // the viewport? A surviving .dockview-prototype-root would be, because it is fixed/inset-0/z-9000.
  function appSurfaceOnTop() {
    const surface = doc.getElementById('appSurface');
    if (!surface) return false;
    const top = doc.elementFromPoint(Math.floor(win.innerWidth / 2), Math.floor(win.innerHeight / 2));
    return !!top && (top === surface || surface.contains(top));
  }

  function record(name, result) {
    const root = doc.getElementById(ROOT_ID);
    out.scenarios.push({
      name,
      ok: !!(result && result.ok),
      reason: (result && result.reason) || null,
      rootPresent: !!root,
      rootChildCount: root ? root.children.length : 0,
      instancePublished: win.ccDockviewPrototypeInstance !== undefined && win.ccDockviewPrototypeInstance !== null,
      appSurfacePresent: !!doc.getElementById('appSurface'),
      appSurfaceOnTop: appSurfaceOnTop(),
    });
  }

  function run(name, mutate, restore, hostOpts) {
    cleanRoot();
    let saved;
    try { saved = mutate(); } catch (e) { /* recorded via the scenario result */ }
    let result;
    try {
      result = proto.bootstrap({ win, doc, log, buildHost: (c) => makeInertHost(c, hostOpts) });
    } catch (e) {
      result = { ok: false, reason: 'bootstrap-THREW:' + String((e && e.message) || e) };
    }
    record(name, result);
    try { restore(saved); } catch (e) { /* nothing to do */ }
    cleanRoot();
  }

  // 1 — a policy module that never published its export
  run('missing-fit-policy',
    () => { const s = win.ccDockviewFitPolicy; delete win.ccDockviewFitPolicy; return s; },
    (s) => { win.ccDockviewFitPolicy = s; });

  // 2 — the other policy module
  run('missing-panel-policy',
    () => { const s = win.ccDockviewPanelPolicy; delete win.ccDockviewPanelPolicy; return s; },
    (s) => { win.ccDockviewPanelPolicy = s; });

  // 3 — the adapter global itself absent (bootstrap is held locally, so it can still be called)
  run('missing-adapter',
    () => { const s = win.ccDockviewPrototype; delete win.ccDockviewPrototype; return s; },
    (s) => { win.ccDockviewPrototype = s; });

  // 3b — the vendor bundle absent
  run('missing-dockview-bundle',
    () => { const s = win.dockview; delete win.dockview; return s; },
    (s) => { win.dockview = s; });

  // 4 — activation throws
  run('activation-throws', () => null, () => {}, { throwOnGlobal: true });

  // 5 — activation returns { ok: false }
  run('activation-refused', () => null, () => {}, { enabled: false });

  // 11 — the success path, last, from a clean DOM
  cleanRoot();
  let successResult;
  try {
    successResult = proto.bootstrap({ win, doc, log, buildHost: (c) => makeInertHost(c) });
  } catch (e) {
    successResult = { ok: false, reason: 'bootstrap-THREW:' + String((e && e.message) || e) };
  }
  record('success', successResult);

  const root = doc.getElementById(ROOT_ID);
  const banner = root ? root.querySelector('.dockview-prototype-banner') : null;
  const buttons = root ? [...root.querySelectorAll('.dockview-prototype-controls button')].map((b) => b.textContent) : [];
  out.success = {
    rootPresent: !!root,
    rootChildCount: root ? root.children.length : 0,
    bannerText: banner ? banner.textContent : null,
    buttons,
    instancePublished: !!win.ccDockviewPrototypeInstance,
    instanceOk: !!(win.ccDockviewPrototypeInstance && win.ccDockviewPrototypeInstance.ok === true),
    // The prototype root is SUPPOSED to be on top once it started successfully.
    rootOnTop: (() => {
      const top = doc.elementFromPoint(Math.floor(win.innerWidth / 2), Math.floor(win.innerHeight / 2));
      return !!(root && top && (top === root || root.contains(top)));
    })(),
  };

  // Tear the successful instance down so the harness leaves nothing running.
  try { if (win.ccDockviewPrototypeInstance && win.ccDockviewPrototypeInstance.dispose) win.ccDockviewPrototypeInstance.dispose(); } catch (e) {}

  out.hostCalls = hostCalls;
  out.probe = win.__ccHarness;
  return out;
})()`;

// ---------------------------------------------------------------------------

app.whenReady().then(async () => {
  // Dedicated partition — this harness must not share or contaminate the app's session, nor the
  // tripwire's.
  const ses = session.fromPartition('dockview-bootstrap-harness', { cache: false });

  ses.webRequest.onBeforeRequest((details, callback) => {
    const allowed = recordRequest(details);
    callback({ cancel: !allowed });
  });

  const win = new BrowserWindow({
    show: false,
    width: 1280,
    height: 860,
    webPreferences: {
      session: ses,
      contextIsolation: true,    // same posture as the real app
      nodeIntegration: false,    // the whole point: `require` must be unreachable
      sandbox: true,
    },
  });

  win.webContents.on('console-message', (_e, level, message, line, sourceId) => {
    // Source is reduced to a basename: no full path leaves this harness.
    const file = String(sourceId || '').split('/').pop().split('\\').pop();
    consoleMessages.push({ level, message: String(message), line, file });
  });
  win.webContents.on('render-process-gone', (_e, d) => fail('render-process-gone', (d && d.reason) || 'unknown'));

  const step = async (stage, source) => {
    try {
      return await Promise.race([
        win.webContents.executeJavaScript(source, true),
        new Promise((_, reject) => setTimeout(() => reject(new Error(stage + ' timed out')), STEP_TIMEOUT_MS)),
      ]);
    } catch (e) {
      return fail(stage, (e && e.message) || e);
    }
  };

  try {
    await win.loadFile(HARNESS_FILE);
  } catch (e) {
    return fail('loadFile', (e && e.message) || e);
  }

  const probe = await step('install-probe', INSTALL_PROBE);
  if (!probe || probe.installed !== true) return fail('install-probe', 'probe did not install');

  const chain = await step('load-chain', LOAD_CHAIN);
  const drive = await step('drive-bootstrap', DRIVE_BOOTSTRAP);

  const remoteRequestCount = observed.filter((r) => r.scheme !== 'file').length;
  emit({
    ok: true,                 // "the harness ran"; the TEST decides pass/fail from the data below
    chain,
    drive,
    consoleMessages,
    requests: summarize(),
    remoteRequestCount,
  }, 0);
});
