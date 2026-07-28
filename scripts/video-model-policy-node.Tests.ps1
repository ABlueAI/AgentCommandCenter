<#
.SYNOPSIS
  Pester wrapper that runs the real Node suite for app/renderer/video-model-policy.js.
.DESCRIPTION
  Run with: Invoke-Pester -Path scripts\video-model-policy-node.Tests.ps1

  run-pester.ps1 discovers '*.Tests.ps1' recursively under scripts/ ONLY, so a Node suite living
  under app/renderer would never execute inside the standing gate. This wrapper closes that gap
  without touching app/package.json. It executes the real Node suite and fails Pester whenever the
  suite's exit code is nonzero or any assertion failed.

  The suite is pure: no DOM, no Electron, no key, no provider, no network, no paid or free-tier
  request. It only requires the policy module, video-scout-args.js, gemini-video-sdk.js, and reads
  index.html / app.js as text.

  PATH SPELLING IS LOAD-BEARING. The exact reachability watchdog recognizes only the NESTED join
  used below, where the directory is joined first and the file name second. Do NOT collapse it into
  a single Join-Path whose second argument combines the directory and file name (in either
  backslash or forward-slash form) — that spelling is not recognized and the suite reads as
  orphaned, which is the exact failure class this wrapper exists to prevent.
#>
$here = Split-Path -Parent $MyInvocation.MyCommand.Path        # <repo>\scripts
$repoRoot = Split-Path -Parent $here
$suite = Join-Path (Join-Path $repoRoot 'app\renderer') 'video-model-policy.test.js'

Describe 'video-model-policy Node suite (V4Q Phase B wrapper)' {

    # cmd /c merges the suite's stderr natively so PS 5.1 never wraps FAIL lines in
    # NativeCommandError records; %ERRORLEVEL% propagates to $LASTEXITCODE.
    $output = cmd /c "node `"$suite`" 2>&1"
    $exit = $LASTEXITCODE
    $text = ($output | Out-String)

    It 'exists at the expected path (the wrapper must never silently test nothing)' {
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
