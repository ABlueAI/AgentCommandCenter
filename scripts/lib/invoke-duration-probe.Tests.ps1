<#
.SYNOPSIS
  Pester tests for the probe IO extracted into lib/invoke-duration-probe.ps1 (Reviewer finding 1:
  this code was previously untested). Covers Invoke-DurationProbe's output parsing (int / decimal-
  ceil / non-positive / garbage / empty / is_live), the hard-timeout path, the fail-closed fault
  path (finding 3), and Assert-DurationGuard's override logging (finding 5) + refuse-on-throw.
.DESCRIPTION
  The job cmdlets (Start-Job/Wait-Job/Receive-Job/...) are shadowed by GLOBAL FUNCTIONS driven by
  $global:Stub* -- command-resolution precedence makes a function win over a cmdlet even inside the
  dot-sourced probe, which is how we inject an exact yt-dlp stdout line, a "did-not-finish" timeout,
  or a spawn fault deterministically (Pester 3.4's Mock does NOT intercept cmdlets called from a
  dot-sourced function, verified). No process spawn, no network, no API key. A real end-to-end spawn
  is proven separately in feed-gemini.Tests.ps1.
  Run: Invoke-Pester -Path scripts\lib\invoke-duration-probe.Tests.ps1
#>
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
. (Join-Path $here 'invoke-duration-probe.ps1')

# Deterministic job stubs (removed at the bottom of this file so they never leak into the real
# Start-Job the feed-gemini end-to-end test relies on).
$global:StubReceive     = $null   # what Receive-Job hands back ($null => no output line)
$global:StubFinished    = $true   # Wait-Job result: $true = finished, $false = timed out
$global:StubStartThrows = $false  # Start-Job throws => exercise Invoke-DurationProbe's fault catch
function global:Start-Job  { if ($global:StubStartThrows) { throw 'simulated probe fault' }; [PSCustomObject]@{ Id = 1 } }
function global:Wait-Job   { if ($global:StubFinished) { $true } else { $null } }
function global:Receive-Job { if ($null -ne $global:StubReceive) { $global:StubReceive } }
function global:Stop-Job   { }
function global:Remove-Job { }
function Reset-Stub { $global:StubReceive = $null; $global:StubFinished = $true; $global:StubStartThrows = $false }

$U = 'https://example.com/watch?v=x'

Describe 'Invoke-DurationProbe: output parsing (stubbed job IO -- no process, no network)' {
    It 'parses a plain integer duration + is_live=False' {
        Reset-Stub; $global:StubReceive = '212|False'
        $r = Invoke-DurationProbe -YtDlp 'x' -Url $U -TimeoutSec 30
        $r.Duration | Should Be 212
        $r.IsLive   | Should Be $false
        $r.TimedOut | Should Be $false
    }
    It 'reports is_live=True' {
        Reset-Stub; $global:StubReceive = '3600|True'
        (Invoke-DurationProbe -YtDlp 'x' -Url $U -TimeoutSec 30).IsLive | Should Be $true
    }
    It 'CEILS a fractional duration to the next whole second (5399.5 -> 5400)' {
        Reset-Stub; $global:StubReceive = '5399.5|False'
        (Invoke-DurationProbe -YtDlp 'x' -Url $U -TimeoutSec 30).Duration | Should Be 5400
    }
    It 'ceils a small fraction up to 1 (0.4 -> 1, i.e. NOT rounded down to 0/unknown)' {
        Reset-Stub; $global:StubReceive = '0.4|False'
        (Invoke-DurationProbe -YtDlp 'x' -Url $U -TimeoutSec 30).Duration | Should Be 1
    }
    It 'ceils just over the limit (5400.1 -> 5401)' {
        Reset-Stub; $global:StubReceive = '5400.1|False'
        (Invoke-DurationProbe -YtDlp 'x' -Url $U -TimeoutSec 30).Duration | Should Be 5401
    }
    It 'maps a reported 0 to UNKNOWN ($null), never a 0 that would pass the size gate' {
        Reset-Stub; $global:StubReceive = '0|False'
        (Invoke-DurationProbe -YtDlp 'x' -Url $U -TimeoutSec 30).Duration | Should Be $null
    }
    It 'maps garbage (non-numeric) to UNKNOWN ($null)' {
        Reset-Stub; $global:StubReceive = 'NA|False'
        (Invoke-DurationProbe -YtDlp 'x' -Url $U -TimeoutSec 30).Duration | Should Be $null
    }
    It 'maps empty probe output to UNKNOWN ($null), fail-closed' {
        Reset-Stub; $global:StubReceive = $null
        (Invoke-DurationProbe -YtDlp 'x' -Url $U -TimeoutSec 30).Duration | Should Be $null
    }
}

Describe 'Invoke-DurationProbe: hard timeout -> TimedOut=$true (fail-closed)' {
    It 'a probe that does not finish within the timeout returns TimedOut=$true / Duration=$null' {
        Reset-Stub; $global:StubFinished = $false
        $r = Invoke-DurationProbe -YtDlp 'x' -Url $U -TimeoutSec 1
        $r.TimedOut | Should Be $true
        $r.Duration | Should Be $null
    }
}

Describe 'Invoke-DurationProbe: PS-level fault -> structured refusal, never a raw error (finding 3)' {
    It 'a Start-Job fault is caught and returns Duration=$null (does NOT throw)' {
        Reset-Stub; $global:StubStartThrows = $true
        # assert no-throw, then capture the result separately (a var assigned INSIDE the Should-Not-Throw
        # scriptblock is local to it and would not survive into the It scope).
        { Invoke-DurationProbe -YtDlp 'x' -Url $U -TimeoutSec 5 } | Should Not Throw
        $r = Invoke-DurationProbe -YtDlp 'x' -Url $U -TimeoutSec 5
        $r.Duration | Should Be $null
        $r.TimedOut | Should Be $false
    }
}

Describe 'Assert-DurationGuard: orchestration, override logging, refuse-on-throw' {
    # Assert-DurationGuard reads $ProbeTimeoutSec + $MaxDurationSeconds from caller scope (by design).
    # Its FUNCTION deps (Get-YtDlpPath / Invoke-DurationProbe) are Pester-mockable (functions, unlike
    # the cmdlets above), so this layer uses Mock.
    It 'logs the override line when -MaxDurationSeconds is set and the run is allowed (finding 5)' {
        $ProbeTimeoutSec = 60
        $MaxDurationSeconds = 7200
        Mock Get-YtDlpPath { 'C:\stub\yt-dlp.exe' }
        Mock Invoke-DurationProbe { [PSCustomObject]@{ TimedOut = $false; Duration = 100; IsLive = $false } }
        Mock Write-Host {}
        $guard = Assert-DurationGuard -Url $U -GuardMode 'video'
        $guard.Allowed | Should Be $true
        $guard.OverrideUsed | Should Be $true
        Assert-MockCalled Write-Host -Exactly 1 -ParameterFilter { $Object -match 'override applied' }
    }
    It 'THROWS (refuses) when the guard decision is not allowed' {
        $ProbeTimeoutSec = 60
        $MaxDurationSeconds = 0
        Mock Get-YtDlpPath { 'C:\stub\yt-dlp.exe' }
        Mock Invoke-DurationProbe { [PSCustomObject]@{ TimedOut = $false; Duration = 99999; IsLive = $false } }
        Mock Write-Host {}
        { Assert-DurationGuard -Url $U -GuardMode 'video' } | Should Throw 'exceeds'
    }
    It 'returns the allowed guard (no override) for an in-limit source' {
        $ProbeTimeoutSec = 60
        $MaxDurationSeconds = 0
        Mock Get-YtDlpPath { 'C:\stub\yt-dlp.exe' }
        Mock Invoke-DurationProbe { [PSCustomObject]@{ TimedOut = $false; Duration = 100; IsLive = $false } }
        Mock Write-Host {}
        $guard = Assert-DurationGuard -Url $U -GuardMode 'video'
        $guard.Allowed | Should Be $true
        $guard.OverrideUsed | Should Be $false
    }
}

# CRITICAL cleanup: remove the shadowing functions so the real Start-Job/Receive-Job are restored
# for any later suite (notably feed-gemini.Tests.ps1's end-to-end run, which spawns a real probe).
Remove-Item Function:\Start-Job, Function:\Wait-Job, Function:\Receive-Job, Function:\Stop-Job, Function:\Remove-Job -ErrorAction SilentlyContinue
Remove-Item Variable:\StubReceive, Variable:\StubFinished, Variable:\StubStartThrows -ErrorAction SilentlyContinue
