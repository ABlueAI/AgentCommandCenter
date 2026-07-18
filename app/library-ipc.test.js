'use strict';
// Run: node app/library-ipc.test.js
// Plain Node.js — exercises the ACTUAL V5b2 main-side library boundary (library-ipc.js): the shared
// sender gate, the OPAQUE handle table (issuance + wholesale invalidation on refresh), the path-free
// renderer projection, the Read passthrough, and the pane->report resolution through the injected
// V5b1 registry. The PowerShell subprocess is stubbed via the injected runLibraryAction, so this
// tests the real boundary logic without touching disk.

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

// A List payload the PS boundary would return (two valid entries + one invalid record).
function listPayload() {
  return {
    ok: true, rootExists: true, total: 3, capExceeded: false,
    entries: [
      { runId: 'run-20260718-170359-368-59496-a5e6070a', title: 'Alpha', date: '2026-07-18T17:03:59.368Z', dateKind: 'exact', sortMs: 1784394239368, mode: 'transcript', route: 'cli', outcome: 'completed', totalTokens: 17, startOffsetSeconds: null, endOffsetSeconds: null, reportStatus: 'available' },
      { runId: 'run-20260708-150835-583-44172', title: 'Legacy', date: '2026-07-08T15:08:35.583', dateKind: 'approximate', sortMs: 1783689215583, mode: null, route: 'cli', outcome: null, totalTokens: null, startOffsetSeconds: null, endOffsetSeconds: null, reportStatus: 'incomplete' },
    ],
    invalid: [{ runLabel: '(unrecognized run directory)', reason: 'manifest-schema-invalid' }],
  };
}

function makeIpc(overrides) {
  const o = overrides || {};
  const calls = [];
  const runLibraryAction = o.runLibraryAction || (async (a) => { calls.push(a); return listPayload(); });
  const ipc = createLibraryIpc({
    entryUrl: ENTRY,
    getTrustedWindow: () => makeWindow().win,   // fresh trusted window; the event uses its own wc below
    runLibraryAction,
    getRunIdForPane: o.getRunIdForPane || (() => undefined),
    logRefusal: () => {},
  });
  return { ipc, calls };
}

// constructor validation
{
  let threw = 0;
  for (const bad of [
    () => createLibraryIpc({ entryUrl: ENTRY, getTrustedWindow: () => ({}), getRunIdForPane: () => {} }),   // no runLibraryAction
    () => createLibraryIpc({ entryUrl: ENTRY, getTrustedWindow: () => ({}), runLibraryAction: async () => ({}) }), // no getRunIdForPane
    () => createLibraryIpc({ getTrustedWindow: () => ({}), runLibraryAction: async () => ({}), getRunIdForPane: () => {} }), // no entryUrl (gate throws)
  ]) { try { bad(); } catch { threw++; } }
  assert(threw === 3, 'constructor rejects missing runLibraryAction / getRunIdForPane / entryUrl');
}

// helper: an ipc whose trusted window matches the event we pass
function trustedIpc(overrides) {
  const o = overrides || {};
  const w = makeWindow();
  const calls = [];
  const runLibraryAction = o.runLibraryAction || (async (a) => { calls.push(a); return listPayload(); });
  const ipc = createLibraryIpc({
    entryUrl: ENTRY, getTrustedWindow: () => w.win, runLibraryAction,
    getRunIdForPane: o.getRunIdForPane || (() => undefined), logRefusal: () => {},
  });
  return { ipc, calls, ev: evt(w) };
}

(async () => {
  // --- sender gate on every handler ---
  {
    const { ipc } = trustedIpc();
    const l = await ipc.handleList(untrustedEvt());
    const r = await ipc.handleRead(untrustedEvt(), 'lib_whatever');
    const o = await ipc.handleOpenReport(untrustedEvt(), 'pty1');
    assert(l.ok === false && l.error === 'untrusted-sender', 'handleList denies an untrusted sender');
    assert(r.ok === false && r.error === 'untrusted-sender', 'handleRead denies an untrusted sender');
    assert(o.ok === false && o.error === 'untrusted-sender', 'handleOpenReport denies an untrusted sender');
  }

  // --- List: path-free projection + opaque handles ---
  {
    const { ipc, ev } = trustedIpc();
    const res = await ipc.handleList(ev);
    assert(res.ok === true && res.entries.length === 2, 'handleList returns the two valid entries');
    assert(res.invalidCount === 1 && res.invalid[0].reason === 'manifest-schema-invalid', 'invalid count + bounded reason surfaced');
    const e0 = res.entries[0];
    assert(typeof e0.handle === 'string' && e0.handle.startsWith('lib_'), 'each entry carries an opaque handle');
    assert(!('runId' in e0), 'entry does NOT expose a raw runId field');
    assert(e0.displayRunLabel === 'run-20260718-170359-368-59496-a5e6070a', 'entry carries a bounded display run label');
    const blob = JSON.stringify(res);
    assert(blob.indexOf('D:\\\\') === -1 && blob.toLowerCase().indexOf('gemini_video_review') === -1 && blob.indexOf(':/') === -1, 'the List payload contains no filesystem path');
  }

  // --- Read by handle: maps to the run, returns text; unknown/stale handles refuse ---
  {
    const reads = [];
    const runLibraryAction = async (a) => {
      if (a.action === 'List') return listPayload();
      reads.push(a.runId);
      return { ok: true, status: 'available', outcome: 'completed', reportStatus: 'available', title: 'Alpha', mode: 'transcript', route: 'cli', chars: 5, text: 'hello' };
    };
    const { ipc, ev } = trustedIpc({ runLibraryAction });
    const list = await ipc.handleList(ev);
    const handle = list.entries[0].handle;
    const read = await ipc.handleRead(ev, handle);
    assert(read.ok === true && read.status === 'available' && read.text === 'hello', 'handleRead returns the report text for a valid handle');
    assert(reads[0] === 'run-20260718-170359-368-59496-a5e6070a', 'the handle resolved to the correct main-owned run ID');
    const unknown = await ipc.handleRead(ev, 'lib_deadbeef');
    assert(unknown.ok === false && unknown.error === 'unknown-handle', 'an unknown handle is refused');
    const nonString = await ipc.handleRead(ev, 42);
    assert(nonString.ok === false && nonString.error === 'unknown-handle', 'a non-string handle is refused');
    // Refresh the list -> the OLD handle must become stale.
    await ipc.handleList(ev);
    const stale = await ipc.handleRead(ev, handle);
    assert(stale.ok === false && stale.error === 'unknown-handle', 'a handle from a previous list refresh is invalidated');
  }

  // --- Read passthrough shapes: not-persisted / incomplete / PS refusal ---
  {
    const shapes = {
      'run-a': { ok: true, status: 'not-persisted', outcome: 'completed', reportStatus: 'not-persisted' },
      'run-b': { ok: true, status: 'incomplete', outcome: null, reportStatus: 'incomplete' },
      'run-c': { ok: false, status: 'unsafe', reason: 'report-not-utf8' },
    };
    let listEntries = [
      { runId: 'run-a', title: 'A', dateKind: 'exact', reportStatus: 'not-persisted' },
      { runId: 'run-b', title: 'B', dateKind: 'exact', reportStatus: 'incomplete' },
      { runId: 'run-c', title: 'C', dateKind: 'exact', reportStatus: 'available' },
    ];
    const runLibraryAction = async (a) => (a.action === 'List' ? { ok: true, entries: listEntries, invalid: [], total: 3 } : shapes[a.runId]);
    const { ipc, ev } = trustedIpc({ runLibraryAction });
    const list = await ipc.handleList(ev);
    const byLabel = {}; for (const e of list.entries) byLabel[e.displayRunLabel] = e.handle;
    const np = await ipc.handleRead(ev, byLabel['run-a']);
    assert(np.ok === true && np.status === 'not-persisted' && np.text === null, 'not-persisted read returns no text');
    const inc = await ipc.handleRead(ev, byLabel['run-b']);
    assert(inc.ok === true && inc.status === 'incomplete' && inc.outcome === null && inc.text === null, 'incomplete read returns no text, outcome null');
    const unsafe = await ipc.handleRead(ev, byLabel['run-c']);
    assert(unsafe.ok === false && unsafe.status === 'unsafe' && unsafe.error === 'report-not-utf8' && !('text' in unsafe), 'a PS refusal surfaces bounded status+reason, no text');
  }

  // --- Open Report: resolves the pane through the injected V5b1 registry; never a path from the pane ---
  {
    const reads = [];
    const runLibraryAction = async (a) => { if (a.action === 'List') return listPayload(); reads.push(a.runId); return { ok: true, status: 'available', text: 'from-pane', chars: 9, reportStatus: 'available', outcome: 'completed' }; };
    const paneMap = { pty7: 'run-20260718-170359-368-59496-a5e6070a' };
    const { ipc, ev } = trustedIpc({ runLibraryAction, getRunIdForPane: (p) => paneMap[p] });
    const ok = await ipc.handleOpenReport(ev, 'pty7');
    assert(ok.ok === true && ok.text === 'from-pane', 'Open Report resolves a mapped pane to its report');
    assert(reads[0] === 'run-20260718-170359-368-59496-a5e6070a', 'Open Report used the run ID from the V5b1 registry, not from the pane');
    const none = await ipc.handleOpenReport(ev, 'pty-unknown');
    assert(none.ok === false && none.error === 'no-run-for-pane', 'a pane with no mapped run refuses (no-run-for-pane)');
    const bad = await ipc.handleOpenReport(ev, '');
    assert(bad.ok === false && bad.error === 'invalid-pane', 'an empty pane id refuses (invalid-pane)');
  }

  // --- subprocess failure fails closed ---
  {
    const runLibraryAction = async () => { throw new Error('powershell blew up'); };
    const { ipc, ev } = trustedIpc({ runLibraryAction });
    const l = await ipc.handleList(ev);
    assert(l.ok === false && l.error === 'library-subprocess-failed', 'a thrown subprocess fails closed on List');
  }

  process.stdout.write(`\nlibrary-ipc: ${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
})();
