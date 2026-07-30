'use strict';
// Run: node scripts/gemini-video-sdk.test.js
// Plain Node.js — no framework (matches app/video-scout-args.test.js convention).
// Covers the pure request-body builder / arg parsing (pre-K5 suite, preserved verbatim) plus
// the K5 bounded-503-recovery contract: classification precedence, three-attempt cap, bounded
// jittered backoff, byte-identical retry bodies, once-only output, natural shutdown via the
// REAL runCliEntry adapter in child processes against a localhost fixture. Network use is
// 127.0.0.1 only — no Gemini API, no credentials, no paid calls.

const {
  buildRequestBody, formatUsageLine, parseArgs, resolveSliceOffsets, MEDIA_RESOLUTION_MAP, DEFAULT_MODEL,
  classifyHttpFailure, retryDelayMs, runVideoScout, runCliEntry,
  RETRY_MAX_ATTEMPTS, RETRY_BASE_DELAY_MS, RETRY_JITTER_MS, NON_RETRYABLE_STATUSES,
  QUALITY_FAILURE_CODES, DIAGNOSTIC_FILENAME,
  findRepeatedObservation, EVIDENCE_REPEAT_LIMIT, normalizeEvidenceLine,
} = require('./gemini-video-sdk');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const { execFile } = require('child_process');

let passed = 0, failed = 0;
function assert(cond, label) {
  if (cond) { process.stdout.write(`  ✓ ${label}\n`); passed++; }
  else { process.stderr.write(`  ✗ FAIL: ${label}\n`); failed++; }
}
function section(name) { process.stdout.write(`\n${name}\n`); }

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
  // V4Q: generationConfig is now ALWAYS present because maxOutputTokens applies to every SDK video
  // model. An unknown resolution still contributes no mediaResolution key (the API default applies).
  const unknownRes = buildRequestBody({ url: 'u', prompt: 'p', mediaResolution: 'ULTRA' }).generationConfig;
  assert(!('mediaResolution' in unknownRes), 'unknown resolution produces no mediaResolution key (API default applies)');
  assert(unknownRes.maxOutputTokens === 16384 && !('thinkingConfig' in unknownRes),
    'unknown resolution still gets the V4Q output bound and no thinking budget');
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

// ═══════════════════════════════════════════════════════════════════════════════════════
// K5 — bounded 503 recovery
// ═══════════════════════════════════════════════════════════════════════════════════════

section('K5 classification precedence (classifyHttpFailure)');
{
  assert(RETRY_MAX_ATTEMPTS === 3 && RETRY_BASE_DELAY_MS === 1000 && RETRY_JITTER_MS === 500,
    'documented policy constants: 3 attempts, 1s base, 500ms jitter');
  assert(NON_RETRYABLE_STATUSES.join(',') === '400,401,403,404,429', 'explicit terminal statuses are exactly 400/401/403/404/429');
  assert(classifyHttpFailure(503, null).retryable === true, '503 with NO parseable body is retryable (status outranks body)');
  assert(classifyHttpFailure(503, { error: { status: 'INTERNAL' } }).retryable === true, '503 is retryable regardless of body claims');
  assert(classifyHttpFailure(500, { error: { status: 'UNAVAILABLE' } }).retryable === true, 'non-terminal status + parsed UNAVAILABLE body is retryable');
  assert(classifyHttpFailure(500, { error: { status: 'INTERNAL' } }).retryable === false, 'plain 500 without UNAVAILABLE is terminal');
  assert(classifyHttpFailure(502, null).retryable === false, 'plain 502 is terminal');
  for (const s of [400, 401, 403, 404, 429]) {
    assert(classifyHttpFailure(s, { error: { status: 'UNAVAILABLE' } }).retryable === false,
      `CONTRADICTORY body: HTTP ${s} with an UNAVAILABLE body is STILL terminal (status precedence)`);
  }
}

section('K5 backoff bounds (retryDelayMs)');
{
  assert(retryDelayMs(1, () => 0) === 1000 && retryDelayMs(1, () => 0.9999) < 1500, 'delay after attempt 1 stays in [1000, 1500) ms');
  assert(retryDelayMs(2, () => 0) === 2000 && retryDelayMs(2, () => 0.9999) < 2500, 'delay after attempt 2 stays in [2000, 2500) ms');
}

// --- harness for runVideoScout with injected deps -------------------------------------
// V4Q: every accepted response must now satisfy the deterministic quality gate, so the transport
// fixtures below carry a COMPLIANT report rather than a bare string. The report is composed from the
// SDK's own exported marker constants, so the fixture cannot drift from the contract it is proving
// (a spelling change in production fails these tests loudly instead of silently passing a stale
// fixture). 'ANALYSIS RESULT' is retained inside it so the existing print-exactly-once assertions
// keep measuring the same thing.
const {
  AUTHORIZED_SCOPE_LINE, SLICE_HEADING, UNDETERMINABLE_DURATION_LINE, NO_SYNTHETIC_EVIDENCE_LINE,
  EVIDENCE_SECTION_HEADER, EVIDENCE_SECTION_NEXT_HEADER,
} = require('./gemini-video-sdk');

// ================== V4 REVISION 8: rendered-fixture integrity infrastructure ==================
// A guard that reconstructs its input from the helper that built the fixture cannot detect the
// drift it exists to prevent — that is exactly how GUARD 2 came to carry a false claim. So every
// helper below takes the COMPLETE assembled report string that is handed to production
// validation, and derives scope, ownership and counts from that text alone.

const mmss = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
// §21: an injected observation is stamped inside the range it is filed under. When a fixture needs
// more observations than the window has whole seconds, cycle deterministically rather than walking
// out of scope — a repeated stamp is honest, a stamp outside the authorized window is not.
const cycledStamp = (i, r) => mmss(r.startOffset + (i % (r.endOffset - r.startOffset)));

// --- Fail-loud mutation helpers ---------------------------------------------------------------
// `String.replace()` whose target has stopped matching returns the source untouched. An
// adversarial fixture built that way silently becomes its own compliant control and the assertion
// passes for the wrong reason. These refuse a missing target, a wrong occurrence count, an
// identical replacement, and an output that did not change.
function mutateLiteral(source, target, replacement, label, expectedCount = 1) {
  const ok = typeof target === 'string' && target.length > 0;
  assert(ok, `[${label}] the literal mutation target is non-empty`);
  const found = ok ? source.split(target).length - 1 : 0;
  assert(found === expectedCount, `[${label}] the target occurs exactly ${expectedCount}x in the source (found ${found})`);
  assert(target !== replacement, `[${label}] the replacement differs from the target`);
  const out = ok && found === expectedCount ? source.split(target).join(replacement) : source;
  assert(out !== source, `[${label}] the mutation actually changed the assembled report`);
  return out;
}

function mutateRegex(source, pattern, replacement, expectedCount, label) {
  const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`;
  const found = (source.match(new RegExp(pattern.source, flags)) || []).length;
  assert(found > 0, `[${label}] the mutation pattern matches at least once`);
  assert(found === expectedCount, `[${label}] the pattern matches exactly ${expectedCount}x (found ${found})`);
  const out = source.replace(new RegExp(pattern.source, flags), replacement);
  assert(out !== source, `[${label}] the mutation actually changed the assembled report`);
  return out;
}

// --- Complete evidence grammar (all rendered fixture forms) -----------------------------------
// Raw seconds (`10s`, `10s-29s`) and clock forms (`MM:SS`, `HH:MM:SS`, and their intervals), with
// or without a leading Markdown dash. A displayed interval `a-b` is INCLUSIVE of `b`.
const RAW_SECONDS_STAMP = String.raw`\d{1,6}s`;
const CLOCK_STAMP = String.raw`\d{1,2}:\d{2}(?::\d{2})?`;
const ANY_STAMP = `(?:${RAW_SECONDS_STAMP}|${CLOCK_STAMP})`;
const EVIDENCE_TAG = /\[(?:VISUAL|AUDIO|TEXT)\]/;
const EVIDENCE_LINE = new RegExp(
  String.raw`^(?:[-*+][ \t]+)?(${ANY_STAMP})(?:[ \t]*[-–—][ \t]*(${ANY_STAMP}))?[ \t]+\[(VISUAL|AUDIO|TEXT)\]`);
const LABELED_MARKER = /^\*\*Slice[ \t]+(\d+)[ \t]+audio[ \t]+(evidence|justification):\*\*[ \t]*(.*)$/;
const LEADING_STAMP = new RegExp(String.raw`^(${ANY_STAMP})`);

function stampSeconds(stamp) {
  if (/^\d+s$/.test(stamp)) return Number(stamp.slice(0, -1));
  const parts = stamp.split(':').map(Number);
  return parts.length === 3 ? parts[0] * 3600 + parts[1] * 60 + parts[2] : parts[0] * 60 + parts[1];
}

// --- Independent rendered-declaration map (§16) ------------------------------------------------
// Parsed out of the assembled text, never out of the range array that produced it, so the two can
// be compared as genuinely independent statements about the same report.
const RENDERED_HEADING = /^#{1,6}[ \t]*Slice[ \t]+(\d+):[ \t]*\[(\d+)s,(\d+)s\)[ \t]*—[ \t]*(\d+)s authorized[ \t]*$/;

function parseAssembledReport(text, label) {
  const all = String(text).split('\n');
  const start = all.findIndex((l) => l.trim() === EVIDENCE_SECTION_HEADER);
  assert(start !== -1, `[${label}] the assembled report carries the canonical Section 5 header`);
  const after = all.findIndex((l, i) => i > start && l.trim() === EVIDENCE_SECTION_NEXT_HEADER);
  const body = all.slice(start + 1, after === -1 ? all.length : after);
  const declarations = [];
  body.forEach((line, i) => {
    const m = RENDERED_HEADING.exec(line.trim());
    if (m) declarations.push({ n: Number(m[1]), start: Number(m[2]), end: Number(m[3]), authorized: Number(m[4]), at: i });
  });
  declarations.forEach((d, k) => {
    d.lines = body.slice(d.at + 1, k + 1 < declarations.length ? declarations[k + 1].at : body.length);
  });
  const preamble = body.slice(0, declarations.length ? declarations[0].at : body.length);
  return { body, declarations, preamble };
}

// Timestamp-bearing evidence inside one bounded block, as an ORDERED LIST: §21's deterministic
// cycling deliberately repeats stamps, so observations must never be keyed by timestamp.
function extractEvidence(lines, label, where) {
  const found = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    if (LABELED_MARKER.test(line)) continue;
    const m = EVIDENCE_LINE.exec(line);
    if (m) {
      found.push({ line, from: stampSeconds(m[1]), to: stampSeconds(m[2] || m[1]), ranged: Boolean(m[2]), kind: m[3] });
    } else if (EVIDENCE_TAG.test(line)) {
      // Recognized as evidence, not parseable under the declared grammar: never skipped.
      assert(false, `[${label}] ${where}: recognized evidence line is parseable — "${line.slice(0, 70)}"`);
    }
  }
  return found;
}

function assertInsideRange(ev, r, label, where) {
  assert(ev.from >= r.startOffset && ev.from <= ev.to && ev.to < r.endOffset,
    `[${label}] ${where}: "${ev.line.slice(0, 58)}" lies inside authorized [${r.startOffset}s,${r.endOffset}s)`);
}

// --- The test-side scope-honesty guard (§15 §16 §17 §18 §19) ----------------------------------
// `ranges` is the EFFECTIVE array handed to validateReportQuality (§9), never a rendered heading.
function guardScopeHonesty(text, ranges, label, opts = {}) {
  const observations = opts.observations || (() => 1);
  const parsed = parseAssembledReport(text, label);

  const expected = new Map();
  ranges.forEach((r, i) => expected.set(i + 1, r));
  assert(expected.size === ranges.length, `[${label}] the expected-range map has no duplicate slice identity`);

  const rendered = new Map();
  for (const d of parsed.declarations) {
    assert(!rendered.has(d.n), `[${label}] slice ${d.n} is declared exactly once in the assembled report`);
    rendered.set(d.n, d);
  }
  assert(rendered.size === expected.size,
    `[${label}] the assembled report declares ${expected.size} slice(s) (found ${rendered.size})`);
  for (const n of rendered.keys()) assert(expected.has(n), `[${label}] no extra rendered slice ${n}`);
  for (const [n, r] of expected) {
    const d = rendered.get(n);
    assert(Boolean(d), `[${label}] slice ${n} is declared in the assembled report`);
    if (!d) continue;
    assert(d.start === r.startOffset && d.end === r.endOffset && d.authorized === r.endOffset - r.startOffset,
      `[${label}] slice ${n} renders [${d.start}s,${d.end}s) exactly matching its effective [${r.startOffset}s,${r.endOffset}s)`);
  }

  // A labeled marker in the preamble is owned by no subsection at all.
  for (const raw of parsed.preamble) {
    assert(!LABELED_MARKER.test(raw.trim()), `[${label}] no slice-labeled marker sits in the Section 5 preamble`);
  }

  let total = 0;
  for (const [n, r] of expected) {
    const d = rendered.get(n);
    if (!d) continue;
    const where = `slice ${n}`;
    let evidenceMarkers = 0, justificationMarkers = 0;
    for (const raw of d.lines) {
      const m = LABELED_MARKER.exec(raw.trim());
      if (!m) continue;
      assert(Number(m[1]) === n, `[${label}] ${where}: every labeled marker under this heading names slice ${n}`);
      if (Number(m[1]) !== n) continue;
      const stamp = LEADING_STAMP.exec(m[3]);
      assert(Boolean(stamp), `[${label}] ${where}: the ${m[2]} marker is timestamp-led`);
      if (stamp) {
        const t = stampSeconds(stamp[1]);
        assert(t >= r.startOffset && t < r.endOffset,
          `[${label}] ${where}: the ${m[2]} marker at ${stamp[1]} is inside [${r.startOffset}s,${r.endOffset}s)`);
      }
      if (m[2] === 'evidence') evidenceMarkers++; else justificationMarkers++;
    }
    if (opts.requireEvidenceMarker !== false) {
      assert(evidenceMarkers === 1, `[${label}] ${where}: exactly one audio-evidence marker (found ${evidenceMarkers})`);
    }
    if (opts.requireJustification) {
      assert(justificationMarkers === 1, `[${label}] ${where}: exactly one audio-justification marker (found ${justificationMarkers})`);
    }
    const evidence = extractEvidence(d.lines, label, where);
    const want = observations(n);
    assert(evidence.length === want, `[${label}] ${where}: ${want} timestamp-led observation(s) extracted (found ${evidence.length})`);
    for (const ev of evidence) assertInsideRange(ev, r, label, where);
    total += evidence.length;
  }
  assert(total > 0, `[${label}] the assembled report yields a NON-ZERO extracted observation count`);

  // §17 preamble: its own bucket, authorized against the expected map, never folded into a slice.
  const preamble = extractEvidence(parsed.preamble, label, 'preamble');
  assert(preamble.length === (opts.preambleObservations || 0),
    `[${label}] preamble carries ${opts.preambleObservations || 0} timestamp-led observation(s) (found ${preamble.length})`);
  for (const ev of preamble) {
    const matches = [...expected.values()].filter((r) => ev.from >= r.startOffset && ev.from <= ev.to && ev.to < r.endOffset);
    assert(matches.length === 1,
      `[${label}] preamble: "${ev.line.slice(0, 52)}" falls within EXACTLY ONE expected range (matched ${matches.length})`);
  }
  return { parsed, total, preamble: preamble.length };
}

// §15 whole-video no-op: an explicitly empty effective range array with no rendered slice
// structure has no ownership to check, so the sliced guard must not run at all.
function guardWholeVideo(text, ranges, label) {
  assert(Array.isArray(ranges) && ranges.length === 0, `[${label}] the effective range array is explicitly empty`);
  const parsed = parseAssembledReport(text, label);
  assert(parsed.declarations.length === 0, `[${label}] the whole-video report renders no slice heading`);
  for (const raw of parsed.body) {
    assert(!LABELED_MARKER.test(raw.trim()), `[${label}] the whole-video report renders no slice-labeled audio marker`);
  }
  return parsed;
}

function compliantReport(ranges = []) {
  const sliced = ranges.length > 0;
  const agg = ranges.reduce((s, r) => s + (r.endOffset - r.startOffset), 0);
  const out = [
    '## 1. TL;DR', 'ANALYSIS RESULT — a bounded forensic pass.', '',
    '## 2. VIDEO PROFILE', '**Section TL;DR:** profile.',
  ];
  if (sliced) out.push(AUTHORIZED_SCOPE_LINE(ranges.length, agg), UNDETERMINABLE_DURATION_LINE, NO_SYNTHETIC_EVIDENCE_LINE);
  out.push('', '## 3. PEOPLE, ENTITIES & SETTING', '**Section TL;DR:** people.', '',
    '## 4. DETAILED SUMMARY', '**Section TL;DR:** summary.', '',
    EVIDENCE_SECTION_HEADER, '**Section TL;DR:** evidence.');
  ranges.forEach((r, i) => {
    const n = i + 1;
    out.push(SLICE_HEADING(n, r),
      `**Slice ${n} audio status:** SPEECH`,
      // V4 REVISION 8: both timestamps are DERIVED from the range this line is filed under. The
      // displayed interval ends on the last observable second, because the authorized range is
      // half-open: `[10,30)` is observed as `10s-29s`, never `10s-30s`.
      `**Slice ${n} audio evidence:** ${mmss(r.startOffset)} — a spoken phrase`,
      `**Slice ${n} transcription anchor:** "hold this position"`,
      `${r.startOffset}s-${r.endOffset - 1}s [VISUAL] steady framing across this slice`);
  });
  if (!sliced) out.push('00:01 [VISUAL] opening frame');
  out.push('', EVIDENCE_SECTION_NEXT_HEADER, '**Section TL;DR:** claims.', '',
    '## 7. DISCREPANCIES & CROSS-CHECKS', '**Section TL;DR:** cross-checks.', '',
    '## 8. SOURCE-CREDIBILITY ASSESSMENT', '**Section TL;DR:** credibility.', '',
    '## 9. LIMITATIONS OF THIS ANALYSIS', '**Section TL;DR:** limits.');
  return out.join('\n');
}
// --- V4Q FINAL (§9): the complete, hand-written, realistic passing fixture --------------------
// A nine-section, two-slice report for a static-imagery guided-meditation video, written the way a
// correct response actually reads rather than as a minimal shape that satisfies the gate. It is the
// standing answer to "is this contract over-strict?": if a genuinely correct report cannot pass,
// this fixture fails first and loudly.
const MEDITATION_RANGES = [{ startOffset: 0, endOffset: 90 }, { startOffset: 600, endOffset: 690 }];
const MEDITATION_REPORT = [
  '## 1. TL;DR',
  'A guided-meditation upload built around a single unmoving illustrated landscape, with a calm female narrator leading a breathing exercise over a sustained instrumental bed. Across both authorized windows the frame never cuts, pans, or zooms; all change is in the audio. The narrator gives breath counts and short affirmations, and a lower-third caption offers a companion app at the ten-minute mark. Nothing on screen identifies the creator, and no claim of therapeutic benefit is made in the portions supplied.',
  '',
  '## 2. VIDEO PROFILE',
  '**Section TL;DR:** A static 16:9 illustrated still serving as a bed for narrated breathing guidance, produced to a modest but competent standard.',
  '**Authorized scope:** 2 slice(s), aggregate 180s',
  '**Source duration:** UNDETERMINABLE FROM AUTHORIZED SLICES',
  '**Synthetic-media assessment:** NO OBSERVABLE EVIDENCE',
  'Aspect ratio is 16:9 with no letterboxing. The presentation is consistent with a long-form YouTube upload rather than a vertical short. Production quality is prosumer: the illustration is cleanly drawn and the audio bed is level, but there is no editing to assess because the image never changes. No watermark, channel bug, or re-upload border appears in either window.',
  '',
  '## 3. PEOPLE, ENTITIES & SETTING',
  '**Section TL;DR:** One unseen female narrator and one on-screen app caption; no person is visible at any point.',
  'Speaker 1 is an unseen female narrator with a measured, low-volume delivery. She is never shown and is not named on screen in either window. The only identifiable entity is a caption reading "Stillwater — daily sessions" at 10:14. The depicted setting is an illustrated lakeshore at dusk; it is artwork, not a filmed location, and it does not change.',
  '',
  '## 4. DETAILED SUMMARY',
  '**Section TL;DR:** An opening orientation and breath count, then a mid-session body-scan segment, both over one unchanging illustration.',
  'The opening window establishes the exercise: the narrator asks the listener to settle, then leads a four-count inhale and six-count exhale, repeated twice. The mid-session window is further into a body scan, moving attention from shoulders to jaw. The instrumental bed is continuous across both windows and does not resolve or restart within either. Because the two windows are not adjacent, no claim is made here about what happens between them.',
  '',
  '## 5. COMPREHENSIVE TIMESTAMPED FINDINGS',
  '**Section TL;DR:** Two authorized windows, each visually static and carrying distinct narration over a continuous instrumental bed.',
  '### Slice 1: [0s,90s) — 90s authorized',
  '**Slice 1 audio status:** SPEECH',
  '**Slice 1 audio evidence:** 00:06 — a female voice begins speaking over a sustained pad; breath counts are audible and unhurried',
  '**Slice 1 transcription anchor:** "let the shoulders drop away from the ears"',
  '00:00-00:05 [VISUAL] illustrated lakeshore at dusk, no motion, no titles',
  '00:06-01:29 [VISUAL] identical frame held; no cut, pan, zoom, or overlay for the remainder of the window',
  '00:06 [AUDIO] narration begins; synthesized ambient pad already established underneath',
  '00:22 [AUDIO] first four-count inhale instruction, followed by a six-count exhale',
  '01:04 [AUDIO] the same breath pattern is repeated once, with no change in the instrumental bed',
  '',
  '### Slice 2: [600s,690s) — 90s authorized',
  '**Slice 2 audio status:** SPEECH',
  '**Slice 2 audio evidence:** 10:02 — the same female voice continues a body-scan instruction; the instrumental bed is unchanged in timbre and level',
  '**Slice 2 transcription anchor:** "notice the jaw, and let it soften"',
  '10:00-11:29 [VISUAL] the identical illustrated frame, still with no motion or transition',
  '10:14 [TEXT] lower-third caption appears: "Stillwater — daily sessions"',
  '10:02 [AUDIO] body-scan narration in progress, attention moving from shoulders to jaw',
  '10:41 [AUDIO] synthesized strings enter beneath the pad and sustain to the end of the window',
  '',
  '## 6. CLAIMS, NUMBERS & CALLS TO ACTION',
  '**Section TL;DR:** One on-screen brand caption and one implicit call to action; no health or outcome claims in the authorized windows.',
  'The only call to action is the caption "Stillwater — daily sessions" at 10:14, which names a product but gives no URL, price, or promo code. The narrator states two numbers, both breath counts: "four" and "six". No therapeutic, medical, or outcome claim is made in either window.',
  '',
  '## 7. DISCREPANCIES & CROSS-CHECKS',
  '**Section TL;DR:** One real channel disagreement: the audio advances continuously while the visual channel supplies no corroborating change.',
  'The audio channel establishes clear forward progress — an opening orientation in the first window and a mid-session body scan in the second — while the visual channel is identical in both and therefore corroborates neither position. Nothing on screen confirms that the second window is later in the session; that ordering rests entirely on the supplied offsets and the narration content. The caption at 10:14 names "Stillwater", but no channel identity is visible anywhere else in the authorized windows, so the caption cannot be cross-checked against an uploader.',
  '',
  '## 8. SOURCE-CREDIBILITY ASSESSMENT',
  '**Section TL;DR:** Low attributability: competent production, but nothing in the authorized windows identifies who made it.',
  'The material is internally consistent and free of the artifacts that would suggest a re-upload, but attribution is weak: no channel branding, no spoken attribution, and no on-screen credit appear in either window. The single caption names a product rather than a publisher. Credibility beyond the authorized windows cannot be assessed.',
  '',
  '## 9. LIMITATIONS OF THIS ANALYSIS',
  '**Section TL;DR:** Only two bounded windows were supplied; everything outside them is unexamined and unknowable from this pass.',
  'Only the two authorized windows were available, and nothing outside them was observed. The source duration cannot be determined from these slices, so no statement is made about how much material sits before, between, or after them. Analysis samples roughly one frame per second, so a brief flash between sampled frames could have been missed — though with a completely static image that risk is low here. Whether the narration is a live human take or an assembled read cannot be determined from what was supplied.',
].join('\n');

const bodyFor = (ranges = []) => ({
  candidates: [{ content: { parts: [{ text: compliantReport(ranges) }] }, finishReason: 'STOP' }],
  usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5, totalTokenCount: 15, promptTokensDetails: [] },
});
const SUCCESS_BODY = bodyFor();
const S2_RANGES = [{ startOffset: 10, endOffset: 30 }, { startOffset: 60, endOffset: 90 }];
const SLICED_BODY = bodyFor(S2_RANGES);
const U503 = { error: { code: 503, status: 'UNAVAILABLE', message: 'The model is overloaded. Please try again later.' } };
function resp(status, body, opts = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => { if (opts.malformed) throw new Error('unexpected token'); return body; },
  };
}
// V4Q: the diagnostic directory is MANDATORY before any submission, and the diagnostic writer is
// fully dependency-injected here so no test ever touches a real filesystem path. `writes` records
// what WOULD have been persisted, which is how the diagnostic-lifecycle assertions below inspect
// the preserved bytes without creating files.
const FAKE_DIAG_DIR = process.platform === 'win32' ? 'C:\\v4q-fake-run' : '/v4q-fake-run';
function makeDeps(responses, fsOpts = {}) {
  const calls = [];
  const sleeps = [];
  const logs = [];
  const errs = [];
  const writes = [];
  const renames = [];
  const existing = new Set(fsOpts.existing || []);
  return {
    calls, sleeps, logs, errs, writes, renames,
    deps: {
      fetchImpl: async (url, opts) => {
        calls.push({ url, body: opts.body, headers: opts.headers });
        const next = responses.shift();
        if (next instanceof Error) throw next;
        return next;
      },
      sleep: async (ms) => { sleeps.push(ms); },
      random: () => 0.4, // deterministic jitter: delays become exactly 1200 and 2200 ms
      log: (l) => logs.push(String(l)),
      logError: (l) => errs.push(String(l)),
      env: { GEMINI_API_KEY: 'SECRET-KEY-123' },
      statSync: fsOpts.statSync || (() => ({ isDirectory: () => true })),
      existsSync: (p) => existing.has(p),
      writeFileSync: (p, buf) => {
        if (fsOpts.writeThrows) throw new Error('EACCES: permission denied');
        writes.push({ path: p, buf });
      },
      renameSync: (from, to) => { renames.push({ from, to }); },
      unlinkSync: () => {},
    },
  };
}
const ARGS = ['--url', 'https://youtu.be/test', '--prompt-text', 'SECRET-PROMPT-XYZ analyze this', '--media-resolution', 'LOW', '--diagnostic-dir', FAKE_DIAG_DIR];
const usageCount = (logs) => logs.filter((l) => l.includes('[video-scout usage]')).length;
const textCount = (logs) => logs.filter((l) => l.includes('ANALYSIS RESULT')).length;

(async () => {

  section('K5 first-attempt success: one request, no sleep, output once');
  {
    const h = makeDeps([resp(200, SUCCESS_BODY)]);
    const code = await runVideoScout(ARGS, h.deps);
    assert(code === 0, 'returns exit code 0');
    assert(h.calls.length === 1, 'exactly one request submitted');
    assert(h.sleeps.length === 0, 'no sleep on the success path');
    assert(textCount(h.logs) === 1 && usageCount(h.logs) === 1, 'analysis text and usage line print exactly once');
    assert(h.logs.some((l) => l.includes('bounded 503 retry policy active (max 3 attempts)')),
      'the ordinary operational line announces the bounded policy');
  }

  section('K5 503 -> success: two requests, one bounded delay, recovery reported');
  {
    const h = makeDeps([resp(503, U503), resp(200, SUCCESS_BODY)]);
    const code = await runVideoScout(ARGS, h.deps);
    assert(code === 0, 'returns 0 after recovery');
    assert(h.calls.length === 2, 'exactly two requests');
    assert(h.sleeps.length === 1 && h.sleeps[0] === 1200, 'one delay of exactly base+0.4*jitter = 1200 ms');
    assert(h.errs.some((l) => /HTTP 503 UNAVAILABLE — attempt 1\/3; retrying in 1\.2s/.test(l)),
      'retry line shows status, parsed status word, attempt counter, and delay');
    assert(h.logs.some((l) => l.includes('recovered on attempt 2/3')), 'successful recovery names the attempt');
    assert(textCount(h.logs) === 1 && usageCount(h.logs) === 1, 'output and usage still print exactly once');
  }

  section('K5 503, 503 -> success: three requests, two bounded delays');
  {
    const h = makeDeps([resp(503, U503), resp(503, U503), resp(200, SUCCESS_BODY)]);
    const code = await runVideoScout(ARGS, h.deps);
    assert(code === 0 && h.calls.length === 3, 'three requests, recovered');
    assert(h.sleeps.length === 2 && h.sleeps[0] === 1200 && h.sleeps[1] === 2200,
      'delays are exactly 1200 then 2200 ms (exponential + deterministic jitter, within documented bounds)');
    assert(h.logs.some((l) => l.includes('recovered on attempt 3/3')), 'recovery names attempt 3/3');
    assert(usageCount(h.logs) === 1, 'usage prints once even after two retries');
    const bodies = h.calls.map((c) => c.body);
    assert(bodies[0] === bodies[1] && bodies[1] === bodies[2], 'every retry submits the byte-identical request body');
    const expected = JSON.stringify(buildRequestBody({ url: 'https://youtu.be/test', prompt: 'SECRET-PROMPT-XYZ analyze this', mediaResolution: 'LOW' }));
    assert(bodies[0] === expected, 'and that body is exactly the validated original (URL/prompt/model/resolution cannot drift)');
  }

  section('K5 three 503s: stops permanently at three attempts');
  {
    const h = makeDeps([resp(503, U503), resp(503, U503), resp(503, U503), resp(200, SUCCESS_BODY)]);
    const code = await runVideoScout(ARGS, h.deps);
    assert(code === 1, 'returns 1 after the third 503');
    assert(h.calls.length === 3, 'exactly three requests — the cap is structural, a fourth response is never fetched');
    assert(h.sleeps.length === 2, 'only two delays exist for three attempts');
    assert(h.errs.some((l) => l.includes('(attempt 3/3) — giving up after 3 attempts') && l.includes('HTTP 503')),
      'final failure names the HTTP status, the attempt cap, and gives up visibly');
    assert(usageCount(h.logs) === 0 && textCount(h.logs) === 0,
      'failed attempts produce no usage line and no analysis text (nothing completed-looking)');
  }

  section('K5 parsed UNAVAILABLE on a non-terminal status is retryable');
  {
    const h = makeDeps([resp(500, { error: { status: 'UNAVAILABLE', message: 'overloaded' } }), resp(200, SUCCESS_BODY)]);
    const code = await runVideoScout(ARGS, h.deps);
    assert(code === 0 && h.calls.length === 2, 'HTTP 500 + parsed UNAVAILABLE body retries and recovers');
  }

  section('K5 explicit terminal statuses: never retried');
  for (const s of [400, 401, 403, 404, 429]) {
    const h = makeDeps([resp(s, { error: { status: 'FAILED_PRECONDITION', message: 'nope' } }), resp(200, SUCCESS_BODY)]);
    const code = await runVideoScout(ARGS, h.deps);
    assert(code === 1 && h.calls.length === 1 && h.sleeps.length === 0, `HTTP ${s} is terminal on the first response (no retry, no sleep)`);
  }

  section('K5 contradictory body: terminal status outranks UNAVAILABLE claim');
  for (const s of [400, 429]) {
    const h = makeDeps([resp(s, U503), resp(200, SUCCESS_BODY)]);
    const code = await runVideoScout(ARGS, h.deps);
    assert(code === 1 && h.calls.length === 1, `HTTP ${s} with an UNAVAILABLE body is still terminal (correction #1)`);
  }

  section('K5 ambiguous fetch rejection: visible, never retried');
  {
    const h = makeDeps([new Error('socket hang up mid-flight')]);
    const code = await runVideoScout(ARGS, h.deps);
    assert(code === 1 && h.calls.length === 1 && h.sleeps.length === 0, 'a rejected fetch gets no second attempt');
    assert(h.errs.some((l) => l.includes('network error (ambiguous — not retried)')), 'the ambiguity is stated visibly');
  }

  section('K5 malformed JSON on a 503 does not disable status-based retry');
  {
    const h = makeDeps([resp(503, null, { malformed: true }), resp(200, SUCCESS_BODY)]);
    const code = await runVideoScout(ARGS, h.deps);
    assert(code === 0 && h.calls.length === 2, 'a 503 whose body fails to parse still retries on the status');
  }

  section('V4Q empty SUCCESS response takes the FULL quality-gate lifecycle (no early exit)');
  {
    // An empty success is still a BILLED provider response. The corrected lifecycle extracts usage
    // first, classifies the empty text through the gate, preserves it as a valid ZERO-BYTE
    // diagnostic, emits the canonical quality line, and exits non-zero -- with no retry, repair,
    // fallback, or continuation. The old early return skipped usage extraction entirely and dumped
    // the raw candidate object (provider content) into the log.
    const emptyBody = (finishReason) => ({
      candidates: [{ content: { parts: [] }, finishReason }],
      usageMetadata: { promptTokenCount: 1234, candidatesTokenCount: 0, totalTokenCount: 1234, promptTokensDetails: [{ modality: 'VIDEO', tokenCount: 1200 }] },
    });
    const cases = [
      ['STOP', 'missing-section'],
      ['MAX_TOKENS', 'finish-max-tokens'],
      ['SAFETY', 'finish-not-stop'],
      [undefined, 'finish-not-stop'],
      ['SOME_UNDOCUMENTED_REASON', 'finish-not-stop'],
    ];
    for (const [finishReason, expectedCode] of cases) {
      const label = finishReason === undefined ? 'missing finishReason' : finishReason;
      // A second response is queued to prove it is NEVER consumed.
      const h = makeDeps([resp(200, emptyBody(finishReason)), resp(200, SUCCESS_BODY)]);
      const code = await runVideoScout(ARGS, h.deps);
      assert(code === 1, `${label} + empty text: exits non-zero`);
      assert(h.calls.length === 1, `${label}: EXACTLY one provider submission (no retry/repair/continuation)`);
      const q = h.logs.filter((l) => l.startsWith('[video-scout quality]'));
      assert(q.length === 1, `${label}: exactly one canonical quality line`);
      const m = /^\[video-scout quality\] rejected code=(\S+) file=(\S+) bytes=(\d+) sha256=([0-9a-f]{64})$/.exec(q[0]);
      assert(m && m[1] === expectedCode, `${label} + empty text -> ${expectedCode}`);
      assert(QUALITY_FAILURE_CODES.includes(m[1]), `${label}: the code is inside the closed allowlist`);
      // USAGE is preserved -- the run was paid for and the manifest must be able to record it.
      const usage = h.logs.filter((l) => l.includes('[video-scout usage]'));
      assert(usage.length === 1 && usage[0].includes('video=1200'), `${label}: usage is preserved exactly once`);
      // A VALID ZERO-BYTE artifact is written -- "empty" is still evidence of what arrived.
      assert(h.writes.length === 1 && h.renames.length === 1, `${label}: the diagnostic is written once and renamed once`);
      assert(h.writes[0].buf.length === 0 && Number(m[3]) === 0, `${label}: the preserved artifact is a valid ZERO-BYTE file`);
      assert(m[4] === crypto.createHash('sha256').update(Buffer.alloc(0)).digest('hex'),
        `${label}: the reported hash is the SHA-256 of the empty artifact`);
      assert(h.renames[0].to === path.join(FAKE_DIAG_DIR, DIAGNOSTIC_FILENAME), `${label}: it lands on the fixed leaf`);
      // No report, and no provider content in the logs.
      assert(!h.logs.some((l) => l.includes('candidates') || l.includes('finishReason')),
        `${label}: the raw candidate object never reaches the log (the old path dumped it)`);
    }
  }

  section('K5 diagnostics hygiene: key and prompt never enter logs');
  {
    const h = makeDeps([resp(503, U503), resp(503, U503), resp(503, U503)]);
    await runVideoScout(ARGS, h.deps);
    const everything = h.logs.concat(h.errs).join('\n');
    assert(!everything.includes('SECRET-KEY-123'), 'the API key appears in no log or error line');
    assert(!everything.includes('SECRET-PROMPT-XYZ'), 'the prompt appears in no log or error line');
    assert(h.calls.every((c) => c.headers['x-goog-api-key'] === 'SECRET-KEY-123'), '(the key still reaches the request header, its only legitimate destination)');
  }

  section('K5 validation failures return 1 without any network attempt');
  {
    const h = makeDeps([]);
    const noKey = { ...h.deps, env: {} };
    assert((await runVideoScout(ARGS, noKey)) === 1 && h.calls.length === 0, 'missing GEMINI_API_KEY: return 1, zero fetches');
    assert((await runVideoScout(['--prompt-text', 'p'], h.deps)) === 1 && h.calls.length === 0, 'missing --url: return 1, zero fetches');
    assert((await runVideoScout(['--url', 'u'], h.deps)) === 1 && h.calls.length === 0, 'missing prompt: return 1, zero fetches');
    assert((await runVideoScout(['--url', 'u', '--prompt-text', 'p', '--start-offset', '9'], h.deps)) === 1 && h.calls.length === 0,
      'slice refusal: return 1, zero fetches (guards unchanged)');
  }

  section('K5 no forced exit in production source');
  {
    const src = fs.readFileSync(path.join(__dirname, 'gemini-video-sdk.js'), 'utf8');
    // Strip //-comment tails first: the shutdown-contract COMMENTS mention process.exit() by
    // name; the check is that no executable code calls it. Split on \r?\n — on a CRLF
    // checkout (git autocrlf materializes CRLF on fresh worktrees) a plain '\n' split leaves
    // a trailing \r on every line, and JS '$' will not match before '\r', so the comment
    // strip silently no-ops and the comments themselves trip the regex.
    const codeOnly = src.split(/\r?\n/).map((l) => l.replace(/\/\/.*$/, '')).join('\n');
    assert(!/process\.exit\s*\(/.test(codeOnly), 'gemini-video-sdk.js contains no process.exit( in executable code');
    assert(/if \(require\.main === module\) runCliEntry\(\);/.test(src), 'require.main invokes the exported runCliEntry adapter (same one the child fixture calls)');
  }

  section('K5 runCliEntry adapter: sets process.exitCode, catches unexpected throws');
  {
    const savedArgv = process.argv;
    const savedExitCode = process.exitCode;
    try {
      process.argv = ['node', 'gemini-video-sdk.js', ...ARGS];
      const ok = makeDeps([resp(200, SUCCESS_BODY)]);
      await runCliEntry(ok.deps);
      assert(process.exitCode === 0, 'adapter writes exitCode 0 from a successful run');
      process.exitCode = undefined;
      const fail = makeDeps([resp(503, U503), resp(503, U503), resp(503, U503)]);
      await runCliEntry(fail.deps);
      assert(process.exitCode === 1, 'adapter writes exitCode 1 from a failed run');
      process.exitCode = undefined;
      // Force an unexpected throw OUTSIDE the operation's own handling: a log sink that dies.
      const boom = makeDeps([resp(200, SUCCESS_BODY)]);
      boom.deps.log = () => { throw new Error('log sink exploded'); };
      const errs = [];
      boom.deps.logError = (l) => errs.push(String(l));
      await runCliEntry(boom.deps);
      assert(process.exitCode === 1, 'an unexpected top-level throw still ends with exitCode 1 (no forced kill)');
      assert(errs.some((l) => l.includes('[video-scout sdk] unexpected failure:')), 'and is reported visibly through the single catch');
    } finally {
      process.argv = savedArgv;
      process.exitCode = savedExitCode;
    }
  }

  // ── child-process fixture: the REAL adapter + REAL sleeps + natural shutdown ─────────
  section('K5 child-process fixture: natural shutdown, no native assertion');
  {
    const counters = new Map();
    const server = http.createServer((req, res) => {
      const n = (counters.get(req.url) || 0) + 1;
      counters.set(req.url, n);
      const fail503 = req.url.startsWith('/always-503') ? Infinity : (req.url.startsWith('/flaky-2') ? 2 : 0);
      if (n <= fail503) {
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(U503));
      } else {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(SUCCESS_BODY));
      }
    });
    const port = await new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));
    // V4Q: the child runs the REAL adapter, so it enforces the real --diagnostic-dir precondition.
    // Give it an actual empty temp directory. The fixture responses are quality-COMPLIANT, so no
    // diagnostic is ever written here — which is itself asserted below.
    const childDiagDir = fs.mkdtempSync(path.join(os.tmpdir(), 'v4q-child-'));
    const CHILD_ARGS = ARGS.map((a) => (a === FAKE_DIAG_DIR ? childDiagDir : a));
    const runChild = (fixturePath) => new Promise((resolve) => {
      const t0 = Date.now();
      execFile(process.execPath, [path.join(__dirname, 'test-fixtures', 'gemini-sdk-child.js'), ...CHILD_ARGS], {
        env: { ...process.env, GEMINI_API_KEY: 'dummy-child-key', K5_FIXTURE_PORT: String(port), K5_FIXTURE_PATH: fixturePath },
        timeout: 60000,
      }, (err, stdout, stderr) => {
        resolve({ code: err ? err.code : 0, stdout: String(stdout), stderr: String(stderr), ms: Date.now() - t0 });
      });
    });

    const failRun = await runChild('/always-503');
    assert(failRun.code === 1, 'always-503 child exits with code 1 (clean, natural shutdown)');
    assert(!/Assertion failed|UV_HANDLE_CLOSING/i.test(failRun.stderr + failRun.stdout),
      'always-503 child output contains neither "Assertion failed" nor "UV_HANDLE_CLOSING"');
    assert(counters.get('/always-503') === 3, 'always-503 child submitted exactly three requests');
    assert(/giving up after 3 attempts/.test(failRun.stderr), 'child reports the visible give-up line');
    assert(!failRun.stdout.includes('[video-scout usage]'), 'a fully-failed child prints no usage line');

    const okRun = await runChild('/flaky-2');
    assert(okRun.code === 0, '503,503,success child exits 0 through the real adapter');
    assert(okRun.ms < 30000, 'and does so without hanging (bounded wall time)');
    assert(counters.get('/flaky-2') === 3, 'flaky child submitted exactly three requests');
    assert((okRun.stdout.match(/\[video-scout usage\]/g) || []).length === 1, 'recovered child prints the usage line exactly once');
    assert(okRun.stdout.includes('recovered on attempt 3/3'), 'recovered child names the winning attempt');
    assert(!/Assertion failed|UV_HANDLE_CLOSING/i.test(okRun.stderr + okRun.stdout), 'recovered child output is assertion-free');
    // A quality-compliant response leaves NO diagnostic behind: evidence is preserved only on
    // rejection, never as a side effect of a normal run.
    assert(fs.readdirSync(childDiagDir).length === 0,
      'a compliant response creates no diagnostic file in the run directory');

    server.close();
    fs.rmSync(childDiagDir, { recursive: true, force: true });
  }

  // ============================== V4 bounded multi-slice ======================================
  const { resolveSliceRanges, buildAuthorizedScopeInstruction, MIN_MULTI_SLICES, MAX_SLICES,
    AGGREGATE_SLICE_CAP_SECONDS, MAX_SLICE_RANGES_JSON_UNITS } = require('./gemini-video-sdk');
  const S2 = '[{"startOffset":10,"endOffset":30},{"startOffset":60,"endOffset":90}]';
  const sliceArgs = (json, extra = []) => ['--url', 'https://youtu.be/test', '--prompt-text', 'BRIEF-TEXT analyze', '--media-resolution', 'LOW', '--diagnostic-dir', FAKE_DIAG_DIR, '--slice-ranges-json', json, ...extra];

  section('V4 constants + resolveSliceRanges contract (full independent re-enforcement)');
  {
    assert(MIN_MULTI_SLICES === 2 && MAX_SLICES === 8 && AGGREGATE_SLICE_CAP_SECONDS === 1800 && MAX_SLICE_RANGES_JSON_UNITS === 2048,
      'V4 bounds pinned: 2-8 slices, fixed 1800s aggregate, 2048-unit serialized bound');
    assert(resolveSliceRanges(parseArgs([])).multi === false, 'flag absent -> multi:false (whole-video/scalar behavior untouched)');
    assert(resolveSliceRanges(parseArgs(['--slice-ranges-json'])).error, 'valueless trailing flag refuses (never "not passed")');
    assert(resolveSliceRanges(parseArgs(['--slice-ranges-json', S2, '--start-offset', '5'])).error.includes('mutually exclusive'),
      'slices + scalar offset flags refuse (mutual exclusion, either order)');
    const big = '[' + Array(200).fill('{"startOffset":1,"endOffset":2}').join(',') + ']';
    assert(big.length > 2048 && /2048-unit bound/.test(resolveSliceRanges(parseArgs(['--slice-ranges-json', big])).error),
      'over-2048-unit payload refuses BEFORE parsing');
    assert(resolveSliceRanges(parseArgs(['--slice-ranges-json', '{not json'])).error.includes('not valid JSON'), 'malformed JSON refuses');
    assert(resolveSliceRanges(parseArgs(['--slice-ranges-json', '{"startOffset":1,"endOffset":2}'])).error.includes('array'),
      'a bare object refuses (array required)');
    assert(resolveSliceRanges(parseArgs(['--slice-ranges-json', '[{"startOffset":1,"endOffset":2}]'])).error.includes('2 to 8'),
      'a 1-entry array refuses (scalar path owns single slices)');
    const nine = JSON.stringify(Array.from({ length: 9 }, (_, i) => ({ startOffset: i * 20, endOffset: i * 20 + 10 })));
    assert(resolveSliceRanges(parseArgs(['--slice-ranges-json', nine])).error.includes('2 to 8'), 'a 9-entry array refuses');
    assert(resolveSliceRanges(parseArgs(['--slice-ranges-json', '[{"startOffset":10,"endOffset":30},{"startOffset":60,"endOffset":90,"x":1}]'])).error.includes('exactly the keys'),
      'an extra key refuses (exact-shape entries)');
    assert(resolveSliceRanges(parseArgs(['--slice-ranges-json', '[{"startOffset":10,"endOffset":30},{"startOffset":60.5,"endOffset":90}]'])).error.includes('whole seconds'),
      'a fractional offset refuses');
    assert(resolveSliceRanges(parseArgs(['--slice-ranges-json', '[{"startOffset":10,"endOffset":30},{"startOffset":"60","endOffset":90}]'])).error.includes('whole seconds'),
      'a string offset refuses (never coerced)');
    assert(resolveSliceRanges(parseArgs(['--slice-ranges-json', '[{"startOffset":10,"endOffset":30},{"startOffset":60,"endOffset":86401}]'])).error.includes('86400'),
      'an offset beyond 86400 refuses');
    assert(resolveSliceRanges(parseArgs(['--slice-ranges-json', '[{"startOffset":10,"endOffset":30},{"startOffset":90,"endOffset":90}]'])).error.includes('strictly after'),
      'end == start refuses');
    assert(resolveSliceRanges(parseArgs(['--slice-ranges-json', '[{"startOffset":10,"endOffset":30},{"startOffset":20,"endOffset":40}]'])).error.includes('chronological and non-overlapping'),
      'overlap refuses');
    assert(resolveSliceRanges(parseArgs(['--slice-ranges-json', '[{"startOffset":100,"endOffset":200},{"startOffset":10,"endOffset":50}]'])).error.includes('never reordered'),
      'out-of-order refuses — never silently reordered');
    const adj = resolveSliceRanges(parseArgs(['--slice-ranges-json', '[{"startOffset":10,"endOffset":20},{"startOffset":20,"endOffset":30}]']));
    assert(adj.multi === true, 'adjacent slices are allowed');
    const eightOk = JSON.stringify(Array.from({ length: 8 }, (_, i) => ({ startOffset: i * 400, endOffset: i * 400 + 225 })));
    const okAgg = resolveSliceRanges(parseArgs(['--slice-ranges-json', eightOk]));
    assert(okAgg.multi === true && okAgg.aggregateSeconds === 1800, 'exactly 1800s aggregate is accepted (inclusive cap)');
    const eightOver = Array.from({ length: 8 }, (_, i) => ({ startOffset: i * 400, endOffset: i * 400 + 225 }));
    eightOver[7] = { startOffset: 2800, endOffset: 3026 };
    assert(resolveSliceRanges(parseArgs(['--slice-ranges-json', JSON.stringify(eightOver)])).error.includes('1801s'),
      '1801s aggregate refuses (fixed cap, no flag can raise it)');
    const ok2 = resolveSliceRanges(parseArgs(['--slice-ranges-json', S2]));
    assert(ok2.multi === true && ok2.aggregateSeconds === 50
      && ok2.ranges.map((r) => `${r.startOffset}-${r.endOffset}`).join(',') === '10-30,60-90',
      'a valid 2-slice payload resolves with exact ordered ranges + aggregate');
  }

  section('V4Q authorized-scope instruction (deterministic, structure-preserving, 1-8 ranges)');
  {
    const text = buildAuthorizedScopeInstruction([{ startOffset: 10, endOffset: 30 }, { startOffset: 60, endOffset: 90 }]);
    assert(text.includes('2 AUTHORIZED VIDEO SLICES'), 'names the slice count');
    assert(text.includes('### Slice 1: [10s,30s) — 20s authorized') && text.includes('### Slice 2: [60s,90s) — 30s authorized'),
      'lists chronological labels with exact half-open endpoints and lengths');
    assert(/ONLY these explicit slices are authorized/.test(text), 'states only the explicit slices are authorized');
    assert(/distinguishable/.test(text), 'asks for per-slice attribution in the report');
    assert(text.includes('## 1. TL;DR'), 'preserves the report-leading TL;DR requirement');
    assert(!/update_topic|tool|fetch|argv|JSON payload/i.test(text), 'no transport/tool-call internals leak into the prompt');
    assert(text === buildAuthorizedScopeInstruction([{ startOffset: 10, endOffset: 30 }, { startOffset: 60, endOffset: 90 }]),
      'deterministic: identical input -> identical instruction');
    // V4Q: the acceptance ORACLES must never be sent. The gate is about structure; the subject,
    // the video's age, and the channel's size are how a HUMAN judges the answer afterwards.
    assert(!/meditation|breathing|mindful|subscriber|channel size|years old/i.test(text),
      'the known meditation subject, video age, and channel size never enter the provider prompt');

    // The scalar path composes through the SAME helper — this is the V4Q defect being repaired.
    const one = buildAuthorizedScopeInstruction([{ startOffset: 60, endOffset: 75 }]);
    assert(one.includes('1 AUTHORIZED VIDEO SLICE ---') && !one.includes('AUTHORIZED VIDEO SLICES'),
      'a single range produces correct singular wording');
    assert(one.includes('### Slice 1: [60s,75s) — 15s authorized'), 'the scalar slice gets an exact heading');
    assert(one.includes('**Slice N audio status:**') && one.includes('**Slice N transcription anchor:**')
      && one.includes('**Source duration:** UNDETERMINABLE FROM AUTHORIZED SLICES')
      && one.includes('**Synthetic-media assessment:** NO OBSERVABLE EVIDENCE'),
      'the scalar slice receives the SAME audio, anti-speculation, and synthetic contract as multipart');
    for (let n = 1; n <= 8; n++) {
      const rs = Array.from({ length: n }, (_, i) => ({ startOffset: i * 100, endOffset: i * 100 + 20 }));
      const t = buildAuthorizedScopeInstruction(rs);
      assert(rs.every((r, i) => t.includes(`### Slice ${i + 1}: [${r.startOffset}s,${r.endOffset}s) — 20s authorized`)),
        `${n}-range scope instruction names every authorized slice exactly`);
    }
  }

  section('V4 golden request bodies (zero/one-slice unchanged; exact multipart for 2 and 8)');
  {
    // V4Q: the media-part structure below is UNCHANGED; generationConfig now additionally carries the
    // SDK-owned output bound (and, for sliced Pro only, the reviewed thinking budget).
    const whole = buildRequestBody({ url: 'https://youtu.be/x', prompt: 'P', mediaResolution: 'LOW' });
    assert(JSON.stringify(whole) === '{"contents":[{"role":"user","parts":[{"fileData":{"fileUri":"https://youtu.be/x"}},{"text":"P"}]}],"generationConfig":{"mediaResolution":"MEDIA_RESOLUTION_LOW","maxOutputTokens":16384}}',
      'GOLDEN: zero-slice body keeps its exact part shape (+ V4Q output bound, no thinkingConfig)');
    const single = buildRequestBody({ url: 'https://youtu.be/x', prompt: 'P', mediaResolution: 'LOW', startOffset: 5, endOffset: 9 });
    assert(JSON.stringify(single) === '{"contents":[{"role":"user","parts":[{"fileData":{"fileUri":"https://youtu.be/x"},"videoMetadata":{"startOffset":"5s","endOffset":"9s"}},{"text":"P"}]}],"generationConfig":{"mediaResolution":"MEDIA_RESOLUTION_LOW","maxOutputTokens":16384}}',
      'GOLDEN: one-slice body keeps its exact part shape (+ V4Q output bound, no thinkingConfig without Pro)');
    const two = buildRequestBody({ url: 'https://youtu.be/x', prompt: 'P', mediaResolution: 'LOW', sliceRanges: [{ startOffset: 10, endOffset: 30 }, { startOffset: 60, endOffset: 90 }] });
    assert(JSON.stringify(two) === '{"contents":[{"role":"user","parts":[{"fileData":{"fileUri":"https://youtu.be/x"},"videoMetadata":{"startOffset":"10s","endOffset":"30s"}},{"fileData":{"fileUri":"https://youtu.be/x"},"videoMetadata":{"startOffset":"60s","endOffset":"90s"}},{"text":"P"}]}],"generationConfig":{"mediaResolution":"MEDIA_RESOLUTION_LOW","maxOutputTokens":16384}}',
      'GOLDEN: exact 2-slice multipart JSON — N ordered media parts, same URL, own metadata each, ONE text part LAST');
    const twoPro = buildRequestBody({ url: 'https://youtu.be/x', prompt: 'P', model: 'gemini-2.5-pro', mediaResolution: 'LOW', sliceRanges: [{ startOffset: 10, endOffset: 30 }, { startOffset: 60, endOffset: 90 }] });
    assert(JSON.stringify(twoPro.generationConfig) === '{"mediaResolution":"MEDIA_RESOLUTION_LOW","maxOutputTokens":16384,"thinkingConfig":{"thinkingBudget":8192}}',
      'GOLDEN: sliced Pro adds exactly the reviewed 8192 thinking budget and nothing else');
    const ranges8 = Array.from({ length: 8 }, (_, i) => ({ startOffset: i * 400, endOffset: i * 400 + 225 }));
    const eight = buildRequestBody({ url: 'https://youtu.be/x', prompt: 'P', mediaResolution: 'LOW', sliceRanges: ranges8 });
    const parts8 = eight.contents[0].parts;
    assert(parts8.length === 9, '8-slice body has exactly 9 parts (8 media + 1 text)');
    assert(parts8.slice(0, 8).every((p, i) => p.fileData.fileUri === 'https://youtu.be/x'
      && p.videoMetadata.startOffset === `${ranges8[i].startOffset}s` && p.videoMetadata.endOffset === `${ranges8[i].endOffset}s`
      && Object.keys(p).join(',') === 'fileData,videoMetadata'),
      'each of the 8 media parts repeats the same URL with ONLY its own validated videoMetadata, in user order');
    assert(Object.keys(parts8[8]).join(',') === 'text' && parts8[8].text === 'P', 'the single text part appears last');
    assert(!parts8.some((p) => p.fileData && !p.videoMetadata), 'no whole-video media part is added');
  }

  section('V4 usage-line tag');
  {
    const u = { promptTokenCount: 10, candidatesTokenCount: 5, totalTokenCount: 15, promptTokensDetails: [] };
    assert(!formatUsageLine(u, 'm', 'LOW', false).includes('slice'), 'existing whole-video line unchanged (no slice tag)');
    assert(formatUsageLine(u, 'm', 'LOW', true).endsWith(' sliced=yes'), 'existing single-slice line unchanged');
    assert(formatUsageLine(u, 'm', 'LOW', false, 3).endsWith(' slices=3'), 'multi-slice run appends slices=N');
  }

  section('V4 one logical request: single fetch, byte-identical K5 retries, refusals fetch nothing');
  {
    const h = makeDeps([resp(200, SLICED_BODY)]);
    const code = await runVideoScout(sliceArgs(S2), h.deps);
    assert(code === 0 && h.calls.length === 1, 'a 2-slice run submits EXACTLY ONE request (no sequential per-slice calls)');
    const sent = JSON.parse(h.calls[0].body);
    assert(sent.contents[0].parts.length === 3, 'the one submitted body carries 2 media parts + 1 text part');
    assert(sent.contents[0].parts[2].text.includes('BRIEF-TEXT analyze') && sent.contents[0].parts[2].text.includes('2 AUTHORIZED VIDEO SLICES'),
      'the submitted prompt = resolved prompt + appended scope instruction');
    assert(h.logs.some((l) => /slices=2 aggregate=50s \(ONE multipart request\)/.test(l)), 'launch log carries bounded slice metadata');
    assert(h.logs.some((l) => /\[video-scout usage\].*slices=2/.test(l)), 'usage line tags slices=2');
  }
  {
    const h = makeDeps([resp(503, U503), resp(503, U503), resp(200, SLICED_BODY)]);
    const code = await runVideoScout(sliceArgs(S2), h.deps);
    assert(code === 0 && h.calls.length === 3, 'retryable 503s: recovered on attempt 3 with slices');
    assert(h.calls[0].body === h.calls[1].body && h.calls[1].body === h.calls[2].body,
      'every K5 retry submits the BYTE-IDENTICAL multipart body (serialized once, before the loop)');
    assert(h.sleeps.join(',') === '1200,2200', 'the two bounded deterministic delays, unchanged by V4');
    assert(usageCount(h.logs) === 1, 'usage prints exactly once');
  }
  {
    const h = makeDeps([resp(503, U503), resp(503, U503), resp(503, U503), resp(200, SUCCESS_BODY)]);
    const code = await runVideoScout(sliceArgs(S2), h.deps);
    assert(code === 1 && h.calls.length === 3, 'NO fourth attempt exists for a multi-slice run');
  }
  {
    const h = makeDeps([new Error('socket hang up')]);
    const code = await runVideoScout(sliceArgs(S2), h.deps);
    assert(code === 1 && h.calls.length === 1, 'ambiguous network failure with slices: one fetch, never retried');
  }
  {
    const h = makeDeps([resp(200, SUCCESS_BODY)]);
    assert((await runVideoScout(sliceArgs('{bad json'), h.deps)) === 1 && h.calls.length === 0,
      'invalid slice JSON: nonzero exit with ZERO fetches');
    assert((await runVideoScout(sliceArgs(S2, ['--start-offset', '5', '--end-offset', '9']), h.deps)) === 1 && h.calls.length === 0,
      'slices + scalar offsets: refused with ZERO fetches (mutual exclusion)');
    const over = Array.from({ length: 8 }, (_, i) => ({ startOffset: i * 400, endOffset: i * 400 + 225 }));
    over[7] = { startOffset: 2800, endOffset: 3026 };
    assert((await runVideoScout(sliceArgs(JSON.stringify(over)), h.deps)) === 1 && h.calls.length === 0,
      '1801s aggregate: refused with ZERO fetches (cap enforced before any submission)');
  }

  section('V4 no second retry loop / no sequential-request machinery in source');
  {
    const src = fs.readFileSync(path.join(__dirname, 'gemini-video-sdk.js'), 'utf8');
    assert((src.match(/attempt <= RETRY_MAX_ATTEMPTS/g) || []).length === 1,
      'exactly ONE attempt loop exists (the shared submitGeminiRequest transport)');
    // Count INVOCATIONS only: `submitGeminiRequest({` also matches the function definition, so
    // anchor on `await` — one call site means no per-slice submission loop was introduced.
    assert((src.match(/await submitGeminiRequest\(/g) || []).length === 1,
      'runVideoScout calls the shared transport at exactly one site — no per-slice submission loop');
  }

  // ================================ V4Q generation policy =====================================
  const {
    buildGenerationConfig, resolveEffectiveModel, validateReportQuality, extractEvidenceSection,
    extractProfileSection, resolveDiagnosticDir, writeRejectedResponseDiagnostic, REQUIRED_SECTIONS,
    MAX_DIAGNOSTIC_BYTES, MAX_DIAGNOSTIC_CHARS, PRO_MODEL,
    PROFILE_SECTION_HEADER, PROFILE_SECTION_NEXT_HEADER, DURATION_FIELD_CLAIM,
    splitReportLines, sectionLines, findHeaderLine, hasExactLine, matchLines,
    SLICE_AUDIO_STATUS_LINE, SLICE_AUDIO_EVIDENCE_LINE, SLICE_ANCHOR_LINE, SLICE_JUSTIFICATION_LINE,
    SLICE_HEADING_SHAPE, SYNTHETIC_ASSESSMENT_SHAPE, STANDARDIZED_SYNTHETIC_LINE,
    FORBIDDEN_ORIGIN_PHRASES, FORBIDDEN_ORIGIN_PATTERNS,
    splitSentenceUnits, parseDurationSeconds, claimExceedsAggregate,
    classifyTerminalHedge, DUR_HEDGE_PHRASES, HEDGE_CLASS_BY_PHRASE,
    validateSourceDurationField, validateSyntheticAssessmentField,
    PROFILE_SECTION_INDEX, EVIDENCE_SECTION_INDEX,
  } = require('./gemini-video-sdk');
  const LITE = 'gemini-2.5-flash-lite';
  const FLASH = 'gemini-2.5-flash';
  const gc = (model, n) => buildGenerationConfig({ model, mediaResolution: 'MEDIUM', effectiveSliceCount: n });

  section('V4Q generation config: exact model x slice-count matrix (counts 0-8)');
  {
    // The authoritative table. maxOutputTokens applies to EVERY SDK video model; the reviewed
    // thinking budget applies ONLY to bounded sliced Pro.
    const EXPECTED_MAX = [16384, 16384, 16384, 18432, 20480, 22528, 24576, 26624, 28672];
    for (let n = 0; n <= 8; n++) {
      for (const m of [LITE, FLASH, PRO_MODEL]) {
        assert(gc(m, n).maxOutputTokens === EXPECTED_MAX[n],
          `${m} @ ${n} slice(s): maxOutputTokens === ${EXPECTED_MAX[n]}`);
      }
    }
    // Whole video (count 0): NO model gets a thinking budget — provider defaults are preserved.
    for (const m of [LITE, FLASH, PRO_MODEL]) {
      assert(!('thinkingConfig' in gc(m, 0)),
        `whole-video ${m}: thinkingConfig is ABSENT (provider default thinking behavior preserved)`);
    }
    // Sliced non-Pro: still no thinking budget — Flash keeps dynamic thinking, Lite keeps none.
    for (const n of [1, 2, 8]) {
      for (const m of [LITE, FLASH]) {
        assert(!('thinkingConfig' in gc(m, n)),
          `sliced ${m} @ ${n}: thinkingConfig is ABSENT (existing thinking behavior unchanged)`);
      }
    }
    // Sliced Pro: exactly the reviewed budget, at every count.
    for (const n of [1, 2, 3, 8]) {
      const c = gc(PRO_MODEL, n);
      assert(c.thinkingConfig && c.thinkingConfig.thinkingBudget === 8192
        && Object.keys(c.thinkingConfig).join(',') === 'thinkingBudget',
        `sliced Pro @ ${n}: thinkingConfig is exactly { thinkingBudget: 8192 }`);
    }
    // Never serialized as a falsy/empty placeholder — an absent budget means the KEY is absent.
    const wholePro = JSON.stringify(gc(PRO_MODEL, 0));
    assert(!/thinking/i.test(wholePro), 'an absent thinking budget emits NO thinkingConfig key (not null, 0, or {})');
    // An unknown/direct model string must not inherit a budget reviewed only for 2.5 Pro.
    assert(!('thinkingConfig' in gc('gemini-experimental-x', 4)), 'an unknown model string gets no thinking budget');
    assert(!('thinkingConfig' in gc('GEMINI-2.5-PRO', 2)), 'model matching is exact-case (no accidental Pro match)');
  }

  section('V4Q effective model resolution (explicit always wins; omitted defaults by scope)');
  {
    assert(resolveEffectiveModel({ explicitModel: undefined, effectiveSliceCount: 0 }) === LITE,
      'omitted + whole video -> economy default');
    assert(resolveEffectiveModel({ explicitModel: undefined, effectiveSliceCount: 1 }) === PRO_MODEL,
      'omitted + scalar slice -> Pro');
    assert(resolveEffectiveModel({ explicitModel: undefined, effectiveSliceCount: 8 }) === PRO_MODEL,
      'omitted + multipart -> Pro');
    for (const m of [LITE, FLASH, PRO_MODEL, 'gemini-experimental-x']) {
      for (const n of [0, 1, 8]) {
        assert(resolveEffectiveModel({ explicitModel: m, effectiveSliceCount: n }) === m,
          `explicit ${m} @ ${n} slice(s) is honored EXACTLY (never substituted)`);
      }
    }
  }

  section('V4Q scalar and multipart reach the SAME SDK-owned policy through buildRequestBody');
  {
    const scalarPro = buildRequestBody({ url: 'u', prompt: 'p', model: PRO_MODEL, mediaResolution: 'MEDIUM', startOffset: 60, endOffset: 75 });
    const multiPro = buildRequestBody({ url: 'u', prompt: 'p', model: PRO_MODEL, mediaResolution: 'MEDIUM', sliceRanges: [{ startOffset: 10, endOffset: 30 }, { startOffset: 60, endOffset: 90 }] });
    assert(JSON.stringify(scalarPro.generationConfig) === JSON.stringify(gc(PRO_MODEL, 1)),
      'the scalar body config is exactly buildGenerationConfig(model, 1) — one shared policy');
    assert(JSON.stringify(multiPro.generationConfig) === JSON.stringify(gc(PRO_MODEL, 2)),
      'the multipart body config is exactly buildGenerationConfig(model, 2) — one shared policy');
    const wholeLite = buildRequestBody({ url: 'u', prompt: 'p', model: LITE, mediaResolution: 'MEDIUM' });
    assert(JSON.stringify(wholeLite.generationConfig) === JSON.stringify(gc(LITE, 0)),
      'the whole-video body config is exactly buildGenerationConfig(model, 0)');
    // Effective model is genuinely threaded: the SAME slice scope produces different configs per model.
    assert(JSON.stringify(buildRequestBody({ url: 'u', prompt: 'p', model: LITE, mediaResolution: 'MEDIUM', startOffset: 1, endOffset: 2 }).generationConfig)
      !== JSON.stringify(scalarPro.generationConfig),
      'the model argument actually reaches generation policy (Lite and Pro differ at identical scope)');
  }

  section('V4Q scripts/ never imports the renderer policy module');
  {
    const src = fs.readFileSync(path.join(__dirname, 'gemini-video-sdk.js'), 'utf8');
    assert(!/video-model-policy/.test(src),
      'gemini-video-sdk.js does not reference the renderer policy module (the SDK owns its own policy)');
    assert(!/require\(['"][^'"]*renderer/.test(src), 'gemini-video-sdk.js imports nothing from app/renderer');
  }

  section('V4Q K5 preservation: fully configured body serialized once, byte-identical across retries');
  {
    const h = makeDeps([resp(503, U503), resp(503, U503), resp(200, SLICED_BODY)]);
    const code = await runVideoScout(sliceArgs(S2), h.deps);
    assert(code === 0 && h.calls.length === 3, 'three attempts, recovered on the third');
    assert(h.calls[0].body === h.calls[1].body && h.calls[1].body === h.calls[2].body,
      'every retry submits the byte-identical body INCLUDING generationConfig');
    const cfg = JSON.parse(h.calls[0].body).generationConfig;
    assert(cfg.maxOutputTokens === 16384 && cfg.thinkingConfig.thinkingBudget === 8192,
      'the retried body carries the resolved sliced-Pro configuration (omitted model defaulted to Pro)');
    assert(h.sleeps.join(',') === '1200,2200', 'the K5 delays are unchanged by V4Q');
  }

  // ================================= V4Q quality gate =========================================
  const R2 = S2_RANGES;
  const okReport = () => compliantReport(R2);
  const vq = (text, opts = {}) => validateReportQuality({
    text, finishReason: opts.finishReason || 'STOP', ranges: opts.ranges || R2,
    audioTokens: opts.audioTokens === undefined ? 2240 : opts.audioTokens,
  });

  section('V4Q validator: compliant fixtures PASS (scalar, multipart, legitimate silence)');
  {
    // Each positive fixture is parsed out of the SAME assembled string it hands to `vq`, so a
    // fixture that renders evidence outside the window it declares fails here first.
    const okText = okReport();
    guardScopeHonesty(okText, R2, 'compliant-2slice');
    assert(vq(okText).ok === true, 'a compliant 2-slice known-speech report passes');
    const one = [{ startOffset: 60, endOffset: 75 }];
    const oneText = compliantReport(one);
    guardScopeHonesty(oneText, one, 'compliant-scalar');
    assert(vq(oneText, { ranges: one }).ok === true, 'a compliant scalar known-speech report passes');
    const eight = Array.from({ length: 8 }, (_, i) => ({ startOffset: i * 100, endOffset: i * 100 + 20 }));
    const eightText = compliantReport(eight);
    guardScopeHonesty(eightText, eight, 'compliant-8slice');
    assert(vq(eightText, { ranges: eight }).ok === true, 'a complete 8-slice report passes');
    // §15 whole-video no-op: an explicitly empty effective range array owns no slice structure, so
    // the sliced ownership checks must not run. `00:01 [VISUAL] opening frame` stays unscoped.
    const wholeText = compliantReport();
    const wholeParsed = guardWholeVideo(wholeText, [], 'compliant-whole-video');
    assert(wholeParsed.body.some((l) => l.trim() === '00:01 [VISUAL] opening frame'),
      'the whole-video fixture keeps its unscoped opening-frame observation');
    assert(vq(wholeText, { ranges: [] }).ok === true, 'a compliant whole-video report passes (structure-only checks)');
    // Justified silence is legitimate and must NOT be rejected. Each injected justification is
    // stamped inside the slice it names, derived from that slice's own authorized range.
    const justified = mutateRegex(
      mutateRegex(okReport(), /\*\*Slice (\d) audio status:\*\* SPEECH/, '**Slice $1 audio status:** SILENCE',
        2, 'justified-silence-status'),
      /\*\*Slice (\d) transcription anchor:\*\*[^\n]*/,
      (_m, n) => `**Slice ${n} audio justification:** ${mmss(R2[Number(n) - 1].startOffset)} — listened for speech, music, and room tone across the slice; nothing audible`,
      2, 'justified-silence-anchor');
    guardScopeHonesty(justified, R2, 'justified-silence', { requireJustification: true });
    assert(vq(justified).ok === true, 'justified universal silence PASSES (false-positive control)');
    // A supported, timestamped, confidence-rated synthetic finding is allowed.
    const supported = okReport().replace(NO_SYNTHETIC_EVIDENCE_LINE,
      '**Synthetic-media assessment:** likely synthetic voiceover — Evidence: 00:12 uniform spectral envelope with no breath noise — Confidence: LOW');
    assert(vq(supported).ok === true, 'a standardized evidence-backed synthetic assessment PASSES');
  }

  // §21: the unmutated slice-1 visual line every filler fixture below replaces. Changing
  // `compliantReport` to render the last observable second silently broke this literal, so it is
  // written once, consumed through the fail-loud helper, and can never no-op unnoticed again.
  const SLICE1_VISUAL = '10s-29s [VISUAL] steady framing across this slice';
  const fillSlice1 = (count, body, label) => mutateLiteral(okReport(), SLICE1_VISUAL,
    Array.from({ length: count }, (_, i) => `${cycledStamp(i, R2[0])} [VISUAL] ${body}`).join('\n'), label);

  section('V4Q validator: every observed V4 failure class is caught with a distinct code');
  {
    const FILLER_30 = fillSlice1(30, 'Solid green background.', 'failure-class-filler');
    guardScopeHonesty(FILLER_30, R2, 'failure-class-filler', { observations: (n) => (n === 1 ? 30 : 1) });
    const cases = [
      ['finish-max-tokens', okReport(), { finishReason: 'MAX_TOKENS' }],
      ['finish-not-stop', okReport(), { finishReason: 'SAFETY' }],
      ['missing-section', okReport().replace('## 7. DISCREPANCIES & CROSS-CHECKS', '## 7a. OTHER'), {}],
      ['duplicate-section', okReport() + '\n## 3. PEOPLE, ENTITIES & SETTING\n', {}],
      // The exact V4 defect: slice 2 rendered 04:00-04:30 instead of the authorized [240,280).
      ['scope-mismatch', okReport().replace(SLICE_HEADING(2, R2[1]), SLICE_HEADING(2, { startOffset: 60, endOffset: 80 })), {}],
      ['scope-mismatch', okReport().replace(AUTHORIZED_SCOPE_LINE(2, 50), '**Authorized scope:** 2 slice(s), aggregate 999s'), {}],
      ['missing-slice', okReport().replace(SLICE_HEADING(2, R2[1]), '(slice 2 dropped)'), {}],
      ['missing-slice-audio', okReport().replace('**Slice 2 audio status:** SPEECH', ''), {}],
      ['missing-speech-anchor', okReport().replace('**Slice 2 transcription anchor:** "hold this position"', ''), {}],
      ['unjustified-universal-silence', okReport().replace(/\*\*Slice (\d) audio status:\*\* SPEECH/g, '**Slice $1 audio status:** SILENCE').replace(/\*\*Slice \d transcription anchor:\*\*[^\n]*\n/g, ''), {}],
      // The exact V4 defect: a false "no audio" finding while audio tokens were billed.
      ['unjustified-universal-silence', okReport().replace('**Section TL;DR:** profile.', 'No audio or spoken content is present in the provided video slices. The video is silent.'), {}],
      // V4Q FINAL: replacing the canonical field is now a FORMAT failure; keeping it and ALSO
      // asserting a duration is the CONTENT failure. Both classes are proven here.
      ['source-duration-field-format', okReport().replace(UNDETERMINABLE_DURATION_LINE, 'Approximate duration: Over 1 hour.'), {}],
      ['speculative-source-duration', okReport().replace(UNDETERMINABLE_DURATION_LINE, UNDETERMINABLE_DURATION_LINE + '\nApproximate duration: Over 1 hour.'), {}],
      ['synthetic-assessment-field-format', okReport().replace(NO_SYNTHETIC_EVIDENCE_LINE, '**Synthetic-media assessment:** probably fine'), {}],
      ['unsupported-synthetic-claim', okReport().replace('**Section TL;DR:** profile.', 'The static nature suggests it is AI-generated stock footage.'), {}],
      ['repetitive-timestamp-filler', FILLER_30, {}],
    ];
    for (const [expected, text, opts] of cases) {
      const v = vq(text, opts);
      assert(v.ok === false && v.code === expected, `rejected with code ${expected}`);
      assert(QUALITY_FAILURE_CODES.includes(v.code), `${expected} is in the closed allowlist`);
    }
  }

  section('V4Q validator: no provider text, prompt, media, URL, or credential enters a reason');
  {
    // §24 FIXTURE ONE of two: the okReport-derived marked report, exercised under three finish
    // reasons. Scope-honest — its provider-marked filler is stamped inside slice 1's own window —
    // so the leak assertions cannot be satisfied by a report that was rejected for being malformed.
    const marked = mutateLiteral(
      fillSlice1(30, 'SECRET-PROVIDER-PHRASE repeated', 'marked-report-filler'),
      '**Section TL;DR:** profile.', 'SECRET-PROVIDER-PHRASE the video is silent and AI-generated',
      'marked-report-profile');
    guardScopeHonesty(marked, R2, 'marked-report', { observations: (n) => (n === 1 ? 30 : 1) });
    for (const opts of [{}, { finishReason: 'SAFETY' }, { finishReason: 'MAX_TOKENS' }]) {
      const v = vq(marked, opts);
      assert(v.ok === false, 'marked report is rejected');
      assert(!/SECRET-PROVIDER-PHRASE/.test(v.reason), 'the failure reason carries no provider text');
      assert(!/youtu\.be|https?:\/\//.test(v.reason), 'the failure reason carries no URL');
      assert(!/SECRET-KEY|GEMINI_API_KEY/.test(v.reason), 'the failure reason carries no credential');
    }
    const nonStop = vq(okReport(), { finishReason: 'SOME_UNDOCUMENTED_REASON' });
    assert(nonStop.code === 'finish-not-stop' && !/SOME_UNDOCUMENTED_REASON/.test(nonStop.reason),
      'an unrecognized finishReason is reported as a bounded phrase, never echoed');
  }

  section('V4Q evidence-section identity cannot silently drift');
  {
    const promptText = fs.readFileSync(path.join(__dirname, '..', 'prompts', 'video-scout-analysis.md'), 'utf8');
    assert(promptText.split(EVIDENCE_SECTION_HEADER).length - 1 === 1,
      'the canonical evidence header appears EXACTLY once in the prompt');
    assert(REQUIRED_SECTIONS[4] === EVIDENCE_SECTION_HEADER,
      'the ordered template defines the canonical evidence header as the FIFTH section');
    const idx = REQUIRED_SECTIONS.map((h) => promptText.indexOf(h));
    assert(idx.every((i) => i !== -1), 'every required section header exists in the prompt');
    assert(idx.every((v, i) => i === 0 || v > idx[i - 1]), 'the prompt declares the sections in the required order');
    // Located by exact canonical headers, never a numeric substring: a renamed section must fail.
    const renamed = okReport().replace(EVIDENCE_SECTION_HEADER, '## 5. TIMESTAMPED STUFF');
    assert(vq(renamed).code === 'missing-section', 'renaming the evidence section fails the contract visibly');
    assert(extractEvidenceSection(okReport()).includes('**Slice 1 audio status:**'),
      'the evidence section is extracted between the exact canonical headers');
    assert(extractEvidenceSection(okReport()).indexOf('**Section TL;DR:** claims.') === -1,
      'extraction stops at the following canonical header (never bleeds into section 6)');
  }

  section('V4Q repetition heuristic: structural marker lines are never counted as filler');
  {
    // Eight slices legitimately share the same `**Slice N audio status:** SILENCE` shape. If marker
    // lines were counted, a compliant 8-slice report would self-reject.
    const eight = Array.from({ length: 8 }, (_, i) => ({ startOffset: i * 100, endOffset: i * 100 + 20 }));
    const silent8 = mutateRegex(
      mutateRegex(compliantReport(eight), /\*\*Slice (\d) audio status:\*\* SPEECH/, '**Slice $1 audio status:** SILENCE',
        8, 'silent8-status'),
      /\*\*Slice (\d) transcription anchor:\*\*[^\n]*/,
      (_m, n) => `**Slice ${n} audio justification:** ${mmss(eight[Number(n) - 1].startOffset)} — listened across the slice; nothing audible`,
      8, 'silent8-anchor');
    guardScopeHonesty(silent8, eight, 'silent8', { requireJustification: true });
    assert(vq(silent8, { ranges: eight }).ok === true,
      'eight identical audio-status marker lines do NOT trip the repetition heuristic');
    // Three repeats are allowed WITHIN ONE SLICE; four are not.
    const mk = (n) => fillSlice1(n, 'identical observation', `mk-${n}`);
    const mk3 = mk(3); const mk4 = mk(4);
    guardScopeHonesty(mk3, R2, 'mk-3', { observations: (n) => (n === 1 ? 3 : 1) });
    guardScopeHonesty(mk4, R2, 'mk-4', { observations: (n) => (n === 1 ? 4 : 1) });
    assert(vq(mk3).ok === true, 'three identical observations are allowed');
    assert(vq(mk4).code === 'repetitive-timestamp-filler', 'a fourth identical observation is rejected');
  }

  // ============ V4Q FINAL CORRECTION: filler is counted PER SUBSECTION (VERDICT: FAIL) ==========
  // The Full-class review returned VERDICT: FAIL. One Map counted normalized observations across ALL
  // of Section 5 while normalizeEvidenceLine strips `Slice N`, so the gate could not tell filler
  // INSIDE one slice from the ONE consolidated entry per slice the repository's own scope
  // instruction demands. On uniform footage a maximally compliant report was rejected at >= 4
  // slices, discarding a correct response after usage had already occurred.
  section('V4Q FINAL CORRECTION: one consolidated observation per slice passes at EVERY slice count');
  {
    // SCOPE-HONEST RANGES. Slice n is [n*60, n*60+30) and every displayed timestamp is DERIVED from
    // those offsets, so each observation genuinely falls inside the slice it is filed under. The
    // earlier version declared [0,30), [100,130), … while displaying 01:00-01:29, 02:00-02:29, … —
    // slice 1's interval sat entirely outside its own authorized range. The production normalizer
    // strips timestamps, so the matrix still passed; it just was not the "fully compliant report"
    // this regression is supposed to represent. A fixture that misrepresents its own premise cannot
    // prove the thing it claims to prove.
    const sliceRange = (i) => ({ startOffset: (i + 1) * 60, endOffset: (i + 1) * 60 + 30 });
    const mmss = (seconds) => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
    // Inclusive display interval for a half-open [start,end) range: the last observed second.
    const interval = (r) => `${mmss(r.startOffset)}-${mmss(r.endOffset - 1)}`;

    // Build the exact shape the scope instruction asks for: one ranged entry per slice, uniform
    // footage, every slice SILENCE with a justification (so the audio contract is satisfied too).
    const uniform = (count) => {
      const ranges = Array.from({ length: count }, (_, i) => sliceRange(i));
      const agg = ranges.reduce((s, r) => s + (r.endOffset - r.startOffset), 0);
      const out = ['## 1. TL;DR', 'A static title card throughout.', '', PROFILE_SECTION_HEADER,
        '**Section TL;DR:** profile.', AUTHORIZED_SCOPE_LINE(count, agg), UNDETERMINABLE_DURATION_LINE,
        NO_SYNTHETIC_EVIDENCE_LINE, '', PROFILE_SECTION_NEXT_HEADER, '**Section TL;DR:** none visible.', '',
        '## 4. DETAILED SUMMARY', '**Section TL;DR:** unchanging card.', '',
        EVIDENCE_SECTION_HEADER, '**Section TL;DR:** evidence.'];
      ranges.forEach((r, i) => {
        const n = i + 1;
        out.push(SLICE_HEADING(n, r),
          `**Slice ${n} audio status:** SILENCE`,
          `**Slice ${n} audio evidence:** ${mmss(r.startOffset)} — listened across the window, heard nothing`,
          `**Slice ${n} audio justification:** ${mmss(r.startOffset)} — no speech, music, or ambience at any point`,
          `- ${interval(r)} [VISUAL] static title card, no change`);
      });
      out.push('', EVIDENCE_SECTION_NEXT_HEADER, '**Section TL;DR:** no claims.', '',
        '## 7. DISCREPANCIES & CROSS-CHECKS', '**Section TL;DR:** audio and visual agree on stasis.', '',
        '## 8. SOURCE-CREDIBILITY ASSESSMENT', '**Section TL;DR:** unattributable.', '',
        '## 9. LIMITATIONS OF THIS ANALYSIS', '**Section TL;DR:** bounded windows only.');
      return { text: out.join('\n'), ranges };
    };
    // Each count is assembled ONCE. That one string is what the guard parses and what `vq`
    // validates, so there is no second rendering for the two to disagree about.
    const built = Array.from({ length: 8 }, (_, i) => uniform(i + 1));

    // GUARD 1 — SCOPE HONESTY. Every displayed evidence interval must lie inside the authorized
    // range it is filed under, at every slice count, read out of the assembled report.
    for (const { text, ranges } of built) {
      const g = guardScopeHonesty(text, ranges, `uniform-${ranges.length}`, { requireJustification: true });
      assert(g.total === ranges.length,
        `${ranges.length}-slice fixture emits exactly ${ranges.length} ranged visual entries`);
    }

    // GUARD 2 — NORMALIZATION COLLISION, on the ONE CACHED uniform(8) report.
    // The previous version of this guard hand-rebuilt both lines from the same helpers that
    // produced the fixture and retyped the observation body as a literal. It therefore compared a
    // reconstruction against a reconstruction and could not have detected the drift it existed to
    // prevent — the reviewer's CHECKPOINT REVIEW: FAIL. Every value below is now extracted from
    // `EIGHT.text`, the exact string handed to `vq` two assertions further down.
    const EIGHT = built[7];
    const parsed8 = parseAssembledReport(EIGHT.text, 'uniform-8');
    const subsection = (n) => {
      const d = parsed8.declarations.find((x) => x.n === n);
      assert(Boolean(d), `uniform(8): slice ${n} opens its own parsed subsection`);
      return d;
    };
    const soleObservation = (n) => {
      const found = extractEvidence(subsection(n).lines, 'uniform-8', `slice ${n}`);
      assert(found.length === 1, `uniform(8): slice ${n} carries exactly ONE consolidated visual observation`);
      return found[0];
    };
    const obs1 = soleObservation(1);
    const obs8 = soleObservation(8);
    // Endpoints pinned from the PARSED numbers, not from the interval helper that rendered them.
    assert(obs1.from === 60 && obs1.to === 89 && obs8.from === 480 && obs8.to === 509,
      'the rendered slice 1 and slice 8 intervals are 01:00-01:29 and 08:00-08:29, matching their ranges');
    const k1 = normalizeEvidenceLine(obs1.line);
    const k8 = normalizeEvidenceLine(obs8.line);
    assert(k1 === k8,
      'the ACTUAL rendered slice 1 and slice 8 entries normalize to one identical key (the matrix is not passing by accident)');
    assert(k1 === 'static title card no change', 'the normalized key is pinned independently of both lines');
    // NEGATIVE CONTROL. Begin from the real extracted slice 8 line and add slice-dependent body
    // text: if normalization ever stopped collapsing these entries, the collision above would be
    // meaningless, so prove that a genuine difference in the body does survive.
    assert(normalizeEvidenceLine(`${obs8.line}, frame 8`) !== k1,
      'slice-dependent body text on the real slice 8 line destroys the collision with the real slice 1 line');
    assert(normalizeEvidenceLine(`${obs8.line}, frame 8`) === 'static title card no change frame 8',
      'the control differs by exactly the slice-dependent text it added');
    // THE REGRESSION MATRIX. Every count 1..8 must pass; 4+ used to reject. Same strings as above.
    for (const { text, ranges } of built) {
      const v = vq(text, { ranges });
      assert(v.ok === true,
        `REGRESSION: ${ranges.length} slice(s) with ONE mandated consolidated entry each PASSES (was ${ranges.length >= 4 ? 'REJECTED' : 'passing'})`);
    }
    assert(vq(EIGHT.text, { ranges: EIGHT.ranges }).ok === true,
      'the cached uniform(8) report — the exact text Guard 2 parsed — is the one production validates');
  }

  section('V4Q FINAL CORRECTION: the threshold of three still applies WITHIN each subsection');
  {
    // SCOPE-HONEST RANGES, same rule as the matrix above: slice n is [n*60, n*60+30) and every
    // displayed timestamp is derived from the offsets, so nothing is filed under a slice it does not
    // fall inside.
    const mmss = (seconds) => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
    const R8 = Array.from({ length: 8 }, (_, i) => ({ startOffset: (i + 1) * 60, endOffset: (i + 1) * 60 + 30 }));
    const at = (n, offset = 0) => mmss(R8[n - 1].startOffset + offset);
    const spanOf = (n) => `${mmss(R8[n - 1].startOffset)}-${mmss(R8[n - 1].endOffset - 1)}`;
    // `perSlice(n)` decides what goes under slice n; `pre` goes in the Section 5 preamble.
    const build = (ranges, perSlice, pre = []) => {
      const agg = ranges.reduce((s, r) => s + (r.endOffset - r.startOffset), 0);
      const out = ['## 1. TL;DR', 'Static footage.', '', PROFILE_SECTION_HEADER, '**Section TL;DR:** profile.',
        AUTHORIZED_SCOPE_LINE(ranges.length, agg), UNDETERMINABLE_DURATION_LINE, NO_SYNTHETIC_EVIDENCE_LINE, '',
        PROFILE_SECTION_NEXT_HEADER, '**Section TL;DR:** none.', '', '## 4. DETAILED SUMMARY',
        '**Section TL;DR:** summary.', '', EVIDENCE_SECTION_HEADER, '**Section TL;DR:** evidence.', ...pre];
      ranges.forEach((r, i) => {
        const n = i + 1;
        out.push(SLICE_HEADING(n, r), `**Slice ${n} audio status:** SILENCE`,
          `**Slice ${n} audio evidence:** ${mmss(r.startOffset)} — listened, heard nothing`,
          `**Slice ${n} audio justification:** ${mmss(r.startOffset)} — nothing audible at any point`,
          ...perSlice(n));
      });
      out.push('', EVIDENCE_SECTION_NEXT_HEADER, '**Section TL;DR:** claims.', '',
        '## 7. DISCREPANCIES & CROSS-CHECKS', '**Section TL;DR:** consistent.', '',
        '## 8. SOURCE-CREDIBILITY ASSESSMENT', '**Section TL;DR:** unattributable.', '',
        '## 9. LIMITATIONS OF THIS ANALYSIS', '**Section TL;DR:** bounded.');
      return out.join('\n');
    };
    // One consolidated entry spanning the whole slice; `many` puts k distinct in-range seconds under
    // one slice. Both derive every timestamp from that slice's own authorized offsets.
    const one = (n) => [`- ${spanOf(n)} [VISUAL] static title card, no change`];
    const many = (n, k) => Array.from({ length: k }, (_, j) => `- ${at(n, j)} [VISUAL] static title card, no change`);
    // §25: SEVEN DISTINCT ASSEMBLED REPORTS. Each is built once; the scope-honesty parser reads
    // that exact string, and `vq` is then handed the same string. The previous guard here inspected
    // `one(n)[0]` and `many(n, 12)` — generator return values that no report necessarily contained —
    // so it could not prove anything about the text production actually validated.
    const secret = (n, k) => Array.from({ length: k }, (_, j) => `- ${at(n, j)} [VISUAL] SECRET-PROVIDER-PHRASE static card`);
    const REPORTS = {
      threeInSlice1: { text: build(R8, (n) => (n === 1 ? many(1, 3) : one(n))), observations: (n) => (n === 1 ? 3 : 1) },
      fourInSlice1: { text: build(R8, (n) => (n === 1 ? many(1, 4) : one(n))), observations: (n) => (n === 1 ? 4 : 1) },
      fourInSlice8: { text: build(R8, (n) => (n === 8 ? many(8, 4) : one(n))), observations: (n) => (n === 8 ? 4 : 1) },
      threeInEvery: { text: build(R8, (n) => many(n, 3)), observations: () => 3 },
      fourInPreamble: {
        text: build(R8, one, Array.from({ length: 4 }, (_, j) => `- ${at(1, j)} [VISUAL] identical preamble observation`)),
        observations: () => 1, preambleObservations: 4,
      },
      twelveInSlice1: { text: build(R8, (n) => (n === 1 ? many(1, 12) : one(n))), observations: (n) => (n === 1 ? 12 : 1) },
      providerTextInSlice1: { text: build(R8, (n) => (n === 1 ? secret(1, 4) : one(n))), observations: (n) => (n === 1 ? 4 : 1) },
    };
    for (const [key, spec] of Object.entries(REPORTS)) {
      spec.verdict = null;
      guardScopeHonesty(spec.text, R8, `r8-${key}`, {
        requireJustification: true,
        observations: spec.observations,
        preambleObservations: spec.preambleObservations || 0,
      });
    }
    const validate = (key) => { REPORTS[key].verdict = vq(REPORTS[key].text, { ranges: R8 }); return REPORTS[key].verdict; };

    assert(validate('threeInSlice1').ok === true,
      'THREE identical observations inside ONE subsection are allowed');
    const four = validate('fourInSlice1');
    assert(four.code === 'repetitive-timestamp-filler', 'FOUR identical observations inside ONE subsection are REJECTED');
    assert(/slice 1/.test(four.reason), 'the reason identifies WHICH subsection repeated');
    // Slice 8 specifically — the far end of the range, and the count that used to be unreachable.
    const eighth = validate('fourInSlice8');
    assert(eighth.code === 'repetitive-timestamp-filler', 'four repetitions in SLICE 8 are rejected');
    assert(/slice 8/.test(eighth.reason), 'the reason structurally identifies slice 8');
    // The allowance is per bucket, so 3 in EVERY slice — 24 identical lines overall — still passes.
    assert(validate('threeInEvery').ok === true,
      'three allowed repetitions in EACH of eight slices still passes (24 identical lines overall)');
    // The Section 5 preamble is its own bucket. Its observations are timestamped inside slice 1's
    // authorized window — the preamble is not itself a slice, so the guard authorizes each stamp
    // against exactly one expected range without ever folding it into that slice's count.
    const pre = validate('fourInPreamble');
    assert(pre.code === 'repetitive-timestamp-filler', 'four identical observations in the Section 5 PREAMBLE are rejected');
    assert(/preamble/i.test(pre.reason), 'the reason identifies the preamble bucket');
    // Classic per-second filler inside one slice still fails, which is the whole point of the check.
    assert(validate('twelveInSlice1').code === 'repetitive-timestamp-filler',
      'twelve per-second near-identical lines inside one slice are still REJECTED');
    // §24 FIXTURE TWO of two: the filler-leak report. The code is pinned FIRST — `reason` is
    // undefined on a pass and unrelated under any other rejection, so both negated checks below
    // would otherwise be satisfied by a report that never reached the filler path at all.
    const leak = validate('providerTextInSlice1');
    assert(leak.code === 'repetitive-timestamp-filler',
      'the leak fixture reaches the FILLER path, so the reason checks below are not vacuous');
    assert(typeof leak.reason === 'string' && leak.reason.length > 0, 'it carries a bounded reason');
    assert(!/SECRET-PROVIDER-PHRASE/.test(leak.reason) && !/static card/.test(leak.reason),
      'the filler reason never echoes the repeated observation text');
    // The pure bucket helper, exercised directly.
    assert(findRepeatedObservation(['- a b c', '- a b c', '- a b c']) === null, 'helper: three identical lines are allowed');
    assert(findRepeatedObservation(['- a b c', '- a b c', '- a b c', '- a b c']).count === 4, 'helper: the fourth is reported');
    assert(findRepeatedObservation(['**Slice 1 audio status:** SILENCE', '**Slice 2 audio status:** SILENCE',
      '**Slice 3 audio status:** SILENCE', '**Slice 4 audio status:** SILENCE']) === null,
      'helper: structural marker lines are excluded from counting');
    assert(findRepeatedObservation(['### Slice 1: x', '### Slice 2: x', '### Slice 3: x', '### Slice 4: x']) === null,
      'helper: heading lines are excluded');
    assert(findRepeatedObservation(['', '  ', '', '   ']) === null, 'helper: blank lines are excluded');
    assert(findRepeatedObservation([]) === null && findRepeatedObservation(null) === null,
      'helper: an empty or absent bucket is inert');
    assert(EVIDENCE_REPEAT_LIMIT === 3, 'the limit is a CONSTANT and is never scaled by slice count');
    // Normalization is unchanged: `Slice N` is still stripped, so relabelled per-second filler
    // cannot evade the check by carrying different slice numbers.
    assert(normalizeEvidenceLine('- 00:01 [VISUAL] Slice 1 static frame') === normalizeEvidenceLine('- 00:02 [VISUAL] Slice 2 static frame'),
      'normalization still strips `Slice N`, so relabelled filler inside one bucket cannot evade the count');
  }

  section('V4 REVISION 8: rendered ownership is by slice IDENTITY, never by position');
  {
    // A guard that walked declarations positionally would agree with an identity-based one on every
    // fixture in this file, because every fixture renders its slices in order. This counterfactual
    // is the only place the two readings can disagree, so it is where a positional fallback would
    // be caught. Production ordering is untouched: nothing here is submitted to `vq`.
    const ranges = Array.from({ length: 4 }, (_, i) => ({ startOffset: (i + 1) * 100, endOffset: (i + 1) * 100 + 40 }));
    const original = compliantReport(ranges);
    guardScopeHonesty(original, ranges, 'reorder-source');
    const before = parseAssembledReport(original, 'reorder-source');
    // Lift each COMPLETE subsection out of the assembled text and re-emit them back-to-front. The
    // headings are carried along untouched, so every subsection keeps the identity it declared.
    const blocks = before.declarations.map((d) => [before.body[d.at], ...d.lines].join('\n'));
    const reordered = mutateLiteral(original, blocks.join('\n'), [...blocks].reverse().join('\n'), 'reorder-subsections');
    const after = parseAssembledReport(reordered, 'reorder-result');
    assert(after.declarations.map((d) => d.n).join(',') === '4,3,2,1',
      'the reordered report really does render its subsections back-to-front');
    // Identity-based ownership survives the reordering unchanged...
    guardScopeHonesty(reordered, ranges, 'reorder-result');
    // ...and a positional reading would genuinely have been wrong at every position, so the guard
    // above is load-bearing rather than trivially satisfied.
    after.declarations.forEach((d, k) => {
      assert(d.n !== k + 1, `position ${k + 1} no longer holds slice ${k + 1}`);
      assert(d.start === ranges[d.n - 1].startOffset && d.end === ranges[d.n - 1].endOffset,
        `the subsection at position ${k + 1} is authorized by slice ${d.n}'s range, not by position ${k + 1}`);
      const evidence = extractEvidence(d.lines, 'reorder-result', `position ${k + 1}`);
      assert(evidence.length === 1 && evidence[0].from === ranges[d.n - 1].startOffset,
        `the evidence at position ${k + 1} still belongs to slice ${d.n}`);
    });
  }

  section('V4Q FINAL CORRECTION: quality reasons make no unsupported billing-status claim');
  {
    // Token usage proves that provider usage occurred. It does NOT prove that money changed hands:
    // free-tier versus billable depends on the user's own Gemini project and account.
    const reasons = [];
    const collect = (v) => { if (v && v.ok === false && v.reason) reasons.push(v.reason); };
    // Local, so this section does not depend on a helper declared further down the file.
    const withLimit = (extra) => okReport().replace('**Section TL;DR:** limits.', '**Section TL;DR:** limits.\n' + extra);
    collect(vq(okReport().replace(UNDETERMINABLE_DURATION_LINE + '\n', '')));
    collect(vq(okReport().replace(NO_SYNTHETIC_EVIDENCE_LINE + '\n', '')));
    collect(vq(withLimit('The static frame suggests stock footage.')));
    collect(vq(withLimit("The video's duration is 1:02:03.")));
    collect(vq(okReport().replace('## 9. LIMITATIONS OF THIS ANALYSIS', '')));
    collect(vq(okReport(), { finishReason: 'MAX_TOKENS' }));
    collect(vq(okReport().replace(/\*\*Slice 1 audio status:\*\* SPEECH/, '**Slice 1 audio status:** SILENCE')
      .replace(/\*\*Slice 2 audio status:\*\* SPEECH/, '**Slice 2 audio status:** SILENCE')));
    // §21: this sweep contributes a CONFIRMED filler rejection, not merely "some rejection". The
    // stale literal here used to no-op silently, which quietly shrank the reason spread by one.
    const sweepFiller = fillSlice1(4, 'identical observation', 'billing-sweep-filler');
    guardScopeHonesty(sweepFiller, R2, 'billing-sweep-filler', { observations: (n) => (n === 1 ? 4 : 1) });
    const sweepVerdict = vq(sweepFiller);
    assert(sweepVerdict.code === 'repetitive-timestamp-filler',
      'the reason sweep includes a confirmed repetitive-timestamp-filler rejection');
    collect(sweepVerdict);
    assert(reasons.length >= 7, 'a representative spread of rejection reasons was collected');
    for (const reason of reasons) {
      assert(!/\bpaid\b|\bbilled\b|\bbillable\b|free[- ]tier/i.test(reason),
        `a quality reason claims no billing status: "${reason.slice(0, 56)}…"`);
    }
    // The producing source carries no generic "usage proves billing" claim either.
    const src = fs.readFileSync(path.join(__dirname, 'gemini-video-sdk.js'), 'utf8');
    assert(!/tokens were billed|billed audio tokens|had already been paid for|any paid submission/.test(src),
      'gemini-video-sdk.js no longer claims that token usage proves billing');
    assert(/provider usage metadata records|provider usage metadata reports/.test(src),
      'it states what is actually true: provider usage metadata records the tokens');
  }

  section('V4Q CORRECTION: bounded-scope markers are required in their CANONICAL SECTION');
  {
    // Section extraction is by exact adjacent headers, never a whole-report search.
    const base = okReport();
    assert(extractProfileSection(base).includes(AUTHORIZED_SCOPE_LINE(2, 50)),
      'Section 2 is extracted between its exact adjacent canonical headers');
    assert(!extractProfileSection(base).includes('**Slice 1 audio status:**'),
      'Section 2 extraction stops before Section 3 (never bleeds into later sections)');
    assert(PROFILE_SECTION_HEADER === '## 2. VIDEO PROFILE' && PROFILE_SECTION_NEXT_HEADER === '## 3. PEOPLE, ENTITIES & SETTING',
      'the Section 2 boundary headers are the canonical ones');

    // THE REVIEWER'S SECOND REPORT: every slice/audio marker moved into Section 4, Section 5 empty.
    // The pre-correction validator searched the whole report and PASSED this.
    const s5Body = extractEvidenceSection(base).trim();
    const markersInS4 = base
      .replace(s5Body, '')
      .replace('**Section TL;DR:** summary.', '**Section TL;DR:** summary.\n' + s5Body);
    const movedVerdict = vq(markersInS4);
    assert(movedVerdict.ok === false && movedVerdict.code === 'missing-slice',
      'REGRESSION CONTROL: slice subsections placed in Section 4 with Section 5 empty are REJECTED');

    // Individually relocated Section 2 markers are each rejected on their own.
    const moveOut = (line) => base.replace(line + '\n', '').replace('**Section TL;DR:** limits.', '**Section TL;DR:** limits.\n' + line);
    assert(vq(moveOut(AUTHORIZED_SCOPE_LINE(2, 50))).code === 'scope-mismatch',
      'the authorized-scope line outside Section 2 does not satisfy the contract');
    assert(vq(moveOut(UNDETERMINABLE_DURATION_LINE)).code === 'source-duration-field-format',
      'the undeterminable-duration line outside Section 2 does not satisfy the contract');
    assert(vq(moveOut(NO_SYNTHETIC_EVIDENCE_LINE)).code === 'synthetic-assessment-field-format',
      'the synthetic-media assessment outside Section 2 does not satisfy the contract');

    // A marker belonging to slice 2 cannot be satisfied by text sitting under slice 1.
    const misplacedAnchor = base.replace('**Slice 2 transcription anchor:** "hold this position"', '')
      .replace('**Slice 1 transcription anchor:** "hold this position"',
        '**Slice 1 transcription anchor:** "hold this position"\n**Slice 2 transcription anchor:** "hold this position"');
    assert(vq(misplacedAnchor).code === 'missing-speech-anchor',
      "slice 2's anchor sitting inside slice 1's subsection does not satisfy slice 2");
  }

  section('V4Q CORRECTION: a contradictory source-duration claim is rejected');
  {
    const withDuration = (claim) => okReport().replace(UNDETERMINABLE_DURATION_LINE, UNDETERMINABLE_DURATION_LINE + '\n' + claim);
    // THE REVIEWER'S FIRST REPORT: the required line AND the invented duration, together.
    for (const claim of [
      'Approximate duration: Over 1 hour',
      '**Approximate duration:** Over 1 hour',
      'Source duration: 3600s',
      'Video duration: 1:02:03',
      'Total duration: 70 minutes',
      'Full duration — 2 hours',
      'Estimated duration: unknown but long',
    ]) {
      const v = vq(withDuration(claim));
      assert(v.ok === false && v.code === 'speculative-source-duration',
        `REGRESSION CONTROL: the required line plus "${claim.slice(0, 28)}..." is REJECTED`);
    }
    // And the honest forms are NOT rejected.
    assert(vq(okReport()).ok === true, 'the exact undeterminable line alone passes');
    for (const honest of [
      'The full duration of the video is unknown from the authorized slices alone.',
      'Only the authorized aggregate was analyzed; the source length was never visible.',
      'Duration beyond the authorized slices could not be determined.',
    ]) {
      assert(vq(okReport().replace('**Section TL;DR:** limits.', '**Section TL;DR:** limits.\n' + honest)).ok === true,
        `honest limitation prose passes: "${honest.slice(0, 32)}..."`);
    }
    // The authorized aggregate and the per-slice authorized lengths are never mistaken for a claim.
    assert(DURATION_FIELD_CLAIM.test(AUTHORIZED_SCOPE_LINE(2, 50)) === false,
      'the authorized-scope line is not a duration claim');
    assert(DURATION_FIELD_CLAIM.test(SLICE_HEADING(1, R2[0])) === false,
      'a per-slice authorized length is not a duration claim');
    assert(DURATION_FIELD_CLAIM.test(UNDETERMINABLE_DURATION_LINE) === true,
      '(the sanctioned line IS field-shaped, which is why it is stripped before the scan)');
  }

  section('V4Q CORRECTION: correctly placed scalar / 2-slice / 8-slice reports still PASS');
  {
    const one = [{ startOffset: 60, endOffset: 75 }];
    const oneText = compliantReport(one);
    guardScopeHonesty(oneText, one, 'placed-scalar');
    assert(vq(oneText, { ranges: one }).ok === true, 'scalar report with markers in Section 5 passes');
    // §9: no `ranges` option, so the EFFECTIVE expected map is the `vq` wrapper's R2 fallback.
    const twoText = compliantReport(R2);
    guardScopeHonesty(twoText, R2, 'placed-2slice-effective-fallback');
    assert(vq(twoText).ok === true, 'two-slice report with markers in Section 5 passes');
    const eight = Array.from({ length: 8 }, (_, i) => ({ startOffset: i * 100, endOffset: i * 100 + 20 }));
    const eightText = compliantReport(eight);
    guardScopeHonesty(eightText, eight, 'placed-8slice');
    assert(vq(eightText, { ranges: eight }).ok === true, 'eight-slice report with markers in Section 5 passes');
    const honest = compliantReport(R2).replace('**Section TL;DR:** limits.',
      '**Section TL;DR:** limits.\nThe full source length is not determinable from the authorized slices.');
    assert(vq(honest).ok === true, 'a report combining correct placement with honest duration limitation passes');
  }

  // ===================== V4Q CORRECTION 2: EXACT STRUCTURAL ELEMENTS ==========================
  // Everything structural is decided on a WHOLE trimmed line. The prior implementation used
  // substring/unanchored matching, so a malformed report could inherit a canonical structure it
  // never emitted: `prefix ## 3. ...` satisfied a section header, an embedded scope line satisfied
  // the scope contract, and a marker quoted inside prose satisfied a slice marker.
  const inLimits = (extra) => okReport().replace('**Section TL;DR:** limits.', '**Section TL;DR:** limits.\n' + extra);

  section('V4Q CORRECTION 2: canonical headers must be EXACT COMPLETE LINES, once, in order');
  {
    // The work order's named case.
    const prefixed = okReport().replace('## 3. PEOPLE, ENTITIES & SETTING', 'prefix ## 3. PEOPLE, ENTITIES & SETTING');
    assert(vq(prefixed).code === 'missing-section',
      'ADVERSARIAL: "prefix ## 3. PEOPLE, ENTITIES & SETTING" does NOT satisfy the section-3 header');
    for (const [label, mutated] of [
      ['leading prose', okReport().replace('## 4. DETAILED SUMMARY', 'see ## 4. DETAILED SUMMARY')],
      ['trailing text', okReport().replace('## 8. SOURCE-CREDIBILITY ASSESSMENT', '## 8. SOURCE-CREDIBILITY ASSESSMENT (partial)')],
      ['inline in a sentence', okReport().replace(EVIDENCE_SECTION_NEXT_HEADER, 'refer to ' + EVIDENCE_SECTION_NEXT_HEADER + ' below')],
    ]) {
      assert(vq(mutated).code === 'missing-section', `ADVERSARIAL: a header with ${label} is not the header`);
    }
    // A header NAME quoted in prose can neither satisfy nor duplicate a section.
    assert(vq(inLimits('The report follows the ## 2. VIDEO PROFILE template.')).ok === true,
      'a canonical header name quoted mid-sentence neither satisfies nor duplicates a section');
    // Exactly once, still enforced on exact lines.
    assert(vq(okReport() + '\n## 3. PEOPLE, ENTITIES & SETTING\n').code === 'duplicate-section',
      'a repeated exact header line is still a duplicate');
    // Order, and the mandatory opening line.
    assert(vq('preamble\n' + okReport()).code === 'missing-section',
      'the report must OPEN with the exact "## 1. TL;DR" line');
    assert(vq(okReport().replace('## 1. TL;DR', '## 1. TL;DR ')).ok === true,
      'trailing whitespace on a header line is tolerated (trimmed equality, not raw equality)');
    // The exported line primitives are the ones the validator uses.
    assert(splitReportLines('a\r\nb\rc\nd').length === 4, 'CRLF, CR, and LF all split into lines');
    assert(findHeaderLine(['x', '  ## 1. TL;DR  ', 'y'], '## 1. TL;DR') === 1,
      'findHeaderLine matches a trimmed whole line');
    assert(findHeaderLine(['prefix ## 1. TL;DR'], '## 1. TL;DR') === -1,
      'findHeaderLine never matches a substring');
    assert(hasExactLine(['  exact  '], 'exact') && !hasExactLine(['x exact'], 'exact'),
      'hasExactLine is trimmed equality, never containment');
    assert(matchLines(['**a**', 'z **a**'], /^\*\*a\*\*$/).length === 1,
      'matchLines anchors the pattern to the complete trimmed line');
    // Section 2 and Section 5 bounds come from the exact header lines.
    const s2 = sectionLines(splitReportLines(okReport()), PROFILE_SECTION_HEADER, PROFILE_SECTION_NEXT_HEADER);
    assert(s2.some((l) => l.trim() === AUTHORIZED_SCOPE_LINE(2, 50)) && !s2.some((l) => l.includes('Slice 1 audio status')),
      'sectionLines returns exactly the lines between the two canonical header lines');
  }

  section('V4Q CORRECTION 2: Section 2 markers must be EXACT COMPLETE LINES');
  {
    const scope = AUTHORIZED_SCOPE_LINE(2, 50);
    // The work order's named case.
    assert(vq(okReport().replace(scope, 'NOT-AN-EXACT-LINE ' + scope + ' trailing')).code === 'scope-mismatch',
      'ADVERSARIAL: "NOT-AN-EXACT-LINE **Authorized scope:** ... trailing" does NOT satisfy the scope contract');
    for (const [code, mutated] of [
      ['scope-mismatch', okReport().replace(scope, 'Note: ' + scope)],
      ['scope-mismatch', okReport().replace(scope, scope + ' (approximately)')],
      ['source-duration-field-format', okReport().replace(UNDETERMINABLE_DURATION_LINE, 'Note: ' + UNDETERMINABLE_DURATION_LINE)],
      ['source-duration-field-format', okReport().replace(UNDETERMINABLE_DURATION_LINE, UNDETERMINABLE_DURATION_LINE + ' — but likely long')],
      ['synthetic-assessment-field-format', okReport().replace(NO_SYNTHETIC_EVIDENCE_LINE, 'We note ' + NO_SYNTHETIC_EVIDENCE_LINE + ' here.')],
      ['synthetic-assessment-field-format', okReport().replace(NO_SYNTHETIC_EVIDENCE_LINE, NO_SYNTHETIC_EVIDENCE_LINE + ' so far')],
    ]) {
      const v = vq(mutated);
      assert(v.ok === false && v.code === code, `ADVERSARIAL: an embedded/extended Section 2 marker is rejected with ${code}`);
    }
    // Exactly one assessment line: two conflicting ones cannot both stand.
    const twoAssessments = okReport().replace(NO_SYNTHETIC_EVIDENCE_LINE,
      NO_SYNTHETIC_EVIDENCE_LINE + '\n**Synthetic-media assessment:** clearly synthetic — Evidence: 00:04 warping — Confidence: HIGH');
    assert(vq(twoAssessments).code === 'synthetic-assessment-field-format',
      'two Section 2 synthetic-media assessment lines are rejected; exactly one is required');
    assert(SYNTHETIC_ASSESSMENT_SHAPE.test(NO_SYNTHETIC_EVIDENCE_LINE), 'the no-evidence line IS assessment-shaped');
    assert(STANDARDIZED_SYNTHETIC_LINE.test('**Synthetic-media assessment:** likely synthetic voiceover — Evidence: 00:12 uniform spectral envelope — Confidence: LOW'),
      'the standardized alternative is recognized as a complete anchored line');
    assert(!STANDARDIZED_SYNTHETIC_LINE.test('**Synthetic-media assessment:** likely synthetic voiceover — Evidence: uniform envelope — Confidence: LOW'),
      'the standardized alternative REQUIRES a timestamp');
    assert(!STANDARDIZED_SYNTHETIC_LINE.test('**Synthetic-media assessment:** likely synthetic — Evidence: 00:12 warping'),
      'the standardized alternative REQUIRES a confidence rating');
  }

  section('V4Q CORRECTION 2: Section 5 slice headings and markers must be EXACT COMPLETE LINES');
  {
    // §14: every fixture in this block is DELIBERATELY malformed — that is the point of it. The
    // test-side scope parser is not run here; it would refuse the very structure these cases exist
    // to hand to production. What replaces it is proof that the intended mutation actually
    // happened, so a stale literal can never turn an adversarial case into its compliant control.
    // Both marker literals are derived from R2, so they follow `compliantReport` automatically.
    const evidenceMarker = (n) => `**Slice ${n} audio evidence:** ${mmss(R2[n - 1].startOffset)} — a spoken phrase`;
    const anchorMarker = (n) => `**Slice ${n} transcription anchor:** "hold this position"`;
    const justificationMarker = (n) => `**Slice ${n} audio justification:** ${mmss(R2[n - 1].startOffset)} — listened across the slice; nothing audible`;

    // The work order's named case.
    assert(vq(mutateLiteral(okReport(), '**Slice 1 audio status:** SPEECH',
      'Prose says **Slice 1 audio status:** SPEECH maybe', 'prose-status')).code === 'missing-slice-audio',
      'ADVERSARIAL: "Prose says **Slice 1 audio status:** SPEECH maybe" is NOT a marker line');
    for (const [code, label, mutated] of [
      ['missing-slice', 'a slice heading quoted in prose',
        mutateLiteral(okReport(), SLICE_HEADING(2, R2[1]), 'see ' + SLICE_HEADING(2, R2[1]), 'heading-in-prose')],
      ['scope-mismatch', 'a slice heading with trailing text',
        mutateLiteral(okReport(), SLICE_HEADING(2, R2[1]), SLICE_HEADING(2, R2[1]) + ' (partial)', 'heading-trailing')],
      ['missing-slice-audio', 'an audio status with trailing hedging',
        mutateLiteral(okReport(), '**Slice 2 audio status:** SPEECH', '**Slice 2 audio status:** SPEECH or possibly MUSIC', 'status-hedged')],
      ['missing-slice-audio', 'an audio-evidence line embedded in prose',
        mutateLiteral(okReport(), evidenceMarker(2), 'As noted, ' + evidenceMarker(2), 'evidence-in-prose')],
      ['missing-speech-anchor', 'an anchor line with trailing commentary',
        mutateLiteral(okReport(), anchorMarker(2), anchorMarker(2) + ' probably', 'anchor-trailing')],
    ]) {
      const v = vq(mutated);
      assert(v.ok === false && v.code === code, `ADVERSARIAL: ${label} is rejected with ${code}`);
    }
    // WRONG SLICE SUBSECTION — every marker kind, not just the anchor.
    const move = (from, to, line) => mutateLiteral(
      mutateLiteral(okReport(), '\n' + line, '', `move-${from}-into-${to}-lift`),
      `**Slice ${to} audio status:** SPEECH`, `**Slice ${to} audio status:** SPEECH\n` + line,
      `move-${from}-into-${to}-drop`);
    assert(vq(move(2, 1, evidenceMarker(2))).code === 'missing-slice-audio',
      "slice 2's audio-evidence line sitting in slice 1's subsection does not satisfy slice 2");
    assert(vq(move(2, 1, anchorMarker(2))).code === 'missing-speech-anchor',
      "slice 2's anchor sitting in slice 1's subsection does not satisfy slice 2");
    // WRONG SECTION — a marker above the first slice heading is in no subsection at all.
    const aboveHeadings = mutateLiteral(
      mutateLiteral(okReport(), '\n**Slice 1 audio status:** SPEECH', '', 'above-headings-lift'),
      '**Section TL;DR:** evidence.', '**Section TL;DR:** evidence.\n**Slice 1 audio status:** SPEECH',
      'above-headings-drop');
    assert(vq(aboveHeadings).code === 'missing-slice-audio',
      "a marker placed in Section 5 but ABOVE slice 1's heading belongs to no subsection");
    // Universal-silence justification obeys the same anchored, per-subsection contract. This
    // correctly placed variant IS scope-honest, so it is guarded before it is asserted to pass.
    const silent = mutateRegex(
      mutateRegex(okReport(), /\*\*Slice (\d) audio status:\*\* SPEECH/, '**Slice $1 audio status:** SILENCE',
        2, 'silent-status'),
      /\*\*Slice (\d) transcription anchor:\*\*[^\n]*/, (_m, n) => justificationMarker(Number(n)),
      2, 'silent-anchor');
    guardScopeHonesty(silent, R2, 'silent-justified', { requireJustification: true });
    assert(vq(silent).ok === true, 'correctly placed per-slice justifications pass');
    assert(vq(mutateLiteral(silent, justificationMarker(2),
      'Commentary: ' + justificationMarker(2), 'justification-in-prose')).code === 'unjustified-universal-silence',
      'a justification embedded in prose does not satisfy the silence contract');
    // The exported marker contracts are the ones the validator applies.
    assert(SLICE_AUDIO_STATUS_LINE(1).test('**Slice 1 audio status:** SPEECH') && !SLICE_AUDIO_STATUS_LINE(1).test('x **Slice 1 audio status:** SPEECH'),
      'SLICE_AUDIO_STATUS_LINE is anchored at both ends');
    assert(SLICE_AUDIO_EVIDENCE_LINE(1).test('**Slice 1 audio evidence:** 00:01 — heard speech'),
      'SLICE_AUDIO_EVIDENCE_LINE accepts the contract form');
    assert(SLICE_ANCHOR_LINE(1).test('**Slice 1 transcription anchor:** "hold this"'),
      'SLICE_ANCHOR_LINE accepts the contract form');
    assert(SLICE_JUSTIFICATION_LINE(1).test('**Slice 1 audio justification:** 00:01 — listened; nothing'),
      'SLICE_JUSTIFICATION_LINE accepts the contract form');
    assert(SLICE_HEADING_SHAPE.test(SLICE_HEADING(1, R2[0])) && !SLICE_HEADING_SHAPE.test('see ### Slice 1: x'),
      'SLICE_HEADING_SHAPE only sees a heading-led line, so a malformed heading is counted then rejected');
    // The three passing fixtures are unchanged by all of the above.
    const one = [{ startOffset: 60, endOffset: 75 }];
    const eight = Array.from({ length: 8 }, (_, i) => ({ startOffset: i * 100, endOffset: i * 100 + 20 }));
    const scalarText = compliantReport(one); const eightText = compliantReport(eight); const twoText = okReport();
    guardScopeHonesty(scalarText, one, 'unchanged-scalar');
    guardScopeHonesty(twoText, R2, 'unchanged-2slice');
    guardScopeHonesty(eightText, eight, 'unchanged-8slice');
    assert(vq(scalarText, { ranges: one }).ok === true, 'the scalar fixture still passes');
    assert(vq(twoText).ok === true, 'the two-slice fixture still passes');
    assert(vq(eightText, { ranges: eight }).ok === true, 'the eight-slice fixture still passes');
  }

  // ================== V4Q FINAL: PROMPT / GATE AGREEMENT AND SINGLE SOURCE =====================
  section('V4Q FINAL: the base prompt no longer orders the field the gate rejects');
  {
    const basePrompt = fs.readFileSync(path.join(__dirname, '..', 'prompts', 'video-scout-analysis.md'), 'utf8');
    const supplement = buildAuthorizedScopeInstruction(R2);
    const resolved = basePrompt + '\n' + supplement;
    const evidenceTemplate = '**Synthetic-media assessment:** <finding> — Evidence: <MM:SS observation> — Confidence: LOW|MEDIUM|HIGH';

    // THE ROOT DEFECT: Section 2 used to order "approximate duration", which is precisely the field
    // the gate rejects. Prompt and gate now agree, so a model obeying the prompt cannot be rejected
    // for obeying it.
    assert(!/approximate duration,/i.test(basePrompt),
      'the base prompt no longer lists "approximate duration" as a Section 2 item');
    assert(/there is no approximate-duration item in this section/i.test(basePrompt),
      'the base prompt says so explicitly rather than merely omitting it');
    assert(DURATION_FIELD_CLAIM.test('Approximate duration: Over 1 hour') === true,
      '(the removed instruction produced exactly what the field detector rejects, which is why it had to go)');

    // §4.3 SINGLE SOURCE: each exact literal/template exists in exactly ONE place, the supplement.
    const occurrences = (haystack, needle) => haystack.split(needle).length - 1;
    for (const [label, literal] of [
      ['the source-duration line', UNDETERMINABLE_DURATION_LINE],
      ['the no-evidence line', NO_SYNTHETIC_EVIDENCE_LINE],
      ['the evidence-backed template', evidenceTemplate],
    ]) {
      assert(occurrences(resolved, literal) === 1, `${label} appears EXACTLY once in the resolved sliced prompt`);
      assert(occurrences(basePrompt, literal) === 0, `${label} does not appear in the base prompt (no second source to drift)`);
      assert(occurrences(supplement, literal) === 1, `${label} is owned solely by buildAuthorizedScopeInstruction`);
    }

    // §4.3.3 the non-literal discipline SURVIVES, so whole-video runs keep principle-level guidance.
    for (const [label, re] of [
      ['static/low-budget content is not evidence', /is NOT evidence of AI generation/],
      ['never classify origin by vibe', /Never classify origin by vibe/],
      ['affirmative findings need evidence and confidence', /requires specific timestamped observable evidence and a stated confidence level/],
      ['duration only when directly observable', /State a source duration ONLY when the full source duration is directly observable/],
    ]) {
      assert(re.test(basePrompt), `the base prompt retains: ${label}`);
    }

    // §4.3.6 the no-restatement instruction, in both the base prompt and the supplement.
    assert(/do not restate the conclusion, positive OR negative/i.test(basePrompt),
      'the base prompt forbids restating origin conclusions');
    for (const named of ['TL;DR', 'detailed summary', 'discrepancies section', 'credibility assessment', 'limitations section']) {
      assert(basePrompt.includes(named), `the no-restatement rule names the ${named}`);
    }
    assert(/ONLY place origin may be discussed/.test(supplement) && /not positively, and not negatively/.test(supplement),
      'the sliced supplement repeats the no-restatement rule in the terms the gate enforces');
    assert(/synthesized or synth-pad music, a manipulated exposure/.test(supplement),
      'the supplement tells the model which descriptive vocabulary remains SAFE');
    assert(/the two separators may each be a hyphen, en dash, or em dash/.test(supplement),
      'the supplement documents the separator tolerance the validator grants');

    // The canonical section template still matches the prompt, in order.
    const idx = REQUIRED_SECTIONS.map((h) => basePrompt.indexOf(h));
    assert(idx.every((i) => i !== -1), 'every canonical section header exists in the prompt');
    assert(idx.every((v, i) => i === 0 || v > idx[i - 1]), 'the prompt declares them in the required order');
  }

  // ==================== V4Q FINAL: CANONICAL FIELD FORMAT vs CONTENT ==========================
  // Two minimal canonical fields, deterministic format validation, finite lexical content checks,
  // and explicit format-before-content precedence. The gate prefers UNDER-matching to discarding a
  // correct provider response: semantic truth, euphemism, and unlisted paraphrase are human
  // acceptance's job, and the handoff says so literally.
  section('V4Q FINAL: source-duration FIELD FORMAT is its own code');
  {
    const cases = [
      ['missing', okReport().replace(UNDETERMINABLE_DURATION_LINE + '\n', '')],
      ['duplicated', okReport().replace(UNDETERMINABLE_DURATION_LINE, UNDETERMINABLE_DURATION_LINE + '\n' + UNDETERMINABLE_DURATION_LINE)],
      ['outside Section 2', okReport().replace(UNDETERMINABLE_DURATION_LINE + '\n', '')
        .replace('**Section TL;DR:** limits.', '**Section TL;DR:** limits.\n' + UNDETERMINABLE_DURATION_LINE)],
      ['prefixed', okReport().replace(UNDETERMINABLE_DURATION_LINE, 'Note: ' + UNDETERMINABLE_DURATION_LINE)],
      ['suffixed', okReport().replace(UNDETERMINABLE_DURATION_LINE, UNDETERMINABLE_DURATION_LINE + ' (probably)')],
      ['alternative wording', okReport().replace(UNDETERMINABLE_DURATION_LINE, '**Source duration:** UNKNOWN')],
    ];
    for (const [label, text] of cases) {
      const v = vq(text);
      assert(v.ok === false && v.code === 'source-duration-field-format',
        `a ${label} source-duration field returns source-duration-field-format`);
      assert(!/UNKNOWN|probably/.test(v.reason) || v.reason.includes(UNDETERMINABLE_DURATION_LINE),
        'the reason names the required literal, never the provider wording');
    }
    // The pure field validator, exercised directly.
    assert(validateSourceDurationField([UNDETERMINABLE_DURATION_LINE], [UNDETERMINABLE_DURATION_LINE]).ok === true,
      'validateSourceDurationField accepts exactly one exact line');
    assert(validateSourceDurationField([], [UNDETERMINABLE_DURATION_LINE]).code === 'source-duration-field-format',
      'validateSourceDurationField rejects a line that sits outside the profile section');
  }

  section('V4Q FINAL: synthetic-assessment FIELD FORMAT is its own code');
  {
    const cases = [
      ['missing', okReport().replace(NO_SYNTHETIC_EVIDENCE_LINE + '\n', '')],
      ['duplicated', okReport().replace(NO_SYNTHETIC_EVIDENCE_LINE, NO_SYNTHETIC_EVIDENCE_LINE + '\n' + NO_SYNTHETIC_EVIDENCE_LINE)],
      ['outside Section 2', okReport().replace(NO_SYNTHETIC_EVIDENCE_LINE + '\n', '')
        .replace('**Section TL;DR:** limits.', '**Section TL;DR:** limits.\n' + NO_SYNTHETIC_EVIDENCE_LINE)],
      ['prefixed', okReport().replace(NO_SYNTHETIC_EVIDENCE_LINE, 'We note ' + NO_SYNTHETIC_EVIDENCE_LINE)],
      ['neither accepted form', okReport().replace(NO_SYNTHETIC_EVIDENCE_LINE, '**Synthetic-media assessment:** probably fine')],
      ['timestampless evidence', okReport().replace(NO_SYNTHETIC_EVIDENCE_LINE, '**Synthetic-media assessment:** odd warping — Evidence: uniform envelope — Confidence: LOW')],
      ['no confidence rating', okReport().replace(NO_SYNTHETIC_EVIDENCE_LINE, '**Synthetic-media assessment:** odd warping — Evidence: 00:12 warping')],
      ['separator without whitespace', okReport().replace(NO_SYNTHETIC_EVIDENCE_LINE, '**Synthetic-media assessment:** odd warping—Evidence: 00:12 warping—Confidence: LOW')],
    ];
    for (const [label, text] of cases) {
      const v = vq(text);
      assert(v.ok === false && v.code === 'synthetic-assessment-field-format',
        `a ${label} synthetic-media assessment returns synthetic-assessment-field-format`);
    }
    assert(validateSyntheticAssessmentField([NO_SYNTHETIC_EVIDENCE_LINE], [NO_SYNTHETIC_EVIDENCE_LINE]).form === 'no-evidence',
      'validateSyntheticAssessmentField reports which accepted form was used');
  }

  section('V4Q FINAL CORRECTION: canonical-field uniqueness is GLOBAL, not section-scoped');
  {
    // Counting only inside Section 2 let a SECOND field stand elsewhere: one compliant assessment in
    // the Video Profile and another, contradicting one in the Limitations section both survived,
    // because the section-scoped count saw exactly one. Each LABEL is now counted across the WHOLE
    // report, by OCCURRENCE rather than by line.
    const dupCases = [
      ['source-duration-field-format', 'a second EXACT field outside Section 2', inLimits(UNDETERMINABLE_DURATION_LINE)],
      ['source-duration-field-format', 'a second MALFORMED field inside Section 2',
        okReport().replace(UNDETERMINABLE_DURATION_LINE, UNDETERMINABLE_DURATION_LINE + '\n**Source duration:** about an hour')],
      ['source-duration-field-format', 'a second PREFIXED field elsewhere', inLimits('Recap: **Source duration:** 1:02:03')],
      ['source-duration-field-format', 'a second SUFFIXED field elsewhere', inLimits(UNDETERMINABLE_DURATION_LINE + ' (approx)')],
      ['source-duration-field-format', 'TWO labels embedded in ONE line',
        okReport().replace(UNDETERMINABLE_DURATION_LINE, UNDETERMINABLE_DURATION_LINE + ' **Source duration:** 1:02:03')],
      ['synthetic-assessment-field-format', 'a second EXACT field outside Section 2', inLimits(NO_SYNTHETIC_EVIDENCE_LINE)],
      ['synthetic-assessment-field-format', 'a second MALFORMED field inside Section 2',
        okReport().replace(NO_SYNTHETIC_EVIDENCE_LINE, NO_SYNTHETIC_EVIDENCE_LINE + '\n**Synthetic-media assessment:** maybe')],
      ['synthetic-assessment-field-format', 'a second PREFIXED field elsewhere',
        inLimits('To repeat, ' + NO_SYNTHETIC_EVIDENCE_LINE)],
      ['synthetic-assessment-field-format', 'a second SUFFIXED field elsewhere',
        inLimits(NO_SYNTHETIC_EVIDENCE_LINE + ' as noted')],
      ['synthetic-assessment-field-format', 'TWO labels embedded in ONE line',
        okReport().replace(NO_SYNTHETIC_EVIDENCE_LINE, NO_SYNTHETIC_EVIDENCE_LINE + ' **Synthetic-media assessment:** x')],
    ];
    for (const [code, label, text] of dupCases) {
      const v = vq(text);
      assert(v.ok === false && v.code === code, `${label} returns ${code}`);
    }
    // FORMAT still wins even when the duplicate carries forbidden content: the response is malformed
    // first, and saying so is more actionable than reporting the content it also got wrong.
    assert(vq(inLimits('**Synthetic-media assessment:** clearly AI-generated')).code === 'synthetic-assessment-field-format',
      'a duplicate assessment carrying frozen vocabulary returns the FORMAT code, not the content code');
    assert(vq(inLimits('**Source duration:** 1:02:03')).code === 'source-duration-field-format',
      'a duplicate duration field carrying a length claim returns the FORMAT code, not the content code');
    // A normal report carrying exactly ONE accepted field of each kind still passes, in both forms.
    assert(vq(okReport()).ok === true, 'exactly one accepted field of each kind still passes (no-evidence form)');
    assert(vq(okReport().replace(NO_SYNTHETIC_EVIDENCE_LINE,
      '**Synthetic-media assessment:** synthetic voiceover — Evidence: 00:12 flat envelope — Confidence: HIGH')).ok === true,
      'exactly one accepted field of each kind still passes (evidence-backed form)');
    assert(validateReportQuality({ text: MEDITATION_REPORT, finishReason: 'STOP', ranges: MEDITATION_RANGES, audioTokens: 4480 }).ok === true,
      'the complete realistic fixture is unaffected by global uniqueness');
    // The pure validators count globally, and report the accepted line so the caller can exclude
    // exactly that one line by identity before the frozen-vocabulary scan.
    assert(validateSourceDurationField([UNDETERMINABLE_DURATION_LINE], [UNDETERMINABLE_DURATION_LINE]).line === UNDETERMINABLE_DURATION_LINE,
      'validateSourceDurationField returns the accepted line');
    assert(validateSyntheticAssessmentField([NO_SYNTHETIC_EVIDENCE_LINE], [NO_SYNTHETIC_EVIDENCE_LINE]).line === NO_SYNTHETIC_EVIDENCE_LINE,
      'validateSyntheticAssessmentField returns the accepted line, not just its form');
    assert(validateSourceDurationField([UNDETERMINABLE_DURATION_LINE], [UNDETERMINABLE_DURATION_LINE, UNDETERMINABLE_DURATION_LINE]).code === 'source-duration-field-format',
      'a valid Section 2 field does NOT excuse a second occurrence elsewhere');
  }

  section('V4Q FINAL: each separator is independently hyphen / en dash / em dash');
  {
    // §4.2 — all three variants, and mixed pairs, on each separator independently.
    for (const [a, b] of [['—', '—'], ['-', '-'], ['–', '–'], ['-', '—'], ['—', '-'], ['–', '—'], ['—', '–']]) {
      const line = `**Synthetic-media assessment:** likely synthetic voiceover ${a} Evidence: 00:12 uniform spectral envelope ${b} Confidence: MEDIUM`;
      assert(vq(okReport().replace(NO_SYNTHETIC_EVIDENCE_LINE, line)).ok === true,
        `an evidence-backed assessment separated by "${a}" then "${b}" is accepted`);
      assert(STANDARDIZED_SYNTHETIC_LINE.test(line), 'the exported complete-line contract accepts the same pair');
    }
    // V4Q FINAL CORRECTION: ONE OR MORE spaces/tabs on each side. Aligned or double-spaced output is
    // cosmetic; rejecting a correct assessment over an extra space would discard a good response.
    // Whitespace itself is still REQUIRED on both sides, so a hyphen inside a compound word can
    // never be read as a separator.
    const sep = (a, b) => okReport().replace(NO_SYNTHETIC_EVIDENCE_LINE,
      `**Synthetic-media assessment:** likely synthetic voiceover${a}Evidence: 00:12 flat envelope${b}Confidence: LOW`);
    for (const [label, a, b] of [
      ['a single space on each side', ' — ', ' — '],
      ['multiple spaces on each side', '   —   ', '  -  '],
      ['tabs on each side', '\t—\t', '\t–\t'],
      ['mixed separators AND mixed spacing', ' -  ', '  — '],
      ['a tab on one side and a space on the other', '\t— ', ' –\t'],
    ]) {
      assert(vq(sep(a, b)).ok === true, `separator whitespace: ${label} is accepted`);
    }
    for (const [label, a, b] of [
      ['no whitespace at all', '—', '—'],
      ['whitespace on the leading side only', ' —', '— '],
      ['whitespace on the trailing side only', '— ', ' —'],
    ]) {
      assert(vq(sep(a, b)).code === 'synthetic-assessment-field-format',
        `separator whitespace: ${label} is REJECTED (whitespace stays mandatory on both sides)`);
    }
    for (const confidence of ['LOW', 'MEDIUM', 'HIGH']) {
      assert(vq(okReport().replace(NO_SYNTHETIC_EVIDENCE_LINE,
        `**Synthetic-media assessment:** possible reuse — Evidence: 00:03 duplicated frame — Confidence: ${confidence}`)).ok === true,
        `confidence ${confidence} is accepted`);
    }
  }

  section('V4Q FINAL: format is decided BEFORE content');
  {
    // Both malformed → the source-duration code, deterministically.
    const bothBad = okReport()
      .replace(UNDETERMINABLE_DURATION_LINE, 'x ' + UNDETERMINABLE_DURATION_LINE)
      .replace(NO_SYNTHETIC_EVIDENCE_LINE, 'y ' + NO_SYNTHETIC_EVIDENCE_LINE);
    assert(vq(bothBad).code === 'source-duration-field-format',
      'when BOTH canonical fields are malformed, the source-duration format code is returned');
    // A malformed synthetic field that ALSO contains forbidden vocabulary is a FORMAT failure.
    assert(vq(okReport().replace(NO_SYNTHETIC_EVIDENCE_LINE, '**Synthetic-media assessment:** looks AI-generated')).code === 'synthetic-assessment-field-format',
      'a malformed assessment containing "AI-generated" returns the FORMAT code, not the content code');
    // A malformed duration field that ALSO contains a forbidden duration claim is a FORMAT failure.
    assert(vq(okReport().replace(UNDETERMINABLE_DURATION_LINE, 'Approximate duration: Over 1 hour.')).code === 'source-duration-field-format',
      'a replaced duration field carrying an invented duration returns the FORMAT code');
    // Well-formed fields hand off to the content contracts.
    assert(vq(inLimits('The static frame suggests stock footage.')).code === 'unsupported-synthetic-claim',
      'well-formed fields plus forbidden origin vocabulary returns the CONTENT code');
    assert(vq(inLimits("The video's duration is 1:02:03.")).code === 'speculative-source-duration',
      'well-formed fields plus a source-length claim returns the CONTENT code');
  }

  // ===================== V4Q FINAL: FROZEN SYNTHETIC-ORIGIN VOCABULARY =========================
  section('V4Q FINAL: every frozen origin phrase rejects OUTSIDE the canonical field');
  {
    assert(FORBIDDEN_ORIGIN_PHRASES.length === 17, 'the frozen vocabulary is exactly 17 phrases');
    for (const phrase of FORBIDDEN_ORIGIN_PHRASES) {
      const v = vq(inLimits(`Observed: ${phrase} characteristics.`));
      assert(v.ok === false && v.code === 'unsupported-synthetic-claim',
        `frozen phrase "${phrase}" rejects outside the canonical field`);
      assert(!v.reason.includes(phrase), 'the failure reason never echoes the matched phrase');
    }
    // Both accepted field forms are treated identically: an evidence-backed finding licenses the
    // FIELD, never a restatement elsewhere.
    const backed = (report) => report.replace(NO_SYNTHETIC_EVIDENCE_LINE,
      '**Synthetic-media assessment:** synthetic voiceover — Evidence: 00:12 flat envelope — Confidence: HIGH');
    assert(vq(backed(okReport())).ok === true, 'an evidence-backed assessment alone passes');
    assert(vq(backed(inLimits('This is AI-generated.'))).code === 'unsupported-synthetic-claim',
      'an evidence-backed assessment does NOT license restatement elsewhere');
    assert(vq(inLimits('This is AI-generated.')).code === 'unsupported-synthetic-claim',
      'a no-evidence assessment does NOT license restatement elsewhere');
  }

  section('V4Q FINAL: negative origin restatement is rejected DELIBERATELY (§8 reversal)');
  {
    // AUTHORIZED REVERSAL. These four were passing controls at 4aeb28f. There is no negation
    // interpretation any more: the canonical field is the ONLY place origin may be discussed, so a
    // denial in the Limitations section is a restatement. This is the single most likely
    // false-positive rejection from a well-behaved model, and the handoff says so.
    for (const claim of [
      'No observable evidence of AI generation was found.',
      'The material does not appear AI-generated.',
      'Nothing suggests AI generation.',
      'The footage was not digitally manipulated.',
      'It is not merely AI-generated.',
      'The imagery is not just synthetic media.',
      'No indications of AI generation were observed.',
    ]) {
      const v = vq(inLimits(claim));
      assert(v.ok === false && v.code === 'unsupported-synthetic-claim',
        `REVERSAL: negative restatement "${claim.slice(0, 40)}" is REJECTED`);
    }
    // The one §8 case that REMAINS passing: bare "synthetic" is not frozen vocabulary.
    assert(vq(inLimits('The imagery is not demonstrably synthetic.')).ok === true,
      'REVERSAL CONTROL: "not demonstrably synthetic" still PASSES (bare `synthetic` is excluded)');
  }

  section('V4Q FINAL: bare synth / audio / manipulation vocabulary is NOT an origin claim');
  {
    // These carry legitimate audio, editing, and camera meanings. Rejecting them would discard
    // correct observations, so they are excluded from the frozen list on purpose.
    for (const observation of [
      'Synthesized ambient tones continue under the narration.',
      'A low synth-pad drone is audible.',
      'Synthetic strings enter near the end.',
      'The camera manipulates focus during the transition.',
      'The exposure appears manually manipulated.',
      'Manipulation of the exposure is visible throughout.',
      'A synthesizer pad sustains beneath the narration.',
      'The manipulated focus resolves by the end of the slice.',
    ]) {
      assert(vq(inLimits(observation)).ok === true, `a legitimate observation passes: "${observation.slice(0, 40)}"`);
    }
    for (const bare of ['synthetic', 'synthesized', 'synth', 'manipulate', 'manipulation', 'manipulated exposure', 'manipulated focus']) {
      assert(FORBIDDEN_ORIGIN_PATTERNS.every((re) => !re.test(`the ${bare} is present`)),
        `bare "${bare}" is deliberately absent from the frozen vocabulary`);
    }
  }

  // ================== V4Q FINAL: SENTENCE-LOCAL SOURCE-DURATION CONTRACT =======================
  section('V4Q FINAL: the deterministic sentence-unit splitter');
  {
    assert(splitSentenceUnits('One. Two! Three?').join('|') === 'One.|Two!|Three?',
      'terminators followed by whitespace split');
    assert(splitSentenceUnits('A line\nB line').join('|') === 'A line|B line', 'line boundaries split');
    assert(splitSentenceUnits('It ran 1.5 hours today.').length === 1, 'a decimal point does NOT split');
    assert(splitSentenceUnits('The stamp is 1:02:03 exactly.').length === 1, 'a clock reading does NOT split');
    assert(splitSentenceUnits('   ').length === 0, 'blank input yields no units');
    // Value parsing is exact and closed.
    assert(parseDurationSeconds('1:02:03') === 3723 && parseDurationSeconds('1:05') === 65,
      'clock forms parse as H:MM:SS and M:SS');
    assert(parseDurationSeconds('62 minutes') === 3720 && parseDurationSeconds('one hour') === 3600
      && parseDurationSeconds('30 seconds') === 30, 'number and number-word values parse');
    assert(parseDurationSeconds('a while') === null && parseDurationSeconds('unknown') === null,
      'non-values parse to null, which is why honest prose never matches');
  }

  section('V4Q FINAL: productions 1, 2, 3 and 5 reject on their own');
  {
    for (const [id, claim] of [
      [1, "The video's duration is 1:02:03."],
      [1, 'The source length is 62 minutes.'],
      [2, 'The duration of the video is 62 minutes.'],
      [3, 'The overall runtime is 90 minutes.'],
      [5, 'Approximate duration: Over 1 hour.'],
      [5, 'Estimated runtime: 62 minutes'],
      [5, 'Video runtime: 1:02:03'],
    ]) {
      const v = vq(inLimits(claim));
      assert(v.ok === false && v.code === 'speculative-source-duration',
        `production ${id} rejects "${claim.slice(0, 36)}"`);
      assert(!v.reason.includes('62') || v.reason.includes('50s authorized aggregate'),
        'the reason states the authorized aggregate, never the claimed length');
    }
  }

  section('V4Q FINAL: productions 4 and 6 are gated by the AUTHORIZED AGGREGATE');
  {
    // R2 aggregates to 50s. This is the ONE place authorized scope disambiguates identical prose.
    assert(vq(inLimits('The video is over one hour long.')).code === 'speculative-source-duration',
      'production 4: "over one hour" exceeds the 50s aggregate and is REJECTED');
    assert(vq(inLimits('The recording runs for 62 minutes.')).code === 'speculative-source-duration',
      'production 6: "runs for 62 minutes" exceeds the 50s aggregate and is REJECTED');
    assert(vq(inLimits('The video is 90 seconds long.')).code === 'speculative-source-duration',
      'production 4: a value above the aggregate is REJECTED');
    assert(vq(inLimits('The video is 15 seconds long.')).ok === true,
      'production 4: BELOW the aggregate is bounded-scope description and PASSES');
    assert(vq(inLimits('The video is 50 seconds long.')).ok === true,
      'production 4: EQUAL to the aggregate PASSES');
    assert(vq(inLimits('The video is under two hours long.')).ok === true,
      'an upper-bound hedge proves nothing about exceeding the aggregate, so it PASSES');
    assert(vq(inLimits('The video is over 10 seconds long.')).ok === true,
      '"over N" with N below the aggregate does not deterministically exceed it, so it PASSES');
    // The same prose against a different authorized scope.
    const R30 = [{ startOffset: 0, endOffset: 30 }];
    const at30 = (extra) => compliantReport(R30).replace('**Section TL;DR:** limits.', '**Section TL;DR:** limits.\n' + extra);
    assert(vq(at30('The video is 15 seconds long.'), { ranges: R30 }).ok === true,
      '15s passes against a 30s aggregate');
    assert(vq(at30('The video is 30 seconds long.'), { ranges: R30 }).ok === true,
      '30s passes against a 30s aggregate (equal is in scope)');
    assert(vq(at30('The video is 45 seconds long.'), { ranges: R30 }).code === 'speculative-source-duration',
      '45s is REJECTED against a 30s aggregate');
    // The comparison helper, exercised directly.
    assert(claimExceedsAggregate('', '90 seconds', 50) === true, 'bare value above aggregate exceeds');
    assert(claimExceedsAggregate('', '50 seconds', 50) === false, 'equal does not exceed');
    assert(claimExceedsAggregate('over ', '10 seconds', 50) === false, '"over N" with N < aggregate is indeterminate');
    assert(claimExceedsAggregate('over ', '50 seconds', 50) === true, '"over N" with N >= aggregate exceeds');
    assert(claimExceedsAggregate('under ', '9 hours', 50) === false, 'an upper bound never exceeds');
    assert(claimExceedsAggregate('', 'a while', 50) === false, 'an unparseable value never exceeds');
  }

  section('V4Q FINAL CORRECTION: STRICT and INCLUSIVE lower bounds are not the same claim');
  {
    // "over 50s" EXCLUDES 50s, so at a 50s aggregate it necessarily claims material outside scope.
    // "at least 50s" is SATISFIED BY 50s, so it claims nothing outside scope and must pass.
    // Conflating them rejected a truthful bounded-scope statement.
    assert(vq(inLimits('The video is at least 50 seconds long.')).ok === true,
      'INCLUSIVE: "at least 50 seconds" at a 50s aggregate PASSES (50s satisfies it)');
    assert(vq(inLimits('The video is at least 51 seconds long.')).code === 'speculative-source-duration',
      'INCLUSIVE: "at least 51 seconds" at a 50s aggregate is REJECTED (strictly above)');
    assert(vq(inLimits('The video is over 50 seconds long.')).code === 'speculative-source-duration',
      'STRICT: "over 50 seconds" at a 50s aggregate is REJECTED (it excludes 50s)');
    assert(vq(inLimits('The video is 50 seconds long.')).ok === true,
      'exact unhedged equality still PASSES');
    // `upwards of` reads INCLUSIVELY -- the conservative choice, since no reviewed contract gives it
    // a stricter meaning.
    assert(vq(inLimits('The video is upwards of 50 seconds long.')).ok === true,
      '"upwards of 50 seconds" is read inclusively and PASSES at a 50s aggregate');
    assert(vq(inLimits('The video is upwards of 51 seconds long.')).code === 'speculative-source-duration',
      '"upwards of 51 seconds" is REJECTED (strictly above the aggregate)');
    // The hedge IMMEDIATELY preceding the value governs it.
    assert(vq(inLimits('The video is just over 50 seconds long.')).code === 'speculative-source-duration',
      '"just over 50 seconds" is governed by `over`, not by `just`, and is REJECTED');
    // Every pre-existing above/below control is unchanged.
    assert(vq(inLimits('The video is 15 seconds long.')).ok === true, 'below-aggregate control unchanged');
    assert(vq(inLimits('The video is 90 seconds long.')).code === 'speculative-source-duration', 'above-aggregate control unchanged');
    assert(vq(inLimits('The video is over 10 seconds long.')).ok === true, '"over N" below aggregate control unchanged');
    assert(vq(inLimits('The video is under two hours long.')).ok === true, 'upper-bound control unchanged');
    assert(vq(inLimits('The video is over one hour long.')).code === 'speculative-source-duration', 'the mandated example is unchanged');
    assert(vq(inLimits('The recording runs for 62 minutes.')).code === 'speculative-source-duration', 'production 6 control unchanged');
    // The comparison helper, per hedge class.
    assert(claimExceedsAggregate('at least ', '50 seconds', 50) === false, 'helper: inclusive at the aggregate does not exceed');
    assert(claimExceedsAggregate('at least ', '51 seconds', 50) === true, 'helper: inclusive above the aggregate exceeds');
    assert(claimExceedsAggregate('upwards of ', '50 seconds', 50) === false, 'helper: "upwards of" is inclusive');
    assert(claimExceedsAggregate('no less than ', '50 seconds', 50) === false, 'helper: "no less than" is inclusive');
    assert(claimExceedsAggregate('greater than ', '50 seconds', 50) === true, 'helper: "greater than" is strict');
    assert(claimExceedsAggregate('longer than ', '50 seconds', 50) === true, 'helper: "longer than" is strict');
    assert(claimExceedsAggregate('in excess of ', '50 seconds', 50) === true, 'helper: "in excess of" is strict');
    assert(claimExceedsAggregate('just over ', '50 seconds', 50) === true, 'helper: the LAST hedge governs the value');
  }

  section('V4Q FINAL CORRECTION: a non-binding approximation cannot PROVE an excess');
  {
    // "approximately 51 seconds" against a 50s aggregate supplies no deterministic lower bound.
    // Establishing one would mean inventing a tolerance, so the durable rule applies: when the
    // comparison cannot deterministically establish an excess, the claim PASSES. These are accepted
    // UNDER-matches, not findings that the report is correct.
    for (const claim of [
      'The video is approximately 51 seconds long.',
      'The video is about 51 seconds long.',
      'The video is roughly 90 seconds long.',
      'The video is around two hours long.',
      'The video is circa 62 minutes long.',
      'The video is nearly 51 seconds long.',
      'The video is almost 90 seconds long.',
      'The video is some 62 minutes long.',
      'The video is just 51 seconds long.',
      'The video is approx. 62 minutes long.',
    ]) {
      assert(vq(inLimits(claim)).ok === true,
        `NON-BINDING: "${claim.slice(13, 44)}" PASSES (no deterministic lower bound)`);
    }
    // Exact and numerically binding forms keep ordinary comparison.
    for (const claim of [
      'The video is 51 seconds long.',
      'The video is exactly 51 seconds long.',
      'The video is precisely 51 seconds long.',
      'The video is only 51 seconds long.',
    ]) {
      assert(vq(inLimits(claim)).code === 'speculative-source-duration',
        `BINDING: "${claim.slice(13, 44)}" is REJECTED above the aggregate`);
    }
    for (const claim of [
      'The video is 50 seconds long.',
      'The video is exactly 50 seconds long.',
      'The video is precisely 50 seconds long.',
      'The video is only 50 seconds long.',
    ]) {
      assert(vq(inLimits(claim)).ok === true, `BINDING: "${claim.slice(13, 44)}" at EQUALITY passes`);
    }
    // Terminal-hedge precedence, through the complete validator path.
    assert(vq(inLimits('The video is just over 50 seconds long.')).code === 'speculative-source-duration',
      'TERMINAL: "just over 50 seconds" is governed by strict `over` and REJECTS');
    assert(vq(inLimits('The video is approximately over 50 seconds long.')).code === 'speculative-source-duration',
      'TERMINAL: "approximately over 50 seconds" is governed by strict `over` and REJECTS');
    assert(vq(inLimits('The video is over approximately 51 seconds long.')).ok === true,
      'TERMINAL: "over approximately 51 seconds" is governed by non-binding `approximately` and PASSES');
    // The classifier itself, over the whole closed vocabulary.
    for (const [hedge, cls] of [
      ['approximately', 'nonbinding'], ['approx.', 'nonbinding'], ['approx', 'nonbinding'],
      ['about', 'nonbinding'], ['roughly', 'nonbinding'], ['around', 'nonbinding'],
      ['circa', 'nonbinding'], ['nearly', 'nonbinding'], ['almost', 'nonbinding'],
      ['some', 'nonbinding'], ['just', 'nonbinding'],
      ['exactly', 'binding'], ['precisely', 'binding'], ['only', 'binding'],
      ['over', 'strict'], ['more than', 'strict'], ['in excess of', 'strict'],
      ['greater than', 'strict'], ['longer than', 'strict'],
      ['at least', 'inclusive'], ['upwards of', 'inclusive'], ['no less than', 'inclusive'],
      ['under', 'upper'], ['less than', 'upper'], ['at most', 'upper'],
      ['up to', 'upper'], ['no more than', 'upper'], ['shorter than', 'upper'],
      ['', 'none'], ['   ', 'none'],
    ]) {
      assert(classifyTerminalHedge(hedge) === cls, `classifyTerminalHedge("${hedge}") is ${cls}`);
    }
    // LONGEST terminal phrase wins. Without this, "no less than" was classified by its "less than"
    // tail as an upper bound, and "no more than" by its "more than" tail as a strict lower bound --
    // each landing in the wrong class and silently misjudging the aggregate comparison.
    assert(classifyTerminalHedge('no less than') === 'inclusive' && classifyTerminalHedge('less than') === 'upper',
      'the longer "no less than" is NOT classified by its shorter "less than" tail');
    assert(classifyTerminalHedge('no more than') === 'upper' && classifyTerminalHedge('more than') === 'strict',
      'the longer "no more than" is NOT classified by its shorter "more than" tail');
    assert(claimExceedsAggregate('no less than ', '51 seconds', 50) === true,
      '"no less than 51 seconds" exceeds a 50s aggregate');
    assert(claimExceedsAggregate('no less than ', '50 seconds', 50) === false,
      '"no less than 50 seconds" does NOT exceed a 50s aggregate');
    assert(claimExceedsAggregate('no more than ', '9 hours', 50) === false,
      '"no more than" is an upper bound and never exceeds');
    assert(DUR_HEDGE_PHRASES.every((p, i, a) => i === 0 || a[i - 1].length >= p.length),
      'the hedge vocabulary is ordered longest-first for both matching and classification');
    assert(DUR_HEDGE_PHRASES.length === HEDGE_CLASS_BY_PHRASE.size,
      'every matchable hedge phrase has exactly one class -- none is matchable but unclassified');
    // Non-binding approximation does NOT weaken the mandated rejections.
    assert(vq(inLimits('The video is over one hour long.')).code === 'speculative-source-duration',
      'the mandated "over one hour long" rejection is unchanged');
    assert(vq(inLimits('Approximate duration: Over 1 hour.')).code === 'speculative-source-duration',
      'the line-anchored duration FIELD is unaffected by hedge classification');
    assert(vq(inLimits("The video's duration is 1:02:03.")).code === 'speculative-source-duration',
      'ungated production 1 is unaffected by hedge classification');
  }

  section('V4Q FINAL: bounded subjects and cross-unit co-occurrence PASS');
  {
    // `slice`, `clip`, `segment`, and `part` are NOT whole-source subjects.
    for (const control of [
      'The video shows a static frame for 30 seconds.',
      'This clip runs for 30 seconds.',
      'The clip spans 1:05:00.',
      'Slice 1 covers 30 seconds.',
      'The segment lasts 40 seconds.',
      'Part 2 lasts 40 seconds.',
    ]) {
      assert(vq(inLimits(control)).ok === true, `bounded-subject control passes: "${control.slice(0, 36)}"`);
    }
    // AUTHORIZED REVERSAL (§8): this was a rejecting case at 4aeb28f.
    assert(vq(inLimits('The clip spans 1:05:00.')).ok === true,
      'REVERSAL: a `clip` duration statement now PASSES (bounded subject)');
    // Honest limitation prose supplies no concrete value, so no production can match it.
    for (const honest of [
      'The source duration cannot be determined from these slices.',
      'The full duration of the video is unknown from the authorized slices alone.',
      'Only the authorized aggregate was analyzed; the source length was never visible.',
      'Duration beyond the authorized slices could not be determined.',
      'The full source length is not determinable from the authorized slices.',
    ]) {
      assert(vq(inLimits(honest)).ok === true, `honest limitation prose passes: "${honest.slice(0, 36)}"`);
    }
    // Tokens are NEVER combined across units.
    for (const [label, split] of [
      ['sentences', 'The video is static throughout. A caption reads 62 minutes.'],
      ['lines', 'The video is static throughout.\nA caption reads 62 minutes.'],
      ['paragraphs', 'The video holds one frame.\n\nElsewhere a timer shows 62 minutes.'],
    ]) {
      assert(vq(inLimits(split)).ok === true, `cross-${label} co-occurrence does NOT assemble a claim`);
    }
    // The sanctioned lines never trigger themselves.
    assert(DURATION_FIELD_CLAIM.test(AUTHORIZED_SCOPE_LINE(2, 50)) === false, 'the scope line is not a duration field');
    assert(DURATION_FIELD_CLAIM.test(SLICE_HEADING(1, R2[0])) === false, 'a slice heading is not a duration field');
    assert(DURATION_FIELD_CLAIM.test(UNDETERMINABLE_DURATION_LINE) === true,
      '(the sanctioned line IS field-shaped, which is why it is stripped before the scan)');
    assert(vq(okReport()).ok === true, 'the sanctioned lines together still pass');
  }

  // ======================= V4Q FINAL: CANONICAL SECTION IDENTITY (§9) ==========================
  section('V4Q FINAL: REQUIRED_SECTIONS is the SINGLE ordered template definition');
  {
    assert(REQUIRED_SECTIONS.length === 9, 'the template declares exactly nine sections');
    assert(PROFILE_SECTION_INDEX === 1 && REQUIRED_SECTIONS[PROFILE_SECTION_INDEX] === PROFILE_SECTION_HEADER,
      'Video Profile is the SECOND canonical section, and its header is derived from the template');
    assert(REQUIRED_SECTIONS[PROFILE_SECTION_INDEX + 1] === PROFILE_SECTION_NEXT_HEADER,
      "Video Profile's end boundary is the FOLLOWING canonical section");
    assert(EVIDENCE_SECTION_INDEX === 4 && REQUIRED_SECTIONS[EVIDENCE_SECTION_INDEX] === EVIDENCE_SECTION_HEADER,
      'the evidence section is the FIFTH canonical section, derived from the same template');
    assert(REQUIRED_SECTIONS[EVIDENCE_SECTION_INDEX + 1] === EVIDENCE_SECTION_NEXT_HEADER,
      "the evidence section's end boundary is the FOLLOWING canonical section");
    // Template drift fails visibly rather than silently retargeting a different section.
    assert(vq(okReport().replace(PROFILE_SECTION_HEADER, '## 2. CLIP PROFILE')).code === 'missing-section',
      'renaming Video Profile fails visibly');
    assert(vq(okReport().replace(PROFILE_SECTION_NEXT_HEADER, '## 3. CAST')).code === 'missing-section',
      "renaming Video Profile's boundary section fails visibly");
    // Field checks cannot begin targeting a different section: the fields are only ever accepted
    // between the derived boundaries.
    const s2 = sectionLines(splitReportLines(okReport()), PROFILE_SECTION_HEADER, PROFILE_SECTION_NEXT_HEADER);
    assert(s2.some((l) => l.trim() === UNDETERMINABLE_DURATION_LINE) && s2.some((l) => l.trim() === NO_SYNTHETIC_EVIDENCE_LINE),
      'both canonical fields live between the derived Video Profile boundaries');
  }

  // ================== V4Q FINAL: THE COMPLETE REALISTIC PASSING FIXTURE (§9) ===================
  section('V4Q FINAL: a complete, realistic nine-section guided-meditation report PASSES');
  {
    const v = validateReportQuality({
      text: MEDITATION_REPORT, finishReason: 'STOP', ranges: MEDITATION_RANGES, audioTokens: 4480,
    });
    assert(v.ok === true, `the complete realistic report passes with ZERO failure codes (got ${v.code || 'ok'}: ${v.reason || ''})`);
    // It is genuinely complete and genuinely realistic — not a fixture shaped to slip past the gate.
    const lines = MEDITATION_REPORT.split('\n');
    for (const header of REQUIRED_SECTIONS) {
      assert(lines.filter((l) => l.trim() === header).length === 1, `it carries "${header}" exactly once`);
    }
    assert(MEDITATION_RANGES.reduce((s, r) => s + (r.endOffset - r.startOffset), 0) === 180,
      'its authorized aggregate is 180s across two non-adjacent windows');
    assert(lines.filter((l) => l.trim() === AUTHORIZED_SCOPE_LINE(2, 180)).length === 1, 'exact authorized scope');
    assert(lines.filter((l) => l.trim() === UNDETERMINABLE_DURATION_LINE).length === 1, 'the canonical duration field');
    assert(lines.filter((l) => l.trim() === NO_SYNTHETIC_EVIDENCE_LINE).length === 1, 'the canonical assessment field');
    MEDITATION_RANGES.forEach((r, i) => {
      assert(lines.filter((l) => l.trim() === SLICE_HEADING(i + 1, r)).length === 1,
        `slice ${i + 1} opens with its exact heading and complete endpoints`);
    });
    assert(/synthesized ambient pad/.test(MEDITATION_REPORT) && /synthesized strings/.test(MEDITATION_REPORT),
      'it describes synthesized music honestly — the exact vocabulary the frozen list excludes');
    // V4 REVISION 8: the consolidated ranges end on the LAST OBSERVABLE SECOND of their half-open
    // windows — `[0,90)` is observed as 00:00-01:29, not 00:00-01:30. The realistic fixture is held
    // to the same scope honesty as every synthetic one; it gets no exemption for being readable.
    assert(/00:06-01:29 \[VISUAL\]/.test(MEDITATION_REPORT) && /10:00-11:29 \[VISUAL\]/.test(MEDITATION_REPORT),
      'static imagery is consolidated into RANGES rather than per-second filler');
    // Every timestamp-bearing Section 5 line — [VISUAL], [AUDIO], [TEXT] and both audio-evidence
    // markers — is parsed out of the assembled report and authorized against MEDITATION_RANGES.
    const med = guardScopeHonesty(MEDITATION_REPORT, MEDITATION_RANGES, 'meditation',
      { observations: (n) => (n === 1 ? 5 : 4) });
    assert(med.total === 9, `it carries nine timestamp-led Section 5 evidence lines (found ${med.total})`);
    assert(med.parsed.declarations.length === 2, 'it declares exactly two slices');
    assert(MEDITATION_REPORT.split('\n').filter((l) => /^\*\*Slice \d audio justification:\*\*/.test(l.trim())).length === 0,
      'it needs no audio-justification marker because both slices are speech-bearing');
    assert(/The source duration cannot be determined from these slices/.test(MEDITATION_REPORT),
      'it carries truthful bounded-duration prose');
    assert(!/no discrepancies/i.test(MEDITATION_REPORT) && /corroborates neither position/.test(MEDITATION_REPORT),
      'its discrepancies section states a real cross-channel conflict, not a vacuous denial');
    assert(FORBIDDEN_ORIGIN_PATTERNS.every((re) => !re.test(MEDITATION_REPORT)),
      'it never restates synthetic origin outside the canonical field');
    assert(lines.filter((l) => l.trim().startsWith('**Slice')).length === 6,
      'it carries per-slice audio status, evidence, and anchors for both slices');
  }

  // ============================ V4Q diagnostic lifecycle ======================================
  section('V4Q --diagnostic-dir is MANDATORY and validated before any submission');
  {
    const noDir = ['--url', 'https://youtu.be/test', '--prompt-text', 'p', '--media-resolution', 'LOW'];
    let h = makeDeps([resp(200, SUCCESS_BODY)]);
    assert((await runVideoScout(noDir, h.deps)) === 1 && h.calls.length === 0,
      'a missing --diagnostic-dir refuses with ZERO fetches (never spends to discover it)');
    h = makeDeps([resp(200, SUCCESS_BODY)]);
    assert((await runVideoScout([...noDir, '--diagnostic-dir'], h.deps)) === 1 && h.calls.length === 0,
      'a valueless trailing --diagnostic-dir refuses with ZERO fetches');
    h = makeDeps([resp(200, SUCCESS_BODY)]);
    assert((await runVideoScout([...noDir, '--diagnostic-dir', 'relative/path'], h.deps)) === 1 && h.calls.length === 0,
      'a relative --diagnostic-dir refuses with ZERO fetches');
    h = makeDeps([resp(200, SUCCESS_BODY)], { statSync: () => { throw new Error('ENOENT'); } });
    assert((await runVideoScout(ARGS, h.deps)) === 1 && h.calls.length === 0,
      'a non-existent --diagnostic-dir refuses with ZERO fetches');
    h = makeDeps([resp(200, SUCCESS_BODY)], { statSync: () => ({ isDirectory: () => false }) });
    assert((await runVideoScout(ARGS, h.deps)) === 1 && h.calls.length === 0,
      'a --diagnostic-dir that is not a directory refuses with ZERO fetches');
    // Pure resolver contract.
    assert(resolveDiagnosticDir(parseArgs([])).error, 'resolveDiagnosticDir: absent flag is an error');
    assert(resolveDiagnosticDir(parseArgs(['--diagnostic-dir', FAKE_DIAG_DIR]), { statSync: () => ({ isDirectory: () => true }) }).dir === FAKE_DIAG_DIR,
      'resolveDiagnosticDir: an existing absolute directory resolves');
  }

  section('V4Q rejected response: preserved once, usage kept, error, no report, no repair call');
  {
    const badBody = {
      candidates: [{ content: { parts: [{ text: okReport().replace(UNDETERMINABLE_DURATION_LINE, 'Approximate duration: Over 1 hour.') }] }, finishReason: 'STOP' }],
      usageMetadata: { promptTokenCount: 22406, candidatesTokenCount: 3122, totalTokenCount: 25528, promptTokensDetails: [{ modality: 'VIDEO', tokenCount: 18410 }, { modality: 'AUDIO', tokenCount: 2240 }] },
    };
    const h = makeDeps([resp(200, badBody)]);
    const code = await runVideoScout(sliceArgs(S2), h.deps);
    assert(code === 1, 'a quality rejection exits non-zero');
    assert(h.calls.length === 1, 'NO repair, retry, continuation, or fallback request is made after rejection');
    // The rejected analysis text must never reach the terminal or the Logs pane.
    assert(!h.logs.some((l) => l.includes('Over 1 hour')) && !h.errs.some((l) => l.includes('Over 1 hour')),
      'the rejected response body is never emitted to stdout or stderr');
    assert(!h.logs.some((l) => l.includes('## 1. TL;DR')), 'no part of the rejected report is printed');
    // Usage IS preserved so the manifest can record what the failed run cost.
    const usage = h.logs.filter((l) => l.includes('[video-scout usage]'));
    assert(usage.length === 1 && usage[0].includes('video=18410') && usage[0].includes('audio=2240'),
      'the usage line is still emitted exactly once (cost truth is preserved)');
    // Exactly one write + one atomic rename to the fixed leaf, as a direct child of the run dir.
    assert(h.writes.length === 1 && h.renames.length === 1, 'the diagnostic is written once and renamed once (atomic)');
    assert(h.renames[0].to === path.join(FAKE_DIAG_DIR, DIAGNOSTIC_FILENAME),
      `the diagnostic lands on the fixed leaf ${DIAGNOSTIC_FILENAME} as a direct child of the run directory`);
    assert(path.dirname(h.renames[0].to) === FAKE_DIAG_DIR, 'the diagnostic is a DIRECT child (no nesting, no traversal)');
    // Exact bytes: UTF-8, no BOM, byte-for-byte the provider response.
    const buf = h.writes[0].buf;
    assert(Buffer.isBuffer(buf) && buf.toString('utf8') === badBody.candidates[0].content.parts[0].text,
      'the preserved bytes are the EXACT provider response text');
    assert(!(buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF), 'the diagnostic is UTF-8 WITHOUT a BOM');
    // The machine-readable line carries an allowlisted code and our independently checkable identity.
    const q = h.logs.filter((l) => l.startsWith('[video-scout quality]'));
    assert(q.length === 1, 'exactly one machine-readable quality line is emitted');
    const m = /^\[video-scout quality\] rejected code=(\S+) file=(\S+) bytes=(\d+) sha256=([0-9a-f]{64})$/.exec(q[0]);
    assert(m && QUALITY_FAILURE_CODES.includes(m[1]), 'the quality line carries an allowlisted failure code');
    assert(m[2] === DIAGNOSTIC_FILENAME && Number(m[3]) === buf.length, 'the reported leaf and byte count match what was written');
    assert(m[4] === crypto.createHash('sha256').update(buf).digest('hex'), 'the reported sha256 matches the preserved bytes');
  }

  section('V4Q FINAL: BOTH new format codes drive the full diagnostic lifecycle');
  {
    // §12 — the same mandatory preservation applies to the two format codes, proven end to end
    // through inert local fixtures. No credentials, no media, no network.
    const cases = [
      ['source-duration-field-format', okReport().replace(UNDETERMINABLE_DURATION_LINE, 'Approximate duration: SECRET-LEN Over 1 hour.')],
      ['synthetic-assessment-field-format', okReport().replace(NO_SYNTHETIC_EVIDENCE_LINE, '**Synthetic-media assessment:** SECRET-CLAIM looks AI-generated')],
    ];
    for (const [expectedCode, text] of cases) {
      const body = {
        candidates: [{ content: { parts: [{ text }] }, finishReason: 'STOP' }],
        usageMetadata: {
          promptTokenCount: 18410, candidatesTokenCount: 900, totalTokenCount: 19310,
          promptTokensDetails: [{ modality: 'AUDIO', tokenCount: 2240 }],
        },
      };
      const h = makeDeps([resp(200, body)]);
      assert((await runVideoScout(sliceArgs(S2), h.deps)) === 1, `${expectedCode}: the run exits non-zero`);
      assert(h.calls.length === 1, `${expectedCode}: NO repair, retry, continuation, or fallback request follows`);
      // Exact bytes preserved once, atomically, on the fixed leaf.
      assert(h.writes.length === 1 && h.renames.length === 1, `${expectedCode}: written once, renamed once`);
      assert(h.renames[0].to === path.join(FAKE_DIAG_DIR, DIAGNOSTIC_FILENAME),
        `${expectedCode}: the diagnostic is a direct child on the fixed leaf`);
      const buf = h.writes[0].buf;
      assert(buf.toString('utf8') === text, `${expectedCode}: the preserved bytes are the EXACT provider response`);
      assert(!(buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF), `${expectedCode}: UTF-8 without a BOM`);
      // Usage survives the rejection so the manifest can record what the failed run cost.
      const usage = h.logs.filter((l) => l.includes('[video-scout usage]'));
      assert(usage.length === 1 && usage[0].includes('audio=2240'), `${expectedCode}: usage is preserved exactly once`);
      // The code crosses the Node -> PowerShell boundary unchanged, with a verifiable identity.
      const q = h.logs.filter((l) => l.startsWith('[video-scout quality]'));
      assert(q.length === 1, `${expectedCode}: exactly one machine-readable quality line`);
      const m = /^\[video-scout quality\] rejected code=(\S+) file=(\S+) bytes=(\d+) sha256=([0-9a-f]{64})$/.exec(q[0]);
      assert(m && m[1] === expectedCode, `${expectedCode}: the quality line carries the EXACT new code`);
      assert(QUALITY_FAILURE_CODES.includes(m[1]), `${expectedCode}: the code is inside the closed allowlist`);
      assert(m[2] === DIAGNOSTIC_FILENAME && Number(m[3]) === buf.length && m[4] === crypto.createHash('sha256').update(buf).digest('hex'),
        `${expectedCode}: leaf, byte count, and sha256 all match the preserved bytes`);
      // No provider content leaks into any operator-visible channel.
      for (const line of [...h.logs, ...h.errs]) {
        assert(!line.includes('SECRET-LEN') && !line.includes('SECRET-CLAIM') && !line.includes('## 1. TL;DR'),
          `${expectedCode}: no provider text reaches stdout, stderr, or the Logs pane`);
      }
    }
  }

  section('V4Q diagnostic write failure: never retried, no metadata published');
  {
    const badBody = {
      candidates: [{ content: { parts: [{ text: okReport().replace(UNDETERMINABLE_DURATION_LINE, 'Approximate duration: Over 1 hour.') }] }, finishReason: 'STOP' }],
      usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5, totalTokenCount: 15, promptTokensDetails: [{ modality: 'AUDIO', tokenCount: 2240 }] },
    };
    const h = makeDeps([resp(200, badBody)], { writeThrows: true });
    const code = await runVideoScout(sliceArgs(S2), h.deps);
    assert(code === 1 && h.calls.length === 1, 'a diagnostic write failure is terminal and never re-calls the provider');
    assert(h.logs.some((l) => l === '[video-scout quality] rejected code=diagnostic-write-failed'),
      'the write failure is reported as the allowlisted diagnostic-write-failed code with NO artifact metadata');
    assert(h.logs.filter((l) => l.includes('[video-scout usage]')).length === 1, 'usage is still preserved');
    assert(h.errs.some((l) => /could NOT be preserved/.test(l)), 'the failure is visible, never silent');
  }

  section('V4Q diagnostic writer: bounds, overwrite refusal, and no diagnostic on success');
  {
    const dir = FAKE_DIAG_DIR;
    const okWrite = writeRejectedResponseDiagnostic({ diagnosticDir: dir, text: 'body' },
      { writeFileSync: () => {}, renameSync: () => {}, existsSync: () => false, unlinkSync: () => {} });
    assert(okWrite.ok && okWrite.fileName === DIAGNOSTIC_FILENAME && okWrite.bytes === 4, 'a normal write reports the fixed leaf and byte count');
    const dup = writeRejectedResponseDiagnostic({ diagnosticDir: dir, text: 'body' },
      { writeFileSync: () => {}, renameSync: () => {}, existsSync: () => true, unlinkSync: () => {} });
    assert(!dup.ok && /already exists/.test(dup.error), 'an existing diagnostic is NEVER overwritten (preserved evidence wins)');
    const overChars = writeRejectedResponseDiagnostic({ diagnosticDir: dir, text: 'x'.repeat(MAX_DIAGNOSTIC_CHARS + 1) },
      { writeFileSync: () => { throw new Error('must not be called'); }, renameSync: () => {}, existsSync: () => false, unlinkSync: () => {} });
    assert(!overChars.ok && /character/.test(overChars.error), 'the character bound is enforced BEFORE any bytes are written');
    // The CHARACTER bound is the binding constraint in practice: a JS string of at most
    // MAX_DIAGNOSTIC_CHARS units encodes to at most 3 bytes per unit (BMP <= 3 bytes; astral pairs
    // spend 4 bytes across 2 units), so <= 3,000,000 bytes — always under the 4 MiB byte bound. The
    // byte check is therefore a deliberate defence-in-depth backstop, not dead weight: it keeps the
    // guarantee if either constant is ever retuned independently. Prove that relationship holds
    // rather than asserting an unreachable rejection.
    assert(MAX_DIAGNOSTIC_CHARS * 3 <= MAX_DIAGNOSTIC_BYTES,
      'the character bound is the binding constraint: no in-bounds string can exceed the byte bound');
    const worstCase = Buffer.from('ࠀ'.repeat(MAX_DIAGNOSTIC_CHARS), 'utf8').length;
    assert(worstCase === MAX_DIAGNOSTIC_CHARS * 3 && worstCase <= MAX_DIAGNOSTIC_BYTES,
      'a worst-case 3-byte-per-unit payload at the character bound still fits inside the byte bound');
    const atBound = writeRejectedResponseDiagnostic({ diagnosticDir: dir, text: 'x'.repeat(MAX_DIAGNOSTIC_CHARS) },
      { writeFileSync: () => {}, renameSync: () => {}, existsSync: () => false, unlinkSync: () => {} });
    assert(atBound.ok && atBound.bytes === MAX_DIAGNOSTIC_CHARS, 'exactly at the character bound is accepted (inclusive)');
    assert(MAX_DIAGNOSTIC_BYTES === 4 * 1024 * 1024 && MAX_DIAGNOSTIC_CHARS === 1000000,
      'the V4Q diagnostic bounds are pinned (4 MiB / 1,000,000 characters)');
    // A PASSING response creates no diagnostic at all.
    const h = makeDeps([resp(200, SLICED_BODY)]);
    assert((await runVideoScout(sliceArgs(S2), h.deps)) === 0, 'a compliant sliced response is accepted');
    assert(h.writes.length === 0 && h.renames.length === 0, 'a passing response creates NO diagnostic');
    assert(!h.logs.some((l) => l.startsWith('[video-scout quality]')), 'a passing response emits no quality-rejection line');
  }

  section('V4Q failure-code allowlist is closed and matches the validator');
  {
    assert(QUALITY_FAILURE_CODES.length === 15, 'exactly the 15 approved failure codes exist');
    const expected = ['finish-max-tokens', 'finish-not-stop', 'missing-section', 'duplicate-section',
      'scope-mismatch', 'missing-slice', 'missing-slice-audio', 'missing-speech-anchor',
      'unjustified-universal-silence',
      // V4Q FINAL: the two canonical-field FORMAT codes, beside their CONTENT counterparts.
      'source-duration-field-format', 'speculative-source-duration',
      'synthetic-assessment-field-format', 'unsupported-synthetic-claim',
      'repetitive-timestamp-filler', 'diagnostic-write-failed'];
    assert(expected.every((c) => QUALITY_FAILURE_CODES.includes(c)), 'every approved code is present');
    const src = fs.readFileSync(path.join(__dirname, 'gemini-video-sdk.js'), 'utf8');
    const emitted = new Set((src.match(/fail\('([a-z0-9\-]+)'/g) || []).map((s) => s.slice(6, -1)));
    for (const c of emitted) assert(QUALITY_FAILURE_CODES.includes(c), `emitted code ${c} is inside the closed allowlist`);
  }

  process.stdout.write(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
})();
