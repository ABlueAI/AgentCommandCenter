$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$suite = Join-Path $here 'script-tooling.test.js'

Describe 'Node script tooling behavior' {
    It 'runs the fence and performance harness with mocked process and network boundaries' {
        # cmd /c merges stderr natively (no NativeCommandError records on PS 5.1), the K5 wrapper
        # form that app/test-reachability.test.js recognises; %ERRORLEVEL% reaches $LASTEXITCODE.
        $output = cmd /c "node `"$suite`" 2>&1"
        $LASTEXITCODE | Should Be 0
        ($output -join "`n") | Should Match 'fence-write behavior passed'
        ($output -join "`n") | Should Match 'pane-status-chain-perf behavior passed'
    }
}
