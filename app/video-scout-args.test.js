'use strict';
// Run: node app/video-scout-args.test.js
//
// Plain Node.js — no test framework, no build step (matches app/renderer/pty-parser.test.js).
// Exit 0 = all pass. Exit 1 = at least one failure.

const {
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
} = require('./video-scout-args');

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    process.stdout.write(`  ✓ ${label}\n`);
    passed++;
  } else {
    process.stderr.write(`  ✗ FAIL: ${label}\n`);
    failed++;
  }
}

// --- accept: non-default valid values are pushed as flags -------------------------
{
  const { args, notes } = buildVideoScoutArgs({ videoModel: 'gemini-2.5-pro', mediaResolution: 'HIGH' });
  assert(args.includes('-Model') && args[args.indexOf('-Model') + 1] === 'gemini-2.5-pro',
    'accepts an allowlisted non-default videoModel and pushes -Model');
  assert(args.includes('-MediaResolution') && args[args.indexOf('-MediaResolution') + 1] === 'HIGH',
    'accepts an allowlisted non-default mediaResolution and pushes -MediaResolution');
  assert(notes.some(n => /sent as -Model/.test(n)), 'notes describe videoModel as sent');
  assert(notes.some(n => /sent as -MediaResolution/.test(n) && /ENFORCED on the SDK\/YouTube route/.test(n)),
    'notes describe mediaResolution as sent, with the route-dependent enforcement caveat');
}

// --- default-omission: values matching the script's own default are NOT pushed -----
{
  const { args, notes } = buildVideoScoutArgs({ videoModel: DEFAULT_VIDEO_MODEL, mediaResolution: DEFAULT_MEDIA_RESOLUTION });
  assert(args.length === 0, 'omits both flags when values match feed-gemini.ps1 defaults');
  assert(notes.some(n => /videoModel="gemini-2.5-flash-lite" omitted/.test(n)), 'notes explain videoModel omission');
  assert(notes.some(n => /mediaResolution="MEDIUM" omitted/.test(n)), 'notes explain mediaResolution omission');
}

// --- reject: values outside the allowlist are dropped, never spliced into args -----
{
  const { args, notes } = buildVideoScoutArgs({ videoModel: 'gemini-3-ultra-secret', mediaResolution: 'ULTRA' });
  assert(!args.includes('-Model'), 'rejects a videoModel outside VALID_VIDEO_MODELS');
  assert(!args.includes('-MediaResolution'), 'rejects a mediaResolution outside VALID_MEDIA_RESOLUTIONS');
  assert(notes.some(n => /videoModel=.*REJECTED/.test(n)), 'notes flag the rejected videoModel explicitly');
  assert(notes.some(n => /mediaResolution=.*REJECTED/.test(n)), 'notes flag the rejected mediaResolution explicitly');
}

// --- reject: shell-metacharacter / injection-shaped values are dropped too ----------
{
  const { args, notes } = buildVideoScoutArgs({ videoModel: 'gemini-2.5-pro"; rm -rf /', mediaResolution: '$(whoami)' });
  assert(!args.includes('-Model'), 'rejects a videoModel containing shell metacharacters (not in allowlist)');
  assert(!args.includes('-MediaResolution'), 'rejects a mediaResolution containing shell metacharacters (not in allowlist)');
  assert(notes.every(n => !/sent as/.test(n)), 'no note claims either malicious value was sent');
}

// --- analysisMode: cheaper modes are sent explicitly as -Mode -----------------------
{
  const { args, notes } = buildVideoScoutArgs({ analysisMode: 'transcript' });
  assert(args.includes('-Mode') && args[args.indexOf('-Mode') + 1] === 'transcript',
    'accepts analysisMode=transcript and pushes -Mode transcript');
  assert(notes.some(n => /analysisMode="transcript" sent as -Mode/.test(n)),
    'notes describe transcript mode as sent');
}
{
  const { args } = buildVideoScoutArgs({ analysisMode: 'audio' });
  assert(args.includes('-Mode') && args[args.indexOf('-Mode') + 1] === 'audio',
    'accepts analysisMode=audio and pushes -Mode audio');
}

// --- analysisMode: 'video' matches the script's -VideoScout fallback, so it is omitted
{
  const { args, notes } = buildVideoScoutArgs({ analysisMode: DEFAULT_ANALYSIS_MODE });
  assert(!args.includes('-Mode'), 'omits -Mode when analysisMode matches the -VideoScout fallback (video)');
  assert(notes.some(n => /analysisMode="video" omitted/.test(n)), 'notes explain the video-mode omission');
}

// --- analysisMode: an EXPLICIT invalid value REFUSES the launch (fail-closed) -------
// This used to be a silent drop-to-default (the costliest 'video' fallback) — now it's a visible
// refusal: an explicitly supplied, nonempty analysisMode that isn't transcript/audio/video must
// never launch Video Scout.
{
  const { args, notes, error } = buildVideoScoutArgs({ analysisMode: 'video"; Remove-Item -Recurse /' });
  assert(typeof error === 'string' && /Allowed modes: transcript, audio, video/.test(error) && /refused/i.test(error),
    'REFUSES an injection-shaped analysisMode with a user-facing error naming the allowed modes');
  assert(!args.includes('-Mode'), 'rejects an analysisMode outside VALID_ANALYSIS_MODES — no -Mode arg pushed');
  assert(args.length === 0, 'no args at all are emitted on an invalid-mode refusal');
  assert(notes.some(n => /analysisMode=.*REJECTED/.test(n)), 'notes flag the rejected analysisMode explicitly');
  assert(notes.every(n => !/sent as -Mode/.test(n)), 'no note claims the malicious analysisMode was sent');
  assert(notes.every(n => !/^route=/.test(n)), 'no route note is emitted — refusal happens before route prediction');
}
{
  const { error } = buildVideoScoutArgs({ analysisMode: 'not-a-real-mode' });
  assert(typeof error === 'string', 'REFUSES a plain unrecognized string analysisMode');
}
// --- analysisMode: wrong TYPES (number/object) also REFUSE, not just bad strings ----
{
  const { args, error } = buildVideoScoutArgs({ analysisMode: 42 });
  assert(typeof error === 'string', 'REFUSES a numeric analysisMode');
  assert(!args.includes('-Mode'), 'no -Mode arg pushed for a numeric analysisMode');
}
{
  const { error } = buildVideoScoutArgs({ analysisMode: { mode: 'video' } });
  assert(typeof error === 'string', 'REFUSES an object analysisMode');
}
{
  const { error } = buildVideoScoutArgs({ analysisMode: ['video'] });
  assert(typeof error === 'string', 'REFUSES an array analysisMode');
}
{
  const { error } = buildVideoScoutArgs({ analysisMode: true });
  assert(typeof error === 'string', 'REFUSES a boolean analysisMode');
}

// --- analysisMode: an invalid mode plus an otherwise-valid range REFUSES, and emits no
// route note implying a route will run, and no offset args ---------------------------
{
  const { args, notes, error } = buildVideoScoutArgs({
    videoUrl: 'https://youtu.be/aqz-KE-bpKQ', analysisMode: 'not-a-real-mode', startOffset: 10, endOffset: 20,
  });
  assert(typeof error === 'string' && /Allowed modes/.test(error),
    'REFUSES an invalid mode even with an otherwise-valid YouTube range — the range is never reached');
  assert(!args.includes('-StartOffset') && !args.includes('-EndOffset'),
    'no offset args are pushed when the mode itself is invalid');
  assert(!args.includes('-Mode'), 'no -Mode arg pushed on the invalid-mode-plus-range refusal');
  assert(notes.every(n => !/^route=/.test(n)),
    'no route note (which would otherwise imply a Video/SDK or CLI route will run) is emitted');
  assert(notes.every(n => !/range sent/.test(n)), 'no note claims the range was sent');
}

// --- route prediction: YouTube + video → SDK, everything else → CLI -----------------
{
  assert(predictVideoRoute('https://www.youtube.com/watch?v=abc', 'video').route === 'sdk',
    'youtube.com + video mode predicts SDK');
  assert(predictVideoRoute('https://youtu.be/abc', 'video').route === 'sdk',
    'youtu.be + video mode predicts SDK');
  assert(predictVideoRoute('https://youtu.be/abc', undefined).route === 'sdk',
    'absent analysisMode falls back to video (script -VideoScout fallback) → SDK');
  assert(predictVideoRoute('https://vimeo.com/123', 'video').route === 'cli',
    'Vimeo predicts CLI (fileUri only ingests YouTube)');
  assert(predictVideoRoute('https://www.youtube.com/watch?v=abc', 'transcript').route === 'cli',
    'transcript mode predicts CLI even for YouTube');
  assert(predictVideoRoute('https://www.youtube.com/watch?v=abc', 'audio').route === 'cli',
    'audio mode predicts CLI even for YouTube');
  assert(predictVideoRoute('not a url', 'video').route === 'cli',
    'malformed URL predicts CLI');
  assert(predictVideoRoute('https://notyoutube.com/watch?v=abc', 'video').route === 'cli',
    'lookalike host predicts CLI');
  assert(YOUTUBE_HOSTS.has('youtube.com') && YOUTUBE_HOSTS.has('youtu.be') && YOUTUBE_HOSTS.has('m.youtube.com') && YOUTUBE_HOSTS.has('www.youtube.com'),
    'YOUTUBE_HOSTS matches the YouTube subset of main.js VIDEO_HOSTS');
}

// --- route note flows through buildVideoScoutArgs when videoUrl is present ----------
{
  const { notes } = buildVideoScoutArgs({ videoUrl: 'https://youtu.be/abc', analysisMode: 'video' });
  assert(notes.some(n => /^route=SDK/.test(n)), 'buildVideoScoutArgs emits a route=SDK note for a YouTube video run');
  const { notes: n2 } = buildVideoScoutArgs({ videoUrl: 'https://youtu.be/abc', analysisMode: 'transcript' });
  assert(n2.some(n => /^route=CLI/.test(n)), 'buildVideoScoutArgs emits a route=CLI note for a transcript run');
}

// A valid range now REQUIRES a YouTube videoUrl (offsets ride on the SDK/generateContent path,
// which only exists for YouTube) — a non-YouTube source refuses (see the CLI-route case below).
const YT = 'https://youtu.be/aqz-KE-bpKQ';

// --- offsets: valid range (YouTube, video mode) is sent as -StartOffset/-EndOffset --
{
  const { args, notes, error } = buildVideoScoutArgs({ videoUrl: YT, analysisMode: 'video', startOffset: 120, endOffset: 240 });
  assert(error === null, 'a valid YouTube range produces no error (launch proceeds)');
  assert(args.includes('-StartOffset') && args[args.indexOf('-StartOffset') + 1] === '120',
    'accepts a valid range and pushes -StartOffset as a STRING (node-pty spawn expects string[] argv)');
  assert(args.includes('-EndOffset') && args[args.indexOf('-EndOffset') + 1] === '240',
    'pushes -EndOffset as a string too');
  assert(args.indexOf('-StartOffset') < args.indexOf('-EndOffset'), '-StartOffset precedes -EndOffset in argv order');
  assert(notes.some(n => /range sent: -StartOffset 120 -EndOffset 240/.test(n)), 'notes confirm the range was sent');
}

// --- offsets: absent analysisMode falls back to 'video' (script's own -VideoScout fallback), so a
// valid YouTube range is still accepted -- proves the mode-gate isn't bypassable by omitting mode.
{
  const { args, error } = buildVideoScoutArgs({ videoUrl: YT, startOffset: 10, endOffset: 20 });
  assert(error === null && args.includes('-StartOffset'), 'omitted analysisMode still resolves to video mode, so a valid range is accepted');
}
{
  // An EXPLICIT invalid analysisMode REFUSES outright (fail-closed) — it must NOT fall back to
  // the video default and accept the range. See the dedicated invalid-mode-plus-range block above.
  const { args, error } = buildVideoScoutArgs({ videoUrl: YT, analysisMode: 'not-a-real-mode', startOffset: 10, endOffset: 20 });
  assert(typeof error === 'string' && !args.includes('-StartOffset'),
    'invalid analysisMode refuses rather than falling back to video and accepting the range');
}

// --- offsets: REFUSED outside video mode (error set, no args) ------------------------
{
  const { args, notes, error } = buildVideoScoutArgs({ videoUrl: YT, analysisMode: 'transcript', startOffset: 10, endOffset: 20 });
  assert(typeof error === 'string' && /only valid in video mode/.test(error), 'REFUSES a range in transcript mode (error set, user-facing)');
  assert(!args.includes('-StartOffset') && !args.includes('-EndOffset'), 'no offset args pushed on the transcript-mode refusal');
  assert(notes.some(n => /REJECTED.*only applies in video mode/.test(n)), 'notes explain the mode-gate refusal');
}
{
  const { error } = buildVideoScoutArgs({ videoUrl: YT, analysisMode: 'audio', startOffset: 10, endOffset: 20 });
  assert(typeof error === 'string' && /only valid in video mode/.test(error), 'REFUSES a range in audio mode too');
}

// --- offsets: NEW — a range on a non-YouTube (CLI-route) source is REFUSED -----------
{
  const { args, notes, error } = buildVideoScoutArgs({ videoUrl: 'https://vimeo.com/12345', analysisMode: 'video', startOffset: 30, endOffset: 90 });
  assert(typeof error === 'string' && /only works for YouTube URLs/.test(error), 'REFUSES a range when the source routes to the CLI/download path (non-YouTube)');
  assert(!args.includes('-StartOffset'), 'no offset args pushed on the CLI-route refusal');
  assert(notes.some(n => /routes to the CLI\/download path/.test(n)), 'notes explain the CLI-route refusal');
}
{
  // Missing/unparseable URL also predicts CLI -> a range can't be honored -> refuse.
  const { error } = buildVideoScoutArgs({ analysisMode: 'video', startOffset: 30, endOffset: 90 });
  assert(typeof error === 'string' && /only works for YouTube URLs/.test(error), 'REFUSES a range when no usable (YouTube) URL is present');
}

// --- offsets: both-or-neither REFUSAL -------------------------------------------------
{
  const { args, notes, error } = buildVideoScoutArgs({ videoUrl: YT, analysisMode: 'video', startOffset: 10 });
  assert(typeof error === 'string' && /both a start and an end/.test(error), 'REFUSES a lone startOffset (error set)');
  assert(!args.includes('-StartOffset'), 'no offset args on the lone-start refusal');
  assert(notes.some(n => /both are required/.test(n)), 'notes explain the both-or-neither refusal');
}
{
  const { error } = buildVideoScoutArgs({ videoUrl: YT, analysisMode: 'video', endOffset: 20 });
  assert(typeof error === 'string' && /both a start and an end/.test(error), 'REFUSES a lone endOffset (error set)');
}

// --- offsets: end must be strictly after start (REFUSAL) ------------------------------
{
  const { args, error } = buildVideoScoutArgs({ videoUrl: YT, analysisMode: 'video', startOffset: 100, endOffset: 50 });
  assert(typeof error === 'string' && /must be after start/.test(error), 'REFUSES end < start (error set)');
  assert(!args.includes('-StartOffset'), 'no offset args on the end<start refusal');
}
{
  const { error } = buildVideoScoutArgs({ videoUrl: YT, analysisMode: 'video', startOffset: 100, endOffset: 100 });
  assert(typeof error === 'string' && /must be after start/.test(error), 'REFUSES end === start (strictly-after: a zero-length slice is invalid)');
}

// --- offsets: non-negative integers only, 0-86400 (REFUSAL; mirrors ValidateRange) ---
{
  const { error } = buildVideoScoutArgs({ videoUrl: YT, analysisMode: 'video', startOffset: -5, endOffset: 20 });
  assert(typeof error === 'string' && /whole seconds/.test(error), 'REFUSES a negative startOffset (error set)');
}
{
  const { error } = buildVideoScoutArgs({ videoUrl: YT, analysisMode: 'video', startOffset: 10.5, endOffset: 20 });
  assert(typeof error === 'string', 'REFUSES a non-integer (fractional) startOffset');
}
{
  const { error } = buildVideoScoutArgs({ videoUrl: YT, analysisMode: 'video', startOffset: '10', endOffset: 20 });
  assert(typeof error === 'string', 'REFUSES a startOffset sent as a string instead of a number (strict type check)');
}
{
  const { error } = buildVideoScoutArgs({ videoUrl: YT, analysisMode: 'video', startOffset: 0, endOffset: MAX_OFFSET_SECONDS + 1 });
  assert(typeof error === 'string', 'REFUSES an endOffset beyond MAX_OFFSET_SECONDS (86400s / 24h)');
}
{
  const { args, error } = buildVideoScoutArgs({ videoUrl: YT, analysisMode: 'video', startOffset: 0, endOffset: MAX_OFFSET_SECONDS });
  assert(error === null && args.includes('-StartOffset'), 'accepts endOffset exactly at MAX_OFFSET_SECONDS (boundary is inclusive)');
}
{
  assert(isValidOffset(0) === true, 'isValidOffset(0) is valid (non-negative boundary)');
  assert(isValidOffset(-1) === false, 'isValidOffset(-1) is invalid');
  assert(isValidOffset(1.5) === false, 'isValidOffset(1.5) is invalid (not an integer)');
  assert(isValidOffset(MAX_OFFSET_SECONDS + 1) === false, 'isValidOffset beyond the 24h cap is invalid');
}

// --- offsets: injection-shaped values are REFUSED, never spliced into args ----------
{
  const { args, notes, error } = buildVideoScoutArgs({ videoUrl: YT, analysisMode: 'video', startOffset: '0"; rm -rf /', endOffset: 20 });
  assert(typeof error === 'string', 'REFUSES a startOffset carrying shell-metacharacter-shaped content (fails the strict number check)');
  assert(!args.includes('-StartOffset'), 'no offset args pushed on the injection-shaped refusal');
  assert(notes.every(n => !/range sent/.test(n)), 'no note claims the malicious value was sent');
}

// --- no offsets at all: no error, whole-video proceeds normally ---------------------
{
  const { args, error } = buildVideoScoutArgs({ videoUrl: YT, analysisMode: 'video' });
  assert(error === null, 'no range given -> no error (whole-video is the explicit both-blank path)');
  assert(!args.includes('-StartOffset'), 'no offset args when no range is given');
}

// --- omission: absent fields produce no args, no notes, no error --------------------
{
  const { args, notes, error } = buildVideoScoutArgs({});
  assert(args.length === 0, 'no args when all fields are absent');
  assert(notes.length === 0, 'no notes when all fields are absent');
  assert(error === null, 'no error when all fields are absent');
}

// --- sanity: allowlists contain the expected known-good members --------------------
assert(VALID_VIDEO_MODELS.has('gemini-2.5-flash-lite') && VALID_VIDEO_MODELS.has('gemini-2.5-pro'),
  'VALID_VIDEO_MODELS contains the documented Gemini models');
assert(VALID_MEDIA_RESOLUTIONS.has('LOW') && VALID_MEDIA_RESOLUTIONS.has('MEDIUM') && VALID_MEDIA_RESOLUTIONS.has('HIGH'),
  'VALID_MEDIA_RESOLUTIONS matches feed-gemini.ps1\'s ValidateSet(LOW, MEDIUM, HIGH)');
assert(VALID_ANALYSIS_MODES.has('transcript') && VALID_ANALYSIS_MODES.has('audio') && VALID_ANALYSIS_MODES.has('video'),
  'VALID_ANALYSIS_MODES matches feed-gemini.ps1\'s ValidateSet(transcript, audio, video)');

process.stdout.write(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
