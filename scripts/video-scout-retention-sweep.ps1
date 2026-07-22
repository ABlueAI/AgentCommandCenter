#Requires -Version 5.1
<#
.SYNOPSIS
  V5c2b manual cross-run retention / reconciliation sweep (human-run entry point). Dry-run by default;
  pass -Apply to actually delete. Deletes ONLY media a bounded, schema-valid V2 manifest explicitly
  owns; never a directory, report, or manifest.
.DESCRIPTION
  A thin wrapper over Invoke-VideoScoutRetentionSweep. All authority, safety, and lane logic lives in
  lib/retention-sweep-video-scout-media.ps1 (which delegates every deletion to the shared V5c2a
  authority). This script only parses arguments, invokes the sweep, and prints the bounded summary.

  DownloadsRoot is MANDATORY (no default) so the sweep can never accidentally run against an unintended
  location. Use the fixed, main-owned run root -- e.g. D:\Gemini_Video_Review\downloads.
.EXAMPLE
  # Dry-run: report what WOULD be deleted/reconciled, change nothing.
  pwsh -File scripts\video-scout-retention-sweep.ps1 -DownloadsRoot 'D:\Gemini_Video_Review\downloads'
.EXAMPLE
  # Apply: perform deletions/reconciliations for runs older than 14 days, retrying transient failures.
  pwsh -File scripts\video-scout-retention-sweep.ps1 -DownloadsRoot 'D:\Gemini_Video_Review\downloads' -MinimumAgeDays 14 -Apply -RetryDeleteFailed
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$DownloadsRoot,
    [ValidateRange(1, 3650)][int]$MinimumAgeDays = 7,
    [switch]$Apply,
    [switch]$RetryDeleteFailed
)
$ErrorActionPreference = 'Stop'

. (Join-Path (Join-Path $PSScriptRoot 'lib') 'retention-sweep-video-scout-media.ps1')

$summary = Invoke-VideoScoutRetentionSweep -DownloadsRoot $DownloadsRoot -MinimumAgeDays $MinimumAgeDays `
    -Apply:$Apply -RetryDeleteFailed:$RetryDeleteFailed

$mode = if ($Apply) { 'APPLY' } else { 'DRY-RUN (no changes written)' }
Write-Host "Video-scout retention sweep - $mode" -ForegroundColor Cyan
$summary | Format-List | Out-String | Write-Host
if ($summary.refused) { exit 3 }
exit 0
