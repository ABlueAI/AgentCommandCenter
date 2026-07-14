'use strict';
// Pure helper for building the video-scout (feed-gemini.ps1) launch args from renderer-supplied
// Gemini options (videoModel / mediaResolution). Kept dependency-free (no electron, no fs) so it
// can be unit tested with plain node, matching the pty-parser.js / pty-parser.test.js convention.
// This module changes no runtime behavior on its own — main.js decides when/whether to call it,
// strictly inside the existing `if (opts.videoScout)` branch of the pty-start handler.
//
// Treat videoModel/mediaResolution as untrusted IPC input, same posture as every other field
// crossing the renderer -> main boundary: validate against an allowlist here, and only push a
// flag to the script when the value passes. An invalid value is dropped (never spliced through)
// so feed-gemini.ps1's own [string]$Model / [ValidateSet]$MediaResolution default applies.

// Server-side allowlist for the Gemini model dropdown. Deliberately a SEPARATE set from
// VALID_MODELS in main.js (the Claude --model allowlist for the --agent <role> path) — the two
// model spaces (Claude models vs Gemini models) never overlap and must not be conflated.
const VALID_VIDEO_MODELS = new Set(['gemini-2.5-flash-lite', 'gemini-2.5-flash', 'gemini-2.5-pro']);
const VALID_MEDIA_RESOLUTIONS = new Set(['LOW', 'MEDIUM', 'HIGH']);
// Must mirror feed-gemini.ps1's [ValidateSet('transcript', 'audio', 'video')]$Mode. All three are
// fully wired in the script (distinct yt-dlp invocations, file patterns, and default briefs).
const VALID_ANALYSIS_MODES = new Set(['transcript', 'audio', 'video']);

// Must mirror feed-gemini.ps1's own parameter defaults (see scripts/feed-gemini.ps1 -Model /
// -MediaResolution). When the caller's choice matches the script's default we omit the flag
// entirely rather than pass it explicitly — keeps the default defined in exactly one place
// (the script), not duplicated here.
const DEFAULT_VIDEO_MODEL = 'gemini-2.5-flash-lite';
const DEFAULT_MEDIA_RESOLUTION = 'MEDIUM';
// The script's own fallback when -Mode is omitted on the -VideoScout path is 'video' (bare
// -VideoScout keeps its historical full-visual-analysis behavior). NOTE this is deliberately NOT
// the modal's default — the modal defaults to 'transcript' (cheapest useful pass) and sends it
// explicitly, so the expensive full-video pass is an opt-in choice, never an accident.
const DEFAULT_ANALYSIS_MODE = 'video';

// Must mirror the YouTube subset of VIDEO_HOSTS in main.js and the host list in
// scripts/lib/get-video-source-route.ps1. The PS function is the routing authority at run time;
// this set only powers the launch-time Logs-tab note so the user sees which path a run will take.
const YOUTUBE_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be']);

// Must mirror feed-gemini.ps1's [ValidateRange(0, 86400)] on -StartOffset/-EndOffset (86400s = 24h).
// Re-enforced here so an out-of-range value is a clean, logged REJECTED note in the Logs tab
// rather than an uncaught PowerShell ValidateRange exception surfacing through the PTY.
const MAX_OFFSET_SECONDS = 86400;

function isValidOffset(n) {
  return typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= MAX_OFFSET_SECONDS;
}

// Describe an arbitrary, untrusted value for an error/log message WITHOUT risking a throw.
// JSON.stringify throws on a BigInt (TypeError: Do not know how to serialize a BigInt) and on a
// cyclic object (TypeError: Converting circular structure to JSON) — either could arrive here as
// an explicit-invalid analysisMode over IPC, and a refusal path must never itself crash. Falls
// back to a short, safe `<typeof: Tag>` description when stringification isn't possible.
function describeInvalidValue(value) {
  try {
    return JSON.stringify(value);
  } catch {
    return `<${typeof value}: ${Object.prototype.toString.call(value)}>`;
  }
}

// Predict which invocation path feed-gemini.ps1 will choose, for Logs-tab visibility. Mirrors
// Resolve-VideoSourceRoute (scripts/lib/get-video-source-route.ps1): YouTube URL + video mode →
// SDK (URL straight into generateContent, no download, no 20MB cap, mediaResolution enforced);
// anything else → CLI (yt-dlp download + gemini @file attach). The app never passes -NoFeed, so
// that branch isn't modeled here.
function predictVideoRoute(videoUrl, analysisMode) {
  const effectiveMode = typeof analysisMode === 'string' && VALID_ANALYSIS_MODES.has(analysisMode)
    ? analysisMode : DEFAULT_ANALYSIS_MODE;
  if (effectiveMode !== 'video') {
    return { route: 'cli', reason: `mode '${effectiveMode}' needs yt-dlp's local output (.srt/.mp3)` };
  }
  let host = null;
  try { host = new URL(videoUrl).hostname.toLowerCase(); } catch { /* malformed → cli */ }
  if (host && YOUTUBE_HOSTS.has(host)) {
    return { route: 'sdk', reason: 'YouTube URL + video mode: Gemini API ingests the URL directly (no download, no 20MB cap, mediaResolution enforced)' };
  }
  return { route: 'cli', reason: `host '${host || 'unparseable'}' is not YouTube; download + CLI attach applies` };
}

// Build the extra argv elements for feed-gemini.ps1 from { videoModel, mediaResolution }.
// Returns { args, notes, error }:
//   args  - argv elements to splice into the PowerShell -File invocation (never a shell string)
//   notes - human-readable strings describing exactly what happened to each field (sent /
//           omitted-as-default / rejected), safe to hand straight to main.js's tlog() so the
//           Logs tab always shows the POST-VALIDATION truth — never implying a choice was
//           honored when it was actually silently dropped.
//   error - null on success; a user-facing string when the launch must be REFUSED. Set by an
//           EXPLICIT invalid analysisMode (a nonempty value that isn't transcript/audio/video —
//           the costliest fallback, so this is fail-closed, not fail-open), or by an OFFSET
//           failure (mode-gate, both-or-neither, type/range, end<=start, or offsets on a source
//           that would route to the CLI/download path). Neither an invalid mode nor a range the
//           user explicitly asked for may be silently dropped or downgraded — main.js surfaces
//           this error and returns { ok:false } instead of spawning. (Allowlist misses on
//           videoModel/mediaResolution are NOT errors: those legitimately fall back to the
//           script's own default, which is a safe no-surprise outcome, unlike a dropped mode or
//           a dropped range.)
function buildVideoScoutArgs({ videoModel, mediaResolution, analysisMode, videoUrl, startOffset, endOffset } = {}) {
  const args = [];
  const notes = [];
  let error = null;

  // Mode validation FIRST, before route prediction or offset evaluation: an explicit invalid
  // mode must never reach the route-note (which would otherwise describe a route that isn't
  // actually going to run) or the offset gate (which resolves an absent/invalid mode to 'video'
  // and would otherwise let an invalid mode ride a range through as if it were video mode).
  const modeGiven = analysisMode !== undefined && analysisMode !== null && analysisMode !== '';
  const modeValid = typeof analysisMode === 'string' && VALID_ANALYSIS_MODES.has(analysisMode);
  if (modeGiven && !modeValid) {
    const described = describeInvalidValue(analysisMode);
    error = `Invalid analysis mode ${described}. Allowed modes: transcript, audio, video. Launch refused.`;
    notes.push(`analysisMode=${described} REJECTED (not in VALID_ANALYSIS_MODES allowlist) — launch refused, no route will run`);
    return { args, notes, error };
  }

  // Route prediction first so it's the first thing the Logs tab shows for the run.
  if (videoUrl) {
    const { route, reason } = predictVideoRoute(videoUrl, analysisMode);
    notes.push(`route=${route.toUpperCase()} (${reason})`);
  }

  if (modeGiven) {
    // modeValid is guaranteed true here (the invalid case returned above).
    if (analysisMode === DEFAULT_ANALYSIS_MODE) {
      notes.push(`analysisMode="${analysisMode}" omitted (matches the script's -VideoScout fallback: full visual analysis)`);
    } else {
      args.push('-Mode', analysisMode);
      notes.push(`analysisMode="${analysisMode}" sent as -Mode (cheaper pass: no visual tokens)`);
    }
  }

  if (videoModel !== undefined && videoModel !== null && videoModel !== '') {
    if (typeof videoModel === 'string' && VALID_VIDEO_MODELS.has(videoModel)) {
      if (videoModel === DEFAULT_VIDEO_MODEL) {
        notes.push(`videoModel="${videoModel}" omitted (matches feed-gemini.ps1's own default)`);
      } else {
        args.push('-Model', videoModel);
        notes.push(`videoModel="${videoModel}" sent as -Model`);
      }
    } else {
      notes.push(`videoModel=${JSON.stringify(videoModel)} REJECTED (not in VALID_VIDEO_MODELS allowlist) — dropped, script default applies`);
    }
  }

  if (mediaResolution !== undefined && mediaResolution !== null && mediaResolution !== '') {
    if (typeof mediaResolution === 'string' && VALID_MEDIA_RESOLUTIONS.has(mediaResolution)) {
      if (mediaResolution === DEFAULT_MEDIA_RESOLUTION) {
        notes.push(`mediaResolution="${mediaResolution}" omitted (matches feed-gemini.ps1's own default)`);
      } else {
        args.push('-MediaResolution', mediaResolution);
        notes.push(`mediaResolution="${mediaResolution}" sent as -MediaResolution (ENFORCED on the SDK/YouTube route via generationConfig; on the CLI fallback it is recorded in the run log only — the CLI has no flag for it)`);
      }
    } else {
      notes.push(`mediaResolution=${JSON.stringify(mediaResolution)} REJECTED (not in VALID_MEDIA_RESOLUTIONS allowlist) — dropped, script default applies`);
    }
  }

  // Section-scoping (videoMetadata start/end offset, SDK/YouTube route only): renderer already
  // validated this (parseTimeToSeconds/resolveVideoRange in app.js), but startOffset/endOffset
  // cross the same untrusted renderer -> main IPC boundary as every other field here, so they get
  // the same independent re-validation posture as videoModel/mediaResolution/analysisMode above —
  // never trust the renderer's check as the actual security/correctness boundary. This runs in the
  // Electron MAIN process (video-scout-args.js is required only from main.js's pty-start handler;
  // the renderer has no require() access under contextIsolation), so a modified or bypassed
  // renderer calling ipcRenderer.invoke('pty-start', {...}) directly still hits this exact check.
  const startGiven = startOffset !== undefined && startOffset !== null && startOffset !== '';
  const endGiven = endOffset !== undefined && endOffset !== null && endOffset !== '';
  if (startGiven || endGiven) {
    // Any failure below sets `error` (launch REFUSED) rather than dropping the range and
    // proceeding whole-video: a user who explicitly asked for a slice must never silently get a
    // whole-video run (and be billed for it). Whole-video is only ever the explicit both-blank path.
    //
    // Mode gate FIRST: offsets are meaningless outside video mode (transcript/audio have no video
    // stream to slice). Compute the EFFECTIVE mode the same way the script itself resolves it — an
    // absent/invalid analysisMode falls back to 'video' (DEFAULT_ANALYSIS_MODE), matching
    // feed-gemini.ps1's own `if (-not $PSBoundParameters.ContainsKey('Mode')) { $Mode = 'video' }`
    // fallback under -VideoScout — so this check can't be bypassed by sending a garbage analysisMode.
    const effectiveAnalysisMode = (typeof analysisMode === 'string' && VALID_ANALYSIS_MODES.has(analysisMode))
      ? analysisMode : DEFAULT_ANALYSIS_MODE;
    if (effectiveAnalysisMode !== 'video') {
      error = `Time range is only valid in video mode (the current mode is "${effectiveAnalysisMode}"). Clear the range, or switch analysis mode to video.`;
      notes.push(`startOffset/endOffset REJECTED: a time range only applies in video mode (effective mode is "${effectiveAnalysisMode}") — launch refused`);
    } else if (startGiven !== endGiven) {
      error = 'Time range needs both a start and an end. Fill in both, or clear both to analyze the whole video.';
      notes.push(`startOffset/endOffset REJECTED: both are required to analyze a range (only one was given) — launch refused`);
    } else if (!isValidOffset(startOffset) || !isValidOffset(endOffset)) {
      error = `Time range must be whole seconds between 0 and ${MAX_OFFSET_SECONDS} (24h). Got start=${JSON.stringify(startOffset)}, end=${JSON.stringify(endOffset)}.`;
      notes.push(`startOffset=${JSON.stringify(startOffset)} endOffset=${JSON.stringify(endOffset)} REJECTED (must be non-negative integers, 0-${MAX_OFFSET_SECONDS}) — launch refused`);
    } else if (endOffset <= startOffset) {
      error = `Time range end (${endOffset}s) must be after start (${startOffset}s).`;
      notes.push(`startOffset=${startOffset} endOffset=${endOffset} REJECTED (end must be strictly after start) — launch refused`);
    } else if (predictVideoRoute(videoUrl, effectiveAnalysisMode).route === 'cli') {
      // Offsets ride on videoMetadata in the SDK/generateContent path, which only exists for
      // YouTube URLs. A non-YouTube source routes to the yt-dlp download + CLI-attach path, which
      // has no way to apply a range — so a range here can't be honored. Refuse (don't silently
      // download and analyze the WHOLE thing, billing the user for a range they didn't get).
      error = 'A time range only works for YouTube URLs (analyzed directly via the Gemini API). This source would be downloaded and analyzed locally, which cannot apply a range. Clear the range, or use a YouTube URL.';
      notes.push(`startOffset=${startOffset} endOffset=${endOffset} REJECTED: source routes to the CLI/download path (non-YouTube), which cannot apply a range — launch refused`);
    } else {
      args.push('-StartOffset', String(startOffset), '-EndOffset', String(endOffset));
      notes.push(`range sent: -StartOffset ${startOffset} -EndOffset ${endOffset} (analyzes only that slice; billing scales to slice length, not whole-video length — SDK/YouTube route only)`);
    }
  }

  return { args, notes, error };
}

module.exports = {
  VALID_VIDEO_MODELS,
  VALID_MEDIA_RESOLUTIONS,
  VALID_ANALYSIS_MODES,
  DEFAULT_VIDEO_MODEL,
  DEFAULT_MEDIA_RESOLUTION,
  DEFAULT_ANALYSIS_MODE,
  YOUTUBE_HOSTS,
  MAX_OFFSET_SECONDS,
  isValidOffset,
  predictVideoRoute,
  buildVideoScoutArgs,
};
