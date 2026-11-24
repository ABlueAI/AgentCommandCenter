'use strict';
// Run: node app/renderer/in-focus-card.test.js
// S66: the shared In-focus card's four state layouts (docs/DESIGN-BRIEF-1.1.md 4.4), against a small
// DOM stub (no jsdom dependency), in the agent-dom.test.js style.

const C = require('./in-focus-card');

let passed = 0, failed = 0;
function assert(condition, label) {
  if (condition) { process.stdout.write(`  ✓ ${label}\n`); passed += 1; }
  else { process.stderr.write(`  ✗ FAIL: ${label}\n`); failed += 1; }
}
const eq = (a, b, label) => assert(JSON.stringify(a) === JSON.stringify(b), `${label} (got ${JSON.stringify(a)})`);

// A DOM stub that records only what the card may use: no innerHTML, so any use of it shows up.
class Node {
  constructor(tag) { this.tagName = tag.toUpperCase(); this.children = []; this.attrs = {}; this.className = ''; this._text = ''; this.listeners = {}; this.disabled = false; }
  set textContent(v) { this._text = String(v); this.children = []; }
  get textContent() { return this._text + this.children.map((c) => c.textContent).join(''); }
  set innerHTML(_v) { throw new Error('innerHTML used'); }
  appendChild(c) { this.children.push(c); return c; }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  getAttribute(k) { return Object.prototype.hasOwnProperty.call(this.attrs, k) ? this.attrs[k] : null; }
  addEventListener(type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); }
  click() { if (!this.disabled) for (const fn of this.listeners.click || []) fn(); }
  all(pred, out) { out = out || []; for (const c of this.children) { if (pred(c)) out.push(c); c.all(pred, out); } return out; }
}
const doc = { createElement: (tag) => new Node(tag) };
const buttons = (card) => card.all((n) => n.tagName === 'BUTTON');
const labels = (card) => buttons(card).map((b) => b.textContent);

const base = { title: 'Review #174', heldBy: 'reviewer', repo: 'AgentCommandCenter', role: 'Reviewer', model: 'Opus', authority: 'Medium', branch: 'claude/s66', elapsed: '6 min', latest: 'asks adapter or port' };

process.stdout.write('\nquestion: its answers, Ask why, Snooze, Open pane, the recommended answer primary\n');
const calls = [];
const q = C.buildInFocusCard(doc, Object.assign({ state: 'question', answers: [{ id: 'adapter', label: 'Adapter', recommended: true }, { id: 'port', label: 'Port' }] }, base), {
  answer: (task, id) => calls.push(['answer', id]), openPane: () => calls.push(['openPane']),
});
eq(labels(q), ['Adapter', 'Port', 'Ask why', 'Snooze', 'Open pane', 'Open agent page', 'Terminal', 'Back to Right now'], 'question buttons in order');
assert(buttons(q)[0].className.includes('mk-btn-primary') && !buttons(q)[1].className.includes('mk-btn-primary'), 'the recommended answer is the primary button');
buttons(q)[1].click();
buttons(q)[4].click();
eq(calls, [['answer', 'port'], ['openPane']], 'wired buttons call their handler with the answer id');
const askWhy = buttons(q)[2];
assert(askWhy.disabled === true && askWhy.getAttribute('title') === C.NOT_WIRED, 'an unwired button is disabled and says why');
askWhy.click();
eq(calls.length, 2, 'a disabled button does nothing');
eq(q.getAttribute('data-state'), 'question', 'the card carries its state');
assert(q.textContent.includes('Needs you'), 'the chip says "Needs you" in words');

process.stdout.write('\npermission: a red card, Allow once, Deny, Open pane, and the line\n');
const p = C.buildInFocusCard(doc, Object.assign({ state: 'permission' }, base), {});
assert(p.className.includes('mk-card-permission'), 'permission uses the red card variant');
eq(labels(p).slice(0, 3), ['Allow once', 'Deny', 'Open pane'], 'permission buttons');
assert(p.textContent.includes(C.PERMISSION_LINE), '"Mako never answers this for you. Your click is the answer."');
assert(p.textContent.includes('Permission'), 'the chip says "Permission" in words');

process.stdout.write('\nworking and finished\n');
const w = C.buildInFocusCard(doc, Object.assign({ state: 'working' }, base), {});
eq(labels(w).slice(0, 5), ['Peek', 'Ask Mako', 'Open pane', 'Pause', 'Interrupt (Esc)'], 'working buttons');
const f = C.buildInFocusCard(doc, Object.assign({ state: 'finished', verdict: 'READY TO MERGE' }, base), {});
eq(labels(f).slice(0, 3), ['Open PR', 'What next?', 'Archive'], 'finished buttons');
assert(f.all((n) => n.className === 'mk-verdict mk-verdict-ready').length === 1, 'the READY TO MERGE line is shown');
const nf = C.buildInFocusCard(doc, Object.assign({ state: 'finished', verdict: 'NOT READY: waiting for Codex\'s pass' }, base), {});
assert(nf.all((n) => n.className === 'mk-verdict').length === 1, 'a NOT READY line is shown without the ready style');

process.stdout.write('\nproperties, untrusted text and refusals\n');
const names = q.all((n) => n.tagName === 'DT').map((n) => n.textContent);
eq(names, ['Held by', 'Repo', 'Role', 'Model', 'Authority', 'Branch', 'Elapsed', 'Latest'], 'the properties in the brief\'s order');
const hostile = C.buildInFocusCard(doc, { state: 'working', title: '<img src=x onerror=alert(1)>', branch: 'a'.repeat(500) }, {});
assert(hostile.textContent.includes('<img src=x onerror=alert(1)>'), 'a hostile title stays inert text (no innerHTML anywhere)');
const branchDd = hostile.all((n) => n.tagName === 'DD')[5];
assert(branchDd.textContent.length === 300 && branchDd.textContent.endsWith('…'), 'a long value is cut to 300 characters');
assert(hostile.all((n) => n.tagName === 'DD')[0].textContent === '–', 'a missing value shows a dash, not an empty cell');
let threw = false;
try { C.buildInFocusCard(doc, { state: 'stalled' }, {}); } catch { threw = true; }
assert(threw, 'an unknown state is refused, not drawn as another state');
const many = C.buildInFocusCard(doc, { state: 'question', answers: Array.from({ length: 9 }, (_, i) => ({ id: `a${i}`, label: `A${i}` })) }, {});
eq(buttons(many).filter((b) => b.getAttribute('data-action') === 'answer').length, 6, 'at most 6 answer buttons');

process.stdout.write(`\nin-focus-card: ${passed} passed, ${failed} failed\n`);
if (failed) process.exit(1);
