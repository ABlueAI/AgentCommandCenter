'use strict';
// Pure helper for building the video-scout (feed-gemini.ps1) launch args from renderer-supplied
// Gemini options (videoModel / mediaResolution / analysisMode / range / analysisFocus). Kept free of
// electron/fs (it requires only the equally-pure ./renderer/analysis-focus shared validator) so it
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
// V3a: the ONE shared analysis-focus normalizer/validator, reused verbatim by the renderer (immediate
// feedback) and here (the real main-process boundary). Dependency-free itself, so this module stays
// unit-testable in plain node.
const { normalizeAnalysisFocus, analysisFocusRejectionMessage } = require('./renderer/analysis-focus');

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

// V4 bounded multi-slice: application limits, mirrored independently in feed-gemini.ps1
// (lib/get-video-scout-slice-ranges.ps1) and gemini-video-sdk.js — each layer re-enforces the
// whole contract; none trusts the previous one. 8 stays deliberately below Gemini's documented
// 10-video maximum; 1800s is the FIXED aggregate cap (no override may raise it); 2048 bounds only
// the serialized slice-control argument, never any other payload.
const MIN_MULTI_SLICES = 2;
const MAX_SLICES = 8;
const AGGREGATE_SLICE_CAP_SECONDS = 1800;
const MAX_SLICE_RANGES_JSON_UNITS = 2048;

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
function buildVideoScoutArgs({ videoModel, mediaResolution, analysisMode, videoUrl, startOffset, endOffset, sliceRanges, analysisFocus } = {}) {
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

  // V4 bounded multi-slice (SDK/YouTube route only). sliceRanges crosses the same untrusted
  // renderer -> main IPC boundary as every field here and gets the full independent re-validation:
  // a bypassed/modified renderer calling pty-start directly still hits every check below. ANY
  // problem with an explicitly supplied sliceRanges REFUSES the launch (sets `error`) — a slice
  // set is a cost-direction request and is never dropped, trimmed, reordered, merged, or silently
  // downgraded to whole-video. On success the ONE canonical compact JSON serialization rides as
  // one discrete `-SliceRangesJson <json>` argv pair (never a shell string); feed-gemini.ps1 and
  // gemini-video-sdk.js re-validate the same contract independently.
  const slicesGiven = sliceRanges !== undefined && sliceRanges !== null;
  if (slicesGiven) {
    const scalarAlsoGiven =
      (startOffset !== undefined && startOffset !== null && startOffset !== '') ||
      (endOffset !== undefined && endOffset !== null && endOffset !== '');
    const effectiveSliceMode = (typeof analysisMode === 'string' && VALID_ANALYSIS_MODES.has(analysisMode))
      ? analysisMode : DEFAULT_ANALYSIS_MODE;
    const refuseSlices = (msg, note) => { error = msg; notes.push(note); };

    if (scalarAlsoGiven) {
      refuseSlices(
        'Multi-slice ranges and a single start/end range are mutually exclusive. Send one or the other, never both.',
        'sliceRanges REJECTED: also received scalar startOffset/endOffset (mutually exclusive) — launch refused');
    } else if (!Array.isArray(sliceRanges)) {
      refuseSlices(
        `Slice ranges must be an array of {startOffset, endOffset} objects (got ${describeInvalidValue(sliceRanges)}). Launch refused.`,
        `sliceRanges=${describeInvalidValue(sliceRanges)} REJECTED (not an array) — launch refused`);
    } else if (sliceRanges.length < MIN_MULTI_SLICES || sliceRanges.length > MAX_SLICES) {
      refuseSlices(
        `Multi-slice needs ${MIN_MULTI_SLICES} to ${MAX_SLICES} slices (got ${sliceRanges.length}). One slice uses the single start/end fields; zero slices means the whole video.`,
        `sliceRanges REJECTED (count ${sliceRanges.length}; allowed ${MIN_MULTI_SLICES}-${MAX_SLICES}) — launch refused`);
    } else if (effectiveSliceMode !== 'video') {
      refuseSlices(
        `Time slices are only valid in video mode (the current mode is "${effectiveSliceMode}"). Clear the slices, or switch analysis mode to video.`,
        `sliceRanges REJECTED: slices only apply in video mode (effective mode is "${effectiveSliceMode}") — launch refused`);
    } else {
      // Exact entry shape: a plain object with exactly the keys startOffset/endOffset, both
      // integers 0..MAX_OFFSET_SECONDS, end strictly after start. Checked entry by entry so the
      // refusal names the first offending slice (1-based, matching the visible labels).
      let entryError = null;
      const canonical = [];
      for (let i = 0; i < sliceRanges.length && !entryError; i++) {
        const entry = sliceRanges[i];
        if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
          entryError = `Slice ${i + 1} must be an object with exactly startOffset and endOffset (got ${describeInvalidValue(entry)}).`;
          break;
        }
        const keys = Object.keys(entry).sort();
        if (keys.length !== 2 || keys[0] !== 'endOffset' || keys[1] !== 'startOffset') {
          entryError = `Slice ${i + 1} must contain exactly the keys startOffset and endOffset (got ${describeInvalidValue(Object.keys(entry))}).`;
          break;
        }
        if (!isValidOffset(entry.startOffset) || !isValidOffset(entry.endOffset)) {
          entryError = `Slice ${i + 1} offsets must be whole seconds between 0 and ${MAX_OFFSET_SECONDS} (got start=${describeInvalidValue(entry.startOffset)}, end=${describeInvalidValue(entry.endOffset)}).`;
          break;
        }
        if (entry.endOffset <= entry.startOffset) {
          entryError = `Slice ${i + 1} end (${entry.endOffset}s) must be strictly after its start (${entry.startOffset}s).`;
          break;
        }
        if (i > 0 && entry.startOffset < canonical[i - 1].endOffset) {
          entryError = `Slice ${i + 1} (${entry.startOffset}s-${entry.endOffset}s) must start at or after the end of slice ${i} (${canonical[i - 1].startOffset}s-${canonical[i - 1].endOffset}s): slices must be chronological and non-overlapping, and are never reordered or merged.`;
          break;
        }
        canonical.push({ startOffset: entry.startOffset, endOffset: entry.endOffset });
      }
      if (entryError) {
        refuseSlices(`${entryError} Launch refused.`, 'sliceRanges REJECTED (invalid slice entry/order) — launch refused');
      } else {
        const aggregate = canonical.reduce((sum, r) => sum + (r.endOffset - r.startOffset), 0);
        const routePrediction = predictVideoRoute(videoUrl, effectiveSliceMode).route;
        const serialized = JSON.stringify(canonical); // canonical order fixed by construction above
        if (aggregate > AGGREGATE_SLICE_CAP_SECONDS) {
          refuseSlices(
            `The slices add up to ${aggregate}s, which exceeds the fixed ${AGGREGATE_SLICE_CAP_SECONDS}s multi-slice cap (no override can raise it). Narrow or remove slices.`,
            `sliceRanges REJECTED (aggregate ${aggregate}s > fixed cap ${AGGREGATE_SLICE_CAP_SECONDS}s) — launch refused`);
        } else if (routePrediction === 'cli') {
          refuseSlices(
            'Time slices only work for YouTube URLs (analyzed directly via the Gemini API). This source would be downloaded and analyzed locally, which cannot apply slices. Clear the slices, or use a YouTube URL.',
            'sliceRanges REJECTED: source routes to the CLI/download path (non-YouTube), which cannot apply slices — launch refused');
        } else if (serialized.length > MAX_SLICE_RANGES_JSON_UNITS) {
          // Structurally unreachable for 8 in-bounds slices (~350 units max), kept as the hard
          // transport bound the work order names — fail closed, never truncate.
          refuseSlices(
            `The serialized slice payload is ${serialized.length} units, which exceeds the ${MAX_SLICE_RANGES_JSON_UNITS}-unit bound. Launch refused.`,
            `sliceRanges REJECTED (serialized ${serialized.length} > ${MAX_SLICE_RANGES_JSON_UNITS} units) — launch refused`);
        } else {
          args.push('-SliceRangesJson', serialized);
          // Bounded metadata only (count + aggregate) — never the serialized JSON in a note/log.
          notes.push(`sliceRanges sent count=${canonical.length} aggregate=${aggregate}s as one discrete -SliceRangesJson (ONE analysis of just those slices; SDK/YouTube route only)`);
        }
      }
    }
    if (error) return { args, notes, error };
  }

  // Section-scoping (videoMetadata start/end offset, SDK/YouTube route only): renderer already
  // validated this (parseTimeToSeconds/classifySliceRows in video-range-ui.js), but startOffset/
  // endOffset cross the same untrusted renderer -> main IPC boundary as every other field here, so they get
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

  // V3a pre-analysis focus (optional). Untrusted IPC value, same posture as every field above: the
  // renderer validated it for immediate feedback, but THIS is the real boundary (a bypassed/modified
  // renderer calling pty-start directly still hits it), and feed-gemini.ps1 re-validates independently.
  // The shared normalizer (./renderer/analysis-focus) trims + normalizes CRLF/CR/LF/tab -> space, caps
  // at 2000 UTF-16 units (never truncates), and rejects non-strings and C0/DEL controls. A valid,
  // nonblank focus rides as ONE discrete argv element — -AnalysisFocus <value> — so shell-
  // metacharacter-shaped content ($(), ;, |, &, backtick, quotes) stays LITERAL prompt data (nothing
  // here ever builds a shell command string). Blank/omitted adds nothing (the script's default brief is
  // unchanged). An EXPLICIT invalid focus REFUSES the launch (never silently dropped). Only a character
  // COUNT is ever logged — the focus text is never put in a note, a log line, or the Logs tab.
  const focusResult = normalizeAnalysisFocus(analysisFocus);
  if (!focusResult.ok) {
    notes.push(`analysisFocus REJECTED (${focusResult.reason}) — launch refused`);
    // Don't clobber an earlier refusal (e.g. an invalid range): the first refusal reason wins.
    if (!error) error = analysisFocusRejectionMessage(focusResult.reason);
  } else if (focusResult.provided) {
    args.push('-AnalysisFocus', focusResult.value);
    notes.push(`analysisFocus sent chars=${focusResult.chars}`);
  } else if (analysisFocus !== undefined && analysisFocus !== null) {
    notes.push('analysisFocus omitted (blank after normalization) — default brief unchanged');
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
  MIN_MULTI_SLICES,
  MAX_SLICES,
  AGGREGATE_SLICE_CAP_SECONDS,
  MAX_SLICE_RANGES_JSON_UNITS,
  isValidOffset,
  predictVideoRoute,
  buildVideoScoutArgs,
};
