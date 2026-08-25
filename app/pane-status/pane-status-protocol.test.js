'use strict';
// Run: node app/pane-status/pane-status-protocol.test.js
//
// The wire contract. These assertions are the reason the reporter and the main-process validator
// cannot drift: both import this module, so a shape one end can produce and the other would reject is
// a build-time failure rather than a runtime mystery.

const protocol = require('./pane-status-protocol');

let passed = 0, failed = 0;
function assert(cond, label) {
  if (cond) { process.stdout.write(`  ✓ ${label}\n`); passed++; }
  else { process.stderr.write(`  ✗ FAIL: ${label}\n`); failed++; }
}

const TOKEN = 'a'.repeat(64);

// ---------------------------------------------------------------- events
assert(protocol.ALLOWED_EVENTS.length === 8, 'exactly eight events are allowlisted');
for (const ev of ['SessionStart', 'UserPromptSubmit', 'Notification', 'Stop', 'StopFailure', 'SessionEnd', 'PreToolUse', 'PostToolUse']) {
  assert(protocol.ALLOWED_EVENT_SET.has(ev), `allowlist contains ${ev}`);
}
assert(!protocol.ALLOWED_EVENT_SET.has('PermissionRequest'), 'a real Claude event we do not display is NOT allowlisted');
assert(Object.isFrozen(protocol.ALLOWED_EVENTS), 'the allowlist is frozen');

// ---------------------------------------------------------------- event -> state mapping
assert(protocol.EVENT_STATE.SessionStart === 'idle', 'SessionStart -> idle');
assert(protocol.EVENT_STATE.UserPromptSubmit === 'working', 'UserPromptSubmit -> working');
assert(protocol.EVENT_STATE.Notification === 'attention', 'Notification -> attention');
assert(protocol.EVENT_STATE.Stop === 'turn ended', 'Stop -> "turn ended", NOT "finished"');
assert(protocol.EVENT_STATE.StopFailure === 'failed', 'StopFailure -> failed');
assert(protocol.EVENT_STATE.SessionEnd === 'exited', 'SessionEnd -> exited');
assert(protocol.EVENT_STATE.PreToolUse === 'working', 'PreToolUse -> working');
assert(protocol.EVENT_STATE.PostToolUse === null, 'PostToolUse maps to null: it is refresh-only, not a state');
assert(protocol.REFRESH_ONLY_EVENTS.length === 1 && protocol.REFRESH_ONLY_EVENTS[0] === 'PostToolUse',
  'PostToolUse is the only refresh-only event');
assert(protocol.TERMINAL_STATES.has('exited') && protocol.TERMINAL_STATES.has('failed'),
  'exited and failed are terminal');
assert(!protocol.TERMINAL_STATES.has('turn ended'), '"turn ended" is NOT terminal — the pane is still alive');

// ---------------------------------------------------------------- encode
const line = protocol.encodeMessage('Stop', TOKEN);
assert(line.endsWith('\n'), 'an encoded message is newline-terminated');
const parsedOut = JSON.parse(line);
assert(Object.keys(parsedOut).length === 3, 'an encoded message has exactly three keys');
assert(Object.keys(parsedOut).every((k) => protocol.MESSAGE_KEYS.includes(k)), 'the keys are exactly v, e, t');
assert(parsedOut.v === protocol.PROTOCOL_VERSION && parsedOut.e === 'Stop' && parsedOut.t === TOKEN,
  'the values round-trip exactly');

let threw = false;
try { protocol.encodeMessage('PermissionRequest', TOKEN); } catch { threw = true; }
assert(threw, 'encoding a non-allowlisted event throws rather than emitting it');
threw = false;
try { protocol.encodeMessage('Stop', 'not-a-token'); } catch { threw = true; }
assert(threw, 'encoding with a malformed token throws');
threw = false;
try { protocol.encodeMessage('Stop', 'A'.repeat(64)); } catch { threw = true; }
assert(threw, 'an uppercase-hex token is refused (the pattern is lowercase-only)');

// ---------------------------------------------------------------- decode
const good = protocol.decodeMessage(line.trim());
assert(good.ok === true && good.e === 'Stop' && good.t === TOKEN, 'a well-formed message decodes');

const cases = [
  ['not json at all', protocol.REFUSE.NOT_JSON],
  ['[1,2,3]', protocol.REFUSE.NOT_OBJECT],
  [JSON.stringify({ v: 1, e: 'Stop', t: TOKEN, extra: 1 }), protocol.REFUSE.BAD_KEYS],
  [JSON.stringify({ v: 1, e: 'Stop' }), protocol.REFUSE.BAD_KEYS],
  [JSON.stringify({ v: 2, e: 'Stop', t: TOKEN }), protocol.REFUSE.BAD_VERSION],
  [JSON.stringify({ v: 1, e: 'Nope', t: TOKEN }), protocol.REFUSE.BAD_EVENT],
  [JSON.stringify({ v: 1, e: 'Stop', t: 'short' }), protocol.REFUSE.BAD_TOKEN_SHAPE],
];
for (const [raw, expected] of cases) {
  const r = protocol.decodeMessage(raw);
  assert(r.ok === false && r.reason === expected, `refuses ${expected} without throwing`);
}

const oversize = JSON.stringify({ v: 1, e: 'Stop', t: TOKEN, pad: 'x'.repeat(1000) });
assert(protocol.decodeMessage(oversize).reason === protocol.REFUSE.OVERSIZE, 'oversize is refused before parsing');

// EXTRA KEYS ARE REFUSED, NOT IGNORED. This is the property that keeps a future edit from quietly
// widening the privacy boundary by appending a field.
assert(protocol.decodeMessage(JSON.stringify({ v: 1, e: 'Stop', t: TOKEN, prompt: 'leak' })).ok === false,
  'a message carrying an extra field is REFUSED, not silently accepted with the field dropped');

// The reason string never contains the offending input.
const hostile = JSON.stringify({ v: 1, e: 'Stop', t: TOKEN, secret: 'SENTINEL-LEAK-1234' });
const refusal = protocol.decodeMessage(hostile);
assert(JSON.stringify(refusal).indexOf('SENTINEL-LEAK-1234') === -1, 'a refusal never echoes the input that caused it');

process.stdout.write(`\npane-status-protocol: ${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
