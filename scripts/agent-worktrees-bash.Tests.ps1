$here = Split-Path -Parent $MyInvocation.MyCommand.Path

Describe 'Bash agent worktree commands' {
    BeforeEach {
        # Git for Windows ships Bash. Use that interpreter ahead of the optional WSL launcher.
        $gitBash = if ($env:ProgramFiles) { Join-Path $env:ProgramFiles 'Git/bin/bash.exe' }
        $bash = if ($gitBash -and (Test-Path -LiteralPath $gitBash)) { $gitBash }
                else { (@(Get-Command bash -CommandType Application -ErrorAction Stop)[0]).Source }

        $launcher = Join-Path $TestDrive 'run-with-fake-git.sh'
        $log = Join-Path $TestDrive ([guid]::NewGuid().ToString('N') + '.log')
        $repo = (Join-Path $TestDrive 'example-repo').Replace('\', '/')
        $launcherSource = @'
exec 2>&1
log="$1"
repo="$2"
git_status="$3"
shift 3
git() {
  printf '%s\n' "$*" >> "$log"
  case "$*" in
    'rev-parse --show-toplevel') printf '%s\n' "$repo" ;;
    'worktree list') printf '%s\n' 'fixture worktree listing' ;;
    'worktree add '*|'worktree remove '*) return "$git_status" ;;
    *) printf 'Unexpected git call: %s\n' "$*" >&2; return 99 ;;
  esac
}
basename() { printf '%s\n' "${1##*/}"; }
dirname() { printf '%s\n' "${1%/*}"; }
source "$@"
'@
        [IO.File]::WriteAllText($launcher, ($launcherSource -replace "`r`n", "`n"))
        $previousExitCode = $global:LASTEXITCODE
    }

    AfterEach {
        $global:LASTEXITCODE = $previousExitCode
    }

    It 'lists worktrees for the repository reported by Git' {
        $target = Join-Path $here 'list-agents.sh'
        $output = & $bash --noprofile --norc $launcher.Replace('\', '/') $log.Replace('\', '/') $repo 0 $target.Replace('\', '/')
        $LASTEXITCODE | Should Be 0
        ($output -join "`n") | Should Match 'fixture worktree listing'
        ((Get-Content -LiteralPath $log -ErrorAction Stop) -join ', ') | Should Be 'rev-parse --show-toplevel, worktree list'
    }

    It 'creates a branch from the requested base' {
        $target = Join-Path $here 'new-agent.sh'
        $output = & $bash --noprofile --norc $launcher.Replace('\', '/') $log.Replace('\', '/') $repo 0 $target.Replace('\', '/') 'create-task' 'develop'
        $LASTEXITCODE | Should Be 0
        ($output -join "`n") | Should Match 'Agent worktree ready'
        ((Get-Content -LiteralPath $log -ErrorAction Stop) -join ', ') | Should Be "rev-parse --show-toplevel, worktree add -b agent/create-task ${repo}-create-task develop"
    }

    It 'propagates a Git error without announcing a new worktree' {
        $target = Join-Path $here 'new-agent.sh'
        $output = & $bash --noprofile --norc $launcher.Replace('\', '/') $log.Replace('\', '/') $repo 42 $target.Replace('\', '/') 'create-task' 'develop'
        $LASTEXITCODE | Should Be 42
        ($output -join "`n") | Should Not Match 'Agent worktree ready'
        ((Get-Content -LiteralPath $log -ErrorAction Stop) -join ', ') | Should Be "rev-parse --show-toplevel, worktree add -b agent/create-task ${repo}-create-task develop"
    }

    It 'requests removal without force and preserves the branch' {
        [void](New-Item -ItemType Directory -Path "${repo}-remove-task" -ErrorAction Stop)
        $target = Join-Path $here 'remove-agent.sh'
        $output = & $bash --noprofile --norc $launcher.Replace('\', '/') $log.Replace('\', '/') $repo 0 $target.Replace('\', '/') 'remove-task'
        $LASTEXITCODE | Should Be 0
        ($output -join "`n") | Should Match 'Branch agent/remove-task still exists'
        ((Get-Content -LiteralPath $log -ErrorAction Stop) -join ', ') | Should Be "rev-parse --show-toplevel, worktree remove ${repo}-remove-task"
    }
}
