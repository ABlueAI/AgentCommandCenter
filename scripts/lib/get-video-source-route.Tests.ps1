<#
.SYNOPSIS
  Pester tests for Resolve-VideoSourceRoute (SDK-vs-CLI routing for video-scout).
.DESCRIPTION
  Run with: Invoke-Pester -Path scripts\lib\get-video-source-route.Tests.ps1
#>
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
. (Join-Path $here 'get-video-source-route.ps1')

Describe 'Resolve-VideoSourceRoute' {

    It 'routes a youtube.com watch URL in video mode to the SDK' {
        (Resolve-VideoSourceRoute -Url 'https://www.youtube.com/watch?v=abc123' -Mode video).Route | Should Be 'sdk'
    }

    It 'routes a youtu.be short URL in video mode to the SDK' {
        (Resolve-VideoSourceRoute -Url 'https://youtu.be/abc123' -Mode video).Route | Should Be 'sdk'
    }

    It 'routes m.youtube.com (mobile) in video mode to the SDK' {
        (Resolve-VideoSourceRoute -Url 'https://m.youtube.com/watch?v=abc123' -Mode video).Route | Should Be 'sdk'
    }

    It 'routes a Vimeo URL to the CLI (fileUri only ingests YouTube)' {
        (Resolve-VideoSourceRoute -Url 'https://vimeo.com/12345' -Mode video).Route | Should Be 'cli'
    }

    It 'routes transcript mode to the CLI even for a YouTube URL (needs yt-dlp .srt)' {
        (Resolve-VideoSourceRoute -Url 'https://www.youtube.com/watch?v=abc123' -Mode transcript).Route | Should Be 'cli'
    }

    It 'routes audio mode to the CLI even for a YouTube URL (needs yt-dlp .mp3)' {
        (Resolve-VideoSourceRoute -Url 'https://youtu.be/abc123' -Mode audio).Route | Should Be 'cli'
    }

    It 'routes -NoFeed to the CLI even for a YouTube video run (caller wants the file on disk)' {
        (Resolve-VideoSourceRoute -Url 'https://youtu.be/abc123' -Mode video -NoFeed).Route | Should Be 'cli'
    }

    It 'routes a non-URL input (local file path) to the CLI' {
        (Resolve-VideoSourceRoute -Url 'C:\videos\local.mp4' -Mode video).Route | Should Be 'cli'
    }

    It 'is case-insensitive on the host' {
        (Resolve-VideoSourceRoute -Url 'https://WWW.YOUTUBE.COM/watch?v=abc' -Mode video).Route | Should Be 'sdk'
    }

    It 'does not route a lookalike host (notyoutube.com) to the SDK' {
        (Resolve-VideoSourceRoute -Url 'https://notyoutube.com/watch?v=abc' -Mode video).Route | Should Be 'cli'
    }

    It 'always returns a human-readable reason' {
        (Resolve-VideoSourceRoute -Url 'https://youtu.be/abc' -Mode video).Reason | Should Not BeNullOrEmpty
        (Resolve-VideoSourceRoute -Url 'https://vimeo.com/1' -Mode video).Reason | Should Not BeNullOrEmpty
    }
}
