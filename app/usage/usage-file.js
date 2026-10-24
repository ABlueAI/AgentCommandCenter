'use strict';
// S11 usage panel: the one shared definition of the usage snapshot file.
//
// Claude Code hands its status-line command the plan usage (`rate_limits.five_hour` and
// `rate_limits.seven_day`, each `used_percentage` 0 to 100 and `resets_at` in Unix epoch seconds;
// https://code.claude.com/docs/en/statusline). usage-statusline.js writes the two windows here, and
// main reads them back for the panel (usage-ipc.js). Both sides use THIS module, so the path and the
// shape can't drift apart.
//
// PURE apart from `path`: no file I/O. The snapshot carries numbers only, never a session ID, cwd,
// transcript path, model or cost from the status-line payload.
//
// One file per Windows user, not per Mako instance: plan usage belongs to the claude.ai account, so
// the stable and dev copies (S07) show the same figures.

const path = require('path');

const SNAPSHOT_VERSION = 1;
const MAX_FILE_BYTES = 4096;
// A percentage above 100 isn't documented for these two windows; allow some headroom rather than
// refuse a real reading, but nothing absurd.
const MAX_PERCENT = 1000;
// Epoch seconds between 2001 and 5138: catches milliseconds and junk.
const MIN_EPOCH_S = 1e9;
const MAX_EPOCH_S = 1e11;
const WINDOWS = Object.freeze([
  Object.freeze({ wire: 'five_hour', key: 'fiveHour' }),
  Object.freeze({ wire: 'seven_day', key: 'sevenDay' }),
]);

function defaultUsageFilePath({ env, homedir, platform }) {
  const e = env || {};
  if (platform === 'win32') {
    const base = (typeof e.LOCALAPPDATA === 'string' && e.LOCALAPPDATA) || path.win32.join(homedir, 'AppData', 'Local');
    return path.win32.join(base, 'Mako', 'usage.json');
  }
  return path.posix.join(homedir, '.local', 'share', 'mako', 'usage.json');
}

// One window, from either the status-line payload or a stored snapshot (same field names). Returns
// a FRESH object, or null when the window is absent or out of range.
function pickWindow(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const pct = value.used_percentage;
  const resets = value.resets_at;
  if (typeof pct !== 'number' || !Number.isFinite(pct) || pct < 0 || pct > MAX_PERCENT) return null;
  if (typeof resets !== 'number' || !Number.isInteger(resets) || resets < MIN_EPOCH_S || resets > MAX_EPOCH_S) return null;
  return { used_percentage: Math.round(pct * 10) / 10, resets_at: resets };
}

// The status-line payload -> the snapshot to store, or null when it carries no usable window.
function snapshotFromPayload(payload, nowMs) {
  const limits = payload && typeof payload === 'object' ? payload.rate_limits : null;
  const snapshot = { v: SNAPSHOT_VERSION, captured_at: nowMs };
  let any = false;
  for (const w of WINDOWS) {
    const picked = pickWindow(limits && typeof limits === 'object' ? limits[w.wire] : null);
    if (picked) { snapshot[w.wire] = picked; any = true; }
  }
  return any ? snapshot : null;
}

// Stored file text -> { ok:true, capturedAt, fiveHour, sevenDay } or { ok:false, reason }.
// A window that is present but malformed refuses the whole file rather than showing half of it.
function parseSnapshot(text) {
  if (typeof text !== 'string') return { ok: false, reason: 'usage-file-unreadable' };
  if (Buffer.byteLength(text, 'utf8') > MAX_FILE_BYTES) return { ok: false, reason: 'usage-file-too-large' };
  let data;
  try { data = JSON.parse(text); } catch { return { ok: false, reason: 'usage-file-malformed' }; }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return { ok: false, reason: 'usage-file-malformed' };
  if (data.v !== SNAPSHOT_VERSION) return { ok: false, reason: 'usage-file-version' };
  const captured = data.captured_at;
  if (typeof captured !== 'number' || !Number.isInteger(captured) || captured < MIN_EPOCH_S * 1000 || captured > MAX_EPOCH_S * 1000) {
    return { ok: false, reason: 'usage-file-malformed' };
  }
  const out = { ok: true, capturedAt: captured, fiveHour: null, sevenDay: null };
  for (const w of WINDOWS) {
    if (data[w.wire] === undefined) continue;
    const picked = pickWindow(data[w.wire]);
    if (!picked) return { ok: false, reason: 'usage-file-malformed' };
    out[w.key] = { usedPercentage: picked.used_percentage, resetsAt: picked.resets_at };
  }
  if (!out.fiveHour && !out.sevenDay) return { ok: false, reason: 'usage-file-malformed' };
  return out;
}

module.exports = {
  SNAPSHOT_VERSION,
  MAX_FILE_BYTES,
  defaultUsageFilePath,
  pickWindow,
  snapshotFromPayload,
  parseSnapshot,
};
