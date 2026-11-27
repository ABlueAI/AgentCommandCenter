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
    It 'refuses a missing policy at runtime' {
        $lib = Join-Path $TestDrive 'lib'
        New-Item -ItemType Directory -Path $lib | Out-Null
        Copy-Item (Join-Path $here 'get-video-scout-gemini-policy.ps1') $lib
        & {
            . (Join-Path $lib 'get-video-scout-gemini-policy.ps1')
            { Get-VideoScoutGeminiPolicyPath } | Should Throw 'policy'
        }
    }

    It 'refuses a policy that exists but cannot be opened for reading' {
        $root = Join-Path $TestDrive 'unreadable'
        $lib = Join-Path $root 'lib'
        $config = Join-Path $root 'config'
        New-Item -ItemType Directory -Path $lib, $config -Force | Out-Null
        Copy-Item (Join-Path $here 'get-video-scout-gemini-policy.ps1') $lib
        $copy = Join-Path $config 'video-scout-gemini-policy.toml'
        Copy-Item $path $copy
        $locked = [System.IO.File]::Open($copy, 'Open', 'ReadWrite', 'None')
        try {
            & {
                . (Join-Path $lib 'get-video-scout-gemini-policy.ps1')
                { Get-VideoScoutGeminiPolicyPath } | Should Throw 'policy'
            }
        }
        finally { $locked.Dispose() }
    }
}

Describe 'Video Scout Gemini policy file denies all model tools' {
    $content = Get-Content -LiteralPath (Get-VideoScoutGeminiPolicyPath) -Raw

    It 'has a headless deny rule covering every tool with no argument exceptions' {
        ([regex]::Matches($content, '(?m)^\[\[rule\]\]')).Count | Should Be 1
        $content | Should Match '(?m)^decision\s*=\s*"deny"'
        $content | Should Match '(?m)^interactive\s*=\s*false'
        # Gemini CLI 0.49.0 rejects a rule with no toolName; "*" is its match-every-tool wildcard.
        ([regex]::Matches($content, '(?m)^\s*toolName\s*=')).Count | Should Be 1
        $content | Should Match '(?m)^toolName\s*=\s*"\*"\s*$'
        ($content -match '(?m)^\s*(mcpName|argsPattern|commandPrefix|commandRegex|subagent|modes|toolAnnotations)\s*=') | Should Be $false
    }
    It 'has only the keys toolName, decision, priority and interactive in its rule' {
        $keys = @([regex]::Matches($content, '(?m)^\s*([A-Za-z_]+)\s*=') | ForEach-Object { $_.Groups[1].Value } | Sort-Object)
        ($keys -join ',') | Should Be 'decision,interactive,priority,toolName'
    }
}

Describe 'Video Scout Gemini settings file (tracked; loaded as the CLI system settings)' {
    $settingsPath = Join-Path (Split-Path -Parent $here) 'config\video-scout-gemini-settings.json'
    $settings = Get-Content -LiteralPath $settingsPath -Raw | ConvertFrom-Json

    It 'pins exactly the top-level sections it sets' {
        (@($settings.PSObject.Properties.Name | Sort-Object) -join ',') |
            Should Be 'general,hooksConfig,privacy,security,telemetry'
    }
    It 'turns off auto-update, hooks, usage statistics and telemetry' {
        $settings.general.enableAutoUpdate | Should Be $false
        $settings.general.enableAutoUpdateNotification | Should Be $false
        $settings.hooksConfig.enabled | Should Be $false
        $settings.privacy.usageStatisticsEnabled | Should Be $false
        $settings.telemetry.enabled | Should Be $false
    }
    It 'selects and enforces API-key auth (the isolated profile cannot reach a Google sign-in)' {
        $settings.security.auth.selectedType | Should Be 'gemini-api-key'
        $settings.security.auth.enforcedType | Should Be 'gemini-api-key'
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
