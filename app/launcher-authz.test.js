'use strict';
// Run: node app/launcher-authz.test.js
// Plain Node.js — no framework. Exercises the P12 launcher directory authorizer against REAL disposable
// fixtures under %TEMP% (a fake repo, a live worktree, a foreign directory, a file, a stale/unlisted
// worktree, and — on Windows — directory junctions that resolve INTO and OUT OF the authorized set).
// All side effects are confined to one mkdtemp dir, removed in finally. No network, no provider calls.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { createLauncherAuthorizer } = require('./launcher-authz');

const IS_WIN = process.platform === 'win32';
let passed = 0, failed = 0;
function assert(cond, label) {
  if (cond) { process.stdout.write(`  ✓ ${label}\n`); passed++; }
  else { process.stderr.write(`  ✗ FAIL: ${label}\n`); failed++; }
}
function reasonOf(r) { return r && r.ok === false ? r.reason : `(ok:${r && r.ok})`; }

// --- constructor validation --------------------------------------------------------------------
{
  let threw = false;
  try { createLauncherAuthorizer({ isDirectory: () => true, listAuthorizedDirs: () => [] }); } catch { threw = true; }
  assert(threw, 'constructor throws when realpath is missing');
  threw = false;
  try { createLauncherAuthorizer({ realpath: (p) => p, isDirectory: () => true }); } catch { threw = true; }
  assert(threw, 'constructor throws when listAuthorizedDirs is missing');
}

const base = fs.mkdtempSync(path.join(os.tmpdir(), 'p12-authz-'));
try {
  const proj = path.join(base, 'proj');               // authorized "repo" root
  const wt = path.join(proj, 'wt');                   // authorized live worktree
  const stale = path.join(proj, 'stalewt');           // exists, but NOT in the authorized list
  const foreign = path.join(base, 'foreign');         // exists, outside the authorized set
  const afile = path.join(base, 'afile.txt');         // a file, not a directory
  const missing = path.join(base, 'nope-missing');    // does not exist
  for (const d of [proj, wt, stale, foreign]) fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(afile, 'x', 'utf8');

  const realFn = (p) => fs.realpathSync.native(p);
  const isDirFn = (p) => fs.statSync(p).isDirectory();
  const authz = createLauncherAuthorizer({
    realpath: realFn,
    isDirectory: isDirFn,
    listAuthorizedDirs: () => [proj, wt], // exactly the list-repos + list-worktrees projection
  });
  const realProj = realFn(proj);
  const realWt = realFn(wt);

  // --- allowed: the repo root and a live worktree ------------------------------------------------
  {
    const a = authz.authorize(proj);
    assert(a.ok === true && a.dir === realProj, 'authorizes the repo root (returns its canonical real path)');
    const b = authz.authorize(wt);
    assert(b.ok === true && b.dir === realWt, 'authorizes a live worktree');
  }

  // --- refused: foreign dir, stale/unlisted worktree, file, missing ------------------------------
  assert(reasonOf(authz.authorize(foreign)) === 'not-authorized', 'refuses an arbitrary existing directory outside the set (not-authorized)');
  assert(reasonOf(authz.authorize(stale)) === 'not-authorized', 'refuses a stale/unlisted worktree directory (not-authorized)');
  assert(reasonOf(authz.authorize(afile)) === 'not-a-directory', 'refuses a file (not-a-directory)');
  assert(reasonOf(authz.authorize(missing)) === 'unresolved-path', 'refuses a missing path (unresolved-path)');

  // --- refused early by the pure pre-filter (never touches fs) -----------------------------------
  // A LITERAL `..` segment (path.join would normalize it away before the authorizer ever saw it).
  assert(reasonOf(authz.authorize(proj + path.sep + '..' + path.sep + 'foreign')) === 'traversal', 'refuses a `..` traversal segment (traversal)');
  assert(reasonOf(authz.authorize('relative\\path')) === 'not-absolute', 'refuses a relative path (not-absolute)');
  assert(reasonOf(authz.authorize(123)) === 'not-a-string', 'refuses a non-string (not-a-string)');
  assert(reasonOf(authz.authorize(proj + '&calc')) === 'forbidden-char', 'refuses a cmd-metacharacter path (forbidden-char)');
  assert(reasonOf(authz.authorize(proj + '\x01')) === 'control-char', 'refuses a control character (control-char)');

  // --- enumeration failure degrades to a refusal, never a throw ----------------------------------
  {
    const bad = createLauncherAuthorizer({
      realpath: realFn, isDirectory: isDirFn,
      listAuthorizedDirs: () => { throw new Error('git blew up'); },
    });
    assert(reasonOf(bad.authorize(proj)) === 'enumeration-failed', 'a throwing enumeration degrades to a refusal (enumeration-failed)');
    const badShape = createLauncherAuthorizer({
      realpath: realFn, isDirectory: isDirFn, listAuthorizedDirs: () => 'not-an-array',
    });
    assert(reasonOf(badShape.authorize(proj)) === 'enumeration-failed', 'a non-array enumeration degrades to a refusal (enumeration-failed)');
  }

  // --- Windows case-insensitivity: an upper-cased authorized path still resolves to the same dir --
  if (IS_WIN) {
    const a = authz.authorize(proj.toUpperCase());
    assert(a.ok === true && a.dir === realProj, 'Windows: an upper-cased authorized path is accepted (case-folded identity)');
  }

  // --- reparse/junction identity: a junction INTO the set is allowed, OUT is refused --------------
  if (IS_WIN) {
    const linkIn = path.join(base, 'linkIn');
    const linkOut = path.join(base, 'linkOut');
    let madeJunctions = true;
    try {
      fs.symlinkSync(proj, linkIn, 'junction');
      fs.symlinkSync(foreign, linkOut, 'junction');
    } catch (e) { madeJunctions = false; process.stdout.write(`  · (junction creation unavailable: ${e.code || e.message} — reparse cases skipped)\n`); }
    if (madeJunctions) {
      const inRes = authz.authorize(linkIn);
      assert(inRes.ok === true && inRes.dir === realProj,
        'a junction resolving INTO the authorized set is allowed and opens the real target (not the junction path)');
      assert(reasonOf(authz.authorize(linkOut)) === 'not-authorized',
        'a junction resolving OUT of the authorized set is refused (not-authorized)');
    }
  } else {
    // POSIX symlink identity (portable equivalent of the junction cases).
    const linkIn = path.join(base, 'linkIn');
    const linkOut = path.join(base, 'linkOut');
    fs.symlinkSync(proj, linkIn);
    fs.symlinkSync(foreign, linkOut);
    assert(authz.authorize(linkIn).ok === true, 'a symlink INTO the authorized set is allowed');
    assert(reasonOf(authz.authorize(linkOut)) === 'not-authorized', 'a symlink OUT of the authorized set is refused');
  }
} finally {
  try { fs.rmSync(base, { recursive: true, force: true }); } catch { /* best-effort cleanup */ }
}

process.stdout.write(`\nlauncher-authz: ${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
