<#
.SYNOPSIS
  Pester (3.4) tests for Merge Gate v1 (scripts/merge-gate.ps1 + scripts/lib/merge-gate-plan.ps1).
.DESCRIPTION
  Run with: powershell -NoProfile -ExecutionPolicy Bypass -File scripts\run-pester.ps1
  Every repository-touching test runs against a DISPOSABLE git fixture created under a guarded
  %TEMP% root (leaf prefix 'bh-merge-gate-test-'); the real Blue Helm repository is never the
  subject and -Apply is never pointed at it. Real git provides all merge semantics; only the
  narrow confirmation/interactive/gate-process seams are mocked (by dot-sourcing the script and
  Pester-mocking those functions - no production bypass exists or is added).
#>
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$script:MgSelfPath = $MyInvocation.MyCommand.Path
$script:MgScriptPath = Join-Path $here 'merge-gate.ps1'
$script:MgPlanLibPath = Join-Path $here 'lib\merge-gate-plan.ps1'

# Dot-source the driver (defines every function including the plan lib; the InvocationName guard
# keeps Invoke-MergeGateMain from running). Then undo its $ErrorActionPreference = 'Stop' so the
# test harness keeps Pester-normal semantics.
. $script:MgScriptPath
$ErrorActionPreference = 'Continue'

$script:MgTempParent = [System.IO.Path]::GetTempPath().TrimEnd('\')
$script:MgFixtureRoots = New-Object System.Collections.ArrayList

# --------------------------------------------------------------------------------------------
# Fixture helpers
# --------------------------------------------------------------------------------------------

function Invoke-MgGit {
    param([string]$RepoPath, [string[]]$GitArgs)
    $ErrorActionPreference = 'Continue'
    $raw = & git -C $RepoPath @GitArgs 2>&1
    $code = $LASTEXITCODE
    $lines = @()
    foreach ($i in @($raw)) { if ($null -ne $i) { $lines += [string]$i } }
    return New-Object psobject -Property @{ ExitCode = $code; Lines = $lines; Text = ($lines -join "`n") }
}

function Get-MgSha {
    param($Root, [string]$Rev)
    return (Invoke-MgGit $Root @('rev-parse', $Rev)).Lines[0].Trim()
}

function New-MgFixtureRoot {
    $p = Join-Path $script:MgTempParent ('bh-merge-gate-test-' + [guid]::NewGuid().ToString('N'))
    [void](New-Item -ItemType Directory -Path $p)
    [void]$script:MgFixtureRoots.Add($p)
    return $p
}

function Write-MgPlan {
    # Writes the fixture's .merge-gate\plan.psd1. Override values are RAW psd1 rvalue text
    # (e.g. "'deadbeef...'", '$true', "@()"), so tests can inject any shape.
    param($Fixture, [hashtable]$Overrides = @{})
    $v = [ordered]@{
        schemaVersion         = '1'
        expectedMainSha       = "'" + $Fixture.MainSha + "'"
        expectedOriginMainSha = "'" + $Fixture.MainSha + "'"
        documentationOnly     = '$false'
        branch                = "'feature/demo'"
        reviewedBase          = "'" + $Fixture.Base + "'"
        reviewedTip           = "'" + $Fixture.ReviewedTip + "'"
        branchTip             = "'" + $Fixture.BranchTip + "'"
        handoffDoc            = "'docs/BUILDER-HANDOFF-demo.md'"
        pinnedDiff            = "'" + $Fixture.DiffRel + "'"
        mergeMessage          = "'Merge demo: merge-gate test fixture'"
        gates                 = "@('app', 'pester')"
    }
    foreach ($k in $Overrides.Keys) { $v[$k] = $Overrides[$k] }
    $lines = @('@{')
    foreach ($k in $v.Keys) { $lines += ('    ' + $k + ' = ' + $v[$k]) }
    $lines += '}'
    Set-Content -LiteralPath $Fixture.PlanPath -Value ($lines -join "`r`n") -Encoding Ascii
}

function New-MgFixture {
    param(
        [switch]$AdvancedMain,
        [int]$TailCommits = 1,
        [switch]$Conflict,            # both sides edit notes.txt (implies an advanced main)
        [switch]$OmitPlanIgnore,      # .gitignore lacks .merge-gate/
        [switch]$OmitDiffIgnore,      # .gitignore lacks .agent-review*.diff
        [switch]$PinnedInWorktreesDir,
        [switch]$DocsOnlyFeature      # the reviewed change touches only Markdown
    )
    $root = New-MgFixtureRoot
    $null = Invoke-MgGit $root @('init', '-b', 'main')
    $null = Invoke-MgGit $root @('config', 'user.email', 'mg-test@example.com')
    $null = Invoke-MgGit $root @('config', 'user.name', 'MG Test')
    $null = Invoke-MgGit $root @('config', 'core.autocrlf', 'false')
    $null = Invoke-MgGit $root @('config', 'commit.gpgsign', 'false')

    Set-Content -LiteralPath (Join-Path $root 'notes.txt') -Value 'base notes' -Encoding Ascii
    [void](New-Item -ItemType Directory -Path (Join-Path $root 'docs'))
    Set-Content -LiteralPath (Join-Path $root 'docs\BUILDER-HANDOFF-demo.md') -Value 'handoff v0' -Encoding Ascii
    $gi = @()
    if (-not $OmitDiffIgnore) { $gi += '.agent-review*.diff' }
    if (-not $OmitPlanIgnore) { $gi += '.merge-gate/' }
    Set-Content -LiteralPath (Join-Path $root '.gitignore') -Value ($gi -join "`n") -Encoding Ascii
    $null = Invoke-MgGit $root @('add', '-A')
    $null = Invoke-MgGit $root @('commit', '-m', 'base')
    $base = Get-MgSha $root 'HEAD'

    $null = Invoke-MgGit $root @('switch', '-c', 'feature/demo')
    if ($DocsOnlyFeature) {
        Set-Content -LiteralPath (Join-Path $root 'docs\feature-notes.md') -Value 'feature docs' -Encoding Ascii
    } else {
        Set-Content -LiteralPath (Join-Path $root 'feature.txt') -Value 'feature work' -Encoding Ascii
    }
    if ($Conflict) { Set-Content -LiteralPath (Join-Path $root 'notes.txt') -Value 'feature version of notes' -Encoding Ascii }
    $null = Invoke-MgGit $root @('add', '-A')
    $null = Invoke-MgGit $root @('commit', '-m', 'feature work')
    $reviewedTip = Get-MgSha $root 'HEAD'
    for ($i = 1; $i -le $TailCommits; $i++) {
        Add-Content -LiteralPath (Join-Path $root 'docs\BUILDER-HANDOFF-demo.md') -Value ('tail update ' + $i)
        $null = Invoke-MgGit $root @('add', '-A')
        $null = Invoke-MgGit $root @('commit', '-m', ('handoff tail ' + $i))
    }
    $branchTip = Get-MgSha $root 'HEAD'

    $null = Invoke-MgGit $root @('switch', 'main')
    if ($AdvancedMain -or $Conflict) {
        Set-Content -LiteralPath (Join-Path $root 'main-advance.txt') -Value 'main advanced' -Encoding Ascii
        if ($Conflict) { Set-Content -LiteralPath (Join-Path $root 'notes.txt') -Value 'main version of notes' -Encoding Ascii }
        $null = Invoke-MgGit $root @('add', '-A')
        $null = Invoke-MgGit $root @('commit', '-m', 'main advance')
    }
    $mainSha = Get-MgSha $root 'HEAD'
    $null = Invoke-MgGit $root @('update-ref', 'refs/remotes/origin/main', $mainSha)

    if ($PinnedInWorktreesDir) {
        [void](New-Item -ItemType Directory -Path (Join-Path $root '.worktrees\pin') -Force)
        $diffRel = '.worktrees/pin/.agent-review-demo.diff'
    } else {
        $diffRel = '.agent-review-demo.diff'
    }
    $diffAbs = Join-Path $root ($diffRel -replace '/', '\')
    $null = Invoke-MgGit $root @('diff', ($base + '...' + $reviewedTip), ('--output=' + $diffAbs))
    [void](New-Item -ItemType Directory -Path (Join-Path $root '.merge-gate'))

    $fx = New-Object psobject -Property @{
        Root = $root; Base = $base; ReviewedTip = $reviewedTip; BranchTip = $branchTip
        MainSha = $mainSha; DiffRel = $diffRel; DiffAbs = $diffAbs
        PlanPath = (Join-Path $root '.merge-gate\plan.psd1')
    }
    Write-MgPlan -Fixture $fx
    return $fx
}

function Restore-MgPinnedDiff {
    param($Fixture)
    $null = Invoke-MgGit $Fixture.Root @('diff', ($Fixture.Base + '...' + $Fixture.ReviewedTip), ('--output=' + $Fixture.DiffAbs))
}

function Invoke-MgMain {
    # In-process run against a fixture. Safety: refuses anything that is not a bh-merge-gate-test-*
    # fixture so -Apply can never touch a real repository from these tests.
    param($Fixture, [switch]$Apply)
    if (-not (Split-Path -Leaf $Fixture.Root).StartsWith('bh-merge-gate-test-')) {
        throw 'test safety: refusing to run merge-gate outside a disposable fixture'
    }
    $global:MgOut = @()
    Push-Location $Fixture.Root
    try { return (Invoke-MergeGateMain -PlanPath '.merge-gate\plan.psd1' -Apply:$Apply) }
    finally { Pop-Location }
}

function Invoke-MgMainAt {
    # In-process run from an arbitrary working directory (wrong-root / wrong-worktree tests).
    param([string]$WorkDir, [string]$PlanPath)
    $global:MgOut = @()
    Push-Location $WorkDir
    try { return (Invoke-MergeGateMain -PlanPath $PlanPath) }
    finally { Pop-Location }
}

function Invoke-MgChild {
    # Real child powershell.exe -File run (the canonical production invocation shape).
    param($Fixture, [string[]]$ExtraArgs = @())
    Push-Location $Fixture.Root
    try {
        $ErrorActionPreference = 'Continue'
        $out = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $script:MgScriptPath -PlanPath '.merge-gate\plan.psd1' @ExtraArgs 2>&1 |
            ForEach-Object { [string]$_ }
        return New-Object psobject -Property @{ ExitCode = $LASTEXITCODE; Text = (@($out) -join "`n") }
    } finally { Pop-Location }
}

function Get-MgOut { return (@($global:MgOut) -join "`n") }

function Get-MgExpectedConfirm {
    param($Fixture)
    $hash = Get-MergeGateFileSha256 -LiteralPath $Fixture.PlanPath
    $data = ConvertFrom-MergeGatePlanFile -LiteralPath $Fixture.PlanPath
    return 'MERGE ' + $hash.Substring(0, 16) + ' ' + $data.branchTip.Substring(0, 12)
}

function Get-MgRepoSnapshot {
    param($Fixture)
    $objects = @(Get-ChildItem -LiteralPath (Join-Path $Fixture.Root '.git\objects') -Recurse -Force |
        Where-Object { -not $_.PSIsContainer } | ForEach-Object { $_.FullName } | Sort-Object)
    return New-Object psobject -Property @{
        Objects   = ($objects -join "`n")
        Refs      = (Invoke-MgGit $Fixture.Root @('for-each-ref')).Text
        Head      = (Get-Content -LiteralPath (Join-Path $Fixture.Root '.git\HEAD') -Raw)
        Status    = (Invoke-MgGit $Fixture.Root @('--no-optional-locks', 'status', '--porcelain')).Text
        IndexHash = (Get-MergeGateFileSha256 -LiteralPath (Join-Path $Fixture.Root '.git\index'))
    }
}

function Get-MgTempObjectDirs {
    return @(Get-ChildItem -LiteralPath $script:MgTempParent -Force -Filter 'bh-merge-gate-objects-*' |
        Where-Object { $_.PSIsContainer } | ForEach-Object { $_.FullName })
}

function Add-MgTailCommits {
    # Adds commits on feature/demo above the current tip; returns the new tip. Kinds map to the
    # tail-policy cases the gate must accept or refuse.
    param($Fixture, [string]$Kind = 'handoff', [int]$Count = 1)
    $null = Invoke-MgGit $Fixture.Root @('switch', 'feature/demo')
    for ($i = 1; $i -le $Count; $i++) {
        switch ($Kind) {
            'handoff' { Add-Content -LiteralPath (Join-Path $Fixture.Root 'docs\BUILDER-HANDOFF-demo.md') -Value ('tail ' + [guid]::NewGuid().ToString('N')) }
            'code'    { Set-Content -LiteralPath (Join-Path $Fixture.Root ('tail-code-' + $i + '.txt')) -Value 'code' -Encoding Ascii }
            'md'      { Set-Content -LiteralPath (Join-Path $Fixture.Root ('docs\EXTRA-' + $i + '.md')) -Value 'extra' -Encoding Ascii }
            'delete'  { $null = Invoke-MgGit $Fixture.Root @('rm', '-q', 'docs/BUILDER-HANDOFF-demo.md') }
            'chmod'   { $null = Invoke-MgGit $Fixture.Root @('add', '--chmod=+x', 'docs/BUILDER-HANDOFF-demo.md') }
        }
        if ($Kind -ne 'delete' -and $Kind -ne 'chmod') { $null = Invoke-MgGit $Fixture.Root @('add', '-A') }
        $null = Invoke-MgGit $Fixture.Root @('commit', '-m', ('tail ' + $Kind + ' ' + $i))
    }
    $tip = Get-MgSha $Fixture.Root 'HEAD'
    $null = Invoke-MgGit $Fixture.Root @('switch', 'main')
    return $tip
}

function Reset-MgFeatureBranch {
    param($Fixture, [string]$ToSha)
    $null = Invoke-MgGit $Fixture.Root @('update-ref', 'refs/heads/feature/demo', $ToSha)
}

# --------------------------------------------------------------------------------------------
# Plan-file (PSD1) strict validation - pure lib tests, no repository
# --------------------------------------------------------------------------------------------

$script:MgLibDir = New-MgFixtureRoot

function Get-MgValidPlanText {
    param([hashtable]$Overrides = @{}, [string[]]$RemoveKeys = @(), [string[]]$ExtraLines = @())
    $v = [ordered]@{
        schemaVersion         = '1'
        expectedMainSha       = "'1111111111111111111111111111111111111111'"
        expectedOriginMainSha = "'1111111111111111111111111111111111111111'"
        documentationOnly     = '$false'
        branch                = "'feature/demo'"
        reviewedBase          = "'2222222222222222222222222222222222222222'"
        reviewedTip           = "'3333333333333333333333333333333333333333'"
        branchTip             = "'4444444444444444444444444444444444444444'"
        handoffDoc            = "'docs/BUILDER-HANDOFF-demo.md'"
        pinnedDiff            = "'.agent-review-demo.diff'"
        mergeMessage          = "'Merge demo: lib test'"
        gates                 = "@('app', 'pester')"
    }
    foreach ($k in $Overrides.Keys) { $v[$k] = $Overrides[$k] }
    $lines = @('@{')
    foreach ($k in $v.Keys) {
        if ($RemoveKeys -contains $k) { continue }
        $lines += ('    ' + $k + ' = ' + $v[$k])
    }
    foreach ($x in $ExtraLines) { $lines += ('    ' + $x) }
    $lines += '}'
    return ($lines -join "`r`n")
}

function New-MgPlanFile {
    # Writes a plan variant to a fresh psd1 and returns its path (Should Throw scriptblocks stay
    # inline in each It so they resolve the lib function through the normal scope chain).
    param([hashtable]$Overrides = @{}, [string[]]$RemoveKeys = @(), [string[]]$ExtraLines = @())
    $p = Join-Path $script:MgLibDir ('plan-' + [guid]::NewGuid().ToString('N') + '.psd1')
    Set-Content -LiteralPath $p -Value (Get-MgValidPlanText -Overrides $Overrides -RemoveKeys $RemoveKeys -ExtraLines $ExtraLines) -Encoding Ascii
    return $p
}

Describe 'merge-gate plan validation (PSD1 lib)' {
    It 'accepts a fully valid plan and normalizes SHAs to lowercase' {
        $p = Join-Path $script:MgLibDir 'plan-valid.psd1'
        Set-Content -LiteralPath $p -Value (Get-MgValidPlanText -Overrides @{
            expectedMainSha = "'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'"
            expectedOriginMainSha = "'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'"
        }) -Encoding Ascii
        $plan = ConvertFrom-MergeGatePlanFile -LiteralPath $p
        $plan.expectedMainSha | Should Be 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
        $plan.branch | Should Be 'feature/demo'
        @($plan.gates).Count | Should Be 2
    }
    It 'rejects an exact duplicate key (Import-PowerShellDataFile refuses)' {
        $p = New-MgPlanFile -ExtraLines @("branch = 'feature/two'")
        { ConvertFrom-MergeGatePlanFile -LiteralPath $p } | Should Throw 'could not be parsed'
    }
    It 'rejects a case-variant duplicate key' {
        $p = New-MgPlanFile -ExtraLines @("Branch = 'feature/two'")
        { ConvertFrom-MergeGatePlanFile -LiteralPath $p } | Should Throw 'could not be parsed'
    }
    It 'rejects an unknown key' {
        $p = New-MgPlanFile -ExtraLines @('extraKey = 1')
        { ConvertFrom-MergeGatePlanFile -LiteralPath $p } | Should Throw 'unknown key'
    }
    It 'rejects a missing required key' {
        $p = New-MgPlanFile -RemoveKeys @('gates')
        { ConvertFrom-MergeGatePlanFile -LiteralPath $p } | Should Throw 'missing required key'
    }
    It 'rejects a string schemaVersion' {
        $p = New-MgPlanFile -Overrides @{ schemaVersion = "'1'" }
        { ConvertFrom-MergeGatePlanFile -LiteralPath $p } | Should Throw 'schemaVersion'
    }
    It 'rejects schemaVersion 2' {
        $p = New-MgPlanFile -Overrides @{ schemaVersion = '2' }
        { ConvertFrom-MergeGatePlanFile -LiteralPath $p } | Should Throw 'schemaVersion'
    }
    It 'rejects a string documentationOnly (the truthy-''false'' trap)' {
        $p = New-MgPlanFile -Overrides @{ documentationOnly = "'false'" }
        { ConvertFrom-MergeGatePlanFile -LiteralPath $p } | Should Throw 'documentationOnly'
    }
    It 'rejects a numeric SHA (type, not just shape)' {
        $p = New-MgPlanFile -Overrides @{ expectedMainSha = '11111'; expectedOriginMainSha = '11111' }
        { ConvertFrom-MergeGatePlanFile -LiteralPath $p } | Should Throw 'hexadecimal SHA string'
    }
    It 'rejects a malformed 39-character SHA' {
        $p = New-MgPlanFile -Overrides @{ branchTip = "'444444444444444444444444444444444444444'" }
        { ConvertFrom-MergeGatePlanFile -LiteralPath $p } | Should Throw 'hexadecimal SHA string'
    }
    It 'rejects desynchronized expectedMainSha / expectedOriginMainSha' {
        $p = New-MgPlanFile -Overrides @{ expectedOriginMainSha = "'5555555555555555555555555555555555555555'" }
        { ConvertFrom-MergeGatePlanFile -LiteralPath $p } | Should Throw 'synchronized'
    }
    It 'rejects an unsupported gate' {
        $p = New-MgPlanFile -Overrides @{ gates = "@('app', 'deploy')" }
        { ConvertFrom-MergeGatePlanFile -LiteralPath $p } | Should Throw 'gates'
    }
    It 'rejects wrong gate order and duplicates' {
        $p = New-MgPlanFile -Overrides @{ gates = "@('pester', 'app')" }
        { ConvertFrom-MergeGatePlanFile -LiteralPath $p } | Should Throw 'gates'
        $p2 = New-MgPlanFile -Overrides @{ gates = "@('app', 'app')" }
        { ConvertFrom-MergeGatePlanFile -LiteralPath $p2 } | Should Throw 'gates'
    }
    It 'rejects empty gates unless documentationOnly' {
        $p = New-MgPlanFile -Overrides @{ gates = '@()' }
        { ConvertFrom-MergeGatePlanFile -LiteralPath $p } | Should Throw 'documentationOnly'
    }
    It 'accepts empty gates for a documentationOnly plan' {
        $p = Join-Path $script:MgLibDir 'plan-docsonly.psd1'
        Set-Content -LiteralPath $p -Value (Get-MgValidPlanText -Overrides @{ documentationOnly = '$true'; gates = '@()' }) -Encoding Ascii
        @((ConvertFrom-MergeGatePlanFile -LiteralPath $p).gates).Count | Should Be 0
    }
    It 'rejects a merge message containing a double quote' {
        $p = New-MgPlanFile -Overrides @{ mergeMessage = "'bad `" quote'" }
        { ConvertFrom-MergeGatePlanFile -LiteralPath $p } | Should Throw 'mergeMessage'
    }
    It 'rejects a merge message containing a backtick' {
        $p = New-MgPlanFile -Overrides @{ mergeMessage = "'bad `` tick'" }
        { ConvertFrom-MergeGatePlanFile -LiteralPath $p } | Should Throw 'mergeMessage'
    }
    It 'rejects a merge message with an embedded newline' {
        $p = New-MgPlanFile -Overrides @{ mergeMessage = ("'line1" + "`r`n" + "line2'") }
        { ConvertFrom-MergeGatePlanFile -LiteralPath $p } | Should Throw 'mergeMessage'
    }
    It 'rejects an over-long merge message (201 chars)' {
        $p = New-MgPlanFile -Overrides @{ mergeMessage = ("'" + ('a' * 201) + "'") }
        { ConvertFrom-MergeGatePlanFile -LiteralPath $p } | Should Throw 'mergeMessage'
    }
    It 'rejects a branch name with whitespace or option shape' {
        $p = New-MgPlanFile -Overrides @{ branch = "'feat branch'" }
        { ConvertFrom-MergeGatePlanFile -LiteralPath $p } | Should Throw 'branch'
        $p2 = New-MgPlanFile -Overrides @{ branch = "'-evil'" }
        { ConvertFrom-MergeGatePlanFile -LiteralPath $p2 } | Should Throw 'branch'
    }
    It 'rejects handoffDoc traversal, absolute, and off-pattern paths' {
        $p = New-MgPlanFile -Overrides @{ handoffDoc = "'docs/../BUILDER-HANDOFF-x.md'" }
        { ConvertFrom-MergeGatePlanFile -LiteralPath $p } | Should Throw 'handoffDoc'
        $p2 = New-MgPlanFile -Overrides @{ handoffDoc = "'D:/docs/BUILDER-HANDOFF-x.md'" }
        { ConvertFrom-MergeGatePlanFile -LiteralPath $p2 } | Should Throw 'handoffDoc'
        $p3 = New-MgPlanFile -Overrides @{ handoffDoc = "'docs/OTHER.md'" }
        { ConvertFrom-MergeGatePlanFile -LiteralPath $p3 } | Should Throw 'handoffDoc'
    }
    It 'rejects pinnedDiff with a wrong leaf name or backslash separators' {
        $p = New-MgPlanFile -Overrides @{ pinnedDiff = "'review.diff'" }
        { ConvertFrom-MergeGatePlanFile -LiteralPath $p } | Should Throw 'pinnedDiff'
        $p2 = New-MgPlanFile -Overrides @{ pinnedDiff = "'.worktrees\pin\.agent-review-x.diff'" }
        { ConvertFrom-MergeGatePlanFile -LiteralPath $p2 } | Should Throw 'pinnedDiff'
    }
    It 'refuses executable content in the plan (restricted data language)' {
        $p = New-MgPlanFile -Overrides @{ mergeMessage = '(Get-Date)' }
        { ConvertFrom-MergeGatePlanFile -LiteralPath $p } | Should Throw
        $p2 = New-MgPlanFile -Overrides @{ gates = '{ 1 }' }
        { ConvertFrom-MergeGatePlanFile -LiteralPath $p2 } | Should Throw
    }
}

# --------------------------------------------------------------------------------------------
# Source invariants - no forbidden operation exists anywhere in the production paths
# --------------------------------------------------------------------------------------------

Describe 'merge-gate source invariants' {
    $driverSrc = Get-Content -LiteralPath $script:MgScriptPath -Raw
    $libSrc = Get-Content -LiteralPath $script:MgPlanLibPath -Raw

    It 'invokes git only with an allow-listed first argument' {
        $allowed = @('--no-optional-locks', 'rev-parse', 'worktree', 'check-ignore', 'status',
                     'check-ref-format', 'merge-base', 'rev-list', 'diff', 'ls-tree',
                     'merge-tree', 'merge', 'symbolic-ref')
        $calls = [regex]::Matches($driverSrc, "Invoke-Git\s+-GitArgs\s+@\(\s*'([^']+)'")
        $calls.Count -gt 10 | Should Be $true
        foreach ($m in $calls) { $allowed -contains $m.Groups[1].Value | Should Be $true }
    }
    It 'uses the worktree verb only as worktree list' {
        foreach ($m in [regex]::Matches($driverSrc, "@\(\s*'worktree'\s*,\s*'([^']+)'")) {
            $m.Groups[1].Value | Should Be 'list'
        }
    }
    It 'uses the merge verb only as --no-ff (once) and --abort (once, guarded)' {
        [regex]::Matches($driverSrc, "@\(\s*'merge'\s*,\s*'--no-ff'").Count | Should Be 1
        [regex]::Matches($driverSrc, "@\(\s*'merge'\s*,\s*'--abort'").Count | Should Be 1
    }
    It 'contains no push, fetch, pull, reset, clean, stash, checkout, or switch git call' {
        foreach ($verb in @('push', 'fetch', 'pull', 'reset', 'clean', 'stash', 'checkout', 'switch', 'restore', 'commit', 'add', 'branch', 'gc', 'prune', 'rm')) {
            $driverSrc -match ("@\(\s*'" + $verb + "'") | Should Be $false
        }
    }
    It 'contains no Invoke-Expression or cmd.exe invocation' {
        ($driverSrc -match 'Invoke-Expression') | Should Be $false
        ($driverSrc -match 'cmd\.exe') | Should Be $false
        ($libSrc -match 'Invoke-Expression') | Should Be $false
    }
    It 'exposes only -PlanPath and -Apply (no -Yes/-Force/auto-confirm bypass)' {
        $paramBlock = [regex]::Match($driverSrc, '(?s)param\((.*?)\)').Groups[1].Value
        ($paramBlock -match '\$PlanPath') | Should Be $true
        ($paramBlock -match '\$Apply') | Should Be $true
        ($paramBlock -match '\$Yes') | Should Be $false
        ($paramBlock -match '\$Force') | Should Be $false
        ($driverSrc -match '\$env:MERGE_GATE') | Should Be $false
    }
    It 'touches only GIT_* environment variables' {
        foreach ($m in [regex]::Matches($driverSrc, '\$env:([A-Za-z_][A-Za-z0-9_]*)')) {
            $m.Groups[1].Value.StartsWith('GIT_') | Should Be $true
        }
    }
    It 'is discovered by scripts\run-pester.ps1 (lives under scripts/ as *.Tests.ps1)' {
        (Split-Path -Leaf $here) | Should Be 'scripts'
        (Test-Path -LiteralPath (Join-Path $here 'run-pester.ps1')) | Should Be $true
        $script:MgSelfPath -match '\.Tests\.ps1$' | Should Be $true
    }
}

# --------------------------------------------------------------------------------------------
# Preflight: happy path is read-only (canonical child -File run)
# --------------------------------------------------------------------------------------------

Describe 'merge-gate preflight: synchronized fixture passes and mutates nothing' {
    $fx = New-MgFixture
    $tempBefore = Get-MgTempObjectDirs
    $before = Get-MgRepoSnapshot -Fixture $fx
    $run = Invoke-MgChild -Fixture $fx
    $after = Get-MgRepoSnapshot -Fixture $fx
    $tempAfter = Get-MgTempObjectDirs

    It 'exits 0 and prints PREFLIGHT: PASS' {
        $run.ExitCode | Should Be 0
        $run.Text | Should Match 'PREFLIGHT: PASS'
    }
    It 'changes no refs and no HEAD' {
        $after.Refs | Should Be $before.Refs
        $after.Head | Should Be $before.Head
    }
    It 'changes no index and no working-tree state' {
        $after.IndexHash | Should Be $before.IndexHash
        $after.Status | Should Be $before.Status
    }
    It 'adds nothing to the real object database' {
        $after.Objects | Should Be $before.Objects
    }
    It 'leaves no bh-merge-gate-objects-* temp directory behind (success cleanup)' {
        @($tempAfter | Where-Object { $tempBefore -notcontains $_ }).Count | Should Be 0
    }
    It 'prints a predicted tree equal to what git merge-tree computes' {
        $m = [regex]::Match($run.Text, 'predicted tree\s*:\s*([0-9a-f]{40})')
        $m.Success | Should Be $true
        $expected = (Invoke-MgGit $fx.Root @('merge-tree', '--write-tree', $fx.MainSha, $fx.BranchTip)).Lines[0].Trim()
        $m.Groups[1].Value | Should Be $expected
    }
    It 'refuses while another invocation holds the repository mutex' {
        $rootFromGit = Get-MergeGateCanonicalPath -Path (Invoke-MgGit $fx.Root @('rev-parse', '--show-toplevel')).Lines[0].Trim()
        $name = Get-MergeGateMutexName -CanonicalRoot $rootFromGit
        $mutex = New-Object System.Threading.Mutex($false, $name)
        $got = $mutex.WaitOne(0)
        try {
            $blocked = Invoke-MgChild -Fixture $fx
            $blocked.ExitCode | Should Be 1
            $blocked.Text | Should Match 'mutex'
        } finally {
            if ($got) { [void]$mutex.ReleaseMutex() }
            $mutex.Dispose()
        }
    }
    It 'refuses -Apply when standard input is redirected' {
        Push-Location $fx.Root
        try {
            $ErrorActionPreference = 'Continue'
            $out = @('nope') | & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $script:MgScriptPath -PlanPath '.merge-gate\plan.psd1' -Apply 2>&1 |
                ForEach-Object { [string]$_ }
            $code = $LASTEXITCODE
        } finally { Pop-Location }
        $code | Should Be 1
        (@($out) -join "`n") | Should Match 'redirected|interactive'
        Get-MgSha $fx.Root 'HEAD' | Should Be $fx.MainSha
    }
}

# --------------------------------------------------------------------------------------------
# Preflight: repository/worktree/state refusals (in-process, captured output)
# --------------------------------------------------------------------------------------------

Describe 'merge-gate preflight: state refusals' {
    Mock Write-MergeGateOutput { $global:MgOut += $Message }
    $fx = New-MgFixture

    It 'passes from a clean synchronized state (control)' {
        Write-MgPlan -Fixture $fx
        Invoke-MgMain -Fixture $fx | Should Be 0
        Get-MgOut | Should Match 'PREFLIGHT: PASS'
    }
    It 'tolerates the literal .worktrees/ untracked container' {
        [void](New-Item -ItemType Directory -Path (Join-Path $fx.Root '.worktrees\keep') -Force)
        Set-Content -LiteralPath (Join-Path $fx.Root '.worktrees\keep\f.txt') -Value 'x' -Encoding Ascii
        Invoke-MgMain -Fixture $fx | Should Be 0
    }
    It 'refuses from a subdirectory (not the canonical root)' {
        Invoke-MgMainAt -WorkDir (Join-Path $fx.Root 'docs') -PlanPath $fx.PlanPath | Should Be 1
        Get-MgOut | Should Match 'repository root'
    }
    It 'refuses from a linked worktree (the refs/heads/main worktree is elsewhere)' {
        $null = Invoke-MgGit $fx.Root @('worktree', 'add', '.worktrees\side', '-b', 'side', $fx.Base)
        $side = Join-Path $fx.Root '.worktrees\side'
        [void](New-Item -ItemType Directory -Path (Join-Path $side '.merge-gate'))
        $sideFx = New-Object psobject -Property @{
            MainSha = $fx.MainSha; Base = $fx.Base; ReviewedTip = $fx.ReviewedTip; BranchTip = $fx.BranchTip
            DiffRel = $fx.DiffRel; PlanPath = (Join-Path $side '.merge-gate\plan.psd1')
        }
        Write-MgPlan -Fixture $sideFx
        Invoke-MgMainAt -WorkDir $side -PlanPath $sideFx.PlanPath | Should Be 1
        Get-MgOut | Should Match 'refs/heads/main worktree'
    }
    It 'refuses when a branch other than main is checked out' {
        $null = Invoke-MgGit $fx.Root @('switch', 'feature/demo')
        Invoke-MgMain -Fixture $fx | Should Be 1
        Get-MgOut | Should Match 'REFUSED'
        $null = Invoke-MgGit $fx.Root @('switch', 'main')
    }
    It 'refuses a detached HEAD' {
        $null = Invoke-MgGit $fx.Root @('checkout', '--detach')
        Invoke-MgMain -Fixture $fx | Should Be 1
        Get-MgOut | Should Match 'REFUSED'
        $null = Invoke-MgGit $fx.Root @('switch', 'main')
    }
    It 'refuses when HEAD does not match expectedMainSha' {
        Write-MgPlan -Fixture $fx -Overrides @{
            expectedMainSha = ("'" + $fx.BranchTip + "'"); expectedOriginMainSha = ("'" + $fx.BranchTip + "'")
        }
        Invoke-MgMain -Fixture $fx | Should Be 1
        Get-MgOut | Should Match 'HEAD is'
        Write-MgPlan -Fixture $fx
    }
    It 'refuses a stale local origin/main tracking ref' {
        # NOTE: in a non-advanced fixture MainSha == Base, so the stale value must be a commit
        # that genuinely differs from main (the reviewed tip qualifies).
        $null = Invoke-MgGit $fx.Root @('update-ref', 'refs/remotes/origin/main', $fx.ReviewedTip)
        Invoke-MgMain -Fixture $fx | Should Be 1
        Get-MgOut | Should Match 'origin/main'
        $null = Invoke-MgGit $fx.Root @('update-ref', 'refs/remotes/origin/main', $fx.MainSha)
    }
    It 'refuses a dirty tracked file' {
        Add-Content -LiteralPath (Join-Path $fx.Root 'notes.txt') -Value 'dirty'
        Invoke-MgMain -Fixture $fx | Should Be 1
        Get-MgOut | Should Match 'not clean'
        $null = Invoke-MgGit $fx.Root @('checkout', '--', 'notes.txt')
    }
    It 'refuses staged changes' {
        Add-Content -LiteralPath (Join-Path $fx.Root 'notes.txt') -Value 'staged'
        $null = Invoke-MgGit $fx.Root @('add', 'notes.txt')
        Invoke-MgMain -Fixture $fx | Should Be 1
        Get-MgOut | Should Match 'not clean'
        $null = Invoke-MgGit $fx.Root @('reset', '--hard', 'HEAD')
    }
    It 'refuses an unexpected untracked file' {
        Set-Content -LiteralPath (Join-Path $fx.Root 'stray.txt') -Value 'stray' -Encoding Ascii
        Invoke-MgMain -Fixture $fx | Should Be 1
        Get-MgOut | Should Match 'not clean'
        Remove-Item -LiteralPath (Join-Path $fx.Root 'stray.txt')
    }
    It 'refuses an in-progress operation (MERGE_HEAD present)' {
        $mh = Join-Path $fx.Root '.git\MERGE_HEAD'
        Set-Content -LiteralPath $mh -Value $fx.BranchTip -Encoding Ascii
        Invoke-MgMain -Fixture $fx | Should Be 1
        Get-MgOut | Should Match 'in progress'
        Remove-Item -LiteralPath $mh
    }
    It 'refuses a stale local branch ref (plan branchTip behind the real ref)' {
        Write-MgPlan -Fixture $fx -Overrides @{ branchTip = ("'" + $fx.ReviewedTip + "'") }
        Invoke-MgMain -Fixture $fx | Should Be 1
        Get-MgOut | Should Match 'branchTip'
        Write-MgPlan -Fixture $fx
    }
    It 'refuses a branchTip that is already an ancestor of main' {
        $null = Invoke-MgGit $fx.Root @('branch', 'stale-anc', $fx.Base)
        Write-MgPlan -Fixture $fx -Overrides @{
            branch = "'stale-anc'"
            branchTip = ("'" + $fx.Base + "'"); reviewedTip = ("'" + $fx.Base + "'"); reviewedBase = ("'" + $fx.Base + "'")
        }
        Invoke-MgMain -Fixture $fx | Should Be 1
        Get-MgOut | Should Match 'already an ancestor'
        Write-MgPlan -Fixture $fx
    }
    It 'refuses a missing pinned diff' {
        Remove-Item -LiteralPath $fx.DiffAbs
        Invoke-MgMain -Fixture $fx | Should Be 1
        Get-MgOut | Should Match 'pinned diff not found'
        Restore-MgPinnedDiff -Fixture $fx
    }
    It 'refuses a pinned diff that does not byte-match the regenerated reviewed diff' {
        [System.IO.File]::AppendAllText($fx.DiffAbs, ' ')
        Invoke-MgMain -Fixture $fx | Should Be 1
        Get-MgOut | Should Match 'byte-match'
        Restore-MgPinnedDiff -Fixture $fx
    }
    It 'refuses a pinned diff reached through a reparse point (junction)' {
        $real = Join-Path $fx.Root '.worktrees\real'
        [void](New-Item -ItemType Directory -Path $real -Force)
        Copy-Item -LiteralPath $fx.DiffAbs -Destination (Join-Path $real '.agent-review-demo.diff')
        $jn = Join-Path $fx.Root '.worktrees\jn'
        [void](New-Item -ItemType Junction -Path $jn -Value $real)
        Write-MgPlan -Fixture $fx -Overrides @{ pinnedDiff = "'.worktrees/jn/.agent-review-demo.diff'" }
        Invoke-MgMain -Fixture $fx | Should Be 1
        Get-MgOut | Should Match 'reparse'
        [System.IO.Directory]::Delete($jn, $false)
        Write-MgPlan -Fixture $fx
    }
    It 'still passes after all restorations (fixture integrity control)' {
        Invoke-MgMain -Fixture $fx | Should Be 0
        Get-MgOut | Should Match 'PREFLIGHT: PASS'
    }
}

# --------------------------------------------------------------------------------------------
# Preflight: plan/pinned-diff gitignore requirements
# --------------------------------------------------------------------------------------------

Describe 'merge-gate preflight: gitignore requirements' {
    Mock Write-MergeGateOutput { $global:MgOut += $Message }

    It 'refuses a plan file that is not gitignored' {
        $fx = New-MgFixture -OmitPlanIgnore
        Invoke-MgMain -Fixture $fx | Should Be 1
        Get-MgOut | Should Match 'plan file is not gitignored'
    }
    It 'refuses a pinned diff that is not gitignored' {
        $fx = New-MgFixture -OmitDiffIgnore -PinnedInWorktreesDir
        Invoke-MgMain -Fixture $fx | Should Be 1
        Get-MgOut | Should Match 'pinned diff is not gitignored'
    }
    It 'accepts a pinned diff inside the .worktrees/ container when ignored' {
        $fx = New-MgFixture -PinnedInWorktreesDir
        Invoke-MgMain -Fixture $fx | Should Be 0
        Get-MgOut | Should Match 'PREFLIGHT: PASS'
    }
}

# --------------------------------------------------------------------------------------------
# Reviewed-tip / branch-tip handoff-tail policy
# --------------------------------------------------------------------------------------------

Describe 'merge-gate preflight: handoff-tail policy' {
    Mock Write-MergeGateOutput { $global:MgOut += $Message }
    $fx = New-MgFixture -TailCommits 0

    It 'accepts reviewedTip == branchTip (no tail)' {
        Write-MgPlan -Fixture $fx
        Invoke-MgMain -Fixture $fx | Should Be 0
        Get-MgOut | Should Match 'PREFLIGHT: PASS'
    }
    It 'accepts a 1-commit handoff-doc-only tail' {
        Reset-MgFeatureBranch -Fixture $fx -ToSha $fx.ReviewedTip
        $tip = Add-MgTailCommits -Fixture $fx -Kind 'handoff' -Count 1
        Write-MgPlan -Fixture $fx -Overrides @{ branchTip = ("'" + $tip + "'") }
        Invoke-MgMain -Fixture $fx | Should Be 0
    }
    It 'accepts the 3-commit tail boundary' {
        Reset-MgFeatureBranch -Fixture $fx -ToSha $fx.ReviewedTip
        $tip = Add-MgTailCommits -Fixture $fx -Kind 'handoff' -Count 3
        Write-MgPlan -Fixture $fx -Overrides @{ branchTip = ("'" + $tip + "'") }
        Invoke-MgMain -Fixture $fx | Should Be 0
    }
    It 'refuses a 4-commit tail' {
        Reset-MgFeatureBranch -Fixture $fx -ToSha $fx.ReviewedTip
        $tip = Add-MgTailCommits -Fixture $fx -Kind 'handoff' -Count 4
        Write-MgPlan -Fixture $fx -Overrides @{ branchTip = ("'" + $tip + "'") }
        Invoke-MgMain -Fixture $fx | Should Be 1
        Get-MgOut | Should Match 'handoff tail'
    }
    It 'refuses a tail containing code' {
        Reset-MgFeatureBranch -Fixture $fx -ToSha $fx.ReviewedTip
        $tip = Add-MgTailCommits -Fixture $fx -Kind 'code' -Count 1
        Write-MgPlan -Fixture $fx -Overrides @{ branchTip = ("'" + $tip + "'") }
        Invoke-MgMain -Fixture $fx | Should Be 1
        Get-MgOut | Should Match 'may only MODIFY'
    }
    It 'refuses a tail touching a second Markdown file' {
        Reset-MgFeatureBranch -Fixture $fx -ToSha $fx.ReviewedTip
        $tip = Add-MgTailCommits -Fixture $fx -Kind 'md' -Count 1
        Write-MgPlan -Fixture $fx -Overrides @{ branchTip = ("'" + $tip + "'") }
        Invoke-MgMain -Fixture $fx | Should Be 1
        Get-MgOut | Should Match 'may only MODIFY'
    }
    It 'refuses a tail that deletes the handoff doc' {
        Reset-MgFeatureBranch -Fixture $fx -ToSha $fx.ReviewedTip
        $tip = Add-MgTailCommits -Fixture $fx -Kind 'delete' -Count 1
        Write-MgPlan -Fixture $fx -Overrides @{ branchTip = ("'" + $tip + "'") }
        Invoke-MgMain -Fixture $fx | Should Be 1
        Get-MgOut | Should Match 'REFUSED'
    }
    It 'refuses a tail that changes the handoff doc file mode' {
        Reset-MgFeatureBranch -Fixture $fx -ToSha $fx.ReviewedTip
        $tip = Add-MgTailCommits -Fixture $fx -Kind 'chmod' -Count 1
        Write-MgPlan -Fixture $fx -Overrides @{ branchTip = ("'" + $tip + "'") }
        Invoke-MgMain -Fixture $fx | Should Be 1
        Get-MgOut | Should Match '100644|REFUSED'
        Reset-MgFeatureBranch -Fixture $fx -ToSha $fx.ReviewedTip
    }
}

# --------------------------------------------------------------------------------------------
# Advanced-main composition + merge-base policy
# --------------------------------------------------------------------------------------------

Describe 'merge-gate preflight: advanced-main and merge-base policy' {
    Mock Write-MergeGateOutput { $global:MgOut += $Message }

    It 'accepts a valid advanced-main (K5/Fast Clear shaped) composition' {
        $fx = New-MgFixture -AdvancedMain
        Invoke-MgMain -Fixture $fx | Should Be 0
        Get-MgOut | Should Match 'PREFLIGHT: PASS'
    }
    It 'refuses when merge-base(main, branchTip) is not the plan reviewedBase' {
        $fx = New-MgFixture -AdvancedMain
        Write-MgPlan -Fixture $fx -Overrides @{ reviewedBase = ("'" + $fx.ReviewedTip + "'") }
        Invoke-MgMain -Fixture $fx | Should Be 1
        Get-MgOut | Should Match 'merge-base'
    }
    It 'refuses a predicted textual conflict and cleans its temp objects (failure cleanup)' {
        $fx = New-MgFixture -Conflict
        $tempBefore = Get-MgTempObjectDirs
        Invoke-MgMain -Fixture $fx | Should Be 1
        Get-MgOut | Should Match 'predicts a merge conflict'
        @(Get-MgTempObjectDirs | Where-Object { $tempBefore -notcontains $_ }).Count | Should Be 0
    }
}

# --------------------------------------------------------------------------------------------
# Documentation-only plans
# --------------------------------------------------------------------------------------------

Describe 'merge-gate preflight: documentation-only policy' {
    Mock Write-MergeGateOutput { $global:MgOut += $Message }

    It 'accepts an all-Markdown range with empty gates' {
        $fx = New-MgFixture -DocsOnlyFeature -TailCommits 0
        Write-MgPlan -Fixture $fx -Overrides @{ documentationOnly = '$true'; gates = '@()' }
        Invoke-MgMain -Fixture $fx | Should Be 0
        Get-MgOut | Should Match 'PREFLIGHT: PASS'
    }
    It 'refuses empty gates when the range touches non-Markdown' {
        $fx = New-MgFixture -TailCommits 0
        Write-MgPlan -Fixture $fx -Overrides @{ documentationOnly = '$true'; gates = '@()' }
        Invoke-MgMain -Fixture $fx | Should Be 1
        Get-MgOut | Should Match 'non-Markdown'
    }
}

# --------------------------------------------------------------------------------------------
# Apply: confirmation, TOCTOU, merge execution, verification, gates
# --------------------------------------------------------------------------------------------

Describe 'merge-gate apply: confirmation and TOCTOU rechecks' {
    Mock Write-MergeGateOutput { $global:MgOut += $Message }
    Mock Assert-MergeGateInteractiveConsole { }
    Mock Read-MergeGateConfirmation {
        if ($null -ne $global:MgConfirmAction) { & $global:MgConfirmAction }
        return $global:MgConfirmText
    }
    Mock Invoke-MergeGateAppGate { return 0 }
    Mock Invoke-MergeGatePesterGate { return 0 }

    $fx = New-MgFixture
    $global:MgFxRoot = $fx.Root
    $global:MgFxDiffAbs = $fx.DiffAbs
    $global:MgFxReviewedTip = $fx.ReviewedTip
    $global:MgFxBranchTip = $fx.BranchTip

    It 'refuses a wrong typed confirmation and performs no merge' {
        $global:MgConfirmAction = $null
        $global:MgConfirmText = 'MERGE 0123456789abcdef 0123456789ab'
        Invoke-MgMain -Fixture $fx -Apply | Should Be 1
        Get-MgOut | Should Match 'confirmation text did not match'
        Get-MgSha $fx.Root 'HEAD' | Should Be $fx.MainSha
    }
    It 'refuses when the plan file changes between confirmation and apply' {
        Write-MgPlan -Fixture $fx
        $global:MgConfirmText = Get-MgExpectedConfirm -Fixture $fx
        $global:MgConfirmAction = { [System.IO.File]::AppendAllText((Join-Path $global:MgFxRoot '.merge-gate\plan.psd1'), "`r`n# tampered") }
        Invoke-MgMain -Fixture $fx -Apply | Should Be 1
        Get-MgOut | Should Match 'plan file changed'
        Get-MgSha $fx.Root 'HEAD' | Should Be $fx.MainSha
    }
    It 'refuses when the branch ref moves between confirmation and apply' {
        Write-MgPlan -Fixture $fx
        $global:MgConfirmText = Get-MgExpectedConfirm -Fixture $fx
        $global:MgConfirmAction = {
            $ErrorActionPreference = 'Continue'
            & git -C $global:MgFxRoot update-ref refs/heads/feature/demo $global:MgFxReviewedTip 2>&1 | Out-Null
        }
        Invoke-MgMain -Fixture $fx -Apply | Should Be 1
        Get-MgOut | Should Match 'REFUSED'
        Get-MgSha $fx.Root 'HEAD' | Should Be $fx.MainSha
        $null = Invoke-MgGit $fx.Root @('update-ref', 'refs/heads/feature/demo', $fx.BranchTip)
    }
    It 'refuses when the pinned diff changes between confirmation and apply' {
        Write-MgPlan -Fixture $fx
        $global:MgConfirmText = Get-MgExpectedConfirm -Fixture $fx
        $global:MgConfirmAction = { [System.IO.File]::AppendAllText($global:MgFxDiffAbs, ' ') }
        Invoke-MgMain -Fixture $fx -Apply | Should Be 1
        Get-MgOut | Should Match 'byte-match'
        Get-MgSha $fx.Root 'HEAD' | Should Be $fx.MainSha
        Restore-MgPinnedDiff -Fixture $fx
    }
    It 'refuses when HEAD moves between confirmation and apply (no merge on the new HEAD)' {
        Write-MgPlan -Fixture $fx
        $global:MgConfirmText = Get-MgExpectedConfirm -Fixture $fx
        $global:MgConfirmAction = {
            $ErrorActionPreference = 'Continue'
            & git -C $global:MgFxRoot commit --allow-empty -m sneak 2>&1 | Out-Null
        }
        Invoke-MgMain -Fixture $fx -Apply | Should Be 1
        Get-MgOut | Should Match 'HEAD is'
        $parents = @((Invoke-MgGit $fx.Root @('rev-list', '--parents', '-n', '1', 'HEAD')).Lines[0].Trim() -split '\s+')
        $parents.Count | Should Be 2   # ordinary commit, NOT a merge
        $global:MgConfirmAction = $null
    }
}

Describe 'merge-gate apply: successful merges' {
    Mock Write-MergeGateOutput { $global:MgOut += $Message }
    Mock Assert-MergeGateInteractiveConsole { }
    Mock Read-MergeGateConfirmation { return $global:MgConfirmText }
    Mock Invoke-MergeGateAppGate { return 0 }
    Mock Invoke-MergeGatePesterGate { return 0 }

    It 'merges a synchronized fixture: two parents, predicted tree == actual tree, inert message' {
        $fx = New-MgFixture
        $msg = 'Merge demo: metachars $x ; | & stay literal'
        Write-MgPlan -Fixture $fx -Overrides @{ mergeMessage = ("'" + $msg + "'") }
        $global:MgConfirmText = Get-MgExpectedConfirm -Fixture $fx
        Invoke-MgMain -Fixture $fx -Apply | Should Be 0
        Get-MgOut | Should Match 'LOCAL MERGE COMPLETE'
        $parents = @((Invoke-MgGit $fx.Root @('rev-list', '--parents', '-n', '1', 'HEAD')).Lines[0].Trim() -split '\s+')
        $parents.Count | Should Be 3
        $parents[1] | Should Be $fx.MainSha
        $parents[2] | Should Be $fx.BranchTip
        $m = [regex]::Match((Get-MgOut), 'predicted tree\s*:\s*([0-9a-f]{40})')
        $m.Success | Should Be $true
        (Get-MgSha $fx.Root 'HEAD^{tree}') | Should Be $m.Groups[1].Value
        (Invoke-MgGit $fx.Root @('log', '-1', '--format=%s')).Lines[0] | Should Be $msg
    }
    It 'merges an advanced-main composition: parent1 = advanced main, tree is the 3-way result' {
        $fx = New-MgFixture -AdvancedMain
        Write-MgPlan -Fixture $fx
        $global:MgConfirmText = Get-MgExpectedConfirm -Fixture $fx
        Invoke-MgMain -Fixture $fx -Apply | Should Be 0
        $parents = @((Invoke-MgGit $fx.Root @('rev-list', '--parents', '-n', '1', 'HEAD')).Lines[0].Trim() -split '\s+')
        $parents.Count | Should Be 3
        $parents[1] | Should Be $fx.MainSha
        $parents[2] | Should Be $fx.BranchTip
        # composition: the merge tree is neither side's tree (both contributed)
        (Get-MgSha $fx.Root 'HEAD^{tree}') | Should Not Be (Get-MgSha $fx.Root ($fx.BranchTip + '^{tree}'))
        (Get-MgSha $fx.Root 'HEAD^{tree}') | Should Not Be (Get-MgSha $fx.Root ($fx.MainSha + '^{tree}'))
    }
}

Describe 'merge-gate apply: gate failures retain the merge' {
    Mock Write-MergeGateOutput { $global:MgOut += $Message }
    Mock Assert-MergeGateInteractiveConsole { }
    Mock Read-MergeGateConfirmation { return $global:MgConfirmText }

    It 'app-gate failure keeps the merge and prints DO NOT PUSH' {
        Mock Invoke-MergeGateAppGate { return 1 }
        Mock Invoke-MergeGatePesterGate { return 0 }
        $fx = New-MgFixture
        $global:MgConfirmText = Get-MgExpectedConfirm -Fixture $fx
        Invoke-MgMain -Fixture $fx -Apply | Should Be 1
        Get-MgOut | Should Match 'GATE FAILED'
        Get-MgOut | Should Match 'DO NOT PUSH'
        $parents = @((Invoke-MgGit $fx.Root @('rev-list', '--parents', '-n', '1', 'HEAD')).Lines[0].Trim() -split '\s+')
        $parents.Count | Should Be 3   # merge commit retained
    }
    It 'pester-gate failure keeps the merge and prints DO NOT PUSH' {
        Mock Invoke-MergeGateAppGate { return 0 }
        Mock Invoke-MergeGatePesterGate { return 1 }
        $fx = New-MgFixture
        $global:MgConfirmText = Get-MgExpectedConfirm -Fixture $fx
        Invoke-MgMain -Fixture $fx -Apply | Should Be 1
        Get-MgOut | Should Match 'GATE FAILED'
        Get-MgOut | Should Match 'DO NOT PUSH'
        $parents = @((Invoke-MgGit $fx.Root @('rev-list', '--parents', '-n', '1', 'HEAD')).Lines[0].Trim() -split '\s+')
        $parents.Count | Should Be 3
    }
}

# --------------------------------------------------------------------------------------------
# Conflict handling: guarded abort
# --------------------------------------------------------------------------------------------

Describe 'merge-gate conflict stop: guarded --abort' {
    Mock Write-MergeGateOutput { $global:MgOut += $Message }
    $fx = New-MgFixture -Conflict

    It 'aborts a real conflicted merge only because MERGE_HEAD exists' {
        $m = Invoke-MgGit $fx.Root @('merge', '--no-ff', '-m', 'conflict test', '--', 'feature/demo')
        $m.ExitCode | Should Not Be 0
        Test-Path -LiteralPath (Join-Path $fx.Root '.git\MERGE_HEAD') | Should Be $true
        $global:MgOut = @()
        Push-Location $fx.Root
        try {
            $repo = Resolve-MergeGateRepository
            $ret = Invoke-MergeGateConflictStop -Repo $repo -MergeText 'simulated conflict output'
        } finally { Pop-Location }
        $ret | Should Be 1
        Test-Path -LiteralPath (Join-Path $fx.Root '.git\MERGE_HEAD') | Should Be $false
        Get-MgSha $fx.Root 'HEAD' | Should Be $fx.MainSha
        (Invoke-MgGit $fx.Root @('--no-optional-locks', 'status', '--porcelain')).Text | Should Be ''
        Get-MgOut | Should Match 'DO NOT PUSH'
    }
    It 'does not call --abort when no MERGE_HEAD exists' {
        $global:MgOut = @()
        Push-Location $fx.Root
        try {
            $repo = Resolve-MergeGateRepository
            $ret = Invoke-MergeGateConflictStop -Repo $repo -MergeText 'no merge in progress'
        } finally { Pop-Location }
        $ret | Should Be 1
        Get-MgOut | Should Match 'nothing to abort'
        Get-MgSha $fx.Root 'HEAD' | Should Be $fx.MainSha
    }
}

# --------------------------------------------------------------------------------------------
# Fixture cleanup (guarded: only bh-merge-gate-test-* leaves directly under %TEMP%)
# --------------------------------------------------------------------------------------------

foreach ($root in @($script:MgFixtureRoots)) {
    if (-not (Test-Path -LiteralPath $root)) { continue }
    $canon = [System.IO.Path]::GetFullPath($root).TrimEnd('\')
    $parent = Split-Path -Parent $canon
    $leaf = Split-Path -Leaf $canon
    if (-not [string]::Equals($parent, $script:MgTempParent, [System.StringComparison]::OrdinalIgnoreCase)) { continue }
    if (-not $leaf.StartsWith('bh-merge-gate-test-')) { continue }
    # remove any reparse-point directories non-recursively first so -Recurse cannot traverse them
    foreach ($d in @(Get-ChildItem -LiteralPath $canon -Recurse -Force -ErrorAction SilentlyContinue |
        Where-Object { $_.PSIsContainer -and (($_.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) })) {
        [System.IO.Directory]::Delete($d.FullName, $false)
    }
    foreach ($f in @(Get-ChildItem -LiteralPath $canon -Recurse -Force -ErrorAction SilentlyContinue |
        Where-Object { -not $_.PSIsContainer })) {
        if (($f.Attributes -band [System.IO.FileAttributes]::ReadOnly) -ne 0) { $f.Attributes = [System.IO.FileAttributes]::Normal }
    }
    Remove-Item -LiteralPath $canon -Recurse -Force -ErrorAction SilentlyContinue
}
foreach ($g in @('MgOut', 'MgConfirmText', 'MgConfirmAction', 'MgFxRoot', 'MgFxDiffAbs', 'MgFxReviewedTip', 'MgFxBranchTip')) {
    Remove-Variable -Name $g -Scope Global -ErrorAction SilentlyContinue
}
