'use strict';
// Video-scout SDK path: analyze a PUBLIC YouTube video by passing its URL straight to the Gemini
// API (v1beta generateContent, REST via node's built-in fetch — no npm deps). This route exists
// because the gemini CLI's @file attachment is inline-base64 with a hard 20MB cap
// (MAX_FILE_SIZE_MB in the CLI bundle), which every real 720p video exceeds; the CLI then
// silently sends the prompt WITHOUT the video. The API's fileData.fileUri accepts a public
// YouTube URL directly: no yt-dlp download, no size cap, and generationConfig.mediaResolution
// actually takes effect here (the CLI has no flag for it).
//
// Invoked by scripts/feed-gemini.ps1 when Resolve-VideoSourceRoute picks 'sdk' (YouTube URL +
// video mode). Non-YouTube / local files still go through the CLI path unchanged.
//
// Auth: GEMINI_API_KEY from the environment ONLY (video-scout PTYs receive it from safeStorage
// via main.js's ptyEnv). Never accepted on argv (argv is visible in process listings), never
// read from or written to disk.
//
// Args:
//   --url <youtube url>              required
//   --model <gemini model>           default gemini-2.5-flash-lite
//   --media-resolution LOW|MEDIUM|HIGH   default MEDIUM (maps to MEDIA_RESOLUTION_*)
//   --prompt-file <path>             read prompt from file (newlines preserved — no CLI
//                                    flattening needed on this path)
//   --prompt-text <text>             literal prompt (overrides --prompt-file)
//   --start-offset <seconds>         optional; with --end-offset, analyzes only that slice —
//   --end-offset <seconds>           billing scales to the slice (~81% cheaper for 2min of 10min)
//
// Output: analysis text to stdout, then one machine-readable usage line the renderer forwards
// to the Logs tab:  [video-scout usage] prompt=N (video=N audio=N text=N) output=N total=N ...
//
// K5 shutdown contract: NO runtime path calls process.exit(). runVideoScout() returns a numeric
// exit code; runCliEntry() (the one production entry adapter — also what the child-process tests
// invoke) assigns process.exitCode and lets Node's event loop and fetch/undici resources drain
// naturally. The observed one-off native crash on the 503 path
// (`Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)` in libuv's win/async.c) is consistent
// with a forced process.exit() racing async-handle teardown; the race was NOT reproduced in 120
// bounded local fixture runs, so the inference stays recorded as plausible-not-proven — but
// forced exit is unsafe by Node's own documentation regardless, and the child fixture tests pin
// "no native assertion" on this contract permanently.
//
// K5 retry contract (bounded, cost-honest): a Gemini 503 / parsed UNAVAILABLE gets at most
// THREE total submitted attempts with two bounded jittered delays. Explicit terminal HTTP
// statuses take precedence over anything the body claims. Failed attempts yield no usable
// analysis or usage metadata, but whether the provider bills them is UNKNOWN — that
// uncertainty is exactly why this file is a Full-class review surface.

const fs = require('fs');

const MEDIA_RESOLUTION_MAP = {
  LOW: 'MEDIA_RESOLUTION_LOW',
  MEDIUM: 'MEDIA_RESOLUTION_MEDIUM',
  HIGH: 'MEDIA_RESOLUTION_HIGH',
};
const DEFAULT_MODEL = 'gemini-2.5-flash-lite';

// --- K5 retry policy constants (documented bounds, asserted in tests) ------------------------
const RETRY_MAX_ATTEMPTS = 3;          // total submitted attempts, structural for-loop cap
const RETRY_BASE_DELAY_MS = 1000;      // delay n = base * 2^(n-1) + jitter -> 1.0-1.5s, 2.0-2.5s
const RETRY_JITTER_MS = 500;
// Explicit terminal statuses: never retried, EVEN IF a malformed/contradictory body claims
// UNAVAILABLE (approved correction #1 — the transport status outranks the body's story).
const NON_RETRYABLE_STATUSES = [400, 401, 403, 404, 429];

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--url') out.url = argv[++i];
    else if (a === '--model') out.model = argv[++i];
    else if (a === '--media-resolution') out.mediaResolution = argv[++i];
    else if (a === '--prompt-file') out.promptFile = argv[++i];
    else if (a === '--prompt-text') out.promptText = argv[++i];
    // Record that the flag was SEEN separately from its value: a flag given as the final argv
    // element has an undefined value, which must be distinguishable from "flag not passed" so it
    // can be refused (resolveSliceOffsets) instead of silently falling through to a whole-video run.
    else if (a === '--start-offset') { out.startOffsetSeen = true; out.startOffset = argv[++i]; }
    else if (a === '--end-offset') { out.endOffsetSeen = true; out.endOffset = argv[++i]; }
  }
  return out;
}

// Validate the section-scoping offsets, exported for tests. Returns { sliced:false } (whole video),
// { sliced:true, startOffset, endOffset } (both valid non-negative integers, end strictly after
// start), or { error } — never a coerced/pass-through string and never a silent whole-video
// downgrade when a slice was requested. runVideoScout() returns 1 on { error }. Mirrors the
// refuse-don't-downgrade invariant enforced in feed-gemini.ps1 and app/video-scout-args.js.
function resolveSliceOffsets(args) {
  const startSeen = !!args.startOffsetSeen;
  const endSeen = !!args.endOffsetSeen;
  if (!startSeen && !endSeen) return { sliced: false };
  if (startSeen !== endSeen) {
    return { error: 'Both --start-offset and --end-offset are required to analyze a slice (only one was given); refusing rather than analyzing the whole video.' };
  }
  const parse = (name, raw) => {
    if (raw === undefined) return { error: `${name} was given with no value.` };
    if (!/^\d+$/.test(String(raw))) return { error: `${name} must be a non-negative whole number of seconds (got ${JSON.stringify(raw)}).` };
    return { value: parseInt(raw, 10) };
  };
  const s = parse('--start-offset', args.startOffset);
  if (s.error) return { error: s.error };
  const e = parse('--end-offset', args.endOffset);
  if (e.error) return { error: e.error };
  if (e.value <= s.value) {
    return { error: `--end-offset (${e.value}s) must be strictly greater than --start-offset (${s.value}s).` };
  }
  return { sliced: true, startOffset: s.value, endOffset: e.value };
}

// Pure request-body builder, exported for tests. When both offsets are given (validated upstream
// by resolveSliceOffsets) they become videoMetadata on the same part as fileData, which is what
// makes the API bill only the slice instead of the whole video. The New-Agent modal exposes the
// range picker that feeds these through feed-gemini.ps1's -StartOffset/-EndOffset.
function buildRequestBody({ url, prompt, mediaResolution, startOffset, endOffset }) {
  const videoPart = { fileData: { fileUri: url } };
  if (startOffset !== undefined && endOffset !== undefined) {
    videoPart.videoMetadata = { startOffset: `${startOffset}s`, endOffset: `${endOffset}s` };
  }
  const body = { contents: [{ role: 'user', parts: [videoPart, { text: prompt }] }] };
  const mapped = MEDIA_RESOLUTION_MAP[mediaResolution];
  if (mapped) body.generationConfig = { mediaResolution: mapped };
  return body;
}

function formatUsageLine(usage, model, mediaResolution, sliced) {
  const byModality = {};
  for (const d of usage.promptTokensDetails || []) byModality[d.modality] = d.tokenCount;
  return `[video-scout usage] prompt=${usage.promptTokenCount ?? '?'} ` +
    `(video=${byModality.VIDEO ?? 0} audio=${byModality.AUDIO ?? 0} text=${byModality.TEXT ?? 0}) ` +
    `output=${usage.candidatesTokenCount ?? '?'} total=${usage.totalTokenCount ?? '?'} ` +
    `model=${model} mediaRes=${mediaResolution}${sliced ? ' sliced=yes' : ''}`;
}

// Upstream error text is attacker-adjacent (it renders provider/network strings into our logs):
// collapse control chars/newlines so it cannot forge extra log lines, and cap it to one bounded
// line. Never carries the API key (the key only ever enters the request header).
function sanitizeUpstreamText(text) {
  const s = String(text == null ? '' : text).replace(/[\x00-\x1f\x7f]+/g, ' ').replace(/\s+/g, ' ').trim();
  return s.length > 300 ? s.slice(0, 300) + '...(truncated)' : s;
}

// K5 classification, exported for tests. PRECEDENCE ORDER (approved correction #1):
//   1. success (res.ok) is handled by the caller and never reaches here;
//   2. explicit terminal statuses (400/401/403/404/429) — terminal even if the body says UNAVAILABLE;
//   3. HTTP 503 — retryable (a malformed/unparseable body must NOT disable this);
//   4. any other non-success status whose PARSED body carries error.status === 'UNAVAILABLE' — retryable;
//   5. everything else — terminal.
function classifyHttpFailure(status, json) {
  if (NON_RETRYABLE_STATUSES.indexOf(status) !== -1) return { retryable: false };
  if (status === 503) return { retryable: true };
  const parsed = json && json.error && json.error.status;
  if (parsed === 'UNAVAILABLE') return { retryable: true };
  return { retryable: false };
}

// Bounded jittered backoff, exported for tests: 1.0-1.5s after attempt 1, 2.0-2.5s after
// attempt 2. No other delays exist (three attempts = at most two sleeps), no unbounded timers.
function retryDelayMs(attempt, random) {
  return RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1) + random() * RETRY_JITTER_MS;
}

// The whole operation, dependency-injected for tests (production defaults are Node's real
// implementations). Returns the process exit code — it never calls process.exit() and never
// throws for expected failures. The Gemini endpoint is built internally from the model; there
// is deliberately NO env var or CLI flag that can redirect it — tests inject fetchImpl instead.
async function runVideoScout(rawArgs, deps = {}) {
  const {
    fetchImpl = fetch,
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    random = Math.random,
    log = console.log,
    logError = console.error,
    env = process.env,
  } = deps;

  const args = parseArgs(rawArgs);
  const key = env.GEMINI_API_KEY;
  if (!key) {
    logError('[video-scout sdk] GEMINI_API_KEY is not set in the environment. Launch video-scout from the app (which injects it from safeStorage), or set it for this session.');
    return 1;
  }
  if (!args.url) { logError('[video-scout sdk] --url is required.'); return 1; }

  let prompt = args.promptText;
  if (!prompt && args.promptFile) {
    try { prompt = fs.readFileSync(args.promptFile, 'utf8').trim(); }
    catch (err) { logError(`[video-scout sdk] could not read --prompt-file: ${sanitizeUpstreamText(err.message)}`); return 1; }
  }
  if (!prompt) { logError('[video-scout sdk] no prompt: pass --prompt-file or --prompt-text.'); return 1; }

  const model = args.model || DEFAULT_MODEL;
  const mediaResolution = MEDIA_RESOLUTION_MAP[args.mediaResolution] ? args.mediaResolution : 'MEDIUM';

  // Refuse (return non-zero) on any offset problem — a lone flag, a flag with no value, a
  // non-integer, or end<=start — rather than silently analyzing (and billing for) the whole video.
  const slice = resolveSliceOffsets(args);
  if (slice.error) { logError(`[video-scout sdk] ${slice.error}`); return 1; }
  const sliced = slice.sliced;

  const body = buildRequestBody({
    url: args.url, prompt, mediaResolution,
    startOffset: sliced ? slice.startOffset : undefined,
    endOffset: sliced ? slice.endOffset : undefined,
  });
  // Serialized ONCE, before the loop: every retry submits this byte-identical payload — the
  // URL, prompt, model, media resolution, and slice offsets structurally cannot drift between
  // attempts, and no guard is re-evaluated (or bypassable) mid-retry.
  const bodyJson = JSON.stringify(body);

  log(`[video-scout sdk] analyzing ${args.url}`);
  log(`[video-scout sdk] model=${model} mediaResolution=${mediaResolution} (ENFORCED on this path)${sliced ? ` slice=${slice.startOffset}s-${slice.endOffset}s` : ' (whole video)'}`);
  log(`[video-scout sdk] bounded 503 retry policy active (max ${RETRY_MAX_ATTEMPTS} attempts)`);

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const t0 = Date.now();

  // Structural attempt cap: a plain counted loop, no recursion, no open-ended timers. Cost
  // truth: at most three submitted attempts; failed attempts return no usable analysis or
  // usage metadata, and whether the provider bills them is unknown.
  for (let attempt = 1; attempt <= RETRY_MAX_ATTEMPTS; attempt++) {
    let res;
    try {
      res = await fetchImpl(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: bodyJson,
      });
    } catch (err) {
      // Ambiguous by definition: we cannot know whether the server processed (and might bill)
      // the request, so it is NEVER retried — visible failure, natural shutdown.
      logError(`[video-scout sdk] network error (ambiguous — not retried): ${sanitizeUpstreamText(err.message)}`);
      return 1;
    }

    // A malformed body must not hide the transport status: parse failures leave json null and
    // classification proceeds on res.status alone (503 stays retryable, 400 stays terminal).
    let json = null;
    try { json = await res.json(); } catch { json = null; }
    const secs = ((Date.now() - t0) / 1000).toFixed(1);

    if (res.ok) {
      const finish = json && json.candidates && json.candidates[0] && json.candidates[0].finishReason;
      const text = ((json && json.candidates && json.candidates[0] && json.candidates[0].content && json.candidates[0].content.parts) || [])
        .map((p) => p.text || '').join('');
      if (!text) {
        // An empty SUCCESS is terminal (never retried): the server answered; asking again could
        // only duplicate cost for the same outcome.
        logError(`[video-scout sdk] empty response (finishReason=${finish}). Full candidate: ${sanitizeUpstreamText(JSON.stringify((json && (json.candidates || json))) )}`);
        return 1;
      }
      if (attempt > 1) log(`[video-scout sdk] recovered on attempt ${attempt}/${RETRY_MAX_ATTEMPTS}`);
      // The analysis text and the usage line print exactly ONCE, only here, only on the
      // accepted success response — a failed attempt has no path to either line.
      log(`\n${text}\n`);
      if (finish !== 'STOP') logError(`[video-scout sdk] WARNING: finishReason=${finish} — output may be truncated.`);
      log(formatUsageLine((json && json.usageMetadata) || {}, model, mediaResolution, sliced));
      return 0;
    }

    const apiMsg = sanitizeUpstreamText(
      json && json.error ? `${json.error.status || ''} ${json.error.message || ''}`.trim() : JSON.stringify(json).slice(0, 500)
    );
    const { retryable } = classifyHttpFailure(res.status, json);
    if (retryable && attempt < RETRY_MAX_ATTEMPTS) {
      const delayMs = retryDelayMs(attempt, random);
      // Bounded metadata only: status, parsed status word (a known enum when present), attempt
      // counter, delay. Never the body, prompt, or key.
      const statusWord = json && json.error && json.error.status ? ` ${sanitizeUpstreamText(json.error.status).slice(0, 40)}` : '';
      logError(`[video-scout sdk] HTTP ${res.status}${statusWord} — attempt ${attempt}/${RETRY_MAX_ATTEMPTS}; retrying in ${(delayMs / 1000).toFixed(1)}s`);
      await sleep(delayMs);
      continue;
    }
    // Terminal: either a non-retryable status/body, or the third 503 in a row.
    const giveUp = retryable ? ` — giving up after ${RETRY_MAX_ATTEMPTS} attempts` : '';
    logError(`[video-scout sdk] HTTP ${res.status} after ${secs}s (attempt ${attempt}/${RETRY_MAX_ATTEMPTS})${giveUp}: ${apiMsg}`);
    return 1;
  }
  // Unreachable (every loop path returns or continues), kept as a fail-closed backstop.
  return 1;
}

// The ONE production entry adapter (K5 shutdown contract). require.main calls it, and the
// child-process fixture tests call THIS SAME function with an injected local fetchImpl — so the
// shutdown behavior the tests prove is the shutdown behavior production runs. It assigns
// process.exitCode (never process.exit) and lets the event loop drain; the single top-level
// catch keeps an unexpected throw visible and non-zero without a forced kill.
function runCliEntry(deps = {}) {
  const logError = deps.logError || console.error;
  return runVideoScout(process.argv.slice(2), deps).then(
    (code) => { process.exitCode = code; },
    (err) => {
      logError(`[video-scout sdk] unexpected failure: ${sanitizeUpstreamText(err && err.message ? err.message : err)}`);
      process.exitCode = 1;
    }
  );
}

module.exports = {
  buildRequestBody, formatUsageLine, parseArgs, resolveSliceOffsets,
  MEDIA_RESOLUTION_MAP, DEFAULT_MODEL,
  classifyHttpFailure, retryDelayMs, sanitizeUpstreamText,
  runVideoScout, runCliEntry,
  RETRY_MAX_ATTEMPTS, RETRY_BASE_DELAY_MS, RETRY_JITTER_MS, NON_RETRYABLE_STATUSES,
};
if (require.main === module) runCliEntry();
