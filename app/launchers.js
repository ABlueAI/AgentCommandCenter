'use strict';
// Shell-free argument builders + deterministic executable/directory pre-validation for the one-click
// launchers (open-vscode / open-terminal).
//
// P12 launcher hardening: the production VS Code path NO LONGER routes through cmd.exe. main resolves a
// real Code.exe and spawns it with shell:false and a discrete argv, so NO shell — cmd.exe on Windows
// OR sh under a WSL fallback — ever parses the directory path. This is what actually closes the
// re-parse hole: the previous "discrete argv element" reasoning did NOT, because with cmd.exe in the
// loop cmd re-parsed the whole command line (Node/libuv only quotes an argv element that contains
// whitespace/tab/quote, so a path carrying `& | ^ < > ( )` and no spaces reached cmd.exe verbatim and
// became a second command — code execution). Removing cmd.exe removes the parser.
//
// This module is PURE and dependency-free (only Node core `path`): it owns the string PRE-FILTER
// (normalizeLauncherDir) and the deterministic exe resolvers, so every rule is unit-tested with plain
// node (launchers.test.js). Directory AUTHORIZATION — that the path canonicalizes to a main-owned
// repository/worktree — lives in launcher-authz.js and runs against the real filesystem in main.

const path = require('path');

const IS_WIN = process.platform === 'win32';

// cmd.exe metacharacters plus shell-significant quoting characters. A launcher directory string
// carrying any of these is REFUSED before any spawn. The production path no longer uses cmd.exe, so
// these are no longer *executable* there — this is defense in depth and a canary (refuse-don't-
// downgrade, the same posture the historical '%' refusal used), and it keeps the off-Windows `code`/
// `wt` spawns safe too. NOTE: this means an otherwise-authorized directory whose REAL name contains
// one of these characters (e.g. a repo placed under "...\Program Files (x86)\...") is refused by
// design; the actionable fix is to rename/relocate it. Blue's repos live under a metacharacter-free
// projects root, so this does not fire in normal use.
const FORBIDDEN_DIR_CHARS = ['%', '&', '|', '^', '<', '>', '(', ')', '"', "'", '`'];
// eslint-disable-next-line no-control-regex
const CONTROL_CHAR_RE = /[\x00-\x1f\x7f]/;
const MAX_DIR_LEN = 4096; // generous absolute ceiling; a real Windows path is far shorter

// Pure pre-filter for a renderer-supplied launcher directory string. Returns { ok:true, dir } with the
// string UNCHANGED (canonicalization + set-membership is launcher-authz.js's job, against real fs), or
// { ok:false, reason } — a bounded reason CONSTANT, never the offending value, so a refusal log line
// can never become an injection/spoofing sink. Order: type/empty -> blank -> length -> control chars
// -> forbidden metacharacters -> absolute -> no `..` traversal segment.
function normalizeLauncherDir(raw) {
  if (typeof raw !== 'string' || raw.length === 0) return { ok: false, reason: 'not-a-string' };
  if (raw.trim().length === 0) return { ok: false, reason: 'blank' };
  if (raw.length > MAX_DIR_LEN) return { ok: false, reason: 'too-long' };
  if (CONTROL_CHAR_RE.test(raw)) return { ok: false, reason: 'control-char' };
  for (const ch of FORBIDDEN_DIR_CHARS) {
    if (raw.indexOf(ch) !== -1) return { ok: false, reason: 'forbidden-char' };
  }
  // Absolute-path requirement. path.isAbsolute accepts a Windows drive-absolute ("C:\...") or UNC path
  // and rejects a bare drive-relative ("\foo") or any relative path.
  if (!path.isAbsolute(raw)) return { ok: false, reason: 'not-absolute' };
  // A launcher directory must never contain a `..` traversal segment. Canonicalization would resolve
  // it later, but refuse it early and visibly rather than silently normalize an attacker's path.
  const segs = raw.split(/[\\/]+/);
  if (segs.some((s) => s === '..')) return { ok: false, reason: 'traversal' };
  return { ok: true, dir: raw };
}

// Deterministic, bounded VS Code executable resolution. Returns { ok:true, exe } for the FIRST
// candidate that exists as a file, else { ok:false, reason:'vscode-not-found' }. Candidates are built
// ONLY from main-owned environment (never a renderer-supplied path, never a raw PATH scan) — the
// standard stable-VS-Code install locations. `exists` is injected (fs.existsSync in production) so the
// resolver is unit-testable; `isWin` may be overridden for the same reason. Off Windows, `code` is a
// normal executable on PATH spawned directly (shell:false); a genuinely missing `code` surfaces via
// the caller's spawn 'error' handler as a visible refusal.
function resolveVscodeExe(deps) {
  const env = (deps && deps.env) || {};
  const exists = (deps && typeof deps.exists === 'function') ? deps.exists : () => false;
  const isWin = deps && typeof deps.isWin === 'boolean' ? deps.isWin : IS_WIN;
  if (!isWin) return { ok: true, exe: 'code' };
  const candidates = [];
  if (env.LOCALAPPDATA) candidates.push(path.join(env.LOCALAPPDATA, 'Programs', 'Microsoft VS Code', 'Code.exe'));
  if (env.ProgramFiles) candidates.push(path.join(env.ProgramFiles, 'Microsoft VS Code', 'Code.exe'));
  const pf86 = env['ProgramFiles(x86)'];
  if (pf86) candidates.push(path.join(pf86, 'Microsoft VS Code', 'Code.exe'));
  for (const c of candidates) {
    if (exists(c)) return { ok: true, exe: c };
  }
  return { ok: false, reason: 'vscode-not-found' };
}

// Windows Terminal resolution. `wt.exe` ships as an App Execution Alias at
// %LOCALAPPDATA%\Microsoft\WindowsApps\wt.exe; resolve that concrete path when present so the spawn
// does not depend on PATH ordering, else fall back to the bare 'wt' alias name. Either way it is
// spawned shell:false with a discrete `-d <dir>` argument; a genuinely missing Windows Terminal
// surfaces as a spawn 'error' the caller turns into a visible refusal. `exists`/`isWin` are injected
// for unit-testing. Off Windows there is no wt — returns 'wt' and the caller's error handler reports
// the ENOENT.
function resolveTerminalExe(deps) {
  const env = (deps && deps.env) || {};
  const exists = (deps && typeof deps.exists === 'function') ? deps.exists : () => false;
  const isWin = deps && typeof deps.isWin === 'boolean' ? deps.isWin : IS_WIN;
  if (isWin && env.LOCALAPPDATA) {
    const alias = path.join(env.LOCALAPPDATA, 'Microsoft', 'WindowsApps', 'wt.exe');
    if (exists(alias)) return alias;
  }
  return 'wt';
}

// argv builders. The directory is ALWAYS a discrete argv element — never concatenated into, nor quoted
// for, a shell string — and every caller spawns with shell:false, so the path reaches the child as a
// literal argument. `Code.exe <dir>` opens that folder as a VS Code workspace; `wt -w 0 nt -d <dir>`
// opens a new tab in window 0 at that directory.
function openVscodeSpec(exe, dir) { return { cmd: exe, args: [dir] }; }
function openTerminalSpec(exe, dir) { return { cmd: exe, args: ['-w', '0', 'nt', '-d', dir] }; }

module.exports = {
  IS_WIN,
  FORBIDDEN_DIR_CHARS,
  normalizeLauncherDir,
  resolveVscodeExe,
  resolveTerminalExe,
  openVscodeSpec,
  openTerminalSpec,
};
