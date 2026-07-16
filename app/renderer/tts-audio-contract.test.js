import { validateKokoroAudio } from './tts-audio-contract.js';

let passed = 0;
function check(condition, message) {
  if (!condition) throw new Error(message);
  passed++;
}
function rejects(value, pattern) {
  try { validateKokoroAudio(value); }
  catch (error) { check(pattern.test(error.message), `expected ${pattern}, got ${error.message}`); return; }
  throw new Error(`expected rejection matching ${pattern}`);
}

const valid = validateKokoroAudio({ audio: new Float32Array([0, -0.25, 0.5]), sampling_rate: 24000 });
check(valid.samples.length === 3, 'valid waveform is preserved');
check(valid.sampleRate === 24000, 'valid sample rate is preserved');
check(valid.peak === 0.5, 'waveform peak is measured');
rejects(null, /no Float32/);
rejects({ audio: [0.1], sampling_rate: 24000 }, /no Float32/);
rejects({ audio: new Float32Array(), sampling_rate: 24000 }, /empty waveform/);
rejects({ audio: new Float32Array([0.1]), sampling_rate: 0 }, /invalid sample rate/);
rejects({ audio: new Float32Array([Number.NaN]), sampling_rate: 24000 }, /non-finite/);
rejects({ audio: new Float32Array([0, 0]), sampling_rate: 24000 }, /silent waveform/);

console.log(`tts-audio-contract.test.js: ${passed} assertions passed`);
