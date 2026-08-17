'use strict';
// MAIN-OWNED TURN ADMISSION BUDGET — the pure admission state machine.
//
// Procurement record: docs/OSS-PROCUREMENT-pane-status.md
// Blue's verdict, verbatim: BLUE SUBSYSTEM VERDICT: BUILD FRESH
// Blue's authorization for THIS branch, verbatim:
//   I SELECT TURN-ACCOUNTING OUTCOME B. THE FOURTH TURN REMAINS UNEXPLAINED. NO LIVE PANE-STATUS
//   PROVIDER SESSION IS AUTHORIZED UNTIL THE MAIN-OWNED ADMISSION BUDGET IS REVIEWED AND LANDED.
//
// WHAT THIS IS. A controlled live evidence run costs money per prompt. Blue authorized three turns and
// four were observed; the fourth was never explained. Outcome B is the mechanical answer: a paid
// prompt can only reach the PTY through an admission this module grants, the grant is DURABLE BEFORE
// the write, and the count is owned by the main process — not by Claude Code, and not by the
// pane-status hook that is itself the thing under test.
//
// THE ORDERING RULE, which is the whole point:
//
//     validate -> decrement in memory -> PERSIST -> only then call the writer
//
// A crash between persist and write loses a paid turn. A crash between write and persist would GAIN
// one. Only the first is acceptable, so persistence always leads. Consequently a writer failure after
// a successful persist is NOT refunded: `write-failed-after-admission` is reported and the admission
// stays consumed. Over-counting is a bounded cost; under-counting is the failure this exists to stop.
//
// PURE. No fs, no Electron, no timers, no globals. Storage, clock, writer and logger are injected, so
// every rule below — including the crash windows and the concurrency race — is exercised in plain node
// by admission-budget.test.js against fakes.
//
// WHAT CANNOT TOUCH THE LEDGER. There is no method here that increments, refunds, resets, extends, or
// certifies an allowance. Provider output, hook events, badge state and PTY bytes reach no function in
// this file. That is a structural property, not a policy check: the mutation does not exist to call.

const config = require('./admission-budget-config');

const SCHEMA_VERSION = 1;

// The exact byte main appends to submit one prompt to a ConPTY-hosted CLI. Carriage return is what
// the terminal treats as Enter. It is a CONSTANT here and is appended by main — never supplied by the
// caller — so a caller cannot decide how (or how many times) its text is submitted.
const SUBMISSION_TERMINATOR = '\r';

// Prompt bounds. Generous enough for a real evidence prompt, small enough that a runaway renderer
// cannot push megabytes through the boundary.
const MAX_PROMPT_CHARS = 4000;

// Bounded run states.
const RUN_STATE = Object.freeze({
  OPEN: 'open',           // admissions remain
  EXHAUSTED: 'exhausted', // allowance fully consumed
  CLOSED: 'closed',       // pane exited or run torn down; no further admission, remainder is void
});

// Every refusal reason. Constants only. A reason NEVER contains a prompt, a pane id supplied by an
// untrusted caller, a path, a run id, or provider text — refusal lines are surfaced to the Logs tab
// and retained, so anything interpolated here would be retained too.
const REASON = Object.freeze({
  DISABLED: 'admission-disabled',
  NOT_INITIALIZED: 'admission-not-initialized',
  STORAGE_UNREADABLE: 'admission-ledger-unreadable',
  STORAGE_MALFORMED: 'admission-ledger-malformed',
  STORAGE_VERSION_MISMATCH: 'admission-ledger-version-mismatch',
  STORAGE_ROLLED_BACK: 'admission-ledger-rolled-back',
  STORAGE_CORRUPT_COUNTS: 'admission-ledger-corrupt-counts',
  STORAGE_PLAN_MISMATCH: 'admission-ledger-plan-mismatch',
  STORAGE_TOO_MANY_RUNS: 'admission-ledger-too-many-runs',
  PERSIST_FAILED: 'admission-persist-failed',
  EXHAUSTED: 'admission-budget-exhausted',
  RUN_CLOSED: 'admission-run-closed',
  NO_PANE_BOUND: 'admission-no-pane-bound',
  PANE_MISMATCH: 'admission-pane-mismatch',
  PANE_BINDING_STALE: 'admission-pane-binding-stale',
  PANE_ALREADY_BOUND: 'admission-pane-already-bound',
  PANE_NOT_RUNNING: 'admission-pane-not-running',
  BAD_PANE_ID: 'admission-bad-pane-id',
  BAD_PROMPT_TYPE: 'admission-prompt-not-a-string',
  EMPTY_PROMPT: 'admission-prompt-empty',
  PROMPT_TOO_LONG: 'admission-prompt-too-long',
  PROMPT_CONTROL_CHARS: 'admission-prompt-control-characters',
  IN_FLIGHT: 'admission-already-in-flight',
  WRITE_FAILED_AFTER_ADMISSION: 'admission-write-failed-after-admission',
  DIRECT_INPUT_BLOCKED: 'admission-direct-input-blocked',
});

// Bound on the persisted run map. A ledger that has accumulated more than this many runs is refused
// rather than pruned: silently evicting a run record is exactly how a consumed count would come back.
const MAX_PERSISTED_RUNS = 64;

// ---- pure validation -------------------------------------------------------------------------

/**
 * Validate one controlled prompt. Exported so the IPC boundary and the state machine share ONE
 * implementation rather than two that can drift.
 *
 * Rejects every C0 control character, DEL, and every C1 control character. That is deliberately
 * broader than "no newlines": it also excludes ESC (so a prompt cannot carry a terminal escape
 * sequence into the PTY) and it guarantees the caller cannot embed a submission terminator and get
 * two prompts admitted as one.
 *
 * The returned object NEVER contains the prompt or any excerpt of it.
 */
function validatePrompt(text) {
  if (typeof text !== 'string') return { ok: false, reason: REASON.BAD_PROMPT_TYPE };
  if (text.length === 0 || text.trim().length === 0) return { ok: false, reason: REASON.EMPTY_PROMPT };
  if (text.length > MAX_PROMPT_CHARS) return { ok: false, reason: REASON.PROMPT_TOO_LONG };
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1f\x7f-\x9f]/.test(text)) return { ok: false, reason: REASON.PROMPT_CONTROL_CHARS };
  return { ok: true, chars: text.length };
}

/** Shape check for a persisted run record. Anything unexpected is malformed, never repaired. */
function isPlausibleRecord(rec) {
  if (!rec || typeof rec !== 'object' || Array.isArray(rec)) return false;
  if (typeof rec.runId !== 'string' || !config.RUN_ID_PATTERN.test(rec.runId)) return false;
  if (rec.paneId !== null && (typeof rec.paneId !== 'string' || !config.PANE_ID_PATTERN.test(rec.paneId))) return false;
  if (!Number.isSafeInteger(rec.allowance) || rec.allowance < 1 || rec.allowance > config.MAX_ALLOWANCE) return false;
  if (!Number.isSafeInteger(rec.admitted) || rec.admitted < 0) return false;
  if (!Number.isSafeInteger(rec.refused) || rec.refused < 0) return false;
  if (rec.state !== RUN_STATE.OPEN && rec.state !== RUN_STATE.EXHAUSTED && rec.state !== RUN_STATE.CLOSED) return false;
  return true;
}

/** Shape check for the whole ledger document. */
function isPlausibleLedger(doc) {
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return false;
  if (doc.schemaVersion !== SCHEMA_VERSION) return false;
  if (!doc.runs || typeof doc.runs !== 'object' || Array.isArray(doc.runs)) return false;
  return true;
}

function emptyLedger() {
  return { schemaVersion: SCHEMA_VERSION, runs: {} };
}

// ---- the disabled object ----------------------------------------------------------------------

/**
 * The DISABLED budget. A different object, not the live one with a flag — the same shape-not-flag
 * posture `pane-status-prototype.js` and preload's `ccDockview` already use. With admission disabled
 * the application must behave EXACTLY as it did before this branch: no pane is controlled, no input is
 * blocked, and the controlled-prompt path refuses without ever reaching a PTY.
 */
function createDisabledBudget(reason) {
  const r = reason || REASON.DISABLED;
  return {
    enabled: false,
    initialize() { return { ok: false, reason: r }; },
    isControlledPane() { return false; },
    isDirectInputBlocked() { return false; },
    claimPane() { return { ok: false, reason: r }; },
    notePaneExit() { return false; },
    async submitPrompt() { return { ok: false, reason: r }; },
    state() { return { enabled: false, reason: r }; },
    boundPaneId() { return null; },
  };
}

// ---- the live budget --------------------------------------------------------------------------

/**
 * deps:
 *   plan     -> the frozen plan from admission-budget-config.parseAdmissionConfig()
 *   storage  -> { load(): {ok,doc}|{ok:false,reason}, save(doc): {ok:true}|{ok:false,reason} }
 *   now()    -> ms epoch (injected clock)
 *   writer(paneId, bytes) -> writes to the PTY. May throw or reject; both are handled.
 *   isPaneRunning(paneId) -> optional; false means the PTY is gone and nothing may be written
 *   log(line) -> optional bounded logger. NEVER called with prompt text.
 */
function createAdmissionBudget(deps) {
  const d = deps || {};
  const plan = d.plan;
  if (!plan || plan.enabled !== true) return createDisabledBudget(plan && plan.reason);

  const storage = d.storage;
  if (!storage || typeof storage.load !== 'function' || typeof storage.save !== 'function') {
    throw new Error('admission-budget: storage with load() and save() is required');
  }
  const writer = d.writer;
  if (typeof writer !== 'function') {
    throw new Error('admission-budget: writer(paneId, bytes) is required');
  }
  const now = typeof d.now === 'function' ? d.now : () => Date.now();
  const log = typeof d.log === 'function' ? d.log : () => {};
  const isPaneRunning = typeof d.isPaneRunning === 'function' ? d.isPaneRunning : () => true;

  // In-memory run record, authoritative for this process once initialize() succeeds.
  let record = null;
  let initialized = false;
  let fatalReason = null; // once set, every operation refuses with it — no self-healing

  // ROLLBACK TRIPWIRE. The highest `admitted` this process has ever observed for this run. A later
  // load reporting fewer admissions means the file moved backwards — a restored copy, an editor, a
  // sync client — and that is exactly how consumed turns would come back. Refuse; never re-adopt.
  let highWaterAdmitted = 0;

  // Single-flight guard. The admission path is async at the writer, so two invokes could otherwise
  // interleave between the in-memory decrement and the persist. Refusing the second is the
  // fail-closed serialization: it can lose a legitimate prompt, never double-spend the last one.
  let inFlight = false;

  function fail(reason) {
    fatalReason = reason;
    log(`[admission] REFUSING all further admission: ${reason}`);
    return { ok: false, reason };
  }

  function remaining() {
    if (!record) return 0;
    return Math.max(0, record.allowance - record.admitted);
  }

  /** Load the ledger and adopt or create THIS run's record. Fail-closed on every anomaly. */
  function initialize() {
    if (fatalReason) return { ok: false, reason: fatalReason };
    if (initialized) return { ok: true, state: state() };

    const loaded = storage.load();
    if (!loaded || loaded.ok !== true) {
      // A missing ledger FILE is the only "absent" case that is allowed to create one, and the store
      // signals it distinctly. Every other read outcome — permission denied, device error, reparse
      // point, oversize — leaves us unable to establish what has already been consumed, so we refuse.
      if (loaded && loaded.reason === 'not-found') {
        record = newRecord();
        const persisted = persist(emptyLedger());
        if (!persisted.ok) return fail(REASON.PERSIST_FAILED);
        initialized = true;
        log(`[admission] run created; allowance ${record.allowance}, admitted 0`);
        return { ok: true, state: state() };
      }
      return fail(REASON.STORAGE_UNREADABLE);
    }

    const doc = loaded.doc;
    if (!isPlausibleLedger(doc)) {
      // Distinguish a version mismatch from generic malformation so the operator knows whether this is
      // a migration question or a corruption question. Both refuse; neither rewrites the file.
      if (doc && typeof doc === 'object' && !Array.isArray(doc) &&
          Object.prototype.hasOwnProperty.call(doc, 'schemaVersion') && doc.schemaVersion !== SCHEMA_VERSION) {
        return fail(REASON.STORAGE_VERSION_MISMATCH);
      }
      return fail(REASON.STORAGE_MALFORMED);
    }

    const runIds = Object.keys(doc.runs);
    if (runIds.length > MAX_PERSISTED_RUNS) return fail(REASON.STORAGE_TOO_MANY_RUNS);

    const existing = Object.prototype.hasOwnProperty.call(doc.runs, plan.runId) ? doc.runs[plan.runId] : null;

    if (existing === null) {
      // The ledger exists but has never heard of this run: a genuinely new run. Creating it here is
      // the ONLY path that mints an allowance, and it cannot fire for a run the ledger already knows.
      if (runIds.length >= MAX_PERSISTED_RUNS) return fail(REASON.STORAGE_TOO_MANY_RUNS);
      record = newRecord();
      const persisted = persist(doc);
      if (!persisted.ok) return fail(REASON.PERSIST_FAILED);
      initialized = true;
      log(`[admission] run created; allowance ${record.allowance}, admitted 0`);
      return { ok: true, state: state() };
    }

    if (!isPlausibleRecord(existing)) return fail(REASON.STORAGE_MALFORMED);
    if (existing.runId !== plan.runId) return fail(REASON.STORAGE_MALFORMED);
    // The configured allowance must match what was recorded when the run was created. Raising
    // BLUE_HELM_ADMISSION_ALLOWANCE and restarting must NOT top the run up — that would be the exact
    // "restart restores turns" hole, reached through configuration instead of through the file.
    if (existing.allowance !== plan.allowance) return fail(REASON.STORAGE_PLAN_MISMATCH);
    if (existing.admitted > existing.allowance) return fail(REASON.STORAGE_CORRUPT_COUNTS);
    if (existing.admitted < highWaterAdmitted) return fail(REASON.STORAGE_ROLLED_BACK);

    record = {
      runId: existing.runId,
      paneId: existing.paneId,
      allowance: existing.allowance,
      admitted: existing.admitted,
      refused: existing.refused,
      state: existing.state,
      createdUtc: typeof existing.createdUtc === 'number' ? existing.createdUtc : now(),
      updatedUtc: typeof existing.updatedUtc === 'number' ? existing.updatedUtc : now(),
      // A binding minted in a previous process cannot be trusted: renderer pane ids are per-session,
      // so `pty3` after a restart is a DIFFERENT pane than the `pty3` that was bound. Mark it stale.
      // Only an explicit main-owned REBIND may re-bind, and re-binding never changes `admitted`.
      bindingStale: existing.paneId !== null,
    };
    highWaterAdmitted = Math.max(highWaterAdmitted, record.admitted);
    initialized = true;
    log(`[admission] run resumed; allowance ${record.allowance}, admitted ${record.admitted}, remaining ${remaining()}`);
    return { ok: true, state: state() };
  }

  function newRecord() {
    const t = now();
    return {
      runId: plan.runId,
      paneId: plan.paneId, // usually null; a configured pin binds immediately
      allowance: plan.allowance,
      admitted: 0,
      refused: 0,
      state: RUN_STATE.OPEN,
      createdUtc: t,
      updatedUtc: t,
      bindingStale: false,
    };
  }

  /** Write the current record into the supplied ledger document and save it atomically. */
  function persist(baseDoc) {
    const doc = isPlausibleLedger(baseDoc) ? { schemaVersion: SCHEMA_VERSION, runs: { ...baseDoc.runs } } : emptyLedger();
    record.updatedUtc = now();
    doc.runs[record.runId] = {
      runId: record.runId,
      paneId: record.paneId,
      allowance: record.allowance,
      admitted: record.admitted,
      refused: record.refused,
      state: record.state,
      createdUtc: record.createdUtc,
      updatedUtc: record.updatedUtc,
    };
    let saved;
    try {
      saved = storage.save(doc);
    } catch {
      return { ok: false, reason: REASON.PERSIST_FAILED };
    }
    if (!saved || saved.ok !== true) return { ok: false, reason: REASON.PERSIST_FAILED };
    return { ok: true };
  }

  /** Re-read the ledger so a concurrent writer's other-run records survive our save. */
  function currentDoc() {
    const loaded = storage.load();
    if (loaded && loaded.ok === true && isPlausibleLedger(loaded.doc)) return loaded.doc;
    return emptyLedger();
  }

  /**
   * Bind this run to a pane. Called from `pty-start` for the first eligible pane, or immediately at
   * initialize() when the plan pinned a pane id.
   *
   * A run binds ONCE. A second pane is refused rather than re-pointed, which is what makes "a budget
   * cannot move between panes" a property of the data rather than a rule someone must remember.
   */
  function claimPane(paneId) {
    if (fatalReason) return { ok: false, reason: fatalReason };
    if (!initialized) return { ok: false, reason: REASON.NOT_INITIALIZED };
    if (typeof paneId !== 'string' || !config.PANE_ID_PATTERN.test(paneId)) {
      return { ok: false, reason: REASON.BAD_PANE_ID };
    }
    if (record.state === RUN_STATE.CLOSED) return { ok: false, reason: REASON.RUN_CLOSED };

    if (record.paneId !== null && !record.bindingStale) {
      if (record.paneId === paneId) return { ok: true, alreadyBound: true, state: state() };
      log('[admission] REFUSED pane claim: this run is already bound to another pane');
      return { ok: false, reason: REASON.PANE_ALREADY_BOUND };
    }

    if (record.bindingStale && !plan.rebind) {
      // Restart with a live remainder but no explicit re-bind authorization. Refuse pending human
      // disposition rather than guessing which pane inherits the money.
      log('[admission] REFUSED pane claim: binding from a previous session is stale and rebind is not authorized');
      return { ok: false, reason: REASON.PANE_BINDING_STALE };
    }

    const previouslyStale = record.bindingStale;
    record.paneId = paneId;
    record.bindingStale = false;
    const persisted = persist(currentDoc());
    if (!persisted.ok) {
      // Roll the in-memory binding back so a failed persist cannot leave main believing a pane is
      // controlled while the durable record disagrees.
      record.paneId = previouslyStale ? record.paneId : null;
      record.bindingStale = previouslyStale;
      return fail(REASON.PERSIST_FAILED);
    }
    log(`[admission] pane bound; remaining ${remaining()}`);
    return { ok: true, alreadyBound: false, state: state() };
  }

  /** True only for the one bound pane of a live, initialized run. */
  function isControlledPane(paneId) {
    if (fatalReason || !initialized || !record) return false;
    if (typeof paneId !== 'string') return false;
    if (record.bindingStale) return false;
    return record.paneId === paneId;
  }

  /**
   * Direct terminal input is blocked for the controlled pane for the WHOLE life of the run, including
   * after the allowance is exhausted and after the run is closed. Unblocking an exhausted run would
   * hand the keyboard back at exactly the moment the budget stopped counting.
   */
  function isDirectInputBlocked(paneId) {
    return isControlledPane(paneId);
  }

  /**
   * The pane's PTY exited. Close the run: the remainder is VOID and is never transferred. Consumed
   * admissions stay consumed.
   */
  function notePaneExit(paneId) {
    if (fatalReason || !initialized || !record) return false;
    if (typeof paneId !== 'string' || record.paneId !== paneId) return false;
    if (record.state === RUN_STATE.CLOSED) return false;
    record.state = RUN_STATE.CLOSED;
    const persisted = persist(currentDoc());
    if (!persisted.ok) { fail(REASON.PERSIST_FAILED); return false; }
    log(`[admission] pane exited; run closed with ${remaining()} unused admission(s) voided`);
    return true;
  }

  /** Count a refusal durably. Best-effort: a refusal that cannot be persisted still refuses. */
  function countRefusal() {
    if (!record) return;
    record.refused += 1;
    persist(currentDoc());
  }

  /**
   * THE admission path. Async because the writer may be.
   *
   * Order, enforced here and asserted by the tests:
   *   1. every precondition
   *   2. in-memory decrement
   *   3. DURABLE persist
   *   4. writer
   *
   * Step 4 never runs if step 3 failed, and a failure inside step 4 is never refunded.
   */
  async function submitPrompt(paneId, promptText) {
    if (fatalReason) return { ok: false, reason: fatalReason };
    if (!initialized) return { ok: false, reason: REASON.NOT_INITIALIZED };

    if (inFlight) { countRefusal(); return { ok: false, reason: REASON.IN_FLIGHT }; }
    inFlight = true;
    try {
      if (typeof paneId !== 'string' || !config.PANE_ID_PATTERN.test(paneId)) {
        countRefusal();
        return { ok: false, reason: REASON.BAD_PANE_ID };
      }
      if (record.paneId === null) { countRefusal(); return { ok: false, reason: REASON.NO_PANE_BOUND }; }
      if (record.bindingStale) { countRefusal(); return { ok: false, reason: REASON.PANE_BINDING_STALE }; }
      if (record.paneId !== paneId) { countRefusal(); return { ok: false, reason: REASON.PANE_MISMATCH }; }
      if (record.state === RUN_STATE.CLOSED) { countRefusal(); return { ok: false, reason: REASON.RUN_CLOSED }; }

      const promptCheck = validatePrompt(promptText);
      if (!promptCheck.ok) { countRefusal(); return { ok: false, reason: promptCheck.reason }; }

      // The pane must still exist. Writing to a dead PTY would consume an admission for a prompt no
      // provider will ever see, so the check comes BEFORE the decrement.
      if (!isPaneRunning(paneId)) { countRefusal(); return { ok: false, reason: REASON.PANE_NOT_RUNNING }; }

      if (remaining() <= 0) {
        record.state = RUN_STATE.EXHAUSTED;
        countRefusal();
        log(`[admission] REFUSED: allowance of ${record.allowance} is fully consumed; nothing was written to the PTY`);
        return { ok: false, reason: REASON.EXHAUSTED, remaining: 0, admitted: record.admitted, allowance: record.allowance };
      }

      // ---- (2) in-memory decrement ------------------------------------------------------------
      record.admitted += 1;
      if (record.admitted >= record.allowance) record.state = RUN_STATE.EXHAUSTED;

      // ---- (3) durable persist BEFORE any byte reaches the PTY --------------------------------
      const persisted = persist(currentDoc());
      if (!persisted.ok) {
        // Undo the in-memory decrement: nothing was written, so nothing was consumed. This is the one
        // rollback in the module and it is safe precisely because the writer has not run.
        record.admitted -= 1;
        record.state = record.admitted >= record.allowance ? RUN_STATE.EXHAUSTED : RUN_STATE.OPEN;
        log('[admission] REFUSED: the ledger could not be persisted; nothing was written to the PTY');
        return fail(REASON.PERSIST_FAILED);
      }
      highWaterAdmitted = Math.max(highWaterAdmitted, record.admitted);
      const admittedIndex = record.admitted;

      // ---- (4) writer -------------------------------------------------------------------------
      try {
        await writer(paneId, promptText + SUBMISSION_TERMINATOR);
      } catch {
        // NOT refunded, by design. The admission is durably spent and we cannot know how much of the
        // prompt reached the PTY. Report it as its own bounded reason so the operator sees a consumed
        // turn with a failed delivery rather than a silent success.
        log(`[admission] admission ${admittedIndex}/${record.allowance} CONSUMED but the PTY write failed; not refunded`);
        return {
          ok: false,
          reason: REASON.WRITE_FAILED_AFTER_ADMISSION,
          admitted: record.admitted,
          remaining: remaining(),
          allowance: record.allowance,
        };
      }

      log(`[admission] admitted ${admittedIndex}/${record.allowance}; remaining ${remaining()}`);
      return {
        ok: true,
        admitted: record.admitted,
        remaining: remaining(),
        allowance: record.allowance,
        chars: promptCheck.chars,
      };
    } finally {
      inFlight = false;
    }
  }

  /**
   * The bounded, non-secret view. Safe to send to the renderer and safe to log: no prompt, no run id,
   * no path. The renderer is TOLD the numbers and can never set them — there is no setter here and no
   * IPC that reaches one.
   */
  function state() {
    if (fatalReason) return { enabled: true, ok: false, reason: fatalReason };
    if (!initialized || !record) return { enabled: true, ok: false, reason: REASON.NOT_INITIALIZED };
    return {
      enabled: true,
      ok: true,
      allowance: record.allowance,
      admitted: record.admitted,
      remaining: remaining(),
      refused: record.refused,
      runState: record.state,
      paneBound: record.paneId !== null && !record.bindingStale,
      bindingStale: record.bindingStale === true,
      // The bound pane id, so a controlled-run UI can NAME the pane it is about to spend a turn on
      // rather than just claim one exists. Safe to expose: this id was MINTED BY THE RENDERER at
      // `pty-start` (`pty1`, `pty2`, `library`), so it is telling the renderer something it already
      // knows, and it is bounded by PANE_ID_PATTERN in admission-budget-config.js. It is deliberately
      // NULL whenever the binding is stale — after a restart the persisted id names a pane from the
      // previous process that no longer exists, and showing it would invite Blue to spend a turn on a
      // pane that is not there. `paneBound` and this field therefore always agree.
      paneId: record.paneId !== null && !record.bindingStale ? record.paneId : null,
    };
  }

  return {
    enabled: true,
    initialize,
    claimPane,
    isControlledPane,
    isDirectInputBlocked,
    notePaneExit,
    submitPrompt,
    state,
    boundPaneId: () => (record && !record.bindingStale ? record.paneId : null),
  };
}

const api = {
  SCHEMA_VERSION,
  SUBMISSION_TERMINATOR,
  MAX_PROMPT_CHARS,
  MAX_PERSISTED_RUNS,
  RUN_STATE,
  REASON,
  validatePrompt,
  isPlausibleRecord,
  isPlausibleLedger,
  emptyLedger,
  createDisabledBudget,
  createAdmissionBudget,
};
if (typeof module === 'object' && module.exports) module.exports = api;
