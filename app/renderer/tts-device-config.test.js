// Run: node app/renderer/tts-device-config.test.js
import { getKokoroLoadOptions } from './tts-device-config.js';

let passed = 0;
let failed = 0;
function assert(condition, label) {
  if (condition) { process.stdout.write(`  PASS ${label}\n`); passed++; }
  else { process.stderr.write(`  FAIL ${label}\n`); failed++; }
}

{
  const options = getKokoroLoadOptions('webgpu');
  assert(options.device === 'webgpu' && options.dtype === 'fp32', 'WebGPU uses Kokoro recommended fp32 model');
}
{
  const options = getKokoroLoadOptions('wasm');
  assert(options.device === 'wasm' && options.dtype === 'q8', 'WASM uses compact q8 model');
}
try {
  getKokoroLoadOptions('cpu');
  assert(false, 'unknown devices refuse');
} catch (error) {
  assert(/Unsupported Kokoro device: cpu/.test(error.message), 'unknown devices refuse visibly');
}

process.stdout.write(`\n${passed + failed} tests: ${passed} passed, ${failed} failed\n`);
if (failed) process.exit(1);
