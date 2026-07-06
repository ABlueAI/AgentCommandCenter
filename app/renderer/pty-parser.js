'use strict';
// PTY output parser for claude --agent <role> sessions.
//
// Converts the raw byte stream from node-pty into structured events for the
// chat-bubble renderer. The PTY and the xterm instance keep running unchanged —
// this parser sits alongside term.write(data) and processes the same bytes.
//
// Event types emitted:
//   'assistant'    — agent response text (prose, markdown)
//   'tool_call'    — a tool invocation line (⎿ prefix)
//   'tool_result'  — output lines following a tool call
//   'ui_chrome'    — transient terminal noise (spinners, box-drawing, status bars)
//                    these are suppressed from the chat view entirely
//   'unclassified' — content the parser can't categorise; rendered as plain text
//                    so a future Claude Code TUI update degrades gracefully, not silently
//
// Each event: { type: string, text: string, partial: boolean }
//   partial=true  → line is still streaming; renderer should update-in-place
//   partial=false → line is complete (newline-terminated or flush()-ed)
//
// Graceful degradation guarantee: no line is ever dropped unless it is
// definitively UI chrome (spinner frames, pure box-drawing rows, known status
// patterns). Every other line gets a type and reaches the renderer.

// ── ANSI / VT100 stripping ────────────────────────────────────────────────────
// CSI:  ESC [ <params> <final>   (colors, cursor movement, erase, etc.)
// OSC:  ESC ] <text> BEL|ST      (window title, hyperlinks, clipboard)
// ESC+: ESC <any other char>     (two-char sequences: ESC M, ESC c, etc.)
const RE_ANSI = /\x1b\[[0-9;?]*[A-Za-z]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b./g;

function stripAnsi(s) {
  return s.replace(RE_ANSI, '');
}

// ── Chrome (terminal noise) detection ────────────────────────────────────────
// Only lines that are definitively noise are tagged as chrome. When uncertain,
// we let the line through as 'unclassified'. False positives (noise shown) are
// a better failure mode than false negatives (content silently dropped).

// U+2500–U+259F: box-drawing + block elements (same range as cleanText in tts.js).
// A line made up entirely of these is a visual border or separator, not content.
const RE_ALL_BOX = /^[─-▟\s]*$/;

// U+2800–U+28FF: braille block — used by CLI spinners (ora, cli-spinners, etc.).
// A line that STARTS with a braille character is a spinner frame, even if it also
// has text (e.g. "⠹ Running bash..." — the text is the transient status label).
const RE_STARTS_BRAILLE = /^[⠀-⣿]/;

// Known transient status patterns. Conservative list — only unmistakable chrome.
const CHROME_RE = [
  /^\s*\(esc to interrupt\b/i,
  /^\s*esc to interrupt\b/i,
  /^\s*\(ctrl[+-]c\b/i,
  /^\s*\d[\d,]*\s+tokens?\b/i,  // "1,024 tokens"
  /^\s*cost:\s*\$/i,
  /^>\s*$/,                      // bare prompt symbol
  /^\s*\.\s*\.\s*\.\s*$/,       // "..." ellipsis filler
];

function isChrome(s) {
  const t = s.trim();
  if (!t) return true;
  if (RE_STARTS_BRAILLE.test(t)) return true;
  if (RE_ALL_BOX.test(t)) return true;
  return CHROME_RE.some((r) => r.test(s));
}

// ── Tool-call detection ───────────────────────────────────────────────────────
// Claude Code prefixes tool invocations with ⎿ (U+23BF, BOTTOM RIGHT CORNER).
// This character is not used in normal prose, making it a reliable discriminator.
// Check this on the raw-stripped line BEFORE any further symbol stripping.
const RE_TOOL_MARKER = /⎿/; // ⎿

// ── Border strip ─────────────────────────────────────────────────────────────
// Claude Code sometimes boxes tool output with │ borders:  │  result line  │
// Strip the leading/trailing border chars so the content classifies normally.
const RE_BORDER = /^[│┃]\s?|\s?[│┃]$/g;

// ── Parser states ─────────────────────────────────────────────────────────────
const ST_ASSISTANT    = 'assistant';
const ST_TOOL_RESULT  = 'tool_result';

// ── PtyParser ─────────────────────────────────────────────────────────────────
class PtyParser {
  /**
   * @param {(event: {type: string, text: string, partial: boolean}) => void} onEvent
   */
  constructor(onEvent) {
    if (typeof onEvent !== 'function') throw new TypeError('PtyParser requires an onEvent callback');
    this._emit  = onEvent;
    this._buf   = '';            // raw bytes buffered since the last completed line
    this._state = ST_ASSISTANT;
  }

  /**
   * Feed raw PTY bytes. Emits zero or more events synchronously.
   * @param {string} raw
   */
  feed(raw) {
    // Accumulate and split on newlines.
    // \r (carriage return) means "overwrite from column 0" — a spinner update.
    // We keep only the last CR-segment of each line so the final written content
    // wins and concatenated spinner frames don't corrupt the buffer.
    this._buf += raw;
    const parts = this._buf.split('\n');
    this._buf = parts.pop(); // tail: the incomplete current line (may be '')

    for (const seg of parts) {
      const line = _lastCrSeg(seg);
      this._processLine(line, false);
    }

    // Emit a partial event for the in-progress line when it has real content.
    // The renderer uses this to update (not append) the current live bubble.
    const partialRaw  = _lastCrSeg(this._buf);
    const partialText = this._prepare(partialRaw);
    if (partialText && !isChrome(partialText) && RE_ALNUM.test(partialText)) {
      this._emit({ type: this._state, text: partialText, partial: true });
    }
  }

  /**
   * Flush any remaining buffered content (call when the PTY process exits).
   */
  flush() {
    if (this._buf) {
      const line = _lastCrSeg(this._buf);
      this._processLine(line, false);
      this._buf = '';
    }
  }

  // ── internals ────────────────────────────────────────────────────────────────

  _processLine(rawSeg, partial) {
    const text = this._prepare(rawSeg);

    // Classify and update state machine.
    const type = this._classify(text);

    if (type === 'tool_call') {
      this._state = ST_TOOL_RESULT;
    } else if (type === 'ui_chrome' && this._state === ST_TOOL_RESULT) {
      // A chrome/blank separator signals the end of tool output.
      this._state = ST_ASSISTANT;
    }

    // Suppress chrome from the chat view; emit everything else.
    if (type === 'ui_chrome') return;
    if (!text) return; // stripped to empty but not chrome-classified (shouldn't happen)

    this._emit({ type, text, partial: !!partial });
  }

  // Strip ANSI codes and border chars from a raw segment; trim trailing whitespace.
  _prepare(raw) {
    return stripAnsi(raw).replace(RE_BORDER, '').trimEnd();
  }

  _classify(prepared) {
    const t = prepared.trim();

    // Empty or definitively noise → chrome (suppressed)
    if (!t || isChrome(prepared)) return 'ui_chrome';

    // ⎿-prefixed line → tool call (update state → TOOL_RESULT)
    if (RE_TOOL_MARKER.test(t)) return 'tool_call';

    // In tool-result mode, non-chrome lines are tool output until a separator resets us
    if (this._state === ST_TOOL_RESULT) return 'tool_result';

    // In assistant mode: lines with real letter content are assistant prose.
    // Lines that have content but no letters (e.g. a lone "$", "42", "→") are
    // unclassified — still rendered, but without assistant bubble styling.
    if (/[a-zA-Z]{2}/.test(t)) return 'assistant';

    // Single letter or pure-symbol content that isn't chrome → unclassified
    return 'unclassified';
  }
}

const RE_ALNUM = /[a-zA-Z0-9]/;

// Return the last segment after splitting on \r (carriage return).
// Simulates the terminal "overwrite from column 0" behaviour: whatever was
// written last (after the last \r) is what the user sees, so it's what we parse.
//
// Special case: if the segment ENDS with \r (i.e. the raw bytes were \r\n and
// the caller has already split on \n), the \r is a Windows CRLF line-ending
// character, not an overwrite instruction — return the content before it.
function _lastCrSeg(s) {
  if (!s.includes('\r')) return s;
  const segs = s.split('\r');
  const last = segs[segs.length - 1];
  // Empty last segment means \r was the trailing character (CRLF ending):
  // keep the content that preceded it.
  if (last === '') return segs[segs.length - 2] || '';
  return last; // overwrite: keep what was written after the last \r
}

// ── module export (CJS for tests; guards for browser <script> context) ────────
if (typeof module !== 'undefined') module.exports = { PtyParser, stripAnsi, isChrome };
else window.PtyParser = PtyParser;
