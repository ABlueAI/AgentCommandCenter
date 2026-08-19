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
    $entries = Get-ChildItem -LiteralPath $Dir -Force -ErrorAction SilentlyContinue
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

    It 'the Node-side meta-test is wired into app/package.json as a bare node invocation (mutual anti-orphan watchdog)' {
        # EXACT-TOKEN matching, PORTED from app/test-reachability.test.js so the two sides
        # stay symmetric. The previous .Contains() substring test caught REMOVAL but not
        # NEUTERING: `node test-reachability.test.js || exit 0` keeps the filename present,
        # so Contains() still passed while the watchdog's own failures no longer failed the
        # chain — a disarmed guard indistinguishable from a working one. The Node side
        # already tokenizes the script on '&&' and compares each `node <path>` for equality,
        # noting there that a substring false-negative would be self-defeating; the same
        # reasoning applies here, to the assertion that guards the Node side itself.
        $pkg = Get-Content -LiteralPath (Join-Path $repoRoot 'app\package.json') -Raw -Encoding UTF8 | ConvertFrom-Json
        $testScript = [string]$pkg.scripts.test
        $segments = @($testScript -split '&&' | ForEach-Object { $_.Trim() })
        $wired = @(
            $segments |
                Where-Object { $_.StartsWith('node ') } |
                ForEach-Object { $_.Substring(5).Trim() }
        )
        # Case-sensitive equality, matching the Node side's Set membership test. Any
        # trailing modifier (||, ;, a redirect, a comment) lands inside the segment and
        # makes it unequal, which is the whole point.
        $exact = @($wired | Where-Object { $_ -ceq 'test-reachability.test.js' })

        # Joined names on purpose, as in the stray check above: a failure must NAME what
        # it found against what it expected, not merely report false.
        $expected = 'wired: exactly one bare "node test-reachability.test.js" chain segment'
        $mentions = @($segments | Where-Object { $_ -like '*test-reachability.test.js*' })
        $verdict = if ($exact.Count -eq 1) {
            $expected
        }
        else {
            "expected exactly one chain segment equal to 'node test-reachability.test.js'; " +
            "found $($exact.Count) exact match(es) among $($wired.Count) node invocation(s). " +
            "Segments mentioning the file: [" + ($mentions -join ' | ') + "]"
        }
        $verdict | Should Be $expected
    }
}
