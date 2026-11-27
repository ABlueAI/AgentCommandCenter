'use strict';
// Run: node app/renderer/session-hygiene-view.test.js
//
// S46: the daily idle-sessions list. Plain node with a small DOM stub (no jsdom), like
// session-resume-view.test.js: textContent stores text and creates no child nodes, so a folder name
// or done-when with markup in it can only ever be text.

const view = require('./session-hygiene-view.js');

let passed = 0, failed = 0;
function assert(cond, label) {
  if (cond) { process.stdout.write(`  ✓ ${label}\n`); passed++; }
  else { process.stderr.write(`  ✗ FAIL: ${label}\n`); failed++; }
}

class Stub {
  constructor(tag) { this.tagName = tag.toUpperCase(); this.children = []; this._text = ''; this.className = ''; this.title = ''; this.value = ''; }
  appendChild(c) { this.children.push(c); return c; }
  set textContent(t) { this._text = String(t); this.children = []; }
  get textContent() { return this._text + this.children.map((c) => c.textContent).join(' '); }
  set innerHTML(_) { throw new Error('innerHTML must not be used'); }
  all(tag) { return this.children.flatMap((c) => (c.tagName === tag ? [c] : []).concat(c.all(tag))); }
}
const doc = { createElement: (t) => new Stub(t) };
const LABELS = { builder: 'Builder' };
const roleLabel = (r) => LABELS[r] || r;
const row = (o) => Object.assign({
  sessionId: 'aaaaaaaa-1111-4111-8111-111111111111', owner: 'blue', ownerAssumed: false, state: 'waiting',
  doneWhen: null, role: 'builder', worktree: 'D:\\Workspace\\repo-fix', idleDays: 4, idle: true,
}, o);

// describeRow
{
  const t = view.describeRow(row(), roleLabel);
  assert(t.label === 'Builder · repo-fix' && t.detail === 'idle 4 days · waiting for Resume or Start fresh · owner Blue'
    && t.doneWhen === 'No done-when set' && t.title === 'D:\\Workspace\\repo-fix', 'a row reads its role, folder, idle days, state, owner and missing done-when');
  const t2 = view.describeRow(row({ role: null, idleDays: 1, state: 'running', ownerAssumed: true, doneWhen: 'PR green' }), roleLabel);
  assert(t2.label === 'Claude · repo-fix' && t2.detail === 'idle 1 day · running · owner Blue (assumed)' && t2.doneWhen === 'Done when: PR green',
    'a bare claude pane, one day, an assumed owner and a done-when');
}

// shouldShow: once a day, only with something idle, only on a good answer
{
  const ans = (o) => Object.assign({ ok: true, day: '2026-11-25', idle: [row()] }, o);
  assert(view.shouldShow(null, ans()) === true, 'the first idle list of the day shows');
  assert(view.shouldShow('2026-11-25', ans()) === false, 'the same day it does not show again');
  assert(view.shouldShow('2026-11-24', ans()) === true, 'the next day it shows again');
  assert(view.shouldShow(null, ans({ idle: [] })) === false, 'nothing idle, nothing shown');
  assert(view.shouldShow(null, { ok: false, error: 'x' }) === false && view.shouldShow(null, null) === false, 'a failed read shows nothing (app.js logs it)');
}

// create: render, hide, save
(async () => {
  const host = new Stub('div');
  const saves = [];
  let answer = { ok: true };
  const v = view.create({ document: doc, host, roleLabel, onSaveDoneWhen: (r, text) => { saves.push([r.sessionId, text]); return Promise.resolve(answer); } });
  v.render([row({ worktree: 'D:\\w\\<img src=x onerror=alert(1)>' })], 3);
  assert(host.className === 'hygiene-host' && /been idle 3 days or more/.test(host.textContent), 'the list shows with its threshold');
  assert(host.textContent.includes('<img src=x onerror=alert(1)>') && host.all('IMG').length === 0, 'a hostile folder name is text, never markup');
  const input = host.all('INPUT')[0];
  assert(input && input.maxLength === 200 && input.value === '', 'each row has a done-when field, capped at 200 characters');
  input.value = '  tests pass  ';
  const saveBtn = host.all('BUTTON').find((b) => b.textContent === 'Save');
  await saveBtn.onclick();
  assert(saves.length === 1 && saves[0][1] === '  tests pass  ', 'Save sends the text to main as typed (main trims and checks it)');
  assert(host.textContent.includes('Done when: tests pass'), 'and the row shows the saved done-when');

  answer = { ok: false, error: 'session-memory-bad-done-when' };
  host.all('INPUT')[0].value = 'bad';
  await host.all('BUTTON').find((b) => b.textContent === 'Save').onclick();
  assert(host.textContent.includes('Not saved [session-memory-bad-done-when]') && host.textContent.includes('Done when: tests pass'),
    'a refusal is shown on the row, and the old done-when stays');

  const v2 = view.create({ document: doc, host: new Stub('div'), roleLabel, onSaveDoneWhen: () => Promise.reject(new Error('gone')) });
  v2.render([row()], 3);
  const r2 = await v2.save(v2.rows()[0], { value: 'x' });
  assert(r2 && r2.ok === false && r2.error === 'ipc-rejected', 'a rejected IPC call is a visible refusal, not a silent drop');

  await host.all('BUTTON').find((b) => b.textContent === 'Hide until tomorrow').onclick();
  assert(host.className === 'hygiene-host hidden' && v.rows().length === 0, 'Hide until tomorrow hides the list');
  v.render([], 3);
  assert(host.className === 'hygiene-host hidden', 'an empty list stays hidden');

  process.stdout.write(`\nsession-hygiene-view: ${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
})();
