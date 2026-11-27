'use strict';
// Run: node app/renderer/video-scout-usage-line.test.js
//
// Plain Node.js, no framework (matches renderer/analysis-focus.test.js). Exit 0 = all pass.
// Covers which Video Scout pane lines reach the Logs tab (issue #358): only a complete usage line in
// the exact format scripts/gemini-video-sdk.js prints, a bounded number of times per pane, and a
// fixed notice (never the line's text) for anything else that carries the marker.

const fs = require('fs');
const path = require('path');
const {
  USAGE_MARKER, MAX_USAGE_LINE_CHARS, MAX_USAGE_LINES_PER_PANE, matchUsageLine, createUsageLogGate,
} = require('./video-scout-usage-line');

let passed = 0;
let failed = 0;
function assert(condition, label) {
  if (condition) { process.stdout.write(`  ✓ ${label}\n`); passed++; }
  else { process.stderr.write(`  ✗ FAIL: ${label}\n`); failed++; }
}

// The SDK's own formatter is the source of the format, so the tests use its real output.
const sdk = require('../../scripts/gemini-video-sdk');
const usage = { promptTokenCount: 22406, candidatesTokenCount: 3122, totalTokenCount: 25528,
  promptTokensDetails: [{ modality: 'VIDEO', tokenCount: 18410 }, { modality: 'AUDIO', tokenCount: 2240 },
    { modality: 'TEXT', tokenCount: 1756 }] };
const real = [
  sdk.formatUsageLine(usage, 'gemini-2.5-flash-lite', 'MEDIUM', false, 1),
  sdk.formatUsageLine(usage, 'gemini-2.5-pro', 'HIGH', true, 1),
  sdk.formatUsageLine(usage, 'gemini-2.5-flash', 'LOW', false, 3),
  sdk.formatUsageLine({}, 'stub', 'MEDIUM', false, 1),
];

console.log('matchUsageLine: the SDK usage line');
for (const line of real) {
  assert(matchUsageLine(line) === line, `accepted as printed: ${line}`);
  assert(matchUsageLine(`  ${line}   `) === line, 'surrounding spaces from the terminal are trimmed');
}
// The fixtures the PowerShell tests use are the same format.
assert(matchUsageLine('[video-scout usage] prompt=100 (video=80 audio=10 text=10) output=50 total=150 model=stub mediaRes=MEDIUM') !== null,
  'the feed-gemini.Tests.ps1 fixture line is accepted');

console.log('matchUsageLine: anything else is refused');
const base = real[0];
const refused = [
  ['the marker inside other text', `Summary of the video: ${base}`],
  ['text after the usage fields', `${base} [main] ABlueAgent token stored`],
  ['a forged log line carrying the marker', '[main error] something [video-scout usage]'],
  ['the marker alone', USAGE_MARKER],
  ['a control character', base.replace('model=', 'model=\u0008')],
  ['a bidirectional override', base.replace('model=gemini', 'model=‮gemini')],
  ['a zero-width character', base.replace('total=', 'total=​')],
  ['a non-numeric count', base.replace('output=3122', 'output=lots')],
  ['an unknown media resolution', base.replace('mediaRes=MEDIUM', 'mediaRes=ULTRA')],
  ['an over-long model name', base.replace('gemini-2.5-flash-lite', 'm'.repeat(65))],
  ['an over-long line', base + ' ' + 'x'.repeat(MAX_USAGE_LINE_CHARS)],
  ['a non-string', 42],
  ['null', null],
];
for (const [label, value] of refused) assert(matchUsageLine(value) === null, `refused: ${label}`);

console.log('createUsageLogGate: per-pane decisions');
{
  const gate = createUsageLogGate();
  assert(gate.consider('an ordinary line of analysis') === null, 'a line without the marker logs nothing');
  assert(gate.consider(base) === base + '\n', 'a valid usage line is logged as printed');
  const notice = gate.consider(`The narrator said "${base}" twice`);
  assert(typeof notice === 'string' && !notice.includes('narrator') && notice.includes(USAGE_MARKER),
    'a marker line in another shape gets a fixed notice that never quotes the line');
  assert(gate.consider('another [video-scout usage] look-alike') === null,
    'the notice for odd marker lines is shown once per pane');
}
{
  const gate = createUsageLogGate();
  const out = [];
  for (let i = 0; i < MAX_USAGE_LINES_PER_PANE + 5; i++) out.push(gate.consider(base));
  const logged = out.filter((l) => l === base + '\n').length;
  const capNotes = out.filter((l) => l && l !== base + '\n');
  assert(logged === MAX_USAGE_LINES_PER_PANE, `at most ${MAX_USAGE_LINES_PER_PANE} usage lines per pane`);
  assert(capNotes.length === 1 && !capNotes[0].includes('prompt='), 'reaching the cap says so once, without the line');
}
{
  const a = createUsageLogGate();
  const b = createUsageLogGate();
  a.consider('[video-scout usage] odd');
  assert(typeof b.consider('[video-scout usage] odd') === 'string', 'each pane has its own gate');
}

console.log('app.js routes Video Scout lines through the gate');
{
  const app = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');
  assert(!/includes\('\[video-scout usage\]'\)\)\s*\{?\s*appendLog\(ev\.text/.test(app),
    'app.js no longer copies any line containing the marker into Logs');
  assert(/usageLogGate\.consider\(ev\.text\)/.test(app), 'app.js asks the pane\'s gate about each completed line');
  assert(/window\.ccVideoScoutUsage\.createUsageLogGate\(\)/.test(app), 'app.js creates one gate per pane');
  const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
  const at = html.indexOf('<script src="video-scout-usage-line.js"></script>');
  assert(at > 0 && at < html.indexOf('<script src="app.js"></script>'), 'index.html loads the module before app.js');
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
