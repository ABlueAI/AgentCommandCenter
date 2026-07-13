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
