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
// ============================================================================================
// THREAT BOUNDARY — WHAT THIS CONTROL IS, AND WHAT IT IS NOT
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
// Earlier revisions of this file, of main.js, of these tests and of the handoff claimed or implied
// that the provider process could not reach the ledger. THAT WAS FALSE, and the specific errors are
// worth naming so they are not reintroduced:
//   * Stripping the admission environment keys prevents those keys from being INHERITED by the PTY.
//     It does not make their values unknowable: the same-user pane can read them from the ledger and
//     choose environment values for descendants. It does NOT hide Electron `userData` or isolate files.
//     `APPDATA` / `USERPROFILE` are present in every PTY, the ledger filename is a literal in
//     readable repository source, and filesystem enumeration finds the file regardless.
//   * `CLAUDE_CODE_SUBPROCESS_ENV_SCRUB` is about credentials in Claude Code's own subprocesses. It
//     is NOT evidence that a same-user Claude process cannot reach this ledger.
//   * A PTY child runs as the same Windows user as main and has the same file access main has.
//
// WHAT IS ACTUALLY TRUE — the narrower claim, which is the one this file can support:
//
//   NO SUPPORTED PANE-STATUS MODULE API MUTATES ADMISSION STATE. There is no method in this file
//   that increments, refunds, resets, extends, or certifies an allowance. Provider output, hook
//   events, badge state and PTY bytes reach no function here, and nothing under
//   `app/pane-status/` imports an admission module. That is a code-level structural
//   property: the mutation does not exist to call.
//
//   It is NOT a claim of OS-level inaccessibility. The absence of an import proves only that no
//   supported code path connects those modules to the ledger.
//
// WHAT SURVIVES AS A REAL PROTECTION, all of it against accident and against the supported input
// paths rather than against a hostile local process:
//   * a durable decrement before any byte reaches the PTY;
//   * no refund after a post-persist writer failure;
//   * refusal on a plan mismatch, so raising the configured allowance and restarting cannot top a
//     run up;
//   * refusal on a malformed, unreadable, version-mismatched or checksum-mismatched ledger;
//   * refusal of direct input to the controlled pane, and unchanged behaviour for every other pane.
//
// WHAT WAS REMOVED. The `STORAGE_ROLLED_BACK` reason and its `highWaterAdmitted` comparison are
// gone. They advertised a cross-restart rollback guarantee the code never delivered (the mark was
// per-instance and started at 0, and `initialize()` short-circuits once loaded, so the comparison
// was unreachable for the case its name implied). Nothing replaces it and no new prevention claim
// replaces it. An earlier valid ledger can be replayed; that is accepted, not defended against.
// ============================================================================================

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

// Process-local pane designation is deliberately separate from ledger health and durable run state.
// A fatal ledger error may stop admission, but it must never turn a pending/bound protected pane into
// an ordinary pane. Only process exit/failed spawn moves the designation to EXITED.
const DESIGNATION_STATE = Object.freeze({
  UNBOUND: 'unbound',
  PENDING: 'pending',
  BOUND: 'bound',
  EXITED: 'exited',
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
  // REMOVED: STORAGE_ROLLED_BACK ('admission-ledger-rolled-back').
  //
  // It advertised a cross-restart rollback guarantee that the implementation never delivered. Its
  // comparison was against a PER-INSTANCE high-water mark that started at 0 every time, and
  // `initialize()` short-circuits once a record is loaded, so no instance ever reached the comparison
  // holding a non-zero mark. The reason code was unreachable for the case its name implied, and a
  // dead guarantee is worse than an absent one: it invites reliance. Blue accepted the ledger as an
  // accidental-spend control rather than a security boundary and directed its removal. Nothing
  // replaces it, and no prevention claim replaces it either — see the header.
  STORAGE_INTEGRITY_MISMATCH: 'admission-ledger-integrity-mismatch',
  STORAGE_CONFLICT: 'admission-ledger-conflict',
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
const REVISION_PATTERN = /^[0-9a-f]{64}$/;

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
    designationState() { return DESIGNATION_STATE.UNBOUND; },
  };
}

// ---- the live budget --------------------------------------------------------------------------

/**
 * deps:
 *   plan     -> the frozen plan from admission-budget-config.parseAdmissionConfig()
 *   storage  -> { load(): {ok,doc,revision}|{ok:false,reason},
 *                 save(doc,expectedRevision): {ok:true,revision}|{ok:false,reason} }
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
  // Exact checksum revision last observed from storage. `null` means and only means a load returned
  // genuine `not-found`. It is a cooperating-writer CAS token, not authentication or rollback
  // prevention; a same-user process can still replace the ledger and recompute its checksum.
  let ledgerRevision = null;
  let initialized = false;
  let fatalReason = null; // once set, every operation refuses with it — no self-healing
  // A configured pin is protected even if initialization later fails. For unpinned runs this becomes
  // PENDING immediately before the first eligible pane claim is persisted. It is never derived from
  // `fatalReason`: ledger health can only preserve/tighten protection, never erase designation.
  let protectedPaneId = plan.paneId || null;
  let designation = protectedPaneId ? DESIGNATION_STATE.PENDING : DESIGNATION_STATE.UNBOUND;

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

  function markInitializedDesignation() {
    if (record && record.paneId !== null && record.bindingStale !== true) {
      protectedPaneId = record.paneId;
      designation = DESIGNATION_STATE.BOUND;
    }
  }

  function storageFailureReason(reason) {
    if (reason === 'integrity-mismatch') return REASON.STORAGE_INTEGRITY_MISMATCH;
    if (reason === 'conflict' || reason === 'revision-required') return REASON.STORAGE_CONFLICT;
    if (reason === 'not-found' && ledgerRevision !== null) return REASON.STORAGE_CONFLICT;
    return REASON.STORAGE_UNREADABLE;
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
        ledgerRevision = null;
        record = newRecord();
        const persisted = persist();
        if (!persisted.ok) return fail(persisted.reason);
        initialized = true;
        markInitializedDesignation();
        log(`[admission] run created; allowance ${record.allowance}, admitted 0`);
        return { ok: true, state: state() };
      }
      // An integrity mismatch is named distinctly so the operator learns WHICH kind of unreadable
      // this is: the bytes parsed, but the ledger's content does not match its own checksum. It is
      // still fail-closed and it still never rewrites or repairs the file — a mismatching ledger is
      // left exactly as found for diagnosis, and cannot self-heal into a fresh allowance.
      if (loaded && loaded.reason === 'integrity-mismatch') return fail(REASON.STORAGE_INTEGRITY_MISMATCH);
      return fail(REASON.STORAGE_UNREADABLE);
    }

    const doc = loaded.doc;
    if (typeof loaded.revision !== 'string' || !REVISION_PATTERN.test(loaded.revision)) {
      return fail(REASON.STORAGE_UNREADABLE);
    }
    ledgerRevision = loaded.revision;
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
      const persisted = persist();
      if (!persisted.ok) return fail(persisted.reason);
      initialized = true;
      markInitializedDesignation();
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
    // NOTE: there is deliberately NO check here that the count has not moved backwards since a
    // previous process saw it. See the header — a ledger replaced or rewritten by another process
    // running as this user is outside the accepted boundary, and the removed high-water comparison
    // only ever appeared to cover it.

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
    initialized = true;
    markInitializedDesignation();
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

  /**
   * Re-read, validate, compare the revision, then save with the same expected revision. The store
   * repeats the comparison while holding its cross-process lock. No rejected read reaches save(),
   * so a corrupt or transiently unreadable ledger remains byte-identical for diagnosis.
   */
  function persist() {
    let loaded;
    try {
      loaded = storage.load();
    } catch {
      return { ok: false, reason: REASON.STORAGE_UNREADABLE };
    }

    let baseDoc;
    if (ledgerRevision === null) {
      if (!loaded || loaded.ok === true || loaded.reason !== 'not-found') {
        return { ok: false, reason: loaded && loaded.ok === false
          ? storageFailureReason(loaded.reason)
          : REASON.STORAGE_CONFLICT };
      }
      baseDoc = emptyLedger();
    } else {
      if (!loaded || loaded.ok !== true) {
        return { ok: false, reason: storageFailureReason(loaded && loaded.reason) };
      }
      if (!isPlausibleLedger(loaded.doc)) {
        return { ok: false, reason: REASON.STORAGE_MALFORMED };
      }
      if (loaded.revision !== ledgerRevision) {
        return { ok: false, reason: REASON.STORAGE_CONFLICT };
      }
      baseDoc = loaded.doc;
    }

    const doc = { schemaVersion: SCHEMA_VERSION, runs: { ...baseDoc.runs } };
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
      saved = storage.save(doc, ledgerRevision);
    } catch {
      return { ok: false, reason: REASON.PERSIST_FAILED };
    }
    if (!saved || saved.ok !== true) {
      if (saved && (saved.reason === 'conflict' || saved.reason === 'revision-required')) {
        return { ok: false, reason: REASON.STORAGE_CONFLICT };
      }
      if (saved && saved.reason === 'integrity-mismatch') {
        return { ok: false, reason: REASON.STORAGE_INTEGRITY_MISMATCH };
      }
      if (saved && saved.reason && saved.reason !== 'write-failed' &&
          saved.reason !== 'not-serializable') {
        return { ok: false, reason: storageFailureReason(saved.reason) };
      }
      return { ok: false, reason: REASON.PERSIST_FAILED };
    }
    if (typeof saved.revision !== 'string' || !REVISION_PATTERN.test(saved.revision)) {
      return { ok: false, reason: REASON.PERSIST_FAILED };
    }
    ledgerRevision = saved.revision;
    return { ok: true };
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
      if (record.paneId === paneId) {
        protectedPaneId = paneId;
        designation = DESIGNATION_STATE.BOUND;
        return { ok: true, alreadyBound: true, state: state() };
      }
      log('[admission] REFUSED pane claim: this run is already bound to another pane');
      return { ok: false, reason: REASON.PANE_ALREADY_BOUND };
    }

    if (record.bindingStale && !plan.rebind) {
      // Restart with a live remainder but no explicit re-bind authorization. Refuse pending human
      // disposition rather than guessing which pane inherits the money.
      log('[admission] REFUSED pane claim: binding from a previous session is stale and rebind is not authorized');
      return { ok: false, reason: REASON.PANE_BINDING_STALE };
    }

    const previousPaneId = record.paneId;
    const previouslyStale = record.bindingStale;
    protectedPaneId = paneId;
    designation = DESIGNATION_STATE.PENDING;
    record.paneId = paneId;
    record.bindingStale = false;
    const persisted = persist();
    if (!persisted.ok) {
      // Restore the record to the last durable shape, but deliberately KEEP the process-local pending
      // designation. A failed claim cannot make this selected pane ordinary and expose generic input.
      record.paneId = previousPaneId;
      record.bindingStale = previouslyStale;
      return fail(persisted.reason);
    }
    designation = DESIGNATION_STATE.BOUND;
    log(`[admission] pane bound; remaining ${remaining()}`);
    return { ok: true, alreadyBound: false, state: state() };
  }

  /** True for this process's pending/bound protected pane, independently of ledger health. */
  function isControlledPane(paneId) {
    if (typeof paneId !== 'string') return false;
    return protectedPaneId === paneId &&
      (designation === DESIGNATION_STATE.PENDING || designation === DESIGNATION_STATE.BOUND);
  }

  /**
   * Direct terminal input is blocked for the pending/bound pane for the WHOLE process lifetime,
   * including after exhaustion, closure, or fatal ledger failure. Only confirmed process exit releases
   * the process-local designation; unblocking an exhausted live pane would hand the keyboard back at
   * exactly the moment the budget stopped counting.
   */
  function isDirectInputBlocked(paneId) {
    return isControlledPane(paneId);
  }

  /**
   * The pane's PTY exited. Close the run: the remainder is VOID and is never transferred. Consumed
   * admissions stay consumed.
   */
  function notePaneExit(paneId) {
    if (typeof paneId !== 'string' || protectedPaneId !== paneId) return false;
    // Release only because main has established that no process exists (exit, kill, or failed spawn).
    // Do this even in a fatal state: there is no handle left to receive input. Fatal health remains.
    designation = DESIGNATION_STATE.EXITED;
    protectedPaneId = null;
    if (fatalReason || !initialized || !record) return true;
    if (record.state === RUN_STATE.CLOSED) return true;
    record.state = RUN_STATE.CLOSED;
    const persisted = persist();
    if (!persisted.ok) { fail(persisted.reason); return false; }
    log(`[admission] pane exited; run closed with ${remaining()} unused admission(s) voided`);
    return true;
  }

  /** Count a refusal durably. Best-effort: a refusal that cannot be persisted still refuses. */
  function countRefusal() {
    if (!record) return;
    record.refused += 1;
    const persisted = persist();
    if (!persisted.ok) fail(persisted.reason);
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
      const persisted = persist();
      if (!persisted.ok) {
        // Undo the in-memory decrement: nothing was written, so nothing was consumed. This is the one
        // rollback in the module and it is safe precisely because the writer has not run.
        record.admitted -= 1;
        record.state = record.admitted >= record.allowance ? RUN_STATE.EXHAUSTED : RUN_STATE.OPEN;
        log('[admission] REFUSED: the ledger could not be persisted; nothing was written to the PTY');
        return fail(persisted.reason);
      }
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
    if (fatalReason) return {
      enabled: true,
      ok: false,
      reason: fatalReason,
      designation,
      paneBound: designation === DESIGNATION_STATE.BOUND,
      paneId: designation === DESIGNATION_STATE.BOUND ? protectedPaneId : null,
    };
    if (!initialized || !record) return {
      enabled: true,
      ok: false,
      reason: REASON.NOT_INITIALIZED,
      designation,
      paneBound: false,
      paneId: null,
    };
    return {
      enabled: true,
      ok: true,
      allowance: record.allowance,
      admitted: record.admitted,
      remaining: remaining(),
      refused: record.refused,
      runState: record.state,
      paneBound: designation === DESIGNATION_STATE.BOUND,
      designation,
      bindingStale: record.bindingStale === true,
      // The bound pane id, so a controlled-run UI can NAME the pane it is about to spend a turn on
      // rather than just claim one exists. Safe to expose: this id was MINTED BY THE RENDERER at
      // `pty-start` (`pty1`, `pty2`, `library`), so it is telling the renderer something it already
      // knows, and it is bounded by PANE_ID_PATTERN in admission-budget-config.js. It is deliberately
      // NULL whenever the binding is stale — after a restart the persisted id names a pane from the
      // previous process that no longer exists, and showing it would invite Blue to spend a turn on a
      // pane that is not there. `paneBound` and this field therefore always agree.
      paneId: designation === DESIGNATION_STATE.BOUND ? protectedPaneId : null,
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
    boundPaneId: () => (designation === DESIGNATION_STATE.BOUND ? protectedPaneId : null),
    designationState: () => designation,
  };
}

const api = {
  SCHEMA_VERSION,
  SUBMISSION_TERMINATOR,
  MAX_PROMPT_CHARS,
  MAX_PERSISTED_RUNS,
  RUN_STATE,
  DESIGNATION_STATE,
  REASON,
  validatePrompt,
  isPlausibleRecord,
  isPlausibleLedger,
  emptyLedger,
  createDisabledBudget,
  createAdmissionBudget,
};
if (typeof module === 'object' && module.exports) module.exports = api;
