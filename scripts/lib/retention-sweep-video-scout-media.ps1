<#
.SYNOPSIS
  V5c2b: the manual, cross-run retention / reconciliation sweep. It deletes downloaded media a run no
  longer needs (errored / refused / abandoned runs) and reconciles crash-interrupted deletions on old
  completed runs -- deleting ONLY media explicitly owned by a bounded, schema-valid V2 manifest, and
  NEVER a directory, report, or manifest.
.DESCRIPTION
  This module owns NO deletion logic of its own. Every media state transition is delegated to the ONE
  shared V5c2a authority (Remove-OneVideoScoutMediaArtifact + Get-VideoScoutMediaDeletionSafety in
  cleanup-video-scout-media.ps1), which enforces fixed-root containment, run-dir direct-child identity,
  exact-leaf / extension==kind / size, ordinary-file, reparse (fail-closed), TOCTOU re-validation, the
  atomic-manifest write, and the single literal-path file delete. This file contributes
  ONLY: candidate enumeration (bounded), the whole-run eligibility gate (two lanes + dual age gate), the
  authorization-reason selection, the single-process lock, and the caps. It performs no direct
  filesystem delete, no move, no media scan/glob.

  Invariant: a sweep may delete only media EXPLICITLY OWNED by a bounded, schema-valid V2 manifest.
  Directory membership, scanning, filenames, extensions, renderer input, terminal output, or historical
  inference never establish ownership. Manifests and reports are retained indefinitely; no directory is
  ever removed.

  TWO LANES (both require schemaVersion==2 + the dual age gate):
    * Completed-run reconciliation (reason 'completed-analysis'): outcome=='completed' with a non-null,
      valid, EXISTING report. Finishes stale 'present' (crash-missed before immediate cleanup) and stale
      'deleting' (crash-interrupted intent), and -- opt-in -- retries transient 'delete-failed'.
      Completed NoFeed (reportFile:null) and completed-missing-report are preserved.
    * Retention cleanup (reason 'retention-error'|'retention-refused'|'retention-abandoned'):
      outcome in {error, refused} or a stale null outcome (interrupted/abandoned).

  Manual only: dry-run by default (classifies, writes nothing); -Apply required to mutate. TOTAL: never
  throws; returns a bounded, path-free summary and surfaces bounded warnings.
#>

# The ONE shared deletion authority (which itself dot-sources the single schema/validator + writers).
. (Join-Path $PSScriptRoot 'cleanup-video-scout-media.ps1')

$script:VSRetentionMaxRunCandidates      = 5000   # bounded preflight cap (ruling C) — default for -MaxRunCandidates
$script:VSRetentionMaxMutatedPerRun      = 100    # per-invocation mutation cap under -Apply (ruling B) — default for -MaxMutatedRuns
$script:VSRetentionMinAgeFloorDays       = 1      # -MinimumAgeDays floor (ruling G)
# The 1-day floor MUST stay ABOVE the enforced maximum analysis duration so a stale null-outcome run
# past the cutoff cannot be an in-flight analysis. If the duration guard's ceiling changes, re-review.
$script:VSRetentionMaxAnalysisDurationHours = 4

<#
.SYNOPSIS
  Parse a canonical UTC manifest timestamp (yyyy-MM-ddTHH:mm:ss.fffZ) to a UTC DateTime, or $null if it
  is missing / malformed. Fail-closed: the caller treats $null as "not past the cutoff".
#>
function ConvertTo-VSRetentionUtc {
    param([string]$Stamp)
    if ([string]::IsNullOrWhiteSpace($Stamp)) { return $null }
    if ($Stamp -notmatch $script:VideoScoutTimestampRe) { return $null }
    try {
        return [DateTime]::ParseExact(
            $Stamp, 'yyyy-MM-ddTHH:mm:ss.fffZ',
            [System.Globalization.CultureInfo]::InvariantCulture,
            [System.Globalization.DateTimeStyles]::AssumeUniversal -bor [System.Globalization.DateTimeStyles]::AdjustToUniversal)
    }
    catch { return $null }
}

<#
.SYNOPSIS
  Bounded mutex suffix: lowercase-normalized SHA-256 of the canonical downloads root, first 32 hex
  chars. Distinct fixture roots never collide; the path is never exposed in the mutex name.
#>
function Get-VSRetentionRootHash {
    param([Parameter(Mandatory)][string]$Root)
    $sha = [System.Security.Cryptography.SHA256]::Create()
    try {
        $bytes = [System.Text.Encoding]::UTF8.GetBytes($Root.ToLowerInvariant())
        $hash = $sha.ComputeHash($bytes)
        return (([System.BitConverter]::ToString($hash)) -replace '-', '').Substring(0, 32).ToLowerInvariant()
    }
    finally { $sha.Dispose() }
}

<#
.SYNOPSIS
  Dual age gate (both sources must exceed the cutoff). Validated-manifest timestamp:
  completed/error/refused -> finishedAt ?? startedAt; null -> startedAt. Second source: manifest.json
  LastWriteTimeUtc. Missing / unparseable / FUTURE timestamps fail closed (return $false).
#>
function Test-VSRetentionAgeGate {
    param(
        [Parameter(Mandatory)]$Manifest,
        [Parameter(Mandatory)][string]$ManifestPath,
        [Parameter(Mandatory)][int]$MinAgeDays,
        [Parameter(Mandatory)][DateTime]$NowUtc
    )
    $cutoff = [TimeSpan]::FromDays($MinAgeDays)

    $outcome    = Get-ManifestValue -M $Manifest -Key 'outcome'
    $finishedAt = [string](Get-ManifestValue -M $Manifest -Key 'finishedAt')
    $startedAt  = [string](Get-ManifestValue -M $Manifest -Key 'startedAt')
    $validatedStamp = if ($null -ne $outcome -and -not [string]::IsNullOrWhiteSpace($finishedAt)) { $finishedAt } else { $startedAt }

    $tValidated = ConvertTo-VSRetentionUtc -Stamp $validatedStamp
    if ($null -eq $tValidated) { return $false }
    if ($tValidated -gt $NowUtc) { return $false }                 # future -> fail closed
    if (($NowUtc - $tValidated) -lt $cutoff) { return $false }

    $fsTime = $null
    try { $fsTime = ([System.IO.FileInfo]$ManifestPath).LastWriteTimeUtc } catch { return $false }
    if ($null -eq $fsTime) { return $false }
    if ($fsTime -gt $NowUtc) { return $false }                     # future -> fail closed
    if (($NowUtc - $fsTime) -lt $cutoff) { return $false }

    return $true
}

<#
.SYNOPSIS
  $true iff the run's non-null reportFile exists as a direct-child ordinary, non-reparse file. The
  schema already guarantees reportFile is a bounded .txt leaf permitted only on a completed run; this
  is the same durable-report existence check V5c2a's eligibility gate applies.
#>
function Test-VSRetentionReportDurable {
    param([Parameter(Mandatory)][string]$FullRunDir, [Parameter(Mandatory)]$Manifest)
    $reportFile = [string](Get-ManifestValue -M $Manifest -Key 'reportFile')
    if ([string]::IsNullOrWhiteSpace($reportFile)) { return $false }
    $reportPath = [System.IO.Path]::GetFullPath((Join-Path $FullRunDir $reportFile))
    $reportParent = ([System.IO.Path]::GetDirectoryName($reportPath)).TrimEnd('\', '/')
    if ($reportParent -ne $FullRunDir) { return $false }
    if (-not [System.IO.File]::Exists($reportPath)) { return $false }
    if (Test-VideoScoutCleanupReparse -Path $reportPath) { return $false }
    return $true
}

<#
.SYNOPSIS
  Whole-run lane decision on an already-validated schema-v2 manifest. Returns
  @{ lane='completed'|'retention'|'none'; reason=<authorization reason|null> }. The age gate is applied
  by the caller (both lanes require it); null-outcome staleness is enforced there.
#>
function Get-VSRetentionLane {
    param([Parameter(Mandatory)]$Manifest, [Parameter(Mandatory)][string]$FullRunDir)
    $outcome = Get-ManifestValue -M $Manifest -Key 'outcome'
    if ($outcome -eq 'completed') {
        if (Test-VSRetentionReportDurable -FullRunDir $FullRunDir -Manifest $Manifest) {
            return @{ lane = 'completed'; reason = 'completed-analysis' }
        }
        return @{ lane = 'none'; reason = $null }   # NoFeed (null report) or missing/invalid report -> preserve
    }
    if ($outcome -eq 'error')   { return @{ lane = 'retention'; reason = 'retention-error' } }
    if ($outcome -eq 'refused') { return @{ lane = 'retention'; reason = 'retention-refused' } }
    if ($null -eq $outcome)     { return @{ lane = 'retention'; reason = 'retention-abandoned' } }
    return @{ lane = 'none'; reason = $null }
}

<#
.SYNOPSIS
  Process ONE candidate run directory. Loads + validates the durable manifest (the SOLE authority),
  applies the schema-v2 + dual age gate + lane gate, then per artifact either classifies (dry-run) or
  drives the shared V5c2a deletion authority (-Apply). Never throws. Returns a per-run tally
  @{ lane; mutated; deleted; missing; reconciled; retried; failed; skipped; reasons; warning }.
  Under dry-run, the deleted/missing/reconciled/retried counts mean "would ...".
#>
function Invoke-VSRetentionPerRun {
    param(
        [Parameter(Mandatory)][string]$RunDir,
        [Parameter(Mandatory)][string]$FullDownloadsRoot,
        [Parameter(Mandatory)][int]$MinimumAgeDays,
        [switch]$Apply,
        [switch]$RetryDeleteFailed,
        [Parameter(Mandatory)][DateTime]$NowUtc
    )
    $r = @{ lane = 'none'; mutated = $false; deleted = 0; missing = 0; reconciled = 0; retried = 0; failed = 0; skipped = 0; reasons = @(); warning = $null }

    $fullRunDir = [System.IO.Path]::GetFullPath($RunDir).TrimEnd('\', '/')
    # Never act through a redirected run directory (and never descend it -- we don't recurse anyway).
    if (Test-VideoScoutCleanupReparse -Path $fullRunDir) { return $r }

    # Deletion authority = the on-disk validated manifest, reloaded here (never a scan, never a passed obj).
    $load = Read-VideoScoutManifestForCleanup -RunDir $fullRunDir
    if (-not $load.ok) { return $r }                                         # unusable manifest -> retain, no-op
    $manifest = $load.manifest
    if ((Get-ManifestValue -M $manifest -Key 'schemaVersion') -ne 2) { return $r }   # v1 / backfill: untouchable

    $manifestPath = Join-Path $fullRunDir 'manifest.json'
    if (-not (Test-VSRetentionAgeGate -Manifest $manifest -ManifestPath $manifestPath -MinAgeDays $MinimumAgeDays -NowUtc $NowUtc)) { return $r }

    $lane = Get-VSRetentionLane -Manifest $manifest -FullRunDir $fullRunDir
    if ($lane.lane -eq 'none') { return $r }
    $r.lane = $lane.lane
    $authReason = [string]$lane.reason

    $count = @($manifest.mediaArtifacts).Count
    for ($i = 0; $i -lt $count; $i++) {
        $a = $manifest.mediaArtifacts[$i]
        $state = [string]$a.state

        if ($state -eq 'deleted' -or $state -eq 'missing') { $r.skipped++; continue }   # terminal

        if ($state -eq 'delete-failed') {
            # Only a TRANSIENT filesystem failure is retryable, and only opt-in. Identity / unsafe /
            # reparse refusals are terminal safety decisions and are never retried.
            if (-not $RetryDeleteFailed -or ([string]$a.deletionReason -ne 'filesystem-delete-failed')) { $r.skipped++; continue }
            if ($Apply) {
                # Establish a FRESH intent reason from the current lane before transitioning back to
                # 'deleting': reset to 'present' IN MEMORY (the file is still on disk -- that is what
                # 'filesystem-delete-failed' means) and drive it through the normal present path. Durable
                # state stays 'delete-failed' until the fresh 'deleting' intent persists.
                $a.state = 'present'; $a.deletedAt = $null; $a.deletionReason = $null
                $res = Remove-OneVideoScoutMediaArtifact -FullRunDir $fullRunDir -FullDownloadsRoot $FullDownloadsRoot -Manifest $manifest -Index $i -DeletionReason $authReason
                $r.retried++
                switch ($res.outcome) {
                    'deleted' { $r.deleted++; $r.mutated = $true }
                    'missing' { $r.missing++; $r.mutated = $true }
                    default   { $r.failed++ }
                }
                if ($res.reason)  { $r.reasons += $res.reason }
                if ($res.warning) { $r.warning = $res.warning }
            }
            else { $r.retried++ }   # dry-run: would retry
            continue
        }

        # 'present' or 'deleting' -> actionable in either lane.
        if ($Apply) {
            $res = Remove-OneVideoScoutMediaArtifact -FullRunDir $fullRunDir -FullDownloadsRoot $FullDownloadsRoot -Manifest $manifest -Index $i -DeletionReason $authReason
            switch ($res.outcome) {
                'deleted' { if ($state -eq 'deleting') { $r.reconciled++ } else { $r.deleted++ }; $r.mutated = $true }
                'missing' { $r.missing++; $r.mutated = $true }
                default   { $r.failed++ }
            }
            if ($res.reason)  { $r.reasons += $res.reason }
            if ($res.warning) { $r.warning = $res.warning }
        }
        else {
            # Dry-run: SAME classifier the authority uses, but no write / delete / reconcile.
            $safety = Get-VideoScoutMediaDeletionSafety -FullRunDir $fullRunDir -FullDownloadsRoot $FullDownloadsRoot -Artifact $a
            switch ($safety.decision) {
                'safe'   { if ($state -eq 'deleting') { $r.reconciled++ } else { $r.deleted++ } }
                'absent' { if ($state -eq 'deleting') { $r.reconciled++ } else { $r.missing++ } }
                'refuse' { $r.failed++; if ($safety.reason) { $r.reasons += $safety.reason } }
            }
        }
    }
    return $r
}

<#
.SYNOPSIS
  The manual cross-run retention / reconciliation sweep. Dry-run by default; -Apply required to mutate.
  TOTAL: never throws. Returns a bounded, path-free summary object.
.PARAMETER DownloadsRoot
  The fixed, main-owned downloads root ($OutDir). NEVER a renderer-supplied value. Direct children are
  the run-directory candidates.
.PARAMETER MinimumAgeDays
  Dual-age cutoff in days (default 7). Floor of 1 enforced (must stay above the 4-hour max analysis
  duration so a stale null-outcome run cannot be in-flight).
.PARAMETER Apply
  Perform deletions/reconciliations. Without it, the sweep classifies and reports only.
.PARAMETER RetryDeleteFailed
  Opt-in: retry artifacts stuck in 'delete-failed' with the transient 'filesystem-delete-failed' reason.
.PARAMETER MaxRunCandidates
  Bounded preflight cap (default 5000). Parameterized ONLY so the >cap refusal path is testable without
  creating 5001 fixture directories; production always uses the default.
.PARAMETER MaxMutatedRuns
  Per-invocation mutation cap under -Apply (default 100). Parameterized ONLY so the cap-exhaustion path
  is testable without creating 101 mutating fixtures; production always uses the default.
#>
function Invoke-VideoScoutRetentionSweep {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][string]$DownloadsRoot,
        [ValidateRange(1, 3650)][int]$MinimumAgeDays = 7,
        [switch]$Apply,
        [switch]$RetryDeleteFailed,
        [ValidateRange(1, 2147483647)][int]$MaxRunCandidates = 5000,
        [ValidateRange(1, 2147483647)][int]$MaxMutatedRuns = 100
    )
    $summary = [ordered]@{
        applied           = [bool]$Apply
        dryRun            = -not [bool]$Apply
        scanned           = 0
        eligibleCompleted = 0
        eligibleRetention = 0
        runsMutated       = 0
        deleted           = 0
        missing           = 0
        reconciled        = 0
        retried           = 0
        failed            = 0
        skipped           = 0
        reasons           = @()
        capExceeded       = $false
        capExhausted      = $false
        concurrentRefused = $false
        refused           = $null
        warning           = $null
    }

    $mutex = $null
    $acquired = $false
    try {
        $fullRoot = [System.IO.Path]::GetFullPath($DownloadsRoot).TrimEnd('\', '/')
        if (-not [System.IO.Directory]::Exists($fullRoot)) {
            $summary.refused = 'downloads-root-missing'
            Write-Warning 'Video-scout retention sweep refused: the downloads root does not exist.'
            return [pscustomobject]$summary
        }
        if (Test-VideoScoutCleanupReparse -Path $fullRoot) {
            $summary.refused = 'downloads-root-reparse'
            Write-Warning 'Video-scout retention sweep refused: the downloads root is a reparse point.'
            return [pscustomobject]$summary
        }

        # --- single-process lock (Local\ named mutex; suffix = SHA-256(root)) ---
        $mutexName = 'Local\vsc2b-retention-' + (Get-VSRetentionRootHash -Root $fullRoot)
        $mutex = New-Object System.Threading.Mutex($false, $mutexName)
        try { $acquired = $mutex.WaitOne(0) }
        catch [System.Threading.AbandonedMutexException] { $acquired = $true }   # prior holder crashed -> we own it
        if (-not $acquired) {
            $summary.concurrentRefused = $true
            $summary.refused = 'concurrent-sweep'
            Write-Warning 'Video-scout retention sweep refused: another sweep is already running for this root.'
            return [pscustomobject]$summary
        }

        # --- bounded preflight enumeration (ruling C): inspect <=cap+1; refuse the WHOLE invocation if >cap ---
        $candidates = New-Object System.Collections.Generic.List[string]
        foreach ($d in [System.IO.Directory]::EnumerateDirectories($fullRoot)) {
            $candidates.Add($d)
            if ($candidates.Count -gt $MaxRunCandidates) { break }   # now holds cap+1 -> over the cap
        }
        if ($candidates.Count -gt $MaxRunCandidates) {
            $summary.capExceeded = $true
            $summary.refused = 'cap-exceeded'
            Write-Warning ("Video-scout retention sweep refused: more than $MaxRunCandidates run candidates " +
                'under the root. Refusing the entire invocation (no mutation).')
            return [pscustomobject]$summary
        }

        # Deterministic ordinal ordering within the accepted <=cap set.
        $ordered = $candidates.ToArray()
        [System.Array]::Sort($ordered, [System.StringComparer]::Ordinal)

        $now = [DateTime]::UtcNow
        foreach ($runDir in $ordered) {
            # -Apply mutation cap: stop scanning once the cap of mutated runs is reached this invocation.
            if ($Apply -and $summary.runsMutated -ge $MaxMutatedRuns) {
                $summary.capExhausted = $true
                break
            }
            $res = Invoke-VSRetentionPerRun -RunDir $runDir -FullDownloadsRoot $fullRoot `
                -MinimumAgeDays $MinimumAgeDays -Apply:$Apply -RetryDeleteFailed:$RetryDeleteFailed -NowUtc $now
            $summary.scanned++
            if ($res.lane -eq 'completed') { $summary.eligibleCompleted++ }
            elseif ($res.lane -eq 'retention') { $summary.eligibleRetention++ }
            $summary.deleted    += $res.deleted
            $summary.missing    += $res.missing
            $summary.reconciled += $res.reconciled
            $summary.retried    += $res.retried
            $summary.failed     += $res.failed
            $summary.skipped    += $res.skipped
            foreach ($rr in @($res.reasons)) { $summary.reasons += $rr }
            if ($res.mutated) { $summary.runsMutated++ }
            if ($res.warning) { $summary.warning = $res.warning }
        }

        $summary.reasons = @($summary.reasons | Select-Object -Unique)
        return [pscustomobject]$summary
    }
    catch {
        # TOTAL guarantee: a sweep must never throw. Surface a bounded warning + the partial summary.
        $summary.warning = 'sweep-internal-error'
        Write-Warning 'Video-scout retention sweep encountered an internal error; no further runs were processed.'
        return [pscustomobject]$summary
    }
    finally {
        if ($mutex) {
            if ($acquired) { try { [void]$mutex.ReleaseMutex() } catch {} }
            $mutex.Dispose()
        }
    }
}
