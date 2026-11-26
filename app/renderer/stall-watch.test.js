'use strict';
// Run: node app/renderer/stall-watch.test.js
// S19: the stall watch in the pane header (a small DOM stub, no jsdom dependency).

const W = require('./stall-watch');

let passed = 0, failed = 0;
function assert(condition, label) {
  if (condition) { process.stdout.write(`  ✓ ${label}\n`); passed += 1; }
  else { process.stderr.write(`  ✗ FAIL: ${label}\n`); failed += 1; }
}
const eq = (a, b, label) => assert(JSON.stringify(a) === JSON.stringify(b), `${label} (got ${JSON.stringify(a)})`);
const MIN = 60000;

process.stdout.write('\nusage stop\n');
const now = Date.UTC(2026, 10, 26, 12, 0);
eq(W.usageResetMs(null, now), null, 'no usage figures: no usage stop');
eq(W.usageResetMs({ fiveHour: { usedPercentage: 99, resetsAt: now / 1000 + 600 } }, now), null, '99% is not a stop');
eq(W.usageResetMs({ fiveHour: { usedPercentage: 100, resetsAt: now / 1000 + 600 } }, now), now + 600000, '100% with a reset ahead is a stop');
eq(W.usageResetMs({ fiveHour: { usedPercentage: 100, resetsAt: now / 1000 - 1 } }, now), null, 'a window that has reset is not');
eq(W.usageResetMs({ fiveHour: { usedPercentage: 100, resetsAt: now / 1000 + 600 }, sevenDay: { usedPercentage: 101, resetsAt: now / 1000 + 9000 } }, now), now + 9000000, 'both full: the later reset');
eq(W.usageResetMs({ fiveHour: { usedPercentage: '100', resetsAt: 'soon' } }, now), null, 'malformed figures are ignored');
assert(/^\d\d:\d\d$/.test(W.hhmm(now)), 'the reset time is hh:mm');

process.stdout.write('\nclassify\n');
eq(W.classify({ state: 'working', lastOutputMs: now - 19 * MIN }, now, null), null, '19 minutes of silence is not stalled');
eq(W.classify({ state: 'working', lastOutputMs: now - 20 * MIN }, now, null), { kind: 'stalled', text: 'stalled · 20 min silent' }, '20 minutes of silence while working is stalled');
eq(W.classify({ state: 'attention', lastOutputMs: now - 60 * MIN }, now, null), null, 'a pane waiting on Blue is never stalled');
eq(W.classify({ state: 'idle', lastOutputMs: now - 60 * MIN }, now, null), null, 'nor is an idle one');
eq(W.classify({ state: 'failed', lastOutputMs: now, failedTries: 5 }, now, null), { kind: 'stalled', text: 'stalled · 5 failed tries' }, '5 failed tries is stalled');
eq(W.classify({ state: 'failed', lastOutputMs: now, failedTries: 4 }, now, null), null, '4 is not');
const reset = now + 30 * MIN;
const usage = W.classify({ state: 'working', lastOutputMs: now - 25 * MIN, failedTries: 9 }, now, reset);
eq(usage && usage.kind, 'usage-wait', 'a usage stop is never called stalled, even after 25 minutes and 9 failures');
assert(usage && usage.text === `waiting for reset at ${W.hhmm(reset)}`, 'it says when the reset is');
eq(W.classify({ state: 'failed', lastOutputMs: now, failedTries: 1 }, now, reset).kind, 'usage-wait', 'a failed turn during a usage stop waits for the reset');
eq(W.classify({ state: 'working', lastOutputMs: now - 30000 }, now, reset), null, 'a pane still printing during a usage stop shows nothing');
eq(W.classify({ state: null }, now, null), null, 'a pane with no status shows nothing');

process.stdout.write('\nthe watch\n');
class Node {
  constructor(tag, cls) { this.tagName = tag.toUpperCase(); this.children = []; this.attrs = {}; this.className = cls || ''; this._text = ''; this.parent = null; }
  set textContent(v) { this._text = String(v); this.children = []; }
  get textContent() { return this._text + this.children.map((c) => c.textContent).join(''); }
  set innerHTML(_v) { throw new Error('innerHTML used'); }
  appendChild(c) { c.parent = this; this.children.push(c); return c; }
  insertBefore(c, ref) { c.parent = this; const i = this.children.indexOf(ref); this.children.splice(i < 0 ? this.children.length : i, 0, c); return c; }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter((x) => x !== this); this.parent = null; }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  getAttribute(k) { return Object.prototype.hasOwnProperty.call(this.attrs, k) ? this.attrs[k] : null; }
  querySelector(sel) { const cls = sel.slice(1); for (const c of this.children) { if (c.className.split(' ').includes(cls)) return c; } return null; }
}
const doc = { createElement: (tag) => new Node(tag) };
const head = new Node('div', 'term-head');
head.appendChild(new Node('span', 'name'));
head.appendChild(new Node('button', 'copy-out'));
let clock = now;
const logs = [];
const w = W.createStallWatch({ doc, now: () => clock, log: (l) => logs.push(l), getHead: (id) => (id === 'pty1' ? head : id === 'pty-boom' ? (() => { throw new Error('x'); })() : null) });
w.noteView({ paneId: 'pty1', state: 'working' });
clock += 3 * MIN;
assert(w.noteView({ paneId: 'pty1', state: 'unknown', reason: 'stale' }) === false, 'a status that aged out keeps the pane working for the stall watch');
clock += 18 * MIN;
eq(w.tick().get('pty1'), { kind: 'stalled', text: 'stalled · 21 min silent' }, 'silence counts from when it started working');
const tag = head.querySelector('.stall-tag');
assert(tag && tag.textContent === 'stalled · 21 min silent' && tag.getAttribute('data-stall') === 'stalled', 'the header shows it');
eq(head.children.map((c) => c.className.split(' ')[0]), ['name', 'stall-tag', 'copy-out'], 'after the pane name, before the buttons');
w.noteOutput('pty1');
w.tick();
assert(head.querySelector('.stall-tag') === null, 'new output clears it');
for (let i = 0; i < 5; i += 1) { w.noteView({ paneId: 'pty1', state: 'failed' }); w.noteView({ paneId: 'pty1', state: 'working' }); }
eq(w.tick().get('pty1').text, 'stalled · 5 failed tries', 'five failed turns in a row: stalled');
w.noteView({ paneId: 'pty1', state: 'turn ended' });
w.noteView({ paneId: 'pty1', state: 'working' });
eq(w.tick().get('pty1'), null, 'a normal turn end resets the count');
w.setUsage({ ok: true, fiveHour: { usedPercentage: 100, resetsAt: (clock + 40 * MIN) / 1000 } });
clock += 2 * MIN;
eq(w.tick().get('pty1').kind, 'usage-wait', 'a usage stop shows "waiting for reset"');
assert(head.querySelector('.stall-tag').textContent.startsWith('waiting for reset at '), 'in the header');
w.setUsage({ ok: false, reason: 'usage-read-failed' });
clock += 30 * MIN;
eq(w.tick().get('pty1').kind, 'stalled', 'a failed usage read is not taken for a usage stop');
w.forget('pty1');
assert(!w.tick().has('pty1'), 'a closed pane is forgotten');
w.noteView({ paneId: 'pty-boom', state: 'working' });
clock += 25 * MIN;
w.tick(); w.tick();
eq(logs.filter((l) => l.includes('paint-failed')).length, 1, 'a header that cannot be painted is logged once, never thrown');
assert(!w.noteView({ paneId: 'x' }) && !w.noteView(null), 'a malformed view is ignored');
let threw = false;
try { W.createStallWatch({ doc }); } catch { threw = true; }
assert(threw, 'a missing header lookup is refused');

process.stdout.write(`\nstall-watch: ${passed} passed, ${failed} failed\n`);
if (failed) process.exit(1);
