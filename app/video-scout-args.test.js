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

// --- analysisMode: values outside the allowlist are dropped, never spliced ----------
{
  const { args, notes } = buildVideoScoutArgs({ analysisMode: 'video"; Remove-Item -Recurse /' });
  assert(!args.includes('-Mode'), 'rejects an analysisMode outside VALID_ANALYSIS_MODES');
  assert(notes.some(n => /analysisMode=.*REJECTED/.test(n)), 'notes flag the rejected analysisMode explicitly');
  assert(notes.every(n => !/sent as -Mode/.test(n)), 'no note claims the malicious analysisMode was sent');
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

// --- omission: absent fields produce no args and no notes ---------------------------
{
  const { args, notes } = buildVideoScoutArgs({});
  assert(args.length === 0, 'no args when all fields are absent');
  assert(notes.length === 0, 'no notes when all fields are absent');
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
