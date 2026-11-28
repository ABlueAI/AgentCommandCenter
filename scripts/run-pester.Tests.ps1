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

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$runner = Join-Path $here 'run-pester.ps1'

Describe 'run-pester entry point' {
    It 'propagates a failing suite result as exit 1' {
        # Stage just the runner and a disposable fixture. Shadow the nested suite invocation
        # so this test never starts the full Pester gate from inside itself.
        $copy = Join-Path $TestDrive 'run-pester.ps1'
        Copy-Item -LiteralPath $runner -Destination $copy -ErrorAction Stop
        $nested = New-Item -ItemType Directory -Path (Join-Path $TestDrive 'nested') -ErrorAction Stop
        Set-Content -LiteralPath (Join-Path $nested.FullName 'fixture.Tests.ps1') -Value '# fixture' -ErrorAction Stop
        $invocations = New-Object 'System.Collections.Generic.List[string]'
        $previousExitCode = $global:LASTEXITCODE
        function Invoke-Pester {
            param([string]$Path, [switch]$PassThru)
            $invocations.Add("$Path|$PassThru")
            [pscustomobject]@{ PassedCount = 0; FailedCount = 1; SkippedCount = 0; TotalCount = 1 }
        }

        try {
            $output = & $copy 6>&1
            $LASTEXITCODE | Should Be 1
            ($invocations -join ', ') | Should Be "$TestDrive|True"
            ($output -join "`n") | Should Match 'discovered 1 suite'
            ($output -join "`n") | Should Match '1 failed'
        }
        finally {
            $global:LASTEXITCODE = $previousExitCode
        }
    }

    It 'refuses with a visible error when it finds no suites' {
        # A runner whose folder holds no *.Tests.ps1 must not report a green run of zero suites.
        $empty = New-Item -ItemType Directory -Path (Join-Path $TestDrive 'empty') -ErrorAction Stop
        $copy = Join-Path $empty.FullName 'run-pester.ps1'
        Copy-Item -LiteralPath $runner -Destination $copy -ErrorAction Stop
        $invocations = New-Object 'System.Collections.Generic.List[string]'
        $previousExitCode = $global:LASTEXITCODE
        function Invoke-Pester {
            param([string]$Path, [switch]$PassThru)
            $invocations.Add("$Path|$PassThru")
            [pscustomobject]@{ PassedCount = 0; FailedCount = 0; SkippedCount = 0; TotalCount = 0 }
        }

        try {
            { & $copy 6>&1 | Out-Null } | Should Throw 'No *.Tests.ps1 suites found'
            $invocations.Count | Should Be 0
        }
        finally {
            $global:LASTEXITCODE = $previousExitCode
        }
    }

    It 'exits 0 when every suite passes' {
        $passing = New-Item -ItemType Directory -Path (Join-Path $TestDrive 'passing') -ErrorAction Stop
        $copy = Join-Path $passing.FullName 'run-pester.ps1'
        Copy-Item -LiteralPath $runner -Destination $copy -ErrorAction Stop
        Set-Content -LiteralPath (Join-Path $passing.FullName 'fixture.Tests.ps1') -Value '# fixture' -ErrorAction Stop
        $invocations = New-Object 'System.Collections.Generic.List[string]'
        $previousExitCode = $global:LASTEXITCODE
        function Invoke-Pester {
            param([string]$Path, [switch]$PassThru)
            $invocations.Add("$Path|$PassThru")
            [pscustomobject]@{ PassedCount = 3; FailedCount = 0; SkippedCount = 0; TotalCount = 3 }
        }

        try {
            $output = & $copy 6>&1
            $LASTEXITCODE | Should Be 0
            ($invocations -join ', ') | Should Be "$($passing.FullName)|True"
            ($output -join "`n") | Should Match '3 passed, 0 failed'
        }
        finally {
            $global:LASTEXITCODE = $previousExitCode
        }
    }
}
