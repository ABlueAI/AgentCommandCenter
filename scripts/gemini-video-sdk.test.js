'use strict';
// Run: node scripts/gemini-video-sdk.test.js
// Plain Node.js — no framework (matches app/video-scout-args.test.js convention).
// Covers the pure request-body builder and arg parsing; no network.

const { buildRequestBody, formatUsageLine, parseArgs, MEDIA_RESOLUTION_MAP, DEFAULT_MODEL } = require('./gemini-video-sdk');

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
  assert(DEFAULT_MODEL === 'gemini-2.5-flash-lite', 'default model matches feed-gemini.ps1');
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
