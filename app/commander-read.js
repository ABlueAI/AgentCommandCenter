'use strict';
// S67: the commander's one GitHub read (docs/COMMANDER.md "Each tick").
//
// Run on H1 as `node app/commander-read.js` from the commander's clone. It reads GitHub's public
// REST API with no login and no token (Blue, 2026-11-25, PR #289: "No GitHub login or token on H1:
// it reads with git fetch and the public API only"), so it can't write anything, and it prints only
// numbers, booleans and session IDs. No PR title, body or comment text reaches the commander's
// chat, so text anyone can write on GitHub can't steer it.
//
// Output: one line of JSON, the shape `summarize` returns, plus `ok` and, on failure, `error`
// (a fixed code from ERRORS) and `status` (the HTTP status). Exit code 0 when ok, 1 when not.

const { isAgentLogin } = require('../.github/scripts/agent-logins.js');

const REPO = 'ABlueAI/AgentCommandCenter';
const API = 'https://api.github.com/repos/' + REPO;
const HOUR = 60 * 60 * 1000;
const MAX_EVENT_PAGES = 3; // GitHub keeps at most 300 public events.
const ERRORS = Object.freeze(['rate-limited', 'http-error', 'bad-response', 'network-error', 'internal-error']);

const labelsOf = (pr) => (Array.isArray(pr.labels) ? pr.labels : []).map((l) => String((l && l.name) || ''));
const loginOf = (x) => (x && x.user && typeof x.user.login === 'string' ? x.user.login : '');
const time = (s) => { const t = Date.parse(s); return Number.isFinite(t) ? t : NaN; };
const SESSION_ID = /^(S\d{1,3}):/;

// Expiry times of the runner-lock markers in a PR body (docs/RUNNER.md "Claims, locks and markers").
function lockExpiries(body) {
  const out = [];
  const re = /<!--\s*runner-lock:\s*expires=(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?Z)/g;
  let m;
  while ((m = re.exec(typeof body === 'string' ? body : '')) !== null) {
    const t = time(m[1]);
    if (Number.isFinite(t)) out.push(t);
  }
  return out;
}

// pulls: GET /pulls?state=open; claimIssues: GET /issues?labels=agent-claimed&state=open;
// events: GET /events pages in order, newest first; eventsReachedHourBack: true only when the
// listing reached an event more than an hour old (AGENTS.md "Agent-account pacing": otherwise the
// count can't be made).
function summarize({ pulls, claimIssues, events, eventsReachedHourBack, now }) {
  const livePRs = [];
  const stalledRunnerPRs = [];
  const claimed = new Set();
  for (const pr of pulls) {
    const n = Number(pr.number);
    if (!Number.isInteger(n)) continue;
    const head = pr.head || {};
    const fromThisRepo = head.repo && head.repo.full_name === REPO;
    if (!fromThisRepo) continue; // fork PRs never count
    const author = loginOf(pr);
    const labels = labelsOf(pr);
    const ref = typeof head.ref === 'string' ? head.ref : '';
    const m = SESSION_ID.exec(typeof pr.title === 'string' ? pr.title : '');
    if (m && (isAgentLogin(author) || author.toLowerCase() === 'ablueai')) claimed.add(m[1]);
    if (labels.includes('runner-status')) continue; // status PRs never count as units
    const hasLiveLock = lockExpiries(pr.body).some((t) => t > now);
    const updated = time(pr.updated_at);
    const held = labels.includes('needs-blue') || labels.includes('waits-for-merge');
    // Live units as docs/RUNNER.md counts them: open PRs holding a live runner-lock marker.
    if (hasLiveLock) { livePRs.push(n); continue; }
    if (pr.draft === true && ref.startsWith('claude/') && labels.includes('runner') && !held
      && isAgentLogin(author) && Number.isFinite(updated)) stalledRunnerPRs.push(n);
  }
  for (const issue of claimIssues) {
    if (issue.pull_request) continue;
    const m = SESSION_ID.exec(typeof issue.title === 'string' ? issue.title : '');
    if (m && isAgentLogin(loginOf(issue))) claimed.add(m[1]);
  }
  let pushes = 0, writes = 0;
  for (const e of events) {
    const t = time(e.created_at);
    if (!Number.isFinite(t) || now - t > HOUR) continue;
    if (!(e.actor && isAgentLogin(e.actor.login))) continue;
    writes++;
    if (e.type === 'PushEvent') pushes++;
  }
  return {
    liveUnits: livePRs.length,
    livePRs: livePRs.sort((a, b) => a - b),
    stalledRunnerPRs: stalledRunnerPRs.sort((a, b) => a - b),
    claimedSessions: [...claimed].sort(),
    pacingCountable: eventsReachedHourBack === true,
    pushesLastHour: pushes,
    writesLastHour: writes,
  };
}

class ReadError extends Error {
  constructor(code, status) { super(code); this.code = code; this.status = status; }
}

async function getJson(fetchImpl, url) {
  if (typeof fetchImpl !== 'function') throw new ReadError('internal-error', 0); // Node older than 18
  let res;
  try {
    // No Authorization header, ever: the public API only (Blue, 2026-11-25).
    res = await fetchImpl(url, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'mako-commander' } });
  } catch {
    throw new ReadError('network-error', 0);
  }
  if (res.status === 429 || (res.status === 403 && res.headers && res.headers.get && res.headers.get('x-ratelimit-remaining') === '0')) {
    throw new ReadError('rate-limited', res.status);
  }
  if (res.status === 403) {
    const text = await res.text().catch(() => '');
    throw new ReadError(/rate limit|abuse/i.test(text) ? 'rate-limited' : 'http-error', 403);
  }
  if (!res.ok) throw new ReadError('http-error', res.status);
  let data;
  try { data = await res.json(); } catch { throw new ReadError('bad-response', res.status); }
  if (!Array.isArray(data)) throw new ReadError('bad-response', res.status);
  return data;
}

async function read(fetchImpl, now) {
  const pulls = await getJson(fetchImpl, API + '/pulls?state=open&per_page=100');
  const claimIssues = await getJson(fetchImpl, API + '/issues?state=open&labels=agent-claimed&per_page=100');
  const events = [];
  let reached = false;
  for (let page = 1; page <= MAX_EVENT_PAGES && !reached; page++) {
    const batch = await getJson(fetchImpl, API + '/events?per_page=100&page=' + page);
    events.push(...batch);
    if (batch.some((e) => now - time(e.created_at) > HOUR)) reached = true;
    if (batch.length < 100) break;
  }
  return { ok: true, ...summarize({ pulls, claimIssues, events, eventsReachedHourBack: reached, now }) };
}

async function main() {
  let out;
  try {
    out = await read(globalThis.fetch, Date.now());
  } catch (e) {
    const code = e instanceof ReadError && ERRORS.includes(e.code) ? e.code : 'internal-error';
    out = { ok: false, error: code, status: e instanceof ReadError ? e.status : 0 };
  }
  process.stdout.write(JSON.stringify(out) + '\n');
  process.exitCode = out.ok ? 0 : 1;
}

if (require.main === module) main();

module.exports = { summarize, lockExpiries, read, ERRORS, REPO };
