<#
.SYNOPSIS
  Download a video/link with yt-dlp and feed it straight to the Gemini CLI.
.DESCRIPTION
  One command to turn a URL into agent context. Pick a mode:
    transcript  (default) - grabs auto-subtitles as .srt  (cheapest; text only)
    audio                  - extracts .mp3                  (tone/speech matters)
    video                  - downloads the .mp4 <=720p      (visuals matter)
  Files land in .\media (or -OutDir) with --restrict-filenames so the names are
  space-free and safe to pass to Gemini's @file references. Unless -NoFeed is set,
  the downloaded file is then handed to `gemini -p` with a default (or -Prompt) brief.
.EXAMPLE
  .\feed-gemini.ps1 "https://youtu.be/XYZ"
.EXAMPLE
  .\feed-gemini.ps1 "https://youtu.be/XYZ" -Mode video -Prompt "What UI patterns appear?"
.EXAMPLE
  .\feed-gemini.ps1 "https://youtu.be/XYZ" -Mode audio -NoFeed   # just download
#>
param(
    [Parameter(Mandatory = $true, Position = 0)][string]$Url,
    [ValidateSet('transcript', 'audio', 'video')][string]$Mode = 'transcript',
    [string]$Prompt,
    [string]$OutDir = (Join-Path (Get-Location) 'media'),
    [string]$Lang = 'en',
    [switch]$NoFeed
)
$ErrorActionPreference = "Stop"

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

# --- per-mode yt-dlp invocation ------------------------------------------------
Write-Host "Downloading ($Mode): $Url" -ForegroundColor Cyan
switch ($Mode) {
    'transcript' {
        & $ytdlp --restrict-filenames --skip-download --write-auto-subs --write-subs `
            --sub-lang $Lang --convert-subs srt -o $outTemplate $Url
        $pattern = "*.srt"
    }
    'audio' {
        & $ytdlp --restrict-filenames -x --audio-format mp3 -o $outTemplate $Url
        $pattern = "*.mp3"
    }
    'video' {
        & $ytdlp --restrict-filenames -f "bv*+ba/b" -S "res:720" `
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

if ($NoFeed) {
    Write-Host ""
    Write-Host "Skipped feeding (-NoFeed). To send it to Gemini later, run from ${OutDir}:" -ForegroundColor Cyan
    Write-Host "  gemini -p `"$Prompt @$($file.Name)`""
    return
}

if (-not $gemini) {
    Write-Host ""
    Write-Host "Gemini CLI not found. File is saved above. Install/login, then run from ${OutDir}:" -ForegroundColor Yellow
    Write-Host "  gemini -p `"$Prompt @$($file.Name)`""
    return
}

# --- feed Gemini (run from OutDir so the @ reference is a clean relative name) --
Write-Host ""
Write-Host "Feeding to Gemini..." -ForegroundColor Cyan
Push-Location $OutDir
try {
    & $gemini -p "$Prompt @$($file.Name)"
}
finally {
    Pop-Location
}
