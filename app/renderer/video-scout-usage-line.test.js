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
  ['text after the usage fields', `${base} trailing words`],
  ['the marker after other text', 'prefix text [video-scout usage]'],
  ['the marker alone', USAGE_MARKER],
  ['a control character', base.replace('model=', 'model=\u0008')],
  ['a bidirectional override', base.replace('model=gemini', 'model=\u202egemini')],
  ['a zero-width character', base.replace('total=', 'total=\u200b')],
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

{
  // Order: an odd line, then a valid one (still logged), then the cap (its own notice), then odd again.
  const gate = createUsageLogGate();
  assert(typeof gate.consider('[video-scout usage] odd') === 'string', 'order: first odd line gets the notice');
  assert(gate.consider(base) === base + '\n', 'order: a valid line after the odd notice is still logged');
  const rest = [];
  for (let i = 1; i < MAX_USAGE_LINES_PER_PANE + 2; i++) rest.push(gate.consider(base));
  assert(rest.filter((l) => l === base + '\n').length === MAX_USAGE_LINES_PER_PANE - 1 &&
    rest.filter((l) => l && l !== base + '\n').length === 1, 'order: the cap notice is tracked apart from the odd-line notice');
  assert(gate.consider('[video-scout usage] odd again') === null, 'order: the odd-line notice stays once per pane');
}

console.log('the real pane path: PtyParser feeding the gate');
{
  const { PtyParser } = require('./pty-parser');
  const run = (chunks) => {
    const gate = createUsageLogGate();
    const out = [];
    const parser = new PtyParser((ev) => {
      if (!ev.partial && ev.text) { const l = gate.consider(ev.text); if (l) out.push(l); }
    });
    for (const c of chunks) parser.feed(c);
    parser.flush();
    return out;
  };
  const ESC = String.fromCharCode(0x1b);
  const wire = ESC + '[0m' + base + ESC + '[K' + '\r\n';
  const cut = wire.indexOf('usage');
  const out = run(['analysis line one\r\n', wire.slice(0, cut), wire.slice(cut)]);
  assert(out.length === 1 && out[0] === base + '\n',
    'a colour-wrapped CRLF usage line split inside the marker reaches Logs exactly as printed');
  // Pins today's behaviour for a cursor-forward code in place of a space: the parser drops it, the
  // line no longer matches, and the fixed notice shows instead. A parser change shows up here.
  const moved = run([base.replace(' output=', ESC + '[1Coutput=') + '\r\n']);
  assert(moved.length === 1 && moved[0] !== base + '\n' && !moved[0].includes('prompt='),
    'a cursor-forward code inside the line gives the fixed notice (current parser behaviour)');
}

console.log('the module loads beside the other classic scripts');
{
  const vm = require('vm');
  const ctx = vm.createContext({ window: {}, document: { createElement: () => ({}) } });
  let error = null;
  try {
    vm.runInContext(fs.readFileSync(path.join(__dirname, 'video-scout-usage-line.js'), 'utf8'), ctx, { filename: 'video-scout-usage-line.js' });
    vm.runInContext(fs.readFileSync(path.join(__dirname, 'agent-dom.js'), 'utf8'), ctx, { filename: 'agent-dom.js' });
  } catch (err) { error = err; }
  assert(error === null, `no top-level name clash with agent-dom.js in one shared script scope${error ? ` (${error.message})` : ''}`);
  assert(typeof ctx.window.ccVideoScoutUsage?.createUsageLogGate === 'function', 'the browser global is set');
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

process.stdout.write(`\nvideo-scout-usage-line.test.js: ${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
