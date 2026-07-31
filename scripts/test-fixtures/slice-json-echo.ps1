# Test fixture (never invoked in production): receives -SliceRangesJson exactly the way
# feed-gemini.ps1 declares it and echoes the received value back base64-encoded, so the caller can
# prove BYTE-identity across the real Windows argument boundary (main/node-pty-style argument
# array -> CreateProcess command line -> CommandLineToArgvW -> PowerShell parameter binding).
# Base64 removes every console-encoding ambiguity from the comparison itself.
param([string]$SliceRangesJson)
$bytes = [System.Text.Encoding]::UTF8.GetBytes([string]$SliceRangesJson)
Write-Output ("SLICEJSON:" + [Convert]::ToBase64String($bytes))
