'use strict';
// V3b follow-up child-process fixture harness (test-only; nothing in production invokes this).
// Same pattern as gemini-sdk-child.js: it calls the REAL exported production entry adapter —
// runFollowupCliEntry — with exactly one injected dependency: a fetchImpl that sends the request
// to the local test fixture server instead of the real Gemini endpoint. stdin parsing, payload
// validation, the SHARED K5 transport with REAL backoff sleeps, the single-JSON-emit contract,
// and natural shutdown are all the production code path. Endpoint injection stays internal to
// test code: production exposes no env var or flag that can redirect the Gemini endpoint.
const { runFollowupCliEntry } = require('../gemini-followup');

const port = process.env.V3B_FIXTURE_PORT;
const fixturePath = process.env.V3B_FIXTURE_PATH || '/';
if (!port) {
  console.error('V3b fixture harness: V3B_FIXTURE_PORT is not set');
  process.exitCode = 2;
} else {
  runFollowupCliEntry({
    fetchImpl: (_url, opts) => fetch(`http://127.0.0.1:${port}${fixturePath}`, opts),
  });
}
