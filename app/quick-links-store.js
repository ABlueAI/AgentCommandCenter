'use strict';

// Main-owned Quick Links persistence. The path is fixed beneath Electron userData; callers never
// supply a path or filename. Malformed data is preserved and refused, never repaired or replaced.

const fs = require('fs');
const path = require('path');
const policy = require('./quick-links-policy');

const CONFIG_FILENAME = 'quick-links.json';
const STORE_REASON = Object.freeze({
  NOT_FOUND: 'config-not-found',
  DEFAULTS_UNAVAILABLE: 'defaults-unavailable',
  READ_FAILED: 'read-failed',
  REPARSE_POINT: 'reparse-point-refused',
  NOT_REGULAR_FILE: 'not-regular-file',
  INVALID_UTF8: 'invalid-utf8',
  WRITE_FAILED: 'write-failed',
  EXISTING_CONFIG_INVALID: 'existing-config-invalid',
});

function refuse(reason) { return { ok: false, reason }; }

function createQuickLinksStore({ userDataDir, defaultConfig = null, fsImpl = fs } = {}) {
  if (typeof userDataDir !== 'string' || !userDataDir) {
    throw new Error('quick-links-store: userDataDir is required');
  }
  const configPath = path.join(userDataDir, CONFIG_FILENAME);
  const defaults = defaultConfig === null ? null : policy.validateConfigObject(defaultConfig);
  if (defaults && !defaults.ok) throw new Error('quick-links-store: defaultConfig must pass policy');

  function inspectAndRead() {
    let stat;
    try { stat = fsImpl.lstatSync(configPath); }
    catch (error) {
      return refuse(error && error.code === 'ENOENT' ? STORE_REASON.NOT_FOUND : STORE_REASON.READ_FAILED);
    }
    if (stat.isSymbolicLink()) return refuse(STORE_REASON.REPARSE_POINT);
    if (!stat.isFile()) return refuse(STORE_REASON.NOT_REGULAR_FILE);
    if (stat.size > policy.MAX_CONFIG_BYTES) return refuse(policy.REASON.CONFIG_TOO_LARGE);
    let bytes;
    try { bytes = fsImpl.readFileSync(configPath); }
    catch { return refuse(STORE_REASON.READ_FAILED); }
    if (!Buffer.isBuffer(bytes)) return refuse(STORE_REASON.READ_FAILED);
    if (bytes.length > policy.MAX_CONFIG_BYTES) return refuse(policy.REASON.CONFIG_TOO_LARGE);
    let text;
    try { text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes); }
    catch { return refuse(STORE_REASON.INVALID_UTF8); }
    return policy.parseConfigText(text);
  }

  function writeCanonical(config) {
    const serialized = policy.serializeConfig(config);
    if (!serialized.ok) return serialized;
    const tempPath = `${configPath}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
    let fd = null;
    try {
      // Exclusive temp creation prevents collision/reuse. Flush before the one rename so a reported
      // success means the bytes reached the OS; a failed rename leaves the previous canonical file.
      fd = fsImpl.openSync(tempPath, 'wx', 0o600);
      fsImpl.writeFileSync(fd, serialized.text, { encoding: 'utf8' });
      fsImpl.fsyncSync(fd);
      fsImpl.closeSync(fd);
      fd = null;
      fsImpl.renameSync(tempPath, configPath);
    } catch {
      if (fd !== null) { try { fsImpl.closeSync(fd); } catch { /* bounded cleanup */ } }
      try { fsImpl.rmSync(tempPath, { force: true }); } catch { /* bounded cleanup */ }
      return refuse(STORE_REASON.WRITE_FAILED);
    }
    return { ok: true, config: serialized.config };
  }

  function load() {
    const result = inspectAndRead();
    if (result.ok) return result;
    if (result.reason !== STORE_REASON.NOT_FOUND) return result;
    if (!defaults) return refuse(STORE_REASON.DEFAULTS_UNAVAILABLE);
    // First run only. A seed is persisted with the same atomic writer as an explicit save.
    return writeCanonical(defaults.config);
  }

  function saveText(text) {
    const parsed = policy.parseConfigText(text);
    if (!parsed.ok) return parsed;
    const existing = inspectAndRead();
    if (!existing.ok && existing.reason !== STORE_REASON.NOT_FOUND) {
      // Never overwrite evidence of malformed/corrupt/unreadable user data as a side effect of Save.
      return refuse(STORE_REASON.EXISTING_CONFIG_INVALID);
    }
    return writeCanonical(parsed.config);
  }

  return { load, saveText, configPath: () => configPath };
}

module.exports = { createQuickLinksStore, CONFIG_FILENAME, STORE_REASON };
