'use strict';
// Run: node app/renderer/report-followup.test.js
// Plain Node.js — exercises the ACTUAL V3b renderer follow-up controller (report-followup.js)
// with the REAL agent-dom `el` builder plus a DOM stub whose innerHTML throws, so the "answers
// render as inert text" claim is tested against production code. Covers: explicit-submission-only
// (mount/selection/open/refresh submit NOTHING), the exact request shapes, enable/disable rules,
// busy-state locking, the renderer-local epoch's stale-response suppression, clear-on-change, the
// error rendering, and the Open Report awaited-initial-scan ordering algorithm app.js runs
// (openPaneReportOrdered) — including the late-refresh-cannot-clear decision.

const RF = require('./report-followup');
const { el } = require('./agent-dom');

let passed = 0, failed = 0;
function assert(cond, label) {
  if (cond) { process.stdout.write(`  ✓ ${label}\n`); passed++; }
  else { process.stderr.write(`  ✗ FAIL: ${label}\n`); failed++; }
}

// DOM stub: textContent-only; innerHTML THROWS (guards inertness); supports the property handlers
// (onclick/oninput), value/disabled, and classList add/remove/contains the controller uses.
function parseHtml() { throw new Error('innerHTML parsing must never be triggered by report-followup'); }
class StubEl {
  constructor(doc, tag) {
    this.ownerDocument = doc; this.nodeType = 1; this.tagName = String(tag).toUpperCase();
    this.childNodes = []; this.attributes = {}; this._text = null; this._class = '';
    this.value = ''; this.disabled = false; this.onclick = null; this.oninput = null;
  }
  get className() { return this._class; } set className(v) { this._class = String(v); this.attributes['class'] = String(v); }
  get classList() {
    const s = this;
    return {
      add: (c) => { if (!s.classList.contains(c)) s._class = (s._class + ' ' + c).trim(); },
      remove: (c) => { s._class = s._class.split(/\s+/).filter((x) => x && x !== c).join(' '); },
      contains: (c) => s._class.split(/\s+/).includes(c),
    };
  }
  setAttribute(k, v) { this.attributes[k] = String(v); if (k === 'class') this._class = String(v); }
  set title(v) { this.setAttribute('title', v); } get title() { return this.attributes['title'] || ''; }
  set textContent(v) { this._text = v == null ? '' : String(v); this.childNodes = []; }
  get textContent() { return this._text !== null ? this._text : this.childNodes.map((c) => c.textContent).join(''); }
  set innerHTML(v) { this.childNodes = parseHtml(); }
  appendChild(n) { this._text = null; this.childNodes.push(n); return n; }
  walk(acc) { for (const c of this.childNodes) { if (c instanceof StubEl) { acc.push(c); c.walk(acc); } } return acc; }
}
class StubText { constructor(t) { this.nodeType = 3; this.tagName = '#text'; this._text = t == null ? '' : String(t); } get textContent() { return this._text; } }
const doc = { createElement: (t) => new StubEl(doc, t), createTextNode: (t) => new StubText(t) };

// Deferred submit stub: records requests, resolves when told to.
function makeCtl(opts) {
  const calls = [];
  const logs = [];
  let resolver = null;
  const ctl = RF.createReportFollowup({
    el, doc,
    submit: (req) => { calls.push(req); return new Promise((res) => { resolver = res; }); },
    log: (l) => logs.push(String(l)),
    ...(opts || {}),
  });
  const host = new StubEl(doc, 'div');
  const n = ctl.mount(host);
  return { ctl, calls, logs, host, n, resolve: (v) => resolver(v) };
}
const clickAsk = (n) => n.btn.onclick({ preventDefault() { } });

(async () => {
  // ── mount + visibility/enable rules; nothing auto-submits ──────────────────────────────────
  {
    const { ctl, calls, n } = makeCtl();
    assert(n.wrap.classList.contains('hidden'), 'the section mounts hidden (no report yet)');
    assert(n.btn.disabled === true, 'Ask starts disabled');
    ctl.noteSelection(); ctl.noteOpenReportStart(); ctl.noteRefreshStart(); ctl.noteCleared();
    ctl.setSource({ kind: 'library', handle: 'lib_a' }, true);
    assert(calls.length === 0, 'mount + selection + open + refresh + clear + setSource submit NOTHING (submission is explicit only)');
    assert(!n.wrap.classList.contains('hidden'), 'the section shows once an available report + source exist');
    assert(n.btn.disabled === true, 'Ask stays disabled with an empty question');
    n.question.value = 'why?';
    n.question.oninput();
    assert(n.btn.disabled === false, 'Ask enables with a question + available report');
    assert(n.counter.textContent === '4 / 2,000', 'the character counter tracks the question length');
    ctl.setSource(null, false);
    assert(n.wrap.classList.contains('hidden'), 'controls hide again when no readable report is shown');
  }

  // ── metadata-only status shape for unavailable reports ─────────────────────────────────────
  {
    const { ctl, n } = makeCtl();
    ctl.setSource({ kind: 'library', handle: 'lib_a' }, false);   // entry selected, report NOT available
    assert(n.wrap.classList.contains('hidden'), 'controls are hidden for a selection whose report is unavailable');
  }

  // ── submit: exact request shapes for both identity routes ──────────────────────────────────
  {
    const { ctl, calls, n, resolve } = makeCtl();
    ctl.setSource({ kind: 'library', handle: 'lib_h1' }, true);
    n.question.value = 'What price?';
    clickAsk(n);
    assert(calls.length === 1, 'clicking Ask submits exactly once');
    assert(JSON.stringify(calls[0]) === JSON.stringify({ source: 'library', handle: 'lib_h1', question: 'What price?' }),
      'the library request carries EXACTLY source/handle/question');
    resolve({ ok: true, answer: 'A1', attempts: 1, usage: {} });
    await Promise.resolve(); await Promise.resolve();
    ctl.noteSelection();
    ctl.setSource({ kind: 'pane', paneId: 'pty9' }, true);
    n.question.value = 'From the pane?';
    clickAsk(n);
    assert(JSON.stringify(calls[1]) === JSON.stringify({ source: 'pane', paneId: 'pty9', question: 'From the pane?' }),
      'the pane request carries EXACTLY source/paneId/question (usable with NO Library handle minted)');
    resolve({ ok: true, answer: 'A2', attempts: 1, usage: {} });
    await Promise.resolve(); await Promise.resolve();
    assert(n.answer.textContent === 'A2', 'the pane-sourced answer displays');
  }

  // ── busy lock: double submission is locally impossible while in flight ─────────────────────
  {
    const { ctl, calls, n, resolve } = makeCtl();
    ctl.setSource({ kind: 'library', handle: 'lib_h' }, true);
    n.question.value = 'q';
    clickAsk(n);
    assert(n.btn.disabled === true && n.question.disabled === true, 'Ask and the question box disable while running');
    assert(n.busyNote.textContent === 'Asking…', 'the in-progress state is visible');
    clickAsk(n); clickAsk(n);
    assert(calls.length === 1, 'further clicks while busy submit nothing');
    resolve({ ok: true, answer: 'DONE', attempts: 1, usage: { promptTokens: 1, outputTokens: 2, totalTokens: 3 } });
    await Promise.resolve(); await Promise.resolve();
    assert(n.answer.textContent === 'DONE' && n.busyNote.textContent === '', 'the answer displays and the busy state clears');
    assert(n.btn.disabled === false, 'Ask re-enables after completion');
  }

  // ── inert answer rendering ─────────────────────────────────────────────────────────────────
  {
    const { ctl, n, resolve } = makeCtl();
    ctl.setSource({ kind: 'library', handle: 'lib_h' }, true);
    n.question.value = 'q';
    clickAsk(n);
    const HOSTILE = '<img src=x onerror=alert(1)><script>steal()</script> **markdown**';
    resolve({ ok: true, answer: HOSTILE, attempts: 1, usage: {} });
    await Promise.resolve(); await Promise.resolve();
    assert(n.answer.textContent === HOSTILE, 'a hostile answer renders VERBATIM as inert text');
    assert(n.answer.childNodes.length === 0, 'no element was ever created from answer content (textContent only; innerHTML would throw)');
  }

  // ── epoch: stale responses are discarded, never displayed, never logged ────────────────────
  {
    const { ctl, calls, logs, n, resolve } = makeCtl();
    ctl.setSource({ kind: 'library', handle: 'lib_old' }, true);
    n.question.value = 'about the OLD report';
    clickAsk(n);
    assert(calls.length === 1, 'the submission went out');
    ctl.noteSelection();                                  // user changes reports while it runs
    ctl.setSource({ kind: 'library', handle: 'lib_new' }, true);
    resolve({ ok: true, answer: 'SECRET-STALE-ANSWER', attempts: 1, usage: {} });
    await Promise.resolve(); await Promise.resolve();
    assert(n.answer.textContent === '', 'a response that finishes after the report changed does NOT appear under the new report');
    assert(logs.join('\n').indexOf('SECRET-STALE-ANSWER') === -1, 'the discarded answer content is never logged');
    assert(logs.some((l) => l.indexOf('stale response discarded') !== -1), '(the discard itself is a visible metadata-only note)');
    assert(ctl._state().busy === false && n.question.disabled === false,
      'the busy lock still clears after a discarded response (Ask stays disabled only because the new question box is empty)');
  }

  // ── clear-on-change: question, answer, and errors reset ────────────────────────────────────
  {
    const { ctl, n, resolve } = makeCtl();
    ctl.setSource({ kind: 'library', handle: 'lib_h' }, true);
    n.question.value = 'q1';
    clickAsk(n);
    resolve({ ok: true, answer: 'OLD ANSWER', attempts: 1, usage: {} });
    await Promise.resolve(); await Promise.resolve();
    assert(n.answer.textContent === 'OLD ANSWER', 'baseline: an answer is showing');
    ctl.noteSelection();
    assert(n.question.value === '' && n.answer.textContent === '' && n.error.textContent === '',
      'changing reports clears the previous question, answer, and errors');
  }

  // ── visible errors ─────────────────────────────────────────────────────────────────────────
  {
    const { ctl, n, resolve } = makeCtl();
    ctl.setSource({ kind: 'library', handle: 'lib_h' }, true);
    n.question.value = 'q';
    clickAsk(n);
    resolve({ ok: false, error: 'follow-up-in-progress' });
    await Promise.resolve(); await Promise.resolve();
    assert(!n.error.classList.contains('hidden') && n.error.textContent.indexOf('already running') !== -1,
      'a refusal renders a visible human message');
  }
  {
    const { ctl, n } = makeCtl({ submit: () => Promise.reject(new Error('ipc broke')) });
    ctl.setSource({ kind: 'library', handle: 'lib_h' }, true);
    n.question.value = 'q';
    await ctl.submit();
    assert(n.error.textContent.indexOf('could not reach the main process') !== -1, 'a rejected IPC invoke shows the ipc-failed message');
  }
  {
    assert(RF.followupErrorMessage('report-too-large-for-follow-up').indexOf('200,000') !== -1, 'the oversize refusal names the limit');
    assert(RF.followupErrorMessage('weird-new-code').indexOf('weird-new-code') !== -1, 'an unknown bounded code is still surfaced, not swallowed');
  }

  // ── epoch decision used by app.js: a late refresh must not clear ───────────────────────────
  {
    const { ctl } = makeCtl();
    const refreshEpoch = ctl.noteRefreshStart();
    assert(ctl.isCurrent(refreshEpoch), 'a refresh with no newer action is current (its completion MAY clear the reader)');
    ctl.noteOpenReportStart();
    assert(!ctl.isCurrent(refreshEpoch), 'after Open Report starts, that refresh is LATE — app.js skips its reader clear');
  }

  // ── openPaneReportOrdered: the production Open Report algorithm ────────────────────────────
  {
    // 1) Initial scan is AWAITED before the pane report displays.
    const { ctl } = makeCtl();
    const order = [];
    let loaded = false;
    const res = await RF.openPaneReportOrdered(ctl, {
      isLoaded: () => loaded,
      refresh: async () => { order.push('refresh-start'); ctl.noteRefreshStart(); loaded = true; order.push('refresh-done(clears reader)'); },
      beforeRead: () => order.push('before-read'),
      readPane: async () => { order.push('read'); return { ok: true, status: 'available', text: 'PANE REPORT' }; },
      display: () => order.push('display'),
      displayError: () => order.push('display-error'),
    }, 'pty4');
    assert(res === 'done', 'the ordered open completes');
    assert(order.join(' -> ') === 'refresh-start -> refresh-done(clears reader) -> before-read -> read -> display',
      'the initial Library refresh completes strictly BEFORE the pane report is read and displayed');
    assert(JSON.stringify(ctl._state().source) === JSON.stringify({ kind: 'pane', paneId: 'pty4' }),
      'the follow-up source recorded after the read is the PANE identity');
  }
  {
    // 2) A newer action during the awaited scan supersedes the open (no overwrite).
    const { ctl } = makeCtl();
    let displayed = 0;
    const res = await RF.openPaneReportOrdered(ctl, {
      isLoaded: () => false,
      refresh: async () => { ctl.noteRefreshStart(); ctl.noteSelection(); /* user clicked a run mid-scan */ },
      readPane: async () => ({ ok: true, status: 'available', text: 'T' }),
      display: () => { displayed++; },
    }, 'pty4');
    assert(res === 'superseded' && displayed === 0, 'an action that takes the reader during the scan supersedes the open (nothing overwritten)');
  }
  {
    // 3) A read that resolves after a newer action is discarded.
    const { ctl } = makeCtl();
    let displayed = 0;
    let releaseRead;
    const readGate = new Promise((r) => { releaseRead = r; });
    const p = RF.openPaneReportOrdered(ctl, {
      isLoaded: () => true,
      readPane: async () => { await readGate; return { ok: true, status: 'available', text: 'T' }; },
      display: () => { displayed++; },
    }, 'pty4');
    ctl.noteSelection();          // newer action while the pane read runs
    releaseRead();
    const res = await p;
    assert(res === 'superseded' && displayed === 0, 'a pane read finishing after a newer action does not display');
  }
  {
    // 4) An unavailable pane read records NO follow-up source.
    const { ctl } = makeCtl();
    await RF.openPaneReportOrdered(ctl, {
      isLoaded: () => true,
      readPane: async () => ({ ok: true, status: 'incomplete', text: null }),
      display: () => { },
    }, 'pty4');
    const st = ctl._state();
    assert(st.source === null && st.reportAvailable === false, 'an unavailable pane report leaves the follow-up disabled');
  }
  {
    // 5) A throwing read reports failure visibly (when still current).
    const { ctl } = makeCtl();
    let errShown = 0;
    const res = await RF.openPaneReportOrdered(ctl, {
      isLoaded: () => true,
      readPane: async () => { throw new Error('ipc down'); },
      display: () => { },
      displayError: () => { errShown++; },
    }, 'pty4');
    assert(res === 'failed' && errShown === 1, 'a failing pane read surfaces the visible error path');
  }

  process.stdout.write(`\nreport-followup: ${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
})();
