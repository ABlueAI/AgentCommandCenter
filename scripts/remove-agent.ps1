<#
.SYNOPSIS
  Remove an agent's worktree once its work is merged.
.DESCRIPTION
  Removes the sibling folder ..\<repo>-<task>. The branch agent/<task> is left intact
  so you don't lose unmerged work by accident; delete it manually when you're sure.
.EXAMPLE
  .\remove-agent.ps1 -Task search-bar
#>
param(
    [Parameter(Mandatory = $true)][string]$Task,
    [switch]$Force
)
$ErrorActionPreference = "Stop"

$repoRoot = (git rev-parse --show-toplevel 2>$null)
if (-not $repoRoot) { throw "Not inside a git repository. cd into your project repo first." }

$repoName     = Split-Path $repoRoot -Leaf
$worktreePath = Join-Path (Split-Path $repoRoot -Parent) "$repoName-$Task"

if (-not (Test-Path $worktreePath)) { throw "No worktree found at: $worktreePath" }

if ($Force) { git worktree remove --force $worktreePath }
else        { git worktree remove $worktreePath }

Write-Host "Removed worktree: $worktreePath" -ForegroundColor Green
Write-Host "Branch agent/$Task still exists. When you're sure it's merged, delete it with:" -ForegroundColor Yellow
Write-Host "  git branch -d agent/$Task"
