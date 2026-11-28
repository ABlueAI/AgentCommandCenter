$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$suite = Join-Path $here 'script-tooling.test.js'

Describe 'Node script tooling behavior' {
    It 'runs the fence and performance harness with mocked process and network boundaries' {
        $output = & node $suite
        $LASTEXITCODE | Should Be 0
        ($output -join "`n") | Should Match 'fence-write behavior passed'
        ($output -join "`n") | Should Match 'pane-status-chain-perf behavior passed'
    }
}
