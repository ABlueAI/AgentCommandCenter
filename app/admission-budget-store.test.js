'use strict';
// Run: node app/admission-budget-store.test.js
//
// The durable ledger boundary for the MAIN-OWNED TURN ADMISSION BUDGET.
//
// This suite uses a REAL filesystem, because the properties under test are filesystem properties: the
// atomic replace, the lstat-before-read ordering, the byte bound applied before parsing, and — the one
// that matters most for cost — that `not-found` is the ONLY read outcome distinguishable as "absent".
// Every other failure must return its own reason so the policy layer refuses instead of minting a
// fresh allowance.
//
// CLEANUP DISCIPLINE: the suite creates exactly one uniquely-named directory under the OS temp dir and
// removes only that directory at the end. It never deletes a path it did not create, and it never
// touches the real Electron userData directory.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { createAdmissionLedgerStore, LEDGER_FILENAME, MAX_RAW_BYTES, STORE_REASON } = require('./admission-budget-store');

let passed = 0, failed = 0;
function assert(cond, label) {
  if (cond) { process.stdout.write(`  ✓ ${label}\n`); passed++; }
  else { process.stderr.write(`  ✗ FAIL: ${label}\n`); failed++; }
}
function section(name) { process.stdout.write(`\n-- ${name} --\n`); }

// One directory, created by this test, removed by this test. Nothing else is ever deleted.
const TMP_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'admission-store-test-'));
const CREATED_BY_THIS_TEST = TMP_ROOT;

function freshDir(name) {
  const dir = path.join(TMP_ROOT, name);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

const GOOD_DOC = {
  schemaVersion: 1,
  runs: {
    'evidence-run-0001': {
      runId: 'evidence-run-0001', paneId: 'pty1', allowance: 3,
      admitted: 1, refused: 0, state: 'open', createdUtc: 1, updatedUtc: 2,
    },
  },
};

try {
  // ---- 1. construction ---------------------------------------------------------------------------
  section('construction');
  {
    let threw = false;
    try { createAdmissionLedgerStore({}); } catch { threw = true; }
    assert(threw, 'a store without userDataDir refuses to construct');
    threw = false;
    try { createAdmissionLedgerStore({ userDataDir: '' }); } catch { threw = true; }
    assert(threw, 'an empty userDataDir refuses to construct');

    const dir = freshDir('construct');
    const store = createAdmissionLedgerStore({ userDataDir: dir });
    assert(store.ledgerPath() === path.join(dir, LEDGER_FILENAME),
      'the ledger path is the main-supplied directory plus a CONSTANT filename');
    assert(!store.ledgerPath().includes('evidence-run'),
      'the run id is NOT part of the path — one ledger holds every run, so one atomic write is consistent');
  }

  // ---- 2. absence is the only creatable state ------------------------------------------------------
  section('absence is distinguishable, and only absence');
  {
    const dir = freshDir('absent');
    const store = createAdmissionLedgerStore({ userDataDir: dir });
    const r = store.load();
    assert(r.ok === false && r.reason === STORE_REASON.NOT_FOUND,
      'a missing ledger returns the distinct not-found reason');
    assert(!fs.existsSync(store.ledgerPath()), 'load() did not create the file as a side effect');
  }

  // ---- 3. round trip and atomic replace ------------------------------------------------------------
  section('round trip and atomic replace');
  {
    const dir = freshDir('roundtrip');
    const store = createAdmissionLedgerStore({ userDataDir: dir });
    const saved = store.save(GOOD_DOC);
    assert(saved.ok === true, 'a valid document saves');
    const loaded = store.load();
    assert(loaded.ok === true, 'the saved document loads back');
    assert(JSON.stringify(loaded.doc) === JSON.stringify(GOOD_DOC), 'the round trip is faithful');

    // No temp files survive a successful save.
    const leftovers = fs.readdirSync(dir).filter((f) => f.endsWith('.tmp'));
    assert(leftovers.length === 0, 'a successful save leaves no .tmp files behind');

    // A second save replaces in place; the previous content is gone but the path is the same file.
    const updated = { ...GOOD_DOC, runs: { ...GOOD_DOC.runs } };
    updated.runs['evidence-run-0001'] = { ...updated.runs['evidence-run-0001'], admitted: 2 };
    assert(store.save(updated).ok === true, 'a second save succeeds');
    assert(store.load().doc.runs['evidence-run-0001'].admitted === 2, 'the replacement is visible');
    assert(fs.readdirSync(dir).filter((f) => f.endsWith('.tmp')).length === 0, 'still no .tmp leftovers');
    assert(fs.readdirSync(dir).length === 1, 'exactly one file exists in the directory');
  }

  // ---- 4. every non-absent failure has its OWN reason ----------------------------------------------
  section('hostile files fail closed with distinct reasons');
  {
    const dir = freshDir('notregular');
    // A DIRECTORY at the canonical path is not an absent ledger.
    fs.mkdirSync(path.join(dir, LEDGER_FILENAME));
    const r = createAdmissionLedgerStore({ userDataDir: dir }).load();
    assert(r.ok === false && r.reason === STORE_REASON.NOT_REGULAR_FILE,
      'a directory at the ledger path is not-regular-file, NOT not-found');
  }
  {
    const dir = freshDir('toolarge');
    const store = createAdmissionLedgerStore({ userDataDir: dir });
    fs.writeFileSync(store.ledgerPath(), Buffer.alloc(MAX_RAW_BYTES + 1, 0x20));
    const r = store.load();
    assert(r.ok === false && r.reason === STORE_REASON.TOO_LARGE,
      'an oversize ledger is refused BEFORE it is parsed');
  }
  {
    const dir = freshDir('badutf8');
    const store = createAdmissionLedgerStore({ userDataDir: dir });
    fs.writeFileSync(store.ledgerPath(), Buffer.from([0x7b, 0xff, 0xfe, 0x7d]));
    const r = store.load();
    assert(r.ok === false && r.reason === STORE_REASON.INVALID_UTF8, 'invalid UTF-8 is refused');
  }
  {
    const dir = freshDir('badjson');
    const store = createAdmissionLedgerStore({ userDataDir: dir });
    fs.writeFileSync(store.ledgerPath(), '{ this is not json', 'utf8');
    const r = store.load();
    assert(r.ok === false && r.reason === STORE_REASON.INVALID_JSON, 'unparseable JSON is refused');
    assert(fs.readFileSync(store.ledgerPath(), 'utf8') === '{ this is not json',
      'the unparseable file is left EXACTLY as-is for diagnosis — never repaired or deleted');
  }
  {
    // A BOM means something other than this application wrote the ledger. The WHATWG decoder would
    // silently STRIP it (`ignoreBOM: false` removes a leading BOM — the flag reads backwards), so the
    // store checks the bytes explicitly. This assertion is what keeps that check from being deleted
    // as redundant.
    const dir = freshDir('bom');
    const store = createAdmissionLedgerStore({ userDataDir: dir });
    fs.writeFileSync(store.ledgerPath(), Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(JSON.stringify(GOOD_DOC), 'utf8')]));
    const r = store.load();
    assert(r.ok === false && r.reason === STORE_REASON.INVALID_UTF8,
      'a BOM-prefixed ledger is refused, not silently stripped and accepted');
  }
  {
    // Reparse points need elevation on Windows, so this is a BEST-EFFORT check that reports honestly
    // rather than silently passing. The lstat-not-stat ordering it guards is asserted by source
    // inspection below regardless of whether the link could be created here.
    const dir = freshDir('reparse');
    const store = createAdmissionLedgerStore({ userDataDir: dir });
    const target = path.join(dir, 'elsewhere.json');
    fs.writeFileSync(target, JSON.stringify(GOOD_DOC), 'utf8');
    let linked = false;
    try { fs.symlinkSync(target, store.ledgerPath(), 'file'); linked = true; } catch { linked = false; }
    if (linked) {
      const r = store.load();
      assert(r.ok === false && r.reason === STORE_REASON.REPARSE_POINT,
        'a symlink at the ledger path is refused before any read');
    } else {
      process.stdout.write('  · SKIPPED: symlink creation needs elevation on this host (reported, not silently passed)\n');
      const src = fs.readFileSync(path.join(__dirname, 'admission-budget-store.js'), 'utf8');
      assert(/lstatSync\(ledgerPath\)/.test(src) && /isSymbolicLink\(\)/.test(src),
        'source inspection: the store lstats and refuses symbolic links before reading');
    }
  }

  // ---- 5. save-side bounds and failures ------------------------------------------------------------
  section('save-side bounds and failures');
  {
    const dir = freshDir('unserializable');
    const store = createAdmissionLedgerStore({ userDataDir: dir });
    const cyclic = { schemaVersion: 1, runs: {} };
    cyclic.self = cyclic;
    const r = store.save(cyclic);
    assert(r.ok === false && r.reason === STORE_REASON.NOT_SERIALIZABLE, 'an unserializable document refuses');
    assert(!fs.existsSync(store.ledgerPath()), 'nothing was written for an unserializable document');
  }
  {
    const dir = freshDir('oversizesave');
    const store = createAdmissionLedgerStore({ userDataDir: dir });
    const huge = { schemaVersion: 1, runs: { big: 'x'.repeat(MAX_RAW_BYTES) } };
    const r = store.save(huge);
    assert(r.ok === false && r.reason === STORE_REASON.TOO_LARGE, 'an oversize document refuses to save');
    assert(!fs.existsSync(store.ledgerPath()), 'nothing was written for an oversize document');
  }
  {
    // A failed rename must leave any previously saved ledger untouched. Inject an fs whose renameSync
    // throws, and prove the good file is still the good file.
    const dir = freshDir('renamefail');
    const real = createAdmissionLedgerStore({ userDataDir: dir });
    real.save(GOOD_DOC);
    const before = fs.readFileSync(real.ledgerPath(), 'utf8');

    const flaky = createAdmissionLedgerStore({
      userDataDir: dir,
      fsImpl: {
        ...fs,
        renameSync: () => { throw new Error('rename failed'); },
      },
    });
    const bad = { schemaVersion: 1, runs: { 'evidence-run-0001': { ...GOOD_DOC.runs['evidence-run-0001'], admitted: 99 } } };
    const r = flaky.save(bad);
    assert(r.ok === false && r.reason === STORE_REASON.WRITE_FAILED, 'a failed rename reports write-failed');
    assert(fs.readFileSync(real.ledgerPath(), 'utf8') === before,
      'the PREVIOUS ledger is byte-identical after a failed rename — the canonical file was never unlinked');
    assert(fs.readdirSync(dir).filter((f) => f.endsWith('.tmp')).length === 0,
      'the temp file is cleaned up after a failed rename');
  }
  {
    // A failed WRITE (before any rename) must also leave the previous ledger intact.
    const dir = freshDir('writefail');
    const real = createAdmissionLedgerStore({ userDataDir: dir });
    real.save(GOOD_DOC);
    const before = fs.readFileSync(real.ledgerPath(), 'utf8');
    const flaky = createAdmissionLedgerStore({
      userDataDir: dir,
      fsImpl: { ...fs, writeFileSync: () => { throw new Error('disk full'); } },
    });
    const r = flaky.save(GOOD_DOC);
    assert(r.ok === false && r.reason === STORE_REASON.WRITE_FAILED, 'a failed write reports write-failed');
    assert(fs.readFileSync(real.ledgerPath(), 'utf8') === before, 'the previous ledger survives a failed write');
  }
  {
    // A read that fails for a reason other than absence must NOT be reported as absence.
    const dir = freshDir('readfail');
    const store = createAdmissionLedgerStore({
      userDataDir: dir,
      fsImpl: {
        ...fs,
        lstatSync: () => ({ isSymbolicLink: () => false, isFile: () => true, size: 10 }),
        readFileSync: () => { const e = new Error('EACCES'); e.code = 'EACCES'; throw e; },
      },
    });
    const r = store.load();
    assert(r.ok === false && r.reason === STORE_REASON.READ_FAILED,
      'a permission failure is read-failed, NOT not-found');
  }
  {
    // An lstat failure that is not ENOENT is likewise not absence.
    const dir = freshDir('lstatfail');
    const store = createAdmissionLedgerStore({
      userDataDir: dir,
      fsImpl: { ...fs, lstatSync: () => { const e = new Error('EPERM'); e.code = 'EPERM'; throw e; } },
    });
    const r = store.load();
    assert(r.ok === false && r.reason === STORE_REASON.READ_FAILED, 'a non-ENOENT lstat failure is read-failed');
  }

  // ---- 6. reason-code hygiene ---------------------------------------------------------------------
  section('refusals carry bounded reason codes only');
  {
    const dir = freshDir('hygiene');
    const store = createAdmissionLedgerStore({ userDataDir: dir });
    fs.writeFileSync(store.ledgerPath(), 'SECRET-LEDGER-CONTENT-MARKER', 'utf8');
    const r = store.load();
    const text = JSON.stringify(r);
    assert(text.indexOf('SECRET-LEDGER-CONTENT-MARKER') === -1, 'a refusal never echoes file contents');
    assert(text.indexOf(dir) === -1, 'a refusal never echoes the path');
    assert(Object.values(STORE_REASON).includes(r.reason), 'the reason is one of the declared constants');
  }
} finally {
  // Remove ONLY the directory this test created. Never a computed or inherited root.
  try { fs.rmSync(CREATED_BY_THIS_TEST, { recursive: true, force: true }); } catch { /* best effort */ }
}

process.stdout.write(`\nadmission-budget-store: ${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
