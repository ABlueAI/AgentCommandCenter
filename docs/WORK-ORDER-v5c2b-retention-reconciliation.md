# Work Order — V5c2b Cross-Run Retention / Reconciliation Sweep (APPROVED — rulings incorporated)

> **Status: APPROVED for implementation (2026-07-22).** All §10 decisions ruled; the eligibility model
> is now **two lanes** (§3). Branch `feature/v5c2b-retention-reconciliation` off the reviewed V5c2a tip
> `ffa27b0` (worktree `.worktrees/v5c2b-retention-reconciliation`). Build → full tests → pin
> `ffa27b0...<tip>` → Full-class whole-diff review → **stop for human acceptance**. No merge, push,
> existing-branch edits, real-root destructive tests, UI/main-process changes, or V5d work.

## 1. Gate tier + blast-radius rationale

**FULL-CLASS.** V5c2b performs **irreversible filesystem deletion across many runs in a single
invocation** (V5c2a deletes only the one just-completed run's media; V5c2b sweeps the whole downloads
root). Worst-case failure is destructive and wide: deleting media a manifest does not own, deleting
media of a still-running analysis, or corrupting the crash-honest state machine. It also **modifies
two V5c2a-reviewed shared files** (the deletion helper and the single schema/validator — see §6/§7).
Therefore: whole-diff read-only Reviewer pass, pinned three-dot diff, a delta pass after any FAIL,
explicit human live acceptance against a disposable fixture root, and a human merge decision. No
auto-merge; Claude never merges its own branch.

## 2. One invariant (non-negotiable)

A retention sweep may delete **only** media explicitly owned by a **bounded, schema-valid V2
manifest**. Directory membership, directory scanning, filenames, extensions, renderer input, terminal
output, or historical inference **never** establish ownership. The deletion candidate list for a run
comes **exclusively** from that run's validated `manifest.mediaArtifacts` array — never
`Get-ChildItem`, never a glob, never the directory's contents. **Manifests and reports are retained
indefinitely.** No directory, manifest, or report is ever deleted.

## 3. Eligibility model — TWO LANES (whole-run gate, per candidate run)

Common preconditions for BOTH lanes: `manifest.json` reloads and passes the **single shared
validator** (`Read-VideoScoutManifestForCleanup` — the SOLE authority; never the in-memory object,
never a scan); `schemaVersion == 2`; and the **dual age gate** (§4) passes. `schemaVersion == 1`
(backfills / metadata-only history) is **never** eligible in either lane (no owned inventory exists) —
this is the structural guarantee behind "never mutate schema-v1/backfilled history."

### Lane 1 — Completed-run reconciliation (authorization reason `completed-analysis`)
Eligible iff: `outcome == 'completed'` **AND** `reportFile` is non-null, valid, and the report file
**exists** as a direct-child ordinary file (not a reparse point) **AND** the age gate passes.
- Processes: **stale `present`** artifacts (missed because a crash happened before V5c2a's immediate
  cleanup ran), **stale `deleting`** (crash-interrupted V5c2a intent), and **opt-in** retryable
  `delete-failed/filesystem-delete-failed`.
- Uses V5c2a's exact semantics with the `completed-analysis` authorization reason.
- **Completed NoFeed (`reportFile: null`) is permanently preserved** — not eligible; media stays
  `present`. A completed run whose report is missing/invalid is likewise preserved.
> **Why this lane exists (resolves the earlier contradiction):** a V5c2a-origin `deleting` state can
> ONLY occur on a completed run (V5c2a runs only on completed runs). Excluding all completed runs — as
> the first draft did — would strand those crash-interrupted deletes forever. Reconciliation therefore
> MUST cover completed runs, under the age gate, with the honest `completed-analysis` reason.

### Lane 2 — Retention cleanup (authorization reason matches the outcome)
Eligible iff: `outcome ∈ { 'error', 'refused' }`, **or** `outcome == null` **AND** the run is stale
(age gate) — i.e. interrupted/abandoned — **AND** the age gate passes.
- Authorization reason: `error → retention-error`, `refused → retention-refused`,
  `null(stale) → retention-abandoned`.
- Processes: `present`, `deleting` (reconcile), and **opt-in** retryable `delete-failed`.
- Never touches schema-v1 / backfills (guaranteed by the `schemaVersion == 2` precondition).

In BOTH lanes, `deleted` / `missing` artifacts are terminal (skipped, counted), and a stale `deleting`
is reconciled **preserving its existing durable reason** (§5/§7).

## 4. Dual age gate (both sources must exceed the cutoff)

Default minimum age **7 days** (`-MinimumAgeDays`, `[ValidateRange(1,3650)]` — a **≥1-day floor**).
Applies to **both lanes**. A run passes only when **BOTH**:

- **Validated-manifest age** `= now − T`, where `T` is the run's durable terminal/last timestamp:
  - `completed` / `error` / `refused`: `finishedAt` if present, else `startedAt`.
  - `null` outcome: `startedAt` (there is no `finishedAt` while non-terminal).
- **Filesystem-manifest age** `= now − manifest.json LastWriteTimeUtc`.

**Fail-closed timestamp handling:** if either timestamp is missing, unparseable, or **in the future**
(clock skew / tampering), the run is treated as **NOT** past the cutoff → retained. We never delete on
an ambiguous age.

**One-day floor safety relationship (ruling G):** the 1-day floor MUST stay **above the currently
enforced 4-hour maximum analysis duration** so a `null`-outcome run past the cutoff cannot be
in-flight. This relationship is documented here and asserted in a test; **if the duration guard's
ceiling ever changes, this floor must be re-reviewed.**

> **Load-bearing safety assumption (must be stated at the gate and in review):** a `null`-outcome
> manifest could be an analysis **running right now**. The **only** guard against racing a live run is
> the age gate — the sweep lock (§8) prevents concurrent *sweeps*, not a concurrent analysis. Because
> no analysis runs for anywhere near 7 days, `startedAt` older than the cutoff + `outcome == null`
> ⟹ not in-flight. If the cutoff is ever lowered below a plausible max run duration, this assumption
> breaks. The 7-day default exists for this reason, not merely for disk economy.

## 5. Per-artifact action (reuse the V5c2a safety authority verbatim)

For each eligible run, process `manifest.mediaArtifacts` **one at a time, by index into the live
manifest** (never a scan), reusing V5c2a's exact classifier + crash-honest lifecycle:

- **`present`** → a **fresh deletion** with the lane's authorization reason: `present → deleting`
  (intent committed atomically **before** any FS delete, using the lane reason — §7) → TOCTOU
  re-validate via `Get-VideoScoutMediaDeletionSafety` → `[System.IO.File]::Delete` the **exact literal
  path** → `deleting → deleted` (`deletedAt` UTC). Absent-while-present → `missing`.
- **`deleting`** → **honest reconciliation** of crash-interrupted intent: re-validate; file gone →
  finalize `deleting → deleted`; file present + safe → complete the delete. **Preserve the artifact's
  existing durable `deletionReason`** — reconciliation must NOT rewrite why it was being deleted (a
  V5c2a-origin `deleting` keeps `completed-analysis`; a V5c2b-origin `deleting` keeps its retention
  reason). See §7.
- **`delete-failed`** → **skip by default**. With opt-in `-RetryDeleteFailed`, retry **only** when the
  recorded reason is `filesystem-delete-failed` (a transient lock/permission fault). **Never** retry
  `identity-mismatch` / `unsafe-file-type` / `reparse-point-refused` — terminal *safety* refusals;
  retrying is semantically wrong. A retry **establishes a fresh intent reason from the current lane**
  (`completed-analysis` for Lane 1; `retention-*` for Lane 2) — NOT `filesystem-delete-failed` — before
  transitioning back to `deleting`, then runs through the same `Get-VideoScoutMediaDeletionSafety`
  authority. Mechanically: reset the artifact to `present` in memory (its file is still on disk — that
  is what `filesystem-delete-failed` means) and drive it through the normal `present` path with the
  lane reason; durable state stays `delete-failed` until the fresh `deleting` intent persists.
- **`deleted` / `missing`** → terminal; skipped (counted).

Reuse **verbatim** (no re-implementation): fixed-root containment, run-dir direct-child identity,
exact-leaf, `extension==kind`, size, ordinary-file, reparse (fail-closed), TOCTOU re-validation,
atomic-manifest write, and the single literal-path `[System.IO.File]::Delete`. All from
`scripts/lib/cleanup-video-scout-media.ps1`.

## 6. Reuse map (what V5c2b calls; what it adds)

**Reused unchanged** (`cleanup-video-scout-media.ps1` / schema):
`Read-VideoScoutManifestForCleanup`, `Get-VideoScoutMediaDeletionSafety`,
`Save-VideoScoutCleanupManifest`, `Test-VideoScoutCleanupReparse`, `Get-ManifestValue`,
`Assert-VideoScoutManifestValid` (via the reader).

**New file** — `scripts/lib/retention-sweep-video-scout-media.ps1` (proposed):
- `Invoke-VideoScoutRetentionSweep -DownloadsRoot -MinimumAgeDays 7 [-Apply] [-RetryDeleteFailed]` —
  the sweep orchestrator. **Dry-run by default**; `-Apply` required to mutate. TOTAL (never throws);
  returns a bounded summary object; all diagnostics are metadata only (run IDs, counts, allowlisted
  reason constants — never a path, filename, or report/media/transcript content).
- Enumerates **direct children** of the resolved fixed root only (no recursion), skips non-directories
  / reparse-point dirs / dirs without a `manifest.json`, and routes every candidate through the shared
  authority. `DownloadsRoot` is the fixed main-owned `$OutDir` — **never a renderer-supplied value**.

**New human entry point** — `scripts/video-scout-retention-sweep.ps1` (thin CLI wrapper, dot-sources
the lib; mirrors the V5a backfill utility's manual `-Apply` pattern). Human-run in a terminal.

**Modified V5c2a-reviewed shared code (additive — the drift-safe choice; see §7):**
- `scripts/lib/cleanup-video-scout-media.ps1` — parameterize the deletion reason.
- `scripts/lib/video-scout-manifest-schema.ps1` — extend the deletion-reason allowlist.

## 7. REQUIRED SCHEMA / SHARED-CODE TRANSITION (APPROVED with restriction)

`Remove-OneVideoScoutMediaArtifact` hardcodes `deletionReason = 'completed-analysis'`. Using that for a
retention deletion of an **errored/refused/abandoned** run would be a lie. Changes:

**(A) Schema constants** (`video-scout-manifest-schema.ps1`, the ONE canonical schema):
- Extend the persisted allowlist `$VideoScoutMediaDeletionReasons` with `retention-error`,
  `retention-refused`, `retention-abandoned` (9 total). Adding allowlist *values* is
  backward-compatible — no existing manifest is invalidated or rewritten.
- Add a new constant `$VideoScoutMediaAuthorizationReasons` = the **intent subset**:
  `completed-analysis, retention-error, retention-refused, retention-abandoned`. **Failure reasons**
  (`owned-file-missing, identity-mismatch, unsafe-file-type, reparse-point-refused,
  filesystem-delete-failed`) are outcomes of a delete, and **may never be supplied as a deletion
  intent.**

**(B) Parameterize the shared deletion function** — ONE crash-honest implementation for both callers
(duplicating it = the forbidden P6 drift class):
- `Remove-OneVideoScoutMediaArtifact` gains `-DeletionReason` (default `'completed-analysis'` → V5c2a's
  call and all 25 V5c2a tests stay **byte-for-byte behavior-identical**).
- **Validate** `-DeletionReason ∈ $VideoScoutMediaAuthorizationReasons` (references the single schema
  constant, so it cannot drift). A non-authorization reason ⇒ refuse to mutate, return a failed
  outcome with the **runtime-only** warning `invalid-authorization-reason` (never persisted, like
  `manifest-update-failed`). `-DeletionReason` is always code-supplied from a fixed lane mapping, never
  from file content, so this can't be triggered by untrusted data and the TOTAL guarantee holds.
- **`present→deleting`** uses `-DeletionReason`.
- **`deleting→deleted`** finalize (and its revert-on-write-fail) uses the artifact's **existing durable
  `deletionReason`**, never a blind re-stamp — so reconciling a pre-existing `deleting` preserves its
  original reason. (Invisible for V5c2a where the reason is always `completed-analysis`; load-bearing
  once V5c2b adds a second reason.)

Small, additive, but security-critical reviewed code — the whole-diff review re-covers both files.

## 8. Bounds, caps, and the sweep lock

- **Enumeration cap (ruling C — REJECTED "process first 5,000"):** preflight inspects **at most 5,001**
  direct children. If the child count **exceeds 5,000**, **refuse the ENTIRE invocation before any
  mutation** and report `capExceeded` — never mutate a partial/arbitrary subset. Within an accepted
  ≤5,000 set, order by **ordinal name sort**. This 5,000 check runs **before any `-Apply` mutation**.
- **Mutation cap: 100 runs per invocation** under `-Apply` (a run counts as mutated if ≥1 artifact
  changed state). On reaching 100, **stop and surface cap exhaustion visibly** so the human re-runs.
  Dry-run reports the full eligible backlog within the enumeration bound (ruling B).
- **Single-process sweep lock (ruling E):** a genuinely concurrent sweep **refuses visibly**. Mechanism:
  a **non-blocking named `System.Threading.Mutex`** — `WaitOne(0)`; **`Local\` namespace** (not
  `Global\`); name suffix derived from a **SHA-256 hash of the canonical downloads root** (so distinct
  fixture roots never collide and the path is never exposed in the name); **`AbandonedMutexException`
  treated as acquired-after-crash** (a prior holder died) — proceed, then release/dispose correctly in
  `finally`. Held only for the invocation; lives in the OS mutex namespace, never in the run space.

## 9. Explicit NON-scope (out of bounds for this branch)

No recursive deletion; no glob/wildcard deletion; no directory / report / manifest deletion; **no
renderer or `main.js` changes**; no Library delete button; no startup/automatic invocation (manual
only); no OS dispatch (`shell.openPath`/open-terminal); no V5d follow-up Q&A; **no second schema or
validator**; no historical ownership inference; and **no destructive test against the real downloads
root** (`D:\Gemini_Video_Review\downloads`). Every destructive test uses a disposable `$env:TEMP`
fixture root and cleans it up. K1 note: V5c2b closes K1's **media-retention** concern; empty run
directories (manifest + optional report only) are **retained by design** — V5c2b prunes no directories.

## 10. Decision rulings (all APPROVED — recorded 2026-07-22)

- **A.** Age sources: `completed`/`error`/`refused` → `finishedAt ?? startedAt`; `null` → `startedAt`;
  second source → manifest `LastWriteTimeUtc`; missing/invalid/future → fail closed (ineligible).
  Applies to both lanes.
- **B.** The 100-run mutation cap applies only to `-Apply`; dry-run reports all eligible runs within the
  enumeration bound.
- **C.** REJECTED "process first 5,000." Preflight inspects ≤5,001 direct children; >5,000 ⇒ refuse the
  whole invocation before any mutation (`capExceeded`); no partial subset. Ordinal sort within ≤5,000.
- **D.** Reasons: `retention-error`, `retention-refused`, `retention-abandoned`.
- **E.** Non-blocking `Local\` named mutex, `WaitOne(0)`, SHA-256(root) suffix, `AbandonedMutexException`
  = acquired-after-crash (release/dispose correctly); genuine concurrency refuses visibly.
- **F.** `-RetryDeleteFailed` opt-in; retry only `filesystem-delete-failed`; never identity /
  unsafe-file-type / reparse; a retry uses the current lane's honest authorization reason as new intent.
- **G.** Default 7 days; `-MinimumAgeDays` `[ValidateRange(1,3650)]`; document + test the 1-day floor
  stays above the enforced 4-hour max analysis duration; re-review if that guard changes.

Additional standing requirements (from the approval): dry-run runs the **same classification logic**
but performs **no manifest write, file deletion, or state reconciliation**; the 5,000-child cap is
established **before any `-Apply` mutation**; manifests, reports, completed-NoFeed media, v1 history,
unowned siblings, and all ambiguous cases are preserved; **V5c2a behavior is unchanged for its current
caller**.

## 11. Test plan (tests-as-a-gate; temp fixtures ONLY; wired into the reachability meta-test)

New `scripts/lib/retention-sweep-video-scout-media.Tests.ps1` + additions to schema and lifecycle
suites. Coverage (all against throwaway `$env:TEMP` roots):
- **Lane 2 (retention):** eligible `error`/`refused`/stale-`null` runs delete only their own `present`
  media → `deleted` with the matching `retention-error`/`retention-refused`/`retention-abandoned`
  reason; manifests + reports untouched.
- **Lane 1 (completed reconciliation):** an old completed run left with a crash-missed `present` or a
  stale `deleting` is finished with `completed-analysis` (stale `deleting` preserves its durable
  reason); completed-NoFeed and completed-missing-report are preserved.
- **Ineligibility retains media:** `completed` NoFeed (`reportFile:null`), `null` but **not** stale
  (young `startedAt`), `schemaVersion:1`, backfill, SDK-empty inventory.
- **Age gate:** validated-age-old but FS-age-young (and vice-versa) → retain; future-dated / unparseable
  timestamp → retain (fail-closed).
- **Reconciliation:** a stale `deleting` (file gone → `deleted`, **original reason preserved**; file
  present+safe → completed). `delete-failed` skipped by default; `-RetryDeleteFailed` retries only
  `filesystem-delete-failed`, never identity/unsafe.
- **Ownership boundary:** unowned siblings of every kind + an arbitrary file survive; a directory that
  merely *looks* like a run (no valid manifest) is skipped; a reparse-point run dir refuses.
- **Caps/lock:** >5,000 children → whole invocation refuses (`capExceeded`), **zero** mutation; `-Apply`
  stops at 100 mutated with visible exhaustion; a second concurrent sweep refuses visibly; an abandoned
  mutex is acquired-after-crash. Also: the 1-day floor > 4-hour duration ceiling; a bad `-DeletionReason`
  refuses to mutate (`invalid-authorization-reason`).
- **Dry-run vs `-Apply`:** dry-run mutates nothing and reports the backlog; `-Apply` performs the exact
  same classification then deletes.
- **Bounded diagnostics + source tripwire:** the only FS delete is the shared single literal
  `[System.IO.File]::Delete` (no scan/glob/recursion/move); diagnostics carry no path/filename/content.
- **V5c2a regression:** the existing 25 cleanup tests + schema/lifecycle suites stay green (the
  `-DeletionReason` default keeps V5c2a behavior identical).

## 12. Review-diff rule

- Pinned diff: `git diff --output=.agent-review-v5c2b-retention-reconciliation.diff ffa27b0...<tip>`
  (three-dot from the V5c2a base; `--output`, never PowerShell `>`; gitignored).
- Full-class focus areas: deletion authority manifest-only (source tripwire); the §3 eligibility gate
  (never `completed`; NoFeed preserved; v1/backfill untouchable); the §4 dual age gate + fail-closed
  timestamps + the live-run assumption; verbatim reuse of the V5c2a safety classifier + literal-path
  delete; the §7 parameterization keeping V5c2a byte-for-byte and preserving reconciliation reasons;
  no directory/report/manifest deletion; caps + single-process lock; no renderer/main.js/OS-dispatch
  surface; temp-fixture-only destructive tests.
- Retain the literal `VERDICT: PASS|FAIL` line and its source; a summary is not a verdict.

## 13. Handoff SHAs (record at build/merge time)

Fork-point / reviewed base: `ffa27b0` (V5c2a tip). Pre-merge-main / tip / merge: recorded at merge.
Merge order for the stack remains V5b1 → V5b2 → V5c1 → V5c2a; **V5c2b merges after V5c2a**, on its own
Full-class gate. K1 closes when V5c2b is merged and gated.
