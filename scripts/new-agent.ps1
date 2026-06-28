<#
.SYNOPSIS
  Create an isolated git worktree + branch for a parallel agent.
.DESCRIPTION
  Run from inside the repo you want to work on. Creates a sibling folder
  ..\<repo>-<task> checked out to a new branch agent/<task>, branched off <Base>.
.EXAMPLE
  .\new-agent.ps1 -Task search-bar
.EXAMPLE
  .\new-agent.ps1 -Task hotfix-login -Base develop
#>
param(
    [Parameter(Mandatory = $true)][string]$Task,
    [string]$Base = "main"
)
$ErrorActionPreference = "Stop"

# Must be inside a git repo
$repoRoot = (git rev-parse --show-toplevel 2>$null)
if (-not $repoRoot) { throw "Not inside a git repository. cd into your project repo first." }

$repoName     = Split-Path $repoRoot -Leaf
$branch       = "agent/$Task"
$worktreePath = Join-Path (Split-Path $repoRoot -Parent) "$repoName-$Task"

if (Test-Path $worktreePath) { throw "Worktree path already exists: $worktreePath" }

git worktree add -b $branch $worktreePath $Base

Write-Host ""
Write-Host "Agent worktree ready:" -ForegroundColor Green
Write-Host "  Folder: $worktreePath"
Write-Host "  Branch: $branch  (off $Base)"
Write-Host ""
Write-Host "Next:" -ForegroundColor Cyan
Write-Host "  cd `"$worktreePath`""
Write-Host "  claude"
