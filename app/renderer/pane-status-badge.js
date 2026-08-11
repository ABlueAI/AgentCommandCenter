((global) => {
  'use strict';
  // EXPERIMENT A — PROTOTYPE ONLY. Renderer badge for one Claude pane.
  //
  // Procurement record: docs/OSS-PROCUREMENT-pane-status.md
  // Blue's verdict, verbatim: BLUE SUBSYSTEM VERDICT: PROTOTYPE
  //
  // IIFE, per the V1a lesson recorded in the repo: classic renderer <script> files share ONE global
  // scope, and a bare top-level `const` here can collide with another module and kill the renderer
  // while every node test stays green.
  //
  // WHAT THIS MODULE MAY KNOW: a pane id, a state word, and a reason word. It never receives the pane
  // token — main's view object has no field for one — so there is no renderer state, DOM attribute, or
  // devtools inspection that can reveal it.
  //
  // PANE BINDING: state is keyed by the app's own pane id (`pty<N>`), the same key main uses for the
  // PTY and Dockview uses for its panel registry. It is deliberately NOT keyed by DOM position, tab
  // index, Dockview group, panel ordinal, or "the active pane": those all change when Blue drags a
  // pane, and a status indicator that follows the position rather than the process is exactly the
  // mis-attribution threat 10 of the procurement record describes.

  const STATE_LABEL = {
    idle: 'idle',
    working: 'working',
    attention: 'needs you',
    'turn ended': 'turn ended',
    failed: 'failed',
    exited: 'exited',
    unknown: 'unknown',
  };

  // Why the badge is showing `unknown`. Shown as a tooltip so the honest fallback is also an
  // informative one — "unknown" with no explanation trains people to ignore it.
  const REASON_TEXT = {
    'no-signal': 'No status signal received yet.',
    stale: 'No signal recently — the last state is too old to trust.',
    'version-mismatch': 'This Claude Code version was not verified by the prototype.',
    'unsupported-signal': 'The reporter sent an event this prototype does not display.',
    released: 'Status reporting ended for this pane.',
  };

  const STATE_CLASS = {
    idle: 'ps-idle',
    working: 'ps-working',
    attention: 'ps-attention',
    'turn ended': 'ps-turn-ended',
    failed: 'ps-failed',
    exited: 'ps-exited',
    unknown: 'ps-unknown',
  };

  /**
   * PURE. Given a view from main, produce exactly what the DOM should show. Separated from the DOM so
   * the wording rules — above all "Stop is `turn ended`, never `finished`" — are testable without a
   * browser.
   */
  function describeView(view) {
    const v = view || {};
    const state = Object.prototype.hasOwnProperty.call(STATE_LABEL, v.state) ? v.state : 'unknown';
    const label = STATE_LABEL[state];
    const reason = (v.reason && REASON_TEXT[v.reason]) || null;
    const title = reason
      ? `PROTOTYPE pane status — ${label}. ${reason}`
      : `PROTOTYPE pane status — ${label}. Claude Code hook signal (Experiment A).`;
    return { state, label, title, className: STATE_CLASS[state], prototype: true };
  }

  /**
   * deps:
   *   getPaneElement(paneId) -> the pane's root element, or null
   *   document               -> the document (injected for tests)
   *   log(line)              -> appendLog
   */
  function createPaneStatusBadge(deps) {
    const d = deps || {};
    const doc = d.document;
    const getPaneElement = typeof d.getPaneElement === 'function' ? d.getPaneElement : () => null;
    const log = typeof d.log === 'function' ? d.log : () => {};
    // paneId -> last view. Keyed by pane identity, never by position.
    const views = new Map();

    function ensureBadge(paneId) {
      const pane = getPaneElement(paneId);
      if (!pane || typeof pane.querySelector !== 'function') return null;
      let el = pane.querySelector('.pane-status-badge');
      if (el) return el;
      const host = pane.querySelector('.term-head') || pane;
      if (!host || typeof host.appendChild !== 'function') return null;
      el = doc.createElement('span');
      el.className = 'pane-status-badge';
      // The word PROTOTYPE is part of the control, not a comment: the work order requires prototype
      // mode to visibly identify itself, and a status dot with no provenance is exactly the thing a
      // future reader would mistake for a shipped feature.
      const tag = doc.createElement('span');
      tag.className = 'pane-status-proto';
      tag.textContent = 'PROTOTYPE';
      const dot = doc.createElement('span');
      dot.className = 'pane-status-dot';
      const text = doc.createElement('span');
      text.className = 'pane-status-text';
      el.appendChild(tag);
      el.appendChild(dot);
      el.appendChild(text);
      host.appendChild(el);
      return el;
    }

    /** Apply a view from main. Ignores anything without a pane id — there is no "current pane" here. */
    function update(view) {
      if (!view || typeof view.paneId !== 'string' || !view.paneId) return null;
      const shown = describeView(view);
      views.set(view.paneId, shown);
      const el = ensureBadge(view.paneId);
      if (!el) return shown; // pane not in the DOM (yet, or any more) — state is still remembered
      el.className = `pane-status-badge ${shown.className}`;
      el.setAttribute('title', shown.title);
      el.setAttribute('data-pane-status', shown.state);
      const text = el.querySelector('.pane-status-text');
      if (text) text.textContent = shown.label;
      return shown;
    }

    /**
     * Re-attach after a Dockview move. Dockview reparents the pane element, which can drop the badge
     * node; the STATE is unaffected because it lives in `views`, keyed by pane id. Calling this after
     * a move restores the visual without inventing or resetting a status.
     */
    function reattach(paneId) {
      const shown = views.get(paneId);
      if (!shown) return null;
      const el = ensureBadge(paneId);
      if (!el) return null;
      el.className = `pane-status-badge ${shown.className}`;
      el.setAttribute('title', shown.title);
      el.setAttribute('data-pane-status', shown.state);
      const text = el.querySelector('.pane-status-text');
      if (text) text.textContent = shown.label;
      log(`[pane-status] badge re-attached to ${paneId} after a layout change (state preserved: ${shown.state})\n`);
      return shown;
    }

    function forget(paneId) { return views.delete(paneId); }
    function stateOf(paneId) { const v = views.get(paneId); return v ? v.state : null; }
    function trackedPanes() { return [...views.keys()]; }

    return { update, reattach, forget, stateOf, trackedPanes, describeView };
  }

  const api = { describeView, createPaneStatusBadge, STATE_LABEL, REASON_TEXT, STATE_CLASS };

  // REVISION 2 — gate off means ABSENT, not inert. `index.html` loads this file unconditionally (a
  // classic <script> tag cannot be conditional), so the GLOBAL is what has to disappear. It is
  // published only when the preload actually exposed the prototype bridge, which happens only when
  // main forwarded the gate token at window construction. With the gate off this module therefore
  // defines nothing on `window`: no `ccPaneStatusBadge`, and app.js finds nothing to construct.
  //
  // `module.exports` is unconditional so the node test can exercise the pure functions without
  // pretending to be a gated renderer.
  if (global.ccPaneStatus && global.ccPaneStatus.enabled === true) global.ccPaneStatusBadge = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
