# OSS Procurement Decision Record — Cross-Provider Pane-Status Indicators

Subsystem: **Cross-provider pane-status indicators (roadmap item R4) — per-pane detection and display of
agent state across Claude Code, OpenAI Codex, Gemini CLI, and generic local PTY panes**
Record path: `docs/OSS-PROCUREMENT-pane-status.md` (this file — the tracked record required by
`AGENTS.md` § *OSS-FIRST PROCUREMENT GATE — HARD INVARIANT*, item 6)
Work order: *Claude Code Work Order — Pane-Status OSS Procurement Evaluation*
Branch: `feature/pane-status-source-scout`
Base `main` SHA: `7a102a2498cb48fdc168e20503741509c5daefd3`
Evidence retrieval dates: **2026-08-08 – 2026-08-10**
Revision: **4** — corrective, after independent Standard-class reviews of revisions 1, 2 **and** 3 each
returned `VERDICT: FAIL`

**Revision history.**

* **Revision 1** (reviewed tip `10d80b2c`) — **`VERDICT: FAIL`** on four findings: the candidate set
  omitted the Codex app-server protocol; zero-token binary scans were promoted into behavioural claims;
  Claude's `terminalSequence` was described as permitting arbitrary escape sequences; and the
  cross-provider asymmetry claim was too strong.
* **Revision 2** (reviewed tip `0532772d`) — **`VERDICT: FAIL`** on two further findings: **(1)** the
  decisive app-server premise was false — installed Codex 0.142.3 *does* expose `codex --remote`, so
  app-server does **not** require replacing the terminal; **(2)** claims revision 2 had itself withdrawn
  were still present as current facts elsewhere in both documents.
* **Revision 3** (reviewed tip `63b7d71f`) — corrected both, rebuilding the app-server card on the real
  topology, re-deriving the recommendation without the false premise, and sweeping both documents for
  stale claims. **`VERDICT: FAIL`** on two findings: **(1)** its four-topology comparison contained an
  **internally impossible hybrid**, in which Blue Helm drove the app-server thread *and* the real remote
  TUI remained the driving UI; **(2)** it described the documented remote-TUI/WebSocket topology in
  current voice as *officially supported*, which the source does not say.
* **Revision 4** (this one) — **documentation correction only; no new research, no capability
  rediscovery, no schema regeneration.** § 10.2 is rebuilt around exactly three coherent topologies
  (**A** existing PTY + hooks, **B** Blue Helm drives and renders, **C** remote TUI drives and Blue Helm
  observes), with B and C declared mutually exclusive. The single open question **U5 is split into U5a**
  — documented `thread/loaded/list` + `thread/read` polling, unmeasured at runtime — **and U5b** —
  undocumented push subscription and approval routing. Support-language is corrected to
  *documented* throughout.

**Three failures, and the third is a different mistake from the first two.** Revision 1's defect was
promoting a zero-hit *token scan* into a negative fact. Revision 2's defect was promoting a zero-hit
*help-text grep* into a negative fact — the same error in a different medium, committed while correcting
the first. The standing rule recorded in § 0.1 followed from those: **a negative claim may never rest on
a search that could miss it. It must rest on a closed enumeration or on an explicit statement in a
source.** That rule held in revision 3; what failed instead was **precision of description** — an option
set that could not all be true at once, an open question that bundled a documented mechanism with an
undocumented one, and a stronger word (*supported*) than the source supports. The corresponding rule:
**an option must be internally consistent to be listed, an uncertainty must be no broader than the
evidence makes it, and documented is not supported.**

Corrections are made at the point of the original error and marked as corrections rather than silently
rewritten, so the failed reasoning stays visible. Both FAILs are preserved as superseded review history
in the branch handoff; neither is erased or reinterpreted.

This record is evidence-gathering only. It exists so Blue can later issue exactly one subsystem
verdict. It is written **before** any specification, dependency install, prototype, or implementation,
per the procurement gate.

---

## 0. How to read this record

Every substantive claim is tagged:

* **[FACT]** — verified during this evaluation against a primary source or against a binary/file on
  this machine. The verification method is stated inline or in § 4.
* **[INFERENCE]** — a conclusion drawn from facts, where the conclusion itself was not directly
  observed. Load-bearing inferences are called out as such.
* **[RECOMMENDATION]** — Source-Scout's opinion. Not a decision, and not a verdict.

Where a documented claim could not be confirmed against the *installed* software, that gap is stated
rather than smoothed over. Several such gaps exist and they matter (§ 7.5).

### 0.1 Evidence tiers — added in revision 2 after the FAIL

Revision 1 collapsed four very different kinds of evidence into the single word "verified". The
independent Standard-class review returned `VERDICT: FAIL`, and its second finding was that zero
plaintext token matches in a compiled binary had been promoted into behavioural claims. That was a real
defect in the reasoning, not a wording problem. This record now separates:

**Revision 3 adds the rule that both failures violated.** A **negative** claim — "X is absent", "there is
no flag", "it cannot do Y" — may never rest on a search that could miss its target. It must rest on
either a **closed enumeration** (a discriminated union in a schema, an exhaustive `--help` OPTIONS block
read in full, a complete file listing) or an **explicit statement in a source**. A grep, a token scan, or
a filtered view of a longer output can only ever support a *positive* finding.

| Tier | Meaning | Strength |
| --- | --- | --- |
| **T1 — Documented** | Stated in the provider's own documentation. | Establishes intent and contract; may describe a newer version than the one installed. |
| **T2 — Installed schema / capability surface** | Read out of the installed software's own generated schema, feature list, or `--help` output. | **Strongest tier available without running a session.** Authoritative for the installed version. |
| **T3 — Token presence** | A literal string was found in an installed binary or bundle. | Supporting only. Presence is suggestive; **absence proves nothing** (see below). |
| **T4 — Runtime observed** | Behaviour actually seen from a running session. | **Not available in this evaluation** — no model turn was launched. |
| **T5 — Inference** | A conclusion drawn from the above. | Only as strong as what it rests on; load-bearing ones are flagged. |

**Why T3 absence proves nothing.** A compiled Rust binary such as `codex.exe` may hold a string
fragmented across a jump table, constructed at runtime by concatenation or formatting, produced by a
`serde` derive from an enum variant with a different literal casing, stored compressed, or emitted via a
numeric constant rather than the literal text being searched for. A plaintext search that returns zero
hits therefore establishes only that *that exact byte sequence* was not found by *that search*. It does
not establish that the software cannot produce the corresponding behaviour.

Revision 2 re-labels every affected claim accordingly and, where a T2 surface exists, replaces the T3
evidence with it.

---

## 1. Subsystem scope

**In scope.** Detecting, normalising, and displaying a bounded per-pane status for every pane Blue
Helm can open, so the app can interrupt Blue rather than requiring him to poll it. The four target
states named by the work order:

| State | Meaning |
| --- | --- |
| **actively working** | The pane's agent is doing work; no human action is useful right now. |
| **awaiting human input** | The agent has stopped and cannot progress without Blue (permission prompt, question, plan approval). |
| **completed / idle** | The agent finished its turn and is not blocked; the pane is quiet. |
| **exited or failed** | The process ended, crashed, or the turn ended in an error. |

A fifth state is treated as mandatory by this record and is **not** optional decoration:

| State | Meaning |
| --- | --- |
| **unknown / unsupported** | No trustworthy signal is available for this pane. Displayed honestly. |

**Out of scope for the subsystem itself** (recorded so the boundary is not blurred later): notification
delivery policy, sound, tray/toast surfaces, pane auto-focus, and any automatic action taken *because*
of a status. Those are separate decisions. This record covers only where trustworthy state can come
from and what it would cost to obtain.

**Explicitly out of scope for this branch**: specification, architecture commitment, dependency
installation, prototyping, and implementation.

## 2. Current authorization state

Quoted verbatim from `BLUE-HELM-MASTER-STATUS.md`:

> Cross-provider pane-status indicators still have no Blue verdict, so that separate subsystem remains
> unauthorized for specification or implementation.

Corroborating verbatim text from the same file's remaining-work entry, which this record does not
change:

> **Specification and implementation remain unauthorized until this subsystem has all three of: its own
> read-only Source-Scout evaluation against primary sources; its own tracked OSS procurement decision
> record under `docs/`; and an explicit Blue verdict of ADOPT, FORK, PROTOTYPE, PATTERN-MINE, or BUILD
> FRESH.**

This file is the second of those three preconditions. The third does not exist.

**The Dockview ADOPT verdict does not apply here.** Dockview's own record states the boundary
verbatim — "keep pane-status indicators separate" — and `AGENTS.md` requires one record and one
verdict per subsystem. Nothing in `docs/OSS-PROCUREMENT-dockview.md` authorizes any pane-status work.

## 3. Search method and date

Performed 2026-08-08 – 2026-08-09 by a Source-Scout investigation, read-only.

Method, in the order applied:

1. **Explicit provider signals first, terminal-text inference last**, as the work order directs. Each
   provider was checked for: lifecycle hooks, structured event streams, official SDK/app-server
   protocols, and documented notification mechanisms — before any consideration of output parsing.
2. **Official documentation** for each provider CLI.
3. **Verification against the software actually installed on this machine**, because documentation
   describes current `main` branches while Blue Helm launches specific installed versions. This step
   produced the single most decision-relevant finding in the record (§ 7.5).
4. **npm registry metadata** (`npm view <pkg> --json`) for every library candidate — version, publish
   date, licence, dependencies, `gypfile`, install scripts.
5. **Library source inspection** for the mechanism each library actually uses, rather than trusting its
   description.
6. **Repository inspection** of Blue Helm itself to establish the real integration seams and to avoid
   proposing anything the app already owns.
7. **(Revision 2) Generated capability surfaces**, which are stronger than both documentation and token
   scanning: `codex features list` for staged feature state, and
   `codex app-server generate-json-schema --out <unique temp dir> --experimental` for the full installed
   protocol (335 schema files). The temp directory was created with a GUID-suffixed unique name,
   inspected, then removed after verifying the path matched that unique pattern. Schema generation is
   local codegen — **no model turn, no network request, no credential use**.

**Constraints honoured.** No package was installed. No provider login or credential entry occurred.
**No live or paid model turn was launched, in either revision.** No source code was copied. No prototype
was built. No credential, transcript, prompt text, or private provider data was inspected or exposed.

The complete list of commands run against provider software, across both revisions: `--version`;
`--help` on `codex` and four of its subcommands; `codex features list`;
`codex app-server generate-json-schema` into a unique temp directory that was then deleted; and offline
string inspection of already-installed files. Every one of these is local and read-only with respect to
the provider account — none contacts a model, and none reads credentials or conversation data.

## 4. Primary sources

| Source | URL / command | Used for |
| --- | --- | --- |
| Claude Code hooks reference | https://code.claude.com/docs/en/hooks | Hook event list, input schema, security model |
| Claude Code terminal configuration | https://code.claude.com/docs/en/terminal-config | `preferredNotifChannel`, terminal bell, tmux passthrough |
| Claude Code settings reference | https://code.claude.com/docs/en/settings | Notification-adjacent settings |
| Claude Code status line | https://code.claude.com/docs/en/statusline | Status-line command mechanism |
| Codex hooks reference | https://learn.chatgpt.com/docs/hooks.md | Event list, payload fields, hook trust model |
| Codex advanced configuration | https://learn.chatgpt.com/docs/config-file/config-advanced | `notify` events and payload |
| Gemini CLI hooks reference | https://raw.githubusercontent.com/google-gemini/gemini-cli/main/docs/hooks/reference.md | Event list and per-event input fields |
| Gemini CLI hooks overview | https://raw.githubusercontent.com/google-gemini/gemini-cli/main/docs/hooks/index.md | Hook trust/fingerprinting model |
| VS Code shell integration | https://code.visualstudio.com/docs/terminal/shell-integration | Exact OSC 133 / OSC 633 sequences |
| xterm.js public typings | https://raw.githubusercontent.com/xtermjs/xterm.js/master/typings/xterm.d.ts | `registerOscHandler` signature |
| npm registry | `npm view pidtree \| ps-list \| @vscode/windows-process-tree \| current-processes \| ps-tree --json` | Versions, dates, licences, deps, gypfile |
| pidtree source | https://raw.githubusercontent.com/simonepri/pidtree/master/lib/get.js · `/lib/powershell.js` | Windows strategy and fallback |
| **Installed Claude Code** | `claude --version` → `2.1.220 (Claude Code)`, `C:\Users\levij\.local\bin\claude.exe` | Installed-version capability |
| **Installed Codex CLI** | `codex --version` → `codex-cli 0.142.3`; string inspection of the shipped `codex.exe` | Installed-version capability |
| **Installed Gemini CLI** | `gemini --version` → `0.49.0`; token scan of `@google/gemini-cli` `bundle/chunk-*.js` | Installed-version capability |
| **Installed Codex app-server protocol schema** | `codex app-server generate-json-schema --out <unique temp dir> --experimental` → **335 schema files**, inspected then deleted | **T2** — authoritative event/method/state surface for the installed version (§ 6.A5) |
| **Installed Codex feature table** | `codex features list` | **T2** — `hooks stable true`, plus the `stable`/`experimental`/`under development`/`removed` staging model (§ 7.5) |
| **Installed Codex command surface** | `codex --help`, `codex app-server --help`, `codex app-server daemon --help`, `codex remote-control --help`, `codex features --help` | Subcommand availability, transports, analytics default |
| **(Revision 3) Installed Codex surface, re-read in full** | `C:\Users\levij\AppData\Roaming\npm\codex.cmd` → `--version`, full 134-line `--help`, `app-server --help`, `remote-control --help`, `remote-control start --help` | **`--remote`, `--remote-auth-token-env`, `--ws-auth` and the loopback/non-loopback distinction** — the surface revision 2 missed by grepping instead of reading |
| **(Revision 3) Official app-server documentation** | https://learn.chatgpt.com/docs/app-server#connect-the-cli-terminal-ui | The *"Connect the CLI terminal UI"* topology; WebSocket experimental/unsupported status; loopback guidance; the unauthenticated-by-default-during-rollout warning |
| Blue Helm repository | `app/main.js`, `app/renderer/app.js`, `app/renderer/pty-parser.js`, `app/package.json` | Integration seams, existing ownership |

"No suitable OSS exists" is **not** claimed. Candidates were searched, and the strongest candidates are
official provider interfaces rather than third-party packages — which is itself the central finding.

## 5. Candidate comparison

Candidates are grouped into families because they are not mutually exclusive alternatives: a real
implementation would combine A, C, and E, and would use B or D only as stated.

| # | Candidate / family | Kind | Licence | Version evaluated | Recency | Windows | New runtime dep | Provider coverage | Disposition |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **A1** | Claude Code hooks | Official interface | n/a (product feature) | CLI **2.1.220** installed | current | Yes | **None** | Claude only | **Accepted for consideration** |
| **A2** | Codex CLI hooks | Official interface | n/a | CLI **0.142.3** installed | current | Yes | **None** | Codex only | **Accepted for consideration** |
| **A3** | Codex `notify` program | Official interface | n/a | CLI **0.142.3** installed | current | Yes | **None** | Codex only | Accepted — narrow (one event) |
| **A5** | **Codex app-server (JSON-RPC protocol)**, with the real TUI attached via `codex --remote` | Official protocol | Apache-2.0 (`openai/codex`) | `codex app-server` + `codex --remote`, schema generated from **installed 0.142.3** | repo pushed **2026-08-10** | Yes | None *as a package* — but a protocol client, a server process to own, and a transport | Codex only | **Accepted for consideration — richest status semantics found; keeps the real TUI; second-client *polling* is documented (U5a) while *push* and approval routing are undocumented (U5b)** (§ 6.A5) |
| **A4** | Gemini CLI hooks | Official interface | n/a | CLI **0.49.0** installed | current | Yes | **None** | Gemini only | **Accepted for consideration** |
| **B1** | OSC 133 / OSC 633 shell-integration marks, parsed via existing `xterm.parser.registerOscHandler` | Documented protocol + API the app already uses | n/a | xterm 6.0.0 installed | current | Yes | **None** | Generic PTY (shell), not agents | Accepted — **shell panes only**, see § 8 |
| **B2** | Terminal bell (BEL) via `preferredNotifChannel: "terminal_bell"` | Official Claude setting | n/a | 2.1.220 | current | Yes | None | Claude only | **Rejected as a state source** — cannot distinguish finished from awaiting-permission (§ 7.1) |
| **B3** | **OSC 9;4 progress**, emitted by Claude Code (`terminalProgressBarEnabled`) and parsed by the official `@xterm/addon-progress` | Official sequence + official first-party addon | MIT (addon) | addon from the xterm project already vendored | current | Yes | +1 optional addon, same project as installed xterm | **Documented for Claude Code only**; whether Codex or Gemini emit it is **unverified**, not disproven (§ 6.B3) | **Accepted for consideration** — cheapest *actively working* signal that exists (§ 6.B3) |
| **C1** | Existing `node-pty` `onExit` → `pty-exit` IPC | Already owned by the app | MIT (`@lydell/node-pty`) | in tree | current | Yes | **None** | All panes | **Accepted** — authoritative for *exited*, and only that |
| **C2** | `pidtree` | npm library | MIT | **1.0.0**, published **2026-06-08** | maintained | Yes (wmic → PowerShell fallback) | +1, zero deps | All panes | Accepted — corroborating signal only |
| **C3** | `ps-list` | npm library | MIT | **9.0.0**, published **2025-09-26** | ~10.5 months | Yes | +1, zero deps | All panes | Rejected — ESM-only (`"type": "module"`, `engines.node >=20`) against a CommonJS main process; no advantage over C2 |
| **C4** | `@vscode/windows-process-tree` | npm library | MIT | **0.8.0**, published **2026-07-01** | maintained | Windows-only | +1, **native** | All panes | Rejected — `gypfile: true`, install script `node-gyp rebuild`, no prebuilds (§ 6.C4) |
| **C5** | `ps-tree` | npm library | MIT | **1.2.0**, published **2018-11-26** | **~7.7 years stale** | Yes (via `wmic`) | +1 | All panes | Rejected — unmaintained; `wmic` is absent on this machine |
| **C6** | `current-processes` | npm library | MIT | **0.2.1**, published **2014-07-01** | **~12 years stale** | Yes | +1 | All panes | Rejected — abandoned |
| **C7** | PowerShell `Get-CimInstance Win32_Process` directly | OS facility | n/a | OS | n/a | Yes | **None** | All panes | Accepted — this is what C2 does on this machine anyway (§ 6.C2) |
| **D1** | Terminal-output classification | Owned technique; precedent exists in `app/renderer/pty-parser.js` | n/a | in tree | current | Yes | None | All panes | Accepted **only** as an explicitly-labelled low-confidence fallback (§ 8) |
| **E** | Third-party agent-status / orchestrator / statusline projects | see § 6.E | see § 6.E | see § 6.E | see § 6.E | see § 6.E | see § 6.E | varies | see § 6.E |

**These are candidate dispositions, not a subsystem verdict.** `REJECT` is never a final verdict.

### 5.1 The shape of the result

**[FACT]** Every accepted first-line candidate (A1–A4, B1, C1, C7) requires **zero new runtime
dependencies**. The three official hook systems are product features of CLIs Blue Helm already
launches; OSC parsing uses an xterm API the app already calls; process exit is already wired; and the
process-tree query is an OS facility. The one optional addition (B3, `@xterm/addon-progress`) is a
first-party addon from the same MIT project as the xterm build already vendored.

**[FACT]** No third-party project in family E is adoptable as a dependency — the two most capable are
excluded by licence (AGPL-3.0 and Commons Clause), the best mechanism match carries no licence at all,
and the rest render text or read conversation transcripts (§ 6.E).

**[T5 — INFERENCE]** The procurement question for this subsystem is therefore **not** "which package do
we install". It is "which *official signals* do we consume, and how do we refuse honestly when they are
absent". That reframing is the main deliverable of this evaluation.

**One accepted candidate is not free, and revision 2 adds it deliberately.** **A5, the Codex
app-server**, also adds no npm package — but it is the one candidate whose true cost is not measured in
dependencies at all. It requires a protocol client, a credential posture, and a replacement UI for the
Codex pane (§ 6.A5, § 10.2). Revision 1's "everything is free" framing was tidy precisely because it had
omitted the candidate that is not.

## 6. Detailed candidate cards

### A1 — Claude Code hooks

**Interface, not a package.** Configured in `settings.json`; no dependency is added to Blue Helm.

**[FACT] Events relevant to status** (from the hooks reference, retrieved 2026-08-08). The published
event list contains 31 events. The ones that map onto the four target states:

| Event | Fires | Maps to |
| --- | --- | --- |
| `SessionStart` | session begins or resumes (`source`: `startup`/`resume`/`clear`/`compact`/`fork`) | pane became an agent pane |
| `UserPromptSubmit` | prompt submitted, before processing | **actively working** |
| `Notification` | Claude Code sends a notification | **awaiting human input** — matcher values include `permission_prompt` and `idle_prompt` |
| `Stop` | Claude finishes responding | **completed / idle** |
| `StopFailure` | turn ends due to an API error; matcher values include `rate_limit`, `overloaded`, `authentication_failed` | **failed** (distinct from clean completion) |
| `SubagentStart` / `SubagentStop` | subagent spawned / finished | nested activity |
| `TeammateIdle` | an agent-team teammate is about to go idle | idle |
| `SessionEnd` | session terminates | **exited** |

This is the **only** provider of the four evaluated that distinguishes *awaiting input* from *finished*
with a dedicated, documented matcher (`idle_prompt` / `permission_prompt` vs `Stop`), and the only one
that separates a failed turn (`StopFailure`) from a clean one.

**[FACT] Hook input schema.** Every hook receives on stdin: `session_id`, `prompt_id`,
`transcript_path`, `cwd`, `permission_mode`, `hook_event_name`, plus per-event fields. `Stop` and
`SubagentStop` additionally receive `last_assistant_message` and `stop_reason`. `UserPromptSubmit`
receives the full `prompt`. Tool events receive `tool_name`, `tool_input`, `tool_use_id`.

**[FACT] This is a privacy surface, and it is the largest one in this record.** A status hook is handed
the user's prompt text, the assistant's last message, tool inputs (which the documentation itself notes
"may contain passwords, API keys, or other secrets in command arguments"), and a filesystem path to the
full conversation transcript. See § 8, threat 4.

**[FACT] Hook configuration is per-scope**: `~/.claude/settings.json` (all projects),
`.claude/settings.json` (project, committable), `.claude/settings.local.json`, plugin
`hooks/hooks.json`, and skill/subagent frontmatter.

**[FACT] Trust model — weakest of the three.** Project `.claude/settings.json` hooks execute without a
per-hook approval step. Workspace trust is documented as gating *subagent frontmatter* hooks, and only
since v2.1.218. Hook edits are picked up at runtime by a file watcher rather than snapshotted at
startup. `allowManagedHooksOnly` exists for enterprise administrators to block user/project/plugin
hooks.

**[T1] Hooks can emit terminal escape sequences by design — from a bounded allowlist.**

Revision 1 said hooks "can emit **arbitrary** terminal sequences" and stated that the
no-controlling-terminal mitigation was documented only for macOS/Linux with *"no equivalent statement
made for Windows"*. **Both claims were wrong and are corrected here.** The documentation specifies an
allowlist and states Windows support explicitly. Quoted verbatim:

> The field accepts a string of one or more allowlisted escape sequences:
>
> * OSC `0`, `1`, `2`: window and icon titles
> * OSC `9`: iTerm2, ConEmu, Windows Terminal, and WezTerm notifications, including `9;4` taskbar progress
> * OSC `99`: Kitty notifications
> * OSC `777`: urxvt, Ghostty, and Warp notifications
> * Bare BEL
>
> Sequences may be terminated with BEL or with ST. **Anything outside the allowlist, including CSI cursor
> and color sequences, OSC palette sequences, OSC 8 hyperlinks, OSC 52 clipboard writes, and OSC 1337, is
> rejected and the field is ignored.**

and on platform support:

> This is race-free, works inside tmux and GNU screen, and **works on Windows where there is no `/dev/tty`**.

**[T5] The corrected security concern is narrower but sharper, not weaker.** `terminalSequence` is not
an arbitrary-escape-sequence primitive — it cannot move the cursor, recolour the screen, write the
clipboard via OSC 52, or inject OSC 8 hyperlinks. But **OSC `9` is on the allowlist, and the
documentation names `9;4` taskbar progress explicitly**. So:

* a hook — including one defined in a project's committable `.claude/settings.json`, which executes
  without per-hook approval — can legitimately emit exactly the OSC 9;4 sequence that § 6.B3 proposes
  reading as a *working* indicator; and
* the mechanism is **documented to work on Windows**, so this is live on Blue Helm's only platform
  rather than being a theoretical gap.

The precise finding is therefore a **forgery / trust-boundary problem for OSC 9;4 specifically**, not
arbitrary escape-sequence execution: any in-band pane-status marker built on the OSC 9 family can be
produced by an allowed hook output or by pane content, and cannot authenticate its origin. It does not
imply that Claude Code hooks can drive the terminal generally.

**Disposition: accepted for consideration.** Richest state model of any candidate, zero dependencies,
and the only source that natively distinguishes all five states. Carries the record's biggest privacy
surface and its weakest trust model.

### A2 — Codex CLI hooks

**[FACT] Event list** (11 events, from the Codex hooks reference): `SessionStart`, `SessionEnd`,
`PreToolUse`, `PermissionRequest`, `PostToolUse`, `PreCompact`, `PostCompact`, `UserPromptSubmit`,
`SubagentStart`, `SubagentStop`, `Stop`.

**[FACT] Payload fields.** Common: `session_id`, `transcript_path`, `cwd`, `hook_event_name`, `model`.
Turn-scoped events add `turn_id` and `permission_mode`. `UserPromptSubmit` carries `prompt`; `Stop` and
`SubagentStop` carry `last_assistant_message` and `stop_hook_active`. Same privacy surface as A1.

**[FACT] State mapping is coarser than Claude's.** `PermissionRequest` gives an explicit
awaiting-approval signal, and `Stop` gives end-of-turn — but the documentation describes `Stop` as
firing "when the agent finishes a turn **or is interrupted**". There is no documented `StopFailure`
equivalent, so *completed* and *failed* are not separated at the event level.

**[FACT] Trust model — strongest of the three.** Codex hashes each hook definition; non-managed hooks
must be explicitly trusted via `/hooks` before first run; any modification re-triggers review;
project-local hooks load only when the `.codex/` layer is trusted. Managed hooks
(`requirements.toml`) are auto-trusted and can be enforced with `allow_managed_hooks_only = true`.
A `--dangerously-bypass-hook-trust` flag exists.

**[T2] Hooks are a stable, enabled feature on this installation.** `codex features list` on the
installed 0.142.3 reports the row `hooks   stable   true`. This is a capability statement from the
software itself and is the authoritative installed-version evidence for this card. Revision 1 did not
consult this surface and relied on token counting instead.

**[T3 — supporting only] Token presence in the installed binary.** Offline plaintext inspection of the
shipped `codex.exe` found: `hooks.json` (6), `hook_event_name` (25), `PreToolUse` (50), `PostToolUse`
(37), `UserPromptSubmit` (34), `PermissionRequest` (50), `SubagentStop` (28), `PostCompact` (26),
`bypass_hook_trust` (14), `SessionStart` (45). These corroborate the T1/T2 evidence. They are not
independent proof of runtime behaviour.

#### Correction — the revision-1 `SessionEnd` claim is withdrawn

Revision 1 stated, in this Codex card, that *"One documented event is absent from the installed
binary"* and treated it as demonstrated version drift. The review's second finding was that this
promoted a zero-token result into a behavioural claim. **That criticism is correct and the claim is
withdrawn.**

* **What was searched:** the literal ASCII string `SessionEnd`, case-sensitive, via `rg -a -o -c -F`
  against the single file
  `%APPDATA%\npm\node_modules\@openai\codex\node_modules\@openai\codex-win32-x64\vendor\x86_64-pc-windows-msvc\bin\codex.exe`
  (Codex 0.142.3).
* **What was observed:** 0 matches for `SessionEnd`; 45 for `SessionStart`.
* **What that is:** a **T3 installed-binary token-scan observation**, nothing more.
* **What it does not establish:** it does **not** prove `SessionEnd` is absent at runtime, and it does
  not prove version drift. Per § 0.1, a Rust binary can produce an event name without that literal
  appearing contiguously in the file — for example via a `serde` rename, a fragmented or
  runtime-assembled string, or an enum discriminant formatted at emit time.
* **Current status of the question: UNVERIFIED.** No T2 surface consulted here enumerates hook event
  names (`codex features list` reports the *feature*, not its events; the app-server schema describes
  the app-server protocol, in which hooks appear only as `HookStartedNotification` /
  `HookCompletedNotification` / `hooks/list`). Settling it would require either a documented
  installed-version hook schema or a runtime experiment, and is assigned to § 11.1.

**Method caveat retained and sharpened:** token *presence* for distinctive strings (`bypass_hook_trust`,
`hooks.json`, `PreToolUse`) is meaningful corroboration; token *absence* is not evidence of absence; and
counts for generic words such as `Stop` (168) and `Notification` (978) are **not** cited as proof of
anything. The event list above comes from documentation (T1).

**Disposition: accepted for consideration.** Zero dependencies, best trust model, coarser states.

### A3 — Codex `notify`

**[FACT]** `notify` runs an external program on supported events. **Exactly one event type exists**:
`agent-turn-complete`. Payload fields: `type`, `thread-id`, `turn-id`, `cwd`, `input-messages`,
`last-assistant-message`.

**[FACT]** Must live in user-level `~/.codex/config.toml`; Codex ignores `notify` in a project-local
`.codex/config.toml` and warns at startup. That restriction is a *security advantage*: an untrusted
cloned repository cannot introduce or redirect a `notify` program.

**[FACT] Confirmed present in the installed binary**: `agent-turn-complete` (1), `last-assistant-message`
(1), `turn-id` (1), `thread-id` (6), `notify` (68).

**Disposition: accepted, but narrow.** One event cannot express four states. Useful as a
belt-and-braces completion signal, and notable as the only mechanism here that is structurally immune
to project-level tampering. Redundant if A2 is used.

### A5 — Codex app-server (JSON-RPC protocol) — added in revision 2

Revision 1 omitted this candidate entirely. That omission was the review's first finding and it was
correct: the record evaluated hooks and terminal signals without carding the official structured
protocol that Codex actually exposes. This card applies the same criteria used for every other
candidate.

**[T2] Evidence basis.** All protocol facts below were read from the **installed** Codex 0.142.3's own
generated JSON Schema bundle, produced with
`codex app-server generate-json-schema --out <unique temp dir> --experimental` (335 schema files),
inspected, and then deleted. No model turn was launched; schema generation is a local codegen operation.

**Licence and provenance.** `openai/codex` — **Apache-2.0**, 105,113 stars, pushed **2026-08-10**, not
archived (GitHub REST API). The protocol ships inside the CLI Blue Helm already launches; adopting it
adds **no npm package**.

**Maintenance and stability.** `codex app-server` is marked **`[experimental]`** in `--help`, as are its
`generate-ts` / `generate-json-schema` subcommands. The schema bundle is versioned (`v1/`, `v2/`), and
`v2` carries essentially all status-relevant methods.

**Installed-version availability.** Confirmed present: `codex app-server` with subcommands `daemon`,
`proxy`, `generate-ts`, `generate-json-schema`. Separately, `codex features list` reports **`hooks
stable true`** on this installation — a T2 capability statement that supersedes revision 1's T3 token
counting for the Codex hooks card.

**Windows support.** Runs natively; the installed binary is `codex.exe`. Transports offered via
`--listen`: `stdio://` (default), `unix://`, `ws://IP:PORT`, `off`.

**Network and telemetry behaviour.** `--analytics-default-enabled` exists, and the help text states
verbatim: *"Analytics are disabled by default for app-server. Users have to explicitly opt in via the
`analytics` section in the config.toml file."* Default-off is the correct posture, but analytics are a
configurable surface that a Blue Helm integration would need to pin explicitly rather than inherit.

**Authentication and credential implications — a genuine escalation.** The client surface includes
`account/login/start`, `account/login/cancel`, `account/logout`, `account/read`,
`account/rateLimits/read`, `account/usage/read`, and `auth/login`, plus a server→client
`account/chatgptAuthTokens/refresh` request. **An app-server client sits inside Codex's credential
boundary** — it can drive login/logout and is asked to service token refresh. That is categorically
more authority than a hook, which only receives an event. Under the owned-boundary rules this is the
single most significant concern in this card.

**Security and trust surface.** Larger than any other candidate here. The same protocol that reports
status also exposes filesystem operations (`fs/readFile`, `fs/writeFile`, `fs/remove`, `fs/watch`),
process control (`process/spawn`, `process/kill`, `process/writeStdin`, `process/resizePty`), thread
mutation (`thread/delete`, `thread/rollback`, `thread/fork`), and config writes. A status client would
have to be scoped to a strict read-only subset by discipline, because the transport does not scope
itself.

**[T2] Status-event semantics — the strongest found in this evaluation.** `thread/status/changed`
carries a `ThreadStatus` discriminated union, quoted from the installed schema:

| `type` | Additional | Maps to |
| --- | --- | --- |
| `notLoaded` | — | not started |
| `idle` | — | **completed / idle** |
| `active` | `activeFlags: []` | **actively working** |
| `active` | `activeFlags: ["waitingOnUserInput"]` | **awaiting human input** |
| `active` | `activeFlags: ["waitingOnApproval"]` | **awaiting approval** |
| `systemError` | — | **failed** |

This is a **state model**, not an event stream: the notification reports what the thread *is*, keyed by
`threadId`. Every other candidate in this record requires the app to *reconstruct* state by remembering
which event fired last. Note especially `waitingOnUserInput`, which is distinct from
`waitingOnApproval` — Codex therefore expresses a general awaiting-input state here, which its hook
surface does not.

**[T2] Turn semantics.** `turn/started` and `turn/completed` are both present as notifications;
`TurnCompletedNotification` requires `threadId` and `turn`. Also present: `turn/diff/updated`,
`turn/plan/updated`, `turn/steer`, and `TurnInterrupt`.

**[T2] Approval-request semantics — structurally stronger than a hook.** Approvals are JSON-RPC
**server→client requests**, not notifications, so the client must reply:

| Method | Purpose |
| --- | --- |
| `item/commandExecution/requestApproval` | command-execution approval |
| `item/fileChange/requestApproval` | file-change approval |
| `item/permissions/requestApproval` | permission approval |
| `item/tool/requestUserInput` | a tool asking the user a question |
| `mcpServer/elicitation/request` | MCP server elicitation |

**[T5 — INFERENCE, load-bearing]** Because an approval is an outstanding *request*, "this pane is
blocked on a human" is not inferred from a heuristic — it is structurally true while the request is
unanswered. No hook, escape sequence, or output heuristic in this record can match that.

**Pane/session binding.** Every status and turn notification carries `threadId`. Binding is explicit and
survives anything the UI does, which directly answers threat 10 (§ 8) far better than any in-band
scheme.

**Forgeability / spoofing surface.** Out-of-band over stdio/unix/ws, so **pane content cannot forge it**
— a decisive advantage over OSC-based signalling (§ 6.B3, threat 1). The transport instead becomes the
thing to protect: `ws://IP:PORT` and `remote-control` would expose it beyond the local process and must
not be enabled.

**Version-drift behaviour.** Better than every other candidate, and this is its quiet strength: the
schema is **generated from the installed binary**, so drift is *detectable by regeneration and diff*
rather than discovered when a pane silently stops updating. Against that, `[experimental]` means the
protocol may change shape without the stability promise a `stable` feature carries.

#### Correction — the revision-2 "must replace the terminal" premise is WITHDRAWN

Revision 2 asserted that `codex --help` offered *"no flag to attach the interactive TUI to a daemon"*
and concluded that adopting app-server **replaces** the Codex pane's terminal. **Both are false.** The
independent revision-2 review reproduced the contrary evidence, and this evaluation has re-reproduced it
against the explicit npm wrapper `C:\Users\levij\AppData\Roaming\npm\codex.cmd`.

**How the error happened, because the pattern matters more than the fact.** Revision 2 did not read
`codex --help` (134 lines); it grepped that output for lines matching `app-server|daemon`. The flag's
description reads *"Connect the TUI to a remote **app server** endpoint"* — two words, unhyphenated — so
the regex never matched, and a failed *search* was again written down as a confident negative *fact*.
That is the identical error class as the revision-1 token-scan defect corrected in § 0.1, committed a
second time in a different medium. **The rule that follows: a negative claim may never rest on a search
that could miss; it must rest on a closed enumeration or an explicit statement in a source.**

**[T2 — ESTABLISHED] The installed command surface.** Reproduced from
`C:\Users\levij\AppData\Roaming\npm\codex.cmd` (`--version` → `codex-cli 0.142.3`):

```
      --remote <ADDR>
          Connect the TUI to a remote app server endpoint.

          Accepted forms: `ws://host:port`, `wss://host:port`, `unix://`, or `unix://PATH`.

      --remote-auth-token-env <ENV_VAR>
          Name of the environment variable containing the bearer token to send to a remote app
          server websocket
```

**[T2] `--remote` is not marked experimental.** It appears in the top-level `OPTIONS` block with no
qualifier, in contrast to the `app-server` and `remote-control` **subcommands**, which are both labelled
`[experimental]` in the command list. The transport is separately qualified — see below.

**[T2] The surface distinguishes four transports and two exposure classes.** `app-server --listen` takes
`stdio://` (default), `unix://`, `unix://PATH`, `ws://IP:PORT`, or `off`. WebSocket authentication is
explicitly scoped: `--ws-auth <MODE>` is documented as *"Websocket auth mode for **non-loopback**
listeners"*, with `[possible values: capability-token, signed-bearer-token]`, supported by
`--ws-token-file <PATH>`, `--ws-token-sha256 <HEX>`, `--ws-shared-secret-file <PATH>`, `--ws-issuer`,
`--ws-audience`, and `--ws-max-clock-skew-seconds`. **Loopback and non-loopback are materially different
deployments in the tool's own design**, not merely in ours.

**[T1 — ESTABLISHED] The official topology.** `learn.chatgpt.com/docs/app-server`, *"Connect the CLI
terminal UI"*, verbatim:

> Start a WebSocket listener:
>
>     codex app-server --listen ws://127.0.0.1:4500
>
> Then connect the terminal UI:
>
>     codex --remote ws://127.0.0.1:4500
>
> For a non-local connection, configure WebSocket authentication and put the connection behind TLS.

**So the corrected position is: a real Codex TUI and an app-server are an officially documented
combination in one launch topology.** A Blue Helm pane could still run the genuine Codex TUI, with that
TUI connected to an app-server the app also controls. Terminal replacement is **not** required.

**"Documented" is deliberate and is not a synonym for "supported."** The topology appears in OpenAI's own
documentation as a procedure to follow; the same documentation marks the WebSocket transport
**experimental and unsupported for production workloads**. This record therefore says *officially
documented*, *documented topology*, and *documented command surface* throughout, and never *officially
supported* or *production-supported*. Revision 3 used the looser word in two places; both are corrected
in revision 4.

**[T1] Qualifications that survive and must not be dropped.** The documentation marks **WebSocket
transport as experimental and unsupported for production workloads**; states *"Use `wss://` for a remote
host. Use `ws://` only for a localhost or SSH-forwarded connection"*; and warns that **non-loopback
WebSocket listeners currently allow unauthenticated connections by default during rollout**, so auth
must be configured before any remote exposure. For Blue Helm the only defensible deployment is
**loopback `ws://127.0.0.1` or `unix://`, never a non-loopback listener** — and that is a deployment
choice available to us, not a prohibition on the transport as such.

**Token handling — and a boundary this project already has a rule about.** The server side takes
secrets by **file path** (`--ws-token-file`, `--ws-shared-secret-file`); only the TUI client side names
an environment variable (`--remote-auth-token-env`). Note carefully that the flag takes the *name* of a
variable, not the secret. Blue Helm already injects per-PTY environment from `safeStorage` at spawn
time (the Video Scout `GEMINI_API_KEY` path in `app/main.js`), so a token could be supplied to exactly
one PTY without ever becoming a persistent Windows user variable. **`setx` must not be used**, per
`AGENTS.md`; nothing here requires it.

#### The open questions — split in revision 4 into U5a and U5b

Correcting the topology does **not** by itself establish how Blue Helm would watch a pane. Revision 3
asked that as **one** question, "can a second client observe a TUI-driven thread", and marked the whole
of it unverified. **That bundling was the revision-3 review's first accepted finding, and it was wrong in
a specific way: it swept a documented read path into the same bucket as an undocumented push path.** The
two mechanisms have different evidence, different risk, and different consequences, so revision 4 splits
them.

##### U5a — read-only polling. **The interface is documented.**

**[T1/T2 — DOCUMENTED]** A second client can read thread state without resuming or driving the thread:

* **`thread/loaded/list`** lists the threads the server currently has loaded, by ID.
* **`thread/read`** reads a thread **without resuming it** and without emitting `thread/started`.
  `ThreadReadParams` takes `threadId` and an optional `includeTurns`.
* **The returned thread object carries the thread's runtime status**, so a reader obtains the same
  `ThreadStatus` state model tabulated above — including the `waitingOnUserInput` / `waitingOnApproval`
  active flags — rather than having to reconstruct it from events.

Both methods are members of the closed `ClientRequest` enumeration recorded below (`loaded/list`, `read`),
so their existence rests on an enumeration rather than on a search.

> **Provenance note, stated because this record's evidence discipline requires it.** The first two points
> were established in revision 3 from the installed schema bundle and the official documentation. The
> third — that the returned thread object carries runtime status — is recorded on the authority of the
> **accepted revision-3 review finding**. Revision 4 is a documentation correction and did **not**
> regenerate schemas or re-run capability discovery, so it did not independently re-derive that third
> point. It is recorded as documented, not as observed.

**What U5a therefore is:** a **documented polling route** to Codex status that leaves the real remote TUI
in place and never asks the observer to configure, resume, or drive the thread. It is *not* undocumented,
and this record must not describe it as such.

**What U5a is still not:** measured. The interface being documented says nothing about **polling cadence,
per-poll cost, behaviour under load, staleness between polls, reconnection semantics, or what happens to
a poller when the server unloads an idle thread.** No runtime prototype has been performed, so U5a's
*production suitability* is unestablished even though its *existence* is not in doubt.

**Approval routing is not a U5a concern.** A polling reader does not need to receive
`item/*/requestApproval` requests in order to observe that a thread is in `active` +
`waitingOnApproval`. The status is readable from the thread state itself. Revision 3 attached the
approval-routing uncertainty to the whole of U5; that was part of the bundling error, and it is
withdrawn here as it applies to polling.

##### U5b — push subscription and approval routing. **Undocumented.**

**[UNVERIFIED — no documented behaviour found]** Everything that would make observation *push-quality*
rather than *poll-quality* is undocumented:

* **No `thread/subscribe` client method exists in the installed closed enumeration.** This is a
  closed-enumeration observation, not a text search: `ClientRequest.json` is the discriminated union of
  every client method the installed server accepts, and its `thread/*` members are exhaustively
  `approveGuardianDeniedAction, archive, backgroundTerminals/{clean,list,terminate}, compact/start,
  decrement, delete, fork, goal/{clear,get,set}, increment, inject, list, loaded/list, memoryMode/set,
  metadata/update, name/set, read, realtime/*, resume, rollback, search, settings/update, shellCommand,
  start, started, turn, turns/items/list, turns/list, unarchive, unsubscribe`. There is a
  `thread/unsubscribe` and no counterpart.
* **Whether a second client can acquire `thread/status/changed` push notifications for a TUI-driven
  thread without `thread/resume` is undocumented.** Subscription appears to be acquired by `thread/start`
  or `thread/resume`, and `ThreadResumeParams` is a *configuring* call — it carries `approvalPolicy`,
  `approvalsReviewer`, `sandbox`, `permissions`, `model`, `modelProvider`, `config`, `cwd`, and more, and
  has **no** read-only, observe, or subscribe-only flag.
* **Whether approval requests route to the TUI, to the observer, to one subscriber, or to multiple
  subscribers is undocumented.** The documentation is silent on approval routing.
* **Whether `thread/resume` from a second client interferes with, takes over, or duplicates a thread the
  TUI is driving is unverified**, as is any resulting ownership behaviour.

**[T2] What does exist, and what it does and does not prove.** `ThreadUnsubscribeStatus` is a closed enum
of `notLoaded` / `notSubscribed` / `unsubscribed`, so a connection can be *not subscribed* to a thread
that is loaded — subscription is therefore tracked **per connection**. The documentation also refers to
*"this was the last subscriber"*, after which the server *"unloads the thread after a no-subscriber
inactivity grace period"* — a concept that presupposes more than one subscriber is possible. These make
passive push **plausible**. They do not make it documented, and they are not cited here as if they were.

**[T5 — INFERENCE, explicitly not a fact]** Putting the above together: a client that wants *push* would
have either to `thread/resume` a thread the TUI is already driving — supplying a competing configuration,
which is precisely the take-over/interference risk — or to fall back to U5a polling, which works but
forfeits event-time freshness. **No documented passive subscribe-only path was found.**

**The evidence boundary, stated once, plainly:**

| | Mechanism | Evidence status |
| --- | --- | --- |
| **U5a** | `thread/loaded/list` + `thread/read` polling, thread status in the response | **Documented.** Official interface; runtime characteristics unmeasured |
| **U5b** | Passive push subscription to `thread/status/changed`; approval-request routing | **Undocumented.** Plausible from per-connection subscription and subscriber counting; not established |

U5b is recorded as unknown. It is **not** recorded as impossible — that inversion is the error that
failed revisions 1 and 2, and the rule stated above still governs: a negative claim needs a closed
enumeration or an explicit source statement, and neither exists for "a second client cannot passively
subscribe." Equally, U5a must not be recorded as unverified merely because U5b is.

**Whether it replaces, supplements, or complicates the existing PTY path.** Corrected answer: **it does
not require replacement.** In the documented topology it *supplements* the pane — the real TUI keeps
running — at the cost of a materially more complex launch: Blue Helm would own an app-server process,
its transport and lifetime, a token if one is used, and reconnection behaviour. A second Blue Helm client
can then read status by **documented polling (U5a)**; whether it can also receive **push** without
driving the thread, and where approvals are routed, is **U5b, undocumented**. If U5b turns out to be
unavailable, the fallback is not "replace the terminal" — it is either U5a polling or hooks for Codex,
the latter costing nothing already spent.

**Build/ownership burden.** A JSON-RPC client, transport and lifetime management for a server process,
a scoped method allowlist, a credential posture for a surface that can log in and out, reconnection and
failure handling, and — only in the replacement topology, which is now known to be optional — a UI.
Still the largest of any candidate, and still Codex-only.

**Failure behaviour to weigh.** If the app-server dies, the remote TUI loses its backend and the pane
becomes unusable, whereas an independently PTY-hosted `codex` process has no such dependency. Adopting
the remote topology therefore introduces a **new single point of failure into a pane that currently has
none** — a real cost that has nothing to do with status quality.

**Disposition: accepted for consideration.** Best status semantics, best binding, best drift story,
unforgeable by pane content, and — corrected — **compatible with keeping the real Codex TUI**, with a
**documented read path (U5a)** for an observing client. Against that: the largest security surface, a
client inside the credential boundary, experimental/unsupported WebSocket transport, a new failure
dependency, higher launch complexity, unmeasured polling characteristics, and an undocumented
push/approval-routing story (**U5b**).

### A4 — Gemini CLI hooks

**[FACT] Event list** (11 events): `BeforeTool`, `AfterTool`, `BeforeAgent`, `AfterAgent`,
`BeforeModel`, `AfterModel`, `BeforeToolSelection`, `SessionStart`, `SessionEnd`, `Notification`,
`PreCompress`.

**[FACT] Payload fields.** Common: `session_id`, `transcript_path`, `cwd`, `hook_event_name`,
`timestamp`. `BeforeAgent` carries `prompt`. `AfterAgent` carries `prompt`, `prompt_response` (model
output) and `stop_hook_active`. `Notification` carries `notification_type`, `message`, `details`.
`SessionEnd` carries `reason` (`exit`/`clear`/`logout`/`prompt_input_exit`/`other`).

**[FACT] The awaiting-input signal is the weakest of the three.** The only documented
`notification_type` value is `"ToolPermission"`. Gemini's own hooks overview does not define further
values, and the reference gives no idle/awaiting-input event. So Gemini can express *tool permission
requested*, but there is no documented equivalent of Claude's `idle_prompt`.

**[FACT] Trust model — middle.** The overview states verbatim: *"Hooks execute arbitrary code with your
user privileges. By configuring hooks, you are allowing scripts to run shell commands on your machine."*
and *"Project-level hooks are particularly risky when opening untrusted projects. Gemini CLI fingerprints
project hooks."* A change to a hook's name or command — including via `git pull` — is treated as new and
untrusted, and warns before execution.

**[FACT] Confirmed present in the installed bundle.** Token scan of `@google/gemini-cli` 0.49.0
`bundle/chunk-*.js`: `hook_event_name` (27), `BeforeTool` (144), `AfterTool` present, `AfterAgent` (67),
`BeforeAgent` (62), `PreCompress` (54), `BeforeToolSelection` (65). Hooks are **available in the
installed version**, not only on `main`.

**[FACT] Hooks run synchronously inside the agent loop** — Gemini CLI waits for all matching hooks to
complete before continuing. A slow or hung status hook therefore *stalls the agent*. This is a
performance and liveness constraint the other two do not state as explicitly.

**Disposition: accepted for consideration**, with the weakest state resolution of the three.

### B1 — OSC 133 / OSC 633 shell-integration marks

**[FACT] Exact sequences** (VS Code shell-integration documentation):

| Sequence | Meaning |
| --- | --- |
| `OSC 133 ; A ST` | prompt start |
| `OSC 133 ; B ST` | prompt end |
| `OSC 133 ; C ST` | pre-execution (command output begins) |
| `OSC 133 ; D [; <exitcode>] ST` | execution finished, optional exit code |

`OSC 633 ; A/B/C/D` is the VS Code-specific variant with the same A/B/C/D semantics.

**[FACT] Blue Helm can parse these with no new dependency, using an API it already calls.** xterm.js
exposes `registerOscHandler(ident: number, callback: (data: string) => boolean | Promise<boolean>):
IDisposable`, and `app/renderer/app.js:497–498` **already** does exactly this for OSC 52 clipboard
handling. `@xterm/xterm` is declared `^6.0.0` and 6.0.0 is installed; the vendored
`app/renderer/vendor/xterm.js` contains both `registerOscHandler` and `onTitleChange`.

**[FACT] It requires shell integration to be installed in the PowerShell profile.** The marks are
emitted by the *shell*, not by the terminal. VS Code notes automatic injection may not work on older
shells and recommends manual profile installation.

**[FACT] It says nothing about agents.** OSC 133 describes *shell command* boundaries. When a pane runs
`claude`, the shell sees one long-running command; `133;C` fires once at launch and `133;D` fires once
at exit. It cannot see turns, permission prompts, or idleness inside the agent's TUI.

**Disposition: accepted for generic PowerShell panes only.** For those panes it is genuinely excellent —
an exit code, delivered in-band, from the shell itself. For agent panes it is close to useless, and
must not be presented as coverage. See also threat 1: in-band marks are forgeable.

### B2 — Terminal bell / `preferredNotifChannel`

**[FACT]** Setting `preferredNotifChannel` to `"terminal_bell"` in `~/.claude/settings.json` makes
Claude Code ring the terminal bell. The documentation describes the trigger as: *"When Claude finishes a
task or pauses for a permission prompt, it fires a notification event."*

**[FACT] That is one undifferentiated signal for two different states.** A BEL cannot tell Blue Helm
whether the pane finished or is blocked on a permission prompt — which is precisely the distinction the
subsystem exists to make.

**Disposition: rejected as a state source.** Retained in this record only because it is the obvious
cheap idea and someone will propose it; the reason it fails is specific and worth keeping.

### B3 — OSC 9;4 progress + `@xterm/addon-progress`

**[FACT] Claude Code emits OSC 9;4.** The setting is `terminalProgressBarEnabled` in
`~/.claude/settings.json`. Corroborated by `anthropics/claude-code` issue **#57366**, titled
*"[BUG] terminalProgressBarEnabled (OSC 9;4) doesn't work inside tmux"*, whose substance is that Claude
Code emits **raw** OSC 9;4 without tmux DCS passthrough wrapping — i.e. the sequence is emitted, and
only tmux swallows it. Blue Helm is not tmux; it is the terminal, and would receive the raw sequence
directly.

**[T3 — supporting] Token presence in the installed Claude binary.** Offline string inspection of
`C:\Users\levij\.local\bin\claude.exe` (2.1.220): `terminalProgressBarEnabled` (21 occurrences), `9;4`
(6 occurrences). Combined with the T1 documentation and issue #57366, the case that installed Claude
Code emits OSC 9;4 is strong.

#### Correction — the revision-1 "Codex and Gemini do not emit it" claim is withdrawn

Revision 1 stated *"Codex and Gemini do not emit it … This is a Claude-only signal, verified rather than
assumed."* **That was an overclaim and is withdrawn.** It inverted a null result into a capability
statement, which is exactly the reasoning error the review flagged.

* **What was searched:** the literal ASCII string `9;4` via `rg -a -o -c -F` against the installed
  Codex 0.142.3 `codex.exe`, and via a .NET regex count over the installed Gemini 0.49.0
  `@google\gemini-cli\bundle\chunk-*.js` files.
* **What was observed:** 0 matches in each.
* **What that is:** a **T3 token-scan observation**.
* **What it does not establish:** it does **not** establish that Codex or Gemini *cannot* emit OSC 9;4.
  A progress sequence is routinely assembled at emit time from parts (`"\x1b]9;"`, a state number, a
  value), in which case the contiguous literal `9;4` never appears in the file at all. The null result
  is fully consistent with either emitting or not emitting.
* **Separating the four questions honestly:**

| Question | Claude Code 2.1.220 | Codex 0.142.3 | Gemini CLI 0.49.0 |
| --- | --- | --- | --- |
| **Documented support (T1)** | **Yes** — `terminalProgressBarEnabled`; issue #57366 describes raw OSC 9;4 emission | None found | None found |
| **Token presence (T3)** | Present (`9;4` ×6, setting ×21) | Not found | Not found |
| **Runtime behaviour (T4)** | **Unverified** — no session was launched | **Unverified** | **Unverified** |
| **Inference (T5)** | Very likely emits when the setting is enabled | Unknown — no documented support found *and* no token; absence of documentation is the weightier of the two | Unknown, same basis |

* **Corrected conclusion:** OSC 9;4 is **documented for Claude Code and not documented for Codex or
  Gemini**. That is a statement about documentation and is the defensible one. Whether the other two
  emit it is **unverified**, and any design must therefore treat OSC 9;4 as *a Claude-documented signal
  it may opportunistically receive from others*, never as a provider discriminator.

**[FACT] An official first-party parser exists.** `@xterm/addon-progress` is one of the 13 official
addons in the `xtermjs/xterm.js` repository (verified against the repository's `addons/` listing). It
implements ConEmu's `ESC ] 9 ; 4 ; <state> ; <value> BEL`, exposing
`onChange(({state, value}: IProgressState) => …)` with states **0** = remove, **1** = normal progress,
**2** = error, **3** = indeterminate/spinner, **4** = pause/warning; values clamp to 0–100 and invalid
sequences are rejected by strict decimal-only parsing.

**[INFERENCE]** State 3 (indeterminate) and state 0 (remove) map almost exactly onto *actively working*
and *not working*, and the addon comes from the same MIT project as the xterm already vendored in
`app/renderer/vendor/`. Of every mechanism in this record, this is the cheapest path to a live
"working" indicator — for Claude panes only.

**Caveats that keep it from being a complete answer:** it is **in-band and therefore forgeable**
(threat 1); it is opt-in via a setting the app would have to ask Blue to enable in user scope; it says
nothing about *why* work stopped, so it cannot distinguish *awaiting input* from *completed*; and it
covers one of three providers.

**Disposition: accepted for consideration** as a corroborating *working/not-working* signal for Claude
panes, never as the sole basis for a terminal state.

### C1 — Existing PTY exit

**[FACT]** `app/main.js` already wires `p.onExit(...)` → `pty-exit` IPC to the renderer, and
`app/renderer/app.js` already renders `[process exited — close this pane]`. This is authoritative for
*exited*.

**[FACT] It is authoritative for nothing else, and there is a specific reason.** Every pane is spawned
as `powershell.exe -NoLogo -ExecutionPolicy Bypass -NoExit [-Command <agent>]`
(`app/main.js:871`, `:918`, `:942`). Because of `-NoExit`, **PowerShell survives the agent exiting** and
returns to an interactive prompt. So `pty-exit` fires when the *shell* ends, not when the *agent*
finishes. Agent completion is invisible to process exit by construction.

**[FACT] The agent is a grandchild, not the direct child.** The PTY's direct child is always
`powershell.exe`; the agent CLI runs beneath it. Claude Code 2.1.220 is now a native
`C:\Users\levij\.local\bin\claude.exe`; Codex and Gemini are npm `.ps1` shims resolving to their own
executables. Any process-based reasoning must walk the tree, never inspect the direct child.

**Disposition: accepted** — for *exited* only, and it is already owned.

### C2 — `pidtree`

**[FACT]** MIT. Latest **1.0.0**, published **2026-06-08**. **Zero runtime dependencies.** No `gypfile`,
no install script — pure JavaScript.

**[FACT] Its Windows strategy is decision-relevant.** From `lib/get.js` and `lib/powershell.js`: it
tries `wmic` first and falls back to PowerShell when `wmic` is missing, with the in-source rationale
that *"wmic has been removed from recent versions (Windows 11 24H2, Windows Server 2025)"*. The fallback
executes:

```
$ProgressPreference = 'SilentlyContinue'; Get-CimInstance -ClassName Win32_Process |
  ForEach-Object { "$($_.ParentProcessId) $($_.ProcessId)" }
```

**[FACT] `wmic.exe` is not present on this machine** (verified: `Get-Command wmic.exe` returns nothing
on Windows 11 build 26200). So on Blue's hardware pidtree would take the PowerShell path on **every**
call.

**[INFERENCE — load-bearing]** That makes process-tree inspection a *costly* signal here: each query
spawns a PowerShell process and enumerates every process on the system. It is unsuitable as a
high-frequency poll, and acceptable only as a low-frequency corroborating check or an on-demand
disambiguation.

**Disposition: accepted as a corroborating signal only.** And note § C7: on this machine pidtree's value
over calling `Get-CimInstance` directly is convenience, not capability.

### C3 — `ps-list`

**[FACT]** MIT, **9.0.0**, published **2025-09-26** (~10.5 months old — maintained but not recent).
Zero dependencies. **`"type": "module"` and `engines.node >= 20`** — ESM-only.

**[FACT]** Blue Helm's main process is CommonJS (`app/main.js` uses `require`). Consuming an ESM-only
package from CommonJS requires dynamic `import()` plumbing.

**Disposition: rejected.** Real integration friction for no capability advantage over C2/C7.

### C4 — `@vscode/windows-process-tree`

**[FACT]** MIT, **0.8.0**, published **2026-07-01** — genuinely maintained, and it is what VS Code
itself uses. Dependency: `node-addon-api`.

**[FACT] It is a native module with `gypfile: true` and install script `node-gyp rebuild`.** There is no
prebuild-download step in the install script, so consumers compile from source at install time.

**[INFERENCE — load-bearing]** This is the single worst fit in the record for this project, for reasons
already written into its history. This repository's own record documents that stock `node-pty` **failed
to compile on Windows** and that the fix was to adopt the prebuilt `@lydell/node-pty` instead. Adding a
compile-at-install native module would reintroduce exactly that failure mode — and it would land
directly on the roadmap's *Portable family distribution and clean-machine setup* item, which requires
install to succeed on a clean Windows account with no C++ toolchain.

**Disposition: rejected.** Excellent library, wrong constraint set.

### C5 / C6 — `ps-tree`, `current-processes`

**[FACT]** `ps-tree` 1.2.0 published **2018-11-26**; `current-processes` 0.2.1 published
**2014-07-01**. Both MIT, both unmaintained. `ps-tree` shells out to `wmic`, which does not exist on
this machine.

**Disposition: rejected** — unmaintained, and one is broken on the target OS.

### C7 — `Get-CimInstance Win32_Process` directly

**[FACT]** This is precisely what pidtree executes on this machine (§ C2). Using it directly costs one
small owned helper and zero dependencies.

**Disposition: accepted.** Recorded because it makes the honest adopt-versus-build comparison for the
process-tree slice extremely lopsided: the "adopt" option's entire Windows implementation is a single
PowerShell command the app can issue itself, and the app already runs PowerShell for other purposes.

### D1 — Terminal-output classification

**[FACT] The precedent already exists in-tree and is instructive.** `app/renderer/pty-parser.js` parses
`claude --agent` output into `assistant` / `tool_call` / `tool_result` / `ui_chrome` / `unclassified`
events. Its own header states the design constraint verbatim: *"no line is ever dropped unless it is
definitively UI chrome"* and content it cannot categorise is emitted as `unclassified` *"so a future
Claude Code TUI update degrades gracefully, not silently"*.

**[INFERENCE]** That file is simultaneously proof the technique is workable and a standing warning about
its fragility: it exists because agent TUI output is unstable, and it was written defensively for that
reason. Status inferred from TUI text inherits every one of those weaknesses, and unlike chat rendering,
a wrong status is *actively misleading* rather than merely ugly.

**Disposition: accepted only as an explicitly-labelled low-confidence fallback**, never as the basis for
a confident status, and never for the "completed" state (see threat 5).

### E — Third-party agent-status, orchestrator, and statusline projects

All repository metadata below was re-verified directly against the GitHub REST API
(`gh api repos/<owner>/<repo>`) on **2026-08-09**, not taken from any summary.

| Project | Licence (API `spdx_id`) | Stars | Last push | Windows-native | Mechanism | Disposition |
| --- | --- | --- | --- | --- | --- | --- |
| [`openwong2kim/wmux`](https://github.com/openwong2kim/wmux) | **MIT** | 333 | **2026-08-08** | **Yes** — ConPTY, no WSL required | Output-throughput activity detection + OSC 133 + named per-agent adapters (Claude Code / Codex / Gemini) | **Study as reference** — closest architectural match found; not embeddable |
| [`smtg-ai/claude-squad`](https://github.com/smtg-ai/claude-squad) | **AGPL-3.0** | 8,259 | 2026-07-30 | **No** — requires tmux | tmux `capture-pane` → SHA-256 hash diff for "new output", plus substring matching of known approval-prompt strings | **Rejected — licence.** AGPL-3.0 is incompatible with a distributed Blue Helm build |
| [`mixpeek/amux`](https://github.com/mixpeek/amux) | **NOASSERTION** (reported as MIT + Commons Clause) | 335 | 2026-08-09 | **No** — tmux | ANSI-stripped `capture-pane` output classification | **Rejected — licence.** Not OSI-approved; Commons Clause restricts commercial use |
| [`samleeney/tmux-agent-status`](https://github.com/samleeney/tmux-agent-status) | **NONE** (no licence file detected) | 258 | 2026-07-31 | No — tmux display | **Hook-based**: Claude Code and Codex hooks write a per-session status file that a statusline reads | **Rejected as code — no licence** (all rights reserved). Its *architecture* independently corroborates § 8.1 |
| [`stravu/crystal`](https://github.com/stravu/crystal) | MIT | 3,107 | 2026-02-26 | Not confirmed | Not documented | Rejected — superseded by Nimbalyst per its own repo banner; ~5.5 months stale |
| [`sirmalloc/ccstatusline`](https://github.com/sirmalloc/ccstatusline) | MIT | 12,301 | 2026-08-03 | **Yes** — ships `docs/WINDOWS.md` | Claude Code's official `statusLine` command hook (JSON on stdin per tick) | **Study as reference** — renders text, not a state machine |
| [`Owloops/claude-powerline`](https://github.com/Owloops/claude-powerline) | MIT | 1,145 | 2026-08-09 | Not stated | `statusLine` hook + direct parsing of the session transcript JSONL | Rejected as a dependency — **reads transcript content**, which § 8 threat 4 forbids |
| [`wonderwhy-er/DesktopCommanderMCP`](https://github.com/wonderwhy-er/DesktopCommanderMCP) | MIT | 9,276 | 2026-08-06 | Yes | `process-detection.ts`: a REPL-prompt dictionary matched against the last output line to set `isWaitingForInput` | **Study as reference** for the D1 fallback only; its dictionary targets language REPLs, not agent CLIs |
| [`BloopAI/vibe-kanban`](https://github.com/BloopAI/vibe-kanban) | Apache-2.0 | 27,710 | 2026-04-24 | Local web server, not an embedded pane | Task-level Kanban driven by PR lifecycle; no verified per-pane live status | Rejected — architecture mismatch; already known to this project, and Bloop shut down in 2026 |
| [`lydell/run-pty`](https://github.com/lydell/run-pty) | MIT | 127 | not retrieved | Yes | Per-line regex → status label; multi-pane overview | Minor reference. Notable only because it shares an author with the `@lydell/node-pty` already in use |
| [`suin/osc633-parser`](https://github.com/suin/osc633-parser) | MIT | **0** | — | Node ≥22, no browser/xterm integration | Standalone OSC 633 A–E/P parser | Rejected — `v0.0.0-alpha1`, zero adoption; and § B1 needs no library |

**[FACT] Two corrections to claims encountered during the sweep**, made because this record must not
carry them forward wrongly:

1. `anthropics/claude-code` issues **#56936** (*"Notification hook does not fire on permission prompts
   (Windows 11)"*, opened 2026-05-07) and **#8320** (*"60-Second Idle Notifications Not Triggering in
   Notification Hook"*, opened 2025-09-28) are both **CLOSED**, not open. They are recorded here as
   *historical* reliability defects, not current blockers.
2. `tmux-agent-status` has **no licence file** (API `license: NONE`), notwithstanding an
   open-source-looking README. Under default copyright that means its code may not be reused.

**[INFERENCE — and the reason issue #56936 is still worth recording]** The one mechanism that gives
Claude Code its unique *awaiting input* signal has previously failed **specifically on Windows 11**,
which is Blue Helm's only platform, and separately failed to deliver the 60-second idle notification.
Both are fixed, but they establish that this signal has a Windows-specific reliability history. That
argues for treating a missing `Notification` event as *unknown* rather than assuming *working*, and for
verifying the signal on Blue's own machine before depending on it.

**[FACT] No third-party project is adoptable as a dependency.** The two most feature-complete
orchestrators are excluded by licence (AGPL-3.0; Commons Clause). The most architecturally relevant one
(`wmux`) is a competing application, not a library. The best-matching *mechanism* (`tmux-agent-status`)
has no licence. Everything remaining renders text or reads conversation transcripts.

**[FACT] Independent corroboration worth noting.** `wmux` — MIT, Windows-native ConPTY, pushed the day
before this evaluation, and solving the identical problem for the same three agent CLIs — arrives at a
per-provider adapter model layered over generic activity detection. `tmux-agent-status` independently
arrives at hooks-write-status, display-reads-status. Two unrelated projects converging on the same
decomposition is evidence that § 8.1's constraint set is the natural one, reached by others without
Blue Helm's threat model.

## 7. Provider-by-provider capability matrix

### 7.1 State coverage

Legend: **native** = a dedicated documented event/matcher exists; **derived** = obtainable by combining
events; **none** = no documented signal.

Columns are now split by *interface*, because Codex exposes two very different ones and revision 1
conflated their coverage by carding only the first.

| State | Claude Code 2.1.220 (hooks) | Codex 0.142.3 (hooks) | **Codex 0.142.3 (app-server)** | Gemini CLI 0.49.0 (hooks) | Generic PowerShell pane |
| --- | --- | --- | --- | --- | --- |
| actively working | **native ×2** — `UserPromptSubmit`/`PreToolUse`, **and** documented in-band `OSC 9;4` | **native** — `UserPromptSubmit`, `PreToolUse` | **native** — `ThreadStatus.active`, `turn/started` | **native** — `BeforeAgent`, `BeforeTool` | **derived** — between `OSC 133;C` and `;D` |
| awaiting human input | **native** — `Notification` matchers `idle_prompt` **and** `permission_prompt` | **partial** — `PermissionRequest` (approval only) | **native** — `activeFlags: waitingOnUserInput` **and** `waitingOnApproval`, plus three outstanding `requestApproval` request types | **partial** — `Notification` `notification_type: "ToolPermission"` | **none** |
| completed / idle | **native** — `Stop` | **partial** — `Stop` fires on finish **or interrupt** | **native** — `ThreadStatus.idle`, `turn/completed` | **native** — `AfterAgent` | **derived** — `OSC 133;D` exit code 0 |
| exited / failed | **native** — `StopFailure` (matchers `rate_limit`, `overloaded`, `authentication_failed`), `SessionEnd` | **partial** — `Stop` conflates; `SessionEnd` presence at runtime **UNVERIFIED** (§ A2 correction) | **native** — `ThreadStatus.systemError`, `thread/closed`, `error` notification | **native** — `SessionEnd` with `reason` | **native** — `OSC 133;D;<exitcode>`, plus `pty-exit` |
| distinguishes *awaiting* from *finished* | **Yes — both idle and permission** | **Yes, for approvals only** | **Yes — both, as explicit state flags** | **Yes, for tool permissions only** | No |
| available without replacing the pane's terminal | Yes | Yes | **No** (§ 6.A5) | Yes | Yes |

#### Correction — the revision-1 exclusivity claim is withdrawn

Revision 1 asserted *"Only Claude Code distinguishes awaiting input from finished"* and repeated it in
the recommendation and handoff. The review's fourth finding was that this was too strong, and it was
right — revision 1's own matrix already scored Codex and Gemini "partial" on that row, so the prose
contradicted the table beneath it. The corrected position:

* **All four evaluated interfaces can distinguish at least some awaiting-input condition from
  completion.** Codex hooks do so via `PermissionRequest`; Gemini hooks via `Notification`
  `notification_type: "ToolPermission"`. Neither is silent on the distinction.
* **Codex's app-server is at least as expressive as Claude's hooks on this axis, and arguably more**:
  `waitingOnUserInput` and `waitingOnApproval` are *state flags* rather than transient events, so the
  app never has to reconstruct "what fired last".
* **What is genuinely distinctive about Claude Code** is narrower and should be stated that way: among
  the three **hook** systems, it appears to be the only one documenting *both* an idle-prompt and a
  permission-prompt distinction — Codex and Gemini hooks document approval-type waits only.
* **"Richest documented hook coverage" is not "exclusive capability."** Revision 1 conflated the two.

**[FACT] Providers still do not expose equivalent signals** — the work order was right to warn against
assuming they would. But the asymmetry is *unevenness in shape and cost*, not a single provider holding
a capability the others lack. Generic PowerShell panes remain the only genuinely silent case.

### 7.2 Common shape

**[FACT]** All three hook systems share the same integration contract: a command is spawned per event,
receives a JSON object on **stdin**, and returns JSON on **stdout**, with exit code 2 as the blocking
convention. All three include `session_id`, `cwd`, `hook_event_name`, and `transcript_path` in the
common payload.

**[INFERENCE]** One small status-reporter executable could serve all three providers, with a
per-provider mapping table from event name to normalised state. The mapping — not the transport — is
where the real work is.

### 7.3 Where hook config would have to live

**[FACT]** User scope is `~/.claude/settings.json`, `~/.codex/config.toml` or `~/.codex/hooks.json`, and
`~/.gemini/settings.json`. Blue Helm already deploys role definitions to user scope via
`scripts/sync-roles.ps1`, so a user-scope deployment path is precedented in this repository.

**[INFERENCE]** User scope is also the *safer* scope: it is the one an untrusted cloned repository
cannot rewrite.

### 7.4 What the app already owns

**[FACT]** Verified in the repository: pane identity and Dockview panel mapping (renderer, with
`paneIsDocked` as the single ownership source of truth); PTY authority (`ptys` map in `app/main.js`);
IPC validation (`app/trusted-ipc-sender.js`, reused by clipboard and library IPC); credential boundary
(`safeStorage`, plus `CLAUDE_CODE_SUBPROCESS_ENV_SCRUB=1` on every PTY); OSC handling
(`registerOscHandler(52, …)`); and output parsing (`pty-parser.js`).

**[FACT] One existing mitigation is directly relevant.** `app/main.js` sets
`CLAUDE_CODE_SUBPROCESS_ENV_SCRUB=1` on **every** PTY specifically so that Claude Code does not forward
the parent environment into the subprocesses it spawns — and the in-code comment names
"PreToolUse/PostToolUse hook commands" among those subprocesses. Blue Helm has therefore *already*
reduced the blast radius of the very hook mechanism this subsystem would use. That is a genuine
head start, and it should not be undone.

### 7.5 Installed-version drift — restated in revision 2 on sounder evidence

Revision 1 built this section on the claim that Codex's `SessionEnd` was "absent from the installed
binary". That claim is **withdrawn** (§ A2), so the section is rebuilt rather than left resting on it.

**What is withdrawn:** the assertion that a documented event was demonstrably missing at runtime. A
zero-token scan cannot show that (§ 0.1).

**What survives, on better evidence:**

1. **[T1] The event surfaces are growing release by release.** Documentation and release notes place
   `UserPromptSubmit` and `PreToolUse`/`PostToolUse` at specific recent Codex versions, and Claude Code's
   documented hook list has expanded to 31 events.
2. **[T2] The installed software itself reports staged, mutable capability.** `codex features list` on
   0.142.3 classifies features across `stable` / `experimental` / `under development` / `removed`, and
   **`removed` entries exist** — capabilities are withdrawn, not only added. `hooks` is `stable true`
   today; `exec_permission_approvals` is `under development false`; `plugin_hooks` is `removed`.
3. **[T2] The app-server is explicitly `[experimental]`**, so its protocol may change shape.

**[T5 — INFERENCE, load-bearing, and unchanged in substance] Drift is real and silent.** A hook that
stops firing produces *no error* — it produces a pane that quietly stops updating, which is worse than a
visible failure. The conclusion revision 1 drew is still correct; only its evidence needed replacing.

**[T5] Revision 2 adds a materially better mitigation than revision 1 had.** Two of the installed
surfaces used in this evaluation are **machine-readable and diffable**:

* `codex features list` — a stable/experimental/removed capability table; and
* `codex app-server generate-json-schema` — the full protocol, generated from the installed binary.

Either can be captured at a known-good version and re-generated after an upgrade, turning drift from
something discovered by a user noticing a stale badge into something detectable by comparison. No
equivalent generated surface was found for Claude Code or Gemini CLI hooks.

**[RECOMMENDATION]** Capability must be **detected and displayed per provider**; a provider whose
expected signals stop arriving must degrade to *unknown*, visibly; and where a provider offers a
generated capability surface, it should be pinned and re-checked on upgrade rather than trusted.

## 8. Threat-model findings

The work order names ten failure cases. Each is assessed against evidence, with the safe direction
being **prefer unknown/refused over a confidently false status**.

| # | Threat | Assessment | Evidence-backed mitigation direction |
| --- | --- | --- | --- |
| 1 | Agent output prints text resembling a completion marker | **Real and easy.** Any in-band scheme (OSC 133, a custom OSC, a sentinel string) can be forged by the agent simply printing it — and agents routinely print terminal escape sequences while discussing them. **Corrected in revision 2:** Claude Code's `terminalSequence` is *not* an arbitrary-sequence primitive — it is an allowlist (OSC 0/1/2/9/99/777 and BEL; everything else, including OSC 52, is rejected and the field ignored) and it is **documented to work on Windows**. But OSC `9` is on that allowlist and the docs name `9;4` progress explicitly, so a hook — including a project-scoped one that runs without per-hook approval — can legitimately emit the exact sequence § 6.B3 would read as *working*. | Treat all in-band terminal data as untrusted. Prefer an **out-of-band** channel (hook → app, or a structured protocol such as § 6.A5) that pane content cannot write to. If any in-band marker is ever used, it must carry a per-pane secret the app generated and never echoed into the PTY — note that an OSC 9;4 progress value cannot carry such a secret, which is why it can corroborate but never decide. |
| 2 | Untrusted repository content causes a fake "awaiting input" signal | **Real, and provider-dependent.** Claude Code executes project `.claude/settings.json` hooks with no per-hook approval and picks up edits at runtime via a file watcher. Gemini fingerprints project hooks and warns on change. Codex hashes and requires explicit `/hooks` trust, and additionally **ignores `notify` in project config entirely**. Blue Helm clones and runs untrusted repositories in worktrees as its core function, so this is squarely in scope. | Install status hooks at **user scope only**. Never derive status from project-scoped configuration. Ignore any status report that does not authenticate as the app's own reporter for that specific pane. |
| 3 | Provider output format changes after an update | **Already happening** — see § 7.5, Codex `SessionEnd`. | Per-provider capability detection with a visible *unknown* state; a heartbeat/liveness expectation so "events stopped arriving" is distinguishable from "nothing is happening"; pin observed behaviour per installed version. |
| 4 | A hook or plugin receives secrets or full prompt/output content unnecessarily | **Real and confirmed by schema.** All three providers hand hooks `transcript_path`; Claude and Codex hand `Stop` the `last_assistant_message`; all three hand prompt text to the submit/pre-agent event; tool events carry `tool_input`, which the Claude documentation itself notes may contain passwords or API keys. | A status reporter must consume **only** `hook_event_name`, `session_id`, and a pane token — and must never read, forward, or log `prompt`, `last_assistant_message`, `tool_input`, `tool_response`, or open `transcript_path`. This is enforceable by construction, and it should be enforced by test. Keep `CLAUDE_CODE_SUBPROCESS_ENV_SCRUB=1`. |
| 5 | A pane is marked finished while its process is still doing paid or destructive work | **Real, and the most damaging.** `Stop` means "the model's turn ended", not "all work is done": a hook can itself be long-running, a background Bash task can outlive the turn, and Codex's `Stop` explicitly also fires on *interrupt*. Blue Helm runs paid Video Scout work, so a false "finished" can mask billable activity. | Never let a single turn-end event mean "safe to walk away". Corroborate with process-tree liveness (§ C2/C7) before showing a terminal-looking state, and treat *completed* as the state most in need of confirmation. |
| 6 | A child process remains active after the top-level CLI becomes quiet | **Structurally guaranteed here, not merely possible.** Every pane is `powershell.exe … -NoExit`, so the shell always outlives the agent, and the agent is a grandchild. Video Scout additionally spawns `yt-dlp`, `ffmpeg`, and Node children. | Status must be derived from the *agent*, not the PTY child. Process-tree checks must walk descendants. `pty-exit` may set *exited* but must never set *completed*. |
| 7 | The provider becomes unavailable or stops emitting structured events | **Real.** A hung provider produces silence, which is indistinguishable from "working" unless something expects liveness. | Bounded staleness: after a provider-specific timeout with no event, fall back to *unknown*, not to a guess. Show the last-known state's age rather than presenting it as current. |
| 8 | A generic PTY cannot be classified reliably | **Confirmed by the matrix.** A plain PowerShell pane has no notion of "awaiting input" that the app can observe without shell integration, and even with OSC 133 the distinction between "at a prompt" and "a program is waiting for stdin" is not expressed. | Declare generic panes **unsupported for intent states** and support only exited/running for them. Do not paper over the gap with output heuristics. |
| 9 | Notifications expose prompt, source, path, customer, or credential content | **Real**, and the repository already has the correct precedent: Logs are metadata-only, and the Library boundary is path-free. | Status payloads and any notification must be bounded enum + pane label only. No paths, prompts, output fragments, worktree names, or customer identifiers. This matches the existing content-free-reason discipline used by the Dockview layout store. |
| 10 | Status from one pane is applied to another after Dockview movement or restoration | **Real and newly relevant** — Dockview reparents pane elements and `fromJSON` rebuilds panels. | Bind status to the **app's own pane ID** (the identity `paneIsDocked` and the PTY map already use), never to a DOM position, tab index, group, or Dockview panel ordinal. The Dockview work already established that pane elements are reparented rather than recreated, so a pane-ID-keyed map survives layout changes; a position-keyed one would not. |

### 8.1 The single most important structural conclusion

**[INFERENCE — load-bearing]** Threats 1 and 2 together rule out any design where the **status signal
travels through the same channel as the agent's visible output**. The terminal stream is written by
untrusted content and is forgeable by design. Threats 4 and 9 rule out any design where the status
reporter is handed conversation content. Threats 5 and 6 rule out any design where a single turn-end
event is treated as authoritative for "finished".

Those three constraints, taken together, point at one shape — an out-of-band, content-free,
pane-token-authenticated report from a user-scope hook, corroborated for terminal states and degrading
visibly to *unknown*. That is a **description of the constraint set**, not a specification, and it is
recorded here as evidence for Blue's decision rather than as a design to build.

## 9. Adoption-versus-build estimate

### 9.1 What is genuinely available to adopt

**[FACT]** The three hook systems are official interfaces, not packages: adopting them adds **no
dependency, no licence obligation, no transitive closure, no telemetry surface, and no native code**.
The cost is configuration plus a mapping table, and the risk is version drift (§ 7.5).

**[FACT]** For the library slice, the only maintained, non-native, dependency-free candidate is
`pidtree` — whose entire Windows implementation on this machine reduces to one `Get-CimInstance`
command (§ C2, § C7).

### 9.2 Honest effort comparison

| Slice | Adopt | Build owned | Assessment |
| --- | --- | --- | --- |
| Event transport (hook → app) | Nothing to adopt — no OSS package provides this for a sandboxed Electron app | Small owned local endpoint + tiny reporter executable | **Build is the only option.** No candidate exists. |
| Structured status for Codex | **Codex app-server** (Apache-2.0, official, richest semantics), with the real TUI attached via `codex --remote` | Hook reporter, as for the other providers | **Adopt wins on semantics; the cost is launch complexity, cadence-bound freshness if polling (U5a), and an undocumented push/approval-routing story (U5b)** — not terminal replacement (corrected in § 6.A5). See § 10.2. |
| Provider event → state mapping | Nothing to adopt — mappings are product-specific and changing | Small owned table, one per provider, version-pinned | **Build is the only option**, and it must be maintained. |
| Process-tree corroboration | `pidtree` (MIT, 0 deps) | One `Get-CimInstance` call | Near-equivalent. `pidtree` buys cross-platform correctness the project does not need; direct call avoids a dependency. **Genuinely close; either is defensible.** |
| OSC 133 parsing for shell panes | No library needed | `registerOscHandler(133, …)` — the app already calls this API for OSC 52 | **Build, trivially.** Adopting anything here would be worse than the one-line owned version. |
| Status normalisation, refusal, display | Nothing to adopt | Owned | **Build.** This is exactly the authority `AGENTS.md` requires Blue Helm to keep. |

**[INFERENCE]** The adopt-versus-build question resolves unusually cleanly: the *signals* should be
adopted wholesale (they are official and free), and the *subsystem* is owned code, because no candidate
exists that could own it without violating the owned-boundary rules.

### 9.3 Recurring cost, stated honestly

**[FACT + INFERENCE]** Because provider event sets change between releases (§ 7.5), this subsystem
carries **ongoing maintenance** that a layout engine does not. Each provider upgrade is a potential
silent regression. Any verdict should be made with that recurring cost visible, and the mitigation is
the same either way: capability detection plus a visible *unknown* state, so drift degrades loudly.

## 10. Source-Scout recommendation

**[RECOMMENDATION — not a verdict, and not a specification.]**

### 10.0 Outcome of re-deriving in revision 3, as corrected in revision 4

Revision 2's conclusion rested on a **false premise** — that app-server adoption necessarily replaces
the Codex terminal (§ 6.A5 correction). That premise is removed and the reasoning re-run from the
candidate set upward. Stated explicitly:

> **The headline recommendation SURVIVES — hooks first, subsystem owned — but its basis has changed
> materially and its confidence is lower.** Revision 2 called the hooks-versus-app-server question
> *decisive*. It is not. With the real topology established, **app-server is a genuinely open upgrade
> path for Codex that preserves the real TUI**, and it loses to hooks today on **cost, provider
> coverage, transport stability, security surface, the freshness tradeoff that polling imposes, and the
> absence of evidence for push observation** — not on capability, and no longer on a claimed
> impossibility.

**What changed in the reasoning in revision 3:**

* **Deleted:** "app-server cannot observe a PTY session, therefore it replaces the terminal, therefore
  hooks win decisively." Both the premise and the word *decisively* are withdrawn.
* **Added:** app-server + `codex --remote` is an **officially documented topology that keeps the genuine
  TUI in the pane**. The trade is now launch complexity, a new failure dependency, experimental
  transport, and credential authority — all real, none disqualifying.

**What revision 4 corrects on top of that.** No new research was conducted; two reasoning defects in
revision 3's presentation were fixed, and neither restores the deleted premise:

* **The topology set was incoherent.** Revision 3 listed four topologies, one of which had Blue Helm
  driving the app-server thread *while* the real remote TUI remained the driving UI. Those cannot both be
  true. § 10.2 is rebuilt around **exactly three** topologies — **A** (existing PTY + hooks), **B**
  (Blue Helm drives, Blue Helm renders — the native/replacement case), and **C** (real remote TUI drives,
  Blue Helm observes) — and B and C are now stated to be mutually exclusive.
* **The open question was over-broad.** Revision 3's single U5 bundled a **documented** read path with an
  **undocumented** push path and attached approval-routing uncertainty to both. It is split into **U5a**
  (documented `thread/loaded/list` + `thread/read` polling, runtime characteristics unmeasured) and
  **U5b** (undocumented passive push subscription and approval routing). See § 6.A5.
* **Consequently, "app-server observation for Codex is unverified" was too strong.** Observation via
  **polling is documented today**; what is unverified is whether it is *fast, cheap and fresh enough*,
  and whether *push* is obtainable at all. The recommendation below is re-stated on that corrected basis.

The two amendments from revision 2 stand:

* **Amendment 1 — provider-specific, not lowest-common-denominator** (§ 10.4).
* **Amendment 2 — the asymmetry claim is narrowed** (§ 7.1): every evaluated interface distinguishes
  *some* awaiting-input condition from completion. Claude Code has the richest documented **hook**
  coverage; it does not hold an exclusive capability.

### 10.1 The surviving recommendation

Treat the **official provider hook systems as the primary signal source, and build the subsystem itself
as owned code**, because:

1. All three providers ship a hook system present in the installed versions — and for Codex this is now
   T2 evidence (`codex features list` → `hooks stable true`), not token counting (§ A2).
2. Adopting them costs **zero dependencies** — no licence, no transitive closure, no native build, no
   telemetry (§ 9.1).
3. No third-party candidate can own the subsystem without receiving pane identity, IPC authority, or
   conversation content — and independently of that, **none is adoptable**: the two most capable
   orchestrators are excluded by licence (AGPL-3.0, Commons Clause), the closest mechanism match has no
   licence at all, and the closest architectural match (`wmux`, MIT, Windows-native) is a competing
   application rather than a library (§ 6.E).
4. The one library slice with a real candidate (`pidtree`) is nearly equivalent to a single owned
   PowerShell call on this machine (§ 9.2).
5. `@xterm/addon-progress` (official, MIT, same project as the vendored xterm) remains worth taking for
   Claude panes — but strictly as **corroboration**, because § 6.B3's correction shows OSC 9;4 is
   documented for Claude and *unverified* elsewhere, and threat 1's correction shows an allowed
   `terminalSequence` hook output can forge exactly that sequence.

### 10.2 The corrected comparison — exactly three topologies

Revision 2 compared "hooks" against a strawman "app-server that replaces the terminal". Revision 3
replaced that with four options, but one of the four was **internally impossible**: it had Blue Helm
driving the app-server thread while simultaneously keeping the real remote TUI as the driving UI. A
thread has one driver. That entry is **deleted**, not renamed.

The honest option set is three. Topology labels are letters because **T1–T5 in this record are evidence
tiers** (§ 0.1) and must not be confused with topologies.

> **Topologies B and C are mutually exclusive with respect to who drives the thread. If Blue Helm drives
> and renders, it is topology B. If the real remote TUI drives and Blue Helm observes, it is topology C.
> They must not be recombined into a hybrid.**

**A · Existing PTY + hooks (today's pane).** The pane launches the provider CLI directly. The real
CLI/TUI drives the session. Hooks supply status. **No app-server process and no new transport dependency
exists.** This is the only option that covers all three providers.

**B · Blue Helm as app-server client, owning the UI.** Blue Helm drives the app-server thread and renders
the interface itself. This is the **native/replacement** case: the existing Codex TUI is *not* the
driving UI. It yields structured app-server status directly and needs no observation trick — but it is a
**materially larger product and architecture change**, because Blue Helm must then build and maintain a
Codex front-end.

**C · App-server + real remote TUI + Blue Helm observer.** The real remote Codex TUI drives the
interaction and stays in the pane; Blue Helm connects as a **second client** purely to read status. This
is **the only topology that combines a genuine remote TUI with Blue Helm app-server observation.** Its
two variants carry different evidence and different risk — see § 10.2.1.

| Axis | **A · PTY + hooks** | **B · Blue Helm drives, Blue Helm renders** | **C · Remote TUI drives, Blue Helm observes** |
| --- | --- | --- | --- |
| Who drives the thread | The provider CLI in the pane | **Blue Helm** | **The remote TUI** |
| Who renders the UI | The real CLI/TUI | **Blue Helm (must be built)** | The real TUI |
| Status semantics | Events reassembled into state | **State union** incl. `waitingOnUserInput` / `waitingOnApproval` | Same state union, obtained by reading: **poll — documented (U5a)**; **push — undocumented (U5b)** |
| Freshness | Event-time | Event-time | **poll:** bounded by cadence, unmeasured · **push:** event-time *if* U5b works |
| Approval semantics | `PermissionRequest` event | **Outstanding JSON-RPC request** — structurally true, and Blue Helm is the answering client | Approval *state* is readable (U5a); **routing of approval requests is undocumented (U5b)** |
| Pane/thread binding | `session_id` correlated by the app | Explicit `threadId` | Explicit `threadId` |
| Forgeability | Out-of-band | Out-of-band | Out-of-band |
| Version drift | Silent until a hook stops firing | **Diffable** — schema generated from the binary | Diffable |
| Security surface | One event payload | Full protocol: fs, process, thread mutation, config | Same protocol, plus a second connection; read-only scoping is **discipline, not enforcement** |
| Credential authority | None | **Inside the auth boundary** (`account/login`, token refresh) | Same |
| Stability | `hooks` = `stable` (installed) | `app-server` `[experimental]`; **WebSocket documented experimental and unsupported for production** | Same |
| Provider coverage | **All three** | Codex | Codex |
| **Real terminal UI preserved** | **Yes** | **No — replaced by Blue Helm's own UI** | **Yes** — `codex --remote`, documented topology |
| Launch complexity | None — spawn the CLI | Own a server process, transport, lifetime, token, reconnection | Same, **plus** a second client |
| Windows behaviour | Native | Native; loopback `ws://127.0.0.1` or `unix://` | Same |
| Failure / reconnection | Pane has **no external dependency** | Server death breaks the pane — **a new single point of failure** | Same |
| Product scope | Reporter only | **Largest** — a Codex front-end | Reporter + client; UI unchanged |

**[T5 — the corrected deciding reasoning]** No single row decides this.

* **B is coherent and capable**, and it needs no observation question answered at all — but it buys that
  by making Blue Helm the Codex UI. That is a product decision far larger than a pane-status indicator,
  and it is out of scope for this subsystem as scoped in § 1.
* **C is the only way to get app-server-quality status while the pane keeps a real TUI nobody has to
  reimplement.** Its polling variant is **documented and available today**; its push variant is not.
* **A costs nothing beyond a reporter**, works today, covers all three providers, and rests on a feature
  the installed binary reports as `stable`.

So the hooks-first headline holds **on cost, provider coverage, transport stability, security surface,
the polling tradeoffs C would impose, and the absence of U5b evidence** — *not* because app-server is
incapable, *not* because it must replace anything, and *not* on the strength of the deleted hybrid.

### 10.2.1 Topology C's two variants, and exactly what each changes

Stated plainly, because uncertainty must not be silently converted into a negative — and, after
revision 3's error, because certainty must not be silently converted into uncertainty either:

**C-poll — available today, on documented interfaces.** `thread/loaded/list` + `thread/read` give a
second client the thread's runtime status **without resuming or driving it** (U5a, § 6.A5). Nothing about
this variant is undocumented. It is not blocked on an experiment to establish that it *exists*.

What C-poll costs, and why it does not displace hooks on its own:

* **Freshness is bounded by cadence**, so a pane can display a stale state between polls — the opposite
  of what an indicator is for. Hooks and push are event-time; polling is not.
* **Cadence, per-poll cost, load behaviour, reconnection, and what happens when the server unloads an
  idle thread are unmeasured.** Existence is documented; *suitability* is not established.
* **It still requires the whole topology** — an owned app-server process, its transport and lifetime, a
  token if used, and a second client inside Codex's credential boundary — for one provider. Every
  non-status cost in the § 10.2 table applies in full.
* **A read-only posture is discipline, not enforcement.** The same connection can write files, spawn
  processes, mutate threads, and drive login.

**C-push — would be materially better, and is undocumented.** If a second client could subscribe to
`thread/status/changed` for a TUI-driven thread without `thread/resume`, topology C would deliver
event-time status with explicit `threadId` binding while the pane keeps the genuine TUI — the strongest
combination anywhere in this record. But no `thread/subscribe` exists in the installed closed
enumeration, and **approval-request routing between the TUI and an observer is undocumented** (U5b).

**Consequences, stated per outcome:**

* **If U5b resolves positive** — passive push without `thread/resume`, without disturbing the TUI, and
  without capturing approval routing — then **topology C likely becomes the recommended Codex source**,
  and the § 10.2 costs become a considered trade rather than a deterrent. Hooks remain the fallback and
  the path for the other two providers.
* **If U5b resolves negative** — push requires driving the thread, or approvals are diverted from the
  TUI — then **hooks remain correct for Codex**, with **C-poll available as a documented secondary
  source** for panes where explicit `threadId` binding is worth the topology. This case is *not* "no
  app-server option"; that is precisely the overstatement revision 4 removes.
* **Independently of U5b**, C-poll's *production suitability* stays open until measured.

Nowhere is it recorded that app-server cannot observe. What is recorded: **polling is documented and
unmeasured; push and approval routing are undocumented.**

### 10.3 The conditions under which this flips

Two distinct conditions, where revision 2 recorded only the second:

1. **U5b resolves positive** (§ 10.2.1) — topology C becomes the likely Codex source with no change to
   the pane's UX. This is the *near* condition and is answerable by a bounded experiment. A weaker
   partial flip also exists: if **C-poll is measured and proves cheap and fresh enough**, it can serve as
   a documented secondary Codex source without U5b being settled at all.
2. **Blue wants a native Codex surface** — a headless/background mode, remote control, or an in-app
   approval UI. That is **topology B**, it is a product decision rather than a status decision, and if
   Blue takes it then app-server is the right foundation regardless of U5a or U5b — and this
   recommendation should be re-derived from scratch.

### 10.4 Provider-specific, not lowest-common-denominator

**[RECOMMENDATION]** Do not force one uniform mechanism. The evidence points to per-provider sourcing
behind one normalised internal state:

| Pane type | Primary | Corroboration | Honest floor |
| --- | --- | --- | --- |
| Claude Code | hooks (`Notification` idle/permission, `Stop`, `StopFailure`) | OSC 9;4 progress | *unknown* |
| Codex | hooks (`PermissionRequest`, `Stop`) **today** | process-tree liveness | *unknown*. Upgrade path: **topology C** — `thread/read` polling is documented and available now (U5a) but unmeasured and cadence-bound; push becomes preferable if **U5b** resolves positive. The real TUI is preserved either way (§ 10.2.1) |
| Gemini | hooks (`Notification` ToolPermission, `AfterAgent`, `SessionEnd`) | process-tree liveness | *unknown* |
| PowerShell | `OSC 133;D` exit code, `pty-exit` | — | running/exited only; **no intent states** |

The normalisation layer, refusal policy, and display stay owned and identical across providers. Only
the *sources* differ. This is what "honest but asymmetric" should mean concretely.

### 10.5 Fallback when a provider signal is unavailable

**[RECOMMENDATION]** One rule, applied identically everywhere: **degrade to *unknown*, visibly, and show
the age of the last known state.** Never infer *completed* from silence (threats 5–7). Output
classification (§ D1) may only ever produce an explicitly low-confidence label, never a terminal state.

### 10.6 What still tempers any decision

* **Cross-provider capability is uneven** — in shape and integration cost, though not, as revision 1
  wrongly said, because one provider uniquely distinguishes waiting from finished (§ 7.1).
* **The surfaces drift**, including by *removal* (§ 7.5) — this subsystem needs maintenance at every
  provider upgrade.
* **No runtime behaviour was observed at all** (§ 11.2). Every signal in the recommended path is
  documented or schema-level; none has been seen to fire on Blue's machine.

**[RECOMMENDATION]** If Blue wants to reduce risk before committing, the highest-value bounded
experiment is described in § 11.1. It is described only; it is **not** authorized, and nothing in this
record authorizes it.

## 11. Questions Blue must decide

1. **Scope of honesty.** Is an asymmetric indicator acceptable — full states for Claude Code, approval
   only for Codex/Gemini, running/exited only for shell panes — or must all providers reach parity
   before anything ships? Parity is not achievable from provider signals today.
2. **Fallback policy.** When no trustworthy signal exists, should the pane show *unknown*, show nothing
   at all, or fall back to bounded output classification (§ D1) clearly labelled low-confidence?
   Source-Scout's evidence favours the first two.
3. **Hook installation scope and consent.** Status hooks would be written to user-scope provider config
   (`~/.claude/settings.json`, `~/.codex/`, `~/.gemini/settings.json`) — **files outside this
   repository, shared with Blue's non-Blue-Helm CLI usage**. Does Blue accept the app writing there at
   all, and if so, must it be opt-in, reversible, and visible?
4. **Blast radius of a fifth provider surface.** Adding hooks means provider CLIs spawn an extra process
   per event. Gemini runs hooks **synchronously inside the agent loop**, so a hung reporter stalls the
   agent. Is that acceptable, and what timeout is?
5. **Maintenance appetite.** Given § 7.5, is Blue willing to own a subsystem that needs re-verification
   at each provider upgrade — and should the app refuse to display status for a provider version it has
   not been verified against?
6. **The two dependency questions, which are separable.**
   (a) *Process tree:* `pidtree` (MIT, zero deps, maintained) versus one owned `Get-CimInstance` call —
   a genuine coin-flip, and Blue's dependency-minimalism has usually favoured owned.
   (b) *Progress parsing:* adopt `@xterm/addon-progress` (MIT, official, same project as the vendored
   xterm) versus one owned `registerOscHandler(9, …)` beside the existing OSC 52 handler. The addon
   brings tested clamping and strict parsing; the owned version brings no new package. Both are
   defensible; they are not the same decision as (a).
7. **Codex app-server — corrected in revision 3, sharpened in revision 4.** It has the best status
   semantics, the best pane binding, and the only diffable drift surface of anything evaluated — **and,
   contrary to revision 2, it does not require replacing the Codex terminal**: `codex --remote` attaches
   the real TUI to an app-server in an officially documented topology (§ 6.A5). What it does cost is a
   server process to own, an experimental/unsupported WebSocket transport, a client inside Codex's
   credential boundary, and a new single point of failure for a pane that currently has none. Blue is
   choosing between **three** topologies (§ 10.2), and B and C are mutually exclusive:
   (a) **A** — hooks now, app-server never;
   (b) **C-poll** — keep the real TUI and read status with documented `thread/read` polling, accepting
   cadence-bound freshness and the full topology cost for one provider;
   (c) **C-push** — the same but event-time, which first requires settling **U5b** by experiment;
   (d) **B** — Blue Helm drives and renders a native Codex surface, which is a product decision, not a
   status decision.
   This record leans to (a) now, with (c) as the upgrade worth measuring — but that requires authorizing
   the § 11.1 experiment, which **this record does not do**.
8. **Which verdict term applies.** The five allowed terms are ADOPT, FORK, PROTOTYPE, PATTERN-MINE, and
   BUILD FRESH. Note that the thing being adopted here is a set of **official interfaces**, not an OSS
   package, which does not map cleanly onto ADOPT as used in the Dockview record. Blue may wish to state
   explicitly which term covers "consume official provider interfaces, own the subsystem".

### 11.1 Proposed bounded experiment — described only, NOT authorized

Recorded because the work order requires that a suggested prototype be documented and then stopped.
**This requires an explicit later `PROTOTYPE` verdict from Blue before any of it may be built.**

**Experiment A — hook reporter (unchanged).** Install a user-scope hook for **one** provider that reports
only `hook_event_name` plus an app-generated pane token to a local endpoint; display the result on
**one** pane; verify that no prompt, output, path, or transcript content ever reaches the app; verify
behaviour when the provider is upgraded; and measure the added per-event latency, including Gemini's
synchronous in-loop execution. Kill criteria: any conversation content reaching the app, any status
attributable to the wrong pane after a Dockview move, any measurable agent stall.

**Experiment B — settle U5b and measure U5a (added in revision 3, narrowed in revision 4).** Revision 3
scoped this experiment to prove that a second client could read a TUI-driven thread at all. **That scope
was wrong: `thread/loaded/list` and `thread/read` are documented (U5a), and no experiment is needed to
establish that they exist.** The experiment is therefore narrowed to what documentation does *not*
answer:

* **U5b — push and routing (the undocumented part).** Whether any subscription to
  `thread/status/changed` is obtainable **without** `thread/resume`; whether `thread/resume` from a
  second client takes over, duplicates, or reconfigures a thread the TUI is driving; and **which client
  receives `item/*/requestApproval`** when a TUI and an observer are both connected.
* **U5a — runtime characteristics only (not existence).** Measure what documentation cannot state:
  usable polling cadence, per-poll cost against a live thread, staleness actually displayed at that
  cadence, behaviour across reconnection, and what a poller sees when the server unloads an idle thread
  after its no-subscriber grace period.

Method: start `codex app-server --listen ws://127.0.0.1:<port>` on **loopback only**; attach one real TUI
with `codex --remote`; connect a second, read-only client. Kill criteria: the TUI's interaction is
disturbed in any way, an approval is routed away from the TUI, or the thread is duplicated. Constraints:
loopback only, never a non-loopback listener; no token in a persistent Windows user environment variable
and **no `setx`**; server started and stopped within the experiment; a disposable throwaway working
directory.

**Neither experiment is authorized.** Both are described so that a later `PROTOTYPE` verdict has
something concrete to authorize. Experiment B in particular requires launching an app-server and a real
Codex session — explicitly outside the scope of this and every previous revision of this branch.

### 11.2 Claims that remain UNVERIFIED — consolidated (revision 2, U5 split in revision 4)

**No T4 (runtime-observed) evidence exists anywhere in this record.** No model turn was launched, by
design. Everything below is assigned to a later separately authorized experiment and must not be relied
on as settled — **with one distinction added in revision 4: an entry may be unverified as to its runtime
behaviour while its interface is documented.** U5a is exactly that case, and conflating the two is the
error this revision corrects. Where a row's *existence* is documented, the row says so explicitly.

| # | Unverified claim | Current best evidence | How it would be settled |
| --- | --- | --- | --- |
| U1 | Whether Codex 0.142.3 emits a `SessionEnd` hook event at runtime | T1 docs list it; T3 token scan found 0 — which proves nothing (§ 0.1) | Installed-version hook schema, if one is ever exposed, or a runtime experiment |
| U2 | Whether Codex or Gemini ever emit `OSC 9;4` | No documented support found; T3 token scan found 0 in each | Runtime observation with a terminal that logs OSC 9 |
| U3 | Whether Claude Code actually emits `OSC 9;4` on Blue's machine when `terminalProgressBarEnabled` is set | T1 docs + issue #57366 + T3 tokens — strong, but still not observed | Runtime observation |
| U4 | Whether Claude Code's `Notification` hook fires reliably on this Windows 11 build | T1 docs; issues #56936 and #8320 are **closed** but were real Windows/idle defects (§ 6.E) | Runtime observation |
| U5a **(split out in revision 4)** | **Not whether polling exists — it is documented.** Only whether it is *usable in production*: polling cadence, per-poll cost, displayed staleness, reconnection behaviour, and what a poller sees when the server unloads an idle thread | **The interface is documented**: `thread/loaded/list` lists loaded threads, `thread/read` reads one without resuming it, and the returned thread object carries runtime status (§ 6.A5). What is missing is **measurement**, not documentation | Measurement against a live loopback app-server — not a discovery experiment |
| U5b **(split out in revision 4)** | Whether a **second** client can acquire **push** (`thread/status/changed`) for a thread driven by a remote Codex TUI **without** `thread/resume` — **and whether approval requests route to the TUI, the observer, one subscriber, or several** | **Undocumented.** `ClientRequest` (closed enumeration) contains `thread/unsubscribe` and **no `thread/subscribe`**; `thread/resume` is a configuring call with no read-only flag; approval routing is not described anywhere consulted. Per-connection subscription and the documented "last subscriber" / no-subscriber unload grace period make it **plausible, not established** | A bounded runtime experiment with a loopback listener, one remote TUI, and one observer client (§ 11.1 Experiment B) |
| U6 | Per-event latency added by any hook, and whether Gemini's synchronous in-loop hook execution stalls the agent | T1 documentation states hooks run synchronously in Gemini's loop | Measurement under a real session |
| U7 | Whether any provider's hook payload can be reduced, in practice, to metadata only without losing the signal | Schemas show the fields; a reporter's ability to ignore them is a design claim | Bounded experiment (§ 11.1) |

**[T5]** **U5b** carries the weight revision 2's false premise used to carry; its resolution is the
single largest open input to the Codex half of the recommendation — see § 10.2.1 for exactly what each
outcome would change. The record does **not** claim push observation is impossible; it records that no
source consulted establishes that it works. **U5a is a different kind of entry and is listed here only
for its unmeasured runtime characteristics** — the polling interface itself is documented, and revision
4 exists in part because revision 3 filed it under "unverified" alongside U5b.

## 12. Authorization state

**BLUE SUBSYSTEM VERDICT: NOT YET ISSUED — IMPLEMENTATION REMAINS UNAUTHORIZED**

That line is an authorization-state statement, not a sixth verdict term. The five allowed final
subsystem verdicts remain **ADOPT · FORK · PROTOTYPE · PATTERN-MINE · BUILD FRESH**, and only Blue
issues one. The candidate dispositions in §§ 5–6 are the separate, lower level and are not a verdict.
`REJECT` appears nowhere in this record as a final verdict.

No specification, architecture commitment, dependency installation, prototype, implementation, merge,
or push has occurred on this branch.
