<#
.SYNOPSIS
  Create a fresh, guaranteed-unique per-run subdirectory under a video-scout download base dir.
.DESCRIPTION
  Root cause of the stale-file bug found in live testing: the CLI transcript/audio/video path used
  to scan the whole (flat) $OutDir with `Get-ChildItem | Sort LastWriteTime -Descending |
  Select -First 1`, which throws only when ZERO matching files exist anywhere in that directory --
  not when THIS run failed to produce one. A caption-less video (yt-dlp: "There are no subtitles
  for the requested languages") left no new .srt behind, so that selection silently picked up the
  newest LEFTOVER file from a prior, unrelated run and fed it to Gemini -- a plausible-looking
  summary of the WRONG video, with no error anywhere.

  The fix is directory isolation, not a smarter timestamp check: give each run its own empty
  subdirectory before yt-dlp runs, so file selection (see get-run-output-file.ps1) can structurally
  only ever see what THIS run produced. An empty run dir after download means the download produced
  nothing -- unambiguous and timestamp-independent, so it fails loudly by construction rather than
  by convention.
#>
function New-VideoScoutRunDir {
    param(
        [Parameter(Mandatory = $true)][string]$BaseDir
    )
    if (-not (Test-Path -LiteralPath $BaseDir)) { New-Item -ItemType Directory -Path $BaseDir | Out-Null }
    # Timestamp keeps run dirs human-sortable for manual inspection; the PID + a short random suffix
    # guarantee uniqueness even when two runs start in the same millisecond IN THE SAME PROCESS (the
    # PID alone does not -- e.g. two calls back-to-back from one script or test run). This delivers the
    # "guaranteed-unique" promise in this file's synopsis.
    $stamp = Get-Date -Format 'yyyyMMdd-HHmmss-fff'
    $suffix = [Guid]::NewGuid().ToString('N').Substring(0, 8)
    $runDir = Join-Path $BaseDir "run-$stamp-$PID-$suffix"
    New-Item -ItemType Directory -Path $runDir | Out-Null
    return $runDir
}

# V5b1: the canonical run-ID shape, shared byte-for-byte with the main-process generator
# (app/video-scout-run-id.js). Anchored: only the listed digit/hex runs, start to end -- so it
# rejects separators (/ \ :), traversal (..), rooted/UNC paths, and malformed stamps/PIDs/suffixes
# by construction. A separate length cap bounds the otherwise-open PID digit run.
$script:VideoScoutRunIdRe = '^run-\d{8}-\d{6}-\d{3}-\d+-[0-9a-f]{8}$'
$script:VideoScoutRunIdMaxLength = 80

<#
.SYNOPSIS
  V5b1: validate a complete run ID BEFORE any filesystem use. Pure ($true/$false, never throws).
  Enforces the exact canonical shape run-<yyyyMMdd-HHmmss-fff>-<PID>-<8 lowercase hex> and an
  overall length cap. Because the regex is anchored to only digit/hex runs, a value containing a
  path separator, a '..' traversal, a drive/UNC prefix, or a malformed stamp/PID/suffix cannot match.
#>
function Test-VideoScoutRunId {
    param($RunId)
    if ($RunId -isnot [string]) { return $false }
    if ($RunId.Length -eq 0 -or $RunId.Length -gt $script:VideoScoutRunIdMaxLength) { return $false }
    # -cmatch (CASE-SENSITIVE): the hex suffix must be lowercase, matching the JS generator. Plain
    # -match is case-insensitive in PowerShell and would wrongly accept an uppercase suffix.
    return [bool]($RunId -cmatch $script:VideoScoutRunIdRe)
}

<#
.SYNOPSIS
  V5b1: create the run directory for a MAIN-ISSUED run ID as a direct child of the fixed base dir.
  Validates the ID (Test-VideoScoutRunId), refuses collisions (never reuses/overwrites an existing
  run directory), and verifies the created directory's parent is exactly $BaseDir (defense in depth
  against a validated-but-somehow-traversing name). Returns the created directory path.
#>
function New-VideoScoutRunDirFromId {
    param(
        [Parameter(Mandatory = $true)][string]$BaseDir,
        [Parameter(Mandatory = $true)][string]$RunId
    )
    if (-not (Test-VideoScoutRunId -RunId $RunId)) {
        throw "Refusing: invalid video-scout run ID '$RunId' (must match run-<yyyyMMdd-HHmmss-fff>-<PID>-<8 hex> and contain no path separators, traversal, or drive prefix)."
    }
    if (-not (Test-Path -LiteralPath $BaseDir)) { New-Item -ItemType Directory -Path $BaseDir | Out-Null }
    $runDir = Join-Path $BaseDir $RunId
    if (Test-Path -LiteralPath $runDir) {
        # Never overwrite or reuse an existing run directory -- a collision is a logic bug, not a
        # resumption point.
        throw "Refusing: video-scout run directory already exists for run ID '$RunId'; refusing to reuse or overwrite it."
    }
    New-Item -ItemType Directory -Path $runDir -ErrorAction Stop | Out-Null
    # Defense in depth: the created directory must be a DIRECT child of the fixed base dir. If a
    # validated name ever managed to escape (it cannot with the anchored regex, but this is the
    # security boundary), remove the stray dir if we made one and refuse. Use .NET path APIs (not
    # Split-Path, whose -LiteralPath/-Parent combination trips a parameter-set conflict on PS 5.1).
    $resolvedBase   = [System.IO.Path]::GetFullPath((Resolve-Path -LiteralPath $BaseDir).ProviderPath).TrimEnd('\','/')
    $resolvedRun    = [System.IO.Path]::GetFullPath((Resolve-Path -LiteralPath $runDir).ProviderPath)
    $resolvedParent = ([System.IO.Path]::GetDirectoryName($resolvedRun)).TrimEnd('\','/')
    if ($resolvedParent -ne $resolvedBase) {
        if ((Test-Path -LiteralPath $runDir) -and ($null -eq (Get-ChildItem -LiteralPath $runDir -Force))) {
            Remove-Item -LiteralPath $runDir -Force -ErrorAction SilentlyContinue
        }
        throw "Refusing: video-scout run directory '$resolvedRun' is not a direct child of the base '$resolvedBase'."
    }
    return $runDir
}
