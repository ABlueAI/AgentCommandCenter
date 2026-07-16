// Kokoro model settings for the browser backends we support.
// Kokoro 1.2.1 recommends fp32 on WebGPU; WASM remains q8 to keep its local
// CPU path smaller. Keeping this pure makes the integration contract testable.
export function getKokoroLoadOptions(device) {
  if (device === 'webgpu') return { device, dtype: 'fp32' };
  if (device === 'wasm') return { device, dtype: 'q8' };
  throw new Error(`Unsupported Kokoro device: ${device}`);
}
