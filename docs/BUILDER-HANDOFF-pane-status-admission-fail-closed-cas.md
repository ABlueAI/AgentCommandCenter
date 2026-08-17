# Builder Handoff — Pane-status admission fail-closed/CAS correction

Date: 2026-08-17  
Branch: `codex/pane-status-admission-fail-closed-cas`  
Forked from failed-review handoff tip: `9c076025741dc74663fd86b352727edfe1368fa7`  
Pre-merge `main`: `5bbe3635736f18c9b8d4b50a23c7b51955f7bd0f`  
Corrective content tip: `1a3b11b175e1fd7dd29fe9efb645776ea01c5ab0`  
Merge commit: pending; nothing merged or pushed

The handoff-only branch tip is the commit containing this document and must be read from the branch
ref. A commit cannot truthfully contain its own SHA.

## Intended invariant

The admission ledger must never turn a rejected live reload into an empty ledger, and two ordinary
Blue Helm processes must never spend the same admission. Every controlled PTY writer still follows:

`validate → decrement → validated reload → durable locked CAS → PTY write`

Any reload, integrity, lock, revision, or persistence failure refuses before the PTY writer. A writer
failure after a successful durable admission remains consumed and is not refunded.

## Procurement and threat decision

Tracked procurement record: `docs/OSS-PROCUREMENT-pane-status.md`.

Canonical verdict, verbatim:

> BUILD FRESH — Pane status: build Blue Helm’s production pane-status subsystem as an advisory-only,
> human-facing indicator using official provider lifecycle interfaces and the reviewed Experiment A
> architecture. Provider events are unauthenticated hints and must never authorize or automatically
> trigger merge, push, approval, pane closure, process control, restart, credential access, or another
> consequential action. Begin with Claude Code only; fail closed to unknown for unverified versions;
> require explicit reversible hook setup and removal; keep logs metadata-only; preserve the
> Experiment A provenance limitation as an accepted residual.

Blue threat-boundary decision, verbatim:

> I ACCEPT THE ADMISSION LEDGER AS AN ACCIDENTAL-SPEND CONTROL, NOT A SECURITY BOUNDARY AGAINST A MALICIOUS OR COMPROMISED SAME-USER PANE. CORRECT THE FALSE PROVIDER-INACCESSIBILITY CLAIMS, REMOVE THE UNREACHABLE ROLLBACK GUARD, AND RETURN FOR FULL REVIEW.

This correction does not change that boundary. The checksum/revision is unkeyed. A same-user process
can recompute it, an older valid ledger can be replayed, and deletion permits a fresh run. The new
lock and CAS coordinate ordinary Blue Helm processes; they are not authentication, hostile-tamper
resistance, rollback prevention, or same-user isolation.

## Failed-review findings resolved

### 1. Rejected live reload no longer becomes `emptyLedger()`

- Removed `currentDoc()` and its failure-to-empty fallback.
- Every mutation performs a fresh validated `storage.load()` before `storage.save()`.
- Only an actual `not-found` observed for first-run creation may use an empty ledger.
- Integrity mismatch and transient read failure latch a bounded fatal refusal before `save`.
- The exact regression proves: mismatch → refusal → zero save calls → zero PTY writes → rejected
  bytes unchanged. A real-filesystem integration proves the same byte identity.

### 2. Duplicate-process spend is closed

- `app/main.js` calls Electron `requestSingleInstanceLock()` exactly once.
- A losing process calls `app.quit()` and never enters `whenReady()`/window creation.
- The primary handles `second-instance` by restoring, showing, and focusing its existing window.
- Ledger loads return their verified checksum as a revision token.
- Saves require an expected revision, take a fixed `wx` lock, reload beneath the lock, compare the
  revision, and only then atomically replace the canonical file.
- A stale revision or held lock returns visible `admission-ledger-conflict`; it never overwrites.
- Unit and real-filesystem integration races against a one-turn ledger prove exactly one admission,
  one refusal, `admitted: 1`, and one PTY write total.

## Files changed in the corrective content commit

- `BLUE-HELM-MASTER-STATUS.md`
- `app/admission-budget.js`
- `app/admission-budget.test.js`
- `app/admission-budget-store.js`
- `app/admission-budget-store.test.js`
- `app/admission-ui-integration.test.js`
- `app/main.js`
- `app/package.json`
- `app/renderer/admission-view.js`
- `app/renderer/admission-view.test.js`
- `app/single-instance.js`
- `app/single-instance.test.js`

No dependency or lockfile changed. No provider session, pane-status hook, paid prompt, app server, or
remote TUI was launched. The Electron processes launched by `npm test` were the repository's inert
local renderer test harnesses.

## Test gates

Focused final results:

| Suite | Result |
| --- | ---: |
| `admission-budget.test.js` | 231 passed, 0 failed |
| `admission-budget-store.test.js` | 81 passed, 0 failed |
| `admission-ui-integration.test.js` | 167 passed, 0 failed |
| `renderer/admission-view.test.js` | 134 passed, 0 failed |
| `single-instance.test.js` | 14 passed, 0 failed |
| `quick-links-integration.test.js` | 43 passed, 0 failed |

Complete application gate: `npm test` — PASS, exit 0.

The final census counted both supported summary formats:

- 64 chain entries, 64 unique;
- 62 `N passed, 0 failed` summaries plus 2 `N assertions passed` summaries;
- 64 reporting suites;
- 4,732 assertions passed, 0 failed.

Reconciliation from the reviewed 4,673 baseline:

`4,673 + 14 single-instance + 16 budget + 12 store + 14 integration + 3 view = 4,732`.

Pester under native Windows PowerShell: `955 passed, 0 failed, 0 skipped`.

The first sandboxed `pwsh` attempt was rejected as non-authoritative after it produced environment
failures (user Git-ignore permission denial and host-specific Windows argument behavior). The required
native `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\run-pester.ps1` rerun passed
all 955 tests.

`git diff --check` — PASS. The full app gate also re-proved Quick Links' 141-byte legacy anchor,
Dockview script reachability, and the fenced-role/PTY invariants.

## Review artifacts

Controlling complete cumulative artifact:

- file: `.agent-review-admission-fail-closed-cas-cumulative.diff`
- range: `5bbe3635736f18c9b8d4b50a23c7b51955f7bd0f...1a3b11b175e1fd7dd29fe9efb645776ea01c5ab0`
- shortstat: 24 files changed, 6,325 insertions, 12 deletions
- bytes: 387,670
- SHA-256: `e8a61a28be427e5dec8d20682dce1d97d4a126b3367eab4417d03d6076813d7b`

Focused corrective artifact only:

- file: `.agent-review-admission-fail-closed-cas-focused.diff`
- range: `9c076025741dc74663fd86b352727edfe1368fa7...1a3b11b175e1fd7dd29fe9efb645776ea01c5ab0`
- shortstat: 12 files changed, 528 insertions, 72 deletions
- bytes: 63,025
- SHA-256: `3785fc7acc562bb669dcdfff940a0c66001c33cb8b276e5053237a1cb59b918a`

The prior pinned artifacts were not overwritten. A reviewer must regenerate each artifact to a
separate temporary file with `git diff --output`, compare byte identity, and delete only that
temporary reproduction.

## Known limitations

- A crash while owning the fixed lock may leave a lock file behind. That fails closed as a visible
  conflict until the operator diagnoses and removes that specific stale lock; it never admits.
- Single-instance and CAS coordination cover ordinary cooperating Blue Helm processes, not a
  malicious same-user process that ignores/deletes the lock or rewrites a valid checksum.
- The accepted replay and deletion residuals remain exactly as recorded in Master Status.

## Required independent review

This is builder-authored correction work and is not self-approved. Before merge, commission a fresh
independent Full-class reviewer who did not author the admission implementation, the earlier
threat-boundary correction, or this correction. Review the complete cumulative artifact as the
controlling range; use the focused artifact only to isolate the two failed-review fixes. Reproduce
both reviewer failures, rerun all gates, and report findings Critical → High → Medium → Low.

Reviewer verdict: pending.
