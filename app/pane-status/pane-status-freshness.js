'use strict';
// Blue Helm production pane status — staleness policy and display-state resolution.
//
// Procurement record: docs/OSS-PROCUREMENT-pane-status.md
// Blue's verdict, verbatim: BLUE SUBSYSTEM VERDICT: BUILD FRESH
//
// This module owns the single question "given what we last heard and when, what may we honestly show
// right now?". It is PURE — an injected clock, no timers, no I/O, no process creation — so every rule
// below is testable against a fake clock at exact millisecond boundaries.
//
// THE THREE WAYS A PANE BECOMES `unknown`, and why they are separate reasons rather than one:
//   * version-mismatch — we do not trust the event vocabulary at all. Nothing we heard is meaningful.
//   * no-signal        — enrolled, but nothing has ever arrived. Silence is not idleness.
//   * stale            — we heard something, and it aged out. The last fact was true once.
// Collapsing these into a bare `unknown` would throw away exactly the information a person needs to
// decide whether to re-run setup, wait, or go look at the pane.

// A non-terminal state older than this stops being believable. Chosen well above a normal turn gap so
// an idle agent does not flicker, and well below "we forgot about this pane".
//
// TUNABLE (?) — and coupled. This number is only defensible BECAUSE PreToolUse/PostToolUse refresh
// freshness during long tool work. Remove tool-event freshness and 120s becomes wrong, not merely
// conservative: see the dependency note at the foot of this file.
const MAX_NONTERMINAL_STALE_MS = 120000;

// How often the controller re-resolves display state so a pane can age into `unknown` without a new
// event arriving. Staleness is a property of the CLOCK, not of message arrival; without a heartbeat a
// silent pane would keep showing its last state forever.
const HEARTBEAT_MS = 5000;

// Worst case a person can observe: an event lands just after a heartbeat tick, ages out
// MAX_NONTERMINAL_STALE_MS later, and is not re-resolved until the following tick.
// 120000 + 5000 = 125000 ms. Documented so nobody "fixes" the 5s tick without re-deciding the 120s.
const WORST_CASE_STALE_MS = MAX_NONTERMINAL_STALE_MS + HEARTBEAT_MS;

const UNKNOWN_REASON = Object.freeze({
  VERSION_MISMATCH: 'version-mismatch',
  NO_SIGNAL: 'no-signal',
  STALE: 'stale',
  HOOK_REMOVED: 'hook-removed',
  RECONCILIATION_REQUIRED: 'reconciliation-required',
  NOT_INSTALLED: 'not-installed',
});

const protocol = require('./pane-status-protocol');

/**
 * Resolve what the badge may show.
 *
 * input:
 *   lastEvent        -> last accepted event name, or null
 *   lastEventAt      -> ms epoch when it was accepted, or null
 *   lastRefreshAt    -> ms epoch of the last freshness-only refresh (PostToolUse), or null
 *   now              -> ms epoch (injected)
 *   staleMs          -> optional override of MAX_NONTERMINAL_STALE_MS
 *   versionSupported -> boolean, from pane-status-version.js
 *   overrideReason   -> a forced unknown reason (hook removed, reconciliation required, ...)
 *
 * returns { state, reason } where reason is null for a real lifecycle state.
 */
function resolveDisplayState(input) {
  const i = input || {};
  const now = typeof i.now === 'number' ? i.now : Date.now();
  const staleMs = typeof i.staleMs === 'number' ? i.staleMs : MAX_NONTERMINAL_STALE_MS;

  // A forced reason outranks everything. Removal and reconciliation are facts about the INSTALLATION,
  // not about the pane, and no amount of recent traffic makes them stop being true.
  if (typeof i.overrideReason === 'string' && i.overrideReason.length) {
    return { state: 'unknown', reason: i.overrideReason };
  }

  // Version gate first: if we do not trust the vocabulary, nothing we heard means anything.
  if (i.versionSupported !== true) {
    return { state: 'unknown', reason: UNKNOWN_REASON.VERSION_MISMATCH };
  }

  if (typeof i.lastEvent !== 'string' || typeof i.lastEventAt !== 'number') {
    return { state: 'unknown', reason: UNKNOWN_REASON.NO_SIGNAL };
  }

  const state = protocol.EVENT_STATE[i.lastEvent];
  // A refresh-only event must never be the state-bearing lastEvent. If one got here, we do not know
  // what to show, and guessing is the failure mode this subsystem exists to avoid.
  if (typeof state !== 'string') {
    return { state: 'unknown', reason: UNKNOWN_REASON.NO_SIGNAL };
  }

  // Terminal states are FACTS, not observations that decay. A session that ended stays ended; ageing
  // it to `unknown` would replace a true statement with an ignorant one.
  if (protocol.TERMINAL_STATES.has(state)) {
    return { state, reason: null };
  }

  // Freshness is the later of the state event and any refresh-only event that followed it.
  const freshAt = typeof i.lastRefreshAt === 'number' && i.lastRefreshAt > i.lastEventAt
    ? i.lastRefreshAt
    : i.lastEventAt;

  // Strictly greater: at exactly staleMs the state is still shown. The boundary is asserted in tests
  // at 119999 / 120000 / 120001 so a future edit cannot quietly move it.
  if (now - freshAt > staleMs) {
    return { state: 'unknown', reason: UNKNOWN_REASON.STALE };
  }
  return { state, reason: null };
}

/**
 * Decide what a newly accepted event does to a pane's stored freshness.
 *
 * THE POSTTOOLUSE RULE, which is the whole reason this function exists rather than a one-line
 * assignment. PostToolUse is a FRESHNESS REFRESH ONLY, and only when the state we would display RIGHT
 * NOW is `working`. It must not mutate idle, attention, turn ended, failed, exited, stale unknown,
 * version-mismatch unknown, or no-signal unknown.
 *
 * Why that condition is on the RESOLVED display state and not on the stored lastEvent: a pane whose
 * stored event is `working` but which has already aged into stale `unknown` must NOT be silently
 * resurrected by a late tool event. Resurrection would turn an honest `unknown` into a confident
 * `working` on the strength of a signal that says nothing about the model's turn.
 *
 * returns { apply:'state' } | { apply:'refresh' } | { apply:'none' }
 */
function classifyEvent(eventName, resolvedState) {
  if (typeof eventName !== 'string' || !protocol.ALLOWED_EVENT_SET.has(eventName)) {
    return { apply: 'none' };
  }
  if (protocol.REFRESH_ONLY_EVENTS.indexOf(eventName) === -1) {
    return { apply: 'state' };
  }
  return resolvedState === 'working' ? { apply: 'refresh' } : { apply: 'none' };
}

// DEPENDENCY, RECORDED DELIBERATELY.
//
// MAX_NONTERMINAL_STALE_MS = 120000 is only honest because PreToolUse sets `working` and PostToolUse
// refreshes it, so a long tool call keeps the pane alive. If tool-event freshness is ever removed, this
// constant REQUIRES A FRESH DECISION — it does not merely become conservative.
//
// Even with tool events, a model call that runs longer than 120 seconds with no tool use at all WILL
// display `unknown`. That is correct behaviour, not a bug: we genuinely have not heard from it, and
// saying so is the honest answer.

const api = {
  MAX_NONTERMINAL_STALE_MS,
  HEARTBEAT_MS,
  WORST_CASE_STALE_MS,
  UNKNOWN_REASON,
  resolveDisplayState,
  classifyEvent,
};
if (typeof module === 'object' && module.exports) module.exports = api;
