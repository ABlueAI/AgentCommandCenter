'use strict';
// Run: node app/renderer/emblem-rail.test.js
// S66: the repo emblem rail's colour slot, letter and DOM (a small DOM stub, no jsdom dependency).

const E = require('./emblem-rail');

let passed = 0, failed = 0;
function assert(condition, label) {
  if (condition) { process.stdout.write(`  ✓ ${label}\n`); passed += 1; }
  else { process.stderr.write(`  ✗ FAIL: ${label}\n`); failed += 1; }
}
const eq = (a, b, label) => assert(JSON.stringify(a) === JSON.stringify(b), `${label} (got ${JSON.stringify(a)})`);

process.stdout.write('\ncolour slot and letter\n');
eq(E.colourSlot('AgentCommandCenter'), E.colourSlot('AgentCommandCenter'), 'the same repo always gets the same slot');
const slots = new Set(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l'].map(E.colourSlot));
assert([...slots].every((s) => s >= 1 && s <= 8), 'slots are 1 to 8');
assert(slots.size >= 4, `different repos spread over the slots (${slots.size} slots for 12 names)`);
eq(E.emblemLetter('agentCommandCenter'), 'A', 'the first letter, upper-cased');
eq(E.emblemLetter('_2026-notes'), '2', 'a leading symbol is skipped');
eq(E.emblemLetter('ölkartan'), 'Ö', 'a non-English letter works');
eq(E.emblemLetter('---'), '?', 'no letter or digit gives "?"');
eq(E.emblemLetter(''), '?', 'an empty name gives "?"');

process.stdout.write('\nthe rail\n');
class Node {
  constructor(tag) { this.tagName = tag.toUpperCase(); this.children = []; this.attrs = {}; this.className = ''; this._text = ''; this.listeners = {}; this.type = ''; }
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
const host = new Node('nav');
const picked = [];
const logs = [];
const rail = E.createEmblemRail({ doc, host, onSelect: (v) => { picked.push(v); if (v === 'boom') throw new Error('x'); }, log: (l) => logs.push(l) });
eq([host.getAttribute('role'), host.getAttribute('aria-label')], ['navigation', 'Repos'], 'the rail is a labelled navigation region');
rail.render([{ value: 'D:\\W\\alpha', name: 'alpha' }, { value: 'D:\\W\\<img src=x>', name: '<img src=x>' }, { value: 'boom', name: 'boom' }], 'D:\\W\\alpha');
const btns = host.all((n) => n.tagName === 'BUTTON');
eq(btns.map((b) => b.textContent), ['A', 'I', 'B'], 'one emblem per repo, with its letter');
eq(btns.map((b) => b.getAttribute('aria-current')), ['true', 'false', 'false'], 'the repo in use is marked current');
eq(btns[1].getAttribute('aria-label'), '<img src=x>', 'a hostile repo name is an attribute value, never markup');
assert(btns[0].className === `mk-emblem mk-emblem-${E.colourSlot('alpha')}`, 'the emblem uses its colour slot class');
btns[1].click();
eq(picked, ['D:\\W\\<img src=x>'], 'a click selects that repo');
btns[2].click();
assert(logs.some((l) => l.includes('select-failed')), 'a failing select is logged with a bounded reason');
rail.setNeedsYou('D:\\W\\alpha', true);
const again = host.all((n) => n.tagName === 'BUTTON');
assert(again[0].all((n) => n.className === 'mk-emblem-dot').length === 1, 'a repo that needs you gets the red dot');
eq(again[0].getAttribute('aria-label'), 'alpha, needs you', 'and says so in words');
rail.setNeedsYou('D:\\W\\alpha', false);
assert(host.all((n) => n.className === 'mk-emblem-dot').length === 0, 'the dot clears');
rail.render(Array.from({ length: 100 }, (_, i) => ({ value: `r${i}`, name: `r${i}` })), '');
eq(host.all((n) => n.tagName === 'BUTTON').length, 64, 'at most 64 emblems');
let threw = false;
try { E.createEmblemRail({ doc, host: null, onSelect: () => {} }); } catch { threw = true; }
assert(threw, 'a missing rail element is refused');

process.stdout.write(`\nemblem-rail: ${passed} passed, ${failed} failed\n`);
if (failed) process.exit(1);
