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

  // surfaced main-process errors (shown in the Logs tab instead of a fatal dialog)
  onMainError: (cb) => ipcRenderer.on('main-error', (_e, m) => cb(m)),
});
