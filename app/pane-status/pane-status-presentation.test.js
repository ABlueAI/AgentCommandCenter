'use strict';
// Run: node app/pane-status/pane-status-presentation.test.js
//
// R3 — PRESENTATION DELIVERY IS NOT PART OF THE FILESYSTEM TRANSACTION.
//
// The defect: `createPublishers.send()` returns false when the window is gone, has no webContents, or
// the send threw, and every call site discarded that boolean. A removal whose hook-removed notice was
// dropped still revoked the tokens and still returned a plain `{ ok: true }`, so the renderer kept
// showing live pane badges over an installation that no longer existed, and nothing anywhere said so.
//
// The correction introduces a THIRD removal outcome — filesystem success with presentation
// unconfirmed — carried on the existing registry and getSetupState() refresh path. NO new IPC channel,
// no new subscription, no new badge method: the disposition rides on the remove response as a single
// bounded constant, exactly as `retained` already does.
//
// Every proof Binding Amendment C § 1 requires is below, in its order.

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const controllerMod = require('./pane-status-controller');
const descriptorMod = require('./pane-status-descriptor');
const ipcMod = require('./pane-status-ipc');
const shimMod = require('./pane-status-runtime-shim');
const badgeMod = require('../renderer/pane-status-badge.js');

let passed = 0, failed = 0;
function assert(cond, label) {
  if (cond) { process.stdout.write(`  ✓ ${label}\n`); passed++; }
  else { process.stderr.write(`  ✗ FAIL: ${label}\n`); failed++; }
}
function eq(a, b, label) { assert(a === b, a === b ? label : `${label} (got ${JSON.stringify(a)})`); }

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bh-presentation-'));
const INSTALL_ID = 'd'.repeat(32);

let seq = 0;
/**
 * A real controller over a real temporary settings file. `hooks` lets a test swap the publishers at
 * any moment, so an install can succeed normally and only the REMOVAL's delivery fails — which is the
 * situation under test, and the one a publisher rigged at construction time could not produce.
 */
function makeController() {
  const dir = path.join(root, 'c' + (seq++));
  const userData = path.join(dir, 'userData');
  const settingsDir = path.join(dir, 'claude');
  const settingsPath = path.join(settingsDir, 'settings.json');
  fs.mkdirSync(userData, { recursive: true });
  fs.mkdirSync(settingsDir, { recursive: true });
  fs.writeFileSync(settingsPath, '{}\n');

  const views = [];
  const setups = [];
  const logs = [];
  const hooks = { onView: null, onSetupState: null };
  let clock = 1000;

  const c = controllerMod.createPaneStatusController({
    userDataPath: userData, settingsDir, settingsPath,
    installId: INSTALL_ID,
    cmdExe: shimMod.resolveCmdExe(process.env),
    reporterPath: path.join(__dirname, 'pane-status-reporter.js'),
    currentRuntimePath: process.execPath,
    net: require('net'), crypto,
    randomToken: () => crypto.randomBytes(32).toString('hex'),
    resolveVersion: async () => ({ ok: true, raw: '9.9.9 (Claude Code)' }),
    resolveProcessStartTime: async () => ({ ok: true, running: false }),
    supportedVersions: ['9.9.9'],
    publishView: (v) => { views.push(v); return hooks.onView ? hooks.onView(v) : undefined; },
    publishSetupState: (s) => { setups.push(s); return hooks.onSetupState ? hooks.onSetupState(s) : undefined; },
    now: () => clock,
    log: (line) => logs.push(String(line)),
  });
  return { c, views, setups, logs, hooks, settingsPath, userData };
}

/** Minimal DOM: enough for the toolbar control to mount and re-render. */
function makeEl() {
  return {
    className: '', attrs: {}, children: [], textContent: '', hidden: false, disabled: false,
    appendChild(ch) { this.children.push(ch); return ch; },
    setAttribute(k, v) { this.attrs[k] = v; },
    getAttribute(k) { return this.attrs[k]; },
    addEventListener() {},
  };
}

/** A mounted setup control with an injected bridge, plus the log lines it produced. */
function makeControl(bridge) {
  const logs = [];
  const toolbar = makeEl();
  const control = badgeMod.createSetupControl({
    document: { createElement: () => makeEl() },
    getToolbarElement: () => toolbar,
    bridge,
    log: (line) => logs.push(String(line)),
  });
  return { control, logs };
}

(async () => {
  // -----------------------------------------------------------------------------------------------
  process.stdout.write('\n1. The authoritative registry state goes non-live BEFORE anything is published\n');
  // -----------------------------------------------------------------------------------------------
  {
    const rig = makeController();
    await rig.c.install();
    eq(rig.c.getSetupState().state, 'ready', 'the fixture installs and is ready');
    const enrolled = rig.c.enrollPane('pty1');
    assert(enrolled.ok === true, 'a pane enrolls');
    rig.c.registry.applyMessage({ e: 'UserPromptSubmit', t: enrolled.env.BLUE_HELM_PANE_STATUS_TOKEN });
    eq(rig.c.registry.viewFor('pty1').state, 'working', 'and is genuinely LIVE — working, not unknown');

    // Read the authoritative state from INSIDE the publish, which is the only moment that can tell
    // committed-then-published apart from published-then-committed.
    let observedAtPublish = null;
    let existedAtPublish = null;
    rig.hooks.onView = (v) => {
      if (v && v.reason === 'hook-removed' && observedAtPublish === null) {
        observedAtPublish = rig.c.registry.viewFor('pty1');
        existedAtPublish = rig.c.registry.has('pty1');
      }
      return undefined;
    };

    const res = await rig.c.remove();
    assert(observedAtPublish !== null, 'the hook-removed notice was published at all');
    eq(observedAtPublish.state, 'unknown', 'at publish time the registry ALREADY resolves the pane to unknown');
    eq(observedAtPublish.reason, 'hook-removed', 'with the hook-removed reason already committed');
    assert(existedAtPublish === true,
      'and the pane still EXISTS at publish time — reason before revocation, so the badge has something to explain it');
    eq(res.ok, true, 'the removal succeeded');
    eq(res.disposition, 'complete', 'and with delivery confirmed the disposition is COMPLETE');
  }

  // -----------------------------------------------------------------------------------------------
  process.stdout.write('\n2. Delivery success preserves reason-before-revocation ordering\n');
  // -----------------------------------------------------------------------------------------------
  {
    const rig = makeController();
    await rig.c.install();
    const a = rig.c.enrollPane('pty1');
    const b = rig.c.enrollPane('pty2');
    assert(a.ok === true && b.ok === true, 'two panes enroll');

    const order = [];
    rig.hooks.onView = (v) => { if (v && v.reason === 'hook-removed') order.push(`publish:${v.paneId}`); return undefined; };
    const realRevokeAll = rig.c.registry.revokeAll;
    rig.c.registry.revokeAll = function (reason) { order.push('revokeAll'); return realRevokeAll.call(this, reason); };

    const res = await rig.c.remove();
    eq(order.indexOf('revokeAll'), order.length - 1, 'revokeAll happens LAST, after every pane was told why');
    assert(order.indexOf('publish:pty1') !== -1 && order.indexOf('publish:pty2') !== -1,
      'and every enrolled pane got the notice, not just the first');
    eq(res.disposition, 'complete', 'the disposition is COMPLETE');
    assert(rig.c.registry.has('pty1') === false && rig.c.registry.has('pty2') === false,
      'both panes are revoked once the removal returns');
  }

  // -----------------------------------------------------------------------------------------------
  process.stdout.write('\n3. Delivery returning false AND delivery throwing both still revoke every token\n');
  // -----------------------------------------------------------------------------------------------
  for (const mode of ['returns-false', 'throws']) {
    const rig = makeController();
    await rig.c.install();
    const enrolled = rig.c.enrollPane('pty1');
    const token = enrolled.env.BLUE_HELM_PANE_STATUS_TOKEN;
    assert(enrolled.ok === true, `[${mode}] a pane enrolls`);

    // Armed only now: the INSTALL published normally, so this isolates removal-time delivery failure.
    rig.hooks.onView = (v) => {
      if (v && v.reason === 'hook-removed') {
        if (mode === 'throws') throw new Error('webContents destroyed');
        return false;
      }
      return undefined;
    };

    const res = await rig.c.remove();
    eq(res.ok, true, `[${mode}] the removal still reports ok — the filesystem work genuinely completed`);
    eq(res.disposition, 'presentation-unconfirmed',
      `[${mode}] but the disposition is PRESENTATION_UNCONFIRMED, not a plain success`);
    assert(rig.c.registry.has('pty1') === false,
      `[${mode}] the token is revoked ANYWAY — a renderer that missed the notice never keeps trust alive`);
    const late = rig.c.registry.applyMessage({ e: 'Stop', t: token });
    assert(late.ok === false || late.applied === 'none',
      `[${mode}] and the revoked token is inert immediately`);
    eq(rig.c.getSetupState().state, 'disabled', `[${mode}] the authoritative setup state is non-live`);
    assert(rig.logs.some((l) => /removal COMPLETED on disk/.test(l) && /may be stale/.test(l)),
      `[${mode}] main logs that removal completed but the display may be stale`);
  }

  // -----------------------------------------------------------------------------------------------
  process.stdout.write('\n4/6. A completed settings transaction is NEVER rolled back for a presentation failure\n');
  // -----------------------------------------------------------------------------------------------
  {
    // Control: delivery succeeds. Subject: delivery fails. The on-disk outcome must be identical.
    const outcomes = {};
    for (const mode of ['delivered', 'undelivered']) {
      const rig = makeController();
      await rig.c.install();
      rig.c.enrollPane('pty1');
      const beforeText = fs.readFileSync(rig.settingsPath, 'utf8');
      assert(beforeText.indexOf(INSTALL_ID) !== -1, `[${mode}] the install really is in settings beforehand`);

      if (mode === 'undelivered') rig.hooks.onView = () => false;
      const res = await rig.c.remove();
      eq(res.ok, true, `[${mode}] the removal reports success`);

      const afterText = fs.readFileSync(rig.settingsPath, 'utf8');
      const descriptorGone = !fs.existsSync(descriptorMod.descriptorPath(rig.userData));
      outcomes[mode] = {
        installIdPresent: afterText.indexOf(INSTALL_ID) !== -1,
        hooks: JSON.parse(afterText).hooks,
        descriptorGone,
      };
      assert(outcomes[mode].installIdPresent === false,
        `[${mode}] the hook groups are gone from settings`);
      assert(descriptorGone === true, `[${mode}] and the installation record is retired`);
    }
    eq(JSON.stringify(outcomes.undelivered.hooks), JSON.stringify(outcomes.delivered.hooks),
      'the settings end in the SAME state whether or not the renderer answered');
    eq(outcomes.undelivered.descriptorGone, outcomes.delivered.descriptorGone,
      'and so does the installation record — presentation failure rolls nothing back');
  }

  // -----------------------------------------------------------------------------------------------
  process.stdout.write('\n5. The IPC layer carries the third outcome without a new channel or field family\n');
  // -----------------------------------------------------------------------------------------------
  {
    const src = fs.readFileSync(path.join(__dirname, 'pane-status-ipc.js'), 'utf8');
    // Pin the SET, not a count: a count still passes if one channel is swapped for another.
    const channels = (src.match(/'pane-status-[a-z-]+'/g) || [])
      .map((s) => s.slice(1, -1)).filter((v, i, a) => a.indexOf(v) === i).sort();
    eq(channels.join(','),
      ['pane-status-clear-stale-lock', 'pane-status-get-setup-state', 'pane-status-install',
        'pane-status-remove', 'pane-status-setup-state', 'pane-status-unavailable',
        'pane-status-view'].join(','),
      'the channel table is byte-for-byte the seven channels that existed at add8a4dc — R3 added none');
    assert(/disposition:\s*res\.ok === true \? boundedDetail\(res\.disposition\) : null/.test(src),
      'the disposition is projected through the SAME bounded-detail filter as every other constant');

    const preload = fs.readFileSync(path.join(__dirname, '..', 'preload.js'), 'utf8');
    const invokes = (preload.match(/ipcRenderer\.invoke\('pane-status-[a-z-]+'\)/g) || []).length;
    eq(invokes, 4, 'the preload surface is still exactly four zero-argument invokes');
    assert(preload.indexOf('disposition') === -1,
      'and preload gained nothing: the disposition travels inside the existing remove response');
  }

  // -----------------------------------------------------------------------------------------------
  process.stdout.write('\n7. The renderer re-reads the authoritative state and cannot keep presenting a live one\n');
  // -----------------------------------------------------------------------------------------------
  {
    // The remove response deliberately carries NO setup payload: it travelled the same way the notice
    // that went missing did, so the control must go and ask, not trust what it was handed.
    const disabled = ipcMod.projectSetupState({ state: 'disabled', detail: 'removed' });
    let refreshes = 0;
    const rig = makeControl({
      remove: async () => ({ ok: true, reason: null, detail: null, retained: false, disposition: 'presentation-unconfirmed' }),
      getSetupState: async () => { refreshes++; return { ok: true, setup: disabled }; },
    });
    rig.control.render(ipcMod.projectSetupState({ state: 'ready', detail: null }));
    eq(rig.control.currentState(), 'ready', 'the control starts out presenting a LIVE, ready installation');
    eq(rig.control.currentAction(), 'remove', 'offering Remove');

    await rig.control.onAction();
    eq(refreshes, 1, 'an unconfirmed presentation triggers exactly one getSetupState refresh');
    eq(rig.control.currentState(), 'disabled', 'and the control now presents the AUTHORITATIVE non-live state');
    eq(rig.control.currentAction(), 'install', 'offering Set up again');
    assert(rig.logs.every((l) => !/may be stale/.test(l)),
      'no stale warning is emitted when the refresh succeeded — that would be crying wolf');
  }

  // -----------------------------------------------------------------------------------------------
  process.stdout.write('\n8. Delivery failure PLUS refresh failure keeps the prior presentation and says so\n');
  // -----------------------------------------------------------------------------------------------
  for (const failMode of ['throws', 'returns-not-ok']) {
    const rig = makeControl({
      remove: async () => ({ ok: true, reason: null, detail: null, retained: false, disposition: 'presentation-unconfirmed' }),
      getSetupState: async () => {
        if (failMode === 'throws') throw new Error('bridge gone');
        return { ok: false, reason: 'untrusted-sender' };
      },
    });
    rig.control.render(ipcMod.projectSetupState({ state: 'ready', detail: null }));

    await rig.control.onAction();
    eq(rig.control.currentState(), 'ready',
      `[${failMode}] the PRIOR presentation is retained — blanking it would assert a state we could not read`);
    const warned = rig.logs.filter((l) => /removal COMPLETED/.test(l) && /stale/.test(l));
    eq(warned.length, 1, `[${failMode}] exactly one bounded stale-presentation warning is emitted`);
    assert(/could not be refreshed/.test(warned[0]),
      `[${failMode}] it says the display could not be refreshed`);
    assert(/Reload the window/.test(warned[0]),
      `[${failMode}] and tells the operator how to resynchronise`);
    assert(warned[0].indexOf(os.tmpdir()) === -1 && !/[A-Za-z]:\\\\/.test(warned[0]),
      `[${failMode}] the warning is bounded: no path and no settings fragment reaches the log`);
  }

  // -----------------------------------------------------------------------------------------------
  process.stdout.write('\n9. A refusal is untouched by R3 — it is still the second outcome, not the third\n');
  // -----------------------------------------------------------------------------------------------
  {
    let refreshes = 0;
    const rig = makeControl({
      remove: async () => ({ ok: false, reason: 'removal-refused', detail: 'other-install-present', retained: true, disposition: null }),
      getSetupState: async () => { refreshes++; return { ok: true, setup: ipcMod.projectSetupState({ state: 'disabled' }) }; },
    });
    rig.control.render(ipcMod.projectSetupState({ state: 'ready', detail: null }));
    await rig.control.onAction();
    eq(refreshes, 0, 'a refusal does NOT trigger the R3 refresh path');
    eq(rig.control.currentState(), 'ready', 'and the retained refusal leaves the presentation exactly as it was');
    assert(rig.logs.some((l) => /refused/.test(l)), 'the refusal is still surfaced');
    assert(rig.logs.some((l) => /nothing was changed/.test(l)), 'still with the nothing-was-changed reassurance');
    assert(rig.logs.every((l) => !/stale/.test(l)), 'and never with a stale-presentation warning');
  }

  try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* best effort */ }
  process.stdout.write(`\npane-status-presentation: ${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
})();
