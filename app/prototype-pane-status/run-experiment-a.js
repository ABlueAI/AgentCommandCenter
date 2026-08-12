'use strict';
// EXPERIMENT A runner — BUILDER-OPERATED, NOT PART OF THE APPLICATION.
//
// Procurement record: docs/OSS-PROCUREMENT-pane-status.md
// Blue's verdict, verbatim: BLUE SUBSYSTEM VERDICT: PROTOTYPE
//
// main.js does NOT import this and must never import it. It exists so the temporary user-scope Claude
// settings change is performed by an auditable, guaranteed-cleanup script rather than by hand or by
// the application. Run it with an explicit subcommand:
//
//   node run-experiment-a.js identity   -> report settings identity only (no write)
//   node run-experiment-a.js install    -> capture identity, back up, install temporary hooks
//   node run-experiment-a.js restore    -> restore byte-for-byte (or restore absence) and prove it
//   node run-experiment-a.js listen     -> run a standalone pipe listener for a live pane
//
// The install path writes an identity sidecar so `restore` works even from a fresh process — a
// crashed experiment must still be recoverable.
//
// REVISION 2, after a Full-class VERDICT: FAIL. That recoverability claim was FALSE for the case it
// names. A second `install` from a fresh process used to overwrite both the sidecar and the backup
// with already-patched state, destroying the only record of the genuine original. Install now
// REFUSES — without touching settings, sidecar or backup — if a sidecar exists, if a recovery copy
// exists, or if the settings file already carries the prototype marker, and tells the operator to
// run `restore`. Recovery artifacts are never overwritten, only created once and deleted after a
// proven byte-identical restoration.
//
// Also revision 2: NO command prints the bearer token. `listen` used to print it for a manual
// copy/paste launch; it now hands the prototype variables to a child process's environment via
// EXPERIMENT_CHILD_ARGV and prints only the variable names.

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const settingsMod = require('./pane-status-settings');
const serverMod = require('./pane-status-server');
const { createPaneStatusStore } = require('./pane-status-store');
const protocol = require('./pane-status-protocol');

// Paths. The two overrides exist so the test suite can exercise EVERY command mode — including the
// refusal and restore paths — against a disposable temp tree instead of Blue's real `~/.claude`.
// They are read only by this builder-operated script; `app/main.js` does not import this file and a
// test asserts that, so no application code path can be redirected by them.
const SETTINGS_PATH = process.env.EXPERIMENT_SETTINGS_PATH || path.join(os.homedir(), '.claude', 'settings.json');
const WORK_DIR = process.env.EXPERIMENT_WORK_DIR || path.join(os.tmpdir(), 'blue-helm-pane-status-experiment');
const BACKUP_PATH = path.join(WORK_DIR, 'claude-settings.backup');
const IDENTITY_PATH = path.join(WORK_DIR, 'identity.json');
const REPORTER_PATH = path.join(__dirname, 'pane-status-reporter.js');

function ensureWorkDir() { fs.mkdirSync(WORK_DIR, { recursive: true }); }
function sha256File(p) { return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'); }

function guard() {
  return settingsMod.createSettingsGuard({
    fs, crypto, settingsPath: SETTINGS_PATH, backupPath: BACKUP_PATH,
    log: (l) => process.stdout.write(l + '\n'),
  });
}

function cmdIdentity() {
  const g = guard();
  const id = g.captureIdentity();
  process.stdout.write(JSON.stringify({ settingsPath: SETTINGS_PATH, ...id }, null, 2) + '\n');
}

function cmdInstall() {
  // REVISION 2: refuse BEFORE writing the sidecar. Revision 1 overwrote `identity.json` with the
  // identity of an already-patched file whenever an interrupted run was followed by a second
  // `install`, destroying the record of the genuine original before the guard even ran. The sidecar
  // is a recovery artifact like the backup, so it gets the same rule: never overwrite one, tell the
  // operator to restore.
  if (fs.existsSync(IDENTITY_PATH)) {
    process.stderr.write('INSTALL REFUSED: identity-sidecar-already-exists\n');
    process.stderr.write('An earlier run did not complete. Run `node run-experiment-a.js restore` first.\n');
    process.stderr.write('Settings, identity sidecar and recovery copy were NOT modified.\n');
    process.exitCode = 1;
    return;
  }
  ensureWorkDir();
  const g = guard();
  const res = g.install(process.execPath, REPORTER_PATH, 5);
  if (!res.ok) {
    process.stderr.write(`INSTALL REFUSED: ${res.reason}\n`);
    if (res.action) process.stderr.write(`${res.action}\n`);
    process.stderr.write('Settings, identity sidecar and recovery copy were NOT modified.\n');
    process.exitCode = 1;
    return;
  }
  // Written only AFTER a successful install, so a refusal can never leave a sidecar describing a
  // file state that was never reached.
  const id = res.original;
  fs.writeFileSync(IDENTITY_PATH, JSON.stringify({ settingsPath: SETTINGS_PATH, ...id }, null, 2), 'utf8');
  process.stdout.write('INSTALLED. Structural change only (no settings contents shown):\n');
  process.stdout.write(JSON.stringify(res.change, null, 2) + '\n');
  process.stdout.write(JSON.stringify({ originalIdentity: id, backupPath: BACKUP_PATH }, null, 2) + '\n');
}

/**
 * Emit the prototype environment INTO A CHILD, never onto a console.
 *
 * REVISION 2: `listen` used to print the pipe name and the bearer token to stdout for the operator to
 * paste. That was a structural token-to-scrollback path — the reviewer counted it even though the
 * live probe never invoked it — and kill-criterion 3 ("the token appears in logs, arguments, renderer
 * state, or persistent storage") is only honestly answerable if no such path exists at all. The
 * launcher below hands the values to the child through its environment and prints nothing but the
 * variable NAMES.
 */
function spawnGatedChild(commandArgs, pipeName, token) {
  const { spawn } = require('child_process');
  const env = {
    ...process.env,
    CLAUDE_CODE_SUBPROCESS_ENV_SCRUB: '1',
    BLUE_HELM_PANE_STATUS_PROTOTYPE: '1',
    BLUE_HELM_PANE_STATUS_PIPE: pipeName,
    BLUE_HELM_PANE_STATUS_TOKEN: token,
  };
  process.stdout.write('Child launched with BLUE_HELM_PANE_STATUS_{PROTOTYPE,PIPE,TOKEN} in its environment (values not printed).\n');
  return spawn(commandArgs[0], commandArgs.slice(1), { env, stdio: 'inherit', windowsHide: true });
}

function cmdRestore() {
  if (!fs.existsSync(IDENTITY_PATH)) { process.stderr.write('No identity sidecar — nothing to restore.\n'); process.exitCode = 1; return; }
  const id = JSON.parse(fs.readFileSync(IDENTITY_PATH, 'utf8'));
  const g = settingsMod.createSettingsGuard({
    fs, crypto, settingsPath: SETTINGS_PATH, backupPath: BACKUP_PATH,
    log: (l) => process.stdout.write(l + '\n'),
  });
  // Re-seed the captured identity from the sidecar so restore works in a fresh process.
  const captured = g.captureIdentity();
  if (captured.sha256 === id.sha256 && captured.bytes === id.bytes) {
    process.stdout.write('Settings already match the original identity — nothing to restore.\n');
  }
  // Force the guard's notion of "original" to the recorded one by restoring from the backup directly.
  if (id.existed) {
    if (!fs.existsSync(BACKUP_PATH)) { process.stderr.write('RESTORE FAILED: backup missing\n'); process.exitCode = 1; return; }
    const backupBuf = fs.readFileSync(BACKUP_PATH);
    const backupSha = crypto.createHash('sha256').update(backupBuf).digest('hex');
    if (backupSha !== id.sha256) { process.stderr.write('RESTORE REFUSED: backup does not match the recorded original\n'); process.exitCode = 1; return; }
    fs.writeFileSync(SETTINGS_PATH, backupBuf);
    const afterSha = sha256File(SETTINGS_PATH);
    const afterBytes = fs.statSync(SETTINGS_PATH).size;
    const ok = afterSha === id.sha256 && afterBytes === id.bytes;
    process.stdout.write(JSON.stringify({ restored: 'bytes', ok, afterBytes, afterSha, expectedBytes: id.bytes, expectedSha: id.sha256 }, null, 2) + '\n');
    if (!ok) { process.stderr.write('RESTORE VERIFY FAILED — DO NOT PROCEED\n'); process.exitCode = 1; return; }
    fs.unlinkSync(BACKUP_PATH);
    fs.unlinkSync(IDENTITY_PATH);
    process.stdout.write('Recovery copy removed after restoration was proven.\n');
  } else {
    if (fs.existsSync(SETTINGS_PATH)) fs.unlinkSync(SETTINGS_PATH);
    const ok = !fs.existsSync(SETTINGS_PATH);
    process.stdout.write(JSON.stringify({ restored: 'absence', ok }, null, 2) + '\n');
    if (!ok) { process.exitCode = 1; return; }
    if (fs.existsSync(BACKUP_PATH)) fs.unlinkSync(BACKUP_PATH);
    fs.unlinkSync(IDENTITY_PATH);
  }
}

/**
 * Standalone listener: stands in for the Electron main process so the live experiment can be run and
 * measured without driving the GUI. It uses the SAME store and SAME server the app uses — not a
 * stand-in — so what it proves is what the app would do.
 */
function cmdListen() {
  const token = crypto.randomBytes(32).toString('hex');
  const pipeName = serverMod.buildPipeName(crypto.randomBytes(12).toString('hex'));
  const observedVersion = process.env.EXPERIMENT_CLAUDE_VERSION || null;
  const store = createPaneStatusStore({ crypto, randomToken: () => token, observedVersion });
  store.enrollPane('pty1');
  const events = [];
  const srv = serverMod.createPaneStatusServer({
    net: require('net'), store, pipeName,
    log: (l) => process.stdout.write(l + '\n'),
    onStateChange: (v) => {
      events.push({ at: new Date().toISOString(), ...v });
      process.stdout.write(`STATE ${v.paneId} -> ${v.state}${v.reason ? ' (' + v.reason + ')' : ''}\n`);
    },
  });
  const started = srv.start();
  if (!started.ok) { process.stderr.write(`LISTEN FAILED: ${started.error}\n`); process.exitCode = 1; return; }
  // REVISION 2: NOTHING about the pipe name or the token is printed. A child that needs them is
  // launched through spawnGatedChild(), which passes them in the environment. There is no operator
  // copy/paste step any more, because that step required putting a bearer token on a console.
  process.stdout.write('\nListener up. Prototype variables are handed to a child process only — never printed.\n');
  if (process.env.EXPERIMENT_CHILD_ARGV) {
    let argv = null;
    try { argv = JSON.parse(process.env.EXPERIMENT_CHILD_ARGV); } catch { argv = null; }
    if (Array.isArray(argv) && argv.length && argv.every((a) => typeof a === 'string')) {
      spawnGatedChild(argv, pipeName, token);
    } else {
      process.stderr.write('EXPERIMENT_CHILD_ARGV was set but is not a JSON array of strings — no child launched.\n');
    }
  }
  const stopAfterMs = Number(process.env.EXPERIMENT_LISTEN_MS || 300000);
  setTimeout(() => {
    srv.stop();
    process.stdout.write('\n--- EXPERIMENT SUMMARY ---\n');
    process.stdout.write(JSON.stringify({ metrics: srv.metrics(), stats: store.stats(), events }, null, 2) + '\n');
    process.exit(0);
  }, stopAfterMs);
}

const cmd = process.argv[2];
if (cmd === 'identity') cmdIdentity();
else if (cmd === 'install') cmdInstall();
else if (cmd === 'restore') cmdRestore();
else if (cmd === 'listen') cmdListen();
else {
  process.stderr.write('usage: node run-experiment-a.js identity|install|restore|listen\n');
  process.exitCode = 1;
}
