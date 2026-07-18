<#
.SYNOPSIS
  V5b1 create-only, atomic writer for the video-scout final report file (analysis-output.txt).
  Unit-testable (write-video-scout-report.Tests.ps1) with a temp run directory -- no network, no
  provider call.
.DESCRIPTION
  Called by feed-gemini.ps1 ONLY after a clean provider exit (exit code 0) with non-empty bounded
  report text, and BEFORE the manifest is updated to outcome='completed' + reportFile. The required
  order (atomic report-before-manifest) is:
      1. provider exits cleanly
      2. finalize the bounded report text (get-bounded-report.ps1)
      3. write a uniquely named temp file INSIDE the run directory (same volume)
      4. flush/close it (WriteAllText does both)
      5. atomically rename it to analysis-output.txt on the same volume
      6. only THEN update the manifest
  This writer owns steps 3-5. It is CREATE-ONLY:
    * refuse if analysis-output.txt already exists (never overwrite);
    * the rename is [IO.File]::Move, which itself throws if the target exists (no overwrite overload
      on .NET Framework / PS 5.1) -- so even a TOCTOU appearance between the check and the move fails
      closed;
    * NO copy fallback (a cross-volume copy is impossible by construction -- temp lives in the run
      dir -- and a copy would not be atomic anyway);
    * on ANY failure the temp file is cleaned up and the function throws visibly, leaving the run
      directory with no report and the manifest untouched (the caller's terminal catch then finalizes
      the manifest as 'error' with reportFile=null).
  Encoding: UTF-8 WITHOUT BOM (PS 5.1 Out-File defaults to UTF-16, hence the explicit encoding).
#>

# The ONE constant report filename. V5b2 reads exactly this name; the shared manifest validator
# only accepts this leaf name shape with an approved plain-text extension on a completed run.
$script:VideoScoutReportFileName = 'analysis-output.txt'

function Get-VideoScoutReportFileName { $script:VideoScoutReportFileName }

<#
.SYNOPSIS
  Atomically persist $Text as $RunDir\analysis-output.txt (create-only, UTF-8 no BOM). Returns the
  constant leaf filename on success; throws visibly on any failure after cleaning its temp file.
#>
function Write-VideoScoutReportFile {
    param(
        [Parameter(Mandatory)][string]$RunDir,
        [Parameter(Mandatory)][AllowEmptyString()][string]$Text
    )
    if (-not (Test-Path -LiteralPath $RunDir -PathType Container)) {
        throw "Video-scout report write FAILED: run directory '$RunDir' does not exist."
    }
    $target = Join-Path $RunDir $script:VideoScoutReportFileName
    if (Test-Path -LiteralPath $target) {
        # Create-only: an existing report is a logic bug (a run finalizes exactly once). Refuse
        # visibly rather than overwrite a prior artifact.
        throw "Video-scout report write FAILED: '$target' already exists (create-only writer never overwrites)."
    }
    # Unique temp INSIDE the run dir so the rename is same-volume (rename-class, atomic) by
    # construction -- a cross-volume temp would silently demote Move to a copy.
    $tmp = Join-Path $RunDir ($script:VideoScoutReportFileName + '.tmp-' + [Guid]::NewGuid().ToString('N'))
    try {
        $enc = New-Object System.Text.UTF8Encoding($false)   # UTF-8, no BOM
        [System.IO.File]::WriteAllText($tmp, $Text, $enc)    # write + flush + close
        # Atomic create-only rename. [IO.File]::Move (no overwrite overload here) throws if $target
        # exists, so this is fail-closed even against a race. No copy fallback.
        [System.IO.File]::Move($tmp, $target)
    }
    catch {
        if (Test-Path -LiteralPath $tmp) { Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue }
        throw "Video-scout report write FAILED for '$target': $($_.Exception.Message)"
    }
    return $script:VideoScoutReportFileName
}
