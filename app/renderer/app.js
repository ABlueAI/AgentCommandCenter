// Command Center — renderer logic. Talks to main only through `window.cc` (preload).
// No Node here by design; this file is pure UI + IPC calls.

const $ = (sel) => document.querySelector(sel);
const state = { repo: '', githubUrl: '', worktrees: [], chosenAgent: 'claude' };
const AGENT_CMD = { claude: 'claude', codex: 'codex', gemini: 'gemini' };

// ---- in-app terminals (xterm.js front-end; real ConPTY lives in main) -------
const terms = new Map(); // id -> { term, fit, pane }
let termSeq = 0;
const XTERM_THEME = {
  background: '#06090d', foreground: '#c8d2dc', cursor: '#20c5b7',
  selectionBackground: 'rgba(32,197,183,.35)',
  black: '#0b0f14', red: '#e0556b', green: '#3ad29f', yellow: '#d9b54a',
  blue: '#38bdf8', magenta: '#8b7cf6', cyan: '#20c5b7', white: '#c8d2dc',
  brightBlack: '#6b7785', brightWhite: '#e6edf3',
};
function switchTab(name) {
  document.querySelectorAll('.tab').forEach((x) => x.classList.toggle('active', x.dataset.tab === name));
  document.querySelectorAll('.tabpane').forEach((x) => x.classList.toggle('active', x.dataset.pane === name));
}
function fitAllTerms() { for (const t of terms.values()) { try { t.fit.fit(); } catch {} } }
function showTermEmpty() {
  if (!$('#termEmpty')) {
    const d = document.createElement('div');
    d.className = 'empty muted'; d.id = 'termEmpty';
    d.innerHTML = 'No terminals open. Open an agent from the <b>Agents</b> tab, or click <b>+ Shell</b>.';
    $('#terminalGrid').appendChild(d);
  }
}
function openInAppTerminal({ worktree, agent, title }) {
  switchTab('terminals');
  const empty = $('#termEmpty'); if (empty) empty.remove();
  const id = 'pty' + (++termSeq);
  const label = title || `${agent ? agent + ' · ' : ''}${worktree ? worktree.split(/[\\/]/).pop() : 'shell'}`;
  const pane = document.createElement('div');
  pane.className = 'term-pane';
  pane.innerHTML = `<div class="term-head"><span class="dot ${agent || 'codex'}"></span>
      <span class="name" title="${worktree || ''}">${label}</span>
      <button class="x" title="Close">✕</button></div>
    <div class="term-body"></div>`;
  $('#terminalGrid').appendChild(pane);
  const term = new Terminal({ theme: XTERM_THEME, fontFamily: "'Cascadia Code','Consolas',monospace", fontSize: 13, cursorBlink: true, allowProposedApi: true, scrollback: 5000 });
  const fit = new FitAddon.FitAddon();
  term.loadAddon(fit);
  term.open(pane.querySelector('.term-body'));
  fit.fit();
  term.onData((d) => cc.ptyWrite(id, d));
  term.onResize(({ cols, rows }) => cc.ptyResize(id, cols, rows));
  pane.querySelector('.x').onclick = () => {
    cc.ptyKill(id); term.dispose(); pane.remove(); terms.delete(id);
    if (terms.size === 0) showTermEmpty();
  };
  terms.set(id, { term, fit, pane });
  cc.ptyStart({ id, cwd: worktree, agent, cols: term.cols, rows: term.rows });
  setTimeout(() => { fit.fit(); cc.ptyResize(id, term.cols, term.rows); term.focus(); }, 40);
}

// ---- boot -------------------------------------------------------------------
async function boot() {
  await refreshRepos();
  wireUi();
  cc.onPtyData(({ id, data }) => { const t = terms.get(id); if (t) t.term.write(data); });
  cc.onPtyExit(({ id }) => { const t = terms.get(id); if (t) t.term.write('\r\n\x1b[90m[process exited — close this pane]\x1b[0m\r\n'); });
  window.addEventListener('resize', fitAllTerms);
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
        if (['claude', 'codex', 'gemini'].includes(act)) openInAppTerminal({ worktree: wt.path, agent: act });
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

// ---- logs -------------------------------------------------------------------
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

  // Launch the installed Vibe Kanban desktop app; if not found, let the user locate it.
  const openBoard = async () => {
    const r = await cc.openBoard();
    if (!r || !r.ok) { const p = await cc.pickBoardApp(); if (p) await cc.openBoard(); }
  };
  $('#openBoard').onclick = openBoard;
  $('#openBoard2').onclick = openBoard;
  $('#locateBoard').onclick = async () => { const p = await cc.pickBoardApp(); if (p) await cc.openBoard(); };

  // tabs
  document.querySelectorAll('.tab').forEach((t) => {
    t.onclick = () => {
      switchTab(t.dataset.tab);
      if (t.dataset.tab === 'terminals') setTimeout(fitAllTerms, 0);
    };
  });
  $('#newTermShell').onclick = () => openInAppTerminal({ worktree: state.repo || undefined });

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
  const res = await cc.newAgent({ repo: state.repo, task, agent: state.chosenAgent });
  await refreshAgents();
  if (res && res.worktree) openInAppTerminal({ worktree: res.worktree, agent: state.chosenAgent });
}

boot();
