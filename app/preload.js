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

// ---- Dockview prototype bridge (PROTOTYPE ONLY — branch feature/dockview-prototype) -------------
// Exposes exactly two things, per the work order § 6: a FROZEN BOOLEAN and bounded layout
// operations. Nothing here can enable the prototype — it only reports the decision MAIN already
// made and forwarded through `additionalArguments` at window construction. Renderer script cannot
// change this process's argv, so a query string, hash, saved setting, or injected script cannot
// flip it on.
//
// The boolean is computed ONCE at preload time and deep-frozen, so renderer code cannot mutate
// `window.ccDockview.enabled` to unlock the layout operations either. When the prototype is off the
// operations are still exposed but every call rejects in main, because the handlers are not
// registered at all in default `npm start`.
const dockviewPrototypeEnabled = process.argv.includes('--cc-dockview-prototype');

// The bridge is exposed ONLY in prototype mode. On the default path `window.ccDockview` is
// undefined, so the renderer's global surface is genuinely unchanged — not merely inert. app.js
// already handles absence (`!window.ccDockview` returns early), so this is the stronger form of the
// same guarantee: default `npm start` gains no new global and no new IPC wrapper at all.
if (dockviewPrototypeEnabled) {
  contextBridge.exposeInMainWorld('ccDockview', Object.freeze({
    // Frozen boolean — the ONLY authority the renderer has for "am I in prototype mode?".
    enabled: dockviewPrototypeEnabled,
    // Bounded layout operations. The renderer passes ONLY a layout object; it never supplies a
    // path, a filename, or any part of one. Main owns the location, the validation, and the refusal.
    saveLayout: (layout) => ipcRenderer.invoke('dockview-layout-save', layout),
    loadLayout: () => ipcRenderer.invoke('dockview-layout-load'),
    resetLayout: () => ipcRenderer.invoke('dockview-layout-reset'),
  }));
}
