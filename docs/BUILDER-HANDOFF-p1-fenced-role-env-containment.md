# Builder Handoff — P1 Fenced-Role Environment Containment

Branch: `codex/p1-fenced-role-env-containment`

Fork-point SHA: `d64192ba680d932623e5557793a159076e26d8d6`

Pre-merge main SHA: `d64192ba680d932623e5557793a159076e26d8d6`

Reviewed content tip SHA: `4bee857990ae2e5cbf84bee4deb5e7881c71738b`

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

- The `229`-UTF-16-code-unit P1 environment block is exactly the executable statements from
  `const fencedRole = ...` through the closing `});`, normalized to LF with a
  trailing newline and containing zero comment bytes. A comment-only edit
  outside that block cannot move its length or SHA-256. **If it moves, the edit
  exceeded Revision 6 scope and work stops.**
- The `1326`-UTF-16-code-unit fenced-role cwd gate is a different source region. Revision 6
  does not edit it. **If its length or SHA-256 moves, the edit exceeded scope and
  work stops.**
- The `13205`-UTF-16-code-unit full `pty-start` handler includes the inaccurate comment and
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

The independent Revision 6 review did not issue a literal `VERDICT:` line and
did not authorize merge. It independently reproduced the containment property,
all registered scope and artifact identities, the three source-region pins, the
comment-only `main.js` delta, the `3165`-alias corpus on its tested runtime, and
the U+FB01 exclusion. It then identified two load-bearing gaps: the keys emitted
by main and the names removed from ambient inheritance were separate structures
that could drift, and the denylist-only NFKC relation retained every non-ASCII
name it could not collapse. It also found the test oracle duplicated production
folding, the source-pin lengths were mislabeled as bytes although JavaScript
measured UTF-16 code units, and the runtime-dependent corpus count needed a
runtime qualifier.

Blue authorized Revision 7 verbatim:

> AUTHORIZE REVISION 7: restrict unfenced inherited environment names to
> printable ASCII, structurally bind main-issued entries to reservation, reopen
> and re-pin the handler for comment-only accuracy, update admission tripwires
> and pin units, and run fresh gates under the existing AGR decision tree.

Revision 7 changes the prior unfenced invariant deliberately: after admission
keys are removed, only environment entries whose **names** consist entirely of
printable ASCII may survive ambient inheritance. Values are not inspected or
transformed, and this does not add a value-type filter; surviving printable-
ASCII names retain their exact spelling and value, including non-string values
in synthetic inputs. The conservative NFKC relation, its generated corpus, and
its ICU/Unicode-version dependency retire rather than receive another oracle.

Revision 7 has an exact seven-path cap: `app/pty-env.js`,
`app/pty-env.test.js`, `app/launcher-fence-invariant.test.js`,
`app/admission-budget-config.test.js`, comment-only `app/main.js`,
`BLUE-HELM-MASTER-STATUS.md`, and this handoff-only tail. All seven are already
inside the cumulative eight-path cap, so cumulative scope cannot grow. In
particular `app/package.json`, dependencies, lockfiles, renderer/preload code,
provider sessions, merge, and push remain out of scope.

### Revision 7 pre-registered measurements, pins, and stop rules

Before production behavior changes, the real parent `process.env` name set will
be measured against `/^[\x20-\x7E]+$/`, recording names only and never values or
types. Zero rejected names permits the narrow claim that the new name filter is
empirically inert for the tested parent environment. Any nonzero result must be
recorded before implementation; it does not silently inherit the zero-result
claim.

The registered measurement then ran under Node `v24.18.0`: **69 parent names,
0 rejected names, `rejectedNames=[]`**. No value or type was read or emitted.
The first attempted command omitted the regex character-class brackets and
falsely classified all 69 names as rejected; it was identified as malformed,
discarded before implementation, and immediately replaced by the exact
registered printable-ASCII probe above. The valid zero result supports only the
narrow statement that the R7 name filter is inert for this measured parent
environment.

The main-issued environment is built first. The reserved set for each call must
be exactly the union of `Object.keys(mainIssued)`, both
`PANE_STATUS_ENV_KEYS`, and `GEMINI_ENV_KEY` when and only when `videoScout` is
true. The absent-but-owned union terms preserve fail-closed behavior when pane
status is unenrolled or Gemini is absent/invalid. A matrix over Video Scout,
Gemini valid/invalid/absent, and pane-status present/absent/non-string inputs
must prove every emitted main-issued key belongs to that call's reserved set.

The source tripwire in `app/admission-budget-config.test.js` must change from
proving only `stripAdmissionEnv(source)` to proving the composed admission scrub
and printable-ASCII inherited-name boundary. Leaving the old literal as an
incidental refactor survivor is not accepted as evidence.

The source-region length field is a JavaScript string length in UTF-16 code
units; SHA-256 is computed over the region's UTF-8 bytes. Before the authorized
comment-only `main.js` edit:

- the fenced-role cwd gate is `1326` UTF-16 code units /
  `9a1255f1e81e0a9e4e289ab15380707dd6bcc1d410ffd16f44adddb99b16f8c6`
  and **must remain exact**;
- the comment-free P1 environment block is `229` UTF-16 code units /
  `18cf42b434ee922ee61194d9316150c0b766591e063d0b0545f6aebc8d85cb54`
  and **must remain exact**;
- the full `pty-start` handler is `13484` UTF-16 code units /
  `ab6f6cd37752029c52d4a89fb99331a319f8b032a011b297d78d22beeafea161`
  and **must move** because it contains both stale unfenced/NFKC-ordering
  comments. The new pin is admissible only with a dedicated `main.js`-only diff
  from `f4f0814928fbbffa972da7df74a0c81dad31fbb1` proving that every changed
  line is comment-only. Any executable-line delta stops Revision 7.

The `pty-env.test.js` assertion count must fall below Revision 6's `185`: a
large decrease is the registered consequence of deleting per-alias corpus
assertions, not silent coverage loss. Their replacements are: rejection of
non-printable-ASCII ambient names; exact survival of printable-ASCII ambient
names and values; a case-permutation property over every printable-ASCII
reserved name; all eight named platform aliases retained as regressions; the
fenced production ConPTY names-only probe (`added=[]`, `missing=[]`); and the
libuv identity-backfill contrast. The duplicate-order probe, U+FB01 accounting,
multi-substitution fixtures, generated corpus, and copied NFKC oracle retire.

After the focused suites and authoritative Pester gate, Revision 7 must run one
fresh app gate under the same one-shot AGR decision tree. No named fork-point or
branch suite may be retried, and every registered app suite must be attempted
exactly once through the established prefix/suffix accounting.

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
Video Scout launches begin with `stripAdmissionEnv(process.env)` and then retain
only ambient entries whose **names** match printable ASCII. This deliberately
retires the inherited “exact pre-P1 base behavior” claim. Values under surviving
names are copied exactly without inspection, transformation, or a type filter.

`buildMainIssuedEnv` constructs explicit entries first. The reserved set is the
exact union of `Object.keys(mainIssued)`, both pane-status transport names, and
`GEMINI_API_KEY` for Video Scout. The absent-but-owned terms prevent ambient
fallback when pane-status enrollment or a valid safeStorage Gemini key is
missing. Every printable-ASCII ambient spelling that compares equal under
ASCII case folding is removed before the main-issued map is spread:

1. `CLAUDE_CODE_SUBPROCESS_ENV_SCRUB=1`;
2. Video Scout's safeStorage `GEMINI_API_KEY`, only for Video Scout;
3. at most the two exact pane-status transport names, only when their values are
   strings.

This is construction order, not a universal `Object.keys` enumeration claim:
integer-like ambient names enumerate first under JavaScript rules. Containment
does not depend on JavaScript, node-pty, ConPTY, or Windows choosing a winner
between duplicate spellings because no main-owned ASCII-case duplicate survives
the ambient filter and no non-ASCII ambient name survives at all.

That correction is reserved-key-only. Unrelated unfenced ambient duplicates
such as `Path`/`PATH` remain untouched because globally choosing a winner could
change launch behavior. Non-Video-Scout unfenced panes deliberately retain
printable-ASCII ambient `GEMINI_API_KEY` residue in any casing; this branch does
not claim to contain Gemini outside Video Scout or fenced roles.

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

Revision 7 has an exact seven-path cap: `app/pty-env.js`,
`app/pty-env.test.js`, `app/launcher-fence-invariant.test.js`,
`app/admission-budget-config.test.js`, comment-only `app/main.js`,
`BLUE-HELM-MASTER-STATUS.md`, and this handoff-only tail. Its content commit
changes exactly the first six; the final tail changes only this handoff. Every
R7 path is already in the cumulative list above, so the cumulative branch
remains exactly eight paths and `app/package.json` remains untouched in R7.

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

The 156-assertion suite poisons credential, provider, business, admission,
host-tooling, unknown, Tier 2, and pane-status-shaped variables; exercises all
six roles plus Video Scout, bare CLI, and plain shell; proves explicit
pane-status filtering, printable-ASCII inherited-name filtering, and reserved-
name collision removal; proves
`process.env` is byte-identical before and after builder use; includes a
detector negative control and names-only production ConPTY measurement; and
structurally traces the builder output into the single `pty.spawn`.

Revision 5 introduced an NFKC/lower/upper relation and Revision 6 generated
`3165` single-substitution aliases on its tested Node/ICU/Unicode runtime. R7
retires that entire relation rather than adding another matching oracle. The
production helper and test contain no `.normalize('NFKC')`, generated Unicode
corpus, U+FB01 membership accounting, multi-substitution fixture, or duplicate-
order probe. All eight previously named Unicode code points remain explicit
regressions and are absent for the single provable reason that their names are
not printable ASCII.

Printable-ASCII names retain exact spelling, ordering, and values. Tests prove
that a Unicode path value survives exactly and a synthetic object value retains
identity, while non-ASCII and control-containing **names** are absent. A
deterministic case-permutation property exercises every reserved canonical name.
A null-prototype intermediate still preserves an own printable-ASCII
`__proto__` ambient key without prototype mutation, then returns a plain object.

`buildMainIssuedEnv` returns the emitted map and the exact reserved union. A
40-call matrix covers `2` Video Scout states × `5` Gemini states × `4` pane-
status states and verifies that every emitted key is reserved, pane-status names
are reserved even without string values, and Video Scout's Gemini name is
reserved even without a valid key. `buildPtyEnv` spreads this main-issued map
before the filtered ambient object, but correctness no longer rests on any
duplicate-resolution or key-order behavior.

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
the forced scrub, Video Scout key, `PATH`, or add an extra status entry. Strict
printable-ASCII folding is now the complete unfenced inherited-name boundary;
the Revision 5 conservative Unicode fallback is removed. Both fenced and
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

The numeric region length is JavaScript `String.length` after LF normalization:
UTF-16 code units, not bytes. SHA-256 is computed over UTF-8 bytes. Before the
R7 pin changed, the old invariant was run unchanged and produced the exact
pre-registered outcome: the `1326` gate and `229` block passed; only the handler
failed at `13566 !== 13484` plus its changed hash.

- fenced-role cwd gate, unchanged: `1326` UTF-16 code units, SHA-256
  `9a1255f1e81e0a9e4e289ab15380707dd6bcc1d410ffd16f44adddb99b16f8c6`
- P1 environment block, unchanged: `229` UTF-16 code units, SHA-256
  `18cf42b434ee922ee61194d9316150c0b766591e063d0b0545f6aebc8d85cb54`
- Revision 7 `pty-start` handler: `13566` UTF-16 code units, SHA-256
  `da784a2e5c6be38e4daecc0e7fdfaf1f404aacfa5aac2cd01c8f6c2e2235fad9`

As predicted, the separate `1326` gate and comment-free `229` executable block
remain byte-identical. Only the wider handler moved because it contains the
corrected comments. The old R6 `13484` /
`ab6f6cd37752029c52d4a89fb99331a319f8b032a011b297d78d22beeafea161`
pin is retained in launcher history. The dedicated R7 `main.js`-only artifact
from `f4f0814` proves the source delta is comment-only: an independent scan
counted exactly `11` added/removed lines and `0` non-comment changed lines.

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

Fresh Revision 7 focused Node gates:

- `node app/pty-env.test.js` — **156 passed, 0 failed, 0 skipped**
- `node app/launcher-fence-invariant.test.js` — **26 passed, 0 failed**
- `node app/admission-budget-config.test.js` — **87 passed, 0 failed**

The assertion count fell below `185` exactly as pre-registered because the
generated corpus and duplicate-order measurement retired. The replacement name-
boundary, case-permutation, eight-alias regression, reservation-matrix, fenced
ConPTY, and libuv contrast checks are all green.

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

The launcher invariant independently re-proved the unchanged `229`-code-unit
environment-block pin and `13205`-code-unit handler pin at that reviewed content
tip; R7 corrects the formerly inaccurate byte labels.

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

Revision 7 reran that authoritative gate outside the restricted filesystem
sandbox:

- `powershell.exe -NoProfile -ExecutionPolicy Bypass -File
  scripts/run-pester.ps1` — **955 passed, 0 failed, 0 skipped (of 955)**, exit
  `0`, in `136.31s`.

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

### Revision 7 fork-point control and fresh branch gate

Revision 7 created a new exact-fork materialization of tracked `app/` at
`d64192ba680d932623e5557793a159076e26d8d6`, linked only to the branch's
already-installed dependencies. Its bootstrap file again measured SHA-256
`071d3dd18f37e990862c92d836d947d2d28535436fa9428e867948e0dc1f5e67`.
Each control ran once:

- `node dockview-bootstrap.test.js` — exit `1`; the two-report parser failure at
  position `259`, `render-process-gone` / `loadFile ERR_FAILED`, and GPU exit
  `-1073741515` (`0xC0000135`);
- `node dockview-app-integration.test.js` — exit `1`; no report, production
  `loadFile ERR_FAILED`, and GPU exit `-1073741515` (`0xC0000135`).

The fresh branch `npm.cmd test` invocation ran once, confirmed all 88 registered
suites, and stopped at bootstrap before product assertions with the exact fork-
point-matched signature. The next unexecuted integration suite ran once and
stopped before assertions with its matching signature. The registered suffix
after integration contained exactly 72 suites, ran once from
`renderer/dockview-fit-policy.test.js` through the final suite, and exited `0`;
the R7 `pty-env.test.js` was green at **156/0/0** and the updated admission
configuration suite at **87/0**.

All **88 registered suites were attempted exactly once**: **86 green**, only
the two named pre-assertion AGR candidates, no retry, omission, other failure,
or product assertion. The exact-fork directory and its dependency junction were
then removed after an explicit parent/leaf containment check. This packet routes
the evidence to independent review and does not grant its own AGR exception or
merge authorization.

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
- R7 deliberately drops every inherited name outside printable ASCII. The valid
  pre-flight measurement found zero such names among 69 names in one parent
  environment; that is not a universal inventory of every launch environment.
  Unrelated printable-ASCII ambient duplicates such as `Path`/`PATH` remain a
  separate known item because P1 does not choose a global winner.
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
  exit `0`; Revision 7's fresh gate is recorded separately below.
- A late per-case ConPTY unavailability still returns one aggregate SKIP and
  discards earlier successful production-probe evidence from that invocation.
  This is fail-safe but less informative than per-case partial accounting.
- The unfenced path intentionally preserves non-string synthetic values under
  surviving printable-ASCII names. P1 does not type-normalize arbitrary
  unfenced environment values.

## Recommended Full-class review focus

Focused Full-class re-review is requested for Revision 7 production behavior,
artifact coverage, and AGR evidence:

1. Verify unfenced inheritance keeps only names matching printable ASCII while
   preserving values and value types exactly; confirm fenced Tier 1 behavior is
   unchanged.
2. Verify `buildMainIssuedEnv` derives reservation as emitted keys plus both
   absent-but-owned pane-status names and Video Scout's conditional Gemini name.
   Reproduce the 40-call drift matrix and missing/invalid Gemini behavior.
3. Confirm the production and test sources contain no NFKC relation or copied
   oracle. Verify the case-permutation property, eight named Unicode regressions,
   printable/non-printable name controls, fenced ConPTY `added=[]` /
   `missing=[]`, and libuv identity-backfill contrast.
4. Verify the pre-flight command used `/^[\x20-\x7E]+$/`, recorded names only,
   and produced 69 total / 0 rejected after the malformed first attempt was
   disclosed and discarded.
5. Verify pin units: `1326` and `229` are exact UTF-16 code-unit lengths with
   unchanged hashes; only the handler moved to `13566` / `da784a2…`. Confirm the
   dedicated `main.js`-only diff from `f4f0814` changes comment lines only.
6. Verify the admission source tripwire proves both admission scrubbing and the
   printable-ASCII inherited-name boundary, with no Unicode normalization.
7. Artifact coverage: use the cumulative, focused R7, complete `main.js`, and
   R7 `main.js`-only artifacts; use the external tail artifact for this handoff.
8. AGR: compare each once-only Revision 7 fork-point and branch observation
   against the supplied rule. Confirm the registered suffix exited `0` and no
   retry or omission occurred.
9. Verify the cumulative eight-path cap and Revision 7 seven-path cap, including
   a comment-only `main.js` delta and untouched `app/package.json`.

## Review diff

Pinned cumulative artifact:
`.agent-review-codex-p1-fenced-role-env-containment.diff`

Command:

`git diff --output=.agent-review-codex-p1-fenced-role-env-containment.diff d64192ba680d932623e5557793a159076e26d8d6...4bee857990ae2e5cbf84bee4deb5e7881c71738b`

Pinned cumulative diff byte length: `141194`

Pinned diff SHA-256:
`71fe72a4d6d73d02193998476c49a4ebcaf09c8732c0c37fbc749c53c4320aee`

Pinned focused Revision 7 artifact:
`.agent-review-codex-p1-fenced-role-env-containment-r7.diff`

Command:

`git diff --output=.agent-review-codex-p1-fenced-role-env-containment-r7.diff 5ea586939c500d5b920d02e57847be1d8e4fc159...4bee857990ae2e5cbf84bee4deb5e7881c71738b`

Focused diff byte length: `51359`

Focused diff SHA-256:
`8cdf44b98ac7f170b1ad84332bf19b634740c26fbd216cb251ff6b3a489c02d4`

Pinned complete `main.js` source artifact:
`.agent-review-codex-p1-fenced-role-env-containment-main-source.diff`

Command:

`git diff --output=.agent-review-codex-p1-fenced-role-env-containment-main-source.diff 4b825dc642cb6eb9a060e54bf8d69288fbee4904 4bee857990ae2e5cbf84bee4deb5e7881c71738b -- app/main.js`

Main-source artifact byte length: `89924`

Main-source artifact SHA-256:
`1b32607d5b18df5f1d35624b6394d5451b526d7b9137ee5dc10f50d0ee9c2ca2`

Pinned Revision 7 `main.js`-only comment artifact:
`.agent-review-codex-p1-fenced-role-env-containment-r7-main-comment.diff`

Command:

`git diff --output=.agent-review-codex-p1-fenced-role-env-containment-r7-main-comment.diff f4f0814928fbbffa972da7df74a0c81dad31fbb1...4bee857990ae2e5cbf84bee4deb5e7881c71738b -- app/main.js`

Main-comment artifact byte length: `2029`

Main-comment artifact SHA-256:
`b854848815ac33021b7f74a093721efd979fffd6fc7a41f0ddf81129791ad240`

The R7 main-comment artifact contains `11` added/removed lines and `0` changed
lines whose content after the diff marker is not a `//` comment.

All four content artifacts were regenerated to explicitly named twins,
compared byte-for-byte, and the identical twins removed. All are gitignored by
`.gitignore:33`.

After the handoff-only tail commit, the external review packet also includes
`.agent-review-codex-p1-fenced-role-env-containment-r7-tail.diff`, generated
from content tip `4bee857` to the final tail tip. Its byte count and SHA-256 are
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
`ccd7de8`.

The Revision 6 review of content tip `f4f0814` with handoff tail `5ea5869` did
not issue a literal `VERDICT:` line and explicitly did not authorize merge. Its
F1/F2/F3/F4/F5 findings are the authority for Revision 7. Revision 7 content tip
`4bee857` responds to them but has no PASS. Independent focused Full-class re-
review is pending. No merge or push is authorized.

Reviewer verdict sources:

- `C:\Users\levij\Downloads\REVIEW-full-class-p1-fenced-role-env-containment.md`
- `C:\Users\levij\.codex\attachments\8f904ddb-c7ac-45a2-8997-a2521d7bd5c2\pasted-text.txt`
- `C:\Users\levij\.codex\attachments\fbc8725d-cd13-412b-819e-294355e9e268\pasted-text.txt`
- `C:\Users\levij\.codex\attachments\448ce087-db2c-420a-97d5-ed7a3a40fd65\pasted-text.txt`
- `C:\Users\levij\.codex\attachments\955d466f-312e-4055-8ec7-5868206186ea\pasted-text.txt`
