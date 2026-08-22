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
