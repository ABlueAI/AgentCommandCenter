<#
.SYNOPSIS
  Pester tests for the V5b1 create-only atomic report writer (write-video-scout-report.ps1).
.DESCRIPTION
  Run with: Invoke-Pester -Path scripts\lib\write-video-scout-report.Tests.ps1
  Verifies UTF-8 without BOM, temp+final in the same run dir, create-only refusal, temp cleanup on
  a blocked rename, no copy fallback, and that the constant filename is returned.
#>
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
. (Join-Path $here 'write-video-scout-report.ps1')

Describe 'Write-VideoScoutReportFile (V5b1 atomic, create-only)' {
    $base = Join-Path $env:TEMP ("report-writer-test-{0}" -f ([guid]::NewGuid().ToString('N')))
    New-Item -ItemType Directory -Path $base -Force | Out-Null

    function New-RunDir { $d = Join-Path $base ([guid]::NewGuid().ToString('N')); New-Item -ItemType Directory -Path $d | Out-Null; $d }

    It 'returns the constant leaf filename analysis-output.txt' {
        $rd = New-RunDir
        (Write-VideoScoutReportFile -RunDir $rd -Text 'hello') | Should Be 'analysis-output.txt'
        (Get-VideoScoutReportFileName) | Should Be 'analysis-output.txt'
    }

    It 'writes the report as UTF-8 WITHOUT a BOM' {
        $rd = New-RunDir
        Write-VideoScoutReportFile -RunDir $rd -Text 'cafe 🎥 text' | Out-Null
        $bytes = [System.IO.File]::ReadAllBytes((Join-Path $rd 'analysis-output.txt'))
        # No UTF-8 BOM (EF BB BF) at the front.
        ($bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF) | Should Be $false
        # Content round-trips as UTF-8.
        ([System.Text.Encoding]::UTF8.GetString($bytes)) | Should Be 'cafe 🎥 text'
    }

    It 'leaves the final file and NO leftover temp files in the run directory' {
        $rd = New-RunDir
        Write-VideoScoutReportFile -RunDir $rd -Text 'body' | Out-Null
        (Test-Path -LiteralPath (Join-Path $rd 'analysis-output.txt')) | Should Be $true
        @(Get-ChildItem -LiteralPath $rd -Filter '*.tmp-*').Count | Should Be 0
    }

    It 'refuses (throws) if the report already exists and never overwrites it' {
        $rd = New-RunDir
        Write-VideoScoutReportFile -RunDir $rd -Text 'first' | Out-Null
        { Write-VideoScoutReportFile -RunDir $rd -Text 'second' } | Should Throw
        # Original content is intact (no overwrite), no temp left behind.
        (Get-Content -LiteralPath (Join-Path $rd 'analysis-output.txt') -Raw) | Should Be 'first'
        @(Get-ChildItem -LiteralPath $rd -Filter '*.tmp-*').Count | Should Be 0
    }

    It 'cleans up its temp file and throws when the rename is blocked (target pre-exists as a directory)' {
        # Make the final NAME already exist as a DIRECTORY: the create-only pre-check throws, but even
        # if it did not, the Move would fail — either way no temp file may be left behind.
        $rd = New-RunDir
        New-Item -ItemType Directory -Path (Join-Path $rd 'analysis-output.txt') | Out-Null
        { Write-VideoScoutReportFile -RunDir $rd -Text 'body' } | Should Throw
        @(Get-ChildItem -LiteralPath $rd -Filter '*.tmp-*').Count | Should Be 0
    }

    It 'refuses when the run directory does not exist' {
        { Write-VideoScoutReportFile -RunDir (Join-Path $base 'does-not-exist') -Text 'x' } | Should Throw
    }

    It 'writes the temp file inside the SAME run directory (same volume => rename-class atomic)' {
        # Prove structurally: the writer only ever joins tmp under $RunDir. Source-level guard.
        $src = Get-Content -LiteralPath (Join-Path $here 'write-video-scout-report.ps1') -Raw
        ($src -match "Join-Path \`$RunDir \(\`$script:VideoScoutReportFileName \+ '\.tmp-'") | Should Be $true
        # And there is NO copy fallback (no Copy-Item / File]::Copy in the writer).
        ($src -match 'Copy-Item|\]::Copy\(') | Should Be $false
    }

    if (Test-Path -LiteralPath $base) { Remove-Item -LiteralPath $base -Recurse -Force }
}
