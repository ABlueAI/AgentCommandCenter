<#
.SYNOPSIS
  Pester tests for Get-TranscriptPrompt (the 9c default timestamped-transcript brief loader).
.DESCRIPTION
  Run with: Invoke-Pester -Path scripts\lib\get-transcript-prompt.Tests.ps1
  Proves the prompt CONTRACT (timestamp citations, chronological map, whole-second range
  values, no invented timestamps, approximate-caption honesty) and the loader behavior.
  No network, no yt-dlp, no Gemini.
#>
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
. (Join-Path $here 'get-transcript-prompt.ps1')

# The prompt file uses an en dash inside [HH:MM:SS-HH:MM:SS] ranges and an em dash as the
# topic separator; build them from code points so this test file stays plain ASCII.
$en = [char]0x2013
$em = [char]0x2014

Describe 'Get-TranscriptPrompt contract' {

    $prompt = Get-TranscriptPrompt

    It 'loads the real default prompt file from prompts/transcript-analysis.md' {
        $prompt | Should Not BeNullOrEmpty
        $prompt | Should Match 'TL;DR'
        $prompt | Should Match 'KEY POINTS'
        $prompt | Should Match 'TIMESTAMP MAP'
        $prompt | Should Match 'RECOMMENDED RANGES'
    }

    It 'declares the four sections with the exact numbered markdown headers' {
        # The saved report must start with `## 1. TL;DR` (V5b1 content acceptance FAIL 1), so the
        # brief instructs those exact headers. Numbering: 1 TL;DR, 2 KEY POINTS, 3 TIMESTAMP MAP,
        # 4 RECOMMENDED RANGES.
        $prompt.Contains('## 1. TL;DR')            | Should Be $true
        $prompt.Contains('## 2. KEY POINTS')       | Should Be $true
        $prompt.Contains('## 3. TIMESTAMP MAP')    | Should Be $true
        $prompt.Contains('## 4. RECOMMENDED RANGES') | Should Be $true
    }

    It 'orders TL;DR before every other section in the brief itself' {
        $iTldr   = $prompt.IndexOf('## 1. TL;DR')
        $iKey    = $prompt.IndexOf('## 2. KEY POINTS')
        $iMap    = $prompt.IndexOf('## 3. TIMESTAMP MAP')
        $iRanges = $prompt.IndexOf('## 4. RECOMMENDED RANGES')
        ($iTldr -ge 0 -and $iTldr -lt $iKey -and $iKey -lt $iMap -and $iMap -lt $iRanges) | Should Be $true
    }

    It 'requires an evidence-grounded TL;DR with a caption-derived timestamp when reliable' {
        $prompt | Should Match 'concise, evidence-grounded summary'
        $prompt | Should Match 'cite at least one caption-derived timestamp'
        $prompt | Should Match 'This TL;DR section must come first'
    }

    It 'requires a timestamp citation on every substantive key point' {
        $prompt | Should Match 'Every substantive point must cite at least one timestamp'
    }

    It 'requires a chronological beginning-to-end timestamp map' {
        $prompt | Should Match 'chronological map of the video from beginning to end'
    }

    It 'pins the exact map line format [HH:MM:SS-HH:MM:SS] <emdash> topic/event' {
        $prompt.Contains("[HH:MM:SS${en}HH:MM:SS] $em topic/event") | Should Be $true
    }

    It 'requires combining repetitive or overlapping auto-caption cues' {
        $prompt | Should Match 'Combine repetitive or overlapping auto-caption cues'
    }

    It 'requires range-picker-ready whole-second integer Start/End values' {
        $prompt | Should Match 'Start: N and End: N as exact whole-second integer values'
        $prompt | Should Match 'no decimals'
        $prompt | Should Match 'pasted directly into the video range fields'
    }

    It 'bounds the range suggestions to one to three and allows an honest none' {
        $prompt | Should Match 'one to three ranges'
        $prompt | Should Match 'say so instead of forcing one'
    }

    It 'forbids invented, estimated, or extrapolated timestamps' {
        $prompt | Should Match 'use only timestamps that appear in the attached SRT cues'
        $prompt | Should Match 'Never invent, estimate, or extrapolate a timestamp'
    }

    It 'requires an explicit statement when reliable timestamps cannot be extracted' {
        $prompt | Should Match 'state explicitly that reliable timestamps could not be extracted'
    }

    It 'identifies caption timestamps as approximate subtitle timing, not exact cuts' {
        $prompt | Should Match 'caption timestamps represent subtitle display timing'
        $prompt | Should Match 'approximate'
    }

    It 'contains no double quotes (they would break the PS -> gemini CLI argument boundary)' {
        $prompt.Contains('"') | Should Be $false
    }

    It 'survives Get-CliSafePrompt flattening with the contract markers intact' {
        . (Join-Path $here 'get-cli-safe-prompt.ps1')
        $flat = Get-CliSafePrompt -Prompt $prompt
        $flat | Should Not Match "`n"
        $flat | Should Match 'Never invent, estimate, or extrapolate a timestamp'
        $flat.Contains("[HH:MM:SS${en}HH:MM:SS] $em topic/event") | Should Be $true
    }

    It 'keeps TL;DR ahead of every other section AFTER CLI flattening (wiring)' {
        # feed-gemini flattens the multi-line brief to one physical line before it becomes a -p
        # argument (Get-CliSafePrompt collapses newlines to single spaces). The header ordering that
        # makes the model emit `## 1. TL;DR` first must survive that flattening, not just the raw file.
        . (Join-Path $here 'get-cli-safe-prompt.ps1')
        $flat = Get-CliSafePrompt -Prompt $prompt
        $iTldr   = $flat.IndexOf('## 1. TL;DR')
        $iKey    = $flat.IndexOf('## 2. KEY POINTS')
        $iMap    = $flat.IndexOf('## 3. TIMESTAMP MAP')
        $iRanges = $flat.IndexOf('## 4. RECOMMENDED RANGES')
        $iTldr | Should Not Be -1
        ($iTldr -lt $iKey -and $iKey -lt $iMap -and $iMap -lt $iRanges) | Should Be $true
    }
}

Describe 'Get-TranscriptPrompt loader behavior' {

    It 'throws a clear error when the prompt file is missing' {
        $missingPath = Join-Path $here 'does-not-exist.md'
        { Get-TranscriptPrompt -PromptPath $missingPath } | Should Throw 'not found'
    }

    It 'trims leading/trailing whitespace from the loaded prompt' {
        $tempFile = Join-Path ([System.IO.Path]::GetTempPath()) ("ts-prompt-{0}.md" -f ([guid]::NewGuid()))
        try {
            Set-Content -LiteralPath $tempFile -Value "`r`n`r`nHello prompt`r`n`r`n" -NoNewline
            Get-TranscriptPrompt -PromptPath $tempFile | Should Be 'Hello prompt'
        } finally {
            Remove-Item -LiteralPath $tempFile -ErrorAction SilentlyContinue
        }
    }

    It 'reads non-ASCII punctuation (en dash) correctly from a BOM-less UTF-8 file' {
        # Same 5.1 BOM-less regression guard as the video-scout loader: without -Encoding UTF8
        # the ANSI code page mangles the dashes the map format depends on.
        $expected = "[HH:MM:SS${en}HH:MM:SS] $em topic"
        $tempFile = Join-Path ([System.IO.Path]::GetTempPath()) ("ts-prompt-{0}.md" -f ([guid]::NewGuid()))
        try {
            $utf8NoBom = New-Object System.Text.UTF8Encoding $false
            [System.IO.File]::WriteAllText($tempFile, $expected, $utf8NoBom)
            Get-TranscriptPrompt -PromptPath $tempFile | Should Be $expected
        } finally {
            Remove-Item -LiteralPath $tempFile -ErrorAction SilentlyContinue
        }
    }
}
