<#
.SYNOPSIS
  V5b1 bounded STREAMING report collector for video-scout provider output. Pure + unit-testable
  (get-bounded-report.Tests.ps1): no IO, no network, no filesystem. feed-gemini.ps1 feeds it one
  provider stdout line at a time WHILE each line still streams to the pane, so the report artifact
  is captured without ever accumulating an arbitrarily large complete copy of the stream first.
.DESCRIPTION
  Contract this module owns (write-side controls for an untrusted, model-generated report):
    * Maximum persisted report: $Limit UTF-16 code units (default 1,000,000).
    * Keep the BEGINNING of oversized output -- the report-leading TLDR and early sections are the
      most valuable, the opposite of the copy-output collector which keeps the newest.
    * Reserve room for, and append, an explicit truncation marker INSIDE the limit, so the persisted
      file (kept prefix + marker) never exceeds $Limit.
    * Never split a surrogate pair at the cut.
    * Count total input size NUMERICALLY (a running [long]); never build the whole stream to measure.
    * A single enormous line is sliced immediately to what fits -- never copied into another buffer.
    * The collector retains at most $Limit chars plus minimal bounded bookkeeping.
  It does NOT sanitize, interpret, render, or execute the content -- it only bounds and marks it.
  Diagnostics the caller emits from the returned counts must contain counts only, never report text.
#>

$script:BoundedReportDefaultLimit = 1000000
# Fixed reserve (chars) held back from $Limit when truncating, to guarantee room for the marker.
# The marker below is a fixed template plus two integers; even at [long]::MaxValue (19 digits each)
# it is well under this reserve, so persisted length (kept prefix + marker) is always <= $Limit.
$script:BoundedReportMarkerReserve = 200

<#
.SYNOPSIS
  Return the longest surrogate-safe prefix of $Text no longer than $Max code units: if taking the
  first $Max units would strand the HIGH half of a surrogate pair at the end (its LOW half cut off),
  drop that high half (one fewer unit kept, never a broken character).
#>
function Get-SurrogateSafePrefix {
    param([Parameter(Mandatory)][AllowEmptyString()][string]$Text, [Parameter(Mandatory)][int]$Max)
    if ($Max -le 0) { return '' }
    if ($Text.Length -le $Max) { return $Text }
    $prefix = $Text.Substring(0, $Max)
    $last = [int]$prefix[$prefix.Length - 1]
    if ($last -ge 0xD800 -and $last -le 0xDBFF) {
        # trailing high surrogate whose low partner was cut -> drop it
        $prefix = $prefix.Substring(0, $prefix.Length - 1)
    }
    return $prefix
}

<#
.SYNOPSIS
  Create a new bounded report collector (a mutable state hashtable; hashtables are reference types in
  PowerShell, so Add-BoundedReportLine mutates it in place).
#>
function New-BoundedReportCollector {
    param([int]$Limit = $script:BoundedReportDefaultLimit)
    if ($Limit -le 0) { throw "New-BoundedReportCollector: Limit must be a positive integer (got $Limit)." }
    return @{
        Limit     = [int]$Limit
        Builder   = New-Object System.Text.StringBuilder
        Total     = [long]0     # numeric running count of ALL input code units (incl. line separators)
        Truncated = $false
    }
}

<#
.SYNOPSIS
  Add one provider stdout line to the collector. The line is counted (with its reconstructed newline)
  toward Total unconditionally; content is appended to the bounded builder only until $Limit is
  reached, after which the builder is frozen and further input is counted but discarded.
#>
function Add-BoundedReportLine {
    param(
        [Parameter(Mandatory)]$Collector,
        [Parameter(Mandatory)][AllowEmptyString()][string]$Line
    )
    # Reconstruct the stream with '\n' between lines (PowerShell hands us lines without terminators).
    $chunk = $Line + "`n"
    $Collector.Total += [long]$chunk.Length
    if ($Collector.Truncated) { return }               # frozen: keep counting Total, retain nothing more
    $remaining = $Collector.Limit - $Collector.Builder.Length
    if ($remaining -le 0) { $Collector.Truncated = $true; return }
    if ($chunk.Length -le $remaining) {
        [void]$Collector.Builder.Append($chunk)
        return
    }
    # This single line overflows the cap: slice it IMMEDIATELY to exactly what fits (surrogate-safe),
    # append that, and freeze. The remainder of the line is never retained in another buffer.
    $slice = Get-SurrogateSafePrefix -Text $chunk -Max $remaining
    [void]$Collector.Builder.Append($slice)
    $Collector.Truncated = $true
}

<#
.SYNOPSIS
  Finalize the collector into the persisted report text + counts. When truncated, the kept prefix is
  trimmed to leave room for a marker and the marker is appended, so PersistedChars <= Limit.
.OUTPUTS
  [pscustomobject] @{ Text; PersistedChars; TotalChars; Truncated }
#>
function Complete-BoundedReport {
    param([Parameter(Mandatory)]$Collector)
    $kept = $Collector.Builder.ToString()
    if (-not $Collector.Truncated) {
        return [pscustomobject]@{
            Text           = $kept
            PersistedChars = $kept.Length
            TotalChars     = $Collector.Total
            Truncated      = $false
        }
    }
    # Truncated: back off the kept prefix to reserve room for the marker, then append it. The kept
    # length reported in the marker is the ACTUAL sliced length (honest), and the whole persisted
    # string is guaranteed <= Limit.
    $keepMax = [Math]::Max(0, $Collector.Limit - $script:BoundedReportMarkerReserve)
    $keptPrefix = Get-SurrogateSafePrefix -Text $kept -Max $keepMax
    $marker = "`n[... report truncated: kept the first $($keptPrefix.Length) of $($Collector.Total) characters; the full analysis streamed in the pane ...]`n"
    $persisted = $keptPrefix + $marker
    return [pscustomobject]@{
        Text           = $persisted
        PersistedChars = $persisted.Length
        TotalChars     = $Collector.Total
        Truncated      = $true
    }
}
