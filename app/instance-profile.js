'use strict';
// S07: stable and dev copies of Mako (docs/DEV-INSTANCE.md).
//
// Mako runs as one of two instances, chosen ONCE in main from this process's own argv:
//   - stable (no flag): Blue's everyday copy. Everything behaves exactly as before S07.
//   - dev (`--dev-instance`, `npm run start:dev`): the copy agents change and try out. It keeps its
//     own settings folder (userData: settings, encrypted keys, Quick Links, layout, pane-status
//     records), its own Windows taskbar identity, and it NEVER installs, removes or changes Claude
//     Code hooks: its pane-status controller is the inert one below, so it opens no listener, writes
//     no Claude settings and clears no lock.
//
// Like `--classic-layout`, this is a launch decision, not a setting or an env var: nothing the
// renderer or a saved setting can do changes which instance this process is.

const DEV_INSTANCE_FLAG = '--dev-instance';

// The stable values are the ones Mako has always used: the `command-center` package name gives the
// default userData folder, and ABlueAI.Mako is the AppUserModelID from the taskbar-identity work.
const PROFILES = Object.freeze({
  stable: Object.freeze({
    kind: 'stable',
    userDataDirName: null,              // null = keep Electron's default (%APPDATA%\command-center)
    appUserModelId: 'ABlueAI.Mako',
    buildLabelTag: null,
    claudeHooks: true,
  }),
  dev: Object.freeze({
    kind: 'dev',
    userDataDirName: 'command-center-dev',
    appUserModelId: 'ABlueAI.Mako.Dev',
    buildLabelTag: 'dev',
    claudeHooks: false,
  }),
});

/** argv -> the frozen profile for this process. Only the exact flag selects dev. */
function resolveInstanceProfile(argv) {
  const args = Array.isArray(argv) ? argv : [];
  return args.includes(DEV_INSTANCE_FLAG) ? PROFILES.dev : PROFILES.stable;
}

// The setup state the dev copy reports. The renderer shows it as its own toolbar state with no
// action, so the dev copy never offers to set up hooks it would refuse to install.
const DEV_SETUP_STATE = 'dev-instance';
const DEV_REFUSAL = 'dev-instance-no-claude-hooks';

/**
 * A pane-status controller with the real one's surface that touches nothing outside the process.
 * install/remove/clearStaleLock refuse with a bounded constant (pane-status-ipc.js passes it through),
 * so a stray invoke is a visible refusal, never a silent success.
 */
function createDevPaneStatusController() {
  const setup = Object.freeze({ state: DEV_SETUP_STATE, detail: null, versionSupported: false, installedEvents: [] });
  const refuse = async () => ({ ok: false, reason: DEV_REFUSAL, detail: DEV_REFUSAL });
  return {
    start: async () => ({ setupState: DEV_SETUP_STATE }),
    getSetupState: () => setup,
    install: refuse,
    remove: refuse,
    clearStaleLock: refuse,
    enrollPane: () => ({ ok: false, reason: DEV_SETUP_STATE }),
    releasePane: () => false,
    notePaneExit: () => false,
    shutdown: () => false,
  };
}

const api = {
  DEV_INSTANCE_FLAG, PROFILES, DEV_SETUP_STATE, DEV_REFUSAL,
  resolveInstanceProfile, createDevPaneStatusController,
};
if (typeof module === 'object' && module.exports) module.exports = api;
