<#
.SYNOPSIS
  Pester tests for Get-VideoScoutPrompt (the default -VideoScout analysis brief loader).
.DESCRIPTION
  Run with: Invoke-Pester -Path scripts\lib\get-video-scout-prompt.Tests.ps1
#>
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
. (Join-Path $here 'get-video-scout-prompt.ps1')

Describe 'Get-VideoScoutPrompt' {

    It 'loads the real default prompt file from prompts/video-scout-analysis.md' {
        $prompt = Get-VideoScoutPrompt
        $prompt | Should Not BeNullOrEmpty
        $prompt | Should Match 'FORENSIC ANALYST'
        $prompt | Should Match '## 1\. TL;DR'
        $prompt | Should Match '## 9\. LIMITATIONS OF THIS ANALYSIS'
    }

    It 'throws a clear error when the prompt file is missing' {
        $missingPath = Join-Path $here 'does-not-exist.md'
        { Get-VideoScoutPrompt -PromptPath $missingPath } | Should Throw 'not found'
    }

    It 'trims leading/trailing whitespace from the loaded prompt' {
        $tempFile = Join-Path ([System.IO.Path]::GetTempPath()) ("vs-prompt-{0}.md" -f ([guid]::NewGuid()))
        try {
            Set-Content -LiteralPath $tempFile -Value "`r`n`r`nHello prompt`r`n`r`n" -NoNewline
            $result = Get-VideoScoutPrompt -PromptPath $tempFile
            $result | Should Be 'Hello prompt'
        } finally {
            Remove-Item -LiteralPath $tempFile -ErrorAction SilentlyContinue
        }
    }

    It 'preserves the report-leading Section 1 TL;DR block' {
        $prompt = Get-VideoScoutPrompt
        $prompt | Should Match '## 1\. TL;DR'
    }

    It 'requires a Section TL;DR first line for every section from 2 through 9' {
        $prompt = Get-VideoScoutPrompt
        2..9 | ForEach-Object {
            $prompt | Should Match ("## {0}\. .+\r?\nFirst line must be ``\*\*Section TL;DR:\*\*" -f $_)
        }
    }

    It 'reads non-ASCII punctuation (em dash) correctly from a BOM-less UTF-8 file' {
        # Regression guard: Windows PowerShell 5.1's Get-Content assumes the system ANSI code
        # page for BOM-less files unless -Encoding UTF8 is passed, which mangles characters
        # like em dashes. The real prompt file has no BOM, so this must stay UTF-8-safe.
        # (Uses [char]0x2014 rather than a literal em dash so this test file itself stays
        # plain-ASCII and isn't tripped up by the same BOM-detection quirk when parsed.)
        $emDash = [char]0x2014
        $expected = "Video Forensic Analyst $emDash evidence-grounded"
        $tempFile = Join-Path ([System.IO.Path]::GetTempPath()) ("vs-prompt-{0}.md" -f ([guid]::NewGuid()))
        try {
            $utf8NoBom = New-Object System.Text.UTF8Encoding $false
            [System.IO.File]::WriteAllText($tempFile, $expected, $utf8NoBom)
            $result = Get-VideoScoutPrompt -PromptPath $tempFile
            $result | Should Be $expected
        } finally {
            Remove-Item -LiteralPath $tempFile -ErrorAction SilentlyContinue
        }
    }
}
