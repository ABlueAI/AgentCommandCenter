'use strict';
// Run: node app/session-hygiene.test.js
//
// S46: session hygiene's pure view: state, owner, done-when, idle time and the local day.

const { IDLE_DAYS, STATE, stateOf, view, idleRows, dayKey } = require('./session-hygiene');

let passed = 0, failed = 0;
function assert(cond, label) {
  if (cond) { process.stdout.write('  ✓ ' + label + '\n'); passed++; }
  else { process.stderr.write('  x FAIL: ' + label + '\n'); failed++; }
}
function section(t) { process.stdout.write('\n' + t + '\n'); }

const NOW = new Date('2026-11-25T12:00:00.000Z');
const now = () => NOW;
const rec = (o) => Object.assign({
  sessionId: 'aaaaaaaa-1111-4111-8111-111111111111', paneId: 'p1', role: 'builder', cli: 'claude', worktree: 'D:\\w\\repo-a',
  startedAt: '2026-11-25T09:00:00.000Z', stoppedAt: null, stopReason: null,
}, o);

section('stateOf');
assert(stateOf(rec()) === STATE.RUNNING, 'an open record is running');
assert(stateOf(rec({ stoppedAt: '2026-11-25T10:00:00.000Z', stopReason: 'mako-closed' })) === STATE.WAITING, 'one open when Mako closed waits for Resume');
assert(stateOf(rec({ stoppedAt: '2026-11-25T10:00:00.000Z', stopReason: 'unknown' })) === STATE.WAITING, 'so does one found open after a crash');
assert(stateOf(rec({ stoppedAt: '2026-11-25T10:00:00.000Z', stopReason: 'mako-closed', offered: true })) === STATE.FINISHED, 'once answered, it is finished');
assert(stateOf(rec({ stoppedAt: '2026-11-25T10:00:00.000Z', stopReason: 'exited' })) === STATE.FINISHED, 'an exited one is finished');
assert(stateOf(rec({ stoppedAt: '2026-11-25T10:00:00.000Z', stopReason: 'closed' })) === STATE.FINISHED, 'a closed one is finished');
assert(stateOf(rec({ stoppedAt: '2026-11-25T10:00:00.000Z', stopReason: 'closed', archivedAt: '2026-11-25T11:00:00.000Z' })) === STATE.ARCHIVED, 'an archived one is archived');

section('view');
{
  const rows = view([
    rec({ sessionId: 'a', owner: 'composer', doneWhen: 'PR green', lastActiveAt: '2026-11-25T11:00:00.000Z' }),
    rec({ sessionId: 'b', startedAt: '2026-11-20T09:00:00.000Z', stoppedAt: '2026-11-21T09:00:00.000Z', stopReason: 'mako-closed' }),
    rec({ sessionId: 'c', stoppedAt: '2026-11-25T10:00:00.000Z', stopReason: 'closed', archivedAt: '2026-11-25T10:00:00.000Z' }),
    rec({ sessionId: 'd', startedAt: '2026-11-22T12:00:00.000Z' }),
    rec({ sessionId: 'e', startedAt: '2026-11-22T12:00:01.000Z' }),
  ], { now });
  assert(rows.map((r) => r.sessionId).join() === 'b,d,e,a', 'archived sessions are left out; oldest activity first');
  const a = rows.find((r) => r.sessionId === 'a');
  assert(a.owner === 'composer' && a.ownerAssumed === false && a.doneWhen === 'PR green' && a.state === STATE.RUNNING
    && a.lastActivityAt === '2026-11-25T11:00:00.000Z' && a.idleDays === 0 && a.idle === false, 'a busy session: its owner, done-when, state and activity');
  const b = rows.find((r) => r.sessionId === 'b');
  assert(b.owner === 'blue' && b.ownerAssumed === true && b.doneWhen === null, 'a record from before S46 reads as Blue\'s, marked assumed, with no done-when');
  assert(b.state === STATE.WAITING && b.idleDays === 4 && b.idle === true, 'a session waiting 4 days is idle');
  const d = rows.find((r) => r.sessionId === 'd');
  assert(d.idleDays === 3 && d.idle === true, 'exactly 3 days silent counts as idle');
  const e = rows.find((r) => r.sessionId === 'e');
  assert(e.idleDays === 2 && e.idle === false, 'a second short of 3 days does not');
  assert(idleRows(rows).map((r) => r.sessionId).join() === 'b,d', 'idleRows keeps only the idle ones');
  assert(view(null).length === 0 && idleRows(null).length === 0, 'no records, no rows');
  assert(view([rec({ sessionId: 'x', startedAt: '2026-11-24T12:00:00.000Z' })], { now, idleDays: 1 })[0].idle === true, 'the threshold can be set');
  assert(IDLE_DAYS === 3, 'the default threshold is 3 days');
}

section('dayKey');
assert(dayKey(new Date(2026, 0, 5, 23, 59)) === '2026-01-05', 'the local calendar day, zero-padded');

process.stdout.write('\nsession-hygiene: ' + passed + ' passed, ' + failed + ' failed\n');
process.exit(failed ? 1 : 0);
