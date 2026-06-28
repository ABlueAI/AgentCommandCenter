<#
.SYNOPSIS
  List every worktree (i.e. every parallel agent) for the current repo.
.EXAMPLE
  .\list-agents.ps1
#>
$ErrorActionPreference = "Stop"
$repoRoot = (git rev-parse --show-toplevel 2>$null)
if (-not $repoRoot) { throw "Not inside a git repository. cd into your project repo first." }

Write-Host "Worktrees for $(Split-Path $repoRoot -Leaf):" -ForegroundColor Cyan
git worktree list
