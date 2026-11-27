'use strict';

(function publish(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.ccQuickLinksView = api;
})(typeof window !== 'undefined' ? window : globalThis, function factory() {
  const SCHEMA_VERSION = 1;
  const MAX_ENTRIES = 12;
  const ID_PATTERN = /^[a-z0-9](?:[a-z0-9_-]*[a-z0-9])?$/;
  // Session S12's bundle. Fixed IDs let "Add Mako bundle" skip links already added; main still
  // validates every entry on Save (quick-links-policy.js, including its APP_LAUNCH_URLS list).
  // Blue's business-platform login is not here: the "Starboard Platform" seed already opens it.
  const BUNDLE_ENTRIES = Object.freeze([
    Object.freeze({ id: 'ql-bundle-claude', label: 'Claude desktop', url: 'claude://claude.ai/new' }),
    Object.freeze({ id: 'ql-bundle-codex', label: 'Codex app', url: 'codex://threads/new' }),
    Object.freeze({ id: 'ql-bundle-prs', label: 'Mako PRs', url: 'https://github.com/ABlueAI/AgentCommandCenter/pulls' }),
    Object.freeze({ id: 'ql-bundle-board', label: 'Project board', url: 'https://github.com/users/ABlueAI/projects' }),
    Object.freeze({ id: 'ql-bundle-obsidian', label: 'Obsidian vault', url: 'obsidian://open' }),
    Object.freeze({ id: 'ql-bundle-hermes', label: 'Hermes docs', url: 'https://hermes-agent.nousresearch.com/docs/' }),
    Object.freeze({ id: 'ql-bundle-dodaios', label: 'Dodaios docs', url: 'https://github.com/Dodaios/Dodaios/tree/main/docs' }),
  ]);

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

    const state = { entries: [], draft: [], loadStatus: 'loading', managing: false, saving: false };
    const byId = (id) => doc.getElementById(id);
    const canEdit = () => state.loadStatus === 'ready' && state.managing && !state.saving;

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
      setStatus('Opened.', false);
      log('[quick-links-ui] operation=open result=ok\n');
      return true;
    }

    function renderList() {
      const host = byId('quickLinksList');
      host.textContent = '';
      byId('quickLinksManage').disabled = state.loadStatus !== 'ready';
      if (state.loadStatus === 'failed') return;
      if (state.loadStatus === 'loading') {
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
      if (!canEdit()) return false;
      const entry = state.draft.find((candidate) => candidate.id === id);
      if (!entry) return false;
      if (patch && typeof patch.label === 'string') entry.label = patch.label;
      if (patch && typeof patch.url === 'string') entry.url = patch.url;
      return true;
    }

    function removeDraft(id) {
      if (!canEdit()) return false;
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
        label.oninput = () => { updateDraft(entry.id, { label: label.value }); };
        const url = doc.createElement('input');
        url.type = 'url'; url.value = entry.url; url.maxLength = 2048;
        url.setAttribute('aria-label', `${entry.label || 'Quick Link'} URL`); url.placeholder = 'https://…';
        url.spellcheck = false; url.autocomplete = 'off';
        url.oninput = () => { updateDraft(entry.id, { url: url.value }); };
        const remove = makeButton('Remove', 'ghost ql-remove');
        remove.setAttribute('aria-label', `Remove ${entry.label || 'Quick Link'}`);
        remove.onclick = () => { removeDraft(entry.id); };
        row.appendChild(label); row.appendChild(url); row.appendChild(remove); host.appendChild(row);
      }
      updateEditorControls();
    }

    function updateEditorControls() {
      const locked = !canEdit();
      const atCapacity = state.draft.length >= MAX_ENTRIES;
      byId('quickLinksAdd').disabled = locked || atCapacity;
      byId('quickLinksAddBundle').disabled = locked || atCapacity;
      byId('quickLinksSave').disabled = locked;
      byId('quickLinksCancel').disabled = locked;
      for (const row of byId('quickLinksRows').children) {
        for (const control of row.children) control.disabled = locked;
      }
    }

    function setManaging(enabled) {
      state.managing = enabled === true;
      byId('quickLinksList').classList.toggle('hidden', state.managing);
      byId('quickLinksManage').classList.toggle('hidden', state.managing);
      byId('quickLinksEditor').classList.toggle('hidden', !state.managing);
    }

    function startManage() {
      if (state.loadStatus !== 'ready' || state.managing) return;
      state.draft = state.entries.map((entry) => ({ ...entry }));
      setManaging(true);
      renderEditor();
      setStatus('Edit links, then Save Changes or Cancel.', false);
    }
    function cancel() {
      if (!canEdit()) return;
      state.draft = [];
      setManaging(false);
      updateEditorControls();
      setStatus('', false);
    }
    function add() {
      if (!canEdit()) return false;
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

    // Adds the bundle links the draft doesn't already have (same ID or same URL), in order, up to
    // the entry cap. Nothing is stored until Save Changes.
    function addBundle() {
      if (!canEdit()) return 0;
      const missing = BUNDLE_ENTRIES.filter((link) => !state.draft.some(
        (entry) => entry.id === link.id || entry.url === link.url));
      if (missing.length === 0) { setStatus('The Mako bundle is already in your links.', false); return 0; }
      const room = MAX_ENTRIES - state.draft.length;
      const added = missing.slice(0, Math.max(0, room));
      for (const link of added) state.draft.push({ ...link });
      renderEditor();
      if (added.length < missing.length) {
        setStatus(`Added ${added.length} of ${missing.length} bundle links: the limit is ${MAX_ENTRIES} links. Remove some, then add the bundle again.`, true);
        log(`[quick-links-ui] operation=add-bundle result=refused reason=too-many-entries count=${added.length}\n`);
        return added.length;
      }
      setStatus(`Added ${added.length} bundle link${added.length === 1 ? '' : 's'}. Save Changes to keep them.`, false);
      return added.length;
    }

    async function save() {
      if (!canEdit()) return false;
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
      state.saving = true;
      updateEditorControls();
      setStatus('Saving Quick Links…', false);
      let result;
      try { result = await api.save(text); }
      catch { result = { error: 'ipc-failed' }; }
      state.saving = false;
      if (!result || !result.ok || !result.config || !Array.isArray(result.config.entries)) {
        updateEditorControls();
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

    async function loadPresets() {
      const host = byId('quickLinksPresets');
      const status = byId('quickLinksPresetsStatus');
      host.textContent = '';
      status.textContent = '';
      let result;
      try { result = await api.listPresets(); }
      catch { result = { error: 'ipc-failed' }; }
      if (!result?.ok) {
        const safe = boundedReason(result?.error);
        status.textContent = `Firefox presets unavailable — ${safe}.`;
        log(`[quick-links-ui] operation=presets-list result=refused reason=${safe}\n`);
        return;
      }
      for (const preset of result.presets) {
        const button = makeButton(preset.label, 'action ql-open');
        button.onclick = async () => {
          button.disabled = true;
          let opened;
          try { opened = await api.openPreset(preset.id); }
          catch { opened = { error: 'ipc-failed' }; }
          button.disabled = false;
          if (opened?.ok) {
            status.textContent = 'Firefox launch requested.';
            log('[quick-links-ui] operation=preset-open result=ok\n');
          } else {
            const safe = boundedReason(opened?.error);
            status.textContent = `Firefox preset refused — ${safe}.`;
            log(`[quick-links-ui] operation=preset-open result=refused reason=${safe}\n`);
          }
        };
        host.appendChild(button);
      }
    }

    async function load() {
      state.loadStatus = 'loading';
      renderList();
      updateEditorControls();
      setStatus('Loading Quick Links…', false);
      if (typeof api.listPresets === 'function') await loadPresets();
      let result;
      try { result = await api.list(); }
      catch { result = { error: 'ipc-failed' }; }
      if (!result || !result.ok || !result.config || !Array.isArray(result.config.entries)) {
        state.loadStatus = 'failed';
        state.entries = [];
        renderList();
        announceFailure('List', result && result.error);
        return false;
      }
      state.entries = result.config.entries.map((entry) => ({ ...entry }));
      state.loadStatus = 'ready';
      renderList();
      updateEditorControls();
      setStatus('', false);
      log(`[quick-links-ui] operation=list result=ok count=${state.entries.length}\n`);
      return true;
    }

    function mount() {
      byId('quickLinksManage').onclick = () => startManage();
      byId('quickLinksAdd').onclick = () => add();
      byId('quickLinksAddBundle').onclick = () => { addBundle(); };
      byId('quickLinksSave').onclick = () => { save(); };
      byId('quickLinksCancel').onclick = () => cancel();
      renderList();
      updateEditorControls();
    }

    return {
      mount, load, startManage, cancel, add, addBundle, save, openById, updateDraft, removeDraft,
      snapshot: () => ({
        entries: state.entries.map((entry) => ({ ...entry })),
        draft: state.draft.map((entry) => ({ ...entry })),
        loaded: state.loadStatus === 'ready',
        managing: state.managing,
      }),
    };
  }

  return { createQuickLinksView, boundedReason, SCHEMA_VERSION, MAX_ENTRIES, BUNDLE_ENTRIES };
});
