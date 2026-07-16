// Command Center — sequential media-element playback queue for TTS Fast Clear.
//
// The invariant this module carries: the selected speed is LISTENING speed, not Kokoro
// synthesis speed. tts.js always synthesizes at natural speed 1.0; each queued WAV chunk
// plays through an HTMLAudioElement with the CURRENT user speed applied as playbackRate
// and preservesPitch enabled, so 2x is time-compressed by Chromium with natural pitch —
// not articulated twice as fast by the model.
//
// Dependency-injected and dependency-free so the exact production implementation is
// unit-tested in plain Node (no DOM): tts.js supplies createAudio / createObjectUrl /
// revokeObjectUrl / getPlaybackRate / onError. Guarantees, all proven in
// tts-playback-queue.test.js:
//   - strict chunk order, one active element, never an overlap;
//   - the next ready chunk starts on 'ended' with no artificial gap;
//   - getPlaybackRate() is read when each chunk STARTS (a mid-speech speed change
//     applies from the next chunk, never retroactively mislabeling generated audio);
//   - done settles exactly once: 'completed' only after end() was called and the final
//     chunk finished; 'stopped' on stop()/replacement; 'failed' on playback failure
//     (reported once through onError — the single visible-error path);
//   - finalization is idempotent: racing ended/error/play-rejection/stop cannot revoke
//     a URL twice, resurrect playback, or produce a second terminal outcome;
//   - every object URL is revoked exactly once on completion, stop, replacement,
//     failure, or a stale enqueue after finish.

export function createPlaybackQueue({ createAudio, createObjectUrl, revokeObjectUrl, getPlaybackRate, onError }) {
  const entries = [];
  let nextIndex = 0;
  let active = null;    // { el, entry } of the one currently-playing element
  let noMore = false;   // end() was called: drain then complete
  let finished = false; // a terminal outcome has been decided
  let resolveDone;
  const done = new Promise((resolve) => { resolveDone = resolve; });

  // Per-entry revoke-exactly-once, no matter how many terminal callbacks race.
  function releaseUrl(entry) {
    if (entry.revoked) return;
    entry.revoked = true;
    try { revokeObjectUrl(entry.url); } catch { /* revocation is cleanup; never masks the outcome */ }
  }

  function reportError(reason) {
    try { onError(reason); } catch { /* a broken error sink must not change the outcome */ }
  }

  // The single terminal transition: first caller wins, everything else no-ops.
  function finalize(outcome) {
    if (finished) return;
    finished = true;
    if (active) {
      try { active.el.pause(); } catch {}
      releaseUrl(active.entry);
      active = null;
    }
    for (const e of entries) releaseUrl(e);
    resolveDone(outcome);
  }

  // Same bounds the UI offers (0.5x–2x); a malformed injected value degrades to 1x
  // rather than to silence or a hyper-speed element.
  function clampRate(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return 1;
    return Math.min(2, Math.max(0.5, n));
  }

  function playNext() {
    if (finished || active) return;
    if (nextIndex >= entries.length) {
      if (noMore) finalize('completed'); // drained after end(): successful completion
      return;                            // otherwise: idle until the next enqueue
    }
    const entry = entries[nextIndex++];
    let el;
    try {
      el = createAudio(entry.url);
      // Listening speed is read NOW, when this chunk starts — not captured at
      // generation time (approved correction: the contract is "current speed when
      // playback starts").
      el.playbackRate = clampRate(getPlaybackRate());
      el.preservesPitch = true; // Chromium default is true; set explicitly, it is the invariant
      if ('webkitPreservesPitch' in el) el.webkitPreservesPitch = true;
    } catch {
      releaseUrl(entry);
      reportError('element-setup-failed');
      finalize('failed');
      return;
    }
    const me = { el, entry };
    active = me;
    el.addEventListener('ended', () => {
      releaseUrl(entry);
      if (finished || active !== me) return; // stopped/replaced: never resurrect
      active = null;
      playNext();
    });
    el.addEventListener('error', () => {
      releaseUrl(entry);
      if (finished || active !== me) return;
      active = null;
      reportError('media-error');
      finalize('failed');
    });
    // play() can reject (autoplay/device) or throw synchronously; both are the same
    // visible failure. A rejection after stop() only releases the URL.
    let playResult;
    try { playResult = el.play(); } catch (e) { playResult = Promise.reject(e); }
    Promise.resolve(playResult).catch((e) => {
      releaseUrl(entry);
      if (finished || active !== me) return;
      active = null;
      reportError('play-rejected: ' + String((e && e.message) || e).slice(0, 120));
      finalize('failed');
    });
  }

  return {
    // Accepts encoded WAV bytes; creating the URL first and releasing it immediately on
    // a finished queue means a stale generation can never leak an object URL.
    enqueue(wavBytes) {
      const entry = { url: createObjectUrl(wavBytes), revoked: false };
      if (finished) { releaseUrl(entry); return; }
      entries.push(entry);
      playNext();
    },
    // No more chunks are coming; resolve 'completed' once everything queued has played.
    end() {
      noMore = true;
      playNext();
    },
    // Immediate silence: pause the active element, revoke everything, settle 'stopped'.
    stop() {
      finalize('stopped');
    },
    done,
    isFinished: () => finished,
  };
}
