'use strict';
// Run: node app/followup-ipc.test.js
// Plain Node.js — exercises the ACTUAL V3b main-side follow-up boundary (followup-ipc.js): the
// shared sender gate, the strict discriminated request shape (library-handle / pane-ID identities
// only), authoritative question normalization + bounds, the PS-backed report re-read, the 200k
// provider-context cap, the global single-flight cost gate, the child error-code allowlist, and
// log hygiene. Includes an integration block against the REAL library-ipc handle table proving a
// handle from a superseded List produces ZERO provider calls. Every provider-adjacent dependency
// is an injected counter stub — nothing here touches disk, spawns, or networks.

const { createFollowupIpc, normalizeFollowupQuestion, validateFollowupRequest,
  FOLLOWUP_QUESTION_MAX, FOLLOWUP_REPORT_CONTEXT_MAX, FOLLOWUP_MODEL } = require('./followup-ipc');
const { createLibraryIpc } = require('./library-ipc');

let passed = 0, failed = 0;
function assert(cond, label) {
  if (cond) { process.stdout.write(`  ✓ ${label}\n`); passed++; }
  else { process.stderr.write(`  ✗ FAIL: ${label}\n`); failed++; }
}

const ENTRY = 'file:///D:/Workspace/agent-command-center/app/renderer/index.html';
function makeWindow() {
  const mainFrame = { url: ENTRY };
  const wc = { mainFrame };
  return { win: { isDestroyed() { return false; }, webContents: wc }, wc, mainFrame };
}
const evt = (w) => ({ sender: w.wc, senderFrame: w.mainFrame });
const untrustedEvt = () => ({ sender: { mainFrame: {} }, senderFrame: {} });

const GOOD_READ = { ok: true, status: 'available', outcome: 'completed', reportStatus: 'available', chars: 20, text: 'SECRET-REPORT run facts' };
const GOOD_CHILD = { ok: true, answer: 'SECRET-ANSWER text', attempts: 1, finishReason: 'STOP', usage: { promptTokens: 10, outputTokens: 5, totalTokens: 15 } };

function makeIpc(overrides) {
  const o = overrides || {};
  const w = makeWindow();
  const counters = { reads: [], children: [], logs: [] };
  const ipc = createFollowupIpc({
    entryUrl: ENTRY,
    getTrustedWindow: () => w.win,
    resolveLibraryHandle: o.resolveLibraryHandle || ((h) => (h === 'lib_good' ? 'run-SECRET-123' : undefined)),
    getRunIdForPane: o.getRunIdForPane || ((p) => (p === 'pty7' ? 'run-SECRET-777' : undefined)),
    readReport: o.readReport || (async (runId) => { counters.reads.push(runId); return GOOD_READ; }),
    runFollowupChild: o.runFollowupChild || (async (payload) => { counters.children.push(payload); return GOOD_CHILD; }),
    hasGeminiKey: o.hasGeminiKey || (() => true),
    logUsage: (l) => counters.logs.push(l),
    logRefusal: (l) => counters.logs.push(l),
  });
  return { ipc, counters, ev: evt(w) };
}
const LIB_REQ = (q) => ({ source: 'library', handle: 'lib_good', question: q === undefined ? 'What facts?' : q });
const PANE_REQ = (q) => ({ source: 'pane', paneId: 'pty7', question: q === undefined ? 'What facts?' : q });

// ── pure: question normalization ─────────────────────────────────────────────────────────────
{
  assert(normalizeFollowupQuestion('  hello   world  ').question === 'hello world', 'trims and collapses repeated whitespace');
  assert(normalizeFollowupQuestion('a\r\nb\tc').question === 'a b c', 'CR/LF/tab runs normalize to single spaces');
  assert(normalizeFollowupQuestion('Qué pasa — ¿cuál es el precio?').question === 'Qué pasa — ¿cuál es el precio?',
    'normal Unicode text and punctuation are preserved');
  assert(normalizeFollowupQuestion('').error === 'question-empty', 'empty rejected');
  assert(normalizeFollowupQuestion('   \r\n\t ').error === 'question-empty', 'whitespace-only rejected after normalization');
  assert(normalizeFollowupQuestion(42).error === 'question-invalid', 'non-string rejected');
  assert(normalizeFollowupQuestion('x'.repeat(FOLLOWUP_QUESTION_MAX)).ok === true, 'exactly 2,000 units accepted');
  assert(normalizeFollowupQuestion('x'.repeat(FOLLOWUP_QUESTION_MAX + 1)).error === 'question-too-long', '2,001 units rejected');
  assert(normalizeFollowupQuestion('a\x01b').error === 'question-control-chars', 'a remaining C0 control char rejected');
  assert(normalizeFollowupQuestion('a\x7fb').error === 'question-control-chars', 'DEL rejected');
}

// ── pure: discriminated request shape ────────────────────────────────────────────────────────
{
  assert(validateFollowupRequest(LIB_REQ()).source === 'library', 'a clean library request validates');
  assert(validateFollowupRequest(PANE_REQ()).source === 'pane', 'a clean pane request validates');
  const bad = [
    null, 'x', [], {},
    { source: 'library', question: 'q' },                                     // missing handle
    { source: 'pane', question: 'q' },                                        // missing paneId
    { source: 'library', handle: 'h', paneId: 'p', question: 'q' },           // mixed identities
    { source: 'library', handle: 'h', question: 'q', runId: 'r' },            // smuggled runId
    { source: 'library', handle: 'h', question: 'q', path: 'C:\\x' },         // smuggled path
    { source: 'library', handle: 'h', question: 'q', model: 'pro' },          // smuggled model
    { source: 'pane', paneId: 'p', question: 'q', reportText: 'inline' },     // smuggled report text
    { source: 'library', handle: 42, question: 'q' },                         // wrong type
    { source: 'pane', paneId: '', question: 'q' },                            // empty paneId
    { source: 'video', url: 'u', question: 'q' },                             // unknown source
  ];
  assert(bad.every((r) => validateFollowupRequest(r).error === 'bad-request'),
    'mixed / missing / extra / wrong-typed / unknown-source requests are ALL bad-request');
}

(async () => {
  // ── sender gate ────────────────────────────────────────────────────────────────────────────
  {
    const { ipc, counters } = makeIpc();
    const r = await ipc.handleAsk(untrustedEvt(), LIB_REQ());
    assert(r.ok === false && r.error === 'untrusted-sender', 'an untrusted sender is refused');
    assert(counters.reads.length === 0 && counters.children.length === 0, '(with zero reads and zero provider calls)');
  }

  // ── identity: library handle ───────────────────────────────────────────────────────────────
  {
    const { ipc, counters, ev } = makeIpc();
    const r = await ipc.handleAsk(ev, LIB_REQ());
    assert(r.ok === true && r.answer === 'SECRET-ANSWER text', 'a valid current handle resolves and answers');
    assert(counters.reads.length === 1 && counters.reads[0] === 'run-SECRET-123',
      'the report was RE-READ through the injected PS path with the main-resolved run ID');
    assert(counters.children.length === 1 && counters.children[0].report === GOOD_READ.text,
      'the child received the re-read text (never renderer-held text — the request cannot even carry it)');
    assert(r.model === FOLLOWUP_MODEL && r.attempts === 1 && r.usage.totalTokens === 15, 'the result carries fixed model + bounded usage');
    assert(Object.keys(r).sort().join(',') === 'answer,attempts,model,ok,usage', 'the success payload has exactly the bounded fields');
  }
  {
    const { ipc, counters, ev } = makeIpc();
    const r = await ipc.handleAsk(ev, { source: 'library', handle: 'lib_unknown', question: 'q?' });
    assert(r.ok === false && r.error === 'unknown-handle', 'an unknown handle is refused');
    assert(counters.reads.length === 0 && counters.children.length === 0, 'with zero reads and ZERO provider calls');
  }

  // ── identity: pane ─────────────────────────────────────────────────────────────────────────
  {
    const { ipc, counters, ev } = makeIpc();
    const r = await ipc.handleAsk(ev, PANE_REQ());
    assert(r.ok === true, 'a mapped pane answers');
    assert(counters.reads[0] === 'run-SECRET-777', 'the pane resolved ONLY through the injected registry');
  }
  {
    const { ipc, counters, ev } = makeIpc();
    const r = await ipc.handleAsk(ev, { source: 'pane', paneId: 'pty-closed', question: 'q?' });
    assert(r.ok === false && r.error === 'no-run-for-pane' && counters.children.length === 0,
      'a missing/closed pane refuses BEFORE provider invocation');
  }

  // ── key gate ───────────────────────────────────────────────────────────────────────────────
  {
    const { ipc, counters, ev } = makeIpc({ hasGeminiKey: () => false });
    const r = await ipc.handleAsk(ev, LIB_REQ());
    assert(r.ok === false && r.error === 'gemini-key-missing', 'a missing key refuses');
    assert(counters.reads.length === 0 && counters.children.length === 0, 'before the read and before any child');
  }

  // ── report availability + provider-context bound ───────────────────────────────────────────
  {
    for (const read of [
      { ok: true, status: 'incomplete', text: null },
      { ok: true, status: 'not-persisted' },
      { ok: false, status: 'unsafe', reason: 'report-not-utf8' },
      null,
    ]) {
      const { ipc, counters, ev } = makeIpc({ readReport: async () => read });
      const r = await ipc.handleAsk(ev, LIB_REQ());
      assert(r.ok === false && r.error === 'report-unavailable' && counters.children.length === 0,
        `an unavailable report (${read ? read.status : 'null'}) refuses with zero provider calls`);
    }
    const throwing = makeIpc({ readReport: async () => { throw new Error('ps died'); } });
    const rt = await throwing.ipc.handleAsk(throwing.ev, LIB_REQ());
    assert(rt.ok === false && rt.error === 'report-unavailable' && throwing.counters.children.length === 0,
      'a throwing read fails closed with zero provider calls');
  }
  {
    const at = makeIpc({ readReport: async () => ({ ok: true, status: 'available', text: 'x'.repeat(FOLLOWUP_REPORT_CONTEXT_MAX) }) });
    const r1 = await at.ipc.handleAsk(at.ev, LIB_REQ());
    assert(r1.ok === true && at.counters.children.length === 1, 'a report at exactly 200,000 units is accepted');
    const over = makeIpc({ readReport: async () => ({ ok: true, status: 'available', text: 'x'.repeat(FOLLOWUP_REPORT_CONTEXT_MAX + 1) }) });
    const r2 = await over.ipc.handleAsk(over.ev, LIB_REQ());
    assert(r2.ok === false && r2.error === 'report-too-large-for-follow-up' && over.counters.children.length === 0,
      'a report over 200,000 units refuses BEFORE the child spawns (fail closed, never truncated)');
  }

  // ── question policy through the handler (main is authoritative) ────────────────────────────
  {
    const { ipc, counters, ev } = makeIpc();
    assert((await ipc.handleAsk(ev, LIB_REQ(''))).error === 'question-empty', 'empty question refused at the handler');
    assert((await ipc.handleAsk(ev, LIB_REQ('x'.repeat(2001)))).error === 'question-too-long', 'oversized question refused at the handler');
    assert((await ipc.handleAsk(ev, LIB_REQ('a\x02b'))).error === 'question-control-chars', 'control-char question refused at the handler');
    assert(counters.children.length === 0, 'none of those reached the child');
    await ipc.handleAsk(ev, LIB_REQ('  spaced\r\nout\tquestion  '));
    assert(counters.children[0].question === 'spaced out question', 'the child receives the NORMALIZED question');
  }

  // ── single-flight (global, across both identity types) ─────────────────────────────────────
  {
    let release;
    const gate = new Promise((res) => { release = res; });
    const { ipc, counters, ev } = makeIpc({
      runFollowupChild: async (p) => { counters.children.push(p); await gate; return GOOD_CHILD; },
    });
    const first = ipc.handleAsk(ev, LIB_REQ());
    await Promise.resolve();
    const second = await ipc.handleAsk(ev, PANE_REQ());
    assert(second.ok === false && second.error === 'follow-up-in-progress',
      'a second submission (even via the OTHER identity type) refuses follow-up-in-progress');
    assert(counters.children.length === 1, 'and is never queued — still exactly one provider call');
    release();
    const r1 = await first;
    assert(r1.ok === true, 'the first request completes normally');
    const third = await ipc.handleAsk(ev, LIB_REQ());
    assert(third.ok === true && counters.children.length === 3 - 1, 'the in-flight state cleared after success (a new request proceeds)');
  }
  {
    // in-flight clears after refusals, child failures, AND child throws
    const failing = makeIpc({ runFollowupChild: async () => ({ ok: false, error: 'child-timeout' }) });
    const f1 = await failing.ipc.handleAsk(failing.ev, LIB_REQ());
    assert(f1.error === 'child-timeout' && failing.ipc._inFlight() === false, 'in-flight clears after a child failure');
    const throwing = makeIpc({ runFollowupChild: async () => { throw new Error('runner bug'); } });
    const t1 = await throwing.ipc.handleAsk(throwing.ev, LIB_REQ());
    assert(t1.error === 'follow-up-failed' && throwing.ipc._inFlight() === false, 'a THROWING runner fails closed and clears in-flight');
    const refused = makeIpc({ resolveLibraryHandle: () => undefined });
    await refused.ipc.handleAsk(refused.ev, LIB_REQ());
    assert(refused.ipc._inFlight() === false, 'in-flight clears after an identity refusal');
  }

  // ── child error-code allowlist ─────────────────────────────────────────────────────────────
  {
    for (const [code, expected] of [
      ['provider-unavailable', 'provider-unavailable'],
      ['network-error', 'network-error'],
      ['empty-response', 'empty-response'],
      ['<img src=x>evil-nonconstant', 'follow-up-failed'],
      [undefined, 'follow-up-failed'],
    ]) {
      const { ipc, ev } = makeIpc({ runFollowupChild: async () => ({ ok: false, error: code }) });
      const r = await ipc.handleAsk(ev, LIB_REQ());
      assert(r.error === expected, `child error ${JSON.stringify(code)} surfaces as ${expected}`);
    }
    const junkOk = makeIpc({ runFollowupChild: async () => ({ ok: true, answer: 42 }) });
    const rj = await junkOk.ipc.handleAsk(junkOk.ev, LIB_REQ());
    assert(rj.ok === false && rj.error === 'follow-up-failed', 'an ok:true child result WITHOUT a string answer fails closed');
  }

  // ── log hygiene: bounded metadata only ─────────────────────────────────────────────────────
  {
    const { ipc, counters, ev } = makeIpc();
    await ipc.handleAsk(ev, LIB_REQ('SECRET-QUESTION about facts'));
    await ipc.handleAsk(ev, { source: 'library', handle: 'lib_unknown', question: 'SECRET-QUESTION again' });
    const all = counters.logs.join('\n');
    assert(all.indexOf('SECRET-QUESTION') === -1, 'logs never contain the question text');
    assert(all.indexOf('SECRET-REPORT') === -1, 'logs never contain the report text');
    assert(all.indexOf('SECRET-ANSWER') === -1, 'logs never contain the answer text');
    assert(all.indexOf('run-SECRET') === -1, 'logs never contain the run ID');
    assert(/questionChars=\d+ reportChars=\d+ attempts=\d+/.test(all), 'the usage line carries the bounded counts');
    assert(all.indexOf(`model=${FOLLOWUP_MODEL}`) !== -1, 'and the fixed model name');
    assert(all.indexOf('denied: unknown-handle') !== -1, 'refusals log the bounded constant only');
  }

  // ── INTEGRATION: the REAL library-ipc handle table (superseded-List invalidation) ──────────
  {
    const w = makeWindow();
    const libraryIpc = createLibraryIpc({
      entryUrl: ENTRY,
      getTrustedWindow: () => w.win,
      runLibraryAction: async (a) => (a.action === 'List'
        ? { ok: true, entries: [{ runId: 'run-int-1', title: 'T', dateKind: 'exact', reportStatus: 'available' }], invalid: [], total: 1 }
        : GOOD_READ),
      getRunIdForPane: () => undefined,
      logRefusal: () => { },
    });
    const children = [];
    const followupIpc = createFollowupIpc({
      entryUrl: ENTRY,
      getTrustedWindow: () => w.win,
      resolveLibraryHandle: (h) => libraryIpc.resolveHandle(h),   // EXACTLY the main.js wiring
      getRunIdForPane: () => undefined,
      readReport: async () => GOOD_READ,
      runFollowupChild: async (p) => { children.push(p); return GOOD_CHILD; },
      hasGeminiKey: () => true,
      logUsage: () => { }, logRefusal: () => { },
    });
    const ev1 = evt(w);
    const list1 = await libraryIpc.handleList(ev1);
    const handle = list1.entries[0].handle;
    const ok = await followupIpc.handleAsk(ev1, { source: 'library', handle, question: 'q?' });
    assert(ok.ok === true && children.length === 1, 'a handle from the CURRENT List submits one follow-up');
    await libraryIpc.handleList(ev1);   // refresh: the table is replaced wholesale
    const stale = await followupIpc.handleAsk(ev1, { source: 'library', handle, question: 'q?' });
    assert(stale.ok === false && stale.error === 'unknown-handle',
      'the SAME handle from the superseded List explicitly fails after refresh');
    assert(children.length === 1, 'and the superseded handle produced ZERO additional provider calls');
    assert(libraryIpc.resolveHandle(42) === undefined && libraryIpc.resolveHandle('lib_nope') === undefined,
      'resolveHandle refuses non-strings and unknown handles');
  }

  process.stdout.write(`\nfollowup-ipc: ${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
})();
