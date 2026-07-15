<#
.SYNOPSIS
  One-shot, best-effort backfill of V5a manifests into legacy (pre-manifest) video-scout run
  directories. Create-only and idempotent: existing manifests are never touched; rerunning is a
  no-op. Exits non-zero (throws) if any directory could not be backfilled.
.DESCRIPTION
  Thin entry point over lib/get-video-scout-backfill.ps1 (see it for the full contract: what a
  directory proves, the backfill provenance object, atomicity, and the create-only guarantee).
.EXAMPLE
  .\backfill-video-scout-manifests.ps1                 # sweep the default downloads root
.EXAMPLE
  .\backfill-video-scout-manifests.ps1 -DryRun         # report what would be written, write nothing
.EXAMPLE
  .\backfill-video-scout-manifests.ps1 -BaseDir 'E:\other\downloads'
#>
param(
    # Must match feed-gemini.ps1's default -OutDir: the root whose run-* subdirectories are runs.
    [string]$BaseDir = 'D:\Gemini_Video_Review\downloads',
    [switch]$DryRun
)
$ErrorActionPreference = 'Stop'

. (Join-Path $PSScriptRoot 'lib\get-video-scout-backfill.ps1')

Invoke-VideoScoutBackfill -BaseDir $BaseDir -DryRun:$DryRun
