<#
.SYNOPSIS
  V5c1: the ONE shared production function for recording a media artifact into a live run's manifest.
  Ownership provenance comes ONLY from the FileInfo the run's own download/output-resolution path
  produced (Get-RunOutputFile) — never a renderer path, never a caller-provided filename, and NEVER
  from scanning the run directory. Records only state='present'; V5c1 performs no deletion, move,
  quarantine, or cleanup of any kind (V5c2 will define the deletion transition separately).
.DESCRIPTION
  Invariant: every downloadable media artifact a future run produces is recorded in that run's
  manifest BEFORE analysis can complete; no file outside that run, no stale file, and no merely
  discovered file can become manifest-owned. Before recording, this validates provenance against the
  file object itself (direct-child containment, ordinary file, no reparse point, extension==kind,
  existence, real on-disk size, no duplicate) and then updates the manifest ATOMICALLY through the
  shared writer. On ANY failure it throws (refuse visibly), reverts the in-memory ownership claim, and
  leaves the downloaded file untouched — the manifest never claims ownership unless the atomic update
  succeeded. It deletes/moves/repairs nothing.
#>

# The atomic writer (Write-VideoScoutManifestFile — validates the whole manifest through the single
# canonical schema before the atomic swap) and, transitively, the shared schema module.
. (Join-Path $PSScriptRoot 'write-video-scout-manifest.ps1')

function Add-VideoScoutMediaArtifact {
    param(
        # The run directory created by Initialize-VideoScoutRun (main-owned; a direct child of the
        # fixed downloads root).
        [Parameter(Mandatory)][string]$RunDir,
        # The already-selected output file returned by the run-scoped resolver (get-run-output-file.ps1).
        # Ownership comes from THIS object only.
        [Parameter(Mandatory)][System.IO.FileInfo]$File,
        # The mode/kind the run applied (pairs 1:1 with the file's required extension).
        [Parameter(Mandatory)][ValidateSet('transcript', 'audio', 'video')][string]$Kind,
        # The in-memory live (schema v2) manifest object to update + persist.
        [Parameter(Mandatory)]$Manifest
    )

    # Only a live schema-v2 run owns media. A v1 manifest has no inventory field.
    if ((Get-ManifestValue -M $Manifest -Key 'schemaVersion') -ne 2) {
        throw "Refusing to record media: manifest is not schema version 2 (has no media inventory)."
    }

    # (1) Resolve the run directory and candidate file canonically.
    $fullRunDir = [System.IO.Path]::GetFullPath($RunDir).TrimEnd('\', '/')
    $fullFile   = [System.IO.Path]::GetFullPath($File.FullName)

    # (2) Require the candidate to be a DIRECT CHILD of the run directory (the real ownership boundary
    # — no nested file, no file outside the run dir).
    $parent = ([System.IO.Path]::GetDirectoryName($fullFile)).TrimEnd('\', '/')
    if ($parent -ne $fullRunDir) {
        throw "Refusing to record media: '$fullFile' is not a direct child of the run directory '$fullRunDir'."
    }

    # (6) Require the file to exist and (3) be an ordinary file (not a directory masquerading as one).
    if (-not [System.IO.File]::Exists($fullFile)) {
        throw "Refusing to record media: the file does not exist: '$fullFile'."
    }
    if ([System.IO.Directory]::Exists($fullFile)) {
        throw "Refusing to record media: '$fullFile' is a directory, not an ordinary file."
    }

    # (4) Refuse reparse points (symlink/junction/mount) — fail closed on an unreadable attribute set.
    try {
        $attr = [System.IO.File]::GetAttributes($fullFile)
    } catch {
        throw "Refusing to record media: cannot read attributes of '$fullFile'."
    }
    if ($attr -band [System.IO.FileAttributes]::ReparsePoint) {
        throw "Refusing to record media: '$fullFile' is a reparse point."
    }

    # (5) Extension must match kind. The filename is the ACTUAL on-disk leaf, never a caller string.
    $fileName = [System.IO.Path]::GetFileName($fullFile)
    $ext = ([System.IO.Path]::GetExtension($fileName)).ToLowerInvariant()
    $expectedExt = $script:VideoScoutMediaKindExtension[$Kind]
    if ($ext -ne $expectedExt) {
        throw "Refusing to record media: kind '$Kind' requires extension '$expectedExt' but the file is '$fileName'."
    }

    # (7) Read the size from the file itself (not from any caller-supplied value).
    $sizeBytes = [long]([System.IO.FileInfo]$fullFile).Length

    # (8) Refuse a duplicate recording (case-insensitive) against the CURRENT inventory.
    $existing = @($Manifest.mediaArtifacts)
    $lowerName = $fileName.ToLowerInvariant()
    foreach ($a in $existing) {
        if (([string]$a.fileName).ToLowerInvariant() -eq $lowerName) {
            throw "Refusing to record media: '$fileName' is already recorded for this run."
        }
    }

    $artifact = [ordered]@{
        fileName       = $fileName
        kind           = $Kind
        sizeBytes      = $sizeBytes
        recordedAt     = [DateTime]::UtcNow.ToString('yyyy-MM-ddTHH:mm:ss.fffZ')
        state          = 'present'
        deletedAt      = $null
        deletionReason = $null
    }

    # Update the inventory and persist ATOMICALLY. Write-VideoScoutManifestFile validates the WHOLE
    # manifest (including this new artifact) against the single canonical schema before the rename-class
    # swap; a blocked replacement throws and leaves the old manifest — and old inventory — intact. On
    # any failure, revert the in-memory ownership claim so the manifest never claims ownership unless
    # the atomic update actually succeeded. Nothing here deletes, moves, or repairs the file.
    $prev = $Manifest.mediaArtifacts
    $Manifest.mediaArtifacts = @($existing + $artifact)
    try {
        [void](Write-VideoScoutManifestFile -RunDir $RunDir -Manifest $Manifest)
    }
    catch {
        $Manifest.mediaArtifacts = $prev
        throw
    }
    return $Manifest
}
