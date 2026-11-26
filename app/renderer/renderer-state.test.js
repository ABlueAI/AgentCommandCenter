'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createLibraryIpc } = require('../library-ipc');

const appSource = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');
const noop = () => {};
const cases = [];
const test = (name, run) => cases.push({ name, run });

class Element {
  constructor(document) {
    this.ownerDocument = document;
    this.children = [];
    this.classes = new Set();
    this.listeners = {};
    this.dataset = {};
    this.value = '';
    this.scrollTop = 0;
    this.clientHeight = 10;
    this.writes = 0;
    this.classList = {
      add: (name) => this.classes.add(name),
      remove: (...names) => names.forEach((name) => this.classes.delete(name)),
      toggle: (name, enabled) => enabled ? this.classes.add(name) : this.classes.delete(name),
      contains: (name) => this.classes.has(name),
    };
  }
  set className(value) { this.classes = new Set(value.split(' ')); }
  setAttribute(name, value) { if (name === 'data-act') this.dataset.act = value; }
  set innerHTML(value) { this.textContent = value; }
  set textContent(value) {
    this.children = [];
    this.firstChild = value ? { data: value } : null;
    this.writes++;
  }
  get textContent() { return this.firstChild?.data ?? this.children.map((child) => child.textContent).join(''); }
  get scrollHeight() { return this.textContent.split('\n').length; }
  appendChild(child) { this.children.push(child); }
  addEventListener(type, fn) { this.listeners[type] = fn; }
  removeEventListener() {}
  querySelectorAll(selector) {
    const matches = (child) => selector === '[data-act]'
      ? !!child.dataset.act : child.classes.has(selector.slice(1));
    return this.children.flatMap((child) => [
      ...(matches(child) ? [child] : []), ...child.querySelectorAll(selector),
    ]);
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }
}

class Terminal {
  selection = '';
  writes = [];
  buffer = { active: {
    length: 1,
    getLine: () => ({ isWrapped: false, translateToString: () => 'current buffer output' }),
  } };

  loadAddon() {}
  open() {}
  onData() {}
  onResize() {}
  write(data) { this.writes.push(data); }
  onSelectionChange(handler) { this.onSelect = handler; return { dispose: noop }; }
  attachCustomKeyEventHandler(handler) { this.onKey = handler; }
  getSelection() { return this.selection; }
  clearSelection() { this.selection = ''; this.onSelect(); }
}

function setup(overrides = {}) {
  const elements = new Map();
  const frames = [];
  const clipboard = [];
  const spoken = [];
  const pty = {};
  const document = {
    querySelector(selector) {
      if (selector === '#termEmpty') return null;
      if (!elements.has(selector)) elements.set(selector, new Element(document));
      return elements.get(selector);
    },
    documentElement: { setAttribute: noop },
    querySelectorAll: () => [],
    createElement: () => new Element(document),
    createTextNode(text) {
      const node = new Element(document);
      node.textContent = text;
      return node;
    },
    addEventListener: noop,
    createRange() {
      let top;
      return {
        setStart(node, offset) { top = node.data.slice(0, offset).split('\n').length - 1; },
        collapse: noop,
        getBoundingClientRect() { return { top: top - document.querySelector('#logView').scrollTop }; },
      };
    },
  };
  const window = {
    addEventListener: noop,
    ccAudioModuleHealth: require('./audio-module-health'),
    ccAuthorityChoice: require('./authority-choice'),
    ccClipboardConsumer: require('./clipboard-consumer'),
    ccLibraryView: require('./library-view'),
    ccPaneMaximize: require('./pane-maximize'),
    ccReportFollowup: require('./report-followup'),
    ccTermCopy: require('./term-copy'),
    ccTermKeys: require('./term-keys'),
    ccTTSSelection: require('./tts-selection'),
    ccQuickLinksView: { createQuickLinksView: () => ({ load: noop }) },
    ccUsageView: { createUsageView: () => ({}) },
  };
  const cc = {
    getSettings: async () => ({}),
    getGeminiKeyStatus: async () => ({ ok: true }),
    getAgentTokenStatus: async () => ({ ok: true }),
    listRepos: async () => ({ repos: [] }),
    saveSettings: async () => ({}),
    repoGithubUrl: async (repo) => 'https://example.test/' + repo,
    listWorktrees: async () => [],
    ptyStart: async () => ({ ok: true }),
    onPtyData: (handler) => { pty.data = handler; },
    onPtyExit: (handler) => { pty.exit = handler; },
    onClaudeVideoScoutEvent: noop,
    onMainError: noop,
    onMainInfo: noop,
    clipboardWrite: async (text) => { clipboard.push(text); return { ok: true }; },
    ...overrides,
  };
  const addon = class {};
  const context = vm.createContext({
    window, document, cc, Terminal, PtyParser: require('./pty-parser').PtyParser,
    agentDom: require('./agent-dom'),
    videoModelPolicy: require('./video-model-policy'),
    FitAddon: { FitAddon: class { fit() {} } },
    WebLinksAddon: { WebLinksAddon: addon },
    Unicode11Addon: { Unicode11Addon: addon },
    WebglAddon: { WebglAddon: class { onContextLoss() {} } },
    ResizeObserver: class { observe() {} },
    requestAnimationFrame(fn) { return frames.push(fn); },
    setTimeout: noop,
    clearTimeout: noop,
    alert(message) { assert.fail(message); },
  });
  // Boot on demand so each test can drive the production handlers with its own IPC.
  assert.match(appSource, /\nboot\(\);\s*$/);
  vm.runInContext(appSource.replace(/\nboot\(\);\s*$/, ''), context);
  const evaluate = (source) => vm.runInContext(source, context);
  const flushFrames = () => frames.splice(0).forEach((fn) => fn());
  const start = () => evaluate('wireUi = () => {}; offerResume = () => {}; startLayoutEngine = async () => {}; boot()');
  return { cc, clipboard, document, evaluate, flushFrames, frames, pty, start, spoken, window };
}

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

const nextTurn = () => new Promise((resolve) => setImmediate(resolve));
const event = (extra = {}) => ({ preventDefault: noop, stopPropagation: noop, ...extra });

test('#234 late repository responses cannot replace the current cards or link', async () => {
  const slowTrees = deferred();
  const slowUrl = deferred();
  const worktrees = (repo) => [{ path: repo + '/agent', branch: 'agent' }];
  const env = setup({
    listWorktrees: async (repo) => repo === 'A' ? slowTrees.promise : worktrees(repo),
  });

  const first = env.evaluate("onRepoChange('A')");
  await nextTurn();
  await env.evaluate("onRepoChange('B')");
  slowTrees.resolve(worktrees('A'));
  await first;
  assert.equal(env.evaluate('state.worktrees[0].path'), 'B/agent');
  assert.equal(env.document.querySelector('#agentGrid').querySelector('.meta').textContent, 'B/agent');

  env.cc.repoGithubUrl = async (repo) => repo === 'A' ? slowUrl.promise : 'https://example.test/' + repo;
  const second = env.evaluate("onRepoChange('A')");
  await nextTurn();
  assert.equal(env.evaluate('state.githubUrl'), '', 'changing repos clears the old link while loading');
  await env.evaluate("onRepoChange('B')");
  slowUrl.resolve('https://example.test/A');
  await second;
  assert.equal(env.evaluate('state.githubUrl'), 'https://example.test/B');

  const slowSameRepo = deferred();
  env.cc.listWorktrees = () => slowSameRepo.promise;
  const oldRefresh = env.evaluate('refreshAgents()');
  env.cc.listWorktrees = async () => [{ path: 'B/new', branch: 'new' }];
  await env.evaluate('refreshAgents()');
  slowSameRepo.resolve(worktrees('B'));
  await oldRefresh;
  assert.equal(env.evaluate('state.worktrees[0].path'), 'B/new', 'only the newest refresh of B can update the cards');
});

test('#235 long-running terminals do not render hidden history and SDK usage still reaches Logs', async () => {
  const env = setup();
  await env.start();
  env.evaluate('openInAppTerminal(); openInAppTerminal({ role: "video-scout" })');
  env.flushFrames();
  const output = 'ordinary terminal output\r\n'.repeat(10_000);
  env.pty.data({ id: 'pty1', data: output });
  env.pty.data({ id: 'pty2', data: output });
  assert.equal(env.evaluate('terms.get("pty1").term.writes[0].length'), output.length);
  assert.equal(env.frames.length, 0, 'completed lines schedule no hidden history render');
  assert.equal(env.evaluate('terms.get("pty1").usageParser'), null, 'ordinary panes skip parsing');
  for (let i = 0; i < 10; i++) env.pty.data({ id: 'pty2', data: 'x'.repeat(5000) });
  assert.equal(env.evaluate('terms.get("pty2").usageParser._buf.length'), 4096);
  env.pty.data({ id: 'pty2', data: '\r\n' });
  env.pty.data({ id: 'pty2', data: '\x1b[32m[video-scout usa' });
  env.pty.data({ id: 'pty2', data: 'ge] total=23\x1b[0m' });
  env.pty.exit({ id: 'pty2' });
  env.flushFrames();
  assert.match(env.document.querySelector('#logView').textContent, /\[video-scout usage\] total=23/);
});

test('#236 Logs batches writes, keeps a bounded tail and preserves the reader position', () => {
  const env = setup();
  const log = env.document.querySelector('#logView');
  env.evaluate(`
    for (let i = 0; i < 9000; i++) appendLog(String(i).padStart(5, '0') + ': a log line\\n');
    appendLog('most recent line\\n');
  `);
  assert.equal(log.writes, 0);
  assert.equal(env.frames.length, 1);
  env.flushFrames();
  assert.equal(log.writes, 1);
  assert.match(log.textContent, /truncated/i);
  assert.match(log.textContent, /most recent line\n$/);
  assert.ok(log.textContent.length < 150_000);
  assert.ok(log.scrollTop >= log.scrollHeight - log.clientHeight, 'follows the tail when at the bottom');

  log.scrollTop = 80;
  const lineAtTop = log.textContent.split('\n')[log.scrollTop];
  env.evaluate("appendLog('a new line\\n'); appendLog('another new line\\n')");
  env.flushFrames();
  assert.equal(log.writes, 2);
  assert.equal(log.textContent.split('\n')[log.scrollTop], lineAtTop, 'keeps the same line in view after front eviction');
  assert.match(log.textContent, /another new line\n$/);
});

test('#237 Refresh prevents a row from binding Ask to an expired Library handle', async () => {
  const scan = deferred();
  const run = { runId: 'run-20260718-170359-368-59496-a5e6070a', title: 'Report', reportStatus: 'available' };
  const list = { ok: true, entries: [run] };
  let lists = 0;
  const reads = [];
  const asks = [];
  const entryUrl = 'file:///app/renderer/index.html';
  const mainFrame = { url: entryUrl };
  const webContents = { mainFrame };
  const sender = { sender: webContents, senderFrame: mainFrame };
  const library = createLibraryIpc({
    entryUrl,
    getTrustedWindow: () => ({ isDestroyed: () => false, webContents }),
    getRunIdForPane: () => run.runId,
    logRefusal: noop,
    runLibraryAction: async ({ action, runId }) => {
      if (action === 'List') return ++lists === 1 ? list : scan.promise;
      reads.push(runId);
      return { ok: true, status: 'available', text: 'Saved report' };
    },
  });
  const env = setup({
    libraryList: () => library.handleList(sender),
    libraryRead: (handle) => library.handleRead(sender, handle),
    libraryFollowup: async (request) => {
      asks.push(library.resolveHandle(request.handle));
      return { ok: true, answer: 'An answer' };
    },
  });
  await env.evaluate('setupLibrary(); refreshLibrary()');
  const oldHandle = env.evaluate('libState.entries[0].handle');
  const oldRow = env.document.querySelector('#libList').children[0];
  const refresh = env.evaluate('refreshLibrary()');
  assert.equal(env.document.querySelector('#libList').inert, true);
  await env.evaluate('refreshLibrary()');
  assert.equal(lists, 2, 'a scan already in progress is the only scan');
  await oldRow.onclick?.();
  scan.resolve(list);
  await refresh;

  assert.equal(library.resolveHandle(oldHandle), undefined, 'main still invalidates old handles');
  const followup = env.document.querySelector('#libFollowupHost');
  const question = followup.querySelector('.lib-followup-q');
  question.value = 'What happened?';
  await env.evaluate('libFollowup.submit()');
  assert.deepEqual(asks, [], 'there is no Ask source from the old list');
  assert.deepEqual(reads, [], 'the old row did not cause a read');

  const freshRow = env.document.querySelector('#libList').children[0];
  await freshRow.onclick();
  question.value = 'What happened?';
  await env.evaluate('libFollowup.submit()');
  assert.deepEqual(asks, [run.runId], 'Ask uses the current list handle after selecting again');

  env.cc.libraryList = async () => { throw new Error('scan did not respond'); };
  await env.evaluate('refreshLibrary()');
  assert.equal(env.document.querySelector('#libStatus').textContent, 'Scan failed.');
  assert.equal(env.document.querySelector('#libRefresh').disabled, false);
  await freshRow.onclick();
  await env.evaluate('libFollowup.submit()');
  assert.deepEqual(asks, [run.runId], 'a rejected refresh retires the old Ask source');
});

test('#239 Copy Output ignores cleared selection memory but preserves live pointer selection', async () => {
  const env = setup();
  env.evaluate('openInAppTerminal()');
  const pane = env.evaluate('terms.get("pty1")');
  const copy = pane.pane.querySelector('.copy-out');
  const speak = pane.pane.querySelector('.spk');
  env.window.ccTTS = { speak: (text) => env.spoken.push(text) };

  pane.term.selection = 'old selection';
  pane.term.onSelect();
  pane.term.onKey(event({ type: 'keydown', key: 'c', code: 'KeyC', ctrlKey: true }));
  assert.equal(pane.term.getSelection(), '');
  speak.onclick(event());
  assert.deepEqual(env.spoken, ['old selection'], 'read-aloud still remembers the selection');

  const pointer = event({ button: 0, detail: 1, pointerId: 1 });
  copy.listeners.pointerdown(pointer);
  copy.onclick(pointer);
  await nextTurn();
  assert.deepEqual(env.clipboard, ['old selection', 'current buffer output']);

  pane.term.selection = 'live selection';
  copy.listeners.pointerdown(pointer);
  pane.term.clearSelection();
  copy.onclick(pointer);
  await nextTurn();
  assert.equal(env.clipboard.at(-1), 'live selection', 'snapshot survives focus taking the live selection');

  pane.term.selection = 'abandoned press';
  copy.listeners.pointerdown(pointer);
  pane.term.clearSelection();
  copy.onclick(event({ detail: 0, pointerId: -1 }));
  await nextTurn();
  assert.equal(env.clipboard.at(-1), 'current buffer output', 'keyboard activation ignores an abandoned pointer snapshot');
});

(async () => {
  let passed = 0;
  let failed = 0;
  for (const { name, run } of cases) {
    try {
      await run();
      passed++;
      process.stdout.write(`  ✓ ${name}\n`);
    } catch (error) {
      failed++;
      process.stderr.write(`  ✗ FAIL: ${name}\n${error.stack}\n`);
    }
  }
  process.stdout.write(`\nrenderer-state: ${passed} passed, ${failed} failed\n`);
  if (failed) process.exitCode = 1;
})();
