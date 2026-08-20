# Builder Handoff — Pester-Side Exact-Token Reachability Match

Branch: `fix/pester-reachability-exact-match`
Fork point / base: `8c6bfce6c36bbe0adda8dda46f6bab728e6ae38f` (main tip at fork time)
Pre-merge main: `8c6bfce6c36bbe0adda8dda46f6bab728e6ae38f` — identical to the base; no
commits landed on `main` between fork and this handoff, so fork point, base, and
pre-merge main are the same SHA.
Code tip (implementation, unchanged): `cf6c1a8bf0c7844509d549abd8b9395aed900d8c`

## CORRECTION — the earlier handoff-tail claim is WITHDRAWN

A previous revision of this document claimed that commit `7e7cb31` was a
merge-gate-valid documentation-only handoff tail sitting above the reviewed code tip
`cf6c1a8`. **That claim was wrong and is withdrawn.** It is mechanically invalid
under the tail policy in `scripts/merge-gate.ps1:503-529`, for two independent
reasons, both verified against the real commits:

1. **`scripts/merge-gate.ps1:517`** requires every path in the tail diff to be status
   `M` (`$parts[0] -cne 'M'` refuses otherwise). `git diff --name-status --no-renames
   cf6c1a8 7e7cb31` yields `A docs/BUILDER-HANDOFF-pester-reachability-exact-match.md`
   — an ADD, not a MODIFY. Refusal text would be
   `REFUSED: handoff tail may only MODIFY docs/BUILDER-HANDOFF-pester-reachability-exact-match.md (found: A ...)`.
2. **`scripts/merge-gate.ps1:522-525`** requires the handoff doc to exist as a
   regular `100644` blob at **both** endpoints, `reviewedTip` and `branchTip`.
   `git ls-tree cf6c1a8 -- docs/BUILDER-HANDOFF-pester-reachability-exact-match.md`
   returns empty. Refusal text would be
   `REFUSED: docs/BUILDER-HANDOFF-pester-reachability-exact-match.md does not exist at cf6c1a8`.

The root cause is structural, not editorial: **the handoff did not exist at the code
tip**, so a tail could only ever ADD it. The tail policy exists for the case where an
already-reviewed handoff is amended (e.g. to append a verdict) above an
already-reviewed code tip — it cannot be used to introduce the handoff in the first
place.

### Consequence for the next review

**The next review must cover the FULL branch range** — `8c6bfce6c36bbe0adda8dda46f6bab728e6ae38f`
through the corrected handoff tip (the commit that contains this corrected document),
with **no handoff tail** and therefore `reviewedTip == branchTip`. The corrected
handoff tip is itself the reviewed content tip; this document is in-scope reviewed
content, not out-of-scope narration.

Only **after** an independent PASS over that full range may a final verdict tail
MODIFY this already-existing handoff — at that point both merge-gate conditions are
satisfiable, because the doc will exist at the reviewed tip and the tail will be a
genuine `M`.

## What this branch does

Ports the Node-side meta-test's exact-token matching to its Pester-side mirror, so
both halves of the mutual anti-orphan watchdog pair use the same matching
discipline. `app/test-reachability.test.js` already tokenizes `app/package.json`'s
`"test"` script on `&&` and requires an exact `node <path>` segment match (hardened
in the prior `test-reachability-meta` branch after a Reviewer MEDIUM about substring
masking). `scripts/test-reachability.Tests.ps1` still used `.Contains()` — a
substring test that catches a REMOVED wiring but not a NEUTERED one, since
`node test-reachability.test.js || exit 0` still contains the filename as a
substring while silently disarming the watchdog it is supposed to verify. This
branch replaces the `.Contains()` check with the same tokenize-and-exact-match
logic.

Tier: **Standard-class**, test-tooling only. Worst case of a defect here is a false
gate pass/fail in a meta-test that watches other tests; no runtime code, no
dependency, no production surface is touched.

## Exact one-file code delta

Only `scripts/test-reachability.Tests.ps1` changes (+34/-2 lines, one `It` block).
No other file in the repo differs from base. `app/package.json` is confirmed
byte-identical to base (see Negative Controls below — it is restored to that exact
state after each control run).

Before:
```powershell
It 'the Node-side meta-test is wired into app/package.json (mutual anti-orphan watchdog)' {
    $pkg = Get-Content -LiteralPath (Join-Path $repoRoot 'app\package.json') -Raw -Encoding UTF8 | ConvertFrom-Json
    $pkg.scripts.test.Contains('test-reachability.test.js') | Should Be $true
}
```

After: tokenizes `$pkg.scripts.test` on `&&`, trims each segment, keeps segments
starting with `node `, strips that prefix, and requires exactly one segment
case-sensitively equal (`-ceq`) to `test-reachability.test.js`. On failure, the
assertion message reports the exact-match count, the total node-invocation count,
and — separately — every chain segment that merely *mentions* the filename as a
substring (`$mentions`, built with `-like '*test-reachability.test.js*'` over
`$segments`, independent of the `$exact` match result), so a NEUTERED entry is named
in the failure output even though it fails the exact check. See
`scripts/test-reachability.Tests.ps1:62-97`.

## Negative controls — procedure and results

Both controls were run against the real `app/package.json` (not a disposable fixture
copy, since the assertion under test reads that exact path via
`Join-Path $repoRoot 'app\package.json'`). Procedure for each: (1)
`cp app/package.json app/package.json.orig-backup`, verified via SHA-256 match; (2)
mutate `app/package.json` in place; (3) run the guard suite via
`Invoke-Pester -Path scripts\test-reachability.Tests.ps1`; (4) restore from the
backup, re-verify SHA-256 equality, delete the backup, confirm
`git status --porcelain` is empty.

**a. NEUTERING** — `node test-reachability.test.js` rewritten in place to
`node test-reachability.test.js || exit 0` (single edit, chain otherwise untouched).
Result: guard **FAILED** (`Passed: 3 Failed: 1`), naming the offending segment:
```
expected exactly one chain segment equal to 'node test-reachability.test.js';
found 0 exact match(es) among 67 node invocation(s). Segments mentioning the
file: [node test-reachability.test.js || exit 0]
```
This is the exact scenario the old `.Contains()` check passed.

**b. REMOVAL** — the entire `node test-reachability.test.js && ` chain prefix
deleted, so the test script starts with `node admission-main-startup.test.js`; the
filename is fully absent from `app/package.json` (`grep -c` = 0). Result: guard
**FAILED** (`Passed: 3 Failed: 1`), and did not pass-by-absence:
```
expected exactly one chain segment equal to 'node test-reachability.test.js';
found 0 exact match(es) among 66 node invocation(s). Segments mentioning the
file: []
```

After each control, `app/package.json` was restored and SHA-256-verified
byte-identical to the pre-mutation backup
(`9622fa0ab2d90dfe80e02fff8ad88c843eeeec0c4d9a585277b3c04da1595462` before and after
both controls), the backup file was deleted, and `git status --porcelain` returned
empty. `app/package.json` was never left modified.

## Diagnostic separation (point of review focus)

Confirmed by direct read of `scripts/test-reachability.Tests.ps1:82-96`: `$exact`
(the pass/fail gate, `-ceq` equality) and `$mentions` (the diagnostic naming, `-like`
substring) are two independently computed collections over `$segments`. `$mentions`
never feeds `$exact` or the `Should Be` gate — it exists solely so a failure message
can name what a substring scan found, without that scan being able to make the gate
itself pass.

## Gates

**Full app gate — 67 suites / 4,888 assertions / 0 failures.** This is the
established, authoritative result for this tree and the figure of record.
`npm test` in `app/` exits **0**.

The authoritative count was reconciled by executing all 67 chain suites
individually (every one exited 0; `SUITES_NONZERO_EXIT: 0`):
- 65 suites self-report in `N passed, N failed` form, summing to **4,870**;
- 2 suites report in a different form, `N assertions passed` —
  `renderer/audio-module-health.test.js` (9) and
  `renderer/tts-audio-contract.test.js` (9) — contributing **18**;
- 4,870 + 18 = **4,888**, 0 failures.

**A raw `✓`-line count of the combined log is NOT the gate result and is not
authoritative.** It is log-shape evidence only. That count is 4,825, and it
undercounts for three format reasons, all reconciled: 46 assertions print with a
`PASS ` prefix rather than `✓` (4,825 + 46 = 4,871 assertion lines); the two suites
above print only a summary line and no per-assertion lines (−18 relative to the
authoritative total); and `dockview-default-path.test.js` prints one more line than
the 380 assertions it reports (+1). 4,871 + 18 − 1 = 4,888. Any future handoff should
quote the 67 / 4,888 / 0 figure, never a checkmark-line count.

**Pester gate:** `powershell -ExecutionPolicy Bypass -File scripts/run-pester.ps1`
exits **0** — `Passed: 955 Failed: 0 Skipped: 0 Pending: 0 Inconclusive: 0`;
`run-pester: 955 passed, 0 failed, 0 skipped (of 955)`.

No code change resulted from the negative controls (both proved the implementation
correct as committed at `cf6c1a8`), and the corrective commit carrying this document
changes only this Markdown file, so the gates above remain the valid record for the
code tip.

Security-sensitive surfaces touched: none. No runtime code, no production code, no
dependency, and no permanent `app/package.json` change.

## Known limitations

- Same accepted gap as the Node-side implementation this ports: an entry that names
  the file without being its own bare invocation would still have to collide exactly
  with `node test-reachability.test.js` to pass — the realistic failure mode guarded
  against is accidental disarming (a stray `||`, a removed line), not a deliberately
  crafted decoy.
- The check is case-sensitive (`-ceq`) and whitespace-trimmed per segment only; it
  does not tolerate alternate valid invocations of the same script (e.g.
  `node ./test-reachability.test.js`) — consistent with the Node side's own
  `wiredPkgPaths` set, which has the identical constraint.
- No production/runtime/dependency change of any kind in this branch.

## Reviewer focus

- `scripts/test-reachability.Tests.ps1:62-97` — the ported exact-match logic:
  tokenization on `&&`, the `node ` prefix strip, `-ceq` exactness, and that
  `$mentions` cannot influence `$exact`.
- Symmetry with `app/test-reachability.test.js:73-79`'s existing `wiredPkgPaths`
  logic — same rule, two runners.
- The negative-control results above as the proof the fix does what it claims.
- **This document itself**, which is in-scope reviewed content in the full-range
  review, including the withdrawal above and the corrected gate accounting.
- Proportionality: one `It` block changed in code, nothing else.

## Review artifacts

Three artifacts exist; all are gitignored `.agent-review-*.diff` files, consistent
with repo practice. The earlier two are **preserved unmodified** as supporting
evidence for the code delta.

**1. Code-focused artifact (preserved, supporting evidence)** — base → code tip,
excludes all handoff commits:
```
git diff 8c6bfce6c36bbe0adda8dda46f6bab728e6ae38f cf6c1a8bf0c7844509d549abd8b9395aed900d8c --output=.agent-review-pester-reachability-exact-match.diff
```
- `.agent-review-pester-reachability-exact-match.diff`
- 2,943 bytes
- SHA-256: `6ac73e66bc6428deb11f541c8d415fef40764e85fd55d4d723b0f58de929bc44`

**2. Reproducibility twin (preserved)** — same range, regenerated to a separate file;
byte-identical to artifact 1 (same size, same hash, empty `diff`):
- `.agent-review-pester-reachability-exact-match.regen.diff`
- 2,943 bytes
- SHA-256: `6ac73e66bc6428deb11f541c8d415fef40764e85fd55d4d723b0f58de929bc44`

**3. Full-branch cumulative artifact (the one the next review must use)** — base
through the corrected handoff tip, `reviewedTip == branchTip`, no tail:
```
git diff 8c6bfce6c36bbe0adda8dda46f6bab728e6ae38f <corrected-handoff-tip> --output=.agent-review-pester-reachability-exact-match-full.diff
```
This artifact necessarily spans the commit that introduces this very document, so its
size and SHA-256 cannot be embedded in the document it contains. Its identity is
recorded in the Builder's closing report for this branch and is independently
verifiable by regenerating the same range and comparing — the regeneration and
byte-identity check were performed as part of pinning it.

Reviewer verdict: **not yet recorded.** This corrected handoff tip is the
review-ready content tip. A verdict tail may MODIFY this file only after an
independent PASS over the full range described above.
