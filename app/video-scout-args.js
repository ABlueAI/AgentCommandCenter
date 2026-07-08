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
// Returns { args, notes }:
//   args  - argv elements to splice into the PowerShell -File invocation (never a shell string)
//   notes - human-readable strings describing exactly what happened to each field (sent /
//           omitted-as-default / rejected), safe to hand straight to main.js's tlog() so the
//           Logs tab always shows the POST-VALIDATION truth — never implying a choice was
//           honored when it was actually silently dropped.
function buildVideoScoutArgs({ videoModel, mediaResolution, analysisMode, videoUrl } = {}) {
  const args = [];
  const notes = [];

  // Route prediction first so it's the first thing the Logs tab shows for the run.
  if (videoUrl) {
    const { route, reason } = predictVideoRoute(videoUrl, analysisMode);
    notes.push(`route=${route.toUpperCase()} (${reason})`);
  }

  if (analysisMode !== undefined && analysisMode !== null && analysisMode !== '') {
    if (typeof analysisMode === 'string' && VALID_ANALYSIS_MODES.has(analysisMode)) {
      if (analysisMode === DEFAULT_ANALYSIS_MODE) {
        notes.push(`analysisMode="${analysisMode}" omitted (matches the script's -VideoScout fallback: full visual analysis)`);
      } else {
        args.push('-Mode', analysisMode);
        notes.push(`analysisMode="${analysisMode}" sent as -Mode (cheaper pass: no visual tokens)`);
      }
    } else {
      notes.push(`analysisMode=${JSON.stringify(analysisMode)} REJECTED (not in VALID_ANALYSIS_MODES allowlist) — dropped, script default (video) applies`);
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

  return { args, notes };
}

module.exports = {
  VALID_VIDEO_MODELS,
  VALID_MEDIA_RESOLUTIONS,
  VALID_ANALYSIS_MODES,
  DEFAULT_VIDEO_MODEL,
  DEFAULT_MEDIA_RESOLUTION,
  DEFAULT_ANALYSIS_MODE,
  YOUTUBE_HOSTS,
  predictVideoRoute,
  buildVideoScoutArgs,
};
