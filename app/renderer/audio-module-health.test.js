const assert = require('assert');
const { cleanDetail, createAudioModuleHealth } = require('./audio-module-health.js');

assert.equal(cleanDetail(' model failed\nwith detail\t'), 'model failed with detail');
assert.equal(cleanDetail(''), 'unknown startup failure');
assert.equal(cleanDetail('a'.repeat(300)).length, 220);

const health = createAudioModuleHealth();
assert.deepEqual(health.get('tts'), { phase: 'pending', detail: '' });
assert.deepEqual(health.markReady('tts'), { phase: 'ready', detail: '' });
assert.deepEqual(health.markFailed('stt', 'missing\ntransformers bundle'), { phase: 'failed', detail: 'missing transformers bundle' });
assert.deepEqual(health.failIfPending('stt', 'ignored'), { phase: 'failed', detail: 'missing transformers bundle' });
assert.deepEqual(health.failIfPending('tts', 'late startup'), { phase: 'ready', detail: '' });
assert.throws(() => health.get('unknown'), /Unknown audio module/);

console.log('audio-module-health.test.js: 9 assertions passed');
