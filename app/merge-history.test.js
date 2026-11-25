'use strict';
// Run: node app/merge-history.test.js
//
// S62: the merged-work history store and its tree. Every case uses a disposable temp directory as
// userData. Done-when: each merge is recorded once and survives a restart.

const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  createMergeHistoryStore, parseGitMergeLog, buildTree, sessionOf, REASON, FILENAME, MAX_RECORDS, NO_SESSION,
  GIT_LOG_FORMAT, sessionOfBranch,
} = require('./merge-history');

let passed = 0, failed = 0;
function assert(cond, label) {
  if (cond) { process.stdout.write('  ✓ ' + label + '\n'); passed++; }
  else { process.stderr.write('  x FAIL: ' + label + '\n'); failed++; }
}
function section(t) { process.stdout.write('\n' + t + '\n'); }

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'mako-merge-history-'));
let n = 0;
function freshDir() { const d = path.join(ROOT, 'u' + (++n)); fs.mkdirSync(d); return d; }
function clock(start) {
  let t = Date.parse(start);
  return () => new Date((t += 1000));
}
const sha = (c) => c.repeat(40);
const REPO = 'ABlueAI/AgentCommandCenter';
function merge(number, c, at, extra) {
  return Object.assign({ repo: REPO, number, mergeSha: sha(c), mergedAt: at, title: null, branch: null }, extra || {});
}

section('sessionOf');
assert(sessionOf('S62: tree and merged-work history') === 'S62', 'a "Sxx:" title gives its session');
assert(sessionOf('S4: x') === 'S4', 'a one-digit session counts');
for (const t of ['Runner refresh: x', 'S62 tree', ' S62: x', 's62: x', 'S1234: x', null, undefined, 42]) {
  assert(sessionOf(t) === null, 'no session for ' + JSON.stringify(t));
}

section('sessionOfBranch');
assert(sessionOfBranch('claude/s62-merge-history') === 'S62', 'a claude/sNN- branch gives its session');
assert(sessionOfBranch('codex/S53-agentplayback') === 'S53', 'a codex branch too, in either case');
for (const b of ['claude/nice-wright-ipkymq', 'claude/s62', 's62-x', 'claude/x/s62-y', null, 7]) {
  assert(sessionOfBranch(b) === null, 'no session for ' + JSON.stringify(b));
}
{
  const dir = freshDir();
  const s = createMergeHistoryStore({ userDataDir: dir });
  s.recordMerge(merge(40, 'a', '2026-11-20T10:00:00Z', { branch: 'claude/s46-session-hygiene' }));
  assert(s.list().records[0].session === 'S46', 'an untitled merge takes its session from the branch');
  s.recordMerge(merge(40, 'a', '2026-11-20T10:00:00Z', { title: 'Session hygiene' }));
  assert(s.list().records[0].session === 'S46', 'a later title with no "Sxx:" keeps the branch session');
  s.recordMerge(merge(41, 'b', '2026-11-20T11:00:00Z', { branch: 'claude/s46-x', title: 'S47: y' }));
  assert(s.list().records[1].session === 'S47', 'a title\'s "Sxx:" wins over the branch');
}

section('each merge is recorded once and survives a restart');
{
  const dir = freshDir();
  const s1 = createMergeHistoryStore({ userDataDir: dir, now: clock('2026-11-25T08:00:00Z') });
  const a = s1.recordMerge(merge(253, 'a', '2026-11-24T19:48:48Z', { title: 'S14: design brief', branch: 'claude/s14' }));
  assert(a.ok && a.added === 1 && a.duplicates === 0, 'the first record is added');
  const again = s1.recordMerge(merge(253, 'a', '2026-11-24T19:48:48Z', { title: 'S14: design brief', branch: 'claude/s14' }));
  assert(again.ok && again.added === 0 && again.duplicates === 1, 'the same merge again is a duplicate, not a second record');
  let renames = 0;
  const spy = Object.assign({}, fs, { renameSync: (...a) => { renames++; return fs.renameSync(...a); } });
  const s2 = createMergeHistoryStore({ userDataDir: dir, fsImpl: spy });   // a restart: a new store on the same folder
  const l = s2.list();
  assert(l.ok && l.records.length === 1, 'after a restart there is exactly one record');
  const r = l.records[0];
  assert(r.number === 253 && r.mergeSha === sha('a') && r.session === 'S14' && r.branch === 'claude/s14',
    'with its number, commit, session and branch');
  assert(r.mergedAt === '2026-11-24T19:48:48.000Z' && r.recordedAt === '2026-11-25T08:00:01.000Z',
    'and its merge time (normalised to UTC) and the time it was recorded');
  const third = s2.recordMerges([merge(253, 'a', '2026-11-24T14:48:48-05:00')]);
  assert(third.ok && third.duplicates === 1 && third.added === 0, 'after the restart, the same merge is still a duplicate');
  assert(renames === 0, 'and a batch of only duplicates writes nothing');
}

section('a conflicting merge is refused, never overwritten');
{
  const dir = freshDir();
  const s = createMergeHistoryStore({ userDataDir: dir });
  s.recordMerge(merge(10, 'a', '2026-11-20T10:00:00Z'));
  const before = fs.readFileSync(path.join(dir, FILENAME), 'utf8');
  const c = s.recordMerges([merge(11, 'c', '2026-11-20T11:00:00Z'), merge(10, 'b', '2026-11-20T10:00:00Z')]);
  assert(!c.ok && c.reason === REASON.CONFLICTING_MERGE && c.number === 10, 'the same PR with another commit is refused and named');
  assert(fs.readFileSync(path.join(dir, FILENAME), 'utf8') === before, 'and nothing in the batch is written, the good merge included');
  const other = s.recordMerge(Object.assign(merge(10, 'b', '2026-11-20T10:00:00Z'), { repo: 'ABlueAI/mako-other' }));
  assert(other.ok && other.added === 1, 'the same PR number in another repository is its own merge');
  const caseOnly = s.recordMerge(Object.assign(merge(10, 'a', '2026-11-20T10:00:00Z'), { repo: 'ablueai/agentcommandcenter' }));
  assert(caseOnly.ok && caseOnly.duplicates === 1, 'a repository name in other letter case is the same repository');
}

section('the same merge twice in one batch');
{
  const dir = freshDir();
  const s = createMergeHistoryStore({ userDataDir: dir });
  const same = s.recordMerges([merge(7, 'a', '2026-11-20T10:00:00Z'), merge(7, 'a', '2026-11-20T10:00:00Z')]);
  assert(same.ok && same.added === 1 && same.duplicates === 1, 'the same commit twice is one record and one duplicate');
  const clash = s.recordMerges([merge(8, 'a', '2026-11-20T10:00:00Z'), merge(8, 'b', '2026-11-20T10:00:00Z')]);
  assert(!clash.ok && clash.reason === REASON.CONFLICTING_MERGE, 'two commits for one PR in a batch are refused');
  assert(s.list().records.length === 1, 'and nothing from that batch is written');
}

section('a title given later is filled in once');
{
  const dir = freshDir();
  const s = createMergeHistoryStore({ userDataDir: dir });
  s.recordMerge(merge(5, 'a', '2026-11-20T10:00:00Z', { branch: 'claude/x' }));
  const t = s.recordMerge(merge(5, 'a', '2026-11-20T10:00:00Z', { title: 'S05: needs-you alerts' }));
  assert(t.ok && t.titled === 1 && t.added === 0, 'the title is filled in');
  const rec = s.list().records[0];
  assert(rec.title === 'S05: needs-you alerts' && rec.session === 'S05' && rec.branch === 'claude/x', 'with its session, and the branch kept');
  const t2 = s.recordMerge(merge(5, 'a', '2026-11-20T10:00:00Z', { title: 'S99: something else' }));
  assert(t2.ok && t2.duplicates === 1 && s.list().records[0].title === 'S05: needs-you alerts', 'a later, different title changes nothing');
}

section('bad input is refused, and nothing is written');
{
  const dir = freshDir();
  const s = createMergeHistoryStore({ userDataDir: dir });
  const good = merge(1, 'a', '2026-11-20T10:00:00Z');
  const bads = [
    null, 'x', {},
    Object.assign({}, good, { repo: 'no-slash' }),
    Object.assign({}, good, { repo: '../../etc/x' }),
    Object.assign({}, good, { number: 0 }),
    Object.assign({}, good, { number: 1.5 }),
    Object.assign({}, good, { number: '1' }),
    Object.assign({}, good, { mergeSha: 'abc' }),
    Object.assign({}, good, { mergeSha: 'A'.repeat(40) }),
    Object.assign({}, good, { mergedAt: 'yesterday' }),
    Object.assign({}, good, { mergedAt: '1' }),
    Object.assign({}, good, { mergedAt: '2026' }),
    Object.assign({}, good, { mergedAt: 'Nov 25 2026' }),
    Object.assign({}, good, { mergedAt: '2026-11-25T10:00:00' }),
    Object.assign({}, good, { title: '' }),
    Object.assign({}, good, { title: 'x'.repeat(513) }),
    Object.assign({}, good, { branch: 7 }),
  ];
  for (const b of bads) {
    const r = s.recordMerges([good, b]);
    assert(!r.ok && r.reason === REASON.BAD_MERGE, 'refuses ' + JSON.stringify(b).slice(0, 60));
  }
  assert(!s.recordMerges('not a list').ok, 'refuses a batch that is not a list');
  assert(!fs.existsSync(path.join(dir, FILENAME)), 'and no file was ever written');
  assert(s.recordMerges([]).ok && !fs.existsSync(path.join(dir, FILENAME)), 'an empty batch is fine and writes nothing');
}

section('a bad file is refused and left exactly as it was');
{
  const cases = [
    ['not JSON', '{oops'],
    ['wrong version', JSON.stringify({ version: 2, records: [] })],
    ['records not a list', JSON.stringify({ version: 1, records: {} })],
    ['an extra field', JSON.stringify({ version: 1, records: [{ repo: REPO, number: 1, mergeSha: sha('a'),
      mergedAt: '2026-11-20T10:00:00.000Z', recordedAt: '2026-11-20T10:00:00.000Z', title: null, branch: null,
      session: null, extra: 1 }] })],
    ['the same merge twice', JSON.stringify({ version: 1, records: [1, 2].map(() => ({ repo: REPO, number: 1,
      mergeSha: sha('a'), mergedAt: '2026-11-20T10:00:00.000Z', recordedAt: '2026-11-20T10:00:00.000Z',
      title: null, branch: null, session: null })) })],
  ];
  for (const [label, text] of cases) {
    const dir = freshDir();
    fs.writeFileSync(path.join(dir, FILENAME), text);
    const s = createMergeHistoryStore({ userDataDir: dir });
    const l = s.list();
    const w = s.recordMerge(merge(2, 'b', '2026-11-21T10:00:00Z'));
    const t = s.tree();
    assert(!l.ok && l.reason === REASON.INVALID && !w.ok && !t.ok, label + ': list, record and tree all refuse');
    assert(fs.readFileSync(path.join(dir, FILENAME), 'utf8') === text, label + ': the file is left exactly as it was');
  }
  {
    const dir = freshDir();
    fs.mkdirSync(path.join(dir, FILENAME));
    const r = createMergeHistoryStore({ userDataDir: dir }).list();
    assert(!r.ok && r.reason === REASON.NOT_REGULAR_FILE, 'a folder in place of the file is refused');
  }
  {
    const dir = freshDir();
    const target = path.join(dir, 'elsewhere.json');
    fs.writeFileSync(target, JSON.stringify({ version: 1, records: [] }));
    let linked = true;
    try { fs.symlinkSync(target, path.join(dir, FILENAME)); } catch { linked = false; }
    if (linked) {
      const r = createMergeHistoryStore({ userDataDir: dir }).list();
      assert(!r.ok && r.reason === REASON.REPARSE_POINT, 'a link in place of the file is refused');
    } else {
      process.stdout.write('  - skipped: this account cannot create a symbolic link (Windows without Developer Mode)\n');
    }
  }
  {
    const dir = freshDir();
    let reads = 0;
    const fake = Object.assign({}, fs, {
      lstatSync: () => ({ isSymbolicLink: () => false, isFile: () => true, size: 5 * 1024 * 1024 }),
      readFileSync: () => { reads++; return ''; },
    });
    const r = createMergeHistoryStore({ userDataDir: dir, fsImpl: fake }).list();
    assert(!r.ok && r.reason === REASON.TOO_LARGE && reads === 0, 'a file over the size cap is refused before it is read');
  }
  for (const [label, override] of [
    ['lstat fails with EPERM', { lstatSync: () => { const e = new Error('locked'); e.code = 'EPERM'; throw e; } }],
    ['the read fails', { readFileSync: () => { const e = new Error('busy'); e.code = 'EBUSY'; throw e; } }],
  ]) {
    const dir = freshDir();
    fs.writeFileSync(path.join(dir, FILENAME), JSON.stringify({ version: 1, records: [] }));
    let writes = 0;
    const fake = Object.assign({}, fs, override, {
      openSync: (...a) => { writes++; return fs.openSync(...a); },
      renameSync: (...a) => { writes++; return fs.renameSync(...a); },
    });
    const s = createMergeHistoryStore({ userDataDir: dir, fsImpl: fake });
    const results = [s.list(), s.tree(), s.recordMerge(merge(9, 'a', '2026-11-21T10:00:00Z'))];
    assert(results.every((x) => !x.ok && x.reason === REASON.READ_FAILED), label + ': list, tree and record refuse as read-failed');
    assert(writes === 0, label + ': and nothing is written over the file it could not read');
  }
  {
    const dir = freshDir();
    const fake = Object.assign({}, fs, { renameSync: () => { throw new Error('disk full'); } });
    const s = createMergeHistoryStore({ userDataDir: dir, fsImpl: fake });
    const r = s.recordMerge(merge(3, 'c', '2026-11-21T10:00:00Z'));
    assert(!r.ok && r.reason === REASON.WRITE_FAILED, 'a failed write is refused, not reported as recorded');
    assert(fs.readdirSync(dir).length === 0, 'and its temp file is cleaned up');
  }
}

section('a full store refuses, and never drops a merge');
{
  const dir = freshDir();
  const s = createMergeHistoryStore({ userDataDir: dir });
  const start = Date.parse('2020-01-01T00:00:00Z');
  const mk = (i) => ({ repo: REPO, number: i, mergeSha: i.toString(16).padStart(40, '0'),
    mergedAt: new Date(start + i * 60000).toISOString(), title: null, branch: null });
  const batch = [];
  for (let i = 1; i <= MAX_RECORDS; i++) batch.push(mk(i));
  const r = s.recordMerges(batch);
  assert(r.ok && r.added === MAX_RECORDS, 'a store can hold exactly MAX_RECORDS');
  const before = fs.readFileSync(path.join(dir, FILENAME), 'utf8');
  const over = s.recordMerges([mk(MAX_RECORDS + 1)]);
  assert(!over.ok && over.reason === REASON.FULL && over.max === MAX_RECORDS, 'one more merge is refused as full');
  assert(fs.readFileSync(path.join(dir, FILENAME), 'utf8') === before, 'and the file is left exactly as it was');
  const again = s.recordMerges(batch);
  assert(again.ok && again.added === 0 && again.duplicates === MAX_RECORDS, 'reading the whole history again when full adds nothing');
  assert(s.list().records[0].number === 1, 'the oldest merge is still there');
}

section('parseGitMergeLog');
{
  assert(GIT_LOG_FORMAT === '%H%x09%cI%x09%s%x09%b%x1e', 'the documented git format');
  const RS = '\x1e';
  const text = [
    `${sha('1')}\t2026-11-25T01:30:57-05:00\tMerge pull request #225 from ABlueAI/claude/nice-wright-ipkymq\tS62: tree and merged-work history\r\n\r\nmore body\tline\r\n${RS}\r\n`,
    `${sha('2')}\t2026-11-25T01:30:15-05:00\tMerge branch 'main' into claude/x\t${RS}\n`,
    `${sha('3')}\t2026-11-25T01:29:40-05:00\tMerge pull request #257 from ABlueAI/codex/s53-agentplayback\t${RS}\n`,
  ].join('');
  const p = parseGitMergeLog(REPO, text);
  assert(p.ok && p.merges.length === 2 && p.skipped === 1, 'two PR merges, one other merge skipped and counted (CRLF too)');
  assert(p.merges[0].number === 225 && p.merges[0].mergeSha === sha('1') && p.merges[0].branch === 'claude/nice-wright-ipkymq',
    'number, commit and branch come from the entry');
  assert(p.merges[0].title === 'S62: tree and merged-work history', 'the title is the first line of the body, the rest ignored');
  assert(p.merges[1].branch === 'codex/s53-agentplayback' && p.merges[1].title === null, 'an empty body gives no title');
  const bad = parseGitMergeLog(REPO, `${sha('1')} 2026-11-25 Merge pull request #1 from a/b${RS}`);
  assert(!bad.ok && bad.reason === REASON.BAD_MERGE, 'an entry not in the expected format is refused, not skipped');
  assert(!parseGitMergeLog(REPO, `nothex\t2026-11-25T01:30:57-05:00\tMerge pull request #1 from a/b\t${RS}`).ok, 'a bad commit id is refused');
  assert(!parseGitMergeLog(REPO, `${sha('1')}\tNov 25 2026\tMerge pull request #1 from a/b\t${RS}`).ok, 'a time that is not ISO is refused');
  assert(!parseGitMergeLog('bad', '').ok && !parseGitMergeLog(REPO, null).ok, 'a bad repository or text is refused');
  assert(parseGitMergeLog(REPO, '').ok && parseGitMergeLog(REPO, '\n').merges.length === 0, 'empty output is no merges');
  const dir = freshDir();
  const s = createMergeHistoryStore({ userDataDir: dir });
  assert(s.recordMerges(p.merges).added === 2, 'parsed merges record');
  assert(s.list().records.find((r) => r.number === 225).session === 'S62', 'with the session from the title');
  assert(s.recordMerges(parseGitMergeLog(REPO, text).merges).duplicates === 2, 'and reading the same log again records nothing new');
}

section('the tree');
{
  const dir = freshDir();
  const s = createMergeHistoryStore({ userDataDir: dir });
  s.recordMerges([
    merge(253, 'a', '2026-11-24T19:00:00Z', { title: 'S14: design brief' }),
    merge(282, 'b', '2026-11-25T06:00:00Z', { title: 'Plan: default go' }),
    merge(260, 'c', '2026-11-24T20:00:00Z', { title: 'S14: brief fix' }),
    Object.assign(merge(4, 'd', '2026-11-23T10:00:00Z', { title: 'S01: start' }), { repo: 'ABlueAI/mako-business' }),
  ]);
  const t = s.tree();
  assert(t.ok && t.tree.length === 2, 'one node per repository');
  const [top, second] = t.tree;
  assert(top.id === REPO && top.count === 3 && top.lastMergedAt === '2026-11-25T06:00:00.000Z', 'the most recently merged repository first, with its count');
  assert(second.id === 'ABlueAI/mako-business' && second.count === 1, 'then the other one');
  assert(top.sessions.map((x) => x.id).join(',') === `${NO_SESSION},S14`, 'sessions newest first, untitled-session merges under "other"');
  const s14 = top.sessions[1];
  assert(s14.count === 2 && s14.merges.map((m) => m.number).join(',') === '260,253', 'merges newest first inside a session');
  assert(JSON.stringify(buildTree([])) === '[]', 'no merges is an empty tree');
  s.recordMerge(Object.assign(merge(300, 'e', '2026-11-22T10:00:00Z', { title: 'S14: late' }), { repo: 'ablueai/agentcommandcenter' }));
  const t2 = s.tree();
  assert(t2.ok && t2.tree.length === 2 && t2.tree[0].id === REPO && t2.tree[0].count === 4,
    'a repository name in other letter case joins the same node, under the stored spelling');
  const mixed = buildTree([
    { repo: 'A/b', number: 1, mergeSha: sha('a'), mergedAt: '2026-11-20T10:00:00.000Z', title: null, branch: null, session: null },
    { repo: 'a/B', number: 2, mergeSha: sha('b'), mergedAt: '2026-11-21T10:00:00.000Z', title: null, branch: null, session: null },
  ]);
  assert(mixed.length === 1 && mixed[0].count === 2 && mixed[0].id === 'A/b', 'buildTree groups mixed-case names under the first spelling');
  assert(JSON.stringify(buildTree(s.list().records)) === JSON.stringify(t2.tree), 'buildTree is the same tree from the same records');
}

section('a store needs its folder');
{
  let threw = false;
  try { createMergeHistoryStore({}); } catch { threw = true; }
  assert(threw, 'no userDataDir throws');
}

try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { /* best effort */ }
process.stdout.write('\nmerge-history: ' + passed + ' passed, ' + failed + ' failed\n');
process.exit(failed ? 1 : 0);
