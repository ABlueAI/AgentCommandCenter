'use strict';
// V1a clipboard security boundary (Full-class): the OS clipboard is owned by the MAIN
// process only. Under the sandboxed Electron 42 preload the `clipboard` module is
// undefined, so the old preload-direct calls crashed — and the correct repair is not a
// bigger preload surface but a bounded IPC one, because the clipboard is an OS
// capability reachable from a renderer that also hosts hostile terminal bytes.
//
// This module is PURE (no Electron import): main.js injects the real `clipboard`,
// the canonical ENTRY_URL, and the trusted-window getter — the same late-binding
// pattern as media-permission-policy.js (K8), so both handlers are unit-testable in
// plain node against stubs (clipboard-ipc.test.js).
//
// Trust contract, fail-closed in this order — a request is served ONLY when:
//   1. the trusted Blue Helm window exists and is not destroyed;
//   2. the IPC event's sender IS that window's own webContents;
//   3. the sending frame IS that webContents' MAIN frame (no subframe ever);
//   4. the frame's document is the EXACT canonical entry URL.
// Everything else — and any non-string or over-limit payload — returns a structured
// refusal { ok:false, error:<reason constant> }. Reasons are bounded constants;
// clipboard CONTENT never appears in any log line or error, in either direction.

const { createTrustedSenderGate } = require('./trusted-ipc-sender');

// Hard limit for one clipboard read or write, in UTF-16 code units — the same
// 1,000,000-character bound the renderer's Copy Output enforces (term-copy.js).
// Enforced HERE too because main is the security boundary: a bypassed or buggy
// renderer must not be able to move unbounded data through this channel.
const CLIPBOARD_CHAR_LIMIT = 1000000;

function createClipboardIpcHandlers(deps) {
  const entryUrl = deps && deps.entryUrl;
  const clipboard = deps && deps.clipboard;
  const getTrustedWindow = deps && deps.getTrustedWindow;
  const logRefusal = (deps && deps.logRefusal) || (() => {});
  if (!clipboard || typeof clipboard.readText !== 'function' || typeof clipboard.writeText !== 'function') {
    throw new Error('clipboard-ipc: a clipboard implementation with readText/writeText is required.');
  }
  // The sender/frame/URL trust check is the shared gate (V5b2) — no second copy lives here. The
  // constructor's entryUrl/getTrustedWindow validation happens inside createTrustedSenderGate, so a
  // missing entryUrl or getTrustedWindow still throws exactly as before (clipboard-ipc.test.js).
  const gate = createTrustedSenderGate({ entryUrl, getTrustedWindow });
  // Preserved name + return shape ({ ok, reason }) so the historical behavior/tests are unchanged.
  const assessSender = (event) => gate.assess(event);

  // Bounded refusal: reason constant only — never content, never a URL.
  function refuse(op, reason) {
    logRefusal(`[clipboard] denied ${op}: ${reason}`);
    return { ok: false, error: reason };
  }

  function handleClipboardRead(event) {
    const gate = assessSender(event);
    if (!gate.ok) return refuse('read', gate.reason);
    let text;
    try { text = clipboard.readText(); } catch { return refuse('read', 'clipboard-unavailable'); }
    if (typeof text !== 'string') return refuse('read', 'clipboard-unavailable');
    if (text.length > CLIPBOARD_CHAR_LIMIT) return refuse('read', 'clipboard-content-exceeds-limit');
    return { ok: true, text };
  }

  function handleClipboardWrite(event, payload) {
    const gate = assessSender(event);
    if (!gate.ok) return refuse('write', gate.reason);
    if (typeof payload !== 'string') return refuse('write', 'non-string-payload');
    if (payload.length > CLIPBOARD_CHAR_LIMIT) return refuse('write', 'payload-exceeds-limit');
    try { clipboard.writeText(payload); } catch { return refuse('write', 'clipboard-unavailable'); }
    return { ok: true };
  }

  return { assessSender, handleClipboardRead, handleClipboardWrite };
}

const api = { createClipboardIpcHandlers, CLIPBOARD_CHAR_LIMIT };
if (typeof module === 'object' && module.exports) module.exports = api;
