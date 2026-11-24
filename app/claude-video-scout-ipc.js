'use strict';

const { randomUUID } = require('node:crypto');
const { analyzeVideo, ScoutError, MAX_TRANSCRIPT_CHARS } = require('./claude-video-scout');
const { normalizeAnalysisFocus, analysisFocusRejectionMessage } = require('./renderer/analysis-focus');

const TRANSCRIPTION_TIMEOUT_MS = 15 * 60 * 1000;
const PANE_ID = /^pty[1-9]\d{0,11}$/;

function requestTranscript(job, pcm, send) {
  return new Promise((resolve, reject) => {
    const signal = job.controller.signal;
    if (signal.aborted) {
      reject(new ScoutError('Claude Video Scout was cancelled.'));
      return;
    }
    const finish = (err, text) => {
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
      job.finishTranscript = null;
      if (err) reject(err);
      else resolve(text);
    };
    const abort = () => finish(new ScoutError('Claude Video Scout was cancelled.'));
    const timer = setTimeout(() => finish(new ScoutError('Local Whisper transcription timed out.')), TRANSCRIPTION_TIMEOUT_MS);
    job.finishTranscript = finish;
    signal.addEventListener('abort', abort, { once: true });
    try {
      send({ pcm: new Uint8Array(pcm) });
    } catch {
      finish(new ScoutError('Mako could not send the audio to local Whisper.'));
    }
  });
}

function createClaudeVideoScoutIpc({ trustedSenderGate, validateVideoUrl, baseEnv, killTree, log, analyze = analyzeVideo }) {
  let active = null;

  function run(event, req) {
    if (!trustedSenderGate.assess(event).ok || typeof req?.id !== 'string' || !PANE_ID.test(req.id)) {
      return { ok: false, error: 'Claude Video Scout refused this window or pane.' };
    }
    if (active) return { ok: false, error: 'A Claude Video Scout run is already in progress.' };
    const url = validateVideoUrl(req.url);
    const parsed = url ? new URL(url) : null;
    if (!parsed || parsed.username || parsed.password || parsed.port) {
      return { ok: false, error: 'Video could not be read: use a YouTube or Vimeo video link.' };
    }
    const focus = normalizeAnalysisFocus(req.focus);
    if (!focus.ok) return { ok: false, error: analysisFocusRejectionMessage(focus.reason) };

    const job = { id: req.id, token: randomUUID(), controller: new AbortController(), finishTranscript: null };
    active = job;
    const send = (data) => {
      event.sender.send('claude-video-scout-event', { id: job.id, token: job.token, ...data });
    };
    job.done = Promise.resolve().then(() => analyze({
      url: parsed.href, focus: focus.provided ? focus.value : '', baseEnv, killTree, signal: job.controller.signal,
      progress: (status) => send({ status }),
      transcribe: (pcm) => requestTranscript(job, pcm, send),
    })).then(
      (report) => ({ ok: true, report }),
      (error) => {
        const reason = error instanceof ScoutError ? error.message : 'Claude Video Scout failed to start or prepare its temporary media.';
        log(reason);
        return { ok: false, error: reason };
      },
    ).finally(() => { active = null; });
    return job.done;
  }

  function transcript(event, req) {
    if (!trustedSenderGate.assess(event).ok || !active?.finishTranscript ||
        req?.id !== active.id || req.token !== active.token) {
      return { ok: false, error: 'The Claude Video Scout transcription request is no longer active.' };
    }
    const error = req.error === 'unavailable'
      ? 'Mako’s local Whisper module is unavailable. Restart Mako and check that Dictate loads.'
      : req.error === 'busy'
        ? 'Local Whisper is busy. Finish dictation or wait for the previous transcription, then retry.'
        : 'Local Whisper could not transcribe the video audio.';
    if (req.error || typeof req.text !== 'string' || req.text.length > MAX_TRANSCRIPT_CHARS) {
      active.finishTranscript(new ScoutError(error));
      return { ok: false, error };
    }
    active.finishTranscript(null, req.text);
    return { ok: true };
  }

  function cancel(event, id) {
    if (!trustedSenderGate.assess(event).ok || !active || active.id !== id) return;
    active.controller.abort();
  }

  function shutdown() {
    if (!active) return null;
    active.controller.abort();
    return active.done;
  }

  return { run, transcript, cancel, shutdown };
}

module.exports = { createClaudeVideoScoutIpc };
