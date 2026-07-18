'use strict';
// Renderer-side clipboard consumer logic (V1a clipboard boundary), factored out of
// app.js so the ASYNC IPC behavior is unit-testable against the real functions rather
// than static-grepped. Every OS access is the injected invokeRead/invokeWrite (the
// preload's bounded IPC wrappers to main) — this module never touches a clipboard,
// navigator, or shell directly.
//
// Guarantees the work order requires, all enforced here:
//   - success is reported ONLY after the IPC promise resolves with { ok:true };
//   - an IPC rejection OR a structured { ok:false } refuses VISIBLY (a metadata-only
//     Logs line) and never throws — so fire-and-forget callers (Ctrl+C/V, right-click,
//     OSC 52) leave no unhandled rejection;
//   - a FAILED read never reaches ptyWrite (null sentinel, distinct from '' = empty);
//   - no clipboard CONTENT is ever logged — only character counts and reason strings.
//
// IIFE-wrapped for the shared renderer <script> global scope (see term-copy.js).
((global) => {

  function errMsg(err) { return (err && err.message) || String(err) || 'unknown error'; }

  function createClipboardConsumer(deps) {
    const invokeRead = deps.invokeRead;    // () => Promise<{ ok, text?, error? }>
    const invokeWrite = deps.invokeWrite;  // (s) => Promise<{ ok, error? }>
    const ptyWrite = deps.ptyWrite;        // (text) => void  (paste target)
    const log = deps.log || (() => {});
    const paneId = deps.paneId || '';

    // Low-level write: never throws/rejects, never logs. Returns a normalized
    // { ok:true } or { ok:false, error }. Copy Output uses this so it can attach its
    // OWN richer metadata Logs line (buildCopyLogLine) instead of the generic one.
    async function writeText(text) {
      try {
        const res = await invokeWrite(text);
        return (res && res.ok) ? { ok: true } : { ok: false, error: (res && res.error) || 'unknown error' };
      } catch (err) {
        return { ok: false, error: errMsg(err) };
      }
    }

    // Terminal-shortcut write (Ctrl+C / Ctrl+Shift+C / right-click / OSC 52): writeText
    // plus one metadata-only Logs line. Empty input is a no-op refusal (nothing to copy).
    async function writeClip(text, label) {
      const tag = label || `copy ${paneId}`;
      if (!text) return { ok: false, error: 'empty' };
      const res = await writeText(text);
      if (res.ok) log(`[${tag}] ${text.length} chars written to clipboard\n`); // count only — never the text
      else log(`[${tag}] clipboardWrite FAILED: ${res.error}\n`);
      return res;
    }

    // Read: returns the clipboard string on success (INCLUDING '' for an empty
    // clipboard), or null on ANY failure. Callers MUST treat null as "do not paste".
    async function readClip() {
      let res;
      try { res = await invokeRead(); }
      catch (err) { res = { ok: false, error: errMsg(err) }; }
      if (res && res.ok && typeof res.text === 'string') return res.text;
      log(`[clipboard ${paneId}] read FAILED: ${(res && res.error) || 'unknown error'}\n`);
      return null;
    }

    // Paste into the PTY — a FAILED read (null) must never reach ptyWrite.
    async function pasteIntoPty() {
      const t = await readClip();
      if (t === null) return false;                 // failure already logged — never paste
      if (t) { ptyWrite(t); return true; }
      log('[clipboard] nothing to paste (clipboard empty).\n');
      return false;
    }

    return { writeText, writeClip, readClip, pasteIntoPty };
  }

  const api = { createClipboardConsumer };
  global.ccClipboardConsumer = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window === 'undefined' ? globalThis : window);
