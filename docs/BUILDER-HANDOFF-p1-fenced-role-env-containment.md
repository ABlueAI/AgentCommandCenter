# Builder Handoff — P1 Fenced-Role Environment Containment

Branch: `codex/p1-fenced-role-env-containment`

Fork-point SHA: `d64192ba680d932623e5557793a159076e26d8d6`

Pre-merge main SHA: `d64192ba680d932623e5557793a159076e26d8d6`

Reviewed content tip SHA: `67a175e4f4b5e1f4053c31e9d3b3d051f774fdab`

Branch tail: this handoff document only; the reviewed content tip above is the
three-dot review endpoint.

Merge commit SHA: Pending until review and human-authorized merge.

## Authorization and procurement disposition

Blue authorized Revision 1 verbatim:

> AUTHORIZE REVISION 1: restore the admission threat-boundary statements,
> re-pin the handler, and run one fresh app gate under the same AGR decision
> tree.

After the independent `CHANGES REQUESTED` review, Blue accepted the bounded
Revision 2 plan with the verbatim reply:

> great, let us continue

The accepted plan explicitly bounded Revision 2 to B1 measurement, B3/N1/N2/N6
corrections, B2 claim narrowing, one fork-point execution of each named
Dockview suite, and one fresh branch app gate under the existing AGR tree. It
authorized no provider session, dependency, `main.js` change, merge, or push.

The controlling OSS disposition is verbatim:

> P1 hardens the existing owned PTY environment boundary and introduces no new
> subsystem or dependency; the OSS procurement gate does not reopen.

This branch adds no dependency and no subsystem. The disposition is recorded in
the tracked `BLUE-HELM-MASTER-STATUS.md` P1 implementation checkpoint. No live
provider session or paid model request was run.

## Intended invariant

Given the existing classification decision, the sole `pty.spawn` boundary uses
the standing fenced predicate
`!opts.videoScout && opts.role && FENCED_ROLES.has(opts.role)` to select an
environment constructed from an empty object and Blue's exact Tier 1 Windows
allowlist. Ambient variables outside that list cannot enter a fenced PTY.

That is deliberately a narrower claim than Revision 1: P1 does **not** establish
the integrity of renderer-supplied role/Video-Scout classification or add a
trusted-sender gate to `pty-start`. That is explicit fence-completion work in
`BLUE-HELM-MASTER-STATUS.md` item 4.

Unfenced builder, reviewer, codebase-scout, bare CLI, plain PowerShell, and
Video Scout launches retain the pre-P1 `stripAdmissionEnv(process.env)` base
behavior. Main then layers, in order:

1. `CLAUDE_CODE_SUBPROCESS_ENV_SCRUB=1`;
2. Video Scout's safeStorage `GEMINI_API_KEY`, only for Video Scout;
3. only the two exact main-issued pane-status transport entries.

No environment name/value collection is emitted to logs. The admission ledger
remains an accidental-spend control, not a hostile same-user security boundary;
`APPDATA` and `USERPROFILE` remain available in Tier 1.

## Files changed — exact eight-path cap

1. `app/pty-env.js`
2. `app/pty-env.test.js`
3. `app/package.json`
4. `app/main.js`
5. `app/launcher-fence-invariant.test.js`
6. `app/admission-budget-config.test.js`
7. `docs/BUILDER-HANDOFF-p1-fenced-role-env-containment.md`
8. `BLUE-HELM-MASTER-STATUS.md`

No lockfile, dependency, renderer, preload, provider, credential-store, or
PowerShell production file changed.

## Security-sensitive surfaces touched

- `ipcMain.handle('pty-start') -> buildPtyEnv -> pty.spawn`
- inherited process-environment filtering for `web-scout`, `operator`, and
  `source-scout`
- explicit Claude scrub, Video Scout key, and pane-status injection order
- admission-budget source tripwires and the pinned launcher-fence invariant

## Implementation and proof

`app/pty-env.js` is pure: no Electron, process-global read, filesystem, spawn,
or logging. Its frozen allowlist is exactly:

`PATH`, `PATHEXT`, `SystemRoot`, `windir`, `SystemDrive`, `ComSpec`,
`USERPROFILE`, `HOMEDRIVE`, `HOMEPATH`, `APPDATA`, `LOCALAPPDATA`, `TEMP`,
`TMP`, `ProgramFiles`, `ProgramFiles(x86)`, `ProgramW6432`, `ProgramData`,
`PSModulePath`, `NUMBER_OF_PROCESSORS`, `PROCESSOR_ARCHITECTURE`, `OS`.

Matching is ASCII-case-insensitive after rejecting non-printable/non-ASCII
source names; source spelling and values are preserved, and a synthetic case
collision resolves deterministically to first insertion. Missing entries are
not invented. Unicode aliases such as `Oſ`, `SyſtemRoot`, and `Programﬁles` are
rejected rather than folded into allowlisted names.

The 83-assertion suite poisons credential, provider, business, admission,
host-tooling, unknown, Tier 2, and pane-status-shaped variables; exercises all
six roles plus Video Scout, bare CLI, and plain shell; proves explicit
pane-status filtering and collision refusal; includes a detector negative
control; and structurally traces the builder output into the single
`pty.spawn`.

### B1 — corrected mechanism and production measurement

The Revision 1 statement that Windows synthesized three identity defaults was
wrong and is withdrawn. With `USERNAME`, `USERDOMAIN`, and `LOGONSERVER`
poisoned in the **real intermediate parent environment**, the pure builder first
proved all three names absent. A libuv `child_process.spawnSync` grandchild then
observed all three poison values exactly: libuv back-filled its Windows
`required_vars` entries from the real parent. The former fixture-only identity
assertion was removed.

The same intermediate process passed the same fenced map to the repository's
production `@lydell/node-pty` package, spawning PowerShell through ConPTY. That
child observed all three values as empty. This directly measures the production
spawn mechanism and proves it preserves the builder's omission; the libuv child
is retained only as a proxy/negative contrast. No agent or provider was launched.

### B2 — evidence supplied and claim narrowed

Normalized committed `main.js` evidence at `67a175e`:

- role-command classifier, from `const VALID_ROLES =` to before the Video Scout
  section: length `1744`, SHA-256
  `cd09e3d7f98b36f24ee80efc7450282517f6bd5a9d903c762f49198d3a766a41`;
- `pty-start` dispatch through the byte before `prepareAdmissionPaneLaunch`:
  length `6188`, SHA-256
  `294d22c0d97a520bf2ae147effc7c2be7d6c7de395d9f061b61c7d1f64b538a4`.

Those regions show: `FENCED_ROLES` is exactly `web-scout`, `operator`, and
`source-scout`; `buildAgentCommand` exact-matches `VALID_ROLES` with no role
normalization; and Video Scout dispatch is mutually exclusive with
`buildAgentCommand`, so `{role:'web-scout', videoScout:true}` launches Video
Scout rather than the web-scout agent. They also show the `pty-start` event is
named `_e` and no trusted-sender gate is applied. The latter is not hidden or
declared safe: P1's claim is filtering given that existing decision, and sender/
classifier integrity is explicit remaining fence-completion work.

### B3, N1, N2, and N6

Pane status now admits only `BLUE_HELM_PANE_STATUS_PIPE` and
`BLUE_HELM_PANE_STATUS_TOKEN`; a hostile-shaped enrollment object cannot replace
the forced scrub, Video Scout key, `PATH`, or add an extra status entry. ASCII-
only folding closes the Unicode alias channel. Both fenced and unfenced paths
normalize invalid `baseEnv` input to `{}`. Finally, the test parses main's actual
`FENCED_ROLES` declaration and fails if its complete matrix drifts.

Filtering is dynamically proven; main-process wiring is structurally pinned;
adversarial live/provider behavior remains for the later fence-completion item.

## Re-pinned committed regions

The pins were rechecked from normalized `git show
67a175e4f4b5e1f4053c31e9d3b3d051f774fdab:app/main.js` bytes. Revision 2 did
not modify `main.js`, so every Revision 1 pin remains exact:

- fenced-role cwd gate, unchanged: length `1326`, SHA-256
  `9a1255f1e81e0a9e4e289ab15380707dd6bcc1d410ffd16f44adddb99b16f8c6`
- P1 environment block: length `229`, SHA-256
  `18cf42b434ee922ee61194d9316150c0b766591e063d0b0545f6aebc8d85cb54`
- Revision 1 `pty-start` handler: length `13205`, SHA-256
  `14d3ae60ed6ea32e4231fdef7d0979e160207b0580466f53178a4b9f86098486`

The Revision 1 handler restores the required inherited-key effect,
`APPDATA`/`USERPROFILE` visibility, and accidental-spend threat-boundary
statements. Executable statements in the P1 environment block were unchanged
from the first P1 gate attempt.

## Commands run and exact results

Focused Node gates:

- `node app/pty-env.test.js` — **83 passed, 0 failed**
- `node app/launcher-fence-invariant.test.js` — **26 passed, 0 failed**
- `node app/admission-budget-config.test.js` — **86 passed, 0 failed**
- `node app/admission-budget.test.js` — **243 passed, 0 failed**

Pester:

- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/run-pester.ps1`
  under the workspace sandbox was non-authoritative: **922 passed, 33 failed**.
  Thirty-two failures contained the sandbox-only Git warning
  `unable to access C:\Users\levij/.config/git/ignore: Permission denied`; the
  remaining config-only Gemini policy check reported `GEMINI_API_KEY` missing.
  That invocation loads configuration only and made no provider request.
- The same command was then run once outside that restricted filesystem sandbox
  to remove those environmental distortions: **955 passed, 0 failed, 0 skipped
  (of 955)**, exit `0`, in `222.34s`.

Pester was not rerun for Revision 2: the corrective delta changes no PowerShell,
Pester, package registration, or runner file. The green 955 result above is
carried forward and is not described as fresh.

### App gate and AGR routing

The initial pre-Revision-1 `npm.cmd test` observation is retained, not erased:
both named Dockview suites stopped before product assertions with the
Electron/GPU `0xC0000135` family; the continued suffix then found two genuine
`admission-budget.test.js` assertion failures because the first edit had removed
required threat-boundary statements. Work stopped. No retry occurred.

After Blue's explicit Revision 1 authorization, one fresh `npm.cmd test` gate
ran under the same AGR decision tree:

- `dockview-bootstrap.test.js` stopped before product assertions with
  `render-process-gone`, GPU exit `-1073741515` (`0xC0000135`), plus the known
  double-report JSON parser symptom;
- the next unexecuted suffix was run once, beginning with
  `dockview-app-integration.test.js`; that suite stopped before product
  assertions with the same Electron/GPU signature;
- the remaining unexecuted suffix, from
  `renderer/dockview-fit-policy.test.js` through the final registered suite, ran
  once and exited `0`;
- all **88 registered suites were attempted exactly once**: **86 suites green**
  and only the two named pre-assertion Electron failures above. No suite was
  retried.

This builder does **not** declare the app gate passed and does not admit an AGR
exception. Whether these two observations qualify under the narrow AGR rule is
the independent Full reviewer's determination. No aggregate assertion count is
claimed because the two Electron suites never reached their normal summaries.

### Revision 2 fork-point falsification and branch gate

Before editing, the two named suites were each run exactly once in the real
`main` worktree at fork point `d64192ba680d932623e5557793a159076e26d8d6`:

- `node dockview-bootstrap.test.js` — exit `1`; `render-process-gone` /
  `launch-failed`, double-report parse error at position `259`, `ERR_FAILED
  (-2)`, and GPU exit `-1073741515` (`0xC0000135`);
- `node dockview-app-integration.test.js` — exit `1`; no parseable report,
  production scenario `ERR_FAILED (-2)`, and GPU exit `-1073741515`
  (`0xC0000135`).

After the corrections, one authorized Revision 2 `npm.cmd test` gate used the
same rule. Bootstrap stopped with the same pre-assertion signature; the next
unexecuted segment, app integration, was run once and stopped with the same
pre-assertion signature; the remaining suffix from
`renderer/dockview-fit-policy.test.js` through `renderer/admission-view.test.js`
ran once and exited `0`. All **88 registered suites were attempted exactly
once**: **86 green**, only the two named AGR candidates, no retry, omission,
other failure, or product assertion.

This is direct same-machine fork-point non-attribution evidence. The builder
still does not grant the exception.

The exact user-issued AGR rule was:

- run once, with no retry;
- an exception candidate is limited to the two named Dockview suites failing
  before product assertions with the recorded Electron/GPU `0xC0000135` family;
- if the `&&` chain aborts, run the unexecuted suffix once from the next
  registered segment and reconcile all suites exactly once;
- route exact evidence to the independent reviewer; the builder cannot declare
  it admissible;
- any other suite, product assertion, signature, retry, or omission is a stop.

Source: the P1 next-task handoff supplied by Blue, §12 “AGR handling”; its
durable history references are `docs/BUILDER-HANDOFF-pane-status-production.md`
§19.F and `docs/AUDIT-app-gate-reliability.md`.

After the full Revision 2 gate, only comments and assertion-label wording in
`app/pty-env.js` / `app/pty-env.test.js` were clarified to stop calling the
libuv proxy the product path. No product logic or assertion condition changed;
the final focused P1 suite was rerun and remained **83/0**. The one-run app-gate
authority was not silently expanded into a retry.

## Manual verification

No live/provider adversarial launch was authorized or performed. No app restart
or UI acceptance claim is made. The proof in this branch is pure construction,
a poisoned-parent libuv contrast, the real node-pty/ConPTY mechanism,
structural main-process tracing, committed-byte pins, and the recorded automated
gates above.

## Known limitations

- The production spawn mechanism is dynamically measured through the same
  `@lydell/node-pty`/ConPTY package and PowerShell executable, while the Electron
  main-process call site remains structurally pinned rather than exercised by a
  live provider pane.
- libuv-spawned Windows children back-fill required identity entries from their
  real parent. That is not the production PTY mechanism and is not generalized
  into a claim about Windows or ConPTY.
- `pty-start` lacks a trusted-sender gate. Classification integrity is outside
  the narrowed P1 invariant and remains explicit fence-completion work.
- Same-user filesystem access remains possible and is outside this environment
  filtering invariant.
- The two Dockview pre-assertion observations require independent AGR
  disposition before merge authorization.

## Recommended Full-class review focus

Focused re-review is requested only for the prior review's B1–B3 and AGR items:

1. B1: inspect the real-parent poison and libuv-versus-node-pty measurement;
   confirm the fixture-only assertion and false Windows attribution are gone.
2. B2: verify the two pinned supporting regions and the narrowed claim; confirm
   sender/classifier integrity is explicit remaining work, not implied complete.
3. B3/N1/N2/N6: inspect exact pane-status filtering, collision tests, ASCII-only
   folding, symmetric input normalization, and main-role synchronization.
4. AGR: compare the once-only fork-point and branch observations against the
   supplied rule and make the independent admissibility decision.
5. Verify the cumulative eight-path cap and this handoff-only tail.

## Review diff

Pinned cumulative artifact:
`.agent-review-codex-p1-fenced-role-env-containment.diff`

Command:

`git diff d64192ba680d932623e5557793a159076e26d8d6...67a175e4f4b5e1f4053c31e9d3b3d051f774fdab --output=.agent-review-codex-p1-fenced-role-env-containment.diff`

Pinned cumulative diff byte length: `63962`

Pinned diff SHA-256:
`33f041ab209df76c94ea8af0884190d7421a3c011e070750c845d17cfd2145f6`

Pinned focused Revision 2 artifact:
`.agent-review-codex-p1-fenced-role-env-containment-r2.diff`

Command:

`git diff e49628e68e839baf8957abd7604101fe522f3047...67a175e4f4b5e1f4053c31e9d3b3d051f774fdab --output=.agent-review-codex-p1-fenced-role-env-containment-r2.diff`

Focused diff byte length: `18879`

Focused diff SHA-256:
`5935ffd1c9d3353a2e85538d0cbdf2d128a703e3e32856fd7cf02cb0b4286210`

After merge, reproduce the reviewed delta from the recorded pre-merge main SHA,
not from the then-advanced `main` name.

Prior reviewer verdict, retained verbatim:

`VERDICT: CHANGES REQUESTED — NOT AUTHORIZED FOR MERGE`

That verdict applies to reviewed content tip `94a1cbd`; Revision 2 at `67a175e`
responds to it but has no PASS. Focused independent Full re-review is pending.

Reviewer verdict source:
`C:\Users\levij\Downloads\REVIEW-full-class-p1-fenced-role-env-containment.md`
