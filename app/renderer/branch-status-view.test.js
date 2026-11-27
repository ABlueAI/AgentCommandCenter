'use strict';
// Run: node app/renderer/branch-status-view.test.js
//
// S47 piece 3: what an agent's branch status line and tooltip say for each answer from main.

const { describeBranchStatus, loadingView, errorView, STATE } = require('./branch-status-view');

let passed = 0, failed = 0;
function assert(cond, label) {
  if (cond) { process.stdout.write('  ✓ ' + label + '\n'); passed++; }
  else { process.stderr.write('  x FAIL: ' + label + '\n'); failed++; }
}
const ok = (extra) => Object.assign({
  ok: true, head: 'claude/s47', detached: false, upstream: 'origin/claude/s47', ahead: 0, behind: 0,
  staged: 0, unstaged: 0, untracked: 0, conflicted: 0, changed: 0,
}, extra || {});

{
  const v = describeBranchStatus(ok());
  assert(v.state === STATE.CLEAN && v.text === 'in sync · clean', 'in sync and clean');
  assert(/Branch: claude\/s47/.test(v.title) && /0 commits ahead, 0 commits behind/.test(v.title), 'tooltip names the branch and ahead/behind');
}
{
  const v = describeBranchStatus(ok({ ahead: 2, behind: 1, changed: 3, staged: 1, unstaged: 1, untracked: 1 }));
  assert(v.state === STATE.CHANGED && v.text === '↑2 ↓1 · 3 changed', 'ahead, behind and changed: "↑2 ↓1 · 3 changed"');
  assert(/1 staged, 1 not staged, 1 untracked, 0 in conflict/.test(v.title), 'tooltip splits the changed files');
  assert(/2 commits ahead, 1 commit behind/.test(v.title), 'tooltip: singular and plural');
}
{
  assert(describeBranchStatus(ok({ ahead: 4 })).text === '↑4 · clean', 'ahead only');
  assert(describeBranchStatus(ok({ behind: 5 })).text === '↓5 · clean', 'behind only');
}
{
  const v = describeBranchStatus(ok({ upstream: null, ahead: null, behind: null }));
  assert(v.text === 'no upstream · clean' && /No upstream branch/.test(v.title), 'no upstream');
}
{
  const v = describeBranchStatus(ok({ ahead: null, behind: null }));
  assert(v.text === 'upstream gone · clean' && /no longer exists/.test(v.title), 'upstream named but gone');
}
{
  const v = describeBranchStatus(ok({ detached: true, head: null, upstream: null, ahead: null, behind: null }));
  assert(v.text === 'detached · clean' && /detached HEAD/.test(v.title), 'detached HEAD');
}
{
  const v = describeBranchStatus(ok({ conflicted: 2, changed: 3, unstaged: 1 }));
  assert(v.state === STATE.CONFLICT && v.text === 'in sync · 2 conflicts · 3 changed', 'conflicts win the state and are named');
}
for (const [label, res, reason] of [
  ['git failed', { ok: false, error: 'git-status-failed', detail: 'fatal: not a git repository' }, /git status failed\nfatal: not a git repository/],
  ['not authorized', { ok: false, error: 'not-authorized' }, /not a worktree of a repo/],
  ['unknown reason', { ok: false, error: 'something-new' }, /something-new/],
  ['no answer', undefined, /no answer/],
  ['ok but a count missing', { ok: true, head: 'b', staged: 0 }, /could not read/],
  ['ok but a negative count', ok({ changed: -1 }), /could not read/],
  ['ok is truthy but not true', Object.assign(ok(), { ok: 1 }), /unknown/],
]) {
  const v = describeBranchStatus(res);
  assert(v.state === STATE.ERROR && v.text === 'status unavailable' && reason.test(v.title), `${label}: "status unavailable", never clean`);
}
{
  assert(loadingView().state === STATE.LOADING, 'loading view');
  assert(errorView({ error: 'ipc-failed', detail: 'x' }).title === 'Branch status unavailable: Mako could not ask its main process\nx', 'ipc failure words');
}
{
  const evil = '<img src=x onerror=alert(1)>';
  const v = describeBranchStatus(ok({ head: evil, upstream: 'origin/' + evil }));
  assert(v.title.includes(evil), 'a hostile branch name stays literal text in the view (agent-dom places it with textContent)');
}

process.stdout.write(`\nbranch-status-view: ${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
