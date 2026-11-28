'use strict';
// Shell-free argument builders + deterministic executable/directory pre-validation for the one-click
// launchers (open-vscode / open-terminal).
//
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
  openVscodeSpec,
  openTerminalSpec,
};
