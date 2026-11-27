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

# Settings that stop the repository's own config from running commands during this script.
# The repository (and any agent working in it) controls its config; Mako's removal must not
# run a command it put there. Remotes are reached by URL so remote.<name>.* settings don't apply.
$script:HooksOff = Join-Path ([IO.Path]::GetTempPath()) ("mako-no-hooks-" + [Guid]::NewGuid().ToString('N'))
# A stalled https transfer (under 1 KB/s for 30 s) fails instead of hanging the removal.
$script:SafeGitConfig = @('-c', 'core.fsmonitor=false', '-c', "core.hooksPath=$script:HooksOff",
    '-c', 'protocol.ext.allow=never', '-c', 'http.lowSpeedLimit=1000', '-c', 'http.lowSpeedTime=30')

function Invoke-CheckedGit {
    param([string]$Directory, [string[]]$Arguments)
    # No stdin: Windows PowerShell 5.1 adds a byte-order mark and CRLF to text piped into git.
    & git --no-replace-objects @script:SafeGitConfig -C $Directory @Arguments
    if ($LASTEXITCODE -ne 0) {
        $subcommand = $null
        for ($n = 0; $n -lt $Arguments.Count -and -not $subcommand; $n++) {
            if ($Arguments[$n] -eq '-c') { $n++ } elseif ($Arguments[$n] -notlike '-*') { $subcommand = $Arguments[$n] }
        }
        throw "Git $subcommand failed (exit $LASTEXITCODE) in $Directory."
    }
}

# Object IDs go on the command line in chunks, well under Windows' 32K command-line limit.
$script:ChunkSize = 200
function Get-Chunk {
    param([string[]]$Items, [int]$Start)
    $last = [Math]::Min($Start + $script:ChunkSize, $Items.Count) - 1
    return , [string[]]@($Items[$Start..$last])
}

# Repository config keys that can run a command or hand a login to one during the check or the
# removal. They have no safe override, so the script refuses and names them. Git LFS's own
# filter settings are allowed.
$script:RiskyConfig = '^(credential\..*|core\.(askpass|sshcommand|gitproxy|alternaterefscommand|alternaterefsprefixes)|ssh\..*|url\..*\.(insteadof|pushinsteadof)|' +
    'remote\..*\.(uploadpack|receivepack|vcs)|protocol\..*|include\..*|includeif\..*|filter\..*)$'
function Assert-SafeRepositoryConfig {
    param([string]$Directory)
    $found = @(
        foreach ($scope in @('--local', '--worktree')) {
            foreach ($key in @(Invoke-CheckedGit $Directory @('config', $scope, '--includes', '--name-only', '--list'))) {
                if ($key -notmatch $script:RiskyConfig) { continue }
                if ($key -match '^filter\.lfs\.(clean|smudge|process|required)$') {
                    $values = @(Invoke-CheckedGit $Directory @('config', $scope, '--includes', '--get-all', $key))
                    if (@($values | Where-Object { $_ -notmatch '^(git-lfs( |$)|true$)' }).Count -eq 0) { continue }
                }
                $key
            }
        }
    ) | Sort-Object -Unique
    if ($found) {
        throw ("The repository config sets $($found -join ', '), which could run a command during removal. " +
            "Remove it (git config --unset), or remove the worktree by hand from a terminal.")
    }
}

$previousConsoleEncoding = [Console]::OutputEncoding
$previousTerminalPrompt = $env:GIT_TERMINAL_PROMPT
$previousCredentialPrompt = $env:GCM_INTERACTIVE
$previousGitAskPass = $env:GIT_ASKPASS
$previousSshAskPass = $env:SSH_ASKPASS
try {
    [Console]::OutputEncoding = $OutputEncoding = [System.Text.UTF8Encoding]::new($false)
    $env:GIT_TERMINAL_PROMPT = '0'
    $env:GCM_INTERACTIVE = 'never'
    $env:GIT_ASKPASS = $null
    $env:SSH_ASKPASS = $null

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
    Assert-SafeRepositoryConfig $worktreePath

    # Use live branch tips. A cached tracking ref can outlive a deleted remote branch.
    $remoteTips = @(
        foreach ($remote in @(Invoke-CheckedGit $worktreePath @('remote'))) {
            $url = @(Invoke-CheckedGit $worktreePath @('remote', 'get-url', '--', $remote))[0]
            if (-not $url -or $url.StartsWith('-')) { throw "Remote $remote has no usable URL." }
            $tips = [string[]]@(@(
                foreach ($line in @(Invoke-CheckedGit $worktreePath @('ls-remote', '--heads', '--', $url))) {
                    if ($line -notmatch '^([0-9a-f]{40}|[0-9a-f]{64})\trefs/heads/.+$') {
                        throw 'Git returned an invalid remote branch entry.'
                    }
                    $Matches[1]
                }
            ) | Sort-Object -Unique)
            if ($tips.Count -eq 0) { continue }

            # Fetch missing objects by ID without writing tracking refs or FETCH_HEAD.
            for ($i = 0; $i -lt $tips.Count; $i += $script:ChunkSize) {
                $chunk = Get-Chunk $tips $i
                $present = @(Invoke-CheckedGit $worktreePath (@('rev-list', '--no-walk', '--ignore-missing') + $chunk))
                $missing = @($chunk | Where-Object { $present -notcontains $_ })
                if ($missing.Count) {
                    Invoke-CheckedGit $worktreePath (@('fetch', '--quiet', '--no-auto-gc', '--no-tags',
                        '--no-write-fetch-head', '--no-recurse-submodules', '--refmap=', '--', $url) + $missing) | Out-Null
                }
            }
            $tips
        }
    )

    $head = @(Invoke-CheckedGit $worktreePath @('rev-parse', '--verify', 'HEAD'))[0]
    # Commits on HEAD that no live remote tip reaches: the intersection over every chunk of tips.
    $logArgs = @('log', '--no-show-signature', '--format=%H%x20%h%x20%s', $head)
    $allTips = [string[]]@($remoteTips | Where-Object { $_ })
    $unpublished = $null
    $i = 0
    do {
        $gitArgs = $logArgs
        if ($allTips.Count) { $gitArgs = $logArgs + @('--not') + (Get-Chunk $allTips $i) }
        $lines = @(Invoke-CheckedGit $worktreePath $gitArgs)
        if ($null -eq $unpublished) {
            $unpublished = $lines
        } else {
            $keep = @{}
            foreach ($line in $lines) { $keep[$line.Split(' ')[0]] = $true }
            $unpublished = @($unpublished | Where-Object { $keep.ContainsKey($_.Split(' ')[0]) })
        }
        $i += $script:ChunkSize
    } while ($i -lt $allTips.Count)
    $commits = @($unpublished | ForEach-Object { $_.Substring($_.IndexOf(' ') + 1) })
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
    $env:GIT_ASKPASS = $previousGitAskPass
    $env:SSH_ASKPASS = $previousSshAskPass
}
