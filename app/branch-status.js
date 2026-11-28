'use strict';
// S47 piece 3: branch status per agent. Reads one worktree's branch, its upstream, ahead/behind and
// changed files with `git status --porcelain=v2 --branch -z` (docs/decisions/OSS-symvibe.md: BUILD
// FRESH on porcelain v2, git called, not linked).
//
// Design points:
// - `--no-optional-locks` (git(1), GIT_OPTIONAL_LOCKS): a plain `git status` may refresh the index
//   and take index.lock, which would race the agent working in that worktree (its own `git add`
//   or `git commit` could fail with "index.lock exists"). This read never writes.
// - `-z`: every record ends in NUL, so a path with spaces, quotes or newlines is never re-quoted or
//   split. A rename record ("2 ...") carries its original path as one more NUL-ended field.
// - This runs on a timer in Mako's main process, in folders agents can write to, so git is kept from
//   running programs the repository's config names: `-c core.fsmonitor=false` (a configured
//   fsmonitor is a command git would start), `--ignore-submodules=all` (no git run inside a
//   submodule with its own config), and a minimal environment (gitEnv: no tokens or keys from
//   main's environment, no system git config). The rest of this hardening is a follow-up issue.
//
// Failures refuse visibly (AGENTS.md "Security rules"): a failed or unreadable status returns
// { ok: false, error } with a fixed reason; it never comes back as "clean".

const STATUS_ARGS = Object.freeze([
  '--no-optional-locks', '-c', 'core.fsmonitor=false', 'status', '--porcelain=v2', '--branch', '-z',
  '--untracked-files=normal', '--ignore-submodules=all',
]);
const LIST_WORKTREES_ARGS = Object.freeze(['worktree', 'list', '--porcelain']);

// The environment git gets: only what it needs to find itself, the user's global config and a temp
// folder, matched case-insensitively (Windows spells them Path, SystemRoot, ...). Nothing else from
// main's environment, so a command git might start never sees a token or key.
const ENV_KEEP = new Set(['PATH', 'PATHEXT', 'SYSTEMROOT', 'WINDIR', 'COMSPEC', 'HOME', 'USERPROFILE',
  'HOMEDRIVE', 'HOMEPATH', 'APPDATA', 'LOCALAPPDATA', 'TEMP', 'TMP', 'TMPDIR', 'LANG', 'LC_ALL', 'XDG_CONFIG_HOME']);
function gitEnv(env) {
  const out = {};
  for (const k of Object.keys(env || {})) if (ENV_KEEP.has(k.toUpperCase())) out[k] = env[k];
  out.GIT_CONFIG_NOSYSTEM = '1';
  out.GIT_TERMINAL_PROMPT = '0';
  out.GIT_OPTIONAL_LOCKS = '0';
  return out;
}
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
      const opts = { encoding: 'utf8', timeout, maxBuffer: MAX_BUFFER, windowsHide: true };
      if (deps.env) opts.env = deps.env;
      execFile('git', ['-C', dir, ...STATUS_ARGS], opts,
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
      try { auth = authorize(paths[i]); }
      catch (e) { auth = { ok: false, reason: 'enumeration-failed', detail: String((e && e.message) || e).slice(0, 300) }; }
      if (auth && auth.ok === true) results[i] = await readBranchStatus(deps, auth.dir);
      else {
        results[i] = { ok: false, error: (auth && auth.reason) || 'not-authorized' };
        if (auth && auth.detail) results[i].detail = auth.detail;
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, paths.length) }, worker));
  return results;
}

// The folders this channel may read: every git repository directly under projectsRoot plus each
// one's worktrees (the same rule as main's listLauncherAuthorizedDirs for the one-click launchers),
// listed asynchronously so a poll never blocks main, and with every failure kept: { dirs, failures }
// where failures name the step and repo that failed. deps: { projectsRoot, readdir (fs.promises
// shape, withFileTypes), exists (path => bool), execFile, env }.
async function listAuthorizedDirs(deps) {
  const failures = [];
  const root = deps && deps.projectsRoot;
  if (typeof root !== 'string' || !root) return { dirs: [], failures: [{ step: 'settings', detail: 'no projects folder is set' }] };
  let entries;
  try { entries = await deps.readdir(root, { withFileTypes: true }); }
  catch (e) { return { dirs: [], failures: [{ step: 'projects-folder', detail: String((e && e.message) || e).slice(0, 300) }] }; }
  const sep = root.endsWith('/') || root.endsWith('\\') ? '' : (root.includes('\\') ? '\\' : '/');
  const repos = [];
  for (const d of entries) {
    if (!d.isDirectory()) continue;
    const repo = root + sep + d.name;
    let isRepo = false;
    try { isRepo = !!deps.exists(repo + sep + '.git'); } catch { isRepo = false; }
    if (isRepo) repos.push(repo);
  }
  const dirs = [];
  let next = 0;
  async function worker() {
    while (next < repos.length) {
      const repo = repos[next++];
      dirs.push(repo);
      const r = await new Promise((resolve) => {
        const opts = { encoding: 'utf8', timeout: DEFAULT_TIMEOUT_MS, maxBuffer: 4 * 1024 * 1024, windowsHide: true };
        if (deps.env) opts.env = deps.env;
        try { deps.execFile('git', ['-C', repo, ...LIST_WORKTREES_ARGS], opts, (err, stdout, stderr) => resolve({ err, stdout, stderr })); }
        catch (e) { resolve({ err: e, stdout: '', stderr: '' }); }
      });
      if (r.err) {
        failures.push({ step: 'git-worktree-list', repo, detail: String(r.stderr || r.err.message || r.err).trim().split(/\r?\n/)[0].slice(0, 300) });
        continue;
      }
      for (const line of String(r.stdout || '').split('\n')) {
        if (line.startsWith('worktree ')) { const wp = line.slice(9).trim(); if (wp) dirs.push(wp); }
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, repos.length) }, worker));
  return { dirs, failures };
}

// The whole IPC answer, so main.js only wires it: list the authorized set once, authorize each path
// with the launchers' authorizer against it, read the authorized ones. When the listing had a
// failure, a path that isn't in the set is answered `enumeration-failed` with that failure's detail,
// because it may only be missing because the listing failed.
// deps: { listAuthorizedDirs: async () => { dirs, failures }, createAuthorizer: (listFn) => { authorize },
//         execFile, env }
async function answerBranchStatus(deps, paths) {
  if (!Array.isArray(paths) || paths.length > MAX_PATHS) throw new Error(REASON.INVALID_INPUT);
  let listing;
  try { listing = await deps.listAuthorizedDirs(); }
  catch (e) { listing = { dirs: [], failures: [{ step: 'list', detail: String((e && e.message) || e).slice(0, 300) }] }; }
  const dirs = (listing && Array.isArray(listing.dirs)) ? listing.dirs : [];
  const failures = (listing && Array.isArray(listing.failures)) ? listing.failures : [];
  const authorizer = deps.createAuthorizer(() => dirs);
  const failNote = failures.map((f) => `${f.step}${f.repo ? ` ${f.repo}` : ''}: ${f.detail}`).join('; ').slice(0, 300);
  return readBranchStatuses({
    execFile: deps.execFile,
    env: deps.env,
    authorize: (p) => {
      const a = authorizer.authorize(p);
      if (!a.ok && a.reason === 'not-authorized' && failures.length) return { ok: false, reason: 'enumeration-failed', detail: failNote };
      return a;
    },
  }, paths);
}

module.exports = {
  parseStatusV2, readBranchStatus, readBranchStatuses, listAuthorizedDirs, answerBranchStatus, gitEnv,
  STATUS_ARGS, LIST_WORKTREES_ARGS, REASON, MAX_BUFFER, DEFAULT_TIMEOUT_MS, MAX_PATHS, CONCURRENCY,
};
