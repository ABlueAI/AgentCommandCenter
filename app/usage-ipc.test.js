'use strict';
// Run: node app/usage-ipc.test.js
// S11: the `usage-read` channel. Trusted sender first, a size cap before reading, validated numbers
// out, and a visible refusal (once per reason) for a bad file. Also pins the main.js and preload
// wiring, since the handler is only as good as the gate it is built with.

const fs = require('fs');
const path = require('path');
const { createUsageIpc, buildSetupLine } = require('./usage-ipc');

let passed = 0, failed = 0;
function assert(condition, label) {
  if (condition) { process.stdout.write(`  ✓ ${label}\n`); passed += 1; }
  else { process.stderr.write(`  ✗ FAIL: ${label}\n`); failed += 1; }
}
function eq(actual, expected, label) { assert(actual === expected, `${label} (got ${JSON.stringify(actual)})`); }

const NOW = 1792850000000;
const GOOD = JSON.stringify({ v: 1, captured_at: NOW, five_hour: { used_percentage: 42.3, resets_at: 1792860000 }, seven_day: { used_percentage: 18, resets_at: 1793300000 } });
const FILE = 'C:\\Users\\blue\\AppData\\Local\\Mako\\usage.json';
const SCRIPT = 'C:\\Mako\\AgentCommandCenter\\app\\usage\\usage-statusline.js';

function make({ trusted = true, stat, read } = {}) {
  const logs = [];
  const calls = { stat: 0, read: 0 };
  const ipc = createUsageIpc({
    assessSender: () => (trusted ? { ok: true } : { ok: false, reason: 'untrusted-sender' }),
    statFile: (p) => { calls.stat += 1; assert(p === FILE, 'stats the main-owned path'); return stat ? stat() : { size: GOOD.length }; },
    readFile: (p) => { calls.read += 1; assert(p === FILE, 'reads the main-owned path'); return read ? read() : GOOD; },
    filePath: FILE,
    scriptPath: SCRIPT,
    logRefusal: (line) => logs.push(line),
  });
  return { ipc, logs, calls };
}
const enoent = () => { const e = new Error(`ENOENT ${FILE}`); e.code = 'ENOENT'; throw e; };

process.stdout.write('\nsetup line\n');
{
  const line = buildSetupLine(SCRIPT);
  eq(line, '"statusLine": {"type":"command","command":"node \\"C:/Mako/AgentCommandCenter/app/usage/usage-statusline.js\\""}', 'forward slashes, quoted path, valid JSON value');
  const parsed = JSON.parse('{' + line + '}');
  eq(parsed.statusLine.command, 'node "C:/Mako/AgentCommandCenter/app/usage/usage-statusline.js"', 'pastes as a valid settings.json member');
}

process.stdout.write('\nhandleRead\n');
{
  const { ipc, logs, calls } = make({ trusted: false });
  const r = ipc.handleRead({});
  assert(!r.ok && r.reason === 'untrusted-sender' && r.setupLine === undefined, 'untrusted sender refused, with nothing else returned');
  eq(calls.stat + calls.read, 0, 'and no file touched');
  assert(logs.length === 1 && logs[0] === 'Usage read refused: untrusted-sender', 'refusal logged with a constant reason');
}
{
  const { ipc } = make();
  const r = ipc.handleRead({});
  assert(r.ok && r.state === 'ok', 'good file: ok');
  assert(r.fiveHour.usedPercentage === 42.3 && r.fiveHour.resetsAt === 1792860000 && r.sevenDay.usedPercentage === 18 && r.capturedAt === NOW, 'numbers passed through');
  eq(JSON.stringify(Object.keys(r).sort()), JSON.stringify(['capturedAt', 'fiveHour', 'ok', 'setupLine', 'sevenDay', 'state']), 'only the documented fields');
  assert(typeof r.setupLine === 'string' && r.setupLine.startsWith('"statusLine"'), 'carries the setup line');
}
{
  const { ipc, logs } = make({ stat: enoent });
  const r = ipc.handleRead({});
  assert(r.ok && r.state === 'not-set-up' && typeof r.setupLine === 'string', 'no file yet: not-set-up, with the setup line');
  eq(logs.length, 0, 'not-set-up is a state, not an error');
}
{
  const { ipc, logs, calls } = make({ stat: () => ({ size: 5000 }) });
  const r = ipc.handleRead({});
  assert(!r.ok && r.reason === 'usage-file-too-large', 'oversized file refused');
  eq(calls.read, 0, 'without reading it');
  ipc.handleRead({});
  ipc.handleRead({});
  eq(logs.length, 1, 'a repeated refusal is logged once, not on every poll');
  eq(logs[0], 'Usage panel: usage-file-too-large', 'with a constant reason');
}
{
  const { ipc, logs } = make({ read: () => '{"v":1' });
  const r = ipc.handleRead({});
  assert(!r.ok && r.reason === 'usage-file-malformed' && typeof r.setupLine === 'string', 'malformed file refused visibly, setup line still offered');
  eq(logs[0], 'Usage panel: usage-file-malformed', 'logged');
}
{
  let content = '{"v":1';
  const { ipc, logs } = make({ read: () => content });
  ipc.handleRead({});
  content = GOOD;
  assert(ipc.handleRead({}).ok, 'recovers when the file is good again');
  content = '{"v":1';
  ipc.handleRead({});
  eq(logs.length, 2, 'a refusal after a recovery is logged again');
}
{
  const { ipc } = make({ read: () => { const e = new Error('EACCES'); e.code = 'EACCES'; throw e; } });
  eq(ipc.handleRead({}).reason, 'usage-file-unreadable', 'an unreadable file is refused');
}
{
  let threw = 0;
  for (const bad of [{}, { assessSender: () => ({ ok: true }) }]) {
    try { createUsageIpc(bad); } catch { threw += 1; }
  }
  eq(threw, 2, 'construction refuses missing dependencies');
}

process.stdout.write('\nwiring\n');
{
  const main = fs.readFileSync(path.join(__dirname, 'main.js'), 'utf8');
  assert(/const usageIpc = createUsageIpc\(\{\s*assessSender: \(e\) => launcherGate\.assess\(e\),/.test(main), 'main builds the handler on the shared trusted-sender gate');
  assert(/scriptPath: path\.join\(__dirname, 'usage', 'usage-statusline\.js'\)/.test(main), 'the setup line points at this copy\'s status-line script');
  assert(/ipcMain\.handle\('usage-read', \(e\) => usageIpc\.handleRead\(e\)\);/.test(main), 'usage-read passes only the event (no renderer payload)');
  const preload = fs.readFileSync(path.join(__dirname, 'preload.js'), 'utf8');
  assert(/usageRead: \(\) => ipcRenderer\.invoke\('usage-read'\),/.test(preload), 'preload exposes usageRead with no arguments');
}

process.stdout.write(`\nusage-ipc: ${passed} passed, ${failed} failed\n`);
if (failed) process.exit(1);
