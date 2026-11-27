$scriptPath = Join-Path $PSScriptRoot 'video-scout-retention-sweep.ps1'
$powerShell = (Get-Process -Id $PID).Path

Describe 'video-scout-retention-sweep exit status' {
    It 'prints the summary and exits <ExpectedExit> for <Scenario>' -TestCases @(
        @{ Scenario = 'failed deletions'; Failed = 2; Warning = ''; Refused = ''; ExpectedExit = 1; Summary = 'failed\s*:\s*2' }
        @{ Scenario = 'an internal error'; Failed = 0; Warning = 'sweep-internal-error'; Refused = ''; ExpectedExit = 1; Summary = 'warning\s*:\s*sweep-internal-error' }
        @{ Scenario = 'a refused sweep'; Failed = 0; Warning = ''; Refused = 'downloads-root-missing'; ExpectedExit = 3; Summary = 'refused\s*:\s*downloads-root-missing' }
        @{ Scenario = 'a completed sweep'; Failed = 0; Warning = ''; Refused = ''; ExpectedExit = 0; Summary = 'failed\s*:\s*0' }
    ) {
        param($Scenario, $Failed, $Warning, $Refused, $ExpectedExit, $Summary)
        $lib = New-Item -Path (Join-Path $TestDrive 'lib') -ItemType Directory -Force
        Copy-Item -LiteralPath $scriptPath -Destination $TestDrive
        $fixture = Join-Path $lib.FullName 'retention-sweep-video-scout-media.ps1'
        # Exercise the real wrapper with a controlled summary, without deleting any media.
        Set-Content -LiteralPath $fixture -Value @"
function Invoke-VideoScoutRetentionSweep {
    param(`$DownloadsRoot, `$MinimumAgeDays, [switch]`$Apply, [switch]`$RetryDeleteFailed)
    [pscustomobject]@{ failed = $Failed; warning = '$Warning'; refused = '$Refused' }
}
"@
        $wrapper = Join-Path $TestDrive 'video-scout-retention-sweep.ps1'
        $output = & $powerShell -NoProfile -ExecutionPolicy Bypass -File $wrapper -DownloadsRoot $TestDrive -Apply
        $actualExit = $LASTEXITCODE

        ($output | Out-String) | Should Match $Summary
        $actualExit | Should Be $ExpectedExit
    }
}
