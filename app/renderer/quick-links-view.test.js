'use strict';

const { createQuickLinksView, BUNDLE_ENTRIES, MAX_ENTRIES } = require('./quick-links-view');
const policy = require('../quick-links-policy');

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
  click() { if (!this.disabled) return this.onclick?.(); }
  input(value) {
    if (this.disabled) return;
    this.value = value;
    this.oninput?.();
  }
}
function makeDocument() {
  const ids = {};
  for (const [id, tag] of Object.entries({
    quickLinksPresets: 'div', quickLinksPresetsStatus: 'div',
    quickLinksStatus: 'div', quickLinksList: 'div', quickLinksManage: 'button', quickLinksEditor: 'div',
    quickLinksRows: 'div', quickLinksAdd: 'button', quickLinksAddBundle: 'button', quickLinksSave: 'button', quickLinksCancel: 'button',
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

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
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

  {
    const requests = [];
    const h = harness({ api: {
      listPresets: async () => ({ ok: true, presets: [{ id: 'preset-one', label: 'Example preset' }] }),
      openPreset: async (id) => { requests.push(id); return { ok: false, error: 'firefox-profile-missing' }; },
    } });
    await h.view.load();
    eq(requests.length, 0, 'listing presets does not launch Firefox');
    const [button] = h.document.ids.quickLinksPresets.children;
    eq(button.textContent, 'Example preset', 'the local label renders as button text');
    await button.onclick();
    eq(requests.join(','), 'preset-one', 'clicking the preset requests launch by ID');
    assert(h.document.ids.quickLinksPresetsStatus.textContent.includes('firefox-profile-missing'),
      'the preset refusal is visible');
    assert(h.logs.includes('[quick-links-ui] operation=preset-open result=refused reason=firefox-profile-missing\n'),
      'the preset refusal is logged');
  }
  {
    const h = harness({ api: { listPresets: async () => ({ ok: false, error: 'presets-file-missing' }) } });
    await h.view.load();
    assert(h.logs.includes('[quick-links-ui] operation=presets-list result=refused reason=presets-file-missing\n'),
      'a preset listing refusal is logged');
    const raw = harness({ api: { listPresets: async () => ({ ok: false, error: 'C:\\raw path' }) } });
    await raw.view.load();
    assert(raw.logs.includes('[quick-links-ui] operation=presets-list result=refused reason=unknown-error\n'),
      'an unbounded preset reason is logged as unknown-error');
  }

  process.stdout.write('\nediting waits for a successful list\n');
  {
    const list = deferred();
    const h = harness({ api: { list: () => list.promise } });
    const { quickLinksManage, quickLinksSave, quickLinksStatus } = h.document.ids;
    assert(quickLinksManage.disabled, 'Manage is disabled when mounted');
    const loading = h.view.load();
    assert(quickLinksManage.disabled, 'Manage is disabled while the list is pending');
    assert(quickLinksStatus.textContent.includes('Loading'), 'the pending load is visible');
    quickLinksManage.click();
    assert(!h.view.snapshot().managing, 'Manage cannot open an empty draft while loading');
    assert(quickLinksSave.disabled, 'Save is disabled while the list is pending');
    assert(!(await h.view.save()), 'a direct Save is refused while the list is pending');
    eq(h.calls.save.length, 0, 'the pending list cannot cause a write');
    list.resolve({ ok: true, config: defaults() });
    assert(await loading, 'the delayed list succeeds');
    assert(!quickLinksManage.disabled, 'Manage is enabled when the list succeeds');
    quickLinksManage.click();
    eq(h.view.snapshot().draft.map(({ id }) => id).join(','), 'ql-seed-a,ql-seed-b',
      'the draft starts from the saved links');
  }
  for (const [reason, list] of [
    ['read-failed', async () => ({ ok: false, error: 'read-failed' })],
    ['unknown-error', async () => ({ ok: true, config: {} })],
    ['ipc-failed', async () => { throw new Error('list failed'); }],
  ]) {
    const h = harness({ api: { list } });
    const { quickLinksManage, quickLinksList, quickLinksStatus } = h.document.ids;
    assert(!(await h.view.load()), `list returns false for ${reason}`);
    assert(quickLinksManage.disabled, `Manage stays disabled after ${reason}`);
    assert(!h.view.snapshot().loaded, `the list stays unloaded after ${reason}`);
    assert(!quickLinksList.textContent.includes('No Quick Links configured'), 'a failed read is distinct from an empty list');
    eq(quickLinksStatus.getAttribute('role'), 'alert', 'list failure is announced as an alert');
    eq(quickLinksStatus.textContent, `List refused — ${reason}.`, 'list failure shows the bounded reason');
    assert(!(await h.view.save()), 'a failed list still prevents a direct Save');
    eq(h.calls.save.length, 0, 'the failed list cannot cause a write');
  }
  {
    const h = harness();
    h.setCurrent({ schemaVersion: 1, entries: [] });
    assert(await h.view.load(), 'a successful empty list is loaded');
    h.document.ids.quickLinksManage.click();
    assert(h.view.snapshot().managing, 'a successful empty list can be edited');
    eq(h.view.snapshot().draft.length, 0, 'an empty list starts with an empty draft');
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

  process.stdout.write('\nthe editor is locked while Save is pending\n');
  for (const outcome of ['success', 'refusal', 'rejection']) {
    const pending = deferred();
    const saves = [];
    const h = harness({ api: { save: (text) => {
      saves.push(JSON.parse(text));
      if (saves.length === 1) return pending.promise;
      return Promise.resolve({ ok: true, config: saves.at(-1) });
    } } });
    await h.view.load();
    const { quickLinksManage, quickLinksRows, quickLinksAdd, quickLinksAddBundle, quickLinksCancel,
      quickLinksSave, quickLinksStatus } = h.document.ids;
    quickLinksManage.click();
    const [label, url, remove] = quickLinksRows.children[0].children;
    label.input('Submitted label');
    const saving = h.view.save();
    const controls = [label, url, remove, quickLinksAdd, quickLinksAddBundle, quickLinksCancel, quickLinksSave];
    assert(controls.every((control) => control.disabled), 'all editor controls are disabled during Save');
    eq(quickLinksStatus.textContent, 'Saving Quick Links…', 'pending Save is visible');
    label.input('Later label');
    url.input('https://later.test.invalid');
    remove.click();
    quickLinksAdd.click();
    quickLinksAddBundle.click();
    quickLinksCancel.click();
    assert(!(await h.view.save()), 'a duplicate direct Save is refused');
    eq(saves.length, 1, 'only one write is sent');
    assert(h.view.snapshot().managing, 'the editor stays open while Save is pending');
    eq(JSON.stringify(h.view.snapshot().draft), JSON.stringify(saves[0].entries),
      'the pending draft still matches the submitted links');

    if (outcome === 'success') {
      pending.resolve({ ok: true, config: saves[0] });
      assert(await saving, 'Save succeeds');
      assert(!h.view.snapshot().managing, 'successful Save closes the editor');
      eq(h.view.snapshot().entries[0].label, 'Submitted label', 'the submitted edit is kept');
      assert(!quickLinksManage.disabled, 'Manage can reopen after successful Save');
    } else {
      if (outcome === 'refusal') pending.resolve({ ok: false, error: 'write-failed' });
      else pending.reject(new Error('save failed'));
      assert(!(await saving), `Save returns false on ${outcome}`);
      const reason = outcome === 'refusal' ? 'write-failed' : 'ipc-failed';
      eq(quickLinksStatus.textContent, `Save refused — ${reason}.`, 'Save failure is visible');
      assert(h.view.snapshot().managing, 'failed Save keeps the editor open');
      const [retryLabel, retryUrl, retryRemove] = quickLinksRows.children[0].children;
      assert([retryLabel, retryUrl, retryRemove, quickLinksAdd, quickLinksAddBundle, quickLinksCancel, quickLinksSave]
        .every((control) => !control.disabled), 'editor controls recover after a failed Save');
      eq(retryLabel.value, 'Submitted label', 'the submitted draft survives a failed Save');
      retryLabel.input('Retried label');
      assert(await h.view.save(), 'the edited draft can be retried');
      eq(saves[1]?.entries[0]?.label, 'Retried label', 'retry submits the corrected draft');
    }
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

  process.stdout.write('\nMako bundle (S12)\n');
  {
    eq(BUNDLE_ENTRIES.map((link) => link.label).join(', '),
      'Claude desktop, Codex app, Mako PRs, Project board, Obsidian vault, Hermes docs, Dodaios docs',
      'the bundle holds the S12 links in order');
    for (const link of BUNDLE_ENTRIES) {
      assert(policy.validateEntry({ ...link }).ok, `bundle link ${link.id} passes main's policy`);
    }
    assert(policy.validateConfigObject({ schemaVersion: 1, entries: BUNDLE_ENTRIES.map((l) => ({ ...l })) }).ok,
      'the whole bundle passes main\'s config policy (unique IDs, within the cap)');
    assert(!BUNDLE_ENTRIES.some((link) => /hexona/i.test(link.url)), 'no guessed Hexona URL is bundled');
    eq(policy.MAX_ENTRIES, MAX_ENTRIES, 'renderer and policy share the entry cap');
  }
  {
    const h = harness(); await h.view.load(); h.view.startManage();
    eq(h.view.addBundle(), BUNDLE_ENTRIES.length, 'Add Mako bundle adds every bundle link');
    eq(h.calls.save.length, 0, 'adding the bundle stores nothing before Save');
    assert(await h.view.save(), 'Save persists the bundle');
    eq(h.view.snapshot().entries.length, 2 + BUNDLE_ENTRIES.length, 'seeds plus bundle are visible after Save');
    h.view.startManage();
    eq(h.view.addBundle(), 0, 'adding the bundle again adds nothing');
    assert(h.document.ids.quickLinksStatus.textContent.includes('already'), 'a repeat add says the bundle is there');
    h.view.cancel();
  }
  {
    const h = harness(); await h.view.load(); h.view.startManage();
    h.view.add();
    h.view.updateDraft('ql-random-fixture', { label: 'My PRs', url: BUNDLE_ENTRIES[2].url });
    eq(h.view.addBundle(), BUNDLE_ENTRIES.length - 1, 'a link with the same URL under another ID is not added twice');
  }
  {
    let n = 0;
    const ids = () => `ql-fill-${n += 1}`;
    const filler = harness({ makeId: ids }); await filler.view.load(); filler.view.startManage();
    for (let i = 0; i < 6; i += 1) filler.view.add();
    eq(filler.view.addBundle(), MAX_ENTRIES - 8, 'only the links that fit under the cap are added');
    assert(filler.document.ids.quickLinksStatus.classList.contains('ql-error'), 'a partial add is shown as an error');
    assert(filler.document.ids.quickLinksAddBundle.disabled, 'the bundle button is disabled at the cap');
    assert(filler.logs.join('').includes('operation=add-bundle result=refused reason=too-many-entries'),
      'a partial add is logged with a bounded reason');
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
