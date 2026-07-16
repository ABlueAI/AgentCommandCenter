// Run: node app/renderer/stt-env-config.test.js
//
// Plain Node.js — no test framework (matches pty-parser.test.js). Exit 0 = all pass.
// Proves the exact Transformers/ONNX environment contract the STT module must apply,
// and that a wrong/incomplete distribution is refused loudly instead of half-configured.

import { configureSttEnv, STT_WASM_PATHS, TRANSFORMERS_VERSION } from './stt-env-config.js';

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) { process.stdout.write(`  ✓ ${label}\n`); passed++; }
  else { process.stderr.write(`  ✗ FAIL: ${label}\n`); failed++; }
}

function section(name) { process.stdout.write(`\n${name}\n`); }

function makeEnv() {
  return { existing: 'untouched', backends: { onnx: { wasm: {} } } };
}

// ══════════════════════════════════════════════════════════════════════════════
section('Pinned version and WASM CDN path');
// ══════════════════════════════════════════════════════════════════════════════

assert(TRANSFORMERS_VERSION === '3.8.1', 'contract is pinned to transformers 3.8.1 (the locked dependency version)');
assert(STT_WASM_PATHS === 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/dist/',
  'wasmPaths points at the jsdelivr dist for EXACTLY the bundled version');

// ══════════════════════════════════════════════════════════════════════════════
section('configureSttEnv applies the exact contract');
// ══════════════════════════════════════════════════════════════════════════════

{
  const env = makeEnv();
  const returned = configureSttEnv(env);
  assert(returned === env, 'returns the same env object it configured');
  assert(env.allowLocalModels === false, 'allowLocalModels = false');
  assert(env.allowRemoteModels === true, 'allowRemoteModels = true');
  assert(env.backends.onnx.wasm.wasmPaths === STT_WASM_PATHS, 'wasm.wasmPaths = pinned CDN dist path');
  assert(env.backends.onnx.wasm.numThreads === 1, 'wasm.numThreads = 1 (file:// is never crossOriginIsolated)');
  assert(env.backends.onnx.wasm.proxy === false, 'wasm.proxy = false (no worker proxy)');
  assert(env.existing === 'untouched', 'unrelated env fields are left alone');
}

// ══════════════════════════════════════════════════════════════════════════════
section('Wrong or incomplete distributions are refused, not half-configured');
// ══════════════════════════════════════════════════════════════════════════════

function assertThrows(fn, match, label) {
  try { fn(); assert(false, `${label} (did not throw)`); }
  catch (e) { assert(match.test(e.message), `${label} — threw: ${e.message.slice(0, 120)}`); }
}

assertThrows(() => configureSttEnv(null), /did not export an env/, 'null env is refused');
assertThrows(() => configureSttEnv({}), /env\.backends\.onnx\.wasm is missing/, 'env without backends is refused');
assertThrows(() => configureSttEnv({ backends: {} }), /env\.backends\.onnx\.wasm is missing/, 'env without backends.onnx is refused');
assertThrows(() => configureSttEnv({ backends: { onnx: {} } }), /env\.backends\.onnx\.wasm is missing/,
  'env without backends.onnx.wasm is refused (the transformers.web.min.js / non-browser failure shape)');

{
  const env = { backends: { onnx: {} } };
  try { configureSttEnv(env); } catch {}
  assert(env.allowLocalModels === undefined, 'a refused env is not partially configured (refusal comes first)');
}

// ══════════════════════════════════════════════════════════════════════════════
process.stdout.write(`\n${passed + failed} tests: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
