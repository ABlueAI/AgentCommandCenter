'use strict';
// Run: node app/renderer/agent-dom.test.js
// Plain Node.js — no framework, no jsdom (matches video-scout-args.test.js / pty-parser.test.js).
// Proves the agent-dom.js builders render git-derived values (branch names, worktree paths, pane
// labels) as INERT TEXT — an <img onerror>/<script>/quote/& payload can never become a live DOM
// element (AUDIT-REPORT.md finding #1).

const { el, buildTermPane, buildAgentRow, buildAgentCard } = require('./agent-dom');

let passed = 0, failed = 0;
function assert(cond, label) {
  if (cond) { process.stdout.write(`  ✓ ${label}\n`); passed++; }
  else { process.stderr.write(`  ✗ FAIL: ${label}\n`); failed++; }
}

// --- Minimal DOM stub -----------------------------------------------------------------------------
// Models the ONE security-relevant distinction: textContent stores a string and creates NO child
// nodes, while innerHTML PARSES markup into child element nodes. So if any builder ever regressed to
// putting an untrusted value through innerHTML, querySelectorAll('img, script') below would find the
// injected element and the test would fail. (The meta-test at the end proves the stub really parses.)
class StubText {
  constructor(t) { this.nodeType = 3; this.tagName = '#text'; this._text = t == null ? '' : String(t); }
  get textContent() { return this._text; }
}
class StubElement {
  constructor(doc, tag) {
    this.ownerDocument = doc; this.nodeType = 1; this.tagName = String(tag).toUpperCase();
    this.childNodes = []; this.attributes = {}; this._text = null; this._class = '';
  }
  get className() { return this._class; }
  set className(v) { this._class = String(v); this.attributes['class'] = String(v); }
  get classList() {
    const self = this;
    return {
      contains: (c) => self._class.split(/\s+/).filter(Boolean).includes(c),
    };
  }
  setAttribute(k, v) { this.attributes[k] = String(v); if (k === 'class') this._class = String(v); }
  getAttribute(k) { return Object.prototype.hasOwnProperty.call(this.attributes, k) ? this.attributes[k] : null; }
  set title(v) { this.setAttribute('title', v); }
  get title() { return this.getAttribute('title') || ''; }
  set textContent(v) { this._text = v == null ? '' : String(v); this.childNodes = []; }
  get textContent() {
    if (this._text !== null) return this._text;
    return this.childNodes.map((c) => c.textContent).join('');
  }
  set innerHTML(v) { this._text = null; this.childNodes = parseHtml(this.ownerDocument, String(v)); }
  appendChild(node) { this._text = null; this.childNodes.push(node); return node; }
  _walk(acc) {
    for (const c of this.childNodes) { if (c instanceof StubElement) { acc.push(c); c._walk(acc); } }
    return acc;
  }
  _matches(sel) {
    sel = sel.trim();
    if (sel.startsWith('.')) return this.classList.contains(sel.slice(1));
    if (sel.startsWith('[') && sel.endsWith(']')) return Object.prototype.hasOwnProperty.call(this.attributes, sel.slice(1, -1));
    return this.tagName === sel.toUpperCase();
  }
  querySelectorAll(selector) {
    const sels = selector.split(',').map((s) => s.trim()).filter(Boolean);
    return this._walk([]).filter((n) => sels.some((s) => n._matches(s)));
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
}
function parseHtml(doc, html) {
  // Naive but sufficient: every <tag ...> becomes a child element; run of non-'<' text becomes a
  // text node. Enough to surface an injected <img>/<script> if innerHTML is ever misused.
  const out = [];
  const re = /<([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>|([^<]+)/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    if (m[1]) out.push(new StubElement(doc, m[1]));
    else if (m[2]) out.push(new StubText(m[2]));
  }
  return out;
}
const doc = {
  createElement: (tag) => new StubElement(doc, tag),
  createTextNode: (t) => new StubText(t),
};

// Payloads a hostile git branch name / worktree path can carry (git ref names allow < > & " ').
const XSS = '<img src=x onerror=alert(1)><script>steal()</script>';
const QUOTES = `evil" onmouseover="alert(1)" x="`;
const AMP = 'a & b <b>c</b>';

function noLiveInjection(root, label) {
  assert(root.querySelectorAll('img, script').length === 0, `${label}: no <img>/<script> element created`);
}

// --- meta-test: prove the stub actually parses innerHTML (so the guard is real) -------------------
{
  const probe = doc.createElement('div');
  probe.innerHTML = XSS;
  assert(probe.querySelectorAll('img, script').length === 2,
    'stub parses innerHTML into elements (regression guard is genuine)');
}

// --- buildAgentRow ---------------------------------------------------------------------------------
{
  const row = buildAgentRow(doc, { colorClass: 'claude', name: XSS, path: QUOTES });
  noLiveInjection(row, 'agent row');
  assert(row.querySelector('.name').textContent === XSS, 'row name is the literal payload text');
  assert(row.querySelector('.name').getAttribute('title') === QUOTES, 'row title attr is the literal payload (not markup)');
  assert(!!row.querySelector('.dot') && !!row.querySelector('.x'), 'row structure preserved (.dot + .x present)');
}

// --- buildAgentCard --------------------------------------------------------------------------------
{
  const card = buildAgentCard(doc, { colorClass: 'claude', branchText: XSS, path: AMP });
  noLiveInjection(card, 'agent card');
  assert(card.querySelector('.title').textContent.includes(XSS), 'card branch text is the literal payload');
  assert(card.querySelector('.meta').textContent === AMP, 'card meta path is the literal payload');
  assert(card.querySelectorAll('[data-act]').length === 8, 'card keeps its 8 action buttons');
  assert(card.querySelectorAll('.row').length === 3, 'card keeps its 3 button rows');
  const acts = card.querySelectorAll('[data-act]').map((b) => b.getAttribute('data-act')).join(',');
  assert(acts === 'claude,codex,gemini,review,scout,code,term,rm', 'card data-act set + order unchanged');
}

// --- buildTermPane (role badge + cli badge) --------------------------------------------------------
{
  const pane = buildTermPane(doc, {
    badge: { kind: 'role', role: 'builder', glyph: '🔨', readOnly: false, label: 'Builder' },
    label: XSS, worktreeTitle: QUOTES,
  });
  noLiveInjection(pane, 'term pane (role)');
  assert(pane.querySelector('.name').textContent === XSS, 'pane label is the literal payload');
  assert(pane.querySelector('.name').getAttribute('title') === QUOTES, 'pane title attr is the literal payload');
  assert(!!pane.querySelector('.term-body') && !!pane.querySelector('.chat-body'), 'pane keeps term-body + chat-body');
  assert(!!pane.querySelector('.spk') && !!pane.querySelector('.x'), 'pane keeps spk + x buttons');
  // V1a: Copy Output + Maximize are built by the SAME safe builder for every pane type.
  assert(!!pane.querySelector('.copy-out') && pane.querySelector('.copy-out').tagName === 'BUTTON',
    'pane has the Copy Output control (safe builder)');
  assert(/Copy Output/.test(pane.querySelector('.copy-out').getAttribute('title') || ''),
    'Copy Output control explains itself in its tooltip');
  assert(!!pane.querySelector('.max') && pane.querySelector('.max').tagName === 'BUTTON',
    'pane has the Maximize control (safe builder)');
  assert(/Esc restores/.test(pane.querySelector('.max').getAttribute('title') || ''),
    'Maximize tooltip documents the Esc restore');
  const rb = pane.querySelector('.role-badge');
  assert(!!rb && rb.getAttribute('data-role') === 'builder', 'role badge has data-role for CSS tint');
  assert(rb.textContent === '🔨 Builder', 'role badge text = glyph + label (no lock when not read-only)');
}
{
  const ro = buildTermPane(doc, {
    badge: { kind: 'role', role: 'reviewer', glyph: '🔎', readOnly: true, label: 'Reviewer' },
    label: 'x', worktreeTitle: '',
  });
  assert(ro.querySelector('.role-badge').textContent === '🔎 🔒 Reviewer', 'read-only role badge includes the lock glyph');
}
{
  const cli = buildTermPane(doc, { badge: { kind: 'cli', cli: 'gemini' }, label: 'x', worktreeTitle: '' });
  assert(!cli.querySelector('.role-badge') && cli.querySelector('.dot').getAttribute('class') === 'dot gemini',
    'cli badge renders a plain colored dot, no role badge');
  assert(!!cli.querySelector('.copy-out') && !!cli.querySelector('.max'),
    'cli-badged panes get the same Copy Output + Maximize controls (no pane type is special-cased)');
}

// --- L1: el() refuses script/URL/style attribute names (defense in depth) -------------------------
function throws(fn, label) {
  let threw = false;
  try { fn(); } catch { threw = true; }
  assert(threw, label);
}
throws(() => el(doc, 'a', { attrs: { onclick: 'steal()' } }), 'el() throws on onclick');
throws(() => el(doc, 'img', { attrs: { onerror: 'x' } }), 'el() throws on onerror');
throws(() => el(doc, 'a', { attrs: { href: 'javascript:alert(1)' } }), 'el() throws on href');
throws(() => el(doc, 'img', { attrs: { src: 'x' } }), 'el() throws on src');
throws(() => el(doc, 'iframe', { attrs: { srcdoc: '<x>' } }), 'el() throws on srcdoc');
throws(() => el(doc, 'div', { attrs: { style: 'x' } }), 'el() throws on style');
throws(() => el(doc, 'button', { attrs: { formaction: 'x' } }), 'el() throws on formaction');
throws(() => el(doc, 'div', { attrs: { 'xlink:href': 'x' } }), 'el() throws on xlink:href');
throws(() => el(doc, 'div', { attrs: { ONMOUSEOVER: 'x' } }), 'el() throws on ON* case-insensitively');
{
  // and does NOT throw on the safe attribute names the builders actually use
  let ok = true;
  try { el(doc, 'span', { title: 't', attrs: { 'data-role': 'builder', 'data-act': 'rm', disabled: '' } }); }
  catch { ok = false; }
  assert(ok, 'el() allows title / data-* / disabled');
}

// --- M1: non-removable rows/cards disable Remove with a CLI-recovery tooltip -----------------------
{
  const row = buildAgentRow(doc, { colorClass: 'claude', name: 'x', path: 'p', removable: false });
  assert(row.querySelector('.x').getAttribute('disabled') === '', 'non-removable row: Remove button is disabled');
  assert(/git worktree remove/.test(row.querySelector('.x').getAttribute('title') || ''), 'disabled Remove tooltip points at the CLI recovery');
  const rowOk = buildAgentRow(doc, { colorClass: 'claude', name: 'x', path: 'p', removable: true });
  assert(rowOk.querySelector('.x').getAttribute('disabled') === null, 'removable row: Remove button is enabled');
  assert(rowOk.querySelector('.x').getAttribute('title') === 'Remove worktree', 'removable row keeps the normal tooltip');
}
{
  const card = buildAgentCard(doc, { colorClass: 'claude', branchText: 'b', path: 'p', removable: false });
  const rm = card.querySelectorAll('[data-act]').filter((b) => b.getAttribute('data-act') === 'rm')[0];
  assert(!!rm && rm.getAttribute('disabled') === '', 'non-removable card: rm button is disabled');
  assert(/git worktree remove/.test(rm.getAttribute('title') || ''), 'disabled card rm has the CLI-recovery tooltip');
  assert(card.querySelectorAll('[data-act]').length === 8, 'non-removable card still enumerates 8 data-act buttons');
  const cardOk = buildAgentCard(doc, { colorClass: 'claude', branchText: 'b', path: 'p', removable: true });
  const rmOk = cardOk.querySelectorAll('[data-act]').filter((b) => b.getAttribute('data-act') === 'rm')[0];
  assert(rmOk.getAttribute('disabled') === null, 'removable card: rm button is enabled');
}

process.stdout.write(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
