<#
.SYNOPSIS
  Deploy the canonical agent-roles/ definitions (and the write-fence hook) so Claude
  Code can launch them.
.DESCRIPTION
  The version-controlled source of truth for roles is agent-roles/*.md. Claude Code
  discovers agents from .claude/agents/ (project scope, walked up from cwd) and
  ~/.claude/agents/ (user scope, available in EVERY project). Because the command
  center launches agents into many different repos, user scope is the right default.

  Fenced roles (web-scout, operator) reference a PreToolUse hook via the placeholder
  __CC_HOOK__. This script deploys scripts/hooks/fence-write.js to ~/.claude/hooks/ and
  fills that placeholder with its absolute path as it deploys each role file. So the
  committed source stays portable; the deployed copies are machine-correct.

  README.md is never deployed.
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

# Deploy the write-fence hook to user scope; compute its absolute path with forward slashes
# (Node accepts them on Windows) to inject in place of __CC_HOOK__.
$hookSrc  = Join-Path $PSScriptRoot "hooks\fence-write.js"
$hookDir  = Join-Path $env:USERPROFILE ".claude\hooks"
$hookDest = Join-Path $hookDir "fence-write.js"
if (Test-Path $hookSrc) {
    New-Item -ItemType Directory -Force -Path $hookDir | Out-Null
    Copy-Item $hookSrc $hookDest -Force
    Write-Host "Deployed write-fence hook -> $hookDest" -ForegroundColor Green
} else {
    Write-Warning "fence-write.js not found at $hookSrc; fenced roles won't enforce until it exists."
}
$hookPathFwd = ($hookDest -replace '\\', '/')
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)

function Deploy-To([string]$dir) {
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
    foreach ($r in $roles) {
        $content = (Get-Content -Raw $r.FullName).Replace('__CC_HOOK__', $hookPathFwd)
        # Write UTF-8 WITHOUT a BOM so the YAML frontmatter parses (a BOM before --- breaks it).
        [System.IO.File]::WriteAllText((Join-Path $dir $r.Name), $content, $utf8NoBom)
    }
    Write-Host "Synced $($roles.Count) roles -> $dir" -ForegroundColor Green
}

# User scope: available to every project the command center drives.
Deploy-To (Join-Path $env:USERPROFILE ".claude\agents")

# Optional project scope.
if ($ProjectDir) { Deploy-To (Join-Path $ProjectDir ".claude\agents") }

Write-Host ""
Write-Host "Roles deployed: $(( $roles | ForEach-Object { $_.BaseName }) -join ', ')" -ForegroundColor Cyan
Write-Host "Launch one with:  claude --agent <role>   (e.g. claude --agent builder)"
