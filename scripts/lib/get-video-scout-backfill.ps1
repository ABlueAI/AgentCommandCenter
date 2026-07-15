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

  Safe by default -- DRY RUN unless the caller explicitly passes -Apply:
    - Without -Apply: reports what WOULD be backfilled; writes nothing anywhere, ever.
    - With -Apply: performs the create-only writes described below.
    A bare/no-flag invocation of the entry-point script is therefore always the dry run; only an
    explicit -Apply can write.

  Filesystem safety gates (every candidate is checked BEFORE its contents are touched):
    - REPARSE POINTS REFUSED: a candidate run directory whose Attributes include ReparsePoint
      (a junction or symlink) is never entered -- not listed, not classified, not written to. This
      is checked first, before any Test-Path/Get-ChildItem call that would otherwise traverse
      through it into whatever it points at.
    - DIRECT-CHILD CONTAINMENT: the candidate's resolved full path must have the resolved base
      directory as its EXACT parent. A candidate that resolves outside that containment is refused
      as unsafe, never entered.
    - ENTRY-COUNT CAP: a directory's direct file entries are counted (never recursed) and compared
      against $script:VideoScoutBackfillMaxFileEntries. Over the cap is refused as unsafe rather
      than enumerated further -- an unbounded/hostile directory cannot make this sweep read forever.
    Unsafe candidates are reported visibly and the sweep continues past them; safe candidates are
    still fully processed. The sweep as a whole ends non-zero (throws) if ANY directory was unsafe
    or failed, so a partial/unsafe run is never mistaken for a clean one.

  Safety contract (per safe, in-cap, non-reparse, contained candidate):
    - CREATE-ONLY: an existing manifest.json is NEVER touched or overwritten (live manifests are
      authoritative; rerunning the backfill is a no-op -- idempotent by construction).
    - Never deletes, moves, or modifies anything else.
    - Atomic per manifest: temp file in the same run directory, then a rename-class Move that
      fails (rather than overwrites) if a manifest exists or appears in the meantime.
    - TOCTOU: if a manifest.json appears for a candidate AFTER this sweep judged it eligible but
      BEFORE the atomic Move lands, that is a benign race, not a failure: the existing (other)
      manifest is left byte-for-byte untouched, this run's own temp file is cleaned up, and the
      directory is classified SKIP-RACED -- counted separately from FAILED and never causes a
      generic write-failure message. Any OTHER I/O error during the write (permissions, disk full,
      a directory in place of the expected file, etc.) remains a visible FAILED entry.
    - Per-directory failures are reported visibly and the sweep continues; the run then FAILS
      visibly at the end (non-zero via throw) if any directory was unsafe or failed, so a partial
      backfill is never mistaken for a complete one.
#>

# Shared canonical schema (constructors + validator + sanitizer) arrives transitively, and the
# live writer supplies Get-VideoScoutManifestPath -- the ONE definition of the manifest filename.
# Persistence is NOT shared: the live writer is create-or-replace, this module is create-only.
. (Join-Path $PSScriptRoot 'write-video-scout-manifest.ps1')

# The classification map: the three yt-dlp output patterns feed-gemini.ps1 has ever produced.
# Anything else (.part leftovers, .webm intermediates, stray files) proves nothing and is ignored.
$script:VideoScoutBackfillMediaMap = @{ '.srt' = 'transcript'; '.mp3' = 'audio'; '.mp4' = 'video' }

# Documented sane cap on direct file entries per candidate run directory. A real run produces at
# most a handful of files (media + captions + the odd .part/.info.json leftover); a directory with
# more than this is unsafe to enumerate further rather than something this sweep should try to
# process fully. (?) tune if a legitimate run pattern ever needs more.
$script:VideoScoutBackfillMaxFileEntries = 2000

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
  Reparse-point gate. Pure (reads only the already-fetched Attributes on $Item -- no extra IO, and
  critically NO traversal into whatever the reparse point targets). A junction or symlink run
  directory is refused here, before anything ever looks inside it.
#>
function Test-VideoScoutBackfillReparsePoint {
    param([Parameter(Mandatory)]$Item)
    [bool]($Item.Attributes -band [System.IO.FileAttributes]::ReparsePoint)
}

<#
.SYNOPSIS
  Direct-child containment gate. Pure. True only when $Item's resolved full path has
  $ResolvedBaseDir as its EXACT parent -- guards against a candidate that (by construction or by a
  future refactor of the caller) does not sit directly under the selected root. Comparison is
  ordinal case-insensitive (Windows/NTFS paths).
#>
function Test-VideoScoutBackfillDirectChild {
    param(
        [Parameter(Mandatory)]$Item,
        [Parameter(Mandatory)][string]$ResolvedBaseDir
    )
    $full = [System.IO.Path]::GetFullPath($Item.FullName)
    $parent = [System.IO.Path]::GetDirectoryName($full)
    if ([string]::IsNullOrEmpty($parent)) { return $false }
    $trim = { param($p) $p.TrimEnd([System.IO.Path]::DirectorySeparatorChar, [System.IO.Path]::AltDirectorySeparatorChar) }
    return [string]::Equals((& $trim $parent), (& $trim $ResolvedBaseDir), [System.StringComparison]::OrdinalIgnoreCase)
}

<#
.SYNOPSIS
  Enumerate a directory's direct file entries (never recursive), capped. Pure I/O wrapper: never
  throws for an over-cap directory -- returns OverCap=$true so the caller can refuse it as unsafe
  and keep sweeping the rest.
#>
function Get-VideoScoutBackfillFileEntries {
    param(
        [Parameter(Mandatory)][string]$DirPath,
        [Parameter(Mandatory)][int]$MaxFileEntries
    )
    $files = @(Get-ChildItem -LiteralPath $DirPath -File | Select-Object -ExpandProperty Name)
    return [PSCustomObject]@{
        Files   = $files
        Count   = $files.Count
        OverCap = ($files.Count -gt $MaxFileEntries)
    }
}

<#
.SYNOPSIS
  Classify a caught write exception as a benign TOCTOU race (SKIP-RACED) or a real failure. Pure.
.DESCRIPTION
  Anchored to message START (same convention as Resolve-ManifestFailureClass): only
  Write-VideoScoutBackfillManifestFile emits the 'Backfill race:' prefix, and only when it has
  itself confirmed (via Test-Path) that a manifest now exists where none did a moment ago. Every
  other failure (permissions, disk full, a directory in place of the expected file, schema
  validation) keeps its own message and is classified as a real failure.
#>
function Resolve-VideoScoutBackfillFailureClass {
    param([Parameter(Mandatory)][string]$Message)
    if ($Message -match '^Backfill race:') { return 'raced' }
    return 'failed'
}

<#
.SYNOPSIS
  CREATE-ONLY atomic persistence for a backfilled manifest: validate through the shared schema
  gate, write a temp file in the run directory, rename into place. Refuses visibly if a manifest
  already exists (before AND during the write -- File.Move never overwrites), cleans its temp file
  on any failure, and never falls back to a non-atomic write.
.DESCRIPTION
  Two distinct "manifest already there" moments are both treated as the SAME benign TOCTOU race
  (message prefixed 'Backfill race:', classified by Resolve-VideoScoutBackfillFailureClass, and
  the ORIGINAL manifest is never touched either way): (1) the pre-write existence check below finds
  a manifest that appeared after the sweep judged this directory eligible but before this function
  started writing; (2) the atomic Move itself fails because a manifest appeared between that
  pre-write check and the Move landing. Any other Move failure (permissions, disk full, a directory
  where the file should be) is a genuine failure and keeps its own message.
#>
function Write-VideoScoutBackfillManifestFile {
    param(
        [Parameter(Mandatory)][string]$RunDir,
        [Parameter(Mandatory)]$Manifest,
        # Test-only seam: invoked (if given) immediately after the validated temp file is written and
        # immediately before the atomic Move. Lets tests deterministically create manifest.json in
        # that exact window to prove the TOCTOU race path without relying on real concurrency or
        # file locks. Never set by production callers (the sweep below, or the entry-point script).
        [scriptblock]$TestOnlyPreMoveHook = $null
    )
    Assert-VideoScoutManifestValid -Manifest $Manifest
    $target = Get-VideoScoutManifestPath -RunDir $RunDir
    # -PathType Leaf (NOT plain Test-Path): a race winner is always a FILE. A directory sitting at
    # this path is a genuine obstruction (Move will fail against it below), not a race -- conflating
    # the two would misclassify a real failure as a benign SKIP-RACED.
    if (Test-Path -LiteralPath $target -PathType Leaf) {
        throw ("Backfill race: manifest.json for '$RunDir' already exists (created concurrently, e.g. " +
            'by a live run, after this sweep judged the directory eligible) -- the existing manifest ' +
            'is left untouched; this run directory is SKIP-RACED, not failed.')
    }
    $tmp = Join-Path $RunDir ('manifest.json.tmp-' + [Guid]::NewGuid().ToString('N'))
    try {
        $json = ConvertTo-Json -InputObject $Manifest -Depth 8
        $enc = New-Object System.Text.UTF8Encoding($false)   # UTF-8, no BOM
        [System.IO.File]::WriteAllText($tmp, $json, $enc)
        if ($TestOnlyPreMoveHook) { & $TestOnlyPreMoveHook }
        # Atomic create (rename-class, same volume): throws instead of overwriting if a manifest
        # appeared between the check above and now -- create-only holds even under a race.
        [System.IO.File]::Move($tmp, $target)
    }
    catch {
        if (Test-Path -LiteralPath $tmp) { Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue }
        if (Test-Path -LiteralPath $target -PathType Leaf) {
            # The Move failed because a manifest FILE now exists that did not exist at the pre-write
            # check above -- a race won by someone else between that check and this Move. Original
            # left untouched (we never opened $target for writing); temp already cleaned just above.
            throw ("Backfill race: manifest.json for '$RunDir' appeared concurrently between the " +
                'pre-write check and the atomic move -- the existing manifest is left untouched; ' +
                'this run directory is SKIP-RACED, not failed.')
        }
        throw ("Backfill manifest write FAILED for '$target': $($_.Exception.Message) -- " +
            'this run directory remains unindexed; nothing was overwritten.')
    }
    return $target
}

<#
.SYNOPSIS
  The one-shot sweep: backfill every legacy, safe run directory directly under $BaseDir. DRY RUN
  BY DEFAULT -- pass -Apply to actually write. Returns a summary object; throws visibly at the end
  if any directory was unsafe or failed (the sweep itself continues past both so no single bad
  directory can hide the rest of the run).
#>
function Invoke-VideoScoutBackfill {
    param(
        [Parameter(Mandatory)][string]$BaseDir,
        # Default is DRY RUN: no -Apply means nothing is ever written, no matter what. Only an
        # explicit -Apply performs the create-only writes.
        [switch]$Apply,
        # Test-only seam: when set, the sweep simulates a manifest.json appearing concurrently for
        # the directory of this exact name, in the window between the pre-write check and the
        # atomic move (see Write-VideoScoutBackfillManifestFile's TestOnlyPreMoveHook). Never set by
        # production callers.
        [string]$TestOnlySimulateRaceForDirName = $null
    )
    if (-not (Test-Path -LiteralPath $BaseDir -PathType Container)) {
        throw "Backfill refused: base directory '$BaseDir' does not exist. Pass the downloads root that holds the run-* directories."
    }
    $resolvedBaseDir = ([System.IO.Path]::GetFullPath($BaseDir)).TrimEnd(
        [System.IO.Path]::DirectorySeparatorChar, [System.IO.Path]::AltDirectorySeparatorChar)
    $dirs = @(Get-ChildItem -LiteralPath $BaseDir -Directory | Sort-Object Name)
    Write-Host "Video-scout backfill: scanning $($dirs.Count) director$(if ($dirs.Count -eq 1) { 'y' } else { 'ies' }) under $BaseDir$(if (-not $Apply) { ' (DRY RUN -- nothing will be written; pass -Apply to write)' })" -ForegroundColor Cyan

    $backfilled      = New-Object System.Collections.Generic.List[string]
    $skippedExisting = New-Object System.Collections.Generic.List[string]
    $skippedForeign  = New-Object System.Collections.Generic.List[string]
    $skippedRaced    = New-Object System.Collections.Generic.List[string]
    $unsafe          = New-Object System.Collections.Generic.List[string]
    $failed          = New-Object System.Collections.Generic.List[string]

    foreach ($d in $dirs) {
        # Foreign names are untrusted display data -- sanitize before echoing (run-dir names that
        # pass the gate below are charset-safe by construction).
        if (-not (Test-VideoScoutRunDirName -Name $d.Name)) {
            $skippedForeign.Add($d.Name)
            Write-Host "  skip (not a run directory): $(Get-SanitizedManifestText -Text $d.Name -MaxLength 120)" -ForegroundColor DarkGray
            continue
        }

        # --- filesystem safety gates: checked BEFORE anything looks inside this directory ---------
        if (Test-VideoScoutBackfillReparsePoint -Item $d) {
            $unsafe.Add("$($d.Name): reparse point (junction/symlink) -- refusing to traverse")
            Write-Host "  UNSAFE (reparse point -- refusing to traverse): $($d.Name)" -ForegroundColor Red
            continue
        }
        if (-not (Test-VideoScoutBackfillDirectChild -Item $d -ResolvedBaseDir $resolvedBaseDir)) {
            $unsafe.Add("$($d.Name): not a direct child of the resolved base directory")
            Write-Host "  UNSAFE (containment check failed): $($d.Name)" -ForegroundColor Red
            continue
        }
        if (Test-Path -LiteralPath (Get-VideoScoutManifestPath -RunDir $d.FullName) -PathType Leaf) {
            $skippedExisting.Add($d.Name)
            Write-Host "  skip (manifest already exists): $($d.Name)" -ForegroundColor DarkGray
            continue
        }
        $entries = Get-VideoScoutBackfillFileEntries -DirPath $d.FullName -MaxFileEntries $script:VideoScoutBackfillMaxFileEntries
        if ($entries.OverCap) {
            $unsafe.Add("$($d.Name): exceeds the max file-entry cap ($($script:VideoScoutBackfillMaxFileEntries) files) -- refusing to enumerate further")
            Write-Host "  UNSAFE (over file-entry cap): $($d.Name)" -ForegroundColor Red
            continue
        }

        try {
            $cls = Resolve-BackfillMediaClassification -FileNames $entries.Files
            $manifest = New-VideoScoutBackfillManifest -RunId $d.Name `
                -AppliedMode $cls.AppliedMode -VideoTitle $cls.VideoTitle `
                -StartedAtFromDirNameLocal (Get-BackfillRunStampLocal -Name $d.Name)
            if ($Apply) {
                $hook = $null
                if ($TestOnlySimulateRaceForDirName -and ($d.Name -eq $TestOnlySimulateRaceForDirName)) {
                    $targetForHook = $d.FullName
                    $hook = { Set-Content -LiteralPath (Get-VideoScoutManifestPath -RunDir $targetForHook) -Value '{"sentinel":"race-winner"}' -Encoding ASCII }
                }
                [void](Write-VideoScoutBackfillManifestFile -RunDir $d.FullName -Manifest $manifest -TestOnlyPreMoveHook $hook)
                Write-Host "  backfilled: $($d.Name) (mode=$(if ($cls.AppliedMode) { $cls.AppliedMode } else { 'unknown' }))" -ForegroundColor Green
            }
            else {
                Write-Host "  would backfill: $($d.Name) (mode=$(if ($cls.AppliedMode) { $cls.AppliedMode } else { 'unknown' }))" -ForegroundColor Yellow
            }
            $backfilled.Add($d.Name)
        }
        catch {
            if ((Resolve-VideoScoutBackfillFailureClass -Message $_.Exception.Message) -eq 'raced') {
                $skippedRaced.Add($d.Name)
                Write-Host "  SKIP-RACED: $($d.Name) -- $(Get-SanitizedManifestText -Text $_.Exception.Message -MaxLength 300)" -ForegroundColor DarkYellow
            }
            else {
                # Report and continue: one unreadable/blocked directory must not hide the rest of the
                # sweep -- but the run as a whole still fails visibly below.
                $failed.Add("$($d.Name): $($_.Exception.Message)")
                Write-Host "  FAILED: $($d.Name) -- $(Get-SanitizedManifestText -Text $_.Exception.Message -MaxLength 300)" -ForegroundColor Red
            }
        }
    }

    $verb = if ($Apply) { 'backfilled' } else { 'would backfill' }
    Write-Host ("Video-scout backfill summary: {0} {1}, {2} already indexed, {3} not run dirs, {4} SKIP-RACED, {5} UNSAFE, {6} FAILED (of {7} scanned)." -f `
        $verb, $backfilled.Count, $skippedExisting.Count, $skippedForeign.Count, $skippedRaced.Count, $unsafe.Count, $failed.Count, $dirs.Count) `
        -ForegroundColor $(if ($failed.Count -gt 0 -or $unsafe.Count -gt 0) { 'Red' } else { 'Green' })

    if ($failed.Count -gt 0 -or $unsafe.Count -gt 0) {
        throw ("Video-scout backfill finished with $($failed.Count) failure(s) and $($unsafe.Count) unsafe " +
            "director$(if ($unsafe.Count -eq 1) { 'y' } else { 'ies' }) -- see the FAILED/UNSAFE lines above. " +
            'Re-run after fixing; already-backfilled directories are skipped automatically.')
    }

    return [PSCustomObject]@{
        BaseDir         = $BaseDir
        Applied         = [bool]$Apply
        Scanned         = $dirs.Count
        Backfilled      = @($backfilled)
        SkippedExisting = @($skippedExisting)
        SkippedForeign  = @($skippedForeign)
        SkippedRaced    = @($skippedRaced)
        Unsafe          = @($unsafe)
    }
}
