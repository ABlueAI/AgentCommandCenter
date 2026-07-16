// Destination-pane lock for dictation: the transcript goes to the pane where recording
// STARTED, or nowhere — never to whichever pane happens to be focused when transcription
// finishes. Pure decision + log-line builder, dual global/CJS (same pattern as
// audio-module-health.js) so app.js uses it as a classic script and Node can unit-test it.
//
// PRIVACY BY CONSTRUCTION: this function never receives the transcript text — only its
// character count — so no code path here can leak dictated words into Logs.
(function exposeSttTargetLock(global) {
  function resolveTranscriptDelivery({ targetId, paneExists, charCount }) {
    const count = Number.isFinite(charCount) ? Math.max(0, Math.floor(charCount)) : 0;
    if (!targetId) {
      return {
        deliver: false,
        log: `[stt] no dictation target pane was locked — refusing to deliver the ${count}-char transcript.\n`,
      };
    }
    if (!paneExists) {
      return {
        deliver: false,
        log: `[stt] target pane ${targetId} closed before the transcript arrived — refusing to deliver the ${count}-char transcript to a different pane.\n`,
      };
    }
    return {
      deliver: true,
      log: `[stt] transcript delivered to pane ${targetId} (${count} chars).\n`,
    };
  }

  const api = { resolveTranscriptDelivery };
  global.ccSttTargetLock = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window === 'undefined' ? globalThis : window);
