<#
.SYNOPSIS
  V4Q independent PowerShell verification of a rejected-response diagnostic artifact, plus the
  PowerShell-side diagnostic bounds and the closed quality-failure-code allowlist. Unit-testable
  (get-video-scout-diagnostic-artifact.Tests.ps1) against a temp run directory -- no network, no
  provider call, no credentials.
.DESCRIPTION
  When the SDK's deterministic quality gate rejects a provider response, node preserves the exact
  response text as a single fixed-name file inside the run directory and prints one machine-readable
  line. This module is the PARENT process's INDEPENDENT check of that claim: feed-gemini.ps1 never
  trusts node's self-reported metadata, because the manifest it writes is the durable record.

  Independence is the point. The bounds below are declared here in PowerShell and separately in
  scripts/gemini-video-sdk.js; a test pins the two to equal values. They intentionally match the
  current Library report bounds, but they are an independent V4Q contract -- a later Library change
  must not silently move the diagnostic ceiling.

  What this module verifies about the artifact on disk:
    * direct-child containment  (the file's parent IS the run directory -- no nesting, no traversal)
    * exact fixed leaf name     (never a caller-supplied or provider-supplied name)
    * an ORDINARY file          (not a directory, not a device)
    * no reparse point          (a junction/symlink could redirect the read outside the run dir)
    * strict UTF-8              (decoded with throwOnInvalidBytes -- a mojibaked artifact is not evidence)
    * actual byte count         (measured from disk, within the byte bound)
    * decoded character count   (measured after decode, within the character bound)
    * SHA-256                   (computed here, over the bytes actually on disk)

  It never returns, logs, or projects the diagnostic's CONTENT. The content is evidence for a human
  reading the run directory; it is never a report, never a Library payload, and never a log line.
#>

# --- V4Q diagnostic contract constants (declared independently of the Node side) -----------------
$script:VideoScoutDiagnosticFileName = 'rejected-response.txt'
$script:VideoScoutMaxDiagnosticBytes = 4 * 1024 * 1024
$script:VideoScoutMaxDiagnosticChars = 1000000

# The CLOSED allowlist of quality-gate failure codes, mirroring QUALITY_FAILURE_CODES in
# scripts/gemini-video-sdk.js. A code outside this set is refused rather than recorded: an
# unreviewed reason must never reach a durable manifest.
$script:VideoScoutQualityFailureCodes = @(
    'finish-max-tokens'
    'finish-not-stop'
    'missing-section'
    'duplicate-section'
    'scope-mismatch'
    'missing-slice'
    'missing-slice-audio'
    'missing-speech-anchor'
    'unjustified-universal-silence'
    'unsupported-synthetic-claim'
    'speculative-source-duration'
    'repetitive-timestamp-filler'
    'diagnostic-write-failed'
)

function Get-VideoScoutDiagnosticFileName { $script:VideoScoutDiagnosticFileName }
function Get-VideoScoutMaxDiagnosticBytes { $script:VideoScoutMaxDiagnosticBytes }
function Get-VideoScoutMaxDiagnosticChars { $script:VideoScoutMaxDiagnosticChars }
function Get-VideoScoutQualityFailureCodes { $script:VideoScoutQualityFailureCodes }

<#
.SYNOPSIS
  $true only for a code in the closed V4Q allowlist. Case-sensitive on purpose: the codes are a
  wire contract with the SDK, not free text.
#>
function Test-VideoScoutQualityFailureCode {
    param([Parameter(Mandatory)][AllowEmptyString()][AllowNull()][string]$Code)
    if ([string]::IsNullOrEmpty($Code)) { return $false }
    return ($script:VideoScoutQualityFailureCodes -ccontains $Code)
}

<#
.SYNOPSIS
  Parse the ONE machine-readable quality line the SDK prints on a rejected response. Returns $null
  for any line that is not that line, so an ordinary report line can never be mistaken for one.
.DESCRIPTION
  Accepted shapes (and only these):
    [video-scout quality] rejected code=<allowlisted-code> file=<leaf> bytes=<int> sha256=<64 hex>
    [video-scout quality] rejected code=diagnostic-write-failed
  An unrecognized code, a wrong leaf name, a non-integer byte count, or a malformed hash yields
  $null -- the caller then records the run as an error WITHOUT inventing diagnostic metadata.
#>
function ConvertFrom-VideoScoutQualityLine {
    param([Parameter()][AllowEmptyString()][AllowNull()][string]$Line)
    if ([string]::IsNullOrWhiteSpace($Line)) { return $null }
    $text = [string]$Line
    # -cnotmatch, not -notmatch: PowerShell's -match is CASE-INSENSITIVE by default, which would
    # accept an uppercase code or hex digest and silently widen a contract that is defined as
    # lowercase on both sides of the wire.
    if ($text -cnotmatch '^\s*\[video-scout quality\]\s+rejected\s+code=([a-z0-9\-]+)(.*)$') { return $null }
    $code = $Matches[1]
    $rest = $Matches[2]
    if (-not (Test-VideoScoutQualityFailureCode -Code $code)) { return $null }

    # V4Q CORRECTION: the two shapes are MUTUALLY EXCLUSIVE and each is bound to its code. The
    # original implementation accepted any allowlisted code with no metadata (so a real rejection
    # that silently lost its artifact still parsed as if that were normal) and accepted
    # diagnostic-write-failed WITH metadata (claiming an artifact that by definition was never
    # written). Both are now refused.
    $isWriteFailure = ($code -ceq 'diagnostic-write-failed')
    if ([string]::IsNullOrWhiteSpace($rest)) {
        # No metadata: legal ONLY for the write-failure code, which means nothing was preserved.
        if (-not $isWriteFailure) { return $null }
        return [pscustomobject]@{ Code = $code; FileName = $null; Bytes = $null; Sha256 = $null }
    }
    # Metadata present: illegal for the write-failure code (nothing exists to describe).
    if ($isWriteFailure) { return $null }
    if ($rest -cnotmatch '^\s+file=(\S+)\s+bytes=(\d+)\s+sha256=([0-9a-f]{64})\s*$') { return $null }
    $fileName = $Matches[1]
    if ($fileName -cne $script:VideoScoutDiagnosticFileName) { return $null }
    return [pscustomobject]@{
        Code     = $code
        FileName = $fileName
        Bytes    = [int64]$Matches[2]
        Sha256   = $Matches[3]
    }
}

<#
.SYNOPSIS
  Independently verify the preserved diagnostic on disk and return its canonical manifest entry.
  Throws a bounded message on ANY violation; never returns partial or unverified metadata, and
  never returns the diagnostic's content.
.OUTPUTS
  [pscustomobject] with kind/fileName/bytes/sha256 -- exactly the schema-v4 diagnosticArtifacts
  entry shape.
#>
function Get-VideoScoutDiagnosticArtifact {
    param(
        [Parameter(Mandatory)][string]$RunDir
    )
    if (-not (Test-Path -LiteralPath $RunDir -PathType Container)) {
        throw "Video-scout diagnostic verification FAILED: run directory '$RunDir' does not exist."
    }
    # Resolve BOTH sides before comparing so '..' or a mixed separator cannot make a non-child look
    # like a child. The leaf is our constant, never a supplied name.
    $runFull = [System.IO.Path]::GetFullPath((Resolve-Path -LiteralPath $RunDir).ProviderPath)
    $target  = [System.IO.Path]::GetFullPath((Join-Path $runFull $script:VideoScoutDiagnosticFileName))

    if (-not (Test-Path -LiteralPath $target)) {
        throw "Video-scout diagnostic verification FAILED: '$script:VideoScoutDiagnosticFileName' is not present in the run directory."
    }
    $item = Get-Item -LiteralPath $target -Force
    if ($item.PSIsContainer) {
        throw "Video-scout diagnostic verification FAILED: '$target' is a directory, not a file."
    }
    if (-not ($item -is [System.IO.FileInfo])) {
        throw "Video-scout diagnostic verification FAILED: '$target' is not an ordinary file."
    }
    # A junction/symlink here could redirect the read outside the run directory entirely.
    if ($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) {
        throw "Video-scout diagnostic verification FAILED: '$target' is a reparse point (junction/symlink), which is never accepted as preserved evidence."
    }
    # Direct child: the parent directory must BE the run directory (no nesting, no traversal).
    $parentFull = [System.IO.Path]::GetFullPath($item.DirectoryName)
    if ($parentFull.TrimEnd('\') -ne $runFull.TrimEnd('\')) {
        throw "Video-scout diagnostic verification FAILED: '$target' is not a direct child of the run directory."
    }
    if ($item.Name -cne $script:VideoScoutDiagnosticFileName) {
        throw "Video-scout diagnostic verification FAILED: unexpected diagnostic leaf name '$($item.Name)'."
    }

    $bytes = [System.IO.File]::ReadAllBytes($target)
    if ($bytes.Length -gt $script:VideoScoutMaxDiagnosticBytes) {
        throw "Video-scout diagnostic verification FAILED: $($bytes.Length) bytes exceeds the $($script:VideoScoutMaxDiagnosticBytes)-byte diagnostic bound."
    }
    # STRICT UTF-8: throwOnInvalidBytes. A diagnostic that is not valid UTF-8 is not usable evidence,
    # and silently replacing bad bytes would corrupt the very artifact we are preserving.
    $strictUtf8 = New-Object System.Text.UTF8Encoding($false, $true)
    try { $decoded = $strictUtf8.GetString($bytes) }
    catch {
        throw "Video-scout diagnostic verification FAILED: '$script:VideoScoutDiagnosticFileName' is not valid UTF-8."
    }
    if ($decoded.Length -gt $script:VideoScoutMaxDiagnosticChars) {
        throw "Video-scout diagnostic verification FAILED: $($decoded.Length) decoded characters exceeds the $($script:VideoScoutMaxDiagnosticChars)-character diagnostic bound."
    }

    $sha = [System.Security.Cryptography.SHA256]::Create()
    try { $hash = ($sha.ComputeHash($bytes) | ForEach-Object { $_.ToString('x2') }) -join '' }
    finally { $sha.Dispose() }

    return [pscustomobject]@{
        kind     = 'quality-rejected-response'
        fileName = $script:VideoScoutDiagnosticFileName
        bytes    = [int64]$bytes.Length
        sha256   = $hash
    }
}
