# Builder Handoff — P1 Fenced-Role Environment Containment

Branch: `codex/p1-fenced-role-env-containment`

Fork-point SHA: `d64192ba680d932623e5557793a159076e26d8d6`

Pre-merge main SHA: `d64192ba680d932623e5557793a159076e26d8d6`

Reviewed content tip SHA: `f4f0814928fbbffa972da7df74a0c81dad31fbb1`

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

The independent Revision 4 review retained this controlling verdict verbatim:

> VERDICT: FAIL — CHANGES REQUESTED — NOT AUTHORIZED FOR MERGE

It found three related proof gaps: the JavaScript fold was not Windows' measured
equivalence relation, Kelvin/capital-sharp-s were missed by the implementation,
and the negative control plus ASCII-only oracle could pass while an unenumerated
reserved alias survived. Blue authorized the bounded Revision 5 correction
verbatim:

> authorize revision 5

Revision 5 was limited to its then-proposed closed conservative reserved-family
invariant, a generated Unicode single-substitution corpus, direct ConPTY lookup
measurements, `__proto__`-safe copying, main-issued-first construction, comments,
the same source pins and AGR tree, and an updated artifact packet. It
has the same exact four-path cap as Revisions 3 and 4 and authorizes no
`main.js`, package, dependency, lockfile, provider-session, merge, or push
change.

The independent Revision 5 review retained this controlling verdict verbatim:

> VERDICT: FAIL — CHANGES REQUESTED — NOT AUTHORIZED FOR MERGE

It confirmed the containment property and found four accuracy blockers: the
single-substitution corpus omitted underscore-folding scalars; U+FB01 produced
no reserved alias without explicit accounting; the pinned `main.js` comment
described the opposite construction order and overstated pane-status copying;
and the main-issued-first defense-in-depth rationale was not measured at the
production spawn boundary. Blue authorized the bounded Revision 6 correction
verbatim:

> AUTHORIZE REVISION 6.

Revision 6 is test, assertion, comment, pin, and evidence work only. It permits
no production-logic change. Its exact six paths are `app/pty-env.js`,
`app/pty-env.test.js`, `app/main.js`,
`app/launcher-fence-invariant.test.js`, `BLUE-HELM-MASTER-STATUS.md`, and this
handoff-only tail. All six are already members of the cumulative eight-path cap;
the cumulative cap therefore cannot grow. Revision 6 deliberately reopens
`main.js` after three four-path revisions, but only to correct the two inaccurate
comments inside the pinned handler.

### Revision 6 pre-registered pin predictions and B4 stop rule

These predictions were written before the Revision 6 `main.js` edit and before
any pin was remeasured:

- The `229`-byte P1 environment block is exactly the executable statements from
  `const fencedRole = ...` through the closing `});`, normalized to LF with a
  trailing newline and containing zero comment bytes. A comment-only edit
  outside that block cannot move its length or SHA-256. **If it moves, the edit
  exceeded Revision 6 scope and work stops.**
- The `1326`-byte fenced-role cwd gate is a different source region. Revision 6
  does not edit it. **If its length or SHA-256 moves, the edit exceeded scope and
  work stops.**
- The `13205`-byte full `pty-start` handler includes the inaccurate comment and
  therefore must move. Its replacement pin is accepted only alongside a pinned
  `main.js`-only diff from `4372f9f` proving that the handler delta is comment-
  only; a passing self-updated tripwire is not treated as independent proof.

Before final comment wording, the installed node-pty/ConPTY path will receive a
canonical name and ASCII-case alias in both insertion orders and report both the
canonical lookup value and the full relevant child name list. The decision is
pre-registered: local first-wins evidence permits retaining the current
construction with narrowly local wording; last-wins means the current direction
is wrong and Revision 6 stops because reversing it is a production-logic change;
collapse before both names arrive retires the defense-in-depth rationale; any
ambiguous outcome also stops for direction.

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
removed. A non-ASCII spelling is also removed when NFKC normalization followed
by lowercase then uppercase produces an exact printable-ASCII reserved name.
This is a deliberate conservative denylist superset, not a claim that JavaScript
reproduces Windows NLS comparison. Video Scout additionally reserves
`GEMINI_API_KEY`; if the main-issued key is not a non-empty string, the name
remains absent rather than falling back to ambient residue. The builder's object
literal constructs these explicit string entries before spreading the filtered
ambient object:

1. `CLAUDE_CODE_SUBPROCESS_ENV_SCRUB=1`;
2. Video Scout's safeStorage `GEMINI_API_KEY`, only for Video Scout;
3. at most the two exact pane-status transport names, only when their values are
   strings.

This is construction order, not a universal `Object.keys` enumeration claim:
integer-like ambient names enumerate first under JavaScript rules. The local
node-pty/ConPTY duplicate measurement is recorded separately, and containment
does not depend on either ordering behavior.

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

Revision 5 has the same exact four-path cap: `app/pty-env.js`,
`app/pty-env.test.js`, `BLUE-HELM-MASTER-STATUS.md`, and this handoff-only tail.
Its content commit changes exactly the first three; the final tail changes only
this handoff. The cumulative branch remains exactly the same eight paths.

Revision 6 has an exact six-path cap: `app/pty-env.js`,
`app/pty-env.test.js`, `app/main.js`,
`app/launcher-fence-invariant.test.js`, `BLUE-HELM-MASTER-STATUS.md`, and this
handoff-only tail. Its content commit changes exactly the first five; the final
tail changes only this handoff. Every R6 path is already in the cumulative list
above, so the cumulative branch remains exactly eight paths. `main.js` is
reopened after three revisions that excluded it, but its R6 delta is comment-
only and separately pinned.

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

The 185-assertion suite poisons credential, provider, business, admission,
host-tooling, unknown, Tier 2, and pane-status-shaped variables; exercises all
six roles plus Video Scout, bare CLI, and plain shell; proves explicit
pane-status filtering and reserved-name collision removal; proves
`process.env` is byte-identical before and after builder use; includes a
detector negative control and names-only production ConPTY measurement; and
structurally traces the builder output into the single `pty.spawn`.

Revision 4's named aliases are retained as history. Revision 5 introduced a
generated Unicode single-substitution corpus but incorrectly filtered candidate
folds to letters and described that bounded corpus as complete. Revision 6
removes the character-class pre-filter entirely: for every Unicode scalar, the
test independently applies NFKC/lower/upper and asks each frozen canonical name
directly whether the entire folded string is a substring. The resulting corpus
contains exactly `3165` aliases on the tested runtime, including scalars that
fold to underscore. Its boundary is explicit: it is exhaustive for one-scalar
substitutions, not combinatorial multi-substitutions. Whole-string production
folding covers composition, proven by `GEMıNı_API_KEY` and
`BLUE_HELM_PANE_ﬅATUſ_PIPE` controls. One constructed environment contains the
whole generated corpus plus both controls, and the closed oracle requires each
reserved family to be absent or represented exactly once in canonical ASCII
spelling.

The expected reviewer-code-point representative set is derived from the same
canonical-substring rule and compared as an exact set. U+FB01 folds to `FI` and
produces no reserved alias because none of the current canonical names contains
`FI`; if a future name gains that substring, the derived set changes without a
magic count. `ſAFE_HARBOR` still traverses the ASCII-collapse path but is non-
reserved and remains present.

The strict ASCII fold remains the only allowlist mechanism. The conservative
fallback is reachable only from reserved-name omission and can remove but never
admit. A null-prototype intermediate preserves an own `__proto__` ambient key
without invoking a prototype setter, and the helper still returns a plain
object. The code constructs canonical main-issued values before spreading the
filtered ambient object. The installed node-pty/ConPTY path locally measured
first-inserted lookup when both ASCII-case variants genuinely reached the child
in both orders. That is local evidence only, not a Windows invariant.
Correctness does not depend on ordering because the whole conservative reserved
family is removed first; integer-like ambient names follow JavaScript's own
enumeration rules and may enumerate before the canonical strings.

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
only folding governs admission, while the Revision 5 conservative Unicode
fallback is denylist-only and closes the documented reserved-name alias family.
Both fenced and
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

The Revision 6 handoff pre-registered the pin outcomes before `main.js` changed.
The pins were then rechecked from normalized `git show
f4f0814928fbbffa972da7df74a0c81dad31fbb1:app/main.js` bytes:

- fenced-role cwd gate, unchanged: length `1326`, SHA-256
  `9a1255f1e81e0a9e4e289ab15380707dd6bcc1d410ffd16f44adddb99b16f8c6`
- P1 environment block: length `229`, SHA-256
  `18cf42b434ee922ee61194d9316150c0b766591e063d0b0545f6aebc8d85cb54`
- Revision 6 `pty-start` handler: length `13484`, SHA-256
  `ab6f6cd37752029c52d4a89fb99331a319f8b032a011b297d78d22beeafea161`

As predicted, the separate `1326` gate and comment-free `229` executable block
remain byte-identical. Only the wider handler moved because it contains the
corrected comment. The old `13205` /
`14d3ae60ed6ea32e4231fdef7d0979e160207b0580466f53178a4b9f86098486`
pin is retained in launcher history. The dedicated R6 `main.js`-only artifact
from `4372f9f` proves the source delta is comment-only: an independent scan of
its added/removed lines counted `11` changed lines and `0` non-comment changed
lines.

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

Fresh Revision 5 focused Node gates:

- `node app/pty-env.test.js` — **176 passed, 0 failed, 0 skipped**
- `node app/launcher-fence-invariant.test.js` — **26 passed, 0 failed**
- `node app/admission-budget-config.test.js` — **86 passed, 0 failed**

Fresh Revision 6 focused Node gates:

- `node app/pty-env.test.js` — **185 passed, 0 failed, 0 skipped**
- `node app/launcher-fence-invariant.test.js` — **26 passed, 0 failed**
- `node app/admission-budget-config.test.js` — **86 passed, 0 failed**

The Revision 5 production probe used the installed
`@lydell/node-pty`/ConPTY path for each reviewer-named platform case. The ASCII
lowercase positive control entered under its exact spelling and resolved under
the canonical spelling. Every Unicode case entered under its exact alias, which
prevents an absent-entry false proof; on this VM, none of the eight aliases
resolved through the canonical reserved spelling. The observed canonical
resolution set was exactly `[]`. That is a direct machine measurement, not a
general Windows claim. Every measured alias is nevertheless contained by the
conservative removal oracle and absent from the built environment.

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

Revision 5 reran that authoritative gate outside the restricted filesystem
sandbox:

- `powershell.exe -NoProfile -ExecutionPolicy Bypass -File
  scripts/run-pester.ps1` — **955 passed, 0 failed, 0 skipped (of 955)**, exit
  `0`, in `136.64s`.

Revision 6 reran that authoritative gate outside the restricted filesystem
sandbox:

- `powershell.exe -NoProfile -ExecutionPolicy Bypass -File
  scripts/run-pester.ps1` — **955 passed, 0 failed, 0 skipped (of 955)**, exit
  `0`, in `136.58s`.

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

### Revision 5 fork-point control and fresh branch gate

Revision 5 repeated the same narrow tree from a new exact-fork materialization
of tracked `app/` at `d64192ba680d932623e5557793a159076e26d8d6`, linked only
to the already-installed branch dependencies. The temporary fork's bootstrap
file SHA-256 was
`071d3dd18f37e990862c92d836d947d2d28535436fa9428e867948e0dc1f5e67`.
Each control ran once:

- `node dockview-bootstrap.test.js` — exit `1`; the two-report JSON parser
  failure at position `259`, `render-process-gone` / `loadFile ERR_FAILED`, and
  GPU exit `-1073741515` (`0xC0000135`);
- `node dockview-app-integration.test.js` — exit `1`; no parseable report or
  output, production `loadFile ERR_FAILED`, and the same GPU exit
  `-1073741515` (`0xC0000135`).

The fresh branch `npm.cmd test` invocation then ran once. It confirmed all 88
registered suites and stopped at bootstrap before product assertions with the
fork-point-matched signature. The next unexecuted suite,
`dockview-app-integration.test.js`, ran once and stopped before product
assertions with its fork-point-matched `ERR_FAILED` / GPU `0xC0000135`
signature. The remaining registered suffix from
`renderer/dockview-fit-policy.test.js` through the final suite ran once; its
session was retained through termination and exited `0`. The Revision 5
`pty-env.test.js` executed inside that suffix and was green at **176/0/0**.

All **88 registered suites were attempted exactly once**: **86 green**, only
the two named pre-assertion AGR candidates, no retry, omission, other failure,
or product assertion. Unlike Revision 4, Revision 5 retains the suffix's final
exit code. This packet routes the exact evidence to independent review; it does
not grant its own exception or merge authorization.

### Revision 6 fork-point control and fresh branch gate

Revision 6 repeated the same narrow tree from a new exact-fork materialization
of tracked `app/` at `d64192ba680d932623e5557793a159076e26d8d6`, linked only
to the already-installed branch dependencies. The temporary fork's bootstrap
file again measured SHA-256
`071d3dd18f37e990862c92d836d947d2d28535436fa9428e867948e0dc1f5e67`.
Each control ran once:

- `node dockview-bootstrap.test.js` — exit `1`; the two-report parser failure at
  position `259`, `render-process-gone` / `loadFile ERR_FAILED`, and GPU exit
  `-1073741515` (`0xC0000135`);
- `node dockview-app-integration.test.js` — exit `1`; no report, production
  `loadFile ERR_FAILED`, and GPU exit `-1073741515` (`0xC0000135`).

The fresh branch `npm.cmd test` invocation ran once, confirmed all 88 registered
suites, and stopped at bootstrap before product assertions with the exact
fork-point-matched signature. The next unexecuted integration suite ran once and
stopped before assertions with its fork-point-matched signature. The registered
suffix from `renderer/dockview-fit-policy.test.js` through the final suite ran
once and exited `0`; the Revision 6 `pty-env.test.js` was green at **185/0/0**.

All **88 registered suites were attempted exactly once**: **86 green**, only
the two named pre-assertion AGR candidates, no retry, omission, other failure,
or product assertion. This packet routes the evidence to independent review and
does not grant its own AGR exception or merge authorization.

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
  environment block is not generalized from one VM. The JavaScript conservative
  fold is explicitly not claimed to reproduce Windows NLS comparison. The
  direct ConPTY result — both names arrived and canonical lookup was first-wins
  in both insertion orders — is local platform evidence only. Revision 6 guarantees
  one canonical entry for each reserved/main-issued family under the documented
  conservative superset; unrelated unfenced ambient duplicates remain a
  separate known item.
- Non-Video-Scout unfenced panes still inherit ambient Gemini residue. P1 does
  not present reserved Video Scout injection as global Gemini containment.
- `pty-start` lacks a trusted-sender gate. Classification integrity is outside
  the narrowed P1 invariant and remains explicit fence-completion work.
- Same-user filesystem access remains possible and is outside this environment
  filtering invariant.
- The two Dockview pre-assertion observations require independent AGR
  disposition before merge authorization.
- Revision 4's suffix exit-code gap remains historical evidence. Revisions 5 and
  6 each ran a fresh gate under the same authorized tree and retained suffix
  exit `0`.
- A late per-case ConPTY unavailability still returns one aggregate SKIP and
  discards earlier successful production-probe evidence from that invocation.
  This is fail-safe but less informative than per-case partial accounting.
- The unfenced parity path intentionally preserves pre-P1 non-string ambient
  values. P1 does not type-normalize arbitrary unfenced environment values.

## Recommended Full-class review focus

Focused Full-class re-review is requested for the Revision 5 blockers, artifact
coverage, and AGR evidence:

1. Verify corpus eligibility is derived solely from folded-string membership in
   the canonical names, includes underscore folds, and is honestly bounded to
   exhaustive single-scalar substitution. Verify both composed controls exercise
   whole-string folding and leave only canonical reserved families.
2. Verify the reviewer-code-point expected set is derived by the same rule and
   compared for exact equality. Confirm U+FB01's current exclusion follows from
   the absence of `FI`, without a hard-coded representative count.
3. Verify the duplicate-bearing ConPTY probe records the full relevant name list
   and exactly one canonical lookup in both orders. Treat first-wins as local
   evidence only; confirm last-wins or ambiguous would fail.
4. Verify the integer-like ambient key disproves the old universal enumeration
   assertion and that no current text presents construction order as the
   containment invariant.
5. Verify the pre-registered pin prediction: `1326` and `229` are exact, only the
   handler moved to `13484` / `ab6f6cd3…`, and the dedicated `main.js`-only diff
   from `4372f9f` contains comment changes only, correcting both inaccuracies.
6. Verify the derived parent timeout and exactly-one marker checks close N1/N3;
   confirm partial-result accounting and unfenced value typing are recorded as
   limitations rather than new claims.
7. Artifact coverage: use the cumulative, focused R6, complete `main.js`, and
   R6 `main.js`-only artifacts; use the external tail artifact for this handoff.
8. AGR: compare each once-only Revision 6 fork-point and branch observation
   against the supplied rule. Confirm the suffix from suite 3 through 88 exited
   `0` and that no retry or omission occurred.
9. Verify the cumulative eight-path cap and the Revision 6 six-path cap.

## Review diff

Pinned cumulative artifact:
`.agent-review-codex-p1-fenced-role-env-containment.diff`

Command:

`git diff --output=.agent-review-codex-p1-fenced-role-env-containment.diff d64192ba680d932623e5557793a159076e26d8d6...f4f0814928fbbffa972da7df74a0c81dad31fbb1`

Pinned cumulative diff byte length: `136380`

Pinned diff SHA-256:
`cd9075f0ec5a6eae8c0390662b97e99e648352f8d252f7a6f17bb3b32203a1b0`

Pinned focused Revision 6 artifact:
`.agent-review-codex-p1-fenced-role-env-containment-r6.diff`

Command:

`git diff --output=.agent-review-codex-p1-fenced-role-env-containment-r6.diff ccd7de8be56ed46ed43078c26b031122ff2b57f2...f4f0814928fbbffa972da7df74a0c81dad31fbb1`

Focused diff byte length: `26358`

Focused diff SHA-256:
`55fe539f06354f93c4a5896f5aac30ebf4962576eb36b5cd94e85fbd078a5099`

Pinned complete `main.js` source artifact:
`.agent-review-codex-p1-fenced-role-env-containment-main-source.diff`

Command:

`git diff --output=.agent-review-codex-p1-fenced-role-env-containment-main-source.diff 4b825dc642cb6eb9a060e54bf8d69288fbee4904 f4f0814928fbbffa972da7df74a0c81dad31fbb1 -- app/main.js`

Main-source artifact byte length: `89841`

Main-source artifact SHA-256:
`72c0df60a87630d3351e6cfbfae10b1e3feb5f7c1da8957216048d0163d8d187`

Pinned Revision 6 `main.js`-only comment artifact:
`.agent-review-codex-p1-fenced-role-env-containment-r6-main-comment.diff`

Command:

`git diff --output=.agent-review-codex-p1-fenced-role-env-containment-r6-main-comment.diff 4372f9fa13734ada1674a265caba1725deae21fd...f4f0814928fbbffa972da7df74a0c81dad31fbb1 -- app/main.js`

Main-comment artifact byte length: `1739`

Main-comment artifact SHA-256:
`fb52d09b9c86c93a6007235eae797602134e1e189fd513a5c537c7d547ff2887`

All four content artifacts were regenerated to explicitly named twins,
compared byte-for-byte, and the identical twins removed. All are gitignored by
`.gitignore:33`.

After the handoff-only tail commit, the external review packet also includes
`.agent-review-codex-p1-fenced-role-env-containment-r6-tail.diff`, generated
from content tip `f4f0814` to the final tail tip. Its byte count and SHA-256 are
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
`29f8624`.

Round-4 focused reviewer verdict, retained verbatim:

`VERDICT: FAIL — CHANGES REQUESTED — NOT AUTHORIZED FOR MERGE`

That verdict applies to Revision 4 content tip `4372f9f` with handoff tail
`4cdb01b`.

Round-5 focused reviewer verdict, retained verbatim:

`VERDICT: FAIL — CHANGES REQUESTED — NOT AUTHORIZED FOR MERGE`

That verdict applies to Revision 5 content tip `7297b76` with handoff tail
`ccd7de8`. Revision 6 reviewed-content candidate `f4f0814` responds to all four
accuracy blockers and accepted N1/N3 hardening, but has no PASS. Independent
focused Full-class re-review is pending. No merge or push is authorized.

Reviewer verdict sources:

- `C:\Users\levij\Downloads\REVIEW-full-class-p1-fenced-role-env-containment.md`
- `C:\Users\levij\.codex\attachments\8f904ddb-c7ac-45a2-8997-a2521d7bd5c2\pasted-text.txt`
- `C:\Users\levij\.codex\attachments\fbc8725d-cd13-412b-819e-294355e9e268\pasted-text.txt`
