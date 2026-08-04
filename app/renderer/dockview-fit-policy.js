'use strict';
// Dockview prototype — xterm fit / PTY resize policy (PURE, no DOM, no Dockview, no xterm).
//
// This is the module the work order's § 8 "xterm resize contract" actually lives in, extracted so it
// can be proven in plain node rather than argued about against a live Electron window. Two of the
// eleven predeclared kill criteria are decided here:
//
//   § 5.1  a visible terminal must refit correctly after mount, drag, split, tab activation, group
//          resize, and window resize;
//   § 5.2  PTY columns/rows must never go stale, zero, oscillate, or diverge from the visible xterm.
//
// The contract, exactly:
//   * NEVER call fit() while the panel is hidden or has zero dimensions. FitAddon measures the
//     container; measuring a hidden container yields garbage, and pushing that garbage to the PTY is
//     how a terminal ends up at 0 columns.
//   * Coalesce duplicate events into ONE bounded animation-frame fit. Drag, split, and group-resize
//     fire storms of events; without coalescing each one costs a reflow and an IPC message.
//   * NO polling, NO unbounded retry. A hidden panel does not schedule a retry — it does nothing,
//     because becoming visible is itself an event that schedules a fresh fit.
//   * Send the post-fit cols/rows through the caller's existing ptyResize, and suppress a send that
//     would repeat the last accepted geometry (a duplicate resize is the "oscillate" failure mode).
//   * Refuse to send non-finite, zero, or negative geometry outright.
//   * dispose() is idempotent and cancels any pending frame, so a closed pane cannot fit or resize
//     after teardown.

/**
 * @param {object} deps
 * @param {string}   deps.paneId       Opaque pane ID (used only for the resize call and stats).
 * @param {Function} deps.fit          () => void         — invokes FitAddon.fit().
 * @param {Function} deps.measure      () => {cols, rows} — reads the terminal AFTER fit.
 * @param {Function} deps.isVisible    () => boolean      — panel visible AND non-zero sized.
 * @param {Function} deps.sendResize   (paneId, cols, rows) => void — the existing cc.ptyResize.
 * @param {Function} deps.requestFrame (cb) => handle     — requestAnimationFrame.
 * @param {Function} deps.cancelFrame  (handle) => void   — cancelAnimationFrame.
 */
function createFitController(deps) {
  const { paneId, fit, measure, isVisible, sendResize, requestFrame, cancelFrame } = deps || {};
  for (const [name, value] of Object.entries({ fit, measure, isVisible, sendResize, requestFrame, cancelFrame })) {
    if (typeof value !== 'function') throw new Error(`createFitController: ${name} must be a function`);
  }
  if (typeof paneId !== 'string' || !paneId) throw new Error('createFitController: paneId is required');

  let frameHandle = null;   // non-null => a fit is already scheduled for the next frame
  let disposed = false;
  let lastCols = null;
  let lastRows = null;

  const stats = {
    scheduled: 0,      // schedule() calls that started a new frame
    coalesced: 0,      // schedule() calls folded into an already-pending frame
    fits: 0,           // actual fit() invocations
    skippedHidden: 0,  // frames that ran while hidden and therefore did NOT fit
    resizesSent: 0,    // ptyResize calls made
    duplicatesSuppressed: 0,
    rejectedGeometry: 0,
    afterDispose: 0,   // schedule() calls ignored because the controller was disposed
  };

  function runFrame() {
    frameHandle = null;
    if (disposed) return;

    // Gate 1 — visibility. A hidden or zero-sized panel is skipped entirely: no fit, no measure,
    // no resize. It is NOT retried; the next visibility/activation event schedules a fresh fit.
    let visible = false;
    try { visible = isVisible() === true; } catch { visible = false; }
    if (!visible) { stats.skippedHidden++; return; }

    try { fit(); } catch { /* a fit failure must not break the pane */ }
    stats.fits++;

    let dims = null;
    try { dims = measure(); } catch { dims = null; }
    if (!dims) { stats.rejectedGeometry++; return; }

    const { cols, rows } = dims;
    // Gate 2 — geometry sanity. Zero / negative / non-integer / non-finite geometry is exactly the
    // § 5.2 failure mode, so it is refused rather than forwarded to the PTY.
    const sane = Number.isInteger(cols) && Number.isInteger(rows) && cols > 0 && rows > 0;
    if (!sane) { stats.rejectedGeometry++; return; }

    // Gate 3 — duplicate suppression. Re-sending identical geometry is noise at best and the
    // "oscillate" signature at worst.
    if (cols === lastCols && rows === lastRows) { stats.duplicatesSuppressed++; return; }

    lastCols = cols;
    lastRows = rows;
    try { sendResize(paneId, cols, rows); } catch { /* IPC failure must not break the pane */ }
    stats.resizesSent++;
  }

  return {
    /**
     * Request a fit. Called on: initial visibility, tab activation, completed drag/split, group
     * resize, window resize. Many events collapse into one frame.
     */
    schedule() {
      if (disposed) { stats.afterDispose++; return; }
      if (frameHandle !== null) { stats.coalesced++; return; }
      stats.scheduled++;
      frameHandle = requestFrame(runFrame);
    },

    /** Idempotent teardown. Cancels any pending frame; later schedule() calls are inert. */
    dispose() {
      if (disposed) return;
      disposed = true;
      if (frameHandle !== null) {
        try { cancelFrame(frameHandle); } catch { /* best effort */ }
        frameHandle = null;
      }
    },

    isDisposed() { return disposed; },
    lastSent() { return (lastCols === null) ? null : { cols: lastCols, rows: lastRows }; },
    stats() { return Object.assign({}, stats); },
  };
}

/**
 * Registry guaranteeing ONE controller (and therefore one observer) per pane.
 *
 * Moving a panel between Dockview groups reparents its DOM, which can re-run adapter setup. Without
 * this, each move would attach an additional ResizeObserver to the same terminal — the § 8 rule
 * "Moving a terminal must not create a second observer". Re-registering an existing pane returns
 * the SAME controller rather than a second one.
 */
function createFitRegistry() {
  const controllers = new Map();

  return {
    /** Returns the existing controller for the pane, or creates exactly one. */
    ensure(paneId, factory) {
      if (controllers.has(paneId)) return controllers.get(paneId);
      const controller = factory();
      controllers.set(paneId, controller);
      return controller;
    },
    get(paneId) { return controllers.get(paneId) || null; },
    has(paneId) { return controllers.has(paneId); },
    size() { return controllers.size; },
    /** Idempotent: disposing an already-removed pane is a no-op, never a throw. */
    remove(paneId) {
      const controller = controllers.get(paneId);
      if (!controller) return false;
      controllers.delete(paneId);
      controller.dispose();
      return true;
    },
    scheduleAll() { for (const c of controllers.values()) c.schedule(); },
    disposeAll() {
      for (const c of controllers.values()) c.dispose();
      controllers.clear();
    },
    ids() { return [...controllers.keys()]; },
  };
}

const api = { createFitController, createFitRegistry };
if (typeof module === 'object' && module.exports) module.exports = api;
if (typeof window !== 'undefined') window.ccDockviewFitPolicy = api;
