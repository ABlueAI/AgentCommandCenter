'use strict';
// Run: node app/instance-profile.test.js
//
// S07: the stable copy keeps every identity it had; the dev copy (`--dev-instance`) has its own
// settings folder and taskbar ID and never touches Claude Code hooks.

const fs = require('fs');
const path = require('path');
const {
  DEV_INSTANCE_FLAG, PROFILES, DEV_SETUP_STATE, DEV_REFUSAL,
  resolveInstanceProfile, createDevPaneStatusController,
} = require('./instance-profile');

let passed = 0, failed = 0;
function assert(cond, label) {
  if (cond) { process.stdout.write(`  ✓ ${label}\n`); passed++; }
  else { process.stderr.write(`  ✗ FAIL: ${label}\n`); failed++; }
}
function eq(a, b, label) { assert(a === b, `${label} (got ${JSON.stringify(a)})`); }
const count = (s, needle) => s.split(needle).length - 1;

(async () => {
  // Selection: only the exact flag picks dev.
  eq(DEV_INSTANCE_FLAG, '--dev-instance', 'the dev flag is --dev-instance');
  eq(resolveInstanceProfile(['electron.exe', '.']).kind, 'stable', 'no flag is the stable copy');
  eq(resolveInstanceProfile(['electron.exe', '.', '--dev-instance']).kind, 'dev', 'the flag selects the dev copy');
  eq(resolveInstanceProfile(['electron.exe', '.', '--classic-layout', '--dev-instance']).kind, 'dev', 'alongside other flags too');
  eq(resolveInstanceProfile(['electron.exe', '.', '--dev-instance=1']).kind, 'stable', 'a near-miss flag is not the dev flag');
  eq(resolveInstanceProfile(['electron.exe', '.', '--DEV-INSTANCE']).kind, 'stable', 'the flag is case-sensitive');
  eq(resolveInstanceProfile(undefined).kind, 'stable', 'missing argv is the stable copy');

  // Stable keeps what Mako always had.
  eq(PROFILES.stable.userDataDirName, null, 'stable keeps Electron\'s default userData folder');
  eq(PROFILES.stable.appUserModelId, 'ABlueAI.Mako', 'stable keeps the ABlueAI.Mako taskbar ID');
  eq(PROFILES.stable.claudeHooks, true, 'stable keeps pane status and its Claude Code hooks');
  eq(PROFILES.stable.buildLabelTag, null, 'stable keeps the plain build label');

  // Dev differs on every shared identity.
  eq(PROFILES.dev.userDataDirName, 'command-center-dev', 'dev has its own userData folder');
  assert(PROFILES.dev.userDataDirName !== require('./package.json').name, 'which is not the stable folder (the package name)');
  eq(PROFILES.dev.appUserModelId, 'ABlueAI.Mako.Dev', 'dev has its own taskbar ID');
  eq(PROFILES.dev.claudeHooks, false, 'dev never touches Claude Code hooks');
  eq(PROFILES.dev.buildLabelTag, 'dev', 'dev labels its window');
  assert(Object.isFrozen(PROFILES) && Object.isFrozen(PROFILES.dev) && Object.isFrozen(PROFILES.stable), 'the profiles are frozen');

  // The dev pane-status controller: same surface, nothing reaches outside the process.
  const ctl = createDevPaneStatusController();
  for (const fn of ['start', 'getSetupState', 'install', 'remove', 'clearStaleLock', 'enrollPane', 'releasePane', 'notePaneExit', 'shutdown']) {
    assert(typeof ctl[fn] === 'function', `the dev controller has ${fn}()`);
  }
  eq((await ctl.start()).setupState, DEV_SETUP_STATE, 'start() reports the dev-instance setup state');
  eq(ctl.getSetupState().state, DEV_SETUP_STATE, 'getSetupState() reports it too');
  for (const fn of ['install', 'remove', 'clearStaleLock']) {
    const res = await ctl[fn]();
    assert(res.ok === false && res.reason === DEV_REFUSAL && res.detail === DEV_REFUSAL, `${fn}() refuses visibly with ${DEV_REFUSAL}`);
  }
  assert(/^[A-Za-z][A-Za-z0-9-]{0,63}$/.test(DEV_REFUSAL), 'the refusal detail passes pane-status-ipc\'s bounded-detail shape');
  eq(ctl.enrollPane('p1').ok, false, 'enrollPane() gives a pane no status environment');
  eq(ctl.releasePane('p1'), false, 'releasePane() is a no-op');
  eq(ctl.notePaneExit('p1'), false, 'notePaneExit() is a no-op');
  eq(ctl.shutdown(), false, 'shutdown() is a no-op');
  const ctlSrc = fs.readFileSync(path.join(__dirname, 'instance-profile.js'), 'utf8');
  assert(!/require\(/.test(ctlSrc.replace(/^\s*\/\/.*$/gm, '')), 'instance-profile.js requires nothing: no fs, net or child_process');

  // The renderer shows the dev state as its own, with no Set up button.
  const badgeSrc = fs.readFileSync(path.join(__dirname, 'renderer', 'pane-status-badge.js'), 'utf8');
  assert(/'dev-instance': \{\s*label: 'Claude status: off \(dev copy\)',[\s\S]*?action: null,/.test(badgeSrc), 'the toolbar has a dev-instance state with no action');

  // main.js wiring (source shape, like mako-branding.test.js).
  const main = fs.readFileSync(path.join(__dirname, 'main.js'), 'utf8');
  const decide = 'const instanceProfile = resolveInstanceProfile(process.argv);';
  const setPath = "app.setPath('userData', path.join(app.getPath('appData'), instanceProfile.userDataDirName));";
  eq(count(main, decide), 1, 'main decides the instance once, from its own argv');
  eq(count(main, setPath), 1, 'main moves userData to the dev folder in one place');
  eq(count(main, "app.setPath('userData'"), 1, 'and nowhere else');
  eq(count(main, 'if (instanceProfile.userDataDirName) {'), 1, 'only when the profile names a folder');
  const firstUserData = main.indexOf("getPath('userData')");
  assert(main.indexOf(setPath) > main.indexOf(decide) && main.indexOf(setPath) < firstUserData, 'the move happens before anything reads userData');
  for (const later of ['app.whenReady().then(', 'function createWindow(']) {
    assert(main.indexOf(setPath) < main.indexOf(later), `and before the first ${later}`);
  }
  assert(/^if \(instanceProfile\.userDataDirName\) \{\r?$/m.test(main), 'the move is an unindented module-scope statement');
  eq(count(main, 'createPaneStatusController({'), 1, 'one real pane-status controller is built');
  eq(count(main, 'paneStatus = !instanceProfile.claudeHooks ? createDevPaneStatusController() : createPaneStatusController({'), 1,
    'and only when the profile allows Claude Code hooks; the dev copy gets the inert one');
  assert(main.includes('instanceTag: instanceProfile.buildLabelTag,'), 'the build label carries the instance tag');

  process.stdout.write(`\ninstance-profile: ${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
})();
