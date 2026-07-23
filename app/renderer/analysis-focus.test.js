'use strict';
// Run: node app/renderer/analysis-focus.test.js
//
// Plain Node.js — no test framework, no build step (matches renderer/video-range-ui.test.js).
// Exit 0 = all pass. Exit 1 = at least one failure. Covers the V3a analysis-focus normalize/validate
// contract shared by the renderer and the main process (video-scout-args.js) and mirrored in the
// PowerShell get-analysis-focus.ps1.

const {
  MAX_ANALYSIS_FOCUS_CHARS,
  normalizeAnalysisFocus,
  analysisFocusRejectionMessage,
} = require('./analysis-focus');

let passed = 0;
let failed = 0;
function assert(condition, label) {
  if (condition) { process.stdout.write(`  ✓ ${label}\n`); passed++; }
  else { process.stderr.write(`  ✗ FAIL: ${label}\n`); failed++; }
}

const CR = String.fromCharCode(0x0d);
const LF = String.fromCharCode(0x0a);
const TAB = String.fromCharCode(0x09);
const NUL = String.fromCharCode(0x00);
const BEL = String.fromCharCode(0x07);
const ESC = String.fromCharCode(0x1b);
const DEL = String.fromCharCode(0x7f);
const VT = String.fromCharCode(0x0b);

// --- not set (omit) ----------------------------------------------------------------------------
assert(normalizeAnalysisFocus(undefined).provided === false && normalizeAnalysisFocus(undefined).ok, 'undefined => ok, not provided (omit)');
assert(normalizeAnalysisFocus(null).provided === false && normalizeAnalysisFocus(null).ok, 'null => ok, not provided (omit)');
assert(normalizeAnalysisFocus('').provided === false, 'empty string => not provided (omit)');
assert(normalizeAnalysisFocus('     ').provided === false, 'all spaces => not provided (omit)');
assert(normalizeAnalysisFocus(TAB + CR + LF + ' ' + TAB).provided === false, 'only whitespace/newlines/tabs => not provided (omit)');
assert(normalizeAnalysisFocus('   ').value === undefined, 'blank => value undefined');

// --- normalization: CRLF / CR / LF / TAB -> single space, then trim -----------------------------
assert(normalizeAnalysisFocus('a' + CR + LF + 'b').value === 'a b', 'CRLF -> single space');
assert(normalizeAnalysisFocus('a' + CR + 'b').value === 'a b', 'CR -> space');
assert(normalizeAnalysisFocus('a' + LF + 'b').value === 'a b', 'LF -> space');
assert(normalizeAnalysisFocus('a' + TAB + 'b').value === 'a b', 'TAB -> space');
assert(normalizeAnalysisFocus('a' + CR + LF + CR + LF + 'b').value === 'a  b', 'two CRLFs -> two spaces (each collapses to one)');
assert(normalizeAnalysisFocus('  hello world  ').value === 'hello world', 'leading/trailing spaces trimmed');
assert(normalizeAnalysisFocus(TAB + LF + '  keep me  ' + LF + TAB).value === 'keep me', 'mixed leading/trailing whitespace trimmed');
assert(normalizeAnalysisFocus('  x  ').chars === 1, 'chars counts the normalized+trimmed length (1)');

// --- bounds: exactly MAX accepted, MAX+1 refused, never truncated -------------------------------
const atMax = 'x'.repeat(MAX_ANALYSIS_FOCUS_CHARS);
const overMax = 'x'.repeat(MAX_ANALYSIS_FOCUS_CHARS + 1);
const rMax = normalizeAnalysisFocus(atMax);
assert(rMax.ok && rMax.provided && rMax.value.length === MAX_ANALYSIS_FOCUS_CHARS, `exactly ${MAX_ANALYSIS_FOCUS_CHARS} accepted`);
const rOver = normalizeAnalysisFocus(overMax);
assert(rOver.ok === false && rOver.reason === 'too-long', `${MAX_ANALYSIS_FOCUS_CHARS + 1} refused (too-long)`);
assert(rOver.value === undefined, 'too-long returns no value (never a truncated string)');
assert(rOver.chars === MAX_ANALYSIS_FOCUS_CHARS + 1, 'too-long reports the true measured length (honest, not truncated)');
// A value that is <= MAX only AFTER trimming trailing whitespace is accepted (trim precedes bound).
const padded = 'y'.repeat(MAX_ANALYSIS_FOCUS_CHARS) + '     ';
assert(normalizeAnalysisFocus(padded).ok && normalizeAnalysisFocus(padded).value.length === MAX_ANALYSIS_FOCUS_CHARS, 'MAX chars + trailing spaces trims to MAX and is accepted');

// --- non-string refused ------------------------------------------------------------------------
for (const bad of [123, true, {}, [], 3.14, () => {}]) {
  const r = normalizeAnalysisFocus(bad);
  assert(r.ok === false && r.reason === 'invalid-type', `non-string (${typeof bad}) refused (invalid-type)`);
}

// --- C0 controls and DEL refused (after tab/CR/LF are converted, any control left is hostile) ---
assert(normalizeAnalysisFocus('bad' + NUL + 'null').ok === false, 'NUL refused');
assert(normalizeAnalysisFocus('bad' + NUL + 'null').reason === 'forbidden-control', 'NUL => forbidden-control');
assert(normalizeAnalysisFocus('bell' + BEL + 'here').ok === false, 'BEL (0x07) refused');
assert(normalizeAnalysisFocus('esc' + ESC + 'seq').ok === false, 'ESC (0x1B) refused');
assert(normalizeAnalysisFocus('del' + DEL + 'char').ok === false, 'DEL (0x7F) refused');
assert(normalizeAnalysisFocus('vt' + VT + 'here').ok === false, 'vertical tab (0x0B) refused');
// A plain space (0x20) and ordinary text are NOT controls.
assert(normalizeAnalysisFocus('normal text 123').ok === true, 'ordinary ASCII text accepted');

// --- Unicode punctuation / non-ASCII survives ---------------------------------------------------
const uni = 'Pricing — onboarding “friction”, café UX → ✅';
assert(normalizeAnalysisFocus(uni).value === uni, 'em dash, curly quotes, accents, arrow, emoji survive unchanged');
assert(normalizeAnalysisFocus('你好世界').value === '你好世界', 'CJK survives');

// --- shell-metacharacter-shaped content is preserved LITERALLY (it is data, not syntax) --------
const meta = '$(rm -rf /) ; cat /etc/passwd | tee `whoami` && echo "hi" > out';
assert(normalizeAnalysisFocus(meta).value === meta, 'shell metacharacters preserved literally as data');

// --- rejection messages are non-empty and never echo content -----------------------------------
assert(typeof analysisFocusRejectionMessage('too-long') === 'string' && analysisFocusRejectionMessage('too-long').length > 0, 'too-long has a message');
assert(analysisFocusRejectionMessage('unknown-reason') === 'Analysis focus is invalid.', 'unknown reason => generic message');

process.stdout.write(`\nanalysis-focus.test.js: ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
