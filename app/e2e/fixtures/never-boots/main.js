'use strict';
// Negative control for app/e2e/first-window-smoke.js: a window opens on renderer/index.html, titled
// "Mako" like the real page, but with no preload bridge and a boot script that throws, like a
// renderer that breaks during start-up. The smoke check must fail on it.
const path = require('path');
const { app, BrowserWindow } = require('electron');
app.whenReady().then(() => {
  const win = new BrowserWindow({ width: 800, height: 600, show: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true } });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
});
app.on('window-all-closed', () => app.quit());
