<#
.SYNOPSIS
  Pester tests for the V5c1 media-ownership recorder (record-video-scout-media.ps1) — the ownership
  SAFETY contract: ownership comes only from the run's own resolved output file (never a caller
  filename, never a directory scan), provenance is validated (direct child / ordinary / no reparse /
  ext==kind / exists / real size / no duplicate), the manifest update is atomic and reverts on
  failure, and NOTHING is ever deleted/moved. Includes the source tripwire proving the module contains
  no deletion/move/quarantine/recursive-cleanup operation.
.DESCRIPTION
  Run with: Invoke-Pester -Path scripts\lib\record-video-scout-media.Tests.ps1
  Pester 3.4 (no BeforeAll/AfterAll). No network, no Gemini, no download.
#>
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
. (Join-Path $here 'record-video-scout-media.ps1')

function New-TestRun {
    param([string]$Base)
    $runId = 'run-20260720-000000-000-1-deadbeef'
    Initialize-VideoScoutRun -BaseDir $Base -Url 'u' -AppliedMode 'transcript' -Route 'cli' -Model 'm' -MediaResolutionRequested 'MEDIUM' -RunId $runId
}
function New-Srt {
    param([string]$Dir, [string]$Name = 'My_Video.en.srt', [string]$Content = "1`r`n00:00:01,000 --> 00:00:03,000`r`nHi.`r`n")
    $p = Join-Path $Dir $Name
    Set-Content -LiteralPath $p -Value $Content -Encoding ASCII -NoNewline
    Get-Item -LiteralPath $p
}

Describe 'Add-VideoScoutMediaArtifact — records the run''s own output' {
    $base = Join-Path $env:TEMP ('rec-' + [guid]::NewGuid().ToString('N'))
    $run = New-TestRun -Base $base
    $rd = $run.RunDir
    $manifest = $run.Manifest
    $file = New-Srt -Dir $rd

    It 'records a direct-child ordinary file with the actual filename and real on-disk size' {
        Add-VideoScoutMediaArtifact -RunDir $rd -File $file -Kind 'transcript' -Manifest $manifest | Out-Null
        @($manifest.mediaArtifacts).Count | Should Be 1
        $manifest.mediaArtifacts[0].fileName | Should Be 'My_Video.en.srt'   # the ACTUAL leaf, not a caller string
        $manifest.mediaArtifacts[0].kind | Should Be 'transcript'
        $manifest.mediaArtifacts[0].sizeBytes | Should Be ([long]$file.Length)  # size read from the file itself
        $manifest.mediaArtifacts[0].state | Should Be 'present'
        $manifest.mediaArtifacts[0].deletedAt | Should Be $null
    }

    It 'persists the inventory to manifest.json atomically (readable, schema-valid)' {
        $disk = Get-Content (Join-Path $rd 'manifest.json') -Raw -Encoding UTF8 | ConvertFrom-Json
        @($disk.mediaArtifacts).Count | Should Be 1
        $disk.mediaArtifacts[0].fileName | Should Be 'My_Video.en.srt'
        { Assert-VideoScoutManifestValid -Manifest $disk } | Should Not Throw
    }

    It 'refuses a duplicate recording (same file again)' {
        { Add-VideoScoutMediaArtifact -RunDir $rd -File $file -Kind 'transcript' -Manifest $manifest } | Should Throw 'already recorded'
        @($manifest.mediaArtifacts).Count | Should Be 1
    }

    if (Test-Path -LiteralPath $base) { Remove-Item -LiteralPath $base -Recurse -Force }
}

Describe 'Add-VideoScoutMediaArtifact — provenance refusals (never records, never deletes)' {
    $base = Join-Path $env:TEMP ('rec-' + [guid]::NewGuid().ToString('N'))
    $run = New-TestRun -Base $base
    $rd = $run.RunDir
    $manifest = $run.Manifest

    It 'refuses a file OUTSIDE the run directory' {
        $outside = Join-Path $base 'stray.en.srt'; Set-Content -LiteralPath $outside -Value 'x' -Encoding ASCII
        { Add-VideoScoutMediaArtifact -RunDir $rd -File (Get-Item $outside) -Kind 'transcript' -Manifest $manifest } | Should Throw 'not a direct child'
        Test-Path -LiteralPath $outside | Should Be $true   # not deleted
        @($manifest.mediaArtifacts).Count | Should Be 0
    }
    It 'refuses a NESTED file (not a direct child)' {
        $sub = Join-Path $rd 'sub'; New-Item -ItemType Directory -Path $sub | Out-Null
        $nf = Join-Path $sub 'n.en.srt'; Set-Content -LiteralPath $nf -Value 'x' -Encoding ASCII
        { Add-VideoScoutMediaArtifact -RunDir $rd -File (Get-Item $nf) -Kind 'transcript' -Manifest $manifest } | Should Throw 'not a direct child'
        Test-Path -LiteralPath $nf | Should Be $true
    }
    It 'refuses a wrong extension for the kind' {
        $f = New-Srt -Dir $rd -Name 'ok.en.srt'
        { Add-VideoScoutMediaArtifact -RunDir $rd -File $f -Kind 'audio' -Manifest $manifest } | Should Throw 'requires extension'
        Test-Path -LiteralPath $f.FullName | Should Be $true
    }
    It 'refuses a missing file' {
        $missing = New-Object System.IO.FileInfo((Join-Path $rd 'gone.en.srt'))
        { Add-VideoScoutMediaArtifact -RunDir $rd -File $missing -Kind 'transcript' -Manifest $manifest } | Should Throw 'does not exist'
    }
    It 'refuses a reparse-point file (junction), never enters it' {
        # A directory junction named like a media file: File.Exists is false so it is refused as
        # missing/not-a-file — the point is it is NEVER recorded and NEVER traversed/deleted.
        $target = Join-Path $base 'jtarget'; New-Item -ItemType Directory -Path $target -Force | Out-Null
        $link = Join-Path $rd 'linked.en.srt'
        cmd /c mklink /J "$link" "$target" | Out-Null
        if (Test-Path -LiteralPath $link) {
            { Add-VideoScoutMediaArtifact -RunDir $rd -File (New-Object System.IO.FileInfo($link)) -Kind 'transcript' -Manifest $manifest } | Should Throw
            Test-Path -LiteralPath $link | Should Be $true   # junction not deleted
        }
    }

    It 'no refusal ever recorded an artifact' {
        @($manifest.mediaArtifacts).Count | Should Be 0
    }

    if (Test-Path -LiteralPath $base) { Remove-Item -LiteralPath $base -Recurse -Force }
}

Describe 'Add-VideoScoutMediaArtifact — atomic update / blocked replacement' {
    It 'a blocked manifest replacement leaves the OLD inventory intact and reverts the in-memory claim' {
        # Deterministically block the atomic manifest replacement with a REAL exclusive lock on
        # manifest.json (FileShare.None) — the genuine "blocked replacement" the contract describes.
        $base = Join-Path $env:TEMP ('rec-' + [guid]::NewGuid().ToString('N'))
        $lock = $null
        try {
            $run = New-TestRun -Base $base
            $rd = $run.RunDir; $manifest = $run.Manifest
            $f1 = New-Srt -Dir $rd -Name 'first.en.srt'
            $f2 = New-Srt -Dir $rd -Name 'second.en.srt'
            # Record one artifact successfully.
            Add-VideoScoutMediaArtifact -RunDir $rd -File $f1 -Kind 'transcript' -Manifest $manifest | Out-Null
            @($manifest.mediaArtifacts).Count | Should Be 1
            $manifestPath = Join-Path $rd 'manifest.json'
            $diskBefore = [System.IO.File]::ReadAllText($manifestPath)
            # Take an exclusive lock so the atomic [IO.File]::Replace of manifest.json fails.
            $lock = [System.IO.File]::Open($manifestPath, [System.IO.FileMode]::Open, [System.IO.FileAccess]::ReadWrite, [System.IO.FileShare]::None)
            { Add-VideoScoutMediaArtifact -RunDir $rd -File $f2 -Kind 'transcript' -Manifest $manifest } | Should Throw
            $lock.Close(); $lock = $null
            # In-memory ownership claim reverted to the previous single artifact; on-disk unchanged.
            @($manifest.mediaArtifacts).Count | Should Be 1
            $manifest.mediaArtifacts[0].fileName | Should Be 'first.en.srt'
            [System.IO.File]::ReadAllText($manifestPath) | Should Be $diskBefore
            # Neither downloaded file was deleted.
            Test-Path -LiteralPath $f1.FullName | Should Be $true
            Test-Path -LiteralPath $f2.FullName | Should Be $true
        }
        finally {
            if ($lock) { $lock.Close() }
            if (Test-Path -LiteralPath $base) { Remove-Item -LiteralPath $base -Recurse -Force }
        }
    }
}

Describe 'V5c1 non-destructive tripwire (source + behavior)' {
    $src = Get-Content -LiteralPath (Join-Path $here 'record-video-scout-media.ps1') -Raw

    It 'the recorder module contains NO deletion / move / quarantine / recursive-cleanup operation' {
        # Ownership recording must never delete/move/quarantine/clean up media. Assert the module source
        # names none of the destructive operations (its only filesystem writes go through the shared
        # atomic MANIFEST writer, which lives in a different file).
        foreach ($banned in @('Remove-Item', 'Move-Item', 'Clear-Content', 'rmdir', 'Remove-Item2',
                '\[System\.IO\.File\]::Delete', '\[System\.IO\.Directory\]::Delete', '\[IO\.File\]::Delete',
                '\[IO\.Directory\]::Delete', '\[System\.IO\.File\]::Move', '\[IO\.File\]::Move', '-Recurse')) {
            ($src -match $banned) | Should Be $false
        }
        # It also does not scan the run directory for ownership (no Get-ChildItem / EnumerateFiles).
        ($src -match 'Get-ChildItem') | Should Be $false
        ($src -match 'EnumerateFiles') | Should Be $false
        ($src -match 'EnumerateFileSystemEntries') | Should Be $false
    }

    It 'a successful recording leaves the downloaded file on disk (deletes nothing)' {
        $base = Join-Path $env:TEMP ('rec-' + [guid]::NewGuid().ToString('N'))
        try {
            $run = New-TestRun -Base $base
            $f = New-Srt -Dir $run.RunDir
            Add-VideoScoutMediaArtifact -RunDir $run.RunDir -File $f -Kind 'transcript' -Manifest $run.Manifest | Out-Null
            Test-Path -LiteralPath $f.FullName | Should Be $true
        }
        finally { if (Test-Path -LiteralPath $base) { Remove-Item -LiteralPath $base -Recurse -Force } }
    }
}
