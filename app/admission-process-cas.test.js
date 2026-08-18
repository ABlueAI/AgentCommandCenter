'use strict';
// Run: node app/admission-process-cas.test.js
//
// INDEPENDENT-PROCESS LEDGER CAS TEST — the cross-process property, proved with real processes.
//
// WHY THIS FILE EXISTS. Double-spend of the LAST paid admission is the failure this whole control was
// built to stop, and it is the one property that CANNOT be proved by two objects inside one process:
// a same-process test shares the module-local `inFlight` guard and never touches the OS primitives that
// actually do the work — the `wx` lock file and the checksum-revision compare-and-swap in
// `admission-budget-store.js`. An independent Full-class review proved the property by hand with two
// spawned processes; this file makes that evidence TRACKED and REPEATABLE instead of a one-off.
//
// IT ALSO GUARDS A REMOVAL. An earlier revision took Electron's application-wide
// `requestSingleInstanceLock()` and leaned on it as part of the duplicate-process story. That global
// policy was REMOVED: it was unnecessary for ledger correctness, it changed startup for every
// gate-off user, and it made `--classic-layout` recovery unreachable while a Dockview instance held
// the lock. This suite is the standing proof that removing it took nothing away — the ledger's own
// lock and CAS are what prevent the double spend, and they still do, with no application singleton
// anywhere in the picture.
//
// SHAPE. The file re-executes ITSELF as the worker (`--worker`), so there is no second helper file to
// become an orphan. Coordination is a DETERMINISTIC BARRIER, not a sleep: each worker announces
// readiness by creating its own file and then spins until the parent creates `GO`, so the parent
// releases both only once both are actually loaded and waiting.
//
// Nothing here launches Electron, a provider, a hook, an app server, or a PTY. The "PTY write" is an
// append to a scratch file in a disposable temp directory, which is exactly the ground truth the
// assertions need: how many times bytes would have reached a terminal.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const config = require('./admission-budget-config');
const { createAdmissionBudget, REASON } = require('./admission-budget');
const { createAdmissionLedgerStore, LEDGER_FILENAME, LOCK_FILENAME } = require('./admission-budget-store');

const RUN_ID = 'process-cas-run';
const PANE_ID = 'pty1';
const ITERATIONS = 8;
const BARRIER_TIMEOUT_MS = 20000;

// The environment a controlled run is configured with. `REBIND=1` is what lets a second process adopt
// the seeded binding at all — without it the race could not even be set up, because a binding minted
// by an earlier process is deliberately stale.
const RUN_ENV = {
  BLUE_HELM_ADMISSION_ENABLED: '1',
  BLUE_HELM_ADMISSION_RUN_ID: RUN_ID,
  BLUE_HELM_ADMISSION_ALLOWANCE: '1',   // ONE turn: the last-admission race, every iteration
  BLUE_HELM_ADMISSION_REBIND: '1',
};

// ---------------------------------------------------------------------------------------------
// WORKER MODE
// ---------------------------------------------------------------------------------------------
if (process.argv[2] === '--worker') {
  const dir = process.argv[3];
  const tag = process.argv[4];
  const plan = config.parseAdmissionConfig(RUN_ENV);
  const store = createAdmissionLedgerStore({ userDataDir: dir });

  const budget = createAdmissionBudget({
    plan,
    storage: store,
    now: () => Date.now(),
    // GROUND TRUTH. One line here == one time bytes would have reached the terminal.
    writer: async (paneId, bytes) => {
      fs.appendFileSync(path.join(dir, 'ptywrites.log'), tag + ':' + paneId + ':' + bytes.length + '\n');
    },
    isPaneRunning: () => true,
    log: () => {},
  });

  // Deterministic barrier: announce readiness, then wait for the parent's release.
  fs.writeFileSync(path.join(dir, 'ready-' + tag), '1');
  const goPath = path.join(dir, 'GO');
  const deadline = Date.now() + BARRIER_TIMEOUT_MS;
  while (!fs.existsSync(goPath)) {
    if (Date.now() > deadline) { process.exit(3); }
  }

  const out = { tag, init: null, claim: null, submit: null };
  const init = budget.initialize();
  out.init = init.ok ? 'ok' : init.reason;
  const claim = budget.claimPane(PANE_ID);
  out.claim = claim.ok ? 'ok' : claim.reason;
  budget.submitPrompt(PANE_ID, 'process cas probe').then((r) => {
    out.submit = r.ok ? 'ADMITTED' : r.reason;
    fs.appendFileSync(path.join(dir, 'results.jsonl'), JSON.stringify(out) + '\n');
    process.exit(0);
  }).catch(() => process.exit(4));
  return;
}

// ---------------------------------------------------------------------------------------------
// PARENT MODE
// ---------------------------------------------------------------------------------------------
let passed = 0, failed = 0;
function assert(cond, label) {
  if (cond) { process.stdout.write('  ' + String.fromCharCode(10003) + ' ' + label + '\n'); passed++; }
  else { process.stderr.write('  x FAIL: ' + label + '\n'); failed++; }
}
function section(t) { process.stdout.write('\n' + t + '\n'); }

/** Seed a ledger holding exactly ONE unspent admission, already bound to the pane. */
function seedOneTurnLedger(dir) {
  const store = createAdmissionLedgerStore({ userDataDir: dir });
  const now = Date.now();
  const doc = {
    schemaVersion: 1,
    runs: {
      [RUN_ID]: {
        runId: RUN_ID, paneId: PANE_ID, allowance: 1, admitted: 0, refused: 0,
        state: 'open', createdUtc: now, updatedUtc: now,
      },
    },
  };
  const r = store.save(doc, null);
  if (!r.ok) throw new Error('seed failed: ' + r.reason);
}

function waitForBothReady(dir, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    (function poll() {
      const a = fs.existsSync(path.join(dir, 'ready-A'));
      const b = fs.existsSync(path.join(dir, 'ready-B'));
      if (a && b) return resolve();
      if (Date.now() > deadline) return reject(new Error('workers did not reach the barrier'));
      setTimeout(poll, 5);
    })();
  });
}

function runRace(dir) {
  return new Promise((resolve, reject) => {
    let exited = 0;
    const codes = [];
    const done = () => { if (++exited === 2) resolve(codes); };
    for (const tag of ['A', 'B']) {
      const child = spawn(process.execPath, [__filename, '--worker', dir, tag], { stdio: 'ignore' });
      child.on('error', reject);
      child.on('exit', (code) => { codes.push(code); done(); });
    }
    // Release both only once BOTH are loaded and spinning on the barrier.
    waitForBothReady(dir, BARRIER_TIMEOUT_MS)
      .then(() => fs.writeFileSync(path.join(dir, 'GO'), '1'))
      .catch(reject);
  });
}

(async () => {
  section('two INDEPENDENT OS processes race the last admission on a one-turn ledger');
  let violations = 0;
  let sawConflictRefusal = 0;

  for (let i = 1; i <= ITERATIONS; i++) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bh-proc-cas-'));
    seedOneTurnLedger(dir);
    const codes = await runRace(dir);

    const readLines = (f) => (fs.existsSync(path.join(dir, f))
      ? fs.readFileSync(path.join(dir, f), 'utf8').split('\n').filter((l) => l.trim().length > 0)
      : []);
    const writes = readLines('ptywrites.log');
    const results = readLines('results.jsonl').map((l) => JSON.parse(l));
    const ledger = JSON.parse(fs.readFileSync(path.join(dir, LEDGER_FILENAME), 'utf8'));
    const durable = ledger.runs[RUN_ID].admitted;

    const admitted = results.filter((r) => r.submit === 'ADMITTED');
    const refused = results.filter((r) => r.submit && r.submit !== 'ADMITTED');
    const lockLeft = fs.existsSync(path.join(dir, LOCK_FILENAME));
    const conflictRefusal = refused.length === 1 && refused[0].submit === REASON.STORAGE_CONFLICT;
    if (conflictRefusal) sawConflictRefusal++;

    const ok = codes.every((c) => c === 0)
      && results.length === 2
      && admitted.length === 1
      && refused.length === 1
      && writes.length === 1
      && durable === 1
      && conflictRefusal
      && !lockLeft;
    if (!ok) {
      violations++;
      process.stderr.write('    iteration ' + i + ' detail: exits=' + JSON.stringify(codes) +
        ' results=' + JSON.stringify(results.map((r) => r.submit)) +
        ' ptyWrites=' + writes.length + ' durableAdmitted=' + durable +
        ' lockLeftBehind=' + lockLeft + '\n');
    }
    fs.rmSync(dir, { recursive: true, force: true });
  }

  assert(violations === 0,
    ITERATIONS + '/' + ITERATIONS + ' races: exactly one admission, one refusal, one PTY write, ' +
    'durable admitted == 1, no lock left behind');
  assert(sawConflictRefusal === ITERATIONS,
    'every loser refused with the bounded reason "' + REASON.STORAGE_CONFLICT + '"');

  section('the losing process refuses without side effects');
  {
    // A single seeded ledger, read by one process, then advanced by another before the first writes:
    // the first must refuse on the revision comparison and must not write, repair, or replace anything.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bh-proc-cas-stale-'));
    seedOneTurnLedger(dir);
    const plan = config.parseAdmissionConfig(RUN_ENV);
    const storeA = createAdmissionLedgerStore({ userDataDir: dir });
    let writesA = 0;
    const budgetA = createAdmissionBudget({
      plan, storage: storeA, now: () => Date.now(),
      writer: async () => { writesA += 1; }, isPaneRunning: () => true, log: () => {},
    });
    budgetA.initialize();
    budgetA.claimPane(PANE_ID);

    // A second, independent writer advances the ledger behind A's back.
    const storeB = createAdmissionLedgerStore({ userDataDir: dir });
    const cur = storeB.load();
    cur.doc.runs[RUN_ID].admitted = 1;
    cur.doc.runs[RUN_ID].state = 'exhausted';
    const advanced = storeB.save(cur.doc, cur.revision);
    assert(advanced.ok === true, 'the second writer advanced the ledger through the CAS');

    const before = fs.readFileSync(path.join(dir, LEDGER_FILENAME));
    const res = await budgetA.submitPrompt(PANE_ID, 'stale revision probe');
    const after = fs.readFileSync(path.join(dir, LEDGER_FILENAME));

    assert(res.ok === false, 'the stale-revision holder is refused');
    assert(res.reason === REASON.STORAGE_CONFLICT,
      'it refuses with the bounded conflict reason (got "' + res.reason + '")');
    assert(writesA === 0, 'the refused caller wrote zero bytes to the PTY');
    assert(before.equals(after), 'the ledger it lost the race to is left byte-identical');
    fs.rmSync(dir, { recursive: true, force: true });
  }

  section('a stale lock file fails CLOSED and never opens admission');
  {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bh-proc-cas-lock-'));
    const store = createAdmissionLedgerStore({ userDataDir: dir });
    const seeded = store.save({ schemaVersion: 1, runs: {} }, null);
    assert(seeded.ok === true, 'a ledger is seeded through the normal locked write');
    // Simulate a process that died holding the lock.
    fs.writeFileSync(path.join(dir, LOCK_FILENAME), '');
    const before = fs.readFileSync(path.join(dir, LEDGER_FILENAME));

    const plan = config.parseAdmissionConfig(RUN_ENV);
    let writes = 0;
    const budget = createAdmissionBudget({
      plan, storage: store, now: () => Date.now(),
      writer: async () => { writes += 1; }, isPaneRunning: () => true, log: () => {},
    });
    const init = budget.initialize();
    const after = fs.readFileSync(path.join(dir, LEDGER_FILENAME));

    assert(init.ok === false, 'initialization refuses while a stale lock is held');
    assert(init.reason === REASON.STORAGE_CONFLICT,
      'it refuses with the bounded conflict reason (got "' + init.reason + '")');
    assert(writes === 0, 'no bytes reach the PTY');
    assert(before.equals(after), 'the ledger is left byte-identical');
    const submitted = await budget.submitPrompt(PANE_ID, 'after stale lock');
    assert(submitted.ok === false, 'no prompt can be admitted behind a stale lock');
    fs.rmSync(dir, { recursive: true, force: true });
  }

  section('this property does not depend on an application-wide singleton');
  {
    const mainSrc = fs.readFileSync(path.join(__dirname, 'main.js'), 'utf8');
    assert(!/requestSingleInstanceLock/.test(mainSrc),
      'main.js holds no Electron single-instance lock, and the races above still hold');
    const storeSrc = fs.readFileSync(path.join(__dirname, 'admission-budget-store.js'), 'utf8');
    assert(/openSync\(lockPath, 'wx'\)/.test(storeSrc),
      'the cross-process primitive is the ledger lock file, owned by the store');
    assert(!/single-instance|requestSingleInstanceLock/.test(storeSrc),
      'the store claims no dependence on application single-instance startup');
  }

  process.stdout.write('\nadmission-process-cas: ' + passed + ' passed, ' + failed + ' failed\n');
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  process.stderr.write('\nadmission-process-cas: harness error: ' + ((e && e.stack) || e) + '\n');
  process.exit(1);
});
