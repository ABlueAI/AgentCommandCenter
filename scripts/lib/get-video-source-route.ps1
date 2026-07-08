<#
.SYNOPSIS
  Decide whether a video-scout run goes through the Gemini SDK/REST path or the yt-dlp+CLI path.
.DESCRIPTION
  The Gemini API accepts a PUBLIC YouTube URL directly as a fileData.fileUri video part -- no
  download, no file-size cap, and generationConfig.mediaResolution actually applies. The gemini
  CLI's @file attachment, by contrast, is inline base64 with a hard 20MB cap that every real 720p
  video exceeds (the CLI then silently sends the prompt text WITHOUT the video). So:

    sdk  - YouTube URL + video mode + actually feeding (not -NoFeed): the whole yt-dlp download
           step is skipped and the URL goes straight into generateContent.
    cli  - everything else: transcript/audio modes (they NEED yt-dlp's .srt/.mp3 output),
           non-YouTube hosts (fileUri only ingests YouTube), and -NoFeed (the caller explicitly
           wants the downloaded file on disk).

  The YouTube host list must stay in sync with the YouTube subset of VIDEO_HOSTS in app/main.js
  (the launch-side URL allowlist) -- main.js is the security boundary, this is only routing.
#>
function Resolve-VideoSourceRoute {
    param(
        [Parameter(Mandatory = $true)][string]$Url,
        [ValidateSet('transcript', 'audio', 'video')][string]$Mode = 'video',
        [switch]$NoFeed
    )
    $youtubeHosts = @('youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be')

    if ($NoFeed) {
        return [PSCustomObject]@{ Route = 'cli'; Reason = '-NoFeed requested: caller wants the downloaded file, so the yt-dlp path applies' }
    }
    if ($Mode -ne 'video') {
        return [PSCustomObject]@{ Route = 'cli'; Reason = "mode '$Mode' needs yt-dlp's local output (.srt/.mp3); SDK path is video-only" }
    }
    $parsed = $null
    try { $parsed = [System.Uri]$Url } catch { }
    if (-not $parsed -or -not $parsed.IsAbsoluteUri) {
        return [PSCustomObject]@{ Route = 'cli'; Reason = 'input is not an absolute URL (local file or malformed) -- CLI path handles it' }
    }
    if ($youtubeHosts -contains $parsed.Host.ToLowerInvariant()) {
        return [PSCustomObject]@{ Route = 'sdk'; Reason = "YouTube URL + video mode: Gemini API ingests the URL directly (no download, no 20MB cap, mediaResolution enforced)" }
    }
    return [PSCustomObject]@{ Route = 'cli'; Reason = "host '$($parsed.Host)' is not YouTube; fileUri ingestion only supports YouTube, so download + CLI attach applies" }
}
