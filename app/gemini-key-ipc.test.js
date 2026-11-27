'use strict';
// Run: node app/gemini-key-ipc.test.js
// Plain Node.js — no framework. Proves issue #161 is closed: the three Gemini key channels run the
// shared trusted-sender gate first, so a call from an untrusted sender, a subframe or another
// document is refused visibly and never reads or writes secure.json or the in-memory key. Uses the
// REAL gate (trusted-ipc-sender.js) with stub windows, plus source tripwires on main.js's wiring.

const fs = require('fs');
const crypto = require('crypto');
const os = require('os');
const path = require('path');
const { runInNewContext } = require('vm');
const { isAgentToken, normalizeAgentToken } = require('./agent-git-env');
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
const fsError = (code, msg) => Object.assign(new Error(msg || `${code}: operation not permitted ${KEY}`), { code });
{
  const t = makeIpc({ encryptString: () => { throw fsError('ERR_DPAPI'); } });
  const r = t.ipc.handleSet(t.world.trusted, KEY);
  assert(r.error === 'could not encrypt the key (safeStorage) [ERR_DPAPI]', 'encryption failure: names the step and only the error code');
}
{
  const t = makeIpc({ saveSecure: () => { throw fsError('EPERM'); } });
  const r = t.ipc.handleSet(t.world.trusted, KEY);
  assert(r.ok === false && t.getKey() === null && t.logs.length === 1, 'save write failure: refused visibly, key not kept in memory');
  assert(r.error === 'could not save secure.json [EPERM]' && !t.logs[0].includes(KEY),
    'save write failure: names the step and only the error code, never the message');
}
for (const [label, err] of [
  ['an error code holding the key', fsError(`E${KEY}`)],
  ['a lower-case code', fsError('eperm')],
  ['an error with no code', new Error(KEY)],
  ['a thrown string', KEY],
  ['a thrown null', null],
]) {
  const t = makeIpc({ saveSecure: () => { throw err; } });
  const r = t.ipc.handleSet(t.world.trusted, KEY);
  assert(r.error === 'could not save secure.json [no code]' && !t.logs[0].includes(KEY),
    `save write failure with ${label}: reported as [no code]`);
}
{
  const t = makeIpc({ saveSecure: () => { throw fsError('EBUSY'); } });
  t.setKeyDirect('EXISTING');
  const r = t.ipc.handleClear(t.world.trusted);
  assert(r.ok === false && r.error === 'could not save secure.json; the key is still stored [EBUSY]' &&
    t.getKey() === 'EXISTING' && t.logs.length === 1,
    'clear write failure: refused visibly, says the key is still stored, memory unchanged');
}
{
  const t = makeIpc({ loadSecure: () => { throw fsError('EACCES'); } });
  t.setKeyDirect('EXISTING');
  const r = t.ipc.handleClear(t.world.trusted);
  assert(r.ok === false && t.calls.save === 0 && t.getKey() === 'EXISTING', 'clear read failure: refused, nothing written');
}

// Exercise the main-process store and handler bodies in Node, with real files and stubbed OS/IPC
// boundaries. Fault injection works on Windows even when the test account can read every fixture.
// Windows checks main.js out CRLF (core.autocrlf), so normalise before matching on '\n'.
const mainSource = fs.readFileSync(path.join(__dirname, 'main.js'), 'utf8').replace(/\r\n/g, '\n');
function withSecureStore(run, { fileOps, decryptString } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mako-secure-test-'));
  try {
    const file = path.join(dir, 'secure.json');
    const logs = [];
    const dialogs = [];
    const handlers = new Map();
    const safeStorage = {
      isEncryptionAvailable: () => true,
      encryptString: (value) => Buffer.from(value),
      decryptString: decryptString || ((value) => value.toString()),
    };
    const storeSource = mainSource.slice(mainSource.indexOf('const securePath ='), mainSource.indexOf('\nlet win = null;'));
    const tokenSource = mainSource.slice(mainSource.indexOf("ipcMain.handle('get-agent-token-status'"),
      mainSource.indexOf('let agentTokenMissingNoticeSent'));
    const startupMatch = mainSource.match(/app\.whenReady\(\)\.then\(\(\) => \{\n((?:  load\w+\(\);[^\n]*\n)+)/);
    assert(!!startupMatch, 'main.js: app.whenReady() starts with the credential loader call(s)');
    if (!startupMatch) return;
    const startupCall = startupMatch[1];
    const store = runInNewContext(`${storeSource}\n${tokenSource}
      ({ loadSecure, saveSecure, startup: () => { ${startupCall} },
        flushNotices: (send) => flushCredentialNotices(send),
        getKey: () => geminiKey, getToken: () => agentGitToken })`, {
      app: { getPath: () => dir },
      fs: { ...fs, ...fileOps },
      path, crypto, Buffer, safeStorage, isAgentToken, normalizeAgentToken,
      dialog: { showErrorBox: (_title, message) => dialogs.push(message) },
      tlog: (line) => logs.push(line),
      launcherGate: { assess: () => ({ ok: true }) },
      ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) },
    });
    run({ ...store, dir, file, handlers, logs, dialogs });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function thrownBy(action) {
  try { action(); } catch (err) { return err; }
}

withSecureStore(({ loadSecure, file }) => {
  assert(JSON.stringify(loadSecure()) === '{}' && !fs.existsSync(file), 'secure store: only a missing file starts empty');
  for (const content of ['{"other":', 'null', '[]', '"not a store"']) {
    fs.writeFileSync(file, content);
    assert(!!thrownBy(loadSecure), `secure store: rejects invalid store ${content}`);
  }
});

const readError = fsError('EACCES');
withSecureStore(({ loadSecure }) => {
  assert(thrownBy(loadSecure) === readError, 'secure store: propagates a non-ENOENT read error');
}, { fileOps: { readFileSync: () => { throw readError; } } });

const previousStore = JSON.stringify({ other: 'kept' });
{
  let staged = false;
  withSecureStore(({ saveSecure, file, dir }) => {
    fs.writeFileSync(file, previousStore);
    saveSecure({ other: 'kept', added: true });
    assert(staged && fs.readFileSync(file, 'utf8') === '{"other":"kept","added":true}' &&
      fs.readdirSync(dir).join() === 'secure.json', 'secure save: stages in the same folder and replaces the original in one rename');
  }, { fileOps: { renameSync(from, to) {
    staged = from !== to && path.dirname(from) === path.dirname(to) &&
      fs.readFileSync(from, 'utf8') === '{"other":"kept","added":true}' &&
      fs.readFileSync(to, 'utf8') === previousStore;
    fs.renameSync(from, to);
  } } });
}

for (const step of ['writeFileSync', 'renameSync']) {
  const error = fsError('EIO');
  withSecureStore(({ saveSecure, file, dir }) => {
    fs.writeFileSync(file, previousStore);
    assert(thrownBy(() => saveSecure({ added: true })) === error &&
      fs.readFileSync(file, 'utf8') === previousStore && fs.readdirSync(dir).join() === 'secure.json',
    `secure save: failed ${step} leaves the original and cleans up the temporary file`);
  }, { fileOps: { [step](target) {
    if (step === 'writeFileSync') fs.writeFileSync(target, 'partial');
    throw error;
  } } });
}

const AGENT_TOKEN = 'ghp_' + 'A'.repeat(36);
const OTHER_TOKEN = 'ghp_' + 'B'.repeat(36);
const OTHER_KEY = KEY + '-new';
const credentials = {
  geminiKeyEnc: Buffer.from(KEY).toString('base64'),
  agentGitTokenEnc: Buffer.from(AGENT_TOKEN).toString('base64'),
};

withSecureStore(({ file, startup, handlers, getToken }) => {
  fs.writeFileSync(file, JSON.stringify({ ...credentials, other: 'kept' }));
  startup();
  const saved = handlers.get('set-agent-token')({}, OTHER_TOKEN);
  const afterSave = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert(saved.ok && getToken() === OTHER_TOKEN && afterSave.geminiKeyEnc === credentials.geminiKeyEnc &&
    afterSave.other === 'kept' && afterSave.agentGitTokenEnc === Buffer.from(OTHER_TOKEN).toString('base64'),
  'ABlueAgent save: replaces the token and preserves the rest of the store');
  const cleared = handlers.get('clear-agent-token')({});
  const afterClear = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert(cleared.ok && getToken() === null && afterClear.geminiKeyEnc === credentials.geminiKeyEnc &&
    afterClear.other === 'kept' && !('agentGitTokenEnc' in afterClear),
  'ABlueAgent clear: removes the token and preserves the rest of the store');
});

for (const failure of ['invalid JSON', 'read error']) {
  let refuseRead = false;
  const content = failure === 'invalid JSON' ? '{"other":' : JSON.stringify(credentials);
  for (const action of ['save', 'clear']) {
    withSecureStore(({ file, dir, loadSecure, saveSecure, startup, handlers, getToken }) => {
      refuseRead = false;
      fs.writeFileSync(file, JSON.stringify(credentials));
      startup();
      fs.writeFileSync(file, content);
      refuseRead = failure === 'read error';
      const gemini = makeIpc({ loadSecure, saveSecure });
      gemini.setKeyDirect(KEY);
      const result = action === 'save' ? gemini.ipc.handleSet(gemini.world.trusted, OTHER_KEY)
        : gemini.ipc.handleClear(gemini.world.trusted);
      assert(result.ok === false && /could not read secure\.json/.test(result.error) && gemini.logs.length === 1 &&
        gemini.getKey() === KEY && fs.readFileSync(file, 'utf8') === content,
      `Gemini ${action}: ${failure} is reported and the file and loaded key are kept`);
      // Restore the fixture so each caller faces the original failure even on the broken baseline.
      fs.writeFileSync(file, content);
      const handle = handlers.get(action === 'save' ? 'set-agent-token' : 'clear-agent-token');
      let tokenResult;
      const error = thrownBy(() => { tokenResult = handle({}, OTHER_TOKEN); });
      assert(!error && tokenResult?.ok === false && /could not read secure\.json/.test(tokenResult.error) &&
        getToken() === AGENT_TOKEN && fs.readFileSync(file, 'utf8') === content &&
        fs.readdirSync(dir).join() === 'secure.json',
      `ABlueAgent ${action}: ${failure} returns a visible refusal and keeps the file and loaded token`);
    }, { fileOps: { readFileSync(file, encoding) {
      if (refuseRead) throw readError;
      return fs.readFileSync(file, encoding);
    } } });
  }
}

for (const [channel, explanation] of [
  ['set-agent-token', 'could not save secure.json'],
  ['clear-agent-token', 'could not save secure.json'],
]) {
  withSecureStore(({ file, startup, handlers, getToken }) => {
    const content = JSON.stringify(credentials);
    fs.writeFileSync(file, content);
    startup();
    let result;
    const error = thrownBy(() => { result = handlers.get(channel)({}, OTHER_TOKEN); });
    assert(!error && result?.ok === false && result.error === explanation &&
      getToken() === AGENT_TOKEN && fs.readFileSync(file, 'utf8') === content,
    `${channel}: a failed replacement is reported and the loaded token is kept`);
  }, { fileOps: { renameSync: () => { throw fsError('EIO'); } } });
}

withSecureStore(({ file, startup, dialogs, getKey, getToken }) => {
  fs.writeFileSync(file, '{"other":');
  assert(!thrownBy(startup) && dialogs.length === 1 && /could not read secure\.json/i.test(dialogs[0]) &&
    getKey() === null && getToken() === null && fs.readFileSync(file, 'utf8') === '{"other":',
  'startup: a malformed store is reported once and the app can continue without the credentials');
});

// The startup dialog names a bounded reason, the folder and a recovery step, never the parse text,
// and the same reason is logged and queued for the Logs tab.
for (const [label, content, fileOps, reason] of [
  ['malformed JSON', '{"other":', undefined, 'not valid JSON'],
  ['a non-object store', '[]', undefined, 'not a JSON object'],
  ['a read error', '{}', { readFileSync: () => { throw fsError('EACCES'); } }, 'EACCES'],
]) {
  withSecureStore(({ file, dir, startup, dialogs, logs, flushNotices }) => {
    fs.writeFileSync(file, content);
    startup();
    const sent = [];
    flushNotices((line) => sent.push(line));
    assert(dialogs.length === 1 && dialogs[0].includes(`(${reason})`) && dialogs[0].includes(dir) &&
      /rename secure\.json/i.test(dialogs[0]) && !/Unexpected|JSON at position|must contain/.test(dialogs[0]),
    `startup: ${label} shows the bounded reason "${reason}", the folder and the recovery step`);
    assert(logs.length === 1 && logs[0].includes(`(${reason})`) && sent.length === 1 && sent[0] === logs[0],
    `startup: ${label} logs the same reason once and sends it to the Logs tab once the window exists`);
  }, { fileOps });
}

withSecureStore(({ file, startup, logs, dialogs, getKey, getToken, flushNotices }) => {
  fs.writeFileSync(file, JSON.stringify(credentials));
  startup();
  assert(logs.length === 1 && /^\[gemini\] stored Gemini key could not be decrypted$/.test(logs[0]) &&
    dialogs.length === 0 && getKey() === null && getToken() === AGENT_TOKEN,
  'startup: Gemini decryption failure logs one fixed line and the other credential still loads');
  const sent = [];
  flushNotices((line) => sent.push(line));
  flushNotices((line) => sent.push(line));
  assert(sent.length === 1 && sent[0] === logs[0],
    'startup: the Gemini decrypt notice reaches the Logs tab once the window exists, and only once');
}, { decryptString: (value) => {
  const text = value.toString();
  if (text === KEY) throw new Error(`test payload\n${KEY}`.repeat(100));
  return text;
} });

// --- main.js and preload wiring (source tripwires) ----------------------------------------------
{
  const src = mainSource;
  const wiring = [
    ["get-gemini-key-status", 'geminiKeyIpc.handleStatus(e)'],
    ["set-gemini-key", 'geminiKeyIpc.handleSet(e, key)'],
    ["clear-gemini-key", 'geminiKeyIpc.handleClear(e)'],
  ];
  for (const [ch, call] of wiring) {
    const re = new RegExp(`ipcMain\\.(handle|handleOnce|on|once)\\(\\s*['"\`]${ch}['"\`]`, 'g');
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
  const cw = src.slice(src.indexOf('function createWindow()'), src.indexOf('\napp.whenReady()'));
  assert(/webContents\.once\('did-finish-load', \(\) => flushCredentialNotices\(/.test(cw) &&
    /flushCredentialNotices\([\s\S]*?send\('main-error', line\)/.test(cw),
  'main.js: createWindow sends queued startup credential notices on main-error once the page has loaded');
  // The stored key's field is read only by the startup loader; every write goes through the module.
  const li = src.indexOf('function loadGeminiKey(');
  const loader = li < 0 ? '' : src.slice(li, src.indexOf('\n}', li));
  const outside = (src.match(/geminiKeyEnc/g) || []).length - (loader.match(/geminiKeyEnc/g) || []).length;
  assert(loader.includes('geminiKeyEnc') && outside === 0,
    'main.js touches geminiKeyEnc only in loadGeminiKey: no ungated secure.json write is left');
  assert(!/geminiKey\s*=(?!=)/.test(src.replace(loader, '').replace(/setKey:\s*\(k\)\s*=>\s*\{\s*geminiKey = k;\s*\}/, '').replace(/let geminiKey = null;/, '')),
    'main.js sets the in-memory key only at startup and through the gated module');

  // Renderer: a refused status is logged and never read as "no key"; a refused clear keeps the banner.
  const app = fs.readFileSync(path.join(__dirname, 'renderer', 'app.js'), 'utf8');
  const fi = app.indexOf('async function geminiKeyStatusOrLog()');
  const helper = fi < 0 ? '' : app.slice(fi, app.indexOf('\n}', fi));
  assert(/if \(ks && ks\.ok\) return ks;/.test(helper) && /appendLog\(`\[key\] status check refused: /.test(helper) && /return null;/.test(helper),
    'renderer: a refused status check is logged with its reason and returned as null');
  assert((app.match(/cc\.getGeminiKeyStatus\(\)/g) || []).length === 1 && helper.includes('cc.getGeminiKeyStatus()'),
    'renderer: every Gemini status call goes through that helper');
  const ci2 = app.indexOf("$('#geminiKeyClear').onclick");
  const clear = ci2 < 0 ? '' : app.slice(ci2, app.indexOf('\n  };', ci2));
  assert(/const r = await cc\.clearGeminiKey\(\);/.test(clear) &&
    /if \(r && r\.ok\) updateKeyBanner\(\{ hasKey: false \}\);/.test(clear) &&
    /else appendLog\(`\[key\] clear failed: /.test(clear) &&
    (clear.match(/updateKeyBanner/g) || []).length === 1,
    'renderer: Clear shows "no key" only after main says ok, and logs a refusal');
  const tokenClear = app.match(/\$\('#agentTokenClear'\)\.onclick = async \(\) => \{[\s\S]*?\n  \};/)[0];
  assert(/if \(r && r\.ok\) updateAgentTokenBanner/.test(tokenClear) &&
    /else appendLog\(.*clear failed: .*r\.error/.test(tokenClear),
    'renderer: token Clear displays the refusal and keeps the stored banner');
  // Startup credential notices go out on main-error as soon as the page has loaded, so boot() must
  // listen before its first await (ipcRenderer drops a message that arrives with no listener).
  const bootAt = app.indexOf('async function boot() {');
  const bootBody = (bootAt < 0 ? '' : app.slice(bootAt, app.indexOf('\n}\n', bootAt)))
    .replace(/^\s*\/\/.*$/gm, ''); // comments may say "await"; only code counts
  const firstAwait = bootBody.search(/\bawait\b/);
  const errorAt = bootBody.indexOf("cc.onMainError(");
  const infoAt = bootBody.indexOf("cc.onMainInfo(");
  assert(errorAt > 0 && infoAt > 0 && firstAwait > 0 && errorAt < firstAwait && infoAt < firstAwait &&
    (bootBody.match(/cc\.onMainError\(/g) || []).length === 1,
  'renderer: boot() registers the main-error and main-info listeners once, before its first await');
  const preload = fs.readFileSync(path.join(__dirname, 'preload.js'), 'utf8');
  assert(!/getGeminiKey\s*:|readGeminiKey/.test(preload), 'preload has no way to read the key back');
}

process.stdout.write(`\ngemini-key-ipc: ${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
