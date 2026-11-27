'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const { test } = require('node:test');

const benchmarkPath = path.join(__dirname, 'pane-status-chain-perf.js');

function runBenchmark(before, after) {
  // Run the CLI in a child so its real exit status is observable. Stub the Windows-only
  // dependencies in that child, and let the benchmark create and clean its own temp files.
  const fixture = String.raw`
    const [scriptPath, fixtures] = process.argv.slice(1);
    const requireFromScript = require('node:module').createRequire(scriptPath);
    const fs = require('node:fs');
    const existsSync = fs.existsSync;
    fs.existsSync = (file) => String(file).endsWith('electron.exe') || existsSync(file);
    const shim = requireFromScript('../app/pane-status/pane-status-runtime-shim');
    shim.validateShimPath = () => ({ ok: true });
    shim.buildShimContent = () => '';
    shim.resolveCmdExe = () => 'fixture-cmd';
    shim.buildHookArgs = () => [];
    const lock = requireFromScript('../app/pane-status/pane-status-lock');
    lock.resolveWindowsPowerShellPath = () => ({ ok: true, path: 'fixture-powershell' });
    const censuses = JSON.parse(fixtures);
    require('node:child_process').spawnSync = (file) => {
      if (file === 'fixture-powershell') return censuses.shift();
      if (file !== 'fixture-cmd') throw new Error('Unexpected child process');
      return { status: 0, stdout: '', stderr: '' };
    };
    process.argv[2] = '1';
    require(scriptPath);
  `;
  const result = spawnSync(process.execPath, ['-e', fixture, benchmarkPath, JSON.stringify([before, after])], {
    encoding: 'utf8', timeout: 10000,
  });
  assert.ifError(result.error);
  return result;
}

const valid = { status: 0, stdout: '0 0\n', stderr: '' };
const unparseable = { status: 0, stdout: 'unexpected\n', stderr: '' };
const unsuccessful = { status: 7, stdout: '0 0\n', stderr: 'census failed' };
const timedOut = { status: null, error: { code: 'ETIMEDOUT' }, stdout: '0 0\n', stderr: '' };
const reportedError = { status: 0, stdout: '0 0\n', stderr: 'census failed' };

for (const [name, before, after] of [
  ['before census is unparseable', unparseable, valid],
  ['after census is unparseable', valid, unparseable],
  ['after census exits nonzero with count output', valid, unsuccessful],
  ['after census times out with count output', valid, timedOut],
  ['after census reports an error alongside count output', valid, reportedError],
]) {
  test(`fails visibly when the ${name}`, () => {
    const result = runBenchmark(before, after);
    assert.equal(result.status, 1, result.stderr || result.stdout);
    assert.match(result.stdout, /process census\s*:\s*UNAVAILABLE/);
  });
}

test('succeeds when both censuses and the hook run succeed', () => {
  const result = runBenchmark(valid, valid);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /electron procs\s*:\s*0 before -> 0 after/);
});
