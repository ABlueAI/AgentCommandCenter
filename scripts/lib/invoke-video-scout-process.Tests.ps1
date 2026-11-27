<#
.SYNOPSIS
  Pester tests for the Video Scout child-process boundary (invoke-video-scout-process.ps1) and the
  REAL metadata probe job (invoke-duration-probe.ps1), with no job-cmdlet shadows.
.DESCRIPTION
  Run with: Invoke-Pester -Path scripts\lib\invoke-video-scout-process.Tests.ps1
  The launch refusals are pure checks (no process starts). The probe tests run the real Start-Job,
  Wait-Job and Receive-Job against a native yt-dlp stub (test-fixtures\video-scout-native-stub.ps1),
  so the job's library loading, the native launch, the nonzero-exit refusal and the deadline are all
  exercised. No network and no real yt-dlp.
#>
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
. (Join-Path $here 'invoke-duration-probe.ps1')
. (Join-Path (Split-Path -Parent $here) 'test-fixtures\video-scout-native-stub.ps1')

Describe 'Invoke-VideoScoutProcess: launch refusals (no process starts)' {
    $root = Join-Path ([IO.Path]::GetTempPath()) ('vs-proc-' + [Guid]::NewGuid().ToString('N'))
    $refusals = @(
        @{ Name = 'a shell shim (.cmd)'; Exe = (Join-Path $root 'gemini.cmd') },
        @{ Name = 'a PowerShell script (.ps1)'; Exe = (Join-Path $root 'gemini.ps1') },
        @{ Name = 'a relative .exe'; Exe = 'foo.exe' },
        @{ Name = 'a bare command name'; Exe = 'gemini' }
    )
    foreach ($case in $refusals) {
        It "refuses $($case.Name)" {
            $code = 0
            $failure = $null
            try {
                Invoke-VideoScoutProcess -Executable $case.Exe -Arguments @('--version') -WorkingDirectory $root `
                    -Environment @{} -ExitCode ([ref]$code)
            }
            catch { $failure = $_.Exception.Message }
            $failure | Should Match 'native executable'
        }
    }
}

Describe 'Invoke-DurationProbe: the real probe job against a native yt-dlp stub' {
    It 'runs with the real job cmdlets (no shadow left by another suite)' {
        (Get-Command Start-Job).CommandType | Should Be 'Cmdlet'
        (Get-Command Receive-Job).CommandType | Should Be 'Cmdlet'
    }

    $root = Join-Path ([IO.Path]::GetTempPath()) ('vs-probe-' + [Guid]::NewGuid().ToString('N'))
    $bin = Join-Path $root 'bin'
    $run = Join-Path $root 'run'
    New-Item -ItemType Directory -Path $bin, $run -Force | Out-Null
    # The stub reads fixture-env.json from the parent of its working directory ($root).
    @'
$record = [PSCustomObject]@{ Cwd = (Get-Location).ProviderPath; Temp = $env:TEMP; Argv = $args }
$record | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path (Get-Location).ProviderPath 'probe-launch.json')
switch ($env:VS_PROBE_STUB) {
    'fail' { [Console]::Error.WriteLine('ERROR: fixture failure'); exit 1 }
    'hang' { Start-Sleep -Seconds 30; '100|NA'; exit 0 }
    default { '100|NA'; exit 0 }
}
'@ | Set-Content -LiteralPath (Join-Path $bin 'yt-dlp.ps1') -Encoding ASCII
    Install-VideoScoutNativeStub (Join-Path $bin 'yt-dlp.ps1')
    $ytdlp = Join-Path $bin 'yt-dlp.exe'
    $url = 'https://youtu.be/aqz-KE-bpKQ'

    function Invoke-StubProbe {
        param([string]$Behavior, [int]$TimeoutSec)
        try {
            ConvertTo-Json -InputObject @{ VS_PROBE_STUB = $Behavior } |
                Set-Content -LiteralPath (Join-Path $root 'fixture-env.json')
            Remove-Item -LiteralPath (Join-Path $run 'probe-launch.json') -ErrorAction SilentlyContinue
            $watch = [Diagnostics.Stopwatch]::StartNew()
            $result = Invoke-DurationProbe -YtDlp $ytdlp -Url $url -TimeoutSec $TimeoutSec -WorkingDirectory $run 6>$null
            $watch.Stop()
            $launchFile = Join-Path $run 'probe-launch.json'
            [PSCustomObject]@{
                Result = $result
                Seconds = $watch.Elapsed.TotalSeconds
                Launch = if (Test-Path -LiteralPath $launchFile) { Get-Content -LiteralPath $launchFile -Raw | ConvertFrom-Json }
            }
        }
        finally { Remove-Item -LiteralPath (Join-Path $root 'fixture-env.json') -ErrorAction SilentlyContinue }
    }

    It 'reads the duration the native child prints, from the run directory, with the option terminator' {
        $r = Invoke-StubProbe -Behavior 'ok' -TimeoutSec 120
        $r.Result.TimedOut | Should Be $false
        $r.Result.Duration | Should Be 100
        $r.Launch.Cwd | Should Be $run
        $r.Launch.Temp | Should Be $run
        $argv = @($r.Launch.Argv)
        $argv[-2] | Should Be '--'
        $argv[-1] | Should Be $url
        ($argv -contains '--simulate') | Should Be $true
        ($argv -contains '--ignore-config') | Should Be $true
    }

    It 'turns a nonzero yt-dlp exit into an unknown duration (fail closed), not a pass' {
        $r = Invoke-StubProbe -Behavior 'fail' -TimeoutSec 120
        $r.Result.Duration | Should BeNullOrEmpty
        $r.Result.TimedOut | Should Be $false
    }

    It 'stops a child that runs past the deadline and returns no duration' {
        $r = Invoke-StubProbe -Behavior 'hang' -TimeoutSec 3
        $r.Result.Duration | Should BeNullOrEmpty
        # Bounded by the deadline, not the stub's 30-second sleep (job start-up included).
        $r.Seconds | Should BeLessThan 25
    }

    Remove-Item -LiteralPath $root -Recurse -Force -ErrorAction SilentlyContinue
}
