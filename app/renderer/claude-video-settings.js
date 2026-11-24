'use strict';
// S54: the Claude Video Scout sampling settings (Blue's approved design, D-065). Every default
// below is a setting the user can change in the Video Scout modal. Dual browser-<script>/CommonJS
// module, like analysis-focus.js: the renderer uses it for immediate feedback and to remember the
// user's values; MAIN re-runs normalizeClaudeVideoSettings as the real enforcement boundary, so a
// modified renderer can't send an out-of-range value. Out-of-range values are refused with a
// message, never clamped silently.

const CLAUDE_VIDEO_SETTINGS = Object.freeze({
  // Downscale every frame so its long edge is at most this many pixels (about 300 tokens at 640).
  longEdge: Object.freeze({ default: 640, min: 320, max: 1280, integer: true, label: 'Frame size (long edge, px)' }),
  // Detail mode (off by default) sends frames at this size instead, for screen recordings and
  // tutorials where small on-screen text matters (about 1,200 tokens a frame at 1280). Mako
  // downloads at most 1280 px on either side, and FFmpeg never upscales, so 1280 is the ceiling.
  detailLongEdge: Object.freeze({ default: 1280, min: 640, max: 1280, integer: true, label: 'Detail mode frame size (long edge, px)' }),
  // Keep a frame when FFmpeg's scene score is above this (0 = identical, 1 = completely different).
  sceneThreshold: Object.freeze({ default: 0.3, min: 0.05, max: 0.9, integer: false, label: 'Scene-change threshold' }),
  // ...plus at least one frame every this many seconds, so nothing long is missed.
  maxGapSeconds: Object.freeze({ default: 10, min: 1, max: 600, integer: true, label: 'At least one frame every (seconds)' }),
  // Drop a frame whose 64-bit perceptual hash is within this many bits of the last kept frame.
  dedupeDistance: Object.freeze({ default: 5, min: 0, max: 32, integer: true, label: 'Near-duplicate distance (bits of 64)' }),
  // Cap on frames sent for one video, and per Claude request; more frames are split into batches.
  maxFrames: Object.freeze({ default: 120, min: 1, max: 500, integer: true, label: 'Frame cap per video' }),
  framesPerRequest: Object.freeze({ default: 60, min: 1, max: 100, integer: true, label: 'Frames per Claude request' }),
  // Longest video accepted, a resource bound for the download and local Whisper (not a token cap).
  maxMinutes: Object.freeze({ default: 60, min: 1, max: 120, integer: true, label: 'Longest video (minutes)' }),
});

function defaultClaudeVideoSettings() {
  const out = { detailMode: false };
  for (const [key, spec] of Object.entries(CLAUDE_VIDEO_SETTINGS)) out[key] = spec.default;
  return out;
}

// Returns { ok: true, settings } or { ok: false, error }. A missing field takes its default; a
// present field must be a number in range (an integer where the spec says so), and detailMode a
// boolean. Unknown fields are refused, so a typo can't silently do nothing.
function normalizeClaudeVideoSettings(raw) {
  if (raw === undefined || raw === null) return { ok: true, settings: defaultClaudeVideoSettings() };
  if (typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, error: 'Claude Video Scout settings must be an object.' };
  const settings = defaultClaudeVideoSettings();
  for (const key of Object.keys(raw)) {
    if (key !== 'detailMode' && !Object.prototype.hasOwnProperty.call(CLAUDE_VIDEO_SETTINGS, key)) {
      return { ok: false, error: `Unknown Claude Video Scout setting: ${String(key).slice(0, 40)}.` };
    }
  }
  if (raw.detailMode !== undefined) {
    if (typeof raw.detailMode !== 'boolean') return { ok: false, error: 'Detail mode must be on or off.' };
    settings.detailMode = raw.detailMode;
  }
  for (const [key, spec] of Object.entries(CLAUDE_VIDEO_SETTINGS)) {
    if (raw[key] === undefined) continue;
    const value = raw[key];
    if (typeof value !== 'number' || !Number.isFinite(value) || value < spec.min || value > spec.max ||
        (spec.integer && !Number.isInteger(value))) {
      return {
        ok: false,
        error: `${spec.label} must be ${spec.integer ? 'a whole number' : 'a number'} from ${spec.min} to ${spec.max}.`,
      };
    }
    settings[key] = value;
  }
  if (settings.detailLongEdge < settings.longEdge) {
    return { ok: false, error: 'Detail mode frame size cannot be smaller than the standard frame size.' };
  }
  return { ok: true, settings };
}

if (typeof module !== 'undefined') {
  module.exports = { CLAUDE_VIDEO_SETTINGS, defaultClaudeVideoSettings, normalizeClaudeVideoSettings };
} else {
  window.claudeVideoSettings = { CLAUDE_VIDEO_SETTINGS, defaultClaudeVideoSettings, normalizeClaudeVideoSettings };
}
