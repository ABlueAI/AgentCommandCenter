// Dockview BOOTSTRAP harness — real-browser regression gate for the adapter's own bootstrap.
//
// WHY THIS EXISTS, AND WHY IT IS NEITHER OF THE OTHER TWO HARNESSES.
//
//   * `dockview-tripwire.js` loads the VENDOR BUNDLE AND NOTHING ELSE, on purpose: it is the
//     evidence that network behaviour is attributable to Dockview rather than to our integration
//     code. It must stay uncontaminated.
//   * `dockview-app-harness.js` loads the WHOLE APPLICATION — real index.html, real preload, real
//     app.js — and proves production behaviour end to end.
//   * THIS harness sits between them. It drives the ADAPTER'S bootstrap directly, against a
//     synthetic host, through every FAILURE path — including several that cannot be produced from
//     the application (a policy module that published nothing, an activation that throws, a missing
//     dock container). It is the only place those refusals can be exercised at all.
//
// It exists because round 3 of the prototype shipped code that passed 1,850 Node assertions and
// then could not start in a real renderer. Every helper was proven under `require`, where each file
// gets its OWN module scope. Classic browser scripts share ONE global lexical environment, and
// there:
//
//   * renderer/agent-dom.js already declares a top-level `const api`;
//   * both Dockview policy modules also declared a top-level `const api`;
//   * so both policy scripts died at PARSE time with
//     "Uncaught SyntaxError: Identifier 'api' has already been declared";
//   * dockview-prototype.js then evaluated `window.X || require('...')`, and with the globals
//     missing it reached `require`, which does not exist under `nodeIntegration: false`, giving
//     "Uncaught ReferenceError: require is not defined".
//
// A Node test cannot see any of that. This harness therefore runs the REAL files, as REAL classic
// scripts, in the REAL order, in a context-isolated, sandboxed, node-integration-free renderer
// under a CSP stricter than the app's — and only then drives the REAL bootstrap.
//
// It loads agent-dom.js FIRST, deliberately: without that pre-existing top-level `const api` the
// collision does not occur and the gate would prove nothing.
//
// PRODUCTION SURFACE. The bootstrap binds to the EMBEDDED `#terminalDock` that index.html ships.
// It never creates a container and never creates a full-screen root, so every scenario below
// measures whether the app surface stayed usable — including the SUCCESS path, where a started
// engine must still not cover the toolbar.
//
// Output is a single JSON document on stdout so a test can consume it without scraping logs.

const { app, BrowserWindow, session } = require('electron');
const path = require('path');
const fs = require('fs');

const HARNESS_FILE = path.join(__dirname, 'dockview-bootstrap-harness.html');
const INDEX_FILE = path.join(__dirname, 'renderer', 'index.html');
const STEP_TIMEOUT_MS = 20000;

// The canonical Library controls. Human acceptance failed because Add Library resolved a
// NONEXISTENT `#libraryPanel` to null and silently discarded the click, so this harness must prove
// it drives the GENUINE Library surface — not a fixture that merely looks like one.
const LIBRARY_CONTROL_IDS = [
  'libRefresh', 'libSearch', 'libMode', 'libRoute', 'libOutcome', 'libDateKind', 'libSort',
  'libStatus', 'libList', 'libReader', 'libCopy', 'libMax', 'libMetaHost', 'libReportText',
  'libFollowupHost',
];

/**
 * Extract the REAL Library section from app/renderer/index.html.
 *
 * Deliberately NOT a copied fixture: a copy drifts from production silently, and the defect this
 * seam corrects was the prototype pointing at markup that did not exist. This THROWS rather than
 * degrading — no fallback markup, no silent substitution — so a renamed id or a removed control
 * fails the gate loudly instead of being papered over.
 */
function extractLibrarySection() {
  const html = fs.readFileSync(INDEX_FILE, 'utf8');
  const matches = html.match(/<section\s+id="libraryPane"[^>]*>/g) || [];
  if (matches.length !== 1) {
    throw new Error(`expected exactly one #libraryPane section in index.html, found ${matches.length}`);
  }
  const start = html.indexOf(matches[0]);
  const end = html.indexOf('</section>', start);
  if (end === -1) throw new Error('#libraryPane section is not closed');
  const section = html.slice(start, end + '</section>'.length);
  // A nested <section> would make the naive close-tag search wrong; refuse rather than guess.
  if (/<section\b/.test(section.slice(matches[0].length))) {
    throw new Error('#libraryPane contains a nested <section>; extraction would be ambiguous');
  }
  const missing = LIBRARY_CONTROL_IDS.filter((id) => !new RegExp(`id="${id}"`).test(section));
  if (missing.length > 0) {
    throw new Error(`#libraryPane is missing canonical control(s): ${missing.join(', ')}`);
  }
  if (!/data-pane="library"/.test(section) || !/class="tabpane"/.test(section)) {
    throw new Error('#libraryPane is no longer the tabpane Library surface');
  }
  return section;
}

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

/**
 * Drive the adapter against the GENUINE Library section in a real renderer.
 *
 * The section is injected verbatim from index.html (never a copy maintained here), into a stand-in
 * tab strip alongside a sibling, so "returned to its exact original position" is checkable by index
 * and not merely by parent. The host's dock/undock mirror app.js's placeholder contract; app.js
 * owns the production implementation, `dockview-default-path.test.js` pins that the two agree, and
 * `dockview-app-integration.test.js` proves the production one end to end.
 */
function buildLibraryFlow(sectionHtml) {
  return `(() => {
  const doc = document;
  const out = { steps: [] };
  const record = (name, data) => { out.steps.push(Object.assign({ name }, data)); };
  try {
    // --- build a stand-in tab strip holding the REAL Library section between two siblings -------
    const strip = doc.createElement('main');
    strip.id = 'harnessTabStrip';
    const before = doc.createElement('section'); before.className = 'tabpane'; before.setAttribute('data-pane', 'terminals');
    const after = doc.createElement('section'); after.className = 'tabpane'; after.setAttribute('data-pane', 'logs');
    strip.appendChild(before);
    strip.insertAdjacentHTML('beforeend', ${JSON.stringify(sectionHtml)});
    strip.appendChild(after);
    doc.body.appendChild(strip);

    const libraryEl = doc.querySelector('#libraryPane');
    out.selectorResolves = !!libraryEl;
    out.legacySelectorResolves = !!doc.getElementById('libraryPanel');   // negative control
    if (!libraryEl) return out;

    out.controlsPresent = ${JSON.stringify(LIBRARY_CONTROL_IDS)}
      .filter((id) => !!libraryEl.querySelector('#' + id));
    out.homeIndexBefore = Array.prototype.indexOf.call(strip.children, libraryEl);

    // --- host mirroring app.js's placeholder dock contract --------------------------------------
    let placeholder = null;
    let dockedEl = null;
    const paneEls = new Map();
    for (const id of ['pty1', 'pty2']) {
      const d = doc.createElement('div');
      d.style.width = '300px'; d.style.height = '200px';
      doc.body.appendChild(d);
      paneEls.set(id, d);
    }
    const logs = [];
    // The EMBEDDED production container, emptied first so the flow starts from a clean surface.
    const container = doc.getElementById('terminalDock');
    while (container.firstChild) container.removeChild(container.firstChild);

    const host = {
      bridge: { enabled: true, saveLayout: async () => ({ ok: true, savedAt: 'x' }), loadLayout: async () => ({ ok: false, reason: 'no-saved-layout' }), resetLayout: async () => ({ ok: true }) },
      getDockviewGlobal: () => window.dockview,
      getContainer: () => container,
      log: (l) => logs.push(String(l)),
      isTerminalPane: (id) => paneEls.has(id),
      getPaneElement: (id) => (id === 'library' ? doc.querySelector('#libraryPane') : (paneEls.get(id) || null)),
      getTerminalBody: (id) => paneEls.get(id) || null,
      fitTerminal: () => {}, measureTerminal: () => ({ cols: 80, rows: 24 }), sendResize: () => {},
      suspendAppResizeObserver: () => {}, resumeAppResizeObserver: () => {}, focusPane: () => {},
      createTerminalPane: async () => null,
      closePane: () => {},
      // Mirrors app.js's contract, INCLUDING the held reference: the adapter detaches the pane from
      // the document before releasing it, so a querySelector lookup at undock time returns null.
      dockLibrary: () => {
        const el = doc.querySelector('#libraryPane') || dockedEl;
        if (!el) return null;
        if (placeholder) return el;
        placeholder = doc.createComment('dockview-prototype: Library home');
        el.parentNode.insertBefore(placeholder, el);
        dockedEl = el;
        return el;
      },
      undockLibrary: () => {
        const el = dockedEl || doc.querySelector('#libraryPane');
        const p = placeholder; placeholder = null; dockedEl = null;
        if (!el || !p || !p.parentNode) return false;
        p.parentNode.insertBefore(el, p);
        p.parentNode.removeChild(p);
        return true;
      },
      isLibraryDocked: () => placeholder !== null,
      liveTerminalCount: () => paneEls.size,
      liveTerminalIds: () => [...paneEls.keys()],
    };

    const instance = window.ccDockviewPrototype.activate(host);
    out.activated = !!(instance && instance.ok);
    if (!out.activated) { out.logs = logs; return out; }

    // --- 1. Add Library --------------------------------------------------------------------------
    const first = instance.addPane('library', 'library');
    const panelHost = libraryEl.parentNode;
    const rect = libraryEl.getBoundingClientRect();
    record('add', {
      ok: first.ok,
      reason: first.reason || null,
      hostedInPanel: !!(panelHost && String(panelHost.className || '').indexOf('dockview-prototype-pane-host') !== -1),
      controlsStillPresent: ${JSON.stringify(LIBRARY_CONTROL_IDS)}.filter((id) => !!libraryEl.querySelector('#' + id)).length,
      // Visible even though NO tab is active: the docked-Library CSS must beat .tabpane{display:none}.
      tabActiveClass: libraryEl.classList.contains('active'),
      width: Math.round(rect.width), height: Math.round(rect.height),
      sameElement: doc.querySelector('#libraryPane') === libraryEl,
    });

    // --- 2. duplicate Add ------------------------------------------------------------------------
    const dup = instance.addPane('library', 'library');
    record('duplicate', {
      ok: dup.ok, reason: dup.reason || null, focused: dup.focused === true,
      panelCount: doc.querySelectorAll('#libraryPane').length,
      ownedLibraryCount: instance.ownedPaneIds().filter((id) => id === 'library').length,
    });

    // --- 3. close -> must return the IDENTICAL element to its exact original index ---------------
    const panel = instance.api().getPanel('library');
    instance.api().removePanel(panel);
    const backEl = doc.querySelector('#libraryPane');
    record('close', {
      sameElement: backEl === libraryEl,
      homeIndexAfter: Array.prototype.indexOf.call(strip.children, backEl),
      backInStrip: backEl && backEl.parentNode === strip,
      owned: instance.ownedPaneIds().includes('library'),
      controlsIntact: ${JSON.stringify(LIBRARY_CONTROL_IDS)}.filter((id) => !!backEl.querySelector('#' + id)).length,
    });

    // --- 4. re-add ------------------------------------------------------------------------------
    const readd = instance.addPane('library', 'library');
    record('readd', {
      ok: readd.ok, reason: readd.reason || null,
      sameElement: doc.querySelector('#libraryPane') === libraryEl,
      owned: instance.ownedPaneIds().includes('library'),
    });

    instance.dispose();
    if (strip.parentNode) strip.parentNode.removeChild(strip);
    out.logs = logs;
    return out;
  } catch (e) {
    out.error = String((e && e.message) || e);
    return out;
  }
})()`;
}

// Drives the REAL bootstrap through every failure path and then the success path. Failure paths run
// FIRST, from a clean dock, so "nothing was left behind" is measured before anything succeeds.
const DRIVE_BOOTSTRAP = `(() => {
  const doc = document;
  const win = window;
  const DOCK_ID = 'terminalDock';
  const proto = win.ccDockviewPrototype;   // held locally so the global can be removed in a scenario
  const out = { scenarios: [], logs: [], hostCalls: null, success: null };

  const hostCalls = { createTerminalPane: 0, closePane: 0, suspendResize: 0, resumeResize: 0 };
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
      suspendAppResizeObserver: () => { hostCalls.suspendResize++; },
      resumeAppResizeObserver: () => { hostCalls.resumeResize++; },
      focusPane: () => {},
      createTerminalPane: async () => { hostCalls.createTerminalPane++; return null; },
      closePane: () => { hostCalls.closePane++; },
      dockLibrary: () => paneEls.get('library') || null,
      undockLibrary: () => true,
      isLibraryDocked: () => false,
      liveTerminalCount: () => 2,
      liveTerminalIds: () => ['pty1', 'pty2'],
    };
  }

  function dock() { return doc.getElementById(DOCK_ID); }
  function cleanDock() {
    const d = dock();
    if (d) { while (d.firstChild) d.removeChild(d.firstChild); }
  }

  // "Unobscured" is measured, not assumed: what is actually the topmost element at the centre of
  // the viewport, and at the Dictate button's own centre? A position:fixed inset:0 z-index:9000
  // overlay would be both, which is exactly the prototype defect that is gone.
  function topmostIsInsideAppSurface() {
    const surface = doc.getElementById('appSurface');
    if (!surface) return false;
    const top = doc.elementFromPoint(Math.floor(win.innerWidth / 2), Math.floor(win.innerHeight / 2));
    return !!top && (top === surface || surface.contains(top));
  }
  function reachable(el) {
    if (!el || !el.isConnected) return false;
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return false;
    const top = doc.elementFromPoint(Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2));
    return !!top && (top === el || el.contains(top));
  }

  function record(name, result) {
    const d = dock();
    const bar = doc.getElementById('harnessTermBar');
    const audio = doc.querySelector('.tts-controls');
    out.scenarios.push({
      name,
      ok: !!(result && result.ok),
      reason: (result && result.reason) || null,
      // The container is never removed — it is markup. What matters is whether anything was left
      // INSIDE it, and whether any overlay was created anywhere in the document.
      dockPresent: !!d,
      dockChildCount: d ? d.children.length : -1,
      overlayCount: doc.querySelectorAll('.dockview-prototype-root').length,
      fixedPositionCount: [...doc.body.querySelectorAll('*')]
        .filter((el) => getComputedStyle(el).position === 'fixed').length,
      // The prototype published its instance on the window, where the app's close path read it as
      // an authority. Production returns it instead, so this must be undefined on EVERY path.
      instancePublished: win.ccDockviewPrototypeInstance !== undefined && win.ccDockviewPrototypeInstance !== null,
      appSurfacePresent: !!doc.getElementById('appSurface'),
      appSurfaceOnTop: topmostIsInsideAppSurface(),
      // The audio controls are the app's, always, on every path — the adapter has no knowledge of
      // them at all now, so they must never move, never duplicate, and never become unreachable.
      audioCount: doc.querySelectorAll('.tts-controls').length,
      audioInTermBar: !!(audio && bar && audio.parentNode === bar),
      micReachable: reachable(doc.getElementById('sttMic')),
    });
  }

  function run(name, mutate, restore, hostOpts) {
    cleanDock();
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
    cleanDock();
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

  // 6 — the EMBEDDED container is missing from the markup. The bootstrap must refuse rather than
  // invent one: a silently-created container is how a dead layout ends up covering a working app.
  run('dock-container-missing',
    () => {
      const d = dock();
      const parent = d.parentNode;
      const next = d.nextSibling;
      parent.removeChild(d);
      return { d, parent, next };
    },
    (s) => { if (s && s.parent) s.parent.insertBefore(s.d, s.next); });

  // 7 — the success path, last, from a clean dock
  cleanDock();
  let successResult;
  try {
    successResult = proto.bootstrap({ win, doc, log, buildHost: (c) => makeInertHost(c) });
  } catch (e) {
    successResult = { ok: false, reason: 'bootstrap-THREW:' + String((e && e.message) || e) };
  }
  record('success', successResult);

  const d = dock();
  const buttons = d ? [...d.querySelectorAll('.dockview-prototype-controls button')] : [];
  out.success = {
    dockChildCount: d ? d.children.length : -1,
    // The prototype's persistent "NOT PRODUCTION" strip is gone: Dockview IS production now, so a
    // warning strip on the production surface would be a false statement.
    bannerCount: d ? d.querySelectorAll('.dockview-prototype-banner').length : -1,
    surfaceCount: d ? d.querySelectorAll('.dockview-prototype-surface').length : -1,
    // No audio slot exists at all; the whole borrow/restore seam was deleted, not disabled.
    audioSlotCount: doc.querySelectorAll('.dockview-prototype-audio').length,
    buttons: buttons.map((b) => ({ label: b.textContent, disabled: b.disabled === true, phase: b.dataset.phase || null })),
    statusText: d && d.querySelector('.dockview-prototype-status') ? d.querySelector('.dockview-prototype-status').textContent : null,
    instanceReturned: !!(successResult && successResult.instance && successResult.instance.ok === true),
    instancePublished: win.ccDockviewPrototypeInstance !== undefined && win.ccDockviewPrototypeInstance !== null,
    // Even a SUCCESSFUL start is embedded: the toolbar above it is still reachable.
    micReachable: reachable(doc.getElementById('sttMic')),
    appSurfaceOnTop: topmostIsInsideAppSurface(),
    surfaceInsideDock: !!(d && d.querySelector('.dockview-prototype-surface')),
  };

  // Tear the successful instance down so the harness leaves nothing running.
  try { if (successResult && successResult.instance && successResult.instance.dispose) successResult.instance.dispose(); } catch (e) {}
  cleanDock();

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

  // ---- drive the REAL Library surface ---------------------------------------------------------
  // Extraction throws on any mismatch; that must surface as a harness failure, not a skipped step.
  let librarySection;
  try {
    librarySection = extractLibrarySection();
  } catch (e) {
    return fail('extract-library-section', (e && e.message) || e);
  }
  const library = await step('library-flow', buildLibraryFlow(librarySection));

  const remoteRequestCount = observed.filter((r) => r.scheme !== 'file').length;
  emit({
    ok: true,                 // "the harness ran"; the TEST decides pass/fail from the data below
    chain,
    drive,
    library,
    libraryControlIds: LIBRARY_CONTROL_IDS,
    consoleMessages,
    requests: summarize(),
    remoteRequestCount,
  }, 0);
});
