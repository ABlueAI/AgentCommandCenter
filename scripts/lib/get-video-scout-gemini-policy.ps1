# Resolve the tracked policy independently of the child working directory.
function Get-VideoScoutGeminiPolicyPath {
    $path = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\config\video-scout-gemini-policy.toml'))
    try {
        # File.Exists also returns true when permissions or a sharing lock prevent reading.
        $stream = [System.IO.File]::OpenRead($path)
        try {
            if ($stream.ReadByte() -eq -1) { throw 'The policy is empty.' }
        }
        finally { $stream.Dispose() }
    }
    catch {
        throw 'Video Scout Gemini policy is missing, empty, or unreadable. CLI launch refused.'
    }
    return $path
}
