((global) => {
  'use strict';
  // S19: the stall watch in the pane header (docs/DESIGN-BRIEF-1.1.md 4.2 and 5.2, scope V7).
  //
  //   * "stalled" after 20 minutes of silence while the pane's status is `working` (no terminal
  //     output at all in that time), or after 5 failed tries;
  //   * a usage stop shows "waiting for reset at hh:mm" and is never called stalled.
  //
  // Builder's reading of the signals Mako has today:
  //   * silence = no PTY output for the pane (the app calls noteOutput on every chunk);
  //   * a failed try = a `failed` pane status (Claude Code's StopFailure hook: the turn ended on an
  //     error). The count goes back to 0 when a turn ends normally (`turn ended`) or the pane is idle;
  //   * a usage stop = a 5-hour or weekly window at 100% or more whose reset is still ahead (S11's
  //     usage figures); a pane that is then silent for a minute, or failed, is waiting for the reset.
  //
  // It renders a word in the header and nothing else: no control, no write to a pane.
  // IIFE, like the other renderer modules: classic <script> files share one global scope.

  const SILENCE_MS = 20 * 60 * 1000;
  const FAILED_TRIES = 5;
  const USAGE_SILENCE_MS = 60 * 1000;

  // The later reset of the windows that are full (>= 100%) and not yet reset, in ms; else null.
  function usageResetMs(usage, nowMs) {
    if (!usage || typeof usage !== 'object') return null;
    let reset = null;
    for (const w of [usage.fiveHour, usage.sevenDay]) {
      if (!w || typeof w.usedPercentage !== 'number' || typeof w.resetsAt !== 'number') continue;
      const ms = w.resetsAt * 1000;
      if (w.usedPercentage >= 100 && ms > nowMs && (reset === null || ms > reset)) reset = ms;
    }
    return reset;
  }

  function hhmm(ms) {
    const d = new Date(ms);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }

  /**
   * One pane -> { kind: 'usage-wait' | 'stalled', text } or null.
   * p: { state, lastOutputMs, failedTries }, nowMs, resetMs (from usageResetMs).
   */
  function classify(p, nowMs, resetMs) {
    if (!p || typeof p.state !== 'string') return null;
    const silentMs = Number.isFinite(p.lastOutputMs) ? Math.max(0, nowMs - p.lastOutputMs) : 0;
    const tries = Number.isFinite(p.failedTries) ? p.failedTries : 0;
    if (resetMs !== null && resetMs !== undefined && ((p.state === 'working' && silentMs >= USAGE_SILENCE_MS) || p.state === 'failed')) {
      return { kind: 'usage-wait', text: `waiting for reset at ${hhmm(resetMs)}` };
    }
    if (tries >= FAILED_TRIES && (p.state === 'failed' || p.state === 'working')) {
      return { kind: 'stalled', text: `stalled · ${tries} failed tries` };
    }
    if (p.state === 'working' && silentMs >= SILENCE_MS) {
      return { kind: 'stalled', text: `stalled · ${Math.floor(silentMs / 60000)} min silent` };
    }
    return null;
  }

  /**
   * deps: { doc, getHead(paneId) -> the pane's header element or null, now() -> ms, log(line) }
   * Returns { noteView(view), noteOutput(paneId), setUsage(result), forget(paneId), tick() -> Map }.
   */
  function createStallWatch(deps) {
    if (!deps || !deps.doc || typeof deps.getHead !== 'function') throw new Error('stall-watch: deps-missing');
    const { doc } = deps;
    const now = typeof deps.now === 'function' ? deps.now : () => Date.now();
    const log = typeof deps.log === 'function' ? deps.log : () => {};
    const panes = new Map(); // paneId -> { state, lastOutputMs, failedTries }
    let usage = null;
    let paintFailedLogged = false;

    function entry(paneId) {
      let p = panes.get(paneId);
      if (!p) { p = { state: null, lastOutputMs: now(), failedTries: 0 }; panes.set(paneId, p); }
      return p;
    }

    function noteView(view) {
      if (!view || typeof view.paneId !== 'string' || !view.paneId || typeof view.state !== 'string') return false;
      const p = entry(view.paneId);
      if (view.state === p.state) return false;
      if (view.state === 'failed') p.failedTries += 1;
      else if (view.state === 'turn ended' || view.state === 'idle') p.failedTries = 0;
      // Silence is counted from when the pane started working, or from its last output since.
      if (view.state === 'working' && p.state !== 'working') p.lastOutputMs = now();
      p.state = view.state;
      return true;
    }
    function noteOutput(paneId) { if (typeof paneId === 'string' && paneId) entry(paneId).lastOutputMs = now(); }
    function setUsage(result) { usage = result && result.ok !== false ? result : null; }
    function forget(paneId) { return panes.delete(paneId); }

    function paint(paneId, shown) {
      // A null header is normal (the pane isn't in the page right now); a throw goes to tick's log.
      const head = deps.getHead(paneId);
      if (!head) return;
      let tag = head.querySelector('.stall-tag');
      if (!shown) { if (tag) tag.remove(); return; }
      if (!tag) {
        tag = doc.createElement('span');
        tag.setAttribute('role', 'status');
        const before = head.querySelector('.copy-out');
        if (before && typeof head.insertBefore === 'function') head.insertBefore(tag, before); else head.appendChild(tag);
      }
      tag.className = `stall-tag stall-${shown.kind}`;
      tag.setAttribute('data-stall', shown.kind);
      tag.textContent = shown.text;
    }

    // Recompute every pane and paint its header. Returns paneId -> what is shown (or null).
    function tick() {
      const t = now();
      const resetMs = usageResetMs(usage, t);
      const out = new Map();
      for (const [paneId, p] of panes) {
        const shown = classify(p, t, resetMs);
        out.set(paneId, shown);
        try { paint(paneId, shown); }
        catch { if (!paintFailedLogged) { paintFailedLogged = true; log('[stall-watch] could not update a pane header (paint-failed)\n'); } }
      }
      return out;
    }

    return { noteView, noteOutput, setUsage, forget, tick };
  }

  const api = { SILENCE_MS, FAILED_TRIES, USAGE_SILENCE_MS, usageResetMs, hhmm, classify, createStallWatch };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.ccStallWatch = Object.freeze(api);
})(typeof window !== 'undefined' ? window : globalThis);
