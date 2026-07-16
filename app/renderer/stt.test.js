// Run: node app/renderer/stt.test.js
//
// Plain Node.js — no test framework (matches tts.test.js). Exit 0 = all pass.
//
// Imports the REAL official @huggingface/transformers standalone browser bundle (the
// declared 3.8.1 dependency) and the REAL stt.js against it, in a minimal window stub.
// This is the regression test for the packaging failure that made Dictate a hollow
// control: stt.js used to import ./vendor/transformers.web.min.js, which does not exist,
// so the module died at import time and window.ccSTT was never assigned.
//
// NO network access and NO model download: nothing here calls toggle()/pipeline(), so
// the model is never fetched — only module loading and the environment contract run.
// NO recorded audio or transcript text appears anywhere in this file's assertions.

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) { process.stdout.write(`  ✓ ${label}\n`); passed++; }
  else { process.stderr.write(`  ✗ FAIL: ${label}\n`); failed++; }
}

function section(name) { process.stdout.write(`\n${name}\n`); }

// --- minimal window stub (stt.js needs EventTarget + CustomEvent at import time) -----
const win = new EventTarget();
global.window = win;
let readyFired = false;
win.addEventListener('cc-stt-ready', () => { readyFired = true; });

// ══════════════════════════════════════════════════════════════════════════════
section('The official packaged browser bundle exists and exposes the API');
// ══════════════════════════════════════════════════════════════════════════════

let bundle = null;
let bundleError = null;
try {
  // Same specifier stt.js uses (relative to renderer/), so this is the same module
  // instance stt.js will receive below.
  bundle = await import('../node_modules/@huggingface/transformers/dist/transformers.min.js');
} catch (e) {
  bundleError = e;
}
assert(bundleError === null,
  `transformers.min.js imports cleanly${bundleError ? ' — threw: ' + bundleError.message : ''}`);
assert(!!bundle && typeof bundle.pipeline === 'function', 'the bundle exposes pipeline()');
assert(!!bundle && !!bundle.env && typeof bundle.env === 'object', 'the bundle exposes env');

// Node reality check: the WEB bundle stubs out onnxruntime-node, so under plain Node
// env.backends.onnx is undefined — exactly the shape configureSttEnv REFUSES. In the
// Electron renderer (sandboxed, no `process` global) the bundle takes its browser path
// and env.backends.onnx is ONNX Runtime Web's env, which has .wasm. To exercise the real
// stt.js import end-to-end here, graft a browser-shaped stand-in BEFORE importing it.
const onnxUnderNode = bundle.env.backends && bundle.env.backends.onnx;
assert(!(onnxUnderNode && onnxUnderNode.wasm),
  'under plain Node the web bundle has no onnx.wasm env (documents why the graft below exists)');
bundle.env.backends.onnx = { wasm: {} };

// ══════════════════════════════════════════════════════════════════════════════
section('Importing the REAL stt.js against the real bundle');
// ══════════════════════════════════════════════════════════════════════════════

let importError = null;
try {
  await import('./stt.js');
} catch (e) {
  importError = e;
}
assert(importError === null,
  `stt.js imports without throwing${importError ? ' — threw: ' + importError.message : ''}`);
assert(readyFired, 'cc-stt-ready fires once the module has loaded');
assert(typeof window.ccSTT === 'object' && window.ccSTT !== null,
  'window.ccSTT is assigned (the original bug left this permanently undefined)');
assert(typeof window.ccSTT.toggle === 'function', 'ccSTT.toggle is exposed');
assert(typeof window.ccSTT.isRecording === 'function' && window.ccSTT.isRecording() === false,
  'ccSTT.isRecording is exposed and starts false');
assert(typeof window.ccSTT.isBusy === 'function' && window.ccSTT.isBusy() === false,
  'ccSTT.isBusy is exposed and starts false');
assert(typeof window.ccSTT.onStatus === 'function', 'ccSTT.onStatus is exposed');
assert(typeof window.ccSTT.onResult === 'function', 'ccSTT.onResult is exposed');
assert(window.ccSTT.getBackend() === '', 'no backend is claimed before any pipeline has resolved');

// ══════════════════════════════════════════════════════════════════════════════
section('stt.js applied the exact environment contract to the real env');
// ══════════════════════════════════════════════════════════════════════════════

const { STT_WASM_PATHS } = await import('./stt-env-config.js');
assert(bundle.env.allowLocalModels === false, 'env.allowLocalModels = false');
assert(bundle.env.allowRemoteModels === true, 'env.allowRemoteModels = true');
assert(bundle.env.backends.onnx.wasm.wasmPaths === STT_WASM_PATHS,
  'env.backends.onnx.wasm.wasmPaths = the pinned 3.8.1 jsdelivr dist');
assert(bundle.env.backends.onnx.wasm.numThreads === 1, 'env.backends.onnx.wasm.numThreads = 1');
assert(bundle.env.backends.onnx.wasm.proxy === false, 'env.backends.onnx.wasm.proxy = false');

// ══════════════════════════════════════════════════════════════════════════════
process.stdout.write(`\n${passed + failed} tests: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
