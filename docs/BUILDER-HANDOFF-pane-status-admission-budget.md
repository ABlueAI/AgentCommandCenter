# Builder Handoff — Main-Owned Turn Admission Budget

Branch: `feature/pane-status-admission-budget`
Worktree: `.worktrees\pane-status-admission-budget`
Fork-point SHA: `5bbe3635736f18c9b8d4b50a23c7b51955f7bd0f`
Pre-merge `main` SHA: `5bbe3635736f18c9b8d4b50a23c7b51955f7bd0f` (`Merge Quick Links Release 1.0`)
**Reviewed integration content tip: `26eee3fa024d4b716a0fd8e3daf17e76fdad510f`**
Branch tip: the handoff-only tail commit that pins the review artifacts
Merge commit SHA: **Pending until merge**

**Status: NOT MERGED, NOT PUSHED. Stops for an independent Full-class review of the COMPLETE REBASED
RANGE.**

**THE PRE-REBASE REVIEW DOES NOT SURVIVE THIS INTEGRATION.** The earlier content tip
`5f8cb59d7a17334a06735816d45160352e987f32` was built against `a2121ca3`, which is no longer the base.
Any verdict on that tip, and the artifact
`.agent-review-pane-status-admission-budget.diff`, are **pre-integration evidence only** — see § 10.
The controlling artifacts are the two named in § 10.1.

### What changed since the pre-rebase tip

| | Pre-rebase | Now |
| --- | --- | --- |
| Base | `a2121ca3` | **`5bbe3635`** (Quick Links landed) |
| Chain entries | 56 | **63** |
| Assertions | 4,118 | **4,616** |
| Controlled-run UI | none | **built** (§ 4.6) |
| Pester | not run | **run: 955 passed, 0 failed** |

## 0.1 Prior review history for this branch

The pre-rebase content tip `5f8cb59d` was submitted for Full-class review and **that review was never
returned before the rebase**, so this branch has **never held a passing verdict** against any base. A
reviewer should treat the whole rebased range as unreviewed rather than as a delta on top of accepted
work.

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

**This branch implements ONLY turn admission and its own minimal controlled-prompt surface.** It does
not begin pane-status production completion: no status normalization, no lifecycle, **no pane-status
UI**, no provider onboarding, no hook installation, and no badge work.

The one renderer surface added here (§ 4.6) is the **admission bar** — a remaining-turns readout and a
prompt field for the budget. It is **not** the pane-status badge and reads no status at all. The prior
revision of this handoff said no UI was added; that is now false and has been corrected throughout.

The relationship to pane status remains one-directional and negative: the budget exists to bound a
future controlled pane-status evidence run, and **nothing in `app/prototype-pane-status/` can reach the
ledger** — asserted by a source tripwire, not by convention (§ 5, required test 17).

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
| 6 | Prompt N+1 is visibly refused and never reaches the PTY | `REASON.EXHAUSTED`, surfaced **both** on the `main-error` Logs channel and now in the admission bar as human-readable text (§ 4.6) |
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
| `app/package.json` | modified | Test chain resolved as a **union**: 57 landed entries + 4 admission + 2 new = **63** |
| `app/launcher-fence-invariant.test.js` | modified | Byte-invariance tripwire — **NOT re-pinned this round**; regions recomputed independently and unmoved. Six content assertions from the prior round retained. See § 4.1 |
| `app/renderer/admission-view.js` | **added** | The controlled-prompt surface. Absent unless `window.ccAdmission` exists; one `submitPrompt` call site; no `cc.ptyWrite`, no `ipcRenderer`, no `require` |
| `app/renderer/admission-view.test.js` | **added** | 131 assertions (view level) |
| `app/admission-ui-integration.test.js` | **added** | 140 assertions (end-to-end through the real IPC boundary, real budget and a real ledger file) |
| `app/renderer/app.js` | modified | Constructs the view **only** when the bridge exists; guarded `mount()` and `refresh()` |
| `app/renderer/index.html` | modified | Empty `#admissionHost` + the `admission-view.js` script tag |
| `app/renderer/styles.css` | modified | `.admission-*` rules; nothing applies unless the bar was built |
| `app/quick-links-integration.test.js` | modified | **A mis-anchored tripwire corrected — see § 4.7.** Three assertions added |
| `app/dockview-default-path.test.js` | modified | Script-tag count re-pinned 23 → 24 with rationale and a named-file assertion |

**No PowerShell changed** — no `.ps1`, no `.psd1`, no `scripts/` file. **Pester was run anyway**
because the work order asked for it: `scripts\run-pester.ps1` → **955 passed, 0 failed, 0 skipped**
(§ 5.3).

**A controlled-run UI WAS added this round** (§ 4.6). The prior handoff's "no renderer UI was added" no
longer holds and has been corrected throughout.

## 4. Security-sensitive surfaces touched — READ THIS SECTION

### 4.1 The `pty-start` byte-invariance tripwire — recomputed, and NOT re-pinned this round

The work order required the pinned regions to be recomputed independently even though Quick Links was
said not to touch `pty-start`. They were, from the raw bytes of **four** revisions in their exact
checkout (CRLF) form — not inferred from the fact that the suite passes:

| Revision | `fenced-role cwd gate` | `ptyEnv block` | `pty-start handler` |
| --- | --- | --- | --- |
| `a6bba64b` original reviewed base | 1354 / `ae9dce92…` | 213 / `b83cd467…` | 8714 / `21c9ab2f…` |
| `5bbe3635` **main, Quick Links landed** | 1354 / `ae9dce92…` | **236 / `cd100743…`** | **9913 / `67cb161c…`** |
| `5f8cb59d` admission, pre-rebase | 1354 / `ae9dce92…` | 271 / `2a399a98…` | 12443 / `b5fe654e…` |
| **this branch, post-rebase** | **1354 / `ae9dce92…`** | **271 / `2a399a98…`** | **12443 / `b5fe654e…`** |

**Two things this table proves rather than assumes:**

1. **Quick Links genuinely did not touch this boundary.** At `5bbe3635` the `ptyEnv` block and the
   `pty-start` handler still carry the exact **revision-2 values that predate the admission work
   entirely**. That is a measurement, not a reading of the merge's file list.
2. **The rebase composed rather than replaced.** Both moved regions equal their pre-rebase admission
   values byte-for-byte, so the admission delta survived intact and no Quick Links content was
   displaced from inside these regions.

**The `fenced-role cwd gate` is 1354 / `ae9dce92…` at all four points**, now including across the
Quick Links merge and this rebase. The credential/fence containment logic has never been touched by
any revision, by either feature, or by the integration between them. Prior hashes for every reviewed
base are retained in the file.

**What a reviewer should independently recompute:** that fenced-role hash, from the current
`app/main.js`, reading the file as the test does (CRLF on disk — an LF-normalised read yields 1326 and
a different hash, which is a measurement artifact, not a mismatch). Also re-verify that
`CLAUDE_CODE_SUBPROCESS_ENV_SCRUB: '1'` is still unconditional, that the video-scout key injection is
still scoped to video-scout panes, and that the `ptyEnv` base cannot reintroduce the admission keys —
all three are **content assertions**, so a future re-pin cannot drop them with a hash.

### 4.2 PTY input interception

`ipcMain.on('pty-write')` is the single chokepoint every renderer input route already converges on —
`term.onData` (typing, `app/renderer/app.js:476`), the pane's own `ptyWrite` adapter (`:495`), the STT
delivery (`:1410`), and any shell-input helper all call `cc.ptyWrite`. Blocking in main rather than per
call site is what makes the block complete: a control character, an Enter, a bracketed paste, or a call
site added later by someone who never read the comment all hit the same line.

**The new controlled-prompt UI does not add a fourth route** — it cannot call `cc.ptyWrite` at all
(§ 4.6, asserted at zero occurrences). It reaches the terminal only by asking main to spend an
admission, and main's own writer performs the write.

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

### 4.6 The controlled-prompt UI is not a second way to reach a PTY

`app/renderer/admission-view.js` is a form that asks main to spend one admission. It holds **no route
to a terminal**, and that is enforced by source tripwires rather than by intent:

| Property | Assertion |
| --- | --- |
| One outbound call | exactly **1** `submitPrompt(` call site |
| No direct PTY write | **0** occurrences of `ptyWrite` |
| No general bridge | **0** occurrences of `cc.` |
| No IPC reach | **0** occurrences of `ipcRenderer` |
| No Node reach | **0** occurrences of `require(` |
| Prompt containment | `el.input.value` appears exactly **5** times — 2 counter (type guard + `.length`), 2 submit (type guard + the value passed out), 1 clear. A sixth occurrence fails the suite |

**Absent, not inert.** `mount()` builds nothing and returns `false` without a usable bridge, so
`#admissionHost` keeps **zero children** — no field, no button, no status text, nothing for a stray
click to reach. A half-present bridge (missing `submitPrompt`) is treated as absent, not as partially
trusted. The bridge itself exists only behind main's `--blue-helm-admission-budget` token, which
renderer script cannot add.

**Enter cannot spend a turn.** The key handler swallows `Enter` and `NumpadEnter`, calls
`preventDefault()`, and shows *"Enter does not send. Click Send — each send spends one paid turn."*
This is deliberate rather than relying on the accident that a bare `<input>` outside a `<form>` happens
not to submit — a later refactor that wraps the bar in a form must not silently turn a keystroke into
a paid turn. Ordinary keys pass through untouched.

**Single-flight.** An in-flight submission disables Send and refuses further calls with
`admission-already-in-flight`. Proven both at view level and end-to-end: a double- and triple-click
against a gated writer produces **exactly one** request and **one** ledger increment.

**Two client-side guards that are convenience, not policy.** The 4,000-character bound and the
"known-exhausted / closed run" check avoid spending a round trip on an answer already known. Main
re-checks everything and **main's answer wins** — a stale client snapshot that believes a turn remains
still makes the request, and main's refusal is what the user sees (asserted).

**Refreshed on both paths.** State is re-read from main after success *and* after refusal, because a
refusal is not necessarily free: `admission-write-failed-after-admission` **spends** the turn, and the
displayed count must come from main rather than from an assumption. The UI says plainly that such a
turn *"IS spent and is not refunded."*

**The field is cleared only on a real admission**, so a refused prompt survives to be corrected.

### 4.7 A pre-existing Quick Links tripwire was mis-anchored, and is corrected

`app/quick-links-integration.test.js` pinned the "legacy `open-external` handler" against the
dispatched base by slicing from `ipcMain.handle('open-external'` to the next **`'\n  });'`** — an
*indented* closer. But that handler's own closing line is **`});` at column 0**. The slice therefore
ran straight past the handler and stopped at the first indented `});` far below, capturing **12,551
characters** of unrelated code: the whole of `pty-start`, `pty-write`, `pty-kill` and the vibe-kanban
board handlers, all under the name "legacy open-external handler".

That made the assertion simultaneously **too weak** (a real edit to the two lines that matter was never
isolated) and **too strong** (any edit anywhere in 12 KB of neighbouring code failed it). The admission
budget's `p.onExit` block — which legitimately ends in an indented `});` — tripped it while leaving the
`open-external` handler untouched.

**The handler is byte-identical across all three revisions**, verified by balanced extraction:

| Revision | Extracted handler |
| --- | --- |
| `a2121ca3` dispatched base | 141 bytes |
| `5bbe3635` Quick Links main | 141 bytes, identical |
| this branch | 141 bytes, identical |

The end anchor is corrected to `'\n});'` so the region is the handler and nothing else, and three
assertions now pin the region's own width (141 bytes, exactly 3 lines, and it must not reach into the
PTY handlers) so it cannot silently widen back out. **The assertion's intent is unchanged and its
subject is unchanged — only its aim is fixed.**

## 5. Exact test results

**Full application gate: `npm test` — PASS, exit 0.**

**The base figures were established by RUNNING the gate on `main` at `5bbe3635`**, not read from the
work order. Both reporting formats were counted (`N passed, 0 failed` and `N assertions passed`).

| Metric | Base `5bbe3635` | This branch | Delta |
| --- | ---: | ---: | ---: |
| Chain entries (`node` invocations in `app/package.json` "test") | 57 | **63** | **+6** |
| Reporting suites | 57 | **63** | **+6** |
| Total assertions passed | 3,883 | **4,616** | **+733** |
| Total assertions failed | 0 | **0** | 0 |

**Census-rule reconciliation. `3,883 + 458 + 275 = 4,616`, and the actual measured total is 4,616.**

| Source | Assertions |
| --- | ---: |
| Landed base (`main` at `5bbe3635`) | 3,883 |
| — `admission-budget-config.test.js` | 77 |
| — `admission-budget.test.js` | 205 |
| — `admission-budget-store.test.js` | 35 |
| — `admission-ipc.test.js` | 135 |
| — `launcher-fence-invariant.test.js` (15 → 21) | +6 |
| **Existing admission implementation subtotal** | **458** |
| — `admission-ui-integration.test.js` (new) | 140 |
| — `renderer/admission-view.test.js` (new) | 131 |
| — `quick-links-integration.test.js` (40 → 43, § 4.7) | +3 |
| — `dockview-default-path.test.js` (379 → 380, script-count re-pin) | +1 |
| **New UI-test delta subtotal** | **275** |
| **Total** | **4,616** |

**Exactly three pre-existing suites changed count, each named above with its reason. No suite
vanished** (verified by set difference against the base run, not by inspection). **No pre-existing
assertion was weakened, deleted, or converted to a weaker form.**

Chain entries: `57 + 4 (admission) + 2 (new UI suites) = 63`, no duplicates — asserted inside
`admission-ui-integration.test.js`, which also asserts all 5 Quick Links suites and all 6 admission
suites are present.

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

### 5.1b This work order's 16 required UI/integration tests

`V` = `renderer/admission-view.test.js` (view level, stubbed bridge). `I` =
`admission-ui-integration.test.js` (end-to-end: real view → real `admission-ipc` → real
`admission-budget` → real ledger file on disk; only the Electron event object and the PTY handle are
stubbed).

| # | Required test | Where | Result |
| --- | --- | --- | --- |
| 1 | UI absent when the bridge is absent | V — `mount()` returns false; host has **zero** children; a half-present bridge is also treated as absent. I — same, via the disabled plan | PASS |
| 2 | UI appears with the bridge and renders bounded state | V — remaining/allowance/spent, bound pane id, `RUN CLOSED` badge, and the three unbound variants (unbound, stale, closed) | PASS |
| 3 | One explicit click = exactly one submission | V — 1 call, exactly the 2 allowed keys, sent to the **bound** pane. I — 1 real ledger increment and 1 real writer call, terminator appended by MAIN | PASS |
| 4 | Enter alone produces no submission | V — `Enter` and `NumpadEnter` both swallowed with `preventDefault()`, 0 submissions, text preserved, reason shown; ordinary keys unaffected | PASS |
| 5 | Double-click / in-flight cannot double-spend | V — 3 clicks against a gated resolver → 1 request. I — 3 clicks → **1** ledger increment and **1** writer call | PASS |
| 6 | N+1 visibly refuses | V(a) known-exhausted refuses without a round trip; V(b) a **stale** snapshot does reach main and main's refusal is displayed and then corrected. I — 2 admitted, 3rd refused, ledger still 2, and a **direct IPC call** cannot buy a third either | PASS |
| 7 | Prompt text absent from logs, errors, persisted state, refusals | V — sentinel scanned across renderer logs, status line, whole rendered host, and view snapshot, on **three** outcomes. I — scanned across the **real ledger file**, main-side logs, renderer logs, rendered UI, and both IPC payloads — while confirming it *did* reach the PTY | PASS |
| 8 | State refreshes after success and refusal | V — re-read on both paths; a writer failure that **spent** the turn shows the reduced count. I — count tracks the real ledger across success, local refusal, and exhaustion | PASS |
| 9 | Controlled-pane direct input remains blocked | I — a 9-keystroke burst through main's real handler body reaches the PTY **0** times; the refusal appears on the Logs channel | PASS |
| 10 | Uncontrolled pane input unchanged | I — all 11 keystrokes to `pty2`/`library` pass through untouched; with no run configured nothing is blocked anywhere | PASS |
| 11 | Quick Links remains reachable and unchanged | I — 3 preload methods, 3 main handlers, the approved defaults builder, 4 DOM ids, the script tag, 3 `app.js` call sites, the CSS block, and all 5 suites in the chain | PASS |
| 12 | No renderer path bypasses `admission-submit-prompt` | V + I — the six source tripwires in § 4.6, plus: exactly **one** `pty-write` handler in main, the admission check ordered **before** any write in it, and exactly **two** `p.write(` call sites both accounted for | PASS |
| 13 | Persist failure writes nothing | I — the real ledger path is replaced by a **directory** so the atomic rename genuinely fails: 0 writes, 0 spent, and the run stays refusing afterwards (fail closed, no self-healing) | PASS |
| 14 | Writer failure not refunded after durable decrement | I — a throwing writer consumes the admission, the refreshed UI shows it spent, the UI says "not refunded", and the budget really is one turn poorer | PASS |
| 15 | Restart, rollback tripwire, pane binding, zero budget intact | I — restart preserves the spent count and refuses to rebind; **the rollback tripwire's true scope is pinned, including what it does not cover (§ 8)**; configuration top-up refuses; binding cannot move; a dead pane closes the run; allowance 0 yields the refusing budget | PASS |
| 16 | Gate-off leaves `window.ccAdmission` undefined | V — the preload gate is the only exposure site and no **code** mentions the bridge before it. I — the token and the handler registration both sit inside main's enabled branch, registered exactly once | PASS |

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
| **Offline ledger edit between runs** | **The rewound count is ADOPTED, not refused — see § 8. Pinned as a known residual rather than left to be discovered** |

### 5.3 Pester

Required by this work order even though **no PowerShell changed**. Run via the repository's canonical
runner, `scripts\run-pester.ps1` (Pester 3.4.0; PowerShell 7 is not installed on this machine, and
`Invoke-Pester -Output` is a Pester-5 parameter that 3.4.0 rejects — the runner script is the supported
entry point).

| Run | Result |
| --- | --- |
| `main` at `5bbe3635` (baseline, measured) | **955 passed, 0 failed, 0 skipped** |
| This branch | **955 passed, 0 failed, 0 skipped** |
| Delta | **0** |

The baseline was **actually run**, not assumed from "no `.ps1` changed". This matters because
`run-pester.ps1`'s reachability suite asserts *"the Node-side meta-test is wired into
`app/package.json`"* — a file this branch does modify — and that assertion passes.

## 6. Commands run — and what was NOT run

Read-only Git, Node and Pester test execution, and one local filesystem junction.

* `git fetch origin --prune`, `git rev-parse`, `git log`, `git status --porcelain`, `git worktree add`,
  `git worktree list`, `git show`
* `git rebase 5bbe3635`, `git add`, `git commit`, `git tag` (a local safety tag on the pre-rebase tip),
  `git checkout --` (line-ending normalisation only)
* `node app/<suite>.test.js` for each suite; `npm test` for the full gate (on **both** `main` and this
  branch); `scripts\run-pester.ps1` (on **both**)
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

**Before any edit — every starting-state item verified, none assumed:**

* `git fetch origin --prune` run for real; `main` = `origin/main` =
  `5bbe3635736f18c9b8d4b50a23c7b51955f7bd0f`, subject **`Merge Quick Links Release 1.0`** — matching the
  work order exactly.
* Existing admission content `5f8cb59d…` and tail `90dd577c…` confirmed present, with the tail's parent
  equal to the content tip.
* The admission worktree's tracked state was clean (`git status --porcelain` empty).
* The root worktree carried only `?? .worktrees/` — **no user-owned tracked change** to disturb.
* **The Quick Links gate was MEASURED, not accepted:** the chain was parsed to 57 entries and
  `npm test` was run on `main`, yielding 57 reporting suites / 3,883 assertions / 0 failures.
* `docs/BUILDER-HANDOFF-quick-links.md` present.

**After the edits:**

* `git diff --check` clean (exit 0).
* Changed-file list is exactly the 21 entries in § 10.2; nothing outside `app/` and `docs/`.
* No `.ps1`, `.psd1`, or `scripts/` file changed — Pester run regardless, with a measured zero delta.
* `main` and `origin/main` remain at `5bbe3635736f18c9b8d4b50a23c7b51955f7bd0f`. **Nothing merged,
  nothing pushed.**
* The composition was **proven**, not eyeballed: the `+`/`-` payload of `git diff 5bbe3635 -- <file>`
  is line-for-line identical to `git diff a2121ca3 5f8cb59d -- <file>` for both `app/main.js` (125
  lines) and `app/preload.js` (28 lines), so the rebase preserved main plus exactly the admission delta
  and dropped neither side.
* The fenced-role cwd gate hash was independently recomputed across four revisions (§ 4.1) and matches
  the ORIGINAL reviewed base at every one.
* Working-copy line endings were normalised via `git checkout --` after commit, so the committed blobs
  are LF and the worktree is CRLF per `.gitattributes`; the gate was re-run afterwards and still passes.

## 8. Known limitations

* **A local file ledger cannot defend against an operator with filesystem access.** Deleting
  `admission-ledger.json` outright returns the run to "never created", and the next start would mint a
  fresh allowance. The design raises the cost of that — one file holds every run, so a targeted
  deletion is a wholesale one, and an in-session rollback is caught by the high-water tripwire — but
  this is a **bound against accident and against the provider process, not against the human running
  the app.** Blue is the human running the app, so this is the correct threat model; it is stated so
  the control is not read as stronger than it is.
* **CORRECTED AND SHARPENED THIS ROUND — the rollback tripwire is narrower than its name, and is
  effectively unreachable for the case people will assume it covers.** `highWaterAdmitted` in
  `admission-budget.js` is **per-instance and starts at 0**, and `initialize()` short-circuits once a
  record is loaded. Consequently no instance ever reaches the `existing.admitted < highWaterAdmitted`
  comparison holding a non-zero mark, and **`REASON.STORAGE_ROLLED_BACK` cannot fire for an offline
  ledger edit made between runs**. Measured directly: after two admissions, rewriting `admitted` to `0`
  in the file and starting a new instance yields `admitted = 0, remaining = 3` — **the budget is fully
  restored.** A *live* instance is unaffected, because it re-persists from its own memory.

  The prior handoff described this as "only partly covered", which understated it, and a comment in
  `admission-budget.test.js` asserted outright that the block there *proved* cross-process protection.
  **That comment is corrected on this branch and every assertion in it is preserved**; the real
  behaviour is now pinned by `admission-ui-integration.test.js` so it stays a known property.

  It remains a **residual rather than a hole** because the budget bounds what **Claude Code** can spend:
  the ledger lives under Electron `userData`, never inside a worktree, and every admission env key is
  stripped from each PTY environment, so the agent can neither locate nor rewrite it. It does not, and
  was never designed to, bound what Blue can do to Blue's own machine. **The guards that DO survive a
  restart are the ones that matter for accidental top-ups** — a raised `BLUE_HELM_ADMISSION_ALLOWANCE`
  refuses with `admission-ledger-plan-mismatch`, asserted.
* **The controlled-run UI is minimal by instruction, and single-line by necessity.** The prompt field is
  an `<input type="text">`, not a textarea, because the budget's validator rejects **all** C0/C1 control
  characters — including `\n`. A multi-line prompt is therefore impossible by design, and the UI says so
  rather than letting main refuse a paste that looks reasonable. If Blue needs multi-line controlled
  prompts, that is a **deliberate change to the validator and the terminator handling**, not a UI tweak.
* **The UI's client-side guards can disagree with main, and main wins.** The 4,000-character bound and
  the known-exhausted/closed checks exist to avoid a wasted round trip. A stale snapshot can still send
  a doomed request; that path is tested, and main's refusal is what gets displayed.
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

* **NEW — `quick-links-integration.test.js` was measuring 12,551 characters under the name "legacy
  open-external handler".** Its end anchor was an *indented* `'\n  });'` while the handler closes with
  `});` at column 0, so the pinned region swallowed `pty-start`, `pty-write`, `pty-kill` and the
  vibe-kanban board handlers. Both too weak and too strong at once. Corrected here to bound the real
  141-byte handler, with three assertions pinning the region's own width. **Full detail in § 4.7.** The
  handler itself is byte-identical at `a2121ca3`, `5bbe3635` and this branch.
* **NEW — `REASON.STORAGE_ROLLED_BACK` is effectively dead code, and a test comment claimed otherwise.**
  See § 8. Measured, corrected, and pinned; the code itself was deliberately **not** redesigned, because
  this work order is the UI and the integration, not a budget redesign. **If Blue wants a real
  cross-restart rollback guard, that is a separate work order** — the mechanism would be persisting the
  high-water mark rather than holding it in memory.
* **The `pty-start` byte-invariance tripwire did NOT need a fourth re-pin**, which is the first good news
  it has produced in three branches: Quick Links left the region alone and the rebase composed cleanly.
  The observation from the last round still stands, though — the region is a busy intersection, and if a
  fourth genuine re-pin arrives it is worth splitting the credential-critical part from the lifecycle
  part so they can move independently.
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
| Base (pre-merge `main`) | `5bbe3635736f18c9b8d4b50a23c7b51955f7bd0f` — `Merge Quick Links Release 1.0` |
| Rebased admission implementation | `fc8a60b` (was `5f8cb59d` pre-rebase) |
| Rebased prior handoff pin | `93401b6` (was `90dd577c` pre-rebase) |
| **Reviewed integration content tip** | **`26eee3fa024d4b716a0fd8e3daf17e76fdad510f`** |
| Branch tip | exactly **one** new handoff-only tail commit above the content tip, pinning this section |

### 10.1 The controlling artifacts

Both created with `git diff --output` (never a PowerShell `>` redirect), both gitignored via
`.gitignore:33`, and both **regenerated from their stated range to a separate temporary file and proven
byte-identical with `cmp` (exit 0)**; only the temporary copies were removed.

| Artifact | Range | Shortstat | Size | SHA-256 |
| --- | --- | --- | ---: | --- |
| **`.agent-review-admission-quick-links-integration-cumulative.diff`** — *the controlling artifact* | `5bbe3635...26eee3fa` | 21 files, 4,785 insertions, 11 deletions | **279,666** | `fa968feff6c2aac8883baaa15140f11766fb1d143484fd2811b4eec43c4f873b` |
| **`.agent-review-admission-controlled-prompt-focused.diff`** — this round's work alone | `93401b6...26eee3fa` | 12 files, 1,481 insertions, 7 deletions | **99,031** | `5e64b8e9cbe80a9a671d902986a3a469a4519ac050cd5dfdf27ef67cd6db7448` |

**Review the CUMULATIVE artifact.** The focused one is a convenience for seeing what this round added on
top of the rebased implementation; it is **not** sufficient for a verdict, because the implementation it
sits on has never itself held a passing review (§ 0.1).

### 10.2 Pre-integration evidence — NOT the controlling artifact

| Artifact | Range | Size | SHA-256 |
| --- | --- | ---: | --- |
| `.agent-review-pane-status-admission-budget.diff` | `a2121ca3...5f8cb59d` | 187,699 | `4fc2ed34cc049b603233e564874cc1ee854388af7a8c8ff000d14cc5d99290a6` |

**Preserved byte-for-byte unchanged** (hash re-verified after all work above). Its range names two SHAs
that are no longer on this branch: `a2121ca3` is no longer the base, and `5f8cb59d` was replaced by
`fc8a60b` in the rebase. It is retained as evidence of what was built before the integration, and it
**must not be used as the review target.**

### 10.3 Changed-file list

**Range** `5bbe3635...26eee3fa` — 21 files, **no `D` entries**:

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
| `A` | `app/admission-ui-integration.test.js` |
| `A` | `app/renderer/admission-view.js` |
| `A` | `app/renderer/admission-view.test.js` |
| `A` | `docs/BUILDER-HANDOFF-pane-status-admission-budget.md` |
| `M` | `app/dockview-default-path.test.js` |
| `M` | `app/launcher-fence-invariant.test.js` |
| `M` | `app/main.js` |
| `M` | `app/package.json` |
| `M` | `app/preload.js` |
| `M` | `app/quick-links-integration.test.js` |
| `M` | `app/renderer/app.js` |
| `M` | `app/renderer/index.html` |
| `M` | `app/renderer/styles.css` |

## 11. Integration status — DONE, and what it cost

**The rebase is complete.** Base is `5bbe3635` (`Merge Quick Links Release 1.0`). A local safety tag
`prerebase/admission-90dd577c` marks the pre-rebase tip.

### 11.1 Collision points and how each was resolved

| Site | Collision | Resolution |
| --- | --- | --- |
| `app/main.js` | Quick Links added a require block and an app-ready handler block; admission added four requires, an app-ready block, an `additionalArguments` token, the `ptyEnv` scrub, the pane claim and the `pty-write` guard | Auto-merged, then **proven** correct: the actual delta from `5bbe3635` is line-for-line identical to the intended admission delta (125 change lines). Placement verified by inspection — Quick Links' three handlers at the top of app-ready, the admission block after `library-followup`, Dockview after it |
| `app/preload.js` | Quick Links added three methods inside the `cc` object; admission appended a separate gated bridge at the tail | Auto-merged; delta proven identical (28 change lines). **Both bridges present and asserted** |
| `app/package.json` | **The only real conflict** — both rewrote the single `test` chain string | Resolved as an explicit **union**, computed rather than hand-edited: all 57 landed entries (including the 5 Quick Links suites) then the 4 admission suites, then this round's 2. **63 entries, zero duplicates**, valid JSON, asserted in-suite |
| `app/renderer/app.js`, `index.html`, `styles.css` | No conflict — admission had not touched the renderer pre-rebase. It does now | Additive only. Quick Links' construction, `mount()`, `load()`, DOM ids, script tag and CSS block are all asserted still present |
| `app/launcher-fence-invariant.test.js` | Would have conflicted if Quick Links had touched `pty-start` | **It did not** — measured, not assumed (§ 4.1). **No re-pin was needed** |
| `app/quick-links-integration.test.js` | Not a merge conflict — a **semantic** one. Its mis-anchored region overlapped admission's `p.onExit` change | Anchor corrected to bound the real handler (§ 4.7) |
| `app/dockview-default-path.test.js` | Script-tag count tripwire, 23 → 24 | Re-pinned with rationale plus a named-file assertion |

### 11.2 What a reviewer must NOT carry over

**A pre-rebase verdict does not survive this integration**, and no pre-rebase verdict exists anyway
(§ 0.1). The reviewer must evaluate the **complete rebased range** `5bbe3635...26eee3fa` via the
cumulative artifact in § 10.1, not the pre-integration artifact in § 10.2 and not the focused diff
alone.

## Review-diff rule

* Before merge (this is the current state), use `git diff main...<tip>` — here
  **`git diff 5bbe3635...26eee3fa`**.
* After merge, the three-dot form goes empty, so reproduce with
  `git diff <recorded-pre-merge-main>...<tip>` using the SHAs recorded in § 10.
* Four SHAs for this branch: fork-point `5bbe3635`, pre-merge `main` `5bbe3635`, content tip
  `26eee3fa`, merge commit **pending**.
* Always use `--output`; never PowerShell `>`.
* Retain the literal `VERDICT: PASS|FAIL` line and name the review that produced it. A paraphrase or
  implied verdict is not a merge-gate verdict.

## Recommended review focus

**Full-class**, per the work order, over the **complete rebased range**. In priority order:

1. **The integration itself.** Did the rebase drop anything? The claim is that `app/main.js` and
   `app/preload.js` equal `main` plus exactly the admission delta — reproduce that comparison rather
   than reading the diff for plausibility. Are Quick Links' three handlers, three bridge methods and
   renderer wiring all still live?
2. **The ordering rule.** Is the decrement genuinely durable before the writer, on every path? Is there
   any branch in `submitPrompt` that reaches the writer without a successful `persist`?
3. **The refund rule.** Is `WRITE_FAILED_AFTER_ADMISSION` the only post-write outcome, and is the
   in-memory rollback on persist-failure safe (nothing was written, so nothing was consumed)?
4. **PTY input interception, now with a second writer in play.** `p.write(` appears **twice** in
   `main.js` — the budget's injected writer and the guarded `pty-write` handler. Confirm there is no
   third, that the admission check precedes the write, and that an uncontrolled pane behaves
   byte-for-byte as before.
5. **The new renderer surface (§ 4.6).** Is `admission-view.js` genuinely incapable of reaching a PTY?
   Re-count the six source tripwires. Is the bar truly absent — not merely hidden or disabled — with no
   run configured?
6. **§ 4.1, the tripwire that did NOT move.** Independently recompute the fenced-role hash from the
   current `main.js`, reading the file as the test does (CRLF). Confirm the scrub is unweakened.
7. **§ 4.7, the corrected Quick Links anchor.** Is the narrowed region the right one? Independently
   confirm the 141-byte handler is unchanged from `a2121ca3`. **This is a change to another feature's
   test — it deserves scrutiny, not acceptance.**
8. **§ 8, the rollback residual.** Verify the measurement: rewind `admitted` in a ledger, start a fresh
   budget, and confirm it adopts the rewound count. Then judge whether that residual is acceptable, or
   whether it warrants its own work order before any live run.
9. **The environment scrub.** Can any admission key reach a child PTY? Is the key list complete?
10. **Content hygiene.** Can a prompt reach a log, an error, the ledger, an IPC payload, or the DOM?
11. **The census.** `3,883 + 458 + 275 = 4,616`. Re-derive it; confirm no suite silently lost
    assertions and that exactly the three named suites changed.
12. **Scope.** Is this only turn admission plus its minimal UI? Has any pane-status production work,
    provider onboarding, hook installation, or badge work crept in?

## Reviewer verdict

**None yet.** This branch stops for a fresh independent **Full-class** review, by a reviewer who is not
the author, of the complete rebased range `5bbe3635...26eee3fa`.

## Reviewer verdict source

Pending.

---

**BLUE SUBSYSTEM VERDICT: BUILD FRESH** — pane status, recorded in
`docs/OSS-PROCUREMENT-pane-status.md` § 13. **This branch implements the main-owned turn admission
budget and its minimal controlled-prompt surface only.** It does not begin pane-status production
completion — no status normalization, lifecycle, badge, provider onboarding, or hook work — and it does
not authorize a live provider session. Per Blue's authorization, no live pane-status provider session is
authorized until this admission budget is **reviewed and landed**; it is now rebased onto the
post-Quick-Links `main` and awaiting that review.
