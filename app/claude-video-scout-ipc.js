'use strict';

const { randomUUID } = require('node:crypto');
const {
  analyzeVideo, ScoutError, MAX_TRANSCRIPT_CHARS, CONFIRM_TIMEOUT_MS, CANCELLED, ESTIMATE_CANCELLED, errorLabel,
} = require('./claude-video-scout');
const { normalizeAnalysisFocus, analysisFocusRejectionMessage } = require('./renderer/analysis-focus');
const { normalizeClaudeVideoSettings } = require('./renderer/claude-video-settings');

const MIN_TRANSCRIPTION_TIMEOUT_MS = 15 * 60 * 1000;
const PANE_ID = /^pty[1-9]\d{0,11}$/;

// Ask the renderer for something (a local Whisper transcript, or the user's answer to the
// estimate) and wait. Only one request is pending at a time; cancelling the run rejects it.
function askRenderer(job, kind, payload, timeoutMs, timeoutMessage, send) {
  return new Promise((resolve, reject) => {
    const signal = job.controller.signal;
    if (signal.aborted) {
      reject(new ScoutError(CANCELLED));
      return;
    }
    const finish = (err, value) => {
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
      job.pending = null;
      if (err) reject(err);
      else resolve(value);
    };
    const abort = () => finish(new ScoutError(CANCELLED));
    const timer = setTimeout(() => finish(new ScoutError(timeoutMessage)), timeoutMs);
    job.pending = { kind, finish };
    signal.addEventListener('abort', abort, { once: true });
    try {
      send(payload);
    } catch {
      finish(new ScoutError(kind === 'transcript'
        ? 'Mako could not send the audio to local Whisper.'
        : 'Mako could not show the estimate in the Video Scout pane.'));
    }
  });
}

function requestTranscript(job, pcm, durationSeconds, send) {
  // Whisper in the renderer can run slower than real time on the WASM backend.
  const timeoutMs = Math.max(MIN_TRANSCRIPTION_TIMEOUT_MS, Math.ceil(durationSeconds * 3000));
  return askRenderer(job, 'transcript', { pcm: new Uint8Array(pcm) }, timeoutMs, 'Local Whisper transcription timed out.', send);
}

function requestConfirm(job, estimate, send) {
  return askRenderer(job, 'confirm', { estimate }, CONFIRM_TIMEOUT_MS,
    'No answer to the estimate within 30 minutes. Nothing was sent to Claude.', send);
}

function createClaudeVideoScoutIpc({
  trustedSenderGate, validateVideoUrl, baseEnv, killTree, verifyPolicy, log, analyze = analyzeVideo, logCause = console.error,
}) {
  let active = null;

  function run(event, req) {
    if (!trustedSenderGate.assess(event).ok || typeof req?.id !== 'string' || !PANE_ID.test(req.id)) {
      return { ok: false, error: 'Claude Video Scout refused this window or pane.' };
    }
    if (typeof req !== 'object' || Array.isArray(req)
        || Object.keys(req).some((key) => !['id', 'url', 'focus', 'settings'].includes(key))) {
      return { ok: false, error: 'Invalid launch request for Claude Video Scout.' };
    }
    if (active) return { ok: false, error: 'A Claude Video Scout run is already in progress.' };
    const url = validateVideoUrl(req.url);
    const parsed = url ? new URL(url) : null;
    if (!parsed || parsed.username || parsed.password || parsed.port) {
      return { ok: false, error: 'Video could not be read: use a YouTube or Vimeo video link.' };
    }
    const focus = normalizeAnalysisFocus(req.focus);
    if (!focus.ok) return { ok: false, error: analysisFocusRejectionMessage(focus.reason) };
    const settings = normalizeClaudeVideoSettings(req.settings);
    if (!settings.ok) return { ok: false, error: settings.error };

    const job = { id: req.id, token: randomUUID(), controller: new AbortController(), pending: null };
    active = job;
    const send = (data) => {
      event.sender.send('claude-video-scout-event', { id: job.id, token: job.token, ...data });
    };
    job.done = Promise.resolve().then(() => analyze({
      url: parsed.href, focus: focus.provided ? focus.value : '', settings: settings.settings,
      baseEnv, killTree, verifyPolicy, signal: job.controller.signal,
      progress: (status) => send({ status }),
      transcribe: (pcm, { durationSeconds }) => requestTranscript(job, pcm, durationSeconds, send),
      confirm: (estimate) => requestConfirm(job, estimate, send),
    })).then(
      (report) => ({ ok: true, report }),
      (error) => {
        const reason = error instanceof ScoutError ? error.message
          : `Claude Video Scout failed to start (${errorLabel(error)}).`;
        // The user's own cancel is not an error; everything else goes to the Logs tab.
        if (reason !== CANCELLED && reason !== ESTIMATE_CANCELLED) log(reason);
        // An unexpected error keeps its original for the developer console, never for the UI.
        const cause = error instanceof ScoutError ? error.cause : error;
        if (cause) logCause('[claude-video-scout] unexpected error:', cause);
        return { ok: false, error: reason };
      },
    ).finally(() => { active = null; });
    return job.done;
  }

  function pendingFor(event, req, kind) {
    return trustedSenderGate.assess(event).ok && active?.pending?.kind === kind &&
      req?.id === active.id && req.token === active.token;
  }

  function transcript(event, req) {
    if (!pendingFor(event, req, 'transcript')) {
      return { ok: false, error: 'The Claude Video Scout transcription request is no longer active.' };
    }
    const error = req.error === 'unavailable'
      ? 'Mako’s local Whisper module is unavailable. Restart Mako and check that Dictate loads.'
      : req.error === 'busy'
        ? 'Local Whisper is busy. Finish dictation or wait for the previous transcription, then retry.'
        : !req.error && typeof req.text === 'string' && req.text.length > MAX_TRANSCRIPT_CHARS
          ? `Local Whisper's transcript is longer than ${MAX_TRANSCRIPT_CHARS.toLocaleString('en-US')} characters. Lower the longest-video setting or analyse a shorter video.`
          : 'Local Whisper could not transcribe the video audio.';
    if (req.error || typeof req.text !== 'string' || req.text.length > MAX_TRANSCRIPT_CHARS) {
      active.pending.finish(new ScoutError(error));
      return { ok: false, error };
    }
    active.pending.finish(null, req.text);
    return { ok: true };
  }

  function confirm(event, req) {
    if (!pendingFor(event, req, 'confirm') || typeof req.proceed !== 'boolean') {
      return { ok: false, error: 'The Claude Video Scout estimate is no longer waiting for an answer.' };
    }
    active.pending.finish(null, req.proceed);
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

  return { run, transcript, confirm, cancel, shutdown };
}

module.exports = { createClaudeVideoScoutIpc };
