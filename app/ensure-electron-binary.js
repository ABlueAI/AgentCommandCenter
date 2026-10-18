'use strict';
// Run: node ensure-electron-binary.js   (from app/; npm runs it as "postinstall")
//
// Electron 42 no longer downloads its binary at install time: node_modules/electron has no install
// script and fetches dist/ lazily the first time something calls require('electron') (`npm start`
// does). The Mako desktop shortcut starts app\node_modules\electron\dist\electron.exe directly, so
// after a plain `npm ci` it had nothing to start (found 2026-10-18). This runs Electron's own
// install.js right after install, then checks the binary is really there. Any failure exits
// non-zero, so `npm ci` fails visibly instead of leaving a Mako that silently won't open.
//
// npm 11's allow-scripts gate applies to dependencies' scripts, not to this project's own
// "postinstall", so this still runs under `npm ci` (checked with npm 11.16.0 on 2026-10-18).
// `--ignore-scripts` skips it; electron-binary.test.js then fails at the top of `npm test`.

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const DEFAULT_ELECTRON_DIR = path.join(__dirname, 'node_modules', 'electron');

// Same three facts Electron's install.js checks in isInstalled(): dist/version matches the package
// version, path.txt names the executable, and that executable exists under dist/.
function checkElectronBinary(electronDir = DEFAULT_ELECTRON_DIR) {
  let version;
  try {
    version = JSON.parse(fs.readFileSync(path.join(electronDir, 'package.json'), 'utf8')).version;
  } catch {
    return { ok: false, reason: `electron is not installed (no package.json in ${electronDir})` };
  }
  let exeName;
  try {
    exeName = fs.readFileSync(path.join(electronDir, 'path.txt'), 'utf8').trim();
  } catch {
    return { ok: false, reason: `Electron ${version} binary was never downloaded (no path.txt)` };
  }
  const exe = path.join(electronDir, 'dist', exeName);
  if (!fs.existsSync(exe)) {
    return { ok: false, reason: `Electron ${version} binary is missing: ${exe}` };
  }
  let distVersion = '';
  try { distVersion = fs.readFileSync(path.join(electronDir, 'dist', 'version'), 'utf8').trim().replace(/^v/, ''); } catch {}
  if (distVersion !== version) {
    return { ok: false, reason: `Electron binary is version "${distVersion}", package is ${version}: ${exe}` };
  }
  return { ok: true, exe, version };
}

function ensureElectronBinary(electronDir = DEFAULT_ELECTRON_DIR) {
  const installJs = path.join(electronDir, 'install.js');
  if (!fs.existsSync(installJs)) {
    return { ok: false, reason: `electron is not installed (no ${installJs}); Mako needs its devDependencies` };
  }
  const run = spawnSync(process.execPath, [installJs], { cwd: electronDir, stdio: 'inherit' });
  if (run.error) return { ok: false, reason: `could not run Electron's install.js: ${run.error.message}` };
  if (run.status !== 0) return { ok: false, reason: `Electron's install.js exited with ${run.status}` };
  return checkElectronBinary(electronDir);
}

module.exports = { checkElectronBinary, ensureElectronBinary };

if (require.main === module) {
  const result = ensureElectronBinary();
  if (!result.ok) {
    process.stderr.write(`ensure-electron-binary: FAILED: ${result.reason}\n`
      + 'The Mako desktop shortcut needs this binary. Fix the cause, then run `npm ci` in app/ again.\n');
    process.exit(1);
  }
  process.stdout.write(`ensure-electron-binary: Electron ${result.version} ready at ${result.exe}\n`);
}
