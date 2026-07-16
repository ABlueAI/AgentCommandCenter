// Local microphone-capture contract for Whisper. This module handles only
// constraints, recording format, and aggregate signal quality. It never stores,
// returns, or logs recorded content beyond the caller-owned Float32Array.

export const MIC_CONSTRAINTS = Object.freeze({
  audio: Object.freeze({
    channelCount: 1,
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
  }),
  video: false,
});

export function getRecorderOptions(MediaRecorderCtor) {
  const supports = MediaRecorderCtor && typeof MediaRecorderCtor.isTypeSupported === 'function'
    ? (type) => MediaRecorderCtor.isTypeSupported(type)
    : () => false;
  const mimeType = ['audio/webm;codecs=opus', 'audio/webm'].find(supports);
  return mimeType ? { mimeType, audioBitsPerSecond: 128000 } : { audioBitsPerSecond: 128000 };
}

export function analyzePcm(samples, sampleRate = 16000) {
  if (!(samples instanceof Float32Array) || samples.length === 0) {
    throw new Error('microphone capture produced no PCM samples');
  }
  if (!Number.isFinite(sampleRate) || sampleRate < 8000) {
    throw new Error('microphone capture reported an invalid sample rate');
  }
  let energy = 0;
  let peak = 0;
  let clipped = 0;
  for (const sample of samples) {
    if (!Number.isFinite(sample)) throw new Error('microphone capture contained invalid audio samples');
    const magnitude = Math.abs(sample);
    energy += sample * sample;
    if (magnitude > peak) peak = magnitude;
    if (magnitude >= 0.99) clipped++;
  }
  const durationSeconds = samples.length / sampleRate;
  const rms = Math.sqrt(energy / samples.length);
  const clippedFraction = clipped / samples.length;
  let quality = 'good';
  if (durationSeconds < 0.25) quality = 'too short';
  else if (rms < 0.002) quality = 'near silent';
  else if (clippedFraction > 0.01) quality = 'clipping';
  return { durationSeconds, rms, peak, clippedFraction, quality };
}

export function assertUsableCapture(analysis) {
  if (!analysis || analysis.quality === 'too short') {
    throw new Error('microphone capture was too short; hold Dictate until speech is complete');
  }
  if (analysis.quality === 'near silent') {
    throw new Error('microphone capture was nearly silent; check the selected input and microphone level');
  }
  return analysis;
}

