'use strict';
// Run: node app/video-scout-args.test.js
//
// Plain Node.js — no test framework, no build step (matches app/renderer/pty-parser.test.js).
// Exit 0 = all pass. Exit 1 = at least one failure.

const {
  VALID_VIDEO_MODELS,
  VALID_MEDIA_RESOLUTIONS,
  DEFAULT_VIDEO_MODEL,
  DEFAULT_MEDIA_RESOLUTION,
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
  assert(notes.some(n => /sent as -MediaResolution/.test(n) && /NOT enforced/.test(n)),
    'notes describe mediaResolution as sent, with the not-enforced caveat');
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

// --- omission: absent fields produce no args and no notes ---------------------------
{
  const { args, notes } = buildVideoScoutArgs({});
  assert(args.length === 0, 'no args when both fields are absent');
  assert(notes.length === 0, 'no notes when both fields are absent');
}

// --- sanity: allowlists contain the expected known-good members --------------------
assert(VALID_VIDEO_MODELS.has('gemini-2.5-flash-lite') && VALID_VIDEO_MODELS.has('gemini-2.5-pro'),
  'VALID_VIDEO_MODELS contains the documented Gemini models');
assert(VALID_MEDIA_RESOLUTIONS.has('LOW') && VALID_MEDIA_RESOLUTIONS.has('MEDIUM') && VALID_MEDIA_RESOLUTIONS.has('HIGH'),
  'VALID_MEDIA_RESOLUTIONS matches feed-gemini.ps1\'s ValidateSet(LOW, MEDIUM, HIGH)');

process.stdout.write(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
