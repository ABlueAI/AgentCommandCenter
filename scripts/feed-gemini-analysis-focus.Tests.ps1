<#
.SYNOPSIS
  Behavioral Pester tests for the V3a -AnalysisFocus wiring in feed-gemini.ps1.
.DESCRIPTION
  Run with: Invoke-Pester -Path scripts\feed-gemini-analysis-focus.Tests.ps1

  Reuses the transcript -NoFeed harness (see feed-gemini-transcript-prompt.Tests.ps1): the REAL
  feed-gemini.ps1 runs down its transcript CLI path with -NoFeed, so the actual focus normalization +
  prompt-composition wiring executes, and the deferred `gemini -p "<prompt> @file"` command it prints
  contains the FINAL composed prompt. No network and no paid call anywhere (yt-dlp stubbed on PATH; the
  duration-probe job layer shadowed with a deterministic 100s line; -NoFeed returns before any gemini
  use). SDK-route behavior and provider-call count are asserted at SOURCE level below — exercising the
  SDK path for real would drag in node/gemini plumbing this prompt-only branch does not touch (the same
  scope discipline the transcript-prompt suite uses for audio/video).
#>
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$feedGemini = Join-Path $here 'feed-gemini.ps1'
$YT = 'https://youtu.be/aqz-KE-bpKQ'
$FOCUS = 'Prioritize PRICING_OBJECTIONS and onboarding friction'

# --- harness ------------------------------------------------------------------------------------
$stubRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("af-wiring-" + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $stubRoot -Force | Out-Null

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

function Invoke-FocusNoFeed {
    param([string]$AnalysisFocus)
    $outDir = Join-Path $stubRoot ('out-' + [Guid]::NewGuid().ToString('N'))
    function global:Start-Job   { [PSCustomObject]@{ Id = 1 } }
    function global:Wait-Job    { $true }
    function global:Receive-Job { '100|NA' }
    function global:Stop-Job    { }
    function global:Remove-Job  { }
    $savedPath = $env:PATH
    $env:PATH = "$stubRoot;$env:PATH"
    try {
        $params = @{ Url = $YT; Mode = 'transcript'; NoFeed = $true; OutDir = $outDir }
        if ($PSBoundParameters.ContainsKey('AnalysisFocus')) { $params.AnalysisFocus = $AnalysisFocus }
        $text = (& $feedGemini @params 6>&1 | Out-String -Width 32767)
        $runDir = Get-ChildItem -Path $outDir -Directory -Filter 'run-*' | Select-Object -First 1
        [PSCustomObject]@{
            Output       = $text
            ManifestRaw  = (Get-Content -LiteralPath (Join-Path $runDir.FullName 'manifest.json') -Raw -Encoding UTF8)
        }
    } finally {
        $env:PATH = $savedPath
        'Start-Job', 'Wait-Job', 'Receive-Job', 'Stop-Job', 'Remove-Job' |
            ForEach-Object { Remove-Item "function:global:$_" -ErrorAction SilentlyContinue }
    }
}

Describe 'feed-gemini -AnalysisFocus wiring (behavioral, -NoFeed, no network)' {

    Context 'focus ABSENT: base brief unchanged' {
        $run = Invoke-FocusNoFeed
        It 'still emits the default timestamped transcript brief' {
            $run.Output | Should Match 'Timestamped transcript brief requested'
        }
        It 'does NOT add the preservation instruction (no composition happened)' {
            $run.Output | Should Not Match 'preserving every required report section'
        }
        It 'does NOT log an "Analysis focus applied" line' {
            $run.Output | Should Not Match 'Analysis focus applied'
        }
    }

    Context 'focus PRESENT: composed onto the base brief' {
        $run = Invoke-FocusNoFeed -AnalysisFocus $FOCUS
        It 'includes the user focus text in the composed prompt' {
            $run.Output | Should Match 'PRICING_OBJECTIONS'
        }
        It 'includes the report-structure-preservation instruction' {
            $run.Output | Should Match 'preserving every required report section'
        }
        It 'places the preservation instruction BEFORE the user focus text' {
            $preserveIdx = $run.Output.IndexOf('preserving every required report section')
            $focusIdx = $run.Output.LastIndexOf('PRICING_OBJECTIONS')
            $preserveIdx | Should BeGreaterThan -1
            $focusIdx | Should BeGreaterThan $preserveIdx
        }
        It 'logs only the metadata line (char count), which is present' {
            $run.Output | Should Match 'Analysis focus applied \(chars=\d+\)'
        }
        It 'does NOT write the focus text into the manifest (no schema change)' {
            $run.ManifestRaw | Should Not Match 'PRICING_OBJECTIONS'
        }
        It 'still records a truthful completed manifest (focus does not change the outcome)' {
            $run.ManifestRaw | Should Match '"outcome"\s*:\s*"completed"'
        }
    }

    Context 'invalid focus REFUSES before any spend' {
        It 'throws on a 2001-character focus (never truncates)' {
            { Invoke-FocusNoFeed -AnalysisFocus ('x' * 2001) } | Should Throw 'too long'
        }
        It 'throws on a forbidden control character' {
            { Invoke-FocusNoFeed -AnalysisFocus ("bad" + [char]0x00 + "focus") } | Should Throw 'control character'
        }
    }
}

Describe 'feed-gemini -AnalysisFocus: source-level invariants (no extra provider call, guards intact)' {
    $src = Get-Content -LiteralPath $feedGemini -Raw

    It 'declares exactly one -AnalysisFocus parameter' {
        ([regex]::Matches($src, '(?m)^\s*\[string\]\$AnalysisFocus\s*,')).Count | Should Be 1
    }
    It 'keeps a SINGLE SDK node invocation site (no second paid call added)' {
        ([regex]::Matches($src, '&\s+node\s+\$sdkScript')).Count | Should Be 1
    }
    It 'composes focus via the shared Add-AnalysisFocusToPrompt helper (both routes), not inline' {
        ([regex]::Matches($src, 'Add-AnalysisFocusToPrompt')).Count | Should BeGreaterThan 1
    }
    It 'validates focus independently via Get-NormalizedAnalysisFocus' {
        $src | Should Match 'Get-NormalizedAnalysisFocus\s+-Focus\s+\$AnalysisFocus'
    }
    It 'keeps exactly two duration-guard INVOCATION sites (SDK + CLI), unchanged by focus' {
        # Match the actual invocation form (Assert-DurationGuard -Url ...), not comment mentions.
        ([regex]::Matches($src, 'Assert-DurationGuard\s+-Url')).Count | Should Be 2
    }
    It 'never writes the raw focus value to Write-Host (only a char count)' {
        # The raw -AnalysisFocus param is never logged, and every Write-Host that references the
        # normalized value does so only as its .Length (the bounded "chars=<length>" metadata).
        $src | Should Not Match 'Write-Host[^\r\n]*\$AnalysisFocus'
        foreach ($m in [regex]::Matches($src, 'Write-Host[^\r\n]*normalizedFocus[^\r\n]*')) {
            $m.Value | Should Match '\.Length'
        }
    }
}
