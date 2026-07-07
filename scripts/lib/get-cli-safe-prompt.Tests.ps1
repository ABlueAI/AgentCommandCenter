<#
.SYNOPSIS
  Pester tests for Get-CliSafePrompt (the newline-flattening guard used by feed-gemini.ps1 to
  keep the -p argument passed to the gemini .cmd shim on a single line).
.DESCRIPTION
  Run with: Invoke-Pester -Path scripts\lib\get-cli-safe-prompt.Tests.ps1
#>
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
. (Join-Path $here 'get-cli-safe-prompt.ps1')

Describe 'Get-CliSafePrompt' {

    It 'leaves an already single-line prompt unchanged' {
        Get-CliSafePrompt -Prompt 'Summarize this video.' | Should Be 'Summarize this video.'
    }

    It 'collapses embedded newlines into spaces' {
        $multiline = "Line one`nLine two`nLine three"
        Get-CliSafePrompt -Prompt $multiline | Should Be 'Line one Line two Line three'
    }

    It 'collapses CRLF line endings the same way as bare LF' {
        $crlf = "Line one`r`nLine two"
        Get-CliSafePrompt -Prompt $crlf | Should Be 'Line one Line two'
    }

    It 'collapses runs of blank lines (markdown paragraph breaks) to one space' {
        $withBlankLines = "Section A`n`n`nSection B"
        Get-CliSafePrompt -Prompt $withBlankLines | Should Be 'Section A Section B'
    }

    It 'trims leading and trailing whitespace' {
        Get-CliSafePrompt -Prompt "`n  padded on both sides  `n" | Should Be 'padded on both sides'
    }

    It 'never leaves a newline character in its output' {
        $realistic = "INSTRUCTIONS`n## ROLE`nYou are a forensic video analyst.`n`n## RULES`n1. Rule one.`n2. Rule two."
        Get-CliSafePrompt -Prompt $realistic | Should Not Match "`n"
        Get-CliSafePrompt -Prompt $realistic | Should Not Match "`r"
    }

    It 'preserves word content and order for a multi-paragraph brief' {
        $realistic = "INSTRUCTIONS`n## ROLE`nYou are a forensic video analyst.`n`n## RULES`n1. Rule one.`n2. Rule two."
        Get-CliSafePrompt -Prompt $realistic | Should Be 'INSTRUCTIONS ## ROLE You are a forensic video analyst. ## RULES 1. Rule one. 2. Rule two.'
    }
}
