'use strict';
// Run: node app/renderer/pause-all.test.js
// S19: what Pause all does to the panes. Writes are counted at the boundary the app passes in
// (cc.ptyWrite); the real-renderer check is in shell-nav-app-integration.test.js.

const P = require('./pause-all');

let passed = 0, failed = 0;
function assert(condition, label) {
  if (condition) { process.stdout.write(`  ✓ ${label}\n`); passed += 1; }
  else { process.stderr.write(`  ✗ FAIL: ${label}\n`); failed += 1; }
}
const eq = (a, b, label) => assert(JSON.stringify(a) === JSON.stringify(b), `${label} (got ${JSON.stringify(a)})`);

function setup(opts) {
  const writes = [], logs = [], notes = [];
  let live = ['pty1', 'pty2', 'pty3', 'pty4', 'pty5', 'pty6'];
  const p = P.createPauseAll({
    write: (id, data) => { if (opts && opts.failOn === id) throw new Error('gone'); writes.push([id, data]); },
    livePanes: () => { if (opts && opts.listThrows) throw new Error('x'); return live; },
    log: (l) => logs.push(l), notify: (t) => notes.push(t),
  });
  return { p, writes, logs, notes, setLive: (l) => { live = l; } };
}

process.stdout.write('\npausing\n');
{
  const { p, writes, logs, notes } = setup();
  p.noteView({ paneId: 'pty1', state: 'working' });
  p.noteView({ paneId: 'pty2', state: 'attention' });
  p.noteView({ paneId: 'pty3', state: 'turn ended' });
  p.noteView({ paneId: 'pty4', state: 'idle' });
  p.noteView({ paneId: 'pty5', state: 'working' });
  p.noteView({ paneId: 'pty7', state: 'working' }); // no longer live
  // pty6 has no status at all (a shell pane)
  const r = p.setPaused('2026-11-26T08:30:00.000Z');
  eq(writes, [['pty1', '\u001b'], ['pty5', '\u001b']], 'only working panes get Esc, once each, and only live ones');
  eq(r.untouched, 3, 'waiting and idle panes are left as they are');
  eq(r.noStatus, ['pty6'], 'a pane with no Claude status is not interrupted, and is counted');
  assert(p.isPaused(), 'paused');
  assert(logs.some((l) => l.includes('Esc requested for 2 working pane(s)') && l.includes('delivery not confirmed') && l.includes('nothing killed')), 'the log says what was requested, that delivery isn\'t confirmed, and that nothing was killed');
  assert(logs.some((l) => l.includes('1 with no Claude status, not interrupted (pty6)')), 'and names the pane with no status');
  assert(notes.some((n) => n.includes('Esc requested for 2') && n.includes('1 pane(s) have no Claude status')), 'Blue sees both');
  p.setPaused('2026-11-26T08:30:00.000Z');
  eq(writes.length, 2, 'a repeated "on" sends nothing more');
  assert(p.refuseStart('Builder'), 'nothing new starts while paused');
  assert(logs.some((l) => l.includes('refused to start Builder')) && notes.some((n) => n.includes('Resume all')), 'the refusal is visible');
  const before = writes.length;
  const rr = p.setPaused(null);
  eq(writes.length, before, 'Resume all sends nothing');
  assert(rr.changed && !p.isPaused(), 'resumed');
  assert(!p.refuseStart('Builder'), 'new panes start again');
}

process.stdout.write('\na restored pause and failures\n');
{
  const { p, writes, logs } = setup();
  p.noteView({ paneId: 'pty1', state: 'working' });
  p.setPaused('2026-11-26T08:30:00.000Z', { restored: true });
  eq(writes, [], 'a pause restored at startup sends no Esc');
  assert(p.isPaused() && p.refuseStart(), 'but still refuses new panes');
  assert(logs.some((l) => l.includes('restored at startup')), 'and says so');
}
{
  const { p, writes, logs, notes } = setup({ failOn: 'pty1' });
  p.noteView({ paneId: 'pty1', state: 'working' });
  p.noteView({ paneId: 'pty2', state: 'working' });
  const r = p.setPaused('t');
  eq([r.escaped, r.failed], [['pty2'], ['pty1']], 'a failed write is reported, the others still get Esc');
  assert(logs.some((l) => l.includes('pty1') && l.includes('write-failed')), 'the failure is logged');
  assert(notes.some((n) => n.includes('1 could not be interrupted')), 'and Blue is told');
  eq(writes, [['pty2', '\u001b']], 'nothing else was written');
}
{
  const { p, writes, notes } = setup({ listThrows: true });
  p.noteView({ paneId: 'pty1', state: 'working' });
  p.setPaused('t');
  eq(writes, [], 'no pane list: no Esc');
  assert(notes.some((n) => n.includes('could not list the panes')), 'and Blue is told none were interrupted');
  assert(p.isPaused(), 'the pause itself still holds');
}

process.stdout.write('\nClaude status off\n');
{
  const { p, writes, notes } = setup();
  p.noteView({ paneId: 'pty1', state: 'unknown' });
  const r = p.setPaused('t');
  eq(writes, [], 'with no trusted status anywhere, nothing is interrupted');
  eq(r.noStatus.length, 6, 'and every live pane is counted as having no status');
  assert(notes.some((n) => n.includes('6 pane(s) have no Claude status')), 'so Blue knows why none were interrupted');
}

process.stdout.write('\nstatus tracking\n');
{
  const { p, writes } = setup();
  p.noteView({ paneId: 'pty1', state: 'working' });
  p.noteView({ paneId: 'pty1', state: 'attention' });
  eq(p.stateOf('pty1'), 'attention', 'the latest status wins');
  p.noteView({ paneId: 'pty2', state: 'working' });
  p.forget('pty2');
  eq(p.stateOf('pty2'), null, 'a closed pane is forgotten');
  assert(!p.noteView(null) && !p.noteView({ paneId: 3 }), 'a malformed view is ignored');
  p.noteView({ paneId: 'pty3', state: 42 });
  eq(p.stateOf('pty3'), 'unknown', 'a bad state word counts as unknown');
  p.setPaused('t');
  eq(writes, [], 'none of them was working, so nothing was sent');
}
{
  let threw = 0;
  try { P.createPauseAll({ livePanes: () => [] }); } catch { threw += 1; }
  try { P.createPauseAll({ write: () => {} }); } catch { threw += 1; }
  eq(threw, 2, 'a missing write or pane list is refused');
}

process.stdout.write(`\npause-all: ${passed} passed, ${failed} failed\n`);
if (failed) process.exit(1);
