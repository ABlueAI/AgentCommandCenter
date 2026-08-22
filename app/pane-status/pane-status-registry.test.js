'use strict';
// Run: node app/pane-status/pane-status-registry.test.js
//
// Pane and token isolation. The load-bearing assertion in this file is the one about applyMessage's
// SIGNATURE: it takes no paneId, so misrouting is not a bug that can be introduced by a careless
// caller — there is no parameter through which to misroute.

const crypto = require('crypto');
const registryMod = require('./pane-status-registry');
const protocol = require('./pane-status-protocol');
const freshness = require('./pane-status-freshness');

let passed = 0, failed = 0;
function assert(cond, label) {
  if (cond) { process.stdout.write(`  ✓ ${label}\n`); passed++; }
  else { process.stderr.write(`  ✗ FAIL: ${label}\n`); failed++; }
}

let clock = 1000;
const logs = [];
function makeRegistry(over) {
  logs.length = 0;
  return registryMod.createPaneStatusRegistry(Object.assign({
    now: () => clock,
    randomToken: () => crypto.randomBytes(32).toString('hex'),
    crypto,
    isVersionSupported: () => true,
    log: (l) => logs.push(l),
  }, over || {}));
}

// ---------------------------------------------------------------- the structural property
assert(registryMod.createPaneStatusRegistry.length <= 1, 'the factory takes a single deps object');
{
  const r = makeRegistry();
  assert(r.applyMessage.length === 1, 'applyMessage takes exactly ONE argument (the message) — there is no paneId parameter');
}

// ---------------------------------------------------------------- enrollment and token shape
{
  const r = makeRegistry(); r.setOverrideReason(null);
  const a = r.enroll('pty1');
  const b = r.enroll('pty2');
  assert(a.ok && b.ok, 'two panes can enroll');
  assert(protocol.TOKEN_PATTERN.test(a.token) && protocol.TOKEN_PATTERN.test(b.token), 'both tokens are 64-hex');
  assert(a.token !== b.token, 'each pane gets a DISTINCT token');
  assert(r.size() === 2, 'both are tracked');
  assert(r.enroll('').ok === false, 'an empty pane id is refused');
}

// ---------------------------------------------------------------- multi-pane isolation
{
  const r = makeRegistry(); r.setOverrideReason(null);
  const a = r.enroll('pty1');
  const b = r.enroll('pty2');
  const applied = r.applyMessage({ e: 'UserPromptSubmit', t: a.token });
  assert(applied.ok && applied.paneId === 'pty1', 'a message bearing pane1 token lands on pane1');
  assert(r.viewFor('pty1').state === 'working', 'pane1 is working');
  assert(r.viewFor('pty2').state === 'unknown' && r.viewFor('pty2').reason === 'no-signal',
    'pane2 is UNAFFECTED and still no-signal');

  r.applyMessage({ e: 'SessionEnd', t: b.token });
  assert(r.viewFor('pty2').state === 'exited', 'pane2 receives its own event');
  assert(r.viewFor('pty1').state === 'working', 'and pane1 is still working');
}

// ---------------------------------------------------------------- unknown / revoked tokens
{
  const r = makeRegistry(); r.setOverrideReason(null);
  const a = r.enroll('pty1');
  const bogus = 'b'.repeat(64);
  const res = r.applyMessage({ e: 'Stop', t: bogus });
  assert(res.ok === false && res.reason === protocol.REFUSE.UNKNOWN_TOKEN, 'an unknown token is refused');

  r.revoke('pty1', 'pty-exit');
  const after = r.applyMessage({ e: 'Stop', t: a.token });
  assert(after.ok === false && after.reason === protocol.REFUSE.UNKNOWN_TOKEN,
    'a REVOKED token stops working immediately');
  assert(r.viewFor('pty1') === null, 'a revoked pane has no view');
}

// ---------------------------------------------------------------- pane-id reuse mints a new token
{
  const r = makeRegistry(); r.setOverrideReason(null);
  const first = r.enroll('pty1');
  r.applyMessage({ e: 'UserPromptSubmit', t: first.token });
  assert(r.viewFor('pty1').state === 'working', 'the first pane is working');

  r.revoke('pty1', 'pane-closed');
  const second = r.enroll('pty1');
  assert(second.token !== first.token, 'a later pane REUSING the pane id gets a NEW token');
  assert(r.viewFor('pty1').state === 'unknown' && r.viewFor('pty1').reason === 'no-signal',
    'and inherits NO state from the dead pane');
  assert(r.applyMessage({ e: 'Stop', t: first.token }).ok === false,
    'the OLD token cannot drive the new pane');
}

// ---------------------------------------------------------------- the PostToolUse rule, end to end
{
  const r = makeRegistry(); r.setOverrideReason(null);
  const a = r.enroll('pty1');

  r.applyMessage({ e: 'PreToolUse', t: a.token });
  assert(r.viewFor('pty1').state === 'working', 'PreToolUse sets working');
  clock += 100000;
  const refreshed = r.applyMessage({ e: 'PostToolUse', t: a.token });
  assert(refreshed.applied === 'refresh', 'PostToolUse refreshes while working');
  clock += 100000;                                  // 200000 since PreToolUse, 100000 since refresh
  assert(r.viewFor('pty1').state === 'working', 'the refresh kept the pane alive past the original 120s');

  // ... but it must not touch a non-working state
  r.applyMessage({ e: 'Notification', t: a.token });
  assert(r.viewFor('pty1').state === 'attention', 'Notification sets attention');
  const noop = r.applyMessage({ e: 'PostToolUse', t: a.token });
  assert(noop.ok === true && noop.applied === 'none', 'PostToolUse on an attention pane is accepted but does NOTHING');
  assert(r.viewFor('pty1').state === 'attention', 'and the state is unchanged');

  // ... and must not resurrect a stale pane
  r.applyMessage({ e: 'UserPromptSubmit', t: a.token });
  clock += 120001;
  assert(r.viewFor('pty1').state === 'unknown', 'the pane has aged into unknown');
  const late = r.applyMessage({ e: 'PostToolUse', t: a.token });
  assert(late.applied === 'none' && r.viewFor('pty1').state === 'unknown',
    'a late PostToolUse does NOT resurrect a stale pane');
}

// ---------------------------------------------------------------- no token anywhere it must not be
{
  const r = makeRegistry(); r.setOverrideReason(null);
  const a = r.enroll('pty1');
  r.applyMessage({ e: 'UserPromptSubmit', t: a.token });

  const viewJson = JSON.stringify(r.views());
  assert(viewJson.indexOf(a.token) === -1, 'no token in any renderer view');
  assert(Object.keys(r.viewFor('pty1')).sort().join(',') === 'paneId,reason,state',
    'a view has exactly paneId, state, reason');
  assert(JSON.stringify(r.stats()).indexOf(a.token) === -1, 'no token in stats');
  assert(logs.join('|').indexOf(a.token) === -1, 'no token in any log line');
}

// ---------------------------------------------------------------- override reasons
{
  const r = makeRegistry(); r.setOverrideReason(null);
  const a = r.enroll('pty1');
  r.applyMessage({ e: 'UserPromptSubmit', t: a.token });
  r.setOverrideReason(freshness.UNKNOWN_REASON.HOOK_REMOVED);
  assert(r.viewFor('pty1').reason === 'hook-removed', 'an installation-wide override reaches every view');
  assert(r.revokeAll('hook-removed') === 1, 'revokeAll revokes every pane and reports how many');
  assert(r.size() === 0, 'nothing is left enrolled');
}

// ---------------------------------------------------------------- version gate is honoured
{
  const r = makeRegistry({ isVersionSupported: () => false }); r.setOverrideReason(null);
  const a = r.enroll('pty1');
  r.applyMessage({ e: 'UserPromptSubmit', t: a.token });
  assert(r.viewFor('pty1').reason === 'version-mismatch', 'an unsupported version shows version-mismatch');
}

process.stdout.write(`\npane-status-registry: ${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
