// Command Center — renderer logic. Talks to main only through `window.cc` (preload).
// No Node here by design; this file is pure UI + IPC calls.

const $ = (sel) => document.querySelector(sel);
const state = { repo: '', githubUrl: '', worktrees: [], chosenRole: 'builder', chosenCli: 'claude', hardTask: false, theme: 'obsidian' };

// Blue Helm role metadata (UI + flow only — the tools allowlist that ENFORCES read-only
// lives in agent-roles/*.md / ~/.claude/agents). Keep colors in sync with styles.css and
// the build spec. needsWorktree=false roles run against an existing checkout or repo root.
const ROLES = {
  builder:          { label: 'Builder',        glyph: '🔨', cli: 'claude', readOnly: false, needsWorktree: true,  newAgent: true },
  reviewer:         { label: 'Reviewer',       glyph: '🔎', cli: 'claude', readOnly: true,  needsWorktree: false, newAgent: false },
  'codebase-scout': { label: 'Codebase Scout', glyph: '🧭', cli: 'claude', readOnly: true,  needsWorktree: false, newAgent: false },
  'web-scout':      { label: 'Web Scout',       glyph: '🌐', cli: 'claude', readOnly: false, needsWorktree: false, newAgent: true },
  operator:         { label: 'Operator',        glyph: '📣', cli: 'claude', readOnly: false, needsWorktree: false, newAgent: true },
};

// ---- in-app terminals (xterm.js front-end; real ConPTY lives in main) -------
const terms = new Map(); // id -> { term, fit, pane }
let termSeq = 0;
const THEMES_XTERM = {
  obsidian:  { background: '#06090d', foreground: '#c8d2dc', cursor: '#20c5b7', selectionBackground: 'rgba(32,197,183,.35)' },
  void:      { background: '#070510', foreground: '#d6cdf0', cursor: '#a78bfa', selectionBackground: 'rgba(167,139,250,.35)' },
  dracula:   { background: '#21222c', foreground: '#f8f8f2', cursor: '#bd93f9', selectionBackground: 'rgba(189,147,249,.35)' },
  nord:      { background: '#272c36', foreground: '#e5e9f0', cursor: '#88c0d0', selectionBackground: 'rgba(136,192,208,.35)' },
  synthwave: { background: '#191223', foreground: '#f3e9ff', cursor: '#ff7edb', selectionBackground: 'rgba(255,126,219,.35)' },
};
// Shared ANSI palette so agent output stays readable across all themes.
const ANSI = { black: '#0b0f14', red: '#e0556b', green: '#3ad29f', yellow: '#d9b54a', blue: '#38bdf8', magenta: '#8b7cf6', cyan: '#20c5b7', white: '#c8d2dc', brightBlack: '#6b7785', brightWhite: '#e6edf3' };
function xtermTheme() { return { ...ANSI, ...(THEMES_XTERM[state.theme] || THEMES_XTERM.obsidian) }; }
function applyTheme(name) {
  if (!THEMES_XTERM[name]) name = 'obsidian';
  state.theme = name;
  document.documentElement.setAttribute('data-theme', name);
  const sel = $('#themeSelect'); if (sel) sel.value = name;
  const t = xtermTheme();
  for (const x of terms.values()) { x.term.options.theme = t; } // re-theme live terminals
  cc.saveSettings({ theme: name });
}
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
function openInAppTerminal(opts = {}) {
  const { worktree, title } = opts;
  const cli = opts.cli || opts.agent || null;
  const role = (opts.role && ROLES[opts.role]) ? opts.role : null;
  switchTab('terminals');
  const empty = $('#termEmpty'); if (empty) empty.remove();
  const id = 'pty' + (++termSeq);
  const wtName = worktree ? worktree.split(/[\\/]/).pop() : 'shell';
  const label = title || (role ? `${ROLES[role].label} · ${wtName}` : `${cli ? cli + ' · ' : ''}${wtName}`);
  // Role badge (tinted + lock for read-only) replaces the plain CLI dot when a role is set.
  const badge = role
    ? `<span class="role-badge" data-role="${role}">${ROLES[role].glyph}${ROLES[role].readOnly ? ' 🔒' : ''} ${ROLES[role].label}</span>`
    : `<span class="dot ${cli || 'codex'}"></span>`;
  const pane = document.createElement('div');
  pane.className = 'term-pane';
  pane.innerHTML = `<div class="term-head">${badge}
      <span class="name" title="${worktree || ''}">${label}</span>
      <button class="x" title="Close">✕</button></div>
    <div class="term-body"></div>`;
  $('#terminalGrid').appendChild(pane);
  const term = new Terminal({ theme: xtermTheme(), fontFamily: "'Cascadia Code','Consolas',monospace", fontSize: 13, cursorBlink: true, allowProposedApi: true, scrollback: 5000 });
  const fit = new FitAddon.FitAddon();
  term.loadAddon(fit);
  term.open(pane.querySelector('.term-body'));
  fit.fit();
  term.onData((d) => cc.ptyWrite(id, d));
  term.onResize(({ cols, rows }) => cc.ptyResize(id, cols, rows));
  // Clipboard: Ctrl+Shift+V paste, Ctrl+Shift+C copy, right-click = copy-selection-else-paste.
  // Plain Ctrl+C / Ctrl+V are left untouched so Ctrl+C still sends SIGINT to the agent.
  term.attachCustomKeyEventHandler((e) => {
    if (e.type !== 'keydown' || !e.ctrlKey || !e.shiftKey) return true;
    const k = e.key.toLowerCase();
    if (k === 'v') { const t = cc.clipboardRead(); if (t) term.paste(t); return false; }
    if (k === 'c') { const s = term.getSelection(); if (s) { cc.clipboardWrite(s); return false; } }
    return true;
  });
  pane.querySelector('.term-body').addEventListener('contextmenu', (e) => {
    e.preventDefault();
    const s = term.getSelection();
    if (s) { cc.clipboardWrite(s); term.clearSelection(); }
    else { const t = cc.clipboardRead(); if (t) term.paste(t); }
  });
  pane.querySelector('.x').onclick = () => {
    cc.ptyKill(id); term.dispose(); pane.remove(); terms.delete(id);
    if (terms.size === 0) showTermEmpty();
  };
  terms.set(id, { term, fit, pane });
  cc.ptyStart({ id, cwd: worktree, cli, role, model: opts.model, effort: opts.effort, cols: term.cols, rows: term.rows });
  setTimeout(() => { fit.fit(); cc.ptyResize(id, term.cols, term.rows); term.focus(); }, 40);
}

// ---- boot -------------------------------------------------------------------
async function boot() {
  const s = await cc.getSettings();
  applyTheme((s && s.theme) || 'obsidian');
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
        <button class="ghost" data-act="review" title="Read-only Opus review of this branch">🔎 Review</button>
        <button class="ghost" data-act="scout" title="Read-only codebase exploration">🧭 Scout</button>
      </div>
      <div class="row">
        <button class="action" data-act="code">VSCode</button>
        <button class="action" data-act="term">Terminal</button>
        <button class="ghost" data-act="rm">Remove</button>
      </div>`;
    card.querySelectorAll('[data-act]').forEach((b) => {
      b.onclick = () => {
        const act = b.dataset.act;
        if (['claude', 'codex', 'gemini'].includes(act)) openInAppTerminal({ worktree: wt.path, cli: act });
        // read-only roles operate on the existing checkout — no new worktree
        else if (act === 'review') openInAppTerminal({ worktree: wt.path, role: 'reviewer', cli: 'claude' });
        else if (act === 'scout') openInAppTerminal({ worktree: wt.path, role: 'codebase-scout', cli: 'claude' });
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
  $('#themeSelect').onchange = (e) => applyTheme(e.target.value);
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
  // Role picker: switches behavior + reveals builder/plain sub-options.
  document.querySelectorAll('.role-choices .choice').forEach((c) => {
    c.onclick = () => {
      document.querySelectorAll('.role-choices .choice').forEach((x) => x.classList.remove('active'));
      c.classList.add('active');
      state.chosenRole = c.dataset.role;
      const ro = !!(ROLES[state.chosenRole] && ROLES[state.chosenRole].readOnly);
      $('#builderOpts').classList.toggle('hidden', state.chosenRole !== 'builder');
      $('#cliRow').classList.toggle('hidden', state.chosenRole !== 'plain');
      $('#targetRow').classList.toggle('hidden', !ro);
      updateModalHint();
    };
  });
  // CLI sub-picker (only relevant for the Plain role).
  document.querySelectorAll('.cli-choice').forEach((c) => {
    c.onclick = () => {
      document.querySelectorAll('.cli-choice').forEach((x) => x.classList.remove('active'));
      c.classList.add('active');
      state.chosenCli = c.dataset.cli;
      updateModalHint();
    };
  });
  $('#hardTask').onchange = (e) => { state.hardTask = e.target.checked; };
}

// Reflect what the modal will actually launch.
function updateModalHint() {
  const hint = $('#modalHint');
  if (!hint) return;
  const role = state.chosenRole;
  if (role === 'plain') {
    hint.innerHTML = `Creates a git worktree on <code>agent/&lt;task&gt;</code> and launches <code>${state.chosenCli}</code>.`;
  } else if (ROLES[role].readOnly) {
    hint.innerHTML = `Read-only — launches <code>claude --agent ${role}</code> against the target checkout (no worktree, no edits).`;
  } else if (ROLES[role].needsWorktree) {
    hint.innerHTML = `Creates a git worktree on <code>agent/&lt;task&gt;</code> and launches <code>claude --agent ${role}</code>.`;
  } else {
    hint.innerHTML = `No worktree — launches <code>claude --agent ${role}</code> in the repo root (writes to <code>/outputs</code>).`;
  }
}

// Fill the read-only-role target dropdown: the main checkout + every live agent worktree.
function populateTargets() {
  const sel = $('#targetSelect');
  if (!sel) return;
  sel.innerHTML = '';
  const add = (val, text) => { const o = document.createElement('option'); o.value = val; o.textContent = text; sel.appendChild(o); };
  if (state.repo) add(state.repo, state.repo.split(/[\\/]/).pop() + ' (main checkout)');
  for (const wt of state.worktrees) add(wt.path, wt.branch || taskOf(wt));
}

function openModal() {
  if (!state.repo) { alert('Pick a repo first (set your projects root with 📁).'); return; }
  $('#taskName').value = '';
  // reset to Builder default
  state.chosenRole = 'builder'; state.hardTask = false;
  $('#hardTask').checked = false;
  document.querySelectorAll('.role-choices .choice').forEach((x) => x.classList.toggle('active', x.dataset.role === 'builder'));
  populateTargets();
  $('#builderOpts').classList.remove('hidden');
  $('#cliRow').classList.add('hidden');
  $('#targetRow').classList.add('hidden');
  updateModalHint();
  $('#modal').classList.remove('hidden');
  $('#taskName').focus();
}
function closeModal() { $('#modal').classList.add('hidden'); }

async function createAgent() {
  const role = state.chosenRole;
  const meta = role !== 'plain' ? ROLES[role] : null;

  // Read-only roles: no worktree, no task needed — point at the chosen target checkout.
  if (meta && meta.readOnly) {
    const target = $('#targetSelect').value || state.repo;
    closeModal();
    appendLog(`\n[agent] ${role} (read-only) on ${target}…\n`);
    openInAppTerminal({ worktree: target, role, cli: 'claude', title: `${meta.label} · ${target.split(/[\\/]/).pop()}` });
    return;
  }

  const task = $('#taskName').value.trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-|-$/g, '');
  if (!task) { $('#taskName').focus(); return; }
  closeModal();

  // Plain: today's behavior — fresh worktree + a bare CLI.
  if (role === 'plain') {
    appendLog(`\n[agent] worktree agent/${task} (plain ${state.chosenCli})…\n`);
    const res = await cc.newAgent({ repo: state.repo, task });
    await refreshAgents();
    if (res && res.worktree) openInAppTerminal({ worktree: res.worktree, cli: state.chosenCli });
    return;
  }

  if (meta.needsWorktree) {
    // Builder: fresh worktree, launched with the role (Opus override when Hard is checked).
    appendLog(`\n[agent] worktree agent/${task} (${role}${state.hardTask ? ', opus/xhigh' : ''})…\n`);
    const res = await cc.newAgent({ repo: state.repo, task });
    await refreshAgents();
    const model = state.hardTask ? 'opus' : undefined;
    const effort = state.hardTask ? 'xhigh' : undefined;
    if (res && res.worktree) openInAppTerminal({ worktree: res.worktree, role, cli: 'claude', model, effort, title: `${meta.label} · ${task}` });
  } else {
    // Web-Scout / Operator: no worktree — they write to /outputs, run in the repo root.
    appendLog(`\n[agent] ${role} in repo root (${task})…\n`);
    openInAppTerminal({ worktree: state.repo, role, cli: 'claude', title: `${meta.label} · ${task}` });
  }
}

boot();
