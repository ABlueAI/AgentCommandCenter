'use strict';
// MAIN-OWNED CONTROLLED-PANE LAUNCH POLICY.
//
// This pure coordinator decides whether a launch may proceed before main calls pty.spawn. It keeps
// provider eligibility, configuration intent, ledger health, launch-time prompts, and durable pane
// claiming in one reviewable order. It never sees or logs prompt content.

const config = require('./admission-budget-config');
const { REASON } = require('./admission-budget');
const { isEligibleClaudePane, hasNonemptyInitialPrompt } = require('./admission-pty-boundary');

const LAUNCH_REASON = Object.freeze({
  INITIAL_PROMPT_BLOCKED: 'admission-launch-prompt-blocked',
});

function prepareAdmissionPaneLaunch({ plan, budget, opts, validRoles }) {
  const eligible = isEligibleClaudePane(opts, validRoles);
  if (!eligible) return { ok: true, eligible: false, controlled: false };

  if (!plan || plan.requested !== true) return { ok: true, eligible: true, controlled: false };
  if (plan.configStatus === config.CONFIG_STATUS.INVALID) {
    return { ok: false, eligible: true, controlled: false, reason: plan.reason };
  }
  if (!plan.enabled || !budget || budget.enabled !== true) {
    return { ok: false, eligible: true, controlled: false, reason: (plan && plan.reason) || REASON.NOT_INITIALIZED };
  }

  const current = budget.state();
  if (!current || current.ok !== true) {
    return { ok: false, eligible: true, controlled: false, reason: (current && current.reason) || REASON.NOT_INITIALIZED };
  }

  const paneId = opts && opts.id;
  const boundPaneId = budget.boundPaneId();
  const intendedControlledPane = boundPaneId === null || boundPaneId === paneId;
  if (intendedControlledPane && hasNonemptyInitialPrompt(opts)) {
    return { ok: false, eligible: true, controlled: false, reason: LAUNCH_REASON.INITIAL_PROMPT_BLOCKED };
  }

  const claim = budget.claimPane(paneId);
  if (!claim || claim.ok !== true) {
    if (claim && claim.reason === REASON.PANE_ALREADY_BOUND) {
      return { ok: true, eligible: true, controlled: false, nonTarget: true };
    }
    return { ok: false, eligible: true, controlled: false, reason: (claim && claim.reason) || REASON.NOT_INITIALIZED };
  }
  return { ok: true, eligible: true, controlled: budget.isControlledPane(paneId) === true };
}

function closeAfterFailedSpawn(budget, paneId, prepared) {
  if (!prepared || prepared.controlled !== true) return false;
  return budget.notePaneExit(paneId);
}

module.exports = { LAUNCH_REASON, prepareAdmissionPaneLaunch, closeAfterFailedSpawn };
