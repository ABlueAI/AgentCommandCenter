'use strict';
// Safe DOM builders for the sidebar agent row, the agent grid card, and the terminal-pane header.
// These render values that originate from git — branch names (wt.branch) and worktree paths
// (wt.path) — plus a pane label derived from them. git ref names may legally contain < > & " '
// (git check-ref-format permits them), so interpolating any of these into an innerHTML string is
// an XSS sink (AUDIT-REPORT.md finding #1). The renderer exposes cc.ptyStart + cc.ptyWrite, so a
// renderer XSS escalates to local command execution — this is not merely a display bug.
//
// Every value here is placed with textContent / setAttribute / createTextNode and NEVER concatenated
// into innerHTML, so an untrusted value can only ever become inert text. el() additionally REFUSES
// (throws) event-handler / URL / style / xlink attribute NAMES, so even a future caller cannot
// smuggle an active attribute (onclick=…, href="javascript:…") past that textContent-only contract.
// Dual browser-<script> / CommonJS module (matches pty-parser.js and video-range-ui.js) so the
// escaping is unit-tested in plain node against a small DOM stub (agent-dom.test.js) — no jsdom dep.

// Attribute names that can execute script or load/booby-trap a resource — an event handler (on*),
// a URL-bearing attribute, an inline style, or an SVG xlink. el() throws rather than set any of
// these: the builders here only ever need class / title / data-* / disabled, and permitting a URL
// or handler attribute would let a future edit smuggle an active value past the textContent-only
// safety contract this module advertises. Defense in depth for AUDIT-REPORT.md finding #1 (L1).
const UNSAFE_ATTRS = new Set(['href', 'src', 'srcdoc', 'style', 'formaction', 'xlink:href']);
function assertSafeAttr(name) {
  const n = String(name).toLowerCase();
  if (/^on/i.test(n) || UNSAFE_ATTRS.has(n)) {
    throw new Error(`agent-dom: refusing to set unsafe attribute "${name}" (event-handler, URL, style, and xlink attributes are not allowed here).`);
  }
}

// Recovery hint shown on a Remove control that had to be disabled because the worktree folder isn't
// named "<repo>-<task>", so no safe task name can be derived for it (finding M1). Constant text.
const DISABLED_REMOVE_TIP =
  "This worktree's folder isn't named <repo>-<task>, so the app can't derive a safe name to remove it. " +
  'Remove it from a terminal in the repo: git worktree remove <path>.';

// Create an element and set only known-safe primitives on it. `text` goes through textContent (never
// parsed as HTML); `title` and every `attrs` name are checked by assertSafeAttr before setAttribute.
// `className` is a fixed string built from internal constants at the call sites (never git/user data).
function el(doc, tag, opts) {
  opts = opts || {};
  const node = doc.createElement(tag);
  if (opts.className) node.className = opts.className;
  if (opts.text != null) node.textContent = String(opts.text);
  if (opts.title != null) { assertSafeAttr('title'); node.setAttribute('title', String(opts.title)); }
  if (opts.attrs) {
    for (const k of Object.keys(opts.attrs)) { assertSafeAttr(k); node.setAttribute(k, String(opts.attrs[k])); }
  }
  return node;
}

// Terminal-pane header badge:
//   role -> <span class="role-badge" data-role="R">GLYPH[ 🔒] LABEL</span>
//   cli  -> <span class="dot CLI"></span>
// role/cli/glyph/label are internal constants (ROLES table), but they are still set via DOM APIs
// here rather than string-built, so this stays a single, uniformly-safe construction path.
function buildBadge(doc, badge) {
  if (badge && badge.kind === 'role') {
    const lock = badge.readOnly ? ' 🔒' : '';
    return el(doc, 'span', {
      className: 'role-badge',
      attrs: { 'data-role': badge.role },
      text: `${badge.glyph}${lock} ${badge.label}`,
    });
  }
  return el(doc, 'span', { className: `dot ${(badge && badge.cli) || 'codex'}` });
}

// <div class="term-pane">
//   <div class="term-head">BADGE<span class="name" title=WORKTREE>LABEL</span>
//     <button class="copy-out">⧉</button><button class="max">⛶</button>
//     <button class="spk">🔊</button><button class="x">✕</button></div>
//   <div class="term-body"></div><div class="chat-body"></div></div>
// Structure/classes are a strict superset of the previous markup so downstream
// pane.querySelector('.term-body' | '.spk' | '.x' | '.chat-body') keep working and the
// flex layout is unchanged. copy-out / max (V1a) are built HERE, on the one safe
// construction path every pane type shares — including Video Scout.
function buildTermPane(doc, opts) {
  const pane = el(doc, 'div', { className: 'term-pane' });
  const head = el(doc, 'div', { className: 'term-head' });
  head.appendChild(buildBadge(doc, opts.badge));
  head.appendChild(el(doc, 'span', { className: 'name', text: opts.label, title: opts.worktreeTitle || '' }));
  head.appendChild(el(doc, 'button', { className: 'copy-out', text: '⧉', title: 'Copy Output (your selection, otherwise the whole scrollback)' }));
  head.appendChild(el(doc, 'button', { className: 'max', text: '⛶', title: 'Maximize pane (Esc restores the grid)' }));
  head.appendChild(el(doc, 'button', { className: 'spk', text: '🔊', title: 'Speak selection (Kokoro TTS)' }));
  head.appendChild(el(doc, 'button', { className: 'x', text: '✕', title: 'Close' }));
  pane.appendChild(head);
  pane.appendChild(el(doc, 'div', { className: 'term-body' }));
  pane.appendChild(el(doc, 'div', { className: 'chat-body' }));
  return pane;
}

// <div class="agent-row"><span class="dot COLOR"></span>
//   <span class="name" title=PATH>NAME</span><button class="x" title="Remove worktree">✕</button></div>
// NAME (wt.branch||task) and PATH (wt.path) are the git-derived, untrusted values.
function buildAgentRow(doc, opts) {
  const row = el(doc, 'div', { className: 'agent-row' });
  row.appendChild(el(doc, 'span', { className: `dot ${opts.colorClass}` }));
  row.appendChild(el(doc, 'span', { className: 'name', text: opts.name, title: opts.path }));
  // removable === false => folder isn't <repo>-<task>, so there is no app-derivable task name to send
  // to remove-agent (finding M1). Disable the control with a CLI-recovery tooltip instead of wiring a
  // name the main process would (correctly) refuse anyway.
  const removable = opts.removable !== false;
  row.appendChild(el(doc, 'button', {
    className: 'x', text: '✕',
    title: removable ? 'Remove worktree' : DISABLED_REMOVE_TIP,
    attrs: removable ? undefined : { disabled: '' },
  }));
  return row;
}

// The agent grid card. Its static action buttons are built here too so the whole node is one safe
// construction; the caller wires the [data-act] click handlers exactly as before. The untrusted
// values are branchText (wt.branch||task, in the title line as a bare text node — matching the old
// markup where it sat directly inside .title next to the dot) and path (wt.path, in .meta).
function buildAgentCard(doc, opts) {
  const card = el(doc, 'div', { className: 'card' });

  const title = el(doc, 'div', { className: 'title' });
  title.appendChild(el(doc, 'span', { className: `dot ${opts.colorClass}` }));
  title.appendChild(doc.createTextNode(opts.branchText == null ? '' : String(opts.branchText)));
  card.appendChild(title);

  card.appendChild(el(doc, 'div', { className: 'meta', text: opts.path }));

  const mkBtn = (cls, act, text, tip, attrs) =>
    el(doc, 'button', { className: cls, text, title: tip, attrs: Object.assign({ 'data-act': act }, attrs || {}) });

  const row1 = el(doc, 'div', { className: 'row' });
  row1.appendChild(mkBtn('ghost', 'claude', 'Claude'));
  row1.appendChild(mkBtn('ghost', 'codex', 'Codex'));
  row1.appendChild(mkBtn('ghost', 'gemini', 'Gemini'));

  const row2 = el(doc, 'div', { className: 'row' });
  row2.appendChild(mkBtn('ghost', 'review', '🔎 Review', 'Read-only Opus review of this branch'));
  row2.appendChild(mkBtn('ghost', 'scout', '🧭 Scout', 'Read-only codebase exploration'));

  // rm is disabled (with recovery tooltip) when the worktree name isn't app-derivable (finding M1),
  // but keeps data-act="rm" so the caller's [data-act] enumeration still sees all 8 buttons.
  const removable = opts.removable !== false;
  const row3 = el(doc, 'div', { className: 'row' });
  row3.appendChild(mkBtn('action', 'code', 'VSCode'));
  row3.appendChild(mkBtn('action', 'term', 'Terminal'));
  row3.appendChild(removable
    ? mkBtn('ghost', 'rm', 'Remove')
    : mkBtn('ghost', 'rm', 'Remove', DISABLED_REMOVE_TIP, { disabled: '' }));

  card.appendChild(row1);
  card.appendChild(row2);
  card.appendChild(row3);
  return card;
}

const api = { el, buildBadge, buildTermPane, buildAgentRow, buildAgentCard };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
else window.agentDom = api;
