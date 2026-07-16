// Kokoro TTS bootstrap contract — the webgpu-then-wasm device fallback — pulled out of
// tts.js so it can be unit-tested without a browser, a real KokoroTTS model, or network
// access. tts.js supplies the real loader; tests supply stubs.

// Try loading the model in device order webgpu -> wasm. `loadFn(device)` returns a
// Promise<model>. Reports the webgpu->wasm fallback transition via onStatus(state, detail)
// — the same two-arg shape as tts.js's setStatus — so the existing status/Logs contract
// stays honest while a fallback is in flight, then either resolves with the model or
// throws a descriptive error listing every device that failed — it never resolves to a
// falsy/partial model, so callers can't mistake a failed bootstrap for a usable one.
export async function bootstrapModel(loadFn, { onStatus, onSelected, devices = ['webgpu', 'wasm'] } = {}) {
  const errors = [];
  for (let i = 0; i < devices.length; i++) {
    const device = devices[i];
    if (i > 0 && onStatus) {
      onStatus('loading', `${devices[i - 1]} unavailable — using ${device}…`);
    }
    try {
      const model = await loadFn(device);
      if (!model) throw new Error('loader resolved with no model');
      if (onSelected) onSelected(device);
      return model;
    } catch (e) {
      errors.push(`${device}: ${(e && e.message) || e}`);
    }
  }
  throw new Error(`voice model failed to initialize (${errors.join('; ')})`);
}
