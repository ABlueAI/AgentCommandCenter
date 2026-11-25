'use strict';

// S62 merged-work history: a main-owned record of every pull request merged into a repository's
// main branch, kept once per merge and stored beneath Electron userData so it survives a restart,
// plus the tree view of that history (repository, then plan session, then merges) that the brain
// tab's history (S18) and Ctrl+F read. Data only: no IPC, no UI and no process is started here.
//
// Where merges come from: the local clone's first-parent merge commits on main
// (`git log --first-parent --merges --format=%H%x09%cI%x09%s <ref>`), whose subjects GitHub writes as
// "Merge pull request #N from owner/branch". parseGitMergeLog turns that text into merge records, so
// no GitHub token or network call is needed. Running git is left to the caller.
//
// "Once" means one record per repository and PR number. Recording the same merge again changes
// nothing; the same PR number with a different merge commit is refused visibly, never overwritten.
// Malformed data is preserved and refused, never repaired or replaced, the same rule as
// session-memory.js and quick-links-store.js.

const fs = require('fs');
const path = require('path');

const FILENAME = 'merge-history.json';
const VERSION = 1;
const MAX_RECORDS = 5000;          // over a year of merges at about a dozen a day; full means refuse
const MAX_FILE_BYTES = 4194304;    // 4 MiB; 5000 records are well under it
const MAX_TEXT_LENGTH = 512;       // title and branch
const MAX_REPO_LENGTH = 140;       // owner/name: GitHub caps owner at 39 and name at 100

const SHA_RE = /^[0-9a-f]{40}$/;
const REPO_RE = /^[A-Za-z0-9-]{1,39}\/[A-Za-z0-9._-]{1,100}$/;
const SESSION_RE = /^(S\d{1,3}):/;
const MERGE_SUBJECT_RE = /^Merge pull request #(\d{1,7}) from ([A-Za-z0-9-]{1,39})\/(\S{1,255})$/;
const NO_SESSION = 'other';

const REASON = Object.freeze({
  READ_FAILED: 'merge-history-read-failed',
  REPARSE_POINT: 'merge-history-reparse-point-refused',
  NOT_REGULAR_FILE: 'merge-history-not-regular-file',
  TOO_LARGE: 'merge-history-too-large',
  INVALID: 'merge-history-invalid',
  WRITE_FAILED: 'merge-history-write-failed',
  BAD_MERGE: 'merge-history-bad-merge',
  CONFLICTING_MERGE: 'merge-history-conflicting-merge',
  FULL: 'merge-history-full',
});

function refuse(reason, extra) { return Object.assign({ ok: false, reason }, extra || {}); }

// Strict ISO 8601 with a time zone (what `git log %cI` and toISOString write). Date.parse alone would
// accept text such as '1' or 'Nov 25 2026' and guess a time.
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$/;
function isIsoTime(v) { return typeof v === 'string' && v.length <= 40 && ISO_RE.test(v) && !Number.isNaN(Date.parse(v)); }
function isRepo(v) { return typeof v === 'string' && v.length <= MAX_REPO_LENGTH && REPO_RE.test(v); }
function isPrNumber(v) { return Number.isInteger(v) && v > 0 && v < 10000000; }
function isSha(v) { return typeof v === 'string' && SHA_RE.test(v); }
function optionalText(v) { return v === null || (typeof v === 'string' && v.length > 0 && v.length <= MAX_TEXT_LENGTH); }

// The plan session a merge belongs to, from a title that starts "Sxx:" (the claim rule's format).
function sessionOf(title) {
  const m = typeof title === 'string' ? SESSION_RE.exec(title) : null;
  return m ? m[1] : null;
}

function validRecord(r) {
  if (!r || typeof r !== 'object' || Array.isArray(r)) return false;
  const keys = Object.keys(r).sort().join(',');
  if (keys !== 'branch,mergeSha,mergedAt,number,recordedAt,repo,session,title') return false;
  if (!isRepo(r.repo) || !isPrNumber(r.number) || !isSha(r.mergeSha)) return false;
  if (!isIsoTime(r.mergedAt) || !isIsoTime(r.recordedAt)) return false;
  if (!optionalText(r.title) || !optionalText(r.branch)) return false;
  return r.session === null || (typeof r.session === 'string' && /^S\d{1,3}$/.test(r.session));
}

function keyOf(r) { return `${r.repo.toLowerCase()}#${r.number}`; }

function parseText(text) {
  let doc;
  try { doc = JSON.parse(text); } catch { return refuse(REASON.INVALID); }
  if (!doc || typeof doc !== 'object' || doc.version !== VERSION || !Array.isArray(doc.records)) {
    return refuse(REASON.INVALID);
  }
  if (doc.records.length > MAX_RECORDS || !doc.records.every(validRecord)) return refuse(REASON.INVALID);
  const keys = new Set(doc.records.map(keyOf));
  if (keys.size !== doc.records.length) return refuse(REASON.INVALID);
  return { ok: true, records: doc.records };
}

// Checks and normalises one merge from a caller. Returns the record (without recordedAt) or null.
function normaliseMerge(m) {
  if (!m || typeof m !== 'object') return null;
  const { repo, number, mergeSha, mergedAt } = m;
  const title = m.title === undefined ? null : m.title;
  const branch = m.branch === undefined ? null : m.branch;
  if (!isRepo(repo) || !isPrNumber(number) || !isSha(mergeSha) || !isIsoTime(mergedAt)) return null;
  if (!optionalText(title) || !optionalText(branch)) return null;
  return { repo, number, mergeSha, mergedAt: new Date(mergedAt).toISOString(), title, branch, session: sessionOf(title) };
}

// The git command whose output parseGitMergeLog reads. Each commit ends with the record separator
// (0x1e), so a merge commit's body, which can span lines, stays with its commit.
const GIT_LOG_FORMAT = '%H%x09%cI%x09%s%x09%b%x1e';

// Parses `git log --first-parent --merges --format=<GIT_LOG_FORMAT> <ref>` output into merges for
// `repo`. GitHub writes a PR merge's subject as "Merge pull request #N from owner/branch" and puts the
// PR title on the first line of the body, which gives the merge its title and plan session.
// Commits that aren't a GitHub PR merge (a local merge, for instance) are skipped and counted, so the
// caller can show how many it ignored instead of hiding them. A malformed entry is refused.
function parseGitMergeLog(repo, text) {
  if (!isRepo(repo)) return refuse(REASON.BAD_MERGE);
  if (typeof text !== 'string') return refuse(REASON.BAD_MERGE);
  const merges = [];
  let skipped = 0;
  const entries = text.split('\x1e').map((e) => e.replace(/^[\r\n]+/, '')).filter((e) => e.trim().length > 0);
  for (const entry of entries) {
    const parts = entry.split('\t');
    if (parts.length < 4) return refuse(REASON.BAD_MERGE, { entry: entry.slice(0, 200) });
    const [sha, when, subject] = parts;
    const body = parts.slice(3).join('\t');
    if (!isSha(sha) || !isIsoTime(when)) return refuse(REASON.BAD_MERGE, { entry: entry.slice(0, 200) });
    const m = MERGE_SUBJECT_RE.exec(subject);
    if (!m) { skipped++; continue; }
    const first = body.split(/\r?\n/)[0].trim();
    const title = first.length > 0 && first.length <= MAX_TEXT_LENGTH ? first : null;
    merges.push({ repo, number: Number(m[1]), mergeSha: sha, mergedAt: when, title, branch: m[3] });
  }
  return { ok: true, merges, skipped };
}

function createMergeHistoryStore({ userDataDir, fsImpl = fs, now = () => new Date() } = {}) {
  if (typeof userDataDir !== 'string' || !userDataDir) {
    throw new Error('merge-history: userDataDir is required');
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
      // Same atomic writer as session-memory.js: exclusive temp, flush, one rename.
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
    return { ok: true };
  }

  // Records a batch of merges in one read and one write. Every merge is checked before anything is
  // written: one bad or conflicting merge refuses the whole batch, so a half-recorded batch can't
  // happen. A merge already recorded with the same commit is counted as a duplicate and left alone.
  // A title given later for a merge recorded without one is filled in (the only field ever changed).
  // Nothing is ever dropped (Blue, 2026-11-11: "nothing really ever disappears unless it's
  // explicitly deleted or told to be deleted"):
  // a batch that would take the store past MAX_RECORDS is refused whole, and the file is left as it is.
  // A new merge takes the spelling of its repository already stored, so letter case never splits one.
  function recordMerges(merges) {
    if (!Array.isArray(merges)) return refuse(REASON.BAD_MERGE);
    const incoming = [];
    for (const m of merges) {
      const n = normaliseMerge(m);
      if (!n) return refuse(REASON.BAD_MERGE);
      incoming.push(n);
    }
    const cur = read();
    if (!cur.ok) return cur;
    const records = cur.records.map((r) => Object.assign({}, r));
    const byKey = new Map(records.map((r) => [keyOf(r), r]));
    const repoSpelling = new Map(records.map((r) => [r.repo.toLowerCase(), r.repo]));
    const at = now().toISOString();
    let added = 0;
    let duplicates = 0;
    let titled = 0;
    for (const n of incoming) {
      const k = keyOf(n);
      const existing = byKey.get(k);
      if (existing) {
        if (existing.mergeSha !== n.mergeSha) {
          return refuse(REASON.CONFLICTING_MERGE, { repo: n.repo, number: n.number });
        }
        if (existing.title === null && n.title !== null) {
          existing.title = n.title;
          existing.session = n.session;
          titled++;
        } else {
          duplicates++;
        }
        continue;
      }
      const repoKey = n.repo.toLowerCase();
      if (!repoSpelling.has(repoKey)) repoSpelling.set(repoKey, n.repo);
      const rec = Object.assign({}, n, { repo: repoSpelling.get(repoKey), recordedAt: at });
      records.push(rec);
      byKey.set(k, rec);
      added++;
    }
    if (added === 0 && titled === 0) return { ok: true, added, duplicates, titled };
    if (records.length > MAX_RECORDS) return refuse(REASON.FULL, { max: MAX_RECORDS });
    records.sort((a, b) => Date.parse(a.mergedAt) - Date.parse(b.mergedAt) || a.number - b.number);
    const w = write(records);
    if (!w.ok) return w;
    return { ok: true, added, duplicates, titled };
  }

  function recordMerge(merge) { return recordMerges([merge]); }

  function list() { return read(); }

  function tree() {
    const cur = read();
    if (!cur.ok) return cur;
    return { ok: true, tree: buildTree(cur.records) };
  }

  return { recordMerge, recordMerges, list, tree, filePath };
}

// The tree: repositories, then plan sessions (merges whose title has no "Sxx:" go under "other"),
// then merges, newest first at every level. Each node carries its merge count and newest merge time,
// so a folded node can still say how much is under it. Pure: the same records give the same tree.
function buildTree(records) {
  const repos = new Map();
  for (const r of records) {
    // Grouped by the name in lower case, shown with the first spelling seen.
    const key = r.repo.toLowerCase();
    if (!repos.has(key)) repos.set(key, { name: r.repo, sessions: new Map() });
    const sessions = repos.get(key).sessions;
    const s = r.session || NO_SESSION;
    if (!sessions.has(s)) sessions.set(s, []);
    sessions.get(s).push(r);
  }
  const newestFirst = (a, b) => Date.parse(b.mergedAt) - Date.parse(a.mergedAt) || b.number - a.number;
  const byNewest = (a, b) => Date.parse(b.lastMergedAt) - Date.parse(a.lastMergedAt) || a.id.localeCompare(b.id);
  const out = [];
  for (const { name: repo, sessions } of repos.values()) {
    const sessionNodes = [];
    for (const [id, merges] of sessions) {
      const sorted = merges.slice().sort(newestFirst);
      sessionNodes.push({
        id,
        count: sorted.length,
        lastMergedAt: sorted[0].mergedAt,
        merges: sorted.map((m) => ({
          number: m.number, title: m.title, branch: m.branch, mergeSha: m.mergeSha, mergedAt: m.mergedAt,
        })),
      });
    }
    sessionNodes.sort(byNewest);
    out.push({
      id: repo,
      count: sessionNodes.reduce((n, s) => n + s.count, 0),
      lastMergedAt: sessionNodes[0].lastMergedAt,
      sessions: sessionNodes,
    });
  }
  return out.sort(byNewest);
}

module.exports = {
  createMergeHistoryStore,
  parseGitMergeLog,
  GIT_LOG_FORMAT,
  buildTree,
  sessionOf,
  REASON,
  FILENAME,
  MAX_RECORDS,
  NO_SESSION,
};
