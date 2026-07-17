// Run: node app/renderer/wav-encode.test.js
// Plain Node.js — no framework. Proves encodeWavBytes emits a valid 16-bit PCM mono
// RIFF/WAVE container: header fields, sizes, little-endian PCM payload, clipping, and
// input validation. No audio playback, no network.

import { encodeWavBytes } from './wav-encode.js';

let passed = 0, failed = 0;
function assert(cond, label) {
  if (cond) { process.stdout.write(`  ✓ ${label}\n`); passed++; }
  else { process.stderr.write(`  ✗ FAIL: ${label}\n`); failed++; }
}

const ascii = (dv, off, len) => {
  let s = '';
  for (let i = 0; i < len; i++) s += String.fromCharCode(dv.getUint8(off + i));
  return s;
};

{
  const samples = new Float32Array([0, 0.25, -0.5, 1, -1]);
  const bytes = encodeWavBytes(samples, 24000);
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  assert(bytes instanceof Uint8Array && bytes.length === 44 + samples.length * 2,
    'output is a Uint8Array of exactly 44 header bytes + 2 bytes per sample');
  assert(ascii(dv, 0, 4) === 'RIFF' && ascii(dv, 8, 4) === 'WAVE', 'RIFF/WAVE magic present');
  assert(dv.getUint32(4, true) === 36 + samples.length * 2, 'RIFF chunk size is 36 + data size');
  assert(ascii(dv, 12, 4) === 'fmt ' && dv.getUint32(16, true) === 16, 'fmt chunk with size 16');
  assert(dv.getUint16(20, true) === 1, 'audio format is PCM (1)');
  assert(dv.getUint16(22, true) === 1, 'channel count is mono (1)');
  assert(dv.getUint32(24, true) === 24000, 'sample rate is written verbatim');
  assert(dv.getUint32(28, true) === 24000 * 2, 'byte rate is sampleRate * 2 for mono 16-bit');
  assert(dv.getUint16(32, true) === 2 && dv.getUint16(34, true) === 16, 'block align 2, bits per sample 16');
  assert(ascii(dv, 36, 4) === 'data' && dv.getUint32(40, true) === samples.length * 2,
    'data chunk with exact PCM payload size');

  assert(dv.getInt16(44, true) === 0, 'sample 0.0 encodes to 0');
  assert(dv.getInt16(46, true) === Math.round(0.25 * 32767), 'sample 0.25 scales to 16-bit');
  assert(Math.abs(dv.getInt16(48, true) - (-16384)) <= 1, 'sample -0.5 scales to ~-16384');
  assert(dv.getInt16(50, true) === 32767, 'full-scale 1.0 encodes to 32767');
  assert(dv.getInt16(52, true) === -32767, 'full-scale -1.0 encodes to -32767');
}

{
  const bytes = encodeWavBytes(new Float32Array([1.7, -3.2, NaN]), 22050);
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  assert(dv.getInt16(44, true) === 32767, 'out-of-range +1.7 CLIPS to 32767 (no wraparound)');
  assert(dv.getInt16(46, true) === -32767, 'out-of-range -3.2 clips to -32767');
  assert(dv.getInt16(48, true) === 0, 'a NaN sample degrades to silence, not garbage');
  assert(dv.getUint32(24, true) === 22050, 'non-default sample rates pass through');
}

{
  const bytes = encodeWavBytes(new Float32Array(0), 24000);
  assert(bytes.length === 44, 'zero samples still produce a well-formed 44-byte header');
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  assert(dv.getUint32(40, true) === 0, 'empty data chunk declares size 0');
}

{
  const throws = (fn) => { try { fn(); return false; } catch { return true; } };
  assert(throws(() => encodeWavBytes(null, 24000)), 'null samples are refused, not encoded as silence');
  assert(throws(() => encodeWavBytes(new Float32Array(2), 0)), 'zero sample rate is refused');
  assert(throws(() => encodeWavBytes(new Float32Array(2), -1)), 'negative sample rate is refused');
  assert(throws(() => encodeWavBytes(new Float32Array(2), NaN)), 'NaN sample rate is refused');
  assert(encodeWavBytes([0.5], 24000).length === 46, 'a plain array of numbers is accepted (array-like contract)');
}

process.stdout.write(`\nwav-encode: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
