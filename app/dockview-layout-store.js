// Dockview layout store — the MAIN-owned FILE boundary for saved layout state.
//
// SCOPE. This module owns the things only main can own: the fixed path under Electron `userData`,
// the pre-parse byte bound, the ordinary-file and reparse-point refusals, strict UTF-8 decoding,
// and the atomic write. It owns NO schema logic.
//
// Every schema decision — the envelope shape, the strict layout allowlist, the bounds, the closed
// reason set — lives in `dockview-layout-policy.js`, which is pure and dependency-free so the
// RENDERER can load the very same code as a classic script and validate immediately before every
// `fromJSON`. Phase B validated in main only, which left the renderer handing main's output
// straight to `fromJSON` unchecked; Phase C closes that with one shared validator rather than a
// second implementation that can drift.
//
// The validators are re-exported below so existing callers and tests keep importing them from here.
//
// THE PROTOTYPE EVIDENCE FILE IS NEVER TOUCHED. `dockview-prototype-layout.json` is retained
// untouched as the human-acceptance evidence behind Blue's ADOPT verdict. Nothing in this module
// reads, imports, migrates, renames, deletes, or overwrites it — a production install starts with
// no saved arrangement rather than silently inheriting a prototype one.
//
// Refusals return a BOUNDED REASON CODE and never echo file contents or the path.

'use strict';

const fs = require('fs');
const path = require('path');

const policy = require('./dockview-layout-policy');

const {
  validateEnvelope, validateLayout, buildEnvelope, paneIdsFromLayout, comparePaneSets,
  canonicalPaneOrder, buildDefaultArrangement,
  REASON, REASON_CODES, SCHEMA_VERSION, PACKAGE_NAME, PACKAGE_VERSION,
  ALLOWED_COMPONENTS, PANE_ID_PATTERN,
  MAX_RAW_BYTES, MAX_DEPTH, MAX_PANELS, MAX_GROUPS,
} = policy;

// PRODUCTION filename. Deliberately NOT the prototype's `dockview-prototype-layout.json` — see the
// header. This is a file-boundary constant, so it lives here rather than in the pure policy.
const LAYOUT_FILENAME = 'dockview-layout.json';

function refuse(reason) { return { ok: false, reason }; }

// ---- file-backed store ------------------------------------------------------

/**
 * @param {object} deps
 * @param {string} deps.userDataDir  Electron `userData`. MAIN supplies this; the renderer never
 *                                   supplies any part of a path.
 * @param {object} [deps.fsImpl]     Injectable for tests.
 */
function createLayoutStore({ userDataDir, fsImpl = fs } = {}) {
  if (typeof userDataDir !== 'string' || !userDataDir) {
    throw new Error('createLayoutStore: userDataDir is required');
  }
  // Fixed canonical path. Built once, from a main-owned directory plus a constant filename, so
  // there is no code path in which a caller-supplied string reaches it.
  const layoutPath = path.join(userDataDir, LAYOUT_FILENAME);

  /**
   * Read + validate. Never throws; always returns a bounded result.
   * An INVALID file is left exactly as-is for diagnosis — never repaired, deleted, or overwritten.
   */
  function load() {
    let st;
    try {
      st = fsImpl.lstatSync(layoutPath); // lstat, NOT stat — must not follow a link
    } catch {
      return refuse(REASON.NOT_FOUND);
    }

    // Reparse points (symlinks and Windows junctions both report as symbolic links here) are
    // refused before any read, so the fixed path cannot be redirected at another file.
    if (st.isSymbolicLink()) return refuse(REASON.REPARSE_POINT);
    if (!st.isFile()) return refuse(REASON.NOT_REGULAR_FILE);
    if (st.size > MAX_RAW_BYTES) return refuse(REASON.TOO_LARGE);

    let buf;
    try {
      buf = fsImpl.readFileSync(layoutPath);
    } catch {
      return refuse(REASON.READ_FAILED);
    }
    if (!Buffer.isBuffer(buf)) return refuse(REASON.READ_FAILED);
    // Re-check post-read: the file could have grown between lstat and read.
    if (buf.length > MAX_RAW_BYTES) return refuse(REASON.TOO_LARGE);

    // Strict UTF-8: `fatal` rejects invalid sequences instead of substituting U+FFFD, and `ignoreBOM`
    // false means a BOM would surface as a leading U+FEFF and fail the JSON parse rather than being
    // silently swallowed.
    let text;
    try {
      text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(buf);
    } catch {
      return refuse(REASON.INVALID_UTF8);
    }

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      return refuse(REASON.INVALID_JSON);
    }

    return validateEnvelope(parsed);
  }

  /**
   * Validate THEN write, atomically. A layout that does not validate is never persisted, so an
   * invalid file can only ever arrive from outside this process — and a refusal here leaves any
   * previously saved VALID arrangement exactly as it was, because nothing is written at all.
   */
  function save(layout) {
    const envelope = buildEnvelope(layout);
    const verdict = validateEnvelope(envelope);
    if (!verdict.ok) return verdict;

    const tmp = layoutPath + '.' + process.pid + '.' + Math.random().toString(36).slice(2) + '.tmp';
    try {
      fsImpl.writeFileSync(tmp, JSON.stringify(envelope, null, 2), { encoding: 'utf8' });
      // Atomic replacement. On Windows rename-onto-existing fails, so renameSync is attempted and
      // falls back to an explicit replace; the unique temp name keeps concurrent writers from
      // colliding either way.
      try {
        fsImpl.renameSync(tmp, layoutPath);
      } catch {
        fsImpl.rmSync(layoutPath, { force: true });
        fsImpl.renameSync(tmp, layoutPath);
      }
    } catch {
      try { fsImpl.rmSync(tmp, { force: true }); } catch { /* temp cleanup is best-effort */ }
      return refuse(REASON.WRITE_FAILED);
    }
    return { ok: true, savedAt: envelope.savedAt };
  }

  /**
   * Clear Saved Arrangement. Deletes ONLY this store's own production file and touches nothing else:
   * no other file, no live pane, no PTY. `force: true` makes an already-absent file a SUCCESSFUL
   * NO-OP rather than an error — "there is no saved arrangement" is the state the caller asked for,
   * so reporting failure would be a lie. The caller distinguishes the two through `existed`.
   */
  function reset() {
    let existed = false;
    try { existed = fsImpl.lstatSync(layoutPath) !== undefined; } catch { existed = false; }
    try {
      fsImpl.rmSync(layoutPath, { force: true });
      return { ok: true, existed };
    } catch {
      return refuse(REASON.WRITE_FAILED);
    }
  }

  return { load, save, reset, layoutPath: () => layoutPath };
}

module.exports = {
  createLayoutStore,
  LAYOUT_FILENAME,
  // Re-exported from the ONE shared policy so main-side callers and the existing suites keep a
  // single import site. These are the same function objects the renderer loads.
  policy,
  validateEnvelope,
  validateLayout,
  buildEnvelope,
  paneIdsFromLayout,
  comparePaneSets,
  canonicalPaneOrder,
  buildDefaultArrangement,
  REASON,
  REASON_CODES,
  SCHEMA_VERSION,
  PACKAGE_NAME,
  PACKAGE_VERSION,
  ALLOWED_COMPONENTS,
  PANE_ID_PATTERN,
  MAX_RAW_BYTES,
  MAX_DEPTH,
  MAX_PANELS,
  MAX_GROUPS,
};
