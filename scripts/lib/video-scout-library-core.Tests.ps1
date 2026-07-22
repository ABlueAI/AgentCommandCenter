<#
.SYNOPSIS
  V5b2 Pester tests for the Video Scout Library core (video-scout-library-core.ps1): the run-id shape
  gate, reparse detection, date normalization, report-status derivation, the bounded fail-closed LIST
  enumeration, and the RE-VALIDATING READ action (TOCTOU). Uses the shared schema
  (video-scout-manifest-schema.ps1) as the sole validator, exactly like production.
.DESCRIPTION
  Run with: Invoke-Pester -Path scripts\lib\video-scout-library-core.Tests.ps1
  No network, no Gemini, no report written outside the per-test temp roots.
#>
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
. (Join-Path $here 'video-scout-manifest-schema.ps1')
. (Join-Path $here 'video-scout-library-core.ps1')

$utf8 = New-Object System.Text.UTF8Encoding $false
function New-TempRoot {
    $r = Join-Path $env:TEMP ("vslib-{0}" -f ([guid]::NewGuid().ToString('N')))
    New-Item -ItemType Directory -Path $r -Force | Out-Null
    $r
}
function New-RunDir { param($Root, $RunId) $d = Join-Path $Root $RunId; New-Item -ItemType Directory -Path $d -Force | Out-Null; $d }
function Write-ManifestJson { param($RunDir, $Obj)
    [System.IO.File]::WriteAllText((Join-Path $RunDir 'manifest.json'), ($Obj | ConvertTo-Json -Depth 8), $utf8)
}
function Write-RawManifest { param($RunDir, [string]$Text)
    [System.IO.File]::WriteAllText((Join-Path $RunDir 'manifest.json'), $Text, $utf8)
}
function New-LiveManifestObj { param([string]$RunId, [string]$Outcome = $null, [string]$ReportFile = $null, [string]$Title = 'Sample Video')
    $m = New-VideoScoutLiveManifest -RunId $RunId -Url 'https://youtu.be/x' -AppliedMode 'transcript' -Route 'cli' -MediaResolutionRequested 'MEDIUM' -VideoScout $true
    $m.videoTitle = $Title
    if ($Outcome) { $m.outcome = $Outcome; $m.finishedAt = $m.startedAt }
    if ($ReportFile) { $m.reportFile = $ReportFile }
    $m
}

Describe 'Test-VideoScoutLibraryRunId' {
    It 'accepts a post-P10 (hex-suffixed) run id' { Test-VideoScoutLibraryRunId 'run-20260718-120000-000-1234-a5e6070a' | Should Be $true }
    It 'accepts a pre-P10 (no hex suffix) legacy run id' { Test-VideoScoutLibraryRunId 'run-20260708-150835-583-44172' | Should Be $true }
    It 'rejects separators / traversal / rooted / drive' {
        Test-VideoScoutLibraryRunId 'run-20260718-120000-000-1-aaaaaaaa/evil' | Should Be $false
        Test-VideoScoutLibraryRunId '..\run-20260718-120000-000-1-aaaaaaaa' | Should Be $false
        Test-VideoScoutLibraryRunId 'C:\run-20260718-120000-000-1-aaaaaaaa' | Should Be $false
    }
    It 'rejects an uppercase hex suffix' { Test-VideoScoutLibraryRunId 'run-20260718-120000-000-1-AAAAAAAA' | Should Be $false }
    It 'rejects non-string / empty / over-length' {
        Test-VideoScoutLibraryRunId $null | Should Be $false
        Test-VideoScoutLibraryRunId '' | Should Be $false
        Test-VideoScoutLibraryRunId ('run-20260718-120000-000-' + ('9' * 100) + '-aaaaaaaa') | Should Be $false
    }
}

Describe 'Resolve-VideoScoutEntryDate' {
    It 'marks a live UTC startedAt as exact' {
        $d = Resolve-VideoScoutEntryDate -Manifest ([pscustomobject]@{ startedAt = '2026-07-18T17:03:59.368Z' })
        $d.kind | Should Be 'exact'; $d.value | Should Be '2026-07-18T17:03:59.368Z'; ($d.sortMs -gt 0) | Should Be $true
    }
    It 'marks a backfill local stamp as approximate (no fabricated UTC)' {
        $bf = [pscustomobject]@{ startedAt = $null; backfill = [pscustomobject]@{ startedAtFromDirNameLocal = '2026-07-08T15:08:35.583' } }
        $d = Resolve-VideoScoutEntryDate -Manifest $bf
        $d.kind | Should Be 'approximate'; $d.value | Should Be '2026-07-08T15:08:35.583'
    }
    It 'marks missing/invalid provenance as unknown (never null-sorted away)' {
        (Resolve-VideoScoutEntryDate -Manifest ([pscustomobject]@{ startedAt = $null })).kind | Should Be 'unknown'
        $bad = [pscustomobject]@{ startedAt = 'not-a-date'; backfill = [pscustomobject]@{ startedAtFromDirNameLocal = 'nope' } }
        (Resolve-VideoScoutEntryDate -Manifest $bad).kind | Should Be 'unknown'
    }
}

Describe 'Get-VideoScoutReportStatusFromManifest' {
    It 'completed + report -> available' { Get-VideoScoutReportStatusFromManifest ([pscustomobject]@{ outcome = 'completed'; reportFile = 'analysis-output.txt' }) | Should Be 'available' }
    It 'completed + null report -> not-persisted' { Get-VideoScoutReportStatusFromManifest ([pscustomobject]@{ outcome = 'completed'; reportFile = $null }) | Should Be 'not-persisted' }
    It 'refused/error/null outcome -> incomplete' {
        Get-VideoScoutReportStatusFromManifest ([pscustomobject]@{ outcome = 'refused'; reportFile = $null }) | Should Be 'incomplete'
        Get-VideoScoutReportStatusFromManifest ([pscustomobject]@{ outcome = $null; reportFile = $null }) | Should Be 'incomplete'
    }
    It 'a backfill (historical) -> not-persisted regardless of null outcome' {
        Get-VideoScoutReportStatusFromManifest ([pscustomobject]@{ outcome = $null; reportFile = $null; backfill = [pscustomobject]@{ startedAtApproximate = $true } }) | Should Be 'not-persisted'
    }
}

Describe 'Invoke-VideoScoutLibraryList (indexer)' {
    It 'returns rootExists=false for a missing root (no error)' {
        $r = Invoke-VideoScoutLibraryList -RunRoot (Join-Path $env:TEMP ('nope-' + [guid]::NewGuid().ToString('N')))
        $r.ok | Should Be $true; $r.rootExists | Should Be $false; @($r.entries).Count | Should Be 0
    }
    It 'projects a valid completed-with-report live run as available + exact' {
        $root = New-TempRoot
        $rid = 'run-20260718-120000-000-1000-aaaaaaaa'
        $d = New-RunDir $root $rid
        Write-ManifestJson -RunDir $d -Obj (New-LiveManifestObj -RunId $rid -Outcome 'completed' -ReportFile 'analysis-output.txt')
        [System.IO.File]::WriteAllText((Join-Path $d 'analysis-output.txt'), "## 1. TL;DR`nhi", $utf8)
        $r = Invoke-VideoScoutLibraryList -RunRoot $root
        @($r.entries).Count | Should Be 1
        $e = @($r.entries)[0]
        $e.runId | Should Be $rid; $e.reportStatus | Should Be 'available'; $e.dateKind | Should Be 'exact'
        Remove-Item -LiteralPath $root -Recurse -Force
    }
    It 'projects a backfill as approximate + not-persisted' {
        $root = New-TempRoot
        $rid = 'run-20260708-150835-583-44172'
        $d = New-RunDir $root $rid
        Write-ManifestJson -RunDir $d -Obj (New-VideoScoutBackfillManifest -RunId $rid -AppliedMode 'transcript' -VideoTitle 'Legacy' -StartedAtFromDirNameLocal '2026-07-08T15:08:35.583')
        $r = Invoke-VideoScoutLibraryList -RunRoot $root
        $e = @($r.entries)[0]
        $e.dateKind | Should Be 'approximate'; $e.reportStatus | Should Be 'not-persisted'
        Remove-Item -LiteralPath $root -Recurse -Force
    }
    It 'excludes + counts invalid records (missing / oversized / malformed / schema / mismatch / bad-name) with bounded reasons' {
        $root = New-TempRoot
        # missing manifest
        New-RunDir $root 'run-20260718-120001-000-1-bbbbbbbb' | Out-Null
        # oversized manifest
        $big = New-RunDir $root 'run-20260718-120002-000-1-cccccccc'
        Write-RawManifest -RunDir $big -Text ('{"x":"' + ('a' * 300000) + '"}')
        # malformed json
        $bad = New-RunDir $root 'run-20260718-120003-000-1-dddddddd'
        Write-RawManifest -RunDir $bad -Text '{ not json'
        # schema invalid (well-formed json, wrong shape) with a HOSTILE title that must NOT leak
        $sch = New-RunDir $root 'run-20260718-120004-000-1-eeeeeeee'
        Write-RawManifest -RunDir $sch -Text '{"schemaVersion":1,"videoTitle":"<script>HOSTILE</script>"}'
        # runId/dir mismatch (valid manifest but its runId != leaf)
        $mm = New-RunDir $root 'run-20260718-120005-000-1-ffffffff'
        Write-ManifestJson -RunDir $mm -Obj (New-LiveManifestObj -RunId 'run-20260718-120005-000-1-99999999' -Outcome 'error')
        # bad directory name (not a run-id shape)
        New-RunDir $root 'not-a-run-dir' | Out-Null
        $r = Invoke-VideoScoutLibraryList -RunRoot $root
        @($r.entries).Count | Should Be 0
        @($r.invalid).Count | Should Be 6
        $reasons = @($r.invalid | ForEach-Object { $_.reason })
        ($reasons -contains 'manifest-missing') | Should Be $true
        ($reasons -contains 'manifest-too-large') | Should Be $true
        ($reasons -contains 'manifest-json-invalid') | Should Be $true
        ($reasons -contains 'manifest-schema-invalid') | Should Be $true
        ($reasons -contains 'runid-mismatch') | Should Be $true
        ($reasons -contains 'run-id-shape') | Should Be $true
        # No hostile manifest content leaks into diagnostics.
        (($r.invalid | ConvertTo-Json -Depth 6) -match 'HOSTILE') | Should Be $false
        Remove-Item -LiteralPath $root -Recurse -Force
    }
    It 'refuses a reparse-point run directory (junction) and counts it invalid' {
        $root = New-TempRoot
        $target = New-TempRoot
        $rid = 'run-20260718-120006-000-1-12345678'
        $link = Join-Path $root $rid
        cmd /c mklink /J "$link" "$target" | Out-Null
        if (Test-Path -LiteralPath $link) {
            $r = Invoke-VideoScoutLibraryList -RunRoot $root
            @($r.entries).Count | Should Be 0
            (@($r.invalid | ForEach-Object { $_.reason }) -contains 'reparse-directory') | Should Be $true
        } else {
            # Junctions need no admin on Win10+, but if this environment blocks them, fall back to a
            # direct unit check that the reparse detector at least returns $false for a plain dir.
            Write-Warning 'junction creation unavailable; asserting Test-PathIsReparsePoint on a normal dir instead'
            (Test-PathIsReparsePoint -Path $target) | Should Be $false
        }
        Remove-Item -LiteralPath $root -Recurse -Force -ErrorAction SilentlyContinue
        Remove-Item -LiteralPath $target -Recurse -Force -ErrorAction SilentlyContinue
    }
    It 'stops visibly when the directory cap is exceeded' {
        $root = New-TempRoot
        1..4 | ForEach-Object {
            $rid = 'run-20260718-1200{0:00}-000-1-abcdef0{0}' -f $_
            $d = New-RunDir $root $rid
            Write-ManifestJson -RunDir $d -Obj (New-LiveManifestObj -RunId $rid -Outcome 'error')
        }
        $saved = $script:VSLibMaxRunDirs
        try {
            $script:VSLibMaxRunDirs = 3
            $r = Invoke-VideoScoutLibraryList -RunRoot $root
            $r.capExceeded | Should Be $true
            $r.total | Should Be 3
        } finally { $script:VSLibMaxRunDirs = $saved }
        Remove-Item -LiteralPath $root -Recurse -Force
    }
}

Describe 'Invoke-VideoScoutLibraryRead (re-validating read)' {
    It 'reads a valid completed report as available with strict UTF-8 text' {
        $root = New-TempRoot
        $rid = 'run-20260718-130000-000-1-11111111'
        $d = New-RunDir $root $rid
        Write-ManifestJson -RunDir $d -Obj (New-LiveManifestObj -RunId $rid -Outcome 'completed' -ReportFile 'analysis-output.txt')
        $body = "## 1. TL;DR" + [char]0x2013 + "dash"
        [System.IO.File]::WriteAllText((Join-Path $d 'analysis-output.txt'), $body, $utf8)
        $r = Invoke-VideoScoutLibraryRead -RunRoot $root -RunId $rid
        $r.ok | Should Be $true; $r.status | Should Be 'available'; ($r.text -match 'TL;DR') | Should Be $true
        ($r.text.Contains([char]0x2013)) | Should Be $true
        Remove-Item -LiteralPath $root -Recurse -Force
    }
    It 'returns not-persisted for a completed run with null reportFile' {
        $root = New-TempRoot; $rid = 'run-20260718-130001-000-1-22222222'; $d = New-RunDir $root $rid
        Write-ManifestJson -RunDir $d -Obj (New-LiveManifestObj -RunId $rid -Outcome 'completed')
        (Invoke-VideoScoutLibraryRead -RunRoot $root -RunId $rid).status | Should Be 'not-persisted'
        Remove-Item -LiteralPath $root -Recurse -Force
    }
    It 'returns incomplete for a refused/error/ongoing run' {
        $root = New-TempRoot; $rid = 'run-20260718-130002-000-1-33333333'; $d = New-RunDir $root $rid
        Write-ManifestJson -RunDir $d -Obj (New-LiveManifestObj -RunId $rid -Outcome 'error')
        (Invoke-VideoScoutLibraryRead -RunRoot $root -RunId $rid).status | Should Be 'incomplete'
        Remove-Item -LiteralPath $root -Recurse -Force
    }
    It 'refuses a traversal / rooted / malformed run id (unsafe, run-id-shape)' {
        $root = New-TempRoot
        (Invoke-VideoScoutLibraryRead -RunRoot $root -RunId '..\..\evil').status | Should Be 'unsafe'
        (Invoke-VideoScoutLibraryRead -RunRoot $root -RunId '..\..\evil').reason | Should Be 'run-id-shape'
        (Invoke-VideoScoutLibraryRead -RunRoot $root -RunId 'C:\Windows').reason | Should Be 'run-id-shape'
        Remove-Item -LiteralPath $root -Recurse -Force
    }
    It 'returns missing for a well-shaped run id with no directory' {
        $root = New-TempRoot
        (Invoke-VideoScoutLibraryRead -RunRoot $root -RunId 'run-20260718-130003-000-1-44444444').status | Should Be 'missing'
        Remove-Item -LiteralPath $root -Recurse -Force
    }
    It 'returns missing when the report file disappears between List and Read (TOCTOU)' {
        $root = New-TempRoot; $rid = 'run-20260718-130004-000-1-55555555'; $d = New-RunDir $root $rid
        Write-ManifestJson -RunDir $d -Obj (New-LiveManifestObj -RunId $rid -Outcome 'completed' -ReportFile 'analysis-output.txt')
        $rp = Join-Path $d 'analysis-output.txt'
        [System.IO.File]::WriteAllText($rp, 'hi', $utf8)
        (Invoke-VideoScoutLibraryRead -RunRoot $root -RunId $rid).status | Should Be 'available'
        Remove-Item -LiteralPath $rp -Force        # the file vanishes after List
        $after = Invoke-VideoScoutLibraryRead -RunRoot $root -RunId $rid
        $after.status | Should Be 'missing'; $after.reason | Should Be 'report-missing'
        Remove-Item -LiteralPath $root -Recurse -Force
    }
    It 'refuses non-UTF-8 report bytes (unsafe, report-not-utf8)' {
        $root = New-TempRoot; $rid = 'run-20260718-130005-000-1-66666666'; $d = New-RunDir $root $rid
        Write-ManifestJson -RunDir $d -Obj (New-LiveManifestObj -RunId $rid -Outcome 'completed' -ReportFile 'analysis-output.txt')
        [System.IO.File]::WriteAllBytes((Join-Path $d 'analysis-output.txt'), [byte[]]@(0xFF, 0xFE, 0x41, 0x80))
        $r = Invoke-VideoScoutLibraryRead -RunRoot $root -RunId $rid
        $r.status | Should Be 'unsafe'; $r.reason | Should Be 'report-not-utf8'
        Remove-Item -LiteralPath $root -Recurse -Force
    }
    It 'refuses an oversized report (unsafe, report-too-large)' {
        $root = New-TempRoot; $rid = 'run-20260718-130006-000-1-77777777'; $d = New-RunDir $root $rid
        Write-ManifestJson -RunDir $d -Obj (New-LiveManifestObj -RunId $rid -Outcome 'completed' -ReportFile 'analysis-output.txt')
        [System.IO.File]::WriteAllText((Join-Path $d 'analysis-output.txt'), ('a' * 100), $utf8)
        $saved = $script:VSLibMaxReportBytes
        try {
            $script:VSLibMaxReportBytes = 10
            $r = Invoke-VideoScoutLibraryRead -RunRoot $root -RunId $rid
            $r.status | Should Be 'unsafe'; $r.reason | Should Be 'report-too-large'
        } finally { $script:VSLibMaxReportBytes = $saved }
        Remove-Item -LiteralPath $root -Recurse -Force
    }
    It 'refuses a report over the decoded-character limit (unsafe, report-too-many-chars)' {
        $root = New-TempRoot; $rid = 'run-20260718-130007-000-1-88888888'; $d = New-RunDir $root $rid
        Write-ManifestJson -RunDir $d -Obj (New-LiveManifestObj -RunId $rid -Outcome 'completed' -ReportFile 'analysis-output.txt')
        [System.IO.File]::WriteAllText((Join-Path $d 'analysis-output.txt'), ('x' * 50), $utf8)
        $saved = $script:VSLibMaxReportChars
        try {
            $script:VSLibMaxReportChars = 10
            $r = Invoke-VideoScoutLibraryRead -RunRoot $root -RunId $rid
            $r.status | Should Be 'unsafe'; $r.reason | Should Be 'report-too-many-chars'
        } finally { $script:VSLibMaxReportChars = $saved }
        Remove-Item -LiteralPath $root -Recurse -Force
    }
    It 'a report path that is a directory (not a file) is refused, never read' {
        $root = New-TempRoot; $rid = 'run-20260718-130008-000-1-99999999'; $d = New-RunDir $root $rid
        Write-ManifestJson -RunDir $d -Obj (New-LiveManifestObj -RunId $rid -Outcome 'completed' -ReportFile 'analysis-output.txt')
        New-Item -ItemType Directory -Path (Join-Path $d 'analysis-output.txt') -Force | Out-Null
        $r = Invoke-VideoScoutLibraryRead -RunRoot $root -RunId $rid
        $r.ok | Should Be $false
        ($r.status -eq 'missing' -or $r.status -eq 'unsafe') | Should Be $true
        Remove-Item -LiteralPath $root -Recurse -Force
    }
}

Describe 'Invoke-VideoScoutLibraryList — V5c1 schema v2 media inventory' {
    $utf8 = New-Object System.Text.UTF8Encoding($false)
    $root = Join-Path $env:TEMP ('v5c1-lib-' + [guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $root -Force | Out-Null

    # A v2 run with one recorded artifact.
    $rid1 = 'run-20260720-120000-000-1234-aaaaaaaa'
    $d1 = Join-Path $root $rid1; New-Item -ItemType Directory -Path $d1 -Force | Out-Null
    $m1 = New-LiveManifestObj -RunId $rid1 -Outcome 'completed' -ReportFile 'analysis-output.txt'
    $m1.mediaArtifacts = @(([ordered]@{ fileName = 'v.en.srt'; kind = 'transcript'; sizeBytes = 42; recordedAt = '2026-07-20T12:00:00.000Z'; state = 'present'; deletedAt = $null; deletionReason = $null }))
    [System.IO.File]::WriteAllText((Join-Path $d1 'manifest.json'), ($m1 | ConvertTo-Json -Depth 8), $utf8)

    # A v2 run with an EMPTY inventory.
    $rid2 = 'run-20260720-130000-000-1234-bbbbbbbb'
    $d2 = Join-Path $root $rid2; New-Item -ItemType Directory -Path $d2 -Force | Out-Null
    $m2 = New-LiveManifestObj -RunId $rid2 -Outcome 'completed' -ReportFile 'analysis-output.txt'
    [System.IO.File]::WriteAllText((Join-Path $d2 'manifest.json'), ($m2 | ConvertTo-Json -Depth 8), $utf8)

    # A v1 BACKFILL run (no inventory field).
    $rid3 = 'run-20260708-150835-583-4172'
    $d3 = Join-Path $root $rid3; New-Item -ItemType Directory -Path $d3 -Force | Out-Null
    $m3 = New-VideoScoutBackfillManifest -RunId $rid3 -AppliedMode 'transcript' -VideoTitle 'Legacy' -StartedAtFromDirNameLocal '2026-07-08T15:08:35.583'
    [System.IO.File]::WriteAllText((Join-Path $d3 'manifest.json'), ($m3 | ConvertTo-Json -Depth 8), $utf8)

    $res = Invoke-VideoScoutLibraryList -RunRoot $root

    It 'lists v2 (with + without inventory) AND v1 backfills together, none invalid' {
        $res.ok | Should Be $true
        @($res.entries).Count | Should Be 3
        @($res.invalid).Count | Should Be 0
    }
    It 'projects a bounded mediaCount (v2 with artifact = 1, v2 empty = 0, v1 backfill = 0)' {
        $byId = @{}; foreach ($e in $res.entries) { $byId[$e.runId] = $e }
        $byId[$rid1].mediaCount | Should Be 1
        $byId[$rid2].mediaCount | Should Be 0
        $byId[$rid3].mediaCount | Should Be 0
    }
    It 'never exposes a filename or path in the projected entry' {
        $blob = $res.entries | ConvertTo-Json -Depth 8 -Compress
        ($blob -match 'v\.en\.srt') | Should Be $false
        ($blob -match '\\') | Should Be $false
    }

    if (Test-Path -LiteralPath $root) { Remove-Item -LiteralPath $root -Recurse -Force }
}
