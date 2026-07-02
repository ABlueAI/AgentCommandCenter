'use strict';
// Run: node app/renderer/pty-parser.test.js
//
// Plain Node.js — no test framework, no build step.
// Exit 0 = all pass. Exit 1 = at least one failure.

const { PtyParser, stripAnsi, isChrome } = require('./pty-parser');

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    process.stdout.write(`  ✓ ${label}\n`);
    passed++;
  } else {
    process.stderr.write(`  ✗ FAIL: ${label}\n`);
    failed++;
  }
}

// Collect only completed (non-partial) events from feeding chunks through a parser.
function collect(...chunks) {
  const events = [];
  const p = new PtyParser((e) => events.push(e));
  for (const c of chunks) p.feed(c);
  p.flush();
  return events.filter((e) => !e.partial);
}

// Collect ALL events including partials.
function collectAll(...chunks) {
  const events = [];
  const p = new PtyParser((e) => events.push(e));
  for (const c of chunks) p.feed(c);
  p.flush();
  return events;
}

function types(...chunks) { return collect(...chunks).map((e) => e.type); }
function texts(...chunks) { return collect(...chunks).map((e) => e.text); }

// ── Section helpers ───────────────────────────────────────────────────────────
function section(name) { process.stdout.write(`\n${name}\n`); }

// ══════════════════════════════════════════════════════════════════════════════
section('stripAnsi');
// ══════════════════════════════════════════════════════════════════════════════

assert(stripAnsi('\x1b[32mhello\x1b[0m') === 'hello',
  'strips CSI color codes');

assert(stripAnsi('\x1b[?25l\x1b[2Jhello') === 'hello',
  'strips cursor-hide and clear-screen CSI');

assert(stripAnsi('\x1b]0;window title\x07plain') === 'plain',
  'strips OSC window-title sequence (BEL terminator)');

assert(stripAnsi('\x1b]8;;https://example.com\x1b\\link\x1b]8;;\x1b\\') === 'link',
  'strips OSC hyperlink (ST terminator)');

assert(stripAnsi('\x1bMback') === 'back',
  'strips two-char ESC M sequence');

assert(stripAnsi('no escapes') === 'no escapes',
  'leaves plain text untouched');

assert(stripAnsi('') === '',
  'handles empty string');

// ══════════════════════════════════════════════════════════════════════════════
section('isChrome');
// ══════════════════════════════════════════════════════════════════════════════

assert(isChrome(''),           'empty string is chrome');
assert(isChrome('   '),        'whitespace-only is chrome');
assert(isChrome('⠋⠙⠹'),        'braille-only is chrome (spinner)');
assert(isChrome('⠹ Running bash...'), 'line starting with braille is chrome even with text');
assert(isChrome('─────────────────────'), 'all-box-drawing is chrome');
assert(isChrome('╭───────────────────╮'), 'box border row is chrome');
assert(isChrome('>'),          'bare prompt > is chrome');
assert(isChrome('1024 tokens'), 'token count line is chrome');
assert(isChrome('1,024 tokens'), 'comma-formatted token count is chrome');
assert(isChrome('cost: $0.03'), 'cost line is chrome');
assert(isChrome('(Esc to interrupt)'), 'interrupt hint is chrome');
assert(isChrome('(ctrl-c to cancel)'), 'ctrl-c hint is chrome');

assert(!isChrome('Hello, world!'),          'normal text is not chrome');
assert(!isChrome('⎿  Read /path/to/file'),  '⎿ tool call is not chrome');
assert(!isChrome('│ some result line │'),   'bordered result line is not chrome');
assert(!isChrome('# Section header'),       'markdown heading is not chrome');
assert(!isChrome('- list item'),            'markdown list item is not chrome');

// ══════════════════════════════════════════════════════════════════════════════
section('Basic assistant text');
// ══════════════════════════════════════════════════════════════════════════════

assert(types('Hello, world!\n')[0] === 'assistant',
  'plain text line → assistant');

assert(texts('Hello, world!\n')[0] === 'Hello, world!',
  'text is preserved exactly (trimmed)');

assert(types('# Heading\n')[0] === 'assistant',
  'markdown heading → assistant');

assert(types('- list item\n')[0] === 'assistant',
  'markdown list item → assistant');

assert(types('1. numbered item\n')[0] === 'assistant',
  'numbered list item → assistant');

// Closing ``` has no letters → 'unclassified' (correct — still rendered, not dropped).
// The invariant is that nothing from a code block is silently discarded.
const codeFenceEvts = collect('```js\nconst x = 1;\n```\n');
assert(codeFenceEvts.length === 3,
  'code fence: 3 content events (nothing dropped)');
assert(codeFenceEvts.every((e) => e.type !== 'ui_chrome'),
  'code fence: no event is chrome-suppressed');

// ══════════════════════════════════════════════════════════════════════════════
section('ANSI-wrapped assistant text');
// ══════════════════════════════════════════════════════════════════════════════

assert(types('\x1b[1mBold response\x1b[0m\n')[0] === 'assistant',
  'bold-escaped text → assistant');

assert(texts('\x1b[32mGreen text\x1b[0m\n')[0] === 'Green text',
  'ANSI stripped before emit');

// ══════════════════════════════════════════════════════════════════════════════
section('Tool call detection');
// ══════════════════════════════════════════════════════════════════════════════

assert(types('⎿  Read /path/to/file.js\n')[0] === 'tool_call',
  '⎿-prefixed line → tool_call');

assert(texts('⎿  Read /path/to/file.js\n')[0] === '⎿  Read /path/to/file.js',
  'tool_call text preserved (including ⎿)');

assert(types('⎿  Bash(echo hello)\n')[0] === 'tool_call',
  '⎿ Bash() → tool_call');

assert(types('⎿  Write /out/report.md\n')[0] === 'tool_call',
  '⎿ Write → tool_call');

// ══════════════════════════════════════════════════════════════════════════════
section('Tool result state');
// ══════════════════════════════════════════════════════════════════════════════

const trEvts = collect(
  '⎿  Read /path/to/file.js\n',
  'line 1 of result\n',
  'line 2 of result\n',
);
assert(trEvts[0].type === 'tool_call',    'first event is tool_call');
assert(trEvts[1].type === 'tool_result',  'line after tool_call → tool_result');
assert(trEvts[2].type === 'tool_result',  'second result line → tool_result');
assert(trEvts[1].text === 'line 1 of result', 'tool_result text preserved');

// ══════════════════════════════════════════════════════════════════════════════
section('State reset: tool_result → assistant after chrome separator');
// ══════════════════════════════════════════════════════════════════════════════

const resetEvts = collect(
  '⎿  Bash(ls)\n',
  'file.txt\n',          // tool_result
  '─────────────\n',     // chrome → resets state
  'Back to assistant.\n', // should be assistant now
);
assert(resetEvts[0].type === 'tool_call',    'tool_call');
assert(resetEvts[1].type === 'tool_result',  'tool_result');
assert(resetEvts[2].type === 'assistant',    'after chrome separator → assistant');

// ══════════════════════════════════════════════════════════════════════════════
section('Chrome suppression');
// ══════════════════════════════════════════════════════════════════════════════

assert(types('\n')[0] === undefined,               'empty line → no event');
assert(types('⠋⠙⠹\n')[0] === undefined,            'spinner line → no event');
assert(types('╭─────────────╮\n')[0] === undefined, 'box border → no event');
assert(types('⠹ Running bash...\n')[0] === undefined, 'spinner+text status → no event');
assert(types('1024 tokens\n')[0] === undefined,     'token count → no event');

// Chrome between content lines doesn't bleed into adjacent events
const chromeBetween = collect(
  'First line.\n',
  '⠋⠙⠹\n',
  'Second line.\n',
);
assert(chromeBetween.length === 2,                'two content events, chrome dropped');
assert(chromeBetween[0].type === 'assistant',     'first → assistant');
assert(chromeBetween[1].type === 'assistant',     'second → assistant');

// ══════════════════════════════════════════════════════════════════════════════
section('CR (carriage return) / spinner overwrite handling');
// ══════════════════════════════════════════════════════════════════════════════

// Spinner animations overwrite using \r: "⠋ loading\r⠙ loading\r⠹ done\n"
// After last-CR-segment logic we keep "⠹ done" which starts with braille → chrome.
const crEvents = collect('⠋ loading\r⠙ loading\r⠹ done\n');
assert(crEvents.length === 0, 'spinner animation (CR overwrite) → no events');

// A \r followed by real content keeps only the last overwrite
const crContent = collect('old content\rnew content\n');
assert(crContent[0].text === 'new content', 'last CR segment wins');

// CRLF (\r\n) — standard Windows line ending — treated as a plain newline
const crlfEvents = collect('Windows line\r\n');
assert(crlfEvents[0].text === 'Windows line', 'CRLF treated as newline');
assert(crlfEvents[0].type === 'assistant',    'CRLF content → assistant');

// ══════════════════════════════════════════════════════════════════════════════
section('Border strip (│ box around tool output)');
// ══════════════════════════════════════════════════════════════════════════════

assert(texts('│ result content │\n')[0] === 'result content',
  '│ borders stripped, content kept');

assert(types('│ result content │\n')[0] === 'tool_result' ||
       types('│ result content │\n')[0] === 'unclassified' ||
       types('│ result content │\n')[0] === 'assistant',
  '│-bordered line emits some content event (not dropped)');

// ══════════════════════════════════════════════════════════════════════════════
section('Unclassified (graceful degradation)');
// ══════════════════════════════════════════════════════════════════════════════

// A lone "$" or "→" is not chrome but has no letters → unclassified
assert(types('$\n')[0] === 'unclassified',
  'bare $ → unclassified (not dropped)');

assert(types('→\n')[0] === 'unclassified',
  'lone arrow → unclassified (not dropped)');

// A hypothetical future Claude Code marker we don't know yet
assert(types('⊕ agent handoff\n')[0] !== undefined,
  'unknown future marker → not silently dropped');

// ══════════════════════════════════════════════════════════════════════════════
section('Chunked / streaming input');
// ══════════════════════════════════════════════════════════════════════════════

// Same content fed as whole vs. individual characters should produce same result.
const wholeEvt   = collect('Hello, agent!\n');
const chunkedEvt = collect(...'Hello, agent!\n'.split(''));
assert(wholeEvt[0].text === chunkedEvt[0].text,   'chunked text matches whole');
assert(wholeEvt[0].type === chunkedEvt[0].type,   'chunked type matches whole');

// ══════════════════════════════════════════════════════════════════════════════
section('Partial events during streaming');
// ══════════════════════════════════════════════════════════════════════════════

// Feed characters one at a time; partial events should appear before the \n.
const partials = [];
const fullEvts = [];
const streamer = new PtyParser((e) => {
  if (e.partial) partials.push(e);
  else fullEvts.push(e);
});
for (const ch of 'Assistant reply.\n') streamer.feed(ch);
streamer.flush();

assert(partials.length > 0,  'partial events emitted during streaming');
assert(fullEvts.length === 1, 'one complete event on newline');
assert(fullEvts[0].text === 'Assistant reply.', 'complete event text correct');
assert(fullEvts[0].partial === false,  'complete event has partial=false');
assert(partials[0].partial === true,   'partial events have partial=true');
assert(partials[0].type === 'assistant', 'partial events have correct type');

// No partial events emitted for chrome content (spinners shouldn't appear live)
const noChromeParts = [];
const chromeParter = new PtyParser((e) => { if (e.partial) noChromeParts.push(e); });
for (const ch of '⠋⠙⠹\n') chromeParter.feed(ch);
assert(noChromeParts.length === 0, 'no partial events for spinner-only content');

// ══════════════════════════════════════════════════════════════════════════════
section('flush() on PTY exit');
// ══════════════════════════════════════════════════════════════════════════════

// Content with no trailing newline should be emitted by flush().
const flushed = [];
const fp = new PtyParser((e) => { if (!e.partial) flushed.push(e); });
fp.feed('No trailing newline');
fp.flush();
assert(flushed.length === 1,             'flush emits buffered content');
assert(flushed[0].text === 'No trailing newline', 'flush text correct');

// Calling flush() a second time should not re-emit.
fp.flush();
assert(flushed.length === 1, 'double-flush does not re-emit');

// ══════════════════════════════════════════════════════════════════════════════
section('No throws on adversarial / garbage input');
// ══════════════════════════════════════════════════════════════════════════════

function noThrow(label, fn) {
  try { fn(); assert(true, label); }
  catch (e) { assert(false, `${label} — threw: ${e.message}`); }
}

noThrow('empty string feed',    () => collect(''));
noThrow('null-ish byte in stream', () => collect('\x00\x01\x02\n'));
noThrow('very long line',       () => collect('x'.repeat(100_000) + '\n'));
noThrow('only ANSI codes',      () => collect('\x1b[32m\x1b[0m\n'));
noThrow('UTF-8 multibyte',      () => collect('日本語テスト\n'));
noThrow('mixed emoji',          () => collect('Done! 🎉\n'));
noThrow('only newlines',        () => collect('\n\n\n\n'));
noThrow('constructor rejects non-function', () => {
  try { new PtyParser('not a function'); assert(false, 'should throw'); }
  catch { /* expected */ }
});

// ══════════════════════════════════════════════════════════════════════════════
section('Multi-tool sequence');
// ══════════════════════════════════════════════════════════════════════════════

// Realistic sequence: assistant text → tool → result → separator → assistant → tool → result
const seq = collect(
  "I'll read that file for you.\n",
  '⎿  Read /src/main.js\n',
  'const x = 1;\n',
  'const y = 2;\n',
  '────────\n',                        // chrome separator → resets to assistant
  'Now let me run a check.\n',
  '⎿  Bash(npm test)\n',
  'All tests passed.\n',
);
assert(seq[0].type === 'assistant',    's0: assistant pre-tool text');
assert(seq[1].type === 'tool_call',    's1: first tool call');
assert(seq[2].type === 'tool_result',  's2: tool result line 1');
assert(seq[3].type === 'tool_result',  's3: tool result line 2');
assert(seq[4].type === 'assistant',    's4: assistant text after separator');
assert(seq[5].type === 'tool_call',    's5: second tool call');
assert(seq[6].type === 'tool_result',  's6: second tool result');

// ══════════════════════════════════════════════════════════════════════════════
section('Interleaving: partial/complete boundaries across type transitions');
// ══════════════════════════════════════════════════════════════════════════════

// When streaming char-by-char, the complete assistant event must arrive
// before any subsequent tool_call event — no type bleed across the boundary.
{
  const all = [];
  const p = new PtyParser((e) => all.push(e));
  for (const ch of "I'll check that.\n") p.feed(ch);
  for (const ch of '⎿  Read /src/x.js\n') p.feed(ch);
  p.flush();

  const completes = all.filter((e) => !e.partial);
  assert(completes[0] && completes[0].type === 'assistant',
    'interleave: complete assistant fires before tool_call');
  assert(completes[1] && completes[1].type === 'tool_call',
    'interleave: tool_call follows complete assistant (no bleed)');
  const aPartials = all.filter((e) => e.partial);
  assert(aPartials.every((e) => e.type === 'assistant'),
    'interleave: all partials during assistant phase are type assistant');
}

// Full streamed sequence, char-by-char: assistant → tool → result → assistant
{
  const completes = [];
  const p = new PtyParser((e) => { if (!e.partial) completes.push(e); });
  for (const ch of "Let me look.\n") p.feed(ch);
  for (const ch of '⎿  Read /src/x.js\n') p.feed(ch);
  for (const ch of 'const x = 1;\n') p.feed(ch);
  for (const ch of '────────\n') p.feed(ch);
  for (const ch of "Done.\n") p.feed(ch);
  p.flush();

  assert(completes[0] && completes[0].type === 'assistant',   'streamed-seq s0: assistant');
  assert(completes[1] && completes[1].type === 'tool_call',   'streamed-seq s1: tool_call');
  assert(completes[2] && completes[2].type === 'tool_result', 'streamed-seq s2: tool_result');
  assert(completes[3] && completes[3].type === 'assistant',   'streamed-seq s3: assistant resumes after separator');
}

// Partials emitted mid tool_result carry tool_result type — not assistant.
{
  const partials = [];
  const p = new PtyParser((e) => { if (e.partial) partials.push(e); });
  p.feed("Checking.\n");       // complete assistant — no partials emitted
  p.feed('⎿  Bash(ls)\n');    // complete tool_call — state flips to TOOL_RESULT
  for (const ch of 'file.txt') p.feed(ch); // partial mid-line in TOOL_RESULT state

  const trPartials = partials.filter((e) => e.type === 'tool_result');
  assert(trPartials.length > 0,
    'partial during tool_result phase carries type=tool_result');
  assert(!partials.some((e) => e.type === 'assistant'),
    'no assistant-typed partials after state flips to tool_result');
}

// flush() after a partial cleanly finalises the in-progress bubble, then the
// parser is ready for fresh content — simulates a mid-stream interrupt/new prompt.
{
  const evts = [];
  const p = new PtyParser((e) => { if (!e.partial) evts.push(e); });
  p.feed('half-written');    // partial assistant, no \n yet
  p.flush();                 // force-complete (PTY exit or interrupt)
  p.feed("New line.\n");     // new content after the flush
  p.flush();

  assert(evts[0] && evts[0].text === 'half-written',
    'flush+resume: interrupted partial is finalised on flush');
  assert(evts[1] && evts[1].text === 'New line.',
    'flush+resume: content after flush is independent complete event');
  assert(evts.length === 2,
    'flush+resume: exactly two complete events');
}

// ══════════════════════════════════════════════════════════════════════════════
// Results
// ══════════════════════════════════════════════════════════════════════════════

process.stdout.write(`\n${passed + failed} tests: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
