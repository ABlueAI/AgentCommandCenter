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

# Idempotent: if the worktree folder is already there, reuse it (the app just reopens a terminal).
if (Test-Path $worktreePath) {
    Write-Host "Worktree already exists, reusing: $worktreePath"
    exit 0
}

# If the branch already exists (e.g. a prior agent was removed but its branch was preserved),
# attach that branch to the new worktree instead of trying to re-create it.
$branchExists = git branch --list $branch
if ($branchExists) {
    git worktree add $worktreePath $branch
} else {
    git worktree add -b $branch $worktreePath $Base
}

Write-Host ""
Write-Host "Agent worktree ready:" -ForegroundColor Green
Write-Host "  Folder: $worktreePath"
Write-Host "  Branch: $branch  (off $Base)"
Write-Host ""
Write-Host "Next:" -ForegroundColor Cyan
Write-Host "  cd `"$worktreePath`""
Write-Host "  claude"
