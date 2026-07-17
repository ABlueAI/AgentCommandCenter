// Run: node app/renderer/tts-playback-queue.test.js
// Plain Node.js — no framework. Exercises the ACTUAL exported createPlaybackQueue that
// tts.js installs (per the approved correction: no test-only reconstruction). All media
// behavior is dependency-injected fakes: no real audio, no DOM, no network.

import { createPlaybackQueue } from './tts-playback-queue.js';

let passed = 0, failed = 0;
function assert(cond, label) {
  if (cond) { process.stdout.write(`  ✓ ${label}\n`); passed++; }
  else { process.stderr.write(`  ✗ FAIL: ${label}\n`); failed++; }
}
function section(name) { process.stdout.write(`\n${name}\n`); }
const tick = () => new Promise((r) => setImmediate(r));

// Fake HTMLAudioElement + URL registry harness.
function harness({ playImpl, withWebkitPitch = false, rate = 2 } = {}) {
  const created = [];       // fake elements, in creation order
  const urls = [];          // created object URLs
  const revoked = [];       // revocations, in order (dupes would show here)
  const errors = [];        // onError reports
  let currentRate = rate;
  const q = createPlaybackQueue({
    createAudio: (url) => {
      const listeners = {};
      const el = {
        url,
        playbackRate: undefined,
        preservesPitch: undefined,
        playCalls: 0,
        pauseCalls: 0,
        addEventListener(type, cb) { (listeners[type] = listeners[type] || []).push(cb); },
        fire(type) { for (const cb of (listeners[type] || []).slice()) cb(); },
        play() { el.playCalls++; return playImpl ? playImpl(el) : Promise.resolve(); },
        pause() { el.pauseCalls++; },
      };
      if (withWebkitPitch) el.webkitPreservesPitch = false;
      created.push(el);
      return el;
    },
    createObjectUrl: (bytes) => { const u = `blob:fake-${urls.length}:${bytes.length}`; urls.push(u); return u; },
    revokeObjectUrl: (u) => revoked.push(u),
    getPlaybackRate: () => currentRate,
    onError: (reason) => errors.push(reason),
  });
  return { q, created, urls, revoked, errors, setRate: (r) => { currentRate = r; } };
}
const bytes = (n) => new Uint8Array(n);
function trackDone(q) {
  const settles = [];
  q.done.then((v) => settles.push(v));
  return settles;
}

// ══════════════════════════════════════════════════════════════════════════════
section('Order, no overlap, no artificial gap');
{
  const h = harness();
  const settles = trackDone(h.q);
  h.q.enqueue(bytes(10)); h.q.enqueue(bytes(20)); h.q.enqueue(bytes(30));
  assert(h.created.length === 1 && h.created[0].playCalls === 1,
    'only the first chunk gets an element while it is playing (no overlap possible)');
  h.created[0].fire('ended');
  assert(h.created.length === 2 && h.created[1].playCalls === 1,
    'the next ready chunk starts synchronously on ended (no artificial gap)');
  assert(h.created[1].url === h.urls[1] && h.created[0].url === h.urls[0],
    'chunks play in exact enqueue order');
  h.created[1].fire('ended');
  h.created[2].fire('ended');
  assert(settles.length === 0, 'done does not resolve while end() has not been called');
  h.q.end();
  await tick();
  assert(settles.length === 1 && settles[0] === 'completed',
    'done resolves completed only after end() and the final chunk finishing');
  assert(h.revoked.length === 3 && new Set(h.revoked).size === 3,
    'every URL revoked exactly once on the completion path');
}

section('end() before/without content');
{
  const h = harness();
  const settles = trackDone(h.q);
  h.q.end();
  await tick();
  assert(settles.length === 1 && settles[0] === 'completed', 'an empty ended queue completes immediately');
}

section('Playback rate is read when each chunk STARTS; pitch preservation is set');
{
  const h = harness({ rate: 2, withWebkitPitch: true });
  h.q.enqueue(bytes(1)); h.q.enqueue(bytes(1));
  assert(h.created[0].playbackRate === 2, 'first chunk starts at the speed current at ITS start (2x)');
  h.setRate(1);
  h.created[0].fire('ended');
  assert(h.created[1].playbackRate === 1,
    'a speed change mid-speech applies to the NEXT chunk at its start (not captured at generation)');
  assert(h.created[0].preservesPitch === true && h.created[1].preservesPitch === true,
    'preservesPitch is enabled on every element');
  assert(h.created[0].webkitPreservesPitch === true,
    'the prefixed pitch property is set only because the element exposes it');
}
{
  const h = harness({ rate: 9 });
  h.q.enqueue(bytes(1));
  assert(h.created[0].playbackRate === 2, 'rates clamp to the 2x ceiling');
  const h2 = harness({ rate: 0.01 });
  h2.q.enqueue(bytes(1));
  assert(h2.created[0].playbackRate === 0.5, 'rates clamp to the 0.5x floor');
  const h3 = harness({ rate: NaN });
  h3.q.enqueue(bytes(1));
  assert(h3.created[0].playbackRate === 1, 'a malformed rate degrades to 1x, not silence');
}

section('Stop: immediate silence, full cleanup, settled promise, no resurrection');
{
  const h = harness();
  const settles = trackDone(h.q);
  h.q.enqueue(bytes(1)); h.q.enqueue(bytes(1)); h.q.enqueue(bytes(1));
  h.q.stop();
  await tick();
  assert(h.created[0].pauseCalls === 1, 'stop pauses the active element immediately');
  assert(settles.length === 1 && settles[0] === 'stopped', 'stop settles done as stopped (no hang)');
  assert(h.revoked.length === 3 && new Set(h.revoked).size === 3, 'stop revokes every outstanding URL exactly once');
  const elementsBefore = h.created.length;
  h.created[0].fire('ended'); // the paused element may still emit events later
  assert(h.created.length === elementsBefore, 'a late ended after stop resurrects nothing');
  assert(h.revoked.length === 3, 'a late ended after stop cannot double-revoke');
  h.q.enqueue(bytes(5));
  await tick();
  assert(h.created.length === elementsBefore && h.revoked.length === 4,
    'an enqueue after stop (stale generation) never plays and its URL is revoked immediately');
  assert(h.q.isFinished() === true, 'the queue reports finished after stop');
}

section('play() rejection: one visible failure, terminal, cleaned up');
{
  const h = harness({ playImpl: () => Promise.reject(new Error('NotAllowedError: nope')) });
  const settles = trackDone(h.q);
  h.q.enqueue(bytes(1)); h.q.enqueue(bytes(1));
  h.q.end();
  await tick(); await tick();
  assert(h.errors.length === 1 && /^play-rejected: /.test(h.errors[0]),
    'a rejected play() reports exactly once through the single onError path');
  assert(h.errors[0].length < 140, 'the failure reason is bounded');
  assert(settles.length === 1 && settles[0] === 'failed', 'done settles failed on playback failure');
  assert(h.revoked.length === 2 && new Set(h.revoked).size === 2,
    'both the failed chunk and the never-played chunk are revoked exactly once');
}
{
  const h = harness({ playImpl: () => { throw new Error('sync throw'); } });
  const settles = trackDone(h.q);
  h.q.enqueue(bytes(1)); h.q.end();
  await tick(); await tick();
  assert(settles.length === 1 && settles[0] === 'failed' && h.errors.length === 1,
    'a synchronous play() throw is the same visible failure as a rejection');
}

section('media error event: visible, terminal');
{
  const h = harness();
  const settles = trackDone(h.q);
  h.q.enqueue(bytes(1)); h.q.end();
  h.created[0].fire('error');
  await tick();
  assert(h.errors.length === 1 && h.errors[0] === 'media-error', 'an element error event reports media-error');
  assert(settles.length === 1 && settles[0] === 'failed', 'done settles failed on a media error');
  assert(h.revoked.length === 1, 'the failed chunk URL is revoked exactly once');
}

section('Terminal idempotence: racing ended/error/stop produce ONE outcome, one revoke each');
{
  const h = harness();
  const settles = trackDone(h.q);
  h.q.enqueue(bytes(1));
  h.q.end();
  const el = h.created[0];
  el.fire('ended');   // completes the queue
  el.fire('ended');   // duplicate terminal event
  el.fire('error');   // conflicting terminal event
  h.q.stop();         // conflicting terminal call
  await tick();
  assert(settles.length === 1 && settles[0] === 'completed',
    'only the FIRST terminal outcome wins (completed), later error/stop cannot override it');
  assert(h.errors.length === 0, 'a late error event after completion reports nothing');
  assert(h.revoked.length === 1, 'the chunk URL was revoked exactly once across all racing callbacks');
}
{
  const h = harness({ playImpl: (el) => { setImmediate(() => el.fire('error')); return Promise.reject(new Error('x')); } });
  const settles = trackDone(h.q);
  h.q.enqueue(bytes(1)); h.q.end();
  await tick(); await tick(); await tick();
  assert(settles.length === 1 && settles[0] === 'failed', 'rejection + error event together still settle exactly once');
  assert(h.errors.length === 1, 'and report exactly one visible failure');
  assert(h.revoked.length === 1, 'and revoke the URL exactly once');
}

section('Diagnostics carry no content');
{
  const secret = 'THE SECRET SELECTED TEXT';
  const h = harness({ playImpl: () => Promise.reject(new Error('denied')) });
  h.q.enqueue(new TextEncoder().encode(secret));
  h.q.end();
  await tick(); await tick();
  assert(h.errors.every((e) => !e.includes(secret) && !e.includes('SECRET')),
    'failure reasons never include the audio payload or selected text');
}

// a broken logger/error sink must not change outcomes
{
  const created = [];
  const q = createPlaybackQueue({
    createAudio: (url) => { const el = { url, addEventListener() {}, play: () => Promise.reject(new Error('no')), pause() {} }; created.push(el); return el; },
    createObjectUrl: () => 'blob:x',
    revokeObjectUrl: () => { throw new Error('revoke broke'); },
    getPlaybackRate: () => 1,
    onError: () => { throw new Error('sink broke'); },
  });
  const settles = trackDone(q);
  q.enqueue(bytes(1)); q.end();
  await tick(); await tick();
  assert(settles.length === 1 && settles[0] === 'failed',
    'a throwing onError/revoke sink cannot hang the queue or hide the failure outcome');
}

process.stdout.write(`\ntts-playback-queue: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
