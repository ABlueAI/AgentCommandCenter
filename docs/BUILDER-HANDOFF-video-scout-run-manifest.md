# Builder Handoff

Branch: `feature/video-scout-run-manifest`
Fork-point SHA: `efd76f8bf8c86548c1479cd3e2852d49cce36317`
Pre-merge main SHA: `efd76f8` (main at handoff time == fork point; RE-RECORD at the merge gate if main moves first)
Tip SHA: `b5580fa1d900ee77431a7d62f26fa394f4994805` holds the ENTIRE runtime delta; one docs-only
commit (this handoff file) sits on top of it — verify the branch tip at gate time with
`git rev-parse feature/video-scout-run-manifest`.
Merge commit SHA: Pending until merge

Intended invariant:

Once an accepted Video Scout launch creates a run directory, that directory contains a valid,
versioned JSON manifest (`manifest.json`, schemaVersion 1). The manifest is updated atomically
(same-directory temp file + rename-class swap; a partially written JSON file is never observable)
and truthfully reflects the terminal result: `completed`, `refused` (our own guards declined), or
`error` — with a sanitized reason for refused/error. A run killed mid-flight leaves
`outcome=null` + `finishedAt=null` (honest "never finalized", never a fabricated success).
Launches refused before acceptance (offset pairing/order/route validation, renderer-only
failures) create no run directory and no manifest. Failure to maintain the manifest throws
visibly; there is no copy-based fallback and no silent continue.

Files changed:

- `scripts/lib/write-video-scout-manifest.ps1` (NEW) — manifest module: `Initialize-VideoScoutRun`
  (run dir + initial manifest as one step; reuses `New-VideoScoutRunDir`, does not rebuild it),
  `Complete-VideoScoutRunManifest` (exactly-once terminal outcome), `Write-VideoScoutManifestFile`
  (atomic UTF-8-no-BOM writer), `Get-SanitizedManifestText` (single-line, capped, control/bidi
  stripped, GEMINI_API_KEY redacted), `ConvertFrom-VideoScoutUsageLine` (parses the SDK's
  machine-readable usage stdout line), `Resolve-ManifestFailureClass` (anchored refused/error
  classifier), `Get-VideoScoutManifestPath`.
- `scripts/feed-gemini.ps1` — wiring only; guards/routes/offsets/download behavior unchanged.
  SDK route: run dir + manifest now created after route validation and BEFORE the duration guard
  (the SDK route previously created NO run directory at all — its runs were unindexable); node
  stdout teed to capture the usage line; terminal try/catch finalizes refused/error and rethrows
  the original failure unchanged. CLI route: `New-VideoScoutRunDir` call replaced by
  `Initialize-VideoScoutRun` at the same point in the flow (dir-then-guard order preserved);
  the whole post-acceptance tail wrapped in one try/catch for terminal truth; `-NoFeed` download
  success = completed; missing Gemini CLI = error (console message unchanged, manifest records
  the truth); feed exit code decides completed vs error; video title best-effort from the
  yt-dlp-restricted output filename.
- `scripts/feed-gemini.Tests.ps1` — e2e harness now gives every call its own temp `-OutDir`
  (accepted SDK launches write run dirs now — tests must never write the real downloads dir),
  adds `-OmitMode`/`-NodeSucceeds` knobs and a manifest reader; new Describe covers manifest
  outcomes end-to-end through the real script. Existing assertions untouched.
- `scripts/lib/write-video-scout-manifest.Tests.ps1` (NEW) — module unit suite.

Security-sensitive surfaces touched:

- None of: IPC, PTY plumbing, credential handling, launch validators, duration-guard logic.
- New untrusted-input handling: URL/title/filenames/provider+exception text are sanitized before
  entering the manifest (C0+DEL stripped, bidi overrides stripped, one line, length-capped) and
  any literal `GEMINI_API_KEY` value is redacted. No credentials, no raw provider bodies stored.
- Failure classification is anchored to message START (`^Refusing:|^Refused by `) — templates we
  own; untrusted text appears only mid-message and cannot forge the prefix (P13 lesson applied).

Commands run:

- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\run-pester.ps1` (in the worktree)
- `npm test` (in `app\` of the worktree)

Exact test results:

- run-pester: **144 passed, 0 failed, 0 skipped (of 144)** — exit 0. Baseline before this branch
  was 105; this branch adds 39 assertions across the new module suite and the feed-gemini
  manifest e2e Describe.
- `npm test` (app side, untouched by this branch): **26+13+75+53+38 = 205 passed, 0 failed** — exit 0.

Manual verification:

- Minimal repro exercised `Initialize-VideoScoutRun` + `Complete-VideoScoutRunManifest` in a
  child `powershell -NoProfile` process (caught the PS 5.1 `$null`→`""` marshalling bug in
  `File.Replace`; fixed with `[NullString]::Value` and covered by the suite).
- No live network/paid run was made. The completed/refused/error paths are proven through the
  existing zero-network e2e harness (real script, stubbed probe subprocess + node tripwire).

Known limitations:

- `reportFile` is always null today — nothing in the repo writes analysis report files yet
  (SDK/CLI analysis text goes to stdout/pane only). The field is reserved; populating it belongs
  with V1's open-report work or V5(b). Flagged for a human decision (see below).
- `videoTitle` is null on the SDK route (no download, and the duration probe's output format was
  deliberately left untouched — extending it would touch guard machinery). CLI route records the
  yt-dlp-restricted filename base as a best-effort title.
- `usage` exists only on the SDK route (the gemini CLI emits no machine-readable usage line).
- The one-shot backfill script for pre-existing run directories mentioned in V5a's master-status
  entry is NOT in this branch — the task brief scopes this branch to the manifest invariant only
  ("the target format for later backfill"); backfill should be its own small branch/gate.
- A run killed hard (process kill, power loss) keeps `outcome=null` — by design (truthful), the
  library must render it as "never finalized", not failure or success.

Unexpected pre-existing findings:

- `feature/analysismode-failclosed` (Handoff #4 queue item ahead of V5a) is NOT merged into
  `main`; this branch is based on current `main` (`efd76f8`) without it. Both branches touch
  `feed-gemini.ps1`, so whichever merges second must rebase/re-verify (this branch's edits are in
  different regions of the file; conflict risk is low but nonzero).
- Master-status V1's interim claim that "every run's full output is already on disk in its run
  dir" was inaccurate for SDK-route runs before this branch (they created no run directory and
  wrote nothing to disk); it remains inaccurate as to analysis TEXT for all runs — only
  downloaded media (CLI route) and now the manifest are on disk. Report-first: no doc was edited.

Recommended review focus:

- The two terminal try/catch blocks in `feed-gemini.ps1`: original exceptions must always
  rethrow unchanged; a manifest-write failure during finalization must propagate (outcome
  already set in memory prevents a second finalize) — verify no path can swallow or reorder.
- Atomicity claims in `Write-VideoScoutManifestFile` (`File.Replace`/`File.Move`, same-volume
  temp, no fallback) and the locked-file test that simulates a blocked swap.
- The acceptance boundary: pre-acceptance refusals (lone offset etc.) create nothing; the
  SDK route's new dir-before-guard ordering mirrors the CLI route's existing order.
- `Resolve-ManifestFailureClass` anchoring, and whether `-NoFeed`=completed / missing-CLI=error
  are the classifications Blue wants.

Ambiguities resolved by the builder (flag if wrong):

1. SDK-route runs now create a run directory (they previously created none) — required for the
   invariant to cover the primary paid path and for usage metadata to be indexable.
2. Non-VideoScout `feed-gemini.ps1` runs also get manifests (`videoScout:false` field lets V5b
   filter) — one uniform code path instead of a conditional.
3. `-NoFeed` = completed; Gemini-CLI-missing = error; transcript-with-no-captions and upstream
   download failures = error; duration-guard and match-filter backstop = refused.
4. No backfill script and no report-file writing in this branch (single invariant).

Review diff:
`git diff efd76f8...<tip> --output=.agent-review-video-scout-run-manifest.diff` (pinned, gitignored)

Reviewer verdict:

Reviewer verdict source:

## Review-diff rule

- Before merge, use `git diff main...<tip>`.
- After merge, reproduce the reviewed delta with
  `git diff <recorded-pre-merge-main>...<tip>`.
- `git diff main...<tip>` may be empty after merge because the branch tip is
  already an ancestor of `main`.
- Always use `--output`; do not use PowerShell `>` for pinned review diffs.
- Retain the literal `VERDICT: PASS|FAIL` line and identify the review that
  produced it. A paraphrase or implied verdict is not a merge-gate verdict.
