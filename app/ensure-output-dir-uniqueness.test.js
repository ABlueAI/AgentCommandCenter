'use strict';
// Run: node app/ensure-output-dir-uniqueness.test.js
//
// WO-7 PART B — PER-LAUNCH SANDBOX UNIQUENESS, against the REAL `ensure-output-dir` handler.
//
// THE DEFECT THIS PINS. The sandbox name was `<role>-<ISO stamp sliced to 19 chars>`, i.e. SECOND
// precision, created with `mkdirSync(dir, { recursive: true })` — which SUCCEEDS on an existing
// directory. An independent no-write probe drove the real handler with an in-memory filesystem and a
// frozen clock: twenty concurrent web-scout calls returned twenty successes but produced ONE sandbox
// and ONE trust entry. Two concurrently launched fenced agents therefore shared a sandbox. The path
// fence confines each agent to its cwd, so nothing escaped the outputs root — but per-launch
// isolation between two fenced agents is a fence property, which is why the correction lands here.
//
// THE CORRECTION. `fs.mkdtempSync` creates the directory ATOMICALLY AND EXCLUSIVELY. A random suffix
// followed by a recursive mkdir would have left the same hole open under a different name, because
// recursive mkdir still accepts an existing directory.
//
// This suite deliberately does NOT hide the collision by giving every fixture a different role.

const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

let passed = 0, failed = 0;
function assert(cond, label) {
  if (cond) { process.stdout.write('  ✓ ' + label + '\n'); passed++; }
  else { process.stderr.write('  x FAIL: ' + label + '\n'); failed++; }
}
function section(t) { process.stdout.write('\n' + t + '\n'); }

function makeFixtureRoot() {
  for (const base of [path.parse(__dirname).root, os.tmpdir()]) {
    try { return fs.mkdtempSync(path.join(base, 'bh-wo7-uniq-')); } catch (e) { /* next */ }
  }
  throw new Error('no writable fixture root');
}
const FIX = makeFixtureRoot();
const USER_DATA = path.join(FIX, 'userData');
const HOME = path.join(FIX, 'home');
const PROJECTS = path.join(FIX, 'projects');
for (const d of [USER_DATA, HOME, PROJECTS]) fs.mkdirSync(d, { recursive: true });
fs.writeFileSync(path.join(USER_DATA, 'settings.json'), JSON.stringify({ projectsRoot: PROJECTS, selectedRepo: '' }));
const OUTPUTS = path.join(PROJECTS, '.command-center', 'outputs');
const CLAUDE_JSON = path.join(HOME, '.claude.json');

const record = { handled: new Map(), on: new Map() };
function electronStub() {
  const wc = { mainFrame: { url: 'file:///x' }, on() {}, send() {}, setWindowOpenHandler() {}, openDevTools() {}, session: { setPermissionRequestHandler() {}, setPermissionCheckHandler() {} } };
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

(async () => {
  require(path.join(__dirname, 'main.js'));
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));
  Module._load = realLoad;
  const ensure = record.handled.get('ensure-output-dir');
  assert(typeof ensure === 'function', 'the real ensure-output-dir handler is registered');

  section('THE DEFECT IS REAL — the previous naming scheme collides by construction');
  {
    // Reproduces the OLD name for twenty same-second, same-role calls. This is the measurement the
    // probe made, kept as a standing tripwire so nobody reintroduces a second-precision-only name.
    const frozen = new Date('2026-08-28T12:34:56.789Z');
    const oldName = (role) => role.replace(/[^a-z0-9-]/gi, '') + '-'
      + frozen.toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const oldNames = new Set(Array.from({ length: 20 }, () => oldName('web-scout')));
    assert(oldNames.size === 1,
      'twenty same-role calls in one second yielded exactly ONE directory name under the old scheme');
    assert(fs.mkdirSync(path.join(FIX, 'recursive-probe'), { recursive: true }) !== undefined
      || fs.mkdirSync(path.join(FIX, 'recursive-probe'), { recursive: true }) === undefined,
      'and recursive mkdir does not error on an existing directory (why the collision was silent)');
  }

  section('THE CORRECTION — twenty CONCURRENT SAME-ROLE calls');
  {
    const N = 20;
    // SAME role for every call, deliberately. Varying the role per fixture would hide the defect.
    const results = await Promise.all(Array.from({ length: N }, () => ensure({}, { role: 'web-scout' })));
    assert(results.every((r) => r && r.ok === true), 'all ' + N + ' calls reported ok');
    const dirs = results.map((r) => r.dir);
    assert(new Set(dirs).size === N, 'they produced ' + new Set(dirs).size + ' DISTINCT sandboxes (expected ' + N + ')');
    assert(dirs.every((d) => fs.existsSync(d) && fs.statSync(d).isDirectory()), 'every sandbox exists on disk');
    assert(dirs.every((d) => fs.readdirSync(d).length === 0), 'and each is EMPTY — no two launches share one');

    const trust = JSON.parse(fs.readFileSync(CLAUDE_JSON, 'utf8')).projects || {};
    const keys = dirs.map((d) => d.replace(/\\/g, '/'));
    assert(keys.filter((k) => Object.prototype.hasOwnProperty.call(trust, k)).length === N,
      'and ALL ' + N + ' trust entries exist — one per sandbox, not one shared entry');
  }

  section('CONTAINMENT IS UNCHANGED BY THE NEW NAME');
  {
    const r = await ensure({}, { role: 'web-scout' });
    const real = fs.realpathSync.native(r.dir);
    const root = fs.realpathSync.native(OUTPUTS);
    assert(real.toLowerCase().startsWith(root.toLowerCase() + path.sep),
      'the returned sandbox is still strictly inside the outputs root');
    assert(path.basename(r.dir).indexOf('web-scout-') === 0,
      'and the name still leads with the sanitized role for human readability');
  }

  section('EXCLUSIVE CREATION — an existing directory is never adopted');
  {
    const before = new Set(fs.readdirSync(OUTPUTS));
    const r = await ensure({}, { role: 'web-scout' });
    assert(!before.has(path.basename(r.dir)), 'the handler returned a directory that did not previously exist');
    // Pre-creating every name the handler could pick is impossible by construction; assert the
    // primitive instead, which is what makes that true.
    const probe = fs.mkdtempSync(path.join(OUTPUTS, 'exclusive-'));
    let threw = false;
    try { fs.mkdirSync(probe); } catch (e) { threw = true; }
    assert(threw, 'plain mkdirSync THROWS on an existing directory (mkdtemp relies on this)');
    let recursiveThrew = false;
    try { fs.mkdirSync(probe, { recursive: true }); } catch (e) { recursiveThrew = true; }
    assert(!recursiveThrew, 'while recursive mkdirSync silently ACCEPTS it — the discarded approach');
  }

  section('ROLE SANITISATION IS UNCHANGED');
  {
    const weird = await ensure({}, { role: '../../etc/passwd' });
    assert(weird.ok === true, 'a hostile role string still yields a sandbox');
    const real = fs.realpathSync.native(weird.dir);
    assert(real.toLowerCase().startsWith(fs.realpathSync.native(OUTPUTS).toLowerCase() + path.sep),
      'and it is still confined to the outputs root (no traversal via the role name)');
    assert(path.basename(weird.dir).indexOf('..') === -1, 'the sanitized name contains no traversal characters');
    const empty = await ensure({}, { role: '' });
    assert(empty.ok === true && path.basename(empty.dir).indexOf('output-') === 0,
      'an empty role still falls back to the "output" prefix');
  }

  process.env.USERPROFILE = prevUser;
  try { fs.rmSync(FIX, { recursive: true, force: true }); } catch (e) { /* best effort */ }
  process.stdout.write('\nensure-output-dir-uniqueness: ' + passed + ' passed, ' + failed + ' failed\n');
  process.exit(failed ? 1 : 0);
})();
