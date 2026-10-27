'use strict';
// Run: node app/session-resume.test.js
//
// S09: the pure resume decisions (session-resume.js): what the renderer may offer, and whether a
// pty-start that asks to resume a session may do so.

const { REASON, DEFAULT_RETENTION_DAYS, offerView, checkResume } = require('./session-resume');

let passed = 0, failed = 0;
function assert(cond, label) {
  if (cond) { process.stdout.write('  ✓ ' + label + '\n'); passed++; }
  else { process.stderr.write('  x FAIL: ' + label + '\n'); failed++; }
}
function section(t) { process.stdout.write('\n' + t + '\n'); }

const FENCED = new Set(['web-scout', 'operator', 'source-scout']);
const SID_A = 'aaaaaaaa-1111-4111-8111-111111111111';
const SID_B = 'bbbbbbbb-2222-4222-8222-222222222222';
const SID_F = 'ffffffff-3333-4333-8333-333333333333';
const rec = (o) => Object.assign({
  paneId: 'pty1', cli: 'claude', startedAt: '2026-10-27T09:00:00.000Z',
  stoppedAt: '2026-10-27T10:00:00.000Z', stopReason: 'mako-closed',
}, o);
const builderRec = rec({ sessionId: SID_A, role: 'builder', worktree: 'D:\\Workspace\\repo-wt' });
const bareRec = rec({ sessionId: SID_B, role: null, worktree: 'D:\\Workspace\\repo', startedAt: '2026-10-27T08:00:00.000Z' });
const fencedRec = rec({ sessionId: SID_F, role: 'web-scout', worktree: 'D:\\Workspace\\.command-center\\outputs\\x' });
const offer = { ok: true, records: [builderRec, bareRec, fencedRec] };

section('offerView');
{
  const now = () => new Date('2026-10-28T10:00:00.000Z');
  const rows = offerView(offer.records, { fencedRoles: FENCED, exists: (p) => p === 'D:\\Workspace\\repo-wt', now });
  assert(rows.length === 2 && rows[0].sessionId === SID_B && rows[1].sessionId === SID_A,
    'fenced roles are left out; the rest are sorted by when they started');
  assert(rows[1].role === 'builder' && rows[1].worktree === 'D:\\Workspace\\repo-wt' && rows[1].worktreeMissing === false
    && rows[1].stopReason === 'mako-closed' && rows[1].mayBeExpired === false, 'a row carries role, folder, stop and its warnings');
  assert(rows[0].worktreeMissing === true, 'a folder that no longer exists is flagged');
  assert(Object.keys(rows[1]).sort().join() === 'mayBeExpired,role,sessionId,startedAt,stopReason,stoppedAt,worktree,worktreeMissing',
    'no other field (pane ID, cli, offered) reaches the renderer');
  const later = () => new Date(Date.parse('2026-10-27T10:00:00.000Z') + (DEFAULT_RETENTION_DAYS + 1) * 86400000);
  assert(offerView([builderRec], { exists: () => true, now: later })[0].mayBeExpired === true,
    'a session stopped more than ' + DEFAULT_RETENTION_DAYS + ' days ago may have been cleaned up, and says so');
  assert(offerView([builderRec], { exists: () => { throw new Error('x'); }, now })[0].worktreeMissing === true,
    'an existence check that throws counts as missing');
  assert(offerView(null, {}).length === 0 && offerView([rec({ sessionId: SID_A, role: null, cli: 'codex', worktree: 'D:\\w' })], {}).length === 0,
    'no records, or a non-Claude record, offers nothing');
}

section('checkResume: not a resume');
for (const requested of [undefined, null]) {
  const r = checkResume({ requested, launch: { ok: true, kind: 'shell' } });
  assert(r.ok && r.sessionId === null, `requested ${String(requested)}: a normal launch, nothing checked`);
}

section('checkResume: accepted');
const same = (a, b) => a.toLowerCase() === b.toLowerCase();
const builderLaunch = { ok: true, kind: 'role', role: 'builder', fenced: false };
const bareLaunch = { ok: true, kind: 'cli', cli: 'claude', role: null, fenced: false };
{
  const r = checkResume({ requested: SID_A, launch: builderLaunch, cwd: 'd:\\workspace\\REPO-wt', offer, running: new Set(), sameFolder: same });
  assert(r.ok && r.sessionId === SID_A && r.sessionId === builderRec.sessionId, 'a builder pane in the same folder resumes, with the record\'s own ID');
  const r2 = checkResume({ requested: SID_B, launch: bareLaunch, cwd: 'D:\\Workspace\\repo', initialPrompt: '', offer, sameFolder: same });
  assert(r2.ok && r2.sessionId === SID_B, 'a bare claude pane resumes (an empty opening prompt is fine)');
}

section('checkResume: refused');
const base = { requested: SID_A, launch: builderLaunch, cwd: 'D:\\Workspace\\repo-wt', offer, running: new Set(), sameFolder: same };
const cases = [
  ['a non-string ID', { requested: 42 }, REASON.BAD_REQUEST],
  ['an ID not in the offer', { requested: 'cccccccc-4444-4444-8444-444444444444' }, REASON.NOT_OFFERED],
  ['an ID that differs only in case', { requested: SID_A.toUpperCase() }, REASON.NOT_OFFERED],
  ['a session already running in a pane', { running: new Set([SID_A]) }, REASON.ALREADY_RUNNING],
  ['a codex pane', { launch: { ok: true, kind: 'cli', cli: 'codex', fenced: false } }, REASON.NOT_CLAUDE],
  ['a plain shell', { launch: { ok: true, kind: 'shell' } }, REASON.NOT_CLAUDE],
  ['Video Scout', { launch: { ok: true, kind: 'video-scout', role: 'video-scout', videoScout: true } }, REASON.NOT_CLAUDE],
  ['a refused launch', { launch: { ok: false } }, REASON.NOT_CLAUDE],
  ['a fenced role', { requested: SID_F, launch: { ok: true, kind: 'role', role: 'web-scout', fenced: true }, cwd: fencedRec.worktree }, REASON.FENCED],
  ['a different role', { launch: { ok: true, kind: 'role', role: 'reviewer', fenced: false } }, REASON.ROLE_MISMATCH],
  ['a bare pane for a builder record', { launch: bareLaunch }, REASON.ROLE_MISMATCH],
  ['a role pane for a bare record', { requested: SID_B, cwd: 'D:\\Workspace\\repo' }, REASON.ROLE_MISMATCH],
  ['a different folder', { cwd: 'D:\\Workspace\\other' }, REASON.WORKTREE_MISMATCH],
  ['no folder comparison', { sameFolder: undefined }, REASON.WORKTREE_MISMATCH],
  ['a folder comparison that throws', { sameFolder: () => { throw new Error('x'); } }, REASON.WORKTREE_MISMATCH],
  ['an opening prompt', { initialPrompt: 'Review this diff' }, REASON.WITH_PROMPT],
  ['an unreadable offer', { offer: { ok: false, reason: 'session-memory-invalid' } }, REASON.OFFER_UNREADABLE],
  ['no offer', { offer: null }, REASON.OFFER_UNREADABLE],
];
for (const [label, over, reason] of cases) {
  const r = checkResume(Object.assign({}, base, over));
  assert(!r.ok && r.reason === reason, `${label}: refused [${reason}]`);
}
assert(Object.values(REASON).every((v) => /^resume-[a-z-]+$/.test(v)), 'every reason is a bounded constant');

process.stdout.write('\nsession-resume: ' + passed + ' passed, ' + failed + ' failed\n');
process.exit(failed ? 1 : 0);
