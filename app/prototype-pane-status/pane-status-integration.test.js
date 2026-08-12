'use strict';
// Run: node app/prototype-pane-status/pane-status-integration.test.js
//
// EXPERIMENT A — PROTOTYPE ONLY. docs/OSS-PROCUREMENT-pane-status.md
// Blue's verdict, verbatim: BLUE SUBSYSTEM VERDICT: PROTOTYPE
//
// REVISION 2 suite — THE ONE THAT WOULD HAVE CAUGHT THE CRITICAL FINDING.
//
// Revision 1 shipped 3,390 green assertions while the feature was unreachable in the real
// application, because EVERY test constructed the subsystem with `observedVersion` supplied by hand.
// `app/main.js` supplied none, so every real view resolved to `unknown/version-mismatch`. The lesson
// is not "add a test" — it is "test the CALL SHAPE THE APPLICATION USES". So this file builds the
// subsystem exactly the way main.js does, and separately asserts against main.js's own source that
// the wiring it depends on is really there.

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const protocol = require('./pane-status-protocol');
const prototypeMod = require('./pane-status-prototype');

let passed = 0, failed = 0;
function assert(cond, label) {
  if (cond) { process.stdout.write(`  ✓ ${label}\n`); passed++; }
  else { process.stderr.write(`  ✗ FAIL: ${label}\n`); failed++; }
}
function eq(a, b, label) { assert(a === b, `${label} (got ${JSON.stringify(a)})`); }

const MAIN_SRC = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
const PRELOAD_SRC = fs.readFileSync(path.join(__dirname, '..', 'preload.js'), 'utf8');
const APP_SRC = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'app.js'), 'utf8');

const stubNet = () => ({ createServer: () => ({ on() {}, listen() {}, close() {} }) });

/**
 * A `net` stub that CAPTURES the connection handler, so a test can push real bytes through the real
 * server, the real protocol and the real store behind the object main.js holds — without binding a
 * pipe. This is how the suite proves an accepted event reaches a real state through the application's
 * own construction rather than through a hand-built store.
 */
function capturingNet() {
  const captured = {};
  return {
    net: {
      createServer(handler) {
        captured.handler = handler;
        return { on() {}, listen() {}, close() {} };
      },
    },
    /** Deliver one wire line as if a reporter had connected and written it. */
    deliver(line) {
      const { EventEmitter } = require('events');
      const socket = new EventEmitter();
      socket.setTimeout = () => {};
      socket.destroy = () => {};
      captured.handler(socket);
      socket.emit('data', Buffer.from(line, 'utf8'));
    },
  };
}

/**
 * Construct the prototype using the APPLICATION'S CALL SHAPE — deliberately WITHOUT `observedVersion`,
 * because main.js does not pass one. If this shape cannot reach a real state, the application cannot
 * either. That absence is the load-bearing property, and it is separately asserted against main.js's
 * own source further down.
 *
 * CORRECTED (revision 3, Low finding 5): this used to claim "EXACTLY the dependency set app/main.js
 * passes". It is not exact — `net` and `crypto` are injected TEST STUBS that main.js does not pass,
 * so the suite can exercise the real protocol/store/server without binding a pipe. Everything else
 * (`env`, `path`, `appDir`, `log`, `send`) mirrors main.js. Say what it is rather than overclaiming.
 */
function buildLikeMain(sends) {
  return prototypeMod.createPaneStatusPrototype({
    env: { BLUE_HELM_PANE_STATUS_PROTOTYPE: '1' },
    path,
    appDir: path.join(__dirname, '..'),
    log: () => {},
    send: (channel, payload) => sends.push({ channel, payload }),
    net: stubNet(),
    crypto,
  });
}

// ================================================================ the critical regression
process.stdout.write('\n-- main.js\'s own call shape can reach a non-unknown state --\n');
{
  const sends = [];
  const live = buildLikeMain(sends);
  eq(live.enabled, true, 'the gate-on construction is live');

  // Before discovery lands, the honest answer is `unknown` — that part revision 1 got right.
  const env = live.envForPane({ id: 'pty1', cli: 'claude' });
  const token = env.BLUE_HELM_PANE_STATUS_TOKEN;
  assert(protocol.TOKEN_PATTERN.test(token), 'the enrolled pane receives a well-formed token');
  eq(live.viewFor('pty1').state, 'unknown', 'before version discovery the badge is unknown');
  eq(live.viewFor('pty1').reason, 'version-mismatch', 'and says version-mismatch, not a guess');
  eq(live.observedVersion(), null, 'no version is assumed at construction');

  // THE assertion revision 1 could not make: discovery lands, and a real event reaches a real state.
  const supported = live.setObservedVersion('2.1.196');
  eq(supported, true, 'a supported discovered version is accepted');
  eq(live.observedVersion(), '2.1.196', 'and recorded');
  eq(live.viewFor('pty1').state, 'unknown', 'with no event yet the state is still unknown');
  eq(live.viewFor('pty1').reason, 'no-signal',
    'but the reason is now no-signal — the permanent version-mismatch FLOOR is gone');
}

// The full path, end to end, behind main.js's own construction: real protocol, real store, real
// server, real token. Nothing here is a hand-built stand-in except the pipe itself.
{
  const sends = [];
  const cap = capturingNet();
  const live = prototypeMod.createPaneStatusPrototype({
    env: { BLUE_HELM_PANE_STATUS_PROTOTYPE: '1' },
    path,
    appDir: path.join(__dirname, '..'),
    log: () => {},
    send: (channel, payload) => sends.push({ channel, payload }),
    net: cap.net,
    crypto,
  });
  assert(live.start().ok, 'the listener starts');
  const env = live.envForPane({ id: 'pty1', cli: 'claude' });
  const token = env.BLUE_HELM_PANE_STATUS_TOKEN;
  live.setObservedVersion('2.1.196');

  cap.deliver(protocol.encodeMessage('UserPromptSubmit', token));
  const view = live.viewFor('pty1');
  eq(view.state, 'working',
    'AN ACCEPTED EVENT REACHES "working" THROUGH MAIN\'S OWN OBJECT (the revision-1 critical defect)');
  eq(view.reason, null, 'with no degrade reason');
  const pushed = sends[sends.length - 1];
  eq(pushed.channel, prototypeMod.RENDERER_CHANNEL, 'and the renderer was pushed that view');
  eq(pushed.payload.state, 'working', 'carrying the real state, not unknown');
  assert(JSON.stringify(sends).indexOf(token) === -1, 'and no renderer send ever carried the token');

  cap.deliver(protocol.encodeMessage('Stop', token));
  eq(live.viewFor('pty1').state, 'turn ended', 'a second event advances the state');

  // Same path, with the version the application actually resolves and launches on this machine.
  // REVISION 3: `2.1.220` is now in the pinned list (exercised through the real Electron path under
  // the final work order), so this case asserts the POSITIVE outcome for it.
  const sendsB = [];
  const capB = capturingNet();
  const liveB = prototypeMod.createPaneStatusPrototype({
    env: { BLUE_HELM_PANE_STATUS_PROTOTYPE: '1' },
    path, appDir: path.join(__dirname, '..'), log: () => {},
    send: (c, p) => sendsB.push({ c, p }), net: capB.net, crypto,
  });
  liveB.start();
  const envB = liveB.envForPane({ id: 'pty1', cli: 'claude' });
  eq(liveB.setObservedVersion('2.1.220'), true,
    'the executable Blue Helm actually resolves (2.1.220) is an exercised version');
  capB.deliver(protocol.encodeMessage('UserPromptSubmit', envB.BLUE_HELM_PANE_STATUS_TOKEN));
  eq(liveB.viewFor('pty1').state, 'working',
    'AN ACCEPTED EVENT REACHES "working" UNDER THE APP-RESOLVED 2.1.220 EXECUTABLE');
  eq(liveB.viewFor('pty1').reason, null, 'with no degrade reason');

  // And the neighbouring version is STILL refused — two entries are a closed set, not a range.
  const sendsD = [];
  const capD = capturingNet();
  const liveD = prototypeMod.createPaneStatusPrototype({
    env: { BLUE_HELM_PANE_STATUS_PROTOTYPE: '1' },
    path, appDir: path.join(__dirname, '..'), log: () => {},
    send: (c, p) => sendsD.push({ c, p }), net: capD.net, crypto,
  });
  liveD.start();
  const envD = liveD.envForPane({ id: 'pty1', cli: 'claude' });
  eq(liveD.setObservedVersion('2.1.221'), false, 'an ADJACENT unexercised version is not supported');
  capD.deliver(protocol.encodeMessage('UserPromptSubmit', envD.BLUE_HELM_PANE_STATUS_TOKEN));
  eq(liveD.viewFor('pty1').state, 'unknown',
    'an accepted event under an UNEXERCISED version still refuses to display a state');
  eq(liveD.viewFor('pty1').reason, 'version-mismatch', 'and says exactly why');
}

// ================================================================ version propagation
process.stdout.write('\n-- discovered version governs enrolment, events, heartbeat and renderer --\n');
{
  const sends = [];
  const live = buildLikeMain(sends);
  live.envForPane({ id: 'pty1', cli: 'claude' });
  const before = sends.length;

  live.setObservedVersion('2.1.196');
  assert(sends.length > before, 'landing a version pushes a refreshed view to the renderer');
  const last = sends[sends.length - 1];
  eq(last.channel, prototypeMod.RENDERER_CHANNEL, 'on the prototype channel');
  eq(last.payload.paneId, 'pty1', 'for the enrolled pane');
  assert(last.payload.reason !== 'version-mismatch', 'and the refreshed view is no longer version-mismatched');

  // Discovery can also land BEFORE the pane enrolls. Both orders must work.
  const sendsB = [];
  const liveB = buildLikeMain(sendsB);
  eq(liveB.setObservedVersion('2.1.196'), true, 'a version may land before any pane enrolls');
  liveB.envForPane({ id: 'pty1', cli: 'claude' });
  eq(liveB.viewFor('pty1').reason, 'no-signal', 'and still governs the pane that enrolls afterwards');

  // Fail-closed: an unsupported or failed discovery must NOT assume compatibility.
  const sendsC = [];
  const liveC = buildLikeMain(sendsC);
  liveC.envForPane({ id: 'pty1', cli: 'claude' });
  eq(liveC.setObservedVersion('2.1.221'), false,
    'an unexercised version — adjacent to a supported one — is NOT supported');
  eq(liveC.viewFor('pty1').reason, 'version-mismatch', 'an unexercised version stays version-mismatch');
  eq(liveC.setObservedVersion(null), false, 'a FAILED discovery is recorded as null');
  eq(liveC.viewFor('pty1').reason, 'version-mismatch', 'and a failed discovery never assumes compatible');
  eq(liveC.observedVersion(), null, 'the null is stored as null, not coerced to a string');
}

// ================================================================ main.js wiring (source)
process.stdout.write('\n-- app/main.js really performs that wiring --\n');
{
  assert(MAIN_SRC.indexOf("require('./prototype-pane-status/pane-status-version')") !== -1,
    'main.js requires the version resolver');
  assert(/createClaudeVersionResolver\(\{[\s\S]{0,400}?commandName:\s*AGENT_CMD\.claude/.test(MAIN_SRC),
    'main.js probes the SAME bare command name it launches (AGENT_CMD.claude)');
  assert(/createClaudeVersionResolver\(\{[\s\S]{0,400}?env:\s*process\.env/.test(MAIN_SRC),
    'main.js probes with the same environment the PTY inherits, so resolution order matches');
  assert(MAIN_SRC.indexOf('paneStatus.setObservedVersion(') !== -1,
    'main.js feeds the discovered version into the prototype authority');
  assert(!/createPaneStatusPrototype\(\{[\s\S]{0,400}?observedVersion/.test(MAIN_SRC),
    'main.js does NOT hard-code an observedVersion at construction (it discovers one)');
  // No hard-coded installation path may reappear in main.js's discovery.
  assert(MAIN_SRC.indexOf('AppData\\\\Roaming\\\\npm') === -1 && MAIN_SRC.indexOf('claude.cmd') === -1,
    'main.js hard-codes no Claude installation path');

  // Spawn-failure release, in MAIN, not in the renderer.
  const spawnCatch = MAIN_SRC.slice(MAIN_SRC.indexOf('pty-start: pty.spawn FAILED'));
  const catchBlock = spawnCatch.slice(0, spawnCatch.indexOf('return { ok: false'));
  assert(catchBlock.indexOf('paneStatus.releasePane(id)') !== -1,
    'a PTY spawn failure releases the prototype enrolment in main\'s own failure path');

  // The renderer gate token is forwarded at window construction.
  assert(MAIN_SRC.indexOf('PANE_STATUS_RENDERER_ARG') !== -1,
    'main forwards the prototype gate token into the preload argv');
  assert(/additionalArguments:\s*\[[\s\S]{0,300}?paneStatusPrototypeEnabled\s*\?\s*\[PANE_STATUS_RENDERER_ARG\]/.test(MAIN_SRC),
    'and only when the gate is on');
}

// ================================================================ spawn-failure releases the slot
process.stdout.write('\n-- a failed spawn hands the single Experiment A slot back --\n');
{
  const sends = [];
  const live = buildLikeMain(sends);
  const first = live.envForPane({ id: 'pty1', cli: 'claude' });
  assert(Object.keys(first).length === 3, 'pane 1 enrolls and is handed the prototype env');
  eq(live.enrolledPaneId(), 'pty1', 'the slot is taken');

  // Simulate main's spawn-failure path.
  assert(live.releasePane('pty1'), 'main releases the enrolment when pty.spawn throws');
  eq(live.enrolledPaneId(), null, 'the slot is free again');

  const second = live.envForPane({ id: 'pty2', cli: 'claude' });
  eq(Object.keys(second).length, 3, 'the NEXT eligible Claude pane can enroll without an app restart');
  eq(live.enrolledPaneId(), 'pty2', 'and owns the slot');
  assert(second.BLUE_HELM_PANE_STATUS_TOKEN !== first.BLUE_HELM_PANE_STATUS_TOKEN,
    'the new pane gets a FRESH token — the dead pane\'s token is not reused');

  // Classic layout has no Dockview cleanup at all, which is why main must own this. Assert the
  // renderer is NOT the thing being relied on.
  //
  // Assert the ASSIGNMENT is gone, not the substring: app.js explains in a comment why the global was
  // removed, and that explanation is the rule being kept, not a breach of it — the same distinction
  // launcher-fence-invariant.test.js draws for `setx`.
  assert(!/window\.ccPaneStatusReattach\s*=/.test(APP_SRC),
    'the renderer no longer defines an unreachable reattach global');
  assert(APP_SRC.indexOf('self-healing on the next update') !== -1,
    'and says plainly what the badge actually does after a Dockview move instead');
}

// ================================================================ gate-off is ABSENT, not inert
process.stdout.write('\n-- gate off: the whole surface is absent --\n');
{
  const inert = prototypeMod.createPaneStatusPrototype({ env: {} });
  eq(inert.enabled, false, 'the gate-off object is inert');
  eq(inert.pipeName(), null, 'no pipe endpoint');
  eq(JSON.stringify(inert.envForPane({ id: 'pty1', cli: 'claude' })), '{}', 'no PTY prototype environment');
  eq(inert.enrolledPaneId(), null, 'no pane token');
  eq(inert.setObservedVersion('2.1.196'), false, 'a discovered version cannot animate the inert object');
  eq(inert.observedVersion(), null, 'and nothing is recorded behind it');
  eq(inert.viewFor('pty1'), null, 'no view');

  // PRELOAD: the bridge must be conditional on main's forwarded token, not unconditional.
  assert(PRELOAD_SRC.indexOf("contextBridge.exposeInMainWorld('cc'") !== -1, 'the main cc bridge still exists');
  assert(!/onPaneStatusPrototype[\s\S]{0,200}\}\);\s*$/.test(PRELOAD_SRC.slice(0, PRELOAD_SRC.indexOf("exposeInMainWorld('ccDockview'"))),
    'onPaneStatusPrototype is NOT a member of the always-exposed cc object any more');
  assert(/if\s*\(process\.argv\.includes\('--blue-helm-pane-status-prototype'\)\)/.test(PRELOAD_SRC),
    'the pane-status bridge is exposed only when main forwarded the gate token');
  const bridgeAt = PRELOAD_SRC.indexOf("exposeInMainWorld('ccPaneStatus'");
  const guardAt = PRELOAD_SRC.indexOf("process.argv.includes('--blue-helm-pane-status-prototype')");
  assert(guardAt !== -1 && bridgeAt > guardAt, 'the exposure sits INSIDE that guard');
  assert(!/invoke\(\s*['"]pane-status/.test(PRELOAD_SRC), 'and it exposes NO invoke() (receive-only)');

  // RENDERER: badge construction and subscription both hang off the bridge existing.
  assert(/window\.ccPaneStatus\s*&&\s*window\.ccPaneStatus\.enabled\s*&&\s*window\.ccPaneStatusBadge/.test(APP_SRC),
    'the renderer constructs a badge only when the gated bridge and module are both present');
  assert(APP_SRC.indexOf('window.ccPaneStatus.onPaneStatusPrototype(') !== -1,
    'and subscribes through the gated bridge rather than the always-on cc object');
  assert(APP_SRC.indexOf('cc.onPaneStatusPrototype') === -1,
    'the old unconditional cc.onPaneStatusPrototype subscription is gone');
}

// ================================================================ badge global is gated
process.stdout.write('\n-- the badge global exists only behind the gate --\n');
{
  const badgePath = require.resolve('../renderer/pane-status-badge.js');

  delete require.cache[badgePath];
  delete globalThis.ccPaneStatus;
  delete globalThis.ccPaneStatusBadge;
  const offExports = require(badgePath);
  assert(typeof offExports.createPaneStatusBadge === 'function', 'the module still exports for tests');
  eq(typeof globalThis.ccPaneStatusBadge, 'undefined',
    'GATE OFF: no window.ccPaneStatusBadge global is published');

  delete require.cache[badgePath];
  globalThis.ccPaneStatus = { enabled: true };
  require(badgePath);
  eq(typeof globalThis.ccPaneStatusBadge, 'object', 'GATE ON: the global is published');

  delete require.cache[badgePath];
  delete globalThis.ccPaneStatus;
  delete globalThis.ccPaneStatusBadge;
  globalThis.ccPaneStatus = { enabled: false };
  require(badgePath);
  eq(typeof globalThis.ccPaneStatusBadge, 'undefined', 'a falsy enabled flag publishes nothing either');
  delete globalThis.ccPaneStatus;
  delete globalThis.ccPaneStatusBadge;
}

// ================================================================ ordinary panes are untouched
process.stdout.write('\n-- ordinary pane launch is unchanged when disabled --\n');
{
  const inert = prototypeMod.createPaneStatusPrototype({ env: {} });
  for (const opts of [
    { id: 'pty1', cli: 'claude' },
    { id: 'pty2', cli: 'codex' },
    { id: 'pty3', cli: 'gemini' },
    { id: 'pty4', role: 'builder' },
    { id: 'pty5', videoScout: true },
    { id: 'pty6' },
  ]) {
    eq(JSON.stringify(inert.envForPane(opts)), '{}', `gate off adds no env to ${JSON.stringify(opts)}`);
  }
  // ptyEnv spreads {} — so the built environment is byte-identical to the pre-prototype one.
  assert(MAIN_SRC.indexOf('...paneStatusEnv,') !== -1, 'ptyEnv spreads the (empty) prototype env');
  assert(MAIN_SRC.indexOf("CLAUDE_CODE_SUBPROCESS_ENV_SCRUB: '1'") !== -1, 'and the credential scrub is intact');
}

process.stdout.write(`\npane-status-integration: ${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
