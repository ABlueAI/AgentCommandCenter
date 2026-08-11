# Prototype Evidence — Experiment A: Claude Code Hook Reporter (pane status)

Subsystem: **Cross-provider pane-status indicators (roadmap item R4)**
Tracked OSS procurement record: **`docs/OSS-PROCUREMENT-pane-status.md`**
Blue's verdict, verbatim:

> BLUE SUBSYSTEM VERDICT: PROTOTYPE

That authorizes **bounded Experiment A only**. Production pane-status specification and
implementation, **Experiment B**, all app-server runtime testing, merge and push remain
**unauthorized**. Nothing in this document is a production specification, and the choices recorded
here are experiment choices, not production decisions.

Branch: `feature/pane-status-prototype-a-claude`
Base `main`: `3ff96bdea3e68a83cd5774c9b94b68d9cb292add`
Experiment date: **2026-08-11**

---

## 1. What was built

One gated prototype path, Claude Code only, one pane only.

| Component | File | Role |
| --- | --- | --- |
| Wire contract | `app/prototype-pane-status/pane-status-protocol.js` | Exact-key message shape, event allowlist, state mapping, staleness, version gate |
| Main authority | `app/prototype-pane-status/pane-status-store.js` | Token minting, single-pane enrolment, constant-time token compare, state |
| Transport | `app/prototype-pane-status/pane-status-server.js` | Main-owned **Windows named pipe**, bounded framing |
| Hook reporter | `app/prototype-pane-status/pane-status-reporter.js` | The child Claude spawns; reads `hook_event_name` and nothing else |
| Settings guard | `app/prototype-pane-status/pane-status-settings.js` | Backup / patch / prove-restore. **Not imported by the app** |
| Orchestrator | `app/prototype-pane-status/pane-status-prototype.js` | The one thing `main.js` touches; returns an **inert object** when the gate is off |
| Badge | `app/renderer/pane-status-badge.js` | Pane-id-keyed indicator, visibly labelled `PROTOTYPE` |
| Experiment runner | `app/prototype-pane-status/run-experiment-a.js`, `live-probe.js` | Builder-operated; not part of the application |

**The gate:** `BLUE_HELM_PANE_STATUS_PROTOTYPE=1`, compared with `===` against the exact string `'1'`.

---

## 2. Observed Claude version

**`2.1.196 (Claude Code)`** — read from `%APPDATA%\npm\claude.cmd --version` at experiment time and
pinned in `SUPPORTED_CLAUDE_VERSIONS`. Any other version degrades every pane to `unknown` with reason
`version-mismatch`; the check is an **exact match against a pinned list**, not a semver range, because
§ 7.5 of the procurement record records that provider surfaces drift by **removal** as well as
addition.

---

## 3. Events observed live versus synthetic-only

| Event | Live? | Displayed state | Evidence |
| --- | --- | --- | --- |
| `SessionStart` | **LIVE** | `idle` | Turn 1, accepted |
| `UserPromptSubmit` | **LIVE** | `working` | Turn 1, accepted |
| `Stop` | **LIVE** | `turn ended` | Turn 1, accepted |
| `SessionEnd` | **LIVE** | `exited` | Turn 1, accepted |
| `Notification` | **UNVERIFIED — synthetic only** | `attention` | See § 3.1 |
| `StopFailure` | **UNVERIFIED — synthetic only** | `failed` | See § 3.2 |

Live run: **4 events accepted, 0 refused, 4 connections, 0 dropped.**

### 3.1 Why `Notification` is unverified

`Notification` fires on a permission prompt or an idle prompt. Producing one requires an **interactive**
session that actually stops and asks. The probe ran `claude -p` (print mode), where a permission
request is resolved by policy rather than by prompting, and I have no way to drive the Electron GUI or
an interactive TTY from here. The only ways to force one would have been to relax Claude's permission
configuration or to script a fake prompt — the first is explicitly forbidden ("without weakening Claude
permissions"), the second would prove nothing about the real signal.

**Recorded as unverified. Not recorded as unavailable, and not forced.** Synthetic coverage exists:
the reporter forwards a `Notification` payload correctly and the store maps it to `attention`
(`pane-status-reporter.test.js`, `pane-status-boundary.test.js`).

### 3.2 Why `StopFailure` is unverified

The work order forbids manufacturing it: "Do not attempt to manufacture `StopFailure` by causing an
account, service, or authentication fault." I did not. Synthetic coverage only.

---

## 4. Latency measurements and method

**Method.** The probe records `Date.now()` when a pipe connection is accepted and again when the
message has been parsed, validated, applied to the store, and the renderer view produced. The
difference is the in-process delivery cost. Turn wall-clock is measured around the whole
`claude -p` child.

| Measurement | Value |
| --- | --- |
| Delivery latency (connection accepted → renderer view ready) | **min 1 ms · median 1 ms · max 1 ms** (n = 4) |
| Reporter child wall-clock, isolated (synthetic harness, real child + real pipe) | **~60–90 ms**, dominated by Node process startup |
| Reporter child on an unreachable pipe (fail-fast path) | **69 ms** |
| Claude turn wall-clock, prototype pane (turn 1) | ~8 s |
| Claude turn wall-clock, no-prototype control (turn 2) | 8,195 ms |

**Honest limits of these numbers.** n = 4 delivery samples from one session. The 1 ms figures measure
the transport and validation only — they do **not** include Node's startup cost for the hook child,
which is the dominant term and is paid once per event. No stall, hang, or visible delay was observed in
either turn, but two turns is not a latency study.

---

## 5. The decisive environment finding

**`CLAUDE_CODE_SUBPROCESS_ENV_SCRUB=1` did NOT prevent the hook reporter from inheriting the two
prototype variables.** The probe set the scrub exactly as `app/main.js` does, unweakened, and the
reporter still received `BLUE_HELM_PANE_STATUS_PIPE` and `BLUE_HELM_PANE_STATUS_TOKEN`
(`scrubBlockedTransport: false`; 4 messages delivered).

This matters in two directions, and both are recorded rather than resolved:

* **For the experiment:** the blocked-experiment condition the work order anticipated **did not
  occur**. The transport works.
* **As a question for Blue, flagged and deliberately not answered here:** `app/main.js` comments state
  that this flag stops Claude Code forwarding the parent environment into subprocesses it spawns,
  "Bash tool calls, PreToolUse/PostToolUse hook commands, and MCP servers" included. The observation
  above is inconsistent with that description **for hook commands**. The official settings
  documentation does not list `CLAUDE_CODE_SUBPROCESS_ENV_SCRUB` at all, and the hooks documentation
  states that "A hook process inherits the parent environment" with exactly one documented exclusion
  (`OTEL_*` exporter variables).

  **What I observed is narrow and I will not widen it:** two `BLUE_HELM_*` variables reached a hook
  child. I did **not** test whether credential-shaped variables reach hook children, and this
  experiment establishes nothing about Bash tool calls or MCP servers. It is enough to say the repo's
  own description of that flag deserves its own bounded verification, and that any security reasoning
  currently resting on "hooks don't see the PTY environment" should be re-checked before it is relied
  on. **That is a separate task and is not authorized here.**

---

## 6. Privacy sentinel results

Adversarial fixtures carry a unique sentinel in every field a leak could ride out on:
`prompt`, `last_assistant_message`, `tool_input`, `tool_response`, `transcript_path`, `cwd`,
`session_id`, and an unrelated deeply-nested field.

| Surface | Sentinels found |
| --- | --- |
| Named-pipe messages | **0** |
| Main-process logs | **0** |
| Renderer IPC / view objects | **0** |
| DOM text and attributes | **0** |
| Reporter stdout | **0** |
| Reporter stderr (incl. the malformed-input and oversize paths) | **0** |
| Error messages | **0** |
| This evidence document | **0** |

The pane token likewise appears in **no** log line, view object, DOM node, stats output, or Claude
settings file. Verified in the live run (`tokenInLogs=false`) and in the synthetic suites.

**Two independent kinds of proof, because each covers the other's gap.** A runtime test proves no
path *ran*; a source assertion proves no path *exists*. `pane-status-boundary.test.js` asserts the
reporter contains no non-comment reference to `transcript_path`, `tool_input`, `tool_response`,
`last_assistant_message`, `session_id` or `prompt`, performs no file read, and has no HTTP client.

---

## 7. Dockview identity results

| Property | Result | How |
| --- | --- | --- |
| State keyed by pane id, never by position | **PROVEN** | `pane-status-badge.test.js` |
| A second pane never receives another pane's status | **PROVEN** | Synthetic + store-level (no API accepts a target pane) |
| State survives reparenting between Dockview groups | **PROVEN** | Simulated detach/reattach |
| Badge re-attaches after a destructive move, preserving state | **PROVEN** | `reattach()` restores the same state, inventing nothing |
| **Live drag in the running Electron app** | **NOT PERFORMED** | See below |

**The live Dockview move was not performed.** I cannot drive the Electron GUI — there is no automation
hook for a drag — so no live drag happened. Recorded as **not performed**, never as passed and never as
failed. The identity property is structural (the badge is keyed by the same `pty<N>` id that main's PTY
map and Dockview's panel registry use), and the synthetic proof exercises the real module, but a human
drag in the running app is still outstanding.

---

## 8. Settings backup and restoration identities

Contents are never shown. Only identity and structure.

| Stage | Value |
| --- | --- |
| Settings path | `C:\Users\levij\.claude\settings.json` |
| Existed before | **yes** |
| Original bytes | **381** |
| Original SHA-256 | `b9f576bbd3f3194855beedcbdd701ccd8085e032d6bb74d2581e393229e37f7e` |
| Recovery copy | `%TEMP%\blue-helm-pane-status-experiment\claude-settings.backup`, verified equal to the original by hash **before** the first mutation |
| Top-level keys before | `effortLevel, model, permissions, theme, tui` |
| Top-level keys after | `effortLevel, hooks, model, permissions, theme, tui` |
| Keys added / removed | **`hooks` added; none removed** |
| Per event | `SessionStart, UserPromptSubmit, Notification, Stop, StopFailure, SessionEnd` — each 0 groups → 1 group |
| Restored bytes | **381** |
| Restored SHA-256 | `b9f576bbd3f3194855beedcbdd701ccd8085e032d6bb74d2581e393229e37f7e` — **exact match** |
| `hooks` key after restore | **absent** (independently re-parsed) |
| Recovery copy | **removed only after restoration was proven** |

The file had **no** `hooks` key before the experiment, so the patch created it and restoration removed
it. Fixture tests separately prove the harder cases the live run could not exercise: an existing
unrelated hook is preserved and kept first, a malformed settings file is **refused without being
overwritten**, a missing file is created and then removed again, and restoration is byte-identical even
after the live file is clobbered mid-experiment.

**Non-Blue-Helm sessions no-op — proven live.** With the temporary hooks installed, a Claude session
launched **without** the prototype variables produced **0 connections, 0 accepted, 0 refused** and no
reporter output on stderr, and completed normally. Blue's own sessions were unaffected for the whole
window the hooks were installed.

---

## 9. Production user-data non-interference

| Check | Before | After |
| --- | --- | --- |
| `%APPDATA%\command-center\dockview-layout.json` | **absent** | **absent** |
| Leftover named pipes matching `*blue-helm-pane-status*` | — | **0** |
| Leftover experiment processes (node / claude / electron) | — | **0** |
| Experiment temp directories | — | **0** (removed behind a filename-pattern guard after verifying contents) |
| Claude user settings | 381 B / `b9f576bb…` | 381 B / `b9f576bb…` |

No Electron instance was launched by this experiment, so no isolated user-data directory was needed:
the probe stands in for the main process using the **real** store, server and protocol modules. That is
a deliberate scope reduction and it is why § 7's live drag is unperformed.

---

## 10. Kill criteria — every one, and whether it fired

| # | Kill criterion | Fired? |
| --- | --- | --- |
| 1 | Any conversation or sensitive sentinel reaches the app | **NO** — 0 sentinels on every surface (§ 6) |
| 2 | Any event updates the wrong pane | **NO** — no API accepts a target pane; the token selects it |
| 3 | The token appears in logs, arguments, renderer state, or persistent storage | **NO** — absent from all; never in argv, never in settings, no `setx` |
| 4 | Credential scrubbing must be weakened | **NO** — `CLAUDE_CODE_SUBPROCESS_ENV_SCRUB=1` unchanged; the fenced-role gate region is byte-identical to the reviewed base |
| 5 | A non-loopback network listener is created | **NO** — Windows named pipe only; no TCP, asserted on source |
| 6 | Claude experiences a repeatable or visible stall | **NO** — prototype turn ~8 s vs 8.195 s control; no stall observed in 2 turns |
| 7 | Reporter execution becomes unbounded | **NO** — 2 s watchdog, 750 ms connect budget, 1 MiB stdin cap; fail-fast measured at 69 ms |
| 8 | User-scope settings cannot be restored byte-identically | **NO** — restored to the exact original hash |
| 9 | More than one provider or pane becomes involved | **NO** — Claude only; a second pane is refused structurally |
| 10 | Completing the experiment would require Experiment B | **NO** — no app-server, listener, `codex --remote`, or observer client existed at any point |

**No kill criterion fired.**

---

## 11. Remaining unknowns

1. **`Notification` at runtime** — unverified (§ 3.1). The one signal that would make the badge
   genuinely useful for "the agent needs you" is the one not yet observed live.
2. **`StopFailure` at runtime** — unverified by design (§ 3.2).
3. **A live Dockview drag in the running app** — not performed (§ 7).
4. **What `CLAUDE_CODE_SUBPROCESS_ENV_SCRUB` actually scrubs** — § 5. Narrowly observed not to block
   two `BLUE_HELM_*` variables reaching a hook child; everything beyond that is untested.
5. **Latency under load** — n = 4, one session, an idle machine.
6. **Multi-pane and multi-provider behaviour** — deliberately out of scope and structurally prevented.
7. **Hook reliability over long sessions, compaction, and subagents** — not exercised.
8. **Whether `SessionStart`/`SessionEnd` bracket a *pane* or a *session*** — with `-NoExit` the PTY
   outlives the Claude process, so a pane can survive `SessionEnd`. The prototype shows `exited` and
   does not age it out; whether that is the right production behaviour is undecided.

---

## 12. Does this support, weaken, or overturn the hooks-first recommendation?

**It supports it, on the narrow ground it actually tested, and it does not settle the Codex half.**

**What is now stronger than § 10 of the procurement record could claim:**

* The recommendation's central mechanism is **no longer T1-documented-only**. Four of the six
  allowlisted events were observed firing on Blue's machine, against the installed 2.1.196, and drove
  a real badge through a real transport. § 11.2 of the record recorded that "**No T4 (runtime-observed)
  evidence exists anywhere in this record**" — that is now false for the Claude hook path specifically,
  and only for it.
* **Zero dependencies held up in practice.** No npm package, no PowerShell module, no native build.
* **The privacy boundary is achievable, not merely designable.** A hook payload dense with secrets
  produced a 110-byte message carrying an event name and a token.
* **Cost is low.** 1 ms delivery; the real cost is one short-lived Node process per event.

**What it does not establish, and must not be read as establishing:**

* Nothing about **Codex or Gemini**. Their hook systems were not touched. The record's
  provider-specific sourcing (§ 10.4) is unaffected.
* Nothing about **U5a or U5b**. No app-server was started. Both remain exactly as the record leaves
  them: polling documented and unmeasured, push and approval routing undocumented.
* Nothing about the **`Notification` signal**, which is the one the "interrupt Blue rather than making
  him poll" goal most depends on.
* Nothing about **production readiness**. The prototype has one pane, one provider, an exact-version
  pin, and a hard-coded staleness value.

**One honest complication the experiment surfaced.** The most useful state for Blue is "the agent needs
you", and that is the state still unverified. The states proven live — `working`, `turn ended`,
`exited` — are the ones a person can already infer by glancing at the pane. So the prototype validates
the **mechanism** convincingly and leaves the **highest-value signal** unproven. A production decision
should not treat § 3's four live events as evidence that the feature delivers its stated benefit.

**Recommendation for the next step, which this document does not authorize:** an interactive
`Notification` observation, driven by a human in a real pane, before any production specification.

---

## 13. Authorization state, unchanged

Tracked record: **`docs/OSS-PROCUREMENT-pane-status.md`**.

> BLUE SUBSYSTEM VERDICT: PROTOTYPE

Bounded Experiment A only. **Production pane-status specification and implementation, Experiment B,
all app-server runtime testing, merge, and push remain unauthorized.** No production verdict is issued
or implied by this document, and no second provider was begun.
