'use strict';
// MAIN-OWNED TURN ADMISSION BUDGET — the durable ledger boundary.
//
// Procurement record: docs/OSS-PROCUREMENT-pane-status.md
// Blue's verdict, verbatim: BLUE SUBSYSTEM VERDICT: BUILD FRESH
//
// SCOPE. This module owns only the things a file boundary must own: the fixed path under Electron
// `userData`, the pre-parse byte bound, the ordinary-file and reparse-point refusals, strict UTF-8
// decoding, JSON parsing, and the atomic write. It owns NO admission policy — every rule about
// allowances, decrements, rollback and pane binding lives in the pure `admission-budget.js`, which
// receives this object as its injected `storage`.
//
// Same split, and largely the same code shape, as `dockview-layout-store.js`. That is deliberate: the
// atomic-replace pattern there has already been reviewed, and a second, subtly different persistence
// routine for a COST control is exactly the kind of drift worth refusing.
//
// THE ONE DISTINCTION THAT MATTERS: `not-found` is returned as its own reason and is the ONLY read
// outcome the policy layer is allowed to treat as "this run may be created". Permission denial, a
// device error, an oversize file, a reparse point, invalid UTF-8 and unparseable JSON all return
// DIFFERENT reasons, and the policy layer fails closed on every one of them. Collapsing them into
// "absent" is precisely how a deleted or unreadable ledger would silently mint a fresh allowance.
//
// Refusals return a BOUNDED REASON CODE. They never echo file contents, the path, or a run id.

const fs = require('fs');
const path = require('path');

// Fixed filename. A constant, joined to a main-supplied directory. No caller-supplied string ever
// reaches this path, and the run id is deliberately NOT part of it — one ledger holds every run, so a
// single atomic write keeps the whole history consistent.
const LEDGER_FILENAME = 'admission-ledger.json';

// A ledger is a small map of small records. 256 KiB is orders of magnitude more than
// MAX_PERSISTED_RUNS records need and still bounds a hostile or corrupted file before it is parsed.
const MAX_RAW_BYTES = 256 * 1024;

const STORE_REASON = Object.freeze({
  NOT_FOUND: 'not-found',
  READ_FAILED: 'read-failed',
  REPARSE_POINT: 'reparse-point',
  NOT_REGULAR_FILE: 'not-regular-file',
  TOO_LARGE: 'too-large',
  INVALID_UTF8: 'invalid-utf8',
  INVALID_JSON: 'invalid-json',
  WRITE_FAILED: 'write-failed',
  NOT_SERIALIZABLE: 'not-serializable',
});

function refuse(reason) { return { ok: false, reason }; }

/**
 * @param {object} deps
 * @param {string} deps.userDataDir  Electron `userData`. MAIN supplies this; nothing downstream of
 *                                   the renderer or the PTY supplies any part of a path.
 * @param {object} [deps.fsImpl]     Injectable for tests.
 */
function createAdmissionLedgerStore({ userDataDir, fsImpl = fs } = {}) {
  if (typeof userDataDir !== 'string' || !userDataDir) {
    throw new Error('createAdmissionLedgerStore: userDataDir is required');
  }
  const ledgerPath = path.join(userDataDir, LEDGER_FILENAME);

  /**
   * Read + parse. Never throws; always returns a bounded result.
   * An INVALID file is left exactly as-is for diagnosis — never repaired, deleted, or overwritten.
   */
  function load() {
    let st;
    try {
      st = fsImpl.lstatSync(ledgerPath); // lstat, NOT stat — must not follow a link
    } catch (err) {
      // ENOENT is the only condition that means "no ledger yet". Everything else means the boundary
      // could not establish what is at the canonical path, and claiming absence would be a lie that
      // costs money.
      return refuse(err && err.code === 'ENOENT' ? STORE_REASON.NOT_FOUND : STORE_REASON.READ_FAILED);
    }
    if (st.isSymbolicLink()) return refuse(STORE_REASON.REPARSE_POINT);
    if (!st.isFile()) return refuse(STORE_REASON.NOT_REGULAR_FILE);
    if (st.size > MAX_RAW_BYTES) return refuse(STORE_REASON.TOO_LARGE);

    let buf;
    try {
      buf = fsImpl.readFileSync(ledgerPath);
    } catch {
      return refuse(STORE_REASON.READ_FAILED);
    }
    if (!Buffer.isBuffer(buf)) return refuse(STORE_REASON.READ_FAILED);
    // Re-check post-read: the file could have grown between lstat and read.
    if (buf.length > MAX_RAW_BYTES) return refuse(STORE_REASON.TOO_LARGE);

    // A BOM means something other than this application wrote the ledger, and this file is a cost
    // control — so it is refused rather than tolerated. Note the WHATWG flag is counter-intuitive:
    // `ignoreBOM: false` (the default) *removes* a leading BOM, so the decoder alone would silently
    // accept the file. The explicit byte check below is what makes the refusal real.
    if (buf.length >= 3 && buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF) {
      return refuse(STORE_REASON.INVALID_UTF8);
    }
    // Strict UTF-8: `fatal` rejects invalid sequences instead of substituting U+FFFD.
    let text;
    try {
      text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(buf);
    } catch {
      return refuse(STORE_REASON.INVALID_UTF8);
    }

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      return refuse(STORE_REASON.INVALID_JSON);
    }
    return { ok: true, doc: parsed };
  }

  /**
   * Serialize THEN write, atomically. A failed rename leaves the previous ledger untouched, and the
   * canonical file is never unlinked first: doing so would create an interruption window in which the
   * consumed count exists only under a temp name.
   *
   * The caller treats any non-ok result as "nothing was admitted" and writes no bytes to the PTY.
   */
  function save(doc) {
    let text;
    try {
      text = JSON.stringify(doc, null, 2);
    } catch {
      return refuse(STORE_REASON.NOT_SERIALIZABLE);
    }
    if (typeof text !== 'string') return refuse(STORE_REASON.NOT_SERIALIZABLE);
    if (Buffer.byteLength(text, 'utf8') > MAX_RAW_BYTES) return refuse(STORE_REASON.TOO_LARGE);

    const tmp = ledgerPath + '.' + process.pid + '.' + Math.random().toString(36).slice(2) + '.tmp';
    try {
      fsImpl.writeFileSync(tmp, text, { encoding: 'utf8' });
      fsImpl.renameSync(tmp, ledgerPath);
    } catch {
      try { fsImpl.rmSync(tmp, { force: true }); } catch { /* temp cleanup is best-effort */ }
      return refuse(STORE_REASON.WRITE_FAILED);
    }
    return { ok: true };
  }

  return { load, save, ledgerPath: () => ledgerPath };
}

const api = {
  createAdmissionLedgerStore,
  LEDGER_FILENAME,
  MAX_RAW_BYTES,
  STORE_REASON,
};
if (typeof module === 'object' && module.exports) module.exports = api;
