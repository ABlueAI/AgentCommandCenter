# Builder Handoff — V5b1 Report Artifacts and Main-Owned Run Identity

Branch: `feature/v5b1-report-artifacts`
Fork-point / pre-merge main SHA: `23dc9d513c3a53a9c94d552a2b8e415ba9b89ba2` (verified equal on
`main` and `origin/main` before branching; baseline gates app 875/0, Pester 275/0/0)
Tip SHA: recorded below after the review commit
Merge commit SHA: Pending human approval

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

## Review-diff rule

- Pinned diff: `git diff --output=.agent-review-v5b1-report-artifacts.diff 23dc9d5...<tip>`
  (three-dot from the recorded baseline; `--output`, never PowerShell `>`).
- Retain the literal `VERDICT: PASS|FAIL` line and identify the review that produced it.

Reviewer verdict: recorded below after the Standard-class pass.
