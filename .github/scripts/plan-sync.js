'use strict';
// Decision logic for .github/workflows/plan-sync.yml (session S03), kept here so it runs on fixtures.
//
// docs/PLAN-1.1.md's session table is the source of truth. The sync keeps one GitHub issue per
// session, titled `Sxx: <title>`, with labels for its status, authority, lane and sensitivity, in the
// "1.1 Month 1" milestone, and (once Blue connects it) one item per issue on the Project board.
//
// Ownership: the sync only ever touches issues that github-actions[bot] opened AND whose title starts
// with `Sxx: `. An issue anyone else opened is never read or edited, whatever its title, so Blue's
// S28 package issue (`agent-roles package (S28)`) and the runner's claims are never touched. Limit:
// github-actions[bot] is the author for every workflow using GITHUB_TOKEN, not only this one, so an
// `Sxx: ` issue another workflow opened would be adopted (or, as a second one, fail the run visibly).
// No workflow in this repository opens such issues.
//
// Status to board column:
//   READY               -> Ready
//   IN PROGRESS (#PR)   -> Running, or Ready to merge while PR #PR is open and not a draft
//   NEEDS BLUE (...)    -> Needs Blue
//   HOLD (Blue)         -> Hold (never Ready, docs/PLAN-1.1.md "Status values")
//   DONE (#PR)          -> Done (issue closed as completed)
//   DROPPED (...)       -> no issue; an existing one is closed as not planned, loses its managed
//                          labels and is removed from the board
// Any other status, a malformed row or two sync issues for one session throws, so the workflow fails
// visibly instead of guessing.
//
// `api` and `board` are injected so the workflow passes GitHub's clients and tests pass fixtures:
//   api.listLabels()                 -> [{ name }]
//   api.createLabel({ name, color, description })
//   api.listMilestones()             -> [{ number, title }]
//   api.createMilestone(title)       -> { number }
//   api.listIssues()                 -> [{ number, node_id, title, body, state, state_reason,
//                                         labels: [name], milestone: number|null, user: login }]
//   api.createIssue({ title, body, labels, milestone }) -> { number, node_id }
//   api.updateIssue(number, fields)
//   api.getPr(number)                -> { state, draft }
//   board.columns()                  -> { [column name]: optionId }
//   board.place(issueNodeId, optionId)
//   board.remove(issueNodeId)        (no-op when the issue isn't on the board)
// Any error from `api` or `board` propagates.

const BOT = 'github-actions[bot]';
const MILESTONE = '1.1 Month 1';
const COLUMNS = ['Ready', 'Running', 'Needs Blue', 'Hold', 'Ready to merge', 'Done'];
const MARKER = '<!-- plan-sync: generated from docs/PLAN-1.1.md on main. Edits here are overwritten; change the plan instead. -->';
const SESSION_TITLE = /^(S\d{2}): /;

const LABELS = [
  { name: 'authority: minimum', color: 'c2e0c6', description: 'AGENTS.md authority level: read, research, plan' },
  { name: 'authority: medium', color: 'fef2c0', description: 'AGENTS.md authority level: edit and test in the branch' },
  { name: 'authority: high', color: 'f9d0c4', description: 'AGENTS.md authority level: multi-step, few interruptions' },
  { name: 'authority: max', color: 'e99695', description: 'AGENTS.md authority level: sandbox only' },
  { name: 'lane: cloud', color: 'bfdadc', description: 'Runs in a cloud session' },
  { name: 'lane: windows', color: 'bfd4f2', description: "Needs Blue's Windows PC" },
  { name: 'lane: blue', color: 'd4c5f9', description: "Needs Blue's hands or decision" },
  { name: 'plan-change', color: '5319e7', description: 'Changes docs/PLAN-1.1.md; merging approves it' },
  { name: 'needs-blue', color: 'd93f0b', description: "Waiting on Blue's answer" },
  { name: 'hold', color: 'cccccc', description: 'On hold until Blue says go' },
  { name: 'sensitive', color: 'b60205', description: 'AGENTS.md sensitive area: flag in the TLDR, second review' },
  { name: 'security-alert', color: 'b60205', description: 'Opened by the merge audit' },
  ...COLUMNS.map((c) => ({ name: `status: ${c.toLowerCase()}`, color: 'ededed', description: `Board column "${c}" (plan sync)` })),
];
const MANAGED = (name) => /^(status|authority|lane): /.test(name) || ['needs-blue', 'hold', 'sensitive'].includes(name);

// Split one markdown table row into cells. The plan's cells contain no `|`; a row with the wrong
// number of cells throws rather than shifting columns.
function cells(line) {
  const parts = line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
  if (parts.length !== 7) throw new Error(`plan sync: row has ${parts.length} cells, expected 7: ${line.slice(0, 60)}`);
  return parts;
}

function parseStatus(raw) {
  let m;
  if (raw === 'READY') return { kind: 'ready' };
  if ((m = /^IN PROGRESS \(#(\d+)\)$/.exec(raw))) return { kind: 'running', pr: Number(m[1]) };
  if (/^NEEDS BLUE \(.+\)$/.test(raw)) return { kind: 'needs-blue' };
  if (raw === 'HOLD (Blue)') return { kind: 'hold' };
  if (/^DONE \(#\d+\)$/.test(raw)) return { kind: 'done' };
  if (/^DROPPED \(.+\)$/.test(raw)) return { kind: 'dropped' };
  throw new Error(`plan sync: unknown status "${raw}"`);
}

function parsePlan(markdown) {
  const lines = markdown.split(/\r?\n/);
  const header = lines.findIndex((l) => /^\| # \| Session \| Done when \| Auth \| Lane \| Needs \| Status \|\s*$/.test(l));
  if (header < 0) throw new Error('plan sync: session table header not found in docs/PLAN-1.1.md');
  const sessions = [];
  for (let i = header + 2; i < lines.length && lines[i].startsWith('|'); i++) {
    const [id, session, doneWhen, auth, lane, needs, status] = cells(lines[i]);
    if (!/^S\d{2}$/.test(id)) throw new Error(`plan sync: bad session id "${id}"`);
    const t = /^\*\*(.+?)\*\*/.exec(session);
    if (!t) throw new Error(`plan sync: ${id} has no bold title`);
    sessions.push({
      id, title: t[1].replace(/\.$/, ''), session, doneWhen, auth, lane, needs, statusText: status,
      status: parseStatus(status), sensitive: /\bSensitive\b/.test(session),
    });
  }
  if (sessions.length === 0) throw new Error('plan sync: the session table is empty');
  const seen = new Set();
  for (const s of sessions) {
    if (seen.has(s.id)) throw new Error(`plan sync: ${s.id} appears twice in the table`);
    seen.add(s.id);
  }
  return sessions;
}

// Generated text never mentions anyone: `@name` becomes `at-name`, so a plan row can't ping a person
// or a bot (AGENTS.md "Security rules" on Codex's handle).
const noMentions = (text) => text.replace(/@(?=[A-Za-z0-9])/g, 'at-');

function column(s, prs) {
  switch (s.status.kind) {
    case 'ready': return 'Ready';
    case 'running': {
      const pr = prs.get(s.status.pr);
      return pr && pr.state === 'open' && !pr.draft ? 'Ready to merge' : 'Running';
    }
    case 'needs-blue': return 'Needs Blue';
    case 'hold': return 'Hold';
    case 'done': return 'Done';
    default: return null;
  }
}

function render(s, col, planUrl) {
  return noMentions([
    MARKER,
    '',
    `**Status:** ${s.statusText} (board: ${col})`,
    `**Needs:** ${s.needs}`,
    `**Authority:** ${s.auth} · **Lane:** ${s.lane}${s.sensitive ? ' · **Sensitive**' : ''}`,
    `**Done when:** ${s.doneWhen}`,
    '',
    s.session,
    '',
    `Source: [docs/PLAN-1.1.md](${planUrl}), row ${s.id}.`,
  ].join('\n'));
}

function desiredLabels(s, col, current) {
  const keep = current.filter((n) => !MANAGED(n));
  const want = [`status: ${col.toLowerCase()}`];
  const auth = s.auth.toLowerCase();
  if (['minimum', 'medium', 'high', 'max'].includes(auth)) want.push(`authority: ${auth}`);
  if (['cloud', 'windows', 'blue'].includes(s.lane)) want.push(`lane: ${s.lane}`);
  if (col === 'Needs Blue') want.push('needs-blue');
  if (col === 'Hold') want.push('hold');
  if (s.sensitive) want.push('sensitive');
  return [...keep, ...want].sort();
}

const unmanaged = (labels) => labels.filter((n) => !MANAGED(n)).sort();
const sameSet = (a, b) => a.length === b.length && [...a].sort().every((x, i) => x === [...b].sort()[i]);

async function syncPlan({ markdown, planUrl, api, board = null, log = () => {} }) {
  const sessions = parsePlan(markdown);

  const haveLabels = new Set((await api.listLabels()).map((l) => l.name));
  for (const label of LABELS) {
    if (!haveLabels.has(label.name)) { await api.createLabel(label); log(`created label "${label.name}"`); }
  }

  let milestone = (await api.listMilestones()).find((m) => m.title === MILESTONE);
  if (!milestone) { milestone = await api.createMilestone(MILESTONE); log(`created milestone "${MILESTONE}"`); }

  const mine = new Map();
  for (const issue of await api.listIssues()) {
    if (issue.user !== BOT) continue;
    const m = SESSION_TITLE.exec(issue.title);
    if (!m) continue;
    if (mine.has(m[1])) throw new Error(`plan sync: two sync issues for ${m[1]} (#${mine.get(m[1]).number}, #${issue.number}); close one`);
    mine.set(m[1], issue);
  }

  const prs = new Map();
  for (const s of sessions) {
    if (s.status.kind === 'running' && !prs.has(s.status.pr)) prs.set(s.status.pr, await api.getPr(s.status.pr));
  }

  const columns = board ? await board.columns() : null;
  if (columns) {
    const missing = COLUMNS.filter((c) => !(c in columns));
    if (missing.length) throw new Error(`plan sync: the board's Status field is missing: ${missing.join(', ')}`);
  }

  const summary = [];
  for (const s of sessions) {
    const issue = mine.get(s.id);
    const col = column(s, prs);
    if (col === null) { // DROPPED
      if (issue) {
        const fields = {};
        if (issue.state !== 'closed' || issue.state_reason !== 'not_planned') Object.assign(fields, { state: 'closed', state_reason: 'not_planned' });
        if (!sameSet(issue.labels, unmanaged(issue.labels))) fields.labels = unmanaged(issue.labels);
        if (Object.keys(fields).length) {
          await api.updateIssue(issue.number, fields);
          log(`${s.id}: dropped, updated #${issue.number} (${Object.keys(fields).join(', ')})`);
        }
        if (columns) await board.remove(issue.node_id);
      }
      summary.push({ id: s.id, column: null, issue: issue ? issue.number : null });
      continue;
    }
    const want = {
      title: noMentions(`${s.id}: ${s.title}`),
      body: render(s, col, planUrl),
      labels: desiredLabels(s, col, issue ? issue.labels : []),
      milestone: milestone.number,
      state: col === 'Done' ? 'closed' : 'open',
    };
    let number, nodeId;
    if (!issue) {
      const created = await api.createIssue({ title: want.title, body: want.body, labels: want.labels, milestone: want.milestone });
      number = created.number; nodeId = created.node_id;
      if (want.state === 'closed') await api.updateIssue(number, { state: 'closed', state_reason: 'completed' });
      log(`${s.id}: created #${number} (${col})`);
    } else {
      number = issue.number; nodeId = issue.node_id;
      const fields = {};
      if (issue.title !== want.title) fields.title = want.title;
      if (issue.body !== want.body) fields.body = want.body;
      if (!sameSet(issue.labels, want.labels)) fields.labels = want.labels;
      if (issue.milestone !== want.milestone) fields.milestone = want.milestone;
      if (issue.state !== want.state) fields.state = want.state;
      if (want.state === 'closed' && issue.state_reason !== 'completed') {
        fields.state = 'closed';
        fields.state_reason = 'completed';
      }
      if (Object.keys(fields).length) {
        await api.updateIssue(number, fields);
        log(`${s.id}: updated #${number} (${Object.keys(fields).join(', ')})`);
      }
    }
    if (columns) await board.place(nodeId, columns[col]);
    summary.push({ id: s.id, column: col, issue: number });
  }
  return summary;
}

// Adapter from actions/github-script's `github` client. Lists are paginated; pull requests are
// filtered out of the issues list.
function githubApi(github, { owner, repo }) {
  return {
    listLabels: () => github.paginate(github.rest.issues.listLabelsForRepo, { owner, repo, per_page: 100 }),
    createLabel: (label) => github.rest.issues.createLabel({ owner, repo, ...label }),
    listMilestones: () => github.paginate(github.rest.issues.listMilestones, { owner, repo, state: 'all', per_page: 100 }),
    createMilestone: async (title) => (await github.rest.issues.createMilestone({ owner, repo, title })).data,
    listIssues: async () => (await github.paginate(github.rest.issues.listForRepo, { owner, repo, state: 'all', per_page: 100 }))
      .filter((i) => !i.pull_request)
      .map((i) => ({
        number: i.number, node_id: i.node_id, title: i.title, body: i.body || '', state: i.state,
        state_reason: i.state_reason || null,
        labels: i.labels.map((l) => (typeof l === 'string' ? l : l.name)),
        milestone: i.milestone ? i.milestone.number : null, user: i.user && i.user.login,
      })),
    createIssue: async (fields) => (await github.rest.issues.create({ owner, repo, ...fields })).data,
    updateIssue: (issue_number, fields) => github.rest.issues.update({ owner, repo, issue_number, ...fields }),
    getPr: async (pull_number) => {
      const { data } = await github.rest.pulls.get({ owner, repo, pull_number });
      return { state: data.state, draft: data.draft };
    },
  };
}

// Adapter for a user-owned Projects (v2) board through GraphQL. `graphql` must carry a token that can
// write that project; the repository's GITHUB_TOKEN can't (checklist step 25).
function githubBoard(graphql, { login, number }) {
  let project = null;
  return {
    columns: async () => {
      const res = await graphql(
        `query($login: String!, $number: Int!) { user(login: $login) { projectV2(number: $number) {
          id field(name: "Status") { ... on ProjectV2SingleSelectField { id options { id name } } } } } }`,
        { login, number });
      const p = res.user && res.user.projectV2;
      if (!p) throw new Error(`plan sync: project ${login}/${number} not found or not readable`);
      if (!p.field || !p.field.options) throw new Error('plan sync: the board has no single-select "Status" field');
      project = { id: p.id, fieldId: p.field.id };
      return Object.fromEntries(p.field.options.map((o) => [o.name, o.id]));
    },
    place: async (contentId, optionId) => {
      if (!project) throw new Error('plan sync: board.columns() must run before place()');
      const added = await graphql(
        `mutation($project: ID!, $content: ID!) { addProjectV2ItemById(input: { projectId: $project, contentId: $content }) { item { id } } }`,
        { project: project.id, content: contentId });
      await graphql(
        `mutation($project: ID!, $item: ID!, $field: ID!, $option: String!) { updateProjectV2ItemFieldValue(input: {
          projectId: $project, itemId: $item, fieldId: $field, value: { singleSelectOptionId: $option } }) { projectV2Item { id } } }`,
        { project: project.id, item: added.addProjectV2ItemById.item.id, field: project.fieldId, option: optionId });
    },
    remove: async (contentId) => {
      if (!project) throw new Error('plan sync: board.columns() must run before remove()');
      const res = await graphql(
        `query($content: ID!) { node(id: $content) { ... on Issue { projectItems(first: 50) { nodes { id project { id } } } } } }`,
        { content: contentId });
      const items = ((res.node && res.node.projectItems && res.node.projectItems.nodes) || []).filter((n) => n.project && n.project.id === project.id);
      for (const item of items) {
        await graphql(
          `mutation($project: ID!, $item: ID!) { deleteProjectV2Item(input: { projectId: $project, itemId: $item }) { deletedItemId } }`,
          { project: project.id, item: item.id });
      }
    },
  };
}

module.exports = { syncPlan, parsePlan, githubApi, githubBoard, COLUMNS, LABELS, MILESTONE, BOT, MARKER };
