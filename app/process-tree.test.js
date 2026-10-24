'use strict';
// Run: node app/process-tree.test.js
// Plain Node.js — no framework. Proves S06's process-tree cleanup: taskkill is run by its absolute
// System32 path with /T /F and only valid PIDs, before the caller's pty.kill(); off Windows nothing
// runs and pty.kill() happens at once; every failure is logged. On Windows (CI) it also kills a real
// tree: a node parent with a DETACHED node grandchild, the case node-pty's own kill() misses.

const path = require('path');
const { spawn, execFile, execFileSync } = require('child_process');
const { createProcessTreeKiller, taskkillArgs, taskkillPath } = require('./process-tree');

let passed = 0, failed = 0;
function assert(cond, label) {
  if (cond) { process.stdout.write(`  ✓ ${label}\n`); passed++; }
  else { process.stderr.write(`  ✗ FAIL: ${label}\n`); failed++; }
}

const WIN_ENV = { SystemRoot: 'C:\\Windows' };
const TASKKILL = 'C:\\Windows\\System32\\taskkill.exe';

function makeKiller(over) {
  const calls = [];
  const logs = [];
  const killer = createProcessTreeKiller(Object.assign({
    platform: 'win32',
    env: WIN_ENV,
    execFile: (exe, args, opts, cb) => { calls.push({ kind: 'async', exe, args, opts }); cb(null); },
    execFileSync: (exe, args, opts) => { calls.push({ kind: 'sync', exe, args, opts }); return ''; },
    log: (line) => logs.push(line),
  }, over || {}));
  return { killer, calls, logs };
}

// --- argument and path building ----------------------------------------------------------------
{
  assert(JSON.stringify(taskkillArgs([1234])) === JSON.stringify(['/T', '/F', '/PID', '1234']),
    'one PID gives /T /F /PID <pid>');
  assert(JSON.stringify(taskkillArgs([5, 6, 5])) === JSON.stringify(['/T', '/F', '/PID', '5', '/PID', '6']),
    'several PIDs are de-duplicated, one /PID each');
  assert(taskkillArgs([0, -1, 1.5, '7', NaN, undefined, null]) === null, 'non-integer, zero, negative and string PIDs are dropped');
  assert(taskkillArgs([]) === null && taskkillArgs(undefined) === null, 'no PID gives no command');
  assert(taskkillPath(WIN_ENV) === TASKKILL, 'taskkill comes from %SystemRoot%\\System32');
  assert(taskkillPath({ windir: 'D:\\Win' }) === 'D:\\Win\\System32\\taskkill.exe', 'windir is accepted when SystemRoot is absent');
  assert(taskkillPath({}) === null, 'no SystemRoot gives no path (never a PATH lookup)');
  assert(taskkillPath({ SystemRoot: 'Windows' }) === null, 'a relative SystemRoot is refused');
  assert(taskkillPath({ SystemRoot: '\\\\server\\share' }) === null, 'a UNC SystemRoot is refused');
}

// --- constructor validation --------------------------------------------------------------------
{
  let threw = false;
  try { createProcessTreeKiller({ platform: 'win32', execFile() {} }); } catch { threw = true; }
  assert(threw, 'constructor throws when execFileSync is missing');
}

// --- pane close: taskkill first, then pty.kill() -------------------------------------------------
{
  const { killer, calls } = makeKiller();
  const order = [];
  killer.killTree(4321, () => order.push('pty.kill'));
  assert(calls.length === 1 && calls[0].kind === 'async', 'pane close runs one asynchronous taskkill');
  assert(calls[0].exe === TASKKILL, 'it uses the absolute taskkill path');
  assert(JSON.stringify(calls[0].args) === JSON.stringify(['/T', '/F', '/PID', '4321']), 'it kills the pane shell\'s whole tree');
  assert(calls[0].opts.windowsHide === true && calls[0].opts.timeout === 5000, 'it hides the console and has a timeout');
  assert(!('shell' in calls[0].opts), 'it never asks for a shell');
  assert(order.join() === 'pty.kill', 'pty.kill() runs after taskkill finishes');
}
{
  // The tree kill must run BEFORE pty.kill(): done is not called until execFile calls back.
  let pending = null;
  const { killer } = makeKiller({ execFile: (exe, args, opts, cb) => { pending = cb; } });
  let ptyKilled = false;
  killer.killTree(99, () => { ptyKilled = true; });
  assert(ptyKilled === false, 'pty.kill() waits for taskkill (the tree is walked through the live shell)');
  pending(null);
  assert(ptyKilled === true, 'pty.kill() runs once taskkill returns');
}
{
  const { killer, logs } = makeKiller({ execFile: (exe, args, opts, cb) => cb(Object.assign(new Error('x'), { code: 128 })) });
  let done = false;
  killer.killTree(77, () => { done = true; });
  assert(done && logs.some((l) => /already exited/.test(l)), 'exit code 128 (already gone) is logged as a clean outcome');
}
{
  const { killer, logs } = makeKiller({ execFile: (exe, args, opts, cb) => cb(Object.assign(new Error('x'), { code: 1 })) });
  let done = false;
  killer.killTree(77, () => { done = true; });
  assert(done && logs.some((l) => /taskkill FAILED \(1\)/.test(l)), 'a taskkill failure is logged visibly and pty.kill() still runs');
}
{
  const { killer, logs } = makeKiller({ execFile: () => { throw new Error('spawn EACCES'); } });
  let done = false;
  killer.killTree(77, () => { done = true; });
  assert(done && logs.some((l) => /taskkill FAILED/.test(l)), 'a throwing execFile is logged and pty.kill() still runs');
}
{
  const { killer, calls, logs } = makeKiller();
  let done = false;
  killer.killTree(undefined, () => { done = true; });
  assert(done && calls.length === 0 && logs.some((l) => /skipped \(no-valid-pid\)/.test(l)),
    'a pane without a valid PID skips taskkill visibly and still calls pty.kill()');
}
{
  const { killer, calls, logs } = makeKiller({ env: {} });
  let done = false;
  killer.killTree(10, () => { done = true; });
  assert(done && calls.length === 0 && logs.some((l) => /taskkill-path-unresolved/.test(l)),
    'without SystemRoot, nothing runs, the skip is logged, and pty.kill() still runs');
}
{
  const { killer, calls, logs } = makeKiller({ platform: 'linux' });
  let done = false;
  killer.killTree(10, () => { done = true; });
  assert(done && calls.length === 0 && logs.length === 0, 'off Windows nothing runs and pty.kill() happens at once');
}

// --- shutdown: one synchronous taskkill for every pane -------------------------------------------
{
  const { killer, calls, logs } = makeKiller();
  killer.killTreesSync([11, 12, undefined, 13]);
  assert(calls.length === 1 && calls[0].kind === 'sync', 'shutdown runs one synchronous taskkill');
  assert(JSON.stringify(calls[0].args) === JSON.stringify(['/T', '/F', '/PID', '11', '/PID', '12', '/PID', '13']),
    'it covers every pane with a valid PID');
  assert(calls[0].opts.timeout === 5000 && calls[0].opts.stdio === 'ignore', 'it is bounded by a timeout and prints nothing');
  assert(logs.some((l) => /shutdown: tree killed for 3 pane/.test(l)), 'the shutdown kill is logged');
}
{
  const { killer, logs } = makeKiller({ execFileSync: () => { throw Object.assign(new Error('t'), { code: 'ETIMEDOUT' }); } });
  let threw = false;
  try { killer.killTreesSync([11]); } catch { threw = true; }
  assert(!threw && logs.some((l) => /taskkill FAILED \(ETIMEDOUT\)/.test(l)), 'a timed-out shutdown kill is logged and never throws');
}
{
  const { killer, calls } = makeKiller();
  killer.killTreesSync([]);
  assert(calls.length === 0, 'no panes, no taskkill');
}

// --- main.js wiring (source tripwires) ----------------------------------------------------------
{
  const src = require('fs').readFileSync(path.join(__dirname, 'main.js'), 'utf8');
  const kill = src.slice(src.indexOf("ipcMain.on('pty-kill'"));
  const killBody = kill.slice(0, kill.indexOf('\n});'));
  assert(/processTree\.killTree\(p\.pid, \(\) => \{ try \{ p\.kill\(\); \} catch \{\} \}\)/.test(killBody),
    'pty-kill kills the tree and calls pty.kill() only from the callback');
  const wac = src.slice(src.indexOf("app.on('window-all-closed'"));
  const wacBody = wac.slice(0, wac.indexOf('\n});'));
  assert(wacBody.indexOf('killPaneTreesOnShutdown()') !== -1 &&
    wacBody.indexOf('killPaneTreesOnShutdown()') < wacBody.indexOf('closeControlledRunOnShutdown()') &&
    wacBody.indexOf('killPaneTreesOnShutdown()') < wacBody.indexOf('p.kill()'),
    'window-all-closed kills the trees before any pty.kill()');
  const bq1 = src.indexOf("app.on('before-quit', () => { killPaneTreesOnShutdown(); });");
  const bq2 = src.indexOf("app.on('before-quit', () => { closeControlledRunOnShutdown(); });");
  assert(bq1 !== -1 && bq2 !== -1 && bq1 < bq2, 'before-quit registers the tree kill ahead of the controlled-run closure');
}

// --- Windows only: a real tree with a detached grandchild ----------------------------------------
function alive(pid) { try { process.kill(pid, 0); return true; } catch { return false; } }
async function realTree() {
  if (process.platform !== 'win32') {
    process.stdout.write('  - skipped: real process-tree kill (Windows only; runs in Windows CI)\n');
    return;
  }
  // The parent spawns a DETACHED grandchild that would outlive it, prints its PID, and waits.
  const parentCode = [
    "const { spawn } = require('child_process');",
    "const g = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { detached: true, stdio: 'ignore', windowsHide: true });",
    "g.unref(); process.stdout.write(String(g.pid) + '\\n'); setInterval(() => {}, 1000);",
  ].join(' ');
  const parent = spawn(process.execPath, ['-e', parentCode], { stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true });
  const grandchild = await new Promise((resolve) => {
    let buf = '';
    parent.stdout.on('data', (d) => { buf += d; const m = buf.match(/(\d+)\n/); if (m) resolve(Number(m[1])); });
    setTimeout(() => resolve(null), 10000);
  });
  assert(Number.isSafeInteger(grandchild) && alive(parent.pid) && alive(grandchild), 'Windows: parent and detached grandchild are running');
  const logs = [];
  const killer = createProcessTreeKiller({ platform: process.platform, env: process.env, execFile, execFileSync, log: (l) => logs.push(l) });
  killer.killTreesSync([parent.pid]);
  await new Promise((r) => setTimeout(r, 1000));
  assert(!alive(parent.pid), 'Windows: the parent is gone');
  assert(!alive(grandchild), 'Windows: the detached grandchild is gone too (no leftover node.exe)');
  assert(logs.some((l) => /tree killed for 1 pane/.test(l)), 'Windows: the kill was logged');
  if (grandchild && alive(grandchild)) { try { process.kill(grandchild); } catch {} }
  if (alive(parent.pid)) { try { parent.kill(); } catch {} }
}

realTree().then(() => {
  process.stdout.write(`\nprocess-tree: ${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
});
