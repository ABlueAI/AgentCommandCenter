<#
.SYNOPSIS
  Pester wrapper that runs the real Node suite for gemini-video-sdk.js inside the standing gate.
.DESCRIPTION
  Run with: Invoke-Pester -Path scripts\gemini-video-sdk-node.Tests.ps1

  K5 finding: scripts/gemini-video-sdk.test.js was an ORPHANED suite — neither `npm test`
  (app-side) nor run-pester.ps1 (which only discovers *.Tests.ps1) executed it, exactly the
  test-rot failure mode run-pester exists to prevent. This wrapper closes that gap without
  touching app/package.json (Track B changes that file; K5 must stay merge-independent).
  It executes the real Node suite and fails Pester whenever the suite's exit code is nonzero.
  The suite itself uses only injected fakes and a 127.0.0.1 fixture — no Gemini API,
  credentials, paid calls, or internet.
#>
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$suite = Join-Path $here 'gemini-video-sdk.test.js'

Describe 'gemini-video-sdk Node suite (K5 wrapper)' {

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
