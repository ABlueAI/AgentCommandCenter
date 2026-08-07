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
 * round corrects was the prototype pointing at markup that did not exist. This THROWS rather than
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

// The canonical audio controls. Human acceptance failed a second time because `.tts-controls` —
// which owns Dictate — stayed in the Terminals toolbar while the prototype root covered it, so this
// harness must prove the GENUINE surface ends up inside the visible prototype overlay.
const AUDIO_CONTROL_IDS = [
  'audioBuild', 'sttStatus', 'sttMic', 'ttsStatus', 'ttsStop', 'ttsVoice', 'ttsSpeed',
];

/**
 * Extract the REAL `.tts-controls` surface from app/renderer/index.html.
 *
 * Same contract as the Library extraction: no copied fixture, and a THROW rather than a degraded
 * fallback, so a renamed id or a removed control fails the gate loudly. A second `.tts-controls`
 * would mean duplicate element IDs, which is itself the condition the adapter refuses on.
 */
function extractAudioControlsSection() {
  const html = fs.readFileSync(INDEX_FILE, 'utf8');
  const matches = html.match(/<div\s+class="tts-controls"[^>]*>/g) || [];
  if (matches.length !== 1) {
    throw new Error(`expected exactly one .tts-controls surface in index.html, found ${matches.length}`);
  }
  const start = html.indexOf(matches[0]);
  // The surface nests <select><option> children, so the close tag must be matched by depth rather
  // than by the first </div> — guessing would silently truncate the voice and speed controls.
  let depth = 0;
  let i = start;
  let end = -1;
  const tag = /<\/?div\b/g;
  tag.lastIndex = start;
  let m;
  while ((m = tag.exec(html)) !== null) {
    depth += m[0] === '</div' ? -1 : 1;
    if (depth === 0) { end = html.indexOf('>', m.index) + 1; break; }
    i = m.index;
  }
  if (end === -1) throw new Error('.tts-controls surface is not closed');
  const section = html.slice(start, end);
  const missing = AUDIO_CONTROL_IDS.filter((id) => !new RegExp(`id="${id}"`).test(section));
  if (missing.length > 0) {
    throw new Error(`.tts-controls is missing canonical control(s): ${missing.join(', ')}`);
  }
  if (i < start) throw new Error('.tts-controls extraction produced an inconsistent range');
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
 * Install the GENUINE `.tts-controls` surface, extracted verbatim from index.html, into a stand-in
 * `.term-bar` inside the harness's app surface — with a sibling on each side, exactly as production
 * has (a lead caption before it and `#newTermShell` after it), so "restored to its exact original
 * index" is checkable by index rather than merely by parent.
 *
 * It also publishes `window.__ccAudioHome`, the page-side mirror of app.js's placeholder/held-
 * reference dock contract. Every host built below uses it, so the adapter's audio preflight sees a
 * real surface in every scenario, exactly as it will in the real renderer.
 */
function buildAudioSurfaceInstaller(sectionHtml) {
  return `(() => {
  const doc = document;
  const bar = doc.createElement('div');
  bar.className = 'term-bar';
  bar.id = 'harnessTermBar';
  const lead = doc.createElement('span');
  lead.className = 'muted small';
  lead.textContent = 'Agents run in-app here';
  bar.appendChild(lead);
  bar.insertAdjacentHTML('beforeend', ${JSON.stringify(sectionHtml)});
  const shell = doc.createElement('button');
  shell.id = 'newTermShell';
  shell.textContent = '+ Shell';
  bar.appendChild(shell);
  doc.getElementById('appSurface').appendChild(bar);

  // Mirrors app/renderer/app.js: a placeholder records the exact index, and a HELD REFERENCE is
  // what restoration uses, because the element is detached from its query-able position while
  // docked. dockview-default-path.test.js pins that the two implementations agree.
  let placeholder = null;
  let docked = null;
  let homeParent = null;
  window.__ccAudioHome = {
    element: () => doc.querySelector('.tts-controls') || docked,
    count: () => doc.querySelectorAll('.tts-controls').length,
    isDocked: () => placeholder !== null,
    homeIndex: () => {
      const el = doc.querySelector('.tts-controls') || docked;
      return Array.prototype.indexOf.call(bar.children, el);
    },
    bar: () => bar,
    dock: () => {
      const el = doc.querySelector('.tts-controls') || docked;
      if (!el || !el.parentNode) return null;
      if (placeholder) return el;
      placeholder = doc.createComment('dockview-prototype: audio controls home');
      el.parentNode.insertBefore(placeholder, el);
      docked = el;
      homeParent = el.parentNode;
      return el;
    },
    undock: () => {
      const el = docked || doc.querySelector('.tts-controls');
      const p = placeholder;
      const parent = homeParent;
      if (!el) { placeholder = null; docked = null; homeParent = null; return false; }
      if (p && p.parentNode) {
        p.parentNode.insertBefore(el, p);
        p.parentNode.removeChild(p);
        placeholder = null; docked = null; homeParent = null;
        return true;
      }
      if (parent && parent.isConnected) {
        parent.appendChild(el);
        placeholder = null; docked = null; homeParent = null;
        return false;
      }
      if (!p && !parent) { docked = null; return false; }
      return false;
    },
  };
  return {
    installed: true,
    count: window.__ccAudioHome.count(),
    homeIndex: window.__ccAudioHome.homeIndex(),
    controlsPresent: ${JSON.stringify(AUDIO_CONTROL_IDS)}.filter((id) => !!doc.getElementById(id)),
  };
})()`;
}

// The audio half of every harness host. Kept in ONE place so the bootstrap scenarios, the Library
// flow, and the audio flow cannot drift apart on the contract the adapter actually calls.
const AUDIO_HOST_MEMBERS = `
      audioControlsCount: () => window.__ccAudioHome.count(),
      dockAudioControls: () => window.__ccAudioHome.dock(),
      undockAudioControls: () => window.__ccAudioHome.undock(),
      isAudioControlsDocked: () => window.__ccAudioHome.isDocked(),`;

// Drives the REAL bootstrap through every failure path and then the success path. Failure paths run
// FIRST, from a clean DOM, so "no overlay was left behind" is measured before anything succeeds.
/**
 * Round 5 — drive the adapter against the GENUINE Library section in a real renderer.
 *
 * The section is injected verbatim from index.html (never a copy maintained here), into a stand-in
 * tab strip alongside a sibling, so "returned to its exact original position" is checkable by index
 * and not merely by parent. The host's dock/undock mirror app.js's placeholder contract; app.js
 * owns the production implementation and `dockview-default-path.test.js` pins that the two agree.
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
    const container = doc.createElement('div');
    container.className = 'dockview-prototype-root';
    doc.body.appendChild(container);

    const host = {
      bridge: { enabled: true, saveLayout: async () => ({ ok: true, savedAt: 'x' }), loadLayout: async () => ({ ok: false, reason: 'no-saved-layout' }), resetLayout: async () => ({ ok: true }) },
      getDockviewGlobal: () => window.dockview,
      getContainer: () => container,
      log: (l) => logs.push(String(l)),
      isTerminalPane: (id) => paneEls.has(id),
      getPaneElement: (id) => (id === 'library' ? doc.querySelector('#libraryPane') : (paneEls.get(id) || null)),
      getTerminalBody: (id) => paneEls.get(id) || null,
      fitTerminal: () => {}, measureTerminal: () => ({ cols: 80, rows: 24 }), sendResize: () => {},
      suspendAppResizeObserver: () => {}, focusPane: () => {},
      createTerminalPane: async () => null, createLibraryPane: () => 'library',
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
      liveTerminalIds: () => [...paneEls.keys()],${AUDIO_HOST_MEMBERS}
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
    out.logs = logs;
    return out;
  } catch (e) {
    out.error = String((e && e.message) || e);
    return out;
  }
})()`;
}

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
      // Present unless a scenario deliberately suppresses it, so the audio preflight is exercised
      // on the real path rather than skipped by a host that does not implement the contract.
      audioControlsCount: () => (o.audioCount === undefined ? window.__ccAudioHome.count() : o.audioCount),
      dockAudioControls: () => window.__ccAudioHome.dock(),
      undockAudioControls: () => window.__ccAudioHome.undock(),
      isAudioControlsDocked: () => window.__ccAudioHome.isDocked(),
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
    const audio = doc.querySelector('.tts-controls');
    out.scenarios.push({
      name,
      ok: !!(result && result.ok),
      reason: (result && result.reason) || null,
      rootPresent: !!root,
      rootChildCount: root ? root.children.length : 0,
      instancePublished: win.ccDockviewPrototypeInstance !== undefined && win.ccDockviewPrototypeInstance !== null,
      appSurfacePresent: !!doc.getElementById('appSurface'),
      appSurfaceOnTop: appSurfaceOnTop(),
      // Every failure must leave the app's audio surface present, connected, and back in the
      // stand-in toolbar — never detached, never inside a removed root, never duplicated.
      audioCount: doc.querySelectorAll('.tts-controls').length,
      audioConnected: !!(audio && audio.isConnected),
      audioInTermBar: !!(audio && audio.parentNode === doc.getElementById('harnessTermBar')),
      audioStillDocked: win.__ccAudioHome ? win.__ccAudioHome.isDocked() : null,
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

  // 6 — the app-owned audio surface is absent. Refusing is correct: the root is a full-screen
  // opaque overlay, so starting without Dictate inside it is the kill-criterion failure itself.
  run('missing-audio-controls', () => null, () => {}, { audioCount: 0 });

  // 7 — a duplicated audio surface means duplicate element IDs, so \`#sttMic\` would wire whichever
  // copy came first. Refused rather than guessed at.
  run('duplicated-audio-controls', () => null, () => {}, { audioCount: 2 });

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

/**
 * Round 6 — prove the GENUINE audio controls end up inside the visible prototype overlay.
 *
 * The centrepiece is a LIVE NEGATIVE CONTROL that reproduces the observed human-acceptance failure
 * before proving the correction: with a full-screen `.dockview-prototype-root` present and the
 * controls left in the toolbar (the pre-correction geometry), `#sttMic` must be measurably
 * unreachable — `elementFromPoint` at its own centre returns the overlay, not the button. Without
 * that step, "the button is reachable after the fix" would prove nothing about the bug.
 */
const AUDIO_FLOW = `(() => {
  const doc = document;
  const win = window;
  const out = { steps: [] };
  const record = (name, data) => { out.steps.push(Object.assign({ name }, data)); };
  const ROOT_ID = 'dockviewPrototypeRoot';

  // Is the element the topmost thing at its own centre? That is what "reachable" means to a user:
  // not merely present in the DOM, but actually the thing a click would land on.
  const reachable = (el) => {
    if (!el || !el.isConnected) return false;
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return false;
    const top = doc.elementFromPoint(Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2));
    return !!top && (top === el || el.contains(top));
  };

  try {
    const audioEl = doc.querySelector('.tts-controls');
    const mic = doc.getElementById('sttMic');
    const bar = doc.getElementById('harnessTermBar');
    if (!audioEl || !mic || !bar) { out.error = 'audio surface was not installed'; return out; }

    out.surfaceCount = doc.querySelectorAll('.tts-controls').length;
    out.controlsPresent = ${JSON.stringify(AUDIO_CONTROL_IDS)}.filter((id) => !!doc.getElementById(id));
    out.homeIndexBefore = Array.prototype.indexOf.call(bar.children, audioEl);

    // --- 0. LIVE NEGATIVE CONTROL: the pre-correction geometry ---------------------------------
    // A full-screen prototype root, with the controls left where production puts them. This is
    // exactly the state human acceptance hit, reproduced rather than described.
    const preRoot = doc.createElement('div');
    preRoot.id = ROOT_ID;
    preRoot.className = 'dockview-prototype-root';
    doc.body.appendChild(preRoot);
    record('negative-control', {
      micPresent: !!mic.isConnected,
      micInsideRoot: preRoot.contains(mic),
      micReachable: reachable(mic),
      audioReachable: reachable(audioEl),
    });
    preRoot.parentNode.removeChild(preRoot);

    // --- state and handler fixtures, bound BEFORE the move --------------------------------------
    // A listener added here must survive the reparent and fire exactly once afterwards. This is the
    // property a cloned or proxied control could not possibly have.
    let micClicks = 0;
    mic.addEventListener('click', () => { micClicks++; });
    const voice = doc.getElementById('ttsVoice');
    const speed = doc.getElementById('ttsSpeed');
    const opt = doc.createElement('option'); opt.value = 'af_heart'; opt.textContent = 'Heart';
    voice.appendChild(opt);
    voice.value = 'af_heart';
    speed.value = '1.5';
    doc.getElementById('sttStatus').textContent = 'recording';
    doc.getElementById('ttsStatus').textContent = 'speaking';
    mic.classList.add('rec');
    doc.getElementById('ttsStop').classList.remove('hidden');
    const micIdentity = mic;

    // --- 1. activate: the controls must move INTO the visible prototype root ---------------------
    const container = doc.createElement('div');
    container.id = ROOT_ID;
    container.className = 'dockview-prototype-root';
    doc.body.appendChild(container);

    const paneEls = new Map();
    for (const id of ['pty1', 'pty2']) {
      const d = doc.createElement('div');
      d.style.width = '300px'; d.style.height = '200px';
      doc.body.appendChild(d);
      paneEls.set(id, d);
    }
    const logs = [];
    const host = {
      bridge: { enabled: true, saveLayout: async () => ({ ok: true, savedAt: 'x' }), loadLayout: async () => ({ ok: false, reason: 'no-saved-layout' }), resetLayout: async () => ({ ok: true }) },
      getDockviewGlobal: () => win.dockview,
      getContainer: () => container,
      log: (l) => logs.push(String(l)),
      isTerminalPane: (id) => paneEls.has(id),
      getPaneElement: (id) => (id === 'library' ? doc.querySelector('#libraryPane') : (paneEls.get(id) || null)),
      getTerminalBody: (id) => paneEls.get(id) || null,
      fitTerminal: () => {}, measureTerminal: () => ({ cols: 80, rows: 24 }), sendResize: () => {},
      suspendAppResizeObserver: () => {}, focusPane: () => {},
      createTerminalPane: async () => null, closePane: () => {},
      dockLibrary: () => null, undockLibrary: () => false, isLibraryDocked: () => false,
      liveTerminalCount: () => paneEls.size,
      liveTerminalIds: () => [...paneEls.keys()],${AUDIO_HOST_MEMBERS}
    };

    const instance = win.ccDockviewPrototype.activate(host);
    out.activated = !!(instance && instance.ok);
    if (!out.activated) { out.logs = logs; out.activationReason = instance && instance.reason; return out; }

    const slot = container.querySelector('.dockview-prototype-audio');
    const movedAudio = doc.querySelector('.tts-controls');
    const movedMic = doc.getElementById('sttMic');
    micClicks = 0;
    movedMic.click();
    record('activated', {
      slotPresent: !!slot,
      inSlot: !!(slot && movedAudio && movedAudio.parentNode === slot),
      insideRoot: !!(movedAudio && container.contains(movedAudio)),
      sameElement: movedAudio === audioEl,
      sameMic: movedMic === micIdentity,
      surfaceCount: doc.querySelectorAll('.tts-controls').length,
      controlsPresent: ${JSON.stringify(AUDIO_CONTROL_IDS)}.filter((id) => !!doc.getElementById(id)).length,
      // Discoverable by ID after the move, so late ccSTT/ccTTS initialization still wires it.
      discoverableById: ${JSON.stringify(AUDIO_CONTROL_IDS)}.every((id) => !!doc.getElementById(id)),
      micReachable: reachable(movedMic),
      audioReachable: reachable(movedAudio),
      micClicks,
      sttStatusText: doc.getElementById('sttStatus').textContent,
      ttsStatusText: doc.getElementById('ttsStatus').textContent,
      micHasRecClass: movedMic.classList.contains('rec'),
      stopVisible: !doc.getElementById('ttsStop').classList.contains('hidden'),
      voiceValue: doc.getElementById('ttsVoice').value,
      speedValue: doc.getElementById('ttsSpeed').value,
      diagnosticsDocked: instance.diagnostics().audioControlsDocked,
    });

    // --- 2. panes split/grouped/tabbed: the slot is outside the surface, so nothing can hide it ---
    instance.addPane('pty1', 'terminal');
    instance.addPane('pty2', 'terminal', { direction: 'right' });
    const afterSplitMic = doc.getElementById('sttMic');
    record('after-split', {
      micReachable: reachable(afterSplitMic),
      sameMic: afterSplitMic === micIdentity,
      stillInSlot: !!(slot && afterSplitMic.closest('.dockview-prototype-audio') === slot),
    });

    // --- 3. dispose: the identical element returns to its exact original index ------------------
    instance.dispose();
    const backAudio = doc.querySelector('.tts-controls');
    const backMic = doc.getElementById('sttMic');
    micClicks = 0;
    backMic.click();
    record('disposed', {
      sameElement: backAudio === audioEl,
      sameMic: backMic === micIdentity,
      backInBar: !!(backAudio && backAudio.parentNode === bar),
      homeIndexAfter: Array.prototype.indexOf.call(bar.children, backAudio),
      surfaceCount: doc.querySelectorAll('.tts-controls').length,
      controlsPresent: ${JSON.stringify(AUDIO_CONTROL_IDS)}.filter((id) => !!doc.getElementById(id)).length,
      micClicks,
      voiceValue: doc.getElementById('ttsVoice').value,
      speedValue: doc.getElementById('ttsSpeed').value,
      placeholderGone: !win.__ccAudioHome.isDocked(),
    });
    if (container.parentNode) container.parentNode.removeChild(container);

    // --- 4. activation refusal AFTER the surface exists: nothing is left moved ------------------
    const refuseContainer = doc.createElement('div');
    refuseContainer.className = 'dockview-prototype-root';
    doc.body.appendChild(refuseContainer);
    const throwingHost = Object.assign({}, host, {
      getContainer: () => refuseContainer,
      getDockviewGlobal: () => { throw new Error('synthetic failure'); },
    });
    let refusal = null;
    try { refusal = win.ccDockviewPrototype.activate(throwingHost); }
    catch (e) { refusal = { threw: true }; }
    const afterRefusalAudio = doc.querySelector('.tts-controls');
    record('activation-failure', {
      audioInBar: !!(afterRefusalAudio && afterRefusalAudio.parentNode === bar),
      audioIndex: Array.prototype.indexOf.call(bar.children, afterRefusalAudio),
      audioConnected: !!(afterRefusalAudio && afterRefusalAudio.isConnected),
      surfaceCount: doc.querySelectorAll('.tts-controls').length,
      stillDocked: win.__ccAudioHome.isDocked(),
      placeholderLeft: bar.innerHTML.indexOf('audio controls home') !== -1,
    });
    if (refuseContainer.parentNode) refuseContainer.parentNode.removeChild(refuseContainer);

    // --- 5. bootstrap refusal AFTER the controls were already moved -----------------------------
    // This proves the BOOTSTRAP-level net, not merely activate's own rollback. The controls are
    // moved into a prototype root by hand — the "already stranded" state — and a bootstrap that
    // then refuses must return them to the toolbar rather than leaving them inside a root it is
    // about to discard. Without this, a refusal after movement would silently cost the app Dictate.
    const strandRoot = doc.createElement('div');
    strandRoot.id = ROOT_ID;
    strandRoot.className = 'dockview-prototype-root';
    doc.body.appendChild(strandRoot);
    const stranded = win.__ccAudioHome.dock();
    strandRoot.appendChild(stranded);
    const wasStranded = strandRoot.contains(doc.getElementById('sttMic'));
    let bootResult;
    try {
      bootResult = win.ccDockviewPrototype.bootstrap({
        win, doc, log: (l) => logs.push(String(l)),
        buildHost: (c) => Object.assign({}, host, { getContainer: () => c, bridge: { enabled: false } }),
      });
    } catch (e) {
      bootResult = { ok: false, reason: 'THREW:' + String((e && e.message) || e) };
    }
    const rescued = doc.querySelector('.tts-controls');
    record('bootstrap-refusal-after-move', {
      wasStranded,
      refused: bootResult.ok === false,
      reason: bootResult.reason || null,
      sameElement: rescued === audioEl,
      audioInBar: !!(rescued && rescued.parentNode === bar),
      audioIndex: Array.prototype.indexOf.call(bar.children, rescued),
      audioConnected: !!(rescued && rescued.isConnected),
      surfaceCount: doc.querySelectorAll('.tts-controls').length,
      stillDocked: win.__ccAudioHome.isDocked(),
    });
    if (strandRoot.parentNode) strandRoot.parentNode.removeChild(strandRoot);

    out.logs = logs;
    return out;
  } catch (e) {
    out.error = String((e && e.message) || e);
    return out;
  }
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

  // The GENUINE audio surface must exist before anything drives the adapter: activation now
  // preflights it, so installing it first is what makes every scenario below run the real path.
  // Extraction throws on any drift; that must surface as a harness failure, not a skipped step.
  let audioSection;
  try {
    audioSection = extractAudioControlsSection();
  } catch (e) {
    return fail('extract-audio-controls', (e && e.message) || e);
  }
  const audioInstall = await step('install-audio-surface', buildAudioSurfaceInstaller(audioSection));

  const drive = await step('drive-bootstrap', DRIVE_BOOTSTRAP);
  const audio = await step('audio-flow', AUDIO_FLOW);

  // ---- Round 5: drive the REAL Library surface ------------------------------------------------
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
    audio,
    audioInstall,
    libraryControlIds: LIBRARY_CONTROL_IDS,
    audioControlIds: AUDIO_CONTROL_IDS,
    consoleMessages,
    requests: summarize(),
    remoteRequestCount,
  }, 0);
});
