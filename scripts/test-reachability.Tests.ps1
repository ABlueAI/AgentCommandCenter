<#
.SYNOPSIS
  Meta-test: every *.Tests.ps1 in the repo must sit where run-pester.ps1 can discover it.
.DESCRIPTION
  Run with: Invoke-Pester -Path scripts\test-reachability.Tests.ps1

  Orphaned test files are this repo's most-repeated failure class (five files across
  three incidents). run-pester.ps1 discovers '*.Tests.ps1' recursively under scripts/
  ONLY — a Pester suite created anywhere else silently never runs. This meta-suite
  walks the whole repo and fails NAMING any *.Tests.ps1 outside that root. It lives in
  scripts/ itself, so run-pester discovers it automatically (not the next orphan), and
  it watches the Node-side meta-test's wiring while app/test-reachability.test.js
  watches for this file's existence — mutual anti-orphan watchdogs.

  Excluded directory names (never descended, matched at any depth):
  node_modules, .git, .worktrees, vendor, dist, source-material.
#>
$here = Split-Path -Parent $MyInvocation.MyCommand.Path        # <repo>\scripts
$repoRoot = Split-Path -Parent $here
$excluded = @('node_modules', '.git', '.worktrees', 'vendor', 'dist', 'source-material')

# Manual walk that skips excluded names BEFORE descending (also avoids the
# app\node_modules junction) — Get-ChildItem -Recurse would follow it.
function Get-RepoTestFiles {
    param([string]$Dir, [string[]]$ExcludedNames)
    $hits = @()
    $entries = Get-ChildItem -LiteralPath $Dir -Force -ErrorAction Stop
    foreach ($e in $entries) {
        if ($e.PSIsContainer) {
            if ($ExcludedNames -notcontains $e.Name -and -not ($e.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
                $hits += Get-RepoTestFiles -Dir $e.FullName -ExcludedNames $ExcludedNames
            }
        }
        elseif ($e.Name -like '*.Tests.ps1' -or $e.Name -like '*.test.js') {
            $hits += $e.FullName
        }
    }
    return $hits
}

$all = @(Get-RepoTestFiles -Dir $repoRoot -ExcludedNames $excluded)
$pesterSuites = @($all | Where-Object { $_ -like '*.Tests.ps1' })

Describe 'test-runner reachability (Pester family)' {

    It 'discovery floor: the walker finds a plausible number of Pester suites (>= 14)' {
        ($pesterSuites.Count -ge 14) | Should Be $true
    }

    It 'every *.Tests.ps1 sits under scripts\ where run-pester.ps1 discovers it (names any strays)' {
        $strays = @($pesterSuites | Where-Object { -not $_.StartsWith($here + [IO.Path]::DirectorySeparatorChar) })
        # Joined names on purpose: a failure must NAME the unreachable files, not count them.
        ($strays -join ', ') | Should Be ''
    }

    It 'run-pester.ps1 still exists and still discovers recursively (the assumption this suite rests on)' {
        $runner = Join-Path $here 'run-pester.ps1'
        (Test-Path -LiteralPath $runner) | Should Be $true
        (Get-Content -LiteralPath $runner -Raw) -match "Recurse\s+-Filter\s+'\*\.Tests\.ps1'" | Should Be $true
    }

    It 'npm test invokes the runner directly and discovers the Node-side meta-test (mutual anti-orphan watchdog)' {
        $app = Join-Path $repoRoot 'app'
        $pkg = Get-Content -LiteralPath (Join-Path $app 'package.json') -Raw -Encoding UTF8 -ErrorAction Stop | ConvertFrom-Json
        $testScript = [string]$pkg.scripts.test
        $expected = 'node run-tests.js'
        # Exact, case-sensitive comparison rejects extra shell syntax that could suppress failures.
        $verdict = if ($testScript -ceq $expected) { $expected } else { "Unexpected npm test command: [$testScript]" }
        $verdict | Should Be $expected

        $runner = Join-Path $app 'run-tests.js'
        $check = "const suites = require(process.argv[1]).getTestFiles(); if (suites.filter(file => file === 'test-reachability.test.js').length !== 1) throw new Error('Expected the runner to discover test-reachability.test.js exactly once');"
        & node -e $check $runner
        $LASTEXITCODE | Should Be 0
    }

    It 'runs the Node-side meta-test directly, so a runner that hides failures cannot hide its own' {
        # npm test can't gate run-tests.js on its own: if the runner stopped passing exit codes,
        # the fixture that checks it would fail inside that same runner and be lost. Running the
        # suite here, outside npm test, makes the runner fixtures an independent CI gate.
        $metaSuite = Join-Path (Join-Path $repoRoot 'app') 'test-reachability.test.js'
        # cmd /c merges stderr natively (PS 5.1); %ERRORLEVEL% reaches $LASTEXITCODE.
        $metaOutput = cmd /c "node `"$metaSuite`" 2>&1"
        $metaExit = $LASTEXITCODE
        $verdict = if ($metaExit -eq 0) { 'exit 0' } else { "exit $metaExit`n" + ($metaOutput -join "`n") }
        $verdict | Should Be 'exit 0'
    }
}
