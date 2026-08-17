'use strict';
// MAIN-OWNED TURN ADMISSION BUDGET — the durable ledger boundary.
//
// Procurement record: docs/OSS-PROCUREMENT-pane-status.md
// Blue's verdict, verbatim: BLUE SUBSYSTEM VERDICT: BUILD FRESH
//
// SCOPE. This module owns only the things a file boundary must own: the fixed path under Electron
// `userData`, the pre-parse byte bound, the ordinary-file and reparse-point refusals, strict UTF-8
// decoding, JSON parsing, and the locked compare-and-swap atomic write. It owns NO admission policy
// — every rule about allowances, decrements and pane binding lives in the pure
// `admission-budget.js`, which receives this object as its injected `storage`.
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
//
// ============================================================================================
// THREAT BOUNDARY — READ THIS BEFORE RELYING ON ANYTHING IN THIS FILE
//
// This budget bounds accidental paid-turn spend through Blue Helm's controlled input paths. It is
// not a security boundary against a malicious or compromised process running as the same Windows
// user. Such a process may locate, delete, replace, or rewrite the local ledger directly.
//
// Blue's authorization, verbatim:
//   I ACCEPT THE ADMISSION LEDGER AS AN ACCIDENTAL-SPEND CONTROL, NOT A SECURITY BOUNDARY AGAINST A
//   MALICIOUS OR COMPROMISED SAME-USER PANE. CORRECT THE FALSE PROVIDER-INACCESSIBILITY CLAIMS,
//   REMOVE THE UNREACHABLE ROLLBACK GUARD, AND RETURN FOR FULL REVIEW.
//
// Specifically, and contrary to what earlier revisions of this code and its handoff claimed:
//   * The ledger path is NOT secret. It is `admission-ledger.json` under Electron `userData`, which
//     resolves beneath `%APPDATA%`. `APPDATA` and `USERPROFILE` are ordinary environment variables
//     present in every PTY; the filename is a literal in this file, which is readable repository
//     source; and plain filesystem enumeration finds it regardless.
//   * There is NO filesystem isolation. A PTY child runs as the same Windows user as main and has
//     the same access to that file as main does.
//   * Stripping the admission environment keys hides the configured RUN ID and ALLOWANCE from the
//     pane environment. That is all it does. It does not hide `userData`, and it grants no
//     protection over the file.
//   * `CLAUDE_CODE_SUBPROCESS_ENV_SCRUB` concerns credentials in Claude Code's own subprocesses. It
//     is not evidence that a same-user Claude process cannot reach this ledger.
//
// INTEGRITY CHECKSUM — WHAT IT IS AND IS NOT. Every persisted ledger carries a SHA-256 checksum
// over a canonical serialization of its content. It is verified before any run record is accepted.
// It is NOT authentication, NOT hostile tamper resistance, and NOT rollback prevention:
//   * It DETECTS accidental corruption, and simple edits where the checksum was not recomputed.
//   * A same-user process can recompute the checksum. There is no key, and there is deliberately no
//     key: a secret stored beside the thing it protects, readable by the same user, would only move
//     the claim without changing it.
//   * Replaying an EARLIER VALID checksummed ledger is not detected.
//   * Deleting the ledger still recreates a fresh run under the `not-found` rule below.
// These are accepted consequences of Blue's stated threat boundary, not oversights.
// ============================================================================================

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Fixed filename. A constant, joined to a main-supplied directory. No caller-supplied string ever
// reaches this path, and the run id is deliberately NOT part of it — one ledger holds every run, so a
// single atomic write keeps the whole history consistent.
const LEDGER_FILENAME = 'admission-ledger.json';
const LOCK_FILENAME = 'admission-ledger.json.lock';

// A ledger is a small map of small records. 256 KiB is orders of magnitude more than
// MAX_PERSISTED_RUNS records need and still bounds a hostile or corrupted file before it is parsed.
const MAX_RAW_BYTES = 256 * 1024;

// The field the checksum is stored in. It is EXCLUDED from its own input, so the value is a function
// of the ledger content alone and is stable across rewrites that do not change that content.
const CHECKSUM_FIELD = 'checksum';

const STORE_REASON = Object.freeze({
  NOT_FOUND: 'not-found',
  READ_FAILED: 'read-failed',
  REPARSE_POINT: 'reparse-point',
  NOT_REGULAR_FILE: 'not-regular-file',
  TOO_LARGE: 'too-large',
  INVALID_UTF8: 'invalid-utf8',
  INVALID_JSON: 'invalid-json',
  // A ledger whose checksum is absent, malformed, or does not match its content. Distinct from
  // `invalid-json` (the bytes parsed fine) and from `not-found` (there IS a ledger), so the policy
  // layer fails closed on it rather than treating it as a creatable absence.
  INTEGRITY_MISMATCH: 'integrity-mismatch',
  // A cooperating writer changed the ledger after this caller read it, or another process currently
  // owns the write lock. This is an accidental-concurrency refusal, not hostile-process isolation.
  CONFLICT: 'conflict',
  REVISION_REQUIRED: 'revision-required',
  WRITE_FAILED: 'write-failed',
  NOT_SERIALIZABLE: 'not-serializable',
});

function refuse(reason) { return { ok: false, reason }; }

/**
 * Deterministic canonical serialization for checksumming.
 *
 * JSON.stringify is NOT deterministic across objects that differ only in insertion order, and the
 * ledger's `runs` map is built by inserting run ids as they appear. A checksum over non-canonical
 * bytes would mismatch after a semantically identical rewrite, which would turn this from a
 * corruption detector into a source of false refusals. So: object keys are sorted at every depth,
 * arrays keep their order, and the `checksum` field is dropped wherever it appears at the top level.
 *
 * Pure and total for JSON-representable input. `undefined`, functions and symbols cannot appear in a
 * value that came from JSON.parse, and on the save path they are dropped by JSON.stringify anyway —
 * so canonicalizing the same value the writer serializes keeps the two in agreement.
 */
function canonicalize(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  const keys = Object.keys(value).filter((k) => k !== CHECKSUM_FIELD).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalize(value[k])}`).join(',')}}`;
}

/** SHA-256 hex of the canonical form. Node built-in crypto; no key, no external dependency. */
function checksumOf(doc) {
  return crypto.createHash('sha256').update(canonicalize(doc), 'utf8').digest('hex');
}

const CHECKSUM_PATTERN = /^[0-9a-f]{64}$/;

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
  const lockPath = path.join(userDataDir, LOCK_FILENAME);

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

    // INTEGRITY CHECK, before the policy layer sees a single run record. Read the header for exactly
    // what this does and does not establish: it catches accidental corruption and edits that did not
    // recompute the checksum. It is not authentication.
    //
    // A missing or malformed checksum is refused, not tolerated. There is no unchecksummed-ledger
    // migration path and none is needed: no production ledger has been created by an authorized live
    // run, so there is nothing in the field to migrate. Refusing is also the fail-closed direction —
    // an unchecksummed file would otherwise be the trivial way to bypass the check entirely.
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return refuse(STORE_REASON.INVALID_JSON);
    }
    const claimed = parsed[CHECKSUM_FIELD];
    if (typeof claimed !== 'string' || !CHECKSUM_PATTERN.test(claimed)) {
      return refuse(STORE_REASON.INTEGRITY_MISMATCH);
    }
    // timingSafeEqual is deliberately NOT used. Both values are already on this machine, readable by
    // this user, and there is no secret here to leak through timing — reaching for it would imply an
    // adversary model this control does not claim to have.
    if (checksumOf(parsed) !== claimed) return refuse(STORE_REASON.INTEGRITY_MISMATCH);

    // Hand the policy layer a doc WITHOUT the checksum field, so nothing upstream has to know the
    // field exists, round-trip it, or risk feeding it back into its own input.
    const doc = { ...parsed };
    delete doc[CHECKSUM_FIELD];
    // The checksum is also the compare-and-swap revision token. That does not strengthen it into
    // authentication: a same-user process can still rewrite the document and recompute this value.
    return { ok: true, doc, revision: claimed };
  }

  /**
   * Serialize THEN write, atomically. A failed rename leaves the previous ledger untouched, and the
   * canonical file is never unlinked first: doing so would create an interruption window in which the
   * consumed count exists only under a temp name.
   *
   * The caller treats any non-ok result as "nothing was admitted" and writes no bytes to the PTY.
   */
  function save(doc, expectedRevision) {
    // `null` means the caller observed a genuine first-run absence. Every existing ledger must be
    // paired with the exact revision returned by load(); an omitted or invented expectation is not
    // allowed to overwrite durable history.
    if (expectedRevision !== null &&
        (typeof expectedRevision !== 'string' || !CHECKSUM_PATTERN.test(expectedRevision))) {
      return refuse(STORE_REASON.REVISION_REQUIRED);
    }
    // Stamp the checksum here, at the single write boundary, so no caller can persist an
    // unchecksummed ledger by forgetting to. Any inherited `checksum` on the incoming doc is
    // discarded and recomputed rather than trusted — it is excluded from `canonicalize` regardless,
    // so a stale value could not affect the result, but dropping it keeps the written field
    // unambiguous.
    if (!doc || typeof doc !== 'object' || Array.isArray(doc)) {
      return refuse(STORE_REASON.NOT_SERIALIZABLE);
    }
    let stamped;
    try {
      stamped = { ...doc };
      delete stamped[CHECKSUM_FIELD];
      stamped[CHECKSUM_FIELD] = checksumOf(stamped);
    } catch {
      return refuse(STORE_REASON.NOT_SERIALIZABLE);
    }
    let text;
    try {
      text = JSON.stringify(stamped, null, 2);
    } catch {
      return refuse(STORE_REASON.NOT_SERIALIZABLE);
    }
    if (typeof text !== 'string') return refuse(STORE_REASON.NOT_SERIALIZABLE);
    if (Buffer.byteLength(text, 'utf8') > MAX_RAW_BYTES) return refuse(STORE_REASON.TOO_LARGE);

    let lockFd;
    try {
      // `wx` is the cross-process serialization primitive. A second Blue Helm process is accidental,
      // not adversarial, and therefore inside this control's boundary. The lock plus the revision
      // comparison prevents two such processes from spending the same last admission.
      lockFd = fsImpl.openSync(lockPath, 'wx');
    } catch (err) {
      return refuse(err && err.code === 'EEXIST' ? STORE_REASON.CONFLICT : STORE_REASON.WRITE_FAILED);
    }

    try {
      // Re-read only after owning the lock. The policy layer also preflights so an already-rejected
      // file never reaches save(); this second check closes the race between that read and replace.
      const current = load();
      if (expectedRevision === null) {
        if (!current || current.ok === true || current.reason !== STORE_REASON.NOT_FOUND) {
          return current && current.ok === false && current.reason !== STORE_REASON.NOT_FOUND
            ? current
            : refuse(STORE_REASON.CONFLICT);
        }
      } else {
        if (!current || current.ok !== true) return current || refuse(STORE_REASON.READ_FAILED);
        if (current.revision !== expectedRevision) return refuse(STORE_REASON.CONFLICT);
      }

      const tmp = ledgerPath + '.' + process.pid + '.' + Math.random().toString(36).slice(2) + '.tmp';
      try {
        fsImpl.writeFileSync(tmp, text, { encoding: 'utf8' });
        fsImpl.renameSync(tmp, ledgerPath);
      } catch {
        try { fsImpl.rmSync(tmp, { force: true }); } catch { /* temp cleanup is best-effort */ }
        return refuse(STORE_REASON.WRITE_FAILED);
      }
      return { ok: true, revision: stamped[CHECKSUM_FIELD] };
    } finally {
      try { fsImpl.closeSync(lockFd); } catch { /* close is best-effort after the decision */ }
      try { fsImpl.rmSync(lockPath, { force: true }); } catch { /* a leftover lock fails closed */ }
    }
  }

  return { load, save, ledgerPath: () => ledgerPath, lockPath: () => lockPath };
}

const api = {
  createAdmissionLedgerStore,
  LEDGER_FILENAME,
  LOCK_FILENAME,
  MAX_RAW_BYTES,
  STORE_REASON,
  // Exported for tests and for anyone who needs to reproduce a checksum by hand. Exporting it is
  // not a weakening: the algorithm is unkeyed and stated in the header, so its availability changes
  // nothing about what the check can detect.
  CHECKSUM_FIELD,
  canonicalize,
  checksumOf,
};
if (typeof module === 'object' && module.exports) module.exports = api;
