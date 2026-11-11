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
//     2 user.name = ABlueAgent, 3 user.email = its noreply address (S31): what `git config` reports
//                                    in the pane, and the author if GIT_AUTHOR_* were ever dropped;
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
  'GH_CONFIG_DIR', // S35: App mode points it at an empty folder; no pane inherits a stored login's folder
  'GIT_CONFIG_COUNT',
  'GIT_CONFIG_KEY_0',
  'GIT_CONFIG_VALUE_0',
  'GIT_CONFIG_KEY_1',
  'GIT_CONFIG_VALUE_1',
  'GIT_CONFIG_KEY_2',
  'GIT_CONFIG_VALUE_2',
  'GIT_CONFIG_KEY_3',
  'GIT_CONFIG_VALUE_3',
  'GIT_CONFIG_KEY_4', // S35: App mode uses six command-scope entries
  'GIT_CONFIG_VALUE_4',
  'GIT_CONFIG_KEY_5',
  'GIT_CONFIG_VALUE_5',
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

// S31 item 4. A token copied from a password manager can carry characters nobody can see (zero-width
// spaces, a byte-order mark, non-breaking spaces, a trailing newline), and three saves were refused as
// "not a GitHub token" with no visible reason (Blue's PC check, step 35). A real token never contains
// whitespace or any of these, so they are removed before the check. The reason for a refusal names
// the problem, and for a stray character only its position and code point (U+XXXX) and only when it
// can't be part of a token, so no token text is ever echoed.
const INVISIBLE_RE = /[\s\u00A0\u00AD\u180E\u200B-\u200F\u2028-\u202F\u205F-\u2064\u3000\uFEFF]/g;
const TOKEN_CHAR_RE = /[A-Za-z0-9_]/;

function codePoint(ch) {
  return 'U+' + ch.codePointAt(0).toString(16).toUpperCase().padStart(4, '0');
}

/** normalizeAgentToken(raw) -> { ok:true, token, removed } | { ok:false, reason } */
function normalizeAgentToken(raw) {
  if (typeof raw !== 'string') return { ok: false, reason: 'no token was entered' };
  const token = raw.replace(INVISIBLE_RE, '');
  const removed = raw.length - token.length;
  if (!token) return { ok: false, reason: 'no token was entered' };
  if (isAgentToken(token)) return { ok: true, token, removed };
  const chars = Array.from(token);
  const badAt = chars.findIndex((c) => !TOKEN_CHAR_RE.test(c));
  if (badAt !== -1) {
    return { ok: false, reason: `character ${badAt + 1} (${codePoint(chars[badAt])}) can't be in a GitHub token; copy the token again` };
  }
  if (token.startsWith('ghp_')) {
    return { ok: false, reason: `a classic token (ghp_) is 40 characters; this one is ${token.length}` };
  }
  if (token.startsWith('github_pat_')) {
    return { ok: false, reason: `a fine-grained token (github_pat_) is 33 to 266 characters; this one is ${token.length}` };
  }
  return { ok: false, reason: 'it does not start with ghp_ or github_pat_' };
}

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
    GIT_CONFIG_COUNT: '4',
    GIT_CONFIG_KEY_0: 'credential.helper',
    GIT_CONFIG_VALUE_0: '',
    GIT_CONFIG_KEY_1: 'credential.https://github.com.helper',
    GIT_CONFIG_VALUE_1: GH_HELPER,
    // S31 item 6: the identity as command-scope config too, so `git config user.name` in the pane
    // says ABlueAgent (on 2026-11-02 it showed ABlueAI), and commits stay ABlueAgent's even if
    // Claude Code's scrub were to drop the GIT_AUTHOR_* names (it documents keeping GIT_CONFIG_*).
    GIT_CONFIG_KEY_2: 'user.name',
    GIT_CONFIG_VALUE_2: AGENT_LOGIN,
    GIT_CONFIG_KEY_3: 'user.email',
    GIT_CONFIG_VALUE_3: AGENT_NOREPLY_EMAIL,
    GIT_TERMINAL_PROMPT: '0',
    GIT_AUTHOR_NAME: AGENT_LOGIN,
    GIT_AUTHOR_EMAIL: AGENT_NOREPLY_EMAIL,
    GIT_COMMITTER_NAME: AGENT_LOGIN,
    GIT_COMMITTER_EMAIL: AGENT_NOREPLY_EMAIL,
  };
}

// ---- S35: GitHub App mode ----------------------------------------------------------------------
// The `mako-agents` App is the primary local identity (docs/MAKO-TOKEN.md). It is a DELIBERATE second
// mode: an installation token is never pasted into the PAT path above (isAgentToken refuses it, and
// buildAgentGitEnv returns {} for it). In App mode an agent pane's environment holds NO token at all:
//   no GH_TOKEN / GITHUB_TOKEN        (both reserved, never emitted: a token in a long-lived process
//                                     goes stale after 1 hour, and gh prefers GH_TOKEN to anything else)
//   PATH                              the launcher folder first, so `gh` is the mako-token shim, which
//                                     sets GH_TOKEN for one child process only
//   GH_CONFIG_DIR                     an empty folder, so a stored ABlueAI login can't be used
//   GIT_CONFIG_* (command scope)      0 credential.helper = ""                      reset every helper
//                                     1 credential.https://github.com.helper = ""   and any github.com one
//                                     2 credential.https://github.com.helper = !'<bin>/git-credential-mako'
//                                                                                   fresh token per HTTPS call
//                                     3 user.name, 4 user.email = the bot identity
//                                     5 core.askPass = ""                           no GUI askpass fallback
//   GIT_TERMINAL_PROMPT = 0           a failed login fails visibly instead of prompting
//   GIT_AUTHOR_* / GIT_COMMITTER_*    the bot identity `<id>+<slug>[bot]@users.noreply.github.com`
// Assumes HTTPS remotes: an SSH remote (or an insteadOf rewrite to SSH) never asks the helper.
// A process running as Blue's Windows user can still read his stored logins; this is not a boundary
// against a pane (same honesty as the PAT mode above).
const mtConfig = require('./mako-token/config');
const { assertSafePath, gitHelperValue } = require('./mako-token/shims');

/**
 * buildAppAgentGitEnv({ config, binDir, ghConfigDir, ambientPath }) -> entries (PATH included).
 * THROWS on an invalid config or an unsafe path: App mode never silently degrades to nothing.
 */
function buildAppAgentGitEnv({ config, binDir, ghConfigDir, ambientPath }) {
  const v = mtConfig.validateConfig(config);
  if (!v.ok) throw new Error(`GitHub App config refused: ${v.reason}`);
  assertSafePath(binDir, 'the launcher folder');
  assertSafePath(ghConfigDir, 'the empty gh config folder');
  const env = buildAppLauncherEnv({ config: v.config, binDir, ghConfigDir });
  env.PATH = ambientPath ? `${binDir};${ambientPath}` : binDir;
  return env;
}

/** The same entries without PATH: what the interim launcher (mako-claude.cmd) sets. */
function buildAppLauncherEnv({ config, binDir, ghConfigDir }) {
  const bot = mtConfig.botIdentity(config);
  return {
    GH_CONFIG_DIR: ghConfigDir,
    GIT_CONFIG_COUNT: '6',
    GIT_CONFIG_KEY_0: 'credential.helper',
    GIT_CONFIG_VALUE_0: '',
    GIT_CONFIG_KEY_1: 'credential.https://github.com.helper',
    GIT_CONFIG_VALUE_1: '',
    GIT_CONFIG_KEY_2: 'credential.https://github.com.helper',
    GIT_CONFIG_VALUE_2: gitHelperValue(binDir),
    GIT_CONFIG_KEY_3: 'user.name',
    GIT_CONFIG_VALUE_3: bot.name,
    GIT_CONFIG_KEY_4: 'user.email',
    GIT_CONFIG_VALUE_4: bot.email,
    // If the helper fails (offline, key problem), git must not fall back to a GUI askpass program from
    // Blue's own config, where an answer would push as him. An empty value is "no askpass program".
    GIT_CONFIG_KEY_5: 'core.askPass',
    GIT_CONFIG_VALUE_5: '',
    GIT_TERMINAL_PROMPT: '0',
    GIT_AUTHOR_NAME: bot.name,
    GIT_AUTHOR_EMAIL: bot.email,
    GIT_COMMITTER_NAME: bot.name,
    GIT_COMMITTER_EMAIL: bot.email,
  };
}

module.exports = {
  buildAppAgentGitEnv,
  buildAppLauncherEnv,
  AGENT_GIT_ENV_KEYS,
  AGENT_LOGIN,
  AGENT_NOREPLY_EMAIL,
  isAgentToken,
  normalizeAgentToken,
  isAgentPane,
  buildAgentGitEnv,
};
