<#
.SYNOPSIS
  Pester wrapper that runs the Node suite for .claude/hooks/account-guard.js inside the standing gate.
.DESCRIPTION
  Run with: Invoke-Pester -Path scripts\account-guard-node.Tests.ps1

  Same pattern as plan-sync-node.Tests.ps1 (the K5 anti-orphan wrapper): the account guard is a
  Claude Code hook outside app/, so app/package.json's gate cannot reach it, and run-pester.ps1 only
  discovers *.Tests.ps1. Running it here puts it on GitHub's Windows runner, where it starts the
  real hook script with a fake gh.exe (a copy of node) on PATH. No GitHub API, token or network.
#>
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$suite = Join-Path (Join-Path (Join-Path (Split-Path -Parent $here) '.claude') 'hooks') 'account-guard.test.js'

Describe 'account-guard Node suite (K5 wrapper)' {

    # cmd /c merges the suite's stderr natively so PS 5.1 never wraps FAIL lines in
    # NativeCommandError records; %ERRORLEVEL% propagates to $LASTEXITCODE.
    $output = cmd /c "node `"$suite`" 2>&1"
    $exit = $LASTEXITCODE
    $text = ($output | Out-String)

    It 'exists where this wrapper expects it (the wrapper must never silently test nothing)' {
        Test-Path -LiteralPath $suite | Should Be $true
    }

    It 'runs the real Node suite green (exit code 0)' {
        $exit | Should Be 0
    }

    It 'reports zero failed assertions in its own summary' {
        $text | Should Match 'account-guard: \d+ passed, 0 failed'
    }

    It 'contains no FAIL lines' {
        $text.Contains([char]0x2717 + ' FAIL:') | Should Be $false
    }
}
