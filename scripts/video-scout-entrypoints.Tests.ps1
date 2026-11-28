$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$library = Join-Path $here 'video-scout-library.ps1'
$retention = Join-Path $here 'video-scout-retention-sweep.ps1'

function Invoke-LibraryTestCapture {
    param([string]$Action, [string]$RunRoot)

    $encoding = [Console]::OutputEncoding
    $stdout = [Console]::Out
    $capture = New-Object System.IO.StringWriter
    $previousExitCode = $global:LASTEXITCODE
    try {
        [Console]::SetOut($capture)
        & $library -Action $Action -RunRoot $RunRoot
        [pscustomobject]@{
            ExitCode = $LASTEXITCODE
            Text = $capture.ToString()
        }
    }
    finally {
        [Console]::OutputEncoding = $encoding
        [Console]::SetOut($stdout)
        $capture.Dispose()
        $global:LASTEXITCODE = $previousExitCode
    }
}

Describe 'video-scout-library entry point' {
    It 'returns one JSON result for an empty library' {
        $result = Invoke-LibraryTestCapture -Action List -RunRoot $TestDrive
        $result.ExitCode | Should Be 0
        $json = ConvertFrom-Json -InputObject $result.Text -ErrorAction Stop
        $json.ok | Should Be $true
        $json.rootExists | Should Be $true
        $json.total | Should Be 0
    }

    It 'returns a JSON refusal when Read has no run ID' {
        $result = Invoke-LibraryTestCapture -Action Read -RunRoot $TestDrive
        $result.ExitCode | Should Be 0
        $json = ConvertFrom-Json -InputObject $result.Text -ErrorAction Stop
        $json.ok | Should Be $false
        $json.status | Should Be 'unsafe'
        $json.reason | Should Be 'run-id-required'
    }
}

Describe 'video-scout-retention-sweep entry point' {
    It 'prints a dry-run summary for an empty downloads root' {
        $previousExitCode = $global:LASTEXITCODE
        try {
            $output = & $retention -DownloadsRoot $TestDrive 6>&1
            $LASTEXITCODE | Should Be 0
            ($output -join "`n") | Should Match 'DRY-RUN'
            ($output -join "`n") | Should Match 'scanned\s*:\s*0'
        }
        finally {
            $global:LASTEXITCODE = $previousExitCode
        }
    }

    It 'prints a refusal and exits 3 when the downloads root is missing' {
        $previousExitCode = $global:LASTEXITCODE
        try {
            $missing = Join-Path $TestDrive 'missing-downloads'
            $output = & $retention -DownloadsRoot $missing 3>&1 6>&1
            $LASTEXITCODE | Should Be 3
            ($output -join "`n") | Should Match 'downloads-root-missing'
        }
        finally {
            $global:LASTEXITCODE = $previousExitCode
        }
    }
}
