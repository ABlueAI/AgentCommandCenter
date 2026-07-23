<#
.SYNOPSIS
  Merge Gate v1 plan loading + strict validation (pure functions; no git, no repository state).
.DESCRIPTION
  The merge plan is a PowerShell data file (.merge-gate/plan.psd1) loaded ONLY through
  Import-PowerShellDataFile. PSD1 was chosen over JSON deliberately:
    - Import-PowerShellDataFile natively REJECTS duplicate keys (exact and case-variant), which
      ConvertFrom-Json silently accepts (last key wins) - a reviewed-value-substitution hazard.
    - The restricted data language cannot execute code, so a plan file can never run anything.
    - Values arrive natively typed (Int32/Boolean/String), killing PowerShell coercion traps
      (the string 'false' is truthy; a bare 40-digit number is not a SHA string).
  Everything here is pure data validation so it can be unit-tested without a repository.
  All repository-dependent checks (ancestry, refs, pinned diff, predicted tree) live in
  scripts/merge-gate.ps1.
#>

# The exact required key set. Any unknown key and any missing key refuses - there are no optional
# fields and no configurable commands, hooks, or working directories in a merge plan.
$script:MergeGatePlanRequiredKeys = @(
    'schemaVersion', 'expectedMainSha', 'expectedOriginMainSha', 'documentationOnly',
    'branch', 'reviewedBase', 'reviewedTip', 'branchTip',
    'handoffDoc', 'pinnedDiff', 'mergeMessage', 'gates'
)
$script:MergeGatePlanShaKeys = @(
    'expectedMainSha', 'expectedOriginMainSha', 'reviewedBase', 'reviewedTip', 'branchTip'
)
$script:MergeGateMaxMergeMessageChars = 200   # (?) tunable upper bound for --no-ff -m subject text
$script:MergeGateMaxPlanPathChars     = 260   # (?) conventional Windows path bound for plan path fields

function Get-MergeGateFileSha256 {
    <# SHA-256 over the exact file bytes, lowercase hex. Used to pin the plan file identity across
       the confirmation gap and to report the pinned review diff. #>
    param([Parameter(Mandatory = $true)][string]$LiteralPath)
    $sha = [System.Security.Cryptography.SHA256]::Create()
    try {
        $stream = [System.IO.File]::Open($LiteralPath,
            [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::Read)
        try { $hash = $sha.ComputeHash($stream) } finally { $stream.Dispose() }
    } finally { $sha.Dispose() }
    return ([System.BitConverter]::ToString($hash) -replace '-', '').ToLowerInvariant()
}

function Test-MergeGateShaString {
    # A SHA must arrive as a STRING of exactly 40 hex chars; numbers are refused by type.
    param($Value)
    return (($Value -is [string]) -and ($Value -match '^[0-9a-fA-F]{40}$'))
}

function Test-MergeGateMergeMessage {
    <# Merge message: bounded, ASCII printable only, and inert - no CR/LF/NUL/control characters,
       no single/double quotes, no backticks. It rides as one discrete argv element after -m, but
       the character policy removes any downstream reparsing/log-injection ambiguity too. #>
    param($Value)
    if (-not ($Value -is [string])) { return $false }
    if ($Value.Length -lt 1 -or $Value.Length -gt $script:MergeGateMaxMergeMessageChars) { return $false }
    foreach ($ch in $Value.ToCharArray()) {
        $c = [int]$ch
        if ($c -lt 0x20 -or $c -gt 0x7E) { return $false }
        if ($ch -eq '"' -or $ch -eq "'" -or $ch -eq '`') { return $false }
    }
    return $true
}

function Test-MergeGateRepoRelativePath {
    <# Repository-relative, forward-slash-only path: no drive letter, no leading separator, no
       backslash alternate-separator trick, no '.'/'..' segments, no empty segments, no control
       characters. Filesystem-level checks (existence, reparse points, worktree containment,
       gitignore status) are the driver's job. #>
    param($Value)
    if (-not ($Value -is [string])) { return $false }
    if ($Value.Length -lt 1 -or $Value.Length -gt $script:MergeGateMaxPlanPathChars) { return $false }
    foreach ($ch in $Value.ToCharArray()) {
        $c = [int]$ch
        if ($c -lt 0x20 -or $c -eq 0x7F) { return $false }
    }
    if ($Value -match '^[A-Za-z]:') { return $false }
    if ($Value.StartsWith('/') -or $Value.StartsWith('\')) { return $false }
    if ($Value.Contains('\')) { return $false }
    foreach ($seg in ($Value -split '/')) {
        if ($seg -eq '' -or $seg -eq '.' -or $seg -eq '..') { return $false }
    }
    return $true
}

function Test-MergeGateBranchName {
    <# Charset gate for the branch field. The driver additionally runs
       `git check-ref-format --branch` for git's full ref-syntax rules. First character must be
       alphanumeric, which also blocks option-shaped values like '-evil'. #>
    param($Value)
    if (-not ($Value -is [string])) { return $false }
    if ($Value.Length -lt 1 -or $Value.Length -gt 200) { return $false }
    if ($Value -notmatch '^[A-Za-z0-9][A-Za-z0-9._/-]*$') { return $false }
    if ($Value.Contains('..') -or $Value.Contains('//')) { return $false }
    if ($Value.EndsWith('/') -or $Value.EndsWith('.lock')) { return $false }
    return $true
}

function ConvertFrom-MergeGatePlanFile {
    <# Load + strictly validate a merge plan. Returns a NEW hashtable with normalized values
       (SHAs lowercased). Throws 'REFUSED: plan ...' on the first violation. #>
    param([Parameter(Mandatory = $true)][string]$LiteralPath)

    # Import-PowerShellDataFile itself refuses duplicate keys (exact and case-variant) and any
    # construct outside the restricted data language (code cannot execute).
    $raw = Import-PowerShellDataFile -LiteralPath $LiteralPath -ErrorAction Stop
    if (-not ($raw -is [hashtable])) { throw 'REFUSED: plan root must be a single @{...} hashtable literal' }

    # Exact key set, exact-case names.
    $keys = @()
    foreach ($k in $raw.Keys) { $keys += [string]$k }
    foreach ($k in $keys) {
        if (-not ($script:MergeGatePlanRequiredKeys -ccontains $k)) { throw ('REFUSED: plan contains unknown key: ' + $k) }
    }
    foreach ($k in $script:MergeGatePlanRequiredKeys) {
        if (-not ($keys -ccontains $k)) { throw ('REFUSED: plan is missing required key: ' + $k) }
    }

    if (-not (($raw['schemaVersion'] -is [int]) -and ($raw['schemaVersion'] -eq 1))) {
        throw 'REFUSED: plan schemaVersion must be the integer 1'
    }
    if (-not ($raw['documentationOnly'] -is [bool])) {
        throw 'REFUSED: plan documentationOnly must be an actual boolean ($true/$false)'
    }

    $plan = @{ schemaVersion = 1; documentationOnly = [bool]$raw['documentationOnly'] }

    foreach ($k in $script:MergeGatePlanShaKeys) {
        if (-not (Test-MergeGateShaString -Value $raw[$k])) {
            throw ('REFUSED: plan ' + $k + ' must be a 40-character hexadecimal SHA string')
        }
        $plan[$k] = ([string]$raw[$k]).ToLowerInvariant()
    }
    # A plan only ever targets a synchronized main; drift is a human problem, not a merge input.
    if ($plan['expectedMainSha'] -ne $plan['expectedOriginMainSha']) {
        throw 'REFUSED: plan expectedMainSha and expectedOriginMainSha differ (main is not synchronized)'
    }

    if (-not (Test-MergeGateBranchName -Value $raw['branch'])) {
        throw 'REFUSED: plan branch is not a plainly-named local branch'
    }
    $plan['branch'] = [string]$raw['branch']

    if (-not (Test-MergeGateRepoRelativePath -Value $raw['handoffDoc'])) {
        throw 'REFUSED: plan handoffDoc must be a clean repository-relative forward-slash path'
    }
    if ($raw['handoffDoc'] -cnotmatch '^docs/BUILDER-HANDOFF-[A-Za-z0-9._-]+\.md$') {
        throw 'REFUSED: plan handoffDoc must match docs/BUILDER-HANDOFF-*.md'
    }
    $plan['handoffDoc'] = [string]$raw['handoffDoc']

    if (-not (Test-MergeGateRepoRelativePath -Value $raw['pinnedDiff'])) {
        throw 'REFUSED: plan pinnedDiff must be a clean repository-relative forward-slash path'
    }
    $pinnedLeaf = ([string]$raw['pinnedDiff'] -split '/')[-1]
    if ($pinnedLeaf -notmatch '^\.agent-review.*\.diff$') {
        throw 'REFUSED: plan pinnedDiff filename must match .agent-review*.diff'
    }
    $plan['pinnedDiff'] = [string]$raw['pinnedDiff']

    if (-not (Test-MergeGateMergeMessage -Value $raw['mergeMessage'])) {
        throw ('REFUSED: plan mergeMessage must be 1..' + $script:MergeGateMaxMergeMessageChars +
               ' printable ASCII characters with no quotes, backticks, or control characters')
    }
    $plan['mergeMessage'] = [string]$raw['mergeMessage']

    # Fixed gate policy: exactly @('app','pester'), or @() for a documentation-only plan.
    # No configurable commands exist anywhere in a plan.
    $gates = @($raw['gates'])
    foreach ($g in $gates) {
        if (-not ($g -is [string])) { throw 'REFUSED: plan gates must contain only strings' }
    }
    if ($gates.Count -eq 0) {
        if (-not $plan['documentationOnly']) {
            throw 'REFUSED: plan gates may be empty only when documentationOnly = $true'
        }
    } elseif (-not (($gates.Count -eq 2) -and ($gates[0] -ceq 'app') -and ($gates[1] -ceq 'pester'))) {
        throw "REFUSED: plan gates must be exactly @('app','pester') (or @() for documentation-only)"
    }
    $plan['gates'] = @($gates | ForEach-Object { [string]$_ })

    return $plan
}
