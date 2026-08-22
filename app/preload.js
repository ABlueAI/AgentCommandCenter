// Preload bridge: the ONLY surface the renderer can see. Keeps Node out of the UI
// while exposing a tidy `window.cc` API that maps 1:1 to the main-process handlers.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('cc', {
  // settings & repos
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (p) => ipcRenderer.invoke('save-settings', p),
  pickFolder: () => ipcRenderer.invoke('pick-folder'),
  listRepos: () => ipcRenderer.invoke('list-repos'),
  listWorktrees: (repo) => ipcRenderer.invoke('list-worktrees', repo),
  repoGithubUrl: (repo) => ipcRenderer.invoke('repo-github-url', repo),

  // agents
  newAgent: (a) => ipcRenderer.invoke('new-agent', a),
  removeAgent: (a) => ipcRenderer.invoke('remove-agent', a),
  reviewDiff: (a) => ipcRenderer.invoke('review-diff', a),
  ensureOutputDir: (a) => ipcRenderer.invoke('ensure-output-dir', a),
  verifyFence: (a) => ipcRenderer.invoke('verify-fence', a),
  getGeminiKeyStatus: () => ipcRenderer.invoke('get-gemini-key-status'),
  setGeminiKey: (key) => ipcRenderer.invoke('set-gemini-key', key),
  clearGeminiKey: () => ipcRenderer.invoke('clear-gemini-key'),

  // one-click launchers
  openVscode: (p) => ipcRenderer.invoke('open-vscode', p),
  openTerminal: (p) => ipcRenderer.invoke('open-terminal', p),
  openExternal: (u) => ipcRenderer.invoke('open-external', u),

  // Quick Links has dedicated invoke-only channels. Open accepts a stored opaque ID only; there is
  // no Quick Links bridge capable of submitting a URL or using the legacy open-external channel.
  quickLinksList: () => ipcRenderer.invoke('quick-links-list'),
  quickLinksSave: (text) => ipcRenderer.invoke('quick-links-save', text),
  quickLinksOpen: (id) => ipcRenderer.invoke('quick-links-open', id),

  // vibe-kanban desktop app (launched, not embedded — see main.js)
  openBoard: () => ipcRenderer.invoke('open-board'),
  pickBoardApp: () => ipcRenderer.invoke('pick-board-app'),

  // in-app terminals (node-pty)
  tlogReset: () => ipcRenderer.invoke('tlog-reset'),
  ptyStart: (o) => ipcRenderer.invoke('pty-start', o),
  ptyWrite: (id, data) => ipcRenderer.send('pty-write', { id, data }),
  ptyResize: (id, cols, rows) => ipcRenderer.send('pty-resize', { id, cols, rows }),
  ptyKill: (id) => ipcRenderer.send('pty-kill', id),
  onPtyData: (cb) => ipcRenderer.on('pty-data', (_e, p) => cb(p)),
  onPtyExit: (cb) => ipcRenderer.on('pty-exit', (_e, p) => cb(p)),

  // clipboard (terminal copy/paste). The Electron `clipboard` module is undefined in the
  // sandboxed preload, so access goes through main via bounded IPC (main validates the
  // sender/frame/URL, enforces the 1,000,000-char limit, and returns { ok, text?, error? }).
  // These are the ONLY surface: no navigator.clipboard, no direct OS access.
  clipboardRead: () => ipcRenderer.invoke('clipboard-read'),
  clipboardWrite: (t) => ipcRenderer.invoke('clipboard-write', t),

  // V5b2 Library / in-app report reader (invoke-only). List returns bounded metadata + OPAQUE
  // main-issued handles; a report is requested only by handle (library) or by pane ID (Open Report on
  // a live Video Scout pane). The renderer never sends or receives a filesystem path. Main validates
  // the sender/frame/URL, runs the PowerShell library boundary, and enforces every bound.
  libraryList: () => ipcRenderer.invoke('library-list'),
  libraryRead: (handle) => ipcRenderer.invoke('library-read', handle),
  libraryOpenReport: (paneId) => ipcRenderer.invoke('library-open-report', paneId),
  // V3b follow-up Q&A (invoke-only). The request is a strict discriminated shape carrying ONLY a
  // main-owned identity token (the CURRENT opaque library handle, or the pane ID for Open Report)
  // plus the question text — never a run ID, path, report text, URL, model, or key. Main validates
  // everything, re-reads the report through PowerShell, enforces the cost bounds and the one-in-
  // flight rule, and returns only a bounded plain-text answer + safe usage metadata.
  libraryFollowup: (req) => ipcRenderer.invoke('library-followup', req),

  // surfaced main-process errors (shown in the Logs tab instead of a fatal dialog)
  onMainError: (cb) => ipcRenderer.on('main-error', (_e, m) => cb(m)),
});

// ---- Dockview layout bridge --------------------------------------------------------------------
// Reports MAIN's already-made layout decision and, in production, carries bounded layout operations.
// Nothing here can CHANGE the decision: it only reflects what main forwarded through
// `additionalArguments` at window construction. Renderer script cannot change this process's argv,
// so a query string, hash, saved setting, or injected script cannot flip the engine either way.
//
// The value is computed ONCE at preload time and the exposed object is frozen, so renderer code
// cannot mutate `window.ccDockview.enabled` to conjure layout operations that were not exposed.
const classicLayoutEnabled = process.argv.includes('--cc-classic-layout');

// Two genuinely different shapes, not one shape with an inert flag.
//
// PRODUCTION (default `npm start`): `enabled: true` plus the three bounded operations.
// CLASSIC RECOVERY (`--classic-layout`): `enabled: false` and NO operations at all — `saveLayout`,
// `loadLayout` and `resetLayout` are not merely inert, they are absent. Main has also not registered
// the handlers in that mode, so even a forged call has nothing to reach. That is the work order's
// "classic must not register layout IPC" and "must not read, write, or delete Dockview layout
// state" enforced at both ends rather than by renderer discipline.
contextBridge.exposeInMainWorld('ccDockview', Object.freeze(
  classicLayoutEnabled
    ? {
        // Frozen boolean — the ONLY authority the renderer has for "is Dockview the layout engine?".
        enabled: false,
      }
    : {
        enabled: true,
        // Bounded layout operations. The renderer passes ONLY a layout object; it never supplies a
        // path, a filename, or any part of one. Main owns the location, validation, and refusal.
        saveLayout: (layout) => ipcRenderer.invoke('dockview-layout-save', layout),
        loadLayout: () => ipcRenderer.invoke('dockview-layout-load'),
        resetLayout: () => ipcRenderer.invoke('dockview-layout-reset'),
      }
));

// ---- PRODUCTION pane-status bridge --------------------------------------------------------------
// docs/OSS-PROCUREMENT-pane-status.md — "BLUE SUBSYSTEM VERDICT: BUILD FRESH".
//
// UNCONDITIONAL, and that is the deliberate change from Experiment A. The prototype hid behind a gate
// token so the surface would be ABSENT when disabled. Pane status is now a FEATURE of the app rather
// than an experiment, so the bridge always exists in the trusted window; whether it is SET UP is a
// runtime question the four invokes answer honestly, not a question about whether an object exists.
//
// THE ENTIRE SURFACE IS FOUR ZERO-ARGUMENT INVOKES AND ONE SUBSCRIPTION.
//
// Every invoke takes NO ARGUMENTS. That is the security argument, and it is structural: a handler that
// accepts no request body cannot be asked for a path, a pane, a token, or a file, because there is no
// parameter through which to ask. Main validates the sender against the canonical trusted-sender gate
// before it touches the filesystem, inspects the lock, or runs a child process.
//
// WHAT IS DELIBERATELY ABSENT: any status setter, any enrollment or revocation call, any path, any
// token, any settings content. The renderer may ask what state setup is in, ask to install, ask to
// remove, ask to clear a stale lock, and receive token-free { paneId, state, reason } views. Nothing
// here can authorize or initiate a consequential action.
contextBridge.exposeInMainWorld('ccPaneStatus', Object.freeze({
  getSetupState: () => ipcRenderer.invoke('pane-status-get-setup-state'),
  install: () => ipcRenderer.invoke('pane-status-install'),
  remove: () => ipcRenderer.invoke('pane-status-remove'),
  clearStaleLock: () => ipcRenderer.invoke('pane-status-clear-stale-lock'),
  onView: (cb) => ipcRenderer.on('pane-status-view', (_e, v) => cb(v)),
  onSetupState: (cb) => ipcRenderer.on('pane-status-setup-state', (_e, s) => cb(s)),
}));

// ---- MAIN-OWNED TURN ADMISSION BUDGET bridge ----------------------------------------------------
// docs/OSS-PROCUREMENT-pane-status.md — "BLUE SUBSYSTEM VERDICT: BUILD FRESH".
// Blue's authorization, verbatim: I SELECT TURN-ACCOUNTING OUTCOME B. THE FOURTH TURN REMAINS
// UNEXPLAINED. NO LIVE PANE-STATUS PROVIDER SESSION IS AUTHORIZED UNTIL THE MAIN-OWNED ADMISSION
// BUDGET IS REVIEWED AND LANDED.
//
// ABSENT, NOT INERT. With no controlled run configured, `window.ccAdmission` is undefined: there is no
// method to call and main has registered no handler, so even a forged invoke has nothing to reach.
// Renderer script cannot add a process argument, so it cannot conjure this bridge into existence.
//
// THE SURFACE IS EXACTLY TWO INVOKES, AND NEITHER IS A SETTER:
//   submitPrompt({ paneId, prompt }) -> asks main to spend ONE admission. Main validates the sender,
//     the shape and the prompt, decrements and PERSISTS the ledger, and only then writes to the PTY.
//     Main appends the submission terminator; the renderer cannot supply one (control characters are
//     refused) and therefore cannot get two prompts out of one admission.
//   getState() -> bounded counts for a controlled-run UI.
//
// There is deliberately NO setAllowance, NO reset, NO certify, and NO generic write. The renderer is
// TOLD the numbers; it can never change what they mean. A refusal returns a bounded reason constant
// and never carries prompt text back.
if (process.argv.includes('--blue-helm-admission-budget')) {
  contextBridge.exposeInMainWorld('ccAdmission', Object.freeze({
    enabled: true,
    submitPrompt: (req) => ipcRenderer.invoke('admission-submit-prompt', req),
    getState: () => ipcRenderer.invoke('admission-get-state'),
  }));
}
