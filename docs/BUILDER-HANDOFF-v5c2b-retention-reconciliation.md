# Builder Handoff — V5c2b Cross-Run Retention / Reconciliation Sweep

Branch: `feature/v5c2b-retention-reconciliation`
Fork-point / pre-merge base SHA: `ffa27b0` (the reviewed V5c2a tip — this branch STACKS on V5c2a; it
does NOT branch from main). Baseline gates on that tip: app 939/0, Pester 478/0/0.
Tip SHA: reviewed code tip **`6541f2e`** (base implementation `95cab6d` + the LOW-1/LOW-2 delta
`aba6a1c` + the metadata safety-test delta `6541f2e`; this handoff docs commit sits on top — no
reviewed code changed by it).
Merge commit SHA: Pending human approval. Merge order: V5b1 → V5b2 → V5c1 → V5c2a → **V5c2b**.
Recorded SHAs at fork time: V5c2a base `ffa27b0`; new-branch fork `ffa27b0`; current main `23dc9d5`;
origin/main `23dc9d5`.

Tier: **FULL-CLASS** — irreversible filesystem deletion across MANY runs per invocation, and it edits
two V5c2a-reviewed shared files. It receives a whole-diff read-only review, a pinned three-dot diff, a
delta pass after any FAIL, explicit human live acceptance, and a human merge decision.

## Human live acceptance — PASS (2026-07-22)

Blue (ABlueAI) live-accepted reviewed code tip **`6541f2e`** on **2026-07-22**, against a disposable
`%TEMP%` fixture (the procedure at the end of this handoff; **no `-Apply` against the real downloads
root**). Observed:
- **PASS** — dry-run made zero changes (`manifest.json` SHA-256 unchanged, artifact `state: present`,
  `owned.srt` present, `runsMutated` = 0).
- **PASS** — `-Apply` removed only the manifest-owned media (`owned.srt`).
- **PASS** — the unowned sibling, the report file, the manifest, and the run directory all survived.
- **PASS** — the manifest records `state: deleted`, `deletionReason: retention-error`, and a populated
  `deletedAt`.
- **PASS** — disposable-fixture cleanup completed through the guarded path (direct parent == `%TEMP%`,
  leaf begins `vsret-accept-`).

Recorded here without changing reviewed code or the pinned `ffa27b0...6541f2e` diff. Merges after V5c2a
on its own human `--no-ff` merge; K1 closes when V5c2b is merged.

## One invariant

A retention sweep may delete **only** media explicitly owned by a bounded, schema-valid **V2** manifest.
Directory membership, scanning, filenames, extensions, renderer input, terminal output, or historical
inference **never** establish ownership. The deletion candidate list per run comes **exclusively** from
that run's validated `manifest.mediaArtifacts` (never a scan/glob). Manifests and reports are retained
indefinitely; **no directory, report, or manifest is ever deleted.**

## Scope (and non-scope)

Implements ONLY the manual cross-run retention/reconciliation sweep. Dry-run by default; `-Apply`
required to delete. It does **not** add any Library delete button, user-selected paths, recursive/glob
deletion, directory/report/manifest deletion, renderer/`main.js` changes, OS dispatch, startup
automation, V5d follow-up, or a second schema/validator. It reuses V5c2a's ONE deletion authority and
the ONE shared schema/validator.

## Two eligibility lanes (both require `schemaVersion==2` + the dual age gate)

1. **Completed-run reconciliation** (authorization reason `completed-analysis`): `outcome=='completed'`
   with a non-null, valid, **existing** report. Finishes stale `present` (crash-missed before V5c2a's
   immediate cleanup) and stale `deleting` (crash-interrupted V5c2a intent), and — opt-in — retries
   transient `delete-failed`. **Completed NoFeed (`reportFile:null`) and completed-missing-report are
   preserved.** *This lane exists because a V5c2a-origin `deleting` state can only occur on a completed
   run — excluding all completed runs would strand those crash-interrupted deletes forever.*
2. **Retention cleanup** (`retention-error` / `retention-refused` / `retention-abandoned`):
   `outcome ∈ {error, refused}` or a **stale** `null` outcome (interrupted/abandoned). Never touches
   schema-v1 / backfill history (guaranteed by the `schemaVersion==2` precondition).

## What shipped

- **`scripts/lib/retention-sweep-video-scout-media.ps1` (NEW)** — `Invoke-VideoScoutRetentionSweep`
  `-DownloadsRoot -MinimumAgeDays -Apply -RetryDeleteFailed [-MaxRunCandidates -MaxMutatedRuns]`. Owns
  NO deletion logic: every state transition delegates to the shared V5c2a authority
  (`Remove-OneVideoScoutMediaArtifact` / `Get-VideoScoutMediaDeletionSafety`). Contributes candidate
  enumeration (bounded), the two-lane + dual-age gate, authorization-reason selection, the single-
  process lock, and the caps. TOTAL (never throws); bounded, path-free summary.
  - **Dual age gate** (`Test-VSRetentionAgeGate`): validated-manifest timestamp
    (`completed/error/refused → finishedAt ?? startedAt`; `null → startedAt`) AND `manifest.json`
    `LastWriteTimeUtc` must BOTH exceed the cutoff. Missing / unparseable / **future** timestamps FAIL
    CLOSED. `-MinimumAgeDays` `[ValidateRange(1,3650)]` (≥1-day floor).
  - **Caps** (ruling C/B): >`MaxRunCandidates` (default 5000) → refuse the ENTIRE invocation before any
    mutation (`capExceeded`), preflight inspects ≤cap+1, never a partial subset; `-Apply` stops at
    `MaxMutatedRuns` (default 100) with `capExhausted`; ordinal sort within the accepted set.
  - **Lock** (ruling E): non-blocking `Local\` named `System.Threading.Mutex` (`WaitOne(0)`), suffix =
    SHA-256 of the lowercased canonical root (path never exposed), `AbandonedMutexException` =
    acquired-after-crash, `ReleaseMutex`+`Dispose` in `finally`; genuine concurrency refuses visibly.
  - **Retry** (ruling F): opt-in; retries ONLY `filesystem-delete-failed` with a FRESH lane intent;
    never identity / unsafe-file-type / reparse refusals.
  - **Dry-run**: runs the SAME classifier, writes nothing (reports the backlog).
- **`scripts/video-scout-retention-sweep.ps1` (NEW)** — thin human CLI wrapper (dry-run by default;
  `-DownloadsRoot` mandatory, no default, so it can never run against an unintended location).
- **`scripts/lib/cleanup-video-scout-media.ps1` (MODIFIED — the shared V5c2a authority)** —
  `Remove-OneVideoScoutMediaArtifact` gained `-DeletionReason` (default `'completed-analysis'` → V5c2a's
  caller is byte-for-byte behavior-identical). Validated against `$VideoScoutMediaAuthorizationReasons`
  (a non-authorization reason refuses to mutate → runtime-only `invalid-authorization-reason`, never
  persisted). The `present→deleting` intent uses the parameter; **every `deleting→deleted` finalize and
  revert now preserves the artifact's EXISTING durable reason**, so reconciling a pre-existing
  `deleting` never rewrites its intent.
- **`scripts/lib/video-scout-manifest-schema.ps1` (MODIFIED — the ONE schema/validator)** — the persisted
  allowlist `$VideoScoutMediaDeletionReasons` gained `retention-error/refused/abandoned` (backward-
  compatible: no existing manifest invalidated). New constant `$VideoScoutMediaAuthorizationReasons`
  (the intent subset; excludes all failure reasons). No new schema version; no second validator.
- **`scripts/lib/retention-sweep-video-scout-media.Tests.ps1` (NEW, 32 tests)** — temp-fixture-only.

## Commands run and exact results (this tree)

- Baseline (V5c2a tip `ffa27b0`): app **939/0**, Pester **478/0/0**.
- Base implementation (`95cab6d`): app 939/0, Pester 510/0/0 (478 + 32 new).
- **After the LOW-1/LOW-2 delta (reviewed code tip `aba6a1c`): app 939/0** (zero JS/`package.json`
  changed), **Pester 521/0/0** (510 + 11 new). Full suites: `powershell -NoProfile -File
  scripts\run-pester.ps1` → **521 passed / 0 failed**; `cd app && npm test` → **939 passed / 0 failed**.
- **No real Gemini request, no real download, and no deletion against the real downloads root** were
  performed. Every destructive test uses a disposable `$env:TEMP` fixture root and cleans it up.

## Manual / environment verification

- `app/node_modules` in a fresh worktree is absent (gitignored, not copied by `git worktree add`). To
  run the app gate faithfully, a directory **junction** was created matching the V5c2a worktree's setup:
  `app/node_modules → D:\Workspace\agent-command-center\app\node_modules` (the real install, which
  carries the gitignored `@huggingface/transformers` bundle `stt.test.js` needs). This junction is
  gitignored and **not part of the diff**. Without it, only `stt.test.js` fails (missing transformers
  bundle — the pre-existing environment gap documented in CHAT-HANDOFF #4), unrelated to V5c2b.

## Known limitations / honest notes

- Both lanes require the dual age gate (≥7 days by default), so reconciliation of a crash-interrupted
  `deleting` also waits out the cutoff — intentional per the rulings; the `deleting` state is honest and
  harmless meanwhile.
- V5c2b prunes no directories: after media deletion an empty-ish run dir (manifest + optional report)
  remains by design (the durable audit asset). K1's media-retention concern is what V5c2b closes.

## Recommended review focus

Deletion authority manifest-only (source tripwire); the two-lane gate (never `completed` outside the
report-durable reconciliation lane; NoFeed/missing-report preserved; v1/backfill untouchable); the dual
fail-closed age gate + ≥1-day floor > 4-hour max analysis duration; the `-DeletionReason`
parameterization keeping V5c2a byte-for-byte and preserving reconciliation reasons; retry (transient
only, fresh lane intent); caps (whole-invocation refuse; 100-cap); the `Local\` mutex (abandoned =
acquired, released in finally); TOTAL guarantee + bounded path-free diagnostics; no directory/report/
manifest deletion, no renderer/main.js/OS-dispatch; temp-fixture-only destructive tests.

## Review diff

- Pinned diff (refreshed to the final code tip): `git diff --output=.agent-review-v5c2b-retention-reconciliation.diff ffa27b0...6541f2e`
  (three-dot from the V5c2a base; `--output`, never PowerShell `>`; gitignored). 7 files, +1575/−19.
- Scoped LOW-1/LOW-2 delta: `.agent-review-v5c2b-low-delta.diff` = `git diff 95cab6d...aba6a1c` (4 files, +281/−13).
- Scoped safety-test delta: `.agent-review-v5c2b-safetytest-delta.diff` = `git diff aba6a1c...6541f2e` (2 files, +74/−12).

## Reviewer verdict

`VERDICT: PASS`

## Reviewer verdict source

Full-class whole-diff read-only review (fresh Reviewer subagent, Opus), 2026-07-22, over the pinned diff
`ffa27b0...95cab6d` plus the full worktree source of every touched production file, the schema
validator, and the dot-source scope chain. All eleven mandated focus areas confirmed by reading:
deletion authority is manifest-only (the sweep file has no direct `File::Delete`/Move/Remove-Item, no
media scan/glob; only `EnumerateDirectories` for run candidates; source tripwire enforced); the
schemaVersion-2 + dual-age + two-lane gate (completed only via the report-durable reconciliation lane;
NoFeed/missing-report preserved; error/refused/null → retention lane); the dual fail-closed age gate
(both sources must independently pass; a spoofed FS time cannot alone authorize deletion); the ≥1-day
floor above the 4-hour ceiling; the `-DeletionReason` default keeping V5c2a behavior-identical, the
authorization guard, and the `$durableReason` preservation on finalize/revert; the dot-source scope
chain placing `$VideoScoutMediaAuthorizationReasons` in the guard's scope (so the guard does not
silently fail-closed — checked specifically); retry / caps / mutex / TOTAL / dry-run / boundaries / PS
5.1 handling. The reviewer found **no** way to delete an unowned file, a report/manifest/directory, or
media of an in-flight run, and **no** change to V5c2a's existing behavior.

Three LOW findings from the base review (recorded verbatim below). **Human ruling (2026-07-22): fix
LOW-1 and LOW-2, leave LOW-3 — see the "LOW-1 / LOW-2 delta" section above for the applied fixes and the
delta `VERDICT: PASS`.**

- **LOW-1** (`retention-sweep-video-scout-media.ps1:37-39`): `$VSRetentionMaxRunCandidates` (5000) and
  `$VSRetentionMaxMutatedPerRun` (100) are defined but unreferenced — the param defaults are hardcoded
  literals (`:271-272`), as is the `1` in `[ValidateRange(1,3650)]` vs `$VSRetentionMinAgeFloorDays`.
  Behavior is correct today; a future editor changing a "constant" would not change the enforced value.
  Fix: reference the constants from the param defaults/range, or delete the unused constants.
- **LOW-2** (`video-scout-manifest-schema.ps1:203-207`): the validator accepts any full-allowlist value
  for a `deleting`/`deleted` `deletionReason` (including failure reasons). Because finalize now preserves
  `$durableReason`, a hand-crafted-but-schema-valid `deleting` carrying e.g. `identity-mismatch` would
  preserve that failure reason onto the `deleted` record. Purely a recorded-metadata oddity — the safety
  classifier still governs WHAT is deleted, so no unowned file is ever deleted and the invariant holds.
  Optional fix: require `deleting`/`deleted` reasons to be in the authorization subset.
- **LOW-3** (`retention-sweep-video-scout-media.ps1:343-346`): `capExhausted` stays `$false` if the run
  that reaches `MaxMutatedRuns` is the last candidate. Cosmetic — nothing is silently skipped.

No CRITICAL/HIGH/MEDIUM findings; no blocking issues.

## LOW-1 / LOW-2 delta — applied per human ruling (2026-07-22)

Per the human ruling, **LOW-1 and LOW-2 were fixed; LOW-3 was left unchanged** (`capExhausted:false`
is truthful when the mutation cap is reached on the final candidate — no candidate is skipped).

- **LOW-1** (`retention-sweep-video-scout-media.ps1`): removed the four unreferenced `$VSRetention*`
  mirror constants; the enforced bounds now live ONLY as explicit parameter defaults / `ValidateRange`
  (candidates 5000, mutated-runs 100, min-age default 7, floor 1). New tests read these enforced
  literals back from the module source (a change is caught, not mirrored) and behaviorally pin the
  7-day default (6-day retained, 8-day swept). No behavior changed — the sweep already used the param
  literals.
- **LOW-2** (`video-scout-manifest-schema.ps1`, the ONE validator): a `deleting`/`deleted` artifact's
  `deletionReason` must now be an AUTHORIZATION reason (`completed-analysis`/`retention-error`/
  `retention-refused`/`retention-abandoned`); failure reasons no longer validate as a durable deletion
  intent but remain valid on `delete-failed`/`missing`. Backward-compatible: V5c2a only ever writes
  `deleting`/`deleted` with `completed-analysis`, so no existing valid manifest is rejected. Focused
  schema tests prove every authorization reason is accepted and every failure reason rejected there.

**Delta gates:** Pester **521/0/0** (510 + 11 new), app **939/0**. New reviewed code tip **`aba6a1c`**.

### Delta Reviewer verdict

`VERDICT: PASS`

Source: scoped Full-class read-only delta review (fresh Reviewer subagent, Opus), 2026-07-22, over the
scoped delta `95cab6d...aba6a1c` (`.agent-review-v5c2b-low-delta.diff`) plus the full source of both
touched files, the cleanup module, and both schema/cleanup test suites. Confirmed: no removed constant
is still referenced (no NullReference/silent-zero); the enforced defaults are pinned from source +
behaviorally; the LOW-2 tightening rejects NO pre-existing valid manifest (V5c2a pairs deleting/deleted
only with `completed-analysis`; failure reasons only on delete-failed/missing); the pre-existing
`deletedAt`-null / null-reason / full-allowlist checks still fire first so no V5c2a schema-test message
is broken; the single-validator invariant holds; and V5c2a behavior is byte-for-byte (cleanup module
unchanged in the delta). No CRITICAL/HIGH/MEDIUM.

The base-review informational note (the tautological `(1 * 24) > 4` floor test) was subsequently
addressed by the safety-test delta below.

## Safety-test correction delta (`6541f2e`) — applied per human ruling (2026-07-22)

Test/bookkeeping only; **production behavior frozen at `aba6a1c`.** The tautological floor test was
replaced by one derived from real enforced parameter metadata:
- retention floor (days) = the `MinimumAgeDays` `ValidateRange` **minimum** read from
  `(Get-Command Invoke-VideoScoutRetentionSweep).Parameters['MinimumAgeDays']` → **1**;
- duration ceiling (seconds) = the `MaxDurationSeconds` `ValidateRange` **maximum** read from
  `(Get-Command scripts/feed-gemini.ps1).Parameters['MaxDurationSeconds']` → **14400** (the real 4-hour
  guard, `feed-gemini.ps1:56` `[ValidateRange(1, 14400)]`; the duration guard is neither refactored nor
  mirrored);
- asserts BOTH attributes were discovered (`Should Not BeNullOrEmpty`) and
  `floor_days × 86400 > ceiling_seconds` (**86400 > 14400**, ~6× margin).
The test now **fails** if the retention floor decreases, the duration ceiling rises past 86400, or
either attribute becomes undiscoverable. LOW-3 remains intentionally unchanged.

**Delta gates:** Pester **521/0/0** (unchanged — one `It` replaced by one `It`), app **939/0**.

### Safety-test delta Reviewer verdict

`VERDICT: PASS`

Source: final scoped Full-class read-only delta review (fresh Reviewer subagent, Opus), 2026-07-22,
over `aba6a1c...6541f2e` (`.agent-review-v5c2b-safetytest-delta.diff`) plus the test file, the sweep
module, and `feed-gemini.ps1`. Confirmed: the only non-doc file changed is the test; the sweep/schema/
cleanup/wrapper are byte-identical to `aba6a1c` (no production change); the test is a genuine
metadata-derived assertion (no literal/mirror on either side); it fails closed on floor-decrease,
ceiling-increase (strict `BeGreaterThan`), and attribute-undiscoverable; it reads the floor from the
public `Invoke-VideoScoutRetentionSweep` `ValidateRange` (not the private helper's bare `[int]`); and
`Get-Command` reads `feed-gemini.ps1` metadata without executing it. No findings.

## Human live-acceptance procedure — disposable fixture ONLY (do NOT `-Apply` against the real root)

Build a throwaway fixture root under `%TEMP%`, then prove dry-run mutates nothing and `-Apply` removes
only the manifest-owned media. Paste into PowerShell from the worktree root
(`D:\Workspace\agent-command-center\.worktrees\v5c2b-retention-reconciliation`):

```powershell
# 0) Build a disposable fixture: one ERROR run, >7 days old, owning exactly one .srt, plus an unowned
#    sibling, an unrelated report, and (implicitly) the manifest + directory.
. .\scripts\lib\retention-sweep-video-scout-media.ps1
$root = Join-Path $env:TEMP ('vsret-accept-' + [guid]::NewGuid().ToString('N'))
$runDir = Join-Path $root 'run-20260101-101010-101-2222-abcdef01'
New-Item -ItemType Directory -Path $runDir -Force | Out-Null
$old = (Get-Date).ToUniversalTime().AddDays(-30).ToString('yyyy-MM-ddTHH:mm:ss.fffZ')
$m = New-VideoScoutLiveManifest -RunId 'run-20260101-101010-101-2222-abcdef01' -AppliedMode transcript -Route cli -MediaResolutionRequested MEDIUM
$m.startedAt = $old; $m.finishedAt = $old; $m.outcome = 'error'; $m.reason = 'fixture'
$m.mediaArtifacts = @([ordered]@{ fileName='owned.srt'; kind='transcript'; sizeBytes=3; recordedAt=$old; state='present'; deletedAt=$null; deletionReason=$null })
[void](Write-VideoScoutManifestFile -RunDir $runDir -Manifest $m)
(Get-Item (Join-Path $runDir 'manifest.json')).LastWriteTimeUtc = (Get-Date).ToUniversalTime().AddDays(-30)
Set-Content -LiteralPath (Join-Path $runDir 'owned.srt')     -Value 'abc' -Encoding ASCII -NoNewline   # owned (size 3)
Set-Content -LiteralPath (Join-Path $runDir 'unowned.srt')   -Value 'zzzz' -Encoding ASCII -NoNewline  # unowned sibling
Set-Content -LiteralPath (Join-Path $runDir 'analysis.txt')  -Value 'a report' -Encoding ASCII         # unrelated report file

# 1) DRY-RUN — expect eligibleRetention=1, deleted=1 (WOULD), runsMutated=0; nothing changes on disk.
$dry = .\scripts\video-scout-retention-sweep.ps1 -DownloadsRoot $root
Test-Path (Join-Path $runDir 'owned.srt')   # True  (dry-run mutated nothing)

# 2) APPLY — against the disposable fixture only.
$apply = .\scripts\video-scout-retention-sweep.ps1 -DownloadsRoot $root -Apply

# 3) VERIFY: only the owned media was removed; sibling/report/manifest/directory survived.
Test-Path (Join-Path $runDir 'owned.srt')     # False -> owned media deleted
Test-Path (Join-Path $runDir 'unowned.srt')   # True  -> unowned sibling survived
Test-Path (Join-Path $runDir 'analysis.txt')  # True  -> report file survived
Test-Path (Join-Path $runDir 'manifest.json') # True  -> manifest survived
Test-Path $runDir                             # True  -> directory survived (never pruned)

# 4) VERIFY the manifest records the correct retention reason for the deleted artifact.
$disk = Get-Content (Join-Path $runDir 'manifest.json') -Raw | ConvertFrom-Json
$disk.mediaArtifacts[0].state           # deleted
$disk.mediaArtifacts[0].deletionReason  # retention-error   (error run -> retention-error)
$disk.mediaArtifacts[0].deletedAt       # a UTC timestamp

# 5) Clean up the disposable fixture.
Remove-Item -LiteralPath $root -Recurse -Force
```

A **real-root dry-run remains optional and read-only**:
`.\scripts\video-scout-retention-sweep.ps1 -DownloadsRoot 'D:\Gemini_Video_Review\downloads'` (no
`-Apply`). **Do NOT run `-Apply` against the real downloads root before merge authorization.**

## Review-diff rule

- **Final reviewed code tip: `6541f2e`.** The complete reviewed delta is `git diff ffa27b0...6541f2e`
  (7 files, +1575/−19; pinned to `.agent-review-v5c2b-retention-reconciliation.diff`).
- Before merge, the three-dot review delta is `git diff main...6541f2e`. After merge, reproduce the
  identical reviewed delta with `git diff <recorded-pre-merge-main>...6541f2e` (`git diff main...6541f2e`
  goes empty once the tip is an ancestor of `main`). `--output`, never PowerShell `>`.
- Retain the literal base `VERDICT: PASS`, delta `VERDICT: PASS` (LOW-1/LOW-2), and delta `VERDICT: PASS`
  (safety test) lines verbatim.
