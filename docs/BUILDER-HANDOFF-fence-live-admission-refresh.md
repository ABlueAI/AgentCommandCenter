# Builder Handoff — Fence Live Admission Refresh Correction

Status: BLOCKED CHECKPOINT — IMPLEMENTED; FULL-APP GATE NOT PASSED
Branch: `codex/fence-live-admission-refresh`  
Stacked base / reviewed Fence tip: `1efcc99b2f795e3623558e54ba3067bcf6385b32`  
Reviewed Fence production/security tip: `96720f96edfc97414ebb8d3c39b2b3a0975936b5`  
Pre-correction `main`: `70fe1f1920979d43427be78332c4966acd3b408d`

## Authorization

Blue authorized this correction verbatim:

> AUTHORIZE STACKED ADMISSION-REFRESH CORRECTION: create
> codex/fence-live-admission-refresh from reviewed Fence tip 1efcc99;
> pre-register before source edits; modify only app/renderer/app.js,
> app/admission-ui-integration.test.js, and the correction handoff; add
> production-wiring regression proof; run focused, full app, Pester, and syntax
> gates; generate pinned correction and cumulative artifacts; obtain a fresh
> independent Full-class review; and stop. Do not rebind the ledger, start
> Electron, transmit a provider prompt, merge, or push.

## Gate class and invariant

**Full-class.** The correction touches the visible control that admits paid
provider turns. A stale renderer snapshot cannot grant authority in main, but it
can make the only authorized submission path unusable and tempt an operator
toward a prohibited direct terminal path.

Invariant:

> After the real production `cc.ptyStart(...)` promise reports a successful
> controlled-pane launch, the already-mounted admission view refreshes exactly
> once from main before the renderer treats launch settlement as complete. A
> refused/rejected start does not refresh a false binding, ordinary launches with
> no admission bridge remain unchanged, and no prompt submission or PTY-write
> path is added.

## Live failure evidence that fixes the direction

The authorized live run `fence-live-20260828-a` reached the reviewed production
stack with allowance `5`, admitted `0`, refused `0`. Bounded Logs showed:

- `pty-start: fenced-role declaration ACCEPTED (scope=user)`;
- `[admission] pane bound; remaining 5`;
- `pty-start: pty.spawn END ok`; and
- direct terminal input refused with `admission-direct-input-blocked`.

At the same time the mounted controlled-run bar continued to show
`5 of 5 ... pane: unbound` and kept `Send 1 turn` disabled. No provider prompt
was transmitted. The branch corrects only this post-start renderer refresh gap.

## Pre-registered scope cap and exclusions

Exactly three tracked paths may differ from `1efcc99`:

1. `app/renderer/app.js`
2. `app/admission-ui-integration.test.js`
3. `docs/BUILDER-HANDOFF-fence-live-admission-refresh.md`

No other tracked path may change. In particular: no main/preload/admission
budget/store/view module, package file, dependency, role, hook, ledger, live-run
fixture, or project-state document is in scope. No Electron start, ledger
rebind, provider prompt, merge, or push is authorized.

## Pre-registered implementation and regression proof

Production wiring will attach the refresh to the existing `Promise.resolve(
startResult).then(...)` settlement in `openInAppTerminal`:

- successful `{ ok: true }` start: await/call the existing
  `admissionView.refresh()` exactly once when the view exists;
- refused or rejected start: preserve `onStartFailed` and do not report a
  successful binding;
- no admission bridge: `admissionView` remains `null`, so ordinary launches add
  no IPC call and retain existing behavior.

`app/admission-ui-integration.test.js` will add production-wiring regression
proof over the real `app/renderer/app.js` source. It must prove that the refresh
is downstream of the real `cc.ptyStart(...)` result, gated on successful
settlement and `admissionView` presence, while the failure handler remains
present. A view-only test that calls `refresh()` directly is insufficient.

Stop if implementation requires a third production/test module, changes the
submission or PTY-write paths, refreshes before main accepts the pane, refreshes
on a refused/rejected start as if it succeeded, or weakens the existing failure
cleanup.

## Procurement

This is a bounded correction to the existing admission subsystem, not a new
subsystem or dependency. The controlling tracked record is
`docs/OSS-PROCUREMENT-pane-status.md`; its canonical verdict is quoted verbatim:

> BLUE SUBSYSTEM VERDICT: BUILD FRESH

No OSS procurement gate reopens.

## Pre-registered gates

Run from the correction worktree unless noted:

1. Focused: `node app/admission-ui-integration.test.js`
2. Syntax: `node --check app/renderer/app.js` and
   `node --check app/admission-ui-integration.test.js`
3. Full app: `npm.cmd test` from `app/`
4. Pester: `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/run-pester.ps1`
5. Scope: `git diff --name-only 1efcc99...HEAD` must equal the exact three-path cap

Any gate failure must be reported and corrected only within the authorized cap;
otherwise work stops for Blue.

## Pre-registered pinned artifacts

Create with `git diff --output` only, never PowerShell redirection:

- correction-only: range `1efcc99b2f795e3623558e54ba3067bcf6385b32...<correction-tip>` to
  `.agent-review-fence-live-admission-refresh-correction.diff`;
- cumulative Fence stack: range
  `70fe1f1920979d43427be78332c4966acd3b408d...<correction-tip>` to
  `.agent-review-fence-live-admission-refresh-cumulative.diff`.

Record byte lengths and SHA-256 values after the correction tip is final. Both
artifacts are local, gitignored review evidence and are not committed.

## Independent review requirement

A fresh independent read-only Reviewer must inspect the correction-only and
cumulative three-dot artifacts, reproduce the production-wiring proof and named
gates as needed, confirm the exact three-path cap, and return findings plus the
literal lines:

`CLASS: Full`  
`INDEPENDENCE: CONFIRMED`  
`VERDICT: PASS|FAIL`

Only a literal `VERDICT: PASS` advances the correction to Blue. This work order
still stops without merge or push.

## Completion record

Pre-registration was committed before source edits as `b67aad3` (`docs:
preregister admission refresh correction`). The implementation remains inside
the exact three-path cap and adds the pre-registered production-wiring proof.

Completed gates:

- focused: `admission-ui-integration: 176 passed, 0 failed`;
- syntax: both authorized JavaScript files passed `node --check`;
- whitespace: `git diff --check` passed; and
- Pester: after rerunning with normal read access to the user Git ignore file,
  `955 passed, 0 failed, 0 skipped (of 955)`.

The first sandboxed Pester pass was not authoritative: it reported `922/955`
because the sandbox denied reads of
`C:\Users\levij\.config\git\ignore`, contaminating merge-gate fixture status,
and prevented the installed Gemini CLI config-only check from initializing.
The approved non-Electron rerun cleared both environment causes. Its Gemini
check used `--list-extensions`; no model request was made.

The full-app gate is not complete. `npm.cmd test` reaches two real hidden
Electron renderer harnesses, `dockview-bootstrap.test.js` and
`dockview-app-integration.test.js`. The sandboxed attempt stopped at the first
harness with Electron environment errors (`safeStorage` decrypt failure, GPU
process exit, then `ERR_FAILED` loading the local harness file). An unsandboxed
harness rerun was denied because Blue's authorization also says, "Do not ...
start Electron." No workaround or retry was attempted.

Stop condition: Blue must clarify whether the repository's hidden Electron
renderer test harnesses are authorized solely as part of `npm.cmd test`. This
would not authorize `npm start`, a visible feature app launch, a ledger rebind,
or any provider prompt. Until then, the correction tip, pinned artifacts, and
independent Full-class review remain pending so the reviewer is not handed a
range with an unresolved required gate.

Blue then authorized one narrow full-app test attempt, but required an immediate
stop if a harness opened a visible app, reached live state, accessed live user
configuration, or deviated from test isolation. Source preflight found that the
mandatory `dockview-app-integration.test.js` child is not hidden:
`dockview-app-harness.js` explicitly documents that its windows are shown and
calls `win.showInactive()` in `makeWindow`. The harness also does not redirect
Electron's `userData` path before `app.whenReady()`, so the no-live-user-config
limit cannot be guaranteed; the earlier sandboxed failure's `safeStorage`
decrypt diagnostic is consistent with Electron reaching that default profile.
The authorized one-time `npm.cmd test` run was therefore not launched or
consumed. Final commit, pinned artifacts, and independent review remain pending.

Blue subsequently authorized a revised one-time exception permitting only the
inactive `dockview-app-harness.js` windows and requiring a fresh disposable
profile fixture. The single attempt used verified process-local fixture paths
for `APPDATA`, `LOCALAPPDATA`, `TEMP`, `TMP`, `USERPROFILE`, `HOME`, Claude
configuration, and npm configuration/cache. Provider credential variables were
removed from that process and its children. No User or Machine environment
variable was modified.

The 96-suite gate stopped at registered suite 15,
`dockview-bootstrap.test.js`. Suites 1-14 passed, including the 96-command
reachability/summary checks and `dockview-default-path: 380 passed, 0 failed`.
The bootstrap test's Electron child then returned no stdout and no stderr, so
the parent reported:

> FAIL: the harness produced no parseable JSON report (no output)

The second Electron suite and suites 16-96 did not run. The command exited 1.
The one authorized attempt is consumed; no retry is authorized or attempted.
Post-run checks proved the exact fixture no longer exists and zero Electron
processes from this correction worktree remain. Because the required full-app
gate was not green, no passing-gate claim, pinned artifact, or independent
review was produced at that stop.

Blue authorized one narrow AGR falsification without retrying suite 15 on the
correction branch. A disposable detached worktree at exact fork point
`1efcc99b2f795e3623558e54ba3067bcf6385b32` ran
`dockview-bootstrap.test.js` once under the same process-local isolation
manifest. It reproduced the correction-branch signature exactly: the two
harness setup checks passed, then the parent reported `the harness produced no
parseable JSON report (no output)` with empty stdout and empty stderr, exiting
1. Its fixture and detached worktree were removed after identity and
containment checks.

Per the AGR authorization, registered suites 16-96 were then started exactly
once on the correction worktree without rerunning suites 1-15. Suite 16,
`dockview-app-integration.test.js`, immediately failed with the same pre-report
`no output` signature and exit 1. Suites 17-96 were not run. The tail fixture
was removed and a post-run check found zero correction-worktree Electron
processes. Because the 16-96 tail did not pass, suite 15 is not recorded as an
admissible AGR candidate and final commit, pinned artifacts, and independent
review remain prohibited.

## Blocked checkpoint preservation

Blue later authorized preserving this exact three-path correction as a clearly
labeled blocked checkpoint before a separate stacked harness-reliability
branch. This checkpoint records the implemented admission refresh and its green
focused, syntax, and Pester evidence, but it does **not** claim that the 96-suite
full-app gate passed. The failed suite-15 and suite-16 evidence above remains
the controlling full-app result for this checkpoint. It is not merge-ready and
has no independent Full-class verdict.
