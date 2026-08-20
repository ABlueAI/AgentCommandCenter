# Builder Handoff — Pester-Side Exact-Token Reachability Match

Branch: `fix/pester-reachability-exact-match`
Fork point / base: `8c6bfce6c36bbe0adda8dda46f6bab728e6ae38f` (main tip at fork time)
Pre-merge main: `8c6bfce6c36bbe0adda8dda46f6bab728e6ae38f` — identical to the base; no
commits landed on `main` between fork and this handoff, so fork point, base, and
pre-merge main are the same SHA.
Code tip (implementation, pre-existing on this branch): `cf6c1a8bf0c7844509d549abd8b9395aed900d8c`
Handoff-tail policy: this document lands as a separate documentation-only commit on
top of the code tip, per the repo's established review-diff rule (see the
"Review-diff rule" section of `docs/BUILDER-HANDOFF-test-reachability-meta.md`,
whose own docs-only tail sits on top of its implementation commit the same way).
The cumulative review
diff pinned in this handoff spans `8c6bfce...cf6c1a8` — base to code tip — and
deliberately EXCLUDES this doc commit. Reviewers diff the code; this file is
narration.

Tier: **Standard-class**, test-tooling only. Worst case of a defect here is a false
gate pass/fail in a meta-test that watches other tests; no runtime code, no
dependency, no production surface is touched.

## What this branch does

Ports the Node-side meta-test's exact-token matching to its Pester-side mirror, so
both halves of the mutual anti-orphan watchdog pair use the same matching
discipline. `app/test-reachability.test.js` already tokenizes `app/package.json`'s
`"test"` script on `&&` and requires an exact `node <path>` segment match (hardened
in the prior `test-reachability-meta` branch after a Reviewer MEDIUM about substring
masking). `scripts/test-reachability.Tests.ps1` still used `.Contains()` — a
substring test that catches a REMOVED wiring but not a NEUTERED one, since
`node test-reachability.test.js || exit 0` still contains the filename as a
substring while silently disarming the watchdog it's supposed to verify. This
branch replaces the `.Contains()` check with the same tokenize-and-exact-match
logic, ported line-for-line in spirit from the Node side.

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
in the failure output even though it fails the exact check. Full delta in the pinned
review diff (see Review Diff below); see `scripts/test-reachability.Tests.ps1:62-97`.

## Negative controls — procedure and results

Both controls were run against a byte-identical backup/restore of the real
`app/package.json` (never a disposable fixture copy, since the assertion under test
reads that exact path via `Join-Path $repoRoot 'app\package.json'`). Procedure for
each: (1) `cp app/package.json app/package.json.orig-backup`, verified via SHA-256
match; (2) mutate `app/package.json` in place; (3) run only the guard `It` block via
`Invoke-Pester -Path scripts\test-reachability.Tests.ps1`; (4) restore from the
backup via `cp`, re-verify SHA-256 equality with the backup, delete the backup file,
confirm `git status --porcelain` is empty.

**a. NEUTERING** — `node test-reachability.test.js` rewritten in place to
`node test-reachability.test.js || exit 0` (single edit, chain otherwise untouched).
Result: guard **FAILED** (`Passed: 3 Failed: 1`), naming the offending segment:
```
expected exactly one chain segment equal to 'node test-reachability.test.js';
found 0 exact match(es) among 67 node invocation(s). Segments mentioning the
file: [node test-reachability.test.js || exit 0]
```
This is the exact scenario the old `.Contains()` check missed — the filename
substring is still present, but the exact-match now correctly rejects it and the
`$mentions` scan names it in the failure text.

**b. REMOVAL** — the entire `node test-reachability.test.js && ` chain prefix
deleted, so the test script starts with `node admission-main-startup.test.js`
instead; the filename is fully absent from `app/package.json` (`grep -c` = 0).
Result: guard **FAILED** (`Passed: 3 Failed: 1`), and did not pass-by-absence:
```
expected exactly one chain segment equal to 'node test-reachability.test.js';
found 0 exact match(es) among 66 node invocation(s). Segments mentioning the
file: []
```

After each control, `app/package.json` was restored and SHA-256-verified
byte-identical to the pre-mutation backup
(`9622fa0ab2d90dfe80e02fff8ad88c843eeeec0c4d9a585277b3c04da1595462` both before and
after both controls), the backup file was deleted, and `git status --porcelain`
returned empty. `app/package.json` was never left modified at any point this branch
was worked.

## Diagnostic separation (point of review focus)

Confirmed by direct read of `scripts/test-reachability.Tests.ps1:82-96`: `$exact`
(the pass/fail gate, `-ceq` equality) and `$mentions` (the diagnostic naming, `-like`
substring) are two independently computed collections over `$segments`. `$mentions`
never feeds `$exact` or the `Should Be` gate — it exists solely so a failure message
can name what a substring scan found, without that scan being able to make the gate
itself pass. This mirrors the Node side's separation of `wiredPkgPaths` (exact) from
its own failure-naming logic.

## Gates (full app + Pester, unmodified branch, this tree)

- `npm test` in `app/` (code tip `cf6c1a8`, `app/package.json` unmodified):
  **exit 0**, 4825 `✓` assertion lines, 0 `✗` lines, no per-file `N failed` > 0
  anywhere in the run.
- `powershell -ExecutionPolicy Bypass -File scripts/run-pester.ps1` (same tree):
  **exit 0** — `Passed: 955 Failed: 0 Skipped: 0 Pending: 0 Inconclusive: 0`;
  `run-pester: 955 passed, 0 failed, 0 skipped (of 955)`.

No code change was made as a result of the negative controls (both proved the
implementation correct as committed at `cf6c1a8`), so these gates were not rerun
after this handoff commit — the gates above are the current, valid record for the
code tip. Only this documentation file changes in the handoff-tail commit; it has no
executable content.

Security-sensitive surfaces touched: none. No runtime code, no production code, no
dependency, no `package.json` change (permanent or otherwise).

## Known limitations

- Same accepted gap as the Node-side implementation this ports: a wrapper (or, here,
  a package.json entry) that names the file in a boundary-clean position without
  genuinely executing it as its own bare invocation would still need to collide
  exactly with `node test-reachability.test.js` to pass — the realistic failure mode
  this guards against is accidental disarming (a stray `||`, a removed line), not a
  deliberately crafted decoy.
- The check is case-sensitive (`-ceq`) and whitespace-trimmed per segment only; it
  does not tolerate alternate valid invocations of the same script (e.g. via a
  relative path prefix, `node ./test-reachability.test.js`) — consistent with the
  Node side's own `wiredPkgPaths` set, which has the identical constraint.
- No production/runtime/dependency change of any kind in this branch.

## Reviewer focus

- `scripts/test-reachability.Tests.ps1:62-97` — the ported exact-match logic itself:
  tokenization on `&&`, the `node ` prefix strip, `-ceq` exactness, and that
  `$mentions` cannot influence `$exact`.
- Symmetry with `app/test-reachability.test.js:70-83`'s existing `wiredPkgPaths`
  logic — same rule, two runners.
- The negative-control results above as the actual proof the fix does what it
  claims (NEUTERING and REMOVAL both now fail the guard; the prior `.Contains()`
  form would have passed NEUTERING).
- Proportionality: one `It` block changed, nothing else.

## Review diff

Cumulative delta, base to code tip (excludes this doc-only tail commit):
```
git diff 8c6bfce6c36bbe0adda8dda46f6bab728e6ae38f cf6c1a8bf0c7844509d549abd8b9395aed900d8c --output=.agent-review-pester-reachability-exact-match.diff
```
Existing pinned artifact identity (preserved, unmodified by this handoff):
- `.agent-review-pester-reachability-exact-match.diff`
- 2,943 bytes
- SHA-256: `6ac73e66bc6428deb11f541c8d415fef40764e85fd55d4d723b0f58de929bc44`

Regenerated to a separate file this session to prove reproducibility without
touching the original:
```
git diff 8c6bfce6c36bbe0adda8dda46f6bab728e6ae38f cf6c1a8bf0c7844509d549abd8b9395aed900d8c --output=.agent-review-pester-reachability-exact-match.regen.diff
```
- `.agent-review-pester-reachability-exact-match.regen.diff`
- 2,943 bytes
- SHA-256: `6ac73e66bc6428deb11f541c8d415fef40764e85fd55d4d723b0f58de929bc44`

Byte-identical to the original (same size, same hash, `diff` empty). Both files are
gitignored review artifacts, not tracked content — consistent with the existing
pattern for `.agent-review-*.diff` files in this repo.

Reviewer verdict: not yet recorded — this handoff is the review-ready state; a
Reviewer pass over `.agent-review-pester-reachability-exact-match.diff` (or the
`.regen.diff` twin) is the next step, out of scope for this Builder pass.
