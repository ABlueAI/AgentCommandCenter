'use strict';
// S10 ONE-CLICK AUTHORITY (pure). Maps the authority level Blue picks in Mako to the Claude Code
// permission mode a pane launches with (AGENTS.md "Authority levels"):
//   minimum -> plan         read, research, plan; no edits
//   medium  -> acceptEdits  edits accepted; commands with side effects still ask
//   high    -> auto         multi-step work with few interruptions
//   maximum -> never local  the task goes to a cloud session (claude.ai/code), so a Claude pane at
//                           Maximum is REFUSED here; Mako never launches bypassPermissions or dontAsk.
//
// The renderer sends only a level NAME. The permission mode is a main-owned constant from the table
// below, so no renderer text reaches the command line. Pure: no Electron, filesystem or logging.
//
// Which panes a level applies to: unfenced Claude panes (a role pane such as builder or reviewer, or
// a bare `claude` pane). Fenced roles (web-scout, operator, source-scout) keep the launch they have
// today, because their fence (tool denials, the write-fence hook and the sandbox cwd) is their
// authority, and plan mode would stop them writing their reports. Codex, Gemini, Video Scout and
// shell panes have no Claude permission mode. For those, a level other than Maximum is recorded as
// not applied (`applied: false`, shown in the Logs tab by the caller), never silently changed.

const LEVEL = Object.freeze({
  MINIMUM: 'minimum',
  MEDIUM: 'medium',
  HIGH: 'high',
  MAXIMUM: 'maximum',
});
const LEVELS = Object.freeze([LEVEL.MINIMUM, LEVEL.MEDIUM, LEVEL.HIGH, LEVEL.MAXIMUM]);

const PERMISSION_MODE = Object.freeze({
  [LEVEL.MINIMUM]: 'plan',
  [LEVEL.MEDIUM]: 'acceptEdits',
  [LEVEL.HIGH]: 'auto',
});
const LOCAL_PERMISSION_MODES = Object.freeze(new Set(Object.values(PERMISSION_MODE)));

// S31 item 1. Every Claude pane runs with CLAUDE_CODE_SUBPROCESS_ENV_SCRUB=1 (AGENTS.md "Security
// rules"), and with the scrub set Claude Code forces the permission mode to `default` ("Permission
// mode forced to default - CLAUDE_CODE_SUBPROCESS_ENV_SCRUB is set ... Declare allowedTools
// explicitly", seen on Blue's PC with Claude Code 2.1.316, checklist step 40). `--allowedTools` is
// still honored, so each level also carries an explicit, main-owned set of tools that run without a
// prompt; anything not listed still asks. The scrub stays on: turning it off is Blue's call.
// Rule syntax: Claude Code's permission rules (`Tool` or `Bash(prefix:*)`). docs/AUTHORITY-LEVELS.md
// lists the same sets for Blue.
const READ_TOOLS = Object.freeze(['Read', 'Glob', 'Grep', 'TodoWrite']);
const EDIT_TOOLS = Object.freeze(['Edit', 'Write', 'NotebookEdit']);
// High: edits plus routine local git and test commands. Never `git push`, never a package install
// other than `npm ci` from the lockfile, never a general interpreter such as `node:*`.
const HIGH_BASH = Object.freeze([
  'Bash(git status:*)', 'Bash(git diff:*)', 'Bash(git log:*)', 'Bash(git show:*)',
  'Bash(git branch:*)', 'Bash(git switch:*)', 'Bash(git fetch:*)', 'Bash(git add:*)',
  'Bash(git commit:*)', 'Bash(npm test:*)', 'Bash(npm run test:*)', 'Bash(npm ci:*)',
]);
const ALLOWED_TOOLS = Object.freeze({
  [LEVEL.MINIMUM]: Object.freeze(READ_TOOLS.slice()),
  [LEVEL.MEDIUM]: Object.freeze(READ_TOOLS.concat(EDIT_TOOLS)),
  [LEVEL.HIGH]: Object.freeze(READ_TOOLS.concat(EDIT_TOOLS, HIGH_BASH)),
});
// Minimum means "no edits" (AGENTS.md). Plan mode gave that; under the forced default mode the edit
// tools are denied outright instead, so an edit can't be approved by a stray click.
const DISALLOWED_TOOLS = Object.freeze({
  [LEVEL.MINIMUM]: EDIT_TOOLS,
});
const MODE_LEVEL = Object.freeze(Object.fromEntries(Object.entries(PERMISSION_MODE).map(([l, m]) => [m, l])));

// Where a Maximum task goes instead of a local pane. A constant: the renderer never supplies it.
const CLOUD_SESSION_URL = 'https://claude.ai/code';

// Bounded reason CONSTANTS. A refusal never echoes the renderer's value.
const REASON = Object.freeze({
  UNKNOWN_LEVEL: 'authority-unknown-level',
  MAXIMUM_RUNS_IN_CLOUD: 'authority-maximum-runs-in-cloud',
});

/**
 * applyAuthority(launch, rawLevel)
 *
 * `launch` is an accepted result of classifyPtyLaunch ({ ok:true, kind, role, cli, fenced, ... }).
 * Returns the same launch plus { authority, permissionMode, authorityApplied }, or { ok:false, reason }.
 *   authority         the validated level name, or null when none was sent (pre-S10 callers)
 *   permissionMode    'plan' | 'acceptEdits' | 'auto' for an unfenced Claude pane, otherwise null
 *   authorityApplied  true only when permissionMode is set
 */
function applyAuthority(launch, rawLevel) {
  if (rawLevel === undefined || rawLevel === null) {
    return Object.assign({}, launch, { authority: null, permissionMode: null, authorityApplied: false });
  }
  if (typeof rawLevel !== 'string' || !LEVELS.includes(rawLevel)) {
    return { ok: false, reason: REASON.UNKNOWN_LEVEL };
  }
  const level = rawLevel;
  const claudePane = launch.kind === 'role' || (launch.kind === 'cli' && launch.cli === 'claude');
  // Maximum never runs a Claude agent locally, fenced or not: the renderer opens a cloud session
  // instead, and this refusal is the main-side guarantee if anything sends it here anyway.
  if (level === LEVEL.MAXIMUM && claudePane) return { ok: false, reason: REASON.MAXIMUM_RUNS_IN_CLOUD };
  const applies = claudePane && launch.fenced !== true && level !== LEVEL.MAXIMUM;
  const permissionMode = applies ? PERMISSION_MODE[level] : null;
  return Object.assign({}, launch, { authority: level, permissionMode, authorityApplied: applies });
}

// For the command builder: the flag text for a launch, or '' when none applies. Re-checks the mode
// against the main-owned set and the fence verdict, so a launch object built any other way still
// can't put anything else on the command line.
function permissionModeArg(launch) {
  if (!launch || launch.fenced === true) return '';
  const mode = launch.permissionMode;
  if (typeof mode !== 'string' || !LOCAL_PERMISSION_MODES.has(mode)) return '';
  return ' --permission-mode ' + mode;
}

// Single-quoted PowerShell literal: the command runs inside a powershell -Command string, and the
// rules' parentheses, colons and asterisks must stay literal. The rules are constants without quotes.
function psList(tools) {
  return "'" + tools.join(',') + "'";
}

// S31: the full authority text for the command builder: the tool lists, then the mode, or '' when
// none applies. The lists go BEFORE `--permission-mode`, because `--allowedTools` and
// `--disallowedTools` take several values and would otherwise swallow a following opening prompt.
// The level is derived from the re-checked mode, so nothing outside the tables reaches the line.
function authorityArgs(launch) {
  const modeArg = permissionModeArg(launch);
  if (!modeArg) return '';
  const level = MODE_LEVEL[launch.permissionMode];
  let out = ' --allowedTools ' + psList(ALLOWED_TOOLS[level]);
  if (DISALLOWED_TOOLS[level]) out += ' --disallowedTools ' + psList(DISALLOWED_TOOLS[level]);
  return out + modeArg;
}

module.exports = {
  LEVEL, LEVELS, PERMISSION_MODE, ALLOWED_TOOLS, DISALLOWED_TOOLS, CLOUD_SESSION_URL, REASON,
  applyAuthority, permissionModeArg, authorityArgs,
};
