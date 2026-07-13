#Requires -Version 5.1
<#
.SYNOPSIS
  Run EVERY PowerShell (Pester) suite under scripts/ and exit non-zero if any assertion fails.
.DESCRIPTION
  The PowerShell-side equivalent of `npm test` in app/. Orphaned-test rot has bitten this repo twice
  (a suite existed but nothing ran it, so a regression shipped green); this is the single gate that
  runs them all. It discovers all *.Tests.ps1 under scripts/ (this file's directory, recursively),
  runs them, prints a summary, and sets a non-zero exit code on ANY failure so CI / a pre-commit
  check can rely on it.
.EXAMPLE
  powershell -NoProfile -ExecutionPolicy Bypass -File scripts\run-pester.ps1
.EXAMPLE
  pwsh -File scripts/run-pester.ps1            # exit code 0 = all green, non-zero = failures
#>
param()
$ErrorActionPreference = 'Stop'

if (-not (Get-Module -ListAvailable -Name Pester)) {
    Write-Error "Pester is not installed. Install with: Install-Module Pester -Scope CurrentUser"
    exit 2
}
Import-Module Pester -ErrorAction Stop

$root = $PSScriptRoot
$suites = @(Get-ChildItem -Path $root -Recurse -Filter '*.Tests.ps1' | Sort-Object FullName)
if ($suites.Count -eq 0) { Write-Error "No *.Tests.ps1 suites found under $root"; exit 2 }

Write-Host "run-pester: discovered $($suites.Count) suite(s) under $root" -ForegroundColor Cyan
foreach ($s in $suites) { Write-Host "  - $($s.FullName.Substring($root.Length + 1))" -ForegroundColor DarkGray }

# Run every suite in ONE Invoke-Pester pass over the directory (Pester discovers *.Tests.ps1).
$result = Invoke-Pester -Path $root -PassThru

Write-Host ""
Write-Host ("run-pester: {0} passed, {1} failed, {2} skipped (of {3})" -f `
    $result.PassedCount, $result.FailedCount, $result.SkippedCount, $result.TotalCount) `
    -ForegroundColor $(if ($result.FailedCount -gt 0) { 'Red' } else { 'Green' })

if ($result.FailedCount -gt 0) { exit 1 }
exit 0
