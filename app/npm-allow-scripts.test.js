'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { allowScripts } = require('./package.json');

test('npm allows install scripts only for the three approved dependency versions', () => {
  assert.deepStrictEqual(allowScripts, {
    'onnxruntime-node@1.21.0': true,
    'protobufjs@7.6.6': true,
    'sharp@0.34.5': true,
  });
});
