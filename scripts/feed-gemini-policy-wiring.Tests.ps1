<#
.SYNOPSIS
  Behavioral Pester tests for the V5 stack content-acceptance correction: the fixed, repository-owned
  Gemini CLI policy (denying model tools) is passed with `--policy` on EVERY
  Video Scout Gemini CLI invocation — the direct-node path AND the native fallback path, for transcript,
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
. (Join-Path $here 'test-fixtures\video-scout-native-stub.ps1')
. (Join-Path $here 'lib\get-video-scout-gemini-policy.ps1')
$policyPath = Get-VideoScoutGeminiPolicyPath
$policyLeaf = 'video-scout-gemini-policy.toml'
$YT = 'https://youtu.be/aqz-KE-bpKQ'
$NONYT = 'https://vimeo.com/76979871'

$stubRoot   = Join-Path ([System.IO.Path]::GetTempPath()) ("policy-wire-" + [Guid]::NewGuid().ToString('N'))
$directBin  = Join-Path $stubRoot 'direct'     # gemini.ps1 + bundle gemini.js -> CLI-direct (node) path
$fallbackBin= Join-Path $stubRoot 'fallback'   # gemini.ps1 only -> CLI-fallback (native) path
$commonBin  = Join-Path $stubRoot 'common'
foreach ($d in @($commonBin, $directBin, (Join-Path $directBin 'node_modules\@google\gemini-cli\bundle'), $fallbackBin)) {
    New-Item -ItemType Directory -Path $d -Force | Out-Null
}

# record-gemini-env.ps1: both Gemini stubs run it to record the environment and working folder the
# Gemini child actually received (gemini-launch.json in the run directory).
$recordGeminiEnv = Join-Path $stubRoot 'record-gemini-env.ps1'
@'
$cwd = (Get-Location).ProviderPath
[PSCustomObject]@{
    Cwd = $cwd
    Home = $env:HOME; UserProfile = $env:USERPROFILE; AppData = $env:APPDATA; LocalAppData = $env:LOCALAPPDATA
    GeminiCliHome = $env:GEMINI_CLI_HOME
    SystemSettings = $env:GEMINI_CLI_SYSTEM_SETTINGS_PATH; SystemDefaults = $env:GEMINI_CLI_SYSTEM_DEFAULTS_PATH
    TrustWorkspace = $env:GEMINI_CLI_TRUST_WORKSPACE
    ApiKey = $env:GEMINI_API_KEY
    Temp = $env:TEMP
    UnexpectedEnv = @('GH_TOKEN', 'GITHUB_TOKEN', 'ANTHROPIC_API_KEY', 'CLAUDE_CODE_OAUTH_TOKEN', 'HTTPS_PROXY',
        'HTTP_PROXY', 'NODE_OPTIONS', 'PYTHONPATH' | Where-Object { [Environment]::GetEnvironmentVariable($_) })
} | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $cwd 'gemini-launch.json')
'@ | Set-Content -LiteralPath $recordGeminiEnv -Encoding ASCII

# node.ps1: the CLI-direct path invokes `node <bundle>\gemini.js ...`. Capture argv, emit a fake report.
@'
$argsFile = $env:VS_POLICY_ARGS_FILE
$first = if ($args.Count -gt 0) { [string]$args[0] } else { '' }
if ($first -match 'gemini\.js') {
    if ($argsFile) { Add-Content -LiteralPath $argsFile -Value ("DIRECT`t" + ($args -join "`t")) }
    & $env:VS_RECORD_GEMINI_ENV
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
$runtime = [PSCustomObject]@{
    Cwd = (Get-Location).ProviderPath
    Temp = $env:TEMP
    UnexpectedEnv = @('GH_TOKEN', 'GITHUB_TOKEN', 'GEMINI_API_KEY', 'ANTHROPIC_API_KEY', 'HTTPS_PROXY', 'PYTHONPATH',
        'APPDATA', 'USERPROFILE' | Where-Object { [Environment]::GetEnvironmentVariable($_) })
    Argv = $args
}
$runtime | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $runDir 'download-launch.json')
$argline = $args -join ' '
$name = if ($argline -match 'audio-format mp3') { 'Fake_Audio.mp3' }
        elseif ($argline -match 'merge-output-format mp4') { 'Fake_Video.mp4' }
        else { 'Fake_Video.en.srt' }
Set-Content -LiteralPath (Join-Path $runDir $name) -Value ("fake media for " + $name) -Encoding ASCII
"[yt-dlp-stub] wrote $name"
'@ | Set-Content -LiteralPath (Join-Path $commonBin 'yt-dlp.ps1') -Encoding ASCII
Install-VideoScoutNativeStub (Join-Path $commonBin 'yt-dlp.ps1')

# gemini.ps1: the CLI fallback executable. Capture argv, emit a fake report.
$geminiShim = @'
$argsFile = $env:VS_POLICY_ARGS_FILE
if ($argsFile) { Add-Content -LiteralPath $argsFile -Value ("FALLBACK`t" + ($args -join "`t")) }
& $env:VS_RECORD_GEMINI_ENV
Write-Output '## 1. TL;DR'
Write-Output 'Fake CLI-fallback analysis body.'
exit 0
'@
# The DIRECT bin also needs a gemini.ps1 (feed-gemini resolves the shim to locate the bundle beside it).
$geminiShim | Set-Content -LiteralPath (Join-Path $directBin 'gemini.ps1') -Encoding ASCII
$geminiShim | Set-Content -LiteralPath (Join-Path $fallbackBin 'gemini.ps1') -Encoding ASCII
Install-VideoScoutNativeStub (Join-Path $fallbackBin 'gemini.ps1')
# A real (non-empty) bundle gemini.js beside the DIRECT shim so feed-gemini takes the node path.
'// stub bundle gemini.js (never executed; node.ps1 intercepts)' |
    Set-Content -LiteralPath (Join-Path $directBin 'node_modules\@google\gemini-cli\bundle\gemini.js') -Encoding ASCII
Install-VideoScoutNativeStub (Join-Path $directBin 'gemini.ps1')
Copy-Item (Join-Path $commonBin 'node.ps1') $directBin
Install-VideoScoutNativeStub (Join-Path $directBin 'node.ps1')

# Refusal layouts: a script-only Gemini (no npm bundle, no native gemini.exe), and an npm bundle with
# no node.exe beside it (the test hides node.exe on PATH too).
$scriptOnlyBin = Join-Path $stubRoot 'script-only'
$bundleNoNodeBin = Join-Path $stubRoot 'bundle-no-node'
New-Item -ItemType Directory -Path $scriptOnlyBin, (Join-Path $bundleNoNodeBin 'node_modules\@google\gemini-cli\bundle') -Force | Out-Null
$geminiShim | Set-Content -LiteralPath (Join-Path $scriptOnlyBin 'gemini.ps1') -Encoding ASCII
$geminiShim | Set-Content -LiteralPath (Join-Path $bundleNoNodeBin 'gemini.ps1') -Encoding ASCII
'// stub bundle gemini.js' |
    Set-Content -LiteralPath (Join-Path $bundleNoNodeBin 'node_modules\@google\gemini-cli\bundle\gemini.js') -Encoding ASCII

function New-RunId {
    $stamp = Get-Date -Format 'yyyyMMdd-HHmmss-fff'
    $hex = [Guid]::NewGuid().ToString('N').Substring(0, 8)
    "run-$stamp-$PID-$hex"
}

# Runs the REAL feed-gemini down a CLI FEED path (not -NoFeed) and returns the captured gemini argv.
function Invoke-FeedCapture {
    param([string]$RouteBin, [hashtable]$Params, [switch]$NoApiKey, [switch]$HideNode)
    $outDir = Join-Path $stubRoot ('out-' + [Guid]::NewGuid().ToString('N'))
    $argsFile = Join-Path $stubRoot ('args-' + [Guid]::NewGuid().ToString('N') + '.txt')
    function global:Start-Job   { [PSCustomObject]@{ Id = 1 } }
    function global:Wait-Job    { $true }
    function global:Receive-Job { '100|NA' }
    function global:Stop-Job    { }
    function global:Remove-Job  { }
    if ($HideNode) {
        # Hide node.exe only (a LOCAL shadow, gone when this function returns); every other lookup is real.
        $realGetCommand = $ExecutionContext.InvokeCommand.GetCommand('Get-Command', 'Cmdlet')
        function Get-Command {
            if ($args.Count -ge 1 -and "$($args[0])" -eq 'node.exe') { return $null }
            & $realGetCommand @args
        }
    }
    $savedPath = $env:PATH
    $savedKey = $env:GEMINI_API_KEY
    $env:VS_POLICY_ARGS_FILE = $argsFile
    $env:VS_RECORD_GEMINI_ENV = $recordGeminiEnv
    if ($NoApiKey) { Remove-Item Env:\GEMINI_API_KEY -ErrorAction SilentlyContinue }
    else { $env:GEMINI_API_KEY = 'fixture-gemini-key' }
    $env:PATH = "$RouteBin;$commonBin;$savedPath"
    try {
        Write-VideoScoutFixtureEnvironment -OutputRoot $outDir -Names 'VS_POLICY_ARGS_FILE', 'VS_RECORD_GEMINI_ENV'
        $p = @{ OutDir = $outDir } + $Params
        $failure = $null
        try { & $feedGemini @p 6>&1 2>&1 | Out-Null } catch { $failure = $_.Exception.Message }
        $captured = if (Test-Path -LiteralPath $argsFile) { Get-Content -LiteralPath $argsFile -Raw } else { '' }
        $run = Join-Path $outDir $Params.RunId
        $launchFile = Join-Path $run 'download-launch.json'
        $download = if (Test-Path -LiteralPath $launchFile) { Get-Content -LiteralPath $launchFile -Raw | ConvertFrom-Json }
        $geminiFile = Join-Path $run 'gemini-launch.json'
        $gemini = if (Test-Path -LiteralPath $geminiFile) { Get-Content -LiteralPath $geminiFile -Raw | ConvertFrom-Json }
        $manifestFile = Join-Path $run 'manifest.json'
        $manifest = if (Test-Path -LiteralPath $manifestFile) { Get-Content -LiteralPath $manifestFile -Raw -Encoding UTF8 | ConvertFrom-Json }
        [PSCustomObject]@{ Args = $captured; Error = $failure; Download = $download; Gemini = $gemini; Manifest = $manifest; Run = $run }
    }
    finally {
        $env:PATH = $savedPath
        if ($null -eq $savedKey) { Remove-Item Env:\GEMINI_API_KEY -ErrorAction SilentlyContinue }
        else { $env:GEMINI_API_KEY = $savedKey }
        Remove-Item Env:\VS_POLICY_ARGS_FILE, Env:\VS_RECORD_GEMINI_ENV -ErrorAction SilentlyContinue
        'Start-Job', 'Wait-Job', 'Receive-Job', 'Stop-Job', 'Remove-Job' |
            ForEach-Object { Remove-Item "function:global:$_" -ErrorAction SilentlyContinue }
    }
}

Describe 'Video Scout downloader process boundary' {
    It 'uses the run directory, clean environment, and an option terminator before the URL' {
        $values = @('GH_TOKEN', 'GITHUB_TOKEN', 'GEMINI_API_KEY', 'ANTHROPIC_API_KEY', 'HTTPS_PROXY', 'PYTHONPATH')
        $saved = @{}
        foreach ($name in $values) {
            $saved[$name] = [Environment]::GetEnvironmentVariable($name)
            [Environment]::SetEnvironmentVariable($name, 'fixture-only')
        }
        try {
            $r = Invoke-FeedCapture -RouteBin $fallbackBin -Params @{
                Url = $YT; VideoScout = $true; Mode = 'transcript'; NoFeed = $true; RunId = (New-RunId)
            }
            $r.Error | Should BeNullOrEmpty
            $r.Download.Cwd | Should Be $r.Run
            $r.Download.Temp | Should Be $r.Run
            @($r.Download.UnexpectedEnv).Count | Should Be 0
            ($r.Download.Argv -contains '--ignore-config') | Should Be $true
            ($r.Download.Argv -contains '--no-plugin-dirs') | Should Be $true
            $r.Download.Argv[-2] | Should Be '--'
            $r.Download.Argv[-1] | Should Be $YT
            # The transcript download flags reach yt-dlp as separate, unchanged arguments.
            $argv = @($r.Download.Argv)
            $i = [Array]::IndexOf($argv, '--write-auto-subs')
            $i | Should BeGreaterThan -1
            $argv[$i + 1] | Should Be '--write-subs'
            $c = [Array]::IndexOf($argv, '--convert-subs')
            $argv[$c + 1] | Should Be 'srt'
        }
        finally {
            foreach ($name in $values) { [Environment]::SetEnvironmentVariable($name, $saved[$name]) }
        }
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

Describe 'V5 policy wiring — --policy passed on the FALLBACK (native) CLI route' {
    It 'transcript: passes --policy <repo policy path> on the fallback route' {
        $r = Invoke-FeedCapture -RouteBin $fallbackBin -Params @{ Url = $YT; VideoScout = $true; Mode = 'transcript'; RunId = (New-RunId) }
        $r.Args | Should Match 'FALLBACK'
        $r.Args | Should Match '--policy'
        ($r.Args -match [regex]::Escape($policyPath)) | Should Be $true
        ($r.Args -match [regex]::Escape($policyLeaf)) | Should Be $true
    }
    It 'passes a quoted prompt as one fallback argument' {
        $r = Invoke-FeedCapture -RouteBin $fallbackBin -Params @{
            Url = $YT; VideoScout = $true; Mode = 'transcript'
            Prompt = 'Explain "one example" in plain language.'
            RunId = (New-RunId)
        }
        $fields = $r.Args.TrimEnd() -split "`t"
        $promptIndex = [Array]::IndexOf($fields, '-p') + 1
        $promptIndex | Should Be ($fields.Length - 1)
        $fields[$promptIndex] | Should Be 'Explain "one example" in plain language. @Fake_Video.en.srt'
    }

    It 'refuses a leading dash in a model or prompt value without invoking Gemini' {
        foreach ($field in @('Model', 'Prompt')) {
            $params = @{ Url = $YT; VideoScout = $true; Mode = 'transcript'; RunId = (New-RunId) }
            $params[$field] = '-example'
            $r = Invoke-FeedCapture -RouteBin $fallbackBin -Params $params
            $r.Args | Should BeNullOrEmpty
            $r.Error | Should Match 'must not start with a dash'
        }
    }

    It 'disables extensions on the fallback route' {
        $r = Invoke-FeedCapture -RouteBin $fallbackBin -Params @{ Url = $YT; VideoScout = $true; Mode = 'transcript'; RunId = (New-RunId) }
        $r.Args | Should Match "--extensions`tnone"
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

Describe 'Video Scout Gemini child process boundary (environment, profile, settings)' {
    $settingsPath = Join-Path $here 'config\video-scout-gemini-settings.json'
    $values = @('GH_TOKEN', 'GITHUB_TOKEN', 'ANTHROPIC_API_KEY', 'CLAUDE_CODE_OAUTH_TOKEN', 'HTTPS_PROXY', 'HTTP_PROXY',
        'NODE_OPTIONS', 'PYTHONPATH')
    foreach ($route in @(@{ Name = 'direct'; Bin = $directBin }, @{ Name = 'fallback'; Bin = $fallbackBin })) {
        It "passes only GEMINI_API_KEY and an isolated profile to Gemini on the $($route.Name) route" {
            $saved = @{}
            foreach ($name in $values) {
                $saved[$name] = [Environment]::GetEnvironmentVariable($name)
                [Environment]::SetEnvironmentVariable($name, 'fixture-only')
            }
            try {
                $r = Invoke-FeedCapture -RouteBin $route.Bin -Params @{ Url = $YT; VideoScout = $true; Mode = 'transcript'; RunId = (New-RunId) }
            }
            finally {
                foreach ($name in $values) { [Environment]::SetEnvironmentVariable($name, $saved[$name]) }
            }
            $r.Error | Should BeNullOrEmpty
            $r.Gemini | Should Not BeNullOrEmpty
            $geminiHome = Join-Path $r.Run '.gemini-home'
            $r.Gemini.Cwd | Should Be $r.Run
            $r.Gemini.Temp | Should Be $r.Run
            $r.Gemini.Home | Should Be $geminiHome
            $r.Gemini.UserProfile | Should Be $geminiHome
            $r.Gemini.AppData | Should Be $geminiHome
            $r.Gemini.LocalAppData | Should Be $geminiHome
            $r.Gemini.GeminiCliHome | Should Be $geminiHome
            $r.Gemini.SystemSettings | Should Be $settingsPath
            $r.Gemini.SystemDefaults | Should Be $settingsPath
            $r.Gemini.TrustWorkspace | Should Be 'true'
            $r.Gemini.ApiKey | Should Be 'fixture-gemini-key'
            @($r.Gemini.UnexpectedEnv).Count | Should Be 0
        }
    }
}

Describe 'Video Scout Gemini launch refusals (no Gemini call)' {
    It 'refuses the CLI launch when GEMINI_API_KEY is unset, and records the run as an error' {
        $r = Invoke-FeedCapture -RouteBin $fallbackBin -NoApiKey -Params @{ Url = $YT; VideoScout = $true; Mode = 'transcript'; RunId = (New-RunId) }
        $r.Args | Should BeNullOrEmpty
        $r.Error | Should Match 'GEMINI_API_KEY'
        $r.Manifest.outcome | Should Be 'error'
    }
    It 'refuses a Gemini install with no npm bundle and no native gemini.exe' {
        $r = Invoke-FeedCapture -RouteBin $scriptOnlyBin -Params @{ Url = $YT; VideoScout = $true; Mode = 'transcript'; RunId = (New-RunId) }
        $r.Args | Should BeNullOrEmpty
        $r.Error | Should Match 'npm bundle or native Gemini executable'
    }
    It 'refuses the npm bundle when no native Node can be found' {
        $r = Invoke-FeedCapture -RouteBin $bundleNoNodeBin -HideNode -Params @{ Url = $YT; VideoScout = $true; Mode = 'transcript'; RunId = (New-RunId) }
        $r.Args | Should BeNullOrEmpty
        $r.Error | Should Match 'could not find native Node'
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
