<#
.SYNOPSIS
  Pester tests for the V5c2a successful-run media cleanup (cleanup-video-scout-media.ps1) — the
  DESTRUCTIVE SAFETY contract: deletion authority comes ONLY from the validated manifest's owned
  mediaArtifacts (never a scan), only after a durable completed+report run, deletes only the exact
  owned file (identity/size/kind/name checked, no wildcard/recursion), models crash truth through the
  present->deleting->deleted lifecycle with delete-failed/missing branches, and NEVER deletes a report,
  a manifest, an unowned sibling, or a directory. Includes the source tripwire proving no wildcard /
  recursive / move / quarantine / directory-scan deletion.
.DESCRIPTION
  Run with: Invoke-Pester -Path scripts\lib\cleanup-video-scout-media.Tests.ps1
  Pester 3.4 (no BeforeAll/AfterAll). NO network, NO Gemini, NO download. Uses ONLY temporary fixture
  roots under $env:TEMP — it never touches D:\Gemini_Video_Review\downloads.
#>
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
. (Join-Path $here 'cleanup-video-scout-media.ps1')

$script:VSAllowlist = @('completed-analysis', 'owned-file-missing', 'identity-mismatch', 'unsafe-file-type', 'reparse-point-refused', 'filesystem-delete-failed')

# --- fixture helpers -------------------------------------------------------------------------------
function New-CleanupFixtureRoot { Join-Path $env:TEMP ('vscln-' + [guid]::NewGuid().ToString('N')) }

function New-MediaFile {
    param([string]$Dir, [string]$Name, [string]$Content = 'abc')
    $p = Join-Path $Dir $Name
    Set-Content -LiteralPath $p -Value $Content -Encoding ASCII -NoNewline
    return $p
}

# Build a run directory + a manifest (written via the shared atomic writer, so it is schema-valid) and
# a real report file. $Artifacts is an array of [ordered] artifact hashtables. Returns @{ Root; RunDir }.
function New-CleanupRun {
    param(
        [string]$Root,
        [string]$RunId = 'run-20260721-101010-101-2222-abcdef01',
        [ValidateSet('completed', 'refused', 'error', 'null')][string]$Outcome = 'completed',
        [object]$ReportFile = 'analysis-output.txt',
        [object[]]$Artifacts = @(),
        [switch]$WriteReport = $true,
        [switch]$SchemaV1
    )
    $runDir = Join-Path $Root $RunId
    New-Item -ItemType Directory -Path $runDir -Force | Out-Null

    if ($SchemaV1) {
        # A valid schema-v1 completed manifest (the historical shape: NO mediaArtifacts key).
        $m = New-VideoScoutManifestBase
        $m.runId = $RunId; $m.videoScout = $false; $m.appliedMode = 'transcript'; $m.route = 'cli'
        $m.mediaResolutionRequested = 'MEDIUM'; $m.startedAt = '2026-07-21T10:10:10.000Z'
        $m.finishedAt = '2026-07-21T10:10:11.000Z'; $m.outcome = 'completed'; $m.reportFile = 'analysis-output.txt'
    }
    else {
        $m = New-VideoScoutLiveManifest -RunId $RunId -AppliedMode 'transcript' -Route 'cli' -MediaResolutionRequested 'MEDIUM'
        if ($Outcome -ne 'null') {
            $m.outcome = $Outcome
            $m.finishedAt = '2026-07-21T10:10:11.000Z'
            if ($Outcome -ne 'completed') { $m.reason = 'test reason' }
        }
        if ($null -ne $ReportFile) { $m.reportFile = [string]$ReportFile }
        $m.mediaArtifacts = @($Artifacts)
    }
    if ($WriteReport -and ($null -ne $ReportFile)) { New-MediaFile -Dir $runDir -Name ([string]$ReportFile) -Content '## 1. TL;DR' | Out-Null }
    [void](Write-VideoScoutManifestFile -RunDir $runDir -Manifest $m)
    return @{ Root = $Root; RunDir = $runDir }
}

function New-Artifact {
    param([string]$FileName, [string]$Kind = 'transcript', [long]$SizeBytes = 3, [string]$State = 'present',
        [object]$DeletedAt = $null, [object]$DeletionReason = $null, [string]$RecordedAt = '2026-07-21T10:10:10.500Z')
    [ordered]@{ fileName = $FileName; kind = $Kind; sizeBytes = $SizeBytes; recordedAt = $RecordedAt; state = $State; deletedAt = $DeletedAt; deletionReason = $DeletionReason }
}

function Get-DiskManifest { param([string]$RunDir) (Get-Content -LiteralPath (Join-Path $RunDir 'manifest.json') -Raw -Encoding UTF8) | ConvertFrom-Json }

# ==================================================================================================
Describe 'V5c2a cleanup — happy path deletes ONLY the owned file (1)' {
    $root = New-CleanupFixtureRoot
    try {
        $art = New-Artifact -FileName 'my_video.srt' -SizeBytes 3
        $fx = New-CleanupRun -Root $root -Artifacts @($art)
        $rd = $fx.RunDir
        $owned = New-MediaFile -Dir $rd -Name 'my_video.srt' -Content 'abc'   # size 3, matches
        # unowned siblings of every media kind + an arbitrary file (2)
        $sib = New-MediaFile -Dir $rd -Name 'other.srt' -Content 'zz'
        $mp3 = New-MediaFile -Dir $rd -Name 'unowned.mp3' -Content 'zz'
        $mp4 = New-MediaFile -Dir $rd -Name 'unowned.mp4' -Content 'zz'
        $arb = New-MediaFile -Dir $rd -Name 'notes.dat' -Content 'zz'
        $summary = Invoke-VideoScoutSuccessMediaCleanup -RunDir $rd -DownloadsRoot $root

        It 'is eligible and deletes exactly the one owned file' {
            $summary.eligible | Should Be $true
            $summary.deleted | Should Be 1
            $summary.failed | Should Be 0
            Test-Path -LiteralPath $owned | Should Be $false
        }
        It 'ends the owned artifact in state deleted with a UTC deletedAt and the completed-analysis reason' {
            $disk = Get-DiskManifest -RunDir $rd
            $disk.mediaArtifacts[0].state | Should Be 'deleted'
            $disk.mediaArtifacts[0].deletedAt | Should Match '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$'
            $disk.mediaArtifacts[0].deletionReason | Should Be 'completed-analysis'
            { Assert-VideoScoutManifestValid -Manifest $disk } | Should Not Throw
        }
        It 'leaves the report and manifest and every unowned file intact (2)' {
            Test-Path -LiteralPath (Join-Path $rd 'analysis-output.txt') | Should Be $true
            Test-Path -LiteralPath (Join-Path $rd 'manifest.json') | Should Be $true
            Test-Path -LiteralPath $sib | Should Be $true
            Test-Path -LiteralPath $mp3 | Should Be $true
            Test-Path -LiteralPath $mp4 | Should Be $true
            Test-Path -LiteralPath $arb | Should Be $true
        }
    }
    finally { if (Test-Path -LiteralPath $root) { Remove-Item -LiteralPath $root -Recurse -Force } }
}

Describe 'V5c2a cleanup — ineligible runs retain their media (3,4,5,6)' {
    It 'a completed -NoFeed run with reportFile null preserves media (3)' {
        $root = New-CleanupFixtureRoot
        try {
            $fx = New-CleanupRun -Root $root -Outcome 'completed' -ReportFile $null -Artifacts @(New-Artifact -FileName 'a.srt' -SizeBytes 3) -WriteReport:$false
            $f = New-MediaFile -Dir $fx.RunDir -Name 'a.srt' -Content 'abc'
            $s = Invoke-VideoScoutSuccessMediaCleanup -RunDir $fx.RunDir -DownloadsRoot $root
            $s.eligible | Should Be $false
            Test-Path -LiteralPath $f | Should Be $true
            (Get-DiskManifest -RunDir $fx.RunDir).mediaArtifacts[0].state | Should Be 'present'
        }
        finally { if (Test-Path -LiteralPath $root) { Remove-Item -LiteralPath $root -Recurse -Force } }
    }
    foreach ($oc in @('error', 'refused', 'null')) {
        It "an outcome=$oc run preserves media (4)" {
            $root = New-CleanupFixtureRoot
            try {
                # error/refused/null carry a null reportFile (no completed analysis).
                $fx = New-CleanupRun -Root $root -Outcome $oc -ReportFile $null -Artifacts @(New-Artifact -FileName 'a.srt' -SizeBytes 3) -WriteReport:$false
                $f = New-MediaFile -Dir $fx.RunDir -Name 'a.srt' -Content 'abc'
                $s = Invoke-VideoScoutSuccessMediaCleanup -RunDir $fx.RunDir -DownloadsRoot $root
                $s.eligible | Should Be $false
                Test-Path -LiteralPath $f | Should Be $true
            }
            finally { if (Test-Path -LiteralPath $root) { Remove-Item -LiteralPath $root -Recurse -Force } }
        }
    }
    It 'a schema-v1 historical run stays valid and untouched (5)' {
        $root = New-CleanupFixtureRoot
        try {
            $fx = New-CleanupRun -Root $root -SchemaV1
            $f = New-MediaFile -Dir $fx.RunDir -Name 'legacy.srt' -Content 'abc'
            $before = Get-Content -LiteralPath (Join-Path $fx.RunDir 'manifest.json') -Raw
            $s = Invoke-VideoScoutSuccessMediaCleanup -RunDir $fx.RunDir -DownloadsRoot $root
            $s.eligible | Should Be $false
            Test-Path -LiteralPath $f | Should Be $true
            (Get-Content -LiteralPath (Join-Path $fx.RunDir 'manifest.json') -Raw) | Should Be $before
            (Get-DiskManifest -RunDir $fx.RunDir).schemaVersion | Should Be 1
        }
        finally { if (Test-Path -LiteralPath $root) { Remove-Item -LiteralPath $root -Recurse -Force } }
    }
    It 'an SDK-style completed run with an empty inventory safely no-ops (6)' {
        $root = New-CleanupFixtureRoot
        try {
            $fx = New-CleanupRun -Root $root -Outcome 'completed' -Artifacts @()
            $s = Invoke-VideoScoutSuccessMediaCleanup -RunDir $fx.RunDir -DownloadsRoot $root
            $s.eligible | Should Be $true
            $s.processed | Should Be 0
            $s.deleted | Should Be 0
            Test-Path -LiteralPath (Join-Path $fx.RunDir 'analysis-output.txt') | Should Be $true
        }
        finally { if (Test-Path -LiteralPath $root) { Remove-Item -LiteralPath $root -Recurse -Force } }
    }
}

Describe 'V5c2a cleanup — deletion-boundary refusals via the safety classifier (7,10,11)' {
    $root = New-CleanupFixtureRoot
    try {
        $rd = Join-Path $root 'run-20260721-101010-101-2222-abcdef01'
        New-Item -ItemType Directory -Path $rd -Force | Out-Null
        $fullRun = [IO.Path]::GetFullPath($rd).TrimEnd('\', '/')
        $fullRoot = [IO.Path]::GetFullPath($root).TrimEnd('\', '/')
        New-MediaFile -Dir $rd -Name 'ok.srt' -Content 'abc' | Out-Null   # size 3

        It 'refuses a traversal / separator / rooted leaf (7)' {
            foreach ($bad in @('..\evil.srt', 'sub/evil.srt', 'C:\evil.srt')) {
                $r = Get-VideoScoutMediaDeletionSafety -FullRunDir $fullRun -FullDownloadsRoot $fullRoot -Artifact (New-Artifact -FileName $bad)
                $r.decision | Should Be 'refuse'
                $r.reason | Should Be 'identity-mismatch'
            }
        }
        It 'refuses a wrong extension for the kind (7)' {
            $r = Get-VideoScoutMediaDeletionSafety -FullRunDir $fullRun -FullDownloadsRoot $fullRoot -Artifact (New-Artifact -FileName 'ok.mp3' -Kind 'transcript')
            $r.decision | Should Be 'refuse'
            $r.reason | Should Be 'unsafe-file-type'
        }
        It 'refuses the manifest and the report as targets (11)' {
            (Get-VideoScoutMediaDeletionSafety -FullRunDir $fullRun -FullDownloadsRoot $fullRoot -Artifact (New-Artifact -FileName 'manifest.json')).decision | Should Be 'refuse'
            (Get-VideoScoutMediaDeletionSafety -FullRunDir $fullRun -FullDownloadsRoot $fullRoot -Artifact (New-Artifact -FileName 'analysis-output.txt')).decision | Should Be 'refuse'
        }
        It 'refuses a size mismatch and reports safe only on an exact match (10)' {
            (Get-VideoScoutMediaDeletionSafety -FullRunDir $fullRun -FullDownloadsRoot $fullRoot -Artifact (New-Artifact -FileName 'ok.srt' -SizeBytes 999)).decision | Should Be 'refuse'
            $ok = Get-VideoScoutMediaDeletionSafety -FullRunDir $fullRun -FullDownloadsRoot $fullRoot -Artifact (New-Artifact -FileName 'ok.srt' -SizeBytes 3)
            $ok.decision | Should Be 'safe'
        }
    }
    finally { if (Test-Path -LiteralPath $root) { Remove-Item -LiteralPath $root -Recurse -Force } }
}

Describe 'V5c2a cleanup — end-to-end size mismatch preserves the file (10)' {
    $root = New-CleanupFixtureRoot
    try {
        $art = New-Artifact -FileName 'v.srt' -SizeBytes 3
        $fx = New-CleanupRun -Root $root -Artifacts @($art)
        $f = New-MediaFile -Dir $fx.RunDir -Name 'v.srt' -Content 'abcdefLONGER'   # size != 3
        $s = Invoke-VideoScoutSuccessMediaCleanup -RunDir $fx.RunDir -DownloadsRoot $root
        It 'refuses deletion, preserves the file, records delete-failed with identity-mismatch' {
            $s.deleted | Should Be 0
            $s.failed | Should Be 1
            Test-Path -LiteralPath $f | Should Be $true
            $disk = Get-DiskManifest -RunDir $fx.RunDir
            $disk.mediaArtifacts[0].state | Should Be 'delete-failed'
            $disk.mediaArtifacts[0].deletionReason | Should Be 'identity-mismatch'
        }
    }
    finally { if (Test-Path -LiteralPath $root) { Remove-Item -LiteralPath $root -Recurse -Force } }
}

Describe 'V5c2a cleanup — reparse and directory targets refuse (8,9)' {
    It 'refuses when the run directory is a reparse point (junction) (8)' {
        $root = New-CleanupFixtureRoot
        try {
            # Build a real run dir, then a junction pointing at it; call cleanup via the junction path.
            $realId = 'run-20260721-101010-101-2222-abcdef01'
            $fx = New-CleanupRun -Root $root -RunId $realId -Artifacts @(New-Artifact -FileName 'v.srt' -SizeBytes 3)
            New-MediaFile -Dir $fx.RunDir -Name 'v.srt' -Content 'abc' | Out-Null
            $junc = Join-Path $root 'run-20260721-999999-999-9999-abcdef09'
            cmd /c mklink /J "$junc" "$($fx.RunDir)" | Out-Null
            $s = Invoke-VideoScoutSuccessMediaCleanup -RunDir $junc -DownloadsRoot $root
            # The run-dir reparse check refuses deletion; the file survives.
            $s.deleted | Should Be 0
            Test-Path -LiteralPath (Join-Path $fx.RunDir 'v.srt') | Should Be $true
            (@($s.reasons) -contains 'reparse-point-refused') | Should Be $true
        }
        finally { if (Test-Path -LiteralPath $root) { Remove-Item -LiteralPath $root -Recurse -Force } }
    }
    It 'refuses a directory masquerading as the owned file (9)' {
        $root = New-CleanupFixtureRoot
        try {
            $fx = New-CleanupRun -Root $root -Artifacts @(New-Artifact -FileName 'dir.srt' -SizeBytes 3)
            New-Item -ItemType Directory -Path (Join-Path $fx.RunDir 'dir.srt') -Force | Out-Null
            $s = Invoke-VideoScoutSuccessMediaCleanup -RunDir $fx.RunDir -DownloadsRoot $root
            $s.deleted | Should Be 0
            $s.failed | Should Be 1
            Test-Path -LiteralPath (Join-Path $fx.RunDir 'dir.srt') | Should Be $true
            (Get-DiskManifest -RunDir $fx.RunDir).mediaArtifacts[0].deletionReason | Should Be 'unsafe-file-type'
        }
        finally { if (Test-Path -LiteralPath $root) { Remove-Item -LiteralPath $root -Recurse -Force } }
    }
}

Describe 'V5c2a cleanup — missing-file honesty (12,13)' {
    It 'an owned present artifact whose file is absent becomes missing, never deleted (12)' {
        $root = New-CleanupFixtureRoot
        try {
            $fx = New-CleanupRun -Root $root -Artifacts @(New-Artifact -FileName 'gone.srt' -SizeBytes 3)
            # NOTE: no file is created on disk for gone.srt.
            $s = Invoke-VideoScoutSuccessMediaCleanup -RunDir $fx.RunDir -DownloadsRoot $root
            $s.missing | Should Be 1
            $s.deleted | Should Be 0
            $disk = Get-DiskManifest -RunDir $fx.RunDir
            $disk.mediaArtifacts[0].state | Should Be 'missing'
            $disk.mediaArtifacts[0].deletedAt | Should Be $null
            $disk.mediaArtifacts[0].deletionReason | Should Be 'owned-file-missing'
        }
        finally { if (Test-Path -LiteralPath $root) { Remove-Item -LiteralPath $root -Recurse -Force } }
    }
    It 'an artifact already in durable state deleting with an absent file finalizes as deleted (13)' {
        $root = New-CleanupFixtureRoot
        try {
            $seed = New-Artifact -FileName 'g.srt' -SizeBytes 3 -State 'deleting' -DeletionReason 'completed-analysis'
            $fx = New-CleanupRun -Root $root -Artifacts @($seed)   # no file on disk
            $s = Invoke-VideoScoutSuccessMediaCleanup -RunDir $fx.RunDir -DownloadsRoot $root
            $s.deleted | Should Be 1
            $disk = Get-DiskManifest -RunDir $fx.RunDir
            $disk.mediaArtifacts[0].state | Should Be 'deleted'
            $disk.mediaArtifacts[0].deletedAt | Should Match '^\d{4}'
        }
        finally { if (Test-Path -LiteralPath $root) { Remove-Item -LiteralPath $root -Recurse -Force } }
    }
}

Describe 'V5c2a cleanup — filesystem + manifest write failures (14,15,16)' {
    It 'a filesystem delete failure becomes delete-failed without touching the completed outcome (14)' {
        $root = New-CleanupFixtureRoot
        $lock = $null
        try {
            $fx = New-CleanupRun -Root $root -Artifacts @(New-Artifact -FileName 'lk.srt' -SizeBytes 3)
            $f = New-MediaFile -Dir $fx.RunDir -Name 'lk.srt' -Content 'abc'
            # Hold the media file open with no delete share so [IO.File]::Delete throws.
            $lock = [System.IO.File]::Open($f, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::Read)
            $s = Invoke-VideoScoutSuccessMediaCleanup -RunDir $fx.RunDir -DownloadsRoot $root
            $lock.Close(); $lock = $null
            $s.failed | Should Be 1
            $s.deleted | Should Be 0
            Test-Path -LiteralPath $f | Should Be $true
            $disk = Get-DiskManifest -RunDir $fx.RunDir
            $disk.outcome | Should Be 'completed'
            $disk.mediaArtifacts[0].state | Should Be 'delete-failed'
            $disk.mediaArtifacts[0].deletionReason | Should Be 'filesystem-delete-failed'
        }
        finally { if ($lock) { $lock.Close() }; if (Test-Path -LiteralPath $root) { Remove-Item -LiteralPath $root -Recurse -Force } }
    }
    It 'a manifest-write failure BEFORE deletion leaves the file intact and the durable state present (15)' {
        $root = New-CleanupFixtureRoot
        $lock = $null
        try {
            $fx = New-CleanupRun -Root $root -Artifacts @(New-Artifact -FileName 'm.srt' -SizeBytes 3)
            $f = New-MediaFile -Dir $fx.RunDir -Name 'm.srt' -Content 'abc'
            # FileShare.Read on manifest.json: the reload can still read it, but the atomic Replace of
            # the present->deleting write is blocked, so cleanup must not delete.
            $mp = Join-Path $fx.RunDir 'manifest.json'
            $lock = [System.IO.File]::Open($mp, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::Read)
            $s = Invoke-VideoScoutSuccessMediaCleanup -RunDir $fx.RunDir -DownloadsRoot $root
            $lock.Close(); $lock = $null
            $s.deleted | Should Be 0
            $s.warning | Should Be 'manifest-update-failed'
            Test-Path -LiteralPath $f | Should Be $true
            (Get-DiskManifest -RunDir $fx.RunDir).mediaArtifacts[0].state | Should Be 'present'
        }
        finally { if ($lock) { $lock.Close() }; if (Test-Path -LiteralPath $root) { Remove-Item -LiteralPath $root -Recurse -Force } }
    }
    It 'a manifest-write failure AFTER deletion leaves durable state deleting, never a false deleted (16)' {
        $root = New-CleanupFixtureRoot
        $lock = $null
        try {
            # Seed the artifact already in durable 'deleting' with the file present. The only manifest
            # write cleanup performs is deleting->deleted; blocking it (after the real FS delete
            # succeeds) must leave durable 'deleting'.
            $seed = New-Artifact -FileName 'd.srt' -SizeBytes 3 -State 'deleting' -DeletionReason 'completed-analysis'
            $fx = New-CleanupRun -Root $root -Artifacts @($seed)
            $f = New-MediaFile -Dir $fx.RunDir -Name 'd.srt' -Content 'abc'
            $mp = Join-Path $fx.RunDir 'manifest.json'
            $lock = [System.IO.File]::Open($mp, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::Read)
            $s = Invoke-VideoScoutSuccessMediaCleanup -RunDir $fx.RunDir -DownloadsRoot $root
            $lock.Close(); $lock = $null
            # The file WAS deleted, but the manifest still says 'deleting' (honest crash truth).
            Test-Path -LiteralPath $f | Should Be $false
            $s.warning | Should Be 'manifest-update-failed'
            $s.deleted | Should Be 0
            $disk = Get-DiskManifest -RunDir $fx.RunDir
            $disk.mediaArtifacts[0].state | Should Be 'deleting'
            $disk.mediaArtifacts[0].deletedAt | Should Be $null
        }
        finally { if ($lock) { $lock.Close() }; if (Test-Path -LiteralPath $root) { Remove-Item -LiteralPath $root -Recurse -Force } }
    }
}

Describe 'V5c2a cleanup — one at a time, no scan, bounded diagnostics (17,18)' {
    It 'deletes each owned artifact and leaves an unrecorded sibling untouched (17)' {
        $root = New-CleanupFixtureRoot
        try {
            $a1 = New-Artifact -FileName 'a.srt' -SizeBytes 3
            $a2 = New-Artifact -FileName 'b.srt' -SizeBytes 3
            $fx = New-CleanupRun -Root $root -Artifacts @($a1, $a2)
            New-MediaFile -Dir $fx.RunDir -Name 'a.srt' -Content 'abc' | Out-Null
            New-MediaFile -Dir $fx.RunDir -Name 'b.srt' -Content 'abc' | Out-Null
            $unrecorded = New-MediaFile -Dir $fx.RunDir -Name 'c.srt' -Content 'abc'   # same ext, NOT in the manifest
            $s = Invoke-VideoScoutSuccessMediaCleanup -RunDir $fx.RunDir -DownloadsRoot $root
            $s.deleted | Should Be 2
            Test-Path -LiteralPath (Join-Path $fx.RunDir 'a.srt') | Should Be $false
            Test-Path -LiteralPath (Join-Path $fx.RunDir 'b.srt') | Should Be $false
            Test-Path -LiteralPath $unrecorded | Should Be $true   # never discovered by a scan
        }
        finally { if (Test-Path -LiteralPath $root) { Remove-Item -LiteralPath $root -Recurse -Force } }
    }
    It 'the returned summary carries only bounded metadata (no paths/content) and allowlisted reasons (18)' {
        $root = New-CleanupFixtureRoot
        try {
            $fx = New-CleanupRun -Root $root -Artifacts @(New-Artifact -FileName 'v.srt' -SizeBytes 3)
            New-MediaFile -Dir $fx.RunDir -Name 'v.srt' -Content 'abc' | Out-Null
            $s = Invoke-VideoScoutSuccessMediaCleanup -RunDir $fx.RunDir -DownloadsRoot $root
            # Only known scalar/count fields + a bounded reasons list; every reason is an allowlist member.
            $names = @($s.PSObject.Properties.Name | Sort-Object)
            ($names -join ',') | Should Be 'deleted,eligible,failed,missing,processed,reasons,runId,skipped,warning'
            foreach ($r in @($s.reasons)) { ($script:VSAllowlist -contains $r) | Should Be $true }
            # runId is the bounded run label only (no path separators).
            ($s.runId -match '[\\/]') | Should Be $false
        }
        finally { if (Test-Path -LiteralPath $root) { Remove-Item -LiteralPath $root -Recurse -Force } }
    }
}

Describe 'V5c2a non-destructive tripwire (source: literal delete only, no scan/wildcard/recursion/move)' {
    $src = Get-Content -LiteralPath (Join-Path $here 'cleanup-video-scout-media.ps1') -Raw
    It 'the ONLY filesystem delete is a literal [System.IO.File]::Delete (no directory/move/wildcard/recursive delete)' {
        # Exactly the literal single-file delete is permitted; nothing recursive, no directory delete,
        # no move/quarantine, no shell-built deletion.
        ([regex]::Matches($src, '\[System\.IO\.File\]::Delete\b')).Count | Should Be 1
        foreach ($banned in @('\[System\.IO\.Directory\]::Delete', '\[IO\.Directory\]::Delete',
                'Remove-Item', 'Move-Item', 'Clear-Content', '\[System\.IO\.File\]::Move', '\[IO\.File\]::Move',
                '-Recurse', 'rmdir', 'del ', 'Remove-ItemProperty')) {
            ($src -match $banned) | Should Be $false
        }
    }
    It 'deletion targets never come from a directory scan (no Get-ChildItem / Enumerate*)' {
        ($src -match 'Get-ChildItem') | Should Be $false
        ($src -match 'EnumerateFiles') | Should Be $false
        ($src -match 'EnumerateFileSystemEntries') | Should Be $false
        ($src -match 'EnumerateDirectories') | Should Be $false
        ($src -match '\*\.srt|\*\.mp3|\*\.mp4') | Should Be $false   # no extension glob
    }
}
