// Validate Kokoro's RawAudio result before it reaches Web Audio. This keeps a
// malformed/empty model result from being presented as successful speech.
export function validateKokoroAudio(value) {
  if (!value || !(value.audio instanceof Float32Array)) {
    throw new Error('Kokoro returned no Float32 audio samples');
  }
  if (value.audio.length === 0) throw new Error('Kokoro returned an empty waveform');
  if (!Number.isFinite(value.sampling_rate) || value.sampling_rate < 8000 || value.sampling_rate > 96000) {
    throw new Error(`Kokoro returned an invalid sample rate: ${String(value.sampling_rate)}`);
  }
  let peak = 0;
  for (const sample of value.audio) {
    if (!Number.isFinite(sample)) throw new Error('Kokoro returned a non-finite audio sample');
    peak = Math.max(peak, Math.abs(sample));
  }
  if (peak < 1e-7) throw new Error('Kokoro returned a silent waveform');
  return { samples: value.audio, sampleRate: value.sampling_rate, peak };
}
