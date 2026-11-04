#!/usr/bin/env node
'use strict';
// Account guard: a Claude Code PreToolUse hook on the Bash tool (.claude/settings.json).
//
// Why: Blue can't approve a PR that his own GitHub login (`ABlueAI`) opened or last pushed to,
// because `main`'s ruleset needs a code owner's approval of the latest push and he is the only
// code owner. PRs #142 and #144 (2026-11-04) were opened from Claude desktop chats running under
// his `gh` login and had to be re-opened from a cloud session as #146 and #147. AGENTS.md
// ("No PR work under ABlueAI's login") is the rule; this hook enforces it.
//
// What it does, in order:
//   1. Reads the hook input (JSON on stdin) and looks for `gh pr create` (and its alias
//      `gh pr new`), `gh pr ready` or `git push` anywhere in the Bash command, including chained
//      commands, subshells, command substitution and `bash -c "..."`. Anything else exits 0
//      straight away, without starting `gh` or touching the network.
//   2. For a matching command only, runs `gh api user --jq .login` (same environment as the
//      session, so a Mako agent pane's GH_TOKEN and a cloud session's login are what it sees).
//   3. Login `ABlueAI` (GitHub logins are case-insensitive): exit 2 with a message on stderr.
//      Claude Code blocks the tool call and shows Claude that message.
//      Any other login (`ABlueAgent` in Mako panes and cloud sessions): exit 0, silently.
//      `gh` missing, not logged in, offline or slow: exit 0, with a one-line notice to the user
//      (`systemMessage` in JSON on stdout) that the account couldn't be checked.
//
// It fails open on purpose (Blue, 2026-11-04: "i just dont want this to cause more problems"):
// only a confirmed `ABlueAI` login blocks. A crash, bad input or an unknown shape is allowed
// with a notice, and settings.json sets "onFailure": "continue" so a hook that can't start
// doesn't block either.
//
// Hook contract (official docs, https://code.claude.com/docs/en/hooks, read 2026-11-04):
// "Exit with code 2 to block the action ... a `PreToolUse` hook blocks the tool call";
// "The message that comes with the block is your hook's stderr"; exit 0 lets the call go ahead
// and applies JSON on stdout, where `systemMessage` is a "Warning message shown to the user".
//
// Not a security boundary: it guards against an honest session using the wrong login. A process
// running as Blue's Windows user can still use his stored logins, which is why he removes them
// after checklist step 35 (BLUE-CHECKLIST.md step 49).

const { execFileSync } = require('child_process');
const path = require('path');

const BLOCKED_LOGIN = 'ABlueAI';
const GH_TIMEOUT_MS = 10000;

const BLOCK_MESSAGE = [
  `Blocked by Mako's account guard (.claude/hooks/account-guard.js): this session's GitHub CLI login is ${BLOCKED_LOGIN}.`,
  `Blue can't approve a PR that ${BLOCKED_LOGIN} opened or last pushed to, so a session under his login never opens a PR,`,
  'pushes to a PR branch or marks a PR ready (AGENTS.md, "No PR work under ABlueAI\'s login").',
  'Do not retry or work around this. Hand the work to a cloud session (claude.ai/code) or a Mako agent pane,',
  'both of which run as ABlueAgent, and tell Blue which one to start and what to give it.',
].join('\n');

// ---------------------------------------------------------------------------------------------
// Command matching

const SHELLS = new Set(['sh', 'bash', 'zsh', 'dash', 'ksh']);
const POWERSHELLS = new Set(['pwsh', 'powershell']);
// Words that run the next word as a command; skipped before looking at the program name.
const PREFIX_WORDS = new Set([
  'sudo', 'command', 'builtin', 'exec', 'nohup', 'time', 'nice', 'then', 'do', 'else', 'elif',
  'if', 'while', 'until', '!', '{', '}',
]);
// git's global options that take a separate value (`git -C dir push`).
const GIT_VALUE_OPTS = new Set(['-C', '-c', '--git-dir', '--work-tree', '--namespace', '--config-env', '--super-prefix']);
// gh flags that take a separate value, before or after `pr`.
const GH_VALUE_OPTS = new Set(['-R', '--repo', '--hostname']);
const SEPARATORS = new Set([';', '&', '|', '\n', '\r', '(', ')']);

// Find the index of the `)` closing a `$(` that starts at `open` (the index after `$(`).
function matchParen(s, open) {
  let depth = 1;
  let quote = null;
  for (let i = open; i < s.length; i++) {
    const c = s[i];
    if (quote) {
      if (c === '\\' && quote === '"') { i++; continue; }
      if (c === quote) quote = null;
      continue;
    }
    if (c === '\\') { i++; continue; }
    if (c === '"' || c === "'") { quote = c; continue; }
    if (c === '(') depth++;
    else if (c === ')' && --depth === 0) return i;
  }
  return s.length;
}

// Split a shell command line into simple commands (arrays of words). Quote-aware, so text inside
// quotes (a commit message, an echo) is never mistaken for a command; command substitutions
// (`$(...)`, backticks) are split out as commands of their own, since the shell runs them.
function splitCommands(input, depth = 0) {
  const commands = [];
  if (typeof input !== 'string' || depth > 8) return commands;
  let words = [];
  let word = null; // null = no word started
  const endWord = () => { if (word !== null) { words.push(word); word = null; } };
  const endCommand = () => { endWord(); if (words.length) commands.push(words); words = []; };
  const sub = (text) => { for (const c of splitCommands(text, depth + 1)) commands.push(c); };

  const s = input;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '\\') {
      if (s[i + 1] === '\n') { i++; continue; } // line continuation
      word = (word || '') + (s[i + 1] || '');
      i++;
      continue;
    }
    if (c === "'") {
      const end = s.indexOf("'", i + 1);
      const stop = end === -1 ? s.length : end;
      word = (word || '') + s.slice(i + 1, stop);
      i = stop;
      continue;
    }
    if (c === '"') {
      let j = i + 1;
      let text = '';
      for (; j < s.length && s[j] !== '"'; j++) {
        // Inside double quotes a backslash escapes only these (so `"C:\Program Files\..."` keeps
        // its backslashes, as bash does).
        if (s[j] === '\\' && j + 1 < s.length && '"\\$`\n'.includes(s[j + 1])) { text += s[j + 1]; j++; continue; }
        if (s[j] === '$' && s[j + 1] === '(') {
          const close = matchParen(s, j + 2);
          sub(s.slice(j + 2, close));
          j = close;
          continue;
        }
        if (s[j] === '`') {
          const close = s.indexOf('`', j + 1);
          const stop = close === -1 ? s.length : close;
          sub(s.slice(j + 1, stop));
          j = stop;
          continue;
        }
        text += s[j];
      }
      word = (word || '') + text;
      i = j;
      continue;
    }
    if (c === '$' && s[i + 1] === '(') {
      const close = matchParen(s, i + 2);
      sub(s.slice(i + 2, close));
      word = (word || '') + '$()';
      i = close;
      continue;
    }
    if (c === '`') {
      const close = s.indexOf('`', i + 1);
      const stop = close === -1 ? s.length : close;
      sub(s.slice(i + 1, stop));
      word = (word || '') + '``';
      i = stop;
      continue;
    }
    if (c === '#' && word === null) { // comment to end of line
      while (i + 1 < s.length && s[i + 1] !== '\n') i++;
      continue;
    }
    if (SEPARATORS.has(c)) { endCommand(); continue; }
    if (c === ' ' || c === '\t') { endWord(); continue; }
    if (c === '<' || c === '>') { endWord(); continue; }
    word = (word || '') + c;
  }
  endCommand();
  return commands;
}

function programName(word) {
  return path.basename(String(word).replace(/\\/g, '/')).toLowerCase().replace(/\.exe$/, '');
}

function skipOptions(words, start, valueOpts) {
  let i = start;
  while (i < words.length && words[i].startsWith('-')) {
    i += valueOpts.has(words[i]) ? 2 : 1;
  }
  return i;
}

// What a simple command does, if it's one we guard: 'git push', 'gh pr create', 'gh pr ready'.
function classifySimpleCommand(words, depth) {
  let i = 0;
  // Leading `VAR=value` assignments, wrappers like sudo, and `env [-opts] [VAR=value]`.
  for (;;) {
    if (i >= words.length) return null;
    const w = words[i];
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(w) || PREFIX_WORDS.has(w)) { i++; continue; }
    if (programName(w) === 'env') {
      i++;
      while (i < words.length && (words[i].startsWith('-') || /^[A-Za-z_][A-Za-z0-9_]*=/.test(words[i]))) i++;
      continue;
    }
    break;
  }
  const prog = programName(words[i]);
  const rest = words.slice(i + 1);

  if (prog === 'git') {
    const j = skipOptions(rest, 0, GIT_VALUE_OPTS);
    return rest[j] === 'push' ? 'git push' : null;
  }
  if (prog === 'gh') {
    let j = skipOptions(rest, 0, GH_VALUE_OPTS);
    if (rest[j] !== 'pr') return null;
    j = skipOptions(rest, j + 1, GH_VALUE_OPTS);
    if (rest[j] === 'create' || rest[j] === 'new') return 'gh pr create';
    if (rest[j] === 'ready') return 'gh pr ready';
    return null;
  }
  // `bash -c "git push"`, `pwsh -Command "gh pr create"`: check the script they run.
  if (SHELLS.has(prog) || POWERSHELLS.has(prog)) {
    for (let k = 0; k < rest.length - 1; k++) {
      const flag = rest[k];
      const isCmdFlag = SHELLS.has(prog)
        ? /^-[a-z]*c[a-z]*$/.test(flag)
        : /^-(c|command|com|comm|comma|comman)$/i.test(flag);
      if (isCmdFlag) return findGuardedCommand(rest[k + 1], depth + 1);
    }
  }
  return null;
}

// The first guarded command in a Bash command line, or null. Never touches the network.
function findGuardedCommand(command, depth = 0) {
  if (depth > 8) return null;
  for (const words of splitCommands(command, depth)) {
    const hit = classifySimpleCommand(words, depth);
    if (hit) return hit;
  }
  return null;
}

// ---------------------------------------------------------------------------------------------
// Login check

// Returns { login } or { error } (never throws). Runs gh with the session's own environment.
function readGhLogin() {
  try {
    const out = execFileSync('gh', ['api', 'user', '--jq', '.login'], {
      encoding: 'utf8',
      timeout: GH_TIMEOUT_MS,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const login = String(out).trim();
    if (!/^[A-Za-z0-9-]{1,39}$/.test(login)) return { error: 'gh returned no login' };
    return { login };
  } catch (err) {
    if (err && err.code === 'ENOENT') return { error: 'gh is not installed or not on PATH' };
    if (err && (err.code === 'ETIMEDOUT' || err.signal === 'SIGTERM')) {
      return { error: `gh did not answer within ${GH_TIMEOUT_MS / 1000} seconds` };
    }
    const status = err && typeof err.status === 'number' ? ` (exit ${err.status})` : '';
    return { error: `gh could not read the login${status}; it may not be logged in or offline` };
  }
}

// The verdict for one hook input. `getLogin` is injectable for tests.
// Returns { exitCode: 0 | 2, stderr?: string, systemMessage?: string, checked: boolean }.
function decide(input, getLogin = readGhLogin) {
  const toolName = input && input.tool_name;
  const command = input && input.tool_input && input.tool_input.command;
  if (toolName !== 'Bash' || typeof command !== 'string') return { exitCode: 0, checked: false };

  const hit = findGuardedCommand(command);
  if (!hit) return { exitCode: 0, checked: false };

  const result = getLogin();
  if (result && typeof result.login === 'string') {
    if (result.login.toLowerCase() === BLOCKED_LOGIN.toLowerCase()) {
      return { exitCode: 2, checked: true, stderr: `${BLOCK_MESSAGE}\n(Command matched: ${hit}.)` };
    }
    return { exitCode: 0, checked: true };
  }
  const why = (result && result.error) || 'unknown error';
  return {
    exitCode: 0,
    checked: true,
    systemMessage: `Account guard: couldn't check the GitHub login before \`${hit}\` (${why}); allowed.`,
  };
}

function readStdin() {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => { data += chunk; });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', () => resolve(data));
  });
}

async function main() {
  let verdict;
  try {
    const raw = await readStdin();
    let input;
    try { input = JSON.parse(raw); } catch {
      verdict = { exitCode: 0, systemMessage: "Account guard: couldn't read the hook input; allowed." };
    }
    if (!verdict) verdict = decide(input);
  } catch (err) {
    verdict = { exitCode: 0, systemMessage: `Account guard: internal error (${err && err.message}); allowed.` };
  }
  if (verdict.systemMessage) {
    process.stdout.write(JSON.stringify({ systemMessage: verdict.systemMessage }) + '\n');
    process.stderr.write(verdict.systemMessage + '\n');
  }
  if (verdict.stderr) process.stderr.write(verdict.stderr + '\n');
  process.exitCode = verdict.exitCode;
}

if (require.main === module) main();

module.exports = { splitCommands, findGuardedCommand, decide, readGhLogin, BLOCKED_LOGIN, BLOCK_MESSAGE };
