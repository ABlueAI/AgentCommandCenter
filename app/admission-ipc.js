'use strict';
// MAIN-OWNED TURN ADMISSION BUDGET — the IPC and PTY-input boundary.
//
// Procurement record: docs/OSS-PROCUREMENT-pane-status.md
// Blue's verdict, verbatim: BLUE SUBSYSTEM VERDICT: BUILD FRESH
//
// TWO SURFACES, AND ONLY TWO.
//
//   1. `decideDirectWrite(paneId)` — consulted by main's existing `ipcMain.on('pty-write')`. For the
//      controlled pane it returns a REFUSAL, so ordinary keystrokes, paste, dictation delivery, and
//      every other current or future `pty-write` producer are stopped at the single chokepoint in
//      main rather than by asking each renderer call site to behave. `app/renderer/app.js` funnels
//      `term.onData`, the clipboard consumer's paste, and the speech-to-text delivery through
//      `cc.ptyWrite` -> this one handler, so blocking here covers all three and anything added later.
//
//   2. `handleSubmitPrompt(event, req)` — the narrow controlled-prompt operation. It is an
//      `ipcMain.handle` invoke, gated by the canonical `trusted-ipc-sender.js` check, and it is the
//      ONLY way a prompt can reach the controlled pane.
//
// There is deliberately no generic "send bytes" method, no allowance setter, no reset, and no
// "certify" call. The renderer can read the numbers and submit one bounded prompt; it cannot change
// what the numbers mean.
//
// PROMPT CONTENT NEVER LEAVES THIS BOUNDARY. The request's prompt field is read in exactly two places
// — once to validate its shape, once to hand it to the budget — and is dropped thereafter. It is never
// logged, never echoed in a refusal payload, never put in an Error message, and never persisted. Every
// refusal is a bounded constant from `admission-budget.js`'s REASON table or this module's own. That
// two-read count is asserted by a source tripwire in admission-ipc.test.js.
//
// PURE with respect to Electron: `ipcMain`, the trusted-sender gate, the budget and the logger are all
// injected, so admission-ipc.test.js exercises the real boundary against stubs.

const budgetModule = require('./admission-budget');

const IPC_REASON = Object.freeze({
  UNTRUSTED: 'admission-untrusted-sender',
  BAD_REQUEST: 'admission-bad-request',
  DISABLED: 'admission-disabled',
});

// Channel names. Invoke-only; there is no `send`-style counterpart, so a fire-and-forget forged
// message has nothing to reach.
const CHANNEL_SUBMIT = 'admission-submit-prompt';
const CHANNEL_STATE = 'admission-get-state';

// A blocked pane's `term.onData` fires once per KEYSTROKE. Emitting a visible refusal for each would
// flood the Logs tab and bury the one line that matters. Emit at most one per window and report how
// many further attempts were suppressed, so the refusal stays visible AND stays honest about volume.
const REFUSAL_THROTTLE_MS = 1000;

/**
 * deps:
 *   budget          -> the object from createAdmissionBudget()/createDisabledBudget()
 *   assessSender(e) -> the canonical trusted-ipc-sender gate's assess(); { ok:true } | { ok:false, reason }
 *   logRefusal(line)-> bounded visible refusal (main's tlog + 'main-error' to the Logs tab)
 *   now()           -> injected clock
 */
function createAdmissionIpc(deps) {
  const d = deps || {};
  const budget = d.budget;
  if (!budget || typeof budget.submitPrompt !== 'function') {
    throw new Error('admission-ipc: budget is required');
  }
  const assessSender = typeof d.assessSender === 'function' ? d.assessSender : () => ({ ok: false, reason: IPC_REASON.UNTRUSTED });
  const logRefusal = typeof d.logRefusal === 'function' ? d.logRefusal : () => {};
  const now = typeof d.now === 'function' ? d.now : () => Date.now();

  // Per-pane throttle state for the direct-input refusal.
  const lastRefusalAt = new Map();
  const suppressedSince = new Map();

  /**
   * The `pty-write` decision. Returns { allow:true } or { allow:false, reason, notify }.
   *
   * `notify` is true only when the throttle window has elapsed, so the caller emits a bounded visible
   * refusal at most once a second per pane. The decision itself — allow or refuse — is NEVER throttled:
   * every suppressed keystroke is still refused, it is merely not re-announced.
   */
  function decideDirectWrite(paneId) {
    if (!budget.isDirectInputBlocked(paneId)) return { allow: true };

    const t = now();
    const last = lastRefusalAt.get(paneId);
    if (typeof last === 'number' && (t - last) < REFUSAL_THROTTLE_MS) {
      suppressedSince.set(paneId, (suppressedSince.get(paneId) || 0) + 1);
      return { allow: false, reason: budgetModule.REASON.DIRECT_INPUT_BLOCKED, notify: false };
    }
    const suppressed = suppressedSince.get(paneId) || 0;
    lastRefusalAt.set(paneId, t);
    suppressedSince.set(paneId, 0);
    return {
      allow: false,
      reason: budgetModule.REASON.DIRECT_INPUT_BLOCKED,
      notify: true,
      suppressed,
    };
  }

  /**
   * Main calls this from `ipcMain.on('pty-write')` before touching the PTY. Returns true when the
   * write is refused, in which case the caller writes NOTHING.
   *
   * The refusal line names the reason constant and a count. It never contains the bytes the renderer
   * tried to write — those are keystrokes, and a blocked pane's keystrokes are exactly the content a
   * log must not accumulate.
   */
  function refuseDirectWrite(paneId) {
    const decision = decideDirectWrite(paneId);
    if (decision.allow) return false;
    if (decision.notify) {
      const extra = decision.suppressed > 0 ? ` (${decision.suppressed} further attempt(s) suppressed)` : '';
      logRefusal(
        `Direct terminal input is disabled for this pane: a controlled admission-budget run is active. ` +
        `Use the controlled prompt submission path. [${decision.reason}]${extra}`
      );
    }
    return true;
  }

  /** Clear throttle bookkeeping for a pane that is gone. Pure housekeeping; changes no ledger state. */
  function forgetPane(paneId) {
    lastRefusalAt.delete(paneId);
    suppressedSince.delete(paneId);
  }

  /**
   * The controlled prompt submission. `req` must be exactly `{ paneId, prompt }` — a strict shape, so
   * an extra field is a refusal rather than something silently ignored.
   *
   * Returns a bounded result object. On refusal it carries ONLY a reason constant; on success it
   * carries counts. Neither branch can carry prompt text: the only place `req.prompt` is read is the
   * call into `budget.submitPrompt`.
   */
  async function handleSubmitPrompt(event, req) {
    const trust = assessSender(event);
    if (!trust || trust.ok !== true) {
      // Do NOT reveal which trust clause failed to the renderer; log it for the operator instead. An
      // untrusted caller learning "not-main-frame" vs "untrusted-document" is free probing feedback.
      logRefusal(`Controlled prompt submission refused: untrusted sender [${(trust && trust.reason) || 'unknown'}]`);
      return { ok: false, reason: IPC_REASON.UNTRUSTED };
    }
    if (!budget.enabled) return { ok: false, reason: IPC_REASON.DISABLED };

    if (!req || typeof req !== 'object' || Array.isArray(req)) return { ok: false, reason: IPC_REASON.BAD_REQUEST };
    const keys = Object.keys(req);
    if (keys.length !== 2 || !keys.includes('paneId') || !keys.includes('prompt')) {
      return { ok: false, reason: IPC_REASON.BAD_REQUEST };
    }
    if (typeof req.paneId !== 'string') return { ok: false, reason: IPC_REASON.BAD_REQUEST };

    // Validate the prompt here too, before the budget is touched at all. Same shared validator, so the
    // two cannot drift; this is a fail-fast, not a second policy.
    const shape = budgetModule.validatePrompt(req.prompt);
    if (!shape.ok) {
      logRefusal(`Controlled prompt submission refused [${shape.reason}]`);
      return { ok: false, reason: shape.reason };
    }

    const result = await budget.submitPrompt(req.paneId, req.prompt);
    if (!result || result.ok !== true) {
      const reason = (result && result.reason) || IPC_REASON.BAD_REQUEST;
      logRefusal(
        `Controlled prompt REFUSED [${reason}] — nothing was written to the PTY unless the reason is ` +
        `"${budgetModule.REASON.WRITE_FAILED_AFTER_ADMISSION}", in which case the admission is consumed.`
      );
      return {
        ok: false,
        reason,
        // Counts only, and only when the budget supplied them.
        ...(typeof result?.admitted === 'number' ? { admitted: result.admitted } : {}),
        ...(typeof result?.remaining === 'number' ? { remaining: result.remaining } : {}),
        ...(typeof result?.allowance === 'number' ? { allowance: result.allowance } : {}),
      };
    }
    return {
      ok: true,
      admitted: result.admitted,
      remaining: result.remaining,
      allowance: result.allowance,
    };
  }

  /**
   * Read-only bounded state for a controlled-run UI. There is no setter counterpart anywhere in this
   * module or in the preload, so a renderer that can read these numbers still cannot change them.
   */
  async function handleGetState(event) {
    const trust = assessSender(event);
    if (!trust || trust.ok !== true) return { ok: false, reason: IPC_REASON.UNTRUSTED };
    return { ok: true, state: budget.state() };
  }

  /** Register both handlers. Called by main only when the budget is enabled. */
  function register(ipcMain) {
    if (!ipcMain || typeof ipcMain.handle !== 'function') {
      throw new Error('admission-ipc: ipcMain with handle() is required');
    }
    ipcMain.handle(CHANNEL_SUBMIT, (e, req) => handleSubmitPrompt(e, req));
    ipcMain.handle(CHANNEL_STATE, (e) => handleGetState(e));
  }

  return {
    decideDirectWrite,
    refuseDirectWrite,
    forgetPane,
    handleSubmitPrompt,
    handleGetState,
    register,
  };
}

const api = {
  createAdmissionIpc,
  IPC_REASON,
  CHANNEL_SUBMIT,
  CHANNEL_STATE,
  REFUSAL_THROTTLE_MS,
};
if (typeof module === 'object' && module.exports) module.exports = api;
