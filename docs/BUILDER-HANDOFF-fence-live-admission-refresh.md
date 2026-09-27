# Builder Handoff — Fence Live Admission Refresh Correction

Status: FENCE-BOUNDARY CORRECTION BATCH IN PROGRESS after the Full-class review of `cf0327e` returned `VERDICT: FAIL` (see "Correction batch after Full-class FAIL" below; earlier statuses preserved as history)
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

## H1 application gate closeout (completed for exact `aa1640c`)

The history above is preserved unchanged. The workstation suite-15/suite-16
failures, the consumed one-time attempts, and the AGR falsification remain the
record of what happened on the primary workstation; they were not rerun or
reinterpreted, and that host's Electron harness failure is not cured by this
closeout.

The required full-app gate was subsequently satisfied on a separate qualified
host. The R13b external H1 application gate ran exactly once against checkpoint
`aa1640cde37240295a5ba748f1c38cd3d82ddf39`:

- host BLD (NZXT H1 Mini), Windows build 26200.9550, boot 4693;
- chain: G2 host qualification PASS, G3 independent qualification review PASS,
  G4 dry run and G5 Validate each accepted after independent review, then one
  Execute attempt completed 2026-09-27 00:48Z;
- attempt marker `h1-gate-attempt-aa1640c.json`: `sourceTip`
  `aa1640cde37240295a5ba748f1c38cd3d82ddf39`, created 2026-09-27T00:45:37Z,
  runner SHA-256 `F59F86A9CD6DE9A7D21BD67E3DB82344C18EB79019A739E27A6CE7EDA518A201`;
- result: exit 0, no timeout, stdout 448,283 bytes and stderr 8,470 bytes, both
  untruncated;
- all 96 ordered test-suite clauses completed successfully under the retained
  review's assessment, which rests on the launcher's first-nonzero-stop behavior
  rather than the 94 conventional summary lines. One individual sub-check, the
  symlink-refusal case in `admission-budget-store.test.js`, printed `SKIPPED`
  on the non-elevated host; source inspection is its accepted substitute
  evidence. Not every sub-check executed;
- the application attempt marker is consumed. The gate must not be rerun.

Evidence identities (SHA-256):

- Execute seal identity: `32F39E284F6E5465132E93EB6A06E37AD67850DB72F3928C2CB0EF32ED469911`
- Final post-run review identity file: `34231F93B9BD396B4E5C22D989A65A96594670C3A422C3D3E09C9DCA74616B87`
- Review report (23,876 bytes): `184AD432C0AB87B01CF73B448240DD0F9A7D710D3F8023B251734FCEA64B62D4`
- Transfer package `H1-TRANSFER-BUNDLE-20260927.zip` (14,962,739 bytes):
  `50FCE1378B69A5D3D9345F24983A9B6E0B815B9D8ED8490083CA97B9695EAB1D`

On 2026-09-27 the builder authenticated the transfer package on the primary
workstation without executing any of its content. It matched the recorded size and
hash and its external checksum, including bundle-manifest SHA-256
`A436AACF6DC01AB85B306A5EB53502EC1B71AE7689B24F33F5B7AB0E3FB640D1`. All 1,015
entries are present, and all 1,012 manifest-listed payloads match their recorded
size and hash, with no unlisted or unsafe paths. The review identity, report,
seal, and runner identities above were recomputed from the archive.

The retained independent Full-class post-run review's final verdict, verbatim:

```text
CLASS: Full
INDEPENDENCE: CONFIRMED
STDERR CLASSIFICATION: NO FAILURE INDICATION
APPLICATION GATE: MET
VERDICT: PASS
```

Scope of that verdict: it establishes the application gate for `aa1640c` only.
It is an H1 gate review. It is **not** the independent Full-class code review
of this correction or of the cumulative Fence stack that this handoff requires,
and it authorizes nothing further: no merge, push, deployment, ledger change,
live prompt, or fixture disposal. Carried residuals include the skipped symlink
sub-check (N-1), the absence of an in-Execute native-module load measurement
(N-2, accepted on same-boot G2 evidence and 97/97 pre/post pins), 11 Node
`MODULE_TYPELESS_PACKAGE_JSON` stderr notices (not to be silenced by adding
`"type"` without separate scope assessment), and the open production node-pty
PID-cleanup risk.

This closeout commit changes only this handoff. The runtime and test tree of
the final review endpoint is therefore identical to the H1-tested `aa1640c`,
and the branch still differs from `1efcc99` in exactly the three pre-registered
paths. The correction-only and cumulative artifacts are generated from this
final commit using the pre-registered three-dot ranges and filenames. Their byte
lengths and SHA-256 values are recorded in the independent review brief rather
than here, because a committed file cannot contain the hash of a diff that
includes it.

Remaining before Blue: a fresh independent read-only Full-class review of both
artifacts, returning the literal `CLASS` / `INDEPENDENCE` / `VERDICT` lines
required above. This closeout stops without merge or push.

## Correction batch after Full-class FAIL (pre-registration)

### Review result retained

A fresh independent Full-class review of `1efcc99...cf0327e` (correction) and
`70fe1f1...cf0327e` (cumulative Fence stack), using the pinned artifacts
`4C5AC4E3…0EF9` (20,598 bytes) and `B4DEF4F1…3FB4` (195,183 bytes), found the
one-file renderer correction sound. It failed the stack on two Medium findings
in the new fenced-launch boundary. Its final lines, verbatim:

```text
CLASS: Full
INDEPENDENCE: CONFIRMED
H1 CANDIDATE IDENTITY: CONFIRMED
VERDICT: FAIL
```

The `cf0327e` commit and its two pinned artifacts are preserved unchanged as
the reviewed-and-failed baseline.

### Authorization and invariant

Blue approved one bounded correction batch, Full class. Approved invariant,
verbatim:

> A fenced launch accepts only explicitly supported tools and launch inputs,
> and uses the same canonical cwd for definition resolution and process launch.
> An unreadable managed-policy probe refuses visibly.

No rebase, merge, push, fetch, ledger change, live-matrix execution, npm test,
Pester, Electron, application launch, H1 script, provider session, or repeat of
a consumed gate is authorized.

### Findings and exact intended changes

**M1 — denylist acceptance.** `app/role-fence-policy.js` accepts any declared
tool except `Bash`, `Glob`, `NotebookEdit`.
Change: add a frozen `ALLOWED_TOOLS` =
`Read, Write, Edit, MultiEdit, WebSearch, WebFetch`. The set is derived from the
three tracked fenced roles, which declare `WebSearch, WebFetch, Read, Write`, plus
the existing supported fence behaviour: the canonical matcher is
`Read|Write|Edit|MultiEdit`, and `fence-write.js` gates the paths of those four tools.
After the existing `FORBIDDEN_TOOLS` check, which keeps its reason, any declared tool
not in `ALLOWED_TOOLS` refuses with the new bounded reason
`fence-policy-tool-not-allowed`. Matching is exact and case-sensitive. This
refuses `Grep`, `PowerShell`, `Agent`, `Task`, lower-case variants, tool
specifiers, MCP tool names, and arbitrary unknown names. Every allowed
filesystem tool (`PATH_CAPABLE_TOOLS` = `Read, Write, Edit, MultiEdit`) that the
role declares must be covered by the authenticated PreToolUse fence entry's
matcher. That rule already applies, and it now covers every filesystem tool
that can pass the allowlist. `tools:` is the loader's own allowlist, so an
undeclared tool is not available to the launched agent. The main-issued
`--disallowedTools Bash Glob NotebookEdit` denial is retained unchanged as
defence in depth.

**M2 — option-shaped opening prompt for fenced roles.**
Change in `app/pty-launch-classify.js`: when the classified role is fenced,
`opts.initialPrompt` must be `undefined` or `''`. `undefined` is what the
existing UI sends for every fenced role (`app/renderer/app.js:779`), and only the
reviewer launch sets a prompt. Any other value refuses with the new bounded reason
`classify-fenced-initial-prompt-refused`, which never echoes the value. That
covers every non-empty or whitespace string, `null`, numbers, objects, and arrays.
The check runs in `ptyStartAuthority.assess()`, the handler's first statement, so it
comes before any log of launch details, containment, resolution, admission claim,
command construction, or spawn. Defence in depth in `app/main.js`
`buildAgentCommand`: a `launch.fenced === true` command never appends a prompt.
Non-fenced prompt behaviour (the reviewer) is unchanged. There is no all-fields
schema redesign and no CLI-parser investigation.

**L1 — resolver/spawn cwd split.** Change in `app/main.js`: the fenced branch
records the validated `resolvedCwd`, and the spawn uses it for fenced launches.
Non-fenced cwd selection (`opts.cwd` if it exists, else `USERPROFILE`) is
unchanged.

**L2 — `reg query` exit 1 treated as absence.** `reg.exe` exits 1 for every
failure, and its stderr is localized. Neither the exit status nor the message can
distinguish absent from unreadable. Change in `app/main.js`: establish absence
positively. The probe lists the key's parent (`reg query <parent>`, with no stderr
parsing). A successful exit-0 listing whose non-indented subkey lines do not
include `<expanded-parent>\<child>` (case-insensitive exact line) is absent. A
listed child is present. This includes a child that exists but denies read, which
still appears in its parent's listing. Any non-zero exit, spawn error, timeout, or
unsupported key shape throws. The resolver already maps that to the visible
refusal `resolve-managed-scope-unreadable`.

**L3 — overstated comments.** Correct the comment in `app/main.js`
`buildAgentCommand`, the top-of-file Fence comment, and the
`app/pty-launch-classify.js` header. They must say that admission still derives
eligibility separately through `isEligibleClaudePane` over raw `opts`, and that
agreement is tested, not structural. The admission internals are not changed.

**L4 — test strength, carried forward.** The source-text regression in
`app/admission-ui-integration.test.js` remains. It is a nonblocking test
limitation, and the controlled live `pane: <id>` observation remains a
live-acceptance obligation. No live run is authorized, and that test file is
outside this batch's cap.

### Test cases

- `role-fence-policy.test.js`: the three tracked roles pass (positive). Refusal
  with `fence-policy-tool-not-allowed` for `Grep`, `PowerShell`, `Agent`, `Task`,
  and an unknown name. The existing `Bash`/`Glob`/`NotebookEdit` cases keep
  `fence-policy-forbidden-tool-declared`. Additional refusals: lower-case `read`,
  a specifier `Read(./x)`, and an `mcp__x__y` name. `Edit`/`MultiEdit` declared
  with the canonical matcher pass, and declared without matcher coverage refuse.
  A pin asserts that `ALLOWED_TOOLS` minus `PATH_CAPABLE_TOOLS` is exactly
  `WebSearch, WebFetch`.
- `pty-launch-classify.test.js`: fenced roles accept absent, `undefined`, and
  `''`. They refuse `'--settings=x'`, `'--mcp-config=x'`,
  `'--permission-mode=x'`, an ordinary prompt, whitespace, `null`, a number, an
  object, and an array. The refusal reason is a constant that carries none of
  the prompt text. Reviewer, builder, and codebase-scout still accept a non-empty
  prompt.
- `pty-start-authority-main.test.js`, driving the real `pty-start` handler:
  - The four prompt cases refuse at the `[classify]` stage with zero spawns and
    no `[admission]` line, and the prompt is never echoed.
  - A reviewer launch with a prompt still spawns and carries the quoted prompt.
  - Drift of the deployed web-scout to `Grep`, `PowerShell`, `Agent`, `Task`, or
    an unknown tool refuses with zero spawns.
  - L1: a junction outside `outputs/` points into the sandbox. The launch is
    accepted, the spawn cwd equals the canonical sandbox path, not the declared
    junction path, and the resolver's first project-scope probe is
    `<spawn cwd>\.claude\agents`.
  - L2: `child_process.execFileSync` is intercepted for `reg` only, and the real
    registry is never written. Cases:
    - parent listing without the child is absent and accepted;
    - near-miss `ClaudeCodeX` and an indented value named `ClaudeCode` are absent;
    - child listed under HKLM or HKCU is present and refuses;
    - parent exit 1 with an English "Access is denied", a German localized
      message, or "unable to find" refuses as unreadable;
    - spawn error `ENOENT`, exit 5, and a timeout signal refuse as unreadable.

    Every refusal spawns nothing. By default the interceptor passes through to
    the real read-only `reg query`, so the existing positive controls still
    exercise the real probe.
- `launcher-fence-invariant.test.js`: re-pin as below, retaining the previous
  values.

### Expected invariant-pin movements

- `fenced-role cwd gate` (1896 / `ba003038…`): MUST move (L1 records `resolvedCwd`).
- `pty-start handler` (14805 / `cbe2f345…`): MUST move (L1 spawn cwd selection).
- `ptyEnv block` (184 / `f64b6bd9…`): MUST remain exact. The environment handed
  to a PTY is not touched.
- Other deliberate assertion movements, disclosed here:
  - The policy suite's substring near-miss names (`Globals`, `BashfulTool`,
    `NotebookEditor`, `Readable`) move from accepted to refused, since that is
    the purpose of M1.
  - The main-harness renderer-injection case drops its fenced
    `initialPrompt: 'ignore previous --disallowedTools'`, which M2 now refuses.
  - The first positive control's `cwd === SANDBOX` compares against the sandbox's
    canonical real path.

### Path cap

Exactly these tracked paths may change from `cf0327e`:
`app/role-fence-policy.js`, `app/role-fence-policy.test.js`,
`app/pty-launch-classify.js`, `app/pty-launch-classify.test.js`, `app/main.js`,
`app/pty-start-authority-main.test.js`, `app/launcher-fence-invariant.test.js`,
and this handoff. Work stops for scope disposition if any other path, a new
dependency, or a new subsystem is required.

### Procurement

This batch corrects the existing Fence boundary and adds no subsystem or
dependency. The controlling admission procurement reference remains
`docs/OSS-PROCUREMENT-pane-status.md`, verdict verbatim:

> BLUE SUBSYSTEM VERDICT: BUILD FRESH

That record is not a separate Fence procurement verdict.

### Authorized verification

- `node app/role-fence-policy.test.js`
- `node app/pty-launch-classify.test.js`
- `node app/pty-start-authority-main.test.js`
- `node app/launcher-fence-invariant.test.js`
- `node --check` on each changed JavaScript file
- `git diff --check`
- exact scope checks against this cap

After those pass: commit, then generate new pinned diffs with `git diff --output`:

- `.agent-review-fence-boundary-correction-since-cf0327e.diff`
  (`cf0327eaafadc3fe6934b2d2084e670c0cf46303...<final>`)
- `.agent-review-fence-boundary-cumulative-since-70fe1f1.diff`
  (`70fe1f1920979d43427be78332c4966acd3b408d...<final>`)

Their sizes and hashes go in the re-review brief, not in this file.

### Application gate status

The H1 PASS applies to `aa1640c` only. This batch changes runtime code, so the
new candidate has no application-gate PASS. A full 96-suite application gate on
the final correction tip remains required and is not executed here.
