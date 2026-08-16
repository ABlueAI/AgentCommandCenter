'use strict';
// MAIN-OWNED TURN ADMISSION BUDGET — the startup configuration boundary.
//
// Procurement record: docs/OSS-PROCUREMENT-pane-status.md
// Blue's verdict, verbatim: BLUE SUBSYSTEM VERDICT: BUILD FRESH
// Blue's authorization for THIS branch, verbatim:
//   I SELECT TURN-ACCOUNTING OUTCOME B. THE FOURTH TURN REMAINS UNEXPLAINED. NO LIVE PANE-STATUS
//   PROVIDER SESSION IS AUTHORIZED UNTIL THE MAIN-OWNED ADMISSION BUDGET IS REVIEWED AND LANDED.
//
// WHY THIS FILE EXISTS SEPARATELY. The allowance is a cost control. If the renderer, the provider
// process, or anything downstream of them could name the run or pick the number, the control would be
// decorative. So the whole configuration decision is made ONCE, here, from this process's own startup
// environment, before any window exists and before any PTY is spawned — and the same module exports
// the exact key list main must strip from every child PTY environment, so the values that decided the
// budget cannot be read or rewritten by the thing being budgeted.
//
// FAIL-CLOSED BY CONSTRUCTION: every parse failure, every missing field, every out-of-range number,
// and every unrecognized shape yields the DISABLED plan with allowance 0. There is no branch in this
// file that returns an enabled plan from partial input.
//
// PURE. No fs, no Electron, no process. `parseAdmissionConfig(env)` takes the environment as an
// argument so the whole matrix is unit-testable in plain node.

// ---- bounds ---------------------------------------------------------------------------------

// Conservative ceiling. This is a *test admission* budget for a controlled evidence run, not a
// production quota: a two-digit cap keeps a typo (`30` for `3`) inside a survivable blast radius and
// makes `300` refuse outright rather than authorize 300 paid prompts.
const MAX_ALLOWANCE = 10;

// Opaque, bounded run identity. Lowercase alphanumeric plus internal hyphens, 8..64 chars. It is an
// identity, never a path component and never interpolated into a command — the store derives its own
// filename from a constant (see admission-budget-store.js).
const RUN_ID_PATTERN = /^[a-z0-9](?:[a-z0-9-]{6,62})[a-z0-9]$/;

// The same pane-id shape the Dockview layout policy already enforces, so a pane id that could never
// exist cannot be configured. Kept as a local literal rather than an import: this module must stay
// dependency-free so main can parse the plan before anything else loads.
const PANE_ID_PATTERN = /^(library|pty[0-9]{1,6})$/;

// Positive integers only, in integer lexical form. `01`, `3.0`, `+3`, `3e0`, ` 3 ` and `-3` all fail:
// a cost control must not accept a number whose meaning depends on the parser.
const ALLOWANCE_PATTERN = /^[1-9][0-9]?$/;

// ---- environment keys -----------------------------------------------------------------------

const ENV_ENABLED = 'BLUE_HELM_ADMISSION_ENABLED';
const ENV_RUN_ID = 'BLUE_HELM_ADMISSION_RUN_ID';
const ENV_ALLOWANCE = 'BLUE_HELM_ADMISSION_ALLOWANCE';
const ENV_PANE_ID = 'BLUE_HELM_ADMISSION_PANE_ID';
const ENV_REBIND = 'BLUE_HELM_ADMISSION_REBIND';

// EVERY admission-control key, including the ones this build does not read yet. main strips this
// whole list from each child PTY environment (see stripAdmissionEnv). Listing a key here is what makes
// it unreadable by the PTY; forgetting one is the leak, so the list is exported and asserted by
// admission-budget-config.test.js against the module's own constants.
const ADMISSION_ENV_KEYS = Object.freeze([
  ENV_ENABLED,
  ENV_RUN_ID,
  ENV_ALLOWANCE,
  ENV_PANE_ID,
  ENV_REBIND,
]);

// Bounded refusal reasons. Constants only — a reason is never built from an environment value, so a
// refusal line can never echo what was configured.
const CONFIG_REASON = Object.freeze({
  DISABLED: 'admission-disabled',
  BAD_ENABLED: 'admission-bad-enabled-flag',
  BAD_RUN_ID: 'admission-bad-run-id',
  BAD_ALLOWANCE: 'admission-bad-allowance',
  BAD_PANE_ID: 'admission-bad-pane-id',
  BAD_REBIND: 'admission-bad-rebind-flag',
});

const SCHEMA_VERSION = 1;

/** The one disabled plan. Frozen, so a caller cannot flip `enabled` on the object it was handed. */
function disabledPlan(reason) {
  return Object.freeze({
    schemaVersion: SCHEMA_VERSION,
    enabled: false,
    allowance: 0,
    runId: null,
    paneId: null,
    rebind: false,
    reason: reason || CONFIG_REASON.DISABLED,
  });
}

/**
 * Parse the admission plan from a startup environment. Called ONCE by main, before the window exists.
 *
 * `paneId` is OPTIONAL and is normally absent: renderer pane ids (`pty1`, `pty2`, …) are minted at
 * runtime, so Blue cannot know one at startup. When absent, the run claims its pane at first eligible
 * `pty-start` and that binding is then persisted immutably (see admission-budget.js). When present, it
 * pins the run to exactly that pane and nothing else can claim it.
 *
 * Returns a frozen plan. `enabled: true` requires the flag to be exactly '1' AND a well-formed run id
 * AND a well-formed allowance. Anything else is disabled with a bounded reason.
 */
function parseAdmissionConfig(env) {
  const e = env && typeof env === 'object' ? env : {};

  const rawEnabled = e[ENV_ENABLED];
  // Absent means "not configured", which is the ordinary case and not an error worth a distinct
  // reason. Present-but-not-'1' IS worth one: it means someone tried and got the syntax wrong, and a
  // silent disable there would look identical to a working budget.
  if (rawEnabled === undefined || rawEnabled === null || rawEnabled === '') return disabledPlan(CONFIG_REASON.DISABLED);
  if (rawEnabled !== '1') return disabledPlan(CONFIG_REASON.BAD_ENABLED);

  const rawRunId = e[ENV_RUN_ID];
  if (typeof rawRunId !== 'string' || !RUN_ID_PATTERN.test(rawRunId)) return disabledPlan(CONFIG_REASON.BAD_RUN_ID);

  const rawAllowance = e[ENV_ALLOWANCE];
  if (typeof rawAllowance !== 'string' || !ALLOWANCE_PATTERN.test(rawAllowance)) {
    return disabledPlan(CONFIG_REASON.BAD_ALLOWANCE);
  }
  const allowance = Number(rawAllowance);
  if (!Number.isSafeInteger(allowance) || allowance < 1 || allowance > MAX_ALLOWANCE) {
    return disabledPlan(CONFIG_REASON.BAD_ALLOWANCE);
  }

  // Optional pin. Present-but-malformed refuses rather than falling back to "claim any pane" — a
  // typo'd pin must not silently widen the binding.
  const rawPaneId = e[ENV_PANE_ID];
  let paneId = null;
  if (rawPaneId !== undefined && rawPaneId !== null && rawPaneId !== '') {
    if (typeof rawPaneId !== 'string' || !PANE_ID_PATTERN.test(rawPaneId)) return disabledPlan(CONFIG_REASON.BAD_PANE_ID);
    paneId = rawPaneId;
  }

  // Optional. After a restart the persisted pane binding is stale (renderer ids do not survive), so
  // the run refuses by default. `REBIND=1` lets main re-bind the SAME run to a new pane while keeping
  // its consumed count — it can never restore a consumed admission, only make the remainder reachable.
  const rawRebind = e[ENV_REBIND];
  let rebind = false;
  if (rawRebind !== undefined && rawRebind !== null && rawRebind !== '') {
    if (rawRebind !== '1') return disabledPlan(CONFIG_REASON.BAD_REBIND);
    rebind = true;
  }

  return Object.freeze({
    schemaVersion: SCHEMA_VERSION,
    enabled: true,
    allowance,
    runId: rawRunId,
    paneId,
    rebind,
    reason: null,
  });
}

/**
 * Return a COPY of `env` with every admission-control key removed. main builds each PTY environment
 * through this, so the provider process cannot read the run id, cannot read the allowance, and cannot
 * set them for anything it spawns itself.
 *
 * A copy, not a mutation: `process.env` is this process's own configuration and must survive intact.
 */
function stripAdmissionEnv(env) {
  const out = { ...(env && typeof env === 'object' ? env : {}) };
  for (const key of ADMISSION_ENV_KEYS) delete out[key];
  return out;
}

/** True when `env` still carries any admission key. Used by the tests and by main's own self-check. */
function hasAdmissionEnv(env) {
  if (!env || typeof env !== 'object') return false;
  return ADMISSION_ENV_KEYS.some((k) => Object.prototype.hasOwnProperty.call(env, k));
}

const api = {
  SCHEMA_VERSION,
  MAX_ALLOWANCE,
  RUN_ID_PATTERN,
  PANE_ID_PATTERN,
  ALLOWANCE_PATTERN,
  ENV_ENABLED,
  ENV_RUN_ID,
  ENV_ALLOWANCE,
  ENV_PANE_ID,
  ENV_REBIND,
  ADMISSION_ENV_KEYS,
  CONFIG_REASON,
  parseAdmissionConfig,
  stripAdmissionEnv,
  hasAdmissionEnv,
  disabledPlan,
};
if (typeof module === 'object' && module.exports) module.exports = api;
