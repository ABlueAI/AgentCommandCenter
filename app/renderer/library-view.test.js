'use strict';
// Run: node app/renderer/library-view.test.js
// Plain Node.js — exercises the ACTUAL V5b2 library-view logic: filtering, sorting (unknown-date last),
// date bucketing, the exact report-status messages, and — via the REAL agent-dom `el` builder plus a
// tiny DOM stub — that every manifest-derived value (hostile title / run label / reason-like text)
// renders as INERT TEXT (never innerHTML/markup/URL attribute).

const LV = require('./library-view');
const { el } = require('./agent-dom');

let passed = 0, failed = 0;
function assert(cond, label) {
  if (cond) { process.stdout.write(`  ✓ ${label}\n`); passed++; }
  else { process.stderr.write(`  ✗ FAIL: ${label}\n`); failed++; }
}

// --- Minimal DOM stub: textContent stores a string and creates NO child nodes; innerHTML would PARSE
// markup into elements. library-view must never use innerHTML, so a hostile value can only be text. --
function parseHtml() { throw new Error('innerHTML parsing must never be triggered by library-view'); }
class StubEl {
  constructor(doc, tag) { this.ownerDocument = doc; this.nodeType = 1; this.tagName = String(tag).toUpperCase(); this.childNodes = []; this.attributes = {}; this._text = null; this._class = ''; }
  get className() { return this._class; } set className(v) { this._class = String(v); this.attributes['class'] = String(v); }
  get classList() { const s = this; return { add: (c) => { s._class = (s._class + ' ' + c).trim(); }, contains: (c) => s._class.split(/\s+/).includes(c) }; }
  setAttribute(k, v) { this.attributes[k] = String(v); if (k === 'class') this._class = String(v); }
  set title(v) { this.setAttribute('title', v); } get title() { return this.attributes['title'] || ''; }
  set textContent(v) { this._text = v == null ? '' : String(v); this.childNodes = []; }
  get textContent() { return this._text !== null ? this._text : this.childNodes.map((c) => c.textContent).join(''); }
  set innerHTML(v) { this.childNodes = parseHtml(); }   // triggers the guard above if ever used
  appendChild(n) { this._text = null; this.childNodes.push(n); return n; }
  walk(acc) { for (const c of this.childNodes) { if (c instanceof StubEl) { acc.push(c); c.walk(acc); } } return acc; }
}
class StubText { constructor(t) { this.nodeType = 3; this.tagName = '#text'; this._text = t == null ? '' : String(t); } get textContent() { return this._text; } }
const doc = { createElement: (t) => new StubEl(doc, t), createTextNode: (t) => new StubText(t) };
const deps = { el, doc };

function entry(o) {
  return Object.assign({
    handle: 'lib_x', displayRunLabel: 'run-20260718-170359-368-1-a5e6070a', title: 'T', date: '2026-07-18T17:03:59.368Z',
    dateKind: 'exact', sortMs: 1784394239368, mode: 'transcript', route: 'cli', outcome: 'completed', totalTokens: 100,
    startOffsetSeconds: null, endOffsetSeconds: null, reportStatus: 'available',
  }, o || {});
}

// --- filtering ---
{
  const es = [
    entry({ title: 'Cats video', mode: 'video', route: 'sdk', outcome: 'completed', dateKind: 'exact' }),
    entry({ title: 'Dogs transcript', mode: 'transcript', route: 'cli', outcome: 'refused', dateKind: 'approximate' }),
    entry({ title: 'unknown one', mode: null, route: 'cli', outcome: null, dateKind: 'unknown' }),
  ];
  assert(LV.filterEntries(es, { title: 'cats' }).length === 1, 'title filter is case-insensitive substring');
  assert(LV.filterEntries(es, { mode: 'video' }).length === 1, 'mode filter matches exactly');
  assert(LV.filterEntries(es, { route: 'cli' }).length === 2, 'route filter matches exactly');
  assert(LV.filterEntries(es, { outcome: 'incomplete' }).length === 1, 'outcome filter maps null -> incomplete');
  assert(LV.filterEntries(es, { dateKind: 'unknown' }).length === 1, 'dateKind filter matches unknown');
  assert(LV.filterEntries(es, {}).length === 3, 'no filters returns all');
}

// --- sorting: unknown-date always last for date sorts ---
{
  const es = [
    entry({ title: 'old', sortMs: 1000, dateKind: 'exact' }),
    entry({ title: 'unknown', sortMs: null, dateKind: 'unknown' }),
    entry({ title: 'new', sortMs: 3000, dateKind: 'exact' }),
    entry({ title: 'mid', sortMs: 2000, dateKind: 'approximate' }),
  ];
  const newest = LV.sortEntries(es, 'date-newest').map((e) => e.title);
  assert(newest.join(',') === 'new,mid,old,unknown', `date-newest orders new..old then unknown last (got ${newest})`);
  const oldest = LV.sortEntries(es, 'date-oldest').map((e) => e.title);
  assert(oldest.join(',') === 'old,mid,new,unknown', `date-oldest orders old..new then unknown last (got ${oldest})`);
  const toks = LV.sortEntries([entry({ title: 'a', totalTokens: 5 }), entry({ title: 'b', totalTokens: null }), entry({ title: 'c', totalTokens: 50 })], 'tokens-highest').map((e) => e.title);
  assert(toks.join(',') === 'c,a,b', `tokens-highest orders high..low then null last (got ${toks})`);
  const byTitle = LV.sortEntries([entry({ title: 'Zebra' }), entry({ title: 'apple' }), entry({ title: 'Mango' })], 'title').map((e) => e.title);
  assert(byTitle.join(',') === 'apple,Mango,Zebra', `title sort is case-insensitive A-Z (got ${byTitle})`);
}

// --- dates ---
{
  const ex = LV.formatDate(entry({ dateKind: 'exact', sortMs: 1784394239368 }));
  assert(ex.approximate === false && ex.unknown === false && /\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(ex.label), 'exact date formats to YYYY-MM-DD HH:MM');
  const ap = LV.formatDate(entry({ dateKind: 'approximate', sortMs: 1784394239368 }));
  assert(ap.approximate === true && ap.unknown === false, 'approximate date is flagged approximate');
  const un = LV.formatDate(entry({ dateKind: 'unknown', date: null, sortMs: null }));
  assert(un.unknown === true && un.label === 'Unknown date', 'unknown date shows a visible Unknown date label');
}

// --- exact report-status messages ---
{
  assert(LV.reportStatusMessage('available') === null, 'available returns null (show the text)');
  assert(LV.reportStatusMessage('not-persisted') === 'No report was persisted for this run.', 'not-persisted is the exact metadata-only line');
  assert(LV.reportStatusMessage('incomplete', null) === 'Report is not available yet.', 'ongoing (incomplete + null outcome) is the exact not-yet line');
  assert(LV.reportStatusMessage('incomplete', 'refused').indexOf('refused') !== -1, 'refused incomplete names the refusal');
  assert(LV.reportStatusMessage('missing').indexOf('missing') !== -1, 'missing has a message');
  assert(LV.reportStatusMessage('unsafe').indexOf('safely') !== -1, 'unsafe has a message');
}

// --- DOM inertness: a hostile title/reason renders as inert text, no element injected ---
{
  const HOSTILE = '<img src=x onerror=alert(1)><script>steal()</script>"&\'';
  const row = LV.buildRunRow(deps, entry({ title: HOSTILE, reportStatus: '<b>x</b>' }));
  const els = row.walk([]);
  const injected = els.filter((e) => e.tagName === 'IMG' || e.tagName === 'SCRIPT' || e.tagName === 'B');
  assert(injected.length === 0, 'a hostile title/report status injects NO element (inert text only)');
  assert(row.textContent.indexOf('<img') !== -1, 'the hostile title survives verbatim as text (proves it was not parsed away)');
  const meta = LV.buildMetaPanel(deps, entry({ title: HOSTILE, displayRunLabel: '../../evil', outcome: '<x>' }));
  const mEls = meta.walk([]);
  assert(mEls.filter((e) => e.tagName === 'IMG' || e.tagName === 'SCRIPT').length === 0, 'the meta panel injects NO element from hostile values');
  assert(meta.textContent.indexOf('../../evil') !== -1, 'a hostile run label renders as inert text');
  // No builder ever set a URL/handler attribute (agent-dom `el` would throw). Confirm none present.
  const allAttrs = els.concat(mEls).flatMap((e) => Object.keys(e.attributes));
  assert(!allAttrs.some((a) => /^on/i.test(a) || a === 'href' || a === 'src'), 'no event-handler/URL attribute is ever set');
}

// --- meta-test: the stub really would flag innerHTML use (guards the inertness claim) ---
{
  let threw = false;
  try { const e = new StubEl(doc, 'div'); e.innerHTML = '<img>'; } catch { threw = true; }
  assert(threw, 'the DOM stub throws if innerHTML is ever used (so the inertness tests are meaningful)');
}

process.stdout.write(`\nlibrary-view: ${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
