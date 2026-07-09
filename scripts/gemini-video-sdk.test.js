'use strict';
// Run: node scripts/gemini-video-sdk.test.js
// Plain Node.js — no framework (matches app/video-scout-args.test.js convention).
// Covers the pure request-body builder and arg parsing; no network.

const { buildRequestBody, formatUsageLine, parseArgs, resolveSliceOffsets, MEDIA_RESOLUTION_MAP, DEFAULT_MODEL } = require('./gemini-video-sdk');

let passed = 0, failed = 0;
function assert(cond, label) {
  if (cond) { process.stdout.write(`  ✓ ${label}\n`); passed++; }
  else { process.stderr.write(`  ✗ FAIL: ${label}\n`); failed++; }
}

// --- buildRequestBody: basic shape ---------------------------------------------------
{
  const b = buildRequestBody({ url: 'https://youtu.be/x', prompt: 'analyze', mediaResolution: 'LOW' });
  const parts = b.contents[0].parts;
  assert(parts.length === 2, 'two parts: video + text');
  assert(parts[0].fileData.fileUri === 'https://youtu.be/x', 'fileData.fileUri carries the URL');
  assert(parts[1].text === 'analyze', 'text part carries the prompt');
  assert(b.generationConfig.mediaResolution === 'MEDIA_RESOLUTION_LOW', 'LOW maps to MEDIA_RESOLUTION_LOW in generationConfig');
  assert(!('videoMetadata' in parts[0]), 'no videoMetadata when offsets absent');
}

// --- buildRequestBody: offsets -------------------------------------------------------
{
  const b = buildRequestBody({ url: 'u', prompt: 'p', mediaResolution: 'MEDIUM', startOffset: '120', endOffset: '240' });
  const vm = b.contents[0].parts[0].videoMetadata;
  assert(vm && vm.startOffset === '120s' && vm.endOffset === '240s', 'both offsets become videoMetadata with s suffix');
}
{
  const b = buildRequestBody({ url: 'u', prompt: 'p', mediaResolution: 'MEDIUM', startOffset: '120' });
  assert(!('videoMetadata' in b.contents[0].parts[0]), 'a lone startOffset does NOT produce videoMetadata');
}

// --- buildRequestBody: media resolution mapping --------------------------------------
{
  assert(buildRequestBody({ url: 'u', prompt: 'p', mediaResolution: 'HIGH' }).generationConfig.mediaResolution === 'MEDIA_RESOLUTION_HIGH', 'HIGH maps correctly');
  assert(!('generationConfig' in buildRequestBody({ url: 'u', prompt: 'p', mediaResolution: 'ULTRA' })), 'unknown resolution produces no generationConfig (API default applies)');
  assert(Object.keys(MEDIA_RESOLUTION_MAP).join(',') === 'LOW,MEDIUM,HIGH', 'map covers exactly LOW/MEDIUM/HIGH');
}

// --- parseArgs ------------------------------------------------------------------------
{
  const a = parseArgs(['--url', 'https://youtu.be/x', '--model', 'gemini-2.5-pro', '--media-resolution', 'LOW',
    '--prompt-file', 'C:\\p.md', '--start-offset', '60', '--end-offset', '180']);
  assert(a.url === 'https://youtu.be/x' && a.model === 'gemini-2.5-pro' && a.mediaResolution === 'LOW', 'parses url/model/resolution');
  assert(a.promptFile === 'C:\\p.md' && a.startOffset === '60' && a.endOffset === '180', 'parses prompt file and offsets');
  assert(a.startOffsetSeen === true && a.endOffsetSeen === true, 'records that both offset flags were seen');
  assert(DEFAULT_MODEL === 'gemini-2.5-flash-lite', 'default model matches feed-gemini.ps1');
}
// parseArgs: a flag given as the FINAL argv element records seen=true, value=undefined (2b) -------
{
  const a = parseArgs(['--url', 'https://youtu.be/x', '--start-offset', '10', '--end-offset']);
  assert(a.endOffsetSeen === true && a.endOffset === undefined,
    'a trailing --end-offset with no value is recorded as seen-but-valueless (not silently absent)');
}

// --- resolveSliceOffsets: valid path -------------------------------------------------
{
  const r = resolveSliceOffsets({ startOffsetSeen: true, startOffset: '120', endOffsetSeen: true, endOffset: '240' });
  assert(r.sliced === true && r.startOffset === 120 && r.endOffset === 240,
    'valid pair resolves to integers (no coerced/pass-through strings)');
  assert(typeof r.startOffset === 'number' && Number.isInteger(r.startOffset), 'startOffset is a real integer, not a string');
}
{
  const r = resolveSliceOffsets({});
  assert(r.sliced === false && !r.error, 'no offset flags -> whole video, no error');
}

// --- resolveSliceOffsets 2a: non-negative-integer validation, no coercion ------------
{
  assert(resolveSliceOffsets({ startOffsetSeen: true, startOffset: '1.5', endOffsetSeen: true, endOffset: '20' }).error,
    'REFUSES a fractional startOffset (no truncation/coercion)');
  assert(resolveSliceOffsets({ startOffsetSeen: true, startOffset: '-5', endOffsetSeen: true, endOffset: '20' }).error,
    'REFUSES a negative startOffset');
  assert(resolveSliceOffsets({ startOffsetSeen: true, startOffset: '10abc', endOffsetSeen: true, endOffset: '20' }).error,
    'REFUSES a junk/non-numeric startOffset (no pass-through string)');
  assert(resolveSliceOffsets({ startOffsetSeen: true, startOffset: '10', endOffsetSeen: true, endOffset: 'xyz' }).error,
    'REFUSES a junk endOffset');
}

// --- resolveSliceOffsets 2b: flag with missing value (undefined) is REFUSED ----------
{
  const r = resolveSliceOffsets({ startOffsetSeen: true, startOffset: '10', endOffsetSeen: true, endOffset: undefined });
  assert(r.error && !r.sliced, 'a seen-but-valueless offset is refused, never a silent whole-video fallback');
}
{
  // integration: parseArgs of a trailing flag -> resolveSliceOffsets refuses
  const r = resolveSliceOffsets(parseArgs(['--url', 'u', '--start-offset', '10', '--end-offset']));
  assert(r.error && !r.sliced, 'parseArgs + resolveSliceOffsets refuses a trailing valueless --end-offset');
}

// --- resolveSliceOffsets: both-or-neither and strict order ---------------------------
{
  assert(resolveSliceOffsets({ startOffsetSeen: true, startOffset: '10' }).error,
    'REFUSES a lone startOffset (both required, no silent whole-video)');
  assert(resolveSliceOffsets({ endOffsetSeen: true, endOffset: '10' }).error,
    'REFUSES a lone endOffset');
  assert(resolveSliceOffsets({ startOffsetSeen: true, startOffset: '100', endOffsetSeen: true, endOffset: '50' }).error,
    'REFUSES end < start');
  assert(resolveSliceOffsets({ startOffsetSeen: true, startOffset: '100', endOffsetSeen: true, endOffset: '100' }).error,
    'REFUSES end === start (strictly-after)');
}

// --- formatUsageLine -------------------------------------------------------------------
{
  const line = formatUsageLine({
    promptTokenCount: 66766, candidatesTokenCount: 4400, totalTokenCount: 71166,
    promptTokensDetails: [
      { modality: 'TEXT', tokenCount: 1373 }, { modality: 'VIDEO', tokenCount: 45085 }, { modality: 'AUDIO', tokenCount: 20308 },
    ],
  }, 'gemini-2.5-flash-lite', 'LOW', false);
  assert(line.startsWith('[video-scout usage] '), 'usage line carries the Logs-tab marker');
  assert(line.includes('prompt=66766') && line.includes('video=45085') && line.includes('audio=20308'), 'per-modality counts present');
  assert(!line.includes('sliced'), 'no sliced flag when not sliced');
  const sliceLine = formatUsageLine({ promptTokenCount: 1 }, 'm', 'LOW', true);
  assert(sliceLine.includes('sliced=yes'), 'sliced runs are marked');
}

process.stdout.write(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
