'use strict';
// Run: node app/renderer/dockview-adapter-lifecycle.test.js
//
// BEHAVIOURAL tests for the Dockview adapter's close/restore lifecycle, against a fake Dockview API
// that reproduces the VENDOR'S ACTUAL EVENT PAYLOAD SHAPES **and** the vendor's actual fromJSON
// lifecycle — both halves of it.
//
// Two defects motivated this suite, and both were invisible to a weaker harness:
//
//   ROUND 1: a source-regex assertion "proved" that a Dockview panel removal delegates to the app's
//   close path while the delegation was dead code. The handler read `event.panel.id`, but
//   dockview@7.0.4's DockviewComponent unwraps the group model's event and fires the PANEL ITSELF
//   (`this._onDidRemovePanel.fire(event.panel)`), so the ID was always undefined. The fake below
//   therefore fires the real shape.
//
//   ROUND 2: the fake performed only the CLEAR half of fromJSON and rebuilt with a bare panel
//   record, never invoking the component factory or the renderer's init(). The real
//   `_doFromJSON` calls `this.clear()` and then, for every saved panel, constructs a
//   DockviewPanelModel — whose constructor calls `options.createComponent({id,name})` — and then
//   `panel.init(...)`, which calls the renderer's `init()`. That rebuild half is exactly where the
//   adapter reparents the live pane element, so omitting it let a restore "pass" while every
//   rebuilt panel was an empty shell and every live xterm/PTY was stranded on a discarded host.
//   The fake below performs BOTH halves and the assertions inspect real DOM ownership by object
//   identity, never `getPanel(id) !== null`.

let passed = 0, failed = 0;
function assert(cond, label) {
  if (cond) { process.stdout.write(`  ✓ ${label}\n`); passed++; }
  else { process.stderr.write(`  ✗ FAIL: ${label}\n`); failed++; }
}

// ---- minimal DOM / window stubs -------------------------------------------------------------
// appendChild MOVES the node, exactly as the real DOM does: it detaches from the previous parent's
// child list first. That is what makes "the old panel host no longer owns the element" provable.
function makeElement(tag) {
  return {
    tagName: tag, className: '', id: '', textContent: '', onclick: null,
    children: [], parentNode: null, isConnected: true,
    style: {}, dataset: {}, _hidden: false,
    setAttribute() {}, removeAttribute() {},
    appendChild(child) {
      const previous = child.parentNode;
      if (previous && previous !== this && Array.isArray(previous.children)) {
        previous.children = previous.children.filter((c) => c !== child);
      }
      child.parentNode = this;
      this.children.push(child);
      return child;
    },
    removeChild(child) { this.children = this.children.filter(c => c !== child); child.parentNode = null; },
    querySelector() { return null; },
    getBoundingClientRect() { return this._hidden ? { width: 0, height: 0 } : { width: 800, height: 600 }; },
    get offsetParent() { return this._hidden ? null : (this.parentNode || { }); },
  };
}
global.document = { createElement: (t) => makeElement(t), getElementById: () => null, head: makeElement('head'), body: makeElement('body') };

// Frame accounting: a leaked controller shows up as a pending frame that is never cancelled.
const frames = { pending: 0, created: 0 };
const frameCallbacks = [];
global.window = {
  addEventListener() {}, removeEventListener() {},
  requestAnimationFrame: (cb) => { frames.created++; frames.pending++; frameCallbacks.push(cb); return frameCallbacks.length; },
  cancelAnimationFrame: (h) => { if (frameCallbacks[h - 1]) { frameCallbacks[h - 1] = null; frames.pending--; } },
};

// Observer accounting: `live` must equal one per hosted terminal at every stable point.
const observers = { live: 0, created: 0 };
global.ResizeObserver = function (cb) {
  observers.created++; observers.live++;
  this.cb = cb;
  this.observe = () => {};
  this.disconnect = () => { if (!this._disconnected) { this._disconnected = true; observers.live--; } };
};

require('./dockview-fit-policy');
require('./dockview-panel-policy');
// The SHARED layout policy — the same module main validates with. Requiring it here is not a test
// convenience: the adapter now refuses to activate without it, and it is what makes every
// `fromJSON` below run through the real validator rather than a stand-in.
const layoutPolicy = require('../dockview-layout-policy');
const adapterModule = require('./dockview-prototype');
const adapter = adapterModule.activate ? adapterModule : global.window.ccDockviewPrototype;
const R = layoutPolicy.REASON;

/**
 * Build a REAL, valid dockview@7.0.4 layout for a set of panes — through the shared policy itself,
 * so a test can never accidentally assert against a shape the production validator would refuse.
 */
function layoutFor(ids, width = 100, height = 100) {
  const built = layoutPolicy.buildDefaultArrangement({
    panes: ids.map((id) => ({
      id,
      component: id === 'library' ? 'library' : 'terminal',
      title: id === 'library' ? 'Library' : `Terminal ${id.slice(3)}`,
    })),
    width,
    height,
  });
  if (!built.ok) throw new Error(`layoutFor could not build a valid layout: ${built.reason}`);
  return built.layout;
}

/** The on-disk envelope main returns for a set of panes. */
function envelopeFor(ids) {
  return layoutPolicy.buildEnvelope(layoutFor(ids), Date.UTC(2026, 7, 8, 12, 0, 0));
}

// ---- fake Dockview api: real payload shapes AND the real fromJSON lifecycle --------------------
function makeFakeDockview() {
  const listeners = { remove: [], active: [], layout: [] };
  const panels = new Map();
  let componentFactory = null;
  const addPanelCalls = [];
  const activatedIds = [];      // every panel.api.setActive() call, in order
  const maximizeCalls = [];     // every panel.api.maximize() call, in order
  const exitCalls = [];         // every panel.api.exitMaximized() call, in order
  let activePanelId = null;     // whichever panel was last activated
  let dockSurface = null;
  let failOnce = false;         // true => the fault fires once, so a rollback can still succeed
  // null | 'after-clear' | 'mid-rebuild' | 'add-panel' | 'drop-last' | 'extra-panel'
  //      | 'hide-last' | 'hide-pane-last'
  let failMode = null;
  let panelEnumerationMode = null;
  let panelEnumerationOnce = false;

  // The real lifecycle: DockviewPanelModel's constructor calls createComponent({id,name}), then
  // panel.init(...) calls the returned renderer's init(). Both halves matter to the adapter.
  function buildPanel(id, component, title) {
    const groupElement = makeElement('section');
    // dockview@7.0.4 exposes `readonly api: DockviewPanelApi` on every panel, and that API carries
    // `setActive(): void` (dockviewPanelApi.d.ts:75) — the bundle's own tab handlers call
    // `panel.api.setActive()`. Modelling it here is what lets the duplicate-Add test prove the
    // adapter focuses the existing panel rather than adding a second one.
    //
    // The same file declares `maximize(): void`, `isMaximized(): boolean` and
    // `exitMaximized(): void` (lines 42-44), verified against the installed package and present in
    // the shipped UMD bundle. Only ONE group may be maximized at a time in the real component
    // (`maximizeView` exits any existing maximized view first), which is modelled here because the
    // app's ⛶/🗗 glyph bookkeeping depends on exactly that behaviour.
    const panel = {
      id, component, title,
      api: {
        group: { element: groupElement },
        setActive() { activatedIds.push(id); activePanelId = id; },
        maximize() {
          if (api._maximizeThrows) throw new Error('dockview: synthetic maximize failure');
          api._maximizedId = id;
          maximizeCalls.push(id);
        },
        isMaximized() { return api._maximizedId === id; },
        exitMaximized() {
          if (api._maximizedId === id) api._maximizedId = null;
          exitCalls.push(id);
        },
      },
    };
    panels.set(id, panel);
    if (dockSurface) dockSurface.appendChild(groupElement);
    if (componentFactory) {
      const renderer = componentFactory({ id, name: component });
      panel._renderer = renderer;
      if (renderer && renderer.element) groupElement.appendChild(renderer.element);
      if (renderer && typeof renderer.init === 'function') renderer.init({});
    }
    return panel;
  }

  const api = {
    addPanel(opts) {
      addPanelCalls.push(opts);   // the exact object the adapter handed to Dockview
      // Lets a test drive the § "transactional docking" rollback: addPanel throwing must leave the
      // ownership map and the Library DOM exactly as they were.
      if (failMode === 'add-panel' ) throw new Error('dockview: synthetic addPanel failure');
      return buildPanel(opts.id, opts.component, opts.title);
    },
    getPanel: (id) => panels.get(id) || null,
    removePanel(panel) {
      panels.delete(panel.id);
      listeners.remove.forEach((fn) => fn(panel));   // REAL SHAPE: the panel itself, not { panel }
      if (panel.api.group.element.parentNode) panel.api.group.element.parentNode.removeChild(panel.api.group.element);
    },
    // DockviewApi.clear() -> component.clear() -> _doClear -> removeGroup -> removePanel per panel,
    // each of which surfaces on the public removal event.
    clear() {
      for (const panel of [...panels.values()]) {
        panels.delete(panel.id);
        listeners.remove.forEach((fn) => fn(panel));
        if (panel.api.group.element.parentNode) panel.api.group.element.parentNode.removeChild(panel.api.group.element);
      }
    },
    onDidRemovePanel: (fn) => listeners.remove.push(fn),
    onDidActivePanelChange: (fn) => listeners.active.push(fn),
    onDidLayoutChange: (fn) => listeners.layout.push(fn),
    // dockview@7.0.4's DockviewApi exposes `panels` (all panels) and `activePanel`. The adapter
    // reads both — `panels` to prove no UNEXPECTED panel survived an apply, `activePanel` to put
    // focus back after a rollback — so the fake must carry them.
    get panels() {
      const mode = panelEnumerationMode;
      if (mode && panelEnumerationOnce) {
        panelEnumerationMode = null;
        panelEnumerationOnce = false;
      }
      if (mode === 'throw') throw new Error('dockview: synthetic panel enumeration failure');
      if (mode === 'unavailable') return undefined;
      if (mode === 'non-array') return { invalid: true };
      return [...panels.values()];
    },
    get activePanel() { return activePanelId ? panels.get(activePanelId) || null : null; },
    // A REAL serialization: one leaf group per panel under a horizontal branch, exactly the shape
    // the committed dockview@7.0.4 fixture has. This matters because the adapter now VALIDATES the
    // rollback snapshot it captures from here — a toJSON that emitted `{panels}` alone would be
    // refused by the production validator, and every transaction test would pass for the wrong
    // reason (refused before applying) or fail spuriously.
    toJSON: () => {
      const ids = [...panels.keys()];
      return {
        grid: {
          root: {
            type: 'branch',
            size: 100,
            data: ids.map((id, i) => ({
              type: 'leaf',
              size: 100,
              data: { views: [id], activeView: id, id: String(i + 1) },
            })),
          },
          width: 100,
          height: 100,
          orientation: 'HORIZONTAL',
        },
        panels: Object.fromEntries(ids.map((id) => {
          const p = panels.get(id);
          return [id, { id, contentComponent: p.component, title: p.title }];
        })),
        activeGroup: '1',
      };
    },
    fromJSON(layout) {
      // TRANSIENT vs PERSISTENT is the distinction that decides what a rollback can achieve. A
      // saved layout the vendor chokes on is transient: the snapshot Dockview itself serialized
      // moments earlier still applies, so the rollback SUCCEEDS. A persistent fault breaks the
      // rollback's own fromJSON too, and the adapter must then report the rollback INCOMPLETE
      // rather than claim the previous arrangement is back.
      const mode = failMode;
      if (mode && failOnce) { failMode = null; failOnce = false; }

      // HALF 1 — _doFromJSON calls this.clear() BEFORE deserializing anything.
      api.clear();
      if (mode === 'after-clear') throw new Error('dockview: synthetic apply failure after clear');
      // HALF 2 — the deserializer builds every saved panel through createComponent + init().
      const ids = Object.keys((layout && layout.panels) || {});
      ids.forEach((id, index) => {
        if (mode === 'mid-rebuild' && index === 1) {
          throw new Error('dockview: synthetic apply failure mid-rebuild');
        }
        if (mode === 'drop-last' && index === ids.length - 1) return;  // silently missing pane
        const saved = (layout.panels && layout.panels[id]) || {};
        const panel = buildPanel(id, saved.contentComponent || 'terminal', saved.title || id);
        if (mode === 'hide-last' && index === ids.length - 1) panel.api.group.element._hidden = true;
        if (mode === 'hide-pane-last' && index === ids.length - 1) panel._renderer.element._hidden = true;
      });
      if (mode === 'extra-panel') buildPanel('pty9', 'terminal', 'Terminal 9');
    },
    dispose() { api._disposed = true; },
    _disposed: false,
    _panels: panels,
    _maximizedId: null,
    _maximizeThrows: false,
  };
  let created = false;
  return {
    createDockview: (_el, options) => {
      created = true;
      dockSurface = _el;
      componentFactory = options && options.createComponent;
      return api;
    },
    get _created() { return created; },
    _api: api,
    _listeners: listeners,
    _addPanelCalls: addPanelCalls,
    _activatedIds: activatedIds,
    _maximizeCalls: maximizeCalls,
    _exitCalls: exitCalls,
    /** Passing { once: true } models a TRANSIENT vendor fault: the apply fails, the rollback works. */
    _failFromJSON: (mode, opts) => { failMode = mode; failOnce = !!(opts && opts.once); },
    /** Fault-inject the public `api.panels` enumeration used by post-apply verification. */
    _failPanelEnumeration: (mode, opts) => {
      panelEnumerationMode = mode;
      panelEnumerationOnce = !!(opts && opts.once);
    },
  };
}

/**
 * Read the adapter's REAL status surface rather than a channel invented for the tests: walk the
 * container the adapter built and return the text of its `.dockview-prototype-status` element.
 * If the adapter ever stops writing there, these assertions fail — which is the point.
 */
function statusText(host) {
  const found = [];
  (function walk(el) {
    if (!el) return;
    if (el.className === 'dockview-prototype-status') found.push(el.textContent);
    for (const child of el.children || []) walk(child);
  })(host.getContainer());
  return found.length ? found[found.length - 1] : '';
}

function makeHost(overrides = {}) {
  const calls = {
    closePane: [], suspended: [], resumed: [], logs: [], statuses: [], created: [],
    docked: 0, undocked: 0, saved: [], cleared: 0,
  };
  const container = makeElement('div');
  const paneElements = new Map([
    ['pty1', makeElement('div')], ['pty2', makeElement('div')], ['library', makeElement('div')],
  ]);
  // The Library is a singleton that lives in the tab strip. `libraryHome` stands in for that
  // original parent so a test can assert the SAME element object goes back to it. The real
  // placeholder-based implementation lives in app.js and is proven against the genuine index.html
  // Library section by the Electron bootstrap harness — this stub only proves the ADAPTER drives
  // the dock/undock contract correctly and rolls it back on failure.
  const libraryHome = makeElement('main');
  let libraryPlaceholder = null;
  // NO AUDIO CONTRACT. The prototype's host exposed audioControlsCount / dockAudioControls /
  // undockAudioControls / isAudioControlsDocked, and the adapter preflighted and borrowed the
  // app-owned `.tts-controls` element because its full-screen overlay covered the toolbar. The
  // production surface is embedded below that toolbar, so the controls never move — and the whole
  // seam is deleted, not disabled. Its absence from this stub is load-bearing: an adapter that
  // still preflighted audio would refuse to activate against this host, and every test below would
  // fail rather than quietly skipping.
  let nextTerminal = 0;
  const host = {
    // The MAIN-owned bridge, in the shapes main actually returns. `loadLayout` hands back the WHOLE
    // envelope (Phase C) so the renderer can validate schema version, package identity and
    // timestamp — not just the layout — immediately before fromJSON.
    bridge: {
      enabled: true,
      saveLayout: async (layout) => { calls.saved.push(layout); return host._saveResult; },
      loadLayout: async () => host._loadResult,
      resetLayout: async () => { calls.cleared += 1; return host._resetResult; },
    },
    _saveResult: { ok: true, savedAt: '2026-08-08T12:00:00Z' },
    _loadResult: { ok: false, reason: 'no-saved-layout' },
    _resetResult: { ok: true, existed: true },
    getDockviewGlobal: () => host._dockview,
    getContainer: () => container,
    log: (l) => calls.logs.push(l),
    isTerminalPane: (id) => id !== 'library' && paneElements.has(id),
    getPaneElement: (id) => paneElements.get(id) || null,
    getTerminalBody: () => makeElement('div'),
    fitTerminal: () => {},
    measureTerminal: () => ({ cols: 80, rows: 24 }),
    sendResize: () => {},
    suspendAppResizeObserver: (id) => { calls.suspended.push(id); return true; },
    // The inverse handover. The ADAPTER never calls it — a pane leaving Dockview alive is the app's
    // decision (adoption rollback), and this stub records that so the test can prove the adapter
    // does not take resize ownership back on its own.
    resumeAppResizeObserver: (id) => { calls.resumed.push(id); return true; },
    focusPane: () => {},
    createTerminalPane: async () => { const id = ['pty1', 'pty2'][nextTerminal++] || null; calls.created.push(id); return id; },
    createLibraryPane: () => { calls.created.push('library'); return 'library'; },
    closePane: (id) => calls.closePane.push(id),
    // --- Library singleton docking (mirrors app.js's placeholder contract) ---
    libraryAvailable: () => paneElements.has('library'),
    dockLibrary: () => {
      const el = paneElements.get('library');
      if (!el) return null;                       // missing Library DOM -> caller must refuse visibly
      if (libraryPlaceholder) return el;          // idempotent: no second placeholder
      libraryPlaceholder = { marker: true };
      calls.docked++;
      return el;
    },
    undockLibrary: () => {
      if (!libraryPlaceholder) return false;      // idempotent: undocking an undocked Library is a no-op
      libraryPlaceholder = null;
      calls.undocked++;
      const el = paneElements.get('library');
      if (el) libraryHome.appendChild(el);        // back to its original parent, same object
      return true;
    },
    isLibraryDocked: () => libraryPlaceholder !== null,
    liveTerminalCount: () => [...paneElements.keys()].filter((k) => k !== 'library').length,
    liveTerminalIds: () => [...paneElements.keys()].filter((k) => k !== 'library'),
    _calls: calls,
    _paneElements: paneElements,
    _libraryHome: libraryHome,
  };
  return Object.assign(host, overrides);
}

/**
 * Stand up an adapter hosting a set of panes, with a saved envelope main would return.
 * `savedIds` defaults to exactly the live set, which is the only case a restore may proceed on.
 */
function makeRestoreScenario(savedIds, liveIds = ['pty1', 'pty2', 'library']) {
  const fake = makeFakeDockview();
  const host = makeHost(); host._dockview = fake;
  host._loadResult = { ok: true, envelope: envelopeFor(savedIds || liveIds) };
  const instance = adapter.activate(host);
  for (const id of liveIds) instance.addPane(id, id === 'library' ? 'library' : 'terminal');
  const paneEl = (id) => host._paneElements.get(id);
  const hostOf = (id) => { const p = fake._api.getPanel(id); return p && p._renderer && p._renderer.element; };
  return { fake, host, instance, paneEl, hostOf };
}

const THREE = ['pty1', 'pty2', 'library'];

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
  assert(instance.ownedPaneIds().includes('pty1') === false,
    'a genuine user close releases pane OWNERSHIP, not merely the mount');
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
  assert(instance.ownedPaneIds().includes('pty1') === false, 'pane ownership is released too');

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

  // addPane now returns a BOUNDED RESULT rather than a bare boolean, because round 5 requires every
  // control to report success or a named refusal — a silently discarded click is what made Add
  // Library look like it did nothing at all.
  const badId = instance.addPane('shell9', 'terminal');
  assert(badId.ok === false && badId.reason === 'bad-pane-id', 'an unknown pane ID is refused by name');
  const badKind = instance.addPane('pty2', 'iframe');
  assert(badKind.ok === false && badKind.reason === 'unknown-component-kind', 'an unknown kind is refused by name');
  assert(instance.ownedPaneIds().includes('shell9') === false, 'a refused add records no ownership');
}

// ---------------------------------------------------------------------------
process.stdout.write('\nR5: Add Library docks the singleton and refuses duplicates visibly\n');
// ---------------------------------------------------------------------------
{
  const fake = makeFakeDockview();
  const host = makeHost(); host._dockview = fake;
  const instance = adapter.activate(host);

  const first = instance.addPane('library', 'library');
  assert(first.ok === true, 'Add Library succeeds');
  assert(host._calls.docked === 1, 'the singleton was docked exactly once');
  assert(instance.ownedPaneIds().includes('library'), 'the Library is owned');
  assert(fake._addPanelCalls.length === 1, 'exactly one panel was added');

  // Duplicate: must focus, must NOT add a second panel or a second ownership entry.
  const second = instance.addPane('library', 'library');
  assert(second.ok === false && second.reason === 'library-already-open', 'a duplicate Add reports library-already-open');
  assert(second.focused === true, 'the existing panel was focused via panel.api.setActive()');
  assert(fake._activatedIds.join(',') === 'library', 'setActive was called on the Library panel exactly once');
  assert(fake._addPanelCalls.length === 1, 'NO second panel was created');
  assert(instance.ownedPaneIds().filter((id) => id === 'library').length === 1, 'ownership is not duplicated');
  assert(host._calls.docked === 1, 'the Library DOM was not touched again');
}

// ---------------------------------------------------------------------------
process.stdout.write('\nR5: missing Library DOM refuses visibly — no silent null path\n');
// ---------------------------------------------------------------------------
{
  const fake = makeFakeDockview();
  const host = makeHost(); host._dockview = fake;
  host._paneElements.delete('library');          // the pre-R5 production state: no Library element
  const instance = adapter.activate(host);

  const r = instance.addPane('library', 'library');
  assert(r.ok === false && r.reason === 'library-dom-missing', 'a missing Library surface refuses by name');
  assert(host._calls.logs.some((l) => /library-dom-missing/.test(l)), 'the refusal reaches the log with a content-free reason');
  assert(fake._addPanelCalls.length === 0, 'no panel was created');
  assert(instance.ownedPaneIds().length === 0, 'no ownership was recorded');
}

// ---------------------------------------------------------------------------
process.stdout.write('\nR5: docking is TRANSACTIONAL — a failed addPanel rolls everything back\n');
// ---------------------------------------------------------------------------
{
  const fake = makeFakeDockview();
  const host = makeHost(); host._dockview = fake;
  const instance = adapter.activate(host);
  fake._failFromJSON('add-panel');               // make api.addPanel throw

  const r = instance.addPane('library', 'library');
  assert(r.ok === false && r.reason === 'add-panel-failed', 'the failed add refuses by name');
  assert(instance.ownedPaneIds().includes('library') === false, 'provisional ownership was rolled back');
  assert(host._calls.undocked === 1, 'the Library was returned to its original position');
  assert(host.isLibraryDocked() === false, 'the Library is not left docked');
  assert(host._paneElements.get('library') && host._paneElements.get('library').parentNode === host._libraryHome,
    'the SAME Library element is back under its original parent');
}

// ---------------------------------------------------------------------------
process.stdout.write('\nR5: closing Library returns the identical element; re-adding works\n');
// ---------------------------------------------------------------------------
{
  const fake = makeFakeDockview();
  const host = makeHost(); host._dockview = fake;
  const instance = adapter.activate(host);
  const libraryElement = host._paneElements.get('library');

  instance.addPane('library', 'library');
  const panel = fake._api.getPanel('library');
  fake._api.removePanel(panel);                  // a genuine user close of the Library tab

  assert(host._calls.undocked === 1, 'closing the Library undocked it');
  assert(host._paneElements.get('library') === libraryElement, 'it is the IDENTICAL element object, not a clone');
  assert(libraryElement.parentNode === host._libraryHome, 'it went back to its original parent');
  assert(instance.ownedPaneIds().includes('library') === false, 'ownership was released');

  const readd = instance.addPane('library', 'library');
  assert(readd.ok === true, 'the Library can be re-added after closing');
  assert(host._calls.docked === 2, 'it docked a second time');
  assert(fake._api.getPanel('library') !== null, 'the panel exists again');
}

// Awaited from the async section at the end of this file (a top-level `return` is not valid here).
async function restoreKeepsLibraryDocked() {
  process.stdout.write('\na restore-driven rebuild is a MOUNT transition — it must not undock\n');
  const fake = makeFakeDockview();
  const host = makeHost(); host._dockview = fake;
  host._loadResult = { ok: true, envelope: envelopeFor(['library']) };
  const instance = adapter.activate(host);
  instance.addPane('library', 'library');
  const undockedAfterAdd = host._calls.undocked;

  const result = await instance.restoreArrangement();
  assert(result.ok === true, 'the restore succeeds');
  assert(host._calls.undocked === undockedAfterAdd,
    'fromJSON clearing and rebuilding did NOT send the Library home mid-restore');
  assert(host.isLibraryDocked() === true, 'the Library is still docked after the rebuild');
  assert(instance.ownedPaneIds().includes('library'), 'ownership survived the rebuild');
}

// ---------------------------------------------------------------------------
process.stdout.write('\nevent shapes stay distinct per handler (they genuinely differ in the vendor)\n');
// ---------------------------------------------------------------------------
{
  const fake = makeFakeDockview();
  const host = makeHost(); host._dockview = fake;
  const focused = [];
  host.focusPane = (id) => focused.push(id);
  const instance = adapter.activate(host);
  instance.addPane('pty1', 'terminal');

  // onDidActivePanelChange really is `{ panel, origin }` (dockview.js: `.fire({ panel, origin })`).
  fake._listeners.active.forEach((fn) => fn({ panel: { id: 'pty1' }, origin: 'api' }));
  assert(focused.length === 1 && focused[0] === 'pty1',
    'onDidActivePanelChange is read as the WRAPPER { panel, origin } and focuses that pane');

  // onDidRemovePanel really is the panel itself (dockview.js: `.fire(event.panel)`).
  focused.length = 0;
  fake._listeners.remove.forEach((fn) => fn({ id: 'pty1' }));
  assert(host._calls.closePane.length === 1 && host._calls.closePane[0] === 'pty1',
    'onDidRemovePanel is read as the PANEL ITSELF and closes that pane');
}

// ---------------------------------------------------------------------------
(async () => {
  process.stdout.write('\nRESTORE moves the live panes into the rebuilt panels (both halves of fromJSON)\n');
  // -------------------------------------------------------------------------
  {
    const { fake, host, instance, paneEl, hostOf } = makeRestoreScenario(THREE);

    const oldHosts = { pty1: hostOf('pty1'), pty2: hostOf('pty2'), library: hostOf('library') };
    const oldControllers = { pty1: instance.registry.get('pty1'), pty2: instance.registry.get('pty2') };
    const oldObservers = { pty1: oldControllers.pty1._observer, pty2: oldControllers.pty2._observer };
    const createdBefore = host._calls.created.length;
    const observersBefore = observers.live;

    const result = await instance.restoreArrangement();

    assert(result && result.ok === true, 'the restore reports success');
    assert(host._calls.closePane.length === 0,
      'the app close path is never called during the internal clear/rebuild (no PTY is killed)');
    assert(host._calls.created.length === createdBefore,
      'no PTY and no pane is newly created during restore');

    // The load-bearing assertions: DOM ownership by OBJECT IDENTITY, not `getPanel(id) !== null`.
    for (const id of THREE) {
      const rebuiltHost = hostOf(id);
      assert(!!rebuiltHost && rebuiltHost !== oldHosts[id],
        `${id}: Dockview built a NEW panel host during the rebuild`);
      assert(rebuiltHost.children.includes(paneEl(id)),
        `${id}: the ORIGINAL pane element object is a child of the rebuilt panel host`);
      assert(paneEl(id).parentNode === rebuiltHost,
        `${id}: the original element's parent IS that rebuilt host`);
      assert(rebuiltHost.children.length === 1,
        `${id}: the rebuilt panel is not an empty shell (exactly one child)`);
      assert(!oldHosts[id].children.includes(paneEl(id)),
        `${id}: the discarded panel host no longer owns the element`);
      assert(instance.paneIsMounted(id) === true, `${id}: the adapter agrees the pane is mounted`);
    }

    assert(oldControllers.pty1.isDisposed() === true && oldControllers.pty2.isDisposed() === true,
      'the pre-restore fit controllers were disposed during the clear');
    assert(oldObservers.pty1._disconnected === true && oldObservers.pty2._disconnected === true,
      'their ResizeObservers were disconnected during the clear');
    assert(instance.registry.get('pty1') !== oldControllers.pty1,
      'the restored terminal carries a NEW controller, not the disposed one');
    assert(instance.registry.size() === 2,
      'exactly one fit controller per restored terminal (the Library pane needs none)');
    assert(observers.live === observersBefore,
      'exactly one live adapter ResizeObserver per restored terminal — none accumulated, none lost');
    assert(instance.ownedPaneIds().sort().join(',') === 'library,pty1,pty2',
      'pane ownership survived the rebuild intact');
    assert(/restored/i.test(statusText(host)), 'the status says the arrangement was restored');
    assert(!/pty\d/.test(statusText(host)), 'and names no pane');
  }

  process.stdout.write('\nRESTORE is repeatable: three cycles leak nothing\n');
  // -------------------------------------------------------------------------
  {
    const { host, instance, paneEl, hostOf } = makeRestoreScenario(THREE);
    const framesBefore = frames.pending;
    const observersBefore = observers.live;

    for (let cycle = 1; cycle <= 3; cycle++) {
      const r = await instance.restoreArrangement();
      assert(r && r.ok === true, `cycle ${cycle}: restore succeeds`);
      assert(instance.registry.size() === 2, `cycle ${cycle}: still exactly 2 controllers`);
      assert(observers.live === observersBefore, `cycle ${cycle}: still exactly 2 live observers`);
      assert(instance.ownedPaneIds().length === 3, `cycle ${cycle}: still exactly 3 owned panes`);
      assert(THREE.every((id) => paneEl(id).parentNode === hostOf(id)),
        `cycle ${cycle}: every live pane is parented to its current panel host`);
    }
    assert(frames.pending <= framesBefore + 2,
      'pending animation frames do not accumulate across restore cycles');
    assert(host._calls.closePane.length === 0, 'no PTY was killed across three cycles');
  }

  process.stdout.write('\nafter a restore, closing still works in BOTH directions, exactly once\n');
  // -------------------------------------------------------------------------
  {
    const { fake, host, instance } = makeRestoreScenario(THREE);
    await instance.restoreArrangement();

    // The re-entrancy guard is scoped to the synchronous fromJSON call, so a genuine user close
    // afterwards is NOT suppressed.
    fake._api.removePanel(fake._api.getPanel('pty1'));
    assert(host._calls.closePane.length === 1 && host._calls.closePane[0] === 'pty1',
      'closing a RESTORED Dockview tab reaches the app close path exactly once');
    assert(instance.registry.has('pty1') === false, 'that pane\'s controller is released');
    assert(instance.ownedPaneIds().includes('pty1') === false, 'that pane\'s ownership is released');
    assert(instance.paneIsMounted('pty1') === false, 'and it is no longer considered mounted');

    // The inverse direction, after a restore, still removes the panel without recursing.
    instance.onAppPaneClosed('pty2');
    assert(fake._api.getPanel('pty2') === null, 'the app-owned ✕ removes the restored Dockview panel');
    assert(host._calls.closePane.length === 1,
      'and does not re-enter the app close path (no recursion between the two directions)');
    assert(instance.ownedPaneIds().sort().join(',') === 'library', 'only the Library pane remains owned');
  }

  // ---------------------------------------------------------------------------
  process.stdout.write('\nEXACT saved/live set equality gates every restore\n');
  // ---------------------------------------------------------------------------
  // The two sets are derived INDEPENDENTLY — saved from the validated saved layout, live from the
  // adapter's own ownership map — so this can never be a tautology.
  {
    // (a) equal sets, different ORDER: allowed. Order alone is not a mismatch.
    const s = makeRestoreScenario(['library', 'pty2', 'pty1'], ['pty1', 'pty2', 'library']);
    const r = await s.instance.restoreArrangement();
    assert(r.ok === true, 'the same three panes in a different saved order restore normally');
  }
  {
    // (b) saved names a pane that is NOT open -> mounting an empty shell is refused.
    const s = makeRestoreScenario(['pty1', 'pty2', 'library'], ['pty1', 'pty2']);
    const before = s.instance.ownedPaneIds().sort().join(',');
    const r = await s.instance.restoreArrangement();
    assert(r.ok === false && r.reason === R.SAVED_NOT_LIVE,
      `a saved pane that is not live refuses as ${R.SAVED_NOT_LIVE} (saw ${r.reason})`);
    assert(s.fake._api._panels.size === 2, 'fromJSON was never called — the workspace is untouched');
    assert(s.instance.ownedPaneIds().sort().join(',') === before, 'ownership is unchanged');
    assert(s.host._calls.closePane.length === 0, 'and nothing was closed');
    assert(!/pty\d|library/.test(statusText(s.host)), 'the status names no pane');
  }
  {
    // (c) a pane is OPEN that the saved state does not mention -> stranding it is refused.
    const s = makeRestoreScenario(['pty1'], ['pty1', 'pty2']);
    const r = await s.instance.restoreArrangement();
    assert(r.ok === false && r.reason === R.LIVE_NOT_SAVED,
      `an extra live pane refuses as ${R.LIVE_NOT_SAVED} (saw ${r.reason})`);
    assert(s.fake._api._panels.size === 2, 'fromJSON was never called');
    assert(s.host._calls.closePane.length === 0, 'and the extra pane was NOT closed to make it fit');
  }
  {
    // (d) EQUAL COUNTS, different IDs — the case a length check would wave through.
    const s = makeRestoreScenario(['pty1', 'pty3'], ['pty1', 'pty2']);
    const r = await s.instance.restoreArrangement();
    assert(r.ok === false && r.reason === R.PANE_SET_MISMATCH,
      `equal counts with different IDs refuse as ${R.PANE_SET_MISMATCH} (saw ${r.reason})`);
    assert(s.fake._api._panels.size === 2, 'fromJSON was never called');
  }

  // ---------------------------------------------------------------------------
  process.stdout.write('\nMALFORMED saved state can never reach fromJSON\n');
  // ---------------------------------------------------------------------------
  {
    const MALFORMED = [
      ['a layout with no grid', (e) => { delete e.layout.grid; }, R.LAYOUT_SHAPE],
      ['a populated `params`', (e) => { e.layout.panels.pty1.params = { cwd: 'D:\\Workspace' }; }, R.LAYOUT_SHAPE],
      ['a title carrying a path', (e) => { e.layout.panels.pty1.title = 'C:\\secrets\\key'; }, R.UNSAFE_CONTENT],
      ['an unknown component kind', (e) => { e.layout.panels.pty1.contentComponent = 'iframe'; }, R.UNKNOWN_COMPONENT],
      ['an unknown top-level layout key', (e) => { e.layout.floatingGroups = []; }, R.LAYOUT_SHAPE],
      ['a wrong schema version', (e) => { e.schemaVersion = 2; }, R.SCHEMA_VERSION],
      ['a wrong package version', (e) => { e.packageVersion = '8.0.0'; }, R.PACKAGE_VERSION],
      ['a malformed timestamp', (e) => { e.savedAt = 'yesterday'; }, R.TIMESTAMP],
      ['an envelope that is not an object', null, R.ENVELOPE_SHAPE],
    ];
    for (const [label, mutate, reason] of MALFORMED) {
      const s = makeRestoreScenario(THREE);
      const envelope = mutate ? envelopeFor(THREE) : 'not-an-envelope';
      if (mutate) mutate(envelope);
      s.host._loadResult = { ok: true, envelope };
      const panelsBefore = s.fake._api._panels.size;

      const r = await s.instance.restoreArrangement();
      assert(r.ok === false && r.reason === reason,
        `${label} refuses as ${reason} (saw ${r.reason})`);
      assert(s.fake._api._panels.size === panelsBefore,
        `${label}: fromJSON was NEVER called — the live workspace is untouched`);
      assert(s.host._calls.closePane.length === 0, `${label}: no PTY was killed`);
      assert(s.host._calls.created.length === 0, `${label}: no pane was created`);
      // Bounded and content-free: the reason is a code from the closed set, and the status carries
      // no fragment of the offending state.
      assert(layoutPolicy.REASON_CODES.has(r.reason), `${label}: the reason is inside the closed set`);
      assert(!/D:\\|C:\\|secrets|iframe|floatingGroups/.test(statusText(s.host)),
        `${label}: the status echoes no fragment of the refused state`);
      assert(!s.host._calls.logs.some((l) => /D:\\|C:\\|secrets/.test(l)),
        `${label}: neither does the log`);
    }
  }

  process.stdout.write('\nan apply failure AFTER the clear rolls back transactionally\n');
  // -------------------------------------------------------------------------
  {
    const { fake, host, instance, paneEl, hostOf } = makeRestoreScenario(THREE);
    const createdBefore = host._calls.created.length;
    fake._failFromJSON('after-clear', { once: true });

    const result = await instance.restoreArrangement();

    assert(result && result.ok === false && result.reason === R.APPLY_THREW,
      `a bounded failure reason is returned (saw ${result.reason})`);
    assert(result.rollback === 'restored', 'and the rollback is reported as successful');
    assert(host._calls.closePane.length === 0, 'no PTY was killed by the failed apply');
    assert(host._calls.created.length === createdBefore,
      'no replacement terminal was created — there is no fallback layout');
    for (const id of THREE) {
      assert(instance.paneIsMounted(id) === true, `${id}: is mounted again after rollback`);
      assert(paneEl(id).parentNode === hostOf(id), `${id}: parented to its rebuilt host, not stranded`);
      assert(hostOf(id).children.length === 1, `${id}: the rolled-back panel is not an empty shell`);
    }
    assert(instance.ownedPaneIds().sort().join(',') === 'library,pty1,pty2', 'all panes remain owned');
    assert(/put back/i.test(statusText(host)), 'the status says the previous arrangement was put back');
    assert(!host._calls.logs.some((l) => /synthetic apply failure/.test(l)),
      'the exception text is NEVER echoed into the log');
  }

  process.stdout.write('\nan apply failure DURING the rebuild also rolls back, with no empty shells\n');
  // -------------------------------------------------------------------------
  {
    const { fake, host, instance, paneEl, hostOf } = makeRestoreScenario(THREE);
    const createdBefore = host._calls.created.length;
    fake._failFromJSON('mid-rebuild', { once: true });

    const result = await instance.restoreArrangement();

    assert(result && result.ok === false && result.reason === R.APPLY_THREW,
      'a partial rebuild also returns the bounded failure reason');
    assert(host._calls.closePane.length === 0, 'no PTY was killed');
    assert(host._calls.created.length === createdBefore, 'no PTY was created');
    for (const id of THREE) {
      assert(instance.paneIsMounted(id) === true, `${id}: recovered by the rollback`);
      assert(paneEl(id).parentNode === hostOf(id), `${id}: owns its element again`);
      assert(hostOf(id).children.length === 1, `${id}: no empty shell survived the partial rebuild`);
    }
    assert(instance.registry.size() === 2, 'exactly one controller per terminal after rollback');
    assert(instance.ownedPaneIds().length === 3, 'no pane entry was lost by the partial rebuild');
  }

  process.stdout.write('\nan apply that SILENTLY drops a pane is caught, not reported as success\n');
  // -------------------------------------------------------------------------
  // "Did not throw" is not "mounted". This is the shape that once let a restore report success over
  // empty shells, so it is caught by verification rather than by an exception.
  {
    const { fake, host, instance } = makeRestoreScenario(THREE);
    fake._failFromJSON('drop-last', { once: true });

    const result = await instance.restoreArrangement();
    assert(result.ok === false && result.reason === R.APPLY_INCOMPLETE,
      `a silently missing pane is caught as ${R.APPLY_INCOMPLETE} (saw ${result.reason})`);
    assert(result.rollback === 'restored', 'and rolled back');
    assert(host._calls.closePane.length === 0, 'without killing a PTY');
    assert(instance.ownedPaneIds().length === 3, 'every pane is still owned');
  }

  process.stdout.write('\nan apply that produces an UNEXPECTED panel is caught too\n');
  // -------------------------------------------------------------------------
  {
    const { fake, host, instance } = makeRestoreScenario(THREE);
    fake._failFromJSON('extra-panel', { once: true });

    const result = await instance.restoreArrangement();
    assert(result.ok === false && result.reason === R.UNEXPECTED_PANEL,
      `a panel nobody expected is caught as ${R.UNEXPECTED_PANEL} (saw ${result.reason})`);
    assert(host._calls.closePane.length === 0, 'without killing a PTY');
  }

  process.stdout.write('\na mounted pane inside a hidden group is caught and rolled back\n');
  // -------------------------------------------------------------------------
  // This differs from `visible:false` in the serialized target, which the shared policy refuses
  // before fromJSON. It models the vendor silently collapsing a group from otherwise valid state:
  // IDs, object identity, DOM parentage, and ownership still match, so only the explicit group-
  // reachability proof can catch it.
  {
    const { fake, host, instance, paneEl } = makeRestoreScenario(THREE);
    const originals = new Map(THREE.map((id) => [id, paneEl(id)]));
    const createdBefore = host._calls.created.length;
    fake._failFromJSON('hide-last', { once: true });

    const result = await instance.restoreArrangement();
    assert(result && result.ok === false && result.reason === R.APPLY_INCOMPLETE,
      `a hidden pane group refuses as ${R.APPLY_INCOMPLETE} (saw ${result && result.reason})`);
    assert(result.rollback === 'restored', 'the prior reachable arrangement is restored');
    assert(host._calls.closePane.length === 0, 'the hidden-group refusal closes zero PTYs');
    assert(host._calls.created.length === createdBefore, 'the hidden-group refusal creates zero PTYs');
    for (const id of THREE) {
      assert(paneEl(id) === originals.get(id), `${id}: rollback retains the ORIGINAL element object`);
      assert(instance.paneIsMounted(id) === true, `${id}: rollback leaves the original object mounted`);
    }
    assert(/previous arrangement was put back/i.test(statusText(host)),
      'the visible status reports the successful rollback');
  }

  process.stdout.write('\nan inactive tab remains valid when its owning group is reachable\n');
  // -------------------------------------------------------------------------
  {
    const { fake, host, instance } = makeRestoreScenario(THREE);
    // Dockview hides an inactive tab's renderer but leaves the group and its tab strip visible.
    // Reachability is therefore proved at the GROUP, not by demanding that every pane body have an
    // offsetParent simultaneously.
    fake._failFromJSON('hide-pane-last', { once: true });
    const result = await instance.restoreArrangement();
    assert(result && result.ok === true,
      'a hidden inactive pane body is accepted while its group remains reachable');
    assert(host._calls.closePane.length === 0 && host._calls.created.length === 0,
      'the valid tabbed-state apply creates and closes nothing');
  }

  process.stdout.write('\npanel enumeration failure is fail-closed, and a transient fault rolls back\n');
  // -------------------------------------------------------------------------
  // Reading `api.panels` is part of the proof that no unexpected panel survived. A throwing getter
  // must therefore refuse rather than skip that check. This fault is transient: the target apply
  // cannot be verified, but the rollback can enumerate normally and must restore the exact objects.
  {
    const { fake, host, instance, paneEl } = makeRestoreScenario(THREE);
    const originals = new Map(THREE.map((id) => [id, paneEl(id)]));
    const createdBefore = host._calls.created.length;
    fake._failPanelEnumeration('throw', { once: true });

    const result = await instance.restoreArrangement();
    assert(result.ok === false && result.reason === R.APPLY_INCOMPLETE,
      `a throwing panel getter refuses as ${R.APPLY_INCOMPLETE} (saw ${result.reason})`);
    assert(result.rollback === 'restored', 'the transient enumeration fault rolls back successfully');
    assert(host._calls.closePane.length === 0, 'the refusal closes zero PTYs');
    assert(host._calls.created.length === createdBefore, 'the refusal creates zero PTYs');
    for (const id of THREE) {
      assert(paneEl(id) === originals.get(id), `${id}: rollback retains the ORIGINAL element object`);
      assert(instance.paneIsMounted(id) === true, `${id}: rollback leaves the original object mounted`);
    }
    assert(/previous arrangement was put back/i.test(statusText(host)),
      'the visible status reports the successful rollback');
  }

  process.stdout.write('\npersistently unavailable or non-array panel enumeration reports incomplete rollback\n');
  // -------------------------------------------------------------------------
  // Both non-throwing invalid shapes are persistent here. Verification must refuse the target apply,
  // then refuse the rollback verification too — never convert an unverified rollback into success.
  for (const mode of ['unavailable', 'non-array']) {
    const { fake, host, instance } = makeRestoreScenario(THREE);
    const createdBefore = host._calls.created.length;
    fake._failPanelEnumeration(mode);

    const result = await instance.restoreArrangement();
    assert(result.ok === false && result.reason === R.APPLY_INCOMPLETE,
      `${mode}: invalid panel enumeration refuses as ${R.APPLY_INCOMPLETE}`);
    assert(result.rollback === 'incomplete', `${mode}: rollback is reported incomplete, never restored`);
    assert(host._calls.closePane.length === 0, `${mode}: zero PTYs were closed`);
    assert(host._calls.created.length === createdBefore, `${mode}: zero PTYs were created`);
    assert(/could NOT be fully put back/i.test(statusText(host)),
      `${mode}: the visible status admits the rollback could not be verified`);
  }

  process.stdout.write('\nan INCOMPLETE rollback is reported as incomplete, never as success\n');
  // -------------------------------------------------------------------------
  // The honest failure mode: the apply failed AND the rollback could not put everything back. There
  // is deliberately no second repair strategy, so this must be visible rather than patched over.
  {
    const { fake, host, instance } = makeRestoreScenario(THREE);
    fake._failFromJSON('drop-last');   // stays on, so the rollback's own fromJSON also drops a pane

    const result = await instance.restoreArrangement();
    assert(result.ok === false, 'the operation fails');
    assert(result.rollback === 'incomplete',
      `the rollback is reported INCOMPLETE (saw ${result.rollback})`);
    assert(/could NOT be\s+fully put back|could NOT be fully put back/i.test(statusText(host)),
      'and the status says so explicitly rather than claiming the previous arrangement is back');
    assert(host._calls.closePane.length === 0, 'still without killing a PTY');
    assert(host._calls.created.length === 0, 'and without creating one');
  }

  process.stdout.write('\nRestore with no saved arrangement refuses and creates NOTHING\n');
  // -------------------------------------------------------------------------
  {
    const fake = makeFakeDockview();
    const host = makeHost(); host._dockview = fake;
    const instance = adapter.activate(host);
    const result = await instance.restoreArrangement();
    assert(result && result.ok === false && result.reason === R.NOT_FOUND, 'the missing-state reason is surfaced');
    assert(host._calls.logs.some((l) => /no-saved-layout/.test(l)), 'the reason is logged');
    assert(/no saved arrangement/i.test(statusText(host)), 'and stated plainly in the status');
    assert(host._calls.created.length === 0, 'restore failure created NO terminal');
    assert(fake._addPanelCalls.length === 0, 'restore failure created NO pane');
    assert(instance.ownedPaneIds().length === 0, 'the workspace is untouched');
  }

  process.stdout.write('\na saved-file inspection failure is not reported as absence\n');
  // -------------------------------------------------------------------------
  {
    const fake = makeFakeDockview();
    const host = makeHost(); host._dockview = fake;
    host._loadResult = { ok: false, reason: R.READ_FAILED };
    const instance = adapter.activate(host);
    const result = await instance.restoreArrangement();
    assert(result && result.ok === false && result.reason === R.READ_FAILED,
      'the main-side inspection failure is surfaced as read-failed');
    assert(/Restore refused \(read-failed\)/.test(statusText(host)),
      'the UI reports an inspection refusal rather than claiming no arrangement exists');
    assert(!/no saved arrangement/i.test(statusText(host)),
      'the absence message is reserved for a genuine ENOENT result');
    assert(host._calls.created.length === 0 && host._calls.closePane.length === 0,
      'the inspection refusal creates and closes nothing');
  }

  // ---------------------------------------------------------------------------
  process.stdout.write('\nSAVE validates BEFORE it calls main, and writes metadata only\n');
  // ---------------------------------------------------------------------------
  {
    const { fake, host, instance } = makeRestoreScenario(THREE);
    const result = await instance.saveArrangement();
    assert(result.ok === true, 'a coherent workspace saves');
    assert(host._calls.saved.length === 1, 'main was called exactly once');
    assert(layoutPolicy.validateLayout(host._calls.saved[0]) === null,
      'and what crossed to main is a layout the SHARED validator accepts');
    const ids = layoutPolicy.paneIdsFromLayout(host._calls.saved[0]);
    assert(layoutPolicy.comparePaneSets(ids.sorted, instance.ownedPaneIds()).ok === true,
      'describing exactly the panes the adapter owns');
    assert(host._calls.closePane.length === 0 && host._calls.created.length === 0,
      'saving creates and kills nothing');
    assert(fake._api._panels.size === 3, 'and changes no live arrangement');
    assert(/saved/i.test(statusText(host)) && !/pty\d/.test(statusText(host)),
      'the status reports success without naming a pane');
  }
  {
    // A save whose pane sets disagree must never reach main — so a previously saved VALID
    // arrangement cannot be replaced by an incoherent one.
    const { host, instance } = makeRestoreScenario(THREE);
    // Own a pane Dockview does not have a panel for: toJSON and ownership now disagree.
    instance.addPane('pty2', 'terminal');           // duplicate add is refused, ownership unchanged
    host._paneElements.set('pty3', { tagName: 'div', children: [], parentNode: null, isConnected: true,
      appendChild(c) { this.children.push(c); c.parentNode = this; return c; },
      removeChild(c) { this.children = this.children.filter((x) => x !== c); },
      querySelector() { return null; }, getBoundingClientRect() { return { width: 1, height: 1 }; },
      style: {}, dataset: {}, setAttribute() {}, removeAttribute() {}, className: '', id: '', textContent: '',
      get offsetParent() { return this.parentNode || {}; } });
    const savedBefore = host._calls.saved.length;
    // Force the disagreement: the adapter owns pty3 but Dockview never got a panel for it.
    instance.addPane('pty3', 'terminal');
    host._dockview._api._panels.delete('pty3');
    const result = await instance.saveArrangement();
    assert(result.ok === false, 'a workspace whose pane sets disagree refuses to save');
    assert(result.reason === R.LIVE_NOT_SAVED || result.reason === R.PANE_NOT_MOUNTED,
      `by name (saw ${result.reason})`);
    assert(host._calls.saved.length === savedBefore,
      'main was NEVER called, so no previously saved arrangement could be overwritten');
  }
  {
    // Main refusing is surfaced, not swallowed.
    const { host, instance } = makeRestoreScenario(THREE);
    host._saveResult = { ok: false, reason: R.WRITE_FAILED };
    const result = await instance.saveArrangement();
    assert(result.ok === false && result.reason === R.WRITE_FAILED, 'main\'s refusal is returned by name');
    assert(/unchanged/i.test(statusText(host)),
      'and the status says any previously saved arrangement is unchanged');
  }

  // ---------------------------------------------------------------------------
  process.stdout.write('\nRESET CURRENT ARRANGEMENT re-arranges, and creates nothing\n');
  // ---------------------------------------------------------------------------
  {
    const { fake, host, instance, paneEl } = makeRestoreScenario(THREE);
    const elementsBefore = new Map(THREE.map((id) => [id, paneEl(id)]));
    const createdBefore = host._calls.created.length;
    const loadsBefore = host._calls.saved.length;

    const result = await instance.resetArrangement();

    assert(result.ok === true, 'the reset succeeds');
    assert(host._calls.created.length === createdBefore,
      'ZERO terminals were created — the prototype default-workspace behaviour is gone');
    assert(host._calls.closePane.length === 0, 'ZERO terminals were closed');
    assert(host._calls.saved.length === loadsBefore, 'no file was written');
    assert(host._calls.cleared === 0, 'and none was deleted');
    assert(instance.ownedPaneIds().sort().join(',') === 'library,pty1,pty2',
      'the EXACT live pane set is preserved');
    for (const id of THREE) {
      assert(paneEl(id) === elementsBefore.get(id), `${id}: the element object is identical`);
      assert(instance.paneIsMounted(id) === true, `${id}: and it is mounted`);
    }
    assert(host._calls.docked === 1 && host._calls.undocked === 0,
      'the Library was neither re-docked nor sent home — it was already open and stays open');
    // The documented default: one horizontal row, canonical order, every pane visible.
    const applied = fake._api.toJSON();
    const ids = layoutPolicy.paneIdsFromLayout(applied);
    assert(JSON.stringify(ids.ordered) === JSON.stringify(['pty1', 'pty2', 'library']),
      `panes are arranged in canonical order (saw ${JSON.stringify(ids.ordered)})`);
    assert(/reset/i.test(statusText(host)) && !/pty\d/.test(statusText(host)),
      'the status reports the reset without naming a pane');
  }
  {
    // An empty workspace has nothing to re-arrange, and must NOT be an excuse to create panes.
    const fake = makeFakeDockview();
    const host = makeHost(); host._dockview = fake;
    const instance = adapter.activate(host);
    const result = await instance.resetArrangement();
    assert(result.ok === false && result.reason === R.NO_LIVE_PANES,
      `an empty workspace refuses as ${R.NO_LIVE_PANES} (saw ${result.reason})`);
    assert(host._calls.created.length === 0, 'and creates NOTHING');
    assert(fake._addPanelCalls.length === 0, 'not even a pane');
  }
  {
    // A failed reset rolls back to the prior topology, exactly like a failed restore.
    const { fake, host, instance, paneEl } = makeRestoreScenario(THREE);
    const elementsBefore = new Map(THREE.map((id) => [id, paneEl(id)]));
    fake._failFromJSON('after-clear', { once: true });

    const result = await instance.resetArrangement();
    assert(result.ok === false && result.reason === R.APPLY_THREW, 'the failure is bounded');
    assert(result.rollback === 'restored', 'and the prior topology was put back');
    assert(instance.ownedPaneIds().length === 3, 'every pane is still owned');
    for (const id of THREE) {
      assert(paneEl(id) === elementsBefore.get(id), `${id}: still the identical element object`);
      assert(instance.paneIsMounted(id) === true, `${id}: and mounted again`);
    }
    assert(host._calls.closePane.length === 0 && host._calls.created.length === 0,
      'a failed reset creates and kills nothing');
  }

  // ---------------------------------------------------------------------------
  process.stdout.write('\nCLEAR SAVED ARRANGEMENT touches metadata only, and says so\n');
  // ---------------------------------------------------------------------------
  {
    const { fake, host, instance } = makeRestoreScenario(THREE);
    const ownedBefore = instance.ownedPaneIds().sort().join(',');
    const panesBefore = fake._addPanelCalls.length;

    const r = await instance.clearSavedArrangement();
    assert(r && r.ok === true, 'the saved metadata was cleared');
    assert(host._calls.cleared === 1, 'main\'s reset was called exactly once');
    assert(instance.ownedPaneIds().sort().join(',') === ownedBefore, 'no pane was closed');
    assert(fake._addPanelCalls.length === panesBefore, 'no pane was created');
    assert(host._calls.closePane.length === 0, 'no PTY was killed');
    assert(fake._api._panels.size === 3, 'and fromJSON was never called — the arrangement is untouched');
    assert(/live panes were NOT changed/i.test(statusText(host)),
      'the status states explicitly that live panes were unchanged');
  }
  {
    // An already-absent file is a SUCCESSFUL no-op, distinguished in the status.
    const { host, instance } = makeRestoreScenario(THREE);
    host._resetResult = { ok: true, existed: false };
    const r = await instance.clearSavedArrangement();
    assert(r.ok === true && r.existed === false, 'an already-absent file still succeeds');
    assert(/no saved arrangement to clear/i.test(statusText(host)),
      'and the status distinguishes it from an actual deletion');
  }
  {
    const { host, instance } = makeRestoreScenario(THREE);
    host._resetResult = { ok: false, reason: R.WRITE_FAILED };
    const r = await instance.clearSavedArrangement();
    assert(r.ok === false && r.reason === R.WRITE_FAILED, 'a refusal from main is surfaced by name');
    assert(/live panes were NOT changed/i.test(statusText(host)),
      'and still states that live panes were unchanged');
  }

  // ---------------------------------------------------------------------------
  process.stdout.write('\nEXACTLY ONE layout operation may run at a time\n');
  // ---------------------------------------------------------------------------
  {
    const { host, instance } = makeRestoreScenario(THREE);
    // Hold main's load open so the restore is genuinely mid-flight when the second call arrives.
    let release = null;
    const gate = new Promise((resolve) => { release = resolve; });
    host._loadResult = null;
    host.bridge.loadLayout = async () => { await gate; return { ok: true, envelope: envelopeFor(THREE) }; };

    const first = instance.restoreArrangement();
    assert(instance.busyOperation() === 'restore', 'the first operation claims the layout');

    // Every other operation, including a second restore, is refused while it is held.
    const overlapping = await Promise.all([
      instance.restoreArrangement(),
      instance.saveArrangement(),
      instance.resetArrangement(),
      instance.clearSavedArrangement(),
    ]);
    for (const r of overlapping) {
      assert(r.ok === false && r.reason === R.BUSY,
        `an overlapping operation is refused as ${R.BUSY} (saw ${r.reason})`);
    }
    assert(host._calls.saved.length === 0, 'the overlapping save never reached main');
    assert(host._calls.cleared === 0, 'nor did the overlapping clear');
    assert(/still running/i.test(statusText(host)), 'and the refusal is visible in the status');

    release();
    const result = await first;
    assert(result.ok === true, 'the first operation completes normally');
    assert(instance.busyOperation() === null, 'and releases the layout when it finishes');

    // After it releases, a normal operation works again — the busy state is not sticky.
    const after = await instance.clearSavedArrangement();
    assert(after.ok === true, 'a later operation is accepted once the layout is free');
  }
  {
    // The release is in `finally`: an operation that throws internally must not deadlock the UI.
    const { host, instance } = makeRestoreScenario(THREE);
    host.bridge.loadLayout = async () => { throw new Error('synthetic bridge explosion'); };
    let threw = false;
    try { await instance.restoreArrangement(); } catch { threw = true; }
    assert(threw === true, 'a throwing bridge propagates rather than being silently swallowed');
    assert(instance.busyOperation() === null,
      'and the busy state is released anyway — the four controls are never left permanently dead');
    const after = await instance.clearSavedArrangement();
    assert(after.ok === true, 'the next operation is accepted');
  }

  // ---------------------------------------------------------------------------
  process.stdout.write('\nthe four controls are enabled, stable, and create nothing\n');
  // ---------------------------------------------------------------------------
  {
    const { host, instance } = makeRestoreScenario(THREE);
    assert(JSON.stringify(instance.controlIds())
      === JSON.stringify(['dvSaveArrangement', 'dvRestoreArrangement', 'dvResetArrangement', 'dvClearSaved']),
      `the four stable control ids are exactly as documented (saw ${JSON.stringify(instance.controlIds())})`);
    assert(typeof instance.saveArrangement === 'function'
      && typeof instance.restoreArrangement === 'function'
      && typeof instance.resetArrangement === 'function'
      && typeof instance.clearSavedArrangement === 'function',
      'all four operations are on the instance surface');
    // The prototype's terminal-multiplying routine is GONE from the surface, not merely unbound.
    assert(instance.useDefaultLayout === undefined,
      'NEGATIVE CONTROL: useDefaultLayout does not exist — nothing can reach a pane-creating layout op');
    assert(host._calls.created.length === 0, 'and standing the controls up created nothing');
  }

  process.stdout.write('\nR5: closing every terminal returns live and owned counts to zero\n');
  // -------------------------------------------------------------------------
  {
    const fake = makeFakeDockview();
    const host = makeHost(); host._dockview = fake;
    const instance = adapter.activate(host);
    instance.addPane('pty1', 'terminal');
    instance.addPane('pty2', 'terminal');
    assert(instance.diagnostics().ownedPanes === 2, 'two terminal panes are owned');
    assert(instance.diagnostics().fitControllers === 2, 'each has exactly one fit controller');

    for (const id of ['pty1', 'pty2']) fake._api.removePanel(fake._api.getPanel(id));

    const d = instance.diagnostics();
    assert(d.ownedPanes === 0, 'Dockview ownership returns to zero');
    assert(d.ownedPaneIds.length === 0, 'no owned pane IDs remain');
    assert(d.fitControllers === 0, 'no fit controller remains');
    assert(host._calls.closePane.sort().join(',') === 'pty1,pty2', 'each PTY close path ran exactly once');
    // Monotonic IDs are preserved by the app, not reset here — a later "Terminal 17" label does not
    // imply 17 live terminals, which is exactly what these counters disambiguate.
    assert(instance.ownedPaneIds().length === 0, 'the adapter owns nothing after closing everything');
  }

  await restoreKeepsLibraryDocked();

  process.stdout.write('\nthe adapter has NO audio contract at all — it cannot move the controls\n');
  // -------------------------------------------------------------------------
  // NEGATIVE CONTROL against the prototype adapter. That build preflighted `audioControlsCount()`
  // before doing anything and refused with `audio-controls-missing` when the host did not implement
  // it, then borrowed `.tts-controls` into a slot of its own. `makeHost` implements NONE of that
  // contract, so a prototype-era adapter cannot activate against it and every assertion in this
  // file would fail — which is exactly what makes the absence provable rather than asserted.
  {
    const fake = makeFakeDockview();
    const host = makeHost(); host._dockview = fake;
    const AUDIO_MEMBERS = ['audioControlsCount', 'dockAudioControls', 'undockAudioControls', 'isAudioControlsDocked'];
    for (const member of AUDIO_MEMBERS) {
      assert(!(member in host), `the host surface does not implement ${member}`);
    }

    const instance = adapter.activate(host);
    assert(instance.ok === true, 'the adapter activates against a host with no audio contract at all');
    assert(fake._created === true, 'and really did instantiate Dockview');
    instance.addPane('pty1', 'terminal');
    instance.addPane('library', 'library');

    // Nothing the adapter builds is an audio slot, and nothing it logs mentions one.
    const slotNames = host.getContainer().children.map((c) => c.className);
    assert(!slotNames.some((n) => /audio/i.test(n)),
      `the adapter builds no audio slot (built: ${JSON.stringify(slotNames)})`);
    assert(!host._calls.logs.some((l) => /audio/i.test(l)), 'and never logs about audio');
    const diag = instance.diagnostics();
    assert(!('audioControlsDocked' in diag), 'diagnostics carry no audio field');

    instance.dispose();
    assert(!host._calls.logs.some((l) => /audio/i.test(l)), 'teardown does not mention audio either');
  }

  process.stdout.write('\nmaximize goes through the verified panel API and refits through the owner\n');
  // -------------------------------------------------------------------------
  {
    const fake = makeFakeDockview();
    const host = makeHost(); host._dockview = fake;
    const instance = adapter.activate(host);
    instance.addPane('pty1', 'terminal');
    instance.addPane('pty2', 'terminal');

    assert(instance.isPaneMaximized('pty1') === false, 'nothing is maximized to begin with');

    const first = instance.maximizePane('pty1');
    assert(!!first && first.maximized === true, 'maximizing a hosted pane reports maximized:true');
    assert(fake._maximizeCalls.join(',') === 'pty1', 'it called panel.api.maximize() exactly once, on that panel');
    assert(instance.isPaneMaximized('pty1') === true, 'and the adapter agrees the pane is maximized');
    assert(instance.isPaneMaximized('pty2') === false, 'while its sibling is not');

    // The SAME control restores. The adapter reads isMaximized() rather than tracking its own copy,
    // so a maximize performed by any other route (a dockview control, a later panel API call)
    // cannot desynchronise it.
    const second = instance.maximizePane('pty1');
    assert(!!second && second.maximized === false, 'clicking again reports maximized:false');
    assert(fake._exitCalls.join(',') === 'pty1', 'it called panel.api.exitMaximized() exactly once');
    assert(fake._maximizeCalls.length === 1, 'and did NOT call maximize() a second time');
    assert(instance.isPaneMaximized('pty1') === false, 'nothing is maximized again');

    // Dockview permits ONE maximized group, so maximizing the sibling silently un-maximizes the
    // first. The app repaints both glyphs from isPaneMaximized for exactly this reason.
    instance.maximizePane('pty1');
    instance.maximizePane('pty2');
    assert(instance.isPaneMaximized('pty2') === true, 'maximizing the sibling maximizes it');
    assert(instance.isPaneMaximized('pty1') === false,
      'and the previously maximized pane reports itself restored — the glyph source of truth is honest');
  }

  process.stdout.write('\nmaximize REFUSES rather than falling through to the grid maximizer\n');
  // -------------------------------------------------------------------------
  {
    const fake = makeFakeDockview();
    const host = makeHost(); host._dockview = fake;
    const instance = adapter.activate(host);
    instance.addPane('pty1', 'terminal');

    // (a) not ours -> null, so the CALLER may use the classic grid maximizer for that pane.
    assert(instance.maximizePane('pty2') === null, 'a pane this adapter does not host returns null');
    assert(instance.isPaneMaximized('pty2') === null, 'and its maximized state is unknowable, not false');
    assert(instance.maximizePane(null) === null, 'a missing pane ID returns null');

    // (b) ours, but the panel API rejects -> null AND a visible refusal. The caller must treat this
    // as a full stop; silently running the grid maximizer would hide the siblings of a grid that is
    // not even on screen.
    fake._api._maximizeThrows = true;
    const logsBefore = host._calls.logs.length;
    assert(instance.maximizePane('pty1') === null, 'a rejecting panel API returns null');
    const newLogs = host._calls.logs.slice(logsBefore);
    assert(newLogs.some((l) => /maximize REFUSED/.test(l)), 'and the refusal is VISIBLE in the log');
    assert(newLogs.every((l) => !/synthetic/.test(l)), 'without echoing the exception text');
    assert(host._calls.closePane.length === 0, 'and nothing was closed by the refusal');
  }

  process.stdout.write('\nresize ownership transfers one way only — the adapter never takes it back\n');
  // -------------------------------------------------------------------------
  {
    const fake = makeFakeDockview();
    const host = makeHost(); host._dockview = fake;
    const instance = adapter.activate(host);
    instance.addPane('pty1', 'terminal');
    instance.addPane('pty2', 'terminal');
    instance.addPane('library', 'library');

    assert(host._calls.suspended.sort().join(',') === 'pty1,pty2',
      'each hosted TERMINAL hands its grid observer over exactly once');
    assert(!host._calls.suspended.includes('library'),
      'the Library pane has no xterm and no observer to suspend');
    assert(host._calls.suspended.length === 2, 'and no pane is suspended twice');

    // Handing ownership BACK is the app's decision, taken only on adoption rollback. A closed pane
    // needs nothing: the app's own close path disconnects its observer for good.
    fake._api.removePanel(fake._api.getPanel('pty1'));
    instance.onAppPaneClosed('pty2');
    instance.dispose();
    assert(host._calls.resumed.length === 0,
      `the adapter NEVER calls resumeAppResizeObserver itself (saw ${JSON.stringify(host._calls.resumed)})`);
  }

  process.stdout.write(`\ndockview-adapter-lifecycle: ${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exit(1);
})();
