// Run: node app/renderer/stt-bootstrap.test.js
//
// Plain Node.js — no test framework (matches pty-parser.test.js). Exit 0 = all pass.
// Covers the pure Whisper bootstrap contract in isolation from the browser, the real
// model download, and the microphone: device options, truthful download sizes, bounded +
// throttled progress reporting, honest backend selection, visible fallback, and the
// both-backends refusal. No network access anywhere in this file.

import {
  WHISPER_MODEL_ID, WHISPER_DOWNLOADS, getWhisperLoadOptions, describeWhisperDtype,
  boundedFileName, createProgressReporter, createWhisperLoader,
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

assert(WHISPER_MODEL_ID === 'onnx-community/whisper-base.en', 'model stays onnx-community/whisper-base.en');
{
  const gpu = getWhisperLoadOptions('webgpu');
  assert(gpu.device === 'webgpu', 'webgpu options request device webgpu');
  assert(gpu.dtype && gpu.dtype.encoder_model === 'fp32' && gpu.dtype.decoder_model_merged === 'q4',
    'webgpu dtype is { encoder_model: fp32, decoder_model_merged: q4 }');
  const wasm = getWhisperLoadOptions('wasm');
  assert(wasm.device === 'wasm' && wasm.dtype === 'q8', 'wasm options are device wasm, dtype q8');
  assert(describeWhisperDtype('webgpu') === 'fp32+q4' && describeWhisperDtype('wasm') === 'q8',
    'dtype descriptions are human-readable per backend');
  await assertThrows(async () => getWhisperLoadOptions('cpu'), 'an unsupported device is refused, not guessed');
}
assert(/207/.test(WHISPER_DOWNLOADS.webgpu) && /77/.test(WHISPER_DOWNLOADS.wasm),
  'truthful approximate first-use sizes: ~207 MB (webgpu), ~77 MB (wasm)');

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
  assert(calls[0].opts.device === 'webgpu' && calls[0].opts.dtype.encoder_model === 'fp32',
    'webgpu attempt carries the approved device/dtype options');
  assert(typeof calls[0].opts.progress_callback === 'function', 'a progress_callback is passed into the attempt');
  assert(statuses.some((s) => s.state === 'loading' && /initializing webgpu/.test(s.detail) && /207/.test(s.detail)),
    'the webgpu attempt announces itself with the truthful ~207 MB first-use size');
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
  assert(statuses.some((s) => /initializing wasm/.test(s.detail) && /77/.test(s.detail)),
    'the wasm attempt announces the truthful ~77 MB first-use size');
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
process.stdout.write(`\n${passed + failed} tests: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
