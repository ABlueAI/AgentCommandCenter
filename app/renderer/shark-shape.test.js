'use strict';
// Run: node app/renderer/shark-shape.test.js
// S18: the shark's shape file (good, bad and missing file, fallback to the last good shape) and
// its clock (the four states, 30 fps by default, pause, hidden means stopped, reduced motion).

const fs = require('fs');
const path = require('path');
const S = require('./shark-shape');

let passed = 0, failed = 0;
function assert(condition, label) {
  if (condition) { process.stdout.write(`  ✓ ${label}\n`); passed += 1; }
  else { process.stderr.write(`  ✗ FAIL: ${label}\n`); failed += 1; }
}
const eq = (a, b, label) => assert(JSON.stringify(a) === JSON.stringify(b), `${label} (got ${JSON.stringify(a)})`);

const TEXT = fs.readFileSync(path.join(__dirname, '..', 'assets', 'shark', 'shark-shape-B3.json'), 'utf8');
const good = () => JSON.parse(TEXT);
const withShape = (fn) => { const d = good(); fn(d.shape, d); return JSON.stringify(d); };

process.stdout.write('\nthe shipped B3 shape file\n');
{
  const r = S.parseShape(TEXT);
  assert(r.ok === true, 'shark-shape-B3.json is a valid mako-shark-shape/1 file');
  eq(r.shape && [r.shape.id, r.shape.name], ['B3', 'Heavy'], 'it is B3, Heavy');
  assert(Object.isFrozen(r.shape) && Object.isFrozen(r.shape.body.s), 'the loaded shape cannot be changed by the renderer');
}

process.stdout.write('\nbad files are refused with a reason\n');
{
  eq(S.parseShape('{nope').reason, 'not-json', 'not JSON');
  eq(S.parseShape(' '.repeat(S.MAX_BYTES + 1)).reason, 'too-large', 'over 64 KB');
  eq(S.parseShape(withShape((_s, d) => { d.format = 'mako-shark-shape/2'; })).reason, 'wrong-format', 'another format');
  eq(S.parseShape(withShape((s) => { s.body.top.pop(); })).reason, 'body-lengths', 'body arrays of different lengths');
  eq(S.parseShape(withShape((s) => { s.body.s[3] = s.body.s[2]; })).reason, 'body-s-order', 'body positions not increasing');
  eq(S.parseShape(withShape((s) => { s.body.top[2] = 'x'; })).reason, 'body-depth', 'a non-number depth');
  eq(S.parseShape(withShape((s) => { s.body.wr[1] = -1; })).reason, 'body-width', 'a negative width ratio');
  eq(S.parseShape(withShape((s) => { s.fins.dorsalLead = [[0.4, 0.1]]; })).reason, 'fin-edge', 'a fin edge with one point');
  eq(S.parseShape(withShape((s) => { s.fins.upperLead[0] = [0.4, 9]; })).reason, 'fin-point', 'a fin point off the scale');
  eq(S.parseShape(withShape((s) => { delete s.fins.analTrail; })).reason, 'fin-edge', 'a missing fin');
  eq(S.parseShape(withShape((s) => { s.pectoral.s1 = s.pectoral.s0; })).reason, 'pectoral', 'a pectoral with no length along the body');
  eq(S.parseShape(withShape((s) => { s.id = '<b>'; })).reason, 'bad-id', 'an id that isn\'t a short plain name');
  eq(S.parseShape('[]').reason, 'not-an-object', 'an array');
}

process.stdout.write('\nloader: a bad or missing file falls back to the last good shape, logged\n');
(async () => {
  const logs = [];
  const L = S.createShapeLoader({ log: (l) => logs.push(l) });
  const missingFirst = await L.load(() => Promise.reject(new Error('ENOENT')));
  eq([missingFirst.ok, missingFirst.reason, missingFirst.shape, missingFirst.fellBack], [false, 'missing', null, false], 'missing with no good shape yet: refused, nothing to draw');
  const ok = await L.load(() => Promise.resolve(TEXT));
  eq([ok.ok, ok.shape.id], [true, 'B3'], 'a good file loads');
  const bad = await L.load(() => Promise.resolve('{"format":"x"}'));
  eq([bad.ok, bad.reason, bad.shape && bad.shape.id, bad.fellBack], [false, 'wrong-format', 'B3', true], 'a bad file: refused, the last good shape stays');
  const missing = await L.load(() => Promise.reject(new Error('ENOENT')));
  eq([missing.ok, missing.reason, missing.fellBack], [false, 'missing', true], 'a missing file: refused, the last good shape stays');
  assert(logs.length === 3 && logs.every((l) => /^\[shark\] REFUSED: shape file /.test(l)), 'each refusal is logged, never silent');
  assert(!logs.some((l) => l.includes('"format":"x"')), 'the log never echoes the file');

  process.stdout.write('\nclock: four states, 30 fps, pause, hidden, reduced motion\n');
  let t = 0;
  let queued = [];
  let nextId = 1;
  const env = { hidden: false, reduced: false };
  const drawn = [];
  const clockLogs = [];
  const C = S.createSharkClock({
    draw: (f) => drawn.push(f), now: () => t,
    requestFrame: (cb) => { const id = nextId++; queued.push({ id, cb }); return id; },
    cancelFrame: (id) => { queued = queued.filter((q) => q.id !== id); },
    isHidden: () => env.hidden, prefersReducedMotion: () => env.reduced, log: (l) => clockLogs.push(l),
  });
  // A 60 Hz display for one second.
  const runFor = (ms) => { const end = t + ms; while (t < end) { t += 1000 / 60; const q = queued; queued = []; for (const f of q) f.cb(); } };
  C.start();
  runFor(1000);
  assert(drawn.length >= 29 && drawn.length <= 31, `30 fps by default on a 60 Hz display (drew ${drawn.length} frames in 1 s)`);
  eq(C.state().state, 'idle', 'starts idle');
  for (const s of S.STATES) eq(C.setState(s), true, `state ${s} is accepted`);
  eq(C.setState('scary'), false, 'any other state is refused');
  eq(C.state().state, 'speaking', 'and the shark keeps its state');
  C.setVoiceLevel(0.7);
  eq(C.state().voice, 0.7, 'the voice level follows speech while speaking');
  C.setState('thinking');
  eq(C.state().voice, 0, 'and drops to 0 when it stops speaking');
  C.setVoiceLevel(1);
  eq(C.state().voice, 0, 'a voice level outside speaking is ignored');
  // State-transition timing: the next frame drawn after setState carries the new state, at once.
  C.setState('listening');
  runFor(40);
  eq(drawn[drawn.length - 1].state, 'listening', 'the next frame after a state change shows the new state (within one frame)');
  assert(drawn[drawn.length - 1].stateFor <= 40, 'and says how long it has been in it');

  eq(C.setFrameRate('60'), true, '60 fps is a setting');
  let before = drawn.length; runFor(1000);
  assert(drawn.length - before >= 58, `60 fps draws about every frame (${drawn.length - before})`);
  eq(C.setFrameRate('7'), false, 'an unknown frame rate is refused');
  C.setFrameRate('30');

  C.pause();
  before = drawn.length; runFor(500);
  eq(drawn.length - before, 0, 'paused: nothing is drawn');
  eq(C.state().running, false, 'and no frame is waiting');
  C.resume();
  before = drawn.length; runFor(500);
  assert(drawn.length - before >= 14, 'resumed: drawing again');

  env.hidden = true; C.visibilityChanged();
  before = drawn.length; runFor(500);
  eq(drawn.length - before, 0, 'hidden: nothing is drawn');
  eq(C.state().running, false, 'hidden: the clock is stopped');
  env.hidden = false; C.visibilityChanged();
  runFor(100);

  env.reduced = true;
  before = drawn.length; runFor(500);
  eq(drawn.length - before, 1, 'reduced motion: one still frame, then the clock stops');
  eq(drawn[drawn.length - 1].motion, false, 'drawn without motion (it holds still and keeps its glow)');
  C.setState('speaking');
  runFor(100);
  eq(drawn.length - before, 2, 'reduced motion: a state change draws one new still frame');
  assert(clockLogs.length === 2, 'refused states and frame rates are logged');

  process.stdout.write('\ngeometry and swim (pure math)\n');
  {
    const shape = S.parseShape(TEXT).shape;
    const m = S.bodyMesh(shape, 48, 24);
    eq([m.positions.length, m.sAt.length, m.indices.length], [48 * 24 * 3, 48 * 24, 47 * 24 * 6], 'body mesh: rings x sides vertices, two triangles per quad');
    assert(m.positions.every(Number.isFinite), 'every body coordinate is a finite number');
    assert(m.indices.every((i) => i >= 0 && i < 48 * 24), 'every index points at a vertex');
    const xs = m.positions.filter((_, i) => i % 3 === 0);
    assert(Math.abs(Math.min(...xs) + S.LB / 2) < 1e-9 && Math.abs(Math.max(...xs) - S.LB / 2) < 1e-9, 'the body runs from the snout to the caudal-fin base, LB = 3.2 units');
    const fins = S.finMeshes(shape);
    eq(fins.map((f) => f.name), ['dorsal', 'upper', 'lower', 'pelvic', 'd2', 'anal', 'pectoralRight', 'pectoralLeft'], 'every fin, both pectorals');
    assert(fins.every((f) => f.positions.every(Number.isFinite) && f.indices.length >= 3), 'every fin is a finite, non-empty mesh');
    const upper = fins.find((f) => f.name === 'upper');
    const tipX = Math.max(...upper.positions.filter((_, i) => i % 3 === 0));
    assert(Math.abs(tipX - (1.21 - 0.5) * S.LB) < 0.05, 'the upper tail lobe reaches s 1.21');
    const pr = fins.find((f) => f.name === 'pectoralRight'), pl = fins.find((f) => f.name === 'pectoralLeft');
    assert(pr.positions[8] > 0 && pl.positions[8] < 0, 'the pectorals are mirrored across the body');
    eq(S.swimOffset(0.2, 1.3, 1, 1), 0, 'the front is stiff: no sway ahead of s 0.32');
    eq(S.swimOffset(1.0, 1.3, 0, 1), 0, 'speed 0 (reduced motion): it holds still');
    const tailMax = Math.max(...Array.from({ length: 100 }, (_, i) => Math.abs(S.swimOffset(1.0, i / 45, 1, 1))));
    const midMax = Math.max(...Array.from({ length: 100 }, (_, i) => Math.abs(S.swimOffset(0.6, i / 45, 1, 1))));
    assert(tailMax > midMax && midMax > 0, 'the sway grows towards the tail');
    const period = 1 / S.SWIM_HZ;
    assert(Math.abs(S.swimOffset(1.0, 0.3, 1, 1) - S.swimOffset(1.0, 0.3 + period, 1, 1)) < 1e-9, 'one tail beat every 1 / 0.45 s at speed 1.0');
  }

  let threw = '';
  try { S.createSharkClock({}); } catch (e) { threw = e.message; }
  eq(threw, 'shark-clock: deps-missing', 'no renderer hooks: refuses to start');

  process.stdout.write(`\nshark-shape: ${passed} passed, ${failed} failed\n`);
  if (failed) process.exit(1);
})();
