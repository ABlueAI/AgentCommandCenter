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
}
