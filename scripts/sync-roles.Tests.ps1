<#
.SYNOPSIS
  Pester (3.4) tests for scripts/sync-roles.ps1: deterministic, fail-closed role deployment.
.DESCRIPTION
  Run with: powershell -NoProfile -ExecutionPolicy Bypass -File scripts\run-pester.ps1
  Every deployment runs a COPY of the script under test in a real Windows PowerShell 5.1 child
  process (powershell.exe -NoProfile -File) inside a DISPOSABLE fixture repository under a guarded
  %TEMP% root (leaf prefix 'bh-sync-roles-test-'), with USERPROFILE redirected to that fixture's
  profile for the child only. The real profile is never a deployment target: its installed hook and
  roles are fingerprinted before and after the suite and must be byte-identical. The pure
  preparation function is tested by dot-sourcing the script (its InvocationName guard keeps it from
  deploying). This file is ASCII-only; non-ASCII test text is built from code points.
#>
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$script:SrScriptPath = Join-Path $here 'sync-roles.ps1'
$script:SrRepoRoot = Split-Path -Parent $here

# Dot-source the script under test (defines ConvertTo-DeployedRoleBytes etc.; deploys nothing), then
# undo its $ErrorActionPreference = 'Stop' so the harness keeps Pester-normal semantics.
. $script:SrScriptPath
$ErrorActionPreference = 'Continue'

$script:SrTempParent = [System.IO.Path]::GetTempPath().TrimEnd('\')
$script:SrRealProfile = $env:USERPROFILE
$script:SrFixtureRoots = New-Object System.Collections.ArrayList
$script:SrUtf8 = New-Object System.Text.UTF8Encoding($false)
$script:SrStrict = New-Object System.Text.UTF8Encoding($false, $true)
# The installed hook path the qualified identities were produced with (an INPUT to the pure function,
# so these pins hold on any machine).
$script:SrQualifiedHookPath = 'C:/Users/levij/.claude/hooks/fence-write.js'

# --------------------------------------------------------------------------------------------
# Helpers
# --------------------------------------------------------------------------------------------

function Get-SrSha256 {
    param([byte[]]$Bytes)
    $s = [System.Security.Cryptography.SHA256]::Create()
    try { return (-join ($s.ComputeHash($Bytes) | ForEach-Object { $_.ToString('X2') })) } finally { $s.Dispose() }
}

function Get-SrFileSha256 { param([string]$Path) return (Get-SrSha256 ([System.IO.File]::ReadAllBytes($Path))) }

function ConvertTo-SrBytes { param([string]$Text) return , ([byte[]]$script:SrUtf8.GetBytes($Text)) }

function Join-SrBytes { param([object[]]$Parts) $all = @(); foreach ($p in $Parts) { $all += [byte[]]$p }; return , ([byte[]]$all) }

function Test-SrSameBytes {
    param([byte[]]$A, [byte[]]$B)
    if ($null -eq $A -or $null -eq $B -or $A.Length -ne $B.Length) { return $false }
    return ([Convert]::ToBase64String($A) -ceq [Convert]::ToBase64String($B))
}

function ConvertTo-SrLf { param([string]$Text) return $Text.Replace("`r`n", "`n") }
function ConvertTo-SrCrlf { param([string]$Text) return (ConvertTo-SrLf $Text).Replace("`n", "`r`n") }

function Get-SrRealProfileFingerprint {
    # Every file (name, length, SHA-256, mtime) in the real profile's .claude\hooks and .claude\agents.
    $rows = @()
    foreach ($d in 'hooks', 'agents') {
        $dir = Join-Path (Join-Path $script:SrRealProfile '.claude') $d
        if (-not (Test-Path -LiteralPath $dir)) { $rows += "$d <absent>"; continue }
        foreach ($f in @(Get-ChildItem -LiteralPath $dir -Force -File | Sort-Object Name)) {
            $rows += ('{0}\{1} {2} {3} {4}' -f $d, $f.Name, $f.Length, (Get-SrFileSha256 $f.FullName), $f.LastWriteTimeUtc.Ticks)
        }
    }
    return ($rows -join "`n")
}
$script:SrRealBefore = Get-SrRealProfileFingerprint

function Get-SrTreeSnapshot {
    # Directories and files (length, SHA-256, mtime) under a root; '<absent>' when it does not exist.
    param([string]$Dir)
    if (-not (Test-Path -LiteralPath $Dir)) { return '<absent>' }
    $rows = @()
    foreach ($i in @(Get-ChildItem -LiteralPath $Dir -Recurse -Force | Sort-Object FullName)) {
        $rel = $i.FullName.Substring($Dir.Length)
        if ($i.PSIsContainer) { $rows += "D $rel" }
        else { $rows += ('F {0} {1} {2} {3}' -f $rel, $i.Length, (Get-SrFileSha256 $i.FullName), $i.LastWriteTimeUtc.Ticks) }
    }
    return ($rows -join "`n")
}

function New-SrFixture {
    param([hashtable]$Roles = @{}, [byte[]]$HookBytes = $null, [switch]$NoHook, [switch]$NoRolesDir)
    $root = Join-Path $script:SrTempParent ('bh-sync-roles-test-' + [guid]::NewGuid().ToString('N'))
    [void](New-Item -ItemType Directory -Path $root)
    [void]$script:SrFixtureRoots.Add($root)
    $scripts = Join-Path $root 'repo\scripts'
    $hooks = Join-Path $scripts 'hooks'
    $rolesDir = Join-Path $root 'repo\agent-roles'
    [void](New-Item -ItemType Directory -Path $hooks -Force)
    Copy-Item -LiteralPath $script:SrScriptPath -Destination (Join-Path $scripts 'sync-roles.ps1')
    $hookSrc = Join-Path $hooks 'fence-write.js'
    if (-not $NoHook) {
        if ($null -eq $HookBytes) { $HookBytes = ConvertTo-SrBytes "// fixture hook`r`nprocess.exit(0);`r`n" }
        [System.IO.File]::WriteAllBytes($hookSrc, $HookBytes)
    }
    if (-not $NoRolesDir) {
        [void](New-Item -ItemType Directory -Path $rolesDir)
        foreach ($k in $Roles.Keys) { [System.IO.File]::WriteAllBytes((Join-Path $rolesDir $k), [byte[]]$Roles[$k]) }
    }
    $profileDir = Join-Path $root 'home'
    $project = Join-Path $root 'project'
    [void](New-Item -ItemType Directory -Path $profileDir)
    [void](New-Item -ItemType Directory -Path $project)
    $hookDest = Join-Path $profileDir '.claude\hooks\fence-write.js'
    return New-Object psobject -Property @{
        Root = $root; Script = (Join-Path $scripts 'sync-roles.ps1'); HookSource = $hookSrc; RolesDir = $rolesDir
        Profile = $profileDir; Project = $project; HookDest = $hookDest
        UserAgents = (Join-Path $profileDir '.claude\agents'); ProjectAgents = (Join-Path $project '.claude\agents')
        HookPathForward = ($hookDest -replace '\\', '/')
    }
}

function Invoke-SrDeploy {
    # Runs the fixture's copy of sync-roles.ps1 in a real Windows PowerShell 5.1 child process with
    # USERPROFILE redirected (child only) to the guarded fixture profile.
    param($Fixture, [switch]$WithProject)
    $ErrorActionPreference = 'Continue'
    $profileFull = [System.IO.Path]::GetFullPath($Fixture.Profile).TrimEnd('\')
    $realFull = [System.IO.Path]::GetFullPath($script:SrRealProfile).TrimEnd('\')
    if (-not $profileFull.StartsWith($script:SrTempParent + '\', [System.StringComparison]::OrdinalIgnoreCase)) { throw 'guard: fixture profile is not under %TEMP%' }
    if ([string]::Equals($profileFull, $realFull, [System.StringComparison]::OrdinalIgnoreCase)) { throw 'guard: fixture profile equals the real profile' }
    if ((Split-Path -Leaf $Fixture.Root) -notlike 'bh-sync-roles-test-*') { throw 'guard: unexpected fixture root' }
    $argv = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $Fixture.Script)
    if ($WithProject) { $argv += @('-ProjectDir', $Fixture.Project) }
    $saved = $env:USERPROFILE
    try {
        $env:USERPROFILE = $profileFull
        $raw = & powershell.exe @argv 2>&1
        $code = $LASTEXITCODE
    } finally {
        $env:USERPROFILE = $saved
    }
    $lines = @()
    foreach ($i in @($raw)) { if ($null -ne $i) { $lines += [string]$i } }
    return New-Object psobject -Property @{ ExitCode = $code; Lines = $lines; Text = ($lines -join "`n") }
}

function Add-SrSeededDestinations {
    # Pre-existing destination files, so a refusal can be proven to leave them byte-identical.
    param($Fixture)
    foreach ($d in (Split-Path -Parent $Fixture.HookDest), $Fixture.UserAgents, $Fixture.ProjectAgents) { [void](New-Item -ItemType Directory -Force -Path $d) }
    [System.IO.File]::WriteAllBytes($Fixture.HookDest, (ConvertTo-SrBytes 'OLD HOOK'))
    foreach ($n in 'a-bad.md', 'good.md', 'z-bad.md') {
        [System.IO.File]::WriteAllBytes((Join-Path $Fixture.UserAgents $n), (ConvertTo-SrBytes "OLD USER $n"))
        [System.IO.File]::WriteAllBytes((Join-Path $Fixture.ProjectAgents $n), (ConvertTo-SrBytes "OLD PROJECT $n"))
    }
}

function Get-SrDestinationSnapshot {
    # Exactly the destination trees. (The profile ROOT is not a destination: the Windows PowerShell
    # 5.1 child itself creates <profile>\AppData\Roaming at startup, even when the script refuses.)
    param($Fixture)
    return ((Get-SrTreeSnapshot (Join-Path $Fixture.Profile '.claude')) + "`n----`n" + (Get-SrTreeSnapshot (Join-Path $Fixture.Project '.claude')))
}

function Get-SrExpectedDeployedBytes {
    # Independent oracle: strict UTF-8 text -> CRLF -> placeholder -> UTF-8 without BOM.
    param([string]$Text, [string]$HookPathForward)
    return (ConvertTo-SrBytes ((ConvertTo-SrCrlf $Text).Replace('__CC_HOOK__', $HookPathForward)))
}

# Shared fixture text (non-ASCII built from code points).
$script:SrEmDash = [string][char]0x2014
$script:SrNonAscii = 'Em dash ' + $script:SrEmDash + ' cafe' + [char]0x00E9 + ' na' + [char]0x00EF + 've ' +
    [char]0x65E5 + [char]0x672C + [char]0x8A9E + ' emoji ' + [char]::ConvertFromUtf32(0x1F600)
$script:SrFencedText = "---`nname: fenced`ndescription: fixture fenced role $($script:SrEmDash) with hook`nhooks:`n  PreToolUse:`n    - matcher: `"Read|Write`"`n      hooks:`n        - type: command`n          command: node `"__CC_HOOK__`"`n---`nBody: $($script:SrNonAscii)`nSecond hook mention: __CC_HOOK__`n"
$script:SrPlainText = "---`nname: plain`ndescription: fixture plain role`n---`nPlain body line.`n"
$script:SrGoodBytes = ConvertTo-SrBytes $script:SrPlainText
$script:SrMarker = 'SECRET-CONTENT-MARKER-7F3A'
$script:SrMalformedBytes = Join-SrBytes @((ConvertTo-SrBytes "---`nname: bad`n---`n$($script:SrMarker) "), [byte[]](0xC3, 0x28), (ConvertTo-SrBytes "`n"))
$script:SrBomBytes = Join-SrBytes @([byte[]](0xEF, 0xBB, 0xBF), (ConvertTo-SrBytes "---`nname: bom`n---`n$($script:SrMarker)`n"))
$script:SrLoneCrBytes = ConvertTo-SrBytes "---`nname: cr`n---`n$($script:SrMarker)`rsecond`n"

# --------------------------------------------------------------------------------------------

Describe 'sync-roles.ps1 pure preparation (dot-sourced ConvertTo-DeployedRoleBytes)' {

    $expected = [ordered]@{
        'builder'        = @(1495, 'F1961DE06C43F3A47FE04E82551B31DB479D7C9F9907436CFD9DE14BD75D2BC7')
        'reviewer'       = @(1221, '0BAF2B5391D9AD9E828A76CE92375118210A8ECE803EE9B8C7CC369938212580')
        'codebase-scout' = @(755,  '2A15AD0BD8C8BAD38767FA51E27BB3C44FDE76645C4FF1B35CC480427913FD12')
        'web-scout'      = @(1773, 'AFDA5D08FE81489D702F06B80C328A09F0F9E94F6E1C5F367E117B9187B34AB4')
        'operator'       = @(1476, 'C0E1B415857A40B39CEC6A19758CF3776AC2640CCA9DFA34F1374DD72D7FEC53')
        'source-scout'   = @(1627, '549B8624B6A70E9F37F71F1B8624DB5AB06F891C1E1CB54B86F3DA4C91064EC1')
    }
    foreach ($role in $expected.Keys) {
        It "real role $role produces its pinned identity from working-tree, LF and CRLF sources" {
            $raw = [System.IO.File]::ReadAllBytes((Join-Path $script:SrRepoRoot "agent-roles\$role.md"))
            $text = $script:SrStrict.GetString($raw)
            $variants = @(
                , $raw
                , (ConvertTo-SrBytes (ConvertTo-SrLf $text))
                , (ConvertTo-SrBytes (ConvertTo-SrCrlf $text))
            )
            foreach ($v in $variants) {
                $out = ConvertTo-DeployedRoleBytes -SourceBytes $v -HookPathForward $script:SrQualifiedHookPath -Name "$role.md"
                $out.Length | Should Be $expected[$role][0]
                (Get-SrSha256 $out) | Should BeExactly $expected[$role][1]
            }
        }
    }

    It 'refuses a UTF-8 BOM, naming the file and not echoing content' {
        $msg = $null
        try { [void](ConvertTo-DeployedRoleBytes -SourceBytes $script:SrBomBytes -HookPathForward 'C:/h.js' -Name 'm-bom.md') } catch { $msg = $_.Exception.Message }
        $msg | Should Match 'm-bom\.md'
        $msg | Should Match 'byte-order mark'
        $msg | Should Not Match $script:SrMarker
    }

    It 'refuses malformed UTF-8, naming the file and not echoing content' {
        $msg = $null
        try { [void](ConvertTo-DeployedRoleBytes -SourceBytes $script:SrMalformedBytes -HookPathForward 'C:/h.js' -Name 'a-bad.md') } catch { $msg = $_.Exception.Message }
        $msg | Should Match 'a-bad\.md'
        $msg | Should Match 'not valid UTF-8'
        $msg | Should Not Match $script:SrMarker
    }

    It 'refuses a lone CR, naming the file and not echoing content' {
        $msg = $null
        try { [void](ConvertTo-DeployedRoleBytes -SourceBytes $script:SrLoneCrBytes -HookPathForward 'C:/h.js' -Name 'm-cr.md') } catch { $msg = $_.Exception.Message }
        $msg | Should Match 'm-cr\.md'
        $msg | Should Match 'lone CR'
        $msg | Should Not Match $script:SrMarker
    }

    It 'replaces every placeholder exactly and matches the independent oracle' {
        $out = ConvertTo-DeployedRoleBytes -SourceBytes (ConvertTo-SrBytes $script:SrFencedText) -HookPathForward 'C:/x y/.claude/hooks/fence-write.js' -Name 'f.md'
        (Test-SrSameBytes $out (Get-SrExpectedDeployedBytes $script:SrFencedText 'C:/x y/.claude/hooks/fence-write.js')) | Should Be $true
        $t = $script:SrStrict.GetString($out)
        ([regex]::Matches($t, [regex]::Escape('C:/x y/.claude/hooks/fence-write.js'))).Count | Should Be 2
        $t.Contains('__CC_HOOK__') | Should Be $false
    }
}

Describe 'sync-roles.ps1 deployment in Windows PowerShell 5.1 child processes' {

    It 'deploys LF and CRLF sources byte-identically, as CRLF UTF-8 without BOM, with non-ASCII intact' {
        $fx = New-SrFixture -Roles @{ 'fenced.md' = (ConvertTo-SrBytes $script:SrFencedText); 'plain.md' = $script:SrGoodBytes }
        $r1 = Invoke-SrDeploy $fx
        $r1.ExitCode | Should Be 0
        $lfOut = @{}
        foreach ($n in 'fenced.md', 'plain.md') { $lfOut[$n] = [System.IO.File]::ReadAllBytes((Join-Path $fx.UserAgents $n)) }
        # Rewrite the same sources as CRLF and deploy again into the same profile.
        [System.IO.File]::WriteAllBytes((Join-Path $fx.RolesDir 'fenced.md'), (ConvertTo-SrBytes (ConvertTo-SrCrlf $script:SrFencedText)))
        [System.IO.File]::WriteAllBytes((Join-Path $fx.RolesDir 'plain.md'), (ConvertTo-SrBytes (ConvertTo-SrCrlf $script:SrPlainText)))
        $r2 = Invoke-SrDeploy $fx
        $r2.ExitCode | Should Be 0
        foreach ($n in 'fenced.md', 'plain.md') {
            $crlfOut = [System.IO.File]::ReadAllBytes((Join-Path $fx.UserAgents $n))
            (Test-SrSameBytes $lfOut[$n] $crlfOut) | Should Be $true
        }
        $f = [System.IO.File]::ReadAllBytes((Join-Path $fx.UserAgents 'fenced.md'))
        (Test-SrSameBytes $f (Get-SrExpectedDeployedBytes $script:SrFencedText $fx.HookPathForward)) | Should Be $true
        ($f[0] -eq 0xEF -and $f[1] -eq 0xBB -and $f[2] -eq 0xBF) | Should Be $false
        $t = $script:SrStrict.GetString($f)
        $t.Contains($script:SrNonAscii) | Should Be $true
        ([regex]::Matches($t, "(?<!`r)`n")).Count | Should Be 0
        ([regex]::Matches($t, "`r(?!`n)")).Count | Should Be 0
        $t.EndsWith("`r`n") | Should Be $true
    }

    It 'preserves the absence of a trailing newline' {
        $fx = New-SrFixture -Roles @{ 'nonl.md' = (ConvertTo-SrBytes "---`nname: nonl`n---`nlast line") }
        (Invoke-SrDeploy $fx).ExitCode | Should Be 0
        $t = $script:SrStrict.GetString([System.IO.File]::ReadAllBytes((Join-Path $fx.UserAgents 'nonl.md')))
        $t | Should BeExactly "---`r`nname: nonl`r`n---`r`nlast line"
    }

    It 'replaces every placeholder with the forward-slash installed hook path; plain roles change only line endings' {
        $fx = New-SrFixture -Roles @{ 'fenced.md' = (ConvertTo-SrBytes $script:SrFencedText); 'plain.md' = $script:SrGoodBytes }
        (Invoke-SrDeploy $fx).ExitCode | Should Be 0
        $t = $script:SrStrict.GetString([System.IO.File]::ReadAllBytes((Join-Path $fx.UserAgents 'fenced.md')))
        ([regex]::Matches($t, [regex]::Escape($fx.HookPathForward))).Count | Should Be 2
        $t.Contains('__CC_HOOK__') | Should Be $false
        $fx.HookPathForward.Contains('\') | Should Be $false
        $p = [System.IO.File]::ReadAllBytes((Join-Path $fx.UserAgents 'plain.md'))
        (Test-SrSameBytes $p (ConvertTo-SrBytes (ConvertTo-SrCrlf $script:SrPlainText))) | Should Be $true
    }

    It '-ProjectDir deploys byte-identical user and project copies and never deploys README.md' {
        $fx = New-SrFixture -Roles @{ 'fenced.md' = (ConvertTo-SrBytes $script:SrFencedText); 'plain.md' = $script:SrGoodBytes; 'README.md' = (ConvertTo-SrBytes "# readme __CC_HOOK__`n") }
        $r = Invoke-SrDeploy $fx -WithProject
        $r.ExitCode | Should Be 0
        foreach ($n in 'fenced.md', 'plain.md') {
            (Test-SrSameBytes ([System.IO.File]::ReadAllBytes((Join-Path $fx.UserAgents $n))) ([System.IO.File]::ReadAllBytes((Join-Path $fx.ProjectAgents $n)))) | Should Be $true
        }
        (Test-Path -LiteralPath (Join-Path $fx.UserAgents 'README.md')) | Should Be $false
        (Test-Path -LiteralPath (Join-Path $fx.ProjectAgents 'README.md')) | Should Be $false
        $r.Text | Should Match 'Synced 2 roles'
    }

    It 'copies LF and CRLF hooks byte-for-byte (never normalized) and keeps the console report' {
        foreach ($hb in @((ConvertTo-SrBytes "// lf hook`nprocess.exit(0);`n"), (ConvertTo-SrBytes "// crlf hook`r`nprocess.exit(0);`r`n"))) {
            $fx = New-SrFixture -Roles @{ 'plain.md' = $script:SrGoodBytes } -HookBytes $hb
            $r = Invoke-SrDeploy $fx
            $r.ExitCode | Should Be 0
            (Test-SrSameBytes ([System.IO.File]::ReadAllBytes($fx.HookDest)) $hb) | Should Be $true
            $r.Text | Should Match ([regex]::Escape('Deployed write-fence hook -> ' + $fx.HookDest))
            $r.Text | Should Match ([regex]::Escape('Synced 1 roles -> ' + $fx.UserAgents))
            $r.Text | Should Match 'Roles deployed: plain'
        }
    }

    It 'overwrites existing destinations with the prepared bytes' {
        $fx = New-SrFixture -Roles @{ 'good.md' = $script:SrGoodBytes }
        Add-SrSeededDestinations $fx
        (Invoke-SrDeploy $fx -WithProject).ExitCode | Should Be 0
        (Test-SrSameBytes ([System.IO.File]::ReadAllBytes((Join-Path $fx.UserAgents 'good.md'))) (ConvertTo-SrBytes (ConvertTo-SrCrlf $script:SrPlainText))) | Should Be $true
        (Test-SrSameBytes ([System.IO.File]::ReadAllBytes((Join-Path $fx.ProjectAgents 'good.md'))) (ConvertTo-SrBytes (ConvertTo-SrCrlf $script:SrPlainText))) | Should Be $true
        (Get-SrFileSha256 $fx.HookDest) | Should BeExactly (Get-SrFileSha256 $fx.HookSource)
    }

    It 'orders roles ordinally by filename (report order and first refusal)' {
        $fx = New-SrFixture -Roles @{ 'c.md' = $script:SrGoodBytes; 'a.md' = $script:SrGoodBytes; 'B.md' = $script:SrGoodBytes }
        $r = Invoke-SrDeploy $fx
        $r.ExitCode | Should Be 0
        $r.Text | Should Match 'Roles deployed: B, a, c'
        $fx2 = New-SrFixture -Roles @{ 'a-bad.md' = $script:SrMalformedBytes; 'B-bad.md' = $script:SrMalformedBytes }
        $r2 = Invoke-SrDeploy $fx2
        $r2.ExitCode | Should Not Be 0
        $r2.Text | Should Match 'refused B-bad\.md'
        $r2.Text | Should Not Match 'refused a-bad\.md'
    }

    $refusals = @(
        @{ Case = 'malformed UTF-8 in the first-sorted role'; Roles = @{ 'a-bad.md' = $script:SrMalformedBytes; 'good.md' = $script:SrGoodBytes }; Name = 'a-bad.md'; Reason = 'not valid UTF-8' },
        @{ Case = 'malformed UTF-8 in the last-sorted role'; Roles = @{ 'good.md' = $script:SrGoodBytes; 'z-bad.md' = $script:SrMalformedBytes }; Name = 'z-bad.md'; Reason = 'not valid UTF-8' },
        @{ Case = 'a UTF-8 BOM'; Roles = @{ 'good.md' = $script:SrGoodBytes; 'm-bom.md' = $script:SrBomBytes }; Name = 'm-bom.md'; Reason = 'byte-order mark' },
        @{ Case = 'a lone CR'; Roles = @{ 'good.md' = $script:SrGoodBytes; 'm-cr.md' = $script:SrLoneCrBytes }; Name = 'm-cr.md'; Reason = 'lone CR' }
    )
    foreach ($c in $refusals) {
        It "refuses $($c.Case) before any write: seeded user and project destinations unchanged, content not echoed" {
            $fx = New-SrFixture -Roles $c.Roles
            Add-SrSeededDestinations $fx
            $before = Get-SrDestinationSnapshot $fx
            $r = Invoke-SrDeploy $fx -WithProject
            $r.ExitCode | Should Not Be 0
            $r.Text | Should Match ('refused ' + [regex]::Escape($c.Name))
            $r.Text | Should Match $c.Reason
            $r.Text | Should Match 'No destination was changed'
            $r.Text | Should Not Match $script:SrMarker
            (Get-SrDestinationSnapshot $fx) | Should BeExactly $before
        }
        It "refuses $($c.Case) before any write: no destination directory or file is created" {
            $fx = New-SrFixture -Roles $c.Roles
            $r = Invoke-SrDeploy $fx -WithProject
            $r.ExitCode | Should Not Be 0
            (Test-Path -LiteralPath (Join-Path $fx.Profile '.claude')) | Should Be $false
            (Test-Path -LiteralPath (Join-Path $fx.Project '.claude')) | Should Be $false
        }
    }

    It 'refuses a missing hook source before any destination change (seeded and fresh)' {
        $fx = New-SrFixture -Roles @{ 'good.md' = $script:SrGoodBytes } -NoHook
        Add-SrSeededDestinations $fx
        $before = Get-SrDestinationSnapshot $fx
        $r = Invoke-SrDeploy $fx -WithProject
        $r.ExitCode | Should Not Be 0
        $r.Text | Should Match 'hook source not found'
        (Get-SrDestinationSnapshot $fx) | Should BeExactly $before
        $fx2 = New-SrFixture -Roles @{ 'good.md' = $script:SrGoodBytes } -NoHook
        (Invoke-SrDeploy $fx2 -WithProject).ExitCode | Should Not Be 0
        (Test-Path -LiteralPath (Join-Path $fx2.Profile '.claude')) | Should Be $false
        (Test-Path -LiteralPath (Join-Path $fx2.Project '.claude')) | Should Be $false
    }

    It 'refuses an unreadable (exclusively locked) hook source before any destination change (seeded and fresh)' {
        foreach ($seeded in $true, $false) {
            $fx = New-SrFixture -Roles @{ 'good.md' = $script:SrGoodBytes }
            if ($seeded) { Add-SrSeededDestinations $fx }
            $before = Get-SrDestinationSnapshot $fx
            $lock = [System.IO.File]::Open($fx.HookSource, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::None)
            try { $r = Invoke-SrDeploy $fx -WithProject } finally { $lock.Dispose() }
            $r.ExitCode | Should Not Be 0
            $r.Text | Should Match 'hook source could not be read'
            (Get-SrDestinationSnapshot $fx) | Should BeExactly $before
            if (-not $seeded) { (Test-Path -LiteralPath (Join-Path $fx.Profile '.claude')) | Should Be $false }
        }
    }

    It 'keeps the existing refusals: no agent-roles directory, and no role files' {
        $fx = New-SrFixture -NoRolesDir
        $r = Invoke-SrDeploy $fx -WithProject
        $r.ExitCode | Should Not Be 0
        $r.Text | Should Match 'agent-roles/ not found'
        (Test-Path -LiteralPath (Join-Path $fx.Profile '.claude')) | Should Be $false
        $fx2 = New-SrFixture -Roles @{ 'README.md' = (ConvertTo-SrBytes "# only a readme`n") }
        $r2 = Invoke-SrDeploy $fx2 -WithProject
        $r2.ExitCode | Should Not Be 0
        $r2.Text | Should Match 'No role \.md files found'
        (Test-Path -LiteralPath (Join-Path $fx2.Profile '.claude')) | Should Be $false
        (Test-Path -LiteralPath (Join-Path $fx2.Project '.claude')) | Should Be $false
    }
}

Describe 'sync-roles.ps1 test isolation' {
    It 'left the real profile''s installed hook and roles byte-identical and USERPROFILE restored' {
        $env:USERPROFILE | Should BeExactly $script:SrRealProfile
        (Get-SrRealProfileFingerprint) | Should BeExactly $script:SrRealBefore
    }
}

# Remove only this suite's own guarded fixture roots.
foreach ($r in @($script:SrFixtureRoots)) {
    if ((Split-Path -Leaf $r) -like 'bh-sync-roles-test-*' -and $r.StartsWith($script:SrTempParent + '\', [System.StringComparison]::OrdinalIgnoreCase)) {
        Remove-Item -LiteralPath $r -Recurse -Force -ErrorAction SilentlyContinue
    }
}
