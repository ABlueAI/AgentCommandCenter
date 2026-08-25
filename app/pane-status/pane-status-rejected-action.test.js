'use strict';
// Run: node app/pane-status/pane-status-rejected-action.test.js
//
// R2 — REJECTED RENDERER ACTIONS.
//
// `install()`, `remove()` and `clearStaleLock()` are IPC invokes, and an invoke can REJECT: main can
// tear down mid-call, the channel can vanish, a handler can throw. The action path awaited all three
// inside a try/finally with no catch, so a rejection escaped `onAction()` entirely — an unhandled
// rejection, no log line, no state refresh, and a toolbar still presenting whatever it presented
// before, with the operator given no reason to doubt it.
//
// The rule: catch it, emit a FIXED bounded metadata-safe line, attempt EXACTLY ONE getSetupState()
// refresh, render the authoritative state if that works, and if it does not, keep the prior
// presentation and say plainly that the action is unconfirmed and the display may be stale.
//
// Nothing from the rejection may reach the log: no exception text, path, settings content, environment
// value, token or credential.

const fs = require('fs');
const path = require('path');

const badgeMod = require('../renderer/pane-status-badge.js');

let passed = 0, failed = 0;
function assert(cond, label) {
  if (cond) { process.stdout.write(`  ✓ ${label}\n`); passed++; }
  else { process.stderr.write(`  ✗ FAIL: ${label}\n`); failed++; }
}
function eq(a, b, label) { assert(a === b, a === b ? label : `${label} (got ${JSON.stringify(a)})`); }

// Every one of these is something that must NEVER appear in a log line. The rejection carries all of
// them at once, so a single leak anywhere fails loudly.
// The path below is deliberately NOT spelled as a real Claude settings location: the isolation suite
// scans every test file for that construct, and a poison string is still a string in this file.
const SECRETS = [
  'C:\\Users\\someone\\AppData\\Roaming\\command-center\\secret-config.json',
  'sk-ant-api03-NOT-A-REAL-KEY',
  'BLUE_HELM_PANE_STATUS_TOKEN=deadbeef',
  'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6',
  'ANTHROPIC_API_KEY',
  'at Object.<anonymous> (main.js:1:1)',
];
function poison() {
  const e = new Error(`bridge exploded ${SECRETS.join(' ')}`);
  e.stack = `Error: ${SECRETS.join(' ')}\n    at fake (${SECRETS[0]}:1:1)`;
  e.path = SECRETS[0];
  return e;
}

function makeEl() {
  return {
    className: '', attrs: {}, children: [], textContent: '', hidden: false, disabled: false,
    appendChild(ch) { this.children.push(ch); return ch; },
    setAttribute(k, v) { this.attrs[k] = v; },
    getAttribute(k) { return this.attrs[k]; },
    addEventListener() {},
  };
}

const START_STATE = { install: 'disabled', remove: 'ready', clear: 'locked' };
const AUTHORITATIVE = 'malformed';   // distinct from all three starting states

/** A mounted control whose chosen action rejects, and whose refresh either works or does not. */
function rig(action, refreshWorks) {
  const logs = [];
  let refreshes = 0;
  const toolbar = makeEl();
  const bridge = {
    install: async () => { throw poison(); },
    remove: async () => { throw poison(); },
    clearStaleLock: async () => { throw poison(); },
    getSetupState: async () => {
      refreshes++;
      if (!refreshWorks) throw poison();
      return { ok: true, setup: { state: AUTHORITATIVE, detail: null } };
    },
  };
  const control = badgeMod.createSetupControl({
    document: { createElement: () => makeEl() },
    getToolbarElement: () => toolbar,
    bridge,
    log: (line) => logs.push(String(line)),
  });
  control.render({ state: START_STATE[action], detail: null });
  return { control, logs, refreshes: () => refreshes };
}

(async () => {
  // -----------------------------------------------------------------------------------------------
  process.stdout.write('\n1. The fixtures really do drive the three distinct actions\n');
  // -----------------------------------------------------------------------------------------------
  for (const action of ['install', 'remove', 'clear']) {
    eq(rig(action, true).control.currentAction(), action,
      `a ${START_STATE[action]} toolbar offers the ${action} action`);
  }

  // -----------------------------------------------------------------------------------------------
  process.stdout.write('\n2. Rejection + refresh SUCCEEDS: authoritative state is rendered\n');
  // -----------------------------------------------------------------------------------------------
  for (const action of ['install', 'remove', 'clear']) {
    const r = rig(action, true);
    let threw = false;
    try { await r.control.onAction(); } catch { threw = true; }

    assert(threw === false, `[${action}] the rejection is CAUGHT — onAction never rejects`);
    eq(r.refreshes(), 1, `[${action}] exactly ONE getSetupState refresh is attempted`);
    eq(r.control.currentState(), AUTHORITATIVE,
      `[${action}] and the AUTHORITATIVE state is rendered, not the stale one`);

    // Exact visible log disposition: one line, and it is the fixed one.
    eq(r.logs.length, 1, `[${action}] exactly one log line is emitted`);
    eq(r.logs[0], `[pane-status] ${action} failed: the request did not complete.\n`,
      `[${action}] and it is the fixed bounded failure line, verbatim`);
    assert(!/stale/i.test(r.logs[0]),
      `[${action}] no stale warning is emitted when the refresh worked`);
  }

  // -----------------------------------------------------------------------------------------------
  process.stdout.write('\n3. Rejection + refresh ALSO FAILS: prior presentation retained, said plainly\n');
  // -----------------------------------------------------------------------------------------------
  for (const action of ['install', 'remove', 'clear']) {
    const r = rig(action, false);
    let threw = false;
    try { await r.control.onAction(); } catch { threw = true; }

    assert(threw === false, `[${action}] the second rejection is caught too`);
    eq(r.refreshes(), 1, `[${action}] still EXACTLY ONE refresh attempt — no retry loop`);
    eq(r.control.currentState(), START_STATE[action],
      `[${action}] the PRIOR presentation is retained, not blanked`);

    eq(r.logs.length, 2, `[${action}] exactly two log lines`);
    eq(r.logs[0], `[pane-status] ${action} failed: the request did not complete.\n`,
      `[${action}] the first is the same fixed failure line`);
    const warn = r.logs[1];
    assert(warn.indexOf(`${action} is UNCONFIRMED`) !== -1,
      `[${action}] the second says the action is UNCONFIRMED`);
    assert(/setup state could not be refreshed/.test(warn),
      `[${action}] states explicitly that setup state could not be refreshed`);
    assert(/may be stale/.test(warn), `[${action}] and that the displayed state may be stale`);
  }

  // -----------------------------------------------------------------------------------------------
  process.stdout.write('\n4. NOTHING from the rejection reaches the log, on either path\n');
  // -----------------------------------------------------------------------------------------------
  for (const action of ['install', 'remove', 'clear']) {
    for (const refreshWorks of [true, false]) {
      const r = rig(action, refreshWorks);
      await r.control.onAction();
      const all = r.logs.join('');
      let leaked = null;
      for (const s of SECRETS) if (all.indexOf(s) !== -1) leaked = s;
      eq(leaked, null,
        `[${action}/refresh ${refreshWorks ? 'ok' : 'failed'}] no path, token, key, env name or stack frame leaked`);
      assert(!/bridge exploded/.test(all),
        `[${action}/refresh ${refreshWorks ? 'ok' : 'failed'}] and no exception message leaked`);
      // Bounded by construction: only the three action constants are interpolated.
      assert(all.split('\n').every((l) => l.length < 220),
        `[${action}/refresh ${refreshWorks ? 'ok' : 'failed'}] every line stays bounded in length`);
    }
  }

  // -----------------------------------------------------------------------------------------------
  process.stdout.write('\n5. The leak is prevented STRUCTURALLY, not by careful wording\n');
  // -----------------------------------------------------------------------------------------------
  {
    // Scanning a DIFFERENT file, never this one: an assertion that scans its own source matches its
    // own words. Match the construct, not the noun.
    const src = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'pane-status-badge.js'), 'utf8');
    const bound = (src.match(/catch\s*\(/g) || []).length;
    const bindingless = (src.match(/catch\s*\{/g) || []).length;
    eq(bound, 0, 'the badge binds NO catch parameter anywhere');
    assert(bindingless >= 3, `so there is nothing in scope to print (${bindingless} bindingless catches)`);
    assert(/\{ rejected = true; \}/.test(src),
      'the action catch only records THAT it failed, never WHY');
  }

  // -----------------------------------------------------------------------------------------------
  process.stdout.write('\n6. A resolving action is completely unaffected by R2\n');
  // -----------------------------------------------------------------------------------------------
  {
    let refreshes = 0;
    const logs = [];
    const toolbar = makeEl();
    const control = badgeMod.createSetupControl({
      document: { createElement: () => makeEl() },
      getToolbarElement: () => toolbar,
      bridge: {
        remove: async () => ({ ok: true, reason: null, detail: null, retained: false, disposition: 'complete' }),
        getSetupState: async () => { refreshes++; return { ok: true, setup: { state: 'disabled' } }; },
      },
      log: (l) => logs.push(String(l)),
    });
    control.render({ state: 'ready', detail: null });
    await control.onAction();
    eq(refreshes, 0, 'a successful action triggers no R2 refresh');
    eq(logs.length, 0, 'and emits no failure line');
  }

  process.stdout.write(`\npane-status-rejected-action: ${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
})();
