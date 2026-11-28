'use strict';

const childProcess = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

function isLocalWindowsPath(file) {
  if (typeof file !== 'string' || !/^[a-z]:[\\/]/i.test(file)) return false;
  if (/[\x00-\x1f\x7f<>:"|?*]/.test(file.slice(2))) return false;
  return !file.slice(3).split(/[\\/]/).some((part) => /[. ]$/.test(part));
}

function windowsCandidates(env) {
  const root = (name) => {
    const key = Object.keys(env).find((key) => key.toUpperCase() === name.toUpperCase());
    const value = env[key];
    return isLocalWindowsPath(value) ? value : null;
  };
  const under = (base, ...parts) => base ? path.win32.join(base, ...parts) : null;
  const system = under(root('SystemRoot') || root('windir'), 'System32');
  const local = root('LOCALAPPDATA');
  const roaming = root('APPDATA');
  const home = root('USERPROFILE');
  const programRoots = [root('ProgramW6432'), root('ProgramFiles'), root('ProgramFiles(x86)')].filter(Boolean);
  const programs = (...parts) => programRoots.map((base) => under(base, ...parts));
  const winGet = (exe) => [local, root('ProgramData')].map((base) => under(base, 'Microsoft', 'WinGet', 'Links', exe));

  return {
    powershell: [under(system, 'WindowsPowerShell', 'v1.0', 'powershell.exe')],
    taskkill: [under(system, 'taskkill.exe')],
    reg: [under(system, 'reg.exe')],
    where: [under(system, 'where.exe')],
    git: [...programs('Git', 'cmd', 'git.exe'), under(local, 'Programs', 'Git', 'cmd', 'git.exe')],
    gh: [...programs('GitHub CLI', 'gh.exe'), ...winGet('gh.exe')],
    node: programs('nodejs', 'node.exe'),
    code: [under(local, 'Programs', 'Microsoft VS Code', 'Code.exe'), ...programs('Microsoft VS Code', 'Code.exe')],
    wt: [under(local, 'Microsoft', 'WindowsApps', 'wt.exe')],
    firefox: [...programs('Mozilla Firefox', 'firefox.exe'), under(local, 'Mozilla Firefox', 'firefox.exe')],
    claude: [under(home, '.local', 'bin', 'claude.exe'),
      under(roaming, 'npm', 'node_modules', '@anthropic-ai', 'claude-code', 'bin', 'claude.exe')],
    ffmpeg: [...programs('FFmpeg', 'bin', 'ffmpeg.exe'), ...winGet('ffmpeg.exe')],
    ffprobe: [...programs('FFmpeg', 'bin', 'ffprobe.exe'), ...winGet('ffprobe.exe')],
    'yt-dlp': [...programs('yt-dlp', 'yt-dlp.exe'), ...winGet('yt-dlp.exe')],
  };
}

function unixCandidates() {
  const names = ['git', 'gh', 'node', 'code', 'firefox', 'claude', 'ffmpeg', 'ffprobe', 'yt-dlp'];
  const directories = ['/usr/local/bin', '/opt/homebrew/bin', '/usr/bin', '/bin'];
  return Object.fromEntries(names.map((name) => [name, directories.map((dir) => path.posix.join(dir, name))]));
}

function checkExecutable(file, windows) {
  try {
    // Windows Terminal is an App Execution Alias. lstat can inspect its reparse point
    // even when there is no ordinary file behind it.
    const stat = windows && path.win32.basename(file).toLowerCase() === 'wt.exe'
      ? fs.lstatSync(file) : fs.statSync(file);
    if (!stat.isFile() && !(windows && stat.isSymbolicLink())) return false;
    if (!windows) fs.accessSync(file, fs.constants.X_OK);
    return true;
  } catch (error) {
    if (['ENOENT', 'ENOTDIR'].includes(error.code)) return false;
    throw error;
  }
}

function refusal(code) {
  return Object.assign(new Error(code), { code });
}

function createHelperPrograms({
  platform = process.platform, env = process.env, childProcess: child = childProcess,
  isExecutable = checkExecutable,
} = {}) {
  const windows = platform === 'win32';
  const candidates = windows ? windowsCandidates(env) : unixCandidates();
  const resolved = new Map();

  function resolve(name) {
    if (!Object.hasOwn(candidates, name)) return { ok: false, reason: 'helper-unknown' };
    if (!resolved.has(name)) {
      let result = { ok: false, reason: `${name}-not-found` };
      try {
        for (const file of new Set(candidates[name])) {
          if (file && isExecutable(file, windows)) {
            result = { ok: true, exe: file };
            break;
          }
        }
      } catch {
        result = { ok: false, reason: `${name}-executable-unreadable` };
      }
      resolved.set(name, Object.freeze(result));
    }
    return resolved.get(name);
  }

  function executablePath(name) {
    const result = resolve(name);
    if (!result.ok) throw refusal(result.reason);
    return result.exe;
  }

  function launch(method, file, args, options = {}, ...rest) {
    const valid = windows
      ? isLocalWindowsPath(file) && /\.exe$/i.test(file)
      : typeof file === 'string' && path.posix.isAbsolute(file) && !file.includes('\0')
        && !file.endsWith('/') && !file.split('/').some((part) => part === '.' || part === '..');
    if (!valid) throw refusal('helper-path-invalid');
    if (!Array.isArray(args) || Array.from(args).some((arg) => typeof arg !== 'string' || arg.includes('\0'))) {
      throw refusal('helper-args-invalid');
    }
    const launchOptions = { ...options };
    if ((launchOptions.shell !== undefined && launchOptions.shell !== false)
      || (launchOptions.windowsVerbatimArguments !== undefined && launchOptions.windowsVerbatimArguments !== false)) {
      throw refusal('helper-shell-forbidden');
    }
    return child[method](file, args, { ...launchOptions, shell: false }, ...rest);
  }

  return {
    resolve,
    path: executablePath,
    spawn: launch.bind(null, 'spawn'),
    spawnSync: launch.bind(null, 'spawnSync'),
    execFile: launch.bind(null, 'execFile'),
    execFileSync: launch.bind(null, 'execFileSync'),
  };
}

module.exports = { ...createHelperPrograms(), createHelperPrograms };
