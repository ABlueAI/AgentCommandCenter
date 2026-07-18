'use strict';
// Shared trusted-IPC sender gate (V5b2). The single, canonical implementation of the fail-closed
// sender/frame/URL trust check that EVERY privileged ipcMain.handle in this app must pass before it
// does anything. It was born inside clipboard-ipc.js (V1a); V5b2 adds a second privileged surface
// (the library/report read boundary), so the gate is lifted here and BOTH callers use it — there
// must be exactly one gate, or the two would drift and one could grow a hole the other lacks.
//
// PURE (no Electron import): main.js injects the canonical ENTRY_URL and the trusted-window getter,
// the same late-binding pattern as media-permission-policy.js (K8) and clipboard-ipc.js, so it is
// unit-testable in plain node against stubs (trusted-ipc-sender.test.js).
//
// Trust contract, fail-closed IN THIS ORDER — a request is trusted ONLY when:
//   1. the trusted Blue Helm window exists and is not destroyed          -> 'no-trusted-window'
//   2. the IPC event's sender IS that window's own webContents           -> 'untrusted-sender'
//   3. the sending frame IS that webContents' MAIN frame (never a subframe) -> 'not-main-frame'
//   4. the frame's document is the EXACT canonical entry URL             -> 'untrusted-document'
// Every property access on the (possibly disposed) frame is guarded so a TORN-DOWN frame degrades to
// a refusal, never a main-process throw. The reason strings are bounded constants and are the exact
// values clipboard-ipc.js has always returned (byte-for-byte behavior preservation).

function createTrustedSenderGate(deps) {
  const entryUrl = deps && deps.entryUrl;
  const getTrustedWindow = deps && deps.getTrustedWindow;
  if (typeof entryUrl !== 'string' || entryUrl.length === 0) {
    throw new Error('trusted-ipc-sender: entryUrl must be the canonical entry document URL string.');
  }
  if (typeof getTrustedWindow !== 'function') {
    throw new Error('trusted-ipc-sender: getTrustedWindow must be a function.');
  }

  // `event` is the ipcMain.handle invoke event ({ sender, senderFrame }). Returns
  // { ok:true } or { ok:false, reason:<constant> }. Never throws.
  function assess(event) {
    const win = getTrustedWindow();
    if (!win || (typeof win.isDestroyed === 'function' && win.isDestroyed())) {
      return { ok: false, reason: 'no-trusted-window' };
    }
    const wc = win.webContents;
    if (!wc || !event || event.sender !== wc) return { ok: false, reason: 'untrusted-sender' };
    const frame = event.senderFrame;
    let mainFrame = null;
    try { mainFrame = wc.mainFrame; } catch { /* torn-down webContents */ }
    if (!frame || !mainFrame || frame !== mainFrame) return { ok: false, reason: 'not-main-frame' };
    let frameUrl = null;
    try { frameUrl = frame.url; } catch { /* torn-down frame: url getter throws */ }
    if (frameUrl !== entryUrl) return { ok: false, reason: 'untrusted-document' };
    return { ok: true };
  }

  return { assess };
}

const api = { createTrustedSenderGate };
if (typeof module === 'object' && module.exports) module.exports = api;
