<#
.SYNOPSIS
  V4 bounded multi-slice: parse + validate the -SliceRangesJson control argument, and compose the
  deterministic multi-slice scope instruction. Pure decision logic (no IO, no network, no provider
  call), so it is fully unit-testable without running feed-gemini.ps1 -- see
  get-video-scout-slice-ranges.Tests.ps1.
.DESCRIPTION
  feed-gemini.ps1 is a documented STANDALONE entry point, so it must re-enforce the whole
  multi-slice contract itself rather than trusting that app/video-scout-args.js validated first.
  The identical contract is enforced independently in THREE places -- the Electron main boundary
  (app/video-scout-args.js), here, and the Node SDK (scripts/gemini-video-sdk.js) -- because each
  is separately reachable and a cost-direction guard must never depend on an upstream layer having
  run.

  Contract (all enforced BEFORE any download, probe result is applied, or provider submission):
    - the serialized argument is bounded at 2048 UTF-16 units, checked BEFORE parsing;
    - it parses as a JSON ARRAY (never an object, string, or scalar);
    - 2..8 entries (1 entry belongs to the scalar -StartOffset/-EndOffset path; 0 = whole video);
    - each entry has EXACTLY the keys startOffset/endOffset;
    - both are whole numbers 0..86400 (no fractions, no strings, no coercion);
    - endOffset is strictly greater than startOffset;
    - entries are chronological and non-overlapping IN THE GIVEN ORDER (adjacent is allowed);
      nothing is ever sorted, merged, deduplicated, or reindexed;
    - the aggregate duration is at most 1800 seconds (fixed; see Assert-MultiSliceOverrideAllowed --
      -MaxDurationSeconds may not raise or obscure this cap).

  Every violation THROWS a bounded, deterministic message. There is no silent downgrade to a
  whole-video run and no trimming of the requested slice set: refusing costs nothing, while
  silently analyzing something other than what was asked spends the user's money.

  PS 5.1 note (load-bearing): ConvertFrom-Json returns PSCustomObject graphs, and a single-element
  JSON array unwraps to a bare object across assignment. Both are handled explicitly below -- a
  non-array payload is REFUSED rather than coerced, and the array is materialized with @() only
  after the array-ness check, so an object can never masquerade as a 1-entry array.
#>

$script:VideoScoutSliceMinCount        = 2
$script:VideoScoutSliceMaxCount        = 8       # deliberately below Gemini's documented 10-video max
$script:VideoScoutSliceMaxOffset       = 86400   # mirrors feed-gemini.ps1 [ValidateRange(0, 86400)]
$script:VideoScoutSliceAggregateCap    = 1800    # FIXED aggregate cap; no override may raise it
$script:VideoScoutSliceJsonMaxUnits    = 2048    # bounds the serialized control argument ONLY
$script:VideoScoutSliceKeys            = @('startOffset', 'endOffset')

<#
.SYNOPSIS
  Parse + validate -SliceRangesJson. Returns an ordered array of PSCustomObjects with exactly
  StartOffset/EndOffset (int), in the caller's original order. Throws on ANY violation.
.OUTPUTS
  PSCustomObject[] -- always materialized with @() by the caller (see Get-VideoScoutSliceRangeSet).
#>
function ConvertFrom-VideoScoutSliceRangesJson {
    [CmdletBinding()]
    param([Parameter(Mandatory)][AllowEmptyString()][AllowNull()]$Json)

    if ($null -eq $Json) { throw 'Slice ranges: -SliceRangesJson was specified with no value; refusing rather than analyzing the whole video.' }
    $text = [string]$Json
    if ([string]::IsNullOrWhiteSpace($text)) { throw 'Slice ranges: -SliceRangesJson is blank; refusing rather than analyzing the whole video.' }
    # Bound BEFORE parsing: never hand an unbounded string to the JSON parser.
    if ($text.Length -gt $script:VideoScoutSliceJsonMaxUnits) {
        throw "Slice ranges: the serialized payload is $($text.Length) units, which exceeds the $($script:VideoScoutSliceJsonMaxUnits)-unit bound. Refusing before parsing."
    }

    try { $parsed = ConvertFrom-Json -InputObject $text -ErrorAction Stop }
    catch { throw 'Slice ranges: -SliceRangesJson is not valid JSON; refusing rather than guessing what was meant.' }

    # Array-ness FIRST. A PSCustomObject (a JSON object) is neither Array nor IList, so a bare
    # object is refused here instead of silently becoming a one-entry set.
    if ($null -eq $parsed) { throw 'Slice ranges: -SliceRangesJson parsed to null; refusing.' }
    if (-not (($parsed -is [System.Array]) -or ($parsed -is [System.Collections.IList]))) {
        throw 'Slice ranges: -SliceRangesJson must be a JSON array of {startOffset, endOffset} objects (a bare object or scalar is refused).'
    }
    $items = @($parsed)
    if ($items.Count -lt $script:VideoScoutSliceMinCount -or $items.Count -gt $script:VideoScoutSliceMaxCount) {
        throw "Slice ranges: $($script:VideoScoutSliceMinCount) to $($script:VideoScoutSliceMaxCount) slices are required (got $($items.Count)). One slice uses -StartOffset/-EndOffset; no slices means the whole video."
    }

    $ranges = New-Object System.Collections.Generic.List[object]
    for ($i = 0; $i -lt $items.Count; $i++) {
        $label = $i + 1
        $entry = $items[$i]
        if ($null -eq $entry) { throw "Slice ranges: slice $label is null." }
        if (($entry -is [System.Array]) -or ($entry -is [System.Collections.IList]) -or ($entry -is [string]) -or ($entry -is [ValueType])) {
            throw "Slice ranges: slice $label must be an object with exactly startOffset and endOffset."
        }
        # Exact key set (order-insensitive), rejecting extra and missing keys alike.
        $keys = @($entry.PSObject.Properties | ForEach-Object { $_.Name })
        $missing = @($script:VideoScoutSliceKeys | Where-Object { $keys -notcontains $_ })
        $extra   = @($keys | Where-Object { $script:VideoScoutSliceKeys -notcontains $_ })
        if ($missing.Count -or $extra.Count) {
            throw "Slice ranges: slice $label must contain exactly the keys startOffset and endOffset (missing: $(if ($missing.Count) { $missing -join ', ' } else { 'none' }); unexpected: $(if ($extra.Count) { $extra -join ', ' } else { 'none' }))."
        }

        # Whole numbers only. ConvertFrom-Json yields Int32/Int64 for integers and Double/Decimal
        # for fractions; a quoted number stays [string]. Reject everything that is not an integral
        # numeric type -- never [int] a fraction (which would silently truncate the request).
        $rawStart = $entry.startOffset
        $rawEnd   = $entry.endOffset
        foreach ($pair in @(@{ N = 'startOffset'; V = $rawStart }, @{ N = 'endOffset'; V = $rawEnd })) {
            $v = $pair.V
            if ($null -eq $v -or -not (($v -is [int]) -or ($v -is [long]) -or ($v -is [System.Int16]) -or ($v -is [byte]))) {
                throw "Slice ranges: slice $label $($pair.N) must be a whole number of seconds from 0 to $($script:VideoScoutSliceMaxOffset) (got $(if ($null -eq $v) { 'null' } else { "'$v'" }))."
            }
            if ([long]$v -lt 0 -or [long]$v -gt $script:VideoScoutSliceMaxOffset) {
                throw "Slice ranges: slice $label $($pair.N) must be from 0 to $($script:VideoScoutSliceMaxOffset) seconds (got $v)."
            }
        }
        $start = [int]$rawStart
        $end   = [int]$rawEnd
        if ($end -le $start) {
            throw "Slice ranges: slice $label end (${end}s) must be strictly after its start (${start}s)."
        }
        if ($i -gt 0) {
            $prev = $ranges[$i - 1]
            if ($start -lt $prev.EndOffset) {
                throw "Slice ranges: slice $label (${start}s-${end}s) must start at or after the end of slice $i ($($prev.StartOffset)s-$($prev.EndOffset)s): slices must be chronological and non-overlapping, and are never reordered or merged."
            }
        }
        $ranges.Add([PSCustomObject]@{ StartOffset = $start; EndOffset = $end }) | Out-Null
    }

    $aggregate = 0
    foreach ($r in $ranges) { $aggregate += ($r.EndOffset - $r.StartOffset) }
    if ($aggregate -gt $script:VideoScoutSliceAggregateCap) {
        throw "Slice ranges: the slices add up to ${aggregate}s, which exceeds the fixed $($script:VideoScoutSliceAggregateCap)s multi-slice cap. This cap cannot be raised with -MaxDurationSeconds; narrow or remove slices."
    }
    return $ranges.ToArray()
}

<#
.SYNOPSIS
  The one entry point feed-gemini.ps1 calls: validate the JSON and return the full slice set with
  its aggregate, or throw. Returns $null when no multi-slice argument was supplied.
#>
function Get-VideoScoutSliceRangeSet {
    [CmdletBinding()]
    param([AllowEmptyString()][AllowNull()][string]$SliceRangesJson, [switch]$Provided)
    if (-not $Provided) { return $null }
    $ranges = @(ConvertFrom-VideoScoutSliceRangesJson -Json $SliceRangesJson)
    $aggregate = 0
    foreach ($r in $ranges) { $aggregate += ($r.EndOffset - $r.StartOffset) }
    return [PSCustomObject]@{
        Ranges           = $ranges
        Count            = $ranges.Count
        AggregateSeconds = $aggregate
    }
}

<#
.SYNOPSIS
  Re-serialize a validated slice set to the canonical compact JSON handed to node as one discrete
  --slice-ranges-json argument. Deliberately rebuilt from the VALIDATED values (never the caller's
  original string), so nothing unvalidated can reach the SDK -- which then re-validates anyway.
#>
function ConvertTo-VideoScoutSliceRangesJson {
    [CmdletBinding()]
    param([Parameter(Mandatory)]$Ranges)
    $parts = foreach ($r in @($Ranges)) {
        '{"startOffset":' + [string][int]$r.StartOffset + ',"endOffset":' + [string][int]$r.EndOffset + '}'
    }
    return '[' + ($parts -join ',') + ']'
}

<#
.SYNOPSIS
  A multi-slice run may not use -MaxDurationSeconds. Throws when an override accompanies slices.
.DESCRIPTION
  The 1800s aggregate cap is FIXED for multi-slice. Silently ignoring an override would be a
  refuse-visibly violation (the user would believe a different cap applied), and honoring it would
  let a run exceed the authorized aggregate spend -- so an explicit override is REFUSED outright.
  The legacy single-slice/whole-video override behavior in get-duration-guard.ps1 is untouched.
#>
function Assert-MultiSliceOverrideAllowed {
    [CmdletBinding()]
    param([int]$MaxDurationSeconds = 0)
    if ($MaxDurationSeconds -gt 0) {
        throw "Slice ranges: -MaxDurationSeconds cannot be used with a multi-slice request. The $($script:VideoScoutSliceAggregateCap)s aggregate cap is fixed for multi-slice runs; remove the override, or narrow the slices."
    }
}

<#
.SYNOPSIS
  The deterministic, repository-owned multi-slice scope instruction appended to the resolved
  prompt. Numbers + fixed text only -- never user text, transport details, or tool-call syntax.
.DESCRIPTION
  AUGMENTS the existing brief exactly like V3a's focus composition: it names the slice count,
  lists the chronological labels and offsets, states that ONLY those slices are authorized, asks
  for per-slice attribution, and explicitly preserves the required report structure (the
  report-leading `## 1. TL;DR`, the V2 per-section TL;DRs, and any V3a focus already composed in).
  Mirrors buildSliceScopeInstruction in scripts/gemini-video-sdk.js -- the SDK route composes it
  there; this function serves the CLI-side composition and the tests that pin the wording contract.
#>
function Add-SliceScopeToPrompt {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][AllowEmptyString()][string]$BasePrompt,
        [Parameter(Mandatory)]$Ranges
    )
    $list = @($Ranges)
    $lines = for ($i = 0; $i -lt $list.Count; $i++) {
        $r = $list[$i]
        "- Slice $($i + 1): $($r.StartOffset)s to $($r.EndOffset)s ($($r.EndOffset - $r.StartOffset)s)"
    }
    $scope = @(
        "--- ANALYSIS SCOPE: $($list.Count) AUTHORIZED VIDEO SLICES ---",
        "This request attaches $($list.Count) time slices of the same video, listed in chronological order. ONLY these explicit slices are authorized for analysis; treat everything outside them as out of scope and do not analyze or speculate about it:"
    ) + $lines + @(
        'Attribute findings to their slice ("Slice 1", "Slice 2", ...) so each slice remains clearly distinguishable throughout the report. Keep the required report structure EXACTLY as instructed above -- the same sections, the same headers, and the report must still begin with `## 1. TL;DR`.'
    )
    return ($BasePrompt + "`n`n" + ($scope -join "`n"))
}
