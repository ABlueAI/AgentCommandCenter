# Builder Handoff

Branch: `feature/video-scout-manifest-backfill`
Fork-point SHA: `25fda2d769981e8a133bb443822e87ad5e73eb8d` (main, post V5a + analysisMode merges)
Pre-merge main SHA: `25fda2d` (main at handoff time == fork point; RE-RECORD at the merge gate if main moves first)
Tip SHA: `2ba021dea0cb23a3eb474c57e96ffc202c2b503a` holds the runtime delta (plus the earlier
docs-only `54113af` backfilled-date rule and the docs-only handoff commit that follows this file) —
verify the branch tip at gate time with `git rev-parse feature/video-scout-manifest-backfill`.
Merge commit SHA: Pending until merge

Session note: this branch was started in a previous session (which delivered the shared schema
module, its test suite, the live-writer refactor onto that module, and the `54113af` docs commit,
all uncommitted except the docs) and completed in this one. Single invariant throughout.

Intended invariant:

Every legacy (pre-manifest) video-scout run directory can be indexed by a one-shot, best-effort,
CREATE-ONLY backfill that synthesizes a schemaVersion-1 BACKFILL-variant manifest recording ONLY
what the directory on disk proves — and both the live writer and the backfill build/validate
through ONE canonical schema module, so the two manifest paths cannot drift. An existing
manifest.json is never touched (idempotent; live manifests stay authoritative); each manifest is
written atomically (same-dir temp + rename-class Move that refuses to overwrite even under a
race); unprovable run facts are JSON null, never fabricated (canonical `startedAt` stays null —
the local dir-name stamp lives in `backfill.startedAtFromDirNameLocal`, explicitly approximate);
media existence never implies an outcome; per-directory failures surface visibly, the sweep
continues, and the run then fails non-zero so a partial backfill is never mistaken for complete.

Files changed:

- `scripts/lib/video-scout-manifest-schema.ps1` (NEW, prior session) — the single canonical
  schema: base skeleton (one place keys/order live), `New-VideoScoutLiveManifest`,
  `New-VideoScoutBackfillManifest` (adds the `backfill` provenance/discriminator object incl. the
  route-inference code basis pinned to pre-V5a commit `efd76f8`), shared
  `Get-SanitizedManifestText`, and variant-aware `Assert-VideoScoutManifestValid` (exact key set,
  per-variant nullability: a backfill that smuggles real run facts, or a live manifest that grows
  a `backfill` key, is rejected).
- `scripts/lib/write-video-scout-manifest.ps1` (prior session) — live writer refactored onto the
  shared module: constructor replaced by `New-VideoScoutLiveManifest`, validator runs before every
  persist. Atomicity/behavior otherwise unchanged; `Initialize-VideoScoutRun` /
  `Complete-VideoScoutRunManifest` signatures unchanged (feed-gemini.ps1 untouched).
- `scripts/lib/get-video-scout-backfill.ps1` (NEW, this session) — `Test-VideoScoutRunDirName`
  (both run-dir generations, `-cmatch` case-sensitive), `Get-BackfillRunStampLocal` (LOCAL stamp,
  no fabricated zone conversion), `Resolve-BackfillMediaClassification` (.srt/.mp3/.mp4; mode on
  exactly one media type, title on exactly one media file, unknown extensions ignored),
  `Write-VideoScoutBackfillManifestFile` (create-only atomic), `Invoke-VideoScoutBackfill` (the
  sweep: skip-existing, skip-foreign, continue-past-failures, visible end-of-run throw, -DryRun).
- `scripts/backfill-video-scout-manifests.ps1` (NEW) — thin one-shot entry point; default
  `-BaseDir` matches feed-gemini's default `-OutDir`.
- `scripts/lib/video-scout-manifest-schema.Tests.ps1` (NEW, prior session; one expectation fixed
  this session) + `scripts/lib/get-video-scout-backfill.Tests.ps1` (NEW, this session).
- `BLUE-HELM-MASTER-STATUS.md` (`54113af`, prior session) — V5b backfilled-date rendering rule.

Security-sensitive surfaces touched:

- None of: IPC, PTY plumbing, credential handling, launch validators, duration-guard logic,
  feed-gemini.ps1.
- The backfill reads directory/file NAMES only (never file contents) and writes only new
  `manifest.json` files inside run directories. Foreign directory names and exception text are
  sanitized before console echo; titles are sanitized by the shared schema constructor before
  entering a manifest. No credentials or provider data are involved anywhere on this path.
- Destructive-op posture: the utility never deletes, moves, or modifies anything (temp-file
  cleanup of its OWN temp file on a failed write is the only removal).

Commands run:

- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\run-pester.ps1` (in the worktree)
- `npm test` (in `app\` of the worktree)
- Live: `scripts\backfill-video-scout-manifests.ps1 -BaseDir <scratch>` and `-DryRun` against the
  real downloads root (see Manual verification).

Exact test results:

- run-pester: **199 passed, 0 failed, 0 skipped (of 199)** — exit 0. Composition: 144 at fork
  point + 32 schema-suite assertions (prior session) + 23 backfill assertions (this session).
- `npm test` (app side, untouched): **26+13+103+53+38 = 233 passed, 0 failed** — exit 0.
- Two pre-commit fixes this session, both test-caught: (1) schema-suite expectation for a live
  manifest growing a `backfill` key corrected to the validator's actual (correct) refusal — the
  discriminator key routes it to the backfill nullability contract, so the message is
  "must be null on a backfilled manifest", not "unknown key"; (2) run-dir name matching switched
  to `-cmatch` — PS 5.1 `-match` is case-insensitive and accepted uppercase-hex GUID suffixes
  that `New-VideoScoutRunDir` never produces.

Manual verification:

- Real child-process run of `backfill-video-scout-manifests.ps1` against a scratch legacy dir
  (single `.mp3`): exit 0, schema-valid manifest with `appliedMode=audio`, sanitized title,
  `startedAt=null`, full `backfill` provenance object (verified by reading the file back).
- `-DryRun` against the REAL `D:\Gemini_Video_Review\downloads`: **12 directories scanned,
  nothing written**, mix of would-backfill modes (transcript + unknown/empty) reported, exit 0.
  The real (writing) sweep was deliberately NOT run — that is the human's one-shot to fire after
  this branch merges.

Known limitations:

- Best-effort by design: backfilled manifests have null url/model/resolutions/offsets/usage/
  outcome — a directory cannot prove them. V5b must render `outcome=null` + `backfill` present as
  "legacy / unknown result", and date-sort via `backfill.startedAtFromDirNameLocal` per the
  `54113af` rule.
- Only directories DIRECTLY under `-BaseDir` are considered (matches how runs are laid out).
- The stamp is kept LOCAL (as `New-VideoScoutRunDir` wrote it); no UTC conversion is attempted
  (DST would make historical conversion partly fictional).
- The dual-variant validator means the LIVE writer now rejects (throws on) any future manifest
  drift at write time — new intentional live-path fields require a schema-module change first
  (that friction is the point).

Unexpected pre-existing findings:

- None beyond the two test-caught fixes above (both in this branch's own new code/tests, not in
  merged main).

Recommended review focus:

- `Assert-VideoScoutManifestValid`: the variant discrimination (presence of `backfill` key) and
  per-variant nullability tables — this is now the write-time gate for BOTH writers, so an error
  here blocks live runs, not just backfill (the schema suite's 32 assertions cover it, but it is
  the highest-leverage surface in the diff).
- Create-only guarantees in `Write-VideoScoutBackfillManifestFile` (pre-check + `File.Move`'s
  no-overwrite semantics under a race) and the sweep's continue-then-fail contract.
- The route=cli structural inference and its recorded code basis (`efd76f8` control flow) — the
  reviewer should confirm the claim that only the CLI path created run directories pre-V5a.
- Whether committing the sweep summary object shape (Scanned/Backfilled/SkippedExisting/
  SkippedForeign) is the contract V5b's library wants to consume.

Review diff:
`git diff 25fda2d...<tip> --output=.agent-review-video-scout-manifest-backfill.diff` (pinned, gitignored)

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
