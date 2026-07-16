'use strict';
// Media-permission policy for the app's single BrowserWindow (K8 audio permission
// hardening). Dependency-free (no electron require) so the allow/deny logic is
// unit-tested without launching Electron, same pattern as nav-guard.js. main.js
// installs the two handlers returned by createMediaPermissionHandlers() on
// session.defaultSession — both funnel through ONE requester assessment so the
// request and check paths can never disagree on the same security facts.
//
// One invariant: media permission is granted ONLY when the current trusted
// application window's main frame requests microphone-only access from the exact
// trusted entry document. Everything else — camera, mixed audio/video, unknown or
// missing media types, foreign documents/origins, subframes, wrong/null/destroyed
// WebContents, and every non-media permission — is denied fail-closed, and the
// refusal is made visible through a bounded Logs line that carries only a reason
// constant (never URLs, transcripts, device labels, or exception text).

// Bounded refusal reasons — the ONLY strings that ever reach the Logs line. Never
// echo the permission name, URL, origin, or an exception message: those are
// attacker-influenced (or can embed user paths) and Logs must not become a sink.
const REASONS = Object.freeze({
  NOT_MEDIA_PERMISSION: 'not-media-permission',
  MISSING_DETAILS: 'missing-details',
  UNTRUSTED_WEBCONTENTS: 'untrusted-webcontents',
  NOT_MAIN_FRAME: 'not-main-frame',
  UNTRUSTED_DOCUMENT: 'untrusted-document',
  ORIGIN_MISMATCH: 'origin-mismatch',
  SECURITY_ORIGIN_MISMATCH: 'security-origin-mismatch',
  EMBEDDER_MISMATCH: 'embedder-mismatch',
  MEDIA_TYPES_MISSING: 'media-types-missing',
  MEDIA_TYPES_EMPTY: 'media-types-empty',
  VIDEO_REQUESTED: 'video-requested',
  NOT_AUDIO_ONLY: 'not-audio-only',
  UNKNOWN_MEDIA_TYPE: 'unknown-media-type',
  MEDIA_TYPE_MISSING: 'media-type-missing',
  POLICY_ERROR: 'policy-error',
});

// Chromium serializes a file:-scheme security origin as the literal 'file:///'
// (probed on Electron 42.5.0: a trusted getUserMedia request reported
// securityOrigin 'file:///' and page-initiated checks reported requestingOrigin
// 'file:///'). The WHATWG URL API is useless here — new URL(fileUrl).origin is the
// string 'null' — so this validates that the entry really is a well-formed file:
// URL and returns the empirically pinned serialization. Throws (visible startup
// failure) rather than guessing for any other scheme: this policy is only correct
// for a file:-hosted entry document.
const TRUSTED_FILE_ORIGIN = 'file:///';
function fileEntryOrigin(entryUrl) {
  let u;
  try { u = new URL(entryUrl); } catch { u = null; }
  if (!u || u.protocol !== 'file:') {
    throw new Error('media-permission policy requires a file: entry URL');
  }
  return TRUSTED_FILE_ORIGIN;
}

// The requesting WebContents must be the current, non-destroyed app window's own
// webContents — not merely "some file: page". Duck-typed so tests exercise it with
// fakes; any structural surprise (missing method, throw) reads as untrusted, which
// the caller surfaces as a visible denial (fail-closed, not silent).
function isTrustedWebContents(wc, win) {
  try {
    if (!wc || !win) return false;
    if (typeof win.isDestroyed !== 'function' || win.isDestroyed()) return false;
    if (typeof wc.isDestroyed !== 'function' || wc.isDestroyed()) return false;
    return wc === win.webContents;
  } catch {
    return false;
  }
}

// Shared requester assessment — the single source of truth for "is this the trusted
// window's main frame asking from the exact entry document". Both deciders call it,
// so request and check cannot drift apart on these facts. Returns null when trusted,
// otherwise the denial reason.
function assessRequester({ trustedWc, isMainFrame, requestingUrl }, trust) {
  if (trustedWc !== true) return REASONS.UNTRUSTED_WEBCONTENTS;
  // Missing isMainFrame is a deny, not a default: only the literal true passes.
  if (isMainFrame !== true) return REASONS.NOT_MAIN_FRAME;
  // Exact string equality against the canonical runtime ENTRY_URL. Probed: Chromium
  // echoes pathToFileURL() output exactly (drive-letter case and encoding intact),
  // so any difference — another local file, empty string, percent-games — is foreign.
  if (typeof requestingUrl !== 'string' || requestingUrl === '' || requestingUrl !== trust.entryUrl) {
    return REASONS.UNTRUSTED_DOCUMENT;
  }
  return null;
}

// setPermissionRequestHandler decision (getUserMedia and friends). `trustedWc` is
// precomputed by the adapter via isTrustedWebContents so the decision stays pure.
function decideMediaRequest({ permission, trustedWc, details }, trust) {
  // 'media' is the only requestable media permission in Electron 42's contract;
  // the legacy 'audioCapture' name is not in the union and gets no special case —
  // it is denied here like every other non-media permission.
  if (permission !== 'media') return { allow: false, reason: REASONS.NOT_MEDIA_PERMISSION };
  if (!details || typeof details !== 'object') return { allow: false, reason: REASONS.MISSING_DETAILS };
  const requesterProblem = assessRequester({
    trustedWc, isMainFrame: details.isMainFrame, requestingUrl: details.requestingUrl,
  }, trust);
  if (requesterProblem) return { allow: false, reason: requesterProblem };
  if (details.securityOrigin !== trust.entryOrigin) return { allow: false, reason: REASONS.ORIGIN_MISMATCH };
  // Audio-only proof: exactly one entry, exactly 'audio'. Everything else — video,
  // mixed lists in either order, empty, missing, unknown, or extra entries — denies.
  const types = details.mediaTypes;
  if (!Array.isArray(types)) return { allow: false, reason: REASONS.MEDIA_TYPES_MISSING };
  if (types.length === 0) return { allow: false, reason: REASONS.MEDIA_TYPES_EMPTY };
  if (types.indexOf('video') !== -1) return { allow: false, reason: REASONS.VIDEO_REQUESTED };
  if (types.length !== 1) return { allow: false, reason: REASONS.NOT_AUDIO_ONLY };
  if (types[0] !== 'audio') return { allow: false, reason: REASONS.UNKNOWN_MEDIA_TYPE };
  return { allow: true, reason: null };
}

// setPermissionCheckHandler decision (navigator.permissions.query and Chromium's
// own status probes). Checks carry their origin in the requestingOrigin argument
// AND (usually) details.securityOrigin; both must match, and both must be present —
// probed page-load-time checks arrive with EMPTY requestingOrigin/requestingUrl and
// are correctly denied here (denying them does not block getUserMedia, which is
// governed by the request handler; probed on 42.5.0).
function decideMediaCheck({ permission, trustedWc, requestingOrigin, details }, trust) {
  if (permission !== 'media') return { allow: false, reason: REASONS.NOT_MEDIA_PERMISSION };
  if (!details || typeof details !== 'object') return { allow: false, reason: REASONS.MISSING_DETAILS };
  const requesterProblem = assessRequester({
    trustedWc, isMainFrame: details.isMainFrame, requestingUrl: details.requestingUrl,
  }, trust);
  if (requesterProblem) return { allow: false, reason: requesterProblem };
  if (requestingOrigin !== trust.entryOrigin) return { allow: false, reason: REASONS.ORIGIN_MISMATCH };
  if (details.securityOrigin !== trust.entryOrigin) return { allow: false, reason: REASONS.SECURITY_ORIGIN_MISMATCH };
  // Probed: embeddingOrigin is populated even for main-frame checks (either the
  // trusted origin or the entry URL itself), contradicting the d.ts comment that it
  // is subframe-only. So its mere presence cannot deny — but if present it must be
  // one of the two self values; a foreign embedder always denies.
  const embedder = details.embeddingOrigin;
  if (embedder !== undefined && embedder !== trust.entryOrigin && embedder !== trust.entryUrl) {
    return { allow: false, reason: REASONS.EMBEDDER_MISMATCH };
  }
  const kind = details.mediaType;
  if (kind === 'audio') return { allow: true, reason: null };
  if (kind === 'video') return { allow: false, reason: REASONS.VIDEO_REQUESTED };
  if (kind === undefined || kind === null || kind === '') return { allow: false, reason: REASONS.MEDIA_TYPE_MISSING };
  return { allow: false, reason: REASONS.UNKNOWN_MEDIA_TYPE }; // 'unknown' and anything else
}

// Echo a check's mediaType into the log ONLY as one of the three Chromium literals;
// anything else logs as blank so a malformed value can't reach the Logs tab.
function boundedMediaKind(details) {
  const k = details && details.mediaType;
  return (k === 'audio' || k === 'video' || k === 'unknown') ? k : '';
}

// The handler pair main.js actually installs. Dependency-free: the Electron objects
// arrive as arguments; the window is late-bound via getTrustedWindow() because the
// handlers are installed in whenReady() before createWindow() runs.
//
// Visible-refusal contract:
//  - Every denied REQUEST logs one line. Probed: one getUserMedia produces exactly
//    one request event, so no request-side dedup is needed or wanted — each real
//    access attempt must stay individually visible.
//  - Denied CHECKS log the FIRST occurrence per (reason, mediaKind) for the app
//    session. Probed: a single page load fires several automatic media checks with
//    empty identity; logging each repeat would flood Logs at every launch. The latch
//    is a Set — deterministic, no clocks (a time window was explicitly rejected) —
//    and every distinct refusal kind still surfaces once.
function createMediaPermissionHandlers({ entryUrl, getTrustedWindow, logRefusal }) {
  const trust = Object.freeze({ entryUrl, entryOrigin: fileEntryOrigin(entryUrl) });
  const seenCheckRefusals = new Set();

  const log = (line) => {
    // A broken logger must never turn a deny into a hang or an allow-path skip.
    try { logRefusal(line); } catch { /* refusal already decided; logging is best-effort */ }
  };

  function handlePermissionRequest(webContents, permission, callback, details) {
    let decision;
    try {
      decision = decideMediaRequest({
        permission,
        trustedWc: isTrustedWebContents(webContents, getTrustedWindow()),
        details,
      }, trust);
    } catch {
      // A policy bug must fail closed and stay visible — never grant on error.
      decision = { allow: false, reason: REASONS.POLICY_ERROR };
    }
    if (!decision.allow) log('[audio-permission] denied request: ' + decision.reason);
    callback(decision.allow === true); // the single callback site: exactly once on every path
  }

  function handlePermissionCheck(webContents, permission, requestingOrigin, details) {
    let decision;
    try {
      decision = decideMediaCheck({
        permission,
        trustedWc: isTrustedWebContents(webContents, getTrustedWindow()),
        requestingOrigin,
        details,
      }, trust);
    } catch {
      decision = { allow: false, reason: REASONS.POLICY_ERROR };
    }
    if (!decision.allow) {
      const kind = boundedMediaKind(details);
      const signature = decision.reason + '|' + kind;
      if (!seenCheckRefusals.has(signature)) {
        seenCheckRefusals.add(signature);
        log('[audio-permission] denied check: ' + decision.reason + (kind ? ' (' + kind + ')' : ''));
      }
    }
    return decision.allow === true;
  }

  return { handlePermissionRequest, handlePermissionCheck };
}

module.exports = {
  REASONS,
  TRUSTED_FILE_ORIGIN,
  fileEntryOrigin,
  isTrustedWebContents,
  decideMediaRequest,
  decideMediaCheck,
  createMediaPermissionHandlers,
};
