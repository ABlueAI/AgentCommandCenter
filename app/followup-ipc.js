'use strict';
// V3b stored-report follow-up boundary (main process). ONE explicit user submission may ask ONE
// bounded question using an already-persisted, main-validated report as text context — without
// re-ingesting video, modifying the stored run, or triggering any automatic/background request.
//
// Trust posture (same as library-ipc.js, which this extends):
//   - Every request passes the shared trusted-sender gate (trusted-ipc-sender.js).
//   - The renderer identifies the report ONLY through the two existing main-owned identity routes:
//     the CURRENT opaque Library handle (source:'library') or the live pane ID (source:'pane',
//     resolved through V5b1's internal pane->runId registry). It never sends a run ID, path,
//     report text, video URL, model, or key — the discriminated shape rejects anything extra.
//   - The report is RE-READ through the PowerShell-backed Library Read authority at submission
//     time (TOCTOU: renderer-held text is never trusted or reused).
//   - Handle lifetime is UNCHANGED: this module only consults library-ipc's current table via the
//     injected resolver, so a handle from a superseded List refuses here exactly as it does on Read.
//   - Cost boundary: main enforces ONE global follow-up in flight (across both identity types); a
//     second submission refuses 'follow-up-in-progress' and is never queued. The in-flight flag
//     clears in `finally` on every path. The child adds K5's bounded transport attempts (max three
//     for retryable 503/UNAVAILABLE) — one logical request per explicit submission, no additional
//     retry loop here, in the renderer, or in the child.
//   - Logs carry bounded metadata/constants only: model, question/report char counts, attempt and
//     token counts, and stable codes. NEVER question/report/answer text, keys, provider bodies,
//     paths, or run IDs.
//
// PURE of Electron: main.js injects the trust anchors, the handle/pane resolvers, the PS-backed
// report reader, and the child runner — fully unit-testable (followup-ipc.test.js).

const { createTrustedSenderGate } = require('./trusted-ipc-sender');

const FOLLOWUP_QUESTION_MAX = 2000;          // UTF-16 units, after normalization
const FOLLOWUP_REPORT_CONTEXT_MAX = 200000;  // UTF-16 units — narrower than the Library's 1M read
                                             // cap; a provider-cost bound, checked on the returned
                                             // text length. Fail closed, never truncate silently.
const FOLLOWUP_MODEL = 'gemini-2.5-flash-lite'; // fixed in V3b; no selector by design

// Stable child/runner failure codes main will forward to the renderer. Anything else collapses
// to 'follow-up-failed' — an unexpected child cannot smuggle arbitrary text through the error slot.
const FOLLOWUP_CHILD_ERROR_CODES = new Set([
  'gemini-key-missing', 'missing-key', 'invalid-input', 'network-error',
  'provider-unavailable', 'provider-terminal', 'empty-response', 'unexpected-failure',
  'child-spawn-failed', 'child-timeout', 'child-output-overflow', 'child-malformed-output',
]);

// Normalize + validate the question (MAIN is the authority; renderer validation is convenience).
// Order per the work order: CR/LF/tab -> spaces, trim + collapse repeated whitespace, THEN bound
// and control-character checks on the normalized text. Normal Unicode text/punctuation passes.
function normalizeFollowupQuestion(raw) {
  if (typeof raw !== 'string') return { ok: false, error: 'question-invalid' };
  const normalized = raw.replace(/[\r\n\t]/g, ' ').replace(/\s+/g, ' ').trim();
  if (normalized.length === 0) return { ok: false, error: 'question-empty' };
  if (normalized.length > FOLLOWUP_QUESTION_MAX) return { ok: false, error: 'question-too-long' };
  if (/[\x00-\x1f\x7f]/.test(normalized)) return { ok: false, error: 'question-control-chars' };
  return { ok: true, question: normalized };
}

// Strictly validate the discriminated request: EXACTLY the keys of the selected variant, correct
// types, nothing extra (a bypassed renderer cannot slip in a runId/path/model/key field — any
// unknown key is a refusal, not an ignore).
function validateFollowupRequest(req) {
  if (!req || typeof req !== 'object' || Array.isArray(req)) return { error: 'bad-request' };
  const keys = Object.keys(req).sort();
  if (req.source === 'library') {
    if (keys.length !== 3 || keys[0] !== 'handle' || keys[1] !== 'question' || keys[2] !== 'source') {
      return { error: 'bad-request' };
    }
    if (typeof req.handle !== 'string' || req.handle.length === 0) return { error: 'bad-request' };
    return { source: 'library', handle: req.handle };
  }
  if (req.source === 'pane') {
    if (keys.length !== 3 || keys[0] !== 'paneId' || keys[1] !== 'question' || keys[2] !== 'source') {
      return { error: 'bad-request' };
    }
    if (typeof req.paneId !== 'string' || req.paneId.length === 0) return { error: 'bad-request' };
    return { source: 'pane', paneId: req.paneId };
  }
  return { error: 'bad-request' };
}

function createFollowupIpc(deps) {
  const entryUrl = deps && deps.entryUrl;
  const getTrustedWindow = deps && deps.getTrustedWindow;
  const resolveLibraryHandle = deps && deps.resolveLibraryHandle; // (handle) => runId | undefined (CURRENT table only)
  const getRunIdForPane = deps && deps.getRunIdForPane;           // (paneId) => runId | undefined (V5b1 registry)
  const readReport = deps && deps.readReport;                     // async (runId) => PS Read result (the sole authority)
  const runFollowupChild = deps && deps.runFollowupChild;         // async ({report, question}) => child JSON | safe error
  const hasGeminiKey = deps && deps.hasGeminiKey;                 // () => boolean
  const logUsage = (deps && deps.logUsage) || (() => { });
  const logRefusal = (deps && deps.logRefusal) || (() => { });
  for (const [name, fn] of [
    ['resolveLibraryHandle', resolveLibraryHandle], ['getRunIdForPane', getRunIdForPane],
    ['readReport', readReport], ['runFollowupChild', runFollowupChild], ['hasGeminiKey', hasGeminiKey],
  ]) {
    if (typeof fn !== 'function') throw new Error(`followup-ipc: ${name} is required.`);
  }
  const gate = createTrustedSenderGate({ entryUrl, getTrustedWindow });

  // The ONE global cost gate: at most one follow-up in flight across both identity types.
  let inFlight = false;

  function refuse(reason) {
    // Bounded reason constant only — never content, a path, or a run ID.
    logRefusal(`[followup] denied: ${reason}`);
    return { ok: false, error: reason };
  }

  async function handleAsk(event, req) {
    const g = gate.assess(event);
    if (!g.ok) return refuse(g.reason);
    const shape = validateFollowupRequest(req);
    if (shape.error) return refuse(shape.error);
    const q = normalizeFollowupQuestion(req.question);
    if (!q.ok) return refuse(q.error);

    if (inFlight) return refuse('follow-up-in-progress');   // refuse, never queue
    inFlight = true;
    try {
      // Identity: resolved main-side ONLY. The run ID never came from — and never returns to —
      // the renderer.
      let runId;
      if (shape.source === 'library') {
        runId = resolveLibraryHandle(shape.handle);
        if (typeof runId !== 'string' || runId.length === 0) return refuse('unknown-handle');
      } else {
        runId = getRunIdForPane(shape.paneId);
        if (typeof runId !== 'string' || runId.length === 0) return refuse('no-run-for-pane');
      }

      // No key -> no child, no request (checked again inside the runner before spawn).
      if (hasGeminiKey() !== true) return refuse('gemini-key-missing');

      // Re-read through the validated PowerShell path — the ONLY report source. Anything but a
      // clean 'available' text refuses before any provider work.
      let read;
      try { read = await readReport(runId); }
      catch { return refuse('report-unavailable'); }
      if (!read || read.ok !== true || read.status !== 'available' || typeof read.text !== 'string' || read.text.length === 0) {
        return refuse('report-unavailable');
      }
      const report = read.text;
      if (report.length > FOLLOWUP_REPORT_CONTEXT_MAX) return refuse('report-too-large-for-follow-up');

      // The runner's contract is resolve-never-reject, but a defect there must still fail closed
      // as a visible refusal — never an unhandled rejection crossing the IPC boundary.
      let child;
      try { child = await runFollowupChild({ report, question: q.question }); }
      catch { return refuse('follow-up-failed'); }

      if (child && child.ok === true && typeof child.answer === 'string' && child.answer.length > 0) {
        const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
        const u = (child.usage && typeof child.usage === 'object') ? child.usage : {};
        const usage = {
          promptTokens: num(u.promptTokens),
          outputTokens: num(u.outputTokens),
          totalTokens: num(u.totalTokens),
        };
        const attempts = num(child.attempts) === null ? 1 : child.attempts;
        // Bounded metadata ONLY (the allowlist in the work order) — never the texts.
        logUsage(`[followup] completed model=${FOLLOWUP_MODEL} questionChars=${q.question.length} ` +
          `reportChars=${report.length} attempts=${attempts} prompt=${usage.promptTokens == null ? '?' : usage.promptTokens} ` +
          `output=${usage.outputTokens == null ? '?' : usage.outputTokens} total=${usage.totalTokens == null ? '?' : usage.totalTokens}`);
        // The answer is EPHEMERAL renderer memory only — it is never logged or persisted here.
        return { ok: true, answer: child.answer, model: FOLLOWUP_MODEL, attempts, usage };
      }

      const code = (child && typeof child.error === 'string' && FOLLOWUP_CHILD_ERROR_CODES.has(child.error))
        ? child.error : 'follow-up-failed';
      return refuse(code);
    } finally {
      inFlight = false;   // clears after EVERY success, refusal, timeout, failure, and throw
    }
  }

  return {
    handleAsk,
    // test/inspection only — never sent to the renderer.
    _inFlight: () => inFlight,
  };
}

const api = {
  createFollowupIpc, normalizeFollowupQuestion, validateFollowupRequest,
  FOLLOWUP_QUESTION_MAX, FOLLOWUP_REPORT_CONTEXT_MAX, FOLLOWUP_MODEL, FOLLOWUP_CHILD_ERROR_CODES,
};
if (typeof module === 'object' && module.exports) module.exports = api;
