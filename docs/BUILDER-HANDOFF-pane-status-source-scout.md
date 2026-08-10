# Builder Handoff — Pane-Status OSS Procurement Evaluation

Branch: `feature/pane-status-source-scout`
Worktree: `.worktrees/pane-status-source-scout`
Fork-point SHA: `7a102a2498cb48fdc168e20503741509c5daefd3`
Pre-merge main SHA: `7a102a2498cb48fdc168e20503741509c5daefd3`
Documentation reviewed tip: see § 8
Branch tip: see § 8
Merge commit SHA: Pending until merge

**Status: REVISION 2 — CORRECTED AFTER `VERDICT: FAIL`; NO BLUE VERDICT EXISTS; IMPLEMENTATION REMAINS
UNAUTHORIZED**

## 0. Review history — revision 1 FAILED, and that is preserved

An independent Standard-class review of revision 1 (reviewed tip
`10d80b2c36e956ba7548ca49f6a3652ebef31006`) returned the literal line:

> VERDICT: FAIL

That verdict is **superseded review history, not erased or reinterpreted**. It was correct on all four
findings, and revision 2 exists only because of it. The failed reasoning is retained in place inside the
procurement record, each error marked as a correction at the point where it was made, so a later reader
can see what was wrong rather than only what replaced it.

### The four findings and their disposition

| # | Finding | Disposition in revision 2 |
| --- | --- | --- |
| 1 | The candidate set was incomplete — it evaluated hooks and terminal signals without carding the official **Codex app-server JSON-RPC interface**. | **Corrected.** New full candidate card § 6.A5 against all sixteen required criteria, a new comparison-matrix row **A5**, a new app-server column in the § 7.1 capability matrix, a new § 9.2 adopt-vs-build row, and a new Blue question (§ 11 Q7). All six required event families are documented from the installed schema. |
| 2 | Zero plaintext-token matches in a compiled binary were promoted into behavioural claims. | **Corrected.** New § 0.1 evidence tiers (T1 documented / T2 installed schema / T3 token presence / T4 runtime / T5 inference) with an explicit statement that **T3 absence proves nothing**. The Codex `SessionEnd` claim (§ A2) and the "Codex and Gemini do not emit OSC 9;4" claim (§ B3) are both **withdrawn** and restated with exactly what was searched, what was observed, and what it cannot establish. § 7.5 was rebuilt because it rested on the withdrawn claim. |
| 3 | Claude's `terminalSequence` was described as permitting **arbitrary** escape sequences, and the Windows position was stated wrongly. | **Corrected.** § A1 now quotes the documented allowlist verbatim (OSC 0/1/2/9/99/777 and bare BEL; anything else — including OSC 52 — is rejected and the field ignored) and the documented statement that it **works on Windows**. The narrower, sharper concern is retained: OSC `9` is allowlisted and `9;4` is named explicitly, so an in-band OSC 9;4 marker remains forgeable by an allowed hook output. Threat 1 was updated to match. |
| 4 | The cross-provider asymmetry claim was too strong. | **Corrected.** "Only Claude Code distinguishes awaiting input from finished" is **withdrawn** — it also contradicted revision 1's own matrix, which already scored Codex and Gemini "partial" on that row. § 7.1 now records that all four evaluated interfaces distinguish some awaiting-input condition from completion, that Codex's app-server expresses **both** `waitingOnUserInput` and `waitingOnApproval` as explicit state flags, and that what is genuinely distinctive about Claude Code is narrower: among the three **hook** systems it appears uniquely documented for both idle-prompt and permission-prompt distinctions. "Richest documented coverage" is now explicitly separated from "exclusive capability." |

### Correction that most changes the picture

Finding 1 was not a bookkeeping omission. The installed Codex app-server exposes
`thread/status/changed` carrying a `ThreadStatus` union of `notLoaded` / `idle` / `systemError` /
`active`, where `active` carries `activeFlags` of `waitingOnUserInput` or `waitingOnApproval` — a
**state model** rather than an event stream, bound to an explicit `threadId`, with approvals delivered
as JSON-RPC **requests** the client must answer. On status semantics alone it is the best interface in
the record, and revision 1 gave Blue no opportunity to weigh it.

## 1. Intended invariant

> Produce a primary-source-backed OSS procurement evaluation for cross-provider pane-status detection
> without changing, specifying, prototyping, or implementing the production subsystem.

Documentation-only, Standard-class. No runtime behaviour changed, because no runtime file changed.

## 2. Procurement record and authorization state

Tracked record created by this branch: **`docs/OSS-PROCUREMENT-pane-status.md`**.

There is **no Blue subsystem verdict to quote**, so none is quoted. The record carries the required
authorization-state placeholder verbatim:

> BLUE SUBSYSTEM VERDICT: NOT YET ISSUED — IMPLEMENTATION REMAINS UNAUTHORIZED

That is an authorization-state statement, not a sixth verdict term. The five allowed final subsystem
verdicts remain **ADOPT · FORK · PROTOTYPE · PATTERN-MINE · BUILD FRESH**. `REJECT` appears nowhere as a
final verdict; it is used only at the candidate-disposition level, which `AGENTS.md` defines as a
separate, lower level.

The binding state quoted from `BLUE-HELM-MASTER-STATUS.md`, verbatim:

> Cross-provider pane-status indicators still have no Blue verdict, so that separate subsystem remains
> unauthorized for specification or implementation.

**The Dockview ADOPT verdict was not reused.** `docs/OSS-PROCUREMENT-dockview.md` states the boundary
itself — "keep pane-status indicators separate" — and one record cannot cover two subsystems.

## 3. Files changed

Exactly two, both new, both Markdown:

| Path | Change |
| --- | --- |
| `docs/OSS-PROCUREMENT-pane-status.md` | **Added** — the tracked procurement record (12 required sections) |
| `docs/BUILDER-HANDOFF-pane-status-source-scout.md` | **Added** — this handoff |

`BLUE-HELM-MASTER-STATUS.md` was **deliberately not edited**, per the work order: the roadmap already
records the pending gate, and no verdict exists to record. No application code, test, dependency,
lockfile, script, GitHub configuration, `AGENTS.md`, or unrelated document was touched.

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
| Codex `SessionEnd` | **0 occurrences** while `SessionStart` = 45 — documented event absent from the installed version |
| `OSC 9;4` emission | **Claude only**: `claude.exe` `terminalProgressBarEnabled` ×21, `9;4` ×6; Codex **0**; Gemini **0** |
| `Get-Command wmic.exe` | **Not present** on this Windows 11 build — decisive for `ps-tree`, and it forces `pidtree` onto its PowerShell path |

Method caveat recorded in the record itself: string presence in a 308 MB binary is strong evidence for
distinctive tokens and weak evidence for common words. Counts for generic tokens (`Stop`,
`Notification`) are explicitly **not** cited as proof of event names.

## 6. Findings a reviewer should check first

1. **§ 7.5 — installed-version drift.** Codex's documented `SessionEnd` is absent from the installed
   0.142.3 binary. This is the strongest argument in the record that the subsystem needs per-provider
   capability detection and a visible *unknown* state, because a hook that never fires produces no
   error — it produces a pane that silently stops updating.
2. **§ 7.1 — providers are not equivalent.** Only Claude Code distinguishes *awaiting input* from
   *finished* (`Notification` matchers `idle_prompt` / `permission_prompt` versus `Stop`, plus a
   separate `StopFailure`). Codex and Gemini express tool-approval only. Generic PowerShell panes
   express nothing about intent. Any cross-provider indicator will be honest but **asymmetric**.
3. **§ 8.1 — the constraint set.** Threats 1+2 rule out in-band signalling as authoritative; 4+9 rule
   out handing a reporter conversation content; 5+6 rule out treating one turn-end event as "finished".
   Two unrelated OSS projects (`wmux`, `tmux-agent-status`) independently converged on the same
   decomposition, which is corroboration rather than proof.
4. **§ 6.B3 — the one genuinely off-the-shelf component.** Installed Claude Code emits `OSC 9;4`; the
   official MIT `@xterm/addon-progress` parses exactly that, with state 3 = indeterminate. Verified
   absent from Codex and Gemini, so it is a Claude-only signal.
5. **§ 6.E — no third-party project is adoptable.** `claude-squad` is AGPL-3.0; `amux` is
   NOASSERTION/Commons Clause; `tmux-agent-status` has **no licence file** despite an open-source-looking
   README; `wmux` (MIT, Windows-native, closest architectural match) is a competing application, not a
   library.
6. **Two corrections made to sweep findings**, recorded in § 6.E so they are not carried forward wrongly:
   `anthropics/claude-code` issues **#56936** (Windows 11 Notification hook) and **#8320** (60-second
   idle notification) are **CLOSED**, not open. They are retained as *historical* Windows-specific
   reliability defects in the exact mechanism this subsystem would rely on.

## 6.1 Did the recommendation change? — **It survived, with two substantive amendments**

Stated explicitly, as the corrective work order requires. The reasoning was re-run from the candidate
set upward with app-server included, not carried forward by default (§ 10.0 of the record).

**Survived:** consume the **official provider hook systems** as the primary signal source and **build
the subsystem as owned code**.

**Why app-server does not displace it — one decisive row** (full comparison at § 10.2): an app-server
client **cannot observe a session running in an existing PTY**. The installed schema documents loaded
threads as being "currently loaded in memory" per server process, and `codex --help` exposes no flag to
attach the interactive TUI to a daemon. So using app-server for status means **replacing** the Codex
pane's real terminal with a Blue-Helm-rendered JSON-RPC UI — a product decision far larger than pane
status, and one that would also put the client inside Codex's credential boundary
(`account/login`, token refresh) on an `[experimental]` protocol.

**Amendment 1 — provider-specific, not lowest-common-denominator** (§ 10.4). Revision 1 implicitly
sought one uniform mechanism; that is now recorded as the wrong target. Sources differ per provider
behind one owned normalisation, refusal, and display layer.

**Amendment 2 — the asymmetry is unevenness, not exclusivity** (§ 7.1), per finding 4.

**And the condition under which the answer flips is now on the record** (§ 10.3): if Blue ever wants a
native Codex surface, a headless/background mode, remote control, or an in-app approval UI, app-server
becomes the right foundation and this recommendation should be re-derived.

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
| `codex --help` daemon coupling | No flag to attach the interactive TUI to a daemon |
| `openai/codex` repo | Apache-2.0, 105,113 stars, pushed 2026-08-10, not archived |

**Temporary-directory handling.** The schema bundle was written to a GUID-suffixed unique directory
under `%TEMP%`, inspected, and then removed **only after verifying the path matched that unique
pattern** — the removal was guarded by an explicit pattern check rather than issued blind.

## 7. Known limitations of this evaluation

**No T4 (runtime-observed) evidence exists anywhere in this record, in either revision.** The record now
carries a consolidated unverified list at **§ 11.2** with seven numbered items (U1–U7); the summary:

* **U1 — whether Codex 0.142.3 emits `SessionEnd` at runtime.** Revision 1 claimed it did not; that
  claim is **withdrawn**. Documented (T1), zero token hits (T3), no installed hook-event schema found,
  so it is simply **unknown**.
* **U2 — whether Codex or Gemini ever emit `OSC 9;4`.** Revision 1 claimed "verified" absence; that is
  **withdrawn**. No documented support was found and no token was found; neither establishes incapacity.
* **U3 — whether installed Claude Code actually emits `OSC 9;4`.** Strong T1+T3 evidence, still not
  observed.
* **U4 — whether Claude Code's `Notification` hook fires reliably on this Windows 11 build.** Issues
  #56936 and #8320 are **closed**, but both were real defects in exactly this mechanism.
* **U5 — whether an app-server client can observe a PTY-hosted session.** Strong inference against;
  **not proven**. This is the one unverified item that could overturn § 10.2's deciding row.
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

**No live or paid model turn was launched in either revision.**

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
| Field | Value |
| --- | --- |
| Reviewed base (cumulative) | `7a102a2498cb48fdc168e20503741509c5daefd3` |
| Previous handoff tail (corrective base) | `849cf7c4960f339a0fab1f436eae0cea4d2c8952` |
| **Corrected reviewed tip** | recorded in the tail commit below |
| Branch tip | the handoff-only tail commit below |
| **Corrective range** | `849cf7c4960f339a0fab1f436eae0cea4d2c8952...<corrected reviewed tip>` |
| Corrective artifact | `.agent-review-pane-status-source-scout-corrections.diff` |
| **Cumulative range** | `7a102a2498cb48fdc168e20503741509c5daefd3...<corrected reviewed tip>` |
| Cumulative artifact | `.agent-review-pane-status-source-scout-r2-cumulative.diff` |
| Changed paths | `docs/OSS-PROCUREMENT-pane-status.md`, `docs/BUILDER-HANDOFF-pane-status-source-scout.md` |
| Sizes / SHA-256 / insertions | recorded in the tail commit |
| `git diff --check` | clean on both ranges |

These values are deliberately unfilled in the corrective content commit, because the artifacts are
generated *from* that commit and cannot be known before it exists. The tail commit fills them in and
modifies only this document.

Both changed paths are Markdown. No dependency, lockfile, script, test, or runtime file changed, so the
app and Pester gates are untouched by this branch.

### A deliberate non-change, flagged for the reviewer

The corrective work order renders the closing placeholder with a trailing period. The record keeps the
**existing** literal line without one —
`BLUE SUBSYSTEM VERDICT: NOT YET ISSUED — IMPLEMENTATION REMAINS UNAUTHORIZED` — because the work order
asks for "the existing literal state", and that exact string is what the original work order specified
and what revision 1 committed. Altering it could break any later check pinned to it. This is a
deliberate choice, not an oversight.

The artifact was created with `git diff --output` (never PowerShell redirection), remains gitignored
local review evidence, and was independently regenerated from the stated range — matching the pinned
file in both exact byte count and SHA-256 identity. This handoff-only tail commit is excluded from the
range, and it modifies only this document.

## 9. Reviewer verdicts

**Revision 1:** `VERDICT: FAIL` — independent Standard-class review of reviewed tip
`10d80b2c36e956ba7548ca49f6a3652ebef31006`. Four findings, all listed and dispositioned in § 0.
Preserved as superseded review history.

**Revision 2:** **none yet** — stopped for a fresh independent Standard-class corrective review.

## 9.1 Verification performed before stopping

| Check | Result |
| --- | --- |
| Worktree and branch | `.worktrees/pane-status-source-scout` on `feature/pane-status-source-scout` |
| Expected ancestry | `7a102a24`, `10d80b2c`, `849cf7c4` all confirmed ancestors of the branch tip |
| Tracked state | clean |
| Tracked files changed across the cumulative range | exactly two, both Markdown |
| Application / config changes | none |
| `git diff --check` | clean on corrective and cumulative ranges |
| Artifact reproduction | both regenerated byte-identically |
| `main` / `origin/main` | unchanged at `7a102a2498cb48fdc168e20503741509c5daefd3` |
| Merge or push | none |
| Electron / provider processes left running | none — nothing was launched |
| Live model turn | none launched |
| Prototype or implementation | none exists |
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

Not authorized and not started: pane-status specification, architecture commitment, dependency
installation, prototyping, implementation, merge, and push. The bounded experiment described in
§ 11.1 of the procurement record is **described only** and requires an explicit later `PROTOTYPE`
verdict from Blue before any part of it may be built.

**BLUE SUBSYSTEM VERDICT: NOT YET ISSUED — IMPLEMENTATION REMAINS UNAUTHORIZED**
