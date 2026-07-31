'use strict';
// Video-scout time-range UI invariants, factored out of app.js so they can be unit-tested in plain
// node (see video-range-ui.test.js), matching the dual browser-<script>/CommonJS pattern used by
// pty-parser.js. app.js keeps the DOM lookups; these functions hold the decision logic.
//
// The overarching rule (mirrors feed-gemini.ps1 / app/video-scout-args.js): a time range the user
// entered must never be silently dropped into, nor silently applied over, a run it doesn't belong
// to. Because the range fields only exist in video mode, the enforcement here is CLEAR-ON-HIDE:
// when the mode leaves 'video' the inputs are emptied, so there is never a hidden value to drop or
// mis-apply at launch. We never refuse over fields the user cannot see — we clear them.

// Toggle the range block's visibility for the current analysis mode, and CLEAR the input values
// whenever the mode is not 'video'. Returns whether the mode is video (for callers/tests).
function syncVideoRangeVisibility({ analysisMode, rangeOpts, startInput, endInput }) {
  const isVideo = analysisMode === 'video';
  if (rangeOpts) rangeOpts.classList.toggle('hidden', !isVideo);
  if (!isVideo) {
    // Clear-on-hide: an invisible field must never carry a value into the next launch.
    if (startInput) startInput.value = '';
    if (endInput) endInput.value = '';
  }
  return isVideo;
}

// Reset the inline range-error UI (message text + the red .invalid input borders). Called on modal
// open so a previous session's error never lingers over freshly-cleared fields.
function resetVideoRangeError({ errorEl, startInput, endInput }) {
  if (errorEl) { errorEl.textContent = ''; errorEl.classList.add('hidden'); }
  if (startInput) startInput.classList.remove('invalid');
  if (endInput) endInput.classList.remove('invalid');
}

// Belt check for launch time: with clear-on-hide correct, a non-video mode can NEVER have a
// non-empty range input. If it somehow does, some path bypassed clear-on-hide — return a message so
// the caller can log it loudly rather than proceed silently. Returns null when all is well (mode is
// video, or both inputs empty). This is intentionally unreachable in normal operation.
function detectStaleRange({ analysisMode, startValue, endValue }) {
  if (analysisMode === 'video') return null;
  const s = (startValue || '').trim();
  const e = (endValue || '').trim();
  if (s || e) {
    return `BUG: stale range input in non-video mode (mode=${analysisMode}, start="${s}", end="${e}") — the clear-on-hide invariant was bypassed. Ignoring the range; please report.`;
  }
  return null;
}

// ================================ V4 bounded multi-slice =======================================
// A submission may carry 2-8 chronological, non-overlapping slices whose AGGREGATE duration fits
// the fixed 1800s sliced-analysis cap. These row-set functions are the renderer's decision logic;
// app.js owns the DOM rows and calls them. This layer is immediate-feedback UX only — main
// (app/video-scout-args.js), feed-gemini.ps1, and gemini-video-sdk.js each re-enforce the whole
// contract independently. The refuse-don't-downgrade rule extends to rows: a partially filled row,
// or a blank row mixed among populated rows, REFUSES the launch — it is never silently ignored.

const MAX_SLICES = 8;                       // deliberately below Gemini's documented 10-video max
const MIN_MULTI_SLICES = 2;                 // 1 populated row = the existing single-slice path
const AGGREGATE_SLICE_CAP_SECONDS = 1800;   // fixed multi-slice cap; no override may raise it
const MAX_OFFSET_SECONDS = 86400;           // mirrors feed-gemini.ps1 [ValidateRange(0, 86400)]

// Accepts MM:SS, H:MM:SS, or bare whole seconds (moved verbatim from app.js so the row logic and
// the single source of parsing truth live beside each other). Returns:
//   null  — input was empty (field simply not provided)
//   NaN   — input had content but didn't match any accepted format
//   number — parsed whole seconds
function parseTimeToSeconds(raw) {
  const s = (raw || '').trim();
  if (!s) return null;
  if (/^\d+$/.test(s)) return parseInt(s, 10);
  let m = /^(\d+):([0-5]?\d)$/.exec(s);
  if (m) return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
  m = /^(\d+):([0-5]\d):([0-5]\d)$/.exec(s);
  if (m) return parseInt(m[1], 10) * 3600 + parseInt(m[2], 10) * 60 + parseInt(m[3], 10);
  return NaN;
}

// One row's population state, from its RAW input values. 'partial' (one side filled) is always a
// refusal at classification time; 'blank' is fine only while NO row is populated.
function sliceRowState(startValue, endValue) {
  const s = (startValue || '').trim();
  const e = (endValue || '').trim();
  if (s && e) return 'populated';
  if (!s && !e) return 'blank';
  return 'partial';
}

// Classify the whole visible row set (rows: [{ startValue, endValue }] in VISIBLE order — order is
// meaning here and is never sorted, merged, deduplicated, or reindexed). Returns exactly one of:
//   { kind: 'whole' }                                     — every row blank: existing whole-video
//   { kind: 'single', startOffset, endOffset }            — 1 populated row: existing scalar path
//   { kind: 'multi', ranges: [{startOffset,endOffset}], aggregateSeconds }
//   { kind: 'error', message, badRows: [rowIndex...] }    — REFUSE: block submission, mark rows
// Slice numbers in messages are 1-based to match the visible "Slice N" labels.
function classifySliceRows({ rows }) {
  const list = Array.isArray(rows) ? rows : [];
  const states = list.map((r) => sliceRowState(r && r.startValue, r && r.endValue));

  const partial = states.map((s, i) => (s === 'partial' ? i : -1)).filter((i) => i !== -1);
  if (partial.length) {
    return {
      kind: 'error', badRows: partial,
      message: `Slice ${partial.map((i) => i + 1).join(', ')}: both a start and an end are required (only one was given). Fill in both, or clear both.`,
    };
  }

  const populated = states.map((s, i) => (s === 'populated' ? i : -1)).filter((i) => i !== -1);
  if (populated.length === 0) return { kind: 'whole' };

  // A blank row mixed among populated rows is a refusal, not a silently skipped row: dropping it
  // would renumber the user's slices behind their back.
  const blanks = states.map((s, i) => (s === 'blank' ? i : -1)).filter((i) => i !== -1);
  if (blanks.length) {
    return {
      kind: 'error', badRows: blanks,
      message: `Slice ${blanks.map((i) => i + 1).join(', ')} is blank while other slices are filled in. Fill it in, or remove the row — blank rows are never silently skipped.`,
    };
  }

  if (populated.length > MAX_SLICES) {
    return { kind: 'error', badRows: populated.slice(MAX_SLICES), message: `At most ${MAX_SLICES} slices are allowed (got ${populated.length}).` };
  }

  // Per-row parse/bounds/order — collect ALL offending rows so every bad row gets marked at once.
  const parsed = [];
  const badParse = []; const badBounds = []; const badOrder = [];
  for (const i of populated) {
    const start = parseTimeToSeconds(list[i].startValue);
    const end = parseTimeToSeconds(list[i].endValue);
    if (Number.isNaN(start) || Number.isNaN(end)) { badParse.push(i); continue; }
    if (start < 0 || end < 0 || start > MAX_OFFSET_SECONDS || end > MAX_OFFSET_SECONDS) { badBounds.push(i); continue; }
    if (end <= start) { badOrder.push(i); continue; }
    parsed.push({ row: i, startOffset: start, endOffset: end });
  }
  if (badParse.length) {
    return { kind: 'error', badRows: badParse, message: `Slice ${badParse.map((i) => i + 1).join(', ')}: could not parse the time (use MM:SS, H:MM:SS, or whole seconds).` };
  }
  if (badBounds.length) {
    return { kind: 'error', badRows: badBounds, message: `Slice ${badBounds.map((i) => i + 1).join(', ')}: times must be between 0 and ${MAX_OFFSET_SECONDS} seconds (24h).` };
  }
  if (badOrder.length) {
    return { kind: 'error', badRows: badOrder, message: `Slice ${badOrder.map((i) => i + 1).join(', ')}: the end must be after the start.` };
  }

  // Chronological, non-overlapping, in the order entered: each slice must start at or after the
  // previous slice's end (adjacent is allowed; overlap/duplicate/out-of-order refuse — never
  // silently reordered or merged).
  for (let k = 1; k < parsed.length; k++) {
    const prev = parsed[k - 1]; const cur = parsed[k];
    if (cur.startOffset < prev.endOffset) {
      return {
        kind: 'error', badRows: [prev.row, cur.row],
        message: `Slice ${cur.row + 1} (${cur.startOffset}s–${cur.endOffset}s) must start at or after the end of Slice ${prev.row + 1} (${prev.startOffset}s–${prev.endOffset}s). Slices must be chronological and non-overlapping — reorder or adjust them; nothing is reordered automatically.`,
      };
    }
  }

  if (parsed.length === 1) {
    return { kind: 'single', startOffset: parsed[0].startOffset, endOffset: parsed[0].endOffset };
  }

  const aggregateSeconds = parsed.reduce((sum, p) => sum + (p.endOffset - p.startOffset), 0);
  if (aggregateSeconds > AGGREGATE_SLICE_CAP_SECONDS) {
    return {
      kind: 'error', badRows: parsed.map((p) => p.row),
      message: `The slices add up to ${aggregateSeconds}s, which exceeds the fixed ${AGGREGATE_SLICE_CAP_SECONDS}s multi-slice cap. Narrow or remove slices — this cap cannot be overridden.`,
    };
  }
  return {
    kind: 'multi',
    ranges: parsed.map((p) => ({ startOffset: p.startOffset, endOffset: p.endOffset })),
    aggregateSeconds,
  };
}

// Live aggregate for the pre-submission display: sums only rows that are individually valid so the
// number the user watches is exactly the sum classifySliceRows would enforce. Display-only — never
// a validation substitute.
function computeSliceAggregate({ rows }) {
  const list = Array.isArray(rows) ? rows : [];
  let aggregateSeconds = 0; let validCount = 0; let populatedCount = 0;
  for (const r of list) {
    if (sliceRowState(r && r.startValue, r && r.endValue) !== 'populated') continue;
    populatedCount++;
    const start = parseTimeToSeconds(r.startValue);
    const end = parseTimeToSeconds(r.endValue);
    if (Number.isNaN(start) || Number.isNaN(end)) continue;
    if (start < 0 || end <= start || end > MAX_OFFSET_SECONDS || start > MAX_OFFSET_SECONDS) continue;
    validCount++;
    aggregateSeconds += end - start;
  }
  return { populatedCount, validCount, aggregateSeconds, overCap: aggregateSeconds > AGGREGATE_SLICE_CAP_SECONDS };
}

// Row-set belt check (extends detectStaleRange to N rows): with clear-on-hide correct, a non-video
// mode can never have a populated/partial row. Returns null when all is well.
function detectStaleSliceRows({ analysisMode, rows }) {
  if (analysisMode === 'video') return null;
  const list = Array.isArray(rows) ? rows : [];
  const dirty = list.map((r, i) => (sliceRowState(r && r.startValue, r && r.endValue) !== 'blank' ? i : -1)).filter((i) => i !== -1);
  if (dirty.length) {
    return `BUG: stale slice input in non-video mode (mode=${analysisMode}, rows ${dirty.map((i) => i + 1).join(', ')}) — the clear-on-hide invariant was bypassed. Ignoring the slices; please report.`;
  }
  return null;
}

// Uniquely named on purpose: renderer <script> files share ONE global scope, and agent-dom.js
// already declares a top-level `const api` — a second `const api` here would be a load-time
// SyntaxError that kills the whole renderer (see the tripwire in pane-maximize.test.js).
const videoRangeUiExports = {
  syncVideoRangeVisibility, resetVideoRangeError, detectStaleRange,
  MAX_SLICES, MIN_MULTI_SLICES, AGGREGATE_SLICE_CAP_SECONDS, MAX_OFFSET_SECONDS,
  parseTimeToSeconds, sliceRowState, classifySliceRows, computeSliceAggregate, detectStaleSliceRows,
};
if (typeof module !== 'undefined') module.exports = videoRangeUiExports;
else window.videoRangeUi = videoRangeUiExports;
