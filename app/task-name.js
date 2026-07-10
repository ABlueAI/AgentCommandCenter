'use strict';
// Server-side (main-process) validation for the agent `task` name. `task` crosses the untrusted
// renderer -> main IPC boundary (new-agent / remove-agent) and then flows into a filesystem path
// (path.join(dirname(repo), `${repo}-${task}`)) and a git branch name (agent/<task>) inside
// new-agent.ps1. The renderer sanitizes it for UX, but a modified/bypassed renderer can call
// ipcRenderer.invoke('new-agent', { task }) with anything — and the remove path passes a
// git-derived, unsanitized taskOf(wt). So this is the actual enforcement boundary (AUDIT-REPORT.md
// finding #4): a bad task must be REFUSED here, before any fs/git/child_process call, never
// silently sanitized or truncated into a "close enough" name (project convention: refuse visibly).
//
// Dependency-free (no electron/fs) so it unit-tests in plain node, matching video-scout-args.js.

// Length cap: the task becomes both a sibling folder name (`<repo>-<task>`) and a branch component
// (`agent/<task>`); real names are short kebab slugs. 64 is generous for those while keeping the
// resulting path well clear of Windows MAX_PATH pressure.
const MAX_TASK_LEN = 64;

// Charset: LOWERCASE ASCII letters, digits, dash, underscore only, and the FIRST character must be a
// lowercase letter, digit, or underscore (never '-', which git/CLIs can read as a flag).
//
// Case (M2): the charset is lowercase-only rather than adding a separate `task !== task.toLowerCase()`
// branch — one canonical allowlist regex is the single source of truth for "what is a valid task,"
// mirrors exactly what the renderer already canonicalizes to (toLowerCase().replace(/[^a-z0-9-]+/g)),
// and leaves no second predicate to drift out of sync. Refusal is inherent, not silent lowercasing:
// an uppercase character simply fails the match, so a mixed-case name (e.g. "Task-1") is REFUSED with
// a visible error — we never quietly fold it to lowercase and proceed.
//
// Deliberately NARROWER than the "letters/digits/dash/underscore/space" example: the task is spliced
// into a git ref (agent/<task>), and git ref names forbid spaces (and ~ ^ : ? * [ \ .. etc.), so
// allowing spaces would only guarantee a downstream `git worktree add` failure. This class is a
// strict SUBSET of what `git check-ref-format refs/heads/agent/<task>` accepts, so a separate git
// spawn to re-check the ref is unnecessary — anything this regex admits is a valid ref component. It
// also rejects, by construction: uppercase, path separators (/ \), '.' (so '..' can't traverse),
// leading '-', whitespace (incl. leading/trailing), NUL, and any control character.
const TASK_RE = /^[a-z0-9_][a-z0-9_-]*$/;

// Returns { ok: true, task } for a valid name, or { ok: false, error } with a user-facing reason.
function validateTask(task) {
  if (typeof task !== 'string') {
    return { ok: false, error: 'Task name must be text.' };
  }
  if (task.length === 0) {
    return { ok: false, error: 'Task name is empty.' };
  }
  if (task.length > MAX_TASK_LEN) {
    return { ok: false, error: `Task name is too long (max ${MAX_TASK_LEN} characters, got ${task.length}).` };
  }
  if (!TASK_RE.test(task)) {
    return {
      ok: false,
      error: 'Task name may contain only lowercase letters, digits, dash and underscore, and must ' +
        'start with a lowercase letter, digit, or underscore. Rejected: uppercase, spaces, path ' +
        'separators (/ \\), "..", a leading dash, and control characters.',
    };
  }
  // Windows reserved DEVICE NAMES (con, prn, aux, nul, com0-9, lpt0-9). The "<repo>-" prefix keeps
  // the worktree FOLDER (<repo>-con) safe — but the branch ref agent/<task> has NO such prefix, and
  // git writes a loose ref lock file .git/refs/heads/agent/<task>.lock. On Windows a reserved base
  // name is reserved regardless of extension, so `git worktree add -b agent/con` fails hard with
  // "cannot lock ref 'refs/heads/agent/con': ... Invalid argument" (verified empirically; note
  // `git check-ref-format` itself calls agent/con VALID — ref syntax legality is not the same as
  // Windows createability). Reject the whole class up front with a clear message rather than let it
  // surface as a cryptic git error. Only an EXACT match is a device name: "com"/"console"/"con-fig"
  // are fine (a device name is the bare word, optionally com/lpt + a single digit).
  if (/^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/.test(task)) {
    return {
      ok: false,
      error: `Task name "${task}" is a Windows reserved device name, so git cannot create the ` +
        `branch ref agent/${task}. Choose another name.`,
    };
  }
  return { ok: true, task };
}

module.exports = { validateTask, MAX_TASK_LEN, TASK_RE };
