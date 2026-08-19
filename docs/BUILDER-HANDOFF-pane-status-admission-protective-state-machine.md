# Builder Handoff — Pane-status admission protective state machine

Date: 2026-08-18
Branch: `codex/pane-status-admission-protective-state-machine`
Closeout branch: `codex/pane-status-admission-closeout`
Closeout review class: **Standard** — one tracked Markdown file records already-completed review and
merge facts; no production, test, configuration, dependency, or procurement boundary changes.
Merged feature fork-point SHA: `5bbe3635736f18c9b8d4b50a23c7b51955f7bd0f`
Pre-merge `main`: `5bbe3635736f18c9b8d4b50a23c7b51955f7bd0f`
Previously reviewed content tip (FAILED): `346d771c095fe2283fe505f70f5a9eb5324ffe3a`
Previous handoff-only tail: `8c492092a8f011c9caf8788977be634537bf1118`
Corrected content tip: `36b8d678efd03580662d0a6b60d10ffdb75e8a12`
Merged branch tip: `7794151571ea5e7414283ffb608834a90bd38c1f`
Merge commit: `2ef73c39ce9f310eace902429824b8405c24f3d8`
Merge state: merged to `main`, pushed, and confirmed equal to `origin/main`
Closeout base SHA: `2ef73c39ce9f310eace902429824b8405c24f3d8`

The original handoff-only branch tip is the merged branch tip above. This closeout is another
documentation-only tail and touches only this file. Its own commit cannot truthfully contain its own
SHA, so the closeout tip must be resolved from the closeout branch ref until that branch is merged.

## Review result being answered — verbatim

```
VERDICT: FAIL
CLASS: Full
INDEPENDENCE: CONFIRMED
```

Reviewed base `5bbe3635736f18c9b8d4b50a23c7b51955f7bd0f`; reviewed content tip
`346d771c095fe2283fe505f70f5a9eb5324ffe3a`; handoff-only tip
`8c492092a8f011c9caf8788977be634537bf1118`; controlling artifact 434,336 bytes, SHA-256
`0f94f4f2aaabfab46e07a6389b7c81152a0c285824ced398f83a546f81f94716`.

**This history is not rewritten or softened.** The FAIL stands as the record of what `346d771c`
contained.

## Final review and merge closeout — verbatim

The fresh independent Full-class review of the complete corrected content range returned this exact
three-line block:

```
VERDICT: PASS
CLASS: Full
INDEPENDENCE: CONFIRMED
```

Reviewer verdict source: the fresh independent Full-class review report delivered to Blue on
2026-08-18 and pasted verbatim into the Codex task that authorized this closeout. The report reviewed
the cumulative range `5bbe3635736f18c9b8d4b50a23c7b51955f7bd0f...36b8d678efd03580662d0a6b60d10ffdb75e8a12`.
This tracked quotation is the durable repository record of the literal verdict line; the earlier FAIL
above remains the durable result for the earlier failed content tip.

The retained four-SHA record is:

| Identity | SHA |
| --- | --- |
| Fork point | `5bbe3635736f18c9b8d4b50a23c7b51955f7bd0f` |
| Pre-merge `main` | `5bbe3635736f18c9b8d4b50a23c7b51955f7bd0f` |
| Branch tip | `7794151571ea5e7414283ffb608834a90bd38c1f` |
| Merge commit | `2ef73c39ce9f310eace902429824b8405c24f3d8` |

### Merge evidence

1. A read-only `scripts/merge-gate.ps1` preflight used a plan pinning the base, reviewed content tip,
   branch tip, this handoff, and the cumulative pinned diff. It returned `PREFLIGHT: PASS` and predicted
   tree `addd526d2e7e8c697e4e31435a7240fe4fb530eb`.
2. Blue authorized the merge. `git merge --no-ff` produced merge commit `2ef73c39` with parents
   `5bbe3635` and `7794151`. Its tree is exactly the predicted tree
   `addd526d2e7e8c697e4e31435a7240fe4fb530eb`; the merge delta is 30 files, 8,048 insertions, and 14
   deletions.
3. The reviewed delta was re-derived from recorded pre-merge `main` and reproduced
   `.agent-review-admission-bootstrap-recovery-cumulative.diff` byte-identically before and after the
   push: 474,745 bytes, SHA-256
   `70c42d430ecfc0e8b119bb6566f768cb0f69698f6ca160cc998ce3c1cc6c9fdf`.
4. Merged-main gates ran on `2ef73c39` and exited 0: application **67 suites, 4,888 assertions, 0
   failures**; Pester **955 passed, 0 failed, 0 skipped**.
5. The push fast-forwarded `main` from `5bbe3635` to `2ef73c39`. A fresh fetch confirmed local `main`
   and `origin/main` both equal `2ef73c39ce9f310eace902429824b8405c24f3d8`.

`merge-gate.ps1 -Apply` requires an interactive typed confirmation that the executing shell could not
supply. The executor therefore ran the read-only preflight, performed the Blue-authorized merge
manually, and then proved that the applied merge tree was exactly the preflight-predicted tree. The
temporary staging copy of the pinned artifact was removed; the two originals in the review worktree
remain unchanged at SHA-256
`70c42d430ecfc0e8b119bb6566f768cb0f69698f6ca160cc998ce3c1cc6c9fdf` and
`e0c35ae20be1ccda04c55cf715b0c3dc793c68877f6be5e05545063145e6c82b`. The plan remains under the
gitignored `.merge-gate/` directory.

### Separation-of-duties observation

The same independent reviewing agent executed the merge after Blue issued the merge order. Blue
remained the human merge authority, and the reviewer was independent of the builder/correction author,
so the reported `INDEPENDENCE: CONFIRMED` line is retained verbatim. Having the reviewer also act as
merge executor is nevertheless weaker separation than the usual project shape and is recorded here
rather than silently treated as equivalent.

### Open non-blocking Low findings

The Full-class PASS classified these as non-blocking. The merge did **not** fix them:

| Finding | Open state |
| --- | --- |
| `admission-main-startup.test.js` leaves six `%TEMP%\bh-main-startup-*` directories per suite run. | **OPEN** — no cleanup path exists. |
| `admission-process-cas.test.js` names final-admission-save contention, but the exercised contention resolves at the durable pane claim. | **OPEN** — evidence naming/scope must be corrected without overstating what the test proves. |
| Six `uncaughtException` listeners accumulate per `admission-main-startup.test.js` run. | **OPEN** — listener cleanup is absent. |

These are retained follow-ups, not implicit work authorization and not reasons to reinterpret the PASS.

## Procurement authority

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

The procurement record and its verdict were **not altered** by this correction. This work sits under
§ 13.5's binding precondition — *enforceable turn accounting must be implemented first*. Experiment B,
app-server runtime testing, providers beyond Claude Code, production pane-status implementation, and
autonomous consequential actions all remain **unauthorized**.

## The commit stack, stated precisely

Correcting the previous handoff's imprecision: the reviewed content range `5bbe3635...346d771c` held
**nine** content/history commits. The **tenth** branch commit (`8c492092`) was the **handoff-only
tail** touching one document. The branch was never a ten-commit content stack.

The corrected branch is those ten commits plus:

11. `36b8d678` — the corrective content commit;
12. the handoff-only tail carrying this document.

The reviewed content range for this round is therefore `5bbe3635...36b8d678`, containing **eleven**
commits — the previous ten (including the superseded handoff tail) plus the correction.

## Findings and dispositions

| # | Finding | Disposition |
| --- | --- | --- |
| **C1** (Critical) | `app/main.js` built the budget from the **enabled** plan at module scope; `createAdmissionBudget` throws without storage for an enabled plan, so a **valid** controlled run crashed the main process at `require` time — before `app.whenReady()`, before uncaught-exception handling, before any window. The feature was unreachable. | **FIXED** — initialization order corrected, not caught or suppressed. |
| **M1** (Medium) | The crash escaped 4,826 assertions because `main.js` was only ever read as text (12 `readFileSync` scans, zero evaluations). Single-instance behaviour rested on source regexes plus same-process window fakes. | **FIXED** — `app/admission-main-startup.test.js` evaluates the real entry. |
| **H1** (High) | Unconditional `app.requestSingleInstanceLock()` changed startup for the whole application, made `--classic-layout` recovery unreachable while a Dockview instance held the lock, had no product authority, and was unnecessary for ledger correctness. | **REMOVED**, not repaired. |
| **L1** (Low) | Five Markdown hard-break trailing-whitespace violations made `git diff --check` exit 2 over the reviewed ranges; the handoff had reported `git diff --cached --check` as if equivalent. | **FIXED** — both range checks now exit 0. |

### C1 — the valid-configuration startup crash

The defect and its cause:

```js
// before — module scope, live plan, no storage, no writer
let admissionBudget = createAdmissionBudget({ plan: admissionPlan });
```

`createAdmissionBudget` deliberately **throws** when handed an enabled plan without `storage` and
`writer`, because an enabled budget without durable storage would be a cost control that cannot count.
That guard was correct. What was wrong was **calling it before its dependencies could exist**: Electron
`userData` is only available after app readiness, and the ledger store and the module-private admitted
PTY writer are built from it.

The correction is a lifecycle fix:

* module scope now holds only an inert placeholder, built **unconditionally from a disabled plan**
  (`admissionConfig.disabledPlan(ADMISSION_REASON.NOT_INITIALIZED)`), whose every method refuses;
* the live, store-backed budget is constructed **exactly once** inside `app.whenReady()`, with the real
  `createAdmissionLedgerStore({ userDataDir: app.getPath('userData') })` and
  `admissionPtyBoundary.writeAdmitted`;
* the placeholder creates **no admission opportunity** — before readiness there is no window, no PTY and
  no pane, so a refusing object can only deny;
* `admissionPtyBoundary` closes over the `let` binding, so the final PTY boundary consults the **live**
  budget after readiness;
* **absence remains ordinary**; a **malformed requested** configuration remains protective and still
  visibly refuses eligible Claude startup before spawn, because `prepareAdmissionPaneLaunch` reads the
  plan directly and rejects an invalid one before consulting the budget at all.

The thrown error is **not** caught or suppressed anywhere.

### M1 — the main entry is now actually evaluated

`app/admission-main-startup.test.js` (new, 60 assertions) evaluates the real `app/main.js` under
**absent**, **valid**, and **four shapes of malformed** configuration, driving each to Electron
readiness. `electron` and `@lydell/node-pty` are replaced through a `Module._load` hook and `userData`
is a disposable temp directory per scenario, so no Electron process, window, PTY, provider, hook or
paid turn is involved.

The valid-configuration case proves main **reaches readiness**, registers both admission channels, and
that the **real store-backed budget** ran — the assertion is that a checksummed ledger exists under
`userData` recording the configured run at `allowance: 3, admitted: 0`. The malformed cases prove no
channel is registered, no ledger is minted, and an eligible Claude `pty-start` is refused **without
reaching `pty.spawn`**.

**The suite was verified to catch the original defect.** Re-injecting the old line made it fail with 7
assertions, including `main.js evaluates without throwing under a VALID controlled run (threw:
admission-budget: storage with load() and save() is required)`. `main.js` was then restored
byte-identically and the suite returned to green.

### H1 — the global single-instance policy is removed

Removed entirely: the `app.requestSingleInstanceLock()` call, the losing-process `app.quit()` path, the
`second-instance` handler, `app/single-instance.js`, `app/single-instance.test.js`, and its
package-chain entry. `app/main.js` is back to the ordinary unconditional `app.whenReady().then(...)`
shape. **No other application-wide singleton replaces it.**

Why removal rather than repair:

* **Ledger correctness never depended on it.** The store's `wx` lock file plus the checksum-revision
  compare-and-swap are the actual cross-process primitives, and `app/admission-process-cas.test.js` now
  proves that with independent OS processes and no application singleton anywhere.
* It changed **gate-off** startup for the whole application, not only admission-controlled runs.
* It made **`--classic-layout` recovery unreachable** while a Dockview instance held the lock: the
  recovery launch lost the lock, emitted only a `console.error`, quit, and focused the existing —
  possibly broken — Dockview window. The `second-instance` handler ignored `argv` entirely.
* It had **no separate product authority**; the procurement record covers pane status, not an
  application-wide startup policy.

Comments and documentation claiming admission correctness rests on single-instance startup are
corrected. `BLUE-HELM-MASTER-STATUS.md` now states the removal and its reason explicitly.
`docs/BUILDER-HANDOFF-pane-status-admission-fail-closed-cas.md` keeps its record and its FAIL history
verbatim, with a note marking the single-instance material as **superseded history, not current
state**.

### Durable process-level CAS evidence

`app/admission-process-cas.test.js` (new, 16 assertions, ~1.8 s) converts the reviewer's manual
two-process proof into a tracked, repeatable gate. The file re-executes **itself** as the worker
(`--worker`), so there is no helper file to become an orphan.

* **Two independent OS processes**, not two objects in one process.
* **Deterministic coordination**: each worker announces readiness by creating its own file and spins
  until the parent creates `GO`; the parent releases both only once both are loaded and waiting. No
  timing-only sleep decides the race.
* **8 iterations**, each against a freshly seeded **one-turn** ledger.

Every iteration requires: exactly **one admission**, exactly **one refusal**, exactly **one total PTY
write**, durable ledger `admitted == 1`, the loser refusing with the bounded reason
`admission-ledger-conflict`, and **no lock file left behind**. Result: **8/8, zero violations.**

Two further properties are asserted: a **stale lock** fails closed (`admission-ledger-conflict`, zero
PTY bytes, ledger byte-identical, no prompt admissible), and a **stale-revision holder** is refused
without writing, repairing or replacing anything. A final block asserts `main.js` holds no
single-instance lock and the store claims no dependence on one — so this suite is the standing proof
that **removing H1 took nothing away**.

### L1 — diff-check accuracy

The five trailing-whitespace violations at
`docs/BUILDER-HANDOFF-pane-status-admission-fail-closed-cas.md:3-7` are removed; the text is preserved
and the Markdown hard breaks are dropped, matching this document's own header style.

The **required range commands** were run — not `git diff --cached --check`, which is a different command
and is **not** reported as equivalent:

| Command | Exit |
| --- | ---: |
| `git diff --check 5bbe3635...36b8d678` | **0** |
| `git diff --check 8c492092...36b8d678` | **0** |
| `git diff --check 5bbe3635...<handoff tail>` | **0** |

### Additional correction found while running the gates

`app/launcher-fence-invariant.test.js` failed on the `pty-start handler` anchor (13,458 → 13,493) for a
region that had **not changed by one character**. Cause: `.gitattributes` sets `* text=auto` and this
machine has `core.autocrlf=true`, so `main.js` is stored LF and checked out CRLF — but the earlier
builder's editor appended **new lines with bare LF into an already-CRLF file**, leaving a mixed-ending
working tree that still committed to an identical blob. The pins were measured on that mixed tree, so
**a clean checkout of the same commit could never reproduce them**.

The suite now normalizes to LF before slicing and hashing, making the pins reproducible from the
committed object (`git show <sha>:app/main.js`) on any machine and under any `autocrlf` setting. All
three guarded regions were verified **byte-identical to `8c492092`** before the values were rebased
into LF units:

| Region | LF length | SHA-256 |
| --- | ---: | --- |
| fenced-role cwd gate | 1,326 | `9a1255f1e81e0a9e4e289ab15380707dd6bcc1d410ffd16f44adddb99b16f8c6` |
| ptyEnv block | 265 | `b0bc588013e85de54042a0f19f30d187d8fcd22c2fec5f4e9596ad3527e1b77d` |
| pty-start handler | 13,287 | `3ad6db301a3fa0e101195f439012ee42ca25ba6b31040b10d0196d23b7141bb3` |

The historical CRLF-unit counts in that file's comment block are retained and explicitly marked as a
one-time unit change, not a change to the guarded region.

## Prior regression families A–D — re-run after the correction

The independent review reproduced all four and found them **FIXED**. They were **re-verified after** the
single-instance removal and the lifecycle change; removing the global lock weakened nothing.

| # | Family | Status |
| --- | --- | --- |
| **A** | Ledger reload / integrity failure | **FIXED** — every rejected ledger refuses visibly, performs zero PTY writes and zero replacement saves, leaves the file byte-identical, and is never treated as an empty first run. Covered by `admission-budget-store.test.js`, `admission-budget.test.js`, `admission-protective-state.test.js`, and the new `admission-process-cas.test.js` stale-lock block. |
| **B** | Cross-process double spend | **FIXED**, and now **durably tested** — `admission-process-cas.test.js`, two independent OS processes, 8/8 iterations, exactly one admission / one refusal / one PTY write / durable `admitted == 1`. |
| **C** | Fatal health erasing controlled identity | **FIXED** — designation is process-local and independent of ledger health; integrity, read, CAS and persistence failures all keep the pane controlled, keep direct input blocked, and refuse new eligible startup. Covered by `admission-protective-state.test.js`. |
| **D** | Provider-inaccessibility overclaim | **FIXED** — the honest boundary is stated in each module header; the complete first-party production scan in `admission-budget.test.js` still passes; no current claim says a same-user process cannot reach the ledger. |

## Files changed in the corrective content commit

- `BLUE-HELM-MASTER-STATUS.md`
- `app/admission-main-startup.test.js` (new)
- `app/admission-process-cas.test.js` (new)
- `app/admission-ui-integration.test.js`
- `app/launcher-fence-invariant.test.js`
- `app/main.js`
- `app/package.json`
- `app/single-instance.js` (deleted)
- `app/single-instance.test.js` (deleted)
- `docs/BUILDER-HANDOFF-pane-status-admission-fail-closed-cas.md`

No dependency or lockfile changed.

## Test gates — every delta explained

### Complete application gate (`cd app && npm test`) — exit 0

**67 suites, 4,888 assertions, 0 failures.** The runner emitted 65 `passed, failed` summaries totalling
4,870, plus two supported assertion-only summaries (`audio-module-health.test.js`, 9;
`tts-audio-contract.test.js`, 9). 4,870 + 18 = **4,888**; 65 + 2 = **67**.

Reconciliation against the previous **66 suites / 4,826 assertions**:

| Change | Suites | Assertions |
| --- | ---: | ---: |
| Previous total | 66 | 4,826 |
| `single-instance.test.js` removed with its module (H1) | −1 | −14 |
| `admission-main-startup.test.js` added (M1) | +1 | +60 |
| `admission-process-cas.test.js` added (CAS evidence) | +1 | +16 |
| **New total** | **67** | **4,888** |

Two suites changed **content but not count**: `launcher-fence-invariant.test.js` stays at **21** (three
anchors re-pinned into LF units; same assertions), and `admission-ui-integration.test.js` stays at
**167** (its "all 8 admission suites are in the chain" assertion became "all 10" — one assertion
replaced by one assertion). No other suite moved.

### Focused admission / bootstrap / process-CAS suites

| Suite | Result |
| --- | ---: |
| `admission-main-startup.test.js` **(new)** | 60 passed, 0 failed |
| `admission-process-cas.test.js` **(new)** | 16 passed, 0 failed |
| `admission-budget-config.test.js` | 83 passed, 0 failed |
| `admission-pty-boundary.test.js` | 23 passed, 0 failed |
| `admission-protective-state.test.js` | 53 passed, 0 failed |
| `admission-budget.test.js` | 243 passed, 0 failed |
| `admission-budget-store.test.js` | 81 passed, 0 failed |
| `admission-ipc.test.js` | 135 passed, 0 failed |
| `admission-ui-integration.test.js` | 167 passed, 0 failed |
| `renderer/admission-view.test.js` | 134 passed, 0 failed |
| `launcher-fence-invariant.test.js` | 21 passed, 0 failed |
| `quick-links-integration.test.js` | 43 passed, 0 failed |

Focused subtotal: **1,059 passed, 0 failed** — previously 997, reconciled as
`997 − 14 (single-instance) + 60 + 16 = 1,059`.

### Native Pester

`powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\run-pester.ps1` →
**955 passed, 0 failed, 0 skipped.** Unchanged; no `*.Tests.ps1` was touched.

## Pinned review artifacts

Every earlier pinned artifact is **preserved unchanged**, including
`.agent-review-admission-protective-state-machine-cumulative.diff` (434,336 bytes,
`0f94f4f2aaabfab46e07a6389b7c81152a0c285824ced398f83a546f81f94716`) and its focused counterpart.

New controlling cumulative artifact:

- Path: `.agent-review-admission-bootstrap-recovery-cumulative.diff`
- Range: `5bbe3635736f18c9b8d4b50a23c7b51955f7bd0f...36b8d678efd03580662d0a6b60d10ffdb75e8a12`
- Shortstat: **30 files changed, 7,910 insertions, 14 deletions**
- Size: **474,745 bytes**
- SHA-256: `70c42d430ecfc0e8b119bb6566f768cb0f69698f6ca160cc998ce3c1cc6c9fdf`

New focused correction artifact:

- Path: `.agent-review-admission-bootstrap-recovery-focused.diff`
- Range: `8c492092a8f011c9caf8788977be634537bf1118...36b8d678efd03580662d0a6b60d10ffdb75e8a12`
- Shortstat: **10 files changed, 650 insertions, 161 deletions**
- Size: **53,920 bytes**
- SHA-256: `e0c35ae20be1ccda04c55cf715b0c3dc793c68877f6be5e05545063145e6c82b`

Both were produced with `git diff --output` only, independently regenerated to separate guarded
temporary filenames, and confirmed **byte-identical** with `cmp`. Only the two temporary reproductions
were removed. No earlier artifact was overwritten.

Note on the cumulative file count: `app/single-instance.js` and `app/single-instance.test.js` were both
added and deleted **inside** this range, so they do not appear in the cumulative diff at all. The count
moves 29 → 30 as −2 (single-instance pair, now net-zero) +2 (the two new suites) +1
(`docs/BUILDER-HANDOFF-pane-status-admission-protective-state-machine.md`, which entered the range when
the previous handoff tail became an ancestor of the corrected content tip).

## Known limitations and accepted residuals

Unchanged from the reviewed round, and still true:

- This is an **accidental-spend** boundary across supported Blue Helm input paths, **not** malicious
  same-user isolation. A same-user process can rewrite, recompute, replay or delete the ledger.
- Deleting the ledger permits a fresh run; replaying an older valid ledger is not detected.
- A crash can leave the fixed `wx` lock file behind. That **fails closed** until a human removes it;
  automatic stale-lock recovery would weaken the refusal posture.
- Writer failure after durable admission stays consumed and is **not refunded**, because partial
  delivery cannot be ruled out.
- Only the first designated eligible Claude pane is controlled; later non-target panes are ordinary by
  explicit scope and cannot acquire or move the run.
- The provenance and ledger residuals retain their **automatic void condition**: if pane status or
  admission ever becomes consequential or automated, the accepted advisory-only boundary is void and
  requires a new threat decision.

New, from this correction:

- Two Blue Helm instances can now both start, as they could before this stack. That is the **restored**
  ordinary behaviour, and it is safe for the ledger: `admission-process-cas.test.js` proves the `wx`
  lock and revision CAS admit exactly once across independent processes.

## Final-review requirements — completed

The following were the controlling requirements for the fresh Full-class review that returned the PASS
recorded above. They remain here so the verdict's required scope is not lost after merge:

1. Reproduce the cumulative artifact identity and review `5bbe3635...36b8d678` in full.
2. Evaluate `app/main.js` independently under a valid admission configuration and confirm it reaches
   readiness — the C1 regression — rather than trusting `admission-main-startup.test.js` alone.
3. Confirm the pre-ready placeholder can never be constructed from an enabled plan and that no
   `try`/`catch` hides the dependency guard.
4. Re-run `admission-process-cas.test.js` and satisfy yourself the two workers are genuinely separate
   processes and the barrier is deterministic.
5. Confirm `--classic-layout` recovery is reachable again and that no application-wide singleton was
   reintroduced under another name.
6. Re-run regression families A–D against the corrected tip.
7. Re-run all three gates and reconcile 67 / 4,888 / 0, 1,059 / 0, and 955 / 0 / 0 independently.
8. Verify the handoff tail is exactly one commit touching only this document.

## Boundary statement

During construction, correction, review, merge, and closeout, no Claude or other provider session,
pane-status hook, paid prompt, model turn, app server, remote TUI, Experiment B, or production
`dockview-layout.json` was launched, installed, sent, consumed, or touched. Electron activity was
limited to the repository's inert local test harnesses; the startup suite stubs Electron entirely and
never starts one.

Reviewer verdict, verbatim:

```
VERDICT: PASS
CLASS: Full
INDEPENDENCE: CONFIRMED
```

The admission control is merged and pushed at `2ef73c39`. That merge and this documentation-only
closeout authorize nothing beyond the reviewed admission subsystem. The canonical procurement record
remains `docs/OSS-PROCUREMENT-pane-status.md`, with verdict
`BLUE SUBSYSTEM VERDICT: BUILD FRESH`. Production pane-status specification and implementation,
Experiment B, all app-server runtime testing, providers beyond Claude Code, and autonomous
consequential actions remain unauthorized. Section 13.5's precondition remains binding: enforceable
turn accounting must precede another paid live run. Landing the admission control does not itself
authorize such a run. The ledger remains an accidental-spend control, not a same-user security
boundary, and the accepted provenance and ledger residuals void automatically if admission or pane
status ever becomes consequential or automated.

This closeout is not merge authorization for its own branch. It stops for review of the handoff-only
delta; Blue remains the sole authority to merge or push it.
