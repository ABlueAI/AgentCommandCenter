<#
.SYNOPSIS
  Pester tests for the probe IO extracted into lib/invoke-duration-probe.ps1 (Reviewer finding 1:
  this code was previously untested). Covers Invoke-DurationProbe's output parsing (int / decimal-
  ceil / non-positive / garbage / empty / is_live), the hard-timeout path, the fail-closed fault
  path (finding 3) with its P13 bounded diagnostic, and Assert-DurationGuard's explicit-parameter
  contract (P13), override logging (finding 5) + refuse-on-throw.
.DESCRIPTION
  The job cmdlets (Start-Job/Wait-Job/Receive-Job/...) are shadowed by GLOBAL FUNCTIONS driven by
  $global:Stub* -- command-resolution precedence makes a function win over a cmdlet even inside the
  dot-sourced probe, which is how we inject an exact yt-dlp stdout line, a "did-not-finish" timeout,
  or a spawn fault deterministically (Pester 3.4's Mock does NOT intercept cmdlets called from a
  dot-sourced function, verified). No process spawn, no network, no API key. A real end-to-end spawn
  is proven separately in feed-gemini.Tests.ps1.
  P13: the whole suite body runs inside try/finally so the global stubs are removed even when an
  assertion or setup step throws -- a failed test here must never contaminate a later Pester file
  (feed-gemini.Tests.ps1's end-to-end run needs the REAL Start-Job).
  Run: Invoke-Pester -Path scripts\lib\invoke-duration-probe.Tests.ps1
#>
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
. (Join-Path $here 'invoke-duration-probe.ps1')

# Deterministic job stubs (restored in the finally below, even on a mid-suite throw).
$global:StubReceive     = $null   # what Receive-Job hands back ($null => no output line)
$global:StubFinished    = $true   # Wait-Job result: $true = finished, $false = timed out
$global:StubStartThrows = $false  # Start-Job throws => exercise Invoke-DurationProbe's fault catch
$global:StubThrowMessage = 'simulated probe fault'
function global:Start-Job  { if ($global:StubStartThrows) { throw $global:StubThrowMessage }; [PSCustomObject]@{ Id = 1 } }
function global:Wait-Job   { if ($global:StubFinished) { $true } else { $null } }
function global:Receive-Job { if ($null -ne $global:StubReceive) { $global:StubReceive } }
function global:Stop-Job   { }
function global:Remove-Job { }
function Reset-Stub { $global:StubReceive = $null; $global:StubFinished = $true; $global:StubStartThrows = $false; $global:StubThrowMessage = 'simulated probe fault' }

$U = 'https://example.com/watch?v=x'

try {

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

Describe 'Invoke-DurationProbe: PS-level fault -> structured refusal + ONE bounded diagnostic (P13)' {
    It 'a Start-Job fault is caught and returns Duration=$null (does NOT throw)' {
        Reset-Stub; $global:StubStartThrows = $true
        Mock Write-Host {}
        # assert no-throw, then capture the result separately (a var assigned INSIDE the Should-Not-Throw
        # scriptblock is local to it and would not survive into the It scope).
        { Invoke-DurationProbe -YtDlp 'x' -Url $U -TimeoutSec 5 } | Should Not Throw
        $r = Invoke-DurationProbe -YtDlp 'x' -Url $U -TimeoutSec 5
        $r.Duration | Should Be $null
        $r.TimedOut | Should Be $false
    }
    It 'writes exactly one diagnostic explaining that duration detection itself failed' {
        Reset-Stub; $global:StubStartThrows = $true
        Mock Write-Host {}
        [void](Invoke-DurationProbe -YtDlp 'x' -Url $U -TimeoutSec 5)
        # -Scope It: Pester 3.4's default scope is the whole Describe, which would also count the
        # diagnostics emitted by the previous It's two probe calls.
        Assert-MockCalled Write-Host -Exactly 1 -Scope It -ParameterFilter { $Object -match 'duration probe itself failed' }
    }
    It 'the diagnostic is sanitized and length-bounded: no raw stack, no newlines, no secret, capped' {
        Reset-Stub; $global:StubStartThrows = $true
        # A hostile multi-line message with a fake credential and padding far beyond the cap.
        $global:StubThrowMessage = ("line1`r`nline2 GEMINI-FAKE-SECRET-VALUE at <ScriptBlock>, ps1: line 9`n" + ('X' * 600))
        $script:captured = @()
        Mock Write-Host { $script:captured += [string]$Object }
        [void](Invoke-DurationProbe -YtDlp 'x' -Url $U -TimeoutSec 5)
        $line = ($script:captured | Where-Object { $_ -match 'duration probe itself failed' } | Select-Object -First 1)
        $line | Should Not BeNullOrEmpty
        # bounded: single line (control chars collapsed), capped length, truncation marked
        ($line -match "`n|`r") | Should Be $false
        ($line.Length -lt 320) | Should Be $true
        $line | Should Match '\.\.\.\(truncated\)'
        # only the exception MESSAGE is echoed -- the 600 X's beyond the cap are gone
        ($line -match 'X{300}') | Should Be $false
    }
    It 'the downstream guard still refuses after a probe fault (diagnostic does not soften the refusal)' {
        Reset-Stub; $global:StubStartThrows = $true
        Mock Write-Host {}
        Mock Get-YtDlpPath { 'C:\stub\yt-dlp.exe' }
        { Assert-DurationGuard -Url $U -GuardMode 'video' -ProbeTimeoutSec 5 -MaxDurationSeconds 0 } | Should Throw 'could not determine'
    }
}

Describe 'Assert-DurationGuard: explicit parameters, override logging, refuse-on-throw (P13)' {
    # P13: -ProbeTimeoutSec and -MaxDurationSeconds are declared parameters. FUNCTION deps
    # (Get-YtDlpPath / Invoke-DurationProbe) are Pester-mockable, so this layer uses Mock.
    It 'passes the explicit -ProbeTimeoutSec through to the probe (not an ambient variable)' {
        Mock Get-YtDlpPath { 'C:\stub\yt-dlp.exe' }
        Mock Invoke-DurationProbe { [PSCustomObject]@{ TimedOut = $false; Duration = 100; IsLive = $false } }
        Mock Write-Host {}
        [void](Assert-DurationGuard -Url $U -GuardMode 'video' -ProbeTimeoutSec 42 -MaxDurationSeconds 0)
        Assert-MockCalled Invoke-DurationProbe -Exactly 1 -Scope It -ParameterFilter { $TimeoutSec -eq 42 }
    }
    It 'IGNORES similarly named caller-scope variables (no ambient fallback -- P13 invariant)' {
        # These are exactly the names the pre-P13 code read from caller scope. If any dynamic-scope
        # fallback survived, the probe would see 999 and the override 7200 would apply.
        $ProbeTimeoutSec = 999
        $MaxDurationSeconds = 7200
        Mock Get-YtDlpPath { 'C:\stub\yt-dlp.exe' }
        Mock Invoke-DurationProbe { [PSCustomObject]@{ TimedOut = $false; Duration = 100; IsLive = $false } }
        Mock Write-Host {}
        $guard = Assert-DurationGuard -Url $U -GuardMode 'video'   # deliberately WITHOUT the params
        Assert-MockCalled Invoke-DurationProbe -Exactly 1 -Scope It -ParameterFilter { $TimeoutSec -eq 60 }
        $guard.OverrideUsed | Should Be $false
        $guard.Limit | Should Be 5400
    }
    It 'logs the override line when -MaxDurationSeconds is set and the run is allowed (finding 5)' {
        Mock Get-YtDlpPath { 'C:\stub\yt-dlp.exe' }
        Mock Invoke-DurationProbe { [PSCustomObject]@{ TimedOut = $false; Duration = 100; IsLive = $false } }
        Mock Write-Host {}
        $guard = Assert-DurationGuard -Url $U -GuardMode 'video' -ProbeTimeoutSec 60 -MaxDurationSeconds 7200
        $guard.Allowed | Should Be $true
        $guard.OverrideUsed | Should Be $true
        Assert-MockCalled Write-Host -Exactly 1 -Scope It -ParameterFilter { $Object -match 'override applied' }
    }
    It 'THROWS (refuses) when the guard decision is not allowed' {
        Mock Get-YtDlpPath { 'C:\stub\yt-dlp.exe' }
        Mock Invoke-DurationProbe { [PSCustomObject]@{ TimedOut = $false; Duration = 99999; IsLive = $false } }
        Mock Write-Host {}
        { Assert-DurationGuard -Url $U -GuardMode 'video' -ProbeTimeoutSec 60 -MaxDurationSeconds 0 } | Should Throw 'exceeds'
    }
    It 'returns the allowed guard (no override) for an in-limit source' {
        Mock Get-YtDlpPath { 'C:\stub\yt-dlp.exe' }
        Mock Invoke-DurationProbe { [PSCustomObject]@{ TimedOut = $false; Duration = 100; IsLive = $false } }
        Mock Write-Host {}
        $guard = Assert-DurationGuard -Url $U -GuardMode 'video' -ProbeTimeoutSec 60 -MaxDurationSeconds 0
        $guard.Allowed | Should Be $true
        $guard.OverrideUsed | Should Be $false
    }
    It 'refuses a range outside video mode END TO END through Assert (decision-layer defense)' {
        Mock Get-YtDlpPath { 'C:\stub\yt-dlp.exe' }
        Mock Invoke-DurationProbe { [PSCustomObject]@{ TimedOut = $false; Duration = 100; IsLive = $false } }
        Mock Write-Host {}
        { Assert-DurationGuard -Url $U -GuardMode 'transcript' -HasRange -RangeStart 0 -RangeEnd 60 -ProbeTimeoutSec 60 -MaxDurationSeconds 0 } |
            Should Throw 'only supported in video mode'
    }
}

}
finally {
    # P13 CRITICAL cleanup, now guaranteed even on a mid-suite throw: remove the shadowing functions
    # so the real Start-Job/Receive-Job are restored for any later suite (notably
    # feed-gemini.Tests.ps1's end-to-end run, which spawns a real probe).
    Remove-Item Function:\Start-Job, Function:\Wait-Job, Function:\Receive-Job, Function:\Stop-Job, Function:\Remove-Job -ErrorAction SilentlyContinue
    Remove-Item Variable:\StubReceive, Variable:\StubFinished, Variable:\StubStartThrows, Variable:\StubThrowMessage -ErrorAction SilentlyContinue
}

Describe 'stub hygiene: the global job shadows are gone after this file (P13)' {
    It 'Start-Job resolves back to the real cmdlet, not a leftover function shadow' {
        (Get-Command Start-Job -CommandType Function -ErrorAction SilentlyContinue) | Should Be $null
        (Get-Command Start-Job).CommandType | Should Be 'Cmdlet'
    }
}
