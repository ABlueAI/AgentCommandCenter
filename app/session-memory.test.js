'use strict';
// Run: node app/session-memory.test.js
//
// S08: the session-memory store. Every case uses a disposable temp directory as userData.

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const {
  createSessionMemoryStore, isSessionId, FILENAME, MAX_RECORDS, STOP_REASON, REASON,
} = require('./session-memory');

let passed = 0, failed = 0;
function assert(cond, label) {
  if (cond) { process.stdout.write('  ✓ ' + label + '\n'); passed++; }
  else { process.stderr.write('  x FAIL: ' + label + '\n'); failed++; }
}
function section(t) { process.stdout.write('\n' + t + '\n'); }

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'mako-session-memory-'));
let n = 0;
function freshDir() { const d = path.join(ROOT, 'u' + (++n)); fs.mkdirSync(d); return d; }
function clock(start) {
  let t = Date.parse(start);
  return () => new Date((t += 1000));
}
const id = () => crypto.randomUUID();

section('isSessionId');
assert(isSessionId(id()), 'a crypto.randomUUID value passes');
for (const bad of ['', 'abc', '11111111-1111-1111-1111-11111111111', '11111111-1111-1111-1111-111111111111 --x',
  'G1111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111\n', null, 42, {}]) {
  assert(!isSessionId(bad), 'refuses ' + JSON.stringify(bad));
}

section('start, stop, and the record survives a restart');
{
  const dir = freshDir();
  const s1 = createSessionMemoryStore({ userDataDir: dir, now: clock('2026-10-24T10:00:00Z') });
  const sid = id();
  const r = s1.recordStart({ sessionId: sid, paneId: 'p1', role: 'builder', cli: 'claude', worktree: 'D:\\Workspace\\repo-wt' });
  assert(r.ok, 'recordStart succeeds');
  assert(fs.existsSync(path.join(dir, FILENAME)), 'the file is ' + FILENAME + ' in userData');
  // A second store on the same folder is what Mako sees after a restart.
  const s2 = createSessionMemoryStore({ userDataDir: dir, now: clock('2026-10-24T11:00:00Z') });
  let rec = s2.list().records[0];
  assert(rec.sessionId === sid && rec.paneId === 'p1' && rec.role === 'builder' && rec.cli === 'claude'
    && rec.worktree === 'D:\\Workspace\\repo-wt' && rec.startedAt === '2026-10-24T10:00:01.000Z'
    && rec.stoppedAt === null && rec.stopReason === null, 'a new store reads the same open record back');
  assert(s2.recordStop(sid, STOP_REASON.CLOSED).ok, 'recordStop succeeds');
  rec = createSessionMemoryStore({ userDataDir: dir }).list().records[0];
  assert(rec.stoppedAt === '2026-10-24T11:00:01.000Z' && rec.stopReason === 'closed', 'the stop survives too');
  const again = s2.recordStop(sid, STOP_REASON.EXITED);
  rec = s2.list().records[0];
  assert(again.ok && rec.stopReason === 'closed' && rec.stoppedAt === '2026-10-24T11:00:01.000Z',
    'a later exit keeps the first stop (closed), unchanged');
  assert(s2.recordStop(id(), STOP_REASON.EXITED).ok && s2.list().records.length === 1,
    'stopping an unknown session changes nothing');
}

section('closeOpen: shutdown and the next start');
{
  const dir = freshDir();
  const s = createSessionMemoryStore({ userDataDir: dir, now: clock('2026-10-24T10:00:00Z') });
  const a = id(), b = id(), c = id();
  s.recordStart({ sessionId: a, paneId: 1, role: null, cli: 'claude', worktree: 'C:\\x' });
  s.recordStart({ sessionId: b, paneId: 'p2', role: 'reviewer', cli: 'claude', worktree: 'C:\\y' });
  s.recordStop(a, STOP_REASON.EXITED);
  const shut = s.closeOpen(STOP_REASON.MAKO_CLOSED);
  assert(shut.ok && shut.closed === 1, 'shutdown closes only the open record');
  let recs = s.list().records;
  assert(recs.find((r) => r.sessionId === a).stopReason === 'exited'
    && recs.find((r) => r.sessionId === b).stopReason === 'mako-closed', 'with mako-closed; the stopped one keeps exited');
  assert(recs.find((r) => r.sessionId === a).paneId === '1', 'a numeric pane id is stored as a string');
  s.recordStart({ sessionId: c, paneId: 'p3', role: 'builder', cli: 'claude', worktree: 'C:\\z' });
  const boot = createSessionMemoryStore({ userDataDir: dir }).closeOpen(STOP_REASON.UNKNOWN);
  recs = s.list().records;
  assert(boot.ok && boot.closed === 1 && recs.find((r) => r.sessionId === c).stopReason === 'unknown',
    'at the next start a record never closed (crash) becomes unknown');
  const before = fs.statSync(path.join(dir, FILENAME)).mtimeMs;
  const none = s.closeOpen(STOP_REASON.UNKNOWN);
  assert(none.ok && none.closed === 0 && fs.statSync(path.join(dir, FILENAME)).mtimeMs === before,
    'with nothing open, nothing is written');
  assert(createSessionMemoryStore({ userDataDir: freshDir() }).closeOpen(STOP_REASON.UNKNOWN).ok,
    'a first run with no file is fine');
}

section('refusals');
{
  const dir = freshDir();
  const s = createSessionMemoryStore({ userDataDir: dir });
  assert(s.recordStart({ sessionId: 'not-a-uuid', paneId: 'p' }).reason === REASON.BAD_SESSION_ID, 'a bad session ID is refused');
  assert(!fs.existsSync(path.join(dir, FILENAME)), 'and nothing is written');
  const sid = id();
  s.recordStart({ sessionId: sid, paneId: 'p' });
  assert(s.recordStart({ sessionId: sid, paneId: 'q' }).reason === REASON.DUPLICATE_SESSION_ID, 'a duplicate session ID is refused');
  assert(s.recordStop(sid, 'gone').reason === REASON.BAD_STOP_REASON, 'an unknown stop reason is refused');
  assert(s.closeOpen('gone').reason === REASON.BAD_STOP_REASON, 'also for closeOpen');
  const r = s.recordStart({ sessionId: id(), paneId: 'x'.repeat(65), role: 5, cli: '', worktree: 'w'.repeat(1025) });
  const rec = s.list().records[1];
  assert(r.ok && rec.paneId === null && rec.role === null && rec.cli === null && rec.worktree === null,
    'out-of-bounds renderer or path values are stored as null, not truncated');
}

section('malformed data is preserved and refused, never repaired');
for (const [label, text] of [
  ['not JSON', '{oops'],
  ['wrong version', JSON.stringify({ version: 2, records: [] })],
  ['records not an array', JSON.stringify({ version: 1, records: {} })],
  ['a bad record', JSON.stringify({ version: 1, records: [{ sessionId: 'x' }] })],
  ['an open record with a stop reason', JSON.stringify({ version: 1, records: [{ sessionId: id(), paneId: null, role: null, cli: null, worktree: null, startedAt: '2026-10-24T10:00:00Z', stoppedAt: null, stopReason: 'exited' }] })],
]) {
  const dir = freshDir();
  fs.writeFileSync(path.join(dir, FILENAME), text);
  const s = createSessionMemoryStore({ userDataDir: dir });
  assert(s.list().reason === REASON.INVALID, label + ': list refuses');
  assert(s.recordStart({ sessionId: id(), paneId: 'p' }).reason === REASON.INVALID, label + ': recordStart refuses');
  assert(s.closeOpen(STOP_REASON.UNKNOWN).reason === REASON.INVALID, label + ': closeOpen refuses');
  assert(fs.readFileSync(path.join(dir, FILENAME), 'utf8') === text, label + ': the file is left exactly as it was');
}
{
  const dir = freshDir();
  const sid = id();
  const dup = { sessionId: sid, paneId: null, role: null, cli: null, worktree: null, startedAt: '2026-10-24T10:00:00Z', stoppedAt: null, stopReason: null };
  fs.writeFileSync(path.join(dir, FILENAME), JSON.stringify({ version: 1, records: [dup, dup] }));
  assert(createSessionMemoryStore({ userDataDir: dir }).list().reason === REASON.INVALID, 'duplicate session IDs in the file are refused');
}
{
  const dir = freshDir();
  fs.mkdirSync(path.join(dir, FILENAME));
  assert(createSessionMemoryStore({ userDataDir: dir }).list().reason === REASON.NOT_REGULAR_FILE, 'a folder in its place is refused');
}
{
  const dir = freshDir();
  const target = path.join(dir, 'elsewhere.json');
  fs.writeFileSync(target, JSON.stringify({ version: 1, records: [] }));
  let linked = true;
  try { fs.symlinkSync(target, path.join(dir, FILENAME), 'file'); } catch { linked = false; }
  if (linked) {
    assert(createSessionMemoryStore({ userDataDir: dir }).list().reason === REASON.REPARSE_POINT, 'a symlink is refused');
  } else {
    process.stdout.write('  - symlink case skipped: this account cannot create symlinks (Windows without Developer Mode)\n');
  }
}

section('the newest records are kept, up to ' + MAX_RECORDS);
{
  const dir = freshDir();
  const s = createSessionMemoryStore({ userDataDir: dir });
  const ids = [];
  for (let i = 0; i < MAX_RECORDS + 5; i++) { const sid = id(); ids.push(sid); s.recordStart({ sessionId: sid, paneId: 'p' + i }); }
  const recs = s.list().records;
  assert(recs.length === MAX_RECORDS, 'the file holds at most ' + MAX_RECORDS + ' records');
  assert(recs[0].sessionId === ids[5] && recs[recs.length - 1].sessionId === ids[ids.length - 1], 'the oldest five dropped off');
}

section('a failed write is refused and leaves the previous file');
{
  const dir = freshDir();
  const s = createSessionMemoryStore({ userDataDir: dir });
  s.recordStart({ sessionId: id(), paneId: 'p' });
  const before = fs.readFileSync(path.join(dir, FILENAME), 'utf8');
  const failing = Object.assign({}, fs, { renameSync() { throw new Error('disk full'); } });
  const sf = createSessionMemoryStore({ userDataDir: dir, fsImpl: failing });
  assert(sf.recordStart({ sessionId: id(), paneId: 'q' }).reason === REASON.WRITE_FAILED, 'recordStart reports write-failed');
  assert(fs.readFileSync(path.join(dir, FILENAME), 'utf8') === before, 'the previous file is unchanged');
  assert(fs.readdirSync(dir).length === 1, 'and no temp file is left behind');
}

section('construction');
{
  let threw = false;
  try { createSessionMemoryStore({}); } catch { threw = true; }
  assert(threw, 'userDataDir is required');
}

section('S09: resumeOffer offers the newest batch of panes open when Mako went away');
{
  const dir = freshDir();
  const s = createSessionMemoryStore({ userDataDir: dir, now: clock('2026-10-27T09:00:00Z') });
  const old1 = id(), a = id(), b = id(), closed = id(), codex = id();
  s.recordStart({ sessionId: old1, paneId: 'p1', role: 'builder', cli: 'claude', worktree: 'D:\\w\\one' });
  s.closeOpen(STOP_REASON.MAKO_CLOSED);                        // run 1 ends with old1 open
  s.recordStart({ sessionId: a, paneId: 'p1', role: 'builder', cli: 'claude', worktree: 'D:\\w\\one' });
  s.recordStart({ sessionId: b, paneId: 'p2', role: null, cli: 'claude', worktree: 'D:\\w\\two' });
  s.recordStart({ sessionId: closed, paneId: 'p3', role: 'reviewer', cli: 'claude', worktree: 'D:\\w\\one' });
  s.recordStart({ sessionId: codex, paneId: 'p4', role: null, cli: 'codex', worktree: 'D:\\w\\one' });
  s.recordStop(closed, STOP_REASON.CLOSED);
  s.closeOpen(STOP_REASON.UNKNOWN);                            // run 2 crashed with a, b and codex open
  const offer = s.resumeOffer();
  const ids = offer.ok ? offer.records.map((r) => r.sessionId).sort() : [];
  assert(offer.ok && ids.join() === [a, b].sort().join(), 'only the newest batch\'s Claude panes are offered (not old1, the closed pane, or codex)');
  const rec = (sid) => s.list().records.find((r) => r.sessionId === sid);
  assert(rec(old1).offered === true, 'the older run\'s record is marked offered, so it never comes back');
  assert(rec(a).offered === undefined && rec(closed).offered === undefined, 'the offered batch and other records are left as they were');
  assert(s.resumeOffer().records.length === 2, 'asking again offers the same batch (nothing is answered yet)');

  assert(s.markOffered(b).ok && rec(b).offered === true, 'markOffered (Start fresh) marks one record');
  assert(s.resumeOffer().records.map((r) => r.sessionId).join() === a, 'and it is no longer offered');
  assert(s.markOffered(id()).ok, 'markOffered on an unknown session changes nothing');
  assert(!s.markOffered('nope').ok && s.markOffered('nope').reason === REASON.BAD_SESSION_ID, 'markOffered refuses a non-UUID');

  const r = s.recordResume({ sessionId: a, paneId: 'pty9' });
  assert(r.ok && rec(a).stoppedAt === null && rec(a).stopReason === null && rec(a).paneId === 'pty9'
    && !('offered' in rec(a)) && rec(a).startedAt === '2026-10-27T09:00:03.000Z',
  'recordResume opens the same record again in the new pane, keeping its start time');
  const again = s.recordResume({ sessionId: a, paneId: 'pty10' });
  assert(!again.ok && again.reason === REASON.NOT_RESUMABLE, 'an open record can\'t be resumed twice');
  for (const [label, sid] of [['offered', b], ['closed by Blue', closed], ['unknown', id()]]) {
    const x = s.recordResume({ sessionId: sid, paneId: 'p' });
    assert(!x.ok && x.reason === REASON.NOT_RESUMABLE, 'recordResume refuses a record that is ' + label);
  }
  assert(s.resumeOffer().records.length === 0, 'with a resumed and b answered, nothing is offered');
  s.closeOpen(STOP_REASON.MAKO_CLOSED);                        // run 3 closes with the resumed pane open
  const next = s.resumeOffer();
  assert(next.ok && next.records.map((x) => x.sessionId).join() === a, 'the resumed pane is offered again after the next close');
}

section('S09: `offered` keeps S08 files valid and refuses a bad value');
{
  const dir = freshDir();
  const base = { sessionId: id(), paneId: 'p1', role: null, cli: 'claude', worktree: 'D:\\w',
    startedAt: '2026-10-27T09:00:00.000Z', stoppedAt: '2026-10-27T10:00:00.000Z', stopReason: 'mako-closed' };
  fs.writeFileSync(path.join(dir, FILENAME), JSON.stringify({ version: 1, records: [base] }));
  const s = createSessionMemoryStore({ userDataDir: dir });
  assert(s.list().ok && s.resumeOffer().records.length === 1, 'an S08 file (no `offered`) reads and is offered');
  fs.writeFileSync(path.join(dir, FILENAME), JSON.stringify({ version: 1, records: [Object.assign({}, base, { offered: 'yes' })] }));
  const bad = s.resumeOffer();
  assert(!bad.ok && bad.reason === REASON.INVALID, 'a non-boolean `offered` makes the file invalid, and resumeOffer refuses');
  assert(JSON.parse(fs.readFileSync(path.join(dir, FILENAME), 'utf8')).records[0].offered === 'yes', 'and the file is left exactly as it was');
}

try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { /* best effort */ }
process.stdout.write('\nsession-memory: ' + passed + ' passed, ' + failed + ' failed\n');
process.exit(failed ? 1 : 0);
