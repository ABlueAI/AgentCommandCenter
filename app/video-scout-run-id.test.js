'use strict';
// Run: node app/video-scout-run-id.test.js
// Plain Node.js — no framework. Exercises the ACTUAL exported production helpers from
// video-scout-run-id.js (generateRunId / isValidRunId / createRunIdRegistry) plus static wiring
// checks on main.js proving the four negative run-ID rules and the registry lifecycle.

const fs = require('fs');
const path = require('path');
const { generateRunId, isValidRunId, formatRunStamp, createRunIdRegistry, RUN_ID_RE, RUN_ID_MAX_LENGTH } =
  require('./video-scout-run-id');

let passed = 0, failed = 0;
function assert(cond, label) {
  if (cond) { process.stdout.write(`  ✓ ${label}\n`); passed++; }
  else { process.stderr.write(`  ✗ FAIL: ${label}\n`); failed++; }
}

// --- format --------------------------------------------------------------------------------------
{
  const id = generateRunId({ now: new Date(2026, 6, 18, 9, 5, 3, 7), pid: 4242, randomHex: 'deadbeef' });
  assert(id === 'run-20260718-090503-007-4242-deadbeef', 'run ID has the exact canonical shape (local stamp, PID, 8 hex)');
  assert(isValidRunId(id), 'generated ID passes its own validator');
  assert(RUN_ID_RE.test(id), 'generated ID matches the canonical regex (shared with PowerShell)');
  assert(formatRunStamp(new Date(2026, 0, 2, 3, 4, 5, 6)) === '20260102-030405-006', 'stamp zero-pads month/day/time and ms');
}

// --- deterministic injected time/pid/randomness --------------------------------------------------
{
  const opts = { now: new Date(2026, 11, 31, 23, 59, 59, 999), pid: 1, randomHex: '00000000' };
  const a = generateRunId(opts);
  const b = generateRunId(opts);
  assert(a === b && a === 'run-20261231-235959-999-1-00000000', 'same injected inputs → identical ID (deterministic)');
}

// --- uniqueness (real randomness) ----------------------------------------------------------------
{
  const seen = new Set();
  let collisions = 0;
  for (let i = 0; i < 2000; i++) {
    const id = generateRunId({ now: new Date(2026, 6, 18, 9, 5, 3, 7), pid: 4242 }); // fixed time+pid, real random
    if (seen.has(id)) collisions++;
    seen.add(id);
  }
  assert(collisions === 0, 'the random suffix keeps IDs unique even at a fixed time+PID (2000 draws, 0 collisions)');
}

// --- generator rejects malformed injected inputs -------------------------------------------------
{
  let threw = 0;
  for (const bad of [{ pid: 0 }, { pid: -1 }, { pid: 1.5 }, { pid: 'x' }, { randomHex: 'XYZ' }, { randomHex: 'deadbee' }, { randomHex: 'DEADBEEF' }]) {
    try { generateRunId(bad); } catch { threw++; }
  }
  assert(threw === 7, 'generator throws on a bad PID or non-8-lowercase-hex random rather than emitting an invalid ID');
}

// --- isValidRunId negatives (mirror the PowerShell validator) ------------------------------------
{
  const good = 'run-20260718-090503-007-4242-deadbeef';
  assert(isValidRunId(good), 'a well-formed ID is valid');
  const bads = [
    ['', 'empty'],
    ['run-20260718-090503-007-4242-deadbeef/evil', 'trailing path separator'],
    ['run-20260718-090503-007-4242-dead/eef', 'embedded forward slash'],
    ['run-20260718-090503-007-4242-dead\\eef', 'embedded backslash'],
    ['../run-20260718-090503-007-4242-deadbeef', 'leading traversal'],
    ['run-..-090503-007-4242-deadbeef', 'traversal in the stamp'],
    ['C:\\run-20260718-090503-007-4242-deadbeef', 'drive prefix'],
    ['run-2026071-090503-007-4242-deadbeef', 'short date (7 digits)'],
    ['run-20260718-90503-007-4242-deadbeef', 'short time (5 digits)'],
    ['run-20260718-090503-07-4242-deadbeef', 'short ms (2 digits)'],
    ['run-20260718-090503-007--deadbeef', 'empty PID'],
    ['run-20260718-090503-007-4x42-deadbeef', 'non-numeric PID'],
    ['run-20260718-090503-007-4242-deadbee', 'suffix 7 hex'],
    ['run-20260718-090503-007-4242-deadbeeff', 'suffix 9 hex'],
    ['run-20260718-090503-007-4242-DEADBEEF', 'uppercase hex suffix'],
    ['walk-20260718-090503-007-4242-deadbeef', 'wrong prefix'],
    ['run-20260718-090503-007-' + '9'.repeat(100) + '-deadbeef', 'over-length via huge PID'],
    [42, 'non-string'],
    [null, 'null'],
  ];
  let ok = 0;
  for (const [val, why] of bads) { if (!isValidRunId(val)) ok++; else process.stderr.write(`    (leaked: ${why})\n`); }
  assert(ok === bads.length, `every malformed / traversal / separator / rooted / over-length ID is rejected (${bads.length} cases)`);
  assert(RUN_ID_MAX_LENGTH === 80, 'run-ID max length is 80 (bounds the open PID digit run)');
}

// --- registry: survives PTY exit, removed on explicit close --------------------------------------
{
  const reg = createRunIdRegistry();
  reg.set('pty1', 'run-20260718-090503-007-4242-deadbeef');
  reg.set('pty2', 'run-20260718-090504-000-4242-cafebabe');
  assert(reg.get('pty1') === 'run-20260718-090503-007-4242-deadbeef' && reg.size === 2, 'set + get + size');
  // Simulate a PTY exit — the registry has NO exit hook, so the mapping persists by construction.
  assert(reg.has('pty1'), 'mapping survives PTY exit (registry is not touched by onExit)');
  assert(reg.remove('pty1') === true && !reg.has('pty1') && reg.size === 1, 'explicit pane close removes only that mapping');
  assert(reg.get('missing') === null, 'get on an unknown pane returns null');
  reg.clear();
  assert(reg.size === 0, 'window shutdown clears the whole registry');
}

// --- static wiring checks (main.js) --------------------------------------------------------------
// CRLF-safe: normalize before matching.
const mainSrc = fs.readFileSync(path.join(__dirname, 'main.js'), 'utf8').replace(/\r\n/g, '\n');
{
  // MAIN generates the run ID (rule: renderer never generates it).
  assert(/const runId = generateRunId\(\);/.test(mainSrc), 'main.js generates the run ID itself (generateRunId())');
  // It is passed as a discrete -RunId argument. (V5b2 appends '-OutDir', VIDEO_SCOUT_RUN_ROOT to the
  // same push so main owns the run root too — the discrete -RunId argument is unchanged.)
  assert(/args\.push\('-File', script, '-Url', url, '-VideoScout', '-RunId', runId[,)]/.test(mainSrc),
    'main.js passes the run ID as a discrete -RunId argument to feed-gemini.ps1');
  // Renderer never supplies/overrides it: main must not read a run ID from opts.
  assert(!/opts\.runId/i.test(mainSrc), 'main.js never reads a run ID from the renderer-supplied opts');
  // It is NOT returned to the renderer merely because pty-start created it.
  const ptyStart = mainSrc.slice(mainSrc.indexOf("ipcMain.handle('pty-start'"), mainSrc.indexOf("ipcMain.on('pty-write'"));
  assert(!/return \{ ok: true, runId/.test(ptyStart) && !/runId:/.test(ptyStart.slice(ptyStart.lastIndexOf('return { ok: true'))),
    'pty-start does not return the run ID to the renderer');
  // No terminal-output parser introduced for identity.
  assert(!/parse.*stdout|stdout.*parse/i.test(mainSrc.replace(/\/\/[^\n]*/g, '')), 'main.js introduces no terminal-output parser for the run ID');
  // Registry lifecycle: set after spawn, NOT removed on onExit, removed on pty-kill + cleared on shutdown.
  assert(/videoScoutRunIds\.set\(id, acceptedRunId\)/.test(mainSrc), 'main.js registers pane->runId after a successful spawn');
  const onExit = mainSrc.slice(mainSrc.indexOf('p.onExit(('), mainSrc.indexOf('return { ok: true }'));
  assert(!/videoScoutRunIds\.(remove|delete|clear)/.test(onExit), 'onExit does NOT remove the run-ID mapping (it survives PTY exit)');
  assert(/ipcMain\.on\('pty-kill'[\s\S]{0,220}videoScoutRunIds\.remove\(id\)/.test(mainSrc), 'pty-kill removes the mapping (explicit pane close)');
  assert(/window-all-closed[\s\S]{0,220}videoScoutRunIds\.clear\(\)/.test(mainSrc), 'window-all-closed clears the registry (window shutdown)');
}

process.stdout.write(`\nvideo-scout-run-id: ${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
