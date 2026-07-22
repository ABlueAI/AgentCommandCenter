<#
.SYNOPSIS
  V5a shared schema: the SINGLE canonical definition, construction path(s), and validator for the
  video-scout per-run manifest -- used by BOTH the live writer (write-video-scout-manifest.ps1) and
  the one-shot legacy backfill utility (get-video-scout-backfill.ps1). There must be exactly ONE
  schema implementation: two would drift (the P6 drift class), and a validator on one path is worth
  nothing if the other path can persist a shape it never sees.
.DESCRIPTION
  Two manifest variants share one canonical key set (same keys, same order):

    * LIVE     -- written by an accepted feed-gemini.ps1 run. It records ground truth: a real
                  startedAt, a real route (sdk|cli), a terminal outcome (or null while running).
    * BACKFILL -- synthesized for a legacy run directory that predates the manifest. It records only
                  what a directory on disk can PROVE, and marks everything it could not prove as
                  null. It carries an extra, discriminator `backfill` object (present ONLY on
                  backfilled manifests) holding provenance: an explicitly-approximate local run
                  stamp parsed from the directory name, the fields it inferred, and the
                  code-control-flow basis (with the pre-V5a commit SHA) for inferring route = 'cli'.

  The validator (Assert-VideoScoutManifestValid) is the drift gate. It runs BEFORE either writer
  persists JSON. It enforces the exact canonical key set for the variant, rejects unknown/missing
  keys, type/value-checks every field, and -- critically -- enforces DIFFERENT nullability per
  variant using provenance: a live manifest must have a real startedAt and may carry an outcome; a
  backfilled manifest MUST have startedAt=null / outcome=null / no fabricated run facts, and MUST
  carry a well-formed `backfill` provenance object naming route as inferred with the code basis.
  A "backfilled" manifest that smuggles in a real startedAt or a 'completed' outcome, or a live
  manifest that grows a `backfill` key, is rejected -- that asymmetry is the whole point.

  Untrusted input: the one filename-derived videoTitle (backfill) and url/model/reason (live) are
  passed through Get-SanitizedManifestText before entering the manifest (C0+DEL stripped, bidi
  overrides stripped, single line, length-capped, GEMINI_API_KEY redacted). This module never stores
  credentials, raw provider bodies, filesystem paths, or media/report contents.

  Encoding note lives with the writers: UTF-8 without BOM. This module only builds + validates the
  in-memory object; each writer owns its own atomic persistence (live = create-or-replace; backfill
  = create-only).
#>

# The pre-V5a commit whose control flow PROVES a legacy run directory implies the CLI route. FACT:
# in scripts/feed-gemini.ps1 at this commit the SDK (YouTube) route enters near line 129, invokes
# node, and returns near line 159; output-folder preparation begins near line 177 and
# New-VideoScoutRunDir is called near line 183 -- reachable only AFTER the SDK route has returned.
# So a run directory on disk (which only the CLI path creates) implies route = 'cli'. The absence of
# media files proves nothing and does NOT affect this inference.
$script:VideoScoutBackfillRouteCommit = 'efd76f8bf8c86548c1479cd3e2852d49cce36317'
$script:VideoScoutBackfillRouteDetail = @'
In scripts/feed-gemini.ps1 at commit efd76f8bf8c86548c1479cd3e2852d49cce36317, the SDK (YouTube) route enters near line 129, invokes node, and returns near line 159; output-folder preparation begins near line 177 and New-VideoScoutRunDir is called near line 183 -- reachable only after the SDK route has already returned. A run directory on disk therefore implies the CLI route. The absence of media files does not affect this inference.
'@.Trim()

$script:VideoScoutModes       = @('transcript', 'audio', 'video')
$script:VideoScoutRoutes      = @('sdk', 'cli')
$script:VideoScoutResolutions = @('LOW', 'MEDIUM', 'HIGH')
$script:VideoScoutOutcomes    = @('completed', 'refused', 'error')
$script:VideoScoutTimestampRe = '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$'
# V5b1: a non-null reportFile must be a bounded LEAF filename (never a path) with an approved
# plain-text extension. Null stays valid for all historical/backfill/failed/refused/incomplete/
# non-analysis manifests -- that is the backward-compatibility that keeps the 23 existing
# report-less manifests valid.
$script:VideoScoutReportExtensions = @('.txt')
$script:VideoScoutReportFileMaxLength = 200

<#
.SYNOPSIS
  One-line, length-capped, credential-redacted form of an untrusted string. Pure. $null when nothing
  representable remains. Shared by the live writer and the backfill utility (the "existing shared
  sanitizer" both must use).
#>
function Get-SanitizedManifestText {
    param([string]$Text, [int]$MaxLength = 500)
    if ([string]::IsNullOrWhiteSpace($Text)) { return $null }
    $s = [string]$Text
    # C0 controls + DEL -> space: single-line only (a multi-line reason/title could fake extra
    # JSON-viewer/log lines).
    $s = $s -replace '[\x00-\x1F\x7F]', ' '
    # Bidi/direction-override characters render text backwards in viewers (the P11 log-spoof class);
    # they carry no information a title/reason needs -- strip, not escape. (\uXXXX escapes, not
    # literal characters, so the invisible marks don't boobytrap this file.)
    $s = $s -replace '[\u200E\u200F\u202A-\u202E\u2066-\u2069]', ''
    $s = ($s -replace '\s{2,}', ' ').Trim()
    # A provider error must never carry the live credential into a durable, indexable file. The
    # length floor avoids redacting short common substrings if the env var holds junk.
    $key = $env:GEMINI_API_KEY
    if ($key -and $key.Length -ge 8) { $s = $s.Replace($key, '[redacted]') }
    if ($s.Length -gt $MaxLength) { $s = $s.Substring(0, $MaxLength) + ' [truncated]' }
    if ($s.Length -eq 0) { return $null }
    return $s
}

<#
.SYNOPSIS
  The canonical manifest skeleton: the ONE place the key set and its order are defined. Every value
  is null except schemaVersion. Both constructors start here, so live and backfill can never drift in
  which keys exist or their order.
#>
function New-VideoScoutManifestBase {
    [ordered]@{
        schemaVersion            = 1
        runId                    = $null
        videoScout               = $null
        url                      = $null
        videoTitle               = $null
        requestedMode            = $null
        appliedMode              = $null
        route                    = $null
        model                    = $null
        mediaResolutionRequested = $null
        mediaResolutionApplied   = $null
        startOffsetSeconds       = $null
        endOffsetSeconds         = $null
        startedAt                = $null
        finishedAt               = $null
        usage                    = $null
        reportFile               = $null
        outcome                  = $null
        reason                   = $null
    }
}

<#
.SYNOPSIS
  The canonical key list (derived from the skeleton, so it cannot drift from it).
#>
function Get-VideoScoutManifestCanonicalKeys {
    @((New-VideoScoutManifestBase).Keys)
}

<#
.SYNOPSIS
  Build a LIVE manifest for an accepted feed-gemini.ps1 run. Records ground truth; unknown-at-
  creation fields stay explicit null. startedAt is stamped here (UTC, ms precision). No `backfill`
  key -- that key is what marks the truthful/approximate distinction and must NEVER appear on a live
  manifest.
#>
function New-VideoScoutLiveManifest {
    param(
        [Parameter(Mandatory)][string]$RunId,
        [string]$Url,
        # Untyped: a [string] param coerces $null -> '' (PS 5.1); the manifest must record explicit
        # JSON null (not '') for "caller requested nothing".
        $RequestedMode = $null,
        [Parameter(Mandatory)][ValidateSet('transcript', 'audio', 'video')][string]$AppliedMode,
        [Parameter(Mandatory)][ValidateSet('sdk', 'cli')][string]$Route,
        [string]$Model,
        [Parameter(Mandatory)][ValidateSet('LOW', 'MEDIUM', 'HIGH')][string]$MediaResolutionRequested,
        $MediaResolutionApplied = $null,
        [bool]$VideoScout = $false,
        $StartOffset = $null,
        $EndOffset = $null
    )
    $m = New-VideoScoutManifestBase
    $m.runId                    = $RunId
    $m.videoScout               = [bool]$VideoScout
    $m.url                      = (Get-SanitizedManifestText -Text $Url -MaxLength 2000)
    $m.requestedMode            = $RequestedMode
    $m.appliedMode              = $AppliedMode
    $m.route                    = $Route
    $m.model                    = (Get-SanitizedManifestText -Text $Model -MaxLength 200)
    $m.mediaResolutionRequested = $MediaResolutionRequested
    $m.mediaResolutionApplied   = $MediaResolutionApplied
    $m.startOffsetSeconds       = $StartOffset
    $m.endOffsetSeconds         = $EndOffset
    $m.startedAt                = [DateTime]::UtcNow.ToString('yyyy-MM-ddTHH:mm:ss.fffZ')
    return $m
}

<#
.SYNOPSIS
  Build a BACKFILL manifest for a legacy run directory. Records ONLY what the directory proves; every
  unprovable run fact stays null. Adds the discriminator `backfill` provenance object: canonical
  startedAt stays null, the parsed local run stamp is preserved (explicitly approximate) as
  backfill.startedAtFromDirNameLocal, route is inferred 'cli' with the code-control-flow basis, and
  the fields we inferred are named.
.PARAMETER AppliedMode
  The extension-classified mode (transcript|audio|video) or $null when a directory has zero or mixed
  media types. Media existence never implies analysis success -- outcome/finishedAt/reason stay null
  regardless.
.PARAMETER VideoTitle
  The single filename-derived title (sanitized here). $null when no unambiguous media file exists.
#>
function New-VideoScoutBackfillManifest {
    param(
        [Parameter(Mandatory)][string]$RunId,
        $AppliedMode = $null,
        [string]$VideoTitle = $null,
        [string]$StartedAtFromDirNameLocal = $null,
        [string]$GeneratedAt = $null
    )
    $m = New-VideoScoutManifestBase
    $m.runId = $RunId
    # Structural inference (NOT a media fact): a legacy run directory can only have been created by
    # the CLI route (see $VideoScoutBackfillRouteDetail). Marked as inferred below.
    $m.route = 'cli'
    if ($AppliedMode) { $m.appliedMode = $AppliedMode }
    if (-not [string]::IsNullOrWhiteSpace($VideoTitle)) {
        $m.videoTitle = Get-SanitizedManifestText -Text $VideoTitle -MaxLength 300
    }
    # Everything else stays null: url, model, requestedMode, media resolutions, offsets, startedAt,
    # finishedAt, usage, reportFile, outcome, reason, videoScout. Unknowns are JSON null, never
    # fabricated -- and media existence never implies a terminal outcome.

    $inferred = New-Object System.Collections.Generic.List[string]
    $inferred.Add('route')                                   # always inferred for a backfill
    if ($m.appliedMode) { $inferred.Add('appliedMode') }     # inferred from media extension
    if ($m.videoTitle)  { $inferred.Add('videoTitle') }      # inferred from a media filename

    $gen = if ([string]::IsNullOrWhiteSpace($GeneratedAt)) {
        [DateTime]::UtcNow.ToString('yyyy-MM-ddTHH:mm:ss.fffZ')
    }
    else { $GeneratedAt }

    $m.backfill = [ordered]@{
        source                    = 'legacy-run-directory'
        generatedAt               = $gen
        startedAtApproximate      = $true
        startedAtFromDirNameLocal = $(if ([string]::IsNullOrWhiteSpace($StartedAtFromDirNameLocal)) { $null } else { $StartedAtFromDirNameLocal })
        inferredFields            = $inferred.ToArray()
        routeInference            = [ordered]@{
            value  = 'cli'
            basis  = 'code-control-flow'
            commit = $script:VideoScoutBackfillRouteCommit
            detail = $script:VideoScoutBackfillRouteDetail
        }
    }
    return $m
}

# --- validation helpers (work for both an in-memory [ordered] hashtable and a read-back PSObject) --

function Get-ManifestKeyList {
    param($M)
    if ($null -eq $M) { return @() }
    if ($M -is [System.Collections.IDictionary]) { return @($M.Keys) }
    return @($M.PSObject.Properties.Name)
}

function Test-ManifestHasKey {
    param($M, [string]$Key)
    (Get-ManifestKeyList -M $M) -contains $Key
}

function Get-ManifestValue {
    param($M, [string]$Key)
    if ($M -is [System.Collections.IDictionary]) {
        if ($M.Contains($Key)) { return $M[$Key] } else { return $null }
    }
    $p = $M.PSObject.Properties[$Key]
    if ($p) { return $p.Value } else { return $null }
}

<#
.SYNOPSIS
  Throw (refuse visibly) unless $Manifest is a structurally valid canonical manifest. This is the
  drift gate both writers call BEFORE persisting JSON. Variant is decided by the presence of a
  `backfill` key; each variant has its own nullability contract.
#>
function Assert-VideoScoutManifestValid {
    param([Parameter(Mandatory)]$Manifest)
    if ($null -eq $Manifest) { throw 'Manifest validation failed: manifest is null.' }

    $keys       = Get-ManifestKeyList -M $Manifest
    $baseKeys   = Get-VideoScoutManifestCanonicalKeys
    $isBackfill = $keys -contains 'backfill'
    $expected   = if ($isBackfill) { @($baseKeys + 'backfill') } else { @($baseKeys) }

    $missing = @($expected | Where-Object { $keys -notcontains $_ })
    $extra   = @($keys     | Where-Object { $expected -notcontains $_ })
    if ($missing.Count) { throw "Manifest validation failed: missing key(s): $($missing -join ', ')." }
    if ($extra.Count)   { throw "Manifest validation failed: unknown key(s): $($extra -join ', ')." }

    # local predicate helpers
    $inSet = {
        param($val, $set) ($null -eq $val) -or ($set -contains $val)
    }
    $isNullOrStr = {
        param($val) ($null -eq $val) -or ($val -is [string])
    }
    $isNullOrNonNegInt = {
        param($val) ($null -eq $val) -or (($val -is [int] -or $val -is [long]) -and ([long]$val -ge 0))
    }

    if ((Get-ManifestValue -M $Manifest -Key 'schemaVersion') -ne 1) {
        throw 'Manifest validation failed: schemaVersion must be 1.'
    }
    $runId = Get-ManifestValue -M $Manifest -Key 'runId'
    if ([string]::IsNullOrWhiteSpace([string]$runId)) {
        throw 'Manifest validation failed: runId must be a non-empty string.'
    }

    $videoScout   = Get-ManifestValue -M $Manifest -Key 'videoScout'
    $url          = Get-ManifestValue -M $Manifest -Key 'url'
    $videoTitle   = Get-ManifestValue -M $Manifest -Key 'videoTitle'
    $requestedM   = Get-ManifestValue -M $Manifest -Key 'requestedMode'
    $appliedM     = Get-ManifestValue -M $Manifest -Key 'appliedMode'
    $route        = Get-ManifestValue -M $Manifest -Key 'route'
    $model        = Get-ManifestValue -M $Manifest -Key 'model'
    $resReq       = Get-ManifestValue -M $Manifest -Key 'mediaResolutionRequested'
    $resApp       = Get-ManifestValue -M $Manifest -Key 'mediaResolutionApplied'
    $startOff     = Get-ManifestValue -M $Manifest -Key 'startOffsetSeconds'
    $endOff       = Get-ManifestValue -M $Manifest -Key 'endOffsetSeconds'
    $startedAt    = Get-ManifestValue -M $Manifest -Key 'startedAt'
    $finishedAt   = Get-ManifestValue -M $Manifest -Key 'finishedAt'
    $usage        = Get-ManifestValue -M $Manifest -Key 'usage'
    $reportFile   = Get-ManifestValue -M $Manifest -Key 'reportFile'
    $outcome      = Get-ManifestValue -M $Manifest -Key 'outcome'
    $reason       = Get-ManifestValue -M $Manifest -Key 'reason'

    # Fields common to both variants (shape-checked identically).
    if (-not (& $isNullOrStr $videoTitle)) { throw 'Manifest validation failed: videoTitle must be null or a string.' }
    if (-not (& $inSet $appliedM $script:VideoScoutModes)) { throw "Manifest validation failed: appliedMode must be null or one of $($script:VideoScoutModes -join '/')." }

    # ---- reportFile (V5b1) ----
    # Null is always valid (historical/backfill/failure/refusal/incomplete/non-analysis). A NON-null
    # reportFile must be a bounded leaf filename -- no separators, traversal, drive/UNC prefix,
    # control chars, or bidi controls -- with an approved plain-text extension, and is permitted ONLY
    # on a completed run. This is the single canonical report-field validation (no second validator).
    if ($null -ne $reportFile) {
        if ($reportFile -isnot [string]) { throw 'Manifest validation failed: reportFile must be null or a string.' }
        if ([string]::IsNullOrWhiteSpace($reportFile)) { throw 'Manifest validation failed: reportFile must be null or a non-empty leaf filename.' }
        if ($reportFile.Length -gt $script:VideoScoutReportFileMaxLength) { throw "Manifest validation failed: reportFile exceeds the maximum length of $($script:VideoScoutReportFileMaxLength) characters." }
        if ($reportFile -match '[\\/]') { throw 'Manifest validation failed: reportFile must be a leaf filename, not a path (no separators).' }
        if ($reportFile -match '\.\.') { throw 'Manifest validation failed: reportFile must not contain a traversal sequence (..).' }
        if ($reportFile -match '^[A-Za-z]:' -or $reportFile -match '^[\\/]') { throw 'Manifest validation failed: reportFile must not contain a drive or rooted/UNC prefix.' }
        if ($reportFile -match '[\x00-\x1F\x7F]') { throw 'Manifest validation failed: reportFile must not contain control characters.' }
        # \uXXXX escapes (not literal marks) so the invisible bidi characters don't boobytrap this file.
        if ($reportFile -match '[\u200E\u200F\u202A-\u202E\u2066-\u2069]') { throw 'Manifest validation failed: reportFile must not contain bidi-override characters.' }
        $ext = [System.IO.Path]::GetExtension($reportFile).ToLowerInvariant()
        if ($script:VideoScoutReportExtensions -notcontains $ext) { throw "Manifest validation failed: reportFile must use an approved plain-text extension ($($script:VideoScoutReportExtensions -join ', '))." }
        if ($outcome -ne 'completed') { throw "Manifest validation failed: a non-null reportFile is permitted only with outcome='completed' (got outcome=$(if ($null -eq $outcome) { 'null' } else { "'$outcome'" }))." }
    }

    if (-not $isBackfill) {
        # ---- LIVE contract: ground truth ----
        if ($videoScout -isnot [bool]) { throw 'Manifest validation failed (live): videoScout must be a boolean.' }
        if (-not (& $isNullOrStr $url)) { throw 'Manifest validation failed (live): url must be null or a string.' }
        if (-not (& $inSet $requestedM $script:VideoScoutModes)) { throw 'Manifest validation failed (live): requestedMode must be null or a valid mode.' }
        if ($script:VideoScoutModes -notcontains $appliedM) { throw 'Manifest validation failed (live): appliedMode is required and must be a valid mode.' }
        if ($script:VideoScoutRoutes -notcontains $route) { throw 'Manifest validation failed (live): route must be sdk or cli.' }
        if (-not (& $isNullOrStr $model)) { throw 'Manifest validation failed (live): model must be null or a string.' }
        if ($script:VideoScoutResolutions -notcontains $resReq) { throw 'Manifest validation failed (live): mediaResolutionRequested is required and must be LOW/MEDIUM/HIGH.' }
        if (-not (& $inSet $resApp $script:VideoScoutResolutions)) { throw 'Manifest validation failed (live): mediaResolutionApplied must be null or LOW/MEDIUM/HIGH.' }
        if (-not (& $isNullOrNonNegInt $startOff)) { throw 'Manifest validation failed (live): startOffsetSeconds must be null or a non-negative integer.' }
        if (-not (& $isNullOrNonNegInt $endOff)) { throw 'Manifest validation failed (live): endOffsetSeconds must be null or a non-negative integer.' }
        if ([string]::IsNullOrWhiteSpace([string]$startedAt) -or ([string]$startedAt -notmatch $script:VideoScoutTimestampRe)) {
            throw 'Manifest validation failed (live): startedAt must be a UTC yyyy-MM-ddTHH:mm:ss.fffZ timestamp.'
        }
        if (($null -ne $finishedAt) -and ([string]$finishedAt -notmatch $script:VideoScoutTimestampRe)) {
            throw 'Manifest validation failed (live): finishedAt must be null or a UTC timestamp.'
        }
        if (-not (& $inSet $outcome $script:VideoScoutOutcomes)) { throw "Manifest validation failed (live): outcome must be null or one of $($script:VideoScoutOutcomes -join '/')." }
        if (-not (& $isNullOrStr $reason)) { throw 'Manifest validation failed (live): reason must be null or a string.' }
        if (($null -ne $usage) -and -not (($usage -is [System.Collections.IDictionary]) -or ($usage -is [psobject]))) {
            throw 'Manifest validation failed (live): usage must be null or an object.'
        }
        return
    }

    # ---- BACKFILL contract: only prove what a directory proves; everything else MUST be null ----
    $mustBeNull = [ordered]@{
        videoScout               = $videoScout
        url                      = $url
        requestedMode            = $requestedM
        model                    = $model
        mediaResolutionRequested = $resReq
        mediaResolutionApplied   = $resApp
        startOffsetSeconds       = $startOff
        endOffsetSeconds         = $endOff
        startedAt                = $startedAt
        finishedAt               = $finishedAt
        usage                    = $usage
        reportFile               = $reportFile
        outcome                  = $outcome
        reason                   = $reason
    }
    foreach ($k in $mustBeNull.Keys) {
        if ($null -ne $mustBeNull[$k]) {
            throw "Manifest validation failed (backfill): $k must be null on a backfilled manifest (canonical run facts are not provable from a directory)."
        }
    }
    if ($route -ne 'cli') {
        throw "Manifest validation failed (backfill): route must be the inferred 'cli' (a legacy run directory implies the CLI route)."
    }

    $bf = Get-ManifestValue -M $Manifest -Key 'backfill'
    if ($null -eq $bf) { throw 'Manifest validation failed (backfill): the backfill provenance object is required.' }
    if ((Get-ManifestValue -M $bf -Key 'startedAtApproximate') -ne $true) {
        throw 'Manifest validation failed (backfill): backfill.startedAtApproximate must be $true.'
    }
    $stampLocal = Get-ManifestValue -M $bf -Key 'startedAtFromDirNameLocal'
    if (-not (& $isNullOrStr $stampLocal)) {
        throw 'Manifest validation failed (backfill): backfill.startedAtFromDirNameLocal must be null or a string.'
    }
    if ([string]::IsNullOrWhiteSpace([string](Get-ManifestValue -M $bf -Key 'generatedAt'))) {
        throw 'Manifest validation failed (backfill): backfill.generatedAt is required.'
    }
    if ([string]::IsNullOrWhiteSpace([string](Get-ManifestValue -M $bf -Key 'source'))) {
        throw 'Manifest validation failed (backfill): backfill.source is required.'
    }
    $inferred = @(Get-ManifestValue -M $bf -Key 'inferredFields')
    if ($inferred -notcontains 'route') {
        throw 'Manifest validation failed (backfill): backfill.inferredFields must name route as inferred.'
    }
    $ri = Get-ManifestValue -M $bf -Key 'routeInference'
    if ($null -eq $ri) { throw 'Manifest validation failed (backfill): backfill.routeInference is required.' }
    if ((Get-ManifestValue -M $ri -Key 'value') -ne 'cli') {
        throw 'Manifest validation failed (backfill): backfill.routeInference.value must be cli.'
    }
    if ((Get-ManifestValue -M $ri -Key 'basis') -ne 'code-control-flow') {
        throw 'Manifest validation failed (backfill): backfill.routeInference.basis must be code-control-flow.'
    }
    if ((Get-ManifestValue -M $ri -Key 'commit') -ne $script:VideoScoutBackfillRouteCommit) {
        throw "Manifest validation failed (backfill): backfill.routeInference.commit must be the established pre-V5a SHA $script:VideoScoutBackfillRouteCommit."
    }
    if ([string]::IsNullOrWhiteSpace([string](Get-ManifestValue -M $ri -Key 'detail'))) {
        throw 'Manifest validation failed (backfill): backfill.routeInference.detail (the code-control-flow basis) is required.'
    }
}
