<#
.SYNOPSIS
  Behavioral Pester tests for the 9c default transcript-prompt wiring in feed-gemini.ps1.
.DESCRIPTION
  Run with: Invoke-Pester -Path scripts\feed-gemini-transcript-prompt.Tests.ps1

  These run the REAL feed-gemini.ps1 down its transcript CLI path with -NoFeed, so the
  actual default-brief wiring executes: run-dir + manifest creation, duration guard,
  yt-dlp invocation, SRT selection, prompt resolution, flattening, and the printed
  deferred `gemini -p` command. No network and no paid call anywhere:
    - yt-dlp is a stub yt-dlp.ps1 prepended to PATH (Get-YtDlpPath resolves via
      Get-Command; a .ps1 stub runs in-process, so the '%(title)s' output template is
      never mangled by cmd.exe). It writes a fake .srt into the run dir it is told.
    - the duration probe's Start-Job/Receive-Job layer is shadowed with globals (same
      seam as feed-gemini.Tests.ps1) feeding a deterministic '100|NA' probe line.
    - -NoFeed returns after printing the deferred command, before any gemini use.
  Scope discipline: this proves the transcript-prompt WIRING (default helper used, custom
  -Prompt overrides, truthful completed manifest, srt retained). Audio/video defaults and
  the SRT download flags are asserted at source level below -- exercising those modes for
  real would drag in mp3/mp4 plumbing this prompt-only branch does not touch.
#>
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$feedGemini = Join-Path $here 'feed-gemini.ps1'
$YT = 'https://youtu.be/aqz-KE-bpKQ'
$en = [char]0x2013

# --- harness ------------------------------------------------------------------------------------
$stubRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("ts-wiring-" + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $stubRoot -Force | Out-Null

# Stub yt-dlp: finds the '-o <template>' argument feed-gemini passed, writes a fake SRT into
# that run directory, prints one recognizable line. No param() block: the real call passes a
# long option list and $args must swallow all of it.
@'
$template = $null
for ($i = 0; $i -lt $args.Count; $i++) { if ($args[$i] -eq '-o') { $template = $args[$i + 1] } }
if (-not $template) { throw 'yt-dlp stub: no -o template argument found' }
$runDir = Split-Path -Parent $template
$srt = Join-Path $runDir 'Fake_Test_Video.en.srt'
$cue = "1`r`n00:00:01,000 --> 00:00:03,500`r`nHello from the fake captions.`r`n"
Set-Content -LiteralPath $srt -Value $cue -Encoding ASCII
"[yt-dlp-stub] wrote $srt"
'@ | Set-Content -LiteralPath (Join-Path $stubRoot 'yt-dlp.ps1') -Encoding ASCII

function Invoke-TranscriptNoFeed {
    param([string]$CustomPrompt)
    $outDir = Join-Path $stubRoot ('out-' + [Guid]::NewGuid().ToString('N'))
    # Shadow the probe's job layer (deterministic 100s, not live) and put the stub first on PATH.
    function global:Start-Job   { [PSCustomObject]@{ Id = 1 } }
    function global:Wait-Job    { $true }
    function global:Receive-Job { '100|NA' }
    function global:Stop-Job    { }
    function global:Remove-Job  { }
    $savedPath = $env:PATH
    $env:PATH = "$stubRoot;$env:PATH"
    try {
        $params = @{ Url = $YT; Mode = 'transcript'; NoFeed = $true; OutDir = $outDir }
        if ($CustomPrompt) { $params.Prompt = $CustomPrompt }
        # 6>&1 folds Write-Host (information stream) into the captured transcript output.
        # -Width 32767: without it Out-String wraps at console width and splits the long
        # single-line deferred gemini command across inserted newlines.
        $text = (& $feedGemini @params 6>&1 | Out-String -Width 32767)
        $runDir = Get-ChildItem -Path $outDir -Directory -Filter 'run-*' | Select-Object -First 1
        [PSCustomObject]@{
            Output   = $text
            RunDir   = $runDir.FullName
            Manifest = (Get-Content -LiteralPath (Join-Path $runDir.FullName 'manifest.json') -Raw -Encoding UTF8 | ConvertFrom-Json)
        }
    } finally {
        $env:PATH = $savedPath
        'Start-Job', 'Wait-Job', 'Receive-Job', 'Stop-Job', 'Remove-Job' |
            ForEach-Object { Remove-Item "function:global:$_" -ErrorAction SilentlyContinue }
    }
}

Describe 'feed-gemini transcript default prompt wiring (behavioral, -NoFeed, no network)' {

    $run = Invoke-TranscriptNoFeed

    It 'announces the timestamped default brief with one bounded line (no content)' {
        $run.Output | Should Match 'Timestamped transcript brief requested \(default prompt\)'
    }

    It 'prints the deferred gemini command carrying the timestamp contract' {
        $run.Output | Should Match 'gemini -m '
        $run.Output | Should Match 'Never invent, estimate, or extrapolate a timestamp'
        $run.Output.Contains("[HH:MM:SS${en}HH:MM:SS]") | Should Be $true
        $run.Output | Should Match 'exact whole-second integer values'
    }

    It 'attaches the SRT this run downloaded to the deferred command' {
        $run.Output | Should Match '@Fake_Test_Video\.en\.srt'
    }

    It 'flattens the multi-line brief onto the single deferred command line' {
        $cmdLine = ($run.Output -split "`r?`n") | Where-Object { $_ -match 'gemini -m ' } | Select-Object -First 1
        $cmdLine | Should Not BeNullOrEmpty
        $cmdLine | Should Match 'KEY POINTS'
        $cmdLine | Should Match '@Fake_Test_Video\.en\.srt'
    }

    It 'keeps the .srt in the run directory' {
        Test-Path (Join-Path $run.RunDir 'Fake_Test_Video.en.srt') | Should Be $true
    }

    It 'finalizes a truthful completed manifest for the -NoFeed run' {
        $run.Manifest.outcome | Should Be 'completed'
        $run.Manifest.appliedMode | Should Be 'transcript'
    }
}

Describe 'feed-gemini custom -Prompt remains a complete override (behavioral)' {

    $run = Invoke-TranscriptNoFeed -CustomPrompt 'CUSTOM-OVERRIDE-MARKER just the plain summary please'

    It 'uses the caller prompt verbatim in the deferred command' {
        $run.Output | Should Match 'CUSTOM-OVERRIDE-MARKER just the plain summary please @Fake_Test_Video\.en\.srt'
    }

    It 'does not invoke the timestamped default brief at all' {
        $run.Output | Should Not Match 'Timestamped transcript brief requested'
        $run.Output | Should Not Match 'Never invent, estimate, or extrapolate'
    }

    It 'still completes the manifest truthfully' {
        $run.Manifest.outcome | Should Be 'completed'
    }
}

Describe 'adjacent defaults untouched (source-scope guards)' {

    $src = Get-Content -LiteralPath $feedGemini -Raw -Encoding UTF8

    It 'keeps the audio default brief unchanged' {
        $src.Contains("'audio'      { `"Summarize what is said in this audio, and note the tone.`" }") | Should Be $true
    }

    It 'keeps the video default brief unchanged' {
        $src.Contains("'video'      { `"Describe what happens in this video and summarize the key points.`" }") | Should Be $true
    }

    It 'keeps the SRT download flags unchanged' {
        $src | Should Match '--write-auto-subs --write-subs'
        $src | Should Match '--convert-subs srt'
    }

    It 'wires the transcript helper only inside the no-custom-prompt default switch' {
        # The helper must appear exactly once, inside the `if (-not $Prompt)` default-briefs block.
        ([regex]::Matches($src, 'Get-TranscriptPrompt')).Count | Should Be 1
        $src | Should Match '(?s)if \(-not \$Prompt\) \{.{0,1200}Get-TranscriptPrompt'
    }
}

# --- trailing cleanup (Pester 3.4 pattern: no AfterAll) -------------------------------------------
Remove-Item -LiteralPath $stubRoot -Recurse -Force -ErrorAction SilentlyContinue
