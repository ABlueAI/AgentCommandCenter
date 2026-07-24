'use strict';
// Run: node scripts/gemini-followup.test.js
// Plain Node.js — no framework (matches gemini-video-sdk.test.js). Covers the V3b text-follow-up
// child: the text-only request body (no video/media/tool fields, follow-up-only maxOutputTokens),
// strict stdin payload validation, the SHARED K5 transport behavior (attempt cap, terminal /
// ambiguous refusals, byte-identical retry bodies, single JSON emit), the shared-loop uniqueness
// source invariant, GOLDEN behavioral-equivalence regressions for the video path (request body +
// observable attempt trace, pinning that the transport extraction changed nothing), and real
// child-process fixtures against 127.0.0.1 — no Gemini API, no credentials, no paid calls.

const fs = require('fs');
const path = require('path');
const http = require('http');
const { Readable } = require('stream');
const { execFile } = require('child_process');

const {
  buildFollowupRequestBody, validateFollowupPayload, readAllStdin, runFollowup,
  FOLLOWUP_MODEL, FOLLOWUP_MAX_OUTPUT_TOKENS, FOLLOWUP_QUESTION_MAX, FOLLOWUP_REPORT_MAX,
  FOLLOWUP_POLICY,
} = require('./gemini-followup');
const {
  buildRequestBody, runVideoScout, submitGeminiRequest, DEFAULT_MODEL, RETRY_MAX_ATTEMPTS,
} = require('./gemini-video-sdk');

let passed = 0, failed = 0;
function assert(cond, label) {
  if (cond) { process.stdout.write(`  ✓ ${label}\n`); passed++; }
  else { process.stderr.write(`  ✗ FAIL: ${label}\n`); failed++; }
}
function section(name) { process.stdout.write(`\n${name}\n`); }

// ── follow-up request body: text-only by construction ────────────────────────────────────────
section('follow-up body: text-only, policy-first, follow-up-only output cap');
{
  const b = buildFollowupRequestBody({ report: 'THE REPORT', question: 'THE QUESTION' });
  const blob = JSON.stringify(b);
  assert(b.contents.length === 1 && b.contents[0].role === 'user', 'one user turn');
  const parts = b.contents[0].parts;
  assert(parts.length === 3 && parts.every((p) => typeof p.text === 'string' && Object.keys(p).join(',') === 'text'),
    'exactly three parts, every one a pure { text } part');
  assert(parts[0].text === FOLLOWUP_POLICY, 'the answering policy is the first part');
  assert(parts[1].text.indexOf('REPORT BEGIN') === 0 && parts[1].text.indexOf('THE REPORT') !== -1, 'the report travels between BEGIN/END markers');
  assert(parts[2].text.indexOf('THE QUESTION') !== -1, 'the question is the final part');
  for (const banned of ['fileData', 'fileUri', 'videoMetadata', 'mediaResolution', 'tools',
    'functionDeclarations', 'functionCall', 'toolConfig', 'yt-dlp', 'transcript']) {
    assert(blob.indexOf(`"${banned}"`) === -1 && blob.indexOf(banned + '"') === -1,
      `the follow-up body contains no ${banned} field`);
  }
  assert(b.generationConfig && b.generationConfig.maxOutputTokens === FOLLOWUP_MAX_OUTPUT_TOKENS,
    `maxOutputTokens is fixed at ${FOLLOWUP_MAX_OUTPUT_TOKENS} on the follow-up body`);
  assert(FOLLOWUP_MAX_OUTPUT_TOKENS === 4096, 'the fixed output cap is 4096');
  assert(FOLLOWUP_POLICY.indexOf('not instructions') !== -1, 'the policy names the report as reference material, not instructions');
}
section('existing video body: unchanged, and receives NO maxOutputTokens');
{
  const vb = buildRequestBody({ url: 'https://youtu.be/x', prompt: 'p', mediaResolution: 'LOW' });
  const vblob = JSON.stringify(vb);
  assert(vblob.indexOf('maxOutputTokens') === -1, 'the video request body has no maxOutputTokens (the cap is follow-up-only)');
  assert(vb.contents[0].parts[0].fileData.fileUri === 'https://youtu.be/x', 'the video body still carries fileData.fileUri (its shape is untouched)');
}
section('fixed model');
{
  assert(FOLLOWUP_MODEL === 'gemini-2.5-flash-lite', 'the follow-up model is fixed to gemini-2.5-flash-lite');
  assert(FOLLOWUP_MODEL === DEFAULT_MODEL, '(it equals the SDK default today — pinned independently)');
}

// ── payload validation: exact keys, strict bounds, fail closed ───────────────────────────────
section('stdin payload validation');
{
  const ok = validateFollowupPayload({ report: 'r', question: 'q' });
  assert(ok && ok.report === 'r' && ok.question === 'q', 'a minimal valid payload passes');
  assert(validateFollowupPayload(null) === null, 'null refused');
  assert(validateFollowupPayload([]) === null, 'array refused');
  assert(validateFollowupPayload({ report: 'r' }) === null, 'missing question refused');
  assert(validateFollowupPayload({ report: 'r', question: 'q', extra: 1 }) === null, 'extra key refused');
  assert(validateFollowupPayload({ report: 'r', question: 42 }) === null, 'non-string question refused');
  assert(validateFollowupPayload({ report: 'r', question: '' }) === null, 'empty question refused');
  assert(validateFollowupPayload({ report: '', question: 'q' }) === null, 'empty report refused');
  assert(validateFollowupPayload({ report: 'r', question: 'x'.repeat(FOLLOWUP_QUESTION_MAX) }) !== null, 'question at exactly 2,000 units accepted');
  assert(validateFollowupPayload({ report: 'r', question: 'x'.repeat(FOLLOWUP_QUESTION_MAX + 1) }) === null, 'question over 2,000 units refused');
  assert(validateFollowupPayload({ report: 'x'.repeat(FOLLOWUP_REPORT_MAX), question: 'q' }) !== null, 'report at exactly 200,000 units accepted');
  assert(validateFollowupPayload({ report: 'x'.repeat(FOLLOWUP_REPORT_MAX + 1), question: 'q' }) === null, 'report over 200,000 units refused');
  assert(validateFollowupPayload({ report: 'r', question: 'a\x01b' }) === null, 'a C0 control char in the question refused (main normalizes first)');
  assert(validateFollowupPayload({ report: 'line1\nline2\ttab', question: 'q' }) !== null, 'newlines/tabs in the REPORT are fine (it is data)');
}

// ── runFollowup harness ──────────────────────────────────────────────────────────────────────
const SUCCESS_BODY = {
  candidates: [{ content: { parts: [{ text: 'THE ANSWER' }] }, finishReason: 'STOP' }],
  usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 20, totalTokenCount: 120 },
};
const U503 = { error: { code: 503, status: 'UNAVAILABLE', message: 'overloaded' } };
function resp(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}
function makeHarness(responses, payload) {
  const calls = []; const sleeps = []; const outs = [];
  const deps = {
    fetchImpl: async (url, opts) => { calls.push({ url, body: opts.body, headers: opts.headers }); return responses.shift(); },
    sleep: async (ms) => { sleeps.push(ms); },
    random: () => 0.4,
    env: { GEMINI_API_KEY: 'SECRET-KEY-999' },
    stdin: Readable.from([Buffer.from(typeof payload === 'string' ? payload : JSON.stringify(payload))]),
    writeOut: (s) => outs.push(s),
  };
  return { calls, sleeps, outs, deps };
}
const PAYLOAD = { report: 'SECRET-REPORT-TEXT with facts', question: 'SECRET-QUESTION what facts?' };

(async () => {
  // readAllStdin bound (async)
  {
    let rejected = false;
    try { await readAllStdin(10, Readable.from([Buffer.alloc(11)])); } catch { rejected = true; }
    assert(rejected, 'readAllStdin rejects input past its byte cap (fail closed)');
    const s = await readAllStdin(10, Readable.from([Buffer.from('hello')]));
    assert(s === 'hello', 'readAllStdin returns the full UTF-8 string within the cap');
  }

  section('runFollowup: success path');
  {
    const h = makeHarness([resp(200, SUCCESS_BODY)], PAYLOAD);
    const code = await runFollowup(h.deps);
    assert(code === 0, 'returns exit code 0');
    assert(h.calls.length === 1, 'exactly one request submitted');
    assert(h.outs.length === 1, 'exactly ONE JSON document emitted on stdout');
    const out = JSON.parse(h.outs[0]);
    assert(out.ok === true && out.answer === 'THE ANSWER', 'the answer parses out of the emitted JSON');
    assert(out.attempts === 1 && out.finishReason === 'STOP', 'attempts and finishReason are reported');
    assert(out.usage.promptTokens === 100 && out.usage.outputTokens === 20 && out.usage.totalTokens === 120, 'usage token counts parse correctly');
    assert(h.calls[0].url.indexOf(`/models/${FOLLOWUP_MODEL}:generateContent`) !== -1, 'the endpoint is built from the FIXED model');
    assert(h.calls[0].headers['x-goog-api-key'] === 'SECRET-KEY-999', 'the key travels only in the request header');
    const expectedBody = JSON.stringify(buildFollowupRequestBody(PAYLOAD));
    assert(h.calls[0].body === expectedBody, 'the submitted body is exactly the built follow-up body');
  }

  section('runFollowup: shared K5 retry behavior (one loop, same policy)');
  {
    const h = makeHarness([resp(503, U503), resp(503, U503), resp(200, SUCCESS_BODY)], PAYLOAD);
    const code = await runFollowup(h.deps);
    assert(code === 0 && h.calls.length === 3, '503,503,success: three submitted attempts, recovered');
    assert(h.sleeps.length === 2 && h.sleeps[0] === 1200 && h.sleeps[1] === 2200, 'the two bounded K5 delays are identical to the video path (1200/2200 ms at r=0.4)');
    const bodies = h.calls.map((c) => c.body);
    assert(bodies[0] === bodies[1] && bodies[1] === bodies[2], 'every retry submits the byte-identical body (serialized once)');
    assert(JSON.parse(h.outs[0]).attempts === 3, 'the emitted attempts count reflects the transport attempts');
  }
  {
    const h = makeHarness([resp(503, U503), resp(503, U503), resp(503, U503), resp(200, SUCCESS_BODY)], PAYLOAD);
    const code = await runFollowup(h.deps);
    assert(code === 1 && h.calls.length === 3, 'three 503s stop permanently at the structural three-attempt cap');
    const out = JSON.parse(h.outs[0]);
    assert(out.ok === false && out.error === 'provider-unavailable', 'exhausted retries emit the stable provider-unavailable code');
    assert(h.outs.length === 1, 'still exactly one JSON document');
  }
  {
    const h = makeHarness([resp(400, { error: { status: 'INVALID_ARGUMENT', message: 'SECRET-PROVIDER-DETAIL' } })], PAYLOAD);
    const code = await runFollowup(h.deps);
    assert(code === 1 && h.calls.length === 1 && h.sleeps.length === 0, 'a terminal status is never retried');
    const out = JSON.parse(h.outs[0]);
    assert(out.error === 'provider-terminal', 'terminal failures emit the stable provider-terminal code');
    assert(h.outs[0].indexOf('SECRET-PROVIDER-DETAIL') === -1, 'the provider message never enters the emitted JSON');
  }
  {
    const h = makeHarness([], PAYLOAD);
    h.deps.fetchImpl = async () => { throw new Error('socket hang up'); };
    const code = await runFollowup(h.deps);
    assert(code === 1, 'an ambiguous network failure exits 1');
    assert(JSON.parse(h.outs[0]).error === 'network-error', 'and emits the stable network-error code (never retried)');
  }
  {
    const h = makeHarness([resp(200, { candidates: [{ content: { parts: [] }, finishReason: 'SAFETY' }] })], PAYLOAD);
    const code = await runFollowup(h.deps);
    assert(code === 1 && JSON.parse(h.outs[0]).error === 'empty-response', 'an empty SUCCESS is terminal and emits empty-response');
  }

  section('runFollowup: validation failures produce zero network attempts');
  {
    const h = makeHarness([resp(200, SUCCESS_BODY)], PAYLOAD);
    h.deps.env = {};
    assert((await runFollowup(h.deps)) === 1 && h.calls.length === 0, 'missing GEMINI_API_KEY: exit 1, zero fetches');
    assert(JSON.parse(h.outs[0]).error === 'missing-key', 'and the stable missing-key code');
  }
  {
    const h = makeHarness([resp(200, SUCCESS_BODY)], 'this is not json');
    assert((await runFollowup(h.deps)) === 1 && h.calls.length === 0 && JSON.parse(h.outs[0]).error === 'invalid-input',
      'malformed stdin JSON: invalid-input, zero fetches');
  }
  {
    const h = makeHarness([resp(200, SUCCESS_BODY)], { report: 'x'.repeat(FOLLOWUP_REPORT_MAX + 1), question: 'q' });
    assert((await runFollowup(h.deps)) === 1 && h.calls.length === 0 && JSON.parse(h.outs[0]).error === 'invalid-input',
      'an oversized report refuses before any fetch (the child re-checks the 200k bound)');
  }
  {
    const h = makeHarness([resp(200, SUCCESS_BODY)], { report: 'r', question: 'q', runId: 'evil' });
    assert((await runFollowup(h.deps)) === 1 && h.calls.length === 0 && JSON.parse(h.outs[0]).error === 'invalid-input',
      'an extra stdin key refuses before any fetch');
  }

  section('sensitive-content hygiene: failure paths never emit the texts or key');
  {
    const h = makeHarness([resp(503, U503), resp(503, U503), resp(503, U503)], PAYLOAD);
    await runFollowup(h.deps);
    const everything = h.outs.join('\n');
    assert(everything.indexOf('SECRET-KEY-999') === -1, 'the key appears in no emitted output');
    assert(everything.indexOf('SECRET-REPORT-TEXT') === -1 && everything.indexOf('SECRET-QUESTION') === -1,
      'the report/question appear in no FAILURE output');
  }

  section('shared-loop uniqueness (source invariant)');
  {
    const sdkSrc = fs.readFileSync(path.join(__dirname, 'gemini-video-sdk.js'), 'utf8');
    const fuSrc = fs.readFileSync(path.join(__dirname, 'gemini-followup.js'), 'utf8');
    const loopRe = /for \(let attempt = 1; attempt <= RETRY_MAX_ATTEMPTS/g;
    assert((sdkSrc.match(loopRe) || []).length === 1, 'gemini-video-sdk.js contains EXACTLY ONE submitted-attempt loop');
    assert((fuSrc.match(loopRe) || []).length === 0, 'gemini-followup.js contains NO attempt loop of its own');
    assert(!/classifyHttpFailure|retryDelayMs/.test(fuSrc), 'gemini-followup.js does not re-implement or call classification/backoff directly');
    assert(/submitGeminiRequest/.test(fuSrc), 'gemini-followup.js submits ONLY through the shared transport');
    const fuCode = fuSrc.split(/\r?\n/).map((l) => l.replace(/\/\/.*$/, '')).join('\n');
    assert(!/process\.exit\s*\(/.test(fuCode), 'gemini-followup.js contains no process.exit( in executable code (K5 shutdown contract)');
    assert(!/setInterval|setTimeout/.test(fuCode), 'gemini-followup.js schedules no timers of its own (no second retry/backoff)');
  }

  section('GOLDEN video-path equivalence: request body byte-identical');
  {
    // Pinned against the pre-extraction builder output — if the video body builder or its wiring
    // ever drifts, this exact string comparison fails.
    const body = buildRequestBody({ url: 'https://youtu.be/gold', prompt: 'GOLDEN-PROMPT', mediaResolution: 'LOW', startOffset: 60, endOffset: 120 });
    const expected = '{"contents":[{"role":"user","parts":[{"fileData":{"fileUri":"https://youtu.be/gold"},"videoMetadata":{"startOffset":"60s","endOffset":"120s"}},{"text":"GOLDEN-PROMPT"}]}],"generationConfig":{"mediaResolution":"MEDIA_RESOLUTION_LOW"}}';
    assert(JSON.stringify(body) === expected, 'the sliced LOW video request body serializes to the exact pinned golden JSON');
    const whole = buildRequestBody({ url: 'https://youtu.be/gold', prompt: 'GOLDEN-PROMPT', mediaResolution: 'ULTRA' });
    assert(JSON.stringify(whole) === '{"contents":[{"role":"user","parts":[{"fileData":{"fileUri":"https://youtu.be/gold"}},{"text":"GOLDEN-PROMPT"}]}]}',
      'the whole-video unknown-resolution body serializes to the exact pinned golden JSON');
  }

  section('GOLDEN video-path equivalence: observable attempt trace through the extracted transport');
  {
    const calls = []; const sleeps = []; const logs = []; const errs = [];
    const mk = (status, body) => resp(status, body);
    const deps = {
      fetchImpl: async (url, opts) => { calls.push({ url, body: opts.body }); return [mk(503, U503), mk(503, U503), mk(200, { candidates: [{ content: { parts: [{ text: 'VIDEO OUT' }] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 1 } })][calls.length - 1]; },
      sleep: async (ms) => { sleeps.push(ms); },
      random: () => 0.4,
      log: (l) => logs.push(String(l)),
      logError: (l) => errs.push(String(l)),
      env: { GEMINI_API_KEY: 'k' },
    };
    const code = await runVideoScout(['--url', 'https://youtu.be/gold', '--prompt-text', 'GOLDEN-PROMPT', '--media-resolution', 'LOW'], deps);
    assert(code === 0, 'video 503,503,success run exits 0');
    assert(calls.length === 3 && sleeps.join(',') === '1200,2200', 'attempt trace: exactly [request, sleep 1200, request, sleep 2200, request]');
    assert(calls.every((c) => c.body === calls[0].body), 'every attempt submitted the byte-identical body');
    assert(errs.filter((l) => /attempt \d\/3; retrying/.test(l)).length === 2, 'exactly two retry log lines, with the pre-extraction format');
    assert(errs.some((l) => /HTTP 503 UNAVAILABLE — attempt 1\/3; retrying in 1\.2s/.test(l)), 'the retry line format is byte-compatible with the pre-extraction one');
    assert(logs.some((l) => l.includes('recovered on attempt 3/3')), 'the recovery line names attempt 3/3 as before');
    assert(logs.filter((l) => l.includes('[video-scout usage]')).length === 1, 'the usage line prints exactly once as before');
  }

  section('submitGeminiRequest outcome shapes (direct)');
  {
    const ok = await submitGeminiRequest({ endpoint: 'e', key: 'k', bodyJson: '{}' }, { fetchImpl: async () => resp(200, SUCCESS_BODY) });
    assert(ok.kind === 'success' && ok.attempt === 1 && ok.json === SUCCESS_BODY, 'success outcome carries json + attempt');
    const term = await submitGeminiRequest({ endpoint: 'e', key: 'k', bodyJson: '{}' }, { fetchImpl: async () => resp(404, null) });
    assert(term.kind === 'http-failure' && term.status === 404 && term.exhaustedRetries === false, 'terminal outcome carries status and exhaustedRetries=false');
    let n = 0;
    const exhausted = await submitGeminiRequest({ endpoint: 'e', key: 'k', bodyJson: '{}' },
      { fetchImpl: async () => { n++; return resp(503, U503); }, sleep: async () => { }, random: () => 0 });
    assert(exhausted.kind === 'http-failure' && exhausted.exhaustedRetries === true && n === RETRY_MAX_ATTEMPTS,
      'an exhausted 503 run reports exhaustedRetries=true after exactly the attempt cap');
    const net = await submitGeminiRequest({ endpoint: 'e', key: 'k', bodyJson: '{}' }, { fetchImpl: async () => { throw new Error('boom'); } });
    assert(net.kind === 'network-error' && net.attempt === 1, 'a thrown fetch is an ambiguous network-error on attempt 1');
  }

  // ── child-process fixtures: the REAL entry adapter + stdin piping + natural shutdown ────────
  section('child-process fixture: real follow-up child against 127.0.0.1');
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
    const runChild = (fixturePath, payload, envOverride) => new Promise((resolve) => {
      const child = execFile(process.execPath, [path.join(__dirname, 'test-fixtures', 'gemini-followup-child.js')], {
        env: Object.assign({}, process.env, { GEMINI_API_KEY: 'dummy-child-key', V3B_FIXTURE_PORT: String(port), V3B_FIXTURE_PATH: fixturePath }, envOverride || {}),
        timeout: 60000,
      }, (err, stdout, stderr) => resolve({ code: err ? err.code : 0, stdout: String(stdout), stderr: String(stderr) }));
      child.stdin.end(typeof payload === 'string' ? payload : JSON.stringify(payload));
    });

    const okRun = await runChild('/ok', PAYLOAD);
    assert(okRun.code === 0, 'success child exits 0 (natural shutdown)');
    const okOut = JSON.parse(okRun.stdout);
    assert(okOut.ok === true && okOut.answer === 'THE ANSWER', 'the child piped stdin -> provider -> ONE stdout JSON with the answer');
    assert(okRun.stderr.trim() === '', 'the success child writes NOTHING to stderr');

    const flaky = await runChild('/flaky-2', PAYLOAD);
    assert(flaky.code === 0 && JSON.parse(flaky.stdout).attempts === 3, '503,503,success child recovers with attempts=3 (real sleeps, shared transport)');
    assert(counters.get('/flaky-2') === 3, 'the flaky child submitted exactly three requests');

    const dead = await runChild('/always-503', PAYLOAD);
    assert(dead.code === 1 && JSON.parse(dead.stdout).error === 'provider-unavailable', 'always-503 child exits 1 with provider-unavailable');
    assert(counters.get('/always-503') === 3, 'always-503 child submitted exactly three requests (structural cap)');
    assert(!/Assertion failed|UV_HANDLE_CLOSING/i.test(dead.stdout + dead.stderr), 'no native assertion on the failure path (K5 shutdown contract)');

    const badInput = await runChild('/ok', 'not json at all');
    assert(badInput.code === 1 && JSON.parse(badInput.stdout).error === 'invalid-input', 'malformed stdin fails closed in the real child');
    assert(counters.get('/ok') === 1, '(and submitted no additional request — still only the earlier success)');

    server.close();
  }

  process.stdout.write(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
})();
