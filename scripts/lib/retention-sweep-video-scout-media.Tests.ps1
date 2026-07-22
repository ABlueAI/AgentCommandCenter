<#
.SYNOPSIS
  Pester tests for the V5c2b cross-run retention / reconciliation sweep
  (retention-sweep-video-scout-media.ps1) and the parameterized shared deletion authority.
.DESCRIPTION
  Run with: Invoke-Pester -Path scripts\lib\retention-sweep-video-scout-media.Tests.ps1
  Pester 4.x (no BeforeAll). NO network, NO Gemini, NO download. Uses ONLY temporary fixture roots
  under $env:TEMP — it NEVER touches D:\Gemini_Video_Review\downloads. Every destructive assertion is a
  disposable fixture cleaned up in a finally block.

  Covers: the two eligibility lanes (completed reconciliation + retention cleanup), the dual age gate
  (validated + FS, fail-closed on missing/future), reconciliation preserving the durable reason, opt-in
  delete-failed retry (transient only, fresh lane intent), ownership boundary (unowned survive, invalid
  manifest / reparse run dir skipped), the caps (>candidates refuses the WHOLE invocation; -Apply stops
  at the mutation cap), the single-process mutex, dry-run-writes-nothing, the authorization-reason guard
  on the shared deletion function, V5c2a default-behavior regression, and a source tripwire.
#>
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
. (Join-Path $here 'retention-sweep-video-scout-media.ps1')

# --- fixture helpers -------------------------------------------------------------------------------
function New-SweepRoot { Join-Path $env:TEMP ('vsret-' + [guid]::NewGuid().ToString('N')) }

function New-MediaFile {
    param([string]$Dir, [string]$Name, [string]$Content = 'abc')
    $p = Join-Path $Dir $Name
    Set-Content -LiteralPath $p -Value $Content -Encoding ASCII -NoNewline
    return $p
}

function VSOldUtc { param([double]$Days) (Get-Date).ToUniversalTime().AddDays(-$Days).ToString('yyyy-MM-ddTHH:mm:ss.fffZ') }

function New-Artifact {
    param([string]$FileName, [string]$Kind = 'transcript', [long]$SizeBytes = 3, [string]$State = 'present',
        [object]$DeletedAt = $null, [object]$DeletionReason = $null, [string]$RecordedAt = '2026-01-01T10:10:10.500Z')
    [ordered]@{ fileName = $FileName; kind = $Kind; sizeBytes = $SizeBytes; recordedAt = $RecordedAt; state = $State; deletedAt = $DeletedAt; deletionReason = $DeletionReason }
}

function Get-DiskManifest { param([string]$RunDir) (Get-Content -LiteralPath (Join-Path $RunDir 'manifest.json') -Raw -Encoding UTF8) | ConvertFrom-Json }

# Build a run dir + a schema-valid manifest with controllable outcome, report, artifacts, and BOTH age
# sources (validated timestamp + manifest.json LastWriteTimeUtc). Returns @{ Root; RunDir; RunId }.
function New-SweepRun {
    param(
        [string]$Root,
        [string]$RunId = ('run-20260101-101010-101-2222-' + ([guid]::NewGuid().ToString('N').Substring(0, 8))),
        [ValidateSet('completed', 'error', 'refused', 'null')][string]$Outcome = 'error',
        [object]$ReportFile = $null,
        [switch]$WriteReport,
        [object[]]$Artifacts = @(),
        [double]$ValidatedAgeDays = 30,
        [double]$FsAgeDays = 30,
        [switch]$SchemaV1,
        [switch]$FutureValidated
    )
    $runDir = Join-Path $Root $RunId
    New-Item -ItemType Directory -Path $runDir -Force | Out-Null

    if ($SchemaV1) {
        $m = New-VideoScoutManifestBase
        $m.runId = $RunId; $m.videoScout = $false; $m.appliedMode = 'transcript'; $m.route = 'cli'
        $m.mediaResolutionRequested = 'MEDIUM'; $m.startedAt = (VSOldUtc $ValidatedAgeDays)
        $m.finishedAt = (VSOldUtc $ValidatedAgeDays); $m.outcome = 'completed'; $m.reportFile = 'analysis-output.txt'
    }
    else {
        $m = New-VideoScoutLiveManifest -RunId $RunId -AppliedMode 'transcript' -Route 'cli' -MediaResolutionRequested 'MEDIUM'
        $stamp = if ($FutureValidated) { VSOldUtc (-2) } else { VSOldUtc $ValidatedAgeDays }   # -2 => 2 days in the FUTURE
        $m.startedAt = $stamp
        if ($Outcome -ne 'null') {
            $m.outcome = $Outcome
            $m.finishedAt = $stamp
            if ($Outcome -ne 'completed') { $m.reason = 'test reason' }
        }
        if ($null -ne $ReportFile) { $m.reportFile = [string]$ReportFile }
        $m.mediaArtifacts = @($Artifacts)
    }
    if ($WriteReport -and ($null -ne $ReportFile)) { New-MediaFile -Dir $runDir -Name ([string]$ReportFile) -Content '## 1. TL;DR' | Out-Null }
    [void](Write-VideoScoutManifestFile -RunDir $runDir -Manifest $m)
    (Get-Item -LiteralPath (Join-Path $runDir 'manifest.json')).LastWriteTimeUtc = (Get-Date).ToUniversalTime().AddDays(-$FsAgeDays)
    return @{ Root = $Root; RunDir = $runDir; RunId = $RunId }
}

# ==================================================================================================
Describe 'V5c2b retention lane — error/refused/null delete OWNED media with the honest reason' {
    foreach ($case in @(
            @{ Outcome = 'error';   Reason = 'retention-error' },
            @{ Outcome = 'refused'; Reason = 'retention-refused' },
            @{ Outcome = 'null';    Reason = 'retention-abandoned' })) {
        It "an old $($case.Outcome) run deletes its present .srt and records $($case.Reason)" {
            $root = New-SweepRoot
            try {
                $fx = New-SweepRun -Root $root -Outcome $case.Outcome -Artifacts @(New-Artifact -FileName 'owned.srt' -SizeBytes 3)
                $owned = New-MediaFile -Dir $fx.RunDir -Name 'owned.srt' -Content 'abc'
                $sib = New-MediaFile -Dir $fx.RunDir -Name 'unowned.srt' -Content 'zz'
                $s = Invoke-VideoScoutRetentionSweep -DownloadsRoot $root -Apply
                $s.eligibleRetention | Should Be 1
                $s.deleted | Should Be 1
                Test-Path -LiteralPath $owned | Should Be $false
                Test-Path -LiteralPath $sib | Should Be $true          # unowned survives (no scan)
                $disk = Get-DiskManifest -RunDir $fx.RunDir
                $disk.mediaArtifacts[0].state | Should Be 'deleted'
                $disk.mediaArtifacts[0].deletionReason | Should Be $case.Reason
                $disk.mediaArtifacts[0].deletedAt | Should Match '^\d{4}-\d{2}-\d{2}T'
                { Assert-VideoScoutManifestValid -Manifest $disk } | Should Not Throw
            }
            finally { if (Test-Path -LiteralPath $root) { Remove-Item -LiteralPath $root -Recurse -Force } }
        }
    }
}

Describe 'V5c2b completed-reconciliation lane (Lane 1)' {
    It 'finishes a crash-missed present artifact on an OLD completed run with completed-analysis' {
        $root = New-SweepRoot
        try {
            $fx = New-SweepRun -Root $root -Outcome 'completed' -ReportFile 'analysis-output.txt' -WriteReport -Artifacts @(New-Artifact -FileName 'v.srt' -SizeBytes 3)
            New-MediaFile -Dir $fx.RunDir -Name 'v.srt' -Content 'abc' | Out-Null
            $s = Invoke-VideoScoutRetentionSweep -DownloadsRoot $root -Apply
            $s.eligibleCompleted | Should Be 1
            $s.deleted | Should Be 1
            $disk = Get-DiskManifest -RunDir $fx.RunDir
            $disk.mediaArtifacts[0].state | Should Be 'deleted'
            $disk.mediaArtifacts[0].deletionReason | Should Be 'completed-analysis'
            Test-Path -LiteralPath (Join-Path $fx.RunDir 'analysis-output.txt') | Should Be $true   # report retained
        }
        finally { if (Test-Path -LiteralPath $root) { Remove-Item -LiteralPath $root -Recurse -Force } }
    }
    It 'reconciles a stale deleting (V5c2a-origin) with the file gone -> deleted, reason preserved' {
        $root = New-SweepRoot
        try {
            $seed = New-Artifact -FileName 'g.srt' -SizeBytes 3 -State 'deleting' -DeletionReason 'completed-analysis'
            $fx = New-SweepRun -Root $root -Outcome 'completed' -ReportFile 'analysis-output.txt' -WriteReport -Artifacts @($seed)  # no file on disk
            $s = Invoke-VideoScoutRetentionSweep -DownloadsRoot $root -Apply
            $s.reconciled | Should Be 1
            $disk = Get-DiskManifest -RunDir $fx.RunDir
            $disk.mediaArtifacts[0].state | Should Be 'deleted'
            $disk.mediaArtifacts[0].deletionReason | Should Be 'completed-analysis'
        }
        finally { if (Test-Path -LiteralPath $root) { Remove-Item -LiteralPath $root -Recurse -Force } }
    }
    It 'preserves a completed NoFeed run (reportFile null) — media stays present' {
        $root = New-SweepRoot
        try {
            $fx = New-SweepRun -Root $root -Outcome 'completed' -ReportFile $null -Artifacts @(New-Artifact -FileName 'a.srt' -SizeBytes 3)
            $f = New-MediaFile -Dir $fx.RunDir -Name 'a.srt' -Content 'abc'
            $s = Invoke-VideoScoutRetentionSweep -DownloadsRoot $root -Apply
            $s.eligibleCompleted | Should Be 0
            $s.deleted | Should Be 0
            Test-Path -LiteralPath $f | Should Be $true
            (Get-DiskManifest -RunDir $fx.RunDir).mediaArtifacts[0].state | Should Be 'present'
        }
        finally { if (Test-Path -LiteralPath $root) { Remove-Item -LiteralPath $root -Recurse -Force } }
    }
    It 'preserves a completed run whose report file is MISSING' {
        $root = New-SweepRoot
        try {
            $fx = New-SweepRun -Root $root -Outcome 'completed' -ReportFile 'analysis-output.txt' -Artifacts @(New-Artifact -FileName 'a.srt' -SizeBytes 3)  # -WriteReport omitted
            $f = New-MediaFile -Dir $fx.RunDir -Name 'a.srt' -Content 'abc'
            $s = Invoke-VideoScoutRetentionSweep -DownloadsRoot $root -Apply
            $s.eligibleCompleted | Should Be 0
            Test-Path -LiteralPath $f | Should Be $true
        }
        finally { if (Test-Path -LiteralPath $root) { Remove-Item -LiteralPath $root -Recurse -Force } }
    }
}

Describe 'V5c2b reconciliation preserves a RETENTION-origin deleting reason' {
    It 'a stale deleting with reason retention-error finalizes to deleted keeping retention-error' {
        $root = New-SweepRoot
        try {
            $seed = New-Artifact -FileName 'r.srt' -SizeBytes 3 -State 'deleting' -DeletionReason 'retention-error'
            $fx = New-SweepRun -Root $root -Outcome 'error' -Artifacts @($seed)   # no file on disk
            $s = Invoke-VideoScoutRetentionSweep -DownloadsRoot $root -Apply
            $s.reconciled | Should Be 1
            $disk = Get-DiskManifest -RunDir $fx.RunDir
            $disk.mediaArtifacts[0].state | Should Be 'deleted'
            $disk.mediaArtifacts[0].deletionReason | Should Be 'retention-error'   # NOT rewritten to completed-analysis
        }
        finally { if (Test-Path -LiteralPath $root) { Remove-Item -LiteralPath $root -Recurse -Force } }
    }
}

Describe 'V5c2b dual age gate (fail-closed)' {
    It 'retains media when the FS age is young even though the validated age is old' {
        $root = New-SweepRoot
        try {
            $fx = New-SweepRun -Root $root -Outcome 'error' -ValidatedAgeDays 30 -FsAgeDays 0 -Artifacts @(New-Artifact -FileName 'y.srt' -SizeBytes 3)
            $f = New-MediaFile -Dir $fx.RunDir -Name 'y.srt' -Content 'abc'
            $s = Invoke-VideoScoutRetentionSweep -DownloadsRoot $root -Apply
            $s.eligibleRetention | Should Be 0
            Test-Path -LiteralPath $f | Should Be $true
        }
        finally { if (Test-Path -LiteralPath $root) { Remove-Item -LiteralPath $root -Recurse -Force } }
    }
    It 'retains media when the validated age is young even though the FS age is old' {
        $root = New-SweepRoot
        try {
            $fx = New-SweepRun -Root $root -Outcome 'error' -ValidatedAgeDays 0 -FsAgeDays 30 -Artifacts @(New-Artifact -FileName 'y.srt' -SizeBytes 3)
            $f = New-MediaFile -Dir $fx.RunDir -Name 'y.srt' -Content 'abc'
            $s = Invoke-VideoScoutRetentionSweep -DownloadsRoot $root -Apply
            $s.eligibleRetention | Should Be 0
            Test-Path -LiteralPath $f | Should Be $true
        }
        finally { if (Test-Path -LiteralPath $root) { Remove-Item -LiteralPath $root -Recurse -Force } }
    }
    It 'retains media when the validated timestamp is in the FUTURE (clock skew)' {
        $root = New-SweepRoot
        try {
            $fx = New-SweepRun -Root $root -Outcome 'error' -FutureValidated -FsAgeDays 30 -Artifacts @(New-Artifact -FileName 'y.srt' -SizeBytes 3)
            $f = New-MediaFile -Dir $fx.RunDir -Name 'y.srt' -Content 'abc'
            $s = Invoke-VideoScoutRetentionSweep -DownloadsRoot $root -Apply
            $s.eligibleRetention | Should Be 0
            Test-Path -LiteralPath $f | Should Be $true
        }
        finally { if (Test-Path -LiteralPath $root) { Remove-Item -LiteralPath $root -Recurse -Force } }
    }
}

Describe 'V5c2b never touches schema-v1 / backfilled history' {
    It 'leaves a schema-v1 run byte-for-byte unchanged' {
        $root = New-SweepRoot
        try {
            $fx = New-SweepRun -Root $root -SchemaV1
            $f = New-MediaFile -Dir $fx.RunDir -Name 'legacy.srt' -Content 'abc'
            $before = Get-Content -LiteralPath (Join-Path $fx.RunDir 'manifest.json') -Raw
            $s = Invoke-VideoScoutRetentionSweep -DownloadsRoot $root -Apply
            $s.eligibleRetention | Should Be 0
            $s.eligibleCompleted | Should Be 0
            Test-Path -LiteralPath $f | Should Be $true
            (Get-Content -LiteralPath (Join-Path $fx.RunDir 'manifest.json') -Raw) | Should Be $before
        }
        finally { if (Test-Path -LiteralPath $root) { Remove-Item -LiteralPath $root -Recurse -Force } }
    }
}

Describe 'V5c2b ownership boundary — invalid manifest and reparse run dir skipped' {
    It 'skips a directory with no valid manifest and deletes nothing there' {
        $root = New-SweepRoot
        try {
            $junk = Join-Path $root 'run-notarun'
            New-Item -ItemType Directory -Path $junk -Force | Out-Null
            $f = New-MediaFile -Dir $junk -Name 'stray.srt' -Content 'abc'   # no manifest.json
            $s = Invoke-VideoScoutRetentionSweep -DownloadsRoot $root -Apply
            $s.scanned | Should Be 1
            $s.eligibleRetention | Should Be 0
            Test-Path -LiteralPath $f | Should Be $true
        }
        finally { if (Test-Path -LiteralPath $root) { Remove-Item -LiteralPath $root -Recurse -Force } }
    }
    It 'skips a run directory that is a reparse point (junction)' {
        $root = New-SweepRoot
        try {
            $real = New-SweepRun -Root $root -Outcome 'error' -Artifacts @(New-Artifact -FileName 'v.srt' -SizeBytes 3) -RunId 'run-real'
            New-MediaFile -Dir $real.RunDir -Name 'v.srt' -Content 'abc' | Out-Null
            $junc = Join-Path $root 'run-junction'
            cmd /c mklink /J "$junc" "$($real.RunDir)" | Out-Null
            # Sweep the whole root: the real dir deletes v.srt; the junction is refused. The file is gone
            # via the real path; assert the junction itself was not the deletion authority (no double count).
            $s = Invoke-VideoScoutRetentionSweep -DownloadsRoot $root -Apply
            # Exactly one eligible retention run (the real one); the junction contributed nothing.
            $s.eligibleRetention | Should Be 1
        }
        finally { if (Test-Path -LiteralPath $root) { Remove-Item -LiteralPath $root -Recurse -Force } }
    }
}

Describe 'V5c2b opt-in delete-failed retry (transient only, fresh lane intent)' {
    It 'skips delete-failed by default' {
        $root = New-SweepRoot
        try {
            $seed = New-Artifact -FileName 'f.srt' -SizeBytes 3 -State 'delete-failed' -DeletionReason 'filesystem-delete-failed'
            $fx = New-SweepRun -Root $root -Outcome 'error' -Artifacts @($seed)
            $f = New-MediaFile -Dir $fx.RunDir -Name 'f.srt' -Content 'abc'
            $s = Invoke-VideoScoutRetentionSweep -DownloadsRoot $root -Apply
            $s.retried | Should Be 0
            $s.skipped | Should Be 1
            Test-Path -LiteralPath $f | Should Be $true
            (Get-DiskManifest -RunDir $fx.RunDir).mediaArtifacts[0].state | Should Be 'delete-failed'
        }
        finally { if (Test-Path -LiteralPath $root) { Remove-Item -LiteralPath $root -Recurse -Force } }
    }
    It 'retries a transient filesystem-delete-failed and deletes with the lane reason' {
        $root = New-SweepRoot
        try {
            $seed = New-Artifact -FileName 'f.srt' -SizeBytes 3 -State 'delete-failed' -DeletionReason 'filesystem-delete-failed'
            $fx = New-SweepRun -Root $root -Outcome 'refused' -Artifacts @($seed)
            $f = New-MediaFile -Dir $fx.RunDir -Name 'f.srt' -Content 'abc'
            $s = Invoke-VideoScoutRetentionSweep -DownloadsRoot $root -Apply -RetryDeleteFailed
            $s.retried | Should Be 1
            $s.deleted | Should Be 1
            Test-Path -LiteralPath $f | Should Be $false
            $disk = Get-DiskManifest -RunDir $fx.RunDir
            $disk.mediaArtifacts[0].state | Should Be 'deleted'
            $disk.mediaArtifacts[0].deletionReason | Should Be 'retention-refused'
        }
        finally { if (Test-Path -LiteralPath $root) { Remove-Item -LiteralPath $root -Recurse -Force } }
    }
    It 'never retries a terminal identity-mismatch delete-failed even with -RetryDeleteFailed' {
        $root = New-SweepRoot
        try {
            $seed = New-Artifact -FileName 'f.srt' -SizeBytes 3 -State 'delete-failed' -DeletionReason 'identity-mismatch'
            $fx = New-SweepRun -Root $root -Outcome 'error' -Artifacts @($seed)
            $f = New-MediaFile -Dir $fx.RunDir -Name 'f.srt' -Content 'abc'
            $s = Invoke-VideoScoutRetentionSweep -DownloadsRoot $root -Apply -RetryDeleteFailed
            $s.retried | Should Be 0
            $s.skipped | Should Be 1
            Test-Path -LiteralPath $f | Should Be $true
        }
        finally { if (Test-Path -LiteralPath $root) { Remove-Item -LiteralPath $root -Recurse -Force } }
    }
}

Describe 'V5c2b caps' {
    It 'refuses the ENTIRE invocation (zero mutation) when candidates exceed the cap' {
        $root = New-SweepRoot
        try {
            $fx = New-SweepRun -Root $root -Outcome 'error' -Artifacts @(New-Artifact -FileName 'v.srt' -SizeBytes 3) -RunId 'run-a'
            New-MediaFile -Dir $fx.RunDir -Name 'v.srt' -Content 'abc' | Out-Null
            New-Item -ItemType Directory -Path (Join-Path $root 'run-b') -Force | Out-Null   # 2 direct children
            $s = Invoke-VideoScoutRetentionSweep -DownloadsRoot $root -Apply -MaxRunCandidates 1
            $s.capExceeded | Should Be $true
            $s.refused | Should Be 'cap-exceeded'
            $s.scanned | Should Be 0
            Test-Path -LiteralPath (Join-Path $fx.RunDir 'v.srt') | Should Be $true   # nothing mutated
        }
        finally { if (Test-Path -LiteralPath $root) { Remove-Item -LiteralPath $root -Recurse -Force } }
    }
    It 'stops at the mutation cap and reports capExhausted' {
        $root = New-SweepRoot
        try {
            for ($i = 0; $i -lt 3; $i++) {
                $fx = New-SweepRun -Root $root -Outcome 'error' -Artifacts @(New-Artifact -FileName 'v.srt' -SizeBytes 3) -RunId ("run-{0:D2}" -f $i)
                New-MediaFile -Dir $fx.RunDir -Name 'v.srt' -Content 'abc' | Out-Null
            }
            $s = Invoke-VideoScoutRetentionSweep -DownloadsRoot $root -Apply -MaxMutatedRuns 2
            $s.runsMutated | Should Be 2
            $s.capExhausted | Should Be $true
        }
        finally { if (Test-Path -LiteralPath $root) { Remove-Item -LiteralPath $root -Recurse -Force } }
    }
}

Describe 'V5c2b single-process mutex' {
    It 'refuses visibly when another sweep already holds the lock' {
        # A named mutex is RE-ENTRANT on the same thread, so the concurrent holder must run on a
        # SEPARATE runspace/thread; otherwise the sweep's own WaitOne(0) would re-acquire and pass falsely.
        $root = New-SweepRoot
        $ps = $null; $rs = $null; $async = $null
        try {
            $fx = New-SweepRun -Root $root -Outcome 'error' -Artifacts @(New-Artifact -FileName 'v.srt' -SizeBytes 3)
            New-MediaFile -Dir $fx.RunDir -Name 'v.srt' -Content 'abc' | Out-Null
            $fullRoot = [System.IO.Path]::GetFullPath($root).TrimEnd('\', '/')
            $name = 'Local\vsc2b-retention-' + (Get-VSRetentionRootHash -Root $fullRoot)
            $sync = [hashtable]::Synchronized(@{ acquired = $false; release = $false })

            $rs = [runspacefactory]::CreateRunspace(); $rs.Open()
            $rs.SessionStateProxy.SetVariable('name', $name)
            $rs.SessionStateProxy.SetVariable('sync', $sync)
            $ps = [powershell]::Create(); $ps.Runspace = $rs
            [void]$ps.AddScript({
                    $m = New-Object System.Threading.Mutex($false, $name)
                    $sync.acquired = $m.WaitOne(0)
                    while (-not $sync.release) { Start-Sleep -Milliseconds 20 }
                    if ($sync.acquired) { [void]$m.ReleaseMutex() }
                    $m.Dispose()
                })
            $async = $ps.BeginInvoke()
            $spins = 0
            while (-not $sync.acquired -and $spins -lt 250) { Start-Sleep -Milliseconds 20; $spins++ }
            $sync.acquired | Should Be $true   # the other runspace really holds the lock

            $s = Invoke-VideoScoutRetentionSweep -DownloadsRoot $root -Apply
            $s.concurrentRefused | Should Be $true
            $s.refused | Should Be 'concurrent-sweep'
            Test-Path -LiteralPath (Join-Path $fx.RunDir 'v.srt') | Should Be $true   # untouched

            $sync.release = $true
            [void]$ps.EndInvoke($async)
        }
        finally {
            $sync.release = $true
            if ($ps) { $ps.Dispose() }
            if ($rs) { $rs.Close() }
            if (Test-Path -LiteralPath $root) { Remove-Item -LiteralPath $root -Recurse -Force }
        }
    }
    It 'a later sweep acquires normally once the lock is released (release works)' {
        $root = New-SweepRoot
        try {
            $fx = New-SweepRun -Root $root -Outcome 'error' -Artifacts @(New-Artifact -FileName 'v.srt' -SizeBytes 3)
            New-MediaFile -Dir $fx.RunDir -Name 'v.srt' -Content 'abc' | Out-Null
            $null = Invoke-VideoScoutRetentionSweep -DownloadsRoot $root   # dry-run acquires + releases
            $s = Invoke-VideoScoutRetentionSweep -DownloadsRoot $root -Apply
            $s.concurrentRefused | Should Be $false
            $s.deleted | Should Be 1
        }
        finally { if (Test-Path -LiteralPath $root) { Remove-Item -LiteralPath $root -Recurse -Force } }
    }
}

Describe 'V5c2b dry-run classifies but writes nothing' {
    It 'reports would-delete counts and leaves the file and manifest untouched' {
        $root = New-SweepRoot
        try {
            $fx = New-SweepRun -Root $root -Outcome 'error' -Artifacts @(New-Artifact -FileName 'v.srt' -SizeBytes 3)
            $f = New-MediaFile -Dir $fx.RunDir -Name 'v.srt' -Content 'abc'
            $before = Get-Content -LiteralPath (Join-Path $fx.RunDir 'manifest.json') -Raw
            $s = Invoke-VideoScoutRetentionSweep -DownloadsRoot $root      # no -Apply
            $s.dryRun | Should Be $true
            $s.eligibleRetention | Should Be 1
            $s.deleted | Should Be 1                                       # WOULD delete
            $s.runsMutated | Should Be 0
            Test-Path -LiteralPath $f | Should Be $true                    # still there
            (Get-Content -LiteralPath (Join-Path $fx.RunDir 'manifest.json') -Raw) | Should Be $before
        }
        finally { if (Test-Path -LiteralPath $root) { Remove-Item -LiteralPath $root -Recurse -Force } }
    }
}

Describe 'V5c2b bounded summary shape + validation guards' {
    It 'the summary carries only bounded scalar/count fields + a bounded reasons list (no paths)' {
        $root = New-SweepRoot
        try {
            $fx = New-SweepRun -Root $root -Outcome 'error' -Artifacts @(New-Artifact -FileName 'v.srt' -SizeBytes 3)
            New-MediaFile -Dir $fx.RunDir -Name 'v.srt' -Content 'abc' | Out-Null
            $s = Invoke-VideoScoutRetentionSweep -DownloadsRoot $root
            $names = @($s.PSObject.Properties.Name | Sort-Object)
            ($names -join ',') | Should Be 'applied,capExceeded,capExhausted,concurrentRefused,deleted,dryRun,eligibleCompleted,eligibleRetention,failed,missing,reasons,reconciled,refused,retried,runsMutated,scanned,skipped,warning'
        }
        finally { if (Test-Path -LiteralPath $root) { Remove-Item -LiteralPath $root -Recurse -Force } }
    }
    It 'rejects -MinimumAgeDays below the 1-day floor' {
        $root = New-SweepRoot
        try { { Invoke-VideoScoutRetentionSweep -DownloadsRoot $root -MinimumAgeDays 0 } | Should Throw }
        finally { if (Test-Path -LiteralPath $root) { Remove-Item -LiteralPath $root -Recurse -Force } }
    }
    It 'the 1-day floor stays ABOVE the enforced 4-hour max analysis duration' {
        ($script:VSRetentionMinAgeFloorDays * 24) | Should BeGreaterThan $script:VSRetentionMaxAnalysisDurationHours
    }
    It 'refuses a missing downloads root' {
        $s = Invoke-VideoScoutRetentionSweep -DownloadsRoot (Join-Path $env:TEMP ('vsret-missing-' + [guid]::NewGuid().ToString('N')))
        $s.refused | Should Be 'downloads-root-missing'
    }
}

Describe 'V5c2b schema authorization subset + shared-function guard' {
    It 'the persisted allowlist gained the three retention reasons and the authorization subset excludes failure reasons' {
        foreach ($r in @('retention-error', 'retention-refused', 'retention-abandoned')) {
            ($script:VideoScoutMediaDeletionReasons -contains $r) | Should Be $true
            ($script:VideoScoutMediaAuthorizationReasons -contains $r) | Should Be $true
        }
        foreach ($f in @('identity-mismatch', 'filesystem-delete-failed', 'owned-file-missing', 'unsafe-file-type', 'reparse-point-refused')) {
            ($script:VideoScoutMediaAuthorizationReasons -contains $f) | Should Be $false
        }
    }
    It 'Remove-OneVideoScoutMediaArtifact refuses a non-authorization -DeletionReason without mutating' {
        $root = New-SweepRoot
        try {
            $fx = New-SweepRun -Root $root -Outcome 'error' -Artifacts @(New-Artifact -FileName 'v.srt' -SizeBytes 3)
            $f = New-MediaFile -Dir $fx.RunDir -Name 'v.srt' -Content 'abc'
            $load = Read-VideoScoutManifestForCleanup -RunDir $fx.RunDir
            $full = [System.IO.Path]::GetFullPath($fx.RunDir).TrimEnd('\', '/')
            $rootFull = [System.IO.Path]::GetFullPath($root).TrimEnd('\', '/')
            $res = Remove-OneVideoScoutMediaArtifact -FullRunDir $full -FullDownloadsRoot $rootFull -Manifest $load.manifest -Index 0 -DeletionReason 'identity-mismatch'
            $res.outcome | Should Be 'failed'
            $res.warning | Should Be 'invalid-authorization-reason'
            Test-Path -LiteralPath $f | Should Be $true
            $load.manifest.mediaArtifacts[0].state | Should Be 'present'
        }
        finally { if (Test-Path -LiteralPath $root) { Remove-Item -LiteralPath $root -Recurse -Force } }
    }
    It 'Remove-OneVideoScoutMediaArtifact default (no -DeletionReason) still deletes with completed-analysis (V5c2a regression)' {
        $root = New-SweepRoot
        try {
            $fx = New-SweepRun -Root $root -Outcome 'completed' -ReportFile 'analysis-output.txt' -WriteReport -Artifacts @(New-Artifact -FileName 'v.srt' -SizeBytes 3)
            $f = New-MediaFile -Dir $fx.RunDir -Name 'v.srt' -Content 'abc'
            $load = Read-VideoScoutManifestForCleanup -RunDir $fx.RunDir
            $full = [System.IO.Path]::GetFullPath($fx.RunDir).TrimEnd('\', '/')
            $rootFull = [System.IO.Path]::GetFullPath($root).TrimEnd('\', '/')
            $res = Remove-OneVideoScoutMediaArtifact -FullRunDir $full -FullDownloadsRoot $rootFull -Manifest $load.manifest -Index 0
            $res.outcome | Should Be 'deleted'
            $res.reason | Should Be 'completed-analysis'
            Test-Path -LiteralPath $f | Should Be $false
        }
        finally { if (Test-Path -LiteralPath $root) { Remove-Item -LiteralPath $root -Recurse -Force } }
    }
}

Describe 'V5c2b non-destructive tripwire (source: no direct delete/move/media-scan; delegates to the authority)' {
    $src = Get-Content -LiteralPath (Join-Path $here 'retention-sweep-video-scout-media.ps1') -Raw
    It 'performs NO direct filesystem delete/move of its own (delegates every deletion to Remove-One...)' {
        ($src -match '\[System\.IO\.File\]::Delete') | Should Be $false
        ($src -match '\[System\.IO\.File\]::Move')   | Should Be $false
        ($src -match 'Remove-Item')                  | Should Be $false
        ($src -match 'Move-Item')                    | Should Be $false
        ($src -match '\[System\.IO\.Directory\]::Delete') | Should Be $false
        ($src -match '-Recurse')                     | Should Be $false
        ($src -match 'Remove-OneVideoScoutMediaArtifact') | Should Be $true
        ($src -match 'Get-VideoScoutMediaDeletionSafety') | Should Be $true
    }
    It 'never scans for media files or globs extensions (only EnumerateDirectories for run candidates)' {
        ($src -match 'EnumerateFiles')               | Should Be $false
        ($src -match 'Get-ChildItem')                | Should Be $false
        ($src -match '\*\.srt|\*\.mp3|\*\.mp4')       | Should Be $false
        ($src -match 'EnumerateDirectories')         | Should Be $true
    }
    It 'treats an abandoned mutex as acquired-after-crash' {
        ($src -match 'AbandonedMutexException') | Should Be $true
    }
}
