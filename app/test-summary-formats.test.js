'use strict';
// Run: node app/test-summary-formats.test.js
//
// EVERY SUITE'S SUMMARY IS COUNTED — Binding Amendment A § 3.
//
// The app gate's assertion total is reconciled by reading each suite's summary line. That only works
// if every summary line is in a shape the reconciliation knows about. A suite written in a NEW shape
// would run, pass, and then contribute ZERO to the reported total — the total would look stable while
// assertions quietly went missing from it.
//
// THIS IS NOT HYPOTHETICAL. The previous handoff described the gate as "74 suites emitting
// `name: N passed, M failed` plus 2 emitting `N assertions passed`". Measured, the repository has
// FIVE output shapes, not two, and 16 of those 74 suites print no name at all. The TOTAL that handoff
// reported was right; its description of how the total was reached was wrong, which is exactly the
// condition under which a future suite goes missing without anyone noticing.
//
// THE FIVE SHAPES, as they actually appear on stdout:
//
//   A  `${name}: ${passed} passed, ${failed} failed`                 template literal, named
//   B  name + ': ' + passed + ' passed, ' + failed + ' failed'       concatenation, named
//   C  `${basename}: ${n} assertions passed`                         named, no failure counter
//   D  `${passed} passed, ${failed} failed`                          ANONYMOUS — no suite name
//   E  `${passed + failed} tests: ${passed} passed, ${failed} failed` ANONYMOUS — a count, not a name
//
// A and B are indistinguishable in the OUTPUT and are counted by one rule. D and E are the dangerous
// ones: a reconciliation that anchors on a suite NAME cannot attribute them, and one that anchors on
// `<something>: N passed` silently reads E's "17 tests" as a suite called "17 tests" and misses D
// entirely. Both sets are pinned by name below so a sixth shape, or a sixth anonymous suite, is a
// deliberate edit here rather than a silent drift in the arithmetic.

const fs = require('fs');
const path = require('path');

let passed = 0, failed = 0;
function assert(cond, label) {
  if (cond) { process.stdout.write(`  ✓ ${label}\n`); passed++; }
  else { process.stderr.write(`  ✗ FAIL: ${label}\n`); failed++; }
}

const APP_DIR = __dirname;
const pkg = JSON.parse(fs.readFileSync(path.join(APP_DIR, 'package.json'), 'utf8'));
const segments = pkg.scripts.test.split('&&').map((s) => s.trim()).filter(Boolean);
const suites = segments
  .map((s) => s.replace(/^node\s+/, '').trim())
  .filter((s) => s.endsWith('.test.js'));

// Source-shape rules, most specific first. Order matters: E's line also satisfies A's pattern.
const SHAPE_E = /\$\{\s*passed\s*\+\s*failed\s*\}\s*tests:/;
const SHAPE_C = /assertions passed/;
const SHAPE_D = /['"`]\\n\$\{[A-Za-z_$][\w$]*\}\s*passed,\s*\$\{[A-Za-z_$][\w$]*\}\s*failed/;
const SHAPE_A = /\$\{[A-Za-z_$][\w$]*\}\s*passed,\s*\$\{[A-Za-z_$][\w$]*\}\s*failed/;
const SHAPE_B = /['"]\s*passed,\s*['"]\s*\+\s*[A-Za-z_$][\w$]*\s*\+\s*['"]\s*failed/;

/**
 * The SUMMARY LINE a suite emits — the last emitter that reports a count.
 *
 * Classify the LINE, not the file. A suite's prose legitimately discusses summary shapes (this one
 * does, at length), and matching the whole source would make every such file look like whichever
 * shape it happens to describe first. Both emitters are in use: process.stdout.write in most suites,
 * console.log in the two oldest.
 */
function summaryLine(src) {
  const lines = src.split(/\r?\n/).filter((l) => (l.indexOf('process.stdout.write') !== -1 || l.indexOf('console.log') !== -1)
    && (/passed/.test(l) || /assertions/.test(l)));
  return lines.length ? lines[lines.length - 1] : '';
}

function classify(line) {
  if (SHAPE_C.test(line)) return 'C';
  if (SHAPE_E.test(line)) return 'E';
  if (SHAPE_D.test(line)) return 'D';
  if (SHAPE_A.test(line)) return 'A';
  if (SHAPE_B.test(line)) return 'B';
  return 'NONE';
}

// PINNED. These suites print NO suite name, so a name-anchored reconciliation cannot see them.
const SHAPE_C_SUITES = [
  'renderer/audio-module-health.test.js',
  'renderer/tts-audio-contract.test.js',
];
const SHAPE_D_SUITES = [
  'nav-guard.test.js',
  'launchers.test.js',
  'video-scout-args.test.js',
  'task-name.test.js',
  'renderer/agent-dom.test.js',
  'renderer/video-range-ui.test.js',
];
const SHAPE_E_SUITES = [
  'renderer/pty-parser.test.js',
  'renderer/tts-selection.test.js',
  'renderer/tts-device-config.test.js',
  'renderer/tts-bootstrap.test.js',
  'renderer/tts.test.js',
  'renderer/stt-env-config.test.js',
  'renderer/stt-bootstrap.test.js',
  'renderer/stt-audio-quality.test.js',
  'renderer/stt-target-lock.test.js',
  'renderer/stt.test.js',
];

process.stdout.write('\nevery registered suite emits a summary the reconciliation can count\n');
{
  assert(suites.length > 0, `the gate registers suites (${suites.length})`);
  assert(suites.length === segments.length,
    `every gate segment is a suite file (${suites.length} of ${segments.length})`);

  const byShape = { A: [], B: [], C: [], D: [], E: [], NONE: [] };
  for (const rel of suites) {
    const abs = path.join(APP_DIR, rel);
    assert(fs.existsSync(abs), `${rel} exists`);
    byShape[classify(summaryLine(fs.readFileSync(abs, 'utf8')))].push(rel);
  }

  // THE ASSERTION THAT MATTERS. A suite whose summary matches nothing contributes zero and would
  // otherwise vanish from the total without a word.
  assert(byShape.NONE.length === 0,
    byShape.NONE.length === 0
      ? 'NO suite uses an uncounted summary shape'
      : `these suites use an UNCOUNTED summary shape and would silently contribute zero: ${byShape.NONE.join(', ')}`);

  for (const k of ['A', 'B', 'C', 'D', 'E']) {
    process.stdout.write(`      shape ${k}: ${String(byShape[k].length).padStart(2)} suites\n`);
  }
  const counted = byShape.A.length + byShape.B.length + byShape.C.length + byShape.D.length + byShape.E.length;
  assert(counted === suites.length, 'the five shapes account for every registered suite, none double-counted');

  const pins = [['C', SHAPE_C_SUITES], ['D', SHAPE_D_SUITES], ['E', SHAPE_E_SUITES]];
  for (const [shape, pinned] of pins) {
    assert(JSON.stringify(byShape[shape].slice().sort()) === JSON.stringify(pinned.slice().sort()),
      `the shape-${shape} suites are exactly the pinned set (found ${byShape[shape].length}: ${JSON.stringify(byShape[shape])})`);
    for (const rel of pinned) assert(suites.indexOf(rel) !== -1, `${rel} is still registered in the gate`);
  }

  // The named majority really is named — otherwise "anonymous" would not be a meaningful category.
  assert(byShape.A.length > 0 && byShape.B.length > 0,
    `both named shapes are in use (A=${byShape.A.length}, B=${byShape.B.length})`);
  assert(byShape.D.length + byShape.E.length === 16,
    `16 suites print NO suite name — the ones a name-anchored reconciliation cannot attribute (${byShape.D.length + byShape.E.length})`);
}

process.stdout.write('\nthe OUTPUT rules a reconciliation must use, and what each one traps\n');
{
  // These are the patterns that have to be applied to gate STDOUT, in this order.
  const OUT_E = /^(\d+)\s+tests:\s+(\d+)\s+passed,\s+(\d+)\s+failed$/;
  const OUT_D = /^(\d+)\s+passed,\s+(\d+)\s+failed$/;
  const OUT_C = /^(.+?):\s+(\d+)\s+assertions passed$/;
  const OUT_AB = /^(.+?):\s+(\d+)\s+passed,\s+(\d+)\s+failed$/;

  const lineA = 'pane-status-removal: 78 passed, 0 failed';
  const lineB = 'admission-process-cas: 16 passed, 0 failed';
  const lineC = 'tts-audio-contract.test.js: 9 assertions passed';
  const lineD = '61 passed, 0 failed';
  const lineE = '17 tests: 17 passed, 0 failed';

  assert(OUT_AB.test(lineA) && OUT_AB.exec(lineA)[2] === '78', 'shape A output parses to its count');
  assert(OUT_AB.test(lineB) && OUT_AB.exec(lineB)[2] === '16', 'shape B output parses to its count');
  assert(OUT_C.test(lineC) && OUT_C.exec(lineC)[2] === '9', 'shape C output parses to its count');
  assert(OUT_D.test(lineD) && OUT_D.exec(lineD)[1] === '61', 'shape D output parses to its count');
  assert(OUT_E.test(lineE) && OUT_E.exec(lineE)[2] === '17', 'shape E output parses to its count');

  // THE TWO TRAPS, as negative controls.
  assert(!OUT_AB.test(lineD),
    'TRAP 1: the named rule does NOT match shape D — anchoring on a name loses those suites entirely');
  assert(OUT_AB.test(lineE) && OUT_AB.exec(lineE)[1] === '17 tests',
    'TRAP 2: the named rule DOES match shape E, and reads "17 tests" as if it were a suite name');
  assert(OUT_E.exec(lineE)[2] === OUT_AB.exec(lineE)[2],
    '  — the COUNT it takes happens to be right, which is why the wrong description survived so long');

  const invented = 'x: 12 checks OK';
  assert(![OUT_AB, OUT_C, OUT_D, OUT_E].some((re) => re.test(invented)),
    'NEGATIVE CONTROL: an invented sixth shape matches NOTHING, which is what makes it fail visibly above');
}

process.stdout.write(`\ntest-summary-formats: ${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
