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
});

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
 */
function createAdmissionPtyBoundary(deps) {
  const d = deps || {};
  if (typeof d.getPty !== 'function') throw new Error('admission-pty-boundary: getPty is required');
  if (typeof d.isDirectInputBlocked !== 'function') {
    throw new Error('admission-pty-boundary: isDirectInputBlocked is required');
  }
  const onDirectRefusal = typeof d.onDirectRefusal === 'function' ? d.onDirectRefusal : () => {};
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

  async function writeAdmitted(paneId, bytes) {
    const result = writeAtChokePoint(paneId, bytes, admittedCapability);
    if (!result.ok) throw new Error(result.reason);
  }

  return Object.freeze({ writeDirect, writeAdmitted });
}

module.exports = {
  WRITE_REASON,
  isEligibleClaudePane,
  hasNonemptyInitialPrompt,
  createAdmissionPtyBoundary,
};
