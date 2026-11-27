#Requires -Version 5.1

function Invoke-PesterRunnerFixture {
    param([string]$Suite)

    $fixture = Join-Path ([IO.Path]::GetTempPath()) ('mako-pester-runner-' + [guid]::NewGuid())
    New-Item -Path $fixture -ItemType Directory -ErrorAction Stop | Out-Null
    try {
        $runner = Join-Path $fixture 'run-pester.ps1'
        Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'run-pester.ps1') -Destination $runner -ErrorAction Stop
        Set-Content -LiteralPath (Join-Path $fixture 'fixture.Tests.ps1') -Value $Suite -Encoding UTF8 -ErrorAction Stop

        # Windows PowerShell can surface redirected native stderr as a non-terminating error.
        $ErrorActionPreference = 'Continue'
        $shell = (Get-Process -Id $PID).Path
        $output = & $shell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $runner 2>&1
        $exitCode = $LASTEXITCODE
        [pscustomobject]@{ ExitCode = $exitCode; Output = ($output | Out-String) }
    }
    finally {
        Remove-Item -LiteralPath $fixture -Recurse -Force -ErrorAction Stop
    }
}

Describe 'run-pester.ps1 CI summary and exit status' {
    It 'reports every category, including pending and inconclusive on Pester 3.4' {
        $run = Invoke-PesterRunnerFixture @'
Describe 'fixture' {
    It 'passes' { $true | Should Be $true }
    It 'fails' { $true | Should Be $false }
    It 'skips' -Skip { throw 'must not run' }
    It 'is pending' -Pending { throw 'must not run' }
    It 'is inconclusive' { Set-TestInconclusive -Message 'fixture unavailable' }
}
'@
        $run.ExitCode | Should Be 1
        $run.Output | Should Match 'run-pester: 1 passed, 1 failed, 1 skipped, 1 pending, 1 inconclusive \(of 5\)'
    }

    It 'fails when suite discovery finds a file but Pester runs zero cases' {
        $run = Invoke-PesterRunnerFixture '# no test cases'
        $run.ExitCode | Should Be 1
        $run.Output | Should Match 'run-pester: no test cases ran'
    }

    It 'fails with a passing case and a <Kind> case' -TestCases @(
        @{ Kind = 'skipped'; Code = "It 'skips' -Skip { throw 'must not run' }" }
        @{ Kind = 'pending'; Code = "It 'is pending' -Pending { throw 'must not run' }" }
        @{ Kind = 'inconclusive'; Code = "It 'is inconclusive' { Set-TestInconclusive -Message 'fixture unavailable' }" }
    ) {
        param($Kind, $Code)
        $run = Invoke-PesterRunnerFixture "Describe 'fixture' { It 'passes' { 1 | Should Be 1 }; $Code }"
        $run.ExitCode | Should Be 1
        $run.Output | Should Match "1 $Kind"
    }

    It 'exits zero when all cases pass' {
        $run = Invoke-PesterRunnerFixture "Describe 'fixture' { It 'passes' { 1 | Should Be 1 } }"
        $run.ExitCode | Should Be 0
        $run.Output | Should Match 'run-pester: 1 passed'
    }
}
