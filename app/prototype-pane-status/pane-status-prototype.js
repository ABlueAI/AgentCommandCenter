'use strict';
// EXPERIMENT A — PROTOTYPE ONLY. The single entry point main.js touches.
//
// Procurement record: docs/OSS-PROCUREMENT-pane-status.md
// Blue's verdict, verbatim: BLUE SUBSYSTEM VERDICT: PROTOTYPE
//
// Everything the prototype adds to the application lives behind this one module and behind ONE
// environment gate. The core invariant is enforced here rather than by discipline in main.js:
//
//   GATE OFF  -> createPaneStatusPrototype() returns the INERT object. No pipe, no token, no IPC
//                channel, no badge, no env additions to any PTY. `envForPane()` returns {} for every
//                pane, always, and there is no branch in the inert object that can do otherwise.
//   GATE ON   -> exactly one Claude pane is enrolled, and only that pane's PTY environment gains the
//                pipe name and token.
//
// The inert path is a DIFFERENT OBJECT, not the live object with a flag checked in each method — the
// same shape-not-flag posture as preload.js's `ccDockview`. A missed flag check cannot leak, because
// there is nothing behind the inert methods to leak.

const protocol = require('./pane-status-protocol');
const { createPaneStatusStore } = require('./pane-status-store');
const { createPaneStatusServer, buildPipeName } = require('./pane-status-server');
const reporter = require('./pane-status-reporter');

const GATE_ENV = 'BLUE_HELM_PANE_STATUS_PROTOTYPE';
const RENDERER_CHANNEL = 'pane-status-prototype';
// Forwarded into the preload's argv at window construction (the same mechanism `--cc-classic-layout`
// uses) so the PRELOAD can decide whether the prototype bridge exists at all. Renderer script cannot
// add, remove, or forge a process argument, so this is a decision main makes and the renderer obeys.
// Revision 2: without this the preload method, the renderer subscription and the badge global existed
// unconditionally, which contradicted "gate off means absent".
const RENDERER_ARG = '--blue-helm-pane-status-prototype';

/** The one gate. Exact string '1' — not truthiness, so a stray empty string cannot enable it. */
function isPrototypeEnabled(env) {
  return !!env && env[GATE_ENV] === '1';
}

/** A pane is eligible only if it is a plain Claude pane. Video Scout (Gemini) is never eligible. */
function isEligibleClaudePane(opts) {
  const o = opts || {};
  if (o.videoScout) return false;
  const cli = o.cli || o.agent || null;
  if (cli === 'claude') return true;
  // Role-launched panes run `claude --agent <role>`; main's buildAgentCommand maps roles to Claude.
  return !!o.role && cli === null;
}

/** The inert object. Every method is a no-op that returns the safest possible value. */
function createInertPrototype() {
  return {
    enabled: false,
    start() { return { ok: false, reason: 'prototype-disabled' }; },
    stop() { return false; },
    envForPane() { return {}; },
    releasePane() { return false; },
    viewFor() { return null; },
    enrolledPaneId() { return null; },
    metrics() { return null; },
    stats() { return { enabled: false }; },
    pipeName() { return null; },
    // Present so a caller that discovers a version never has to null-check the gate, and inert so a
    // discovered version cannot bring anything to life behind a disabled gate.
    setObservedVersion() { return false; },
    observedVersion() { return null; },
  };
}

/**
 * deps:
 *   env            -> process.env (gate is read from here)
 *   net, crypto    -> node modules (injected for tests)
 *   path           -> node path module
 *   appDir         -> absolute path to app/ (used to locate the reporter file)
 *   send(channel, payload) -> renderer sender; called ONLY with the token-free view object
 *   log(line)      -> bounded logger
 *   now()          -> injected clock
 *   observedVersion-> installed Claude version string, if probed
 */
function createPaneStatusPrototype(deps) {
  const d = deps || {};
  if (!isPrototypeEnabled(d.env)) return createInertPrototype();

  const cryptoModule = d.crypto || require('crypto');
  const netModule = d.net || require('net');
  const pathModule = d.path || require('path');
  const log = typeof d.log === 'function' ? d.log : () => {};
  const now = typeof d.now === 'function' ? d.now : () => Date.now();
  const send = typeof d.send === 'function' ? d.send : () => {};
  const appDir = d.appDir || __dirname;

  const store = createPaneStatusStore({
    now,
    crypto: cryptoModule,
    randomToken: () => cryptoModule.randomBytes(32).toString('hex'),
    observedVersion: d.observedVersion || null,
    log,
  });

  const pipeName = buildPipeName(cryptoModule.randomBytes(12).toString('hex'));
  const server = createPaneStatusServer({
    net: netModule,
    store,
    pipeName,
    now,
    log,
    onStateChange: (view) => { if (view) send(RENDERER_CHANNEL, view); },
  });

  const reporterPath = pathModule.join(appDir, 'prototype-pane-status', 'pane-status-reporter.js');

  // Staleness is a claim about the passage of time, so it needs a heartbeat: without one, a pane that
  // went quiet would keep showing its last state forever and the badge would be quietly lying.
  let heartbeat = null;
  function startHeartbeat() {
    if (heartbeat) return;
    heartbeat = setInterval(() => {
      const paneId = store.enrolledPaneId();
      if (!paneId) return;
      const view = store.viewFor(paneId);
      if (view) send(RENDERER_CHANNEL, view);
    }, 15000);
    if (typeof heartbeat.unref === 'function') heartbeat.unref();
  }

  return {
    enabled: true,
    start() {
      const started = server.start();
      if (started.ok) startHeartbeat();
      log(`[pane-status] PROTOTYPE MODE ACTIVE — Experiment A (Claude only, one pane). Verdict: BLUE SUBSYSTEM VERDICT: PROTOTYPE`);
      return started;
    },
    stop() {
      if (heartbeat) { clearInterval(heartbeat); heartbeat = null; }
      store.releasePane();
      return server.stop();
    },
    /**
     * The ONLY place the token ever leaves main, and it leaves into exactly one child process
     * environment. Returns {} for every pane except the single enrolled Claude pane.
     */
    envForPane(opts) {
      if (!isEligibleClaudePane(opts)) return {};
      const paneId = opts && opts.id;
      const enrolledNow = store.enrolledPaneId();
      if (enrolledNow && enrolledNow !== paneId) {
        log(`[pane-status] pane ${paneId} launched WITHOUT status: Experiment A already bound to ${enrolledNow}`);
        return {};
      }
      const result = enrolledNow === paneId ? { ok: false, reason: 'already-enrolled' } : store.enrollPane(paneId);
      if (!result.ok) return {};
      send(RENDERER_CHANNEL, store.viewFor(paneId));
      return {
        [GATE_ENV]: '1',
        [reporter.PIPE_ENV]: pipeName,
        [reporter.TOKEN_ENV]: result.token,
      };
    },
    releasePane(paneId) {
      const released = store.releasePane(paneId);
      if (released) send(RENDERER_CHANNEL, { paneId, state: 'unknown', reason: 'released', prototype: true });
      return released;
    },
    /**
     * Record the provider version discovered against the executable the pane actually launches.
     *
     * Discovery is asynchronous (it costs a PowerShell profile load), so it can land before OR after
     * the pane enrolls. Both orders must work, which is why the store reads `observedVersion` at
     * view time rather than caching a resolved state: setting it here immediately governs every
     * later delivered event, heartbeat tick and renderer update. A pane that enrolled while the
     * version was still unknown is refreshed right now, so the badge corrects itself rather than
     * waiting for the next hook event.
     *
     * A null/failed discovery is recorded as null, which keeps the badge at `unknown` — never
     * "assume compatible".
     */
    setObservedVersion(version) {
      store.setObservedVersion(version);
      const paneId = store.enrolledPaneId();
      if (paneId) send(RENDERER_CHANNEL, store.viewFor(paneId));
      return store.versionSupported();
    },
    observedVersion: () => store.stats().observedVersion,
    viewFor: (paneId) => store.viewFor(paneId),
    enrolledPaneId: () => store.enrolledPaneId(),
    metrics: () => server.metrics(),
    stats: () => ({ enabled: true, pipeName, ...store.stats(), transport: server.metrics() }),
    pipeName: () => pipeName,
    reporterPath: () => reporterPath,
  };
}

const api = {
  GATE_ENV,
  RENDERER_CHANNEL,
  RENDERER_ARG,
  isPrototypeEnabled,
  isEligibleClaudePane,
  createInertPrototype,
  createPaneStatusPrototype,
  protocol,
};
if (typeof module === 'object' && module.exports) module.exports = api;
