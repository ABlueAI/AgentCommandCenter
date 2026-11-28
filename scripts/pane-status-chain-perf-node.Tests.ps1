$suite = Join-Path $PSScriptRoot 'pane-status-chain-perf.test.js'

Describe 'pane-status-chain-perf Node suite' {
    It 'runs the benchmark status regression tests' {
        $ErrorActionPreference = 'Continue'
        $output = node $suite 2>&1
        if ($LASTEXITCODE -ne 0) { throw ($output | Out-String) }
    }
}
