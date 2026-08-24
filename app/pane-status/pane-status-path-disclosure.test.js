'use strict';
// Run: node app/pane-status/pane-status-path-disclosure.test.js
//
// WO-7 § 1 + Binding Amendment A § 1 — THE PROVIDER'S ABSOLUTE PATH IS NOT THE OPERATOR'S TO PUBLISH.
//
// The resolver logs through a logger that main.js wires to `tlog`, and it used to interpolate
// `outcome.source` — the resolved absolute executable path — straight into the success line. That put
// the operator's provider install location into the Logs tab, and from there into anything a log is
// pasted into. It is a disclosure, not a diagnostic: nothing downstream needs the path, and nothing
// downstream ever asked for it.
//
// The correction logs a fixed bounded classification instead: HOW the provider was resolved, and
// whether it succeeded. The path is still resolved, still verified, and still what the probe invokes.
//
// This suite is deliberately NON-VACUOUS. Before asserting the path is absent from anything, it first
// proves the path is genuinely present where it should be: the successful probe really does receive it
// as the executable source, and the failing probe's injected error really does carry it in its
// message, stack, cmd and path fields. Only then is absence meaningful.
//
// EVERY APPLICABLE PRODUCTION SINK IS CAPTURED AND NAMED:
//   1. the injected provider-resolution logger (what main.js hands to `tlog`)
//   2. console.log / console.warn / console.error  (what tlog itself writes through)
//   3. renderer main-error payloads sent through webContents.send
//   4. controller results  (start / install return values)
//   5. IPC responses       (every registered pane-status handler)
//   6. setup-state reason and detail fields
//   7. anything propagated across the resolver's own public boundary, resolved OR rejected

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const controllerMod = require('./pane-status-controller');
const ipcMod = require('./pane-status-ipc');
const shimMod = require('./pane-status-runtime-shim');
const versionMod = require('./pane-status-version');

let passed = 0, failed = 0;
function assert(cond, label) {
  if (cond) { process.stdout.write(`  ✓ ${label}\n`); passed++; }
  else { process.stderr.write(`  ✗ FAIL: ${label}\n`); failed++; }
}
function eq(a, b, label) { assert(a === b, a === b ? label : `${label} (got ${JSON.stringify(a)})`); }

// A path no real machine has, so a match can only have come from here.
const POISON = 'C:\\Zzz-Provider-Disclosure\\hidden-install\\claude-poison-9f3a.exe';
const POISON_BASENAME = 'claude-poison-9f3a.exe';
const POISON_DIR = 'Zzz-Provider-Disclosure';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bh-disclosure-'));

/** execFile stub: a successful probe whose SOURCE tag is the poison path. */
function execFileOk(file, args, opts, cb) {
  const stdout = `${versionMod.SOURCE_TAG}${POISON}\n${versionMod.VERSION_TAG}2.1.228 (Claude Code)\n`;
  setImmediate(() => cb(null, stdout, ''));
}

/** execFile stub: a failed probe whose error carries the poison path in every field it can. */
function makeProbeError() {
  const e = new Error(`spawn ${POISON} ENOENT`);
  e.stack = `Error: spawn ${POISON} ENOENT\n    at ChildProcess (${POISON}:1:1)`;
  e.code = 'ENOENT';
  e.path = POISON;
  e.spawnfile = POISON;
  e.cmd = `${POISON} --version`;
  return e;
}
function execFileFail(file, args, opts, cb) {
  setImmediate(() => cb(makeProbeError(), '', `spawn ${POISON} ENOENT`));
}

/** Capture console for the duration of one async operation — this is the sink tlog writes through. */
async function withConsoleCaptured(fn) {
  const lines = [];
  const orig = { log: console.log, warn: console.warn, error: console.error };
  const grab = (...a) => { lines.push(a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ')); };
  console.log = grab; console.warn = grab; console.error = grab;
  try { return { value: await fn(), consoleLines: lines }; }
  finally { console.log = orig.log; console.warn = orig.warn; console.error = orig.error; }
}

let seq = 0;
/** A controller wired to the REAL resolver over a stubbed execFile, with every sink captured. */
function makeRig(execFileStub) {
  const dir = path.join(root, 'r' + (seq++));
  const userData = path.join(dir, 'userData');
  const settingsDir = path.join(dir, 'claude');
  const settingsPath = path.join(settingsDir, 'settings.json');
  fs.mkdirSync(userData, { recursive: true });
  fs.mkdirSync(settingsDir, { recursive: true });
  fs.writeFileSync(settingsPath, '{}\n');

  const sinks = { resolverLog: [], controllerLog: [], views: [], setups: [], rendererSends: [] };

  // Sink 1 + 3: main.js hands the resolver a logger wired to tlog, and pushes to the renderer through
  // webContents.send. Both are modelled here rather than assumed.
  const resolver = () => versionMod.createClaudeVersionResolver({
    execFile: execFileStub,
    env: { PATH: 'C:\\Windows\\System32', PATHEXT: '.EXE;.CMD' },
    commandName: 'claude',
    log: (line) => sinks.resolverLog.push(String(line)),
  }).discover();

  const win = {
    isDestroyed: () => false,
    webContents: { send: (channel, payload) => sinks.rendererSends.push({ channel, payload }) },
  };
  const publishers = ipcMod.createPublishers(() => win);

  const c = controllerMod.createPaneStatusController({
    userDataPath: userData, settingsDir, settingsPath,
    installId: 'a'.repeat(32),
    cmdExe: shimMod.resolveCmdExe(process.env),
    reporterPath: path.join(__dirname, 'pane-status-reporter.js'),
    currentRuntimePath: process.execPath,
    net: require('net'), crypto,
    randomToken: () => crypto.randomBytes(32).toString('hex'),
    resolveVersion: resolver,
    resolveProcessStartTime: async () => ({ ok: true, running: false }),
    supportedVersions: ['2.1.228'],
    publishView: (v) => { sinks.views.push(v); return publishers.publishView(v); },
    publishSetupState: (s) => { sinks.setups.push(s); return publishers.publishSetupState(s); },
    now: () => 1000,
    log: (line) => sinks.controllerLog.push(String(line)),
  });
  return { c, sinks, resolver, settingsPath, userData };
}

/** Sink 5: drive every registered IPC handler and collect its response. */
async function ipcResponses(controller) {
  const handlers = {};
  ipcMod.registerPaneStatusIpc({
    ipcMain: { handle: (ch, fn) => { handlers[ch] = fn; } },
    controller,
    trustedSenderGate: { assess: () => ({ ok: true }) },
    confirmNatively: async () => false,
    log: () => {},
  });
  const out = [];
  const event = { senderFrame: {}, sender: {} };
  for (const ch of Object.keys(handlers)) {
    let r;
    try { r = await handlers[ch](event); } catch (e) { r = { threw: String(e && e.message) }; }
    out.push({ channel: ch, response: r });
  }
  return out;
}

/** Everything, as one string, so a single scan covers every sink at once. */
function everything(parts) {
  const list = Array.isArray(parts) ? parts : [parts];
  return list.map((p) => (typeof p === 'string' ? p : JSON.stringify(p))).join('\n');
}

function assertNoDisclosure(blob, label) {
  assert(blob.indexOf(POISON) === -1, `${label}: the absolute path does not appear`);
  assert(blob.indexOf(POISON_BASENAME) === -1, `${label}: nor its distinctive filename`);
  assert(blob.indexOf(POISON_DIR) === -1, `${label}: nor its distinctive directory`);
}

(async () => {
  // -----------------------------------------------------------------------------------------------
  process.stdout.write('\n1. NON-VACUITY: the poison path really is present where it should be\n');
  // -----------------------------------------------------------------------------------------------
  {
    const rig = makeRig(execFileOk);
    const outcome = await rig.resolver();
    eq(outcome.ok, true, 'the successful probe resolves');
    eq(outcome.source, POISON, 'and it genuinely receives the poison path as its executable source');
    eq(outcome.executable, POISON, 'exposed internally as `executable` for the acceptance record');
    eq(outcome.version, '2.1.228', 'with the version parsed from the same output');

    const err = makeProbeError();
    assert(err.message.indexOf(POISON) !== -1, 'the failing probe error MESSAGE contains the poison path');
    assert(err.stack.indexOf(POISON) !== -1, 'its STACK contains the poison path');
    assert(err.cmd.indexOf(POISON) !== -1, 'its COMMAND METADATA contains the poison path');
    assert(err.path === POISON && err.spawnfile === POISON, 'and its executable fields are the poison path');
  }

  // -----------------------------------------------------------------------------------------------
  process.stdout.write('\n2. SUCCESSFUL probe: no sink discloses the path\n');
  // -----------------------------------------------------------------------------------------------
  {
    const rig = makeRig(execFileOk);
    const captured = await withConsoleCaptured(async () => rig.c.install());

    // Read the state BEFORE driving the handlers: `ipcResponses` invokes every registered channel,
    // and one of them is remove — which really does uninstall. That is fine for a disclosure scan and
    // fatal for a state assertion, so the order matters.
    const setup = rig.c.getSetupState();
    const responses = await ipcResponses(rig.c);

    eq(setup.state, 'ready',
      `the fixture really did install and reach ready (install said ${JSON.stringify(captured.value)})`);
    assert(rig.sinks.resolverLog.length > 0, 'and the provider-resolution logger really did emit');
    assert(rig.sinks.resolverLog.join('\n').indexOf(versionMod.RESOLUTION_METHOD) !== -1,
      'emitting the bounded resolution method instead of a path');

    assertNoDisclosure(everything(rig.sinks.resolverLog), 'sink 1 provider-resolution logger');
    assertNoDisclosure(everything(captured.consoleLines), 'sink 2 console/tlog');
    assertNoDisclosure(everything(rig.sinks.rendererSends), 'sink 3 renderer webContents.send');
    assertNoDisclosure(everything(rig.sinks.controllerLog), 'sink 4a controller log');
    assertNoDisclosure(everything(responses), 'sink 5 IPC responses');
    assertNoDisclosure(everything([setup.detail, setup.versionReason, setup]), 'sink 6 setup state');
  }

  // -----------------------------------------------------------------------------------------------
  process.stdout.write('\n3. FAILED probe: no sink discloses the path, and no raw error escapes\n');
  // -----------------------------------------------------------------------------------------------
  {
    const rig = makeRig(execFileFail);
    let rejection = null;
    const captured = await withConsoleCaptured(async () => {
      // Sink 7: the resolver's own public boundary, resolved OR rejected.
      let boundary;
      try { boundary = await rig.resolver(); }
      catch (e) { rejection = e; boundary = { rejected: String(e && e.stack) }; }
      const started = await rig.c.start();
      return { boundary, started };
    });
    const setup = rig.c.getSetupState();
    const responses = await ipcResponses(rig.c);

    const boundary = captured.value.boundary;
    eq(rejection, null, 'the resolver never rejects — a failure is a bounded value, not an exception');
    eq(boundary.ok, false, 'the failed probe reports failure');
    eq(boundary.reason, 'version-probe-failed', 'as a fixed bounded classification');
    eq(boundary.source, null, 'with NO source path on the failure path');
    eq(boundary.executable, null, 'and no executable path either');
    assert(Object.keys(boundary).every((k) => ['ok', 'version', 'source', 'raw', 'reason', 'executable'].indexOf(k) !== -1),
      'and the failure value carries no smuggled extra field');

    assert(rig.sinks.resolverLog.length > 0, 'the resolution logger emitted on the failure path too');
    assertNoDisclosure(everything(rig.sinks.resolverLog), 'sink 1 provider-resolution logger');
    assertNoDisclosure(everything(captured.consoleLines), 'sink 2 console/tlog');
    assertNoDisclosure(everything(rig.sinks.rendererSends), 'sink 3 renderer webContents.send');
    assertNoDisclosure(everything(rig.sinks.controllerLog), 'sink 4a controller log');
    assertNoDisclosure(everything(captured.value.started), 'sink 4b controller start() result');
    assertNoDisclosure(everything(responses), 'sink 5 IPC responses');
    assertNoDisclosure(everything([setup.detail, setup.versionReason, setup]), 'sink 6 setup state');
    assertNoDisclosure(everything([boundary]), 'sink 7 resolver public boundary');

    // The raw error object must not be stringified anywhere at all.
    const all = everything([rig.sinks.resolverLog, captured.consoleLines, rig.sinks.rendererSends,
      rig.sinks.controllerLog, responses, setup, boundary]);
    assert(all.indexOf('ENOENT') === -1, 'no errno from the raw error escapes');
    assert(all.indexOf('spawn ') === -1, 'no raw error message escapes');
    assert(all.indexOf('at ChildProcess') === -1, 'and no stack frame escapes');
  }

  // -----------------------------------------------------------------------------------------------
  process.stdout.write('\n4. The log line is a FIXED classification, pinned verbatim\n');
  // -----------------------------------------------------------------------------------------------
  {
    const okRig = makeRig(execFileOk);
    await okRig.resolver();
    eq(okRig.sinks.resolverLog.length, 1, 'one line on success');
    eq(okRig.sinks.resolverLog[0],
      `[pane-status] provider resolved via ${versionMod.RESOLUTION_METHOD} (version 2.1.228)`,
      'and it is the bounded success classification, verbatim');

    const failRig = makeRig(execFileFail);
    await failRig.resolver();
    eq(failRig.sinks.resolverLog.length, 1, 'one line on failure');
    eq(failRig.sinks.resolverLog[0],
      `[pane-status] provider version NOT established via ${versionMod.RESOLUTION_METHOD} `
      + '(version-probe-failed) — panes stay "unknown"',
      'and it is the bounded failure classification, verbatim');

    eq(versionMod.RESOLUTION_METHOD, 'powershell-get-command', 'the method constant is itself bounded');
    assert(/^[a-z][a-z0-9-]{0,63}$/.test(versionMod.RESOLUTION_METHOD),
      'and is shaped like every other bounded constant in this subsystem');
  }

  // -----------------------------------------------------------------------------------------------
  process.stdout.write('\n5. Version verification is NOT weakened, and selection is unchanged\n');
  // -----------------------------------------------------------------------------------------------
  {
    const rig = makeRig(execFileOk);
    const outcome = await rig.resolver();
    eq(outcome.executable, POISON, 'the SAME executable is still selected and returned internally');

    const gate = versionMod.createVersionGate({
      resolveVersion: rig.resolver, supportedVersions: ['2.1.228'], log: () => {},
    });
    await gate.probe();
    eq(gate.supported(), true, 'an allowlisted version is still supported');
    eq(gate.record().executable, POISON,
      'and the acceptance record still names it — internal, and reaching no sink (proved above)');

    const strict = versionMod.createVersionGate({
      resolveVersion: rig.resolver, supportedVersions: ['9.9.9'], log: () => {},
    });
    await strict.probe();
    eq(strict.supported(), false, 'a version outside the allowlist is still refused');
    eq(strict.reason(), versionMod.VERSION_REFUSAL.UNSUPPORTED, 'with the unsupported reason — fail-closed intact');
  }

  // -----------------------------------------------------------------------------------------------
  process.stdout.write('\n6. The source line is never interpolated into a log, structurally\n');
  // -----------------------------------------------------------------------------------------------
  {
    // Scanning a DIFFERENT file, never this one.
    const src = fs.readFileSync(path.join(__dirname, 'pane-status-version.js'), 'utf8');
    const code = src.split(/\r?\n/).filter((l) => l.trim().indexOf('//') !== 0
      && l.trim().indexOf('*') !== 0 && l.trim().indexOf('/*') !== 0).join('\n');
    assert(/\$\{outcome\.source\}/.test(code) === false,
      'no log template interpolates outcome.source');
    assert(/\$\{[a-zA-Z.]*executable\}/.test(code) === false,
      'and none interpolates an executable field either');
  }

  try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* best effort */ }
  process.stdout.write(`\npane-status-path-disclosure: ${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
})();
