'use strict';
// Run: node app/pane-status/pane-status-ipc.test.js
//
// The IPC boundary. Two properties are asserted here that no amount of careful handler code could give
// on its own: every handler refuses an untrusted sender BEFORE doing anything, and nothing that crosses
// the boundary carries a path, a token, or settings content.

const fs = require('fs');
const path = require('path');
const ipcMod = require('./pane-status-ipc');

let passed = 0, failed = 0;
function assert(cond, label) {
  if (cond) { process.stdout.write(`  ✓ ${label}\n`); passed++; }
  else { process.stderr.write(`  ✗ FAIL: ${label}\n`); failed++; }
}

// A stub ipcMain that records handlers so the test can invoke them directly.
function makeIpcMain() {
  const handlers = new Map();
  return { handle: (ch, fn) => handlers.set(ch, fn), invoke: (ch, ev) => handlers.get(ch)(ev), handlers };
}

const TRUSTED = { sender: 'trusted-wc', senderFrame: 'main-frame' };
const UNTRUSTED = { sender: 'evil-wc', senderFrame: 'sub-frame' };
function makeGate() {
  return { assess: (ev) => (ev === TRUSTED ? { ok: true } : { ok: false, reason: 'untrusted-sender' }) };
}

function makeController(over) {
  const calls = [];
  const base = {
    getSetupState: () => ({
      state: 'ready', detail: null, versionSupported: true, versionReason: null,
      installedEvents: ['SessionStart'], worstCaseStaleMs: 125000,
      // These two MUST NOT cross the boundary:
      // Path-shaped sentinels. Deliberately NOT a literal real settings location — the isolation
      // suite scans every test file for one of those, and a sentinel is no reason to weaken that scan.
      lockPath: 'C:\\Users\\real\\SENTINEL-LOCK\\.pane-status.lock',
      descriptorPath: 'C:\\Users\\real\\SENTINEL-DESC\\pane-status-installation.json',
    }),
    install: async () => { calls.push('install'); return { ok: true }; },
    remove: async () => { calls.push('remove'); return { ok: true }; },
    clearStaleLock: async () => { calls.push('clearStaleLock'); return { ok: true }; },
  };
  return { controller: Object.assign(base, over || {}), calls };
}

(async () => {
  // ---------------------------------------------------------------- exactly four invokes
  {
    const ipcMain = makeIpcMain();
    const { controller } = makeController();
    ipcMod.registerPaneStatusIpc({ ipcMain, trustedSenderGate: makeGate(), controller, confirmNatively: async () => true });
    assert(ipcMain.handlers.size === 4, 'exactly FOUR invoke channels are registered');
    for (const ch of [ipcMod.CHANNELS.GET_SETUP_STATE, ipcMod.CHANNELS.INSTALL, ipcMod.CHANNELS.REMOVE, ipcMod.CHANNELS.CLEAR_STALE_LOCK]) {
      assert(ipcMain.handlers.has(ch), `channel ${ch} is registered`);
    }
    for (const [, fn] of ipcMain.handlers) {
      assert(fn.length === 1, 'every handler takes ONLY the event — there is no request-body parameter');
    }
  }

  // ---------------------------------------------------------------- untrusted senders are refused
  {
    const ipcMain = makeIpcMain();
    const { controller, calls } = makeController();
    ipcMod.registerPaneStatusIpc({ ipcMain, trustedSenderGate: makeGate(), controller, confirmNatively: async () => true });
    for (const [ch] of ipcMain.handlers) {
      const res = await ipcMain.invoke(ch, UNTRUSTED);
      assert(res.ok === false && res.reason === ipcMod.IPC_REFUSAL.UNTRUSTED, `${ch} refuses an untrusted sender`);
    }
    assert(calls.length === 0, 'and NOTHING on the controller ran — the gate is checked BEFORE any work');
  }

  // ---------------------------------------------------------------- trusted senders work
  {
    const ipcMain = makeIpcMain();
    const { controller, calls } = makeController();
    ipcMod.registerPaneStatusIpc({ ipcMain, trustedSenderGate: makeGate(), controller, confirmNatively: async () => true });
    assert((await ipcMain.invoke(ipcMod.CHANNELS.GET_SETUP_STATE, TRUSTED)).ok === true, 'a trusted getSetupState works');
    assert((await ipcMain.invoke(ipcMod.CHANNELS.INSTALL, TRUSTED)).ok === true, 'a trusted install works');
    assert((await ipcMain.invoke(ipcMod.CHANNELS.REMOVE, TRUSTED)).ok === true, 'a trusted remove works');
    assert(calls.includes('install') && calls.includes('remove'), 'and the controller was actually called');
  }

  // ---------------------------------------------------------------- no paths or tokens cross
  {
    const ipcMain = makeIpcMain();
    const { controller } = makeController();
    ipcMod.registerPaneStatusIpc({ ipcMain, trustedSenderGate: makeGate(), controller, confirmNatively: async () => true });
    const res = await ipcMain.invoke(ipcMod.CHANNELS.GET_SETUP_STATE, TRUSTED);
    const json = JSON.stringify(res);
    assert(json.indexOf('.pane-status.lock') === -1, 'the LOCK PATH does not cross the IPC boundary');
    assert(json.indexOf('pane-status-installation.json') === -1, 'the DESCRIPTOR PATH does not cross');
    assert(json.indexOf('C:\\') === -1 && json.indexOf('C:/') === -1, 'no absolute path of any kind crosses');
    const keys = Object.keys(res.setup).sort().join(',');
    assert(keys === 'detail,installedEvents,state,versionReason,versionSupported,worstCaseStaleMs',
      'the projected setup state has EXACTLY the documented keys: ' + keys);
  }

  // a field added to the controller does not silently become renderer-visible
  {
    const ipcMain = makeIpcMain();
    const { controller } = makeController({
      getSetupState: () => ({ state: 'ready', secretlyAdded: 'C:\\Users\\real\\SENTINEL-NEW-FIELD\\settings.json' }),
    });
    ipcMod.registerPaneStatusIpc({ ipcMain, trustedSenderGate: makeGate(), controller, confirmNatively: async () => true });
    const res = await ipcMain.invoke(ipcMod.CHANNELS.GET_SETUP_STATE, TRUSTED);
    assert(JSON.stringify(res).indexOf('secretlyAdded') === -1,
      'a NEW controller field does not cross the boundary — the projection is explicit, not a spread');
  }

  // ---------------------------------------------------------------- view projection drops a token
  {
    const projected = ipcMod.projectView({ paneId: 'pty1', state: 'working', reason: null, token: 'a'.repeat(64) });
    assert(Object.keys(projected).sort().join(',') === 'paneId,reason,state', 'a projected view has exactly three keys');
    assert(JSON.stringify(projected).indexOf('a'.repeat(64)) === -1,
      'even a view that WRONGLY carried a token is stripped on the way out');
  }

  // ---------------------------------------------------------------- clearStaleLock needs native confirmation
  {
    const ipcMain = makeIpcMain();
    const { controller, calls } = makeController();
    let asked = 0;
    ipcMod.registerPaneStatusIpc({
      ipcMain, trustedSenderGate: makeGate(), controller,
      confirmNatively: async () => { asked++; return false; },
    });
    const res = await ipcMain.invoke(ipcMod.CHANNELS.CLEAR_STALE_LOCK, TRUSTED);
    assert(res.ok === false && res.reason === ipcMod.IPC_REFUSAL.NOT_CONFIRMED, 'declining the native dialog refuses');
    assert(asked === 1, 'the native dialog was shown');
    assert(!calls.includes('clearStaleLock'), 'and the lock was never touched');
  }
  {
    const ipcMain = makeIpcMain();
    const { controller, calls } = makeController();
    let asked = 0;
    ipcMod.registerPaneStatusIpc({
      ipcMain, trustedSenderGate: makeGate(), controller,
      confirmNatively: async () => { asked++; return true; },
    });
    assert((await ipcMain.invoke(ipcMod.CHANNELS.CLEAR_STALE_LOCK, TRUSTED)).ok === true, 'confirming allows it');
    assert(calls.includes('clearStaleLock'), 'and the controller ran');
  }
  {
    // an UNTRUSTED sender must not even be able to make a dialog appear
    const ipcMain = makeIpcMain();
    const { controller } = makeController();
    let asked = 0;
    ipcMod.registerPaneStatusIpc({
      ipcMain, trustedSenderGate: makeGate(), controller,
      confirmNatively: async () => { asked++; return true; },
    });
    await ipcMain.invoke(ipcMod.CHANNELS.CLEAR_STALE_LOCK, UNTRUSTED);
    assert(asked === 0, 'an untrusted sender cannot even cause the native dialog to be shown');
  }
  {
    // no confirmer wired at all -> unavailable, never a silent yes
    const ipcMain = makeIpcMain();
    const { controller, calls } = makeController();
    ipcMod.registerPaneStatusIpc({ ipcMain, trustedSenderGate: makeGate(), controller });
    const res = await ipcMain.invoke(ipcMod.CHANNELS.CLEAR_STALE_LOCK, TRUSTED);
    assert(res.ok === false && res.reason === ipcMod.IPC_REFUSAL.UNAVAILABLE, 'no confirmer means unavailable');
    assert(!calls.includes('clearStaleLock'), 'and definitely not a silent yes');
  }
  {
    // a THROWING confirmer is a refusal
    const ipcMain = makeIpcMain();
    const { controller, calls } = makeController();
    ipcMod.registerPaneStatusIpc({
      ipcMain, trustedSenderGate: makeGate(), controller,
      confirmNatively: async () => { throw new Error('dialog exploded'); },
    });
    const res = await ipcMain.invoke(ipcMod.CHANNELS.CLEAR_STALE_LOCK, TRUSTED);
    assert(res.ok === false, 'a throwing confirmation dialog is a REFUSAL, not an approval');
    assert(!calls.includes('clearStaleLock'), 'and the lock is untouched');
  }

  // ---------------------------------------------------------------- what is deliberately absent
  {
    const src = fs.readFileSync(path.join(__dirname, 'pane-status-ipc.js'), 'utf8');
    const channels = Object.values(ipcMod.CHANNELS);
    assert(channels.length === 6, 'six channel constants: four invokes and two pushes');
    for (const forbidden of ['enroll', 'revoke', 'setState', 'setStatus', 'readSettings', 'writeSettings']) {
      assert(src.indexOf("CHANNELS." + forbidden) === -1, `there is no ${forbidden} channel`);
    }
    assert(!/ipcMain\.on\(/.test(src), 'there are no fire-and-forget ipcMain.on listeners, only guarded handles');
    const handleCount = (src.match(/ipcMain\.handle\(/g) || []).length;
    assert(handleCount === 4, 'exactly four ipcMain.handle calls exist in the module (' + handleCount + ')');
    const guardCount = (src.match(/guard\(CHANNELS\./g) || []).length;
    assert(guardCount === 4, 'and exactly four guard() calls — one per handler, none missing');
  }

  process.stdout.write(`\npane-status-ipc: ${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { process.stderr.write('UNCAUGHT: ' + (e && e.stack) + '\n'); process.exit(1); });
