#Requires -Version 5.1
<#
.SYNOPSIS
  Merge Gate v1 - safely perform ONE already-authorized local `git merge --no-ff`.
.DESCRIPTION
  Blue (the human) stays the only merge authority. This helper automates the EVIDENCE CHECKING
  around a merge Blue has already accepted, then - only with an interactive typed confirmation -
  performs exactly one local --no-ff merge and runs the fixed gates. It never decides acceptance,
  never reviews, never pushes/fetches, never repairs a failure, and refuses visibly on the first
  discrepancy.

  Default invocation is PREFLIGHT-ONLY and makes no changes to real refs, HEAD, the index, the
  working tree, or the real Git object database (the predicted merge tree is written to a guarded
  temp GIT_OBJECT_DIRECTORY and deleted afterward):

    powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\merge-gate.ps1 -PlanPath .merge-gate\plan.psd1

  Actual execution additionally requires -Apply plus a typed confirmation bound to the plan-file
  SHA-256 and the branch tip:

    powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\merge-gate.ps1 -PlanPath .merge-gate\plan.psd1 -Apply

  Core invariant: merge exactly one named LOCAL branch tip into the exact synchronized main named
  by the human, only when the reviewed delta still byte-matches its pinned diff, the branch and
  handoff tail still match their accepted SHAs and policy, git predicts a conflict-free
  deterministic merge tree, all state is unchanged after confirmation (full re-preflight under a
  repository mutex), and the human explicitly authorized -Apply. The applied merge is then proven
  to be that prediction: two parents (pre-merge main, branchTip) and an actual merge tree equal to
  the preflighted merge-tree OID. What the tool proves is "deterministic composition of reviewed
  inputs, gates green" - never "the merge is semantically correct"; that stays with the human.

  Failure behavior and human-controlled recovery are documented in docs/MERGE-GATE.md.
  This script contains no push path.
#>
[CmdletBinding()]
param(
    [string]$PlanPath = '.merge-gate\plan.psd1',
    [switch]$Apply
)

$ErrorActionPreference = 'Stop'
if ($MyInvocation.InvocationName -ne '.') { Set-StrictMode -Version 2.0 }

$script:MergeGateScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
. (Join-Path $script:MergeGateScriptRoot 'lib\merge-gate-plan.ps1')

$script:MergeGateMaxTailCommits    = 3                          # (?) handoff-tail cap above the reviewed tip
$script:MergeGateTempObjectsPrefix = 'bh-merge-gate-objects-'   # guarded temp GIT_OBJECT_DIRECTORY leaf prefix
$script:MergeGateTempDiffPrefix    = 'bh-merge-gate-diff-'      # guarded temp regenerated-diff file leaf prefix
$script:MergeGateEmDash            = [string][char]0x2014

# ---------------------------------------------------------------------------------------------
# Output + primitive helpers
# ---------------------------------------------------------------------------------------------

function Write-MergeGateOutput {
    # Every user-visible line goes through here (single seam; tests capture it).
    param([Parameter(Mandatory = $true)][AllowEmptyString()][string]$Message)
    Write-Host $Message
}

function Invoke-Git {
    <# Run git with a literal argument ARRAY - no command strings and no shell reparsing layer
       anywhere. stderr is merged into the captured text; the exit code decides. #>
    param([Parameter(Mandatory = $true)][string[]]$GitArgs)
    $ErrorActionPreference = 'Continue'   # scope-local: native stderr records must not terminate
    $raw = & git @GitArgs 2>&1
    $code = $LASTEXITCODE
    $lines = New-Object System.Collections.Generic.List[string]
    foreach ($item in @($raw)) {
        if ($null -eq $item) { continue }
        $lines.Add([string]$item)
    }
    return New-Object psobject -Property @{
        ExitCode = $code
        Lines    = $lines.ToArray()
        Text     = ($lines.ToArray() -join "`n")
    }
}

function Get-MergeGateCanonicalPath {
    # Full, separator-normalized, trailing-separator-trimmed path. Relative input resolves against
    # the PowerShell location (NOT the process CWD, which PS does not keep in sync).
    param([Parameter(Mandatory = $true)][string]$Path)
    $p = $Path -replace '/', '\'
    if (-not [System.IO.Path]::IsPathRooted($p)) { $p = Join-Path (Get-Location).Path $p }
    return [System.IO.Path]::GetFullPath($p).TrimEnd('\')
}

function Test-MergeGateSamePath {
    param([Parameter(Mandatory = $true)][string]$PathA, [Parameter(Mandatory = $true)][string]$PathB)
    return [string]::Equals($PathA, $PathB, [System.StringComparison]::OrdinalIgnoreCase)
}

function Get-MergeGateSha {
    # Resolve one git query that must yield a single SHA line; refuse anything else.
    param(
        [Parameter(Mandatory = $true)][string[]]$GitArgs,
        [Parameter(Mandatory = $true)][string]$What
    )
    $r = Invoke-Git -GitArgs $GitArgs
    if ($r.ExitCode -ne 0 -or $r.Lines.Count -lt 1) { throw ('REFUSED: could not resolve ' + $What) }
    $sha = $r.Lines[0].Trim().ToLowerInvariant()
    if ($sha -notmatch '^[0-9a-f]{40}$') { throw ('REFUSED: unexpected git output while resolving ' + $What) }
    return $sha
}

# ---------------------------------------------------------------------------------------------
# Repository resolution + mutex
# ---------------------------------------------------------------------------------------------

function Get-MergeGateWorktreeRecords {
    # Parse `git worktree list --porcelain` by RECORDS (blank-line separated), never by row order.
    $r = Invoke-Git -GitArgs @('worktree', 'list', '--porcelain')
    if ($r.ExitCode -ne 0) { throw 'REFUSED: git worktree list --porcelain failed' }
    $records = @()
    $cur = $null
    foreach ($line in $r.Lines) {
        if ($line -eq '') {
            if ($null -ne $cur) { $records += $cur; $cur = $null }
            continue
        }
        if ($line.StartsWith('worktree ')) {
            if ($null -ne $cur) { $records += $cur }
            $cur = @{ Path = $line.Substring(9); Branch = $null; Detached = $false }
            continue
        }
        if ($null -eq $cur) { continue }
        if ($line.StartsWith('branch ')) { $cur.Branch = $line.Substring(7) }
        elseif ($line -eq 'detached') { $cur.Detached = $true }
    }
    if ($null -ne $cur) { $records += $cur }
    return , $records
}

function Resolve-MergeGateRepository {
    <# Establish repository identity: the current PowerShell location must BE the canonical root of
       the main worktree. Returns a context with canonical Root/GitDir/CommonDir/ObjectsDir and the
       canonical registered worktree paths (used for the temp-cleanup overlap guard). #>
    $top = Invoke-Git -GitArgs @('rev-parse', '--show-toplevel')
    if ($top.ExitCode -ne 0 -or $top.Lines.Count -lt 1) { throw 'REFUSED: current directory is not inside a Git repository' }
    $root = Get-MergeGateCanonicalPath -Path $top.Lines[0].Trim()
    $cwd = Get-MergeGateCanonicalPath -Path (Get-Location).Path
    if (-not (Test-MergeGateSamePath -PathA $root -PathB $cwd)) {
        throw ('REFUSED: run from the canonical repository root (' + $root + '); current directory is ' + $cwd)
    }

    $gd = Invoke-Git -GitArgs @('rev-parse', '--git-dir')
    if ($gd.ExitCode -ne 0 -or $gd.Lines.Count -lt 1) { throw 'REFUSED: could not resolve the git directory' }
    $gitDir = Get-MergeGateCanonicalPath -Path $gd.Lines[0].Trim()

    $cd = Invoke-Git -GitArgs @('rev-parse', '--git-common-dir')
    if ($cd.ExitCode -ne 0 -or $cd.Lines.Count -lt 1) { throw 'REFUSED: could not resolve the git common directory' }
    $commonDir = Get-MergeGateCanonicalPath -Path $cd.Lines[0].Trim()

    $objectsDir = Join-Path $commonDir 'objects'
    if (-not (Test-Path -LiteralPath $objectsDir -PathType Container)) {
        throw ('REFUSED: git object directory not found: ' + $objectsDir)
    }

    $worktreePaths = @()
    foreach ($rec in (Get-MergeGateWorktreeRecords)) {
        $worktreePaths += (Get-MergeGateCanonicalPath -Path $rec.Path)
    }

    return New-Object psobject -Property @{
        Root          = $root
        GitDir        = $gitDir
        CommonDir     = $commonDir
        ObjectsDir    = (Get-MergeGateCanonicalPath -Path $objectsDir)
        WorktreePaths = $worktreePaths
    }
}

function Get-MergeGateMutexName {
    # Session-local named mutex derived from the canonical repository root. Local\ (not Global\):
    # cross-session exclusion is not a property this tool can honestly promise anyway - immediate
    # TOCTOU rechecks under the mutex are the real protection.
    param([Parameter(Mandatory = $true)][string]$CanonicalRoot)
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($CanonicalRoot.ToLowerInvariant())
    $sha = [System.Security.Cryptography.SHA256]::Create()
    try { $hash = $sha.ComputeHash($bytes) } finally { $sha.Dispose() }
    $hex = ([System.BitConverter]::ToString($hash) -replace '-', '').ToLowerInvariant()
    return 'Local\bh-merge-gate-' + $hex
}

function Enter-MergeGateMutex {
    # Nonblocking acquire; contention is an immediate refusal, never a wait.
    param([Parameter(Mandatory = $true)]$Repo)
    $name = Get-MergeGateMutexName -CanonicalRoot $Repo.Root
    $mutex = New-Object System.Threading.Mutex($false, $name)
    $acquired = $false
    try { $acquired = $mutex.WaitOne(0) }
    catch [System.Threading.AbandonedMutexException] { $acquired = $true }
    if (-not $acquired) {
        $mutex.Dispose()
        throw 'REFUSED: another merge-gate invocation holds the repository mutex'
    }
    return $mutex
}

function Exit-MergeGateMutex {
    param($Mutex)
    if ($null -ne $Mutex) {
        [void]$Mutex.ReleaseMutex()
        $Mutex.Dispose()
    }
}

# ---------------------------------------------------------------------------------------------
# Plan context
# ---------------------------------------------------------------------------------------------

function Read-MergeGatePlanContext {
    <# Resolve, gitignore-verify, hash, and strictly validate the plan file. The SHA-256 is over
       the exact file bytes and later binds the typed confirmation to THIS plan content. #>
    param(
        [Parameter(Mandatory = $true)]$Repo,
        [Parameter(Mandatory = $true)][string]$PlanPath
    )
    if ([string]::IsNullOrWhiteSpace($PlanPath)) { throw 'REFUSED: -PlanPath is empty' }
    $full = Get-MergeGateCanonicalPath -Path $PlanPath
    if (-not (Test-Path -LiteralPath $full -PathType Leaf)) { throw ('REFUSED: plan file not found: ' + $full) }
    if ($full -notmatch '\.psd1$') { throw 'REFUSED: plan file must be a .psd1 PowerShell data file' }
    if (-not $full.StartsWith($Repo.Root + '\', [System.StringComparison]::OrdinalIgnoreCase)) {
        throw ('REFUSED: plan file must live inside the repository: ' + $full)
    }
    $rel = $full.Substring($Repo.Root.Length + 1) -replace '\\', '/'
    # The plan (like the pinned review diffs) is a local artifact and must never be committable.
    $ci = Invoke-Git -GitArgs @('check-ignore', '-q', '--', $rel)
    if ($ci.ExitCode -ne 0) {
        throw ('REFUSED: plan file is not gitignored: ' + $rel + ' (add .merge-gate/ to .gitignore)')
    }
    $hash = Get-MergeGateFileSha256 -LiteralPath $full
    $data = ConvertFrom-MergeGatePlanFile -LiteralPath $full
    return New-Object psobject -Property @{ File = $full; RelPath = $rel; PlanHash = $hash; Data = $data }
}

# ---------------------------------------------------------------------------------------------
# Preflight checks
# ---------------------------------------------------------------------------------------------

function Assert-MergeGateCleanState {
    # --no-optional-locks keeps `git status` from opportunistically rewriting the index, preserving
    # the preflight promise of zero index mutation. The ONLY tolerated untracked entry is the
    # literal repository-root .worktrees/ container.
    $st = Invoke-Git -GitArgs @('--no-optional-locks', 'status', '--porcelain')
    if ($st.ExitCode -ne 0) { throw 'REFUSED: git status failed' }
    foreach ($line in $st.Lines) {
        if ($line -eq '') { continue }
        if ($line -ceq '?? .worktrees/') { continue }
        throw ('REFUSED: working tree is not clean (unexpected status entry: ' + $line + ')')
    }
}

function Assert-MergeGateNoOperationInProgress {
    param([Parameter(Mandatory = $true)]$Repo)
    foreach ($state in @('MERGE_HEAD', 'CHERRY_PICK_HEAD', 'REVERT_HEAD', 'BISECT_LOG', 'REBASE_HEAD')) {
        if (Test-Path -LiteralPath (Join-Path $Repo.GitDir $state)) {
            throw ('REFUSED: an operation is in progress (' + $state + ' exists)')
        }
    }
    foreach ($stateDir in @('rebase-merge', 'rebase-apply')) {
        if (Test-Path -LiteralPath (Join-Path $Repo.GitDir $stateDir)) {
            throw ('REFUSED: a rebase is in progress (' + $stateDir + ' exists)')
        }
    }
}

function Test-MergeGateFilesEqual {
    # True byte-for-byte comparison: length first, then fixed-size buffered stream compare.
    # (A whole-file hash alone is deliberately NOT the mechanism.)
    param(
        [Parameter(Mandatory = $true)][string]$PathA,
        [Parameter(Mandatory = $true)][string]$PathB
    )
    $ia = Get-Item -LiteralPath $PathA -Force
    $ib = Get-Item -LiteralPath $PathB -Force
    if ($ia.Length -ne $ib.Length) { return $false }
    $sa = [System.IO.File]::Open($PathA, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::Read)
    try {
        $sb = [System.IO.File]::Open($PathB, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::Read)
        try {
            $bufA = New-Object byte[] 65536
            $bufB = New-Object byte[] 65536
            while ($true) {
                $ra = $sa.Read($bufA, 0, $bufA.Length)
                $rb = $sb.Read($bufB, 0, $bufB.Length)
                if ($ra -ne $rb) { return $false }
                if ($ra -eq 0) { return $true }
                if ($ra -eq $bufA.Length) {
                    if (-not [System.Linq.Enumerable]::SequenceEqual($bufA, $bufB)) { return $false }
                } else {
                    for ($i = 0; $i -lt $ra; $i++) {
                        if ($bufA[$i] -ne $bufB[$i]) { return $false }
                    }
                }
            }
        } finally { $sb.Dispose() }
    } finally { $sa.Dispose() }
}

function Assert-MergeGatePinnedDiff {
    <# The pinned review diff is the evidence that what merges is what was reviewed. Validate its
       location/identity, then REGENERATE reviewedBase...reviewedTip with `git diff --output` into
       a guarded temp file and byte-compare. Returns metadata for the summary. #>
    param(
        [Parameter(Mandatory = $true)]$Repo,
        [Parameter(Mandatory = $true)]$Plan
    )
    $relWin = $Plan.pinnedDiff -replace '/', '\'
    $full = Get-MergeGateCanonicalPath -Path (Join-Path $Repo.Root $relWin)
    if (-not (Test-Path -LiteralPath $full -PathType Leaf)) { throw ('REFUSED: pinned diff not found: ' + $Plan.pinnedDiff) }
    $leaf = Split-Path -Leaf $full
    if ($leaf -notmatch '^\.agent-review.*\.diff$') { throw 'REFUSED: pinned diff filename must match .agent-review*.diff' }

    # No reparse point (symlink/junction) anywhere along the repo-relative component chain.
    $walk = $Repo.Root
    foreach ($seg in ($relWin -split '\\')) {
        $walk = Join-Path $walk $seg
        $item = Get-Item -LiteralPath $walk -Force -ErrorAction Stop
        if (($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
            throw ('REFUSED: pinned diff path contains a reparse point: ' + $walk)
        }
    }

    # Must resolve inside a REGISTERED worktree (fresh porcelain read, not the cached resolve).
    $inside = $false
    foreach ($rec in (Get-MergeGateWorktreeRecords)) {
        $wt = Get-MergeGateCanonicalPath -Path $rec.Path
        if ($full.StartsWith($wt + '\', [System.StringComparison]::OrdinalIgnoreCase)) { $inside = $true; break }
    }
    if (-not $inside) { throw ('REFUSED: pinned diff is not inside a registered worktree: ' + $Plan.pinnedDiff) }

    $ci = Invoke-Git -GitArgs @('check-ignore', '-q', '--', $Plan.pinnedDiff)
    if ($ci.ExitCode -ne 0) { throw ('REFUSED: pinned diff is not gitignored: ' + $Plan.pinnedDiff) }

    $tempParent = Get-MergeGateCanonicalPath -Path ([System.IO.Path]::GetTempPath())
    $tmp = Join-Path $tempParent ($script:MergeGateTempDiffPrefix + [guid]::NewGuid().ToString('N') + '.tmp')
    try {
        $d = Invoke-Git -GitArgs @('diff', ($Plan.reviewedBase + '...' + $Plan.reviewedTip), ('--output=' + $tmp))
        if ($d.ExitCode -ne 0) { throw ('REFUSED: could not regenerate the reviewed diff (git diff exit ' + $d.ExitCode + ')') }
        if (-not (Test-MergeGateFilesEqual -PathA $tmp -PathB $full)) {
            throw 'REFUSED: pinned diff does not byte-match the regenerated reviewedBase...reviewedTip diff'
        }
    } finally {
        # Single-file temp cleanup, guarded to our own leaf under %TEMP% (never recursive).
        if (Test-Path -LiteralPath $tmp -PathType Leaf) {
            $tCanon = Get-MergeGateCanonicalPath -Path $tmp
            if ((Test-MergeGateSamePath -PathA (Split-Path -Parent $tCanon) -PathB $tempParent) -and
                (Split-Path -Leaf $tCanon).StartsWith($script:MergeGateTempDiffPrefix)) {
                Remove-Item -LiteralPath $tCanon -Force
            }
        }
    }
    return @{
        Bytes  = (Get-Item -LiteralPath $full -Force).Length
        Sha256 = (Get-MergeGateFileSha256 -LiteralPath $full)
        Path   = $full
    }
}

function Remove-MergeGateTempObjectDirectory {
    <# The ONLY recursive deletion in this tool. Refuses (skips, visibly) unless the target is a
       non-reparse directory directly under %TEMP% whose leaf carries our prefix and which overlaps
       no repository path. Git writes loose objects read-only, so file attributes are normalized
       first. #>
    param(
        [Parameter(Mandatory = $true)]$Repo,
        [Parameter(Mandatory = $true)][string]$Path
    )
    if (-not (Test-Path -LiteralPath $Path)) { return }
    $canon = Get-MergeGateCanonicalPath -Path $Path
    $tempParent = Get-MergeGateCanonicalPath -Path ([System.IO.Path]::GetTempPath())
    $parent = Split-Path -Parent $canon
    $leaf = Split-Path -Leaf $canon

    $guardFail = $null
    if (-not (Test-MergeGateSamePath -PathA $parent -PathB $tempParent)) { $guardFail = 'parent is not %TEMP%' }
    elseif (-not $leaf.StartsWith($script:MergeGateTempObjectsPrefix)) { $guardFail = 'unexpected directory name' }
    else {
        $item = Get-Item -LiteralPath $canon -Force
        if (($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
            $guardFail = 'directory is a reparse point'
        } else {
            foreach ($protected in (@($Repo.Root, $Repo.GitDir, $Repo.CommonDir, $Repo.ObjectsDir) + @($Repo.WorktreePaths))) {
                if (Test-MergeGateSamePath -PathA $canon -PathB (Get-MergeGateCanonicalPath -Path $protected)) {
                    $guardFail = 'path overlaps a repository location'
                    break
                }
            }
        }
    }
    if ($null -ne $guardFail) {
        # Leaving a temp directory behind is safe; deleting the wrong thing is not. Surface it.
        Write-MergeGateOutput ('WARNING: refused temp object cleanup (' + $guardFail + '): ' + $canon)
        return
    }
    foreach ($f in @(Get-ChildItem -LiteralPath $canon -Recurse -Force | Where-Object { -not $_.PSIsContainer })) {
        if (($f.Attributes -band [System.IO.FileAttributes]::ReadOnly) -ne 0) {
            $f.Attributes = [System.IO.FileAttributes]::Normal
        }
    }
    Remove-Item -LiteralPath $canon -Recurse -Force
}

function Get-MergeGatePredictedTree {
    <# Preflight the exact proposed merge with `git merge-tree --write-tree`. The tree objects it
       writes land in a guarded temp GIT_OBJECT_DIRECTORY (real objects readable via
       GIT_ALTERNATE_OBJECT_DIRECTORIES), so the REAL object database is never touched; the temp
       directory is removed in finally on success and failure alike. Exit 1 means git predicts a
       conflict - an immediate refusal, before any confirmation. #>
    param(
        [Parameter(Mandatory = $true)]$Repo,
        [Parameter(Mandatory = $true)][string]$MainSha,
        [Parameter(Mandatory = $true)][string]$BranchTip
    )
    $tempParent = Get-MergeGateCanonicalPath -Path ([System.IO.Path]::GetTempPath())
    $tempObjects = Join-Path $tempParent ($script:MergeGateTempObjectsPrefix + [guid]::NewGuid().ToString('N'))
    [void](New-Item -ItemType Directory -Path $tempObjects)
    $prevObj = $env:GIT_OBJECT_DIRECTORY
    $prevAlt = $env:GIT_ALTERNATE_OBJECT_DIRECTORIES
    try {
        $env:GIT_OBJECT_DIRECTORY = $tempObjects
        $env:GIT_ALTERNATE_OBJECT_DIRECTORIES = $Repo.ObjectsDir
        $mt = Invoke-Git -GitArgs @('merge-tree', '--write-tree', $MainSha, $BranchTip)
        if ($mt.ExitCode -eq 1) {
            throw ('REFUSED: git merge-tree predicts a merge conflict between main and branchTip' + "`n" + $mt.Text)
        }
        if ($mt.ExitCode -ne 0) { throw ('REFUSED: git merge-tree failed (exit ' + $mt.ExitCode + ')') }
        if ($mt.Lines.Count -lt 1) { throw 'REFUSED: git merge-tree returned no output' }
        $tree = $mt.Lines[0].Trim().ToLowerInvariant()
        if ($tree -notmatch '^[0-9a-f]{40}$') { throw 'REFUSED: git merge-tree did not return a tree OID' }
        return $tree
    } finally {
        $env:GIT_OBJECT_DIRECTORY = $prevObj
        $env:GIT_ALTERNATE_OBJECT_DIRECTORIES = $prevAlt
        Remove-MergeGateTempObjectDirectory -Repo $Repo -Path $tempObjects
    }
}

function Invoke-MergeGatePreflightCore {
    <# The complete read-only invariant sweep. Throws 'REFUSED: ...' on the first discrepancy.
       Called once before the summary/confirmation and re-run IN FULL under the mutex before the
       actual merge (TOCTOU protection). Returns predicted tree + evidence metadata. #>
    param(
        [Parameter(Mandatory = $true)]$Repo,
        [Parameter(Mandatory = $true)]$PlanCtx
    )
    $plan = $PlanCtx.Data

    # --- main worktree identity ---
    $records = Get-MergeGateWorktreeRecords
    $mainRecords = @($records | Where-Object { $_.Branch -ceq 'refs/heads/main' })
    if ($mainRecords.Count -ne 1) {
        throw ('REFUSED: expected exactly one worktree on refs/heads/main, found ' + $mainRecords.Count)
    }
    $mainPath = Get-MergeGateCanonicalPath -Path $mainRecords[0].Path
    if (-not (Test-MergeGateSamePath -PathA $mainPath -PathB $Repo.Root)) {
        throw ('REFUSED: the refs/heads/main worktree is ' + $mainPath + ', not the current root ' + $Repo.Root)
    }
    $symRef = Invoke-Git -GitArgs @('symbolic-ref', '--quiet', 'HEAD')
    if ($symRef.ExitCode -ne 0 -or $symRef.Lines.Count -lt 1) { throw 'REFUSED: HEAD is detached; expected branch main' }
    $refName = $symRef.Lines[0].Trim()
    if ($refName -cne 'refs/heads/main') { throw ('REFUSED: checked-out branch is ' + $refName + '; expected refs/heads/main') }

    # --- exact starting state ---
    $head = Get-MergeGateSha -GitArgs @('rev-parse', '--verify', 'HEAD') -What 'HEAD'
    if ($head -ne $plan.expectedMainSha) {
        throw ('REFUSED: HEAD is ' + $head + ' but plan expectedMainSha is ' + $plan.expectedMainSha)
    }
    # Local tracking ref only - this tool never fetches; freshness stays a human responsibility.
    $origin = Get-MergeGateSha -GitArgs @('rev-parse', '--verify', 'refs/remotes/origin/main') -What 'refs/remotes/origin/main'
    if ($origin -ne $plan.expectedOriginMainSha) {
        throw ('REFUSED: local origin/main is ' + $origin + ' but plan expectedOriginMainSha is ' + $plan.expectedOriginMainSha)
    }

    Assert-MergeGateNoOperationInProgress -Repo $Repo
    Assert-MergeGateCleanState

    # --- branch policy ---
    $crf = Invoke-Git -GitArgs @('check-ref-format', '--branch', $plan.branch)
    if ($crf.ExitCode -ne 0) { throw ('REFUSED: branch name fails git check-ref-format: ' + $plan.branch) }
    $branchRef = 'refs/heads/' + $plan.branch
    $branchSha = Get-MergeGateSha -GitArgs @('rev-parse', '--verify', $branchRef) -What $branchRef
    if ($branchSha -ne $plan.branchTip) {
        throw ('REFUSED: local ' + $branchRef + ' is ' + $branchSha + ' but plan branchTip is ' + $plan.branchTip)
    }
    $anc = Invoke-Git -GitArgs @('merge-base', '--is-ancestor', $plan.branchTip, $plan.expectedMainSha)
    if ($anc.ExitCode -eq 0) { throw 'REFUSED: branchTip is already an ancestor of main (nothing to merge)' }
    if ($anc.ExitCode -ne 1) { throw ('REFUSED: git merge-base --is-ancestor failed (exit ' + $anc.ExitCode + ')') }
    $ancTip = Invoke-Git -GitArgs @('merge-base', '--is-ancestor', $plan.reviewedTip, $plan.branchTip)
    if ($ancTip.ExitCode -ne 0) { throw 'REFUSED: reviewedTip is not branchTip or an ancestor of it' }
    $ancBase = Invoke-Git -GitArgs @('merge-base', '--is-ancestor', $plan.reviewedBase, $plan.reviewedTip)
    if ($ancBase.ExitCode -ne 0) { throw 'REFUSED: reviewedBase is not an ancestor of reviewedTip' }
    # The advanced-main composition invariant: the branch forked at exactly the reviewed base.
    # (main itself advancing past the base via other gated merges is VALID - K5/Fast Clear shape.)
    $mb = Get-MergeGateSha -GitArgs @('merge-base', $plan.expectedMainSha, $plan.branchTip) -What 'merge-base(main, branchTip)'
    if ($mb -ne $plan.reviewedBase) {
        throw ('REFUSED: merge-base(main, branchTip) is ' + $mb + ' but plan reviewedBase is ' + $plan.reviewedBase)
    }

    # --- handoff tail policy (the only permitted commits above the reviewed CODE tip) ---
    $tailCount = 0
    if ($plan.reviewedTip -ne $plan.branchTip) {
        $rc = Invoke-Git -GitArgs @('rev-list', '--count', ($plan.reviewedTip + '..' + $plan.branchTip))
        if ($rc.ExitCode -ne 0 -or $rc.Lines.Count -lt 1) { throw 'REFUSED: could not count the handoff tail' }
        $tailCount = [int]$rc.Lines[0].Trim()
        if ($tailCount -lt 1 -or $tailCount -gt $script:MergeGateMaxTailCommits) {
            throw ('REFUSED: handoff tail has ' + $tailCount + ' commits (allowed 1..' + $script:MergeGateMaxTailCommits + ')')
        }
        $ns = Invoke-Git -GitArgs @('diff', '--name-status', '--no-renames', $plan.reviewedTip, $plan.branchTip)
        if ($ns.ExitCode -ne 0) { throw 'REFUSED: could not diff the handoff tail' }
        foreach ($line in $ns.Lines) {
            if ($line -eq '') { continue }
            $parts = $line -split "`t"
            if ($parts.Count -ne 2 -or $parts[0] -cne 'M' -or $parts[1] -cne $plan.handoffDoc) {
                throw ('REFUSED: handoff tail may only MODIFY ' + $plan.handoffDoc + ' (found: ' + $line + ')')
            }
        }
        foreach ($endpoint in @($plan.reviewedTip, $plan.branchTip)) {
            $ls = Invoke-Git -GitArgs @('ls-tree', $endpoint, '--', $plan.handoffDoc)
            if ($ls.ExitCode -ne 0 -or $ls.Lines.Count -lt 1) {
                throw ('REFUSED: ' + $plan.handoffDoc + ' does not exist at ' + $endpoint)
            }
            if ($ls.Lines[0] -notmatch '^100644 blob [0-9a-f]{40}\t') {
                throw ('REFUSED: ' + $plan.handoffDoc + ' is not a regular 100644 blob at ' + $endpoint + ' (' + $ls.Lines[0] + ')')
            }
        }
    }

    # --- documentation-only policy (the only case where gates may be empty) ---
    if (@($plan.gates).Count -eq 0) {
        $names = Invoke-Git -GitArgs @('diff', '--name-only', '--no-renames', $plan.reviewedBase, $plan.branchTip)
        if ($names.ExitCode -ne 0) { throw 'REFUSED: could not enumerate the documentation-only range' }
        foreach ($line in $names.Lines) {
            if ($line -eq '') { continue }
            if ($line -notmatch '\.md$') {
                throw ('REFUSED: documentationOnly plan touches a non-Markdown path: ' + $line)
            }
        }
    }

    # --- pinned review-diff evidence ---
    $pin = Assert-MergeGatePinnedDiff -Repo $Repo -Plan $plan

    # --- predicted deterministic merge tree ---
    $predicted = Get-MergeGatePredictedTree -Repo $Repo -MainSha $plan.expectedMainSha -BranchTip $plan.branchTip

    return New-Object psobject -Property @{
        PredictedTree    = $predicted
        TailCount        = $tailCount
        PinnedDiffBytes  = $pin.Bytes
        PinnedDiffSha256 = $pin.Sha256
    }
}

# ---------------------------------------------------------------------------------------------
# Output blocks
# ---------------------------------------------------------------------------------------------

function Write-MergeGateSummary {
    # Metadata only: SHAs, counts, hashes, gate names. Never terminal output, report/provider
    # content, credentials, environment values, or diff contents.
    param(
        [Parameter(Mandatory = $true)]$PlanCtx,
        [Parameter(Mandatory = $true)]$Pre
    )
    $plan = $PlanCtx.Data
    $gatesText = if (@($plan.gates).Count -eq 0) { '(none - documentation-only)' } else { @($plan.gates) -join ', ' }
    Write-MergeGateOutput 'merge-gate preflight summary'
    Write-MergeGateOutput ('  plan file        : ' + $PlanCtx.RelPath)
    Write-MergeGateOutput ('  plan sha256      : ' + $PlanCtx.PlanHash)
    Write-MergeGateOutput ('  expected main    : ' + $plan.expectedMainSha)
    Write-MergeGateOutput ('  expected origin  : ' + $plan.expectedOriginMainSha + ' (local tracking ref only; no fetch performed)')
    Write-MergeGateOutput ('  branch           : ' + $plan.branch)
    Write-MergeGateOutput ('  reviewed base    : ' + $plan.reviewedBase)
    Write-MergeGateOutput ('  reviewed tip     : ' + $plan.reviewedTip)
    Write-MergeGateOutput ('  branch tip       : ' + $plan.branchTip)
    Write-MergeGateOutput ('  handoff tail     : ' + $Pre.TailCount + ' commit(s)')
    Write-MergeGateOutput ('  pinned diff      : ' + $Pre.PinnedDiffBytes + ' bytes, sha256 ' + $Pre.PinnedDiffSha256)
    Write-MergeGateOutput ('  predicted tree   : ' + $Pre.PredictedTree)
    Write-MergeGateOutput ('  gates            : ' + $gatesText)
}

function Write-MergeGateStopBanner {
    param(
        [Parameter(Mandatory = $true)][string]$PreMergeSha,
        [Parameter(Mandatory = $true)][string]$MergeShaText
    )
    Write-MergeGateOutput ('pre-merge main SHA : ' + $PreMergeSha)
    Write-MergeGateOutput ('merge commit SHA   : ' + $MergeShaText)
    Write-MergeGateOutput ('STOP ' + $script:MergeGateEmDash + ' DO NOT PUSH')
}

# ---------------------------------------------------------------------------------------------
# Interactive confirmation (test seam; no bypass exists)
# ---------------------------------------------------------------------------------------------

function Assert-MergeGateInteractiveConsole {
    # -Apply demands a human at a console. There is deliberately no -Yes/-Force/environment/
    # noninteractive bypass anywhere in this tool.
    if ([Console]::IsInputRedirected) {
        throw 'REFUSED: standard input is redirected; -Apply requires an interactive console'
    }
    if (-not [Environment]::UserInteractive) {
        throw 'REFUSED: this session is not interactive; -Apply requires an interactive console'
    }
}

function Read-MergeGateConfirmation {
    # Single seam for the typed confirmation (tests mock this function; production reads the console).
    Write-Host 'confirmation> ' -NoNewline
    return [Console]::In.ReadLine()
}

# ---------------------------------------------------------------------------------------------
# Gates (fixed commands only; narrow process seams for tests)
# ---------------------------------------------------------------------------------------------

function Invoke-MergeGateAppGate {
    # Fixed: `npm.cmd test` from app/. Output streams to the console; the exit code decides.
    param([Parameter(Mandatory = $true)][string]$RepoRoot)
    $ErrorActionPreference = 'Continue'
    $appDir = Join-Path $RepoRoot 'app'
    if (-not (Test-Path -LiteralPath $appDir -PathType Container)) {
        Write-Host ('app gate: directory not found: ' + $appDir)
        return 1
    }
    Push-Location $appDir
    try {
        & npm.cmd test 2>&1 | ForEach-Object { Write-Host ([string]$_) }
        return $LASTEXITCODE
    } finally { Pop-Location }
}

function Invoke-MergeGatePesterGate {
    # Fixed: Windows PowerShell running scripts\run-pester.ps1.
    param([Parameter(Mandatory = $true)][string]$RepoRoot)
    $ErrorActionPreference = 'Continue'
    $runner = Join-Path $RepoRoot 'scripts\run-pester.ps1'
    if (-not (Test-Path -LiteralPath $runner -PathType Leaf)) {
        Write-Host ('pester gate: runner not found: ' + $runner)
        return 1
    }
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $runner 2>&1 |
        ForEach-Object { Write-Host ([string]$_) }
    return $LASTEXITCODE
}

# ---------------------------------------------------------------------------------------------
# Conflict handling + merge verification
# ---------------------------------------------------------------------------------------------

function Invoke-MergeGateConflictStop {
    <# A merge that git itself refused: abort ONLY when MERGE_HEAD exists, never resolve/stage/
       stash/clean/reset/commit, surface the state, and stop hard. #>
    param(
        [Parameter(Mandatory = $true)]$Repo,
        [Parameter(Mandatory = $true)][AllowEmptyString()][string]$MergeText
    )
    Write-MergeGateOutput 'git merge reported a conflict or failure:'
    Write-MergeGateOutput $MergeText
    $mergeHead = Join-Path $Repo.GitDir 'MERGE_HEAD'
    if (Test-Path -LiteralPath $mergeHead) {
        $ab = Invoke-Git -GitArgs @('merge', '--abort')
        Write-MergeGateOutput ('git merge --abort exit code: ' + $ab.ExitCode)
    } else {
        Write-MergeGateOutput 'no MERGE_HEAD present; nothing to abort'
    }
    $br = Invoke-Git -GitArgs @('symbolic-ref', '--quiet', 'HEAD')
    $hd = Invoke-Git -GitArgs @('rev-parse', 'HEAD')
    $st = Invoke-Git -GitArgs @('--no-optional-locks', 'status', '--porcelain')
    Write-MergeGateOutput ('current branch ref : ' + $br.Text)
    Write-MergeGateOutput ('current HEAD       : ' + $hd.Text)
    Write-MergeGateOutput ('status --porcelain :')
    Write-MergeGateOutput $st.Text
    Write-MergeGateOutput ('STOP ' + $script:MergeGateEmDash + ' DO NOT PUSH')
    return 1
}

function Test-MergeGateMergeResult {
    # Prove the applied merge IS the approved prediction: exactly two parents (pre-merge main,
    # branchTip), actual merge tree == preflighted merge-tree OID, still on main, tree clean.
    param(
        [Parameter(Mandatory = $true)]$Repo,
        [Parameter(Mandatory = $true)]$Plan,
        [Parameter(Mandatory = $true)][string]$PreMergeSha,
        [Parameter(Mandatory = $true)][string]$PredictedTree
    )
    $failures = New-Object System.Collections.Generic.List[string]
    $mergeSha = '(unknown)'
    $actualTree = '(unknown)'
    $rl = Invoke-Git -GitArgs @('rev-list', '--parents', '-n', '1', 'HEAD')
    if ($rl.ExitCode -ne 0 -or $rl.Lines.Count -lt 1) {
        $failures.Add('could not read HEAD parents')
    } else {
        $fields = @($rl.Lines[0].Trim() -split '\s+')
        $mergeSha = $fields[0]
        if ($fields.Count -ne 3) {
            $failures.Add('HEAD is not a two-parent merge commit (' + ($fields.Count - 1) + ' parent(s))')
        } else {
            if ($fields[1] -ne $PreMergeSha) { $failures.Add('parent 1 is ' + $fields[1] + ', expected pre-merge main ' + $PreMergeSha) }
            if ($fields[2] -ne $Plan.branchTip) { $failures.Add('parent 2 is ' + $fields[2] + ', expected branchTip ' + $Plan.branchTip) }
        }
    }
    $tr = Invoke-Git -GitArgs @('rev-parse', 'HEAD^{tree}')
    if ($tr.ExitCode -ne 0 -or $tr.Lines.Count -lt 1) {
        $failures.Add('could not read the merge tree')
    } else {
        $actualTree = $tr.Lines[0].Trim().ToLowerInvariant()
        if ($actualTree -ne $PredictedTree) {
            $failures.Add('actual merge tree ' + $actualTree + ' differs from predicted tree ' + $PredictedTree)
        }
    }
    $br = Invoke-Git -GitArgs @('symbolic-ref', '--quiet', 'HEAD')
    if ($br.ExitCode -ne 0 -or $br.Lines.Count -lt 1 -or $br.Lines[0].Trim() -cne 'refs/heads/main') {
        $failures.Add('repository is no longer on refs/heads/main')
    }
    try { Assert-MergeGateCleanState } catch { $failures.Add($_.Exception.Message) }
    return New-Object psobject -Property @{
        Ok         = ($failures.Count -eq 0)
        MergeSha   = $mergeSha
        ActualTree = $actualTree
        Failures   = $failures.ToArray()
    }
}

# ---------------------------------------------------------------------------------------------
# Apply (the single sanctioned history mutation lives here)
# ---------------------------------------------------------------------------------------------

function Invoke-MergeGateApply {
    <# Post-confirmation execution. Under the repository mutex: re-read/re-hash the plan, re-run
       the COMPLETE preflight (TOCTOU), perform the one --no-ff merge, verify parents + predicted
       tree, then run the fixed gates - holding the mutex throughout. Verification/gate failures
       RETAIN the merge for human inspection and stop hard; nothing is reset or repaired here. #>
    param(
        [Parameter(Mandatory = $true)]$Repo,
        [Parameter(Mandatory = $true)][string]$PlanPath,
        [Parameter(Mandatory = $true)][string]$ConfirmedPlanHash,
        [Parameter(Mandatory = $true)][string]$ConfirmedTree
    )
    $mutex = Enter-MergeGateMutex -Repo $Repo
    try {
        # --- TOCTOU rechecks: a human git command or app process is NOT controlled by the mutex,
        # so everything is re-proven now, immediately before the merge. ---
        $planCtx = Read-MergeGatePlanContext -Repo $Repo -PlanPath $PlanPath
        if ($planCtx.PlanHash -ne $ConfirmedPlanHash) { throw 'REFUSED: plan file changed between confirmation and apply' }
        $pre = Invoke-MergeGatePreflightCore -Repo $Repo -PlanCtx $planCtx
        if ($pre.PredictedTree -ne $ConfirmedTree) { throw 'REFUSED: predicted merge tree changed between confirmation and apply' }
        $plan = $planCtx.Data
        $preMergeSha = $plan.expectedMainSha

        Write-MergeGateOutput ('merging: git merge --no-ff -m <mergeMessage> -- ' + $plan.branch)
        $merge = Invoke-Git -GitArgs @('merge', '--no-ff', '-m', $plan.mergeMessage, '--', $plan.branch)
        if ($merge.ExitCode -ne 0) {
            return Invoke-MergeGateConflictStop -Repo $Repo -MergeText $merge.Text
        }

        $ver = Test-MergeGateMergeResult -Repo $Repo -Plan $plan -PreMergeSha $preMergeSha -PredictedTree $ConfirmedTree
        if (-not $ver.Ok) {
            Write-MergeGateOutput ('MERGE VERIFICATION FAILED ' + $script:MergeGateEmDash + ' the local merge commit is RETAINED for human inspection:')
            foreach ($f in $ver.Failures) { Write-MergeGateOutput ('  - ' + $f) }
            Write-MergeGateStopBanner -PreMergeSha $preMergeSha -MergeShaText $ver.MergeSha
            return 1
        }

        $gateSummaries = @()
        foreach ($gate in @($plan.gates)) {
            Write-MergeGateOutput ('running gate: ' + $gate)
            if ($gate -ceq 'app') { $code = Invoke-MergeGateAppGate -RepoRoot $Repo.Root } else { $code = Invoke-MergeGatePesterGate -RepoRoot $Repo.Root }
            $gateSummaries += ($gate + ' exit ' + $code)
            if ($code -ne 0) {
                Write-MergeGateOutput ('GATE FAILED (' + $gate + ', exit ' + $code + ') ' + $script:MergeGateEmDash +
                                       ' the local merge commit is RETAINED for human inspection:')
                Write-MergeGateStopBanner -PreMergeSha $preMergeSha -MergeShaText $ver.MergeSha
                return 1
            }
        }

        Write-MergeGateOutput 'merge-gate result'
        Write-MergeGateOutput ('  pre-merge main   : ' + $preMergeSha)
        Write-MergeGateOutput ('  reviewed tip     : ' + $plan.reviewedTip)
        Write-MergeGateOutput ('  branch tip       : ' + $plan.branchTip)
        Write-MergeGateOutput ('  predicted tree   : ' + $ConfirmedTree)
        Write-MergeGateOutput ('  actual tree      : ' + $ver.ActualTree)
        Write-MergeGateOutput ('  merge commit     : ' + $ver.MergeSha)
        Write-MergeGateOutput ('  gates            : ' + ($(if ($gateSummaries.Count -eq 0) { '(none - documentation-only)' } else { $gateSummaries -join '; ' })))
        Write-MergeGateOutput ('LOCAL MERGE COMPLETE ' + $script:MergeGateEmDash + ' NOT PUSHED')
        return 0
    } finally {
        Exit-MergeGateMutex -Mutex $mutex
    }
}

# ---------------------------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------------------------

function Invoke-MergeGateMain {
    param(
        [Parameter(Mandatory = $true)][string]$PlanPath,
        [switch]$Apply
    )
    try {
        if ($Apply) { Assert-MergeGateInteractiveConsole }
        $repo = Resolve-MergeGateRepository
        $planCtx = Read-MergeGatePlanContext -Repo $repo -PlanPath $PlanPath

        # Initial preflight under the mutex (state-sensitive reads must not interleave with a
        # second merge-gate invocation), released before the human confirmation pause.
        $mutex = Enter-MergeGateMutex -Repo $repo
        try { $pre = Invoke-MergeGatePreflightCore -Repo $repo -PlanCtx $planCtx }
        finally { Exit-MergeGateMutex -Mutex $mutex }

        Write-MergeGateSummary -PlanCtx $planCtx -Pre $pre

        if (-not $Apply) {
            Write-MergeGateOutput ('PREFLIGHT: PASS ' + $script:MergeGateEmDash + ' no local merge performed')
            return 0
        }

        $plan = $planCtx.Data
        Write-MergeGateOutput 'AUTHORIZATION REQUIRED - about to perform ONE local --no-ff merge:'
        Write-MergeGateOutput ('  plan sha256      : ' + $planCtx.PlanHash)
        Write-MergeGateOutput ('  starting main    : ' + $plan.expectedMainSha)
        Write-MergeGateOutput ('  branch           : ' + $plan.branch + ' @ ' + $plan.branchTip.Substring(0, 12))
        Write-MergeGateOutput ('  predicted tree   : ' + $pre.PredictedTree)
        Write-MergeGateOutput ('  merge message    : ' + $plan.mergeMessage)
        Write-MergeGateOutput ('  gates            : ' + ($(if (@($plan.gates).Count -eq 0) { '(none - documentation-only)' } else { @($plan.gates) -join ', ' })))
        $expected = 'MERGE ' + $planCtx.PlanHash.Substring(0, 16) + ' ' + $plan.branchTip.Substring(0, 12)
        Write-MergeGateOutput ('Type exactly: ' + $expected)
        $answer = Read-MergeGateConfirmation
        if (($null -eq $answer) -or (([string]$answer).Trim() -cne $expected)) {
            throw 'REFUSED: confirmation text did not match; no merge performed'
        }

        return Invoke-MergeGateApply -Repo $repo -PlanPath $PlanPath `
            -ConfirmedPlanHash $planCtx.PlanHash -ConfirmedTree $pre.PredictedTree
    } catch {
        Write-MergeGateOutput ('MERGE-GATE REFUSED: ' + $_.Exception.Message)
        return 1
    }
}

if ($MyInvocation.InvocationName -ne '.') {
    exit (Invoke-MergeGateMain -PlanPath $PlanPath -Apply:$Apply)
}
