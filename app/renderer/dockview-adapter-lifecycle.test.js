'use strict';
// Run: node app/renderer/dockview-adapter-lifecycle.test.js
//
// BEHAVIOURAL tests for the Dockview adapter's close/restore lifecycle, against a fake Dockview API
// that reproduces the VENDOR'S ACTUAL EVENT PAYLOAD SHAPE.
//
// This suite exists because a source-regex assertion previously "proved" that a Dockview panel
// removal delegates to the app's close path while the delegation was in fact dead code: the handler
// read `event.panel.id`, but dockview@7.0.4's DockviewComponent unwraps the group model's event and
// fires the PANEL ITSELF (`this._onDidRemovePanel.fire(event.panel)`), so the ID was always
// undefined and the handler always returned early. The regex matched the source text regardless.
//
// The fake below therefore fires `{ id, ... }` — the real shape — so this suite fails if the
// adapter ever goes back to reading a wrapper.

const path = require('path');

let passed = 0, failed = 0;
function assert(cond, label) {
  if (cond) { process.stdout.write(`  ✓ ${label}\n`); passed++; }
  else { process.stderr.write(`  ✗ FAIL: ${label}\n`); failed++; }
}

// ---- minimal DOM / window stubs -------------------------------------------------------------
function makeElement(tag) {
  return {
    tagName: tag, className: '', id: '', textContent: '', onclick: null,
    children: [], parentNode: null, isConnected: true,
    style: {}, dataset: {},
    setAttribute() {}, removeAttribute() {},
    appendChild(child) { child.parentNode = this; this.children.push(child); return child; },
    removeChild(child) { this.children = this.children.filter(c => c !== child); child.parentNode = null; },
    querySelector() { return null; },
    getBoundingClientRect() { return { width: 800, height: 600 }; },
    get offsetParent() { return this.parentNode || { }; },
  };
}
global.document = { createElement: (t) => makeElement(t), getElementById: () => null, head: makeElement('head'), body: makeElement('body') };
const frames = [];
global.window = {
  addEventListener() {}, removeEventListener() {},
  requestAnimationFrame: (cb) => { frames.push(cb); return frames.length; },
  cancelAnimationFrame: (h) => { frames[h - 1] = null; },
};
global.ResizeObserver = function (cb) { this.cb = cb; this.observe = () => {}; this.disconnect = () => { this.disconnected = true; }; };

// The adapter and its policies attach to `window` when present; require them so the adapter's
// `window.ccDockviewFitPolicy || require(...)` lookups resolve to the real modules.
require('./dockview-fit-policy');
require('./dockview-panel-policy');
const adapterModule = require('./dockview-prototype');
const adapter = adapterModule.activate ? adapterModule : global.window.ccDockviewPrototype;

// ---- fake Dockview api reproducing the real event payload shapes ------------------------------
function makeFakeDockview() {
  const listeners = { remove: [], active: [], layout: [] };
  const panels = new Map();
  let componentFactory = null;
  const addPanelCalls = [];
  const api = {
    addPanel(opts) {
      addPanelCalls.push(opts);   // the exact object the adapter handed to Dockview
      // The real API builds a DockviewPanel carrying `.id`; that is what removal events deliver.
      const panel = { id: opts.id, component: opts.component, title: opts.title };
      panels.set(opts.id, panel);
      // The real component lifecycle: Dockview builds the content renderer and calls init(), which
      // is where the adapter reparents the pane and creates its fit controller. Reproducing it here
      // is what makes the observer/controller assertions meaningful rather than vacuous.
      if (componentFactory) {
        const renderer = componentFactory({ id: opts.id, name: opts.component });
        panel._renderer = renderer;
        if (renderer && typeof renderer.init === 'function') renderer.init({});
      }
      return panel;
    },
    getPanel: (id) => panels.get(id) || null,
    removePanel(panel) {
      panels.delete(panel.id);
      // REAL SHAPE: the panel itself, not { panel }.
      listeners.remove.forEach((fn) => fn(panel));
    },
    onDidRemovePanel: (fn) => listeners.remove.push(fn),
    onDidActivePanelChange: (fn) => listeners.active.push(fn),
    onDidLayoutChange: (fn) => listeners.layout.push(fn),
    toJSON: () => ({ panels: Object.fromEntries([...panels].map(([k, v]) => [k, v])) }),
    fromJSON(layout) {
      // The real fromJSON clears the workspace FIRST, and those removals surface as ordinary
      // removal events. Reproduced here so the re-entrancy guard is genuinely exercised.
      for (const panel of [...panels.values()]) { panels.delete(panel.id); listeners.remove.forEach((fn) => fn(panel)); }
      for (const id of Object.keys((layout && layout.panels) || {})) panels.set(id, { id });
    },
    dispose() {},
    _panels: panels,
  };
  return {
    createDockview: (_el, options) => { componentFactory = options && options.createComponent; return api; },
    _api: api,
    _listeners: listeners,
    _addPanelCalls: addPanelCalls,
  };
}

function makeHost(overrides = {}) {
  const calls = { closePane: [], suspended: [], logs: [] };
  const container = makeElement('div');
  const paneElements = new Map([
    ['pty1', makeElement('div')], ['pty2', makeElement('div')], ['library', makeElement('div')],
  ]);
  const host = {
    bridge: { enabled: true, saveLayout: async () => ({ ok: true, savedAt: 'x' }), loadLayout: async () => ({ ok: false, reason: 'no-saved-layout' }), resetLayout: async () => ({ ok: true }) },
    getDockviewGlobal: () => host._dockview,
    getContainer: () => container,
    log: (l) => calls.logs.push(l),
    isTerminalPane: (id) => id !== 'library' && paneElements.has(id),
    getPaneElement: (id) => paneElements.get(id) || null,
    getTerminalBody: () => makeElement('div'),
    fitTerminal: () => {},
    measureTerminal: () => ({ cols: 80, rows: 24 }),
    sendResize: () => {},
    suspendAppResizeObserver: (id) => calls.suspended.push(id),
    focusPane: () => {},
    createTerminalPane: async () => 'pty1',
    createLibraryPane: () => 'library',
    closePane: (id) => calls.closePane.push(id),
    _calls: calls,
    _paneElements: paneElements,
  };
  return Object.assign(host, overrides);
}

// ---------------------------------------------------------------------------
process.stdout.write('\nDockview panel removal converges on the app close path (REAL payload shape)\n');
// ---------------------------------------------------------------------------
{
  const fake = makeFakeDockview();
  const host = makeHost(); host._dockview = fake;
  const instance = adapter.activate(host);
  assert(instance.ok === true, 'the adapter activates');

  instance.addPane('pty1', 'terminal');
  const panel = fake._api.getPanel('pty1');
  assert(!!panel && panel.id === 'pty1', 'the panel was added with the opaque pane ID');

  fake._api.removePanel(panel);   // fires the real payload: the panel object itself
  assert(host._calls.closePane.length === 1,
    'removing a Dockview panel calls the app close path EXACTLY once');
  assert(host._calls.closePane[0] === 'pty1', 'it closes the correct pane');
}
{
  // Regression pin for the exact defect: a wrapper-shaped payload must NOT be what the adapter
  // depends on, and an unresolvable ID must refuse VISIBLY rather than return silently.
  const fake = makeFakeDockview();
  const host = makeHost(); host._dockview = fake;
  adapter.activate(host);
  fake._listeners.remove.forEach((fn) => fn({ panel: { id: 'pty1' } }));  // the WRONG shape
  assert(host._calls.closePane.length === 0, 'a wrapper-shaped payload closes nothing');
  assert(host._calls.logs.some((l) => /REFUSED/.test(l)),
    'an unresolvable pane ID produces a VISIBLE refusal, not a silent return');
}

// ---------------------------------------------------------------------------
process.stdout.write('\nthe ✕ button converges the other way: the panel is removed too\n');
// ---------------------------------------------------------------------------
{
  const fake = makeFakeDockview();
  const host = makeHost(); host._dockview = fake;
  const instance = adapter.activate(host);
  instance.addPane('pty1', 'terminal');
  assert(fake._api.getPanel('pty1') !== null, 'the panel exists before the app-side close');

  instance.onAppPaneClosed('pty1');
  assert(fake._api.getPanel('pty1') === null,
    'closing from the pane header removes the Dockview panel (no ghost panel is left behind)');
  assert(host._calls.closePane.length === 0,
    'and it does NOT re-enter the app close path (the app is already mid-close)');
  assert(instance.registry.has('pty1') === false, 'the fit controller is released');

  instance.onAppPaneClosed('pty1');
  assert(true, 'a second app-side close is a no-op, not a throw');
  instance.onAppPaneClosed('never-existed');
  assert(true, 'closing an unknown pane is a no-op, not a throw');
}

// ---------------------------------------------------------------------------
process.stdout.write('\nthe app\'s ungated ResizeObserver is suspended for hosted terminals\n');
// ---------------------------------------------------------------------------
{
  const fake = makeFakeDockview();
  const host = makeHost(); host._dockview = fake;
  const instance = adapter.activate(host);
  instance.addPane('pty1', 'terminal');
  assert(host._calls.suspended.includes('pty1'),
    'hosting a terminal suspends the app\'s own visibility-ungated observer');
  assert(!host._calls.suspended.includes('library'),
    'the Library pane has no xterm and no observer to suspend');
  assert(instance.registry.size() === 1, 'exactly one fit controller exists for the terminal');
}

// ---------------------------------------------------------------------------
process.stdout.write('\nonly the three allowlisted fields ever reach Dockview\n');
// ---------------------------------------------------------------------------
{
  const fake = makeFakeDockview();
  const host = makeHost(); host._dockview = fake;
  const instance = adapter.activate(host);
  instance.addPane('pty1', 'terminal');
  // Assert on the OPTIONS the adapter handed to Dockview — the actual trust boundary.
  const opts = fake._addPanelCalls[0];
  assert(Object.keys(opts).sort().join(',') === 'component,id,title',
    'Dockview received exactly id + component + title — no params, no path, no role');
  assert(opts.id === 'pty1' && opts.component === 'terminal' && opts.title === 'Terminal 1',
    'the values are the opaque ID, the allowlisted kind, and an ID-derived title');

  instance.addPane('library', 'library', { direction: 'below' });
  const libOpts = fake._addPanelCalls[1];
  assert(Object.keys(libOpts).sort().join(',') === 'component,id,position,title',
    'a positioned panel adds only `position` — still no params');
  assert(!('params' in libOpts), 'no params key is ever supplied to Dockview');

  assert(instance.addPane('shell9', 'terminal') === false, 'an unknown pane ID is refused');
  assert(instance.addPane('pty1', 'iframe') === false, 'an unknown component kind is refused');
}

// ---------------------------------------------------------------------------
(async () => {
  process.stdout.write('\nRestore must not kill live PTYs when fromJSON clears the workspace\n');
  {
    const fake = makeFakeDockview();
    const host = makeHost(); host._dockview = fake;
    host.bridge.loadLayout = async () => ({
      ok: true, savedAt: '2026-08-04T12:00:00Z', layout: { panels: { pty1: {}, pty2: {} } },
    });
    const instance = adapter.activate(host);
    instance.addPane('pty1', 'terminal');
    instance.addPane('pty2', 'terminal');

    await instance.restoreLayout();
    assert(host._calls.closePane.length === 0,
      'fromJSON clearing the workspace does NOT call the app close path (no live PTY is killed)');
    assert(fake._api.getPanel('pty1') !== null, 'the restored panels are present afterwards');
  }

  process.stdout.write('\nRestore refuses visibly when a saved pane is not live\n');
  {
    const fake = makeFakeDockview();
    const host = makeHost(); host._dockview = fake;
    host._paneElements.delete('pty2');            // pty2 was saved but is not open after a restart
    host.bridge.loadLayout = async () => ({
      ok: true, savedAt: '2026-08-04T12:00:00Z', layout: { panels: { pty1: {}, pty2: {} } },
    });
    const instance = adapter.activate(host);
    const result = await instance.restoreLayout();
    assert(result && result.ok === false && result.reason === 'panes-not-live',
      'restore refuses rather than mounting an empty panel shell for a missing pane');
    assert(host._calls.logs.some((l) => /restore REFUSED/.test(l)), 'the refusal is visible in the log');
    assert(fake._api._panels.size === 0, 'nothing was restored and no ghost panel was created');
  }

  process.stdout.write('\nRestore with no saved layout offers the default instead of failing\n');
  {
    const fake = makeFakeDockview();
    const host = makeHost(); host._dockview = fake;
    const instance = adapter.activate(host);
    const result = await instance.restoreLayout();
    assert(result && result.ok === false && result.reason === 'no-saved-layout', 'the missing-state reason is surfaced');
    assert(host._calls.logs.some((l) => /no-saved-layout/.test(l)), 'the reason is logged');
  }

  process.stdout.write(`\ndockview-adapter-lifecycle: ${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exit(1);
})();
