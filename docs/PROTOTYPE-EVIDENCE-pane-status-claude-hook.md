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
Experiment dates: **2026-08-11** (revisions 1–2) · **2026-08-12** (revision 3, the real-application run)
Document revision: **3** (final), after revision 2 received an independent Full-class `VERDICT: PASS`

---

## 0.A REVISION 3 — the real-application run, and exactly what it did and did not establish

Revision 2 was reviewed independently and returned:

> VERDICT: PASS

The reviewer independently confirmed **all 11 revision-1 findings** fixed, scoped, or honestly
recorded, **with none downgraded**, and raised **six non-blocking Low findings**. All six are
corrected in revision 3 (§ 0.B). Verified revision-2 artifacts, unchanged:

| Artifact | Range | Size | SHA-256 |
| --- | --- | --- | --- |
| rev2 focused | `f8cb64a3...c8d9fdaa` | 165,445 | `b8b5f644d1fc53f84beb6c7762c7968dbd7328de1374a0a6c622cee9242a64f7` |
| rev2 cumulative | `3ff96bde...c8d9fdaa` | 280,014 | `3b3cb40fc1d5590479f7009af66f76934c48044f283e598d5b2566fc3e1683f3` |
| rev1 (unchanged) | `3ff96bde...bf66fb3b` | 174,128 | `eaad43a22aeacfc7de79f234e3805e7aaf56dd75e2de11854e42d5936aa42f89` |

**THE HEADLINE: for the first time, the prototype ran inside the REAL Electron application, against
the executable a Blue Helm pane actually launches, and real hook events drove real states through
main, the preload boundary and the renderer subscription.** Revision 2 could only prove that by test.

**REVISION 4 CORRECTION TO THIS SUMMARY.** Revision 3 stated here that the human observer "could not
see a badge" and that the visible control was unproven. **An independent review returned
`VERDICT: FAIL` on that**, and a later explicit sighting settled it the other way:

> i saw this: PROTOTYPE ○ unknown

**Badge rendering is HUMAN-VERIFIED** — in the pane header, after the pane controls, reading
`PROTOTYPE ○ unknown`, which is the correct fail-closed display for the unrecognised version the pane
reported (v2.1.228). See § 7.1. Revision 3's claim that `.term-head` does not exist was **false**; it
is created in `agent-dom.js` (§ 7.1.1), and the methodology defect that produced that claim is
recorded in § 7.3.

**What remains genuinely unproven, and is NOT softened by that correction:** event-driven *visible*
state change was never watched on screen (the verification sent no prompt); the Dockview drag was
**again NOT PERFORMED**, so kill criterion 2 is **still NOT SATISFIED** (§ 10); reporter provenance
is still unresolved (§ 5.1); and the run consumed **more model turns than were authorized** — see
§ 3.4, which is not rounded down.

### 0.B The six Low findings from the revision-2 review, and their dispositions

| # | Low finding | Disposition in revision 3 |
| --- | --- | --- |
| 1 | `dockview-default-path.test.js` carried a stale comment saying the badge module "defines one global" with the gate off — revision 1's behaviour, and the thing finding 6 removed | **CORRECTED.** The comment now states that gate-off means the module is loaded but publishes **no** prototype global |
| 2 | The `additionalArguments` tripwire FILTERED to `...`-prefixed lines before checking them, so an unconditional non-spread entry would be dropped rather than caught | **FIXED.** Every non-empty, non-comment entry is now inspected and an unconditional one fails; a **negative control** proves the predicate actually rejects one |
| 3 | `interpretProbe` tested `ERROR_TAG` before `SOURCE_TAG`, so a resolved provider whose `--version` threw was reported `provider-not-found` with a null source, and `version-command-failed` was unreachable | **FIXED.** Source is read first; a resolved provider whose version command failed now reports `version-command-failed` **and preserves the resolved path**. `provider-not-found` is reserved for real resolution failure. Both outcomes covered by new assertions |
| 4 | `discover().then(...)` had no `.catch()`, so a throw in the handler became an unhandled rejection — a silent failure | **FIXED.** A bounded `.catch()` logs a fixed constant: no path, environment value, command output, token, or the caught error's own text |
| 5 | The integration suite claimed "EXACTLY the dependency set app/main.js passes" while also injecting `net`/`crypto` stubs | **CORRECTED.** It now says application call shape **plus injected transport/crypto test stubs**, and names the load-bearing property (no `observedVersion`) |
| 6 | Boundary-test cases were labelled "fresh-process" but built fresh **guard objects** in one process | **RELABELLED** to "new-guard". "Fresh process" is reserved for `pane-status-runner.test.js`, which really spawns the runner |

**No finding was downgraded, and none was closed by argument rather than by change.**

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

**REVISION 3: `SUPPORTED_CLAUDE_VERSIONS` is now `['2.1.196', '2.1.220']`.**

Revision 2 deliberately left `2.1.220` out, because no authorized run had exercised it, and recorded
the honest consequence that the badge would read `unknown (version-mismatch)` on Blue's own machine.
Revision 3's work order authorized adding it **provisionally**, conditional on the final run actually
launching that exact resolved executable and observing the real application path successfully.

**It did.** In the running Electron application (§ 3.5):

```
[pane-status] provider resolved: C:\Users\levij\.local\bin\claude.exe (version 2.1.220)
```

no `version-mismatch` `main-error` was emitted, the enrolled pane's first view was
`unknown (no-signal)` rather than `unknown (version-mismatch)`, and **six real hook events from that
build were accepted and drove real states**. So the entry stays.

**What its presence does and does not mean.** It means events from that exact build were accepted and
displayed by the real application. It does **not** mean the badge was seen (§ 7.1), and it is **not**
a compatibility statement about the 2.1.x line. `isVersionSupported` remains an exact `indexOf`
against a frozen, closed list — `pane-status-version.test.js` asserts that `2.1.195`, `2.1.197`,
`2.1.200` (which sits **between** the two supported entries), `2.1.219`, `2.1.221`, `2.2.196` and
`3.1.220` are **all still refused**, which no semver range could do. Two entries are two exercised
data points, not an interval.

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

### 3.5 REVISION 3 — events observed in the REAL Electron application

Every line below is from the running application's own main-process log, with the corresponding
renderer-side line from `app/renderer/app.js`. Nothing here came from `live-probe.js`.

| Event | Real-app result | Renderer received it? |
| --- | --- | --- |
| (enrolment) | `pane pty1 enrolled (token minted, retained in main memory only)` | `pty1 -> unknown (no-signal)` |
| `SessionStart` | **accepted → `idle`** | `pty1 -> idle` |
| `UserPromptSubmit` | **accepted → `working`** (×2) | `pty1 -> working` |
| `Stop` | **accepted → `turn ended`** (×2) | `pty1 -> turn ended` |
| **`Notification`** | **accepted → `attention`** | `pty1 -> attention` |
| `StopFailure` | **not emitted — UNVERIFIED** | — |
| `SessionEnd` | **not observed this run** — Electron was force-stopped rather than Claude exited interactively | — |

**6 events accepted · 0 refused · 0 dropped · 0 transport errors.**

Three results here are new and none of them existed before revision 3:

1. **The real preload/renderer path is proven.** The `[pane-status PROTOTYPE] …` lines are emitted by
   the renderer's own subscription callback, which runs only if `window.ccPaneStatus` existed, the
   gate token reached the preload, and main pushed on the prototype channel. Revision 2 could only
   assert that against source.
2. **`Notification` FIRED NATURALLY and was accepted → `attention`.** Every prior revision recorded
   it `UNVERIFIED`, and § 11 called it "the one signal that would make the badge genuinely useful …
   the one not yet observed live". It is now observed. **What produced it was not established** — the
   timing is consistent with Claude Code's idle notification, but a permission prompt would look the
   same from here, and the operator did not confirm which. Recorded as **observed, cause unknown**.
3. **A second pane was refused status by the real application**, not merely by the data structure:
   `pane pty2 launched WITHOUT status: Experiment A already bound to pty1`. The pane itself launched
   and worked normally. That upgrades kill criterion 9 from STRUCTURAL to RUNTIME (§ 10).

### 3.4 MODEL TURNS — the count is over budget, and is recorded as such

**Authorized: three turns total. Consumed: four.**

Two were spent in revision 1. Revision 3's work order authorized **one** final content-free turn. The
application log shows **two** complete prompt cycles in the enrolled pane:

```
accepted UserPromptSubmit -> working      <- turn A (the authorized "Reply with exactly the word: ok")
accepted Stop             -> turn ended
accepted Notification     -> attention
accepted UserPromptSubmit -> working      <- turn B, UNPLANNED
accepted Stop             -> turn ended
```

The operator reported sending **one** prompt ("it did reply with only the word 'ok' after i
prompted") and did not confirm a second. Only the enrolled pane holds the token, so both cycles came
from `pty1`; no other session could have produced them.

**The origin of turn B is NOT established, and this document does not invent one.** It is recorded as
a **one-turn overrun against the authorized budget**, flagged for Blue rather than rounded down to
"three of three". What turn B contained is unknown, so it cannot be asserted content-free — but see
§ 6: the transport carried only an event name and a token in every case, and the whole application
log contains no token, no pipe name, and no 64-hex run of any kind, so kill criterion 1 is unaffected
by the uncertainty.

### 3.3 Revision 2's decision to hold the turn (superseded by § 3.4)

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
app is still outstanding.

**REVISION 3: still NOT PERFORMED.** The application was running and the operator was asked directly.
He declined and asked to revisit it separately — verbatim: *"its good, lets move on, idk what badges
youre talking about can we circle back to it in another test? im not seeing what youre referencing"*.
No drag was performed and none is reported. **Kill criterion 2 remains NOT SATISFIED** (§ 10).

### 7.1 REVISION 4 — the event path works AND the badge is HUMAN-VERIFIED RENDERING

> **REVISION 4 — THIS SECTION WAS WRONG AND IS REPLACED.** Its original text is preserved verbatim
> in § 7.2 as superseded review history. An independent review of revision 3 returned
> **`VERDICT: FAIL`** on it. **The badge DID render**, and the structural explanation this section
> gave for its supposed absence was **false**. Read § 7.1 below as the corrected record.

**BADGE RENDERING IS HUMAN-VERIFIED.** Blue looked at the running application and reported, verbatim:

> i saw this: PROTOTYPE ○ unknown

| Property | Verified value |
| --- | --- |
| Badge rendered | **YES** |
| Location | **far-right of the visible pane header, AFTER the pane controls** |
| Exact visible text | **`PROTOTYPE ○ unknown`** |
| Observed header order | **role/name → `⧉ ⛶ 🔊 ✕` → `PROTOTYPE ○ unknown`** |
| Claude version the pane's banner reported | **Claude Code v2.1.228** |
| Prompt sent | **none** |
| Hook installed | **none** |
| Model turn consumed | **none** |
| Status event exercised | **none** |

This was a separate, later, **no-prompt visual verification** — not part of the § 3.5 runtime run, and
it must not be merged with it. Nothing was sent, installed, or exercised; only the static rendered
control was observed.

### 7.1.1 `.term-head` EXISTS — the corrected code fact

`ensureBadge` uses `pane.querySelector('.term-head') || pane`. The header **is** present, so the
fallback is never taken:

* `app/renderer/agent-dom.js` creates it — `el(doc, 'div', { className: 'term-head' })` — and appends
  it as the pane's **first** child, before `.term-body`.
* `app/renderer/app.js` builds **every** pane through `agentDom.buildTermPane(...)`; that same element
  is stored in `paneData` and returned by the badge's `getPaneElement`.
* `app/renderer/styles.css` styles that header `display:flex; align-items:center`, and the badge as a
  bordered `inline-flex` chip inside it.

So the badge attaches **within the visible inner pane header**. In the observed layout it appears
**after** the pane controls, at the far-right edge. That placement is what this run showed; it is not
a permanent UI-placement guarantee beyond the reviewed layout.

**`app/renderer/app.js` and `app/renderer/index.html` are NOT the complete DOM-construction surface** —
`agent-dom.js` builds the pane markup, and any future claim about renderer structure has to account
for it.

### 7.1.2 Why `unknown` was the CORRECT thing to see

The pane's banner reported **v2.1.228**, which is not a member of the prototype's exact supported set
(`['2.1.196','2.1.220']`). An unrecognised version must degrade visibly rather than guess, so
`unknown` is the **designed fail-closed outcome**, not a badge failure.

This is genuinely new runtime evidence: **an unrecognised provider version produced a visible
`unknown` badge in the real application.** Revision 3 could only prove that path by test.

**It qualifies nothing.** It does **not** add `2.1.228` to the supported list, does **not** authorize
adding it, and does **not** generalise provider-upgrade compatibility. The list stays exactly
`['2.1.196','2.1.220']` as already reviewed. The screenshot also proves only the version **the pane's
banner reported** — it does **not** establish which executable path supplied `2.1.228`.

### 7.1.3 What is proven, and what is still not

**Proven:** static badge rendering, in the real Electron application, in the pane header, with correct
`unknown`-for-unrecognised-version behaviour.

**Still NOT proven, and not softened by the above:**

* **Event-driven visible state change was not observed during this verification** — no prompt was
  sent, so no `idle`/`working`/`turn ended` transition was watched on screen. § 3.5 proves those
  states reached the renderer callback; it remains unobserved that the *visible chip text* changes as
  they arrive.
* **The Dockview drag remains NOT PERFORMED**, and wrong-pane-after-move remains **NOT SATISFIED**.
* **Reporter provenance remains unresolved** (§ 5.1). A visible badge is not an authenticated one.

### 7.2 SUPERSEDED — revision 3's § 7.1, preserved verbatim, and why it failed

Retained so the failed reasoning stays visible rather than being quietly rewritten. **Everything in
this blockquote is SUPERSEDED and must not be read as current state.**

> **NEGATIVE RESULT (revision 3) — the event path works; the VISIBLE BADGE IS UNCONFIRMED**
>
> **The operator, looking at the running application, reported that he could not see any badge.** That
> is a first-hand observation and it is recorded as one, not explained away.
>
> **A structural cause was identified, and it is a hypothesis, not a diagnosis.** `ensureBadge` prefers
> `pane.querySelector('.term-head')` as its host and falls back to the pane root. The class
> **`.term-head` appears nowhere in `app/renderer/app.js` or `app/renderer/index.html`** — it exists
> only as 12 rules in `styles.css`. So the badge, if attached at all, is appended as the **last child of
> the pane element**, after the xterm container, rather than into a pane header.

**Finding 1 (High) — the `.term-head` claim was false.** It is created in
`app/renderer/agent-dom.js` and is the visible inner pane header (§ 7.1.1). The inference built on it —
badge at the pane root, behind or below the terminal — was therefore also false.

**Finding 2 (Medium) — an ambiguous statement was recorded as a confirmed observation.** Blue's
earlier words were:

> idk what badges youre talking about can we circle back to it in another test? im not seeing what
> youre referencing

That is ambiguous between *"the badge is not rendering"* and *"I don't know which UI element you
mean."* Revision 3 resolved it in one direction, called it a first-hand observation, and built a
section title and an unknown-item on it. The later explicit sighting (§ 7.1) shows the second reading
was the correct one. **Blue's original words are not rewritten** — only the inference drawn from them
is withdrawn.

### 7.3 THE METHODOLOGY DEFECT — a zero-hit search promoted into an absence claim

**How the false claim was produced:** the search was restricted to `app/renderer/app.js` and
`app/renderer/index.html`. DOM construction for panes also lives in `app/renderer/agent-dom.js`. A
zero hit across those two selected files was written down as a repository-wide absence.

**This repeated an error shape already prohibited by § 0.1 of the procurement record**, which was
adopted after revisions 1 and 2 of that branch failed for exactly it — and it was committed here while
documenting a *different* finding, which is how it evaded the same scrutiny.

**Durable rule, restated so it survives this document:**

> Before claiming that an element, token, API, or behavior does not exist, enumerate the complete
> relevant source surface or search the whole tree. A zero-hit search over selected files proves only
> that those selected files contain no hit.

Corollary learned here: **when a UI element is reported missing, check where the DOM is actually
constructed** — not where you expect it to be constructed.

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

### 8.2 REVISION 3 — the real run's settings identities, start to finish

| Stage | Value |
| --- | --- |
| Baseline captured before any write | **382 bytes** · `a67c2e6620f13861c7e548b4d69c259b119bae746cc6f8dfbd307a6b8f55dcc5` |
| Baseline top-level keys | `effortLevel, model, permissions, theme, tui` · no `hooks` · no marker |
| Read-only `identity` command agreed | 382 / `a67c2e66…`, and created nothing |
| Recovery copy after install | 382 / `a67c2e66…` — **byte-identical to the baseline**, verified before the first mutation |
| Identity sidecar | recorded the same genuine identity, written only after a successful install |
| Patched live file | 3,188 bytes · `hooks` added · marker present · 6 events, each 0 → 1 group |
| **Restored** | **382 bytes** · `a67c2e6620f13861c7e548b4d69c259b119bae746cc6f8dfbd307a6b8f55dcc5` — **exact match** |
| Restored keys, re-parsed | `effortLevel, model, permissions, theme, tui` · `hooks` **absent** · marker **absent** · no `pane-status` reference |
| Recovery copy + sidecar | **removed only after restoration was proven** |
| Experiment temp directory | **removed** (verified empty and name-guarded first) |
| Named pipe · Electron · reporter processes | **none remain** |

The restored file is byte-identical to the pre-run baseline. **This run therefore leaves Blue's Claude
configuration exactly as it found it.**

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

**REVISION 3 UPDATE — one production file DID change, and it is reported rather than quietly left out
of the table above.** Revision 3 launched the real application against the **real** user-data
directory (no isolated profile), so the row "`dockview-layout.json` — absent / absent" no longer
holds:

| Check | Before revision 3 | After revision 3 |
| --- | --- | --- |
| `%APPDATA%\command-center\dockview-layout.json` | **absent** | **PRESENT** — 1,291 B, written during the run |
| Leftover `*blue-helm-pane-status*` pipes | — | **0** |
| Leftover experiment processes | — | **0** |
| Experiment temp directory | — | **0** (removed after verifying it was empty, behind a name guard) |
| Claude user settings | 382 / `a67c2e66…` | 382 / `a67c2e66…` |

**Who wrote it, and whether it matters.** It was written by the **production Dockview layout engine**,
which persists the operator's layout whenever the app runs and panes are opened — normal application
behaviour, not a prototype side effect. It was **not** deleted: it is legitimate user-owned state
produced by ordinary use, and removing it would destroy a real setting to make a table look tidy.
Scanned for contamination: **0** matches for `pane-status`, `blue-helm`, or any 64-hex run. Its keys
are `schemaVersion, package, packageVersion, savedAt, layout`.

The honest statement is therefore narrower than revision 2's: **the prototype interfered with no
production user data; running the real application persisted the operator's own layout, as it always
does.**

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

### 10.1 REVISION 3 — restated against the REAL-APPLICATION run

Legend unchanged, with one addition: **NOT SATISFIED** = the criterion's own runtime condition was
never created, so "did not fire" is not an answer to it.

| # | Kill criterion | Status after revision 3 | Basis |
| --- | --- | --- | --- |
| 1 | Conversation/sensitive content reaches the app | **NO** | **RUNTIME (real app) + STRUCTURAL** — 6 accepted events in the real application; the entire Electron log contains no token, no pipe name and **no 64-hex run at all**; plus the existing source proof (§ 6) |
| 2 | Any event updates the wrong pane **after a Dockview move** | **NOT SATISFIED** | **STRUCTURAL only.** The drag was offered in the running app and declined (§ 7). Never passed, never failed — **not established** |
| 3 | Token appears in logs, arguments, renderer state, or persistent storage | **NO** | **RUNTIME (real app) + STRUCTURAL** — scanned the real application log: 0 tokens, 0 pipe names. Plus every runner mode executed and source-proved (§ 6) |
| 4 | Credential scrubbing must be weakened | **NO** | **RUNTIME** — the real PTY logged `CLAUDE_CODE_SUBPROCESS_ENV_SCRUB=1`; the fenced-role region is byte-identical to the reviewed base across all three revisions |
| 5 | A non-loopback network listener is created | **NO** | **RUNTIME** — the real app bound `\\.\pipe\blue-helm-pane-status-…` and nothing else; the pipe was gone after shutdown |
| 6 | Claude experiences a repeatable or visible stall | **NO** | **RUNTIME** — two real turns in the real app, no stall reported and none visible; operator: *"no errors, appears tobeb working as intended"*. Still not a latency study |
| 7 | Reporter execution becomes unbounded | **NO** | **RUNTIME + STRUCTURAL** — 6 events delivered, 0 dropped, 0 transport errors, no residual reporter process |
| 8 | User-scope settings cannot be restored byte-identically | **NO** | **RUNTIME** — restored to the exact baseline hash `a67c2e66…` and re-parsed clean (§ 8.2). The revision-2 latent failure remains fixed and fixture-covered |
| 9 | More than one provider or pane becomes involved | **NO** | **RUNTIME (upgraded from STRUCTURAL)** — a second real pane launched and was refused status by the running application: `pane pty2 launched WITHOUT status: Experiment A already bound to pty1` |
| 10 | Completing the experiment would require Experiment B | **NO** | **RUNTIME** — no app-server, listener, `codex --remote`, or observer client existed at any point |

**Three things sit outside the ten and must not be lost in a table of NOs:**

* **§ 7.1 — badge rendering is HUMAN-VERIFIED (revision 4).** No kill criterion covers "the display
  works", so it is recorded here rather than as a criterion outcome. Revision 3 recorded this as an
  unconfirmed negative; that was corrected after an independent `VERDICT: FAIL`. **Narrow scope:**
  the *static* rendered chip was seen (`PROTOTYPE ○ unknown`); **event-driven visible state change was
  not** — the verification sent no prompt.
* **§ 7.1.2 — an unrecognised version degraded visibly to `unknown` in the real application.** New
  runtime evidence for the fail-closed path. It qualifies no version and adds nothing to the list.
* **§ 5.1 — reporter provenance is unresolved.** Unchanged by either run, and still a production
  blocker. A badge being visible does not make it authenticated.

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

Resolved, changed, or added in revision 3:

13. **RESOLVED — item 1, `Notification` at runtime.** It fired naturally in the real application and
    was accepted → `attention` (§ 3.5). **What triggered it is still unknown** (idle notification vs
    permission prompt), so the signal is proven to arrive while its *meaning* remains uncharacterised.
14. **RESOLVED for rendering, PARTLY OPEN for animation — item 11 (revised in revision 4).** The
    main → IPC → preload → renderer path is proven in the real Electron application, **and the badge
    is now human-verified as rendering** in the pane header (§ 7.1). What remains open is narrower
    than revision 3 claimed: **the visible chip was never watched changing as events arrive**, because
    the verification that saw it sent no prompt, and the run that sent prompts was not watched for
    visible transitions.
15. **STILL OPEN — item 3, the live Dockview drag.** Offered in the running app and declined; kill
    criterion 2 stays NOT SATISFIED.
16. **STILL OPEN — items 2, 4, 5, 6, 7, 8, 12.** `StopFailure` remains **UNVERIFIED**; `SessionEnd`
    was **not observed in this run** (Electron was force-stopped rather than Claude exited cleanly),
    though revision 1 did observe it under 2.1.196.
17. **WITHDRAWN (revision 4) — "why the badge is invisible".** This item asserted that `.term-head`
    does not exist in the renderer markup. **That was false** — it is created in
    `app/renderer/agent-dom.js` and is the visible pane header (§ 7.1.1), the badge was never
    invisible, and the item's premise was withdrawn after an independent `VERDICT: FAIL`. The
    methodology defect that produced it is recorded in § 7.3. **Replaced by a real open item:**
    whether the visible chip *updates on screen* as events arrive (see item 14).
18. **NEW — the origin of the second model turn** (§ 3.4). Unexplained, and it put the run one turn
    over the authorized budget.
19. **PROVIDER-UPGRADE BEHAVIOUR — narrowed, NOT generalised (supersedes item 10's scope).** The
    prototype has now been exercised against **two** builds: npm `2.1.196` (revision 1, via the probe)
    and `.local\bin\claude.exe` `2.1.220` (revision 3, via the real application). Across that one
    transition the hook mechanism kept working: the same event names fired and the same reporter
    handled them unchanged. **That is a two-point observation, and it is the entire extent of the
    claim.** It does not establish that hooks survive upgrades in general, that event names are
    stable across other versions, or that the next release will behave this way — § 7.5 of the
    procurement record records drift by removal as well as addition. The exact-match pin exists
    precisely so an unexercised build degrades visibly to `unknown` instead of being assumed fine.

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

### 12.1 REVISION 3 — what the real-application run changed in this answer

**Stronger than revision 2 could claim:**

* **The mechanism now has T4 evidence inside the real product**, not through a probe. Main, the store,
  the named pipe, the preload boundary and the renderer subscription all carried six real events to
  correct states, against **the executable a pane actually launches**. Recommendation item 1 is done.
* **`Notification` — the highest-value signal — was observed live** and mapped to `attention`
  (§ 3.5). Revision 2's "one honest complication" (the most useful state was the unproven one) is
  **partly retired**: the signal arrives. What triggers it is still uncharacterised, so item 2 is
  narrowed, not closed.
* **Single-pane containment is a runtime fact**, not a data-structure argument (criterion 9).
* **Reversibility is a runtime fact**: byte-identical restoration of the real user file (§ 8.2).

**Weaker, or newly exposed, and therefore recorded against the approach:**

* **CORRECTED IN REVISION 4 — this bullet previously said the display was the least-verified part
  and that "the operator could not see a badge". That was withdrawn after an independent
  `VERDICT: FAIL`.** Blue subsequently saw `PROTOTYPE ○ unknown` rendered in the pane header (§ 7.1),
  so **static rendering is human-verified** and revision 2's stub-DOM coverage turns out to have
  modelled production correctly. What is genuinely unproven is narrower: **no one has watched the
  chip change on screen as events arrive.** § 3.5 proves the states reach the renderer callback;
  visible transition remains unobserved, so a production decision still should not treat § 3.5's six
  events as proof the feature works *for a user*.
* **Kill criterion 2 is still not satisfied** after two attempts to get it observed.
* **Trusted event provenance remains unresolved** (§ 5.1) and is untouched by this run.

**The net position after revision 4: the transport, the privacy boundary, the reversibility, and now
STATIC BADGE RENDERING are demonstrated; the trust model is not, and neither is visible state
animation or identity through a Dockview move.** A hooks-first production design still has to solve
provenance. It no longer has to prove the badge renders at all — that is settled — but it does have to
show the chip visibly tracks the agent, and that it survives a pane move.

---

## 13. Authorization state, unchanged

Tracked record: **`docs/OSS-PROCUREMENT-pane-status.md`**.

> BLUE SUBSYSTEM VERDICT: PROTOTYPE

Bounded Experiment A only. **Production pane-status specification and implementation, Experiment B,
all app-server runtime testing, merge, and push remain unauthorized.** No production verdict is issued
or implied by this document, and no second provider was begun.
