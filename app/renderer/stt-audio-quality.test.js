// Run: node app/renderer/stt-audio-quality.test.js
import {
  MIC_CONSTRAINTS, getRecorderOptions, analyzePcm, assertUsableCapture,
} from './stt-audio-quality.js';

let passed = 0;
let failed = 0;
function assert(condition, label) {
  if (condition) { process.stdout.write(`  PASS ${label}\n`); passed++; }
  else { process.stderr.write(`  FAIL ${label}\n`); failed++; }
}
function throws(fn, pattern, label) {
  try { fn(); assert(false, label); }
  catch (error) { assert(pattern.test(String(error && error.message)), label); }
}

assert(MIC_CONSTRAINTS.audio.channelCount === 1 && MIC_CONSTRAINTS.video === false,
  'capture requests mono audio and no video');
assert(MIC_CONSTRAINTS.audio.echoCancellation === true
  && MIC_CONSTRAINTS.audio.noiseSuppression === true
  && MIC_CONSTRAINTS.audio.autoGainControl === true,
'capture requests browser speech cleanup and gain control');

{
  const Recorder = { isTypeSupported: (type) => type === 'audio/webm;codecs=opus' };
  const options = getRecorderOptions(Recorder);
  assert(options.mimeType === 'audio/webm;codecs=opus' && options.audioBitsPerSecond === 128000,
    'prefers supported Opus/WebM at 128 kbps');
  const fallback = getRecorderOptions(null);
  assert(!('mimeType' in fallback) && fallback.audioBitsPerSecond === 128000,
    'lets the browser choose a container when support probing is unavailable');
}

{
  const samples = new Float32Array(16000);
  for (let i = 0; i < samples.length; i++) samples[i] = i % 2 ? 0.1 : -0.1;
  const quality = analyzePcm(samples);
  assert(Math.abs(quality.durationSeconds - 1) < 1e-9, 'reports capture duration without retaining content');
  assert(Math.abs(quality.rms - 0.1) < 0.00001 && Math.abs(quality.peak - 0.1) < 0.00001,
    'reports aggregate RMS and peak accurately');
  assert(quality.quality === 'good' && assertUsableCapture(quality) === quality,
    'accepts a finite audible speech-level waveform');
}

{
  const silent = analyzePcm(new Float32Array(16000));
  assert(silent.quality === 'near silent', 'classifies a one-second silent capture');
  throws(() => assertUsableCapture(silent), /nearly silent/, 'near-silent input refuses before inference');
  const short = analyzePcm(new Float32Array(1000).fill(0.1));
  assert(short.quality === 'too short', 'classifies a sub-quarter-second capture');
  throws(() => assertUsableCapture(short), /too short/, 'too-short input refuses before inference');
}

{
  const clipped = new Float32Array(16000).fill(0.2);
  clipped.fill(1, 0, 400);
  const quality = analyzePcm(clipped);
  assert(quality.quality === 'clipping' && quality.clippedFraction > 0.01,
    'detects material clipping without rejecting otherwise usable speech');
  assert(assertUsableCapture(quality) === quality, 'clipping remains usable but can be surfaced honestly');
}

throws(() => analyzePcm(new Float32Array()), /no PCM/, 'empty PCM refuses visibly');
throws(() => analyzePcm(new Float32Array([NaN])), /invalid audio samples/, 'non-finite PCM refuses visibly');
throws(() => analyzePcm(new Float32Array([0.1]), 0), /invalid sample rate/, 'invalid sample rate refuses visibly');

process.stdout.write(`\n${passed + failed} tests: ${passed} passed, ${failed} failed\n`);
if (failed) process.exit(1);

