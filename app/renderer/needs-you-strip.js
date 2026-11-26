((global) => {
  'use strict';
  // S19: the control room's "Needs you" strip (docs/DESIGN-BRIEF-1.1.md 5.1 and 5.2).
  //
  // One chip per pane that is waiting on Blue (pane status `attention`, the state the badge shows as
  // "needs you"), oldest first, above the panes. A chip says which pane and how many minutes it has
  // waited; a click focuses that pane. The jump key (F8) cycles through the waiting panes, oldest
  // first. The strip is hidden while nothing waits.
  //
  // IIFE, like the other renderer modules: classic <script> files share one global scope.
  //
  // WHAT THIS MODULE MAY KNOW: a pane id, a state word and a label the app gives it. Like the badge
  // (pane-status-badge.js), it is advisory: it renders words and focuses a pane, and has no control
  // that sends anything to a pane.
  //
  // PANE BINDING: keyed by the app's pane id (`pty<N>`), never by position, so a Dockview drag can't
  // hand one pane's wait to another.

  const NEEDS_YOU_STATE = 'attention';
  const MAX_CHIPS = 32;
  const MAX_LABEL = 60;

  // F8, with no modifier. Chosen because no Ctrl chord is free in a terminal (Ctrl J is a newline in
  // Claude Code's input) and Alt letters reach the CLI as Meta keys; F8 is "next problem" in editors.
  function isJumpKey(e) {
    return !!e && (e.key === 'F8' || e.code === 'F8') && !e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey;
  }

  // "just now", "1 min", "12 min", "2 h 5 min". Never negative, never NaN.
  function waitedText(sinceMs, nowMs) {
    const ms = Number(nowMs) - Number(sinceMs);
    if (!Number.isFinite(ms) || ms < 60000) return 'just now';
    const mins = Math.floor(ms / 60000);
    if (mins < 60) return `${mins} min`;
    const h = Math.floor(mins / 60), m = mins % 60;
    return m ? `${h} h ${m} min` : `${h} h`;
  }

  function cleanLabel(label, paneId) {
    const s = typeof label === 'string' ? label.replace(/[\u0000-\u001f\u007f]/g, ' ').trim() : '';
    const text = s || paneId;
    return text.length > MAX_LABEL ? `${text.slice(0, MAX_LABEL - 1)}…` : text;
  }

  function el(doc, tag, opts) {
    const n = doc.createElement(tag);
    if (opts && opts.className) n.className = opts.className;
    if (opts && opts.text !== undefined) n.textContent = opts.text;
    if (opts && opts.attrs) for (const k of Object.keys(opts.attrs)) n.setAttribute(k, opts.attrs[k]);
    return n;
  }

  /**
   * deps: {
   *   doc, host (the strip element),
   *   now() -> ms,
   *   getLabel(paneId) -> string (the pane header's name; the pane id if none),
   *   onFocus(paneId) -> true if the pane was focused, false or a throw if not,
   *   log(line),
   * }
   * Returns { update(view), remove(paneId), render(), jumpNext(), waiting() }.
   */
  function createNeedsYouStrip(deps) {
    if (!deps || !deps.doc || !deps.host) throw new Error('needs-you-strip: host-missing');
    if (typeof deps.onFocus !== 'function') throw new Error('needs-you-strip: onFocus-missing');
    const { doc, host } = deps;
    const now = typeof deps.now === 'function' ? deps.now : () => Date.now();
    const getLabel = typeof deps.getLabel === 'function' ? deps.getLabel : (id) => id;
    const log = typeof deps.log === 'function' ? deps.log : () => {};

    // paneId -> ms when it started waiting. Map keeps insertion order; waiting() sorts anyway.
    const since = new Map();
    let lastJumped = null;

    host.setAttribute('role', 'region');
    host.setAttribute('aria-label', 'Needs you');
    host.hidden = true;

    function waiting() {
      return [...since.entries()].sort((a, b) => (a[1] - b[1]) || (a[0] < b[0] ? -1 : 1)).map(([id]) => id);
    }

    function focus(paneId) {
      let ok = false;
      try { ok = deps.onFocus(paneId) === true; } catch { ok = false; }
      if (!ok) log(`[needs-you] could not focus ${paneId} (focus-failed)\n`);
      return ok;
    }

    function render() {
      while (host.firstChild) host.removeChild(host.firstChild);
      const ids = waiting();
      host.hidden = ids.length === 0;
      if (!ids.length) return;
      const t = now();
      host.appendChild(el(doc, 'span', { className: 'mk-needs-title', text: `Needs you (${ids.length})` }));
      for (const id of ids.slice(0, MAX_CHIPS)) {
        const label = cleanLabel(getLabel(id), id);
        const waited = waitedText(since.get(id), t);
        const chip = el(doc, 'button', {
          className: 'mk-btn mk-needs-chip',
          attrs: { type: 'button', 'data-pane-id': id, 'aria-label': `${label}, waiting ${waited}. Focus this pane` },
        });
        chip.appendChild(el(doc, 'span', { className: 'mk-needs-dot', attrs: { 'aria-hidden': 'true' } }));
        chip.appendChild(el(doc, 'span', { className: 'mk-needs-label', text: label }));
        chip.appendChild(el(doc, 'span', { className: 'mk-needs-time', text: waited }));
        chip.addEventListener('click', () => { lastJumped = id; focus(id); });
        host.appendChild(chip);
      }
      if (ids.length > MAX_CHIPS) host.appendChild(el(doc, 'span', { className: 'mk-meta', text: `and ${ids.length - MAX_CHIPS} more` }));
      host.appendChild(el(doc, 'span', { className: 'mk-meta mk-needs-hint', text: 'F8: next' }));
    }

    // A pane-status view: { paneId, state, reason }. Only `attention` waits; any other state, an
    // unknown one included, ends the wait (the badge shows why). Repeats keep the first time.
    function update(view) {
      if (!view || typeof view.paneId !== 'string' || !view.paneId) return false;
      const waits = view.state === NEEDS_YOU_STATE;
      const had = since.has(view.paneId);
      if (waits && !had) since.set(view.paneId, now());
      else if (!waits && had) since.delete(view.paneId);
      else return false;
      render();
      return true;
    }

    function remove(paneId) {
      if (!since.delete(paneId)) return false;
      if (lastJumped === paneId) lastJumped = null;
      render();
      return true;
    }

    // Focus the next waiting pane after the last one jumped to, oldest first, wrapping around.
    // Returns the pane id, or null when nothing waits.
    function jumpNext() {
      const ids = waiting();
      if (!ids.length) { log('[needs-you] nothing is waiting on you\n'); return null; }
      const i = lastJumped ? ids.indexOf(lastJumped) : -1;
      const next = ids[(i + 1) % ids.length];
      lastJumped = next;
      focus(next);
      return next;
    }

    return { update, remove, render, jumpNext, waiting };
  }

  const api = { NEEDS_YOU_STATE, MAX_CHIPS, isJumpKey, waitedText, cleanLabel, createNeedsYouStrip };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.ccNeedsYouStrip = Object.freeze(api);
})(typeof window !== 'undefined' ? window : globalThis);
