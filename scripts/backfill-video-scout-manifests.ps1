<#
.SYNOPSIS
  One-shot, best-effort backfill of V5a manifests into legacy (pre-manifest) video-scout run
  directories. DRY RUN BY DEFAULT -- pass -Apply to actually write. Create-only and idempotent:
  existing manifests are never touched; rerunning is a no-op. Exits non-zero (throws) if any
  directory was unsafe (reparse point, containment failure, over the file-entry cap) or could not
  be backfilled.
.DESCRIPTION
  Thin entry point over lib/get-video-scout-backfill.ps1 (see it for the full contract: what a
  directory proves, the backfill provenance object, the filesystem safety gates, the TOCTOU
  SKIP-RACED behavior, and the create-only atomicity guarantee).
.EXAMPLE
  .\backfill-video-scout-manifests.ps1                 # DRY RUN (default): reports what would be written, writes nothing
.EXAMPLE
  .\backfill-video-scout-manifests.ps1 -Apply          # writes manifests for real
.EXAMPLE
  .\backfill-video-scout-manifests.ps1 -BaseDir 'E:\other\downloads' -Apply
#>
param(
    # Must match feed-gemini.ps1's default -OutDir: the root whose run-* subdirectories are runs.
    [string]$BaseDir = 'D:\Gemini_Video_Review\downloads',
    # No -Apply means DRY RUN, unconditionally -- a bare invocation can never write.
    [switch]$Apply
)
$ErrorActionPreference = 'Stop'

. (Join-Path $PSScriptRoot 'lib\get-video-scout-backfill.ps1')

Invoke-VideoScoutBackfill -BaseDir $BaseDir -Apply:$Apply
