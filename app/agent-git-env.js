'use strict';
// S06 LOCAL-AGENT GITHUB IDENTITY (pure; no Electron, process, filesystem or logging).
//
// Local agent panes used to push with Blue's own git login (`ABlueAI`, the account that can approve
// and merge). With the `ABlueAgent` token from checklist step 14 set in Mako's key setup, an agent
// pane gets exactly these entries, and nothing else changes:
//   GH_TOKEN                gh's documented env token. gh: "takes precedence over previously stored
//                           credentials", so `gh pr create` runs as ABlueAgent, not the stored login.
//   GIT_CONFIG_COUNT/KEY/VALUE (git's command-scope config, read after every config file):
//     0 credential.helper = ""       an empty value resets the helper list, so Git Credential
//                                    Manager's stored ABlueAI login is never asked;
//     1 credential.https://github.com.helper = "!gh auth git-credential"
//                                    gh's own helper (official, not a hand-written one), which hands
//                                    git the GH_TOKEN token as user x-access-token.
//   GIT_TERMINAL_PROMPT = 0  a failed login fails visibly instead of waiting on a hidden prompt.
//   GIT_AUTHOR_* / GIT_COMMITTER_*   commits are attributed to ABlueAgent (its noreply address).
// Claude Code's subprocess scrub (CLAUDE_CODE_SUBPROCESS_ENV_SCRUB=1) leaves GH_TOKEN and
// GIT_CONFIG_* in place (code.claude.com/docs/en/env-vars, "What the subprocess environment scrub
// removes", read 2026-10-23), so Claude's Bash tool still sees them. Not yet seen on Blue's PC:
// checklist step 35 checks it from a Claude pane's Bash tool, along with `git credential fill`.
// Assumes HTTPS remotes; an SSH remote never asks a credential helper.
//
// Who gets it: unfenced agent panes only (a bare CLI pane, or an unfenced role). Fenced roles,
// Video Scout and plain shell panes never do; a plain shell is Blue's own terminal. For an agent pane
// every name below is reserved, so no ambient spelling can override or add to it.
//
// This is not a security boundary against a pane: a process running as Blue's Windows user can still
// read his stored logins directly. That is why the checklist has Blue remove the ABlueAI git login
// from his PC after S06.

const AGENT_LOGIN = 'ABlueAgent';
const AGENT_NOREPLY_EMAIL = '344505663+ABlueAgent@users.noreply.github.com';
const GH_HELPER = '!gh auth git-credential';

// Classic GitHub token shapes: ghp_ (classic PAT) or github_pat_ (fine-grained). The value is only
// shape-checked so a pasted label or whitespace is refused; it is never logged.
const TOKEN_RE = /^(?:ghp_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{22,255})$/;

const AGENT_GIT_ENV_KEYS = Object.freeze([
  'GH_TOKEN',
  'GITHUB_TOKEN',
  'GH_ENTERPRISE_TOKEN',
  'GITHUB_ENTERPRISE_TOKEN',
  'GH_HOST',
  'GIT_CONFIG_COUNT',
  'GIT_CONFIG_KEY_0',
  'GIT_CONFIG_VALUE_0',
  'GIT_CONFIG_KEY_1',
  'GIT_CONFIG_VALUE_1',
  'GIT_CONFIG_PARAMETERS',
  'GIT_CONFIG_GLOBAL',
  'GIT_CONFIG_SYSTEM',
  'GIT_CONFIG_NOSYSTEM',
  'GIT_ASKPASS',
  'SSH_ASKPASS',
  'GIT_TERMINAL_PROMPT',
  'GIT_AUTHOR_NAME',
  'GIT_AUTHOR_EMAIL',
  'GIT_COMMITTER_NAME',
  'GIT_COMMITTER_EMAIL',
]);

function isAgentToken(value) { return typeof value === 'string' && TOKEN_RE.test(value); }

// The pane classes that act as a local agent. `launch` is classifyPtyLaunch's result.
function isAgentPane(launch) {
  if (!launch || launch.videoScout === true || launch.fenced !== false) return false;
  return launch.kind === 'cli' || launch.kind === 'role';
}

// Entries for an agent pane with a valid token, else {} (the caller logs why).
function buildAgentGitEnv(token) {
  if (!isAgentToken(token)) return {};
  return {
    GH_TOKEN: token,
    GIT_CONFIG_COUNT: '2',
    GIT_CONFIG_KEY_0: 'credential.helper',
    GIT_CONFIG_VALUE_0: '',
    GIT_CONFIG_KEY_1: 'credential.https://github.com.helper',
    GIT_CONFIG_VALUE_1: GH_HELPER,
    GIT_TERMINAL_PROMPT: '0',
    GIT_AUTHOR_NAME: AGENT_LOGIN,
    GIT_AUTHOR_EMAIL: AGENT_NOREPLY_EMAIL,
    GIT_COMMITTER_NAME: AGENT_LOGIN,
    GIT_COMMITTER_EMAIL: AGENT_NOREPLY_EMAIL,
  };
}

module.exports = {
  AGENT_GIT_ENV_KEYS,
  AGENT_LOGIN,
  AGENT_NOREPLY_EMAIL,
  isAgentToken,
  isAgentPane,
  buildAgentGitEnv,
};
