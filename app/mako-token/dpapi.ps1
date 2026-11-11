# S35 mako-token: Windows DPAPI (current user) for the App's private key.
# Usage: powershell -NoProfile -NonInteractive -File dpapi.ps1 protect|unprotect
# Reads base64 on stdin and writes base64 on stdout. The key never appears on a command line, in an
# environment variable or in a log: only the stdin and stdout pipes between this script and
# mako-token. Protected data opens only for the same Windows user on the same PC.
param([Parameter(Mandatory = $true)][ValidateSet('protect', 'unprotect')][string]$Mode)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Security
$inText = [Console]::In.ReadToEnd().Trim()
$bytes = [Convert]::FromBase64String($inText)
$entropy = [Text.Encoding]::UTF8.GetBytes('mako-agents-v1')
$scope = [Security.Cryptography.DataProtectionScope]::CurrentUser
if ($Mode -eq 'protect') {
  $out = [Security.Cryptography.ProtectedData]::Protect($bytes, $entropy, $scope)
} else {
  $out = [Security.Cryptography.ProtectedData]::Unprotect($bytes, $entropy, $scope)
}
[Console]::Out.Write([Convert]::ToBase64String($out))
