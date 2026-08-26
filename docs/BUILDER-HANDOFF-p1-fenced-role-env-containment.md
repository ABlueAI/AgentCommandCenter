# Builder Handoff — P1 Fenced-Role Environment Containment

Branch: `codex/p1-fenced-role-env-containment`

Fork-point SHA: `d64192ba680d932623e5557793a159076e26d8d6`

Pre-merge main SHA: `d64192ba680d932623e5557793a159076e26d8d6`

Reviewed content tip SHA: `4372f9fa13734ada1674a265caba1725deae21fd`

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

After the focused Revision 2 verdict, the supplied reviewer-concurrence record
gave the bounded Revision 3 plan this controlling line verbatim:

> VERDICT ON PLAN: AUTHORIZED AS AMENDED — bounded correction, no procurement
> reopen, no merge authorization.

The seven amendments require: honest unspecified Windows collision semantics;
ASCII-only comparisons; reserved-key-only removal rather than global unfenced
deduplication; proof that `process.env` is not mutated; deliberately amended
unfenced expectations; a names-only fenced ConPTY key-set measurement; sentinel-
only, timeout-bounded, kill-on-exit production probes with explicit SKIP
accounting; and confirmation that `@lydell/node-pty` is already the module main
resolves. They also require exact B2 source excerpts, one fork-point AGR control
run per named suite, fail-closed missing Gemini behavior, and unchanged `229` /
`13205` source pins. No merge or push was authorized.

The independent Revision 3 review retained this controlling verdict verbatim:

> VERDICT: FAIL — CHANGES REQUESTED — NOT AUTHORIZED FOR MERGE

It found one remaining blocker: non-ASCII ambient spellings whose Unicode
uppercase collapses to an exact ASCII reserved name survived the strict ASCII
denylist comparison. Blue then authorized the bounded Revision 4 correction
verbatim:

> authorized

Revision 4 is limited to denylist-only rejection of those reserved aliases,
pure and production ConPTY regression coverage, the same source pins and AGR
tree, and an expanded artifact packet. It authorizes no `main.js`, dependency,
lockfile, provider-session, merge, or push change.

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
Video Scout launches begin with the pre-P1 `stripAdmissionEnv(process.env)`
base. Before explicit values are layered, every ASCII-case-insensitive ambient
variant of the always-main-owned scrub and pane-status transport names is
removed. A non-ASCII spelling is also removed if and only if its Unicode
uppercase collapses to an exact printable-ASCII reserved name. Video Scout
additionally reserves `GEMINI_API_KEY`; if the main-issued key is not a
non-empty string, the name remains absent rather than falling back to ambient
residue. Main then layers, in order:

1. `CLAUDE_CODE_SUBPROCESS_ENV_SCRUB=1`;
2. Video Scout's safeStorage `GEMINI_API_KEY`, only for Video Scout;
3. only the two exact main-issued pane-status transport entries.

That correction is reserved-key-only. Unrelated unfenced ambient duplicates
such as `Path`/`PATH` remain untouched because globally choosing a winner could
change launch behavior. Non-Video-Scout unfenced panes deliberately retain
ambient `GEMINI_API_KEY` residue in any casing; this branch does not claim to
contain Gemini outside Video Scout or fenced roles.

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

Revision 3 itself has an exact four-path cap: `app/pty-env.js`,
`app/pty-env.test.js`, `BLUE-HELM-MASTER-STATUS.md`, and this handoff-only tail.
The cumulative branch remains exactly the eight paths above. `app/package.json`
was not changed for Revision 3 because the production ConPTY proof remains in
the already-registered `app/pty-env.test.js` suite.

Revision 4 has the same exact four-path cap: `app/pty-env.js`,
`app/pty-env.test.js`, `BLUE-HELM-MASTER-STATUS.md`, and this handoff-only tail.
The cumulative branch remains exactly the same eight paths, and the existing
registered suite still requires no package change.

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

The 120-assertion suite poisons credential, provider, business, admission,
host-tooling, unknown, Tier 2, and pane-status-shaped variables; exercises all
six roles plus Video Scout, bare CLI, and plain shell; proves explicit
pane-status filtering and reserved-name collision removal; proves
`process.env` is byte-identical before and after builder use; includes a
detector negative control and names-only production ConPTY measurement; and
structurally traces the builder output into the single `pty.spawn`.

Revision 4 adds `CLAUDE_CODE_ſUBPROCESS_ENV_SCRUB`, `GEMıNI_API_KEY`, and
`BLUE_HELM_PANE_STATUS_PıPE` as genuine fixture and production-spawn poison.
The strict ASCII fold remains the only allowlist mechanism. Only when that fold
refuses a source name does a second helper uppercase the spelling and ask
whether the result is printable ASCII and an exact member of the frozen
reserved denylist. It can remove but never admit a name. An unrelated
`BLUE_HELM_💙` entry is retained as the negative control against broad Unicode
deletion.

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

Revision 3 also closes the remaining case-collision blocker. The pre-P1
expression already layered canonical main values after ambient entries; P1 did
not introduce that shape, but made its guarantee load-bearing. If differently
cased Windows-equivalent names coexist in an environment block, which value a
lookup returns is unspecified. The branch therefore makes no insertion-order or
"first wins" production claim: it removes all ASCII-case-insensitive ambient
variants of reserved names before adding at most one canonical entry.

The fenced PowerShell child reported this complete names-only set:

`APPDATA`, `CLAUDE_CODE_SUBPROCESS_ENV_SCRUB`, `ComSpec`, `HOMEDRIVE`,
`HOMEPATH`, `LOCALAPPDATA`, `NUMBER_OF_PROCESSORS`, `OS`, `PATH`, `PATHEXT`,
`PROCESSOR_ARCHITECTURE`, `ProgramData`, `ProgramFiles`, `ProgramFiles(x86)`,
`ProgramW6432`, `PSModulePath`, `SystemDrive`, `SystemRoot`, `TEMP`, `TMP`,
`USERPROFILE`, `windir`.

After removing the explicit scrub from that observation, its diff against the
constructed Tier 1 set was exactly `added=[]`, `missing=[]`. A separate
case-poisoned Video Scout map passed through the same builder and installed
`@lydell/node-pty`; PowerShell observed `1`, `sentinel-main-gemini`,
`sentinel-main-pipe`, and `sentinel-main-token`, and none of the ambient poison.
The harness uses `-NoProfile -NonInteractive`, a 10-second timeout, kills the PTY
on every completion path, and counts unavailable ConPTY as SKIP rather than PASS.

### B2 — evidence supplied and claim narrowed

Normalized committed `main.js` evidence at `4372f9f` (the blob is unchanged
from `67a175e`):

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

The exact requested read-only excerpts are included here so the claim can be
reviewed from the artifact alone. Fenced-role declaration:

```js
const FENCED_ROLES = new Set(['web-scout', 'operator', 'source-scout']);
```

Role command classifier, verbatim:

```js
function buildAgentCommand({ cli, agent, role, model, effort, initialPrompt }) {
  if (role && VALID_ROLES.has(role)) {
    // `--agent` is a Claude feature, so roles always launch on the Claude CLI regardless
    // of any cli hint (the Gemini video-scout path injects its brief differently — Phase C).
    let cmd = AGENT_CMD.claude + ' --agent ' + role;
    if (VALID_MODELS.has(model)) cmd += ' --model ' + model;
    if (VALID_EFFORTS.has(effort)) cmd += ' --effort ' + effort;
    // Optional opening prompt (e.g. the reviewer's "review this diff"). Strip shell-significant
    // characters so it stays a single safe quoted argument inside the powershell -Command string.
    if (initialPrompt && typeof initialPrompt === 'string') {
      const clean = initialPrompt.replace(/["`$\r\n]/g, ' ').replace(/\s+/g, ' ').trim();
      if (clean) cmd += ' "' + clean + '"';
    }
    return cmd;
  }
  return AGENT_CMD[cli || agent]; // undefined when unknown/falsy -> plain shell
}
```

`pty-start` sender boundary, verbatim:

```js
ipcMain.handle('pty-start', (_e, opts) => {
  tlog(`pty-start: START id=${opts.id} role=${opts.role || 'none'} cwd=${opts.cwd || '(unset)'}`);
  const { id, cols, rows } = opts;
```

There is no sender-trust check between receipt of `_e` and use of `opts`; `_e`
is unused. This is evidence of the deferred boundary, not a claim that it is
safe. The mutually exclusive dispatch remains `if (opts.videoScout) { ... }
else { const run = buildAgentCommand(opts); ... }`.

### B3, N1, N2, and N6

Pane status now admits only `BLUE_HELM_PANE_STATUS_PIPE` and
`BLUE_HELM_PANE_STATUS_TOKEN`; a hostile-shaped enrollment object cannot replace
the forced scrub, Video Scout key, `PATH`, or add an extra status entry. ASCII-
only folding governs admission, while the Revision 4 Unicode fallback is
denylist-only and closes the reserved-name alias channel. Both fenced and
unfenced paths normalize invalid `baseEnv` input to `{}`. Finally, the test
parses main's actual `FENCED_ROLES` declaration and fails if its complete matrix
drifts.

Filtering is dynamically proven; main-process wiring is structurally pinned;
adversarial live/provider behavior remains for the later fence-completion item.

### Existing production PTY module identity

No dependency was added. `app/package.json` already declares
`"@lydell/node-pty": "^1.2.0-beta.12"`, and `app/main.js` already requires
`@lydell/node-pty`. A `Module.createRequire` anchored at the committed
`app/main.js` resolved
`D:\Workspace\agent-command-center\app\node_modules\@lydell\node-pty\index.js`.
The linked worktree's `app/node_modules` is a junction to that same application
dependency tree. The lockfile is unchanged and procurement does not reopen.

## Re-pinned committed regions

The pins were rechecked from normalized `git show
4372f9fa13734ada1674a265caba1725deae21fd:app/main.js` bytes. Revisions 2, 3,
and 4 did not modify `main.js`, so every Revision 1 pin remains exact:

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

Revision 2 focused Node gates, retained as history:

- `node app/pty-env.test.js` — **83 passed, 0 failed**
- `node app/launcher-fence-invariant.test.js` — **26 passed, 0 failed**
- `node app/admission-budget-config.test.js` — **86 passed, 0 failed**
- `node app/admission-budget.test.js` — **243 passed, 0 failed**

Fresh Revision 3 focused Node gates:

- `node app/pty-env.test.js` — **109 passed, 0 failed, 0 skipped**
- `node app/launcher-fence-invariant.test.js` — **26 passed, 0 failed**
- `node app/admission-budget-config.test.js` — **86 passed, 0 failed**

Fresh Revision 4 focused Node gates:

- `node app/pty-env.test.js` — **120 passed, 0 failed, 0 skipped**
- `node app/launcher-fence-invariant.test.js` — **26 passed, 0 failed**
- `node app/admission-budget-config.test.js` — **86 passed, 0 failed**

The Revision 4 production collision source genuinely contained all three
non-ASCII aliases. The pure map and the installed node-pty/ConPTY child both
omitted them, observed the canonical main sentinels, retained the unrelated
Unicode negative control, and retained the existing fenced names-only result
with `added=[]`, `missing=[]`, and no identity back-fill.

The launcher invariant independently re-proved the unchanged `229`-byte
environment-block pin and `13205`-byte handler pin at the reviewed content tip.

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

Revision 3 did run the promised authoritative Pester gate outside the restricted
filesystem sandbox:

- `powershell.exe -NoProfile -ExecutionPolicy Bypass -File
  scripts/run-pester.ps1` — **955 passed, 0 failed, 0 skipped (of 955)**, exit
  `0`, in `136.12s`.

Revision 4 reran that authoritative gate outside the restricted filesystem
sandbox:

- `powershell.exe -NoProfile -ExecutionPolicy Bypass -File
  scripts/run-pester.ps1` — **955 passed, 0 failed, 0 skipped (of 955)**, exit
  `0`, in `149.5s`.

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

### Revision 3 fork-point control and fresh branch gate

The amended authorization required a fresh control at fork point `d64192ba`.
Each named suite was run exactly once in the real `main` worktree:

- `node dockview-bootstrap.test.js` — exit `1`; the two-report parser failure at
  position `259`, `render-process-gone` / `launch-failed`, `ERR_FAILED (-2)`,
  and GPU exit `-1073741515` (`0xC0000135`);
- `node dockview-app-integration.test.js` — exit `1`; no report, production
  scenario `ERR_FAILED (-2)`, and GPU exit `-1073741515` (`0xC0000135`).

One fresh Revision 3 `npm.cmd test` gate then used the same AGR tree. The chain
ran from the first registered suite through `dockview-bootstrap.test.js`, which
stopped before product assertions with the fork-point-matched signature. The
next unexecuted suite, `dockview-app-integration.test.js`, ran once and stopped
before product assertions with its fork-point-matched signature. The remaining
suffix from `renderer/dockview-fit-policy.test.js` through
`renderer/admission-view.test.js` ran once and exited `0`.

All **88 registered suites were attempted exactly once**: **86 green**, only
the two named pre-assertion AGR candidates, no retry, omission, other failure,
or product assertion. The updated `pty-env.test.js` ran in that suffix and was
green at **109/0/0**. The builder records and routes this evidence; it does not
grant its own exception or merge authorization.

### Revision 4 fork-point control and fresh branch gate

By Revision 4, the primary `main` worktree had advanced beyond `d64192ba`. To
avoid moving it, the tracked `app/` tree from exact commit
`d64192ba680d932623e5557793a159076e26d8d6` was materialized under the Windows
temporary directory and linked only to the branch's already-installed
`app/node_modules`. No source came from current `main`. Each control suite ran
once from that exact source snapshot:

- `node dockview-bootstrap.test.js` — exit `1`; the two-report parser failure at
  position `259`, `render-process-gone` / `launch-failed`, `ERR_FAILED (-2)`,
  and GPU exit `-1073741515` (`0xC0000135`);
- `node dockview-app-integration.test.js` — exit `1`; no report, production
  scenario `ERR_FAILED (-2)`, and GPU exit `-1073741515` (`0xC0000135`).

One fresh Revision 4 branch gate then followed the same tree. `npm.cmd test`
stopped at bootstrap with the fork-point-matched signature. App integration
ran once and stopped with its fork-point-matched signature. The remaining
suffix was invoked once from `renderer/dockview-fit-policy.test.js` through the
final registered suite. Its retained stream showed green summaries through
`admission-budget-config.test.js` and no visible failure, and the process then
exited. However, the output exceeded the execution window; the controller lost
the session handle before the terminal chunk and exit code were collected.
Therefore Revision 4 does **not** claim **86 green**, exact complete output
reconciliation, or a passed app gate. No suite or suffix was retried to conceal
that evidence gap. The two named branch failures still match their fork-point
controls, but the incomplete suffix capture is routed to independent review as
a limitation rather than an AGR admission.

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
- Windows resolution of case-equivalent names in a duplicate-bearing
  environment block is treated as unspecified. Revision 4 guarantees one
  canonical entry only for reserved/main-issued names, including the tested
  Unicode-to-ASCII reserved aliases; unrelated unfenced ambient duplicates
  remain a separate known item.
- Non-Video-Scout unfenced panes still inherit ambient Gemini residue. P1 does
  not present reserved Video Scout injection as global Gemini containment.
- `pty-start` lacks a trusted-sender gate. Classification integrity is outside
  the narrowed P1 invariant and remains explicit fence-completion work.
- Same-user filesystem access remains possible and is outside this environment
  filtering invariant.
- The two Dockview pre-assertion observations require independent AGR
  disposition before merge authorization.
- The Revision 4 suffix process completed, but its terminal chunk and exit code
  were not retained. No complete-green Revision 4 app-gate claim is made.

## Recommended Full-class review focus

Focused Full-class re-review is requested for the Revision 3 blocker, artifact
coverage, and AGR evidence:

1. B-1: verify Unicode uppercase is reachable only from the reserved-name
   omission path, can never admit an allowlist name, removes the three supplied
   aliases, and retains the unrelated Unicode negative control.
2. Verify the complete names-only fenced measurement, `added=[]` /
   `missing=[]`, and absence of identity back-fill on the production path.
3. Artifact coverage: use the complete `main.js` source artifact for
   `FENCED_ROLES`, `buildAgentCommand`, and the sender boundary; use the external
   tail artifact for this post-content handoff commit.
4. Confirm sender/classifier integrity, non-Video-Scout Gemini residue, value
   typing, `__proto__`, and broader mutation questions remain explicit
   non-blocking/deferred items rather than new claims.
5. AGR: compare the once-only fork-point and branch observations against the
   supplied rule, including the Revision 4 suffix capture limitation. The
   builder does not ask the reviewer to infer a green exit.
6. Verify the cumulative eight-path cap and the Revision 4 four-path cap.

## Review diff

Pinned cumulative artifact:
`.agent-review-codex-p1-fenced-role-env-containment.diff`

Command:

`git diff --output=.agent-review-codex-p1-fenced-role-env-containment.diff d64192ba680d932623e5557793a159076e26d8d6...4372f9fa13734ada1674a265caba1725deae21fd`

Pinned cumulative diff byte length: `99314`

Pinned diff SHA-256:
`f4f7be54352333097b30e25c3f7609b19a8bd98d0c6cb53b07a4b71998257fb9`

Pinned focused Revision 4 artifact:
`.agent-review-codex-p1-fenced-role-env-containment-r4.diff`

Command:

`git diff --output=.agent-review-codex-p1-fenced-role-env-containment-r4.diff 29f86240e9ca5e3fe6c94582f5d581e484c96203...4372f9fa13734ada1674a265caba1725deae21fd`

Focused diff byte length: `12003`

Focused diff SHA-256:
`597d858e9cb78f2700c860d2c5f394bf0e838fb720185bed373e5695f5955d55`

Pinned complete `main.js` source artifact:
`.agent-review-codex-p1-fenced-role-env-containment-main-source.diff`

Command:

`git diff --output=.agent-review-codex-p1-fenced-role-env-containment-main-source.diff 4b825dc642cb6eb9a060e54bf8d69288fbee4904 4372f9fa13734ada1674a265caba1725deae21fd -- app/main.js`

Main-source artifact byte length: `89559`

Main-source artifact SHA-256:
`80a30280f0621bcabccb2c5ea67024c7ad2c8a159104f6868d70211067027257`

All three content artifacts were regenerated to explicitly named twins,
compared byte-for-byte, and the identical twins removed. All are gitignored by
`.gitignore:33`.

After the handoff-only tail commit, the external review packet also includes
`.agent-review-codex-p1-fenced-role-env-containment-r4-tail.diff`, generated
from content tip `4372f9f` to the final tail tip. Its byte count and SHA-256 are
reported outside this file after that commit; embedding its own identity here
would create a self-reference loop.

After merge, reproduce the reviewed delta from the recorded pre-merge main SHA,
not from the then-advanced `main` name.

Round-1 reviewer verdict, retained verbatim:

`VERDICT: CHANGES REQUESTED — NOT AUTHORIZED FOR MERGE`

That verdict applies to reviewed content tip `94a1cbd`.

Round-2 focused reviewer verdict, retained verbatim:

`VERDICT: FAIL — CHANGES REQUESTED — NOT AUTHORIZED FOR MERGE`

That verdict applies to Revision 2 content tip `67a175e` with handoff tail
`9d83522`.

Round-3 focused reviewer verdict, retained verbatim:

`VERDICT: FAIL — CHANGES REQUESTED — NOT AUTHORIZED FOR MERGE`

That verdict applies to Revision 3 content tip `6574192` with handoff tail
`29f8624`. Revision 4 reviewed-content candidate `4372f9f` responds to its one
blocking Unicode-reserved-alias finding but has no PASS. Independent focused
Full-class re-review is pending, and the app-suffix capture limitation is
explicit evidence for that reviewer.

Reviewer verdict source:
`C:\Users\levij\Downloads\REVIEW-full-class-p1-fenced-role-env-containment.md`
