'use strict';
// Run: node app/admission-protective-state.test.js
// Route-by-state composition matrix: launch policy + budget + final PTY capability boundary.

const config = require('./admission-budget-config');
const budgetModule = require('./admission-budget');
const { createAdmissionPtyBoundary } = require('./admission-pty-boundary');
const { prepareAdmissionPaneLaunch, closeAfterFailedSpawn } = require('./admission-pane-launch');

let passed = 0, failed = 0;
function assert(condition, label) {
  if (condition) { process.stdout.write(`  ✓ ${label}\n`); passed += 1; }
  else { process.stderr.write(`  ✗ FAIL: ${label}\n`); failed += 1; }
}
function section(label) { process.stdout.write(`\n-- ${label} --\n`); }
function clone(value) { return value == null ? value : JSON.parse(JSON.stringify(value)); }
function revision(n) { return String(n).padStart(64, '0'); }

const RUN_ID = 'protective-state-run';
const ROLES = new Set(['builder', 'reviewer', 'codebase-scout', 'web-scout', 'operator', 'source-scout']);
const VALID_ENV = Object.freeze({
  BLUE_HELM_ADMISSION_ENABLED: '1',
  BLUE_HELM_ADMISSION_RUN_ID: RUN_ID,
  BLUE_HELM_ADMISSION_ALLOWANCE: '1',
});

function record(overrides = {}) {
  return {
    runId: RUN_ID,
    paneId: null,
    allowance: 1,
    admitted: 0,
    refused: 0,
    state: budgetModule.RUN_STATE.OPEN,
    createdUtc: 1,
    updatedUtc: 2,
    ...overrides,
  };
}
function ledger(run = record()) { return { schemaVersion: 1, runs: { [RUN_ID]: run } }; }

function makeStorage(initialDoc) {
  let rev = initialDoc === undefined ? null : revision(1);
  return {
    doc: initialDoc === undefined ? null : clone(initialDoc),
    saves: 0,
    failLoad: null,
    failSave: null,
    load() {
      if (this.failLoad) return { ok: false, reason: this.failLoad };
      if (this.doc === null) return { ok: false, reason: 'not-found' };
      return { ok: true, doc: clone(this.doc), revision: rev };
    },
    save(doc, expectedRevision) {
      if (this.failSave) return { ok: false, reason: this.failSave };
      if (expectedRevision !== rev) return { ok: false, reason: 'conflict' };
      this.doc = clone(doc);
      this.saves += 1;
      rev = revision(this.saves + 1);
      return { ok: true, revision: rev };
    },
  };
}

function createHarness({ env = VALID_ENV, initialDoc, initLoadFailure, spawnThrows = false, ptyWriteThrows = false } = {}) {
  const plan = config.parseAdmissionConfig(env);
  const storage = makeStorage(initialDoc);
  storage.failLoad = initLoadFailure || null;
  const ptys = new Map();
  const actualWrites = [];
  const visible = [];
  let finalWriter;
  const budget = budgetModule.createAdmissionBudget({
    plan,
    storage,
    now: (() => { let n = 10; return () => ++n; })(),
    isPaneRunning: (id) => ptys.has(id),
    writer: (id, bytes) => finalWriter.writeAdmitted(id, bytes),
    log: (line) => visible.push(String(line)),
  });
  finalWriter = createAdmissionPtyBoundary({
    getPty: (id) => ptys.get(id),
    isDirectInputBlocked: (id) => budget.isDirectInputBlocked(id),
    onDirectRefusal: () => visible.push('direct-input-refused'),
  });
  const init = plan.enabled ? budget.initialize() : { ok: false, reason: plan.reason };
  storage.failLoad = null;

  function launch(opts, options = {}) {
    const prepared = prepareAdmissionPaneLaunch({ plan, budget, opts, validRoles: ROLES });
    if (!prepared.ok) {
      visible.push(`launch-refused:${prepared.reason}`);
      return { prepared, spawned: false, cleanup: false };
    }
    if (options.spawnThrows || spawnThrows) {
      const cleanup = closeAfterFailedSpawn(budget, opts.id, prepared);
      visible.push('spawn-refused');
      return { prepared, spawned: false, cleanup };
    }
    ptys.set(opts.id, {
      write(bytes) {
        if (options.ptyWriteThrows || ptyWriteThrows) throw new Error('bounded-test-write-failure');
        actualWrites.push({ id: opts.id, bytes });
      },
    });
    return { prepared, spawned: true, cleanup: false };
  }

  function exit(id) {
    ptys.delete(id);
    return budget.notePaneExit(id);
  }
  function durableAdmissions() {
    const run = storage.doc && storage.doc.runs && storage.doc.runs[RUN_ID];
    return run ? run.admitted : 0;
  }
  return { plan, storage, budget, finalWriter, ptys, actualWrites, visible, init, launch, exit, durableAdmissions };
}

(async () => {
  section('configuration absent versus malformed request');
  {
    const absent = createHarness({ env: {} });
    const launch = absent.launch({ id: 'pty1', cli: 'claude' });
    assert(launch.spawned && !launch.prepared.controlled, 'admission absent: Claude spawn remains ordinary');
    assert(absent.finalWriter.writeDirect('pty1', 'ordinary').ok && absent.actualWrites.length === 1,
      'admission absent: generic input remains unchanged');
    assert((await absent.budget.submitPrompt('pty1', 'x')).ok === false && absent.durableAdmissions() === 0,
      'admission absent: controlled input refuses and no admission exists');

    const invalid = createHarness({ env: { BLUE_HELM_ADMISSION_ALLOWANCE: '1' } });
    const refused = invalid.launch({ id: 'pty1', cli: 'claude' });
    assert(!refused.spawned && invalid.visible.some((x) => x.startsWith('launch-refused:')),
      'malformed requested config: eligible Claude spawn visibly refuses');
    assert(invalid.actualWrites.length === 0 && invalid.durableAdmissions() === 0,
      'malformed requested config: zero writes and zero durable admissions');
    const shell = invalid.launch({ id: 'pty2' });
    assert(shell.spawned && invalid.finalWriter.writeDirect('pty2', 'shell').ok,
      'malformed requested config: ineligible plain shell remains ordinary');
  }

  section('initialization failures refuse eligible startup');
  for (const [label, options, expected] of [
    ['unreadable', { initLoadFailure: 'read-failed' }, budgetModule.REASON.STORAGE_UNREADABLE],
    ['integrity mismatch', { initLoadFailure: 'integrity-mismatch' }, budgetModule.REASON.STORAGE_INTEGRITY_MISMATCH],
    ['version mismatch', { initialDoc: { schemaVersion: 99, runs: {} } }, budgetModule.REASON.STORAGE_VERSION_MISMATCH],
    ['plan mismatch', { initialDoc: ledger(record({ allowance: 2 })) }, budgetModule.REASON.STORAGE_PLAN_MISMATCH],
    ['too many runs', { initialDoc: { schemaVersion: 1, runs: Object.fromEntries(Array.from({ length: 65 }, (_, i) =>
      [`filler-run-${String(i).padStart(6, '0')}`, { ...record(), runId: `filler-run-${String(i).padStart(6, '0')}` }])) } },
    budgetModule.REASON.STORAGE_TOO_MANY_RUNS],
  ]) {
    const h = createHarness(options);
    const launch = h.launch({ id: 'pty1', role: 'builder' });
    assert(h.init.reason === expected && !launch.spawned, `${label}: eligible spawn refuses with the bounded reason`);
    assert(h.actualWrites.length === 0 && h.durableAdmissions() === 0, `${label}: zero actual writes and admissions`);
    assert(h.visible.some((x) => x.includes(expected)), `${label}: refusal is visible`);
  }

  section('provider eligibility and pre-spawn durable claim');
  {
    const h = createHarness({ initialDoc: ledger() });
    for (const opts of [
      { id: 'pty1' },
      { id: 'pty2', cli: 'codex' },
      { id: 'pty3', cli: 'gemini' },
      { id: 'pty4', videoScout: true },
    ]) {
      const result = h.launch(opts);
      assert(result.spawned && result.prepared.controlled === false,
        `${opts.videoScout ? 'Video Scout' : (opts.cli || 'plain shell')} launches without claiming`);
    }
    assert(h.budget.boundPaneId() === null, 'ineligible panes leave the run unbound');
    const claude = h.launch({ id: 'pty5', cli: 'claude' });
    assert(claude.spawned && claude.prepared.controlled && h.budget.boundPaneId() === 'pty5',
      'the first eligible Claude pane is durably designated before spawn');
    assert(h.storage.doc.runs[RUN_ID].paneId === 'pty5', 'the durable ledger carries the selected pane id');
  }

  section('claim failures, CAS conflict, and stale binding');
  for (const [label, saveReason, expected] of [
    ['claim persist failure', 'write-failed', budgetModule.REASON.PERSIST_FAILED],
    ['claim CAS conflict', 'conflict', budgetModule.REASON.STORAGE_CONFLICT],
  ]) {
    const h = createHarness({ initialDoc: ledger() });
    h.storage.failSave = saveReason;
    const result = h.launch({ id: 'pty1', cli: 'claude' });
    assert(!result.spawned && h.budget.designationState() === budgetModule.DESIGNATION_STATE.PENDING,
      `${label}: no process spawns and pending protection stays latched`);
    assert(h.budget.isDirectInputBlocked('pty1') && result.prepared.reason === expected,
      `${label}: generic input remains blocked with the bounded reason`);
    assert(h.actualWrites.length === 0 && h.durableAdmissions() === 0, `${label}: zero writes and admissions`);
  }
  {
    const stale = createHarness({ initialDoc: ledger(record({ paneId: 'pty9' })) });
    const result = stale.launch({ id: 'pty1', cli: 'claude' });
    assert(!result.spawned && result.prepared.reason === budgetModule.REASON.PANE_BINDING_STALE,
      'stale binding without rebind visibly refuses startup');
    assert(stale.actualWrites.length === 0 && stale.durableAdmissions() === 0,
      'stale binding produces no writes or admissions');
  }

  section('healthy bound, fatal submission, exhausted, and closed');
  {
    const h = createHarness({ initialDoc: ledger() });
    assert(h.launch({ id: 'pty1', role: 'reviewer' }).spawned, 'healthy unbound run spawns its controlled pane');
    assert(!h.finalWriter.writeDirect('pty1', 'blocked').ok && h.actualWrites.length === 0,
      'healthy bound pane refuses generic input');
    h.storage.failLoad = 'integrity-mismatch';
    const refused = await h.budget.submitPrompt('pty1', 'controlled');
    assert(!refused.ok && h.budget.isDirectInputBlocked('pty1'),
      'submission integrity failure refuses controlled input and preserves generic blocking');
    assert(!h.finalWriter.writeDirect('pty1', 'bypass').ok && h.actualWrites.length === 0 && h.durableAdmissions() === 0,
      'fatal bound state has zero bypass writes and zero durable admissions');
  }
  {
    const exhausted = createHarness({ initialDoc: ledger(record({ admitted: 1, state: budgetModule.RUN_STATE.EXHAUSTED })) });
    exhausted.launch({ id: 'pty1', cli: 'claude' });
    const result = await exhausted.budget.submitPrompt('pty1', 'too many');
    assert(!result.ok && result.reason === budgetModule.REASON.EXHAUSTED && exhausted.durableAdmissions() === 1,
      'exhausted run refuses controlled input without increasing admissions');
    assert(!exhausted.finalWriter.writeDirect('pty1', 'bypass').ok && exhausted.actualWrites.length === 0,
      'exhausted live pane remains blocked from generic input');
  }
  {
    const closed = createHarness({ initialDoc: ledger(record({ state: budgetModule.RUN_STATE.CLOSED })) });
    const result = closed.launch({ id: 'pty1', cli: 'claude' });
    assert(!result.spawned && result.prepared.reason === budgetModule.REASON.RUN_CLOSED,
      'closed run refuses pane startup');
    assert(closed.actualWrites.length === 0 && closed.durableAdmissions() === 0, 'closed run performs no write or admission');
  }

  section('spawn/write failure, non-target pane, exit, and launch-time prompt');
  {
    const h = createHarness({ initialDoc: ledger() });
    const result = h.launch({ id: 'pty1', cli: 'claude' }, { spawnThrows: true });
    assert(!result.spawned && result.cleanup && h.storage.doc.runs[RUN_ID].state === budgetModule.RUN_STATE.CLOSED,
      'spawn failure closes the durably claimed run and voids its remainder');
    assert(!h.budget.isDirectInputBlocked('pty1') && h.actualWrites.length === 0,
      'spawn failure cleanup leaves no process/protection and no writes');
  }
  {
    const h = createHarness({ initialDoc: ledger(), ptyWriteThrows: true });
    h.launch({ id: 'pty1', cli: 'claude' });
    const result = await h.budget.submitPrompt('pty1', 'durably spent');
    assert(!result.ok && result.reason === budgetModule.REASON.WRITE_FAILED_AFTER_ADMISSION,
      'writer failure is visible after durable admission');
    assert(h.durableAdmissions() === 1 && h.actualWrites.length === 0,
      'writer failure is not refunded and records no successful write');
  }
  {
    const h = createHarness({ initialDoc: ledger() });
    h.launch({ id: 'pty1', cli: 'claude' });
    const second = h.launch({ id: 'pty2', role: 'builder', initialPrompt: 'ordinary second pane prompt' });
    assert(second.spawned && second.prepared.nonTarget && h.finalWriter.writeDirect('pty2', 'ordinary').ok,
      'a second non-target Claude pane remains ordinary and cannot move the binding');
    assert(h.budget.boundPaneId() === 'pty1' && h.durableAdmissions() === 0,
      'the second pane neither rebinds nor spends the run');
    h.exit('pty1');
    assert(!h.budget.isDirectInputBlocked('pty1') && h.storage.doc.runs[RUN_ID].state === budgetModule.RUN_STATE.CLOSED,
      'pane exit releases process protection and durably closes the run');
  }
  {
    const h = createHarness({ initialDoc: ledger() });
    const result = h.launch({ id: 'pty1', role: 'reviewer', initialPrompt: 'would start a paid turn' });
    assert(!result.spawned && result.prepared.reason === 'admission-launch-prompt-blocked',
      'nonempty launch-time initialPrompt visibly refuses the intended controlled pane');
    assert(h.storage.doc.runs[RUN_ID].paneId === null && h.durableAdmissions() === 0 && h.actualWrites.length === 0,
      'launch-time prompt refusal creates no claim, admission, process write, or cleanup residue');
  }

  process.stdout.write(`\nadmission-protective-state: ${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
})().catch((error) => {
  process.stderr.write(`admission-protective-state harness failed: ${error && error.stack}\n`);
  process.exit(1);
});
