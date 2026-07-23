<#
.SYNOPSIS
  Behavioral Pester tests for the V3a -AnalysisFocus wiring + privacy contract in feed-gemini.ps1.
.DESCRIPTION
  Run with: Invoke-Pester -Path scripts\feed-gemini-analysis-focus.Tests.ps1

  Reuses the transcript harness (see feed-gemini-transcript-prompt.Tests.ps1): the REAL feed-gemini.ps1
  runs down its transcript CLI path so the actual focus normalization + prompt-composition + fallback
  output wiring executes. No network and no paid call anywhere:
    - yt-dlp is stubbed on PATH (writes a fake .srt into the run dir).
    - the duration-probe job layer is shadowed with a deterministic 100s line.
    - -NoFeed returns before any gemini use; the "Gemini CLI not found" harness forces the CLI-missing
      branch (Get-Command 'gemini' shadowed to $null + an empty $env:APPDATA so the fallback misses),
      which also returns before any paid call.

  PRIVACY CONTRACT under test (the required V3a delta): terminal output must NEVER echo the focus. Both
  the -NoFeed and the CLI-missing fallback branches print a deferred `gemini -p "<prompt> …"` command;
  with a focus present that composed prompt contains the user's -AnalysisFocus text, so those branches
  must OMIT the command and print a metadata-safe notice instead. With no focus their output is
  unchanged. A distinctive SENTINEL focus proves the text is absent from both fallback outputs.

  Composition CORRECTNESS (base intact, preservation-instruction-before-focus) is proven at the helper
  level in scripts/lib/get-analysis-focus.Tests.ps1 — it is deliberately NOT asserted from fallback
  output here, because the privacy guard now (correctly) keeps the composed prompt OUT of that output.
#>
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$feedGemini = Join-Path $here 'feed-gemini.ps1'
$YT = 'https://youtu.be/aqz-KE-bpKQ'
$SENTINEL = 'ZZSENTINELFOCUS9F3A'   # distinctive, single-token, survives normalization verbatim

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

# Run the transcript path with -NoFeed (returns after the deferred-command print, before any gemini).
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
            Output      = $text
            ManifestRaw = (Get-Content -LiteralPath (Join-Path $runDir.FullName 'manifest.json') -Raw -Encoding UTF8)
        }
    } finally {
        $env:PATH = $savedPath
        'Start-Job', 'Wait-Job', 'Receive-Job', 'Stop-Job', 'Remove-Job' |
            ForEach-Object { Remove-Item "function:global:$_" -ErrorAction SilentlyContinue }
    }
}

# Run the transcript path WITHOUT -NoFeed but with the Gemini CLI forced missing, so the
# "Gemini CLI not found" fallback branch runs (also returns before any paid call).
function Invoke-FocusGeminiMissing {
    param([string]$AnalysisFocus)
    $outDir = Join-Path $stubRoot ('outm-' + [Guid]::NewGuid().ToString('N'))
    function global:Start-Job   { [PSCustomObject]@{ Id = 1 } }
    function global:Wait-Job    { $true }
    function global:Receive-Job { '100|NA' }
    function global:Stop-Job    { }
    function global:Remove-Job  { }
    $realGetCommand = Microsoft.PowerShell.Core\Get-Command 'Get-Command' -CommandType Cmdlet
    # Shadow Get-Command: return $null for 'gemini' (forces the missing branch), delegate everything
    # else (so the stub yt-dlp on PATH still resolves normally). This is a LOCAL function on purpose:
    # it is visible to the `& $feedGemini` child scope during the call but is destroyed automatically
    # when this function returns, so it can NEVER leak into another test file (a global shadow whose
    # captured $realGetCommand went out of scope would break every later feed-gemini suite).
    function Get-Command {
        if ($args.Count -ge 1 -and "$($args[0])" -eq 'gemini') { return $null }
        & $realGetCommand @args
    }
    $savedPath = $env:PATH
    $savedAppData = $env:APPDATA
    $fakeAppData = Join-Path $stubRoot ('appdata-' + [Guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $fakeAppData -Force | Out-Null
    $env:PATH = "$stubRoot;$env:PATH"
    $env:APPDATA = $fakeAppData   # no npm\gemini.cmd here -> the APPDATA fallback misses -> -not $gemini
    try {
        $params = @{ Url = $YT; Mode = 'transcript'; OutDir = $outDir }
        if ($PSBoundParameters.ContainsKey('AnalysisFocus')) { $params.AnalysisFocus = $AnalysisFocus }
        $text = (& $feedGemini @params 6>&1 | Out-String -Width 32767)
        [PSCustomObject]@{ Output = $text }
    } finally {
        $env:PATH = $savedPath
        $env:APPDATA = $savedAppData
        # Get-Command is a LOCAL function (auto-removed with this scope) — only the global job shadows
        # need explicit cleanup.
        'Start-Job', 'Wait-Job', 'Receive-Job', 'Stop-Job', 'Remove-Job' |
            ForEach-Object { Remove-Item "function:global:$_" -ErrorAction SilentlyContinue }
    }
}

Describe 'feed-gemini -AnalysisFocus wiring + privacy (behavioral, no network)' {

    Context 'focus ABSENT: base brief unchanged, deferred command still shown' {
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
        It 'DOES print the deferred gemini command (pre-V3a behavior preserved)' {
            $run.Output | Should Match 'gemini -m'
        }
    }

    Context 'focus PRESENT via -NoFeed: composed but NEVER echoed' {
        $run = Invoke-FocusNoFeed -AnalysisFocus ("Prioritize $SENTINEL patterns")
        It 'logs only the metadata line (char count), proving composition ran' {
            $run.Output | Should Match 'Analysis focus applied \(chars=\d+\)'
        }
        It 'does NOT echo the sentinel focus text anywhere in output' {
            $run.Output | Should Not Match $SENTINEL
        }
        It 'OMITS the deferred gemini command (would contain the composed prompt)' {
            $run.Output | Should Not Match 'gemini -m'
        }
        It 'prints a metadata-safe omission notice instead' {
            $run.Output | Should Match 'deferred'
            $run.Output | Should Match 'omitted'
        }
        It 'does NOT write the focus text into the manifest (no schema change)' {
            $run.ManifestRaw | Should Not Match $SENTINEL
        }
        It 'still records a truthful completed manifest' {
            $run.ManifestRaw | Should Match '"outcome"\s*:\s*"completed"'
        }
    }

    Context 'focus PRESENT via the CLI-missing fallback (app-reachable): NEVER echoed' {
        $run = Invoke-FocusGeminiMissing -AnalysisFocus ("Prioritize $SENTINEL patterns")
        It 'reaches the "Gemini CLI not found" branch' {
            $run.Output | Should Match 'Gemini CLI not found'
        }
        It 'does NOT echo the sentinel focus text anywhere in output' {
            $run.Output | Should Not Match $SENTINEL
        }
        It 'OMITS the deferred gemini command' {
            $run.Output | Should Not Match 'gemini -m'
        }
        It 'prints a metadata-safe omission notice instead' {
            $run.Output | Should Match 'omitted'
        }
    }

    Context 'no-focus CLI-missing fallback: deferred command unchanged' {
        $run = Invoke-FocusGeminiMissing
        It 'reaches the "Gemini CLI not found" branch' {
            $run.Output | Should Match 'Gemini CLI not found'
        }
        It 'DOES print the deferred gemini command (pre-V3a behavior preserved)' {
            $run.Output | Should Match 'gemini -m'
        }
        It 'does NOT print the omission notice when there is no focus' {
            $run.Output | Should Not Match 'omitted'
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
        ([regex]::Matches($src, 'Assert-DurationGuard\s+-Url')).Count | Should Be 2
    }
    It 'guards BOTH fallback deferred-command prints on $normalizedFocus (no raw prompt when focus set)' {
        # Both the -NoFeed and CLI-missing branches must gate the `gemini -m ... -p "$Prompt ..."` print
        # behind `if ($normalizedFocus)`. Assert exactly two guarded deferred-command prints remain.
        ([regex]::Matches($src, 'if\s*\(\$normalizedFocus\)\s*\{[^}]*omitted')).Count | Should Be 2
    }
    It 'never writes the raw focus value to Write-Host (only a char count)' {
        $src | Should Not Match 'Write-Host[^\r\n]*\$AnalysisFocus'
        foreach ($m in [regex]::Matches($src, 'Write-Host[^\r\n]*normalizedFocus[^\r\n]*')) {
            $m.Value | Should Match '\.Length'
        }
    }
}
