'use strict';
// Terminal key remapping for agent panes. PURE — no DOM, no xterm import; app.js calls it from the
// xterm custom key handler and does the PTY write itself.
//
// Shift+Enter inserts a newline in Claude Code panes (Blue, 2026-10-03 daily-driver notes). xterm
// sends a plain CR for Shift+Enter, which Claude Code treats as submit. Alt+Enter already produced a
// newline because xterm sends ESC CR for it, so Shift+Enter sends that same sequence.
//
// Only Claude Code panes are remapped. In a plain PowerShell pane, PSReadLine binds Escape to
// "revert line", so ESC CR there could discard what was typed.
//
// Whole file wrapped in an IIFE (the term-copy.js pattern): classic renderer <script> files share
// one global scope.
((global) => {

  const NEWLINE_SEQUENCE = '\x1b\r';

  function isPlainShiftEnter(event) {
    return !!event && event.key === 'Enter' && event.shiftKey === true
      && !event.ctrlKey && !event.altKey && !event.metaKey;
  }

  /**
   * Decide what a key event in a terminal pane should do.
   *   { handled: false }                     xterm handles the event normally
   *   { handled: true, send: '<sequence>' }  write `send` to the PTY and stop xterm
   *   { handled: true, send: null }          stop xterm without writing (the keypress/keyup that
   *                                          follows a remapped keydown, so no stray CR submits)
   */
  function resolveKey(event, cli) {
    if (cli !== 'claude' || !isPlainShiftEnter(event)) return { handled: false };
    if (event.type === 'keydown') return { handled: true, send: NEWLINE_SEQUENCE };
    return { handled: true, send: null };
  }

  const api = { NEWLINE_SEQUENCE, resolveKey };
  global.ccTermKeys = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window === 'undefined' ? globalThis : window);
