// Run: node app/renderer/stt.test.js
//
// Plain Node.js — no test framework (matches tts.test.js). Exit 0 = all pass.
//
// Imports the REAL official @huggingface/transformers standalone browser bundle (the
// declared 3.8.1 dependency) and the REAL stt.js against it, in a minimal window stub.
// This is the regression test for the packaging failure that made Dictate a hollow
// control: stt.js used to import ./vendor/transformers.web.min.js, which does not exist,
// so the module died at import time and window.ccSTT was never assigned.
//
// NO network access or model download: the dictation cases stub browser audio and
// stop before the Whisper pipeline is needed.
// NO recorded audio or transcript text appears anywhere in this file's assertions.

import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) { process.stdout.write(`  ✓ ${label}\n`); passed++; }
  else { process.stderr.write(`  ✗ FAIL: ${label}\n`); failed++; }
}

function section(name) { process.stdout.write(`\n${name}\n`); }

// --- minimal window stub (stt.js needs EventTarget + CustomEvent at import time) -----
const win = new EventTarget();
global.window = win;
let readyFired = false;
win.addEventListener('cc-stt-ready', () => { readyFired = true; });

// ══════════════════════════════════════════════════════════════════════════════
section('The official packaged browser bundle exists and exposes the API');
// ══════════════════════════════════════════════════════════════════════════════

let bundle = null;
let bundleError = null;
try {
  // Same specifier stt.js uses (relative to renderer/), so this is the same module
  // instance stt.js will receive below.
  bundle = await import('../node_modules/@huggingface/transformers/dist/transformers.min.js');
} catch (e) {
  bundleError = e;
}
assert(bundleError === null,
  `transformers.min.js imports cleanly${bundleError ? ' — threw: ' + bundleError.message : ''}`);
assert(!!bundle && typeof bundle.pipeline === 'function', 'the bundle exposes pipeline()');
assert(!!bundle && !!bundle.env && typeof bundle.env === 'object', 'the bundle exposes env');

// Node reality check: the WEB bundle stubs out onnxruntime-node, so under plain Node
// env.backends.onnx is undefined — exactly the shape configureSttEnv REFUSES. In the
// Electron renderer (sandboxed, no `process` global) the bundle takes its browser path
// and env.backends.onnx is ONNX Runtime Web's env, which has .wasm. To exercise the real
// stt.js import end-to-end here, graft a browser-shaped stand-in BEFORE importing it.
const onnxUnderNode = bundle.env.backends && bundle.env.backends.onnx;
assert(!(onnxUnderNode && onnxUnderNode.wasm),
  'under plain Node the web bundle has no onnx.wasm env (documents why the graft below exists)');
bundle.env.backends.onnx = { wasm: {} };

// ══════════════════════════════════════════════════════════════════════════════
section('Importing the REAL stt.js against the real bundle');
// ══════════════════════════════════════════════════════════════════════════════

let importError = null;
try {
  await import('./stt.js');
} catch (e) {
  importError = e;
}
assert(importError === null,
  `stt.js imports without throwing${importError ? ' — threw: ' + importError.message : ''}`);
assert(readyFired, 'cc-stt-ready fires once the module has loaded');
assert(typeof window.ccSTT === 'object' && window.ccSTT !== null,
  'window.ccSTT is assigned (the original bug left this permanently undefined)');
assert(typeof window.ccSTT.toggle === 'function', 'ccSTT.toggle is exposed');
assert(typeof window.ccSTT.transcribeVideoPcm === 'function', 'the Video Scout PCM entry point is exposed');
assert(typeof window.ccSTT.cancelVideoTranscription === 'function', 'Video Scout can cancel a running transcription');
window.ccSTT.cancelVideoTranscription(); // no transcription running: a no-op that leaves no stale cancel behind
const invalidAudio = await window.ccSTT.transcribeVideoPcm(new Uint8Array(1), () => {});
assert(invalidAudio.ok === false && invalidAudio.error === 'failed' && /16-bit/.test(invalidAudio.detail),
  'the Video Scout PCM entry point refuses a partial sample before model load, saying why');
const afterRefusal = await window.ccSTT.transcribeVideoPcm(new Uint8Array(1), () => {});
assert(afterRefusal.error === 'failed', 'a refused clip does not leave Video Scout marked busy');
assert(typeof window.ccSTT.isRecording === 'function' && window.ccSTT.isRecording() === false,
  'ccSTT.isRecording is exposed and starts false');
assert(typeof window.ccSTT.isBusy === 'function' && window.ccSTT.isBusy() === false,
  'ccSTT.isBusy is exposed and starts false');
assert(window.ccSTT.getModel() === 'onnx-community/whisper-large-v3-turbo',
  'ccSTT reports the exact approved model rather than the old base.en model');
assert(typeof window.ccSTT.onStatus === 'function', 'ccSTT.onStatus is exposed');
assert(typeof window.ccSTT.onResult === 'function', 'ccSTT.onResult is exposed');
assert(window.ccSTT.getBackend() === '', 'no backend is claimed before any pipeline has resolved');

// ══════════════════════════════════════════════════════════════════════════════
section('stt.js applied the exact environment contract to the real env');
// ══════════════════════════════════════════════════════════════════════════════

const { STT_WASM_PATHS } = await import('./stt-env-config.js');
assert(bundle.env.allowLocalModels === false, 'env.allowLocalModels = false');
assert(bundle.env.allowRemoteModels === true, 'env.allowRemoteModels = true');
assert(bundle.env.backends.onnx.wasm.wasmPaths === STT_WASM_PATHS,
  'env.backends.onnx.wasm.wasmPaths = the pinned 3.8.1 jsdelivr dist');
assert(bundle.env.backends.onnx.wasm.numThreads === 1, 'env.backends.onnx.wasm.numThreads = 1');
assert(bundle.env.backends.onnx.wasm.proxy === false, 'env.backends.onnx.wasm.proxy = false');

// Run the actual Dictate wiring with two terminal panes and stub browser audio APIs.
const stt = win.ccSTT;
const appSource = readFileSync(new URL('./app.js', import.meta.url), 'utf8');
const setupControls = appSource.slice(appSource.indexOf('function setupSTTControls()'),
  appSource.indexOf('function setupTTSControls()'));
const mic = { dataset: {}, classList: { toggle() {} }, textContent: '🎤 Dictate' };
const status = { textContent: '' };
const toggles = [];
const uiStt = {
  ...stt,
  toggle() {
    const result = stt.toggle();
    toggles.push(result);
    return result;
  },
};
const ui = {
  window: { ccSTT: uiStt },
  $: (selector) => ({ '#sttMic': mic, '#sttStatus': status })[selector],
  terms: new Map([['first', {}], ['second', {}]]),
  activeTermId: 'first',
  sttDictationTargetId: null,
  appendLog() {},
  sttNotice() {},
  pushToTalk: null,
};
runInNewContext(`${setupControls}\nsetupSTTControls();`, ui);

const streams = [];
const pendingMic = [];
Object.defineProperty(navigator, 'mediaDevices', { value: {
  getUserMedia() {
    const tracks = Array.from({ length: 2 }, () => ({ stops: 0, stop() { this.stops++; } }));
    const stream = { getTracks: () => tracks };
    streams.push(tracks);
    return new Promise((resolve) => { pendingMic.push(() => resolve(stream)); });
  },
} });
let recorderFailure;
let recordedData;
let starts = 0;
global.MediaRecorder = class {
  constructor() {
    if (recorderFailure === 'constructor') throw new Error('recorder constructor refused');
  }
  start() {
    if (recorderFailure === 'start') throw new Error('recorder start refused');
    starts++;
  }
  stop() {
    queueMicrotask(() => {
      if (recordedData) this.ondataavailable({ data: recordedData });
      this.onstop();
    });
  }
};

async function grantMicrophone() {
  pendingMic.splice(0).forEach((grant) => grant());
  await Promise.allSettled(toggles.splice(0));
}

section('#232: overlapping Dictate clicks keep one microphone and the original pane');
mic.onclick();
ui.activeTermId = 'second';
mic.onclick();
assert(pendingMic.length === 1, 'two clicks while permission is pending request one microphone stream');
assert(ui.sttDictationTargetId === 'first', 'a pending Dictate click cannot change the locked pane');
assert(status.textContent.includes('requesting the microphone'), 'Dictate shows that the microphone request is pending');
toggles.push(stt.toggle()); // A caller that bypasses the button still cannot start a second capture.
assert(pendingMic.length === 1, 'the STT module also guards a pending microphone request');
await grantMicrophone();
assert(starts === 1 && mic.textContent.includes('Stop'), 'the microphone grant starts one recorder and displays Stop');
mic.onclick();
await Promise.all(toggles.splice(0));
assert(streams.flat().every((track) => track.stops === 1), 'one Stop releases every acquired track exactly once');

section('#233: recorder startup failures release the microphone and refuse visibly');
for (const stage of ['constructor', 'start']) {
  recorderFailure = stage;
  const click = mic.onclick();
  await grantMicrophone();
  await click;
  assert(streams.at(-1).every((track) => track.stops === 1), `a ${stage} failure releases every track`);
  assert(!stt.isStarting?.() && !stt.isRecording() && !stt.isBusy() && ui.sttDictationTargetId === null,
    `a ${stage} failure clears dictation state and the pane lock`);
  assert(/^error\b/.test(status.textContent) && status.textContent.includes(`recorder ${stage} refused`),
    `a ${stage} failure is visible in the Dictate status`);
}
recorderFailure = undefined;
const rejection = Promise.reject(new Error('unexpected toggle failure'));
rejection.catch(() => {}); // Keep the broken baseline runnable so the UI assertion shows the failure.
const realToggle = uiStt.toggle;
uiStt.toggle = () => rejection;
status.textContent = '';
assert(mic.onclick() === true, 'a click that reaches the engine answers true synchronously (push to talk reads it)');
await new Promise((resolve) => setTimeout(resolve, 0));
assert(/^error\b/.test(status.textContent) && ui.sttDictationTargetId === null,
  'the Dictate click handler reports a rejected toggle and clears the pane lock');
assert(status.textContent.includes('unexpected toggle failure'),
  'the rejected toggle shows its reason, not only a generic message');
uiStt.toggle = () => { throw new Error('synchronous toggle failure'); };
ui.activeTermId = 'first';
status.textContent = '';
assert(mic.onclick() === false, 'a toggle that throws at once is reported as refused');
assert(status.textContent.includes('synchronous toggle failure') && ui.sttDictationTargetId === null,
  'a synchronous toggle throw shows its reason and clears the pane lock');
uiStt.toggle = realToggle;

section('#240: decoding closes its AudioContext on both paths');
const contexts = [];
let decoderFails = true;
win.AudioContext = class {
  constructor() { this.closes = 0; contexts.push(this); }
  async decodeAudioData() {
    if (decoderFails) throw new Error('undecodable capture');
    return { duration: 1 };
  }
  async close() { this.closes++; }
};
global.OfflineAudioContext = class {
  createBufferSource() { return { connect() {}, start() {} }; }
  // Silence is refused before the model can load.
  async startRendering() { return { getChannelData: () => new Float32Array(16000) }; }
};
recordedData = new Blob([new Uint8Array([1])]);
for (decoderFails of [true, false]) {
  mic.onclick();
  await grantMicrophone();
  assert(stt.isRecording(), 'a new recording can start after an earlier failure');
  mic.onclick();
  await Promise.all(toggles.splice(0));
  const outcome = decoderFails ? 'rejected' : 'successful';
  assert(contexts.at(-1)?.closes === 1, `a ${outcome} decode closes its AudioContext once`);
  if (decoderFails) assert(status.textContent.includes('undecodable capture'), 'the decode failure remains visible');
}

// ══════════════════════════════════════════════════════════════════════════════
process.stdout.write(`\n${passed + failed} tests: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
