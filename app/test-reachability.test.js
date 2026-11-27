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
//   *.test.js   — reachable when its app-relative path appears in app/package.json's
//                 "test" script, OR its basename is referenced by a *.Tests.ps1 wrapper
//                 under scripts/ (the K5 pattern: run-pester executes the Node suite).
//   *.Tests.ps1 — checked by the sibling scripts/test-reachability.Tests.ps1 (run-pester
//                 auto-discovers recursively under scripts/, so "reachable" = "inside
//                 that root"); this file only verifies that sibling EXISTS, so the two
//                 meta-tests watch each other and neither can become the next orphan.
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

const stale = runFixture({ 'pass.test.js': "console.log('MUST NOT RUN');" });
assert(stale.status === 1 && /stale skip-list entry: renderer\/video-model-policy\.test\.js/i.test(stale.stderr)
  && !stale.stdout.includes('MUST NOT RUN'), 'runner refuses a stale skip-list entry before launching suites');

// Manual walk: skips excluded names BEFORE descending (never enters node_modules — this
// also keeps the walk out of the app/node_modules junction) and never follows links.
function walk(dir, hits) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return hits; }
  for (const e of entries) {
    if (e.isSymbolicLink()) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (!EXCLUDED_DIRS.has(e.name)) walk(full, hits);
    } else if (/\.test\.js$/.test(e.name) || /\.Tests\.ps1$/.test(e.name)) {
      hits.push(full);
    }
  }
  return hits;
}

const all = walk(REPO_ROOT, []);
const rel = (f) => path.relative(REPO_ROOT, f).split(path.sep).join('/');
const testJs = all.filter((f) => /\.test\.js$/.test(f));
const testPs = all.filter((f) => /\.Tests\.ps1$/.test(f));

// Floor guards: a silently-broken walker must not pass by discovering nothing.
assert(testJs.length >= 20, `discovery floor: found ${testJs.length} *.test.js files (>= 20 expected)`);
assert(testPs.length >= 14, `discovery floor: found ${testPs.length} *.Tests.ps1 files (>= 14 expected)`);

const pkg = JSON.parse(fs.readFileSync(path.join(APP_DIR, 'package.json'), 'utf8'));
const testScript = (pkg.scripts && pkg.scripts.test) || '';
assert(testScript.length > 0, 'app/package.json has a "test" script to check against');

// EXACT-TOKEN matching, not substring: `renderer/tts.test.js` being wired must never
// mask a future root-level orphan `tts.test.js` (a masked orphan is the precise
// failure this tool exists to catch, so a substring false-negative here would be
// self-defeating). The "test" script is tokenized into its `node <path>` invocations
// and compared for equality.
const wiredPkgPaths = new Set(
  testScript.split('&&')
    .map((s) => s.trim())
    .filter((s) => s.startsWith('node '))
    .map((s) => s.slice(5).trim())
);

// Wrapper corpus: every Pester suite under scripts/ (a Node suite referenced by one of
// these is executed by the run-pester gate — the K5 wrapper pattern). This meta-test's
// own Pester sibling is EXCLUDED: it is a watchdog that mentions test filenames, not a
// wrapper that executes them, and must not count as reachability for anything.
const wrapperText = testPs
  .filter((f) => f.startsWith(SCRIPTS_DIR + path.sep) && path.basename(f) !== 'test-reachability.Tests.ps1')
  .map((f) => { try { return fs.readFileSync(f, 'utf8'); } catch { return ''; } })
  .join('\n');
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const unreachable = testJs.filter((f) => {
  const relApp = path.relative(APP_DIR, f).split(path.sep).join('/');
  const inPackageJson = !relApp.startsWith('..') && wiredPkgPaths.has(relApp);
  // Basename bounded by non-filename characters on both sides: 'x-tts.test.js' or
  // 'tts.test.js.bak' inside a wrapper cannot satisfy 'tts.test.js'. (The trailing
  // guard includes '.' symmetrically with the leading one — delta-Reviewer LOW.)
  const inWrapper = new RegExp(`(?<![\\w.\\-/\\\\])${escapeRe(path.basename(f))}(?![\\w.\\-])`).test(wrapperText);
  return !inPackageJson && !inWrapper;
});

// THE invariant — and per the work order the failure names the files, not a count.
assert(unreachable.length === 0,
  unreachable.length === 0
    ? 'every *.test.js is reachable (app/package.json "test" script or a scripts/ Pester wrapper)'
    : `UNREACHABLE *.test.js — no runner executes: ${unreachable.map(rel).join(', ')}`);

// Mutual watchdog: the Pester-side meta suite must exist inside run-pester's root, so
// the *.Tests.ps1 family keeps ITS reachability check too.
assert(fs.existsSync(path.join(SCRIPTS_DIR, 'test-reachability.Tests.ps1')),
  'the sibling scripts/test-reachability.Tests.ps1 meta-suite exists (mutual anti-orphan watchdog)');

// Explicit self-check (also implied by the invariant above): this meta-test is itself
// wired into the node gate. Yes, this is the joke; it is also the requirement.
assert(wiredPkgPaths.has('test-reachability.test.js'),
  'this meta-test is itself an exact node invocation in app/package.json "test" (not the next orphan)');

process.stdout.write(`\ntest-reachability: ${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
