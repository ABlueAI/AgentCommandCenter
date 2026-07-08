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
