'use strict';

(function publish(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.ccQuickLinksView = api;
})(typeof window !== 'undefined' ? window : globalThis, function factory() {
  const SCHEMA_VERSION = 1;
  const MAX_ENTRIES = 12;
  const ID_PATTERN = /^[a-z0-9](?:[a-z0-9_-]*[a-z0-9])?$/;

  function boundedReason(value) {
    return typeof value === 'string' && /^[a-z0-9-]{1,64}$/.test(value) ? value : 'unknown-error';
  }

  function createQuickLinksView(deps) {
    const doc = deps && deps.document;
    const api = deps && deps.api;
    const log = (deps && deps.log) || (() => {});
    const makeId = (deps && deps.makeId) || (() => {
      const uuid = globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function'
        ? globalThis.crypto.randomUUID().toLowerCase()
        : '';
      return uuid ? `ql-${uuid}` : '';
    });
    if (!doc || typeof doc.getElementById !== 'function') throw new Error('quick-links-view: document is required');
    if (!api || typeof api.list !== 'function' || typeof api.save !== 'function' || typeof api.open !== 'function') {
      throw new Error('quick-links-view: list/save/open API is required');
    }

    const state = { entries: [], draft: [], loaded: false, managing: false };
    const byId = (id) => doc.getElementById(id);

    function setStatus(message, error) {
      const node = byId('quickLinksStatus');
      node.textContent = message;
      node.classList.toggle('ql-error', error === true);
      node.setAttribute('role', error ? 'alert' : 'status');
    }
    function announceFailure(operation, reason) {
      const safe = boundedReason(reason);
      setStatus(`${operation} refused — ${safe}.`, true);
      log(`[quick-links-ui] operation=${operation.toLowerCase()} result=refused reason=${safe}\n`);
    }

    function makeButton(text, className) {
      const button = doc.createElement('button');
      button.type = 'button';
      button.className = className;
      button.textContent = text;
      return button;
    }

    async function openById(id) {
      let result;
      try { result = await api.open(id); }
      catch { announceFailure('Open', 'ipc-failed'); return false; }
      if (!result || !result.ok) { announceFailure('Open', result && result.error); return false; }
      setStatus('Opened in your default browser.', false);
      log('[quick-links-ui] operation=open result=ok\n');
      return true;
    }

    function renderList() {
      const host = byId('quickLinksList');
      host.textContent = '';
      if (!state.loaded) {
        const pending = doc.createElement('div'); pending.className = 'ql-empty'; pending.textContent = 'Loading…';
        host.appendChild(pending); return;
      }
      if (state.entries.length === 0) {
        const empty = doc.createElement('div'); empty.className = 'ql-empty'; empty.textContent = 'No Quick Links configured.';
        host.appendChild(empty); return;
      }
      for (const entry of state.entries) {
        const button = makeButton(entry.label, 'action ql-open');
        button.setAttribute('data-link-id', entry.id);
        button.onclick = () => { openById(entry.id); };
        host.appendChild(button);
      }
    }

    function updateDraft(id, patch) {
      const entry = state.draft.find((candidate) => candidate.id === id);
      if (!entry) return false;
      if (patch && typeof patch.label === 'string') entry.label = patch.label;
      if (patch && typeof patch.url === 'string') entry.url = patch.url;
      return true;
    }

    function removeDraft(id) {
      const before = state.draft.length;
      state.draft = state.draft.filter((entry) => entry.id !== id);
      renderEditor();
      return state.draft.length !== before;
    }

    function renderEditor() {
      const host = byId('quickLinksRows');
      host.textContent = '';
      for (const entry of state.draft) {
        const row = doc.createElement('div'); row.className = 'ql-edit-row';
        const label = doc.createElement('input');
        label.type = 'text'; label.value = entry.label; label.maxLength = 80;
        label.setAttribute('aria-label', 'Quick Link label'); label.placeholder = 'Label';
        label.oninput = () => { entry.label = label.value; };
        const url = doc.createElement('input');
        url.type = 'url'; url.value = entry.url; url.maxLength = 2048;
        url.setAttribute('aria-label', `${entry.label || 'Quick Link'} URL`); url.placeholder = 'https://…';
        url.spellcheck = false; url.autocomplete = 'off';
        url.oninput = () => { entry.url = url.value; };
        const remove = makeButton('Remove', 'ghost ql-remove');
        remove.setAttribute('aria-label', `Remove ${entry.label || 'Quick Link'}`);
        remove.onclick = () => { removeDraft(entry.id); };
        row.appendChild(label); row.appendChild(url); row.appendChild(remove); host.appendChild(row);
      }
      byId('quickLinksAdd').disabled = state.draft.length >= MAX_ENTRIES;
    }

    function setManaging(enabled) {
      state.managing = enabled === true;
      byId('quickLinksList').classList.toggle('hidden', state.managing);
      byId('quickLinksManage').classList.toggle('hidden', state.managing);
      byId('quickLinksEditor').classList.toggle('hidden', !state.managing);
    }

    function startManage() {
      state.draft = state.entries.map((entry) => ({ ...entry }));
      renderEditor();
      setManaging(true);
      setStatus('Edit links, then Save Changes or Cancel.', false);
    }
    function cancel() {
      state.draft = [];
      setManaging(false);
      setStatus('', false);
    }
    function add() {
      if (state.draft.length >= MAX_ENTRIES) { announceFailure('Add', 'too-many-entries'); return false; }
      const id = makeId();
      if (typeof id !== 'string' || id.length > 64 || !ID_PATTERN.test(id)
          || state.draft.some((entry) => entry.id === id)) {
        announceFailure('Add', 'id-generation-failed'); return false;
      }
      state.draft.push({ id, label: '', url: '' });
      renderEditor();
      return true;
    }

    async function save() {
      // Normalization is a UI convenience only; main parses, bounds, and validates independently.
      const config = {
        schemaVersion: SCHEMA_VERSION,
        entries: state.draft.map((entry) => ({
          id: entry.id,
          label: typeof entry.label === 'string' ? entry.label.trim() : entry.label,
          url: typeof entry.url === 'string' ? entry.url.trim() : entry.url,
        })),
      };
      let text;
      try { text = JSON.stringify(config); }
      catch { announceFailure('Save', 'serialization-failed'); return false; }
      let result;
      try { result = await api.save(text); }
      catch { announceFailure('Save', 'ipc-failed'); return false; }
      if (!result || !result.ok || !result.config || !Array.isArray(result.config.entries)) {
        announceFailure('Save', result && result.error); return false;
      }
      state.entries = result.config.entries.map((entry) => ({ ...entry }));
      state.draft = [];
      setManaging(false);
      renderList();
      setStatus('Quick Links saved.', false);
      log(`[quick-links-ui] operation=save result=ok count=${state.entries.length}\n`);
      return true;
    }

    async function load() {
      setStatus('Loading Quick Links…', false);
      let result;
      try { result = await api.list(); }
      catch { state.loaded = true; renderList(); announceFailure('List', 'ipc-failed'); return false; }
      state.loaded = true;
      if (!result || !result.ok || !result.config || !Array.isArray(result.config.entries)) {
        state.entries = []; renderList(); announceFailure('List', result && result.error); return false;
      }
      state.entries = result.config.entries.map((entry) => ({ ...entry }));
      renderList();
      setStatus('', false);
      log(`[quick-links-ui] operation=list result=ok count=${state.entries.length}\n`);
      return true;
    }

    function mount() {
      byId('quickLinksManage').onclick = () => startManage();
      byId('quickLinksAdd').onclick = () => add();
      byId('quickLinksSave').onclick = () => { save(); };
      byId('quickLinksCancel').onclick = () => cancel();
      renderList();
    }

    return {
      mount, load, startManage, cancel, add, save, openById, updateDraft, removeDraft,
      snapshot: () => ({
        entries: state.entries.map((entry) => ({ ...entry })),
        draft: state.draft.map((entry) => ({ ...entry })),
        loaded: state.loaded,
        managing: state.managing,
      }),
    };
  }

  return { createQuickLinksView, boundedReason, SCHEMA_VERSION, MAX_ENTRIES };
});
