'use strict';
// Blue Helm production pane status — the IPC boundary.
//
// Procurement record: docs/OSS-PROCUREMENT-pane-status.md
// Blue's verdict, verbatim: BLUE SUBSYSTEM VERDICT: BUILD FRESH
//
// FOUR ZERO-ARGUMENT INVOKES AND ONE PUSH. That is the entire surface, and the shape is the security
// argument: a handler that takes no request body cannot be asked for a path, a pane, a token, or a
// file. There is no parameter to smuggle anything through, so "the renderer cannot choose the target"
// is a property of the signature rather than a validation someone has to keep correct.
//
// EVERY handler runs the canonical trusted-sender assessment (trusted-ipc-sender.js — the SAME gate
// clipboard and library use; there must be exactly one, or two would drift) BEFORE any filesystem
// access, any lock inspection, and any child process. Not after, not alongside: before.
//
// WHAT IS DELIBERATELY ABSENT, and asserted absent by test: paths, tokens, settings contents, a status
// setter, enrollment, revocation, prompts, output, credentials. The renderer can ask what state setup
// is in, ask to install, ask to remove, ask to clear a stale lock, and receive views. Nothing else.
//
// clearStaleLock ADDITIONALLY requires NATIVE MAIN-PROCESS CONFIRMATION. A renderer-drawn dialog is
// content the renderer controls; a native dialog is not. Deleting another process's lock file is the
// one action here that can affect a resource outside this app, so it gets a real human in the loop.

const CHANNELS = Object.freeze({
  GET_SETUP_STATE: 'pane-status-get-setup-state',
  INSTALL: 'pane-status-install',
  REMOVE: 'pane-status-remove',
  CLEAR_STALE_LOCK: 'pane-status-clear-stale-lock',
  VIEW: 'pane-status-view',
  SETUP_STATE: 'pane-status-setup-state',
});

const IPC_REFUSAL = Object.freeze({
  UNTRUSTED: 'untrusted-sender',
  NOT_CONFIRMED: 'not-confirmed',
  UNAVAILABLE: 'pane-status-unavailable',
});

/**
 * A refusal DETAIL, allowed across the boundary only if it is shaped like a bounded constant.
 *
 * Every detail this subsystem produces is a value from a frozen constant object — `removal-owned-
 * entry-modified`, `lock-held-by-another-process`, `hooks-not-an-object` — or an errno such as
 * `EACCES`. The specific one is what tells a person which manual-recovery section to read, so it is
 * genuinely useful; `txn-removal-refused` alone is not actionable.
 *
 * The shape is enforced rather than trusted. Anything containing a separator, a space, a quote, a
 * dot, or more than 64 characters is dropped: a path, a settings fragment, or an interpolated command
 * output cannot satisfy this pattern, so no future edit that widens a `detail` can leak one through
 * this channel by accident.
 */
const BOUNDED_DETAIL = /^[A-Za-z][A-Za-z0-9-]{0,63}$/;
function boundedDetail(value) {
  return (typeof value === 'string' && BOUNDED_DETAIL.test(value)) ? value : null;
}

/**
 * Project the controller's setup state down to what the renderer may see.
 *
 * The controller's own getSetupState() carries a lock path and a descriptor path because the main
 * process logs them. NEITHER crosses this boundary. This function is the whole reason the projection
 * is explicit rather than a spread: a future field added to the controller does not silently become
 * renderer-visible, because it has to be named here first.
 */
function projectSetupState(state) {
  const s = state || {};
  return {
    state: typeof s.state === 'string' ? s.state : 'disabled',
    detail: typeof s.detail === 'string' ? s.detail : null,
    versionSupported: s.versionSupported === true,
    versionReason: typeof s.versionReason === 'string' ? s.versionReason : null,
    installedEvents: Array.isArray(s.installedEvents) ? s.installedEvents.slice() : [],
    worstCaseStaleMs: typeof s.worstCaseStaleMs === 'number' ? s.worstCaseStaleMs : null,
  };
}

/**
 * Project a pane view. Belt-and-braces: the registry already builds these without a token, and this
 * rebuilds them field by field so two independent places would both have to be wrong for one to leak.
 */
function projectView(view) {
  const v = view || {};
  return {
    paneId: typeof v.paneId === 'string' ? v.paneId : null,
    state: typeof v.state === 'string' ? v.state : 'unknown',
    reason: typeof v.reason === 'string' ? v.reason : null,
  };
}

/**
 * deps:
 *   ipcMain          -> Electron ipcMain (injected)
 *   trustedSenderGate-> createTrustedSenderGate(...) instance, canonical for the whole app
 *   controller       -> pane-status-controller instance
 *   confirmNatively(question) -> Promise<boolean>. A REAL native dialog in production; injected so
 *                       tests can assert the refusal path without drawing a window.
 *   log(line)
 */
function registerPaneStatusIpc(deps) {
  const d = deps || {};
  const ipcMain = d.ipcMain;
  const gate = d.trustedSenderGate;
  const controller = d.controller;
  const confirmNatively = typeof d.confirmNatively === 'function' ? d.confirmNatively : null;
  const log = typeof d.log === 'function' ? d.log : () => {};
  if (!ipcMain || typeof ipcMain.handle !== 'function') throw new Error('pane-status-ipc: ipcMain is required');
  if (!gate || typeof gate.assess !== 'function') throw new Error('pane-status-ipc: trustedSenderGate is required');
  if (!controller) throw new Error('pane-status-ipc: controller is required');

  // One place where trust is decided, so no handler can forget it.
  function guard(channel, event) {
    const verdict = gate.assess(event);
    if (!verdict.ok) {
      log(`[pane-status] REFUSED ${channel}: ${verdict.reason}`);
      return { ok: false, reason: IPC_REFUSAL.UNTRUSTED };
    }
    return { ok: true };
  }

  ipcMain.handle(CHANNELS.GET_SETUP_STATE, async (event) => {
    const g = guard(CHANNELS.GET_SETUP_STATE, event);
    if (!g.ok) return g;
    return { ok: true, setup: projectSetupState(controller.getSetupState()) };
  });

  ipcMain.handle(CHANNELS.INSTALL, async (event) => {
    const g = guard(CHANNELS.INSTALL, event);
    if (!g.ok) return g;
    const res = await controller.install();
    return {
      ok: res.ok === true,
      reason: res.ok === true ? null : (res.reason || null),
      detail: res.ok === true ? null : boundedDetail(res.detail),
      setup: projectSetupState(controller.getSetupState()),
    };
  });

  ipcMain.handle(CHANNELS.REMOVE, async (event) => {
    const g = guard(CHANNELS.REMOVE, event);
    if (!g.ok) return g;
    const res = await controller.remove();
    return {
      ok: res.ok === true,
      reason: res.ok === true ? null : (res.reason || null),
      detail: res.ok === true ? null : boundedDetail(res.detail),
      // A RETAINED refusal means nothing was written and the installation is intact. The control uses
      // this to keep showing what it was showing and point at manual recovery, rather than presenting
      // the subsystem as broken or disabled.
      retained: res.retained === true,
      // R3. The THIRD removal outcome. `ok` alone cannot express "the settings transaction finished
      // but we could not confirm the renderer was told", so the disposition rides alongside it as a
      // single bounded constant — the same shape `retained` already uses, not a new field family and
      // not a new channel. It is null on every refusal, where `reason`/`detail` already say more.
      disposition: res.ok === true ? boundedDetail(res.disposition) : null,
      setup: projectSetupState(controller.getSetupState()),
    };
  });

  ipcMain.handle(CHANNELS.CLEAR_STALE_LOCK, async (event) => {
    // Trust FIRST, before any filesystem access and before the confirmation dialog. An untrusted
    // sender must not even be able to make a window appear.
    const g = guard(CHANNELS.CLEAR_STALE_LOCK, event);
    if (!g.ok) return g;

    if (!confirmNatively) return { ok: false, reason: IPC_REFUSAL.UNAVAILABLE };
    let confirmed = false;
    try { confirmed = (await confirmNatively()) === true; } catch { confirmed = false; }
    if (!confirmed) {
      log('[pane-status] clear-stale-lock declined at the native confirmation');
      return { ok: false, reason: IPC_REFUSAL.NOT_CONFIRMED };
    }

    const res = await controller.clearStaleLock();
    return {
      ok: res.ok === true,
      reason: res.ok === true ? null : (res.reason || null),
      setup: projectSetupState(controller.getSetupState()),
    };
  });

  return { CHANNELS };
}

/**
 * Build the push functions main.js hands the controller. Both project before sending, so the wire
 * shape is enforced on the way out as well as the way in.
 */
function createPublishers(getWindow) {
  function send(channel, payload) {
    const win = typeof getWindow === 'function' ? getWindow() : null;
    if (!win || (typeof win.isDestroyed === 'function' && win.isDestroyed())) return false;
    const wc = win.webContents;
    if (!wc) return false;
    try { wc.send(channel, payload); return true; } catch { return false; }
  }
  return {
    publishView: (view) => send(CHANNELS.VIEW, projectView(view)),
    publishSetupState: (state) => send(CHANNELS.SETUP_STATE, projectSetupState(state)),
  };
}

const api = { CHANNELS, IPC_REFUSAL, projectSetupState, projectView, registerPaneStatusIpc, createPublishers };
if (typeof module === 'object' && module.exports) module.exports = api;
