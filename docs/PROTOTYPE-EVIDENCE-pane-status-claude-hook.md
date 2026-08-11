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
Document revision: **2** (corrective), after an independent Full-class review returned `VERDICT: FAIL`

---

## 0. Revision 2 — what the review found, and what changed

An independent Full-class review of revision 1 returned **`VERDICT: FAIL`**: **1 Critical, 3 High,
4 Medium, 3 Low**. Every finding is recorded verbatim in § 10 of the handoff and none has been
downgraded. Three of them make parts of revision 1 of *this document* wrong, so read § 2, § 3, § 5,
§ 7 and § 10 below as **corrected**, not as originally written.

The three claims that were wrong, stated plainly:

1. **The application could never display a real state.** `app/main.js` supplied no `observedVersion`,
   so every view in the real Electron app resolved to `unknown/version-mismatch`. The working
   demonstration existed only inside `live-probe.js`, which supplied the answer itself. **Corrected:**
   `app/prototype-pane-status/pane-status-version.js` now discovers the version, `main.js` feeds it
   in, and `pane-status-integration.test.js` proves an accepted event reaches `working` through
   main.js's own call shape.

2. **The pinned version described a different installation than the one Blue Helm launches.** § 2
   read `2.1.196` from `%APPDATA%\npm\claude.cmd`. `main.js` launches a **bare `claude`** through
   PowerShell, which resolves first to `C:\Users\levij\.local\bin\claude.exe`. **Every runtime
   observation in this document was collected against npm Claude Code `2.1.196`, and that is not the
   executable Blue Helm normally launches.** See § 2.

3. **The token does not authenticate the reporter.** It authenticates possession of the pane's
   environment. This is now recorded as a **negative security result** of Experiment A, not as a
   solved problem. See § 5.1.

Also corrected: a fresh-process second `install` could destroy the genuine settings backup (§ 8.1);
`listen` printed the bearer token to stdout (§ 6); gate-off left the preload method, renderer
subscription and badge globals present (§ 9.1); a failed PTY spawn stranded the single pane slot; and
`window.ccPaneStatusReattach` was never called by any application code (§ 7).

**No new authentication scheme was invented, and no additional model turn was consumed.**

---

## 1. What was built

One gated prototype path, Claude Code only, one pane only.

| Component | File | Role |
| --- | --- | --- |
| Wire contract | `app/prototype-pane-status/pane-status-protocol.js` | Exact-key message shape, event allowlist, state mapping, staleness, version gate |
| **Version discovery** (rev 2) | `app/prototype-pane-status/pane-status-version.js` | Resolves the provider **the same way the pane does** and reads the version from that exact executable; fails closed to `unknown` |
| Main authority | `app/prototype-pane-status/pane-status-store.js` | Token minting, single-pane enrolment, constant-time token compare, state |
| Transport | `app/prototype-pane-status/pane-status-server.js` | Main-owned **Windows named pipe**, bounded framing |
| Hook reporter | `app/prototype-pane-status/pane-status-reporter.js` | The child Claude spawns; reads `hook_event_name` and nothing else |
| Settings guard | `app/prototype-pane-status/pane-status-settings.js` | Backup / patch / prove-restore. **Not imported by the app** |
| Orchestrator | `app/prototype-pane-status/pane-status-prototype.js` | The one thing `main.js` touches; returns an **inert object** when the gate is off |
| Badge | `app/renderer/pane-status-badge.js` | Pane-id-keyed indicator, visibly labelled `PROTOTYPE` |
| Experiment runner | `app/prototype-pane-status/run-experiment-a.js`, `live-probe.js` | Builder-operated; not part of the application |

**The gate:** `BLUE_HELM_PANE_STATUS_PROTOTYPE=1`, compared with `===` against the exact string `'1'`.

---

## 2. Claude versions — TWO different installations, corrected in revision 2

Revision 1 recorded a single "observed Claude version". That was wrong in a way that mattered: the
version it measured and the version the application launches are **different installations**.

| | Executable | Version | Role |
| --- | --- | --- | --- |
| **What the live run of § 3–§ 5 used** | `%APPDATA%\npm\claude.cmd` (npm `@anthropic-ai/claude-code`) | **2.1.196** | `live-probe.js` hard-coded this path and this version string |
| **What Blue Helm actually launches** | `C:\Users\levij\.local\bin\claude.exe` | **2.1.220** | `AGENT_CMD.claude` is the bare name `claude`; PowerShell resolves it, and this wins |

**How the second row was established, without launching a model.** `Get-Command claude -All` returns
four candidates on this machine, in resolution order: `.local\bin\claude.exe`, then
`npm\claude.ps1`, `npm\claude.cmd`, `npm\claude`. The first is what PowerShell runs.
`.local\bin\claude.exe` is 265,720,480 bytes with mtime 2026-07-26 17:12 — identical in size and
mtime to `.local\share\claude\versions\2.1.220`. Revision 2's own resolver, run against the real
machine, reports:

```
provider resolved: C:\Users\levij\.local\bin\claude.exe (version 2.1.220)
```

**Therefore, scoped explicitly: every runtime observation in § 3, § 4, § 5 and § 8 of this document
was made against npm Claude Code `2.1.196`. None of it was made against the executable Blue Helm
normally launches.** Whether those observations — including the § 5 environment finding — transfer to
`2.1.220` is **unverified**.

**What revision 2 changed.** Version discovery is no longer absent and no longer hard-coded.
`pane-status-version.js` asks **PowerShell** to resolve the same bare command name, with the same
environment and the same flags the PTY uses (including loading Blue's profile, minus `-NoExit`),
reports the path it chose, and then invokes **that resolved path** for its version. It never searches
PATH itself, never guesses an install location, and never reads another installation's package
metadata. Resolution failure, an erroring version command, an unparsable string, or a timeout all
yield a **null** version, which keeps the badge at `unknown` — never "assume compatible".

**`SUPPORTED_CLAUDE_VERSIONS` remains `['2.1.196']`.** `2.1.220` was deliberately **not** added: the
work order permits it only if the final authorized model turn exercises that exact binary and
confirms the hook behaviour, and that turn was **not consumed** (§ 3.3). The honest consequence is
that **on Blue's machine today the badge will read `unknown (version-mismatch)`**, and main surfaces
a visible `main-error` saying so. That is the designed, correct outcome for an unexercised provider
build — not a defect, and not a claim that the feature works.

The check remains an **exact match against a pinned list**, not a semver range, because § 7.5 of the
procurement record records that provider surfaces drift by **removal** as well as addition.

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

**Two scope corrections that apply to the whole table (revision 2).**

* **Provider scope.** Those four LIVE rows were observed against **npm Claude Code 2.1.196** (§ 2),
  not against `C:\Users\levij\.local\bin\claude.exe` 2.1.220, which is what a Blue Helm pane launches.
* **Process scope.** The "Displayed state" column was produced by **`live-probe.js`**, which stands in
  for the Electron main process. In revision 1 the real application could not have produced those
  states at all — it supplied no version, so every view was `unknown/version-mismatch`. That defect is
  fixed and proven by test through main.js's own call shape, but **no Electron instance has yet
  displayed any of these states**. See § 3.3.

### 3.3 The one remaining authorized model turn was NOT consumed

Two of three authorized turns were spent in revision 1. One remains. The work order permits it only
for a run that exercises the real Electron main process, the real preload boundary, the real renderer
subscription, a real Dockview pane, the same resolved executable a pane launches, and the visible
badge states.

**It was not used, deliberately, and the reasons are not interchangeable:**

1. **The badge would read `unknown` anyway.** The resolved executable is 2.1.220, which is not in
   `SUPPORTED_CLAUDE_VERSIONS`, so the run could not demonstrate a real state. Adding 2.1.220 to the
   list first would be assuming the very thing the turn is meant to establish.
2. **The Dockview move needs a human.** There is no GUI automation hook for a drag, and the work order
   is explicit: stop and hand Blue a verification step rather than report a drag that did not happen.

So the turn is **held**, and § 11 of the handoff carries the exact human procedure. Reporting a live
Electron observation without one would be the same class of error the review just failed this branch
for.

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

Scope note (revision 2): this observation was made against **npm Claude Code 2.1.196** (§ 2). Whether
`2.1.220` behaves the same is **unverified**.

### 5.1 NEGATIVE SECURITY RESULT — the token does not authenticate the reporter

**This is the most important correction in revision 2, and it is a result, not a bug to be patched.**

Revision 1's handoff described the named pipe as defeating procurement **threat 1** ("pane content can
forge anything a pane can print"). That claim was too strong, and § 5 above is the proof of why.

**What the token actually proves.** `envForPane()` places `BLUE_HELM_PANE_STATUS_PIPE` and
`BLUE_HELM_PANE_STATUS_TOKEN` into the enrolled pane's PTY environment. **Every descendant of that
PTY inherits both** — and § 5 demonstrates empirically that hook children inherit them *even with*
`CLAUDE_CODE_SUBPROCESS_ENV_SCRUB=1`. `applyMessage` accepts any allowlisted event bearing a token
that matches; it cannot distinguish the app-owned reporter from any other holder.

So a model-invoked shell command (`$env:BLUE_HELM_PANE_STATUS_TOKEN`), an MCP server, a project hook,
or any other descendant can read both values, open the pipe, and submit a forged `idle`, `working`,
`turn ended`, or `exited`.

**The corrected claim, in full:**

* The named pipe **does** remove *accidental* forgery through visible terminal output. A status
  channel sharing a byte stream with model output is forgeable by anything the model prints, cats, or
  builds; this one is not. Against **threat 1** that is a real and retained gain.
* The named pipe **does not** prevent *deliberate* forgery by processes inside the pane. Against
  **threat 2** (a status attributed to the wrong agent state) the mechanism provides **no** guarantee
  when the pane itself is the adversary.
* The token authenticates **possession of the pane environment**, not **reporter identity**.

**Disposition: unresolved production blocker.** Trusted event provenance is *not* demonstrated by
Experiment A, and no production pane-status design may assume it. Revision 2 deliberately did **not**
add process-ancestry checks, Windows identity heuristics, hidden environment variables, or any other
unreviewed authentication scheme — inventing one here and declaring the problem solved is exactly what
the work order forbids.

**What Experiment A still does demonstrate:** event delivery over an out-of-band transport, and
privacy minimisation (§ 6). It does **not** demonstrate trusted provenance.

Accordingly, revision 1's § 12 sentence "the prototype validates the **mechanism** convincingly" is
**withdrawn**, and so is any equivalent production-suitability reading. See the corrected § 12.

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

**Correction (revision 2) — one token-to-console path DID exist.** The statement above was true of
every surface it named, but it did not name the experiment runner's own console.
`run-experiment-a.js listen` printed the pipe name and the bearer token to stdout so the operator
could paste them into a pane. The live probe never invoked that path, so no token was ever actually
printed during the experiment — but **the path existed**, and kill-criterion 3 is only honestly
answerable if no such path exists at all. Revision 1 should have reported this and did not.

**Fixed.** No command prints the token. `listen` hands the prototype variables to a child process
through its environment (`EXPERIMENT_CHILD_ARGV`) and prints only the variable *names*.
`pane-status-runner.test.js` now **executes every command mode** — usage, `identity`, `install`, a
refused second `install`, `restore`, `listen`, and a malformed child spec — and scans all captured
stdout and stderr. Because a SHA-256 digest has the same 64-hex shape as a token, the scan asserts
that **every** 64-hex run in the corpus is a known settings hash, and additionally that no per-run
pipe name appears. A source-level check proves no `process.stdout/stderr.write` interpolates the
token, so no such path exists rather than merely not having run.

**Two independent kinds of proof, because each covers the other's gap.** A runtime test proves no
path *ran*; a source assertion proves no path *exists*. `pane-status-boundary.test.js` asserts the
reporter contains no non-comment reference to `transcript_path`, `tool_input`, `tool_response`,
`last_assistant_message`, `session_id` or `prompt`, performs no file read, and has no HTTP client.

---

## 7. Dockview identity results

Every row below is labelled with **what kind of check produced it**, because revision 1 reported a
module-level capability as if it were an application behaviour.

| Property | Result | Kind of check |
| --- | --- | --- |
| State keyed by pane id, never by position | **PROVEN** | **Structural / module-level** — `pane-status-badge.test.js` against the real module |
| A second pane never receives another pane's status | **PROVEN** | **Structural** — no API accepts a target pane; the token selects it |
| State survives reparenting between Dockview groups | **PROVEN** | **Module-level, simulated** detach/reattach against a stub DOM |
| Badge node reappears after a destructive move | **PROVEN, but only as self-healing on the next update** | **Module-level.** See the correction below |
| ~~Badge re-attaches after a destructive move via `reattach()`~~ | **WITHDRAWN** | No application code path ever called it |
| **Live drag in the running Electron app** | **NOT PERFORMED** | Requires a human; see § 3.3 and handoff § 11 |

**Correction (revision 2) — `reattach()` was unreachable.** Revision 1 defined
`window.ccPaneStatusReattach` in `app/renderer/app.js` and **nothing in the application ever called
it**, while this table reported live re-attachment as PROVEN. The unreachable global has been
**removed** rather than left as a false affordance. What is actually true, and is all that is now
claimed: Dockview reparenting can drop the badge *node*; the *state* is unaffected because it lives in
the badge module keyed by pane id; and `update()` re-creates the node through `ensureBadge` on the
very next event. That is **self-healing on the next update**, not live re-attachment.

**The live Dockview move was not performed.** There is no automation hook for a drag, so no live drag
happened. Recorded as **not performed** — never as passed, never as failed. The identity property is
structural (the badge is keyed by the same `pty<N>` id that main's PTY map and Dockview's panel
registry use) and the module-level proof exercises the real module, but a human drag in the running
app is still outstanding. The procedure for Blue is in handoff § 11.

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

**Current state of Blue's settings file (revision 2, read-only check).** `~/.claude/settings.json` is
now **382 bytes**, hash `a67c2e66…`, with exactly the five original top-level keys
(`effortLevel, model, permissions, theme, tui`), **no `hooks` key**, no prototype marker, and no
`pane-status` reference. `%TEMP%\blue-helm-pane-status-experiment` does not exist. So the experiment's
restoration held and left nothing behind; the one-byte difference from the 381-byte historical hash is
a later, unrelated edit to an existing value. **That file is user-owned state and revision 2 does not
touch it or try to restore it to the historical hash.**

### 8.1 CORRECTION — an interrupted install could have destroyed the genuine backup

Revision 1's claim that "a crashed experiment must still be recoverable" was **false for the case it
names**. `installed` is in-memory only, so a *fresh process* after an interrupted run knew nothing:

1. `captureIdentity()` read the **already-patched** file, recording the patched bytes and hash as "the
   original".
2. The runner overwrote `identity.json` with that patched identity.
3. `install()` copied the patched file over the **genuine** `claude-settings.backup`. The integrity
   check `sha256(backup) === original.sha256` **passed**, because by then both sides were the patched
   hash.
4. Hooks were appended a *second* time (`applyPatch` concatenates).
5. A later `restore` verified patched-against-patched, reported `ok: true`, and deleted both recovery
   artifacts.

Blue's real settings would have been left carrying the experiment's hooks, twice, with the tooling
reporting byte-identical success. Revision 1's fixture case (5) did not cover this because it reused
the **same guard instance**, which still held the true `original` in memory.

**Fixed, fail-closed and in that order.** `install()` now refuses — **before touching settings, the
sidecar, or the backup** — if a recovery copy exists, or if the settings file already carries the
prototype `MARKER`; the runner refuses first if the identity sidecar exists. Every refusal names the
reason and tells the operator to run `restore`. Recovery artifacts are created once and deleted only
after a proven byte-identical restoration. The sidecar is now written **after** a successful install,
so a refusal can never leave one describing a state that was never reached.

**Proven by fixture, in fresh processes.** `pane-status-boundary.test.js` and
`pane-status-runner.test.js` together cover the full six-step sequence: clean install → simulated
crash → new-process install attempt → **visible refusal with settings, identity and backup all
unmodified** → new-process restore → **exact restoration of the genuine original bytes and hash**,
plus a second line of defence proving the `MARKER` still refuses even when the backup is missing.
`pane-status-runner.test.js` executes the real runner as a child process to do it.

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

### 9.1 CORRECTION — gate-off was inert, not absent

The work order required the prototype surface to be **absent** when disabled. Revision 1 delivered an
inert *main-process* object (correctly) but left the whole renderer half present unconditionally:
`cc.onPaneStatusPrototype` was exposed on every launch, `app.js` always constructed a badge instance
and registered a subscription, and `window.ccPaneStatusBadge` and `window.ccPaneStatusReattach` always
existed. Nothing ever *fired*, because main never sent — but "inert" is not what was asked for, and
revision 1's claim of "no IPC channel, no badge" was simply broader than its code.

**Fixed by shape, mirroring the reviewed `ccDockview` pattern.** Main computes the gate once, before
the window exists, and forwards a token through `additionalArguments` — the same forge-proof channel
`--cc-classic-layout` uses, since renderer script cannot add a process argument. Then:

| With the gate **off** | Status |
| --- | --- |
| Pipe endpoint | **absent** |
| Pane token | **absent** (nothing is minted) |
| PTY prototype environment | **absent** (`envForPane()` returns `{}` for every pane shape) |
| Preload method / IPC exposure | **absent** — `window.ccPaneStatus` is `undefined`, not `{enabled:false}` |
| Renderer subscription | **absent** — nothing to subscribe to |
| Badge instance | **absent** — never constructed |
| Prototype DOM | **absent** |
| `window.ccPaneStatusBadge` | **absent** — the module publishes no global |
| `window.ccPaneStatusReattach` | **absent** — removed entirely (§ 7) |

`pane-status-integration.test.js` asserts each of these, in both gate shapes, and separately proves
that an ordinary pane launch is unchanged when disabled: six pane shapes (claude, codex, gemini,
role-launched, video-scout, plain shell) all receive `{}`, the `ptyEnv` spread is therefore empty, and
the credential scrub is intact.

---

## 10. Kill criteria — every one, and whether it fired

Revision 1 answered all ten "NO" in one undifferentiated column. Revision 2 splits **how** each was
checked, because "no API accepts a target pane" and "we watched it not happen at runtime" are not the
same evidence — and for criterion 2 the difference is the whole point.

**Legend.** **RUNTIME** = observed in the live run (npm 2.1.196, § 2). **STRUCTURAL** = proven by test
or source assertion, not observed live. **NOT PERFORMED** = neither.

| # | Kill criterion | Fired? | Basis |
| --- | --- | --- | --- |
| 1 | Any conversation or sensitive sentinel reaches the app | **NO** | **RUNTIME + STRUCTURAL** — 0 sentinels on every surface in the real-child/real-pipe suite, plus a source proof that no path exists (§ 6) |
| 2 | Any event updates the wrong pane **after a Dockview move** | **NOT ESTABLISHED AT RUNTIME** | **STRUCTURAL only.** No API accepts a target pane and the token selects it; badge state is keyed by pane id. But the record's criterion names a **Dockview move**, and the live drag was **NOT PERFORMED** (§ 7). Revision 1 reported this as a clean pass; it is not one |
| 3 | The token appears in logs, arguments, renderer state, or persistent storage | **NO — but revision 1 was wrong** | **STRUCTURAL.** True of every surface revision 1 named, but `run-experiment-a.js listen` **printed the token to stdout**. Path never invoked, but it existed. Removed in revision 2 and now proven absent by executing every command mode (§ 6) |
| 4 | Credential scrubbing must be weakened | **NO** | **STRUCTURAL** — `CLAUDE_CODE_SUBPROCESS_ENV_SCRUB=1` unchanged; the fenced-role gate region is byte-identical to the reviewed base across both revisions |
| 5 | A non-loopback network listener is created | **NO** | **STRUCTURAL** — Windows named pipe only; no TCP, asserted on source |
| 6 | Claude experiences a repeatable or visible stall | **NO** | **RUNTIME**, n = 2 turns, npm 2.1.196 — prototype turn ~8 s vs 8.195 s control. Two turns is not a latency study |
| 7 | Reporter execution becomes unbounded | **NO** | **RUNTIME + STRUCTURAL** — 2 s watchdog, 750 ms connect budget, 1 MiB stdin cap; fail-fast measured at 69 ms |
| 8 | User-scope settings cannot be restored byte-identically | **NO for the run; a LATENT FAILURE existed** | **RUNTIME** restoration to the exact original hash — but a fresh-process re-install could have destroyed the genuine backup (§ 8.1). Fixed and covered by fixture in revision 2 |
| 9 | More than one provider or pane becomes involved | **NO** | **STRUCTURAL** — Claude only; a second pane is refused by the data structure |
| 10 | Completing the experiment would require Experiment B | **NO** | **RUNTIME** — no app-server, listener, `codex --remote`, or observer client existed at any point |

**Corrected summary.** No kill criterion fired *as a runtime event*. But the honest reading is:

* **Criterion 2 is NOT satisfied** — its runtime condition (a Dockview move) was never exercised.
* **Criterion 3 was reported wrongly** in revision 1; the structural path existed and is now removed.
* **Criterion 8 held for the run but had a latent failure mode** that the revision-1 fixtures could
  not have caught.

Separately, and outside the ten: § 5.1 records a **negative security result** — the token
authenticates the pane environment, not the reporter. No kill criterion covers provenance, which is
why it is stated as a result rather than as a criterion outcome.

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

Added in revision 2:

9. **Anything at all about `2.1.220`, the build Blue Helm actually launches.** Every runtime
   observation here is scoped to npm `2.1.196` (§ 2). Hook firing, event names, payload shape, the
   scrub behaviour of § 5, and latency are all **unverified** on 2.1.220.
10. **PROVIDER-UPGRADE BEHAVIOUR — required by the Experiment A definition and NOT verified.**
    § 11.1 of the procurement record requires Experiment A to "verify behaviour when the provider is
    upgraded". Revision 1 neither performed it nor listed it as an unknown, and stated the
    exact-version pin as though it were the check. It is not: the pin is a *policy*, and what it
    guarantees is only that an unrecognised version **visibly becomes `unknown` with reason
    `version-mismatch`** — which is proven structurally (`pane-status-version.test.js`,
    `pane-status-integration.test.js`, including for `2.1.220` specifically). **What the provider does
    across an upgrade at runtime — whether hooks still fire, whether event names survive, whether the
    payload shape holds — is untested.** Deliberately not tested here: it would cost the one remaining
    authorized model turn to simulate, and the work order forbids spending it that way.
11. **Whether the whole path works inside the real Electron application.** Revision 2 fixes the defect
    that made it impossible and proves the fix by test through main.js's own call shape, but no
    Electron instance has yet rendered a badge (§ 3.3).
12. **Reporter provenance** — unresolved, and now a recorded negative result (§ 5.1).

---

## 12. Does this support, weaken, or overturn the hooks-first recommendation?

**Revision 2 answer: it supports it MORE NARROWLY than revision 1 claimed, and it now carries a
negative result against it.**

Revision 1's sentence "the prototype validates the **mechanism** convincingly" is **WITHDRAWN**, along
with any equivalent production-suitability reading. Two findings force that: the mechanism was never
exercised in the real application (§ 3.3), and the transport does not authenticate the reporter
(§ 5.1).

**What is genuinely stronger than § 10 of the procurement record could claim:**

* The recommendation's central mechanism is **no longer T1-documented-only**. Four of the six
  allowlisted events were observed firing on Blue's machine and drove a badge through a real
  transport. § 11.2 of the record recorded that "**No T4 (runtime-observed) evidence exists anywhere
  in this record**" — that is now false for the Claude hook path specifically, and only for it.
  **Scoped:** those observations are against **npm 2.1.196**, not the executable a pane launches, and
  the badge was driven through `live-probe.js`, not through Electron.
* **Zero dependencies held up in practice.** No npm package, no PowerShell module, no native build.
* **The privacy boundary is achievable, not merely designable.** A hook payload dense with secrets
  produced a 110-byte message carrying an event name and a token. This is the strongest result in the
  experiment and it is unaffected by the corrections.
* **Cost is low.** 1 ms delivery; the real cost is one short-lived Node process per event.

**What the experiment now records AGAINST the approach:**

* **Trusted event provenance is not achievable this way.** Any pane descendant can forge an
  allowlisted status event (§ 5.1). A hooks-first production design must either solve provenance with
  a separately reviewed mechanism, or accept that pane status is advisory and may be wrong when the
  agent is adversarial or compromised. Experiment A does not settle which.

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
you", and that is the state still unverified. The states seen live — `working`, `turn ended`,
`exited` — are the ones a person can already infer by glancing at the pane. So the prototype
demonstrates the **transport and the privacy boundary**, and leaves the **highest-value signal**
unproven. A production decision should not treat § 3's four live events as evidence that the feature
delivers its stated benefit.

**Recommendations for the next steps, none of which this document authorizes:**

1. A human-driven live check in the real Electron app against the resolved executable — the procedure
   is in handoff § 11, and the one remaining authorized turn is held for it.
2. An interactive `Notification` observation, driven by a human in a real pane.
3. A separately reviewed decision on **provenance** (§ 5.1): solve it, or accept pane status as
   advisory and say so in the UI.
4. A bounded re-verification of what `CLAUDE_CODE_SUBPROCESS_ENV_SCRUB` actually scrubs (§ 5).

---

## 13. Authorization state, unchanged

Tracked record: **`docs/OSS-PROCUREMENT-pane-status.md`**.

> BLUE SUBSYSTEM VERDICT: PROTOTYPE

Bounded Experiment A only. **Production pane-status specification and implementation, Experiment B,
all app-server runtime testing, merge, and push remain unauthorized.** No production verdict is issued
or implied by this document, and no second provider was begun.
