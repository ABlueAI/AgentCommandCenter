'use strict';
// K5 child-process fixture harness (test-only; nothing in production invokes this).
// It calls the REAL exported production entry adapter — runCliEntry — with exactly one
// injected dependency: a fetchImpl that sends the request to the local test fixture server
// instead of the real Gemini endpoint. Argv parsing, the retry loop, REAL backoff sleeps,
// and the natural-shutdown contract (process.exitCode, event-loop drain, no process.exit)
// are all the production code path, so what these child runs prove is what production does.
// Endpoint injection stays internal to test code: production exposes no env var or flag
// that can redirect the Gemini endpoint.
const { runCliEntry } = require('../gemini-video-sdk');

const port = process.env.K5_FIXTURE_PORT;
const fixturePath = process.env.K5_FIXTURE_PATH || '/';
if (!port) {
  console.error('K5 fixture harness: K5_FIXTURE_PORT is not set');
  process.exitCode = 2;
} else {
  runCliEntry({
    fetchImpl: (_url, opts) => fetch(`http://127.0.0.1:${port}${fixturePath}`, opts),
  });
}
