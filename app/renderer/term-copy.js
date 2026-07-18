'use strict';
// Copy Output logic for terminal panes (V1a): reconstruct a pane's xterm buffer as
// clean text, enforce the copy bound, and decide what a Copy Output click copies.
//
// Everything here is PURE — no DOM, no clipboard, no xterm import. app.js hands in
// the live xterm `buffer.active` (public IBuffer API only: .length, .getLine(i),
// line.isWrapped, line.translateToString(trimRight)) plus the selection strings it
// already tracks, and performs the clipboard write / Logs / notice itself. That keeps
// this file unit-testable in plain node against a small buffer stub, exactly like
// pty-parser.js and agent-dom.js.
//
// Privacy contract: the ONLY function that produces a Logs line is buildCopyLogLine,
// and it is constructed from counts and identifiers — it never receives the copied
// text at all, so a future edit cannot accidentally interpolate it.
//
// Whole file wrapped in an IIFE (the tts-selection.js pattern): classic renderer
// <script> files share ONE global scope, so top-level declarations here would collide
// with other modules' (agent-dom.js already owns a top-level `api`). The wrapper is
// what makes this loadable as both a browser <script> and a CommonJS test module.
((global) => {

  // Maximum characters (UTF-16 code units, the same unit every `s.length` log line in
  // this app already reports) a single Copy Output may place on the clipboard. When the
  // buffer holds more, the NEWEST bound-many characters win, without ever splitting a
  // surrogate pair at the cut.
  const COPY_OUTPUT_BOUND = 1000000;

  // Join one logical line from its physical rows. `start` is the row where isWrapped is
  // false (may be null when scrollback evicted the true start of a wrapped line);
  // `continuations` are its isWrapped rows in TOP-TO-BOTTOM order. Trim rules: a row
  // that CONTINUES onto the next physical row was completely full when it wrapped, so
  // it is taken untrimmed (its trailing spaces are real text at the wrap boundary);
  // only the LAST physical row of the logical line carries never-written cell padding,
  // so only that one is trimmed (translateToString(true)).
  function joinLogicalLine(start, continuations) {
    const rows = start ? [start].concat(continuations) : continuations.slice();
    if (rows.length === 0) return '';
    const parts = [];
    for (let i = 0; i < rows.length - 1; i++) parts.push(rows[i].translateToString(false));
    parts.push(rows[rows.length - 1].translateToString(true));
    return parts.join('');
  }

  // Rebuild the pane's available text (viewport + scrollback) newest-first under a
  // character budget. The xterm buffer is itself bounded (scrollback option), so the
  // worst case materialized here is a few MB — but we still walk BACKWARD from the
  // newest row and stop RETAINING lines once the budget is met, so the kept text never
  // grows past roughly one logical line beyond the bound; older rows are only counted.
  //
  // Returns { ok:true, text, totalChars, copiedChars, truncated } or
  //         { ok:false, reason:'empty-buffer', totalChars:0 }.
  function reconstructBufferText(buffer, bound) {
    if (!Number.isInteger(bound) || bound <= 0) {
      throw new Error(`term-copy: invalid copy bound ${bound} (need a positive integer).`);
    }
    const rowCount = buffer.length;
    const keptLines = []; // newest logical line first
    let keptChars = 0;    // chars kept, including one '\n' separator per extra line
    let totalChars = 0;   // chars available across ALL logical lines (same accounting)
    let sawContent = false; // false while still skipping the never-written rows at the bottom
    let continuations = []; // pending isWrapped rows below the row we're about to reach (bottom-up)

    const takeLine = (startRow) => {
      // continuations were collected bottom-up; joinLogicalLine wants top-to-bottom.
      const text = joinLogicalLine(startRow, continuations.slice().reverse());
      continuations = [];
      if (!sawContent && text === '') return; // trailing blank rows are cell padding, not output
      sawContent = true;
      totalChars += text.length + (totalChars > 0 ? 1 : 0);
      if (keptChars < bound) {
        keptChars += text.length + (keptLines.length > 0 ? 1 : 0);
        keptLines.push(text);
      }
    };

    for (let i = rowCount - 1; i >= 0; i--) {
      const line = buffer.getLine(i);
      if (!line) continue; // defensive: a hole in the buffer is skipped, never a crash
      if (line.isWrapped) { continuations.push(line); continue; }
      takeLine(line);
    }
    // Scrollback may have evicted the start of the oldest wrapped line — flush the
    // orphaned continuation rows as their own (partial) line rather than dropping them.
    if (continuations.length > 0) takeLine(null);

    if (!sawContent) return { ok: false, reason: 'empty-buffer', totalChars: 0 };

    let text = keptLines.reverse().join('\n');
    if (text.length > bound) {
      text = text.slice(text.length - bound);
      // Never split a surrogate pair: if the cut stranded the LOW half of a pair at the
      // front, drop it (one fewer character copied, never a broken one).
      const first = text.charCodeAt(0);
      if (first >= 0xdc00 && first <= 0xdfff) text = text.slice(1);
    }
    return {
      ok: true,
      text,
      totalChars,
      copiedChars: text.length,
      truncated: totalChars > text.length,
    };
  }

  // Enforce the copy bound on an already-materialized string (the selection and
  // snapshot sources). Same rule as the buffer path: the NEWEST bound-many characters
  // win, and a cut that strands the low half of a surrogate pair drops the orphan
  // (one fewer character copied, never a broken one).
  function applyCopyBound(text, bound) {
    if (text.length <= bound) {
      return { text, copiedChars: text.length, totalChars: text.length, truncated: false };
    }
    let out = text.slice(text.length - bound);
    const first = out.charCodeAt(0);
    if (first >= 0xdc00 && first <= 0xdfff) out = out.slice(1);
    return { text: out, copiedChars: out.length, totalChars: text.length, truncated: true };
  }

  // Decide what a Copy Output click copies. Priority (per the V1a contract):
  //   1. a live pane-local selection at click time;
  //   2. the pointer-down snapshot (covers selections that header focus/mouse-mode
  //      TUIs cleared between pointer-down and click — same rescue the 🔊 button uses);
  //   3. the reconstructed buffer.
  // EVERY source is subject to the copy bound — selections included (Blue's
  // correction: "Maximum copied output" means no clipboard path is unbounded).
  // `reconstruct` is only invoked when there is no selection.
  function resolveCopyRequest(opts) {
    const bound = (opts && Number.isInteger(opts.bound) && opts.bound > 0) ? opts.bound : COPY_OUTPUT_BOUND;
    const selection = (opts && opts.selection) || '';
    const snapshot = (opts && opts.snapshot) || '';
    if (selection) {
      const bounded = applyCopyBound(selection, bound);
      return { ok: true, source: 'selection', text: bounded.text, copiedChars: bounded.copiedChars, totalChars: bounded.totalChars, truncated: bounded.truncated };
    }
    if (snapshot) {
      const bounded = applyCopyBound(snapshot, bound);
      return { ok: true, source: 'snapshot', text: bounded.text, copiedChars: bounded.copiedChars, totalChars: bounded.totalChars, truncated: bounded.truncated };
    }
    const rebuilt = opts.reconstruct();
    if (!rebuilt || !rebuilt.ok) {
      return { ok: false, source: 'buffer', reason: (rebuilt && rebuilt.reason) || 'empty-buffer' };
    }
    return { ok: true, source: 'buffer', text: rebuilt.text, copiedChars: rebuilt.copiedChars, totalChars: rebuilt.totalChars, truncated: rebuilt.truncated };
  }

  // The one and only Logs line for a Copy Output action — metadata by construction
  // (this function is never handed the text, so it cannot leak it).
  function buildCopyLogLine(meta) {
    const base = `[copy-output ${meta.paneId}] role=${meta.role || 'shell'} source=${meta.source}`;
    if (meta.failed) return `${base} FAILED: ${meta.reason}\n`;
    const counts = `copied=${meta.copiedChars} available=${meta.totalChars} truncated=${meta.truncated === true}`;
    return `${base} ${counts}\n`;
  }

  // User-visible truncation notice (shown in the UI, not just Logs): says that output
  // was truncated, how many characters were copied, and how many were available. The
  // run-directory hint is true only for Video Scout panes, so it is appended only there
  // (Reviewer LOW-1: a PowerShell pane has no run directory to point at).
  function buildTruncationNotice(meta) {
    const base = `Copy Output: the pane held more than the ${COPY_OUTPUT_BOUND.toLocaleString('en-US')}-character copy limit.\n\n`
      + `Copied the newest ${meta.copiedChars.toLocaleString('en-US')} of ${meta.totalChars.toLocaleString('en-US')} available characters (older output was truncated).`;
    if (meta.role === 'video-scout') {
      return `${base}\n\nThe full run output of a Video Scout run is always on disk in its run directory.`;
    }
    return base;
  }

  const api = { COPY_OUTPUT_BOUND, reconstructBufferText, applyCopyBound, resolveCopyRequest, buildCopyLogLine, buildTruncationNotice };
  global.ccTermCopy = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window === 'undefined' ? globalThis : window);
