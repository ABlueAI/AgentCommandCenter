<#
.SYNOPSIS
  Pester tests for feed-gemini.ps1's section-scoping offset REFUSAL invariant (hotfix).
.DESCRIPTION
  Run with: Invoke-Pester -Path scripts\feed-gemini.Tests.ps1

  Every case here asserts the script THROWS (a terminating error under its own
  $ErrorActionPreference='Stop') rather than silently downgrading to a whole-video analysis. All of
  these throws happen during validation, before any yt-dlp/node/gemini invocation, so the tests
  make no network calls and need no API key. One case additionally runs the script as a child
  `powershell -File` process to prove the throw yields a NON-ZERO exit code (the real-world refusal).
#>
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$feedGemini = Join-Path $here 'feed-gemini.ps1'
$YT = 'https://youtu.be/aqz-KE-bpKQ'

# End-to-end harness for the SDK route (Reviewer finding 1): run the REAL script and prove that when
# the probe reports an over-limit / live / undeterminable source, the SDK route THROWS the guard's
# refusal and NEVER reaches `& node` (the paid call). No network, no API key.
#
# What is real vs. stubbed: route resolution, Assert-DurationGuard, Resolve-DurationGuard, the throw,
# and the `& node` gate all run for real inside feed-gemini.ps1. Only two things are shadowed:
#   - the probe SUBPROCESS -- injected at the Start-Job/Receive-Job layer (a compiled .exe stub is
#     blocked by this machine's Application Control policy, and a .cmd routed through cmd.exe mis-
#     parses the probe's '%(duration)s|%(is_live)s' arg, so stubbing the subprocess is the reliable
#     way to feed a deterministic probe line);
#   - `node` -- a tripwire that drops a marker file iff it is ever invoked.
# A dummy yt-dlp.cmd is placed on PATH only so the script's Get-YtDlpPath resolves; it is never run
# (Start-Job is shadowed). Global overrides are set up and torn down per call so they never leak into
# the offset/ordering tests below (which throw before the probe anyway).
$e2eDir = Join-Path ([System.IO.Path]::GetTempPath()) ("feed-e2e-" + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $e2eDir -Force | Out-Null
$e2eMarker = Join-Path $e2eDir 'node-was-reached.txt'
Set-Content -LiteralPath (Join-Path $e2eDir 'yt-dlp.cmd') -Value "@echo off`r`n" -Encoding ASCII  # dummy; never executed

function Invoke-SdkRouteWithStub {
    # -Mode / -OmitMode: pass a mode through to feed-gemini (or omit -Mode entirely, exercising the
    #   bare -VideoScout video default -- the manifest must then record requestedMode=null).
    # -NodeSucceeds: the node tripwire ALSO emits a realistic "[video-scout usage]" line and exit
    #   code 0, so the V5a completed-outcome path can be proven end-to-end with zero network.
    # Every call gets its own -OutDir under $e2eDir: the V5a manifest work means an ACCEPTED SDK
    #   launch now creates a run directory, and tests must never write into the real downloads dir.
    param([string]$ProbeLine, [switch]$EmptyProbe, [string]$Mode = 'video', [switch]$OmitMode, [switch]$NodeSucceeds)
    Remove-Item -LiteralPath $e2eMarker -Force -ErrorAction SilentlyContinue
    $outDir = Join-Path $e2eDir ('out-' + [Guid]::NewGuid().ToString('N'))
    $global:E2EReceive = if ($EmptyProbe) { $null } else { $ProbeLine }
    $global:E2EMarker = $e2eMarker
    $global:E2ENodeSucceeds = [bool]$NodeSucceeds
    function global:Start-Job   { [PSCustomObject]@{ Id = 1 } }
    function global:Wait-Job    { $true }
    function global:Receive-Job { if ($null -ne $global:E2EReceive) { $global:E2EReceive } }
    function global:Stop-Job    { }
    function global:Remove-Job  { }
    function global:node        {
        Set-Content -LiteralPath $global:E2EMarker -Value 'reached'   # tripwire
        if ($global:E2ENodeSucceeds) {
            '[video-scout usage] prompt=100 (video=80 audio=10 text=10) output=50 total=150 model=stub mediaRes=MEDIUM'
            $global:LASTEXITCODE = 0
        }
    }
    $saved = $env:PATH
    $env:PATH = "$e2eDir;$saved"
    $threw = $false; $msg = ''
    try {
        try {
            if ($OmitMode) { & $feedGemini -Url $script:YT -VideoScout -OutDir $outDir 2>$null | Out-Null }
            else { & $feedGemini -Url $script:YT -VideoScout -Mode $Mode -OutDir $outDir 2>$null | Out-Null }
        }
        catch { $threw = $true; $msg = [string]$_.Exception.Message }
    }
    finally {
        $env:PATH = $saved
        Remove-Item Function:\Start-Job, Function:\Wait-Job, Function:\Receive-Job, Function:\Stop-Job, Function:\Remove-Job, Function:\node -ErrorAction SilentlyContinue
        Remove-Item Variable:\E2EReceive, Variable:\E2EMarker, Variable:\E2ENodeSucceeds -ErrorAction SilentlyContinue
    }
    $reached = Test-Path -LiteralPath $e2eMarker
    return [PSCustomObject]@{ Threw = $threw; Message = $msg; NodeReached = $reached; OutDir = $outDir }
}

# Read the single run manifest an e2e call produced (V5a): expects exactly one run dir in OutDir.
function Get-E2ERunManifest {
    param([string]$OutDir)
    $runDirs = @(Get-ChildItem -LiteralPath $OutDir -Directory -ErrorAction SilentlyContinue)
    if ($runDirs.Count -ne 1) { throw "expected exactly 1 run dir in $OutDir, found $($runDirs.Count)" }
    $path = Join-Path $runDirs[0].FullName 'manifest.json'
    if (-not (Test-Path -LiteralPath $path)) { throw "run dir $($runDirs[0].Name) has no manifest.json" }
    Get-Content -LiteralPath $path -Raw -Encoding UTF8 | ConvertFrom-Json
}

Describe 'feed-gemini.ps1 SDK-route duration enforcement (end-to-end, stub yt-dlp -- finding 1)' {
    It 'REFUSES an over-limit source and NEVER reaches node (the paid call)' {
        $r = Invoke-SdkRouteWithStub -ProbeLine '99999|False'
        $r.Threw | Should Be $true
        $r.Message | Should Match 'exceeds'
        $r.NodeReached | Should Be $false
    }
    It 'REFUSES a live source (is_live) and never reaches node' {
        $r = Invoke-SdkRouteWithStub -ProbeLine '100|True'
        $r.Threw | Should Be $true
        $r.Message | Should Match 'LIVE'
        $r.NodeReached | Should Be $false
    }
    It 'REFUSES an empty/unknown probe result and never reaches node (fail-closed)' {
        $r = Invoke-SdkRouteWithStub -EmptyProbe
        $r.Threw | Should Be $true
        $r.Message | Should Match 'could not determine'
        $r.NodeReached | Should Be $false
    }
}

Describe 'feed-gemini.ps1 -MaxDurationSeconds explicit-0 is rejected at bind time (finding 5)' {
    It 'throws a parameter-binding error on an explicit -MaxDurationSeconds 0' {
        { & $feedGemini -Url $YT -MaxDurationSeconds 0 } | Should Throw 'MaxDurationSeconds'
    }
}

Describe 'feed-gemini.ps1 offset refusal invariant' {

    # 1a — a lone offset is refused (never "ignored, whole video analyzed").
    It 'throws on a lone -StartOffset (no -EndOffset)' {
        { & $feedGemini -Url $YT -VideoScout -StartOffset 10 } | Should Throw 'Both -StartOffset and -EndOffset are required'
    }
    It 'throws on a lone -EndOffset (no -StartOffset)' {
        { & $feedGemini -Url $YT -VideoScout -EndOffset 20 } | Should Throw 'Both -StartOffset and -EndOffset are required'
    }

    # 1b — end must be strictly after start.
    It 'throws when -EndOffset < -StartOffset' {
        { & $feedGemini -Url $YT -VideoScout -StartOffset 100 -EndOffset 50 } | Should Throw 'must be strictly greater'
    }
    It 'throws when -EndOffset == -StartOffset (strictly-after, zero-length slice invalid)' {
        { & $feedGemini -Url $YT -VideoScout -StartOffset 100 -EndOffset 100 } | Should Throw 'must be strictly greater'
    }

    # 1c — route backstop: offsets on a non-SDK (download/CLI) route are refused.
    It 'throws when offsets are given but the run routes to CLI (transcript mode)' {
        { & $feedGemini -Url $YT -VideoScout -Mode transcript -StartOffset 10 -EndOffset 20 } | Should Throw 'only works on the SDK/YouTube route'
    }
    It 'throws when offsets are given but the source is non-YouTube (Vimeo -> CLI route)' {
        { & $feedGemini -Url 'https://vimeo.com/12345' -VideoScout -Mode video -StartOffset 10 -EndOffset 20 } | Should Throw 'only works on the SDK/YouTube route'
    }

    # Entry-point guard: offsets require -VideoScout (they are an SDK/YouTube-route feature).
    It 'throws when offsets are given without -VideoScout' {
        { & $feedGemini -Url $YT -StartOffset 10 -EndOffset 20 } | Should Throw 'only valid with -VideoScout'
    }

    # Non-zero exit code: the throw must surface as a real refusal when run as a script file.
    # Start-Process -Wait -PassThru gives a deterministic .ExitCode; capturing $LASTEXITCODE from a
    # nested `powershell ... 2>$null` is racy in PS 5.1 (the child's stderr can surface in the parent
    # as a NativeCommandError before the exit code is read).
    It 'exits non-zero (not 0) when a lone offset is passed' {
        $p = $null
        try {
            # Start-Process copies the inherited environment through a case-insensitive
            # dictionary in Windows PowerShell 5.1. A host with both Path and PATH then
            # fails before it launches the child. ProcessStartInfo inherits the real
            # environment block directly, so this remains a genuine process-boundary test.
            $psi = New-Object System.Diagnostics.ProcessStartInfo
            $psi.FileName = 'powershell.exe'
            $psi.Arguments = "-NoProfile -NoLogo -ExecutionPolicy Bypass -File `"$feedGemini`" -Url `"$YT`" -VideoScout -StartOffset 10"
            $psi.UseShellExecute = $false
            $psi.RedirectStandardError = $true
            $psi.RedirectStandardOutput = $true
            $p = New-Object System.Diagnostics.Process
            $p.StartInfo = $psi
            [void]$p.Start()
            $p.WaitForExit()
            [void]$p.StandardOutput.ReadToEnd()
            [void]$p.StandardError.ReadToEnd()
            $p.ExitCode | Should Not Be 0
        }
        finally { if ($null -ne $p) { $p.Dispose() } }
    }
}

Describe 'feed-gemini.ps1 ordering: offsets validated BEFORE the duration probe' {
    # The pre-flight probe reads $StartOffset/$EndOffset; it must never be the FIRST thing to touch
    # them. Proof: an invalid offset pairing (or an offsets-on-non-SDK-route combo) throws the
    # OFFSET / route-backstop error from the top-of-script validation -- never a probe/duration error.
    # If the probe had run first it would surface a "Duration guard" / "could not determine" / "exceeds"
    # message (and a network call) instead. All of these throw before any yt-dlp/probe invocation.
    It 'a lone -StartOffset throws the offset error, not a duration/probe error' {
        { & $feedGemini -Url $YT -VideoScout -StartOffset 10 } | Should Throw 'Both -StartOffset and -EndOffset are required'
    }
    It 'offsets on a non-SDK route throw the route-backstop error before any probe' {
        { & $feedGemini -Url $YT -VideoScout -Mode transcript -StartOffset 10 -EndOffset 20 } | Should Throw 'only works on the SDK/YouTube route'
    }
    It 'the new -MaxDurationSeconds parameter does not reorder validation (offset error still first)' {
        { & $feedGemini -Url $YT -VideoScout -StartOffset 10 -MaxDurationSeconds 600 } | Should Throw 'Both -StartOffset and -EndOffset are required'
    }
}

Describe 'feed-gemini.ps1 V5a per-run manifest (end-to-end, stubbed probe/node -- zero network)' {

    It 'an ACCEPTED SDK launch that the duration guard refuses leaves a manifest with outcome=refused' {
        $r = Invoke-SdkRouteWithStub -ProbeLine '99999|False'
        $r.Threw | Should Be $true
        $r.NodeReached | Should Be $false
        $m = Get-E2ERunManifest -OutDir $r.OutDir
        $m.schemaVersion | Should Be 1
        $m.route | Should Be 'sdk'
        $m.videoScout | Should Be $true
        $m.outcome | Should Be 'refused'
        $m.reason | Should Match 'exceeds'
        $m.finishedAt | Should Not Be $null
        $m.usage | Should Be $null
    }

    It 'a successful SDK run finalizes completed, with the usage line parsed into the manifest' {
        $r = Invoke-SdkRouteWithStub -ProbeLine '100|False' -NodeSucceeds
        $r.Threw | Should Be $false
        $r.NodeReached | Should Be $true
        $m = Get-E2ERunManifest -OutDir $r.OutDir
        $m.outcome | Should Be 'completed'
        $m.reason | Should Be $null
        $m.finishedAt | Should Not Be $null
        $m.usage.promptTokens | Should Be 100
        $m.usage.totalTokens | Should Be 150
        # SDK route: media resolution is truly APPLIED, and the manifest says so.
        $m.mediaResolutionRequested | Should Be 'MEDIUM'
        $m.mediaResolutionApplied | Should Be 'MEDIUM'
    }

    It 'records requested-vs-applied mode truthfully (bare -VideoScout: requestedMode=null, appliedMode=video)' {
        $r = Invoke-SdkRouteWithStub -ProbeLine '100|False' -NodeSucceeds -OmitMode
        $m = Get-E2ERunManifest -OutDir $r.OutDir
        $m.requestedMode | Should Be $null
        $m.appliedMode | Should Be 'video'
    }

    It 'records an explicitly requested mode as both requested and applied' {
        $r = Invoke-SdkRouteWithStub -ProbeLine '99999|False'   # refusal is fine; creation happens first
        $m = Get-E2ERunManifest -OutDir $r.OutDir
        $m.requestedMode | Should Be 'video'
        $m.appliedMode | Should Be 'video'
    }

    It 'a CLI-route (transcript) guard refusal also leaves a refused manifest, with mediaResolutionApplied=null' {
        $r = Invoke-SdkRouteWithStub -ProbeLine '99999|False' -Mode transcript
        $r.Threw | Should Be $true
        $r.NodeReached | Should Be $false
        $m = Get-E2ERunManifest -OutDir $r.OutDir
        $m.route | Should Be 'cli'
        $m.appliedMode | Should Be 'transcript'
        $m.outcome | Should Be 'refused'
        $m.mediaResolutionApplied | Should Be $null   # CLI route: requested-but-NOT-applied
        $m.mediaResolutionRequested | Should Be 'MEDIUM'
    }

    It 'a launch refused BEFORE acceptance (lone offset) creates NO run directory and NO manifest' {
        $outDir = Join-Path $e2eDir ('out-' + [Guid]::NewGuid().ToString('N'))
        { & $feedGemini -Url $YT -VideoScout -StartOffset 10 -OutDir $outDir } | Should Throw 'Both -StartOffset and -EndOffset are required'
        # Not a library run: nothing may have been created for it.
        @(Get-ChildItem -LiteralPath $outDir -Directory -ErrorAction SilentlyContinue).Count | Should Be 0
    }

    It 'the manifest file is UTF-8 without BOM and leaves no temp file in the run dir' {
        $r = Invoke-SdkRouteWithStub -ProbeLine '100|False' -NodeSucceeds
        $runDir = @(Get-ChildItem -LiteralPath $r.OutDir -Directory)[0].FullName
        $bytes = [System.IO.File]::ReadAllBytes((Join-Path $runDir 'manifest.json'))
        $bytes[0] | Should Be 0x7B
        @(Get-ChildItem -LiteralPath $runDir -Filter 'manifest.json.tmp-*').Count | Should Be 0
    }
}

# best-effort cleanup of the compiled stub yt-dlp.exe + node tripwire (Pester 3.4 has no AfterAll)
Remove-Item -LiteralPath $e2eDir -Recurse -Force -ErrorAction SilentlyContinue
