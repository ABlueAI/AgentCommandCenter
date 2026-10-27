'use strict';

// S09 session resume: main's two decisions about `claude --resume <id>`.
//
//   offerView()   — which of S08's records the renderer may show as "Resume or Start fresh", and the
//                   few fields it needs to show them.
//   checkResume() — whether a pty-start that asks to resume a session may do so.
//
// The session ID that reaches the command line is never the renderer's: checkResume returns the ID
// from main's own record, after the renderer's value matched it exactly. A resumed pane must be the
// same kind of pane in the same folder as the record (Claude Code keeps transcripts per project
// folder, so `--resume` only finds the conversation there). Fenced roles are never resumed: they are
// one-shot research panes in a per-run outputs folder, and resuming one would carry web content from
// an old run into a new one.
//
// Pure: no Electron, filesystem, process or logging. Every dependency is passed in.

const REASON = Object.freeze({
  BAD_REQUEST: 'resume-bad-session-id',
  NOT_OFFERED: 'resume-session-not-offered',
  ALREADY_RUNNING: 'resume-session-already-running',
  NOT_CLAUDE: 'resume-not-a-claude-pane',
  FENCED: 'resume-fenced-role-refused',
  ROLE_MISMATCH: 'resume-role-mismatch',
  WORKTREE_MISMATCH: 'resume-worktree-mismatch',
  WITH_PROMPT: 'resume-with-opening-prompt-refused',
  OFFER_UNREADABLE: 'resume-offer-unreadable',
});

// Claude Code's default `cleanupPeriodDays`: transcripts older than this may be gone.
const DEFAULT_RETENTION_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

function refuse(reason) { return { ok: false, reason }; }

// The launch kinds that run Claude (pty-launch-classify.js): a role pane, or a bare `claude` pane.
function launchRole(launch) {
  if (!launch || launch.ok !== true) return undefined;
  if (launch.kind === 'role') return launch.role;
  if (launch.kind === 'cli' && launch.cli === 'claude') return null;
  return undefined;
}

/**
 * offerView(records, { fencedRoles, exists, now, retentionDays })
 *
 * `records` is session-memory's resumeOffer() batch. Returns the rows the renderer shows, oldest
 * first. Fenced roles are left out. `worktreeMissing` and `mayBeExpired` are shown as warnings.
 */
function offerView(records, deps) {
  const d = deps || {};
  const fencedRoles = d.fencedRoles instanceof Set ? d.fencedRoles : new Set();
  const exists = typeof d.exists === 'function' ? d.exists : () => false;
  const now = typeof d.now === 'function' ? d.now : () => new Date();
  const days = Number.isFinite(d.retentionDays) ? d.retentionDays : DEFAULT_RETENTION_DAYS;
  if (!Array.isArray(records)) return [];
  return records
    .filter((r) => r && r.cli === 'claude' && !(r.role && fencedRoles.has(r.role)))
    .sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt))
    .map((r) => {
      let missing = true;
      try { missing = !(typeof r.worktree === 'string' && exists(r.worktree)); } catch { missing = true; }
      return {
        sessionId: r.sessionId,
        role: r.role,
        worktree: r.worktree,
        startedAt: r.startedAt,
        stoppedAt: r.stoppedAt,
        stopReason: r.stopReason,
        worktreeMissing: missing,
        mayBeExpired: now().getTime() - Date.parse(r.stoppedAt) > days * DAY_MS,
      };
    });
}

/**
 * checkResume({ requested, launch, cwd, initialPrompt, offer, running, sameFolder })
 *
 *   requested     the renderer's `resumeSessionId` (undefined or null: not a resume)
 *   launch        the classified launch (pty-launch-classify.js, after authority)
 *   cwd           the folder main will spawn in
 *   offer         session-memory's resumeOffer() result
 *   running       a Set of session IDs running in a pane now
 *   sameFolder    (a, b) => boolean, main's path comparison
 *
 * Returns { ok:true, sessionId:null } (not a resume), { ok:true, sessionId } (main's own copy of the
 * ID) or { ok:false, reason }.
 */
function checkResume(args) {
  const a = args || {};
  if (a.requested === undefined || a.requested === null) return { ok: true, sessionId: null };
  if (typeof a.requested !== 'string') return refuse(REASON.BAD_REQUEST);
  const role = launchRole(a.launch);
  if (role === undefined) return refuse(REASON.NOT_CLAUDE);
  if (a.launch.fenced === true) return refuse(REASON.FENCED);
  // A resumed conversation continues where it was; an opening prompt would be sent into it as a new
  // message, so it is refused rather than dropped.
  if (a.initialPrompt !== undefined && a.initialPrompt !== null && a.initialPrompt !== '') {
    return refuse(REASON.WITH_PROMPT);
  }
  if (!a.offer || a.offer.ok !== true || !Array.isArray(a.offer.records)) return refuse(REASON.OFFER_UNREADABLE);
  const rec = a.offer.records.find((r) => r && r.sessionId === a.requested);
  if (!rec) return refuse(REASON.NOT_OFFERED);
  if (a.running instanceof Set && a.running.has(rec.sessionId)) return refuse(REASON.ALREADY_RUNNING);
  if ((rec.role || null) !== role) return refuse(REASON.ROLE_MISMATCH);
  const same = typeof a.sameFolder === 'function' ? a.sameFolder : () => false;
  let inFolder = false;
  try { inFolder = typeof rec.worktree === 'string' && typeof a.cwd === 'string' && same(rec.worktree, a.cwd); }
  catch { inFolder = false; }
  if (!inFolder) return refuse(REASON.WORKTREE_MISMATCH);
  return { ok: true, sessionId: rec.sessionId };
}

module.exports = { REASON, DEFAULT_RETENTION_DAYS, offerView, checkResume };
