'use strict';
// Gemini key IPC (issue #161, gap audit A5a). The three Gemini key channels
// (`get-gemini-key-status`, `set-gemini-key`, `clear-gemini-key`) used to take any sender. They now
// run the same shared trusted-sender gate as the ABlueAgent token channels (trusted-ipc-sender.js,
// via main.js's `launcherGate`) BEFORE they read or touch the secure store, so a frame or document
// other than Mako's own entry document can neither overwrite nor clear the stored key.
//
// PURE (no Electron import): main.js injects the gate, safeStorage and the secure-store functions,
// so this is unit-testable in plain node (gemini-key-ipc.test.js). The plaintext key never travels
// back across IPC, and no refusal or error ever carries the key: a refusal is a bounded reason
// (at most a short error code is added), logged on the visible main-error channel.

function createGeminiKeyIpc(deps) {
  const d = deps || {};
  const assessSender = d.assessSender;                   // (event) => { ok, reason? }
  const isEncryptionAvailable = d.isEncryptionAvailable; // () => boolean
  const encryptString = d.encryptString;                 // (plain) => Buffer
  const loadSecure = d.loadSecure;                       // () => object, throws on failure
  const saveSecure = d.saveSecure;                       // (object) => void, throws on failure
  const getKey = d.getKey;                               // () => string | null
  const setKey = d.setKey;                               // (string | null) => void
  const logRefusal = d.logRefusal;                       // (line) => void
  for (const [name, fn] of [
    ['assessSender', assessSender], ['isEncryptionAvailable', isEncryptionAvailable],
    ['encryptString', encryptString], ['loadSecure', loadSecure], ['saveSecure', saveSecure],
    ['getKey', getKey], ['setKey', setKey], ['logRefusal', logRefusal],
  ]) {
    if (typeof fn !== 'function') throw new Error(`gemini-key-ipc: ${name} must be a function.`);
  }

  // `what` and `reason` are fixed strings from this file or the gate's bounded constants.
  function refuse(what, reason) {
    logRefusal(`Gemini key ${what} refused: ${reason}`);
    return { ok: false, error: reason };
  }

  // Only a short upper-case error code (EPERM, EBUSY, ENOSPC...) is ever reported from a caught
  // error: never its message, which could carry the key.
  function codeOf(err) {
    const c = err && err.code;
    return typeof c === 'string' && /^[A-Z][A-Z0-9_]{0,31}$/.test(c) ? c : 'no code';
  }

  function handleStatus(event) {
    const g = assessSender(event);
    if (!g.ok) return refuse('status', g.reason);
    return { ok: true, hasKey: getKey() !== null, available: isEncryptionAvailable() === true };
  }

  function handleSet(event, key) {
    const g = assessSender(event);
    if (!g.ok) return refuse('save', g.reason);
    if (typeof key !== 'string' || !key.trim()) return refuse('save', 'key is empty');
    if (!isEncryptionAvailable()) return refuse('save', 'safeStorage encryption not available on this system');
    const k = key.trim();
    let s;
    try { s = loadSecure(); }
    catch (err) { return refuse('save', `could not read secure.json [${codeOf(err)}]`); }
    try { s.geminiKeyEnc = encryptString(k).toString('base64'); }
    catch (err) { return refuse('save', `could not encrypt the key (safeStorage) [${codeOf(err)}]`); }
    try { saveSecure(s); }
    catch (err) { return refuse('save', `could not save secure.json [${codeOf(err)}]`); }
    setKey(k);
    return { ok: true };
  }

  function handleClear(event) {
    const g = assessSender(event);
    if (!g.ok) return refuse('clear', g.reason);
    let s;
    try { s = loadSecure(); }
    catch (err) { return refuse('clear', `could not read secure.json [${codeOf(err)}]`); }
    delete s.geminiKeyEnc;
    try { saveSecure(s); }
    catch (err) {
      // The stored key is still on disk, so the in-memory key stays too: say so, never pretend.
      return refuse('clear', `could not save secure.json; the key is still stored [${codeOf(err)}]`);
    }
    setKey(null);
    return { ok: true };
  }

  return { handleStatus, handleSet, handleClear };
}

module.exports = { createGeminiKeyIpc };
