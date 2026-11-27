'use strict';

// S08 session memory: a main-owned record of each Claude pane Mako launches (its Claude session ID,
// role and worktree) with when it started and stopped. S09 reads it to offer Resume
// (`claude --resume <id>`) for the panes that were open when Mako last closed.
//
// The session ID is MAIN-ISSUED: main mints a UUID, passes it to Claude Code as `--session-id`, and
// records it here. Nothing is read from Claude's hook payloads or transcripts, and the renderer never
// supplies the ID. The path is fixed beneath Electron userData (so the S07 dev copy keeps its own
// file); callers never supply a path. Malformed data is preserved and refused, never repaired or
// replaced, the same rule as quick-links-store.js.

const fs = require('fs');
const path = require('path');

const FILENAME = 'session-memory.json';
const VERSION = 1;
const MAX_RECORDS = 200;          // oldest records drop off first
const MAX_FILE_BYTES = 1048576;   // 1 MiB; 200 records are far smaller
const MAX_PANE_ID_LENGTH = 64;
const MAX_TEXT_LENGTH = 1024;     // worktree path, role, cli

// S46 session hygiene: who owns a session, and the short "done when" Blue gives it.
const OWNERS = Object.freeze(['blue', 'composer', 'runner']);
const DEFAULT_OWNER = 'blue';     // every pane today is one Blue opened from Mako's own UI
const MAX_DONE_WHEN_LENGTH = 200;
// eslint-disable-next-line no-control-regex
const CONTROL_RE = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// Why a record stopped. `unknown` is set at startup for a record Mako never closed (a crash or a
// forced kill), so a stop time is never invented as if it were observed.
const STOP_REASON = Object.freeze({
  EXITED: 'exited',             // the pane's shell exited (panes run PowerShell -NoExit, so not
                                // when Claude alone quits)
  CLOSED: 'closed',             // Blue closed the pane
  MAKO_CLOSED: 'mako-closed',   // Mako shut down with the pane open
  UNKNOWN: 'unknown',           // found still open at the next start
});
const STOP_REASONS = new Set(Object.values(STOP_REASON));
// S09: the stops that mean "the pane was still open when Mako went away", so Resume is offered.
const RESUMABLE_STOPS = new Set([STOP_REASON.MAKO_CLOSED, STOP_REASON.UNKNOWN]);

const REASON = Object.freeze({
  READ_FAILED: 'session-memory-read-failed',
  REPARSE_POINT: 'session-memory-reparse-point-refused',
  NOT_REGULAR_FILE: 'session-memory-not-regular-file',
  TOO_LARGE: 'session-memory-too-large',
  INVALID: 'session-memory-invalid',
  WRITE_FAILED: 'session-memory-write-failed',
  BAD_SESSION_ID: 'session-memory-bad-session-id',
  DUPLICATE_SESSION_ID: 'session-memory-duplicate-session-id',
  BAD_STOP_REASON: 'session-memory-bad-stop-reason',
  NOT_RESUMABLE: 'session-memory-not-resumable',
  BAD_OWNER: 'session-memory-bad-owner',
  BAD_DONE_WHEN: 'session-memory-bad-done-when',
  UNKNOWN_SESSION: 'session-memory-unknown-session',
});

function refuse(reason) { return { ok: false, reason }; }

function isSessionId(v) { return typeof v === 'string' && UUID_RE.test(v); }

function boundedText(v) {
  return typeof v === 'string' && v.length > 0 && v.length <= MAX_TEXT_LENGTH ? v : null;
}

// Pane ids come from the renderer. Keep a short string or number, as a string; anything else is null.
function boundedPaneId(v) {
  if (typeof v === 'number' && Number.isFinite(v)) v = String(v);
  return typeof v === 'string' && v.length > 0 && v.length <= MAX_PANE_ID_LENGTH ? v : null;
}

// S46: a done-when is one short line of plain text. '' (after trimming) clears it. Anything else is
// refused, never trimmed to fit or stripped of characters.
function checkDoneWhen(v) {
  if (typeof v !== 'string') return refuse(REASON.BAD_DONE_WHEN);
  const t = v.trim();
  if (t.length > MAX_DONE_WHEN_LENGTH || CONTROL_RE.test(t)) return refuse(REASON.BAD_DONE_WHEN);
  return { ok: true, doneWhen: t === '' ? null : t };
}

// S46: a record stopped for good. The shell exited or Blue closed the pane, or Blue already answered
// the Resume offer for it (or a newer Mako run replaced the offer), so it will never be offered
// again. These records archive themselves.
function isFinished(r) {
  if (!r || r.stoppedAt === null || r.stoppedAt === undefined) return false;
  return !RESUMABLE_STOPS.has(r.stopReason) || r.offered === true;
}

function isIsoTime(v) { return typeof v === 'string' && v.length <= 40 && !Number.isNaN(Date.parse(v)); }

function validRecord(r) {
  if (!r || typeof r !== 'object' || Array.isArray(r)) return false;
  if (!isSessionId(r.sessionId)) return false;
  if (r.paneId !== null && boundedPaneId(r.paneId) !== r.paneId) return false;
  for (const k of ['role', 'cli', 'worktree']) if (r[k] !== null && boundedText(r[k]) !== r[k]) return false;
  if (!isIsoTime(r.startedAt)) return false;
  // S09: `offered` is optional, so S08's files stay valid and S08 ignores it.
  if (r.offered !== undefined && typeof r.offered !== 'boolean') return false;
  // S46: optional too, so S08 and S09 files stay valid.
  if (r.owner !== undefined && !OWNERS.includes(r.owner)) return false;
  if (r.doneWhen !== undefined && r.doneWhen !== null) {
    const d = checkDoneWhen(r.doneWhen);
    if (!d.ok || d.doneWhen !== r.doneWhen) return false;
  }
  for (const k of ['lastActiveAt', 'archivedAt']) if (r[k] !== undefined && r[k] !== null && !isIsoTime(r[k])) return false;
  if (r.stoppedAt === null) return r.stopReason === null;
  return isIsoTime(r.stoppedAt) && STOP_REASONS.has(r.stopReason);
}

function parseText(text) {
  let doc;
  try { doc = JSON.parse(text); } catch { return refuse(REASON.INVALID); }
  if (!doc || typeof doc !== 'object' || doc.version !== VERSION || !Array.isArray(doc.records)) {
    return refuse(REASON.INVALID);
  }
  if (doc.records.length > MAX_RECORDS || !doc.records.every(validRecord)) return refuse(REASON.INVALID);
  const ids = new Set(doc.records.map((r) => r.sessionId));
  if (ids.size !== doc.records.length) return refuse(REASON.INVALID);
  return { ok: true, records: doc.records };
}

function createSessionMemoryStore({ userDataDir, fsImpl = fs, now = () => new Date() } = {}) {
  if (typeof userDataDir !== 'string' || !userDataDir) {
    throw new Error('session-memory: userDataDir is required');
  }
  const filePath = path.join(userDataDir, FILENAME);

  function read() {
    let stat;
    try { stat = fsImpl.lstatSync(filePath); }
    catch (error) {
      if (error && error.code === 'ENOENT') return { ok: true, records: [] };
      return refuse(REASON.READ_FAILED);
    }
    if (stat.isSymbolicLink()) return refuse(REASON.REPARSE_POINT);
    if (!stat.isFile()) return refuse(REASON.NOT_REGULAR_FILE);
    if (stat.size > MAX_FILE_BYTES) return refuse(REASON.TOO_LARGE);
    let text;
    try { text = fsImpl.readFileSync(filePath, 'utf8'); }
    catch { return refuse(REASON.READ_FAILED); }
    return parseText(text);
  }

  function write(records) {
    const text = JSON.stringify({ version: VERSION, records }, null, 2) + '\n';
    const tempPath = `${filePath}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
    let fd = null;
    try {
      fsImpl.mkdirSync(userDataDir, { recursive: true });
      // Same atomic writer as quick-links-store.js: exclusive temp, flush, one rename.
      fd = fsImpl.openSync(tempPath, 'wx', 0o600);
      fsImpl.writeFileSync(fd, text, { encoding: 'utf8' });
      fsImpl.fsyncSync(fd);
      fsImpl.closeSync(fd);
      fd = null;
      fsImpl.renameSync(tempPath, filePath);
    } catch {
      if (fd !== null) { try { fsImpl.closeSync(fd); } catch { /* bounded cleanup */ } }
      try { fsImpl.rmSync(tempPath, { force: true }); } catch { /* bounded cleanup */ }
      return refuse(REASON.WRITE_FAILED);
    }
    return { ok: true, records };
  }

  // Read, change, write. A file that can't be read is never overwritten.
  function update(change) {
    const cur = read();
    if (!cur.ok) return cur;
    const next = change(cur.records.map((r) => Object.assign({}, r)));
    if (!next.ok) return next;
    if (next.changed) {
      const w = write(next.records);
      if (!w.ok) return w;
    }
    return next;
  }

  function recordStart({ sessionId, paneId, role, cli, worktree, owner = DEFAULT_OWNER } = {}) {
    if (!isSessionId(sessionId)) return refuse(REASON.BAD_SESSION_ID);
    if (!OWNERS.includes(owner)) return refuse(REASON.BAD_OWNER);
    const rec = {
      sessionId,
      paneId: boundedPaneId(paneId),
      role: boundedText(role),
      cli: boundedText(cli),
      worktree: boundedText(worktree),
      startedAt: now().toISOString(),
      stoppedAt: null,
      stopReason: null,
      owner,
    };
    return update((records) => {
      if (records.some((r) => r.sessionId === sessionId)) return refuse(REASON.DUPLICATE_SESSION_ID);
      records.push(rec);
      return { ok: true, changed: true, records: records.slice(-MAX_RECORDS) };
    });
  }

  // Closes one record. Stopping an unknown or already-stopped session changes nothing, so an exit
  // that follows a close keeps the first reason.
  function recordStop(sessionId, reason) {
    if (!isSessionId(sessionId)) return refuse(REASON.BAD_SESSION_ID);
    if (!STOP_REASONS.has(reason)) return refuse(REASON.BAD_STOP_REASON);
    return update((records) => {
      const r = records.find((x) => x.sessionId === sessionId);
      if (!r || r.stoppedAt !== null) return { ok: true, changed: false, records };
      r.stoppedAt = now().toISOString();
      r.stopReason = reason;
      return { ok: true, changed: true, records };
    });
  }

  // Closes every open record: at shutdown with `mako-closed`, at startup with `unknown`.
  function closeOpen(reason) {
    if (!STOP_REASONS.has(reason)) return refuse(REASON.BAD_STOP_REASON);
    return update((records) => {
      const at = now().toISOString();
      let n = 0;
      for (const r of records) if (r.stoppedAt === null) { r.stoppedAt = at; r.stopReason = reason; n++; }
      return { ok: true, changed: n > 0, records, closed: n };
    });
  }

  function list() { return read(); }

  // S09: what to offer to resume. A record qualifies when it was still open when Mako went away
  // (`mako-closed` or `unknown`), is a Claude pane, and Blue hasn't answered for it yet. Only the
  // newest batch is offered: closeOpen gives every record it closes the same stop time, so that time
  // identifies one Mako run. Older unanswered records are marked offered here, so a past run never
  // comes back after a newer one.
  function resumeOffer() {
    let batch = [];
    const res = update((records) => {
      const open = records.filter((r) => r.cli === 'claude' && RESUMABLE_STOPS.has(r.stopReason) && r.offered !== true);
      if (open.length === 0) return { ok: true, changed: false, records };
      const latest = open.reduce((m, r) => (Date.parse(r.stoppedAt) > Date.parse(m) ? r.stoppedAt : m), open[0].stoppedAt);
      let changed = false;
      for (const r of open) {
        if (r.stoppedAt === latest) batch.push(Object.assign({}, r));
        else { r.offered = true; changed = true; }
      }
      return { ok: true, changed, records };
    });
    if (!res.ok) return res;
    return { ok: true, records: batch };
  }

  // Blue chose Start fresh (or dismissed the offer) for this record: never offer it again.
  function markOffered(sessionId) {
    if (!isSessionId(sessionId)) return refuse(REASON.BAD_SESSION_ID);
    return update((records) => {
      const r = records.find((x) => x.sessionId === sessionId);
      if (!r || r.offered === true || r.stoppedAt === null) return { ok: true, changed: false, records };
      r.offered = true;
      return { ok: true, changed: true, records };
    });
  }

  // The pane was resumed with `claude --resume`: Claude Code keeps the same session ID, so the same
  // record opens again in its new pane. Clearing `offered` lets the next relaunch offer it again
  // once this pane is open when Mako closes. An open record can't be resumed twice.
  function recordResume({ sessionId, paneId } = {}) {
    if (!isSessionId(sessionId)) return refuse(REASON.BAD_SESSION_ID);
    return update((records) => {
      const r = records.find((x) => x.sessionId === sessionId);
      if (!r || !RESUMABLE_STOPS.has(r.stopReason) || r.offered === true) return refuse(REASON.NOT_RESUMABLE);
      r.paneId = boundedPaneId(paneId);
      r.stoppedAt = null;
      r.stopReason = null;
      delete r.offered;
      delete r.archivedAt;
      return { ok: true, changed: true, records };
    });
  }

  // S46: the session showed activity (main calls this from the pane's output, at most once an hour
  // per session). Only an open record is touched.
  function touch(sessionId) {
    if (!isSessionId(sessionId)) return refuse(REASON.BAD_SESSION_ID);
    return update((records) => {
      const r = records.find((x) => x.sessionId === sessionId);
      if (!r || r.stoppedAt !== null) return { ok: true, changed: false, records };
      r.lastActiveAt = now().toISOString();
      return { ok: true, changed: true, records };
    });
  }

  // S46: Blue's "done when" for one session; '' clears it. An unknown session is refused.
  function setDoneWhen(sessionId, text) {
    if (!isSessionId(sessionId)) return refuse(REASON.BAD_SESSION_ID);
    const d = checkDoneWhen(text);
    if (!d.ok) return d;
    return update((records) => {
      const r = records.find((x) => x.sessionId === sessionId);
      if (!r) return refuse(REASON.UNKNOWN_SESSION);
      if ((r.doneWhen === undefined ? null : r.doneWhen) === d.doneWhen) return { ok: true, changed: false, records };
      if (d.doneWhen === null) delete r.doneWhen; else r.doneWhen = d.doneWhen;
      return { ok: true, changed: true, records };
    });
  }

  // S46: finished sessions archive themselves (isFinished above). Archived records stay in the file
  // (oldest still drop off at MAX_RECORDS); they leave the hygiene list and the idle list.
  function archiveFinished() {
    return update((records) => {
      const at = now().toISOString();
      let n = 0;
      for (const r of records) if (isFinished(r) && !r.archivedAt) { r.archivedAt = at; n++; }
      return { ok: true, changed: n > 0, records, archived: n };
    });
  }

  return {
    recordStart, recordStop, closeOpen, list, resumeOffer, markOffered, recordResume,
    touch, setDoneWhen, archiveFinished,
    filePath: () => filePath,
  };
}

module.exports = {
  createSessionMemoryStore, isSessionId, FILENAME, VERSION, MAX_RECORDS, STOP_REASON, RESUMABLE_STOPS, REASON,
  OWNERS, DEFAULT_OWNER, MAX_DONE_WHEN_LENGTH, checkDoneWhen, isFinished,
};
