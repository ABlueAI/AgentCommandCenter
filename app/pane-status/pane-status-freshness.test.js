'use strict';
// Run: node app/pane-status/pane-status-freshness.test.js
//
// The staleness policy, asserted at EXACT millisecond boundaries on a fake clock, and the full
// PostToolUse matrix. These are the numbers a future edit is most likely to nudge, so they are pinned
// on both sides rather than "roughly two minutes".

const freshness = require('./pane-status-freshness');

let passed = 0, failed = 0;
function assert(cond, label) {
  if (cond) { process.stdout.write(`  ✓ ${label}\n`); passed++; }
  else { process.stderr.write(`  ✗ FAIL: ${label}\n`); failed++; }
}

const R = freshness.UNKNOWN_REASON;

// ---------------------------------------------------------------- constants and their coupling
assert(freshness.MAX_NONTERMINAL_STALE_MS === 120000, 'MAX_NONTERMINAL_STALE_MS is 120000');
assert(freshness.HEARTBEAT_MS === 5000, 'HEARTBEAT_MS is 5000');
assert(freshness.WORST_CASE_STALE_MS === 125000, 'documented worst case is 125000 = 120000 + 5000');
assert(freshness.WORST_CASE_STALE_MS === freshness.MAX_NONTERMINAL_STALE_MS + freshness.HEARTBEAT_MS,
  'the worst case is DERIVED from the two constants, so it cannot drift from them');

function resolve(over) {
  return freshness.resolveDisplayState(Object.assign({
    lastEvent: 'UserPromptSubmit', lastEventAt: 0, lastRefreshAt: null,
    now: 0, versionSupported: true, overrideReason: null,
  }, over));
}

// ---------------------------------------------------------------- the 120000 boundary, exactly
assert(resolve({ now: 119999 }).state === 'working', 'at 119999ms the state still shows');
assert(resolve({ now: 120000 }).state === 'working', 'at exactly 120000ms the state STILL shows (boundary is strictly greater)');
const past = resolve({ now: 120001 });
assert(past.state === 'unknown' && past.reason === R.STALE, 'at 120001ms it becomes unknown/stale');

// ---------------------------------------------------------------- terminal states never age out
for (const [ev, st] of [['SessionEnd', 'exited'], ['StopFailure', 'failed']]) {
  const r = resolve({ lastEvent: ev, now: 999999999 });
  assert(r.state === st && r.reason === null, `${ev} -> ${st} is terminal and never ages to unknown`);
}
const turnEnded = resolve({ lastEvent: 'Stop', now: 120001 });
assert(turnEnded.state === 'unknown' && turnEnded.reason === R.STALE,
  '"turn ended" is NOT terminal and does age out');

// ---------------------------------------------------------------- the three unknowns are distinct
assert(resolve({ versionSupported: false }).reason === R.VERSION_MISMATCH, 'unsupported version -> version-mismatch');
assert(resolve({ lastEvent: null, lastEventAt: null }).reason === R.NO_SIGNAL, 'never heard anything -> no-signal');
assert(resolve({ now: 200000 }).reason === R.STALE, 'heard something that aged -> stale');
assert(resolve({ overrideReason: R.HOOK_REMOVED }).reason === R.HOOK_REMOVED, 'an override outranks a live state');
assert(resolve({ overrideReason: R.RECONCILIATION_REQUIRED, now: 0 }).state === 'unknown',
  'reconciliation-required forces unknown even with a fresh event');

// version gate outranks a fresh event, because we do not trust the vocabulary at all
assert(resolve({ versionSupported: false, now: 0 }).state === 'unknown',
  'an unsupported version shows unknown even when the event just arrived');

// ---------------------------------------------------------------- refresh extends freshness
assert(resolve({ lastEventAt: 0, lastRefreshAt: 100000, now: 220000 }).state === 'working',
  'a refresh at 100000 keeps the pane alive until 220000');
assert(resolve({ lastEventAt: 0, lastRefreshAt: 100000, now: 220001 }).reason === R.STALE,
  'and it ages out 120000ms after the REFRESH, not after the original event');
assert(resolve({ lastEventAt: 100000, lastRefreshAt: 50000, now: 220000 }).state === 'working',
  'an older refresh never shortens freshness');

// ---------------------------------------------------------------- the PostToolUse matrix
// PostToolUse refreshes ONLY when the resolved display state is currently `working`.
const shouldRefresh = ['working'];
const mustNotTouch = ['idle', 'attention', 'turn ended', 'failed', 'exited', 'unknown'];
for (const st of shouldRefresh) {
  assert(freshness.classifyEvent('PostToolUse', st).apply === 'refresh', `PostToolUse refreshes when state is "${st}"`);
}
for (const st of mustNotTouch) {
  assert(freshness.classifyEvent('PostToolUse', st).apply === 'none', `PostToolUse is a NO-OP when state is "${st}"`);
}

// Every state-bearing event applies as a state, regardless of the current state.
for (const ev of ['SessionStart', 'UserPromptSubmit', 'Notification', 'Stop', 'StopFailure', 'SessionEnd', 'PreToolUse']) {
  assert(freshness.classifyEvent(ev, 'unknown').apply === 'state', `${ev} applies as a state`);
}
assert(freshness.classifyEvent('PermissionRequest', 'working').apply === 'none', 'a non-allowlisted event does nothing');

// THE RESURRECTION GUARD: a pane that has already aged into stale `unknown` must not be revived by a
// late PostToolUse. This is why classifyEvent takes the RESOLVED state rather than the stored event.
assert(freshness.classifyEvent('PostToolUse', 'unknown').apply === 'none',
  'a stale-unknown pane is NOT resurrected by a late PostToolUse');

process.stdout.write(`\npane-status-freshness: ${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
