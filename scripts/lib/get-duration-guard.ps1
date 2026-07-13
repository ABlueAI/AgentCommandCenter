<#
.SYNOPSIS
  Mode-aware duration guard for video-scout: decide whether a run may proceed, given a pre-flight
  probe of the source's duration + live status. Pure decision logic (no IO), so it is unit-testable
  without any network call (see get-duration-guard.Tests.ps1). feed-gemini.ps1 does the actual
  yt-dlp probe and calls these.
.DESCRIPTION
  Why a probe and not just yt-dlp's --match-filter: the tiered workflow (a cheap transcript/audio
  pass over a long video -> read it -> analyze only a chosen RANGE with the expensive video pass)
  needs three different limits, and the primary paid path (YouTube video) goes through the SDK
  route which never runs yt-dlp at all. So the limit is enforced by a single pre-flight probe that
  covers BOTH routes; --match-filter remains only as a SUBORDINATE backstop on the download path.

  Fail-closed: an input whose duration cannot be determined (private, age-gated, geo-blocked, live,
  or a probe timeout) is REFUSED, never analyzed. "Unprobed" must never mean "allowed" -- that is the
  fail-open bug this guard exists to prevent, and re-creating it in a new location is the thing to
  guard against.
#>

function Get-DurationLimits {
    # The ONE place the per-mode limits live (seconds). Marked (?) -- tune to taste.
    [PSCustomObject]@{
        TranscriptAudio = 14400   # (?) 4h  -- transcript/audio carry NO visual tokens; cheap, so allow long sources
        VideoNoRange    = 5400    # (?) 90m -- full-visual pass, the expensive path (cap unchanged from before)
        VideoRangeSlice = 1800    # (?) 30m -- video+range gates on SLICE length, NOT source duration
    }
}

<#
.SYNOPSIS
  Decide if a run is allowed. Pure: same inputs -> same result, no IO.
.OUTPUTS
  PSCustomObject { Allowed; Refusal; Message; Limit; Measured; MeasuredKind; Mode; OverrideUsed }
  Refusal is one of '', 'live', 'unknown-duration', 'exceeds-limit'.
.NOTES
  Refusal order is deliberate and fail-closed:
    1. probe timed out           -> unknown-duration (could not determine length)
    2. is_live                   -> live (no bounded duration)
    3. duration not reported     -> unknown-duration (even for a RANGE run: never proceed unprobed)
    4. measured > applicable cap -> exceeds-limit
  For a RANGE run the SIZE gate compares the SLICE length (EndOffset-StartOffset), so a 5h source
  sliced to 10min passes on size -- but step 3 still requires a KNOWN, non-live source, so a range
  over a live/undeterminable input is still refused. That satisfies both "gate on range length" and
  "never proceed on an unprobed input".
#>
function Resolve-DurationGuard {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][ValidateSet('transcript', 'audio', 'video')][string]$Mode,
        [switch]$HasRange,
        [int]$StartOffset = 0,
        [int]$EndOffset = 0,
        [Nullable[int]]$DurationSeconds = $null,   # $null = probe could not report a duration
        [switch]$IsLive,
        [switch]$ProbeTimedOut,
        [Nullable[int]]$MaxDurationOverride = $null # $null = no -MaxDurationSeconds override
    )
    $limits = Get-DurationLimits
    $override = $null -ne $MaxDurationOverride

    if ($HasRange) {
        $kind = 'slice'
        $measured = $EndOffset - $StartOffset
        $limit = if ($override) { [int]$MaxDurationOverride } else { $limits.VideoRangeSlice }
    }
    else {
        $kind = 'source'
        $baseLimit = if ($Mode -eq 'transcript' -or $Mode -eq 'audio') { $limits.TranscriptAudio } else { $limits.VideoNoRange }
        $limit = if ($override) { [int]$MaxDurationOverride } else { $baseLimit }
        $measured = $DurationSeconds
    }
    $ov = if ($override) { ' (overridden via -MaxDurationSeconds)' } else { '' }

    $out = [ordered]@{
        Allowed = $false; Refusal = ''; Message = ''
        Limit = $limit; Measured = $measured; MeasuredKind = $kind; Mode = $Mode; OverrideUsed = $override
    }
    $refuse = {
        param($reason, $msg)
        $out.Refusal = $reason; $out.Message = $msg
        return [PSCustomObject]$out
    }

    # 1. Probe timeout -- could not determine the length at all. Fail closed.
    if ($ProbeTimedOut) {
        return & $refuse 'unknown-duration' (
            "Refusing: the duration probe timed out, so the video's length could not be determined. " +
            "The guard fails closed and will not analyze an unprobed input. (mode=$Mode, limit=${limit}s$ov)")
    }
    # 2. Live stream -- no bounded duration; cannot be capped. Refused for every mode, incl. range.
    if ($IsLive) {
        return & $refuse 'live' (
            "Refusing: this is a LIVE stream (is_live) with no bounded duration, which cannot be safely " +
            "capped. Live inputs are not analyzed. (mode=$Mode)")
    }
    # 3. No usable duration: null (private / age-gated / geo-blocked / unavailable) OR a non-positive
    #    value. A reported 0 or negative is NOT a real length and must NEVER slip through the size gate
    #    below (0 -gt limit is false, which would fail OPEN) -- treat it as unknown and refuse. Fail
    #    closed -- the "never proceed on an unprobed input" rule, which applies to range runs too.
    #    (Reviewer finding 4: this is the one real fail-open seam; the probe parser also maps <=0 to
    #    $null, so this is defense-in-depth at the decision layer.)
    if ($null -eq $DurationSeconds -or $DurationSeconds -le 0) {
        return & $refuse 'unknown-duration' (
            "Refusing: could not determine the video's duration (private, age-gated, geo-blocked, or " +
            "otherwise unavailable, or reported as non-positive). The guard fails closed and will not " +
            "analyze an input whose length is unknown. (mode=$Mode, limit=${limit}s$ov)")
    }
    # 4. Known, non-live source: apply the size gate for this kind.
    if ($measured -gt $limit) {
        if ($kind -eq 'slice') {
            return & $refuse 'exceeds-limit' (
                "Refusing: the requested range is ${measured}s long (${StartOffset}s-${EndOffset}s), which " +
                "exceeds the ${limit}s slice limit$ov. A range bills only for its own length, so narrow the " +
                "range or raise it with -MaxDurationSeconds. (mode=$Mode)")
        }
        return & $refuse 'exceeds-limit' (
            "Refusing: video duration is ${measured}s, which exceeds the ${limit}s limit for mode '$Mode'$ov. " +
            "Use a cheaper -Mode (transcript/audio), analyze only a time range, or raise -MaxDurationSeconds.")
    }

    $out.Allowed = $true
    $out.Message = "Duration guard OK: $kind ${measured}s within ${limit}s (mode=$Mode$ov)."
    return [PSCustomObject]$out
}

<#
.SYNOPSIS
  Choose the accurate "no output file was produced" message. Pure.
.DESCRIPTION
  Distinguishes THREE cases that previously all claimed "yt-dlp's download failed upstream":
    - our own subordinate --match-filter backstop declined it ("does not pass filter" in stdout) --
      NOT an upstream failure; our guard refused (a TOCTOU catch after the probe already passed);
    - transcript mode with no captions available (a normal, expected outcome);
    - a genuine upstream download failure (audio/video), which keeps the original message.
#>
function Resolve-NoFileMessage {
    param(
        [Parameter(Mandatory)][string]$Mode,
        [Parameter(Mandatory)][string]$Pattern,
        [Parameter(Mandatory)][string]$RunDir,
        [string]$YtDlpStdout = '',
        [int]$Limit = 0
    )
    if ($YtDlpStdout -match 'does not pass filter') {
        return "Refused by the yt-dlp duration/live backstop: this download did not pass our own " +
               "match-filter (limit ${Limit}s, mode '$Mode'). Nothing broke on yt-dlp's end -- our own " +
               "guard declined it, most likely because the source changed between the pre-flight probe and " +
               "the download (a live stream that went live, or shifted duration metadata). Raise " +
               "-MaxDurationSeconds, pick a cheaper -Mode, or analyze a time range."
    }
    if ($Mode -eq 'transcript') {
        return "Download produced no $Pattern file in this run's directory ($RunDir). This run's directory " +
               "is isolated (never shared with a prior run), so this is a genuine result, not a stale-file " +
               "mixup. For -Mode transcript this usually means the video has no captions/auto-subs available " +
               "-- try -Mode audio or -Mode video instead."
    }
    return "Download produced no $Pattern file in this run's directory ($RunDir). This run's directory is " +
           "isolated (never shared with a prior run), so this is a genuine failure: yt-dlp's download failed " +
           "upstream -- check the yt-dlp output above."
}
