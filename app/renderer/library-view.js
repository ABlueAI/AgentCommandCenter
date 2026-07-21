'use strict';
// V5b2 Library view logic — PURE filtering / sorting / date-bucketing / status messaging plus the
// inert DOM builders for the run list and the selected-run metadata. Every value here originates
// from an untrusted manifest (title, run label, mode/route/outcome, reason-like text), so it is
// placed with the injected safe builder (agent-dom.js `el`, which is textContent-only and refuses
// URL/handler attributes) — NEVER innerHTML, HTML parsing, Markdown, or a URL-bearing attribute.
// app.js injects { el, doc }; library-view.test.js injects the REAL agent-dom `el` + a DOM stub so
// the inertness is tested against production code.
//
// IIFE-wrapped for the shared renderer <script> global scope (agent-dom.js owns a top-level `api`).
((global) => {

  const MODE_VALUES = ['transcript', 'audio', 'video'];
  const ROUTE_VALUES = ['sdk', 'cli'];
  const OUTCOME_VALUES = ['completed', 'refused', 'error', 'incomplete'];
  const DATE_KIND_VALUES = ['exact', 'approximate', 'unknown'];
  const SORT_VALUES = ['date-newest', 'date-oldest', 'tokens-highest', 'tokens-lowest', 'title'];

  // outcome null (run not finished / no terminal outcome recorded) reads as 'incomplete' everywhere.
  function outcomeOf(entry) { return entry && entry.outcome ? entry.outcome : 'incomplete'; }
  function titleOf(entry) { return (entry && typeof entry.title === 'string' && entry.title) ? entry.title : '(untitled run)'; }

  // --- filtering -----------------------------------------------------------------------------------
  function filterEntries(entries, f) {
    f = f || {};
    const q = (typeof f.title === 'string' ? f.title : '').trim().toLowerCase();
    const mode = f.mode || 'all';
    const route = f.route || 'all';
    const outcome = f.outcome || 'all';
    const dateKind = f.dateKind || 'all';
    return (entries || []).filter((e) => {
      if (q && titleOf(e).toLowerCase().indexOf(q) === -1) return false;
      if (mode !== 'all' && (e.mode || null) !== mode) return false;
      if (route !== 'all' && (e.route || null) !== route) return false;
      if (outcome !== 'all' && outcomeOf(e) !== outcome) return false;
      if (dateKind !== 'all' && (e.dateKind || 'unknown') !== dateKind) return false;
      return true;
    });
  }

  // --- sorting -------------------------------------------------------------------------------------
  // Unknown-date entries (sortMs null) are ALWAYS grouped last for the date sorts, regardless of
  // direction; null-token entries sort last for the token sorts. Returns a NEW array (stable).
  function sortEntries(entries, sortKey) {
    const list = (entries || []).slice();
    const key = SORT_VALUES.indexOf(sortKey) === -1 ? 'date-newest' : sortKey;
    const byNumberNullsLast = (get, dir) => (a, b) => {
      const av = get(a); const bv = get(b);
      const an = (typeof av === 'number'); const bn = (typeof bv === 'number');
      if (!an && !bn) return 0;
      if (!an) return 1;         // a has no value -> after b
      if (!bn) return -1;        // b has no value -> after a
      return dir * (av - bv);
    };
    let cmp;
    if (key === 'date-newest') cmp = byNumberNullsLast((e) => e.sortMs, -1);
    else if (key === 'date-oldest') cmp = byNumberNullsLast((e) => e.sortMs, 1);
    else if (key === 'tokens-highest') cmp = byNumberNullsLast((e) => e.totalTokens, -1);
    else if (key === 'tokens-lowest') cmp = byNumberNullsLast((e) => e.totalTokens, 1);
    else cmp = (a, b) => titleOf(a).toLowerCase().localeCompare(titleOf(b).toLowerCase());
    // stable sort: decorate with index so equal keys keep input order
    return list.map((e, i) => [e, i]).sort((x, y) => cmp(x[0], y[0]) || (x[1] - y[1])).map((p) => p[0]);
  }

  // --- display helpers ----------------------------------------------------------------------------
  // A readable date label from the entry's normalized date. Exact = UTC instant shown in local time;
  // approximate = the explicitly-approximate local stamp; unknown = a visible 'Unknown date'.
  function formatDate(entry) {
    const kind = (entry && entry.dateKind) || 'unknown';
    if (kind === 'unknown' || !entry || typeof entry.date !== 'string' || !entry.date) {
      return { label: 'Unknown date', approximate: false, unknown: true };
    }
    // Build a compact YYYY-MM-DD HH:MM from the ms when available (exact/approx both carry sortMs).
    let label = entry.date;
    if (typeof entry.sortMs === 'number' && Number.isFinite(entry.sortMs)) {
      const d = new Date(entry.sortMs);
      const p = (n) => String(n).padStart(2, '0');
      label = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
    }
    return { label, approximate: kind === 'approximate', unknown: false };
  }

  function outcomeLabel(entry) { return outcomeOf(entry); }
  function tokensLabel(entry) {
    const t = entry && entry.totalTokens;
    return (typeof t === 'number' && Number.isFinite(t)) ? `${t.toLocaleString('en-US')} tokens` : '— tokens';
  }
  function offsetsLabel(entry) {
    const s = entry && entry.startOffsetSeconds; const e = entry && entry.endOffsetSeconds;
    if (typeof s === 'number' && typeof e === 'number') return `range ${s}s–${e}s`;
    return 'full length';
  }
  function reportStatusShort(status) {
    switch (status) {
      case 'available': return 'report';
      case 'not-persisted': return 'no report';
      case 'incomplete': return 'incomplete';
      case 'missing': return 'missing';
      case 'unsafe': return 'unsafe';
      default: return 'no report';
    }
  }

  // The user-facing message shown in the reader when there is no readable report. `available` returns
  // null (the caller shows the text instead). Ongoing runs (incomplete + outcome null) get the exact
  // 'Report is not available yet.'; historical completed-null runs get the exact metadata-only line.
  function reportStatusMessage(status, outcome) {
    if (status === 'available') return null;
    if (status === 'not-persisted') return 'No report was persisted for this run.';
    if (status === 'missing') return 'The report file for this run is missing.';
    if (status === 'unsafe') return 'The report could not be read safely and was not shown.';
    if (status === 'incomplete') {
      if (!outcome) return 'Report is not available yet.';
      if (outcome === 'refused') return 'This run was refused; no report was produced.';
      if (outcome === 'error') return 'This run ended with an error; no report was produced.';
      return 'No report is available for this run.';
    }
    return 'No report is available for this run.';
  }

  // --- inert DOM builders (every untrusted value via the injected safe `el` text) ------------------
  // A run-list row. Returns the row element; the caller wires selection (onclick) and marks .selected.
  function buildRunRow(deps, entry) {
    const el = deps.el; const doc = deps.doc;
    const row = el(doc, 'div', { className: 'lib-row' });
    row.appendChild(el(doc, 'div', { className: 'lib-row-title', text: titleOf(entry) }));
    const meta = el(doc, 'div', { className: 'lib-row-meta' });
    const d = formatDate(entry);
    meta.appendChild(el(doc, 'span', { className: 'lib-date', text: d.label }));
    if (d.approximate) meta.appendChild(el(doc, 'span', { className: 'lib-badge lib-badge-approx', text: 'Approximate' }));
    if (entry.mode) meta.appendChild(el(doc, 'span', { className: 'lib-chip', text: String(entry.mode) }));
    if (entry.route) meta.appendChild(el(doc, 'span', { className: 'lib-chip', text: String(entry.route) }));
    meta.appendChild(el(doc, 'span', { className: `lib-chip lib-outcome-${outcomeOf(entry)}`, text: outcomeOf(entry) }));
    meta.appendChild(el(doc, 'span', { className: 'lib-report-flag', text: reportStatusShort(entry.reportStatus) }));
    row.appendChild(meta);
    return row;
  }

  // The selected-run metadata panel (shown above the report reader).
  function buildMetaPanel(deps, entry) {
    const el = deps.el; const doc = deps.doc;
    const wrap = el(doc, 'div', { className: 'lib-meta-panel' });
    wrap.appendChild(el(doc, 'div', { className: 'lib-meta-title', text: titleOf(entry) }));
    const grid = el(doc, 'div', { className: 'lib-meta-grid' });
    const d = formatDate(entry);
    const addField = (k, v) => {
      grid.appendChild(el(doc, 'span', { className: 'lib-meta-k', text: k }));
      grid.appendChild(el(doc, 'span', { className: 'lib-meta-v', text: v }));
    };
    addField('Date', d.unknown ? 'Unknown date' : (d.approximate ? `${d.label} (approximate)` : d.label));
    addField('Run', String(entry.displayRunLabel || ''));
    addField('Mode', entry.mode ? String(entry.mode) : '—');
    addField('Route', entry.route ? String(entry.route) : '—');
    addField('Outcome', outcomeOf(entry));
    addField('Tokens', tokensLabel(entry));
    addField('Segment', offsetsLabel(entry));
    // V5c1: a bounded media-artifact count (no filenames/paths). Only shown when the run records any.
    if (typeof entry.mediaCount === 'number' && entry.mediaCount > 0) {
      addField('Media', `${entry.mediaCount} file${entry.mediaCount === 1 ? '' : 's'}`);
    }
    addField('Report', reportStatusShort(entry.reportStatus));
    wrap.appendChild(grid);
    return wrap;
  }

  // A one-line status summary for the list header.
  function computeCounts(entries) {
    const c = { total: 0, available: 0, notPersisted: 0, incomplete: 0, approximate: 0, unknown: 0 };
    for (const e of (entries || [])) {
      c.total++;
      if (e.reportStatus === 'available') c.available++;
      else if (e.reportStatus === 'not-persisted') c.notPersisted++;
      else c.incomplete++;
      if (e.dateKind === 'approximate') c.approximate++;
      else if (e.dateKind === 'unknown' || !e.dateKind) c.unknown++;
    }
    return c;
  }

  const api = {
    MODE_VALUES, ROUTE_VALUES, OUTCOME_VALUES, DATE_KIND_VALUES, SORT_VALUES,
    filterEntries, sortEntries, formatDate, outcomeLabel, tokensLabel, offsetsLabel,
    reportStatusShort, reportStatusMessage, buildRunRow, buildMetaPanel, computeCounts,
  };
  global.ccLibraryView = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window === 'undefined' ? globalThis : window);
