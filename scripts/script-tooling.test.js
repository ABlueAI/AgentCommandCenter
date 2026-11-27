'use strict';
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function runScript(relativePath, { stdin, argv = [], env = {}, modules }) {
  const file = path.join(__dirname, relativePath);
  const exitSignal = {};
  const result = { status: null, stdout: '', stderr: '' };
  const loader = vm.runInThisContext(
    '(function (require, process, __dirname) {\n' + fs.readFileSync(file, 'utf8').replace(/^#![^\r\n]*/, '') + '\n})',
    { filename: file },
  );
  const runtime = {
    platform: process.platform,
    argv: ['node', file, ...argv],
    env,
    stdin: new EventEmitter(),
    stdout: { write: (value) => { result.stdout += value; } },
    stderr: { write: (value) => { result.stderr += value; } },
    hrtime: { bigint: () => 0n },
    exit(status) {
      result.status = status;
      throw exitSignal;
    },
  };

  try {
    loader((id) => {
      assert(Object.hasOwn(modules, id), 'Unexpected dependency: ' + id);
      return modules[id];
    }, runtime, path.dirname(file));
    if (stdin !== undefined) {
      runtime.stdin.emit('data', JSON.stringify(stdin));
      runtime.stdin.emit('end');
    }
  } catch (error) {
    if (error !== exitSignal) throw error;
  }
  return result;
}

const fetchRequest = { tool_name: 'WebFetch', tool_input: { url: 'https://example.com/' } };
const fenceModules = { fs, path };
const admitted = runScript('hooks/fence-write.js', {
  stdin: fetchRequest,
  env: { BLUE_HELM_CONTROLLED_WEBFETCH_MODE: 'https://example.com' },
  modules: fenceModules,
});
assert.equal(admitted.status, 0);
assert.equal(admitted.stderr, '');

const refused = runScript('hooks/fence-write.js', {
  stdin: fetchRequest,
  modules: fenceModules,
});
assert.equal(refused.status, 2);
assert.match(refused.stderr, /\[fence-webfetch-denied\]/);
console.log('fence-write behavior passed');

const root = path.join('fixture', 'chain-perf-root');
const app = path.join(__dirname, '..', 'app');
const electron = path.join(app, 'node_modules', 'electron', 'dist', 'electron.exe');
const hookCalls = [];
const removed = [];
const benchmark = runScript('pane-status-chain-perf.js', {
  argv: ['2'],
  env: { BLUE_HELM_PANE_STATUS_PIPE: 'fixture', ELECTRON_RUN_AS_NODE: '1' },
  modules: {
    path,
    os: { tmpdir: () => 'fixture' },
    fs: {
      existsSync: (file) => file === electron,
      mkdtempSync: () => root,
      mkdirSync: () => {},
      writeFileSync: () => {},
      rmSync: (dir) => removed.push(dir),
    },
    child_process: {
      spawnSync(exe, args, options) {
        if (exe === 'fixture-powershell') return { status: 0, stdout: '1 0' };
        assert.equal(exe, 'fixture-cmd');
        assert.deepEqual(args, ['mock-hook']);
        hookCalls.push(options);
        return { status: 0, stdout: 'unexpected fixture output' };
      },
    },
    [path.join(app, 'pane-status', 'pane-status-runtime-shim')]: {
      validateShimPath: () => ({ ok: true }),
      buildShimContent: () => 'mock shim',
      resolveCmdExe: () => 'fixture-cmd',
      buildHookArgs: () => ['mock-hook'],
    },
    [path.join(app, 'pane-status', 'pane-status-lock')]: {
      resolveWindowsPowerShellPath: () => ({ ok: true, path: 'fixture-powershell' }),
    },
  },
});
assert.equal(benchmark.status, 1);
assert.match(benchmark.stdout, /stdout escaped\s+: 2 of 2/);
assert.equal(hookCalls.length, 2);
for (const call of hookCalls) {
  assert.equal(call.cwd, root);
  assert.equal(call.env.BLUE_HELM_PANE_STATUS_PIPE, undefined);
  assert.equal(call.env.ELECTRON_RUN_AS_NODE, undefined);
}
assert.deepEqual(removed, [root]);
console.log('pane-status-chain-perf behavior passed');
