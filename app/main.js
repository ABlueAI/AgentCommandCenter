// Command Center — Electron main process.
// This is the "orchestrator": it owns the window and shells out to the real tools
// (git worktrees, VSCode, Windows Terminal, vibe-kanban, the browser). The renderer
// never touches Node directly — everything goes through the IPC handlers below.

const { app, BrowserWindow, ipcMain, shell, dialog, session, safeStorage, clipboard } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');
const fs = require('fs');
const { spawn, execFile, execFileSync } = require('child_process');
const pty = require('@lydell/node-pty'); // prebuilt ConPTY — powers in-app terminals
// Video-scout's Gemini model/media-resolution options are untrusted IPC input, same posture as
// every other renderer-supplied field. The allowlists + arg-building logic live in this small,
// dependency-free, unit-tested module (see app/video-scout-args.test.js) so they don't have to be
// re-verified by hand every time this file changes.
const { buildVideoScoutArgs } = require('./video-scout-args');
// V5b1: MAIN-issued video-scout run identity. main generates the run ID (never the renderer, never
// from a path, never parsed from terminal output), passes it to feed-gemini.ps1 as -RunId, and keeps
// a pane->runId registry so a finished pane can open its report in V5b2. See app/video-scout-run-id.js.
const { generateRunId, createRunIdRegistry } = require('./video-scout-run-id');
// Untrusted IPC `task` names flow into a filesystem path and a git branch name; validate them here
// (the enforcement boundary) before any fs/git/spawn call. See app/task-name.js / finding #4.
const { validateTask } = require('./task-name');
// Navigation-lockdown decisions (deny window.open / off-app navigation) and the shell-free launcher
// arg builders. Both dependency-free + unit-tested (nav-guard.test.js / launchers.test.js).
const { decideWindowOpen, decideNavigation, refusalLine } = require('./nav-guard');
// P12 launcher hardening: shell-free launcher arg builders + deterministic Code.exe / wt.exe
// resolution (no cmd.exe intermediary), and the main-owned directory AUTHORIZER (a launcher may open
// only the current repo root or one of its live git worktrees). Both dependency-free + unit-tested
// (launchers.test.js / launcher-authz.test.js); the byte-invariance of the fenced-role gate + the
// whole pty-start handler is asserted by launcher-fence-invariant.test.js.
const { resolveVscodeExe, resolveTerminalExe } = require('./launchers');
const { createLauncherAuthorizer } = require('./launcher-authz');
// The launcher IPC boundary: gate -> authorize -> resolve exe -> shell-free spawn. Pure + unit-tested
// (launcher-ipc.test.js); an untrusted sender or unauthorized dir spawns zero children.
const { createLauncherIpc } = require('./launcher-ipc');
// The one canonical fail-closed sender/frame/URL trust gate (shared with clipboard/library/followup).
// P12 adds the two launcher handlers as callers so they, too, refuse any non-trusted-window sender.
const { createTrustedSenderGate } = require('./trusted-ipc-sender');
// EXPERIMENT A (PROTOTYPE, Claude only) — docs/OSS-PROCUREMENT-pane-status.md,
// "BLUE SUBSYSTEM VERDICT: PROTOTYPE". Requiring this module is inert: with the gate env var unset,
// createPaneStatusPrototype() returns an object whose every method is a no-op, so no pipe, token, IPC
// channel, badge, or PTY environment change exists. See prototype-pane-status/pane-status-prototype.js.
const {
  createPaneStatusPrototype,
  isPrototypeEnabled: paneStatusPrototypeGateOn,
  RENDERER_ARG: PANE_STATUS_RENDERER_ARG,
} = require('./prototype-pane-status/pane-status-prototype');
// Revision 2: discovers the Claude version FROM THE EXECUTABLE THIS FILE LAUNCHES. Revision 1 shipped
// no discovery at all, so every badge resolved to `unknown/version-mismatch` in the real application.
const { createClaudeVersionResolver } = require('./prototype-pane-status/pane-status-version');
// K8 media-permission boundary: both session permission handlers come from this pure,
// dependency-free, unit-tested module (media-permission-policy.test.js). A grant requires
// the trusted window's main frame + the exact entry document + audio-only proof; every
// other permission, requester, or media shape is denied fail-closed with a visible,
// bounded refusal (reason constant only — never a URL, transcript, or device label).
const { createMediaPermissionHandlers } = require('./media-permission-policy');
// V1a clipboard security boundary: the OS clipboard is reachable only through main
// (the sandboxed preload's `clipboard` is undefined). This pure, unit-tested module
// (clipboard-ipc.test.js) validates every request comes from the trusted window's main
// frame at the exact entry document, enforces a 1,000,000-char hard limit both ways,
// accepts only strings, and never logs clipboard content — same posture as K8.
const { createClipboardIpcHandlers } = require('./clipboard-ipc');
// V5b2 Library/report read boundary: the renderer lists/reads only bounded, schema-valid Video Scout
// records/reports selected through MAIN-OWNED identities (opaque handles / pane IDs) — never a path or
// actionable run ID. PowerShell (video-scout-library.ps1) is the sole manifest validator and the only
// code that touches the filesystem; this pure, unit-tested module (library-ipc.test.js) owns the trust
// gate, the opaque-handle table, and the path-free projection. Same posture as K8 / the clipboard.
const { createLibraryIpc } = require('./library-ipc');
// V3b stored-report follow-up: one explicit user submission asks one bounded question about an
// already-persisted, main-validated report. followup-ipc.js owns the trust/cost boundary (sender
// gate, discriminated library-handle/pane-ID identity, PS-backed re-read, 200k context cap, global
// single-flight); followup-child.js owns the provider child (process.execPath + child-only
// ELECTRON_RUN_AS_NODE=1, allowlisted env, stdin-only content transport, bounded stdout/stderr,
// hard timeout). Both are pure, unit-tested modules; the key never leaves main except into the
// child's own environment. This path is NOT a PTY launch and lives entirely outside the fenced-role
// cwd gate below (which is byte-for-byte unchanged).
const { createFollowupIpc } = require('./followup-ipc');
const { createFollowupChildRunner } = require('./followup-child');
// The main-owned Dockview layout trust boundary. Saved layout state is a file on disk and therefore
// untrusted input, and dockview's own fromJSON does no validation, so this module owns the fixed
// userData path, the reparse/size/UTF-8 guards, and the strict allowlist validator. Requiring it has
// no effect in classic recovery mode: the IPC handlers below are not registered there, and the
// renderer cannot reach a layout operation the preload never exposed.
const { createLayoutStore } = require('./dockview-layout-store');

// ---- Layout engine selection (MAIN decides; the renderer can never change it) -------------------
// Blue's ADOPT verdict makes Dockview the PRODUCTION pane-layout engine, so `npm start` — no flag —
// gets Dockview. The former hand-built grid survives as a bounded EMERGENCY RECOVERY surface behind
// an explicit opt-out flag, not as a second production layout.
//
// The polarity is deliberately inverted from the prototype branch. There the flag turned Dockview
// ON and its absence was the safe default; here the flag turns Dockview OFF. That means the DEFAULT
// path is now the one that must be proven: `dockview-app-integration.test.js` proves it in a real
// Electron renderer running the real app, and `dockview-default-path.test.js` pins the code shape
// (including this polarity) that keeps it true.
//
// This is a main-process decision read once, at startup, from this process's own argv. It is not a
// setting, not an env var, and not anything the renderer can influence: a renderer query string, a
// hash, a saved setting, or an injected script cannot change main's argv.
const CLASSIC_LAYOUT_FLAG = '--classic-layout';
// The token forwarded into the renderer/preload process argv. It is a DIFFERENT string from the
// launch flag so that the renderer's copy can never be confused with (or used to re-derive) the
// main-process launch decision — the preload only ever reports what main already decided.
const CLASSIC_LAYOUT_RENDERER_ARG = '--cc-classic-layout';
const classicLayoutEnabled = process.argv.includes(CLASSIC_LAYOUT_FLAG);
// Dockview is the production engine: everything Dockview-related is gated on this, and it is true
// unless the operator explicitly asked for recovery mode.
const dockviewLayoutEnabled = !classicLayoutEnabled;
// EXPERIMENT A (PROTOTYPE) gate, read ONCE here because the window is constructed before the
// prototype object is, and the preload's shape has to be decided at construction time. Same posture
// as `classicLayoutEnabled`: main decides, the renderer is told, and renderer script cannot forge a
// process argument to flip it.
const paneStatusPrototypeEnabled = paneStatusPrototypeGateOn(process.env);

// ---- tunable defaults (marked ? — change to taste) --------------------------
const DEFAULT_PROJECTS_ROOT = 'D:\\Workspace';            // (?) where your git repos live
const SCRIPTS_DIR = path.join(__dirname, '..', 'scripts'); // new-agent.ps1 etc. live one level up in this repo
// V5b2: the ONE main-owned Video Scout run root. The renderer never supplies or modifies it. Reused
// as feed-gemini.ps1's -OutDir (below), the Library listing root, and the report-resolution root, so
// the launch path and the read path can never point at different directories. This is exactly
// feed-gemini.ps1's own default OutDir — now passed explicitly so main is the single owner.
const VIDEO_SCOUT_RUN_ROOT = 'D:\\Gemini_Video_Review\\downloads';
const LIBRARY_SCRIPT = path.join(SCRIPTS_DIR, 'video-scout-library.ps1');
const LIBRARY_TIMEOUT_MS = 30000;              // fixed timeout: a hung enumeration/read is killed
const LIBRARY_MAX_BUFFER = 32 * 1024 * 1024;   // bounded stdout/stderr (a 4 MiB report + JSON overhead fits)

// Run the V5b2 library PowerShell boundary shell-free (execFile) and parse its JSON-only stdout.
// -RunRoot is the fixed main-owned root; -RunId (Read only) is a main-issued identity. The script
// always prints one JSON document even on internal error, so a parse failure is the only "reject".
function runLibraryAction({ action, runId }) {
  return new Promise((resolve, reject) => {
    const args = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', LIBRARY_SCRIPT,
      '-Action', action, '-RunRoot', VIDEO_SCOUT_RUN_ROOT];
    if (action === 'Read') args.push('-RunId', String(runId == null ? '' : runId));
    execFile('powershell', args,
      { timeout: LIBRARY_TIMEOUT_MS, maxBuffer: LIBRARY_MAX_BUFFER, windowsHide: true, encoding: 'buffer' },
      (_err, stdout) => {
        const text = Buffer.isBuffer(stdout) ? stdout.toString('utf8') : String(stdout || '');
        let parsed = null;
        try { parsed = JSON.parse(text); } catch { parsed = null; }
        if (parsed && typeof parsed === 'object') return resolve(parsed);
        return reject(new Error('library: no JSON on stdout'));
      });
  });
}
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
// Canonical trusted entry document — the ONE definition shared by win.loadFile(), the
// navigation lockdown, and the media-permission policy, so the three trust anchors can
// never drift apart (independently reconstructed path/origin strings are how they would).
const ENTRY_PATH = path.join(__dirname, 'renderer', 'index.html');
const ENTRY_URL = pathToFileURL(ENTRY_PATH).toString();
const ptys = new Map(); // terminal id -> pty process (in-app terminals)
// EXPERIMENT A prototype handle. Assigned once the window exists; until then, and whenever the gate
// env var is unset, it is the inert object (see createInertPrototype) so every call site below is
// safe without a null check or a flag test.
let paneStatus = { enabled: false, envForPane: () => ({}), releasePane: () => false, stop: () => false };
// V5b1: pane id -> main-issued video-scout run ID. Deliberately SEPARATE from `ptys`: it must
// SURVIVE the PTY's exit (so the finished pane can still open its report in V5b2) and is removed only
// when the pane is explicitly closed (pty-kill) or the window shuts down (window-all-closed).
const videoScoutRunIds = createRunIdRegistry();
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
      // Forwards MAIN's already-made layout decision into the preload's process.argv.
      // additionalArguments is set at window construction by the main process, so renderer script
      // cannot add, remove, or forge it. Empty array = production Dockview; the token is present
      // ONLY when the operator launched recovery mode.
      //
      // EXPERIMENT A (PROTOTYPE) adds a SECOND independent token, present only when the prototype
      // gate is on. The preload uses it to decide whether the pane-status bridge exists at all —
      // with the gate off there is no preload method, no renderer subscription and no badge global,
      // rather than an inert one. The two tokens are separate strings and neither can be derived
      // from the other.
      additionalArguments: [
        ...(classicLayoutEnabled ? [CLASSIC_LAYOUT_RENDERER_ARG] : []),
        ...(paneStatusPrototypeEnabled ? [PANE_STATUS_RENDERER_ARG] : []),
      ],
    },
  });
  win.loadFile(ENTRY_PATH);

  // --- Navigation lockdown (AUDIT #3 / electronegativity LIMIT_NAVIGATION HIGH) -----------------
  // The renderer holds the preload bridge (window.cc), so a stray anchor, an injected navigation, a
  // middle-click, or a window.open must never repoint this window or spawn an uncontrolled child
  // window. Deny new windows (forwarding http(s) to the OS browser), and allow navigation ONLY back
  // to our own entry document (the module-level ENTRY_URL). Pure decisions live in nav-guard.js.
  // This is the app's only BrowserWindow (the board is a separately-launched desktop app, not a
  // webview here).
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
  // K8 media-permission hardening: grant ONLY a microphone-only request ('media' with
  // mediaTypes exactly ['audio']) coming from this window's main frame at the exact
  // entry document with the trusted file: origin — the in-app Whisper dictation path.
  // Camera, mixed audio/video, foreign documents, subframes, and every other permission
  // class are denied fail-closed with a bounded visible refusal. Handlers are installed
  // before the window exists, so the policy late-binds it via getTrustedWindow.
  // (console.error keeps refusals visible even before the renderer's Logs listener is
  // attached — the earliest automatic Chromium media checks fire during page load.)
  const mediaPermission = createMediaPermissionHandlers({
    entryUrl: ENTRY_URL,
    getTrustedWindow: () => win,
    logRefusal: (line) => {
      console.error(line);
      if (win && !win.isDestroyed()) win.webContents.send('main-error', line);
    },
  });
  session.defaultSession.setPermissionRequestHandler(mediaPermission.handlePermissionRequest);
  session.defaultSession.setPermissionCheckHandler(mediaPermission.handlePermissionCheck);

  // V1a clipboard boundary: bind the same trust anchors K8 uses (canonical ENTRY_URL +
  // the late-bound trusted window) and register the two bounded IPC handlers. Refusals
  // are visible (console + Logs channel) and carry a reason constant only — never
  // clipboard content.
  const clipboardIpc = createClipboardIpcHandlers({
    entryUrl: ENTRY_URL,
    clipboard,
    getTrustedWindow: () => win,
    logRefusal: (line) => {
      console.error(line);
      if (win && !win.isDestroyed()) win.webContents.send('main-error', line);
    },
  });
  ipcMain.handle('clipboard-read', (e) => clipboardIpc.handleClipboardRead(e));
  ipcMain.handle('clipboard-write', (e, payload) => clipboardIpc.handleClipboardWrite(e, payload));

  // EXPERIMENT A — PROTOTYPE, Claude only, one pane. docs/OSS-PROCUREMENT-pane-status.md,
  // "BLUE SUBSYSTEM VERDICT: PROTOTYPE". Bounded prototype work only; production implementation,
  // Experiment B, and app-server runtime testing remain unauthorized.
  //
  // With BLUE_HELM_PANE_STATUS_PROTOTYPE unset this is the INERT object: nothing is listened on,
  // nothing is minted, and `envForPane()` returns {} for every pane forever. The send() below is
  // one-way main -> renderer and carries only { paneId, state, reason, prototype } — there is no
  // renderer-callable handler here at all, so this adds no new attack surface to the IPC boundary.
  paneStatus = createPaneStatusPrototype({
    env: process.env,
    path,
    appDir: __dirname,
    log: (line) => tlog(line),
    send: (channel, payload) => { if (win && !win.isDestroyed()) win.webContents.send(channel, payload); },
  });
  if (paneStatus.enabled) {
    const started = paneStatus.start();
    if (!started.ok) {
      const msg = `[pane-status] PROTOTYPE listener failed to start (${started.error || started.reason}) — panes will show "unknown".`;
      console.error(msg);
      if (win && !win.isDestroyed()) win.webContents.send('main-error', msg);
    }
    // REVISION 2 — the defect that made revision 1 unreachable in the real app. Discover the Claude
    // version FROM THE SAME EXECUTABLE a pane launches: `AGENT_CMD.claude` resolved by PowerShell
    // with the PTY's own environment, never a guessed path and never another installation's package
    // metadata. Asynchronous, because it costs a PowerShell profile load and must not delay startup;
    // the store reads the version at view time, so a later answer governs every subsequent event,
    // heartbeat tick and renderer update, and any pane that already enrolled is refreshed.
    //
    // FAIL-CLOSED: a resolution failure, an erroring version command, an unparsable string or a
    // timeout all leave the version null, which keeps every badge at `unknown` with a visible
    // reason. It never assumes compatibility.
    createClaudeVersionResolver({
      execFile: require('child_process').execFile,
      env: process.env,
      commandName: AGENT_CMD.claude,
      log: (line) => tlog(line),
    }).discover().then((found) => {
      const supported = paneStatus.setObservedVersion(found.ok ? found.version : null);
      if (!found.ok) {
        const msg = `[pane-status] PROTOTYPE could not establish the Claude version (${found.reason}) — panes stay "unknown".`;
        console.error(msg);
        if (win && !win.isDestroyed()) win.webContents.send('main-error', msg);
        return;
      }
      if (!supported) {
        // Not an error — the honest, designed outcome. The badge says `unknown` and explains why.
        const msg = `[pane-status] PROTOTYPE: Claude ${found.version} at ${found.source} is not a version this prototype was exercised against — panes stay "unknown" (version-mismatch).`;
        console.error(msg);
        if (win && !win.isDestroyed()) win.webContents.send('main-error', msg);
      }
    }).catch(() => {
      // Revision 3, Low finding 4. `discover()` is built never to reject, but the handler ABOVE can
      // still throw — e.g. `win.webContents.send` racing window teardown between the isDestroyed()
      // check and the send. Without this, that becomes an unhandled rejection: a silent failure, and
      // this repo requires the opposite. The message is a fixed constant: no path, no environment
      // value, no command output, no token, and deliberately not the caught error's own text.
      const msg = '[pane-status] PROTOTYPE version discovery handler failed — panes stay "unknown".';
      console.error(msg);
      if (win && !win.isDestroyed()) win.webContents.send('main-error', msg);
    });
  }

  // V5b2 Library/report read boundary — same trust anchors (canonical ENTRY_URL + the late-bound
  // trusted window). List/Read run the PowerShell library boundary shell-free; Open Report resolves a
  // Video Scout pane through V5b1's internal pane->runId registry (the renderer sends only the pane
  // ID). Refusals are visible (console + Logs) and carry a reason constant only — never a path or
  // manifest/report content.
  const libraryIpc = createLibraryIpc({
    entryUrl: ENTRY_URL,
    getTrustedWindow: () => win,
    runLibraryAction,
    getRunIdForPane: (paneId) => videoScoutRunIds.get(paneId),
    logRefusal: (line) => {
      console.error(line);
      if (win && !win.isDestroyed()) win.webContents.send('main-error', line);
    },
  });
  ipcMain.handle('library-list', (e) => libraryIpc.handleList(e));
  ipcMain.handle('library-read', (e, handle) => libraryIpc.handleRead(e, handle));
  ipcMain.handle('library-open-report', (e, paneId) => libraryIpc.handleOpenReport(e, paneId));

  // V3b stored-report follow-up boundary — same trust anchors, same identity routes (CURRENT
  // library handle via libraryIpc.resolveHandle — lifetime unchanged — or pane ID via the V5b1
  // registry), report re-read through the same PowerShell Read authority, and the bounded
  // text-only Gemini child. Logs carry bounded metadata/constants only.
  const followupChild = createFollowupChildRunner({
    scriptPath: path.join(SCRIPTS_DIR, 'gemini-followup.js'),
    getKey: () => geminiKey,             // decrypted in main memory (safeStorage); child env only
  });
  const followupIpc = createFollowupIpc({
    entryUrl: ENTRY_URL,
    getTrustedWindow: () => win,
    resolveLibraryHandle: (handle) => libraryIpc.resolveHandle(handle),
    getRunIdForPane: (paneId) => videoScoutRunIds.get(paneId),
    readReport: (runId) => runLibraryAction({ action: 'Read', runId }),
    runFollowupChild: (payload) => followupChild.run(payload),
    hasGeminiKey: () => geminiKey !== null,
    logUsage: (line) => {
      console.log(line);
      if (win && !win.isDestroyed()) win.webContents.send('main-error', line);
    },
    logRefusal: (line) => {
      console.error(line);
      if (win && !win.isDestroyed()) win.webContents.send('main-error', line);
    },
  });
  ipcMain.handle('library-followup', (e, req) => followupIpc.handleAsk(e, req));

  // ---- Dockview layout boundary --------------------------------------------------------------
  // Registered ONLY when Dockview is the active layout engine — i.e. always, EXCEPT in classic
  // recovery mode. Under `--classic-layout` these three channels do not exist at all, so an invoke
  // from anywhere rejects with "no handler registered": recovery mode cannot read, write, or delete
  // layout state even if renderer code tried, which is the strongest available form of the work
  // order's "classic must not register layout IPC".
  //
  // Trust anchors are the same ones the clipboard / library / follow-up boundaries use (canonical
  // ENTRY_URL + the late-bound trusted window), so this surface is no weaker than the existing ones.
  // The renderer supplies NO path, ever: the store derives one fixed file from Electron userData.
  // Refusals carry a bounded reason constant only — never layout contents.
  if (dockviewLayoutEnabled) {
    const dockviewGate = createTrustedSenderGate({ entryUrl: ENTRY_URL, getTrustedWindow: () => win });
    const dockviewStore = createLayoutStore({ userDataDir: app.getPath('userData') });
    const refuseDockview = (channel, reason) => {
      const line = `[dockview-layout] ${channel} REFUSED: ${reason}`;
      console.error(line);
      if (win && !win.isDestroyed()) win.webContents.send('main-error', line);
      return { ok: false, reason };
    };

    ipcMain.handle('dockview-layout-save', (e, layout) => {
      const gate = dockviewGate.assess(e);
      if (!gate.ok) return refuseDockview('dockview-layout-save', gate.reason);
      // The store validates BEFORE writing, so an invalid layout is never persisted.
      const result = dockviewStore.save(layout);
      if (!result.ok) return refuseDockview('dockview-layout-save', result.reason);
      return { ok: true, savedAt: result.savedAt };
    });

    ipcMain.handle('dockview-layout-load', (e) => {
      const gate = dockviewGate.assess(e);
      if (!gate.ok) return refuseDockview('dockview-layout-load', gate.reason);
      // Validated after reading and before returning over IPC. An invalid file is left on disk
      // untouched for diagnosis; the renderer gets a bounded reason code and changes nothing.
      const result = dockviewStore.load();
      if (!result.ok) return refuseDockview('dockview-layout-load', result.reason);
      // The WHOLE envelope crosses, not just its layout. Phase C validates again in the renderer
      // immediately before `fromJSON`, using the same shared policy, and validating the envelope
      // there checks the schema version, package identity and timestamp too — which unwrapping here
      // would silently discard.
      return { ok: true, envelope: result.envelope };
    });

    ipcMain.handle('dockview-layout-reset', (e) => {
      const gate = dockviewGate.assess(e);
      if (!gate.ok) return refuseDockview('dockview-layout-reset', gate.reason);
      // Clear Saved Arrangement. Deletes ONLY this store's own file; touches no live pane and no
      // other file. `existed` lets the renderer distinguish "deleted it" from the equally
      // successful "there was nothing to delete".
      const result = dockviewStore.reset();
      if (!result.ok) return refuseDockview('dockview-layout-reset', result.reason);
      return { ok: true, existed: result.existed === true };
    });

    console.log('[dockview-layout] layout IPC registered (production layout engine: dockview 7.0.4).');
  } else {
    // Recovery mode is a deliberate, visible operator choice, never a silent fallback. Saying so in
    // main's log means a support transcript shows which layout engine actually ran.
    console.log('[classic-layout] CLASSIC RECOVERY MODE — Dockview disabled, layout IPC NOT registered.');
  }

  createWindow();
});
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
app.on('window-all-closed', () => {
  for (const p of ptys.values()) { try { p.kill(); } catch {} }
  ptys.clear();
  videoScoutRunIds.clear(); // window shutdown: the run-ID mapping is process-lifetime only
  if (process.platform !== 'darwin') app.quit();
});

// ---- helpers ----------------------------------------------------------------
function git(args, cwd) {
  return new Promise((resolve) => {
    execFile('git', args, { cwd }, (_err, stdout) => resolve((stdout || '').trim()));
  });
}
// Launch a detached external process (Windows Terminal, VS Code) and don't block. shell:false is
// EXPLICIT and load-bearing (P12): callers resolve a real executable (Code.exe / wt.exe) and pass the
// directory as a discrete argv element, so no shell — cmd.exe or sh — ever parses the path. An `error`
// event (e.g. the executable could not be spawned / ENOENT) is surfaced to the caller's onError so a
// missing VS Code or Windows Terminal becomes a visible refusal instead of an unhandled rejection.
function launch(cmd, args, onError) {
  let child;
  try {
    child = spawn(cmd, args, { detached: true, shell: false, windowsHide: false });
  } catch (e) {
    if (typeof onError === 'function') onError(e);
    return;
  }
  child.on('error', (err) => { if (typeof onError === 'function') onError(err); });
  child.unref();
}

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
// P12: the MAIN-owned set of directories the one-click launchers may open — every git repository under
// the configured projectsRoot (the exact `list-repos` rule) plus each of that repo's live git
// worktrees (the exact `list-worktrees` source). Re-derived from the filesystem + git on EVERY launch;
// the renderer's string is only membership-tested against it (launcher-authz.js), never trusted. Any
// enumeration failure degrades to a smaller/empty set, so the launch refuses rather than opens.
function listLauncherAuthorizedDirs() {
  const dirs = [];
  let root;
  try { root = loadSettings().projectsRoot; } catch { root = null; }
  if (!root) return dirs;
  let repos = [];
  try {
    repos = fs.readdirSync(root, { withFileTypes: true })
      .filter((d) => d.isDirectory() && fs.existsSync(path.join(root, d.name, '.git')))
      .map((d) => path.join(root, d.name));
  } catch { return dirs; }
  for (const repo of repos) {
    dirs.push(repo); // the repo root itself (also git's first worktree entry — kept if git fails)
    let out = '';
    try {
      out = execFileSync('git', ['-C', repo, 'worktree', 'list', '--porcelain'],
        { encoding: 'utf8', timeout: 10000, windowsHide: true, maxBuffer: 4 * 1024 * 1024 }) || '';
    } catch { out = ''; }
    for (const line of out.split('\n')) {
      if (line.startsWith('worktree ')) { const wp = line.slice(9).trim(); if (wp) dirs.push(wp); }
    }
  }
  return dirs;
}

// Both launchers pass the SAME two gates before spawning anything: (1) the shared trusted-sender gate
// (only the real Blue Helm window's main frame at the exact entry document), and (2) the launcher-authz
// directory authorizer (the path must canonicalize to a main-owned repo/worktree real directory). A
// failure of EITHER refuses VISIBLY (Logs tab) and spawns NOTHING. The executable is then resolved
// deterministically from main-owned env (never a renderer path) and spawned shell:false.
const launcherGate = createTrustedSenderGate({ entryUrl: ENTRY_URL, getTrustedWindow: () => win });
const launcherAuthorizer = createLauncherAuthorizer({
  realpath: (p) => fs.realpathSync.native(p),
  isDirectory: (p) => fs.statSync(p).isDirectory(),
  listAuthorizedDirs: listLauncherAuthorizedDirs,
});
const launcherIpc = createLauncherIpc({
  assessSender: (e) => launcherGate.assess(e),
  authorize: (p) => launcherAuthorizer.authorize(p),
  resolveVscode: () => resolveVscodeExe({ env: process.env, exists: fs.existsSync }),
  resolveTerminal: () => resolveTerminalExe({ env: process.env, exists: fs.existsSync }),
  launch,
  // Bounded visible refusal on the same main-error channel the nav/%-path refusals use — reason
  // CONSTANT only, never the offending path.
  logRefusal: (line) => { tlog(line); if (win && !win.isDestroyed()) win.webContents.send('main-error', line); },
});
ipcMain.handle('open-vscode', async (e, p) => launcherIpc.handleOpenVscode(e, p));
ipcMain.handle('open-terminal', async (e, p) => launcherIpc.handleOpenTerminal(e, p));
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
  // V5b1: the main-issued run ID for this pane, if it is a video-scout launch. Registered only after
  // a successful spawn (below), so a refused/failed launch leaves no mapping.
  let acceptedRunId = null;

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
    // V5b1: MAIN issues the run ID here (from the clock, this process's PID, and crypto randomness)
    // and passes it as a discrete -RunId argument. The renderer never generates, supplies, or
    // derives it, and it is never parsed from terminal output. PowerShell re-validates it before any
    // filesystem use. It is stored in the pane->runId registry below but is NOT returned to the
    // renderer (pty-start still returns only { ok }).
    const runId = generateRunId();
    acceptedRunId = runId;
    // -OutDir is the fixed main-owned run root (V5b2). It equals feed-gemini.ps1's own default, so the
    // launch behavior is unchanged — but passing it explicitly makes main the single owner of the
    // directory the Library later lists and reads from, so launch and read can never diverge.
    args.push('-File', script, '-Url', url, '-VideoScout', '-RunId', runId, '-OutDir', VIDEO_SCOUT_RUN_ROOT);
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
  // EXPERIMENT A (PROTOTYPE): {} for every pane unless the gate env var is set AND this is the single
  // enrolled Claude pane. The scrub above is NOT weakened — it stays exactly as it was, and if it
  // prevents the hook reporter from inheriting these two variables the experiment is blocked and
  // reported as blocked rather than worked around. The token exists only here and in main's memory:
  // never in argv, a log line, a file, the renderer, or a persistent environment variable.
  const paneStatusEnv = paneStatus.envForPane(opts);
  const ptyEnv = {
    ...process.env,
    CLAUDE_CODE_SUBPROCESS_ENV_SCRUB: '1',  // scrub credentials from Claude Code's own subprocesses
    ...(opts.videoScout ? { GEMINI_API_KEY: geminiKey } : {}),
    ...paneStatusEnv,
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
    // EXPERIMENT A: `envForPane` above ENROLLED this pane and minted its token before the spawn was
    // attempted. No process exists to report status, so main must hand the single Experiment A slot
    // back here — where it was taken — rather than relying on renderer cleanup. Revision 1 leaked the
    // slot on this path: under Dockview the renderer's close path happened to release it, but in
    // CLASSIC layout a failed start only logs, so the slot stayed bound to a pane with no process and
    // every later Claude pane silently got no status until the app restarted.
    paneStatus.releasePane(id);
    if (win && !win.isDestroyed()) win.webContents.send('pty-exit', { id });
    return { ok: false, error: String((e && e.message) || e) };
  }
  tlog('pty-start: pty.spawn END ok');
  ptys.set(id, p);
  // V5b1: record pane->runId for a video-scout launch. This is stored internally ONLY (never
  // returned to the renderer). It intentionally OUTLIVES p.onExit below -- a finished run's report
  // stays openable until the pane is explicitly closed (pty-kill) or the window shuts down.
  if (acceptedRunId) { videoScoutRunIds.set(id, acceptedRunId); tlog(`pty-start: registered video-scout runId for pane ${id}`); }
  p.onData((data) => { if (win && !win.isDestroyed()) win.webContents.send('pty-data', { id, data }); });
  // NOTE: onExit removes the PTY handle but deliberately does NOT remove the run-ID mapping (V5b1).
  p.onExit(() => { ptys.delete(id); if (win && !win.isDestroyed()) win.webContents.send('pty-exit', { id }); });
  return { ok: true };
});
ipcMain.on('pty-write', (_e, { id, data }) => { const p = ptys.get(id); if (p) p.write(data); });
ipcMain.on('pty-resize', (_e, { id, cols, rows }) => { const p = ptys.get(id); if (p) { try { p.resize(cols, rows); } catch (err) { tlog(`pty-resize ${id} failed (process likely exiting): ${(err && err.message) || err}`); } } });
ipcMain.on('pty-kill', (_e, id) => {
  const p = ptys.get(id); if (p) { try { p.kill(); } catch {} ptys.delete(id); }
  // Explicit pane close: the run's report is no longer reachable from the UI, so drop the mapping.
  videoScoutRunIds.remove(id);
  // EXPERIMENT A: the pane is gone, so its token must die with it. Releasing here (not on pty-exit)
  // matches the run-ID registry's rule — a finished agent's pane still exists until Blue closes it.
  paneStatus.releasePane(id);
});

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
