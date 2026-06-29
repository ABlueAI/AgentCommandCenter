<#
.SYNOPSIS
  Deploy the canonical agent-roles/ definitions so Claude Code can launch them.
.DESCRIPTION
  The version-controlled source of truth for roles is agent-roles/*.md. Claude Code
  discovers agents from .claude/agents/ (project scope, walked up from cwd) and
  ~/.claude/agents/ (user scope, available in EVERY project). Because the command
  center launches agents into worktrees of many different repos, user scope is the
  right default - it makes the roles available no matter which project you're driving.

  This copies each role into ~/.claude/agents/ . Pass -ProjectDir to also drop them
  into a specific repo's .claude/agents/ (handy for committing roles alongside a
  single project). README.md is never deployed.
.EXAMPLE
  .\sync-roles.ps1
.EXAMPLE
  .\sync-roles.ps1 -ProjectDir "D:\UEDEV\LighthouseBlue"
#>
param(
    [string]$ProjectDir
)
$ErrorActionPreference = "Stop"

$src = Join-Path $PSScriptRoot "..\agent-roles"
if (-not (Test-Path $src)) { throw "agent-roles/ not found next to scripts/. Run from the repo." }
$roles = Get-ChildItem $src -Filter *.md | Where-Object { $_.Name -ne 'README.md' }
if (-not $roles) { throw "No role .md files found in $src." }

function Deploy-To([string]$dir) {
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
    foreach ($r in $roles) { Copy-Item $r.FullName (Join-Path $dir $r.Name) -Force }
    Write-Host "Synced $($roles.Count) roles -> $dir" -ForegroundColor Green
}

# User scope: available to every project the command center drives.
Deploy-To (Join-Path $env:USERPROFILE ".claude\agents")

# Optional project scope.
if ($ProjectDir) { Deploy-To (Join-Path $ProjectDir ".claude\agents") }

Write-Host ""
Write-Host "Roles deployed: $(( $roles | ForEach-Object { $_.BaseName }) -join ', ')" -ForegroundColor Cyan
Write-Host "Launch one with:  claude --agent <role>   (e.g. claude --agent builder)"
