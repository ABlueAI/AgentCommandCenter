// Command Center — in-app Text-to-Speech (Kokoro, WebGPU).
//
// Runs the 82M Kokoro TTS model entirely in the renderer on the GPU via WebGPU
// (falls back to WASM/CPU). The model (~80MB, q8) downloads once from Hugging Face
// and is cached by the browser thereafter. The ONNX runtime itself is vendored
// locally (vendor/ort/), so only the model is fetched over the network.
//
// This is an ES module; it exposes a small API on window.ccTTS for the classic
// app.js to call. Nothing here speaks automatically — the UI drives it.

import { KokoroTTS, env } from './vendor/kokoro.web.js';

// --- runtime config -----------------------------------------------------------
// The model is fetched from Hugging Face on first run and cached by the browser
// thereafter. The ONNX-runtime WASM is fetched from jsdelivr (transformers.js's
// default) rather than vendored, because Chromium blocks fetch() of file:// URLs
// from a file:// page — the CDN path is the reliable one and is also cached.
env.allowLocalModels = false;
env.backends.onnx.wasm.numThreads = 1;                // avoid SharedArrayBuffer / COOP needs

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
let genStop = false;   // request to abort the current generation loop
let statusCb = null;

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
    setStatus('loading', 'first run downloads the voice model (~80MB)…');
    try {
      tts = await KokoroTTS.from_pretrained(MODEL_ID, { dtype: 'q8', device: 'webgpu' });
    } catch (e) {
      setStatus('loading', 'WebGPU unavailable — using CPU/WASM…');
      tts = await KokoroTTS.from_pretrained(MODEL_ID, { dtype: 'q8', device: 'wasm' });
    }
    setStatus('idle');
    return tts;
  })();
  try { return await loading; } finally { loading = null; }
}

// --- Web Audio playback queue (gap-less, natural pitch) -----------------------
let audioCtx = null;
let scheduled = [];
let nextStart = 0;
function ctx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}
function enqueue(float32, sampleRate) {
  const ac = ctx();
  const buf = ac.createBuffer(1, float32.length, sampleRate || 24000);
  buf.copyToChannel(float32, 0);
  const src = ac.createBufferSource();
  src.buffer = buf;
  src.connect(ac.destination);
  const startAt = Math.max(ac.currentTime + 0.02, nextStart);
  src.start(startAt);
  nextStart = startAt + buf.duration;
  scheduled.push(src);
  src.onended = () => { scheduled = scheduled.filter((s) => s !== src); };
}

// --- speak / stop -------------------------------------------------------------
async function speak(rawText) {
  const text = cleanText(rawText);
  if (!text) { setStatus('idle', 'nothing to speak'); return; }
  stop();
  try {
    await ensureModel();
  } catch (e) { setStatus('error', 'could not load the voice model: ' + (e && e.message)); return; }

  speaking = true; genStop = false;
  setStatus('speaking');
  const ac = ctx();
  if (ac.state === 'suspended') { try { await ac.resume(); } catch {} }
  nextStart = ac.currentTime + 0.05;

  // Synthesize sentence-by-sentence so audio starts quickly and stays ahead of playback.
  try {
    for (const chunk of chunksOf(text)) {
      if (genStop) break;
      const a = await tts.generate(chunk, { voice, speed });
      if (genStop) break;
      if (a && a.audio) enqueue(a.audio, a.sampling_rate);
    }
  } catch (e) {
    if (!genStop) setStatus('error', 'speech failed: ' + (e && e.message));
  }
  // let the scheduled audio finish before going idle
  const remainMs = Math.max(0, (nextStart - ctx().currentTime) * 1000);
  await new Promise((r) => setTimeout(r, remainMs + 60));
  if (!genStop) { speaking = false; setStatus('idle'); }
}

function stop() {
  genStop = true;
  speaking = false;
  for (const s of scheduled) { try { s.stop(); } catch {} }
  scheduled = [];
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
  isSpeaking: () => speaking,
  onStatus: (cb) => { statusCb = cb; },
};

// Let the classic app.js know the API is available (module scripts run after app.js).
window.dispatchEvent(new CustomEvent('cc-tts-ready'));
