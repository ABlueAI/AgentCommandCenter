#Requires -Version 5.1
<#
.SYNOPSIS
  Create Blue's private Mako vault for Obsidian (S13): a folder outside this public repository with
  an index that links to STATUS, PLAN, DECISIONS and the checklist, plus an AGENTS.md for agents and
  a CLAUDE.md that imports it.
.DESCRIPTION
  Never overwrites: an existing index, AGENTS.md or CLAUDE.md is left as it is and reported. Refuses a path
  inside this repository (it is public, and the vault is private by design; docs/PLAN-1.1.md S13).
  Writes no credentials and reads none. The links point at GitHub, so the vault holds no copy of
  the repository's files. The guard refuses paths that pass through junctions or symlinks.
  It does not resolve subst drives.
.EXAMPLE
  powershell -NoProfile -ExecutionPolicy Bypass -File scripts\new-mako-vault.ps1 -Path D:\Workspace\Mako-Vault
#>
param(
    [string]$Path
)

$script:MvRepoUrl = 'https://github.com/ABlueAI/AgentCommandCenter/blob/main'
$script:MvIndexName = 'Mako index.md'
$script:MvAgentsName = 'AGENTS.md'
# Claude Code loads CLAUDE.md, not AGENTS.md, so CLAUDE.md imports it (as this repository's does).
$script:MvClaudeName = 'CLAUDE.md'

function Get-MakoVaultFullPath {
    param([string]$LiteralPath)
    $full = [System.IO.Path]::GetFullPath($LiteralPath)
    $root = [System.IO.Path]::GetPathRoot($full)
    if ($full.Length -le $root.Length) { return $full }
    return $full.TrimEnd('\', '/')
}

function Assert-MakoVaultPlainPath {
    param([string]$FullPath)
    $root = [System.IO.Path]::GetPathRoot($FullPath)
    $parts = $FullPath.Substring($root.Length).Split([char[]]@('\', '/'), [StringSplitOptions]::RemoveEmptyEntries)
    $current = $root
    foreach ($part in @('') + $parts) {
        if ($part) { $current = [System.IO.Path]::Combine($current, $part) }
        try { $attributes = [System.IO.File]::GetAttributes($current) }
        catch [System.IO.FileNotFoundException] { return }
        catch [System.IO.DirectoryNotFoundException] { return }
        if ($attributes -band [System.IO.FileAttributes]::ReparsePoint) {
            throw "Refusing '$FullPath': '$current' is a reparse point. Use a direct path."
        }
    }
}

function Test-MakoVaultInsideRepo {
    param([string]$VaultPath, [string]$RepoRoot)
    $v = Get-MakoVaultFullPath $VaultPath
    $r = Get-MakoVaultFullPath $RepoRoot
    if ([string]::Equals($v, $r, [System.StringComparison]::OrdinalIgnoreCase)) { return $true }
    foreach ($sep in @('\', '/')) {
        if ($v.StartsWith($r.TrimEnd('\', '/') + $sep, [System.StringComparison]::OrdinalIgnoreCase)) { return $true }
    }
    Assert-MakoVaultPlainPath $r
    Assert-MakoVaultPlainPath $v
    return $false
}

function Get-MakoVaultIndexText {
    $u = $script:MvRepoUrl
    return @"
# Mako index

Blue's private Mako vault (created by scripts/new-mako-vault.ps1, S13). The project's shared brain
lives in the public repository; this index links to it rather than copying it.

## Read first

- [STATUS]($u/STATUS.md): where things stand right now.
- [PLAN]($u/docs/PLAN-1.1.md): the ordered session plan.
- [DECISIONS]($u/docs/DECISIONS.md): what Blue has decided, with dates and his words.
- [Checklist]($u/BLUE-CHECKLIST.md): everything Blue has to do, in order.

## Notes

Add private notes below as links, one per line, newest first.

"@
}

function Get-MakoVaultAgentsText {
    return @"
# Rules for agents in this vault

- This vault is private. Never copy its notes into the public AgentCommandCenter repository, a PR,
  an issue or any other public place.
- No secrets here either: no keys, tokens, passwords or client records. Credentials live in Mako's
  key setup or Bitwarden.
- Keep "Mako index.md" current: when you add a note, add a link to it under "Notes", newest first.
  Don't remove Blue's notes or links.
- Read the [repository rulebook]($script:MvRepoUrl/AGENTS.md). This file adds the vault's rules.
- Use the Obsidian Skills (kepano/obsidian-skills) for Obsidian Markdown, Bases and Canvas files.

"@
}

function New-MakoVault {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$RepoRoot
    )
    if ([string]::IsNullOrWhiteSpace($Path)) { throw 'Give the vault folder with -Path.' }
    if (Test-MakoVaultInsideRepo -VaultPath $Path -RepoRoot $RepoRoot) {
        throw "Refusing '$Path': it is inside the public repository ($RepoRoot). Pick a folder outside it."
    }
    $full = Get-MakoVaultFullPath $Path
    if (Test-Path -LiteralPath $full -PathType Leaf) { throw "Refusing '$full': it is a file, not a folder." }
    if (-not (Test-Path -LiteralPath $full)) { New-Item -ItemType Directory -Path $full -Force | Out-Null }

    $utf8 = New-Object System.Text.UTF8Encoding($false)
    $result = @()
    foreach ($f in @(
            @{ Name = $script:MvIndexName; Text = (Get-MakoVaultIndexText) },
            @{ Name = $script:MvAgentsName; Text = (Get-MakoVaultAgentsText) },
            @{ Name = $script:MvClaudeName; Text = "@AGENTS.md`n" })) {
        $target = Join-Path $full $f.Name
        if (Test-Path -LiteralPath $target) {
            $result += [pscustomobject]@{ File = $target; Action = 'kept' }
        }
        else {
            [System.IO.File]::WriteAllText($target, $f.Text, $utf8)
            $result += [pscustomobject]@{ File = $target; Action = 'created' }
        }
    }
    return $result
}

if ($MyInvocation.InvocationName -ne '.') {
    $ErrorActionPreference = 'Stop'
    if ([string]::IsNullOrWhiteSpace($Path)) { throw 'Give the vault folder with -Path, for example -Path D:\Workspace\Mako-Vault.' }
    $repoRoot = Split-Path -Parent $PSScriptRoot
    foreach ($r in (New-MakoVault -Path $Path -RepoRoot $repoRoot)) {
        Write-Host ("{0}: {1}" -f $r.Action, $r.File)
    }
}
