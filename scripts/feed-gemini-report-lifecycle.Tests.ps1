<#
.SYNOPSIS
  Behavioral Pester tests for the V5b1 report lifecycle in feed-gemini.ps1 (report artifacts +
  atomic report-before-manifest ordering + main-issued -RunId), exercised end-to-end with stubbed
  node / gemini / yt-dlp on PATH. No network and no paid call anywhere.
.DESCRIPTION
  Run with: Invoke-Pester -Path scripts\feed-gemini-report-lifecycle.Tests.ps1

  Harness (same seams the other feed-gemini behavioral suites use):
    - node.ps1  : one smart stub. When invoked for gemini-video-sdk.js it plays the SDK route; when
                  invoked for the bundle gemini.js it plays the CLI-direct route. Output/exit are
                  controlled by VS_STUB_* env vars.
    - gemini.ps1: the CLI FALLBACK shim (used when no bundle gemini.js sits beside it).
    - yt-dlp.ps1: writes a fake .srt into the run dir (CLI route); can also drop a blocking
                  analysis-output.txt DIRECTORY to force a report-persistence failure.
    - the duration probe's Start-Job/Receive-Job layer is shadowed with globals feeding a
      deterministic '100|NA' probe line (100s < every per-mode limit -> guard passes), or a huge
      value to force a guard REFUSAL.
  A main-issued -RunId is passed on every app-style launch so the run directory name equals the ID.
#>
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$feedGemini = Join-Path $here 'feed-gemini.ps1'
$YT = 'https://youtu.be/aqz-KE-bpKQ'

# --- stub roots -------------------------------------------------------------------------------------
$stubRoot   = Join-Path ([System.IO.Path]::GetTempPath()) ("v5b1-life-" + [Guid]::NewGuid().ToString('N'))
$commonBin  = Join-Path $stubRoot 'common'     # node.ps1 + yt-dlp.ps1 (always on PATH)
$directBin  = Join-Path $stubRoot 'direct'     # gemini.ps1 + bundle gemini.js (CLI-direct)
$fallbackBin= Join-Path $stubRoot 'fallback'   # gemini.ps1 only (CLI-fallback)
foreach ($d in @($commonBin, $directBin, (Join-Path $directBin 'node_modules\@google\gemini-cli\bundle'), $fallbackBin)) {
    New-Item -ItemType Directory -Path $d -Force | Out-Null
}

# node.ps1: SDK route (gemini-video-sdk.js) or CLI-direct (bundle gemini.js).
@'
$first = if ($args.Count -gt 0) { [string]$args[0] } else { '' }
$mode = $env:VS_STUB_MODE
$code = if ($env:VS_STUB_EXIT) { [int]$env:VS_STUB_EXIT } else { 0 }
if ($first -match 'gemini-video-sdk\.js') {
    if ($mode -eq 'retry') { [Console]::Error.WriteLine('[video-scout sdk] HTTP 503 - attempt 1/3; retrying in 1.0s') }
    if ($mode -ne 'empty') {
        Write-Output 'SDK-ANALYSIS-MARKER: TLDR is the first line and most valuable.'
        Write-Output 'A second line of SDK analysis.'
        Write-Output '[video-scout usage] prompt=10 (video=5 audio=2 text=3) output=7 total=17 model=gemini-2.5-flash-lite mediaRes=MEDIUM'
    }
    exit $code
}
elseif ($first -match 'gemini\.js') {
    if ($mode -ne 'empty') {
        Write-Output 'CLI-DIRECT-ANALYSIS-MARKER: TLDR first.'
        Write-Output 'More CLI-direct analysis.'
    }
    exit $code
}
exit 0
'@ | Set-Content -LiteralPath (Join-Path $commonBin 'node.ps1') -Encoding ASCII

# yt-dlp.ps1: write a fake .srt into the run dir; optionally block the report file to force a
# persistence failure.
@'
$template = $null
for ($i = 0; $i -lt $args.Count; $i++) { if ($args[$i] -eq '-o') { $template = $args[$i + 1] } }
if (-not $template) { throw 'yt-dlp stub: no -o template argument found' }
$runDir = Split-Path -Parent $template
Set-Content -LiteralPath (Join-Path $runDir 'Fake_Test_Video.en.srt') -Value "1`r`n00:00:01,000 --> 00:00:03,500`r`nHello.`r`n" -Encoding ASCII
if ($env:VS_STUB_BLOCK_REPORT -eq '1') {
    New-Item -ItemType Directory -Path (Join-Path $runDir 'analysis-output.txt') -Force | Out-Null
}
"[yt-dlp-stub] wrote srt into $runDir"
'@ | Set-Content -LiteralPath (Join-Path $commonBin 'yt-dlp.ps1') -Encoding ASCII

# gemini.ps1: the CLI FALLBACK shim.
$geminiShim = @'
$mode = $env:VS_STUB_MODE
$code = if ($env:VS_STUB_EXIT) { [int]$env:VS_STUB_EXIT } else { 0 }
if ($mode -ne 'empty') {
    Write-Output 'CLI-FALLBACK-ANALYSIS-MARKER: TLDR first.'
    Write-Output 'More CLI-fallback analysis.'
}
exit $code
'@
$geminiShim | Set-Content -LiteralPath (Join-Path $directBin 'gemini.ps1') -Encoding ASCII
$geminiShim | Set-Content -LiteralPath (Join-Path $fallbackBin 'gemini.ps1') -Encoding ASCII
# A real (non-empty) bundle gemini.js beside the DIRECT shim so feed-gemini takes the node path.
'// stub bundle gemini.js (never executed directly; node.ps1 stub intercepts)' |
    Set-Content -LiteralPath (Join-Path $directBin 'node_modules\@google\gemini-cli\bundle\gemini.js') -Encoding ASCII

# --- run helpers ------------------------------------------------------------------------------------
function New-RunId {
    # A well-formed main-issued ID (validated by Test-VideoScoutRunId). Unique per call.
    $stamp = Get-Date -Format 'yyyyMMdd-HHmmss-fff'
    $hex = [Guid]::NewGuid().ToString('N').Substring(0, 8)
    "run-$stamp-$PID-$hex"
}

function Invoke-Feed {
    param(
        [string[]]$ExtraPathBins = @(),
        [hashtable]$Params,
        [string]$StubMode = 'success',
        [int]$StubExit = 0,
        [string]$ProbeLine = '100|NA',
        [switch]$BlockReport
    )
    $outDir = Join-Path $stubRoot ('out-' + [Guid]::NewGuid().ToString('N'))
    # Read the probe line from an env var: a `function global:` shadow does not reliably see the
    # test file's $script: scope, but it always sees the process environment.
    function global:Start-Job   { [PSCustomObject]@{ Id = 1 } }
    function global:Wait-Job    { $true }
    function global:Receive-Job { $env:VS_PROBE_LINE }
    function global:Stop-Job    { }
    function global:Remove-Job  { }
    $savedPath = $env:PATH
    $env:VS_PROBE_LINE = $ProbeLine
    $env:VS_STUB_MODE = $StubMode
    $env:VS_STUB_EXIT = "$StubExit"
    if ($BlockReport) { $env:VS_STUB_BLOCK_REPORT = '1' } else { Remove-Item Env:\VS_STUB_BLOCK_REPORT -ErrorAction SilentlyContinue }
    $env:PATH = (($ExtraPathBins + $commonBin) -join ';') + ';' + $savedPath
    try {
        $p = @{ OutDir = $outDir } + $Params
        # feed-gemini's terminal-truth backstop finalizes the manifest (refused/error) and then
        # RETHROWS the original failure. That is correct production behavior; catch it here so the
        # test can still inspect the manifest the run wrote before the rethrow.
        $text = ''
        try { $text = (& $feedGemini @p 6>&1 2>&1 | Out-String -Width 32767) }
        catch { $text = "[caught] $($_.Exception.Message)" }
        $runDir = Get-ChildItem -Path $outDir -Directory -Filter 'run-*' -ErrorAction SilentlyContinue | Select-Object -First 1
        $manifest = $null
        if ($runDir) {
            $mp = Join-Path $runDir.FullName 'manifest.json'
            if (Test-Path -LiteralPath $mp) { $manifest = Get-Content -LiteralPath $mp -Raw -Encoding UTF8 | ConvertFrom-Json }
        }
        [PSCustomObject]@{
            Output   = $text
            RunDir   = if ($runDir) { $runDir.FullName } else { $null }
            Manifest = $manifest
            ReportPath = if ($runDir) { Join-Path $runDir.FullName 'analysis-output.txt' } else { $null }
        }
    }
    finally {
        $env:PATH = $savedPath
        Remove-Item Env:\VS_STUB_MODE, Env:\VS_STUB_EXIT, Env:\VS_STUB_BLOCK_REPORT, Env:\VS_PROBE_LINE -ErrorAction SilentlyContinue
        'Start-Job', 'Wait-Job', 'Receive-Job', 'Stop-Job', 'Remove-Job' |
            ForEach-Object { Remove-Item "function:global:$_" -ErrorAction SilentlyContinue }
    }
}

Describe 'V5b1 SDK route report lifecycle' {

    It 'clean success: writes analysis-output.txt AND completes the manifest pointing at it' {
        $rid = New-RunId
        $r = Invoke-Feed -Params @{ Url = $YT; VideoScout = $true; RunId = $rid } -StubMode success -StubExit 0
        (Split-Path -Leaf $r.RunDir) | Should Be $rid                          # run dir name == main-issued ID
        Test-Path -LiteralPath $r.ReportPath | Should Be $true
        (Get-Content -LiteralPath $r.ReportPath -Raw) | Should Match 'SDK-ANALYSIS-MARKER'
        $r.Manifest.outcome | Should Be 'completed'
        $r.Manifest.reportFile | Should Be 'analysis-output.txt'
        $r.Manifest.runId | Should Be $rid
    }

    It 'K5 retry then success: only the final analysis becomes ONE report' {
        $r = Invoke-Feed -Params @{ Url = $YT; VideoScout = $true; RunId = (New-RunId) } -StubMode retry -StubExit 0
        $r.Manifest.outcome | Should Be 'completed'
        $body = Get-Content -LiteralPath $r.ReportPath -Raw
        ([regex]::Matches($body, 'SDK-ANALYSIS-MARKER')).Count | Should Be 1     # exactly one report body
        ($body -match 'HTTP 503') | Should Be $false                            # retry stderr noise not persisted
    }

    It 'K5 exhausted / nonzero exit: NO report file and reportFile stays null (outcome error)' {
        $r = Invoke-Feed -Params @{ Url = $YT; VideoScout = $true; RunId = (New-RunId) } -StubMode success -StubExit 1
        Test-Path -LiteralPath $r.ReportPath | Should Be $false
        $r.Manifest.outcome | Should Be 'error'
        $r.Manifest.reportFile | Should Be $null
    }

    It 'empty clean output: outcome error, no report (never completed with an empty report)' {
        $r = Invoke-Feed -Params @{ Url = $YT; VideoScout = $true; RunId = (New-RunId) } -StubMode empty -StubExit 0
        Test-Path -LiteralPath $r.ReportPath | Should Be $false
        $r.Manifest.outcome | Should Be 'error'
        $r.Manifest.reportFile | Should Be $null
    }

    It 'guard refusal: outcome refused, no report (duration over the limit)' {
        # A probe duration far over the video-mode limit forces Assert-DurationGuard to refuse before
        # node is ever invoked.
        $r = Invoke-Feed -Params @{ Url = $YT; VideoScout = $true; RunId = (New-RunId) } -StubMode success -StubExit 0 -ProbeLine '999999|NA'
        Test-Path -LiteralPath $r.ReportPath | Should Be $false
        $r.Manifest.outcome | Should Be 'refused'
        $r.Manifest.reportFile | Should Be $null
    }
}

Describe 'V5b1 CLI route report lifecycle' {

    It 'CLI fallback (shim) success: report first, then completed manifest pointer' {
        $rid = New-RunId
        $r = Invoke-Feed -ExtraPathBins @($fallbackBin) -Params @{ Url = $YT; VideoScout = $true; Mode = 'transcript'; RunId = $rid } -StubMode success -StubExit 0
        Test-Path -LiteralPath $r.ReportPath | Should Be $true
        (Get-Content -LiteralPath $r.ReportPath -Raw) | Should Match 'CLI-FALLBACK-ANALYSIS-MARKER'
        $r.Manifest.outcome | Should Be 'completed'
        $r.Manifest.reportFile | Should Be 'analysis-output.txt'
        (Split-Path -Leaf $r.RunDir) | Should Be $rid
    }

    It 'CLI direct (node gemini.js) success: report first, then completed manifest pointer' {
        $r = Invoke-Feed -ExtraPathBins @($directBin) -Params @{ Url = $YT; VideoScout = $true; Mode = 'transcript'; RunId = (New-RunId) } -StubMode success -StubExit 0
        Test-Path -LiteralPath $r.ReportPath | Should Be $true
        (Get-Content -LiteralPath $r.ReportPath -Raw) | Should Match 'CLI-DIRECT-ANALYSIS-MARKER'
        $r.Manifest.outcome | Should Be 'completed'
        $r.Manifest.reportFile | Should Be 'analysis-output.txt'
    }

    It 'CLI nonzero exit: no report, reportFile null (outcome error)' {
        $r = Invoke-Feed -ExtraPathBins @($fallbackBin) -Params @{ Url = $YT; VideoScout = $true; Mode = 'transcript'; RunId = (New-RunId) } -StubMode success -StubExit 1
        Test-Path -LiteralPath $r.ReportPath | Should Be $false
        $r.Manifest.outcome | Should Be 'error'
        $r.Manifest.reportFile | Should Be $null
    }

    It 'report persistence failure: manifest is error/never-completed with a null pointer (crash truth)' {
        # yt-dlp stub drops a blocking analysis-output.txt DIRECTORY, so the create-only report writer
        # refuses AFTER a clean gemini exit. The terminal catch must finalize error, reportFile null --
        # never a completed manifest pointing at a temp/partial/missing report.
        $r = Invoke-Feed -ExtraPathBins @($fallbackBin) -Params @{ Url = $YT; VideoScout = $true; Mode = 'transcript'; RunId = (New-RunId) } -StubMode success -StubExit 0 -BlockReport
        $r.Manifest.outcome | Should Be 'error'
        $r.Manifest.reportFile | Should Be $null
        # analysis-output.txt exists only as the blocking directory, never as a completed report file.
        (Test-Path -LiteralPath $r.ReportPath -PathType Leaf) | Should Be $false
    }
}

Describe 'V5b1 atomic ordering (source-scope guard)' {
    $src = Get-Content -LiteralPath $feedGemini -Raw -Encoding UTF8

    It 'writes the report BEFORE completing the manifest on the SDK route' {
        # Within the SDK success branch, Write-VideoScoutReportFile must precede the completed
        # Complete-VideoScoutRunManifest ... -ReportFile call.
        $sdkIdx = $src.IndexOf('$reportName = Write-VideoScoutReportFile -RunDir $sdkRun.RunDir')
        $sdkDone = $src.IndexOf("Complete-VideoScoutRunManifest -RunDir `$sdkRun.RunDir -Manifest `$sdkManifest -Outcome 'completed'", $sdkIdx)
        ($sdkIdx -gt 0 -and $sdkDone -gt $sdkIdx) | Should Be $true
    }
    It 'writes the report BEFORE completing the manifest on the CLI route' {
        $cliIdx = $src.IndexOf('$reportName = Write-VideoScoutReportFile -RunDir $runDir')
        $cliDone = $src.IndexOf("Complete-VideoScoutRunManifest -RunDir `$runDir -Manifest `$cliManifest -Outcome 'completed'", $cliIdx)
        ($cliIdx -gt 0 -and $cliDone -gt $cliIdx) | Should Be $true
    }
    It 'passes -ReportFile only on the completed path (never on error/refused)' {
        # -ReportFile $reportName appears exactly twice (SDK + CLI completed calls), and each is within
        # a completed finalization (the arg rides a continuation line just after -Outcome 'completed').
        ([regex]::Matches($src, '-ReportFile \$reportName')).Count | Should Be 2
        # No error/refused finalization ever carries a -ReportFile (checked over each Complete call's
        # bounded span). Every -ReportFile use is preceded by 'completed' within a short window.
        $ok = [regex]::Matches($src, "(?s)-Outcome 'completed'.{0,120}?-ReportFile \`$reportName")
        $ok.Count | Should Be 2
    }
}

# --- trailing cleanup (Pester 3.4 pattern) ---------------------------------------------------------
Remove-Item -LiteralPath $stubRoot -Recurse -Force -ErrorAction SilentlyContinue
