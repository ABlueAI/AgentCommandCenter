((global) => {
  'use strict';
  // Blue Helm production pane status — renderer badge and the Terminals-toolbar setup control.
  //
  // Procurement record: docs/OSS-PROCUREMENT-pane-status.md
  // Blue's verdict, verbatim: BLUE SUBSYSTEM VERDICT: BUILD FRESH
  //
  // IIFE, per the V1a lesson recorded in this repo: classic renderer <script> files share ONE global
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
  // pane, and a status indicator that follows the POSITION rather than the PROCESS is exactly the
  // mis-attribution threat 10 of the procurement record describes.
  //
  // THE BADGE IS ADVISORY. It renders a word. It has no control that acts on a pane, no path to the
  // token, and nothing it displays authorizes anything.

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
    'version-mismatch': 'This Claude Code version has not been verified for pane status.',
    'hook-removed': 'Status reporting was removed for this installation.',
    'reconciliation-required': 'Pane status needs attention — see the Claude status control.',
    'not-installed': 'Pane status is not set up.',
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

  // The toolbar control's vocabulary. Each entry is a DISTINCT situation with a distinct fix, which is
  // the whole reason they are not collapsed into a single "error".
  const SETUP_TEXT = {
    disabled: {
      label: 'Claude status: off',
      title: 'Pane status is not set up. Choose Set up to install the Claude Code hooks.',
      action: 'install',
    },
    ready: {
      label: 'Claude status: on',
      title: 'Pane status is active. Choose Remove to uninstall the Claude Code hooks.',
      action: 'remove',
    },
    'in-flight': {
      label: 'Claude status: working…',
      title: 'A setup or removal is in progress.',
      action: null,
    },
    'version-mismatch': {
      label: 'Claude status: unknown',
      title: 'This Claude Code version has not been verified for pane status, so every pane shows unknown.',
      action: 'remove',
    },
    locked: {
      label: 'Claude status: locked',
      title: 'Another process holds the settings lock. If that process is gone, choose Clear stale lock.',
      action: 'clear',
    },
    'other-installation': {
      label: 'Claude status: other install',
      title: 'Another Blue Helm installation owns the Claude Code hooks. This installation will not change them.',
      action: null,
    },
    malformed: {
      label: 'Claude status: unreadable',
      title: 'The Claude settings file or the installation record could not be read. See docs/RECOVERY-pane-status-hooks.md.',
      action: null,
    },
    'reconciliation-required': {
      label: 'Claude status: needs attention',
      title: 'Setup could not be reconciled automatically. Reporting is disabled. See docs/RECOVERY-pane-status-hooks.md.',
      action: null,
    },
  };

  const SETUP_CLASS = {
    disabled: 'ps-setup-off',
    ready: 'ps-setup-on',
    'in-flight': 'ps-setup-busy',
    'version-mismatch': 'ps-setup-warn',
    locked: 'ps-setup-warn',
    'other-installation': 'ps-setup-warn',
    malformed: 'ps-setup-error',
    'reconciliation-required': 'ps-setup-error',
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
      ? `Claude pane status — ${label}. ${reason}`
      : `Claude pane status — ${label}. Advisory only; derived from Claude Code hook signals.`;
    return { state, label, title, className: STATE_CLASS[state], reason: v.reason || null };
  }

  /** PURE. Given a setup state from main, produce the toolbar control's appearance. */
  function describeSetup(setup) {
    const s = setup || {};
    const key = Object.prototype.hasOwnProperty.call(SETUP_TEXT, s.state) ? s.state : 'disabled';
    const base = SETUP_TEXT[key];
    // A detail is a bounded constant from main; it is appended so a person can quote it into the
    // recovery document without hunting through logs.
    const title = s.detail ? `${base.title} (${s.detail})` : base.title;
    return { state: key, label: base.label, title, className: SETUP_CLASS[key], action: base.action };
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
      const dot = doc.createElement('span');
      dot.className = 'pane-status-dot';
      const text = doc.createElement('span');
      text.className = 'pane-status-text';
      el.appendChild(dot);
      el.appendChild(text);
      host.appendChild(el);
      return el;
    }

    function paint(paneId, shown) {
      const el = ensureBadge(paneId);
      if (!el) return null;
      el.className = `pane-status-badge ${shown.className}`;
      el.setAttribute('title', shown.title);
      el.setAttribute('data-pane-status', shown.state);
      const text = el.querySelector('.pane-status-text');
      if (text) text.textContent = shown.label;
      return shown;
    }

    /** Apply a view from main. Ignores anything without a pane id — there is no "current pane" here. */
    function update(view) {
      if (!view || typeof view.paneId !== 'string' || !view.paneId) return null;
      const shown = describeView(view);
      views.set(view.paneId, shown);
      // A pane not in the DOM (yet, or any more) still has its state remembered.
      paint(view.paneId, shown);
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
      const painted = paint(paneId, shown);
      if (!painted) return null;
      log(`[pane-status] badge re-attached to ${paneId} after a layout change (state preserved: ${shown.state})\n`);
      return shown;
    }

    /** Re-attach every tracked pane. Wired to Dockview's layout-change event. */
    function reattachAll() {
      let n = 0;
      for (const paneId of views.keys()) if (reattach(paneId)) n++;
      return n;
    }

    function forget(paneId) { return views.delete(paneId); }
    function stateOf(paneId) { const v = views.get(paneId); return v ? v.state : null; }
    function trackedPanes() { return [...views.keys()]; }

    return { update, reattach, reattachAll, forget, stateOf, trackedPanes, describeView };
  }

  /**
   * The compact Claude status control for the existing Terminals toolbar.
   *
   * Its three possible actions map one-to-one onto three of the four IPC invokes. There is no control
   * here that sets a pane's status, reaches a token, or names a path.
   *
   * deps:
   *   document, getToolbarElement() -> the toolbar node
   *   bridge  -> window.ccPaneStatus
   *   log(line)
   */
  function createSetupControl(deps) {
    const d = deps || {};
    const doc = d.document;
    const getToolbar = typeof d.getToolbarElement === 'function' ? d.getToolbarElement : () => null;
    const bridge = d.bridge || null;
    const log = typeof d.log === 'function' ? d.log : () => {};
    let root = null, labelEl = null, actionEl = null;
    let current = describeSetup({ state: 'disabled' });
    let busy = false;

    function ensure() {
      if (root) return root;
      const toolbar = getToolbar();
      if (!toolbar || typeof toolbar.appendChild !== 'function') return null;
      root = doc.createElement('span');
      root.className = 'pane-status-setup';
      labelEl = doc.createElement('span');
      labelEl.className = 'pane-status-setup-label';
      actionEl = doc.createElement('button');
      actionEl.className = 'pane-status-setup-action';
      actionEl.setAttribute('type', 'button');
      if (typeof actionEl.addEventListener === 'function') actionEl.addEventListener('click', onAction);
      root.appendChild(labelEl);
      root.appendChild(actionEl);
      toolbar.appendChild(root);
      return root;
    }

    async function onAction() {
      if (!bridge || busy || !current.action) return;
      const action = current.action;
      busy = true;
      try {
        let res = null;
        if (action === 'install') res = await bridge.install();
        else if (action === 'remove') res = await bridge.remove();
        else if (action === 'clear') res = await bridge.clearStaleLock();
        if (res && res.setup) render(res.setup);
        if (res && res.ok === false && res.reason) {
          // A refusal is a VISIBLE outcome, never a swallowed one.
          log(`[pane-status] ${action} refused: ${res.reason}\n`);
        }
      } finally {
        busy = false;
      }
    }

    function render(setup) {
      current = describeSetup(setup);
      const el = ensure();
      if (!el) return current;
      el.className = `pane-status-setup ${current.className}`;
      el.setAttribute('title', current.title);
      el.setAttribute('data-pane-status-setup', current.state);
      if (labelEl) labelEl.textContent = current.label;
      if (actionEl) {
        const text = current.action === 'install' ? 'Set up'
          : current.action === 'remove' ? 'Remove'
            : current.action === 'clear' ? 'Clear stale lock' : '';
        actionEl.textContent = text;
        actionEl.hidden = !current.action;
        actionEl.disabled = !current.action;
      }
      return current;
    }

    async function refresh() {
      if (!bridge || typeof bridge.getSetupState !== 'function') return null;
      const res = await bridge.getSetupState();
      if (res && res.ok && res.setup) return render(res.setup);
      return null;
    }

    return { render, refresh, onAction, currentState: () => current.state, currentAction: () => current.action };
  }

  const api = {
    describeView, describeSetup, createPaneStatusBadge, createSetupControl,
    STATE_LABEL, REASON_TEXT, STATE_CLASS, SETUP_TEXT, SETUP_CLASS,
  };

  // Production: the bridge is exposed unconditionally in the trusted window, so the badge global is
  // published unconditionally too. There is no gate token any more — pane status is a feature of the
  // app, and whether it is SET UP is a runtime question the toolbar control answers honestly.
  global.ccPaneStatusBadge = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
