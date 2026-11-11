'use strict';
// The one list of GitHub logins that count as Mako's agents. Anything in code that asks "is this
// an agent account?" reads it from here: .github/scripts/merge-audit.js today, and the prompts and
// settings in docs/RUNNER.md, which app/runner-proposal.test.js checks against this list (the
// `agent_logins` line in "Runner settings", and each proposed prompt's wording).
//
//   ABlueAgent        machine user account; runs cloud sessions (Blue, 2026-11-10: it stays for
//                     cloud sessions).
//   mako-agents[bot]  the GitHub App; the primary identity for local panes and the local runner
//                     (Blue, 2026-11-10). The REST API reports an App's actions as `<slug>[bot]`
//                     (`user.login`, `merged_by.login`, a review's `user.login`).
//
// Never a replacement user account (Blue, 2026-11-11). GitHub logins are case-insensitive.
// The human, ABlueAI, is not in this list: he opens no PRs and approves and merges every one
// (the merge-audit workflow's HUMAN_APPROVER).
const AGENT_LOGINS = Object.freeze(['ABlueAgent', 'mako-agents[bot]']);

const sameLogin = (a, b) => typeof a === 'string' && typeof b === 'string' && a.toLowerCase() === b.toLowerCase();
const isAgentLogin = (login) => AGENT_LOGINS.some((a) => sameLogin(a, login));

module.exports = { AGENT_LOGINS, sameLogin, isAgentLogin };
