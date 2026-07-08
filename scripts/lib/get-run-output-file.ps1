<#
.SYNOPSIS
  Find the file a video-scout run produced, scoped to that run's own isolated directory only.
.DESCRIPTION
  Paired with New-VideoScoutRunDir: because $RunDir is guaranteed empty at the start of a run and
  used by nothing else, ANY matching file found here was produced by THIS run -- no timestamp
  comparison, no cross-run ambiguity, no possibility of the stale-file bug this pair of helpers
  replaces. Returns $null (never throws) when nothing matches, so the caller decides how to report
  the failure; this keeps the function pure and unit-testable without a real yt-dlp/network call.
#>
function Get-RunOutputFile {
    param(
        [Parameter(Mandatory = $true)][string]$RunDir,
        [Parameter(Mandatory = $true)][string]$Pattern
    )
    Get-ChildItem -LiteralPath $RunDir -Filter $Pattern -File |
        Sort-Object LastWriteTime -Descending | Select-Object -First 1
}
