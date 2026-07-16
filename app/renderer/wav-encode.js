// Command Center — minimal WAV transport encoder for TTS Fast Clear.
//
// Wraps Kokoro's mono Float32 PCM in a standard 16-bit PCM RIFF/WAVE container so it
// can play through an HTMLAudioElement (which does pitch-preserving playbackRate time
// compression natively — the whole point of Fast Clear). This is transport formatting
// only: no resampling, no filtering, no time-stretching. Dependency-free by design.

// Encode mono Float32 samples ([-1, 1]) into 16-bit PCM WAV bytes.
export function encodeWavBytes(float32, sampleRate) {
  if (!float32 || typeof float32.length !== 'number') {
    throw new Error('encodeWavBytes: samples must be an array-like of numbers');
  }
  const sr = Math.floor(Number(sampleRate));
  if (!Number.isFinite(sr) || sr <= 0) {
    throw new Error('encodeWavBytes: sampleRate must be a positive number');
  }
  const n = float32.length;
  const bytesPerSample = 2; // 16-bit PCM
  const dataSize = n * bytesPerSample;
  const buf = new ArrayBuffer(44 + dataSize);
  const dv = new DataView(buf);
  const writeAscii = (offset, text) => {
    for (let i = 0; i < text.length; i++) dv.setUint8(offset + i, text.charCodeAt(i));
  };
  writeAscii(0, 'RIFF');
  dv.setUint32(4, 36 + dataSize, true);     // RIFF chunk size
  writeAscii(8, 'WAVE');
  writeAscii(12, 'fmt ');
  dv.setUint32(16, 16, true);               // fmt chunk size
  dv.setUint16(20, 1, true);                // audio format: PCM
  dv.setUint16(22, 1, true);                // channels: mono
  dv.setUint32(24, sr, true);               // sample rate
  dv.setUint32(28, sr * bytesPerSample, true); // byte rate (mono)
  dv.setUint16(32, bytesPerSample, true);   // block align (mono)
  dv.setUint16(34, 16, true);               // bits per sample
  writeAscii(36, 'data');
  dv.setUint32(40, dataSize, true);
  for (let i = 0; i < n; i++) {
    // Clamp before scaling: a stray out-of-range float must clip, not wrap.
    const s = Math.max(-1, Math.min(1, Number(float32[i]) || 0));
    dv.setInt16(44 + i * bytesPerSample, Math.round(s * 32767), true);
  }
  return new Uint8Array(buf);
}
