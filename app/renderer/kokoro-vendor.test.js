'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');

test('Kokoro refuses an unknown voice before generating audio', async (t) => {
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
  assert.match(logError.mock.calls[0].arguments[0], /Voice "missing-voice" not found/);
  assert.ok(Object.hasOwn(logVoices.mock.calls[0].arguments[0], 'am_michael'), 'the voice list includes Mako’s default');
});
