<#
.SYNOPSIS
  Remove an agent's worktree once its work is merged.
.DESCRIPTION
  Removes the sibling worktree and preserves its branch. Use -Check to list local
  work first. To remove a worktree with local work, review that output and pass
  its state with -Force -ExpectedState.
.EXAMPLE
  .\remove-agent.ps1 -Task search-bar
#>
param(
    [Parameter(Mandatory = $true)][string]$Task,
    [switch]$Check,
    [switch]$Force,
    [ValidatePattern('^[0-9a-f]{64}$')][string]$ExpectedState
)
$ErrorActionPreference = "Stop"

function Invoke-CheckedGit {
    param([string]$Directory, [string[]]$Arguments, [string[]]$InputLines = @())
    if ($InputLines.Count -gt 0) {
        $InputLines | & git --no-replace-objects -C $Directory @Arguments
    } else {
        & git --no-replace-objects -C $Directory @Arguments
    }
    if ($LASTEXITCODE -ne 0) { throw "Git $($Arguments[0]) failed (exit $LASTEXITCODE)." }
}

$previousConsoleEncoding = [Console]::OutputEncoding
$previousTerminalPrompt = $env:GIT_TERMINAL_PROMPT
$previousCredentialPrompt = $env:GCM_INTERACTIVE
try {
    [Console]::OutputEncoding = $OutputEncoding = [System.Text.UTF8Encoding]::new($false)
    $env:GIT_TERMINAL_PROMPT = '0'
    $env:GCM_INTERACTIVE = 'never'

    $repoRoot     = Invoke-CheckedGit (Get-Location).ProviderPath @('rev-parse', '--show-toplevel')
    $repoName     = Split-Path $repoRoot -Leaf
    $worktreePath = Join-Path (Split-Path $repoRoot -Parent) "$repoName-$Task"

    if (-not (Test-Path -LiteralPath $worktreePath -PathType Container)) { throw "No worktree found at: $worktreePath" }
    $worktreeRoot = Invoke-CheckedGit $worktreePath @('rev-parse', '--show-toplevel')
    $commonDirArgs = @('rev-parse', '--path-format=absolute', '--git-common-dir')
    if ([IO.Path]::GetFullPath($worktreeRoot) -ne [IO.Path]::GetFullPath($worktreePath) -or
        (Invoke-CheckedGit $worktreePath $commonDirArgs) -ne (Invoke-CheckedGit $repoRoot $commonDirArgs)) {
        throw 'The agent directory is not a worktree of the selected repository.'
    }

    # Use live branch tips. A cached tracking ref can outlive a deleted remote branch.
    $remoteTips = @(
        foreach ($remote in (Invoke-CheckedGit $worktreePath @('remote'))) {
            $tips = @(
                foreach ($line in (Invoke-CheckedGit $worktreePath @('ls-remote', '--heads', '--', $remote))) {
                    if ($line -notmatch '^([0-9a-f]{40}|[0-9a-f]{64})\trefs/heads/.+$') {
                        throw 'Git returned an invalid remote branch entry.'
                    }
                    $Matches[1]
                }
            )
            if ($tips.Count -eq 0) { continue }

            # Fetch missing objects by ID without writing tracking refs or FETCH_HEAD.
            $missing = @(
                foreach ($object in (Invoke-CheckedGit $worktreePath @('cat-file', '--batch-check=%(objectname) %(objecttype)') $tips)) {
                    if ($object -match '^([0-9a-f]+) missing$') { $Matches[1] }
                    elseif ($object -notmatch '^[0-9a-f]+ commit$') { throw 'A remote branch does not point to a commit.' }
                }
            )
            if ($missing.Count) {
                Invoke-CheckedGit $worktreePath @('fetch', '--stdin', '--no-auto-gc', '--no-tags',
                    '--no-write-fetch-head', '--no-recurse-submodules', '--refmap=', '--', $remote) $missing | Out-Null
            }
            $tips
        }
    ) | Sort-Object -Unique

    $head = Invoke-CheckedGit $worktreePath @('rev-parse', '--verify', 'HEAD')
    $logArgs = @('log', '--no-show-signature', '--format=%h%x20%s', $head)
    $exclude = @($remoteTips | ForEach-Object { if ($_) { "^$_" } })
    if ($exclude.Count) { $logArgs += '--stdin' }
    $commits = @(Invoke-CheckedGit $worktreePath $logArgs $exclude)
    $changes = @(Invoke-CheckedGit $worktreePath @('--no-optional-locks', '-c', 'core.quotePath=false', 'status',
        '--porcelain=v1', '--untracked-files=all', '--ignored=matching', '--ignore-submodules=none'))

    $snapshot = [ordered]@{ head = $head; changes = $changes; commits = $commits } | ConvertTo-Json -Compress
    $sha256 = [Security.Cryptography.SHA256]::Create()
    try {
        $state = [BitConverter]::ToString($sha256.ComputeHash([Text.Encoding]::UTF8.GetBytes($snapshot))).Replace('-', '').ToLowerInvariant()
    } finally {
        $sha256.Dispose()
    }

    if ($Check) {
        @{ changes = $changes; commits = $commits; state = $state } | ConvertTo-Json -Compress
        return
    }
    if ($ExpectedState -and $ExpectedState -ne $state) {
        throw 'The worktree changed after it was checked. Review it again before removing it.'
    }
    if (($changes.Count -or $commits.Count) -and (-not $Force -or -not $ExpectedState)) {
        throw 'The worktree has local work. Use -Check and review its output before forcing removal.'
    }

    $removeArgs = @('worktree', 'remove')
    if ($Force -and $changes.Count) { $removeArgs += '--force' }
    Invoke-CheckedGit $repoRoot ($removeArgs + @('--', $worktreePath))

    Write-Host "Removed worktree: $worktreePath" -ForegroundColor Green
    Write-Host "Branch agent/$Task still exists. When you're sure it's merged, delete it with:" -ForegroundColor Yellow
    Write-Host "  git branch -d agent/$Task"
} finally {
    [Console]::OutputEncoding = $previousConsoleEncoding
    $env:GIT_TERMINAL_PROMPT = $previousTerminalPrompt
    $env:GCM_INTERACTIVE = $previousCredentialPrompt
}
