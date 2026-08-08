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
    style: {}, dataset: {},
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
    getBoundingClientRect() { return { width: 800, height: 600 }; },
    get offsetParent() { return this.parentNode || { }; },
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
const adapterModule = require('./dockview-prototype');
const adapter = adapterModule.activate ? adapterModule : global.window.ccDockviewPrototype;

// ---- fake Dockview api: real payload shapes AND the real fromJSON lifecycle --------------------
function makeFakeDockview() {
  const listeners = { remove: [], active: [], layout: [] };
  const panels = new Map();
  let componentFactory = null;
  const addPanelCalls = [];
  const activatedIds = [];      // every panel.api.setActive() call, in order
  const maximizeCalls = [];     // every panel.api.maximize() call, in order
  const exitCalls = [];         // every panel.api.exitMaximized() call, in order
  let failMode = null;          // null | 'after-clear' | 'mid-rebuild' | 'add-panel'

  // The real lifecycle: DockviewPanelModel's constructor calls createComponent({id,name}), then
  // panel.init(...) calls the returned renderer's init(). Both halves matter to the adapter.
  function buildPanel(id, component, title) {
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
        setActive() { activatedIds.push(id); },
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
    if (componentFactory) {
      const renderer = componentFactory({ id, name: component });
      panel._renderer = renderer;
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
    },
    // DockviewApi.clear() -> component.clear() -> _doClear -> removeGroup -> removePanel per panel,
    // each of which surfaces on the public removal event.
    clear() {
      for (const panel of [...panels.values()]) {
        panels.delete(panel.id);
        listeners.remove.forEach((fn) => fn(panel));
      }
    },
    onDidRemovePanel: (fn) => listeners.remove.push(fn),
    onDidActivePanelChange: (fn) => listeners.active.push(fn),
    onDidLayoutChange: (fn) => listeners.layout.push(fn),
    toJSON: () => ({
      panels: Object.fromEntries([...panels].map(([id, p]) => [id, { id, contentComponent: p.component, title: p.title }])),
    }),
    fromJSON(layout) {
      // HALF 1 — _doFromJSON calls this.clear() BEFORE deserializing anything.
      api.clear();
      if (failMode === 'after-clear') throw new Error('dockview: synthetic apply failure after clear');
      // HALF 2 — the deserializer builds every saved panel through createComponent + init().
      const ids = Object.keys((layout && layout.panels) || {});
      ids.forEach((id, index) => {
        if (failMode === 'mid-rebuild' && index === 1) {
          throw new Error('dockview: synthetic apply failure mid-rebuild');
        }
        const saved = (layout.panels && layout.panels[id]) || {};
        buildPanel(id, saved.contentComponent || 'terminal', saved.title || id);
      });
    },
    dispose() { api._disposed = true; },
    _disposed: false,
    _panels: panels,
    _maximizedId: null,
    _maximizeThrows: false,
  };
  let created = false;
  return {
    createDockview: (_el, options) => { created = true; componentFactory = options && options.createComponent; return api; },
    get _created() { return created; },
    _api: api,
    _listeners: listeners,
    _addPanelCalls: addPanelCalls,
    _activatedIds: activatedIds,
    _maximizeCalls: maximizeCalls,
    _exitCalls: exitCalls,
    _failFromJSON: (mode) => { failMode = mode; },
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
    docked: 0, undocked: 0,
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

/** Stand up an adapter hosting pty1 + pty2 + library, and hand back everything the assertions need. */
function makeRestoreScenario(savedPanels) {
  const fake = makeFakeDockview();
  const host = makeHost(); host._dockview = fake;
  host.bridge.loadLayout = async () => ({ ok: true, savedAt: '2026-08-04T12:00:00Z', layout: { panels: savedPanels } });
  const instance = adapter.activate(host);
  instance.addPane('pty1', 'terminal');
  instance.addPane('pty2', 'terminal');
  instance.addPane('library', 'library');
  const paneEl = (id) => host._paneElements.get(id);
  const hostOf = (id) => { const p = fake._api.getPanel(id); return p && p._renderer && p._renderer.element; };
  return { fake, host, instance, paneEl, hostOf };
}

const SAVED_THREE = {
  pty1: { id: 'pty1', contentComponent: 'terminal', title: 'Terminal 1' },
  pty2: { id: 'pty2', contentComponent: 'terminal', title: 'Terminal 2' },
  library: { id: 'library', contentComponent: 'library', title: 'Library' },
};

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
async function r5RestoreKeepsLibraryDocked() {
  process.stdout.write('\nR5: a restore-driven rebuild is a MOUNT transition — it must not undock\n');
  const fake = makeFakeDockview();
  const host = makeHost(); host._dockview = fake;
  host.bridge.loadLayout = async () => ({
    ok: true, savedAt: '2026-08-04T12:00:00Z',
    layout: { panels: { library: { id: 'library', contentComponent: 'library', title: 'Library' } } },
  });
  const instance = adapter.activate(host);
  instance.addPane('library', 'library');
  const undockedAfterAdd = host._calls.undocked;

  await instance.restoreLayout();
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
    const { fake, host, instance, paneEl, hostOf } = makeRestoreScenario(SAVED_THREE);

    const oldHosts = { pty1: hostOf('pty1'), pty2: hostOf('pty2'), library: hostOf('library') };
    const oldControllers = { pty1: instance.registry.get('pty1'), pty2: instance.registry.get('pty2') };
    const oldObservers = { pty1: oldControllers.pty1._observer, pty2: oldControllers.pty2._observer };
    const createdBefore = host._calls.created.length;
    const observersBefore = observers.live;

    const result = await instance.restoreLayout();

    assert(result && result.ok === true, 'the restore reports success');
    assert(host._calls.closePane.length === 0,
      'the app close path is never called during the internal clear/rebuild (no PTY is killed)');
    assert(host._calls.created.length === createdBefore,
      'no PTY and no pane is newly created during restore');

    // The load-bearing assertions: DOM ownership by OBJECT IDENTITY, not `getPanel(id) !== null`.
    for (const id of ['pty1', 'pty2', 'library']) {
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
  }

  process.stdout.write('\nRESTORE is repeatable: three cycles leak nothing\n');
  // -------------------------------------------------------------------------
  {
    const { host, instance, paneEl, hostOf } = makeRestoreScenario(SAVED_THREE);
    const framesBefore = frames.pending;
    const observersBefore = observers.live;

    for (let cycle = 1; cycle <= 3; cycle++) {
      const r = await instance.restoreLayout();
      assert(r && r.ok === true, `cycle ${cycle}: restore succeeds`);
      assert(instance.registry.size() === 2, `cycle ${cycle}: still exactly 2 controllers`);
      assert(observers.live === observersBefore, `cycle ${cycle}: still exactly 2 live observers`);
      assert(instance.ownedPaneIds().length === 3, `cycle ${cycle}: still exactly 3 owned panes`);
      assert(['pty1', 'pty2', 'library'].every((id) => paneEl(id).parentNode === hostOf(id)),
        `cycle ${cycle}: every live pane is parented to its current panel host`);
    }
    assert(frames.pending <= framesBefore + 2,
      'pending animation frames do not accumulate across restore cycles');
    assert(host._calls.closePane.length === 0, 'no PTY was killed across three cycles');
  }

  process.stdout.write('\nafter a restore, closing still works in BOTH directions, exactly once\n');
  // -------------------------------------------------------------------------
  {
    const { fake, host, instance } = makeRestoreScenario(SAVED_THREE);
    await instance.restoreLayout();

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

  process.stdout.write('\nRestore refuses visibly when a saved pane is not live\n');
  // -------------------------------------------------------------------------
  {
    const { fake, host, instance, paneEl, hostOf } = makeRestoreScenario({ pty1: SAVED_THREE.pty1, pty2: SAVED_THREE.pty2 });
    host._paneElements.delete('pty2');            // pty2 was saved but is not open after a restart
    const hostsBefore = { pty1: hostOf('pty1'), pty2: hostOf('pty2'), library: hostOf('library') };

    const result = await instance.restoreLayout();
    assert(result && result.ok === false && result.reason === 'panes-not-live',
      'restore refuses rather than mounting an empty panel shell for a missing pane');
    assert(host._calls.logs.some((l) => /restore REFUSED/.test(l)), 'the refusal is visible in the log');
    assert(hostOf('pty1') === hostsBefore.pty1 && hostOf('library') === hostsBefore.library,
      'the refusal happens BEFORE fromJSON — the current panels were never rebuilt');
    assert(paneEl('pty1').parentNode === hostsBefore.pty1,
      'the existing topology is untouched: the live pane keeps its current host');
    assert(host._calls.closePane.length === 0, 'and nothing was closed');
  }

  process.stdout.write('\nan apply failure AFTER the clear rolls back instead of stranding panes\n');
  // -------------------------------------------------------------------------
  {
    const { fake, host, instance, paneEl, hostOf } = makeRestoreScenario(SAVED_THREE);
    const createdBefore = host._calls.created.length;
    fake._failFromJSON('after-clear');

    const result = await instance.restoreLayout();

    assert(result && result.ok === false && result.reason === 'restore-apply-failed',
      'a bounded failure reason is returned');
    assert(result.ok !== true, 'the earlier successful load result is NOT returned as if it applied');
    assert(host._calls.closePane.length === 0, 'no PTY was killed by the failed apply');
    assert(host._calls.created.length === createdBefore,
      'no replacement terminal was created — useDefaultLayout is not the failure path');
    for (const id of ['pty1', 'pty2', 'library']) {
      assert(instance.paneIsMounted(id) === true, `${id}: is mounted again after rollback`);
      assert(paneEl(id).parentNode === hostOf(id), `${id}: parented to its rebuilt host, not stranded`);
      assert(hostOf(id).children.length === 1, `${id}: the rolled-back panel is not an empty shell`);
    }
    assert(instance.ownedPaneIds().sort().join(',') === 'library,pty1,pty2', 'all panes remain owned');
    assert(host._calls.logs.some((l) => /restore rollback/.test(l)), 'the rollback is visible in the log');
    assert(!host._calls.logs.some((l) => /synthetic apply failure/.test(l)),
      'the exception text is NEVER echoed into the log (no state contents, no exception content)');
  }

  process.stdout.write('\nan apply failure DURING the rebuild also rolls back, with no empty shells\n');
  // -------------------------------------------------------------------------
  {
    const { fake, host, instance, paneEl, hostOf } = makeRestoreScenario(SAVED_THREE);
    const createdBefore = host._calls.created.length;
    fake._failFromJSON('mid-rebuild');

    const result = await instance.restoreLayout();

    assert(result && result.ok === false && result.reason === 'restore-apply-failed',
      'a partial rebuild also returns the bounded failure reason');
    assert(host._calls.closePane.length === 0, 'no PTY was killed');
    assert(host._calls.created.length === createdBefore, 'no PTY was created');
    for (const id of ['pty1', 'pty2', 'library']) {
      assert(instance.paneIsMounted(id) === true, `${id}: recovered by the rollback`);
      assert(paneEl(id).parentNode === hostOf(id), `${id}: owns its element again`);
      assert(hostOf(id).children.length === 1, `${id}: no empty shell survived the partial rebuild`);
    }
    assert(instance.registry.size() === 2, 'exactly one controller per terminal after rollback');
    assert(instance.ownedPaneIds().length === 3, 'no pane entry was lost by the partial rebuild');
  }

  process.stdout.write('\nprototype teardown releases everything it owns\n');
  // -------------------------------------------------------------------------
  {
    const { host, instance } = makeRestoreScenario(SAVED_THREE);
    await instance.restoreLayout();
    const observersBefore = observers.live;
    assert(observersBefore >= 2, 'the restored terminals hold live observers before teardown');

    instance.dispose();
    assert(instance.registry.size() === 0, 'every fit controller is disposed on teardown');
    assert(instance.ownedPaneIds().length === 0,
      'every owned pane is released on teardown, including the Library pane that has no controller');
    assert(observers.live === observersBefore - 2, 'both adapter ResizeObservers were disconnected');
    assert(host._calls.closePane.length === 0,
      'teardown does NOT kill PTYs — the app owns their lifecycle, not the adapter');
    instance.dispose();
    assert(true, 'a second dispose is a no-op, not a throw');
  }

  process.stdout.write('\nRestore with no saved layout refuses and creates NOTHING\n');
  // -------------------------------------------------------------------------
  {
    const fake = makeFakeDockview();
    const host = makeHost(); host._dockview = fake;
    const instance = adapter.activate(host);
    const result = await instance.restoreLayout();
    assert(result && result.ok === false && result.reason === 'no-saved-layout', 'the missing-state reason is surfaced');
    assert(host._calls.logs.some((l) => /no-saved-layout/.test(l)), 'the reason is logged');
    // R5: the old build fell through to the default-workspace creator here, which silently spawned
    // two PTYs on every failed restore. A refusal must be a full stop.
    assert(host._calls.created.length === 0, 'restore failure created NO terminal');
    assert(fake._addPanelCalls.length === 0, 'restore failure created NO pane');
    assert(instance.ownedPaneIds().length === 0, 'the workspace is untouched');
  }

  process.stdout.write('\nR5: Create Default Workspace is idempotent and preflights emptiness\n');
  // -------------------------------------------------------------------------
  {
    const fake = makeFakeDockview();
    const host = makeHost(); host._dockview = fake;
    const instance = adapter.activate(host);

    const first = await instance.useDefaultLayout();
    assert(first.ok === true, 'the first invocation succeeds from an empty workspace');
    assert(host._calls.created.filter((id) => id !== 'library').length === 2, 'exactly two terminals were created');
    assert(instance.ownedPaneIds().sort().join(',') === 'library,pty1,pty2', 'two terminals plus the singleton Library');
    const panesAfterFirst = fake._addPanelCalls.length;
    const createdAfterFirst = host._calls.created.length;

    const second = await instance.useDefaultLayout();
    assert(second.ok === false && second.reason === 'workspace-not-empty', 'a second invocation refuses by name');
    assert(host._calls.created.length === createdAfterFirst, 'the refusal created ZERO new terminals (no PTY spawned)');
    assert(fake._addPanelCalls.length === panesAfterFirst, 'the refusal created ZERO new panes');
    assert(/already has/.test(statusText(host)), 'the refusal is visible in the status surface');
  }

  process.stdout.write('\nR5: Clear Saved Layout touches metadata only, and says so\n');
  // -------------------------------------------------------------------------
  {
    const fake = makeFakeDockview();
    const host = makeHost(); host._dockview = fake;
    const instance = adapter.activate(host);
    await instance.useDefaultLayout();
    const ownedBefore = instance.ownedPaneIds().sort().join(',');
    const panesBefore = fake._addPanelCalls.length;

    const r = await instance.resetLayout();
    assert(r && r.ok === true, 'the saved metadata was cleared');
    assert(instance.ownedPaneIds().sort().join(',') === ownedBefore, 'no pane was closed');
    assert(fake._addPanelCalls.length === panesBefore, 'no pane was created');
    assert(host._calls.closePane.length === 0, 'no PTY was killed');
    assert(/Live panes were NOT changed/.test(statusText(host)),
      'the status states explicitly that live panes were unchanged');
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

  await r5RestoreKeepsLibraryDocked();

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
