'use strict';
// Run: node app/pane-status/pane-status-lifecycle.test.js
//
// PANE AND WINDOW LIFECYCLE — advisory-review findings 6 and 9.
//
//   6. PTY EXIT IS AUTHORITATIVE, and window teardown must actually happen.
//      Work Order 1 § F.7 specified that `p.onExit` sets the pane to `exited` immediately and then
//      revokes its token. The previous build dropped it silently: `p.onExit` touched pane status not at
//      all, and `controller.shutdown()` — which exists, and is correct — was never called from
//      anywhere. So a pane whose process had ended kept displaying `working` for up to 120 seconds,
//      and its bearer token stayed valid for the same window with no legitimate holder alive.
//
//   9. READY MEANS LISTENING. `server.listen()` is asynchronous; returning `{ok:true}` on the next
//      line meant a pipe that failed to bind still produced a green badge, a running heartbeat, and
//      panes enrolled with a token nothing was listening for.
//
// Binding Amendment A § 4 additionally requires that fixing 6 does NOT disturb the video-scout run-ID
// registry, whose lifetime is deliberately different. Both are proven together below.

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const controllerMod = require('./pane-status-controller');
const freshness = require('./pane-status-freshness');
const protocol = require('./pane-status-protocol');
const shimMod = require('./pane-status-runtime-shim');
const { createRunIdRegistry } = require('../video-scout-run-id');

let passed = 0, failed = 0;
function assert(cond, label) {
  if (cond) { process.stdout.write(`  ✓ ${label}\n`); passed++; }
  else { process.stderr.write(`  ✗ FAIL: ${label}\n`); failed++; }
}
function eq(a, b, label) { assert(a === b, a === b ? label : `${label} (got ${JSON.stringify(a)})`); }

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bh-lifecycle-'));
const MAIN_SRC = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
// Assertions about what main.js DOES read main.js's CODE: its correction comments quote the
// constructs they added and removed, and a raw scan would match the explanation instead of the fix.
const MAIN_CODE = MAIN_SRC.split(/\r?\n/).filter((l) => l.trim().indexOf('//') !== 0).join('\n');

/** Extract one handler body from main.js by its opening line, brace-matched. */
function handlerBody(code, opener) {
  const start = code.indexOf(opener);
  if (start === -1) return '';
  let depth = 0, i = code.indexOf('{', start);
  const from = i;
  for (; i < code.length; i++) {
    if (code[i] === '{') depth++;
    else if (code[i] === '}') { depth--; if (depth === 0) return code.slice(from, i + 1); }
  }
  return '';
}

let seq = 0;
function makeController(overrides) {
  const dir = path.join(root, 'c' + (seq++));
  const userData = path.join(dir, 'userData');
  const settingsDir = path.join(dir, 'claude');
  const settingsPath = path.join(settingsDir, 'settings.json');
  fs.mkdirSync(userData, { recursive: true });
  fs.mkdirSync(settingsDir, { recursive: true });
  fs.writeFileSync(settingsPath, '{}\n');
  const views = [];
  const setups = [];
  let clock = 1000;
  const c = controllerMod.createPaneStatusController(Object.assign({
    userDataPath: userData, settingsDir, settingsPath,
    installId: 'd'.repeat(32),
    cmdExe: shimMod.resolveCmdExe(process.env),
    reporterPath: path.join(__dirname, 'pane-status-reporter.js'),
    currentRuntimePath: process.execPath,
    net: require('net'), crypto,
    randomToken: () => crypto.randomBytes(32).toString('hex'),
    resolveVersion: async () => ({ ok: true, raw: '9.9.9 (Claude Code)' }),
    resolveProcessStartTime: async () => ({ ok: true, running: false }),
    supportedVersions: ['9.9.9'],
    publishView: (v) => views.push(v),
    publishSetupState: (s) => setups.push(s),
    now: () => clock,
    log: () => {},
  }, overrides || {}));
  return { c, views, setups, tick: (ms) => { clock += ms; }, settingsPath, userData };
}

(async () => {
  // -----------------------------------------------------------------------------------------------
  process.stdout.write('\n6. PTY exit publishes `exited` and revokes the token IMMEDIATELY\n');
  // -----------------------------------------------------------------------------------------------
  {
    const rig = makeController();
    await rig.c.install();
    eq(rig.c.getSetupState().state, 'ready', 'the fixture is ready');
    const enrolled = rig.c.enrollPane('pty1');
    assert(enrolled.ok === true, 'a pane enrolls');
    const token = enrolled.env.BLUE_HELM_PANE_STATUS_TOKEN;

    rig.c.registry.applyMessage({ e: 'UserPromptSubmit', t: token });
    eq(rig.c.registry.viewFor('pty1').state, 'working', 'and goes to working');

    rig.views.length = 0;
    const had = rig.c.notePaneExit('pty1');
    assert(had === true, 'notePaneExit reports that the pane existed');
    assert(rig.views.length >= 1, 'a view was published');
    eq(rig.views[0].state, 'exited', 'and the FIRST thing published is `exited`, not a blank unknown');
    eq(rig.views[0].paneId, 'pty1', 'for that exact pane');

    // Revocation happens AFTER the publish, and it is immediate.
    assert(rig.c.registry.has('pty1') === false, 'the pane is revoked in the same call');
    const late = rig.c.registry.applyMessage({ e: 'Stop', t: token });
    assert(late.ok === false || late.applied === 'none',
      'the old token stops working IMMEDIATELY — no 120-second window of a live token with no holder');

    // No wait, and no dependence on a SessionEnd hook that may never fire.
    rig.tick(1);
    eq(rig.views[0].state, 'exited', 'the state did not need the staleness bound to arrive');
    assert(protocol.EVENT_STATE.SessionEnd === 'exited',
      'SessionEnd would have said the same thing — but PTY exit is main\'s own knowledge and outranks it');

    // notePaneExit on an unknown pane is a no-op, not a throw or a spurious view.
    rig.views.length = 0;
    eq(rig.c.notePaneExit('never-existed'), false, 'an unknown pane is a no-op');
    eq(rig.views.length, 0, 'and publishes nothing');
  }

  // -----------------------------------------------------------------------------------------------
  process.stdout.write('\n   explicit close is a DIFFERENT thing, and stays different\n');
  // -----------------------------------------------------------------------------------------------
  {
    const rig = makeController();
    await rig.c.install();
    rig.c.enrollPane('pty2');
    rig.views.length = 0;
    rig.c.releasePane('pty2', 'pane-closed');
    eq(rig.views[0].state, 'unknown', 'an explicitly closed pane goes to unknown');
    eq(rig.views[0].reason, freshness.UNKNOWN_REASON.NO_SIGNAL, 'with no-signal — there is nothing left to report');
    assert(rig.views[0].state !== 'exited',
      'NOT `exited`: a pane the user closed did not necessarily have a process that ended');
  }

  // -----------------------------------------------------------------------------------------------
  process.stdout.write('\n   window teardown is wired, and idempotent\n');
  // -----------------------------------------------------------------------------------------------
  {
    const rig = makeController();
    await rig.c.install();
    rig.c.enrollPane('a');
    rig.c.enrollPane('b');
    eq(rig.c.registry.enrolledPaneIds().length, 2, 'two panes are enrolled');
    assert(rig.c.pipeName() !== null, 'and the transport is up');

    eq(rig.c.shutdown(), true, 'shutdown runs');
    eq(rig.c.registry.enrolledPaneIds().length, 0, 'every token is revoked');
    eq(rig.c.pipeName(), null, 'the pipe is stopped');
    eq(rig.c.isReporting(), false, 'and reporting is off');
    eq(rig.c.enrollPane('c').ok, false, 'no pane can enroll afterwards');

    eq(rig.c.shutdown(), false, 'a SECOND shutdown does nothing');
    eq(rig.c.isShutDown(), true, 'and the controller says so');
    eq(rig.c.shutdown(), false, 'repeated shutdown stays safe');
  }

  // -----------------------------------------------------------------------------------------------
  process.stdout.write('\n   main.js really calls both — and the run-ID registry keeps its own lifetime\n');
  // -----------------------------------------------------------------------------------------------
  {
    const onExit = handlerBody(MAIN_CODE, 'p.onExit(');
    assert(onExit.length > 0, 'the p.onExit handler was located in main.js');
    assert(/paneStatus\.notePaneExit\(id\)/.test(onExit), 'p.onExit calls paneStatus.notePaneExit(id)');
    assert(!/videoScoutRunIds\.remove/.test(onExit),
      'and does NOT remove the video-scout run-ID mapping — that behaviour is deliberate and unchanged');
    assert(/admissionBudget\.notePaneExit\(id\)/.test(onExit), 'admission closeout still runs on exit');
    assert(/admissionIpc\.forgetPane\(id\)/.test(onExit), 'and so does the admission IPC cleanup');
    assert(/ptys\.delete\(id\)/.test(onExit), 'the PTY handle is still dropped');

    const onKill = handlerBody(MAIN_CODE, "ipcMain.on('pty-kill'");
    assert(onKill.length > 0, 'the pty-kill handler was located');
    assert(/videoScoutRunIds\.remove\(id\)/.test(onKill), 'EXPLICIT close still removes the run-ID mapping');
    assert(/paneStatus\.releasePane\(id\)/.test(onKill), 'and releases the pane rather than marking it exited');
    assert(!/paneStatus\.notePaneExit/.test(onKill), 'the two paths stay distinct');

    const onAllClosed = handlerBody(MAIN_CODE, "app.on('window-all-closed'");
    assert(onAllClosed.length > 0, 'the window-all-closed handler was located');
    assert(/paneStatus\.shutdown\(\)/.test(onAllClosed), 'window teardown calls paneStatus.shutdown()');
    assert(/videoScoutRunIds\.clear\(\)/.test(onAllClosed), 'and still clears the run-ID mapping');

    // The comment that records WHY the run-ID mapping outlives the process must survive the change.
    assert(/deliberately does NOT remove the run-ID mapping/.test(MAIN_SRC),
      'the original V5b1 rationale is preserved verbatim in main.js, not silently dropped');
    assert(/intentionally OUTLIVES p\.onExit/.test(MAIN_SRC),
      'along with the note that the mapping outlives p.onExit');

    // ---- and the two lifetimes, driven for real
    const rig = makeController();
    await rig.c.install();
    const runIds = createRunIdRegistry();
    const enrolled = rig.c.enrollPane('scout1');
    const token = enrolled.env.BLUE_HELM_PANE_STATUS_TOKEN;
    runIds.set('scout1', 'run-20260823-000000-000-11111-abcdefgh');
    rig.c.registry.applyMessage({ e: 'UserPromptSubmit', t: token });

    // THE PROCESS ENDS. Both registries are told the same fact and answer differently, on purpose.
    rig.views.length = 0;
    rig.c.notePaneExit('scout1');

    eq(rig.views[0].state, 'exited', 'PANE STATUS: publishes exited on process exit');
    eq(rig.c.registry.has('scout1'), false, 'PANE STATUS: and revokes the token immediately');
    assert(runIds.has('scout1'),
      'VIDEO SCOUT: the completed run\'s report mapping SURVIVES the process exit — unchanged V5b1 behaviour');
    eq(runIds.get('scout1'), 'run-20260823-000000-000-11111-abcdefgh', 'byte-identical');

    // Explicit close removes the run mapping; teardown clears whatever is left.
    runIds.remove('scout1');
    eq(runIds.has('scout1'), false, 'VIDEO SCOUT: explicit pane close DOES remove it');
    runIds.set('scout2', 'run-20260823-000001-000-22222-ijklmnop');
    runIds.clear();
    eq(runIds.size, 0, 'VIDEO SCOUT: and window teardown clears the mapping');
  }

  // -----------------------------------------------------------------------------------------------
  process.stdout.write('\n9. READY means LISTENING — a transport that never bound is never ready\n');
  // -----------------------------------------------------------------------------------------------
  {
    // A `net` whose listen() fails asynchronously, exactly as EADDRINUSE does.
    function failingNet(when) {
      return {
        createServer(handler) {
          const listeners = {};
          const srv = {
            on(ev, fn) { (listeners[ev] = listeners[ev] || []).push(fn); return srv; },
            once(ev, fn) { return srv.on(ev, fn); },
            close() { srv.closed = true; },
            listen() {
              setImmediate(() => {
                const err = Object.assign(new Error('busy'), { code: 'EADDRINUSE' });
                for (const fn of (listeners[when === 'pre' ? 'error' : 'listening'] || [])) fn(err);
                if (when === 'post') {
                  setImmediate(() => { for (const fn of (listeners.error || [])) fn(err); });
                }
              });
            },
            handler,
          };
          return srv;
        },
      };
    }

    // PRE-listen error: nothing is ready, nothing beats, nothing enrolls.
    {
      const rig = makeController({ net: failingNet('pre') });
      const res = await rig.c.install();
      assert(res.ok === false, 'install reports failure');
      assert(rig.c.getSetupState().state !== 'ready', 'the setup state is NOT ready');
      eq(rig.c.getSetupState().state, 'malformed', 'it is a bounded visible error state');
      eq(rig.c.pipeName(), null, 'no transport is retained');
      eq(rig.c.isReporting(), false, 'reporting is off');
      eq(rig.c.enrollPane('x').ok, false, 'and NO pane can enroll');
      eq(rig.c.enrollPane('x').reason, 'not-ready', 'with an honest reason');
    }

    // POST-ready error: it WAS ready, and it stops claiming to be.
    {
      const rig = makeController({ net: failingNet('post') });
      const res = await rig.c.install();
      assert(res.ok === true, 'install succeeds while the listener is genuinely up');
      eq(rig.c.getSetupState().state, 'ready', 'READY is claimed only after `listening` fired');
      assert(rig.c.pipeName() !== null, 'the transport is retained');
      await new Promise((r) => setImmediate(() => setImmediate(r)));
      assert(rig.c.getSetupState().state !== 'ready',
        'and when the transport dies afterwards, READY is withdrawn rather than left standing');
      eq(rig.c.pipeName(), null, 'the dead transport is dropped');
      eq(rig.c.enrollPane('y').ok, false, 'no further pane enrolls over a transport that is gone');
    }

    // The healthy case still works, and READY genuinely followed `listening`.
    {
      const rig = makeController();
      const res = await rig.c.install();
      assert(res.ok === true, 'a real named pipe still installs');
      eq(rig.c.getSetupState().state, 'ready', 'and reaches ready');
      assert(rig.c.enrollPane('z').ok === true, 'a pane enrolls over it');
      rig.c.shutdown();
    }
  }

  try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* best effort */ }
  process.stdout.write(`\npane-status-lifecycle: ${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
})();
