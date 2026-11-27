'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { Terminal } = require('./vendor/xterm');

test('xterm keeps terminal output and cursor position after an asynchronous write', async (t) => {
  const terminal = new Terminal({ cols: 12, rows: 3, allowProposedApi: true });
  t.after(() => terminal.dispose());

  await new Promise((resolve) => terminal.write('first\r\nsecond', resolve));

  const buffer = terminal.buffer.active;
  assert.equal(buffer.getLine(0).translateToString(true), 'first');
  assert.equal(buffer.getLine(1).translateToString(true), 'second');
  assert.equal(buffer.cursorX, 6);
  assert.equal(buffer.cursorY, 1);
});
