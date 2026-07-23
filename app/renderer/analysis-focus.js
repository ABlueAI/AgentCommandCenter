'use strict';
// V3a: shared normalize/validate for the optional Video Scout "Analysis focus / instructions" field.
// Factored out of app.js so it can be unit-tested in plain node (see analysis-focus.test.js), matching
// the dual browser-<script>/CommonJS pattern used by video-range-ui.js / pty-parser.js. The renderer
// uses this for IMMEDIATE feedback only; the MAIN process re-runs the exact same check inside
// buildVideoScoutArgs (video-scout-args.js) as the real enforcement boundary, and feed-gemini.ps1
// re-validates independently again (it is a documented standalone entry point). One contract, three
// enforcers — the field is untrusted at every hop.
//
// The contract (identical in the PowerShell get-analysis-focus.ps1):
//   - undefined/null            -> NOT SET (omit the field; the script's default brief is unchanged).
//   - non-string                -> REJECT (invalid-type) — a bypassed/modified renderer could send one.
//   - normalize CRLF, CR, LF, and TAB to ordinary spaces, then trim leading/trailing whitespace.
//   - blank / whitespace-only after normalization -> NOT SET (omit; never a refusal, never a value).
//   - > 2000 UTF-16 code units after normalize+trim -> REJECT (too-long). Never silently truncated.
//   - any remaining C0 control (U+0000-U+001F) or DEL (U+007F) after normalization -> REJECT
//     (forbidden-control). Tab/CR/LF are already gone (converted to spaces), so anything left is hostile.
//   - otherwise -> the normalized string is the value; shell-metacharacter-shaped content
//     ($(), ;, |, &, backtick, quotes) is preserved LITERALLY — it is prompt DATA, never parsed as
//     syntax (main passes it as one discrete argv element; nothing ever builds a shell command string).

const MAX_ANALYSIS_FOCUS_CHARS = 2000;

// User-facing refusal messages, keyed by the bounded reason constant. Shared so the renderer's inline
// error and main's launch-refusal error read identically. NOTE: these describe the field, never echo
// its content — the focus text must never appear in a message, a log, or the Logs tab.
const ANALYSIS_FOCUS_MESSAGES = {
  'invalid-type': 'Analysis focus must be text.',
  'too-long': `Analysis focus is too long (max ${MAX_ANALYSIS_FOCUS_CHARS} characters after trimming whitespace). Shorten it — nothing was truncated.`,
  'forbidden-control': 'Analysis focus contains disallowed control characters. Remove them and try again.',
};

function analysisFocusRejectionMessage(reason) {
  return ANALYSIS_FOCUS_MESSAGES[reason] || 'Analysis focus is invalid.';
}

// True if the string still contains a C0 control (char code 0x00-0x1F) or DEL (0x7F). A char-code scan
// (not a regex literal) so no control characters appear in this source file. Tab/CR/LF were already
// converted to spaces before this runs, so any hit here is genuinely disallowed content.
function hasForbiddenControlChar(s) {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c <= 0x1f || c === 0x7f) return true;
  }
  return false;
}

// Normalize + validate. Returns a plain result object (never throws — a refusal path must not itself
// crash on hostile input):
//   { ok: true,  provided: false, value: undefined, chars: 0 }   -> not set / blank: omit the field
//   { ok: true,  provided: true,  value: <string>,  chars: N }   -> valid: pass -AnalysisFocus <value>
//   { ok: false, provided: true,  reason: <const>,  chars? }     -> REFUSE the launch (visible message)
function normalizeAnalysisFocus(value) {
  if (value === undefined || value === null) {
    return { ok: true, provided: false, value: undefined, chars: 0 };
  }
  if (typeof value !== 'string') {
    return { ok: false, provided: true, reason: 'invalid-type' };
  }
  // Convert CRLF, CR, LF, and TAB to ordinary spaces, THEN trim. Order matters: converting first means
  // a value that is only newlines/tabs collapses to spaces and then trims to '' (correctly "not set").
  const normalized = value.replace(/\r\n|\r|\n|\t/g, ' ').replace(/^\s+|\s+$/g, '');
  if (normalized === '') {
    return { ok: true, provided: false, value: undefined, chars: 0 };
  }
  if (normalized.length > MAX_ANALYSIS_FOCUS_CHARS) {
    // Report the measured length so the refusal is honest; do NOT truncate and proceed.
    return { ok: false, provided: true, reason: 'too-long', chars: normalized.length };
  }
  if (hasForbiddenControlChar(normalized)) {
    return { ok: false, provided: true, reason: 'forbidden-control' };
  }
  return { ok: true, provided: true, value: normalized, chars: normalized.length };
}

if (typeof module !== 'undefined') {
  module.exports = { MAX_ANALYSIS_FOCUS_CHARS, normalizeAnalysisFocus, analysisFocusRejectionMessage };
} else {
  window.analysisFocus = { MAX_ANALYSIS_FOCUS_CHARS, normalizeAnalysisFocus, analysisFocusRejectionMessage };
}
