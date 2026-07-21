<#
.SYNOPSIS
  Behavioral Pester tests for the V5 stack content-acceptance correction: the fixed, repository-owned
  Gemini CLI policy (denying the built-in `update_topic` tool) is passed with `--policy` on EVERY
  Video Scout Gemini CLI invocation — the direct-node path AND the fallback shim path, for transcript,
  audio, and CLI-video modes, and with a custom -Prompt.
.DESCRIPTION
  Run with: Invoke-Pester -Path scripts\feed-gemini-policy-wiring.Tests.ps1
  Same stub seams as feed-gemini-report-lifecycle.Tests.ps1 (yt-dlp / node / gemini on PATH, a shadowed
  duration probe), but every gemini stub APPENDS its own argv to a capture file so the tests can assert
  the exact flags feed-gemini passed. The yt-dlp stub is MODE-AWARE (writes .srt/.mp3/.mp4). No network,
  no Gemini, no real download, no model request. The policy path asserted is the REAL repo-owned file
  resolved by Get-VideoScoutGeminiPolicyPath.
#>
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$feedGemini = Join-Path $here 'feed-gemini.ps1'
. (Join-Path $here 'lib\get-video-scout-gemini-policy.ps1')
$policyPath = Get-VideoScoutGeminiPolicyPath
$policyLeaf = 'video-scout-gemini-policy.toml'
$YT = 'https://youtu.be/aqz-KE-bpKQ'
$NONYT = 'https://vimeo.com/76979871'

$stubRoot   = Join-Path ([System.IO.Path]::GetTempPath()) ("policy-wire-" + [Guid]::NewGuid().ToString('N'))
$directBin  = Join-Path $stubRoot 'direct'     # gemini.ps1 + bundle gemini.js -> CLI-direct (node) path
$fallbackBin= Join-Path $stubRoot 'fallback'   # gemini.ps1 only -> CLI-fallback (shim) path
$commonBin  = Join-Path $stubRoot 'common'
foreach ($d in @($commonBin, $directBin, (Join-Path $directBin 'node_modules\@google\gemini-cli\bundle'), $fallbackBin)) {
    New-Item -ItemType Directory -Path $d -Force | Out-Null
}

# node.ps1: the CLI-direct path invokes `node <bundle>\gemini.js ...`. Capture argv, emit a fake report.
@'
$argsFile = $env:VS_POLICY_ARGS_FILE
$first = if ($args.Count -gt 0) { [string]$args[0] } else { '' }
if ($first -match 'gemini\.js') {
    if ($argsFile) { Add-Content -LiteralPath $argsFile -Value ("DIRECT`t" + ($args -join "`t")) }
    Write-Output '## 1. TL;DR'
    Write-Output 'Fake CLI-direct analysis body.'
    exit 0
}
exit 0
'@ | Set-Content -LiteralPath (Join-Path $commonBin 'node.ps1') -Encoding ASCII

# yt-dlp.ps1: MODE-AWARE — writes .mp3 for audio, .mp4 for video, else .srt (transcript).
@'
$template = $null
for ($i = 0; $i -lt $args.Count; $i++) { if ($args[$i] -eq '-o') { $template = $args[$i + 1] } }
if (-not $template) { throw 'yt-dlp stub: no -o template argument found' }
$runDir = Split-Path -Parent $template
$argline = $args -join ' '
$name = if ($argline -match 'audio-format mp3') { 'Fake_Audio.mp3' }
        elseif ($argline -match 'merge-output-format mp4') { 'Fake_Video.mp4' }
        else { 'Fake_Video.en.srt' }
Set-Content -LiteralPath (Join-Path $runDir $name) -Value ("fake media for " + $name) -Encoding ASCII
"[yt-dlp-stub] wrote $name"
'@ | Set-Content -LiteralPath (Join-Path $commonBin 'yt-dlp.ps1') -Encoding ASCII

# gemini.ps1: the CLI FALLBACK shim. Capture argv, emit a fake report.
$geminiShim = @'
$argsFile = $env:VS_POLICY_ARGS_FILE
if ($argsFile) { Add-Content -LiteralPath $argsFile -Value ("FALLBACK`t" + ($args -join "`t")) }
Write-Output '## 1. TL;DR'
Write-Output 'Fake CLI-fallback analysis body.'
exit 0
'@
# The DIRECT bin also needs a gemini.ps1 (feed-gemini resolves the shim to locate the bundle beside it).
$geminiShim | Set-Content -LiteralPath (Join-Path $directBin 'gemini.ps1') -Encoding ASCII
$geminiShim | Set-Content -LiteralPath (Join-Path $fallbackBin 'gemini.ps1') -Encoding ASCII
# A real (non-empty) bundle gemini.js beside the DIRECT shim so feed-gemini takes the node path.
'// stub bundle gemini.js (never executed; node.ps1 intercepts)' |
    Set-Content -LiteralPath (Join-Path $directBin 'node_modules\@google\gemini-cli\bundle\gemini.js') -Encoding ASCII

function New-RunId {
    $stamp = Get-Date -Format 'yyyyMMdd-HHmmss-fff'
    $hex = [Guid]::NewGuid().ToString('N').Substring(0, 8)
    "run-$stamp-$PID-$hex"
}

# Runs the REAL feed-gemini down a CLI FEED path (not -NoFeed) and returns the captured gemini argv.
function Invoke-FeedCapture {
    param([string]$RouteBin, [hashtable]$Params)
    $outDir = Join-Path $stubRoot ('out-' + [Guid]::NewGuid().ToString('N'))
    $argsFile = Join-Path $stubRoot ('args-' + [Guid]::NewGuid().ToString('N') + '.txt')
    function global:Start-Job   { [PSCustomObject]@{ Id = 1 } }
    function global:Wait-Job    { $true }
    function global:Receive-Job { '100|NA' }
    function global:Stop-Job    { }
    function global:Remove-Job  { }
    $savedPath = $env:PATH
    $env:VS_POLICY_ARGS_FILE = $argsFile
    $env:PATH = "$RouteBin;$commonBin;$savedPath"
    try {
        $p = @{ OutDir = $outDir } + $Params
        try { & $feedGemini @p 6>&1 2>&1 | Out-Null } catch { }
        $captured = if (Test-Path -LiteralPath $argsFile) { Get-Content -LiteralPath $argsFile -Raw } else { '' }
        [PSCustomObject]@{ Args = $captured }
    }
    finally {
        $env:PATH = $savedPath
        Remove-Item Env:\VS_POLICY_ARGS_FILE -ErrorAction SilentlyContinue
        'Start-Job', 'Wait-Job', 'Receive-Job', 'Stop-Job', 'Remove-Job' |
            ForEach-Object { Remove-Item "function:global:$_" -ErrorAction SilentlyContinue }
    }
}

Describe 'V5 policy wiring — --policy passed on the DIRECT (node bundle) CLI route' {
    It 'transcript: passes --policy <repo policy path> on the direct route' {
        $r = Invoke-FeedCapture -RouteBin $directBin -Params @{ Url = $YT; VideoScout = $true; Mode = 'transcript'; RunId = (New-RunId) }
        $r.Args | Should Match 'DIRECT'
        $r.Args | Should Match '--policy'
        ($r.Args -match [regex]::Escape($policyPath)) | Should Be $true
        ($r.Args -match [regex]::Escape($policyLeaf)) | Should Be $true
    }
    It 'audio: passes --policy on the direct route' {
        $r = Invoke-FeedCapture -RouteBin $directBin -Params @{ Url = $YT; VideoScout = $true; Mode = 'audio'; RunId = (New-RunId) }
        $r.Args | Should Match '--policy'
        ($r.Args -match [regex]::Escape($policyLeaf)) | Should Be $true
    }
    It 'CLI video (non-YouTube): passes --policy on the direct route' {
        $r = Invoke-FeedCapture -RouteBin $directBin -Params @{ Url = $NONYT; VideoScout = $true; Mode = 'video'; RunId = (New-RunId) }
        $r.Args | Should Match '--policy'
        ($r.Args -match [regex]::Escape($policyLeaf)) | Should Be $true
    }
    It 'a custom -Prompt still gets --policy on the direct route' {
        $r = Invoke-FeedCapture -RouteBin $directBin -Params @{ Url = $YT; VideoScout = $true; Mode = 'transcript'; Prompt = 'CUSTOM just summarize'; RunId = (New-RunId) }
        $r.Args | Should Match '--policy'
        ($r.Args -match [regex]::Escape($policyLeaf)) | Should Be $true
    }
}

Describe 'V5 policy wiring — --policy passed on the FALLBACK (shim) CLI route' {
    It 'transcript: passes --policy <repo policy path> on the fallback route' {
        $r = Invoke-FeedCapture -RouteBin $fallbackBin -Params @{ Url = $YT; VideoScout = $true; Mode = 'transcript'; RunId = (New-RunId) }
        $r.Args | Should Match 'FALLBACK'
        $r.Args | Should Match '--policy'
        ($r.Args -match [regex]::Escape($policyPath)) | Should Be $true
        ($r.Args -match [regex]::Escape($policyLeaf)) | Should Be $true
    }
    It 'audio: passes --policy on the fallback route' {
        $r = Invoke-FeedCapture -RouteBin $fallbackBin -Params @{ Url = $YT; VideoScout = $true; Mode = 'audio'; RunId = (New-RunId) }
        $r.Args | Should Match '--policy'
        ($r.Args -match [regex]::Escape($policyLeaf)) | Should Be $true
    }
    It 'CLI video (non-YouTube): passes --policy on the fallback route' {
        $r = Invoke-FeedCapture -RouteBin $fallbackBin -Params @{ Url = $NONYT; VideoScout = $true; Mode = 'video'; RunId = (New-RunId) }
        $r.Args | Should Match '--policy'
        ($r.Args -match [regex]::Escape($policyLeaf)) | Should Be $true
    }
    It 'a custom -Prompt still gets --policy on the fallback route' {
        $r = Invoke-FeedCapture -RouteBin $fallbackBin -Params @{ Url = $YT; VideoScout = $true; Mode = 'transcript'; Prompt = 'CUSTOM just summarize'; RunId = (New-RunId) }
        $r.Args | Should Match '--policy'
        ($r.Args -match [regex]::Escape($policyLeaf)) | Should Be $true
    }
}

Describe 'V5 policy wiring — the SDK route does NOT pass --policy (update_topic is a CLI tool only)' {
    It 'a YouTube video (SDK route) never invokes a CLI gemini with --policy' {
        # Bare -VideoScout on a YouTube URL -> video mode -> SDK route (no download, no CLI gemini).
        $r = Invoke-FeedCapture -RouteBin $directBin -Params @{ Url = $YT; VideoScout = $true; RunId = (New-RunId) }
        # The node.ps1 stub only records when invoked as `gemini.js` (CLI-direct); the SDK route calls
        # `gemini-video-sdk.js`, which this bin does not stub, so no CLI-gemini argv is captured.
        ($r.Args -match '--policy') | Should Be $false
    }
}

# --- trailing cleanup (Pester 3.4 pattern) ---------------------------------------------------------
Remove-Item -LiteralPath $stubRoot -Recurse -Force -ErrorAction SilentlyContinue
