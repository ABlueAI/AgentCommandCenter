<#
.SYNOPSIS
  Pester tests for Get-RunOutputFile, including a direct reproduction of the stale-file bug found
  in live testing (2026-07-08): a run whose download produced nothing must never be handed a
  leftover file from a prior, unrelated run.
.DESCRIPTION
  Run with: Invoke-Pester -Path scripts\lib\get-run-output-file.Tests.ps1
#>
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
. (Join-Path $here 'get-run-output-file.ps1')
. (Join-Path $here 'get-video-scout-run-dir.ps1')

Describe 'Get-RunOutputFile' {

    $testBase = Join-Path $env:TEMP ("run-output-test-{0}" -f ([guid]::NewGuid().ToString('N')))

    It 'finds a file this run actually produced' {
        $runDir = New-VideoScoutRunDir -BaseDir $testBase
        Set-Content -LiteralPath (Join-Path $runDir 'Some_Video.en.srt') -Value 'subtitle content'
        $found = Get-RunOutputFile -RunDir $runDir -Pattern '*.srt'
        $found | Should Not Be $null
        $found.Name | Should Be 'Some_Video.en.srt'
    }

    It 'returns $null (not a throw) when the run dir has no matching file' {
        $runDir = New-VideoScoutRunDir -BaseDir $testBase
        $found = Get-RunOutputFile -RunDir $runDir -Pattern '*.srt'
        $found | Should Be $null
    }

    # --- direct reproduction of the live-tested bug --------------------------------------------
    # Original behavior: Get-ChildItem $OutDir (the whole, flat, shared download folder) | Sort
    # LastWriteTime -Descending | Select -First 1 -- which finds the newest matching file ANYWHERE
    # in $OutDir, including one left over from a completely unrelated prior run. A caption-less
    # video (this run's real-world trigger: yt-dlp reported "There are no subtitles for the
    # requested languages") then silently got the WRONG video's transcript fed to Gemini, with no
    # error. This test proves the new per-run-directory design makes that impossible: a stale file
    # sitting in a sibling run directory (or the shared base dir) must NEVER be returned when
    # searching an unrelated, empty run dir.
    It 'BUG REPRO: never returns a stale file left over from a prior run, even though one exists and is newer' {
        # Simulate an earlier, unrelated run that successfully produced a file.
        $staleRunDir = New-VideoScoutRunDir -BaseDir $testBase
        $staleFile = Join-Path $staleRunDir '4th_Of_July_Range_Special_Ft_Mark_Sulek.en.srt'
        Set-Content -LiteralPath $staleFile -Value 'unrelated prior video transcript'

        # Simulate THIS run: a fresh, empty run dir (its download produced nothing -- e.g. the
        # requested video had no captions). The stale file above is strictly newer than nothing,
        # so the OLD flat-directory-scan logic would have picked it up as "the newest match."
        Start-Sleep -Milliseconds 50
        $thisRunDir = New-VideoScoutRunDir -BaseDir $testBase

        $found = Get-RunOutputFile -RunDir $thisRunDir -Pattern '*.srt'

        $found | Should Be $null
        # Sanity: prove the stale file really does still exist and really would have matched the
        # pattern, so a $null result here is meaningful (not just an empty test fixture).
        Test-Path -LiteralPath $staleFile | Should Be $true
    }

    It 'BUG REPRO: a run with its own fresh file returns that file even when an older, unrelated file exists elsewhere' {
        $otherRunDir = New-VideoScoutRunDir -BaseDir $testBase
        Set-Content -LiteralPath (Join-Path $otherRunDir 'Old_Unrelated_Video.mp3') -Value 'old audio marker'

        Start-Sleep -Milliseconds 50
        $thisRunDir = New-VideoScoutRunDir -BaseDir $testBase
        Set-Content -LiteralPath (Join-Path $thisRunDir 'This_Runs_Video.mp3') -Value 'this run audio marker'

        $found = Get-RunOutputFile -RunDir $thisRunDir -Pattern '*.mp3'
        $found.Name | Should Be 'This_Runs_Video.mp3'
    }

    # Plain trailing cleanup (Pester 3.4.0 here has no BeforeAll/AfterAll -- those arrived in
    # Pester 4+ -- matching the convention already used in this lib directory).
    if (Test-Path -LiteralPath $testBase) { Remove-Item -LiteralPath $testBase -Recurse -Force }
}
