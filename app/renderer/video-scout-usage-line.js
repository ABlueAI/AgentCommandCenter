'use strict';
// Which Video Scout pane lines reach the Logs tab (issue #358).
//
// The SDK route prints the analysis to the pane and then one machine-readable usage line
// (scripts/gemini-video-sdk.js formatUsageLine). The renderer copies that line to Logs so each run's
// cost is recorded outside the closable pane. The analysis around it is model output, so only a
// complete line in that exact format is copied, at most MAX_USAGE_LINES_PER_PANE times per pane. Any
// other line that carries the marker gets one fixed notice per pane that never quotes the line, so
// a dropped usage line is visible rather than silent.
//
// Dual browser-<script>/CommonJS module, so it is tested in plain Node. Wrapped in a function so its
// names stay out of the scope that the page's classic scripts share (agent-dom.js also has `api`).

(function () {
  const USAGE_MARKER = '[video-scout usage]';
  const MAX_USAGE_LINE_CHARS = 300;
  const MAX_USAGE_LINES_PER_PANE = 8;

  // prompt/output/total may be '?' when the provider omitted them; the modality counts default to 0.
  const COUNT = '(?:\\d{1,12}|\\?)';
  const USAGE_LINE_RE = new RegExp(
    '^\\[video-scout usage\\] ' +
    `prompt=${COUNT} \\(video=\\d{1,12} audio=\\d{1,12} text=\\d{1,12}\\) ` +
    `output=${COUNT} total=${COUNT} ` +
    'model=[A-Za-z0-9][A-Za-z0-9._-]{0,63} mediaRes=(?:LOW|MEDIUM|HIGH)' +
    '(?: sliced=yes| slices=\\d{1,4})?$');

  // The trimmed line when it is a complete usage line, otherwise null.
  function matchUsageLine(text) {
    if (typeof text !== 'string') return null;
    const line = text.trim();
    if (line.length > MAX_USAGE_LINE_CHARS) return null;
    return USAGE_LINE_RE.test(line) ? line : null;
  }

  // One gate per pane. consider(text) returns the text to append to Logs (with its newline), or null.
  function createUsageLogGate() {
    let logged = 0;
    let oddNoticeShown = false;
    let capNoticeShown = false;
    return {
      consider(text) {
        if (typeof text !== 'string' || !text.includes(USAGE_MARKER)) return null;
        const line = matchUsageLine(text);
        if (line === null) {
          if (oddNoticeShown) return null;
          oddNoticeShown = true;
          return `${USAGE_MARKER} a pane line with this marker is not in the usage format; not copied here (see the pane)\n`;
        }
        if (logged >= MAX_USAGE_LINES_PER_PANE) {
          if (capNoticeShown) return null;
          capNoticeShown = true;
          return `${USAGE_MARKER} more than ${MAX_USAGE_LINES_PER_PANE} usage lines from one pane; later ones are not copied here (see the pane)\n`;
        }
        logged++;
        return line + '\n';
      },
    };
  }

  const api = { USAGE_MARKER, MAX_USAGE_LINE_CHARS, MAX_USAGE_LINES_PER_PANE, matchUsageLine, createUsageLogGate };
  if (typeof module !== 'undefined') module.exports = api;
  else window.ccVideoScoutUsage = api;
})();
