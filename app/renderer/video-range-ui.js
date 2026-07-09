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

if (typeof module !== 'undefined') module.exports = { syncVideoRangeVisibility, resetVideoRangeError, detectStaleRange };
else window.videoRangeUi = { syncVideoRangeVisibility, resetVideoRangeError, detectStaleRange };
