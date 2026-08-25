'use strict';
// Blue Helm production pane status — the shared, PURE wire contract.
//
// Procurement record: docs/OSS-PROCUREMENT-pane-status.md
// Blue's verdict, verbatim: BLUE SUBSYSTEM VERDICT: BUILD FRESH
//
// Both ends of the wire import this so they cannot drift: a reporter that can encode a message the
// main-process validator would reject is a bug the tests catch at build time, not at runtime.
//
// DESIGN RULE: the message carries exactly two facts — WHICH lifecycle event fired, and WHICH pane it
// belongs to. There is deliberately no room in the shape for anything else. Extra keys are REFUSED,
// not ignored, so a future edit that starts appending a field fails loudly instead of quietly
// widening the privacy boundary.

// Wire version. Bumped only if the shape changes. Main refuses a mismatched version outright rather
// than interpreting an older/newer reporter — a stale reporter degrades to `unknown`, never to a
// plausible-looking wrong status.
const PROTOCOL_VERSION = 1;

// Hard ceiling on one newline-delimited message. A correct message is ~110 bytes; 512 leaves room for
// the longest allowlisted event name without ever approaching a size worth streaming.
const MAX_MESSAGE_BYTES = 512;

// Token: 32 CSPRNG bytes rendered lowercase hex. Length is fixed and checked before any comparison so
// the constant-time compare in main always gets equal-length buffers.
const TOKEN_BYTES = 32;
const TOKEN_HEX_LENGTH = 64;
const TOKEN_PATTERN = /^[0-9a-f]{64}$/;

// The eight hook events this subsystem installs and accepts. Everything else Claude Code can emit is
// refused. A narrow allowlist is the point: events we do not display cannot become a side channel.
const ALLOWED_EVENTS = Object.freeze([
  'SessionStart',
  'UserPromptSubmit',
  'Notification',
  'Stop',
  'StopFailure',
  'SessionEnd',
  'PreToolUse',
  'PostToolUse',
]);
const ALLOWED_EVENT_SET = new Set(ALLOWED_EVENTS);

// Event -> displayed state. The wording is load-bearing and was chosen against § 8 of the procurement
// record (threats 5-7: never infer "finished" from a turn boundary).
//
// `Stop` is 'turn ended'. NOT 'finished', NOT 'safe', NOT 'process exited'. Claude Code's Stop fires
// when the assistant's turn ends; the agent may be waiting to be asked something else, a subagent may
// still be running, and the PTY is certainly still alive.
//
// PostToolUse deliberately maps to null: it is a FRESHNESS REFRESH ONLY, and only when the currently
// resolved display state is already 'working'. It must never mutate idle, attention, turn ended,
// failed, exited, or any unknown. See pane-status-freshness.js — this null is what encodes that.
const EVENT_STATE = Object.freeze({
  SessionStart: 'idle',
  UserPromptSubmit: 'working',
  Notification: 'attention',
  Stop: 'turn ended',
  StopFailure: 'failed',
  SessionEnd: 'exited',
  PreToolUse: 'working',
  PostToolUse: null,
});

// Events that only refresh freshness rather than setting a state.
const REFRESH_ONLY_EVENTS = Object.freeze(['PostToolUse']);

// Every state the badge can ever show. `unknown` is a first-class outcome, not an error path.
const STATES = Object.freeze(['idle', 'working', 'attention', 'turn ended', 'failed', 'exited', 'unknown']);

// Terminal states are not aged out: a session that ended stays ended. Applying staleness to them
// would replace a true fact with `unknown`, which is a downgrade in honesty.
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
// validator checks the key set EXACTLY, so "exactly these three" stays easy to read.
const MESSAGE_KEYS = Object.freeze(['v', 'e', 't']);

// Encode one message. Constructed FRESH from an allowlisted event constant plus the caller's own
// token. Nothing from any provider payload can reach this function — it takes two strings.
function encodeMessage(eventName, token) {
  if (typeof eventName !== 'string' || !ALLOWED_EVENT_SET.has(eventName)) {
    throw new Error('encodeMessage: event not allowlisted');
  }
  if (typeof token !== 'string' || !TOKEN_PATTERN.test(token)) {
    throw new Error('encodeMessage: bad token shape');
  }
  const line = JSON.stringify({ v: PROTOCOL_VERSION, e: eventName, t: token }) + '\n';
  if (Buffer.byteLength(line, 'utf8') > MAX_MESSAGE_BYTES) {
    throw new Error('encodeMessage: oversize');
  }
  return line;
}

// Decode and validate one message. Returns { ok:true, v, e, t } or { ok:false, reason }.
// Never throws on hostile input, and never echoes input into the reason.
function decodeMessage(raw) {
  if (typeof raw !== 'string' && !Buffer.isBuffer(raw)) return { ok: false, reason: REFUSE.NOT_JSON };
  const text = Buffer.isBuffer(raw) ? raw.toString('utf8') : raw;
  if (Buffer.byteLength(text, 'utf8') > MAX_MESSAGE_BYTES) return { ok: false, reason: REFUSE.OVERSIZE };

  let parsed;
  try { parsed = JSON.parse(text); } catch { return { ok: false, reason: REFUSE.NOT_JSON }; }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, reason: REFUSE.NOT_OBJECT };
  }

  // EXACT key set — extra keys are refused, not ignored.
  const keys = Object.keys(parsed);
  if (keys.length !== MESSAGE_KEYS.length || !MESSAGE_KEYS.every((k) => Object.prototype.hasOwnProperty.call(parsed, k))) {
    return { ok: false, reason: REFUSE.BAD_KEYS };
  }
  if (parsed.v !== PROTOCOL_VERSION) return { ok: false, reason: REFUSE.BAD_VERSION };
  if (typeof parsed.e !== 'string' || !ALLOWED_EVENT_SET.has(parsed.e)) return { ok: false, reason: REFUSE.BAD_EVENT };
  if (typeof parsed.t !== 'string' || !TOKEN_PATTERN.test(parsed.t)) return { ok: false, reason: REFUSE.BAD_TOKEN_SHAPE };

  return { ok: true, v: parsed.v, e: parsed.e, t: parsed.t };
}

const api = {
  PROTOCOL_VERSION,
  MAX_MESSAGE_BYTES,
  TOKEN_BYTES,
  TOKEN_HEX_LENGTH,
  TOKEN_PATTERN,
  ALLOWED_EVENTS,
  ALLOWED_EVENT_SET,
  EVENT_STATE,
  REFRESH_ONLY_EVENTS,
  STATES,
  TERMINAL_STATES,
  REFUSE,
  MESSAGE_KEYS,
  encodeMessage,
  decodeMessage,
};
if (typeof module === 'object' && module.exports) module.exports = api;
