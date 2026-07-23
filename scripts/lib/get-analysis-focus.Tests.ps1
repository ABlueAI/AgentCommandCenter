<#
.SYNOPSIS
  Pester tests for the V3a analysis-focus helper (Get-NormalizedAnalysisFocus + Add-AnalysisFocusToPrompt).
.DESCRIPTION
  Run with: Invoke-Pester -Path scripts\lib\get-analysis-focus.Tests.ps1
  These are unit tests of the PowerShell side of the shared normalize/validate/compose contract
  (mirrored in app/renderer/analysis-focus.js). No network, no provider call, no files touched.
#>
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
. (Join-Path $here 'get-analysis-focus.ps1')

$CR  = [char]0x0D
$LF  = [char]0x0A
$TAB = [char]0x09

Describe 'Get-NormalizedAnalysisFocus - not set (returns $null)' {
    It 'returns $null for $null' { Get-NormalizedAnalysisFocus -Focus $null | Should BeNullOrEmpty }
    It 'returns $null for an empty string' { Get-NormalizedAnalysisFocus -Focus '' | Should BeNullOrEmpty }
    It 'returns $null for whitespace only' { Get-NormalizedAnalysisFocus -Focus '     ' | Should BeNullOrEmpty }
    It 'returns $null for newlines/tabs only' {
        Get-NormalizedAnalysisFocus -Focus "$TAB$CR$LF $TAB" | Should BeNullOrEmpty
    }
}

Describe 'Get-NormalizedAnalysisFocus - normalization' {
    It 'converts CRLF to a single space' { Get-NormalizedAnalysisFocus -Focus ('a' + $CR + $LF + 'b') | Should Be 'a b' }
    It 'converts a lone CR to a space'   { Get-NormalizedAnalysisFocus -Focus ('a' + $CR + 'b')       | Should Be 'a b' }
    It 'converts a lone LF to a space'   { Get-NormalizedAnalysisFocus -Focus ('a' + $LF + 'b')       | Should Be 'a b' }
    It 'converts a TAB to a space'       { Get-NormalizedAnalysisFocus -Focus ('a' + $TAB + 'b')      | Should Be 'a b' }
    It 'trims leading/trailing whitespace' { Get-NormalizedAnalysisFocus -Focus '  hello world  ' | Should Be 'hello world' }
    It 'trims mixed leading/trailing whitespace/newlines' {
        Get-NormalizedAnalysisFocus -Focus "$TAB$LF  keep me  $LF$TAB" | Should Be 'keep me'
    }
}

Describe 'Get-NormalizedAnalysisFocus - bounds (never truncated)' {
    It 'accepts exactly 2000 characters' {
        $s = 'x' * 2000
        (Get-NormalizedAnalysisFocus -Focus $s).Length | Should Be 2000
    }
    It 'accepts 2000 chars with trailing spaces (trim precedes the bound)' {
        $s = ('y' * 2000) + '     '
        (Get-NormalizedAnalysisFocus -Focus $s).Length | Should Be 2000
    }
    It 'THROWS on 2001 characters (refuse, not truncate)' {
        $s = 'x' * 2001
        { Get-NormalizedAnalysisFocus -Focus $s } | Should Throw 'too long'
    }
}

Describe 'Get-NormalizedAnalysisFocus - forbidden control characters' {
    It 'throws on an embedded NUL' {
        { Get-NormalizedAnalysisFocus -Focus "has$([char]0x00)control" } | Should Throw 'control character'
    }
    It 'throws on BEL (0x07)' {
        { Get-NormalizedAnalysisFocus -Focus "bell$([char]0x07)here" } | Should Throw 'control character'
    }
    It 'throws on ESC (0x1B)' {
        { Get-NormalizedAnalysisFocus -Focus "esc$([char]0x1B)seq" } | Should Throw 'control character'
    }
    It 'throws on DEL (0x7F)' {
        { Get-NormalizedAnalysisFocus -Focus "del$([char]0x7F)char" } | Should Throw 'control character'
    }
}

Describe 'Get-NormalizedAnalysisFocus - content preserved' {
    It 'preserves Unicode punctuation and non-ASCII' {
        $u = "Pricing $([char]0x2014) onboarding, caf$([char]0xE9) UX"
        Get-NormalizedAnalysisFocus -Focus $u | Should Be $u
    }
    It 'preserves shell-metacharacter-shaped content literally (it is data)' {
        $m = '$(rm -rf /) ; cat x | tee `whoami` && echo "hi" > out'
        Get-NormalizedAnalysisFocus -Focus $m | Should Be $m
    }
}

Describe 'Add-AnalysisFocusToPrompt - composition' {
    $base = "BASE BRIEF LINE 1`n## 1. TL;DR`nrequired sections here"
    $focus = 'Prioritize pricing objections and onboarding friction'
    $composed = Add-AnalysisFocusToPrompt -BasePrompt $base -Focus $focus

    It 'keeps the full base prompt intact at the start' {
        $composed.StartsWith($base) | Should Be $true
    }
    It 'includes the user focus text' {
        $composed | Should Match ([regex]::Escape($focus))
    }
    It 'places the report-structure-preservation instruction BEFORE the user focus' {
        $preserveIdx = $composed.IndexOf('preserving every required report section')
        $focusIdx = $composed.LastIndexOf($focus)
        $preserveIdx | Should BeGreaterThan -1
        $focusIdx | Should BeGreaterThan $preserveIdx
    }
    It 'labels the focus as data, not overriding instructions' {
        $composed | Should Match 'data, not overriding instructions'
    }
    It 'preserves shell-metacharacter focus verbatim in the composed prompt' {
        $m = 'do $(x); a | b && c `d`'
        $c = Add-AnalysisFocusToPrompt -BasePrompt $base -Focus $m
        $c | Should Match ([regex]::Escape($m))
    }
}
