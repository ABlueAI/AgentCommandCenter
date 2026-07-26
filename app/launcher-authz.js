'use strict';
// P12 launcher directory authorization (Full-class). A renderer-supplied directory may be opened by
// open-vscode / open-terminal ONLY if it is a directory the MAIN process already owns: the current
// repository root or one of that repo's live git worktrees. The renderer's string is never trusted
// beyond membership-testing it, by canonical real path, against a set main re-derives from the
// filesystem + git on every launch. This closes the companion residual to the cmd.exe re-parse:
// without it, even the shell-free launcher is an "open ANY existing folder" primitive for a
// compromised renderer.
//
// PURE (no Electron/fs import at module scope): main injects realpath/isDirectory/listAuthorizedDirs
// so this is unit-testable in plain node against REAL disposable fixtures (launcher-authz.test.js).
// Fail-closed — any doubt (missing path, broken reparse point, non-directory, foreign path, stale/
// pruned worktree, enumeration failure) is a refusal with a bounded reason CONSTANT, never the
// offending value.
//
// Identity is by CANONICAL REAL PATH: realpath resolves 8.3 short names, symlinks, and directory
// junctions/reparse points to their true target, so a junction that resolves INTO the authorized set
// is allowed (it genuinely points at an authorized directory) and one resolving OUTSIDE is refused. On
// success we return the canonical real path to spawn into — never the renderer's (possibly aliased)
// input — so what is opened is exactly the directory that was authorized.

const { normalizeLauncherDir } = require('./launchers');

function createLauncherAuthorizer(deps) {
  const realpath = deps && deps.realpath;                       // (p) => canonical real path; THROWS if missing/broken
  const isDirectory = deps && deps.isDirectory;                 // (realPath) => bool
  const listAuthorizedDirs = deps && deps.listAuthorizedDirs;   // () => string[] (repo roots + worktrees)
  const isWin = deps && typeof deps.isWin === 'boolean' ? deps.isWin : (process.platform === 'win32');
  if (typeof realpath !== 'function') throw new Error('launcher-authz: realpath must be a function.');
  if (typeof isDirectory !== 'function') throw new Error('launcher-authz: isDirectory must be a function.');
  if (typeof listAuthorizedDirs !== 'function') throw new Error('launcher-authz: listAuthorizedDirs must be a function.');

  // Windows path identity is case-insensitive; POSIX is case-sensitive. Fold the same way the fence
  // gate in main.js folds, so both layers agree on when two paths are "the same directory".
  const fold = (p) => (isWin ? p.toLowerCase() : p);

  // Canonicalize a path to { real, folded } or null when it does not resolve (missing / broken
  // reparse). realpath THROWS on a missing path — that is a refusal, never a main-process crash.
  function resolveReal(p) {
    let r;
    try { r = realpath(p); } catch { return null; }
    if (typeof r !== 'string' || r.length === 0) return null;
    return { real: r, folded: fold(r) };
  }

  // Returns { ok:true, dir } — the CANONICAL REAL directory to spawn into — or { ok:false, reason }.
  function authorize(rawDir) {
    const norm = normalizeLauncherDir(rawDir);
    if (!norm.ok) return { ok: false, reason: norm.reason };

    const cand = resolveReal(norm.dir);
    if (!cand) return { ok: false, reason: 'unresolved-path' };

    let dir = false;
    try { dir = !!isDirectory(cand.real); } catch { dir = false; }
    if (!dir) return { ok: false, reason: 'not-a-directory' };

    let authorized;
    try { authorized = listAuthorizedDirs(); } catch { return { ok: false, reason: 'enumeration-failed' }; }
    if (!Array.isArray(authorized)) return { ok: false, reason: 'enumeration-failed' };

    for (const a of authorized) {
      if (typeof a !== 'string' || a.length === 0) continue;
      const ra = resolveReal(a);
      if (ra && ra.folded === cand.folded) return { ok: true, dir: cand.real };
    }
    return { ok: false, reason: 'not-authorized' };
  }

  return { authorize };
}

const api = { createLauncherAuthorizer };
if (typeof module === 'object' && module.exports) module.exports = api;
