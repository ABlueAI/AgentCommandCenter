'use strict';
// Run: node app/ensure-output-dir-lock.test.js
//
// WO-7 PART A — SERIALISATION AND DEADLOCK-FREEDOM, against the REAL `ensure-output-dir` handler.
//
// The WO-7 reviewer's verdict asked for exactly this and it was never written: "fire N parallel
// ensure-output-dir calls, assert all N trust entries survive AND all N promises settle". A manual
// click-through cannot show a lost update; only concurrent execution can.
//
// The other half of that verdict — that a stuck lock would "silently hang every future sandbox
// launch for every fenced role, app-wide, with no crash to point at" — is exercised here by forcing
// a mid-critical-section failure and then proving the NEXT call still acquires. That is the
// `finally { release() }` guarantee, measured rather than reasoned about.
//
// SAFETY: `USERPROFILE` is redirected to a disposable fixture, so the real `~/.claude.json` is never
// read, written, renamed, or permission-modified. No Electron process, no PTY, no provider call.

const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

let passed = 0, failed = 0, outstanding = [];
function assert(cond, label) {
  if (cond) { process.stdout.write('  ✓ ' + label + '\n'); passed++; }
  else { process.stderr.write('  x FAIL: ' + label + '\n'); failed++; }
}
function section(t) { process.stdout.write('\n' + t + '\n'); }

function makeFixtureRoot() {
  for (const base of [path.parse(__dirname).root, os.tmpdir()]) {
    try { return fs.mkdtempSync(path.join(base, 'bh-wo7-lock-')); } catch (e) { /* next */ }
  }
  throw new Error('no writable fixture root');
}
const FIX = makeFixtureRoot();
const USER_DATA = path.join(FIX, 'userData');
const HOME = path.join(FIX, 'home');
const PROJECTS = path.join(FIX, 'projects');
fs.mkdirSync(USER_DATA, { recursive: true });
fs.mkdirSync(HOME, { recursive: true });
fs.mkdirSync(PROJECTS, { recursive: true });
fs.writeFileSync(path.join(USER_DATA, 'settings.json'), JSON.stringify({ projectsRoot: PROJECTS, selectedRepo: '' }));
const CLAUDE_JSON = path.join(HOME, '.claude.json');

const record = { handled: new Map(), on: new Map() };
function electronStub() {
  const mainFrame = { url: 'file:///x' };
  const wc = { mainFrame, on() {}, send() {}, setWindowOpenHandler() {}, openDevTools() {}, session: { setPermissionRequestHandler() {}, setPermissionCheckHandler() {} } };
  const w = new Proxy({ webContents: wc, isDestroyed: () => false }, { get(t, k) { return k in t ? t[k] : () => {}; } });
  class BrowserWindow { constructor() { return w; } static getAllWindows() { return []; } }
  return {
    app: { whenReady: () => Promise.resolve(), getPath: (n) => (n === 'userData' ? USER_DATA : HOME), setAppUserModelId() {}, on() {}, quit() {}, requestSingleInstanceLock() { throw new Error('no'); } },
    BrowserWindow,
    ipcMain: { handle(ch, fn) { record.handled.set(ch, fn); }, on(ch, fn) { record.on.set(ch, fn); } },
    shell: { openExternal: async () => {}, openPath: async () => {} },
    dialog: { showOpenDialog: async () => ({ canceled: true, filePaths: [] }) },
    session: { defaultSession: { setPermissionRequestHandler() {}, setPermissionCheckHandler() {} } },
    safeStorage: { isEncryptionAvailable: () => false, encryptString: (s) => Buffer.from(s), decryptString: (b) => Buffer.from(b).toString() },
    clipboard: { readText: () => '', writeText: () => {} },
  };
}
const realLoad = Module._load;
const prevUser = process.env.USERPROFILE;
process.env.USERPROFILE = HOME;
Module._load = function (request) {
  if (request === 'electron') return electronStub();
  if (request === '@lydell/node-pty') return { spawn() { throw new Error('no PTY in this suite'); } };
  return realLoad.apply(this, arguments);
};

const readTrust = () => {
  try { return JSON.parse(fs.readFileSync(CLAUDE_JSON, 'utf8')).projects || {}; }
  catch (e) { return {}; }
};

(async () => {
  require(path.join(__dirname, 'main.js'));
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));
  Module._load = realLoad;
  const ensure = record.handled.get('ensure-output-dir');

  section('PRECONDITIONS');
  assert(typeof ensure === 'function', 'the real ensure-output-dir handler is registered');
  assert(!fs.existsSync(CLAUDE_JSON), 'the fixture starts with no .claude.json');

  section('SERIALISATION — N concurrent calls, no lost update');
  {
    const N = 20;
    // Distinct roles AND distinct calls: this part measures the LOCK, so every call must produce a
    // different trust key. Same-role uniqueness is a separate property, measured in its own suite.
    const results = await Promise.all(
      Array.from({ length: N }, (_, i) => ensure({}, { role: 'lockrole' + i }))
    );
    assert(results.length === N, 'all ' + N + ' promises settled');
    assert(results.every((r) => r && r.ok === true), 'every call reported ok');
    const dirs = new Set(results.map((r) => r.dir));
    assert(dirs.size === N, 'every call produced a distinct sandbox directory');
    const trust = readTrust();
    const keys = results.map((r) => r.dir.replace(/\\/g, '/'));
    const surviving = keys.filter((k) => Object.prototype.hasOwnProperty.call(trust, k));
    assert(surviving.length === N,
      'ALL ' + N + ' trust entries survived (' + surviving.length + '/' + N + ') — no lost update');
    assert(keys.every((k) => trust[k] && trust[k].hasTrustDialogAccepted === true),
      'and each surviving entry is the fully-formed pre-trust record');
  }

  section('DEADLOCK-FREEDOM — a failure inside the critical section still releases the lock');
  {
    // Corrupt content makes JSON.parse throw INSIDE the lock: the exact path whose unreleased lock
    // would silently hang every future sandbox launch app-wide.
    const good = fs.readFileSync(CLAUDE_JSON, 'utf8');
    fs.writeFileSync(CLAUDE_JSON, '{ this is not json', 'utf8');
    const during = await ensure({}, { role: 'parsefail' });
    assert(during && during.ok === true,
      'a corrupt trust file does NOT block the sandbox launch (best-effort write, as designed)');
    assert(fs.existsSync(during.dir), 'and the sandbox directory still exists');
    fs.writeFileSync(CLAUDE_JSON, good, 'utf8');

    const after = await Promise.race([
      ensure({}, { role: 'afterparsefail' }),
      new Promise((r) => setTimeout(() => r({ ok: false, timedOut: true }), 5000)),
    ]);
    assert(after && after.ok === true && !after.timedOut,
      'the NEXT call still ACQUIRES the lock — finally { release() } fired on the throw path');
    const trust = readTrust();
    assert(Object.prototype.hasOwnProperty.call(trust, after.dir.replace(/\\/g, '/')),
      'and its trust entry was written, proving the critical section really ran again');
  }
  {
    // A rename failure is the other documented throw path: renaming onto a DIRECTORY fails.
    const good = fs.readFileSync(CLAUDE_JSON, 'utf8');
    fs.rmSync(CLAUDE_JSON, { force: true });
    fs.mkdirSync(CLAUDE_JSON, { recursive: true });
    const during = await ensure({}, { role: 'renamefail' });
    assert(during && during.ok === true, 'a failing rename does not block the launch either');
    fs.rmSync(CLAUDE_JSON, { recursive: true, force: true });
    fs.writeFileSync(CLAUDE_JSON, good, 'utf8');
    const after = await Promise.race([
      ensure({}, { role: 'afterrenamefail' }),
      new Promise((r) => setTimeout(() => r({ ok: false, timedOut: true }), 5000)),
    ]);
    assert(after && after.ok === true && !after.timedOut, 'and the lock is still free afterwards');
  }

  section('READ-ONLY / PERMISSION PATH — disposable fixture only, never real user configuration');
  {
    // Attempted against a fixture file with icacls. If this machine will not actually produce a
    // denial for the owning user, the evidence is RETAINED AS OUTSTANDING rather than claimed.
    let denied = false;
    try {
      const { execFileSync } = require('child_process');
      const who = (process.env.USERDOMAIN || '') + '\\' + (process.env.USERNAME || '');
      execFileSync('icacls', [CLAUDE_JSON, '/deny', who + ':(W)'], { stdio: ['ignore', 'ignore', 'ignore'] });
      try { fs.appendFileSync(CLAUDE_JSON, 'x'); } catch (e) { denied = true; }
    } catch (e) { /* icacls unavailable */ }

    if (denied) {
      const r = await ensure({}, { role: 'readonly' });
      assert(r && r.ok === true, 'a write-denied trust file does NOT block the sandbox launch');
      assert(fs.existsSync(r.dir), 'and the sandbox directory is still created');
      const after = await Promise.race([
        ensure({}, { role: 'afterreadonly' }),
        new Promise((res) => setTimeout(() => res({ ok: false, timedOut: true }), 5000)),
      ]);
      assert(after && after.ok === true && !after.timedOut, 'and the lock is released after the denial');
    } else {
      outstanding.push('WO-7 read-only/EACCES path: this machine did not produce a write denial for '
        + 'the owning user via icacls on a fixture file, so the permission-failure path is NOT proven. '
        + 'Retained as OUTSTANDING; WO-7 is not claimed complete on this axis.');
      process.stdout.write('  ! OUTSTANDING: fixture write-denial not reproducible on this machine\n');
    }
    try {
      const { execFileSync } = require('child_process');
      const who = (process.env.USERDOMAIN || '') + '\\' + (process.env.USERNAME || '');
      execFileSync('icacls', [CLAUDE_JSON, '/remove:d', who], { stdio: ['ignore', 'ignore', 'ignore'] });
    } catch (e) { /* best effort */ }
  }

  process.env.USERPROFILE = prevUser;
  try { fs.rmSync(FIX, { recursive: true, force: true }); } catch (e) { /* best effort */ }
  if (outstanding.length) {
    process.stdout.write('\nOUTSTANDING EVIDENCE (not a pass, not a failure):\n');
    for (const o of outstanding) process.stdout.write('  - ' + o + '\n');
  }
  process.stdout.write('\nensure-output-dir-lock: ' + passed + ' passed, ' + failed + ' failed\n');
  process.exit(failed ? 1 : 0);
})();
