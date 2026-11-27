#Requires -Version 5.1
<#
.SYNOPSIS
  Run EVERY PowerShell (Pester) suite under scripts/ and exit non-zero if the run is incomplete or fails.
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

if (-not (Get-Module -ListAvailable -Name Pester | Where-Object { $_.Version -lt [version]'5.0.0' })) {
    Write-Error "Pester 3.x or 4.x is required. Install the compatible version with: Install-Module Pester -RequiredVersion 3.4.0 -Scope CurrentUser"
    exit 2
}
Import-Module Pester -MaximumVersion 4.99.99 -ErrorAction Stop

$root = $PSScriptRoot
$suites = @(Get-ChildItem -Path $root -Recurse -Filter '*.Tests.ps1' | Sort-Object FullName)
if ($suites.Count -eq 0) { Write-Error "No *.Tests.ps1 suites found under $root"; exit 2 }

Write-Host "run-pester: discovered $($suites.Count) suite(s) under $root" -ForegroundColor Cyan
foreach ($s in $suites) { Write-Host "  - $($s.FullName.Substring($root.Length + 1))" -ForegroundColor DarkGray }

# Run every suite in ONE Invoke-Pester pass over the directory (Pester discovers *.Tests.ps1).
$result = Invoke-Pester -Path $root -PassThru

# Pester 3.4's PassThru object omits InconclusiveCount, but retains the individual results.
$inconclusive = @($result.TestResult | Where-Object { $_.Result -eq 'Inconclusive' }).Count
$executed = $result.PassedCount + $result.FailedCount + $inconclusive
$runFailed = $executed -eq 0 -or $result.FailedCount -gt 0 -or $result.SkippedCount -gt 0 -or
    $result.PendingCount -gt 0 -or $inconclusive -gt 0

Write-Host ""
Write-Host ("run-pester: {0} passed, {1} failed, {2} skipped, {3} pending, {4} inconclusive (of {5})" -f `
    $result.PassedCount, $result.FailedCount, $result.SkippedCount, $result.PendingCount, $inconclusive, $result.TotalCount) `
    -ForegroundColor $(if ($runFailed) { 'Red' } else { 'Green' })

if ($executed -eq 0) { Write-Host 'run-pester: no test cases ran' -ForegroundColor Red }
if ($runFailed) { exit 1 }
exit 0
