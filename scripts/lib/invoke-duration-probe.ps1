<#
.SYNOPSIS
  The IO half of the mode-aware duration guard: locate yt-dlp, run a metadata-only probe (no
  download), and turn the probe + the pure Resolve-DurationGuard decision into an allow/throw.
.DESCRIPTION
  These functions were extracted OUT of feed-gemini.ps1 so they can be dot-sourced and unit-tested
  WITHOUT executing the whole script (Reviewer finding 1: the SDK-route enforcement was previously
  untested). The pure decision logic lives next door in get-duration-guard.ps1, which this file
  dot-sources; see invoke-duration-probe.Tests.ps1 for the probe-parsing / timeout / fault / override
  tests and feed-gemini.Tests.ps1 for the end-to-end SDK-route refusal proof.

  P13: Assert-DurationGuard no longer reads ANYTHING from its caller's scope. -ProbeTimeoutSec and
  -MaxDurationSeconds are explicit parameters (with fail-safe defaults: 60s probe timeout, 0 = no
  override); because they are declared parameters, PowerShell's dynamic scoping can never fall
  through to a similarly named caller variable -- the local always exists. Every caller passes both
  explicitly; invoke-duration-probe.Tests.ps1 proves ambient variables are ignored.
#>

. (Join-Path $PSScriptRoot 'get-duration-guard.ps1')

function Get-YtDlpPath {
    $p = (Get-Command yt-dlp -ErrorAction SilentlyContinue).Source
    if (-not $p) { throw "yt-dlp not found on PATH. Restart your terminal after install, or run: winget install yt-dlp.yt-dlp" }
    return $p
}

# Metadata-only probe (NO download): returns duration (int or $null) + is_live, bounded by a hard
# timeout. Runs yt-dlp in a background job so the timeout is enforceable. Fail-closed in three ways:
#   - a timeout               -> TimedOut=$true, Duration=$null
#   - any PS-level fault       -> Duration=$null (structured, never a raw error; Reviewer finding 3)
#   - a fractional duration    -> ceil to the next whole second (Reviewer finding 4)
#   - a non-positive/garbage   -> Duration=$null i.e. UNKNOWN, so a "0" can never pass the size gate
# `--` precedes the URL so a URL beginning with '-' can't be parsed as a yt-dlp flag (finding 7).
function Invoke-DurationProbe {
    param([string]$YtDlp, [string]$Url, [int]$TimeoutSec)
    try {
        $job = Start-Job -ScriptBlock {
            param($exe, $u)
            & $exe --no-playlist --simulate --no-warnings --print '%(duration)s|%(is_live)s' -- $u 2>$null
        } -ArgumentList $YtDlp, $Url
        $finished = Wait-Job $job -Timeout $TimeoutSec
        if (-not $finished) {
            Stop-Job $job -ErrorAction SilentlyContinue
            Remove-Job $job -Force -ErrorAction SilentlyContinue
            return [PSCustomObject]@{ TimedOut = $true; Duration = $null; IsLive = $false }
        }
        $out = Receive-Job $job 2>$null
        Remove-Job $job -Force -ErrorAction SilentlyContinue
        $line = ($out | Where-Object { $_ -match '\|' } | Select-Object -First 1)
        $dur = $null; $isLive = $false
        if ($line) {
            $parts = ([string]$line) -split '\|'
            # Accept an integer OR decimal ('%(duration)s' can print e.g. 212.0); ceil to whole
            # seconds, then treat <= 0 (and any non-numeric) as UNKNOWN -> $null. This closes the one
            # real fail-open seam: a reported 0 would otherwise satisfy the `-gt limit` check.
            if ($parts[0] -match '^\d+(\.\d+)?$') {
                $ceiled = [int][math]::Ceiling([double]::Parse($parts[0], [Globalization.CultureInfo]::InvariantCulture))
                if ($ceiled -gt 0) { $dur = $ceiled }
            }
            $isLive = ($parts.Count -gt 1 -and $parts[1].Trim() -eq 'True')
        }
        return [PSCustomObject]@{ TimedOut = $false; Duration = $dur; IsLive = $isLive }
    }
    catch {
        # ANY probe fault (job spawn failure, Receive-Job error, an unexpected parse throw) surfaces
        # as the guard's own "could not determine the duration" refusal downstream -- never a raw PS
        # error and never a silent pass. Fail closed: Duration=$null => Resolve => unknown-duration.
        # P13: no longer SILENT -- one bounded diagnostic line first, so "the probe itself broke" is
        # distinguishable from "the source is private/unavailable". Sanitized (control chars
        # collapsed so a crafted message cannot forge extra lines) and length-capped; only the
        # exception MESSAGE -- never a stack trace, command line, environment, or response body.
        $reason = ('' + $_.Exception.Message) -replace '[\x00-\x1f\x7f]+', ' '
        if ($reason.Length -gt 200) { $reason = $reason.Substring(0, 200) + '...(truncated)' }
        Write-Host "Duration guard: the duration probe itself failed (refusing fail-closed): $reason" -ForegroundColor Yellow
        return [PSCustomObject]@{ TimedOut = $false; Duration = $null; IsLive = $false }
    }
}

# Probe + decide + (on refusal) throw. Returns the guard result so the caller can hand the resolved
# limit to the SUBORDINATE --match-filter backstop on the download path. Fails closed on any probe
# problem. P13: -ProbeTimeoutSec and -MaxDurationSeconds (0 = unset) are EXPLICIT parameters --
# declared locals mean dynamic scoping can never silently pick up caller variables of the same name.
function Assert-DurationGuard {
    param([Parameter(Mandatory)][string]$Url, [Parameter(Mandatory)][string]$GuardMode,
        [int]$ProbeTimeoutSec = 60, [int]$MaxDurationSeconds = 0,
        [switch]$HasRange, [int]$RangeStart = 0, [int]$RangeEnd = 0)
    $ytdlpProbe = Get-YtDlpPath
    Write-Host "Duration guard: probing metadata (timeout ${ProbeTimeoutSec}s)..." -ForegroundColor DarkCyan
    $probe = Invoke-DurationProbe -YtDlp $ytdlpProbe -Url $Url -TimeoutSec $ProbeTimeoutSec
    $override = if ($MaxDurationSeconds -gt 0) { [Nullable[int]]$MaxDurationSeconds } else { $null }
    $guard = Resolve-DurationGuard -Mode $GuardMode -HasRange:$HasRange -StartOffset $RangeStart -EndOffset $RangeEnd `
        -DurationSeconds $probe.Duration -IsLive:$probe.IsLive -ProbeTimedOut:$probe.TimedOut -MaxDurationOverride $override
    if ($guard.OverrideUsed) {
        Write-Host "Duration guard: -MaxDurationSeconds=$MaxDurationSeconds override applied (mode=$GuardMode, gate=$($guard.MeasuredKind), limit=$($guard.Limit)s)." -ForegroundColor Yellow
    }
    Write-Host ("Duration guard: mode={0} gate={1} measured={2} limit={3}s -> {4}" -f $GuardMode, $guard.MeasuredKind, $guard.Measured, $guard.Limit, $(if ($guard.Allowed) { 'OK' } else { 'REFUSED' })) -ForegroundColor DarkCyan
    if (-not $guard.Allowed) { throw $guard.Message }
    return $guard
}
