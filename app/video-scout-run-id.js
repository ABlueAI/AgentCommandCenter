'use strict';
// V5b1: MAIN-ISSUED video-scout run identity. The run ID is generated HERE in the Electron main
// process when an app Video Scout launch is accepted, then passed to feed-gemini.ps1 as a discrete
// `-RunId` argument. Four explicit negative rules this module exists to guarantee:
//   1. the renderer never generates the run ID;
//   2. the renderer never supplies a run ID;
//   3. the renderer never derives it from a path;
//   4. the run ID is never parsed from terminal output (no terminal-output parser is introduced).
// main.js calls generateRunId() itself and never accepts a run ID from the pty-start opts, so a
// modified/bypassed renderer cannot inject or override one.
//
// Shape (unchanged from the pre-V5b1 PowerShell-generated form so run dirs stay human-sortable and
// the fallback for direct script use is byte-compatible):
//   run-<yyyyMMdd-HHmmss-fff>-<PID>-<8 lowercase hex>
// PowerShell independently re-validates the complete value before any filesystem use
// (Test-VideoScoutRunId in scripts/lib/get-video-scout-run-dir.ps1) — this JS generator and that PS
// validator must agree on the shape; both are unit-tested against the same regex.
//
// Pure + dependency-light (only node:crypto for randomness), so it unit-tests in plain node like
// nav-guard.js / video-scout-args.js.

const crypto = require('crypto');

// Anchored shape gate — the SAME contract Test-VideoScoutRunId enforces in PowerShell. Rejects
// separators, traversal, rooted paths, and malformed stamps/PIDs/suffixes by construction (only the
// listed digit/hex runs are allowed, anchored start-to-end). Length is additionally capped so an
// absurd PID digit-run cannot make an over-long directory name.
const RUN_ID_RE = /^run-\d{8}-\d{6}-\d{3}-\d+-[0-9a-f]{8}$/;
const RUN_ID_MAX_LENGTH = 80;

function isValidRunId(runId) {
  if (typeof runId !== 'string') return false;
  if (runId.length === 0 || runId.length > RUN_ID_MAX_LENGTH) return false;
  return RUN_ID_RE.test(runId);
}

// Local-time stamp yyyyMMdd-HHmmss-fff, matching the PowerShell fallback's
// Get-Date -Format 'yyyyMMdd-HHmmss-fff' (local time, millisecond precision).
function formatRunStamp(date) {
  const p2 = (n) => String(n).padStart(2, '0');
  const p3 = (n) => String(n).padStart(3, '0');
  return `${date.getFullYear()}${p2(date.getMonth() + 1)}${p2(date.getDate())}-`
    + `${p2(date.getHours())}${p2(date.getMinutes())}${p2(date.getSeconds())}-`
    + `${p3(date.getMilliseconds())}`;
}

// Generate a run ID. Time, PID, and randomness are injectable so tests are deterministic; production
// uses the real clock, this process's PID, and 4 crypto-random bytes (8 lowercase hex). Throws if
// the injected PID/random are malformed rather than emitting an ID PowerShell would reject.
function generateRunId(opts = {}) {
  const now = opts.now instanceof Date ? opts.now : new Date();
  const pid = opts.pid === undefined ? process.pid : opts.pid;
  if (!Number.isInteger(pid) || pid <= 0) {
    throw new Error(`video-scout-run-id: pid must be a positive integer (got ${JSON.stringify(pid)}).`);
  }
  let hex = opts.randomHex;
  if (hex === undefined) {
    hex = crypto.randomBytes(4).toString('hex');
  } else if (typeof hex !== 'string' || !/^[0-9a-f]{8}$/.test(hex)) {
    throw new Error('video-scout-run-id: randomHex must be exactly 8 lowercase hex characters.');
  }
  const runId = `run-${formatRunStamp(now)}-${pid}-${hex}`;
  // Fail-closed self-check: never hand out an ID the PowerShell validator would refuse.
  if (!isValidRunId(runId)) {
    throw new Error(`video-scout-run-id: generated an invalid run ID ${JSON.stringify(runId)}.`);
  }
  return runId;
}

// pane ID -> run ID registry (main-process state). The mapping MUST survive PTY exit so a finished
// pane can still open its report in V5b2, and is removed only when the pane is explicitly closed or
// the window shuts down. Pure Map wrapper so the lifecycle is unit-testable; main.js wires the
// removal points (pty-kill and window-all-closed), and deliberately does NOT remove on p.onExit.
function createRunIdRegistry() {
  const map = new Map(); // paneId -> runId
  return {
    set(paneId, runId) { map.set(paneId, runId); },
    get(paneId) { return map.has(paneId) ? map.get(paneId) : null; },
    has(paneId) { return map.has(paneId); },
    // Called ONLY on explicit pane close (pty-kill). NOT called from onExit — a finished run's
    // report is still openable until the user closes the pane.
    remove(paneId) { return map.delete(paneId); },
    clear() { map.clear(); },       // window shutdown
    get size() { return map.size; },
  };
}

module.exports = {
  RUN_ID_RE,
  RUN_ID_MAX_LENGTH,
  isValidRunId,
  formatRunStamp,
  generateRunId,
  createRunIdRegistry,
};
