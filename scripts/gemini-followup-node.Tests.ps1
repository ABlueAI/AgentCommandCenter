<#
.SYNOPSIS
  Pester wrapper that runs the real Node suite for gemini-followup.js inside the standing gate.
.DESCRIPTION
  Run with: Invoke-Pester -Path scripts\gemini-followup-node.Tests.ps1

  Same pattern as gemini-video-sdk-node.Tests.ps1 (the K5 anti-orphan wrapper): run-pester.ps1
  only discovers *.Tests.ps1, and scripts/*.test.js files are not in app/package.json's gate, so
  without this wrapper the V3b follow-up suite would be orphaned — the exact test-rot failure
  class test-reachability exists to prevent. It executes the real Node suite and fails Pester
  whenever the suite's exit code is nonzero. The suite itself uses only injected fakes and a
  127.0.0.1 fixture — no Gemini API, credentials, paid calls, or internet.
#>
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$suite = Join-Path $here 'gemini-followup.test.js'

Describe 'gemini-followup Node suite (V3b wrapper)' {

    # cmd /c merges the suite's stderr natively so PS 5.1 never wraps FAIL lines in
    # NativeCommandError records; %ERRORLEVEL% propagates to $LASTEXITCODE.
    $output = cmd /c "node `"$suite`" 2>&1"
    $exit = $LASTEXITCODE
    $text = ($output | Out-String)

    It 'exists next to this wrapper (the wrapper must never silently test nothing)' {
        Test-Path -LiteralPath $suite | Should Be $true
    }

    It 'runs the real Node suite green (exit code 0)' {
        $exit | Should Be 0
    }

    It 'reports zero failed assertions in its own summary' {
        $text | Should Match '\d+ passed, 0 failed'
    }

    It 'contains no FAIL lines' {
        # Anchored to the suite's own failure marker so a test NAME containing the word
        # "fail"/"failed" can never trip this.
        $text.Contains([char]0x2717 + ' FAIL:') | Should Be $false
    }
}
