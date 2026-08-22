'use strict';
// Blue Helm production pane status — pane and token isolation.
//
// Procurement record: docs/OSS-PROCUREMENT-pane-status.md
// Blue's verdict, verbatim: BLUE SUBSYSTEM VERDICT: BUILD FRESH
//
// The main-process authority for which pane exists, which token belongs to it, what state it is in,
// and when to stop believing that state. PURE except for an injected clock and an injected CSPRNG, so
// every rule below is unit-testable with no pipe, no Electron, and no Claude.
//
// THE STRUCTURAL PROPERTY THIS FILE EXISTS TO GUARANTEE:
//
//   applyMessage() TAKES NO paneId.
//
// The token chooses the pane. A caller cannot direct an event at a pane of its choosing even if it
// wanted to, because there is no parameter through which to express the wish. "A misrouted event
// cannot update the wrong pane" is therefore a property of the type signature, not a check somebody
// has to remember to write — and it stays true when a future edit adds a caller.
//
// WHERE THE TOKEN IS ALLOWED TO EXIST: in this module's memory, and in the environment of the PTY
// that Blue Helm spawned Claude Code into. Nowhere else. It is not in a view, not in the renderer, not
// in Claude settings, not in the installation descriptor, and not in any log line. Each of those is
// asserted by a test rather than merely intended.

const protocol = require('./pane-status-protocol');
const freshness = require('./pane-status-freshness');

// Token comparison. crypto.timingSafeEqual requires equal-length buffers, guaranteed here because the
// protocol validator enforced the exact hex length before this is ever reached. The length guard is
// belt-and-braces: a mismatch is a plain `false`, never a throw.
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
 *   now()             -> ms epoch (injected clock)
 *   randomToken()     -> 64-char lowercase hex from a CSPRNG (injected)
 *   crypto            -> node crypto, for timingSafeEqual
 *   isVersionSupported() -> boolean supplier, from pane-status-version.js
 *   staleMs           -> optional override
 *   log(line)         -> bounded logger. NEVER called with a token or a message body.
 */
function createPaneStatusRegistry(deps) {
  const d = deps || {};
  const now = typeof d.now === 'function' ? d.now : () => Date.now();
  const randomToken = typeof d.randomToken === 'function' ? d.randomToken : null;
  const cryptoModule = d.crypto || null;
  const isVersionSupported = typeof d.isVersionSupported === 'function' ? d.isVersionSupported : () => false;
  const staleMs = typeof d.staleMs === 'number' ? d.staleMs : freshness.MAX_NONTERMINAL_STALE_MS;
  const log = typeof d.log === 'function' ? d.log : () => {};
  if (!randomToken) throw new Error('pane-status-registry: randomToken dependency is required');
  if (!cryptoModule || typeof cryptoModule.timingSafeEqual !== 'function') {
    throw new Error('pane-status-registry: crypto with timingSafeEqual is required');
  }
  const constantTimeEqual = makeConstantTimeCompare(cryptoModule);

  // Keyed by immutable pane ID. Each value: { token, lastEvent, lastEventAt, lastRefreshAt,
  // acceptedCount, refusedCount }.
  const panes = new Map();

  // An installation-wide forced `unknown` reason (hooks removed, reconciliation required, not
  // installed). It outranks per-pane state because it is a fact about the INSTALLATION.
  let overrideReason = freshness.UNKNOWN_REASON.NOT_INSTALLED;

  function setOverrideReason(reason) {
    overrideReason = typeof reason === 'string' && reason.length ? reason : null;
  }

  /**
   * Enroll a pane and mint its token. Returns { ok:true, token } — the ONLY time a token leaves this
   * module, handed to the caller that is about to put it in the pane's PTY environment.
   *
   * Re-enrolling an existing pane id MINTS A NEW TOKEN AND CLEARS STATE. A pane id can be reused when
   * a pane is closed and another opens; the new pane must inherit nothing, or it would display the
   * dead pane's last status as though it were its own.
   */
  function enroll(paneId) {
    if (typeof paneId !== 'string' || paneId.length === 0) return { ok: false, reason: 'bad-pane-id' };
    const token = randomToken();
    if (typeof token !== 'string' || !protocol.TOKEN_PATTERN.test(token)) {
      return { ok: false, reason: 'bad-token-generated' };
    }
    const existed = panes.has(paneId);
    panes.set(paneId, {
      token,
      lastEvent: null,
      lastEventAt: null,
      lastRefreshAt: null,
      acceptedCount: 0,
      refusedCount: 0,
    });
    log(`[pane-status] pane ${paneId} enrolled${existed ? ' (re-enrolled: new token, state cleared)' : ''}`);
    return { ok: true, token };
  }

  /**
   * Revoke one pane's token and forget its state. Called on spawn failure, PTY exit, explicit pane
   * close, successful hook removal, and window teardown — every path by which a pane stops being a
   * thing we may speak about.
   */
  function revoke(paneId, reason) {
    if (!panes.has(paneId)) return false;
    panes.delete(paneId);
    // `reason` is a bounded constant supplied by the controller, never free text and never a payload.
    log(`[pane-status] pane ${paneId} revoked (${reason || 'unspecified'}); token discarded`);
    return true;
  }

  /** Revoke everything — window teardown, successful removal, reconciliation-required. */
  function revokeAll(reason) {
    const ids = Array.from(panes.keys());
    for (const id of ids) revoke(id, reason);
    return ids.length;
  }

  /**
   * Apply one already-validated message. THERE IS NO paneId PARAMETER — see the header.
   *
   * Returns { ok:true, paneId, state, applied } or { ok:false, reason }.
   */
  function applyMessage(message) {
    const m = message || {};
    const token = typeof m.t === 'string' ? m.t : (typeof m.token === 'string' ? m.token : '');
    const event = typeof m.e === 'string' ? m.e : (typeof m.event === 'string' ? m.event : '');

    if (!protocol.ALLOWED_EVENT_SET.has(event)) {
      return { ok: false, reason: protocol.REFUSE.BAD_EVENT };
    }

    // Find the pane whose token matches, comparing every candidate in constant time. Iterating rather
    // than keying a second Map by token keeps the pane-ID Map the single source of truth.
    let matchedId = null;
    for (const [paneId, entry] of panes) {
      if (constantTimeEqual(token, entry.token)) { matchedId = paneId; break; }
    }
    if (matchedId === null) {
      for (const entry of panes.values()) entry.refusedCount += 1;
      return { ok: false, reason: protocol.REFUSE.UNKNOWN_TOKEN };
    }

    const entry = panes.get(matchedId);
    const at = now();

    // What this event is allowed to do depends on what we would display RIGHT NOW — which is how the
    // PostToolUse rule avoids resurrecting a pane that has already aged into `unknown`.
    const current = resolveFor(entry);
    const verdict = freshness.classifyEvent(event, current.state);

    if (verdict.apply === 'state') {
      entry.lastEvent = event;
      entry.lastEventAt = at;
      entry.lastRefreshAt = null;
      entry.acceptedCount += 1;
    } else if (verdict.apply === 'refresh') {
      entry.lastRefreshAt = at;
      entry.acceptedCount += 1;
    } else {
      // Accepted as authentic, deliberately without effect. Not a refusal — the token was ours.
      return { ok: true, paneId: matchedId, state: current.state, applied: 'none' };
    }

    const resolved = resolveFor(entry);
    // The event name is one of eight allowlisted constants, so it is safe to log. A payload is not.
    log(`[pane-status] accepted ${event} on pane ${matchedId} -> ${resolved.state}`);
    return { ok: true, paneId: matchedId, state: resolved.state, applied: verdict.apply };
  }

  /** Count a refusal that happened before a token could be extracted (size / JSON / shape). */
  function countRefusal() {
    for (const entry of panes.values()) entry.refusedCount += 1;
  }

  function resolveFor(entry) {
    return freshness.resolveDisplayState({
      lastEvent: entry.lastEvent,
      lastEventAt: entry.lastEventAt,
      lastRefreshAt: entry.lastRefreshAt,
      now: now(),
      staleMs,
      versionSupported: isVersionSupported(),
      overrideReason,
    });
  }

  /**
   * The renderer-facing view for one pane. Contains NO token, BY CONSTRUCTION — this object literal is
   * the only thing the IPC layer sends, and there is no branch here that can add one.
   */
  function viewFor(paneId) {
    const entry = panes.get(paneId);
    if (!entry) return null;
    const resolved = resolveFor(entry);
    return { paneId, state: resolved.state, reason: resolved.reason };
  }

  /** Every enrolled pane's view, for a full renderer refresh. Still no tokens. */
  function views() {
    const out = [];
    for (const paneId of panes.keys()) out.push(viewFor(paneId));
    return out;
  }

  function enrolledPaneIds() { return Array.from(panes.keys()); }
  function has(paneId) { return panes.has(paneId); }
  function size() { return panes.size; }

  /** Diagnostics. Token is NOT included and cannot be. */
  function stats() {
    const out = [];
    for (const [paneId, entry] of panes) {
      out.push({
        paneId,
        lastEvent: entry.lastEvent,
        lastEventAt: entry.lastEventAt,
        lastRefreshAt: entry.lastRefreshAt,
        acceptedCount: entry.acceptedCount,
        refusedCount: entry.refusedCount,
      });
    }
    return { panes: out, overrideReason, versionSupported: isVersionSupported() };
  }

  return {
    enroll,
    revoke,
    revokeAll,
    applyMessage,
    countRefusal,
    viewFor,
    views,
    enrolledPaneIds,
    has,
    size,
    setOverrideReason,
    stats,
  };
}

const api = { createPaneStatusRegistry, makeConstantTimeCompare };
if (typeof module === 'object' && module.exports) module.exports = api;
