'use strict';
// S35 mako-token: what Mako's main process needs before it starts an agent pane in GitHub App mode.
// Pure apart from the injected fs and installer, so it is tested without Electron.
//
//   prepareAgentApp(...) -> { mode:'pat' }                         no App config: the PAT mode (S06) as before
//                         | { mode:'app', agentApp }               launchers written; env built by pty-env.js
//                         | { mode:'refused', reason }             the pane does NOT start
//
// A configured App never falls back to the PAT or to Blue's own login: a broken config, a missing
// key or launchers that cannot be written refuse the pane visibly.

const nodefs = require('fs');
const path = require('path');
const os = require('os');
const cfg = require('./config');
const { loadConfig } = require('./service');
const { installForCurrentRuntime } = require('./install');
const { scrub } = require('./errors');
const { assertSafePath } = require('./shims');

function prepareAgentApp({ env = process.env, fs = nodefs, homedir = os.homedir(), install = installForCurrentRuntime } = {}) {
  const layout = cfg.layout(env, homedir);
  const loaded = loadConfig({ fs, configPath: layout.configPath });
  if (!loaded.ok) {
    if (loaded.reason === 'not-configured') return { mode: 'pat' };
    return { mode: 'refused', reason: `the GitHub App config is invalid (${loaded.detail})` };
  }
  if (!fs.existsSync(layout.keyPath)) {
    return { mode: 'refused', reason: 'GitHub App mode is configured but the App key is not imported on this PC (mako-token import; docs/MAKO-TOKEN.md). Not falling back to another login.' };
  }
  try { assertSafePath(layout.binDir, 'the launcher folder'); assertSafePath(layout.ghEmptyDir, 'the empty gh config folder'); install({ env, fs, homedir }); }
  catch (e) { return { mode: 'refused', reason: `could not prepare the gh shim and launchers (${scrub(e && e.message)})` }; }
  return { mode: 'app', agentApp: { config: loaded.config, binDir: layout.binDir, ghConfigDir: layout.ghEmptyDir } };
}

/** Once per run: `mako-token status` in a child process (Electron as Node), so a dead key or a suspended
 *  installation shows up as a banner before the agent hits it. Never blocks a pane; never prints a token. */
function runStatusPreflight({ execFile, execPath = process.execPath, env = process.env, onFailure, cliPath = path.join(__dirname, 'cli.js') }) {
  execFile(execPath, [cliPath, 'status'], {
    env: { ...env, ELECTRON_RUN_AS_NODE: '1' }, timeout: 90 * 1000, windowsHide: true,
  }, (err, _stdout, stderr) => {
    if (err) onFailure(scrub(String(stderr || err.message).trim()));
  });
}

module.exports = { prepareAgentApp, runStatusPreflight };
