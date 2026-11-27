'use strict';

const assert = require('node:assert/strict');
const { after, test } = require('node:test');

let passed = 0;
let failed = 0;
after(() => process.stdout.write(`kokoro-vendor: ${passed} passed, ${failed} failed\n`));

test('Kokoro refuses an unknown voice before generating audio', async (t) => {
  try {
    const { KokoroTTS } = await import('./vendor/kokoro.web.js');
    const model = t.mock.fn();
    const tokenize = t.mock.fn();
    const logError = t.mock.method(console, 'error', () => {});
    const logVoices = t.mock.method(console, 'table', () => {});
    const kokoro = new KokoroTTS(model, tokenize);

    await assert.rejects(
      kokoro.generate('Synthetic narration.', { voice: 'missing-voice' }),
      /Voice "missing-voice" not found/,
    );
    assert.equal(model.mock.callCount(), 0);
    assert.equal(tokenize.mock.callCount(), 0);
    assert.equal(logError.mock.callCount(), 1);
    assert.match(logError.mock.calls[0].arguments[0], /Voice "missing-voice" not found/);
    assert.equal(logVoices.mock.callCount(), 1);
    assert.ok(Object.hasOwn(logVoices.mock.calls[0].arguments[0], 'am_michael'), 'the voice list includes the default');
    passed++;
  } catch (error) {
    failed++;
    throw error;
  }
});
