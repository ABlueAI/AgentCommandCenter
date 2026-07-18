'use strict';
// Run: node app/clipboard-ipc.test.js
// Plain Node.js — no framework (matches media-permission-policy.test.js / the renderer suites).
// Exercises the ACTUAL exported production handlers from clipboard-ipc.js: the sender/frame/
// URL trust gate, the 1,000,000-char hard limit both ways, string-only inputs, structured
// { ok, text?, error? } results, and the privacy contract (no clipboard CONTENT in any refusal
// or diagnostic). main.js only forwards ipcMain.handle → these handlers, so testing them is
// testing the real boundary.

const { createClipboardIpcHandlers, CLIPBOARD_CHAR_LIMIT } = require('./clipboard-ipc');

let passed = 0, failed = 0;
function assert(cond, label) {
  if (cond) { process.stdout.write(`  ✓ ${label}\n`); passed++; }
  else { process.stderr.write(`  ✗ FAIL: ${label}\n`); failed++; }
}

const ENTRY = 'file:///D:/Workspace/agent-command-center/app/renderer/index.html';

// --- Electron object stubs ------------------------------------------------------------------------
// A webContents with a main frame; frame.url defaults to the trusted ENTRY.
function makeWindow(overrides) {
  const o = overrides || {};
  const mainFrame = { url: o.frameUrl === undefined ? ENTRY : o.frameUrl };
  const wc = { mainFrame };
  const win = {
    _destroyed: !!o.destroyed,
    isDestroyed() { return this._destroyed; },
    webContents: wc,
  };
  return { win, wc, mainFrame };
}
// The ipcMain.handle invoke event: { sender (webContents), senderFrame (frame) }.
function makeEvent(wc, frame) { return { sender: wc, senderFrame: frame }; }

// A clipboard spy that records writes and can be told what read returns / whether it throws.
function makeClipboard(opts) {
  const o = opts || {};
  const spy = { reads: 0, lastWrite: undefined, writes: 0 };
  return {
    spy,
    readText() { spy.reads++; if (o.readThrows) throw new Error('OS clipboard busy'); return o.readValue === undefined ? '' : o.readValue; },
    writeText(s) { spy.writes++; if (o.writeThrows) throw new Error('OS clipboard busy'); spy.lastWrite = s; },
  };
}

const refusals = [];
function build(win, clipboard) {
  return createClipboardIpcHandlers({
    entryUrl: ENTRY,
    clipboard,
    getTrustedWindow: () => win,
    logRefusal: (line) => refusals.push(line),
  });
}

// --- constructor validation -----------------------------------------------------------------------
{
  let threw = 0;
  const cb = makeClipboard();
  for (const bad of [
    () => createClipboardIpcHandlers({ clipboard: cb, getTrustedWindow: () => ({}) }),           // no entryUrl
    () => createClipboardIpcHandlers({ entryUrl: '', clipboard: cb, getTrustedWindow: () => ({}) }),
    () => createClipboardIpcHandlers({ entryUrl: ENTRY, getTrustedWindow: () => ({}) }),          // no clipboard
    () => createClipboardIpcHandlers({ entryUrl: ENTRY, clipboard: {}, getTrustedWindow: () => ({}) }),
    () => createClipboardIpcHandlers({ entryUrl: ENTRY, clipboard: cb }),                         // no getTrustedWindow
  ]) { try { bad(); } catch { threw++; } }
  assert(threw === 5, 'constructor rejects a missing entryUrl / clipboard / getTrustedWindow');
}
assert(CLIPBOARD_CHAR_LIMIT === 1000000, 'the main-process hard limit is exactly 1,000,000 characters');

// --- trusted main-frame read + write accepted -----------------------------------------------------
{
  const { win, wc, mainFrame } = makeWindow();
  const cb = makeClipboard({ readValue: 'hello from the OS clipboard' });
  const h = build(win, cb);
  const r = h.handleClipboardRead(makeEvent(wc, mainFrame));
  assert(r.ok === true && r.text === 'hello from the OS clipboard', 'trusted main frame: read returns { ok:true, text }');
  const w = h.handleClipboardWrite(makeEvent(wc, mainFrame), 'copied text');
  assert(w.ok === true && cb.spy.lastWrite === 'copied text', 'trusted main frame: write accepted and reaches the OS clipboard');
  const emptyClip = makeClipboard({ readValue: '' });
  const emptyRead = build(makeWindow().win, emptyClip).handleClipboardRead(undefined);
  assert(emptyRead.ok === false && emptyRead.error === 'untrusted-sender', 'a read with no event is refused (defensive), not a crash');
}

// --- denials: wrong sender / subframe / wrong URL / destroyed / non-string / oversized -------------
{
  const trusted = makeWindow();
  const cb = makeClipboard({ readValue: 'secret' });
  const h = build(trusted.win, cb);

  // Wrong webContents (a different sender than the trusted window's).
  const otherWc = { mainFrame: { url: ENTRY } };
  const wrongSender = h.handleClipboardRead(makeEvent(otherWc, otherWc.mainFrame));
  assert(wrongSender.ok === false && wrongSender.error === 'untrusted-sender', 'a foreign webContents is denied (untrusted-sender)');

  // A subframe of the trusted webContents (senderFrame !== mainFrame).
  const subframe = { url: ENTRY };
  const wrongFrame = h.handleClipboardRead(makeEvent(trusted.wc, subframe));
  assert(wrongFrame.ok === false && wrongFrame.error === 'not-main-frame', 'a subframe of the trusted window is denied (not-main-frame)');

  // Main frame, but the document is not the canonical ENTRY_URL.
  const evil = makeWindow({ frameUrl: 'file:///D:/Workspace/agent-command-center/app/renderer/evil.html' });
  const evilH = build(evil.win, cb);
  const wrongUrl = evilH.handleClipboardRead(makeEvent(evil.wc, evil.mainFrame));
  assert(wrongUrl.ok === false && wrongUrl.error === 'untrusted-document', 'the trusted window at a non-entry document is denied (untrusted-document)');
  const httpsWin = makeWindow({ frameUrl: 'https://example.com/index.html' });
  const httpsRes = build(httpsWin.win, cb).handleClipboardWrite(makeEvent(httpsWin.wc, httpsWin.mainFrame), 'x');
  assert(httpsRes.ok === false && httpsRes.error === 'untrusted-document', 'a remote-origin document is denied for writes too');

  // Destroyed trusted window.
  const dead = makeWindow({ destroyed: true });
  const deadH = build(dead.win, cb);
  const destroyed = deadH.handleClipboardWrite(makeEvent(dead.wc, dead.mainFrame), 'x');
  assert(destroyed.ok === false && destroyed.error === 'no-trusted-window', 'a destroyed trusted window is denied (no-trusted-window)');
  const noWin = build(null, cb).handleClipboardRead(makeEvent({}, {}));
  assert(noWin.ok === false && noWin.error === 'no-trusted-window', 'a null trusted window is denied (no-trusted-window)');

  // Non-string write payloads.
  let nonStringDenied = 0;
  for (const bad of [42, null, undefined, {}, ['x'], true]) {
    const res = h.handleClipboardWrite(makeEvent(trusted.wc, trusted.mainFrame), bad);
    if (res.ok === false && res.error === 'non-string-payload') nonStringDenied++;
  }
  assert(nonStringDenied === 6, 'every non-string write payload is denied (non-string-payload)');
  assert(cb.spy.writes === 0, 'a denied write never reaches the OS clipboard');

  // Oversized write (limit + 1).
  const over = h.handleClipboardWrite(makeEvent(trusted.wc, trusted.mainFrame), 'x'.repeat(CLIPBOARD_CHAR_LIMIT + 1));
  assert(over.ok === false && over.error === 'payload-exceeds-limit' && cb.spy.writes === 0, 'a write over the limit is denied at the boundary, never written');

  // Exactly the limit is accepted; the OS clipboard sees it.
  const atLimitCb = makeClipboard();
  const t = makeWindow();
  const atLimit = build(t.win, atLimitCb).handleClipboardWrite(makeEvent(t.wc, t.mainFrame), 'x'.repeat(CLIPBOARD_CHAR_LIMIT));
  assert(atLimit.ok === true && atLimitCb.spy.writes === 1, 'a write of exactly the limit is accepted');

  // Oversized READ (a hostile OS clipboard larger than the limit) is refused, not returned.
  const bigCb = makeClipboard({ readValue: 'y'.repeat(CLIPBOARD_CHAR_LIMIT + 1) });
  const bt = makeWindow();
  const bigRead = build(bt.win, bigCb).handleClipboardRead(makeEvent(bt.wc, bt.mainFrame));
  assert(bigRead.ok === false && bigRead.error === 'clipboard-content-exceeds-limit' && bigRead.text === undefined,
    'a read whose content exceeds the limit is refused and returns no text');
}

// --- clipboard/OS faults fail closed --------------------------------------------------------------
{
  const t1 = makeWindow();
  const readBoom = build(t1.win, makeClipboard({ readThrows: true }));
  const rr = readBoom.handleClipboardRead(makeEvent(t1.wc, t1.mainFrame));
  assert(rr.ok === false && rr.error === 'clipboard-unavailable', 'a throwing readText fails closed (clipboard-unavailable)');
  const t2 = makeWindow();
  const writeBoom = build(t2.win, makeClipboard({ writeThrows: true }));
  const wr = writeBoom.handleClipboardWrite(makeEvent(t2.wc, t2.mainFrame), 'x');
  assert(wr.ok === false && wr.error === 'clipboard-unavailable', 'a throwing writeText fails closed (clipboard-unavailable)');
  // A frame whose .url getter throws (torn-down frame) degrades to a refusal, not a crash.
  const torn = makeWindow();
  Object.defineProperty(torn.mainFrame, 'url', { get() { throw new Error('frame gone'); } });
  const tornRes = build(torn.win, makeClipboard()).handleClipboardRead(makeEvent(torn.wc, torn.mainFrame));
  assert(tornRes.ok === false && tornRes.error === 'untrusted-document', 'a frame with a throwing url getter is refused, not a crash');
}

// --- privacy: clipboard CONTENT never appears in a refusal, result error, or diagnostic -----------
{
  refusals.length = 0;
  const SECRET = 'TOP-SECRET-CLIPBOARD-cnVuIHRoaXM';
  const trusted = makeWindow();
  const cb = makeClipboard({ readValue: SECRET + 'x'.repeat(CLIPBOARD_CHAR_LIMIT) }); // oversized so it refuses
  const h = build(trusted.win, cb);
  // Oversized write of secret content — refused; the payload must not leak into error/log.
  const w = h.handleClipboardWrite(makeEvent(trusted.wc, trusted.mainFrame), SECRET + 'y'.repeat(CLIPBOARD_CHAR_LIMIT));
  // Oversized read of secret content — refused; the content must not leak into error/log.
  const r = h.handleClipboardRead(makeEvent(trusted.wc, trusted.mainFrame));
  const allDiagnostics = refusals.join('\n') + '\n' + JSON.stringify(w) + '\n' + JSON.stringify(r);
  assert(!allDiagnostics.includes(SECRET) && !allDiagnostics.includes('cnVuIHRoaXM'),
    'no clipboard content appears in any refusal line or structured error');
  assert(refusals.length >= 2 && refusals.every((l) => /^\[clipboard\] denied (read|write): [a-z-]+$/.test(l)),
    'every refusal is a bounded reason constant (op + reason only)');
}

process.stdout.write(`\nclipboard-ipc: ${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
