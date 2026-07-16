// Command Center — in-app Text-to-Speech (Kokoro, WebGPU).
//
// Runs the 82M Kokoro TTS model entirely in the renderer on the GPU via WebGPU
// (fp32, with a q8 WASM/CPU fallback). The selected model files download once from
// Hugging Face and are cached by Chromium. The ONNX runtime itself is vendored
// locally (vendor/ort/), so only the model is fetched over the network.
//
// This is an ES module; it exposes a small API on window.ccTTS for the classic
// app.js to call. Nothing here speaks automatically — the UI drives it.

import { KokoroTTS } from './vendor/kokoro.web.js';
import { bootstrapModel } from './tts-bootstrap.js';
import { getKokoroLoadOptions } from './tts-device-config.js';
import { validateKokoroAudio } from './tts-audio-contract.js';
import { encodeWavBytes } from './wav-encode.js';
import { createPlaybackQueue } from './tts-playback-queue.js';

// --- runtime config -----------------------------------------------------------
// The model is fetched from Hugging Face on first run and cached by the browser
// thereafter. The ONNX-runtime WASM is fetched from jsdelivr (transformers.js's
// default) rather than vendored, because Chromium blocks fetch() of file:// URLs
// from a file:// page — the CDN path is the reliable one and is also cached.
//
// No env.* knobs are set here: the tracked vendor/kokoro.web.js bundle exports a
// minimal `env` shim (only a `wasmPaths` getter/setter) rather than the full
// transformers.js Env class. Earlier code assumed `env.backends.onnx.wasm.numThreads`
// existed on that shim; it doesn't, so the assignment threw at module top-level and
// took window.ccTTS down with it before it was ever assigned. Not setting numThreads
// is also not a functional loss — the bundle already defaults it to 1 outside
// crossOriginIsolated contexts, which this app's file:// origin always is.

const MODEL_ID = 'onnx-community/Kokoro-82M-v1.0-ONNX';

// Curated voices (Kokoro v1.0). Warm deep males first — the requested narrator feel.
const VOICES = [
  { id: 'am_michael', label: 'Michael — warm US male' },
  { id: 'am_onyx',    label: 'Onyx — deep US male' },
  { id: 'am_fenrir',  label: 'Fenrir — deep US male' },
  { id: 'am_eric',    label: 'Eric — US male' },
  { id: 'am_adam',    label: 'Adam — US male' },
  { id: 'bm_george',  label: 'George — deep UK male' },
  { id: 'bm_lewis',   label: 'Lewis — UK male' },
  { id: 'bm_daniel',  label: 'Daniel — UK male' },
  { id: 'af_heart',   label: 'Heart — US female' },
  { id: 'bf_emma',    label: 'Emma — UK female' },
];

let tts = null;        // loaded model
let loading = null;    // in-flight load promise
let voice = 'am_michael';
let speed = 1.0;
let speaking = false;
let requestId = 0;     // monotonic cancellation token; only latest may enqueue
let statusCb = null;
let activeDevice = '';

// --- status -------------------------------------------------------------------
function setStatus(state, detail) { if (statusCb) try { statusCb({ state, detail }); } catch {} }

// --- text cleaning: turn rendered terminal text into speakable prose ----------
// Strips ANSI, box-drawing, spinners, and tool/bullet markers; drops noise lines;
// keeps substantive content (light cleaning, per the design — completeness > brevity).
function cleanText(raw) {
  if (!raw) return '';
  const stripped = String(raw)
    .replace(/\x1b\[[0-9;?]*[ -\/]*[@-~]/g, '')      // ANSI CSI escapes
    .replace(/[─-▟]/g, ' ')                 // box-drawing + block elements
    .replace(/[⠀-⣿]/g, '')                  // braille (spinner frames)
    .replace(/[⌀-⏿■-◿⬀-⯿]/g, ''); // technical/geometric markers (●⏺⎿…)
  const lines = stripped.split(/\r?\n/)
    .map((l) => l.replace(/^[\s>#•*\-–—]+/, '').replace(/[ \t]+/g, ' ').trim())
    .filter((l) => /[A-Za-z0-9]/.test(l));            // keep only lines with real content
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

// Split cleaned text into sentence-ish chunks for responsive, gap-less playback.
function chunksOf(text) {
  return text
    .split(/\n+/)
    .flatMap((para) => para.match(/[^.!?]+[.!?]*\s*/g) || [para])
    .map((s) => s.trim())
    .filter(Boolean);
}

// --- model load (lazy; webgpu with wasm fallback) -----------------------------
async function ensureModel() {
  if (tts) return tts;
  if (loading) return loading;
  loading = (async () => {
    setStatus('loading', 'first run downloads the voice model (WebGPU ~326MB; WASM ~92MB)…');
    tts = await bootstrapModel(
      (device) => KokoroTTS.from_pretrained(MODEL_ID, getKokoroLoadOptions(device)),
      { onStatus: setStatus, onSelected: (device) => { activeDevice = device; } },
    );
    const options = getKokoroLoadOptions(activeDevice);
    setStatus('ready', `English · ${activeDevice}/${options.dtype}`);
    return tts;
  })();
  try { return await loading; } finally { loading = null; }
}

// --- Fast Clear playback (pitch-preserving media elements) ---------------------
// Kokoro ALWAYS synthesizes at natural speed 1.0 for full articulation; the selected
// speed is applied as HTMLAudioElement.playbackRate with preservesPitch, so 2x is
// Chromium's native pitch-preserving time compression instead of the model tripping
// over compressed phoneme timing (the Fast Clear defect). Each speak() request owns
// one sequential queue (tts-playback-queue.js); PCM is wrapped as an in-memory WAV
// blob (wav-encode.js). Probed on Electron 42.5.0: unprefixed preservesPitch is
// supported and a click-then-synthesis-delayed play() resolves.
let activeQueue = null;

function disposeActiveQueue() {
  if (activeQueue) {
    activeQueue.stop(); // pauses the live element, revokes every outstanding blob URL
    activeQueue = null;
  }
}

function makeQueue(mine) {
  return createPlaybackQueue({
    createAudio: (url) => new Audio(url),
    createObjectUrl: (bytes) => URL.createObjectURL(new Blob([bytes], { type: 'audio/wav' })),
    revokeObjectUrl: (url) => URL.revokeObjectURL(url),
    // Listening speed, read when each chunk STARTS (a mid-speech change applies from
    // the next chunk) — never a synthesis input.
    getPlaybackRate: () => speed,
    onError: (reason) => {
      // The queue's single failure path; only the owning (latest) request may show it,
      // and nothing later overwrites it with idle (see the outcome check in speak()).
      if (mine === requestId) { speaking = false; setStatus('error', 'speech playback failed: ' + reason); }
    },
  });
}

// --- speak / stop -------------------------------------------------------------
async function speak(rawText) {
  const text = cleanText(rawText);
  if (!text) { setStatus('idle', 'nothing to speak'); return; }
  const mine = ++requestId;
  disposeActiveQueue(); // latest request wins: silence and settle the old queue now
  speaking = false;
  try {
    await ensureModel();
  } catch (e) {
    if (mine === requestId) setStatus('error', 'could not load the voice model: ' + (e && e.message));
    return;
  }

  if (mine !== requestId) return;
  const options = getKokoroLoadOptions(activeDevice);
  setStatus('synthesizing', `English · ${voice} · ${activeDevice}/${options.dtype}`);
  const queue = makeQueue(mine);
  activeQueue = queue;

  // Synthesize sentence-by-sentence so audio starts quickly and stays ahead of playback.
  try {
    let firstAudio = true;
    for (const chunk of chunksOf(text)) {
      if (mine !== requestId) return;
      // ALWAYS natural synthesis speed: fully articulated speech; the user's speed is
      // playback-rate only (the Fast Clear invariant).
      const a = await tts.generate(chunk, { voice, speed: 1.0 });
      if (mine !== requestId) return; // stale generation can never enqueue
      const audio = validateKokoroAudio(a);
      queue.enqueue(encodeWavBytes(audio.samples, audio.sampleRate));
      if (firstAudio) {
        firstAudio = false;
        speaking = true;
        setStatus('speaking', `English · ${voice} · ${activeDevice}/${options.dtype}`);
      }
    }
  } catch (e) {
    speaking = false;
    queue.end(); // let already-queued audio drain; URLs are revoked either way
    if (mine === requestId) setStatus('error', 'speech failed: ' + (e && e.message));
    return;
  }
  queue.end();
  const outcome = await queue.done; // resolves once: completed | stopped | failed
  if (mine !== requestId) return;   // a newer request owns the status line now
  speaking = false;
  // idle ONLY after a successful drain — a failure stays visible (onError set it),
  // and stop() already reported idle itself.
  if (outcome === 'completed') setStatus('idle');
}

function stop() {
  requestId++;
  speaking = false;
  disposeActiveQueue(); // immediately pauses the active element and clears the queue
  setStatus('idle');
}

// --- public API (consumed by app.js) ------------------------------------------
window.ccTTS = {
  speak,
  stop,
  cleanText,
  voices: VOICES,
  setVoice: (v) => { if (v) voice = v; },
  getVoice: () => voice,
  setSpeed: (s) => { speed = Math.min(2, Math.max(0.5, Number(s) || 1)); },
  getSpeed: () => speed,
  getBackend: () => activeDevice,
  isSpeaking: () => speaking,
  onStatus: (cb) => { statusCb = cb; },
};

// Let the classic app.js know the API is available (module scripts run after app.js).
window.dispatchEvent(new CustomEvent('cc-tts-ready'));
