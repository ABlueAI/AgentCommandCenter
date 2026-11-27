'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { after, test: runTest } = require('node:test');
const vm = require('node:vm');

let passed = 0;
let failed = 0;
function test(name, run) {
  runTest(name, async () => {
    try {
      await run();
      passed++;
    } catch (error) {
      failed++;
      throw error;
    }
  });
}
after(() => process.stdout.write(`launch-dialogs: ${passed} passed, ${failed} failed\n`));

const source = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const tick = () => new Promise((resolve) => setImmediate(resolve));
const noop = () => {};

class Element {
  constructor(tag = 'div') {
    this.tag = tag;
    this.children = [];
    this.classes = new Set();
    this.classList = {
      add: (name) => this.classes.add(name),
      remove: (name) => this.classes.delete(name),
      contains: (name) => this.classes.has(name),
      toggle: (name, enabled) => enabled ? this.classes.add(name) : this.classes.delete(name),
    };
  }
  appendChild(child) { this.children.push(child); }
  append(...children) { this.children.push(...children); }
  querySelector(selector) { return this.children.find((child) => child.selector === selector); }
  set textContent(value) { this.text = value; this.children = []; }
  get textContent() { return [this.text, ...this.children.map((child) => child.textContent)].filter(Boolean).join(' '); }
  addEventListener() {}
  setAttribute(name, value) { this[name] = value; }
  focus() { this.focused = true; }
  remove() {}
  button(text) {
    if (this.tag === 'button' && this.textContent === text) return this;
    return this.children.map((child) => child.button(text)).find(Boolean);
  }
}

class Terminal {
  loadAddon() {}
  open() {}
  onData() {}
  onResize() {}
  attachCustomKeyEventHandler() {}
  onSelectionChange() { return { dispose: noop }; }
  dispose() {}
}

function terminalPane() {
  const pane = new Element();
  for (const selector of ['.term-body', '.spk', '.copy-out', '.max', '.chat-body', '.x']) {
    const child = new Element();
    child.selector = selector;
    pane.appendChild(child);
  }
  return pane;
}

function renderer(ipc = {}) {
  const controls = new Map();
  const control = (id) => {
    if (!controls.has(id)) controls.set(id, new Element());
    return controls.get(id);
  };
  control('#taskName').value = 'https://www.youtube.com/watch?v=synthetic';
  control('#videoProviderSelect').value = 'gemini';
  const launches = [];
  const alerts = [];
  const context = vm.createContext({
    URL,
    Terminal,
    FitAddon: { FitAddon: class { fit() {} } },
    WebLinksAddon: { WebLinksAddon: class {} },
    ResizeObserver: class { observe() {} disconnect() {} },
    PtyParser: class {},
    setTimeout: noop, // Skip the unrelated post-launch terminal refit.
    document: { addEventListener: noop, querySelector: control, querySelectorAll: () => [], createElement: (tag) => new Element(tag) },
    alert: (message) => alerts.push(message),
    window: {
      addEventListener: noop,
      ccAuthorityChoice: require('./authority-choice'),
      ccAudioModuleHealth: { createAudioModuleHealth: noop },
      ccQuickLinksView: { createQuickLinksView: noop },
      ccUsageView: { createUsageView: noop },
      ccPaneMaximize: { createPaneMaximizer: () => ({ handlePaneClosed: noop }) },
      ccClipboardConsumer: { createClipboardConsumer: noop },
      ccReportFollowup: { createReportFollowup: noop },
      ccSessionResumeView: require('./session-resume-view'),
      ccTTSSelection: { createSelectionMemory: noop, installMouseTrackingSelectionFallback: noop },
    },
    cc: { tlogReset: async () => {}, ...ipc },
    agentDom: { buildTermPane: terminalPane },
    analysisFocus: require('./analysis-focus'),
    videoModelPolicy: require('./video-model-policy'),
    videoRangeUi: require('./video-range-ui'),
  });
  // Run the renderer with synthetic controls and IPC, without starting unrelated boot work.
  vm.runInContext(source.replace(/\nboot\(\);\s*$/, ''), context, { filename: 'app.js' });
  const run = (code) => vm.runInContext(code, context);
  control('#terminalGrid').style = {};
  Object.assign(context, {
    switchTab: noop,
    buildClaudeVideoSettings: noop,
    fillClaudeVideoSettings: noop,
    loadClaudeVideoSettings: noop,
    readVideoAnalysisFocus: () => ({}),
    readClaudeVideoSettings: () => ({}),
    refreshAgents: async () => {},
  });
  if (!ipc.ptyStart) context.openInAppTerminal = (options) => launches.push(options);
  run("Object.assign(state, { repo: '/synthetic/repo', chosenRole: 'video-scout' });");
  return { run, control, launches, alerts };
}

test('Gemini Video Scout hands off a double submission only once', async () => {
  const key = deferred();
  let keyChecks = 0;
  const app = renderer({ getGeminiKeyStatus: () => { keyChecks++; return key.promise; } });
  const first = app.run('createAgent()');
  const second = app.run('createAgent()');
  await tick();
  assert.equal(app.control('#modalCreate').disabled, true);
  key.resolve({ ok: true, hasKey: true });
  await Promise.all([first, second]);
  assert.equal(app.launches.length, 1, 'one user submission starts one pane');
  assert.equal(keyChecks, 1);
  assert.equal(app.control('#modalCreate').disabled, false);
});

test('a refused Gemini key check keeps the dialog open and allows a retry', async () => {
  let attempts = 0;
  const app = renderer({ getGeminiKeyStatus: async () => ++attempts === 1
    ? { ok: false, error: 'synthetic refusal' } : { ok: true, hasKey: true } });
  await app.run('createAgent()');
  assert.equal(app.launches.length, 0);
  assert.equal(app.control('#modal').classList.contains('hidden'), false);
  assert.equal(app.control('#modalCreate').disabled, false);
  assert.match(app.alerts[0], /could not check the Gemini key status/i);
  await app.run('createAgent()');
  assert.equal(app.launches.length, 1);
});

test('a cancelled Gemini key check cannot launch or reset the next submission', async () => {
  const cancelled = deferred();
  const current = deferred();
  let attempts = 0;
  const app = renderer({ getGeminiKeyStatus: () => (++attempts === 1 ? cancelled : current).promise });
  const first = app.run('createAgent()');
  await tick();
  app.run('closeModal()');
  app.run("openModal(); state.chosenRole = 'video-scout';");
  app.control('#taskName').value = 'https://www.youtube.com/watch?v=second';
  const second = app.run('createAgent()');
  await tick();
  cancelled.resolve({ ok: true, hasKey: true });
  await first;
  assert.equal(app.launches.length, 0);
  assert.equal(app.control('#modal').classList.contains('hidden'), false);
  assert.equal(app.control('#modalCreate').disabled, true);
  current.resolve({ ok: true, hasKey: true });
  await second;
  assert.equal(app.launches.length, 1);
  assert.match(app.launches[0].videoUrl, /v=second$/);
});

for (const provider of ['gemini', 'claude']) {
  test(provider + ' shows a field error for a malformed Video Scout URL before starting', async () => {
    let keyChecks = 0;
    const app = renderer({ getGeminiKeyStatus: async () => { keyChecks++; return { ok: true, hasKey: true }; } });
    app.control('#videoProviderSelect').value = provider;
    const input = app.control('#taskName');
    input.value = 'https://[invalid';
    const result = await Promise.allSettled([app.run('createAgent()')]);
    assert.equal(app.control('#modal').classList.contains('hidden'), false, provider + ' leaves the dialog open');
    assert.equal(result[0].status, 'fulfilled');
    assert.equal(input.focused, true);
    assert.match(app.control('#videoUrlError').textContent, /valid video URL/i);
    assert.equal(app.control('#videoUrlError').classList.contains('hidden'), false);
    assert.equal(app.launches.length, 0);
    assert.equal(keyChecks, 0);
  });
}

for (const role of ['plain', 'builder']) {
  test('pending ' + role + ' worktree launch uses the submitted options', async () => {
    const worktree = deferred();
    const requests = [];
    const app = renderer({ newAgent: (request) => { requests.push(request); return worktree.promise; } });
    app.run("Object.assign(state, { chosenCli: 'codex', hardTask: true, chosenRole: " + JSON.stringify(role) + ' });');
    app.control('#taskName').value = 'first-task';
    const first = app.run('createAgent()');
    await tick();
    assert.equal(requests[0].task, 'first-task');
    app.run("openModal(); state.chosenCli = 'claude';");
    app.control('#taskName').value = 'second-task';
    worktree.resolve({ ok: true, worktree: '/synthetic/first-task' });
    await first;
    assert.equal(app.control('#modal').classList.contains('hidden'), false);
    assert.equal(app.launches[0].worktree, '/synthetic/first-task');
    if (role === 'plain') {
      assert.equal(app.launches[0].cli, 'codex');
    } else {
      assert.equal(app.launches[0].model, 'opus');
      assert.equal(app.launches[0].effort, 'xhigh');
    }
  });
}

for (const action of ['Resume', 'Start fresh']) {
  test(action + ' keeps the recovery offer until a PTY acknowledges startup', async () => {
    const failed = deferred();
    const retry = deferred();
    const dismissals = [];
    const starts = [];
    const row = { sessionId: 'synthetic-session', worktree: '/synthetic/recovery' };
    const app = renderer({
      sessionResumeOffer: async () => ({ ok: true, rows: [row] }),
      sessionResumeDismiss: async (id) => { dismissals.push(id); return { ok: true }; },
      ptyStart: (options) => { starts.push(options); return (starts.length === 1 ? failed : retry).promise; },
    });
    await app.run('offerResume()');
    const host = app.control('#resumeHost');
    const pending = host.button(action).onclick();
    await tick();
    assert.ok(host.button(action), 'the offer is still visible while startup is pending');
    assert.equal(host.button('Resume').disabled, true);
    assert.equal(host.button('Start fresh').disabled, true);
    assert.equal(starts.length, 1);
    assert.equal(starts[0].resumeSessionId, action === 'Resume' ? row.sessionId : undefined);
    assert.deepEqual(dismissals, []);
    if (action === 'Resume') failed.resolve({ ok: false, error: 'synthetic refusal' });
    else failed.reject(new Error('synthetic IPC rejection'));
    await pending;
    assert.ok(host.button(action), 'the offer is still available after startup fails');
    assert.match(host.textContent, /could not start this pane/i);
    assert.equal(host.button(action).disabled, false);
    const started = host.button(action).onclick();
    await tick();
    assert.deepEqual(dismissals, []);
    retry.resolve({ ok: true });
    await started;
    assert.equal(host.button(action), undefined);
    assert.deepEqual(dismissals, action === 'Start fresh' ? [row.sessionId] : []);
  });
}
