'use strict';
// Blue Helm production pane status — the controller.
//
// Procurement record: docs/OSS-PROCUREMENT-pane-status.md
// Blue's verdict, verbatim: BLUE SUBSYSTEM VERDICT: BUILD FRESH
//
// The one object main.js talks to. It owns the setup state machine, the heartbeat, pane enrollment,
// and the ordering rules that only make sense when you can see the whole subsystem at once — most
// importantly: SUCCESSFUL REMOVAL PUBLISHES `unknown`/`hook-removed` BEFORE TOKENS ARE REVOKED, so the
// badge tells the truth in the same tick rather than going blank and being explained later.
//
// PROCESS AND CONSEQUENTIAL-ACTION ISOLATION (§ 15). Applying a provider event, running the heartbeat,
// resolving freshness, rendering, enrolling, revoking a token, and releasing a pane perform ZERO
// process creation and zero process control. There are exactly two child-process dependencies in the
// whole subsystem, both INJECTED and both unreachable from any of those paths:
//
//   A. `resolveVersion` — explicit setup, installed-startup discovery, ordered acceptance re-probe.
//   B. `resolveProcessStartTime` — natively-confirmed clearStaleLock only.
//
// There is deliberately no broad "bounded runtime operations" exception. If a future edit needs a
// third, it has to argue for it by name.
//
// PANE STATUS CANNOT AUTHORIZE ANYTHING. Nothing in this file calls approve, merge, push, close a
// pane, touch admission, relaunch, quit, or read a credential. The negative-control suite drives all
// eight events and every lifecycle path and asserts zero calls to each.

const freshness = require('./pane-status-freshness');
const registryMod = require('./pane-status-registry');
const pipeMod = require('./pane-status-pipe');
const versionMod = require('./pane-status-version');
const lockMod = require('./pane-status-lock');
const txnMod = require('./pane-status-settings-txn');
const recoveryMod = require('./pane-status-recovery');
const descriptorMod = require('./pane-status-descriptor');
const doc = require('./pane-status-settings-doc');
const shimMod = require('./pane-status-runtime-shim');

// Everything the toolbar control can honestly say. Each is a distinct situation with a distinct fix.
const SETUP_STATE = Object.freeze({
  DISABLED: 'disabled',
  IN_FLIGHT: 'in-flight',
  READY: 'ready',
  VERSION_MISMATCH: 'version-mismatch',
  LOCKED: 'locked',
  OTHER_INSTALLATION: 'other-installation',
  MALFORMED: 'malformed',
  RECONCILIATION_REQUIRED: 'reconciliation-required',
});

/**
 * R3 — REMOVAL HAS THREE OUTCOMES, NOT TWO, AND THE THIRD ONE IS NEW.
 *
 *   COMPLETE                  the filesystem transaction landed AND the renderer confirmed delivery
 *   PRESENTATION_UNCONFIRMED  the filesystem transaction landed; delivery was NOT confirmed
 *   (refusal)                 nothing was written; carried on the ok:false path, unchanged
 *
 * The middle one did not exist in the previously reviewed contract. It is deliberately NOT collapsed
 * into an unconditional ok:true: a caller reading only `ok` would announce a clean removal over a
 * display that may still be showing live pane badges. It is equally not an ok:false — the settings
 * transaction is finished and correct, and presentation failure never rolls it back.
 */
const REMOVAL_DISPOSITION = Object.freeze({
  COMPLETE: 'complete',
  PRESENTATION_UNCONFIRMED: 'presentation-unconfirmed',
});

/**
 * deps (all injected; nothing is resolved from a real home directory here):
 *   userDataPath, settingsPath, installId, cmdExe, reporterPath, currentRuntimePath
 *   net, crypto
 *   randomToken()               -> 64-hex CSPRNG
 *   resolveVersion()            -> child-process dependency A
 *   resolveProcessStartTime(pid)-> child-process dependency B
 *   publishView(view)           -> send one pane view to the renderer
 *   publishSetupState(state)    -> send the toolbar state to the renderer
 *   now(), log(line)
 *   setInterval/clearInterval   -> injectable so the heartbeat is testable on a fake clock
 */
function createPaneStatusController(deps) {
  const d = deps || {};
  const userDataPath = d.userDataPath;
  const settingsPath = d.settingsPath;
  const installId = d.installId;
  const cmdExe = d.cmdExe || shimMod.resolveCmdExe();
  const reporterPath = d.reporterPath;
  const currentRuntimePath = d.currentRuntimePath;
  const net = d.net;
  const cryptoModule = d.crypto;
  const randomToken = d.randomToken;
  const publishView = typeof d.publishView === 'function' ? d.publishView : () => {};
  const publishSetupState = typeof d.publishSetupState === 'function' ? d.publishSetupState : () => {};
  const now = typeof d.now === 'function' ? d.now : () => Date.now();
  const log = typeof d.log === 'function' ? d.log : () => {};
  const setIntervalFn = d.setInterval || setInterval;
  const clearIntervalFn = d.clearInterval || clearInterval;

  const versionGate = versionMod.createVersionGate({
    resolveVersion: d.resolveVersion,
    supportedVersions: d.supportedVersions,
    log,
  });

  const registry = registryMod.createPaneStatusRegistry({
    now, randomToken, crypto: cryptoModule,
    isVersionSupported: () => versionGate.supported(),
    staleMs: d.staleMs,
    log,
  });

  const lock = lockMod.createPaneStatusLock({
    installId,
    settingsDir: d.settingsDir,
    now, log,
    resolveProcessStartTime: d.resolveProcessStartTime,
  });

  const txn = txnMod.createSettingsTransaction({
    userDataPath, settingsPath, installId, lock, cmdExe, log, now,
  });

  const recovery = recoveryMod.createRecovery({
    userDataPath, settingsPath, installId, cmdExe,
    currentRuntimePath, reporterPath, log, now,
  });

  let setupState = SETUP_STATE.DISABLED;
  let setupDetail = null;
  let pipe = null;
  let heartbeat = null;
  let inFlight = false;
  let reportingEnabled = false;
  let shutDown = false;
  // R3. Monotonic count of renderer pushes that were NOT confirmed delivered. Never reset; callers
  // read it before and after an operation and compare, so concurrent activity cannot mask a failure.
  let deliveryFailures = 0;

  /**
   * R3 — RENDERER DELIVERY IS OBSERVED, NEVER ASSUMED. The publishers already returned false when the
   * window is gone, has no webContents, or the send threw; every one of those returns used to be
   * discarded at the call site, so a dropped notice was indistinguishable from a delivered one. These
   * two wrappers are now the ONLY places this module publishes. A failure increments the counter and
   * is logged. Neither wrapper touches the registry, the settings, or the descriptor: observing that a
   * window did not answer must never change what is on disk.
   */
  function deliverView(view) {
    try { if (publishView(view) === false) deliveryFailures++; }
    catch (e) {
      deliveryFailures++;
      log(`[pane-status] view delivery failed: ${(e && e.code) || 'send-threw'}`);
    }
  }

  function deliverSetupState(state) {
    try { if (publishSetupState(state) === false) deliveryFailures++; }
    catch (e) {
      deliveryFailures++;
      log(`[pane-status] setup-state delivery failed: ${(e && e.code) || 'send-threw'}`);
    }
  }

  function setSetupState(state, detail) {
    setupState = state;
    setupDetail = detail || null;
    // Reporting is permitted in exactly one state. Everything else is honest ignorance.
    reportingEnabled = state === SETUP_STATE.READY;
    registry.setOverrideReason(overrideReasonFor(state));
    // Send the FULL state object; pane-status-ipc projects it down to the renderer-visible subset.
    // Passing a partial object here would silently blank fields the toolbar needs.
    deliverSetupState(getSetupState());
    publishAllViews();
  }

  function overrideReasonFor(state) {
    switch (state) {
      case SETUP_STATE.READY: return null;
      case SETUP_STATE.RECONCILIATION_REQUIRED: return freshness.UNKNOWN_REASON.RECONCILIATION_REQUIRED;
      case SETUP_STATE.DISABLED: return freshness.UNKNOWN_REASON.NOT_INSTALLED;
      // version-mismatch is resolved by the version gate itself, so no override is needed; locked,
      // other-installation and malformed are all "installed but we must not believe it".
      case SETUP_STATE.VERSION_MISMATCH: return null;
      default: return freshness.UNKNOWN_REASON.RECONCILIATION_REQUIRED;
    }
  }

  function publishAllViews() {
    for (const view of registry.views()) if (view) deliverView(view);
  }

  // ------------------------------------------------------------------ pane lifecycle (no spawning)
  /**
   * Enroll a pane and return the environment variables its PTY must carry. This is the ONLY way a
   * token leaves the registry, and the caller puts it straight into the spawn environment.
   */
  function enrollPane(paneId) {
    if (!reportingEnabled || !pipe) return { ok: false, reason: 'not-ready' };
    const res = registry.enroll(paneId);
    if (!res.ok) return res;
    deliverView(registry.viewFor(paneId));
    return {
      ok: true,
      env: {
        BLUE_HELM_PANE_STATUS_PIPE: pipe.pipeName,
        BLUE_HELM_PANE_STATUS_TOKEN: res.token,
      },
    };
  }

  /**
   * EXPLICIT pane close (pty-kill), spawn failure, window teardown. Zero process control.
   *
   * The pane is going away as a UI object, so the honest badge is `unknown`/`no-signal`: there is
   * nothing left to report about. This is deliberately NOT the PTY-exit path — see notePaneExit.
   */
  function releasePane(paneId, reason) {
    const had = registry.has(paneId);
    registry.revoke(paneId, reason || 'pane-released');
    if (had) deliverView({ paneId, state: 'unknown', reason: freshness.UNKNOWN_REASON.NO_SIGNAL });
    return had;
  }

  /**
   * PTY PROCESS EXIT — main's own knowledge, and therefore AUTHORITATIVE.
   *
   * CORRECTION (advisory review, finding 6). Work Order 1 § F.7 specified this and the previous build
   * dropped it silently: `p.onExit` touched pane status not at all, so a pane whose process had
   * genuinely ended kept its last state and its live token until the 120-second staleness bound
   * eventually aged it into `unknown`. Two consequences, both wrong. The badge showed `working` for a
   * process that no longer existed — a confidently wrong display, which is the one thing the invariant
   * forbids — and the token stayed valid for two minutes after the only legitimate holder had died.
   *
   * ORDER MATTERS, the same way it does in remove(): publish `exited` FIRST, while the pane is still
   * addressable, then revoke. Revoking first would blank the badge and leave nothing to explain it.
   *
   * This does NOT wait for a `SessionEnd` hook, which may never arrive, and it is a DISTINCT operation
   * from releasePane because the two mean different things: `exited` is a real terminal lifecycle
   * state a human wants to see, `unknown`/`no-signal` is the absence of one.
   */
  function notePaneExit(paneId) {
    const had = registry.has(paneId);
    if (had) deliverView({ paneId, state: 'exited', reason: null });
    registry.revoke(paneId, 'pty-exit');
    return had;
  }

  // ------------------------------------------------------------------ startup
  /**
   * Startup discovery. Reconciles the descriptor (never settings), then — only if we are installed —
   * runs the version probe, which is child-process dependency A in one of its three permitted places.
   */
  async function start() {
    const result = recovery.reconcile();

    if (result.outcome === recoveryMod.OUTCOME.RECONCILIATION_REQUIRED) {
      const detail = result.reason;
      const state = detail === recoveryMod.RECONCILE_REASON.OTHER_INSTALL
        ? SETUP_STATE.OTHER_INSTALLATION
        : (detail === recoveryMod.RECONCILE_REASON.DESCRIPTOR_CORRUPT
          || detail === recoveryMod.RECONCILE_REASON.SETTINGS_UNREADABLE)
          ? SETUP_STATE.MALFORMED
          : SETUP_STATE.RECONCILIATION_REQUIRED;
      setSetupState(state, detail);
      return { ok: true, setupState, detail };
    }
    if (result.outcome !== recoveryMod.OUTCOME.INSTALLED) {
      setSetupState(SETUP_STATE.DISABLED, result.reason);
      return { ok: true, setupState, detail: result.reason };
    }

    await versionGate.probe();
    if (!versionGate.supported()) {
      setSetupState(SETUP_STATE.VERSION_MISMATCH, versionGate.reason());
      return { ok: true, setupState, detail: versionGate.reason() };
    }

    const started = await startTransport();
    if (!started.ok) {
      setSetupState(SETUP_STATE.MALFORMED, started.error || 'transport-failed');
      return { ok: false, setupState, detail: started.error };
    }
    setSetupState(SETUP_STATE.READY, null);
    return { ok: true, setupState };
  }

  /**
   * ASYNCHRONOUS. The heartbeat starts only after the pipe is genuinely listening (finding 9), so a
   * bind failure can never produce a READY badge over a transport nothing is bound to.
   */
  async function startTransport() {
    if (pipe) return { ok: true, pipeName: pipe.pipeName };
    const suffix = cryptoModule.randomBytes(16).toString('hex');
    const pipeName = pipeMod.buildPipeName(suffix);
    const server = pipeMod.createPaneStatusPipe({
      net, registry, pipeName, log, now,
      onStateChange: (view) => deliverView(view),
      onFatal: (code) => onTransportLost(code),
    });
    const res = await server.start();
    // Nothing is assigned on failure: `pipe` stays null, so no pane can enroll and no heartbeat runs.
    if (!res.ok) return res;
    pipe = { server, pipeName };
    startHeartbeat();
    return { ok: true, pipeName };
  }

  /**
   * The transport died AFTER it was ready. The subsystem stops claiming READY — enrollment is refused
   * from the next pane onwards, the heartbeat stops, and every enrolled badge goes honestly `unknown`.
   * Existing tokens are NOT revoked: nothing is listening for them, so they cannot do harm, and
   * revoking would destroy the pane identities a later repair would need.
   */
  function onTransportLost(code) {
    if (!pipe) return;
    stopHeartbeat();
    try { pipe.server.stop(); } catch { /* already closing */ }
    pipe = null;
    log(`[pane-status] transport lost after start (${code || 'unknown'}) — panes show "unknown"`);
    setSetupState(SETUP_STATE.MALFORMED, 'transport-lost');
  }

  /**
   * The heartbeat exists so a pane can age into `unknown` without a new event arriving. It re-resolves
   * and republishes; it does not spawn, kill, read settings, or write anything.
   */
  function startHeartbeat() {
    if (heartbeat) return;
    heartbeat = setIntervalFn(() => { publishAllViews(); }, freshness.HEARTBEAT_MS);
    if (heartbeat && typeof heartbeat.unref === 'function') heartbeat.unref();
  }

  function stopHeartbeat() {
    if (!heartbeat) return;
    clearIntervalFn(heartbeat);
    heartbeat = null;
  }

  // ------------------------------------------------------------------ setup / removal
  async function install() {
    if (inFlight) return { ok: false, reason: 'in-flight' };
    inFlight = true;
    setSetupState(SETUP_STATE.IN_FLIGHT, 'install');
    try {
      // A reconciled state is a precondition, not a suggestion.
      const pre = recovery.reconcile();
      if (pre.outcome === recoveryMod.OUTCOME.RECONCILIATION_REQUIRED) {
        setSetupState(SETUP_STATE.RECONCILIATION_REQUIRED, pre.reason);
        return { ok: false, reason: 'reconciliation-required', detail: pre.reason };
      }

      // Child-process dependency A, permitted here: explicit setup.
      await versionGate.probe();

      const res = await txn.install({ runtimePath: currentRuntimePath, reporterPath });
      if (!res.ok) {
        if (res.reconciliationRequired) { setSetupState(SETUP_STATE.RECONCILIATION_REQUIRED, res.reason); }
        else if (res.reason === txnMod.TXN_REFUSAL.LOCK_HELD) { setSetupState(SETUP_STATE.LOCKED, res.detail); }
        else if (res.ownership === doc.OWNERSHIP.OTHER_INSTALL) { setSetupState(SETUP_STATE.OTHER_INSTALLATION, res.ownership); }
        else if (res.reason === txnMod.TXN_REFUSAL.SETTINGS_MALFORMED) { setSetupState(SETUP_STATE.MALFORMED, res.detail); }
        else { setSetupState(SETUP_STATE.DISABLED, res.reason); }
        return res;
      }

      if (!versionGate.supported()) {
        setSetupState(SETUP_STATE.VERSION_MISMATCH, versionGate.reason());
        return { ok: true, setupState, versionSupported: false };
      }
      const started = await startTransport();
      if (!started.ok) {
        setSetupState(SETUP_STATE.MALFORMED, started.error || 'transport-failed');
        return { ok: false, reason: started.error };
      }
      setSetupState(SETUP_STATE.READY, null);
      return { ok: true, setupState };
    } finally {
      inFlight = false;
    }
  }

  async function remove() {
    if (inFlight) return { ok: false, reason: 'in-flight' };
    // Captured so a refusal that wrote NOTHING can put the presentation back exactly as it was.
    const priorState = setupState;
    const priorDetail = setupDetail;
    inFlight = true;
    setSetupState(SETUP_STATE.IN_FLIGHT, 'remove');
    try {
      const res = await txn.remove();
      if (!res.ok) {
        // A RETAINED refusal (Binding Amendment A § 2 case D): settings, descriptor and shim are all
        // byte-identical to what they were. The installation is intact and still working, so there is
        // no success result, no token revocation, and no disabled presentation — the control goes back
        // to what it was showing and surfaces the refusal reason plus the manual-recovery pointer.
        if (res.retained === true && !res.reconciliationRequired) {
          setSetupState(priorState, priorDetail);
          log(`[pane-status] removal refused (${res.detail || res.reason}); installation left intact`);
          return res;
        }
        if (res.reconciliationRequired) setSetupState(SETUP_STATE.RECONCILIATION_REQUIRED, res.detail || res.reason);
        else if (res.reason === txnMod.TXN_REFUSAL.LOCK_HELD) setSetupState(SETUP_STATE.LOCKED, res.detail);
        else setSetupState(SETUP_STATE.RECONCILIATION_REQUIRED, res.reason);
        return res;
      }

      // ORDER MATTERS, and under R3 the order is load-bearing rather than merely polite.
      //
      // STEP 1 — commit the AUTHORITATIVE state as non-live BEFORE a single byte is published. From
      // here on `registry.viewFor()` resolves every pane to unknown/hook-removed, so the answer this
      // process would give a refresh is already correct even if nothing reaches the renderer.
      // Publishing first and committing second would make delivery the source of truth, which is the
      // whole defect: a dropped push would leave the authoritative state claiming panes are live.
      registry.setOverrideReason(freshness.UNKNOWN_REASON.HOOK_REMOVED);

      // STEP 2 — attempt the existing publication, while the panes still exist to be addressed.
      // Revoking before this would blank the badges and leave nothing to explain them.
      const deliveryBefore = deliveryFailures;
      for (const paneId of registry.enrolledPaneIds()) {
        deliverView({ paneId, state: 'unknown', reason: freshness.UNKNOWN_REASON.HOOK_REMOVED });
      }

      // STEP 3 — revoke REGARDLESS of whether any of that was delivered. These tokens authorise
      // reports about an installation that no longer exists; a renderer that missed the notice is not
      // a reason to keep minting trust. Delivery failure must never restore or retain tokens.
      registry.revokeAll('hook-removed');

      stopHeartbeat();
      if (pipe) { pipe.server.stop(); pipe = null; }
      setSetupState(SETUP_STATE.DISABLED, 'removed');

      // STEPS 4 and 5 — the settings transaction is finished and is NEVER rolled back because a
      // window did not answer. Only the claim we are entitled to make differs.
      if (deliveryFailures !== deliveryBefore) {
        log('[pane-status] removal COMPLETED on disk, but the renderer did not confirm delivery of the '
          + 'hook-removed notice; the displayed pane status may be stale until it is refreshed');
        return { ok: true, setupState, disposition: REMOVAL_DISPOSITION.PRESENTATION_UNCONFIRMED };
      }
      return { ok: true, setupState, disposition: REMOVAL_DISPOSITION.COMPLETE };
    } finally {
      inFlight = false;
    }
  }

  /** Child-process dependency B, permitted here only, and only after native confirmation. */
  async function clearStaleLock() {
    const res = await lock.confirmClearStaleLock();
    if (res.ok) log('[pane-status] stale lock cleared by explicit confirmation');
    return res;
  }

  function getSetupState() {
    return {
      state: setupState,
      detail: setupDetail,
      versionSupported: versionGate.supported(),
      versionReason: versionGate.reason(),
      installedEvents: doc.INSTALLED_EVENTS.slice(),
      worstCaseStaleMs: freshness.WORST_CASE_STALE_MS,
      lockPath: lock.lockPath(),
      descriptorPath: descriptorMod.descriptorPath(userDataPath),
    };
  }

  /**
   * WINDOW TEARDOWN. Clears the heartbeat, stops the pipe, revokes every token. IDEMPOTENT: called
   * twice it does nothing the second time, because teardown can arrive from more than one place
   * (window-all-closed, an explicit quit) and a double revoke-all would publish views for panes that
   * no longer exist. Still zero process control — it cannot kill, relaunch, or quit anything.
   */
  function shutdown() {
    if (shutDown) return false;
    shutDown = true;
    stopHeartbeat();
    registry.revokeAll('window-teardown');
    if (pipe) { try { pipe.server.stop(); } catch { /* already closing */ } pipe = null; }
    reportingEnabled = false;
    return true;
  }

  return {
    SETUP_STATE,
    start,
    install,
    remove,
    clearStaleLock,
    getSetupState,
    enrollPane,
    releasePane,
    notePaneExit,
    shutdown,
    isShutDown: () => shutDown,
    // exposed for tests and for the IPC layer; none of these spawn
    registry,
    versionGate,
    lock,
    recovery,
    transaction: txn,
    publishAllViews,
    isReporting: () => reportingEnabled,
    pipeName: () => (pipe ? pipe.pipeName : null),
  };
}

const api = { SETUP_STATE, REMOVAL_DISPOSITION, createPaneStatusController };
if (typeof module === 'object' && module.exports) module.exports = api;
