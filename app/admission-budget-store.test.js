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
const {
  createAdmissionLedgerStore, LEDGER_FILENAME, LOCK_FILENAME, MAX_RAW_BYTES, STORE_REASON,
  CHECKSUM_FIELD, canonicalize, checksumOf,
} = require('./admission-budget-store');

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
    assert(store.lockPath() === path.join(dir, LOCK_FILENAME),
      'the lock path is the same main-supplied directory plus a CONSTANT filename');
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
    const saved = store.save(GOOD_DOC, null);
    assert(saved.ok === true, 'a valid document saves');
    assert(typeof saved.revision === 'string' && /^[0-9a-f]{64}$/.test(saved.revision),
      'save returns the new checksum revision');
    const loaded = store.load();
    assert(loaded.ok === true, 'the saved document loads back');
    assert(loaded.revision === saved.revision, 'load returns the same checksum revision');
    assert(JSON.stringify(loaded.doc) === JSON.stringify(GOOD_DOC), 'the round trip is faithful');

    // No temp files survive a successful save.
    const leftovers = fs.readdirSync(dir).filter((f) => f.endsWith('.tmp'));
    assert(leftovers.length === 0, 'a successful save leaves no .tmp files behind');

    // A second save replaces in place; the previous content is gone but the path is the same file.
    const updated = { ...GOOD_DOC, runs: { ...GOOD_DOC.runs } };
    updated.runs['evidence-run-0001'] = { ...updated.runs['evidence-run-0001'], admitted: 2 };
    assert(store.save(updated, loaded.revision).ok === true, 'a second save succeeds with the observed revision');
    assert(store.load().doc.runs['evidence-run-0001'].admitted === 2, 'the replacement is visible');
    assert(fs.readdirSync(dir).filter((f) => f.endsWith('.tmp')).length === 0, 'still no .tmp leftovers');
    assert(fs.readdirSync(dir).length === 1, 'exactly one file exists in the directory (the lock was removed)');
  }

  // ---- 4. locked compare-and-swap ---------------------------------------------------------------
  section('locked compare-and-swap across cooperating processes');
  {
    const dir = freshDir('cas-stale');
    const first = createAdmissionLedgerStore({ userDataDir: dir });
    const second = createAdmissionLedgerStore({ userDataDir: dir });
    assert(first.save(GOOD_DOC, null).ok === true, 'the initial CAS creates only from observed absence');
    const seenByFirst = first.load();
    const seenBySecond = second.load();
    assert(seenByFirst.revision === seenBySecond.revision,
      'two cooperating processes can observe the same starting revision');

    const winner = JSON.parse(JSON.stringify(GOOD_DOC));
    winner.runs['evidence-run-0001'].admitted = 2;
    const loser = JSON.parse(JSON.stringify(GOOD_DOC));
    loser.runs['evidence-run-0001'].admitted = 3;
    assert(first.save(winner, seenByFirst.revision).ok === true, 'the first writer wins the revision');
    const rejected = second.save(loser, seenBySecond.revision);
    assert(rejected.ok === false && rejected.reason === STORE_REASON.CONFLICT,
      'a stale second writer receives the bounded conflict reason');
    assert(second.load().doc.runs['evidence-run-0001'].admitted === 2,
      'the stale writer cannot clobber the winner');
  }
  {
    const dir = freshDir('cas-lock');
    const store = createAdmissionLedgerStore({ userDataDir: dir });
    store.save(GOOD_DOC, null);
    const loaded = store.load();
    const before = fs.readFileSync(store.ledgerPath());
    // Model another live application process holding the fixed lock. Remove exactly the lock this
    // test created, in this test-owned directory, after asserting the refusal.
    fs.writeFileSync(store.lockPath(), 'test-owned-lock', 'utf8');
    const changed = JSON.parse(JSON.stringify(GOOD_DOC));
    changed.runs['evidence-run-0001'].admitted = 2;
    const rejected = store.save(changed, loaded.revision);
    assert(rejected.ok === false && rejected.reason === STORE_REASON.CONFLICT,
      'an already-held cross-process lock refuses visibly');
    assert(fs.readFileSync(store.ledgerPath()).equals(before),
      'a lock conflict leaves the canonical ledger byte-identical');
    fs.rmSync(store.lockPath());
  }
  {
    const dir = freshDir('cas-revision-required');
    const store = createAdmissionLedgerStore({ userDataDir: dir });
    const rejected = store.save(GOOD_DOC);
    assert(rejected.ok === false && rejected.reason === STORE_REASON.REVISION_REQUIRED,
      'save cannot omit the observed revision contract');
    assert(!fs.existsSync(store.ledgerPath()), 'an omitted revision writes no ledger');
  }

  // ---- 5. every non-absent failure has its OWN reason ----------------------------------------------
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
    const r = store.save(cyclic, null);
    assert(r.ok === false && r.reason === STORE_REASON.NOT_SERIALIZABLE, 'an unserializable document refuses');
    assert(!fs.existsSync(store.ledgerPath()), 'nothing was written for an unserializable document');
  }
  {
    const dir = freshDir('oversizesave');
    const store = createAdmissionLedgerStore({ userDataDir: dir });
    const huge = { schemaVersion: 1, runs: { big: 'x'.repeat(MAX_RAW_BYTES) } };
    const r = store.save(huge, null);
    assert(r.ok === false && r.reason === STORE_REASON.TOO_LARGE, 'an oversize document refuses to save');
    assert(!fs.existsSync(store.ledgerPath()), 'nothing was written for an oversize document');
  }
  {
    // A failed rename must leave any previously saved ledger untouched. Inject an fs whose renameSync
    // throws, and prove the good file is still the good file.
    const dir = freshDir('renamefail');
    const real = createAdmissionLedgerStore({ userDataDir: dir });
    real.save(GOOD_DOC, null);
    const revision = real.load().revision;
    const before = fs.readFileSync(real.ledgerPath(), 'utf8');

    const flaky = createAdmissionLedgerStore({
      userDataDir: dir,
      fsImpl: {
        ...fs,
        renameSync: () => { throw new Error('rename failed'); },
      },
    });
    const bad = { schemaVersion: 1, runs: { 'evidence-run-0001': { ...GOOD_DOC.runs['evidence-run-0001'], admitted: 99 } } };
    const r = flaky.save(bad, revision);
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
    real.save(GOOD_DOC, null);
    const revision = real.load().revision;
    const before = fs.readFileSync(real.ledgerPath(), 'utf8');
    const flaky = createAdmissionLedgerStore({
      userDataDir: dir,
      fsImpl: { ...fs, writeFileSync: () => { throw new Error('disk full'); } },
    });
    const r = flaky.save(GOOD_DOC, revision);
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

  // ---- 7. integrity checksum ----------------------------------------------------------------------
  //
  // WHAT IS BEING TESTED, STATED PRECISELY. The checksum detects accidental corruption and edits that
  // did not recompute it. It is unkeyed, so it is NOT authentication, NOT hostile tamper resistance,
  // and NOT rollback prevention. Blue's authorization, verbatim: I ACCEPT THE ADMISSION LEDGER AS AN
  // ACCIDENTAL-SPEND CONTROL, NOT A SECURITY BOUNDARY AGAINST A MALICIOUS OR COMPROMISED SAME-USER
  // PANE. The limitations are asserted below alongside the protections, deliberately labelled.
  section('integrity checksum: accidental-edit detection only');
  {
    const dir = freshDir('checksum-roundtrip');
    const store = createAdmissionLedgerStore({ userDataDir: dir });
    assert(store.save(GOOD_DOC, null).ok === true, 'save() succeeds');
    const onDisk = JSON.parse(fs.readFileSync(store.ledgerPath(), 'utf8'));
    assert(typeof onDisk[CHECKSUM_FIELD] === 'string' && /^[0-9a-f]{64}$/.test(onDisk[CHECKSUM_FIELD]),
      'every persisted ledger carries a 64-hex SHA-256 checksum');
    const back = store.load();
    assert(back.ok === true, 'a valid checksummed ledger LOADS');
    assert(back.doc.runs['evidence-run-0001'].admitted === 1, 'with its content intact');
    assert(!Object.prototype.hasOwnProperty.call(back.doc, CHECKSUM_FIELD),
      'the checksum field is STRIPPED before the policy layer sees the doc');
    // Round-tripping a loaded doc back through save() must reproduce the same checksum: the field is
    // excluded from its own input, so content that has not changed hashes the same.
    assert(store.save(back.doc, back.revision).ok === true, 're-saving a loaded doc succeeds');
    assert(JSON.parse(fs.readFileSync(store.ledgerPath(), 'utf8'))[CHECKSUM_FIELD] === onDisk[CHECKSUM_FIELD],
      'an unchanged content round-trip produces an IDENTICAL checksum (canonical, order-independent)');
  }
  {
    // Canonical serialization: insertion order must not change the checksum, or a semantically
    // identical rewrite would produce false refusals.
    const a = { schemaVersion: 1, runs: { r2: { x: 1 }, r1: { y: 2 } } };
    const b = { runs: { r1: { y: 2 }, r2: { x: 1 } }, schemaVersion: 1 };
    assert(canonicalize(a) === canonicalize(b), 'canonical form is independent of key insertion order');
    assert(checksumOf(a) === checksumOf(b), 'and so is the checksum');
    assert(canonicalize({ a: [3, 1, 2] }) === '{"a":[3,1,2]}', 'array ORDER is preserved (it is data)');
    assert(checksumOf({ x: 1, [CHECKSUM_FIELD]: 'deadbeef' }) === checksumOf({ x: 1 }),
      'the checksum field is excluded from its own input');
  }
  {
    // MUTATION WITHOUT RECOMPUTING — the case this exists to catch.
    for (const [label, mutate] of [
      ['admitted', (d) => { d.runs['evidence-run-0001'].admitted = 0; }],
      ['allowance', (d) => { d.runs['evidence-run-0001'].allowance = 9; }],
      // NOTE: must differ from GOOD_DOC's existing 'open', or the "mutation" is a no-op and the
      // checksum legitimately still matches — which is a broken test, not a broken check.
      ['state', (d) => { d.runs['evidence-run-0001'].state = 'closed'; }],
      ['a whole added run', (d) => { d.runs.smuggled = { runId: 'smuggled', allowance: 9 }; }],
      ['a removed run', (d) => { delete d.runs['evidence-run-0001']; }],
    ]) {
      const dir = freshDir(`checksum-mutate-${label.replace(/\W+/g, '-')}`);
      const store = createAdmissionLedgerStore({ userDataDir: dir });
      store.save(GOOD_DOC, null);
      const doc = JSON.parse(fs.readFileSync(store.ledgerPath(), 'utf8'));
      mutate(doc);                                        // checksum left stale on purpose
      fs.writeFileSync(store.ledgerPath(), JSON.stringify(doc, null, 2), 'utf8');
      const r = store.load();
      assert(r.ok === false && r.reason === STORE_REASON.INTEGRITY_MISMATCH,
        `editing ${label} without recomputing the checksum is DETECTED`);
    }
  }
  {
    // A missing or malformed checksum is refused, not tolerated — otherwise stripping the field would
    // be the trivial bypass. There is no unchecksummed-ledger migration path and none is needed: no
    // production ledger has been created by an authorized live run.
    for (const [label, value] of [
      ['absent', undefined],
      ['empty', ''],
      ['too short', 'abc123'],
      ['uppercase hex', 'A'.repeat(64)],
      ['non-hex', 'z'.repeat(64)],
      ['wrong type', 12345],
      ['null', null],
    ]) {
      const dir = freshDir(`checksum-shape-${label.replace(/\W+/g, '-')}`);
      const store = createAdmissionLedgerStore({ userDataDir: dir });
      const doc = JSON.parse(JSON.stringify(GOOD_DOC));
      if (value !== undefined) doc[CHECKSUM_FIELD] = value;
      fs.writeFileSync(store.ledgerPath(), JSON.stringify(doc, null, 2), 'utf8');
      const r = store.load();
      assert(r.ok === false && r.reason === STORE_REASON.INTEGRITY_MISMATCH,
        `a ${label} checksum is refused`);
    }
  }
  {
    // The refusal must not leak content, and must not repair the file.
    const dir = freshDir('checksum-hygiene');
    const store = createAdmissionLedgerStore({ userDataDir: dir });
    store.save(GOOD_DOC, null);
    const doc = JSON.parse(fs.readFileSync(store.ledgerPath(), 'utf8'));
    doc.runs['evidence-run-0001'].runId = 'LEDGER-CONTENT-MARKER-DO-NOT-ECHO';
    const before = JSON.stringify(doc, null, 2);
    fs.writeFileSync(store.ledgerPath(), before, 'utf8');
    const r = store.load();
    assert(r.ok === false, 'the tampered ledger is refused');
    assert(JSON.stringify(r).indexOf('LEDGER-CONTENT-MARKER-DO-NOT-ECHO') === -1,
      'the integrity refusal never echoes ledger content');
    assert(JSON.stringify(r).indexOf(dir) === -1, 'nor the path');
    assert(fs.readFileSync(store.ledgerPath(), 'utf8') === before,
      'the rejected file is left EXACTLY as found — never repaired, deleted, or overwritten');
  }
  {
    // ACCEPTED LIMITATIONS, ASSERTED AS SUCH. None of these is a passing security property; each is a
    // consequence of an unkeyed checksum under Blue's stated threat boundary.
    const dir = freshDir('checksum-accepted-limits');
    const store = createAdmissionLedgerStore({ userDataDir: dir });
    store.save(GOOD_DOC, null);
    const early = fs.readFileSync(store.ledgerPath(), 'utf8');

    // (a) A same-user process can RECOMPUTE the checksum, so an edit that does so is accepted.
    const doc = JSON.parse(early);
    delete doc[CHECKSUM_FIELD];
    doc.runs['evidence-run-0001'].admitted = 0;
    doc[CHECKSUM_FIELD] = checksumOf(doc);
    fs.writeFileSync(store.ledgerPath(), JSON.stringify(doc, null, 2), 'utf8');
    const recomputed = store.load();
    assert(recomputed.ok === true && recomputed.doc.runs['evidence-run-0001'].admitted === 0,
      'ACCEPTED LIMITATION: an edit that RECOMPUTES the checksum is accepted (it is unkeyed by design)');

    // (b) Replaying an earlier VALID checksummed ledger is not detected.
    fs.writeFileSync(store.ledgerPath(), early, 'utf8');
    const replay = store.load();
    assert(replay.ok === true && replay.doc.runs['evidence-run-0001'].admitted === 1,
      'ACCEPTED LIMITATION: replaying an earlier valid checksummed ledger is not detected');

    // (c) Deleting the ledger still returns the creatable `not-found`.
    fs.rmSync(store.ledgerPath());
    assert(store.load().reason === STORE_REASON.NOT_FOUND,
      'ACCEPTED LIMITATION: deleting the ledger still yields not-found, which recreates a fresh run');
  }
  {
    // No new dependency, and no key material anywhere.
    const src = fs.readFileSync(path.join(__dirname, 'admission-budget-store.js'), 'utf8');
    const requires = src.match(/require\('([^']+)'\)/g) || [];
    assert(requires.every((r) => /'(fs|path|crypto)'/.test(r)),
      `the store requires only node built-ins (saw ${requires.join(' ')})`);
    assert(!/createHmac|scrypt|pbkdf2|randomBytes|dpapi|safeStorage|registry/i.test(src),
      'no HMAC, no key derivation, no DPAPI, no registry anchor — an unkeyed digest only');
    const code = src.split(/\r?\n/).filter((l) => !l.trim().startsWith('//')).join('\n');
    assert(!/authenticat|tamper-?proof|tamper-?resist/i.test(code),
      'the code does not describe the checksum as authentication or tamper resistance');
    assert(/not a security boundary against a malicious or compromised process/i.test(src),
      'the store header states the threat boundary verbatim');
  }
} finally {
  // Remove ONLY the directory this test created. Never a computed or inherited root.
  try { fs.rmSync(CREATED_BY_THIS_TEST, { recursive: true, force: true }); } catch { /* best effort */ }
}

process.stdout.write(`\nadmission-budget-store: ${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
