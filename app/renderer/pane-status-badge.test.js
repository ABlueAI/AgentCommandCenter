'use strict';
// Run: node app/renderer/pane-status-badge.test.js
//
// docs/OSS-PROCUREMENT-pane-status.md
// Blue's verdict, verbatim: BLUE SUBSYSTEM VERDICT: BUILD FRESH
//
// Renderer-side proof: the badge follows the PANE, not the position; it never sees a token; the
// wording never overstates what a Claude hook event means; and the toolbar control reports every
// setup state honestly, including the ones with no action available.

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
    hidden: false,
    disabled: false,
    listeners: {},
    appendChild(child) { this.children.push(child); child.parent = this; return child; },
    setAttribute(k, v) { this.attrs[k] = v; },
    getAttribute(k) { return this.attrs[k]; },
    addEventListener(k, fn) { (this.listeners[k] = this.listeners[k] || []).push(fn); },
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
  };
  return el;
}
const doc = { createElement: () => makeEl() };

// ---------------------------------------------------------------- wording
{
  // THE LOAD-BEARING WORDING RULE. `Stop` means the assistant's turn ended. It does NOT mean the work
  // is finished, the pane is safe to close, or the process has exited.
  const stopped = badgeMod.describeView({ paneId: 'pty1', state: 'turn ended' });
  eq(stopped.label, 'turn ended', 'Stop renders as "turn ended"');
  assert(!/finish|done|complete|safe/i.test(stopped.label + stopped.title),
    'and the label and tooltip never say finished, done, complete, or safe');

  eq(badgeMod.describeView({ state: 'attention' }).label, 'needs you', 'attention renders as "needs you"');
  eq(badgeMod.describeView({ state: 'working' }).label, 'working', 'working renders as "working"');
  eq(badgeMod.describeView({ state: 'exited' }).label, 'exited', 'exited renders as "exited"');
  eq(badgeMod.describeView({ state: 'failed' }).label, 'failed', 'failed renders as "failed"');

  // an unknown or absent state degrades to `unknown`, never to a guess
  eq(badgeMod.describeView({ state: 'nonsense' }).state, 'unknown', 'an unrecognised state renders as unknown');
  eq(badgeMod.describeView(null).state, 'unknown', 'a null view renders as unknown');
  eq(badgeMod.describeView({}).state, 'unknown', 'an empty view renders as unknown');

  // every unknown reason gets a human explanation — "unknown" with no reason trains people to ignore it
  for (const reason of Object.keys(badgeMod.REASON_TEXT)) {
    const d = badgeMod.describeView({ state: 'unknown', reason });
    assert(d.title.indexOf(badgeMod.REASON_TEXT[reason]) !== -1, `the tooltip explains "${reason}"`);
  }

  // and the PROTOTYPE presentation is gone
  const all = Object.keys(badgeMod.STATE_LABEL).map((s) => badgeMod.describeView({ state: s }));
  assert(all.every((d) => !/prototype/i.test(d.label + d.title)),
    'no rendered label or tooltip says PROTOTYPE any more');
  assert(all.every((d) => d.prototype === undefined), 'and no view carries a `prototype` flag');
}

// ---------------------------------------------------------------- pane binding and reattachment
{
  const panes = new Map();
  function makePane(id) {
    const pane = makeEl('pane');
    const head = makeEl('term-head');
    pane.appendChild(head);
    panes.set(id, pane);
    return pane;
  }
  const logs = [];
  const badge = badgeMod.createPaneStatusBadge({
    document: doc,
    getPaneElement: (id) => panes.get(id) || null,
    log: (l) => logs.push(l),
  });

  makePane('pty1');
  makePane('pty2');
  badge.update({ paneId: 'pty1', state: 'working' });
  badge.update({ paneId: 'pty2', state: 'idle' });

  eq(badge.stateOf('pty1'), 'working', 'pane1 shows working');
  eq(badge.stateOf('pty2'), 'idle', 'pane2 shows idle');
  eq(panes.get('pty1').querySelector('.pane-status-text').textContent, 'working', 'pane1 DOM says working');
  eq(panes.get('pty2').querySelector('.pane-status-text').textContent, 'idle', 'pane2 DOM says idle');

  // A view with no pane id is ignored — there is no "current pane" concept here.
  assert(badge.update({ state: 'failed' }) === null, 'a view with NO pane id is ignored entirely');
  eq(badge.stateOf('pty1'), 'working', 'and no pane absorbed it');

  // ---- DOCKVIEW REPARENTING. The node is dropped; the STATE must survive.
  const moved = makeEl('pane');
  moved.appendChild(makeEl('term-head'));
  panes.set('pty1', moved);                      // Dockview handed us a fresh element
  assert(moved.querySelector('.pane-status-badge') === null, 'after reparenting the badge NODE is gone');
  eq(badge.stateOf('pty1'), 'working', 'but the STATE is unaffected — it is keyed by pane id');

  const restored = badge.reattach('pty1');
  assert(restored !== null, 'reattach restores the badge');
  eq(moved.querySelector('.pane-status-text').textContent, 'working',
    'and the restored badge shows the SAME state, not a reset one');
  assert(logs.some((l) => l.indexOf('re-attached to pty1') !== -1), 'and it is logged visibly');

  // reattachAll is what the Dockview layout-change hook calls
  const moved2 = makeEl('pane');
  moved2.appendChild(makeEl('term-head'));
  panes.set('pty2', moved2);
  const n = badge.reattachAll();
  eq(n, 2, 'reattachAll re-attaches every tracked pane');
  eq(moved2.querySelector('.pane-status-text').textContent, 'idle', 'pane2 kept its own state through the move');

  // reattaching a pane we never saw invents nothing
  assert(badge.reattach('pty99') === null, 'reattaching an unknown pane invents no status');

  // ---- MIS-ATTRIBUTION. Swapping the ELEMENTS must not swap the STATES.
  const p1 = panes.get('pty1'), p2 = panes.get('pty2');
  panes.set('pty1', p2);
  panes.set('pty2', p1);
  badge.reattachAll();
  eq(badge.stateOf('pty1'), 'working', 'after swapping pane ELEMENTS, pty1 still reports its own state');
  eq(badge.stateOf('pty2'), 'idle', 'and pty2 still reports its own — status follows the PROCESS, not the position');

  // ---- no token can be displayed even if main wrongly sent one
  badge.update({ paneId: 'pty1', state: 'working', token: 'a'.repeat(64) });
  const dom = JSON.stringify(panes.get('pty1'), (k, v) => (k === 'parent' ? undefined : v));
  assert(dom.indexOf('a'.repeat(64)) === -1, 'a token is never written into the DOM, even if one arrives');

  // ---- forget
  assert(badge.forget('pty2') === true, 'forget drops a pane');
  eq(badge.stateOf('pty2'), null, 'and its state is gone');
  eq(badge.trackedPanes().length, 1, 'one pane remains tracked');
}

// ---------------------------------------------------------------- the toolbar setup control
{
  // Every setup state main can publish must render, and the ones with no safe action must offer none.
  const expectations = {
    disabled: 'install',
    ready: 'remove',
    'in-flight': null,
    'version-mismatch': 'remove',
    locked: 'clear',
    'other-installation': null,
    malformed: null,
    'reconciliation-required': null,
  };
  for (const [state, action] of Object.entries(expectations)) {
    const d = badgeMod.describeSetup({ state });
    eq(d.state, state, `setup state "${state}" renders`);
    eq(d.action, action, `setup state "${state}" offers action ${JSON.stringify(action)}`);
    assert(typeof d.label === 'string' && d.label.length > 0, `setup state "${state}" has a label`);
    assert(typeof d.title === 'string' && d.title.length > 0, `setup state "${state}" has a tooltip`);
  }
  // An unrecognised state degrades to `disabled`, never to `ready`.
  eq(badgeMod.describeSetup({ state: 'nonsense' }).state, 'disabled', 'an unrecognised setup state degrades to disabled');
  eq(badgeMod.describeSetup(null).state, 'disabled', 'a null setup state degrades to disabled');
  assert(badgeMod.describeSetup({ state: 'nonsense' }).state !== 'ready',
    'and NEVER to ready — an unknown setup state must not claim status is working');

  // the two states that point at the recovery document say so
  for (const state of ['malformed', 'reconciliation-required']) {
    assert(badgeMod.describeSetup({ state }).title.indexOf('RECOVERY-pane-status-hooks.md') !== -1,
      `"${state}" points at the manual recovery document`);
  }

  // a bounded detail constant is surfaced so a person can quote it
  assert(badgeMod.describeSetup({ state: 'locked', detail: 'lock-held-by-another-process' })
    .title.indexOf('lock-held-by-another-process') !== -1, 'a bounded detail constant is shown to the user');
}

// ---------------------------------------------------------------- the control drives the bridge
{
  const toolbar = makeEl('toolbar');
  const calls = [];
  const logs = [];
  const bridge = {
    getSetupState: async () => ({ ok: true, setup: { state: 'disabled' } }),
    install: async () => { calls.push('install'); return { ok: true, setup: { state: 'ready' } }; },
    remove: async () => { calls.push('remove'); return { ok: true, setup: { state: 'disabled' } }; },
    clearStaleLock: async () => { calls.push('clearStaleLock'); return { ok: false, reason: 'lock-owner-still-alive', setup: { state: 'locked' } }; },
  };
  const control = badgeMod.createSetupControl({
    document: doc, getToolbarElement: () => toolbar, bridge, log: (l) => logs.push(l),
  });

  (async () => {
    await control.refresh();
    eq(control.currentState(), 'disabled', 'the control reads its initial state from the bridge');
    eq(toolbar.querySelector('.pane-status-setup-action').textContent, 'Set up', 'and offers "Set up"');

    await control.onAction();
    assert(calls.includes('install'), 'clicking calls install()');
    eq(control.currentState(), 'ready', 'and the control follows the returned state');
    eq(toolbar.querySelector('.pane-status-setup-action').textContent, 'Remove', 'now offering "Remove"');

    await control.onAction();
    assert(calls.includes('remove'), 'clicking again calls remove()');

    control.render({ state: 'locked' });
    await control.onAction();
    assert(calls.includes('clearStaleLock'), 'in the locked state the action is clearStaleLock()');
    assert(logs.some((l) => l.indexOf('lock-owner-still-alive') !== -1),
      'a REFUSAL is surfaced in the Logs tab rather than swallowed');

    // a state with no action must not be clickable into anything
    control.render({ state: 'other-installation' });
    const before = calls.length;
    await control.onAction();
    eq(calls.length, before, 'a state with no available action calls nothing');
    assert(toolbar.querySelector('.pane-status-setup-action').disabled === true, 'and the button is disabled');
    assert(toolbar.querySelector('.pane-status-setup-action').hidden === true, 'and hidden');

    process.stdout.write(`\npane-status-badge: ${passed} passed, ${failed} failed\n`);
    process.exit(failed ? 1 : 0);
  })().catch((e) => { process.stderr.write('UNCAUGHT: ' + (e && e.stack) + '\n'); process.exit(1); });
}
