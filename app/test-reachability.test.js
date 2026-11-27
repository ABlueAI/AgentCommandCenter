'use strict';
// Run: node app/test-reachability.test.js
//
// META-TEST: every test file in this repo must be REACHABLE by a standing runner.
// Orphaned suites are this repo's most-repeated failure class — agent-dom + task-name,
// then nav-guard + launchers, then gemini-video-sdk.test.js, then pty-parser +
// video-range-ui (found while building this very test): FIVE files across three
// separate incidents shipped green while nothing executed them. Fixing instances did
// not work; this kills the class.
//
// Reachability contract:
//   app/*.test.js — discovered by run-tests.js, or explicitly skipped with a reason.
//                   A skip that names a Pester wrapper must point to one that runs it.
//   Other *.test.js — run by a Pester wrapper under scripts/.
//   *.Tests.ps1 — checked by the sibling scripts/test-reachability.Tests.ps1, which
//                 also checks that npm test discovers this suite.
//
// Excluded directory names (never descended, matched at any depth):
//   node_modules, .git, .worktrees, vendor, dist, source-material
// (vendor = tracked third-party bundles; source-material = archived browser-transfer
// snapshots under docs/ that contain historical copies of repo files.)

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

let passed = 0, failed = 0;
function assert(cond, label) {
  if (cond) { process.stdout.write(`  ✓ ${label}\n`); passed++; }
  else { process.stderr.write(`  ✗ FAIL: ${label}\n`); failed++; }
}

const REPO_ROOT = path.resolve(__dirname, '..');
const APP_DIR = path.join(REPO_ROOT, 'app');
const SCRIPTS_DIR = path.join(REPO_ROOT, 'scripts');
const EXCLUDED_DIRS = new Set(['node_modules', '.git', '.worktrees', 'vendor', 'dist', 'source-material']);

// Run the real CLI in disposable app trees so these cases never execute repository suites.
function runFixture(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mako test runner '));
  try {
    const app = path.join(root, 'app with spaces');
    fs.mkdirSync(app);
    const runner = path.join(app, 'run-tests.js');
    fs.copyFileSync(path.join(APP_DIR, 'run-tests.js'), runner);
    for (const [relative, source] of Object.entries(files)) {
      const file = path.join(app, ...relative.split('/'));
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, source);
    }
    const result = spawnSync(process.execPath, [runner], { cwd: root, encoding: 'utf8' });
    if (result.error) throw result.error;
    return result;
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

const skippedFixture = { 'renderer/video-model-policy.test.js': 'process.exit(99);' };
const passing = runFixture({
  ...skippedFixture,
  'nested suite/pass case.test.js': "if (require('path').dirname(__dirname) !== process.cwd()) process.exit(91); console.log('PASS MARKER');",
});
assert(passing.status === 0 && /nested suite\/pass case\.test\.js\r?\nPASS MARKER/.test(passing.stdout),
  `runner announces and executes a passing suite with spaces in its path (exit ${passing.status})`);

const failures = runFixture({
  ...skippedFixture,
  'z-later.test.js': "console.log('LATER MARKER');",
  'a-fail.test.js': 'process.exit(7);',
  'b-fail.test.js': 'process.exit(9);',
  'electron-binary.test.js': "console.log('FIRST MARKER');",
});
assert(failures.status === 7, `runner preserves the first failing suite's exit code (got ${failures.status})`);
assert(/Failed test files:[\s\S]*a-fail\.test\.js \(exit 7\)[\s\S]*b-fail\.test\.js \(exit 9\)/.test(failures.stderr),
  'runner names every failed file and its exit code in the final summary');
assert(/electron-binary\.test\.js\r?\nFIRST MARKER[\s\S]*a-fail\.test\.js[\s\S]*b-fail\.test\.js[\s\S]*z-later\.test\.js\r?\nLATER MARKER/.test(failures.stdout),
  'runner runs priority files first, then sorted suites, and continues after failures');

const empty = runFixture({
  ...skippedFixture,
  ...Object.fromEntries([...EXCLUDED_DIRS].map((dir) => [`nested/${dir}/ignored.test.js`, 'process.exit(98);'])),
});
assert(empty.status === 1 && /no test files to run/i.test(empty.stderr),
  'runner refuses a tree with only skipped files and files in excluded directories');

const completelyEmpty = runFixture({});
assert(completelyEmpty.status === 1 && /no test files to run/i.test(completelyEmpty.stderr),
  'runner reports zero files even when the skip list is also stale');

const stale = runFixture({ 'pass.test.js': "console.log('MUST NOT RUN');" });
assert(stale.status === 1 && /stale skip-list entry: renderer\/video-model-policy\.test\.js/i.test(stale.stderr)
  && !stale.stdout.includes('MUST NOT RUN'), 'runner refuses a stale skip-list entry before launching suites');

// Walk the entire repo independently of the app runner to catch suites placed outside its root.
function walk(dir, hits = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory() && !EXCLUDED_DIRS.has(entry.name)) {
      walk(full, hits);
    } else if (entry.isFile() && /(?:\.test\.js|\.Tests\.ps1)$/.test(entry.name)) {
      hits.push(full);
    }
  }
  return hits;
}

// The Node wrappers build $suite with Join-Path and pass it to node. Match the full
// resolved path so a comment or a different suite with the same basename cannot count.
function wrapperTarget(wrapper, source) {
  const body = source.replace(/<#[\s\S]*?#>/g, '');
  if (!/^\s*\$output = cmd \/c "node `"\$suite`" 2>&1"\s*$/m.test(body)) return undefined;
  let expression = body.match(/^\$suite = (.+)$/m)?.[1].trim();
  const parts = [];
  while (expression) {
    const join = /^Join-Path (.+) '([^']+)'$/.exec(expression);
    if (!join) break;
    parts.unshift(join[2].replace(/\\/g, '/'));
    expression = join[1].replace(/^\((.*)\)$/, '$1');
  }
  if (!parts.length) return undefined;
  if (expression === '$here') return path.posix.join(path.posix.dirname(wrapper), ...parts);
  if (expression === '$repoRoot' || expression === 'Split-Path -Parent $here') {
    return path.posix.join(...parts);
  }
}

function unreachableSuites(testJs, appRun, skips, wrappers) {
  const wrapped = new Set(wrappers.values());
  return testJs.filter((file) => {
    if (!file.startsWith('app/')) return !wrapped.has(file);
    const relative = file.slice('app/'.length);
    if (appRun.has(relative)) return false;
    const skip = skips[relative];
    if (!skip || !skip.reason?.trim()) return true;
    return Boolean(skip.wrapper && wrappers.get(skip.wrapper) !== file);
  });
}

const sampleWrapper = 'scripts/example.Tests.ps1';
const sampleSource = [
  String.raw`$suite = Join-Path (Join-Path $repoRoot 'app\nested suite') 'sample.test.js'`,
  '$output = cmd /c "node `"$suite`" 2>&1"',
].join('\r\n');
const sampleSuite = 'app/nested suite/sample.test.js';
assert(wrapperTarget(sampleWrapper, sampleSource) === sampleSuite,
  'reachability resolves the exact path from a Windows-style wrapper');
assert(wrapperTarget(sampleWrapper, sampleSource.replace('$output', '# $output')) === undefined,
  'reachability ignores a wrapper invocation in a comment');
const sampleOrphan = 'app/elsewhere/sample.test.js';
const reasonOnly = 'app/reason-only.test.js';
const sampleUnreachable = unreachableSuites(
  [sampleSuite, sampleOrphan, reasonOnly, 'scripts/sample.test.js'],
  new Set(),
  {
    'nested suite/sample.test.js': { reason: 'Fixture wrapper.', wrapper: sampleWrapper },
    'reason-only.test.js': { reason: 'Fixture skip without a wrapper.' },
  },
  new Map([[sampleWrapper, sampleSuite]]),
);
assert(sampleUnreachable.join(', ') === `${sampleOrphan}, scripts/sample.test.js`,
  'reachability rejects same-basename orphans and accepts explicit skips with a reason');
assert(unreachableSuites(
  [sampleSuite], new Set(),
  { 'nested suite/sample.test.js': { reason: 'Fixture wrapper.', wrapper: sampleWrapper } },
  new Map(),
).length === 1, 'reachability rejects a skip whose declared wrapper no longer runs it');
assert(unreachableSuites(
  [reasonOnly], new Set(), { 'reason-only.test.js': { reason: ' ' } }, new Map(),
).length === 1, 'reachability rejects a skip without a stated reason');

const all = walk(REPO_ROOT);
const rel = (f) => path.relative(REPO_ROOT, f).split(path.sep).join('/');
const testJs = all.filter((f) => f.endsWith('.test.js')).map(rel).sort();
const testPs = all.filter((f) => f.endsWith('.Tests.ps1'));

// Floor guards: a broken walker must fail if it discovers too few suites.
assert(testJs.length >= 20, `discovery floor: found ${testJs.length} *.test.js files (>= 20 expected)`);
assert(testPs.length >= 14, `discovery floor: found ${testPs.length} *.Tests.ps1 files (>= 14 expected)`);

const { getTestFiles, SKIPPED_TESTS } = require('./run-tests');
const files = getTestFiles();
const appRun = new Set(files);
assert(appRun.size === files.length, 'the runner discovers every selected file once');
assert(files[0] === 'electron-binary.test.js', 'the Electron binary check runs first');
const wrappers = new Map(testPs
  .filter((file) => file.startsWith(SCRIPTS_DIR + path.sep) && file !== path.join(SCRIPTS_DIR, 'test-reachability.Tests.ps1'))
  .map((file) => [rel(file), wrapperTarget(rel(file), fs.readFileSync(file, 'utf8'))]));

const unreachable = unreachableSuites(testJs, appRun, SKIPPED_TESTS, wrappers);
assert(unreachable.length === 0,
  unreachable.length === 0
    ? 'every *.test.js is discovered, run by its Pester wrapper, or explicitly skipped with a reason'
    : `UNREACHABLE *.test.js — no runner or valid skip: ${unreachable.join(', ')}`);

assert(fs.existsSync(path.join(SCRIPTS_DIR, 'test-reachability.Tests.ps1')),
  'the sibling scripts/test-reachability.Tests.ps1 meta-suite exists (mutual anti-orphan watchdog)');
assert(require('./package.json').scripts?.test === 'node run-tests.js' && appRun.has('test-reachability.test.js'),
  'npm test invokes the runner directly and discovers this meta-test');

process.stdout.write(`\ntest-reachability: ${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
