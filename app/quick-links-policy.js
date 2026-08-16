'use strict';

// Quick Links pure policy. No Electron, filesystem, or shell dependency lives here.
// The same closed, versioned schema governs persisted data, save requests, and the
// immediate pre-open URL revalidation in quick-links-ipc.js.

const SCHEMA_VERSION = 1;
const MAX_CONFIG_BYTES = 32 * 1024;
const MAX_ENTRIES = 12;
const MAX_ID_LENGTH = 64;
const MAX_LABEL_LENGTH = 80;
const MAX_URL_LENGTH = 2048;

const DEFAULT_LABELS = Object.freeze(['Starboard Platform', 'Outlook Web']);
const DEFAULT_IDS = Object.freeze(['ql-seed-a', 'ql-seed-b']);

const REASON = Object.freeze({
  CONFIG_NOT_STRING: 'config-not-string',
  CONFIG_TOO_LARGE: 'config-too-large',
  INVALID_JSON: 'invalid-json',
  CONFIG_NOT_OBJECT: 'config-not-object',
  CONFIG_UNKNOWN_FIELD: 'config-unknown-field',
  VERSION_MISMATCH: 'version-mismatch',
  ENTRIES_NOT_ARRAY: 'entries-not-array',
  TOO_MANY_ENTRIES: 'too-many-entries',
  ENTRY_NOT_OBJECT: 'entry-not-object',
  ENTRY_UNKNOWN_FIELD: 'entry-unknown-field',
  ID_INVALID: 'id-invalid',
  ID_TOO_LONG: 'id-too-long',
  DUPLICATE_ID: 'duplicate-id',
  LABEL_INVALID: 'label-invalid',
  LABEL_TOO_LONG: 'label-too-long',
  URL_NOT_STRING: 'url-not-string',
  URL_EMPTY: 'url-empty',
  URL_TOO_LONG: 'url-too-long',
  URL_SURROUNDING_WHITESPACE: 'url-surrounding-whitespace',
  URL_CONTROL_CHARACTER: 'url-control-character',
  URL_BIDI_CHARACTER: 'url-bidi-character',
  URL_BACKSLASH: 'url-backslash',
  URL_INVALID_PERCENT_ENCODING: 'url-invalid-percent-encoding',
  URL_ENCODED_CONTROL: 'url-encoded-control',
  URL_MALFORMED: 'url-malformed',
  URL_PROTOCOL: 'url-protocol-not-allowed',
  URL_USERINFO: 'url-userinfo-not-allowed',
  URL_HOST: 'url-host-required',
  DEFAULTS_INVALID: 'defaults-invalid',
});

const ID_PATTERN = /^[a-z0-9](?:[a-z0-9_-]*[a-z0-9])?$/;
const CONTROL_RE = /[\u0000-\u001f\u007f-\u009f]/;
const BIDI_RE = /[\u202a-\u202e\u2066-\u2069]/;
const ENCODED_CONTROL_RE = /%(?:0[0-9a-f]|1[0-9a-f]|7f|8[0-9a-f]|9[0-9a-f])/i;

function refuse(reason) { return { ok: false, reason }; }
function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}
function hasExactKeys(value, allowed) {
  const keys = Object.keys(value);
  return keys.length === allowed.length && keys.every((key) => allowed.includes(key));
}
function utf8Bytes(text) {
  if (typeof Buffer !== 'undefined') return Buffer.byteLength(text, 'utf8');
  return new TextEncoder().encode(text).length;
}

function validateUrl(input) {
  if (typeof input !== 'string') return refuse(REASON.URL_NOT_STRING);
  if (input.length === 0) return refuse(REASON.URL_EMPTY);
  if (input.length > MAX_URL_LENGTH) return refuse(REASON.URL_TOO_LONG);
  if (input !== input.trim()) return refuse(REASON.URL_SURROUNDING_WHITESPACE);
  if (CONTROL_RE.test(input)) return refuse(REASON.URL_CONTROL_CHARACTER);
  if (BIDI_RE.test(input)) return refuse(REASON.URL_BIDI_CHARACTER);
  if (/^[a-z][a-z0-9+.-]*:/i.test(input) && !/^https?:/i.test(input)) {
    return refuse(REASON.URL_PROTOCOL);
  }
  // WHATWG special-scheme parsing treats backslashes as slashes. Refusing them before authority
  // inspection keeps the string the operator sees aligned with the authority the parser resolves.
  if (input.includes('\\')) return refuse(REASON.URL_BACKSLASH);
  // Require an explicit hierarchical absolute form. WHATWG deliberately accepts shorthand such as
  // `http:example.com`; that browser convenience is too visually ambiguous for stored launchers.
  const absolute = input.match(/^https?:\/\/([^/?#]*)(?:[/?#]|$)/i);
  if (!absolute || !absolute[1] || absolute[1].startsWith('/')) return refuse(REASON.URL_MALFORMED);
  // Even an empty-userinfo spelling (`https://@host`) is deceptive. A literal/encoded non-empty
  // userinfo is also caught after parsing through username/password below.
  if (absolute[1].includes('@')) return refuse(REASON.URL_USERINFO);
  // URL accepts stray '%' in paths. Reject malformed escapes, and reject encoded C0/C1 controls,
  // before parsing so decoding cannot produce a control character at a later layer.
  for (let i = 0; i < input.length; i += 1) {
    if (input[i] === '%' && !/^[0-9a-f]{2}$/i.test(input.slice(i + 1, i + 3))) {
      return refuse(REASON.URL_INVALID_PERCENT_ENCODING);
    }
  }
  if (ENCODED_CONTROL_RE.test(input)) return refuse(REASON.URL_ENCODED_CONTROL);

  let parsed;
  try { parsed = new URL(input); }
  catch { return refuse(REASON.URL_MALFORMED); }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return refuse(REASON.URL_PROTOCOL);
  if (parsed.username !== '' || parsed.password !== '') return refuse(REASON.URL_USERINFO);
  if (!parsed.hostname) return refuse(REASON.URL_HOST);
  return { ok: true, url: parsed.href };
}

function validateEntry(entry) {
  if (!isPlainObject(entry)) return refuse(REASON.ENTRY_NOT_OBJECT);
  if (!hasExactKeys(entry, ['id', 'label', 'url'])) return refuse(REASON.ENTRY_UNKNOWN_FIELD);
  if (typeof entry.id !== 'string' || !ID_PATTERN.test(entry.id)) return refuse(REASON.ID_INVALID);
  if (entry.id.length > MAX_ID_LENGTH) return refuse(REASON.ID_TOO_LONG);
  if (typeof entry.label !== 'string' || entry.label.length === 0 || entry.label !== entry.label.trim()
      || CONTROL_RE.test(entry.label) || BIDI_RE.test(entry.label)) {
    return refuse(REASON.LABEL_INVALID);
  }
  if (entry.label.length > MAX_LABEL_LENGTH) return refuse(REASON.LABEL_TOO_LONG);
  const url = validateUrl(entry.url);
  if (!url.ok) return url;
  return { ok: true, entry: { id: entry.id, label: entry.label, url: url.url } };
}

function validateConfigObject(config) {
  if (!isPlainObject(config)) return refuse(REASON.CONFIG_NOT_OBJECT);
  if (!hasExactKeys(config, ['schemaVersion', 'entries'])) return refuse(REASON.CONFIG_UNKNOWN_FIELD);
  if (config.schemaVersion !== SCHEMA_VERSION) return refuse(REASON.VERSION_MISMATCH);
  if (!Array.isArray(config.entries)) return refuse(REASON.ENTRIES_NOT_ARRAY);
  if (config.entries.length > MAX_ENTRIES) return refuse(REASON.TOO_MANY_ENTRIES);

  const ids = new Set();
  const entries = [];
  for (const rawEntry of config.entries) {
    const result = validateEntry(rawEntry);
    if (!result.ok) return result;
    if (ids.has(result.entry.id)) return refuse(REASON.DUPLICATE_ID);
    ids.add(result.entry.id);
    entries.push(result.entry);
  }
  const canonical = { schemaVersion: SCHEMA_VERSION, entries };
  if (utf8Bytes(JSON.stringify(canonical)) > MAX_CONFIG_BYTES) return refuse(REASON.CONFIG_TOO_LARGE);
  return { ok: true, config: canonical };
}

function parseConfigText(text) {
  if (typeof text !== 'string') return refuse(REASON.CONFIG_NOT_STRING);
  // Both checks happen before JSON.parse. The character check cheaply refuses obviously oversized
  // input; the UTF-8 check closes the multibyte case while the input is still an inert string.
  if (text.length > MAX_CONFIG_BYTES || utf8Bytes(text) > MAX_CONFIG_BYTES) {
    return refuse(REASON.CONFIG_TOO_LARGE);
  }
  let parsed;
  try { parsed = JSON.parse(text); }
  catch { return refuse(REASON.INVALID_JSON); }
  return validateConfigObject(parsed);
}

function serializeConfig(config) {
  const result = validateConfigObject(config);
  if (!result.ok) return result;
  const text = JSON.stringify(result.config, null, 2) + '\n';
  if (utf8Bytes(text) > MAX_CONFIG_BYTES) return refuse(REASON.CONFIG_TOO_LARGE);
  return { ok: true, config: result.config, text };
}

// Blue supplies these two URLs at the explicit production checkpoint. Tests pass explicit fixtures;
// this function contains no guessed or vendor URL and cannot seed anything without both arguments.
function buildDefaultConfig({ starboardUrl, outlookUrl } = {}) {
  const result = validateConfigObject({
    schemaVersion: SCHEMA_VERSION,
    entries: [
      { id: DEFAULT_IDS[0], label: DEFAULT_LABELS[0], url: starboardUrl },
      { id: DEFAULT_IDS[1], label: DEFAULT_LABELS[1], url: outlookUrl },
    ],
  });
  return result.ok ? result : refuse(REASON.DEFAULTS_INVALID);
}

module.exports = {
  SCHEMA_VERSION,
  MAX_CONFIG_BYTES,
  MAX_ENTRIES,
  MAX_ID_LENGTH,
  MAX_LABEL_LENGTH,
  MAX_URL_LENGTH,
  DEFAULT_LABELS,
  DEFAULT_IDS,
  REASON,
  ID_PATTERN,
  validateUrl,
  validateEntry,
  validateConfigObject,
  parseConfigText,
  serializeConfig,
  buildDefaultConfig,
};
