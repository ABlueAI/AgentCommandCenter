# Builder Handoff — Main-Owned Turn Admission Budget

Branch: `feature/pane-status-admission-budget`
Worktree: `.worktrees\pane-status-admission-budget`
Fork-point SHA: `a2121ca36727bbb3294fd61a057f13730b8a1d17`
Pre-merge `main` SHA: `a2121ca36727bbb3294fd61a057f13730b8a1d17`
Reviewed content tip: `5f8cb59d7a17334a06735816d45160352e987f32`
Branch tip: the handoff-only tail commit that pins the review artifact
Merge commit SHA: **Pending until merge**

**Status: NOT MERGED, NOT PUSHED, NOT REVIEW-READY AGAINST THE FINAL BASE.** This branch stops for an
independent **Full-class** review, and see § 11 — Quick Links lands first, so this branch must be
rebased and re-reviewed before it can merge.

## 0. Blue authorization — verbatim

> I SELECT TURN-ACCOUNTING OUTCOME B. THE FOURTH TURN REMAINS UNEXPLAINED. NO LIVE PANE-STATUS PROVIDER SESSION IS AUTHORIZED UNTIL THE MAIN-OWNED ADMISSION BUDGET IS REVIEWED AND LANDED.

**No live pane-status provider session occurred during this work order, and none is authorized by it.**
See § 6.

## 1. Procurement record and verdict

Tracked OSS procurement decision record: **`docs/OSS-PROCUREMENT-pane-status.md`** (§ 13; the record
ends with the canonical verdict line).

**Blue stated, verbatim:**

> APPROVE BUILD FRESH VERDICT
>
> BUILD FRESH — Pane status: build Blue Helm’s production pane-status subsystem as an advisory-only,
> human-facing indicator using official provider lifecycle interfaces and the reviewed Experiment A
> architecture. Provider events are unauthenticated hints and must never authorize or automatically
> trigger merge, push, approval, pane closure, process control, restart, credential access, or another
> consequential action. Begin with Claude Code only; fail closed to `unknown` for unverified versions;
> require explicit reversible hook setup and removal; keep logs metadata-only; preserve the
> Experiment A provenance limitation as an accepted residual.

**Canonical subsystem verdict: `BLUE SUBSYSTEM VERDICT: BUILD FRESH`**

**This branch implements ONLY turn admission.** It does not begin pane-status production completion.
No status normalization, lifecycle, UI, provider onboarding, hook installation, or badge work is
included. The relationship to pane status is one-directional and negative: the budget exists to bound
a future controlled pane-status evidence run, and **nothing in `app/prototype-pane-status/` can reach
the ledger** — asserted by a source tripwire, not by convention (§ 5, required test 17).

## 2. Intended invariant

**One invariant: main owns a durable, bounded, per-pane admission budget that caps paid prompts
independently of Claude Code and independently of the pane-status hook being tested.**

The ten core rules from the work order, and where each is enforced:

| # | Rule | Enforced at |
| --- | --- | --- |
| 1 | Main owns the allowance and the persistent ledger | `admission-budget.js` + `admission-budget-store.js`, constructed in `main.js` at app-ready |
| 2 | The allowance is explicit, bounded, assigned to one pane | `admission-budget-config.js` (`MAX_ALLOWANCE = 10`, integer lexical form) + the once-only pane claim |
| 3 | Direct terminal input to that pane is disabled | `main.js` `ipcMain.on('pty-write')` → `admissionIpc.refuseDirectWrite(id)` |
| 4 | Only the controlled path may send a prompt | `admission-ipc.js` `handleSubmitPrompt`, gated by `trusted-ipc-sender.js` |
| 5 | Main decrements **before** writing to the PTY | `admission-budget.js` `submitPrompt` — validate → decrement → **persist** → writer |
| 6 | Prompt N+1 is visibly refused and never reaches the PTY | `REASON.EXHAUSTED`, surfaced on the `main-error` Logs channel |
| 7 | Restarting cannot restore consumed turns | ledger load-not-create; plan-mismatch refusal; stale-binding refusal |
| 8 | Hooks may be compared with the ledger but can never change it | there is no mutation method to call (§ 5, test 17) |
| 9 | Failure after decrement remains consumed — fail closed | `REASON.WRITE_FAILED_AFTER_ADMISSION`, deliberately not refunded |
| 10 | Pane status remains advisory and triggers nothing | unchanged by this branch; no pane-status module imports admission |

## 3. Files changed

| File | Kind | Change |
| --- | --- | --- |
| `app/admission-budget-config.js` | **added** | Startup configuration boundary: parses the plan once from this process's environment, fails closed to disabled/zero, and exports the exact key list stripped from every child PTY environment |
| `app/admission-budget.js` | **added** | The pure admission state machine — injected storage/clock/writer/logger; the decrement-persist-write ordering; pane binding; the three run states; the rollback tripwire |
| `app/admission-budget-store.js` | **added** | The durable ledger boundary under Electron `userData`: atomic replace, byte bound, reparse/not-regular refusals, and `not-found` as the ONLY creatable state |
| `app/admission-ipc.js` | **added** | The two surfaces: the `pty-write` block decision (throttled visible refusal) and the trusted-gated controlled-prompt handler |
| `app/admission-budget-config.test.js` | **added** | 77 assertions |
| `app/admission-budget.test.js` | **added** | 205 assertions |
| `app/admission-budget-store.test.js` | **added** | 35 assertions |
| `app/admission-ipc.test.js` | **added** | 135 assertions |
| `app/main.js` | modified | Plan parsed once at startup; budget/store/IPC constructed at app-ready; `ptyEnv` built from the scrubbed environment copy; pane claim at `pty-start`; direct-write block on `pty-write`; run closed on `pty-exit` and `pty-kill`; third preload token |
| `app/preload.js` | modified | `window.ccAdmission` — **absent** unless main forwarded the controlled-run token; exactly two invokes, no setter, no send channel |
| `app/package.json` | modified | Four new suites wired into the `test` chain (52 → 56 entries) |
| `app/launcher-fence-invariant.test.js` | modified | **Byte-invariance tripwire re-pinned — see § 4.** Six new content assertions added |

**No PowerShell changed.** No `.ps1`, no `.psd1`, no `scripts/` file. Pester was therefore not
required and was not run.

**No renderer UI was added.** `app/renderer/app.js` is untouched — deliberately, see § 8.

## 4. Security-sensitive surfaces touched — READ THIS SECTION

### 4.1 The `pty-start` byte-invariance tripwire fired, and was re-pinned

`app/launcher-fence-invariant.test.js` pins sha256 hashes over byte-exact slices of `app/main.js`. It
failed on this branch, **which is exactly what it is for**. The change is legitimate and unavoidable:
bounding paid turns requires touching the PTY boundary, because that boundary is where a paid prompt
becomes a real cost.

| Region | Before | After | Change |
| --- | ---: | ---: | --- |
| `fenced-role cwd gate` | 1354 / `ae9dce92…` | **1354 / `ae9dce92…`** | **BYTE-IDENTICAL** — the same hash as the original reviewed base. The credential/fence containment logic has still never been touched by any re-pin |
| `ptyEnv block` | 236 / `cd100743…` | 271 / `2a399a98…` | ONE substitution, +35 bytes: `...process.env` → `...admissionConfig.stripAdmissionEnv(process.env)` |
| `pty-start handler` | 9913 / `67cb161c…` | 12443 / `b5fe654e…` | Three additions, no deletions, no reordering: the ptyEnv comment + the +35 above; the pane-claim block after a successful spawn; `p.onExit` growing to also void the run |

**What a reviewer should independently re-verify:** that the fenced-role gate really is unchanged;
that `CLAUDE_CODE_SUBPROCESS_ENV_SCRUB: '1'` is still unconditional; that the video-scout key
injection is still scoped to video-scout panes; and that the new `ptyEnv` base cannot reintroduce the
admission keys. All four are now **content assertions** in the tripwire, so a future re-pin cannot
drop them along with a hash. Prior hashes for all three reviewed bases are retained in the file.

### 4.2 PTY input interception

`ipcMain.on('pty-write')` is the single chokepoint every renderer input route already converges on —
`term.onData` (typing), `clipboard-consumer` (paste), the STT delivery at `app/renderer/app.js:1382`,
and any shell-input helper all call `cc.ptyWrite`. Blocking in main rather than per call site is what
makes the block complete: a control character, an Enter, a bracketed paste, or a call site added later
by someone who never read the comment all hit the same line.

### 4.3 Prompt injection boundary

`admission-submit-prompt` is invoke-only and gated by the canonical `trusted-ipc-sender.js`. The
prompt is bounded to 4,000 characters and **every C0 control character, DEL, and C1 control character
is rejected** — deliberately broader than "no newlines", so a prompt cannot carry a terminal escape
sequence and cannot embed a submission terminator to get two prompts out of one admission. Main
appends the terminator (`\r`), exactly once, and the caller cannot supply one.

### 4.4 Credential and content hygiene

No credential is read, written, or logged. **Prompt content never leaves the boundary**: it is read in
exactly two places in `admission-ipc.js` (validate, then hand to the budget) — asserted by a source
tripwire — and appears in no log line, no refusal payload, no Error message, and no persisted field.
The persisted record is asserted to hold **only** `runId`, `paneId`, `allowance`, `admitted`,
`refused`, `state`, `createdUtc`, `updatedUtc`.

### 4.5 Cost direction

Every ambiguous path resolves toward **spending less**: a persistence failure writes nothing; a writer
failure after a durable decrement is not refunded; a crash between persist and write loses a turn
rather than creating one; a dead PTY consumes nothing; a stale binding refuses; a raised allowance on
restart refuses.

## 5. Exact test results

**Full application gate: `npm test` — PASS, exit 0.**

| Metric | Base `a2121ca3` | This branch | Delta |
| --- | ---: | ---: | ---: |
| Chain entries (`node` invocations in `app/package.json` "test") | 52 | **56** | **+4** |
| Total assertions passed | 3,660 | **4,118** | **+458** |
| Total assertions failed | 0 | **0** | 0 |

**Delta reconciliation — the +458 is fully accounted for:**

| Source | Assertions |
| --- | ---: |
| `admission-budget-config.test.js` (new) | 77 |
| `admission-budget.test.js` (new) | 205 |
| `admission-budget-store.test.js` (new) | 35 |
| `admission-ipc.test.js` (new) | 135 |
| `launcher-fence-invariant.test.js` (15 → 21, six new content assertions) | +6 |
| **Total** | **458** |

No pre-existing suite's count changed other than the tripwire, and no pre-existing assertion was
weakened or deleted.

**Base figures were established by direct measurement**, not assumption: the base
`launcher-fence-invariant.test.js` has exactly 15 assertions (verified by running the base file, which
reports 9 passed + 6 failed = 15 when its pinned CRLF hashes are evaluated against an LF extraction),
and the base chain has 52 entries (read from `git show a2121ca3:app/package.json`).

### 5.1 Required-test coverage map

| # | Required test | Where | Result |
| --- | --- | --- | --- |
| 1 | Disabled / default-zero refuses | config + budget | PASS |
| 2 | Allowance N admits exactly N | budget | PASS |
| 3 | Prompt N+1 refuses, zero PTY writes | budget | PASS |
| 4 | Decrement happens before the writer is invoked | budget — the writer snapshots the **persisted** ledger at call time; all three snapshots already count their own admission | PASS |
| 5 | Writer failure after decrement does not refund | budget — both a throwing and an async-rejecting writer | PASS |
| 6 | Persistence failure produces no write | budget — both a refusing and a throwing storage | PASS |
| 7 | Restart preserves consumed count | budget | PASS |
| 8 | Malformed / missing / stale / version-mismatched ledgers fail closed | budget (13 hostile documents) + store (8 hostile files) | PASS |
| 9 | Concurrent requests cannot overspend the last admission | budget — 2-way race on the last admission, and 10-way against an allowance of 2 | PASS |
| 10 | A budget cannot move between panes | budget | PASS |
| 11 | Pane exit does not transfer or reset remaining admissions | budget | PASS |
| 12 | Direct terminal typing is blocked for the controlled pane | ipc | PASS |
| 13 | Paste, dictation, shell input, Enter, control characters cannot bypass | ipc (14 byte shapes) + budget (prompt validator) | PASS |
| 14 | Uncontrolled panes retain existing input behavior | ipc | PASS |
| 15 | Wrong window / sender / subframe / document / torn-down frame refuse | ipc — driven through the **real** `trusted-ipc-sender.js`, 8 negative cases plus a positive control | PASS |
| 16 | Renderer cannot set, increase, reset, or certify the allowance | ipc — surface shape, channel names, and a preload source tripwire | PASS |
| 17 | Provider / hook events cannot mutate the ledger | budget — the mutation methods do not exist; no `prototype-pane-status/*.js` imports an admission module | PASS |
| 18 | Admission configuration is absent from the child PTY environment | config — plus completeness: every `ENV_*` constant must be in the scrub list | PASS |
| 19 | Prompt sentinels never enter logs, errors, persisted metadata, or IPC payloads | budget + ipc — a distinctive sentinel is scanned across all four surfaces | PASS |
| 20 | Restart and crash-window negative controls cannot create an extra admission | budget — restart, no-rebind restart, crash-between-persist-and-write, configuration top-up, and a different run id | PASS |
| 21 | Test-chain reachability and source tripwires cover every new module | `test-reachability.test.js` (all four wired) + tripwires in each new suite and in the fence invariant | PASS |

### 5.2 Restart, crash-window and negative-control results

| Scenario | Observed |
| --- | --- |
| Restart, same run id, 2 of 3 consumed | Loads `admitted = 2`, `remaining = 1`. The 4th prompt still refuses |
| Restart without `REBIND=1` | `admission-pane-binding-stale` — the remainder is unreachable pending human disposition; zero writes |
| Crash between persist and write | The admission is still consumed after restart. No extra turn was created |
| Configuration top-up (allowance 3 → 9, same run) | `admission-ledger-plan-mismatch`; zero writes |
| New run id | Gets its own record at zero; the first run's consumed count is untouched; both coexist |
| Ledger rolled back beneath a live run | The live in-memory count stays authoritative and re-persists over it; no turn granted |
| Pane exits with 2 remaining | Run `CLOSED`, remainder VOID, another pane's claim refused |
| Persist fails mid-admission | In-memory decrement rolled back, zero writes, and the budget stays refusing (no self-healing) |
| Writer throws after persist | Consumed, not refunded, reported as `admission-write-failed-after-admission` |

## 6. Commands run — and what was NOT run

Read-only Git, Node test execution, and one local filesystem junction.

* `git fetch origin --prune`, `git rev-parse`, `git log`, `git status --porcelain`, `git worktree add`
* `node app/<suite>.test.js` for each new suite; `npm test` for the full gate
* `git diff --check`, `git diff --name-status`, `git diff --shortstat`, `git diff --output`, `cmp`,
  `sha256sum`
* `New-Item -ItemType Junction` to point this worktree's `app/node_modules` at the repository's own —
  the established pattern in the other worktrees. It is a local, gitignored dev artifact and installs
  nothing.

**No live provider session occurred.** Explicitly NOT done, at any point:

* **No Claude Code launch, no provider pane, no prompt sent, and no provider turn consumed.**
* No hook installed, modified, or removed. `~/.claude/settings.json` was never opened.
* No app-server, no listener, no Electron launch, no `npm start`.
* No credential read, written, or logged. No `secure.json` access.
* No account, key, or network write of any kind.

## 7. Manual verification

**Before any edit:**

* `git fetch origin --prune` run for real; `main` = `origin/main` = `a2121ca36727bbb3294fd61a057f13730b8a1d17`,
  matching the work order's expected starting main exactly.
* The worktree was created at exactly that SHA and verified with `git rev-parse HEAD`.
* The root worktree carried only `?? .worktrees/` — no unrelated or user-owned change was disturbed.

**After the edits:**

* `git diff --check` clean (exit 0).
* Changed-file list is exactly the twelve entries in § 3; nothing outside `app/` and `docs/`.
* No `.ps1`, `.psd1`, or `scripts/` file changed.
* `main` and `origin/main` remain at `a2121ca36727bbb3294fd61a057f13730b8a1d17`.
* The fenced-role cwd gate hash was independently recomputed and matches the ORIGINAL reviewed base.

## 8. Known limitations

* **A local file ledger cannot defend against an operator with filesystem access.** Deleting
  `admission-ledger.json` outright returns the run to "never created", and the next start would mint a
  fresh allowance. The design raises the cost of that — one file holds every run, so a targeted
  deletion is a wholesale one, and an in-session rollback is caught by the high-water tripwire — but
  this is a **bound against accident and against the provider process, not against the human running
  the app.** Blue is the human running the app, so this is the correct threat model; it is stated so
  the control is not read as stronger than it is.
* **The cross-process rollback case is only partly covered.** A brand-new process cannot detect a
  rollback it never witnessed. The tripwire protects a live run; a restart over a restored ledger will
  adopt the restored count. Same threat model as above.
* **No controlled-run UI was built.** `app/renderer/app.js` is untouched, deliberately: Quick Links is
  landing in the same renderer surface (§ 11), and the work order made a UI optional ("may show"). The
  required visible refusal is delivered through the existing `main-error` → Logs tab channel that
  every other main-process refusal already uses. **If Blue wants an in-pane refusal banner and a
  remaining-allowance readout, that is a separate small branch** — the preload surface
  (`ccAdmission.getState()`) is already there for it.
* **The pane binding is claimed at runtime, not configured.** Renderer pane ids (`pty1`, `pty2`, …) are
  minted per session, so the run binds to the first eligible pane rather than to a name Blue chose in
  advance. `BLUE_HELM_ADMISSION_PANE_ID` can pin one if Blue knows it. The consequence is that after a
  restart the binding is stale and refuses until `BLUE_HELM_ADMISSION_REBIND=1` is set — conservative,
  but it means an interrupted run needs one deliberate environment change to continue.
* **Concurrency is serialized by refusing, not by queueing.** A second simultaneous submission is
  refused with `admission-already-in-flight` rather than waiting. That can lose a legitimate prompt; it
  can never double-spend one. For a human-driven evidence run this is the right trade.
* **`MAX_ALLOWANCE = 10` and `MAX_PROMPT_CHARS = 4000` are chosen bounds, not derived ones.** Both are
  conservative starting values for Blue to accept or change.
* **This is unit-proven, not run-proven.** Every behaviour above is demonstrated against fakes. The
  budget has never bounded a real PTY, because doing so would require the live session the
  authorization forbids. **A passing suite is not a proven live control**, and the first controlled run
  should still be watched by a human.

## 9. Unexpected pre-existing findings

* **The `pty-start` byte-invariance tripwire is now on its third re-pin.** It is working exactly as
  designed, but three re-pins in three branches is a signal worth naming: the region it pins is
  becoming a busy intersection. The content assertions added here (and in the two prior re-pins) are
  what keep it meaningful; if a fourth re-pin arrives, it may be worth splitting the pinned region so
  the credential-critical part and the lifecycle part are pinned separately.
* **`TextDecoder`'s `ignoreBOM` flag reads backwards, and the existing comment in
  `dockview-layout-store.js` describes it incorrectly.** `ignoreBOM: false` (the default) *strips* a
  leading BOM; it does not surface it as U+FEFF. The dockview comment claims the opposite. This branch
  did **not** change `dockview-layout-store.js` — out of scope — but the new admission store rejects a
  BOM by explicit byte check rather than relying on the decoder, and says why. **Worth a separate
  one-line correction to the dockview comment.**
* **A fresh worktree has no `app/node_modules`**, so `npm test` fails at
  `dockview-package-identity.test.js` with an unhandled `ENOENT` rather than a clean refusal. The
  established fix is the junction (§ 6). A friendlier pre-flight message would save the next builder a
  confusing stack trace.

## 10. Review artifacts

### Commit shape

| Field | Value |
| --- | --- |
| Base (pre-merge `main`) | `a2121ca36727bbb3294fd61a057f13730b8a1d17` |
| **Reviewed content tip** | **`5f8cb59d7a17334a06735816d45160352e987f32`** |
| Branch tip | the handoff-only tail commit that pins this table |

### The pinned artifact

| Artifact | Range | Shortstat | Size | SHA-256 |
| --- | --- | --- | ---: | --- |
| `.agent-review-pane-status-admission-budget.diff` | `a2121ca3...5f8cb59d` | 13 files, 3,308 insertions, 8 deletions | **187,699** | `4fc2ed34cc049b603233e564874cc1ee854388af7a8c8ff000d14cc5d99290a6` |

Created with `git diff --output` (never PowerShell `>`), gitignored via `.gitignore:33`, and
**regenerated from its stated range to a separate temporary file and proven byte-identical with
`cmp`**; only the temporary copy was removed.

### Changed-file list

**Range** `a2121ca3...5f8cb59d`:

| Status | Path |
| --- | --- |
| `A` | `app/admission-budget-config.js` |
| `A` | `app/admission-budget-config.test.js` |
| `A` | `app/admission-budget-store.js` |
| `A` | `app/admission-budget-store.test.js` |
| `A` | `app/admission-budget.js` |
| `A` | `app/admission-budget.test.js` |
| `A` | `app/admission-ipc.js` |
| `A` | `app/admission-ipc.test.js` |
| `A` | `docs/BUILDER-HANDOFF-pane-status-admission-budget.md` |
| `M` | `app/launcher-fence-invariant.test.js` |
| `M` | `app/main.js` |
| `M` | `app/package.json` |
| `M` | `app/preload.js` |

**No `D` entries.**

## 11. Integration and rebase status

**Quick Links is being built concurrently by Codex and lands first. This branch is therefore NOT
review-ready against the base it will actually merge onto.**

Per the work order's parallel-integration rule, the following is deliberately **not** done and must
happen before merge:

1. Fetch the new `main` after Quick Links lands.
2. Rebase this branch onto that exact `main`.
3. Resolve the nearby `app/main.js`, `app/preload.js`, renderer, and test-chain composition
   deliberately — **not** with a mechanical `--theirs`/`--ours`. The likely conflict points are:
   * `app/main.js` — the `additionalArguments` array, the app-ready IPC registration block, and the
     `pty-write` / `pty-start` handlers;
   * `app/preload.js` — the tail of the file where both branches add a bridge;
   * `app/package.json` — the `test` chain string;
   * `app/launcher-fence-invariant.test.js` — **if Quick Links also touches `pty-start`, the pinned
     hashes must be recomputed against the rebased `main.js` and the re-pin comment extended.**
4. Rerun all focused suites and the full application gate.
5. Regenerate the reviewed artifact against the new base.
6. Obtain a fresh review.

**A verdict from before the rebase does not survive the rebase.** No review of this tip should be
treated as a merge authorization.

## Review-diff rule

* Before merge, use `git diff main...<tip>`.
* After merge, reproduce with `git diff <recorded-pre-merge-main>...<tip>` — here
  `git diff a2121ca3...5f8cb59d`.
* Always use `--output`; never PowerShell `>`.
* Retain the literal `VERDICT: PASS|FAIL` line and name the review that produced it. A paraphrase or
  implied verdict is not a merge-gate verdict.

## Recommended review focus

**Full-class**, per the work order. In priority order:

1. **The ordering rule.** Is the decrement genuinely durable before the writer, on every path? Is there
   any branch in `submitPrompt` that reaches the writer without a successful `persist`?
2. **The refund rule.** Is `WRITE_FAILED_AFTER_ADMISSION` the only post-write outcome, and is the
   in-memory rollback on persist-failure safe (nothing was written, so nothing was consumed)?
3. **PTY input interception.** Is `pty-write` really the single chokepoint? Is there any other path in
   `main.js` that calls `p.write` outside the budget's own writer? Does an uncontrolled pane behave
   byte-for-byte as before?
4. **The trusted-sender gate.** Is the real gate used, and is it consulted before the budget on every
   entry point?
5. **§ 4.1, the re-pinned tripwire.** Independently recompute the three region hashes. Confirm the
   fenced-role gate is unchanged and the scrub is unweakened.
6. **The environment scrub.** Can any admission key reach a child PTY? Is the key list complete?
7. **Restart and rollback.** Can any sequence of restarts, configuration changes, or ledger edits
   produce more than `allowance` total writes for one run id?
8. **Content hygiene.** Can a prompt reach a log, an error, the ledger, or an IPC payload?
9. **Scope.** Is this only turn admission? Has any pane-status production work crept in?

## Reviewer verdict

**None yet.** This branch stops for a fresh independent **Full-class** review by a reviewer who is not
the author, and then for the rebase in § 11.

## Reviewer verdict source

Pending.

---

**BLUE SUBSYSTEM VERDICT: BUILD FRESH** — pane status, recorded in
`docs/OSS-PROCUREMENT-pane-status.md` § 13. **This branch implements the main-owned turn admission
budget only.** It does not begin pane-status production completion, and it does not authorize a live
provider session. Per Blue's authorization, no live pane-status provider session is authorized until
this admission budget is reviewed and landed — and per § 11, landing requires a rebase onto the
post-Quick-Links `main` and a fresh review after it.
