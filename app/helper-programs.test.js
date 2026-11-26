'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

function productionSources(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return ['node_modules', 'vendor'].includes(entry.name) ? [] : productionSources(file);
    }
    return /\.(?:[cm]?[jt]s|[jt]sx)$/.test(entry.name) && !/\.test\.[cm]?[jt]s$/.test(entry.name)
      ? [file] : [];
  });
}

test('all app helper launches use the shared process boundary', () => {
  const direct = [];
  for (const file of productionSources(__dirname)) {
    const rel = path.relative(__dirname, file).split(path.sep).join('/');
    if (rel === 'helper-programs.js') continue;
    const source = fs.readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\/|^\s*\/\/.*$/gm, '');
    if (/['"](?:node:)?child_process['"]/.test(source)) direct.push(rel + ' imports child_process');
    if (/['"]@lydell\/node-pty['"]/.test(source) && rel !== 'main.js') direct.push(rel + ' imports node-pty');
    const ptyCalls = source.match(/\bpty\.spawn\s*\(/g) || [];
    if (ptyCalls.length !== (rel === 'main.js' ? 1 : 0)) direct.push(rel + ' has unexpected PTY launches');
  }
  assert.deepEqual(direct, []);
});

test('Windows tools resolve once from System32 and installed tools never consult PATH', () => {
  const { createHelperPrograms } = require('./helper-programs');
  const system32 = 'X:\\OS\\System32';
  const files = new Set([
    system32 + '\\WindowsPowerShell\\v1.0\\powershell.exe',
    system32 + '\\taskkill.exe', system32 + '\\reg.exe', system32 + '\\where.exe',
    'Y:\\Programs\\Git\\cmd\\git.exe', 'Y:\\Programs\\GitHub CLI\\gh.exe',
    'Y:\\Programs\\nodejs\\node.exe',
  ]);
  const checked = [];
  const helpers = createHelperPrograms({
    platform: 'win32',
    env: { SYSTEMROOT: 'X:\\OS', ProgramFiles: 'Y:\\Programs', Path: 'Z:\\Worktree;' },
    isExecutable(file) { checked.push(file); return files.has(file); },
  });
  for (const [name, file] of [
    ['powershell', system32 + '\\WindowsPowerShell\\v1.0\\powershell.exe'],
    ['taskkill', system32 + '\\taskkill.exe'], ['reg', system32 + '\\reg.exe'],
    ['where', system32 + '\\where.exe'], ['git', 'Y:\\Programs\\Git\\cmd\\git.exe'],
    ['gh', 'Y:\\Programs\\GitHub CLI\\gh.exe'], ['node', 'Y:\\Programs\\nodejs\\node.exe'],
  ]) {
    assert.equal(helpers.path(name), file);
    const count = checked.length;
    assert.equal(helpers.path(name), file);
    assert.equal(checked.length, count);
  }
  assert.throws(() => helpers.path('wt'), { code: 'wt-not-found' });
  const count = checked.length;
  assert.throws(() => helpers.path('wt'), { code: 'wt-not-found' });
  assert.equal(checked.length, count);
  assert.ok(checked.every((file) => !file.startsWith('Z:')));
});

test('invalid install roots and missing executables are refused', () => {
  const { createHelperPrograms } = require('./helper-programs');
  const helpers = createHelperPrograms({
    platform: 'win32',
    env: { SystemRoot: '\\OS', ProgramFiles: 'relative', LOCALAPPDATA: 'Z:\\User\\..\\Other' },
    isExecutable() { assert.fail('An invalid root must never be searched'); },
  });
  for (const name of ['powershell', 'taskkill', 'reg', 'where', 'git', 'gh', 'node', 'code', 'wt', 'firefox', 'claude', 'ffmpeg', 'ffprobe', 'yt-dlp']) {
    assert.throws(() => helpers.path(name), { code: name + '-not-found' });
  }
});

test('the launch boundary rejects bare names and shell options and preserves discrete arguments', () => {
  const { createHelperPrograms } = require('./helper-programs');
  const calls = [];
  const childProcess = Object.fromEntries(['spawn', 'spawnSync', 'execFile', 'execFileSync']
    .map((method) => [method, (...args) => { calls.push([method, ...args]); }]));
  const helpers = createHelperPrograms({ platform: 'win32', childProcess });
  const fullPath = 'X:\\Tools\\helper.exe';
  const args = ['a folder with spaces', '%literal%', 'text & more'];
  for (const method of Object.keys(childProcess)) {
    assert.throws(() => helpers[method]('helper.exe', args, {}), { code: 'helper-path-invalid' });
    assert.throws(() => helpers[method]('\\tool.exe', args, {}), { code: 'helper-path-invalid' });
    assert.throws(() => helpers[method]('X:\\Tools\\helper.cmd', args, {}), { code: 'helper-path-invalid' });
    assert.throws(() => helpers[method](fullPath, 'one string', {}), { code: 'helper-args-invalid' });
    assert.throws(() => helpers[method](fullPath, args, { shell: true }), { code: 'helper-shell-forbidden' });
    assert.throws(() => helpers[method](fullPath, args, { shell: 'cmd' }), { code: 'helper-shell-forbidden' });
    assert.throws(() => helpers[method](fullPath, args, { windowsVerbatimArguments: true }), { code: 'helper-shell-forbidden' });
  }
  assert.deepEqual(calls, []);
  const cb = () => {};
  helpers.execFile(fullPath, args, { windowsHide: true }, cb);
  assert.deepEqual(calls, [['execFile', fullPath, args, { windowsHide: true, shell: false }, cb]]);
});
