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
// First use downloads the large-v3-turbo model from Hugging Face (WebGPU fp16 ~1.6 GB;
// WASM q8 ~1.1 GB) with
// visible, throttled progress in the Dictate status; Chromium caches it thereafter.
// ES module; exposes a small API on window.ccSTT for the classic app.js.

import { pipeline, env } from '../node_modules/@huggingface/transformers/dist/transformers.min.js';
import { configureSttEnv } from './stt-env-config.js';
import {
  createWhisperLoader,
  describeTranscriptionError,
  describeWhisperDtype,
  pcm16leToFloat32,
  getWhisperTranscriptionOptions,
  WHISPER_DOWNLOADS,
  WHISPER_MODEL_ID,
} from './stt-bootstrap.js';
import {
  MIC_CONSTRAINTS,
  analyzePcm,
  assertUsableCapture,
  getRecorderOptions,
} from './stt-audio-quality.js';

// Throws on a wrong/incomplete distribution. An import-time throw here is CAUGHT by
// app.js's module-failure handler (audioModuleFromFailure recognizes this file's name),
// so the refusal is visible in the control strip and Logs, never a silent dead button.
configureSttEnv(env);

const loadWhisper = createWhisperLoader(pipeline);

let asr = null;         // resolved pipeline (only ever set from a RESOLVED bootstrap)
let loading = null;     // in-flight load promise
let activeDevice = '';  // backend that actually initialized ('' until proven)
let recording = false;
let videoBusy = false;
let busy = false;       // transcribing
let statusCb = null;
let resultCb = null;

let stream = null;      // MediaStream
let recorder = null;    // MediaRecorder
let chunks = [];

function setStatus(state, detail) { if (statusCb) try { statusCb({ state, detail }); } catch {} }

// --- model load (lazy; webgpu -> wasm via the tested bootstrap contract) --------
async function ensureModel(reportStatus = setStatus) {
  if (asr) return asr;
  if (loading) return loading;
  loading = (async () => {
    reportStatus('loading', `first use downloads the speech model (WebGPU ${WHISPER_DOWNLOADS.webgpu}; WASM ${WHISPER_DOWNLOADS.wasm})…`);
    // createWhisperLoader: webgpu-then-wasm with a VISIBLE fallback status, throttled
    // download progress on both attempts, falsy-result-is-failure, and a combined
    // both-backends error. activeDevice is set only after a pipeline actually resolves.
    const model = await loadWhisper({
      onStatus: reportStatus,
      onSelected: (device) => { activeDevice = device; },
    });
    asr = model;
    reportStatus('loading', `model ready — Whisper large-v3-turbo · ${activeDevice}/${describeWhisperDtype(activeDevice)}`);
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
  if (videoBusy) {
    setStatus('error', 'Whisper is transcribing a Video Scout clip. Try again when it finishes.');
    return;
  }
  try {
    stream = await navigator.mediaDevices.getUserMedia(MIC_CONSTRAINTS);
  } catch (e) {
    setStatus('error', 'microphone unavailable: ' + (e && e.message));
    return;
  }
  if (videoBusy) {
    stream.getTracks().forEach((track) => track.stop());
    stream = null;
    setStatus('error', 'Whisper is transcribing a Video Scout clip. Try again when it finishes.');
    return;
  }
  chunks = [];
  recorder = new MediaRecorder(stream, getRecorderOptions(MediaRecorder));
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
      const capture = assertUsableCapture(analyzePcm(pcm, 16000));
      const model = await ensureModel();
      const captureNote = capture.quality === 'clipping'
        ? 'capture clipping detected'
        : `capture ${capture.durationSeconds.toFixed(1)}s`;
      setStatus('transcribing', `Whisper large-v3-turbo · ${activeDevice}/${describeWhisperDtype(activeDevice)} · ${captureNote}…`);
      const out = await model(pcm, getWhisperTranscriptionOptions());
      text = ((out && out.text) || '').trim();
    }
  } catch (e) {
    // Bounded, honest failure. The bootstrap's combined error already names BOTH
    // attempted backends with their reasons; anything else is a transcription failure.
    setStatus('error', describeTranscriptionError(e));
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

// Video Scout supplies PCM decoded by FFmpeg. It shares the same downloaded Whisper
// model as Dictate, without opening the microphone or posting to its locked target pane.
async function transcribeVideoPcm(bytes, onProgress) {
  if (videoBusy || recording || busy) return { ok: false, error: 'busy' };
  const pcm = pcm16leToFloat32(bytes);
  if (!pcm) return { ok: false, error: 'failed', detail: 'the audio was not whole 16-bit samples' };
  videoBusy = true;
  try {
    const model = await ensureModel((_state, detail) => onProgress(detail));
    onProgress(`Whisper large-v3-turbo · ${activeDevice}/${describeWhisperDtype(activeDevice)}`);
    const options = getWhisperTranscriptionOptions();
    delete options.language; // The source video can be in a different language.
    const output = await model(pcm, options);
    if (typeof output?.text !== 'string') return { ok: false, error: 'failed', detail: 'Whisper returned no text' };
    return { ok: true, text: output.text.trim() };
  } catch (e) {
    // Same bounded wording Dictate shows, so a model that fails to load says why.
    return { ok: false, error: 'failed', detail: describeTranscriptionError(e) };
  } finally {
    videoBusy = false;
  }
}

window.ccSTT = {
  transcribeVideoPcm,
  toggle,
  isRecording: () => recording,
  isBusy: () => busy,
  getModel: () => WHISPER_MODEL_ID,
  getBackend: () => activeDevice,
  onStatus: (cb) => { statusCb = cb; },
  onResult: (cb) => { resultCb = cb; },
};

window.dispatchEvent(new CustomEvent('cc-stt-ready'));
