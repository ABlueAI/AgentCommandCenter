'use strict';
// Video-scout SDK path: analyze a PUBLIC YouTube video by passing its URL straight to the Gemini
// API (v1beta generateContent, REST via node's built-in fetch — no npm deps). This route exists
// because the gemini CLI's @file attachment is inline-base64 with a hard 20MB cap
// (MAX_FILE_SIZE_MB in the CLI bundle), which every real 720p video exceeds; the CLI then
// silently sends the prompt WITHOUT the video. The API's fileData.fileUri accepts a public
// YouTube URL directly: no yt-dlp download, no size cap, and generationConfig.mediaResolution
// actually takes effect here (the CLI has no flag for it).
//
// Invoked by scripts/feed-gemini.ps1 when Resolve-VideoSourceRoute picks 'sdk' (YouTube URL +
// video mode). Non-YouTube / local files still go through the CLI path unchanged.
//
// Auth: GEMINI_API_KEY from the environment ONLY (video-scout PTYs receive it from safeStorage
// via main.js's ptyEnv). Never accepted on argv (argv is visible in process listings), never
// read from or written to disk.
//
// Args:
//   --url <youtube url>              required
//   --model <gemini model>           default gemini-2.5-flash-lite
//   --media-resolution LOW|MEDIUM|HIGH   default MEDIUM (maps to MEDIA_RESOLUTION_*)
//   --prompt-file <path>             read prompt from file (newlines preserved — no CLI
//                                    flattening needed on this path)
//   --prompt-text <text>             literal prompt (overrides --prompt-file)
//   --start-offset <seconds>         optional; with --end-offset, analyzes only that slice —
//   --end-offset <seconds>           billing scales to the slice (~81% cheaper for 2min of 10min)
//
// Output: analysis text to stdout, then one machine-readable usage line the renderer forwards
// to the Logs tab:  [video-scout usage] prompt=N (video=N audio=N text=N) output=N total=N ...
//
// K5 shutdown contract: NO runtime path calls process.exit(). runVideoScout() returns a numeric
// exit code; runCliEntry() (the one production entry adapter — also what the child-process tests
// invoke) assigns process.exitCode and lets Node's event loop and fetch/undici resources drain
// naturally. The observed one-off native crash on the 503 path
// (`Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)` in libuv's win/async.c) is consistent
// with a forced process.exit() racing async-handle teardown; the race was NOT reproduced in 120
// bounded local fixture runs, so the inference stays recorded as plausible-not-proven — but
// forced exit is unsafe by Node's own documentation regardless, and the child fixture tests pin
// "no native assertion" on this contract permanently.
//
// K5 retry contract (bounded, cost-honest): a Gemini 503 / parsed UNAVAILABLE gets at most
// THREE total submitted attempts with two bounded jittered delays. Explicit terminal HTTP
// statuses take precedence over anything the body claims. Failed attempts yield no usable
// analysis or usage metadata, but whether the provider bills them is UNKNOWN — that
// uncertainty is exactly why this file is a Full-class review surface.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const MEDIA_RESOLUTION_MAP = {
  LOW: 'MEDIA_RESOLUTION_LOW',
  MEDIUM: 'MEDIA_RESOLUTION_MEDIUM',
  HIGH: 'MEDIA_RESOLUTION_HIGH',
};
const DEFAULT_MODEL = 'gemini-2.5-flash-lite';

// --- V4 bounded multi-slice constants (mirrored in app/video-scout-args.js and
// scripts/lib/get-video-scout-slice-ranges.ps1). This file re-enforces the WHOLE multi-slice
// contract independently — serialized bound, exact shape, count, integer bounds, order/overlap,
// aggregate cap, scalar mutual exclusion — because it is a runnable entry point of its own and
// must never trust that PowerShell or main validated first. -----------------------------------
const MIN_MULTI_SLICES = 2;
const MAX_SLICES = 8;                       // deliberately below Gemini's documented 10-video max
const AGGREGATE_SLICE_CAP_SECONDS = 1800;   // fixed; no flag or env var can raise it
const MAX_SLICE_RANGES_JSON_UNITS = 2048;   // bounds the serialized control argument ONLY
const MAX_OFFSET_SECONDS = 86400;

// --- V4Q generation-policy constants (SDK-OWNED; see the packet's "SDK-owned generation policy").
// Nothing under scripts/ may import the renderer policy module: the renderer's copy governs the
// modal's RECOMMENDATION only, and this file is a runnable entry point that must never trust that
// PowerShell or main resolved the model first. --------------------------------------------------
const PRO_MODEL = 'gemini-2.5-pro';
const BASE_MAX_OUTPUT_TOKENS = 16384;       // slice counts 0/1/2 all land here
const PER_EXTRA_SLICE_OUTPUT_TOKENS = 2048; // each slice above 2 adds this much visible headroom
const SLICED_PRO_THINKING_BUDGET = 8192;    // ONLY for gemini-2.5-pro with >=1 slice

// --- V4Q diagnostic bounds. Defined independently here and in PowerShell
// (scripts/lib/get-video-scout-diagnostic-artifact.ps1); tests assert the two agree. They
// intentionally match the current Library report bounds but are an independent V4Q contract, so a
// later Library change cannot silently move the diagnostic ceiling. -----------------------------
const MAX_DIAGNOSTIC_BYTES = 4 * 1024 * 1024;
const MAX_DIAGNOSTIC_CHARS = 1000000;
const DIAGNOSTIC_FILENAME = 'rejected-response.txt';

// --- K5 retry policy constants (documented bounds, asserted in tests) ------------------------
const RETRY_MAX_ATTEMPTS = 3;          // total submitted attempts, structural for-loop cap
const RETRY_BASE_DELAY_MS = 1000;      // delay n = base * 2^(n-1) + jitter -> 1.0-1.5s, 2.0-2.5s
const RETRY_JITTER_MS = 500;
// Explicit terminal statuses: never retried, EVEN IF a malformed/contradictory body claims
// UNAVAILABLE (approved correction #1 — the transport status outranks the body's story).
const NON_RETRYABLE_STATUSES = [400, 401, 403, 404, 429];

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--url') out.url = argv[++i];
    else if (a === '--model') out.model = argv[++i];
    else if (a === '--media-resolution') out.mediaResolution = argv[++i];
    else if (a === '--prompt-file') out.promptFile = argv[++i];
    else if (a === '--prompt-text') out.promptText = argv[++i];
    // Record that the flag was SEEN separately from its value: a flag given as the final argv
    // element has an undefined value, which must be distinguishable from "flag not passed" so it
    // can be refused (resolveSliceOffsets) instead of silently falling through to a whole-video run.
    else if (a === '--start-offset') { out.startOffsetSeen = true; out.startOffset = argv[++i]; }
    else if (a === '--end-offset') { out.endOffsetSeen = true; out.endOffset = argv[++i]; }
    // Same seen/value split as the offsets: a trailing valueless flag must be refusable, never
    // silently treated as "not passed" (which would fall through to a whole-video run).
    else if (a === '--slice-ranges-json') { out.sliceRangesJsonSeen = true; out.sliceRangesJson = argv[++i]; }
    // V4Q: mandatory discrete diagnostic directory. Same seen/value split as the offsets so a
    // trailing valueless flag is refusable rather than silently absent — this argument gates a PAID
    // submission, so "not supplied" and "supplied empty" must never collapse into each other.
    else if (a === '--diagnostic-dir') { out.diagnosticDirSeen = true; out.diagnosticDir = argv[++i]; }
  }
  return out;
}

// Validate the section-scoping offsets, exported for tests. Returns { sliced:false } (whole video),
// { sliced:true, startOffset, endOffset } (both valid non-negative integers, end strictly after
// start), or { error } — never a coerced/pass-through string and never a silent whole-video
// downgrade when a slice was requested. runVideoScout() returns 1 on { error }. Mirrors the
// refuse-don't-downgrade invariant enforced in feed-gemini.ps1 and app/video-scout-args.js.
function resolveSliceOffsets(args) {
  const startSeen = !!args.startOffsetSeen;
  const endSeen = !!args.endOffsetSeen;
  if (!startSeen && !endSeen) return { sliced: false };
  if (startSeen !== endSeen) {
    return { error: 'Both --start-offset and --end-offset are required to analyze a slice (only one was given); refusing rather than analyzing the whole video.' };
  }
  const parse = (name, raw) => {
    if (raw === undefined) return { error: `${name} was given with no value.` };
    if (!/^\d+$/.test(String(raw))) return { error: `${name} must be a non-negative whole number of seconds (got ${JSON.stringify(raw)}).` };
    return { value: parseInt(raw, 10) };
  };
  const s = parse('--start-offset', args.startOffset);
  if (s.error) return { error: s.error };
  const e = parse('--end-offset', args.endOffset);
  if (e.error) return { error: e.error };
  if (e.value <= s.value) {
    return { error: `--end-offset (${e.value}s) must be strictly greater than --start-offset (${s.value}s).` };
  }
  return { sliced: true, startOffset: s.value, endOffset: e.value };
}

// V4: validate the multi-slice control argument, exported for tests. The FULL contract is
// re-enforced here independently (work-order clarification): mutual exclusion with the scalar
// offsets, the 2048-unit serialized bound BEFORE parsing, exact array/object shape, 2-8 count,
// integer offsets within 0-86400, end strictly after start, chronological non-overlap in the
// given order (never sorted/merged/deduplicated), and the fixed aggregate cap. Returns
// { multi:false } (flag absent), { multi:true, ranges, aggregateSeconds }, or { error } — never a
// coerced pass-through and never a silent downgrade to whole-video.
function resolveSliceRanges(args) {
  if (!args.sliceRangesJsonSeen) return { multi: false };
  if (args.startOffsetSeen || args.endOffsetSeen) {
    return { error: '--slice-ranges-json and --start-offset/--end-offset are mutually exclusive; pass one or the other, never both.' };
  }
  const raw = args.sliceRangesJson;
  if (raw === undefined) return { error: '--slice-ranges-json was given with no value.' };
  if (typeof raw !== 'string' || raw.length > MAX_SLICE_RANGES_JSON_UNITS) {
    return { error: `--slice-ranges-json exceeds the ${MAX_SLICE_RANGES_JSON_UNITS}-unit bound (got ${raw && raw.length} units); refusing before parsing.` };
  }
  let parsed;
  try { parsed = JSON.parse(raw); }
  catch { return { error: '--slice-ranges-json is not valid JSON; refusing rather than guessing what was meant.' }; }
  if (!Array.isArray(parsed)) return { error: '--slice-ranges-json must be a JSON array of {startOffset, endOffset} objects.' };
  if (parsed.length < MIN_MULTI_SLICES || parsed.length > MAX_SLICES) {
    return { error: `--slice-ranges-json needs ${MIN_MULTI_SLICES} to ${MAX_SLICES} slices (got ${parsed.length}). One slice uses --start-offset/--end-offset; zero slices means the whole video.` };
  }
  const ranges = [];
  for (let i = 0; i < parsed.length; i++) {
    const entry = parsed[i];
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
      return { error: `slice ${i + 1} must be an object with exactly startOffset and endOffset.` };
    }
    const keys = Object.keys(entry).sort();
    if (keys.length !== 2 || keys[0] !== 'endOffset' || keys[1] !== 'startOffset') {
      return { error: `slice ${i + 1} must contain exactly the keys startOffset and endOffset (got ${JSON.stringify(Object.keys(entry))}).` };
    }
    const { startOffset, endOffset } = entry;
    const validOffset = (n) => typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= MAX_OFFSET_SECONDS;
    if (!validOffset(startOffset) || !validOffset(endOffset)) {
      return { error: `slice ${i + 1} offsets must be whole seconds from 0 to ${MAX_OFFSET_SECONDS} (got start=${JSON.stringify(startOffset)}, end=${JSON.stringify(endOffset)}).` };
    }
    if (endOffset <= startOffset) {
      return { error: `slice ${i + 1} end (${endOffset}s) must be strictly after its start (${startOffset}s).` };
    }
    if (i > 0 && startOffset < ranges[i - 1].endOffset) {
      return { error: `slice ${i + 1} (${startOffset}s-${endOffset}s) must start at or after the end of slice ${i} (${ranges[i - 1].startOffset}s-${ranges[i - 1].endOffset}s): slices must be chronological and non-overlapping, and are never reordered or merged.` };
    }
    ranges.push({ startOffset, endOffset });
  }
  const aggregateSeconds = ranges.reduce((sum, r) => sum + (r.endOffset - r.startOffset), 0);
  if (aggregateSeconds > AGGREGATE_SLICE_CAP_SECONDS) {
    return { error: `the slices add up to ${aggregateSeconds}s, which exceeds the fixed ${AGGREGATE_SLICE_CAP_SECONDS}s multi-slice cap (no flag can raise it).` };
  }
  return { multi: true, ranges, aggregateSeconds };
}

// The exact per-slice heading the report must echo, and the machine-checked marker lines. These
// constants are the SINGLE source of truth shared by the generated scope instruction and the
// deterministic validator, so the prompt can never ask for one spelling while the gate demands
// another. Changing a spelling here changes both sides at once (and its contract test fails loudly).
const AUTHORIZED_SCOPE_LINE = (count, aggregateSeconds) =>
  `**Authorized scope:** ${count} slice(s), aggregate ${aggregateSeconds}s`;
const SLICE_HEADING = (n, r) =>
  `### Slice ${n}: [${r.startOffset}s,${r.endOffset}s) — ${r.endOffset - r.startOffset}s authorized`;
const UNDETERMINABLE_DURATION_LINE = '**Source duration:** UNDETERMINABLE FROM AUTHORIZED SLICES';
const NO_SYNTHETIC_EVIDENCE_LINE = '**Synthetic-media assessment:** NO OBSERVABLE EVIDENCE';
const AUDIO_STATUSES = ['SPEECH', 'MUSIC', 'AMBIENCE', 'SILENCE', 'UNCLEAR'];

// V4Q FINAL (§9) -- THE SINGLE ORDERED TEMPLATE DEFINITION. This array is the only place the
// report's section identity and order are written down. Every section-boundary constant below is
// DERIVED from it by index, so the profile and evidence boundaries cannot silently begin targeting
// a different section after a template edit: renaming or reordering a section moves the derived
// constants with it and fails the contract tests visibly. Previously '## 2. VIDEO PROFILE' was
// spelled here AND again as a standalone constant -- two sources of truth for one string.
const REQUIRED_SECTIONS = [
  '## 1. TL;DR',
  '## 2. VIDEO PROFILE',
  '## 3. PEOPLE, ENTITIES & SETTING',
  '## 4. DETAILED SUMMARY',
  '## 5. COMPREHENSIVE TIMESTAMPED FINDINGS',
  '## 6. CLAIMS, NUMBERS & CALLS TO ACTION',
  '## 7. DISCREPANCIES & CROSS-CHECKS',
  '## 8. SOURCE-CREDIBILITY ASSESSMENT',
  '## 9. LIMITATIONS OF THIS ANALYSIS',
];
// The two gated regions, named by their ordinal position in the one template above.
const PROFILE_SECTION_INDEX = 1;   // Video Profile: carries both canonical quality fields.
const EVIDENCE_SECTION_INDEX = 4;  // Comprehensive timestamped findings: carries slice subsections.
const PROFILE_SECTION_HEADER = REQUIRED_SECTIONS[PROFILE_SECTION_INDEX];
const PROFILE_SECTION_NEXT_HEADER = REQUIRED_SECTIONS[PROFILE_SECTION_INDEX + 1];
const EVIDENCE_SECTION_HEADER = REQUIRED_SECTIONS[EVIDENCE_SECTION_INDEX];
const EVIDENCE_SECTION_NEXT_HEADER = REQUIRED_SECTIONS[EVIDENCE_SECTION_INDEX + 1];

// V4Q (was buildSliceScopeInstruction, multi-only): the deterministic, repository-owned authorized
// scope instruction for ONE THROUGH EIGHT ranges. A scalar slice is converted upstream into a
// single internal range and composes through this SAME function, so a one-slice run receives the
// identical boundary, audio, and anti-speculation contract that multipart runs receive — the V4Q
// failure evidence showed the scalar path silently skipped all of it.
//
// Appended to the RESOLVED prompt (default brief, explicit prompt, or focus-composed text) at one
// site so both production entries (feed-gemini.ps1 and a direct node invocation) compose it
// identically. Content is numbers + fixed text only — no user text, no transport/tool-call detail,
// and never the acceptance oracles (subject, video age, channel size).
function buildAuthorizedScopeInstruction(ranges) {
  const count = ranges.length;
  const aggregateSeconds = ranges.reduce((sum, r) => sum + (r.endOffset - r.startOffset), 0);
  const lines = ranges.map((r, i) => `- ${SLICE_HEADING(i + 1, r)}`);
  return [
    `--- ANALYSIS SCOPE: ${count} AUTHORIZED VIDEO SLICE${count === 1 ? '' : 'S'} ---`,
    `This request attaches ${count} time slice${count === 1 ? '' : 's'} of the same video, listed in chronological order. ONLY these explicit slices are authorized for analysis; treat everything outside them as out of scope and do not analyze or speculate about it. Ranges are half-open [start,end): the end second is the exclusive boundary.`,
    ...lines,
    '',
    'MANDATORY OUTPUT CONTRACT — a response missing any of the following is rejected locally and never becomes a report:',
    `1. Include this exact line once, in Section 2: \`${AUTHORIZED_SCOPE_LINE(count, aggregateSeconds)}\``,
    `2. Include this exact line once, in Section 2: \`${UNDETERMINABLE_DURATION_LINE}\`. You cannot see the full source, so you must NOT estimate, infer, or state a total video duration. Report only the authorized aggregate above.`,
    `3. Include a Synthetic-media assessment line exactly once, in Section 2. If you have no timestamped observable evidence of AI generation, synthesis, deepfaking, stock footage, or manipulation, the line must be exactly: \`${NO_SYNTHETIC_EVIDENCE_LINE}\`. Static, simple, low-budget, animated, or amateur-looking content is NOT evidence of AI generation. Only if you have specific timestamped evidence, use: \`**Synthetic-media assessment:** <finding> — Evidence: <MM:SS observation> — Confidence: LOW|MEDIUM|HIGH\` (the two separators may each be a hyphen, en dash, or em dash).`,
    '3a. That one line is the ONLY place origin may be discussed. Do NOT restate the conclusion anywhere else — not positively, and not negatively. Sentences such as "no evidence of AI generation was found", "the footage was not digitally manipulated", or "this is not stock footage" are restatements and are rejected exactly like a positive claim. Write the field, then say nothing further about origin. Describing what you SEE and HEAR is always fine: synthesized or synth-pad music, a manipulated exposure, and a static frame are ordinary observations, not origin claims.',
    `4. In Section 5, open each slice with its exact heading, in this order, echoing BOTH endpoints exactly as written above:`,
    ...lines.map((l) => `   ${l.slice(2)}`),
    `5. Under each slice heading, include these marker lines (N = that slice's number):`,
    `   \`**Slice N audio status:** <${AUDIO_STATUSES.join('|')}>\` — assess the audio of THAT slice independently; never carry a judgement across slices.`,
    '   `**Slice N audio evidence:** MM:SS — <what you actually heard, or what you listened for and did not hear>`',
    '   `**Slice N transcription anchor:** "<short verbatim quote>"` — REQUIRED whenever that slice\'s status is SPEECH.',
    `   If EVERY slice is SILENCE or UNCLEAR, each slice additionally requires \`**Slice N audio justification:** MM:SS — <what you listened for and why you concluded there was nothing>\`. An audio stream was supplied; "there is no audio" is not an available answer.`,
    '6. Consolidate an unchanged condition into ONE ranged entry (e.g. `01:00-01:29 [VISUAL] static green frame, no change`). Do NOT emit one near-identical observation per second; repeated filler is rejected.',
    '',
    'Attribute findings to their slice ("Slice 1", "Slice 2", ...) so each slice remains clearly distinguishable throughout the report. Keep the required report structure EXACTLY as instructed above — the same sections, the same headers, and the report must still begin with `## 1. TL;DR`.',
  ].join('\n');
}

// V4Q SDK-owned generation policy, pure and exported. `maxOutputTokens` applies to EVERY SDK video
// model and never itself enables, disables, or pins thinking. The 8,192 thinking budget is added
// only for bounded sliced Pro, so Flash keeps its provider-default dynamic thinking, Flash-Lite
// keeps its no-thinking default, and explicit whole-video Pro keeps provider-default dynamic
// thinking — no pre-existing non-sliced thinking behavior is silently changed.
function buildGenerationConfig({ model, mediaResolution, effectiveSliceCount }) {
  const config = {};
  const mapped = MEDIA_RESOLUTION_MAP[mediaResolution];
  if (mapped) config.mediaResolution = mapped;
  const count = Number.isInteger(effectiveSliceCount) && effectiveSliceCount > 0 ? effectiveSliceCount : 0;
  config.maxOutputTokens = BASE_MAX_OUTPUT_TOKENS + Math.max(0, count - 2) * PER_EXTRA_SLICE_OUTPUT_TOKENS;
  // Exact-string match on purpose: an unknown or direct model string must fall through to the
  // provider default rather than inherit a budget reviewed only for 2.5 Pro.
  if (model === PRO_MODEL && count >= 1) {
    config.thinkingConfig = { thinkingBudget: SLICED_PRO_THINKING_BUDGET };
  }
  return config;
}

// Pure request-body builder, exported for tests. When both offsets are given (validated upstream
// by resolveSliceOffsets) they become videoMetadata on the same part as fileData, which is what
// makes the API bill only the slice instead of the whole video. The New-Agent modal exposes the
// range picker that feeds these through feed-gemini.ps1's -StartOffset/-EndOffset.
// V4 multi-slice: sliceRanges (2-8, validated upstream by resolveSliceRanges) become N ORDERED
// media parts — each repeating the same validated public URL via fileData.fileUri with ONLY its
// own videoMetadata — followed by ONE text part last. There is no whole-video part, no omitted or
// merged slice, and no upload; with sliceRanges absent the zero/one-slice body is unchanged.
// V4Q: `model` is now threaded in so the ONE production body builder owns generation policy
// (scalar and multipart both reach buildGenerationConfig through this single site).
function buildRequestBody({ url, prompt, model, mediaResolution, startOffset, endOffset, sliceRanges }) {
  let parts;
  let effectiveSliceCount;
  if (Array.isArray(sliceRanges) && sliceRanges.length) {
    parts = sliceRanges.map((r) => ({
      fileData: { fileUri: url },
      videoMetadata: { startOffset: `${r.startOffset}s`, endOffset: `${r.endOffset}s` },
    }));
    parts.push({ text: prompt });
    effectiveSliceCount = sliceRanges.length;
  } else {
    const videoPart = { fileData: { fileUri: url } };
    if (startOffset !== undefined && endOffset !== undefined) {
      videoPart.videoMetadata = { startOffset: `${startOffset}s`, endOffset: `${endOffset}s` };
      effectiveSliceCount = 1;
    } else {
      effectiveSliceCount = 0;
    }
    parts = [videoPart, { text: prompt }];
  }
  const body = { contents: [{ role: 'user', parts }] };
  body.generationConfig = buildGenerationConfig({ model, mediaResolution, effectiveSliceCount });
  return body;
}

// V4Q effective-model resolution, pure and exported. An EXPLICIT model always wins exactly as
// given (including an unknown/direct string — this file never silently substitutes a model the
// caller did not ask for). With no explicit model, bounded slice scope defaults to Pro and
// whole-video stays on the economy default. Resolved BEFORE the endpoint, body, logs, usage line,
// and manifest are built so all five structurally agree.
function resolveEffectiveModel({ explicitModel, effectiveSliceCount }) {
  if (explicitModel) return explicitModel;
  return effectiveSliceCount >= 1 ? PRO_MODEL : DEFAULT_MODEL;
}

// --- V4Q deterministic report-quality validator ------------------------------------------------
// Runs AFTER a successful provider response and BEFORE the analysis may be emitted or become a
// report. It guarantees STRUCTURAL compliance, never semantic truth: a model can still produce a
// convincing but false audio justification. See the handoff's honest-limitation section.
// (REQUIRED_SECTIONS and the derived section boundaries are defined once, further up.)

// V4Q FINAL (§6) -- THE FROZEN SYNTHETIC-ORIGIN VOCABULARY. A closed, literal list. Matching is
// case-insensitive with word boundaries and NO negation interpretation whatsoever: a forbidden
// phrase rejects wherever it appears outside the one accepted canonical assessment field, including
// inside a denial. That is deliberate. The canonical field is the ONLY place origin may be
// discussed, so "No observable evidence of AI generation was found." in the Limitations section is
// a restatement and is rejected -- see the handoff, where this is called out as the most likely
// false-positive rejection from an otherwise well-behaved model.
//
// Bare `synthetic`, `synthesized`, `synth`, `manipulate`, and `manipulation` are ABSENT on purpose:
// they have ordinary audio, editing, and camera meanings ("synthesized ambient tones", "the camera
// manipulates focus"), and rejecting them would discard correct observations. The gate prefers
// under-matching to discarding a correct response.
const FORBIDDEN_ORIGIN_PHRASES = [
  'AI-generated', 'AI generated', 'AI generation',
  'synthetic media', 'synthetically generated',
  'deepfake', 'deepfakes', 'deepfaked', 'deepfaking',
  'deep fake', 'deep fakes', 'deep faked', 'deep faking',
  'stock footage', 'manipulated footage', 'manipulated imagery', 'digitally manipulated',
];
const FORBIDDEN_ORIGIN_PATTERNS = FORBIDDEN_ORIGIN_PHRASES.map((phrase) => new RegExp(
  String.raw`\b${phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '[ \\t]+')}\b`, 'i'));
// Claims that no audio STREAM exists. Deliberately distinct from an honest SILENCE finding: the
// gate rejects "there was nothing to hear", never "I listened and heard silence".
const NO_AUDIO_STREAM_CLAIMS = [
  /\bno audio(?:\s+or\s+[a-z ]+?)?\s+(?:is|was)?\s*(?:present|supplied|provided|included|available|attached)\b/i,
  /\bno audio\s+(?:track|stream|channel)\b/i,
  /\bthere\s+is\s+no\s+audio\b/i,
  /\bthe\s+video\s+is\s+silent\b/i,
  /\baudio\s+(?:is|was)\s+(?:absent|not\s+present|not\s+provided|not\s+supplied)\b/i,
];
const TIMESTAMP = String.raw`\d{1,2}:\d{2}(?::\d{2})?`;
// V4Q CORRECTION: a FIELD-shaped duration assertion. Deliberately narrow -- it requires a
// "<qualifier> duration" label followed by a separator, so honest prose ("the full duration of the
// video is unknown", "only the authorized 70s were analyzed") never matches, while the observed
// failure ("Approximate duration: Over 1 hour") does. The one sanctioned line is stripped before
// this runs, and the authorized-scope line and per-slice headings use different wording entirely.
// V4Q CORRECTION 2: the field noun now also covers runtime / running time / length, and the two
// inherently whole-source nouns (duration, runtime) additionally match with no qualifier at all.
// `length` still REQUIRES a whole-source qualifier so a per-slice "Slice 1 length:" field is
// untouched. Anchored per line (multiline `^`) rather than the old `(?:^|\n)` prefix so the match
// is a line-leading field label, never a fragment found mid-line.
const DURATION_FIELD_QUALIFIER = 'approximate|source|video|total|full|overall|runtime|running|estimated|actual|original|complete|entire';
const DURATION_FIELD_NOUN = String.raw`duration|runtime|running[ \t]+time|run[ \t]*time|length`;
const DURATION_FIELD_CLAIM = new RegExp(
  String.raw`^[ \t>*_-]*(?:\*\*)?[ \t]*(?:(?:${DURATION_FIELD_QUALIFIER})[ \t]+(?:${DURATION_FIELD_NOUN})|duration|runtime|running[ \t]+time)[ \t]*(?:\*\*)?[ \t]*[:\-–—]`,
  'im');

// V4Q FINAL (§7) -- THE SENTENCE-LOCAL SOURCE-DURATION CONTRACT. The previous revision matched
// natural language across a whole report, which meant an unbounded interpretation problem. This
// replaces it with six finite productions, five of which must match INSIDE ONE deterministic unit.
// Tokens are never combined across units, so a paragraph mentioning "video" and a later paragraph
// mentioning "62 minutes" cannot be assembled into a claim neither sentence made.

// §7.2 -- the closed vocabularies. `slice`, `clip`, `segment`, and `part` are deliberately NOT
// whole-source subjects: a statement about an authorized portion is in scope and must pass.
const DUR_SUBJECT = String.raw`(?:videos?|sources?|footage|recordings?|films?)`;
const DUR_NOUN = String.raw`(?:duration|runtime|running[ \t]+time|length)`;
const DUR_MODIFIER = String.raw`(?:total|full|overall|entire|complete|original|source|video)`;
const DUR_LINK = String.raw`(?:is|was|are|were|appears?[ \t]+to[ \t]+be|seems?[ \t]+to[ \t]+be|comes?[ \t]+to|totals?|equals?|measures?|clocks?[ \t]+in[ \t]+at)`;
const DUR_RUNNING_VERB = String.raw`(?:runs?[ \t]+for|lasts?|spans?)`;
const DUR_ARTICLE = String.raw`(?:(?:the|this|that|its|a|an)[ \t]+)?(?:${DUR_MODIFIER}[ \t]+)*`;
// Hedges split by what they let us conclude against the authorized aggregate (§7.4).
const DUR_HEDGE_LOWER = String.raw`(?:over|more[ \t]+than|in[ \t]+excess[ \t]+of|at[ \t]+least|upwards[ \t]+of|greater[ \t]+than|longer[ \t]+than)`;
const DUR_HEDGE_UPPER = String.raw`(?:under|less[ \t]+than|at[ \t]+most|up[ \t]+to|no[ \t]+more[ \t]+than|shorter[ \t]+than)`;
const DUR_HEDGE_APPROX = String.raw`(?:approximately|approx\.?|about|roughly|around|circa|nearly|almost|just|exactly|precisely|only|some)`;
const DUR_HEDGE = String.raw`(?:(?:${DUR_HEDGE_LOWER}|${DUR_HEDGE_UPPER}|${DUR_HEDGE_APPROX})[ \t]+)*`;
const NUMBER_WORDS = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, fifteen: 15, twenty: 20, thirty: 30, forty: 40, fifty: 50,
  sixty: 60, ninety: 90, half: 0.5,
};
const DUR_NUMBER = String.raw`(?:\d+(?:\.\d+)?|${Object.keys(NUMBER_WORDS).join('|')})`;
const DUR_UNIT = String.raw`(?:hours?|hrs?|minutes?|mins?|seconds?|secs?)`;
// A CONCRETE value only: a clock reading, or a number followed by a spelled time unit. This single
// requirement is why honest limitation prose keeps passing -- "the source duration cannot be
// determined from these slices" supplies no value, so no production can match it.
const DUR_VALUE = String.raw`(?:${TIMESTAMP}|${DUR_NUMBER}[ \t]*${DUR_UNIT})`;
const DUR_CLAIM = String.raw`(${DUR_HEDGE})(${DUR_VALUE})`;

// Pure, exported: parse ONE concrete value to seconds, or null when it is not one of the closed
// forms. `M:SS` is minutes:seconds; `H:MM:SS` is hours:minutes:seconds.
function parseDurationSeconds(raw) {
  const value = String(raw == null ? '' : raw).trim();
  const clock = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(value);
  if (clock) {
    return clock[3] === undefined
      ? Number(clock[1]) * 60 + Number(clock[2])
      : Number(clock[1]) * 3600 + Number(clock[2]) * 60 + Number(clock[3]);
  }
  const m = new RegExp(String.raw`^(${DUR_NUMBER})[ \t]*(${DUR_UNIT})$`, 'i').exec(value);
  if (!m) return null;
  const token = m[1].toLowerCase();
  const n = /^\d/.test(token) ? Number(token) : NUMBER_WORDS[token];
  if (n === undefined || !Number.isFinite(n)) return null;
  const unit = m[2].toLowerCase();
  if (unit.startsWith('h')) return n * 3600;
  if (unit.startsWith('m')) return n * 60;
  return n;
}

// §7.4 -- the ONLY place authorized scope disambiguates otherwise identical prose. At or below the
// authorized aggregate a length statement is a bounded-scope description and passes; above it, the
// statement necessarily claims knowledge the request never supplied. When the comparison cannot
// deterministically establish that the claim EXCEEDS the aggregate, prefer passing.
function claimExceedsAggregate(hedge, value, aggregateSeconds) {
  const seconds = parseDurationSeconds(value);
  if (seconds === null || !Number.isFinite(aggregateSeconds)) return false;
  const h = String(hedge || '').trim().toLowerCase();
  if (new RegExp(String.raw`^${DUR_HEDGE_UPPER}$`, 'i').test(h)) return false; // an upper bound proves nothing
  if (new RegExp(String.raw`^${DUR_HEDGE_LOWER}$`, 'i').test(h)) return seconds >= aggregateSeconds;
  return seconds > aggregateSeconds;
}

// §7.1 -- the deterministic unit splitter, pure and exported. Fixed delimiters only: a line
// boundary, or `.`/`?`/`!` followed by whitespace or end of input. No NLP, no probabilistic
// segmentation. "1.5 hours" and "1:02:03" do not split because the character after the `.` is not
// whitespace.
function splitSentenceUnits(text) {
  const units = [];
  for (const line of splitReportLines(text)) {
    let buffer = '';
    for (let i = 0; i < line.length; i++) {
      buffer += line[i];
      if ((line[i] === '.' || line[i] === '?' || line[i] === '!')
        && (i + 1 === line.length || /\s/.test(line[i + 1]))) {
        if (buffer.trim()) units.push(buffer.trim());
        buffer = '';
      }
    }
    if (buffer.trim()) units.push(buffer.trim());
  }
  return units;
}

// §7.3 -- the six rejecting productions. 1-3 and 5 reject on their own; 4 and 6 additionally
// require the claimed value to exceed the authorized aggregate.
const DURATION_PRODUCTIONS = [
  { // 1. whole-source subject + duration noun + linking phrase + concrete value
    id: 1, aggregateGated: false,
    re: new RegExp(String.raw`\b${DUR_ARTICLE}${DUR_SUBJECT}(?:'s|s'|’s)?[ \t]+${DUR_NOUN}[ \t]+${DUR_LINK}[ \t]+${DUR_CLAIM}`, 'i'),
  },
  { // 2. duration noun + "of" + whole-source subject + linking phrase + concrete value
    id: 2, aggregateGated: false,
    re: new RegExp(String.raw`\b${DUR_NOUN}[ \t]+of[ \t]+${DUR_ARTICLE}${DUR_SUBJECT}[ \t]+${DUR_LINK}[ \t]+${DUR_CLAIM}`, 'i'),
  },
  { // 3. whole-source modifier + duration noun + linking phrase + concrete value
    id: 3, aggregateGated: false,
    re: new RegExp(String.raw`\b${DUR_MODIFIER}[ \t]+${DUR_NOUN}[ \t]+${DUR_LINK}[ \t]+${DUR_CLAIM}`, 'i'),
  },
  { // 4. the explicit finite `long` construction -- aggregate-gated
    id: 4, aggregateGated: true,
    re: new RegExp(String.raw`\b${DUR_ARTICLE}${DUR_SUBJECT}[ \t]+${DUR_LINK}[ \t]+${DUR_CLAIM}[ \t]+long\b`, 'i'),
  },
  { // 6. whole-source subject + running verb + concrete value -- aggregate-gated
    id: 6, aggregateGated: true,
    re: new RegExp(String.raw`\b${DUR_ARTICLE}${DUR_SUBJECT}[ \t]+${DUR_RUNNING_VERB}[ \t]+${DUR_CLAIM}`, 'i'),
  },
];

// The CLOSED allowlist of quality-gate failure codes. PowerShell refuses any code outside this
// set, so a future validator branch cannot invent an unreviewed reason that reaches a manifest.
const QUALITY_FAILURE_CODES = [
  'finish-max-tokens',
  'finish-not-stop',
  'missing-section',
  'duplicate-section',
  'scope-mismatch',
  'missing-slice',
  'missing-slice-audio',
  'missing-speech-anchor',
  'unjustified-universal-silence',
  // V4Q FINAL (§5): FORMAT codes are separate from CONTENT codes. A response whose canonical field
  // is missing, duplicated, misplaced, prefixed, suffixed, or otherwise malformed is a formatting
  // failure and is reported as one -- even when it also contains forbidden content, because format
  // validation runs first. That distinction is what makes a rejection actionable.
  'source-duration-field-format',
  'speculative-source-duration',
  'synthetic-assessment-field-format',
  'unsupported-synthetic-claim',
  'repetitive-timestamp-filler',
  'diagnostic-write-failed',
];

function fail(code, reason) { return { ok: false, code, reason }; }

// V4Q CORRECTION 2 -- EXACT LINES, ONE PARSE. The report is split into lines once and every
// structural decision below is made on a WHOLE trimmed line. The previous implementation used
// `indexOf` on the raw text, so `prefix ## 3. PEOPLE, ENTITIES & SETTING` satisfied the section-3
// header and `NOT-AN-EXACT-LINE **Authorized scope:** ... trailing` satisfied the scope contract --
// a malformed report could inherit a canonical structure it never actually emitted.
function splitReportLines(text) {
  return String(text == null ? '' : text).split(/\r\n|\r|\n/);
}
// Index of the ONE line that IS the header (trimmed equality), or -1. Never a substring hit.
function findHeaderLine(lines, header, from = 0) {
  for (let i = from; i < lines.length; i++) {
    if (lines[i].trim() === header) return i;
  }
  return -1;
}
// The lines strictly BETWEEN two exact canonical header lines. Locating a section by its exact
// header line and the exact following canonical header line — never by a numeric substring — means
// renaming or reordering a section fails the contract test visibly instead of silently scanning the
// wrong region (or nothing).
function sectionLines(lines, startHeader, endHeader) {
  const start = findHeaderLine(lines, startHeader);
  if (start === -1) return [];
  const end = findHeaderLine(lines, endHeader, start + 1);
  return lines.slice(start + 1, end === -1 ? lines.length : end);
}
function extractSection(text, startHeader, endHeader) {
  return sectionLines(splitReportLines(text), startHeader, endHeader).join('\n');
}
function extractEvidenceSection(text) {
  return extractSection(text, EVIDENCE_SECTION_HEADER, EVIDENCE_SECTION_NEXT_HEADER);
}
function extractProfileSection(text) {
  return extractSection(text, PROFILE_SECTION_HEADER, PROFILE_SECTION_NEXT_HEADER);
}

// Whole-line predicates. `hasExactLine` is literal equality after trimming; `matchLines` anchors the
// supplied pattern to the COMPLETE trimmed line, so a marker embedded in prose ("Prose says **Slice
// 1 audio status:** SPEECH maybe") is not a marker line and does not satisfy anything.
function hasExactLine(lines, exact) {
  return lines.some((l) => l.trim() === exact);
}
function matchLines(lines, re) {
  return lines.filter((l) => re.test(l.trim()));
}
// Anchored marker-line contracts. N is the slice number; each returns a COMPLETE-line pattern.
const SLICE_AUDIO_STATUS_LINE = (n) =>
  new RegExp(String.raw`^\*\*Slice ${n} audio status:\*\*[ \t]*(${AUDIO_STATUSES.join('|')})[ \t]*$`);
const SLICE_AUDIO_EVIDENCE_LINE = (n) =>
  new RegExp(String.raw`^\*\*Slice ${n} audio evidence:\*\*[ \t]*${TIMESTAMP}[ \t]*[-–—:][ \t]*\S.*$`);
const SLICE_ANCHOR_LINE = (n) =>
  new RegExp(String.raw`^\*\*Slice ${n} transcription anchor:\*\*[ \t]*["“][^"”]+["”][ \t]*[.,;]?[ \t]*$`);
const SLICE_JUSTIFICATION_LINE = (n) =>
  new RegExp(String.raw`^\*\*Slice ${n} audio justification:\*\*[ \t]*${TIMESTAMP}[ \t]*[-–—:][ \t]*\S.*$`);
// A heading-shaped line that CLAIMS to open a slice subsection. Detected loosely (any `#`-led line
// naming a slice) so a malformed heading is COUNTED and then rejected for not being exact, rather
// than silently ignored and reported as a different, less accurate failure.
const SLICE_HEADING_SHAPE = /^#{1,6}[ \t]*Slice\b/i;
// The two accepted Section 2 synthetic-media assessment forms, as complete lines.
const SYNTHETIC_ASSESSMENT_SHAPE = /^\*\*Synthetic-media assessment:\*\*/;
// V4Q FINAL (§4.2): each separator is INDEPENDENTLY a hyphen, en dash, or em dash, and the two need
// not match -- a model that emits ` - ` before Evidence and ` — ` before Confidence is compliant.
// Surrounding whitespace is required, so a hyphen used inside a compound word is not a separator.
const ASSESSMENT_SEPARATOR = String.raw`[ \t](?:-|–|—)[ \t]`;
const STANDARDIZED_SYNTHETIC_LINE = new RegExp(
  String.raw`^\*\*Synthetic-media assessment:\*\*[ \t]*\S.*?${ASSESSMENT_SEPARATOR}Evidence:[ \t]*\S.*?${TIMESTAMP}.*?${ASSESSMENT_SEPARATOR}Confidence:[ \t]*(?:LOW|MEDIUM|HIGH)[ \t]*\.?[ \t]*$`);

// --- V4Q FINAL (§4, §5.1): the two canonical field-FORMAT validators -----------------------------
// Each answers exactly one question: is the field there, once, in the Video Profile section, in an
// accepted complete-line shape? Content is not examined here. The reasons distinguish missing from
// misplaced from malformed so a rejection tells the operator what to fix, while naming no provider
// text.
function validateSourceDurationField(section2, allLines) {
  const exact = section2.filter((l) => l.trim() === UNDETERMINABLE_DURATION_LINE);
  if (exact.length === 1) return { ok: true };
  if (exact.length > 1) {
    return fail('source-duration-field-format', `the canonical source-duration field appears ${exact.length} times in ${PROFILE_SECTION_HEADER}; exactly one is required.`);
  }
  if (allLines.some((l) => l.trim() === UNDETERMINABLE_DURATION_LINE)) {
    return fail('source-duration-field-format', `the canonical source-duration field is present but outside "${PROFILE_SECTION_HEADER}", where it is required.`);
  }
  if (section2.some((l) => l.trim().startsWith('**Source duration:**'))) {
    return fail('source-duration-field-format', `the source-duration field is malformed; the only accepted line is exactly "${UNDETERMINABLE_DURATION_LINE}".`);
  }
  return fail('source-duration-field-format', `"${PROFILE_SECTION_HEADER}" carries no "${UNDETERMINABLE_DURATION_LINE}" line.`);
}

// Returns the accepted FORM on success, so the caller can report which one was used without
// re-parsing. Both accepted forms are equally valid; neither exempts the rest of the report from
// the frozen-vocabulary scan.
function validateSyntheticAssessmentField(section2, allLines) {
  const shaped = matchLines(section2, SYNTHETIC_ASSESSMENT_SHAPE);
  if (shaped.length > 1) {
    return fail('synthetic-assessment-field-format', `the synthetic-media assessment field appears ${shaped.length} times in ${PROFILE_SECTION_HEADER}; exactly one is required.`);
  }
  if (shaped.length === 0) {
    if (matchLines(allLines, SYNTHETIC_ASSESSMENT_SHAPE).length > 0) {
      return fail('synthetic-assessment-field-format', `the synthetic-media assessment field is present but outside "${PROFILE_SECTION_HEADER}", where it is required.`);
    }
    return fail('synthetic-assessment-field-format', `"${PROFILE_SECTION_HEADER}" carries no complete "**Synthetic-media assessment:**" line.`);
  }
  const line = shaped[0].trim();
  if (line === NO_SYNTHETIC_EVIDENCE_LINE) return { ok: true, form: 'no-evidence' };
  if (STANDARDIZED_SYNTHETIC_LINE.test(line)) return { ok: true, form: 'evidence-backed' };
  return fail('synthetic-assessment-field-format', 'the synthetic-media assessment is neither the exact NO OBSERVABLE EVIDENCE line nor an evidence-backed finding carrying a timestamped observation and a LOW/MEDIUM/HIGH confidence.');
}

// Normalize one evidence itemization line down to its observation body so that N near-identical
// per-second entries collapse to one key. Structural marker lines are excluded by the caller —
// eight slices legitimately share the same `**Slice N audio status:** SILENCE` shape.
function normalizeEvidenceLine(line) {
  return line
    .replace(/^\s*[-*+]\s*/, '')
    .replace(new RegExp(`^\\s*${TIMESTAMP}(?:\\s*[-–—]\\s*${TIMESTAMP})?\\s*`), '')
    .replace(/\[[A-Z/ ]+\]/g, ' ')
    .replace(/\bslice\s*\d+\b/gi, ' ')
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function validateReportQuality({ text, finishReason, ranges, audioTokens }) {
  const body = String(text == null ? '' : text);
  const sliceRanges = Array.isArray(ranges) ? ranges : [];
  const sliced = sliceRanges.length > 0;
  // ONE parse. Every structural decision below reads this array, never the raw string.
  const lines = splitReportLines(body);

  // Truncation first: it explains every downstream structural absence, so reporting a missing
  // section for a response the provider cut off would be misleading.
  if (finishReason === 'MAX_TOKENS') {
    return fail('finish-max-tokens', 'the provider stopped at the output-token limit, so the analysis is truncated.');
  }
  if (finishReason !== 'STOP') {
    // Bounded enum only — never the raw provider string, which must not reach a failure reason.
    const known = ['SAFETY', 'RECITATION', 'PROHIBITED_CONTENT', 'SPII', 'MALFORMED_FUNCTION_CALL', 'LANGUAGE', 'BLOCKLIST', 'OTHER'];
    const word = known.indexOf(String(finishReason)) === -1 ? 'an unrecognized reason' : String(finishReason);
    return fail('finish-not-stop', `the provider finished with ${word} rather than STOP.`);
  }
  if (!body.trim()) {
    return fail('missing-section', 'the response contained no text.');
  }
  const firstContentLine = lines.find((l) => l.trim() !== '');
  if (firstContentLine === undefined || firstContentLine.trim() !== REQUIRED_SECTIONS[0]) {
    return fail('missing-section', `the report must begin with the exact line "${REQUIRED_SECTIONS[0]}".`);
  }

  // Each canonical header must be a COMPLETE trimmed line, present exactly once, in order. Matching
  // whole lines is what rejects `prefix ## 3. PEOPLE, ENTITIES & SETTING`: it is not the header, so
  // the header is absent. Only `#`-led lines are considered, so ordinary prose quoting a header
  // name in the middle of a sentence can neither satisfy nor duplicate a section.
  const headerLines = new Map();
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed.charCodeAt(0) !== 35 /* # */) continue;
    if (REQUIRED_SECTIONS.indexOf(trimmed) === -1) continue;
    if (!headerLines.has(trimmed)) headerLines.set(trimmed, []);
    headerLines.get(trimmed).push(i);
  }
  let cursor = -1;
  for (const header of REQUIRED_SECTIONS) {
    const at = headerLines.get(header);
    if (!at) return fail('missing-section', `required section "${header}" is absent as an exact line.`);
    if (at.length > 1) return fail('duplicate-section', `section "${header}" appears more than once.`);
    if (at[0] < cursor) return fail('missing-section', `section "${header}" is out of the required order.`);
    cursor = at[0];
  }

  if (!sliced) return { ok: true };

  // V4Q CORRECTION -- SECTION SCOPING. Every bounded-scope marker below is required INSIDE its
  // canonical section, located by exact adjacent headers. Searching the whole report (the original
  // implementation) accepted a report that put every slice/audio marker in Section 4 and left
  // Section 5 empty -- structurally the same failure V4Q exists to catch, passing the gate.
  // Boundaries are derived from the EXACT header-line indexes established above, so the two scanned
  // regions are the real Section 2 and Section 5, not whatever a substring search happened to find.
  const section2 = sectionLines(lines, PROFILE_SECTION_HEADER, PROFILE_SECTION_NEXT_HEADER);
  const evidence = sectionLines(lines, EVIDENCE_SECTION_HEADER, EVIDENCE_SECTION_NEXT_HEADER);

  const aggregateSeconds = sliceRanges.reduce((sum, r) => sum + (r.endOffset - r.startOffset), 0);
  const scopeLine = AUTHORIZED_SCOPE_LINE(sliceRanges.length, aggregateSeconds);
  if (!hasExactLine(section2, scopeLine)) {
    return fail('scope-mismatch', `Section 2 does not carry the authorized scope line, exactly and complete, as "${scopeLine}".`);
  }

  // ---- Section 5: exact ordered slice SUBSECTIONS -----------------------------------------------
  // Headings are read from Section 5 ONLY, as complete lines, then each slice's markers are required
  // inside that slice's own subsection. This is what makes "one distinct subsection per authorized
  // slice" real: a marker belonging to slice 2 cannot be satisfied by text sitting under slice 1.
  const expectedHeadings = sliceRanges.map((r, i) => SLICE_HEADING(i + 1, r));
  const seen = [];
  for (let i = 0; i < evidence.length; i++) {
    if (SLICE_HEADING_SHAPE.test(evidence[i].trim())) seen.push({ text: evidence[i].trim(), at: i });
  }
  if (seen.length !== expectedHeadings.length) {
    return fail('missing-slice', `Section 5 must contain exactly ${expectedHeadings.length} slice subsection heading line(s); found ${seen.length}.`);
  }
  for (let i = 0; i < expectedHeadings.length; i++) {
    if (seen[i].text !== expectedHeadings[i]) {
      return fail('scope-mismatch', `Section 5 slice subsection ${i + 1} must open with the exact complete line "${expectedHeadings[i]}".`);
    }
  }
  // Lines strictly between this heading and the next (or the end of Section 5).
  const subsectionOf = (i) => evidence.slice(seen[i].at + 1, i + 1 < seen.length ? seen[i + 1].at : evidence.length);

  const statuses = [];
  const subsections = [];
  for (let i = 0; i < sliceRanges.length; i++) {
    const n = i + 1;
    const sub = subsectionOf(i);
    subsections.push(sub);
    const found = matchLines(sub, SLICE_AUDIO_STATUS_LINE(n));
    if (found.length === 0) {
      return fail('missing-slice-audio', `slice ${n}'s Section 5 subsection has no complete "**Slice ${n} audio status:**" line ending in one of ${AUDIO_STATUSES.join('/')}.`);
    }
    if (found.length > 1) {
      return fail('missing-slice-audio', `slice ${n}'s subsection has ${found.length} conflicting audio-status lines; exactly one is required.`);
    }
    const status = SLICE_AUDIO_STATUS_LINE(n).exec(found[0].trim())[1];
    statuses.push(status);

    if (matchLines(sub, SLICE_AUDIO_EVIDENCE_LINE(n)).length === 0) {
      return fail('missing-slice-audio', `slice ${n}'s subsection has no complete timestamped "**Slice ${n} audio evidence:**" line.`);
    }
    if (status === 'SPEECH' && matchLines(sub, SLICE_ANCHOR_LINE(n)).length === 0) {
      return fail('missing-speech-anchor', `slice ${n} reports SPEECH but its subsection carries no complete quoted "**Slice ${n} transcription anchor:**" line.`);
    }
  }

  // Heuristic, not semantic proof (see the handoff): if the provider billed audio tokens and every
  // slice came back SILENCE/UNCLEAR, each slice must say what it listened for -- in its OWN
  // subsection. Rewording can evade this; it exists to stop the observed blanket-silence failure.
  if (audioTokens > 0 && statuses.every((s) => s === 'SILENCE' || s === 'UNCLEAR')) {
    for (let i = 0; i < sliceRanges.length; i++) {
      const n = i + 1;
      if (matchLines(subsections[i], SLICE_JUSTIFICATION_LINE(n)).length === 0) {
        return fail('unjustified-universal-silence', `every slice reports SILENCE/UNCLEAR while ${audioTokens} audio tokens were billed, but slice ${n}'s subsection carries no complete timestamped "**Slice ${n} audio justification:**" line.`);
      }
    }
  }
  // The provider processed an audio stream, so denying that one exists is false on its face. This
  // one IS whole-report scoped on purpose: a false "there is no audio" is a lie wherever it appears.
  if (audioTokens > 0) {
    // Structural reason only: the matched phrase is provider text and must never be echoed.
    for (const re of NO_AUDIO_STREAM_CLAIMS) {
      if (re.test(body)) {
        return fail('unjustified-universal-silence', `${audioTokens} audio tokens were billed, but the report asserts that no audio stream was present.`);
      }
    }
  }

  // ---- V4Q FINAL (§5.2): FORMAT BEFORE CONTENT, SOURCE BEFORE SYNTHETIC -------------------------
  // Both canonical fields are format-checked before either content contract runs. A response whose
  // field is malformed gets the format code even when it also carries forbidden content, and when
  // BOTH fields are malformed the source-duration code is the one returned.
  const durationField = validateSourceDurationField(section2, lines);
  if (!durationField.ok) return durationField;
  const assessmentField = validateSyntheticAssessmentField(section2, lines);
  if (!assessmentField.ok) return assessmentField;
  // ---- CONTENT: source duration (§7) ------------------------------------------------------------
  // The three sanctioned length-bearing lines are removed first so the contract can never reject
  // the very text it mandates. What remains is scanned two ways: the line-anchored field assertion
  // (production 5), then the five sentence-local productions, each inside ONE deterministic unit.
  const sanctionedLengthLines = new Set([UNDETERMINABLE_DURATION_LINE, scopeLine, ...expectedHeadings]);
  const withoutSanctionedDuration = lines.filter((l) => !sanctionedLengthLines.has(l.trim()));
  if (DURATION_FIELD_CLAIM.test(withoutSanctionedDuration.join('\n'))) {
    return fail('speculative-source-duration', 'the report carries a source/total/video duration FIELD alongside the required undeterminable line; the two contradict each other and only the authorized aggregate is knowable.');
  }
  for (const unit of splitSentenceUnits(withoutSanctionedDuration.join('\n'))) {
    for (const production of DURATION_PRODUCTIONS) {
      const m = production.re.exec(unit);
      if (!m) continue;
      // Productions 4 and 6 are the ONLY place authorized scope disambiguates otherwise identical
      // prose: at or below the aggregate the sentence describes what was actually supplied.
      if (production.aggregateGated && !claimExceedsAggregate(m[1], m[2], aggregateSeconds)) continue;
      // Structural reason only: the asserted length is provider text and is never echoed.
      return fail('speculative-source-duration', `the report states a whole-source length (form ${production.id}) alongside the required undeterminable line; only the ${aggregateSeconds}s authorized aggregate is knowable.`);
    }
  }

  // ---- CONTENT: synthetic origin (§6) -----------------------------------------------------------
  // The ONE accepted canonical assessment line is removed, then the frozen vocabulary is matched
  // over everything that remains. There is no negation interpretation: a forbidden phrase rejects
  // wherever it appears, including inside a denial, because the canonical field is the only place
  // origin may be discussed at all. Both accepted field forms are treated identically here -- an
  // evidence-backed finding licenses the field, never a restatement elsewhere.
  const outsideAssessment = lines
    .filter((line) => !SYNTHETIC_ASSESSMENT_SHAPE.test(line.trim()))
    .join('\n');
  for (const re of FORBIDDEN_ORIGIN_PATTERNS) {
    if (re.test(outsideAssessment)) {
      // Structural reason only: the matched phrase is provider text and must never be echoed.
      return fail('unsupported-synthetic-claim', `synthetic-origin terminology appears outside the one canonical "**Synthetic-media assessment:**" field (which reported ${assessmentField.form}); origin may be discussed only in that field.`);
    }
  }

  const counts = new Map();
  for (const rawLine of evidence) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#') || line.startsWith('**')) continue;
    const key = normalizeEvidenceLine(line);
    if (!key) continue;
    const next = (counts.get(key) || 0) + 1;
    if (next > 3) {
      // Count only — the repeated observation itself is provider text.
      return fail('repetitive-timestamp-filler', `the evidence section repeats one normalized observation ${next} times (limit 3); consolidate an unchanged condition into a range.`);
    }
    counts.set(key, next);
  }

  return { ok: true };
}

// --- V4Q durable rejected-response diagnostics --------------------------------------------------
// A rejected response is preserved as evidence, never as output: it is never printed, never becomes
// reportFile, never enters the Library, and never authorizes media deletion.
function resolveDiagnosticDir(args, deps = {}) {
  const statSync = deps.statSync || fs.statSync;
  if (!args.diagnosticDirSeen) {
    return { error: '--diagnostic-dir is required before any submission so a rejected response can be preserved.' };
  }
  const dir = args.diagnosticDir;
  if (typeof dir !== 'string' || dir.trim() === '') {
    return { error: '--diagnostic-dir was given with no value.' };
  }
  if (!path.isAbsolute(dir)) {
    return { error: '--diagnostic-dir must be an absolute path to an existing run directory.' };
  }
  let st;
  try { st = statSync(dir); }
  catch { return { error: '--diagnostic-dir does not exist; the run directory must be created before submission.' }; }
  if (!st.isDirectory()) return { error: '--diagnostic-dir is not a directory.' };
  return { dir };
}

// Same-directory temporary file + atomic rename, never overwriting an existing diagnostic. Bounds
// are enforced BEFORE any bytes are written, so an oversized response cannot half-land.
function writeRejectedResponseDiagnostic({ diagnosticDir, text }, deps = {}) {
  const writeFileSync = deps.writeFileSync || fs.writeFileSync;
  const renameSync = deps.renameSync || fs.renameSync;
  const existsSync = deps.existsSync || fs.existsSync;
  const unlinkSync = deps.unlinkSync || fs.unlinkSync;

  const body = String(text == null ? '' : text);
  if (body.length > MAX_DIAGNOSTIC_CHARS) {
    return { ok: false, error: `rejected response is ${body.length} characters, over the ${MAX_DIAGNOSTIC_CHARS}-character diagnostic bound.` };
  }
  const buf = Buffer.from(body, 'utf8');
  if (buf.length > MAX_DIAGNOSTIC_BYTES) {
    return { ok: false, error: `rejected response is ${buf.length} bytes, over the ${MAX_DIAGNOSTIC_BYTES}-byte diagnostic bound.` };
  }
  const finalPath = path.join(diagnosticDir, DIAGNOSTIC_FILENAME);
  if (existsSync(finalPath)) {
    return { ok: false, error: 'a diagnostic already exists for this run; refusing to overwrite preserved evidence.' };
  }
  const tmpPath = path.join(diagnosticDir, `.${DIAGNOSTIC_FILENAME}.${process.pid}.tmp`);
  try {
    writeFileSync(tmpPath, buf, { flag: 'wx' });   // UTF-8 bytes, no BOM
    renameSync(tmpPath, finalPath);
  } catch (err) {
    try { if (existsSync(tmpPath)) unlinkSync(tmpPath); } catch { /* best effort; the real failure is reported below */ }
    return { ok: false, error: sanitizeUpstreamText(err && err.message ? err.message : String(err)) };
  }
  return {
    ok: true,
    fileName: DIAGNOSTIC_FILENAME,
    bytes: buf.length,
    sha256: crypto.createHash('sha256').update(buf).digest('hex'),
  };
}

// V4: the optional sliceCount (>=2) appends ` slices=N` for a multi-slice run; every existing
// call shape (whole video / single slice) is byte-identical without it.
function formatUsageLine(usage, model, mediaResolution, sliced, sliceCount) {
  const byModality = {};
  for (const d of usage.promptTokensDetails || []) byModality[d.modality] = d.tokenCount;
  const sliceTag = sliced ? ' sliced=yes' : (sliceCount >= MIN_MULTI_SLICES ? ` slices=${sliceCount}` : '');
  return `[video-scout usage] prompt=${usage.promptTokenCount ?? '?'} ` +
    `(video=${byModality.VIDEO ?? 0} audio=${byModality.AUDIO ?? 0} text=${byModality.TEXT ?? 0}) ` +
    `output=${usage.candidatesTokenCount ?? '?'} total=${usage.totalTokenCount ?? '?'} ` +
    `model=${model} mediaRes=${mediaResolution}${sliceTag}`;
}

// Upstream error text is attacker-adjacent (it renders provider/network strings into our logs):
// collapse control chars/newlines so it cannot forge extra log lines, and cap it to one bounded
// line. Never carries the API key (the key only ever enters the request header).
function sanitizeUpstreamText(text) {
  const s = String(text == null ? '' : text).replace(/[\x00-\x1f\x7f]+/g, ' ').replace(/\s+/g, ' ').trim();
  return s.length > 300 ? s.slice(0, 300) + '...(truncated)' : s;
}

// K5 classification, exported for tests. PRECEDENCE ORDER (approved correction #1):
//   1. success (res.ok) is handled by the caller and never reaches here;
//   2. explicit terminal statuses (400/401/403/404/429) — terminal even if the body says UNAVAILABLE;
//   3. HTTP 503 — retryable (a malformed/unparseable body must NOT disable this);
//   4. any other non-success status whose PARSED body carries error.status === 'UNAVAILABLE' — retryable;
//   5. everything else — terminal.
function classifyHttpFailure(status, json) {
  if (NON_RETRYABLE_STATUSES.indexOf(status) !== -1) return { retryable: false };
  if (status === 503) return { retryable: true };
  const parsed = json && json.error && json.error.status;
  if (parsed === 'UNAVAILABLE') return { retryable: true };
  return { retryable: false };
}

// Bounded jittered backoff, exported for tests: 1.0-1.5s after attempt 1, 2.0-2.5s after
// attempt 2. No other delays exist (three attempts = at most two sleeps), no unbounded timers.
function retryDelayMs(attempt, random) {
  return RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1) + random() * RETRY_JITTER_MS;
}

// V3b: THE one shared submitted-attempt transport. This is K5's bounded retry loop, extracted
// verbatim-in-behavior from runVideoScout so the text-follow-up child (scripts/gemini-followup.js)
// and the video path submit through the SAME loop — there must never be a second implementation of
// the attempt cap, classification, backoff, ambiguous-network refusal, or terminal handling.
// Policy is unchanged: at most RETRY_MAX_ATTEMPTS submitted attempts for retryable 503/UNAVAILABLE,
// two bounded jittered sleeps, a thrown fetch is ambiguous (the server may have processed and might
// bill it) and is NEVER retried, terminal statuses stop immediately, and bodyJson is serialized by
// the CALLER exactly once so every retry submits the byte-identical payload.
//
// Returns a discriminated outcome; PRESENTATION (log lines, exit codes, stdout shape) stays with
// the caller so the video path's observable output is unchanged:
//   { kind: 'success',       json, attempt, secs }
//   { kind: 'network-error', message, attempt }                       (ambiguous — never retried)
//   { kind: 'http-failure',  status, json, attempt, secs, exhaustedRetries }
// deps.onRetryScheduled({ status, json, attempt, delayMs }) fires before each bounded sleep so a
// caller can log its own retry line; it must not (and cannot) alter the loop.
async function submitGeminiRequest({ endpoint, key, bodyJson }, deps = {}) {
  const {
    fetchImpl = fetch,
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    random = Math.random,
    onRetryScheduled = () => {},
  } = deps;
  const t0 = Date.now();
  // Structural attempt cap: a plain counted loop, no recursion, no open-ended timers. Cost
  // truth: at most three submitted attempts; failed attempts return no usable analysis or
  // usage metadata, and whether the provider bills them is unknown.
  for (let attempt = 1; attempt <= RETRY_MAX_ATTEMPTS; attempt++) {
    let res;
    try {
      res = await fetchImpl(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: bodyJson,
      });
    } catch (err) {
      // Ambiguous by definition: we cannot know whether the server processed (and might bill)
      // the request, so it is NEVER retried.
      return { kind: 'network-error', message: err && err.message ? err.message : String(err), attempt };
    }

    // A malformed body must not hide the transport status: parse failures leave json null and
    // classification proceeds on res.status alone (503 stays retryable, 400 stays terminal).
    let json = null;
    try { json = await res.json(); } catch { json = null; }
    const secs = ((Date.now() - t0) / 1000).toFixed(1);

    if (res.ok) return { kind: 'success', json, attempt, secs };

    const { retryable } = classifyHttpFailure(res.status, json);
    if (retryable && attempt < RETRY_MAX_ATTEMPTS) {
      const delayMs = retryDelayMs(attempt, random);
      onRetryScheduled({ status: res.status, json, attempt, delayMs });
      await sleep(delayMs);
      continue;
    }
    // Terminal: either a non-retryable status/body, or the third 503 in a row.
    return { kind: 'http-failure', status: res.status, json, attempt, secs, exhaustedRetries: retryable };
  }
  // Unreachable (every loop path returns or continues), kept as a fail-closed backstop.
  return { kind: 'http-failure', status: 0, json: null, attempt: RETRY_MAX_ATTEMPTS, secs: '0.0', exhaustedRetries: true };
}

// The whole operation, dependency-injected for tests (production defaults are Node's real
// implementations). Returns the process exit code — it never calls process.exit() and never
// throws for expected failures. The Gemini endpoint is built internally from the model; there
// is deliberately NO env var or CLI flag that can redirect it — tests inject fetchImpl instead.
async function runVideoScout(rawArgs, deps = {}) {
  const {
    fetchImpl = fetch,
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    random = Math.random,
    log = console.log,
    logError = console.error,
    env = process.env,
  } = deps;

  const args = parseArgs(rawArgs);
  const key = env.GEMINI_API_KEY;
  if (!key) {
    logError('[video-scout sdk] GEMINI_API_KEY is not set in the environment. Launch video-scout from the app (which injects it from safeStorage), or set it for this session.');
    return 1;
  }
  if (!args.url) { logError('[video-scout sdk] --url is required.'); return 1; }

  let prompt = args.promptText;
  if (!prompt && args.promptFile) {
    try { prompt = fs.readFileSync(args.promptFile, 'utf8').trim(); }
    catch (err) { logError(`[video-scout sdk] could not read --prompt-file: ${sanitizeUpstreamText(err.message)}`); return 1; }
  }
  if (!prompt) { logError('[video-scout sdk] no prompt: pass --prompt-file or --prompt-text.'); return 1; }

  const mediaResolution = MEDIA_RESOLUTION_MAP[args.mediaResolution] ? args.mediaResolution : 'MEDIUM';

  // V4 multi-slice control argument first (it also owns the mutual-exclusion refusal). Refuse
  // (return non-zero) on ANY problem rather than silently analyzing (and billing for) anything
  // other than exactly what was asked.
  const multiSlice = resolveSliceRanges(args);
  if (multiSlice.error) { logError(`[video-scout sdk] ${multiSlice.error}`); return 1; }

  // Refuse (return non-zero) on any offset problem — a lone flag, a flag with no value, a
  // non-integer, or end<=start — rather than silently analyzing (and billing for) the whole video.
  const slice = resolveSliceOffsets(args);
  if (slice.error) { logError(`[video-scout sdk] ${slice.error}`); return 1; }
  const sliced = slice.sliced;

  // V4Q: ONE authorized-range list drives scope composition, generation policy, model resolution,
  // and validation. A scalar slice becomes a single internal range here, which is what puts the
  // one-slice path under the same boundary/audio/anti-speculation contract as multipart.
  const authorizedRanges = multiSlice.multi
    ? multiSlice.ranges
    : (sliced ? [{ startOffset: slice.startOffset, endOffset: slice.endOffset }] : []);
  const effectiveSliceCount = authorizedRanges.length;
  const model = resolveEffectiveModel({ explicitModel: args.model, effectiveSliceCount });

  // V4Q: mandatory BEFORE any paid submission — a run that could not preserve a rejected response
  // must never spend money discovering that. The app cannot supply or override this argument;
  // feed-gemini.ps1 passes the already-created run directory.
  const diagnostic = resolveDiagnosticDir(args, { statSync: deps.statSync });
  if (diagnostic.error) { logError(`[video-scout sdk] ${diagnostic.error}`); return 1; }

  // V4Q: the deterministic authorized-scope instruction is appended to the RESOLVED prompt at this
  // one site (numbers + fixed text only), preserving the required report structure. Whole-video
  // prompts are untouched and receive no fabricated bounded-scope instruction.
  if (effectiveSliceCount >= 1) {
    prompt = `${prompt}\n\n${buildAuthorizedScopeInstruction(authorizedRanges)}`;
  }

  const body = buildRequestBody({
    url: args.url, prompt, model, mediaResolution,
    startOffset: sliced ? slice.startOffset : undefined,
    endOffset: sliced ? slice.endOffset : undefined,
    sliceRanges: multiSlice.multi ? multiSlice.ranges : undefined,
  });
  // Serialized ONCE, before the loop: every retry submits this byte-identical payload — the
  // URL, prompt, model, media resolution, and slice offsets structurally cannot drift between
  // attempts, and no guard is re-evaluated (or bypassable) mid-retry.
  const bodyJson = JSON.stringify(body);

  log(`[video-scout sdk] analyzing ${args.url}`);
  log(`[video-scout sdk] model=${model} mediaResolution=${mediaResolution} (ENFORCED on this path)${multiSlice.multi ? ` slices=${multiSlice.ranges.length} aggregate=${multiSlice.aggregateSeconds}s (ONE multipart request)` : sliced ? ` slice=${slice.startOffset}s-${slice.endOffset}s` : ' (whole video)'}`);
  log(`[video-scout sdk] bounded 503 retry policy active (max ${RETRY_MAX_ATTEMPTS} attempts)`);

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

  // V3b: the attempt loop itself now lives in submitGeminiRequest (the ONE shared transport —
  // see its comment). Policy, attempt cap, backoff, classification, and the ambiguous-network
  // refusal are unchanged; this caller keeps every log line and exit code exactly as before.
  const outcome = await submitGeminiRequest({ endpoint, key, bodyJson }, {
    fetchImpl, sleep, random,
    onRetryScheduled: ({ status, json, attempt, delayMs }) => {
      // Bounded metadata only: status, parsed status word (a known enum when present), attempt
      // counter, delay. Never the body, prompt, or key.
      const statusWord = json && json.error && json.error.status ? ` ${sanitizeUpstreamText(json.error.status).slice(0, 40)}` : '';
      logError(`[video-scout sdk] HTTP ${status}${statusWord} — attempt ${attempt}/${RETRY_MAX_ATTEMPTS}; retrying in ${(delayMs / 1000).toFixed(1)}s`);
    },
  });

  if (outcome.kind === 'network-error') {
    // Ambiguous by definition (see the transport) — visible failure, natural shutdown.
    logError(`[video-scout sdk] network error (ambiguous — not retried): ${sanitizeUpstreamText(outcome.message)}`);
    return 1;
  }

  if (outcome.kind === 'success') {
    const json = outcome.json;
    const finish = json && json.candidates && json.candidates[0] && json.candidates[0].finishReason;
    const text = ((json && json.candidates && json.candidates[0] && json.candidates[0].content && json.candidates[0].content.parts) || [])
      .map((p) => p.text || '').join('');
    // V4Q CORRECTION: there is NO early exit for an empty response. An empty success is still a
    // billed provider response, so it takes the SAME path as any other: usage is extracted, the
    // quality gate classifies it, the exact response (including the empty string, which preserves
    // as a valid zero-byte artifact) is written as evidence, and the canonical quality line is
    // emitted. The old early return skipped usage extraction entirely -- losing the cost record for
    // a run that had already been paid for -- and dumped the raw candidate object into the log,
    // which is provider content. Both are gone.
    if (outcome.attempt > 1) log(`[video-scout sdk] recovered on attempt ${outcome.attempt}/${RETRY_MAX_ATTEMPTS}`);

    const usage = (json && json.usageMetadata) || {};
    const usageLine = formatUsageLine(usage, model, mediaResolution, sliced,
      multiSlice.multi ? multiSlice.ranges.length : undefined);
    const audioTokens = ((usage.promptTokensDetails || [])
      .filter((d) => d && d.modality === 'AUDIO')
      .reduce((sum, d) => sum + (d.tokenCount || 0), 0));

    // V4Q: the deterministic quality gate runs BEFORE the analysis is emitted. A rejected response
    // is terminal — it is preserved as evidence and never printed, never becomes a report, and
    // NEVER causes another provider request (no repair, fallback, or continuation exists).
    const verdict = validateReportQuality({ text, finishReason: finish, ranges: authorizedRanges, audioTokens });
    if (!verdict.ok) {
      logError(`[video-scout sdk] quality gate REJECTED this response (${verdict.code}): ${verdict.reason}`);
      const written = writeRejectedResponseDiagnostic(
        { diagnosticDir: diagnostic.dir, text },
        { writeFileSync: deps.writeFileSync, renameSync: deps.renameSync, existsSync: deps.existsSync, unlinkSync: deps.unlinkSync }
      );
      // Usage is preserved either way so the manifest records what the failed run actually cost.
      log(usageLine);
      if (!written.ok) {
        logError(`[video-scout sdk] the rejected response could NOT be preserved: ${written.error}`);
        log('[video-scout quality] rejected code=diagnostic-write-failed');
        return 1;
      }
      log(`[video-scout quality] rejected code=${verdict.code} file=${written.fileName} bytes=${written.bytes} sha256=${written.sha256}`);
      return 1;
    }

    // The analysis text and the usage line print exactly ONCE, only here, only on the
    // accepted success response — a failed attempt has no path to either line.
    log(`\n${text}\n`);
    log(usageLine);
    return 0;
  }

  // http-failure: either a non-retryable status/body, or the third 503 in a row.
  const json = outcome.json;
  const apiMsg = sanitizeUpstreamText(
    json && json.error ? `${json.error.status || ''} ${json.error.message || ''}`.trim() : JSON.stringify(json).slice(0, 500)
  );
  const giveUp = outcome.exhaustedRetries ? ` — giving up after ${RETRY_MAX_ATTEMPTS} attempts` : '';
  logError(`[video-scout sdk] HTTP ${outcome.status} after ${outcome.secs}s (attempt ${outcome.attempt}/${RETRY_MAX_ATTEMPTS})${giveUp}: ${apiMsg}`);
  return 1;
}

// The ONE production entry adapter (K5 shutdown contract). require.main calls it, and the
// child-process fixture tests call THIS SAME function with an injected local fetchImpl — so the
// shutdown behavior the tests prove is the shutdown behavior production runs. It assigns
// process.exitCode (never process.exit) and lets the event loop drain; the single top-level
// catch keeps an unexpected throw visible and non-zero without a forced kill.
function runCliEntry(deps = {}) {
  const logError = deps.logError || console.error;
  return runVideoScout(process.argv.slice(2), deps).then(
    (code) => { process.exitCode = code; },
    (err) => {
      logError(`[video-scout sdk] unexpected failure: ${sanitizeUpstreamText(err && err.message ? err.message : err)}`);
      process.exitCode = 1;
    }
  );
}

module.exports = {
  buildRequestBody, formatUsageLine, parseArgs, resolveSliceOffsets,
  resolveSliceRanges, buildAuthorizedScopeInstruction,
  // V4Q generation policy (SDK-owned; scripts/ never imports the renderer copy)
  buildGenerationConfig, resolveEffectiveModel,
  PRO_MODEL, BASE_MAX_OUTPUT_TOKENS, PER_EXTRA_SLICE_OUTPUT_TOKENS, SLICED_PRO_THINKING_BUDGET,
  // V4Q quality gate + durable diagnostics
  validateReportQuality, extractSection, extractEvidenceSection, extractProfileSection, normalizeEvidenceLine,
  splitReportLines, sectionLines, findHeaderLine, hasExactLine, matchLines,
  SLICE_AUDIO_STATUS_LINE, SLICE_AUDIO_EVIDENCE_LINE, SLICE_ANCHOR_LINE, SLICE_JUSTIFICATION_LINE,
  SLICE_HEADING_SHAPE, SYNTHETIC_ASSESSMENT_SHAPE, STANDARDIZED_SYNTHETIC_LINE,
  // V4Q FINAL: frozen vocabulary, sentence-local duration productions, aggregate comparison
  FORBIDDEN_ORIGIN_PHRASES, FORBIDDEN_ORIGIN_PATTERNS,
  splitSentenceUnits, parseDurationSeconds, claimExceedsAggregate, DURATION_PRODUCTIONS,
  validateSourceDurationField, validateSyntheticAssessmentField,
  PROFILE_SECTION_INDEX, EVIDENCE_SECTION_INDEX,
  PROFILE_SECTION_HEADER, PROFILE_SECTION_NEXT_HEADER, DURATION_FIELD_CLAIM,
  resolveDiagnosticDir, writeRejectedResponseDiagnostic,
  QUALITY_FAILURE_CODES, REQUIRED_SECTIONS, AUDIO_STATUSES,
  EVIDENCE_SECTION_HEADER, EVIDENCE_SECTION_NEXT_HEADER,
  AUTHORIZED_SCOPE_LINE, SLICE_HEADING, UNDETERMINABLE_DURATION_LINE, NO_SYNTHETIC_EVIDENCE_LINE,
  MAX_DIAGNOSTIC_BYTES, MAX_DIAGNOSTIC_CHARS, DIAGNOSTIC_FILENAME,
  MEDIA_RESOLUTION_MAP, DEFAULT_MODEL,
  MIN_MULTI_SLICES, MAX_SLICES, AGGREGATE_SLICE_CAP_SECONDS, MAX_SLICE_RANGES_JSON_UNITS, MAX_OFFSET_SECONDS,
  classifyHttpFailure, retryDelayMs, sanitizeUpstreamText,
  submitGeminiRequest,
  runVideoScout, runCliEntry,
  RETRY_MAX_ATTEMPTS, RETRY_BASE_DELAY_MS, RETRY_JITTER_MS, NON_RETRYABLE_STATUSES,
};
if (require.main === module) runCliEntry();
