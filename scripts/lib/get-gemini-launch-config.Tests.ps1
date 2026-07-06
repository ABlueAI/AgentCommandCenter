<#
.SYNOPSIS
  Pester tests for Resolve-GeminiLaunchConfig (the -Model/-MediaResolution launch resolver used
  by feed-gemini.ps1).
.DESCRIPTION
  Run with: Invoke-Pester -Path scripts\lib\get-gemini-launch-config.Tests.ps1
#>
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
. (Join-Path $here 'get-gemini-launch-config.ps1')

Describe 'Resolve-GeminiLaunchConfig' {

    It 'defaults to the cheapest vision-capable model and MEDIUM media resolution' {
        $result = Resolve-GeminiLaunchConfig
        $result.Model | Should Be 'gemini-2.5-flash-lite'
        $result.MediaResolution | Should Be 'MEDIUM'
    }

    It 'passes through a custom -Model unchanged' {
        $result = Resolve-GeminiLaunchConfig -Model 'gemini-2.5-pro'
        $result.Model | Should Be 'gemini-2.5-pro'
    }

    It 'accepts each valid -MediaResolution value' {
        foreach ($tier in @('LOW', 'MEDIUM', 'HIGH')) {
            (Resolve-GeminiLaunchConfig -MediaResolution $tier).MediaResolution | Should Be $tier
        }
    }

    It 'rejects a -MediaResolution value outside LOW/MEDIUM/HIGH' {
        { Resolve-GeminiLaunchConfig -MediaResolution 'ULTRA' } | Should Throw
    }

    It 'rejects an empty -Model' {
        { Resolve-GeminiLaunchConfig -Model '' } | Should Throw 'must not be empty'
    }

    It 'produces a log line naming both the model and the media resolution' {
        $result = Resolve-GeminiLaunchConfig -Model 'gemini-2.5-pro' -MediaResolution 'HIGH'
        $result.LogLine | Should Match 'gemini-2.5-pro'
        $result.LogLine | Should Match 'HIGH'
    }

    It 'warns that the CLI has no media-resolution flag and names an alternative' {
        $result = Resolve-GeminiLaunchConfig
        $result.Warning | Should Match 'no -media-resolution flag'
        $result.Warning | Should Match 'not\s+sent to the CLI'
        $result.Warning | Should Match '-Mode transcript/audio'
    }
}
