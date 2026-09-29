<#
.SYNOPSIS
  Deploy the canonical agent-roles/ definitions (and the write-fence hook) so Claude
  Code can launch them.
.DESCRIPTION
  The version-controlled source of truth for roles is agent-roles/*.md. Claude Code
  discovers agents from .claude/agents/ (project scope, walked up from cwd) and
  ~/.claude/agents/ (user scope, available in EVERY project). Because the command
  center launches agents into many different repos, user scope is the right default.

  Fenced roles (web-scout, operator, source-scout) reference a PreToolUse hook via the
  placeholder __CC_HOOK__. This script deploys scripts/hooks/fence-write.js to
  ~/.claude/hooks/ and fills that placeholder with its absolute path as it deploys each
  role file. So the committed source stays portable; the deployed copies are
  machine-correct.

  Deployment is deterministic and fail-closed. The deployed role bytes depend only on
  the tracked role content and the installed hook path, never on the checkout's line
  endings or on Windows PowerShell 5.1's default (ANSI) encoding:
    Phase A (no destination writes): byte-read the hook (refuse if missing or
      unreadable); take the role files sorted ordinally by filename; refuse a UTF-8 BOM,
      malformed UTF-8 or a lone CR; normalize line endings to CRLF; replace every
      __CC_HOOK__; encode as UTF-8 without BOM; keep everything in memory.
    Phase B: write the hook byte-for-byte (never normalized: the app compares it with
      its own checkout's hook hash) and the prepared roles, then re-read every written
      file and refuse on any byte mismatch.
  Any Phase A refusal leaves every destination unchanged.

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

function ConvertTo-DeployedRoleBytes {
    <# Pure: tracked role source bytes -> deployed role bytes. Throws (naming only the file,
       never its content) on a UTF-8 BOM, malformed UTF-8 or a lone CR. #>
    param(
        [Parameter(Mandatory = $true)][AllowEmptyCollection()][byte[]]$SourceBytes,
        [Parameter(Mandatory = $true)][string]$HookPathForward,
        [Parameter(Mandatory = $true)][string]$Name
    )
    if ($SourceBytes.Length -ge 3 -and $SourceBytes[0] -eq 0xEF -and $SourceBytes[1] -eq 0xBB -and $SourceBytes[2] -eq 0xBF) {
        throw "sync-roles: refused $Name - role source starts with a UTF-8 byte-order mark (BOM)."
    }
    $strict = New-Object System.Text.UTF8Encoding($false, $true)
    try { $text = $strict.GetString($SourceBytes) }
    catch { throw "sync-roles: refused $Name - role source is not valid UTF-8." }
    if ($text -match "`r(?!`n)") {
        throw "sync-roles: refused $Name - role source contains a lone CR (carriage return without line feed)."
    }
    $text = $text.Replace("`r`n", "`n").Replace("`n", "`r`n")
    $text = $text.Replace('__CC_HOOK__', $HookPathForward)
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    return , ([byte[]]$utf8NoBom.GetBytes($text))
}

function Test-SyncRolesSameBytes {
    param([byte[]]$A, [byte[]]$B)
    if ($null -eq $A -or $null -eq $B -or $A.Length -ne $B.Length) { return $false }
    return ([Convert]::ToBase64String($A) -ceq [Convert]::ToBase64String($B))
}

function Write-SyncRolesVerifiedFile {
    # D4 + D5: write exact bytes, then re-read and refuse on any mismatch.
    param([Parameter(Mandatory = $true)][string]$Path, [Parameter(Mandatory = $true)][AllowEmptyCollection()][byte[]]$Bytes)
    [System.IO.File]::WriteAllBytes($Path, $Bytes)
    $back = [System.IO.File]::ReadAllBytes($Path)
    if (-not (Test-SyncRolesSameBytes -A $back -B $Bytes)) {
        throw "sync-roles: verification failed - $Path does not match the bytes written."
    }
}

function Invoke-SyncRoles {
    param([string]$ProjectDir)

    # ----- Phase A: validate and prepare everything; no destination is touched. -----
    $src = Join-Path $PSScriptRoot "..\agent-roles"
    if (-not (Test-Path -LiteralPath $src -PathType Container)) { throw "agent-roles/ not found next to scripts/. Run from the repo." }

    $hookSrc  = Join-Path $PSScriptRoot "hooks\fence-write.js"
    if (-not (Test-Path -LiteralPath $hookSrc -PathType Leaf)) {
        throw "sync-roles: refused - write-fence hook source not found at $hookSrc. No destination was changed."
    }
    try { $hookBytes = [System.IO.File]::ReadAllBytes($hookSrc) }
    catch { throw "sync-roles: refused - write-fence hook source could not be read ($hookSrc). No destination was changed." }

    $hookDir  = Join-Path $env:USERPROFILE ".claude\hooks"
    $hookDest = Join-Path $hookDir "fence-write.js"
    $hookPathFwd = ($hookDest -replace '\\', '/')

    $files = @(Get-ChildItem -LiteralPath $src -Filter *.md -File | Where-Object { $_.Name -ne 'README.md' })
    if ($files.Count -eq 0) { throw "No role .md files found in $src." }
    # D7: deterministic, culture-independent order.
    $names = [string[]]@($files | ForEach-Object { $_.Name })
    [Array]::Sort($names, [StringComparer]::Ordinal)

    $prepared = @()
    foreach ($name in $names) {
        try { $raw = [System.IO.File]::ReadAllBytes((Join-Path $src $name)) }
        catch { throw "sync-roles: refused $name - role source could not be read. No destination was changed." }
        try { $bytes = ConvertTo-DeployedRoleBytes -SourceBytes $raw -HookPathForward $hookPathFwd -Name $name }
        catch { throw ($_.Exception.Message + ' No destination was changed.') }
        $prepared += , (New-Object psobject -Property @{ Name = $name; BaseName = [IO.Path]::GetFileNameWithoutExtension($name); Bytes = $bytes })
    }

    # ----- Phase B: write the pre-read hook and prepared roles, verifying every file. -----
    New-Item -ItemType Directory -Force -Path $hookDir | Out-Null
    Write-SyncRolesVerifiedFile -Path $hookDest -Bytes $hookBytes
    Write-Host "Deployed write-fence hook -> $hookDest" -ForegroundColor Green

    $deployTo = {
        param([string]$dir)
        New-Item -ItemType Directory -Force -Path $dir | Out-Null
        foreach ($r in $prepared) { Write-SyncRolesVerifiedFile -Path (Join-Path $dir $r.Name) -Bytes $r.Bytes }
        Write-Host "Synced $($prepared.Count) roles -> $dir" -ForegroundColor Green
    }

    # User scope: available to every project the command center drives.
    & $deployTo (Join-Path $env:USERPROFILE ".claude\agents")

    # Optional project scope.
    if ($ProjectDir) { & $deployTo (Join-Path $ProjectDir ".claude\agents") }

    Write-Host ""
    Write-Host "Roles deployed: $(($prepared | ForEach-Object { $_.BaseName }) -join ', ')" -ForegroundColor Cyan
    Write-Host "Launch one with:  claude --agent <role>   (e.g. claude --agent builder)"
}

# Dot-sourcing (tests) only defines the functions above; any other invocation deploys.
if ($MyInvocation.InvocationName -ne '.') {
    Invoke-SyncRoles -ProjectDir $ProjectDir
}
