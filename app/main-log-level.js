'use strict';
// S31 item 5: which Logs-tab label a main-process line gets. PURE: no Electron.
//
// Before S31 every line main sent to the renderer went out on `main-error` and showed as
// "[main error]", including routine progress (timing lines, usage, "admission run created"), so real
// refusals were hard to spot (Blue's PC check, 2026-11-02). Routine lines now go on `main-info` and
// show as "[main]". Refusals and failures keep `main-error`: when in doubt a line is an error, so a
// failure is never shown as routine.

const CHANNEL = Object.freeze({ ERROR: 'main-error', INFO: 'main-info' });

// Words that mark a line as a refusal or failure wherever they appear.
const ERROR_WORDS = /\b(refus\w*|fail\w*|error\w*|denied|blocked|cannot|could not|not started|uncaught|without)\b/i;

/**
 * channelFor(line, kind)
 *   kind 'routine'  progress output (timing lines, usage, admission progress): INFO unless the text
 *                   itself says it is a refusal or failure, then ERROR.
 *   anything else   ERROR (refusals and failures, the default).
 */
function channelFor(line, kind) {
  if (kind !== 'routine') return CHANNEL.ERROR;
  return ERROR_WORDS.test(String(line)) ? CHANNEL.ERROR : CHANNEL.INFO;
}

module.exports = { CHANNEL, channelFor };
