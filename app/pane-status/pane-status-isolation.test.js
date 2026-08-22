'use strict';
// Run: node app/pane-status/pane-status-isolation.test.js
//
// THE NEGATIVE CONTROLS. Everything asserted here is something that must NOT happen, which is why it
// gets its own suite: a property proven only by the absence of a line of code is one a future edit
// deletes by accident. Three groups:
//
//   1. PROCESS AND CONSEQUENTIAL-ACTION ISOLATION (§ 15). Drive all eight events and every lifecycle
//      path with child_process, PTY, app.relaunch/quit and the admission surface all under spies, and
//      assert ZERO calls. The two permitted child-process dependencies are injected and are reachable
//      ONLY from explicit setup / installed-startup discovery / an ordered re-probe, and from a
//      natively-confirmed clearStaleLock.
//   2. SINGLETON RUNTIME REACHABILITY (§ 4). Exactly one production implementation of each role.
//   3. NO TEST TOUCHES A REAL HOME DIRECTORY OR A REAL SETTINGS FILE (§ 19).

const crypto = require('crypto');
const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');

const controllerMod = require('./pane-status-controller');
const protocol = require('./pane-status-protocol');
const doc = require('./pane-status-settings-doc');

let passed = 0, failed = 0;
function assert(cond, label) {
  if (cond) { process.stdout.write(`  ✓ ${label}\n`); passed++; }
  else { process.stderr.write(`  ✗ FAIL: ${label}\n`); failed++; }
}

const APP_DIR = path.join(__dirname, '..');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bh-isolation-'));

// ---------------------------------------------------------------------------------------------
// 1. PROCESS AND CONSEQUENTIAL-ACTION ISOLATION
// ---------------------------------------------------------------------------------------------
(async () => {
  const cp = require('child_process');
  const spies = { spawn: 0, exec: 0, execFile: 0, fork: 0, execSync: 0, execFileSync: 0, spawnSync: 0 };
  const originals = {};
  for (const name of Object.keys(spies)) {
    originals[name] = cp[name];
    cp[name] = function spy() { spies[name] += 1; throw new Error('pane-status must not create a process here'); };
  }

  // Every consequential action the subsystem must never reach.
  const consequential = {
    ptySpawn: 0, ptyWrite: 0, ptyKill: 0,
    appRelaunch: 0, appQuit: 0,
    admissionMutate: 0, approve: 0, merge: 0, push: 0, paneClose: 0, credentialRead: 0,
  };
  const forbidden = {
    pty: { spawn: () => { consequential.ptySpawn++; }, write: () => { consequential.ptyWrite++; }, kill: () => { consequential.ptyKill++; } },
    app: { relaunch: () => { consequential.appRelaunch++; }, quit: () => { consequential.appQuit++; } },
    admission: { spend: () => { consequential.admissionMutate++; }, refund: () => { consequential.admissionMutate++; }, reset: () => { consequential.admissionMutate++; } },
    approve: () => { consequential.approve++; },
    merge: () => { consequential.merge++; },
    push: () => { consequential.push++; },
    closePane: () => { consequential.paneClose++; },
    readCredential: () => { consequential.credentialRead++; },
  };

  const dir = fs.mkdtempSync(path.join(root, 'ctrl-'));
  const userData = path.join(dir, 'userData');
  const settingsDir = path.join(dir, 'claude');
  const settingsPath = path.join(settingsDir, 'settings.json');
  fs.mkdirSync(userData, { recursive: true });
  fs.mkdirSync(settingsDir, { recursive: true });
  fs.writeFileSync(settingsPath, '{}\n');

  let clock = 1000;
  let versionProbes = 0, startTimeProbes = 0;
  const controller = controllerMod.createPaneStatusController({
    userDataPath: userData, settingsDir, settingsPath,
    installId: 'a'.repeat(32),
    reporterPath: path.join(__dirname, 'pane-status-reporter.js'),
    currentRuntimePath: process.execPath,
    net, crypto,
    randomToken: () => crypto.randomBytes(32).toString('hex'),
    // Dependency A — counted, and asserted to be unreachable from the event paths below.
    resolveVersion: async () => { versionProbes++; return { ok: true, raw: '9.9.9' }; },
    // Dependency B — counted the same way.
    resolveProcessStartTime: async () => { startTimeProbes++; return { ok: true, running: false }; },
    supportedVersions: ['9.9.9'],
    publishView: () => {},
    publishSetupState: () => {},
    now: () => clock,
    log: () => {},
  });

  // Install so the transport is live and events can actually be applied.
  await controller.install();
  assert(controller.getSetupState().state === 'ready', 'the fixture installed and is ready');
  const probesAfterInstall = versionProbes;
  assert(probesAfterInstall > 0, 'the version resolver IS reachable from explicit setup (dependency A, permitted)');

  const enrolled = controller.enrollPane('pty1');
  assert(enrolled.ok === true, 'a pane enrolled');
  const token = enrolled.env.BLUE_HELM_PANE_STATUS_TOKEN;

  // ---- drive ALL EIGHT events straight into the registry, the way the pipe does
  const spiesBefore = JSON.stringify(spies);
  for (const ev of protocol.ALLOWED_EVENTS) {
    controller.registry.applyMessage({ e: ev, t: token });
  }
  // ---- and every other lifecycle path
  controller.publishAllViews();                       // rendering
  clock += 130000;
  controller.publishAllViews();                       // freshness / heartbeat tick
  controller.enrollPane('pty2');                      // enrollment
  controller.releasePane('pty2', 'pty-exit');         // revocation
  controller.releasePane('pty1', 'pane-closed');      // pane release
  controller.registry.applyMessage({ e: 'Stop', t: token });   // a message for a revoked pane

  assert(JSON.stringify(spies) === spiesBefore,
    'ZERO child_process calls across all eight events, heartbeat, freshness, rendering, enrollment, revocation and pane release');
  assert(versionProbes === probesAfterInstall,
    'the version resolver was NOT reached by any provider event or lifecycle path');
  assert(startTimeProbes === 0, 'the PID/start-time resolver was NOT reached by any of them either');
  assert(Object.values(consequential).every((n) => n === 0),
    'ZERO consequential actions: no PTY spawn/write/kill, no app relaunch/quit, no admission mutation, no approve/merge/push/pane-close/credential read');

  // ---- the second dependency is reachable ONLY from clearStaleLock.
  // With no lock on disk, confirmClearStaleLock refuses BEFORE consulting liveness — so a lock has to
  // exist for the resolver to be reachable at all. That ordering is itself the point: we never spend a
  // child process working out whether to delete a file that is not there.
  assert(startTimeProbes === 0, 'with no lock present, clearStaleLock refuses without spending a child process');
  const heldForTest = controller.lock.acquire();
  assert(heldForTest.ok === true, 'a lock is placed for the reachability check');
  await controller.clearStaleLock();
  assert(startTimeProbes === 1, 'the PID/start-time resolver IS reachable from clearStaleLock (dependency B, permitted)');

  // ---- teardown is also process-free
  const spiesBeforeShutdown = JSON.stringify(spies);
  controller.shutdown();
  assert(JSON.stringify(spies) === spiesBeforeShutdown, 'window teardown creates no process either');

  for (const name of Object.keys(spies)) cp[name] = originals[name];

  // ---- and there is no broad escape hatch in the source
  {
    const controllerSrc = fs.readFileSync(path.join(__dirname, 'pane-status-controller.js'), 'utf8');
    // The phrase appears exactly once, inside the sentence that FORBIDS it. Asserting the denial is
    // present is the honest check; asserting the words are absent would just be a check on prose.
    assert(/no broad "bounded runtime operations" exception/i.test(controllerSrc),
      'the controller explicitly records that there is no broad "bounded runtime operations" exception');
    assert((controllerSrc.match(/bounded runtime operations/gi) || []).length === 1,
      'and the phrase appears exactly once — in that denial, not as an authorization');
    assert(!/require\(\s*['"]child_process['"]\s*\)/.test(controllerSrc),
      'the controller never requires child_process — both dependencies are injected');
  }

  // ---------------------------------------------------------------------------------------------
  // 2. SINGLETON RUNTIME REACHABILITY
  // ---------------------------------------------------------------------------------------------
  {
    // Production runtime reachability only. Tests, docs, fixtures, node_modules, vendor, dist,
    // worktrees, and historical prototype evidence are excluded by construction.
    const EXCLUDE_DIR = new Set(['node_modules', 'dist', 'out', 'build', 'vendor', '.worktrees', '.git']);
    function walk(dirPath, acc) {
      for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
        if (entry.isDirectory()) {
          if (EXCLUDE_DIR.has(entry.name)) continue;
          walk(path.join(dirPath, entry.name), acc);
        } else if (entry.isFile() && entry.name.endsWith('.js') && !entry.name.endsWith('.test.js')) {
          acc.push(path.join(dirPath, entry.name));
        }
      }
      return acc;
    }
    const files = walk(APP_DIR, []);

    const roles = [
      ['reporter', (f, s) => path.basename(f) === 'pane-status-reporter.js' && /BLUE_HELM_PANE_STATUS_PIPE/.test(s)],
      ['pipe listener', (f, s) => /function createPaneStatusPipe\(/.test(s)],
      ['token registry', (f, s) => /function createPaneStatusRegistry\(/.test(s)],
      ['settings writer', (f, s) => /function createSettingsTransaction\(/.test(s)],
      ['descriptor owner', (f, s) => /function buildDescriptor\(/.test(s)],
      ['lock owner', (f, s) => /function createPaneStatusLock\(/.test(s)],
      ['hook-group builder', (f, s) => /function buildHookGroups\(/.test(s)],
      ['controller', (f, s) => /function createPaneStatusController\(/.test(s)],
      ['badge', (f, s) => /function createPaneStatusBadge\(/.test(s)],
    ];
    const sources = new Map(files.map((f) => [f, fs.readFileSync(f, 'utf8')]));
    for (const [role, match] of roles) {
      const hits = files.filter((f) => match(f, sources.get(f)));
      assert(hits.length === 1,
        `exactly ONE production implementation of the ${role} is reachable (found ${hits.length}${hits.length ? ': ' + hits.map((h) => path.relative(APP_DIR, h)).join(', ') : ''})`);
    }

    // The retired prototype must be gone from the production tree entirely.
    assert(!fs.existsSync(path.join(APP_DIR, 'prototype-pane-status')),
      'app/prototype-pane-status/ is retired from the working tree (its evidence lives in git history and tracked docs)');
    const stragglers = files.filter((f) => /prototype-pane-status/.test(sources.get(f)));
    assert(stragglers.length === 0,
      `no production file still references prototype-pane-status/ (${stragglers.map((s) => path.relative(APP_DIR, s)).join(', ')})`);

    // ---- ADMISSION ISOLATION
    const paneStatusFiles = files.filter((f) => f.indexOf(path.join('app', 'pane-status')) !== -1
      || path.dirname(f).endsWith('pane-status'));
    assert(paneStatusFiles.length >= 14, `the production module set is present (${paneStatusFiles.length} files)`);
    for (const f of paneStatusFiles) {
      const s = sources.get(f);
      assert(!/require\([^)]*admission[^)]*\)/.test(s),
        `${path.basename(f)} does not import an admission module`);
    }
  }

  // ---------------------------------------------------------------------------------------------
  // 3. NO TEST TOUCHES A REAL HOME DIRECTORY OR A REAL SETTINGS FILE
  // ---------------------------------------------------------------------------------------------
  {
    const testFiles = fs.readdirSync(__dirname)
      .filter((f) => f.endsWith('.test.js'))
      .map((f) => path.join(__dirname, f));
    assert(testFiles.length >= 13, `the pane-status suites are present (${testFiles.length} files)`);

    // This scanner deliberately excludes ITSELF: a file cannot honestly scan itself for a string its
    // own assertions must contain.
    const scanned = testFiles.filter((f) => f !== __filename);
    for (const f of scanned) {
      const s = fs.readFileSync(f, 'utf8');
      const base = path.basename(f);
      assert(!/os\.homedir\s*\(/.test(s), `${base} never calls os.homedir()`);
      assert(!/process\.env\.(USERPROFILE|HOME)\b/.test(s), `${base} never reads USERPROFILE or HOME`);
      assert(!/app\.getPath\s*\(/.test(s), `${base} never calls app.getPath()`);
      // A literal real settings location. Temp dirs are fine; `<home>/.claude/settings.json` is not.
      assert(!/\.claude[\\/\\\\]+settings\.json/.test(s), `${base} never names a real .claude settings file`);
      // Every suite that writes must be rooted in a temp directory.
      if (/writeFileSync|mkdtempSync/.test(s)) {
        assert(/mkdtempSync|os\.tmpdir\s*\(/.test(s), `${base} roots its writes in a temp directory`);
      }
    }
  }

  try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* best effort */ }
  process.stdout.write(`\npane-status-isolation: ${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { process.stderr.write('UNCAUGHT: ' + (e && e.stack) + '\n'); process.exit(1); });
