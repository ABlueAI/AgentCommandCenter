// Command Center — Electron main process.
// This is the "orchestrator": it owns the window and shells out to the real tools
// (git worktrees, VSCode, Windows Terminal, vibe-kanban, the browser). The renderer
// never touches Node directly — everything goes through the IPC handlers below.

const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn, execFile } = require('child_process');

// ---- tunable defaults (marked ? — change to taste) --------------------------
const DEFAULT_PROJECTS_ROOT = 'D:\\Workspace';            // (?) where your git repos live
const SCRIPTS_DIR = path.join(__dirname, '..', 'scripts'); // new-agent.ps1 etc. live one level up in this repo
const AGENT_CMD = { claude: 'claude', codex: 'codex', gemini: 'gemini' }; // CLI launched per agent

// ---- tiny settings store (userData/settings.json) ---------------------------
const settingsPath = () => path.join(app.getPath('userData'), 'settings.json');
function loadSettings() {
  try { return JSON.parse(fs.readFileSync(settingsPath(), 'utf8')); }
  catch { return { projectsRoot: DEFAULT_PROJECTS_ROOT, selectedRepo: '' }; }
}
function saveSettings(s) { fs.writeFileSync(settingsPath(), JSON.stringify(s, null, 2)); }

let win = null;
let boardProc = null; // the running `npx vibe-kanban` child, if any

function createWindow() {
  win = new BrowserWindow({
    width: 1320, height: 860, minWidth: 980, minHeight: 640,
    backgroundColor: '#0b0f14',
    title: 'Command Center',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,   // renderer is sandboxed; only `window.cc` (preload) is exposed
      nodeIntegration: false,
      webviewTag: true,         // needed to embed the vibe-kanban board in-app
    },
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

app.whenReady().then(createWindow);
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
app.on('window-all-closed', () => {
  if (boardProc) { try { boardProc.kill(); } catch {} }
  if (process.platform !== 'darwin') app.quit();
});

// ---- helpers ----------------------------------------------------------------
function git(args, cwd) {
  return new Promise((resolve) => {
    execFile('git', args, { cwd }, (_err, stdout) => resolve((stdout || '').trim()));
  });
}
// Launch a detached external process (Windows Terminal, VSCode, etc.) and don't block.
function launch(cmd, args) { spawn(cmd, args, { detached: true, shell: true }).unref(); }

// Turn a git remote into a browsable https URL.
function remoteToHttps(remote) {
  if (!remote) return '';
  return remote
    .replace(/^git@github\.com:/, 'https://github.com/')
    .replace(/\.git$/, '')
    .trim();
}

// ---- IPC: repos & settings --------------------------------------------------
ipcMain.handle('get-settings', async () => loadSettings());
ipcMain.handle('save-settings', async (_e, partial) => {
  const s = { ...loadSettings(), ...partial };
  saveSettings(s);
  return s;
});
ipcMain.handle('pick-folder', async () => {
  const r = await dialog.showOpenDialog(win, { properties: ['openDirectory'] });
  return r.canceled ? null : r.filePaths[0];
});

// List immediate sub-folders of projectsRoot that are git repos.
ipcMain.handle('list-repos', async () => {
  const s = loadSettings();
  let repos = [];
  try {
    repos = fs.readdirSync(s.projectsRoot, { withFileTypes: true })
      .filter(d => d.isDirectory() && fs.existsSync(path.join(s.projectsRoot, d.name, '.git')))
      .map(d => path.join(s.projectsRoot, d.name));
  } catch { /* projectsRoot missing — return empty */ }
  return { root: s.projectsRoot, repos, selectedRepo: s.selectedRepo };
});

// Parse `git worktree list --porcelain` into [{path, branch}] — these are your live agents.
ipcMain.handle('list-worktrees', async (_e, repo) => {
  if (!repo) return [];
  const out = await git(['worktree', 'list', '--porcelain'], repo);
  const items = [];
  let cur = {};
  for (const line of out.split('\n')) {
    if (line.startsWith('worktree ')) { if (cur.path) items.push(cur); cur = { path: line.slice(9) }; }
    else if (line.startsWith('branch ')) cur.branch = line.slice(7).replace('refs/heads/', '');
    else if (line === 'detached') cur.branch = '(detached)';
  }
  if (cur.path) items.push(cur);
  return items;
});

ipcMain.handle('repo-github-url', async (_e, repo) => remoteToHttps(await git(['remote', 'get-url', 'origin'], repo)));

// ---- IPC: agents ------------------------------------------------------------
// Create a worktree (via the repo's own new-agent.ps1) and launch the chosen agent in a WT tab.
ipcMain.handle('new-agent', async (_e, { repo, task, agent }) => {
  const script = path.join(SCRIPTS_DIR, 'new-agent.ps1');
  await new Promise((resolve) => {
    execFile('powershell',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script, '-Task', task],
      { cwd: repo }, () => resolve());
  });
  // Worktree path follows the <repo>-<task> sibling convention the scripts use.
  const wt = path.join(path.dirname(repo), `${path.basename(repo)}-${task}`);
  const cmd = AGENT_CMD[agent] || 'claude';
  launch('wt', ['-w', '0', 'nt', '--title', `${agent}:${task}`, '-d', `"${wt}"`, 'powershell', '-NoExit', '-Command', cmd]);
  return { worktree: wt, branch: `agent/${task}` };
});

// Re-open an agent terminal for an existing worktree.
ipcMain.handle('open-agent-terminal', async (_e, { worktree, agent }) => {
  const cmd = AGENT_CMD[agent] || 'powershell';
  launch('wt', ['-w', '0', 'nt', '-d', `"${worktree}"`, 'powershell', '-NoExit', '-Command', cmd]);
});

// Tear down an agent's worktree (branch is preserved by the script).
ipcMain.handle('remove-agent', async (_e, { repo, task }) => {
  const script = path.join(SCRIPTS_DIR, 'remove-agent.ps1');
  await new Promise((resolve) => {
    execFile('powershell',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script, '-Task', task, '-Force'],
      { cwd: repo }, () => resolve());
  });
  return true;
});

// ---- IPC: one-click launchers ----------------------------------------------
ipcMain.handle('open-vscode', async (_e, p) => launch('code', [`"${p}"`]));
ipcMain.handle('open-terminal', async (_e, p) => launch('wt', ['-w', '0', 'nt', '-d', `"${p}"`]));
ipcMain.handle('open-external', async (_e, url) => { if (url) shell.openExternal(url); });

// ---- IPC: vibe-kanban board -------------------------------------------------
// Start the board as a child process and sniff its stdout for the localhost URL,
// then hand that URL to the renderer to load into the embedded <webview>.
// vibe-kanban's hosted CDN died when Bloop shut down (04/2026), so the embedded
// CLI-server board can't be fetched. Instead we launch the installed standalone
// Vibe Kanban desktop app (from its GitHub release). Resolution order: saved path
// -> Start Menu shortcut -> common install dirs.
function findBoardApp() {
  const s = loadSettings();
  if (s.boardAppPath && fs.existsSync(s.boardAppPath)) return s.boardAppPath;
  const lnk = path.join(process.env.APPDATA || '', 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Vibe Kanban.lnk');
  if (fs.existsSync(lnk)) return lnk; // shell.openPath resolves the .lnk for us
  const guesses = [
    path.join(process.env.LOCALAPPDATA || '', 'Vibe Kanban', 'vibe-kanban-tauri.exe'),
    'C:\\Program Files\\Vibe Kanban\\vibe-kanban-tauri.exe',
  ];
  return guesses.find((p) => fs.existsSync(p)) || null;
}
ipcMain.handle('open-board', async () => {
  const target = findBoardApp();
  if (!target) return { ok: false };
  const err = await shell.openPath(target); // returns '' on success
  return { ok: !err, error: err };
});
ipcMain.handle('pick-board-app', async () => {
  const r = await dialog.showOpenDialog(win, {
    properties: ['openFile'],
    filters: [{ name: 'Vibe Kanban', extensions: ['exe', 'lnk'] }],
  });
  if (r.canceled) return null;
  saveSettings({ ...loadSettings(), boardAppPath: r.filePaths[0] });
  return r.filePaths[0];
});
