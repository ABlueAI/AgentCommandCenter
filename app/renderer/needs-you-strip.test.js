'use strict';
// Run: node app/renderer/needs-you-strip.test.js
// S19: the control room's "Needs you" strip and jump key (a small DOM stub, no jsdom dependency).

const N = require('./needs-you-strip');

let passed = 0, failed = 0;
function assert(condition, label) {
  if (condition) { process.stdout.write(`  ✓ ${label}\n`); passed += 1; }
  else { process.stderr.write(`  ✗ FAIL: ${label}\n`); failed += 1; }
}
const eq = (a, b, label) => assert(JSON.stringify(a) === JSON.stringify(b), `${label} (got ${JSON.stringify(a)})`);

process.stdout.write('\nthe jump key\n');
assert(N.isJumpKey({ key: 'F8' }), 'F8 is the jump key');
assert(N.isJumpKey({ code: 'F8', key: 'Unidentified' }), 'F8 by code too');
assert(!N.isJumpKey({ key: 'F8', ctrlKey: true }), 'Ctrl F8 is not');
assert(!N.isJumpKey({ key: 'F8', shiftKey: true }), 'Shift F8 is not');
assert(!N.isJumpKey({ key: 'F8', altKey: true }), 'Alt F8 is not');
assert(!N.isJumpKey({ key: 'j', ctrlKey: true }), 'Ctrl J (a newline in Claude Code) is not');
assert(!N.isJumpKey(null), 'no event is not');

process.stdout.write('\nwaiting time\n');
eq(N.waitedText(0, 30000), 'just now', 'under a minute');
eq(N.waitedText(0, 60000), '1 min', 'one minute');
eq(N.waitedText(0, 59 * 60000), '59 min', '59 minutes');
eq(N.waitedText(0, 60 * 60000), '1 h', 'one hour');
eq(N.waitedText(0, 125 * 60000), '2 h 5 min', 'hours and minutes');
eq(N.waitedText(100000, 0), 'just now', 'a clock going backwards is never negative');
eq(N.waitedText(NaN, 0), 'just now', 'a bad time is never NaN');

process.stdout.write('\nlabels\n');
eq(N.cleanLabel('Builder · s19', 'pty1'), 'Builder · s19', 'a label is kept');
eq(N.cleanLabel('', 'pty1'), 'pty1', 'no label falls back to the pane id');
eq(N.cleanLabel('a\u001b[31mb\n', 'pty1'), 'a [31mb', 'control characters become spaces');
eq(N.cleanLabel('x'.repeat(200), 'pty1').length, 60, 'a long label is cut to 60 characters');

process.stdout.write('\nthe strip\n');
class Node {
  constructor(tag) { this.tagName = tag.toUpperCase(); this.children = []; this.attrs = {}; this.className = ''; this._text = ''; this.listeners = {}; this.hidden = false; }
  set textContent(v) { this._text = String(v); this.children = []; }
  get textContent() { return this._text + this.children.map((c) => c.textContent).join(''); }
  set innerHTML(_v) { throw new Error('innerHTML used'); }
  get firstChild() { return this.children[0] || null; }
  appendChild(c) { this.children.push(c); return c; }
  removeChild(c) { this.children = this.children.filter((x) => x !== c); return c; }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  getAttribute(k) { return Object.prototype.hasOwnProperty.call(this.attrs, k) ? this.attrs[k] : null; }
  addEventListener(type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); }
  click() { for (const fn of this.listeners.click || []) fn(); }
  all(pred, out) { out = out || []; for (const c of this.children) { if (pred(c)) out.push(c); c.all(pred, out); } return out; }
}
const doc = { createElement: (tag) => new Node(tag) };
const host = new Node('div');
let clock = 1000000;
const focused = [];
const logs = [];
const labels = { pty1: 'Builder · alpha', pty2: '<img src=x onerror=alert(1)>', pty3: 'Reviewer' };
const strip = N.createNeedsYouStrip({
  doc, host, now: () => clock, log: (l) => logs.push(l),
  getLabel: (id) => labels[id],
  onFocus: (id) => { focused.push(id); if (id === 'pty-gone') return false; if (id === 'pty-throw') throw new Error('boom'); return true; },
});
const chips = () => host.all((n) => n.tagName === 'BUTTON');

eq([host.getAttribute('role'), host.getAttribute('aria-label')], ['region', 'Needs you'], 'the strip is a labelled region');
assert(host.hidden === true, 'hidden while nothing waits');
assert(strip.update({ paneId: 'pty1', state: 'attention' }) === true, 'a pane that needs you is added');
assert(host.hidden === false, 'the strip shows');
clock += 5 * 60000;
strip.update({ paneId: 'pty2', state: 'attention' });
clock += 2 * 60000;
strip.render();
eq(chips().map((b) => b.getAttribute('data-pane-id')), ['pty1', 'pty2'], 'one chip per waiting pane, oldest first');
eq(chips()[0].getAttribute('aria-label'), 'Builder · alpha, waiting 7 min. Focus this pane', 'the chip says which pane and how long, in words');
eq(chips()[1].all((n) => n.className === 'mk-needs-label')[0].textContent, '<img src=x onerror=alert(1)>', 'a hostile label is text, never markup');
assert(host.textContent.includes('Needs you (2)'), 'the title counts the waiting panes');
assert(strip.update({ paneId: 'pty1', state: 'attention' }) === false, 'a repeated view changes nothing');
clock += 60000;
strip.render();
assert(chips()[0].textContent.includes('8 min'), 'a repeat keeps the first time');
strip.update({ paneId: 'pty1', state: 'working' });
eq(strip.waiting(), ['pty2'], 'a pane that is working again leaves the strip');
strip.update({ paneId: 'pty2', state: 'unknown', reason: 'stale' });
eq(strip.waiting(), [], 'an unknown state ends the wait too (the badge says why)');
assert(host.hidden === true, 'the strip hides again');
assert(strip.update({}) === false && strip.update(null) === false && strip.update({ paneId: 7, state: 'attention' }) === false, 'a malformed view is ignored');

process.stdout.write('\nfocus and the jump key\n');
strip.update({ paneId: 'pty1', state: 'attention' });
clock += 1000;
strip.update({ paneId: 'pty2', state: 'attention' });
clock += 1000;
strip.update({ paneId: 'pty3', state: 'attention' });
chips()[1].click();
eq(focused, ['pty2'], 'a click focuses that pane');
focused.length = 0;
eq([strip.jumpNext(), strip.jumpNext(), strip.jumpNext()], ['pty3', 'pty1', 'pty2'], 'the jump key goes on from the last pane and wraps, oldest first');
strip.remove('pty2');
eq(strip.jumpNext(), 'pty1', 'a removed pane drops out of the cycle');
assert(strip.remove('pty-none') === false, 'removing a pane that is not waiting changes nothing');
strip.remove('pty1'); strip.remove('pty3');
eq(strip.jumpNext(), null, 'nothing waiting: the jump does nothing');
assert(logs.some((l) => l.includes('nothing is waiting')), 'and says so in the log');
strip.update({ paneId: 'pty-gone', state: 'attention' });
strip.jumpNext();
assert(logs.some((l) => l.includes('pty-gone') && l.includes('focus-failed')), 'a pane that cannot be focused is logged, never silent');
strip.remove('pty-gone');
strip.update({ paneId: 'pty-throw', state: 'attention' });
let threwOut = false;
try { strip.jumpNext(); } catch { threwOut = true; }
assert(!threwOut && logs.some((l) => l.includes('pty-throw') && l.includes('focus-failed')), 'a focus that throws is logged and contained');
strip.remove('pty-throw');

process.stdout.write('\nlimits and refusals\n');
for (let i = 0; i < 40; i += 1) strip.update({ paneId: `p${i}`, state: 'attention' });
eq(chips().length, N.MAX_CHIPS, `at most ${N.MAX_CHIPS} chips`);
assert(host.textContent.includes('and 8 more'), 'the rest are counted');
let threw = 0;
try { N.createNeedsYouStrip({ doc, host: null, onFocus: () => true }); } catch { threw += 1; }
try { N.createNeedsYouStrip({ doc, host: new Node('div') }); } catch { threw += 1; }
eq(threw, 2, 'a missing host or focus handler is refused');

process.stdout.write(`\nneeds-you-strip: ${passed} passed, ${failed} failed\n`);
if (failed) process.exit(1);
