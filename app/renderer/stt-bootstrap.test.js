// Run: node app/renderer/stt-bootstrap.test.js
//
// Plain Node.js — no test framework (matches pty-parser.test.js). Exit 0 = all pass.
// Covers the pure Whisper bootstrap contract in isolation from the browser, the real
// model download, and the microphone: device options, truthful download sizes, bounded +
// throttled progress reporting, honest backend selection, visible fallback, and the
// both-backends refusal. No network access anywhere in this file.

import {
  WHISPER_MODEL_ID, WHISPER_DOWNLOADS, getWhisperLoadOptions, describeWhisperDtype,
  getWhisperTranscriptionOptions, boundedFileName, createProgressReporter, createWhisperLoader,
  pcm16leToFloat32, describeTranscriptionError, transcribeInWindows, VIDEO_WINDOW_SAMPLES,
} from './stt-bootstrap.js';

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) { process.stdout.write(`  ✓ ${label}\n`); passed++; }
  else { process.stderr.write(`  ✗ FAIL: ${label}\n`); failed++; }
}

async function assertThrows(fn, label) {
  try { await fn(); assert(false, `${label} (did not throw)`); return null; }
  catch (e) { assert(true, label); return e; }
}

function section(name) { process.stdout.write(`\n${name}\n`); }

// ══════════════════════════════════════════════════════════════════════════════
section('Device options: the approved Whisper model/backend strategy');
// ══════════════════════════════════════════════════════════════════════════════

assert(WHISPER_MODEL_ID === 'onnx-community/whisper-large-v3-turbo', 'model is the Transformers.js-compatible large-v3-turbo build');
{
  const gpu = getWhisperLoadOptions('webgpu');
  assert(gpu.device === 'webgpu', 'webgpu options request device webgpu');
  assert(gpu.dtype && gpu.dtype.encoder_model === 'fp16' && gpu.dtype.decoder_model_merged === 'fp16',
    'webgpu dtype is { encoder_model: fp16, decoder_model_merged: fp16 }');
  const wasm = getWhisperLoadOptions('wasm');
  assert(wasm.device === 'wasm' && wasm.dtype === 'q8', 'wasm options are device wasm, dtype q8');
  assert(describeWhisperDtype('webgpu') === 'fp16+fp16' && describeWhisperDtype('wasm') === 'q8',
    'dtype descriptions are human-readable per backend');
  await assertThrows(async () => getWhisperLoadOptions('cpu'), 'an unsupported device is refused, not guessed');
}
assert(/1\.6/.test(WHISPER_DOWNLOADS.webgpu) && /1\.1/.test(WHISPER_DOWNLOADS.wasm),
  'truthful approximate first-use sizes: ~1.6 GB (webgpu), ~1.1 GB (wasm)');
{
  const opts = getWhisperTranscriptionOptions();
  assert(opts.language === 'english' && opts.task === 'transcribe',
    'decoding is pinned to English transcription instead of auto-detect/translation');
  assert(opts.chunk_length_s === 30 && opts.stride_length_s === 5,
    'long recordings use 30-second chunks with five-second overlap');
  assert(opts.return_timestamps === false && opts.do_sample === false && opts.num_beams === 3,
    'decoding is deterministic beam search without timestamp output');
}

// ══════════════════════════════════════════════════════════════════════════════
section('boundedFileName: bounded, path-free, control-char-free');
// ══════════════════════════════════════════════════════════════════════════════

assert(boundedFileName('decoder_model_merged_q4.onnx') === 'decoder_model_merged_q4.onnx', 'plain names pass through');
assert(boundedFileName('onnx/decoder_model_merged.onnx') === 'decoder_model_merged.onnx', 'forward-slash paths are stripped to the base name');
assert(boundedFileName('a\\b\\encoder.onnx') === 'encoder.onnx', 'backslash paths are stripped too');
assert(boundedFileName('bad\x1b[31mname\r\n.onnx') === 'bad[31mname.onnx', 'control characters are stripped');
{
  const long = 'x'.repeat(200) + '.onnx';
  const out = boundedFileName(long);
  assert(out.length === 61 && out.endsWith('…'), 'names are hard-capped at 60 chars + ellipsis');
}
assert(boundedFileName('') === 'model file' && boundedFileName(null) === 'model file', 'missing names fall back to a neutral label');

// ══════════════════════════════════════════════════════════════════════════════
section('createProgressReporter: visible, throttled, bounded');
// ══════════════════════════════════════════════════════════════════════════════

{
  let t = 0;
  const lines = [];
  const report = createProgressReporter((s) => lines.push(s), { intervalMs: 250, now: () => t });

  report({ status: 'initiate', file: 'encoder_model.onnx' });
  assert(lines.at(-1) === 'fetching encoder_model.onnx…', 'initiate reports immediately');

  report({ status: 'download', file: 'encoder_model.onnx' });
  assert(lines.at(-1) === 'downloading encoder_model.onnx…', 'download start reports immediately');

  report({ status: 'progress', file: 'encoder_model.onnx', progress: 10.4 });
  assert(lines.at(-1) === 'downloading encoder_model.onnx — 10%', 'first progress event shows a rounded percentage');

  const before = lines.length;
  t = 100;
  report({ status: 'progress', file: 'encoder_model.onnx', progress: 12 });
  t = 200;
  report({ status: 'progress', file: 'encoder_model.onnx', progress: 14 });
  assert(lines.length === before, 'progress events inside the 250 ms window are throttled away');

  t = 300;
  report({ status: 'progress', file: 'encoder_model.onnx', progress: 55.6 });
  assert(lines.at(-1) === 'downloading encoder_model.onnx — 56%', 'progress resumes after the throttle window');

  t = 310;
  report({ status: 'done', file: 'encoder_model.onnx' });
  assert(lines.at(-1) === 'encoder_model.onnx complete', 'file completion is IMMEDIATE, never throttled');

  t = 320;
  report({ status: 'progress', file: 'decoder.onnx', progress: 1 });
  assert(lines.at(-1) === 'downloading decoder.onnx — 1%', 'completion resets the throttle so the next file shows at once');

  report({ status: 'progress', file: 'decoder.onnx', progress: 150 });
  t = 1000;
  report({ status: 'progress', file: 'decoder.onnx', progress: 150 });
  assert(lines.at(-1) === 'downloading decoder.onnx — 100%', 'percentages are clamped to 0..100');
  t = 2000;
  report({ status: 'progress', file: 'decoder.onnx', progress: 'garbage' });
  assert(lines.at(-1) === 'downloading decoder.onnx…', 'a non-numeric progress value degrades to a percent-free line, never NaN');

  report({ status: 'ready' });
  assert(lines.at(-1) === 'model ready', 'model ready is immediate');

  const count = lines.length;
  report(null);
  report('nonsense');
  report({ status: 'mystery', payload: { secret: 'never shown' } });
  assert(lines.length === count, 'null/non-object/unknown events are ignored, never dumped to the UI');
  assert(lines.every((l) => typeof l === 'string' && !l.includes('secret') && !l.includes('[object')),
    'every reported line is a bounded string — no raw event objects or payloads leak');
}

// ══════════════════════════════════════════════════════════════════════════════
section('createWhisperLoader: honest selection, visible fallback, both-fail refusal');
// ══════════════════════════════════════════════════════════════════════════════

{
  // WebGPU success: selected only AFTER the pipeline resolves.
  const statuses = [];
  const calls = [];
  let selected = '';
  let selectedBeforeResolve = false;
  let resolvePipeline;
  const model = { whisper: true };
  const loader = createWhisperLoader((task, modelId, opts) => {
    calls.push({ task, modelId, opts });
    return new Promise((res) => { resolvePipeline = () => res(model); });
  });
  const p = loader({
    onStatus: (state, detail) => statuses.push({ state, detail }),
    onSelected: (device) => { selected = device; },
  });
  await new Promise((r) => setImmediate(r));
  selectedBeforeResolve = selected !== '';
  resolvePipeline();
  const result = await p;
  assert(result === model, 'resolves with the loaded pipeline');
  assert(!selectedBeforeResolve, 'no backend is claimed successful before the pipeline actually resolves');
  assert(selected === 'webgpu', 'webgpu success is selected honestly');
  assert(calls.length === 1 && calls[0].task === 'automatic-speech-recognition' && calls[0].modelId === WHISPER_MODEL_ID,
    'pipeline is asked for ASR on the approved model');
  assert(calls[0].opts.device === 'webgpu' && calls[0].opts.dtype.encoder_model === 'fp16',
    'webgpu attempt carries the approved device/dtype options');
  assert(typeof calls[0].opts.progress_callback === 'function', 'a progress_callback is passed into the attempt');
  assert(statuses.some((s) => s.state === 'loading' && /initializing webgpu/.test(s.detail) && /1\.6/.test(s.detail)),
    'the webgpu attempt announces itself with the truthful ~1.6 GB first-use size');
}

{
  // WebGPU failure falls back VISIBLY to WASM.
  const statuses = [];
  let selected = '';
  const attempts = [];
  const loader = createWhisperLoader(async (task, modelId, opts) => {
    attempts.push(opts.device);
    if (opts.device === 'webgpu') throw new Error('no WebGPU adapter');
    assert(opts.dtype === 'q8', 'the wasm attempt carries dtype q8');
    assert(typeof opts.progress_callback === 'function', 'the wasm attempt also gets a progress_callback');
    return { ok: true };
  });
  const result = await loader({
    onStatus: (state, detail) => statuses.push({ state, detail }),
    onSelected: (device) => { selected = device; },
  });
  assert(!!result && attempts.join(',') === 'webgpu,wasm', 'tries webgpu then wasm, in order');
  assert(selected === 'wasm', 'reports WASM as the backend that actually initialized');
  assert(statuses.some((s) => s.state === 'loading' && /webgpu unavailable/.test(s.detail) && /wasm/.test(s.detail)),
    'the WebGPU→WASM fallback is visible, not silent');
  assert(statuses.some((s) => /initializing wasm/.test(s.detail) && /1\.1/.test(s.detail)),
    'the wasm attempt announces the truthful ~1.1 GB first-use size');
}

{
  // Both backends failing refuses with BOTH reasons; a falsy result is not success.
  const err = await assertThrows(
    () => createWhisperLoader(async (task, modelId, opts) => { throw new Error(`${opts.device} exploded`); })({}),
    'throws when every backend fails',
  );
  assert(/speech model failed to initialize/.test(err.message), 'the refusal names the SPEECH model (not the voice model)');
  assert(/webgpu: webgpu exploded/.test(err.message) && /wasm: wasm exploded/.test(err.message),
    'the refusal names both attempted backends with their reasons');

  const falsy = await assertThrows(
    () => createWhisperLoader(async () => null)({}),
    'a falsy loader result is treated as failure, not success',
  );
  assert(/webgpu/.test(falsy.message) && /wasm/.test(falsy.message), 'the falsy-result refusal still names both backends');
}

{
  // Progress events emitted by the pipeline flow into the status stream, throttled.
  let t = 0;
  const statuses = [];
  const loader = createWhisperLoader(async (task, modelId, opts) => {
    opts.progress_callback({ status: 'progress', file: 'encoder_model.onnx', progress: 40 });
    t = 50;
    opts.progress_callback({ status: 'progress', file: 'encoder_model.onnx', progress: 41 });
    opts.progress_callback({ status: 'done', file: 'encoder_model.onnx' });
    return { ok: true };
  }, { intervalMs: 250, now: () => t });
  await loader({ onStatus: (state, detail) => statuses.push({ state, detail }) });
  const progressLines = statuses.filter((s) => /encoder_model\.onnx/.test(s.detail));
  assert(progressLines.length === 2 && /40%/.test(progressLines[0].detail) && /complete/.test(progressLines[1].detail),
    'download progress reaches the status stream bounded and throttled (41% inside the window is dropped, done passes)');
}

// ══════════════════════════════════════════════════════════════════════════════
section('S54 Video Scout: 16-bit PCM conversion and the shared failure wording');
// ══════════════════════════════════════════════════════════════════════════════
{
  // Little-endian samples: 0x0000 = 0, 0x7fff = just under 1, 0x8000 = -1, 0x4000 = 0.5.
  const pcm = pcm16leToFloat32(new Uint8Array([0x00, 0x00, 0xff, 0x7f, 0x00, 0x80, 0x00, 0x40]));
  assert(pcm instanceof Float32Array && pcm.length === 4, 'four 16-bit samples become four floats');
  assert(pcm[0] === 0 && Math.abs(pcm[1] - 32767 / 32768) < 1e-7 && pcm[2] === -1 && pcm[3] === 0.5,
    'samples are read little-endian and scaled by 1/32768 (big-endian would give 0x00ff and 0xff7f)');
  const offset = new Uint8Array([9, 0x00, 0x40]).subarray(1);
  assert(pcm16leToFloat32(offset)[0] === 0.5, 'a view at a byte offset reads from its own start');
  assert(pcm16leToFloat32(new Uint8Array(3)) === null && pcm16leToFloat32(new Uint8Array(0)) === null &&
    pcm16leToFloat32([0, 0]) === null, 'an odd-length, empty or non-Uint8Array buffer is refused');
  assert(describeTranscriptionError(new Error('speech model failed: webgpu: x; wasm: y')) === 'speech model failed: webgpu: x; wasm: y',
    'a model-load failure keeps the bootstrap wording that names both backends');
  assert(describeTranscriptionError(new Error('out of memory')) === 'transcription failed: out of memory',
    'any other failure says transcription failed and why');
  assert(describeTranscriptionError(new Error('x'.repeat(500))).length === 'transcription failed: '.length + 300,
    'the reason is bounded to 300 characters');
}

// ══════════════════════════════════════════════════════════════════════════════
section('S54 Video Scout: windowed transcription stops between windows when cancelled');
// ══════════════════════════════════════════════════════════════════════════════
{
  assert(VIDEO_WINDOW_SAMPLES === 16000 * 120, 'the default window is 2 minutes of 16 kHz audio');
  const pcm = new Float32Array(10);
  const seen = [];
  const all = await transcribeInWindows(pcm, async (w) => { seen.push(w.length); return ` part${seen.length} `; }, () => false, 4);
  assert(seen.join(',') === '4,4,2' && all.text === 'part1 part2 part3', 'every window is transcribed in order and the texts are joined');
  let cancelled = false;
  const calls = [];
  const stopped = await transcribeInWindows(pcm, async () => { calls.push(1); cancelled = true; return 'x'; }, () => cancelled, 4);
  assert(stopped.cancelled === true && calls.length === 1, 'a cancel during a window stops before the next window starts');
  const before = await transcribeInWindows(pcm, async () => { throw new Error('never runs'); }, () => true, 4);
  assert(before.cancelled === true, 'a cancel before the first window runs nothing');
  const silent = await transcribeInWindows(pcm, async () => '  ', () => false, 4);
  assert(silent.text === '', 'windows with no speech give an empty transcript, not a refusal');
  const broken = await transcribeInWindows(pcm, async () => undefined, () => false, 4);
  assert(broken.text === null, 'a window with no text makes the whole transcript invalid');
}

// ══════════════════════════════════════════════════════════════════════════════
process.stdout.write(`\n${passed + failed} tests: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
