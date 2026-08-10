# Builder Handoff — Pane-Status OSS Procurement Evaluation

Branch: `feature/pane-status-source-scout`
Worktree: `.worktrees/pane-status-source-scout`
Fork-point SHA: `7a102a2498cb48fdc168e20503741509c5daefd3`
Pre-merge main SHA: `7a102a2498cb48fdc168e20503741509c5daefd3`
Documentation reviewed tip: see § 8
Branch tip: see § 8
Merge commit SHA: Pending until merge

**Status: VERDICT FINALIZED — REVISION 4 REVIEWED `VERDICT: PASS`; BLUE ISSUED
`BLUE SUBSYSTEM VERDICT: PROTOTYPE`; BOUNDED PROTOTYPING AUTHORIZED; PRODUCTION IMPLEMENTATION REMAINS
UNAUTHORIZED**

## 0.0.0 Verdict finalization — the current state of this branch

**Revision-4 review result:** `VERDICT: PASS`, independent Standard-class, at reviewed tip
`555aee5db928a8be73b0e3cdb528019677f9ad4e`. Three prior revisions returned `VERDICT: FAIL` and are
preserved below as review history.

**Blue's human authorization, verbatim:**

> lets continue with prototype

**Canonical subsystem verdict, recorded verbatim in § 12 of
`docs/OSS-PROCUREMENT-pane-status.md`:**

> BLUE SUBSYSTEM VERDICT: PROTOTYPE

**The exact authorization boundary:**

| | State |
| --- | --- |
| Bounded prototype work on pane-status detection | **AUTHORIZED** |
| **Experiment A** — one-provider hook reporter (§ 11.1 of the record) | **AUTHORIZED** as the intended first prototype, under a **separate** work order that selects the provider and specifies the prototype |
| Production implementation | **NOT authorized** |
| Production specification / general architecture adoption | **NOT authorized** |
| **Experiment B** — app-server runtime testing (listener, `codex --remote`, observer client, settling U5b) | **NOT authorized** unless Blue separately expands the prototype scope |
| Merge or push of this branch | **NOT authorized** by the verdict — that is Blue's separate act |

**No prototype work occurred on this branch.** No hook was installed in any provider configuration, no
provider command was run, no schema was generated, no app-server or remote TUI was started, no model
session was launched, and no application, dependency, script, configuration or test file was touched.
The verdict-finalization commit is a **documentation act only**; the prototype belongs to a later branch
under its own work order.

**Changed files in the verdict-finalization commit** — exactly three, all Markdown:

| Path | Change |
| --- | --- |
| `docs/OSS-PROCUREMENT-pane-status.md` | Verdict recorded (§ 12), authorization state updated (§ 2), Experiment A/B authorization split (§ 11.1) |
| `docs/BUILDER-HANDOFF-pane-status-source-scout.md` | This section, § 9 verdicts, § 9.1 verification, artifact records |
| `BLUE-HELM-MASTER-STATUS.md` | Procurement-gate paragraphs, August 8 checkpoint note, remaining-work entry 1 |

Also updated for internal consistency: § 10.6 and § 11's question preamble in the record, where
statements that "nothing in this record authorizes" the experiment became stale. **No candidate
analysis, capability matrix, threat finding, or recommendation was altered**, and no research was
reopened.

## 0. Review history — revisions 1, 2 and 3 all FAILED, and all are preserved

Three independent Standard-class reviews have been run on this branch. **All three returned the literal
line:**

> VERDICT: FAIL

* **Revision 1** — reviewed tip `10d80b2c36e956ba7548ca49f6a3652ebef31006`. Four findings (§ 0.1).
* **Revision 2** — reviewed tip `0532772d2a78fa36ee591173bef442731fd8590f`. Two findings (§ 0.2).
* **Revision 3** — reviewed tip `63b7d71f205c60e5a8102e35ade320f2adca5995`. Two findings (§ 0.3).

All three verdicts are **superseded review history, not erased or reinterpreted**. All three were
correct. The failed reasoning is retained in place inside the procurement record, each error marked as a
correction at the point where it was made, so a later reader sees what was wrong and not only what
replaced it.

### 0.0 Root causes — one shared by revisions 1 and 2, a different one in revision 3

Revision 1 turned a zero-hit **token scan** of a compiled binary into a negative fact. Revision 2 — while
correcting exactly that — turned a zero-hit **grep of `--help` output** into a negative fact. Same error,
different medium, committed twice.

The standing rule recorded in § 0.1 of the procurement record: **a negative claim may never rest on a
search that could miss. It must rest on a closed enumeration or an explicit statement in a source.**
Revision 3 applied it correctly — the "no `thread/subscribe` method exists" finding is drawn from the
`ClientRequest` discriminated union, which is exhaustive by construction, and the `--remote` finding came
from reading all 134 lines of `--help` rather than filtering them.

**Revision 3 failed on something else: precision of description, not evidence handling.** It listed four
topologies, one of which could not be true at all (Blue Helm driving the thread *and* the real remote TUI
remaining the driving UI); it stated one open question so broadly that a **documented** read path was
filed under the same "unverified" label as an **undocumented** push path; and it used *officially
supported* where the source says only *documented*, while the same source calls the transport
experimental and unsupported for production. The added rule: **an option must be internally consistent to
be listed, an uncertainty must be no broader than the evidence makes it, and documented is not
supported.**

Note the direction of the third failure. Revisions 1 and 2 **overclaimed a negative**; revision 3
**overclaimed uncertainty** on U5a and **overclaimed support** on the topology. The correction discipline
has to run both ways: not converting uncertainty into a negative fact, and not converting a documented
fact into an uncertainty.

### 0.1 Revision 1 — the four findings and their disposition

| # | Finding | Disposition in revision 2 |
| --- | --- | --- |
| 1 | The candidate set was incomplete — it evaluated hooks and terminal signals without carding the official **Codex app-server JSON-RPC interface**. | **Corrected.** New full candidate card § 6.A5 against all sixteen required criteria, a new comparison-matrix row **A5**, a new app-server column in the § 7.1 capability matrix, a new § 9.2 adopt-vs-build row, and a new Blue question (§ 11 Q7). All six required event families are documented from the installed schema. |
| 2 | Zero plaintext-token matches in a compiled binary were promoted into behavioural claims. | **Corrected.** New § 0.1 evidence tiers (T1 documented / T2 installed schema / T3 token presence / T4 runtime / T5 inference) with an explicit statement that **T3 absence proves nothing**. The Codex `SessionEnd` claim (§ A2) and the "Codex and Gemini do not emit OSC 9;4" claim (§ B3) are both **withdrawn** and restated with exactly what was searched, what was observed, and what it cannot establish. § 7.5 was rebuilt because it rested on the withdrawn claim. |
| 3 | Claude's `terminalSequence` was described as permitting **arbitrary** escape sequences, and the Windows position was stated wrongly. | **Corrected.** § A1 now quotes the documented allowlist verbatim (OSC 0/1/2/9/99/777 and bare BEL; anything else — including OSC 52 — is rejected and the field ignored) and the documented statement that it **works on Windows**. The narrower, sharper concern is retained: OSC `9` is allowlisted and `9;4` is named explicitly, so an in-band OSC 9;4 marker remains forgeable by an allowed hook output. Threat 1 was updated to match. |
| 4 | The cross-provider asymmetry claim was too strong. | **Corrected.** "Only Claude Code distinguishes awaiting input from finished" is **withdrawn** — it also contradicted revision 1's own matrix, which already scored Codex and Gemini "partial" on that row. § 7.1 now records that all four evaluated interfaces distinguish some awaiting-input condition from completion, that Codex's app-server expresses **both** `waitingOnUserInput` and `waitingOnApproval` as explicit state flags, and that what is genuinely distinctive about Claude Code is narrower: among the three **hook** systems it appears uniquely documented for both idle-prompt and permission-prompt distinctions. "Richest documented coverage" is now explicitly separated from "exclusive capability." |

### 0.1.1 Correction that most changed the picture in revision 2

Finding 1 was not a bookkeeping omission. The installed Codex app-server exposes
`thread/status/changed` carrying a `ThreadStatus` union of `notLoaded` / `idle` / `systemError` /
`active`, where `active` carries `activeFlags` of `waitingOnUserInput` or `waitingOnApproval` — a
**state model** rather than an event stream, bound to an explicit `threadId`, with approvals delivered
as JSON-RPC **requests** the client must answer. On status semantics alone it is the best interface in
the record, and revision 1 gave Blue no opportunity to weigh it.

### 0.2 Revision 2 — the two findings and their disposition

| # | Finding | Disposition in revision 3 |
| --- | --- | --- |
| 1 | **The decisive app-server premise is false.** Revision 2 stated that installed Codex 0.142.3 offered no way to connect its real TUI to app-server, and concluded that adoption must replace the terminal interface. The reviewer reproduced `--remote <ADDR>` — *"Connect the TUI to a remote app server endpoint"* — accepting `ws://`, `wss://`, `unix://`, `unix://PATH`; `app-server --listen`; WebSocket auth flags `--ws-auth`, `--ws-token-file`, `--ws-token-sha256`; and the official *"Connect the CLI terminal UI"* procedure. | **Corrected.** § 6.A5 carries a withdrawal block naming the error and how it happened, the reproduced command surface, the official topology verbatim, and the surviving qualifications (WebSocket experimental/unsupported; loopback vs non-loopback; unauthenticated-by-default during rollout). § 10.2 was rebuilt as a **four-topology** comparison *(**SUPERSEDED in revision 4** — one of those four was internally impossible; § 10.2 is now a **three-topology** comparison, § 0.3 finding 1)*; § 10.2.1 states exactly how the remaining uncertainty affects the recommendation; § 10.3 now carries **two** flip conditions. The handoff's § 6.2 stale row is marked superseded and § 6.3 records the revision-3 evidence. |
| 2 | **Withdrawn claims remained as current facts** — the B3 comparison row said OSC 9;4 was "verified absent" from Codex and Gemini; the handoff still asserted Codex `SessionEnd` absence, Claude-only OSC 9;4, and that only Claude distinguishes awaiting-input from finished. | **Corrected.** A full sweep was run across both documents for thirteen phrase patterns (`verified absent`, `absent from the installed`, `do/does not emit`, `cannot emit`, `Claude only`, `Claude-only`, `Only Claude`, `no attach flag`, `no flag`, `cannot observe`, `replaces/replacing the Codex`, `replaces the terminal`). Every **current-voice** occurrence was corrected; historical ones survive only inside visibly-labelled withdrawal blocks. Repaired specifically: the B3 comparison row, the A5 comparison row, the handoff installed-evidence table, "Findings a reviewer should check first" (renumbered to eight entries and rewritten), the § 9.2 adopt-vs-build row, § 10.2/§ 10.2.1/§ 10.3, § 10.4's Codex row, and the U5 entry. The duplicate revision-2 artifact table header was also removed. |

### 0.3 Revision 3 — the two findings and their disposition

| # | Finding | Disposition in revision 4 |
| --- | --- | --- |
| 1 | **§ 10.2 contained an internally impossible hybrid.** Revision 3's four-topology comparison included one option in which Blue Helm drives the app-server thread *while* the real remote TUI remains the driving UI. A thread has one driver; those cannot both hold. | **Corrected.** § 10.2 is rebuilt around **exactly three** topologies — **A** existing PTY + hooks (no app-server, no new transport, all three providers), **B** Blue Helm drives the thread and renders its own UI (the native/replacement case), **C** the real remote TUI drives and Blue Helm observes as a second client (the only topology combining a genuine TUI with app-server observation). The impossible entry is **deleted, not renamed**, and the record now states verbatim that **B and C are mutually exclusive with respect to who drives the thread and must not be recombined into a hybrid**. Topology labels are letters because `T1`–`T5` are evidence tiers in this record. No fourth topology was added. The comparison table, its explanatory prose, § 10.0, § 10.2.1, § 10.3, § 10.4's Codex row, § 11 Q7, § 5's A5 row and § 9.2's Codex row were all updated to match. |
| 2 | **Support-language overstated the source.** The remote-TUI/WebSocket topology was described in current voice as *officially supported*, which OpenAI's documentation does not say — the same documentation marks the WebSocket transport experimental and unsupported for production workloads. | **Corrected.** Both documents now say *officially documented*, *documented topology*, or *documented command surface*. § 6.A5 carries an explicit note that **"documented" is not a synonym for "supported"**. The experimental/unsupported-for-production qualification is **preserved** everywhere it appeared, including the § 10.2 stability row and the § 6.A5 qualifications block. Labelled historical quotations and withdrawal passages were not altered. |

**Also corrected in revision 4: the U5 split.** Not a separate numbered finding, but the substantive
change the reviewer's first finding forced. Revision 3 asked "can a second client observe a TUI-driven
thread?" as one question and marked all of it unverified. That bundled two mechanisms with different
evidence:

* **U5a — documented.** `thread/loaded/list` lists loaded threads; `thread/read` reads one **without
  resuming it**; the returned thread object carries runtime status. This is a documented polling route
  and revision 4 stops describing it as unverified. What remains open is **measurement** — cadence,
  per-poll cost, displayed staleness, reconnection, idle-unload behaviour — not existence. Approval
  routing is **not** a U5a concern: a reader does not need to receive approval requests to see that a
  thread is `active` + `waitingOnApproval`.
* **U5b — undocumented.** No `thread/subscribe` exists in the installed closed enumeration; whether push
  is obtainable without `thread/resume` is undocumented; and approval-request routing between a TUI and
  an observer is undocumented, as is any `thread/resume` interference or ownership behaviour. U5b keeps
  the "plausible, not established" framing and is **not** given U5a's official citation.

## 1. Intended invariant

> Produce a primary-source-backed OSS procurement evaluation for cross-provider pane-status detection
> without changing, specifying, prototyping, or implementing the production subsystem.

Documentation-only, Standard-class. No runtime behaviour changed, because no runtime file changed.

## 2. Procurement record and authorization state

Tracked record created by this branch: **`docs/OSS-PROCUREMENT-pane-status.md`**.

Blue's verdict, quoted verbatim from § 12 of that record:

> BLUE SUBSYSTEM VERDICT: PROTOTYPE

`PROTOTYPE` is one of the five allowed final subsystem verdicts — **ADOPT · FORK · PROTOTYPE ·
PATTERN-MINE · BUILD FRESH**. `REJECT` appears nowhere as a final verdict; it is used only at the
candidate-disposition level, which `AGENTS.md` defines as a separate, lower level. The verdict
authorizes **bounded prototype work only**; the full boundary is in § 0.0.0 above and § 12 of the record.

> **SUPERSEDED — retained as historical provenance.** Through revision 4 this section read *"There is
> **no Blue subsystem verdict to quote**, so none is quoted"*, and carried the placeholder
> `BLUE SUBSYSTEM VERDICT: NOT YET ISSUED — IMPLEMENTATION REMAINS UNAUTHORIZED` together with the
> then-binding Master Status line *"Cross-provider pane-status indicators still have no Blue verdict, so
> that separate subsystem remains unauthorized for specification or implementation."* Both were accurate
> until Blue issued the verdict and are **stale, not reinterpreted**. `BLUE-HELM-MASTER-STATUS.md` was
> updated in the same commit, so the quotation and its source no longer diverge.

**The Dockview ADOPT verdict was not reused.** `docs/OSS-PROCUREMENT-dockview.md` states the boundary
itself — "keep pane-status indicators separate" — and one record cannot cover two subsystems.
Pane-status's PROTOTYPE verdict is its own and covers only pane-status.

## 3. Files changed

Exactly three across the whole branch, all Markdown:

| Path | Change |
| --- | --- |
| `docs/OSS-PROCUREMENT-pane-status.md` | **Added** — the tracked procurement record (12 required sections) |
| `docs/BUILDER-HANDOFF-pane-status-source-scout.md` | **Added** — this handoff |
| `BLUE-HELM-MASTER-STATUS.md` | **Modified** at verdict finalization only — procurement-gate paragraphs, the August 8 checkpoint note, and remaining-work entry 1 |

> **UPDATED at verdict finalization.** Through revision 4 this section read *"Exactly two, both new, both
> Markdown"*, and the paragraph below stated that `BLUE-HELM-MASTER-STATUS.md` was **deliberately not
> edited** because the roadmap already recorded the pending gate and no verdict existed to record. That
> was correct for revisions 1–4 and is **stale, not reinterpreted**: the verdict-finalization work order
> authorizes and requires the Master Status synchronization, because a verdict now exists.

Superseded text, retained: *"`BLUE-HELM-MASTER-STATUS.md` was **deliberately not edited**, per the work
order: the roadmap already records the pending gate, and no verdict exists to record."*

No application code, test, dependency, lockfile, script, GitHub configuration, `AGENTS.md`, or unrelated
document was touched — in any revision, including verdict finalization.

`codex/release-1.0-auth-backup-blockers` was not read, referenced, or incorporated.

## 4. Security-sensitive surfaces touched

**None changed.** The evaluation *analysed* several, and the analysis is the deliverable:

* provider hook systems as a code-execution surface (§ 6.A1/A2/A4, § 8 threats 2 and 4);
* hook payloads as a conversation-content disclosure surface (§ 8 threat 4);
* in-band terminal sequences as a forgeable-input surface (§ 8 threat 1);
* pane-identity binding across Dockview moves (§ 8 threat 10).

No credential was entered, no provider login performed, no package installed, no paid model run made.

## 5. Method and evidence discipline

Every claim in the record is tagged **[FACT]**, **[INFERENCE]**, or **[RECOMMENDATION]**. Primary
sources with URLs and retrieval dates are listed in § 4 of the record.

The step that produced the most decision-relevant findings was **verifying documentation against the
software actually installed on this machine**, rather than trusting docs that describe current `main`
branches:

| Check | Result |
| --- | --- |
| `claude --version` | `2.1.220 (Claude Code)` — now a native `C:\Users\levij\.local\bin\claude.exe`, no longer the npm `.ps1` shim |
| `codex --version` | `codex-cli 0.142.3` |
| `gemini --version` | `0.49.0` |
| Gemini bundle token scan | Hooks **present** in the installed 0.49.0 (`hook_event_name` ×27, `BeforeTool` ×144, `AfterAgent` ×67) |
| Codex binary string scan | Hooks and `notify` **present** (`hooks.json` ×6, `hook_event_name` ×25, `bypass_hook_trust` ×14, `agent-turn-complete` ×1) |
| Codex `SessionEnd` token scan | **0 occurrences** while `SessionStart` = 45. **T3 observation only — this does NOT establish runtime absence** and the revision-1 claim that it did is withdrawn (§ A2). Runtime status: **unverified (U1)** |
| `OSC 9;4` token scan | `claude.exe` `terminalProgressBarEnabled` ×21, `9;4` ×6; Codex **0**; Gemini **0**. **T3 only.** OSC 9;4 is **documented for Claude Code**; whether Codex or Gemini emit it is **unverified (U2)**, not disproven |
| `Get-Command wmic.exe` | **Not present** on this Windows 11 build — decisive for `ps-tree`, and it forces `pidtree` onto its PowerShell path |

Method caveat recorded in the record itself: string presence in a 308 MB binary is strong evidence for
distinctive tokens and weak evidence for common words. Counts for generic tokens (`Stop`,
`Notification`) are explicitly **not** cited as proof of event names.

## 6. Findings a reviewer should check first

1. **§ 10.2 — the three-topology rebuild (revision 4's main change).** Exactly three options: **A**
   existing PTY + hooks, **B** Blue Helm drives the thread and renders its own UI, **C** the real remote
   TUI drives and Blue Helm observes. Revision 3's fourth option was internally impossible and is
   deleted. Check specifically that **B and C are never recombined** — the record states their mutual
   exclusivity verbatim — and that no fourth topology crept back in.
2. **§ 6.A5 — the corrected app-server topology (revision 3's main change, retained).** Installed Codex
   0.142.3 exposes `--remote <ADDR>` — *"Connect the TUI to a remote app server endpoint"* — and the
   official documentation gives the `codex app-server --listen ws://127.0.0.1:4500` + `codex --remote …`
   procedure. **App-server does not require replacing the Codex terminal.** Revision 2 claimed the
   opposite; that claim is withdrawn. Revision 4 changes only the *word*: this is a **documented**
   topology, not an *officially supported* one — the transport is documented as experimental and
   unsupported for production.
3. **§ 6.A5 / § 10.2.1 — the U5 split, and it cuts both ways.** **U5a** — `thread/loaded/list` +
   `thread/read` polling with runtime status in the response — is **documented**; check that the record
   nowhere calls it unverified or undocumented, and that approval-routing uncertainty is not attached to
   it. **U5b** — passive push subscription and approval-request routing — is **undocumented**; check that
   the record nowhere converts that into "cannot", and that U5b is not given U5a's official citation.
4. **§ 7.5 — installed-version drift.** The subsystem needs per-provider capability detection and a
   visible *unknown* state, because a hook that never fires produces no error — it produces a pane that
   silently stops updating. **Note:** revision 1's supporting claim that Codex's `SessionEnd` was absent
   from the installed binary is **withdrawn** (§ A2); this section was rebuilt on the installed feature
   table and the `stable`/`experimental`/`removed` staging model instead.
5. **§ 7.1 — providers are not equivalent, but none holds an exclusive capability.** All four evaluated
   interfaces distinguish *some* awaiting-input condition from completion; Codex's app-server expresses
   both `waitingOnUserInput` and `waitingOnApproval` as explicit state flags. What is distinctive about
   Claude Code is narrower: among the three **hook** systems it appears uniquely documented for both
   idle-prompt and permission-prompt distinctions. Any cross-provider indicator will still be honest but
   **asymmetric** — in shape and cost, not capability.
6. **§ 8.1 — the constraint set.** Threats 1+2 rule out in-band signalling as authoritative; 4+9 rule
   out handing a reporter conversation content; 5+6 rule out treating one turn-end event as "finished".
   Two unrelated OSS projects (`wmux`, `tmux-agent-status`) independently converged on the same
   decomposition, which is corroboration rather than proof.
7. **§ 6.B3 — the one genuinely off-the-shelf component.** The official MIT `@xterm/addon-progress`
   parses `OSC 9;4`, with state 3 = indeterminate. OSC 9;4 is **documented for Claude Code**; whether
   Codex or Gemini emit it is **unverified, not disproven**. Use it as corroboration only — an allowed
   `terminalSequence` hook output can forge it (threat 1).
8. **§ 6.E — no third-party project is adoptable.** `claude-squad` is AGPL-3.0; `amux` is
   NOASSERTION/Commons Clause; `tmux-agent-status` has **no licence file** despite an open-source-looking
   README; `wmux` (MIT, Windows-native, closest architectural match) is a competing application, not a
   library.
9. **Two corrections made to sweep findings**, recorded in § 6.E so they are not carried forward wrongly:
   `anthropics/claude-code` issues **#56936** (Windows 11 Notification hook) and **#8320** (60-second
   idle notification) are **CLOSED**, not open. They are retained as *historical* Windows-specific
   reliability defects in the exact mechanism this subsystem would rely on.

## 6.1 Did the recommendation change? — **No new evaluation was run; the headline stands and its stated reasons are corrected**

Revision 4 conducted **no new candidate evaluation**. The recommendation was updated only as far as the
corrected topology set and the U5 split require.

**Unchanged headline:** consume the **official provider hook systems** as the primary signal source and
**build the subsystem as owned code**.

**Changed in revision 3 and retained:**

* **Withdrawn:** "an app-server client cannot observe a PTY session, therefore it replaces the terminal,
  therefore hooks win **decisively**." The premise was false and the word *decisively* is gone.
* **Established instead:** `codex app-server --listen …` + `codex --remote …` is an **officially
  documented topology in which the pane keeps the real Codex TUI**. App-server is a live upgrade path,
  not an all-or-nothing UX replacement.

**Changed in revision 4 — the reasons, not the conclusion:**

* **The hooks-first case no longer leans on the deleted hybrid.** It rests on **cost** (zero
  dependencies), **provider coverage** (all three, versus Codex-only), **transport stability** (`hooks`
  reported `stable` on the installed Codex, versus an `[experimental]` app-server on a WebSocket
  transport documented as unsupported for production), **security surface** (one event payload, versus a
  protocol that can also write files, spawn processes, mutate threads and drive login, scoped read-only
  only by discipline), **the freshness tradeoff polling imposes**, and **the absence of U5b evidence**.
* **Blue's options are three, and two of them are mutually exclusive** (§ 10.2): **A** hooks on today's
  PTY pane; **B** Blue Helm drives and renders a native Codex surface; **C** the real remote TUI drives
  and Blue Helm observes. B is a product decision, not a status decision.
* **"App-server observation is unverified" is now too strong and has been narrowed.** Polling
  observation is documented; push observation is not.

**The two open questions, separated:**

* **U5a — documented, unmeasured.** `thread/loaded/list` + `thread/read` return a thread's runtime status
  without resuming or driving it. What is open is cadence, per-poll cost, displayed staleness,
  reconnection, and idle-unload behaviour. **Not** an existence question, and **not** an approval-routing
  question — a reader sees `active` + `waitingOnApproval` without receiving approval requests.
* **U5b — undocumented.** Whether push (`thread/status/changed`) is obtainable for a TUI-driven thread
  **without** `thread/resume`, and where approval requests route when a TUI and an observer are both
  connected. Plausible — subscription is per-connection (`notSubscribed` is a distinct status) and the
  docs reference a "last subscriber" plus a no-subscriber unload grace period — but the `ClientRequest`
  closed enumeration contains **no `thread/subscribe`**, and `ThreadResumeParams` is a configuring call
  with no read-only flag. **UNVERIFIED, not "impossible"** — that inversion is exactly what failed twice.

**How they affect the recommendation** (§ 10.2.1): if **U5b** resolves positive, topology C likely
becomes the recommended Codex source with the TUI untouched; if negative, hooks stand for Codex **with
C-poll still available as a documented secondary source**. Independently, U5a's production suitability
stays open until measured. The Codex half of the recommendation is provisional on that basis.

**Amendment 1 — provider-specific, not lowest-common-denominator** (§ 10.4), unchanged.

**Amendment 2 — the asymmetry is unevenness, not exclusivity** (§ 7.1), unchanged.

**Flip conditions** (§ 10.3), two, with a partial third: **(1)** U5b resolves positive — the near
condition, answerable by a bounded experiment; **(1a)** a weaker partial flip if C-poll is *measured* and
proves cheap and fresh enough, which needs no U5b answer at all; **(2)** Blue wants a native Codex
surface, headless mode, remote control, or an in-app approval UI — that is topology B.

## 6.2 Installed-version evidence added in revision 2

Verified locally, **without launching any model turn**:

| Check | Result |
| --- | --- |
| `codex --version` | `codex-cli 0.142.3` — matches the expected version |
| `codex features list` | **`hooks stable true`** — a T2 capability statement replacing revision 1's T3 token counting. Also shows a staging model with **`removed`** entries, i.e. capabilities are withdrawn as well as added |
| `codex app-server --help` | Subcommands `daemon`, `proxy`, `generate-ts`, `generate-json-schema`; transports `stdio://`, `unix://`, `ws://`, `off`; analytics **disabled by default** |
| `codex app-server generate-json-schema --out <unique temp> --experimental` | **335 schema files**, inspected then deleted |
| `thread/status/changed` | `ThreadStatus` = `notLoaded` / `idle` / `systemError` / `active` + `activeFlags: waitingOnApproval \| waitingOnUserInput` |
| `turn/started`, `turn/completed` | Both present as notifications |
| Approval requests | `item/commandExecution/requestApproval`, `item/fileChange/requestApproval`, `item/permissions/requestApproval`, plus `item/tool/requestUserInput` and `mcpServer/elicitation/request` |
| `openai/codex` repo | Apache-2.0, 105,113 stars, pushed 2026-08-10, not archived |

> **SUPERSEDED ROW — removed in revision 3.** This table previously ended with *"`codex --help` daemon
> coupling — No flag to attach the interactive TUI to a daemon."* **That was false** and is withdrawn;
> see § 6.3. It is noted here rather than deleted silently, because it is the claim the revision-2 review
> failed the record on.

## 6.3 Installed-version evidence added in revision 3

Reproduced through the explicit npm wrapper `C:\Users\levij\AppData\Roaming\npm\codex.cmd` so executable
selection is unambiguous. **No model turn, server, daemon, remote session, or TUI was launched.**

| Check | Result |
| --- | --- |
| `--version` | `codex-cli 0.142.3` |
| Top-level `--help` | **134 lines**, read in full — not filtered. Revision 2 grepped it for `app-server\|daemon`; the flag's description says *"remote **app server** endpoint"* (unhyphenated), so the pattern never matched |
| `--remote <ADDR>` | *"Connect the TUI to a remote app server endpoint."* Accepted forms: `ws://host:port`, `wss://host:port`, `unix://`, `unix://PATH` |
| `--remote-auth-token-env <ENV_VAR>` | *"Name of the environment variable containing the bearer token to send to a remote app server websocket"* — takes a variable **name**, not a secret |
| Is `--remote` qualified? | **No `[experimental]` marker** — it sits in the top-level `OPTIONS` block. By contrast the `app-server` and `remote-control` **subcommands** are both labelled `[experimental]` |
| `app-server --listen <URL>` | `stdio://` (default), `unix://`, `unix://PATH`, `ws://IP:PORT`, `off` |
| `--ws-auth <MODE>` | *"Websocket auth mode for **non-loopback** listeners"* — `[possible values: capability-token, signed-bearer-token]` |
| Other WS auth flags | `--ws-token-file <PATH>`, `--ws-token-sha256 <HEX>`, `--ws-shared-secret-file <PATH>`, `--ws-issuer`, `--ws-audience`, `--ws-max-clock-skew-seconds` — server-side secrets are taken **by file path**, never by env var |
| Loopback vs non-loopback distinguished? | **Yes**, by the tool itself — auth flags are scoped to non-loopback listeners |
| `remote-control` | `[experimental]`; subcommands `start`, `stop`; options are config/feature/`--json` only |
| Official topology | `codex app-server --listen ws://127.0.0.1:4500` then `codex --remote ws://127.0.0.1:4500` — *"Connect the CLI terminal UI"*, learn.chatgpt.com/docs/app-server |
| Documented transport status | WebSocket is **experimental and unsupported for production workloads**; `ws://` only for localhost or SSH-forwarded; **non-loopback listeners currently allow unauthenticated connections by default during rollout** |
| `thread/*` client methods | Enumerated from the `ClientRequest` discriminated union — a **closed enumeration**, not a grep. Contains `thread/unsubscribe` but **no `thread/subscribe`** |
| `ThreadUnsubscribeStatus` | `notLoaded` / `notSubscribed` / `unsubscribed` — subscription is tracked **per connection** |
| `ThreadReadParams` | `threadId`, optional `includeTurns`; documented to read **without resuming** or emitting `thread/started` |
| `ThreadResumeParams` | Carries `approvalPolicy`, `approvalsReviewer`, `sandbox`, `permissions`, `model`, `modelProvider`, `config`, `cwd` … — a **configuring** call, with no read-only/observe flag |
| Approval routing to one or many clients | **Not documented** — recorded as unverified |

**Token handling.** Server-side secrets are files; only the client names an environment variable. Blue
Helm already injects per-PTY environment from `safeStorage` at spawn time, so a token could reach exactly
one PTY without ever becoming a persistent Windows user variable. **`setx` is not used and must not be**,
per `AGENTS.md`.

**Temporary-directory handling.** A second schema bundle was generated into a fresh GUID-suffixed
directory, inspected, and removed only after verifying the path matched that unique pattern; a follow-up
scan of `%TEMP%` for `codex-appserver-schema-*` returns **0**.

**Temporary-directory handling.** The schema bundle was written to a GUID-suffixed unique directory
under `%TEMP%`, inspected, and then removed **only after verifying the path matched that unique
pattern** — the removal was guarded by an explicit pattern check rather than issued blind.

## 7. Known limitations of this evaluation

**No T4 (runtime-observed) evidence exists anywhere in this record, in any revision.** The record carries
a consolidated unverified list at **§ 11.2**, now with eight numbered items after revision 4 split U5
into **U5a** and **U5b** (U1, U2, U3, U4, U5a, U5b, U6, U7); the summary:

* **U1 — whether Codex 0.142.3 emits `SessionEnd` at runtime.** Revision 1 claimed it did not; that
  claim is **withdrawn**. Documented (T1), zero token hits (T3), no installed hook-event schema found,
  so it is simply **unknown**.
* **U2 — whether Codex or Gemini ever emit `OSC 9;4`.** Revision 1 claimed "verified" absence; that is
  **withdrawn**. No documented support was found and no token was found; neither establishes incapacity.
* **U3 — whether installed Claude Code actually emits `OSC 9;4`.** Strong T1+T3 evidence, still not
  observed.
* **U4 — whether Claude Code's `Notification` hook fires reliably on this Windows 11 build.** Issues
  #56936 and #8320 are **closed**, but both were real defects in exactly this mechanism.
* **U5a (split out in revision 4) — polling is documented; only its runtime characteristics are open.**
  `thread/loaded/list` lists loaded threads, `thread/read` reads one **without resuming it**, and the
  returned thread object carries runtime status. Revision 3 filed this under "unverified" alongside U5b;
  that was wrong and is corrected. What is genuinely unmeasured: polling cadence, per-poll cost,
  displayed staleness, reconnection behaviour, and what a poller sees when the server unloads an idle
  thread. **Documented but unmeasured — not undocumented.**
* **U5b (split out in revision 4) — passive push and approval routing.** Not whether app-server can
  attach a TUI at all: it can, and the topology is documented. The open question is whether a *second*
  Blue Helm client can acquire `thread/status/changed` **push** for a TUI-driven thread **without**
  `thread/resume`, whether `thread/resume` from that client takes over or duplicates the thread, and
  **who receives approval requests when more than one client is connected**. Undocumented.
  **Unverified, not impossible.**
* **U6 — hook latency, and whether Gemini's synchronous in-loop hooks stall the agent.**
* **U7 — whether a reporter can be reduced to metadata only in practice.**

Other limitations, unchanged from revision 1:

* **Codex's hooks are not documented in the `openai/codex` repository `docs/` tree** (verified via the
  GitHub contents API — no `hooks.md`). The event list came from `learn.chatgpt.com/docs/hooks.md`,
  OpenAI's own documentation site, cross-checked against the installed binary.
* **One single-source claim was deliberately excluded**: a third-party assertion that Claude Code emits
  `OSC 133` at turn boundaries could not be corroborated against Anthropic documentation, so the record
  does not rely on it.
* **`wmux` was assessed from metadata and description only**, not by reading its source. If Blue wants
  its per-provider adapter design mined, that is a separate authorized task.
* Gemini's `notification_type` values beyond `"ToolPermission"` are not documented; the record says so
  rather than guessing.
* **The app-server card is schema-level, not behavioural.** Every A5 claim comes from the generated
  schema (T2). No app-server was started and no thread was created.

## 8. Commands run and review artifact

Commands: `git worktree add`, `git status`, `git diff --check`, `git add`, `git commit`,
`git diff --output`; `gh api` for repository metadata; `npm view <pkg> --json` for registry metadata;
`claude/codex/gemini --version`; offline `rg -a` / PowerShell string scans of already-installed files.
**Revision 2 added:** `codex --help` (and four subcommand helps), `codex features list`, and
`codex app-server generate-json-schema --out <unique temp dir> --experimental` followed by a
pattern-guarded delete of that directory.

**Revision 4 added no research commands at all** — only `git` (verification, `diff --check`, `add`,
`commit`, `diff --output`) and hashing of the two new artifacts. It is a documentation correction: no
provider binary was run, no schema regenerated, no source re-fetched.

**No live or paid model turn was launched in any revision.**

No test suite was run: this branch changes no code, so the app and Pester gates are unaffected and
would prove nothing about it. The tracked-file change set is two Markdown documents.

### Revision 1 artifact — retained as superseded evidence, not overwritten

| Field | Value |
| --- | --- |
| Reviewed tip (FAILED) | `10d80b2c36e956ba7548ca49f6a3652ebef31006` |
| Range | `7a102a2498cb48fdc168e20503741509c5daefd3...10d80b2c36e956ba7548ca49f6a3652ebef31006` |
| Pinned artifact | `.agent-review-pane-status-source-scout.diff` |
| Size / SHA-256 | **72,232 bytes** · `e5a6ae48dc2e1e0640be1aded2028784bb0abd1ebf396040a9411b69ae7f48c7` |
| Verdict | `VERDICT: FAIL` |

That file keeps its original name and is **not** regenerated or overwritten by revision 2, so the
evidence the failed review actually read remains intact on disk. The revision-2 artifacts use distinct
names.

### Revision 2 artifacts

| Field | Value |
| --- | --- |
| Reviewed base (cumulative) | `7a102a2498cb48fdc168e20503741509c5daefd3` |
| Previous handoff tail (corrective base) | `849cf7c4960f339a0fab1f436eae0cea4d2c8952` |
| **Revision-2 reviewed tip** | `0532772d2a78fa36ee591173bef442731fd8590f` |
| Revision-2 tail | `9f6490be3f57596293103a940ac25e10039b5822` |
| Changed paths | `docs/OSS-PROCUREMENT-pane-status.md`, `docs/BUILDER-HANDOFF-pane-status-source-scout.md` |

**Corrective artifact — the focused delta a corrective reviewer should read**

| Field | Value |
| --- | --- |
| Range | `849cf7c4960f339a0fab1f436eae0cea4d2c8952...0532772d2a78fa36ee591173bef442731fd8590f` |
| File | `.agent-review-pane-status-source-scout-corrections.diff` |
| Shortstat | 2 files, **652 insertions, 96 deletions** |
| Size | **74,833 bytes** |
| SHA-256 | `c5535e67af0a53bf04131a066dfe0b379d44bcc228956e34d8d7118177195b67` |

**Cumulative artifact — the whole branch from `main`**

| Field | Value |
| --- | --- |
| Range | `7a102a2498cb48fdc168e20503741509c5daefd3...0532772d2a78fa36ee591173bef442731fd8590f` |
| File | `.agent-review-pane-status-source-scout-r2-cumulative.diff` |
| Shortstat | 2 files, **1,523 insertions, 0 deletions** (both files are additions relative to `main`) |
| Size | **115,175 bytes** |
| SHA-256 | `805639df3349df17d2a31b881d4f709f7390093b3b9e2ba481e3628718213f5b` |

Both were created with `git diff --output` (never PowerShell redirection), both are gitignored, and
both were independently regenerated from their stated ranges and matched in exact byte count and
SHA-256. `git diff --check` is clean on both ranges. The three artifact names are distinct, so the
revision-1 evidence at `.agent-review-pane-status-source-scout.diff` was neither regenerated nor
overwritten — re-hashed after revision 2 and confirmed still **72,232 bytes /
`e5a6ae48dc2e1e0640be1aded2028784bb0abd1ebf396040a9411b69ae7f48c7`**.

Both changed paths are Markdown. No dependency, lockfile, script, test, or runtime file changed, so the
app and Pester gates are untouched by this branch.

### Revision 3 artifacts

| Field | Value |
| --- | --- |
| Reviewed base (cumulative) | `7a102a2498cb48fdc168e20503741509c5daefd3` |
| Revision-2 tail (focused base) | `9f6490be3f57596293103a940ac25e10039b5822` |
| **Revision-3 reviewed tip** | `63b7d71f205c60e5a8102e35ade320f2adca5995` |
| Branch tip | this handoff-only tail commit |
| Changed paths | `docs/OSS-PROCUREMENT-pane-status.md`, `docs/BUILDER-HANDOFF-pane-status-source-scout.md` |

**Focused revision-3 artifact**

| Field | Value |
| --- | --- |
| Range | `9f6490be3f57596293103a940ac25e10039b5822...63b7d71f205c60e5a8102e35ade320f2adca5995` |
| File | `.agent-review-pane-status-source-scout-r3-corrections.diff` |
| Shortstat | 2 files, **437 insertions, 147 deletions** |
| Size | **70,020 bytes** |
| SHA-256 | `30166d21208f3b8831965f1bd0b5bfe8699fc6df18248a90ac02cc725786f910` |

**Cumulative revision-3 artifact**

| Field | Value |
| --- | --- |
| Range | `7a102a2498cb48fdc168e20503741509c5daefd3...63b7d71f205c60e5a8102e35ade320f2adca5995` |
| File | `.agent-review-pane-status-source-scout-r3-cumulative.diff` |
| Shortstat | 2 files, **1,831 insertions, 0 deletions** (both files are additions relative to `main`) |
| Size | **142,584 bytes** |
| SHA-256 | `a4f8034fa364d8d364b38ad0ea3355d6292256f159233155d20610559fe93ced` |

Both created with `git diff --output` (never PowerShell redirection), both gitignored, both independently
regenerated from their stated ranges and matched in exact byte count and SHA-256. `git diff --check` is
clean on both ranges.

**All three earlier artifacts were re-hashed after revision 3 and are unchanged**, so no prior review's
evidence was overwritten:

| File | Bytes | SHA-256 |
| --- | ---: | --- |
| `.agent-review-pane-status-source-scout.diff` (r1) | 72,232 | `e5a6ae48dc2e1e0640be1aded2028784bb0abd1ebf396040a9411b69ae7f48c7` |
| `.agent-review-pane-status-source-scout-corrections.diff` (r2 focused) | 74,833 | `c5535e67af0a53bf04131a066dfe0b379d44bcc228956e34d8d7118177195b67` |
| `.agent-review-pane-status-source-scout-r2-cumulative.diff` (r2 cumulative) | 115,175 | `805639df3349df17d2a31b881d4f709f7390093b3b9e2ba481e3628718213f5b` |

### Revision 4 artifacts

| Field | Value |
| --- | --- |
| Reviewed base (cumulative) | `7a102a2498cb48fdc168e20503741509c5daefd3` |
| Revision-3 tail (focused base) | `3058621e7057f5258f8176258ec092bc556a2532` |
| **Revision-4 reviewed tip** | `555aee5db928a8be73b0e3cdb528019677f9ad4e` |
| Branch tip | this handoff-only tail commit |
| Changed paths | `docs/OSS-PROCUREMENT-pane-status.md`, `docs/BUILDER-HANDOFF-pane-status-source-scout.md` |

**Focused revision-4 artifact** — the delta a corrective reviewer should read

| Field | Value |
| --- | --- |
| Range | `3058621e7057f5258f8176258ec092bc556a2532...555aee5db928a8be73b0e3cdb528019677f9ad4e` |
| File | `.agent-review-pane-status-source-scout-r4-corrections.diff` |
| Shortstat | 2 files, **502 insertions, 219 deletions** |
| Size | **87,816 bytes** |
| SHA-256 | `78aae4bd1e438c9af26623b442e1795b1c8336733cc74003b444f2db08b5310f` |

**Cumulative revision-4 artifact** — the whole branch from `main`

| Field | Value |
| --- | --- |
| Range | `7a102a2498cb48fdc168e20503741509c5daefd3...555aee5db928a8be73b0e3cdb528019677f9ad4e` |
| File | `.agent-review-pane-status-source-scout-r4-cumulative.diff` |
| Shortstat | 2 files, **2,159 insertions, 0 deletions** (both files are additions relative to `main`) |
| Size | **170,070 bytes** |
| SHA-256 | `fb106664cebafceae894ed84ce7477909139bc83fa8357a5e25c6f000b1284aa` |

Both created with `git diff --output` (never PowerShell redirection), both gitignored, both independently
regenerated from their stated ranges and matched in exact byte count and SHA-256. `git diff --check` is
clean on both ranges. The revision-4 artifact names are new, so **no earlier review's evidence file is
regenerated or overwritten**. Per the revision-4 work order, the revision-1, -2 and -3 artifacts were
**not** re-hashed this round; their recorded identities above stand from revision 3's verification.

> The exact SHAs, byte counts and hashes cannot appear in the content commit that they describe — the
> commit does not yet exist when its own diff is generated. They are recorded in **this handoff-only
> tail commit**, which is excluded from both ranges and modifies only this document.

**Regeneration note.** Both artifacts were regenerated from their stated ranges into a distinct
`.agent-review-r4-regen-*.diff` pair **inside the worktree**, compared, and found identical in byte count
and SHA-256; the two regeneration files were then removed behind an explicit filename-pattern guard. The
first regeneration attempt wrote to a scratch directory on another drive, which `git diff --output`
rejected — it produced empty files rather than a valid comparison. That attempt was discarded and redone,
rather than reported as a mismatch.

### Verdict-finalization artifacts

| Field | Value |
| --- | --- |
| Reviewed base (cumulative) | `7a102a2498cb48fdc168e20503741509c5daefd3` |
| Revision-4 tail (focused base) | `6d40c31f1d357af7ab1ce49b551cd9136899bb1d` |
| **Verdict-finalization reviewed tip** | `ca884297c7b34d0d4b29ac24bf9792e654f5b344` |
| Branch tip | this handoff-only tail commit |
| Changed paths | `docs/OSS-PROCUREMENT-pane-status.md`, `docs/BUILDER-HANDOFF-pane-status-source-scout.md`, `BLUE-HELM-MASTER-STATUS.md` |

**Focused verdict-finalization artifact** — the delta a reviewer should read

| Field | Value |
| --- | --- |
| Range | `6d40c31f1d357af7ab1ce49b551cd9136899bb1d...ca884297c7b34d0d4b29ac24bf9792e654f5b344` |
| File | `.agent-review-pane-status-source-scout-verdict-corrections.diff` |
| Shortstat | 3 files, **334 insertions, 77 deletions** |
| Size | **38,871 bytes** |
| SHA-256 | `b47b333dbd6539759aef8cc497ebf33c83acd0e8ed9a33291c276db44a329b9f` |

**Cumulative verdict-finalization artifact** — the whole branch from `main`

| Field | Value |
| --- | --- |
| Range | `7a102a2498cb48fdc168e20503741509c5daefd3...ca884297c7b34d0d4b29ac24bf9792e654f5b344` |
| File | `.agent-review-pane-status-source-scout-verdict-cumulative.diff` |
| Shortstat | 3 files, **2,447 insertions, 20 deletions** |
| Size | **192,102 bytes** |
| SHA-256 | `ce273cc520bd8ab77c17c9c046ae5613f0f91077c80080f64b5147fb16e2aec8` |

Both created with `git diff --output` (never PowerShell redirection), both gitignored, both independently
regenerated from their stated ranges and matched in exact byte count and SHA-256. `git diff --check` is
clean on both ranges. The names are new, so **no earlier review's evidence file is regenerated or
overwritten**; per the work order the revision-1 through revision-4 artifacts were **not** re-hashed or
regenerated this round, and their recorded identities above stand from their own verification rounds.

> The exact SHAs, byte counts and hashes cannot appear in the content commit that they describe — the
> commit does not yet exist when its own diff is generated. They are recorded in **this handoff-only
> tail commit**, which is excluded from both ranges and modifies only this document.

**Note on the cumulative range.** It now spans **three** files rather than two, because
`BLUE-HELM-MASTER-STATUS.md` is modified by the verdict-finalization commit. That file is a
**modification** to an existing tracked document, not an addition, so the cumulative shortstat carries
deletions for the first time on this branch — **20**, all of them in `BLUE-HELM-MASTER-STATUS.md`. The
two branch documents remain pure additions relative to `main`.

**Regeneration note.** Both artifacts were regenerated from their stated ranges into a distinct
`.agent-review-verdict-regen-*.diff` pair **inside the worktree**, compared, found identical in byte
count and SHA-256, and then removed behind an explicit filename-pattern guard. Regenerating into a
directory on another drive does not work — `git diff --output` produces an empty file and errors — so
the comparison is always done inside the worktree.

### A deliberate non-change, flagged for the reviewer

**RESOLVED at verdict finalization.** Through revisions 1–4 this entry recorded that the closing
placeholder was kept without a trailing period —
`BLUE SUBSYSTEM VERDICT: NOT YET ISSUED — IMPLEMENTATION REMAINS UNAUTHORIZED` — because the corrective
work orders rendered it with one, and altering the pinned string could have broken a later check. That
placeholder no longer exists: the verdict-finalization work order directed its replacement, and the
record now ends with the canonical line `BLUE SUBSYSTEM VERDICT: PROTOTYPE`, rendered exactly as the
work order specifies and with no trailing period. The old concern is closed, and the reasoning is
retained so a reviewer can see why the string was previously frozen.

**A second deliberate non-change, new in revision 4.** § 6.3 of this handoff contains **two
near-duplicate "Temporary-directory handling" paragraphs**, left over from revision 3. That is a cosmetic
defect, it is not one of the two accepted revision-3 findings, and the revision-4 work order authorizes
changes only where they are needed for coherence with those findings. It is therefore left in place and
flagged here rather than fixed by widening scope on my own authority. A reviewer may direct its removal.

## 9. Reviewer verdicts

**Revision 1:** `VERDICT: FAIL` — independent Standard-class review of reviewed tip
`10d80b2c36e956ba7548ca49f6a3652ebef31006`. Four findings, dispositioned in § 0.1. Preserved as
superseded review history.

**Revision 2:** `VERDICT: FAIL` — independent Standard-class review of reviewed tip
`0532772d2a78fa36ee591173bef442731fd8590f`. Two findings, dispositioned in § 0.2. Preserved as
superseded review history.

**Revision 3:** `VERDICT: FAIL` — independent Standard-class review of reviewed tip
`63b7d71f205c60e5a8102e35ade320f2adca5995`. Two findings, dispositioned in § 0.3. Preserved as
superseded review history.

**Revision 4:** `VERDICT: PASS` — independent Standard-class review of reviewed tip
`555aee5db928a8be73b0e3cdb528019677f9ad4e`. This is the first PASS on this branch and the review that
made the verdict possible. Retained verbatim as the literal verdict line, not a paraphrase.

**Verdict finalization:** **none yet** — stopped for a fresh independent Standard-class
verdict-finalization review.

**Blue's subsystem verdict** is a separate thing from a Reviewer verdict, and both are recorded:
Reviewer verdicts are `VERDICT: PASS|FAIL` on a diff; Blue's is
`BLUE SUBSYSTEM VERDICT: PROTOTYPE` on the subsystem, recorded in § 12 of
`docs/OSS-PROCUREMENT-pane-status.md` per `AGENTS.md` item 6.

## 9.1 Verification performed before stopping

| Check | Result |
| --- | --- |
| Worktree and branch | `.worktrees/pane-status-source-scout` on `feature/pane-status-source-scout` |
| Expected ancestry | `7a102a24`, `10d80b2c`, `849cf7c4`, `0532772d`, `9f6490be`, `63b7d71f`, `3058621e`, `555aee5d`, `6d40c31f` all confirmed ancestors of the branch tip |
| Starting tip matched the work order | `6d40c31f1d357af7ab1ce49b551cd9136899bb1d`, verified before any edit |
| Revision-4 review result recorded | `VERDICT: PASS` at reviewed tip `555aee5db928a8be73b0e3cdb528019677f9ad4e` |
| Tracked state | clean |
| Tracked files changed in the verdict-finalization content commit | **exactly three, all Markdown** — the two branch documents plus `BLUE-HELM-MASTER-STATUS.md` |
| Handoff-only tail | touches **only** `docs/BUILDER-HANDOFF-pane-status-source-scout.md` |
| Application / config changes | none |
| `git diff --check` | clean on the verdict-finalization focused and cumulative ranges |
| Artifact reproduction | both new verdict-finalization artifacts regenerated byte-identically |
| `main` / `origin/main` | unchanged at `7a102a2498cb48fdc168e20503741509c5daefd3` |
| Merge or push | none |
| Electron / provider processes left running **by this work** | **none.** No Electron instance and no provider session was started. Stated precisely rather than as a bare "zero processes": a process check found running `claude.exe` instances belonging to the VS Code extension hosting this session, and one `codex.exe` from the pre-existing Codex **desktop app** under `WindowsApps` — a different install from the npm CLI inspected here. Neither originates from this work order. Every Codex command run (`--version`, `--help` ×5, `features list`, `generate-json-schema`) exits immediately and left nothing resident |
| **App-server, daemon, remote TUI, or remote session launched** | **none.** Revision 3 established the `--remote` topology entirely from `--help` output and official documentation, and **revision 4 ran no provider command at all.** No listener was started, no `--remote` connection was made, and no thread was created. Settling U5b would require exactly that, which is why it is assigned to the unauthorized § 11.1 Experiment B |
| **New research, capability rediscovery, or schema generation** | **none in revision 4 or at verdict finalization.** Both are documentation-only. No provider binary was invoked, no schema was regenerated, no source was re-fetched, and the procurement research was not reopened |
| Temporary artifacts | both generated schema directories were deleted behind a unique-pattern guard during revision 3; revision 4 and verdict finalization created none |
| Prior review artifacts | **Not re-hashed or regenerated at verdict finalization** — the work order directs it, and the new artifacts use distinct verdict-finalization names so none could be overwritten |
| Live model turn | none launched |
| **Blue verdict** | **not invented — quoted.** `BLUE SUBSYSTEM VERDICT: PROTOTYPE` is Blue's own decision, issued from the verbatim human statement *"lets continue with prototype"* recorded in § 12.1 of the record. No verdict term was chosen, inferred, or implied on Blue's behalf, and the record now **ends** with that canonical line |
| **Hook installation** | **none.** No hook was written to `~/.claude/settings.json`, `~/.codex/`, `~/.gemini/settings.json`, or any other provider configuration. Experiment A is authorized but has not begun |
| Prototype or implementation | **none exists.** Verdict finalization is a documentation act; the prototype belongs to a later branch under its own work order |
| Blue verdict | none invented; placeholder retained verbatim |

## Review-diff rule

- Before merge, use `git diff main...<tip>`.
- After merge, reproduce the reviewed delta with `git diff <recorded-pre-merge-main>...<tip>`.
- `git diff main...<tip>` may be empty after merge because the branch tip is already an ancestor of
  `main`.
- Always use `--output`; do not use PowerShell `>` for pinned review diffs.
- Retain the literal `VERDICT: PASS|FAIL` line and identify the review that produced it. A paraphrase or
  implied verdict is not a merge-gate verdict.

Pinned `.agent-review-*.diff` files are local review artifacts and must remain gitignored.

---

**Authorized and not yet started:** bounded prototype work, beginning with **Experiment A** (§ 11.1 of
the procurement record), under a separate work order that selects the provider and specifies the
prototype.

**Not authorized:** production specification, architecture commitment, production implementation,
merge, and push — and **Experiment B**, together with all app-server runtime testing, unless Blue
separately expands the prototype scope.

**Not started, on this branch or anywhere:** any prototype, hook installation, provider command, schema
generation, app-server, remote TUI, or model session.

> **SUPERSEDED — retained as historical provenance.** Through revision 4 this closing block read: *"Not
> authorized and not started: pane-status specification, architecture commitment, dependency
> installation, prototyping, implementation, merge, and push. The bounded experiment described in § 11.1
> of the procurement record is **described only** and requires an explicit later `PROTOTYPE` verdict from
> Blue before any part of it may be built."* followed by
> `BLUE SUBSYSTEM VERDICT: NOT YET ISSUED — IMPLEMENTATION REMAINS UNAUTHORIZED`. That verdict now
> exists, so both statements are **stale, not reinterpreted**.

**BLUE SUBSYSTEM VERDICT: PROTOTYPE**
