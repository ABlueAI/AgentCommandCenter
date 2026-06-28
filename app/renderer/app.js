// Command Center — renderer logic. Talks to main only through `window.cc` (preload).
// No Node here by design; this file is pure UI + IPC calls.

const $ = (sel) => document.querySelector(sel);
const state = { repo: '', githubUrl: '', worktrees: [], chosenAgent: 'claude' };

// ---- boot -------------------------------------------------------------------
async function boot() {
  await refreshRepos();
  wireUi();
  cc.onBoardUrl((url) => loadBoard(url));
  cc.onBoardLog((text) => appendLog(text));
}

async function refreshRepos() {
  const { repos, selectedRepo } = await cc.listRepos();
  const sel = $('#repoSelect');
  sel.innerHTML = '';
  if (repos.length === 0) {
    const o = document.createElement('option');
    o.textContent = '(no repos found — set projects root 📁)';
    o.value = '';
    sel.appendChild(o);
  }
  for (const r of repos) {
    const o = document.createElement('option');
    o.value = r;
    o.textContent = r.split(/[\\/]/).pop();
    sel.appendChild(o);
  }
  state.repo = repos.includes(selectedRepo) ? selectedRepo : (repos[0] || '');
  sel.value = state.repo;
  await onRepoChange();
}

async function onRepoChange() {
  await cc.saveSettings({ selectedRepo: state.repo });
  state.githubUrl = state.repo ? await cc.repoGithubUrl(state.repo) : '';
  await refreshAgents();
}

// ---- agents -----------------------------------------------------------------
async function refreshAgents() {
  const all = state.repo ? await cc.listWorktrees(state.repo) : [];
  // The first worktree is the main checkout; the rest are agents.
  state.worktrees = all.filter((w) => !w.branch || w.branch !== 'main');
  renderAgentList();
  renderAgentGrid();
}

// task slug derived from "<repo>-<task>" worktree folder name
function taskOf(wt) {
  const base = wt.path.split(/[\\/]/).pop();
  const repoName = state.repo.split(/[\\/]/).pop();
  return base.startsWith(repoName + '-') ? base.slice(repoName.length + 1) : (wt.branch || base);
}
function agentColorOf(wt) {
  // best-effort: we can't know which CLI is running, so tag by branch convention
  return 'claude';
}

function renderAgentList() {
  const list = $('#agentList');
  if (state.worktrees.length === 0) {
    list.innerHTML = '<div class="empty">No agents yet. Click <b>+ New</b>.</div>';
    return;
  }
  list.innerHTML = '';
  for (const wt of state.worktrees) {
    const row = document.createElement('div');
    row.className = 'agent-row';
    row.innerHTML = `<span class="dot ${agentColorOf(wt)}"></span>
      <span class="name" title="${wt.path}">${wt.branch || taskOf(wt)}</span>
      <button class="x" title="Remove worktree">✕</button>`;
    row.querySelector('.x').onclick = () => removeAgent(taskOf(wt));
    list.appendChild(row);
  }
}

function renderAgentGrid() {
  const grid = $('#agentGrid');
  grid.innerHTML = '';
  if (state.worktrees.length === 0) {
    grid.innerHTML = '<div class="empty muted">No active agents. Use <b>+ New</b> in the sidebar.</div>';
    return;
  }
  for (const wt of state.worktrees) {
    const task = taskOf(wt);
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <div class="title"><span class="dot ${agentColorOf(wt)}"></span>${wt.branch || task}</div>
      <div class="meta">${wt.path}</div>
      <div class="row">
        <button class="ghost" data-act="claude">Claude</button>
        <button class="ghost" data-act="codex">Codex</button>
        <button class="ghost" data-act="gemini">Gemini</button>
      </div>
      <div class="row">
        <button class="action" data-act="code">VSCode</button>
        <button class="action" data-act="term">Terminal</button>
        <button class="ghost" data-act="rm">Remove</button>
      </div>`;
    card.querySelectorAll('[data-act]').forEach((b) => {
      b.onclick = () => {
        const act = b.dataset.act;
        if (['claude', 'codex', 'gemini'].includes(act)) cc.openAgentTerminal({ worktree: wt.path, agent: act });
        else if (act === 'code') cc.openVscode(wt.path);
        else if (act === 'term') cc.openTerminal(wt.path);
        else if (act === 'rm') removeAgent(task);
      };
    });
    grid.appendChild(card);
  }
}

async function removeAgent(task) {
  await cc.removeAgent({ repo: state.repo, task });
  await refreshAgents();
}

// ---- board ------------------------------------------------------------------
function loadBoard(url) {
  const view = $('#boardView');
  $('#boardEmpty').classList.add('hidden');
  view.classList.remove('hidden');
  view.src = url;
  appendLog(`\n[board] loaded ${url}\n`);
}
function appendLog(text) {
  const log = $('#logView');
  log.textContent += text;
  log.scrollTop = log.scrollHeight;
}

// ---- wiring -----------------------------------------------------------------
function wireUi() {
  $('#repoSelect').onchange = (e) => { state.repo = e.target.value; onRepoChange(); };
  $('#refresh').onclick = refreshRepos;
  $('#changeRoot').onclick = async () => {
    const dir = await cc.pickFolder();
    if (dir) { await cc.saveSettings({ projectsRoot: dir }); await refreshRepos(); }
  };

  $('#openVscode').onclick = () => state.repo && cc.openVscode(state.repo);
  $('#openTerminal').onclick = () => state.repo && cc.openTerminal(state.repo);
  $('#openGithub').onclick = () => state.githubUrl && cc.openExternal(state.githubUrl);

  const start = () => cc.startBoard(state.repo);
  $('#startBoard').onclick = start;
  $('#startBoard2').onclick = start;
  $('#stopBoard').onclick = () => cc.stopBoard();
  $('#loadBoardUrl').onclick = () => { const u = $('#boardUrl').value.trim(); if (u) loadBoard(u); };

  // tabs
  document.querySelectorAll('.tab').forEach((t) => {
    t.onclick = () => {
      document.querySelectorAll('.tab').forEach((x) => x.classList.remove('active'));
      document.querySelectorAll('.tabpane').forEach((x) => x.classList.remove('active'));
      t.classList.add('active');
      document.querySelector(`.tabpane[data-pane="${t.dataset.tab}"]`).classList.add('active');
    };
  });

  // new-agent modal
  $('#newAgent').onclick = openModal;
  $('#modalCancel').onclick = closeModal;
  $('#modalCreate').onclick = createAgent;
  document.querySelectorAll('.choice').forEach((c) => {
    c.onclick = () => {
      document.querySelectorAll('.choice').forEach((x) => x.classList.remove('active'));
      c.classList.add('active');
      state.chosenAgent = c.dataset.agent;
    };
  });
}

function openModal() {
  if (!state.repo) { alert('Pick a repo first (set your projects root with 📁).'); return; }
  $('#taskName').value = '';
  $('#modal').classList.remove('hidden');
  $('#taskName').focus();
}
function closeModal() { $('#modal').classList.add('hidden'); }

async function createAgent() {
  const task = $('#taskName').value.trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-|-$/g, '');
  if (!task) { $('#taskName').focus(); return; }
  closeModal();
  appendLog(`\n[agent] creating worktree agent/${task} (${state.chosenAgent})…\n`);
  await cc.newAgent({ repo: state.repo, task, agent: state.chosenAgent });
  await refreshAgents();
}

boot();
