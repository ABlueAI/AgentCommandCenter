# Builder Handoff — V5c2a Manifest-Owned Successful-Run Media Cleanup

Branch: `feature/v5c2a-success-media-cleanup`
Fork-point / pre-merge base SHA: `c26ba1f` (the reviewed V5c1 tip — this branch STACKS on V5c1, it
does NOT branch from main). Baseline gates on that tip: app 939/0, Pester 416/0/0.
Tip SHA: implementation checkpoint `e9f35f9`; marker/docs commits sit on top.
Merge commit SHA: Pending human approval. Merge order: V5b1 → V5b2 → V5c1 → V5c2a (V5c2b later).
Recorded SHAs at fork time: V5c1 base `c26ba1f`; new-branch fork `c26ba1f`; current main `23dc9d5`;
origin/main `23dc9d5`.

Tier: **FULL-CLASS** — this performs irreversible filesystem deletion. It receives a whole-diff
security review, a pinned three-dot diff, a delta review after any FAIL, explicit human live
acceptance, and a human merge decision.

## One invariant

After a Video Scout analysis completes successfully and its report and completed manifest are durable,
the app may delete **only** media files explicitly owned by that same validated manifest. No scan,
filename guess, extension glob, terminal-output parser, renderer-provided path, or inferred ownership
may authorize deletion.

## Scope (and non-scope)

Implements ONLY automatic cleanup for the current successful run. It does **not** implement the
cross-run retention/reconciliation sweep — that is **V5c2b**, separate Full-class work, and does not
exist in this branch. No Library Delete button, no user-selected paths, no recursive deletion, no
directory/report/manifest deletion, no historical ownership inference, no OS-open, no second schema or
validator, and no new renderer→filesystem boundary. V5c2a reuses V5c1's manifest-owned `mediaArtifacts`
and the one shared schema/validator.

## What shipped

- **`scripts/lib/video-scout-manifest-schema.ps1` (the SINGLE shared validator — extended in place)** —
  the schema-v2 artifact-state lifecycle now models the crash-honest truth that a filesystem delete and
  a manifest write are NOT one atomic transaction. No new schema version; no second validator.
  - States: `present, deleting, deleted, delete-failed, missing`.
  - A small explicit **deletion-reason allowlist**: `completed-analysis, owned-file-missing,
    identity-mismatch, unsafe-file-type, reparse-point-refused, filesystem-delete-failed`. A persisted
    `deletionReason` is always a bounded constant — never a raw exception, path, or content.
    `manifest-update-failed` is a **runtime warning-only** reason and is intentionally NOT in the
    persisted allowlist (a failed manifest write cannot truthfully persist a reason about its own
    failure; the durable manifest keeps its last successfully written state).
  - Per-state nullability: `present` → both null; `deleted` → non-null UTC `deletedAt` + allowlisted
    `deletionReason`; `deleting`/`delete-failed`/`missing` → `deletedAt` null + allowlisted
    `deletionReason`. **Schema-v1 history and V5c1 present-only manifests stay valid unchanged.**
- **`scripts/lib/cleanup-video-scout-media.ps1` (new — the deletion helper)** —
  `Invoke-VideoScoutSuccessMediaCleanup -RunDir -DownloadsRoot`:
  - **Eligibility gate**: bounded-reads + reloads `manifest.json`, re-validates through the shared
    validator (the SOLE deletion authority — never the in-memory object, never a scan), and is eligible
    ONLY when `schemaVersion=2`, `outcome='completed'`, `reportFile` is non-null, and the report exists
    as a direct-child ordinary file. Any miss → visible bounded warning + safe no-op (this is how
    NoFeed/error/refused/incomplete/schema-v1/SDK-empty all RETAIN media).
  - **Per artifact, one at a time, targets ONLY from `mediaArtifacts`** (never `Get-ChildItem`, never a
    glob): a shared safety classifier (run at pre-check AND immediately before delete) enforces
    fixed-root containment, run-dir direct-child identity, exact leaf, `extension==kind`, not the
    manifest/report/temp, ordinary file, no reparse point, and `size==sizeBytes`. Flow: pre-authorize →
    commit intent (`present→deleting`) atomically **before** the FS delete → TOCTOU re-validate →
    `[System.IO.File]::Delete` the **exact literal path** (no wildcard, recursion, or shell) →
    `deleting→deleted` with a UTC `deletedAt`.
  - **Crash truth**: a file absent while `present` → `missing` (never a false `deleted`); absent while
    durably `deleting` → finalize `deleted` (intent already committed); a safety refusal or OS delete
    failure → `delete-failed` (bounded reason). A manifest-write failure **before** deletion leaves the
    file intact (durable `present`); **after** deletion leaves durable state `deleting` (never a false
    `deleted`).
  - **TOTAL**: never throws. Surfaces a bounded warning (run ID, counts, allowlisted reason constants —
    never a path, filename, or report/media/transcript content) and **never rewrites a successful
    analysis into a failure**. Deletes only media leaves — never a report, manifest, temp, or directory;
    never moves/quarantines/recurses. A `deleted` artifact stays in the array as audit history.
- **`scripts/feed-gemini.ps1` (lifecycle wiring)** — exactly **one** call, after the CLI success branch
  writes the report and completes the manifest (any CLI mode: transcript/audio/video). The call is
  additionally guarded so a cleanup failure can never break a successful run. SDK/NoFeed/error routes
  never reach it and retain their media (SDK owns no local media anyway). **No change** to K5
  requests/retries/usage/cost, the duration guard, or the V5c1 recorder.
- **Library (V5b2) compat** — the Library lists the new states through the same shared validator; the
  existing bounded, **path-free `mediaCount`** is unchanged (total recorded audit entries, including a
  `deleted` one). No filename, path, or artifact state is exposed; no Library delete button.

## Required order honored

Analysis finishes cleanly → bounded report finalized → report atomically written+renamed → manifest
atomically finalized `outcome:"completed"` + `reportFile` → **reload manifest from disk → validate via
the shared validator → select only eligible `mediaArtifacts` → per artifact: `present→deleting`
(intent committed atomically first) → re-validate the exact target → literal-path delete →
`deleting→deleted` with `deletedAt`.** An artifact is never marked `deleted` before the FS delete
succeeds (except the crash-recovery finalize of an already-durable `deleting` whose file is gone).

## Failure truth

Cleanup failure is visible (bounded warning) but never rewrites a completed analysis into a failure —
the durable report and `outcome:"completed"` remain truthful. The run may report analysis completed
while separately warning that cleanup was affected; it never silently continues while looking fully
successful.

## Tests (real exported helpers; wired into the reachability meta-test; temp fixtures ONLY)

No automated test deletes anything from `D:\Gemini_Video_Review\downloads`. Every destructive test uses
a throwaway `$env:TEMP` fixture root and cleans it up.

- `scripts/lib/cleanup-video-scout-media.Tests.ps1` (**25, new**) — happy-path single-owned delete
  ending `deleted` (UTC `deletedAt` + `completed-analysis`), report+manifest intact; unowned siblings
  of every kind + an arbitrary file survive; ineligible NoFeed(null report)/error/refused/null/v1/
  SDK-empty retain media; safety-classifier refusals (traversal/rooted/separator/wrong-ext/manifest/
  report/size-mismatch); reparse (junction run dir) and directory targets refuse; missing-while-present
  → `missing`; missing-while-`deleting` → `deleted`; a real FS-delete failure (exclusive lock) →
  `delete-failed` with `outcome` still `completed`; manifest-write failure **before** deletion (file
  intact, durable `present`) and **after** deletion (durable `deleting`, never false `deleted`); one-at-
  a-time with an unrecorded sibling surviving; bounded-diagnostics shape; and a **source tripwire**
  proving the only FS delete is a single literal `[System.IO.File]::Delete` with no scan/glob/recursion/
  move/quarantine.
- `scripts/lib/video-scout-manifest-schema.Tests.ps1` (**+8**) — every valid per-state shape accepted;
  `deleted` without `deletedAt` rejected; `deleting`/`delete-failed`/`missing` with a `deletedAt`
  rejected; a non-present state with a null reason rejected; a reason outside the allowlist rejected;
  `present` with a `deletedAt`/reason still rejected; unknown state rejected; `deleted` JSON round-trip.
- `scripts/lib/video-scout-library-core.Tests.ps1` (**+2**) — a v2 run whose inventory spans all new
  states lists as valid with a bounded total `mediaCount` and leaks no filename/path/state/reason.
- `scripts/feed-gemini-media-inventory-lifecycle.Tests.ps1` (**+5, and 1 V5c1 assertion updated**) — CLI
  transcript success deletes the owned `.srt` and keeps the report + completed manifest (artifact →
  `deleted`); audio success deletes the `.mp3` (cleanup covers every CLI mode); an unowned sibling
  survives the full lifecycle (no scan); NoFeed retains media (`present`); and a wiring guard that
  cleanup is invoked AFTER the report write. (The V5c1 "records the correct kind" transcript test now
  asserts the post-run state is `deleted` — the new lifecycle reality.)

## Commands run and exact results (this tree)

- Baseline (V5c1 tip `c26ba1f`): app **939/0**, Pester **416/0/0**.
- After implementation: app **939/0** (zero new JS test files), Pester **456/0/0** (416 + 40 new:
  cleanup 25, schema +8, library-core +2, lifecycle +5).
- **No real Gemini request, no real download, and no deletion against the real downloads root** were
  performed during implementation or testing. A read-only V5c1-style List dry-run is not repeated here
  (V5c2a changes the write/delete side, not the read boundary).

## Known limitations / honest notes

- `mediaCount` deliberately continues to mean the **total recorded audit entries** (including `deleted`
  ones); it does not represent files currently present, and the UI is not expanded in this branch.
- A crash between the FS delete and the final manifest write leaves durable state `deleting` — this is
  intentional and is what the future **V5c2b** reconciliation sweep will resolve.
- `app/node_modules` in this worktree is a junction to a real install (gitignored); not part of the diff.

## Live acceptance procedure (human-initiated; marker `V5C2A SUCCESS CLEANUP ACCEPTANCE 2026-07-21.13`)

Verify the process command line points at `.worktrees\v5c2a-success-media-cleanup\app`. Then run one
short captioned video in **transcript** mode (CLI route). Expect: the report remains and opens in the
Library; the manifest stays `outcome:completed` with `reportFile` `analysis-output.txt`; the newly
downloaded manifest-owned `.srt` is **gone**; its `mediaArtifacts` entry remains as `state:deleted`
with a populated `deletedAt` and `deletionReason:completed-analysis`; no unrelated file is removed; and
no transcript/report content appears in Logs.

## Review-diff rule

- Pinned diff: `git diff --output=.agent-review-v5c2a-success-media-cleanup.diff c26ba1f...<tip>`
  (three-dot from the V5c1 base; `--output`, never PowerShell `>`; gitignored).
- Full-class focus areas: deletion authority only from the manifest; completed+reportFile eligibility;
  NoFeed preservation; exact-path containment + reparse defenses; size/kind/name identity checks; no
  wildcard/recursive deletion; state-transition + crash truth; no false `deleted` claims; report/manifest
  survival; unowned-sibling survival; metadata-only diagnostics; schema-v1 compatibility; no change to
  K5 provider requests/retries/usage/cost guards; no renderer-provided path; no real-root deletion in
  development.
- Retain the literal `VERDICT: PASS|FAIL` line and identify the review that produced it.

Reviewer verdict: `VERDICT: PASS`

Reviewer verdict source: Full-class whole-diff read-only review (fresh reviewer subagent), July 21,
2026, over the pinned diff `.agent-review-v5c2a-success-media-cleanup.diff` (`c26ba1f...cd1e95c`) plus
the full worktree source of every touched production file. All sixteen mandated focus areas confirmed
by reading: deletion authority is manifest-only (no scan/glob/terminal-parse/renderer path; source
tripwire enforced); the schemaVersion-2 + completed + non-null-reportFile + report-exists eligibility
gate; NoFeed preservation (null reportFile → no-op); fixed-root containment + run-dir/target direct-
child identity + reparse refusal that fails CLOSED on unreadable attributes; leaf/extension/size
identity with visible refusal + file preservation on mismatch; the single literal
`[System.IO.File]::Delete` (no wildcard/recursion/directory-delete/move/shell); the crash-honest
present→deleting→deleted lifecycle with the missing / delete-failed branches and NO false `deleted`
claim (intent committed before the FS delete; `deleted` only after it succeeds; a post-delete manifest-
write failure leaves durable `deleting`); report/manifest/temp/directory can never be a target; unowned
siblings untouched; metadata-only bounded diagnostics with `manifest-update-failed` never persisted;
schema-v1 + v2-present-only compatibility on the ONE validator; no change to K5 requests/retries/usage/
cost, the duration guard, or the V5c1 recorder; no renderer-supplied path (DownloadsRoot is the fixed
main-owned `$OutDir`); and no real-root deletion in tests (temp fixtures only). PS 5.1 array-unwrap /
single-element round-trip / `[NullString]::Value` / reparse-via-GetAttributes / case-insensitive `-ne`
all checked clean.

Two LOW findings — informational only, NO action required, left unchanged (matching Blue Helm
precedent for pre-existing/inherent informational LOWs; keeps the reviewed diff stable):
- LOW-1: `Assert-VideoScoutSafeLeafName` does not explicitly reject a mid-name NTFS-ADS `:`. This is
  PRE-EXISTING shared V5b1/V5c1 code, unchanged by this diff, and non-exploitable here — the schema's
  `extension==kind` rule rejects any ADS-bearing leaf at manifest-write time, and cleanup's parent-
  identity + `GetFileName==leaf` + `File.Exists` + size checks keep any residual case fully CONTAINED
  within the run directory and fail-closed to `absent`/`missing`. No deletion of an unowned file, a
  report, a manifest, or anything outside the run dir is possible.
- LOW-2: the inherent, by-design TOCTOU window between the immediate pre-delete re-validation and
  `File.Delete`, mitigated by that re-validation and Windows `File.Delete` reparse semantics
  (it removes a reparse point itself rather than traversing it). Acceptable.

No CRITICAL/HIGH/MEDIUM findings; no blocking issues; no delta review required. Final reviewed tip:
`cd1e95c` (this verdict-recording docs commit sits on top; no reviewed code changed).
