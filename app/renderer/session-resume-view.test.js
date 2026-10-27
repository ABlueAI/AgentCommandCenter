'use strict';
// Run: node app/renderer/session-resume-view.test.js
//
// S09: the Resume or Start fresh offer. Plain node with a small DOM stub (no jsdom), like
// agent-dom.test.js: textContent stores text and creates no child nodes, so a folder name with markup
// in it can only ever be text.

const view = require('./session-resume-view.js');

let passed = 0, failed = 0;
function assert(cond, label) {
  if (cond) { process.stdout.write(`  ✓ ${label}\n`); passed++; }
  else { process.stderr.write(`  ✗ FAIL: ${label}\n`); failed++; }
}

class Stub {
  constructor(tag) { this.tagName = tag.toUpperCase(); this.children = []; this._text = ''; this.className = ''; this.title = ''; }
  appendChild(c) { this.children.push(c); return c; }
  set textContent(t) { this._text = String(t); this.children = []; }
  get textContent() { return this._text + this.children.map((c) => c.textContent).join(' '); }
  set innerHTML(_) { throw new Error('innerHTML must not be used'); }
  all(tag) { return this.children.flatMap((c) => (c.tagName === tag ? [c] : []).concat(c.all(tag))); }
}
const doc = { createElement: (t) => new Stub(t) };
const LABELS = { builder: 'Builder', reviewer: 'Reviewer' };
const roleLabel = (r) => LABELS[r] || r;
const row = (o) => Object.assign({
  sessionId: 'aaaaaaaa-1111-4111-8111-111111111111', role: 'builder', worktree: 'D:\\Workspace\\repo-fix',
  startedAt: '2026-10-27T09:00:00.000Z', stoppedAt: '2026-10-27T10:05:00.000Z', stopReason: 'mako-closed',
  worktreeMissing: false, mayBeExpired: false,
}, o);

// describeRow
{
  const t = view.describeRow(row(), roleLabel);
  assert(t.label === 'Builder · repo-fix' && t.detail === 'Mako closed 2026-10-27 10:05 UTC' && t.title === 'D:\\Workspace\\repo-fix' && t.warnings.length === 0,
    'a builder row reads "Builder · <folder>", when Mako closed, and the full path as its tooltip');
  assert(view.describeRow(row({ role: null, stopReason: 'unknown' }), roleLabel).label === 'Claude · repo-fix'
    && view.describeRow(row({ stopReason: 'unknown' }), roleLabel).detail.startsWith('Mako stopped unexpectedly'),
  'a bare claude pane reads "Claude", and a crash says so');
  assert(/no longer exists/.test(view.describeRow(row({ worktreeMissing: true }), roleLabel).warnings[0]), 'a missing folder warns');
  assert(/cleanupPeriodDays/.test(view.describeRow(row({ mayBeExpired: true }), roleLabel).warnings[0]), 'an old session warns about cleanupPeriodDays');
  assert(view.folderName('C:/a/b/') === 'b' && view.folderName('') === 'unknown folder', 'folder names from either slash, trailing or not');
}

// create / render / choices
{
  const host = new Stub('div');
  const calls = [];
  const v = view.create({
    document: doc, host, roleLabel,
    onResume: (r) => { calls.push(['resume', r.sessionId]); return r.role !== 'reviewer'; },
    onFresh: (r) => calls.push(['fresh', r.sessionId]),
    onDismiss: (r) => calls.push(['dismiss', r.sessionId]),
  });
  v.render([]);
  assert(host.className === 'resume-host hidden' && host.children.length === 0, 'no rows: the host stays hidden and empty');

  const A = row({ sessionId: 'a', worktree: 'D:\\w\\<img src=x onerror=alert(1)>' });
  const B = row({ sessionId: 'b', role: 'reviewer' });
  const C = row({ sessionId: 'c', worktreeMissing: true });
  v.render([A, B, C]);
  assert(host.className === 'resume-host' && /3 Claude panes were open/.test(host.textContent), 'three rows show with a heading');
  assert(host.all('IMG').length === 0 && host.textContent.indexOf('<img src=x onerror=alert(1)>') !== -1, 'a markup folder name stays text');
  const buttons = host.all('BUTTON').map((b) => b.textContent);
  assert(buttons.join('|') === 'Not now|Resume|Start fresh|Resume|Start fresh|Dismiss', 'Resume and Start fresh per row; a missing folder offers only Dismiss');
  assert(host.all('BUTTON').every((b) => b.type === 'button' && typeof b.onclick === 'function'), 'every button is a plain button with a click handler');

  const btn = (text, i) => host.all('BUTTON').filter((b) => b.textContent === text)[i || 0];
  btn('Resume', 1).onclick();
  assert(calls.pop().join() === 'resume,b' && v.rows().length === 3, 'when Resume is declined (returns false) the row stays');
  btn('Resume', 0).onclick();
  assert(calls.pop().join() === 'resume,a' && v.rows().map((r) => r.sessionId).join() === 'b,c', 'Resume reports the row and removes it');
  btn('Start fresh').onclick();
  assert(calls.pop().join() === 'fresh,b' && v.rows().map((r) => r.sessionId).join() === 'c', 'Start fresh reports the row and removes it');
  assert(/One Claude pane was open/.test(host.textContent), 'the heading follows the count');
  btn('Dismiss').onclick();
  assert(calls.pop().join() === 'dismiss,c' && host.className === 'resume-host hidden', 'Dismiss removes the last row and hides the offer');

  v.render([A, B]);
  calls.length = 0;
  btn('Not now').onclick();
  assert(calls.map((c) => c.join()).join('|') === 'dismiss,a|dismiss,b' && v.rows().length === 0 && host.className === 'resume-host hidden',
    'Not now dismisses every row and hides the offer');
}

process.stdout.write(`\nsession-resume-view: ${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
