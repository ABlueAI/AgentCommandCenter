// Run: node app/renderer/tts.test.js
//
// Plain Node.js — no test framework, no build step (matches pty-parser.test.js).
// Exit 0 = all pass. Exit 1 = at least one failure.
//
// Imports the REAL tracked vendor/kokoro.web.js bundle (not a mock) through the real
// tts.js, in a minimal window/EventTarget stub. This is the regression test for the
// packaging mismatch that broke TTS entirely: tts.js used to assume the bundle exposed
// `env.backends.onnx`, but the tracked bundle's exported `env` only exposes `wasmPaths`
// — so the assumption threw at module top-level and window.ccTTS was never assigned.
// No network access is required: model loading only happens lazily inside speak(), and
// the failure-path test below stubs the loader instead of hitting the network.
//
// Fast Clear: playback is now HTMLAudioElement-based (wav-encode.js +
// tts-playback-queue.js). The harness fakes `Audio` (auto-fires 'ended' after play so
// queues drain) and spies on URL.createObjectURL/revokeObjectURL around Node's real
// implementations, so the real Blob → object URL → element pipeline runs for real.

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    process.stdout.write(`  ✓ ${label}\n`);
    passed++;
  } else {
    process.stderr.write(`  ✗ FAIL: ${label}\n`);
    failed++;
  }
}

function section(name) { process.stdout.write(`\n${name}\n`); }
const tick = () => new Promise((resolve) => setImmediate(resolve));

// --- minimal window stub -------------------------------------------------------
// tts.js needs EventTarget (addEventListener/dispatchEvent) at import time and
// Audio/URL/Blob at speak time; it never touches `document`.
const win = new EventTarget();
global.window = win;

// Fake HTMLAudioElement: records rate/pitch, auto-fires 'ended' shortly after a
// successful play() so speak()'s `await queue.done` drains like real playback.
const playedElements = [];   // every element whose play() was called
let playImpl = null;         // per-test override (e.g. rejection)
global.Audio = function Audio(url) {
  const listeners = {};
  const el = {
    url,
    playbackRate: undefined,
    preservesPitch: undefined,
    pauseCalls: 0,
    addEventListener(type, cb) { (listeners[type] = listeners[type] || []).push(cb); },
    fire(type) { for (const cb of (listeners[type] || []).slice()) cb(); },
    play() {
      playedElements.push(el);
      if (playImpl) return playImpl(el);
      setImmediate(() => el.fire('ended'));
      return Promise.resolve();
    },
    pause() { el.pauseCalls++; },
  };
  return el;
};

// Spy on the REAL Node object-URL lifecycle so revocation accounting is genuine.
const createdUrls = [];
const revokedUrls = [];
const capturedBlobs = [];
const realCreateObjectURL = URL.createObjectURL.bind(URL);
const realRevokeObjectURL = URL.revokeObjectURL.bind(URL);
URL.createObjectURL = (blob) => { const u = realCreateObjectURL(blob); createdUrls.push(u); capturedBlobs.push(blob); return u; };
URL.revokeObjectURL = (u) => { revokedUrls.push(u); return realRevokeObjectURL(u); };

let readyFired = false;
win.addEventListener('cc-tts-ready', () => { readyFired = true; });

// ══════════════════════════════════════════════════════════════════════════════
section('Bootstrap contract: importing tts.js against the tracked bundle');
// ══════════════════════════════════════════════════════════════════════════════

let importError = null;
try {
  await import('./tts.js');
} catch (e) {
  importError = e;
}

assert(importError === null,
  `module import does not throw against the tracked vendor bundle${importError ? ' — threw: ' + importError.message : ''}`);
assert(readyFired, 'cc-tts-ready fires once the module has loaded');
assert(typeof window.ccTTS === 'object' && window.ccTTS !== null,
  'window.ccTTS is assigned (the original bug left this permanently undefined)');
assert(typeof window.ccTTS.speak === 'function', 'ccTTS.speak is exposed');
assert(typeof window.ccTTS.stop === 'function', 'ccTTS.stop is exposed');
assert(Array.isArray(window.ccTTS.voices) && window.ccTTS.voices.length > 0, 'ccTTS.voices is populated');
assert(typeof window.ccTTS.onStatus === 'function', 'ccTTS.onStatus is exposed');

// ══════════════════════════════════════════════════════════════════════════════
section('Success-side bootstrap contract: speak() is callable and status-driven');
// ══════════════════════════════════════════════════════════════════════════════

{
  const events = [];
  window.ccTTS.onStatus((e) => events.push(e));
  await window.ccTTS.speak('');
  assert(events.length === 1 && events[0].state === 'idle',
    'empty input short-circuits to an idle status without attempting to load the model');
  assert(window.ccTTS.isSpeaking() === false, 'not left in a speaking state for empty input');
}

// ══════════════════════════════════════════════════════════════════════════════
section('Failure path is visible, not silent (both devices fail)');
// ══════════════════════════════════════════════════════════════════════════════

{
  const kokoro = await import('./vendor/kokoro.web.js');
  const original = kokoro.KokoroTTS.from_pretrained;
  kokoro.KokoroTTS.from_pretrained = async (_id, opts) => {
    throw new Error(`simulated ${opts.device} failure`);
  };
  try {
    const events = [];
    window.ccTTS.onStatus((e) => events.push(e));
    let threw = false;
    try {
      await window.ccTTS.speak('hello world, this should fail to load.');
    } catch {
      threw = true;
    }
    assert(!threw, 'speak() reports failure through status, not an uncaught rejection');
    const errorEvent = events.find((e) => e.state === 'error');
    assert(!!errorEvent, 'an error status event is emitted when both devices fail');
    assert(!!(errorEvent && errorEvent.detail && errorEvent.detail.length > 0),
      'the error status carries a non-empty, human-readable detail');
    assert(!!(errorEvent && /webgpu/.test(errorEvent.detail) && /wasm/.test(errorEvent.detail)),
      'the error detail names both the webgpu and wasm attempts (honest, not vague)');
    assert(window.ccTTS.isSpeaking() === false,
      'the control is not left looking "speaking"/usable after a failed bootstrap');
    assert(!events.some((e) => e.state === 'idle' && events.indexOf(e) > events.indexOf(errorEvent)),
      'no later status silently overwrites the error with an idle/ready-looking state');
  } finally {
    kokoro.KokoroTTS.from_pretrained = original;
  }
}

// ══════════════════════════════════════════════════════════════════════════════
section('Fast Clear invariant: natural-speed synthesis, listening-speed playback');
// ══════════════════════════════════════════════════════════════════════════════

// tts.js caches the loaded model after the first successful ensureModel(), so later
// sections cannot re-stub from_pretrained. Install ONE delegating model here and let
// each section swap `currentGenerate` on it instead.
let currentGenerate = null;

{
  const kokoro = await import('./vendor/kokoro.web.js');
  const original = kokoro.KokoroTTS.from_pretrained;
  const generateOptions = [];
  currentGenerate = async (text, opts) => {
    generateOptions.push(opts);
    return { audio: new Float32Array([0.25, -0.5]), sampling_rate: 24000 };
  };
  kokoro.KokoroTTS.from_pretrained = async () => ({
    generate: (text, opts) => currentGenerate(text, opts),
  });
  try {
    window.ccTTS.setVoice('bm_daniel');
    window.ccTTS.setSpeed(2);
    assert(window.ccTTS.getSpeed() === 2, 'the 2x speed selection is accepted');
    window.ccTTS.setSpeed(9);
    assert(window.ccTTS.getSpeed() === 2, 'speeds stay clamped to the 2x ceiling');
    window.ccTTS.setSpeed(0.1);
    assert(window.ccTTS.getSpeed() === 0.5, 'speeds stay clamped to the 0.5x floor');
    window.ccTTS.setSpeed(2);

    const created = createdUrls.length;
    const played = playedElements.length;
    await window.ccTTS.speak('one sentence. two sentence.');
    assert(generateOptions.length === 2 && generateOptions.every((o) => o.speed === 1.0),
      'Kokoro ALWAYS receives synthesis speed 1.0, even with 2x selected');
    assert(generateOptions.every((o) => o.voice === 'bm_daniel'),
      'the selected voice still reaches Kokoro unchanged');
    assert(playedElements.length === played + 2
      && playedElements.slice(-2).every((el) => el.playbackRate === 2),
      'the SELECTED speed (2x) is applied to media playback of every chunk');
    assert(playedElements.slice(-2).every((el) => el.preservesPitch === true),
      'pitch preservation is enabled on every played element');
    assert(playedElements.slice(-2).map((el) => el.url).join(',') === createdUrls.slice(created).join(','),
      'chunks play in exact generation order');
    assert(createdUrls.length === created + 2
      && createdUrls.slice(created).every((u) => revokedUrls.includes(u)),
      'every blob URL from the completed run is revoked');

    // The real Blob carries a real WAV: parse it back to prove the waveform and
    // 24 kHz rate reach playback unchanged (within 16-bit quantization).
    const wav = new DataView(await capturedBlobs.at(-1).arrayBuffer());
    assert(wav.getUint32(24, true) === 24000, 'the generated 24 kHz sample rate reaches the WAV container');
    const s0 = wav.getInt16(44, true) / 32767;
    const s1 = wav.getInt16(46, true) / 32767;
    assert(Math.abs(s0 - 0.25) < 0.001 && Math.abs(s1 - (-0.5)) < 0.001,
      'the generated mono waveform reaches playback unchanged (16-bit round trip)');

    const events = [];
    window.ccTTS.onStatus((e) => events.push(e));
    await window.ccTTS.speak('again.');
    assert(events.at(-1).state === 'idle',
      'idle is reported only after the queue actually drains (successful completion)');
  } finally {
    kokoro.KokoroTTS.from_pretrained = original;
    window.ccTTS.setVoice('am_michael');
    window.ccTTS.setSpeed(1);
  }
}

// ══════════════════════════════════════════════════════════════════════════════
section('A rejected play() is visible and is not overwritten by idle');
// ══════════════════════════════════════════════════════════════════════════════

{
  currentGenerate = async () => ({ audio: new Float32Array([0.1]), sampling_rate: 24000 });
  playImpl = () => Promise.reject(new Error('NotAllowedError: playback denied'));
  try {
    const events = [];
    window.ccTTS.onStatus((e) => events.push(e));
    const created = createdUrls.length;
    await window.ccTTS.speak('SECRET-SELECTION should never leak.');
    const errorEvent = events.find((e) => e.state === 'error');
    assert(!!errorEvent && /playback failed/.test(errorEvent.detail),
      'a rejected audio.play() surfaces as a visible error status');
    assert(!events.some((e) => e.state === 'idle' && events.indexOf(e) > events.indexOf(errorEvent)),
      'the playback error is never overwritten by a later idle');
    assert(!errorEvent.detail.includes('SECRET-SELECTION'),
      'the error detail carries no selected text');
    assert(window.ccTTS.isSpeaking() === false, 'not left in a speaking state after playback failure');
    assert(createdUrls.slice(created).every((u) => revokedUrls.includes(u)),
      'blob URLs are revoked on the failure path too');
  } finally {
    playImpl = null;
  }
}

// ══════════════════════════════════════════════════════════════════════════════
section('Latest request wins: stale or stopped generation cannot enqueue audio');
// ══════════════════════════════════════════════════════════════════════════════

{
  const pending = [];
  const waitForPending = async (count) => {
    while (pending.length < count) await new Promise((resolve) => setImmediate(resolve));
  };
  currentGenerate = (text) => new Promise((resolve) => pending.push({ text, resolve }));
  try {
    const before = playedElements.length;
    const first = window.ccTTS.speak('first request.');
    await waitForPending(1);
    const second = window.ccTTS.speak('second request.');
    await waitForPending(2);

    pending[0].resolve({ audio: new Float32Array([0.9, -0.9]), sampling_rate: 24000 });
    await first;
    assert(playedElements.length === before,
      'an older generation result is discarded after a newer click');

    pending[1].resolve({ audio: new Float32Array([0.25, -0.5]), sampling_rate: 24000 });
    await second;
    assert(playedElements.length === before + 1,
      'only the newest request reaches the playback queue');
    const wav = new DataView(await capturedBlobs.at(-1).arrayBuffer());
    assert(wav.getUint32(24, true) === 24000
      && Math.abs(wav.getInt16(44, true) / 32767 - 0.25) < 0.001
      && Math.abs(wav.getInt16(46, true) / 32767 - (-0.5)) < 0.001,
      'the generated mono waveform and 24 kHz sample rate reach playback unchanged');

    const third = window.ccTTS.speak('stopped request.');
    await waitForPending(3);
    window.ccTTS.stop();
    pending[2].resolve({ audio: new Float32Array([0.6, -0.6]), sampling_rate: 24000 });
    await third;
    await tick();
    assert(playedElements.length === before + 1,
      'Stop invalidates generation still in flight before it can enqueue audio');
  } finally {
    currentGenerate = null;
  }
}

// Results
// ══════════════════════════════════════════════════════════════════════════════

process.stdout.write(`\n${passed + failed} tests: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
