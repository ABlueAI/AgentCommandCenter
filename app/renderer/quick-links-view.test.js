'use strict';

const { createQuickLinksView } = require('./quick-links-view');

let passed = 0, failed = 0;
function assert(condition, label) {
  if (condition) { process.stdout.write(`  ✓ ${label}\n`); passed += 1; }
  else { process.stderr.write(`  ✗ FAIL: ${label}\n`); failed += 1; }
}
function eq(actual, expected, label) { assert(actual === expected, `${label} (got ${JSON.stringify(actual)})`); }

class Classes {
  constructor(owner) { this.owner = owner; }
  values() { return this.owner.className.split(/\s+/).filter(Boolean); }
  toggle(name, force) {
    const set = new Set(this.values());
    const add = force === undefined ? !set.has(name) : force;
    if (add) set.add(name); else set.delete(name);
    this.owner.className = [...set].join(' ');
  }
  contains(name) { return this.values().includes(name); }
}
class Element {
  constructor(tag, id = '') {
    this.tagName = String(tag).toUpperCase(); this.id = id; this.children = []; this.attributes = {};
    this.className = ''; this.classList = new Classes(this); this._text = ''; this.value = ''; this.disabled = false;
  }
  set textContent(value) { this._text = String(value == null ? '' : value); this.children = []; }
  get textContent() { return this.children.length ? this.children.map((child) => child.textContent).join('') : this._text; }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return this.attributes[name] || null; }
  appendChild(child) { this.children.push(child); return child; }
  walk() { return this.children.flatMap((child) => [child, ...child.walk()]); }
}
function makeDocument() {
  const ids = {};
  for (const [id, tag] of Object.entries({
    quickLinksStatus: 'div', quickLinksList: 'div', quickLinksManage: 'button', quickLinksEditor: 'div',
    quickLinksRows: 'div', quickLinksAdd: 'button', quickLinksSave: 'button', quickLinksCancel: 'button',
  })) ids[id] = new Element(tag, id);
  return {
    ids,
    getElementById: (id) => ids[id] || null,
    createElement: (tag) => new Element(tag),
  };
}
function defaults() {
  return {
    schemaVersion: 1,
    entries: [
      { id: 'ql-seed-a', label: 'Starboard Platform', url: 'https://starboard.test.invalid/login' },
      { id: 'ql-seed-b', label: 'Outlook Web', url: 'https://outlook.test.invalid/mail' },
    ],
  };
}
function harness(overrides = {}) {
  const document = makeDocument();
  const calls = { list: 0, save: [], open: [] };
  const logs = [];
  let current = defaults();
  const api = {
    list: async () => { calls.list += 1; return { ok: true, config: current }; },
    save: async (text) => { calls.save.push(text); current = JSON.parse(text); return { ok: true, config: current }; },
    open: async (id) => { calls.open.push(id); return { ok: true }; },
    ...(overrides.api || {}),
  };
  const view = createQuickLinksView({
    document, api, log: (line) => logs.push(line), makeId: overrides.makeId || (() => 'ql-random-fixture'),
  });
  view.mount();
  return { document, calls, logs, api, view, setCurrent: (value) => { current = value; } };
}

(async () => {
  process.stdout.write('\ndefault rendering and explicit-click-only open\n');
  {
    const h = harness();
    eq(h.calls.open.length, 0, 'mount causes no automatic open');
    assert(await h.view.load(), 'list load succeeds');
    eq(h.calls.list, 1, 'load invokes list once');
    eq(h.calls.open.length, 0, 'load/render causes no automatic open');
    const buttons = h.document.ids.quickLinksList.children;
    eq(buttons.length, 2, 'exactly two default buttons render');
    eq(buttons[0].textContent, 'Starboard Platform', 'first exact default label renders');
    eq(buttons[1].textContent, 'Outlook Web', 'second exact default label renders');
    buttons[0].onclick();
    await new Promise((resolve) => setImmediate(resolve));
    eq(h.calls.open.join(','), 'ql-seed-a', 'only explicit button click requests open by ID');
  }

  process.stdout.write('\nadd/edit/remove with Save and Cancel\n');
  {
    const h = harness(); await h.view.load();
    h.view.startManage();
    assert(h.view.snapshot().managing, 'Manage enters edit mode');
    assert(h.view.add(), 'Add creates a draft entry');
    assert(h.view.updateDraft('ql-random-fixture', { label: 'Docs', url: 'https://docs.test.invalid' }),
      'new entry can be edited');
    assert(await h.view.save(), 'Save persists edited draft');
    eq(h.calls.save.length, 1, 'Save invokes persistence exactly once');
    eq(h.view.snapshot().entries.length, 3, 'saved added entry becomes visible');
    eq(h.view.snapshot().entries[2].label, 'Docs', 'saved edit is retained');
    h.view.startManage();
    assert(h.view.removeDraft('ql-seed-a'), 'Remove deletes an entry from the draft');
    assert(await h.view.save(), 'Save persists removal');
    eq(h.view.snapshot().entries.length, 2, 'removed entry is absent after Save');
    h.view.startManage();
    h.view.removeDraft('ql-seed-b');
    h.view.cancel();
    eq(h.view.snapshot().entries.length, 2, 'Cancel discards an unpersisted removal');
    eq(h.calls.save.length, 2, 'Cancel performs no save');
  }

  process.stdout.write('\nvisible bounded refusal and metadata-only renderer logs\n');
  {
    const label = 'LABEL_SENTINEL';
    const url = 'https://raw-sentinel.invalid/path?q=query-sentinel#fragment-sentinel';
    const h = harness({ api: {
      list: async () => ({ ok: true, config: { schemaVersion: 1, entries: [{ id: 'ql-safe', label, url }] } }),
      save: async () => ({ ok: false, error: 'url-protocol-not-allowed' }),
      open: async () => ({ ok: false, error: 'open-failed' }),
    } });
    await h.view.load();
    assert(!(await h.view.openById('ql-safe')), 'open refusal returns false');
    assert(h.document.ids.quickLinksStatus.classList.contains('ql-error'), 'open refusal is visibly styled as error');
    assert(h.document.ids.quickLinksStatus.textContent.includes('open-failed'), 'visible refusal names bounded reason');
    h.view.startManage();
    assert(!(await h.view.save()), 'save refusal returns false and keeps editor open');
    assert(h.view.snapshot().managing, 'save refusal does not discard the draft');
    const logText = h.logs.join('\n');
    for (const sentinel of [label, url, 'raw-sentinel.invalid', '/path', 'query-sentinel', 'fragment-sentinel']) {
      assert(!logText.includes(sentinel), `renderer logs exclude destination/label sentinel ${sentinel}`);
    }
  }
  {
    const h = harness({ api: { list: async () => ({ ok: false, error: 'https://raw-error.invalid/?secret=1' }) } });
    assert(!(await h.view.load()), 'list refusal returns false');
    eq(h.document.ids.quickLinksStatus.textContent, 'List refused — unknown-error.',
      'unbounded/raw refusal text is replaced by a constant');
    assert(!h.logs.join('').includes('raw-error'), 'raw refusal never enters renderer log');
  }
  {
    const h = harness({ makeId: () => '../bad' }); await h.view.load(); h.view.startManage();
    assert(!h.view.add(), 'bad generated ID refuses visibly');
    assert(h.document.ids.quickLinksStatus.textContent.includes('id-generation-failed'),
      'ID generation failure is visible');
  }

  process.stdout.write('\ninert DOM rendering\n');
  {
    const hostile = '<img src=x onerror=alert(1)><script>steal()</script>';
    const h = harness({ api: { list: async () => ({
      ok: true,
      config: { schemaVersion: 1, entries: [{ id: 'ql-hostile', label: hostile, url: 'https://fixture.test.invalid' }] },
    }) } });
    await h.view.load();
    eq(h.document.ids.quickLinksList.children[0].textContent, hostile, 'hostile label survives only as literal text');
    assert(h.document.ids.quickLinksList.children[0].children.length === 0, 'hostile label creates no child element');
  }

  process.stdout.write(`\nquick-links-view: ${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
})().catch((error) => {
  process.stderr.write(`quick-links-view test harness failed: ${error && error.stack}\n`);
  process.exit(1);
});
