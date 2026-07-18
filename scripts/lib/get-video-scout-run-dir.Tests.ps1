<#
.SYNOPSIS
  Pester tests for New-VideoScoutRunDir (per-run download-directory isolation).
.DESCRIPTION
  Run with: Invoke-Pester -Path scripts\lib\get-video-scout-run-dir.Tests.ps1
#>
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
. (Join-Path $here 'get-video-scout-run-dir.ps1')

Describe 'New-VideoScoutRunDir' {

    $testBase = Join-Path $env:TEMP ("run-dir-test-{0}" -f ([guid]::NewGuid().ToString('N')))

    It 'creates the base dir if it does not exist yet' {
        Test-Path -LiteralPath $testBase | Should Be $false
        New-VideoScoutRunDir -BaseDir $testBase | Out-Null
        Test-Path -LiteralPath $testBase | Should Be $true
    }

    It 'returns a directory that actually exists' {
        $runDir = New-VideoScoutRunDir -BaseDir $testBase
        Test-Path -LiteralPath $runDir -PathType Container | Should Be $true
    }

    It 'nests the run dir underneath BaseDir' {
        $runDir = New-VideoScoutRunDir -BaseDir $testBase
        $runDir.StartsWith($testBase) | Should Be $true
    }

    It 'returns an empty directory (nothing pre-populated)' {
        $runDir = New-VideoScoutRunDir -BaseDir $testBase
        (Get-ChildItem -LiteralPath $runDir).Count | Should Be 0
    }

    It 'produces a different directory on every call (no collisions)' {
        $a = New-VideoScoutRunDir -BaseDir $testBase
        $b = New-VideoScoutRunDir -BaseDir $testBase
        $a | Should Not Be $b
    }

    # Plain trailing cleanup (this Pester install is 3.4.0, which has no BeforeAll/AfterAll --
    # those arrived in Pester 4+ -- matching the convention already used in this lib directory,
    # e.g. get-node-cli-arg.Tests.ps1's inline probe-file cleanup).
    if (Test-Path -LiteralPath $testBase) { Remove-Item -LiteralPath $testBase -Recurse -Force }
}

Describe 'Test-VideoScoutRunId (V5b1)' {
    It 'accepts a well-formed main-issued run ID' {
        Test-VideoScoutRunId -RunId 'run-20260718-090503-007-4242-deadbeef' | Should Be $true
    }
    It 'rejects path separators (forward and back slash)' {
        Test-VideoScoutRunId -RunId 'run-20260718-090503-007-4242-dead/eef' | Should Be $false
        Test-VideoScoutRunId -RunId 'run-20260718-090503-007-4242-dead\eef' | Should Be $false
        Test-VideoScoutRunId -RunId 'run-20260718-090503-007-4242-deadbeef/evil' | Should Be $false
    }
    It 'rejects traversal sequences' {
        Test-VideoScoutRunId -RunId '../run-20260718-090503-007-4242-deadbeef' | Should Be $false
        Test-VideoScoutRunId -RunId 'run-..-090503-007-4242-deadbeef' | Should Be $false
    }
    It 'rejects rooted / drive-prefixed values' {
        Test-VideoScoutRunId -RunId 'C:\run-20260718-090503-007-4242-deadbeef' | Should Be $false
        Test-VideoScoutRunId -RunId '\run-20260718-090503-007-4242-deadbeef' | Should Be $false
    }
    It 'rejects malformed stamps' {
        Test-VideoScoutRunId -RunId 'run-2026071-090503-007-4242-deadbeef' | Should Be $false   # short date
        Test-VideoScoutRunId -RunId 'run-20260718-90503-007-4242-deadbeef' | Should Be $false    # short time
        Test-VideoScoutRunId -RunId 'run-20260718-090503-07-4242-deadbeef' | Should Be $false     # short ms
    }
    It 'rejects malformed PIDs' {
        Test-VideoScoutRunId -RunId 'run-20260718-090503-007--deadbeef' | Should Be $false        # empty PID
        Test-VideoScoutRunId -RunId 'run-20260718-090503-007-4x42-deadbeef' | Should Be $false     # non-numeric PID
    }
    It 'rejects malformed hex suffixes' {
        Test-VideoScoutRunId -RunId 'run-20260718-090503-007-4242-deadbee' | Should Be $false      # 7 hex
        Test-VideoScoutRunId -RunId 'run-20260718-090503-007-4242-deadbeeff' | Should Be $false     # 9 hex
        Test-VideoScoutRunId -RunId 'run-20260718-090503-007-4242-DEADBEEF' | Should Be $false      # uppercase
    }
    It 'rejects an over-length value (bounds the open PID digit run)' {
        $long = 'run-20260718-090503-007-' + ('9' * 100) + '-deadbeef'
        Test-VideoScoutRunId -RunId $long | Should Be $false
    }
    It 'rejects non-strings and empty' {
        Test-VideoScoutRunId -RunId $null | Should Be $false
        Test-VideoScoutRunId -RunId 42 | Should Be $false
        Test-VideoScoutRunId -RunId '' | Should Be $false
    }
}

Describe 'New-VideoScoutRunDirFromId (V5b1)' {
    $base = Join-Path $env:TEMP ("run-fromid-test-{0}" -f ([guid]::NewGuid().ToString('N')))

    It 'creates the run directory as a direct child of the fixed base, named exactly the run ID' {
        $rid = 'run-20260718-090503-007-4242-deadbeef'
        $dir = New-VideoScoutRunDirFromId -BaseDir $base -RunId $rid
        Test-Path -LiteralPath $dir -PathType Container | Should Be $true
        (Split-Path -Leaf $dir) | Should Be $rid
        (Split-Path -Parent $dir).TrimEnd('\','/') | Should Be ((Resolve-Path -LiteralPath $base).ProviderPath.TrimEnd('\','/'))
    }

    It 'refuses an invalid run ID before touching the filesystem' {
        { New-VideoScoutRunDirFromId -BaseDir $base -RunId 'run-20260718-090503-007-4242-dead/eef' } | Should Throw
        { New-VideoScoutRunDirFromId -BaseDir $base -RunId '../escape' } | Should Throw
    }

    It 'refuses a collision (never reuses or overwrites an existing run directory)' {
        $rid = 'run-20260718-090504-000-4242-cafebabe'
        New-VideoScoutRunDirFromId -BaseDir $base -RunId $rid | Out-Null
        { New-VideoScoutRunDirFromId -BaseDir $base -RunId $rid } | Should Throw
    }

    if (Test-Path -LiteralPath $base) { Remove-Item -LiteralPath $base -Recurse -Force }
}
