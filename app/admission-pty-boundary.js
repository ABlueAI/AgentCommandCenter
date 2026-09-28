'use strict';
// MAIN-OWNED PTY TURN-INPUT BOUNDARY.
//
// This module owns the last production call to a PTY's write method. Generic renderer input and
// durably admitted prompt input enter through different closures. The admitted closure carries a
// module-private Symbol that cannot be supplied through IPC or renderer data; a boolean or request
// field can never manufacture it.
//
// This is an accidental-spend boundary through supported Blue Helm input paths, not isolation from a
// malicious or compromised same-user process. Such a process can access the filesystem and ledger.

const WRITE_REASON = Object.freeze({
  DIRECT_INPUT_BLOCKED: 'admission-direct-input-blocked',
  PTY_MISSING: 'pty-missing',
  BAD_ADMITTED_TEXT: 'admission-bad-admitted-text',
});

// The exact byte main writes to submit one admitted prompt to a ConPTY-hosted CLI. Carriage return is
// what the terminal treats as Enter. It is written by THIS module only — never supplied by a caller.
const SUBMISSION_TERMINATOR = '\r';

// PROVISIONAL framing interval between the prompt text and its terminator. Claude Code v2.1.283 took a
// single text+CR burst as pasted multiline input and left the prompt unsent (controlled live run -c).
// Writing the CR separately, after this gap, is intended to arrive as its own Enter keypress. 300 ms is
// NOT proven against Claude Code: the deterministic fake-TUI test proves only the intended separation,
// and a separately authorized live run is the compatibility proof. Main-owned; never renderer-supplied.
const SUBMIT_DELAY_MS = 300;

function realDelay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** True only for pane launch shapes that run Claude Code under Blue Helm's supported launch policy. */
function isEligibleClaudePane(opts, validRoles) {
  const o = opts && typeof opts === 'object' ? opts : {};
  if (o.videoScout === true) return false;
  const roles = validRoles instanceof Set ? validRoles : new Set();
  if (typeof o.role === 'string' && roles.has(o.role)) return true;
  return (o.cli || o.agent) === 'claude';
}

/** A launch-time prompt is turn-initiating only when it survives the command builder's trim. */
function hasNonemptyInitialPrompt(opts) {
  const value = opts && opts.initialPrompt;
  if (typeof value !== 'string') return false;
  return value.replace(/["`$\r\n]/g, ' ').replace(/\s+/g, ' ').trim().length > 0;
}

/**
 * deps:
 *   getPty(id)               -> returns the main-owned PTY handle
 *   isDirectInputBlocked(id) -> true for pending/bound protected panes, including fatal states
 *   onDirectRefusal(id)      -> bounded visible notification; never receives input bytes
 *   delay(ms)                -> optional; resolves after ms. Injected by tests so nothing sleeps.
 */
function createAdmissionPtyBoundary(deps) {
  const d = deps || {};
  if (typeof d.getPty !== 'function') throw new Error('admission-pty-boundary: getPty is required');
  if (typeof d.isDirectInputBlocked !== 'function') {
    throw new Error('admission-pty-boundary: isDirectInputBlocked is required');
  }
  const onDirectRefusal = typeof d.onDirectRefusal === 'function' ? d.onDirectRefusal : () => {};
  const delay = typeof d.delay === 'function' ? d.delay : realDelay;
  const admittedCapability = Symbol('main-owned-durable-admission');

  // The sole production write call. `capability` is never accepted from an IPC payload.
  function writeAtChokePoint(paneId, bytes, capability) {
    if (capability !== admittedCapability && d.isDirectInputBlocked(paneId)) {
      onDirectRefusal(paneId);
      return { ok: false, reason: WRITE_REASON.DIRECT_INPUT_BLOCKED };
    }
    const pty = d.getPty(paneId);
    if (!pty) return { ok: false, reason: WRITE_REASON.PTY_MISSING };
    pty.write(bytes);
    return { ok: true };
  }

  function writeDirect(paneId, bytes) {
    return writeAtChokePoint(paneId, bytes, null);
  }

  /**
   * Deliver ONE durably admitted prompt as one submitted turn, in two phases through the same choke
   * point: the text, then — after SUBMIT_DELAY_MS — the terminator alone. Resolves only after both
   * writes; the budget's single-flight guard is held across the whole await. Any failure rejects, and
   * the budget reports it as consumed-not-refunded. The terminator is never written to a handle other
   * than the one that received the text.
   */
  async function writeAdmitted(paneId, promptText) {
    if (typeof promptText !== 'string' || promptText.length === 0 || /[\r\n]/.test(promptText)) {
      throw new Error(WRITE_REASON.BAD_ADMITTED_TEXT);
    }
    const handle = d.getPty(paneId);
    if (!handle) throw new Error(WRITE_REASON.PTY_MISSING);
    const text = writeAtChokePoint(paneId, promptText, admittedCapability);
    if (!text.ok) throw new Error(text.reason);
    await delay(SUBMIT_DELAY_MS);
    if (d.getPty(paneId) !== handle) throw new Error(WRITE_REASON.PTY_MISSING);
    const submit = writeAtChokePoint(paneId, SUBMISSION_TERMINATOR, admittedCapability);
    if (!submit.ok) throw new Error(submit.reason);
  }

  return Object.freeze({ writeDirect, writeAdmitted });
}

module.exports = {
  WRITE_REASON,
  SUBMISSION_TERMINATOR,
  SUBMIT_DELAY_MS,
  isEligibleClaudePane,
  hasNonemptyInitialPrompt,
  createAdmissionPtyBoundary,
};
