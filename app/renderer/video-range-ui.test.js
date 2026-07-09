'use strict';
// Run: node app/renderer/video-range-ui.test.js
// Plain Node.js — no framework (matches pty-parser.test.js / video-scout-args.test.js).
// Verifies the clear-on-hide, error-reset, and stale-range belt-check invariants for the
// video-scout time-range UI, using a tiny fake DOM element (classList + value).

const { syncVideoRangeVisibility, resetVideoRangeError, detectStaleRange } = require('./video-range-ui');

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

process.stdout.write(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
