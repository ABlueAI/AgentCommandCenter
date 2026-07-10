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

// Charset: ASCII letters, digits, dash, underscore only, and the FIRST character must be a letter,
// digit, or underscore (never '-', which git/CLIs can read as a flag). Deliberately NARROWER than
// the "letters/digits/dash/underscore/space" example: the task is spliced into a git ref
// (agent/<task>), and git ref names forbid spaces (and ~ ^ : ? * [ \ .. etc.), so allowing spaces
// would only guarantee a downstream `git worktree add` failure. This class is a strict SUBSET of
// what `git check-ref-format refs/heads/agent/<task>` accepts, so a separate git spawn to re-check
// the ref is unnecessary — anything this regex admits is a valid ref component. It also rejects, by
// construction: path separators (/ \), '.' (so '..' can't traverse), leading '-', whitespace
// (incl. leading/trailing), NUL, and any control character.
const TASK_RE = /^[A-Za-z0-9_][A-Za-z0-9_-]*$/;

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
      error: 'Task name may contain only letters, digits, dash and underscore, and must start with ' +
        'a letter, digit, or underscore. Rejected: spaces, path separators (/ \\), "..", a leading ' +
        'dash, and control characters.',
    };
  }
  return { ok: true, task };
}

module.exports = { validateTask, MAX_TASK_LEN, TASK_RE };
