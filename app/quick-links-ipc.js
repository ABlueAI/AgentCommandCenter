'use strict';

// Dedicated Quick Links privilege boundary. It does not import or call the legacy open-external
// handler/bridge. The renderer can list/save the bounded config and request an open by stored ID only.

const { createTrustedSenderGate } = require('./trusted-ipc-sender');
const policy = require('./quick-links-policy');
const { STORE_REASON } = require('./quick-links-store');

const IPC_REASON = Object.freeze({
  INVALID_ID: 'invalid-id',
  UNKNOWN_ID: 'unknown-id',
  OPEN_FAILED: 'open-failed',
  STORE_FAILURE: 'store-failure',
});
const TRUST_REASONS = Object.freeze([
  'no-trusted-window', 'untrusted-sender', 'not-main-frame', 'untrusted-document',
]);
const ALLOWED_REASONS = new Set([
  ...Object.values(policy.REASON), ...Object.values(STORE_REASON), ...Object.values(IPC_REASON),
  ...TRUST_REASONS,
]);

function createQuickLinksIpc(deps) {
  const store = deps && deps.store;
  const openExternal = deps && deps.openExternal;
  const log = (deps && deps.log) || (() => {});
  if (!store || typeof store.load !== 'function' || typeof store.saveText !== 'function') {
    throw new Error('quick-links-ipc: store with load/saveText is required');
  }
  if (typeof openExternal !== 'function') throw new Error('quick-links-ipc: openExternal is required');
  const gate = createTrustedSenderGate({
    entryUrl: deps && deps.entryUrl,
    getTrustedWindow: deps && deps.getTrustedWindow,
  });

  function emit(operation, result, reason, count) {
    // Construct logs from bounded constants/numbers only. No URL, origin, host, path, query,
    // fragment, userinfo, label, config body, or caught exception is accepted as an argument.
    const suffix = typeof count === 'number' ? ` count=${Math.max(0, Math.min(count, policy.MAX_ENTRIES))}` : '';
    log(`[quick-links] operation=${operation} result=${result}${reason ? ` reason=${reason}` : ''}${suffix}`);
  }
  function boundedReason(reason) {
    return typeof reason === 'string' && ALLOWED_REASONS.has(reason) ? reason : IPC_REASON.STORE_FAILURE;
  }
  function refuse(operation, reason) {
    const bounded = boundedReason(reason);
    emit(operation, 'refused', bounded);
    return { ok: false, error: bounded };
  }
  function assess(event, operation) {
    const result = gate.assess(event);
    return result.ok ? null : refuse(operation, result.reason);
  }

  function handleList(event) {
    const denied = assess(event, 'list');
    if (denied) return denied;
    const result = store.load();
    if (!result || !result.ok) return refuse('list', (result && result.reason) || IPC_REASON.STORE_FAILURE);
    emit('list', 'ok', null, result.config.entries.length);
    return { ok: true, config: result.config };
  }

  function handleSave(event, text) {
    const denied = assess(event, 'save');
    if (denied) return denied;
    const result = store.saveText(text);
    if (!result || !result.ok) return refuse('save', (result && result.reason) || IPC_REASON.STORE_FAILURE);
    emit('save', 'ok', null, result.config.entries.length);
    return { ok: true, config: result.config };
  }

  async function handleOpen(event, id) {
    const denied = assess(event, 'open');
    if (denied) return denied;
    if (typeof id !== 'string' || id.length > policy.MAX_ID_LENGTH || !policy.ID_PATTERN.test(id)) {
      return refuse('open', IPC_REASON.INVALID_ID);
    }
    // Re-read and revalidate the complete persisted configuration for EVERY click. No cached renderer
    // value authorizes OS dispatch, and a malformed on-disk change fails closed.
    const loaded = store.load();
    if (!loaded || !loaded.ok) return refuse('open', (loaded && loaded.reason) || IPC_REASON.STORE_FAILURE);
    const entry = loaded.config.entries.find((candidate) => candidate.id === id);
    if (!entry) return refuse('open', IPC_REASON.UNKNOWN_ID);
    // Load validated it, and this second structured parse is deliberately immediate before dispatch:
    // an alternate/test store cannot smuggle an unvalidated URL through an allegedly valid config.
    const url = policy.validateUrl(entry.url);
    if (!url.ok) return refuse('open', url.reason);
    try { await openExternal(url.url); }
    catch { return refuse('open', IPC_REASON.OPEN_FAILED); }
    emit('open', 'ok');
    return { ok: true };
  }

  return { handleList, handleSave, handleOpen };
}

module.exports = { createQuickLinksIpc, IPC_REASON, ALLOWED_REASONS };
