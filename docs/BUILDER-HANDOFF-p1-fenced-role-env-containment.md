# Builder Handoff — P1 Fenced-Role Environment Containment

Branch: `codex/p1-fenced-role-env-containment`

Fork-point SHA: `d64192ba680d932623e5557793a159076e26d8d6`

Pre-merge main SHA: `d64192ba680d932623e5557793a159076e26d8d6`

Reviewed content tip SHA: `94a1cbd20fdcf5b388fa3f21ecc1c49cfa4e133b`

Branch tail: this handoff document only; the reviewed content tip above is the
three-dot review endpoint.

Merge commit SHA: Pending until review and human-authorized merge.

## Authorization and procurement disposition

Blue authorized Revision 1 verbatim:

> AUTHORIZE REVISION 1: restore the admission threat-boundary statements,
> re-pin the handler, and run one fresh app gate under the same AGR decision
> tree.

The controlling OSS disposition is verbatim:

> P1 hardens the existing owned PTY environment boundary and introduces no new
> subsystem or dependency; the OSS procurement gate does not reopen.

This branch adds no dependency and no subsystem. The disposition is recorded in
the tracked `BLUE-HELM-MASTER-STATUS.md` P1 implementation checkpoint. No live
provider session or paid model request was run.

## Intended invariant

At the sole `pty.spawn` boundary, the standing fenced predicate
`!opts.videoScout && opts.role && FENCED_ROLES.has(opts.role)` selects an
environment constructed from an empty object and Blue's exact Tier 1 Windows
allowlist. Ambient variables outside that list cannot enter a fenced PTY.

Unfenced builder, reviewer, codebase-scout, bare CLI, plain PowerShell, and
Video Scout launches retain the pre-P1 `stripAdmissionEnv(process.env)` base
behavior. Main then layers, in order:

1. `CLAUDE_CODE_SUBPROCESS_ENV_SCRUB=1`;
2. Video Scout's safeStorage `GEMINI_API_KEY`, only for Video Scout;
3. the exact main-issued pane-status enrollment environment.

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

Matching is case-insensitive, source spelling and values are preserved, and a
synthetic case collision resolves deterministically to first insertion. Missing
entries are not invented.

The 72-assertion suite poisons credential, provider, business, admission,
host-tooling, unknown, Tier 2, and pane-status-shaped variables; exercises all
six roles plus Video Scout, bare CLI, and plain shell; proves explicit
pane-status replacement; includes a detector negative control; spawns a real
child; and structurally traces the builder output into the single `pty.spawn`.

Measured Windows fact: Node/Windows synthesized `USERNAME`, `USERDOMAIN`, and
`LOGONSERVER` in the real child even when those names were absent from the map
passed to `spawnSync`. The test proves that the rejected ambient poison values
did not survive; it does not falsely claim Windows invents no entries.

Filtering is dynamically proven; main-process wiring is structurally pinned;
adversarial live/provider behavior remains for the later fence-completion item.

## Re-pinned committed regions

The pins were recomputed from normalized `git show
94a1cbd20fdcf5b388fa3f21ecc1c49cfa4e133b:app/main.js` bytes:

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

- `node app/pty-env.test.js` — **72 passed, 0 failed**
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

## Manual verification

No live/provider adversarial launch was authorized or performed. No app restart
or UI acceptance claim is made. The proof in this branch is pure construction,
real-child inheritance, structural main-process tracing, committed-byte pins,
and the recorded automated gates above.

## Known limitations

- The pure builder is dynamically tested, while the Electron main-process call
  site is structurally pinned rather than exercised through a live PTY launch.
- Windows adds three measured identity defaults to a real child; this branch
  prevents ambient values for those rejected names from surviving but cannot
  prevent the OS from synthesizing its own values.
- Same-user filesystem access remains possible and is outside this environment
  filtering invariant.
- The two Dockview pre-assertion observations require independent AGR
  disposition before merge authorization.

## Recommended Full-class review focus

1. Verify every path into the sole `pty.spawn` uses the builder output and the
   fenced predicate cannot be bypassed by role/video combinations.
2. Inspect the exact Tier 1 allowlist, Windows case behavior, copy ordering, and
   pane-status/key overwrite semantics.
3. Confirm unfenced launches are deep-equal to the pre-P1 environment expression
   and admission keys cannot be reintroduced.
4. Inspect log statements for value/name disclosure and tests for fixture-only
   or source-string false proofs.
5. Decide the two AGR exception candidates from their exact pre-assertion
   signature; do not inherit the builder's characterization as a verdict.
6. Verify the eight-path cap and that this handoff-only tail contains no code.

## Review diff

Pinned artifact:
`.agent-review-codex-p1-fenced-role-env-containment.diff`

Command:

`git diff d64192ba680d932623e5557793a159076e26d8d6...94a1cbd20fdcf5b388fa3f21ecc1c49cfa4e133b --output=.agent-review-codex-p1-fenced-role-env-containment.diff`

Pinned diff byte length: `45504`

Pinned diff SHA-256:
`762e6bed3076e7f52810283ce3cc7a281bcb940e6699c85b6f53eaca7641a1a8`

After merge, reproduce the reviewed delta from the recorded pre-merge main SHA,
not from the then-advanced `main` name.

Reviewer verdict: **PENDING — literal `VERDICT:` line required.**

Reviewer verdict source: Pending independent Full-class review.
