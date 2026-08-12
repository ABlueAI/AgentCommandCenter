'use strict';
// EXPERIMENT A — PROTOTYPE ONLY. Claude Code only, one pane only.
//
// Procurement record: docs/OSS-PROCUREMENT-pane-status.md
// Blue's verdict, verbatim: BLUE SUBSYSTEM VERDICT: PROTOTYPE
//
// The main-process authority for the prototype: who owns the token, which pane it maps to, what state
// that pane is in, and when to stop believing it. PURE except for an injected clock and an injected
// random-token source, so every rule below is unit-testable in plain node with no pipe, no Electron,
// and no Claude.
//
// WHY A STORE AND NOT A MAP IN main.js: the rules that matter (exactly one pane, token binds to the
// pane it was issued for and to no other, constant-time compare, no token ever leaving main) are the
// security boundary. Putting them behind one small object with no I/O means the tests exercise the
// real thing rather than a re-implementation.

const protocol = require('./pane-status-protocol');

// Token comparison. crypto.timingSafeEqual requires equal-length buffers, which is guaranteed here
// because parseMessage already enforced the exact hex length before this is ever reached. The length
// guard below is belt-and-braces: a length mismatch is a plain `false`, never a throw.
function makeConstantTimeCompare(cryptoModule) {
  return function constantTimeEqual(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string') return false;
    if (a.length !== b.length) return false;
    const bufA = Buffer.from(a, 'utf8');
    const bufB = Buffer.from(b, 'utf8');
    if (bufA.length !== bufB.length) return false;
    try { return cryptoModule.timingSafeEqual(bufA, bufB); } catch { return false; }
  };
}

/**
 * deps:
 *   now()            -> ms epoch (injected clock)
 *   randomToken()    -> 64-char lowercase hex (injected CSPRNG)
 *   crypto           -> node crypto (for timingSafeEqual)
 *   observedVersion  -> the installed Claude version string, or null if not probed
 *   supportedVersions-> optional override of the pinned supported list
 *   staleMs          -> optional override
 *   log(line)        -> optional bounded logger. NEVER called with a token or a message body.
 */
function createPaneStatusStore(deps) {
  const d = deps || {};
  const now = typeof d.now === 'function' ? d.now : () => Date.now();
  const randomToken = typeof d.randomToken === 'function' ? d.randomToken : null;
  const cryptoModule = d.crypto || null;
  const staleMs = typeof d.staleMs === 'number' ? d.staleMs : protocol.STALE_MS;
  const supportedVersions = d.supportedVersions || protocol.SUPPORTED_CLAUDE_VERSIONS;
  const log = typeof d.log === 'function' ? d.log : () => {};
  if (!randomToken) throw new Error('pane-status-store: randomToken dependency is required');
  if (!cryptoModule || typeof cryptoModule.timingSafeEqual !== 'function') {
    throw new Error('pane-status-store: crypto with timingSafeEqual is required');
  }
  const constantTimeEqual = makeConstantTimeCompare(cryptoModule);

  // EXACTLY ONE enrolled pane. Not a Map. The single-pane bound of Experiment A is expressed in the
  // data structure itself, so "enable a second pane" is not a policy check someone can forget to
  // write — there is nowhere to put the second pane.
  let enrolled = null; // { paneId, token, lastEvent, lastEventAt, acceptedCount, refusedCount }
  let observedVersion = typeof d.observedVersion === 'string' ? d.observedVersion : null;

  function versionSupported() {
    return protocol.isVersionSupported(observedVersion, supportedVersions);
  }

  /** Record the probed Claude version. An unverified version degrades the badge, never blocks enroll. */
  function setObservedVersion(version) {
    observedVersion = typeof version === 'string' && version.length ? version : null;
  }

  /**
   * Enroll THE one pane and mint its token. Refuses a second pane outright — the caller surfaces that
   * refusal visibly rather than silently re-pointing the token at a new pane.
   * Returns { ok:true, token } or { ok:false, reason }.
   */
  function enrollPane(paneId) {
    if (typeof paneId !== 'string' || paneId.length === 0) {
      return { ok: false, reason: 'bad-pane-id' };
    }
    if (enrolled && enrolled.paneId === paneId) {
      return { ok: false, reason: 'already-enrolled' };
    }
    if (enrolled) {
      log(`[pane-status] REFUSED enroll for a second pane; Experiment A allows exactly one (holder=${enrolled.paneId})`);
      return { ok: false, reason: 'single-pane-only' };
    }
    const token = randomToken();
    if (typeof token !== 'string' || !protocol.TOKEN_PATTERN.test(token)) {
      return { ok: false, reason: 'bad-token-generated' };
    }
    enrolled = { paneId, token, lastEvent: null, lastEventAt: null, acceptedCount: 0, refusedCount: 0 };
    log(`[pane-status] pane ${paneId} enrolled (token minted, retained in main memory only)`);
    return { ok: true, token };
  }

  /** Forget the pane entirely — pane closed, or prototype torn down. The token dies with it. */
  function releasePane(paneId) {
    if (!enrolled) return false;
    if (typeof paneId === 'string' && enrolled.paneId !== paneId) return false;
    log(`[pane-status] pane ${enrolled.paneId} released; token discarded`);
    enrolled = null;
    return true;
  }

  /**
   * Apply one already-parsed message. `token` must match the enrolled pane's token in constant time.
   * Returns { ok:true, paneId, state } or { ok:false, reason }.
   *
   * There is deliberately no paneId parameter: the TOKEN chooses the pane. A caller cannot direct an
   * event at a pane of its choosing even if it wanted to, which is what makes "events cannot update a
   * second pane" a structural property rather than a check.
   */
  function applyMessage(message) {
    const m = message || {};
    if (!enrolled) return { ok: false, reason: protocol.REFUSE.UNKNOWN_TOKEN };
    if (!constantTimeEqual(String(m.token || ''), enrolled.token)) {
      enrolled.refusedCount += 1;
      return { ok: false, reason: protocol.REFUSE.UNKNOWN_TOKEN };
    }
    if (!protocol.ALLOWED_EVENTS.includes(m.event)) {
      enrolled.refusedCount += 1;
      return { ok: false, reason: protocol.REFUSE.BAD_EVENT };
    }
    enrolled.lastEvent = m.event;
    enrolled.lastEventAt = now();
    enrolled.acceptedCount += 1;
    return { ok: true, paneId: enrolled.paneId, state: protocol.stateForEvent(m.event) };
  }

  /** Count a refusal that happened before a token could even be extracted (size/JSON/shape). */
  function countRefusal() {
    if (enrolled) enrolled.refusedCount += 1;
  }

  /**
   * The renderer-facing view. Contains NO token, by construction — this object is the only thing the
   * IPC layer is allowed to send, and there is no branch here that can add one.
   */
  function viewFor(paneId) {
    if (!enrolled || (typeof paneId === 'string' && enrolled.paneId !== paneId)) return null;
    const resolved = protocol.resolveDisplayState({
      lastEvent: enrolled.lastEvent,
      lastEventAt: enrolled.lastEventAt,
      now: now(),
      staleMs,
      versionSupported: versionSupported(),
    });
    return {
      paneId: enrolled.paneId,
      state: resolved.state,
      reason: resolved.reason,
      prototype: true,
    };
  }

  /** Current enrolled pane id, or null. Used by the IPC layer to address the badge update. */
  function enrolledPaneId() { return enrolled ? enrolled.paneId : null; }

  /** Diagnostics for the evidence document. Token is NOT included and cannot be. */
  function stats() {
    if (!enrolled) return { enrolled: false, versionSupported: versionSupported(), observedVersion };
    return {
      enrolled: true,
      paneId: enrolled.paneId,
      lastEvent: enrolled.lastEvent,
      lastEventAt: enrolled.lastEventAt,
      acceptedCount: enrolled.acceptedCount,
      refusedCount: enrolled.refusedCount,
      versionSupported: versionSupported(),
      observedVersion,
    };
  }

  return {
    enrollPane,
    releasePane,
    applyMessage,
    countRefusal,
    viewFor,
    enrolledPaneId,
    setObservedVersion,
    versionSupported,
    stats,
  };
}

const api = { createPaneStatusStore, makeConstantTimeCompare };
if (typeof module === 'object' && module.exports) module.exports = api;
