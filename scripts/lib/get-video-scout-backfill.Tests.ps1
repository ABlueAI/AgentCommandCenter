<#
.SYNOPSIS
  Pester tests for the V5a one-shot legacy backfill (get-video-scout-backfill.ps1).
.DESCRIPTION
  Run with: Invoke-Pester -Path scripts\lib\get-video-scout-backfill.Tests.ps1

  Covers: run-dir name recognition (both generations), local run-stamp parsing, media
  classification, the create-only atomic writer, and the full sweep -- idempotency, dry-run,
  never-overwrite, foreign-dir skipping, per-directory failure continuation with a visible
  end-of-run throw, and schema validity of everything written. Pester 3.4 syntax. Every directory
  touched is created by this suite under $env:TEMP and only those are cleaned up at the end.
#>
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
. (Join-Path $here 'get-video-scout-backfill.ps1')

$testBase = Join-Path $env:TEMP ("backfill-test-{0}" -f ([guid]::NewGuid().ToString('N')))
New-Item -ItemType Directory -Path $testBase | Out-Null

# helper: make a legacy run dir with optional files; returns its full path
function New-LegacyRunDir {
    param([string]$Root, [string]$Name, [string[]]$Files = @())
    $p = Join-Path $Root $Name
    New-Item -ItemType Directory -Path $p | Out-Null
    foreach ($f in $Files) { Set-Content -LiteralPath (Join-Path $p $f) -Value 'x' -Encoding ASCII }
    return $p
}

function Read-BackfillJson {
    param([string]$RunDir)
    Get-Content -LiteralPath (Join-Path $RunDir 'manifest.json') -Raw -Encoding UTF8 | ConvertFrom-Json
}

Describe 'Test-VideoScoutRunDirName (both run-dir generations)' {

    It 'accepts a post-P10 name with the 8-hex GUID suffix' {
        Test-VideoScoutRunDirName -Name 'run-20260714-210126-538-4504-bb3059e0' | Should Be $true
    }

    It 'accepts a pre-P10 name without the GUID suffix' {
        Test-VideoScoutRunDirName -Name 'run-20260701-120000-000-1234' | Should Be $true
    }

    It 'rejects non-run names, truncated stamps, and uppercase-hex suffixes' {
        Test-VideoScoutRunDirName -Name 'foo' | Should Be $false
        Test-VideoScoutRunDirName -Name 'run-2026' | Should Be $false
        Test-VideoScoutRunDirName -Name 'run-20260714-210126-538' | Should Be $false
        Test-VideoScoutRunDirName -Name 'run-20260714-210126-538-4504-BB3059E0' | Should Be $false
        Test-VideoScoutRunDirName -Name 'run-20260714-210126-538-4504-bb3059e0-extra' | Should Be $false
    }
}

Describe 'Get-BackfillRunStampLocal (provenance stamp, LOCAL, no fabricated zone)' {

    It 'parses the directory stamp into an ISO-style local timestamp' {
        Get-BackfillRunStampLocal -Name 'run-20260714-210126-538-4504-bb3059e0' | Should Be '2026-07-14T21:01:26.538'
    }

    It 'parses a pre-P10 name the same way' {
        Get-BackfillRunStampLocal -Name 'run-20260701-120000-000-1234' | Should Be '2026-07-01T12:00:00.000'
    }

    It 'returns $null for an impossible date and for a non-run name (never a fabricated stamp)' {
        Get-BackfillRunStampLocal -Name 'run-20269941-999999-999-1234' | Should Be $null
        Get-BackfillRunStampLocal -Name 'not-a-run-dir' | Should Be $null
    }
}

Describe 'Resolve-BackfillMediaClassification (extension inference)' {

    It 'classifies a single .srt as transcript with its base name as title' {
        $c = Resolve-BackfillMediaClassification -FileNames @('Some_Video_Title.en.srt')
        $c.AppliedMode | Should Be 'transcript'
        $c.VideoTitle | Should Be 'Some_Video_Title.en'
    }

    It 'classifies a single .mp4 as video and a single .mp3 as audio' {
        (Resolve-BackfillMediaClassification -FileNames @('Talk.mp4')).AppliedMode | Should Be 'video'
        (Resolve-BackfillMediaClassification -FileNames @('Talk.mp3')).AppliedMode | Should Be 'audio'
    }

    It 'keeps the mode but drops the title when several files share one media type' {
        $c = Resolve-BackfillMediaClassification -FileNames @('A.en.srt', 'A.auto.srt')
        $c.AppliedMode | Should Be 'transcript'
        $c.VideoTitle | Should Be $null
    }

    It 'returns nulls for mixed media types (ambiguous -- proves nothing)' {
        $c = Resolve-BackfillMediaClassification -FileNames @('A.srt', 'B.mp4')
        $c.AppliedMode | Should Be $null
        $c.VideoTitle | Should Be $null
    }

    It 'returns nulls for an empty directory and ignores unknown extensions' {
        (Resolve-BackfillMediaClassification -FileNames @()).AppliedMode | Should Be $null
        $c = Resolve-BackfillMediaClassification -FileNames @('partial.part', 'stream.webm')
        $c.AppliedMode | Should Be $null
        $c.VideoTitle | Should Be $null
    }
}

Describe 'Write-VideoScoutBackfillManifestFile (create-only atomic persistence)' {

    It 'writes a schema-valid manifest as UTF-8 without BOM and leaves no temp file' {
        $rd = New-LegacyRunDir -Root $testBase -Name 'run-20260701-120001-000-1111'
        $m = New-VideoScoutBackfillManifest -RunId 'run-20260701-120001-000-1111' -AppliedMode 'video'
        Write-VideoScoutBackfillManifestFile -RunDir $rd -Manifest $m | Out-Null
        $bytes = [System.IO.File]::ReadAllBytes((Join-Path $rd 'manifest.json'))
        $bytes[0] | Should Be 0x7B
        @(Get-ChildItem -LiteralPath $rd -Filter 'manifest.json.tmp-*').Count | Should Be 0
        { Assert-VideoScoutManifestValid -Manifest (Read-BackfillJson -RunDir $rd) } | Should Not Throw
    }

    It 'REFUSES to overwrite an existing manifest and leaves it byte-identical' {
        $rd = New-LegacyRunDir -Root $testBase -Name 'run-20260701-120002-000-1111'
        Set-Content -LiteralPath (Join-Path $rd 'manifest.json') -Value '{"sentinel":true}' -Encoding ASCII
        $m = New-VideoScoutBackfillManifest -RunId 'run-20260701-120002-000-1111'
        { Write-VideoScoutBackfillManifestFile -RunDir $rd -Manifest $m } | Should Throw 'create-only'
        (Get-Content -LiteralPath (Join-Path $rd 'manifest.json') -Raw).Contains('sentinel') | Should Be $true
    }

    It 'refuses an invalid manifest BEFORE anything reaches disk (shared schema gate)' {
        $rd = New-LegacyRunDir -Root $testBase -Name 'run-20260701-120003-000-1111'
        $m = New-VideoScoutBackfillManifest -RunId 'run-20260701-120003-000-1111'
        $m.outcome = 'completed'   # a backfill may never claim a terminal outcome
        { Write-VideoScoutBackfillManifestFile -RunDir $rd -Manifest $m } | Should Throw 'outcome must be null'
        Test-Path -LiteralPath (Join-Path $rd 'manifest.json') | Should Be $false
        @(Get-ChildItem -LiteralPath $rd -Filter 'manifest.json.tmp-*').Count | Should Be 0
    }
}

Describe 'Invoke-VideoScoutBackfill (the one-shot sweep)' {

    $sweep = Join-Path $testBase 'sweep'
    New-Item -ItemType Directory -Path $sweep | Out-Null
    $dirSrt   = New-LegacyRunDir -Root $sweep -Name 'run-20260701-120000-000-1234' -Files @('My_Talk.en.srt')
    $dirMp4   = New-LegacyRunDir -Root $sweep -Name 'run-20260702-130000-500-1234-aabbccdd' -Files @('My_Talk.mp4')
    $dirEmpty = New-LegacyRunDir -Root $sweep -Name 'run-20260703-140000-000-1234-aabbccdd'
    $dirLive  = New-LegacyRunDir -Root $sweep -Name 'run-20260704-150000-000-1234-aabbccdd'
    Set-Content -LiteralPath (Join-Path $dirLive 'manifest.json') -Value '{"sentinel":"live"}' -Encoding ASCII
    New-Item -ItemType Directory -Path (Join-Path $sweep 'not-a-run-dir') | Out-Null
    Set-Content -LiteralPath (Join-Path $sweep 'loose-file.txt') -Value 'x' -Encoding ASCII

    $result = Invoke-VideoScoutBackfill -BaseDir $sweep

    It 'backfills exactly the legacy run dirs, skipping the indexed one and the foreign one' {
        @($result.Backfilled).Count | Should Be 3
        @($result.SkippedExisting).Count | Should Be 1
        @($result.SkippedForeign).Count | Should Be 1
        $result.Scanned | Should Be 5
    }

    It 'writes schema-valid backfill manifests with inferred mode/title and the local run stamp' {
        $m = Read-BackfillJson -RunDir $dirSrt
        { Assert-VideoScoutManifestValid -Manifest $m } | Should Not Throw
        $m.appliedMode | Should Be 'transcript'
        $m.videoTitle | Should Be 'My_Talk.en'
        $m.route | Should Be 'cli'
        $m.startedAt | Should Be $null
        $m.backfill.startedAtApproximate | Should Be $true
        $m.backfill.startedAtFromDirNameLocal | Should Be '2026-07-01T12:00:00.000'
    }

    It 'records an empty legacy dir with null mode/title but full provenance (still indexable)' {
        $m = Read-BackfillJson -RunDir $dirEmpty
        $m.appliedMode | Should Be $null
        $m.videoTitle | Should Be $null
        $m.outcome | Should Be $null
        $m.backfill.startedAtFromDirNameLocal | Should Be '2026-07-03T14:00:00.000'
    }

    It 'never touches the existing manifest (create-only)' {
        (Get-Content -LiteralPath (Join-Path $dirLive 'manifest.json') -Raw).Contains('"sentinel"') | Should Be $true
    }

    It 'creates no manifest inside the foreign directory' {
        Test-Path -LiteralPath (Join-Path $sweep 'not-a-run-dir\manifest.json') | Should Be $false
    }

    It 'is idempotent: a second sweep backfills nothing and skips everything as indexed' {
        $again = Invoke-VideoScoutBackfill -BaseDir $sweep
        @($again.Backfilled).Count | Should Be 0
        @($again.SkippedExisting).Count | Should Be 4
    }

    It '-DryRun reports what it would do and writes NOTHING' {
        $dryRoot = Join-Path $testBase 'dry'
        New-Item -ItemType Directory -Path $dryRoot | Out-Null
        $rd = New-LegacyRunDir -Root $dryRoot -Name 'run-20260705-160000-000-1234-aabbccdd' -Files @('T.mp3')
        $dry = Invoke-VideoScoutBackfill -BaseDir $dryRoot -DryRun
        @($dry.Backfilled).Count | Should Be 1
        $dry.DryRun | Should Be $true
        Test-Path -LiteralPath (Join-Path $rd 'manifest.json') | Should Be $false
        @(Get-ChildItem -LiteralPath $rd -File).Count | Should Be 1   # only the media file; no temp
    }

    It 'refuses a missing base directory visibly' {
        { Invoke-VideoScoutBackfill -BaseDir (Join-Path $testBase 'does-not-exist') } | Should Throw 'does not exist'
    }

    It 'continues past a failing directory, still backfills the rest, then FAILS the run visibly' {
        $failRoot = Join-Path $testBase 'failcase'
        New-Item -ItemType Directory -Path $failRoot | Out-Null
        # manifest.json as a DIRECTORY: not an existing manifest (not a leaf), and File.Move cannot
        # replace a directory -> a per-dir write failure, without deleting/locking anything.
        $bad = New-LegacyRunDir -Root $failRoot -Name 'run-20260706-170000-000-1234-aabbccdd'
        New-Item -ItemType Directory -Path (Join-Path $bad 'manifest.json') | Out-Null
        $good = New-LegacyRunDir -Root $failRoot -Name 'run-20260707-180000-000-1234-aabbccdd' -Files @('G.mp4')
        { Invoke-VideoScoutBackfill -BaseDir $failRoot } | Should Throw 'failure'
        # the good directory was still backfilled despite the earlier failure
        Test-Path -LiteralPath (Join-Path $good 'manifest.json') -PathType Leaf | Should Be $true
        { Assert-VideoScoutManifestValid -Manifest (Read-BackfillJson -RunDir $good) } | Should Not Throw
        # and the failing directory holds no temp leftovers
        @(Get-ChildItem -LiteralPath $bad -Filter 'manifest.json.tmp-*' -File).Count | Should Be 0
    }
}

# Plain trailing cleanup (Pester 3.4: no AfterAll). Removes ONLY the base dir this suite created.
if (Test-Path -LiteralPath $testBase) { Remove-Item -LiteralPath $testBase -Recurse -Force }
