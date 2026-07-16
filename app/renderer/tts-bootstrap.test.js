// Run: node app/renderer/tts-bootstrap.test.js
//
// Plain Node.js — no test framework, no build step (matches pty-parser.test.js).
// Exit 0 = all pass. Exit 1 = at least one failure.
//
// Covers the pure webgpu->wasm bootstrap-contract logic in isolation from the browser
// and the real (network-fetching) Kokoro model.

import { bootstrapModel } from './tts-bootstrap.js';

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    process.stdout.write(`  ✓ ${label}\n`);
    passed++;
  } else {
    process.stderr.write(`  ✗ FAIL: ${label}\n`);
    failed++;
  }
}

async function assertThrows(fn, label) {
  try {
    await fn();
    assert(false, `${label} (did not throw)`);
    return null;
  } catch (e) {
    assert(true, label);
    return e;
  }
}

function section(name) { process.stdout.write(`\n${name}\n`); }

// ══════════════════════════════════════════════════════════════════════════════
section('Success on first device (webgpu) — no fallback noise');
// ══════════════════════════════════════════════════════════════════════════════

{
  const statuses = [];
  let selected = '';
  const model = { id: 'fake-model' };
  const result = await bootstrapModel(
    async (device) => { assert(device === 'webgpu', 'first attempt requests webgpu'); return model; },
    { onStatus: (state, detail) => statuses.push({ state, detail }), onSelected: (device) => { selected = device; } },
  );
  assert(result === model, 'resolves with the loaded model');
  assert(statuses.length === 0, 'no status events fired when webgpu succeeds immediately');
  assert(selected === 'webgpu', 'reports the backend that actually initialized');
}

// ══════════════════════════════════════════════════════════════════════════════
section('Success via fallback (webgpu fails, wasm succeeds) — fallback is visible');
// ══════════════════════════════════════════════════════════════════════════════

{
  const statuses = [];
  let selected = '';
  const model = { id: 'fake-model-wasm' };
  const attempted = [];
  const result = await bootstrapModel(
    async (device) => {
      attempted.push(device);
      if (device === 'webgpu') throw new Error('WebGPU not supported');
      return model;
    },
    { onStatus: (state, detail) => statuses.push({ state, detail }), onSelected: (device) => { selected = device; } },
  );
  assert(result === model, 'resolves with the wasm model after webgpu fails');
  assert(attempted.join(',') === 'webgpu,wasm', 'tries webgpu then wasm, in order');
  assert(statuses.length === 1, 'exactly one status event reports the fallback');
  assert(statuses[0].state === 'loading', 'fallback status is a loading state, not silent');
  assert(/webgpu/.test(statuses[0].detail) && /wasm/.test(statuses[0].detail),
    'fallback detail names both the failed and the attempted device');
  assert(selected === 'wasm', 'reports WASM when the fallback initializes');
}

// ══════════════════════════════════════════════════════════════════════════════
section('Failure on every device is visible, not silent');
// ══════════════════════════════════════════════════════════════════════════════

{
  const statuses = [];
  const err = await assertThrows(
    () => bootstrapModel(
      async (device) => { throw new Error(`${device} boom`); },
      { onStatus: (state, detail) => statuses.push({ state, detail }) },
    ),
    'throws when every device fails (never resolves to a broken/falsy model)',
  );
  assert(err instanceof Error, 'rejection is an Error');
  assert(/webgpu boom/.test(err.message) && /wasm boom/.test(err.message),
    'error message names every device that was tried and why each failed');
  assert(!statuses.some((s) => s.state === 'idle' || s.state === 'speaking'),
    'never reports a ready/usable state when bootstrap fails outright');
}

// ══════════════════════════════════════════════════════════════════════════════
section('A loader that resolves falsy is treated as a failure, not success');
// ══════════════════════════════════════════════════════════════════════════════

{
  const err = await assertThrows(
    () => bootstrapModel(async () => null),
    'throws instead of returning a null "model"',
  );
  assert(/webgpu/.test(err.message) && /wasm/.test(err.message),
    'still reports both attempted devices even when the loader resolves falsy');
}

// ══════════════════════════════════════════════════════════════════════════════
// Results
// ══════════════════════════════════════════════════════════════════════════════

process.stdout.write(`\n${passed + failed} tests: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
