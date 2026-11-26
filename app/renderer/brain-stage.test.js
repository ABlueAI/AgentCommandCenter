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
  eq(B.readPrompt(['Pick one', '❯ 2. B', '  3. C']), null, 'a menu that doesn\'t count from 1 is refused');
  eq(B.readPrompt(['Pick one', '❯ 1. A']), null, 'a single option is not a menu');
  eq(B.readPrompt(['Do you want to proceed?', '❯ 1. Yes', '   wrapped continuation', '2. No']), null, 'a menu split by a wrapped line is refused, never guessed');
  eq(B.readPrompt(['Options:', '1. Adapter', '2. Port']), null, 'a numbered list with no cursor is not a menu');
  eq(B.readPrompt(QUESTION_LINES.concat(['Then I went on to say more', 'and more', 'and more', 'and more'])), null, 'a menu with other output after it is not live');
  const widened = { kind: 'permission', question: 'Do you want to proceed?', options: [{ n: 1, label: 'Yes, and don\'t ask again' }, { n: 2, label: 'No' }] };
  eq(B.allowOnceOption(widened), null, 'no plain Yes: Allow once has no option and refuses');
  eq(B.allowOnceOption(B.readPrompt(QUESTION_LINES)), null, 'a question has no Allow once');
  eq(p && [p.detail, p.complete], [['● Bash(npm test)', 'Bash command', 'npm test'], true], 'the command block above the question is kept, back to the topmost tool header');
  const longCmd = ['Bash command'].concat(Array.from({ length: 14 }, (_, i) => `  line ${i + 1} \\`), ['Do you want to proceed?', '❯ 1. Yes', '  2. No']);
  const lp = B.readPrompt(longCmd);
  eq([lp.complete, lp.detail.length, B.allowOnceOption(lp)], [true, 15, 1], 'a 14-line command with its header: every line is on the card');
  const perm = (opts, detail) => ({ kind: 'permission', question: 'Do you want to proceed?', detail: detail === undefined ? ['Bash command', 'npm test'] : detail, complete: true, options: opts.map((label, i) => ({ n: i + 1, label })) });
  for (const w of ['Yes, allow all edits during this session', 'Yes, always allow', 'Yes, and don\'t ask again for this session', 'Yes, and auto-accept edits', 'Yes, bypass permissions']) {
    eq(B.allowOnceOption(perm([w, 'No'])), null, `a widening first "Yes" is never Allow once: "${w}"`);
  }
  eq(B.allowOnceOption(perm(['Yes, allow all edits during this session', 'Yes', 'No'])), 2, 'the plain "Yes" further down is picked');
  eq(B.allowOnceOption(perm(['Yes', 'No'], [])), null, 'no command shown above the question: no Allow once (Open pane only)');
  const a = B.readPrompt(['Bash command', 'npm test', 'Do you want to proceed?', '❯ 1. Yes', '2. No']);
  const eight = B.readPrompt(['Bash command'].concat(Array.from({ length: 8 }, (_, i) => `step ${i + 1}`), ['Do you want to proceed?', '❯ 1. Yes', '2. No']));
  eq([eight.complete, eight.detail.length, B.allowOnceOption(eight)], [true, 9, 1], 'an 8-line command with its header: shown whole, Allow once offered');
  // A command or description line that looks like a header can't hide the lines above it.
  const tricky = (cmd) => B.readPrompt(['Bash command', `  ${cmd}`, '  read file handling fixed', '  Fetch latest changes from origin', 'Do you want to proceed?', '❯ 1. Yes', '  2. No']);
  const t1 = tricky('git commit -m x'), t2 = tricky('rm -rf ~');
  eq([t1.complete, t1.detail[0], t1.detail.length], [true, 'Bash command', 4], 'the topmost header wins: every command line stays on the card');
  assert(B.promptSignature(t1) !== B.promptSignature(t2), 'the signature changes when only the command above a look-alike line changes');
  eq(B.readPrompt(['  Fetch latest changes', 'Do you want to proceed?', '❯ 1. Yes', '  2. No']).complete, false, 'a line that only starts with a header word is not a header');
  // A blank line or a long command can't hide the real header any more.
  const blank = B.readPrompt(['Bash command', '  rm -rf ~/work', '', '  Fetch', '  echo done', 'Do you want to proceed?', '❯ 1. Yes', '  2. No']);
  eq([blank.complete, blank.detail[0], blank.detail.includes('rm -rf ~/work')], [true, 'Bash command', true], 'a blank line inside the request: the scan goes on, and the real header and command are on the card');
  const window = B.readPrompt(['Bash command', 'rm -rf ~', 'Fetch'].concat(Array.from({ length: 10 }, (_, i) => `x${i}`), ['Do you want to proceed?', '❯ 1. Yes', '  2. No']));
  eq([window.complete, window.detail[0], window.detail[1]], [true, 'Bash command', 'rm -rf ~'], 'a long request: every line back to the real header is on the card');
  const dropped = B.readPrompt(['Fetch', 'echo done', 'Do you want to proceed?', '❯ 1. Yes', '  2. No'], { truncated: true });
  eq([dropped.complete, B.allowOnceOption(dropped)], [false, null], 'older lines were dropped: the request is incomplete, no Allow once');
  const tooMany = B.readPrompt(Array.from({ length: 41 }, (_, i) => `l${i}`).concat(['Bash command', 'ls', 'Do you want to proceed?', '❯ 1. Yes', '  2. No']));
  eq(tooMany.complete, false, 'more lines than the reader keeps: incomplete');
  const b2 = B.readPrompt(['Bash command', 'rm -rf build', 'Do you want to proceed?', '❯ 1. Yes', '2. No']);
  eq(B.allowOnceOption(perm(['Yes, and remember', 'No'])), null, 'only a plain "Yes" is Allow once ("Yes, and remember" is not)');
  assert(B.promptSignature(a) !== B.promptSignature(b2), 'two requests that differ only in their command have different signatures');
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
  const wide = B.buildTask(pane('q2', 'attention', { lines: ['Would you like to proceed?', '❯ 1. Yes, and auto-accept edits', '2. No'] }), NOW);
  eq(B.keysForAction('answer', wide, B.promptSignature(wide.prompt), 'opt-1'), { ok: false, reason: 'widening-option' }, 'a widening choice is never sent from a card');
  eq(B.keysForAction('deny', q, qs), { ok: false, reason: 'not-permission' }, 'Deny only on a permission');
  eq(B.keysForAction('allowOnce', q, qs), { ok: false, reason: 'no-allow-once-option' }, 'Allow once only on a permission');
  const w = B.buildTask(pane('w1', 'working'), NOW);
  eq(B.keysForAction('interrupt', w, ''), { ok: true, keys: '\u001b' }, 'Interrupt sends Esc to a working pane');
  eq(B.keysForAction('interrupt', perm, ''), { ok: false, reason: 'not-working' }, 'Interrupt never on a waiting pane');
  const stalledT = B.buildTask(pane('st1', 'working', { lastOutputAt: NOW - 25 * MIN }), NOW);
  eq(B.keysForAction('interrupt', stalledT, ''), { ok: true, keys: '\u001b' }, 'Interrupt works on a stalled task');
  eq(B.focusState(stalledT), 'working', 'a stalled task keeps the working layout (with Interrupt)');
  eq(B.buildTask(pane('x9', 'weird-state'), NOW).word, 'Status unknown', 'an unrecognised pane status is shown as unknown, not as queued');
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
const doc = { createElement: (tag) => new Node(tag), createElementNS: (_ns, tag) => new Node(tag) };
const byId = (root, id) => root.all((n) => n.attrs.id === id)[0] || null;
const byAttr = (root, k, v) => root.all((n) => n.attrs[k] === v);

process.stdout.write('\nDOM: mount, nodes, cards, In focus, keys reach the pane\n');
{
  const host = new Node('div');
  const sent = [];
  const opened = [];
  const logs = [];
  let clock = NOW;
  // The panes as they are "now": readPane reads this at every click, update() only when pushed.
  const live = {
    pty1: pane('pty1', 'attention', { title: 'Run tests', lines: PERMISSION_LINES, statusSince: NOW - 7 * MIN }),
    pty2: pane('pty2', 'attention', { title: 'Pick a store', lines: QUESTION_LINES }),
    pty3: pane('pty3', 'working', { title: 'Build the stage' }),
  };
  const stage = B.createBrainStage({
    doc, host, log: (l) => logs.push(l), now: () => clock, inFocus: F,
    readPane: (id) => live[id] || null,
    onKeys: (id, keys) => { sent.push([id, keys]); return Promise.resolve({ ok: true }); },
    onOpenPane: (id) => opened.push(id),
  });
  const push = () => stage.update(Object.values(live));
  const status = () => byId(host, 'makoStageFindStatus').textContent;
  const cardOf = (kind) => host.all((n) => n.tagName === 'ARTICLE' && n.attrs['data-kind'] === kind)[0];
  assert(byId(host, 'makoStage') && byId(host, 'makoConvo') && byId(host, 'makoBrainRight') && byId(host, 'makoFlowStrip'), 'stage, conversation, right panel and work-flow strip are mounted');
  assert(host.textContent.includes('No live tasks'), 'no panes: the stage says so, never an empty box');
  const send = byId(host, 'makoMessageSend');
  assert(send.disabled === true && /S51/.test(send.getAttribute('title')), 'Send is disabled with its reason until the conductor (S51)');

  push();
  eq(byAttr(host, 'data-task', 'pty3').filter((n) => n.className.includes('mk-node')).length, 1, 'one node per live pane');
  eq(byId(host, 'makoStageCounts').textContent, 'Waiting on you 2 · On agents 1 · Ready 0', 'the counts line');
  const lineKinds = byId(host, 'makoStageLines').children.map((l) => l.attrs['data-line']).sort();
  eq(lineKinds, ['needs', 'needs', 'working'], 'a line from the shark to every node that isn\'t queued');
  assert(byId(host, 'makoStageLines').children.filter((l) => l.attrs['data-line'] === 'needs').every((l) => /mk-line-waiting/.test(l.attrs.class)), 'waiting on Blue: the dashed red line');
  const permCard = cardOf('permission');
  assert(permCard && permCard.className.includes('mk-card-permission'), 'a permission prompt always shows as a red card');
  assert(permCard && permCard.textContent.includes(F.PERMISSION_LINE), 'with "Mako never answers this for you"');
  assert(permCard && permCard.textContent.includes('npm test'), 'and the command it would allow, as plain text');
  const allow = permCard.all((n) => n.attrs['data-action'] === 'allowOnce')[0];
  allow.click();
  await_(() => {
    eq(sent, [['pty1', '1']], 'Allow once on the card reaches the pane as "1"');
    assert(/^Key sent to Run tests; check that it moved on/.test(status()), 'the notice says the key was sent, not that the pane moved on');
    allow.click();
  }, () => {
    eq(sent.length, 1, 'a second click on the same prompt sends nothing');
    assert(/^Not sent: already-answered/.test(status()), 'and says it was already answered');
    const qCard = cardOf('question');
    assert(qCard.all((n) => n.attrs['data-answer']).every((b) => !/mk-btn-primary/.test(b.className)), 'no question answer is styled as Mako\'s recommendation');
    qCard.all((n) => n.attrs['data-answer'] === 'opt-2')[0].click();
  }, () => {
    eq(sent[1], ['pty2', '2'], 'a question card answer reaches the pane as its digit');
    cardOf('question').all((n) => n.attrs['data-action'] === 'openPane')[0].click();
    eq(opened, ['pty2'], 'Open pane opens that pane');

    // The pane moves on to another permission request; the stage hasn't refreshed yet.
    live.pty1 = pane('pty1', 'attention', { title: 'Run tests', statusSince: NOW - 2 * MIN, lines: PERMISSION_LINES.map((l) => l.replace(/npm test/g, 'rm -rf build')) });
    cardOf('permission').all((n) => n.attrs['data-action'] === 'allowOnce')[0].click();
  }, () => {
    eq(sent.length, 2, 'a stale card\'s Allow once sends nothing: the click is checked against the pane now');
    assert(/^Not sent: prompt-changed/.test(status()), 'and says the prompt changed');
    push();
    assert(cardOf('permission').textContent.includes('rm -rf build'), 'after the refresh the card shows the new command');
    // Node click opens In focus with the permission layout and wired buttons.
    host.all((n) => n.className.includes('mk-node') && n.attrs['data-task'] === 'pty1')[0].click();
    const card = byId(host, 'makoBrainRight').children[0];
    eq(card && card.getAttribute('data-state'), 'permission', 'a click on a node opens the In-focus card in its state');
    const deny = card.all((n) => n.attrs['data-action'] === 'deny')[0];
    assert(deny && deny.disabled === false, 'Deny is wired on the In-focus card');
    deny.click();
  }, () => {
    eq(sent[2], ['pty1', '\u001b'], 'Deny on the In-focus card reaches the pane as Esc');

    // Back to Right now
    const card = byId(host, 'makoBrainRight').children[0];
    card.all((n) => n.attrs['data-action'] === 'backToRightNow')[0].click();
    assert(byId(host, 'makoRightNow') !== null, 'Back to Right now shows the counts');

    // Ctrl+F finds a node and focuses it.
    eq(stage.find('store'), ['pty2'], 'Ctrl+F finds a node by title');
    eq(stage.state().focusId, 'pty2', 'and puts it in focus');
    eq(stage.find('proceed'), ['pty1'], 'and by content (the question on screen)');
    assert(/^No task matches/.test((stage.find('zzz'), status())), 'no match says so');

    // Pause freezes the view, not the agents, and its cards send nothing.
    byId(host, 'makoStagePause').click();
    live.pty2 = pane('pty2', 'attention', { title: 'Pick a store', lines: QUESTION_LINES, statusSince: NOW - MIN });
    cardOf('question').all((n) => n.attrs['data-answer'] === 'opt-1')[0].click();
  }, () => {
    eq(sent.length, 3, 'paused: a card click sends nothing');
    assert(/^Not sent: view-paused/.test(status()), 'and says the view is paused');
    clock = NOW + 5 * 60000;
    const applied = stage.update([live.pty3]);
    eq(applied, false, 'paused: the view does not take updates');
    assert(/^Paused · last updated /.test(byId(host, 'makoStageLive').textContent), 'the live line says Paused with the last update time');
    eq(stage.state().tasks.length, 3, 'the frozen view keeps its nodes');
    byId(host, 'makoStagePause').click();
    stage.update([live.pty3]);
    eq(stage.state().tasks.length, 1, 'resumed: the closed panes leave the stage');
    eq(stage.find('store'), ['pty2'], 'a closed pane is still found by Ctrl+F (nothing disappears)');
    assert(/finished: /.test(byId(host, 'makoConvoCards').textContent), 'finished work is batched into one line');

    // Waiting on Blue with no menu Mako can read: a card that says so, with only Open pane.
    stage.update([pane('u1', 'attention', { title: 'Odd menu', lines: ['Pick one', '❯ 2. B', '  3. C'] })]);
    const odd = cardOf('unreadable');
    assert(odd && /prompt-unreadable/.test(odd.textContent), 'an unreadable menu gets a card that says so');
    eq(odd && odd.all((n) => n.tagName === 'BUTTON').map((b) => b.attrs['data-action']), ['openPane'], 'with Open pane only');
    // Pane status not reporting: the stage says why nobody shows as waiting.
    stage.update([pane('k1', 'unknown'), pane('k2', 'unknown')]);
    assert(byId(host, 'makoStatusNote') !== null, 'every pane unknown: a note says pane status isn\'t reporting');
    // A menu with a widening choice: shown as text, never a button.
    stage.update([pane('w1', 'attention', { title: 'Plan', lines: ['Would you like to proceed?', '❯ 1. Yes, and auto-accept edits', '  2. Yes, and manually approve edits', '  3. No, keep planning'] })]);
    const wq = cardOf('question');
    eq(wq.all((n) => n.attrs['data-answer']).map((b) => b.attrs['data-answer']), ['opt-2', 'opt-3'], 'the widening choice has no button');
    assert(wq.all((n) => n.attrs['data-widening'] === 'opt-1').length === 1, 'it is shown as text, to pick in the pane');

    // A request too long to show whole: the card says so and has no Allow once.
    stage.update([pane('l1', 'attention', { title: 'Long', linesTruncated: true, lines: ['  step 9', '  step 10', 'Do you want to proceed?', '❯ 1. Yes', '  2. No'] })]);
    const lc = cardOf('permission');
    assert(lc && lc.all((n) => n.attrs['data-incomplete'] === 'true').length === 1, 'a cut-off request: the card says it can\'t show the whole request');
    assert(lc && lc.all((n) => n.attrs['data-action'] === 'allowOnce')[0].disabled === true, 'and Allow once is disabled');

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
