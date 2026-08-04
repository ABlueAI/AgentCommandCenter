'use strict';
// Run: node app/renderer/dockview-fit-policy.test.js
// Plain Node.js — exercises the ACTUAL § 8 xterm fit / PTY resize contract with a fake frame
// scheduler, so coalescing, hidden-panel suppression, and cleanup are proven deterministically
// instead of being eyeballed against a live Electron window.
//
// Two predeclared kill criteria are decided by this module, so each gets explicit coverage:
//   § 5.1 a visible terminal refits after mount/drag/split/tab-activation/group-resize/window-resize
//   § 5.2 PTY cols/rows never go stale, zero, oscillate, or diverge from the visible xterm

const { createFitController, createFitRegistry } = require('./dockview-fit-policy');

let passed = 0, failed = 0;
function assert(cond, label) {
  if (cond) { process.stdout.write(`  ✓ ${label}\n`); passed++; }
  else { process.stderr.write(`  ✗ FAIL: ${label}\n`); failed++; }
}

/** Deterministic stand-in for requestAnimationFrame: frames run only when flush() is called. */
function makeHarness(opts = {}) {
  const state = {
    visible: opts.visible !== false,
    cols: opts.cols === undefined ? 80 : opts.cols,
    rows: opts.rows === undefined ? 24 : opts.rows,
    fits: 0,
    resizes: [],
    pending: new Map(),
    nextHandle: 1,
    cancelled: [],
  };
  const controller = createFitController({
    paneId: opts.paneId || 'pty1',
    fit: () => { state.fits++; },
    measure: () => ({ cols: state.cols, rows: state.rows }),
    isVisible: () => state.visible,
    sendResize: (id, cols, rows) => state.resizes.push({ id, cols, rows }),
    requestFrame: (cb) => { const h = state.nextHandle++; state.pending.set(h, cb); return h; },
    cancelFrame: (h) => { state.cancelled.push(h); state.pending.delete(h); },
  });
  state.flush = () => {
    const due = [...state.pending.entries()];
    state.pending.clear();
    for (const [, cb] of due) cb();
  };
  return { state, controller };
}

// ---------------------------------------------------------------------------
process.stdout.write('\nconstructor validation\n');
// ---------------------------------------------------------------------------
{
  let threw = 0;
  const ok = { paneId: 'pty1', fit(){}, measure(){}, isVisible(){}, sendResize(){}, requestFrame(){}, cancelFrame(){} };
  for (const key of ['fit', 'measure', 'isVisible', 'sendResize', 'requestFrame', 'cancelFrame']) {
    try { createFitController(Object.assign({}, ok, { [key]: undefined })); } catch { threw++; }
  }
  try { createFitController(Object.assign({}, ok, { paneId: '' })); } catch { threw++; }
  assert(threw === 7, 'every missing dependency and an empty paneId are rejected at construction');
}

// ---------------------------------------------------------------------------
process.stdout.write('\ncoalescing: many events collapse into one frame\n');
// ---------------------------------------------------------------------------
{
  const { state, controller } = makeHarness();
  // A drag/split/group-resize storm: many synchronous schedule() calls.
  for (let i = 0; i < 25; i++) controller.schedule();
  assert(state.pending.size === 1, '25 schedule() calls request exactly ONE animation frame');
  assert(controller.stats().scheduled === 1 && controller.stats().coalesced === 24,
    'stats attribute 1 scheduled + 24 coalesced');
  assert(state.fits === 0, 'nothing fits before the frame runs');

  state.flush();
  assert(state.fits === 1, 'the storm produced exactly ONE fit');
  assert(state.resizes.length === 1, 'and exactly ONE ptyResize');
  assert(state.resizes[0].cols === 80 && state.resizes[0].rows === 24, 'the post-fit geometry is sent');
  assert(state.resizes[0].id === 'pty1', 'the resize carries the pane ID');

  // A later event schedules a fresh frame (coalescing is per-frame, not permanent suppression).
  state.cols = 120;
  controller.schedule();
  state.flush();
  assert(state.fits === 2 && state.resizes.length === 2, 'a later event fits again');
  assert(state.resizes[1].cols === 120, 'the new geometry reaches the PTY');
}

// ---------------------------------------------------------------------------
process.stdout.write('\nhidden panels: never fit, never resize, never poll\n');
// ---------------------------------------------------------------------------
{
  const { state, controller } = makeHarness({ visible: false });
  controller.schedule();
  state.flush();
  assert(state.fits === 0, 'a hidden panel does NOT call fit()');
  assert(state.resizes.length === 0, 'a hidden panel sends NO ptyResize');
  assert(controller.stats().skippedHidden === 1, 'the skip is recorded');
  assert(state.pending.size === 0, 'no retry frame is queued — there is no polling loop');

  // Becoming visible is itself an event; that is what drives the eventual fit.
  state.visible = true;
  controller.schedule();
  state.flush();
  assert(state.fits === 1 && state.resizes.length === 1, 'on becoming visible, the pane fits exactly once');
  assert(state.resizes[0].cols === 80 && state.resizes[0].rows === 24, 'correct geometry after activation');
}
{
  // Visibility is re-checked INSIDE the frame, not at schedule time: a panel hidden by a drag
  // between the event and the frame must not be fitted.
  const { state, controller } = makeHarness({ visible: true });
  controller.schedule();
  state.visible = false;     // e.g. another tab activated before the frame ran
  state.flush();
  assert(state.fits === 0 && state.resizes.length === 0,
    'a panel hidden between schedule() and the frame is not fitted');
}
{
  // A throwing isVisible must fail CLOSED (treated as hidden), never fit blindly.
  const state = { fits: 0, resizes: [] };
  let cb = null;
  const controller = createFitController({
    paneId: 'pty9',
    fit: () => { state.fits++; },
    measure: () => ({ cols: 80, rows: 24 }),
    isVisible: () => { throw new Error('detached node'); },
    sendResize: (id, c, r) => state.resizes.push({ id, c, r }),
    requestFrame: (fn) => { cb = fn; return 1; },
    cancelFrame: () => {},
  });
  controller.schedule(); cb();
  assert(state.fits === 0 && state.resizes.length === 0, 'a throwing visibility check fails closed (no fit)');
}

// ---------------------------------------------------------------------------
process.stdout.write('\ngeometry sanity: zero / non-finite / non-integer is refused\n');
// ---------------------------------------------------------------------------
{
  for (const [cols, rows, label] of [
    [0, 24, 'zero columns'],
    [80, 0, 'zero rows'],
    [-5, 24, 'negative columns'],
    [NaN, 24, 'NaN columns'],
    [Infinity, 24, 'infinite columns'],
    [80.5, 24, 'fractional columns'],
    [null, 24, 'null columns'],
  ]) {
    const { state, controller } = makeHarness({ cols, rows });
    controller.schedule();
    state.flush();
    assert(state.resizes.length === 0, `${label} is never sent to the PTY`);
    assert(controller.stats().rejectedGeometry === 1, `${label} is recorded as rejected geometry`);
  }
  // A throwing measure() must not throw out of the frame.
  let cb = null; let sent = 0;
  const c = createFitController({
    paneId: 'pty1', fit: () => {}, measure: () => { throw new Error('disposed terminal'); },
    isVisible: () => true, sendResize: () => { sent++; },
    requestFrame: (fn) => { cb = fn; return 1; }, cancelFrame: () => {},
  });
  c.schedule();
  let threw = false;
  try { cb(); } catch { threw = true; }
  assert(!threw && sent === 0, 'a throwing measure() is contained and sends nothing');
}

// ---------------------------------------------------------------------------
process.stdout.write('\nduplicate suppression: identical geometry is not re-sent\n');
// ---------------------------------------------------------------------------
{
  const { state, controller } = makeHarness();
  for (let i = 0; i < 5; i++) { controller.schedule(); state.flush(); }
  assert(state.fits === 5, 'each event still fits (the DOM may genuinely have changed)');
  assert(state.resizes.length === 1, 'but identical geometry reaches the PTY only ONCE');
  assert(controller.stats().duplicatesSuppressed === 4, 'the four duplicates are recorded');

  state.rows = 40;
  controller.schedule(); state.flush();
  assert(state.resizes.length === 2 && state.resizes[1].rows === 40, 'a genuine change is sent immediately');
  assert(controller.lastSent().cols === 80 && controller.lastSent().rows === 40, 'lastSent tracks accepted geometry');
}

// ---------------------------------------------------------------------------
process.stdout.write('\ndispose: idempotent, cancels pending work, inert afterwards\n');
// ---------------------------------------------------------------------------
{
  const { state, controller } = makeHarness();
  controller.schedule();
  assert(state.pending.size === 1, 'a frame is pending');
  controller.dispose();
  assert(state.cancelled.length === 1, 'dispose cancelled the pending frame');
  assert(state.pending.size === 0, 'no frame remains queued');
  state.flush();
  assert(state.fits === 0 && state.resizes.length === 0, 'the cancelled frame never fits or resizes');

  controller.dispose();
  assert(state.cancelled.length === 1, 'dispose is idempotent (no second cancel)');
  assert(controller.isDisposed() === true, 'the controller reports disposed');

  controller.schedule();
  state.flush();
  assert(state.fits === 0 && state.resizes.length === 0, 'schedule() after dispose is inert');
  assert(controller.stats().afterDispose === 1, 'post-dispose schedules are recorded, not silently dropped');
}
{
  // A frame that fires after dispose (already-queued native callback) must do nothing.
  let cb = null; const state = { fits: 0, resizes: 0 };
  const c = createFitController({
    paneId: 'pty1', fit: () => { state.fits++; }, measure: () => ({ cols: 80, rows: 24 }),
    isVisible: () => true, sendResize: () => { state.resizes++; },
    requestFrame: (fn) => { cb = fn; return 1; }, cancelFrame: () => {},   // cancel is a no-op here
  });
  c.schedule();
  c.dispose();
  cb();
  assert(state.fits === 0 && state.resizes === 0, 'a frame firing after dispose does nothing');
}

// ---------------------------------------------------------------------------
process.stdout.write('\nregistry: exactly one controller (one observer) per pane\n');
// ---------------------------------------------------------------------------
{
  const registry = createFitRegistry();
  let built = 0;
  const make = () => { built++; return makeHarness().controller; };

  const first = registry.ensure('pty1', make);
  const again = registry.ensure('pty1', make);   // simulates a move/reparent re-running setup
  assert(built === 1, 're-registering a pane does NOT build a second controller');
  assert(first === again, 'the same controller instance is returned');
  assert(registry.size() === 1, 'the registry holds one entry');

  registry.ensure('pty2', make);
  registry.ensure('library', make);
  assert(registry.size() === 3 && registry.ids().join(',') === 'pty1,pty2,library', 'independent panes register separately');

  assert(registry.remove('pty1') === true, 'remove() reports it removed the pane');
  assert(first.isDisposed() === true, 'removing a pane disposes its controller (observer cleanup)');
  assert(registry.size() === 2, 'the entry is gone');
  assert(registry.remove('pty1') === false, 'removing an absent pane is a no-op, not a throw');
  assert(registry.has('pty1') === false && registry.get('pty1') === null, 'the pane is fully forgotten');

  registry.disposeAll();
  assert(registry.size() === 0, 'disposeAll clears the registry');
}
{
  // scheduleAll is the window-resize path: every live pane gets exactly one frame.
  const registry = createFitRegistry();
  const harnesses = ['pty1', 'pty2'].map((id) => {
    const h = makeHarness({ paneId: id });
    registry.ensure(id, () => h.controller);
    return h;
  });
  registry.scheduleAll();
  registry.scheduleAll();     // a second resize event in the same frame
  for (const h of harnesses) h.state.flush();
  assert(harnesses.every(h => h.state.fits === 1), 'a repeated window resize still fits each pane once');
  assert(harnesses.every(h => h.state.resizes.length === 1), 'and sends one ptyResize per pane');
}

// ---------------------------------------------------------------------------
process.stdout.write(`\ndockview-fit-policy: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
