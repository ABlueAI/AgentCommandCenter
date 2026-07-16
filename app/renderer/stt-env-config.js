// The STT Transformers/ONNX environment contract, pulled out of stt.js so it is directly
// unit-testable without a browser or network (mirrors tts-device-config.js's role for TTS).
//
// Why each setting:
//   allowLocalModels=false  — models come from the Hugging Face hub (Chromium caches them);
//                             there is no local model directory in this app.
//   allowRemoteModels=true  — explicit, so a future bundle default change cannot silently
//                             strand first-use downloads.
//   wasmPaths (pinned CDN)  — the ONNX WASM binaries are fetched from jsdelivr at the SAME
//                             version as the bundled runtime; fetch() of file:// is blocked
//                             from a file:// page, so a local path is not an option (same
//                             reasoning as the Kokoro/TTS setup).
//   numThreads=1            — this file:// renderer is never crossOriginIsolated, so
//                             multi-threaded WASM (SharedArrayBuffer) is unavailable anyway;
//                             pinning 1 avoids a misleading capability probe.
//   proxy=false             — no worker proxy; keeps inference in-renderer and compatible
//                             with the app's CSP worker policy.
//
// The refusal: the official standalone browser bundle exposes ONNX Runtime's env at
// env.backends.onnx (with .wasm). A distribution where that is missing (e.g. the bare-import
// transformers.web.min.js this repairs away from, or the web bundle evaluated outside a
// browser) cannot honor this contract — refuse loudly instead of configuring a phantom.

export const TRANSFORMERS_VERSION = '3.8.1';
export const STT_WASM_PATHS = `https://cdn.jsdelivr.net/npm/@huggingface/transformers@${TRANSFORMERS_VERSION}/dist/`;

export function configureSttEnv(env) {
  if (!env || typeof env !== 'object') {
    throw new Error('STT bootstrap refused: the transformers bundle did not export an env object.');
  }
  const wasm = env.backends && env.backends.onnx && env.backends.onnx.wasm;
  if (!wasm) {
    throw new Error('STT bootstrap refused: env.backends.onnx.wasm is missing — this is not the official standalone @huggingface/transformers browser bundle (or it is running outside a browser).');
  }
  env.allowLocalModels = false;
  env.allowRemoteModels = true;
  wasm.wasmPaths = STT_WASM_PATHS;
  wasm.numThreads = 1;
  wasm.proxy = false;
  return env;
}
