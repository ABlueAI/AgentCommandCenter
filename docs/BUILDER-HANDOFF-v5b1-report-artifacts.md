# Builder Handoff — V5b1 Report Artifacts and Main-Owned Run Identity

Branch: `feature/v5b1-report-artifacts`
Fork-point / pre-merge main SHA: `23dc9d513c3a53a9c94d552a2b8e415ba9b89ba2` (verified equal on
`main` and `origin/main` before branching; baseline gates app 875/0, Pester 275/0/0)
Tip SHA: implementation `eaaae5f`; Reviewer LOW-1 parity fix `3be32f2`; docs verdict `8cc21c1`;
content-acceptance delta (FAIL 1 + FAIL 2) `a7d524f`; content-acceptance delta (FAIL 3 —
`update_topic` preamble) `c28123f` (current tip); this docs commit sits on top
Merge commit SHA: Pending human approval

Prior reviewed tip (before the FAIL-3 correction): `92cacb3`. New reviewed tip after this correction:
`c28123f`. This is the ROOT of the V5 stack content-acceptance correction; V5b2/V5c1/V5c2a inherit it
by restack (rebase --onto), not by independent duplication — see each descendant handoff's updated tip
chain.

Tier: STANDARD-CLASS — create-only report persistence inside a newly created, fixed-root run
directory, plus main-owned run identity. Recoverable and non-destructive. No renderer→filesystem
read boundary (that is V5b2, Full-class), no deletion, no OS dispatch, no credential/permission
changes, no paid-request or cost-guard changes.

Invariant: a successful future app-launched Video Scout run has a main-issued run ID, a bounded
atomically written report, and a completed manifest pointing to that report. A failed, refused,
interrupted, or incomplete run has no manifest report pointer.

## Prerequisite fact (recorded before implementation)

The real downloads directory holds **23 schema-valid manifests with 0 non-null `reportFile`
values**. Those runs remain metadata-only forever (`No report was persisted for this run.`). V5b1
does NOT parse terminal output, application logs, paths, or prior PTY history to reconstruct them —
that would recreate the P9 untrusted-output parser and fabricate history. A null `reportFile` stays
valid, which is exactly what keeps all 23 visible as honest metadata-only records.

## What shipped

- **`app/video-scout-run-id.js` (new, pure)** — `generateRunId({now,pid,randomHex})` produces
  `run-<yyyyMMdd-HHmmss-fff>-<PID>-<8 lowercase hex>` from injectable time/PID/randomness;
  `isValidRunId` is the anchored shape gate (shared regex with PowerShell); `createRunIdRegistry`
  is the pane→runId Map wrapper. The four negative rules live here and in main.js.
- **`app/main.js`** — in `pty-start`'s videoScout branch, MAIN generates the run ID and pushes it as
  a discrete `-RunId` argument; it never reads a run ID from `opts` and never returns it to the
  renderer (`pty-start` still returns only `{ ok }`). `videoScoutRunIds` (the registry) is set after
  a successful spawn, is NOT removed in `p.onExit` (survives PTY exit), is removed in `pty-kill`
  (explicit pane close), and cleared in `window-all-closed` (window shutdown).
- **`scripts/lib/get-video-scout-run-dir.ps1`** — `Test-VideoScoutRunId` (pure, `-cmatch` so the
  hex must be lowercase) and `New-VideoScoutRunDirFromId` (validate → refuse collision → create as a
  direct child of the fixed base, verified via .NET path APIs). `New-VideoScoutRunDir` (the
  PowerShell-generated fallback for direct standalone script use) is unchanged.
- **`scripts/lib/write-video-scout-manifest.ps1`** — `Initialize-VideoScoutRun` gains optional
  `-RunId`: when passed, the run dir is created from the validated ID; when omitted, the fallback
  applies (byte-compatible shape).
- **`scripts/lib/get-bounded-report.ps1` (new, pure)** — the bounded STREAMING collector:
  `New-BoundedReportCollector` / `Add-BoundedReportLine` / `Complete-BoundedReport`. Caps at
  1,000,000 UTF-16 units, keeps the beginning, reserves room for + appends a truncation marker
  inside the cap, is surrogate-safe at the cut, counts total numerically (a running `[long]`), and
  slices a single enormous line immediately rather than buffering it whole.
- **`scripts/lib/write-video-scout-report.ps1` (new)** — the create-only atomic report writer for
  the constant `analysis-output.txt`: refuse if it exists, write a unique temp inside the run dir,
  atomic `[IO.File]::Move` rename (throws if the target exists — no overwrite, no copy fallback),
  clean the temp on any failure, UTF-8 without BOM.
- **`scripts/lib/video-scout-manifest-schema.ps1`** — the single shared validator now enforces that
  a non-null `reportFile` is a bounded leaf filename (no separators, traversal, drive/UNC prefix,
  control chars, or bidi controls), uses an approved plain-text extension (`.txt`), and is permitted
  only with `outcome:"completed"`. Null stays valid for every other case. No second schema/validator.
- **`scripts/feed-gemini.ps1`** — `-RunId` param threaded into both `Initialize-VideoScoutRun` calls.
  Both routes replace the old unbounded `Tee-Object -Variable` capture with the bounded streaming
  collector (every line still re-emitted to the pane; the SDK usage line captured separately, one
  bounded line). On a clean exit only: finalize bounded text → write+rename report → complete
  manifest with `-ReportFile`. Empty clean output → error, no report. Nonzero exit / refusal /
  exception → no report, `reportFile` null. Report-write failure before rename → the terminal catch
  finalizes error with `reportFile` null. K5 retry behavior untouched; SDK request bodies/params/
  retry/usage/cost guards unchanged; native CLI exit code preserved across the ForEach-Object pipe.

## Route wiring (both production routes)

- **SDK route:** request body, Gemini parameters, retry count/classification/delays, usage
  semantics, and cost-direction guards are all unchanged. stdout still streams to the pane; only the
  bounded report collector and the one bounded usage line are retained (never the whole stream). The
  report is committed only after SDK exit code 0.
- **CLI route:** both the direct `node gemini.js` path and the fallback Gemini shim are wrapped by
  the collector. Terminal streaming preserved; the native process exit code is preserved across the
  collector pipeline (`$LASTEXITCODE` is set by the native exe, not changed by `ForEach-Object`). The
  report is committed only after exit code 0.

## Tests (real exported helpers)

- `app/video-scout-run-id.test.js` (24) — format, deterministic injected time/PID/randomness,
  uniqueness, generator rejects bad PID/hex, `isValidRunId` negatives (separators/traversal/rooted/
  malformed stamp+PID+suffix/over-length/non-string), registry survives PTY exit + removed on close,
  and static main.js wiring for all four negative rules + the registry lifecycle. Wired into
  `app/package.json`.
- `scripts/lib/get-bounded-report.Tests.ps1` — empty/ordinary/multiline/Unicode/HTML-like content,
  limit−1 / exact / limit+1, surrogate pair crossing the boundary, beginning-retained + marker,
  single-enormous-line immediate slice, bounded retained memory as total grows, counts-only result.
- `scripts/lib/write-video-scout-report.Tests.ps1` — UTF-8 no BOM, temp+final in the same run dir,
  create-only refusal, blocked-rename temp cleanup, no copy fallback, missing run dir refusal.
- `scripts/lib/get-video-scout-run-dir.Tests.ps1` — `Test-VideoScoutRunId` matrix + create-from-id
  direct-child / invalid-refusal / collision-refusal.
- `scripts/lib/video-scout-manifest-schema.Tests.ps1` — `reportFile` null-valid-anywhere, completed
  + `analysis-output.txt` accepted, non-null on refused/error/null rejected, path/traversal/drive/
  bad-ext/control/over-length rejected, backfill non-null rejected.
- `scripts/feed-gemini-report-lifecycle.Tests.ps1` (behavioral, stubbed node/gemini/yt-dlp, no
  network) — SDK success (report first + completed pointer + run dir == main-issued ID), K5 retry→
  success (one report, retry stderr not persisted), K5 exhausted/nonzero exit (no report, null
  pointer), empty clean output (error, no report), guard refusal (refused, no report), CLI fallback
  success, CLI direct success, CLI nonzero exit, report-persistence failure (error, null pointer,
  crash truth), and source-scope atomic-ordering guards.
- Reachability: the app meta-test gates the new JS suite; `run-pester.ps1` auto-discovers every new
  `*.Tests.ps1` under `scripts/` and the PS reachability meta-test covers them.

## Commands run and exact results (this tree)

- Baseline (fresh worktree at `23dc9d5`): app **875 passed / 0 failed**, Pester **275/0/0** — exactly
  as the work order expected.
- After implementation: app **899 passed / 0 failed** (875 + 24 run-id), Pester **333/0/0** (275 +
  58 new).
- Real-renderer boot proof: the acceptance build launches to the
  `Blue Helm — V5B1 REPORT ACCEPTANCE 2026-07-18.9` title with zero uncaught console errors.
- No real Gemini request and no real video download were made during implementation/testing.

## Known limitations / honest notes

- The persisted report is the verbatim bounded provider stdout. On the SDK route that includes the
  few short `[video-scout sdk] …` operational lines and the trailing `[video-scout usage]` line
  ahead of/after the analysis (they are part of the run's own stdout); the leading TLDR still leads
  the analysis. The CLI route captures only the model's analysis. No route-conditional filtering is
  applied (deliberately — no fragile stdout parsing).
- "Empty clean output → error" is detected by an empty/whitespace bounded report. The real SDK
  returns non-zero on an empty response, so its empty case is already handled by the exit code; the
  whitespace check is the CLI-route and defensive backstop.

## Live acceptance procedure (human-initiated; marker `V5B1 REPORT ACCEPTANCE 2026-07-18.9`)

The worktree build is left running (window title carries the marker; Desktop shortcut untouched;
verify the process command line points at `.worktrees\v5b1-report-artifacts\app`).
1. Run one short captioned video in transcript mode using Flash-Lite (a paid run).
2. Confirm analysis still streams normally in the pane.
3. Confirm the new run directory contains `manifest.json` AND `analysis-output.txt`.
4. Confirm the report contains the analysis and the leading TLDR.
5. Confirm manifest `outcome` is `completed`.
6. Confirm manifest `reportFile` is exactly `analysis-output.txt`.
7. Confirm the run directory name equals the main-issued manifest `runId`.
8. Run one free duration-guard refusal (e.g. a >90-min video in video mode) and confirm `outcome` is
   `refused`, `reportFile` is null, and no `analysis-output.txt` exists.
9. Confirm report text never appears in the Logs tab (only run ID / counts / `truncated=true`).

## Content-acceptance delta (FAIL 1 + FAIL 2, commit `a7d524f`)

Live acceptance of the report lifecycle PASSED (run dir == manifest.runId, outcome completed,
reportFile `analysis-output.txt`, UTF-8 without BOM). Two CONTENT defects blocked merge; the
lifecycle itself was not touched (report cap/collector, atomic report-before-manifest ordering,
main-issued run IDs, manifest lifecycle, Gemini parameters, K5 retries/cost guards, and refusal
behavior are all unchanged).

**FAIL 1 - no TL;DR.** The saved report led with `1. KEY POINTS` because `prompts/transcript-analysis.md`
defined only KEY POINTS / TIMESTAMP MAP / RECOMMENDED RANGES (the TL;DR contract had lived only in
the full-video prompt). Fix: added an exact report-leading `## 1. TL;DR` section requiring a concise,
evidence-grounded summary with at least one caption-derived timestamp when reliable timestamps exist,
and renumbered the rest to `## 2. KEY POINTS`, `## 3. TIMESTAMP MAP`, `## 4. RECOMMENDED RANGES`.
Every 9c timestamp-honesty and range requirement is preserved verbatim; an explicit `-Prompt` remains
a complete override (it never reaches the default-brief branch). `get-transcript-prompt.Tests.ps1`
now asserts the four exact numbered headers, the TL;DR contract phrases, and that TL;DR precedes every
other section BOTH in the file and AFTER `Get-CliSafePrompt` flattening (the wiring proof).

**FAIL 2 - native-output encoding corruption.** The persisted timestamp separators showed
`U+0393 U+00C7 U+00F4` instead of `U+2013`. Root cause: Windows PowerShell 5.1 decodes a native
process's stdout bytes using `[Console]::OutputEncoding`, which in the app PTY is the legacy OEM
console code page (CP437 on a US install); UTF-8 en-dash bytes `E2 80 93` decoded as CP437 are exactly
`U+0393 U+00C7 U+00F4`. **Proven, not guessed:** a disposable probe over the real PS 5.1 -> node
stdout -> production bounded-collector path showed (a) forcing CP437 reproduces the exact live
mojibake and (b) scoping `[Console]::OutputEncoding` to UTF-8 (no BOM) around the capture yields the
exact `U+2013`/`U+2014` code points in both the persisted report and the live pane stream. Fix:
`scripts/lib/get-native-output-encoding.ps1` (`New-NativeOutputEncoding`, single source of truth for
the UTF-8-no-BOM encoding), applied in `feed-gemini.ps1` around BOTH native captures - the SDK route
(`& node gemini-video-sdk.js`) and the CLI route (both the direct `node gemini.js` sub-path and the
shim fallback) - as a scoped set with the previous value restored in a `finally` (covers throws AND
nonzero exits; never a process-wide change). This is a correct decode at the boundary, NOT a
mojibake-replacement parser.

Execution test `scripts/lib/native-output-encoding.Tests.ps1` runs REAL node under a forced CP437
console through the production collector + create-only writer, reads the persisted file back, and
asserts: the exact `U+2013`/`U+2014` code points and their raw UTF-8 bytes (`E2 80 93` / `E2 80 94`),
UTF-8 without BOM, the streamed lines carry the correct code points, and the previous (OEM) encoding
is restored after the scoped block. A control case (no fix, CP437) reproduces the mojibake so a
dropped fix fails the suite, plus source-scope guards over `feed-gemini.ps1` (helper dot-sourced;
UTF-8 scoping present around both captures; restore in finally on both routes; encoding set before the
SDK `node` invocation). Both new PS suites are auto-discovered by `run-pester.ps1` and covered by the
reachability meta-test.

Delta gates (this tree): app **899 passed / 0 failed** (unchanged - no JS test added/removed); Pester
**347 passed / 0 failed / 0 skipped** (baseline 334 + 13 new: 4 transcript-prompt, 9 native-output).
No real Gemini request and no real video download during implementation/testing.

Marker bumped to `V5B1 CONTENT ACCEPTANCE 2026-07-18.10` (app.js `ACCEPTANCE_BUILD`, the Terminals
bar span in index.html, and the `pane-maximize.test.js` pin).

### Content-acceptance retest (human-initiated; marker `V5B1 CONTENT ACCEPTANCE 2026-07-18.10`)

Only ONE short transcript run is needed (the duration-refusal test already passed under the .9 marker
and does not need repeating). Verify the process command line points at
`.worktrees\v5b1-report-artifacts\app`, then run one short captioned video in transcript mode. PASS
requires:
1. The saved `analysis-output.txt` starts with `## 1. TL;DR`.
2. The TL;DR contains an honest caption-derived timestamp.
3. Timestamp separators display correctly as en/em dashes, with no `Γ`-style mojibake anywhere.
4. Manifest/report linkage is unchanged: `outcome: completed`, `reportFile: analysis-output.txt`.

## Review-diff rule

- Pinned diff: `git diff --output=.agent-review-v5b1-report-artifacts.diff 23dc9d5...<tip>`
  (three-dot from the recorded baseline; `--output`, never PowerShell `>`).
- Retain the literal `VERDICT: PASS|FAIL` line and identify the review that produced it.

Reviewer verdict: `VERDICT: PASS`

Reviewer verdict source: Standard-class read-only Reviewer pass (fresh subagent), July 18,
2026, over the pinned whole diff `.agent-review-v5b1-report-artifacts.diff` (`23dc5...eaaae5f`)
plus worktree source. All eight mandated focus areas confirmed by reading: main-issued identity +
renderer exclusion (generated in main, discrete `-RunId`, never from opts/path/terminal output,
not returned to renderer; registry survives PTY exit, removed on close/shutdown); fixed-root
direct-child creation with collision refusal + preserved fallback; the bounded surrogate-safe
streaming collector (never accumulates the stream, counts-only diagnostics); clean-exit-only
persistence; create-only atomic report-before-manifest ordering (UTF-8 no BOM, no copy fallback);
partial-success + crash truth (never a manifest pointing at a temp/partial/missing/failed report);
single shared validator with the completed-only non-null `reportFile` rule (null valid for the 23
historical manifests); and `gemini-video-sdk.js` untouched (no K5/request/cost-guard change — only
the capture mechanism). One LOW and one INFO, both non-blocking. LOW-1 (the PS validator used `\d`
= Unicode digit category vs the JS generator's ASCII `0-9`) — FIXED in `3be32f2` (anchored to
`[0-9]`, +1 proof test rejecting a Unicode digit) and confirmed by a scoped delta review,
`VERDICT: PASS`, no regression. INFO (the truncation-marker fits only when the limit exceeds the
marker reserve) — a theoretical sub-~124-char-limit edge; the production limit is 1,000,000.

Content-acceptance delta verdict: `VERDICT: PASS`

Content-acceptance delta verdict source: Standard-class read-only scoped delta Reviewer pass (fresh
subagent), July 18, 2026, over the pinned scoped diff `8cc21c1...a7d524f` (the content-acceptance
delta only) plus worktree source. All twelve mandated focus points confirmed by reading — FAIL 1:
exact four numbered headers `## 1. TL;DR`/`## 2. KEY POINTS`/`## 3. TIMESTAMP MAP`/
`## 4. RECOMMENDED RANGES` in order; evidence-grounded TL;DR requiring a caption-derived timestamp
when reliable and an honest fallback when not; all 9c honesty/range rules preserved; no double quotes;
explicit `-Prompt` still a full override; TL;DR precedes every section AFTER `Get-CliSafePrompt`
flattening. FAIL 2: correct decode at the native boundary (UTF-8 no-BOM scoped `[Console]::OutputEncoding`,
not a mojibake parser) applied around BOTH native captures (SDK + CLI direct and shim), always restored
in `finally` (throws + nonzero exits, never process-wide); UTF-8 no BOM preserved; the execution test
runs real node under a forced CP437 console through the production collector + writer and asserts the
exact `U+2013`/`U+2014` code points and raw bytes, with a control case that reproduces the mojibake;
`$usageLine`/`$sdkExit`/`$feedExit` scope-safe (the `ForEach-Object` stays in the caller scope).
Scope preservation confirmed unchanged (cap/collector, atomic ordering, run IDs, manifest lifecycle,
Gemini params, K5/cost guards, refusal). Delta touches only the 8 pinned files. No CRITICAL/HIGH/
MEDIUM/LOW findings.

## Content-acceptance delta — FAIL 3 (`update_topic` report preamble) — commit `c28123f`

Root cause: the installed Gemini CLI (0.49.0) ships a built-in `update_topic` tool + system
instructions that encourage agentic-orchestration chatter during complex tasks. On the `.12` headless
transcript run the model emitted an `update_topic(...)` block as genuine provider stdout AHEAD of
`## 1. TL;DR`. The V5b1 collector correctly persisted stdout verbatim, so the fix is at the SOURCE (a
Gemini CLI tool-deny), never a collector-side parser/filter.

Fix: (1) new tracked policy `scripts/config/video-scout-gemini-policy.toml` — exactly one GLOBAL
headless deny for `update_topic` (`[[rule]]` toolName/decision=deny/priority=999/interactive=false, no
per-argument matcher), excluding the tool from the model's headless tool memory; it does not touch
`~/.gemini` or interactive use. (2) new resolver `scripts/lib/get-video-scout-gemini-policy.ps1`
(`Get-VideoScoutGeminiPolicyPath`) — param-less, derives an ABSOLUTE repository-owned path from its own
`$PSScriptRoot`, fail-closed if missing; never renderer/manifest/terminal/user supplied. (3)
`feed-gemini.ps1` passes `--policy <path>` on BOTH CLI sub-paths (direct node `gemini.js` + fallback
shim), all CLI modes, default/custom prompts; SDK route untouched (the API route has no such built-in).
(4) `prompts/transcript-analysis.md` gains an output contract (defense in depth) requiring the model's
EMITTED output to begin with the literal `## 1. TL;DR` and forbidding planning/commentary/topic
updates/tool-call syntax/preambles. No change to model/request-count/retries/usage/cost/encoding/atomic
ordering/manifests; the collector stays verbatim.

Proven (no paid request): the installed Gemini CLI 0.49.0's `--policy` flag loads + parses the tracked
TOML at startup (valid → exits clean; a deliberately malformed policy → `Policy file error … TOML
parsing failed`) — verified via `--list-extensions`, no model request. Tests (+22): policy content
(one headless `update_topic` deny, no argsPattern), resolver path-ownership (param-less/absolute/
repo-owned/fail-closed), a skipped-if-absent CLI-accept proof, `--policy` passed on direct+fallback ×
transcript/audio/video × custom prompt and NOT on the SDK route, the emitted-report `## 1. TL;DR`
contract + preamble forbiddance, and the bounded collector retaining an `update_topic(...)` fixture
byte-for-byte.

Gates: prior reviewed tip `92cacb3` app 899/0 Pester 347/0/0 → after `c28123f` app 899/0 (JS
untouched) Pester 369/0/0 (+22). Pinned FAIL-3 scoped diff `92cacb3...c28123f`
(`.agent-review-v5b1-fail3-update-topic.diff`).

FAIL-3 scoped Reviewer verdict: `VERDICT: PASS`

Source: Standard-class read-only scoped Reviewer pass (fresh subagent), July 21, 2026, over the pinned
`92cacb3...c28123f` diff plus worktree source. All seven mandated focus areas confirmed: policy
correctness (one global headless `update_topic` deny, no argsPattern, priority 999); invocation wiring
(`--policy $policyPath` on BOTH the direct-node and fallback-shim sub-paths, mode/prompt-independent,
absolute + CWD-independent under Push-Location); fixed policy-path ownership (param-less resolver from
`$PSScriptRoot`, absolute, fail-closed, never caller/renderer/manifest/terminal supplied); NO output
parser/filter (collector verbatim; `update_topic(...)` fixture retained byte-for-byte); no request/
retry/cost/encoding/ordering/manifest change; SDK route unaffected (no `--policy` on `@sdkArgs`); and
self-contained for clean restack. Two LOW/informational, non-blocking, no change requested: (a) the
schema's runtime effectiveness depends on the installed CLI — guarded by the conditional CLI-accept
smoke test (which runs where gemini is installed, as here); (b) the fail-closed resolver test asserts
via source-grep rather than a functional missing-file path (test-only). Left as-is per precedent.
