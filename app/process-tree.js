'use strict';
// S06 PROCESS-TREE CLEANUP (pure; main.js injects child_process, the platform, env and the logger).
//
// The 1.0 limitation (docs/RELEASE-NOTES-1.0.md, "Leftover processes"): closing a pane or Mako could
// leave claude.exe or node.exe running. node-pty's Windows kill() lists the console's processes from
// a forked helper (asynchronously, up to 5 s) and only then kills them one by one. Two holes follow:
//   1. On quit, Electron exits before that list arrives, so only the shell is killed.
//   2. A descendant without that console (a detached node.exe, an MCP server) is never on the list.
// The fix is Windows' own taskkill, which walks the parent-PID tree from the pane's shell:
// `taskkill /T /F /PID <shell pid>`. It must run while the shell is still alive, because /T finds
// descendants through it, so callers run this BEFORE pty.kill().
//
// Hardening: taskkill is run by its absolute System32 path (never a PATH lookup, so a planted
// taskkill.exe in a worktree can't be picked up), with execFile (no shell), and every PID must be a
// positive safe integer. A process whose parent already exited is no longer in the tree; that gap is
// recorded in the S06 PR. Every outcome is logged; nothing is swallowed silently.
const path = require('path');

function isPid(value) { return Number.isSafeInteger(value) && value > 0; }

// %SystemRoot%\System32\taskkill.exe, or null when SystemRoot isn't an absolute Windows path.
function taskkillPath(env) {
  const root = env && (env.SystemRoot || env.SYSTEMROOT || env.windir);
  if (typeof root !== 'string' || !path.win32.isAbsolute(root) || root.startsWith('\\\\')) return null;
  return path.win32.join(root, 'System32', 'taskkill.exe');
}

// ['/T', '/F', '/PID', '123', '/PID', '456'], or null when no valid PID is given.
function taskkillArgs(pids) {
  const list = [...new Set((pids || []).filter(isPid))];
  if (list.length === 0) return null;
  const args = ['/T', '/F'];
  for (const pid of list) args.push('/PID', String(pid));
  return args;
}

function createProcessTreeKiller(deps) {
  const platform = deps && deps.platform;
  const env = (deps && deps.env) || {};
  const execFile = deps && deps.execFile;
  const execFileSync = deps && deps.execFileSync;
  const log = (deps && deps.log) || (() => {});
  if (typeof platform !== 'string') throw new Error('process-tree: platform must be a string.');
  if (typeof execFile !== 'function' || typeof execFileSync !== 'function') {
    throw new Error('process-tree: execFile and execFileSync must be functions.');
  }
  const windows = platform === 'win32';
  const exe = windows ? taskkillPath(env) : null;
  const opts = { windowsHide: true };

  // Returns { args } when taskkill should run, or { skip } with a constant reason.
  function plan(pids) {
    if (!windows) return { skip: 'not-windows' };
    if (!exe) return { skip: 'taskkill-path-unresolved' };
    const args = taskkillArgs(pids);
    if (!args) return { skip: 'no-valid-pid' };
    return { args };
  }
  function note(where, count, err) {
    // taskkill exits 128 when a PID is already gone; that is a clean outcome, not a failure.
    const code = err && typeof err.status === 'number' ? err.status : (err && err.code);
    if (!err) log(`[process-tree] ${where}: tree killed for ${count} pane(s)`);
    else if (code === 128) log(`[process-tree] ${where}: already exited (${count} pane(s))`);
    else log(`[process-tree] ${where}: taskkill FAILED (${String(code || 'error').slice(0, 40)}); falling back to pty.kill() only`);
  }

  // Pane close: kill the pane's tree, then call `done` (the caller's pty.kill()). Off Windows, or when
  // there is nothing to run, `done` is called at once, so behaviour there is unchanged.
  function killTree(pid, done) {
    const finish = typeof done === 'function' ? done : () => {};
    const p = plan([pid]);
    if (p.skip) {
      if (p.skip !== 'not-windows') log(`[process-tree] pane close: skipped (${p.skip}); pty.kill() only`);
      finish();
      return;
    }
    try {
      execFile(exe, p.args, Object.assign({ timeout: 5000 }, opts), (err) => { note('pane close', 1, err); finish(); });
    } catch (err) {
      note('pane close', 1, err);
      finish();
    }
  }

  // Quit: one synchronous taskkill for every pane, because the process is about to exit and an
  // asynchronous kill would never finish. Bounded by a timeout so a hung taskkill can't hold quit.
  function killTreesSync(pids, timeoutMs) {
    const p = plan(pids);
    if (p.skip) {
      if (p.skip !== 'not-windows' && p.skip !== 'no-valid-pid') log(`[process-tree] shutdown: skipped (${p.skip}); pty.kill() only`);
      return;
    }
    const count = (p.args.length - 2) / 2;
    try {
      execFileSync(exe, p.args, Object.assign({ timeout: timeoutMs || 5000, stdio: 'ignore' }, opts));
      note('shutdown', count, null);
    } catch (err) {
      note('shutdown', count, err);
    }
  }

  return { killTree, killTreesSync };
}

module.exports = { createProcessTreeKiller, taskkillArgs, taskkillPath };
