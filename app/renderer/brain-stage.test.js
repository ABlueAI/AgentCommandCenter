'use strict';
// Run: node app/renderer/brain-stage.test.js
// S18: the brain tab's task model, stage layout, Ctrl+F, prompt reader and card keys
// (docs/DESIGN-BRIEF-1.1.md section 4), and its DOM against a small stub (no jsdom dependency).

const B = require('./brain-stage');
const F = require('./in-focus-card');

let passed = 0, failed = 0;
function assert(condition, label) {
  if (condition) { process.stdout.write(`  ✓ ${label}\n`); passed += 1; }
  else { process.stderr.write(`  ✗ FAIL: ${label}\n`); failed += 1; }
}
const eq = (a, b, label) => assert(JSON.stringify(a) === JSON.stringify(b), `${label} (got ${JSON.stringify(a)})`);

const steps = [];
let host2 = null;
const NOW = Date.UTC(2026, 10, 26, 15, 0, 0);
const MIN = 60000;
const pane = (id, status, extra) => Object.assign({ id, title: `Task ${id}`, repo: 'AgentCommandCenter', role: 'builder', status, statusSince: NOW - 5 * MIN, lastOutputAt: NOW - MIN }, extra || {});

const PERMISSION_LINES = [
  '● Bash(npm test)',
  ' Bash command',
  '   npm test',
  ' Do you want to proceed?',
  ' ❯ 1. Yes',
  '   2. Yes, and don\'t ask again for npm test commands in this project',
  '   3. No, and tell Claude what to do differently (esc)',
];
const QUESTION_LINES = [
  'Which store should the history use?',
  '❯ 1. Adapter',
  '  2. Port',
  '  3. Something else',
];

process.stdout.write('\nprompt reader: permission and question menus\n');
{
  const p = B.readPrompt(PERMISSION_LINES);
  eq(p && p.kind, 'permission', 'a "Do you want to" menu starting with Yes is a permission');
  eq(p && p.question, 'Do you want to proceed?', 'the question line above the menu');
  eq(p && p.options.map((o) => o.n), [1, 2, 3], 'three options, counted from 1');
  eq(B.allowOnceOption(p), 1, 'Allow once picks the plain Yes, never "don\'t ask again"');
  const q = B.readPrompt(QUESTION_LINES);
  eq(q && q.kind, 'question', 'any other numbered menu is a question');
  eq(q && q.options.map((o) => o.label), ['Adapter', 'Port', 'Something else'], 'question options');
  eq(B.readPrompt(['no menu here', 'just output']), null, 'no menu: no prompt');
  eq(B.readPrompt(['Pick one', '  2. B', '  3. C']), null, 'a menu that doesn\'t count from 1 is refused');
  eq(B.readPrompt(['Pick one', '  1. A']), null, 'a single option is not a menu');
  eq(B.readPrompt(['Do you want to proceed?', '1. Yes', '   wrapped continuation', '2. No']), null, 'a menu split by a wrapped line is refused, never guessed');
  const widened = { kind: 'permission', question: 'Do you want to proceed?', options: [{ n: 1, label: 'Yes, and don\'t ask again' }, { n: 2, label: 'No' }] };
  eq(B.allowOnceOption(widened), null, 'no plain Yes: Allow once has no option and refuses');
  eq(B.allowOnceOption(B.readPrompt(QUESTION_LINES)), null, 'a question has no Allow once');
}

process.stdout.write('\ntasks: states, stall watch, usage stop\n');
{
  const t = B.buildTask(pane('pty1', 'attention', { lines: PERMISSION_LINES }), NOW);
  eq([t.state, t.word, t.prompt && t.prompt.kind, t.waitingMin], ['needs', 'Needs you', 'permission', 5], 'attention with a permission menu');
  eq(B.buildTask(pane('pty2', 'working'), NOW).state, 'working', 'working');
  eq(B.buildTask(pane('pty3', 'turn ended'), NOW).state, 'ended', 'turn ended');
  eq([B.buildTask(pane('pty4', 'unknown'), NOW).state, B.buildTask(pane('pty4', 'unknown'), NOW).word], ['idle', 'Status unknown'], 'unknown is queued grey, with its own word, never working');
  eq(B.buildTask(pane('pty5', 'exited'), NOW).state, 'exited', 'exited leaves the stage');
  eq([B.buildTask(pane('pty6', 'failed'), NOW).state, B.buildTask(pane('pty6', 'failed'), NOW).word], ['needs', 'Failed'], 'failed needs you');
  eq(B.buildTask(pane('pty7', 'working', { held: true }), NOW).state, 'held', 'held by Blue');
  eq(B.buildTask({ title: 'no id' }, NOW), null, 'no id: no task');
  const stalled = B.buildTask(pane('pty8', 'working', { lastOutputAt: NOW - 20 * MIN }), NOW);
  eq([stalled.state, stalled.stalled, stalled.word], ['needs', true, 'Stalled'], '20 minutes of silence: stalled, red');
  eq(B.buildTask(pane('pty9', 'working', { lastOutputAt: NOW - 19 * MIN }), NOW).stalled, false, '19 minutes: not stalled');
  eq(B.buildTask(pane('pty10', 'working', { failedTries: 5 }), NOW).stalled, true, '5 failed tries: stalled');
  const usage = B.buildTask(pane('pty11', 'working', { lastOutputAt: NOW - 60 * MIN, usageResetAt: NOW + 30 * MIN }), NOW);
  assert(usage.stalled === false && /^Waiting for reset at /.test(usage.word), 'a usage stop is "waiting for reset at", never stalled');
  const noPrompt = B.buildTask(pane('pty12', 'attention', { lines: ['idle'] }), NOW);
  eq(noPrompt.prompt, null, 'attention without a menu has no prompt (Open pane only)');
  const hostile = B.buildTask(pane('pty13', 'working', { title: '<img src=x onerror=1>\u0007bell' }), NOW);
  eq(hostile.title, '<img src=x onerror=1> bell', 'control characters are blanked; markup stays plain text');
}

process.stdout.write('\nurgency order and layout: higher = more urgent\n');
{
  const tasks = [
    B.buildTask(pane('a', 'working', { statusSince: NOW - 2 * MIN }), NOW),
    B.buildTask(pane('b', 'attention', { statusSince: NOW - 3 * MIN }), NOW),
    B.buildTask(pane('c', 'turn ended'), NOW),
    B.buildTask(pane('d', 'attention', { statusSince: NOW - 9 * MIN }), NOW),
    B.buildTask(pane('e', 'idle'), NOW),
    B.buildTask(pane('f', 'working', { held: true }), NOW),
  ];
  eq(B.orderTasks(tasks).map((t) => t.id), ['d', 'b', 'f', 'a', 'e', 'c'], 'needs you first (oldest first), then held, working, queued, ended');
  const placed = B.layoutItems(B.stageItems(tasks, 'repo', null));
  const y = (id) => placed.find((p) => p.item.task.id === id).y;
  assert(y('d') === y('b') && y('b') < y('f') && y('f') < y('a') && y('a') < y('e') && y('e') < y('c'), 'each state on its own row, more urgent higher');
  assert(placed.every((p) => p.x > 0 && p.x < 1 && p.y > 0 && p.y < 1), 'every node is on the stage');
  assert(placed.every((p) => p.x < 0.4 || p.x > 0.6), 'the middle stays clear for the shark');
}

process.stdout.write('\nmore than 8 tasks: groups, fan out, no grouping\n');
{
  const many = [];
  for (let i = 0; i < 6; i++) many.push(B.buildTask(pane(`r${i}`, 'working', { repo: 'RepoA' }), NOW));
  for (let i = 0; i < 3; i++) many.push(B.buildTask(pane(`s${i}`, i === 0 ? 'attention' : 'idle', { repo: 'RepoB', role: 'reviewer' }), NOW));
  eq(B.stageItems(many.slice(0, 8), 'repo', null).every((x) => x.type === 'task'), true, '8 tasks: all nodes');
  const g = B.stageItems(many, 'repo', null);
  eq(g.map((x) => [x.type, x.key, x.count, x.state]), [['group', 'RepoB', 3, 'needs'], ['group', 'RepoA', 6, 'working']], '9 tasks: one node per repo, coloured by its most urgent task, most urgent first');
  const fanned = B.stageItems(many, 'repo', 'RepoB');
  eq(fanned.filter((x) => x.type === 'task').map((x) => x.task.id), ['s0', 's1', 's2'], 'clicking a group fans its tasks out');
  eq(B.stageItems(many, 'kind', null).map((x) => x.key), ['reviewer', 'builder'], 'group by kind');
  eq(B.stageItems(many, 'none', null).length, 9, 'no grouping: every task is a node');
}

process.stdout.write('\nCtrl+F: title first, then content; finished tasks are found too\n');
{
  const tasks = [
    B.buildTask(pane('x1', 'working', { title: 'Review #174', lines: ['checking the adapter'] }), NOW),
    B.buildTask(pane('x2', 'working', { title: 'Build adapter', branch: 'claude/s18' }), NOW),
    B.buildTask(pane('x3', 'exited', { title: 'Old adapter task' }), NOW),
  ];
  eq(B.findTasks(tasks, 'adapter').map((t) => t.id), ['x2', 'x3', 'x1'], 'title matches rank above content matches');
  eq(B.findTasks(tasks, 'claude/s18').map((t) => t.id), ['x2'], 'content includes the branch');
  eq(B.findTasks(tasks, 'review adapter').map((t) => t.id), ['x1'], 'every word must match');
  eq(B.findTasks(tasks, '  ').length, 0, 'an empty query finds nothing');
  assert(B.isFindChord({ ctrlKey: true, key: 'f' }) && !B.isFindChord({ ctrlKey: true, shiftKey: true, key: 'F' }) && !B.isFindChord({ key: 'f' }), 'exactly Ctrl+F');
}

process.stdout.write('\ncard keys: only a digit the menu offered, or Esc\n');
{
  const perm = B.buildTask(pane('p1', 'attention', { lines: PERMISSION_LINES }), NOW);
  const sig = B.promptSignature(perm.prompt);
  eq(B.keysForAction('allowOnce', perm, sig), { ok: true, keys: '1' }, 'Allow once sends 1');
  eq(B.keysForAction('deny', perm, sig), { ok: true, keys: '\u001b' }, 'Deny sends Esc');
  eq(B.keysForAction('allowOnce', perm, 'stale'), { ok: false, reason: 'prompt-changed' }, 'a prompt that changed since the card was drawn: refused');
  const q = B.buildTask(pane('q1', 'attention', { lines: QUESTION_LINES }), NOW);
  const qs = B.promptSignature(q.prompt);
  eq(B.keysForAction('answer', q, qs, 'opt-2'), { ok: true, keys: '2' }, 'an answer sends its digit');
  eq(B.keysForAction('answer', q, qs, 'opt-7'), { ok: false, reason: 'bad-answer' }, 'a digit the menu didn\'t offer: refused');
  eq(B.keysForAction('answer', q, qs, '2\r rm -rf'), { ok: false, reason: 'bad-answer' }, 'anything but opt-<digit>: refused');
  eq(B.keysForAction('deny', q, qs), { ok: false, reason: 'not-permission' }, 'Deny only on a permission');
  eq(B.keysForAction('allowOnce', q, qs), { ok: false, reason: 'no-allow-once-option' }, 'Allow once only on a permission');
  const w = B.buildTask(pane('w1', 'working'), NOW);
  eq(B.keysForAction('interrupt', w, ''), { ok: true, keys: '\u001b' }, 'Interrupt sends Esc to a working pane');
  eq(B.keysForAction('interrupt', perm, ''), { ok: false, reason: 'not-working' }, 'Interrupt never on a waiting pane');
  eq(B.keysForAction('allowOnce', w, ''), { ok: false, reason: 'no-prompt' }, 'no prompt: nothing is sent');
  eq(B.keysForAction('allowOnce', null, sig), { ok: false, reason: 'task-gone' }, 'a gone task: refused');
  eq(B.keysForAction('rm', perm, sig), { ok: false, reason: 'unknown-action' }, 'an unknown action: refused');
}

process.stdout.write('\nIn-focus mapping\n');
{
  const perm = B.buildTask(pane('p1', 'attention', { lines: PERMISSION_LINES }), NOW);
  const q = B.buildTask(pane('q1', 'attention', { lines: QUESTION_LINES }), NOW);
  eq([B.focusState(perm), B.focusState(q), B.focusState(B.buildTask(pane('w', 'working'), NOW)), B.focusState(B.buildTask(pane('e', 'turn ended'), NOW))], ['permission', 'question', 'working', 'finished'], 'each task maps to one of the card\'s four states');
  eq(B.focusTask(q, NOW).answers.map((a) => a.id), ['opt-1', 'opt-2', 'opt-3'], 'question answers become opt-<n> ids the card accepts');
  assert(/waiting 5 min · asks Do you want to proceed\?$/.test(B.hoverLine(perm)), 'hover: title · state waiting n min · asks the question');
}

// ---- DOM ------------------------------------------------------------------------------------------
class Node {
  constructor(tag) { this.tagName = String(tag).toUpperCase(); this.children = []; this.parentNode = null; this.attrs = {}; this.className = ''; this._text = ''; this.listeners = {}; this.disabled = false; this.style = {}; this.value = ''; this.hidden = false; }
  set textContent(v) { this._text = String(v); for (const c of this.children) c.parentNode = null; this.children = []; }
  get textContent() { return this._text + this.children.map((c) => c.textContent).join(''); }
  set innerHTML(_v) { throw new Error('innerHTML used'); }
  get firstChild() { return this.children[0] || null; }
  appendChild(c) { if (c.parentNode) c.parentNode.removeChild(c); c.parentNode = this; this.children.push(c); return c; }
  removeChild(c) { const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); c.parentNode = null; return c; }
  remove() { if (this.parentNode) this.parentNode.removeChild(this); }
  setAttribute(k, v) { this.attrs[k] = String(v); if (k === 'id') this.id = String(v); }
  getAttribute(k) { return Object.prototype.hasOwnProperty.call(this.attrs, k) ? this.attrs[k] : null; }
  addEventListener(type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); }
  fire(type, ev) { for (const fn of this.listeners[type] || []) fn(ev || { preventDefault() {} }); }
  click() { if (!this.disabled) this.fire('click'); }
  focus() { this.focused = true; }
  select() {}
  all(pred, out) { out = out || []; for (const c of this.children) { if (pred(c)) out.push(c); c.all(pred, out); } return out; }
  querySelectorAll(sel) { const m = /^\.([\w-]+)$/.exec(sel); return m ? this.all((n) => n.className.split(' ').includes(m[1])) : []; }
  querySelector(sel) { const m = /^\[data-task="([^"]*)"\]$/.exec(sel); return m ? (this.all((n) => n.attrs['data-task'] === m[1])[0] || null) : null; }
}
const doc = { createElement: (tag) => new Node(tag) };
const byId = (root, id) => root.all((n) => n.attrs.id === id)[0] || null;
const byAttr = (root, k, v) => root.all((n) => n.attrs[k] === v);

process.stdout.write('\nDOM: mount, nodes, cards, In focus, keys reach the pane\n');
{
  const host = new Node('div');
  const sent = [];
  const opened = [];
  const logs = [];
  let clock = NOW;
  const stage = B.createBrainStage({
    doc, host, log: (l) => logs.push(l), now: () => clock, inFocus: F,
    onKeys: (id, keys) => { sent.push([id, keys]); return Promise.resolve({ ok: true }); },
    onOpenPane: (id) => opened.push(id),
  });
  assert(byId(host, 'makoStage') && byId(host, 'makoConvo') && byId(host, 'makoBrainRight') && byId(host, 'makoFlowStrip'), 'stage, conversation, right panel and work-flow strip are mounted');
  assert(host.textContent.includes('No live tasks'), 'no panes: the stage says so, never an empty box');
  const send = byId(host, 'makoMessageSend');
  assert(send.disabled === true && /S51/.test(send.getAttribute('title')), 'Send is disabled with its reason until the conductor (S51)');

  stage.update([
    pane('pty1', 'attention', { title: 'Run tests', lines: PERMISSION_LINES, statusSince: NOW - 7 * MIN }),
    pane('pty2', 'attention', { title: 'Pick a store', lines: QUESTION_LINES }),
    pane('pty3', 'working', { title: 'Build the stage' }),
  ]);
  eq(byAttr(host, 'data-task', 'pty3').filter((n) => n.className.includes('mk-node')).length, 1, 'one node per live pane');
  eq(byId(host, 'makoStageCounts').textContent, 'Waiting on you 2 · On agents 1 · Ready 0', 'the counts line');
  const permCard = host.all((n) => n.tagName === 'ARTICLE' && n.attrs['data-kind'] === 'permission')[0];
  assert(permCard && permCard.className.includes('mk-card-permission'), 'a permission prompt always shows as a red card');
  assert(permCard && permCard.textContent.includes(F.PERMISSION_LINE), 'with "Mako never answers this for you"');
  const allow = permCard.all((n) => n.attrs['data-action'] === 'allowOnce')[0];
  allow.click();
  await_(() => {
    eq(sent, [['pty1', '1']], 'Allow once on the card reaches the pane as "1"');
    const qCard = host.all((n) => n.tagName === 'ARTICLE' && n.attrs['data-kind'] === 'question')[0];
    qCard.all((n) => n.attrs['data-answer'] === 'opt-2')[0].click();
  }, () => {
    eq(sent[1], ['pty2', '2'], 'a question card answer reaches the pane as its digit');
    // Open pane
    const qCard = host.all((n) => n.tagName === 'ARTICLE' && n.attrs['data-kind'] === 'question')[0];
    qCard.all((n) => n.attrs['data-action'] === 'openPane')[0].click();
    eq(opened, ['pty2'], 'Open pane opens that pane');

    // Node click opens In focus with the permission layout and wired buttons.
    host.all((n) => n.className.includes('mk-node') && n.attrs['data-task'] === 'pty1')[0].click();
    const card = byId(host, 'makoBrainRight').children[0];
    eq(card && card.getAttribute('data-state'), 'permission', 'a click on a node opens the In-focus card in its state');
    const deny = card.all((n) => n.attrs['data-action'] === 'deny')[0];
    assert(deny && deny.disabled === false, 'Deny is wired on the In-focus card');
    deny.click();
  }, () => {
    eq(sent[2], ['pty1', '\u001b'], 'Deny on the In-focus card reaches the pane as Esc');
    // The prompt changes under the card: the click is refused, nothing is sent.
    const before = sent.length;
    stage.update([
      pane('pty1', 'attention', { title: 'Run tests', lines: ['Do you want to proceed?', '1. Yes', '2. No, delete it'], statusSince: NOW - 7 * MIN }),
      pane('pty2', 'attention', { title: 'Pick a store', lines: QUESTION_LINES }),
      pane('pty3', 'working', { title: 'Build the stage' }),
    ]);
    const stale = B.keysForAction('allowOnce', stage.state().tasks.find((t) => t.id === 'pty1'), B.promptSignature(B.readPrompt(PERMISSION_LINES)));
    eq(stale.reason, 'prompt-changed', 'an old card\'s click is refused once the prompt on screen changed');
    eq(sent.length, before, 'nothing was sent by the update');

    // Back to Right now
    const card = byId(host, 'makoBrainRight').children[0];
    card.all((n) => n.attrs['data-action'] === 'backToRightNow')[0].click();
    assert(byId(host, 'makoRightNow') !== null, 'Back to Right now shows the counts');

    // Ctrl+F finds a node and focuses it.
    const hits = stage.find('store');
    eq(hits, ['pty2'], 'Ctrl+F finds a node by title');
    eq(stage.state().focusId, 'pty2', 'and puts it in focus');
    eq(stage.find('proceed'), ['pty1'], 'and by content (the question on screen)');
    assert(/^No task matches/.test((stage.find('zzz'), byId(host, 'makoStageFindStatus').textContent)), 'no match says so');

    // Pause freezes the view, not the agents.
    byId(host, 'makoStagePause').click();
    clock = NOW + 5 * 60000;
    const applied = stage.update([pane('pty3', 'working', { title: 'Build the stage' })]);
    eq(applied, false, 'paused: the view does not take updates');
    assert(/^Paused · last updated /.test(byId(host, 'makoStageLive').textContent), 'the live line says Paused with the last update time');
    eq(stage.state().tasks.length, 3, 'the frozen view keeps its nodes');
    byId(host, 'makoStagePause').click();
    stage.update([pane('pty3', 'working', { title: 'Build the stage' })]);
    eq(stage.state().tasks.length, 1, 'resumed: the closed panes leave the stage');
    eq(stage.find('store'), ['pty2'], 'a closed pane is still found by Ctrl+F (nothing disappears)');
    assert(/finished: /.test(byId(host, 'makoConvoCards').textContent), 'finished work is batched into one line');

    // A failed write is visible.
    host2 = new Node('div');
    const s2 = B.createBrainStage({ doc, host: host2, now: () => NOW, inFocus: F, onKeys: () => Promise.resolve({ ok: false, reason: 'pty-gone' }), onOpenPane: () => {} });
    s2.update([pane('z', 'attention', { lines: PERMISSION_LINES })]);
    host2.all((n) => n.attrs['data-action'] === 'allowOnce')[0].click();
  }, () => {
    assert(/^Not sent: pty-gone/.test(byId(host2, 'makoStageFindStatus').textContent), 'a write the pane refused is shown, never silent');
  });

  let threw = '';
  try { B.createBrainStage({ doc, host, inFocus: F }); } catch (e) { threw = e.message; }
  eq(threw, 'brain-stage: pane-bridge-missing', 'no pane bridge: refuses to mount');
  threw = '';
  try { B.createBrainStage({ doc, host, onKeys: () => {}, onOpenPane: () => {} }); } catch (e) { threw = e.message; }
  eq(threw, 'brain-stage: in-focus-card-missing', 'no In-focus card module: refuses to mount');
}

// Small sequential runner for the promise-based clicks.
function await_(...fns) { steps.push(...fns); }
(async () => {
  for (const fn of steps) { await new Promise((r) => setImmediate(r)); fn(); }
  await new Promise((r) => setImmediate(r));
  process.stdout.write(`\nbrain-stage: ${passed} passed, ${failed} failed\n`);
  if (failed) process.exit(1);
})();
