# Relay an actual Windows argv to a local PowerShell fixture. This provides a
# native process boundary without requiring either Gemini or yt-dlp on CI.
function Install-VideoScoutNativeStub {
    param([string]$FixtureScript)
    $type = 'ScoutFixture' + [Guid]::NewGuid().ToString('N')
    $runner = @'
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
# Only the fixtures receive opt-in control variables from this file.
$fixtureEnv = Join-Path (Split-Path -Parent (Get-Location).ProviderPath) 'fixture-env.json'
if (Test-Path -LiteralPath $fixtureEnv) {
    (Get-Content -LiteralPath $fixtureEnv -Raw | ConvertFrom-Json).PSObject.Properties |
        ForEach-Object { [Environment]::SetEnvironmentVariable($_.Name, [string]$_.Value) }
}
$fixtureArgs = @($env:SCOUT_FIXTURE_ARGV -split ',' | ForEach-Object {
    [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($_))
})
& $env:SCOUT_FIXTURE_SCRIPT @fixtureArgs
if ($null -ne $LASTEXITCODE) { exit $LASTEXITCODE }
exit 0
'@
    $encoded = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($runner))
    $launcher = @"
using System;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Text;
public class $type {
    public static int Main(string[] args) {
        var start = new ProcessStartInfo();
        start.FileName = @"$PSHOME\powershell.exe";
        start.Arguments = "-NoProfile -NonInteractive -ExecutionPolicy Bypass -EncodedCommand $encoded";
        start.UseShellExecute = false;
        start.EnvironmentVariables["SCOUT_FIXTURE_SCRIPT"] =
            Path.ChangeExtension(Assembly.GetExecutingAssembly().Location, ".ps1");
        start.EnvironmentVariables["SCOUT_FIXTURE_ARGV"] =
            String.Join(",", Array.ConvertAll(args, arg => Convert.ToBase64String(Encoding.UTF8.GetBytes(arg))));
        using (var process = Process.Start(start)) {
            process.WaitForExit();
            return process.ExitCode;
        }
    }
}
"@
    Add-Type -TypeDefinition $launcher -OutputAssembly ([IO.Path]::ChangeExtension($FixtureScript, '.exe')) `
        -OutputType ConsoleApplication -ErrorAction Stop
}

function Write-VideoScoutFixtureEnvironment {
    param([string]$OutputRoot, [string[]]$Names)
    New-Item -ItemType Directory -Path $OutputRoot | Out-Null
    $values = @{}
    foreach ($name in $Names) { $values[$name] = [Environment]::GetEnvironmentVariable($name) }
    ConvertTo-Json -InputObject $values | Set-Content -LiteralPath (Join-Path $OutputRoot 'fixture-env.json')
}
