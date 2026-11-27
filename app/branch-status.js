'use strict';
// S47 piece 3: branch status per agent. Reads one worktree's branch, its upstream, ahead/behind and
// changed files with `git status --porcelain=v2 --branch -z` (docs/decisions/OSS-symvibe.md: BUILD
// FRESH on porcelain v2, git called, not linked).
//
// Two design points:
// - `--no-optional-locks` (git(1), GIT_OPTIONAL_LOCKS): a plain `git status` may refresh the index
//   and take index.lock, which would race the agent working in that worktree (its own `git add`
//   or `git commit` could fail with "index.lock exists"). This read never writes.
// - `-z`: every record ends in NUL, so a path with spaces, quotes or newlines is never re-quoted or
//   split. A rename record ("2 ...") carries its original path as one more NUL-ended field.
//
// Failures refuse visibly (AGENTS.md "Security rules"): a failed or unreadable status returns
// { ok: false, error } with a fixed reason; it never comes back as "clean".

const STATUS_ARGS = Object.freeze([
  '--no-optional-locks', 'status', '--porcelain=v2', '--branch', '-z', '--untracked-files=normal',
]);
const DEFAULT_TIMEOUT_MS = 10000;
const MAX_BUFFER = 8 * 1024 * 1024;

const REASON = Object.freeze({
  INVALID_INPUT: 'branch-status-invalid-input',
  GIT_FAILED: 'git-status-failed',
  TOO_LARGE: 'git-status-too-large',
  TIMED_OUT: 'git-status-timed-out',
  UNPARSEABLE: 'git-status-unparseable',
});

// Parse porcelain v2 output (with --branch and -z) into counts. Returns null when the text isn't
// porcelain v2 (no "# branch.oid" header), so a caller never mistakes garbage for a clean tree.
function parseStatusV2(text) {
  if (typeof text !== 'string') return null;
  const fields = text.split('\0');
  const st = {
    oid: null, head: null, detached: false, upstream: null, ahead: null, behind: null,
    staged: 0, unstaged: 0, untracked: 0, conflicted: 0, changed: 0,
  };
  let sawOid = false;
  for (let i = 0; i < fields.length; i++) {
    const f = fields[i];
    if (f === '') continue;
    if (f.startsWith('# ')) {
      const sp = f.indexOf(' ', 2);
      const key = sp === -1 ? f.slice(2) : f.slice(2, sp);
      const val = sp === -1 ? '' : f.slice(sp + 1);
      if (key === 'branch.oid') { sawOid = true; st.oid = val === '(initial)' ? null : val; }
      else if (key === 'branch.head') {
        if (val === '(detached)') { st.detached = true; st.head = null; } else st.head = val;
      } else if (key === 'branch.upstream') st.upstream = val;
      else if (key === 'branch.ab') {
        const m = /^\+(\d+) -(\d+)$/.exec(val);
        if (!m) return null;
        st.ahead = Number(m[1]);
        st.behind = Number(m[2]);
      }
      continue;
    }
    const kind = f[0];
    if (f[1] !== ' ') return null;
    if (kind === '?') { st.untracked++; st.changed++; continue; }
    if (kind === '!') continue; // ignored files (only with --ignored, which we never pass)
    if (kind !== '1' && kind !== '2' && kind !== 'u') return null;
    const xy = f.slice(2, 4);
    if (!/^[.A-Z?!]{2}$/.test(xy)) return null;
    st.changed++;
    if (kind === 'u') st.conflicted++;
    else {
      if (xy[0] !== '.') st.staged++;
      if (xy[1] !== '.') st.unstaged++;
    }
    if (kind === '2') i++; // a rename or copy: the next NUL field is its original path
  }
  return sawOid ? st : null;
}

// Run git status in `dir` (already authorized by the caller) and parse it.
// deps.execFile has node's child_process.execFile signature; injected so tests drive it.
function readBranchStatus(deps, dir) {
  const execFile = deps && deps.execFile;
  if (typeof execFile !== 'function') return Promise.resolve({ ok: false, error: REASON.INVALID_INPUT });
  if (typeof dir !== 'string' || dir.length === 0 || dir.includes('\0')) {
    return Promise.resolve({ ok: false, error: REASON.INVALID_INPUT });
  }
  const timeout = (deps && Number.isInteger(deps.timeoutMs) && deps.timeoutMs > 0) ? deps.timeoutMs : DEFAULT_TIMEOUT_MS;
  return new Promise((resolve) => {
    let settled = false;
    const done = (r) => { if (!settled) { settled = true; resolve(r); } };
    try {
      execFile('git', ['-C', dir, ...STATUS_ARGS],
        { encoding: 'utf8', timeout, maxBuffer: MAX_BUFFER, windowsHide: true },
        (err, stdout, stderr) => {
          if (err) {
            let error = REASON.GIT_FAILED;
            if (err.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER') error = REASON.TOO_LARGE;
            else if (err.killed && err.signal) error = REASON.TIMED_OUT;
            const detail = String(stderr || err.message || '').trim().split(/\r?\n/)[0].slice(0, 300);
            done({ ok: false, error, detail });
            return;
          }
          const st = parseStatusV2(String(stdout == null ? '' : stdout));
          done(st ? Object.assign({ ok: true }, st) : { ok: false, error: REASON.UNPARSEABLE });
        });
    } catch (e) {
      done({ ok: false, error: REASON.GIT_FAILED, detail: String((e && e.message) || e).slice(0, 300) });
    }
  });
}

// Read several worktrees for one renderer call. deps.authorize(path) -> { ok, dir } | { ok, reason }
// is the main-owned membership check; a path it refuses is never handed to git. Results keep the
// input order. At most CONCURRENCY git processes run at once, so a repo with many agents doesn't
// start a burst of them every poll.
const MAX_PATHS = 64;
const CONCURRENCY = 4;
async function readBranchStatuses(deps, paths) {
  if (!Array.isArray(paths) || paths.length > MAX_PATHS) throw new Error(REASON.INVALID_INPUT);
  const authorize = deps && deps.authorize;
  if (typeof authorize !== 'function') throw new Error(REASON.INVALID_INPUT);
  const results = new Array(paths.length);
  let next = 0;
  async function worker() {
    while (next < paths.length) {
      const i = next++;
      let auth;
      try { auth = authorize(paths[i]); } catch { auth = { ok: false, reason: 'enumeration-failed' }; }
      results[i] = (auth && auth.ok === true)
        ? await readBranchStatus(deps, auth.dir)
        : { ok: false, error: (auth && auth.reason) || 'not-authorized' };
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, paths.length) }, worker));
  return results;
}

module.exports = {
  parseStatusV2, readBranchStatus, readBranchStatuses, STATUS_ARGS, REASON, MAX_BUFFER, DEFAULT_TIMEOUT_MS,
  MAX_PATHS, CONCURRENCY,
};
