((global) => {
  'use strict';
  // S19: what Pause all does to the panes (docs/DESIGN-BRIEF-1.1.md 5.2, V10). S66 built the button,
  // the "Paused since" banner and the one paused state; this module gives it its effect:
  //
  //   * every pane whose status is `working` gets one Esc (Claude Code's interrupt), once, when Pause
  //     all turns on;
  //   * nothing is killed: this module has no path to pty-kill, only the one write;
  //   * panes waiting on Blue (`attention`, `turn ended`), idle ones, and panes with no trusted status
  //     (shells, Gemini panes, `unknown`, Claude status off) get nothing, and the ones with no status
  //     are named in Logs and the notice, so Blue knows they weren't interrupted;
  //   * the Esc is requested through a one-way message (cc.ptyWrite); main doesn't confirm delivery,
  //     so the notice says "requested", never "delivered";
  //   * nothing new starts while paused: `refuseStart()` says so, and the app refuses the pane;
  //   * Resume all sends nothing: panes stay where Pause left them until Blue types.
  //
  // Process control, so it is a sensitive area (AGENTS.md): it gets a second review.
  //
  // IIFE, like the other renderer modules: classic <script> files share one global scope.

  const WORKING = 'working';
  const ESC = '\u001b';

  /**
   * deps: {
   *   write(paneId, data)   sends bytes to one live pane (cc.ptyWrite),
   *   livePanes() -> ids     the panes that exist now (the app's terms map),
   *   log(line), notify(text, ms),
   * }
   * Returns { noteView(view), forget(paneId), setPaused(pausedSince) -> report, isPaused(),
   *           refuseStart(what) -> true if refused, stateOf(paneId) }.
   */
  function createPauseAll(deps) {
    if (!deps || typeof deps.write !== 'function') throw new Error('pause-all: write-missing');
    if (typeof deps.livePanes !== 'function') throw new Error('pause-all: livePanes-missing');
    const log = typeof deps.log === 'function' ? deps.log : () => {};
    const notify = typeof deps.notify === 'function' ? deps.notify : () => {};

    const states = new Map(); // paneId -> last status word from main's token-free view
    let paused = null;        // the shell's pausedSince, or null

    function noteView(view) {
      if (!view || typeof view.paneId !== 'string' || !view.paneId) return false;
      // A status that only aged out (no new hook event for 2 minutes; pane-status-freshness.js) is not
      // a change: keep the last trusted state, as S05's toasts do. `attention` is never refreshed while
      // Blue is away, so without this a waiting pane would drop out after 2 minutes.
      // So a pane whose last trusted state is `working` (a long tool call ages it out) still gets Esc.
      if (view.state === 'unknown' && view.reason === 'stale') return false;
      states.set(view.paneId, typeof view.state === 'string' ? view.state : 'unknown');
      return true;
    }
    function forget(paneId) { return states.delete(paneId); }
    function stateOf(paneId) { return states.has(paneId) ? states.get(paneId) : null; }
    function isPaused() { return paused !== null; }

    // The one place the Esc is sent. Only on the off-to-on edge: a repeated "on" (a restart that
    // restores the paused state, or the shell re-emitting) sends nothing, so no pane gets Esc twice.
    function setPaused(pausedSince, opts) {
      const on = typeof pausedSince === 'string' && pausedSince.length > 0;
      const was = paused !== null;
      paused = on ? pausedSince : null;
      const report = { changed: on !== was, escaped: [], failed: [], untouched: 0, noStatus: [] };
      if (!report.changed) return report;
      if (!on) { log('[pause-all] resumed: nothing sent; panes go on when you type\n'); notify('Resumed. New panes can start again.', 5000); return report; }
      if (opts && opts.restored) { log('[pause-all] paused state restored at startup; nothing sent\n'); return report; }
      let live;
      try { live = deps.livePanes(); } catch { live = null; }
      if (!Array.isArray(live)) {
        log('[pause-all] could not list the panes (list-failed); no Esc sent\n');
        notify('Pause all is on, but Mako could not list the panes, so none were interrupted. New panes won\'t start.', 10000);
        return report;
      }
      for (const id of live) {
        const st = states.get(id);
        if (st === undefined || st === 'unknown') { report.noStatus.push(id); continue; }
        if (st !== WORKING) { report.untouched += 1; continue; }
        try { deps.write(id, ESC); report.escaped.push(id); }
        catch { report.failed.push(id); }
      }
      // cc.ptyWrite is a one-way message: main doesn't confirm delivery, so this says "requested".
      log(`[pause-all] paused: Esc requested for ${report.escaped.length} working pane(s)${report.escaped.length ? ` (${report.escaped.join(', ')})` : ''}, delivery not confirmed; ${report.untouched} not working, left as they are; ${report.noStatus.length} with no Claude status, not interrupted${report.noStatus.length ? ` (${report.noStatus.join(', ')})` : ''}; nothing killed\n`);
      if (report.failed.length) log(`[pause-all] Esc could not be sent to ${report.failed.join(', ')} (write-failed)\n`);
      const noStatusText = report.noStatus.length ? ` ${report.noStatus.length} pane(s) have no Claude status, so they were not interrupted.` : '';
      const failedText = report.failed.length ? ` ${report.failed.length} could not be interrupted (see Logs).` : '';
      notify(`Paused. Esc requested for ${report.escaped.length} working pane(s); nothing was killed.${noStatusText}${failedText}`, (report.failed.length || report.noStatus.length) ? 10000 : 6000);
      return report;
    }

    // Called before any new pane starts. True means refused (and said so).
    function refuseStart(what) {
      if (paused === null) return false;
      const label = typeof what === 'string' && what ? what.slice(0, 60) : 'a new pane';
      log(`[pause-all] refused to start ${label}: Pause all is on (paused)\n`);
      notify('Pause all is on, so nothing new starts. Choose Resume all first.', 6000);
      return true;
    }

    return { noteView, forget, setPaused, isPaused, refuseStart, stateOf };
  }

  const api = { WORKING, ESC, createPauseAll };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.ccPauseAll = Object.freeze(api);
})(typeof window !== 'undefined' ? window : globalThis);
