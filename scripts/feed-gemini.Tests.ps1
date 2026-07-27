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

Describe 'feed-gemini.ps1 -MaxDurationSeconds ceiling is 14400s / four hours (P13)' {
    # Technique: pair the override with a lone -StartOffset. Offset validation throws AFTER
    # parameter binding and BEFORE any probe/network, so the error message tells us exactly which
    # stage rejected the call: a binding failure names MaxDurationSeconds; a successful bind
    # reaches the offset refusal instead. No yt-dlp, no network, no paid call.
    It 'accepts exactly 14400 at bind time (the call proceeds to the later offset refusal)' {
        { & $feedGemini -Url $YT -VideoScout -StartOffset 10 -MaxDurationSeconds 14400 } |
            Should Throw 'Both -StartOffset and -EndOffset are required'
    }
    It 'rejects 14401 at bind time, before any probe or provider operation' {
        { & $feedGemini -Url $YT -VideoScout -StartOffset 10 -MaxDurationSeconds 14401 } | Should Throw 'MaxDurationSeconds'
    }
    It 'rejects the old 86400 ceiling value at bind time (the day-long override is gone)' {
        { & $feedGemini -Url $YT -VideoScout -StartOffset 10 -MaxDurationSeconds 86400 } | Should Throw 'MaxDurationSeconds'
    }
    It 'the unset DEFAULT still binds fine (per-mode defaults stay in effect)' {
        # Reaches the offset refusal with NO override argument at all -> the default (0/unset)
        # passed binding untouched; the per-mode default limits are proven in the guard suites.
        { & $feedGemini -Url $YT -VideoScout -StartOffset 10 } | Should Throw 'Both -StartOffset and -EndOffset are required'
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
        $m.schemaVersion | Should Be 2                       # V5c1: live runs are schema v2
        @($m.mediaArtifacts).Count | Should Be 0             # SDK route records no local media
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

# ==================================================================================================
# V4 bounded multi-slice: end-to-end lifecycle through the REAL feed-gemini.ps1.
# Every refusal must happen BEFORE `& node` (the paid call) -- the node tripwire proves it -- and the
# one accepted case must reach node with the canonical slice JSON as ONE discrete argument and write
# a schema-v3 manifest. No network, no API key, no download: the probe subprocess and node are
# shadowed exactly as in the harness above.
$v4Argv = Join-Path $e2eDir 'node-argv.txt'

function Invoke-SdkSliceRun {
    param(
        [string]$ProbeLine = '3600|False',
        [string]$SliceRangesJson,
        [switch]$OmitSlices,
        [int]$MaxDurationSeconds = 0,
        [string]$Url,
        [switch]$WithScalarRange,
        [switch]$OmitVideoScout,
        [switch]$EmptyProbe
    )
    Remove-Item -LiteralPath $e2eMarker -Force -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $v4Argv -Force -ErrorAction SilentlyContinue
    $outDir = Join-Path $e2eDir ('out-' + [Guid]::NewGuid().ToString('N'))
    $global:E2EReceive = if ($EmptyProbe) { $null } else { $ProbeLine }
    $global:E2EMarker = $e2eMarker
    $global:E2EArgv = $v4Argv
    function global:Start-Job   { [PSCustomObject]@{ Id = 1 } }
    function global:Wait-Job    { $true }
    function global:Receive-Job { if ($null -ne $global:E2EReceive) { $global:E2EReceive } }
    function global:Stop-Job    { }
    function global:Remove-Job  { }
    function global:node        {
        Set-Content -LiteralPath $global:E2EMarker -Value 'reached'
        # Record argv EXACTLY as PowerShell bound it, one element per line, so a test can prove the
        # slice JSON arrived as ONE discrete argument (never split, never a shell string).
        Set-Content -LiteralPath $global:E2EArgv -Value ($args -join "`n") -Encoding UTF8
        '[video-scout usage] prompt=100 (video=80 audio=10 text=10) output=50 total=150 model=stub mediaRes=MEDIUM'
        $global:LASTEXITCODE = 0
    }
    $saved = $env:PATH
    $env:PATH = "$e2eDir;$saved"
    $threw = $false; $msg = ''
    $useUrl = if ($Url) { $Url } else { $script:YT }
    try {
        try {
            $p = @{ Url = $useUrl; Mode = 'video'; OutDir = $outDir }
            if (-not $OmitVideoScout) { $p['VideoScout'] = $true }
            if (-not $OmitSlices) { $p['SliceRangesJson'] = $SliceRangesJson }
            if ($MaxDurationSeconds -gt 0) { $p['MaxDurationSeconds'] = $MaxDurationSeconds }
            if ($WithScalarRange) { $p['StartOffset'] = 5; $p['EndOffset'] = 9 }
            & $feedGemini @p 2>$null | Out-Null
        }
        catch { $threw = $true; $msg = [string]$_.Exception.Message }
    }
    finally {
        $env:PATH = $saved
        Remove-Item Function:\Start-Job, Function:\Wait-Job, Function:\Receive-Job, Function:\Stop-Job, Function:\Remove-Job, Function:\node -ErrorAction SilentlyContinue
        Remove-Item Variable:\E2EReceive, Variable:\E2EMarker, Variable:\E2EArgv -ErrorAction SilentlyContinue
    }
    $argv = if (Test-Path -LiteralPath $v4Argv) { @(Get-Content -LiteralPath $v4Argv -Encoding UTF8) } else { @() }
    return [PSCustomObject]@{
        Threw = $threw; Message = $msg
        NodeReached = (Test-Path -LiteralPath $e2eMarker)
        OutDir = $outDir; Argv = $argv
    }
}

$V4Good = '[{"startOffset":10,"endOffset":30},{"startOffset":60,"endOffset":90}]'

Describe 'V4 feed-gemini: an accepted multi-slice run reaches node with canonical discrete argv' {
    $r = Invoke-SdkSliceRun -SliceRangesJson $V4Good
    It 'does not throw and REACHES node (positive control: the tripwire can fire)' {
        $r.Threw | Should Be $false
        $r.NodeReached | Should Be $true
    }
    It 'passes --slice-ranges-json as ONE discrete argument carrying the canonical JSON' {
        $i = [array]::IndexOf($r.Argv, '--slice-ranges-json')
        $i | Should Not Be -1
        $r.Argv[$i + 1] | Should Be $V4Good
    }
    It 'never passes the scalar --start-offset/--end-offset alongside slices' {
        ($r.Argv -contains '--start-offset') | Should Be $false
        ($r.Argv -contains '--end-offset') | Should Be $false
    }
    It 'writes a schema-v3 manifest recording the REQUESTED slice set with null scalar offsets' {
        $m = Get-E2ERunManifest -OutDir $r.OutDir
        $m.schemaVersion | Should Be 3
        @($m.requestedSliceRanges).Count | Should Be 2
        @($m.requestedSliceRanges)[0].startOffsetSeconds | Should Be 10
        @($m.requestedSliceRanges)[1].endOffsetSeconds | Should Be 90
        $m.startOffsetSeconds | Should BeNullOrEmpty
        $m.endOffsetSeconds | Should BeNullOrEmpty
        $m.route | Should Be 'sdk'
    }
    It 'records an EMPTY media inventory (the multi-slice SDK route owns no local media)' {
        @((Get-E2ERunManifest -OutDir $r.OutDir).mediaArtifacts).Count | Should Be 0
    }
}

Describe 'V4 feed-gemini: every slice-contract violation refuses BEFORE the paid call' {
    It 'REFUSES malformed JSON without reaching node' {
        $r = Invoke-SdkSliceRun -SliceRangesJson '[{"startOffset":10,'
        $r.Threw | Should Be $true
        $r.Message | Should Match 'not valid JSON'
        $r.NodeReached | Should Be $false
    }
    It 'REFUSES an over-2048-unit payload without reaching node' {
        $entries = 0..199 | ForEach-Object { '{"startOffset":1,"endOffset":2}' }
        $r = Invoke-SdkSliceRun -SliceRangesJson ('[' + ($entries -join ',') + ']')
        $r.Threw | Should Be $true
        $r.Message | Should Match '2048-unit bound'
        $r.NodeReached | Should Be $false
    }
    It 'REFUSES a bare JSON object without reaching node' {
        $r = Invoke-SdkSliceRun -SliceRangesJson '{"startOffset":10,"endOffset":30}'
        $r.Threw | Should Be $true
        $r.NodeReached | Should Be $false
    }
    It 'REFUSES a single-entry array without reaching node' {
        $r = Invoke-SdkSliceRun -SliceRangesJson '[{"startOffset":10,"endOffset":30}]'
        $r.Threw | Should Be $true
        $r.Message | Should Match '2 to 8 slices'
        $r.NodeReached | Should Be $false
    }
    It 'REFUSES nine slices without reaching node' {
        $entries = 0..8 | ForEach-Object { '{"startOffset":' + ($_ * 20) + ',"endOffset":' + ($_ * 20 + 10) + '}' }
        $r = Invoke-SdkSliceRun -SliceRangesJson ('[' + ($entries -join ',') + ']')
        $r.Threw | Should Be $true
        $r.NodeReached | Should Be $false
    }
    It 'REFUSES overlapping slices without reaching node' {
        $r = Invoke-SdkSliceRun -SliceRangesJson '[{"startOffset":10,"endOffset":30},{"startOffset":20,"endOffset":40}]'
        $r.Threw | Should Be $true
        $r.Message | Should Match 'chronological and non-overlapping'
        $r.NodeReached | Should Be $false
    }
    It 'REFUSES an over-cap aggregate (1801s) without reaching node' {
        $r = Invoke-SdkSliceRun -SliceRangesJson '[{"startOffset":0,"endOffset":1700},{"startOffset":2000,"endOffset":2101}]'
        $r.Threw | Should Be $true
        $r.Message | Should Match 'exceeds the fixed 1800s'
        $r.NodeReached | Should Be $false
    }
    It 'REFUSES slices combined with the scalar range without reaching node' {
        $r = Invoke-SdkSliceRun -SliceRangesJson $V4Good -WithScalarRange
        $r.Threw | Should Be $true
        $r.Message | Should Match 'mutually exclusive'
        $r.NodeReached | Should Be $false
    }
    It 'REFUSES -MaxDurationSeconds alongside slices without reaching node (the cap is fixed)' {
        $r = Invoke-SdkSliceRun -SliceRangesJson $V4Good -MaxDurationSeconds 3600
        $r.Threw | Should Be $true
        $r.Message | Should Match 'cannot be used with a multi-slice request'
        $r.NodeReached | Should Be $false
    }
    It 'REFUSES slices without -VideoScout without reaching node' {
        $r = Invoke-SdkSliceRun -SliceRangesJson $V4Good -OmitVideoScout
        $r.Threw | Should Be $true
        $r.Message | Should Match 'only valid with -VideoScout'
        $r.NodeReached | Should Be $false
    }
    It 'REFUSES slices on a NON-YouTube source (CLI/download route) without reaching node' {
        $r = Invoke-SdkSliceRun -SliceRangesJson $V4Good -Url 'https://vimeo.com/12345'
        $r.Threw | Should Be $true
        $r.Message | Should Match 'only work on the SDK/YouTube route'
        $r.NodeReached | Should Be $false
    }
}

Describe 'V4 feed-gemini: the fail-closed probe rules still apply to a multi-slice run' {
    It 'REFUSES a LIVE source without reaching node, even with a tiny aggregate' {
        $r = Invoke-SdkSliceRun -SliceRangesJson $V4Good -ProbeLine '3600|True'
        $r.Threw | Should Be $true
        $r.Message | Should Match 'LIVE'
        $r.NodeReached | Should Be $false
    }
    It 'REFUSES an undeterminable duration without reaching node' {
        $r = Invoke-SdkSliceRun -SliceRangesJson $V4Good -EmptyProbe
        $r.Threw | Should Be $true
        $r.Message | Should Match 'could not determine'
        $r.NodeReached | Should Be $false
    }
    It 'ALLOWS a long source when the requested slices are small (gates on aggregate, not duration)' {
        $r = Invoke-SdkSliceRun -SliceRangesJson $V4Good -ProbeLine '18000|False'
        $r.Threw | Should Be $false
        $r.NodeReached | Should Be $true
    }
}

Describe 'V4 feed-gemini: existing whole-video / single-slice behavior is unchanged' {
    It 'a run with NO slice argument still reaches node with no --slice-ranges-json' {
        $r = Invoke-SdkSliceRun -OmitSlices
        $r.Threw | Should Be $false
        $r.NodeReached | Should Be $true
        ($r.Argv -contains '--slice-ranges-json') | Should Be $false
    }
    It 'and still writes a schema-v2 manifest with no requestedSliceRanges key' {
        $r = Invoke-SdkSliceRun -OmitSlices
        $m = Get-E2ERunManifest -OutDir $r.OutDir
        $m.schemaVersion | Should Be 2
        ($m.PSObject.Properties.Name -contains 'requestedSliceRanges') | Should Be $false
    }
}
