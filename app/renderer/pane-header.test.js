'use strict';
// Run: node app/renderer/pane-header.test.js
// S19: the pane header's branch and authority tags (a small DOM stub, no jsdom dependency).

const H = require('./pane-header');

let passed = 0, failed = 0;
function assert(condition, label) {
  if (condition) { process.stdout.write(`  ✓ ${label}\n`); passed += 1; }
  else { process.stderr.write(`  ✗ FAIL: ${label}\n`); failed += 1; }
}
const eq = (a, b, label) => assert(JSON.stringify(a) === JSON.stringify(b), `${label} (got ${JSON.stringify(a)})`);
const texts = (tags) => tags.map((t) => t.text);

process.stdout.write('\nwhat the header shows\n');
eq(texts(H.describeTags({ cli: 'claude', authority: 'medium', branch: 'agent/s19' })), ['agent/s19', 'Medium'], 'a Claude pane: branch, then authority');
eq(texts(H.describeTags({ cli: 'claude', authority: 'high' })), ['High'], 'no branch: authority only');
eq(texts(H.describeTags({ cli: 'claude', authority: 'minimum', readOnly: true, branch: 'b' })), ['b', 'read-only'], 'a read-only role says read-only, whatever the level');
eq(texts(H.describeTags({ cli: 'claude', authority: 'maximum' })), ['authority ?'], 'a level a pane never runs at is shown as unknown, never guessed');
eq(texts(H.describeTags({ cli: 'claude', authority: 'toString' })), ['authority ?'], 'an inherited property name is not a level');
eq(texts(H.describeTags({ cli: 'gemini', authority: 'medium', branch: 'b' })), ['b'], 'other CLIs carry no authority');
eq(texts(H.describeTags({ authority: 'medium' })), [], 'a shell with no branch shows nothing');
eq(texts(H.describeTags(null)), [], 'no options: nothing');
const long = H.describeTags({ branch: 'x'.repeat(100) })[0];
eq(long.text.length, H.MAX_BRANCH, 'a long branch name is cut');
assert(long.title.length > H.MAX_BRANCH, 'its full name is in the tooltip');
eq(H.describeTags({ branch: 'a\u001b[31mb' })[0].text, 'a [31mb', 'control characters become spaces');

process.stdout.write('\nmounting\n');
class Node {
  constructor(tag, cls) { this.tagName = tag.toUpperCase(); this.children = []; this.attrs = {}; this.className = cls || ''; this._text = ''; this.parent = null; }
  set textContent(v) { this._text = String(v); }
  get textContent() { return this._text; }
  set innerHTML(_v) { throw new Error('innerHTML used'); }
  get nextSibling() { if (!this.parent) return null; const i = this.parent.children.indexOf(this); return this.parent.children[i + 1] || null; }
  appendChild(c) { c.parent = this; this.children.push(c); return c; }
  insertBefore(c, ref) { c.parent = this; const i = ref ? this.children.indexOf(ref) : -1; this.children.splice(i < 0 ? this.children.length : i, 0, c); return c; }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  getAttribute(k) { return Object.prototype.hasOwnProperty.call(this.attrs, k) ? this.attrs[k] : null; }
  querySelector(sel) { const cls = sel.slice(1); return this.children.find((c) => c.className.split(' ').includes(cls)) || null; }
}
const doc = { createElement: (tag) => new Node(tag) };
const head = new Node('div', 'term-head');
head.appendChild(new Node('span', 'dot'));
head.appendChild(new Node('span', 'name'));
head.appendChild(new Node('button', 'copy-out'));
eq(H.mountTags(doc, head, H.describeTags({ cli: 'claude', authority: 'medium', branch: '<img src=x>' })), 2, 'two tags mounted');
eq(head.children.map((c) => c.className), ['dot', 'name', 'pane-tag branch-tag', 'pane-tag auth-tag auth-medium', 'copy-out'], 'after the name, in order, before the buttons');
eq(head.children[2].textContent, '<img src=x>', 'a hostile branch name is text, never markup');
eq(H.mountTags(null, head, []), 0, 'nothing to mount into: nothing');
const bare = new Node('div', 'term-head');
eq(H.mountTags(doc, bare, H.describeTags({ branch: 'b' })), 1, 'a header with no name still gets the tag');

process.stdout.write(`\npane-header: ${passed} passed, ${failed} failed\n`);
if (failed) process.exit(1);
