// Command Center — Electron main process.
// This is the "orchestrator": it owns the window and shells out to the real tools
// (git worktrees, VSCode, Windows Terminal, vibe-kanban, the browser). The renderer
// never touches Node directly — everything goes through the IPC handlers below.

const { app, BrowserWindow, ipcMain, shell, dialog, session, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn, execFile } = require('child_process');
const pty = require('@lydell/node-pty'); // prebuilt ConPTY — powers in-app terminals

// ---- tunable defaults (marked ? — change to taste) --------------------------
const DEFAULT_PROJECTS_ROOT = 'D:\\Workspace';            // (?) where your git repos live
const SCRIPTS_DIR = path.join(__dirname, '..', 'scripts'); // new-agent.ps1 etc. live one level up in this repo
const AGENT_CMD = { claude: 'claude', codex: 'codex', gemini: 'gemini' }; // CLI launched per agent

// Blue Helm roles: launch `claude --agent <role>` with optional per-task overrides.
// Everything is validated against allowlists before it is spliced into a shell command,
// so the renderer can never inject arbitrary text through the IPC channel.
const VALID_ROLES = new Set(['builder', 'reviewer', 'codebase-scout', 'web-scout', 'operator']);
const VALID_MODELS = new Set(['sonnet', 'opus', 'haiku', 'fable']);
const VALID_EFFORTS = new Set(['low', 'medium', 'high', 'xhigh', 'max']);

// Resolve a launch spec to the command run inside the PTY. Three cases:
//   role set    -> `claude --agent <role> [--model x] [--effort y]` (roles are a Claude feature)
//   cli only    -> bare CLI (claude/codex/gemini)
//   neither     -> undefined => plain PowerShell shell
function buildAgentCommand({ cli, agent, role, model, effort, initialPrompt }) {
  if (role && VALID_ROLES.has(role)) {
    // `--agent` is a Claude feature, so roles always launch on the Claude CLI regardless
    // of any cli hint (the Gemini video-scout path injects its brief differently — Phase C).
    let cmd = AGENT_CMD.claude + ' --agent ' + role;
    if (VALID_MODELS.has(model)) cmd += ' --model ' + model;
    if (VALID_EFFORTS.has(effort)) cmd += ' --effort ' + effort;
    // Optional opening prompt (e.g. the reviewer's "review this diff"). Strip shell-significant
    // characters so it stays a single safe quoted argument inside the powershell -Command string.
    if (initialPrompt && typeof initialPrompt === 'string') {
      const clean = initialPrompt.replace(/["`$\r\n]/g, ' ').replace(/\s+/g, ' ').trim();
      if (clean) cmd += ' "' + clean + '"';
    }
    return cmd;
  }
  return AGENT_CMD[cli || agent]; // undefined when unknown/falsy -> plain shell
}

// Video-scout: download a video and analyze it with Gemini (visual + spoken) via feed-gemini.ps1.
// The URL is user-pasted and untrusted. Two defenses: (1) validate hard here, and (2) the caller
// passes it to PowerShell as a discrete `-File` argument (never spliced into a `-Command` string),
// so no shell ever parses it — a crafted URL cannot break out of quoting regardless of this regex.
//
// Beyond "is it a URL", yt-dlp can be steered at internal targets (SSRF-shaped: file://, localhost,
// link-local 169.254 cloud-metadata) or at huge playlists. So we allow only known video hosts and
// reject anything private/local. Extend VIDEO_HOSTS (?) to taste; the download size/playlist caps
// live in feed-gemini.ps1 (--no-playlist / --max-filesize / duration match-filter).
const VIDEO_HOSTS = new Set([                 // (?) hosts the video-scout is allowed to fetch
  'youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be',
  'vimeo.com', 'www.vimeo.com', 'player.vimeo.com',
]);
function validateVideoUrl(url) {
  if (typeof url !== 'string' || url.length > 2048) return null;
  // Cheap belt-and-suspenders: no quotes/$/backtick even though we no longer shell-splice it.
  if (!/^https?:\/\/[^\s"$\x60]+$/.test(url)) return null;
  let u;
  try { u = new URL(url); } catch { return null; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;  // reject file:, etc.
  const host = u.hostname.toLowerCase();
  // Reject obvious internal targets (localhost / private + link-local IPs / GCP metadata).
  if (/^(localhost|127\.|0\.|10\.|192\.168\.|169\.254\.|::1|metadata\.google\.internal)/.test(host)) return null;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return null;
  if (!VIDEO_HOSTS.has(host)) return null;     // allowlist: only known video platforms
  return url;
}

// ---- tiny settings store (userData/settings.json) ---------------------------
const settingsPath = () => path.join(app.getPath('userData'), 'settings.json');
function loadSettings() {
  try { return JSON.parse(fs.readFileSync(settingsPath(), 'utf8')); }
  catch { return { projectsRoot: DEFAULT_PROJECTS_ROOT, selectedRepo: '' }; }
}
function saveSettings(s) { fs.writeFileSync(settingsPath(), JSON.stringify(s, null, 2)); }

// ---- encrypted secrets store (userData/secure.json) -------------------------
// Values are encrypted with the OS credential store (DPAPI on Windows) via Electron's
// safeStorage API — the file contains ciphertext only, never plaintext. The decrypted
// key lives in main-process memory and is injected only into the specific PTY that needs
// it; it never crosses the IPC boundary back to the renderer.
const securePath = () => path.join(app.getPath('userData'), 'secure.json');
function loadSecure() {
  try { return JSON.parse(fs.readFileSync(securePath(), 'utf8')); }
  catch { return {}; }
}
function saveSecure(s) { fs.writeFileSync(securePath(), JSON.stringify(s)); }

let geminiKey = null; // decrypted GEMINI_API_KEY; null = not configured

function loadGeminiKey() {
  if (!safeStorage.isEncryptionAvailable()) return;
  const s = loadSecure();
  if (!s.geminiKeyEnc) return;
  try { geminiKey = safeStorage.decryptString(Buffer.from(s.geminiKeyEnc, 'base64')); }
  catch { /* ciphertext unreadable (different OS user / key rotation) — leave null */ }
}

let win = null;
const ptys = new Map(); // terminal id -> pty process (in-app terminals)

// Keep a single recoverable error (e.g. a ConPTY hiccup in a worker thread) from killing the
// whole app with a fatal dialog. Log it, and surface it in the renderer's Logs tab if we can.
process.on('uncaughtException', (err) => {
  console.error('[main] uncaught exception:', err);
  if (win && !win.isDestroyed()) win.webContents.send('main-error', String((err && err.message) || err));
});

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
    },
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

app.whenReady().then(() => {
  loadGeminiKey(); // decrypt stored GEMINI_API_KEY into memory before any PTY can launch
  // Allow the microphone (for in-app Whisper dictation) and deny every other
  // permission class — the renderer never needs camera, geolocation, etc.
  const allowMedia = (perm) => perm === 'media' || perm === 'audioCapture';
  session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => cb(allowMedia(permission)));
  session.defaultSession.setPermissionCheckHandler((_wc, permission) => allowMedia(permission));
  createWindow();
});
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
app.on('window-all-closed', () => {
  for (const p of ptys.values()) { try { p.kill(); } catch {} }
  ptys.clear();
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

// ---- IPC: Gemini key management (safeStorage) --------------------------------
// The renderer can check whether a key is stored and save a new value, but the
// plaintext never travels back across the IPC boundary — it stays in main memory.
ipcMain.handle('get-gemini-key-status', () => ({
  hasKey: geminiKey !== null,
  available: safeStorage.isEncryptionAvailable(),
}));
ipcMain.handle('set-gemini-key', (_e, key) => {
  if (typeof key !== 'string' || !key.trim()) return { ok: false, error: 'key is empty' };
  if (!safeStorage.isEncryptionAvailable()) return { ok: false, error: 'safeStorage encryption not available on this system' };
  try {
    const enc = safeStorage.encryptString(key.trim());
    const s = loadSecure(); s.geminiKeyEnc = enc.toString('base64'); saveSecure(s);
    geminiKey = key.trim();
    return { ok: true };
  } catch (e) { return { ok: false, error: String((e && e.message) || e) }; }
});
ipcMain.handle('clear-gemini-key', () => {
  const s = loadSecure(); delete s.geminiKeyEnc; saveSecure(s);
  geminiKey = null;
  return { ok: true };
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
ipcMain.handle('new-agent', async (_e, { repo, task }) => {
  const script = path.join(SCRIPTS_DIR, 'new-agent.ps1');
  // Worktree path follows the <repo>-<task> sibling convention the scripts use.
  const wt = path.join(path.dirname(repo), `${path.basename(repo)}-${task}`);
  const branch = `agent/${task}`;
  const out = await new Promise((resolve) => {
    execFile('powershell',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script, '-Task', task],
      { cwd: repo }, (err, stdout, stderr) => resolve({ err, stdout, stderr }));
  });
  // Don't claim success unless the folder really exists — otherwise the renderer would try
  // to launch a PTY into a missing dir (Windows error 267) and crash the app.
  if (!fs.existsSync(wt)) {
    const error = ((out.stderr || (out.err && out.err.message) || 'worktree was not created') + '').trim();
    return { ok: false, error, worktree: wt, branch };
  }
  return { ok: true, worktree: wt, branch };
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

// Create a dedicated, fenced outputs sandbox for a research role (web-scout/operator) so it
// runs OUTSIDE any repo. The role launches with cwd = this dir, and its PreToolUse write-fence
// confines writes to here — it cannot touch a repo even though it has the Write tool.
ipcMain.handle('ensure-output-dir', async (_e, { role }) => {
  const safeRole = String(role || 'output').replace(/[^a-z0-9-]/gi, '') || 'output';
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const dir = path.join(loadSettings().projectsRoot, '.command-center', 'outputs', `${safeRole}-${stamp}`);
  try { fs.mkdirSync(dir, { recursive: true }); }
  catch (e) { return { ok: false, error: String((e && e.message) || e) }; }
  return { ok: true, dir };
});

// FAIL-CLOSED fence check. The path-fence that confines web-scout/operator lives in the
// *deployed* role file (~/.claude/agents/<role>.md) and points at a hook script that must
// exist. If sync-roles.ps1 was never run, the fence silently doesn't apply — and a false
// sense of containment is worse than none. So before launching a fenced role we verify the
// fence is really installed AND actually gates Read (not just Write/Edit — Blue Helm
// checklist P1), and refuse to launch if either is missing (renderer shows the reason).
ipcMain.handle('verify-fence', async (_e, { role }) => {
  if (!VALID_ROLES.has(role)) return { ok: false, error: 'unknown role' };
  const home = process.env.USERPROFILE || app.getPath('home');
  const agentFile = path.join(home, '.claude', 'agents', `${role}.md`);
  const fix = 'Run scripts\\sync-roles.ps1, then relaunch.';
  if (!fs.existsSync(agentFile)) return { ok: false, error: `Role "${role}" is not deployed (${agentFile} missing). ${fix}` };
  let text = '';
  try { text = fs.readFileSync(agentFile, 'utf8'); }
  catch (e) { return { ok: false, error: String((e && e.message) || e) }; }
  if (/__CC_HOOK__/.test(text)) return { ok: false, error: `Role "${role}" still has the unsubstituted __CC_HOOK__ placeholder. ${fix}` };
  // Pull the hook path out of:  command: "node \"<abs path>/fence-write.js\""
  const m = text.match(/command:\s*"node\s+\\"(.+?fence-write\.js)\\"/i);
  if (!/PreToolUse/.test(text) || !m) return { ok: false, error: `Role "${role}" has no PreToolUse path-fence wired in. ${fix}` };
  if (!fs.existsSync(m[1])) return { ok: false, error: `Path-fence hook missing at ${m[1]}. ${fix}` };
  // Confirm the matcher actually includes Read — a write-only matcher (the pre-P1 state)
  // would pass every check above while leaving reads completely unguarded.
  const matcherLine = text.match(/matcher:\s*"([^"]*)"/i);
  if (!matcherLine || !/\bRead\b/.test(matcherLine[1])) {
    return { ok: false, error: `Role "${role}" has a path-fence but its matcher doesn't include Read — reads are unguarded. ${fix}` };
  }
  return { ok: true, hookPath: m[1] };
});

// Build a review diff for a worktree (this branch vs main, including uncommitted work) and
// write it to .agent-review.diff in that worktree so the read-only Reviewer can Read it —
// the Reviewer has no shell, so the launcher produces the diff for it (Blue Helm spec §2).
ipcMain.handle('review-diff', async (_e, { worktree, base }) => {
  base = base || 'main';
  if (!worktree || !fs.existsSync(worktree)) return { ok: false, error: 'worktree not found' };
  const diff = await new Promise((resolve) => {
    execFile('git', ['-C', worktree, 'diff', base], { maxBuffer: 1024 * 1024 * 32 },
      (_err, stdout) => resolve(stdout || ''));
  });
  const fileName = '.agent-review.diff';
  const file = path.join(worktree, fileName);
  if (!diff.trim()) return { ok: true, empty: true, fileName };
  try { fs.writeFileSync(file, diff, 'utf8'); }
  catch (e) { return { ok: false, error: String((e && e.message) || e) }; }
  const files = (diff.match(/^diff --git /gm) || []).length;
  return { ok: true, fileName, files, bytes: diff.length };
});

// ---- IPC: one-click launchers ----------------------------------------------
ipcMain.handle('open-vscode', async (_e, p) => launch('code', [`"${p}"`]));
ipcMain.handle('open-terminal', async (_e, p) => launch('wt', ['-w', '0', 'nt', '-d', `"${p}"`]));
// Only ever hand http(s) URLs to the OS — never file:, vbscript:, etc. from terminal output.
ipcMain.handle('open-external', async (_e, url) => {
  if (typeof url === 'string' && /^https?:\/\//i.test(url)) shell.openExternal(url);
});

// ---- IPC: in-app terminals (node-pty + xterm.js) ---------------------------
// Each renderer terminal pane gets a real ConPTY here: PowerShell spawned in the
// worktree, optionally running the chosen agent CLI, with bytes streamed both ways.
// This is what makes agents run *inside* the Command Center window.
ipcMain.handle('pty-start', (_e, opts) => {
  const { id, cols, rows } = opts;
  // Never spawn into a missing directory: ConPTY throws Windows error 267 (ERROR_DIRECTORY)
  // from a worker thread, which would surface as a fatal uncaught exception.
  const cwd = (opts.cwd && fs.existsSync(opts.cwd)) ? opts.cwd : process.env.USERPROFILE;
  // -ExecutionPolicy Bypass so npm .ps1 shims (claude/codex/gemini) always launch.
  const args = ['-NoLogo', '-ExecutionPolicy', 'Bypass', '-NoExit'];
  if (opts.videoScout) {
    if (!geminiKey) {
      if (win && !win.isDestroyed()) win.webContents.send('main-error',
        'GEMINI_API_KEY not configured — enter it in the key setup banner and save before launching Video Scout.');
      return { ok: false, error: 'GEMINI_API_KEY not configured' };
    }
    const url = validateVideoUrl(opts.videoUrl);
    if (!url) {
      if (win && !win.isDestroyed()) win.webContents.send('main-error',
        'Invalid or disallowed video URL — must be an http(s) link on an allowed video host (YouTube/Vimeo).');
      return { ok: false, error: 'invalid video URL' };
    }
    // Pass the URL via `-File` as a discrete argv element: PowerShell binds it to the script's
    // [string]$Url parameter literally. Nothing user-controlled is ever parsed by a shell.
    const script = path.join(SCRIPTS_DIR, 'feed-gemini.ps1');
    args.push('-File', script, '-Url', url, '-VideoScout');
  } else {
    const run = buildAgentCommand(opts); // role / bare CLI / undefined => plain shell
    if (run) args.push('-Command', run);
  }
  // Video-scout gets GEMINI_API_KEY injected from safeStorage; all other PTYs inherit
  // process.env as-is. The key is never set as an OS env var — safeStorage is the sole
  // source of truth for it after this migration.
  const ptyEnv = opts.videoScout ? { ...process.env, GEMINI_API_KEY: geminiKey } : process.env;
  let p;
  try {
    p = pty.spawn('powershell.exe', args, {
      name: 'xterm-256color',
      cols: cols || 80, rows: rows || 24,
      cwd,
      env: ptyEnv,
    });
  } catch (e) {
    if (win && !win.isDestroyed()) win.webContents.send('pty-exit', { id });
    return { ok: false, error: String((e && e.message) || e) };
  }
  ptys.set(id, p);
  p.onData((data) => { if (win && !win.isDestroyed()) win.webContents.send('pty-data', { id, data }); });
  p.onExit(() => { ptys.delete(id); if (win && !win.isDestroyed()) win.webContents.send('pty-exit', { id }); });
  return { ok: true };
});
ipcMain.on('pty-write', (_e, { id, data }) => { const p = ptys.get(id); if (p) p.write(data); });
ipcMain.on('pty-resize', (_e, { id, cols, rows }) => { const p = ptys.get(id); if (p) { try { p.resize(cols, rows); } catch {} } });
ipcMain.on('pty-kill', (_e, id) => { const p = ptys.get(id); if (p) { try { p.kill(); } catch {} ptys.delete(id); } });

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
