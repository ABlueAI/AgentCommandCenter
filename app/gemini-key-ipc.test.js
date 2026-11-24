'use strict';
// Run: node app/gemini-key-ipc.test.js
// Plain Node.js — no framework. Proves issue #161 is closed: the three Gemini key channels run the
// shared trusted-sender gate first, so a call from an untrusted sender, a subframe or another
// document is refused visibly and never reads or writes secure.json or the in-memory key. Uses the
// REAL gate (trusted-ipc-sender.js) with stub windows, plus source tripwires on main.js's wiring.

const fs = require('fs');
const path = require('path');
const { createGeminiKeyIpc } = require('./gemini-key-ipc');
const { createTrustedSenderGate } = require('./trusted-ipc-sender');

let passed = 0, failed = 0;
function assert(cond, label) {
  if (cond) { process.stdout.write(`  ✓ ${label}\n`); passed++; }
  else { process.stderr.write(`  ✗ FAIL: ${label}\n`); failed++; }
}

const ENTRY = 'file:///D:/Workspace/agent-command-center/app/renderer/index.html';
const KEY = 'AIzaSyTESTKEY0123456789';

// A trusted window whose main frame shows the entry document, plus a subframe and a foreign window.
function makeWorld() {
  const mainFrame = { url: ENTRY };
  const wc = { mainFrame };
  const win = { isDestroyed: () => false, webContents: wc };
  const subFrame = { url: ENTRY };
  const otherMain = { url: ENTRY };
  const otherWc = { mainFrame: otherMain };
  return {
    win,
    trusted: { sender: wc, senderFrame: mainFrame },
    subframe: { sender: wc, senderFrame: subFrame },
    foreign: { sender: otherWc, senderFrame: otherMain },
    otherDoc: () => { mainFrame.url = 'https://evil.example/'; return { sender: wc, senderFrame: mainFrame }; },
  };
}

function makeIpc(over) {
  const world = makeWorld();
  const gate = createTrustedSenderGate({ entryUrl: ENTRY, getTrustedWindow: () => world.win });
  const store = { other: 'kept' };
  const calls = { load: 0, save: 0, encrypt: 0, setKey: 0 };
  const logs = [];
  let key = null;
  const ipc = createGeminiKeyIpc(Object.assign({
    assessSender: (e) => gate.assess(e),
    isEncryptionAvailable: () => true,
    encryptString: (plain) => { calls.encrypt++; return Buffer.from(`enc:${plain}`); },
    loadSecure: () => { calls.load++; return JSON.parse(JSON.stringify(store)); },
    saveSecure: (s) => { calls.save++; for (const k of Object.keys(store)) delete store[k]; Object.assign(store, s); },
    getKey: () => key,
    setKey: (k) => { calls.setKey++; key = k; },
    logRefusal: (line) => logs.push(line),
  }, over || {}));
  return { ipc, world, store, calls, logs, getKey: () => key, setKeyDirect: (k) => { key = k; } };
}

// --- constructor ---------------------------------------------------------------------------------
{
  let threw = 0;
  for (const missing of ['assessSender', 'isEncryptionAvailable', 'encryptString', 'loadSecure', 'saveSecure', 'getKey', 'setKey', 'logRefusal']) {
    const deps = {
      assessSender() {}, isEncryptionAvailable() {}, encryptString() {}, loadSecure() {},
      saveSecure() {}, getKey() {}, setKey() {}, logRefusal() {},
    };
    delete deps[missing];
    try { createGeminiKeyIpc(deps); } catch { threw++; }
  }
  assert(threw === 8, 'constructor throws when any dependency is missing');
}

// --- trusted sender: the three channels work as before -------------------------------------------
{
  const t = makeIpc();
  const st = t.ipc.handleStatus(t.world.trusted);
  assert(st.ok === true && st.hasKey === false && st.available === true, 'trusted status: no key yet, encryption available');
  const r = t.ipc.handleSet(t.world.trusted, `  ${KEY}  `);
  assert(r.ok === true && t.getKey() === KEY, 'trusted save: stores the trimmed key in memory');
  assert(t.store.geminiKeyEnc === Buffer.from(`enc:${KEY}`).toString('base64') && t.store.other === 'kept',
    'trusted save: writes only the ciphertext to secure.json and keeps other entries');
  assert(t.ipc.handleStatus(t.world.trusted).hasKey === true, 'trusted status after save: hasKey true');
  assert(!JSON.stringify(t.ipc.handleStatus(t.world.trusted)).includes(KEY), 'status never returns the key');
  const c = t.ipc.handleClear(t.world.trusted);
  assert(c.ok === true && t.getKey() === null && !('geminiKeyEnc' in t.store) && t.store.other === 'kept',
    'trusted clear: removes the key from memory and secure.json, keeps other entries');
  assert(t.logs.length === 0, 'trusted calls log no refusal');
}

// --- untrusted senders: refused, visibly, with no read or write ----------------------------------
for (const [label, pick, reason] of [
  ['another window', (w) => w.foreign, 'untrusted-sender'],
  ['a subframe of Mako\'s window', (w) => w.subframe, 'not-main-frame'],
  ['another document in Mako\'s window', (w) => w.otherDoc(), 'untrusted-document'],
  ['no event at all', () => undefined, 'untrusted-sender'],
]) {
  {
    const t = makeIpc();
    t.setKeyDirect('EXISTING');
    t.store.geminiKeyEnc = 'b2xk';
    const r = t.ipc.handleSet(pick(t.world), KEY);
    assert(r.ok === false && r.error === reason, `${label}: save refused (${reason})`);
    assert(t.calls.load === 0 && t.calls.save === 0 && t.calls.encrypt === 0 && t.calls.setKey === 0,
      `${label}: save neither encrypts nor reads nor writes secure.json`);
    assert(t.getKey() === 'EXISTING' && t.store.geminiKeyEnc === 'b2xk', `${label}: the stored key is not overwritten`);
    assert(t.logs.length === 1 && t.logs[0] === `Gemini key save refused: ${reason}` && !t.logs[0].includes(KEY),
      `${label}: save refusal logged once, without the key`);
  }
  {
    const t = makeIpc();
    t.setKeyDirect('EXISTING');
    t.store.geminiKeyEnc = 'b2xk';
    const r = t.ipc.handleClear(pick(t.world));
    assert(r.ok === false && r.error === reason, `${label}: clear refused (${reason})`);
    assert(t.calls.load === 0 && t.calls.save === 0 && t.calls.setKey === 0, `${label}: clear writes nothing`);
    assert(t.getKey() === 'EXISTING' && t.store.geminiKeyEnc === 'b2xk', `${label}: the stored key is not cleared`);
    assert(t.logs.length === 1 && t.logs[0] === `Gemini key clear refused: ${reason}`, `${label}: clear refusal logged once`);
  }
  {
    const t = makeIpc();
    t.setKeyDirect('EXISTING');
    const r = t.ipc.handleStatus(pick(t.world));
    assert(r.ok === false && r.error === reason && !('hasKey' in r) && !('available' in r),
      `${label}: status refused and says nothing about the key`);
    assert(t.logs.length === 1 && t.logs[0] === `Gemini key status refused: ${reason}`, `${label}: status refusal logged once`);
  }
}
{
  const t = makeIpc();
  t.world.win.isDestroyed = () => true;
  const r = t.ipc.handleSet(t.world.trusted, KEY);
  assert(r.ok === false && r.error === 'no-trusted-window' && t.calls.save === 0, 'a destroyed trusted window refuses every save');
}

// --- trusted sender, bad input or a failing store: visible refusal, nothing half-done -----------
for (const bad of ['', '   ', null, 42, { key: KEY }]) {
  const t = makeIpc();
  const r = t.ipc.handleSet(t.world.trusted, bad);
  assert(r.ok === false && r.error === 'key is empty' && t.calls.save === 0 && t.logs.length === 1,
    `empty or non-string key (${JSON.stringify(bad)}): refused visibly, nothing written`);
}
{
  const t = makeIpc({ isEncryptionAvailable: () => false });
  const r = t.ipc.handleSet(t.world.trusted, KEY);
  assert(r.ok === false && /safeStorage/.test(r.error) && t.calls.save === 0 && t.getKey() === null,
    'no safeStorage: save refused, nothing written, no plaintext fallback');
}
{
  const t = makeIpc({ encryptString: () => { throw new Error(`boom ${KEY}`); } });
  const r = t.ipc.handleSet(t.world.trusted, KEY);
  assert(r.ok === false && !r.error.includes(KEY) && t.getKey() === null && t.calls.save === 0,
    'encryption failure: refused without echoing the error text, key not kept in memory');
  assert(t.logs.length === 1 && !t.logs[0].includes(KEY), 'encryption failure: logged once, without the key');
}
{
  const t = makeIpc({ saveSecure: () => { throw new Error('EPERM'); } });
  const r = t.ipc.handleSet(t.world.trusted, KEY);
  assert(r.ok === false && t.getKey() === null && t.logs.length === 1, 'save write failure: refused visibly, key not kept in memory');
}
{
  const t = makeIpc({ saveSecure: () => { throw new Error('EPERM'); } });
  t.setKeyDirect('EXISTING');
  const r = t.ipc.handleClear(t.world.trusted);
  assert(r.ok === false && /still stored/.test(r.error) && t.getKey() === 'EXISTING' && t.logs.length === 1,
    'clear write failure: refused visibly, says the key is still stored, memory unchanged');
}

// --- main.js and preload wiring (source tripwires) ----------------------------------------------
{
  const src = fs.readFileSync(path.join(__dirname, 'main.js'), 'utf8');
  const wiring = [
    ["get-gemini-key-status", 'geminiKeyIpc.handleStatus(e)'],
    ["set-gemini-key", 'geminiKeyIpc.handleSet(e, key)'],
    ["clear-gemini-key", 'geminiKeyIpc.handleClear(e)'],
  ];
  for (const [ch, call] of wiring) {
    const re = new RegExp(`ipcMain\\.handle\\('${ch}'`, 'g');
    const count = (src.match(re) || []).length;
    const i = src.indexOf(`ipcMain.handle('${ch}'`);
    const line = i < 0 ? '' : src.slice(i, src.indexOf('\n', i));
    assert(count === 1 && line.includes(call), `${ch}: registered once, and only through the gated module`);
  }
  const ci = src.indexOf('createGeminiKeyIpc({');
  const block = ci < 0 ? '' : src.slice(ci, src.indexOf('\n});', ci));
  assert(/assessSender:\s*\(e\)\s*=>\s*launcherGate\.assess\(e\)/.test(block),
    'main.js gives the module the same trusted-sender gate as the ABlueAgent token channels');
  assert(/win\.webContents\.send\('main-error', line\)/.test(block), 'main.js shows refusals on the main-error channel');
  assert(!/geminiKeyEnc/.test(src.slice(src.indexOf('ipcMain.handle(\'clear-gemini-key\''), src.indexOf('ipcMain.handle(\'pick-folder\''))),
    'no ungated secure.json write is left next to the Gemini channels');
  const preload = fs.readFileSync(path.join(__dirname, 'preload.js'), 'utf8');
  assert(!/getGeminiKey\s*:|readGeminiKey/.test(preload), 'preload has no way to read the key back');
}

process.stdout.write(`\ngemini-key-ipc: ${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
