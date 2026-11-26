'use strict';
// Run: node app/renderer/control-focus.test.js
// S19: the control room's right panel, with S66's real In-focus card (a small DOM stub).

const F = require('./control-focus');
const Card = require('./in-focus-card');

let passed = 0, failed = 0;
function assert(condition, label) {
  if (condition) { process.stdout.write(`  ✓ ${label}\n`); passed += 1; }
  else { process.stderr.write(`  ✗ FAIL: ${label}\n`); failed += 1; }
}
const eq = (a, b, label) => assert(JSON.stringify(a) === JSON.stringify(b), `${label} (got ${JSON.stringify(a)})`);

process.stdout.write('\ncard states\n');
eq([F.cardState('attention'), F.cardState('working'), F.cardState('turn ended')], ['question', 'working', 'finished'], 'needs you, working and turn ended have cards');
eq([F.cardState('idle'), F.cardState('unknown'), F.cardState('failed'), F.cardState('toString')], [null, null, null, null], 'the rest get the properties list');

class Node {
  constructor(tag) { this.tagName = tag.toUpperCase(); this.children = []; this.attrs = {}; this.className = ''; this._text = ''; this.listeners = {}; this.disabled = false; }
  set textContent(v) { this._text = String(v); this.children = []; }
  get textContent() { return this._text + this.children.map((c) => c.textContent).join(''); }
  set innerHTML(_v) { throw new Error('innerHTML used'); }
  get firstChild() { return this.children[0] || null; }
  appendChild(c) { this.children.push(c); return c; }
  removeChild(c) { this.children = this.children.filter((x) => x !== c); return c; }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  getAttribute(k) { return Object.prototype.hasOwnProperty.call(this.attrs, k) ? this.attrs[k] : null; }
  addEventListener(type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); }
  click() { if (!this.disabled) for (const fn of this.listeners.click || []) fn(); }
  all(pred, out) { out = out || []; for (const c of this.children) { if (pred(c)) out.push(c); c.all(pred, out); } return out; }
}
const doc = { createElement: (tag) => new Node(tag) };
const host = new Node('aside');
const writes = [], focused = [], logs = [];
const panes = { pty1: { title: 'Builder · s19', branch: 'agent/s19', authority: 'Medium', role: 'Builder' }, pty2: { title: '<img src=x>', branch: '', authority: '', role: '' } };
let cardThrows = false;
const f = F.createControlFocus({
  doc, host, log: (l) => logs.push(l),
  buildCard: (d, task, hs) => { if (cardThrows) throw new Error('x'); return Card.buildInFocusCard(d, task, hs); },
  getPane: (id) => panes[id] || null,
  focusPane: (id) => { focused.push(id); return id !== 'pty2'; },
  write: (id, data) => writes.push([id, data]),
});
const btn = (action) => host.all((n) => n.getAttribute('data-action') === action)[0];

process.stdout.write('\nthe panel\n');
assert(host.textContent.includes('Select a pane'), 'nothing selected: it says how to fill it');
eq(host.getAttribute('aria-label'), 'In focus', 'a labelled panel');
f.select('pty1');
assert(host.textContent.includes('Selected pane') && host.textContent.includes('no status'), 'no status yet: the properties list');
f.noteView({ paneId: 'pty1', state: 'working' });
const card = host.all((n) => n.getAttribute('data-state') !== null)[0];
eq(card && card.getAttribute('data-state'), 'working', 'working: the In-focus card in its working state');
assert(host.textContent.includes('Builder · s19') && host.textContent.includes('agent/s19'), 'with the pane\'s title and branch');
btn('interrupt').click();
eq(writes, [['pty1', '\u001b']], 'Interrupt sends one Esc to that pane only');
assert(logs.some((l) => l.includes('Esc sent to pty1') && l.includes('nothing killed')), 'and logs it');
btn('openPane').click();
eq(focused, ['pty1'], 'Open pane focuses it');
assert(btn('peek').disabled === true && btn('pause').disabled === true, 'actions S19 does not wire stay disabled');
assert(/S19/.test(btn('peek').getAttribute('title')), 'with the card\'s reason');
f.noteView({ paneId: 'pty1', state: 'attention' });
eq(host.all((n) => n.getAttribute('data-state') !== null)[0].getAttribute('data-state'), 'question', 'needs you: the question card');
assert(!btn('interrupt'), 'which has no Interrupt');
f.noteView({ paneId: 'pty1', state: 'turn ended' });
eq(host.all((n) => n.getAttribute('data-state') !== null)[0].getAttribute('data-state'), 'finished', 'turn ended: the finished card');

process.stdout.write('\nrefusals\n');
f.noteView({ paneId: 'pty1', state: 'working' });
const staleInterrupt = btn('interrupt');
f.noteView({ paneId: 'pty1', state: 'attention' });
writes.length = 0;
staleInterrupt.click();
eq(writes, [], 'an Interrupt button left from the working card does nothing once the pane waits on you');
assert(logs.some((l) => l.includes('refused to interrupt pty1') && l.includes('not-working')), 'and says so');
f.select('pty2');
f.noteView({ paneId: 'pty2', state: 'idle' });
eq(host.all((n) => n.tagName === 'H3')[0].textContent, '<img src=x>', 'a hostile title is text, never markup');
btn('openPane').click();
assert(logs.some((l) => l.includes('could not open pty2')), 'a pane that cannot be focused is logged');
cardThrows = true;
f.noteView({ paneId: 'pty2', state: 'working' });
assert(host.textContent.includes('Selected pane') && logs.some((l) => l.includes('card-failed')), 'a card that cannot be drawn falls back to the properties, visibly');
cardThrows = false;
f.forget('pty2');
eq(f.selected(), null, 'closing the selected pane clears the panel');
assert(host.textContent.includes('Select a pane'), 'back to the empty line');
f.select('pty-gone');
eq(f.selected(), null, 'a pane that no longer exists is not shown');
assert(!f.select('') && !f.noteView(null), 'malformed input is ignored');
let threw = 0;
for (const bad of [{ doc, host: null }, { doc, host: new Node('aside'), buildCard: () => {}, getPane: () => null, focusPane: () => true }]) {
  try { F.createControlFocus(bad); } catch { threw += 1; }
}
eq(threw, 2, 'a missing host or write is refused');

process.stdout.write(`\ncontrol-focus: ${passed} passed, ${failed} failed\n`);
if (failed) process.exit(1);
