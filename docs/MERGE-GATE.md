# Merge Gate v1 — `scripts/merge-gate.ps1`

A Windows PowerShell 5.1 helper that safely performs **one already-authorized local
`git merge --no-ff`**. It automates the *evidence checking* around a merge Blue has already
accepted, and the fixed post-merge gates. It does **not** decide whether work is accepted, perform
review, push, fetch, repair failures, or replace Blue's merge authority. The script contains no
push path.

## One invariant

The helper may merge exactly one named **local** branch tip into the exact synchronized `main`
named by the human, only when:

- the reviewed delta still matches its pinned diff **byte-for-byte**;
- the branch and handoff tail still match their accepted SHAs and policy;
- git predicts a **conflict-free deterministic merge tree** (`git merge-tree --write-tree`);
- all state remains unchanged after human confirmation (full re-preflight under a repository
  mutex, immediately before the merge);
- and the human explicitly authorizes `-Apply` with a typed confirmation bound to the plan-file
  SHA-256 and the branch tip.

Any discrepancy refuses visibly and exits non-zero. What the tool proves is *"deterministic
composition of independently reviewed inputs, gates green"* — never *"the merge is semantically
correct"*. Semantic composition risk (two individually-correct changes that auto-merge cleanly but
interact badly) is exactly why the app/pester gates run **after** the merge and why Blue's human
smoke test and sole merge/push authority remain in place.

## Usage

Preflight only (default — makes **no** changes to real refs, HEAD, index, working tree, or the
real Git object database; the predicted merge tree is written to a guarded temp
`GIT_OBJECT_DIRECTORY` and deleted afterward):

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File scripts\merge-gate.ps1 `
  -PlanPath .merge-gate\plan.psd1
```

Ends with `PREFLIGHT: PASS — no local merge performed` (exit 0) or a
`MERGE-GATE REFUSED: <exact failed invariant>` line (exit 1).

Actual execution (requires an interactive console; refuses redirected stdin; no `-Yes`, `-Force`,
environment, or noninteractive bypass exists):

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File scripts\merge-gate.ps1 `
  -PlanPath .merge-gate\plan.psd1 `
  -Apply
```

After the preflight summary it prompts for the typed confirmation:

```text
MERGE <first-16-plan-sha256-chars> <first-12-branch-tip-chars>
```

## The plan file — `.merge-gate/plan.psd1`

A PowerShell **data** file loaded only through `Import-PowerShellDataFile` (rejects duplicate
keys natively, cannot execute code, yields real types). `.merge-gate/` is gitignored and the
selected plan file must pass `git check-ignore` — plans are local authorizations, never
committable.

```powershell
@{
    schemaVersion         = 1
    expectedMainSha       = '<40-hex: current synchronized main>'
    expectedOriginMainSha = '<40-hex: must equal expectedMainSha>'
    documentationOnly     = $false

    branch                = 'feature/example'
    reviewedBase          = '<40-hex: fork point = merge-base(main, branchTip)>'
    reviewedTip           = '<40-hex: reviewed CODE tip = pinned-diff endpoint>'
    branchTip             = '<40-hex: local branch ref = merge parent 2>'

    handoffDoc            = 'docs/BUILDER-HANDOFF-example.md'
    pinnedDiff            = '.worktrees/example/.agent-review-example.diff'
    mergeMessage          = 'Merge example: bounded description'

    gates                 = @('app', 'pester')
}
```

Strictly validated: exact key set (unknown or missing keys refuse), `schemaVersion` exactly
integer `1`, `documentationOnly` a real boolean, every SHA a 40-hex **string** (normalized to
lowercase), bounded printable quote-free `mergeMessage`, forward-slash repository-relative paths
with no `..`/absolute/backslash tricks, and gates exactly `@('app','pester')` — or `@()` only
when `documentationOnly = $true` **and** every path in `reviewedBase..branchTip` is Markdown.
There are no configurable commands, hooks, or working directories anywhere in a plan.

## What preflight verifies

1. Current directory is the canonical repository root, and the unique
   `git worktree list --porcelain` record carrying `branch refs/heads/main` is that same root;
   branch `main` checked out; no detached HEAD.
2. `HEAD == expectedMainSha` and local `origin/main == expectedOriginMainSha` (no fetch is ever
   performed — only the local tracking ref is verified; freshness stays a human responsibility).
3. No merge/rebase/cherry-pick/revert/bisect in progress; no staged or tracked modifications; the
   only tolerated visible untracked entry is the literal repository-root `.worktrees/` container.
4. Branch policy: `refs/heads/<branch>` exists locally and equals `branchTip` exactly; `branchTip`
   is not already an ancestor of main; `reviewedTip` is `branchTip` or an ancestor;
   `reviewedBase` is an ancestor of `reviewedTip`; and
   `merge-base(expectedMainSha, branchTip) == reviewedBase` (an **advanced** main past the
   reviewed base — the K5 / Fast Clear shape — is valid; a moved fork point is not).
5. Handoff tail (`reviewedTip != branchTip`): at most 3 commits whose only change is a
   **modification** of the declared `docs/BUILDER-HANDOFF-*.md`, present as a regular `100644`
   blob at both endpoints. An empty tail is valid.
6. Pinned diff: a gitignored regular `.agent-review*.diff` file inside a registered worktree with
   no reparse point on its path; `git diff reviewedBase...reviewedTip --output=<temp>` is
   regenerated and compared **byte-for-byte** (length first, then buffered stream compare).
7. Predicted merge: `git merge-tree --write-tree expectedMainSha branchTip` must exit 0 (a
   predicted conflict refuses before any confirmation); the tree OID is captured and later must
   equal the actual merge tree.
8. A `Local\` named mutex derived from the canonical repository root serializes merge-gate
   invocations (nonblocking; contention refuses). The mutex cannot control a human git command or
   the app, so the complete preflight is **re-run under the mutex after confirmation** — plan
   re-hashed, every invariant re-proven — immediately before the merge.

Preflight output is metadata only: SHAs, counts, hashes, gate names — never diff contents,
terminal output, report/provider content, credentials, or environment values.

## Merge execution and verification

The only repository-history mutation in the tool:

```text
git merge --no-ff -m <validated-message> -- <validated-local-branch>
```

invoked directly with an argument array (no command string, no shell reparsing). After success it
requires: a two-parent merge commit; parent 1 == the recorded pre-merge main; parent 2 ==
`branchTip`; **actual merge tree == the preflighted predicted tree OID**; still on `main`; clean
tree. Then it runs the fixed gates in order (`npm.cmd test` from `app/`, then Windows PowerShell
`scripts\run-pester.ps1`) while still holding the mutex, and finishes with
`LOCAL MERGE COMPLETE — NOT PUSHED`.

## Failure behavior and human-controlled recovery

- **Preflight or confirmation failure** — no merge is made; the exact failed invariant prints;
  exit non-zero.
- **Conflict during merge** (git itself refused) — `git merge --abort` runs **only if
  `MERGE_HEAD` exists**; nothing is resolved, staged, stashed, cleaned, reset, or committed;
  branch/HEAD/status print, then `STOP — DO NOT PUSH`; exit non-zero.
- **Parent/tree verification failure or gate failure after the merge** — the local merge commit is
  **retained for human inspection**; the exact pre-merge SHA and merge SHA print, then
  `STOP — DO NOT PUSH`; nothing is reset or repaired automatically; exit non-zero.

Human-controlled rollback (never executed by the script): first inspect
`git status` and `git log --oneline -5`, confirm the printed **pre-merge SHA** is the commit you
expect main to return to and that no other work has landed on top, and only then — as a deliberate
human decision — run:

```powershell
git reset --hard <pre-merge-sha>   # destructive; verify the SHA first; human-only
```

Never push a retained failed merge. Never hide or downgrade an unexpected state — if merge-gate
printed a STOP banner, main is not in an accepted state until a human has looked.

## Manual acceptance demonstration (disposable, reserved for Blue)

Copyable end-to-end demo in a throwaway `%TEMP%` repository (leaf prefix
`bh-merge-gate-accept-`). It builds an **advanced-main** (K5/Fast Clear-shaped) fixture with a
local bare origin, a reviewed feature tip, a handoff tail, a pinned diff, and working stub gates,
then proves preflight mutates nothing, applies the merge with the typed confirmation, and proves
no push occurred.

```powershell
# --- setup -----------------------------------------------------------------------------------
$gate   = 'D:\Workspace\agent-command-center\.worktrees\merge-gate\scripts\merge-gate.ps1'  # after merge: scripts\merge-gate.ps1 on main
$stamp  = Get-Date -Format 'yyyyMMddHHmmss'
$fx     = Join-Path $env:TEMP ('bh-merge-gate-accept-' + $stamp)
$origin = Join-Path $env:TEMP ('bh-merge-gate-accept-' + $stamp + '-origin.git')
New-Item -ItemType Directory -Path $fx | Out-Null
git init --bare $origin
git -C $fx init -b main
git -C $fx config user.email 'accept@example.com'
git -C $fx config user.name 'MG Accept'
git -C $fx config core.autocrlf false
Set-Content (Join-Path $fx 'notes.txt') 'base'
New-Item -ItemType Directory (Join-Path $fx 'docs') | Out-Null
New-Item -ItemType Directory (Join-Path $fx 'app') | Out-Null
New-Item -ItemType Directory (Join-Path $fx 'scripts') | Out-Null
Set-Content (Join-Path $fx 'docs\BUILDER-HANDOFF-accept.md') 'handoff v0'
Set-Content (Join-Path $fx 'app\package.json') '{ "name": "accept", "version": "1.0.0", "scripts": { "test": "node -e \"process.exit(0)\"" } }'
Set-Content (Join-Path $fx 'scripts\run-pester.ps1') "Write-Host 'accept pester stub: PASS'; exit 0"
Set-Content (Join-Path $fx '.gitignore') ".agent-review*.diff`n.merge-gate/"
git -C $fx add -A; git -C $fx commit -m base
$base = git -C $fx rev-parse HEAD
git -C $fx switch -c feature/accept
Set-Content (Join-Path $fx 'feature.txt') 'feature work'
git -C $fx add -A; git -C $fx commit -m 'feature work'
$reviewedTip = git -C $fx rev-parse HEAD
Add-Content (Join-Path $fx 'docs\BUILDER-HANDOFF-accept.md') 'tail update'
git -C $fx add -A; git -C $fx commit -m 'handoff tail'
$branchTip = git -C $fx rev-parse HEAD
git -C $fx switch main
Set-Content (Join-Path $fx 'main-advance.txt') 'advanced'         # K5/Fast Clear shape
git -C $fx add -A; git -C $fx commit -m 'main advance'
git -C $fx remote add origin $origin
git -C $fx push -q origin main
$main = git -C $fx rev-parse HEAD
$diff = Join-Path $fx '.agent-review-accept.diff'
git -C $fx diff "$base...$reviewedTip" "--output=$diff"
New-Item -ItemType Directory (Join-Path $fx '.merge-gate') | Out-Null
@"
@{
    schemaVersion         = 1
    expectedMainSha       = '$main'
    expectedOriginMainSha = '$main'
    documentationOnly     = `$false
    branch                = 'feature/accept'
    reviewedBase          = '$base'
    reviewedTip           = '$reviewedTip'
    branchTip             = '$branchTip'
    handoffDoc            = 'docs/BUILDER-HANDOFF-accept.md'
    pinnedDiff            = '.agent-review-accept.diff'
    mergeMessage          = 'Merge accept: merge-gate demo'
    gates                 = @('app', 'pester')
}
"@ | Set-Content (Join-Path $fx '.merge-gate\plan.psd1') -Encoding Ascii

# --- 1) preflight, and prove it changed nothing ----------------------------------------------
Set-Location $fx
$refsBefore = (git for-each-ref) -join "`n"
$objBefore  = @(Get-ChildItem .git\objects -Recurse -File -Force).Count
powershell.exe -NoProfile -ExecutionPolicy Bypass -File $gate -PlanPath .merge-gate\plan.psd1
$refsAfter = (git for-each-ref) -join "`n"
$objAfter  = @(Get-ChildItem .git\objects -Recurse -File -Force).Count
"refs unchanged:    $($refsAfter -eq $refsBefore)"
"objects unchanged: $($objAfter -eq $objBefore) ($objBefore -> $objAfter)"
"status:"; git --no-optional-locks status --porcelain

# --- 2) apply: type the confirmation line the script prints ----------------------------------
powershell.exe -NoProfile -ExecutionPolicy Bypass -File $gate -PlanPath .merge-gate\plan.psd1 -Apply

# --- 3) verify parents, predicted/actual tree equality, and that no push occurred ------------
git log --oneline -3
"parent1 ok: $((git rev-parse HEAD^1) -eq $main)"
"parent2 ok: $((git rev-parse HEAD^2) -eq $branchTip)"
git rev-parse 'HEAD^{tree}'    # compare to the predicted/actual tree lines in the output above
"origin untouched: $((git --git-dir=$origin rev-parse main) -eq $main)"

# --- 4) guarded cleanup ----------------------------------------------------------------------
Set-Location $env:TEMP
$tempCanon = [System.IO.Path]::GetTempPath().TrimEnd('\')
foreach ($p in @($fx, $origin)) {
    $canon = [System.IO.Path]::GetFullPath($p).TrimEnd('\')
    if ([string]::Equals((Split-Path -Parent $canon), $tempCanon, [System.StringComparison]::OrdinalIgnoreCase) -and
        (Split-Path -Leaf $canon).StartsWith('bh-merge-gate-accept-')) {
        Remove-Item -LiteralPath $canon -Recurse -Force
    } else {
        Write-Host "REFUSED cleanup (guard failed): $canon"
    }
}
```

Do **not** run `-Apply` against the real Blue Helm repository while the merge-gate branch itself
is being built or reviewed.

## Forbidden operations (by design and by test)

No production path invokes `git push`/`fetch`/`pull`, `reset`, `clean`, `stash`, `add`, `commit`,
`checkout`/`switch`, branch deletion, `worktree add/remove/prune`, arbitrary commands from the
plan, `cmd.exe`, `Invoke-Expression`, or any repository/worktree recursive deletion. The only
recursive deletion anywhere is the strictly guarded temp object directory
(`%TEMP%\bh-merge-gate-objects-*`) created by the current invocation. These properties are pinned
by source-invariant tests in `scripts/merge-gate.Tests.ps1`.
