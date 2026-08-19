# Builder Handoff — Main-Owned Turn Admission Budget

Branch: `feature/pane-status-admission-budget`
Worktree: `.worktrees\pane-status-admission-budget`
Fork-point SHA: `5bbe3635736f18c9b8d4b50a23c7b51955f7bd0f`
Pre-merge `main` SHA: `5bbe3635736f18c9b8d4b50a23c7b51955f7bd0f` (`Merge Quick Links Release 1.0`)
Prior integration content tip: `26eee3fa024d4b716a0fd8e3daf17e76fdad510f`
**Reviewed corrective content tip: `88da5844130d961fcb9c094dfc41cdc30cc46399`**
Branch tip: the handoff-only tail commit that pins the review artifacts
Merge commit SHA: **Pending until merge**

**Status: NOT MERGED, NOT PUSHED. Stops for an independent Full-class review of the COMPLETE
CUMULATIVE RANGE `5bbe3635...88da5844130d961fcb9c094dfc41cdc30cc46399`.**

**NEITHER EARLIER TIP HAS EVER HELD A PASSING VERDICT.** The pre-rebase tip `5f8cb59d` was built
against `a2121ca3`, which is no longer the base; the integration tip `26eee3fa` was superseded by this
correction. Both earlier artifacts are **historical evidence only** — see § 10. The controlling
artifact is the cumulative one in § 10.1.

### What changed in this corrective round

| | After integration (`26eee3fa`) | Now |
| --- | --- | --- |
| False provider-inaccessibility claims | present in 5 files | **corrected; boundary stated in module headers** (§ 4.8) |
| `REASON.STORAGE_ROLLED_BACK` + `highWaterAdmitted` | present but unreachable | **REMOVED** (§ 4.9) |
| Ledger integrity | structural validation only | **+ unkeyed SHA-256 checksum, honestly scoped** (§ 4.10) |
| Chain entries | 63 | **63** (unchanged — no new suites) |
| Assertions | 4,616 | **4,673** |
| `BLUE-HELM-MASTER-STATUS.md` | no ledger residual | **residual + void conditions recorded** (§ 12) |

## 0. Blue authorization — verbatim

**THIS corrective work order:**

> I ACCEPT THE ADMISSION LEDGER AS AN ACCIDENTAL-SPEND CONTROL, NOT A SECURITY BOUNDARY AGAINST A MALICIOUS OR COMPROMISED SAME-USER PANE. CORRECT THE FALSE PROVIDER-INACCESSIBILITY CLAIMS, REMOVE THE UNREACHABLE ROLLBACK GUARD, AND RETURN FOR FULL REVIEW.

Blue's additional requirements, all satisfied: the limitation is in the module's own header (§ 4.8);
it is recorded in `BLUE-HELM-MASTER-STATUS.md` beside the pane-status provenance residual (§ 12);
cheap, honestly described tamper detection is retained and did **not** grow into another subsystem
(§ 4.10).

**The originating work order for the branch:**

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

**Files changed by THIS corrective round (9):**

| File | Change |
| --- | --- |
| `app/admission-budget.js` | Threat-boundary header block (§ 4.8); `STORAGE_ROLLED_BACK` + `highWaterAdmitted` removed with a removal note in place (§ 4.9); `STORAGE_INTEGRITY_MISMATCH` added and mapped from the store's reason |
| `app/admission-budget-store.js` | Threat-boundary + checksum-scope header block; `canonicalize`/`checksumOf`; verify-and-strip on load; stamp on save; `INTEGRITY_MISMATCH` reason (§ 4.10) |
| `app/main.js` | Both false claims corrected — the require comment and the `ptyEnv` comment (§ 4.8) |
| `app/launcher-fence-invariant.test.js` | False `CLAUDE_CODE_SUBPROCESS_ENV_SCRUB` analogy retracted; **fourth re-pin**, `pty-start` 12443 → 13170, comment-only, with `ptyEnv` and the fenced-role gate both proven unmoved |
| `app/admission-budget.test.js` | Section renamed off the removed guard; false residual justification retracted; pane-status tripwire narrowed to the truthful claim; boundary-statement assertions added |
| `app/admission-budget-store.test.js` | The whole checksum section, including the labelled accepted limitations and the no-new-dependency scan |
| `app/admission-ui-integration.test.js` | Integrity detection end-to-end; labelled replay/recompute/delete negative controls; plan-mismatch moved onto its own intact ledger; dead-guard-is-gone assertions |
| `BLUE-HELM-MASTER-STATUS.md` | The accepted-residuals section and the four void conditions (§ 12) |
| `docs/BUILDER-HANDOFF-pane-status-admission-budget.md` | This document (the handoff-only tail) |

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

### 4.8 THE FALSE PROVIDER-INACCESSIBILITY CLAIMS — what they were, and where they were

**This is the most important section for a reviewer.** Earlier revisions of this branch asserted, in
code and in this document, that the provider process could not reach the admission ledger. **That was
false.** The claim was retracted at Blue's direction and the real boundary is now stated in the
modules' own headers.

The corrected statement, which now appears verbatim in `app/admission-budget.js` and
`app/admission-budget-store.js`:

> This budget bounds accidental paid-turn spend through Blue Helm's controlled input paths. It is not a
> security boundary against a malicious or compromised process running as the same Windows user. Such a
> process may locate, delete, replace, or rewrite the local ledger directly.

**Every site that carried the false claim, and what it says now:**

| File | The false claim | Corrected to |
| --- | --- | --- |
| `app/admission-budget.js` header | "WHAT CANNOT TOUCH THE LEDGER" — read as inaccessibility | A full threat-boundary block: the narrow true claim (no supported pane-status module API mutates admission state), each retracted inference named, and the list of what *does* still protect against accident |
| `app/admission-budget-store.js` header | *(no boundary statement at all — silence read as safety)* | The same boundary block, plus the checksum's exact scope |
| `app/main.js` require comment | "nothing in prototype-pane-status/ can reach the ledger" | "NO SUPPORTED PANE-STATUS MODULE API MUTATES ADMISSION STATE … That is a CODE-LEVEL property, NOT a claim of OS-level inaccessibility" |
| `app/main.js` `ptyEnv` comment | "the child must not be able to read, and therefore must not be able to reason about or rewrite, the configuration that bounds its own paid turns" | States that the strip hides the run id and allowance **and nothing more**; names `APPDATA`/`USERPROFILE` as still present; states that the scrub line is not evidence of inaccessibility |
| `app/launcher-fence-invariant.test.js` re-pin note | drew an analogy to `CLAUDE_CODE_SUBPROCESS_ENV_SCRUB` implying the pane cannot reach the cost control | "It can." — followed by the four specific reasons |
| `app/admission-budget.test.js` residual note | "the agent can neither find nor rewrite it" | The claim is quoted and marked **FALSE**, with each reason it fails |
| `app/admission-ui-integration.test.js` § 15 | "Claude Code cannot reach this file" | Replaced by the integrity-checksum block with its limitations labelled |
| this handoff § 8 | "the agent can neither locate nor rewrite it" | Rewritten (§ 8) |

**The four required distinctions, each now stated where the relevant code lives:**

1. Stripping admission environment keys hides the configured **run ID and allowance** from the pane
   environment. That is its entire effect.
2. It does **not** hide Electron `userData`.
3. It creates **no** filesystem isolation — `APPDATA`, `USERPROFILE`, repository source, and plain
   filesystem enumeration may each reveal the ledger location.
4. `CLAUDE_CODE_SUBPROCESS_ENV_SCRUB` is **not** evidence that the same-user Claude process cannot
   reach the ledger; and the absence of an import from `prototype-pane-status/` proves only that **no
   supported code-level API** connects those modules to the ledger, **not** OS-level inaccessibility.

**A note on what could NOT be mechanically enforced, and why.** I first added a negative source scan
asserting the retracted phrases were absent from the three modules. **It failed, correctly**: the
corrections *quote* those sentences in order to retract them, and no regex distinguishes quotation
from assertion. The scan was replaced with **positive** assertions — each of the three files must
contain the boundary statement and the "accidental-spend control" naming — and the limitation of that
approach is stated in the test itself. A reviewer who finds an inaccessibility phrase in these files
will find the retraction beside it.

### 4.9 The dead rollback guard is REMOVED

`REASON.STORAGE_ROLLED_BACK` (`admission-ledger-rolled-back`), the `highWaterAdmitted` variable, its
comparison in `initialize()`, and both of its update sites are **gone**. So are the comments and test
sections that claimed cross-process or cross-restart rollback protection.

**Nothing replaces it, and no new prevention claim replaces it.** The removal is recorded in place — a
comment at the former reason-code site explains what it claimed, why it never worked (a per-instance
mark starting at 0, plus an `initialize()` that short-circuits once loaded, made the comparison
unreachable for the case its name implied), and that a dead guarantee is worse than an absent one
because it invites reliance.

`admission-budget.test.js`'s section was renamed from **"rollback tripwire"** to **"ledger replaced
underneath: live count authoritative, new process adopts"** — a name that describes behaviour instead
of a guard that no longer exists. Every assertion in it is preserved.

**Asserted gone**, so it cannot quietly return: `REASON` has no `STORAGE_ROLLED_BACK` key, and no
reason *value* anywhere equals `admission-ledger-rolled-back`.

### 4.10 The integrity checksum — exact scope, and why it stayed small

Implemented, because it remained a small dependency-free delta: two functions and one reason code
inside the existing store, at the single read boundary and the single write boundary.

| Property | Value |
| --- | --- |
| Algorithm | SHA-256, **unkeyed**, via Node's built-in `crypto` |
| Input | Deterministic canonical serialization of the validated ledger content, **excluding** the `checksum` field |
| Stored as | `checksum` on the ledger document, required on **every** persisted ledger |
| Verified | On load, **before any run record is accepted** |
| On mismatch | Fails closed visibly as `admission-ledger-integrity-mismatch`; the file is **never** repaired, deleted, or overwritten |
| Atomicity | Unchanged — write-temp-then-rename is untouched |
| New dependencies | **None.** Asserted: the store requires only `fs`, `path`, `crypto` |

**Canonicalization matters and is tested.** `JSON.stringify` is order-sensitive and the `runs` map is
built by insertion, so a checksum over raw output would mismatch after a semantically identical
rewrite — turning a corruption detector into a source of false refusals. Keys are sorted at every
depth, array order is preserved as data, and the `checksum` field is excluded from its own input.

**WHAT IT IS NOT — stated in the header, in the tests, and in Master Status:**

- **Not authentication.** There is no key and deliberately none: a secret stored beside the thing it
  protects, readable by the same user, would move the claim without changing it.
- **Not hostile tamper resistance.** A same-user process can recompute the checksum. **Asserted** as
  an accepted limitation, not hidden.
- **Not rollback prevention.** Replaying an earlier valid checksummed ledger **is accepted and not
  detected**. Asserted as a labelled negative control.
- Deleting the ledger still recreates a fresh run under the existing `not-found` rule. Asserted.

`timingSafeEqual` is deliberately **not** used, and the code says why: both values are already on this
machine and readable by this user, so there is no secret to leak through timing. Reaching for it would
imply an adversary model this control does not claim.

**No unchecksummed-ledger migration path exists, and none is needed** — no production ledger has been
created by an authorized live run, and none was created during this work. A ledger with an absent or
malformed checksum is **refused**, which is both the fail-closed direction and the only way to stop
"delete the field" being a trivial bypass.

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

### 5.0b THIS CORRECTIVE ROUND — reconciled from the established 4,616 baseline

**`npm test` — PASS, exit 0. 63 suites, 4,673 assertions, 0 failures.** Both reporting formats counted.

| Source | Assertions |
| --- | ---: |
| Established baseline (integration tip `26eee3fa`) | 4,616 |
| — `admission-budget-store.test.js` (35 → 69): the whole checksum section — round-trip, canonicalization, five un-recomputed mutations, seven malformed-checksum shapes, refusal hygiene, three labelled accepted limitations, and the no-new-dependency scan | **+34** |
| — `admission-ui-integration.test.js` (140 → 153): integrity mismatch detected / refuses / cannot self-heal, the labelled replay and delete negative controls, the plan-mismatch case moved onto its own intact ledger, and the dead-guard-is-gone assertions | **+13** |
| — `admission-budget.test.js` (205 → 215): the narrowed pane-status tripwire plus the boundary-statement assertions across three modules | **+10** |
| **Total** | **4,673** |

**No new suites, so the chain stays at 63 entries.** Corrections belong in the suites that carried the
false claims, not in a new file that leaves the old ones untouched.

**Three suites changed, all upward. No suite vanished, and nothing was weakened** — verified by set
difference against the previous run, not by inspection.

### 5.0c This corrective work order's 15 required tests

`B` = `admission-budget.test.js`, `S` = `admission-budget-store.test.js`,
`I` = `admission-ui-integration.test.js`, `V` = `renderer/admission-view.test.js`,
`Q` = `quick-links-integration.test.js`, `F` = `launcher-fence-invariant.test.js`.

| # | Required test | Where | Result |
| --- | --- | --- | --- |
| 1 | The unreachable rollback reason and high-water implementation no longer exist | I — `REASON` has no `STORAGE_ROLLED_BACK` key and no value equals `admission-ledger-rolled-back` | PASS |
| 2 | A valid checksummed ledger loads | S — loads, content intact, and the `checksum` field is stripped before the policy layer sees it | PASS |
| 3 | Changing `admitted`/`remaining` without updating the checksum visibly refuses | S — five un-recomputed mutations (`admitted`, `allowance`, `state`, an added run, a removed run). I — end-to-end, refused as `admission-ledger-integrity-mismatch` | PASS |
| 4 | Checksum mismatch produces zero PTY writes | I — no prompt can be admitted through a mismatched ledger; the budget stays fatally closed | PASS |
| 5 | Checksum mismatch cannot self-heal into a new allowance | I — a further budget over the same file refuses again; the rejected file is byte-for-byte as found | PASS |
| 6 | Malformed, oversized, linked, directory, version-mismatched, plan-mismatched files still refuse | S (all file-level cases, unchanged) + B (13 hostile documents) + I — **the plan-mismatch case was moved onto its own intact ledger**, because against a corrupted file it would have passed for the wrong reason | PASS |
| 7 | Atomic persistence remains intact | S — write-temp-then-rename untouched; a throwing `writeFileSync` leaves the previous ledger in place | PASS |
| 8 | Durable decrement before write remains intact | B — the writer snapshots the persisted ledger and already counts its own admission. I — the on-disk ledger at writer time shows the decrement | PASS |
| 9 | Writer failure remains spent | B + I — consumed, not refunded, `admission-write-failed-after-admission` | PASS |
| 10 | Controlled-pane direct input remains blocked | I — a 9-keystroke burst reaches the PTY 0 times; refusal visible on the Logs channel | PASS |
| 11 | Uncontrolled panes remain unchanged | I — all 11 keystrokes pass through; nothing blocked with no run configured | PASS |
| 12 | Gate-off remains absent, not inert | V + I — `mount()` builds nothing, host keeps zero children, channels registered only inside main's enabled branch | PASS |
| 13 | Prompt content absent from the ledger, checksum input evidence, logs, errors, IPC responses, DOM | I — a sentinel is scanned across the **real ledger file** (which is exactly the checksum's input), main-side logs, renderer logs, the rendered DOM, and both IPC payloads, while confirming it did reach the PTY | PASS |
| 14 | Source tripwires use the narrower truthful claim | B — the assertion now reads *"no supported pane-status module API mutates admission state"*, plus positive boundary-statement assertions across three modules (see § 4.8 for what could not be enforced) | PASS |
| 15 | Quick Links behaviour and its corrected 141-byte anchor remain intact | Q — 43 assertions incl. the 141-byte/3-line pins. I — preload methods, main handlers, DOM ids, script tag, `app.js` call sites, CSS, and all 5 suites in the chain. F — the fenced-role region still `1354 / ae9dce92…` | PASS |

**Negative control, explicitly labelled as an accepted limitation and NOT a passing security
property:** `I` and `S` both demonstrate that **replaying an earlier valid checksummed ledger is
accepted**, that **an edit which recomputes the checksum is accepted**, and that **deleting the ledger
recreates a fresh run**. Each assertion label begins with `ACCEPTED LIMITATION:`.

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
| 15 | Restart, **ledger integrity**, pane binding, zero budget intact | I — restart preserves the spent count and refuses to rebind; an un-recomputed edit is DETECTED and refuses; the accepted replay/recompute/delete limitations are labelled as such (§ 4.10); configuration top-up refuses on its own intact ledger; binding cannot move; a dead pane closes the run; allowance 0 yields the refusing budget. **The rollback tripwire named in the earlier revision of this row no longer exists (§ 4.9).** | PASS |
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

**Before this corrective round — every starting-state item verified, none assumed:**

* `git fetch origin --prune` run for real; `main` = `origin/main` =
  `5bbe3635736f18c9b8d4b50a23c7b51955f7bd0f`.
* Branch tip `4ac56ac5f97b29139eda847b08b313602179fd48`, with its parent equal to the prior content tip
  `26eee3fa024d4b716a0fd8e3daf17e76fdad510f`.
* Worktree tracked state clean; root worktree carried only `?? .worktrees/`.
* **Both controlling artifacts verified by size AND hash before editing**, and both preserved
  unchanged afterwards (re-verified — § 10.2):
  * cumulative `279,666` / `fa968feff6c2aac8883baaa15140f11766fb1d143484fd2811b4eec43c4f873b`
  * focused `99,031` / `5e64b8e9cbe80a9a671d902986a3a469a4519ac050cd5dfdf27ef67cd6db7448`
* The 4,616-assertion / 955-Pester baseline was the measured result of this branch's own prior runs.

**Earlier, before the integration round (retained):**

* The Quick Links gate was **measured, not accepted** — 57 entries, 57 reporting suites, 3,883
  assertions, 0 failures, by running `npm test` on `main`.

**After the edits:**

* `git diff --check` clean (exit 0) on **both** the focused and cumulative ranges.
* No `.ps1`, `.psd1`, or `scripts/` file changed — **Pester run regardless: 955 passed, 0 failed,
  identical to the pre-correction run.**
* `main` and `origin/main` remain at `5bbe3635736f18c9b8d4b50a23c7b51955f7bd0f`. **Nothing merged,
  nothing pushed.**
* **No admission ledger was created by this work.** No production ledger exists; every ledger touched
  was inside a per-test temporary directory that the suite removes.
* The composition was **proven**, not eyeballed: the `+`/`-` payload of `git diff 5bbe3635 -- <file>`
  is line-for-line identical to `git diff a2121ca3 5f8cb59d -- <file>` for both `app/main.js` (125
  lines) and `app/preload.js` (28 lines), so the rebase preserved main plus exactly the admission delta
  and dropped neither side.
* The fenced-role cwd gate hash was independently recomputed across four revisions (§ 4.1) and matches
  the ORIGINAL reviewed base at every one.
* Working-copy line endings were normalised via `git checkout --` after commit, so the committed blobs
  are LF and the worktree is CRLF per `.gitattributes`; the gate was re-run afterwards and still passes.

## 8. Known limitations

* **THE GOVERNING LIMITATION — the ledger is an accidental-spend control, not a security boundary.**
  Blue's authorization, verbatim:

  > I ACCEPT THE ADMISSION LEDGER AS AN ACCIDENTAL-SPEND CONTROL, NOT A SECURITY BOUNDARY AGAINST A
  > MALICIOUS OR COMPROMISED SAME-USER PANE. CORRECT THE FALSE PROVIDER-INACCESSIBILITY CLAIMS, REMOVE
  > THE UNREACHABLE ROLLBACK GUARD, AND RETURN FOR FULL REVIEW.

  **A malicious or compromised process running as the same Windows user may locate, delete, replace, or
  rewrite the local ledger directly.** The provider process in a pane is such a process. Deleting the
  ledger returns the run to "never created" and the next start mints a fresh allowance; replacing it
  with an earlier valid copy restores spent turns; rewriting it and recomputing the unkeyed checksum is
  accepted. All three are **asserted** in the suites, labelled `ACCEPTED LIMITATION:`.

  **The prior revision of this bullet claimed the opposite and was wrong.** It said the ledger "lives
  under Electron `userData`, never inside a worktree, and every admission env key is stripped from each
  PTY environment, so the agent can neither locate nor rewrite it." Each clause fails: stripping the
  env keys hides only the run id and allowance; `userData` is not concealed by it; `APPDATA` and
  `USERPROFILE` are in every PTY; the ledger filename is a literal in readable repository source; and a
  PTY child has the same file access main has. **Full retraction table in § 4.8.**

  **What genuinely survives** is a bound on accidental spend through Blue Helm's own input paths: the
  durable decrement before any PTY byte, the no-refund rule after a post-persist writer failure, the
  plan-mismatch refusal (so a raised `BLUE_HELM_ADMISSION_ALLOWANCE` plus a restart cannot top a run
  up), the structural and integrity refusals, and the direct-input block on the controlled pane.
* **The dead rollback guard is gone rather than fixed.** `REASON.STORAGE_ROLLED_BACK` and
  `highWaterAdmitted` were removed at Blue's direction (§ 4.9). **Nothing replaces them and no new
  prevention claim replaces them.** A real cross-restart rollback guard would need the high-water mark
  persisted somewhere a same-user process cannot rewrite — which is a different threat model and a
  different work order, not a tweak here.
* **The integrity checksum is unkeyed and detects accidents only** (§ 4.10). It catches corruption and
  edits that did not recompute it. It is not authentication, not hostile tamper resistance, and not
  rollback prevention. Replay is undetected. This is deliberate: a key stored beside the file it
  protects, readable by the same user, would move the claim without changing it.
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
* **`REASON.STORAGE_ROLLED_BACK` was dead code that advertised a guarantee, and it is now REMOVED.**
  Reported in the integration round with the code left untouched (correctly — that round's scope was the
  UI and the rebase); **Blue then directed its removal, and this round removed it** (§ 4.9). The earlier
  revision of this bullet said "the code itself was deliberately not redesigned", which no longer holds.
  **A real cross-restart rollback guard remains a separate work order** — it would require the
  high-water mark persisted somewhere a same-user process cannot rewrite, which is a different threat
  model than the one Blue has accepted.
* **The `pty-start` byte-invariance tripwire IS now on its fourth re-pin** — the previous revision of
  this bullet said it "did NOT need a fourth", which was true of the integration round and is no longer
  true. This round's re-pin is **comment-only** (12443 → 13170), and the two things that make it safe to
  accept are measured rather than asserted: `ptyEnv` is unchanged at 271 / `2a399a98…`, so the
  environment handed to a PTY was not touched, and the fenced-role gate is unchanged at 1354 /
  `ae9dce92…`. **The standing recommendation is now stronger: four re-pins in four rounds means the
  region is a busy intersection, and splitting the credential-critical part from the lifecycle part so
  they can move independently is worth its own small work order.**
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
| Integration content (superseded) | `26eee3fa024d4b716a0fd8e3daf17e76fdad510f` |
| Integration handoff tail (superseded) | `4ac56ac5f97b29139eda847b08b313602179fd48` |
| **Reviewed corrective content tip** | **`88da5844130d961fcb9c094dfc41cdc30cc46399`** |
| Branch tip | exactly **one** new handoff-only tail commit above it, touching only this file |

### 10.1 The controlling artifacts

Both created with `git diff --output` (never a PowerShell `>` redirect), both gitignored via
`.gitignore:33`, and both **regenerated from their stated range to a separate temporary file and proven
byte-identical with `cmp` (exit 0)**; only the temporary copies were removed. `git diff --check` is
clean (exit 0) on **both** ranges and on the working tree.

| Artifact | Range | Shortstat | Size | SHA-256 |
| --- | --- | --- | ---: | --- |
| **`.agent-review-admission-threat-boundary-cumulative.diff`** — **THE CONTROLLING ARTIFACT** | `5bbe3635...88da5844` | 22 files, 5,610 insertions, 11 deletions | **339,512** | `e0bd4d265326ffe1db7a98224ab8a242969882927ad91d6356b3689416a1fcca` |
| `.agent-review-admission-threat-boundary-correction-focused.diff` — this corrective round alone | `4ac56ac...88da5844` | 8 files, 630 insertions, 74 deletions | **62,142** | `985c8fa3244523c0540c8c49c234a696ff94c57b350d6e37b44044468f5d6226` |

**Review the CUMULATIVE artifact.** The focused one shows only the correction; it is **not** sufficient
for a verdict, because nothing beneath it has ever held a passing review (§ 0.1) and because the
correction is only meaningful against the claims it retracts.

### 10.1b Superseded artifacts — PRESERVED UNCHANGED, not review targets

All three are retained exactly as generated, hashes re-verified after this round:

| Artifact | Range | Size | SHA-256 | Status |
| --- | --- | ---: | --- | --- |
| `.agent-review-admission-quick-links-integration-cumulative.diff` | `5bbe3635...26eee3fa` | 279,666 | `fa968feff6c2aac8883baaa15140f11766fb1d143484fd2811b4eec43c4f873b` | superseded by the row above |
| `.agent-review-admission-controlled-prompt-focused.diff` | `93401b6...26eee3fa` | 99,031 | `5e64b8e9cbe80a9a671d902986a3a469a4519ac050cd5dfdf27ef67cd6db7448` | superseded |
| `.agent-review-pane-status-admission-budget.diff` | `a2121ca3...5f8cb59d` | 187,699 | `4fc2ed34cc049b603233e564874cc1ee854388af7a8c8ff000d14cc5d99290a6` | pre-integration; cites SHAs no longer on the branch |

**None was overwritten or renamed**, and each states a range that no longer describes the branch tip.
They are history, not review targets.

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

**No verdict exists for any tip of this branch.** The reviewer must evaluate the **complete cumulative
range** `5bbe3635...88da5844130d961fcb9c094dfc41cdc30cc46399` via the cumulative artifact in § 10.1 — not the pre-integration
artifact, not the superseded integration artifact, and not the correction-focused diff alone.

## 12. `BLUE-HELM-MASTER-STATUS.md` change

One section added, **beside the existing pane-status provenance residual** in the Experiment A
checkpoint, titled **"ACCEPTED RESIDUALS — reporter provenance AND admission-ledger integrity"**. It
records:

* Blue's authorization **verbatim**;
* that the ledger is an accidental-spend control over Blue Helm's input paths;
* that it is **not** a security boundary against a malicious or compromised same-user pane, with the
  four specific corrections (env strip hides only run id and allowance; no `userData` concealment; no
  filesystem isolation; the env scrub and the missing import prove neither);
* that checksum protection detects **accidental edits only**, with replay, recompute and deletion named
  as undetected;
* that the unreachable rollback guard was removed and **nothing replaces its claim**;
* that provider provenance and ledger integrity are accepted residuals **in the same
  advisory/human-controlled category**;
* the **four automatic void conditions**, verbatim from the work order: if pane status or admission
  state ever authorizes an action, triggers automation, controls merge/push/approval/restart/process
  termination/credentials or another consequential operation, or is represented as protection against a
  hostile local process — **both acceptances become void and require a new threat decision.**

**No unrelated roadmap entry was reordered and no historical checkpoint was reinterpreted.** The
insertion is additive, placed inside the current-baseline Experiment A section, and every superseded
checkpoint below it is untouched.

## Review-diff rule

* Before merge (this is the current state), use `git diff main...<tip>` — here
  **`git diff 5bbe3635...88da5844130d961fcb9c094dfc41cdc30cc46399`**.
* After merge, the three-dot form goes empty, so reproduce with
  `git diff <recorded-pre-merge-main>...<tip>` using the SHAs recorded in § 10.
* Four SHAs for this branch: fork-point `5bbe3635`, pre-merge `main` `5bbe3635`, corrective content tip
  `88da5844130d961fcb9c094dfc41cdc30cc46399`, merge commit **pending**.
* Always use `--output`; never PowerShell `>`.
* Retain the literal `VERDICT: PASS|FAIL` line and name the review that produced it. A paraphrase or
  implied verdict is not a merge-gate verdict.

## Recommended review focus

### The five decisions this review is required to reach

The corrective work order names them. Each should be answered explicitly in the verdict:

1. **Do the code and documentation now state the accepted threat boundary honestly?** The statement is
   in the headers of `admission-budget.js` and `admission-budget-store.js`, in two places in `main.js`,
   in the fence tripwire's re-pin note, in two test files, in § 4.8 here, and in Master Status § 12.
   Read at least the two module headers directly rather than this summary of them.
2. **Does any dead rollback guarantee survive?** `REASON.STORAGE_ROLLED_BACK` and `highWaterAdmitted`
   should be absent from `app/` entirely — grep for both, and for the string
   `admission-ledger-rolled-back`, rather than trusting § 4.9. The only surviving occurrences should be
   the removal note at the former reason-code site and the retraction prose.
3. **Does the checksum language overclaim anywhere?** Look for "authentication", "tamper", "secure",
   "prevents", "protects against" near the checksum in code, tests, handoff and Master Status. The
   intended claim is exactly: detects accidental corruption and edits that did not recompute it.
4. **Does the admission control still prevent accidental N+1 input through Blue Helm?** This is the
   property the whole branch exists for, and it must not have been weakened by the corrections. Exercise
   allowance N → N+1 refused → zero PTY writes, and the direct-input block on the controlled pane.
5. **Do Quick Links and fenced-launch behaviour remain intact?** The fenced-role region should still be
   `1354 / ae9dce92…`; Quick Links' 43 assertions should still pass with the 141-byte anchor.

### Supporting focus, in priority order

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
8. **§ 4.10, the checksum's canonicalization.** Insertion order must not change the digest, or an
   identical rewrite would produce false refusals. Confirm the `checksum` field is excluded from its own
   input, and that stripping the field is refused rather than tolerated.
9. **The accepted limitations, as limitations.** Every `ACCEPTED LIMITATION:` assertion is documenting
   something the control does **not** do. Confirm none of them is presented as a passing security
   property, and judge whether Blue's acceptance covers each one.
10. **The environment scrub.** Can any admission key reach a child PTY? Is the key list complete? Note
    the corrected framing: this hides configuration, it does not protect the ledger.
11. **Content hygiene.** Can a prompt reach a log, an error, the ledger — which is now also the
    checksum's input — an IPC payload, or the DOM?
12. **The census.** `4,616 + 57 = 4,673` for this round, and `3,883 + 458 + 275 = 4,616` for the
    cumulative range. Re-derive both; confirm no suite silently lost assertions.
13. **Scope.** Is this only the correction plus turn admission and its minimal UI? Has any pane-status
    production work, provider onboarding, hook installation, or badge work crept in?
14. **What could NOT be mechanically enforced (§ 4.8).** A negative source scan for the retracted
    phrases was tried and removed, because the corrections quote those phrases in order to retract them.
    Judge whether the positive assertions that replaced it are sufficient, or whether a different
    mechanism is wanted.

## Reviewer verdict

**None yet.** This branch stops for a fresh independent **Full-class** review, by a reviewer who is not
the author, of the complete cumulative range `5bbe3635...88da5844130d961fcb9c094dfc41cdc30cc46399`.

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
