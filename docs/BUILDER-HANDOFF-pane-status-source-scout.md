# Builder Handoff — Pane-Status OSS Procurement Evaluation

Branch: `feature/pane-status-source-scout`
Worktree: `.worktrees/pane-status-source-scout`
Fork-point SHA: `7a102a2498cb48fdc168e20503741509c5daefd3`
Pre-merge main SHA: `7a102a2498cb48fdc168e20503741509c5daefd3`
Documentation reviewed tip: see § 8
Branch tip: see § 8
Merge commit SHA: Pending until merge

**Status: REVISION 3 — CORRECTED AFTER TWO `VERDICT: FAIL` REVIEWS; NO BLUE VERDICT EXISTS;
IMPLEMENTATION REMAINS UNAUTHORIZED**

## 0. Review history — revisions 1 and 2 both FAILED, and both are preserved

Two independent Standard-class reviews have been run on this branch. **Both returned the literal line:**

> VERDICT: FAIL

* **Revision 1** — reviewed tip `10d80b2c36e956ba7548ca49f6a3652ebef31006`. Four findings (§ 0.1).
* **Revision 2** — reviewed tip `0532772d2a78fa36ee591173bef442731fd8590f`. Two findings (§ 0.2).

Both verdicts are **superseded review history, not erased or reinterpreted**. Both were correct. The
failed reasoning is retained in place inside the procurement record, each error marked as a correction at
the point where it was made, so a later reader sees what was wrong and not only what replaced it.

### 0.0 One root cause behind both failures

Revision 1 turned a zero-hit **token scan** of a compiled binary into a negative fact. Revision 2 — while
correcting exactly that — turned a zero-hit **grep of `--help` output** into a negative fact. Same error,
different medium, committed twice.

The standing rule now recorded in § 0.1 of the procurement record: **a negative claim may never rest on a
search that could miss. It must rest on a closed enumeration or an explicit statement in a source.**
Revision 3 applies it — for example, the "no `thread/subscribe` method exists" finding is drawn from the
`ClientRequest` discriminated union, which is exhaustive by construction, and the `--remote` finding came
from reading all 134 lines of `--help` rather than filtering them.

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
| 1 | **The decisive app-server premise is false.** Revision 2 stated that installed Codex 0.142.3 offered no way to connect its real TUI to app-server, and concluded that adoption must replace the terminal interface. The reviewer reproduced `--remote <ADDR>` — *"Connect the TUI to a remote app server endpoint"* — accepting `ws://`, `wss://`, `unix://`, `unix://PATH`; `app-server --listen`; WebSocket auth flags `--ws-auth`, `--ws-token-file`, `--ws-token-sha256`; and the official *"Connect the CLI terminal UI"* procedure. | **Corrected.** § 6.A5 carries a withdrawal block naming the error and how it happened, the reproduced command surface, the official topology verbatim, and the surviving qualifications (WebSocket experimental/unsupported; loopback vs non-loopback; unauthenticated-by-default during rollout). § 10.2 was rebuilt as a **four-topology** comparison; § 10.2.1 states exactly how the remaining uncertainty affects the recommendation; § 10.3 now carries **two** flip conditions. The handoff's § 6.2 stale row is marked superseded and § 6.3 records the revision-3 evidence. |
| 2 | **Withdrawn claims remained as current facts** — the B3 comparison row said OSC 9;4 was "verified absent" from Codex and Gemini; the handoff still asserted Codex `SessionEnd` absence, Claude-only OSC 9;4, and that only Claude distinguishes awaiting-input from finished. | **Corrected.** A full sweep was run across both documents for thirteen phrase patterns (`verified absent`, `absent from the installed`, `do/does not emit`, `cannot emit`, `Claude only`, `Claude-only`, `Only Claude`, `no attach flag`, `no flag`, `cannot observe`, `replaces/replacing the Codex`, `replaces the terminal`). Every **current-voice** occurrence was corrected; historical ones survive only inside visibly-labelled withdrawal blocks. Repaired specifically: the B3 comparison row, the A5 comparison row, the handoff installed-evidence table, "Findings a reviewer should check first" (renumbered to eight entries and rewritten), the § 9.2 adopt-vs-build row, § 10.2/§ 10.2.1/§ 10.3, § 10.4's Codex row, and the U5 entry. The duplicate revision-2 artifact table header was also removed. |

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
| Codex `SessionEnd` token scan | **0 occurrences** while `SessionStart` = 45. **T3 observation only — this does NOT establish runtime absence** and the revision-1 claim that it did is withdrawn (§ A2). Runtime status: **unverified (U1)** |
| `OSC 9;4` token scan | `claude.exe` `terminalProgressBarEnabled` ×21, `9;4` ×6; Codex **0**; Gemini **0**. **T3 only.** OSC 9;4 is **documented for Claude Code**; whether Codex or Gemini emit it is **unverified (U2)**, not disproven |
| `Get-Command wmic.exe` | **Not present** on this Windows 11 build — decisive for `ps-tree`, and it forces `pidtree` onto its PowerShell path |

Method caveat recorded in the record itself: string presence in a 308 MB binary is strong evidence for
distinctive tokens and weak evidence for common words. Counts for generic tokens (`Stop`,
`Notification`) are explicitly **not** cited as proof of event names.

## 6. Findings a reviewer should check first

1. **§ 6.A5 — the corrected app-server topology (revision 3's main change).** Installed Codex 0.142.3
   exposes `--remote <ADDR>` — *"Connect the TUI to a remote app server endpoint"* — and the official
   documentation gives the `codex app-server --listen ws://127.0.0.1:4500` + `codex --remote …`
   procedure. **App-server does not require replacing the Codex terminal.** Revision 2 claimed the
   opposite; that claim is withdrawn.
2. **§ 10.2.1 — the one question now carrying the weight.** Whether a **second** Blue Helm client can
   observe a TUI-driven thread without taking over, duplicating it, or capturing approval routing is
   **UNVERIFIED (U5)**. Check specifically that the record does not anywhere convert this into "cannot".
3. **§ 7.5 — installed-version drift.** The subsystem needs per-provider capability detection and a
   visible *unknown* state, because a hook that never fires produces no error — it produces a pane that
   silently stops updating. **Note:** revision 1's supporting claim that Codex's `SessionEnd` was absent
   from the installed binary is **withdrawn** (§ A2); this section was rebuilt on the installed feature
   table and the `stable`/`experimental`/`removed` staging model instead.
4. **§ 7.1 — providers are not equivalent, but none holds an exclusive capability.** All four evaluated
   interfaces distinguish *some* awaiting-input condition from completion; Codex's app-server expresses
   both `waitingOnUserInput` and `waitingOnApproval` as explicit state flags. What is distinctive about
   Claude Code is narrower: among the three **hook** systems it appears uniquely documented for both
   idle-prompt and permission-prompt distinctions. Any cross-provider indicator will still be honest but
   **asymmetric** — in shape and cost, not capability.
5. **§ 8.1 — the constraint set.** Threats 1+2 rule out in-band signalling as authoritative; 4+9 rule
   out handing a reporter conversation content; 5+6 rule out treating one turn-end event as "finished".
   Two unrelated OSS projects (`wmux`, `tmux-agent-status`) independently converged on the same
   decomposition, which is corroboration rather than proof.
6. **§ 6.B3 — the one genuinely off-the-shelf component.** The official MIT `@xterm/addon-progress`
   parses `OSC 9;4`, with state 3 = indeterminate. OSC 9;4 is **documented for Claude Code**; whether
   Codex or Gemini emit it is **unverified, not disproven**. Use it as corroboration only — an allowed
   `terminalSequence` hook output can forge it (threat 1).
7. **§ 6.E — no third-party project is adoptable.** `claude-squad` is AGPL-3.0; `amux` is
   NOASSERTION/Commons Clause; `tmux-agent-status` has **no licence file** despite an open-source-looking
   README; `wmux` (MIT, Windows-native, closest architectural match) is a competing application, not a
   library.
8. **Two corrections made to sweep findings**, recorded in § 6.E so they are not carried forward wrongly:
   `anthropics/claude-code` issues **#56936** (Windows 11 Notification hook) and **#8320** (60-second
   idle notification) are **CLOSED**, not open. They are retained as *historical* Windows-specific
   reliability defects in the exact mechanism this subsystem would rely on.

## 6.1 Did the recommendation change? — **The headline survived; its basis and confidence did not**

Re-derived in revision 3 with the false premise removed (§ 10.0 of the record).

**Survived:** consume the **official provider hook systems** as the primary signal source and **build
the subsystem as owned code**.

**Changed — and this matters more than the headline:**

* **Withdrawn:** "an app-server client cannot observe a PTY session, therefore it replaces the terminal,
  therefore hooks win **decisively**." The premise was false and the word *decisively* is gone.
* **Established instead:** `codex app-server --listen …` + `codex --remote …` is an **officially
  documented topology in which the pane keeps the real Codex TUI**. App-server is a live upgrade path,
  not an all-or-nothing UX replacement.
* **Hooks still win today**, but on **cost, certainty, coverage and blast radius** — zero dependencies,
  a `stable` feature on the installed Codex, all three providers, and no new failure dependency —
  against app-server's server process to own, experimental/unsupported WebSocket transport, client
  inside the credential boundary, and a new single point of failure for a pane that currently has none.
* **Confidence is lower and explicitly provisional** on one question (§ 10.2.1).

**The load-bearing open question, stated precisely:** can a **second** Blue Helm client subscribe to or
read the **same loaded thread** driven by a remote Codex TUI, without taking over the interaction,
duplicating the thread, interfering with approval routing, or requiring a replacement UI?

* Evidence *for* plausibility: subscription is per-connection (`notSubscribed` is a distinct status);
  the docs reference a "last subscriber" and a no-subscriber unload grace period; `thread/read` reads
  without resuming.
* Evidence *for* difficulty: the `ClientRequest` closed enumeration contains **no `thread/subscribe`**;
  subscription appears to come from `thread/start`/`thread/resume`, and `ThreadResumeParams` is a
  configuring call with no read-only flag; approval routing is undocumented.
* **Verdict: UNVERIFIED.** Not "impossible" — that inversion is exactly what failed twice.

**How it affects the recommendation** (§ 10.2.1): if it resolves **positive**, app-server observation
likely becomes the recommended Codex source with the TUI untouched; if **negative**, hooks stand for
Codex. Until then the Codex half of the recommendation is provisional.

**Amendment 1 — provider-specific, not lowest-common-denominator** (§ 10.4), unchanged.

**Amendment 2 — the asymmetry is unevenness, not exclusivity** (§ 7.1), unchanged.

**Flip conditions** (§ 10.3), now two rather than one: **(1)** U5 resolves positive — the near condition,
answerable by a bounded experiment; **(2)** Blue wants a native Codex surface, headless mode, remote
control, or an in-app approval UI.

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
* **U5 (restated in revision 3) — whether a second client can observe a TUI-driven thread.** Not whether
  app-server can attach a TUI at all: it can, and does so officially. The open question is whether a
  *second* Blue Helm client can subscribe to or read that same loaded thread without taking over,
  duplicating it, or capturing approval routing — and **who receives approval requests when more than
  one client is connected**. Undocumented. **Unverified, not impossible.**
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
`10d80b2c36e956ba7548ca49f6a3652ebef31006`. Four findings, dispositioned in § 0.1. Preserved as
superseded review history.

**Revision 2:** `VERDICT: FAIL` — independent Standard-class review of reviewed tip
`0532772d2a78fa36ee591173bef442731fd8590f`. Two findings, dispositioned in § 0.2. Preserved as
superseded review history.

**Revision 3:** **none yet** — stopped for a fresh independent Standard-class revision-three review.

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
| Electron / provider processes left running **by this work** | **none.** No Electron instance and no provider session was started. Stated precisely rather than as a bare "zero processes": a process check found running `claude.exe` instances belonging to the VS Code extension hosting this session, and one `codex.exe` from the pre-existing Codex **desktop app** under `WindowsApps` — a different install from the npm CLI inspected here. Neither originates from this work order. Every Codex command run (`--version`, `--help` ×5, `features list`, `generate-json-schema`) exits immediately and left nothing resident |
| **App-server, daemon, remote TUI, or remote session launched** | **none.** Revision 3 established the `--remote` topology entirely from `--help` output and official documentation. **No listener was started, no `--remote` connection was made, and no thread was created.** Settling U5 would require exactly that, which is why it is assigned to the unauthorized § 11.1 Experiment B |
| Temporary artifacts | both generated schema directories were deleted behind a unique-pattern guard; a re-scan of `%TEMP%` for `codex-appserver-schema-*` returns **0** |
| Prior review artifacts | all three re-hashed after revision 3 and unchanged |
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
