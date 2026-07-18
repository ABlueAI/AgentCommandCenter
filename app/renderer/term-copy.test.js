'use strict';
// Run: node app/renderer/term-copy.test.js
// Plain Node.js — no framework (matches agent-dom.test.js / pty-parser.test.js).
// Proves the V1a Copy Output contract: buffer reconstruction (wrapped rows rejoined,
// blank lines kept, cell padding removed), the 1,000,000-character bound with
// surrogate-pair safety, the selection > snapshot > buffer priority, and the privacy
// contract (Logs lines are metadata-only by construction). The trailing section
// statically checks the app.js wiring: ONE shared copy path for every pane type
// (Video Scout included), pointer-down selection snapshot, visible failures.

const fs = require('fs');
const path = require('path');
const { COPY_OUTPUT_BOUND, reconstructBufferText, resolveCopyRequest, buildCopyLogLine, buildTruncationNotice } = require('./term-copy');

let passed = 0, failed = 0;
function assert(cond, label) {
  if (cond) { process.stdout.write(`  ✓ ${label}\n`); passed++; }
  else { process.stderr.write(`  ✗ FAIL: ${label}\n`); failed++; }
}

// --- xterm IBuffer stub ---------------------------------------------------------------------------
// Models the three public members the reconstruction uses: buffer.length, buffer.getLine(i),
// and line.{isWrapped, translateToString(trimRight)}. trimRight strips trailing spaces the way
// xterm strips never-written cell padding.
function row(raw, isWrapped) {
  return { isWrapped: !!isWrapped, translateToString: (trim) => (trim ? raw.replace(/ +$/, '') : raw) };
}
function buffer(rows) { return { length: rows.length, getLine: (i) => rows[i] }; }

// --- unwrapped rows -------------------------------------------------------------------------------
{
  const r = reconstructBufferText(buffer([row('alpha'), row('beta'), row('gamma')]), COPY_OUTPUT_BOUND);
  assert(r.ok && r.text === 'alpha\nbeta\ngamma', 'unwrapped rows: one physical row = one line, order preserved');
  assert(r.totalChars === 16 && r.copiedChars === 16 && r.truncated === false, 'unwrapped rows: counts exact, not truncated');
}

// --- wrapped rows join into ONE logical line ------------------------------------------------------
{
  const r = reconstructBufferText(buffer([row('XXXX'), row('YYYY', true), row('Z   ', true), row('tail')]), COPY_OUTPUT_BOUND);
  assert(r.ok && r.text === 'XXXXYYYYZ\ntail', 'wrapped rows rejoin into one logical line (no injected newlines)');
}
{
  // A space at the wrap boundary is REAL text (the row was full when it wrapped) — only the
  // final physical row of a logical line carries never-written padding.
  const r = reconstructBufferText(buffer([row('foo ', false), row('bar   ', true)]), COPY_OUTPUT_BOUND);
  assert(r.ok && r.text === 'foo bar', 'wrap-boundary space preserved; final-row padding trimmed');
}

// --- intentional blank lines vs terminal padding --------------------------------------------------
{
  const r = reconstructBufferText(buffer([row('a'), row(''), row('b')]), COPY_OUTPUT_BOUND);
  assert(r.ok && r.text === 'a\n\nb', 'intentional interior blank line preserved');
}
{
  const r = reconstructBufferText(buffer([row('a'), row('b'), row(''), row(''), row('')]), COPY_OUTPUT_BOUND);
  assert(r.ok && r.text === 'a\nb' && r.totalChars === 3, 'trailing never-written rows are padding: dropped from text AND counts');
}
{
  const r = reconstructBufferText(buffer([row('hello     ')]), COPY_OUTPUT_BOUND);
  assert(r.ok && r.text === 'hello', 'trailing cell padding on a line is removed');
}
{
  const r = reconstructBufferText(buffer([row(''), row(''), row('')]), COPY_OUTPUT_BOUND);
  assert(r.ok === false && r.reason === 'empty-buffer' && r.totalChars === 0, 'all-blank buffer refuses visibly (empty-buffer), never a silent empty copy');
}

// --- Unicode --------------------------------------------------------------------------------------
{
  const r = reconstructBufferText(buffer([row('naïve 🎥 日本語'), row('émoji—dash', true)]), COPY_OUTPUT_BOUND);
  assert(r.ok && r.text === 'naïve 🎥 日本語émoji—dash', 'Unicode text survives reconstruction byte-for-byte');
}

// --- scrollback evicted the start of a wrapped line -----------------------------------------------
{
  const r = reconstructBufferText(buffer([row('tail-of-evicted-line', true), row('next')]), COPY_OUTPUT_BOUND);
  assert(r.ok && r.text === 'tail-of-evicted-line\nnext', 'orphaned continuation rows at the buffer top are kept, not dropped');
}

// --- defensive traversal --------------------------------------------------------------------------
{
  const holed = { length: 3, getLine: (i) => (i === 1 ? undefined : row(i === 0 ? 'a' : 'b')) };
  const r = reconstructBufferText(holed, COPY_OUTPUT_BOUND);
  assert(r.ok && r.text === 'a\nb', 'a hole in the buffer (getLine undefined) is skipped, never a crash');
}
{
  let threw = 0;
  for (const bad of [0, -1, 1.5, '10', null, undefined]) {
    try { reconstructBufferText(buffer([row('x')]), bad); } catch { threw++; }
  }
  assert(threw === 6, 'an invalid bound throws (fail visibly) instead of copying unbounded');
}

// --- the bound: minus one, exact, plus one (real constant) ----------------------------------------
assert(COPY_OUTPUT_BOUND === 1000000, 'copy bound is exactly 1,000,000 characters');
{
  const r = reconstructBufferText(buffer([row('x'.repeat(COPY_OUTPUT_BOUND - 1))]), COPY_OUTPUT_BOUND);
  assert(r.ok && r.copiedChars === COPY_OUTPUT_BOUND - 1 && r.truncated === false, 'bound minus one: everything copied, not truncated');
}
{
  const r = reconstructBufferText(buffer([row('x'.repeat(COPY_OUTPUT_BOUND))]), COPY_OUTPUT_BOUND);
  assert(r.ok && r.copiedChars === COPY_OUTPUT_BOUND && r.truncated === false, 'exact bound: everything copied, not truncated');
}
{
  const r = reconstructBufferText(buffer([row('x'.repeat(COPY_OUTPUT_BOUND + 1))]), COPY_OUTPUT_BOUND);
  assert(r.ok && r.copiedChars === COPY_OUTPUT_BOUND && r.totalChars === COPY_OUTPUT_BOUND + 1 && r.truncated === true,
    'bound plus one: newest 1,000,000 copied, truncated=true, availability counted');
}

// --- newest output wins under the bound -----------------------------------------------------------
{
  const r = reconstructBufferText(buffer([row('old-old-old'), row('mid'), row('new')]), 3);
  assert(r.ok && r.text === 'new' && r.truncated === true, 'truncation keeps the NEWEST output');
  assert(r.totalChars === 11 + 1 + 3 + 1 + 3, 'available count covers the whole buffer, not just what was kept');
}
{
  // partial-line cut: newest 8 of 'aaaa\nbbbb' (9 chars)
  const r = reconstructBufferText(buffer([row('aaaa'), row('bbbb')]), 8);
  assert(r.ok && r.text === 'aaa\nbbbb' && r.copiedChars === 8 && r.totalChars === 9 && r.truncated === true,
    'a mid-line cut keeps exactly the newest bound-many characters');
}

// --- Unicode at the truncation boundary: never split a surrogate pair -----------------------------
{
  // '😀ab' is [high, low, a, b]; a bound of 3 would cut between the surrogate halves.
  const r = reconstructBufferText(buffer([row('\u{1F600}ab')]), 3);
  assert(r.ok && r.text === 'ab' && r.copiedChars === 2, 'a cut inside a surrogate pair drops the orphan half (copies one fewer, never a broken char)');
  const first = r.text.charCodeAt(0);
  assert(!(first >= 0xdc00 && first <= 0xdfff), 'truncated text never starts with a lone low surrogate');
}
{
  // The cut can also land exactly ON the pair boundary — then the emoji survives whole.
  const r = reconstructBufferText(buffer([row('ab\u{1F600}')]), 2);
  assert(r.ok && r.text === '\u{1F600}', 'a cut landing on a pair boundary keeps the emoji intact');
}

// --- resolveCopyRequest: selection > snapshot > buffer --------------------------------------------
{
  let rebuilt = 0;
  const spy = () => { rebuilt++; return { ok: true, text: 'BUF', totalChars: 3, copiedChars: 3, truncated: false }; };
  const sel = resolveCopyRequest({ selection: 'forward selection', snapshot: 'snap', reconstruct: spy });
  assert(sel.ok && sel.source === 'selection' && sel.text === 'forward selection' && rebuilt === 0,
    'a live pane-local selection wins and the buffer is never rebuilt');
  const rev = resolveCopyRequest({ selection: 'noitceles esrever', snapshot: '', reconstruct: spy });
  assert(rev.text === 'noitceles esrever' && rebuilt === 0,
    'reverse/mouse-drag selections copy exactly the text xterm reports (used verbatim)');
  const snap = resolveCopyRequest({ selection: '', snapshot: 'PS C:\\> native powershell selection', reconstruct: spy });
  assert(snap.ok && snap.source === 'snapshot' && snap.text === 'PS C:\\> native powershell selection' && rebuilt === 0,
    'pointer-down snapshot rescues a selection the header click cleared (native PowerShell pane case)');
  const buf = resolveCopyRequest({ selection: '', snapshot: '', reconstruct: spy });
  assert(buf.ok && buf.source === 'buffer' && buf.text === 'BUF' && rebuilt === 1,
    'no selection anywhere: the full buffer reconstruction is used');
  const empty = resolveCopyRequest({ selection: '', snapshot: '', reconstruct: () => ({ ok: false, reason: 'empty-buffer', totalChars: 0 }) });
  assert(empty.ok === false && empty.reason === 'empty-buffer', 'an unavailable/empty buffer surfaces as a refusal, not a fake success');
  assert(sel.truncated === false && snap.truncated === false, 'selections at or below the limit are copied unchanged');
}

// --- the bound applies to SELECTIONS too (Blue correction: no unbounded clipboard path) -----------
{
  const boom = () => { throw new Error('reconstruct must not run when a selection exists'); };
  const under = resolveCopyRequest({ selection: 'x'.repeat(COPY_OUTPUT_BOUND - 1), snapshot: '', reconstruct: boom });
  assert(under.ok && under.copiedChars === COPY_OUTPUT_BOUND - 1 && under.truncated === false,
    'selection at limit minus one: copied unchanged, not truncated');
  const at = resolveCopyRequest({ selection: 'x'.repeat(COPY_OUTPUT_BOUND), snapshot: '', reconstruct: boom });
  assert(at.ok && at.copiedChars === COPY_OUTPUT_BOUND && at.truncated === false,
    'selection at exactly the limit: copied unchanged, not truncated');
  const over = resolveCopyRequest({ selection: 'a' + 'x'.repeat(COPY_OUTPUT_BOUND), snapshot: '', reconstruct: boom });
  assert(over.ok && over.truncated === true && over.copiedChars === COPY_OUTPUT_BOUND
    && over.totalChars === COPY_OUTPUT_BOUND + 1 && over.text.length === COPY_OUTPUT_BOUND,
    'selection at limit plus one: newest limit-many characters copied, truncated=true, availability counted');
  // '😀' + (bound−1) x's is bound+1 units; the cut lands between the surrogate halves.
  const emoji = resolveCopyRequest({ selection: '\u{1F600}' + 'x'.repeat(COPY_OUTPUT_BOUND - 1), snapshot: '', reconstruct: boom });
  const emojiFirst = emoji.text.charCodeAt(0);
  assert(emoji.ok && emoji.truncated === true && emoji.copiedChars === COPY_OUTPUT_BOUND - 1
    && !(emojiFirst >= 0xdc00 && emojiFirst <= 0xdfff),
    'selection with a surrogate pair crossing the truncation boundary drops the orphan half, never splits it');
  const snapOver = resolveCopyRequest({ selection: '', snapshot: 'y'.repeat(COPY_OUTPUT_BOUND + 5), reconstruct: boom });
  assert(snapOver.ok && snapOver.source === 'snapshot' && snapOver.copiedChars === COPY_OUTPUT_BOUND && snapOver.truncated === true,
    'the pointer-down snapshot source is bounded identically');
  const newest = resolveCopyRequest({ selection: 'abcdef', snapshot: '', reconstruct: boom, bound: 4 });
  assert(newest.text === 'cdef' && newest.truncated === true && newest.totalChars === 6,
    'a truncated selection keeps the NEWEST characters (end of the selection)');
}

// --- privacy: the Logs line is metadata by construction -------------------------------------------
{
  const SECRET = 'SECRET-PAYLOAD-cnVuIHRoaXM-do-not-log';
  const res = resolveCopyRequest({ selection: SECRET, snapshot: '', reconstruct: () => { throw new Error('unreachable'); } });
  const line = buildCopyLogLine({ paneId: 'pty7', role: 'video-scout', source: res.source, copiedChars: res.copiedChars, totalChars: res.totalChars, truncated: res.truncated });
  assert(!line.includes(SECRET) && !line.includes('cnVuIHRoaXM'), 'Logs line NEVER contains selected/copied text');
  assert(line.includes('pty7') && line.includes('role=video-scout') && line.includes('source=selection'), 'Logs line carries pane id, role, and source');
  assert(/copied=37 available=37 truncated=false/.test(line), 'Logs line carries copied/available/truncated metadata');
  const fail = buildCopyLogLine({ paneId: 'pty7', role: 'shell', source: 'buffer', failed: true, reason: 'clipboardWrite: denied' });
  assert(/FAILED: clipboardWrite: denied/.test(fail), 'a failed copy produces a visible FAILED Logs line');
}

// --- truncation notice ----------------------------------------------------------------------------
{
  const n = buildTruncationNotice({ copiedChars: 1000000, totalChars: 2345678 });
  assert(n.includes('1,000,000') && n.includes('2,345,678') && /truncated/i.test(n),
    'truncation notice states truncated + copied count + available count');
  assert(!/Video Scout/.test(n), 'non-scout panes get no Video-Scout run-directory hint (LOW-1: a shell has no run dir)');
  const vs = buildTruncationNotice({ copiedChars: 1000000, totalChars: 2345678, role: 'video-scout' });
  assert(/Video Scout/.test(vs) && /run directory/.test(vs), 'Video Scout panes keep the run-directory hint');
}

// --- static wiring checks (app.js / index.html) ---------------------------------------------------
// CRLF-safe: normalize before matching (a fresh autocrlf checkout materializes \r\n).
const read = (p) => fs.readFileSync(path.join(__dirname, p), 'utf8').replace(/\r\n/g, '\n');
const appSrc = read('app.js');
const html = read('index.html');
{
  const wirings = (appSrc.match(/querySelector\('\.copy-out'\)/g) || []).length;
  assert(wirings === 1, 'exactly ONE Copy Output wiring path in app.js (every pane type shares it)');
  const start = appSrc.indexOf("pane.querySelector('.copy-out')");
  // Anchor AFTER start: onLayout also mentions t.pane.querySelector('.max') far earlier.
  const end = appSrc.indexOf("pane.querySelector('.max').onclick", start);
  assert(start > 0 && end > start, 'copy wiring block located (before the maximize wiring)');
  const block = appSrc.slice(start, end);
  assert(!/role\s*===|video-scout/.test(block), 'no role-conditional branch in the copy path — Video Scout goes through the SAME code');
  assert(block.includes('resolveCopyRequest'), 'copy click resolves through the exported resolveCopyRequest');
  assert(block.includes('term.buffer.active') && block.includes('COPY_OUTPUT_BOUND'), 'reconstruction reads the live xterm buffer under the exported bound');
  assert(block.includes('selectionAtCopyPointerDown = selectedTextInPane() || speakSelectionMemory.peek()'),
    'pointer-down snapshot preserved (selection survives the header-button click)');
  const logs = (block.match(/appendLog\(/g) || []).length;
  const metaLogs = (block.match(/appendLog\(window\.ccTermCopy\.buildCopyLogLine\(/g) || []).length;
  assert(logs > 0 && logs === metaLogs, 'EVERY Logs write in the copy path goes through the metadata-only builder (no text can leak)');
  assert(block.includes('flashCopyBtn(false)') && block.includes('alert('), 'clipboard failure is visible (error flash + alert), never a silent success');
  assert(block.includes('buildTruncationNotice'), 'truncation surfaces the visible notice');
}
assert(/scrollback:\s*5000/.test(appSrc), 'xterm scrollback stays 5000 (no unjustified increase — V1a constraint)');
{
  // Tripwire for the launch-blocking class of bug node tests cannot see: classic renderer
  // <script> files share ONE global scope, and agent-dom.js owns a top-level `const api`.
  // This module must keep its whole body inside the shared-scope-safe IIFE wrapper.
  const modSrc = read('term-copy.js');
  assert(modSrc.includes('((global) => {')
    && modSrc.includes("})(typeof window === 'undefined' ? globalThis : window);")
    && !/^const api\b/m.test(modSrc),
    'term-copy.js is IIFE-wrapped — no top-level const collides in the shared <script> scope');
}
{
  const tcTag = html.indexOf('<script src="term-copy.js">');
  const appTag = html.indexOf('<script src="app.js">');
  assert(tcTag > 0 && appTag > tcTag, 'term-copy.js loads before app.js');
}

process.stdout.write(`\nterm-copy: ${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
