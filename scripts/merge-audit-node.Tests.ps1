<#
.SYNOPSIS
  Pester wrapper that runs the real Node suite for .github/scripts/merge-audit.js inside the standing gate.
.DESCRIPTION
  Run with: Invoke-Pester -Path scripts\merge-audit-node.Tests.ps1

  Same pattern as gemini-followup-node.Tests.ps1 (the K5 anti-orphan wrapper): the merge audit's
  decision logic lives outside app/, so app/package.json's gate cannot reach it, and run-pester.ps1
  only discovers *.Tests.ps1. The suite uses fixtures only: no GitHub API, token or network.
#>
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$suite = Join-Path (Join-Path (Split-Path -Parent $here) '.github\scripts') 'merge-audit.test.js'

Describe 'merge-audit Node suite (K5 wrapper)' {

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
        $text | Should Match 'merge-audit: \d+ passed, 0 failed'
    }

    It 'contains no FAIL lines' {
        $text.Contains([char]0x2717 + ' FAIL:') | Should Be $false
    }
}
