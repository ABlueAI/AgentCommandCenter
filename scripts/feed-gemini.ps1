<#
.SYNOPSIS
  Download a video/link with yt-dlp and feed it straight to the Gemini CLI.
.DESCRIPTION
  One command to turn a URL into agent context. Pick a mode:
    transcript  (default) - grabs auto-subtitles as .srt  (cheapest; text only)
    audio                  - extracts .mp3                  (tone/speech matters)
    video                  - downloads the .mp4 <=720p      (visuals matter)
  Files land in D:\Gemini_Video_Review\downloads (or override with -OutDir) with
  --restrict-filenames so the names are space-free and safe to pass to Gemini's
  @file references. Unless -NoFeed is set,
  the downloaded file is then handed to `gemini -p` with a default (or -Prompt) brief.
.EXAMPLE
  .\feed-gemini.ps1 "https://youtu.be/XYZ"
.EXAMPLE
  .\feed-gemini.ps1 "https://youtu.be/XYZ" -Mode video -Prompt "What UI patterns appear?"
.EXAMPLE
  .\feed-gemini.ps1 "https://youtu.be/XYZ" -Mode audio -NoFeed   # just download
.EXAMPLE
  .\feed-gemini.ps1 "https://youtu.be/XYZ" -VideoScout -Model gemini-2.5-pro -MediaResolution HIGH
.EXAMPLE
  .\feed-gemini.ps1 "https://youtu.be/XYZ" -VideoScout -Mode transcript   # cheap text-only pass
#>
param(
    [Parameter(Mandatory = $true, Position = 0)][string]$Url,
    [ValidateSet('transcript', 'audio', 'video')][string]$Mode = 'transcript',
    [string]$Prompt,
    [string]$OutDir = 'D:\Gemini_Video_Review\downloads',
    [string]$Lang = 'en',
    # Gemini CLI model (`-m`). Default is the cheapest vision-capable tier. See
    # lib/get-gemini-launch-config.ps1 for the full model/resolution-vs-download-resolution note.
    [string]$Model = 'gemini-2.5-flash-lite',
    # Intended per-request token-cost tier for image/video frames (LOW/MEDIUM/HIGH). NOTE: the
    # installed Gemini CLI has no flag or settings.json key for this on the -p path yet, so this
    # is currently logged (and validated) but not sent to the CLI -- see the warning printed at
    # launch and lib/get-gemini-launch-config.ps1 for why, and the closest available alternatives.
    [ValidateSet('LOW', 'MEDIUM', 'HIGH')][string]$MediaResolution = 'MEDIUM',
    # Optional slice bounds in whole seconds, SDK (YouTube) route only: analyze just
    # [StartOffset, EndOffset] of the video. Billing scales to the slice (proven ~81% cheaper for
    # 2min of a 10min video). Both must be given; a lone one is warned about and ignored. The
    # modal has no range picker yet -- these exist so the plumbing is already in place.
    [ValidateRange(0, 86400)][int]$StartOffset = -1,
    [ValidateRange(0, 86400)][int]$EndOffset = -1,
    [switch]$NoFeed,
    [switch]$VideoScout
)
$ErrorActionPreference = "Stop"

# Resolve + log the model/media-resolution launch config first, before any download happens, so
# every run records what tier it used at the top of the Logs tab output.
. (Join-Path $PSScriptRoot 'lib\get-gemini-launch-config.ps1')
. (Join-Path $PSScriptRoot 'lib\get-node-cli-arg.ps1')
$launchConfig = Resolve-GeminiLaunchConfig -Model $Model -MediaResolution $MediaResolution
Write-Host $launchConfig.LogLine -ForegroundColor DarkCyan
Write-Warning $launchConfig.Warning

# Video-scout: default to full video mode, but respect an explicitly passed -Mode so the app's
# launcher (or a CLI caller) can choose a cheaper transcript/audio-only pass. Bare `-VideoScout`
# with no -Mode keeps the historical behavior (full visual analysis) so existing invocations are
# unchanged. The forensic-analyst brief from prompts/video-scout-analysis.md only applies in video
# mode -- it instructs analyzing the visual stream and on-screen text, which don't exist in an
# .srt/.mp3, so transcript/audio runs fall through to the per-mode default briefs below instead.
if ($VideoScout) {
    if (-not $PSBoundParameters.ContainsKey('Mode')) { $Mode = 'video' }
    Write-Host "Video-scout analysis mode: $Mode $(if ($Mode -eq 'video') { '(full visual analysis -- highest token cost)' } else { '(no visual tokens -- cheaper pass)' })" -ForegroundColor DarkCyan

    # --- route: SDK (YouTube direct) vs CLI (yt-dlp download + attach) ----------------------
    # YouTube URLs in video mode skip the download entirely: the Gemini API ingests the URL as a
    # fileData.fileUri part. This dodges the CLI's 20MB inline-attach cap (which every real 720p
    # video exceeds -- the CLI then silently sends the prompt WITHOUT the video) and makes
    # -MediaResolution actually take effect. Everything else falls through to the CLI path below,
    # which is unchanged. See lib/get-video-source-route.ps1 for the exact rules.
    . (Join-Path $PSScriptRoot 'lib\get-video-source-route.ps1')
    $sourceRoute = Resolve-VideoSourceRoute -Url $Url -Mode $Mode -NoFeed:$NoFeed
    Write-Host "Video-scout route: $($sourceRoute.Route.ToUpper()) -- $($sourceRoute.Reason)" -ForegroundColor DarkCyan
    if ($sourceRoute.Route -eq 'sdk') {
        # Correct the CLI-oriented warning Resolve-GeminiLaunchConfig printed above (line ~54):
        # on THIS route -MediaResolution is a real generationConfig field, sent and enforced by
        # the API -- the opposite of what that warning says. Rather than special-case the shared
        # launch-config helper for a route it doesn't know about, print the correction here.
        Write-Host "NOTE: on the SDK route (this run), -MediaResolution IS sent to the Gemini API and IS enforced -- the CLI warning above does not apply here." -ForegroundColor DarkCyan
        $sdkScript = Join-Path $PSScriptRoot 'gemini-video-sdk.js'
        $sdkArgs = @('--url', $Url, '--model', $Model, '--media-resolution', $MediaResolution)
        if ($Prompt) {
            # Explicit -Prompt override: cross the PS 5.1 -> node boundary with the same
            # CommandLineToArgvW-correct escaping the CLI path uses (see lib/get-node-cli-arg.ps1).
            $sdkArgs += @('--prompt-text', (ConvertTo-NodeCliArg -Arg $Prompt))
        }
        else {
            # Default forensic brief: hand node the FILE, not the text -- no argument-boundary
            # escaping and no newline flattening needed; the brief arrives with full fidelity.
            $sdkArgs += @('--prompt-file', (Join-Path (Split-Path $PSScriptRoot -Parent) 'prompts\video-scout-analysis.md'))
        }
        $haveStart = $PSBoundParameters.ContainsKey('StartOffset')
        $haveEnd = $PSBoundParameters.ContainsKey('EndOffset')
        if ($haveStart -and $haveEnd) {
            $sdkArgs += @('--start-offset', $StartOffset, '--end-offset', $EndOffset)
        }
        elseif ($haveStart -or $haveEnd) {
            Write-Warning "Both -StartOffset and -EndOffset are required to analyze a slice; the lone one was ignored and the whole video will be analyzed."
        }
        & node $sdkScript @sdkArgs
        return
    }

    if (-not $Prompt -and $Mode -eq 'video') {
        . (Join-Path $PSScriptRoot 'lib\get-video-scout-prompt.ps1')
        $Prompt = Get-VideoScoutPrompt
    }
}

# --- locate tools (PATH may be stale right after install / inside the app) -----
$ytdlp = (Get-Command yt-dlp -ErrorAction SilentlyContinue).Source
if (-not $ytdlp) { throw "yt-dlp not found on PATH. Restart your terminal after install, or run: winget install yt-dlp.yt-dlp" }

$gemini = (Get-Command gemini -ErrorAction SilentlyContinue).Source
if (-not $gemini) {
    $fallback = Join-Path $env:APPDATA "npm\gemini.cmd"
    if (Test-Path $fallback) { $gemini = $fallback }
}

# --- prepare output folder -----------------------------------------------------
if (-not (Test-Path $OutDir)) { New-Item -ItemType Directory -Path $OutDir | Out-Null }
$outTemplate = Join-Path $OutDir "%(title)s.%(ext)s"

# --- safety caps (shared across modes) -----------------------------------------
# A single URL should never pull a whole playlist, an oversized file, or a multi-hour VOD.
# These bound disk + cost and shrink the attack surface of a pasted link. Tune (?) as needed.
$MaxFileSize = '600M'                       # (?) hard cap per download
$MaxDuration = 5400                         # (?) seconds (90 min); longer videos are skipped
$ytCommon = @(
    '--no-playlist',                        # one item only, even if the URL is a playlist
    '--max-filesize', $MaxFileSize,
    '--match-filter', "duration < $MaxDuration"
)

# --- per-mode yt-dlp invocation ------------------------------------------------
Write-Host "Downloading ($Mode): $Url" -ForegroundColor Cyan
switch ($Mode) {
    'transcript' {
        & $ytdlp @ytCommon --restrict-filenames --skip-download --write-auto-subs --write-subs `
            --sub-lang $Lang --convert-subs srt -o $outTemplate $Url
        $pattern = "*.srt"
    }
    'audio' {
        & $ytdlp @ytCommon --restrict-filenames -x --audio-format mp3 -o $outTemplate $Url
        $pattern = "*.mp3"
    }
    'video' {
        & $ytdlp @ytCommon --restrict-filenames -f "bv*+ba/b" -S "res:720" `
            --merge-output-format mp4 -o $outTemplate $Url
        $pattern = "*.mp4"
    }
}

# --- find what we just produced (newest matching file) -------------------------
$file = Get-ChildItem $OutDir -Filter $pattern -File |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $file) { throw "Download finished but no $pattern file appeared in $OutDir." }

Write-Host ""
Write-Host "Saved: $($file.FullName)" -ForegroundColor Green

# --- default briefs per mode ---------------------------------------------------
if (-not $Prompt) {
    $Prompt = switch ($Mode) {
        'transcript' { "Summarize this transcript: the key points first, then notable details." }
        'audio'      { "Summarize what is said in this audio, and note the tone." }
        'video'      { "Describe what happens in this video and summarize the key points." }
    }
}

# --- flatten the prompt to a single line before it becomes a CLI argument ------
# Newline flattening keeps the multi-line -VideoScout brief (loaded from
# prompts/video-scout-analysis.md) on one physical line. This is one of two delivery concerns on
# the Windows PowerShell 5.1 -> node.exe argument boundary; the other -- embedded double quotes --
# is handled separately by ConvertTo-NodeCliArg at the actual `& node` invocation below (quotes
# can't be flattened away because they're semantically meaningful in the brief). See
# lib/get-cli-safe-prompt.ps1 and lib/get-node-cli-arg.ps1 for the full mechanism.
. (Join-Path $PSScriptRoot 'lib\get-cli-safe-prompt.ps1')
$Prompt = Get-CliSafePrompt -Prompt $Prompt

if ($NoFeed) {
    Write-Host ""
    Write-Host "Skipped feeding (-NoFeed). To send it to Gemini later, run from ${OutDir}:" -ForegroundColor Cyan
    Write-Host "  gemini -m $Model -p `"$Prompt @$($file.Name)`""
    return
}

if (-not $gemini) {
    Write-Host ""
    Write-Host "Gemini CLI not found. File is saved above. Install/login, then run from ${OutDir}:" -ForegroundColor Yellow
    Write-Host "  gemini -m $Model -p `"$Prompt @$($file.Name)`""
    return
}

# --- feed Gemini (run from trusted root so Gemini's folder-trust check passes) --
# We do NOT call the `gemini` shim (.ps1/.cmd) here, and the reason is subtle. Both shims end in
# `node <bundle>\gemini.js <args>`, so the runtime is a direct node call either way -- but the
# PowerShell 5.1 -> node.exe argument boundary does not escape a value's embedded double quotes
# (no PSNativeCommandArgumentPassing before PS 7.3). The -VideoScout brief contains literal "
# characters, so node's C runtime splits the single -p value into multiple bare tokens, and gemini
# aborts: "Cannot use both a positional prompt and the --prompt (-p) flag together". Routing
# through the shim can't be fixed from here because the shim does its OWN uncontrolled
# `& node ... $args` re-serialization across that same boundary. So we resolve the shim's node
# entry point ourselves and invoke node directly, applying CommandLineToArgvW-correct escaping
# (ConvertTo-NodeCliArg) to the one -p value -- see lib/get-node-cli-arg.ps1.
#
# gemini.js sits beside the shim at <shim dir>\node_modules\@google\gemini-cli\bundle\gemini.js
# (this is exactly the path the shim itself runs). node is located the same way the shim locates
# it: prefer a node.exe next to the shim, else the `node` on PATH.
$geminiDir = Split-Path $gemini -Parent
$geminiJs  = Join-Path $geminiDir 'node_modules\@google\gemini-cli\bundle\gemini.js'
$nodeExe   = if (Test-Path -LiteralPath (Join-Path $geminiDir 'node.exe')) { Join-Path $geminiDir 'node.exe' } else { 'node' }

Write-Host ""
Write-Host "Feeding to Gemini..." -ForegroundColor Cyan
$geminiCwd = Split-Path $OutDir -Parent
Push-Location $geminiCwd
try {
    # -MediaResolution is intentionally NOT passed here: the gemini CLI has no flag for it on the
    # -p path (see lib/get-gemini-launch-config.ps1). Only -m/$Model is a real CLI knob today.
    if (Test-Path -LiteralPath $geminiJs) {
        $pArg = ConvertTo-NodeCliArg -Arg "$Prompt @$($file.FullName)"
        & $nodeExe $geminiJs -m $Model -p $pArg
    }
    else {
        # Unknown gemini layout (no npm bundle beside the shim, e.g. a standalone .exe install).
        # Fall back to the shim so this keeps working, but warn: a prompt with embedded quotes may
        # be misparsed on this path, since we no longer control the final argument serialization.
        Write-Warning "Could not locate gemini.js beside '$gemini'; falling back to the gemini shim. A prompt containing embedded double quotes may be misparsed on this fallback path."
        & $gemini -m $Model -p "$Prompt @$($file.FullName)"
    }
}
finally {
    Pop-Location
}
