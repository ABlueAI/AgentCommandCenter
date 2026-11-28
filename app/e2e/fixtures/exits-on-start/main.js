'use strict';
// Negative control for app/e2e/first-window-smoke.js: an app that dies before any window opens,
// like a main process that crashes during start-up. The smoke check must fail on it.
// (It exits rather than throwing: an uncaught throw in Electron's main process opens a modal error
// dialog on Windows, which would hang the CI job instead of failing it.)
const { app } = require('electron');
app.whenReady().then(() => { process.exit(3); });
