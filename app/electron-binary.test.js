'use strict';
// Run: node app/electron-binary.test.js
//
// The desktop shortcut starts app\node_modules\electron\dist\electron.exe directly. Electron 42
// downloads that binary lazily, so `npm ci` alone left the shortcut with nothing to start. This
// checks the postinstall that fixes it is wired up, that its check and failure paths behave, and
// that this install really has the binary. It runs first in `npm test`, before any test that calls
// require('electron') (which would quietly download the binary and hide a broken postinstall).

const fs = require('fs');
const os = require('os');
const path = require('path');
const { checkElectronBinary, ensureElectronBinary } = require('./ensure-electron-binary');

let passed = 0, failed = 0;
function assert(cond, label) {
  if (cond) { process.stdout.write(`  ✓ ${label}\n`); passed++; }
  else { process.stderr.write(`  ✗ FAIL: ${label}\n`); failed++; }
}

const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));
assert(pkg.scripts && pkg.scripts.postinstall === 'node ensure-electron-binary.js',
  `package.json runs ensure-electron-binary.js as postinstall (got ${JSON.stringify(pkg.scripts && pkg.scripts.postinstall)})`);

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mako-electron-binary-'));
function fakeElectron(name, { version = '42.5.0', pathTxt, exe, distVersion, installJs } = {}) {
  const dir = path.join(tmpRoot, name);
  fs.mkdirSync(path.join(dir, 'dist'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'electron', version }));
  if (pathTxt !== undefined) fs.writeFileSync(path.join(dir, 'path.txt'), pathTxt);
  if (exe) fs.writeFileSync(path.join(dir, 'dist', exe), '');
  if (distVersion !== undefined) fs.writeFileSync(path.join(dir, 'dist', 'version'), distVersion);
  if (installJs !== undefined) fs.writeFileSync(path.join(dir, 'install.js'), installJs);
  return dir;
}

try {
  {
    const r = checkElectronBinary(path.join(tmpRoot, 'absent'));
    assert(!r.ok && /not installed/.test(r.reason), 'no electron package: reported as not installed');
  }
  {
    const r = checkElectronBinary(fakeElectron('never-downloaded'));
    assert(!r.ok && /never downloaded/.test(r.reason), 'fresh `npm ci` state (no path.txt): reported as never downloaded');
  }
  {
    const r = checkElectronBinary(fakeElectron('exe-gone', { pathTxt: 'electron.exe', distVersion: 'v42.5.0' }));
    assert(!r.ok && /binary is missing/.test(r.reason) && r.reason.includes('electron.exe'), 'path.txt but no executable: names the missing file');
  }
  {
    const r = checkElectronBinary(fakeElectron('stale', { pathTxt: 'electron.exe', exe: 'electron.exe', distVersion: 'v41.0.0' }));
    assert(!r.ok && /41\.0\.0/.test(r.reason) && /42\.5\.0/.test(r.reason), 'leftover binary from another version: reported, both versions named');
  }
  {
    const dir = fakeElectron('good', { pathTxt: 'electron.exe', exe: 'electron.exe', distVersion: 'v42.5.0' });
    const r = checkElectronBinary(dir);
    assert(r.ok && r.exe === path.join(dir, 'dist', 'electron.exe'), 'complete install: ok, exe is dist/electron.exe');
  }
  {
    const r = ensureElectronBinary(fakeElectron('no-install-js'));
    assert(!r.ok && /devDependencies/.test(r.reason), 'ensure without install.js (devDependencies omitted): fails, not skipped');
  }
  {
    const r = ensureElectronBinary(fakeElectron('install-fails', { installJs: 'process.exit(3);' }));
    assert(!r.ok && /exited with 3/.test(r.reason), 'ensure when install.js fails (offline, proxy): fails with its exit code');
  }
  {
    const r = ensureElectronBinary(fakeElectron('install-lies', { installJs: '' }));
    assert(!r.ok && /never downloaded/.test(r.reason), 'ensure when install.js exits 0 but leaves no binary: still fails');
  }
  {
    const installJs = "const fs=require('fs');fs.writeFileSync('path.txt','electron.exe');"
      + "fs.writeFileSync('dist/electron.exe','');fs.writeFileSync('dist/version','v42.5.0');";
    const r = ensureElectronBinary(fakeElectron('install-works', { installJs }));
    assert(r.ok, 'ensure when install.js downloads the binary: ok');
  }
} finally {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
}

{
  const r = checkElectronBinary();
  assert(r.ok, r.ok
    ? `this install has its Electron binary (${r.exe})`
    : `this install has its Electron binary: ${r.reason}. Run \`npm ci\` in app/ without --ignore-scripts (or \`node ensure-electron-binary.js\`)`);
  if (r.ok && process.platform === 'win32') {
    assert(path.basename(r.exe) === 'electron.exe', 'on Windows the binary is dist\\electron.exe, the file the desktop shortcut targets');
  }
}

process.stdout.write(`\nelectron-binary: ${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
