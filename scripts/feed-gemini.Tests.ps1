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

# V4R: the V4 slice blocks below need ConvertTo-NodeCliArg (the transport escaping) and
# ConvertTo-VideoScoutSliceRangesJson / Get-VideoScoutSliceRangeSet (the canonical serializer) so
# EXPECTED values are computed from the real production helpers, never hand-typed literals.
#
# LANDMINE (found while adding these; disarmed below -- do not re-arm it): the harness functions
# publish their stubs' state as GLOBAL sentinel variables and clean them up with
# `Remove-Item Variable:\<name>`. PowerShell variable names are CASE-INSENSITIVE, so a global named
# `E2EMarker` and this file's script-scope `$e2eMarker` are THE SAME NAME. As soon as ANY .ps1 is
# dot-sourced at this file's scope, that cleanup stops resolving to the global and destroys the
# script-scope `$e2eMarker` instead -- after which every later harness call fails with
# "Cannot bind argument to parameter 'LiteralPath' because it is null" (27 tests, none of them
# actually broken). Confirmed with a minimal two-file repro: identical files, one with a dot-source
# and one without, differing only in whether $e2eMarker survives the second call.
# The sentinel is therefore named `E2EMarkerPath`, which collides with nothing. Keep every global
# sentinel name distinct from every script-scope variable name in this file.
. (Join-Path $here 'lib\get-node-cli-arg.ps1')
. (Join-Path $here 'lib\get-video-scout-slice-ranges.ps1')

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
    $global:E2EMarkerPath = $e2eMarker
    $global:E2ENodeSucceeds = [bool]$NodeSucceeds
    function global:Start-Job   { [PSCustomObject]@{ Id = 1 } }
    function global:Wait-Job    { $true }
    function global:Receive-Job { if ($null -ne $global:E2EReceive) { $global:E2EReceive } }
    function global:Stop-Job    { }
    function global:Remove-Job  { }
    function global:node        {
        Set-Content -LiteralPath $global:E2EMarkerPath -Value 'reached'   # tripwire
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
        Remove-Item Variable:\E2EReceive, Variable:\E2EMarkerPath, Variable:\E2ENodeSucceeds -ErrorAction SilentlyContinue
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

    # 1a â€” a lone offset is refused (never "ignored, whole video analyzed").
    It 'throws on a lone -StartOffset (no -EndOffset)' {
        { & $feedGemini -Url $YT -VideoScout -StartOffset 10 } | Should Throw 'Both -StartOffset and -EndOffset are required'
    }
    It 'throws on a lone -EndOffset (no -StartOffset)' {
        { & $feedGemini -Url $YT -VideoScout -EndOffset 20 } | Should Throw 'Both -StartOffset and -EndOffset are required'
    }

    # 1b â€” end must be strictly after start.
    It 'throws when -EndOffset < -StartOffset' {
        { & $feedGemini -Url $YT -VideoScout -StartOffset 100 -EndOffset 50 } | Should Throw 'must be strictly greater'
    }
    It 'throws when -EndOffset == -StartOffset (strictly-after, zero-length slice invalid)' {
        { & $feedGemini -Url $YT -VideoScout -StartOffset 100 -EndOffset 100 } | Should Throw 'must be strictly greater'
    }

    # 1c â€” route backstop: offsets on a non-SDK (download/CLI) route are refused.
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
        $m.schemaVersion | Should Be 4                       # V4Q: live SDK runs are schema v4
        @($m.mediaArtifacts).Count | Should Be 0             # SDK route records no local media
        @($m.diagnosticArtifacts).Count | Should Be 0        # a guard refusal preserves no diagnostic
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

# V4R portability repair: $e2eDir is DELIBERATELY NOT removed here any more. It holds the
# repository-created yt-dlp.cmd stub, and the V4 lifecycle blocks below run the real feed-gemini.ps1,
# whose Assert-DurationGuard calls Get-YtDlpPath (which THROWS when yt-dlp cannot be resolved).
# Deleting the stub at this point made every V4 lifecycle test silently depend on a MACHINE-INSTALLED
# yt-dlp: green here, "yt-dlp not found on PATH" on a clean machine. Cleanup now happens once at the
# very end of the file, after the last test that uses this directory (Pester 3.4 has no AfterAll).

# ==================================================================================================
# V4 bounded multi-slice: end-to-end lifecycle through the REAL feed-gemini.ps1.
# Every refusal must happen BEFORE `& node` (the paid call) -- the node tripwire proves it -- and the
# one accepted case must reach node with the slice JSON as ONE discrete argument and write a
# schema-v3 manifest. No network, no API key, no download: the probe subprocess and node are
# shadowed exactly as in the harness above.
#
# V4R: what the shadow `node` observes is the TRANSPORT-ESCAPED representation, not the canonical
# JSON. That is correct and load-bearing. A PowerShell `function global:node` receives $sdkArgs
# verbatim -- it never crosses CommandLineToArgvW -- whereas the real node.exe DOES, and reconstructs
# the canonical JSON from the escaped form. Proving the reconstruction therefore requires a real
# native process, which is exactly what scripts/lib/get-node-cli-arg.Tests.ps1 does (with a negative
# control showing the unescaped value loses its quotes). This file proves the complementary half:
# the escaping is applied exactly ONCE, at the boundary, as ONE discrete argv pair.
# (ConvertTo-NodeCliArg / ConvertTo-VideoScoutSliceRangesJson are dot-sourced at the TOP of this
# file -- see the note there; dot-sourcing mid-file, after Describe blocks have already run, breaks
# the harness's shared state.)
$v4Argv = Join-Path $e2eDir 'node-argv.txt'

# V4R portability: return $true when $dir actually contains a yt-dlp launcher. Used to strip any
# MACHINE-INSTALLED yt-dlp out of PATH for the duration of every V4 run, so these tests can only ever
# resolve the repository-created stub in $e2eDir -- i.e. they behave identically on a clean machine.
# Bounded and total: a malformed PATH entry is simply reported as "no yt-dlp here", never a throw.
function Test-DirHasYtDlp {
    param([string]$Dir)
    if ([string]::IsNullOrWhiteSpace($Dir)) { return $false }
    foreach ($leaf in @('yt-dlp.exe', 'yt-dlp.cmd', 'yt-dlp.bat')) {
        try { if (Test-Path -LiteralPath (Join-Path $Dir $leaf) -PathType Leaf) { return $true } }
        catch { return $false }
    }
    return $false
}

function Invoke-SdkSliceRun {
    param(
        [string]$ProbeLine = '3600|False',
        [string]$SliceRangesJson,
        [switch]$OmitSlices,
        [int]$MaxDurationSeconds = 0,
        [string]$Url,
        [switch]$WithScalarRange,
        [switch]$OmitVideoScout,
        [switch]$EmptyProbe,
        # V4R: make the shadow node exit NONZERO so the error-outcome manifest path can be proven.
        # Default 0 keeps every existing accepted-run assertion byte-for-byte unchanged.
        [int]$NodeExit = 0,
        # V4Q: simulate a LOCAL quality rejection exactly as the real SDK performs it -- preserve the
        # rejected body as the fixed leaf inside the supplied --diagnostic-dir, emit the usage line
        # (cost truth survives) plus the ONE machine-readable quality line, and exit non-zero.
        [switch]$QualityReject,
        [string]$QualityCode = 'scope-mismatch',
        [string]$RejectedBody = 'SECRET-REJECTED-PROVIDER-BODY that must never reach a log or a report',
        # Make the stub report an identity that does NOT match what it wrote, to prove the parent
        # process independently re-derives the artifact identity instead of trusting the child.
        [switch]$LieAboutIdentity,
        # Emit the quality line but write NO diagnostic, to prove the verification-failure path.
        [switch]$SkipDiagnosticWrite
    )
    Remove-Item -LiteralPath $e2eMarker -Force -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $v4Argv -Force -ErrorAction SilentlyContinue
    $outDir = Join-Path $e2eDir ('out-' + [Guid]::NewGuid().ToString('N'))
    $global:E2EReceive = if ($EmptyProbe) { $null } else { $ProbeLine }
    $global:E2EMarkerPath = $e2eMarker
    $global:E2EArgv = $v4Argv
    $global:E2ENodeExit = $NodeExit
    $global:E2EQualityReject = [bool]$QualityReject
    $global:E2EQualityCode = $QualityCode
    $global:E2ERejectedBody = $RejectedBody
    $global:E2ELieAboutIdentity = [bool]$LieAboutIdentity
    $global:E2ESkipDiagnosticWrite = [bool]$SkipDiagnosticWrite
    function global:Start-Job   { [PSCustomObject]@{ Id = 1 } }
    function global:Wait-Job    { $true }
    function global:Receive-Job { if ($null -ne $global:E2EReceive) { $global:E2EReceive } }
    function global:Stop-Job    { }
    function global:Remove-Job  { }
    function global:node        {
        Set-Content -LiteralPath $global:E2EMarkerPath -Value 'reached'
        # Record argv EXACTLY as PowerShell bound it, one element per line, so a test can prove the
        # slice JSON arrived as ONE discrete argument (never split, never a shell string).
        Set-Content -LiteralPath $global:E2EArgv -Value ($args -join "`n") -Encoding UTF8
        # V4Q quality rejection: the response ARRIVED and was billed, then failed the local gate.
        # Usage still prints (cost truth), the body is preserved as the fixed leaf, and the one
        # machine-readable quality line reports the artifact identity.
        if ($global:E2EQualityReject) {
            '[video-scout usage] prompt=22406 (video=18410 audio=2240 text=1756) output=3122 total=25528 model=stub mediaRes=MEDIUM slices=2'
            $dd = $null
            for ($i = 0; $i -lt $args.Count; $i++) { if ($args[$i] -eq '--diagnostic-dir') { $dd = [string]$args[$i + 1] } }
            if ($dd -and -not $global:E2ESkipDiagnosticWrite) {
                $enc = New-Object System.Text.UTF8Encoding($false)
                $target = Join-Path $dd 'rejected-response.txt'
                [System.IO.File]::WriteAllText($target, $global:E2ERejectedBody, $enc)
                $bytes = ([System.IO.File]::ReadAllBytes($target)).Length
                $hash = (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLower()
                if ($global:E2ELieAboutIdentity) { $bytes = 999999; $hash = 'f' * 64 }
                "[video-scout quality] rejected code=$($global:E2EQualityCode) file=rejected-response.txt bytes=$bytes sha256=$hash"
            }
            else {
                '[video-scout quality] rejected code=diagnostic-write-failed'
            }
            $global:LASTEXITCODE = 1
            return
        }
        # A nonzero run emits NO usage line -- exactly like the real SDK refusing or failing.
        if ($global:E2ENodeExit -eq 0) {
            '[video-scout usage] prompt=100 (video=80 audio=10 text=10) output=50 total=150 model=stub mediaRes=MEDIUM'
        }
        $global:LASTEXITCODE = $global:E2ENodeExit
    }
    $saved = $env:PATH
    # V4R portability: prepend the stub dir AND drop every PATH entry that carries a real yt-dlp, so
    # Get-YtDlpPath can only resolve the repository-created stub. Without this the suite passed only
    # on machines that happened to have yt-dlp installed.
    $cleanPath = @($saved -split ';' | Where-Object { $_ -and -not (Test-DirHasYtDlp -Dir $_) })
    $env:PATH = (@($e2eDir) + $cleanPath) -join ';'
    # Record what yt-dlp actually resolves to under that PATH, so a tripwire test can assert the V4
    # lifecycle never silently used a machine-installed binary.
    $resolvedYtDlp = (Get-Command yt-dlp -ErrorAction SilentlyContinue).Source
    $threw = $false; $msg = ''
    $useUrl = if ($Url) { $Url } else { $script:YT }
    try {
        try {
            $p = @{ Url = $useUrl; Mode = 'video'; OutDir = $outDir }
            if (-not $OmitVideoScout) { $p['VideoScout'] = $true }
            if (-not $OmitSlices) { $p['SliceRangesJson'] = $SliceRangesJson }
            if ($MaxDurationSeconds -gt 0) { $p['MaxDurationSeconds'] = $MaxDurationSeconds }
            if ($WithScalarRange) { $p['StartOffset'] = 5; $p['EndOffset'] = 9 }
            # V4Q: CAPTURE the run's own output (stdout + stderr) instead of discarding it, so a test
            # can prove a rejected provider body never reaches the pane or the Logs tab.
            $captured = (& $feedGemini @p 2>&1 | Out-String)
        }
        catch { $threw = $true; $msg = [string]$_.Exception.Message }
    }
    finally {
        $env:PATH = $saved
        Remove-Item Function:\Start-Job, Function:\Wait-Job, Function:\Receive-Job, Function:\Stop-Job, Function:\Remove-Job, Function:\node -ErrorAction SilentlyContinue
        Remove-Item Variable:\E2EReceive, Variable:\E2EMarkerPath, Variable:\E2EArgv, Variable:\E2ENodeExit -ErrorAction SilentlyContinue
        Remove-Item Variable:\E2EQualityReject, Variable:\E2EQualityCode, Variable:\E2ERejectedBody, Variable:\E2ELieAboutIdentity, Variable:\E2ESkipDiagnosticWrite -ErrorAction SilentlyContinue
    }
    $argv = if (Test-Path -LiteralPath $v4Argv) { @(Get-Content -LiteralPath $v4Argv -Encoding UTF8) } else { @() }
    return [PSCustomObject]@{
        Threw = $threw; Message = $msg
        NodeReached = (Test-Path -LiteralPath $e2eMarker)
        OutDir = $outDir; Argv = $argv
        ResolvedYtDlp = $resolvedYtDlp
        Output = [string]$captured
    }
}

$V4Good = '[{"startOffset":10,"endOffset":30},{"startOffset":60,"endOffset":90}]'

Describe 'V4 feed-gemini: an accepted multi-slice run reaches node with canonical discrete argv' {
    $r = Invoke-SdkSliceRun -SliceRangesJson $V4Good
    It 'does not throw and REACHES node (positive control: the tripwire can fire)' {
        $r.Threw | Should Be $false
        $r.NodeReached | Should Be $true
    }
    It 'passes --slice-ranges-json as ONE discrete argument carrying the TRANSPORT-ESCAPED value' {
        # V4R: a PowerShell shadow function receives $sdkArgs verbatim, so it sees the escaped form.
        # Real node.exe reconstructs the canonical JSON from exactly this string -- proven natively in
        # scripts/lib/get-node-cli-arg.Tests.ps1, which also shows the UNESCAPED value losing its quotes.
        $i = [array]::IndexOf($r.Argv, '--slice-ranges-json')
        $i | Should Not Be -1
        $r.Argv[$i + 1] | Should Be (ConvertTo-NodeCliArg -Arg $V4Good)
    }
    It 'escapes the slice payload EXACTLY ONCE (no double escaping, no raw quotes on the wire)' {
        $i = [array]::IndexOf($r.Argv, '--slice-ranges-json')
        $sent = [string]$r.Argv[$i + 1]
        # Once: every quote is \" -- never \\" (a doubly-escaped backslash) and never a bare ".
        $sent | Should Match '\\"startOffset\\":10'
        ($sent -match '\\\\"') | Should Be $false
        ($sent -match '(?<!\\)"')  | Should Be $false
        $sent | Should Not Be (ConvertTo-NodeCliArg -Arg (ConvertTo-NodeCliArg -Arg $V4Good))
    }
    It 'derives the escaped value from the CANONICAL validated JSON, not the callers raw string' {
        # The canonical form is rebuilt from the validated slice set, so the escaped wire value must
        # be exactly the escaping of that canonical text -- nothing else can have reached the wire.
        $i = [array]::IndexOf($r.Argv, '--slice-ranges-json')
        $r.Argv[$i + 1] | Should Be (ConvertTo-NodeCliArg -Arg (ConvertTo-VideoScoutSliceRangesJson -Ranges (Get-VideoScoutSliceRangeSet -SliceRangesJson $V4Good -Provided).Ranges))
    }
    It 'never passes the scalar --start-offset/--end-offset alongside slices' {
        ($r.Argv -contains '--start-offset') | Should Be $false
        ($r.Argv -contains '--end-offset') | Should Be $false
    }
    It 'writes a schema-v4 manifest recording the REQUESTED slice set with null scalar offsets' {
        $m = Get-E2ERunManifest -OutDir $r.OutDir
        $m.schemaVersion | Should Be 4
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
    It 'and still writes a schema-v4 manifest whose slice set is NULL (scalar offsets stay authoritative)' {
        $r = Invoke-SdkSliceRun -OmitSlices
        $m = Get-E2ERunManifest -OutDir $r.OutDir
        $m.schemaVersion | Should Be 4
        $m.requestedSliceRanges | Should BeNullOrEmpty
    }
}

# --- V4R: a VALID multi-slice run whose SDK exits NONZERO ----------------------------------------
# This is the exact shape of the failed human acceptance attempt: everything upstream was correct,
# node was reached, and the SDK refused LOCALLY (before any provider submission). The manifest must
# record that honestly -- an error outcome with a bounded, attribution-NEUTRAL reason. The old text
# asserted an "upstream API/network error", which the PowerShell parent cannot prove and which
# actively misdirected the diagnosis of the transport defect.
Describe 'V4R feed-gemini: a nonzero SDK exit is recorded truthfully, never blamed on the provider' {
    $r = Invoke-SdkSliceRun -SliceRangesJson $V4Good -NodeExit 1
    $m = Get-E2ERunManifest -OutDir $r.OutDir

    It 'reaches node (the run was accepted; the failure is downstream of every guard)' {
        $r.Threw | Should Be $false
        $r.NodeReached | Should Be $true
    }
    It 'records outcome=error' {
        $m.outcome | Should Be 'error'
    }
    It 'leaves usage and reportFile null (partial streamed output is never a saved report)' {
        $m.usage | Should BeNullOrEmpty
        $m.reportFile | Should BeNullOrEmpty
    }
    It 'states the exit code and points at the visible output' {
        $m.reason | Should Match 'gemini-video-sdk\.js exited with code 1'
        $m.reason | Should Match 'see the run output above'
    }
    It 'does NOT claim an upstream API/network error it cannot prove' {
        ($m.reason -match 'upstream') | Should Be $false
        ($m.reason -match 'API/network') | Should Be $false
    }
    It 'keeps the reason bounded and free of the slice payload' {
        $m.reason.Length | Should BeLessThan 500
        ($m.reason -match 'startOffset') | Should Be $false
    }
    It 'still records the requested schema-v4 scope and an empty media inventory' {
        $m.schemaVersion | Should Be 4
        @($m.requestedSliceRanges).Count | Should Be 2
        @($m.mediaArtifacts).Count | Should Be 0
        # A NON-quality nonzero exit preserves no diagnostic: there was no rejected response.
        @($m.diagnosticArtifacts).Count | Should Be 0
    }
}

# --- V4R: portability tripwire -------------------------------------------------------------------
# The V4 lifecycle blocks above previously ran only because the machine happened to have yt-dlp
# installed (the stub directory was deleted before they started). Prove the stub is what resolves.
Describe 'V4R feed-gemini: the V4 lifecycle resolves the TEST stub yt-dlp, never a machine install' {
    $r = Invoke-SdkSliceRun -SliceRangesJson $V4Good

    It 'resolved a yt-dlp at all (Get-YtDlpPath would otherwise throw before any V4 assertion)' {
        $r.ResolvedYtDlp | Should Not BeNullOrEmpty
    }
    It 'resolved the repository-created stub inside the test directory' {
        (Split-Path -Parent $r.ResolvedYtDlp) | Should Be $e2eDir
        (Split-Path -Leaf $r.ResolvedYtDlp) | Should Be 'yt-dlp.cmd'
    }
    It 'the stub still exists (it is never deleted before the tests that need it)' {
        (Test-Path -LiteralPath (Join-Path $e2eDir 'yt-dlp.cmd') -PathType Leaf) | Should Be $true
    }
    It 'a machine-installed yt-dlp is filtered out of PATH for these runs' {
        # Test-DirHasYtDlp is what performs the filtering; prove it actually detects a yt-dlp dir.
        (Test-DirHasYtDlp -Dir $e2eDir) | Should Be $true
        (Test-DirHasYtDlp -Dir (Join-Path $e2eDir 'no-such-dir')) | Should Be $false
        (Test-DirHasYtDlp -Dir '') | Should Be $false
    }
}

. (Join-Path $here 'lib\video-scout-manifest-schema.ps1')

# --- V4Q: the LOCAL quality-rejection lifecycle ---------------------------------------------------
# The response arrived and was paid for, then failed the deterministic gate. This block proves the
# PowerShell side of the invariant end to end: the body is preserved as evidence, the run is a
# terminal error with NO report, usage survives, the diagnostic is recorded ONLY after this process
# independently re-derives its identity, and the rejected content never reaches a log or a report.
Describe 'V4Q feed-gemini: a quality-rejected response is preserved as evidence, never as output' {
    $r = Invoke-SdkSliceRun -SliceRangesJson $V4Good -QualityReject
    $m = Get-E2ERunManifest -OutDir $r.OutDir
    $runDir = (Get-ChildItem -LiteralPath $r.OutDir -Directory | Select-Object -First 1).FullName

    It 'the SDK was reached and the run ends as a terminal ERROR' {
        $r.NodeReached | Should Be $true
        $m.outcome | Should Be 'error'
        $m.finishedAt | Should Not BeNullOrEmpty
    }
    It 'NO report is persisted (a rejected response is never a report)' {
        $m.reportFile | Should BeNullOrEmpty
        (Test-Path -LiteralPath (Join-Path $runDir 'analysis-output.txt')) | Should Be $false
    }
    It 'the reason carries the allowlisted [quality:<code>] marker and no provider text' {
        $m.reason | Should Match '^\[quality:scope-mismatch\]'
        ($m.reason -match 'SECRET-REJECTED-PROVIDER-BODY') | Should Be $false
        $m.reason.Length | Should BeLessThan 500
    }
    It 'USAGE is preserved (the rejected run still cost money and the manifest says so)' {
        $m.usage | Should Not BeNullOrEmpty
        $m.usage.videoTokens | Should Be 18410
        $m.usage.audioTokens | Should Be 2240
        $m.usage.totalTokens | Should Be 25528
    }
    It 'the diagnostic is preserved on disk as the fixed leaf, a DIRECT child of the run directory' {
        $diag = Join-Path $runDir 'rejected-response.txt'
        (Test-Path -LiteralPath $diag -PathType Leaf) | Should Be $true
        (Get-Content -LiteralPath $diag -Raw) | Should Match 'SECRET-REJECTED-PROVIDER-BODY'
    }
    It 'the manifest records EXACTLY one diagnostic entry with an independently verified identity' {
        @($m.diagnosticArtifacts).Count | Should Be 1
        $e = @($m.diagnosticArtifacts)[0]
        $e.kind | Should Be 'quality-rejected-response'
        $e.fileName | Should Be 'rejected-response.txt'
        $diag = Join-Path $runDir 'rejected-response.txt'
        $e.bytes | Should Be ([System.IO.File]::ReadAllBytes($diag)).Length
        $e.sha256 | Should Be ((Get-FileHash -LiteralPath $diag -Algorithm SHA256).Hash.ToLower())
    }
    It 'the manifest is schema v4 with an empty media inventory (a diagnostic is NOT media)' {
        $m.schemaVersion | Should Be 4
        @($m.mediaArtifacts).Count | Should Be 0
    }
    It 'the whole manifest leaks no rejected provider text' {
        ((Get-Content -LiteralPath (Join-Path $runDir 'manifest.json') -Raw) -match 'SECRET-REJECTED-PROVIDER-BODY') | Should Be $false
    }
    It 'the rejected body never appears in the captured run output (content-free Logs)' {
        ($r.Output -match 'SECRET-REJECTED-PROVIDER-BODY') | Should Be $false
    }
    It 'the manifest still validates against the shared schema gate' {
        { Assert-VideoScoutManifestValid -Manifest $m } | Should Not Throw
    }
}

Describe 'V4Q feed-gemini: an EMPTY provider response is preserved as a valid zero-byte diagnostic' {
    # The corrected SDK lifecycle has no early exit for an empty response: it is still a billed
    # response, so usage is preserved, the empty body is written as a zero-byte artifact, and the
    # run is a terminal error with no report. This proves the PowerShell half end to end.
    $r = Invoke-SdkSliceRun -SliceRangesJson $V4Good -QualityReject -QualityCode 'missing-section' -RejectedBody ''
    $m = Get-E2ERunManifest -OutDir $r.OutDir
    $runDir = (Get-ChildItem -LiteralPath $r.OutDir -Directory | Select-Object -First 1).FullName
    $diag = Join-Path $runDir 'rejected-response.txt'

    It 'the zero-byte artifact exists as the fixed leaf, a direct child of the run directory' {
        (Test-Path -LiteralPath $diag -PathType Leaf) | Should Be $true
        ([System.IO.File]::ReadAllBytes($diag)).Length | Should Be 0
    }
    It 'the run is a terminal ERROR with the missing-section quality code and NO report' {
        $m.outcome | Should Be 'error'
        $m.reason | Should Match '^\[quality:missing-section\]'
        $m.reportFile | Should BeNullOrEmpty
        (Test-Path -LiteralPath (Join-Path $runDir 'analysis-output.txt')) | Should Be $false
    }
    It 'USAGE is still preserved for the empty response (it was billed)' {
        $m.usage.totalTokens | Should Be 25528
    }
    It 'the schema-v4 manifest records the INDEPENDENTLY verified zero-byte entry' {
        $m.schemaVersion | Should Be 4
        @($m.diagnosticArtifacts).Count | Should Be 1
        $e = @($m.diagnosticArtifacts)[0]
        $e.kind | Should Be 'quality-rejected-response'
        $e.fileName | Should Be 'rejected-response.txt'
        $e.bytes | Should Be 0
        $e.sha256 | Should Be ((Get-FileHash -LiteralPath $diag -Algorithm SHA256).Hash.ToLower())
    }
    It 'the manifest validates and the zero-byte artifact is never exposed as a report' {
        { Assert-VideoScoutManifestValid -Manifest $m } | Should Not Throw
        # Report availability keys off outcome + reportFile, which is what keeps this run
        # permanently unavailable in the Library (proved directly in video-scout-library-core.Tests.ps1).
        $m.outcome | Should Be 'error'
        $m.reportFile | Should BeNullOrEmpty
        ((Get-Content -LiteralPath (Join-Path $runDir 'manifest.json') -Raw) -match '"reportFile"\s*:\s*null') | Should Be $true
    }
}

Describe 'V4Q feed-gemini: the parent NEVER trusts the child-reported artifact identity' {
    $r = Invoke-SdkSliceRun -SliceRangesJson $V4Good -QualityReject -LieAboutIdentity
    $m = Get-E2ERunManifest -OutDir $r.OutDir

    It 'a mismatched identity claim degrades to diagnostic-write-failed rather than being recorded' {
        $m.outcome | Should Be 'error'
        $m.reason | Should Match '^\[quality:diagnostic-write-failed\]'
    }
    It 'NO unverified diagnostic metadata is published' {
        @($m.diagnosticArtifacts).Count | Should Be 0
    }
    It 'usage is still preserved and no report is written' {
        $m.usage.totalTokens | Should Be 25528
        $m.reportFile | Should BeNullOrEmpty
    }
    It 'the manifest still validates' {
        { Assert-VideoScoutManifestValid -Manifest $m } | Should Not Throw
    }
}

Describe 'V4Q feed-gemini: a diagnostic that was never written is recorded honestly' {
    $r = Invoke-SdkSliceRun -SliceRangesJson $V4Good -QualityReject -SkipDiagnosticWrite
    $m = Get-E2ERunManifest -OutDir $r.OutDir

    It 'records the diagnostic-write-failed class with an EMPTY diagnostic array' {
        $m.outcome | Should Be 'error'
        $m.reason | Should Match '^\[quality:diagnostic-write-failed\]'
        @($m.diagnosticArtifacts).Count | Should Be 0
        $m.reportFile | Should BeNullOrEmpty
    }
    It 'the manifest still validates' {
        { Assert-VideoScoutManifestValid -Manifest $m } | Should Not Throw
    }
}

Describe 'V4Q feed-gemini: --diagnostic-dir is always supplied, and is the run directory itself' {
    $r = Invoke-SdkSliceRun -SliceRangesJson $V4Good
    $argv = @(Get-Content -LiteralPath $v4Argv -Encoding UTF8)
    $runDir = (Get-ChildItem -LiteralPath $r.OutDir -Directory | Select-Object -First 1).FullName

    It 'the SDK receives --diagnostic-dir exactly once' {
        (@($argv | Where-Object { $_ -eq '--diagnostic-dir' })).Count | Should Be 1
    }
    It 'its value is the already-created run directory (never a caller-supplied path)' {
        $i = [array]::IndexOf($argv, '--diagnostic-dir')
        $argv[$i + 1] | Should Be $runDir
        (Test-Path -LiteralPath $argv[$i + 1] -PathType Container) | Should Be $true
    }
    It 'an ACCEPTED run leaves no diagnostic behind' {
        (Test-Path -LiteralPath (Join-Path $runDir 'rejected-response.txt')) | Should Be $false
        $m = Get-E2ERunManifest -OutDir $r.OutDir
        @($m.diagnosticArtifacts).Count | Should Be 0
    }
}

# --- V4Q: omitted-model resolution (direct PowerShell callers only) --------------------------------
Describe 'V4Q feed-gemini: an omitted -Model resolves by scope; an explicit -Model always wins' {
    It 'omitted + multipart slices -> gemini-2.5-pro' {
        $r = Invoke-SdkSliceRun -SliceRangesJson $V4Good
        (Get-E2ERunManifest -OutDir $r.OutDir).model | Should Be 'gemini-2.5-pro'
        $argv = @(Get-Content -LiteralPath $v4Argv -Encoding UTF8)
        $argv[([array]::IndexOf($argv, '--model')) + 1] | Should Be 'gemini-2.5-pro'
    }
    It 'omitted + a scalar range -> gemini-2.5-pro' {
        $r = Invoke-SdkSliceRun -OmitSlices -WithScalarRange
        (Get-E2ERunManifest -OutDir $r.OutDir).model | Should Be 'gemini-2.5-pro'
    }
    It 'omitted + whole video -> the economy default is retained' {
        $r = Invoke-SdkSliceRun -OmitSlices
        (Get-E2ERunManifest -OutDir $r.OutDir).model | Should Be 'gemini-2.5-flash-lite'
    }
    It 'the manifest, the SDK argv, and the run all agree on ONE resolved model' {
        $r = Invoke-SdkSliceRun -SliceRangesJson $V4Good
        $m = Get-E2ERunManifest -OutDir $r.OutDir
        $argv = @(Get-Content -LiteralPath $v4Argv -Encoding UTF8)
        $argv[([array]::IndexOf($argv, '--model')) + 1] | Should Be $m.model
    }
}

# --- V4Q FINAL: the two canonical-field FORMAT codes cross the boundary intact ---------------------
# A format failure is a first-class rejection: it must reach a durable v4 manifest with its EXACT
# code, its preserved evidence, and its usage, exactly like every content failure. These runs are
# fully inert -- a stub node, a stub yt-dlp, no credentials, no network, no media.
Describe 'V4Q FINAL feed-gemini: source-duration-field-format survives Node -> PowerShell -> manifest' {
    $r = Invoke-SdkSliceRun -SliceRangesJson $V4Good -QualityReject -QualityCode 'source-duration-field-format' `
        -RejectedBody 'SECRET-FORMAT-BODY Approximate duration: Over 1 hour'
    $m = Get-E2ERunManifest -OutDir $r.OutDir
    $runDir = (Get-ChildItem -LiteralPath $r.OutDir -Directory | Select-Object -First 1).FullName

    It 'the run is a terminal error carrying the EXACT format code' {
        $m.outcome | Should Be 'error'
        $m.reason | Should Match '^\[quality:source-duration-field-format\]'
    }
    It 'the code is the schema-allowlisted one, not a near miss' {
        ((Get-VideoScoutQualityReasonCodes) -ccontains 'source-duration-field-format') | Should Be $true
        ($m.reason -match 'speculative-source-duration') | Should Be $false
    }
    It 'NO report is produced and the manifest is schema v4' {
        $m.reportFile | Should BeNullOrEmpty
        $m.schemaVersion | Should Be 4
        (Test-Path -LiteralPath (Join-Path $runDir 'analysis-output.txt')) | Should Be $false
    }
    It 'USAGE survives the format rejection (the run was still billed)' {
        $m.usage | Should Not BeNullOrEmpty
        $m.usage.videoTokens | Should Be 18410
        $m.usage.audioTokens | Should Be 2240
    }
    It 'exactly ONE independently verified diagnostic entry is recorded' {
        @($m.diagnosticArtifacts).Count | Should Be 1
        $m.diagnosticArtifacts[0].fileName | Should Be 'rejected-response.txt'
        $m.diagnosticArtifacts[0].sha256 | Should Be (Get-FileHash -LiteralPath (Join-Path $runDir 'rejected-response.txt') -Algorithm SHA256).Hash.ToLower()
    }
    It 'the preserved bytes are exact, and no provider text reaches the reason' {
        $bytes = [System.IO.File]::ReadAllBytes((Join-Path $runDir 'rejected-response.txt'))
        [System.Text.Encoding]::UTF8.GetString($bytes) | Should Be 'SECRET-FORMAT-BODY Approximate duration: Over 1 hour'
        ($bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF) | Should Be $false
        ($m.reason -match 'SECRET-FORMAT-BODY') | Should Be $false
    }
    It 'the manifest validates' {
        { Assert-VideoScoutManifestValid -Manifest $m } | Should Not Throw
    }
}

Describe 'V4Q FINAL feed-gemini: synthetic-assessment-field-format survives Node -> PowerShell -> manifest' {
    $r = Invoke-SdkSliceRun -SliceRangesJson $V4Good -QualityReject -QualityCode 'synthetic-assessment-field-format' `
        -RejectedBody 'SECRET-ASSESSMENT-BODY looks AI-generated to me'
    $m = Get-E2ERunManifest -OutDir $r.OutDir
    $runDir = (Get-ChildItem -LiteralPath $r.OutDir -Directory | Select-Object -First 1).FullName

    It 'the run is a terminal error carrying the EXACT format code' {
        $m.outcome | Should Be 'error'
        $m.reason | Should Match '^\[quality:synthetic-assessment-field-format\]'
    }
    It 'the code is distinct from its content counterpart' {
        ((Get-VideoScoutQualityReasonCodes) -ccontains 'synthetic-assessment-field-format') | Should Be $true
        ($m.reason -match 'unsupported-synthetic-claim') | Should Be $false
    }
    It 'NO report is produced and the manifest is schema v4' {
        $m.reportFile | Should BeNullOrEmpty
        $m.schemaVersion | Should Be 4
    }
    It 'exactly ONE independently verified diagnostic entry is recorded, with usage preserved' {
        @($m.diagnosticArtifacts).Count | Should Be 1
        $m.usage.videoTokens | Should Be 18410
    }
    It 'the rejected origin claim never reaches the reason or a report' {
        ($m.reason -match 'SECRET-ASSESSMENT-BODY') | Should Be $false
        ($m.reason -match 'AI-generated') | Should Be $false
        (Test-Path -LiteralPath (Join-Path $runDir 'analysis-output.txt')) | Should Be $false
    }
    It 'the manifest validates' {
        { Assert-VideoScoutManifestValid -Manifest $m } | Should Not Throw
    }
}

# Cleanup runs ONCE, here, after the last test that uses $e2eDir (Pester 3.4 has no AfterAll).
# It must stay at the very end of this file: the yt-dlp.cmd stub and the node tripwire live here.
Remove-Item -LiteralPath $e2eDir -Recurse -Force -ErrorAction SilentlyContinue
