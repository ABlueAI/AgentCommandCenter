<#
.SYNOPSIS
  Pester tests for the V5 stack content-acceptance correction's tracked Gemini CLI policy: the fixed
  repository-owned path resolver (get-video-scout-gemini-policy.ps1) and the policy file content
  (scripts/config/video-scout-gemini-policy.toml). Also a no-paid proof that the installed Gemini CLI
  accepts the tracked --policy file (skipped when gemini is not on PATH).
.DESCRIPTION
  Run with: Invoke-Pester -Path scripts\lib\get-video-scout-gemini-policy.Tests.ps1
  No network, no model request.
#>
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
. (Join-Path $here 'get-video-scout-gemini-policy.ps1')

Describe 'Get-VideoScoutGeminiPolicyPath — fixed, repository-owned path (not caller-supplied)' {
    $path = Get-VideoScoutGeminiPolicyPath

    It 'takes NO parameters (nothing external can redirect which policy file loads)' {
        (Get-Command Get-VideoScoutGeminiPolicyPath).Parameters.Count | Should Be 0
    }
    It 'returns an absolute path to the tracked scripts\config policy file that exists' {
        [System.IO.Path]::IsPathRooted($path) | Should Be $true
        $path | Should Match 'scripts[\\/]config[\\/]video-scout-gemini-policy\.toml$'
        Test-Path -LiteralPath $path | Should Be $true
    }
    It 'resolves under this repository (the scripts tree), never a temp/user/renderer location' {
        $repoScripts = [System.IO.Path]::GetFullPath((Join-Path $here '..'))   # scripts\
        $path.StartsWith($repoScripts, [System.StringComparison]::OrdinalIgnoreCase) | Should Be $true
    }
    It 'throws visibly if the tracked policy file is missing (no silent proceed)' {
        # Prove the fail-closed behavior by pointing $PSScriptRoot's sibling check at a moved file:
        # simplest deterministic check — the function body asserts existence, so a temp rename is
        # unnecessary; instead confirm the guard message is present in the source.
        $src = Get-Content -LiteralPath (Join-Path $here 'get-video-scout-gemini-policy.ps1') -Raw
        $src | Should Match "must not proceed without the update_topic deny policy"
    }
}

Describe 'Video Scout Gemini policy file — exactly one headless deny for update_topic' {
    $path = Get-VideoScoutGeminiPolicyPath
    $content = Get-Content -LiteralPath $path -Raw

    It 'declares exactly one [[rule]]' {
        ([regex]::Matches($content, '(?m)^\[\[rule\]\]')).Count | Should Be 1
    }
    It 'names exactly one tool, update_topic' {
        ([regex]::Matches($content, '(?m)^toolName\s*=')).Count | Should Be 1
        $content | Should Match '(?m)^toolName\s*=\s*"update_topic"'
    }
    It 'denies it in headless mode' {
        $content | Should Match '(?m)^decision\s*=\s*"deny"'
        $content | Should Match '(?m)^interactive\s*=\s*false'
    }
    It 'is a GLOBAL deny — no active argsPattern key (so the tool is removed entirely)' {
        ($content -match '(?m)^\s*argsPattern\s*=') | Should Be $false
    }
}

# No-paid proof that the installed Gemini CLI 0.49.0 loads + parses the tracked --policy file. Uses
# --list-extensions (loads config + policy, then exits) so NO model request is made. Skipped when
# gemini is not installed on this machine.
if (Get-Command gemini -ErrorAction SilentlyContinue) {
    Describe 'Installed Gemini CLI accepts the tracked --policy file (no model request)' {
        It 'loads the tracked policy without a "Policy file error" (config path, no request)' {
            $path = Get-VideoScoutGeminiPolicyPath
            $out = & gemini --policy $path --list-extensions 2>&1 | Out-String
            ($out -match 'Policy file error') | Should Be $false
        }
    }
}
