'use strict';
// Which build is running. The renderer used to show a hard-coded July acceptance marker, so Blue
// could not tell whether the desktop shortcut was running current code. The desktop shortcut runs
// this repository's app directory directly, so the checkout's own git state is the build identity.
//
// Main computes this once at startup with an injected `runGit` (the existing main.js `git()` helper)
// and serves it on the `build-info` channel. Nothing here is sensitive: a version, a branch name, a
// short commit and whether tracked files have local edits.

const SHORT_SHA = /^[0-9a-f]{7,40}$/;
const SAFE_BRANCH = /^[A-Za-z0-9._\/-]{1,100}$/;

/**
 * runGit(args) -> Promise<string>, resolving to trimmed stdout or '' on any failure (never rejects).
 * Returns { version, branch, commit, dirty, label }; unknown parts are null rather than guessed.
 */
async function readBuildInfo({ version, runGit }) {
  const ver = typeof version === 'string' && version ? version : null;
  let commit = null, branch = null, dirty = null;
  if (typeof runGit === 'function') {
    const [sha, ref, status] = await Promise.all([
      runGit(['rev-parse', '--short', 'HEAD']).catch(() => ''),
      runGit(['rev-parse', '--abbrev-ref', 'HEAD']).catch(() => ''),
      runGit(['status', '--porcelain', '--untracked-files=no']).catch(() => null),
    ]);
    if (SHORT_SHA.test(sha)) commit = sha;
    if (SAFE_BRANCH.test(ref)) branch = ref;
    if (commit && typeof status === 'string') dirty = status.length > 0;
  }
  return { version: ver, branch, commit, dirty, label: formatBuildLabel({ version: ver, branch, commit, dirty }) };
}

/** "Mako 1.0.0 · main@abc1234", with "+ local edits" when tracked files differ from that commit. */
function formatBuildLabel({ version, branch, commit, dirty }) {
  const name = version ? `Mako ${version}` : 'Mako';
  if (!commit) return `${name} · commit unknown`;
  const where = branch && branch !== 'HEAD' ? `${branch}@${commit}` : commit;
  return `${name} · ${where}${dirty ? ' + local edits' : ''}`;
}

const api = { readBuildInfo, formatBuildLabel };
if (typeof module === 'object' && module.exports) module.exports = api;
