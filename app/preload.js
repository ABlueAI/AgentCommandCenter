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
  openAgentTerminal: (a) => ipcRenderer.invoke('open-agent-terminal', a),
  removeAgent: (a) => ipcRenderer.invoke('remove-agent', a),

  // one-click launchers
  openVscode: (p) => ipcRenderer.invoke('open-vscode', p),
  openTerminal: (p) => ipcRenderer.invoke('open-terminal', p),
  openExternal: (u) => ipcRenderer.invoke('open-external', u),

  // vibe-kanban desktop app (launched, not embedded — see main.js)
  openBoard: () => ipcRenderer.invoke('open-board'),
  pickBoardApp: () => ipcRenderer.invoke('pick-board-app'),
});
