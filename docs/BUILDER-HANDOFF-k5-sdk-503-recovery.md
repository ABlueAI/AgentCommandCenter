# Builder Handoff — K5 Gemini SDK 503 Recovery

Branch: `feature/k5-sdk-503-recovery` (independent of Tracks A and B; all three fork
from the same main — none is stacked on another)
Fork-point SHA: `d8d0931`
Pre-merge main SHA: `d8d0931` (local == origin/main, re-verified at branch time)
Tip SHA: implementation `74f42ad`; this docs-only handoff commit sits on top
Merge commit SHA: Pending human live acceptance and merge

Tier: FULL-CLASS — this changes the paid Gemini SDK request path and the number of
attempts Blue Helm may submit (cost direction), even though 503 responses ordinarily
produce no successful analysis.

Intended invariant: a Gemini 503/`UNAVAILABLE` response receives no more than three
total attempts with bounded visible backoff. If recovery fails, the SDK prints the
upstream failure, exits cleanly with code 1, and allows the manifest to record one
truthful error outcome. It never crashes, asserts inside libuv, retries forever,
duplicates successful output, or retries an ambiguous request failure.

Cost truth (approved correction #2, recorded — not claimed away):
- Maximum three submitted attempts.
- No usable analysis or usage metadata from failed attempts.
- Potential provider billing for failed attempts is UNKNOWN.
- That uncertainty is why K5 is Full-class.

Root-cause status (honest): the observed one-off native crash
(`Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)` at `src\win\async.c:94`,
immediately after the HTTP-503 stderr line whose next instruction was the old
`process.exit(1)`) is CONSISTENT with forced exit racing undici/libuv async-handle
teardown, and Node documents `process.exit()` as unsafe with pending async work. The
race did NOT reproduce in 120 bounded local fixture runs (60 IP-literal, 60 hostname/
threadpool-DNS; Node v24.18.0; forced-exit shape vs natural shape, all clean). So the
inference stays **plausible, not proven**. The fix does not depend on proof: forced
exit is removed per Node guidance, retries make 503s survivable at all, and the child
tests pin "no native assertion" on the shipped shutdown contract as a permanent
tripwire. If the assertion ever recurs post-fix, the hypothesis is disproven — reopen
K5.

Files changed (implementation commit `74f42ad`):

- `scripts/gemini-video-sdk.js` — refactor:
  - `runVideoScout(rawArgs, deps)` returns a numeric exit code; deps
    (`fetchImpl`/`sleep`/`random`/`log`/`logError`/`env`) default to Node's real
    implementations. The endpoint is built internally from the model — deliberately NO
    production env var or CLI flag can redirect it; tests inject `fetchImpl`.
  - `runCliEntry(deps)` — the ONE production entry adapter (approved correction #3):
    invokes `runVideoScout`, assigns `process.exitCode`, single top-level catch prints
    a bounded `unexpected failure` line and sets code 1, natural event-loop drain.
    `require.main === module` calls it, and the child fixture calls THIS SAME export.
  - All seven `process.exit(1)` sites converted to `return 1` under one shutdown
    contract; the previously-uncontracted `--prompt-file` read failure is now a
    visible refusal instead of an unhandled rejection.
  - Retry loop: structural `for` cap of `RETRY_MAX_ATTEMPTS = 3`; two delays of
    `1000·2^(n-1) + random()·500` ms (documented bounds 1.0–1.5 s, 2.0–2.5 s); body
    string serialized ONCE before the loop and reused byte-identical (URL, prompt,
    model, media resolution, slice offsets structurally cannot drift); duration/range
    guards untouched and not re-evaluated mid-retry.
  - Classification precedence (approved correction #1), in `classifyHttpFailure`:
    success → handled by caller, never retried · 400/401/403/404/429 → terminal even
    with a contradictory `UNAVAILABLE` body · 503 → retryable (unparseable body cannot
    disable it) · other non-success + parsed `error.status === 'UNAVAILABLE'` →
    retryable · everything else terminal. Ambiguous fetch rejections: visible, never
    retried. Empty SUCCESS: terminal (a retry could only duplicate cost).
  - Visibility: `bounded 503 retry policy active (max 3 attempts)` operational line;
    per-retry `HTTP 503 UNAVAILABLE — attempt 1/3; retrying in 1.2s`; recovery names
    the winning attempt; final failure names status + attempt + a sanitized one-line
    bounded upstream reason (control chars collapsed, 300-char cap); analysis text and
    the usage line print exactly once, only from the accepted success — failed
    attempts have no code path to a usage line. Key/prompt/body never enter
    diagnostics. Renderer markers untouched.
- `scripts/gemini-video-sdk.test.js` — 52 → **105 assertions**; every pre-K5 assertion
  preserved verbatim; new coverage is the full work-order matrix (details in the
  commit message), ending with two child-process runs through the REAL `runCliEntry`
  against a 127.0.0.1 fixture.
- `scripts/test-fixtures/gemini-sdk-child.js` (NEW, test-only) — imports and calls the
  real exported `runCliEntry` with exactly one injected dependency (a fetchImpl
  targeting the local fixture); no reimplemented shutdown logic (correction #3).
- `scripts/gemini-video-sdk-node.Tests.ps1` (NEW) — auto-discovered Pester wrapper
  running the real Node suite via `cmd /c` (native stream merge; `%ERRORLEVEL%` →
  `$LASTEXITCODE`), failing the gate on nonzero exit. Closes the pre-existing
  orphaned-suite gap (see below) WITHOUT touching `app/package.json`, keeping K5
  merge-independent of Track B.

Security-sensitive surfaces touched: the paid Gemini request path (attempt count) —
the declared K5 scope. No credentials handling changed (key still env-only, header-
only), no guards, no manifest schema, no renderer, no Track A/B files.

Commands run and exact results (this tree, `74f42ad`):

- `node scripts/gemini-video-sdk.test.js`: **105 passed, 0 failed** (exit 0).
- `powershell -ExecutionPolicy Bypass -File scripts/run-pester.ps1`:
  **220 passed, 0 failed, 0 skipped (of 220)** — baseline 216 + 4 wrapper assertions.
- `npm.cmd test` in `app/`: **529 passed, 0 failed** — unchanged, as required
  (no app-side file touched). No existing assertion disappeared anywhere.

Live paths actually tested versus mocked:

- REAL: the child-process fixture runs execute the real module, real `runCliEntry`,
  real argv parsing, REAL backoff sleeps, real Node fetch against a real (localhost)
  HTTP server, and the real natural-shutdown drain — proving exit codes 1/0, exactly
  three submitted requests, once-only usage, and assertion-free stderr end to end.
- INJECTED (unit layer): fetch responses, sleep, jitter, log sinks.
- NOT tested (by design): any real Gemini call — the human initiates the paid
  acceptance run; no manufactured upstream 503.

Manual verification: K5 worktree app launched directly (see live-acceptance section
below at gate time); renderer markers deliberately unchanged — the build is
identified by process command line + PID, not a marker.

Known limitations:

- Retry covers explicit 503/`UNAVAILABLE` only; 429/quota, general network retry,
  timeouts/AbortController, and model fallback are explicitly out of scope.
- The root-cause inference remains plausible-not-proven (recorded above).
- The final-failure line includes the total elapsed seconds across all attempts (not
  per-attempt timing) — matches the old line's semantics.

Unexpected pre-existing findings:

- `scripts/gemini-video-sdk.test.js` was an ORPHANED suite: neither `npm test` nor
  `run-pester.ps1` executed it (the exact rot run-pester exists to prevent). Fixed
  here via the wrapper as part of the mandated gate wiring, not as scope creep.

Recommended whole-diff review focus: the retry loop + classification precedence ·
the shutdown contract (`runCliEntry`, zero `process.exit`) · byte-identical body reuse ·
once-only output/usage · sanitized visibility · the child-fixture fidelity (real
adapter, internal-only endpoint injection) · absence of guard/manifest/unrelated
changes.

Review diff (whole branch vs fork point):
`git diff d8d0931...HEAD --output=.agent-review-k5-sdk-503-recovery.diff` (pinned,
gitignored)

Reviewer verdict: Pending

Reviewer verdict source: Pending

## Review-diff rule

- Before merge, the reviewed delta is `git diff d8d0931...<tip>`.
- After merge, reproduce it with `git diff d8d0931...<tip>` (recorded pre-merge main).
- Always use `--output`; never PowerShell `>` for pinned review diffs.
- Retain the literal `VERDICT: PASS|FAIL` line and identify the review that produced it.
