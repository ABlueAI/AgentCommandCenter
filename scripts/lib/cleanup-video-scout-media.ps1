<#
.SYNOPSIS
  V5c2a: the ONE shared production function for automatically deleting a SUCCESSFUL Video Scout run's
  OWN media, and only its own media, after its analysis is durably complete. This is the only code in
  the app that deletes a media file. It is IRREVERSIBLE, so it is deliberately narrow.
.DESCRIPTION
  Invariant: after a Video Scout analysis completes successfully and its report and completed manifest
  are durable, the app may delete only media files EXPLICITLY OWNED by that same validated manifest.
  No scan, filename guess, extension glob, terminal-output parser, renderer-provided path, or inferred
  ownership may authorize deletion. The deletion candidate list comes EXCLUSIVELY from the validated
  manifest's mediaArtifacts array (never a directory scan / wildcard enumeration of the run directory).

  A filesystem delete and a manifest write are NOT one atomic transaction, so this models that truth
  with the crash-honest artifact-state lifecycle defined in the shared schema
  (present -> deleting -> deleted, with delete-failed / missing branches). Per artifact, one at a time:

    1. Pre-authorize: classify the exact on-disk target (fixed-root containment, run-dir direct-child
       identity, exact leaf, extension==kind, not the manifest/report/temp, ordinary file, no reparse
       point, size==sizeBytes). A file already absent -> 'missing' (we never claim we deleted it); a
       failed safety/identity check -> 'delete-failed' with a bounded reason; the file is left intact.
    2. Commit deletion INTENT to the manifest atomically (present -> deleting) BEFORE any FS delete.
    3. Re-validate the exact target immediately before deletion (TOCTOU).
    4. Delete the EXACT literal path ([IO.File]::Delete -- no wildcard, no recursion, no shell).
    5. Atomically transition deleting -> deleted with a UTC deletedAt.

  Crash truth: intent is durable before the delete, so a crash after the delete but before step 5
  leaves the durable state 'deleting' (honest, reconcilable by the future V5c2b sweep), never a false
  'deleted'. If a file is missing while its durable state is already 'deleting', deletion intent
  already exists, so this finalizes 'deleting' -> 'deleted'.

  This function is TOTAL: it never throws. Cleanup failure is surfaced as a BOUNDED warning (run ID,
  artifact kind, counts, allowlisted reason constants -- never report/media/transcript content, raw
  exception text, or absolute paths) and returns a summary object. It never rewrites a successfully
  completed analysis into an analysis failure: the durable report and outcome='completed' remain
  truthful even when cleanup fails afterward. It deletes ONLY media leaves -- never the manifest, the
  report, a temp file, or any directory -- and never moves, quarantines, or recurses.
#>

# The atomic writer (Write-VideoScoutManifestFile -- validates the WHOLE manifest through the single
# canonical schema before the atomic swap) + the shared schema (Assert-VideoScoutManifestValid, the
# media constants, Get-ManifestValue). The report writer supplies the ONE report filename constant so
# cleanup can positively exclude the report (and its temp form) from deletion.
. (Join-Path $PSScriptRoot 'write-video-scout-manifest.ps1')
. (Join-Path $PSScriptRoot 'write-video-scout-report.ps1')

# Same manifest-size envelope the V5b2 library reader uses.
$script:VSCleanupMaxManifestBytes = 262144   # 256 KiB

<#
.SYNOPSIS
  $true iff $Path is a reparse point (symlink/junction/mount). Fails CLOSED: if the attributes can't
  be read, it returns $true so the caller refuses rather than deleting through an unreadable target.
#>
function Test-VideoScoutCleanupReparse {
    param([string]$Path)
    try {
        $attr = [System.IO.File]::GetAttributes($Path)
        return [bool]($attr -band [System.IO.FileAttributes]::ReparsePoint)
    }
    catch {
        return $true
    }
}

<#
.SYNOPSIS
  Reload + validate the durable manifest for cleanup. Deletion authority comes ONLY from this
  validated on-disk manifest. Returns @{ ok=$true; manifest=<obj> } or @{ ok=$false; reason=<const> }
  with a bounded reason constant (never raw schema/JSON error text, which can echo hostile content).
#>
function Read-VideoScoutManifestForCleanup {
    param([Parameter(Mandatory)][string]$RunDir)
    $path = Join-Path $RunDir 'manifest.json'
    if (-not [System.IO.File]::Exists($path)) { return @{ ok = $false; reason = 'manifest-missing' } }
    if (Test-VideoScoutCleanupReparse -Path $path) { return @{ ok = $false; reason = 'manifest-reparse' } }
    $len = -1
    try { $len = ([System.IO.FileInfo]$path).Length } catch { return @{ ok = $false; reason = 'manifest-unreadable' } }
    if ($len -lt 0 -or $len -gt $script:VSCleanupMaxManifestBytes) { return @{ ok = $false; reason = 'manifest-too-large' } }
    $raw = $null
    try { $raw = [System.IO.File]::ReadAllText($path, [System.Text.Encoding]::UTF8) } catch { return @{ ok = $false; reason = 'manifest-unreadable' } }
    $obj = $null
    try { $obj = $raw | ConvertFrom-Json } catch { return @{ ok = $false; reason = 'manifest-json-invalid' } }
    if ($null -eq $obj) { return @{ ok = $false; reason = 'manifest-json-invalid' } }
    try { Assert-VideoScoutManifestValid -Manifest $obj } catch { return @{ ok = $false; reason = 'manifest-schema-invalid' } }
    return @{ ok = $true; manifest = $obj }
}

<#
.SYNOPSIS
  Classify a single manifest artifact's exact on-disk target WITHOUT deleting or writing anything.
  $FullRunDir and $FullDownloadsRoot are already-resolved, trimmed full paths. Returns:
    @{ decision='safe';   fullTarget=<path> } -- the exact owned file exists, identity+size match.
    @{ decision='absent' }                    -- the file does not exist (caller maps the state).
    @{ decision='refuse'; reason=<allowlist> }-- a safety/identity check failed; leave the file.
  Every 'refuse' reason is a bounded allowlist constant; no raw text, no path.
#>
function Get-VideoScoutMediaDeletionSafety {
    param(
        [Parameter(Mandatory)][string]$FullRunDir,
        [Parameter(Mandatory)][string]$FullDownloadsRoot,
        [Parameter(Mandatory)]$Artifact
    )
    $leaf = [string]$Artifact.fileName
    $kind = [string]$Artifact.kind
    $reportName = Get-VideoScoutReportFileName

    # (1) Re-assert the leaf is a safe leaf at the deletion boundary (schema already did, but deletion
    # is irreversible -- never trust a single upstream check for a destructive op).
    try {
        Assert-VideoScoutSafeLeafName -Name $leaf -Label 'media artifact fileName' -MaxLength $script:VideoScoutMediaFileNameMaxLength
    }
    catch { return @{ decision = 'refuse'; reason = 'identity-mismatch' } }

    # (2) Positively refuse the manifest and the report (and their temp forms). Defense in depth: the
    # schema's extension==kind rule already makes these leaves impossible in mediaArtifacts, but the
    # deletion target must never be the manifest or the report even if that ever changes.
    $lowerLeaf = $leaf.ToLowerInvariant()
    $lowerReport = $reportName.ToLowerInvariant()
    if ($lowerLeaf -eq 'manifest.json' -or $lowerLeaf -like 'manifest.json.tmp-*') { return @{ decision = 'refuse'; reason = 'unsafe-file-type' } }
    if ($lowerLeaf -eq $lowerReport -or $lowerLeaf -like ($lowerReport + '.tmp-*')) { return @{ decision = 'refuse'; reason = 'unsafe-file-type' } }

    # (3) Extension must match kind.
    $expectedExt = $script:VideoScoutMediaKindExtension[$kind]
    if (-not $expectedExt) { return @{ decision = 'refuse'; reason = 'identity-mismatch' } }
    $ext = ([System.IO.Path]::GetExtension($leaf)).ToLowerInvariant()
    if ($ext -ne $expectedExt) { return @{ decision = 'refuse'; reason = 'unsafe-file-type' } }

    # (4) Resolve the literal target and re-check the full containment chain: fixed root -> run dir
    # (direct child) -> target (direct child). Path comparisons use PowerShell -ne, which is
    # case-insensitive by default (correct for Windows paths).
    $fullTarget = [System.IO.Path]::GetFullPath((Join-Path $FullRunDir $leaf))
    $runParent = ([System.IO.Path]::GetDirectoryName($FullRunDir)).TrimEnd('\', '/')
    if ($runParent -ne $FullDownloadsRoot) { return @{ decision = 'refuse'; reason = 'identity-mismatch' } }
    $targetParent = ([System.IO.Path]::GetDirectoryName($fullTarget)).TrimEnd('\', '/')
    if ($targetParent -ne $FullRunDir) { return @{ decision = 'refuse'; reason = 'identity-mismatch' } }
    if (([System.IO.Path]::GetFileName($fullTarget)) -ne $leaf) { return @{ decision = 'refuse'; reason = 'identity-mismatch' } }
    if (-not $fullTarget.StartsWith($FullDownloadsRoot + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)) {
        return @{ decision = 'refuse'; reason = 'identity-mismatch' }
    }

    # (5) The run directory itself must not be a reparse point (no deleting through a redirected dir).
    if (Test-VideoScoutCleanupReparse -Path $FullRunDir) { return @{ decision = 'refuse'; reason = 'reparse-point-refused' } }

    # (6) Existence + ordinary-file check. A directory where a file is expected is refused; a truly
    # absent file is reported so the caller can map present->missing / deleting->deleted.
    if ([System.IO.Directory]::Exists($fullTarget)) { return @{ decision = 'refuse'; reason = 'unsafe-file-type' } }
    if (-not [System.IO.File]::Exists($fullTarget)) { return @{ decision = 'absent' } }

    # (7) The file itself must not be a reparse point.
    if (Test-VideoScoutCleanupReparse -Path $fullTarget) { return @{ decision = 'refuse'; reason = 'reparse-point-refused' } }

    # (8) Size must match the manifest record exactly (size is part of identity).
    $size = -1
    try { $size = [long]([System.IO.FileInfo]$fullTarget).Length } catch { return @{ decision = 'refuse'; reason = 'identity-mismatch' } }
    if ($size -ne [long]$Artifact.sizeBytes) { return @{ decision = 'refuse'; reason = 'identity-mismatch' } }

    return @{ decision = 'safe'; fullTarget = $fullTarget }
}

# Atomic manifest write wrapper. Returns $true on success, $false on failure. NEVER throws -- a
# manifest-write failure during cleanup is handled by the caller (leave the durable manifest in its
# last successfully written state; surface a runtime 'manifest-update-failed' warning).
function Save-VideoScoutCleanupManifest {
    param([Parameter(Mandatory)][string]$RunDir, [Parameter(Mandatory)]$Manifest)
    try { [void](Write-VideoScoutManifestFile -RunDir $RunDir -Manifest $Manifest); return $true }
    catch { return $false }
}

function Get-VideoScoutCleanupUtcNow { [DateTime]::UtcNow.ToString('yyyy-MM-ddTHH:mm:ss.fffZ') }

<#
.SYNOPSIS
  Process ONE manifest artifact (by index) through the crash-honest deletion lifecycle. Mutates the
  in-memory manifest object in place and persists each transition atomically. Returns
  @{ outcome='deleted'|'missing'|'failed'; reason=<allowlist|null>; warning=<'manifest-update-failed'|null> }.
  Never throws.
#>
function Remove-OneVideoScoutMediaArtifact {
    param(
        [Parameter(Mandatory)][string]$FullRunDir,
        [Parameter(Mandatory)][string]$FullDownloadsRoot,
        [Parameter(Mandatory)]$Manifest,
        [Parameter(Mandatory)][int]$Index
    )
    $a = $Manifest.mediaArtifacts[$Index]   # live reference: mutations persist into the manifest
    $state = [string]$a.state

    if ($state -eq 'present') {
        $safety = Get-VideoScoutMediaDeletionSafety -FullRunDir $FullRunDir -FullDownloadsRoot $FullDownloadsRoot -Artifact $a
        if ($safety.decision -eq 'absent') {
            # Absent before cleanup began -> honest 'missing'; the app never claims it deleted it.
            $a.state = 'missing'; $a.deletedAt = $null; $a.deletionReason = 'owned-file-missing'
            if (Save-VideoScoutCleanupManifest -RunDir $FullRunDir -Manifest $Manifest) { return @{ outcome = 'missing'; reason = 'owned-file-missing'; warning = $null } }
            $a.state = 'present'; $a.deletedAt = $null; $a.deletionReason = $null   # revert in-memory; durable stays 'present'
            return @{ outcome = 'failed'; reason = 'owned-file-missing'; warning = 'manifest-update-failed' }
        }
        if ($safety.decision -eq 'refuse') {
            # A safety/identity check refused; leave the file intact, record the bounded reason.
            $a.state = 'delete-failed'; $a.deletedAt = $null; $a.deletionReason = $safety.reason
            if (Save-VideoScoutCleanupManifest -RunDir $FullRunDir -Manifest $Manifest) { return @{ outcome = 'failed'; reason = $safety.reason; warning = $null } }
            $a.state = 'present'; $a.deletedAt = $null; $a.deletionReason = $null
            return @{ outcome = 'failed'; reason = $safety.reason; warning = 'manifest-update-failed' }
        }
        # safe -> commit deletion INTENT (present -> deleting) BEFORE touching the filesystem.
        $a.state = 'deleting'; $a.deletedAt = $null; $a.deletionReason = 'completed-analysis'
        if (-not (Save-VideoScoutCleanupManifest -RunDir $FullRunDir -Manifest $Manifest)) {
            # Manifest write failed BEFORE deletion -> the file was never touched; durable stays 'present'.
            $a.state = 'present'; $a.deletedAt = $null; $a.deletionReason = $null
            return @{ outcome = 'failed'; reason = $null; warning = 'manifest-update-failed' }
        }
        $state = 'deleting'
    }

    # --- state is 'deleting' here: intent is durable (just committed, or a prior crash left it). ---
    if ($state -ne 'deleting') { return @{ outcome = 'failed'; reason = $null; warning = $null } }  # defensive; unreachable

    # Immediate pre-delete re-validation (TOCTOU) on the exact target.
    $safety2 = Get-VideoScoutMediaDeletionSafety -FullRunDir $FullRunDir -FullDownloadsRoot $FullDownloadsRoot -Artifact $a
    if ($safety2.decision -eq 'absent') {
        # Durable deletion intent exists and the file is gone -> finalize deleting -> deleted.
        $a.state = 'deleted'; $a.deletedAt = (Get-VideoScoutCleanupUtcNow); $a.deletionReason = 'completed-analysis'
        if (Save-VideoScoutCleanupManifest -RunDir $FullRunDir -Manifest $Manifest) { return @{ outcome = 'deleted'; reason = 'completed-analysis'; warning = $null } }
        $a.state = 'deleting'; $a.deletedAt = $null; $a.deletionReason = 'completed-analysis'   # durable stays 'deleting'
        return @{ outcome = 'failed'; reason = 'completed-analysis'; warning = 'manifest-update-failed' }
    }
    if ($safety2.decision -eq 'refuse') {
        # Something changed under us between intent-commit and delete -> refuse; record delete-failed.
        $a.state = 'delete-failed'; $a.deletedAt = $null; $a.deletionReason = $safety2.reason
        if (Save-VideoScoutCleanupManifest -RunDir $FullRunDir -Manifest $Manifest) { return @{ outcome = 'failed'; reason = $safety2.reason; warning = $null } }
        $a.state = 'deleting'; $a.deletedAt = $null; $a.deletionReason = 'completed-analysis'
        return @{ outcome = 'failed'; reason = $safety2.reason; warning = 'manifest-update-failed' }
    }

    # safe -> delete the EXACT literal path. No wildcard, no recursion, no shell, no assembled string.
    try {
        [System.IO.File]::Delete($safety2.fullTarget)
    }
    catch {
        # The OS delete threw -> delete-failed with a BOUNDED constant (never the raw exception text).
        $a.state = 'delete-failed'; $a.deletedAt = $null; $a.deletionReason = 'filesystem-delete-failed'
        if (Save-VideoScoutCleanupManifest -RunDir $FullRunDir -Manifest $Manifest) { return @{ outcome = 'failed'; reason = 'filesystem-delete-failed'; warning = $null } }
        $a.state = 'deleting'; $a.deletedAt = $null; $a.deletionReason = 'completed-analysis'
        return @{ outcome = 'failed'; reason = 'filesystem-delete-failed'; warning = 'manifest-update-failed' }
    }

    # Deletion succeeded -> deleting -> deleted with a UTC deletedAt.
    $a.state = 'deleted'; $a.deletedAt = (Get-VideoScoutCleanupUtcNow); $a.deletionReason = 'completed-analysis'
    if (Save-VideoScoutCleanupManifest -RunDir $FullRunDir -Manifest $Manifest) { return @{ outcome = 'deleted'; reason = 'completed-analysis'; warning = $null } }
    # CRITICAL crash-truth: the file is ALREADY gone but the 'deleted' write failed -> the durable
    # state MUST remain 'deleting' (never a false 'deleted'). Revert in-memory to match disk; do not retry.
    $a.state = 'deleting'; $a.deletedAt = $null; $a.deletionReason = 'completed-analysis'
    return @{ outcome = 'failed'; reason = 'completed-analysis'; warning = 'manifest-update-failed' }
}

<#
.SYNOPSIS
  Automatic successful-run media cleanup. TOTAL (never throws). Deletes only this run's own,
  manifest-owned media after the run is durably completed with a persisted report. Returns a bounded
  summary object; surfaces a bounded warning on any failure. Non-eligible runs (NoFeed with a null
  reportFile, error/refused/incomplete outcomes, schema-v1 history, SDK runs with an empty inventory)
  safely no-op.
.PARAMETER RunDir
  The completed run directory (a direct child of the fixed downloads root).
.PARAMETER DownloadsRoot
  The fixed, main-owned downloads root ($OutDir). Used for the containment chain -- never a
  renderer-supplied value.
#>
function Invoke-VideoScoutSuccessMediaCleanup {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][string]$RunDir,
        [Parameter(Mandatory)][string]$DownloadsRoot
    )
    $summary = [ordered]@{
        runId = $null; eligible = $false; processed = 0
        deleted = 0; missing = 0; failed = 0; skipped = 0
        reasons = @(); warning = $null
    }
    try {
        $fullRunDir = [System.IO.Path]::GetFullPath($RunDir).TrimEnd('\', '/')
        $fullRoot   = [System.IO.Path]::GetFullPath($DownloadsRoot).TrimEnd('\', '/')

        # (E1) Reload + validate the durable manifest -- the SOLE deletion authority.
        $load = Read-VideoScoutManifestForCleanup -RunDir $fullRunDir
        if (-not $load.ok) {
            $summary.warning = $load.reason
            Write-Warning "Video-scout cleanup skipped: manifest not usable ($($load.reason))."
            return [pscustomobject]$summary
        }
        $manifest = $load.manifest
        $summary.runId = [string]$manifest.runId

        # (E2) Whole-run eligibility. Any miss -> safe no-op (retain all media).
        $schemaVersion = Get-ManifestValue -M $manifest -Key 'schemaVersion'
        $outcome       = Get-ManifestValue -M $manifest -Key 'outcome'
        $reportFile    = Get-ManifestValue -M $manifest -Key 'reportFile'
        if ($schemaVersion -ne 2) { return [pscustomobject]$summary }                         # v1 history
        if ($outcome -ne 'completed') { return [pscustomobject]$summary }                      # not a success
        if ([string]::IsNullOrWhiteSpace([string]$reportFile)) { return [pscustomobject]$summary }  # NoFeed etc.

        # (E3) The report must exist as the run's durable direct-child output; otherwise retain media.
        $reportPath = [System.IO.Path]::GetFullPath((Join-Path $fullRunDir ([string]$reportFile)))
        $reportParent = ([System.IO.Path]::GetDirectoryName($reportPath)).TrimEnd('\', '/')
        if (($reportParent -ne $fullRunDir) -or `
            (-not [System.IO.File]::Exists($reportPath)) -or `
            (Test-VideoScoutCleanupReparse -Path $reportPath)) {
            return [pscustomobject]$summary
        }

        $summary.eligible = $true

        # Process each owned artifact ONE AT A TIME, from the validated manifest only (no scan). Index
        # into the live manifest so each transition's mutation persists across the atomic writes.
        $count = @($manifest.mediaArtifacts).Count
        for ($i = 0; $i -lt $count; $i++) {
            $state = [string]$manifest.mediaArtifacts[$i].state
            if ($state -ne 'present' -and $state -ne 'deleting') { $summary.skipped++; continue }  # deleted/missing/delete-failed: terminal
            $summary.processed++
            $r = Remove-OneVideoScoutMediaArtifact -FullRunDir $fullRunDir -FullDownloadsRoot $fullRoot -Manifest $manifest -Index $i
            switch ($r.outcome) {
                'deleted' { $summary.deleted++ }
                'missing' { $summary.missing++ }
                default   { $summary.failed++ }
            }
            if ($r.reason) { $summary.reasons += $r.reason }
            if ($r.warning) { $summary.warning = $r.warning }
        }

        # Surface a bounded warning if anything did not cleanly delete. Metadata only: run ID, counts,
        # and allowlisted reason constants -- never a path, filename, or report/media content.
        if ($summary.failed -gt 0 -or $summary.warning) {
            $reasonList = (@($summary.reasons) | Select-Object -Unique) -join ','
            Write-Warning ("Video-scout media cleanup incomplete for run $($summary.runId): " +
                "deleted=$($summary.deleted) missing=$($summary.missing) failed=$($summary.failed)" +
                "$(if ($reasonList) { " reasons=$reasonList" } else { '' })" +
                "$(if ($summary.warning) { " warning=$($summary.warning)" } else { '' })" +
                ". The analysis itself completed successfully; only media cleanup was affected.")
        }
        $summary.reasons = @($summary.reasons | Select-Object -Unique)
        return [pscustomobject]$summary
    }
    catch {
        # TOTAL guarantee: never let cleanup turn a successful analysis into a failure. Any unexpected
        # error becomes a bounded warning + summary; the durable report/outcome are untouched here.
        $summary.warning = 'cleanup-internal-error'
        Write-Warning ("Video-scout media cleanup encountered an internal error for run " +
            "$($summary.runId): the analysis completed successfully; only media cleanup was affected.")
        return [pscustomobject]$summary
    }
}
