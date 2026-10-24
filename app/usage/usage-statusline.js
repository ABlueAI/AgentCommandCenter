'use strict';
// S11 usage panel: Claude Code's status-line command (docs/USAGE-PANEL.md).
//
// Blue points `statusLine` in ~/.claude/settings.json at this file once (BLUE-CHECKLIST.md step 41):
//   "statusLine": { "type": "command", "command": "node \"C:/.../app/usage/usage-statusline.js\"" }
// Claude Code then runs it after each reply and writes its session JSON to stdin. That payload holds
// the cwd, transcript path, session ID, model and cost as well as the plan usage. This process reads
// ONLY `rate_limits.five_hour` and `rate_limits.seven_day` (a percentage and a reset time each),
// builds a fresh object from those numbers (usage-file.js snapshotFromPayload), and writes it to the
// usage file Mako's panel reads. Nothing else from the payload is stored, printed or sent anywhere.
//
// What it prints becomes the pane's status line, so a failure shows there as a short reason code
// ("usage: not saved (EPERM)"), never a path or payload text. Exit code is always 0: a non-zero exit
// only blanks the status line, which would hide the failure.
//
// It runs for every local Claude Code session, inside Mako or not, which is what keeps the figures
// current: usage belongs to the account, not to a pane.

const fs = require('fs');
const os = require('os');
const path = require('path');
const usageFile = require('./usage-file');

const STDIN_LIMIT_BYTES = 262144; // the payload is a few KB; refuse anything far larger
const TOTAL_BUDGET_MS = 1500;     // Claude Code cancels a slow status line anyway

function reasonCode(err) {
  const code = err && typeof err.code === 'string' ? err.code : '';
  return /^[A-Z0-9_]{1,24}$/.test(code) ? code : 'write-failed';
}

function formatLine(snapshot) {
  const parts = [];
  const five = snapshot.five_hour;
  const week = snapshot.seven_day;
  if (five) parts.push(`5h ${Math.round(five.used_percentage)}%`);
  if (week) parts.push(`week ${Math.round(week.used_percentage)}%`);
  const warn = (five && five.used_percentage >= 90) || (week && week.used_percentage >= 90);
  return (warn ? '! ' : '') + 'usage ' + parts.join(' · ');
}

// Atomic replace: a cancelled or concurrent run leaves either the old file or the new one, never a
// half-written one. Windows can refuse the rename while the panel has the file open, so retry once.
function writeAtomic(fsx, filePath, text, pid) {
  fsx.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${pid}.tmp`;
  fsx.writeFileSync(tmp, text, 'utf8');
  try {
    try { fsx.renameSync(tmp, filePath); } catch { fsx.renameSync(tmp, filePath); }
  } catch (err) {
    try { fsx.unlinkSync(tmp); } catch { /* the rename error below is the one to report */ }
    throw err;
  }
}

// The whole decision, testable without stdin: payload text in, status-line text out.
function handlePayload(text, { filePath, fsx, nowMs, pid }) {
  let payload;
  try { payload = JSON.parse(text); } catch { return 'usage: unreadable status data'; }
  const snapshot = usageFile.snapshotFromPayload(payload, nowMs);
  // No window yet: Claude Code adds rate_limits only for claude.ai Pro and Max subscribers, after the
  // session's first reply. Keep the last saved snapshot rather than overwrite it with nothing.
  if (!snapshot) return 'usage: no data yet';
  try {
    writeAtomic(fsx, filePath, JSON.stringify(snapshot), pid);
  } catch (err) {
    return `usage: not saved (${reasonCode(err)})`;
  }
  return formatLine(snapshot);
}

function main() {
  const filePath = usageFile.defaultUsageFilePath({ env: process.env, homedir: os.homedir(), platform: process.platform });
  const chunks = [];
  let size = 0;
  let done = false;
  const finish = (line) => {
    if (done) return;
    done = true;
    process.stdout.write(line + '\n');
    process.exitCode = 0;
    // stdin may still be open (an oversized payload): don't wait on it.
    setImmediate(() => process.exit(0));
  };
  const timer = setTimeout(() => finish('usage: timed out'), TOTAL_BUDGET_MS);
  process.stdin.on('data', (chunk) => {
    size += chunk.length;
    if (size > STDIN_LIMIT_BYTES) { clearTimeout(timer); finish('usage: status data too large'); return; }
    chunks.push(chunk);
  });
  process.stdin.on('end', () => {
    clearTimeout(timer);
    if (done) return;
    finish(handlePayload(Buffer.concat(chunks).toString('utf8'), { filePath, fsx: fs, nowMs: Date.now(), pid: process.pid }));
  });
  process.stdin.on('error', () => { clearTimeout(timer); finish('usage: unreadable status data'); });
}

if (require.main === module) main();

module.exports = { handlePayload, formatLine, writeAtomic, STDIN_LIMIT_BYTES };
