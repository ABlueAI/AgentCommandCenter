'use strict';
// Run: node scripts/gemini-video-sdk.test.js
// Plain Node.js — no framework (matches app/video-scout-args.test.js convention).
// Covers the pure request-body builder / arg parsing (pre-K5 suite, preserved verbatim) plus
// the K5 bounded-503-recovery contract: classification precedence, three-attempt cap, bounded
// jittered backoff, byte-identical retry bodies, once-only output, natural shutdown via the
// REAL runCliEntry adapter in child processes against a localhost fixture. Network use is
// 127.0.0.1 only — no Gemini API, no credentials, no paid calls.

const {
  buildRequestBody, formatUsageLine, parseArgs, resolveSliceOffsets, MEDIA_RESOLUTION_MAP, DEFAULT_MODEL,
  classifyHttpFailure, retryDelayMs, runVideoScout, runCliEntry,
  RETRY_MAX_ATTEMPTS, RETRY_BASE_DELAY_MS, RETRY_JITTER_MS, NON_RETRYABLE_STATUSES,
} = require('./gemini-video-sdk');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { execFile } = require('child_process');

let passed = 0, failed = 0;
function assert(cond, label) {
  if (cond) { process.stdout.write(`  ✓ ${label}\n`); passed++; }
  else { process.stderr.write(`  ✗ FAIL: ${label}\n`); failed++; }
}
function section(name) { process.stdout.write(`\n${name}\n`); }

// --- buildRequestBody: basic shape ---------------------------------------------------
{
  const b = buildRequestBody({ url: 'https://youtu.be/x', prompt: 'analyze', mediaResolution: 'LOW' });
  const parts = b.contents[0].parts;
  assert(parts.length === 2, 'two parts: video + text');
  assert(parts[0].fileData.fileUri === 'https://youtu.be/x', 'fileData.fileUri carries the URL');
  assert(parts[1].text === 'analyze', 'text part carries the prompt');
  assert(b.generationConfig.mediaResolution === 'MEDIA_RESOLUTION_LOW', 'LOW maps to MEDIA_RESOLUTION_LOW in generationConfig');
  assert(!('videoMetadata' in parts[0]), 'no videoMetadata when offsets absent');
}

// --- buildRequestBody: offsets -------------------------------------------------------
{
  const b = buildRequestBody({ url: 'u', prompt: 'p', mediaResolution: 'MEDIUM', startOffset: '120', endOffset: '240' });
  const vm = b.contents[0].parts[0].videoMetadata;
  assert(vm && vm.startOffset === '120s' && vm.endOffset === '240s', 'both offsets become videoMetadata with s suffix');
}
{
  const b = buildRequestBody({ url: 'u', prompt: 'p', mediaResolution: 'MEDIUM', startOffset: '120' });
  assert(!('videoMetadata' in b.contents[0].parts[0]), 'a lone startOffset does NOT produce videoMetadata');
}

// --- buildRequestBody: media resolution mapping --------------------------------------
{
  assert(buildRequestBody({ url: 'u', prompt: 'p', mediaResolution: 'HIGH' }).generationConfig.mediaResolution === 'MEDIA_RESOLUTION_HIGH', 'HIGH maps correctly');
  assert(!('generationConfig' in buildRequestBody({ url: 'u', prompt: 'p', mediaResolution: 'ULTRA' })), 'unknown resolution produces no generationConfig (API default applies)');
  assert(Object.keys(MEDIA_RESOLUTION_MAP).join(',') === 'LOW,MEDIUM,HIGH', 'map covers exactly LOW/MEDIUM/HIGH');
}

// --- parseArgs ------------------------------------------------------------------------
{
  const a = parseArgs(['--url', 'https://youtu.be/x', '--model', 'gemini-2.5-pro', '--media-resolution', 'LOW',
    '--prompt-file', 'C:\\p.md', '--start-offset', '60', '--end-offset', '180']);
  assert(a.url === 'https://youtu.be/x' && a.model === 'gemini-2.5-pro' && a.mediaResolution === 'LOW', 'parses url/model/resolution');
  assert(a.promptFile === 'C:\\p.md' && a.startOffset === '60' && a.endOffset === '180', 'parses prompt file and offsets');
  assert(a.startOffsetSeen === true && a.endOffsetSeen === true, 'records that both offset flags were seen');
  assert(DEFAULT_MODEL === 'gemini-2.5-flash-lite', 'default model matches feed-gemini.ps1');
}
// parseArgs: a flag given as the FINAL argv element records seen=true, value=undefined (2b) -------
{
  const a = parseArgs(['--url', 'https://youtu.be/x', '--start-offset', '10', '--end-offset']);
  assert(a.endOffsetSeen === true && a.endOffset === undefined,
    'a trailing --end-offset with no value is recorded as seen-but-valueless (not silently absent)');
}

// --- resolveSliceOffsets: valid path -------------------------------------------------
{
  const r = resolveSliceOffsets({ startOffsetSeen: true, startOffset: '120', endOffsetSeen: true, endOffset: '240' });
  assert(r.sliced === true && r.startOffset === 120 && r.endOffset === 240,
    'valid pair resolves to integers (no coerced/pass-through strings)');
  assert(typeof r.startOffset === 'number' && Number.isInteger(r.startOffset), 'startOffset is a real integer, not a string');
}
{
  const r = resolveSliceOffsets({});
  assert(r.sliced === false && !r.error, 'no offset flags -> whole video, no error');
}

// --- resolveSliceOffsets 2a: non-negative-integer validation, no coercion ------------
{
  assert(resolveSliceOffsets({ startOffsetSeen: true, startOffset: '1.5', endOffsetSeen: true, endOffset: '20' }).error,
    'REFUSES a fractional startOffset (no truncation/coercion)');
  assert(resolveSliceOffsets({ startOffsetSeen: true, startOffset: '-5', endOffsetSeen: true, endOffset: '20' }).error,
    'REFUSES a negative startOffset');
  assert(resolveSliceOffsets({ startOffsetSeen: true, startOffset: '10abc', endOffsetSeen: true, endOffset: '20' }).error,
    'REFUSES a junk/non-numeric startOffset (no pass-through string)');
  assert(resolveSliceOffsets({ startOffsetSeen: true, startOffset: '10', endOffsetSeen: true, endOffset: 'xyz' }).error,
    'REFUSES a junk endOffset');
}

// --- resolveSliceOffsets 2b: flag with missing value (undefined) is REFUSED ----------
{
  const r = resolveSliceOffsets({ startOffsetSeen: true, startOffset: '10', endOffsetSeen: true, endOffset: undefined });
  assert(r.error && !r.sliced, 'a seen-but-valueless offset is refused, never a silent whole-video fallback');
}
{
  // integration: parseArgs of a trailing flag -> resolveSliceOffsets refuses
  const r = resolveSliceOffsets(parseArgs(['--url', 'u', '--start-offset', '10', '--end-offset']));
  assert(r.error && !r.sliced, 'parseArgs + resolveSliceOffsets refuses a trailing valueless --end-offset');
}

// --- resolveSliceOffsets: both-or-neither and strict order ---------------------------
{
  assert(resolveSliceOffsets({ startOffsetSeen: true, startOffset: '10' }).error,
    'REFUSES a lone startOffset (both required, no silent whole-video)');
  assert(resolveSliceOffsets({ endOffsetSeen: true, endOffset: '10' }).error,
    'REFUSES a lone endOffset');
  assert(resolveSliceOffsets({ startOffsetSeen: true, startOffset: '100', endOffsetSeen: true, endOffset: '50' }).error,
    'REFUSES end < start');
  assert(resolveSliceOffsets({ startOffsetSeen: true, startOffset: '100', endOffsetSeen: true, endOffset: '100' }).error,
    'REFUSES end === start (strictly-after)');
}

// --- formatUsageLine -------------------------------------------------------------------
{
  const line = formatUsageLine({
    promptTokenCount: 66766, candidatesTokenCount: 4400, totalTokenCount: 71166,
    promptTokensDetails: [
      { modality: 'TEXT', tokenCount: 1373 }, { modality: 'VIDEO', tokenCount: 45085 }, { modality: 'AUDIO', tokenCount: 20308 },
    ],
  }, 'gemini-2.5-flash-lite', 'LOW', false);
  assert(line.startsWith('[video-scout usage] '), 'usage line carries the Logs-tab marker');
  assert(line.includes('prompt=66766') && line.includes('video=45085') && line.includes('audio=20308'), 'per-modality counts present');
  assert(!line.includes('sliced'), 'no sliced flag when not sliced');
  const sliceLine = formatUsageLine({ promptTokenCount: 1 }, 'm', 'LOW', true);
  assert(sliceLine.includes('sliced=yes'), 'sliced runs are marked');
}

// ═══════════════════════════════════════════════════════════════════════════════════════
// K5 — bounded 503 recovery
// ═══════════════════════════════════════════════════════════════════════════════════════

section('K5 classification precedence (classifyHttpFailure)');
{
  assert(RETRY_MAX_ATTEMPTS === 3 && RETRY_BASE_DELAY_MS === 1000 && RETRY_JITTER_MS === 500,
    'documented policy constants: 3 attempts, 1s base, 500ms jitter');
  assert(NON_RETRYABLE_STATUSES.join(',') === '400,401,403,404,429', 'explicit terminal statuses are exactly 400/401/403/404/429');
  assert(classifyHttpFailure(503, null).retryable === true, '503 with NO parseable body is retryable (status outranks body)');
  assert(classifyHttpFailure(503, { error: { status: 'INTERNAL' } }).retryable === true, '503 is retryable regardless of body claims');
  assert(classifyHttpFailure(500, { error: { status: 'UNAVAILABLE' } }).retryable === true, 'non-terminal status + parsed UNAVAILABLE body is retryable');
  assert(classifyHttpFailure(500, { error: { status: 'INTERNAL' } }).retryable === false, 'plain 500 without UNAVAILABLE is terminal');
  assert(classifyHttpFailure(502, null).retryable === false, 'plain 502 is terminal');
  for (const s of [400, 401, 403, 404, 429]) {
    assert(classifyHttpFailure(s, { error: { status: 'UNAVAILABLE' } }).retryable === false,
      `CONTRADICTORY body: HTTP ${s} with an UNAVAILABLE body is STILL terminal (status precedence)`);
  }
}

section('K5 backoff bounds (retryDelayMs)');
{
  assert(retryDelayMs(1, () => 0) === 1000 && retryDelayMs(1, () => 0.9999) < 1500, 'delay after attempt 1 stays in [1000, 1500) ms');
  assert(retryDelayMs(2, () => 0) === 2000 && retryDelayMs(2, () => 0.9999) < 2500, 'delay after attempt 2 stays in [2000, 2500) ms');
}

// --- harness for runVideoScout with injected deps -------------------------------------
const SUCCESS_BODY = {
  candidates: [{ content: { parts: [{ text: 'ANALYSIS RESULT' }] }, finishReason: 'STOP' }],
  usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5, totalTokenCount: 15, promptTokensDetails: [] },
};
const U503 = { error: { code: 503, status: 'UNAVAILABLE', message: 'The model is overloaded. Please try again later.' } };
function resp(status, body, opts = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => { if (opts.malformed) throw new Error('unexpected token'); return body; },
  };
}
function makeDeps(responses) {
  const calls = [];
  const sleeps = [];
  const logs = [];
  const errs = [];
  return {
    calls, sleeps, logs, errs,
    deps: {
      fetchImpl: async (url, opts) => {
        calls.push({ url, body: opts.body, headers: opts.headers });
        const next = responses.shift();
        if (next instanceof Error) throw next;
        return next;
      },
      sleep: async (ms) => { sleeps.push(ms); },
      random: () => 0.4, // deterministic jitter: delays become exactly 1200 and 2200 ms
      log: (l) => logs.push(String(l)),
      logError: (l) => errs.push(String(l)),
      env: { GEMINI_API_KEY: 'SECRET-KEY-123' },
    },
  };
}
const ARGS = ['--url', 'https://youtu.be/test', '--prompt-text', 'SECRET-PROMPT-XYZ analyze this', '--media-resolution', 'LOW'];
const usageCount = (logs) => logs.filter((l) => l.includes('[video-scout usage]')).length;
const textCount = (logs) => logs.filter((l) => l.includes('ANALYSIS RESULT')).length;

(async () => {

  section('K5 first-attempt success: one request, no sleep, output once');
  {
    const h = makeDeps([resp(200, SUCCESS_BODY)]);
    const code = await runVideoScout(ARGS, h.deps);
    assert(code === 0, 'returns exit code 0');
    assert(h.calls.length === 1, 'exactly one request submitted');
    assert(h.sleeps.length === 0, 'no sleep on the success path');
    assert(textCount(h.logs) === 1 && usageCount(h.logs) === 1, 'analysis text and usage line print exactly once');
    assert(h.logs.some((l) => l.includes('bounded 503 retry policy active (max 3 attempts)')),
      'the ordinary operational line announces the bounded policy');
  }

  section('K5 503 -> success: two requests, one bounded delay, recovery reported');
  {
    const h = makeDeps([resp(503, U503), resp(200, SUCCESS_BODY)]);
    const code = await runVideoScout(ARGS, h.deps);
    assert(code === 0, 'returns 0 after recovery');
    assert(h.calls.length === 2, 'exactly two requests');
    assert(h.sleeps.length === 1 && h.sleeps[0] === 1200, 'one delay of exactly base+0.4*jitter = 1200 ms');
    assert(h.errs.some((l) => /HTTP 503 UNAVAILABLE — attempt 1\/3; retrying in 1\.2s/.test(l)),
      'retry line shows status, parsed status word, attempt counter, and delay');
    assert(h.logs.some((l) => l.includes('recovered on attempt 2/3')), 'successful recovery names the attempt');
    assert(textCount(h.logs) === 1 && usageCount(h.logs) === 1, 'output and usage still print exactly once');
  }

  section('K5 503, 503 -> success: three requests, two bounded delays');
  {
    const h = makeDeps([resp(503, U503), resp(503, U503), resp(200, SUCCESS_BODY)]);
    const code = await runVideoScout(ARGS, h.deps);
    assert(code === 0 && h.calls.length === 3, 'three requests, recovered');
    assert(h.sleeps.length === 2 && h.sleeps[0] === 1200 && h.sleeps[1] === 2200,
      'delays are exactly 1200 then 2200 ms (exponential + deterministic jitter, within documented bounds)');
    assert(h.logs.some((l) => l.includes('recovered on attempt 3/3')), 'recovery names attempt 3/3');
    assert(usageCount(h.logs) === 1, 'usage prints once even after two retries');
    const bodies = h.calls.map((c) => c.body);
    assert(bodies[0] === bodies[1] && bodies[1] === bodies[2], 'every retry submits the byte-identical request body');
    const expected = JSON.stringify(buildRequestBody({ url: 'https://youtu.be/test', prompt: 'SECRET-PROMPT-XYZ analyze this', mediaResolution: 'LOW' }));
    assert(bodies[0] === expected, 'and that body is exactly the validated original (URL/prompt/model/resolution cannot drift)');
  }

  section('K5 three 503s: stops permanently at three attempts');
  {
    const h = makeDeps([resp(503, U503), resp(503, U503), resp(503, U503), resp(200, SUCCESS_BODY)]);
    const code = await runVideoScout(ARGS, h.deps);
    assert(code === 1, 'returns 1 after the third 503');
    assert(h.calls.length === 3, 'exactly three requests — the cap is structural, a fourth response is never fetched');
    assert(h.sleeps.length === 2, 'only two delays exist for three attempts');
    assert(h.errs.some((l) => l.includes('(attempt 3/3) — giving up after 3 attempts') && l.includes('HTTP 503')),
      'final failure names the HTTP status, the attempt cap, and gives up visibly');
    assert(usageCount(h.logs) === 0 && textCount(h.logs) === 0,
      'failed attempts produce no usage line and no analysis text (nothing completed-looking)');
  }

  section('K5 parsed UNAVAILABLE on a non-terminal status is retryable');
  {
    const h = makeDeps([resp(500, { error: { status: 'UNAVAILABLE', message: 'overloaded' } }), resp(200, SUCCESS_BODY)]);
    const code = await runVideoScout(ARGS, h.deps);
    assert(code === 0 && h.calls.length === 2, 'HTTP 500 + parsed UNAVAILABLE body retries and recovers');
  }

  section('K5 explicit terminal statuses: never retried');
  for (const s of [400, 401, 403, 404, 429]) {
    const h = makeDeps([resp(s, { error: { status: 'FAILED_PRECONDITION', message: 'nope' } }), resp(200, SUCCESS_BODY)]);
    const code = await runVideoScout(ARGS, h.deps);
    assert(code === 1 && h.calls.length === 1 && h.sleeps.length === 0, `HTTP ${s} is terminal on the first response (no retry, no sleep)`);
  }

  section('K5 contradictory body: terminal status outranks UNAVAILABLE claim');
  for (const s of [400, 429]) {
    const h = makeDeps([resp(s, U503), resp(200, SUCCESS_BODY)]);
    const code = await runVideoScout(ARGS, h.deps);
    assert(code === 1 && h.calls.length === 1, `HTTP ${s} with an UNAVAILABLE body is still terminal (correction #1)`);
  }

  section('K5 ambiguous fetch rejection: visible, never retried');
  {
    const h = makeDeps([new Error('socket hang up mid-flight')]);
    const code = await runVideoScout(ARGS, h.deps);
    assert(code === 1 && h.calls.length === 1 && h.sleeps.length === 0, 'a rejected fetch gets no second attempt');
    assert(h.errs.some((l) => l.includes('network error (ambiguous — not retried)')), 'the ambiguity is stated visibly');
  }

  section('K5 malformed JSON on a 503 does not disable status-based retry');
  {
    const h = makeDeps([resp(503, null, { malformed: true }), resp(200, SUCCESS_BODY)]);
    const code = await runVideoScout(ARGS, h.deps);
    assert(code === 0 && h.calls.length === 2, 'a 503 whose body fails to parse still retries on the status');
  }

  section('K5 empty SUCCESS response is terminal (asking again could only duplicate cost)');
  {
    const h = makeDeps([resp(200, { candidates: [{ content: { parts: [] }, finishReason: 'SAFETY' }] }), resp(200, SUCCESS_BODY)]);
    const code = await runVideoScout(ARGS, h.deps);
    assert(code === 1 && h.calls.length === 1, 'empty success: one request, exit 1, no retry');
    assert(h.errs.some((l) => l.includes('empty response')), 'and it is visible');
  }

  section('K5 diagnostics hygiene: key and prompt never enter logs');
  {
    const h = makeDeps([resp(503, U503), resp(503, U503), resp(503, U503)]);
    await runVideoScout(ARGS, h.deps);
    const everything = h.logs.concat(h.errs).join('\n');
    assert(!everything.includes('SECRET-KEY-123'), 'the API key appears in no log or error line');
    assert(!everything.includes('SECRET-PROMPT-XYZ'), 'the prompt appears in no log or error line');
    assert(h.calls.every((c) => c.headers['x-goog-api-key'] === 'SECRET-KEY-123'), '(the key still reaches the request header, its only legitimate destination)');
  }

  section('K5 validation failures return 1 without any network attempt');
  {
    const h = makeDeps([]);
    const noKey = { ...h.deps, env: {} };
    assert((await runVideoScout(ARGS, noKey)) === 1 && h.calls.length === 0, 'missing GEMINI_API_KEY: return 1, zero fetches');
    assert((await runVideoScout(['--prompt-text', 'p'], h.deps)) === 1 && h.calls.length === 0, 'missing --url: return 1, zero fetches');
    assert((await runVideoScout(['--url', 'u'], h.deps)) === 1 && h.calls.length === 0, 'missing prompt: return 1, zero fetches');
    assert((await runVideoScout(['--url', 'u', '--prompt-text', 'p', '--start-offset', '9'], h.deps)) === 1 && h.calls.length === 0,
      'slice refusal: return 1, zero fetches (guards unchanged)');
  }

  section('K5 no forced exit in production source');
  {
    const src = fs.readFileSync(path.join(__dirname, 'gemini-video-sdk.js'), 'utf8');
    // Strip //-comment tails first: the shutdown-contract COMMENTS mention process.exit() by
    // name; the check is that no executable code calls it. Split on \r?\n — on a CRLF
    // checkout (git autocrlf materializes CRLF on fresh worktrees) a plain '\n' split leaves
    // a trailing \r on every line, and JS '$' will not match before '\r', so the comment
    // strip silently no-ops and the comments themselves trip the regex.
    const codeOnly = src.split(/\r?\n/).map((l) => l.replace(/\/\/.*$/, '')).join('\n');
    assert(!/process\.exit\s*\(/.test(codeOnly), 'gemini-video-sdk.js contains no process.exit( in executable code');
    assert(/if \(require\.main === module\) runCliEntry\(\);/.test(src), 'require.main invokes the exported runCliEntry adapter (same one the child fixture calls)');
  }

  section('K5 runCliEntry adapter: sets process.exitCode, catches unexpected throws');
  {
    const savedArgv = process.argv;
    const savedExitCode = process.exitCode;
    try {
      process.argv = ['node', 'gemini-video-sdk.js', ...ARGS];
      const ok = makeDeps([resp(200, SUCCESS_BODY)]);
      await runCliEntry(ok.deps);
      assert(process.exitCode === 0, 'adapter writes exitCode 0 from a successful run');
      process.exitCode = undefined;
      const fail = makeDeps([resp(503, U503), resp(503, U503), resp(503, U503)]);
      await runCliEntry(fail.deps);
      assert(process.exitCode === 1, 'adapter writes exitCode 1 from a failed run');
      process.exitCode = undefined;
      // Force an unexpected throw OUTSIDE the operation's own handling: a log sink that dies.
      const boom = makeDeps([resp(200, SUCCESS_BODY)]);
      boom.deps.log = () => { throw new Error('log sink exploded'); };
      const errs = [];
      boom.deps.logError = (l) => errs.push(String(l));
      await runCliEntry(boom.deps);
      assert(process.exitCode === 1, 'an unexpected top-level throw still ends with exitCode 1 (no forced kill)');
      assert(errs.some((l) => l.includes('[video-scout sdk] unexpected failure:')), 'and is reported visibly through the single catch');
    } finally {
      process.argv = savedArgv;
      process.exitCode = savedExitCode;
    }
  }

  // ── child-process fixture: the REAL adapter + REAL sleeps + natural shutdown ─────────
  section('K5 child-process fixture: natural shutdown, no native assertion');
  {
    const counters = new Map();
    const server = http.createServer((req, res) => {
      const n = (counters.get(req.url) || 0) + 1;
      counters.set(req.url, n);
      const fail503 = req.url.startsWith('/always-503') ? Infinity : (req.url.startsWith('/flaky-2') ? 2 : 0);
      if (n <= fail503) {
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(U503));
      } else {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(SUCCESS_BODY));
      }
    });
    const port = await new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));
    const runChild = (fixturePath) => new Promise((resolve) => {
      const t0 = Date.now();
      execFile(process.execPath, [path.join(__dirname, 'test-fixtures', 'gemini-sdk-child.js'), ...ARGS], {
        env: { ...process.env, GEMINI_API_KEY: 'dummy-child-key', K5_FIXTURE_PORT: String(port), K5_FIXTURE_PATH: fixturePath },
        timeout: 60000,
      }, (err, stdout, stderr) => {
        resolve({ code: err ? err.code : 0, stdout: String(stdout), stderr: String(stderr), ms: Date.now() - t0 });
      });
    });

    const failRun = await runChild('/always-503');
    assert(failRun.code === 1, 'always-503 child exits with code 1 (clean, natural shutdown)');
    assert(!/Assertion failed|UV_HANDLE_CLOSING/i.test(failRun.stderr + failRun.stdout),
      'always-503 child output contains neither "Assertion failed" nor "UV_HANDLE_CLOSING"');
    assert(counters.get('/always-503') === 3, 'always-503 child submitted exactly three requests');
    assert(/giving up after 3 attempts/.test(failRun.stderr), 'child reports the visible give-up line');
    assert(!failRun.stdout.includes('[video-scout usage]'), 'a fully-failed child prints no usage line');

    const okRun = await runChild('/flaky-2');
    assert(okRun.code === 0, '503,503,success child exits 0 through the real adapter');
    assert(okRun.ms < 30000, 'and does so without hanging (bounded wall time)');
    assert(counters.get('/flaky-2') === 3, 'flaky child submitted exactly three requests');
    assert((okRun.stdout.match(/\[video-scout usage\]/g) || []).length === 1, 'recovered child prints the usage line exactly once');
    assert(okRun.stdout.includes('recovered on attempt 3/3'), 'recovered child names the winning attempt');
    assert(!/Assertion failed|UV_HANDLE_CLOSING/i.test(okRun.stderr + okRun.stdout), 'recovered child output is assertion-free');

    server.close();
  }

  process.stdout.write(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
})();
