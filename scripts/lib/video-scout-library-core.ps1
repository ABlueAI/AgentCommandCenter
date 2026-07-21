<#
.SYNOPSIS
  V5b2 Video Scout Library core: the pure projection/date/report-status logic and the bounded,
  fail-closed List/Read filesystem actions behind the single library entry point
  (scripts/video-scout-library.ps1). PowerShell is the SOLE manifest validator (it dot-sources
  video-scout-manifest-schema.ps1 and calls Assert-VideoScoutManifestValid) -- there is no manifest
  validation in JavaScript.
.DESCRIPTION
  The renderer can list and read ONLY bounded, schema-valid Video Scout records/reports selected
  through main-owned identities. It never supplies or receives filesystem paths; untrusted
  manifest/report content is projected as inert plain data only. This module enforces the read
  boundary with hard bounds at enumeration (5,000 dirs), manifest size (256 KiB), report size
  (4 MiB), and decoded report length (1,000,000 UTF-16 units), refuses reparse points, and
  independently RE-VALIDATES at Read time (files may change between List and Read -- TOCTOU).

  Diagnostics are BOUNDED REASON CONSTANTS only. A schema/JSON failure message can contain
  attacker-influenced manifest text, so it is NEVER surfaced -- only a constant like
  'manifest-schema-invalid'. No report text, manifest-derived string, or path is ever written to
  stderr/Logs; the only place manifest-derived strings appear is the JSON stdout PAYLOAD the entry
  point prints (which main forwards to the renderer as textContent).

  Requires video-scout-manifest-schema.ps1 to be dot-sourced first (for Assert-VideoScoutManifestValid
  and $script:VideoScoutTimestampRe).
#>

# Hard bounds (the security envelope). Named once here; the entry point and tests read them.
$script:VSLibMaxRunDirs        = 5000
$script:VSLibMaxManifestBytes  = 262144      # 256 KiB
$script:VSLibMaxReportBytes    = 4194304     # 4 MiB
$script:VSLibMaxReportChars    = 1000000     # UTF-16 code units
$script:VSLibReportExtensions  = @('.txt')
# Run-id shape for the LIBRARY read boundary. Accepts BOTH historical generations:
#   post-P10 : run-<yyyyMMdd-HHmmss-fff>-<pid>-<8 lowercase hex>   (V5b1 main-issued shape)
#   pre-P10  : run-<yyyyMMdd-HHmmss-fff>-<pid>                      (legacy, no hex suffix)
# so legacy backfilled (report-less) runs remain visible/openable as honest metadata-only records.
# It is anchored to digit/hex runs only, so a value with a path separator, '..' traversal, or a
# drive/UNC prefix cannot match -- and Read additionally enforces .NET direct-child containment as
# the real boundary (this shape check is defense in depth, never the sole gate). Superset of V5b1's
# Test-VideoScoutRunId (which requires the hex suffix); NEW runs always carry it.
$script:VSLibRunIdRe   = '^run-[0-9]{8}-[0-9]{6}-[0-9]{3}-[0-9]+(-[0-9a-f]{8})?$'
$script:VSLibRunIdMax  = 80
# Local approximate stamp shape (backfill.startedAtFromDirNameLocal): ISO-like LOCAL time, no Z.
$script:VSLibLocalStampRe = '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}$'

<#
.SYNOPSIS
  Pure. $true iff $RunId is a safe library run-id shape (see $VSLibRunIdRe). Never throws.
#>
function Test-VideoScoutLibraryRunId {
    param($RunId)
    if ($RunId -isnot [string]) { return $false }
    if ($RunId.Length -eq 0 -or $RunId.Length -gt $script:VSLibRunIdMax) { return $false }
    # -cmatch (case-sensitive): the optional hex suffix must be lowercase, matching the generator.
    return [bool]($RunId -cmatch $script:VSLibRunIdRe)
}

<#
.SYNOPSIS
  $true iff the path is a reparse point (symlink/junction/mount). Fail-closed: an unreadable
  attribute set returns $true (treat as unsafe), never a throw.
#>
function Test-PathIsReparsePoint {
    param([Parameter(Mandatory)][string]$Path)
    try {
        $attr = [System.IO.File]::GetAttributes($Path)
        return [bool]($attr -band [System.IO.FileAttributes]::ReparsePoint)
    } catch {
        return $true
    }
}

<#
.SYNOPSIS
  Pure. Normalize an entry's provenance date from a parsed manifest object into
  @{ value=<string|null>; kind='exact'|'approximate'|'unknown'; sortMs=<long|null> }.
  Live manifests use canonical UTC startedAt (exact). Backfills use the explicitly-approximate LOCAL
  stamp (backfill.startedAtFromDirNameLocal), strictly parsed; a fabricated UTC is NEVER synthesized.
  Missing/invalid provenance -> Unknown (never null-sorted into invisibility).
#>
function Resolve-VideoScoutEntryDate {
    param([Parameter(Mandatory)]$Manifest)
    $startedAt = $Manifest.startedAt
    if (($startedAt -is [string]) -and ($startedAt -match $script:VideoScoutTimestampRe)) {
        $ms = $null
        try { $ms = [long]([DateTimeOffset]::ParseExact($startedAt, 'yyyy-MM-ddTHH:mm:ss.fffZ', [System.Globalization.CultureInfo]::InvariantCulture, [System.Globalization.DateTimeStyles]::AssumeUniversal -bor [System.Globalization.DateTimeStyles]::AdjustToUniversal)).ToUnixTimeMilliseconds() } catch { $ms = $null }
        return @{ value = $startedAt; kind = 'exact'; sortMs = $ms }
    }
    # backfill provenance (approximate LOCAL stamp). Access defensively: the object may lack the key.
    $bf = $null
    if ($Manifest.PSObject.Properties['backfill']) { $bf = $Manifest.backfill }
    if ($null -ne $bf) {
        $local = $null
        if ($bf.PSObject.Properties['startedAtFromDirNameLocal']) { $local = $bf.startedAtFromDirNameLocal }
        if (($local -is [string]) -and ($local -match $script:VSLibLocalStampRe)) {
            $ms = $null
            try {
                $dt = [DateTime]::ParseExact($local, 'yyyy-MM-ddTHH:mm:ss.fff', [System.Globalization.CultureInfo]::InvariantCulture)
                $ms = [long]([DateTimeOffset]$dt).ToUnixTimeMilliseconds()   # Unspecified -> assumed LOCAL
            } catch { $ms = $null }
            return @{ value = $local; kind = 'approximate'; sortMs = $ms }
        }
    }
    return @{ value = $null; kind = 'unknown'; sortMs = $null }
}

<#
.SYNOPSIS
  Pure. Report status from manifest fields ONLY (no disk touch), for the LIST projection:
    backfill (historical legacy run)     -> 'not-persisted'  (its report was never persisted)
    completed + non-null reportFile      -> 'available'  (Read re-validates against disk; authoritative)
    completed + null reportFile          -> 'not-persisted'  (completed but no report; honest)
    live, outcome null (ongoing)         -> 'incomplete'  (Read maps ongoing -> "not available yet")
    live, refused/error                  -> 'incomplete'  (terminal without a report)
  The 'not-persisted' cases are exactly the ones the UI labels "No report was persisted for this run."
  Requires the schema's Test-ManifestHasKey (dot-sourced) to detect the backfill discriminator on
  both an in-memory hashtable and a read-back PSObject.
#>
function Get-VideoScoutReportStatusFromManifest {
    param([Parameter(Mandatory)]$Manifest)
    if (Test-ManifestHasKey -M $Manifest -Key 'backfill') { return 'not-persisted' }
    $outcome = $Manifest.outcome
    $reportFile = $Manifest.reportFile
    if ($outcome -eq 'completed') {
        if (($reportFile -is [string]) -and -not [string]::IsNullOrWhiteSpace($reportFile)) { return 'available' }
        return 'not-persisted'
    }
    return 'incomplete'
}

<#
.SYNOPSIS
  Pure. Honest display title: the sanitized videoTitle when present, else a bounded fallback constant.
#>
function Get-VideoScoutDisplayTitle {
    param([Parameter(Mandatory)]$Manifest)
    $t = $Manifest.videoTitle
    if (($t -is [string]) -and -not [string]::IsNullOrWhiteSpace($t)) { return $t }
    return '(untitled run)'
}

<#
.SYNOPSIS
  Pure. Project a validated manifest into the bounded UI entry: NO paths, NO raw manifest, NO raw
  reason/provider body. Only the fields the Library UI renders.
#>
function ConvertTo-VideoScoutLibraryEntry {
    param(
        [Parameter(Mandatory)]$Manifest,
        [Parameter(Mandatory)][string]$RunId
    )
    $date = Resolve-VideoScoutEntryDate -Manifest $Manifest
    $totalTokens = $null
    $usage = $Manifest.usage
    if ($null -ne $usage -and $usage.PSObject.Properties['totalTokens']) {
        $tt = $usage.totalTokens
        if ($tt -is [int] -or $tt -is [long]) { $totalTokens = [long]$tt }
    }
    $startOff = $null
    if ($Manifest.startOffsetSeconds -is [int] -or $Manifest.startOffsetSeconds -is [long]) { $startOff = [long]$Manifest.startOffsetSeconds }
    $endOff = $null
    if ($Manifest.endOffsetSeconds -is [int] -or $Manifest.endOffsetSeconds -is [long]) { $endOff = [long]$Manifest.endOffsetSeconds }
    # V5c1: a BOUNDED count of recorded media artifacts (v2 runs). No filenames/paths are exposed —
    # just the count, for optional display. v1 history / backfills have no inventory -> 0. Direct
    # property access + @() (no function-boundary unwrap) keeps an empty inventory as a 0 count.
    $mediaCount = 0
    $maProp = $Manifest.PSObject.Properties['mediaArtifacts']
    if ($maProp -and $null -ne $maProp.Value) { $mediaCount = @($maProp.Value).Count }
    [ordered]@{
        runId        = $RunId                       # bounded, path-free label; main maps it to an opaque handle
        title        = Get-VideoScoutDisplayTitle -Manifest $Manifest
        date         = $date.value
        dateKind     = $date.kind
        sortMs       = $date.sortMs
        mode         = $Manifest.appliedMode        # null | transcript | audio | video
        route        = $Manifest.route              # sdk | cli
        outcome      = $Manifest.outcome            # null (incomplete) | completed | refused | error
        totalTokens  = $totalTokens
        startOffsetSeconds = $startOff
        endOffsetSeconds   = $endOff
        reportStatus = Get-VideoScoutReportStatusFromManifest -Manifest $Manifest
        mediaCount   = [long]$mediaCount            # bounded count only — NEVER filenames or paths
    }
}

<#
.SYNOPSIS
  FS. Read + validate a manifest.json inside a run directory, bounded and fail-closed. Returns
  @{ ok=$true; manifest=<obj> } or @{ ok=$false; reason=<constant> }. reason is ALWAYS a bounded
  constant -- never the schema/JSON error text (which can echo hostile manifest content).
#>
function Read-VideoScoutManifestObject {
    param(
        [Parameter(Mandatory)][string]$RunDir,
        [Parameter(Mandatory)][string]$RunId
    )
    $manifestPath = Join-Path $RunDir 'manifest.json'
    if (-not [System.IO.File]::Exists($manifestPath)) { return @{ ok = $false; reason = 'manifest-missing' } }
    if (Test-PathIsReparsePoint -Path $manifestPath) { return @{ ok = $false; reason = 'manifest-reparse' } }
    $len = -1
    try { $len = ([System.IO.FileInfo]$manifestPath).Length } catch { return @{ ok = $false; reason = 'manifest-unreadable' } }
    if ($len -lt 0 -or $len -gt $script:VSLibMaxManifestBytes) { return @{ ok = $false; reason = 'manifest-too-large' } }
    $raw = $null
    try { $raw = [System.IO.File]::ReadAllText($manifestPath, [System.Text.Encoding]::UTF8) } catch { return @{ ok = $false; reason = 'manifest-unreadable' } }
    $obj = $null
    try { $obj = $raw | ConvertFrom-Json } catch { return @{ ok = $false; reason = 'manifest-json-invalid' } }
    if ($null -eq $obj) { return @{ ok = $false; reason = 'manifest-json-invalid' } }
    # The SOLE manifest validator. Its throw text may contain hostile manifest strings -> swallow it,
    # surface only a bounded constant.
    try { Assert-VideoScoutManifestValid -Manifest $obj } catch { return @{ ok = $false; reason = 'manifest-schema-invalid' } }
    # The manifest's own runId must equal the directory leaf exactly (no cross-run confusion).
    if ([string]$obj.runId -cne $RunId) { return @{ ok = $false; reason = 'runid-mismatch' } }
    return @{ ok = $true; manifest = $obj }
}

<#
.SYNOPSIS
  FS. LIST action: lazily enumerate direct child run directories under $RunRoot (bounded to 5,000),
  validate each, and project the valid ones. Invalid candidates are EXCLUDED from entries but COUNTED
  (with bounded reason constants) so nothing is silently omitted. Returns a result object.
#>
function Invoke-VideoScoutLibraryList {
    param([Parameter(Mandatory)][string]$RunRoot)
    $entries      = New-Object System.Collections.Generic.List[object]
    $invalidList  = New-Object System.Collections.Generic.List[object]
    $total        = 0
    $capExceeded  = $false

    $fullRoot = $null
    try { $fullRoot = [System.IO.Path]::GetFullPath($RunRoot).TrimEnd('\','/') } catch { $fullRoot = $null }
    # A missing root is a valid "no runs yet" state, not an error.
    if (-not $fullRoot -or -not [System.IO.Directory]::Exists($fullRoot)) {
        return @{ ok = $true; rootExists = $false; total = 0; capExceeded = $false; entries = @(); invalid = @() }
    }

    $addInvalid = {
        param([string]$leaf, [string]$reason)
        # Only a safe, bounded run label + a reason constant -- never raw content.
        $safeLabel = if (($leaf -is [string]) -and (Test-VideoScoutLibraryRunId $leaf)) { $leaf } else { '(unrecognized run directory)' }
        $invalidList.Add([ordered]@{ runLabel = $safeLabel; reason = $reason })
    }

    foreach ($dir in [System.IO.Directory]::EnumerateDirectories($fullRoot)) {
        if ($total -ge $script:VSLibMaxRunDirs) { $capExceeded = $true; break }
        $total++
        $leaf = [System.IO.Path]::GetFileName($dir)
        if (-not (Test-VideoScoutLibraryRunId $leaf)) { & $addInvalid $leaf 'run-id-shape'; continue }
        if (Test-PathIsReparsePoint -Path $dir) { & $addInvalid $leaf 'reparse-directory'; continue }
        $res = Read-VideoScoutManifestObject -RunDir $dir -RunId $leaf
        if (-not $res.ok) { & $addInvalid $leaf $res.reason; continue }
        $entries.Add((ConvertTo-VideoScoutLibraryEntry -Manifest $res.manifest -RunId $leaf))
    }

    return @{
        ok          = $true
        rootExists  = $true
        total       = $total
        capExceeded = $capExceeded
        # .ToArray() (not @()): PS 5.1 throws "Argument types do not match" wrapping a generic
        # List[object] of OrderedDictionary elements in the @() array-subexpression operator.
        entries     = $entries.ToArray()
        invalid     = $invalidList.ToArray()
    }
}

<#
.SYNOPSIS
  FS. READ action: resolve a main-issued RunId to its validated report, RE-VALIDATING everything
  independently of List (files may change in between). Returns a structured success/refusal with
  bounded metadata; plain report text ONLY on success. Never logs report content.
#>
function Invoke-VideoScoutLibraryRead {
    param(
        [Parameter(Mandatory)][string]$RunRoot,
        [Parameter(Mandatory)]$RunId
    )
    if (-not (Test-VideoScoutLibraryRunId $RunId)) { return @{ ok = $false; status = 'unsafe'; reason = 'run-id-shape' } }

    $fullRoot = $null
    try { $fullRoot = [System.IO.Path]::GetFullPath($RunRoot).TrimEnd('\','/') } catch { $fullRoot = $null }
    if (-not $fullRoot) { return @{ ok = $false; status = 'unsafe'; reason = 'run-root-invalid' } }

    $runDir = Join-Path $fullRoot $RunId
    # Direct-child containment (the real boundary): runDir's parent MUST be the fixed root.
    $fullRunDir = $null
    try { $fullRunDir = [System.IO.Path]::GetFullPath($runDir) } catch { return @{ ok = $false; status = 'unsafe'; reason = 'containment' } }
    $runParent = ([System.IO.Path]::GetDirectoryName($fullRunDir)).TrimEnd('\','/')
    if ($runParent -ne $fullRoot) { return @{ ok = $false; status = 'unsafe'; reason = 'containment' } }
    if (-not [System.IO.Directory]::Exists($fullRunDir)) { return @{ ok = $false; status = 'missing'; reason = 'run-dir-missing' } }
    if (Test-PathIsReparsePoint -Path $fullRunDir) { return @{ ok = $false; status = 'unsafe'; reason = 'reparse-directory' } }

    $mres = Read-VideoScoutManifestObject -RunDir $fullRunDir -RunId $RunId
    if (-not $mres.ok) { return @{ ok = $false; status = 'unsafe'; reason = $mres.reason } }
    $m = $mres.manifest
    $outcome = $m.outcome

    # Derive the no-report cases from the SAME status helper the List projection uses, so List and
    # Read never disagree about what a run is. 'incomplete' => ongoing/refused/error (no report expected;
    # the renderer maps ongoing -> "Report is not available yet."); 'not-persisted' => historical
    # backfill or a completed run with no report file -> "No report was persisted for this run."
    $manifestStatus = Get-VideoScoutReportStatusFromManifest -Manifest $m
    if ($manifestStatus -eq 'incomplete') {
        return @{ ok = $true; status = 'incomplete'; outcome = $(if ($null -eq $outcome) { $null } else { [string]$outcome }); reportStatus = 'incomplete' }
    }
    if ($manifestStatus -eq 'not-persisted') {
        return @{ ok = $true; status = 'not-persisted'; outcome = $(if ($null -eq $outcome) { $null } else { [string]$outcome }); reportStatus = 'not-persisted' }
    }
    # manifestStatus == 'available' -> a completed live run with a non-null reportFile. Touch disk.
    $reportFile = $m.reportFile
    # reportFile passed the shared schema (leaf, .txt, completed-only) inside Read-VideoScoutManifestObject.
    # Re-check the leaf/extension here too (defense in depth) before touching disk.
    if ($reportFile -match '[\\/]' -or $reportFile -match '\.\.' -or $reportFile -match '^[A-Za-z]:' -or $reportFile -match '^[\\/]') {
        return @{ ok = $false; status = 'unsafe'; reason = 'report-name-unsafe' }
    }
    $ext = ([System.IO.Path]::GetExtension($reportFile)).ToLowerInvariant()
    if ($script:VSLibReportExtensions -notcontains $ext) { return @{ ok = $false; status = 'unsafe'; reason = 'report-extension' } }

    $reportPath = Join-Path $fullRunDir $reportFile
    $fullReport = $null
    try { $fullReport = [System.IO.Path]::GetFullPath($reportPath) } catch { return @{ ok = $false; status = 'unsafe'; reason = 'report-containment' } }
    # The report must remain a DIRECT child of the run directory.
    $reportParent = ([System.IO.Path]::GetDirectoryName($fullReport)).TrimEnd('\','/')
    if ($reportParent -ne $fullRunDir.TrimEnd('\','/')) { return @{ ok = $false; status = 'unsafe'; reason = 'report-containment' } }
    if (-not [System.IO.File]::Exists($fullReport)) { return @{ ok = $false; status = 'missing'; reason = 'report-missing' } }
    if (Test-PathIsReparsePoint -Path $fullReport) { return @{ ok = $false; status = 'unsafe'; reason = 'report-reparse' } }
    # Must be an ordinary file, not a directory masquerading as the name.
    if ([System.IO.Directory]::Exists($fullReport)) { return @{ ok = $false; status = 'unsafe'; reason = 'report-not-a-file' } }

    $len = -1
    try { $len = ([System.IO.FileInfo]$fullReport).Length } catch { return @{ ok = $false; status = 'unsafe'; reason = 'report-unreadable' } }
    if ($len -lt 0 -or $len -gt $script:VSLibMaxReportBytes) { return @{ ok = $false; status = 'unsafe'; reason = 'report-too-large' } }

    $bytes = $null
    try { $bytes = [System.IO.File]::ReadAllBytes($fullReport) } catch { return @{ ok = $false; status = 'unsafe'; reason = 'report-unreadable' } }
    # Re-bound against the ACTUAL bytes read (Reviewer LOW-1): the FileInfo.Length check above and this
    # read are two separate filesystem ops, so a file swapped to a larger one in between could slip a
    # bigger payload past the size gate. Re-check the real length before decoding so the 4 MiB bound
    # holds against what was read, not just what was stat'd.
    if ($bytes.Length -gt $script:VSLibMaxReportBytes) { return @{ ok = $false; status = 'unsafe'; reason = 'report-too-large' } }
    # STRICT UTF-8 decode: throwOnInvalidBytes so a non-UTF-8 report is refused, not mojibaked.
    $text = $null
    try {
        $strict = New-Object System.Text.UTF8Encoding($false, $true)
        $text = $strict.GetString($bytes)
    } catch { return @{ ok = $false; status = 'unsafe'; reason = 'report-not-utf8' } }
    if ($text.Length -gt $script:VSLibMaxReportChars) { return @{ ok = $false; status = 'unsafe'; reason = 'report-too-many-chars' } }

    return @{
        ok           = $true
        status       = 'available'
        outcome      = 'completed'
        reportStatus = 'available'
        title        = Get-VideoScoutDisplayTitle -Manifest $m
        mode         = $m.appliedMode
        route        = $m.route
        chars        = $text.Length
        text         = $text
    }
}
