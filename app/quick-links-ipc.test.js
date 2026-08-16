'use strict';

const { createQuickLinksIpc, IPC_REASON } = require('./quick-links-ipc');
const { SCHEMA_VERSION, REASON } = require('./quick-links-policy');

let passed = 0, failed = 0;
function assert(condition, label) {
  if (condition) { process.stdout.write(`  ✓ ${label}\n`); passed += 1; }
  else { process.stderr.write(`  ✗ FAIL: ${label}\n`); failed += 1; }
}
function eq(actual, expected, label) { assert(actual === expected, `${label} (got ${JSON.stringify(actual)})`); }
function config(url = 'https://fixture.test.invalid/path?secret=query#fragment', label = 'SENTINEL_LABEL') {
  return { schemaVersion: SCHEMA_VERSION, entries: [{ id: 'ql-fixture', label, url }] };
}

function harness(overrides = {}) {
  const mainFrame = { url: 'file:///trusted/index.html' };
  const webContents = { mainFrame };
  const win = { webContents, isDestroyed: () => false };
  const logs = [];
  const opens = [];
  let stored = config();
  const store = {
    load: () => ({ ok: true, config: stored }),
    saveText: (text) => {
      stored = JSON.parse(text);
      return { ok: true, config: stored };
    },
  };
  const deps = {
    entryUrl: 'file:///trusted/index.html',
    getTrustedWindow: () => win,
    store,
    openExternal: async (url) => { opens.push(url); },
    log: (line) => logs.push(line),
    ...overrides,
  };
  const ipc = createQuickLinksIpc(deps);
  return {
    ipc, logs, opens, store, win, webContents, mainFrame,
    trustedEvent: { sender: webContents, senderFrame: mainFrame },
    setStored: (value) => { stored = value; },
  };
}

(async () => {
  process.stdout.write('\ntrusted sender on every operation\n');
  {
    const h = harness();
    const wrong = { sender: {}, senderFrame: h.mainFrame };
    eq(h.ipc.handleList(wrong).error, 'untrusted-sender', 'list rejects wrong webContents');
    eq(h.ipc.handleSave(wrong, JSON.stringify(config())).error, 'untrusted-sender', 'save rejects wrong webContents');
    eq((await h.ipc.handleOpen(wrong, 'ql-fixture')).error, 'untrusted-sender', 'open rejects wrong webContents');
    eq(h.opens.length, 0, 'no untrusted operation reaches shell');
  }
  {
    const h = harness({ getTrustedWindow: () => null });
    eq(h.ipc.handleList({}).error, 'no-trusted-window', 'missing trusted window refuses');
  }
  {
    const h = harness();
    eq(h.ipc.handleList({ sender: h.webContents, senderFrame: { url: h.mainFrame.url } }).error,
      'not-main-frame', 'subframe refuses even with matching URL');
    h.mainFrame.url = 'file:///wrong/index.html';
    eq(h.ipc.handleList(h.trustedEvent).error, 'untrusted-document', 'wrong document refuses');
  }
  {
    const h = harness();
    h.win.isDestroyed = () => true;
    eq(h.ipc.handleList(h.trustedEvent).error, 'no-trusted-window', 'destroyed window refuses');
  }
  {
    const mainFrame = {};
    Object.defineProperty(mainFrame, 'url', { get: () => { throw new Error('torn-down frame sentinel'); } });
    const webContents = {};
    Object.defineProperty(webContents, 'mainFrame', { get: () => mainFrame });
    const win = { webContents, isDestroyed: () => false };
    const h = harness({ getTrustedWindow: () => win });
    eq(h.ipc.handleList({ sender: webContents, senderFrame: mainFrame }).error,
      'untrusted-document', 'torn-down frame URL getter refuses without throw');
  }
  {
    const webContents = {};
    Object.defineProperty(webContents, 'mainFrame', { get: () => { throw new Error('torn-down webContents'); } });
    const win = { webContents, isDestroyed: () => false };
    const h = harness({ getTrustedWindow: () => win });
    eq(h.ipc.handleList({ sender: webContents, senderFrame: {} }).error,
      'not-main-frame', 'torn-down mainFrame getter refuses without throw');
  }

  process.stdout.write('\nlist/save boundary\n');
  {
    const h = harness();
    const listed = h.ipc.handleList(h.trustedEvent);
    assert(listed.ok && listed.config.entries.length === 1, 'trusted list returns bounded config');
    const saved = h.ipc.handleSave(h.trustedEvent, JSON.stringify(config('https://second.test.invalid', 'Second')));
    assert(saved.ok && saved.config.entries[0].label === 'Second', 'trusted save delegates raw text to store');
  }
  {
    const h = harness({ store: { load: () => ({ ok: false, reason: 'https://RAW-SENTINEL.invalid/?q=SECRET' }), saveText: () => ({ ok: false, reason: 'LABEL_SENTINEL' }) } });
    eq(h.ipc.handleList(h.trustedEvent).error, IPC_REASON.STORE_FAILURE, 'unknown store list reason is bounded');
    eq(h.ipc.handleSave(h.trustedEvent, '{}').error, IPC_REASON.STORE_FAILURE, 'unknown store save reason is bounded');
    assert(!h.logs.join('\n').includes('RAW-SENTINEL') && !h.logs.join('\n').includes('LABEL_SENTINEL'),
      'unknown store details never enter logs');
  }

  process.stdout.write('\nopen-by-stored-ID only and immediate URL revalidation\n');
  {
    const h = harness();
    eq((await h.ipc.handleOpen(h.trustedEvent)).error, IPC_REASON.INVALID_ID, 'missing ID refuses');
    eq((await h.ipc.handleOpen(h.trustedEvent, '../url')).error, IPC_REASON.INVALID_ID, 'malformed ID refuses');
    eq((await h.ipc.handleOpen(h.trustedEvent, 'ql-missing')).error, IPC_REASON.UNKNOWN_ID, 'unknown ID refuses');
    eq(h.opens.length, 0, 'shell is not called on missing/malformed/unknown ID');
    const opened = await h.ipc.handleOpen(h.trustedEvent, 'ql-fixture');
    assert(opened.ok, 'known stored ID opens');
    eq(h.opens.length, 1, 'shell called exactly once for explicit accepted click');
    eq(h.opens[0], 'https://fixture.test.invalid/path?secret=query#fragment', 'main resolved the stored URL');
  }
  {
    let loads = 0;
    const h = harness({
      store: {
        load: () => {
          loads += 1;
          return { ok: true, config: loads === 1 ? config('https://first.test.invalid') : config('javascript:alert(1)') };
        },
        saveText: () => ({ ok: false, reason: 'write-failed' }),
      },
    });
    assert((await h.ipc.handleOpen(h.trustedEvent, 'ql-fixture')).ok, 'first currently stored valid URL opens');
    eq((await h.ipc.handleOpen(h.trustedEvent, 'ql-fixture')).error, REASON.URL_PROTOCOL,
      'stored URL is re-read and immediately revalidated on the next open');
    eq(h.opens.length, 1, 'shell is not called for revalidation refusal');
  }

  process.stdout.write('\nshell failure is bounded and visible\n');
  {
    const h = harness({ openExternal: () => { throw new Error('https://THROW-SENTINEL.invalid/?secret=1'); } });
    eq((await h.ipc.handleOpen(h.trustedEvent, 'ql-fixture')).error, IPC_REASON.OPEN_FAILED,
      'synchronous shell throw becomes bounded failure');
    assert(!h.logs.join('\n').includes('THROW-SENTINEL'), 'thrown raw URL never reaches logs');
  }
  {
    const h = harness({ openExternal: () => Promise.reject(new Error('REJECT_SENTINEL_LABEL')) });
    eq((await h.ipc.handleOpen(h.trustedEvent, 'ql-fixture')).error, IPC_REASON.OPEN_FAILED,
      'shell promise rejection becomes bounded failure');
    assert(!h.logs.join('\n').includes('REJECT_SENTINEL'), 'rejection detail never reaches logs');
  }

  process.stdout.write('\nmetadata-only log contract\n');
  {
    const rawUrl = 'https://userinfo-sentinel:password@raw-sentinel.invalid/path?q=query-sentinel#fragment-sentinel';
    const label = 'label-sentinel';
    const h = harness();
    h.setStored(config('https://safe.test.invalid/path?q=query-sentinel#fragment-sentinel', label));
    h.ipc.handleList(h.trustedEvent);
    await h.ipc.handleOpen(h.trustedEvent, 'ql-fixture');
    const text = h.logs.join('\n');
    for (const sentinel of [rawUrl, label, 'safe.test.invalid', '/path', 'query-sentinel', 'fragment-sentinel', 'userinfo-sentinel']) {
      assert(!text.includes(sentinel), `logs exclude raw destination/label sentinel ${sentinel}`);
    }
    assert(text.includes('operation=list result=ok count=1'), 'success log contains bounded list metadata');
    assert(text.includes('operation=open result=ok'), 'success log contains bounded open metadata');
  }

  process.stdout.write(`\nquick-links-ipc: ${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
})().catch((error) => {
  process.stderr.write(`quick-links-ipc test harness failed: ${error && error.stack}\n`);
  process.exit(1);
});
