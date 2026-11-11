'use strict';
// S35 mako-token: the Windows programs mako-token starts (powershell.exe for DPAPI, icacls.exe for
// the folder ACL), resolved as ABSOLUTE paths under the system directory. A bare name is never handed
// to a spawn: on Windows a program of that name in the CURRENT directory wins over PATH, and the git
// credential helper runs in git's working directory, which is an agent's worktree. The repository
// fixed the same hole for PowerShell in app/pane-status/pane-status-lock.js; PowerShell reuses that
// resolver here. A missing program is a visible refusal.

const fs = require('fs');
const path = require('path');
const lock = require('../pane-status/pane-status-lock');
const { MakoTokenError } = require('./errors');

function resolvePowerShell(env, exists = fs.existsSync) {
  const r = lock.resolveWindowsPowerShellPath(env, exists);
  if (!r.ok) throw new MakoTokenError('system-exe-missing', 'Windows PowerShell was not found under the system directory');
  return r.path;
}

function resolveIcacls(env, exists = fs.existsSync) {
  const e = env || {};
  const root = (typeof e.SystemRoot === 'string' && e.SystemRoot) ? e.SystemRoot : ((typeof e.windir === 'string' && e.windir) ? e.windir : 'C:\\Windows');
  const candidate = path.isAbsolute(root) ? path.join(root, 'System32', 'icacls.exe') : null;
  let present = false;
  try { present = !!candidate && !!exists(candidate); } catch { present = false; }
  if (!present) throw new MakoTokenError('system-exe-missing', 'icacls.exe was not found under the system directory');
  return candidate;
}

module.exports = { resolvePowerShell, resolveIcacls };
