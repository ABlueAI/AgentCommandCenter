<#
.SYNOPSIS
  V5a one-shot legacy backfill: synthesize a BACKFILL-variant manifest.json for every pre-manifest
  run directory under the downloads root, recording only what the directory on disk can prove.
.DESCRIPTION
  Pre-V5a runs left `run-*` directories with no manifest -- unindexable by the future Analysis
  Library (V5b). This utility sweeps a base directory once and creates a manifest for each legacy
  run directory, building and validating EVERYTHING through the shared canonical schema module
  (lib/video-scout-manifest-schema.ps1) so the live and backfill paths cannot drift.

  What a directory proves (and nothing more):
    - runId               -- the directory name itself.
    - route = 'cli'       -- structural inference: only the CLI path ever created run directories
                             before V5a (code-control-flow basis recorded in backfill provenance).
    - appliedMode         -- extension classification (.srt/.mp3/.mp4) when the directory holds
                             exactly ONE known media type; null for zero or mixed types.
    - videoTitle          -- the base name of the single known media file (yt-dlp named it from the
                             video title under --restrict-filenames); null when zero or several.
    - run stamp           -- parsed from the directory name into backfill.startedAtFromDirNameLocal
                             (LOCAL time, explicitly approximate); canonical startedAt stays null.
  Media existence never implies analysis success: outcome/finishedAt/usage stay null. Everything
  the directory cannot prove is JSON null, never fabricated.

  Safety contract:
    - CREATE-ONLY: an existing manifest.json is NEVER touched or overwritten (live manifests are
      authoritative; rerunning the backfill is a no-op -- idempotent by construction).
    - Never deletes, moves, or modifies anything else. -DryRun reports without writing.
    - Atomic per manifest: temp file in the same run directory, then a rename-class Move that
      fails (rather than overwrites) if a manifest appeared in the meantime.
    - Per-directory failures are reported visibly and the sweep continues; the run then FAILS
      visibly at the end (non-zero via throw) so a partial backfill is never mistaken for a
      complete one.
#>

# Shared canonical schema (constructors + validator + sanitizer) arrives transitively, and the
# live writer supplies Get-VideoScoutManifestPath -- the ONE definition of the manifest filename.
# Persistence is NOT shared: the live writer is create-or-replace, this module is create-only.
. (Join-Path $PSScriptRoot 'write-video-scout-manifest.ps1')

# The classification map: the three yt-dlp output patterns feed-gemini.ps1 has ever produced.
# Anything else (.part leftovers, .webm intermediates, stray files) proves nothing and is ignored.
$script:VideoScoutBackfillMediaMap = @{ '.srt' = 'transcript'; '.mp3' = 'audio'; '.mp4' = 'video' }

<#
.SYNOPSIS
  Is this directory name a video-scout run directory? Pure. Matches both generations:
  run-<yyyyMMdd-HHmmss-fff>-<pid> (pre-P10) and run-...-<pid>-<8 lowercase hex> (post-P10 GUID fix).
#>
function Test-VideoScoutRunDirName {
    param([Parameter(Mandatory)][string]$Name)
    # -cmatch (case-sensitive): the GUID suffix is lowercase by construction (Guid ToString('N'));
    # PS 5.1's -match is case-insensitive and would accept names New-VideoScoutRunDir never made.
    return $Name -cmatch '^run-\d{8}-\d{6}-\d{3}-\d+(-[0-9a-f]{8})?$'
}

<#
.SYNOPSIS
  Parse the LOCAL run stamp out of a run-directory name for backfill provenance. Pure. Returns
  'yyyy-MM-ddTHH:mm:ss.fff' (no zone suffix -- New-VideoScoutRunDir stamped LOCAL time, and
  converting a historical local stamp to UTC would fabricate precision across DST) or $null when
  the name does not parse to a real date/time.
#>
function Get-BackfillRunStampLocal {
    param([Parameter(Mandatory)][string]$Name)
    if ($Name -notmatch '^run-(\d{8}-\d{6}-\d{3})-') { return $null }
    try {
        $dt = [datetime]::ParseExact($Matches[1], 'yyyyMMdd-HHmmss-fff', [System.Globalization.CultureInfo]::InvariantCulture)
        return $dt.ToString('yyyy-MM-ddTHH:mm:ss.fff', [System.Globalization.CultureInfo]::InvariantCulture)
    }
    catch { return $null }
}

<#
.SYNOPSIS
  Classify a run directory's files into an inferred appliedMode + videoTitle. Pure.
  Mode: exactly ONE known media type present (any file count) -> that type's mode; zero or mixed
  types -> null. Title: exactly ONE known media file -> its base name; otherwise null (ambiguous).
#>
function Resolve-BackfillMediaClassification {
    param([string[]]$FileNames = @())
    $known = @()
    foreach ($f in @($FileNames)) {
        if ([string]::IsNullOrWhiteSpace($f)) { continue }
        $ext = [System.IO.Path]::GetExtension($f).ToLowerInvariant()
        if ($script:VideoScoutBackfillMediaMap.ContainsKey($ext)) {
            $known += [PSCustomObject]@{ Name = $f; Mode = $script:VideoScoutBackfillMediaMap[$ext] }
        }
    }
    $modes = @($known | Select-Object -ExpandProperty Mode -Unique)
    return [PSCustomObject]@{
        AppliedMode = $(if ($modes.Count -eq 1) { $modes[0] } else { $null })
        VideoTitle  = $(if (@($known).Count -eq 1) { [System.IO.Path]::GetFileNameWithoutExtension($known[0].Name) } else { $null })
    }
}

<#
.SYNOPSIS
  CREATE-ONLY atomic persistence for a backfilled manifest: validate through the shared schema
  gate, write a temp file in the run directory, rename into place. Refuses visibly if a manifest
  already exists (before AND during the write -- File.Move never overwrites), cleans its temp file
  on any failure, and never falls back to a non-atomic write.
#>
function Write-VideoScoutBackfillManifestFile {
    param(
        [Parameter(Mandatory)][string]$RunDir,
        [Parameter(Mandatory)]$Manifest
    )
    Assert-VideoScoutManifestValid -Manifest $Manifest
    $target = Get-VideoScoutManifestPath -RunDir $RunDir
    if (Test-Path -LiteralPath $target) {
        throw "Backfill refused for '$RunDir': manifest.json already exists (backfill is create-only and never overwrites a manifest)."
    }
    $tmp = Join-Path $RunDir ('manifest.json.tmp-' + [Guid]::NewGuid().ToString('N'))
    try {
        $json = ConvertTo-Json -InputObject $Manifest -Depth 8
        $enc = New-Object System.Text.UTF8Encoding($false)   # UTF-8, no BOM
        [System.IO.File]::WriteAllText($tmp, $json, $enc)
        # Atomic create (rename-class, same volume): throws instead of overwriting if a manifest
        # appeared between the check above and now -- create-only holds even under a race.
        [System.IO.File]::Move($tmp, $target)
    }
    catch {
        if (Test-Path -LiteralPath $tmp) { Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue }
        throw ("Backfill manifest write FAILED for '$target': $($_.Exception.Message) -- " +
            'this run directory remains unindexed; nothing was overwritten.')
    }
    return $target
}

<#
.SYNOPSIS
  The one-shot sweep: backfill every legacy run directory directly under $BaseDir. Returns a
  summary object on success; throws visibly at the end if any directory failed (the sweep itself
  continues past per-directory failures so one bad directory cannot hide the rest).
#>
function Invoke-VideoScoutBackfill {
    param(
        [Parameter(Mandatory)][string]$BaseDir,
        [switch]$DryRun
    )
    if (-not (Test-Path -LiteralPath $BaseDir -PathType Container)) {
        throw "Backfill refused: base directory '$BaseDir' does not exist. Pass the downloads root that holds the run-* directories."
    }
    $dirs = @(Get-ChildItem -LiteralPath $BaseDir -Directory | Sort-Object Name)
    Write-Host "Video-scout backfill: scanning $($dirs.Count) director$(if ($dirs.Count -eq 1) { 'y' } else { 'ies' }) under $BaseDir$(if ($DryRun) { ' (DRY RUN -- nothing will be written)' })" -ForegroundColor Cyan

    $backfilled      = New-Object System.Collections.Generic.List[string]
    $skippedExisting = New-Object System.Collections.Generic.List[string]
    $skippedForeign  = New-Object System.Collections.Generic.List[string]
    $failed          = New-Object System.Collections.Generic.List[string]

    foreach ($d in $dirs) {
        # Foreign names are untrusted display data -- sanitize before echoing (run-dir names that
        # pass the gate below are charset-safe by construction).
        if (-not (Test-VideoScoutRunDirName -Name $d.Name)) {
            $skippedForeign.Add($d.Name)
            Write-Host "  skip (not a run directory): $(Get-SanitizedManifestText -Text $d.Name -MaxLength 120)" -ForegroundColor DarkGray
            continue
        }
        if (Test-Path -LiteralPath (Get-VideoScoutManifestPath -RunDir $d.FullName) -PathType Leaf) {
            $skippedExisting.Add($d.Name)
            Write-Host "  skip (manifest already exists): $($d.Name)" -ForegroundColor DarkGray
            continue
        }
        try {
            $files = @(Get-ChildItem -LiteralPath $d.FullName -File | Select-Object -ExpandProperty Name)
            $cls = Resolve-BackfillMediaClassification -FileNames $files
            $manifest = New-VideoScoutBackfillManifest -RunId $d.Name `
                -AppliedMode $cls.AppliedMode -VideoTitle $cls.VideoTitle `
                -StartedAtFromDirNameLocal (Get-BackfillRunStampLocal -Name $d.Name)
            if ($DryRun) {
                Write-Host "  would backfill: $($d.Name) (mode=$(if ($cls.AppliedMode) { $cls.AppliedMode } else { 'unknown' }))" -ForegroundColor Yellow
            }
            else {
                [void](Write-VideoScoutBackfillManifestFile -RunDir $d.FullName -Manifest $manifest)
                Write-Host "  backfilled: $($d.Name) (mode=$(if ($cls.AppliedMode) { $cls.AppliedMode } else { 'unknown' }))" -ForegroundColor Green
            }
            $backfilled.Add($d.Name)
        }
        catch {
            # Report and continue: one unreadable/blocked directory must not hide the rest of the
            # sweep -- but the run as a whole still fails visibly below.
            $failed.Add("$($d.Name): $($_.Exception.Message)")
            Write-Host "  FAILED: $($d.Name) -- $(Get-SanitizedManifestText -Text $_.Exception.Message -MaxLength 300)" -ForegroundColor Red
        }
    }

    $verb = if ($DryRun) { 'would backfill' } else { 'backfilled' }
    Write-Host ("Video-scout backfill summary: {0} {1}, {2} already indexed, {3} not run dirs, {4} FAILED (of {5} scanned)." -f `
        $verb, $backfilled.Count, $skippedExisting.Count, $skippedForeign.Count, $failed.Count, $dirs.Count) `
        -ForegroundColor $(if ($failed.Count -gt 0) { 'Red' } else { 'Green' })

    if ($failed.Count -gt 0) {
        throw "Video-scout backfill finished with $($failed.Count) failure(s) -- the listed run directories remain unindexed (see the FAILED lines above). Re-run after fixing; already-backfilled directories are skipped automatically."
    }

    return [PSCustomObject]@{
        BaseDir         = $BaseDir
        DryRun          = [bool]$DryRun
        Scanned         = $dirs.Count
        Backfilled      = @($backfilled)
        SkippedExisting = @($skippedExisting)
        SkippedForeign  = @($skippedForeign)
    }
}
