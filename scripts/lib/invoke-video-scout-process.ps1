. (Join-Path $PSScriptRoot 'get-node-cli-arg.ps1')

function Get-VideoScoutProcessEnvironment {
    param([string]$WorkingDirectory)
    $environment = @{ TEMP = $WorkingDirectory; TMP = $WorkingDirectory; TMPDIR = $WorkingDirectory }
    $windows = [System.Environment]::GetFolderPath('Windows')
    if ($windows) { $environment.SystemRoot = $windows }
    return $environment
}

function Invoke-VideoScoutProcess {
    param(
        [string]$Executable,
        [string[]]$Arguments,
        [string]$WorkingDirectory,
        [hashtable]$Environment,
        [ref]$ExitCode,
        [datetime]$Deadline = [datetime]::MaxValue
    )
    if (-not [System.IO.Path]::IsPathRooted($Executable) -or [IO.Path]::GetExtension($Executable) -ne '.exe') {
        throw 'Video Scout requires a native executable for this step. Launch refused.'
    }
    $start = New-Object System.Diagnostics.ProcessStartInfo
    $start.FileName = $Executable
    $start.WorkingDirectory = $WorkingDirectory
    $start.UseShellExecute = $false
    $start.RedirectStandardOutput = $true
    $start.StandardOutputEncoding = [System.Text.Encoding]::UTF8
    $start.EnvironmentVariables.Clear()
    foreach ($entry in $Environment.GetEnumerator()) { $start.EnvironmentVariables[$entry.Key] = $entry.Value }

    if ($start.PSObject.Properties['ArgumentList']) {
        foreach ($argument in $Arguments) { $start.ArgumentList.Add($argument) }
    }
    else {
        # .NET Framework exposes only the Windows process argument string. Quote each
        # argv element using the native CRT convention and pass it directly to CreateProcess.
        $start.Arguments = ($Arguments | ForEach-Object { '"' + (ConvertTo-NodeCliArg -Arg $_) + '"' }) -join ' '
    }
    $process = New-Object System.Diagnostics.Process
    $process.StartInfo = $start
    $started = $false
    try {
        $started = $process.Start()
        if (-not $started) { throw 'Video Scout could not start its child process.' }
        if ($Deadline -eq [datetime]::MaxValue) {
            while ($null -ne ($line = $process.StandardOutput.ReadLine())) { Write-Output $line }
            $process.WaitForExit()
        }
        else {
            while ($true) {
                $read = $process.StandardOutput.ReadLineAsync()
                $remaining = [Math]::Max(0, [int]($Deadline - [datetime]::UtcNow).TotalMilliseconds)
                if (-not $read.Wait($remaining)) { throw 'Video Scout metadata lookup timed out.' }
                if ($null -eq $read.Result) { break }
                Write-Output $read.Result
            }
            $remaining = [Math]::Max(0, [int]($Deadline - [datetime]::UtcNow).TotalMilliseconds)
            if (-not $process.WaitForExit($remaining)) { throw 'Video Scout metadata lookup timed out.' }
        }
        $ExitCode.Value = $process.ExitCode
    }
    finally {
        try {
            if ($started -and -not $process.HasExited) { $process.Kill() }
        }
        finally { $process.Dispose() }
    }
}
