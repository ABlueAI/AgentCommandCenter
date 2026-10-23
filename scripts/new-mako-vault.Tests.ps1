<#
.SYNOPSIS
  Pester (3.4) tests for scripts/new-mako-vault.ps1: the private Mako vault (S13).
.DESCRIPTION
  Run with: powershell -NoProfile -ExecutionPolicy Bypass -File scripts\run-pester.ps1
  Every vault is created under a fresh folder in %TEMP% and removed afterwards. The script is
  dot-sourced (its InvocationName guard keeps it from running).
#>
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$script:MvRepoRoot = Split-Path -Parent $here
. (Join-Path $here 'new-mako-vault.ps1')
$ErrorActionPreference = 'Continue'

function New-MvTempRoot {
    $p = Join-Path ([System.IO.Path]::GetTempPath()) ('mako-vault-test-' + [guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $p -Force | Out-Null
    return $p
}

Describe 'new-mako-vault' {
    It 'creates the folder, the index, AGENTS.md and a CLAUDE.md that imports it' {
        $root = New-MvTempRoot
        try {
            $vault = Join-Path $root 'Mako-Vault'
            $r = @(New-MakoVault -Path $vault -RepoRoot $script:MvRepoRoot)
            $r.Count | Should Be 3
            @($r | Where-Object { $_.Action -eq 'created' }).Count | Should Be 3
            [System.IO.File]::ReadAllText((Join-Path $vault 'CLAUDE.md')).Trim() | Should Be '@AGENTS.md'
            Test-Path -LiteralPath (Join-Path $vault 'Mako index.md') | Should Be $true
            Test-Path -LiteralPath (Join-Path $vault 'AGENTS.md') | Should Be $true
        }
        finally { Remove-Item -LiteralPath $root -Recurse -Force -ErrorAction SilentlyContinue }
    }

    It 'links the index to STATUS, PLAN, DECISIONS and the checklist on GitHub' {
        $text = Get-MakoVaultIndexText
        $base = 'https://github.com/ABlueAI/AgentCommandCenter/blob/main/'
        foreach ($f in @('STATUS.md', 'docs/PLAN-1.1.md', 'docs/DECISIONS.md', 'BLUE-CHECKLIST.md')) {
            $text.Contains('(' + $base + $f + ')') | Should Be $true
        }
    }

    It 'never overwrites an existing index' {
        $root = New-MvTempRoot
        try {
            $index = Join-Path $root 'Mako index.md'
            [System.IO.File]::WriteAllText($index, 'Blue notes')
            $r = @(New-MakoVault -Path $root -RepoRoot $script:MvRepoRoot)
            [System.IO.File]::ReadAllText($index) | Should Be 'Blue notes'
            ($r | Where-Object { $_.File -like '*Mako index.md' }).Action | Should Be 'kept'
            ($r | Where-Object { $_.File -like '*AGENTS.md' }).Action | Should Be 'created'
            ($r | Where-Object { $_.File -like '*CLAUDE.md' }).Action | Should Be 'created'
        }
        finally { Remove-Item -LiteralPath $root -Recurse -Force -ErrorAction SilentlyContinue }
    }

    It 'refuses the repository itself and any folder inside it' {
        { New-MakoVault -Path $script:MvRepoRoot -RepoRoot $script:MvRepoRoot } | Should Throw 'inside the public repository'
        { New-MakoVault -Path (Join-Path $script:MvRepoRoot 'vault') -RepoRoot $script:MvRepoRoot } | Should Throw 'inside the public repository'
        { New-MakoVault -Path ($script:MvRepoRoot.ToUpperInvariant() + '\vault') -RepoRoot $script:MvRepoRoot } | Should Throw 'inside the public repository'
        Test-Path -LiteralPath (Join-Path $script:MvRepoRoot 'vault') | Should Be $false
    }

    It 'allows a sibling folder whose name starts with the repository name' {
        $sibling = $script:MvRepoRoot + '-vault'
        Test-MakoVaultInsideRepo -VaultPath $sibling -RepoRoot $script:MvRepoRoot | Should Be $false
    }

    It 'refuses a path that is a file' {
        $root = New-MvTempRoot
        try {
            $file = Join-Path $root 'not-a-folder.txt'
            [System.IO.File]::WriteAllText($file, 'x')
            { New-MakoVault -Path $file -RepoRoot $script:MvRepoRoot } | Should Throw 'is a file'
        }
        finally { Remove-Item -LiteralPath $root -Recurse -Force -ErrorAction SilentlyContinue }
    }

    It 'writes no secrets or tokens into the vault files' {
        $all = (Get-MakoVaultIndexText) + (Get-MakoVaultAgentsText)
        $all -match '(ghp_|github_pat_|sk-[A-Za-z0-9]|AIza)' | Should Be $false
    }
}
