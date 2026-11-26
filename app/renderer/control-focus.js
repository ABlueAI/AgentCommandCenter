((global) => {
  'use strict';
  // S19: the control room's right panel (docs/DESIGN-BRIEF-1.1.md 5.1): the shared In-focus card
  // (S66's in-focus-card.js) for the selected pane, or, when its status has no card state, a short
  // properties list. S19 wires three of the card's actions:
  //   * Open pane and Terminal focus the pane (no write);
  //   * Interrupt (Esc) sends one Esc to that one pane (process control: a second review), only from
  //     the working card, and logs it. Nothing is killed.
  // Every other action stays disabled with the card's own "not wired yet" reason (the Composer, S46
  // and S18 bring them).
  //
  // Card states from the pane status Mako has today (token-free, no reason text): `attention` is a
  // question (Mako can't tell a permission prompt from another question; docs/NEEDS-YOU-ALERTS.md),
  // `working` is working, `turn ended` is finished. Others get the properties list.
  //
  // IIFE: classic <script> files share one global scope.

  const CARD_STATE = Object.freeze({ attention: 'question', working: 'working', 'turn ended': 'finished' });
  const ESC = '\u001b';

  function cardState(status) { return Object.hasOwn(CARD_STATE, status) ? CARD_STATE[status] : null; }

  function el(doc, tag, cls, text) {
    const n = doc.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  }

  /**
   * deps: {
   *   doc, host (the aside),
   *   buildCard(doc, task, handlers) (ccInFocusCard.buildInFocusCard),
   *   getPane(paneId) -> { title, branch, authority, role } or null (pane gone),
   *   focusPane(paneId) -> true if focused,
   *   write(paneId, data),
   *   log(line),
   * }
   * Returns { select(paneId), noteView(view), forget(paneId), render(), selected() }.
   */
  function createControlFocus(deps) {
    if (!deps || !deps.doc || !deps.host) throw new Error('control-focus: host-missing');
    for (const k of ['buildCard', 'getPane', 'focusPane', 'write']) if (typeof deps[k] !== 'function') throw new Error(`control-focus: ${k}-missing`);
    const { doc, host } = deps;
    const log = typeof deps.log === 'function' ? deps.log : () => {};
    const status = new Map();
    let current = null;

    host.setAttribute('aria-label', 'In focus');

    function handlers(paneId) {
      const open = () => { if (!deps.focusPane(paneId)) log(`[control-focus] could not open ${paneId} (focus-failed)\n`); };
      return {
        openPane: open,
        terminal: open,
        interrupt: () => {
          if (status.get(paneId) !== 'working') { log(`[control-focus] refused to interrupt ${paneId}: it is not working (not-working)\n`); render(); return; }
          try { deps.write(paneId, ESC); log(`[control-focus] Esc requested for ${paneId} (Interrupt; delivery not confirmed); nothing killed\n`); }
          catch { log(`[control-focus] Esc could not be sent to ${paneId} (write-failed)\n`); }
        },
      };
    }

    function render() {
      while (host.firstChild) host.removeChild(host.firstChild);
      if (!current) {
        host.appendChild(el(doc, 'p', 'mk-meta mk-focus-empty', 'Select a pane to see it here.'));
        return;
      }
      let pane = null;
      try { pane = deps.getPane(current); } catch { pane = null; }
      if (!pane) { current = null; render(); return; }
      const st = status.has(current) ? status.get(current) : null;
      const state = cardState(st);
      if (state) {
        try {
          host.appendChild(deps.buildCard(doc, {
            state, title: pane.title, role: pane.role, authority: pane.authority, branch: pane.branch,
          }, handlers(current)));
          return;
        } catch {
          log('[control-focus] the In-focus card could not be drawn (card-failed); showing the properties\n');
        }
      }
      const box = el(doc, 'section', 'mk-card mk-focus-props');
      box.appendChild(el(doc, 'p', 'mk-overline', 'Selected pane'));
      box.appendChild(el(doc, 'h3', 'mk-card-title', pane.title || current));
      const dl = el(doc, 'dl', 'mk-props');
      for (const [label, value] of [['Status', st || 'no status'], ['Role', pane.role], ['Authority', pane.authority], ['Branch', pane.branch]]) {
        dl.appendChild(el(doc, 'dt', 'mk-prop-name', label));
        dl.appendChild(el(doc, 'dd', 'mk-prop-value', value ? String(value).slice(0, 200) : '–'));
      }
      box.appendChild(dl);
      const open = el(doc, 'button', 'mk-btn', 'Open pane');
      open.setAttribute('type', 'button');
      open.setAttribute('data-action', 'openPane');
      open.addEventListener('click', handlers(current).openPane);
      box.appendChild(open);
      host.appendChild(box);
    }

    function select(paneId) {
      if (typeof paneId !== 'string' || !paneId || paneId === current) return false;
      current = paneId;
      render();
      return true;
    }
    function noteView(view) {
      if (!view || typeof view.paneId !== 'string' || !view.paneId) return false;
      // A status that only aged out (no new hook event for 2 minutes; pane-status-freshness.js) is not
      // a change: keep the last trusted state, as S05's toasts do. `attention` is never refreshed while
      // Blue is away, so without this a waiting pane would drop out after 2 minutes.
      if (view.state === 'unknown' && view.reason === 'stale') return false;
      const prev = status.get(view.paneId);
      status.set(view.paneId, typeof view.state === 'string' ? view.state : 'unknown');
      if (view.paneId === current && prev !== view.state) render();
      return true;
    }
    function forget(paneId) {
      status.delete(paneId);
      if (paneId === current) { current = null; render(); }
    }

    render();
    return { select, noteView, forget, render, selected: () => current };
  }

  const api = { CARD_STATE, ESC, cardState, createControlFocus };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.ccControlFocus = Object.freeze(api);
})(typeof window !== 'undefined' ? window : globalThis);
