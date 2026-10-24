'use strict';
// S11 usage panel (renderer). Shows the 5-hour and weekly plan usage that Claude Code's status line
// saved (main's `usage-read`, app/usage-ipc.js), a reset countdown for each, a warning at 90% of
// either, and a "Pause runner" button that opens claude.ai/code/routines, where the runner routine is
// paused and resumed. Mako holds no claude.ai login, so it can't toggle the routine itself
// (docs/USAGE-PANEL.md).

(function publish(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.ccUsageView = api;
})(typeof window !== 'undefined' ? window : globalThis, function factory() {
  const WARN_PERCENT = 90;
  const POLL_MS = 30000;
  // Older than this, the figures may be behind: say how old they are.
  const STALE_MS = 15 * 60 * 1000;
  const ROUTINES_URL = 'https://claude.ai/code/routines';

  function boundedReason(value) {
    return typeof value === 'string' && /^[a-z0-9-]{1,64}$/.test(value) ? value : 'unknown-error';
  }

  function formatDuration(ms) {
    if (!(ms > 0)) return '0m';
    const totalMin = Math.floor(ms / 60000);
    if (totalMin < 1) return '<1m';
    const d = Math.floor(totalMin / 1440);
    const h = Math.floor((totalMin % 1440) / 60);
    const m = totalMin % 60;
    if (d > 0) return `${d}d ${h}h`;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  }

  // One window -> what the panel shows. A window whose reset time has passed is shown as reset:
  // its old percentage no longer applies, and Claude Code drops it from the status data too.
  function describeWindow(label, win, nowMs) {
    if (!win) return { text: `${label} –`, title: `${label}: no data`, warn: false };
    const resetsMs = win.resetsAt * 1000;
    if (resetsMs <= nowMs) return { text: `${label} reset`, title: `${label}: the window has reset; new figures come with the next Claude reply`, warn: false };
    const pct = Math.round(win.usedPercentage);
    const left = formatDuration(resetsMs - nowMs);
    return {
      text: `${label} ${pct}% · ${left}`,
      title: `${label}: ${win.usedPercentage}% used, resets in ${left}`,
      warn: win.usedPercentage >= WARN_PERCENT,
    };
  }

  // The read result -> the whole panel's content. Pure, so the tests can drive every state.
  function summarize(result, nowMs) {
    if (!result || result.ok !== true) {
      const reason = boundedReason(result && result.reason);
      return {
        five: { text: '5h –', title: '', warn: false }, week: { text: 'Week –', title: '', warn: false },
        note: `Usage unavailable (${reason})`, warn: false, showSetup: !!(result && result.setupLine),
      };
    }
    if (result.state === 'not-set-up') {
      // No file can also mean set up but no Claude reply yet, so this doesn't claim "not set up".
      // Without a setup line (the dev copy) there is nothing to copy here.
      const canSetUp = typeof result.setupLine === 'string';
      return {
        five: { text: '5h –', title: '', warn: false }, week: { text: 'Week –', title: '', warn: false },
        note: canSetUp ? 'No usage yet: set up (step 41) or wait for a Claude reply' : 'No usage yet (dev copy: set up from your usual copy)',
        warn: false, showSetup: canSetUp,
      };
    }
    const five = describeWindow('5h', result.fiveHour, nowMs);
    const week = describeWindow('Week', result.sevenDay, nowMs);
    const warn = five.warn || week.warn;
    const age = nowMs - result.capturedAt;
    let note = '';
    if (warn) note = `⚠ ${WARN_PERCENT}%+ used: pause the runner`;
    else if (age > STALE_MS) note = `as of ${formatDuration(age)} ago`;
    return { five, week, note, warn, showSetup: false };
  }

  function createUsageView(deps) {
    const doc = deps && deps.document;
    const api = deps && deps.api;
    const log = (deps && deps.log) || (() => {});
    const now = (deps && deps.now) || (() => Date.now());
    const schedule = (deps && deps.setInterval) || ((fn, ms) => setInterval(fn, ms));
    if (!doc || typeof doc.getElementById !== 'function') throw new Error('usage-view: document is required');
    if (!api || typeof api.read !== 'function' || typeof api.copy !== 'function' || typeof api.openExternal !== 'function') {
      throw new Error('usage-view: read/copy/openExternal API is required');
    }
    const el = (id) => {
      const node = doc.getElementById(id);
      if (!node) throw new Error(`usage-view: #${id} is missing`);
      return node;
    };
    const panel = el('usagePanel');
    const fiveEl = el('usageFive');
    const weekEl = el('usageWeek');
    const noteEl = el('usageNote');
    const setupBtn = el('usageSetup');
    const routinesBtn = el('usageRoutines');
    let last = null;
    let warnedFor = '';

    function render() {
      const s = summarize(last, now());
      fiveEl.textContent = s.five.text;
      fiveEl.setAttribute('title', s.five.title);
      weekEl.textContent = s.week.text;
      weekEl.setAttribute('title', s.week.title);
      noteEl.textContent = s.note;
      panel.classList.toggle('usage-warn', s.warn);
      setupBtn.classList.toggle('hidden', !s.showSetup);
      // Say it once per window in the Logs tab too, so a warning seen late is still on record.
      const key = s.warn && last ? `${last.fiveHour && last.fiveHour.resetsAt}-${last.sevenDay && last.sevenDay.resetsAt}` : '';
      if (key && key !== warnedFor) log(`[usage] ${s.five.text}, ${s.week.text}: ${WARN_PERCENT}% or more of a plan limit used; pause the runner on claude.ai/code/routines`);
      warnedFor = key || warnedFor;
      return s;
    }

    async function refresh() {
      try {
        last = await api.read();
      } catch {
        last = { ok: false, reason: 'usage-read-failed' };
      }
      return render();
    }

    async function copySetup() {
      const line = last && typeof last.setupLine === 'string' ? last.setupLine : '';
      if (!line) { log('[usage] no setup line to copy'); return { ok: false }; }
      let r;
      try { r = await api.copy(line); } catch { r = { ok: false }; }
      if (r && r.ok) { noteEl.textContent = 'Copied: paste it into ~/.claude/settings.json (step 41)'; return { ok: true }; }
      log('[usage] copying the setup line failed');
      return { ok: false };
    }

    function mount() {
      setupBtn.onclick = () => { copySetup(); };
      routinesBtn.onclick = () => { api.openExternal(ROUTINES_URL); };
      schedule(() => { refresh(); }, POLL_MS);
      return refresh();
    }

    return { mount, refresh, render, copySetup };
  }

  return { createUsageView, summarize, describeWindow, formatDuration, WARN_PERCENT, POLL_MS, STALE_MS, ROUTINES_URL };
});
