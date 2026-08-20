# Builder Handoff — Pester-Side Exact-Token Reachability Match

Branch: `fix/pester-reachability-exact-match`
Fork point / reviewed base: `8c6bfce6c36bbe0adda8dda46f6bab728e6ae38f`
Implementation / code tip (unchanged): `cf6c1a8bf0c7844509d549abd8b9395aed900d8c`

## Independent review outcome — retained verbatim

The independent review of `8c6bfce...bc4fa45` returned:

```
VERDICT: FAIL
CLASS: Standard
INDEPENDENCE: CONFIRMED
```

Source: independent Standard-class review of the range
`8c6bfce6c36bbe0adda8dda46f6bab728e6ae38f...bc4fa4592f2cfd27e4e5f218d32044bcd81ef13d`
(the prior branch tip). The corrections that review required are applied in this
revision and enumerated below. **No corrective PASS is claimed by this document.**
This revision is submitted for a fresh independent Standard review; the FAIL above
stands as the current recorded verdict until an independent reviewer supersedes it.

## Branch topology and the pre-merge-main record

- **Fork point / reviewed base:** `8c6bfce6c36bbe0adda8dda46f6bab728e6ae38f`. This is
  also `merge-base(main, branchTip)`, verified against both local main and
  `origin/main`.
- **Current local `main`:** `34af8bf340eaa518bca3b9aa7109025f47b8992d` — the
  test-runner-wiring audit merge. **This SHA is the current pre-merge snapshot** and
  **must be refreshed if `main` advances before merge authorization.**
- **Current `origin/main`:** `8c6bfce6c36bbe0adda8dda46f6bab728e6ae38f`.

**Local `main` does NOT equal `origin/main`.** The audit merge (`34af8bf`) is local
and **unpushed**; the earlier revision of this handoff wrongly recorded `8c6bfce` as
both fork point and pre-merge main, and that stale claim is withdrawn. `8c6bfce`
remains correct as fork point and reviewed base only.

The audit merge touches only `docs/AUDIT-test-runner-wiring.md` and
`docs/BUILDER-HANDOFF-test-runner-wiring-audit.md` — no file this branch touches, and
no file either gate executes.

## The earlier handoff-tail claim remains WITHDRAWN

A revision before `bc4fa45` claimed commit `7e7cb31` was a merge-gate-valid
documentation-only handoff tail above the code tip `cf6c1a8`. That claim is
**withdrawn**; it is mechanically invalid under `scripts/merge-gate.ps1:503-529` for
two independent, verified reasons:

1. **`scripts/merge-gate.ps1:517`** requires every tail path to be status `M`.
   `git diff --name-status --no-renames cf6c1a8 7e7cb31` yields
   `A docs/BUILDER-HANDOFF-pester-reachability-exact-match.md` — an ADD.
2. **`scripts/merge-gate.ps1:522-525`** requires the handoff doc to exist as a
   regular `100644` blob at **both** endpoints.
   `git ls-tree cf6c1a8 -- docs/BUILDER-HANDOFF-pester-reachability-exact-match.md`
   is empty.

Root cause is structural: the handoff did not exist at the code tip, so a tail could
only ADD it. **There is no handoff-only tail on this branch.** Every revision of this
document has landed as a content commit, and the current corrective commit is the
branch tip: `reviewedTip == branchTip`. A verdict-only tail may MODIFY this file only
after an independent PASS over the full range.

## What this branch does

Ports the Node-side meta-test's exact-token matching to its Pester-side mirror.
`app/test-reachability.test.js` already tokenizes `app/package.json`'s `"test"`
script on `&&` and requires an exact `node <path>` segment match.
`scripts/test-reachability.Tests.ps1` still used `.Contains()` — a substring test
that catches a REMOVED wiring but not a NEUTERED one, since
`node test-reachability.test.js || exit 0` still contains the filename as a substring
while silently disarming the watchdog it is supposed to verify. This branch replaces
`.Contains()` with tokenize-and-exact-match.

Tier: **Standard-class**, test-tooling only. No runtime code, no dependency, no
production surface.

## Changed-file statistics — code delta vs full reviewed range

These are two different ranges and were previously conflated. Stated precisely:

- **Implementation/code delta, `8c6bfce...cf6c1a8`:** changes **one** tracked file,
  `scripts/test-reachability.Tests.ps1` (+34/−2). Within this range, and only this
  range, no other file in the repository differs from the reviewed base.
- **Full reviewed range, `8c6bfce...<corrective tip>`:** changes **two** tracked
  files — `scripts/test-reachability.Tests.ps1` (the Pester suite) and
  `docs/BUILDER-HANDOFF-pester-reachability-exact-match.md` (this builder handoff).
- **`app/package.json` remains byte-identical to the reviewed base**, SHA-256
  `9622fa0ab2d90dfe80e02fff8ad88c843eeeec0c4d9a585277b3c04da1595462`, confirmed by
  an empty `git diff 8c6bfce HEAD -- app/package.json`.

The unqualified claim "No other file in the repo differs from base" has been removed;
it was true only of the code delta and could be misread as describing the full
reviewed range.

## The code delta

Before:
```powershell
It 'the Node-side meta-test is wired into app/package.json (mutual anti-orphan watchdog)' {
    $pkg = Get-Content -LiteralPath (Join-Path $repoRoot 'app\package.json') -Raw -Encoding UTF8 | ConvertFrom-Json
    $pkg.scripts.test.Contains('test-reachability.test.js') | Should Be $true
}
```

After: tokenizes `$pkg.scripts.test` on `&&`, trims each segment, keeps segments
starting with `node `, strips that prefix, and requires exactly one segment
case-sensitively equal (`-ceq`) to `test-reachability.test.js`. On failure the
message reports the exact-match count, the node-invocation count, and — separately —
every segment that merely *mentions* the filename (`$mentions`, built with `-like`
over `$segments`, independent of `$exact`). See
`scripts/test-reachability.Tests.ps1:62-97`.

## Node/Pester symmetry — precise, not identical

The two sides are **not** the same rule. Both enforce **case-sensitive exact-token
matching** over the `&&`-tokenized `node <path>` segments, but they differ on
duplicates:

- **Pester** (`scripts/test-reachability.Tests.ps1:82-96`) requires **exactly one**
  occurrence — `$exact.Count -eq 1` — and therefore **rejects duplicates**.
- **Node** (`app/test-reachability.test.js:73-79, 112-114`) builds a `Set` and tests
  membership with `wiredPkgPaths.has(...)`. Set construction collapses duplicates, so
  Node **does not reject duplicate identical invocations**.

Verified by execution against a duplicated chain entry (`node test-reachability.test.js`
present twice, `app/package.json` restored byte-identically afterwards):

- Node: `test-reachability: 6 passed, 0 failed`, exit 0 — **accepted** the duplicate.
- Pester: **FAILED** —
  `expected exactly one chain segment equal to 'node test-reachability.test.js'; found 2 exact match(es) among 68 node invocation(s). Segments mentioning the file: [node test-reachability.test.js | node test-reachability.test.js]`

The earlier "same rule, two runners" wording is withdrawn as inaccurate. The Pester
side is strictly stricter on multiplicity.

## Negative controls — procedure and results

Run against the real `app/package.json` (the assertion reads that exact path via
`Join-Path $repoRoot 'app\package.json'`). For each: back up and SHA-256-verify,
mutate in place, run `Invoke-Pester -Path scripts\test-reachability.Tests.ps1`,
restore, re-verify SHA-256, delete the backup, confirm `git status --porcelain` empty.

**a. NEUTERING** — rewritten to `node test-reachability.test.js || exit 0`.
Guard **FAILED** (`Passed: 3 Failed: 1`), naming the segment:
```
expected exactly one chain segment equal to 'node test-reachability.test.js';
found 0 exact match(es) among 67 node invocation(s). Segments mentioning the
file: [node test-reachability.test.js || exit 0]
```
This is the exact case the old `.Contains()` check passed.

**b. REMOVAL** — the whole `node test-reachability.test.js && ` prefix deleted;
filename absent (`grep -c` = 0). Guard **FAILED** (`Passed: 3 Failed: 1`), not by
absence:
```
expected exactly one chain segment equal to 'node test-reachability.test.js';
found 0 exact match(es) among 66 node invocation(s). Segments mentioning the
file: []
```

**c. DUPLICATE** (added this revision) — see the symmetry section above.

After every control `app/package.json` was restored and verified byte-identical
(`9622fa0a…` before and after each), the backup deleted, and `git status --porcelain`
empty. `app/package.json` was never left modified.

## Gates

### Pester gate — PASS, rerun this revision

`powershell -NoProfile -ExecutionPolicy Bypass -File scripts/run-pester.ps1`
→ exit **0**; `Tests completed in 113.84s`;
**`Passed: 955 Failed: 0 Skipped: 0 Pending: 0 Inconclusive: 0`**;
`run-pester: 955 passed, 0 failed, 0 skipped (of 955)`.

### App gate — INTERMITTENT FAILURE OBSERVED; no fresh green gate is claimed

**A fresh green app gate is NOT claimed, and the earlier builder-run PASS is NOT
reinterpreted as an independently reproduced PASS.**

Command (run from `app/`): `npm test`

**Run 1 — FAILED.** Exit code **1**. Failing suite:
`dockview-app-integration.test.js` — `290 passed, 1 failed`. The chain is `&&`-joined,
so it stopped there; 15 suite summaries had been emitted. Failing assertion, verbatim:
```
  ✗ FAIL: the maximized pane grew to the whole surface (100 -> 100)
```
in the `maximize routes by OWNERSHIP — the two mechanisms never both run` block. The
sibling assertion immediately after it passed (`the sibling collapsed (100 -> 1)`),
i.e. the sibling did collapse but the maximized pane's own measured width did not
change within the assertion window — a geometry/timing observation, not a logic
refusal.

**GPU subprocess evidence: NONE in this run.** A search of the full log for
`gpu`, `1073741515`, `crash`, `subprocess`, `renderer process`, and `exited with`
returned no matching diagnostic. **This is a different failure from the one the
independent reviewer observed** (reviewer: `dockview-bootstrap.test.js` failing with
Electron GPU subprocess exit `-1073741515`, i.e. `0xC0000135` /
`STATUS_DLL_NOT_FOUND`). Both are Electron-dependent Dockview suites, but the suite,
the symptom, and the evidence differ; they are recorded separately rather than
treated as one reproduction.

**Run 2 — PASSED.** Exit code **0**, zero `✗` lines, totals reconciling to
**67 suites / 4,888 assertions / 0 failures** (4,870 from the 65 suites reporting
`N passed, N failed`, plus 18 from the two reporting `N assertions passed`:
`renderer/audio-module-health.test.js` 9 and `renderer/tts-audio-contract.test.js` 9).

**Targeted diagnostic — branch worktree:** `node dockview-app-integration.test.js`
standalone, 3 consecutive runs → **3/3 exit 0, `291 passed, 0 failed`** each.

**Smallest equivalent diagnostic on current main (`34af8bf`), no worktree modified:**
- `node dockview-app-integration.test.js` standalone, 3 runs → **3/3 exit 0,
  `291 passed, 0 failed`** each.
- Full `npm test` chain on main → **exit 0**, zero failures.
- `git status --porcelain` in the main worktree was byte-for-byte identical before and
  after (`?? .worktrees/` only, pre-existing). Main was not modified.

**Attribution — this failure cannot be caused by R1.** The entire `app/` tree is
byte-identical between current main and this branch tip:
`git diff --name-only 34af8bf <branch tip> -- app/` is **empty**, and
`git diff --name-only 8c6bfce <branch tip> -- '*.js'` is **empty**. R1 changes one
PowerShell file and one Markdown file; it changes **zero** JavaScript, so the Node
gate executes provably identical inputs on both sides. The observed failure is
environmental/timing-dependent and pre-existing.

**Disposition required.** Observed app-gate results across this session: branch
PASS, branch **FAIL**, branch PASS; main PASS. The gate is intermittent at roughly
one failure in three full-chain runs on this machine, in a class of Electron-dependent
Dockview assertions that the independent reviewer also hit (by a different route).
**Stopping here for Blue's explicit disposition of this environmental blocker.** No
merge authorization should be inferred from the green Run 2.

## Known limitations

- Accepted gap shared with the Node side: an entry naming the file without being its
  own bare invocation must collide exactly with `node test-reachability.test.js` to
  pass. The realistic failure mode guarded against is accidental disarming, not a
  crafted decoy.
- Case-sensitive (`-ceq`), whitespace-trimmed per segment only; alternate valid
  invocations (e.g. `node ./test-reachability.test.js`) are not tolerated —
  consistent with the Node side's `wiredPkgPaths` set.
- The Node/Pester duplicate asymmetry documented above is a real, deliberate
  divergence, not an oversight; the Node side would need its own `filter`-and-count
  change to match, which is out of scope here.
- The app gate is currently intermittent for reasons unrelated to this branch (see
  above), which limits how strongly any single green run can be relied upon.

## Reviewer focus

- `scripts/test-reachability.Tests.ps1:62-97` — tokenization on `&&`, the `node `
  prefix strip, `-ceq` exactness, `$exact.Count -eq 1`, and that `$mentions` cannot
  influence `$exact`.
- The Node/Pester asymmetry section — that it is stated accurately, with its
  execution evidence.
- The app-gate section — that it records an observed failure honestly and claims no
  fresh green gate.
- **This document itself**, in-scope reviewed content in the full-range review.
- Proportionality: one `It` block changed in code, nothing else.

## Review artifacts

**Four** artifacts exist in the worktree (the earlier revision miscounted them as
three). All are gitignored `.agent-review-*.diff` files. All four are retained; none
is removed.

**1. Code-focused artifact** — `8c6bfce...cf6c1a8` (code delta only):
- `.agent-review-pester-reachability-exact-match.diff`
- 2,943 bytes
- SHA-256: `6ac73e66bc6428deb11f541c8d415fef40764e85fd55d4d723b0f58de929bc44`

**2. Code-focused regeneration twin** — same range, byte-identical to artifact 1:
- `.agent-review-pester-reachability-exact-match.regen.diff`
- 2,943 bytes
- SHA-256: `6ac73e66bc6428deb11f541c8d415fef40764e85fd55d4d723b0f58de929bc44`

**3. Full-range artifact for the superseded tip** — `8c6bfce...bc4fa45`:
- `.agent-review-pester-reachability-exact-match-full.diff`
- 16,034 bytes
- SHA-256: `23729b58e340547c33b8e25069af5099cf47ecb16c6cb08e33fd935a4cb086eb`

**4. Regeneration twin of artifact 3** — byte-identical to artifact 3:
- `.agent-review-pester-reachability-exact-match-full.regen.diff`
- 16,034 bytes
- SHA-256: `23729b58e340547c33b8e25069af5099cf47ecb16c6cb08e33fd935a4cb086eb`

**5. New full-range artifact for THIS corrective tip** — the artifact the fresh
review must use, generated with `git diff --output` (never PowerShell redirection):
```
git diff 8c6bfce6c36bbe0adda8dda46f6bab728e6ae38f <corrective tip> --output=.agent-review-pester-reachability-exact-match-r2.diff
```
It necessarily spans the commit introducing this text, so its size and SHA-256 cannot
be embedded in the document it contains. Its identity — exact byte size, SHA-256, and
an empty binary comparison against an independently regenerated twin
(`.agent-review-pester-reachability-exact-match-r2.regen.diff`) — is recorded in the
Builder's closing report and is reproducible by regenerating the same range.

Reviewer verdict: **FAIL (retained above).** No corrective PASS is claimed. This
corrective tip is submitted for a fresh independent Standard review, subject to Blue's
disposition of the app-gate environmental blocker.
