'use strict';
// S35 mako-token: write the launchers for the runtime that is running this code (Electron when Mako
// calls it, plain Node for the standalone CLI). Used by Mako before it starts an App-mode pane.

const path = require('path');
const os = require('os');
const nodefs = require('fs');
const cfg = require('./config');
const { launcherFiles, installLaunchers } = require('./shims');
const { loadConfig } = require('./service');
const { MakoTokenError } = require('./errors');

function installForCurrentRuntime({ env = process.env, fs = nodefs, homedir = os.homedir(), runAsNode = !!process.versions.electron, exe = process.execPath } = {}) {
  const layout = cfg.layout(env, homedir);
  const loaded = loadConfig({ fs, configPath: layout.configPath });
  if (!loaded.ok) throw new MakoTokenError(loaded.reason === 'not-configured' ? 'not-configured' : 'bad-config', loaded.reason === 'not-configured' ? 'GitHub App mode is not set up on this PC (mako-token import)' : `the GitHub App config is invalid (${loaded.detail})`);
  const files = launcherFiles({
    runtime: { exe, runAsNode },
    ghShimJs: path.join(__dirname, 'gh-shim.js'), cliJs: path.join(__dirname, 'cli.js'),
    binDir: layout.binDir,
  });
  fs.mkdirSync(layout.ghEmptyDir, { recursive: true });
  return installLaunchers({ fs, binDir: layout.binDir, files });
}

module.exports = { installForCurrentRuntime };
