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

### 0.3 ENROLLED PER-TOOL-CALL OVERHEAD — ONE OBSERVATION, ONLY PARTLY ATTRIBUTABLE

> **CORRECTED BY WORK ORDER 16.** This banner previously read, in full, "ENROLLED PER-TOOL-CALL
> OVERHEAD IS NOT YET MEASURED." Work Order 15 took exactly one controlled enrolled measurement, so
> the unqualified claim is no longer true and is corrected here rather than left standing. The
> measurement and its disposition are in § 19.D.
>
> **PRETOOLUSE AND POSTTOOLUSE STILL PRODUCE TWO REPORTER INVOCATIONS PER TOOL CALL.**
> **ONE enrolled PreToolUse observation IS attributable to pane status: 382 ms at `num_hooks: 1`.**
> **The PostToolUse observation, 406 ms, is an AGGREGATE across two successful runtime hooks, and NO
> portion of it is assigned to pane status.**
> **THIS IS ONE CONTROLLED OBSERVATION. It is not a distribution, stability, p50, p95, or general
> performance claim, and it is still not evidence established by the 200-RUN UNENROLLED HARNESS.**

The 200-run harness measured the **unenrolled** chain at **p50 336 ms**. Two invocations per tool call
implies roughly **0.67 s of added latency per tool call** if the enrolled path costs the same — and
nobody has shown that it does. Treat the number as a floor, not a result.

One enrolled PreToolUse observation now exists (§ 19.D). One observation does not convert this floor
into a result, and it is deliberately **not** compared against the 200-run p50: a single sample and a
200-run distribution are not comparable quantities.

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

> **SUPERSEDED IN PART BY § 19.D (Work Order 16).** As written for the 200-run harness this said
> "ENROLLED PER-TOOL-CALL OVERHEAD IS NOT YET MEASURED"; one enrolled PreToolUse observation now
> exists. What still stands unchanged: **PRETOOLUSE AND POSTTOOLUSE PRODUCE TWO REPORTER INVOCATIONS
> PER TOOL CALL**, and **the 200-RUN UNENROLLED HARNESS ESTABLISHES NOTHING ABOUT THE ENROLLED
> PATH.** The table above remains an unenrolled result.

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

---

# 10. CORRECTION ROUND — Work Order 5, Binding Amendments B and C

## 10.1 What this round contains, and what it does NOT

This builder holds Work Order 4, Binding Amendment A, Binding Amendment B and Binding Amendment C.
**It does not hold the consolidated Work Order 5 body.** Amendment C names R3; the order that
enumerates R1 and R2 was never received. Only **R3** is corrected here.

Nothing in this section should be read as a claim that Work Order 5 is complete. If R1 and R2 exist,
they are untouched, and the next commit on this branch is expected to carry them.

Constraints still in force from Work Order 4, none of them relaxed by B or C: no self-review, no real
Claude settings access or mutation, no real hook installation or removal, no provider session or model
turn, no live acceptance, no merge, no push. `a71937e1` and `add8a4dc` are both preserved unamended.

## 10.2 The false-success inspection (Amendment B § 1)

Inspection was limited to the seven authorized files and their directly corresponding tests. No wider
subsystem audit was performed and no unrelated implementation was touched.

`pane-status-settings-doc.js` · `pane-status-settings-txn.js` · `pane-status-recovery.js` ·
`pane-status-controller.js` · `pane-status-badge.js` · `pane-status-ipc.js` · `preload.js`

Three candidates were raised. One is corrected (R3); two were ruled NO CORRECTION and are recorded
verbatim in § 10.4.

Also observed, and offered as an inspection note rather than a finding: **`preload.js` has no directly
corresponding test file.** Its pane-status surface is four zero-argument invokes, exercised only
indirectly through suites that read the preload source. This round did not change that.

Clean on inspection: the removal A–E classification, `retained` propagation from transaction to
renderer, and the recovery cleanup paths, which already check both results and refuse rather than
announce a completed removal.

## 10.3 R3 — removal now has a THIRD outcome (Amendment C § 1 and § 2)

### The defect

`createPublishers.send()` returns `false` in three distinct situations — the window is gone, it has no
`webContents`, or `wc.send` threw — and **every call site discarded that boolean.** The `catch` was
silent. A removal whose hook-removed notice was dropped still revoked every token and still returned a
plain `{ ok: true }`. The renderer kept presenting live pane badges over an installation that no longer
existed, and nothing in the log, the UI, or the return value said so.

This defeated a deliberate, documented ordering. The comment in `remove()` already said:

> ORDER MATTERS. Publish the honest reason FIRST, while the panes still exist to be addressed,
> and only then revoke. Revoking first would blank the badges and leave nothing to explain them.

Publishing first is worthless if the publish silently no-ops.

### The mechanism, exactly as Amendment C § 1 specifies it

1. **Commit the authoritative registry state as non-live BEFORE publishing.**
   `registry.setOverrideReason(HOOK_REMOVED)` runs first, so from that instant `registry.viewFor()`
   resolves every pane to `unknown` / `hook-removed`. The answer this process would give a refresh is
   already correct even if not one byte reaches the renderer. Publishing first and committing second
   would make *delivery* the source of truth, which is the defect itself.
2. **Attempt the existing publication**, while the panes still exist to be addressed.
3. **Revoke all tokens regardless of publication success.** These tokens authorise reports about an
   installation that is gone; a renderer that missed the notice is not a reason to keep minting trust.
4. Delivery confirmed → the normal successful-removal disposition.
5. Delivery returned `false` or threw → the filesystem transaction is **not** rolled back, tokens are
   **not** restored, and a bounded partial-success disposition is returned. The renderer action path
   then re-reads authoritative state over the existing `getSetupState()` path. If that refresh also
   fails, the prior presentation is retained and the operator is told explicitly that removal
   completed, the display could not be refreshed, and what is on screen may be stale.

### The third outcome

| Outcome | `ok` | `disposition` | On disk | Presentation |
|---|---|---|---|---|
| Full success | `true` | `complete` | removed | confirmed updated |
| **Filesystem success, presentation unconfirmed** | `true` | `presentation-unconfirmed` | **removed** | **not confirmed** |
| Refusal / failure | `false` | `null` | unchanged | `reason` + `detail` surfaced |

**This third disposition did not exist in the previously reviewed contract.** It is a new outcome on a
path a reviewer previously read as binary, and it therefore **requires fresh Full-class scrutiny** — it
is not a cosmetic addition to an already-reviewed shape.

It is deliberately **not collapsed into an unconditional `ok:true`**: a caller reading only `ok` would
announce a clean removal over a display that may still show live badges. It is equally **not an
`ok:false`**: the settings transaction is finished and correct, and presentation failure never rolls it
back — proven by comparing the on-disk result of a delivered and an undelivered removal, which are
identical.

### No new IPC surface

Amendment C § 1 permits expansion only if the existing mechanism is demonstrably insufficient. **It was
not insufficient.** The registry plus the existing `getSetupState()` refresh carried the whole
mechanism. Pinned by assertion:

- the channel table is **byte-for-byte the same seven channels** that existed at `add8a4dc`;
- `preload.js` is unchanged and still exposes **exactly four zero-argument invokes**, and the string
  `disposition` does not appear in it;
- the disposition travels **inside the existing remove response**, through the **same**
  `boundedDetail()` filter every other constant uses — the same shape `retained` already established.

No new channel, no new subscription, no new badge method, no new response-field family.

### Scope note on the delivery wrappers

The two wrappers (`deliverView`, `deliverSetupState`) are now the only places the controller publishes,
so *every* push in that module observes its result rather than discarding it. That is broader than the
`remove()` path alone, but it is confined to `pane-status-controller.js` — an in-scope file — and it is
what makes the disposition trustworthy: a counter that only some publishers increment would report
"confirmed" for a window that had already stopped answering.

## 10.4 F-2 and F-3 — NO CORRECTION (Amendment C § 4, carried verbatim)

> **F-2 — NO CORRECTION:** ok:true reflects a filesystem installation that genuinely completed. The
> authoritative version-mismatch setup state separately and honestly reports that the installed hooks
> cannot presently be used. This is not false success.

> **F-3 — NO CORRECTION:** No current producer returns ok:false without a non-empty reason. The
> defensive renderer condition is not presently reachable as a defect.

Neither was changed. The R3 renderer branch is keyed on `ok === true` plus the disposition, so it does
not disturb either ruling: the F-3 condition it sits beside is untouched.

## 10.5 Assertion reconciliation (Amendment C § 3)

Both figures below are parsed from **retained raw gate output**, not from recollection. The `add8a4dc`
baseline was re-demonstrated by checking that commit out into a detached worktree and running its own
complete gate; its format split was measured, not inferred.

Counting uses three ordered rules, because the shapes overlap: `^(\d+) tests: (\d+) passed` must be
tried before `^(.+?): (\d+) passed`, or a suite gets "named" `17 tests`.

**Baseline — `add8a4dc`, complete app gate, exit 0**

| Observed format | Suites | Assertions |
|---|---:|---:|
| named, standard — `<name>: N passed, M failed` | 64 | 4,841 |
| named, assertions — `<name>: N assertions passed` | 2 | 18 |
| unnamed, bare — `N passed, M failed` | 6 | 423 |
| unnamed, tests-prefixed — `T tests: N passed, M failed` | 10 | 289 |
| **Combined** | **82** | **5,571** |

82 summary lines against 82 registered segments — every segment accounted for. **This re-demonstrates
the expected 5,571 exactly.**

**This tree — R3 correction, complete app gate, exit 0**

| Observed format | Suites | Assertions |
|---|---:|---:|
| named, standard | 65 | 4,910 |
| named, assertions | 2 | 18 |
| unnamed, bare | 6 | 423 |
| unnamed, tests-prefixed | 10 | 289 |
| **Combined** | **83** | **5,640** |

83 summary lines against 83 registered segments — every segment accounted for.

**Exact delta: +69, entirely within the named-standard format**, and fully attributed by diffing the
two captures suite by suite:

| Suite | Baseline | Now | Δ | Why |
|---|---:|---:|---:|---|
| `pane-status-presentation` | — | 63 | **+63** | new suite (R3) |
| `pane-status-isolation` | 126 | 131 | **+5** | enumerates `pane-status/*.js`; one new file adds five per-file assertions |
| `test-summary-formats` | 118 | 119 | **+1** | enumerates suites and their summary shapes |
| every other suite | | | **0** | byte-identical counts |

63 + 5 + 1 = 69. **No unexplained assertions.**

A note on the two formats that cannot be told apart from output alone: the named-standard shape is
produced both by a template literal and by string concatenation. That distinction is a property of the
*source*, not of the gate output, so it is not presented above as two observed formats.

## 10.6 Gates

| Gate | Result |
|---|---|
| Complete app gate, this tree | **exit 0 — 83 suites, 5,640 assertions, 0 failures** |
| Complete app gate, `add8a4dc` baseline (detached worktree) | **exit 0 — 82 suites, 5,571 assertions, 0 failures** |
| Focused pane-status, 21 suites | **1,186 assertions, 0 failures** |

**The app gate did not split.** `dockview-bootstrap.test.js` passed in both complete runs, so no AGR
exception candidate arises from this round and none is submitted.

**AGR described accurately, per Amendment B § 3:** the Dockview-bootstrap failure is **historically
intermittent — not a deterministic known failure.** No stability claim is made here. Two green runs are
two observations, not evidence of stability, and no N≥20 campaign was run or is authorized. Had a run
hit it, admissibility as a named exception would have been **Codex's determination alone**, not the
builder's.

Pester was not re-run in this round: no PowerShell source was touched. It stood at 955/0/0 at
`add8a4dc`.

**Ordering disclosure.** The complete gate ran on the tree as it now stands, with one exception in the
same pattern as § 9.9: **this section was written into the handoff after the final gate run.** No
source, test, or configuration file changed after the gate.

## 10.7 Review requested

R3 introduces a removal outcome that did not exist in the reviewed contract, so this needs a **fresh
independent cumulative Codex Full review**, not a scoped one. Claude remains disqualified: every commit
on this branch carries `Co-Authored-By: Claude Opus 5`, and the builder has not reviewed this
correction.

Specific things worth a reviewer's attention:

1. Whether committing the registry override *before* publication is genuinely sufficient to make the
   authoritative state correct in every interleaving, or whether a caller can observe the window
   between the override and the revoke.
2. Whether treating a `publishSetupState` failure during the final `setSetupState` as part of the same
   disposition is right, or whether the disposition should reflect only the per-pane notice.
3. Whether the renderer's re-read closes the loop, given that a window which cannot receive a push may
   equally fail to answer an invoke — the stale-presentation warning is the fallback for exactly that,
   and it is the branch a reviewer should press hardest on.
4. Whether `preload.js` lacking a directly corresponding test suite is acceptable.

Live acceptance remains **NOT PERFORMED** and separately authorized. Enrolled per-tool-call overhead
remains **NOT MEASURED**.

---

# 11. WORK ORDER 5 COMPLETE — R1, R2 and R3 mapped separately

Work Order 5 landed in two parts: R3 arrived first via Binding Amendment C and was committed as
`567a53a`; R1 and R2 arrived afterwards as the required continuation and are committed on top of it.
Neither earlier tip was amended — `a71937e1`, `add8a4dc` and `567a53a` are all ancestors of the final
tip.

| | Finding | Where it lives | Suite | Assertions |
|---|---|---|---|---|
| **R1** | All-events removal verification | `pane-status-settings-doc.js`, `pane-status-recovery.js` | `pane-status-all-events-removal.test.js` | 62 |
| **R2** | Rejected renderer actions | `pane-status-badge.js` | `pane-status-rejected-action.test.js` | 68 |
| **R3** | Third removal outcome | `pane-status-controller.js`, `pane-status-ipc.js`, `pane-status-badge.js` | `pane-status-presentation.test.js` | 63 |

## 11.1 R1 — all-events removal verification

**The hole.** Every removal decision reasoned only over the events the *descriptor* names. A hook group
carrying our installation ID that had drifted to an event we do not install into was invisible to all
of it: every recorded event then read `absent`, removal took the already-absent branch, deleted the
shim and retired the descriptor — and the stray group stayed live in the settings file, invoking a
reporter that no longer existed, with the only record that could have found it now destroyed. The
interrupted-removal recovery path had the identical hole from all three REMOVE states.

**The rule.** Before direct removal or interrupted-removal recovery may report already-absent or delete
the shim or descriptor, the whole document is scanned for this installation ID. Anything of ours
outside the exact recorded groups means reconciliation: settings byte-identical, shim and descriptor
retained, no success reported.

**Implementation.** `strayInstallGroups(settings, recordedGroups, installId)` in the doc module returns
every group carrying our ID that is not one of the recorded groups *for the event it actually sits in*.
`classifyRemoval` consults it and returns `RECONCILE` / `removal-installation-group-outside-record`.
Recovery consults the same function before any cleanup and holds with `installation-group-outside-record`.

**Placement note, and it is deliberate.** The stray gate sits *after* the ambiguous and modified checks
but *before* the partial check. After ambiguous/modified because those describe in-place corruption at
recorded events, and a modified group still carries our ID — gating earlier would reclassify every
existing modified-group case as a stray and change behaviour a previous review already accepted.
Before partial because a group genuinely *moved* to an unrecorded event produces exactly the partial
signature, and "a group of ours is loose somewhere" is the more accurate and more actionable reason.

**Groups owned by other installations are never strays.** They are preserved byte-identically and in
their existing relative order. The test proves this non-vacuously: the foreign groups are built by
cloning a real installed group and swapping the ID inside the shim path in `args`, which is where
ownership actually lives — a hand-written plausible-looking group yields `installIdOf === null`, and
every coexistence assertion would then pass against an empty list. Absolute indices legitimately shift
when a group between two of theirs is removed, so the assertion pins `[event, group]` and array order,
not the index.

Covered: copied to an unrecorded event · moved to an unrecorded event · **all recorded groups gone with
one stray left behind** (the dangerous one, previously a silent already-absent cleanup) · genuinely
absent · coexistence with another installation · interrupted recovery from REMOVE_PENDING,
REMOVE_WRITTEN and REMOVE_VERIFIED · a genuinely clean interrupted removal still completing.

## 11.2 R2 — rejected renderer actions

**The hole.** The three bridge invokes were awaited inside a `try`/`finally` with no `catch`. A
rejection escaped `onAction()` entirely: an unhandled rejection, no log line, no refresh, and a toolbar
still presenting whatever it presented before with nothing to suggest doubt.

**The rule, implemented exactly.** Catch it; emit a fixed bounded metadata-safe line; attempt exactly
one `getSetupState()` refresh; render the authoritative state if that succeeds; otherwise retain the
prior presentation and state plainly that the action is unconfirmed, that setup state could not be
refreshed, and that the display may be stale.

**The leak is prevented structurally, not by careful wording.** The catch binding is deliberately
omitted — `catch { rejected = true; }` — so there is nothing in scope to print. The badge binds **no**
catch parameter anywhere in the file, asserted by count. Only the three action constants are ever
interpolated, so every line is bounded by construction. The test throws an exception carrying a path, a
key-shaped string, a token assignment, a 32-hex value, an environment variable name and a stack frame,
and proves none of them reaches any log line on either refresh path.

Exact visible log disposition, asserted verbatim for all three actions:

- refresh succeeds → **one** line: `[pane-status] <action> failed: the request did not complete.`
- refresh fails → **two** lines; the second names the action, says `UNCONFIRMED`, says the setup state
  could not be refreshed, and says the displayed pane status may be stale.

## 11.3 R3 — unchanged

R3 was not redesigned. R1 and R2 integration revealed no conflict with it: R1 acts inside the
transaction, before any presentation question arises, and R2's branch is keyed on a *rejected* promise
while R3's is keyed on a *resolved* one carrying `disposition === 'presentation-unconfirmed'`. The
third outcome and the IPC shape are exactly as committed in `567a53a`. Both suites assert the
non-interference directly: a resolving action triggers no R2 refresh, and a refusal triggers no R3
refresh.

## 11.4 Rulings carried verbatim

> **F-2 — NO CORRECTION:** ok:true reflects a filesystem installation that genuinely completed. The
> authoritative version-mismatch setup state separately and honestly reports that the installed hooks
> cannot presently be used. This is not false success.

> **F-3 — NO CORRECTION:** No current producer returns ok:false without a non-empty reason. The
> defensive renderer condition is not presently reachable as a defect.

## 11.5 Gates and reconciliation

| Gate | Result |
|---|---|
| Focused pane-status, 23 suites | **1,325 assertions, 0 failures** |
| Complete app gate | **exit 0 — 85 suites, 5,781 assertions, 0 failures** |
| Pester, re-run on this tip | **exit 0 — 955 passed, 0 failed, 0 skipped** |

**By observed summary format**, parsed from retained raw gate output:

| Observed format | Suites | Assertions |
|---|---:|---:|
| named, standard — `<name>: N passed, M failed` | 67 | 5,051 |
| named, assertions — `<name>: N assertions passed` | 2 | 18 |
| unnamed, bare — `N passed, M failed` | 6 | 423 |
| unnamed, tests-prefixed — `T tests: N passed, M failed` | 10 | 289 |
| **Combined** | **85** | **5,781** |

85 summary lines against 85 registered segments — every segment accounted for, none skipped.

**Exact delta from the demonstrated intermediate baseline of 5,640 / 83 at `567a53a`: +141**, attributed
by diffing the two captures suite by suite:

| Suite | At `567a53a` | Now | Δ | Why |
|---|---:|---:|---:|---|
| `pane-status-all-events-removal` | — | 62 | **+62** | new suite (R1) |
| `pane-status-rejected-action` | — | 68 | **+68** | new suite (R2) |
| `pane-status-isolation` | 131 | 140 | **+9** | per-file scans over two new files |
| `test-summary-formats` | 119 | 121 | **+2** | one per new suite |
| every other suite | | | **0** | byte-identical counts |

62 + 68 + 9 + 2 = 141. The isolation suite contributes **5 + 4**, not 5 + 5: its fifth per-file
assertion, "roots its writes in a temp directory", applies only to suites that write files, and the R2
suite writes none. **No unexplained assertions.**

**The app gate did not split**, in this round or the previous one. `dockview-bootstrap.test.js` passed,
so no AGR exception candidate arises and none is submitted. The failure remains **historically
intermittent, not a deterministic known failure**; three green complete runs across this branch are
three observations and are not a stability claim.

**Ordering disclosure.** The complete gate and Pester ran on the tree as it now stands, with the same
single exception as § 9.9 and § 10.6: **this section was written into the handoff after those runs.** No
source, test, or configuration file changed after the gates.

## 11.6 Review requested

A **fresh independent cumulative Codex Full review** of `83cacf93…` to the final tip. Claude remains
disqualified — every commit carries `Co-Authored-By: Claude Opus 5` — and the builder has not reviewed
any of R1, R2 or R3.

Worth pressing on:

1. **R1's gate placement** between the modified and partial checks (§ 11.1). It is a judgement call
   about which refusal reason is most useful, and it changes the reported reason for a moved group.
2. Whether reconciliation is the right disposition for a stray, versus a plain refusal.
3. **CORRECTED — the original claim here was wrong; see § 12.3.** This item asserted that
   `strayInstallGroups` treats an identical duplicate of a recorded group as a stray. It does not.
   Membership is set-style and matched by VALUE, so a byte-identical duplicate matches the recorded
   group and is not a stray. Duplicates are rejected one layer up, conservatively, through the existing
   ambiguous/duplicate classification.
4. R2's structural no-binding argument: it depends on nobody later adding a bound catch to that file.
   The assertion pins that, but a reviewer should decide whether a lint rule would be better.
5. `preload.js` still has no directly corresponding test suite.

Live acceptance remains **NOT PERFORMED** and separately authorized. Enrolled per-tool-call overhead
remains **NOT MEASURED**.

---

# 12. FULL-REVIEW CORRECTIONS — Work Order 7 + Binding Amendment A

The first independent Full review of this branch returned three findings. All three are corrected
here, in one commit on top of `d650d75`. Nothing was amended: `a71937e1`, `add8a4dc`, `567a53a` and
`d650d75` are all ancestors of this tip.

| Finding | Disposition |
|---|---|
| Provider absolute path disclosed to application logging | **CORRECTED** — bounded classification only |
| Stray reconciliation did not survive a restart | **CORRECTED** — re-derived at steady-state startup |
| Handoff claimed `strayInstallGroups` detects identical duplicates | **CORRECTED (documentation)** — the claim was false |

## 12.1 Provider-path disclosure

**The finding.** `createClaudeVersionResolver` logged `outcome.source` — the resolved absolute
executable path — on every successful resolution. `main.js` wires that logger to `tlog`, so the path
reached the Logs tab and from there into anything a log is copied into. It disclosed where the
operator's provider is installed. Nothing downstream needed it.

**The correction.** The success and failure lines now carry a fixed bounded classification: the
resolution method (`powershell-get-command`) plus the success/failure category. `outcome.reason` was
already one of a fixed set of constants and `outcome.version` is a parsed version, never a path.

**What did NOT change.** Version verification is not weakened and executable selection is untouched.
The same executable is resolved, the same one is probed, fail-closed exact-match gating still refuses a
version outside the allowlist. The path is preserved internally — it remains on the resolver's return
value and in the acceptance record — and reaches no sink. `record()` has exactly two callers, both
tests.

**Failures never carry the raw error.** `interpretProbe` reads only the truthiness of the error object
and maps it to a bounded constant. The raw error is never logged, returned, forwarded or stringified,
and the resolver does not reject — a failure is a bounded value.

**Sinks exercised — CORRECTED BY WO-9. The claim originally made here was overstated.**

The first version of this table listed seven sinks, and **two of them were modelled rather than
executed**. The independent reviewer found those assertions vacuous, and was right:

- *"Console output used by tlog"* replaced `console.log` around a resolver the test had built itself.
  **The real `tlog` was never on the stack**, so nothing it did could have been observed.
- *"Renderer main-error payloads"* watched `createPublishers`, which sends on the pane-status **view**
  and **setup-state** channels. `main-error` is a **different channel** that `tlog` writes directly.
  That assertion could not have caught a leak through `main-error` even in principle.

Both are now proven by executing the real route. `pane-status-disclosure-route.test.js` evaluates the
REAL `app/main.js` under a stubbed Electron and `child_process`, captures what the REAL `tlog` writes
to `console.log` and sends on `main-error`, and drives resolution through **main.js’s own**
`resolveVersion` dependency — the closure calling `createClaudeVersionResolver({…}).discover()` with
`log: (line) => tlog(line)`, captured from the real `createPaneStatusController({…})` construction
rather than reconstructed. If main.js stops routing provider resolution through `tlog`, that suite
fails: no console line and no `main-error` payload would appear.

| # | Sink | Proven by | How |
|---|---|---|---|
| 1 | **Real `tlog` console output** | `pane-status-disclosure-route` | real main.js booted; `console.log` captured; probe emissions separated from boot emissions |
| 2 | **Real `main-error` renderer payloads** | `pane-status-disclosure-route` | Electron stub records `webContents.send`; only `channel === 'main-error'` counts |
| 3 | Injected provider-resolution logger | `pane-status-path-disclosure` | same shape main.js hands to `tlog`; **not** evidence about tlog itself |
| 4 | Controller results | `pane-status-path-disclosure` | `install()` / `start()` return values, plus the controller log |
| 5 | IPC responses | `pane-status-path-disclosure` | every registered channel invoked through `registerPaneStatusIpc` |
| 6 | Setup-state reason and detail | `pane-status-path-disclosure` | `getSetupState().detail`, `.versionReason`, and the whole object |
| 7 | Resolver public boundary | both | the resolved value, and a rejection had one occurred |
| 8 | Pane-status view / setup-state channels | `pane-status-path-disclosure` | real `createPublishers` over a fake window — **not** `main-error`, and never cited as evidence about it |

**Non-vacuity is asserted before disclosure is checked.** The route suite asserts that at least one
real `tlog` console emission and at least one real `main-error` emission occurred, that every one of
them matches the version-resolution text rather than an unrelated startup message, and that they
carry the real `tlog` `[TIMING +Nms]` prefix — which only the real `tlog` produces.

> **NARROWED BY WO-11 — as first written, the prefix sentence above was wider than its proof.** The
> `[TIMING +Nms]` assertion ran against **console emissions only**; the `main-error` payloads were
> never prefix-checked. Both sinks are pinned as of WO-11, and the paired payloads are additionally
> asserted byte-identical. See § 14.3.

**Three fixtures, not two.** WO-9 added the case that had been missing:

| Fixture | Injected | Required classification |
|---|---|---|
| Successful resolution | `SOURCE_TAG` carries the poison path; version parses | `ok:true`, version `2.1.228`, **no** refusal reason |
| Pre-resolution process failure | `execFile` error carrying the poison path in `message`, `stack`, `cmd`, `path`, `spawnfile`, plus an errno | **exactly** `version-probe-failed` — not `provider-not-found`, not `version-command-failed` |
| **Post-resolution version-command failure** | `SOURCE_TAG` **present** with the poison path, then `ERROR_TAG` | **exactly** `version-command-failed` — not `provider-not-found` (the provider *was* found), not `version-probe-failed` (the process ran) |

The third fixture matters because it is the failure path on which an executable path **is** known:
`outcome.source` is non-null at failure time, so it is the one most able to leak. Per Binding
Amendment A § 1, redaction must remove the sensitive detail **without destroying the bounded
diagnostic distinction**, and each fixture asserts its exact classification survives.
**Non-vacuity first.** Before any absence is asserted, the suite proves presence: the successful probe
genuinely receives the poison path as its executable source, and the failing probe's injected error
genuinely carries it in `message`, `stack`, `cmd`, `path` and `spawnfile`. Both paths are then scanned
for the absolute path, its distinctive filename, and its distinctive directory. The raw error's errno,
message and stack frames are separately proven absent.

## 12.2 Stray reconciliation across restart

**The finding.** R1 made *removal* refuse when a group carrying our installation ID survives outside
the recorded groups, but steady-state startup never looked. The next launch classified the document as
installed-and-exact, reported clean, and the badge went green over a settings file that still had a
loose hook of ours in it. **Restarting laundered the problem.**

**The correction.** Steady-state recovery runs the same `strayInstallGroups` scan, with the same
current install ID, over all events — and returns reconciliation-required even when every
descriptor-recorded group is exact. Settings, descriptor, shim and every group are left unchanged.

**No persisted flag, deliberately.** The order forbids a flag that merely remembers a derivable
outcome, and it would be the wrong mechanism anyway: it would need its own invalidation story to avoid
outliving the condition it records. Recomputing from settings on every start is what makes the answer
survive a restart *and* what lets a genuine reconciliation clear it with no bookkeeping. The test pins
this directly — after the stray is detected, the descriptor file is **byte-identical** and its
transaction state is still `INSTALLED`.

**Precedence unchanged.** The steady-state gate sits after the existing MODIFIED / VANISHED /
OTHER_INSTALL / AMBIGUOUS branches, all of which already reconcile. Only the previously-clean
OWNED_EXACT path is affected, so no accepted classification precedence moved.

Proven: removal refuses · immediate state is reconciliation-required · a **second** controller over the
same bytes still says reconciliation-required · a **third** says it too, proving re-derivation rather
than a one-shot observation · REMOVE_PENDING, REMOVE_WRITTEN and REMOVE_VERIFIED retain the same safety
· foreign-install groups alone recover **clean** and stay byte-identical · once the stray is genuinely
reconciled by hand, the very next start is clean.

## 12.3 The identical-duplicate claim — corrected

The previous handoff (§ 11.6 item 3) stated that `strayInstallGroups` treats an identical duplicate of
a recorded group as a stray. **That was wrong.** Stated accurately:

- Membership is **set-style and matched by value**, so a byte-identical duplicate **matches** the
  recorded group and is therefore **not** a stray.
- Duplicate exact groups remain **conservatively rejected** through the existing ambiguous/duplicate
  classification: `classifyRecordedEvent` counts the groups at an event carrying our ID and returns
  `ambiguous` as soon as more than one is found.
- The stray scan is **not** claimed to detect them. The implementation was not changed to match the
  earlier inaccurate statement.

**Existing coverage, cited as required by Binding Amendment A § 2.** `app/pane-status/pane-status-removal.test.js`
§ D drives a refusal matrix that includes the case labelled `'a second copy of our group in one event'`,
which pushes a deep clone of `hooks.Stop[0]` back into `hooks.Stop`. For every case in that matrix it
asserts: removal refuses; the reason is `TXN_REFUSAL.REMOVAL_REFUSED`; `retained === true`; settings are
byte-identical; the descriptor is byte-identical; the shim is still present.

That covers the outcome but **not** the classification, and it does not prove both copies carry the
current installation ID. Those two gaps are closed by a new focused case
(`pane-status-all-events-removal.test.js` § 12), which additionally proves: both groups at the event
genuinely carry the current install ID and are byte-identical to each other; `strayInstallGroups`
returns **zero**; `classifyRemoval` returns REFUSE with reason `AMBIGUOUS`; and the per-event
classification for that event is `ambiguous`.

## 12.4 Accepted rulings preserved

R1's placement (after ambiguous/modified, before partial), R2's rejected-action behaviour, R3's
filesystem-success/presentation-unconfirmed disposition, and the F-2 and F-3 no-correction rulings are
all unchanged. The IPC channel table is still the same seven channels and `preload.js` is untouched.

> **F-2 — NO CORRECTION:** ok:true reflects a filesystem installation that genuinely completed. The
> authoritative version-mismatch setup state separately and honestly reports that the installed hooks
> cannot presently be used. This is not false success.

> **F-3 — NO CORRECTION:** No current producer returns ok:false without a non-empty reason. The
> defensive renderer condition is not presently reachable as a defect.

## 12.5 Gates

| Gate | Result |
|---|---|
| Focused pane-status, 24 suites | **1,434 assertions, 0 failures** |
| Complete app gate | **exit 0 — 86 suites, 5,891 assertions, 0 failures** |
| Pester | **exit 0 — 955 passed, 0 failed, 0 skipped** |
| `git diff --check`, cumulative and focused | clean |

**By observed summary format**, from retained raw output:

| Observed format | Suites | Assertions |
|---|---:|---:|
| named, standard | 68 | 5,161 |
| named, assertions | 2 | 18 |
| unnamed, bare | 6 | 423 |
| unnamed, tests-prefixed | 10 | 289 |
| **Combined** | **86** | **5,891** |

86 summary lines against 86 registered segments — every segment accounted for.

**Delta from 5,781 / 85 at `d650d75`: +110**, attributed by per-suite diff:

| Suite | At `d650d75` | Now | Δ | Why |
|---|---:|---:|---:|---|
| `pane-status-path-disclosure` | — | 76 | **+76** | new suite (§ 12.1) |
| `pane-status-all-events-removal` | 62 | 90 | **+28** | restart durability and duplicate cases |
| `pane-status-isolation` | 140 | 145 | **+5** | per-file scans over one new file |
| `test-summary-formats` | 121 | 122 | **+1** | one per new suite |
| every other suite | | | **0** | byte-identical counts |

76 + 28 + 5 + 1 = 110. No unexplained assertions.

## 12.6 AGR — not triggered by this round's gates; corrected observation history

**The narrow exception of WO-7 § 6 was NOT triggered by the gates run for this round.** The complete
app gate at `527451d` exited 0, `dockview-bootstrap` reported 203/0 and `dockview-app-integration`
296/0, so nothing was routed as an exception candidate and nothing was retried.

**That is not the whole picture, and the first version of this section wrongly implied it was.** The
independent Full review of `83cacf93...d650d75` ran its own complete gate and **did** hit the AGR
failure, in both Dockview suites. That review is an observation in its own right and is now recorded
below. Two consequences follow, and both correct statements made earlier in this document:

1. **Segment 15 now has an Electron-family failure.** The previous count said zero. The review's
   segment 15 failure occurred during the **suffix run** required by the exception procedure, and it
   was an Electron launch/profile/GPU failure — **not** the maximize product assertion.
2. The earlier caveat "segment 15's single failure is a product assertion and is explicitly outside the
   WO-7 § 6 exception" **no longer holds as written**. Segment 15 now has two failures of two different
   kinds: one product assertion (outside the exception) and one Electron-family failure (within it).

**Observation history (Binding Amendment A § 3).** Assembled from retained logs, the committed audit,
already-recorded runs, and the independent review's reported result. **No new runs, no repetitions and
no diagnostic campaign were performed for this table.** Each row is one execution context; the `Runs`
column makes the arithmetic explicit so every aggregate below can be checked against the rows.

| # | Date | Commit / tree | Execution context | Runs | Segment 14 | Segment 15 | Family / note | Evidence |
|---|---|---|---|---:|---|---|---|---|
| 1 | 2026-08-20 | app tree `e0aaaaab` | complete chain | **20** | **FAIL** | **UNRUN** (chain aborted at 14) | Electron child-launch: `render-process-gone`, `launch-failed`, GPU `0xC0000135`. **One campaign, one day.** | `docs/AUDIT-app-gate-reliability.md` |
| 2 | earlier | `8c6bfce` | complete chain | 1 | PASS | PASS | 67 suites / 4,888 assertions | audit § AGR-2 |
| 3 | earlier | `2ef73c39` | complete chain | 1 | PASS | PASS | 67 suites / 4,888 assertions | audit § AGR-2 |
| 4 | 2026-08-21 | `8ec8b78e` (tree `e0aaaaab`) | **standalone**, segment 14 only | 1 | PASS 203/0 | not exercised | Phase 2 run A, inherited env | Phase 2 A/B record |
| 5 | 2026-08-21 | `8ec8b78e` (tree `e0aaaaab`) | **standalone**, segment 14 only | 1 | PASS 203/0 | not exercised | Phase 2 run B, crashpad var removed | Phase 2 A/B record |
| 6 | 2026-08-21 | `8ec8b78e` | complete chain | 1 | PASS 203/0 | **FAIL** 290/1 | **product assertion** `maximized pane grew to the whole surface (100 -> 100)` — not the Electron family | audit / handoff |
| 7 | 2026-08-21 | `249af9a` | complete chain | 1 | PASS 203/0 | PASS 296/0 | Track B resolved as a gate-measurement defect | `fix/dockview-maximize-gate` |
| 8 | 2026-08-21 | `249af9a` | **standalone**, segment 15 only, targeted | **5** | not exercised | PASS (incl. 291/0) | the original Track B failure never reproduced on demand | audit / handoff |
| 9 | 2026-08-23 | `a71937e1` | complete chain | 1 | PASS 203/0 | PASS 296/0 | run exited 1 at `admission-process-cas` — a different suite, not Dockview | `appgate-a71937e.txt` |
| 10 | 2026-08-23 | `add8a4dc` | complete chain | 1 | PASS 203/0 | PASS 296/0 | WO-4 final gate | `appgate-final.txt` |
| 11 | 2026-08-23 | `add8a4dc` | complete chain | 1 | PASS 203/0 | PASS 296/0 | WO-5 R3 baseline re-measurement, detached worktree — a **second, separate** execution at the same commit | `gate-baseline.txt` |
| 12 | 2026-08-23 | `567a53a` | complete chain | 1 | PASS 203/0 | PASS 296/0 | WO-5 R3 | `gate-r3.txt` |
| 13 | 2026-08-23 | `d650d75` | complete chain | 1 | PASS 203/0 | PASS 296/0 | WO-5 R1 + R2 | `gate-final.txt` |
| 14 | 2026-08-23 | `83cacf93...d650d75` | complete chain — **INDEPENDENT FULL REVIEW** | 1 | **FAIL** | **UNRUN** in this execution (run separately as row 15) | Electron child-launch family | independent Full review report |
| 15 | 2026-08-23 | `83cacf93...d650d75` | **suffix run** required by the § 6 procedure — **INDEPENDENT FULL REVIEW** | 1 | not exercised | **FAIL** | Electron launch / profile / GPU failure. **NOT the maximize product assertion.** | independent Full review report |
| 16 | 2026-08-23 | `527451d` | complete chain | 1 | PASS 203/0 | PASS 296/0 | WO-7, this round — counted **once** | `gate-wo7.txt` |

**Segment 14 — counts derived from the rows above**

| Category | Count | Rows |
|---|---:|---|
| Green, complete chain | 10 | 2, 3, 6, 7, 9, 10, 11, 12, 13, 16 |
| Green, standalone | 2 | 4, 5 |
| **Green, total** | **12** | |
| Electron-launch / `0xC0000135`, **2026-08-20 campaign** | 20 | 1 |
| Electron-launch / `0xC0000135`, **independent Full review** | 1 | 14 |
| **Electron-launch, total** | **21** | |
| Product-assertion failures | 0 | — |
| Unrun (chain aborted upstream) | 0 | — |
| **Total executions in which segment 14 was exercised** | **33** | 12 + 21 |

**Segment 15 — counts derived from the rows above**

| Category | Count | Rows |
|---|---:|---|
| Green, complete chain | 9 | 2, 3, 7, 9, 10, 11, 12, 13, 16 |
| Green, standalone (targeted) | 5 | 8 |
| **Green, total** | **14** | |
| Electron launch / profile / GPU, **independent Full review suffix run** | 1 | 15 |
| Product-assertion failures (maximize `100 -> 100`) | 1 | 6 |
| Unrun, **2026-08-20 campaign** | 20 | 1 |
| Unrun, **independent Full review** complete chain | 1 | 14 |
| **Unrun, total** | **21** | |
| **Total executions in which segment 15 was exercised or recorded unrun** | **37** | 14 + 1 + 1 + 21 |

Rows 4 and 5 are excluded from every segment 15 count and row 8 from every segment 14 count: those
executions did not exercise the other segment at all, which is not the same as it being unrun because
the chain aborted. Row 15 is excluded from the segment 14 counts for the same reason.

**Caveats, stated rather than glossed.**

- These are documented observations only. **No missing run is inferred and no statistical stability is
  claimed, in either direction.** Twelve greens do not make segment 14 reliable, and twenty-one
  failures do not make it deterministic.
- The sample is **not uniform**. The twenty segment-14 failures come from a single deliberate
  measurement campaign on a single day (row 1) and are kept separate from the single independent-review
  failure (row 14) throughout. The greens are spread across different commits, environments, machines
  and purposes.
- **Standalone, complete-chain and suffix executions are not equivalent evidence** and are labelled
  separately everywhere above. A suffix run in particular starts a fresh Electron process outside the
  chain that normally precedes it.
- Segment 15's twenty campaign "unrun" observations are a *consequence* of segment 14 aborting the
  chain and say nothing about segment 15 itself. The same is true of row 14's single unrun.
- **The independent review's result is recorded from its report, not from a capture held by this
  builder.** Nothing was re-run to confirm it, and no AGR remediation was performed or is authorized.
- Additional complete-chain captures from this session exist in the scratchpad (`app-gate*.txt`,
  `appgate1.txt`) whose commit attribution cannot be established from the file alone. They are
  **deliberately excluded** from every count above rather than attributed by guesswork, so the table
  is a conservative subset of what was actually executed.

Whether the independent review's own run qualifies as an admissible exception candidate under WO-7 § 6
is **that reviewer's determination, not the builder's**.

## 12.7 Review requested

A **fresh independent cumulative Codex Full review** of `83cacf93…` to this tip. Claude remains
disqualified; the builder has not reviewed any of these corrections. Live acceptance remains **NOT
PERFORMED**; enrolled per-tool-call overhead remains **NOT MEASURED**.

**Ordering disclosure.** The complete gate and Pester ran on the tree as it now stands, with the same
single exception as §§ 9.9, 10.6 and 11.5: **this section was written into the handoff after those
runs.** No source, test, or configuration file changed after the gates.

---

# 13. DISCLOSURE-PROOF CORRECTION — Work Order 9 + Binding Amendment A

**What was wrong.** The WO-7 disclosure proof (§ 12.1) claimed seven sinks. Two of them were
**modelled, not executed**, and the independent reviewer found those assertions **vacuous**:

- The *"console output used by tlog"* sink replaced `console.log` around a resolver the test had built
  itself. **The real `tlog` was never on the stack.** An empty capture proved nothing.
- The *"renderer main-error payloads"* sink watched `createPublishers`, which sends on the pane-status
  **view** and **setup-state** channels. **`main-error` is a different channel**, written directly by
  `tlog`. That assertion could not have caught a leak through `main-error` even in principle.

Both criticisms are accepted in full. § 12.1's table is corrected in place rather than left standing.

**What replaces them.** A new suite, `app/pane-status/pane-status-disclosure-route.test.js`, executes
the real production route:

- It evaluates the **real `app/main.js`** through the `Module._load` pattern already established in
  `app/admission-main-startup.test.js`, with `electron`, `@lydell/node-pty` and `child_process` stubbed.
- It captures what the **real `tlog`** writes to `console.log`, and what it sends through
  `webContents.send` — counting **only** `channel === 'main-error'`.
- It drives resolution through **main.js's own `resolveVersion` dependency**: the closure that calls
  `paneStatusVersionMod.createClaudeVersionResolver({…}).discover()` and supplies `log: (line) => tlog(line)`.
  That closure is **captured from the real `createPaneStatusController({…})` construction** by wrapping
  the controller module in the loader hook — it is not a separately reconstructed equivalent. **If
  main.js stops routing provider resolution through `tlog`, this suite fails**, because no console line
  and no `main-error` payload would appear.

**Non-vacuity is asserted before any disclosure check.** Per fixture: at least one real `tlog` console
emission occurred; at least one real `main-error` emission occurred; every probe emission matches the
version-resolution text rather than an unrelated startup message; and the emissions carry the real
`[TIMING +Nms]` prefix, which only `tlog` produces. **NARROWED BY WO-11: as first written that last
clause was checked on console emissions ONLY — the `main-error` payloads were not prefix-pinned. Both
sinks are pinned as of WO-11; see § 14.3.** Probe emissions are separated from boot emissions
so a startup message can never be mistaken for evidence.

**Three fixtures, and the third is new.** Successful resolution; pre-resolution `execFile` failure; and
**post-resolution version-command failure** — `SOURCE_TAG` present carrying the poison path, then
`ERROR_TAG`. The third matters because it is the failure path on which an executable path **is** known
(`outcome.source` is non-null at failure time), making it the one most able to leak. It had no coverage
before.

**Classification survives redaction (Binding Amendment A § 1).** Each fixture asserts its exact
diagnostic outcome, so redaction removed sensitive detail without flattening the distinctions:

| Fixture | Required classification |
|---|---|
| Success | `ok:true`, parsed version `2.1.228`, **no** refusal reason |
| Pre-resolution failure | **exactly** `version-probe-failed` — not `provider-not-found`, not `version-command-failed` |
| Post-resolution failure | **exactly** `version-command-failed` — not `provider-not-found` (the provider *was* found), not `version-probe-failed` (the process ran) |

**No production source was changed.** No test seam was required: the loader hook reaches the real
wiring without touching `app/main.js` or any runtime module. Only test files and this document changed.

## 13.1 Verification

| Gate | Result |
|---|---|
| `pane-status-disclosure-route` directly | **58 passed, 0 failed** |
| `pane-status-path-disclosure` directly | **101 passed, 0 failed** |
| Focused pane-status, 25 suites | **1,522 assertions, 0 failures** |
| Complete app gate | **exit 0 — 87 suites, 5,980 assertions, 0 failures** |
| `git diff --check`, cumulative and focused | clean |
| **Pester** | **955 passed / 0 failed / 0 skipped — INHERITED from the independent run at `5074f5b`; not rerun because this correction changed only JavaScript tests and documentation, with all production and PowerShell sources byte-identical.** |

**By observed summary format:** named-standard 69 / 5,250 · named-assertions 2 / 18 · unnamed bare
6 / 423 · unnamed tests-prefixed 10 / 289 = **87 suites / 5,980**. 87 summary lines against 87
registered segments — every segment accounted for.

**Delta from the established 5,891 / 86 at `5074f5b`: +89**, attributed by per-suite diff:

| Suite | At `5074f5b` | Now | Δ | Why |
|---|---:|---:|---:|---|
| `pane-status-disclosure-route` | — | 58 | **+58** | new suite: the real production route |
| `pane-status-path-disclosure` | 76 | 101 | **+25** | third fixture and classification assertions |
| `pane-status-isolation` | 145 | 150 | **+5** | per-file scans over one new file |
| `test-summary-formats` | 122 | 123 | **+1** | one per new suite |
| every other suite | | | **0** | byte-identical counts |

58 + 25 + 5 + 1 = 89. No unexplained assertions.

**AGR was not triggered.** The complete gate exited 0 with `dockview-bootstrap` 203/0 and
`dockview-app-integration` 296/0. Nothing was routed as an exception candidate and nothing was retried.
This adds one green complete-chain observation for each segment to the § 12.6 history; the counts there
describe runs up to `527451d` and are not restated here.

**Runtime sources byte-identical.** The `app/` tree differs from `5074f5b` only by test files and
`app/package.json`'s test-chain registration; every runtime source file is unchanged, which is what
makes the inherited Pester result valid rather than assumed.

---

# 14. HARNESS-ISOLATION CLOSURE — Work Order 11 + Binding Amendment A

The independent review of `8c60962` found **three harness-isolation defects**. None was a production
disclosure defect — the redaction itself held — but all three weakened the proof, and one of them was
actively unsafe. All are corrected inside the existing suite; no new test file and no new registered
segment were added, so the app gate stays at **87 suites**.

| Defect | Severity | Disposition |
|---|---|---|
| Leaked `uncaughtException` listeners across fixtures | **unsafe** — accumulating handlers over torn-down fixtures | **CORRECTED** |
| Shallow `child_process` mock left real process APIs reachable | **unsafe** — a startup path could have spawned for real | **CORRECTED** |
| `[TIMING +Nms]` pinned on console only, claimed for both sinks | overstated proof | **CORRECTED, and the claim narrowed in place** |

## 14.1 Leaked process listeners

**What was wrong.** Loading `main.js` registers process-level handlers, `uncaughtException` among
them, and the harness removed none of them. Three fixtures meant three accumulating handlers, each
holding a closure over a fixture that had already been torn down. The leak is now **proven, not
assumed**: each fixture asserts that `main.js` really did introduce an `uncaughtException` listener
before asserting that it was removed, so the cleanup assertions cannot pass vacuously.

**The correction.** A single `ORIGINAL_LISTENERS` snapshot is taken at module scope, **before any
evaluation of `main.js`**, recording every `process.eventNames()` entry and the identity *and order*
of every `process.rawListeners(event)` result. It is passed into each fixture explicitly, and each
fixture asserts `baselineUsed === ORIGINAL_LISTENERS` — so fixtures 2 and 3 provably do **not** adopt
the preceding fixture's post-state as their baseline, which would have normalised an earlier leak.

In `finally`, only listeners introduced *after* that baseline are removed, one at a time.
**`removeAllListeners()` is never used**: this process also carries runner-owned and Node-owned
handlers, and destroying those would be a worse defect than the one being fixed.

After every fixture: `process.rawListeners('uncaughtException')` is identity- and order-equivalent to
the original; no process event retains anything introduced; and a dedicated section proves the counts
did not accumulate across all three.

**Also restored in `finally`, on every path including a throw:** `Module._load`, `console.log`, the
module cache, `process.env` (added keys deleted, changed keys restored), `setInterval`/`setTimeout`
plus every timer the fixture created, and the temp `userData` directory — whose removal each fixture
now asserts, so no filesystem residue is left behind.

## 14.2 Fail-closed `child_process`

**What was wrong.** The mock was `Object.assign({}, realCp, { execFile })`. That is a shallow copy:
`spawn`, `spawnSync`, `exec`, `execSync`, `execFileSync` and `fork` were all still **the real
implementations**, reachable by anything main.js's startup happened to call.

**The correction.** The mock is built on `Object.create(null)` and is fail-closed. Only the fixture's
`execFile` does anything. Every other **callable** export of the real module — not merely the six the
order names, but anything callable the runtime exposes — is replaced by a stub that records the
attempted API name and throws a fixed test-only refusal. Non-callable exports pass through unchanged.

Asserted per fixture: the fixture `execFile` was invoked **exactly once**; **no** blocked API was
invoked; and for every named API the mock's function is **not** the real one. A dedicated section
additionally calls each blocked API directly, proving it throws and is recorded rather than spawning,
and sweeps every callable export of the real module to confirm **none** is reachable through the mock.

## 14.3 Both sinks prefix-pinned

**What was wrong.** The `[TIMING +Nms]` assertion ran against console emissions only, while §§ 12.1 and
13 stated the emissions carried the prefix without qualification. The proof was narrower than the
claim. Both statements are now narrowed **in place** rather than left standing.

**The correction.** For every fixture, using the bounded pattern `[TIMING +<integer>ms]`:

- at least one real console emission and at least one real `main-error` emission exist;
- **every** matching console emission carries the prefix;
- **every** matching `main-error` payload carries the prefix;
- the paired payloads are **byte-identical**, index by index, with equal counts.

Byte-identity is the strongest available check here and is not incidental: `tlog` builds **one**
string and hands the same one to `console.log` and to `webContents.send`. A reconstructed or
re-formatted message would not match. Unrelated boot emissions still cannot satisfy any of it — probe
emissions are separated from boot emissions, and every probe emission on both sinks is asserted to be
version-resolution text.

## 14.4 Verification

| Gate | Result |
|---|---|
| `pane-status-disclosure-route` directly | **156 passed, 0 failed** |
| Focused pane-status, 25 suites | **1,620 assertions, 0 failures** |
| Complete app gate | **exit 0 — 87 suites, 6,078 assertions, 0 failures** |
| `git diff --check`, cumulative and focused | clean |
| **Pester** | **955 passed / 0 failed / 0 skipped — INHERITED from the independent run at `5074f5b`; not rerun, because this correction changed one JavaScript test file and this document, with all production and PowerShell sources byte-identical.** |

**By observed summary format:** named-standard 69 / 5,348 · named-assertions 2 / 18 · unnamed bare
6 / 423 · unnamed tests-prefixed 10 / 289 = **87 suites / 6,078**. 87 summary lines against 87
registered segments.

**Delta from 5,980 / 87 at `8c60962`: +98, and the suite count is unchanged**, which is exactly what a
pure assertion change inside an existing suite should look like:

| Suite | At `8c60962` | Now | Δ |
|---|---:|---:|---:|
| `pane-status-disclosure-route` | 58 | 156 | **+98** |
| every other suite | | | **0** |
| **Registered segments** | **87** | **87** | **0** |

`pane-status-isolation` and `test-summary-formats` are unchanged this round — both scale with the
number of test *files*, and no file was added.

**AGR was not triggered.** The complete gate exited 0 with `dockview-bootstrap` 203/0 and
`dockview-app-integration` 296/0. Nothing was routed and nothing was retried.

## 14.5 Terminator acknowledged (Binding Amendment A § 3)

This was the **third** correction round concerning the disclosure proof. The terminator is recorded and
accepted: **if the next independent review finds another material harness-isolation or proof-validity
defect — as opposed to an actual production disclosure defect — no further incremental patch to this
loader harness is authorized.** The response instead is to stop, preserve the production correction and
the existing evidence, record that the `main.js` loader-harness approach has become too complex to
establish confidently by incremental fixes, and reopen **only the test architecture** to choose a
simpler bounded proof mechanism before any further implementation.

Progress remains **70%**.

**Scope.** Two tracked paths changed: `app/pane-status/pane-status-disclosure-route.test.js` and this
document. No production source, no `app/package.json` registration, no IPC or preload surface, no
PowerShell, no dependency and no lockfile change.

---

# 15. COMPATIBILITY ADMISSION — Claude Code 2.1.241 (Work Order 15A)

## 15.1 What stopped, and why it is a good outcome

Work Order 15 (live-acceptance delta) was authorized and began its clean preflight. Every check
passed — SHAs, PASS-receipt artifact hashes, clean worktrees, zero stray harnesses, zero Electron
processes, zero pane-status pipes, no prior OTLP receiver, no pane-status hooks in settings, shim and
descriptor absent, PreToolUse/PostToolUse hooks matching `Read` both zero, and no telemetry variable
at User or Machine scope — **except the mandatory pre-acceptance version re-probe.**

**Claude Code auto-updated from 2.1.228 to 2.1.241 partway through 2026-08-24.** `claude.exe` was
rewritten at **2026-08-24T13:46:28Z**: after the Work Order 13 live acceptance had already run to
completion on 2.1.228 that morning, and before the Work Order 15 preflight that evening.

`SUPPORTED_CLAUDE_VERSIONS` held exactly one entry, `'2.1.228'`, so the probe returned an unlisted
version and **the order stopped before the OTLP receiver was created, before any settings mutation,
and before the paid turn** — precisely as § 6.1 of this document requires.

**The gate prevented a wasted paid turn.** Had the run proceeded, `setObservedVersion` would have
fail-closed to `null`, every pane would have shown `unknown` with reason `version-mismatch`, no
lifecycle event would have been attributable, and the paid turn would have produced no usable
observation. This is the first time the version gate has fired against a real, unplanned provider
update rather than a fixture. It behaved exactly as designed, and that is evidence for the
subsystem, not against it.

## 15.2 The exact probe result

METHOD B (production pane-equivalent resolver: one PowerShell, pane flags minus `-NoExit`, profile
LOADED, `Get-Command claude`, then `& $source --version`), run immediately before the edit:

| Field | Value |
|---|---|
| Probe time (UTC) | `2026-08-24T21:09:11Z` |
| Raw version line | `2.1.241 (Claude Code)` |
| Parsed | `2.1.241` |
| Resolved executable | unchanged from the prior record — **path match: true** |
| Provider session | none |
| Paid turn consumed | none |

## 15.3 The admission, and its deliberate narrowness

`SUPPORTED_CLAUDE_VERSIONS` now holds exactly two exact strings: `'2.1.228'` and `'2.1.241'`.

**No range, prefix, wildcard, minimum-version rule, semver comparison, or automatic trust of an
adjacent release was introduced.** The tests prove this negatively as well as positively: `2.1.240`,
`2.1.242`, `2.1.239`, `2.1.229`, `2.1.227`, `2.1.24`, `2.1.2410` and `2.1.241-beta` are each asserted
**unsupported** against the shipped array. Those are exactly the versions a looser rule would have
wrongly admitted, so each failing assertion is what demonstrates no such rule exists.

## 15.4 Changelog evidence — supporting only, never a compatibility claim

The official 2.1.229–2.1.241 entries were read. Nothing documents the removal or alteration of a
contract this subsystem depends on. Adjacent-surface entries are recorded so a reviewer can weigh
them directly:

| Version | Entry | Bearing on pane status |
|---|---|---|
| 2.1.239 | OpenTelemetry: tool executions deferred by a `PreToolUse` hook resume in the original turn's trace | Trace shape only; no hook contract change. Relevant to WO15's OTLP timing capture. |
| 2.1.233 | `SessionStart` hooks report source `"fork"` for a forked session | **Additive.** This subsystem reads only `hook_event_name`, never `source`. |
| 2.1.232 | `PreToolUse` `ask` floors at a prompt for unsandboxed Bash; MCP `headersHelper` runs without inherited credential env vars | No fenced role has Bash. See the watch item below. |
| 2.1.229 | Server-supplied hook support for self-hosted runner sessions | Additive. |

**Watch item, stated plainly because it is the one that could actually bite.** 2.1.232 shows
Anthropic actively *narrowing* environment inheritance into child processes — for MCP
`headersHelper`, not for hooks. Pane status depends on Claude Code passing
`BLUE_HELM_PANE_STATUS_PIPE` and `BLUE_HELM_PANE_STATUS_TOKEN` through to hook children. **That
contract is observed, not documented**, and this admission does not prove it still holds on 2.1.241.
Only the live run can establish that.

## 15.5 Status

**The admission is PROVISIONAL until Work Order 15 passes on 2.1.241.** It records the exact version
the application would launch. It does **not** establish that the eight hook events fire, that the
reporter still inherits its pipe and token, or that hook timing is unchanged.

**RESOLVED — see § 19 (Work Order 16).** Work Order 15 subsequently ran live on 2.1.241 and returned
PASS WITH DOCUMENTED MEASUREMENT RESIDUAL. All eight event groups installed and the reporter did
inherit its pipe and token on 2.1.241, so the admission is **no longer provisional**. The paragraph
above is retained unedited because it was accurate when written; only this resolution is added.

**Progress at Work Order 15A: 80%** — a point-in-time snapshot, not a standing claim. Current status
is § 19.G.

## 15.6 Scope

**Three** tracked paths changed (corrected by WO15A-R § 7 — the original wording said "Two ... plus
this document", which undercounted its own diff): `app/pane-status/pane-status-version.js` (one added array entry plus its
provisional comment) and `app/pane-status/pane-status-version.test.js` (the admission proofs), plus
this document. No other production source, no `app/package.json` registration, no IPC or preload
surface, no PowerShell, no dependency and no lockfile change. Nothing merged, pushed, installed, or
live-tested under Work Order 15A.

---

# 16. VACUOUS COMPOSITION PROOF — a recurring defect class on this branch (Work Order 15A-R)

## 16.1 The class

> **VACUOUS COMPOSITION PROOF** — an assertion passes against a modeled sink or a leaf function
> while bypassing the composed production path it claims to establish.

It is dangerous precisely because it is *green*. The suite reports a pass, the handoff cites that
pass as evidence, and a reviewer reading the label rather than the stack has no signal. Three
occurrences have now been found on this branch, each by an independent review rather than by the
builder, which is itself the strongest argument for the prevention rule in § 16.3.

## 16.2 The three occurrences

### Occurrence 1 — the `tlog` console sink (WO-7 § 12.1, corrected by WO-9)

- **Claimed:** raw paths never reach the console output used by `tlog`.
- **Bypassed:** the real `tlog` in `app/main.js`. The test replaced `console.log` around a resolver
  it had constructed itself.
- **Why it passed vacuously:** `tlog` was never on the stack, so the capture was empty for a reason
  unrelated to redaction. An empty capture from a path the claimed sink never occupied proves
  nothing at all.
- **Composed entry point now supplying the proof:** `pane-status-disclosure-route.test.js`, which
  drives the REAL `tlog`/`main-error` route (commit `8c60962`).

### Occurrence 2 — the `main-error` renderer sink (WO-7 § 12.1, corrected by WO-9)

- **Claimed:** raw paths never reach renderer `main-error` payloads.
- **Bypassed:** the `main-error` channel itself. The test watched `createPublishers`, which sends on
  the pane-status **view** and **setup-state** channels.
- **Why it passed non-representatively:** `main-error` is a different channel, written directly by
  `tlog`. The assertion could not have caught a leak through it *even in principle*.
- **Composed entry point now supplying the proof:** the same real-route disclosure test.

### Occurrence 3 — the version allowlist leaf (WO15A, corrected by WO15A-R)

- **Claimed:** a suffixed build of an admitted version is not supported —
  `isVersionSupported('2.1.241-beta', shipped) === false`.
- **Bypassed:** `parseVersion()`. Production never hands raw resolver output to
  `isVersionSupported()`; it parses first and passes the *parsed* string.
- **Why it passed non-representatively:** the leaf genuinely rejects the suffixed string, so the
  assertion was true. But under the then-current parser `/^\s*(\d+\.\d+\.\d+)\b/`, raw
  `2.1.241-beta` normalized to `2.1.241` **before** membership was ever consulted, and the gate
  OPENED. The test asserted the opposite of production behaviour while remaining literally true.
  The independent review's negative control is reproduced verbatim as a regression test:

  | Raw resolver output | Old parser | Old membership | Old gate |
  |---|---|---|---|
  | `2.1.241-beta` | `2.1.241` | true | **OPEN** |
  | `2.1.241+build` | `2.1.241` | true | **OPEN** |
  | `2.1.241.1` | `2.1.241` | true | **OPEN** |

- **Composed entry point now supplying the proof:** `createVersionGate() -> parseVersion() ->
  isVersionSupported()` driven against the real shipped `SUPPORTED_CLAUDE_VERSIONS`, plus a
  resolver-level fixture built from the exact tagged CRLF PowerShell stdout observed on the
  acceptance machine, so `readTag` and `parseVersion` are both on the stack rather than simulated.
  The original leaf assertion is retained, relabelled `[supplementary]`, and explicitly disclaimed
  as not proof of raw-output rejection.

**The allowlist was never the weakness in any of these.** In occurrence 3 the widening happened
*upstream* of the exact-membership check, in a parser that discarded the bytes making two builds
different. Exact membership is only ever as exact as the string handed to it.

## 16.3 Standing prevention rule

> Every load-bearing absence, refusal, disclosure, or compatibility assertion must first prove that
> its input reached the **composed production entry point**, and that the asserted output came from
> the **real destination** being claimed.

Operationally: name the entry point the production caller uses, drive the test through it, and if a
sink is claimed, assert on that sink by identity — never on a stand-in that merely resembles it.

---

# 17. HANDOFF CLAIM AUDIT (Work Order 15A-R § 7)

Executed before submission. This is prevention for the recurring overstated-handoff class, not
authorization for broader edits.

| # | Check | Result |
|---|---|---|
| 1 | Every claimed disclosure sink is actually traversed | **PASS** — the two modeled sinks are corrected in place (§ 12.1 / § 13) and registered above; `pane-status-disclosure-route` 156/0 drives the real route. |
| 2 | Every claimed timing prefix is asserted on the sink named | **PASS** — the `[TIMING +Nms]` claim was narrowed in place at § 14 to the console sink it is actually pinned on; no both-sinks claim survives. |
| 3 | Every claimed rejected raw version is tested through the composed production gate | **PASS** — all twelve Section-3 rejects are driven through `createVersionGate()`, and the three review negative controls additionally through the resolver-level tagged fixture. |
| 4 | Every changed-path count matches `git diff --name-status` | **PASS** — three paths, verified against `--name-status`; the WO15A "Two tracked paths" wording is corrected in § 15.6. |
| 5 | Every test total is derived from observed summaries | **PASS** — totals are read from suite output, not predicted. |
| 6 | No inherited result is described as freshly run | **PASS** — Pester is labelled INHERITED and the diff proves no PowerShell file changed. |
| 7 | No provisional version admission is described as live compatibility | **PASS as of Work Order 15A-R** — § 15.5 stated the admission was provisional until Work Order 15 passed, and nothing in § § 1–18 claimed 2.1.241 live compatibility. **Updated by Work Order 16:** § 19 now records live acceptance on 2.1.241, so the admission is no longer provisional and § 15.5 carries the resolution note. The check itself is unchanged — a live-acceptance claim is now backed by a live run. |

**Audit finding.** Check 4 caught a real defect in this document: the WO15A scope statement said
"Two tracked paths ... plus this document", which undercounted its own three-path diff. Corrected in
§ 15.6 rather than left standing.

---

# 18. AGR HISTORY — carried forward, not rerun (Work Order 15A-R § 8)

Recorded from the independent review execution. **Not rerun and not reclassified here.**

- `dockview-bootstrap` failed once with the established Electron/GPU `0xC0000135` family.
- `dockview-app-integration` failed once with the same family.
- Neither suite was retried.
- The remaining suffix ran once and passed **71/71**.
- All **87** registered suites were attempted exactly once.
- No third suite failed.
- Nothing in the focused range touched either Dockview suite or its launch dependencies.

**This is the second consecutive review execution in which both named Dockview suites showed the
same Electron-family signature.**

That sentence is the whole claim. No stability claim, no causal claim, and no N>=20 measurement
claim is made or implied, and Track A and Track B product findings are not merged.

**THIS BUILDER GATE RUN DID NOT REPRODUCE THE SIGNATURE.** The Work Order 15A-R complete app gate
exited `0` on a single run: `dockview-bootstrap` **203/0** and `dockview-app-integration` **296/0**,
each attempted exactly once, with no retry and no AGR routing. This is recorded because omitting it
would let the paragraph above be read as a claim that the Electron-family signature is persistent.
It is not such a claim in either direction: two review executions showed it, this builder execution
did not, and three observations establish nothing about a distribution. The independent review's
observation is carried forward unchanged and is not reclassified by this run.

---

# 19. LIVE ACCEPTANCE — controlled enrolled run on Claude Code 2.1.241 (Work Order 16)

Recorded from the Work Order 15 controlled live-acceptance exercise executed against reviewed content
tip `4d78cbd68690b3629d520396f728522a048a4d6c`. This section is the administrative tail: it changes
no production source, test, configuration, dependency or lockfile.

## 19.A Version boundary

| Item | Recorded value |
|---|---|
| Probe timestamp | `2026-08-25T02:47:58Z` |
| Parsed version | `2.1.241` |
| Raw resolver output | exactly `2.1.241 (Claude Code)` |
| Parser used | the **production** parser in `app/pane-status/pane-status-version.js` — not a local regex |
| Executable path | matched the previously probed installation (`path_match: true`) |
| Line endings | CRLF, as previously observed |
| Allowlist | admitted by the shipped frozen `SUPPORTED_CLAUDE_VERSIONS` |

`DISABLE_AUTOUPDATER=1` was set **process-local only**, in the launched process environment. It was
never persisted. Verified after the exercise: **no telemetry or autoupdate variable is set at User or
Machine scope** — `CLAUDE_CODE_ENABLE_TELEMETRY`, `OTEL_LOGS_EXPORTER`,
`OTEL_EXPORTER_OTLP_LOGS_ENDPOINT`, `OTEL_EXPORTER_OTLP_PROTOCOL`, `OTEL_METRICS_EXPORTER`,
`OTEL_LOGS_EXPORT_INTERVAL`, `DISABLE_AUTOUPDATER` and `DISABLE_TELEMETRY` all read `none` at both
scopes. The installed version was still `2.1.241` afterwards, so the pin held for the whole run.

## 19.B Paid-turn proof

- **Exactly one** provider turn was consumed.
- **Exactly one** `Read` tool call was made.
- **No other tool** was used, and there was **no retry**.
- **Blue explicitly confirmed the reply was exactly `PANE_STATUS_LIVE_OK`.**

The single tool call is independently visible in the telemetry of § 19.D as exactly one
`PreToolUse:Read` and exactly one `PostToolUse:Read`.

## 19.C Lifecycle proof

Observed sequence:

```
enrolled
  -> SessionStart      / idle
  -> UserPromptSubmit  / working
  -> PreToolUse        / working
  -> PostToolUse       / working
  -> Stop              / turn ended
  -> SessionEnd        / exited
```

What this establishes, stated no more strongly than the run supports:

- **`PreToolUse` arrived while the pane was already `working`, and correctly produced no second
  visible transition.** A state machine that re-rendered here would have been wrong.
- **`PostToolUse` was refresh-only.** It caused no state change, false or otherwise.
- **The badge never reported `finished`.** `Stop` rendered `turn ended`, which is the intended
  wording; `finished` would have overclaimed completion of work the application cannot observe.
- **`SessionEnd` was accepted while the token remained valid**, and the pane became `exited`.

### The earlier unknown-token result was not a product defect

Work Order 13 saw `SessionEnd` refused as an unknown token. The cause was **sequencing in the
exercise, not the product**: the pane was released 296 ms *before* `SessionEnd` arrived, so by the
time the event reached the listener the token had already been legitimately revoked. Refusing an
event bearing a revoked token is the fail-closed behaviour the design requires.

The correction cost **zero paid turns**: exiting the Claude session first and selecting Remove only
afterwards left the token valid long enough for the event to land. That is what § 19.C records.

## 19.D Telemetry

Captured through a loopback-only OTLP receiver that retained exactly five fields per record and never
wrote or printed a raw request body. The complete retained capture, verbatim:

```json
{"hook_event":"PreToolUse","hook_name":"PreToolUse:Read","num_hooks":"1","num_success":"1","total_duration_ms":"382"}
{"hook_event":"PostToolUse","hook_name":"PostToolUse:Read","num_hooks":"2","num_success":"2","total_duration_ms":"406"}
```

| Field | PreToolUse | PostToolUse |
|---|---|---|
| `hook_name` | `PreToolUse:Read` | `PostToolUse:Read` |
| `num_hooks` | **1** | **2** |
| `num_success` | **1** | **2** |
| `total_duration_ms` | **382** | **406** |

### Disposition

- **PreToolUse is one attributable pane-status observation of 382 ms.** `num_hooks: 1` means the
  reporter was the only hook that ran, so the duration belongs to it.
- **PostToolUse is an aggregate 406 ms across two successful runtime hooks.**
- **No portion of the 406 ms is assigned to pane status.** Not a half, not a proportion, not an
  estimate. The measurement does not decompose and it will not be made to.
- **The second runtime hook was not exposed by Claude Code’s read-only hook inventory.** The `/hooks`
  view reported `PostToolUse (1)`, and the settings file independently agreed: one entry, one
  `command` hook, empty matcher. That is the whole finding. **It is not claimed to be proven
  internal to Claude Code** — the inventory simply does not account for the second execution, and
  this exercise did not establish what does.
- **This is one controlled observation only.** No distribution, stability, p50, p95, or general
  performance characteristic is claimed or implied.

### Objective A is ACCEPTED WITH RESIDUAL, not PASS

The residual is **provider/runtime telemetry attribution**, not a pane-status product defect. Pane
status reported correctly at every event; what is missing is the ability to attribute an aggregate
PostToolUse duration to a single hook when the runtime runs more hooks than the inventory lists.

**This residual does not authorize another paid measurement campaign.** It is recorded so that a
later reader does not mistake the aggregate for a pane-status cost, and so that nobody re-runs a paid
exercise expecting a cleaner number that this build cannot produce.

### Method finding worth carrying forward

A settings-file hook count is **necessary but not sufficient** for attribution. The preflight for this
run counted hooks in `settings.json` and reported `PostToolUse: 0`, while the runtime reported
`num_hooks: 2`. **`num_hooks` in the telemetry record is the only authoritative attribution check.**
Any future timing claim must be gated on it, not on a configuration count.

## 19.E Cleanup

| Check | Result |
|---|---|
| All eight owned event groups removed | **YES** |
| `hooks` key in Claude settings | **ABSENT** |
| Unrelated settings preserved | **byte-identical** — `effortLevel`, `model`, `permissions`, `theme`, `tui`; 0 keys added, 0 removed |
| Wholesale baseline restoration | **NONE** — the surviving keys were never overwritten from a backup |
| Shim | **ABSENT** (`pane-status-reporter.cmd` not present anywhere under user data) |
| Descriptor | **ABSENT** (`pane-status-installation.json`) |
| Pane-status named pipes | **0** |
| Stray pane-status harnesses | **0** |
| OTLP receiver | **stopped**; its loopback port is no longer listening |
| Emergency settings baseline | **deleted after target verification**; the live settings file was not touched by the deletion |
| Raw telemetry capture | **never existed** — only the five sanitized fields were ever written |
| Telemetry variables persisted | **NONE** at User or Machine scope |

Two residuals are deliberate and recorded rather than removed:

- **`pane-status-install-id` remains** in the application user-data directory. This is the documented
  **nonsecret** residual: a 32-hex-character identifier that lets a later install recognise its own
  prior ownership. It is not the shim, not the descriptor, and it grants nothing.
- **The owner directory `<userData>/pane-status/` remains and is empty** (0 entries, including
  hidden). The shim it once contained is gone. `pane-status-settings-txn.js` states the reason
  directly: the shim *directory* is not decisive, because another file in it or a handle held by an
  indexer must not be allowed to fail a removal. Removal is judged on the shim file, the descriptor,
  and the settings groups — all three of which are clear.

## 19.F AGR standing history

**Three consecutive independent verification runs** observed both named Dockview suites failing
*before* product assertions, with the same Electron/GPU `0xC0000135` family signature, while the
reviewed focused ranges changed **neither Dockview nor its launch dependencies**.

That sentence is the entire claim. Explicitly:

- This is **standing exception history**. It is **not** a stability claim and **not** an N>=20
  measurement campaign.
- It does **not** extend to any other suite.
- It does **not** extend to a product assertion — see the § 14 entry where a Dockview suite failed on
  a genuine product assertion, which this history does not cover.
- It does **not** extend to another signature, to an omitted suite, or to a retry.
- It does **not** license routing a future failure around the gate. Admissibility of any AGR
  exception remains an independent-review decision, not a builder decision.

The § 18 record stands unchanged, including the note that the Work Order 15A-R **builder** gate run
did **not** reproduce the signature (`dockview-bootstrap` 203/0, `dockview-app-integration` 296/0,
each attempted once). Builder gate runs are not independent verification runs; both records are kept
because suppressing either would misrepresent the signature as more — or less — persistent than the
observations support.

## 19.G Final status

| Item | Status |
|---|---|
| Live acceptance | **PASS WITH DOCUMENTED MEASUREMENT RESIDUAL** |
| Objective A — bounded PreToolUse and PostToolUse measurement | **ACCEPTED WITH RESIDUAL** (§ 19.D) |
| Objective B — `SessionEnd` observed as `exited` | **PASS** (§ 19.C) |
| Pane-status production | **90%** |
| Merge | **outstanding** |
| Push | **outstanding** |

**No production source, test, configuration, dependency, or lockfile changed after reviewed content
tip `4d78cbd68690b3629d520396f728522a048a4d6c`.** The only tracked change in the administrative tail
is this document.

Percentages recorded in earlier sections (70% at § 9 and § 14, 80% at § 15.5) are **point-in-time
snapshots** taken when those work orders closed. This section supersedes them; they are retained
rather than rewritten so the progression stays auditable.
