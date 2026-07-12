'use strict';
// Build (command, argv) for the external one-click launchers (open-vscode / open-terminal) so the
// git-derived directory path is ALWAYS a discrete argv element -- never concatenated into, nor
// quoted for, a shell string. Paired with shell:false in main.js's launch(), this guarantees no
// shell parses the path, so a directory name containing $(...), backticks, &, or | reaches the child
// as a literal argument rather than being interpreted (AUDIT-REPORT.md #7, re-rated from LOW: the
// threat model is that an attacker CAN control wt.path via a hostile repo/PR/pre-existing worktree;
// under the CLAUDE.md-sanctioned WSL2 fallback, sh -c would execute $()/backticks that are legal in
// directory names). Dependency-free so the arg-shaping is unit-tested with plain node.

const IS_WIN = process.platform === 'win32';

// Windows Terminal: `wt` / `wt.exe` (an App Execution Alias) IS directly spawnable with shell:false
// (verified), so the path is a pure literal argv element -- no shell, no cmd.exe in the loop.
function openTerminalSpec(dir) {
  return { cmd: 'wt', args: ['-w', '0', 'nt', '-d', dir] };
}

// VS Code's CLI is `code.cmd` on Windows, and Node (since CVE-2024-27980) will NOT spawn a .cmd with
// shell:false -- `spawn('code', …, { shell:false })` returns ENOENT (verified), and Code.exe's stub
// won't launch it directly either. So on Windows we invoke it through cmd.exe EXPLICITLY, passing
// `code` and the path as DISCRETE argv elements. shell:false keeps us off the platform default shell,
// and naming cmd.exe means even under a WSL/sh parent the path is never handed to sh -- so $()/
// backticks can never execute. (Residual, documented: cmd.exe still expands %VAR% in the argument;
// that is a path-confusion at worst -- it opens a different existing folder -- never code execution.)
// Off Windows, `code` is a normal executable/script and spawns directly with the path as literal argv.
function openVscodeSpec(dir) {
  if (IS_WIN) {
    // cmd.exe /c EXPANDS %VAR% in its argument (e.g. "%PATH%" becomes the PATH value), so a path
    // component containing '%' would be rewritten before `code` ever sees it -- a path-confusion (it
    // could open a different existing folder), not code execution, but still wrong. A validated task
    // segment can never contain '%' (task-name.js charset is [a-z0-9_-]), so this only ever fires on
    // an unusual UPSTREAM path component (the repo root / projects root). Refuse VISIBLY rather than
    // launch a cmd-mangled path -- the same refuse-don't-downgrade posture used everywhere else.
    if (typeof dir === 'string' && dir.indexOf('%') !== -1) {
      return { error: `Cannot open VS Code: the folder path contains '%' (${dir}), which cmd.exe would expand as an environment variable. Rename the folder to remove '%'.` };
    }
    return { cmd: process.env.ComSpec || 'cmd.exe', args: ['/d', '/s', '/c', 'code', dir] };
  }
  return { cmd: 'code', args: [dir] };
}

module.exports = { IS_WIN, openTerminalSpec, openVscodeSpec };
