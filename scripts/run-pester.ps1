#Requires -Version 5.1
<#
.SYNOPSIS
  Run EVERY PowerShell (Pester) suite under scripts/ and exit non-zero if any assertion fails.
.DESCRIPTION
  The PowerShell-side equivalent of `npm test` in app/. Orphaned-test rot has bitten this repo twice
  (a suite existed but nothing ran it, so a regression shipped green); this is the single gate that
  runs them all. It discovers all *.Tests.ps1 under scripts/ (this file's directory, recursively),
  times each suite, prints a summary, and sets a non-zero exit code on ANY failure so CI / a
  pre-commit check can rely on it.
.PARAMETER PesterModulePath
  Optional path to the provisioned Pester 3.4.0 manifest. Locally, import Pester 3.4.0 by name.
.EXAMPLE
  powershell -NoProfile -ExecutionPolicy Bypass -File scripts\run-pester.ps1
.EXAMPLE
  pwsh -File scripts/run-pester.ps1            # exit code 0 = all green, non-zero = failures
#>
param([ValidateNotNullOrEmpty()][string]$PesterModulePath = 'Pester')
$ErrorActionPreference = 'Stop'

$pesterVersion = '3.4.0'
try {
    Import-Module -Name $PesterModulePath -RequiredVersion $pesterVersion -ErrorAction Stop
} catch {
    throw "Pester $pesterVersion is required. Install it locally with Install-Module Pester -RequiredVersion $pesterVersion -Scope CurrentUser. $($_.Exception.Message)"
}

$root = $PSScriptRoot
$suites = @(Get-ChildItem -Path $root -Recurse -Filter '*.Tests.ps1' | Sort-Object FullName)
if ($suites.Count -eq 0) { Write-Error "No *.Tests.ps1 suites found under $root"; exit 2 }

Write-Host "run-pester: discovered $($suites.Count) suite(s) under $root" -ForegroundColor Cyan

$passed = $failed = $skipped = $total = 0
foreach ($suite in $suites) {
    $relativePath = $suite.FullName.Substring($root.Length + 1)
    Write-Host "run-pester: starting $relativePath" -ForegroundColor Cyan
    $timer = [System.Diagnostics.Stopwatch]::StartNew()
    try {
        $result = Invoke-Pester -Path $suite.FullName -PassThru
        $passed += $result.PassedCount
        $failed += $result.FailedCount
        $skipped += $result.SkippedCount
        $total += $result.TotalCount
    } finally {
        Write-Host ('run-pester: {0} took {1:F2} s' -f $relativePath, $timer.Elapsed.TotalSeconds)
    }
}

Write-Host ""
Write-Host ("run-pester: {0} passed, {1} failed, {2} skipped (of {3})" -f `
    $passed, $failed, $skipped, $total) -ForegroundColor $(if ($failed -gt 0) { 'Red' } else { 'Green' })

if ($failed -gt 0) { exit 1 }
exit 0
