'use strict';
// Run: node app/renderer/cheat-sheet.test.js
// S19: the control room's cheat sheet (a small DOM stub, no jsdom dependency).

const C = require('./cheat-sheet');
const N = require('./shell-nav');

let passed = 0, failed = 0;
function assert(condition, label) {
  if (condition) { process.stdout.write(`  ✓ ${label}\n`); passed += 1; }
  else { process.stderr.write(`  ✗ FAIL: ${label}\n`); failed += 1; }
}
const eq = (a, b, label) => assert(JSON.stringify(a) === JSON.stringify(b), `${label} (got ${JSON.stringify(a)})`);

process.stdout.write('\nrows\n');
eq(C.cleanRows([{ keys: 'F8', action: 'Jump', scope: 'Every tab' }, null, { keys: 1, action: 'x' }, { keys: 'Esc', action: 'Close' }]),
  [{ keys: 'F8', action: 'Jump', scope: 'Every tab' }, { keys: 'Esc', action: 'Close', scope: '' }], 'malformed rows are dropped, a missing scope is empty');
eq(C.cleanRows('nope'), [], 'a list that is not a list gives no rows');
eq(C.cleanRows(Array.from({ length: 100 }, () => ({ keys: 'k', action: 'a' }))).length, C.MAX_ROWS, `at most ${C.MAX_ROWS} rows`);
assert(/Composer/.test(C.PHRASES_NOTE) && /password manager/.test(C.PHRASES_NOTE), 'the sheet says where the phrases are, and that sensitive ones are never shown');

process.stdout.write('\nthe sheet\n');
class Node {
  constructor(tag) { this.tagName = tag.toUpperCase(); this.children = []; this.attrs = {}; this.className = ''; this._text = ''; this.listeners = {}; this.open = false; }
  set textContent(v) { this._text = String(v); this.children = []; }
  get textContent() { return this._text + this.children.map((c) => c.textContent).join(''); }
  set innerHTML(_v) { throw new Error('innerHTML used'); }
  get firstChild() { return this.children[0] || null; }
  appendChild(c) { this.children.push(c); return c; }
  removeChild(c) { this.children = this.children.filter((x) => x !== c); return c; }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  removeAttribute(k) { delete this.attrs[k]; }
  getAttribute(k) { return Object.prototype.hasOwnProperty.call(this.attrs, k) ? this.attrs[k] : null; }
  addEventListener(type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); }
  fire(type) { for (const fn of this.listeners[type] || []) fn(); }
  click() { this.fire('click'); }
  focus() { doc.activeElement = this; }
  showModal() { this.open = true; }
  close() { this.open = false; this.fire('close'); }
  all(pred, out) { out = out || []; for (const c of this.children) { if (pred(c)) out.push(c); c.all(pred, out); } return out; }
}
const doc = { createElement: (tag) => new Node(tag), activeElement: null };
const buttonHost = new Node('div');
const dialogHost = new Node('div');
const logs = [];
let list = N.SHORTCUTS;
const sheet = C.createCheatSheet({ doc, buttonHost, dialogHost, getShortcuts: () => list, log: (l) => logs.push(l) });
const opener = new Node('button');
opener.focus();
eq([sheet.button.textContent, sheet.button.getAttribute('aria-label'), sheet.button.getAttribute('aria-haspopup')], ['?', 'Cheat sheet: keys and phrases', 'dialog'], 'a "?" button with a spoken name');
assert(buttonHost.children.includes(sheet.button) && dialogHost.children.includes(sheet.dialog), 'the button and the dialog are mounted');
sheet.button.click();
assert(sheet.isOpen(), 'the button opens the sheet');
const rows = sheet.dialog.all((n) => n.tagName === 'TR').length - 1;
eq(rows, N.SHORTCUTS.length, 'one row per entry in S66\'s one shortcut list');
assert(sheet.dialog.textContent.includes('F8'), 'the needs-you jump key is listed');
eq(doc.activeElement && doc.activeElement.getAttribute('id'), 'makoCheatSheetClose', 'focus moves into the sheet');
sheet.dialog.all((n) => n.getAttribute('id') === 'makoCheatSheetClose')[0].click();
assert(!sheet.isOpen(), 'Close closes it');
assert(doc.activeElement === opener, 'and focus goes back to what opened it');
list = [{ keys: '<b>X</b>', action: '<img src=x>', scope: '' }];
sheet.open();
assert(sheet.dialog.all((n) => n.tagName === 'KBD')[0].textContent === '<b>X</b>', 'list text is text, never markup');
sheet.close();
list = null;
sheet.open();
assert(sheet.dialog.textContent.includes('could not be read') && logs.some((l) => l.includes('list-missing')), 'a missing list says so, visibly and in Logs');
sheet.close();
list = () => { throw new Error('x'); };
const throwing = C.createCheatSheet({ doc, buttonHost: new Node('div'), dialogHost: new Node('div'), getShortcuts: () => { throw new Error('x'); }, log: (l) => logs.push(l) });
throwing.open();
assert(throwing.dialog.textContent.includes('could not be read'), 'a list that throws is contained and shown');
let threw = 0;
try { C.createCheatSheet({ doc, buttonHost: null, dialogHost, getShortcuts: () => [] }); } catch { threw += 1; }
try { C.createCheatSheet({ doc, buttonHost, dialogHost }); } catch { threw += 1; }
eq(threw, 2, 'a missing host or list is refused');

process.stdout.write(`\ncheat-sheet: ${passed} passed, ${failed} failed\n`);
if (failed) process.exit(1);
