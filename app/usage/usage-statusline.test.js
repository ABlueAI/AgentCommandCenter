'use strict';
// Run: node app/usage/usage-statusline.test.js
// S11: the status-line command and the shared usage-file module. The command must store only the two
// plan-usage windows, never anything else from Claude Code's payload, and must fail visibly.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const usageFile = require('./usage-file');
const { handlePayload, formatLine } = require('./usage-statusline');

let passed = 0, failed = 0;
function assert(condition, label) {
  if (condition) { process.stdout.write(`  ✓ ${label}\n`); passed += 1; }
  else { process.stderr.write(`  ✗ FAIL: ${label}\n`); failed += 1; }
}
function eq(actual, expected, label) { assert(actual === expected, `${label} (got ${JSON.stringify(actual)})`); }

const NOW = 1792850000000; // 2026-10-24, ms
const FIVE_RESET = 1792860000;
const WEEK_RESET = 1793300000;
// A payload shaped like the documented status-line input, with the private fields filled in.
function payload(extra) {
  return Object.assign({
    session_id: 'SECRET-SESSION-ID',
    transcript_path: 'C:/Users/blue/.claude/projects/SECRET/transcript.jsonl',
    cwd: 'C:/Users/blue/SECRET-REPO',
    model: { id: 'claude-secret-model', display_name: 'Secret' },
    cost: { total_cost_usd: 12.34 },
    workspace: { current_dir: 'C:/Users/blue/SECRET-REPO' },
    rate_limits: {
      five_hour: { used_percentage: 42.25, resets_at: FIVE_RESET, extra: 'SECRET-EXTRA' },
      seven_day: { used_percentage: 18, resets_at: WEEK_RESET },
    },
  }, extra || {});
}
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mako-usage-'));
let n = 0;
const freshPath = () => path.join(tmpRoot, `case-${++n}`, 'Mako', 'usage.json');

process.stdout.write('\nusage-file: path\n');
{
  const win = usageFile.defaultUsageFilePath({ env: { LOCALAPPDATA: 'C:\\Users\\blue\\AppData\\Local' }, homedir: 'C:\\Users\\blue', platform: 'win32' });
  eq(win, 'C:\\Users\\blue\\AppData\\Local\\Mako\\usage.json', 'Windows: %LOCALAPPDATA%\\Mako\\usage.json');
  const winNoEnv = usageFile.defaultUsageFilePath({ env: {}, homedir: 'C:\\Users\\blue', platform: 'win32' });
  eq(winNoEnv, 'C:\\Users\\blue\\AppData\\Local\\Mako\\usage.json', 'Windows without LOCALAPPDATA falls back to the home AppData\\Local');
  const nix = usageFile.defaultUsageFilePath({ env: {}, homedir: '/home/blue', platform: 'linux' });
  eq(nix, '/home/blue/.local/share/mako/usage.json', 'elsewhere: ~/.local/share/mako/usage.json');
}

process.stdout.write('\nusage-file: snapshotFromPayload keeps only the two windows\n');
{
  const snap = usageFile.snapshotFromPayload(payload(), NOW);
  eq(JSON.stringify(Object.keys(snap).sort()), JSON.stringify(['captured_at', 'five_hour', 'seven_day', 'v']), 'only v, captured_at and the two windows');
  eq(JSON.stringify(Object.keys(snap.five_hour).sort()), JSON.stringify(['resets_at', 'used_percentage']), 'a window keeps only its two numbers');
  eq(snap.five_hour.used_percentage, 42.3, 'percentage rounded to one decimal');
  eq(snap.captured_at, NOW, 'captured_at is the injected clock');
  const text = JSON.stringify(snap);
  assert(!/SECRET/.test(text), 'no session ID, path, model, cost or extra field reaches the snapshot');
  eq(usageFile.snapshotFromPayload({ session_id: 'x' }, NOW), null, 'no rate_limits: null');
  eq(usageFile.snapshotFromPayload(payload({ rate_limits: { spend_limit: { used_percentage: 5, resets_at: FIVE_RESET } } }), NOW), null, 'only a spend_limit window: null (not a plan window)');
  const onlyWeek = usageFile.snapshotFromPayload(payload({ rate_limits: { seven_day: { used_percentage: 3, resets_at: WEEK_RESET } } }), NOW);
  assert(onlyWeek && !onlyWeek.five_hour && onlyWeek.seven_day.used_percentage === 3, 'one window alone is kept');
  for (const [label, w] of [
    ['string percentage', { used_percentage: '42', resets_at: FIVE_RESET }],
    ['negative percentage', { used_percentage: -1, resets_at: FIVE_RESET }],
    ['NaN percentage', { used_percentage: NaN, resets_at: FIVE_RESET }],
    ['absurd percentage', { used_percentage: 5000, resets_at: FIVE_RESET }],
    ['reset in milliseconds', { used_percentage: 4, resets_at: FIVE_RESET * 1000 }],
    ['fractional reset', { used_percentage: 4, resets_at: FIVE_RESET + 0.5 }],
    ['missing reset', { used_percentage: 4 }],
    ['array window', [4, FIVE_RESET]],
  ]) {
    eq(usageFile.snapshotFromPayload(payload({ rate_limits: { five_hour: w } }), NOW), null, `refused: ${label}`);
  }
}

process.stdout.write('\nusage-file: parseSnapshot\n');
{
  const good = JSON.stringify(usageFile.snapshotFromPayload(payload(), NOW));
  const r = usageFile.parseSnapshot(good);
  assert(r.ok && r.capturedAt === NOW && r.fiveHour.usedPercentage === 42.3 && r.fiveHour.resetsAt === FIVE_RESET && r.sevenDay.usedPercentage === 18, 'round trip');
  eq(usageFile.parseSnapshot('{').reason, 'usage-file-malformed', 'bad JSON refused');
  eq(usageFile.parseSnapshot('[]').reason, 'usage-file-malformed', 'array refused');
  eq(usageFile.parseSnapshot(JSON.stringify({ v: 2, captured_at: NOW, five_hour: { used_percentage: 1, resets_at: FIVE_RESET } })).reason, 'usage-file-version', 'unknown version refused');
  eq(usageFile.parseSnapshot(JSON.stringify({ v: 1, captured_at: 'now', five_hour: { used_percentage: 1, resets_at: FIVE_RESET } })).reason, 'usage-file-malformed', 'bad captured_at refused');
  eq(usageFile.parseSnapshot(JSON.stringify({ v: 1, captured_at: NOW })).reason, 'usage-file-malformed', 'no window refused');
  eq(usageFile.parseSnapshot(JSON.stringify({ v: 1, captured_at: NOW, five_hour: { used_percentage: 1, resets_at: FIVE_RESET }, seven_day: { used_percentage: 'x' } })).reason, 'usage-file-malformed', 'one bad window refuses the whole file');
  eq(usageFile.parseSnapshot('x'.repeat(usageFile.MAX_FILE_BYTES + 1)).reason, 'usage-file-too-large', 'oversized text refused');
  eq(usageFile.parseSnapshot(null).reason, 'usage-file-unreadable', 'non-string refused');
}

process.stdout.write('\nusage-statusline: handlePayload\n');
{
  const filePath = freshPath();
  const line = handlePayload(JSON.stringify(payload()), { filePath, fsx: fs, nowMs: NOW, pid: 1234 });
  eq(line, 'usage 5h 42% · week 18%', 'prints the two figures');
  const stored = fs.readFileSync(filePath, 'utf8');
  assert(!/SECRET/.test(stored), 'the stored file holds none of the private payload fields');
  assert(usageFile.parseSnapshot(stored).ok, 'the stored file parses back');
  assert(!fs.readdirSync(path.dirname(filePath)).some((f) => f.endsWith('.tmp')), 'no temp file left behind');

  const again = handlePayload(JSON.stringify(payload({ rate_limits: undefined })), { filePath, fsx: fs, nowMs: NOW + 1000, pid: 1234 });
  eq(again, 'usage: no data yet', 'no rate_limits: says so');
  eq(fs.readFileSync(filePath, 'utf8'), stored, 'and keeps the last snapshot rather than overwrite it');

  eq(handlePayload('not json', { filePath, fsx: fs, nowMs: NOW, pid: 1 }), 'usage: unreadable status data', 'bad JSON: visible reason');

  const hot = payload({ rate_limits: { five_hour: { used_percentage: 91, resets_at: FIVE_RESET } } });
  eq(handlePayload(JSON.stringify(hot), { filePath, fsx: fs, nowMs: NOW, pid: 1 }), '! usage 5h 91%', '90% or more is flagged in the line');
  eq(formatLine({ seven_day: { used_percentage: 95, resets_at: WEEK_RESET } }), '! usage week 95%', 'the weekly window alone can flag it');

  // A write that fails reports a bounded code, never the path.
  const failing = Object.assign({}, fs, { writeFileSync: () => { const e = new Error(`EACCES ${filePath}`); e.code = 'EACCES'; throw e; } });
  eq(handlePayload(JSON.stringify(payload()), { filePath, fsx: failing, nowMs: NOW, pid: 1 }), 'usage: not saved (EACCES)', 'write failure: bounded error code');
  const weird = Object.assign({}, fs, { writeFileSync: () => { const e = new Error('x'); e.code = 'C:\\path\\leak'; throw e; } });
  eq(handlePayload(JSON.stringify(payload()), { filePath, fsx: weird, nowMs: NOW, pid: 1 }), 'usage: not saved (write-failed)', 'an unexpected code becomes a constant');

  // Windows can refuse a rename while the file is open: one retry, then a visible failure and no temp file.
  const p2 = freshPath();
  let renames = 0;
  const flaky = Object.assign({}, fs, { renameSync: (a, b) => { renames += 1; if (renames === 1) { const e = new Error('busy'); e.code = 'EPERM'; throw e; } return fs.renameSync(a, b); } });
  eq(handlePayload(JSON.stringify(payload()), { filePath: p2, fsx: flaky, nowMs: NOW, pid: 7 }), 'usage 5h 42% · week 18%', 'a rename that fails once is retried');
  const p3 = freshPath();
  const stuck = Object.assign({}, fs, { renameSync: () => { const e = new Error('busy'); e.code = 'EPERM'; throw e; } });
  eq(handlePayload(JSON.stringify(payload()), { filePath: p3, fsx: stuck, nowMs: NOW, pid: 8 }), 'usage: not saved (EPERM)', 'a rename that keeps failing is reported');
  assert(!fs.readdirSync(path.dirname(p3)).some((f) => f.endsWith('.tmp')), 'and its temp file is removed');
}

process.stdout.write('\nusage-statusline: as a real process (stdin in, one line out, exit 0)\n');
{
  const script = path.join(__dirname, 'usage-statusline.js');
  const home = path.join(tmpRoot, 'home');
  fs.mkdirSync(home, { recursive: true });
  const env = Object.assign({}, process.env, { HOME: home, USERPROFILE: home, LOCALAPPDATA: path.join(home, 'AppData', 'Local') });
  const r = spawnSync(process.execPath, [script], { input: JSON.stringify(payload()), env, encoding: 'utf8', timeout: 10000 });
  eq(r.status, 0, 'exit code 0');
  eq(r.stdout, 'usage 5h 42% · week 18%\n', 'prints exactly the status line');
  eq(r.stderr, '', 'nothing on stderr');
  const written = usageFile.defaultUsageFilePath({ env, homedir: home, platform: process.platform });
  assert(fs.existsSync(written) && usageFile.parseSnapshot(fs.readFileSync(written, 'utf8')).ok, 'wrote the snapshot to the default path');
  const big = spawnSync(process.execPath, [script], { input: 'x'.repeat(300000), env, encoding: 'utf8', timeout: 10000 });
  eq(big.status, 0, 'oversized input: still exit 0');
  eq(big.stdout, 'usage: status data too large\n', 'oversized input: visible reason');
}

fs.rmSync(tmpRoot, { recursive: true, force: true });
process.stdout.write(`\nusage-statusline: ${passed} passed, ${failed} failed\n`);
if (failed) process.exit(1);
