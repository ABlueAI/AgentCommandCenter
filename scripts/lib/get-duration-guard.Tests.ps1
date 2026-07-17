<#
.SYNOPSIS
  Pester tests for the mode-aware duration guard (lib/get-duration-guard.ps1).
.DESCRIPTION
  Pure decision logic only -- no network, no yt-dlp, no API key. The probe IO that feeds these
  functions (Get-YtDlpPath / Invoke-DurationProbe / Assert-DurationGuard) now lives in
  lib/invoke-duration-probe.ps1 and is tested directly in invoke-duration-probe.Tests.ps1 (probe
  parsing, timeout, fault, override logging) plus feed-gemini.Tests.ps1 (end-to-end SDK-route
  refusal). This file covers only the pure allow/deny policy.
  Run: Invoke-Pester -Path scripts\lib\get-duration-guard.Tests.ps1
#>
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
. (Join-Path $here 'get-duration-guard.ps1')

Describe 'Get-DurationLimits (the ONE place limits are defined)' {
    It 'defines transcript/audio = 4h, video-no-range = 90min, video-range-slice = 30min' {
        $l = Get-DurationLimits
        $l.TranscriptAudio | Should Be 14400
        $l.VideoNoRange    | Should Be 5400
        $l.VideoRangeSlice | Should Be 1800
    }
}

Describe 'Resolve-DurationGuard: per-mode limits' {
    It 'transcript allows up to 4h and refuses beyond' {
        (Resolve-DurationGuard -Mode transcript -DurationSeconds 14400).Allowed | Should Be $true
        $r = Resolve-DurationGuard -Mode transcript -DurationSeconds 14401
        $r.Allowed | Should Be $false
        $r.Refusal | Should Be 'exceeds-limit'
    }
    It 'audio uses the same 4h limit as transcript' {
        (Resolve-DurationGuard -Mode audio -DurationSeconds 14400).Allowed | Should Be $true
        (Resolve-DurationGuard -Mode audio -DurationSeconds 20000).Allowed  | Should Be $false
    }
    It 'video (no range) allows up to 90min and refuses beyond (the expensive path, unchanged cap)' {
        (Resolve-DurationGuard -Mode video -DurationSeconds 5400).Allowed | Should Be $true
        $r = Resolve-DurationGuard -Mode video -DurationSeconds 5401
        $r.Allowed | Should Be $false
        $r.MeasuredKind | Should Be 'source'
    }
    It 'names the actual duration, the limit and the mode in the refusal (message is not a lie)' {
        $r = Resolve-DurationGuard -Mode video -DurationSeconds 9000
        $r.Message | Should Match '9000'
        $r.Message | Should Match '5400'
        $r.Message | Should Match "video"
    }
}

Describe 'Resolve-DurationGuard: video+range gates on SLICE length, not source duration' {
    It 'allows a 10min slice of a 5h source (rejecting on source duration would be the bug)' {
        $r = Resolve-DurationGuard -Mode video -HasRange -StartOffset 0 -EndOffset 600 -DurationSeconds 18000
        $r.Allowed | Should Be $true
        $r.MeasuredKind | Should Be 'slice'
        $r.Measured | Should Be 600
    }
    It 'refuses a slice longer than the 30min slice limit and names the slice length' {
        $r = Resolve-DurationGuard -Mode video -HasRange -StartOffset 0 -EndOffset 3600 -DurationSeconds 18000
        $r.Allowed | Should Be $false
        $r.Refusal | Should Be 'exceeds-limit'
        $r.Message | Should Match '3600'
    }
    It 'allows a slice exactly at the 30min limit' {
        (Resolve-DurationGuard -Mode video -HasRange -StartOffset 60 -EndOffset 1860 -DurationSeconds 18000).Allowed | Should Be $true
    }
}

Describe 'Resolve-DurationGuard: -MaxDurationSeconds override (accepted + flagged, no silent bypass)' {
    It 'raises the limit when the override is larger (and flags OverrideUsed)' {
        $r = Resolve-DurationGuard -Mode video -DurationSeconds 6000 -MaxDurationOverride 7200
        $r.Allowed | Should Be $true
        $r.OverrideUsed | Should Be $true
        $r.Limit | Should Be 7200
    }
    It 'lowers the limit when the override is smaller (still enforced, still flagged)' {
        $r = Resolve-DurationGuard -Mode video -DurationSeconds 120 -MaxDurationOverride 60
        $r.Allowed | Should Be $false
        $r.OverrideUsed | Should Be $true
        $r.Message | Should Match 'overridden'
    }
    It 'applies the override to the range-slice cap too' {
        (Resolve-DurationGuard -Mode video -HasRange -StartOffset 0 -EndOffset 2400 -DurationSeconds 18000 -MaxDurationOverride 3000).Allowed | Should Be $true
    }
    It 'reports OverrideUsed = false when no override is given' {
        (Resolve-DurationGuard -Mode video -DurationSeconds 100).OverrideUsed | Should Be $false
    }
}

Describe 'Resolve-DurationGuard: non-positive + boundary durations (finding 4 -- kill the 0 fail-open)' {
    It 'REFUSES a reported 0-second duration as unknown (0 must NOT pass the size gate)' {
        $r = Resolve-DurationGuard -Mode video -DurationSeconds 0
        $r.Allowed | Should Be $false
        $r.Refusal | Should Be 'unknown-duration'
    }
    It 'REFUSES a negative duration as unknown' {
        (Resolve-DurationGuard -Mode video -DurationSeconds -5).Refusal | Should Be 'unknown-duration'
    }
    It 'ALLOWS a duration exactly at the limit (boundary is inclusive: 5400 is not > 5400)' {
        (Resolve-DurationGuard -Mode video -DurationSeconds 5400).Allowed | Should Be $true
    }
    It 'REFUSES one second over the limit' {
        (Resolve-DurationGuard -Mode video -DurationSeconds 5401).Refusal | Should Be 'exceeds-limit'
    }
    It 'ALLOWS the smallest positive (1s) -- the ceil of a sub-second source' {
        (Resolve-DurationGuard -Mode video -DurationSeconds 1).Allowed | Should Be $true
    }
}

Describe 'Resolve-DurationGuard: fail-closed on undeterminable inputs (never proceed unprobed)' {
    It 'REFUSES when the duration is unknown/null (source mode) with a "could not determine" message' {
        $r = Resolve-DurationGuard -Mode video -DurationSeconds $null
        $r.Allowed | Should Be $false
        $r.Refusal | Should Be 'unknown-duration'
        $r.Message | Should Match 'could not determine'
    }
    It 'REFUSES a live stream (is_live) even when a duration is present' {
        $r = Resolve-DurationGuard -Mode video -DurationSeconds 100 -IsLive
        $r.Allowed | Should Be $false
        $r.Refusal | Should Be 'live'
    }
    It 'REFUSES on a probe timeout, distinct message from exceeds-limit' {
        $r = Resolve-DurationGuard -Mode video -ProbeTimedOut
        $r.Allowed | Should Be $false
        $r.Refusal | Should Be 'unknown-duration'
        $r.Message | Should Match 'timed out'
    }
    It 'REFUSES a RANGE run when the source is undeterminable (fail-closed applies to range too)' {
        (Resolve-DurationGuard -Mode video -HasRange -StartOffset 0 -EndOffset 600 -DurationSeconds $null).Allowed | Should Be $false
    }
    It 'REFUSES a RANGE run on a live source even if the slice is small' {
        (Resolve-DurationGuard -Mode video -HasRange -StartOffset 0 -EndOffset 60 -DurationSeconds 100 -IsLive).Refusal | Should Be 'live'
    }
    It 'the unknown-duration refusal is DISTINCT from the exceeds-limit refusal' {
        $unknown  = Resolve-DurationGuard -Mode video -DurationSeconds $null
        $exceeds  = Resolve-DurationGuard -Mode video -DurationSeconds 9999
        $unknown.Refusal | Should Not Be $exceeds.Refusal
        $unknown.Message | Should Not Match 'exceeds'
    }
}

Describe 'Resolve-NoFileMessage: accurate no-file reason (Problem C)' {
    $reject = "[youtube] abc: Downloading webpage`n[download] Some Title does not pass filter (duration < 5400 & !is_live), skipping .."
    It 'filter-rejection => our own backstop message, NOT "failed upstream"' {
        $m = Resolve-NoFileMessage -Mode video -Pattern '*.mp4' -RunDir 'C:\run' -YtDlpStdout $reject -Limit 5400
        $m | Should Match 'backstop'
        $m | Should Not Match 'failed upstream'
    }
    It 'genuine download failure (video, no filter line) => keeps the "failed upstream" message' {
        $m = Resolve-NoFileMessage -Mode video -Pattern '*.mp4' -RunDir 'C:\run' -YtDlpStdout '[download] network error' -Limit 5400
        $m | Should Match 'failed upstream'
        $m | Should Not Match 'backstop'
    }
    It 'transcript with no captions (no filter line) => the captions message, not "failed upstream"' {
        $m = Resolve-NoFileMessage -Mode transcript -Pattern '*.srt' -RunDir 'C:\run' -YtDlpStdout 'no subtitles' -Limit 14400
        $m | Should Match 'captions'
        $m | Should Not Match 'failed upstream'
    }
}

Describe 'Resolve-DurationGuard: request-shape validation (P13 -- the decision layer defends itself)' {
    It 'refuses a range in transcript mode with range-not-supported-for-mode' {
        $r = Resolve-DurationGuard -Mode transcript -HasRange -StartOffset 0 -EndOffset 60 -DurationSeconds 100
        $r.Allowed | Should Be $false
        $r.Refusal | Should Be 'range-not-supported-for-mode'
    }
    It 'refuses a range in audio mode with range-not-supported-for-mode' {
        $r = Resolve-DurationGuard -Mode audio -HasRange -StartOffset 0 -EndOffset 60 -DurationSeconds 100
        $r.Refusal | Should Be 'range-not-supported-for-mode'
    }
    It 'refuses EQUAL boundaries (end == start) with invalid-range' {
        $r = Resolve-DurationGuard -Mode video -HasRange -StartOffset 120 -EndOffset 120 -DurationSeconds 1000
        $r.Allowed | Should Be $false
        $r.Refusal | Should Be 'invalid-range'
    }
    It 'refuses REVERSED boundaries (end < start) with invalid-range' {
        (Resolve-DurationGuard -Mode video -HasRange -StartOffset 300 -EndOffset 100 -DurationSeconds 1000).Refusal | Should Be 'invalid-range'
    }
    It 'refuses a NEGATIVE start with invalid-range' {
        (Resolve-DurationGuard -Mode video -HasRange -StartOffset -5 -EndOffset 100 -DurationSeconds 1000).Refusal | Should Be 'invalid-range'
    }
    It 'the malformed-range refusal wins even over a probe timeout (request shape first, fail closed)' {
        $r = Resolve-DurationGuard -Mode video -HasRange -StartOffset 100 -EndOffset 100 -DurationSeconds $null -ProbeTimedOut
        $r.Refusal | Should Be 'invalid-range'
    }
    It 'a VALID video range retains current behavior (allowed, gated on slice length)' {
        $r = Resolve-DurationGuard -Mode video -HasRange -StartOffset 60 -EndOffset 660 -DurationSeconds 18000
        $r.Allowed | Should Be $true
        $r.MeasuredKind | Should Be 'slice'
        $r.Measured | Should Be 600
    }
    It 'refusal reasons are the bounded deterministic constants (no free text in Refusal)' {
        (Resolve-DurationGuard -Mode audio -HasRange -StartOffset 0 -EndOffset 1 -DurationSeconds 5).Refusal | Should Be 'range-not-supported-for-mode'
        (Resolve-DurationGuard -Mode video -HasRange -StartOffset 1 -EndOffset 0 -DurationSeconds 5).Refusal | Should Be 'invalid-range'
    }
}

Describe 'Resolve-NoFileMessage: anchored filter-line match (P13 -- titles cannot spoof the phrase)' {
    It 'recognizes the representative yt-dlp rejection line (bracket tag + parenthesized duration filter + skipping)' {
        $real = "[download] My Video does not pass filter (duration < 5400 & !is_live), skipping .."
        (Resolve-NoFileMessage -Mode video -Pattern '*.mp4' -RunDir 'C:\run' -YtDlpStdout $real -Limit 5400) | Should Match 'backstop'
    }
    It 'IGNORES an ordinary title containing the bare phrase (no structured suffix)' {
        $hostile = "[download] Destination: Why this video does not pass filter explained.mp4`nSaved: C:\x\Why_this_video_does_not_pass_filter_explained.mp4"
        $m = Resolve-NoFileMessage -Mode video -Pattern '*.mp4' -RunDir 'C:\run' -YtDlpStdout $hostile -Limit 5400
        $m | Should Not Match 'backstop'
        $m | Should Match 'failed upstream'
    }
    It 'IGNORES the phrase when it appears mid-line without the bracket-tag line anchor' {
        $hostile = "Saved: my clip does not pass filter (duration humor), skipping nothing"
        (Resolve-NoFileMessage -Mode video -Pattern '*.mp4' -RunDir 'C:\run' -YtDlpStdout $hostile -Limit 5400) | Should Not Match 'backstop'
    }
    It 'IGNORES a phrase whose parenthesized part lacks a duration filter (not our backstop shape)' {
        $hostile = "[download] clip does not pass filter (mood check), skipping .."
        (Resolve-NoFileMessage -Mode video -Pattern '*.mp4' -RunDir 'C:\run' -YtDlpStdout $hostile -Limit 5400) | Should Not Match 'backstop'
    }
}
