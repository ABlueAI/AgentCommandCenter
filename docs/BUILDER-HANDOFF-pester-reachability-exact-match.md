# Builder Handoff — Pester-Side Exact-Token Reachability Match

## Branch topology

| Role | SHA |
| --- | --- |
| **Reviewed base / pre-merge main** | `34af8bf340eaa518bca3b9aa7109025f47b8992d` |
| **Historical fork point** (record only) | `8c6bfce6c36bbe0adda8dda46f6bab728e6ae38f` |
| **Implementation / code tip, unchanged** | `cf6c1a8bf0c7844509d549abd8b9395aed900d8c` |
| Inbound main-integration merge | `cbd3e43a5725f9f1f3483adebbe6d1ca505f5721` |
| **Reviewed content tip == branch tip** | the corrective commit that carries this revision |

Branch: `fix/pester-reachability-exact-match`

At the time of the inbound integration, **`main == origin/main == 34af8bf`**, verified
after `git fetch --all`. The reviewed base for the next review and for the merge gate
is `34af8bf`, not the historical fork point.

`8c6bfce` is retained **only** as the historical fork point — the commit this branch
originally forked from and against which the earlier code-focused artifacts were
pinned. It is no longer the reviewed base and is no longer the pre-merge main.

### Inbound integration proof

`34af8bf` was merged into this branch with a normal merge commit
(`cbd3e43a5725f9f1f3483adebbe6d1ca505f5721`, `--no-ff`, strategy `ort`, no conflict).
Verified afterwards:

- `git merge-base --is-ancestor 34af8bf <branch tip>` → **true**; `34af8bf` is an
  ancestor of the branch tip.
- `git merge-base 34af8bf <branch tip>` → **`34af8bf340eaa518bca3b9aa7109025f47b8992d`**,
  i.e. `merge-base == 34af8bf`.
- `8c6bfce` remains an ancestor of the branch tip and is recorded separately above.
- The merge brought in **only** `docs/AUDIT-test-runner-wiring.md` and
  `docs/BUILDER-HANDOFF-test-runner-wiring-audit.md` (644 insertions, both new files).
- **No substantive change to the R1 implementation.**
  `git diff 4b63708 <merge commit> -- scripts/test-reachability.Tests.ps1` is empty,
  and the suite is byte-identical to its state at the code tip `cf6c1a8`.
  `app/package.json` is byte-identical to `34af8bf`.

### Full reviewed delta from the reviewed base

`git diff --stat 34af8bf <branch tip>` identifies **only the actual R1 files**:

```
docs/BUILDER-HANDOFF-pester-reachability-exact-match.md | 300 +++++++++++++++++++++
scripts/test-reachability.Tests.ps1                     |  36 ++-
2 files changed, 334 insertions(+), 2 deletions(-)
```

- `scripts/test-reachability.Tests.ps1` — the one-file R1 code change (+34/−2).
- `docs/BUILDER-HANDOFF-pester-reachability-exact-match.md` — this handoff.

Nothing else differs from the reviewed base. The audit documents the merge brought in
are part of `34af8bf` itself and therefore do not appear in this delta.

## Independent review outcome — retained verbatim

```
VERDICT: FAIL
CLASS: Standard
INDEPENDENCE: CONFIRMED
```

Source: independent Standard-class review of
`8c6bfce6c36bbe0adda8dda46f6bab728e6ae38f...bc4fa4592f2cfd27e4e5f218d32044bcd81ef13d`.

**No corrective PASS is claimed.** The FAIL above stands as the recorded verdict until
an independent reviewer supersedes it. This revision is submitted for a fresh
independent Standard review.

## Blue's app-gate disposition — retained verbatim

```
DISPOSITION: Accept the app-gate failure as a non-blocking environmental
residual for R1 only, on the basis of proven non-attribution: the app/
tree is byte-identical between 34af8bf and 4b63708, so the Node gate runs
identical inputs on both sides and R1 cannot be its cause. This does not
authorize suppressing the failure or treating the flake as resolved.

AMENDMENTS:
1. The two observed failures are NOT dispositioned as one class.
   dockview-bootstrap (GPU 0xC0000135, DLL not found) and
   dockview-app-integration (maximize assertion, 100->100, no GPU
   evidence) are recorded as separate open items pending root cause.
   Neither is characterized as "intermittency" until a cause is shown.
2. Gate reliability is opened as a finding in its own right, priority
   above F5. Cited failure rate is UNMEASURED (1 failure in 4 observed
   runs). First action is to establish the rate — N>=20 full-chain runs
   on unmodified main — before any remediation.
3. Node/Pester contract asymmetry recorded: Node accepts a duplicate
   chain entry, Pester (post-R1) rejects it. Confirm intended, and
   disposition the Node-side duplicate hole.
```

### Non-attribution proof (as cited by the disposition)

The `app/` tree is byte-identical between the reviewed base and this branch:
`git diff --name-only 34af8bf <branch tip> -- app/` is **empty**, and the `app` tree
object hash is **`e0aaaaab805dd46297ead0d8f881b0a1084db943`** on both sides. R1
changes one PowerShell file and one Markdown file and **zero** JavaScript, so the Node
gate executes provably identical inputs on both sides and cannot be the cause.

This is a **bounded** disposition for R1 only. It does not authorize suppressing the
failure, does not treat it as resolved, and does not constitute a clean app gate.

### Amendment 2, first action — COMPLETED

Recorded separately from the four earlier ad-hoc observations, which remain
`UNMEASURED (1 failure in 4 observed runs)` exactly as the amendment states.

Measured result:

- **Snapshot:** exact `34af8bf340eaa518bca3b9aa7109025f47b8992d`
- **N = 20** full-chain observations
- **0 passed**
- **20 failed at `dockview-bootstrap.test.js`**
- **0 timeouts**
- **0** `maximize 100->100` observations
- **0** other failures
- Every run stopped after **13 suite summaries** and **1,092 passing assertions**
- Evidence included **render-process-gone / launch-failed**, **loadFile ERR_FAILED
  (-2)**, **os_crypt 0x8009000B**, and **GPU exit -1073741515 / 0xC0000135**
- **The actual main worktree reproduced the bootstrap failure.**
- **No authoritative 67-suite / 4,888-assertion full-chain result was available.**

This is an **observed 20/20 sample, not a generalized long-run rate and not an
established root cause.** **No common cause with the separate maximize assertion may
be inferred** — per amendment 1 the two failures are separate open items pending root
cause, and this sample produced zero maximize observations.

Supporting measurement evidence:

- Directory:
  `D:\Workspace\agent-command-center\.worktrees\gate-reliability-measurement\measurement-logs\`
- Summary SHA-256:
  `b34b830f9fbd0f1dc77e9771f8dd79f7dea5dcca97b2ce20d60fe4884824a82a`
- Raw-file hash manifest SHA-256:
  `b8a424298f8f8163497936b3d07e6c0ffd15238964891e127c38f835f44dc622`

**These logs are ignored supporting evidence, not tracked review artifacts.** They
live under the untracked `.worktrees/` path, are not part of this branch's tracked
content, and appear in no reviewed delta. Both hashes above were re-verified against
the files on disk during this correction, and the summary's recorded
`app_tree=e0aaaaab805dd46297ead0d8f881b0a1084db943` matches this branch's `app` tree
hash exactly — the measurement ran the same app inputs this branch carries.

## Blue's contract disposition — retained verbatim

```
CONTRACT DISPOSITION: Exactly one package-chain invocation is the intended invariant for both watchdogs. Retain R1's duplicate-rejecting Pester behavior and open Node-side duplicate rejection as a separate follow-up, prioritized after gate reliability and before F5.
```

Explicitly:

- **R1's Pester behavior is intentional.** Requiring exactly one bare
  `node test-reachability.test.js` chain segment, and rejecting duplicates, is the
  intended invariant — not an overreach to be relaxed.
- **Node's duplicate acceptance remains open and is NOT fixed by R1.** The Node-side
  watchdog still accepts a duplicated chain entry; this branch does not change it.
- **Priority order: gate reliability → Node duplicate rejection → F5.**
- **This work order does not authorize implementing either follow-up.** Both are
  recorded here as open items only.

## What this branch does

Ports the Node-side meta-test's exact-token matching to its Pester-side mirror.
`app/test-reachability.test.js` already tokenizes `app/package.json`'s `"test"` script
on `&&` and requires an exact `node <path>` segment match.
`scripts/test-reachability.Tests.ps1` still used `.Contains()` — a substring test that
catches a REMOVED wiring but not a NEUTERED one, since
`node test-reachability.test.js || exit 0` still contains the filename as a substring
while silently disarming the watchdog it is supposed to verify. This branch replaces
`.Contains()` with tokenize-and-exact-match.

Tier: **Standard-class**, test-tooling only. No runtime code, no dependency, no
production surface.

### The code delta

Before:
```powershell
It 'the Node-side meta-test is wired into app/package.json (mutual anti-orphan watchdog)' {
    $pkg = Get-Content -LiteralPath (Join-Path $repoRoot 'app\package.json') -Raw -Encoding UTF8 | ConvertFrom-Json
    $pkg.scripts.test.Contains('test-reachability.test.js') | Should Be $true
}
```

After: tokenizes `$pkg.scripts.test` on `&&`, trims each segment, keeps segments
starting with `node `, strips that prefix, and requires exactly one segment
case-sensitively equal (`-ceq`) to `test-reachability.test.js`. On failure the message
reports the exact-match count, the node-invocation count, and — separately — every
segment that merely *mentions* the filename (`$mentions`, built with `-like` over
`$segments`, independent of `$exact`). See
`scripts/test-reachability.Tests.ps1:62-97`.

`app/package.json` is unchanged by this branch and byte-identical to the reviewed base,
SHA-256 `9622fa0ab2d90dfe80e02fff8ad88c843eeeec0c4d9a585277b3c04da1595462`.

## Node/Pester contract — asymmetric, deliberately

The two watchdogs are **not** the same rule. Both enforce **case-sensitive
exact-token matching** over the `&&`-tokenized `node <path>` segments. They differ on
multiplicity:

- **Pester** (`scripts/test-reachability.Tests.ps1:82-96`) requires **exactly one**
  occurrence — `$exact.Count -eq 1` — and therefore **rejects duplicates**.
- **Node** (`app/test-reachability.test.js:73-79, 112-114`) builds a `Set` and tests
  membership via `wiredPkgPaths.has(...)`. Set construction collapses duplicates, so
  Node **accepts duplicate identical invocations**.

Verified by execution against a duplicated chain entry, with `app/package.json`
restored byte-identically afterwards:

- Node: `test-reachability: 6 passed, 0 failed`, exit 0 — **accepted** the duplicate.
- Pester: **FAILED** — `expected exactly one chain segment equal to 'node test-reachability.test.js'; found 2 exact match(es) among 68 node invocation(s). Segments mentioning the file: [node test-reachability.test.js | node test-reachability.test.js]`

Per the contract disposition above, the Pester behavior is intended and retained; the
Node-side duplicate hole is an open follow-up that R1 does not fix.

## Negative controls

Run against the real `app/package.json` (the assertion reads that exact path). For
each: back up and SHA-256-verify, mutate in place, run
`Invoke-Pester -Path scripts\test-reachability.Tests.ps1`, restore, re-verify SHA-256,
delete the backup, confirm `git status --porcelain` empty.

**a. NEUTERING** — rewritten to `node test-reachability.test.js || exit 0`. Guard
**FAILED** (`Passed: 3 Failed: 1`):
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

**c. DUPLICATE** — see the contract section above.

After every control `app/package.json` was restored and verified byte-identical
(`9622fa0a…5462` before and after each), the backup deleted, and
`git status --porcelain` empty. `app/package.json` was never left modified.

## Verification performed for this revision

- **Changed Pester suite alone** — `Invoke-Pester -Path scripts\test-reachability.Tests.ps1`:
  **4 passed, 0 failed.**
- **Full Pester gate** — `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/run-pester.ps1`:
  exit **0**, **`Passed: 955 Failed: 0 Skipped: 0 Pending: 0 Inconclusive: 0`**.
- **`git diff --check`** over the focused correction range and the full reviewed range
  from `34af8bf` — both clean (rc 0, no output).
- **`app/package.json` byte-identity** — empty diff vs `34af8bf`; SHA-256
  `9622fa0a…5462`.
- **`app/` tree comparison vs `34af8bf`** — empty; tree hash `e0aaaaab…db943` on both
  sides.
- **Worktree cleanliness** — `git status --porcelain` empty.

**No app gate was re-run for this revision and no clean app gate is claimed**, per
Blue's bounded non-attribution disposition above and the instruction not to spend
further app-gate runs. The authoritative gate-reliability record is the 20/20
measurement recorded above.

## Known limitations and open items

- **Gate reliability (open, priority above F5).** 20/20 full-chain runs on unmodified
  `34af8bf` failed at `dockview-bootstrap.test.js`. Root cause not established; the
  sample is an observed 20/20, not a generalized long-run rate.
- **`dockview-app-integration` maximize assertion (separate open item).** Observed once
  as `the maximized pane grew to the whole surface (100 -> 100)` with **no GPU
  evidence**, and **zero** times in the 20-run sample. Tracked separately from the
  bootstrap failure per amendment 1; **no common cause is inferred**.
- **Node-side duplicate acceptance (open follow-up).** Prioritized after gate
  reliability and before F5; not authorized or implemented here.
- Accepted matcher gap shared with the Node side: an entry naming the file without
  being its own bare invocation must collide exactly with
  `node test-reachability.test.js` to pass. The realistic failure mode guarded against
  is accidental disarming, not a crafted decoy.
- Case-sensitive (`-ceq`) and whitespace-trimmed per segment only; alternate valid
  invocations (e.g. `node ./test-reachability.test.js`) are not tolerated —
  consistent with the Node side's `wiredPkgPaths` set.

## Reviewer focus

- `scripts/test-reachability.Tests.ps1:62-97` — tokenization on `&&`, the `node `
  prefix strip, `-ceq` exactness, `$exact.Count -eq 1`, and that `$mentions` cannot
  influence `$exact`.
- The inbound integration: that `34af8bf` is a genuine ancestor, that
  `merge-base == 34af8bf`, and that the merge left the implementation untouched.
- That the reviewed delta from `34af8bf` contains only the two R1 files.
- The retained verdict and both retained dispositions, unaltered.
- **This document itself**, in-scope reviewed content.
- Proportionality: one `It` block changed in code, nothing else.

## Review artifacts

All prior artifacts are **preserved unchanged**. All are gitignored `.agent-review-*.diff`
files, not tracked content.

| # | File | Bytes | SHA-256 | Range |
| --- | --- | --- | --- | --- |
| 1 | `.agent-review-pester-reachability-exact-match.diff` | 2,943 | `6ac73e66bc6428deb11f541c8d415fef40764e85fd55d4d723b0f58de929bc44` | `8c6bfce...cf6c1a8` |
| 2 | `.agent-review-pester-reachability-exact-match.regen.diff` | 2,943 | `6ac73e66bc6428deb11f541c8d415fef40764e85fd55d4d723b0f58de929bc44` | same as 1 |
| 3 | `.agent-review-pester-reachability-exact-match-full.diff` | 16,034 | `23729b58e340547c33b8e25069af5099cf47ecb16c6cb08e33fd935a4cb086eb` | `8c6bfce...bc4fa45` |
| 4 | `.agent-review-pester-reachability-exact-match-full.regen.diff` | 16,034 | `23729b58e340547c33b8e25069af5099cf47ecb16c6cb08e33fd935a4cb086eb` | same as 3 |
| 5 | `.agent-review-pester-reachability-exact-match-r2.diff` | 19,044 | `4fa00564e2af6913a680008d6f3602ed2a4e0f01b87ed8f53274d2564f55f8f3` | `8c6bfce...4b63708` |
| 6 | `.agent-review-pester-reachability-exact-match-r2.regen.diff` | 19,044 | `4fa00564e2af6913a680008d6f3602ed2a4e0f01b87ed8f53274d2564f55f8f3` | same as 5 |

Artifacts 1–6 are pinned against the **historical fork point** `8c6bfce` and are
retained as history. They are **not** the artifact for this review.

**New pinned cumulative artifact for this review** — against the **reviewed base**
`34af8bf`, generated with `git diff --output` (never PowerShell redirection):
```
git diff 34af8bf340eaa518bca3b9aa7109025f47b8992d...<new reviewed tip> --output=.agent-review-pester-reachability-exact-match-r3.diff
```
Because `34af8bf` is now an ancestor of the branch tip, the three-dot and two-dot
forms are equivalent for this range. The artifact necessarily spans the commit
introducing this text, so its byte size and SHA-256 cannot be embedded in the document
it contains; its identity — exact byte size, SHA-256, and an empty binary comparison
against an independently generated twin
(`.agent-review-pester-reachability-exact-match-r3.regen.diff`) — is recorded in the
Builder's closing report and is reproducible by regenerating the same range.

Reviewer verdict: **FAIL (retained above).** No corrective PASS is claimed. There is
no verdict-only tail on this branch; every handoff revision is a content commit and
the corrective commit is the branch tip (`reviewedTip == branchTip`). A verdict tail
may MODIFY this file only after an independent PASS.
