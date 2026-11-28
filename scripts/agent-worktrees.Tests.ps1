$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$listAgents = Join-Path $here 'list-agents.ps1'
$newAgent = Join-Path $here 'new-agent.ps1'
$removeAgent = Join-Path $here 'remove-agent.ps1'

Describe 'PowerShell agent worktree commands' {
    BeforeEach {
        $repoName = 'example-repo-' + [guid]::NewGuid().ToString('N')
        $fixture = @{
            Root = Join-Path $TestDrive $repoName
            Branch = $null
            WorktreeExit = 0
            Calls = New-Object 'System.Collections.Generic.List[string]'
        }
        $worktree = Join-Path $TestDrive "$repoName-sample-task"

        # Shadow the native command. Every expected call is recorded, and any other call throws.
        function git {
            $command = $args -join '|'
            $fixture.Calls.Add($command)
            switch -Wildcard ($command) {
                'rev-parse|--show-toplevel' { return $fixture.Root }
                'branch|--list|agent/sample-task' { return $fixture.Branch }
                'worktree|list' { return 'fixture worktree listing' }
                'worktree|add|*' { $global:LASTEXITCODE = $fixture.WorktreeExit }
                'worktree|remove|*' { $global:LASTEXITCODE = $fixture.WorktreeExit }
                default { throw "Unexpected git call: $command" }
            }
        }

        $previousExitCode = $global:LASTEXITCODE
    }

    AfterEach {
        $global:LASTEXITCODE = $previousExitCode
    }

    It 'lists the worktrees for the resolved repository' {
        & $listAgents 6>$null | Should Be 'fixture worktree listing'
        ($fixture.Calls -join ', ') | Should Be 'rev-parse|--show-toplevel, worktree|list'
    }

    It 'refuses to list worktrees outside a repository' {
        $fixture.Root = $null
        { & $listAgents } | Should Throw 'Not inside a git repository'
        ($fixture.Calls -join ', ') | Should Be 'rev-parse|--show-toplevel'
    }

    It 'creates an agent branch and worktree from the requested base' {
        & $newAgent -Task 'sample-task' -Base 'develop' 6>$null
        ($fixture.Calls -join ', ') | Should Be "rev-parse|--show-toplevel, branch|--list|agent/sample-task, worktree|add|-b|agent/sample-task|${worktree}|develop"
    }

    It 'attaches an existing agent branch to the new worktree' {
        $fixture.Branch = 'agent/sample-task'
        & $newAgent -Task 'sample-task' 6>$null
        ($fixture.Calls -join ', ') | Should Be "rev-parse|--show-toplevel, branch|--list|agent/sample-task, worktree|add|${worktree}|agent/sample-task"
    }

    It 'reuses an existing worktree without writing to Git' {
        [void](New-Item -ItemType Directory -Path $worktree -ErrorAction Stop)
        & $newAgent -Task 'sample-task' 6>$null
        ($fixture.Calls -join ', ') | Should Be 'rev-parse|--show-toplevel'
    }

    It 'removes the worktree without force by default and leaves its branch alone' {
        [void](New-Item -ItemType Directory -Path $worktree -ErrorAction Stop)
        & $removeAgent -Task 'sample-task' 6>$null
        ($fixture.Calls -join ', ') | Should Be "rev-parse|--show-toplevel, worktree|remove|${worktree}"
    }

    It 'refuses to call Git worktree remove when its target is missing' {
        { & $removeAgent -Task 'sample-task' } | Should Throw 'No worktree found'
        ($fixture.Calls -join ', ') | Should Be 'rev-parse|--show-toplevel'
    }

    It 'known failure: new-agent refuses when Git cannot add the worktree' -Pending {
        $fixture.WorktreeExit = 42
        { & $newAgent -Task 'sample-task' } | Should Throw
    }

    It 'known failure: remove-agent refuses when Git cannot remove the worktree' -Pending {
        [void](New-Item -ItemType Directory -Path $worktree -ErrorAction Stop)
        $fixture.WorktreeExit = 42
        { & $removeAgent -Task 'sample-task' } | Should Throw
    }
}
