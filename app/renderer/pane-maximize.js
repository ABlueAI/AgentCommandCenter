'use strict';
// Maximize-one-pane controller for the Terminals grid (V1a).
//
// Mechanism: pure class toggling. Maximizing pane P adds `maximized` to P and
// `has-maximized` to the grid; styles.css then hides every sibling pane (hidden, NOT
// closed — their PTYs keep running) and lets P fill the grid area, header included.
// This module owns only the STATE MACHINE (which pane is maximized, and every path
// out of that state); app.js supplies the side effects through `onLayout`, which
// fires after every transition so refit/PTY-resize/focus/button glyphs stay correct
// no matter which path (button, Escape, close, view switch) caused the change.
//
// No DOM APIs beyond classList are used, so the controller is unit-testable in plain
// node against a tiny classList stub (pane-maximize.test.js), like agent-dom.js.

function createPaneMaximizer(deps) {
  const grid = deps.grid;
  const log = deps.log || (() => {});
  // onLayout(maximizedId, previousId): maximizedId is the now-maximized pane or null;
  // previousId is the pane that WAS maximized (for restore-focus), or null.
  const onLayout = deps.onLayout || (() => {});
  let maximizedId = null;
  let maximizedPane = null;

  function maximize(id, pane) {
    if (!id || !pane) return false;
    if (maximizedId === id) return false;
    if (maximizedId !== null) clearState('switch-pane'); // switching directly between panes
    maximizedPane = pane;
    maximizedId = id;
    pane.classList.add('maximized');
    grid.classList.add('has-maximized');
    log(`[pane] maximized ${id} (Esc or the same control restores the grid)\n`);
    onLayout(id, null);
    return true;
  }

  // Shared exit: strip the classes and forget the pane. The pane node may already be
  // gone (close-while-maximized) — classList removal on the remembered node is still
  // safe, and the grid class is what un-hides the survivors.
  function clearState(reason) {
    const prev = maximizedId;
    if (maximizedPane) { try { maximizedPane.classList.remove('maximized'); } catch {} }
    grid.classList.remove('has-maximized');
    maximizedId = null;
    maximizedPane = null;
    return prev;
  }

  function restore(reason) {
    if (maximizedId === null) return false;
    const prev = clearState(reason);
    log(`[pane] restored grid (${reason}) from ${prev}\n`);
    onLayout(null, prev);
    return true;
  }

  return {
    get maximizedId() { return maximizedId; },
    // Header-button behavior: same control maximizes and restores.
    toggle(id, pane) {
      if (maximizedId === id) return restore('toggle');
      return maximize(id, pane);
    },
    // Escape restores the grid. Returns true when it CONSUMED the key (a restore
    // happened) so the caller can stop the event from also reaching the PTY; when
    // nothing is maximized the key is not ours and flows to the terminal as usual.
    handleEscape() { return restore('escape'); },
    // Closing the maximized pane restores the grid cleanly. The pane itself is being
    // removed by the close path — only the grid state needs repair here.
    handlePaneClosed(id) {
      if (maximizedId !== id) return false;
      const prev = clearState('pane-closed');
      log(`[pane] restored grid (maximized pane ${prev} closed)\n`);
      onLayout(null, null); // the previous pane no longer exists — nothing to refocus
      return true;
    },
    // Leaving the Terminals view must not strand maximize state.
    handleViewSwitch() { return restore('view-switch'); },
  };
}

const api = { createPaneMaximizer };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
else window.ccPaneMaximize = api;
