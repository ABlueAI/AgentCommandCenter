'use strict';
// S47 piece 3: what an agent's branch status line says, from main's `worktree-branch-status`
// answer (app/branch-status.js). Pure: no DOM, no IPC, so it is unit-tested in plain node.
//
// The line is short ("↑2 ↓1 · 3 changed") and the tooltip spells it out. A failed read shows
// "status unavailable" with the reason, never "clean" (AGENTS.md: failures refuse visibly).
// Branch and upstream names come from git and may hold any character git allows, so callers place
// the text and title with textContent / setAttribute only (agent-dom.js), never innerHTML.
//
// Wrapped in a function so its names stay out of the page's shared script scope (classic scripts
// share one; agent-dom.js already declares `api` there).

(function (global) {
const STATE = Object.freeze({
  CLEAN: 'clean', CHANGED: 'changed', CONFLICT: 'conflict', ERROR: 'error', LOADING: 'loading',
});

const ERROR_WORDS = Object.freeze({
  'git-status-failed': 'git status failed',
  'git-status-too-large': 'too many changed files to count',
  'git-status-timed-out': 'git status took too long',
  'git-status-unparseable': 'git status gave output Mako could not read',
  'branch-status-invalid-input': 'bad request',
  'not-authorized': 'not a worktree of a repo under your projects folder',
  'unresolved-path': 'the worktree folder is missing',
  'not-a-directory': 'the worktree folder is missing',
  'enumeration-failed': 'could not list the repo’s worktrees',
  'ipc-failed': 'Mako could not ask its main process',
});

function plural(n, one, many) { return `${n} ${n === 1 ? one : many}`; }
function isCount(n) { return Number.isInteger(n) && n >= 0; }

function loadingView() {
  return { state: STATE.LOADING, text: 'branch status…', title: 'Reading git status for this worktree' };
}

function errorView(res, fallback) {
  const reason = (res && typeof res.error === 'string' && res.error) || fallback || 'unknown';
  const words = ERROR_WORDS[reason] || reason;
  const detail = res && typeof res.detail === 'string' && res.detail ? `\n${res.detail}` : '';
  return { state: STATE.ERROR, text: 'status unavailable', title: `Branch status unavailable: ${words}${detail}` };
}

// res: { ok: true, head, detached, upstream, ahead, behind, staged, unstaged, untracked, conflicted,
//        changed } or { ok: false, error, detail? }. Anything else is an error view.
function describeBranchStatus(res) {
  if (!res || typeof res !== 'object') return errorView(null, 'no answer');
  if (res.ok !== true) return errorView(res);
  const counts = ['staged', 'unstaged', 'untracked', 'conflicted', 'changed'];
  if (!counts.every((k) => isCount(res[k]))) return errorView(null, 'git-status-unparseable');

  const parts = [];
  const tips = [];
  const branch = res.detached ? 'detached HEAD' : (typeof res.head === 'string' && res.head ? res.head : 'unknown branch');
  tips.push(`Branch: ${branch}`);

  if (res.detached) parts.push('detached');
  else if (typeof res.upstream !== 'string' || !res.upstream) {
    parts.push('no upstream');
    tips.push('No upstream branch: not pushed yet, or pushed without -u');
  } else if (!isCount(res.ahead) || !isCount(res.behind)) {
    parts.push('upstream gone');
    tips.push(`Upstream ${res.upstream} no longer exists (deleted on the remote, or not fetched)`);
  } else {
    if (res.ahead === 0 && res.behind === 0) parts.push('in sync');
    else {
      const ab = [];
      if (res.ahead > 0) ab.push(`↑${res.ahead}`);
      if (res.behind > 0) ab.push(`↓${res.behind}`);
      parts.push(ab.join(' '));
    }
    tips.push(`Upstream ${res.upstream}: ${plural(res.ahead, 'commit', 'commits')} ahead, ${plural(res.behind, 'commit', 'commits')} behind`);
  }

  let state = STATE.CLEAN;
  if (res.conflicted > 0) {
    state = STATE.CONFLICT;
    parts.push(plural(res.conflicted, 'conflict', 'conflicts'));
  }
  if (res.changed === 0) {
    parts.push('clean');
    tips.push('No changed files');
  } else {
    if (state !== STATE.CONFLICT) state = STATE.CHANGED;
    parts.push(`${res.changed} changed`);
    tips.push(`Changed files: ${res.changed} (${res.staged} staged, ${res.unstaged} not staged, ${res.untracked} untracked, ${res.conflicted} in conflict)`);
  }
  return { state, text: parts.join(' · '), title: tips.join('\n') };
}

const api = { describeBranchStatus, loadingView, errorView, STATE, ERROR_WORDS };
global.branchStatusView = api;
if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window === 'undefined' ? globalThis : window);
