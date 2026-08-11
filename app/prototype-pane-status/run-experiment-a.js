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

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const settingsMod = require('./pane-status-settings');
const serverMod = require('./pane-status-server');
const { createPaneStatusStore } = require('./pane-status-store');
const protocol = require('./pane-status-protocol');

const SETTINGS_PATH = path.join(os.homedir(), '.claude', 'settings.json');
const WORK_DIR = path.join(os.tmpdir(), 'blue-helm-pane-status-experiment');
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
  ensureWorkDir();
  const g = guard();
  const id = g.captureIdentity();
  fs.writeFileSync(IDENTITY_PATH, JSON.stringify({ settingsPath: SETTINGS_PATH, ...id }, null, 2), 'utf8');
  const res = g.install(process.execPath, REPORTER_PATH, 5);
  if (!res.ok) {
    process.stderr.write(`INSTALL REFUSED: ${res.reason}\n`);
    process.exitCode = 1;
    return;
  }
  process.stdout.write('INSTALLED. Structural change only (no settings contents shown):\n');
  process.stdout.write(JSON.stringify(res.change, null, 2) + '\n');
  process.stdout.write(JSON.stringify({ originalIdentity: id, backupPath: BACKUP_PATH }, null, 2) + '\n');
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
  // These two lines are the ONLY place the token is printed, and only into the builder's own console
  // for the manual launch step. It is never written to a file, a log, or Claude's settings.
  process.stdout.write(`\nSet these in the Claude pane's environment, then launch claude there:\n`);
  process.stdout.write(`  $env:BLUE_HELM_PANE_STATUS_PROTOTYPE='1'\n`);
  process.stdout.write(`  $env:BLUE_HELM_PANE_STATUS_PIPE='${pipeName}'\n`);
  process.stdout.write(`  $env:BLUE_HELM_PANE_STATUS_TOKEN='${token}'\n\n`);
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
