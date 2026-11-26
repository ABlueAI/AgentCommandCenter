'use strict';
// Run: node app/renderer/aquarium.test.js
//
// S20: the pure parts of the aquarium (aquarium.js) and of the engine forked from Pixel Agents
// 1.6.0 (aquarium-engine.js): species from role, state to colour and word, the fish sprites, the
// urgency bands, the forked sprite outline, game loop (capped step, pause, resume, a failed frame
// reported once) and blink clock. The DOM and canvas parts run in a real Electron renderer
// (aquarium-app-integration.test.js).

const A = require('./aquarium.js');
const E = require('./aquarium-engine.js');
const T = require('./ui-tokens.js');

let passed = 0, failed = 0;
function assert(cond, label) {
  if (cond) { process.stdout.write(`  ✓ ${label}\n`); passed++; }
  else { process.stderr.write(`  ✗ FAIL: ${label}\n`); failed++; }
}
const eq = (a, b, label) => assert(JSON.stringify(a) === JSON.stringify(b), `${label} (got ${JSON.stringify(a)})`);
function throwsKind(fn, kind, label) {
  try { fn(); assert(false, `${label} (did not throw)`); }
  catch (e) { assert(e && e.kind === kind, `${label} (kind ${e && e.kind})`); }
}

process.stdout.write('\nspecies show the role (brief 6, question 11)\n');
eq(A.SPECIES_IDS, ['builder', 'reviewer', 'scout'], 'three species: builder, reviewer, scout');
eq(A.speciesForRole('builder'), 'builder', 'builder role -> builder');
eq(A.speciesForRole('reviewer'), 'reviewer', 'reviewer role -> reviewer');
for (const r of ['codebase-scout', 'web-scout', 'source-scout', 'video-scout', 'page-reader']) eq(A.speciesForRole(r), 'scout', `${r} -> scout`);
eq(A.speciesForRole(null), 'builder', 'a pane with no role is a builder');
eq(A.speciesForRole('made-up'), 'builder', 'an unknown role is a builder');
eq(A.speciesForRole({}), 'builder', 'a non-string role is a builder');

process.stdout.write('\nstate -> colour token and word (brief 3.1, 3.2)\n');
eq(A.stateStyle('attention').token, 'status-needs', 'needs you is red');
eq(A.stateStyle('attention').word, 'Needs you', 'needs you has its word');
eq(A.stateStyle('failed').token, 'status-needs', 'failed is red too');
eq(A.stateStyle('working').token, 'status-working', 'working is blue');
eq(A.stateStyle('turn ended').token, 'status-ended', 'turn ended is green');
eq(A.stateStyle('idle').token, 'status-idle', 'idle is grey');
eq(A.stateStyle('exited').token, 'status-idle', 'exited is grey');
eq(A.normalizeState('nonsense'), 'unknown', 'an unknown state word is unknown');
eq(A.normalizeState('__proto__'), 'unknown', 'a prototype key is not a state');
eq(A.stateStyle(undefined).word, 'Status unknown', 'no state says so in words');
for (const [state, style] of Object.entries(A.STATE_STYLE)) {
  assert(typeof T.SHARED_TOKENS[style.token] === 'string', `${state}'s token ${style.token} exists in ui-tokens.js`);
  assert(style.word.length > 0, `${state} has a word (never colour alone)`);
}

process.stdout.write('\ncolours\n');
eq(A.mix('#000000', '#ffffff', 0.5), '#808080', 'mix halfway');
eq(A.mix('#6fa8ff', '#6fa8ff', 0.3), '#6fa8ff', 'mix with itself is itself');
throwsKind(() => A.mix('red', '#000000', 0.5), 'bad-colour', 'a non-hex colour is refused');

process.stdout.write('\nthe fish\n');
for (const sp of A.SPECIES_IDS) {
  const f = A.FISH[sp];
  const w = f.rows[0].length;
  assert(f.rows.every((r) => r.length === w), `${sp}: every row is ${w} pixels wide`);
  assert(f.rows.every((r) => /^[.OBDFEP]+$/.test(r)), `${sp}: only known pixel letters`);
  eq(f.rows[f.body[1]][f.body[0]], 'B', `${sp}: its body sample pixel is body colour`);
  const s = A.fishSprite(sp, '#6fa8ff');
  eq(s[f.body[1]][f.body[0]], '#6fa8ff', `${sp}: the sprite's body pixel is the state colour`);
  assert(s.every((row) => row.every((c) => c === '' || /^#[0-9a-f]{6}$/i.test(c))), `${sp}: every pixel is transparent or a hex colour`);
  const flipped = A.fishSprite(sp, '#6fa8ff', { facingRight: true });
  eq(flipped[f.body[1]][w - 1 - f.body[0]], '#6fa8ff', `${sp}: facing right flips it`);
  const shut = A.fishSprite(sp, '#6fa8ff', { eyesShut: true });
  assert(!shut.some((row) => row.includes('#eaf5f3')), `${sp}: a blink closes the eye`);
  assert(s.some((row) => row.includes('#eaf5f3')), `${sp}: the open fish has an eye`);
}
const sizes = A.SPECIES_IDS.map((sp) => A.fishSize(sp));
assert(new Set(sizes.map((z) => `${z.w}x${z.h}`)).size === 3, 'the three species have three different shapes');
const bubble = A.bubbleSprite('#f2606b');
assert(bubble.some((row) => row.includes('#f2606b')), 'the needs-you bubble is drawn in the needs-you red');
assert(bubble.every((row) => row.length === bubble[0].length), 'the bubble is rectangular');

process.stdout.write('\nhigher = more urgent (brief question 2)\n');
const H = 90, FH = 9;
const yNeeds = A.targetY('attention', 0, 1, H, FH);
const yWork = A.targetY('working', 0, 1, H, FH);
const yIdle = A.targetY('idle', 0, 1, H, FH);
assert(yNeeds < yWork && yWork < yIdle, `needs you above working above idle (${yNeeds} < ${yWork} < ${yIdle})`);
assert(A.targetY('failed', 0, 1, H, FH) < yWork, 'failed sits with needs you, above working');
const ys = [0, 1, 2].map((i) => A.targetY('working', i, 3, H, FH));
assert(ys[0] < ys[1] && ys[1] < ys[2], 'fish in one band spread out');
assert([yNeeds, yWork, yIdle, ...ys].every((y) => y >= 1 && y <= H - FH - 4), 'every fish stays inside the tank, above the sand');
eq(A.speedFactor('attention'), 0, 'a needs-you fish stops and waits');
assert(A.speedFactor('working') > A.speedFactor('idle'), 'working fish swim faster than idle ones');
eq(A.zoomFor(1200), 6, 'a wide tank draws at 6x');
eq(A.zoomFor(745), 5, 'a middling tank draws at 5x');
eq(A.zoomFor(600), 4, 'a narrow tank draws at 4x');

process.stdout.write('\nengine (forked from Pixel Agents 1.6.0)\n');
const spr = [['', '#111111'], ['#222222', '']];
const out = E.getOutlineSprite(spr, '#9fe6ff');
eq([out.length, out[0].length], [4, 4], 'the outline is 2 px larger each way');
eq(out[1][2], '', 'the outline leaves the sprite\'s own pixels empty');
eq(out[0][2], '#9fe6ff', 'the outline marks the pixel above an opaque one');
assert(E.getOutlineSprite(spr, '#9fe6ff') === out, 'the outline is cached per sprite and colour');
assert(E.getOutlineSprite(spr, '#ffffff') !== out, 'another colour gets its own outline');

// A fake canvas that records draws.
function fakeCtx() { return { imageSmoothingEnabled: true, rects: 0, fillRect() { this.rects++; } }; }
const fakeDoc = { created: 0, createElement() { this.created++; const ctx = fakeCtx(); return { width: 0, height: 0, getContext: () => ctx, ctx }; } };
const c1 = E.getCachedSprite(fakeDoc, spr, 3);
eq([c1.width, c1.height], [6, 6], 'a cached sprite is drawn at the zoom');
eq(c1.ctx.rects, 2, 'only opaque pixels are drawn');
assert(E.getCachedSprite(fakeDoc, spr, 3) === c1 && fakeDoc.created === 1, 'the same sprite at the same zoom is drawn once');
throwsKind(() => E.getCachedSprite({ createElement: () => ({ getContext: () => null }) }, [['#000000']], 9), 'no-2d-context', 'no 2D context is refused');

// The game loop with hand-driven frames.
const queue = [];
const frames = { request: (cb) => { queue.push(cb); return queue.length; }, cancel: () => { queue.length = 0; } };
const dts = [];
let renders = 0;
const canvas = { getContext: () => fakeCtx() };
const loop = E.startGameLoop(canvas, { update: (dt) => dts.push(dt), render: () => { renders++; } }, frames);
const tick = (time) => { const cb = queue.shift(); if (cb) cb(time); };
tick(1000); tick(1016); tick(5000);
eq(dts[0], 0, 'the first frame advances nothing');
assert(Math.abs(dts[1] - 0.016) < 1e-9, 'a normal frame advances by its time');
eq(dts[2], E.MAX_DELTA_TIME_SEC, 'a long gap is capped');
eq(loop.state().frames, 3, 'three frames drawn');
loop.pause();
eq(queue.length, 0, 'pause cancels the next frame');
tick(6000);
eq(renders, 3, 'nothing draws while paused');
loop.resume();
tick(9000);
eq(dts[3], 0, 'the first frame after a resume advances nothing');
loop.redraw();
eq(renders, 5, 'redraw draws once without advancing');
loop.stop();
eq(loop.state().stopped, true, 'stop stops');

const errs = [];
const q2 = [];
const bad = E.startGameLoop(canvas, { update: () => { const e = new Error('x'); e.kind = 'boom'; throw e; }, render: () => {}, onError: (k) => errs.push(k) },
  { request: (cb) => { q2.push(cb); return 1; }, cancel: () => {} });
q2.shift()(10);
eq(errs, ['boom'], 'a failed frame is reported once with its kind');
eq(q2.length, 0, 'and the loop stops instead of spinning');
eq(bad.state().stopped, true, 'the failed loop says it stopped');
throwsKind(() => E.startGameLoop({ getContext: () => null }, { update() {}, render() {} }, frames), 'no-2d-context', 'a canvas with no 2D context is refused');

// Blink: seeded, so the clock is checked, not the randomness.
let seed = 1;
const rand = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
for (let i = 0; i < 50; i++) {
  const g = E.blinkGap(false, rand);
  if (g < E.BLINK_GAP_MIN_SEC || g > E.BLINK_GAP_MAX_SEC) { assert(false, `blink gap ${g} out of range`); break; }
}
assert(true, 'blink gaps stay between the floor and the cap');
assert(E.blinkGap(true, () => 0.5) > E.blinkGap(false, () => 0.5), 'a working fish blinks less often');
const b = { blinkIn: 0.05, blinkShut: 0 };
eq(E.tickBlink(b, 0.01, false, rand), false, 'eyes open before the blink is due');
eq(E.tickBlink(b, 0.1, false, rand), true, 'eyes shut once it is due');
let open = false;
for (let i = 0; i < 40 && !open; i++) open = !E.tickBlink(b, 0.01, false, rand);
eq(open, true, 'and open again after a short shut');

process.stdout.write(`\naquarium: ${passed} passed, ${failed} failed\n`);
if (failed) process.exit(1);
