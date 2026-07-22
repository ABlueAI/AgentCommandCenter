<#
.SYNOPSIS
  V5a: versioned, atomic, per-run JSON manifest for accepted video-scout runs -- the durable index
  record the future Analysis Library (V5b) reads and the target format for the later backfill.
.DESCRIPTION
  INVARIANT this module exists to hold: once an accepted launch creates a run directory, that
  directory contains a valid, versioned manifest.json; every update replaces it atomically; a
  partially written JSON file is never observable; and the manifest truthfully reflects the run's
  terminal result (completed / refused / error) -- or records no outcome at all if the process died
  before reaching one (outcome=null + finishedAt=null is the honest "never finalized" state, never
  a fabricated success).

  Lifecycle (wired in feed-gemini.ps1):
    Initialize-VideoScoutRun        -> creates the run dir (via New-VideoScoutRunDir, reused not
                                       rebuilt) AND its initial manifest in one step, so a run dir
                                       without a manifest can only exist if this throws -- and on a
                                       manifest-write failure the just-created EMPTY dir is removed
                                       before the visible throw, keeping the invariant airtight.
    Complete-VideoScoutRunManifest  -> records exactly one terminal outcome; refuses a second.

  Atomicity (Windows/NTFS): the JSON is written to a temp file INSIDE the run directory (same
  volume -- a cross-volume temp would demote the rename to a copy), then swapped into place with
  [IO.File]::Replace (target exists) or [IO.File]::Move (first write). Both are rename-class NTFS
  operations: a reader sees the old complete file or the new complete file, never a torn one.
  There is deliberately NO copy-based fallback -- if the swap fails, this module throws visibly
  (refuse-visibly rule); it never leaves the temp file masquerading as the manifest.

  Untrusted input: URLs, titles, filenames, and provider/exception text are sanitized before they
  enter the manifest (C0 controls + DEL stripped, bidi-override characters stripped, whitespace
  collapsed to one line, length-capped) and any literal GEMINI_API_KEY value is redacted. The
  manifest never stores credentials or raw provider response bodies -- only the short, sanitized
  reason string. Consumers (V5b) must still treat every string here as untrusted display data.

  Encoding: UTF-8 without BOM (PS 5.1's Out-File default is UTF-16, which is why the writer uses
  [IO.File]::WriteAllText with an explicit encoding).
#>

. (Join-Path $PSScriptRoot 'get-video-scout-run-dir.ps1')
# Single canonical schema/validator + the shared sanitizer (Get-SanitizedManifestText),
# New-VideoScoutLiveManifest constructor, and Assert-VideoScoutManifestValid. This live writer and
# the backfill utility MUST build/validate through this one module -- two schema copies would drift
# (the P6 drift class). See lib/video-scout-manifest-schema.ps1.
. (Join-Path $PSScriptRoot 'video-scout-manifest-schema.ps1')

function Get-VideoScoutManifestPath {
    param([Parameter(Mandatory)][string]$RunDir)
    Join-Path $RunDir 'manifest.json'
}

<#
.SYNOPSIS
  Atomically write the manifest object as UTF-8 JSON into $RunDir. Throws visibly on ANY failure;
  never leaves a temp file behind as the manifest and never falls back to a non-atomic write.
.DESCRIPTION
  Validates the manifest against the shared canonical schema BEFORE persisting -- a malformed or
  drifted manifest refuses visibly here rather than reaching disk (the validator is the single gate
  both writers share). This is a create-or-replace writer (live runs update their manifest across a
  run's lifecycle); the backfill utility uses its own create-only writer instead.
#>
function Write-VideoScoutManifestFile {
    param(
        [Parameter(Mandatory)][string]$RunDir,
        [Parameter(Mandatory)]$Manifest
    )
    # Refuse to persist anything that is not a valid canonical manifest (runs before the temp file
    # exists, so an invalid manifest surfaces its own clear validation error and writes nothing).
    Assert-VideoScoutManifestValid -Manifest $Manifest
    $target = Get-VideoScoutManifestPath -RunDir $RunDir
    $tmp = Join-Path $RunDir ('manifest.json.tmp-' + [Guid]::NewGuid().ToString('N'))
    try {
        $json = ConvertTo-Json -InputObject $Manifest -Depth 6
        $enc = New-Object System.Text.UTF8Encoding($false)   # UTF-8, no BOM
        [System.IO.File]::WriteAllText($tmp, $json, $enc)
        if (Test-Path -LiteralPath $target) {
            # Rename-class atomic swap (same volume by construction: tmp lives in the run dir).
            # [NullString]::Value, not $null: PowerShell marshals $null to a .NET string parameter
            # as "", and File.Replace rejects "" as an illegal backup path.
            [System.IO.File]::Replace($tmp, $target, [NullString]::Value)
        }
        else {
            [System.IO.File]::Move($tmp, $target)
        }
    }
    catch {
        if (Test-Path -LiteralPath $tmp) { Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue }
        # Refuse visibly: a run whose manifest cannot be maintained must not look indexed/healthy.
        throw ("Video-scout manifest write FAILED for '$target': $($_.Exception.Message) -- " +
            "this run's manifest is stale or missing and the run must not be treated as indexed.")
    }
    return $target
}

<#
.SYNOPSIS
  Create the run directory AND its initial manifest as one step (the acceptance boundary).
.DESCRIPTION
  Called by feed-gemini.ps1 only after the free, no-IO launch validations (offset pairing/order,
  route backstop) have passed -- i.e. for ACCEPTED launches. Runs the caller refused before this
  point (and renderer-only validation failures) are not library runs and leave no directory.
  The duration guard runs AFTER this on both routes, so guard refusals are durably recorded as
  outcome='refused'. Fields that are unknown at creation stay explicitly null (stable schema shape;
  optional metadata is null, never a missing key or malformed JSON).
#>
function Initialize-VideoScoutRun {
    param(
        [Parameter(Mandatory)][string]$BaseDir,
        [Parameter(Mandatory)][string]$Url,
        # Deliberately untyped: a [string] param would coerce $null to '' (PS 5.1), and the manifest
        # must record explicit JSON null -- not an empty string -- for "not requested / not applied".
        $RequestedMode = $null,   # $null = caller did not pass -Mode (requested nothing explicitly)
        [Parameter(Mandatory)][ValidateSet('transcript', 'audio', 'video')][string]$AppliedMode,
        [Parameter(Mandatory)][ValidateSet('sdk', 'cli')][string]$Route,
        [Parameter(Mandatory)][string]$Model,
        [Parameter(Mandatory)][ValidateSet('LOW', 'MEDIUM', 'HIGH')][string]$MediaResolutionRequested,
        $MediaResolutionApplied = $null,  # untyped for the same reason; null on the CLI route: requested-but-NOT-applied is the truth there
        [bool]$VideoScout = $false,
        [Nullable[int]]$StartOffset = $null,
        [Nullable[int]]$EndOffset = $null,
        # V5b1: the MAIN-issued run ID for an app launch. When provided, the run directory is created
        # from this exact validated ID as a direct child of $BaseDir (New-VideoScoutRunDirFromId).
        # When $null (direct standalone script use outside the app), the existing PowerShell-generated
        # fallback (New-VideoScoutRunDir) applies -- byte-compatible shape, unchanged behavior.
        [string]$RunId = $null
    )
    $runDir = if ([string]::IsNullOrEmpty($RunId)) {
        New-VideoScoutRunDir -BaseDir $BaseDir
    }
    else {
        New-VideoScoutRunDirFromId -BaseDir $BaseDir -RunId $RunId
    }
    # Build the initial live manifest through the SHARED canonical constructor (same module the
    # backfill utility uses), so the two paths cannot drift on keys, order, or sanitization. runId is
    # the run-dir name (already stamped, PID'd, GUID'd unique); unknown-at-creation fields stay null.
    $manifest = New-VideoScoutLiveManifest -RunId (Split-Path $runDir -Leaf) -Url $Url `
        -RequestedMode $RequestedMode -AppliedMode $AppliedMode -Route $Route -Model $Model `
        -MediaResolutionRequested $MediaResolutionRequested -MediaResolutionApplied $MediaResolutionApplied `
        -VideoScout $VideoScout -StartOffset $StartOffset -EndOffset $EndOffset
    try {
        [void](Write-VideoScoutManifestFile -RunDir $runDir -Manifest $manifest)
    }
    catch {
        # Invariant: no run directory without a valid manifest. The dir was created by THIS call
        # moments ago and nothing has run in it, so it is empty; remove it, then fail visibly.
        # (Never recursive/forced on a non-empty dir -- if anything is in there, leave it and let
        # the throw surface the inconsistent state instead.)
        if ((Test-Path -LiteralPath $runDir) -and ($null -eq (Get-ChildItem -LiteralPath $runDir -Force))) {
            Remove-Item -LiteralPath $runDir -Force -ErrorAction SilentlyContinue
        }
        throw
    }
    return [PSCustomObject]@{ RunDir = $runDir; Manifest = $manifest }
}

<#
.SYNOPSIS
  Record the run's single terminal outcome and rewrite the manifest atomically.
.DESCRIPTION
  Exactly-once: a manifest that already has a terminal outcome refuses a second (a logic bug must
  surface, not silently rewrite history). refused/error REQUIRE a reason (sanitized here); a
  completed run stores reason=null. Optional metadata (usage, title, report file) is recorded when
  provided and stays null otherwise.
#>
function Complete-VideoScoutRunManifest {
    param(
        [Parameter(Mandatory)][string]$RunDir,
        [Parameter(Mandatory)]$Manifest,
        [Parameter(Mandatory)][ValidateSet('completed', 'refused', 'error')][string]$Outcome,
        [string]$Reason = $null,
        $Usage = $null,
        [string]$VideoTitle = $null,
        [string]$ReportFile = $null
    )
    if ($null -ne $Manifest.outcome) {
        throw ("Video-scout manifest for '$($Manifest.runId)' already records terminal outcome " +
            "'$($Manifest.outcome)'; refusing to overwrite it with '$Outcome'.")
    }
    if ($Outcome -ne 'completed' -and [string]::IsNullOrWhiteSpace($Reason)) {
        throw "A '$Outcome' outcome requires a reason; refusing to record an unexplained failure."
    }
    $Manifest.outcome = $Outcome
    if ($Outcome -eq 'completed') {
        $Manifest.reason = $null
    }
    else {
        $san = Get-SanitizedManifestText -Text $Reason -MaxLength 500
        $Manifest.reason = if ($san) { $san } else { '(reason contained no representable characters)' }
    }
    $Manifest.finishedAt = [DateTime]::UtcNow.ToString('yyyy-MM-ddTHH:mm:ss.fffZ')
    if ($null -ne $Usage) { $Manifest.usage = $Usage }
    if (-not [string]::IsNullOrWhiteSpace($VideoTitle)) {
        $Manifest.videoTitle = Get-SanitizedManifestText -Text $VideoTitle -MaxLength 300
    }
    if (-not [string]::IsNullOrWhiteSpace($ReportFile)) {
        $Manifest.reportFile = Get-SanitizedManifestText -Text $ReportFile -MaxLength 300
    }
    # In-memory terminal state is set BEFORE the write: if the write throws, the caller's catch can
    # see the outcome is already decided (no double-finalize) and the write failure propagates
    # visibly instead of being papered over by a second attempt.
    [void](Write-VideoScoutManifestFile -RunDir $RunDir -Manifest $Manifest)
    return $Manifest
}

<#
.SYNOPSIS
  Parse gemini-video-sdk.js's machine-readable "[video-scout usage]" stdout line into token counts.
  Pure. Returns $null when no usage line is present (usage is optional manifest metadata); '?'
  placeholders (the SDK's "field missing" marker) become null fields, never fabricated numbers.
#>
function ConvertFrom-VideoScoutUsageLine {
    param($Lines)
    if ($null -eq $Lines) { return $null }
    $m = $null
    foreach ($line in @($Lines)) {
        if ([string]$line -match '\[video-scout usage\] prompt=(\S+) \(video=(\S+) audio=(\S+) text=(\S+)\) output=(\S+) total=(\S+)') {
            $m = $Matches   # keep the LAST usage line (there is normally exactly one)
        }
    }
    if (-not $m) { return $null }
    $asCount = { param($v) if ($v -match '^\d+$') { [long]$v } else { $null } }
    return [ordered]@{
        promptTokens = & $asCount $m[1]
        videoTokens  = & $asCount $m[2]
        audioTokens  = & $asCount $m[3]
        textTokens   = & $asCount $m[4]
        outputTokens = & $asCount $m[5]
        totalTokens  = & $asCount $m[6]
    }
}

<#
.SYNOPSIS
  Classify a caught terminal exception message as 'refused' (our own guards declined the run) or
  'error' (everything else). Pure.
.DESCRIPTION
  Anchored to the START of the message: every refusal message this repo owns begins 'Refusing:'
  (Resolve-DurationGuard) or 'Refused by' (Resolve-NoFileMessage's match-filter backstop case).
  Untrusted strings (titles, provider errors, paths) only ever appear MID-message in those
  templates, so they cannot forge the prefix (the P13 lesson about unanchored substring matching).
#>
function Resolve-ManifestFailureClass {
    param([Parameter(Mandatory)][string]$Message)
    if ($Message -match '^(Refusing:|Refused by )') { return 'refused' }
    return 'error'
}
