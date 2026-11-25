'use strict';

// S46 session hygiene: every Claude session Mako records (app/session-memory.js) has an owner, a
// state and a "done when"; finished sessions archive themselves (session-memory's archiveFinished);
// and once a day Mako lists the sessions idle 3 days or more.
//
//   view()      the rows main sends the renderer: every session not archived, oldest activity first.
//   idleRows()  the rows idle for `idleDays` or more.
//   dayKey()    the local calendar day, so the daily list shows once a day.
//
// Pure: no Electron, filesystem, process or logging. Every dependency is passed in.

const { isFinished, RESUMABLE_STOPS, DEFAULT_OWNER } = require('./session-memory');

const IDLE_DAYS = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

// What a session is doing now.
const STATE = Object.freeze({
  RUNNING: 'running',     // open in a pane
  WAITING: 'waiting',     // open when Mako went away; Resume or Start fresh not answered yet
  FINISHED: 'finished',   // stopped for good; archived at the next sweep
  ARCHIVED: 'archived',
});

function time(v) { const t = typeof v === 'string' ? Date.parse(v) : NaN; return Number.isNaN(t) ? null : t; }

function stateOf(r) {
  if (r.archivedAt) return STATE.ARCHIVED;
  if (r.stoppedAt === null) return STATE.RUNNING;
  if (isFinished(r)) return STATE.FINISHED;
  if (RESUMABLE_STOPS.has(r.stopReason)) return STATE.WAITING;
  return STATE.FINISHED;
}

// The last time anything happened to the session: its last output, its stop, or its start.
function lastActivity(r) {
  const ts = [time(r.lastActiveAt), time(r.stoppedAt), time(r.startedAt)].filter((t) => t !== null);
  return ts.length ? Math.max(...ts) : null;
}

/**
 * view(records, { now, idleDays }) -> rows for every record that isn't archived, oldest activity
 * first. A record from before S46 has no owner; it reads as Blue's (`ownerAssumed: true`), since
 * every pane so far was one Blue opened.
 */
function view(records, deps) {
  const d = deps || {};
  const now = (typeof d.now === 'function' ? d.now : () => new Date())().getTime();
  const idleDays = Number.isFinite(d.idleDays) && d.idleDays > 0 ? d.idleDays : IDLE_DAYS;
  if (!Array.isArray(records)) return [];
  return records
    .filter((r) => r && typeof r === 'object' && stateOf(r) !== STATE.ARCHIVED)
    .map((r) => {
      const last = lastActivity(r);
      const idleMs = last === null ? null : Math.max(0, now - last);
      return {
        sessionId: r.sessionId,
        owner: r.owner || DEFAULT_OWNER,
        ownerAssumed: !r.owner,
        state: stateOf(r),
        doneWhen: typeof r.doneWhen === 'string' ? r.doneWhen : null,
        role: r.role || null,
        worktree: r.worktree || null,
        startedAt: r.startedAt,
        lastActivityAt: last === null ? null : new Date(last).toISOString(),
        idleDays: idleMs === null ? null : Math.floor(idleMs / DAY_MS),
        idle: idleMs !== null && idleMs >= idleDays * DAY_MS,
      };
    })
    .sort((a, b) => (a.lastActivityAt || '').localeCompare(b.lastActivityAt || ''));
}

function idleRows(rows) { return Array.isArray(rows) ? rows.filter((r) => r && r.idle === true) : []; }

// The local calendar day (Blue's PC clock), as YYYY-MM-DD.
function dayKey(date) {
  const p = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}

module.exports = { IDLE_DAYS, STATE, stateOf, lastActivity, view, idleRows, dayKey };
