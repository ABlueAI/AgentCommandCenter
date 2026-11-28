$scriptPath = Join-Path $PSScriptRoot 'new-agent.ps1'
$powerShell = (Get-Process -Id $PID).Path

Describe 'new-agent worktree creation' {
    BeforeEach {
        $repo = Join-Path $TestDrive ([guid]::NewGuid().ToString('N'))
        git init --quiet --initial-branch=main $repo
        if ($LASTEXITCODE -ne 0) { throw 'Could not initialize the test repository.' }
        git -C $repo -c user.name=Fixture -c user.email=fixture@example.invalid -c commit.gpgSign=false `
            -c "core.hooksPath=$(Join-Path $repo 'no-hooks')" commit --quiet --allow-empty -m fixture
        if ($LASTEXITCODE -ne 0) { throw 'Could not commit to the test repository.' }
    }

    It 'propagates Git failure <Scenario> without printing a success banner' -TestCases @(
        @{ Scenario = 'when the base is missing'; Base = 'missing-base'; Existing = $false }
        @{ Scenario = 'when the existing branch is already checked out'; Base = 'main'; Existing = $true }
    ) {
        param($Scenario, $Base, $Existing)
        $ErrorActionPreference = 'Continue'
        if ($Existing) {
            git -C $repo worktree add --quiet -b agent/fixture "$repo-other" main
            if ($LASTEXITCODE -ne 0) { throw 'Could not check out the fixture branch in a second worktree.' }
            $null = git -C $repo worktree add "$repo-fixture" agent/fixture 2>&1
        } else {
            $null = git -C $repo worktree add -b agent/fixture "$repo-fixture" $Base 2>&1
        }
        $expectedExit = $LASTEXITCODE
        $expectedExit | Should Not Be 0

        Push-Location -LiteralPath $repo
        try {
            $output = & $powerShell -NoProfile -ExecutionPolicy Bypass -File $scriptPath -Task fixture -Base $Base 2>&1
            $actualExit = $LASTEXITCODE
        } finally { Pop-Location }

        ($output | Out-String) | Should Match 'fatal:'
        ($output | Out-String) | Should Not Match 'Agent worktree ready'
        $actualExit | Should Be $expectedExit
        Test-Path -LiteralPath "$repo-fixture" | Should Be $false
    }

    It 'reports a created worktree on success' {
        $ErrorActionPreference = 'Continue'
        Push-Location -LiteralPath $repo
        try {
            $output = & $powerShell -NoProfile -ExecutionPolicy Bypass -File $scriptPath -Task fixture 2>&1
            $actualExit = $LASTEXITCODE
        } finally { Pop-Location }

        $actualExit | Should Be 0
        ($output | Out-String) | Should Match 'Agent worktree ready'
        Test-Path -LiteralPath "$repo-fixture" -PathType Container | Should Be $true
    }
}
