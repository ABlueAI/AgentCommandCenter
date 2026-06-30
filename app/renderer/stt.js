// Command Center — in-app Speech-to-Text (Whisper, WebGPU).
//
// Push-to-talk dictation that runs Whisper entirely in the renderer on the GPU via
// WebGPU (WASM/CPU fallback). Because the app owns the PTY write channel, the
// transcript is typed straight into the focused agent pane (app.js wires onResult
// -> ptyWrite) — no OS-level dictation tool needed.
//
// The model (~150MB) downloads once from Hugging Face and is cached thereafter.
// ES module; exposes a small API on window.ccSTT for the classic app.js.

import { pipeline, env } from './vendor/transformers.web.min.js';

env.allowLocalModels = false;
env.backends.onnx.wasm.numThreads = 1;

const MODEL_ID = 'onnx-community/whisper-base.en';

let asr = null;        // loaded pipeline
let loading = null;
let recording = false;
let busy = false;      // transcribing
let statusCb = null;
let resultCb = null;

let stream = null;     // MediaStream
let recorder = null;   // MediaRecorder
let chunks = [];

function setStatus(state, detail) { if (statusCb) try { statusCb({ state, detail }); } catch {} }

// --- model load (lazy; webgpu, wasm fallback) ---------------------------------
async function ensureModel() {
  if (asr) return asr;
  if (loading) return loading;
  loading = (async () => {
    setStatus('loading', 'first run downloads the speech model (~150MB)…');
    try {
      asr = await pipeline('automatic-speech-recognition', MODEL_ID, {
        device: 'webgpu',
        dtype: { encoder_model: 'fp32', decoder_model_merged: 'q4' },
      });
    } catch (e) {
      setStatus('loading', 'WebGPU unavailable — using CPU/WASM…');
      asr = await pipeline('automatic-speech-recognition', MODEL_ID, { device: 'wasm', dtype: 'q8' });
    }
    setStatus('idle');
    return asr;
  })();
  try { return await loading; } finally { loading = null; }
}

// --- audio helpers ------------------------------------------------------------
// Whisper wants 16 kHz mono Float32. Decode the recorded clip and resample.
async function toPcm16k(blob) {
  const buf = await blob.arrayBuffer();
  const ac = new (window.AudioContext || window.webkitAudioContext)();
  const decoded = await ac.decodeAudioData(buf);
  try { await ac.close(); } catch {}
  const frames = Math.max(1, Math.ceil(decoded.duration * 16000));
  const off = new OfflineAudioContext(1, frames, 16000);
  const src = off.createBufferSource();
  src.buffer = decoded;
  src.connect(off.destination);
  src.start();
  const rendered = await off.startRendering();
  return rendered.getChannelData(0);
}

// --- record / transcribe ------------------------------------------------------
async function start() {
  if (recording || busy) return;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (e) {
    setStatus('error', 'microphone unavailable: ' + (e && e.message));
    return;
  }
  chunks = [];
  recorder = new MediaRecorder(stream);
  recorder.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
  recorder.start();
  recording = true;
  setStatus('recording');
}

async function stopAndTranscribe() {
  if (!recording) return '';
  recording = false;
  busy = true;
  setStatus('transcribing', 'thinking…');
  await new Promise((res) => { recorder.onstop = res; try { recorder.stop(); } catch { res(); } });
  try { stream.getTracks().forEach((t) => t.stop()); } catch {}

  let text = '';
  try {
    const blob = new Blob(chunks, { type: (recorder && recorder.mimeType) || 'audio/webm' });
    if (blob.size > 0) {
      const pcm = await toPcm16k(blob);
      const model = await ensureModel();
      const out = await model(pcm);
      text = ((out && out.text) || '').trim();
    }
  } catch (e) {
    setStatus('error', 'transcription failed: ' + (e && e.message));
    busy = false;
    return '';
  }
  busy = false;
  setStatus('idle');
  if (text && resultCb) { try { resultCb(text); } catch {} }
  return text;
}

// Toggle: first press records, second press stops + transcribes + emits the text.
async function toggle() {
  if (recording) return stopAndTranscribe();
  return start();
}

window.ccSTT = {
  toggle,
  isRecording: () => recording,
  isBusy: () => busy,
  onStatus: (cb) => { statusCb = cb; },
  onResult: (cb) => { resultCb = cb; },
};

window.dispatchEvent(new CustomEvent('cc-stt-ready'));
