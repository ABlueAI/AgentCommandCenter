# Builder Handoff — Fence Live Admission Refresh Correction

Status: PRE-REGISTERED BEFORE SOURCE EDITS  
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

Pending implementation, gates, pinned artifacts, and independent review.
