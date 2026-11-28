'use strict';
// Task names are both worktree suffixes and components of agent/<task> refs.
// The renderer checks the text for immediate feedback and main independently
// validates every request before using the name in a path or launching a process.

// Length cap: the task becomes both a sibling folder name (`<repo>-<task>`) and a branch component
// (`agent/<task>`); real names are short kebab slugs. 64 is generous for those while keeping the
// resulting path well clear of Windows MAX_PATH pressure.
const MAX_TASK_LEN = 64;

// Charset: LOWERCASE ASCII letters, digits, dash, underscore only, and the FIRST character must be a
// lowercase letter, digit, or underscore (never '-', which git/CLIs can read as a flag).
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

// Branch-only subset of git check-ref-format. The full refs/heads/ prefix is
// supplied by the caller so revision selectors and filenames cannot match.
function validBranchName(branch) {
  return typeof branch === 'string' && branch.length > 0 && Buffer.byteLength(branch, 'utf8') <= 255
    && !branch.startsWith('-') && branch !== 'HEAD' && !branch.endsWith('.')
    && !/[\x00-\x20\x7f~^:?*\[\\]/.test(branch)
    && !branch.includes('..') && !branch.includes('@{')
    && branch.split('/').every((part) => part && !part.startsWith('.') && !part.endsWith('.lock'));
}

if (typeof module !== 'undefined') {
  module.exports = { validateTask, validBranchName, MAX_TASK_LEN, TASK_RE };
} else {
  window.ccTaskName = { validateTask };
}
