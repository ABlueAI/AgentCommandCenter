'use strict';
// Run: node .github/scripts/plan-sync.test.js
//
// The plan sync (S03) keeps one issue per docs/PLAN-1.1.md session, and only ever touches issues the
// workflow itself opened. Fixtures model GitHub's REST and GraphQL answers; no token or network.

const fs = require('fs');
const path = require('path');
const { syncPlan, parsePlan, githubApi, githubBoard, COLUMNS, LABELS, MILESTONE, BOT, MARKER } = require('./plan-sync');

let passed = 0, failed = 0;
function assert(cond, label) {
  if (cond) { process.stdout.write(`  ✓ ${label}\n`); passed++; }
  else { process.stderr.write(`  ✗ FAIL: ${label}\n`); failed++; }
}
function eq(a, b, label) { assert(JSON.stringify(a) === JSON.stringify(b), `${label} (got ${JSON.stringify(a)})`); }
async function throws(fn, pattern, label) {
  try { await fn(); assert(false, `${label} (did not throw)`); }
  catch (e) { assert(pattern.test(e.message), `${label} (${e.message})`); }
}

const HEAD = '| # | Session | Done when | Auth | Lane | Needs | Status |\n|---|---|---|---|---|---|---|\n';
const row = (id, title, status, extra = {}) =>
  `| ${id} | **${title}.** ${extra.text || 'Do it.'} | ${extra.done || 'Done.'} | ${extra.auth || 'High'} | ${extra.lane || 'cloud'} | ${extra.needs || 'S01'} | ${status} |\n`;
const plan = (...rows) => `# Plan\n\n${HEAD}${rows.join('')}\nAfter the table.\n`;
const URL = 'https://github.com/o/r/blob/main/docs/PLAN-1.1.md';

// A fake repository: labels, milestones, issues (by number) and PRs. Records every write.
function fakeRepo({ labels = [], milestones = [], issues = [], prs = {} } = {}) {
  const state = { labels: labels.map((name) => ({ name })), milestones: [...milestones], issues: new Map(), writes: [] };
  let next = 100;
  for (const i of issues) state.issues.set(i.number, { node_id: `N${i.number}`, body: '', state: 'open', labels: [], milestone: null, ...i });
  const api = {
    listLabels: async () => state.labels,
    createLabel: async (l) => { state.labels.push(l); state.writes.push(['label', l.name]); },
    listMilestones: async () => state.milestones,
    createMilestone: async (title) => { const m = { number: 7, title }; state.milestones.push(m); state.writes.push(['milestone', title]); return m; },
    listIssues: async () => [...state.issues.values()].map((i) => ({ ...i, labels: [...i.labels] })),
    createIssue: async (f) => {
      const i = { number: next++, node_id: `N${next - 1}`, state: 'open', user: BOT, ...f };
      state.issues.set(i.number, i); state.writes.push(['create', i.number, f.title]); return i;
    },
    updateIssue: async (n, f) => {
      const i = state.issues.get(n);
      if (i.user !== BOT) throw new Error(`touched someone else's issue #${n}`);
      Object.assign(i, f); state.writes.push(['update', n, Object.keys(f).sort().join(',')]);
    },
    getPr: async (n) => { if (!(n in prs)) throw new Error(`unexpected PR #${n}`); return prs[n]; },
  };
  return { api, state };
}
function fakeBoard(columns = COLUMNS) {
  const placed = [], removed = [];
  return { placed, removed, board: {
    columns: async () => Object.fromEntries(columns.map((c) => [c, `opt-${c}`])),
    place: async (node, option) => { placed.push([node, option]); },
    remove: async (node) => { removed.push(node); },
  } };
}

(async () => {
  process.stdout.write('\nparsing docs/PLAN-1.1.md\n');
  const real = parsePlan(fs.readFileSync(path.join(__dirname, '..', '..', 'docs', 'PLAN-1.1.md'), 'utf8'));
  assert(real.length >= 20, `the real plan parses (${real.length} sessions)`);
  const s03 = real.find((s) => s.id === 'S03');
  assert(s03 && s03.title === 'Plan to issues', `S03's title is read from its bold text (${s03 && s03.title})`);
  assert(real.some((s) => s.status.kind === 'hold'), 'the real plan has HOLD rows and they parse');
  assert(real.some((s) => s.status.kind === 'dropped'), 'the real plan has a DROPPED row and it parses');
  assert(real.find((s) => s.id === 'S06').sensitive, 'S06 ("Sensitive.") is marked sensitive');
  assert(!real.find((s) => s.id === 'S08').sensitive, 'S08 is not marked sensitive');
  for (const id of ['S06', 'S10', 'S24', 'S26', 'S28']) assert(real.find((s) => s.id === id).sensitive, `${id} is marked sensitive`);
  assert(!s03.sensitive, 'S03 is not marked sensitive by its own label list ("sensitive, security-alert")');
  await throws(() => parsePlan(plan(row('S01', 'A', 'MAYBE'))), /unknown status "MAYBE"/, 'an unknown status throws');
  await throws(() => parsePlan('# no table'), /header not found/, 'a missing table throws');
  await throws(() => parsePlan(plan('| S01 | **A.** | x | High | cloud | READY |\n')), /6 cells/, 'a row with a missing cell throws');
  await throws(() => parsePlan(plan(row('S01', 'A', 'READY'), row('S01', 'B', 'READY'))), /appears twice/, 'a duplicate session id throws');

  process.stdout.write('\nfirst run: labels, milestone, one issue per session\n');
  {
    const { api, state } = fakeRepo({ prs: { 9: { state: 'open', draft: true } } });
    const md = plan(
      row('S01', 'Guardrails', 'DONE (#44)'),
      row('S02', 'Plan to issues', 'READY', { auth: 'Max' }),
      row('S03', 'Alerts', 'IN PROGRESS (#9)', { text: 'Sensitive. Uses @someone.' }),
      row('S04', 'Design', 'HOLD (Blue)', { lane: 'blue', auth: 'Medium' }),
      row('S05', 'Roles', 'NEEDS BLUE (package)'),
      row('S06', 'Composer', 'DROPPED (folded into S16)', { auth: '—', lane: '—', needs: '—' }));
    const summary = await syncPlan({ markdown: md, planUrl: URL, api });
    eq(state.labels.map((l) => l.name).sort(), LABELS.map((l) => l.name).sort(), 'every label is created');
    assert(state.milestones.some((m) => m.title === MILESTONE), 'the milestone is created');
    eq(summary.map((s) => s.column), ['Done', 'Ready', 'Running', 'Hold', 'Needs Blue', null], 'columns follow the status');
    const byTitle = Object.fromEntries([...state.issues.values()].map((i) => [i.title.slice(0, 3), i]));
    eq(Object.keys(byTitle).sort(), ['S01', 'S02', 'S03', 'S04', 'S05'], 'no issue is opened for a DROPPED session');
    eq(byTitle.S01.state, 'closed', 'a DONE session\'s issue is closed');
    eq(byTitle.S02.title, 'S02: Plan to issues', 'titles are `Sxx: <title>`');
    eq(byTitle.S02.labels, ['authority: max', 'lane: cloud', 'status: ready'], 'a READY row gets status, authority and lane labels');
    eq(byTitle.S03.labels, ['authority: high', 'lane: cloud', 'sensitive', 'status: running'], 'a sensitive row is labelled sensitive');
    eq(byTitle.S04.labels, ['authority: medium', 'hold', 'lane: blue', 'status: hold'], 'a HOLD row is labelled hold, never ready');
    assert(byTitle.S05.labels.includes('needs-blue'), 'a NEEDS BLUE row is labelled needs-blue');
    assert(byTitle.S02.milestone === 7, 'issues are in the milestone');
    assert(byTitle.S02.body.startsWith(MARKER), 'bodies start with the generated-file marker');
    assert(byTitle.S03.body.includes('at-someone') && !byTitle.S03.body.includes('@'), 'mentions are neutralised (no `@` in generated text)');

    process.stdout.write('\nsecond run with no plan change writes nothing\n');
    state.writes.length = 0;
    await syncPlan({ markdown: md, planUrl: URL, api });
    eq(state.writes, [], 'an unchanged plan makes no writes');

    process.stdout.write('\nstatus changes move the issue\n');
    const md2 = md.replace('| HOLD (Blue) |', '| READY |').replace('| DONE (#44) |', '| READY |');
    await syncPlan({ markdown: md2, planUrl: URL, api });
    eq(byTitle.S04.labels, ['authority: medium', 'lane: blue', 'status: ready'], 'HOLD to READY swaps the labels');
    eq(byTitle.S01.state, 'open', 'a row set back from DONE reopens its issue');
  }

  process.stdout.write('\nownership: only the workflow\'s own `Sxx: ` issues are touched\n');
  {
    const { api, state } = fakeRepo({
      labels: LABELS.map((l) => l.name), milestones: [{ number: 3, title: MILESTONE }],
      issues: [
        { number: 1, title: 'S02: something Blue wrote', user: 'ABlueAI' },
        { number: 2, title: 'agent-roles package (S28)', user: 'ABlueAI' },
        { number: 3, title: 'S02: old title', user: BOT, labels: ['agent-claimed', 'status: hold'], milestone: 3 },
        { number: 4, title: 'Security alert: unapproved change on main', user: BOT, labels: ['security-alert'] },
      ],
    });
    await syncPlan({ markdown: plan(row('S02', 'New title', 'READY')), planUrl: URL, api });
    const i3 = state.issues.get(3);
    eq(i3.title, 'S02: New title', 'the workflow\'s own issue is renamed to match the plan');
    eq(i3.labels, ['agent-claimed', 'authority: high', 'lane: cloud', 'status: ready'], 'labels the sync does not manage (agent-claimed) are kept');
    eq(state.issues.get(1).title, 'S02: something Blue wrote', 'an `Sxx: ` issue opened by someone else is untouched');
    eq(state.issues.get(4).labels, ['security-alert'], 'the merge audit\'s issue is untouched');
    assert(state.writes.every((w) => w[0] !== 'create'), 'no duplicate issue is opened when one exists');
  }
  {
    const { api } = fakeRepo({ issues: [
      { number: 5, title: 'S02: a', user: BOT }, { number: 6, title: 'S02: b', user: BOT }] });
    await throws(() => syncPlan({ markdown: plan(row('S02', 'A', 'READY')), planUrl: URL, api }),
      /two sync issues for S02 \(#5, #6\)/, 'two sync issues for one session throw instead of guessing');
  }
  {
    const { api, state } = fakeRepo({ issues: [{ number: 8, title: 'S27: Composer', user: BOT }] });
    await syncPlan({ markdown: plan(row('S27', 'Composer', 'DROPPED (folded)')), planUrl: URL, api });
    eq([state.issues.get(8).state, state.issues.get(8).state_reason], ['closed', 'not_planned'], 'a DROPPED session\'s existing issue is closed as not planned');
  }

  {
    const { api, state } = fakeRepo({ issues: [{ number: 8, title: 'S27: Composer', user: BOT, state: 'closed', state_reason: 'not_planned', labels: ['status: done'] }] });
    await syncPlan({ markdown: plan(row('S27', 'Composer', 'DONE (#60)')), planUrl: URL, api });
    eq([state.issues.get(8).state, state.issues.get(8).state_reason], ['closed', 'completed'], 'a row going from DROPPED to DONE re-closes its issue as completed');
  }

  process.stdout.write('\nIN PROGRESS shows Ready to merge only while its PR is open and not a draft\n');
  for (const [pr, want] of [[{ state: 'open', draft: false }, 'Ready to merge'], [{ state: 'open', draft: true }, 'Running'], [{ state: 'closed', draft: false }, 'Running']]) {
    const { api } = fakeRepo({ prs: { 9: pr } });
    const [s] = await syncPlan({ markdown: plan(row('S03', 'A', 'IN PROGRESS (#9)')), planUrl: URL, api });
    eq(s.column, want, `PR ${pr.state}${pr.draft ? ' draft' : ''} -> ${want}`);
  }

  process.stdout.write('\nthe board\n');
  {
    const { api } = fakeRepo({ prs: { 9: { state: 'open', draft: false } } });
    const { board, placed } = fakeBoard();
    await syncPlan({ markdown: plan(row('S01', 'A', 'READY'), row('S02', 'B', 'IN PROGRESS (#9)'), row('S03', 'C', 'DROPPED (x)')), planUrl: URL, api, board });
    eq(placed, [['N100', 'opt-Ready'], ['N101', 'opt-Ready to merge']], 'each issue is placed in its column; DROPPED rows stay off the board');
  }
  {
    const { api, state } = fakeRepo();
    const { board, placed, removed } = fakeBoard();
    const md = plan(row('S01', 'A', 'READY', { text: 'Sensitive.' }));
    await syncPlan({ markdown: md, planUrl: URL, api, board });
    const issue = state.issues.get(100);
    await syncPlan({ markdown: md.replace('| READY |', '| DROPPED (folded) |'), planUrl: URL, api, board });
    eq(removed, ['N100'], 'a placed session that becomes DROPPED is removed from the board');
    eq([issue.state, issue.state_reason, issue.labels], ['closed', 'not_planned', []], 'and its issue is closed as not planned without managed labels');
    state.writes.length = 0;
    await syncPlan({ markdown: md.replace('| READY |', '| DROPPED (folded) |'), planUrl: URL, api, board });
    eq(state.writes, [], 'a DROPPED issue already tidied is not written again');
    eq(placed.length, 1, 'and is never placed again');
  }
  {
    const { api, state } = fakeRepo();
    const { board } = fakeBoard(COLUMNS.filter((c) => c !== 'Hold'));
    await throws(() => syncPlan({ markdown: plan(row('S01', 'A', 'READY')), planUrl: URL, api, board }),
      /missing: Hold/, 'a board without a Hold column throws');
    assert(state.writes.every((w) => w[0] !== 'create'), 'and opens no issue before failing');
  }

  process.stdout.write('\nthe REST adapter\n');
  {
    const calls = [];
    const github = {
      paginate: async (fn, params) => fn(params),
      rest: { issues: { listForRepo: (p) => { calls.push(p); return [
        { number: 1, node_id: 'A', title: 'S01: x', body: null, state: 'open', labels: [{ name: 'hold' }, 'plain'], milestone: { number: 3 }, user: { login: BOT } },
        { number: 2, title: 'S02: pr', labels: [], user: { login: BOT }, pull_request: {} }]; } } },
    };
    const issues = await githubApi(github, { owner: 'o', repo: 'r' }).listIssues();
    eq(issues, [{ number: 1, node_id: 'A', title: 'S01: x', body: '', state: 'open', state_reason: null, labels: ['hold', 'plain'], milestone: 3, user: BOT }],
      'issues are normalised and pull requests filtered out');
    eq(calls[0].state, 'all', 'closed issues are listed too, so a reopened plan row never opens a duplicate');
  }

  process.stdout.write('\nthe GraphQL board adapter\n');
  {
    const calls = [];
    const graphql = async (query, vars) => {
      calls.push([query.replace(/\s+/g, ' ').trim().split(' ').slice(0, 2).join(' '), vars]);
      if (/projectV2\(number/.test(query)) return { user: { projectV2: { id: 'P', field: { id: 'F', options: [{ id: 'o1', name: 'Ready' }, { id: 'o2', name: 'Done' }] } } } };
      if (/addProjectV2ItemById/.test(query)) return { addProjectV2ItemById: { item: { id: 'ITEM' } } };
      if (/projectItems/.test(query)) return { node: { projectItems: { nodes: vars.content === 'I2'
        ? [{ id: 'mine', project: { id: 'P' } }, { id: 'other', project: { id: 'Q' } }, { id: 'hidden', project: null }] : [] } } };
      return {};
    };
    const b = githubBoard(graphql, { login: 'ABlueAI', number: 3 });
    await throws(() => b.place('I1', 'o1'), /columns\(\) must run before place/, 'place() refuses before columns()');
    eq(await b.columns(), { Ready: 'o1', Done: 'o2' }, 'columns() maps the Status options by name');
    eq(calls[0][1], { login: 'ABlueAI', number: 3 }, 'columns() asks for the configured user project');
    calls.length = 0;
    await b.place('I1', 'o2');
    eq(calls.map((c) => c[1]), [{ project: 'P', content: 'I1' }, { project: 'P', item: 'ITEM', field: 'F', option: 'o2' }], 'place() adds the issue, then sets its Status');
    calls.length = 0;
    await b.remove('I2');
    eq(calls.slice(1).map((c) => c[1]), [{ project: 'P', item: 'mine' }], 'remove() deletes only this project\'s item (other and unreadable projects are left alone)');
    calls.length = 0;
    await b.remove('I3');
    eq(calls.length, 1, 'remove() of an issue not on the board only looks it up');
    const none = githubBoard(async () => ({ user: { projectV2: null } }), { login: 'x', number: 1 });
    await throws(() => none.columns(), /not found or not readable/, 'a missing project throws');
    const nofield = githubBoard(async () => ({ user: { projectV2: { id: 'P', field: null } } }), { login: 'x', number: 1 });
    await throws(() => nofield.columns(), /no single-select "Status" field/, 'a board without a Status field throws');
  }

  process.stdout.write(`\nplan-sync: ${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { process.stderr.write(`  ✗ FAIL: ${e.stack}\n`); process.exit(1); });
