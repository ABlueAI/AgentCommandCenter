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
  let failMode = null;          // null | 'after-clear' | 'mid-rebuild'

  // The real lifecycle: DockviewPanelModel's constructor calls createComponent({id,name}), then
  // panel.init(...) calls the returned renderer's init(). Both halves matter to the adapter.
  function buildPanel(id, component, title) {
    const panel = { id, component, title };
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
    dispose() {},
    _panels: panels,
  };
  return {
    createDockview: (_el, options) => { componentFactory = options && options.createComponent; return api; },
    _api: api,
    _listeners: listeners,
    _addPanelCalls: addPanelCalls,
    _failFromJSON: (mode) => { failMode = mode; },
  };
}

function makeHost(overrides = {}) {
  const calls = { closePane: [], suspended: [], logs: [], statuses: [], created: [] };
  const container = makeElement('div');
  const paneElements = new Map([
    ['pty1', makeElement('div')], ['pty2', makeElement('div')], ['library', makeElement('div')],
  ]);
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
    suspendAppResizeObserver: (id) => calls.suspended.push(id),
    focusPane: () => {},
    createTerminalPane: async () => { const id = ['pty1', 'pty2'][nextTerminal++] || null; calls.created.push(id); return id; },
    createLibraryPane: () => { calls.created.push('library'); return 'library'; },
    closePane: (id) => calls.closePane.push(id),
    _calls: calls,
    _paneElements: paneElements,
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

  assert(instance.addPane('shell9', 'terminal') === false, 'an unknown pane ID is refused');
  assert(instance.addPane('pty1', 'iframe') === false, 'an unknown component kind is refused');
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

  process.stdout.write('\nRestore with no saved layout offers the default instead of failing\n');
  // -------------------------------------------------------------------------
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
