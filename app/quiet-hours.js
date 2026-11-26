'use strict';
// S19: main's reading of the one quiet state (S66's quiet-hours switch, saved as `uiQuietSince`).
// It must agree with the renderer's `normalizeSince` (app/renderer/shell-nav.js): quiet only when
// the stored value is an ISO time ending in Z; anything else is off. If the two disagreed, main could
// hold toasts while the renderer shows quiet hours off, with no banner to end them
// (quiet-hours.test.js checks they agree).
const ISO_Z = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?Z$/;

function isQuietSince(value) {
  return typeof value === 'string' && ISO_Z.test(value) && !Number.isNaN(Date.parse(value));
}

module.exports = { isQuietSince };
