'use strict';
// Run: node app/admission-budget.test.js
//
// The MAIN-OWNED TURN ADMISSION BUDGET state machine. This suite is the mechanical answer to Blue's
// turn-accounting OUTCOME B, so it is written to prove the COST properties rather than the happy path:
//
//   * allowance N admits exactly N and prompt N+1 writes zero bytes;
//   * the decrement is DURABLE BEFORE the writer is ever called;
//   * a persistence failure writes nothing;
//   * a writer failure after a successful persist is NOT refunded;
//   * a restart cannot restore a consumed turn, by file, by configuration, or by rollback;
//   * a budget cannot move between panes, and a pane exit voids rather than transfers.
//
// Everything is injected: storage, clock, writer. There is no fs mutation, no Electron, no PTY, and no
// provider session anywhere in this file. Sections run SEQUENTIALLY from one async main() so the
// output order is deterministic and a failure is attributable to the section that printed last.

const fs = require('fs');
const path = require('path');
const budgetModule = require('./admission-budget');
const config = require('./admission-budget-config');

let passed = 0, failed = 0;
function assert(cond, label) {
  if (cond) { process.stdout.write(`  ✓ ${label}\n`); passed++; }
  else { process.stderr.write(`  ✗ FAIL: ${label}\n`); failed++; }
}
function section(name) { process.stdout.write(`\n-- ${name} --\n`); }

const { REASON, RUN_STATE, SUBMISSION_TERMINATOR } = budgetModule;

// A prompt sentinel that must never appear anywhere except the bytes handed to the writer.
const SENTINEL = 'ZZ-PROMPT-SENTINEL-9f3a1c04-DO-NOT-LOG';

// Control characters built by code point, never as source literals — a literal ESC or NUL in a test
// file is invisible in a diff and survives copy/paste badly.
const CC = (n) => String.fromCharCode(n);

// ---- harness -------------------------------------------------------------------------------------

/** In-memory ledger storage. `disk` survives across budget instances, which is how "restart" is simulated. */
function makeStorage(initial) {
  const s = {
    disk: initial === undefined ? null : initial, // null models "file does not exist"
    failSave: false,
    failLoad: null,   // a reason string to return from load()
    throwOnSave: false,
    saves: 0,
    load() {
      if (s.failLoad) return { ok: false, reason: s.failLoad };
      if (s.disk === null) return { ok: false, reason: 'not-found' };
      // Deep clone so a caller cannot mutate "the file" by holding the object we returned.
      return { ok: true, doc: JSON.parse(JSON.stringify(s.disk)) };
    },
    save(doc) {
      s.saves += 1;
      if (s.throwOnSave) throw new Error('storage exploded');
      if (s.failSave) return { ok: false, reason: 'write-failed' };
      s.disk = JSON.parse(JSON.stringify(doc));
      return { ok: true };
    },
  };
  return s;
}

const RUN_ID = 'evidence-run-0001';

function makePlan(overrides) {
  return Object.freeze({
    schemaVersion: 1,
    enabled: true,
    allowance: 3,
    runId: RUN_ID,
    paneId: null,
    rebind: false,
    reason: null,
    ...(overrides || {}),
  });
}

/** Build a budget plus the recording harness around it. */
function makeBudget(opts) {
  const o = opts || {};
  const storage = o.storage || makeStorage();
  const writes = [];
  const logs = [];
  let t = 1000;
  const budget = budgetModule.createAdmissionBudget({
    plan: o.plan || makePlan(),
    storage,
    now: () => (t += 1),
    isPaneRunning: o.isPaneRunning || (() => true),
    // The default writer snapshots the PERSISTED ledger at the instant it is called. That snapshot is
    // the evidence for required test 4 (decrement precedes write).
    writer: o.writer || ((paneId, bytes) => {
      writes.push({ paneId, bytes, diskAtWriteTime: JSON.parse(JSON.stringify(storage.disk)) });
    }),
    log: (line) => logs.push(String(line)),
  });
  return { budget, storage, writes, logs };
}

function recordOf(storage, runId) {
  return storage.disk && storage.disk.runs ? storage.disk.runs[runId || RUN_ID] : null;
}

// ---- sections --------------------------------------------------------------------------------------

async function testDisabled() {
  section('required test 1: disabled / default-zero refuses');
  const disabled = budgetModule.createAdmissionBudget({ plan: config.parseAdmissionConfig({}) });
  assert(disabled.enabled === false, 'a disabled plan yields the disabled budget object');
  assert(disabled.isControlledPane('pty1') === false, 'no pane is controlled when disabled');
  assert(disabled.isDirectInputBlocked('pty1') === false, 'direct input is NOT blocked when disabled');
  assert(disabled.initialize().ok === false, 'initialize() refuses when disabled');
  assert(disabled.claimPane('pty1').ok === false, 'claimPane() refuses when disabled');
  assert(disabled.boundPaneId() === null, 'no pane is bound when disabled');
  assert(disabled.notePaneExit('pty1') === false, 'notePaneExit() is a no-op when disabled');
  const r = await disabled.submitPrompt('pty1', 'hello');
  assert(r.ok === false && r.reason === REASON.DISABLED, 'submitPrompt() refuses when disabled');
  for (const m of ['setAllowance', 'increaseAllowance', 'reset', 'refund', 'certify', 'grant', 'topUp']) {
    assert(typeof disabled[m] === 'undefined', `the disabled budget exposes no ${m}()`);
  }
}

async function testExactlyNThenRefuse() {
  section('required tests 2/3/4: exactly N, then a visible refusal, decrement first');
  const h = makeBudget();
  h.budget.initialize();
  h.budget.claimPane('pty1');

  for (let i = 1; i <= 3; i += 1) {
    const r = await h.budget.submitPrompt('pty1', `${SENTINEL}-${i}`);
    assert(r.ok === true && r.admitted === i && r.remaining === 3 - i,
      `admission ${i}/3 granted (remaining ${3 - i})`);
  }
  assert(h.writes.length === 3, 'exactly 3 PTY writes occurred for an allowance of 3');

  // REQUIRED TEST 4 — the write must never precede the durable decrement. Each writer call captured
  // the persisted ledger at that instant; every snapshot must already count its own admission. If the
  // order were reversed these would all be off by one.
  for (let i = 0; i < 3; i += 1) {
    const snap = h.writes[i].diskAtWriteTime;
    assert(snap && snap.runs[RUN_ID].admitted === i + 1,
      `write ${i + 1} saw a PERSISTED admitted count of ${i + 1} — decrement and persist preceded the write`);
  }

  // REQUIRED TEST 3 — prompt N+1.
  const overflow = await h.budget.submitPrompt('pty1', `${SENTINEL}-4`);
  assert(overflow.ok === false && overflow.reason === REASON.EXHAUSTED, 'prompt 4 of 3 is refused');
  assert(overflow.remaining === 0, 'the refusal reports zero remaining');
  assert(h.writes.length === 3, 'prompt 4 performed ZERO additional PTY writes');
  assert(recordOf(h.storage).admitted === 3, 'the persisted admitted count is still exactly 3');
  assert(h.logs.some((l) => /REFUSED/.test(l) && /fully consumed/.test(l)),
    'the refusal is visible in the log stream');
  assert(recordOf(h.storage).state === RUN_STATE.EXHAUSTED, 'the run is durably marked exhausted');

  // The submission terminator is main's, appended exactly once, and the caller never supplied it.
  assert(h.writes[0].bytes === `${SENTINEL}-1${SUBMISSION_TERMINATOR}`,
    'main appends exactly the submission terminator and nothing else');
  assert(h.writes[0].bytes.split(SUBMISSION_TERMINATOR).length - 1 === 1,
    'exactly ONE terminator per admission — one complete prompt');

  section('required test 19: prompt content never leaves the boundary');
  assert(JSON.stringify(h.storage.disk).indexOf(SENTINEL) === -1, 'the sentinel is absent from the persisted ledger');
  assert(h.logs.join('\n').indexOf(SENTINEL) === -1, 'the sentinel is absent from every log line');
  assert(JSON.stringify(overflow).indexOf(SENTINEL) === -1, 'the sentinel is absent from the refusal payload');
  assert(JSON.stringify(h.budget.state()).indexOf(SENTINEL) === -1, 'the sentinel is absent from the state view');
  const keys = Object.keys(recordOf(h.storage)).sort();
  assert(JSON.stringify(keys) === JSON.stringify(
    ['admitted', 'allowance', 'createdUtc', 'paneId', 'refused', 'runId', 'state', 'updatedUtc']),
    'the persisted record holds ONLY the approved non-content fields');
}

async function testPersistFailure() {
  section('required test 6: a persistence failure writes nothing');
  const h = makeBudget();
  h.budget.initialize();
  h.budget.claimPane('pty1');
  const before = recordOf(h.storage).admitted;

  h.storage.failSave = true;
  const r = await h.budget.submitPrompt('pty1', SENTINEL);
  assert(r.ok === false && r.reason === REASON.PERSIST_FAILED, 'a failed persist refuses the admission');
  assert(h.writes.length === 0, 'ZERO PTY writes occurred when the ledger could not be persisted');
  assert(recordOf(h.storage).admitted === before, 'the durable admitted count is unchanged');

  // Fail-closed and STAY closed: a budget that could not persist does not resume on the next attempt.
  h.storage.failSave = false;
  const again = await h.budget.submitPrompt('pty1', SENTINEL);
  assert(again.ok === false && again.reason === REASON.PERSIST_FAILED,
    'the budget stays refusing after a persistence failure — no silent self-healing');
  assert(h.writes.length === 0, 'still zero writes');

  // A storage layer that THROWS rather than returning a refusal must behave identically.
  const t = makeBudget();
  t.budget.initialize();
  t.budget.claimPane('pty1');
  t.storage.throwOnSave = true;
  const tr = await t.budget.submitPrompt('pty1', SENTINEL);
  assert(tr.ok === false && tr.reason === REASON.PERSIST_FAILED, 'a THROWING storage save refuses too');
  assert(t.writes.length === 0, 'a throwing storage save writes nothing to the PTY');
}

async function testWriterFailureNotRefunded() {
  section('required test 5: a writer failure after admission is not refunded');
  const h = makeBudget({ writer: () => { throw new Error('pty exploded'); } });
  h.budget.initialize();
  h.budget.claimPane('pty1');
  const r = await h.budget.submitPrompt('pty1', SENTINEL);
  assert(r.ok === false && r.reason === REASON.WRITE_FAILED_AFTER_ADMISSION,
    'a throwing writer reports write-failed-after-admission');
  assert(recordOf(h.storage).admitted === 1, 'the admission stays CONSUMED — no refund');
  assert(h.budget.state().remaining === 2, 'remaining reflects the consumed admission');
  assert(h.logs.join('\n').indexOf(SENTINEL) === -1, 'the failed write did not log the prompt');
  assert(JSON.stringify(r).indexOf(SENTINEL) === -1, 'the failure payload does not carry the prompt');

  // An asynchronously REJECTING writer must be treated the same as a throwing one.
  const a = makeBudget({ writer: () => Promise.reject(new Error('async pty failure')) });
  a.budget.initialize();
  a.budget.claimPane('pty1');
  const ar = await a.budget.submitPrompt('pty1', SENTINEL);
  assert(ar.ok === false && ar.reason === REASON.WRITE_FAILED_AFTER_ADMISSION,
    'an async-rejecting writer also reports write-failed-after-admission');
  assert(recordOf(a.storage).admitted === 1, 'the async failure is also not refunded');
}

async function testRestartAndCrashWindows() {
  section('required tests 7/20: restart and crash-window negative controls');
  {
    const storage = makeStorage();
    const first = makeBudget({ storage });
    first.budget.initialize();
    first.budget.claimPane('pty1');
    await first.budget.submitPrompt('pty1', SENTINEL);
    await first.budget.submitPrompt('pty1', SENTINEL);
    assert(recordOf(storage).admitted === 2, 'two admissions consumed before the simulated restart');

    // RESTART: a brand-new budget object over the same durable ledger, same run id.
    const second = makeBudget({ storage, plan: makePlan({ rebind: true }) });
    const init = second.budget.initialize();
    assert(init.ok === true, 'the restarted run initializes from the existing ledger');
    assert(second.budget.state().admitted === 2, 'the restarted run loads the CONSUMED count');
    assert(second.budget.state().remaining === 1, 'only the true remainder is available after restart');
    assert(second.budget.state().bindingStale === true, 'the pane binding from the previous session is stale');

    second.budget.claimPane('pty2');
    const r = await second.budget.submitPrompt('pty2', SENTINEL);
    assert(r.ok === true && r.admitted === 3, 'the third admission is granted after an authorized rebind');
    const overflow = await second.budget.submitPrompt('pty2', SENTINEL);
    assert(overflow.ok === false && overflow.reason === REASON.EXHAUSTED,
      'a restart did NOT restore the original allowance — the 4th prompt still refuses');
    assert(second.writes.length === 1, 'the restarted process wrote exactly the one remaining admission');
  }
  {
    // Restart WITHOUT explicit rebind authorization: the remainder is unreachable, pending human
    // disposition. It must never silently re-bind to whatever pane happens to start first.
    const storage = makeStorage();
    const first = makeBudget({ storage });
    first.budget.initialize();
    first.budget.claimPane('pty1');
    await first.budget.submitPrompt('pty1', SENTINEL);

    const second = makeBudget({ storage }); // rebind: false
    second.budget.initialize();
    const claim = second.budget.claimPane('pty7');
    assert(claim.ok === false && claim.reason === REASON.PANE_BINDING_STALE,
      'a restarted run refuses to re-bind without explicit authorization');
    assert(second.budget.isControlledPane('pty7') === false, 'no pane is controlled while the binding is stale');
    const r = await second.budget.submitPrompt('pty7', SENTINEL);
    assert(r.ok === false, 'no admission is granted while the binding is stale');
    assert(second.writes.length === 0, 'zero writes while the binding is stale');
  }
  {
    // CRASH WINDOW: the ledger was persisted but the process died before the writer ran. On restart
    // the admission must still count as consumed — the conservative direction. The opposite ordering
    // (write then persist) would show admitted=0 here and hand back a paid turn.
    const storage = makeStorage();
    const first = makeBudget({ storage, writer: () => { throw new Error('crash during write'); } });
    first.budget.initialize();
    first.budget.claimPane('pty1');
    await first.budget.submitPrompt('pty1', SENTINEL);
    assert(recordOf(storage).admitted === 1, 'the pre-write persist survived the simulated crash');

    const second = makeBudget({ storage, plan: makePlan({ rebind: true }) });
    second.budget.initialize();
    assert(second.budget.state().admitted === 1 && second.budget.state().remaining === 2,
      'the crash-window admission is still consumed after restart — no extra turn was created');
  }
  {
    // CONFIGURATION-SIDE restore attempt: raising the allowance and restarting must not top the run up.
    const storage = makeStorage();
    const first = makeBudget({ storage });
    first.budget.initialize();
    first.budget.claimPane('pty1');
    await first.budget.submitPrompt('pty1', SENTINEL);
    await first.budget.submitPrompt('pty1', SENTINEL);
    await first.budget.submitPrompt('pty1', SENTINEL);

    const topUp = makeBudget({ storage, plan: makePlan({ allowance: 9, rebind: true }) });
    const init = topUp.budget.initialize();
    assert(init.ok === false && init.reason === REASON.STORAGE_PLAN_MISMATCH,
      'raising the configured allowance for an existing run refuses — a restart cannot top up the budget');
    const r = await topUp.budget.submitPrompt('pty1', SENTINEL);
    assert(r.ok === false, 'no admission is granted after a plan mismatch');
    assert(topUp.writes.length === 0, 'a top-up attempt writes nothing');
  }
  {
    // A NEW run id is not automatically authorized just because it differs: it gets its own record and
    // its own allowance, and it cannot see or spend the first run's consumed count.
    const storage = makeStorage();
    const first = makeBudget({ storage });
    first.budget.initialize();
    first.budget.claimPane('pty1');
    await first.budget.submitPrompt('pty1', SENTINEL);

    const other = makeBudget({ storage, plan: makePlan({ runId: 'evidence-run-0002' }) });
    other.budget.initialize();
    assert(other.budget.state().admitted === 0, 'a different run id starts its own record at zero');
    assert(recordOf(storage, RUN_ID).admitted === 1,
      "the first run's consumed count is untouched by the second run");
    assert(Object.keys(storage.disk.runs).length === 2, 'both runs coexist in one ledger');
  }
}

async function testHostileLedgers() {
  section('required test 8: hostile ledger states fail closed');
  const good = { runId: RUN_ID, paneId: null, allowance: 3, admitted: 1, refused: 0, state: RUN_STATE.OPEN, createdUtc: 1, updatedUtc: 2 };
  const cases = [
    ['a version-mismatched ledger', { schemaVersion: 99, runs: { [RUN_ID]: good } }, REASON.STORAGE_VERSION_MISMATCH],
    ['a ledger that is not an object', 'not-a-ledger', REASON.STORAGE_MALFORMED],
    ['a ledger that is an array', [], REASON.STORAGE_MALFORMED],
    ['a ledger with no runs map', { schemaVersion: 1 }, REASON.STORAGE_MALFORMED],
    ['a ledger whose runs is an array', { schemaVersion: 1, runs: [] }, REASON.STORAGE_MALFORMED],
    ['a negative admitted count', { schemaVersion: 1, runs: { [RUN_ID]: { ...good, admitted: -1 } } }, REASON.STORAGE_MALFORMED],
    ['a non-integer admitted count', { schemaVersion: 1, runs: { [RUN_ID]: { ...good, admitted: 1.5 } } }, REASON.STORAGE_MALFORMED],
    ['an unknown run state', { schemaVersion: 1, runs: { [RUN_ID]: { ...good, state: 'refunded' } } }, REASON.STORAGE_MALFORMED],
    ['an over-cap allowance', { schemaVersion: 1, runs: { [RUN_ID]: { ...good, allowance: 999 } } }, REASON.STORAGE_MALFORMED],
    ['a malformed persisted pane id', { schemaVersion: 1, runs: { [RUN_ID]: { ...good, paneId: '../etc' } } }, REASON.STORAGE_MALFORMED],
    ['a mismatched run id inside the record', { schemaVersion: 1, runs: { [RUN_ID]: { ...good, runId: 'other-run-000001' } } }, REASON.STORAGE_MALFORMED],
    ['an allowance that disagrees with the plan', { schemaVersion: 1, runs: { [RUN_ID]: { ...good, allowance: 5 } } }, REASON.STORAGE_PLAN_MISMATCH],
    ['more admissions than the allowance', { schemaVersion: 1, runs: { [RUN_ID]: { ...good, admitted: 4 } } }, REASON.STORAGE_CORRUPT_COUNTS],
  ];
  for (const [label, disk, expected] of cases) {
    const h = makeBudget({ storage: makeStorage(disk) });
    const init = h.budget.initialize();
    assert(init.ok === false && init.reason === expected, `${label} -> ${expected}`);
    const r = await h.budget.submitPrompt('pty1', SENTINEL);
    assert(r.ok === false && h.writes.length === 0, `${label} -> zero PTY writes`);
    assert(h.budget.isDirectInputBlocked('pty1') === false,
      `${label} -> the failed run does not claim to control any pane`);
  }

  // An UNREADABLE ledger is not an absent ledger. Every read failure other than not-found refuses,
  // because a run that cannot establish what it has already spent must not spend more.
  for (const reason of ['read-failed', 'reparse-point', 'not-regular-file', 'too-large', 'invalid-utf8', 'invalid-json']) {
    const storage = makeStorage();
    storage.failLoad = reason;
    const h = makeBudget({ storage });
    const init = h.budget.initialize();
    assert(init.ok === false && init.reason === REASON.STORAGE_UNREADABLE,
      `a "${reason}" read refuses (it is NOT treated as an absent ledger)`);
    const r = await h.budget.submitPrompt('pty1', SENTINEL);
    assert(r.ok === false && h.writes.length === 0, `a "${reason}" read writes nothing`);
  }

  // An absent ledger FILE is the one creation path, and it creates the run at zero admissions.
  {
    const h = makeBudget({ storage: makeStorage() });
    const init = h.budget.initialize();
    assert(init.ok === true && h.budget.state().admitted === 0,
      'an absent ledger file creates the run at zero admissions (the only creation path)');
    assert(recordOf(h.storage) !== null, 'the created run is persisted immediately');
  }
  // …but a creation that cannot be persisted must not proceed on an assumed allowance.
  {
    const storage = makeStorage();
    storage.failSave = true;
    const h = makeBudget({ storage });
    const init = h.budget.initialize();
    assert(init.ok === false && init.reason === REASON.PERSIST_FAILED,
      'a creation that cannot be persisted refuses rather than running on an in-memory allowance');
    const r = await h.budget.submitPrompt('pty1', SENTINEL);
    assert(r.ok === false && h.writes.length === 0, 'the unpersisted run writes nothing');
  }
  // A ledger carrying more runs than the bound refuses rather than being pruned.
  {
    const runs = {};
    for (let i = 0; i < budgetModule.MAX_PERSISTED_RUNS + 1; i += 1) {
      const id = `filler-run-${String(i).padStart(6, '0')}`;
      runs[id] = { ...good, runId: id };
    }
    const h = makeBudget({ storage: makeStorage({ schemaVersion: 1, runs }) });
    const init = h.budget.initialize();
    assert(init.ok === false && init.reason === REASON.STORAGE_TOO_MANY_RUNS,
      'an over-full ledger refuses rather than evicting a run record');
  }
}

async function testRollback() {
  section('rollback tripwire: a ledger that moves backwards');
  const storage = makeStorage();
  const live = makeBudget({ storage });
  live.budget.initialize();
  live.budget.claimPane('pty1');
  await live.budget.submitPrompt('pty1', SENTINEL);
  assert(recordOf(storage).admitted === 1, 'one admission consumed');

  // Someone restores an older copy of the ledger beneath a LIVE run.
  storage.disk.runs[RUN_ID].admitted = 0;
  const after = await live.budget.submitPrompt('pty1', SENTINEL);
  assert(after.ok === true, 'the live in-memory count remains authoritative for the running process');
  assert(recordOf(storage).admitted === 2,
    'the live process re-persists from its own count, so the rollback granted no extra turn');

  // COMMENT CORRECTED during the Quick Links integration. The previous wording here claimed this
  // block proved a CROSS-PROCESS rollback guard — "a NEW budget instance ... must refuse when a later
  // load reports fewer admissions". It does not, and neither does the implementation. Every assertion
  // below is unchanged; only the false claim above them is removed.
  //
  // `highWaterAdmitted` is PER-INSTANCE and starts at 0, and `initialize()` short-circuits once a
  // record is loaded, so a fresh instance never reaches the `existing.admitted < highWaterAdmitted`
  // comparison with a non-zero mark. What the assertions here actually establish is ADOPTION: a new
  // instance takes the ledger's current count at face value. An offline edit of the ledger between
  // runs therefore restores the budget — an accepted residual, documented in
  // docs/BUILDER-HANDOFF-pane-status-admission-budget.md, and pinned by
  // admission-ui-integration.test.js so it stays a known property rather than a surprise.
  //
  // It is a residual and not a hole because the budget bounds what CLAUDE CODE can spend: the ledger
  // lives under Electron `userData`, never inside a worktree, and every admission env key is stripped
  // from each PTY environment, so the agent can neither find nor rewrite it.
  const s2 = makeStorage();
  const b = makeBudget({ storage: s2 });
  b.budget.initialize();
  b.budget.claimPane('pty1');
  await b.budget.submitPrompt('pty1', SENTINEL);
  await b.budget.submitPrompt('pty1', SENTINEL);
  const rolled = budgetModule.createAdmissionBudget({
    plan: makePlan(), storage: s2, now: () => 1, writer: () => {}, log: () => {},
  });
  const firstInit = rolled.initialize();
  assert(firstInit.ok === true, 'the fresh instance adopts the current count');
  assert(rolled.state().admitted === 2, 'the fresh instance sees two admissions');
}

async function testConcurrency() {
  section('required test 9: concurrent submissions cannot overspend');
  let release;
  const gate = new Promise((r) => { release = r; });
  const writes = [];
  const storage = makeStorage();
  const budget = budgetModule.createAdmissionBudget({
    plan: makePlan({ allowance: 1 }),
    storage,
    now: () => 1,
    // A deliberately SLOW writer: it holds the admission open so a second request has a real window
    // in which to interleave.
    writer: async (paneId, bytes) => { writes.push(bytes); await gate; },
    log: () => {},
  });
  budget.initialize();
  budget.claimPane('pty1');

  const a = budget.submitPrompt('pty1', `${SENTINEL}-A`);
  const b = budget.submitPrompt('pty1', `${SENTINEL}-B`);
  release();
  const [ra, rb] = await Promise.all([a, b]);

  const granted = [ra, rb].filter((r) => r.ok === true);
  assert(granted.length === 1, 'exactly ONE of two simultaneous requests for the last admission is granted');
  assert(writes.length === 1, 'exactly ONE PTY write occurred');
  assert(recordOf(storage).admitted === 1, 'the durable count shows exactly one admission');
  const loser = [ra, rb].find((r) => r.ok !== true);
  assert(loser.reason === REASON.IN_FLIGHT || loser.reason === REASON.EXHAUSTED,
    `the loser is refused with a bounded reason (${loser.reason})`);

  // Ten simultaneous requests against an allowance of 2 must yield at most 2 writes.
  const s2 = makeStorage();
  const w2 = [];
  let release2;
  const gate2 = new Promise((r) => { release2 = r; });
  const b2 = budgetModule.createAdmissionBudget({
    plan: makePlan({ allowance: 2, runId: 'evidence-run-0003' }),
    storage: s2, now: () => 1,
    writer: async (_p, bytes) => { w2.push(bytes); await gate2; },
    log: () => {},
  });
  b2.initialize();
  b2.claimPane('pty1');
  const many = Array.from({ length: 10 }, (_, i) => b2.submitPrompt('pty1', `${SENTINEL}-${i}`));
  release2();
  const results = await Promise.all(many);
  const ok = results.filter((r) => r.ok === true).length;
  assert(ok <= 2 && w2.length <= 2, `10 simultaneous requests against an allowance of 2 produced ${w2.length} write(s)`);
  assert(recordOf(s2, 'evidence-run-0003').admitted <= 2, 'the durable count never exceeds the allowance');
}

async function testPaneBinding() {
  section('required tests 10/11: pane binding is immovable; exit voids the remainder');
  {
    const h = makeBudget();
    h.budget.initialize();
    assert(h.budget.claimPane('pty1').ok === true, 'the first pane claims the run');
    assert(h.budget.isControlledPane('pty1') === true, 'pty1 is the controlled pane');

    const second = h.budget.claimPane('pty2');
    assert(second.ok === false && second.reason === REASON.PANE_ALREADY_BOUND,
      'a second pane cannot claim the run');
    assert(h.budget.isControlledPane('pty2') === false, 'pty2 is not controlled');
    assert(recordOf(h.storage).paneId === 'pty1', 'the persisted binding still names the first pane');

    const wrongPane = await h.budget.submitPrompt('pty2', SENTINEL);
    assert(wrongPane.ok === false && wrongPane.reason === REASON.PANE_MISMATCH,
      'a prompt aimed at the wrong pane is refused');
    assert(h.writes.length === 0, 'the wrong-pane prompt performed zero PTY writes');

    const again = h.budget.claimPane('pty1');
    assert(again.ok === true && again.alreadyBound === true, 're-claiming by the same pane is idempotent');
    assert(h.budget.claimPane('nonsense-pane').reason === REASON.BAD_PANE_ID, 'a malformed pane id is refused');
    assert(h.budget.claimPane(null).reason === REASON.BAD_PANE_ID, 'a null pane id is refused');

    const noBinding = makeBudget();
    noBinding.budget.initialize();
    const unbound = await noBinding.budget.submitPrompt('pty1', SENTINEL);
    assert(unbound.ok === false && unbound.reason === REASON.NO_PANE_BOUND,
      'a prompt before any pane is bound is refused');
    assert(noBinding.writes.length === 0, 'an unbound run writes nothing');
  }
  {
    const h = makeBudget();
    h.budget.initialize();
    h.budget.claimPane('pty1');
    await h.budget.submitPrompt('pty1', SENTINEL);
    assert(h.budget.state().remaining === 2, 'two admissions remain before the pane exits');

    assert(h.budget.notePaneExit('pty2') === false, 'an unrelated pane exit does not close the run');
    assert(h.budget.notePaneExit('pty1') === true, 'the bound pane exit closes the run');
    assert(recordOf(h.storage).state === RUN_STATE.CLOSED, 'the run is durably CLOSED');
    assert(recordOf(h.storage).admitted === 1, 'the consumed count is untouched by the exit');

    const afterExit = await h.budget.submitPrompt('pty1', SENTINEL);
    assert(afterExit.ok === false && afterExit.reason === REASON.RUN_CLOSED,
      'no admission is granted after the pane exits');
    const otherPane = h.budget.claimPane('pty2');
    assert(otherPane.ok === false && otherPane.reason === REASON.RUN_CLOSED,
      'the remaining allowance cannot be claimed by another pane — it is VOID, not transferable');
    assert(h.writes.length === 1, 'only the one pre-exit admission ever reached a PTY');
  }
  {
    // A dead PTY must not consume an admission for a prompt no provider will read.
    const h = makeBudget({ isPaneRunning: () => false });
    h.budget.initialize();
    h.budget.claimPane('pty1');
    const r = await h.budget.submitPrompt('pty1', SENTINEL);
    assert(r.ok === false && r.reason === REASON.PANE_NOT_RUNNING, 'a prompt to a dead PTY is refused');
    assert(recordOf(h.storage).admitted === 0, 'a dead PTY consumes no admission');
    assert(h.writes.length === 0, 'a dead PTY receives no write');
  }
  {
    // A configured pane PIN binds immediately and still cannot be moved.
    const h = makeBudget({ plan: makePlan({ paneId: 'pty5' }) });
    h.budget.initialize();
    assert(h.budget.isControlledPane('pty5') === true, 'a pinned pane is controlled from initialize()');
    assert(h.budget.claimPane('pty6').reason === REASON.PANE_ALREADY_BOUND, 'a pinned run refuses another pane');
  }
}

function testPromptValidation() {
  section('required test 13 (prompt half): Enter and control characters cannot ride in a prompt');
  const bad = [
    ['a carriage return (Enter)', `first${CC(13)}second`],
    ['a line feed', `first${CC(10)}second`],
    ['a CRLF pair', `first${CC(13)}${CC(10)}second`],
    ['an ESC (terminal escape sequence)', `text${CC(27)}[31mred`],
    ['a NUL', `text${CC(0)}more`],
    ['a backspace', `text${CC(8)}`],
    ['a tab', `text${CC(9)}more`],
    ['a DEL', `text${CC(127)}`],
    ['a C1 control', `text${CC(155)}more`],
  ];
  for (const [label, text] of bad) {
    const v = budgetModule.validatePrompt(text);
    assert(v.ok === false && v.reason === REASON.PROMPT_CONTROL_CHARS, `${label} is refused`);
  }
  // A bare terminator trims to nothing, so it is caught one rule earlier. What matters is that it is
  // REFUSED and writes nothing — not which of the two bounded reasons fires first.
  {
    const v = budgetModule.validatePrompt(SUBMISSION_TERMINATOR);
    assert(v.ok === false, 'a bare submission terminator is refused');
    assert(v.reason === REASON.EMPTY_PROMPT,
      'a bare terminator is refused as an empty prompt (it trims to nothing before the control-char rule)');
  }
  assert(budgetModule.validatePrompt('a normal prompt with punctuation: 1, 2, 3!').ok === true,
    'an ordinary prompt is accepted');
  assert(budgetModule.validatePrompt('unicode is fine — accented café, emoji ok').ok === true,
    'non-ASCII text is accepted');
  assert(budgetModule.validatePrompt('').reason === REASON.EMPTY_PROMPT, 'an empty prompt is refused');
  assert(budgetModule.validatePrompt('   ').reason === REASON.EMPTY_PROMPT, 'a whitespace-only prompt is refused');
  assert(budgetModule.validatePrompt(null).reason === REASON.BAD_PROMPT_TYPE, 'a null prompt is refused');
  assert(budgetModule.validatePrompt(123).reason === REASON.BAD_PROMPT_TYPE, 'a numeric prompt is refused');
  assert(budgetModule.validatePrompt({}).reason === REASON.BAD_PROMPT_TYPE, 'an object prompt is refused');
  assert(budgetModule.validatePrompt('x'.repeat(budgetModule.MAX_PROMPT_CHARS + 1)).reason === REASON.PROMPT_TOO_LONG,
    'an over-long prompt is refused');
  assert(budgetModule.validatePrompt('x'.repeat(budgetModule.MAX_PROMPT_CHARS)).ok === true,
    'a prompt at exactly the maximum length is accepted');
  assert(JSON.stringify(budgetModule.validatePrompt(`${SENTINEL}${CC(13)}`)).indexOf(SENTINEL) === -1,
    'the validator result never echoes the prompt');
}

function testNoMutationSurface() {
  section('required test 17: nothing provider-side can touch the ledger');
  const h = makeBudget();
  h.budget.initialize();
  h.budget.claimPane('pty1');

  const surface = Object.keys(h.budget).sort();
  assert(JSON.stringify(surface) === JSON.stringify(
    ['boundPaneId', 'claimPane', 'enabled', 'initialize', 'isControlledPane', 'isDirectInputBlocked',
      'notePaneExit', 'state', 'submitPrompt']),
    'the live budget exposes exactly the nine expected members and nothing else');

  for (const m of ['setAllowance', 'increaseAllowance', 'addAdmission', 'reset', 'refund', 'certify',
    'grant', 'topUp', 'applyHookEvent', 'onProviderEvent', 'setAdmitted', 'setState']) {
    assert(typeof h.budget[m] === 'undefined', `there is no ${m}() to call — the mutation does not exist`);
  }

  // The state view is a snapshot, not a handle: mutating it changes nothing.
  const view = h.budget.state();
  view.remaining = 999;
  view.admitted = -5;
  assert(h.budget.state().remaining === 3 && h.budget.state().admitted === 0,
    'mutating the returned state view does not change the budget');

  // Source tripwire: the pane-status prototype must not be able to reach the admission modules at all.
  const protoDir = path.join(__dirname, 'prototype-pane-status');
  const protoFiles = fs.readdirSync(protoDir).filter((f) => f.endsWith('.js'));
  assert(protoFiles.length > 0, 'the pane-status prototype directory has sources to scan');
  const offenders = protoFiles.filter((f) =>
    /require\(['"][^'"]*admission[^'"]*['"]\)/.test(fs.readFileSync(path.join(protoDir, f), 'utf8')));
  assert(offenders.length === 0,
    `no pane-status prototype module imports an admission module (found: ${offenders.join(', ') || 'none'})`);
}

function testSourceTripwires() {
  section('required test 21: source tripwires on the ordering rule');
  const src = fs.readFileSync(path.join(__dirname, 'admission-budget.js'), 'utf8');
  const persistIdx = src.indexOf('const persisted = persist(currentDoc());');
  const writerIdx = src.indexOf('await writer(paneId, promptText + SUBMISSION_TERMINATOR)');
  assert(persistIdx !== -1, 'the admission path contains the pre-write persist');
  assert(writerIdx !== -1, 'the admission path contains the writer call');
  assert(persistIdx < writerIdx, 'in source order, the durable persist precedes the writer call');
  assert((src.match(/await writer\(/g) || []).length === 1,
    'there is exactly ONE writer invocation in the module — no second path to the PTY');

  const mainSrc = fs.readFileSync(path.join(__dirname, 'main.js'), 'utf8');
  assert(/if \(admissionIpc && admissionIpc\.refuseDirectWrite\(id\)\) return;/.test(mainSrc),
    "main.js's pty-write handler returns before p.write when the direct write is refused");
  assert(/admissionBudget\.notePaneExit\(id\)/.test(mainSrc),
    'main.js closes the run on pane exit');
  assert(/admissionBudget\.claimPane\(id\)/.test(mainSrc),
    'main.js claims the pane at pty-start');
}

// ---- run -------------------------------------------------------------------------------------------

(async () => {
  await testDisabled();
  await testExactlyNThenRefuse();
  await testPersistFailure();
  await testWriterFailureNotRefunded();
  await testRestartAndCrashWindows();
  await testHostileLedgers();
  await testRollback();
  await testConcurrency();
  await testPaneBinding();
  testPromptValidation();
  testNoMutationSurface();
  testSourceTripwires();

  process.stdout.write(`\nadmission-budget: ${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
})().catch((err) => {
  process.stderr.write(`\nadmission-budget: harness error ${(err && err.message) || err}\n`);
  process.exit(1);
});
