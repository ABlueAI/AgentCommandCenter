<#
.SYNOPSIS
  Pester tests for the V5a one-shot legacy backfill (get-video-scout-backfill.ps1).
.DESCRIPTION
  Run with: Invoke-Pester -Path scripts\lib\get-video-scout-backfill.Tests.ps1

  Covers: run-dir name recognition (both generations), local run-stamp parsing, media
  classification, the create-only atomic writer (incl. the TOCTOU SKIP-RACED path via a
  deterministic test-only hook), the filesystem safety gates (reparse point, direct-child
  containment, file-entry cap), and the full sweep -- safe-default (-Apply required to write),
  idempotency, never-overwrite, foreign-dir skipping, per-directory failure/unsafe continuation
  with a visible end-of-run throw, and schema validity of everything written. Pester 3.4 syntax.
  Every directory touched is created by this suite under $env:TEMP and only those are cleaned up
  at the end.
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

Describe 'Test-VideoScoutBackfillDirectChild (containment gate, deterministic)' {

    $resolvedBase = [System.IO.Path]::GetFullPath((Join-Path $testBase 'containment-base'))

    It 'accepts an item whose resolved parent IS the resolved base dir' {
        $item = [PSCustomObject]@{ FullName = (Join-Path $resolvedBase 'run-20260701-120000-000-1') }
        Test-VideoScoutBackfillDirectChild -Item $item -ResolvedBaseDir $resolvedBase | Should Be $true
    }

    It 'rejects an item nested two levels deep under the base dir (not a DIRECT child)' {
        $item = [PSCustomObject]@{ FullName = (Join-Path (Join-Path $resolvedBase 'nested') 'run-20260701-120000-000-1') }
        Test-VideoScoutBackfillDirectChild -Item $item -ResolvedBaseDir $resolvedBase | Should Be $false
    }

    It 'rejects an item resolving to a sibling directory entirely outside the base dir' {
        $sibling = [System.IO.Path]::GetFullPath((Join-Path $testBase 'containment-sibling\run-x'))
        $item = [PSCustomObject]@{ FullName = $sibling }
        Test-VideoScoutBackfillDirectChild -Item $item -ResolvedBaseDir $resolvedBase | Should Be $false
    }

    It 'is tolerant of a trailing separator on the resolved base dir' {
        $item = [PSCustomObject]@{ FullName = (Join-Path $resolvedBase 'run-x') }
        Test-VideoScoutBackfillDirectChild -Item $item -ResolvedBaseDir ($resolvedBase + '\') | Should Be $true
    }
}

Describe 'Get-VideoScoutBackfillFileEntries (entry-count cap, deterministic small caps)' {

    $capDir = Join-Path $testBase 'cap-test-dir'
    New-Item -ItemType Directory -Path $capDir | Out-Null
    1..5 | ForEach-Object { Set-Content -LiteralPath (Join-Path $capDir "f$_.mp4") -Value 'x' -Encoding ASCII }

    It 'reports OverCap=$false when the count is at or under the cap' {
        $r = Get-VideoScoutBackfillFileEntries -DirPath $capDir -MaxFileEntries 5
        $r.Count | Should Be 5
        $r.OverCap | Should Be $false
    }

    It 'reports OverCap=$true when the count exceeds a small cap' {
        $r = Get-VideoScoutBackfillFileEntries -DirPath $capDir -MaxFileEntries 3
        $r.Count | Should Be 5
        $r.OverCap | Should Be $true
    }
}

Describe 'Test-VideoScoutBackfillReparsePoint (junction/symlink gate)' {

    $reparseBase = Join-Path $testBase 'reparse-test'
    New-Item -ItemType Directory -Path $reparseBase | Out-Null
    $targetDir = Join-Path $reparseBase 'real-target'
    New-Item -ItemType Directory -Path $targetDir | Out-Null
    $junctionPath = Join-Path $reparseBase 'run-20260701-120000-000-9999'
    $junctionCreated = $false
    try {
        New-Item -ItemType Junction -Path $junctionPath -Target $targetDir -ErrorAction Stop | Out-Null
        $junctionCreated = $true
    }
    catch {
        Write-Warning "Skipping junction-backed reparse test: this machine/account could not create a directory junction ($($_.Exception.Message))."
    }

    It 'flags a real junction as a reparse point (or explicitly skips if the machine cannot create one)' {
        if (-not $junctionCreated) {
            Write-Warning 'SKIPPED: no junction available on this machine to test against.'
            $true | Should Be $true
            return
        }
        $item = Get-Item -LiteralPath $junctionPath -Force
        Test-VideoScoutBackfillReparsePoint -Item $item | Should Be $true
    }

    It 'does NOT flag an ordinary directory as a reparse point' {
        $item = Get-Item -LiteralPath $targetDir -Force
        Test-VideoScoutBackfillReparsePoint -Item $item | Should Be $false
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

    It 'REFUSES to overwrite an existing manifest (pre-write check) and leaves it byte-identical -- classified as a race' {
        $rd = New-LegacyRunDir -Root $testBase -Name 'run-20260701-120002-000-1111'
        Set-Content -LiteralPath (Join-Path $rd 'manifest.json') -Value '{"sentinel":true}' -Encoding ASCII
        $m = New-VideoScoutBackfillManifest -RunId 'run-20260701-120002-000-1111'
        { Write-VideoScoutBackfillManifestFile -RunDir $rd -Manifest $m } | Should Throw 'Backfill race:'
        (Get-Content -LiteralPath (Join-Path $rd 'manifest.json') -Raw).Contains('sentinel') | Should Be $true
        Resolve-VideoScoutBackfillFailureClass -Message "Backfill race: manifest.json for '$rd' already exists" | Should Be 'raced'
    }

    It 'TOCTOU: a manifest that appears between the pre-write check and the atomic move is SKIP-RACED, not FAILED -- original untouched, temp cleaned' {
        $rd = New-LegacyRunDir -Root $testBase -Name 'run-20260701-120004-000-1111'
        $m = New-VideoScoutBackfillManifest -RunId 'run-20260701-120004-000-1111' -AppliedMode 'audio'
        $raceHook = { Set-Content -LiteralPath (Join-Path $rd 'manifest.json') -Value '{"sentinel":"race-winner"}' -Encoding ASCII }
        { Write-VideoScoutBackfillManifestFile -RunDir $rd -Manifest $m -TestOnlyPreMoveHook $raceHook } |
            Should Throw 'Backfill race:'
        # the race winner's content survives untouched -- our own write never got to overwrite it
        (Get-Content -LiteralPath (Join-Path $rd 'manifest.json') -Raw).Contains('race-winner') | Should Be $true
        @(Get-ChildItem -LiteralPath $rd -Filter 'manifest.json.tmp-*').Count | Should Be 0
    }

    It 'refuses an invalid manifest BEFORE anything reaches disk (shared schema gate) -- a genuine failure, not a race' {
        $rd = New-LegacyRunDir -Root $testBase -Name 'run-20260701-120003-000-1111'
        $m = New-VideoScoutBackfillManifest -RunId 'run-20260701-120003-000-1111'
        $m.outcome = 'completed'   # a backfill may never claim a terminal outcome
        { Write-VideoScoutBackfillManifestFile -RunDir $rd -Manifest $m } | Should Throw 'outcome must be null'
        Test-Path -LiteralPath (Join-Path $rd 'manifest.json') | Should Be $false
        @(Get-ChildItem -LiteralPath $rd -Filter 'manifest.json.tmp-*').Count | Should Be 0
        Resolve-VideoScoutBackfillFailureClass -Message 'Manifest validation failed (backfill): outcome must be null on a backfilled manifest.' | Should Be 'failed'
    }
}

Describe 'Invoke-VideoScoutBackfill (the one-shot sweep -- DRY RUN BY DEFAULT)' {

    $sweep = Join-Path $testBase 'sweep'
    New-Item -ItemType Directory -Path $sweep | Out-Null
    $dirSrt   = New-LegacyRunDir -Root $sweep -Name 'run-20260701-120000-000-1234' -Files @('My_Talk.en.srt')
    $dirMp4   = New-LegacyRunDir -Root $sweep -Name 'run-20260702-130000-500-1234-aabbccdd' -Files @('My_Talk.mp4')
    $dirEmpty = New-LegacyRunDir -Root $sweep -Name 'run-20260703-140000-000-1234-aabbccdd'
    $dirLive  = New-LegacyRunDir -Root $sweep -Name 'run-20260704-150000-000-1234-aabbccdd'
    Set-Content -LiteralPath (Join-Path $dirLive 'manifest.json') -Value '{"sentinel":"live"}' -Encoding ASCII
    New-Item -ItemType Directory -Path (Join-Path $sweep 'not-a-run-dir') | Out-Null
    Set-Content -LiteralPath (Join-Path $sweep 'loose-file.txt') -Value 'x' -Encoding ASCII

    It 'a bare call (no -Apply) is a DRY RUN: reports candidates but writes NOTHING' {
        $dry = Invoke-VideoScoutBackfill -BaseDir $sweep
        $dry.Applied | Should Be $false
        @($dry.Backfilled).Count | Should Be 3
        @($dry.SkippedExisting).Count | Should Be 1
        @($dry.SkippedForeign).Count | Should Be 1
        $dry.Scanned | Should Be 5
        Test-Path -LiteralPath (Join-Path $dirSrt 'manifest.json') | Should Be $false
        Test-Path -LiteralPath (Join-Path $dirMp4 'manifest.json') | Should Be $false
        Test-Path -LiteralPath (Join-Path $dirEmpty 'manifest.json') | Should Be $false
    }

    It '-Apply actually writes exactly the eligible legacy run dirs, skipping the indexed one and the foreign one' {
        $result = Invoke-VideoScoutBackfill -BaseDir $sweep -Apply
        $result.Applied | Should Be $true
        @($result.Backfilled).Count | Should Be 3
        @($result.SkippedExisting).Count | Should Be 1
        @($result.SkippedForeign).Count | Should Be 1
        $result.Scanned | Should Be 5
        Test-Path -LiteralPath (Join-Path $dirSrt 'manifest.json') | Should Be $true
        Test-Path -LiteralPath (Join-Path $dirMp4 'manifest.json') | Should Be $true
        Test-Path -LiteralPath (Join-Path $dirEmpty 'manifest.json') | Should Be $true
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

    It 'is idempotent under -Apply: a second apply-sweep backfills nothing and skips everything as indexed' {
        $again = Invoke-VideoScoutBackfill -BaseDir $sweep -Apply
        @($again.Backfilled).Count | Should Be 0
        @($again.SkippedExisting).Count | Should Be 4
    }

    It 'a dry run after everything is indexed still reports zero writes (truthful under the safe default)' {
        $dry2 = Invoke-VideoScoutBackfill -BaseDir $sweep
        $dry2.Applied | Should Be $false
        @($dry2.Backfilled).Count | Should Be 0
        @($dry2.SkippedExisting).Count | Should Be 4
    }

    It 'refuses a missing base directory visibly' {
        { Invoke-VideoScoutBackfill -BaseDir (Join-Path $testBase 'does-not-exist') } | Should Throw 'does not exist'
    }

    It 'continues past a failing directory under -Apply, still backfills the rest, then FAILS the run visibly' {
        $failRoot = Join-Path $testBase 'failcase'
        New-Item -ItemType Directory -Path $failRoot | Out-Null
        # manifest.json as a DIRECTORY: not an existing manifest (not a leaf), and File.Move cannot
        # replace a directory -> a per-dir write failure, without deleting/locking anything.
        $bad = New-LegacyRunDir -Root $failRoot -Name 'run-20260706-170000-000-1234-aabbccdd'
        New-Item -ItemType Directory -Path (Join-Path $bad 'manifest.json') | Out-Null
        $good = New-LegacyRunDir -Root $failRoot -Name 'run-20260707-180000-000-1234-aabbccdd' -Files @('G.mp4')
        { Invoke-VideoScoutBackfill -BaseDir $failRoot -Apply } | Should Throw 'failure'
        # the good directory was still backfilled despite the earlier failure
        Test-Path -LiteralPath (Join-Path $good 'manifest.json') -PathType Leaf | Should Be $true
        { Assert-VideoScoutManifestValid -Manifest (Read-BackfillJson -RunDir $good) } | Should Not Throw
        # and the failing directory holds no temp leftovers
        @(Get-ChildItem -LiteralPath $bad -Filter 'manifest.json.tmp-*' -File).Count | Should Be 0
    }

    It 'continues past a SKIP-RACED directory under -Apply (does not count as FAILED, sweep still succeeds)' {
        $raceRoot = Join-Path $testBase 'racecase'
        New-Item -ItemType Directory -Path $raceRoot | Out-Null
        $raced = New-LegacyRunDir -Root $raceRoot -Name 'run-20260708-190000-000-1234-aabbccdd' -Files @('R.mp3')
        $good = New-LegacyRunDir -Root $raceRoot -Name 'run-20260709-200000-000-1234-aabbccdd' -Files @('G2.mp4')
        $result = Invoke-VideoScoutBackfill -BaseDir $raceRoot -Apply -TestOnlySimulateRaceForDirName (Split-Path $raced -Leaf)
        @($result.SkippedRaced) -contains (Split-Path $raced -Leaf) | Should Be $true
        @($result.Backfilled) -contains (Split-Path $good -Leaf) | Should Be $true
        Test-Path -LiteralPath (Join-Path $good 'manifest.json') -PathType Leaf | Should Be $true
        # the raced directory's manifest is the race winner's content, not ours -- and no temp leftover
        (Get-Content -LiteralPath (Join-Path $raced 'manifest.json') -Raw).Contains('race-winner') | Should Be $true
        @(Get-ChildItem -LiteralPath $raced -Filter 'manifest.json.tmp-*').Count | Should Be 0
    }

    It 'skips an over-file-entry-cap directory as UNSAFE, still processes the rest, and ends non-zero (throws)' {
        $capRoot = Join-Path $testBase 'capcase'
        New-Item -ItemType Directory -Path $capRoot | Out-Null
        $overCapName = 'run-20260710-210000-000-1234-aabbccdd'
        $overCapDir = New-LegacyRunDir -Root $capRoot -Name $overCapName
        1..3 | ForEach-Object { Set-Content -LiteralPath (Join-Path $overCapDir "extra$_.mp4") -Value 'x' -Encoding ASCII }
        $good = New-LegacyRunDir -Root $capRoot -Name 'run-20260711-220000-000-1234-aabbccdd' -Files @('G3.mp4')

        # Temporarily shrink the module-level cap so this test stays fast (no need to create
        # thousands of files) while still exercising the real production code path.
        $originalCap = $script:VideoScoutBackfillMaxFileEntries
        $script:VideoScoutBackfillMaxFileEntries = 2
        try {
            { Invoke-VideoScoutBackfill -BaseDir $capRoot -Apply } | Should Throw 'unsafe'
        }
        finally {
            $script:VideoScoutBackfillMaxFileEntries = $originalCap
        }
        Test-Path -LiteralPath (Join-Path $overCapDir 'manifest.json') | Should Be $false
        Test-Path -LiteralPath (Join-Path $good 'manifest.json') -PathType Leaf | Should Be $true
    }

    It 'skips a reparse-point (junction) run directory as UNSAFE and never enters it -- or explicitly skips if unsupported' {
        $reparseRoot = Join-Path $testBase 'reparsecase'
        New-Item -ItemType Directory -Path $reparseRoot | Out-Null
        $realTarget = Join-Path $reparseRoot 'elsewhere'
        New-Item -ItemType Directory -Path $realTarget | Out-Null
        Set-Content -LiteralPath (Join-Path $realTarget 'should-never-be-read.mp4') -Value 'x' -Encoding ASCII
        $junctionName = 'run-20260712-230000-000-1234-aabbccdd'
        $junctionPath = Join-Path $reparseRoot $junctionName
        $created = $false
        try {
            New-Item -ItemType Junction -Path $junctionPath -Target $realTarget -ErrorAction Stop | Out-Null
            $created = $true
        }
        catch {
            Write-Warning "Skipping sweep-level junction test: this machine/account could not create a directory junction ($($_.Exception.Message))."
        }
        if (-not $created) {
            Write-Warning 'SKIPPED: no junction available on this machine to test the sweep-level reparse gate against.'
            $true | Should Be $true
            return
        }
        $good = New-LegacyRunDir -Root $reparseRoot -Name 'run-20260713-000000-000-1234-aabbccdd' -Files @('G4.mp3')
        { Invoke-VideoScoutBackfill -BaseDir $reparseRoot -Apply } | Should Throw 'unsafe'
        # the junction itself was never entered: no manifest written through it, and its target
        # directory (reached only by following the reparse point) was never touched either.
        Test-Path -LiteralPath (Join-Path $junctionPath 'manifest.json') | Should Be $false
        Test-Path -LiteralPath (Join-Path $good 'manifest.json') -PathType Leaf | Should Be $true
    }
}

Describe 'backfill-video-scout-manifests.ps1 (entry point, actual process boundary)' {

    $entryScript = Join-Path (Split-Path $here -Parent) 'backfill-video-scout-manifests.ps1'
    $procRoot = Join-Path $testBase 'entrypoint-proc'
    New-Item -ItemType Directory -Path $procRoot | Out-Null
    New-LegacyRunDir -Root $procRoot -Name 'run-20260714-010000-000-1234-aabbccdd' -Files @('P.mp3') | Out-Null

    It 'a bare process invocation (no -Apply) writes NOTHING under a real child process' {
        $out = & powershell -NoProfile -ExecutionPolicy Bypass -File $entryScript -BaseDir $procRoot 2>&1
        $exit = $LASTEXITCODE
        $exit | Should Be 0
        @(Get-ChildItem -LiteralPath $procRoot -Recurse -Filter 'manifest.json').Count | Should Be 0
    }

    It '-Apply in a real child process writes the manifest and exits 0' {
        $out = & powershell -NoProfile -ExecutionPolicy Bypass -File $entryScript -BaseDir $procRoot -Apply 2>&1
        $exit = $LASTEXITCODE
        $exit | Should Be 0
        @(Get-ChildItem -LiteralPath $procRoot -Recurse -Filter 'manifest.json').Count | Should Be 1
    }
}

# Plain trailing cleanup (Pester 3.4: no AfterAll). Removes ONLY the base dir this suite created.
if (Test-Path -LiteralPath $testBase) { Remove-Item -LiteralPath $testBase -Recurse -Force }
