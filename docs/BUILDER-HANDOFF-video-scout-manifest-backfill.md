# Builder Handoff

Branch: `feature/video-scout-manifest-backfill`
Fork-point SHA: `25fda2d769981e8a133bb443822e87ad5e73eb8d` (main, post V5a + analysisMode merges)
Pre-merge main SHA: `25fda2d` (main at handoff time == fork point; RE-RECORD at the merge gate if main moves first)
Tip SHA: `81fbecf1bb9c6ba93c27acd28c904da648ec9a38`
verify the branch tip at gate time with `git rev-parse feature/video-scout-manifest-backfill`.
Merge commit SHA: Pending until merge

Session note: this branch was started in an earlier session (shared schema module + its test
suite, the live-writer refactor onto that module, and the docs-only `54113af` V5b rule), the
backfill utility itself was added in a follow-up session, and an INDEPENDENT PRE-REVIEW of that
follow-up found three blocking deviations from the approved plan — all three are fixed in this
session's commit (`81fbecf`). See "Pre-review findings and fixes" below; read it before trusting
anything the prior session's version of this doc claimed about safe-by-default or race handling.

Intended invariant:

Every legacy (pre-manifest) video-scout run directory can be indexed by a one-shot, best-effort,
CREATE-ONLY backfill that synthesizes a schemaVersion-1 BACKFILL-variant manifest recording ONLY
what the directory on disk proves — and both the live writer and the backfill build/validate
through ONE canonical schema module, so the two manifest paths cannot drift. The sweep is DRY RUN
BY DEFAULT; only an explicit `-Apply` writes anything, at both the library and entry-point layers.
Every candidate directory passes filesystem safety gates (no reparse points, direct-child
containment, a capped file-entry enumeration) before its contents are ever touched; unsafe
candidates are reported and skipped, safe candidates still process, and the sweep ends non-zero if
any directory was unsafe. An existing manifest.json is never touched (idempotent; live manifests
stay authoritative); each manifest is written atomically (same-dir temp + rename-class Move that
refuses to overwrite even under a race). A manifest that appears between eligibility and the
atomic move is a benign TOCTOU race — the existing manifest stays untouched, this run's temp file
is cleaned, and the directory is classified SKIP-RACED, never FAILED; any other I/O error remains
a visible failure. Unprovable run facts are JSON null, never fabricated (canonical `startedAt`
stays null — the local dir-name stamp lives in `backfill.startedAtFromDirNameLocal`, explicitly
approximate); media existence never implies an outcome; per-directory failures/unsafe dirs surface
visibly, the sweep continues past them, and the run then fails non-zero so a partial or unsafe
backfill is never mistaken for a complete, safe one.

## Pre-review findings and fixes (this session)

An independent pre-review of the prior session's backfill commit found three BLOCKING deviations
from the user-approved plan. All three are fixed in commit `81fbecf` on this branch, with new
regression tests proving each fix:

1. **Safe default was inverted.** The entry-point script and `Invoke-VideoScoutBackfill` wrote
   manifests on a bare invocation and required `-DryRun` to prevent that — backwards from the
   approved "dry-run by default, `-Apply` to write" contract. Fixed: the switch is now `-Apply`
   (default `$false`); a bare invocation can never write, at either the library or the actual
   process/entry-point boundary. Proven by a new `Describe` block that invokes
   `backfill-video-scout-manifests.ps1` as a REAL child process (`powershell -File ...`) — bare
   invocation writes zero manifests and exits 0; `-Apply` writes exactly one and exits 0.

2. **Filesystem safety gates were entirely missing.** Nothing rejected a reparse-point (junction/
   symlink) candidate, verified direct-child containment against the resolved base directory, or
   capped per-directory file-entry enumeration. Fixed: three new gate functions
   (`Test-VideoScoutBackfillReparsePoint`, `Test-VideoScoutBackfillDirectChild`,
   `Get-VideoScoutBackfillFileEntries` with a documented cap,
   `$script:VideoScoutBackfillMaxFileEntries = 2000`), checked in that order, BEFORE anything reads
   a candidate's contents — so a reparse-point directory is never entered, listed, or traversed
   into its target. Unsafe candidates go into a new `Unsafe` collection, are reported visibly, and
   the sweep continues past them; the run ends non-zero (throws) if `Unsafe.Count -gt 0`, even with
   zero `Failed`. Covered by: a deterministic containment test (fake path objects, no real
   filesystem trickery needed), a deterministic over-cap test (small injected cap, no need to
   create thousands of files), and TWO reparse-point tests (unit-level and sweep-level) that create
   a real NTFS junction when the machine/account supports it, and explicitly `Write-Warning` +
   soft-pass with a stated reason when it does not (no admin rights, non-NTFS temp, etc.).

3. **TOCTOU outcome was misclassified as FAILED.** If a manifest appeared after the sweep's
   eligibility check but before the atomic `File.Move`, the old code threw a generic write-FAILED
   error, which the sweep counted as a real failure. Fixed: `Write-VideoScoutBackfillManifestFile`
   now distinguishes "a manifest FILE now sits at the target" (a benign race — original untouched,
   temp cleaned, message prefixed `Backfill race:`) from any other Move failure (a directory
   obstructing the target path, permissions, disk full — still a genuine, visibly-reported
   `FAILED`). The sweep classifies by the anchored `^Backfill race:` prefix
   (`Resolve-VideoScoutBackfillFailureClass`, same anchoring convention as the live writer's
   `Resolve-ManifestFailureClass`) into a new `SkippedRaced` collection, which does NOT count toward
   the end-of-run non-zero throw. Proven deterministically via a test-only `-TestOnlyPreMoveHook`
   scriptblock parameter (invoked, only when supplied, in the exact window between the temp-file
   write and the atomic Move) that creates the "race winner" manifest at that precise moment — no
   reliance on real concurrency, timing, or file locks. A fix-adjacent bug was caught while building
   this: the pre-write existence check used plain `Test-Path` (true for a directory too), which
   meant the pre-existing "manifest.json replaced by a directory" failure-simulation test started
   misclassifying as a race. Fixed by using `-PathType Leaf` in both the pre-write check and the
   post-Move-failure check — a race winner is always a FILE; a directory obstruction is not a race.

Also verified (read-only, per the task's explicit constraint) that the safe default is truthful
against the REAL downloads root: a bare invocation of `backfill-video-scout-manifests.ps1 -BaseDir
D:\Gemini_Video_Review\downloads` (no `-Apply`) exits 0, reports "12 directories scanned, would
backfill 12," and a manifest-count check of that root before and after confirms zero files were
written. `-Apply` was NOT passed against the real root in this session — that remains the human's
one-shot to fire after this branch merges.

Files changed:

- `scripts/lib/video-scout-manifest-schema.ps1` (NEW, earlier session) — the single canonical
  schema: base skeleton (one place keys/order live), `New-VideoScoutLiveManifest`,
  `New-VideoScoutBackfillManifest` (adds the `backfill` provenance/discriminator object incl. the
  route-inference code basis pinned to pre-V5a commit `efd76f8`), shared
  `Get-SanitizedManifestText`, and variant-aware `Assert-VideoScoutManifestValid` (exact key set,
  per-variant nullability: a backfill that smuggles real run facts, or a live manifest that grows
  a `backfill` key, is rejected).
- `scripts/lib/write-video-scout-manifest.ps1` (earlier session) — live writer refactored onto the
  shared module: constructor replaced by `New-VideoScoutLiveManifest`, validator runs before every
  persist. Atomicity/behavior otherwise unchanged; `Initialize-VideoScoutRun` /
  `Complete-VideoScoutRunManifest` signatures unchanged (feed-gemini.ps1 untouched).
- `scripts/lib/get-video-scout-backfill.ps1` (earlier session; THIS SESSION fixed items 1–3 above)
  — `Test-VideoScoutRunDirName` (both run-dir generations, `-cmatch` case-sensitive),
  `Get-BackfillRunStampLocal` (LOCAL stamp, no fabricated zone conversion),
  `Resolve-BackfillMediaClassification` (.srt/.mp3/.mp4; mode on exactly one media type, title on
  exactly one media file, unknown extensions ignored), the three new safety-gate functions
  (`Test-VideoScoutBackfillReparsePoint`, `Test-VideoScoutBackfillDirectChild`,
  `Get-VideoScoutBackfillFileEntries`), `Resolve-VideoScoutBackfillFailureClass` (anchored
  race/failure classifier), `Write-VideoScoutBackfillManifestFile` (create-only atomic, now
  race-aware via `-PathType Leaf` + the `TestOnlyPreMoveHook` seam), `Invoke-VideoScoutBackfill`
  (the sweep: `-Apply`-gated writes, safety gates before content access, skip-existing,
  skip-foreign, skip-raced, unsafe, continue-past-failures/unsafe, visible end-of-run throw when
  `Failed` or `Unsafe` is non-empty).
- `scripts/backfill-video-scout-manifests.ps1` (earlier session; THIS SESSION: `-DryRun` replaced
  with `-Apply`, default is dry run) — thin one-shot entry point; default `-BaseDir` matches
  feed-gemini's default `-OutDir`.
- `scripts/lib/video-scout-manifest-schema.Tests.ps1` (earlier session).
- `scripts/lib/get-video-scout-backfill.Tests.ps1` (earlier session; THIS SESSION added 15 new
  assertions: containment gate, over-cap gate, reparse-point gate — unit + sweep level, TOCTOU
  SKIP-RACED via the deterministic hook, safe-default dry-run-vs-apply at both the library and the
  real-child-process entry-point boundary).
- `BLUE-HELM-MASTER-STATUS.md` (`54113af`, earlier session) — V5b backfilled-date rendering rule.

Security-sensitive surfaces touched:

- None of: IPC, PTY plumbing, credential handling, launch validators, duration-guard logic,
  feed-gemini.ps1.
- The backfill reads directory/file NAMES only (never file contents) and writes only new
  `manifest.json` files inside run directories that pass all three safety gates. Foreign directory
  names and exception text are sanitized before console echo; titles are sanitized by the shared
  schema constructor before entering a manifest. No credentials or provider data are involved
  anywhere on this path.
- Destructive-op posture: the utility never deletes, moves, or modifies anything (temp-file
  cleanup of its OWN temp file on a failed/raced write is the only removal). Reparse points are
  refused, never followed, deleted, or modified.

Commands run:

- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\run-pester.ps1` (in the worktree)
- `npm test` (in `app\` of the worktree)
- Live (read-only only, per the task's explicit constraint): bare `scripts\backfill-video-scout-
  manifests.ps1 -BaseDir D:\Gemini_Video_Review\downloads` (no `-Apply`) against the real downloads
  root (see "Pre-review findings and fixes" above for the exact result).

Exact test results (this session, post-fix):

- run-pester: **214 passed, 0 failed, 0 skipped (of 214)** — exit 0. Composition: 144 at fork
  point + 32 schema-suite assertions + 38 backfill-suite assertions (up from 23 pre-fix: +15 new
  assertions covering the three fixes — containment, over-cap, reparse unit + sweep, TOCTOU race,
  safe-default at the library and real-process entry-point boundary).
- `npm test` (app side, untouched by this branch): **26+13+103+53+38 = 233 passed, 0 failed** — exit 0.
- One test-caught bug fixed mid-session (see finding 3 above): the pre-write/post-Move-failure
  existence checks in `Write-VideoScoutBackfillManifestFile` used plain `Test-Path` (true for a
  directory), which misclassified the pre-existing "manifest.json is a directory" failure-
  simulation test as SKIP-RACED instead of FAILED. Fixed with `-PathType Leaf` on both checks.

Manual verification:

- Real child-process run of `backfill-video-scout-manifests.ps1` (via the Pester suite's
  process-boundary `Describe`) against a scratch legacy dir (single `.mp3`): bare invocation exits
  0 and writes zero manifests; `-Apply` exits 0 and writes exactly one schema-valid manifest.
- Bare (no `-Apply`) invocation against the REAL `D:\Gemini_Video_Review\downloads`: **12
  directories scanned, 0 already indexed, 0 unsafe, 0 failed, would-backfill 12**, exit 0; a
  before/after manifest-file count confirms zero files were written. The real (`-Apply`) sweep was
  deliberately NOT run against the real root — that remains the human's one-shot to fire after this
  branch merges.
- A real NTFS directory junction was created and torn down twice by the automated Pester suite
  itself (unit-level reparse test + sweep-level reparse test) on this machine — both passed showing
  the junction is refused as unsafe and never traversed (its target directory's file was never
  read or referenced in any written manifest).

Known limitations:

- Best-effort by design: backfilled manifests have null url/model/resolutions/offsets/usage/
  outcome — a directory cannot prove them. V5b must render `outcome=null` + `backfill` present as
  "legacy / unknown result", and date-sort via `backfill.startedAtFromDirNameLocal` per the
  `54113af` rule.
- Only directories DIRECTLY under `-BaseDir` are considered (matches how runs are laid out); this
  is now an enforced containment check, not just an artifact of `Get-ChildItem`'s default depth.
- The stamp is kept LOCAL (as `New-VideoScoutRunDir` wrote it); no UTC conversion is attempted
  (DST would make historical conversion partly fictional).
- The dual-variant validator means the LIVE writer now rejects (throws on) any future manifest
  drift at write time — new intentional live-path fields require a schema-module change first
  (that friction is the point).
- The file-entry cap (`2000`) is a documented, tunable constant, not derived from any observed
  real-world directory shape; if a legitimate run ever legitimately exceeds it, the fix is to raise
  the constant deliberately, not to special-case a directory.
- `TestOnlyPreMoveHook` / `TestOnlySimulateRaceForDirName` are test-only seams on
  `Write-VideoScoutBackfillManifestFile` / `Invoke-VideoScoutBackfill` respectively — never set by
  either production caller (the sweep itself, or the entry-point script), but they are real,
  reachable parameters on those functions if called directly; a reviewer should confirm that's an
  acceptable test-seam pattern for this codebase (it mirrors the existing
  `invoke-duration-probe.ps1` extraction-for-testability precedent).

Unexpected pre-existing findings:

- None beyond the test-caught `-PathType Leaf` bug above (introduced and fixed within this same
  session's fix commit, not present in merged `main`).

Recommended review focus:

- The three fixes themselves, in order: (1) `-Apply` truly gates every write path, including the
  entry-point script — confirm there is no code path that writes without it. (2) The order of the
  three safety gates in `Invoke-VideoScoutBackfill` (reparse → containment → cap, all before any
  `Get-ChildItem -File`/`Test-Path` on the directory's contents) — confirm a reparse-point
  directory is genuinely never entered, not just excluded from the written result. (3)
  `Write-VideoScoutBackfillManifestFile`'s two `Test-Path -LiteralPath ... -PathType Leaf` checks
  and `Resolve-VideoScoutBackfillFailureClass`'s anchored `^Backfill race:` classification — confirm
  no message forgery path exists (untrusted text — directory names, exception text — never appears
  at the START of a message this module owns).
- `Assert-VideoScoutManifestValid`: the variant discrimination (presence of `backfill` key) and
  per-variant nullability tables — this is the write-time gate for BOTH writers, so an error here
  blocks live runs, not just backfill.
- The route=cli structural inference and its recorded code basis (`efd76f8` control flow) — the
  reviewer should confirm the claim that only the CLI path created run directories pre-V5a.
- Whether the sweep summary object shape (`Scanned`/`Backfilled`/`SkippedExisting`/
  `SkippedForeign`/`SkippedRaced`/`Unsafe`/`Applied`) is the contract V5b's library wants to consume.

Review diff:
`git diff 25fda2d769981e8a133bb443822e87ad5e73eb8d...81fbecf1bb9c6ba93c27acd28c904da648ec9a38 --output=.agent-review-video-scout-manifest-backfill.diff` (pinned, gitignored)

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
