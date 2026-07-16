// Command Center — in-app Speech-to-Text (Whisper; WebGPU first, WASM fallback).
//
// Push-to-talk dictation that runs Whisper entirely in the renderer. First click starts
// recording immediately; second click stops, produces ONE finalized transcript (no
// changing partials), and app.js delivers it to the pane that was LOCKED when recording
// started (see stt-target-lock.js — never "whichever pane is focused now").
//
// Packaging (the bug this file repairs): the previous import pointed at
// ./vendor/transformers.web.min.js, which does not exist in the repo — the module died at
// import time, window.ccSTT was never assigned, and Dictate was a hollow control. That
// distribution is also the WRONG one for a raw <script type="module"> renderer (it
// contains bare imports). The official standalone browser ESM bundle below is the
// correct raw-file entry point, and @huggingface/transformers is a real, declared
// dependency (app/package.json) — nothing vendored, nothing rewritten.
//
// First use downloads the model from Hugging Face (WebGPU ~207 MB; WASM q8 ~77 MB) with
// visible, throttled progress in the Dictate status; Chromium caches it thereafter.
// ES module; exposes a small API on window.ccSTT for the classic app.js.

import { pipeline, env } from '../node_modules/@huggingface/transformers/dist/transformers.min.js';
import { configureSttEnv } from './stt-env-config.js';
import { createWhisperLoader, describeWhisperDtype, WHISPER_DOWNLOADS } from './stt-bootstrap.js';

// Throws on a wrong/incomplete distribution. An import-time throw here is CAUGHT by
// app.js's module-failure handler (audioModuleFromFailure recognizes this file's name),
// so the refusal is visible in the control strip and Logs, never a silent dead button.
configureSttEnv(env);

const loadWhisper = createWhisperLoader(pipeline);

let asr = null;         // resolved pipeline (only ever set from a RESOLVED bootstrap)
let loading = null;     // in-flight load promise
let activeDevice = '';  // backend that actually initialized ('' until proven)
let recording = false;
let busy = false;       // transcribing
let statusCb = null;
let resultCb = null;

let stream = null;      // MediaStream
let recorder = null;    // MediaRecorder
let chunks = [];

function setStatus(state, detail) { if (statusCb) try { statusCb({ state, detail }); } catch {} }

// --- model load (lazy; webgpu -> wasm via the tested bootstrap contract) --------
async function ensureModel() {
  if (asr) return asr;
  if (loading) return loading;
  loading = (async () => {
    setStatus('loading', `first use downloads the speech model (WebGPU ${WHISPER_DOWNLOADS.webgpu}; WASM ${WHISPER_DOWNLOADS.wasm})…`);
    // createWhisperLoader: webgpu-then-wasm with a VISIBLE fallback status, throttled
    // download progress on both attempts, falsy-result-is-failure, and a combined
    // both-backends error. activeDevice is set only after a pipeline actually resolves.
    const model = await loadWhisper({
      onStatus: setStatus,
      onSelected: (device) => { activeDevice = device; },
    });
    asr = model;
    setStatus('loading', `model ready — Whisper base.en · ${activeDevice}/${describeWhisperDtype(activeDevice)}`);
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
  setStatus('transcribing', 'finalizing recording…');
  await new Promise((res) => { recorder.onstop = res; try { recorder.stop(); } catch { res(); } });
  try { stream.getTracks().forEach((t) => t.stop()); } catch {}

  let text = '';
  try {
    const blob = new Blob(chunks, { type: (recorder && recorder.mimeType) || 'audio/webm' });
    if (blob.size > 0) {
      const pcm = await toPcm16k(blob);
      const model = await ensureModel();
      setStatus('transcribing', `Whisper base.en · ${activeDevice}/${describeWhisperDtype(activeDevice)}…`);
      const out = await model(pcm);
      text = ((out && out.text) || '').trim();
    }
  } catch (e) {
    // Bounded, honest failure. The bootstrap's combined error already names BOTH
    // attempted backends with their reasons; anything else is a transcription failure.
    const msg = String((e && e.message) || e).slice(0, 300);
    setStatus('error', msg.startsWith('speech model failed') ? msg : 'transcription failed: ' + msg);
    busy = false;
    return '';
  }
  busy = false;
  setStatus('idle');
  // The transcript text goes ONLY to the onResult consumer (app.js delivers it to the
  // locked pane). It is never logged or included in any status detail from here.
  if (text && resultCb) { try { resultCb(text); } catch {} }
  return text;
}

// Toggle: first press records immediately, second press stops + transcribes + emits the text.
async function toggle() {
  if (recording) return stopAndTranscribe();
  return start();
}

window.ccSTT = {
  toggle,
  isRecording: () => recording,
  isBusy: () => busy,
  getBackend: () => activeDevice,
  onStatus: (cb) => { statusCb = cb; },
  onResult: (cb) => { resultCb = cb; },
};

window.dispatchEvent(new CustomEvent('cc-stt-ready'));
