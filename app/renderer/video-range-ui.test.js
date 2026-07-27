'use strict';
// Run: node app/renderer/video-range-ui.test.js
// Plain Node.js — no framework (matches pty-parser.test.js / video-scout-args.test.js).
// Verifies the clear-on-hide, error-reset, and stale-range belt-check invariants for the
// video-scout time-range UI, using a tiny fake DOM element (classList + value).

const {
  syncVideoRangeVisibility, resetVideoRangeError, detectStaleRange,
  MAX_SLICES, MIN_MULTI_SLICES, AGGREGATE_SLICE_CAP_SECONDS, MAX_OFFSET_SECONDS,
  parseTimeToSeconds, sliceRowState, classifySliceRows, computeSliceAggregate, detectStaleSliceRows,
} = require('./video-range-ui');

let passed = 0, failed = 0;
function assert(cond, label) {
  if (cond) { process.stdout.write(`  ✓ ${label}\n`); passed++; }
  else { process.stderr.write(`  ✗ FAIL: ${label}\n`); failed++; }
}

// Minimal fake element: a value plus a classList backed by a Set.
function el(value = '') {
  const classes = new Set();
  return {
    value,
    classList: {
      add: (c) => classes.add(c),
      remove: (c) => classes.delete(c),
      toggle: (c, force) => { if (force) classes.add(c); else classes.delete(c); },
      contains: (c) => classes.has(c),
    },
  };
}

// --- clear-on-hide: leaving video mode empties the inputs -----------------------------
{
  const startInput = el('2:00'), endInput = el('4:00'), rangeOpts = el();
  syncVideoRangeVisibility({ analysisMode: 'transcript', rangeOpts, startInput, endInput });
  assert(startInput.value === '' && endInput.value === '', 'video -> transcript clears both range inputs');
  assert(rangeOpts.classList.contains('hidden'), 'video -> transcript hides the range block');
}
{
  const startInput = el('90'), endInput = el('180'), rangeOpts = el();
  syncVideoRangeVisibility({ analysisMode: 'audio', rangeOpts, startInput, endInput });
  assert(startInput.value === '' && endInput.value === '', 'video -> audio clears both range inputs');
  assert(rangeOpts.classList.contains('hidden'), 'video -> audio hides the range block');
}

// --- video mode does NOT clear (a real range entered in video is preserved) -----------
{
  const startInput = el('2:00'), endInput = el('4:00'), rangeOpts = el();
  rangeOpts.classList.add('hidden');
  syncVideoRangeVisibility({ analysisMode: 'video', rangeOpts, startInput, endInput });
  assert(startInput.value === '2:00' && endInput.value === '4:00', 'video mode preserves the entered range values');
  assert(!rangeOpts.classList.contains('hidden'), 'video mode shows the range block');
}

// --- switch back to video shows empty fields (video -> transcript -> video) ------------
{
  const startInput = el('2:00'), endInput = el('4:00'), rangeOpts = el();
  syncVideoRangeVisibility({ analysisMode: 'transcript', rangeOpts, startInput, endInput }); // clears
  syncVideoRangeVisibility({ analysisMode: 'video', rangeOpts, startInput, endInput });      // re-show
  assert(startInput.value === '' && endInput.value === '', 'switching back to video shows EMPTY fields (no stale carry-over)');
  assert(!rangeOpts.classList.contains('hidden'), 'range block visible again on return to video');
}

// --- openModal error reset -------------------------------------------------------------
{
  const errorEl = el('some prior error'); errorEl.classList.remove('hidden'); // visible error
  const startInput = el(), endInput = el();
  startInput.classList.add('invalid'); endInput.classList.add('invalid');
  resetVideoRangeError({ errorEl, startInput, endInput });
  assert(errorEl.textContent === '' && errorEl.classList.contains('hidden'), 'resetVideoRangeError clears + hides the error text');
  assert(!startInput.classList.contains('invalid') && !endInput.classList.contains('invalid'),
    'resetVideoRangeError removes the .invalid red borders from both inputs');
}

// --- belt check: detectStaleRange ------------------------------------------------------
{
  assert(detectStaleRange({ analysisMode: 'video', startValue: '2:00', endValue: '4:00' }) === null,
    'no stale-range warning in video mode (values are legitimate there)');
  assert(detectStaleRange({ analysisMode: 'transcript', startValue: '', endValue: '' }) === null,
    'no warning when non-video mode has empty inputs (the normal, post-clear state)');
  const msg = detectStaleRange({ analysisMode: 'transcript', startValue: '2:00', endValue: '' });
  assert(typeof msg === 'string' && /BUG/.test(msg) && /clear-on-hide/.test(msg),
    'a non-empty input in non-video mode returns a loud BUG message (belt check)');
  assert(detectStaleRange({ analysisMode: 'audio', startValue: '', endValue: '180' }) !== null,
    'belt check also fires for a lone end value in audio mode');
}

// ================================ V4 bounded multi-slice =======================================
const row = (startValue, endValue) => ({ startValue, endValue });

// --- constants pinned (the caps are contract, not implementation detail) ----------------------
{
  assert(MAX_SLICES === 8, 'MAX_SLICES is 8 (deliberately below Gemini\'s documented 10-video max)');
  assert(MIN_MULTI_SLICES === 2, 'MIN_MULTI_SLICES is 2');
  assert(AGGREGATE_SLICE_CAP_SECONDS === 1800, 'aggregate multi-slice cap is fixed at 1800s');
  assert(MAX_OFFSET_SECONDS === 86400, 'max offset is 86400s (24h), mirroring feed-gemini.ps1');
}

// --- parseTimeToSeconds (moved from app.js) ----------------------------------------------------
{
  assert(parseTimeToSeconds('') === null && parseTimeToSeconds('   ') === null && parseTimeToSeconds(undefined) === null,
    'blank/undefined input parses to null (field not provided)');
  assert(parseTimeToSeconds('90') === 90, 'bare whole seconds');
  assert(parseTimeToSeconds('2:05') === 125, 'MM:SS');
  assert(parseTimeToSeconds('1:02:03') === 3723, 'H:MM:SS');
  assert(Number.isNaN(parseTimeToSeconds('1:99')), 'MM:SS with SS>59 is NaN');
  assert(Number.isNaN(parseTimeToSeconds('abc')) && Number.isNaN(parseTimeToSeconds('-5')) && Number.isNaN(parseTimeToSeconds('1.5')),
    'garbage / negative / fractional input is NaN, never coerced');
}

// --- sliceRowState -----------------------------------------------------------------------------
{
  assert(sliceRowState('', '') === 'blank' && sliceRowState('  ', '') === 'blank', 'both empty (or whitespace) = blank');
  assert(sliceRowState('10', '20') === 'populated', 'both filled = populated');
  assert(sliceRowState('10', '') === 'partial' && sliceRowState('', '20') === 'partial', 'one side filled = partial');
}

// --- classify: whole / single compatibility ----------------------------------------------------
{
  assert(classifySliceRows({ rows: [row('', '')] }).kind === 'whole', 'one blank row = whole video (existing behavior)');
  assert(classifySliceRows({ rows: [row('', ''), row('', ''), row('', '')] }).kind === 'whole',
    'ALL rows blank = whole video (zero populated rows, regardless of row count)');
  const single = classifySliceRows({ rows: [row('1:00', '2:00')] });
  assert(single.kind === 'single' && single.startOffset === 60 && single.endOffset === 120,
    'one populated row = the existing single-slice scalar path');
}

// --- classify: refusals ------------------------------------------------------------------------
{
  const r = classifySliceRows({ rows: [row('10', '')] });
  assert(r.kind === 'error' && /Slice 1/.test(r.message) && r.badRows.join(',') === '0', 'partial row refuses and names Slice 1');
}
{
  const r = classifySliceRows({ rows: [row('10', '20'), row('', ''), row('30', '40')] });
  assert(r.kind === 'error' && /Slice 2/.test(r.message) && /blank/i.test(r.message) && r.badRows.join(',') === '1',
    'a blank row mixed among populated rows REFUSES (never silently skipped)');
}
{
  const r = classifySliceRows({ rows: [row('10', '20'), row('30', '40'), row('', '')] });
  assert(r.kind === 'error' && /Slice 3/.test(r.message),
    'a TRAILING blank row with populated rows present also refuses (remove it or fill it)');
}
{
  const r = classifySliceRows({ rows: [row('abc', '20'), row('30', '40')] });
  assert(r.kind === 'error' && /parse/i.test(r.message) && r.badRows.join(',') === '0', 'malformed timestamp refuses');
}
{
  const r = classifySliceRows({ rows: [row('10', '86401'), row('86500', '86600')] });
  assert(r.kind === 'error' && /86400/.test(r.message) && r.badRows.length === 2, 'out-of-bounds offsets refuse (all offending rows marked)');
}
{
  const r = classifySliceRows({ rows: [row('20', '20'), row('30', '40')] });
  assert(r.kind === 'error' && /end must be after the start/i.test(r.message), 'zero-length slice refuses');
  const r2 = classifySliceRows({ rows: [row('20', '10'), row('30', '40')] });
  assert(r2.kind === 'error' && r2.badRows.join(',') === '0', 'reversed slice refuses');
}
{
  const r = classifySliceRows({ rows: [row('10', '30'), row('20', '40')] });
  assert(r.kind === 'error' && /chronological and non-overlapping/.test(r.message) && r.badRows.join(',') === '0,1',
    'overlapping slices refuse (both rows marked, nothing merged)');
  const dup = classifySliceRows({ rows: [row('10', '30'), row('10', '30')] });
  assert(dup.kind === 'error', 'duplicate slices refuse');
  const ooo = classifySliceRows({ rows: [row('100', '200'), row('10', '50')] });
  assert(ooo.kind === 'error' && /reorder/i.test(ooo.message), 'out-of-order slices refuse — never silently reordered');
}
{
  const nine = Array.from({ length: 9 }, (_, i) => row(String(i * 20), String(i * 20 + 10)));
  const r = classifySliceRows({ rows: nine });
  assert(r.kind === 'error' && /At most 8/.test(r.message), 'more than 8 populated rows refuses (belt check behind the UI cap)');
}

// --- classify: multi accept + aggregate cap ----------------------------------------------------
{
  const r = classifySliceRows({ rows: [row('0:10', '0:30'), row('1:00', '1:30')] });
  assert(r.kind === 'multi' && r.ranges.length === 2 && r.aggregateSeconds === 50,
    'two valid slices classify as multi with the exact aggregate');
  assert(r.ranges[0].startOffset === 10 && r.ranges[0].endOffset === 30
    && r.ranges[1].startOffset === 60 && r.ranges[1].endOffset === 90,
    'ranges preserve visible row order with exact numeric offsets');
  assert(Object.keys(r.ranges[0]).join(',') === 'startOffset,endOffset', 'each range carries exactly startOffset,endOffset');
}
{
  const adj = classifySliceRows({ rows: [row('10', '20'), row('20', '30')] });
  assert(adj.kind === 'multi', 'adjacent slices (current.start == previous.end) are ALLOWED');
}
{
  const eight = Array.from({ length: 8 }, (_, i) => row(String(i * 400), String(i * 400 + 225)));
  const r = classifySliceRows({ rows: eight });
  assert(r.kind === 'multi' && r.ranges.length === 8 && r.aggregateSeconds === 1800,
    'eight slices summing to exactly 1800s are ACCEPTED (cap is inclusive)');
}
{
  const eight = Array.from({ length: 8 }, (_, i) => row(String(i * 400), String(i * 400 + 225)));
  eight[7] = row('2800', '3026'); // last slice 226s -> aggregate 1801
  const r = classifySliceRows({ rows: eight });
  assert(r.kind === 'error' && /1801s/.test(r.message) && /1800s/.test(r.message) && /cannot be overridden/.test(r.message),
    '1801s aggregate REFUSES and says the cap cannot be overridden');
}

// --- computeSliceAggregate (live display) ------------------------------------------------------
{
  const a = computeSliceAggregate({ rows: [row('10', '30'), row('bad', '40'), row('50', '')] });
  assert(a.populatedCount === 2 && a.validCount === 1 && a.aggregateSeconds === 20 && a.overCap === false,
    'display aggregate sums only individually valid populated rows');
  const b = computeSliceAggregate({ rows: [row('0', '1000'), row('1000', '1900')] });
  assert(b.aggregateSeconds === 1900 && b.overCap === true, 'display flags over-cap so the user sees it BEFORE submitting');
}

// --- detectStaleSliceRows (row-set belt check) --------------------------------------------------
{
  assert(detectStaleSliceRows({ analysisMode: 'video', rows: [row('10', '20')] }) === null, 'video mode: populated rows are legitimate');
  assert(detectStaleSliceRows({ analysisMode: 'transcript', rows: [row('', ''), row('', '')] }) === null, 'non-video + all blank = clean');
  const msg = detectStaleSliceRows({ analysisMode: 'transcript', rows: [row('', ''), row('10', '')] });
  assert(typeof msg === 'string' && /BUG/.test(msg) && /rows 2/.test(msg), 'non-video + dirty row returns a loud BUG message naming the row');
}

process.stdout.write(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
