'use strict';
// Run: node app/renderer/pane-status-badge.test.js
//
// EXPERIMENT A — PROTOTYPE ONLY. docs/OSS-PROCUREMENT-pane-status.md
// Blue's verdict, verbatim: BLUE SUBSYSTEM VERDICT: PROTOTYPE
//
// Renderer-side proof: the badge follows the PANE, not the position; it never sees a token; and the
// wording never overstates what a Claude hook event means.

const badgeMod = require('./pane-status-badge.js');

let passed = 0, failed = 0;
function assert(cond, label) {
  if (cond) { process.stdout.write(`  ✓ ${label}\n`); passed++; }
  else { process.stderr.write(`  ✗ FAIL: ${label}\n`); failed++; }
}
function eq(a, b, label) { assert(a === b, `${label} (got ${JSON.stringify(a)})`); }

// ---- Minimal DOM good enough to model reparenting, which is the behaviour under test. ----
function makeEl(className) {
  const el = {
    className: className || '',
    children: [],
    attrs: {},
    textContent: '',
    appendChild(child) { this.children.push(child); child.parent = this; return child; },
    setAttribute(k, v) { this.attrs[k] = v; },
    getAttribute(k) { return this.attrs[k]; },
    querySelector(sel) {
      const want = sel.replace('.', '');
      const walk = (node) => {
        for (const c of node.children) {
          if ((c.className || '').split(/\s+/).indexOf(want) !== -1) return c;
          const deeper = walk(c);
          if (deeper) return deeper;
        }
        return null;
      };
      return walk(this);
    },
    remove() {
      if (this.parent) this.parent.children = this.parent.children.filter((c) => c !== this);
      this.parent = null;
    },
    allText() {
      let t = this.textContent || '';
      for (const c of this.children) t += ' ' + c.allText();
      return t;
    },
    allAttrs() {
      let s = JSON.stringify(this.attrs);
      for (const c of this.children) s += c.allAttrs();
      return s;
    },
  };
  return el;
}
const doc = { createElement: (tag) => makeEl(tag === 'span' ? '' : tag) };
function makePane() { const p = makeEl('term-pane'); p.appendChild(makeEl('term-head')); return p; }

// ---------------------------------------------------------------- wording
process.stdout.write('\n-- wording honesty --\n');
{
  eq(badgeMod.describeView({ paneId: 'pty1', state: 'turn ended' }).label, 'turn ended', 'Stop renders as "turn ended"');
  const forbidden = ['finished', 'safe', 'process exited', 'done', 'complete', 'idle prompt'];
  for (const word of forbidden) {
    const hit = Object.values(badgeMod.STATE_LABEL).some((l) => l.toLowerCase() === word);
    assert(!hit, `no label is ever "${word}"`);
  }
  eq(badgeMod.describeView({ paneId: 'p', state: 'unknown', reason: 'stale' }).label, 'unknown', 'a stale view renders unknown');
  assert(badgeMod.describeView({ paneId: 'p', state: 'unknown', reason: 'stale' }).title.indexOf('too old to trust') !== -1,
    'and explains WHY it is unknown');
  assert(badgeMod.describeView({ paneId: 'p', state: 'unknown', reason: 'version-mismatch' }).title.indexOf('not verified') !== -1,
    'a version mismatch says the version was not verified');
  eq(badgeMod.describeView({ paneId: 'p', state: 'nonsense-state' }).state, 'unknown', 'an unrecognised state falls back to unknown');
  eq(badgeMod.describeView({ paneId: 'p', state: 'attention' }).label, 'needs you', 'Notification renders as "needs you"');
  assert(badgeMod.describeView({ paneId: 'p', state: 'attention' }).title.indexOf('PROTOTYPE') === 0,
    'every tooltip identifies itself as PROTOTYPE');
  // The procurement record's amendment: the payload boundary cannot carry matcher detail, so the
  // badge must NOT claim it distinguishes an idle prompt from a permission prompt.
  const attentionText = JSON.stringify(badgeMod.describeView({ paneId: 'p', state: 'attention' }));
  assert(attentionText.indexOf('permission') === -1 && attentionText.indexOf('idle') === -1,
    'the attention state does NOT claim to distinguish idle from permission prompts');
}

// ---------------------------------------------------------------- pane identity
process.stdout.write('\n-- pane identity, not position --\n');
{
  const panes = { pty1: makePane(), pty2: makePane() };
  const logs = [];
  const badge = badgeMod.createPaneStatusBadge({
    document: doc, log: (l) => logs.push(l), getPaneElement: (id) => panes[id] || null,
  });

  badge.update({ paneId: 'pty1', state: 'working', prototype: true });
  eq(badge.stateOf('pty1'), 'working', 'pty1 shows working');
  eq(badge.stateOf('pty2'), null, 'pty2 has no state at all');
  assert(panes.pty1.querySelector('.pane-status-badge') !== null, 'a badge was created on pty1');
  assert(panes.pty2.querySelector('.pane-status-badge') === null, 'NO badge was created on pty2');
  assert(panes.pty1.allText().indexOf('PROTOTYPE') !== -1, 'the badge text visibly says PROTOTYPE');

  // An event for the enrolled pane can never touch a different pane.
  badge.update({ paneId: 'pty1', state: 'attention', prototype: true });
  eq(badge.stateOf('pty2'), null, 'a second update still leaves pty2 untouched');
  eq(panes.pty2.querySelector('.pane-status-badge'), null, 'pty2 still has no badge element');

  // A view with no pane id is ignored — there is no "current pane" fallback to abuse.
  eq(badge.update({ state: 'working' }), null, 'a view with no paneId is ignored');
  eq(badge.update(null), null, 'a null view is ignored');

  // ---- Dockview move: reparent pty1's element, dropping the badge node. ----
  const oldGroup = makeEl('dv-group');
  const newGroup = makeEl('dv-group');
  oldGroup.appendChild(panes.pty1);
  const stateBefore = badge.stateOf('pty1');
  panes.pty1.remove();                    // Dockview detaches
  const detachedBadge = panes.pty1.querySelector('.pane-status-badge');
  newGroup.appendChild(panes.pty1);       // ...and reattaches elsewhere
  eq(badge.stateOf('pty1'), stateBefore, 'the STATE survives a Dockview move (it is keyed by pane id)');
  assert(detachedBadge !== null, 'the badge element travelled with its own pane element');

  // Simulate the harsher case: the badge node is destroyed by the move.
  const b = panes.pty1.querySelector('.pane-status-badge');
  if (b) b.remove();
  eq(panes.pty1.querySelector('.pane-status-badge'), null, 'badge node is gone after a destructive move');
  const re = badge.reattach('pty1');
  assert(re && re.state === stateBefore, 'reattach restores the SAME state, inventing nothing');
  assert(panes.pty1.querySelector('.pane-status-badge') !== null, 'and the badge element is back');
  assert(logs.join('').indexOf('state preserved') !== -1, 'the re-attach is visible in the log');

  // Reattach for a pane we never tracked must not conjure a badge.
  eq(badge.reattach('pty2'), null, 'reattach on an untracked pane does nothing');
  eq(panes.pty2.querySelector('.pane-status-badge'), null, 'and creates no element');

  // Ownership after release.
  badge.update({ paneId: 'pty1', state: 'unknown', reason: 'released', prototype: true });
  eq(badge.stateOf('pty1'), 'unknown', 'a released pane degrades to unknown');
  badge.forget('pty1');
  eq(badge.stateOf('pty1'), null, 'forget clears the tracked state');
  eq(badge.trackedPanes().length, 0, 'no panes remain tracked');
}

// ---------------------------------------------------------------- no token anywhere
process.stdout.write('\n-- the renderer never receives a token --\n');
{
  const TOKEN = 'f'.repeat(64);
  const panes = { pty1: makePane() };
  const logs = [];
  const badge = badgeMod.createPaneStatusBadge({
    document: doc, log: (l) => logs.push(l), getPaneElement: (id) => panes[id] || null,
  });
  // Even if a (buggy or hostile) main sent a token-bearing view, the badge must not surface it: it
  // reads only the four fields it knows about.
  badge.update({ paneId: 'pty1', state: 'working', prototype: true, token: TOKEN, secret: 'SENTINEL-RENDER-42' });
  const dom = panes.pty1.allText() + panes.pty1.allAttrs();
  assert(dom.indexOf(TOKEN) === -1, 'no token reaches the DOM text or any attribute');
  assert(dom.indexOf('SENTINEL-RENDER-42') === -1, 'no unexpected field reaches the DOM');
  assert(logs.join('').indexOf(TOKEN) === -1, 'no token reaches the renderer log');
  const shown = badgeMod.describeView({ paneId: 'pty1', state: 'working', token: TOKEN });
  assert(JSON.stringify(shown).indexOf(TOKEN) === -1, 'describeView drops every field it does not model');
  assert(Object.keys(shown).sort().join(',') === 'className,label,prototype,state,title',
    'the described view has exactly the five presentation fields');
}

// ---------------------------------------------------------------- IIFE discipline
process.stdout.write('\n-- renderer module discipline --\n');
{
  const fs = require('fs');
  const src = fs.readFileSync(require('path').join(__dirname, 'pane-status-badge.js'), 'utf8');
  assert(/^\(\(global\)\s*=>\s*\{/m.test(src.trim()),
    'the module is wrapped in the ((global) => {...}) IIFE required for classic renderer scripts');
  assert(src.indexOf('\nconst ') === -1 || src.trim().indexOf('((global)') === 0,
    'no bare top-level const escapes into the shared renderer global scope');
  // REVISION 2: the global is GATED. Requiring this file in a plain node process — which is exactly
  // what an ungated renderer looks like — must publish NOTHING, because the work order requires the
  // prototype surface to be ABSENT when disabled rather than inert. `module.exports` stays
  // unconditional so this suite can still exercise the pure functions.
  eq(typeof globalThis.ccPaneStatusBadge, 'undefined',
    'GATE OFF: requiring the module publishes no ccPaneStatusBadge global');
  assert(typeof badgeMod.createPaneStatusBadge === 'function',
    'while module.exports still carries the API for tests');
  assert(/if \(global\.ccPaneStatus && global\.ccPaneStatus\.enabled === true\) global\.ccPaneStatusBadge/.test(src),
    'and the global is published only behind the preload-exposed prototype bridge');

  const badgePath = require.resolve('./pane-status-badge.js');
  delete require.cache[badgePath];
  globalThis.ccPaneStatus = { enabled: true };
  require(badgePath);
  eq(typeof globalThis.ccPaneStatusBadge, 'object',
    'GATE ON: with the bridge present it publishes exactly one global');
  delete globalThis.ccPaneStatus;
  delete globalThis.ccPaneStatusBadge;
  delete require.cache[badgePath];
}

process.stdout.write(`\npane-status-badge: ${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
