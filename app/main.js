// Command Center — Electron main process.
// This is the "orchestrator": it owns the window and shells out to the real tools
// (git worktrees, VSCode, Windows Terminal, vibe-kanban, the browser). The renderer
// never touches Node directly — everything goes through the IPC handlers below.

const { app, BrowserWindow, ipcMain, shell, dialog, session, safeStorage } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');
const fs = require('fs');
const { spawn, execFile } = require('child_process');
const pty = require('@lydell/node-pty'); // prebuilt ConPTY — powers in-app terminals
// Video-scout's Gemini model/media-resolution options are untrusted IPC input, same posture as
// every other renderer-supplied field. The allowlists + arg-building logic live in this small,
// dependency-free, unit-tested module (see app/video-scout-args.test.js) so they don't have to be
// re-verified by hand every time this file changes.
const { buildVideoScoutArgs } = require('./video-scout-args');
// Untrusted IPC `task` names flow into a filesystem path and a git branch name; validate them here
// (the enforcement boundary) before any fs/git/spawn call. See app/task-name.js / finding #4.
const { validateTask } = require('./task-name');
// Navigation-lockdown decisions (deny window.open / off-app navigation) and the shell-free launcher
// arg builders. Both dependency-free + unit-tested (nav-guard.test.js / launchers.test.js).
const { decideWindowOpen, decideNavigation, refusalLine } = require('./nav-guard');
const { openVscodeSpec, openTerminalSpec } = require('./launchers');

// ---- tunable defaults (marked ? — change to taste) --------------------------
const DEFAULT_PROJECTS_ROOT = 'D:\\Workspace';            // (?) where your git repos live
const SCRIPTS_DIR = path.join(__dirname, '..', 'scripts'); // new-agent.ps1 etc. live one level up in this repo
const AGENT_CMD = { claude: 'claude', codex: 'codex', gemini: 'gemini' }; // CLI launched per agent

// Blue Helm roles: launch `claude --agent <role>` with optional per-task overrides.
// Everything is validated against allowlists before it is spliced into a shell command,
// so the renderer can never inject arbitrary text through the IPC channel.
const VALID_ROLES = new Set(['builder', 'reviewer', 'codebase-scout', 'web-scout', 'operator', 'source-scout']);
// Roles whose PTY cwd must resolve inside the ensure-output-dir sandbox before spawning.
// Matches the roles that carry a PreToolUse path-fence hook.
const FENCED_ROLES = new Set(['web-scout', 'operator', 'source-scout']);
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
// Mutex for ~/.claude.json read-modify-write. Concurrent sandbox launches are Blue Helm's
// normal mode; without serialization each call reads a stale snapshot and the last writer
// wins, silently dropping earlier trust entries. A Promise chain is the idiomatic Node.js
// mutex: each holder resolves the chain on exit (even on error), so it never deadlocks.
let claudeJsonLock = Promise.resolve();

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
  const entryPath = path.join(__dirname, 'renderer', 'index.html');
  win.loadFile(entryPath);

  // --- Navigation lockdown (AUDIT #3 / electronegativity LIMIT_NAVIGATION HIGH) -----------------
  // The renderer holds the preload bridge (window.cc), so a stray anchor, an injected navigation, a
  // middle-click, or a window.open must never repoint this window or spawn an uncontrolled child
  // window. Deny new windows (forwarding http(s) to the OS browser), and allow navigation ONLY back
  // to our own entry document. Pure decisions live in nav-guard.js. This is the app's only
  // BrowserWindow (the board is a separately-launched desktop app, not a webview here).
  const ENTRY_URL = pathToFileURL(entryPath).toString();
  // Surface every denial through the same main-error -> renderer channel the launcher %-path refusal
  // uses (refuse-visibly rule): a blocked navigation/popup must never be a silent no-op. refusalLine
  // strips control chars + truncates the (attacker-influenced) URL so this can't become a log sink.
  const sendRefusal = (line) => { if (win && !win.isDestroyed()) win.webContents.send('main-error', line); };
  win.webContents.setWindowOpenHandler(({ url }) => {
    const d = decideWindowOpen(url);
    if (d.externalUrl) shell.openExternal(d.externalUrl);
    sendRefusal(refusalLine('window.open', url, !!d.externalUrl));
    return { action: d.action };
  });
  const guardNav = (label) => (e, url) => {
    const d = decideNavigation(url, ENTRY_URL);
    if (!d.allow) {
      e.preventDefault();
      if (d.externalUrl) shell.openExternal(d.externalUrl);
      sendRefusal(refusalLine(label, url, !!d.externalUrl));
    }
  };
  win.webContents.on('will-navigate', guardNav('will-navigate'));
  win.webContents.on('will-redirect', guardNav('will-redirect'));
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
// Launch a detached external process (Windows Terminal, VSCode, etc.) and don't block. shell:false
// (AUDIT #7): callers build argv via launchers.js so the git-derived directory path is a discrete
// argument no shell ever parses. See launchers.js for the code.cmd-via-cmd.exe detail on Windows.
function launch(cmd, args) { spawn(cmd, args, { detached: true }).unref(); }

// ---- launch-pipeline timing diagnostics (remove once root cause confirmed) --
let _t0 = null;
function tlog(msg) {
  if (_t0 === null) _t0 = Date.now();
  const elapsed = Date.now() - _t0;
  const line = `[TIMING +${elapsed}ms] ${msg}`;
  console.log(line);
  if (win && !win.isDestroyed()) win.webContents.send('main-error', line);
}
// Call at the start of each createAgent attempt to reset the clock.
function tlogReset() { _t0 = Date.now(); tlog('--- new createAgent sequence ---'); }

// Resolve the real (symlink-free) path. Walks up to the nearest existing ancestor when the
// target doesn't exist yet — mirrors scripts/hooks/fence-write.js so the main-process cwd
// guard and the hook use identical resolution logic and cannot be diverged by path tricks.
function realOrNearest(p) {
  try { return fs.realpathSync.native(p); }
  catch {
    const parent = path.dirname(p);
    if (parent === p) return p; // filesystem root — nothing left to resolve
    return path.join(realOrNearest(parent), path.basename(p));
  }
}

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
ipcMain.handle('tlog-reset', () => { tlogReset(); });

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
  tlog('list-worktrees: git worktree list START');
  const out = await git(['worktree', 'list', '--porcelain'], repo);
  tlog('list-worktrees: git worktree list END');
  const items = [];
  let cur = {};
  for (const line of out.split('\n')) {
    if (line.startsWith('worktree ')) { if (cur.path) items.push(cur); cur = { path: line.slice(9) }; }
    else if (line.startsWith('branch ')) cur.branch = line.slice(7).replace('refs/heads/', '');
    else if (line === 'detached') cur.branch = '(detached)';
  }
  if (cur.path) items.push(cur);
  tlog(`list-worktrees: returning ${items.length} items`);
  return items;
});

ipcMain.handle('repo-github-url', async (_e, repo) => remoteToHttps(await git(['remote', 'get-url', 'origin'], repo)));

// ---- IPC: agents ------------------------------------------------------------
// Create a worktree (via the repo's own new-agent.ps1) and launch the chosen agent in a WT tab.
ipcMain.handle('new-agent', async (_e, { repo, task }) => {
  // Refuse a malformed task BEFORE building any path or spawning powershell (finding #4). A
  // bypassed renderer can send anything; never silently sanitize — surface the reason and stop.
  const taskCheck = validateTask(task);
  if (!taskCheck.ok) {
    tlog(`new-agent: REFUSED invalid task: ${taskCheck.error}`);
    if (win && !win.isDestroyed()) win.webContents.send('main-error', `New agent refused: ${taskCheck.error}`);
    return { ok: false, error: taskCheck.error };
  }
  tlog(`new-agent: START task="${task}"`);
  const script = path.join(SCRIPTS_DIR, 'new-agent.ps1');
  // Worktree path follows the <repo>-<task> sibling convention the scripts use.
  const wt = path.join(path.dirname(repo), `${path.basename(repo)}-${task}`);
  const branch = `agent/${task}`;
  tlog('new-agent: execFile powershell new-agent.ps1 START');
  const out = await new Promise((resolve) => {
    execFile('powershell',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script, '-Task', task],
      { cwd: repo }, (err, stdout, stderr) => resolve({ err, stdout, stderr }));
  });
  tlog('new-agent: execFile powershell new-agent.ps1 END');
  // Don't claim success unless the folder really exists — otherwise the renderer would try
  // to launch a PTY into a missing dir (Windows error 267) and crash the app.
  if (!fs.existsSync(wt)) {
    const error = ((out.stderr || (out.err && out.err.message) || 'worktree was not created') + '').trim();
    tlog(`new-agent: FAIL worktree missing: ${error}`);
    return { ok: false, error, worktree: wt, branch };
  }
  tlog('new-agent: END ok');
  return { ok: true, worktree: wt, branch };
});

// Tear down an agent's worktree (branch is preserved by the script).
ipcMain.handle('remove-agent', async (_e, { repo, task }) => {
  // Re-validate here INDEPENDENTLY of new-agent — not redundant paranoia. new-agent validates a
  // name the user is typing right now; this path validates a name read back out of PERSISTENT,
  // possibly-hostile state: `task` is taskOf(wt), derived from a worktree folder/branch that may
  // have been planted BEFORE this validation existed (an older build, manual git, or a pre-fix
  // bypassed renderer). A create-time gate cannot retroactively sanitize what is already on disk,
  // and the name then flows into a filesystem path + `git worktree remove --force`
  // (remove-agent.ps1), so it must be re-checked here, at the layer that actually runs git.
  // (finding #4). Do NOT "simplify" this by trusting the create gate — they guard different inputs.
  const taskCheck = validateTask(task);
  if (!taskCheck.ok) {
    // Actionable refusal: a refusal that only says "failed" strands the user with a worktree the
    // app now won't remove. Name the offending worktree via JSON.stringify so control chars /
    // newlines in an attacker-influenced name are escaped to a single inert line (no spoofing of
    // the Logs tab). Deliberately do NOT echo a reconstructed `<repo>-<task>` path: it is built
    // from the bad name, so it would be both misleading (likely not the real path) and itself
    // attacker-influenced — point at the trusted manual recovery instead.
    const safeName = JSON.stringify(String(task));
    const msg = `Cannot remove worktree ${safeName}: its name has characters this app won't run git on. ` +
      `Remove it manually from a terminal in the repo — "git worktree list" to find its path, then ` +
      `"git worktree remove <path>".`;
    tlog(`remove-agent: REFUSED invalid task: ${taskCheck.error}`);
    if (win && !win.isDestroyed()) win.webContents.send('main-error', msg);
    return { ok: false, error: msg };
  }
  const script = path.join(SCRIPTS_DIR, 'remove-agent.ps1');
  await new Promise((resolve) => {
    execFile('powershell',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script, '-Task', task, '-Force'],
      { cwd: repo }, () => resolve());
  });
  return { ok: true };  // normalized contract: { ok, error? } — matches new-agent / the refusal above (L3)
});

// Create a dedicated, fenced outputs sandbox for a research role (web-scout/operator) so it
// runs OUTSIDE any repo. The role launches with cwd = this dir, and its PreToolUse write-fence
// confines writes to here — it cannot touch a repo even though it has the Write tool.
ipcMain.handle('ensure-output-dir', async (_e, { role }) => {
  tlog(`ensure-output-dir: START role="${role}"`);
  const safeRole = String(role || 'output').replace(/[^a-z0-9-]/gi, '') || 'output';
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const dir = path.join(loadSettings().projectsRoot, '.command-center', 'outputs', `${safeRole}-${stamp}`);
  try { fs.mkdirSync(dir, { recursive: true }); }
  catch (e) { return { ok: false, error: String((e && e.message) || e) }; }
  tlog('ensure-output-dir: mkdirSync done');

  // Pre-trust this sandbox in ~/.claude.json so Claude Code's workspace-trust prompt never
  // fires. Trust state is keyed by exact path — there is no wildcard config — so we must
  // write the entry before the PTY spawns (Claude Code reads it at session start).
  //
  // BEST-EFFORT: a failure here (permissions, disk full, corrupt JSON) must NOT block the
  // sandbox launch. The worst outcome is a one-time trust dialog in the agent pane — the
  // outer catch swallows and continues; the return { ok: true, dir } below is unconditional.
  //
  // CONCURRENCY: Blue Helm's normal mode is parallel sandbox launches. Without serialization,
  // concurrent calls each read a stale snapshot and the last writer silently wins, dropping
  // earlier trust entries. The claudeJsonLock Promise chain serializes all read-modify-write
  // cycles. Acquiring the lock is synchronous (no await before the assignment), so two calls
  // that arrive in the same event-loop turn correctly queue rather than race.
  //
  // ATOMICITY on disk: each cycle writes to a unique temp file (pid + random), then renames.
  // On Windows, rename onto an existing file fails instead of replacing; unique names prevent
  // two concurrent renames from colliding even if the lock is somehow bypassed.
  const claudeJsonPath = path.join(process.env.USERPROFILE || app.getPath('home'), '.claude.json');
  let release;
  const prev = claudeJsonLock;
  claudeJsonLock = new Promise(res => { release = res; }); // synchronous — no interleaving
  try {
    await prev; // wait for any concurrent cycle to finish
    tlog(`ensure-output-dir: acquired .claude.json lock, reading (${fs.existsSync(claudeJsonPath) ? fs.statSync(claudeJsonPath).size + 'B' : 'missing'})`);
    // Re-read inside the lock so we always start from the freshest content,
    // not a snapshot taken before a sibling call's write landed.
    let claudeData = {};
    if (fs.existsSync(claudeJsonPath)) {
      claudeData = JSON.parse(fs.readFileSync(claudeJsonPath, 'utf8'));
    }
    if (!claudeData.projects) claudeData.projects = {};
    const projectKey = dir.replace(/\\/g, '/'); // Claude Code stores paths with forward slashes
    claudeData.projects[projectKey] = {
      allowedTools: [],
      mcpContextUris: [],
      mcpServers: {},
      enabledMcpjsonServers: [],
      disabledMcpjsonServers: [],
      hasTrustDialogAccepted: true,
      projectOnboardingSeenCount: 0,
      hasClaudeMdExternalIncludesApproved: false,
      hasClaudeMdExternalIncludesWarningShown: false,
      hasUnseenTeamArtifacts: false,
    };
    const tmp = `${claudeJsonPath}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(claudeData, null, 2), 'utf8');
    fs.renameSync(tmp, claudeJsonPath);
    tlog('ensure-output-dir: .claude.json write+rename done');
  } catch (e) {
    tlog(`ensure-output-dir: .claude.json write FAILED (best-effort, launch continues): ${(e && e.message) || e}`);
    console.warn('[ensure-output-dir] could not pre-trust sandbox in .claude.json:', (e && e.message) || e);
  } finally {
    release(); // always release — a throw must never deadlock the chain
  }
  tlog('ensure-output-dir: END ok');
  return { ok: true, dir };
});

// FAIL-CLOSED fence check. The path-fence that confines web-scout/operator lives in the
// *deployed* role file (~/.claude/agents/<role>.md) and points at a hook script that must
// exist. If sync-roles.ps1 was never run, the fence silently doesn't apply — and a false
// sense of containment is worse than none. So before launching a fenced role we verify the
// fence is really installed AND actually gates Read (not just Write/Edit — Blue Helm
// checklist P1), and refuse to launch if either is missing (renderer shows the reason).
ipcMain.handle('verify-fence', async (_e, { role }) => {
  tlog(`verify-fence: START role="${role}"`);
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
  tlog('verify-fence: END ok');
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
ipcMain.handle('open-vscode', async (_e, p) => {
  const s = openVscodeSpec(p);
  if (s.error) { if (win && !win.isDestroyed()) win.webContents.send('main-error', s.error); return; }
  launch(s.cmd, s.args);
});
ipcMain.handle('open-terminal', async (_e, p) => { const s = openTerminalSpec(p); launch(s.cmd, s.args); });
// Only ever hand http(s) URLs to the OS — never file:, vbscript:, etc. from terminal output.
ipcMain.handle('open-external', async (_e, url) => {
  if (typeof url === 'string' && /^https?:\/\//i.test(url)) shell.openExternal(url);
});

// ---- IPC: in-app terminals (node-pty + xterm.js) ---------------------------
// Each renderer terminal pane gets a real ConPTY here: PowerShell spawned in the
// worktree, optionally running the chosen agent CLI, with bytes streamed both ways.
// This is what makes agents run *inside* the Command Center window.
ipcMain.handle('pty-start', (_e, opts) => {
  tlog(`pty-start: START id=${opts.id} role=${opts.role || 'none'} cwd=${opts.cwd || '(unset)'}`);
  const { id, cols, rows } = opts;

  // Hard gate: fenced roles (web-scout, operator, source-scout) must run inside the
  // ensure-output-dir sandbox. Enforce here rather than relying on renderer discipline —
  // same "tool-enforced-not-convention" principle the hook itself is built on. Uses the
  // same realpath + case-fold logic as fence-write.js so both layers agree on what "inside"
  // means and can't be split by a symlink or a Unicode/case path trick.
  if (!opts.videoScout && opts.role && FENCED_ROLES.has(opts.role)) {
    const fenceRefuse = (msg) => {
      tlog(msg);
      if (win && !win.isDestroyed()) win.webContents.send('main-error', msg);
      return { ok: false, error: msg };
    };
    const declaredCwd = opts.cwd;
    if (!declaredCwd || !fs.existsSync(declaredCwd)) {
      return fenceRefuse(
        `Fenced role "${opts.role}" refused: cwd "${declaredCwd || '(unset)'}" does not exist. ` +
        `Call ensure-output-dir and pass its result as cwd before spawning.`
      );
    }
    const outputsRoot = path.join(loadSettings().projectsRoot, '.command-center', 'outputs');
    const fold = (p) => (process.platform === 'win32' ? p.toLowerCase() : p);
    const resolvedRoot = realOrNearest(outputsRoot);
    const resolvedCwd  = realOrNearest(declaredCwd);
    const within = fold(resolvedCwd) === fold(resolvedRoot) ||
                   fold(resolvedCwd).startsWith(fold(resolvedRoot) + path.sep);
    if (!within) {
      return fenceRefuse(
        `Fenced role "${opts.role}" refused: cwd "${resolvedCwd}" is outside the outputs sandbox ` +
        `("${resolvedRoot}"). Call ensure-output-dir and pass its result as cwd before spawning.`
      );
    }
    tlog(`pty-start: fenced-role cwd check PASSED (${resolvedCwd} ⊆ ${resolvedRoot})`);
  }

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
    // Gemini model / media-resolution / analysis mode / time range: validate against the
    // allowlists in video-scout-args.js. videoModel and mediaResolution push only what passes —
    // an invalid or missing value there is omitted so feed-gemini.ps1's own default applies. An
    // EXPLICIT invalid analysisMode is NOT omitted-to-default: it REFUSES the launch (see
    // video-scout-args.js) rather than silently falling through to the costliest full-video pass.
    // Log the POST-VALIDATION outcome for every field (sent / omitted / rejected) so the Logs tab
    // never implies a choice was honored when it was silently dropped.
    const { args: geminiArgs, notes: geminiNotes, error: geminiError } = buildVideoScoutArgs(opts);
    for (const note of geminiNotes) tlog(`pty-start: video-scout ${note}`);
    // A user-requested time range, or an explicit invalid analysisMode, that fails validation
    // REFUSES the launch (visible error) rather than silently downgrading to a whole-video run.
    // Same refusal pattern as the two checks above; enforced here in main so a bypassed/modified
    // renderer can't skip it. See video-scout-args.js.
    if (geminiError) {
      if (win && !win.isDestroyed()) win.webContents.send('main-error', `Video Scout launch refused: ${geminiError}`);
      return { ok: false, error: geminiError };
    }
    args.push(...geminiArgs);
  } else {
    const run = buildAgentCommand(opts); // role / bare CLI / undefined => plain shell
    if (run) args.push('-Command', run);
  }
  // CLAUDE_CODE_SUBPROCESS_ENV_SCRUB=1 tells Claude Code not to forward the parent
  // environment into subprocesses it spawns itself: Bash tool calls, PreToolUse/PostToolUse
  // hook commands, and MCP servers all inherit the PTY env by default. Without this flag, a
  // Bash step inside any agent can read every secret in process.env (e.g. a GEMINI_API_KEY
  // left in HKCU:\Environment via setx). Set on every PTY — harmless for non-Claude panes,
  // essential for agent panes. Defined here, in pty-start; also documented in CLAUDE.md.
  //
  // Video-scout PTYs additionally receive GEMINI_API_KEY from safeStorage (decrypted in
  // main memory, never written to disk) so feed-gemini.ps1 can reach the Gemini API.
  // IMPORTANT: if GEMINI_API_KEY was previously persisted via `setx`, it is still present
  // in process.env and leaks into every PTY via the spread below. Remove it from the Windows
  // user environment manually (see CLAUDE.md). That removal is a pre-req for full per-role
  // env filtering (Blue Helm checklist item 2).
  const ptyEnv = {
    ...process.env,
    CLAUDE_CODE_SUBPROCESS_ENV_SCRUB: '1',  // scrub credentials from Claude Code's own subprocesses
    ...(opts.videoScout ? { GEMINI_API_KEY: geminiKey } : {}),
  };
  let p;
  tlog(`pty-start: env built — CLAUDE_CODE_SUBPROCESS_ENV_SCRUB=1, GEMINI_API_KEY ${opts.videoScout ? 'injected (video-scout)' : 'not added by app (check for setx residue)'}`);
  tlog(`pty-start: pty.spawn START cwd=${cwd}`);
  try {
    p = pty.spawn('powershell.exe', args, {
      name: 'xterm-256color',
      cols: cols || 80, rows: rows || 24,
      cwd,
      env: ptyEnv,
    });
  } catch (e) {
    tlog(`pty-start: pty.spawn FAILED: ${e.message}`);
    if (win && !win.isDestroyed()) win.webContents.send('pty-exit', { id });
    return { ok: false, error: String((e && e.message) || e) };
  }
  tlog('pty-start: pty.spawn END ok');
  ptys.set(id, p);
  p.onData((data) => { if (win && !win.isDestroyed()) win.webContents.send('pty-data', { id, data }); });
  p.onExit(() => { ptys.delete(id); if (win && !win.isDestroyed()) win.webContents.send('pty-exit', { id }); });
  return { ok: true };
});
ipcMain.on('pty-write', (_e, { id, data }) => { const p = ptys.get(id); if (p) p.write(data); });
ipcMain.on('pty-resize', (_e, { id, cols, rows }) => { const p = ptys.get(id); if (p) { try { p.resize(cols, rows); } catch (err) { tlog(`pty-resize ${id} failed (process likely exiting): ${(err && err.message) || err}`); } } });
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
