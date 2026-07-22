<#
.SYNOPSIS
  Behavioral Pester tests for the V5c1 media-inventory lifecycle in feed-gemini.ps1: a downloaded
  artifact is recorded (state='present') into the run's schema-v2 manifest BEFORE the paid Gemini
  call; the SDK route records none; a guard refusal / download failure records none; an analysis
  failure after a successful download RETAINS the recorded artifact; a recording failure prevents the
  Gemini invocation and leaves the file untouched; NoFeed records the download.
.DESCRIPTION
  Run with: Invoke-Pester -Path scripts\feed-gemini-media-inventory-lifecycle.Tests.ps1
  Same stub seams as feed-gemini-report-lifecycle.Tests.ps1 (node / gemini / yt-dlp on PATH, a
  shadowed duration probe), but the yt-dlp stub is MODE-AWARE (writes .srt / .mp3 / .mp4 to match the
  requested mode) so each kind can be exercised. No network, no Gemini, no real download.
#>
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$feedGemini = Join-Path $here 'feed-gemini.ps1'
$YT = 'https://youtu.be/aqz-KE-bpKQ'
$NONYT = 'https://vimeo.com/76979871'

$stubRoot   = Join-Path ([System.IO.Path]::GetTempPath()) ("v5c1-life-" + [Guid]::NewGuid().ToString('N'))
$commonBin  = Join-Path $stubRoot 'common'
$fallbackBin= Join-Path $stubRoot 'fallback'
foreach ($d in @($commonBin, $fallbackBin)) { New-Item -ItemType Directory -Path $d -Force | Out-Null }

# node.ps1: SDK route (gemini-video-sdk.js) — the CLI route uses the fallback gemini shim here.
@'
$first = if ($args.Count -gt 0) { [string]$args[0] } else { '' }
$mode = $env:VS_STUB_MODE
$code = if ($env:VS_STUB_EXIT) { [int]$env:VS_STUB_EXIT } else { 0 }
if ($first -match 'gemini-video-sdk\.js') {
    if ($mode -ne 'empty') {
        Write-Output 'SDK-ANALYSIS-MARKER: TLDR first.'
        Write-Output '[video-scout usage] prompt=10 (video=5 audio=2 text=3) output=7 total=17 model=gemini-2.5-flash-lite mediaRes=MEDIUM'
    }
    exit $code
}
exit 0
'@ | Set-Content -LiteralPath (Join-Path $commonBin 'node.ps1') -Encoding ASCII

# yt-dlp.ps1: MODE-AWARE — writes .mp3 for audio, .mp4 for video, else .srt (transcript). Optional
# flags: VS_STUB_NO_OUTPUT (produce nothing -> download failure); VS_STUB_READONLY_MANIFEST (set the
# manifest read-only so the ownership recorder's atomic replace fails -> a recording failure).
@'
$template = $null
for ($i = 0; $i -lt $args.Count; $i++) { if ($args[$i] -eq '-o') { $template = $args[$i + 1] } }
if (-not $template) { throw 'yt-dlp stub: no -o template argument found' }
$runDir = Split-Path -Parent $template
if ($env:VS_STUB_NO_OUTPUT -eq '1') { "[yt-dlp-stub] produced no file"; exit 0 }
$argline = $args -join ' '
$name = if ($argline -match 'audio-format mp3') { 'Fake_Audio.mp3' }
        elseif ($argline -match 'merge-output-format mp4') { 'Fake_Video.mp4' }
        else { 'Fake_Video.en.srt' }
Set-Content -LiteralPath (Join-Path $runDir $name) -Value ("fake media bytes for " + $name) -Encoding ASCII
if ($env:VS_STUB_READONLY_MANIFEST -eq '1') { Set-ItemProperty -LiteralPath (Join-Path $runDir 'manifest.json') -Name IsReadOnly -Value $true }
"[yt-dlp-stub] wrote $name"
'@ | Set-Content -LiteralPath (Join-Path $commonBin 'yt-dlp.ps1') -Encoding ASCII

# gemini.ps1: the CLI FALLBACK shim (analysis output for the CLI route).
@'
$mode = $env:VS_STUB_MODE
$code = if ($env:VS_STUB_EXIT) { [int]$env:VS_STUB_EXIT } else { 0 }
if ($mode -ne 'empty') { Write-Output 'CLI-ANALYSIS-MARKER: TLDR first.'; Write-Output 'More analysis.' }
exit $code
'@ | Set-Content -LiteralPath (Join-Path $fallbackBin 'gemini.ps1') -Encoding ASCII

function New-RunId {
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
        [switch]$NoOutput,
        [switch]$ReadonlyManifest
    )
    $outDir = Join-Path $stubRoot ('out-' + [Guid]::NewGuid().ToString('N'))
    function global:Start-Job   { [PSCustomObject]@{ Id = 1 } }
    function global:Wait-Job    { $true }
    function global:Receive-Job { $env:VS_PROBE_LINE }
    function global:Stop-Job    { }
    function global:Remove-Job  { }
    $savedPath = $env:PATH
    $env:VS_PROBE_LINE = $ProbeLine
    $env:VS_STUB_MODE = $StubMode
    $env:VS_STUB_EXIT = "$StubExit"
    if ($NoOutput) { $env:VS_STUB_NO_OUTPUT = '1' } else { Remove-Item Env:\VS_STUB_NO_OUTPUT -ErrorAction SilentlyContinue }
    if ($ReadonlyManifest) { $env:VS_STUB_READONLY_MANIFEST = '1' } else { Remove-Item Env:\VS_STUB_READONLY_MANIFEST -ErrorAction SilentlyContinue }
    $env:PATH = (($ExtraPathBins + $commonBin) -join ';') + ';' + $savedPath
    try {
        $p = @{ OutDir = $outDir } + $Params
        $text = ''
        try { $text = (& $feedGemini @p 6>&1 2>&1 | Out-String -Width 32767) }
        catch { $text = "[caught] $($_.Exception.Message)" }
        $runDir = Get-ChildItem -Path $outDir -Directory -Filter 'run-*' -ErrorAction SilentlyContinue | Select-Object -First 1
        $manifest = $null
        if ($runDir) {
            # Clear any read-only flag the stub set so we can read the manifest back.
            $mp = Join-Path $runDir.FullName 'manifest.json'
            if (Test-Path -LiteralPath $mp) {
                try { Set-ItemProperty -LiteralPath $mp -Name IsReadOnly -Value $false -ErrorAction SilentlyContinue } catch {}
                $manifest = Get-Content -LiteralPath $mp -Raw -Encoding UTF8 | ConvertFrom-Json
            }
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
        Remove-Item Env:\VS_STUB_MODE, Env:\VS_STUB_EXIT, Env:\VS_STUB_NO_OUTPUT, Env:\VS_STUB_READONLY_MANIFEST, Env:\VS_PROBE_LINE -ErrorAction SilentlyContinue
        'Start-Job', 'Wait-Job', 'Receive-Job', 'Stop-Job', 'Remove-Job' |
            ForEach-Object { Remove-Item "function:global:$_" -ErrorAction SilentlyContinue }
    }
}

Describe 'V5c1 CLI route records the correct kind' {
    It 'transcript -> one .srt artifact (kind transcript), completed + report + inventory' {
        $r = Invoke-Feed -ExtraPathBins @($fallbackBin) -Params @{ Url = $YT; VideoScout = $true; Mode = 'transcript'; RunId = (New-RunId) }
        $r.Manifest.schemaVersion | Should Be 2
        $m = @($r.Manifest.mediaArtifacts)
        $m.Count | Should Be 1
        $m[0].kind | Should Be 'transcript'
        $m[0].fileName | Should Be 'Fake_Video.en.srt'
        $m[0].state | Should Be 'present'
        $m[0].sizeBytes | Should BeGreaterThan 0
        $r.Manifest.outcome | Should Be 'completed'
        $r.Manifest.reportFile | Should Be 'analysis-output.txt'
        Test-Path -LiteralPath $r.ReportPath | Should Be $true
    }
    It 'audio -> one .mp3 artifact (kind audio)' {
        $r = Invoke-Feed -ExtraPathBins @($fallbackBin) -Params @{ Url = $YT; VideoScout = $true; Mode = 'audio'; RunId = (New-RunId) }
        $m = @($r.Manifest.mediaArtifacts)
        $m.Count | Should Be 1
        $m[0].kind | Should Be 'audio'
        $m[0].fileName | Should Be 'Fake_Audio.mp3'
        $r.Manifest.outcome | Should Be 'completed'
    }
    It 'video (non-YouTube -> CLI route) -> one .mp4 artifact (kind video)' {
        $r = Invoke-Feed -ExtraPathBins @($fallbackBin) -Params @{ Url = $NONYT; VideoScout = $true; Mode = 'video'; RunId = (New-RunId) }
        $m = @($r.Manifest.mediaArtifacts)
        $m.Count | Should Be 1
        $m[0].kind | Should Be 'video'
        $m[0].fileName | Should Be 'Fake_Video.mp4'
        $r.Manifest.outcome | Should Be 'completed'
    }
}

Describe 'V5c1 SDK route records no local media' {
    It 'YouTube video -> SDK route: empty inventory, completed, no download' {
        $r = Invoke-Feed -Params @{ Url = $YT; VideoScout = $true; RunId = (New-RunId) }   # bare -VideoScout -> video -> SDK
        $r.Manifest.schemaVersion | Should Be 2
        (@($r.Manifest.mediaArtifacts)).Count | Should Be 0
        $r.Manifest.route | Should Be 'sdk'
        $r.Manifest.outcome | Should Be 'completed'
    }
}

Describe 'V5c1 failure truth' {
    It 'guard refusal records no media (empty inventory, refused)' {
        $r = Invoke-Feed -ExtraPathBins @($fallbackBin) -Params @{ Url = $YT; VideoScout = $true; Mode = 'transcript'; RunId = (New-RunId) } -ProbeLine '999999|NA'
        (@($r.Manifest.mediaArtifacts)).Count | Should Be 0
        $r.Manifest.outcome | Should Be 'refused'
    }
    It 'download failure (no output) records no media (empty inventory, error)' {
        $r = Invoke-Feed -ExtraPathBins @($fallbackBin) -Params @{ Url = $YT; VideoScout = $true; Mode = 'transcript'; RunId = (New-RunId) } -NoOutput
        (@($r.Manifest.mediaArtifacts)).Count | Should Be 0
        $r.Manifest.outcome | Should Be 'error'
    }
    It 'analysis failure AFTER a successful download RETAINS the recorded artifact (outcome error)' {
        $r = Invoke-Feed -ExtraPathBins @($fallbackBin) -Params @{ Url = $YT; VideoScout = $true; Mode = 'transcript'; RunId = (New-RunId) } -StubExit 1
        $m = @($r.Manifest.mediaArtifacts)
        $m.Count | Should Be 1                       # artifact stays owned
        $m[0].kind | Should Be 'transcript'
        $r.Manifest.outcome | Should Be 'error'      # analysis failed
        $r.Manifest.reportFile | Should Be $null     # no report
        Test-Path -LiteralPath $r.ReportPath | Should Be $false
    }
    It 'a recording failure prevents the Gemini call and leaves the file untouched' {
        $r = Invoke-Feed -ExtraPathBins @($fallbackBin) -Params @{ Url = $YT; VideoScout = $true; Mode = 'transcript'; RunId = (New-RunId) } -ReadonlyManifest
        # Recording failed BEFORE analysis: NO ownership recorded, and the run is NOT a success.
        (@($r.Manifest.mediaArtifacts)).Count | Should Be 0
        $r.Manifest.outcome | Should Not Be 'completed'   # null-or-error; never a fabricated success
        $r.Manifest.reportFile | Should Be $null
        Test-Path -LiteralPath $r.ReportPath | Should Be $false
        # Gemini was NOT invoked (its analysis marker never streamed) — the paid call is blocked.
        ($r.Output -match 'CLI-ANALYSIS-MARKER') | Should Be $false
        # The downloaded file was left in place (never deleted/moved/repaired).
        (Test-Path -LiteralPath (Join-Path $r.RunDir 'Fake_Video.en.srt')) | Should Be $true
        # NOTE: outcome is null here because the same read-only lock that blocks the ownership write
        # also blocks the error-finalization write — honest crash-truth (outcome=null), not a
        # fabricated terminal state. A recording refusal that does NOT wedge the manifest finalizes as
        # 'error' via the existing terminal-truth path (see the recorder unit tests for the fail-closed
        # throw + revert).
    }
}

Describe 'V5c1 NoFeed records the download' {
    It 'NoFeed -> records the artifact, completes without a report' {
        $r = Invoke-Feed -ExtraPathBins @($fallbackBin) -Params @{ Url = $YT; VideoScout = $true; Mode = 'transcript'; NoFeed = $true; RunId = (New-RunId) }
        $m = @($r.Manifest.mediaArtifacts)
        $m.Count | Should Be 1
        $m[0].kind | Should Be 'transcript'
        $r.Manifest.outcome | Should Be 'completed'
        $r.Manifest.reportFile | Should Be $null
    }
}

Describe 'V5c1 ordering source guard' {
    $src = Get-Content -LiteralPath $feedGemini -Raw -Encoding UTF8

    It 'records the media artifact BEFORE invoking Gemini on the CLI route' {
        $recordIdx = $src.IndexOf('Add-VideoScoutMediaArtifact -RunDir $runDir -File $file')
        $nodeIdx = $src.IndexOf('& $nodeExe $geminiJs')
        $shimIdx = $src.IndexOf('& $gemini -m $Model')
        ($recordIdx -gt 0) | Should Be $true
        ($nodeIdx -gt $recordIdx) | Should Be $true
        ($shimIdx -gt $recordIdx) | Should Be $true
    }
    It 'the SDK route never records a media artifact (no recorder call before the SDK node invocation)' {
        # The recorder is only in the CLI download section; the SDK branch returns earlier.
        $sdkNode = $src.IndexOf('& node $sdkScript @sdkArgs')
        $recordIdx = $src.IndexOf('Add-VideoScoutMediaArtifact')
        ($sdkNode -gt 0 -and $recordIdx -gt $sdkNode) | Should Be $true   # recorder appears AFTER the SDK invocation, i.e. only on the CLI path
    }
}

# --- trailing cleanup (Pester 3.4 pattern) ---------------------------------------------------------
Remove-Item -LiteralPath $stubRoot -Recurse -Force -ErrorAction SilentlyContinue
