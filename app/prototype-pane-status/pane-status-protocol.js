'use strict';
// EXPERIMENT A — PROTOTYPE ONLY. Cross-provider pane-status indicators, Claude Code only.
//
// Procurement record: docs/OSS-PROCUREMENT-pane-status.md
// Blue's verdict, verbatim: BLUE SUBSYSTEM VERDICT: PROTOTYPE
// That authorizes bounded Experiment A only. This file is NOT a production specification and must
// not be treated as one. Nothing here is authorized to ship.
//
// The shared, PURE wire contract between the hook reporter (a child process Claude spawns) and the
// main process. Both ends import this so they cannot drift: a reporter that can encode a message the
// main-process validator would reject is a bug the tests catch at build time, not at runtime.
//
// DESIGN RULE THAT DRIVES EVERYTHING BELOW: the message carries exactly two facts — WHICH lifecycle
// event fired, and WHICH pane it belongs to. There is deliberately no room in the shape for anything
// else. Extra keys are not ignored, they are REFUSED, so a future edit that starts appending a field
// fails loudly instead of quietly widening the privacy boundary.

// Wire version. Bumped only if the shape changes. Main refuses a mismatched version outright rather
// than trying to interpret an older/newer reporter — a stale reporter must degrade to `unknown`, not
// to a plausible-looking wrong status.
const PROTOCOL_VERSION = 1;

// Hard ceiling on one newline-delimited message. A correct message is ~110 bytes; 512 leaves room for
// the longest allowlisted event name without ever approaching a size worth streaming. Anything larger
// is refused WITHOUT being parsed or logged.
const MAX_MESSAGE_BYTES = 512;

// Token: 32 random bytes rendered lowercase hex. Length is fixed and checked before any comparison so
// the constant-time compare in main always gets equal-length buffers.
const TOKEN_HEX_LENGTH = 64;
const TOKEN_PATTERN = /^[0-9a-f]{64}$/;

// The ONLY hook events this prototype accepts. Everything else — including real Claude Code events
// like PreToolUse, PostToolUse and PermissionRequest — is refused. A narrow allowlist is the point:
// events we do not display cannot become an accidental side channel.
const ALLOWED_EVENTS = Object.freeze([
  'SessionStart',
  'UserPromptSubmit',
  'Notification',
  'Stop',
  'StopFailure',
  'SessionEnd',
]);
const ALLOWED_EVENT_SET = new Set(ALLOWED_EVENTS);

// Event -> displayed state. The wording is load-bearing and was chosen against § 8 of the procurement
// record (threats 5-7: never infer "finished" from a turn boundary).
//
// `Stop` is 'turn ended'. NOT 'finished', NOT 'safe', NOT 'process exited'. Claude Code's Stop fires
// when the assistant's turn ends; the agent may be waiting to be asked something else, a subagent may
// still be running, and the PTY is certainly still alive. Calling it "finished" would be exactly the
// confidently-false status the threat model forbids.
const EVENT_STATE = Object.freeze({
  SessionStart: 'idle',
  UserPromptSubmit: 'working',
  Notification: 'attention',
  Stop: 'turn ended',
  StopFailure: 'failed',
  SessionEnd: 'exited',
});

// Every state the badge can ever show. `unknown` is a first-class outcome, not an error path.
const STATES = Object.freeze(['idle', 'working', 'attention', 'turn ended', 'failed', 'exited', 'unknown']);

// A state older than this degrades to `unknown`. Chosen well above a normal turn gap so an idle agent
// does not flicker, and well below "we forgot about this pane". Tunable (?) — an experiment value,
// not a production one.
const STALE_MS = 120000;

// Terminal states are not aged out: a session that ended stays ended. Applying staleness to them
// would replace a true fact with `unknown`, which is a downgrade in honesty, not an upgrade.
const TERMINAL_STATES = Object.freeze(new Set(['exited', 'failed']));

// Refusal reasons. Bounded constants — never interpolate input into these, because the whole point of
// the reason string is that it is safe to log when the message that caused it is not.
const REFUSE = Object.freeze({
  OVERSIZE: 'oversize',
  NOT_JSON: 'not-json',
  NOT_OBJECT: 'not-object',
  BAD_KEYS: 'bad-keys',
  BAD_VERSION: 'bad-version',
  BAD_EVENT: 'bad-event',
  BAD_TOKEN_SHAPE: 'bad-token-shape',
  UNKNOWN_TOKEN: 'unknown-token',
});

// Exact key set. Short names keep the message small; the real reason they are short is that the
// validator checks the key set EXACTLY, so short names make "exactly these three" easy to read.
const MESSAGE_KEYS = Object.freeze(['v', 'e', 't']);

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Byte length of a UTF-8 string without allocating a Buffer in the hot path when we can avoid it. */
function utf8Length(text) {
  return Buffer.byteLength(text, 'utf8');
}

/**
 * Build the ONLY message shape the reporter may send. Throws on anything it cannot represent, so a
 * caller can never talk itself into emitting a half-valid line.
 */
function encodeMessage(hookEventName, token) {
  if (!ALLOWED_EVENT_SET.has(hookEventName)) {
    throw new Error('pane-status-protocol: event not allowlisted');
  }
  if (typeof token !== 'string' || !TOKEN_PATTERN.test(token)) {
    throw new Error('pane-status-protocol: token shape invalid');
  }
  const line = JSON.stringify({ v: PROTOCOL_VERSION, e: hookEventName, t: token }) + '\n';
  if (utf8Length(line) > MAX_MESSAGE_BYTES) {
    throw new Error('pane-status-protocol: encoded message exceeds MAX_MESSAGE_BYTES');
  }
  return line;
}

/**
 * Validate one received line. Returns { ok:true, event, token } or { ok:false, reason }.
 * NEVER returns any part of the input in the failure path — the caller logs `reason` only.
 *
 * Order matters and is fail-closed: size before parse (so an oversized blob is never handed to
 * JSON.parse), shape before content, exact-keys before per-field checks.
 */
function parseMessage(line) {
  if (typeof line !== 'string' || utf8Length(line) > MAX_MESSAGE_BYTES) {
    return { ok: false, reason: REFUSE.OVERSIZE };
  }
  let parsed;
  try { parsed = JSON.parse(line); } catch { return { ok: false, reason: REFUSE.NOT_JSON }; }
  if (!isPlainObject(parsed)) return { ok: false, reason: REFUSE.NOT_OBJECT };

  // EXACT key set — not "has the keys we need". An extra field is a refusal, which is what makes the
  // privacy boundary structural rather than aspirational.
  const keys = Object.keys(parsed);
  if (keys.length !== MESSAGE_KEYS.length) return { ok: false, reason: REFUSE.BAD_KEYS };
  for (const k of MESSAGE_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(parsed, k)) return { ok: false, reason: REFUSE.BAD_KEYS };
  }

  if (parsed.v !== PROTOCOL_VERSION) return { ok: false, reason: REFUSE.BAD_VERSION };
  if (typeof parsed.e !== 'string' || !ALLOWED_EVENT_SET.has(parsed.e)) {
    return { ok: false, reason: REFUSE.BAD_EVENT };
  }
  if (typeof parsed.t !== 'string' || parsed.t.length !== TOKEN_HEX_LENGTH || !TOKEN_PATTERN.test(parsed.t)) {
    return { ok: false, reason: REFUSE.BAD_TOKEN_SHAPE };
  }
  return { ok: true, event: parsed.e, token: parsed.t };
}

/** Event -> state. Unknown events never reach here (parseMessage refuses first), but fail closed. */
function stateForEvent(eventName) {
  return Object.prototype.hasOwnProperty.call(EVENT_STATE, eventName) ? EVENT_STATE[eventName] : 'unknown';
}

/**
 * The single honesty rule, in one place: given the last event we accepted and when, what may the badge
 * claim RIGHT NOW? Returns { state, reason } where reason explains any degrade to `unknown`.
 *
 * Degrades to `unknown` for: no signal yet, a Claude version we have not verified against, and a state
 * that has gone stale. Terminal states are exempt from staleness (see TERMINAL_STATES).
 */
function resolveDisplayState(input) {
  const opts = input || {};
  if (opts.versionSupported === false) return { state: 'unknown', reason: 'version-mismatch' };
  if (!opts.lastEvent) return { state: 'unknown', reason: 'no-signal' };
  const state = stateForEvent(opts.lastEvent);
  if (state === 'unknown') return { state: 'unknown', reason: 'unsupported-signal' };
  if (TERMINAL_STATES.has(state)) return { state, reason: null };
  const at = typeof opts.lastEventAt === 'number' ? opts.lastEventAt : null;
  const now = typeof opts.now === 'number' ? opts.now : null;
  if (at === null || now === null) return { state: 'unknown', reason: 'no-signal' };
  const staleMs = typeof opts.staleMs === 'number' ? opts.staleMs : STALE_MS;
  if (now - at >= staleMs) return { state: 'unknown', reason: 'stale' };
  return { state, reason: null };
}

/**
 * Is this installed Claude Code version one the prototype was actually exercised against?
 *
 * Deliberately an EXACT match against a pinned list, not a range or a semver comparison. § 7.5 of the
 * procurement record records that provider surfaces drift by REMOVAL as well as addition, so "newer
 * must be fine" is not a safe assumption to encode. An unverified version is not broken — it is
 * unverified, and the badge says `unknown` rather than guessing.
 */
function isVersionSupported(observedVersion, supportedVersions) {
  const list = Array.isArray(supportedVersions) ? supportedVersions : SUPPORTED_CLAUDE_VERSIONS;
  if (typeof observedVersion !== 'string' || observedVersion.length === 0) return false;
  return list.indexOf(observedVersion) !== -1;
}

// The versions this prototype was actually run against. Recorded here rather than in prose so the
// degrade-to-unknown path has a single source of truth the tests can read.
//
// THIS IS A CLOSED LIST OF EXACT STRINGS, NOT A RANGE AND NOT A SUPPORT DECLARATION.
//
//   '2.1.196' — npm `@anthropic-ai/claude-code`, exercised in the revision-1 live probe run.
//   '2.1.220' — `C:\Users\levij\.local\bin\claude.exe`, the executable a Blue Helm pane actually
//               resolves and launches. Added PROVISIONALLY in revision 3 under an explicit work
//               order, and only because the final authorized run exercises THAT EXACT resolved
//               binary through the real Electron path. If that run cannot start, launches a
//               different binary, or fails before producing a trustworthy observation, this entry
//               is removed again before finalization. It is an experiment record, not a
//               compatibility claim about the 2.1.x line.
//
// Two entries must not be read as "anything between them works". § 7.5 of the procurement record
// records that provider surfaces drift by REMOVAL as well as addition, so every version an operator
// might run has to be exercised on its own or it stays `unknown`. isVersionSupported() is an exact
// indexOf against this list precisely so no semver reasoning can creep in.
const SUPPORTED_CLAUDE_VERSIONS = Object.freeze(['2.1.196', '2.1.220']);

const api = {
  PROTOCOL_VERSION,
  MAX_MESSAGE_BYTES,
  TOKEN_HEX_LENGTH,
  TOKEN_PATTERN,
  ALLOWED_EVENTS,
  EVENT_STATE,
  STATES,
  STALE_MS,
  TERMINAL_STATES,
  REFUSE,
  MESSAGE_KEYS,
  SUPPORTED_CLAUDE_VERSIONS,
  encodeMessage,
  parseMessage,
  stateForEvent,
  resolveDisplayState,
  isVersionSupported,
};
if (typeof module === 'object' && module.exports) module.exports = api;
