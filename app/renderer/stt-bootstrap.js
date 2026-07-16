// Whisper bootstrap contract — device options, truthful download sizes, throttled
// progress reporting, and the webgpu→wasm loader — pulled out of stt.js so every piece is
// unit-testable without a browser, a real model download, or a microphone. stt.js supplies
// the real `pipeline` function; tests supply stubs. The device-fallback loop itself is
// REUSED from tts-bootstrap.js (bootstrapModel): same visible-fallback, falsy-is-failure,
// name-every-failed-device semantics the TTS repair already proved.

import { bootstrapModel } from './tts-bootstrap.js';

export const WHISPER_MODEL_ID = 'onnx-community/whisper-large-v3-turbo';

// Truthful approximate FIRST-USE download sizes for whisper-large-v3-turbo at these dtypes.
// Shown in the UI before/while downloading; Chromium caches afterwards.
export const WHISPER_DOWNLOADS = { webgpu: '~1.6 GB', wasm: '~1.1 GB' };

// Whisper model settings per browser backend. WebGPU runs the encoder and merged decoder
// in fp16; the WASM/CPU fallback uses q8 end-to-end for a smaller download
// and workable CPU speed. Pure, so the contract is directly assertable.
export function getWhisperLoadOptions(device) {
  if (device === 'webgpu') return { device: 'webgpu', dtype: { encoder_model: 'fp16', decoder_model_merged: 'fp16' } };
  if (device === 'wasm') return { device: 'wasm', dtype: 'q8' };
  throw new Error(`Unsupported Whisper device: ${device}`);
}

export function describeWhisperDtype(device) {
  const { dtype } = getWhisperLoadOptions(device);
  return typeof dtype === 'string' ? dtype : `${dtype.encoder_model}+${dtype.decoder_model_merged}`;
}

export function getWhisperTranscriptionOptions() {
  return {
    language: 'english',
    task: 'transcribe',
    chunk_length_s: 30,
    stride_length_s: 5,
    return_timestamps: false,
    do_sample: false,
    num_beams: 3,
  };
}

// Status lines may name WHICH file is downloading, but bounded: base name only (no
// paths), control characters stripped, hard length cap. Never file contents.
const FILE_NAME_MAX = 60;
export function boundedFileName(file) {
  const base = String(file == null ? '' : file).split(/[\\/]/).pop() || '';
  const clean = base.replace(/[\x00-\x1F\x7F]/g, '').trim();
  if (!clean) return 'model file';
  return clean.length > FILE_NAME_MAX ? `${clean.slice(0, FILE_NAME_MAX)}…` : clean;
}

// Turn transformers.js progress_callback events into a small stream of human status
// lines. Repetitive 'progress' events are throttled (default one per 250 ms) so the UI
// is not flooded; state TRANSITIONS (initiate/download/done/ready) always pass
// immediately. Only a bounded filename and a rounded, clamped percentage ever leave this
// function — never model contents, raw event objects, audio, or text.
export function createProgressReporter(report, { intervalMs = 250, now = Date.now } = {}) {
  let lastProgressAt = -Infinity; // "never reported": the FIRST progress event always shows
  return (event) => {
    if (!event || typeof event !== 'object') return;
    const file = boundedFileName(event.file || event.name);
    switch (event.status) {
      case 'initiate':
        report(`fetching ${file}…`);
        return;
      case 'download':
        report(`downloading ${file}…`);
        return;
      case 'progress': {
        const t = now();
        if (t - lastProgressAt < intervalMs) return; // throttled: bounded UI churn
        lastProgressAt = t;
        const pct = Number(event.progress);
        if (Number.isFinite(pct)) report(`downloading ${file} — ${Math.round(Math.min(100, Math.max(0, pct)))}%`);
        else report(`downloading ${file}…`);
        return;
      }
      case 'done':
        lastProgressAt = -Infinity; // next file's first progress event shows immediately
        report(`${file} complete`);
        return;
      case 'ready':
        report('model ready');
        return;
      default:
        return; // unknown event shapes are ignored, never dumped to the UI
    }
  };
}

// Build the real loader stt.js uses: webgpu first, visible fallback to wasm, progress on
// BOTH attempts, and no success claim until the pipeline promise actually resolves
// (bootstrapModel additionally treats a falsy resolution as failure and, when every
// device fails, throws one error naming each device with its bounded reason).
export function createWhisperLoader(pipelineFn, { modelId = WHISPER_MODEL_ID, intervalMs, now } = {}) {
  return function loadWhisper({ onStatus, onSelected } = {}) {
    const report = (text) => { if (onStatus) onStatus('loading', text); };
    const progress = createProgressReporter(report, { intervalMs, now });
    return bootstrapModel(
      (device) => {
        report(`initializing ${device} — first use downloads ${WHISPER_DOWNLOADS[device]}…`);
        return pipelineFn('automatic-speech-recognition', modelId, {
          ...getWhisperLoadOptions(device),
          progress_callback: progress,
        });
      },
      { onStatus, onSelected, label: 'speech model' },
    );
  };
}
