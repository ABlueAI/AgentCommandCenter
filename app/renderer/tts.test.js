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

// --- minimal window stub -------------------------------------------------------
// tts.js only needs EventTarget (addEventListener/dispatchEvent) and AudioContext at
// import/speak time; it never touches `document`.
const win = new EventTarget();
let scheduledSources = 0;
const copiedBuffers = [];
win.AudioContext = function AudioContext() {
  this.state = 'running';
  this.currentTime = 0;
  this.resume = async () => {};
  this.createBuffer = (channels, length, sampleRate) => ({
    copyToChannel(samples) {
      copiedBuffers.push({ channels, sampleRate, samples: Array.from(samples) });
    },
    duration: length / sampleRate,
  });
  this.createBufferSource = () => {
    scheduledSources++;
    return { connect() {}, start() {}, stop() {}, set onended(_cb) {} };
  };
  this.destination = {};
};
global.window = win;

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
section('Latest request wins: stale or stopped generation cannot enqueue audio');

{
  const kokoro = await import('./vendor/kokoro.web.js');
  const original = kokoro.KokoroTTS.from_pretrained;
  const pending = [];
  const waitForPending = async (count) => {
    while (pending.length < count) await new Promise((resolve) => setImmediate(resolve));
  };
  kokoro.KokoroTTS.from_pretrained = async () => ({
    generate: (text) => new Promise((resolve) => pending.push({ text, resolve })),
  });
  try {
    const before = scheduledSources;
    const first = window.ccTTS.speak('first request.');
    await waitForPending(1);
    const second = window.ccTTS.speak('second request.');
    await waitForPending(2);

    pending[0].resolve({ audio: new Float32Array([0.9, -0.9]), sampling_rate: 24000 });
    await first;
    assert(scheduledSources === before,
      'an older generation result is discarded after a newer click');

    pending[1].resolve({ audio: new Float32Array([0.25, -0.5]), sampling_rate: 24000 });
    await second;
    assert(scheduledSources === before + 1,
      'only the newest request reaches the Web Audio queue');
    const copied = copiedBuffers.at(-1);
    assert(!!copied && copied.channels === 1 && copied.sampleRate === 24000
      && copied.samples[0] === 0.25 && copied.samples[1] === -0.5,
    'the generated mono waveform and 24 kHz sample rate reach playback unchanged');

    const third = window.ccTTS.speak('stopped request.');
    await waitForPending(3);
    window.ccTTS.stop();
    pending[2].resolve({ audio: new Float32Array([0.6, -0.6]), sampling_rate: 24000 });
    await third;
    assert(scheduledSources === before + 1,
      'Stop invalidates generation still in flight before it can enqueue audio');
  } finally {
    kokoro.KokoroTTS.from_pretrained = original;
  }
}

// Results
// ══════════════════════════════════════════════════════════════════════════════

process.stdout.write(`\n${passed + failed} tests: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
