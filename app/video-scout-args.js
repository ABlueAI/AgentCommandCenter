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

// Must mirror feed-gemini.ps1's own parameter defaults (see scripts/feed-gemini.ps1 -Model /
// -MediaResolution). When the caller's choice matches the script's default we omit the flag
// entirely rather than pass it explicitly — keeps the default defined in exactly one place
// (the script), not duplicated here.
const DEFAULT_VIDEO_MODEL = 'gemini-2.5-flash-lite';
const DEFAULT_MEDIA_RESOLUTION = 'MEDIUM';

// Build the extra argv elements for feed-gemini.ps1 from { videoModel, mediaResolution }.
// Returns { args, notes }:
//   args  - argv elements to splice into the PowerShell -File invocation (never a shell string)
//   notes - human-readable strings describing exactly what happened to each field (sent /
//           omitted-as-default / rejected), safe to hand straight to main.js's tlog() so the
//           Logs tab always shows the POST-VALIDATION truth — never implying a choice was
//           honored when it was actually silently dropped.
function buildVideoScoutArgs({ videoModel, mediaResolution } = {}) {
  const args = [];
  const notes = [];

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
        notes.push(`mediaResolution="${mediaResolution}" sent as -MediaResolution (recorded in the script's run log only — NOT enforced by the Gemini CLI, see scripts/feed-gemini.ps1)`);
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
  DEFAULT_VIDEO_MODEL,
  DEFAULT_MEDIA_RESOLUTION,
  buildVideoScoutArgs,
};
