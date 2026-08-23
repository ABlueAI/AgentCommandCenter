# Builder handoff — pane-status production implementation (Claude Code only)

Branch: `feature/pane-status-production-claude`
Fork / pre-merge `main`: `83cacf9333e9ed05b3ef137a21a619a1070fd004`
Work order: Work Order 2 — Pane-Status Production Implementation (consolidated authoritative version)

---

## 0. READ THIS FIRST — three things that change how you review this branch

### 0.1 The builder was Opus, not Fable. The planned reviewer is disqualified.

The work order routes **Builder → a fresh Claude Fable session** and **Reviewer → a separate fresh
Claude Opus session**. This branch was built by **Claude Opus 5**, on Blue's explicit instruction after
the routing conflict was raised and he reaffirmed it.

Consequence, stated plainly because this repo's own precedent makes it binding: every commit on this
branch carries `Co-Authored-By: Claude Opus 5`. Git author/committer is `ABlueAI` on every commit in
this repository, so **the `Co-Authored-By` trailer is the only provenance signal**, and by the
precedent already recorded for the `2ef73c39` lineage, **Claude is disqualified from reviewing this
branch**. The cumulative Full-class review must come from a non-Claude reviewer.

### 0.2 The work order's illustrative hook command does not work. The gate caught it.

§ 2 of the work order describes a "preferred structure" whose outer command is, in effect:

    cmd.exe /d /s /c  "<shim>" >nul 2>nul & exit /b 0

**That command silently does nothing.** It was measured, not assumed. Two independent defects:

* Claude Code spawns exec-form hooks with `spawn(command, args, {env, cwd, detached, windowsHide})` —
  **no `shell`, and no `windowsVerbatimArguments`**. Windows MSVCRT argv quoting therefore applies, and
  it escapes an inner quote as `\"`, which `cmd.exe` cannot read. cmd reports
  `'\"C:\...cmd\"' is not recognized` — and with the trailing `& exit /b 0` even that is suppressed,
  so the observable result is **exit 0, empty stderr, reporter never runs**.
* `/s` makes it worse rather than better: it strips the first and last quote, unquoting any path that
  contains a space.

The shipped encoding passes the tokens as **separate argv elements** and lets the encoder do the
quoting, then caret-escapes cmd metacharacters **and the space**:

    command: <absolute cmd.exe>
    args:    ["/d", "/c", "<caret-escaped shim path>", ">nul", "2>nul", "&", "exit", "/b", "0"]

Evidence and the full candidate matrix are in § 3 below.

### 0.3 ENROLLED PER-TOOL-CALL OVERHEAD IS NOT YET MEASURED

> **ENROLLED PER-TOOL-CALL OVERHEAD IS NOT YET MEASURED.**
> **PRETOOLUSE AND POSTTOOLUSE PRODUCE TWO REPORTER INVOCATIONS PER TOOL CALL.**
> **THIS IS A REQUIRED CONTROLLED-LIVE ACCEPTANCE MEASUREMENT, NOT EVIDENCE ESTABLISHED BY THE
> 200-RUN UNENROLLED HARNESS.**

The 200-run harness measured the **unenrolled** chain at **p50 336 ms**. Two invocations per tool call
implies roughly **0.67 s of added latency per tool call** if the enrolled path costs the same — and
nobody has shown that it does. Treat the number as a floor, not a result.

---

## 1. Binding procurement record

`docs/OSS-PROCUREMENT-pane-status.md`, § 13. Blue's verdict, verbatim:

> APPROVE BUILD FRESH VERDICT
>
> BUILD FRESH — Pane status: build Blue Helm's production pane-status subsystem as an advisory-only,
> human-facing indicator using official provider lifecycle interfaces and the reviewed Experiment A
> architecture. Provider events are unauthenticated hints and must never authorize or automatically
> trigger merge, push, approval, pane closure, process control, restart, credential access, or another
> consequential action. Begin with Claude Code only; fail closed to `unknown` for unverified versions;
> require explicit reversible hook setup and removal; keep logs metadata-only; preserve the
> Experiment A provenance limitation as an accepted residual.

Canonical verdict line, at the foot of § 13: **`BLUE SUBSYSTEM VERDICT: BUILD FRESH`**

---

## 2. What was built

Fourteen production modules under `app/pane-status/`:

| Module | Responsibility |
|---|---|
| `pane-status-protocol.js` | the pure `{v,e,t}` wire contract; eight events; exact key set |
| `pane-status-registry.js` | pane/token isolation; `applyMessage` takes **no** `paneId` |
| `pane-status-pipe.js` | main-owned Windows named pipe; bounded, no network socket |
| `pane-status-reporter.js` | the hook child; reads only `hook_event_name`; always exits 0 |
| `pane-status-version.js` | exact-match, fail-closed version gate; injected resolver |
| `pane-status-freshness.js` | 120 s staleness, 5 s heartbeat, the PostToolUse rule |
| `pane-status-settings-doc.js` | ownership classification and preservation rules (pure) |
| `pane-status-settings-txn.js` | the two-resource transaction; CAS; CAS-guarded rollback |
| `pane-status-descriptor.js` | app-owned record, integrity hash, atomic durable write |
| `pane-status-lock.js` | in-process mutex + exclusive lock file + liveness proof |
| `pane-status-recovery.js` | startup reconciliation; **never** writes Claude settings |
| `pane-status-runtime-shim.js` | the exact hook invocation and shim text |
| `pane-status-controller.js` | setup state machine, heartbeat, orchestration |
| `pane-status-ipc.js` | four zero-argument invokes behind the canonical trusted-sender gate |

UI: `app/renderer/pane-status-badge.js` now carries both the pane badge and the compact **Claude
status** control in the Terminals toolbar. PROTOTYPE presentation is gone. Badge state is keyed only by
pane ID; re-attachment is wired into Dockview's `onDidLayoutChange`.

Retired: `app/prototype-pane-status/` (14 files). Experiment A evidence is preserved in git history and
in `docs/PROTOTYPE-EVIDENCE-pane-status-claude-hook.md`.

---

## 3. Hard discovery gate (§ 2) — PASS, 22/22

Run entirely in a temporary directory outside the repository. No commits, no hooks installed, no Claude
settings read or written.

**Argv-encoding matrix.** Eight candidate encodings × verbatim/non-verbatim. Under the non-verbatim
(exec-form) regime that Claude Code actually uses, only one form works:

| Candidate | non-verbatim | note |
|---|---|---|
| `/d /s /c  "<shim>" >nul 2>nul & exit /b 0` | **FAIL, silently** | the work order's illustrative form |
| `/d /c     "<shim>" >nul 2>nul & exit /b 0` | **FAIL, silently** | inner quotes become `\"` |
| `/d /c     "<shim>"` (bare) | **FAIL** | stderr: `'\"C:\...cmd\"' is not recognized` |
| `/d /c  <shim> >nul 2>nul & exit /b 0` **as separate args** | **PASS** | shipped |

**Path safety (case E).** Twenty directory-name classes measured end to end. Raw, the encoding fails on
`&`, `^`, `(`, `)`, `;`, `,`, `=`, `+` and on paired `%`. Caret-escaping metacharacters **and the
space** gives **17/17**; escaping metacharacters but *not* the space fails on `lab &dir` and `lab ^dir`,
so the space is part of the rule. **Paired `%` is irreducible** — cmd expands `%VAR%` before caret
processing — and is REFUSED with a visible reason rather than encoded wrongly.

**Cases A–D**, all measured against the real shim, real Electron-as-node, and a real named pipe:

* **A — unenrolled**: exit 0, prompt exit with stdin still open, no window, no residual process, zero
  stdout/stderr escape. With a 400 KB payload our write could not complete, which *proves* the reporter
  never drained stdin. See § 7 for the EPIPE consequence.
* **B — enrolled traversal**: exactly one well-formed `{v,e,t}` reached the pipe; **not one** of the
  seven poisoned payload fields did, not even the tool *name*. All eight events traverse; a
  non-allowlisted event sends nothing and still exits 0.
* **C — three-layer zero exit**: outer cmd failure, shim-reported failure, and reporter failure all
  terminate at exit 0 with no output.
* **D — stranded hooks**: shim absent, shim unreadable, Electron missing, reporter missing, Electron
  exits nonzero, reporter throws — all silent, nonblocking, exit 0.

These fixtures are now a tracked suite, `app/pane-status/pane-status-chain.test.js`, so the invocation
cannot silently rot. The three modules the gate exercised were copied into the repository
**byte-identically** (SHA-256 verified at copy time).

---

## 4. Windows atomic replacement (§ 12) — automated

`app/pane-status/pane-status-atomic.test.js` re-measures on **every run**, on both runtimes:

| Runtime | rename-over-existing | `r+` fsync | read-only fsync |
|---|---|---|---|
| system Node 24.18.0 | **100/100** | OK | **EPERM** |
| Electron 42.5.0 / Node 24.17.0 | **100/100** | OK | **EPERM** |
| production `atomicWriteFileSync` | **100/100** with verified read-back, no temp files left | — | — |

This independently reproduces the measurements the work order recorded as already established. There is
**no copy-over fallback** — asserted by source scan, because a non-atomic fallback would silently
remove the property the whole two-resource protocol rests on.

---

## 5. Gates (§ 21)

| Gate | Result |
|---|---|
| Focused pane-status suites (15) | **703 assertions, 0 failures** |
| Complete app gate (`npm test` in `app/`) | **exit 0 — 76 suites, 5,036 assertions, 0 failures** |
| Complete Pester gate (`scripts\run-pester.ps1`) | **exit 0 — 955 passed, 0 failed, 0 skipped** |

**Baseline reconciliation** against 4,893 at `83cacf9333e9ed05b3ef137a21a619a1070fd004`:

| Component | Δ |
|---|---|
| five retired prototype suites (157 + 106 + 105 + 78 + 72) | **−518** |
| old `pane-status-badge` suite, replaced | **−45** |
| fourteen new `app/pane-status/*.test.js` suites | **+617** |
| new production `pane-status-badge` suite | **+86** |
| `launcher-fence-invariant` re-pin (21 → 24) | **+3** |
| `dockview-default-path` (380 → 380, one assertion swapped for one) | 0 |
| `admission-budget` (comment/target change only) | 0 |
| **Total** | **4,893 − 563 + 706 = 5,036** ✔ |

The −518 and −45 figures were measured by running those exact suites at the fork in the clean `main`
worktree, not inferred.

Format reconciliation: 74 suites report `N passed, M failed` (5,018 assertions) and 2 report
`N assertions passed` (18), totalling 5,036.

> **CORRECTED — see § 9.3.** The **total of 5,036 is right and was confirmed by re-running the
> complete gate at this exact commit**, but the sentence above misdescribes how it is reached. This
> repository emits **five** summary shapes, not two, and **16 of those "74 suites" print no suite name
> at all**. A reconciliation anchored on a suite name loses six of them entirely; one anchored on
> `<anything>: N passed` reads another ten suites' `"17 tests"` as if it were a suite name and gets
> the right number by luck. § 9.3 gives the measured breakdown, and
> `app/test-summary-formats.test.js` now fails visibly if a sixth shape appears.

### 5.1 Gate honesty — the app gate was run four times, and why

§ 21 says run each gate once and do not retry to manufacture green. Disclosed in full: the complete app
gate ran **four** times. The first three failed, each on a **real defect this change introduced**, and
each was fixed rather than re-run hoping for a different result. No gate was ever re-run without a
code change in between.

1. **Run 1 — FAIL.** `dockview-default-path`: a pin asserting the *prototype* renderer token is
   forwarded conditionally. The token no longer exists. Re-pinned to the stronger production property
   (`PANE_STATUS_RENDERER_ARG` must not appear at all).
2. **Run 2 — FAIL.** `dockview-app-integration`: `Uncaught ReferenceError: paneStatusBadge is not
   defined` in three scenarios. A **genuine bug in my wiring** — `reattachPaneStatus` lives in
   `buildDockviewHost()` while the badge was declared inside `boot()`, a different scope. Fixed by
   hoisting the holder to module scope. This is exactly the defect the integration gate exists to
   catch, and it would have shipped a broken renderer.
3. **Run 3 — FAIL.** `launcher-fence-invariant`: the byte/SHA pin on the `pty-start` handler, plus two
   content assertions naming prototype-only symbols. Re-pinned with the previous pin retained inline
   for provenance.
4. **Run 4 — PASS**, exit 0, zero failures.

---

## 6. What was NOT done — and must not be read as done

* **No real Claude settings were read or written.** Every suite injects temporary paths;
  `pane-status-isolation.test.js` scans every other suite in the directory and fails if any calls
  `os.homedir()`, reads `USERPROFILE`/`HOME`, calls `app.getPath()`, or names a real
  `.claude` settings file.
* **No hooks were installed anywhere.**
* **No provider session was opened. No prompt was submitted. No model turn was consumed.**
* **No controlled live acceptance was performed.**
* **The branch has not been merged or pushed.**
* **The builder did not review this work.**

### 6.1 The version entry is PROVISIONAL

`SUPPORTED_CLAUDE_VERSIONS` contains exactly one exact string, `'2.1.228'`, added by the single
authorized read-only probe (§ 18) on this acceptance machine:

    command (the app's own resolution path) : `claude --version`, execFile, shell:false
    resolved executable                     : C:\Users\levij\.local\bin\claude.exe
    raw output                              : "2.1.228 (Claude Code)\n"
    exit                                    : 0

No provider session, no prompt, no model turn. **This records which version the app would launch — it
does not establish that the eight hook events fire as expected on that build.** A second probe is
required immediately before live acceptance; any path or version mismatch stops before the provider
session and requires a fresh provisional change, regenerated artifact, and fresh Full review.

### 6.2 Provenance limitation retained

The Experiment A provenance limitation stands as an accepted residual: a status message proves only
that *something* holding a valid pane token connected to the pipe. No new authentication scheme was
invented. That residual **voids automatically** if pane status ever becomes consequential or automated
— which is why § 15's isolation is asserted by negative-control tests rather than by intent.

### 6.3 Blue Helm 1.0 runtime scope

The 1.0 pane-status release runtime is the **unpackaged, developer-installed Electron application run
from this repository**. The later clean-machine/VM release item must install and exercise that same
documented developer runtime, including pane-status setup, reporter invocation, removal, and recovery —
pane status is **not** excluded from it.

**No packaged-runtime compatibility is claimed.** MSIX, Electron Forge, electron-builder, and the
family installer are untested. Deferred to 2.0 and recorded in `BLUE-HELM-MASTER-STATUS.md` under
*Deferred to Blue Helm 2.0 consideration*, with the specific reasons (the `runAsNode` fuse, packaged
path visibility, shared user-scope settings, uninstall-without-removal). `docs/COEXISTENCE-DELTA-2.0.md`
was **not** created, as instructed.

---

## 7. Findings a reviewer should weigh

1. **Unenrolled panes may produce an EPIPE warning on large payloads.** The reporter exits before
   reading stdin when the pane is not enrolled — which the work order specifies, and which is the
   strongest possible statement about what it did with the payload. Claude Code writes the payload to
   the hook's stdin and logs `Hook command closed stdin before hook input was fully written (EPIPE)`
   when that write cannot complete. In the 200-run harness with a realistic payload this happened
   **0/200** times, because small payloads fit the OS pipe buffer; the case A fixture with a 400 KB
   payload shows it *does* occur at size. This is a Claude-side log line, not a failure, and it cannot
   be fixed without reading the payload the reporter must not read. **Live-acceptance observation.**
2. **336 ms p50 for the unenrolled chain is not cheap**, and every Claude session on the machine pays
   it once per hook event while the hooks are installed — including sessions that have nothing to do
   with Blue Helm. User-scope installation makes that machine-wide. This is the explicit cost of the
   user-scope decision, not a defect.
3. **A live PID whose start time cannot be read is refused, not assumed recycled.** This was a real bug
   found by its own test during construction: the original code fell through to "different process" and
   would have cleared a lock whose owner might still be alive. Now `LIVENESS_UNKNOWN`.
4. **`classifyEvent` takes the RESOLVED display state, not the stored event.** That is what stops a
   late `PostToolUse` resurrecting a pane that has already aged into stale `unknown`. It is subtle and
   worth a reviewer's attention.
5. **Ownership is carried by the shim path, not by an invented field.** Claude Code validates hook
   entries against a strict schema; a marker field would be stripped or rejected. The install ID lives
   in the path, which makes ownership self-describing from the settings file alone — necessary because
   § 9 requires refusing rather than guessing when the descriptor is missing.

---

## 8. Review requested

**An independent, cumulative, Full-class review of `main...<content tip>` is requested.**

Per § 0.1, the reviewer **must not be Claude**: this branch carries `Co-Authored-By: Claude Opus 5`, and
this repository's precedent treats that trailer as the only provenance signal.

Review artifacts (pinned diff, independently generated twin, byte-identity result, `git diff --check`,
changed-path census) and the four SHAs are reported to Blue alongside this document rather than inside
it — a handoff cannot contain its own commit SHA, and recording them outside is what terminates the
tail recursion, per the precedent already set for the pane-status admission closeout.

**Stop point.** No merge, no push, no hook installation, no real settings mutation, no provider session,
and no live acceptance. Progress: **70%**.

---

# 9. CORRECTION ROUND — Work Order 4 + Binding Amendment A

Everything above this line describes the branch as it stood at `a71937e1`. That tip received an
**advisory FAIL**. This section records what was corrected and how it was proven.

**The advisory review's own limitation stands and is not withdrawn.** It was not the independent
cumulative Full review this branch requires: the reviewer was not a fresh Codex session, and its
findings are treated here as a competent list of defects to correct, not as a discharged review
obligation. Two of its statements were wrong and are corrected below (§ 9.7). **A fresh independent
cumulative Codex Full review of `83cacf93…new tip` is still required, and has not happened.**

The builder of this correction is the same Claude builder that authored `a71937e1`, on Blue's
instruction. **The builder has not reviewed its own correction and must not.**

## 9.1 Design-conformance pass (Amendment A § 1) — run BEFORE any code was edited

The two headline defects were not missing requirements; they were **silent departures from accepted
design**. So the first act of this round was to recover the accepted design and walk it.

Work Orders 1, 1R and 2-Amendment-A were never committed to this repository — they exist only in the
design session's transcript. They were recovered verbatim from it before any file was touched:
WO-1 (73,375 bytes), WO-1R (11,065), the WO-1R addendum response (69,674), and WO-2 Amendment A
(7,281). Every row below was checked against the working tree, not against the handoff.

### Silent design drops found

Three. All are corrected in this branch; all are reported here even though corrected, as Amendment A
§ 1 requires.

| # | Accepted design | What `a71937e1` actually did | Status |
|---|---|---|---|
| S1 | **WO-1 § J.1** — the setup control mounts in the existing Terminals `.term-bar`, in a `#paneStatusHost` placeholder, sibling of `.tts-controls`, immediately before `#newTermShell` | Queried `#terminals-toolbar`, `.term-toolbar`, `#term-toolbar` — **none of which exists in `index.html`**. Nothing mounted. The setup surface was unreachable in the running application. | **RESTORED** |
| S2 | **WO-1 § F.8 / WO-1R § E.2** — the version probe resolves `claude` through a PowerShell that mirrors the pane's launch, **without `-NoProfile`**, via `Get-Command` then `& $source --version` | `execFile('claude', ['--version'])` from Electron main, resolving against **main's** PATH. This is the exact defect the reviewed prototype's revision 1 had already been failed for. | **RESTORED** |
| S3 | **WO-1 § F.7** — on `p.onExit` the controller sets the pane to `exited` **immediately**, then revokes the token | `p.onExit` did not touch pane status at all. `controller.shutdown()` existed, was correct, and was **called from nowhere**. | **RESTORED** |

**No deviation from accepted design is retained in this branch.** There is no row below dispositioned
`DEVIATED — EXPLICITLY AUTHORIZED`, so there is no deviation authority to cite. The one place where
conformance would have required *changing* accepted design rather than restoring it is recorded in
§ 9.7 as a correction to the advisory review, not as a deviation.

### Conformance matrix — WO-1 §§ C–J

| Requirement (source) | Intended production behaviour | Implementing file | Proving test | Disposition |
|---|---|---|---|---|
| C.1 protocol | pure wire contract, exact key set, size-before-parse | `pane-status-protocol.js` | `pane-status-protocol.test.js` | IMPLEMENTED AS SPECIFIED |
| C.1 registry | `Map<paneId>`, `applyMessage` takes **no** paneId, constant-time compare | `pane-status-registry.js` | `pane-status-registry.test.js` | IMPLEMENTED AS SPECIFIED |
| C.1 pipe | named pipe only, per-run unique name, byte/connection/message caps | `pane-status-pipe.js` | `pane-status-pipe.test.js` | IMPLEMENTED AS SPECIFIED |
| C.1 reporter | reads only `hook_event_name`, fresh message, always exit 0 | `pane-status-reporter.js` | `pane-status-chain.test.js` | IMPLEMENTED AS SPECIFIED |
| C.1 version | resolve the pane's own command, exact-string allowlist, never semver | `pane-status-version.js` | `pane-status-resolution.test.js` | **RESTORED this round (S2)** |
| C.1 freshness | per-state bounds, heartbeat, `resolveDisplayState` | `pane-status-freshness.js` | `pane-status-freshness.test.js` | IMPLEMENTED AS SPECIFIED |
| C.1 controller | enrolment, revocation, heartbeat, **PTY-exit authority**, setup state | `pane-status-controller.js` | `pane-status-lifecycle.test.js` | **RESTORED this round (S3)** |
| C.1 preload bridge | `window.ccPaneStatus`, unconditional (WO-1R § 1 supersedes WO-1's "absent") | `app/preload.js` | `pane-status-ipc.test.js` | IMPLEMENTED AS SPECIFIED |
| C.1 badge | keyed by pane id, `reattach()` wired to the Dockview layout path | `renderer/pane-status-badge.js` | `pane-status-badge.test.js` | IMPLEMENTED AS SPECIFIED |
| C.1 setup view | compact control in the existing Terminals `.term-bar` | `renderer/pane-status-badge.js` (`resolveSetupHost`) | `pane-status-setup-mount.test.js` | **RESTORED this round (S1)** |
| C.1 settings split | pure document model vs I/O transaction | `…-settings-doc.js` / `…-settings-txn.js` | `…-settings-doc.test.js`, `pane-status-removal.test.js` | IMPLEMENTED AS SPECIFIED |
| D.1 lock target | a **new** lock over `~/.claude/settings.json`; `claudeJsonLock` not reused or cited | `pane-status-lock.js` | `pane-status-lock.test.js` | IMPLEMENTED AS SPECIFIED |
| D.2 three layers | in-process mutex + exclusive lock file + content-hash CAS | `pane-status-lock.js`, `…-settings-txn.js` | `pane-status-write-failure.test.js` | IMPLEMENTED AS SPECIFIED |
| D.3 ownership | exact-group equality, never marker-sniffing | `…-settings-doc.js` | `pane-status-removal.test.js` | **STRENGTHENED this round** — equality is now key-order-independent |
| D.4 setup order | classify → pure append → CAS → atomic write → verify → rollback | `…-settings-txn.js` | `pane-status-txn.test.js` | IMPLEMENTED AS SPECIFIED |
| D.5 removal | reads the **current** file, subtracts only exact owned groups | `…-settings-txn.js` | `pane-status-removal.test.js` | **RESTORED this round** — `a71937e1` performed no classification at all |
| D.6 crash recovery | both interrupted states benign and decidable | `pane-status-recovery.js` | `pane-status-recovery.test.js` | IMPLEMENTED AS SPECIFIED |
| E IPC | 4 invokes + 2 pushes, **no request body**, trusted-sender gate before any I/O | `pane-status-ipc.js` | `pane-status-ipc.test.js` | IMPLEMENTED AS SPECIFIED |
| E omissions | no setter, no paneId parameter, no token or path across the boundary | `pane-status-ipc.js` | `pane-status-ipc.test.js` | IMPLEMENTED AS SPECIFIED |
| F.1 events | exactly eight; `PostToolUse` refresh-only | `pane-status-protocol.js` | `pane-status-protocol.test.js` | IMPLEMENTED AS SPECIFIED |
| F.2/F.3 token | token is the sole pane selector; revocation on release | `pane-status-registry.js` | `pane-status-registry.test.js` | IMPLEMENTED AS SPECIFIED |
| F.4/F.5 bounds | `HEARTBEAT_MS=5000`, `MAX_NONTERMINAL_STALE_MS=120000`, worst case 125 s **derived** | `pane-status-freshness.js` | `pane-status-freshness.test.js` | IMPLEMENTED AS SPECIFIED |
| F.6 terminal | `failed`/`exited` never age to `unknown` | `pane-status-freshness.js` | `pane-status-freshness.test.js` | IMPLEMENTED AS SPECIFIED |
| F.7 pane release | **PTY exit → `exited` immediately, then revoke**; explicit close → `unknown/released` | `pane-status-controller.js`, `app/main.js` | `pane-status-lifecycle.test.js` | **RESTORED this round (S3)** |
| F.8 version binding | same interpreter, same flags, no `-NoProfile`, invoke the resolved source | `pane-status-version.js`, `app/main.js` | `pane-status-resolution.test.js` | **RESTORED this round (S2)** |
| F.9 fail-closed | version checked **first** in `resolveDisplayState` | `pane-status-freshness.js` | `pane-status-freshness.test.js` | IMPLEMENTED AS SPECIFIED |
| G.1–G.3 isolation | zero process creation / consequential action from any event path | all modules | `pane-status-isolation.test.js` | IMPLEMENTED AS SPECIFIED |
| G.4 residual | reporter provenance accepted, advisory-only, auto-void if it becomes an automation input | docs | § 6 above | IMPLEMENTED AS SPECIFIED |
| H acceptance | criteria 1 and 2 remain irreducibly manual and are reported separately | docs | § 6 above | IMPLEMENTED AS SPECIFIED |
| I census | predicted vs actual changed paths | — | § 9.8 | IMPLEMENTED AS SPECIFIED |
| J.1 UI placement | `#paneStatusHost` in `.term-bar`, empty in markup | `renderer/index.html` | `pane-status-setup-mount.test.js` | **RESTORED this round (S1)** |
| J.1 badge states | seven states, `unknown` always carries a reason | `renderer/pane-status-badge.js` | `pane-status-badge.test.js` | IMPLEMENTED AS SPECIFIED |
| J.1 Dockview | `reattach` wired for the first time, state keyed by pane id only | `renderer/app.js`, `dockview-prototype.js` | `pane-status-badge.test.js` | IMPLEMENTED AS SPECIFIED |
| J.2 D1–D8 | eight deviations from the prototype, all still in force | — | — | IMPLEMENTED AS SPECIFIED |
| J.3 open decisions | all four resolved by WO-1R and Blue's answers | — | — | NOT APPLICABLE (superseded) |
| J.4 R1–R8 | risks recorded, none silently closed | docs | § 6, § 7 | IMPLEMENTED AS SPECIFIED |

### Conformance matrix — WO-1R binding resolutions

| # | Resolution | Disposition | Evidence |
|---|---|---|---|
| 1 | bridge unconditional in the trusted window; installed-hook state is the gate | IMPLEMENTED | `preload.js:126` exposes unconditionally; `pane-status-ipc.test.js` |
| 2 | exactly eight events; `PreToolUse`→working, `PostToolUse` refresh-only-if-working; 120 s / 5 s / 125 s | IMPLEMENTED | `pane-status-protocol.js`, `pane-status-freshness.js` |
| 3 | spawn-rate risk re-rated to Medium; early exit; timeout; measurement plan | IMPLEMENTED | § 9.5; `pane-status-reporter.js` exits before reading stdin when unenrolled |
| 4 | version probe on the acceptance machine; provisional exact entry | IMPLEMENTED | § 9.4 |
| 5 | exact hook command and runtime; no system Node; no accidental Electron window; `nodeExe` eliminated | IMPLEMENTED | `pane-status-runtime-shim.js`; § 9.5 measured 0 windows |
| 6 | install identity in owner marker, descriptor, and lock; four-way cross-install classification | IMPLEMENTED | id appears in the shim path, `descriptor.installId`, `lock.installId`; `pane-status-removal.test.js` |
| 7 | descriptor `pane-status-installation.json` under userData; bounded metadata only | IMPLEMENTED | `pane-status-descriptor.js:33`; `FORBIDDEN_KEYS` enforced on write |
| 8 | explicit two-resource transaction state machine covering every crash point | IMPLEMENTED | `TXN` states; `pane-status-recovery.test.js` |
| 9 | pre-write CAS **and** CAS-guarded rollback; `reconciliation-required`; no torn-file fallback | IMPLEMENTED | **STRENGTHENED this round** — see finding 5, § 9.2 |
| 10 | removal targets the **descriptor's recorded** groups, not the current build's | IMPLEMENTED | `pane-status-removal.test.js` proves removal survives an upgrade-shaped difference |
| 11 | `clearStaleLock`: trusted sender, native confirm, PID + start time, byte-compare before unlink, never age-based | IMPLEMENTED | **STRENGTHENED this round** — see finding 7, § 9.2 |
| 12 | tracked manual recovery document | IMPLEMENTED | `docs/RECOVERY-pane-status-hooks.md`, extended this round |
| 13 | singleton scans cover production runtime only, excluding tests/docs/fixtures | IMPLEMENTED | `pane-status-isolation.test.js` § 2 |
| 14 | `BLUE-HELM-MASTER-STATUS.md` participates in the Full-class review | IMPLEMENTED | in the census |
| 15 | user-scope accepted; machine-wide spawn and uninstall hazards stay explicit | IMPLEMENTED | § 6; master-status deferred section |

### Conformance matrix — WO-2 Binding Amendment A

| # | Amendment | Disposition | Evidence |
|---|---|---|---|
| 1 | 1.0 runtime is the unpackaged developer Electron app; no packaged-runtime claim | IMPLEMENTED | § 6; master-status deferred section |
| 2 | full-chain invocation; zero exit at all three layers; official schema; `.cmd` never the executable | IMPLEMENTED | § 3, § 9.5 |
| 3 | zero process creation from any event path; exactly two injected exceptions | IMPLEMENTED | `pane-status-isolation.test.js` |
| 4 | version re-probe before live acceptance; never widen, never silently append | IMPLEMENTED | § 9.4 |
| 5 | 200-run full-chain measurement; enrolled path deliberately unmeasured | IMPLEMENTED | **now reproducible** — § 9.5 |
| 6 | assertion baseline reported with commit identity, reconciled across every format | IMPLEMENTED | **corrected this round** — § 9.3 |
| 7 | discovery gate is hard; the 30-point milestone is indivisible | IMPLEMENTED | § 3 |

## 9.2 The findings, and what each correction actually changes

| # | Severity | Correction | Regression proof |
|---|---|---|---|
| 2 | HIGH | The setup control now mounts through a **production** resolver (`resolveSetupHost`) that queries the real `.term-bar` and its `#paneStatusHost` placeholder. `app.js` no longer supplies a mount point at all, so a suite cannot make the integration work by injecting one. | `pane-status-setup-mount.test.js` builds its DOM **by parsing the real `index.html`** and drives the real `createSetupControl` with only a document and a bridge. |
| 3 | HIGH | Version resolution goes through one PowerShell with the pane's flags, **no `-NoProfile`**, `Get-Command` then `& $source --version`. Carried forward from the reviewed prototype including its revision-3 source-before-error ordering. | `pane-status-resolution.test.js`: A-vs-B fixture, flag parity read out of `main.js`, bare name appears exactly once, eight fail-closed branches. |
| 4 | MEDIUM | Removal **classifies before it mutates**, against the descriptor's recorded groups, with key-order-independent structural equality. Verification is install-ID-scoped across the whole document. | `pane-status-removal.test.js`, 78 assertions — the A–E case table below. |
| 5 | MEDIUM | `atomicWriteFileSync` tags the phase it reached; a failed write is re-classified by re-reading the file against the pre-transaction and attempted hashes. **Landed-but-unverified never writes IDLE.** | `pane-status-write-failure.test.js` injects all six required failure points. |
| 6 | — | `p.onExit` → `paneStatus.notePaneExit(id)`; `window-all-closed` → `paneStatus.shutdown()`, idempotent. | `pane-status-lifecycle.test.js`, including the dual-lifetime proof (§ 9.6). |
| 7 | — | The liveness resolver uses a bounded absolute PowerShell under the validated system directory. The no-op ternary is gone. | `pane-status-resolution.test.js` poisons PATH, Path, PATHEXT and ComSpec. |
| 8 | — | **Measured, and the code was right.** `+` does **not** break the chain. The comment claiming it did is withdrawn. | § 9.5. |
| 9 | — | `start()` resolves on `listening`. A pre-listen error fails the start; a post-ready error takes the subsystem out of READY. | `pane-status-lifecycle.test.js`, `pane-status-pipe.test.js`. |
| 10 | — | A `hooks` value that is an array, a scalar or null — or an event value that is not an array — is a **refusal**. An array is never spread into numeric keys. | `pane-status-settings-doc.test.js`, with the old transformation kept as a negative control. |
| 11 | — | A lock whose exclusive create succeeded but whose write or fsync failed is **cleaned up**, with identity proven by prefix match; a replacement by another process survives. | `pane-status-write-failure.test.js`. |
| 12 | — | Shim and descriptor deletion results decide the reported outcome. The descriptor is retained at `REMOVE_VERIFIED` while cleanup is incomplete, and startup finishes it. | `pane-status-write-failure.test.js`. |
| 13 | — | `scripts/pane-status-chain-perf.js`, tracked, temp-only, outside the production runtime tree. | `pane-status-isolation.test.js` § 4 proves nothing under `app/` requires it. |
| 14 | — | Assertion reconciliation corrected and made self-defending. | § 9.3. |

### Setup versus removal: cross-install classification (Amendment A § 2)

| Situation | SETUP | REMOVAL |
|---|---|---|
| No Blue Helm groups present | install | nothing to remove; cleanup proceeds (case C) |
| Our groups present and exact | refuse `already-installed` | **remove ours** (case A) |
| Our groups exact **+ another installation present** | refuse `owned-by-another-install` | **remove only ours; theirs preserved byte-for-byte and in order** (case B) |
| Our groups partial / modified / ambiguous | refuse | **refuse the whole operation**; settings, descriptor and shim all byte-identical (case D) |
| Only another installation present | refuse `owned-by-another-install` | **reconciliation-required** — never a claimed success (case E) |

**Byte-identity result for the preserved other-install groups:** in the case-B fixture, three foreign
groups are placed — two *before* ours in their event, one *after* — and after removal all three are
present, byte-identical, in the same events, in the same relative order. Verification compares
`(event, group)` pairs and deliberately **excludes the array index**, because removing our group
necessarily shifts every later index in that event; an index-sensitive comparison failed every
legitimate case-B removal, which is how that subtlety was found.

## 9.3 Assertion reconciliation — the previous explanation was wrong; the total was right

Amendment A § 3 forbade assuming the arithmetic. Measured:

**This repository's gate emits FIVE summary shapes, not two.**

| Shape | Form on stdout | Suites | Named? |
|---|---|---|---|
| A | `name: N passed, M failed` (template literal) | 62 | yes |
| B | `name: N passed, M failed` (concatenation) | 2 | yes |
| C | `basename: N assertions passed` | 2 | yes |
| D | `N passed, M failed` | 6 | **no** |
| E | `T tests: N passed, M failed` | 10 | **no** |

The previous handoff described this as "74 suites emitting `name: N passed, M failed` plus 2 emitting
`N assertions passed`". Sixteen of those 74 print no name at all. The consequence matters in both
directions: a reconciliation anchored on a suite **name** silently loses all six shape-D suites, and
one anchored on `<anything>: N passed` reads shape E's `"17 tests"` as if it were a suite name — and
takes the right number by luck. **The 5,036 total was correct; the account of how it was reached was
not**, which is exactly the condition under which a future suite goes missing unnoticed.

### Format-C evidence, run rather than assumed

    renderer/audio-module-health.test.js  ->  "audio-module-health.test.js: 9 assertions passed"
    renderer/tts-audio-contract.test.js   ->  "tts-audio-contract.test.js: 9 assertions passed"
                                                                          Format C total = 18

### Verdict on the three candidates Amendment A § 3 named

| Candidate | Verdict |
|---|---|
| Format A/B = 5,018 at `a71937e1` | **Value CONFIRMED, label CORRECTED.** 5,018 is A+B+D+E, not "A/B". |
| Format C = 18 at `a71937e1` | **CONFIRMED** by running both suites — 9 + 9. |
| Total = 5,036 at `a71937e1` | **CONFIRMED.** |

The `a71937e1` baseline was **measured, not reconstructed**: a temporary detached worktree at that
exact commit, its own complete app gate, counted under all five rules. That run is reported honestly
in § 9.9 — it exited 1.

## 9.4 Version probe — fixture proof and host proof, kept apart (Amendment A § 5)

**Automated fixture proof (construction).** `pane-status-resolution.test.js` proves the resolver
launches PowerShell with the pane's flags read out of `main.js`, that `-NoProfile` is absent, that the
script uses `Get-Command` and invokes the resolved source, that the bare name appears exactly once,
and — with an injected A-vs-B result — that the gate trusts **B**, the pane resolution.

**Read-only host comparison (2026-08-23, this machine).** No provider session, no prompt, no turn.

| | Method A (superseded: `execFile('claude', …)`) | Method B (production PowerShell resolver) |
|---|---|---|
| resolved executable | `C:\Users\levij\.local\bin\claude.exe` | `C:\Users\levij\.local\bin\claude.exe` |
| raw output | `2.1.228 (Claude Code)` | `2.1.228 (Claude Code)` |
| parsed | `2.1.228` | `2.1.228` |

**They agree today, so the historical divergence is NOT reproduced on this host, and no claim is made
that it was.** The divergent fixture is retained as construction proof. What the probe *did* show is
that the divergence **condition still exists**: `where.exe claude` lists three candidates on this
machine — the `.local\bin` executable and both npm shims — the same two installations behind the
prototype's revision-1 defect. They agree only because `.local\bin` currently precedes npm for both
resolution paths. A PATH or profile edit separates them again, and only method B follows the pane.

`SUPPORTED_CLAUDE_VERSIONS` remains **one provisional entry**, `2.1.228`. A third probe through
method B is required immediately before live acceptance; any difference stops the run.

## 9.5 Performance — now reproducible, and the `+` question settled

`node scripts/pane-status-chain-perf.js 200`, run 2026-08-23 on the correction tree:

| | |
|---|---|
| runs | 200, full chain `cmd.exe → args → shim → Electron-as-node → reporter.js` |
| p50 / p95 / max / min | **323.9 ms / 374.0 ms / 563.7 ms / 260.3 ms** |
| exit codes | `{"0": 200}` |
| stdout / stderr escaped | 0 / 200 and 0 / 200 |
| Electron process residue | 0 |
| Blue Helm windows appeared | **0** |
| enrolled? | **no** — the pane variables are deliberately absent |

> **ENROLLED PER-TOOL-CALL OVERHEAD IS NOT YET MEASURED. PRETOOLUSE AND POSTTOOLUSE PRODUCE TWO
> REPORTER INVOCATIONS PER TOOL CALL. THIS IS A REQUIRED CONTROLLED-LIVE ACCEPTANCE MEASUREMENT, NOT
> EVIDENCE ESTABLISHED BY THE 200-RUN UNENROLLED HARNESS.**

### The `+` metacharacter claim — withdrawn

A real full-chain fixture, spawned exactly as Claude Code spawns an exec-form hook:

| directory component | escaped as | exit | reporter ran? |
|---|---|---|---|
| `lab+dir` | `lab+dir` (unchanged) | 0 | **yes** |
| `lab +dir` | `lab^ +dir` (space only) | 0 | **yes** |
| `lab+&dir` | `lab+^&dir` (`&` only) | 0 | **yes** |
| `labdir` (control) | unchanged | 0 | **yes** |

cmd.exe does not treat `+` as a command-line metacharacter. **No escaping was added** — the code was
already right and the comment was wrong, so the comment was corrected. `CMD_META` remains
`/[&^()<>|;,= ]/g`.

## 9.6 The p.onExit comment, quoted verbatim, and the dual-lifetime proof (Amendment A § 4)

The existing comment, reproduced exactly as it stood at `a71937e1`:

> ```
> // V5b1: record pane->runId for a video-scout launch. This is stored internally ONLY (never
> // returned to the renderer). It intentionally OUTLIVES p.onExit below -- a finished run's report
> // stays openable until the pane is explicitly closed (pty-kill) or the window shuts down.
> ```
> ```
> // NOTE: onExit removes the PTY handle but deliberately does NOT remove the run-ID mapping (V5b1).
> ```

**Its rationale is correct and applies to the video-scout report mapping — a stored artifact.** A
finished run's report is still worth opening after the process that produced it has gone, so the
mapping must outlive `p.onExit` and is dropped only on explicit close or window teardown.

**That rationale does not extend to a pane-status bearer token or an active-state claim.** Pane status
is not a stored artifact; it is a live claim about a running program, backed by a token. Keeping
either alive past exit displays `working` for a process that no longer exists — a confidently wrong
display, the one thing the invariant forbids — and leaves a valid token with no legitimate holder for
the whole 120-second staleness window.

Both are now proven simultaneously in one test that drives the real controller and the **real**
`createRunIdRegistry`:

* pane status publishes `exited` and revokes its token on PTY exit;
* `videoScoutRunIds` still holds the completed run's mapping, byte-identical, after that same exit;
* explicit pane close still removes the video-run mapping;
* window teardown still clears it;
* `admissionBudget.notePaneExit(id)` and `admissionIpc.forgetPane(id)` are still called on exit.

The wiring itself is proven structurally against `main.js`'s real handler bodies, not against a
re-creation: `p.onExit` calls `notePaneExit` and does **not** call `videoScoutRunIds.remove`;
`pty-kill` does the reverse; `window-all-closed` calls `shutdown()` and still clears the mapping.

## 9.7 Two things the advisory review got wrong

Reported per Amendment A § 1's requirement to report findings rather than quietly absorb them.

1. **The assertion-format claim.** The advisory review counted one summary format and concluded the
   total was misreported. Measured, there are five formats and **the total was right**; it was the
   *description* that was wrong. Corrected in § 9.3 in the direction the evidence pointed, not the
   direction the review asserted.
2. **The `+` metacharacter claim.** Escaping `+` was proposed as a correction. A real full-chain
   fixture shows `+` needs no escaping. Adding it would have been superstition; the comment was
   corrected instead of the code (§ 9.5).

## 9.8 What changed in this round

**29 paths — 22 modified, 7 added, 0 deleted, 0 renamed.**

Added (7):

| Path | What it is |
|---|---|
| `app/pane-status/pane-status-removal.test.js` | finding 4 / Amendment A § 2 — the A–E removal matrix |
| `app/pane-status/pane-status-write-failure.test.js` | findings 5, 11, 12 — every injected failure point |
| `app/pane-status/pane-status-resolution.test.js` | findings 3 and 7 — which executable, both ways |
| `app/pane-status/pane-status-lifecycle.test.js` | findings 6 and 9 — PTY exit, teardown, transport readiness |
| `app/renderer/pane-status-setup-mount.test.js` | finding 2 — the control mounts in the REAL markup |
| `app/test-summary-formats.test.js` | Amendment A § 3 — a sixth summary shape fails visibly |
| `scripts/pane-status-chain-perf.js` | finding 13 — the reproducible 200-run harness |

Modified (22): `app/main.js` · `app/package.json` · `app/launcher-fence-invariant.test.js` ·
`app/pane-status/{controller, descriptor, ipc, lock, pipe, recovery, runtime-shim, settings-doc,
settings-txn, version}.js` · `app/pane-status/{isolation, pipe, settings-doc}.test.js` ·
`app/renderer/{app.js, index.html, pane-status-badge.js, pane-status-badge.test.js}` ·
`docs/BUILDER-HANDOFF-pane-status-production.md` · `docs/RECOVERY-pane-status-hooks.md`.

Two modifications are worth calling out because they are **assertions being changed**, which always
deserves scrutiny:

* `app/launcher-fence-invariant.test.js` — the `pty-start` handler byte/SHA pin moved (LF units
  13,864 → 14,993) because `p.onExit` now calls `notePaneExit`. Both previous pins are retained
  inline. Separately, an assertion there **pinned the defect in place**: it asserted
  `AGENT_CMD.claude, ['--version']` was present and labelled it "the SAME executable a pane launches".
  It was not, and it would have blocked finding 3's fix. It is replaced by three strictly stronger
  assertions — the resolver must go through the pane-equivalent PowerShell path, must resolve the same
  bare command name, and the direct-exec form must be **absent**.
* `app/pane-status/pane-status-pipe.test.js` — `server.start()` is now awaited, because it returns a
  promise that settles on `listening`. No assertion was weakened; six call sites gained `await`.

**A comment nearly broke an unrelated test, and that is recorded in the code.** A correction comment
in `main.js` quoted `pty.spawn('powershell.exe'…)` verbatim, which made
`admission-budget.test.js`'s source-order assertion find the comment instead of the real call. The
comment was reworded and now carries a note saying why it must not reproduce that text.

## 9.9 Gates, and how many times they ran

| Gate | Result |
|---|---|
| Focused pane-status suites (20) | **1,118 assertions, 0 failures** |
| Complete app gate (`npm test` in `app/`) | **exit 0 — 82 suites, 5,571 assertions, 0 failures** |
| Complete Pester gate (`scripts\run-pester.ps1`) | **exit 0 — 955 passed, 0 failed, 0 skipped** |

### Reconciliation, measured at both ends under all five shapes

| Component | Δ |
|---|---|
| baseline at `a71937e1ad0f2fdb77be9b852ff5066755157639` | **5,036** |
| six new suites (63 + 78 + 90 + 31 + 70 + 118) | **+450** |
| `pane-status-settings-doc` 43 → 81 (hooks-structure + deepEqual) | **+38** |
| `pane-status-isolation` 99 → 126 (perf-harness exclusion + two new suites scanned) | **+27** |
| `pane-status-badge` 86 → 104 (retained-refusal presentation) | **+18** |
| `launcher-fence-invariant` 24 → 26 (defect-pinning assertion replaced by three) | **+2** |
| suites retired | **0** |
| **new tip total** | **5,036 + 535 = 5,571** ✔ |

By shape at the new tip: A 62 suites + B 2 = **4,841**; C 2 = **18**; D 6 = **423**; E 10 = **289**.
82 summary lines for 82 registered segments — every one attributed.

### Honest disclosure of every complete-gate run

Three complete app-gate runs happened in this round. None was a retry of an unchanged tree.

1. **Correction tree, exploratory — exit 0.** Run after the code corrections and before the
   documentation, to find collateral breakage early. It found none, because the three real breakages
   (`launcher-fence-invariant`'s pin and its defect-pinning assertion, and `admission-budget`'s
   source-order assertion) had already been found and fixed by running those suites individually
   first.
2. **Baseline worktree at `a71937e1` — exit 1.** A temporary detached worktree, created solely to
   MEASURE the baseline rather than reconstruct it arithmetically. It failed 2 assertions in
   `admission-process-cas.test.js` — an eight-way concurrent process race — and because `npm test`
   chains with `&&`, the run aborted there and `renderer/admission-view.test.js` never executed. On
   the same tree, `admission-process-cas` passes **16/0 standalone**. **That suite is timing-sensitive
   under load, not broken**, and it is not a suite this branch touches. The baseline figure of 5,036
   is therefore the observed 4,900 plus the 2 assertions the flaky suite would have reported plus the
   134 from the segment that never ran — each of which was measured, not assumed. The worktree was
   removed afterwards.
3. **Correction tree, final — exit 0**, the run reported in the table above.

The Pester gate ran **once**, on the final tree: 955 / 0 / 0.

**One edit followed the final gate run**: the gate results in this section were written into this
document. No source file, no test, and no configuration changed after the gates ran — a fact the
pinned diff and the artifact hashes make checkable.

### Nothing real was touched

No real Claude settings were read or written; no hook was installed or removed; no provider session
was opened; no prompt was submitted; no model turn was consumed. The version probe and the `+`
fixture are read-only and temp-only. `pane-status-isolation.test.js` fails the gate if any suite names
a real settings path, calls `os.homedir()`, or reads `USERPROFILE`/`HOME`, and it now applies the same
rule to the performance harness.

## 9.10 Review requested

A **fresh independent cumulative Codex Full review** of `83cacf9333e9ed05b3ef137a21a619a1070fd004`
… the new tip. Not Claude: every commit on this branch, including this correction, carries
`Co-Authored-By: Claude Opus 5`, and by this repository's own precedent that disqualifies Claude as
reviewer. The builder has not reviewed this correction.

Live acceptance remains **NOT PERFORMED** and separately authorized.
