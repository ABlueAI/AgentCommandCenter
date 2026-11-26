'use strict';
// Run: node app/e2e/first-window-smoke.js [--app <dir>] [--expect-fail] [--artifacts <dir>]
//
// S72: the e2e smoke test. Playwright's `_electron.launch` starts the real Mako (app/main.js,
// through the repository's own pinned Electron) and checks that its first window loads:
//   1. a first window opens;
//   2. it shows the trusted entry document (app/renderer/index.html), not some other page;
//   3. the preload bridge (`window.cc`) exists, so main and preload both ran;
//   4. the boot sequence in renderer/app.js reached its end: it sets document.title to the build
//      label ("Mako (dev) 1.0.0 · branch@commit") only after repos, the UI wiring and Quick Links
//      have loaded, so a title still reading plain "Mako" means boot stopped part way;
//   5. the repo picker (#repoSelect) is visible;
//   6. no uncaught error reached the page while it loaded.
//
// It runs as the dev copy (`--dev-instance`, app/instance-profile.js): its own userData folder and
// no Claude Code hooks, so running it on Blue's PC never touches the stable copy's settings, keys
// or admission ledger. While it runs, Playwright opens two loopback-only debug ports on that dev copy
// (the Node inspector and Chromium's remote debugging, `--inspect=0 --remote-debugging-port=0`), so
// on a PC, run it only when no untrusted local process is running.
//
// Playwright marks its Electron support experimental. So every failure, Playwright's own included,
// fails the run visibly with the step that failed; nothing is retried or skipped. A hard timer
// kills Electron and fails the run if anything hangs. With --artifacts, a screenshot (when a window
// exists) and a JSON report are written to that folder on the machine that ran it; CI doesn't upload
// them yet (an S72 follow-up), so in CI the log's failure lines are the record.
//
// `--expect-fail` inverts the exit code (0 only when the smoke check FAILED). CI uses it on the
// broken fixture apps in app/e2e/fixtures/ on every run, so the job keeps proving it can fail.

const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const APP_DIR_DEFAULT = path.resolve(__dirname, '..');
const LAUNCH_TIMEOUT_MS = 60000;   // Electron start to first window (cold Windows runners are slow)
const BOOT_TIMEOUT_MS = 60000;     // first window to the build-label title
const SETTLE_MS = 2000;            // watch for late uncaught errors after boot
const HARD_TIMEOUT_MS = 180000;    // the whole run, close included

function parseArgs(argv) {
  const out = { appDir: APP_DIR_DEFAULT, expectFail: false, artifactsDir: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--expect-fail') out.expectFail = true;
    else if (a === '--app' || a === '--artifacts') {
      const v = argv[i + 1];
      if (typeof v !== 'string' || v.startsWith('--')) throw new Error(`${a} needs a value`);
      if (a === '--app') out.appDir = path.resolve(v); else out.artifactsDir = path.resolve(v);
      i++;
    } else throw new Error(`unknown argument: ${a}`);
  }
  return out;
}

// The boot-complete title, as build-info.js formatBuildLabel writes it for the dev copy. app.js's
// fallback when build info fails ("Mako · build unknown") has no "(dev)", so it does not count, and
// neither would a "(dev)" variant of it.
const BOOTED_TITLE = /^Mako \(dev\)( \S+)? · (?!build unknown)\S/;
function titleShowsBoot(title) { return typeof title === 'string' && BOOTED_TITLE.test(title); }

function entryUrlFor(appDir) {
  return pathToFileURL(path.join(appDir, 'renderer', 'index.html')).toString();
}

// The verdict from what the run observed; pure, so app/e2e-smoke.test.js checks it directly.
function verdict(obs) {
  const failures = [];
  if (obs.launchError) failures.push(`launch: ${obs.launchError}`);
  else if (!obs.windowOpened) failures.push(`first window: ${obs.windowError || 'none opened'}`);
  else {
    if (obs.url !== obs.expectedUrl) failures.push(`entry document: saw ${obs.url}, expected ${obs.expectedUrl}`);
    if (obs.bridge !== true) failures.push('preload bridge: window.cc missing');
    if (!titleShowsBoot(obs.title)) failures.push(`boot: title "${obs.title}" is not the build label${obs.bootError ? ` (${obs.bootError})` : ''}`);
    if (obs.repoPicker !== true) failures.push('repo picker: #repoSelect not visible');
    for (const e of obs.pageErrors || []) failures.push(`uncaught page error: ${e}`);
  }
  // A step that threw says so itself, so a crash isn't reported only as the check it broke.
  for (const s of obs.stepErrors || []) failures.push(`${s.step} threw: ${s.error}`);
  if (obs.hardTimeout) failures.push(`hard timeout: the run passed ${HARD_TIMEOUT_MS} ms`);
  return { ok: failures.length === 0, failures };
}

function oneLine(e) {
  const s = (e && e.message) || String(e);
  return s.split(/\r?\n/)[0].slice(0, 300);
}

async function run(opts) {
  const started = Date.now();
  const expectedUrl = entryUrlFor(opts.appDir);
  const obs = { expectedUrl, pageErrors: [], stepErrors: [] };
  const stepError = (step, e) => obs.stepErrors.push({ step, error: oneLine(e) });
  let electronApp = null;
  let page = null;
  let hardTimer = null;

  const hard = new Promise((resolve) => {
    hardTimer = setTimeout(() => { obs.hardTimeout = true; resolve(); }, HARD_TIMEOUT_MS);
  });

  const body = (async () => {
    // Required here, not at the top, so a missing or broken Playwright fails as a visible step.
    let electron;
    try { ({ _electron: electron } = require('playwright-core')); }
    catch (e) { obs.launchError = `playwright-core did not load: ${oneLine(e)}`; return; }
    if (!electron || typeof electron.launch !== 'function') {
      obs.launchError = 'playwright-core has no _electron.launch (its experimental Electron API changed)';
      return;
    }
    let executablePath;
    try { executablePath = require(path.join(APP_DIR_DEFAULT, 'node_modules', 'electron')); }
    catch (e) { obs.launchError = `the pinned Electron did not load: ${oneLine(e)}`; return; }

    // ELECTRON_RUN_AS_NODE would make Electron plain Node; strip it for the child only.
    const env = Object.assign({}, process.env);
    delete env.ELECTRON_RUN_AS_NODE;
    try {
      electronApp = await electron.launch({
        executablePath,
        args: [opts.appDir, '--dev-instance'],
        cwd: opts.appDir,
        env,
        timeout: LAUNCH_TIMEOUT_MS,
      });
    } catch (e) { obs.launchError = oneLine(e); return; }

    try {
      page = await electronApp.firstWindow({ timeout: LAUNCH_TIMEOUT_MS });
      obs.windowOpened = true;
    } catch (e) { obs.windowError = oneLine(e); return; }
    page.on('pageerror', (err) => obs.pageErrors.push(oneLine(err)));

    try { await page.waitForLoadState('load', { timeout: BOOT_TIMEOUT_MS }); }
    catch (e) { stepError('waiting for the page load', e); }
    obs.url = page.url();
    try {
      await page.waitForFunction(
        (src) => new RegExp(src).test(document.title), BOOTED_TITLE.source, { timeout: BOOT_TIMEOUT_MS });
    } catch (e) { obs.bootError = obs.bootError || oneLine(e); }
    try { obs.title = await page.title(); } catch (e) { stepError('reading the title', e); }
    try { obs.bridge = await page.evaluate(() => typeof window.cc === 'object' && window.cc !== null); }
    catch (e) { stepError('checking window.cc', e); }
    try { obs.repoPicker = await page.locator('#repoSelect').isVisible(); }
    catch (e) { stepError('checking #repoSelect', e); }
    await new Promise((r) => setTimeout(r, SETTLE_MS));
  })();

  await Promise.race([body, hard]);
  clearTimeout(hardTimer);
  if (obs.hardTimeout && !electronApp) {
    process.stderr.write('  ! the hard timeout fired before Electron finished launching; a dev copy may still be running\n');
  }
  const result = verdict(obs);

  if (opts.artifactsDir) {
    try {
      fs.mkdirSync(opts.artifactsDir, { recursive: true });
      if (page) {
        try { await page.screenshot({ path: path.join(opts.artifactsDir, 'first-window.png'), timeout: 10000 }); }
        catch (e) { result.screenshotError = oneLine(e); }
      }
    } catch (e) { result.artifactsError = oneLine(e); }
  }

  if (electronApp) {
    const proc = electronApp.process();
    const closed = await Promise.race([
      electronApp.close().then(() => true, () => false),
      new Promise((r) => setTimeout(() => r(false), 15000)),
    ]);
    if (!closed && proc && proc.exitCode === null) {
      try { proc.kill(); } catch (e) { result.killError = oneLine(e); }
    }
  }

  const report = {
    app: opts.appDir, expectFail: opts.expectFail, ok: result.ok, failures: result.failures,
    title: obs.title || null, url: obs.url || null, durationMs: Date.now() - started,
    screenshotError: result.screenshotError || null, artifactsError: result.artifactsError || null,
    killError: result.killError || null,
  };
  if (opts.artifactsDir && !result.artifactsError) {
    try { fs.writeFileSync(path.join(opts.artifactsDir, 'smoke-report.json'), JSON.stringify(report, null, 2) + '\n'); }
    catch (e) { report.artifactsError = oneLine(e); }
  }
  return report;
}

async function main() {
  let opts;
  try { opts = parseArgs(process.argv.slice(2)); }
  catch (e) { process.stderr.write(`first-window smoke: ${e.message}\n`); process.exit(2); }
  const report = await run(opts);
  const name = path.basename(opts.appDir);
  if (report.ok) process.stdout.write(`first-window smoke (${name}): PASS in ${report.durationMs} ms, title "${report.title}"\n`);
  else {
    process.stdout.write(`first-window smoke (${name}): FAIL in ${report.durationMs} ms\n`);
    for (const f of report.failures) process.stdout.write(`  - ${f}\n`);
  }
  for (const k of ['screenshotError', 'artifactsError', 'killError']) {
    if (report[k]) process.stderr.write(`  ! ${k}: ${report[k]}\n`);
  }
  if (opts.expectFail) {
    process.stdout.write(report.ok
      ? '  x negative control: this broken app PASSED, so the smoke check cannot catch a broken start\n'
      : '  ✓ negative control: the broken app failed, as it must\n');
    process.exit(report.ok ? 1 : 0);
  }
  process.exit(report.ok ? 0 : 1);
}

if (require.main === module) {
  main().catch((e) => { process.stderr.write(`first-window smoke crashed: ${(e && e.stack) || e}\n`); process.exit(1); });
}

module.exports = { parseArgs, verdict, titleShowsBoot, entryUrlFor, BOOTED_TITLE, HARD_TIMEOUT_MS };
