'use strict';
// Blue Helm production pane status — the app-owned installation descriptor.
//
// Procurement record: docs/OSS-PROCUREMENT-pane-status.md
// Blue's verdict, verbatim: BLUE SUBSYSTEM VERDICT: BUILD FRESH
//
// WHY A DESCRIPTOR EXISTS AT ALL. Setup touches TWO resources that cannot be written atomically
// together: somebody else's settings file, and our own record of what we did to it. If the app dies
// between them, the next start must be able to tell "we never wrote" from "we wrote and did not
// finish" WITHOUT guessing, and without reading intent into a file we do not own. The descriptor is
// that record, and § 10 writes intent to it BEFORE touching Claude settings for exactly this reason.
//
// WHAT IT MAY CONTAIN: bounded, app-owned metadata. The exact hook group we installed (which we
// authored), the events we installed it for, our runtime and shim identity, the settings path, the
// hashes that make CAS and rollback decidable, timestamps, and an integrity hash over all of it.
//
// WHAT IT MAY NEVER CONTAIN, asserted by test rather than intended: a token, Claude settings content
// we did not author, prompt or output text, a transcript, a credential, or any unrelated settings key
// or value. The descriptor is not a backup of somebody else's file.
//
// SCHEMA POLICY, FAIL-CLOSED IN BOTH DIRECTIONS:
//   * a NEWER schema than we understand is refused READ-ONLY. A future build may have recorded fields
//     whose meaning we cannot know; writing over them would destroy information and could strand
//     hooks that build installed.
//   * an OLDER schema is upgraded only by an explicit, tested, descriptor-side migration. There is no
//     "best effort" path, and a migration never touches Claude settings.

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const SCHEMA_VERSION = 1;
const DESCRIPTOR_BASENAME = 'pane-status-installation.json';

// The transaction states of § 10. Written to the descriptor, and the only thing startup reconciliation
// is allowed to reason from.
const TXN = Object.freeze({
  IDLE: 'IDLE',
  INSTALL_PENDING: 'INSTALL_PENDING',
  INSTALL_WRITTEN: 'INSTALL_WRITTEN',
  INSTALL_VERIFIED: 'INSTALL_VERIFIED',
  INSTALLED: 'INSTALLED',
  REMOVE_PENDING: 'REMOVE_PENDING',
  REMOVE_WRITTEN: 'REMOVE_WRITTEN',
  REMOVE_VERIFIED: 'REMOVE_VERIFIED',
  RECONCILIATION_REQUIRED: 'RECONCILIATION_REQUIRED',
});
const TXN_STATES = Object.freeze(Object.keys(TXN));

const DESCRIPTOR_REFUSAL = Object.freeze({
  MISSING: 'descriptor-missing',
  MALFORMED: 'descriptor-malformed',
  INTEGRITY: 'descriptor-integrity-failed',
  NEWER_SCHEMA: 'descriptor-newer-schema',
  UNKNOWN_SCHEMA: 'descriptor-unknown-schema',
  BAD_STATE: 'descriptor-bad-transaction-state',
  WRITE_VERIFY: 'descriptor-write-verify-failed',
});

// Keys that must NEVER appear anywhere in a descriptor. Enforced on write, so a future edit that
// starts recording one fails loudly at the moment it is introduced rather than in the field.
const FORBIDDEN_KEYS = Object.freeze(['token', 't', 'prompt', 'transcript', 'transcript_path',
  'credential', 'apiKey', 'api_key', 'secret', 'settingsContent', 'tool_input', 'tool_response']);

function descriptorPath(userDataPath) { return path.join(userDataPath, DESCRIPTOR_BASENAME); }

function sha256(text) { return crypto.createHash('sha256').update(text, 'utf8').digest('hex'); }

/**
 * Canonical serialization for hashing: keys sorted at every level, so the integrity hash depends on
 * the VALUES rather than on the accident of insertion order.
 */
function canonicalize(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonicalize).join(',') + ']';
  const keys = Object.keys(value).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonicalize(value[k])).join(',') + '}';
}

function integrityHashOf(descriptor) {
  const copy = Object.assign({}, descriptor);
  delete copy.integrity;
  return sha256(canonicalize(copy));
}

/** Recursively assert no forbidden key is present, at any depth. */
function assertNoForbiddenKeys(value, trail) {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) { value.forEach((v, i) => assertNoForbiddenKeys(v, trail + '[' + i + ']')); return; }
  for (const k of Object.keys(value)) {
    if (FORBIDDEN_KEYS.indexOf(k) !== -1) {
      throw new Error('pane-status-descriptor: forbidden key "' + k + '" at ' + trail);
    }
    assertNoForbiddenKeys(value[k], trail + '.' + k);
  }
}

/**
 * ATOMIC DURABLE WRITE — the single implementation used by the descriptor, the settings transaction,
 * and the runtime shim. There is deliberately one copy: three hand-rolled variants would drift, and
 * the drift would only show up as corruption after a crash.
 *
 * The Windows facts this encodes were measured on this host and are NOT assumptions:
 *   * rename-over-existing is atomic — 100/100 on system Node 24.18.0 and on the repository's
 *     Electron 42.5.0 / Node 24.17.0 runtime;
 *   * fsync on a READ-ONLY handle returns EPERM. The handle must be opened 'r+', which is why this
 *     reopens the temp file rather than fsyncing the write handle it already had.
 *
 * No copy-over fallback exists. A fallback that is not atomic would silently weaken the one property
 * the whole two-resource protocol rests on.
 */
function atomicWriteFileSync(targetPath, contents) {
  const dir = path.dirname(targetPath);
  const tmp = path.join(dir, '.' + path.basename(targetPath) + '.' + crypto.randomBytes(6).toString('hex') + '.tmp');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(tmp, contents, { encoding: 'utf8' });

  // Durability: reopen 'r+' (NOT 'r') and fsync. See the EPERM note above.
  let fd = null;
  try {
    fd = fs.openSync(tmp, 'r+');
    fs.fsyncSync(fd);
  } finally {
    if (fd !== null) { try { fs.closeSync(fd); } catch { /* already closed */ } }
  }

  fs.renameSync(tmp, targetPath);

  // Read back and compare bytes. A write we cannot prove landed is a write we treat as failed.
  const readBack = fs.readFileSync(targetPath, 'utf8');
  if (readBack !== contents) {
    const err = new Error('pane-status-descriptor: atomic write read-back mismatch');
    err.code = 'EREADBACK';
    throw err;
  }
  return { ok: true, bytes: Buffer.byteLength(contents, 'utf8'), sha256: sha256(contents) };
}

/**
 * Build a descriptor object. Every field is app-owned metadata; `installedGroups` is the hook group we
 * authored, recorded VERBATIM so removal can target what we actually wrote rather than what a later
 * build would write.
 */
function buildDescriptor(input) {
  const i = input || {};
  const descriptor = {
    schemaVersion: SCHEMA_VERSION,
    installId: i.installId,
    ownerMarker: i.ownerMarker,
    transactionState: i.transactionState,
    installedGroups: i.installedGroups || null,
    installedEvents: i.installedEvents || null,
    runtime: {
      runtimePath: i.runtimePath || null,
      runtimeSize: typeof i.runtimeSize === 'number' ? i.runtimeSize : null,
      runtimeMtimeMs: typeof i.runtimeMtimeMs === 'number' ? i.runtimeMtimeMs : null,
      shimPath: i.shimPath || null,
      shimSha256: i.shimSha256 || null,
      reporterPath: i.reporterPath || null,
    },
    settingsPath: i.settingsPath || null,
    preTransactionSha256: i.preTransactionSha256 || null,
    attemptedOutputSha256: i.attemptedOutputSha256 || null,
    createdAt: typeof i.createdAt === 'number' ? i.createdAt : null,
    updatedAt: typeof i.updatedAt === 'number' ? i.updatedAt : null,
  };
  if (TXN_STATES.indexOf(descriptor.transactionState) === -1) {
    throw new Error('pane-status-descriptor: unknown transaction state');
  }
  assertNoForbiddenKeys(descriptor, 'descriptor');
  descriptor.integrity = integrityHashOf(descriptor);
  return descriptor;
}

/** Serialize a descriptor exactly as it will be stored. */
function serialize(descriptor) { return JSON.stringify(descriptor, null, 2) + '\n'; }

/**
 * Write a descriptor: atomically, durably, then read back, parse, and verify integrity. A descriptor
 * we cannot read back correctly has NOT been written, and the caller must treat it as a failure.
 */
function write(userDataPath, descriptor) {
  const target = descriptorPath(userDataPath);
  const text = serialize(descriptor);
  atomicWriteFileSync(target, text);
  const verify = read(userDataPath);
  if (!verify.ok) return { ok: false, reason: DESCRIPTOR_REFUSAL.WRITE_VERIFY, detail: verify.reason };
  if (verify.value.integrity !== descriptor.integrity) {
    return { ok: false, reason: DESCRIPTOR_REFUSAL.WRITE_VERIFY };
  }
  return { ok: true, path: target, sha256: sha256(text) };
}

/**
 * Read and validate. Returns { ok:true, value } or { ok:false, reason, readOnly? }.
 *
 * `readOnly:true` means we understood enough to know we must NOT write: a newer schema. The caller
 * surfaces reconciliation-required and stops, rather than overwriting a future build's record.
 */
function read(userDataPath) {
  const target = descriptorPath(userDataPath);
  let text;
  try { text = fs.readFileSync(target, 'utf8'); }
  catch (e) {
    if (e && e.code === 'ENOENT') return { ok: false, reason: DESCRIPTOR_REFUSAL.MISSING };
    return { ok: false, reason: DESCRIPTOR_REFUSAL.MALFORMED };
  }

  let value;
  try { value = JSON.parse(text); } catch { return { ok: false, reason: DESCRIPTOR_REFUSAL.MALFORMED }; }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ok: false, reason: DESCRIPTOR_REFUSAL.MALFORMED };
  }

  const schema = value.schemaVersion;
  if (typeof schema !== 'number' || !Number.isInteger(schema) || schema < 1) {
    return { ok: false, reason: DESCRIPTOR_REFUSAL.UNKNOWN_SCHEMA };
  }
  if (schema > SCHEMA_VERSION) {
    // Refuse READ-ONLY. Do not migrate, do not overwrite, do not remove.
    return { ok: false, reason: DESCRIPTOR_REFUSAL.NEWER_SCHEMA, readOnly: true, schemaVersion: schema };
  }
  if (schema < SCHEMA_VERSION) {
    const migrated = migrate(value);
    if (!migrated.ok) return migrated;
    value = migrated.value;
  }

  if (typeof value.integrity !== 'string' || value.integrity !== integrityHashOf(value)) {
    return { ok: false, reason: DESCRIPTOR_REFUSAL.INTEGRITY };
  }
  if (TXN_STATES.indexOf(value.transactionState) === -1) {
    return { ok: false, reason: DESCRIPTOR_REFUSAL.BAD_STATE };
  }
  return { ok: true, value, raw: text, sha256: sha256(text) };
}

/**
 * Descriptor-side migration for older schemas. There is exactly one schema version today, so this has
 * no live branch — it exists so that adding one is a deliberate, tested edit in a known place rather
 * than an ad-hoc patch at a call site. It NEVER touches Claude settings.
 */
function migrate(value) {
  return { ok: false, reason: DESCRIPTOR_REFUSAL.UNKNOWN_SCHEMA, schemaVersion: value.schemaVersion };
}

/** Remove the descriptor. Used only after a verified removal. */
function remove(userDataPath) {
  const target = descriptorPath(userDataPath);
  try { fs.unlinkSync(target); return { ok: true }; }
  catch (e) {
    if (e && e.code === 'ENOENT') return { ok: true };
    return { ok: false, reason: 'descriptor-unlink-failed' };
  }
}

function exists(userDataPath) {
  try { fs.accessSync(descriptorPath(userDataPath)); return true; } catch { return false; }
}

const api = {
  SCHEMA_VERSION,
  DESCRIPTOR_BASENAME,
  TXN,
  TXN_STATES,
  DESCRIPTOR_REFUSAL,
  FORBIDDEN_KEYS,
  descriptorPath,
  sha256,
  canonicalize,
  integrityHashOf,
  assertNoForbiddenKeys,
  atomicWriteFileSync,
  buildDescriptor,
  serialize,
  write,
  read,
  migrate,
  remove,
  exists,
};
if (typeof module === 'object' && module.exports) module.exports = api;
