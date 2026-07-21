# Builder Handoff — V5c1 Manifest-Owned Media Inventory

Branch: `feature/v5c1-media-inventory`
Fork-point / pre-merge base SHA: `f2cbb1c` (the reviewed V5b2 tip — this branch STACKS on V5b2, it
does NOT branch from main). Baseline gates on that tip: app 939/0, Pester 375/0/0.
Tip SHA: implementation checkpoint `5a6f122`; marker/docs commit sits on top.
Merge commit SHA: Pending human approval. Merge order: V5b1 first, then V5b2, then V5c1 (V5c2 later).

Tier: **STANDARD-CLASS** — this adds a manifest-recording invariant on the write side; no new
renderer→filesystem boundary is created (the V5b2 read boundary is reused unchanged). It receives ONE
scoped Standard-class Reviewer pass and a delta pass after any failed verdict.

## One invariant

Every downloadable media artifact produced by a future Video Scout run is recorded in that run's
manifest BEFORE analysis can complete. No file outside that run, no stale file, and no merely
discovered file can become manifest-owned. Recording is **non-destructive**: no file is ever deleted,
moved, quarantined, swept, or repaired, and ownership is **never inferred** for existing history.

## Stacking

V5c1 stacks on the reviewed V5b2 tip `f2cbb1c`. If V5b2 changes after its live retest, carry the
correction into V5c1, rerun both gates, refresh the pinned diff, and obtain the V5c1 delta review.
Review + pin the V5c1-only delta as `f2cbb1c...<V5c1 tip>`.

## What shipped

- **`scripts/lib/video-scout-manifest-schema.ps1` (modified — the SINGLE shared validator)** —
  introduces **schema version 2** for newly initialized LIVE runs. There is NO second schema and NO
  JavaScript validator.
  - Adds ONE canonical top-level field `mediaArtifacts` (array, default `[]`, **max 16** entries). Each
    artifact has the EXACT shape — no missing key, no extra key:
    `{ fileName (safe leaf), kind ('transcript'|'audio'|'video'), sizeBytes (>=0 int), recordedAt
    (canonical UTC), state ('present'), deletedAt: null, deletionReason: null }`.
  - The extension MUST match the kind: `transcript → .srt`, `audio → .mp3`, `video → .mp4`.
  - `fileName` is validated as a **safe leaf** (`Assert-VideoScoutSafeLeafName`): non-empty, bounded
    length (260), never `.`/`..`, no path separator, no `..` segment, no drive/rooted prefix, no
    control chars (`\x00–\x1F`, `\x7F`), no bidi overrides
    (`‎‏‪–‮⁦–⁩`).
  - `mediaArtifacts` must be an **array, never an object**; case-insensitive **duplicate** filenames
    are refused; an invalid size/timestamp/state is refused.
  - **Version 1** (ALL existing history — backfills, metadata-only, completed pre-V5c, V5b1 reports)
    stays valid **UNCHANGED** and **REJECTS** a `mediaArtifacts` key. **Version 2 REQUIRES** the field
    and can **never be a backfill** (ownership is never fabricated for history). `New-VideoScoutLive`
    manifests now emit `schemaVersion = 2` with `mediaArtifacts = @()`; **backfills remain v1**.
  - `reportFile` still governs `analysis-output.txt` **exclusively**. Reports, manifests, temp files,
    and diagnostics are NEVER added to `mediaArtifacts`. **Reports are not media.**
- **`scripts/lib/record-video-scout-media.ps1` (new — the ownership recorder)** —
  `Add-VideoScoutMediaArtifact` takes ONLY: the run dir (from `Initialize-VideoScoutRun`), the
  `FileInfo` the run's own output resolver produced, the `kind`, and the manifest. It:
  - requires `schemaVersion == 2`;
  - resolves the run dir and the file canonically (`[IO.Path]::GetFullPath`), requires the file to be a
    **direct child** of the run dir, an **ordinary file** (exists, not a directory), and **not a
    reparse point**;
  - uses the **ACTUAL on-disk leaf name** (`[IO.Path]::GetFileName` of the resolved file — never a
    caller-supplied filename) and the **real on-disk size** (read from the `FileInfo` itself), so a
    caller cannot substitute either;
  - enforces `extension == kind` and refuses a case-insensitive **duplicate**;
  - updates the manifest **ATOMICALLY** via the shared writer (`Write-VideoScoutManifestFile` —
    temp-in-run-dir + `[IO.File]::Replace`/`Move`). On ANY failure it throws (refuse visibly), **reverts
    the in-memory claim**, and leaves the file untouched.
  - It **does not scan the run directory**, does not accept renderer paths or arbitrary caller
    filenames, and **deletes/moves/quarantines/repairs nothing**.
- **`scripts/feed-gemini.ps1` (modified — lifecycle wiring)** —
  - **CLI route**: v2 init → guarded download → run-scoped output resolver → **record the artifact** →
    ONLY THEN the paid Gemini request → the existing V5b1 report/outcome lifecycle. A recording failure
    **blocks the paid call**, leaves the file in place, and does **not** claim ownership (outcome
    becomes `error` via the terminal-truth path, or stays null if the manifest itself is unwritable —
    honest crash-truth).
  - **SDK route**: v2 init, records **nothing** (the remote URL is ingested directly; there is no local
    media file, and a remote URL is never recorded).
  - **NoFeed route**: records the download and may complete **without** a report.
  - `-OutDir` is already main-owned (V5b2). A guard refusal or a download failure yields an **empty
    inventory**. No request/duration/cost/report semantics changed. The existing yt-dlp behavior that
    removes its own temporary `.vtt` is left **unchanged and not broadened**.
- **`scripts/lib/video-scout-library-core.ps1` + `app/library-ipc.js` +
  `app/renderer/library-view.js` (V5b2 compat)** — the Library lists v1 history, v1 backfills, v2 empty
  inventories, and v2 recorded runs through the **same shared validator**. A **bounded `mediaCount`**
  (count only — NEVER filenames or paths) is projected and optionally displayed as a `Media: N file(s)`
  metadata field, shown only when a run records any. **No Library delete button was added** (none is
  authorized until V5c2).

## Non-scope honored (NOT delivered — verbatim security constraints)

No file deletion, move, quarantine, retention sweep, automatic post-success cleanup, or historical
media deletion. No inferred/backfilled ownership for the existing 23+ manifests. "A file exists inside
a run-like folder" is NEVER treated as ownership — the recorder never scans a directory for ownership.
No V5d paid-follow-up behavior touched. The yt-dlp `.vtt` temp removal is unchanged, not broadened.

## Failure truth (what the manifest says under each outcome)

- Guard refusal / download failure → **empty inventory** (no artifact recorded).
- Download succeeds, Gemini fails → artifact **recorded**, outcome **error** (ownership is real; the
  paid analysis just failed after it).
- Success → artifact **recorded** + report present.
- Manifest update fails during recording → the paid Gemini request is **NOT** made; the manifest does
  **not** claim ownership; the file is left in place.
- Crash BEFORE the ownership update lands → the file exists on disk but is **unowned**; a future
  deletion (V5c2) must ignore an unowned file. Ownership is **never** inferred/repaired after the fact.

## Tests (real exported helpers; auto-discovered / meta-wired)

- `scripts/lib/video-scout-manifest-schema.Tests.ps1` (**+16 v2 cases**) — v1 valid + REJECTS a
  `mediaArtifacts` key; v2 REQUIRES it; each kind/extension pair; extension/kind mismatch refused;
  missing/extra key refused; array-not-object enforced; case-insensitive duplicate refused;
  traversal / rooted / separator / control / bidi filenames refused; invalid size / timestamp / state
  refused; the >16 cap; a live manifest is v2 with an empty inventory; a **backfill stays v1** and must
  not carry the field.
- `scripts/lib/record-video-scout-media.Tests.ps1` (**12, new**) — a direct child file is recorded with
  the ACTUAL leaf name + real size; a caller cannot substitute filename or size; a file outside the run
  dir / nested one level down / a reparse point / a missing file / a duplicate is refused; the manifest
  update is ATOMIC; a **blocked replacement** (forced via a REAL exclusive `[IO.File]` lock on
  `manifest.json`) leaves the OLD inventory intact and the file untouched; **no deletion on any failure
  path**; a **source + behavior tripwire** proves the module contains NO deletion / move / quarantine /
  recursive-cleanup operation.
- `scripts/feed-gemini-media-inventory-lifecycle.Tests.ps1` (**11, new**) — per-route kinds via a
  mode-aware yt-dlp stub (writes `.srt`/`.mp3`/`.mp4` by args); SDK records nothing; a guard refusal /
  download failure records nothing; an analysis failure retains a recorded artifact with a non-completed
  outcome; a **recording failure (read-only manifest) blocks the Gemini request** and the outcome is
  not `completed`; NoFeed records the download; a **source-ordering guard** proves recording precedes
  the paid request.
- `scripts/lib/video-scout-library-core.Tests.ps1` (**+3 v2 cases**) — the List projects a v2 recorded
  run, a v2 empty inventory, and a v1 backfill together; `mediaCount` = 1 / 0 / 0 respectively; NO
  filename or path leaks into the projected entry.
- Updated `write-video-scout-manifest.Tests.ps1` and the `feed-gemini.Tests.ps1` SDK E2E schemaVersion
  assertions to v2 (empty inventory).
- Reachability: all suites live under `scripts\` (Pester auto-discovery) and `app\` (wired into the
  `app/package.json` test script), covered by the existing reachability meta-tests.

## Commands run and exact results (this tree)

- Baseline (V5b2 tip `f2cbb1c`): app **939/0**, Pester **375/0/0**.
- After implementation: app **939/0** (V5c1 added ZERO new JS test files; `library-ipc` 23 /
  `library-view` 25 unchanged), Pester **416/0/0** (375 + 41 new: schema +16, recorder 12, lifecycle
  11, library-core +3, minus adjusted existing assertions net to the same +41).
- **Read-only List dry-run against the real root** (`D:\Gemini_Video_Review\downloads`, via the
  production entry point `scripts/video-scout-library.ps1 -Action List`, no writes, no reports opened,
  no Gemini request, no download): total **25**, valid **25**, invalid **0**, capExceeded false. Every
  entry carries a bounded `mediaCount`; ALL 25 are `mediaCount = 0` (every existing run is v1 history —
  ownership is never inferred). No path/filename leak in any projected entry. This confirms the
  invariant: existing v1 manifests are preserved exactly as valid.
- **No real Gemini request and no real download** were made during implementation or testing.

## Known limitations / honest notes

- `mediaArtifacts` is write-only in V5c1: a recorded artifact is only ever added with `state='present'`.
  The `deletedAt`/`deletionReason` fields exist in the schema (always null here) so V5c2 can define
  deletion WITHOUT another schema bump — but V5c1 never sets them.
- `app/node_modules` in this worktree is a junction to a real install (gitignored) so Electron/tests
  run without a second install; it is not part of the diff.

## Live acceptance procedure (human-initiated; marker `V5C1 MEDIA INVENTORY ACCEPTANCE 2026-07-20.12`)

Verify the process command line points at `.worktrees\v5c1-media-inventory\app`, then run one short
captioned video in **transcript** mode (CLI route).

V5b1/V5b2 content checks (unchanged): the report begins with `## 1. TL;DR` with an honest
caption-derived timestamp; en/em dashes render correctly (Unicode); the Library lists the run and
**Open Report** opens the same readable report in-app.

V5c1 checks: the run's `manifest.json` has `schemaVersion` **2**; `mediaArtifacts` contains **exactly
the downloaded `.srt`** — `fileName` equals the ACTUAL direct-child file, `kind` `transcript`,
`sizeBytes` matches the file on disk, `state` `present`, `deletedAt`/`deletionReason` null; `reportFile`
is `analysis-output.txt`; `outcome` `completed`; NO report or media content appears in Logs; and **no
file was deleted** (the downloaded media and every historical file remain on disk).

## Review-diff rule

- Pinned diff: `git diff --output=.agent-review-v5c1-media-inventory.diff f2cbb1c...<tip>` (three-dot
  from the V5b2 base; `--output`, never PowerShell `>`; gitignored).
- Scope: v1 back-compat, the exact v2 schema, ownership provenance (direct-child / ordinary file /
  reparse refusal / actual leaf + real size / no caller substitution / no directory scan), the atomic
  record-before-Gemini ordering, the paid call blocked on a recording failure, failure truth, the
  absolute absence of deletion/move/quarantine/cleanup, and V5b1/V5b2 preserved.
- Retain the literal `VERDICT: PASS|FAIL` line and identify the review that produced it.

Reviewer verdict: `VERDICT: PASS`

Reviewer verdict source: Standard-class scoped review (fresh reviewer subagent), July 21, 2026, over
the pinned diff `.agent-review-v5c1-media-inventory.diff` (`f2cbb1c...359a912`) plus worktree source.
All eight mandated focus areas confirmed by reading: v1 back-compat (v1 stays valid + rejects a
`mediaArtifacts` key; backfills stay v1; single shared validator; no JS validator); the exact v2
schema (array-not-object, max 16, exact keys, kind/ext pairing, safe-leaf with `\uXXXX` bidi escapes,
case-insensitive dup, v2-never-a-backfill); ownership provenance (direct child, ordinary file, reparse
refusal, actual leaf + real size, no caller substitution, no directory scan); atomic ordering + revert
on failure; the CLI record-before-Gemini gating with a recording failure blocking the paid call (SDK
records nothing; NoFeed records); failure truth; the absolute absence of deletion/move/quarantine/
cleanup (reports never added to `mediaArtifacts`); and V5b1/V5b2 preserved (bounded `mediaCount` only,
no delete button). PS 5.1 array-unwrap, `List` `@()`, JSON round-trip, and bidi-escape hazards all
checked clean.

One LOW (non-blocking) finding — the direct-child parent-equality check at
`record-video-scout-media.ps1:49` was flagged as a case-sensitive ordinal comparison that could
over-reject on Windows. **Verified SPURIOUS and left unchanged:** the check uses PowerShell `-ne`,
which is **case-insensitive by default** (`-cne` is the case-sensitive operator, used elsewhere at
`video-scout-library-core.ps1:211`), so a casing mismatch already compares EQUAL and the file is
accepted (proven empirically: `"D:\...\run-x" -ne "d:\...\RUN-X"` is `False`). No code change was
made; making the finding a no-op would only add redundant/inconsistent explicitness. No CRITICAL/HIGH/
MEDIUM findings; no blocking issues. Final reviewed tip: `359a912` (this verdict-recording docs commit
sits on top; no reviewed code changed).
