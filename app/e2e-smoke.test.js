'use strict';
// Run: node app/e2e-smoke.test.js
//
// S72 pins for the e2e smoke test (app/e2e/first-window-smoke.js), so it can't quietly weaken:
//   1. its verdict fails on each broken piece of the first window, and passes only when all hold;
//   2. the CI job exists, runs on Windows with a timeout, runs both negative controls with
//      --expect-fail before the real check, and runs the real check without it;
//   3. Playwright is pinned to one exact version, in package.json and the lockfile, with the
//      integrity recorded in docs/decisions/OSS-e2e-playwright.md;
//   4. the two broken fixture apps exist.
// The smoke run itself launches Electron, so it runs in its own CI job, not here.

const fs = require('fs');
const path = require('path');
const smoke = require('./e2e/first-window-smoke.js');

let passed = 0, failed = 0;
function assert(cond, label) {
  if (cond) { process.stdout.write('  ✓ ' + label + '\n'); passed++; }
  else { process.stderr.write('  x FAIL: ' + label + '\n'); failed++; }
}
const repoRoot = path.join(__dirname, '..');
// Windows checkouts get CRLF line endings (git autocrlf), so normalise before matching on "\n".
const read = (...parts) => fs.readFileSync(path.join(repoRoot, ...parts), 'utf8').replace(/\r\n/g, '\n');

process.stdout.write('\nthe verdict\n');
const url = smoke.entryUrlFor(__dirname);
const good = {
  expectedUrl: url, url, windowOpened: true, bridge: true, repoPicker: true, pageErrors: [],
  title: 'Mako (dev) 1.0.0 · main@abc1234',
};
assert(smoke.verdict(good).ok === true, 'a fully booted first window passes');
const broken = {
  'no launch': { launchError: 'socket hang up' },
  'no window': { windowOpened: false, windowError: 'Timeout' },
  'wrong page': { url: 'file:///C:/other.html' },
  'no bridge': { bridge: false },
  'boot stopped (plain title)': { title: 'Mako' },
  'app.js\'s build-info fallback title': { title: 'Mako · build unknown' },
  'a dev-tagged fallback title': { title: 'Mako (dev) · build unknown' },
  'stable copy title (not the dev profile)': { title: 'Mako 1.0.0 · main@abc1234' },
  'no repo picker': { repoPicker: false },
  'an uncaught page error': { pageErrors: ['TypeError: x is undefined'] },
  'the hard timeout': { hardTimeout: true },
  'a step that threw (with every check otherwise passing)': { stepErrors: [{ step: 'checking window.cc', error: 'Target page closed' }] },
};
for (const [name, change] of Object.entries(broken)) {
  const v = smoke.verdict(Object.assign({}, good, change));
  assert(v.ok === false && v.failures.length > 0, `fails on ${name} (${v.failures[0] || 'no failure'})`);
}
assert(smoke.titleShowsBoot('Mako (dev) · abc1234') && smoke.titleShowsBoot('Mako (dev) 1.0.0 · commit unknown'),
  'the boot title matches build-info.js labels with or without a version');
{
  const v = smoke.verdict(Object.assign({}, good, { bridge: undefined, stepErrors: [{ step: 'checking window.cc', error: 'Target page closed' }] }));
  assert(v.failures.some((f) => f === 'checking window.cc threw: Target page closed'),
    'a step that threw is reported with its own error, not only as the check it broke');
}
assert(!smoke.titleShowsBoot(undefined) && !smoke.titleShowsBoot(''), 'a missing title is not booted');
assert(url.startsWith('file://') && url.endsWith('/renderer/index.html'), `the entry URL is the renderer page (${url})`);

process.stdout.write('\nthe arguments\n');
assert(smoke.parseArgs([]).expectFail === false && smoke.parseArgs([]).appDir === __dirname,
  'with no arguments it checks this app and expects a pass');
const parsed = smoke.parseArgs(['--app', 'e2e/fixtures/never-boots', '--expect-fail', '--artifacts', 'out']);
assert(parsed.expectFail === true && path.isAbsolute(parsed.appDir) && path.isAbsolute(parsed.artifactsDir),
  '--app, --expect-fail and --artifacts parse');
for (const bad of [['--app'], ['--app', '--expect-fail'], ['--bogus']]) {
  let threw = false;
  try { smoke.parseArgs(bad); } catch { threw = true; }
  assert(threw, `refuses ${JSON.stringify(bad)}`);
}

process.stdout.write('\nthe CI job\n');
const ci = read('.github', 'workflows', 'ci.yml');
const jobMatch = ci.match(/^  e2e:\n([\s\S]*?)(?=^  [a-z][\w-]*:\n|(?![\s\S]))/m);
const job = jobMatch ? jobMatch[1] : '';
assert(job.length > 0, 'ci.yml has an e2e job');
assert(/^    name: E2E smoke \(Windows\)$/m.test(job), 'it is named "E2E smoke (Windows)"');
assert(/^    runs-on: windows-latest$/m.test(job), 'it runs on windows-latest');
const jobTimeout = job.match(/^    timeout-minutes: (\d+)$/m);
assert(jobTimeout && Number(jobTimeout[1]) > 0 && Number(jobTimeout[1]) <= 30, 'it has a job timeout of at most 30 minutes');
assert(!/continue-on-error/.test(job), 'no step may continue on error (a failure must fail the job)');
assert(/npm ci --no-audit --no-fund/.test(job), 'it installs from the lockfile');
const runs = [...job.matchAll(/^        run: (.+)$/gm)].map((m) => m[1]);
const smokeRuns = runs.filter((r) => r.includes('e2e/first-window-smoke.js'));
const controls = smokeRuns.filter((r) => r.includes('--expect-fail'));
assert(controls.some((r) => r.includes('e2e/fixtures/exits-on-start')) && controls.some((r) => r.includes('e2e/fixtures/never-boots')),
  'both negative controls run with --expect-fail');
const real = smokeRuns.filter((r) => !r.includes('--expect-fail'));
assert(real.length === 1 && !real[0].includes('--app'), 'the real check runs once, on Mako itself, without --expect-fail');
assert(smokeRuns.indexOf(real[0]) === smokeRuns.length - 1, 'the negative controls run before the real check');
const stepTimeouts = [...job.matchAll(/^        timeout-minutes: (\d+)$/gm)];
assert(stepTimeouts.length === smokeRuns.length, 'every smoke step has its own timeout');

process.stdout.write('\nthe Playwright pin\n');
const pkg = JSON.parse(read('app', 'package.json'));
const lock = JSON.parse(read('app', 'package-lock.json'));
const PIN = '1.65.1';
const INTEGRITY = 'sha512-hqPpz7blSMPxWVdoeE1yiBSzXsKiVOd2k+kjCvmUywD2GPO2Dd9HfcWnq9NN0GHbNZDFgZ9JfBFr+X5/BLo0qw==';
assert(pkg.devDependencies && pkg.devDependencies['playwright-core'] === PIN, `package.json pins playwright-core to exactly ${PIN}`);
assert(!(pkg.dependencies && pkg.dependencies['playwright-core']), 'playwright-core is a dev dependency only');
const entry = lock.packages['node_modules/playwright-core'];
assert(entry && entry.version === PIN && entry.integrity === INTEGRITY && entry.dev === true,
  'the lockfile resolves it to that version and integrity');
assert(read('docs', 'decisions', 'OSS-e2e-playwright.md').includes(INTEGRITY), 'the OSS record carries the same integrity');

process.stdout.write('\nthe fixtures\n');
for (const f of ['exits-on-start/main.js', 'exits-on-start/package.json', 'never-boots/main.js',
  'never-boots/package.json', 'never-boots/renderer/index.html', 'never-boots/renderer/boot.js']) {
  assert(fs.existsSync(path.join(__dirname, 'e2e', 'fixtures', f)), `fixture ${f} exists`);
}

process.stdout.write(`\ne2e-smoke: ${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
