'use strict';

const assert = require('node:assert/strict');
const { after, test: runTest } = require('node:test');
const { Terminal } = require('./vendor/xterm');
const { FitAddon } = require('./vendor/addon-fit');
const { Unicode11Addon } = require('./vendor/addon-unicode11');
const { WebLinksAddon } = require('./vendor/addon-web-links');
const { WebglAddon } = require('./vendor/addon-webgl');

let passed = 0;
let failed = 0;
function test(name, run) {
  runTest(name, async (t) => {
    try {
      await run(t);
      passed++;
    } catch (error) {
      failed++;
      throw error;
    }
  });
}
after(() => process.stdout.write(`terminal-vendor: ${passed} passed, ${failed} failed\n`));

function write(terminal, text) {
  return new Promise((resolve) => terminal.write(text, resolve));
}

test('xterm keeps terminal output and cursor position after an asynchronous write', async (t) => {
  const terminal = new Terminal({ cols: 12, rows: 3, allowProposedApi: true });
  t.after(() => terminal.dispose());

  await write(terminal, 'first\r\nsecond');

  const buffer = terminal.buffer.active;
  assert.equal(buffer.getLine(0).translateToString(true), 'first');
  assert.equal(buffer.getLine(1).translateToString(true), 'second');
  assert.equal(buffer.cursorX, 6);
  assert.equal(buffer.cursorY, 1);
});

test('Fit measures usable space and resizes only when the dimensions change', (t) => {
  const parent = { width: '212px', height: '110px' };
  const element = {
    parentElement: parent,
    'padding-left': '4px',
    'padding-right': '4px',
    'padding-top': '5px',
    'padding-bottom': '5px',
  };
  globalThis.window = { getComputedStyle: (node) => ({ getPropertyValue: (key) => node[key] }) };
  t.after(() => { delete globalThis.window; });

  const calls = [];
  const cell = { width: 0, height: 10 };
  const terminal = {
    element, cols: 80, rows: 24, options: { scrollback: 5000 },
    _core: { _renderService: { dimensions: { css: { cell } }, clear: () => calls.push('clear') } },
    resize(cols, rows) {
      this.cols = cols;
      this.rows = rows;
      calls.push([cols, rows]);
    },
  };
  const addon = new FitAddon();
  addon.activate(terminal);
  addon.fit();
  assert.deepEqual(calls, [], 'zero-width cells cannot be measured');

  cell.width = 10;
  addon.fit();
  addon.fit();
  assert.deepEqual(calls, ['clear', [19, 10]], 'padding and the scrollbar are deducted before resizing');
});

test('Unicode 11 registration changes the cell width used for terminal output', async (t) => {
  const terminal = new Terminal({ cols: 12, rows: 3, allowProposedApi: true });
  t.after(() => terminal.dispose());
  const faceWithMonocle = '\u{1F9D0}';

  await write(terminal, faceWithMonocle);
  assert.equal(terminal.buffer.active.cursorX, 1);

  terminal.loadAddon(new Unicode11Addon());
  terminal.unicode.activeVersion = '11';
  await write(terminal, '\r\n' + faceWithMonocle);
  assert.equal(terminal.buffer.active.cursorX, 2);
});

test('Web Links reports the URL range and forwards activation to the registered handler', async (t) => {
  const terminal = new Terminal({ cols: 40, rows: 3, allowProposedApi: true });
  t.after(() => terminal.dispose());
  let provider;
  const disposable = { dispose: t.mock.fn() };
  t.mock.method(terminal, 'registerLinkProvider', (value) => {
    provider = value;
    return disposable;
  });

  const activate = t.mock.fn();
  const addon = new WebLinksAddon(activate);
  terminal.loadAddon(addon);
  const url = 'https://example.com/docs';
  await write(terminal, `see ${url}.\r\nno link here`);

  const noLinks = t.mock.fn();
  provider.provideLinks(2, noLinks);
  assert.deepEqual(noLinks.mock.calls.map((call) => call.arguments), [[[]]]);

  const loaded = t.mock.fn();
  provider.provideLinks(1, loaded);
  assert.equal(loaded.mock.callCount(), 1);
  const [links] = loaded.mock.calls[0].arguments;
  assert.equal(links.length, 1);
  assert.equal(links[0].text, url);
  assert.deepEqual(links[0].range, { start: { x: 5, y: 1 }, end: { x: 28, y: 1 } });
  const event = { type: 'click' };
  links[0].activate(event, links[0].text);
  assert.deepEqual(activate.mock.calls.map((call) => call.arguments), [[event, url]]);

  addon.dispose();
  assert.equal(disposable.dispose.mock.callCount(), 1);
});

test('WebGL defers until the terminal opens and preserves its renderer when WebGL2 is unavailable', (t) => {
  const addon = new WebglAddon(true);
  const disposeListener = t.mock.fn();
  let onOpen;
  const getContext = t.mock.fn(() => null);
  const setRenderer = t.mock.fn();
  const terminal = {
    _core: {
      onWillOpen(callback) {
        onOpen = callback;
        return { dispose: disposeListener };
      },
      _coreBrowserService: {
        mainDocument: {
          createElement(tag) {
            assert.equal(tag, 'canvas');
            return { getContext };
          },
        },
      },
      _renderService: { setRenderer },
    },
  };

  addon.activate(terminal);
  assert.equal(getContext.mock.callCount(), 0);
  terminal.element = {};
  assert.throws(() => onOpen(), /WebGL2 not supported/);
  assert.deepEqual(getContext.mock.calls.map((call) => call.arguments), [
    ['webgl2', { antialias: false, depth: false, preserveDrawingBuffer: true }],
  ]);
  assert.equal(setRenderer.mock.callCount(), 0);

  addon.dispose();
  assert.equal(disposeListener.mock.callCount(), 1);
});
