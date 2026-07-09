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
    It 'exits non-zero (not 0) when a lone offset is passed' {
        & powershell -NoProfile -NoLogo -ExecutionPolicy Bypass -File $feedGemini -Url $YT -VideoScout -StartOffset 10 2>$null
        $LASTEXITCODE | Should Not Be 0
    }
}
