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
  // The shared gh config folder is meant to be empty. Clear anything a pane planted in it, then make sure it
  // exists. A file gh holds open (EBUSY/EPERM) is left for the next start; any other failure refuses the pane
  // visibly rather than starting it with whatever was planted. Panes already running keep what is there.
  let names = [];
  try { names = fs.readdirSync(layout.ghEmptyDir); } catch (e) { if (!e || e.code !== 'ENOENT') throw new MakoTokenError('clean-failed', `could not read the gh config folder (${e && e.code})`); }
  for (const name of names) {
    try { fs.rmSync(path.join(layout.ghEmptyDir, name), { recursive: true, force: true }); }
    catch (e) { if (!e || (e.code !== 'EBUSY' && e.code !== 'EPERM')) throw new MakoTokenError('clean-failed', `could not clear the gh config folder (${e && e.code})`); }
  }
  fs.mkdirSync(layout.ghEmptyDir, { recursive: true });
  return installLaunchers({ fs, binDir: layout.binDir, files });
}

module.exports = { installForCurrentRuntime };
