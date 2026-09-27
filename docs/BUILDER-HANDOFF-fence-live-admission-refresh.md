# Builder Handoff — Fence Live Admission Refresh Correction

Status: CUMULATIVE INDEPENDENT FULL-CLASS CODE REVIEW PASS at `4d6577b`; APPLICATION GATE FOR `4d6577b` OUTSTANDING; LIVE ACCEPTANCE OUTSTANDING; MERGE/PUSH NOT AUTHORIZED (see the review closeout at the end; earlier FAIL records and statuses preserved as history below)
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

### Completion record (correction batch)

Pre-registration was committed before any source edit as `fe51fd1` (`docs:
preregister fence boundary correction batch`). The implementation stays inside
the eight-path cap. No dependency or subsystem was added.

Before running them, I inspected the four focused suites:

- The policy and classifier suites are pure.
- The launcher invariant suite reads `main.js` source text only.
- The main-wiring suite replaces `electron` and `@lydell/node-pty` through a
  `Module._load` hook. It runs on a disposable drive-root fixture, with
  `USERPROFILE`, `userData`, and the projects root redirected into that fixture.
  It now also clears any `BLUE_HELM_ADMISSION_*` variables before loading `main.js`
  and restores them at the end.
- Pane-status version discovery never runs, because the fixture has no verified
  installation.
- The only real external call is the read-only `reg query` of the two policy
  parents in the default pass-through mode.
- No suite makes a provider call or changes live configuration.

Authorized verification results:

| Check | Result |
|---|---|
| `node app/role-fence-policy.test.js` | `56 passed, 0 failed` |
| `node app/pty-launch-classify.test.js` | `149 passed, 0 failed` |
| `node app/pty-start-authority-main.test.js` | `172 passed, 0 failed`; fixture removed afterwards |
| `node app/launcher-fence-invariant.test.js` | `29 passed, 0 failed` (after the re-pin below) |
| `node --check` on all seven changed JavaScript files | all passed |
| `git diff --check` | passed |

The first main-wiring run reported `168 passed, 4 failed`. The four failures
were all the same over-strict M2 assertion, which expected exactly one visible
line. `logRefusal` emits the refusal twice on `main-error`: once timestamped
through `tlog` and once directly. The assertion now requires every emitted line
to be that `[classify]` refusal. No production code changed for this.

Before the re-pin, the invariant tripwire failed exactly as pre-registered:

| Region | Before | After |
|---|---|---|
| `fenced-role cwd gate` | 1896 / `ba003038c21fb4c802fa0d86c0d65dd1e12774f24e57fe6568d15182c36d8de0` | 2183 / `080893bcf88208575975d6cea67703c646b944e9495e625cf82d71520d7b93dc` |
| `pty-start handler` | 14805 / `cbe2f345015245108e84656014f9e66c6a3c1eb187c866a1255ce2e9ae649376` | 15225 / `128aecaefc5fe7a9332d5fb3ff6e281c6f7bf69ded8ceed153421895de94f1d5` |
| `ptyEnv block` | 184 / `f64b6bd93abb18dced7c8d114d3ea82b98349d317878aa84dd04c25f17f7bb7b` | unchanged, as required |

Previous values are retained in the test file. Two content assertions now pin
the L1 wiring. The environment handed to a PTY is untouched.

Finding disposition:

- **M1: fixed.** The explicit allowlist refuses `Grep`, `PowerShell`, `Agent`,
  `Task`, unknown names, lower-case variants, specifiers, and MCP names. This is
  proven by the unit suite and by deployed-role drift through the real handler.
  The tracked roles still pass, and the CLI denial is unchanged.
- **M2: fixed.** A fenced `initialPrompt` other than absent or `''` refuses at
  classification. `--settings=x`, `--mcp-config=x`, `--permission-mode=x`, and an
  ordinary prompt each produced zero spawns and only the `[classify]` refusal
  line, with no echo. The reviewer's prompt still reaches its command.
  `buildAgentCommand` also drops any fenced prompt as defence in depth.
- **L1: fixed.** A junction outside `outputs/` into the sandbox is accepted,
  spawns from the canonical path, and the resolver's first project probe is
  `<spawn cwd>\.claude\agents`. It never probed under the junction path.
  Non-fenced cwd selection is unchanged.
- **L2: fixed.** Absence is established by a successful parent listing. Simulated
  cases:
  - absent, empty, and near-miss listings: accepted;
  - HKLM or HKCU child present: `resolve-managed-scope-present`;
  - English and German access-denied, parent not found, `ENOENT`, exit 5, and
    timeout: `resolve-managed-scope-unreadable`, with zero spawns.

  Only `reg query` of the parent was issued. On this workstation, the real
  pass-through probe classified both keys absent, since the positive controls
  launched.
- **L3: fixed.** The comments in `main.js` (top-of-file and `buildAgentCommand`)
  and the classifier header now state that admission derives eligibility
  separately and that agreement is tested. Admission internals are unchanged.
- **L4: carried forward**, unchanged. It is a nonblocking test limitation and a
  live-acceptance obligation, with no live run authorized.

Other main.js-reading suites were grepped read-only for exact text or region
pins on the changed code. None pins `const cwd`, the probe, the prompt
sanitizer, or the changed comments. `pty-env.test.js` pins
`const fencedRole = launch.fenced;`, which is unchanged. This is source
inspection only. The suites were not run.

Remaining before Blue:

1. a fresh independent Full-class re-review of the new pinned artifacts;
2. an application gate (the full 96-suite run) on the final correction tip. The
   H1 `APPLICATION GATE: MET` applies to `aa1640c` only and does not cover this
   code;
3. the carried live-acceptance obligations (L4 and the controlled Read/WebFetch
   matrix).

None of these was executed here.

## Second correction batch after Full-class re-review FAIL (pre-registration)

### Review result retained

A fresh independent Full-class re-review of `42d76f1` checked:

- the correction artifact
  `.agent-review-fence-boundary-correction-since-cf0327e.diff`
  (58,633 bytes, `B167D193…F471`);
- the cumulative artifact
  `.agent-review-fence-boundary-cumulative-since-70fe1f1.diff`
  (237,202 bytes, `B6624C45…3182`).

It found M2, L1 and L3 correctly fixed, L2 acceptable with a Low gap, and L4
accurately carried forward. It failed the branch on one Medium finding (N1),
added two Low findings (N2, N3), and made two informational notes (N4, N5). Its
terminal fields, verbatim:

```text
CLASS: Full
INDEPENDENCE: CONFIRMED
APPLICATION GATE FOR 42d76f1: OUTSTANDING
VERDICT: FAIL
```

The reviewer disclosed that it is the same model as the builder. Its
independence is at the session, context and memory level. `42d76f1`, `fe51fd1`,
`cf0327e` and all four earlier pinned artifacts are preserved unchanged.

### Authorization

Blue approved one bounded Full-class batch for N1, N2 and N3. No npm test,
Pester, Electron or application launch, provider prompt, ledger change, VM
experiment, registry write, ACL change, rebase, fetch, merge or push is
authorized, and no consumed H1 procedure may be rerun.

### Finding dispositions and exact intended changes

**N1 (Medium, blocking): empty `tools:` passes the fence policy.**
Change in `app/role-fence-policy.js`: immediately after the existing
`TOOLS_ABSENT` check, refuse `parsed.tools.length === 0` with the new bounded
reason `fence-policy-tools-declared-empty`. The parser is unchanged, and it keeps
its omitted versus declared-but-empty distinction; the policy simply refuses
both. The policy makes no claim about how the CLI treats an empty `tools:`
value, because the refusal does not depend on that.

These are the seven empty-equivalent forms the real parser accepts as
`toolsDeclared: true, tools: []` (measured against `app/role-frontmatter.js` at
`42d76f1`):

- `tools:`
- `tools: ""`
- `tools: ,`
- `tools:` followed by whitespace only
- `tools: "   "`
- `tools: " , "`
- `tools: , ,`

A single-quoted `tools: ''` is already refused by the parser as
`frontmatter-unsupported-value`, and a case pins that too.

**N2 (Low): registry absence inferred from "no line matched".**
Change in `app/main.js` `probeManagedRegistryKey`. A successful exit is still
required, and absence is accepted only when the whole `reg query <parent>`
listing is recognizable for the exact expanded parent. The accepted structural
forms are listed below. Line comparison is case-insensitive, with trailing
whitespace ignored.

- A blank or whitespace-only line is ignored.
- A header line equal to the exact expanded parent path may appear at most once,
  and only before any subkey line.
- A value line (four-space indent, a name, four spaces, `REG_<TYPE>`, and
  optional data) is permitted only after the header and before any subkey line.
- A direct-subkey line is the exact expanded parent, a backslash, then one
  non-empty segment containing no further backslash.
- Every other non-blank line makes the listing unrecognized. That includes a
  grandchild path, a wrong-parent path, error text, an unindented non-key line,
  and a value line in the wrong position.
- The listing must contain at least one header or subkey line. An empty or
  blank-only success is unrecognized.

An unrecognized listing throws, and the resolver already maps that to the
visible refusal `resolve-managed-scope-unreadable`. A recognized listing that
contains the child's subkey line is present. A recognized listing without it is
absent. The existing case folding, value-line skipping, 10-second timeout, 4 MiB
output bound and failure refusals are retained.

The header is optional because the builder has not established whether
`reg.exe` prints the key's own path when the key has no values. That structural
assumption becomes observable instead of assumed: in the default read-only
pass-through mode, the main-wiring test records the real listing and asserts
that it matches these forms. It then prints only the observed shape, meaning
whether a header was seen and the counts of subkey and value lines, and no key
names.

**N3 (Low): linked subdirectories silently skipped during agent-tree scans.**
Change in `app/role-definition-resolver.js` `scanAgentsTree`. Each directory
entry is classified by its entry-type methods before any extension filtering:

- A link (`isSymbolicLink()`) refuses with the new reason
  `resolve-agent-tree-linked-entry`, whatever its name. Links are never
  followed.
- A directory is traversed as before.
- A regular file is filtered by `.md` as before.
- Anything else, including an entry lacking the type methods, refuses with the
  new reason `resolve-agent-tree-unsupported-entry`.

Boundary of what this proves:

- It checks the type Node reports for each entry *inside* a scanned
  `.claude/agents` tree. On Windows, Node reports junctions and symbolic links
  there as links.
- It does not lstat the scanned root directories or their ancestors.
- It cannot distinguish hard links.
- It does not claim complete reparse-point protection.

**N4 (informational)** is carried as a disclosed residual. `verify-fence`
resolves from the uncanonicalized outputs root, and its refusals are logged
through the shared `pty-start refused […]` prefix.
**N5 (informational)** is carried as a disclosed residual. The `KIND:
LAUNCH_KIND` import in `app/main.js` is unused.
**L4** remains a nonblocking test limitation and a live-acceptance obligation.
M2, L1 and L3 are preserved unchanged.

### Regression cases

- `role-fence-policy.test.js`, using the real parser:
  - All seven empty-equivalent forms refuse with
    `fence-policy-tools-declared-empty`. The canonical hook, the tracked hash and
    the canonical matcher are otherwise intact in each case, and the reason is a
    bounded constant.
  - The parser's own view is asserted for each form (`toolsDeclared: true`,
    `tools: []`), so the case measures the policy and not a parser refusal.
  - An omitted key still refuses with `fence-policy-tools-not-declared`.
  - `tools: ''` remains a parse refusal.
  - The existing positive and M1 controls are retained.
- `role-definition-resolver.test.js`, using injected directory entries:
  - A linked subdirectory without a `.md` suffix refuses as a linked entry.
  - A linked `x.md` refuses as a linked entry, even though its target content
    would parse as a matching role.
  - An entry that is neither a file, a directory nor a link refuses as
    unsupported, and so does an entry without type methods.
  - Ordinary nested-directory traversal and the skipping of ordinary non-Markdown
    files (`notes.txt`) are retained.
  - The virtual filesystem's entries gain `isFile` and `isSymbolicLink`.
- `pty-start-authority-main.test.js`, driving the real handler:
  - N1: the deployed fixture `web-scout.md` drifts to each empty form. Each
    refuses with `fence-policy-tools-declared-empty`, zero spawns and no
    `[admission]` line.
  - N2 simulated cases: valid absent with a header and values, valid absent
    without a header, and a case-folded present child all behave as expected.
    Empty success, blank-only success, garbled text, a wrong-parent listing, a
    grandchild line under a header, error text on exit 0, and a value line
    without a header each refuse as `resolve-managed-scope-unreadable` with zero
    spawns.
  - N2 real mode: the pass-through listing is recorded and asserted structurally
    recognizable, and its shape is printed without key names.
  - N3: a real directory junction is created inside the fixture's
    `~/.claude/agents`, once without and once with a `.md` name. Each refuses
    with `resolve-agent-tree-linked-entry` and zero spawns. The junction is
    removed and the clean tree launches again. No deployed role tree is touched.
- `pty-launch-classify.test.js` is run unchanged, to confirm that M2 is
  preserved.
- `launcher-fence-invariant.test.js` is run unchanged.

Where practical, the new cases are also run once against the `42d76f1`
implementation, from a scratch copy outside the repository, to show they fail
there before passing here.

### Invariant pins

No pin movement is expected. `probeManagedRegistryKey` sits above the
`pty-start` handler region, and N1 and N3 live in other modules. The three pins
must remain exact:

| Region | Length / SHA-256 |
|---|---|
| `fenced-role cwd gate` | 2183 / `080893bc…` |
| `ptyEnv block` | 184 / `f64b6bd9…` |
| `pty-start handler` | 15225 / `128aecae…` |

`launcher-fence-invariant.test.js` is in the cap but is not expected to change.

### Path cap

Exactly these tracked paths may change from `42d76f1`:

- `app/role-fence-policy.js`
- `app/role-fence-policy.test.js`
- `app/role-definition-resolver.js`
- `app/role-definition-resolver.test.js`
- `app/main.js`
- `app/pty-start-authority-main.test.js`
- `app/launcher-fence-invariant.test.js`
- this handoff

Work stops for disposition if another path, a dependency or a subsystem is
needed.

### Procurement

This batch corrects the existing Fence boundary without adding a subsystem. The
admission record remains `docs/OSS-PROCUREMENT-pane-status.md`, verdict
verbatim:

> BLUE SUBSYSTEM VERDICT: BUILD FRESH

That verdict is not a separate Fence procurement verdict.

### Verification and artifacts

Authorized suites:

- `role-fence-policy.test.js`
- `role-definition-resolver.test.js`
- `pty-launch-classify.test.js`
- `pty-start-authority-main.test.js`
- `launcher-fence-invariant.test.js`

Also authorized: `node --check` on changed JavaScript, `git diff --check`, and
exact scope checks.

After verification and commit, new pinned diffs are generated with
`git diff --output`:

- `.agent-review-fence-n1n2n3-correction-since-42d76f1.diff`
  (`42d76f1c3df7e2977f5d5e8c7bdcca38de699be5...<final>`)
- `.agent-review-fence-n1n2n3-cumulative-since-70fe1f1.diff`
  (`70fe1f1920979d43427be78332c4966acd3b408d...<final>`)

Their sizes and hashes are reported in the re-review brief.

H1 remains passed for `aa1640c` only. The corrected candidate still requires
its own application gate after review. That gate is not executed here.

### Completion record (N1/N2/N3 batch)

Pre-registration was committed before any source edit as `7eb299f`
(`docs: preregister N1/N2/N3 fence correction batch`). The implementation stays
within the eight-path cap. `app/launcher-fence-invariant.test.js` is unchanged,
and no dependency or subsystem was added.

Suite inspection before running:

- The policy, resolver and classifier suites are pure. They use the real parser
  and injected directory entries.
- The main-wiring suite keeps its mocked Electron and PTY. It uses a disposable
  drive-root fixture with `USERPROFILE`, `userData` and projects redirected,
  and it clears admission environment variables.
- Its new N3 cases create real directory junctions only inside that fixture's
  `~/.claude/agents`, and remove them afterwards.
- Registry access is limited to the existing read-only `reg query` of the two
  policy parents. There are no registry writes, no ACL changes, no VM, and no
  provider calls.

Authorized verification on the final tree:

| Check | Result |
|---|---|
| `node app/role-fence-policy.test.js` | `80 passed, 0 failed` |
| `node app/role-definition-resolver.test.js` | `35 passed, 0 failed` |
| `node app/pty-launch-classify.test.js` | `149 passed, 0 failed` (M2 preserved) |
| `node app/pty-start-authority-main.test.js` | `251 passed, 0 failed`; fixture removed |
| `node app/launcher-fence-invariant.test.js` | `29 passed, 0 failed`, with no pin changed |
| `node --check` on all six changed JavaScript files | all passed |
| `git diff --check` | passed |

**Red run against the previous implementation.** A scratch copy of `42d76f1`
(`git archive` of `app`, `agent-roles`, `scripts` outside the repository;
`app/main.js` blob `302b2cd2…`, identical to `42d76f1`) was run once with the
three new test files overlaid. Every failure is one of the new N1, N2 or N3
cases:

| Suite | Result against `42d76f1` |
|---|---|
| `role-fence-policy` | `66 passed, 14 failed`: all seven empty forms are accepted there |
| `role-definition-resolver` | `30 passed, 5 failed`: both linked entries, the unsupported entry, the untyped entry, and the project-scope link |
| `pty-start-authority-main` | `218 passed, 33 failed` |

In the main-wiring suite, the old code **spawned** a PTY in these cases:

- every empty-tools drift, which confirms N1's real-handler consequence;
- all eight unrecognized registry listings;
- the linked `linked-roles` junction.

The linked `linked.md` junction refused there only incidentally, with a
different reason.

**Real registry structure observed.** In the default read-only pass-through,
both real listings on this workstation were recognized and have NO header line:

- `HKLM\SOFTWARE\Policies`: header false, 1 subkey, 0 values;
- `HKCU\SOFTWARE\Policies`: header false, 2 subkeys, 0 values.

So `reg.exe` omits the key's own path for a value-less key here. Requiring the
header, which the re-review suggested, would have refused every fenced launch on
this workstation. The header-optional forms were pre-registered for exactly this
reason, and the observation now confirms that choice.

**Disclosed test movement.** The L2 `near-miss` simulated listing used to include
a grandchild line (`Microsoft\ClaudeCode`). Under N2 that line is unrecognized,
so it moved to its own refusing `grandchild` case. The remaining `near-miss` case
(`ClaudeCodeX`, `XClaudeCode`, and an indented value named `ClaudeCode`) is still
absent and accepted.

Finding disposition:

- **N1: fixed.** `fence-policy-tools-declared-empty` refuses all seven
  declared-but-empty forms the real parser accepts. The canonical hook is
  otherwise intact, and each case produces zero spawns and no admission line.
  The omitted key keeps `fence-policy-tools-not-declared`. `tools: ''` remains a
  parse refusal. This batch establishes nothing about the CLI's empty-tools
  semantics, because the refusal does not depend on them.
- **N2: fixed.** Absence requires a listing recognized as the exact parent's.
  Empty success, blank-only success, garbled text, a wrong-parent listing, a
  grandchild line, error text on exit 0, a value line without a header, and a
  duplicate header all refuse as `resolve-managed-scope-unreadable`. Valid
  absent listings, with or without a header, are accepted, and a case-folded
  child is present. The real listing's structure is asserted and printed as
  shape only. A real *present* key is still not observed on a real host, and
  doing so would need the unauthorized registry write.
- **N3: fixed.** Linked entries refuse with `resolve-agent-tree-linked-entry`,
  and entries that are neither files, directories nor links, or that lack type
  methods, refuse with `resolve-agent-tree-unsupported-entry`. Both checks run
  before extension filtering, links are never followed, and ordinary traversal
  and non-Markdown skipping are retained. This is proven with injected entries
  and with real junctions. The boundary is as pre-registered: it checks entries
  inside scanned trees only, does not lstat the roots, cannot see hard links,
  and makes no complete reparse-point claim.
- **N4, N5: carried** as disclosed informational residuals.
- **L4: carried** as a nonblocking test limitation and a live-acceptance
  obligation.
- **M2, L1, L3: preserved.** The classifier suite and the M2/L1 main-harness
  cases are unchanged and green.

Invariant pins, unchanged as pre-registered:

| Region | Length / SHA-256 |
|---|---|
| `fenced-role cwd gate` | 2183 / `080893bc…` |
| `ptyEnv block` | 184 / `f64b6bd9…` |
| `pty-start handler` | 15225 / `128aecae…` |

Remaining before Blue:

1. a fresh independent Full-class re-review of the new artifacts;
2. the application gate (the full 96-suite run) on the final tip, since the H1
   `APPLICATION GATE: MET` covers `aa1640c` only;
3. the carried live obligations: L4, and the controlled Read/WebFetch matrix
   including an undeclared-tool unavailability check.

None of these was executed here.

## Independent Full-class cumulative review: PASS at `4d6577b` (review closeout)

This tail is documentation only. The reviewed code is still exact
`4d6577b698d5cb64c1f3bf85477f03b6d69127a0`, and that commit remains the
intended application-gate candidate. This commit changes only this handoff, so
the application and test tree of `4d6577b` (tree
`6b2e154ca9b4f0456efedd671edc51919396d240`) is the reviewed tree. The earlier
FAIL records for `cf0327e` and `42d76f1` above are preserved unchanged.

### Current status

| Item | Status |
|---|---|
| Cumulative independent Full-class code review | **PASS** at `4d6577b` |
| Application gate for `4d6577b` (full 96-suite run) | **OUTSTANDING**. H1 `APPLICATION GATE: MET` covers `aa1640c` only. |
| Live acceptance (L4 `pane: <id>` observation; controlled Read/WebFetch fence matrix) | **OUTSTANDING** |
| Merge / push | **NOT AUTHORIZED** |

### Reviewed endpoint, ranges and artifact identities

- Reviewed endpoint: `4d6577b698d5cb64c1f3bf85477f03b6d69127a0`
- Base: `70fe1f1920979d43427be78332c4966acd3b408d`, which is also the merge-base
- Prior failed tip: `42d76f1c3df7e2977f5d5e8c7bdcca38de699be5`

| Artifact | Range | Bytes | SHA-256 |
|---|---|---|---|
| `.agent-review-fence-n1n2n3-correction-since-42d76f1.diff` | `42d76f1c3df7e2977f5d5e8c7bdcca38de699be5...4d6577b698d5cb64c1f3bf85477f03b6d69127a0` | 42,846 | `4DD866805A80D1508FA581C3C5C00CA8A9F44E33AFF608906821C9AAA767E8A1` |
| `.agent-review-fence-n1n2n3-cumulative-since-70fe1f1.diff` | `70fe1f1920979d43427be78332c4966acd3b408d...4d6577b698d5cb64c1f3bf85477f03b6d69127a0` | 271,101 | `A26FEF985F6E9F909DC4A8190B54981209F597A05B94CF789E61CE043FED4D70` |

These hashes can be recorded here because both diffs end at `4d6577b` and
therefore exclude this tail. They are not regenerated against the tail.

### Independent review report (verbatim)

The report is reproduced exactly as supplied, between the delimiter lines.

<!-- BEGIN VERBATIM INDEPENDENT REVIEW REPORT (4d6577b) -->

Full-class re-review: Fence Completion / admission-refresh stack at 4d6577b
There are no blocking findings, so the code-review verdict is PASS. The application gate for 4d6577b is still outstanding.

1. Starting state and scope — verified
Check	Result
Branch / HEAD	codex/fence-live-admission-refresh / 4d6577b698d5cb64c1f3bf85477f03b6d69127a0
Working tree	Clean. The only untracked entries are the ignored .agent-review-*.diff files and app/node_modules/.
Ancestry	First-parent chain is aa1640c → cf0327e → fe51fd1 → 42d76f1 → 7eb299f → 4d6577b. 1efcc99 is an ancestor.
Merge-base with 70fe1f1	70fe1f1920979d43427be78332c4966acd3b408d
7eb299f	Changes only docs/BUILDER-HANDOFF-fence-live-admission-refresh.md and precedes the implementation commit.
42d76f1...4d6577b	Exactly the seven authorized paths. No package or dependency file changes.
Cumulative app/package.json	One line changed. It registers the eight new suites, for 96 in total.
app/launcher-fence-invariant.test.js	Blob b43ae911… is identical at 42d76f1 and 4d6577b.
Invariant pins	The three regions are anchored inside the pty-start handler (main.js:1331 onward). The only main.js hunks in the correction are at lines 1218–1273, above the handler, so the pinned regions cannot have moved.
2. Artifact authentication — both match
Artifact	Bytes	SHA-256	Fresh diff
.agent-review-fence-n1n2n3-correction-since-42d76f1.diff	42846 ✔	4DD86680…A767E8A1 ✔	cmp: byte-identical
.agent-review-fence-n1n2n3-cumulative-since-70fe1f1.diff	271101 ✔	A26FEF98…043FED4D70 ✔	cmp: byte-identical
The comparison diffs were generated with git diff --no-color --no-ext-diff --output into the session scratchpad, outside the repository:

C:\Users\levij\AppData\Local\Temp\claude\C--Users-levij\b2de638d-0476-412a-a381-f957c59d9943\scratchpad\rev-4d6577b-correction-42d76f1.diff
…\scratchpad\rev-4d6577b-cumulative-70fe1f1.diff
No pinned artifact was touched.

3. Independence disclosure
Building: I did not take part in building any of these changes.
Prior reviews: I have no recollection or record of taking part in the earlier reviews. That is a limit of what I can know, not proof that I didn't.
Memory and builder context: the memory directory holds no MEMORY.md, and nothing about this project was loaded. I inherited no builder context. My only knowledge of earlier findings comes from the brief and the handoff documents.
Model family: I am the same model family (Claude) as the builder. This is disclosed, and it does not by itself affect independence.
4. N1 — empty tool declarations: fixed
The policy now refuses before any other tool check: role-fence-policy.js:103 returns TOOLS_EMPTY when parsed.tools.length === 0. This comes after the TOOLS_ABSENT check at :97 and before the forbidden-tool and allowlist loops.

How the real parser (role-frontmatter.js) handles each empty form:

tools: and tools:␠␠␠ store an empty scalar at :114-123, which parseList turns into [].

tools: "", tools: "   " and tools: " , " are unquoted at :39-55. Splitting on commas, trimming and filtering then gives [].

tools: , and tools: , , split to empty items, which are filtered out to give [].

Other shapes are refused by the parser before the policy sees them:

tools: '' gives the literal '', which fails TOOL_OK.
tools: [] hits the unsupported value-lead check.
tools: with an indented list below it is an unsupported structure.
All three end as the policy reason PARSE.

The check tests length === 0 rather than listing forms. So any other spelling that the parser reduces to [] is refused too, including Unicode whitespace removed by trim().

Where it runs: the check sits inside authorizeFencedRole. That runs after containment and before buildAgentCommand, prepareAdmissionPaneLaunch, pane-status enrolment and spawn (main.js:1386-1389 versus :1447 onward). verify-fence calls the same function.
Tests:
The policy test drives the real parser.
It first checks the parser's own view (toolsDeclared: true, tools: []), so the case really measures the policy.
Only the tools line changes; the hook path, hash and matcher stay canonical.
Omitted and declared-empty keys keep separate reasons.
A positive control with the tracked tool list is kept.
The main harness drifts the deployed fixture to each of the seven forms. It asserts the bounded reason, zero spawns and no [admission] line, then restores the file and shows the tracked role launches again.
CLI behaviour: nothing here shows how the CLI treats an empty tools: value, and the code comment correctly says so. The refusal does not depend on it.
5. N2 — validated registry listings: fixed
Why it holds. In probeManagedRegistryKey (main.js:1235-1274), the present flag is sticky. Every line is either:

ignored (blank),
accepted as the header, a value line or a direct subkey of the exact parent, or
rejected by throwing, which becomes a visible refusal.
So the result is present: false only when the whole listing was recognized and none of its lines equals the child path. Any lines injected through value names or data can only add lines or cause a throw. They cannot hide a real …\ClaudeCode subkey line. I found no way to bypass the check this way.

Item-by-item assessment:

Exact parent and hive expansion. parentLine and childLine come from the constant key with the hive expanded. A sibling-prefix near miss such as …\PoliciesX\… fails startsWith(parentLine + '\\') and throws.
Headerless listings. These are accepted only when every non-blank line is <exact parent>\<one segment>. That is enough to identify the exact parent: every line carries the full expanded parent prefix, and output for any other key would carry a different prefix and throw. The builder's host observation (HKLM: one subkey, HKCU: two, neither with a header) supports making the header optional.
Empty, blank-only or garbled successful output. No header and no subkey means unrecognized, which refuses. UTF-16 or NUL-laden output matches no form and throws.
Grandchildren, duplicate or misplaced headers, a value line before the header, a value line after subkeys. All throw.
Value-line syntax. The pattern is ^ {4}\S.*? {4}REG_[A-Z0-9_]+(?: {4}.*)?$, and trailing whitespace is stripped first, so a data-less (Default) line is accepted. Some unusual lines throw: a value name with a leading space, an unfamiliar type label, or data containing an embedded CR/LF. Each is a conservative false refusal, not a bypass.
Case folding, whitespace, encoding. toLowerCase on both sides, and a trailing \r is stripped. The output is decoded as UTF-8, though reg.exe likely writes in the OEM code page. Non-ASCII subkey names decode lossily, and under a DBCS code page a trail byte of 0x5C could show up as a stray backslash. Either way the line throws, so the effect is a false refusal. The child path is pure ASCII, so detecting it is unaffected. Unicode case quirks such as the Kelvin sign could only create a false "present".
Non-zero exit, ENOENT, timeout (10 s), maxBuffer (4 MiB). execFileSync throws, and the resolver maps that to resolve-managed-scope-unreadable (role-definition-resolver.js:89-91). The simulated-mode cases cover all of these.
Ordering. The registry probe runs inside resolve(), after containment and before any spawn or admission side effect.
6. N3 — agent-tree entry types: fixed
Ordering: entries are classified by type before any extension filtering (role-definition-resolver.js:130-141):
If the type methods are missing: UNSUPPORTED_ENTRY.
If isSymbolicLink(): LINKED_ENTRY, returned before any read or recursion.
If isDirectory(): recurse, as before.
If not isFile(): UNSUPPORTED_ENTRY.
Otherwise the .md filter applies as before.
Before the fix: at 42d76f1, a linked directory named without .md was silently skipped. A linked .md was followed; if it pointed at a directory, it was refused only by accident as CANDIDATE_UNREADABLE.
Real deployment: scripts/sync-roles.ps1:52 deploys with WriteAllText, which writes regular files. The tracked deployment therefore does not trigger the new refusal.
Test fixtures:
The injected entries separate "refused as a link" from "followed". A followed link would hit a throwing readFileSync and report CANDIDATE_UNREADABLE instead.
The real-junction case works inside a drive-root mkdtemp fixture (FIX\home\.claude\agents), with its target FIX\linked-target also inside the fixture.
Cleanup runs rmdirSync(link) in a finally, then rmSync(FIX, {recursive, force}). Both remove the junction itself, not its target, and the target is inside the fixture anyway.
USERPROFILE is redirected to the fixture, and no deployed role tree is touched.
Limits, stated in both the code and the handoff:
The roots and their ancestors are not checked with lstat.
Hard links cannot be detected.
This is not complete reparse-point protection.
7. Cumulative review and regression assessment
The correction does not touch any of the items below. Having read the cumulative code, I found the earlier accepted conclusions still hold:

Trusted sender and classification: ptyStartAuthority.assess(e, opts) is the first statement of the handler (main.js:1338), ahead of any log, filesystem read, admission or spawn. The classifier:
requires a strictly boolean videoScout;
requires Video Scout's flag and role to agree in both directions;
lets the role win over the CLI hint;
refuses unknown roles and CLIs.
M2: a fenced initialPrompt is refused unless it is undefined or '' (pty-launch-classify.js:106-109). buildAgentCommand also drops it for fenced launches (main.js diff at :55). Intact.
L1: authorizeFencedRole({cwd: resolvedCwd}) and then fencedCwd = resolvedCwd, so spawn uses the same canonical path. Intact.
L3: the comments now say admission eligibility is derived separately, with agreement shown by tests. Accurate and intact.
Frontmatter parsing, resolution precedence, allowlist, hook/matcher binding: unchanged from 42d76f1 apart from N1. Tool checks, then PreToolUse ownership, canonical real path, content SHA and matcher coverage run in that order.
Sandbox: mkdtempSync gives exclusive creation, and the .claude.json lock chain is unchanged.
P1 environment containment: buildPtyEnv reads launch.fenced. The ptyEnv block pin is unchanged.
Admission refresh: it runs only after the success gate (renderer/app.js:793-801), and refresh() handles its own IPC failures visibly (admission-view.js:241-256).
Test registration: all eight new suites are in npm test.
Red and green evidence (read, not rerun). The builder's failure counts against the old 42d76f1 code line up with the new assertions:

Policy, 14 failures: 7 empty forms × 2 assertions. Refused and bounded reason fail; the parser-view assertion passes on old code.
Resolver, 5 failures: the five N3 assertions.
Main harness, 33 failures:
Group	Arithmetic	Failures
N1 drift	7 forms × 2 assertions	14
N2 refusal modes	8 modes × 2 assertions	16
N3 junctions	linked-roles 2, plus linked.md 1 (wrong reason)	3
Total		33
No assertion was weakened. The one moved case, the grandchild line removed from near-miss, now has its own stricter grandchild case that expects a refusal. All of this is the builder's reported output. I did not run any tests, and the mocked PTY means none of it shows a real provider process.

8. Findings, ranked
Blocking: none.

F1 — Low (evidence limitation / host compatibility, not a bypass). main.js:1272. if (!headerSeen && subkeys === 0) throw.

Failure scenario: HKLM\SOFTWARE\Policies or HKCU\SOFTWARE\Policies exists but has no values or subkeys, and reg.exe prints empty or blank output for it. Every fenced launch, and verify-fence, would then refuse with resolve-managed-scope-unreadable.
A missing parent already refuses through exit 1, as accepted under L2.
What empty output looks like for an empty key was inferred, not observed. I have no evidence on how common such hosts are.
The header-plus-values form is likewise only simulated, not observed on a real host.
The failure is fail-closed and visible. It should be recorded as an application-gate and host-compatibility item.
F2 — Informational (broader N3 refusal, upstream evidence only).

Upstream libuv v1.x src/win/fs.c (fs__scandir, fetched during this review) sets the entry type as follows:
FILE_ATTRIBUTE_DEVICE → CHAR
otherwise FILE_ATTRIBUTE_REPARSE_POINT → LINK
otherwise directory → DIR
otherwise FILE
So any reparse-point entry inside a scanned tree would be refused as resolve-agent-tree-linked-entry, not only symlinks and junctions. That could include cloud-sync placeholders, dedup files and AF_UNIX sockets that carry the reparse-point attribute.
This is conservative. It is not verified against the libuv bundled in the installed Electron 42.5.0. The system Node reports libuv 1.52.1, but that is not the Electron runtime.
I have not verified any specific OneDrive or dedup case, and I am not claiming that files in a OneDrive folder are generally reparse points.
F3 — Informational (documentation accuracy). docs/BUILDER-HANDOFF-fence-live-admission-refresh.md:750.

The pre-registered regression case says a linked x.md refuses "even though its target content would parse as a matching role."
Neither implemented test does that. The injected link's target is unreadable by design, and the real linked.md junction points at an empty directory.
The implementation refuses regardless of target, so the logic is covered. The description overstates the fixture, though. The completion record does not repeat the claim. A correction note is advisable, but it is not a condition of approval.
F4 — Informational (test-host prerequisite, not a product defect). pty-start-authority-main.test.js, N2 real-mode section.

Its "oracle" largely repeats the production parser. It is observed-format evidence, not an independent implementation.
It asserts that no real ClaudeCode child exists. On a host with a genuine policy key, the positive controls and this assertion would fail, which is correct product behaviour.
A real present key has not been exercised, and none should be created.
F5 — Informational (pre-existing surface, optional hardening).

verify-fence (main.js:1115) and ensure-output-dir do not call the trusted-sender gate.
After the cumulative rewrite, verify-fence also triggers the read-only resolver and reg query on request.
reg is resolved by name (main.js:1243), not by an absolute System32 path.
The threat model already excludes same-user attackers. Not a condition of approval.
Carried, disposition unchanged:

N4 (informational): verify-fence resolves from the uncanonicalized outputs root and shares the pty-start refused […] log prefix.
N5 (informational): the LAUNCH_KIND import at main.js:47 is still unused.
L4 (nonblocking): the admission-refresh test inspects source text, and live acceptance is still owed.
9. The self-check observations
A (empty Policies key): I agree with it, at the "inferred" evidence level. See F1.
B (broader reparse refusal): confirmed from upstream source, not from local measurement. See F2.
C (registry test assumptions): agreed. It is a test-host prerequisite. See F4.
The self-check is context only and is not relied on for this verdict.

10. Handoff, procurement, H1
Handoff integrity:
Between 42d76f1 and 4d6577b, the only line removed from the handoff is the Status line, which was replaced. Everything else was appended.
The earlier literal VERDICT: FAIL blocks for cf0327e and 42d76f1 are preserved (:332, :633-634).
The pre-registration text and eight-path cap are intact.
The finding dispositions are accurate, except for F3.
The limitations and remaining verification are listed at :954-963.
Unverified claim: :907 says the prior re-review suggested requiring the header. I cannot verify that from the records I have.
Procurement: docs/OSS-PROCUREMENT-pane-status.md:1798 reads verbatim BLUE SUBSYSTEM VERDICT: BUILD FRESH. This is the admission procurement record, not a separate verdict for the Fence. merge-gate.ps1 does not check procurement prose.
H1: it passed only for aa1640cde37240295a5ba748f1c38cd3d82ddf39. I did not consult or rerun the H1 bundle.
11. Remaining verification (not established by this review)
The application gate: the full 96-suite run on 4d6577b.
L4 live acceptance, and the controlled Read/WebFetch matrix, including a check that undeclared tools are unavailable.
A real-host observation of an empty Policies parent (F1) and of the header-with-values listing form.
Entry-type behaviour under the libuv in Electron 42.5.0 for non-link reparse points (F2).
A real present ClaudeCode policy key has never been exercised, and this review does not claim it.
CLASS: Full
INDEPENDENCE: CONFIRMED
APPLICATION GATE FOR 4d6577b: OUTSTANDING
VERDICT: PASS

This verdict covers the code review only. It does not establish the outstanding application gate, and it does not authorize live testing, provider prompts, merge or push.

<!-- END VERBATIM INDEPENDENT REVIEW REPORT (4d6577b) -->

Terminal fields, retained exactly:

```text
CLASS: Full
INDEPENDENCE: CONFIRMED
APPLICATION GATE FOR 4d6577b: OUTSTANDING
VERDICT: PASS
```

### Disposition of nonblocking findings

None of these is promoted to a release-blocking experiment, and no code changes
are made for them.

- **F1 (Low): possible host-compatibility false refusal.** An existing
  `SOFTWARE\Policies` parent with no values and no subkeys may produce empty
  output, which the probe refuses. What `reg.exe` prints for an empty key is
  inferred, not observed. The header-with-values form is also only simulated.
  This is carried as an application-gate and host-compatibility observation.
- **F2 (Informational): broader reparse-point classification.** The reviewer's
  reading of upstream libuv implies that any reparse-point entry inside a scanned
  agents tree refuses as a linked entry. This is not verified for the libuv
  bundled in the installed Electron, or for specific cloud-sync or dedup files.
- **F3 (Informational): fixture description correction.** The linked-file
  fixtures did NOT contain a readable matching-role target:
  - the injected linked `other.md` has a target that is never readable by design;
  - the real `linked.md` junction points at an empty directory.

  The implementation refuses regardless of the target. The historical
  pre-registration wording ("even though its target content would parse as a
  matching role") is left unedited and is superseded by this note.
- **F4 (Informational): real-mode registry checks.** They record the real
  listing's output shape, and they assume the test host has no managed
  `ClaudeCode` policy. They are not an independent parser implementation, since
  the oracle largely mirrors the production recognizer.
- **F5, N4, N5:** retained as nonblocking observations.
  - F5: `verify-fence` and `ensure-output-dir` have no trusted-sender gate, and
    `reg` is resolved by name.
  - N4: `verify-fence` resolves from the uncanonicalized root and shares the log
    prefix.
  - N5: the `LAUNCH_KIND` import is unused.
- **L4 and the controlled live fence matrix remain outstanding.** A check that
  undeclared tools are unavailable belongs in the future live-test proposal and
  requires an explicit prompt budget.

On the reviewer's "unverified claim" about the earlier suggestion to require
the header: the `42d76f1` re-review report, as supplied to the builder, stated
under N2: "Fix: accept absence only if the listing contains the expanded parent
header line; otherwise throw." That report was not reproduced verbatim in this
handoff; only its terminal fields were. So the quotation rests on the supplied
report, not on a tracked record.

### Procurement

The admission procurement reference is unchanged: `docs/OSS-PROCUREMENT-pane-status.md`,
verdict verbatim:

> BLUE SUBSYSTEM VERDICT: BUILD FRESH

That verdict is not a separate Fence procurement verdict.
