// Command Center — Electron main process.
// This is the "orchestrator": it owns the window and shells out to the real tools
// (git worktrees, VSCode, Windows Terminal, vibe-kanban, the browser). The renderer
// never touches Node directly — everything goes through the IPC handlers below.

const { app, BrowserWindow, ipcMain, shell, dialog, session, safeStorage, clipboard } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');
const fs = require('fs');
const { spawn, execFile, execFileSync } = require('child_process');
const crypto = require('crypto');
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
// PRODUCTION PANE STATUS — docs/OSS-PROCUREMENT-pane-status.md,
// "BLUE SUBSYSTEM VERDICT: BUILD FRESH". Advisory, pane-ID-bound Claude Code lifecycle status with
// reversible setup and removal. Requiring these modules is inert: the controller listens on nothing,
// mints nothing, and changes no PTY environment until startup reconciliation finds a VERIFIED
// installation, which only exists after a human explicitly ran setup from the Terminals toolbar.
//
// PANE STATUS CANNOT AUTHORIZE OR INITIATE A CONSEQUENTIAL ACTION. Nothing under app/pane-status/
// imports an admission module, spawns or controls a process on any provider-event path, or reaches
// approval, merge, push, pane closure, or credentials. See pane-status-isolation.test.js.
const { createPaneStatusController } = require('./pane-status/pane-status-controller');
const { registerPaneStatusIpc, createPublishers } = require('./pane-status/pane-status-ipc');
const paneStatusDoc = require('./pane-status/pane-status-settings-doc');
const paneStatusShim = require('./pane-status/pane-status-runtime-shim');
// The pane-equivalent version resolver (dependency A) and the bounded absolute PowerShell used by the
// natively-confirmed stale-lock liveness check (dependency B). Both are injected into the controller
// below and nowhere else; no provider-event path can reach either.
const paneStatusVersionMod = require('./pane-status/pane-status-version');
const paneStatusLockMod = require('./pane-status/pane-status-lock');
// MAIN-OWNED TURN ADMISSION BUDGET — Blue's turn-accounting OUTCOME B. For a controlled live evidence
// run, main owns a durable per-pane allowance: direct terminal input to the controlled pane is blocked
// here, and a paid prompt reaches the PTY only through the narrow controlled-submission handler, which
// decrements and PERSISTS before it writes. Requiring these modules is inert — with the gate unset,
// parseAdmissionConfig returns the disabled plan and createAdmissionBudget returns an object whose
// every method refuses, so no pane is controlled and `pty-write` behaves exactly as it did before.
// The budget is deliberately independent of the pane-status hook it exists to bound: NO SUPPORTED
// PANE-STATUS MODULE API MUTATES ADMISSION STATE — nothing under app/pane-status/ imports an
// admission module, and no admission method increments, refunds, resets or extends an allowance.
//
// That is a CODE-LEVEL property, not a claim of OS-level inaccessibility. This is an ACCIDENTAL-SPEND
// control over Blue Helm's own input paths, NOT a security boundary against a malicious or compromised
// process running as the same Windows user — such a process can locate, delete, replace or rewrite the
// ledger file directly. Read the threat-boundary header in app/admission-budget.js before relying on
// this for anything.
const admissionConfig = require('./admission-budget-config');
// P1 fenced-role environment containment. The pure builder keeps unfenced panes on the existing
// admission-scrubbed environment expression while constructing fenced role environments only from
// Blue's explicit Tier 1 Windows allowlist. See app/pty-env.test.js.
const { buildPtyEnv } = require('./pty-env');
const { createAdmissionBudget, REASON: ADMISSION_REASON } = require('./admission-budget');
const { createAdmissionLedgerStore } = require('./admission-budget-store');
const { createAdmissionIpc, CHANNEL_SUBMIT: ADMISSION_CHANNEL_SUBMIT } = require('./admission-ipc');
const {
  createAdmissionPtyBoundary,
} = require('./admission-pty-boundary');
const { prepareAdmissionPaneLaunch, closeAfterFailedSpawn } = require('./admission-pane-launch');
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
// Quick Links: a separate pure URL/config policy, fixed userData store, and trusted open-by-ID IPC.
// This boundary intentionally does not reuse or modify the legacy open-external handler below.
const { createQuickLinksStore } = require('./quick-links-store');
const { createQuickLinksIpc } = require('./quick-links-ipc');
const { buildDefaultConfig: buildQuickLinksDefaultConfig } = require('./quick-links-policy');

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
// PRODUCTION PANE STATUS needs no launch-time gate. The prototype had one because its renderer
// surface had to be ABSENT when disabled; the production bridge is exposed unconditionally in the
// trusted window, and "is it set up?" is answered at runtime by the four IPC invokes.
// TURN ADMISSION BUDGET: parsed ONCE, here, from this process's own startup environment — before the
// window exists and before any PTY is spawned. The renderer and the provider process are downstream of
// this line and cannot reach it: renderer script cannot alter this process's environment, and every
// admission key is stripped from each child PTY environment below (see ptyEnv in `pty-start`).
// Complete absence is ordinary mode. Any present-but-invalid admission configuration is a protective
// failure: eligible Claude-pane startup is visibly refused rather than silently becoming ordinary.
const admissionPlan = admissionConfig.parseAdmissionConfig(process.env);
const admissionEnabled = admissionPlan.enabled === true;
// The renderer's controlled-run surface is ABSENT, not inert, when no run is configured — the same
// posture as the Dockview and pane-status tokens above.
const ADMISSION_RENDERER_ARG = '--blue-helm-admission-budget';
// PRE-READY PLACEHOLDER — ALWAYS BUILT FROM A DISABLED PLAN, NEVER FROM `admissionPlan`.
//
// The live budget needs three things that DO NOT EXIST at module-evaluation time: Electron
// `userData` (available only after app readiness), the ledger store built on it, and the
// module-private admitted PTY writer. `createAdmissionBudget` enforces that dependency by THROWING
// when it is handed an enabled plan without storage and a writer.
//
// Passing `admissionPlan` here therefore crashed the main process at `require` time for exactly the
// configuration this control exists to serve — before `app.whenReady()`, before any uncaught-exception
// handler, and before a window could report it. A valid controlled run could never start. The bug was
// invisible to the suite because main.js was only ever READ AS TEXT, never evaluated; see
// admission-main-startup.test.js, which now evaluates this entry under all three configuration shapes.
//
// So the pre-ready object is built from a DISABLED plan unconditionally. It refuses every method with
// `admission-not-initialized`, which is safe in the strongest sense: before readiness there is no
// window, no PTY and no pane, so a refusing object cannot create an admission opportunity — it can
// only deny one. The live, store-backed budget replaces it EXACTLY ONCE inside app readiness below.
//
// `admissionPlan` itself is untouched and still governs the launch policy: absence stays ordinary and
// a malformed REQUEST still refuses eligible Claude startup, because `prepareAdmissionPaneLaunch`
// reads the plan directly and rejects an invalid one before it ever consults this object.
let admissionBudget = createAdmissionBudget({
  plan: admissionConfig.disabledPlan(ADMISSION_REASON.NOT_INITIALIZED),
});
let admissionIpc = null;

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
// The only production PTY write primitive. Its admitted closure holds a module-private capability;
// generic IPC can never manufacture that capability from renderer-controlled data.
const admissionPtyBoundary = createAdmissionPtyBoundary({
  getPty: (paneId) => ptys.get(paneId),
  isDirectInputBlocked: (paneId) => admissionBudget.isDirectInputBlocked(paneId),
  onDirectRefusal: (paneId) => {
    if (admissionIpc) admissionIpc.refuseDirectWrite(paneId);
  },
});
// PRODUCTION pane-status controller handle. Assigned once the window exists; until then it is this
// inert stand-in, so every call site below is safe without a null check or a flag test. `enrollPane`
// returning { ok:false } simply means a pane carries no status environment — never an error, and
// never a reason not to spawn the pane.
let paneStatus = {
  enrollPane: () => ({ ok: false, reason: 'not-ready' }),
  releasePane: () => false,
  notePaneExit: () => false,
  shutdown: () => false,
};

/**
 * The installation's NONSECRET id, generated once and then stable forever.
 *
 * It identifies WHICH Blue Helm installation owns a hook group — it authenticates nothing and never
 * appears on the wire. It is stable because it is baked into the shim PATH that Claude settings point
 * at, so regenerating it would orphan the groups already installed and make this installation look
 * like a different one to its own removal logic.
 *
 * Stored beside the descriptor rather than inside it: the descriptor is deleted on removal, and the
 * identity of this installation must survive an install/remove cycle.
 */
function resolvePaneStatusInstallId(userDataPath) {
  const idPath = path.join(userDataPath, 'pane-status-install-id');
  try {
    const existing = fs.readFileSync(idPath, 'utf8').trim();
    if (paneStatusDoc.INSTALL_ID_PATTERN.test(existing)) return existing;
  } catch { /* first run, or unreadable — fall through and mint one */ }
  const minted = crypto.randomBytes(16).toString('hex');
  try {
    fs.mkdirSync(userDataPath, { recursive: true });
    fs.writeFileSync(idPath, minted + '\n', 'utf8');
  } catch {
    // A machine we cannot write an id to cannot durably own hooks either. Returning the minted value
    // still lets startup reconciliation run and report honestly; setup will fail visibly at the
    // descriptor write rather than silently installing something it can never identify again.
  }
  return minted;
}
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
      // PRODUCTION PANE STATUS adds NO token here. Its bridge is exposed unconditionally in the
      // trusted window, because whether pane status is SET UP is a runtime question its four invokes
      // answer honestly, rather than a question about whether an object exists.
      //
      // The TURN ADMISSION BUDGET adds a THIRD independent token, present only when a controlled run
      // is configured. It carries no run id, no allowance and no pane id — only the fact that a
      // controlled-run surface should exist, so the preload can expose the submit/state pair. Every
      // number still comes from main, over IPC, at read time.
      additionalArguments: [
        ...(classicLayoutEnabled ? [CLASSIC_LAYOUT_RENDERER_ARG] : []),
        ...(admissionEnabled ? [ADMISSION_RENDERER_ARG] : []),
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

  // Quick Links privileged operations all pass the canonical trusted sender/frame/document gate
  // inside quick-links-ipc.js. The renderer may request OS dispatch only by a stored opaque ID.
  // Blue approved both exact production seed destinations on 2026-08-16. The builder did not infer
  // either address: these are the two values supplied at the explicit URL checkpoint.
  const quickLinksDefaults = buildQuickLinksDefaultConfig({
    starboardUrl: 'https://jlautomationsystems.com/',
    outlookUrl: 'https://outlook.office365.com/',
  });
  if (!quickLinksDefaults.ok) throw new Error('quick-links: approved defaults failed closed policy');
  const quickLinksStore = createQuickLinksStore({
    userDataDir: app.getPath('userData'),
    defaultConfig: quickLinksDefaults.config,
  });
  const quickLinksIpc = createQuickLinksIpc({
    entryUrl: ENTRY_URL,
    getTrustedWindow: () => win,
    store: quickLinksStore,
    openExternal: (url) => shell.openExternal(url),
    log: (line) => {
      const refused = line.includes(' result=refused');
      (refused ? console.error : console.log)(line);
      if (refused && win && !win.isDestroyed()) win.webContents.send('main-error', line);
    },
  });
  ipcMain.handle('quick-links-list', (e) => quickLinksIpc.handleList(e));
  ipcMain.handle('quick-links-save', (e, text) => quickLinksIpc.handleSave(e, text));
  ipcMain.handle('quick-links-open', (e, id) => quickLinksIpc.handleOpen(e, id));

  // PRODUCTION PANE STATUS — docs/OSS-PROCUREMENT-pane-status.md,
  // "BLUE SUBSYSTEM VERDICT: BUILD FRESH". Advisory, pane-ID-bound Claude Code lifecycle status.
  //
  // NOTHING HAPPENS HERE WITHOUT A PRIOR EXPLICIT SETUP. `start()` reconciles the APP-OWNED
  // descriptor — it never writes Claude settings — and only opens the transport when it finds a
  // verified installation that a human installed from the Terminals toolbar. On a machine that never
  // ran setup this listens on nothing, mints nothing, and leaves every PTY environment untouched.
  //
  // TWO CHILD-PROCESS DEPENDENCIES, BOTH INJECTED HERE AND NOWHERE ELSE (§ 15):
  //   A. resolveVersion            — explicit setup, installed-startup discovery, ordered re-probe.
  //   B. resolveProcessStartTime   — natively-confirmed clearStaleLock only.
  // Neither is reachable from a provider event, the heartbeat, freshness, rendering, enrollment, or
  // revocation. That is asserted by pane-status-isolation.test.js, not merely intended here.
  const paneStatusPublishers = createPublishers(() => win);
  const paneStatusUserData = app.getPath('userData');
  // The REAL Claude settings location. Tests never reach this line: every suite injects a temp path.
  const paneStatusSettingsDir = path.join(app.getPath('home'), '.claude');
  const paneStatusSettingsPath = path.join(paneStatusSettingsDir, 'settings.json');

  paneStatus = createPaneStatusController({
    userDataPath: paneStatusUserData,
    settingsDir: paneStatusSettingsDir,
    settingsPath: paneStatusSettingsPath,
    installId: resolvePaneStatusInstallId(paneStatusUserData),
    cmdExe: paneStatusShim.resolveCmdExe(process.env),
    reporterPath: path.join(__dirname, 'pane-status', 'pane-status-reporter.js'),
    currentRuntimePath: process.execPath,
    net: require('net'),
    crypto,
    randomToken: () => crypto.randomBytes(32).toString('hex'),
    // Dependency A. THE VERSION GATE MUST PROBE THE SAME `claude` THE PANE LAUNCHES.
    //
    // CORRECTED (advisory review, finding 3). This used to be `execFile('claude', ['--version'])`
    // straight from Electron main, which resolves against MAIN'S PATH. The pane, by contrast, is a
    // PowerShell PTY launched with -NoLogo -ExecutionPolicy Bypass -NoExit, and it LOADS THE USER'S
    // POWERSHELL PROFILE — which can prepend to PATH or define a `claude` function. Those two
    // resolutions can name different executables; the reviewed prototype recorded exactly that
    // happening on this machine, so main's answer was never evidence about the pane's binary.
    //
    // (The spawn call itself is deliberately NOT reproduced in this comment. A source-order
    //  assertion in admission-budget.test.js locates the real pty.spawn by its literal text, and a
    //  comment containing that text would be found first and make the assertion measure the wrong
    //  line — a defect this branch already caused once.)
    //
    // The resolver below runs ONE PowerShell process with the pane's flags minus `-NoExit`, resolves
    // the bare name with Get-Command inside it, and invokes THAT resolved source for `--version`. No
    // `-NoProfile`: the pane loads the profile, so the probe must too. Fail-closed at every branch —
    // not found, empty source, timeout, nonzero exit, unparseable output — leaves the version null and
    // every badge `unknown`/`version-mismatch`.
    resolveVersion: () => paneStatusVersionMod.createClaudeVersionResolver({
      execFile: require('child_process').execFile,
      // The PATH/PATHEXT the PTY will inherit. Unfenced construction removes only admission keys;
      // fenced construction copies both names case-insensitively with their exact values. Command
      // resolution therefore stays identical even though fenced PTYs omit every unrelated ambient
      // entry by construction.
      env: process.env,
      commandName: AGENT_CMD.claude,
      log: (line) => tlog(line),
    }).discover(),
    // Dependency B. PID plus PROCESS START TIME, because a recycled PID is otherwise indistinguishable
    // from the original lock owner. Anything it cannot determine becomes a conservative refusal.
    //
    // CORRECTED (advisory review, finding 7). The executable used to be selected by
    // `process.env.ComSpec ? 'powershell.exe' : 'powershell.exe'` — a ternary whose branches are
    // identical, so it consulted an environment variable and then ignored it, and handed a BARE NAME
    // to execFile either way. A bare name is resolved through PATH. This one is resolved to a bounded
    // absolute path under the validated system directory, and if it is not there the answer is
    // "liveness unknown", which the lock turns into a refusal to clear.
    resolveProcessStartTime: (pid) => new Promise((resolve) => {
      const ps = paneStatusLockMod.resolveWindowsPowerShellPath(process.env);
      if (!ps.ok) { tlog(`[pane-status] liveness resolver unavailable (${ps.reason})`); return resolve({ ok: false }); }
      try {
        require('child_process').execFile(
          ps.path,
          ['-NoProfile', '-NonInteractive', '-Command',
            `$p = Get-Process -Id ${Number(pid)} -ErrorAction SilentlyContinue; ` +
            'if ($p) { "RUNNING " + [int64]($p.StartTime.ToUniversalTime() - [datetime]"1970-01-01").TotalMilliseconds } else { "GONE" }'],
          { windowsHide: true, timeout: 15000, shell: false },
          (err, stdout) => {
            if (err) return resolve({ ok: false });
            const out = String(stdout || '').trim();
            if (out === 'GONE') return resolve({ ok: true, running: false });
            const m = /^RUNNING\s+(\d+)$/.exec(out);
            if (!m) return resolve({ ok: false });
            resolve({ ok: true, running: true, startTimeMs: Number(m[1]) });
          },
        );
      } catch { resolve({ ok: false }); }
    }),
    publishView: paneStatusPublishers.publishView,
    publishSetupState: paneStatusPublishers.publishSetupState,
    log: (line) => tlog(line),
  });

  // The four zero-argument invokes. Each runs the canonical trusted-sender gate BEFORE any filesystem
  // access, lock inspection, or child process — the same gate clipboard, library and the launchers use.
  registerPaneStatusIpc({
    ipcMain,
    trustedSenderGate: createTrustedSenderGate({ entryUrl: ENTRY_URL, getTrustedWindow: () => win }),
    controller: paneStatus,
    // NATIVE main-process confirmation. A renderer-drawn dialog is content the renderer controls;
    // deleting another process's lock file is the one action here that reaches outside this app, so it
    // gets a real human at a real OS dialog.
    confirmNatively: async () => {
      const { dialog } = require('electron');
      const res = await dialog.showMessageBox(win, {
        type: 'warning',
        buttons: ['Cancel', 'Clear the lock'],
        defaultId: 0,
        cancelId: 0,
        title: 'Clear stale pane-status lock',
        message: 'Clear the pane-status settings lock?',
        detail: 'Only do this if no other Blue Helm window is setting up or removing pane status. '
          + 'Blue Helm will still refuse unless it can prove the process that created the lock is gone.',
      });
      return res.response === 1;
    },
    log: (line) => tlog(line),
  });

  paneStatus.start().then((res) => {
    if (res && res.setupState && res.setupState !== 'ready' && res.setupState !== 'disabled') {
      // A non-ready installed state is a VISIBLE outcome, not a silent one. The detail is a bounded
      // constant: no path, no environment value, no command output, no token.
      const msg = `[pane-status] setup state: ${res.setupState}${res.detail ? ` (${res.detail})` : ''} — panes show "unknown".`;
      console.error(msg);
      if (win && !win.isDestroyed()) win.webContents.send('main-error', msg);
    }
  }).catch(() => {
    // start() is built never to reject, but the handler above can still throw — e.g. webContents.send
    // racing window teardown. Without this that becomes an unhandled rejection: a silent failure, and
    // this repo requires the opposite. Fixed constant, deliberately not the caught error's own text.
    const msg = '[pane-status] startup reconciliation handler failed — panes stay "unknown".';
    console.error(msg);
    if (win && !win.isDestroyed()) win.webContents.send('main-error', msg);
  });

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

  // ---- Turn admission budget boundary ----------------------------------------------------------
  // Registered ONLY when a controlled run is configured. With no run, these two channels do not exist
  // at all, so an invoke from anywhere rejects with "no handler registered" — the same strongest-form
  // absence the Dockview block below uses. Nothing about the ordinary application changes.
  //
  // Trust anchors are the canonical ones (ENTRY_URL + the late-bound trusted window), so this surface
  // is no weaker than the existing privileged boundaries. The renderer supplies no path, no run id, no
  // allowance and no terminator: it supplies a pane id and one bounded prompt, and main owns the rest.
  if (admissionEnabled) {
    const admissionGate = createTrustedSenderGate({ entryUrl: ENTRY_URL, getTrustedWindow: () => win });
    const admissionStore = createAdmissionLedgerStore({ userDataDir: app.getPath('userData') });
    admissionBudget = createAdmissionBudget({
      plan: admissionPlan,
      storage: admissionStore,
      now: () => Date.now(),
      // The admitted closure carries a module-private capability into the ONE final PTY-write
      // chokepoint. No renderer/IPC field can manufacture it. A missing pane rejects and the budget
      // reports `write-failed-after-admission` without refunding the durable admission.
      writer: admissionPtyBoundary.writeAdmitted,
      isPaneRunning: (paneId) => ptys.has(paneId),
      log: (line) => { tlog(line); if (win && !win.isDestroyed()) win.webContents.send('main-error', line); },
    });
    const init = admissionBudget.initialize();
    if (!init.ok) {
      // Fail closed and stay closed. A ledger that could not be read or created leaves the budget in
      // its refusing state; the run does not proceed on an assumed allowance.
      const line = `[admission] run NOT started: ${init.reason}. No prompt can be admitted; resolve this before any live run.`;
      tlog(line);
      if (win && !win.isDestroyed()) win.webContents.send('main-error', line);
    }
    admissionIpc = createAdmissionIpc({
      budget: admissionBudget,
      assessSender: (e) => admissionGate.assess(e),
      logRefusal: (line) => { tlog(`[admission] ${line}`); if (win && !win.isDestroyed()) win.webContents.send('main-error', line); },
      now: () => Date.now(),
    });
    admissionIpc.register(ipcMain);
    tlog(`[admission] controlled run active — direct terminal input will be blocked for the bound pane; only ${ADMISSION_CHANNEL_SUBMIT} may send a prompt`);
  }

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
  // PANE STATUS teardown (finding 6). Clears the heartbeat, stops the named pipe, revokes every
  // token. Idempotent, and it initiates no process control of its own — the pane kills above are the
  // launcher's, not pane status's.
  try { paneStatus.shutdown(); } catch (e) { tlog('[pane-status] shutdown failed: ' + ((e && e.message) || e)); }
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
  let admissionPaneClaimed = false;
  const refuseAdmissionStart = (reason) => {
    const line = `[admission] eligible Claude pane startup REFUSED [${reason}]`;
    tlog(line);
    if (win && !win.isDestroyed()) win.webContents.send('main-error', line);
    return { ok: false, error: reason };
  };

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
  const admissionLaunch = prepareAdmissionPaneLaunch({
    plan: admissionPlan,
    budget: admissionBudget,
    opts,
    validRoles: VALID_ROLES,
  });
  if (!admissionLaunch.ok) return refuseAdmissionStart(admissionLaunch.reason);
  admissionPaneClaimed = admissionLaunch.controlled === true;

  // PRODUCTION PANE STATUS — enroll this pane and carry its per-pane token into the PTY environment.
  // This is the ONLY place a token leaves main: Claude Code inherits it, and hands it to the reporter,
  // which is what binds a status message to THIS pane and no other. A refusal (pane status not set up,
  // version unverified, reconciliation required) returns {} and the pane simply launches without a
  // status environment — never an error, and never a reason to block the spawn.
  const paneStatusEnrollment = paneStatus.enrollPane(id);
  const paneStatusEnv = paneStatusEnrollment.ok ? paneStatusEnrollment.env : {};
  // P1 FENCED-ROLE ENVIRONMENT CONTAINMENT. This is defense-in-depth against a latent credential
  // boundary, not a claim that today's fenced role tool declarations expose a direct native-Windows
  // environment-reading path. Fenced roles start from an EMPTY object in buildPtyEnv and receive only
  // Blue's Tier 1 Windows allowlist. Unfenced panes retain an admission-scrubbed copy of process.env
  // after rejecting every inherited name that is not printable ASCII. Video Scout remains
  // deliberately unfenced and uses that same inherited-name boundary.
  //
  // buildPtyEnv constructs CLAUDE_CODE_SUBPROCESS_ENV_SCRUB=1, Video Scout's safeStorage
  // GEMINI_API_KEY when applicable, and at most the two exact string-valued pane-status transport
  // entries before spreading the filtered ambient base. The reserved set is derived from the emitted
  // main-issued map plus absent-but-owned pane-status names and Video Scout's Gemini name; every
  // ASCII-case ambient variant is removed first, so correctness does not depend on key ordering. Neither
  // pane-status entry is recovered from process.env, and no environment value is logged. For
  // unfenced panes, stripAdmissionEnv removes admission keys from the inherited PTY
  // environment; for fenced panes those keys are absent because they are outside Tier 1. This filters
  // inheritance only; it creates no same-user filesystem isolation. APPDATA and USERPROFILE remain
  // available, and a same-user process can still locate the ledger. The ledger remains an
  // ACCIDENTAL-SPEND control, not a security boundary against a malicious or compromised pane.
  const fencedRole = !opts.videoScout && opts.role && FENCED_ROLES.has(opts.role);
  const ptyEnv = buildPtyEnv({
    baseEnv: process.env,
    fencedRole,
    videoScout: opts.videoScout,
    geminiKey,
    paneStatusEnv,
  });
  let p;
  const envMode = fencedRole ? 'fenced-tier-1' : 'unfenced-current';
  tlog(`pty-start: env built — mode=${envMode}; scrub=forced; video-scout-key=${opts.videoScout ? 'explicit' : 'not-explicit'}; pane-status=${paneStatusEnrollment.ok ? 'enrolled' : 'not-enrolled'}`);
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
    // A durable pre-spawn claim exists but no process does. Close the run and void its remainder; the
    // already-persisted claim is never transferred to another pane.
    closeAfterFailedSpawn(admissionBudget, id, admissionLaunch);
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
  //
  // TWO REGISTRIES, TWO DELIBERATELY DIFFERENT LIFETIMES — and the difference is the point.
  //
  //   videoScoutRunIds  OUTLIVES the process. A finished run's report must stay openable from the pane
  //                     until Blue explicitly closes it (pty-kill) or the window shuts down. That is
  //                     V5b1's rule and it is unchanged here.
  //   pane status       DIES WITH the process. It is not a stored artifact; it is a live claim about a
  //                     running program, backed by a bearer token. Keeping either alive past exit would
  //                     display `working` for a process that no longer exists and leave a valid token
  //                     with no legitimate holder for the whole 120-second staleness window.
  //
  // So pane status is notified HERE (finding 6 / Work Order 1 § F.7: PTY exit is authoritative and does
  // not wait for a SessionEnd hook that may never fire), while the run-ID mapping is deliberately not.
  p.onExit(() => {
    ptys.delete(id);
    // PANE STATUS: publish `exited` first, while the pane is still addressable, then revoke its token.
    paneStatus.notePaneExit(id);
    // The controlled pane's process is gone: close the run. Any unused allowance is VOIDED here and is
    // never transferred to another pane. Consumed admissions stay consumed.
    if (admissionEnabled && admissionBudget.enabled) admissionBudget.notePaneExit(id);
    if (admissionIpc) admissionIpc.forgetPane(id);
    if (win && !win.isDestroyed()) win.webContents.send('pty-exit', { id });
  });
  return { ok: true };
});
// TURN ADMISSION BUDGET — THE DIRECT-INPUT CHOKEPOINT.
//
// Every ordinary route into a PTY converges here: `term.onData` (typing), the clipboard consumer's
// paste, the speech-to-text delivery, and any shell-input helper all call `cc.ptyWrite`, which is this
// channel. Blocking in MAIN rather than in each renderer call site is what makes the block complete:
// a control character, an Enter, a bracketed paste, or a future call site added by someone who never
// read this comment all arrive at the same line and are refused by the same check.
//
// The refusal is visible (bounded reason on the Logs channel, throttled so a held key cannot flood it)
// and it never echoes the bytes. Uncontrolled panes take the original path, byte-for-byte.
ipcMain.on('pty-write', (_e, { id, data }) => {
  admissionPtyBoundary.writeDirect(id, data);
});
ipcMain.on('pty-resize', (_e, { id, cols, rows }) => { const p = ptys.get(id); if (p) { try { p.resize(cols, rows); } catch (err) { tlog(`pty-resize ${id} failed (process likely exiting): ${(err && err.message) || err}`); } } });
ipcMain.on('pty-kill', (_e, id) => {
  const p = ptys.get(id); if (p) { try { p.kill(); } catch {} ptys.delete(id); }
  // Explicit pane close: the run's report is no longer reachable from the UI, so drop the mapping.
  videoScoutRunIds.remove(id);
  // EXPERIMENT A: the pane is gone, so its token must die with it. Releasing here (not on pty-exit)
  // matches the run-ID registry's rule — a finished agent's pane still exists until Blue closes it.
  paneStatus.releasePane(id);
  // TURN ADMISSION BUDGET: an explicitly closed pane closes its run too. Same rule as pty-exit — the
  // remainder is voided, never transferred, and the consumed count is untouched.
  if (admissionEnabled && admissionBudget.enabled) admissionBudget.notePaneExit(id);
  if (admissionIpc) admissionIpc.forgetPane(id);
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
