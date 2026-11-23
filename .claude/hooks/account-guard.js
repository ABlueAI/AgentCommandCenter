#!/usr/bin/env node
'use strict';
// Account guard: a Claude Code PreToolUse hook on the Bash and PowerShell tools (.claude/settings.json,
// matcher `Bash|PowerShell`; the PowerShell tool was a known gap until S37, issue #217).
//
// Why: Blue can't approve a PR that his own GitHub login (`ABlueAI`) opened or last pushed to,
// because `main`'s ruleset needs a code owner's approval of the latest push and he is the only
// code owner. PRs #142 and #144 (2026-11-04) were opened from Claude desktop chats running under
// his `gh` login and had to be re-opened from a cloud session as #146 and #147. AGENTS.md
// ("No PR work under ABlueAI's login") is the rule; this hook enforces it.
//
// Second rule, added 2026-11-11 ("Agents never approve or merge", Blue): PR #133, authored by ABlueAI,
// was approved and merged by ABlueAgent 11 seconds apart on 2026-10-29, because the `main` ruleset
// accepts an agent approval on a PR Blue authored; the merge audit caught it only afterwards (issue
// #137). So review and merge calls are blocked under ANY login, not only ABlueAI's.
//
// What it does, in order:
//   1. Reads the hook input (JSON on stdin) and looks, anywhere in the command (chained
//      commands, subshells, command substitution and `bash -c "..."` included; for the PowerShell
//      tool, PowerShell's own syntax: `&` and `.` calls, backtick line continuations, script
//      blocks, `$(...)` groups, here-strings, `$x = ...` assignments, Invoke-Expression,
//      Start-Process and `cmd /c`), for
//        login-dependent commands (blocked only under ABlueAI): `gh pr create` (and its alias
//          `gh pr new`), `gh pr ready` and `git push`;
//        review and merge commands (blocked under any login, without asking gh who you are):
//          `gh pr review`, `gh pr merge`, and a `gh api` call that writes (an explicit
//          `-X`/`--method` POST or PUT, or any body flag `-f -F --field --raw-field --input`, which
//          make gh POST) to a `.../reviews` endpoint, to `.../pulls/N/merge`, to `.../merges` (the
//          branch-merge API) or to the cloud sessions' `.../ccr/auto_merge` route (auto-merge), or
//          a `gh api graphql` call that names mergePullRequest, enablePullRequestAutoMerge,
//          addPullRequestReview or submitPullRequestReview. A read (a GET with no body) of those
//          endpoints is not matched here (.claude/settings.json denies `gh api` to them whatever
//          the method, which is stricter).
//      Anything else exits 0 straight away, without starting `gh` or touching the network.
//   2. For a login-dependent command only, runs `gh api user --jq .login` (same environment as the
//      session, so a Mako agent pane's GH_TOKEN and a cloud session's login are what it sees).
//      It checks gh's login, not the credential `git push` itself uses (Git Credential Manager or
//      an SSH key): with gh logged out but Git Credential Manager still holding ABlueAI, a push is
//      allowed with a notice. Removing both logins (checklist step 49) closes that gap.
//   3. Login `ABlueAI` (GitHub logins are case-insensitive): exit 2 with a message on stderr.
//      Claude Code blocks the tool call and shows Claude that message.
//      Any other login (`ABlueAgent` in cloud sessions, `mako-agents[bot]`, the GitHub App, in
//      local panes; any login ending in `[bot]` is accepted): exit 0, silently.
//      An App installation token has no user, so `gh api user` answers 403 "Resource not
//      accessible by integration" for it: that is not an unknown error. The token can't be
//      ABlueAI's, so the command is allowed, with a one-line notice that says why.
//      `gh` missing, not logged in, offline or slow: exit 0, with a one-line notice to the user
//      (`systemMessage` in JSON on stdout) that the account couldn't be checked.
//   4. A review or merge command (above) exits 2 with its own message, whatever the login.
//
// It fails open on purpose (Blue, 2026-11-04: "i just dont want this to cause more problems"):
// only a confirmed `ABlueAI` login blocks. A crash, bad input or an unknown shape is allowed
// with a notice. settings.json leaves `onFailure` unset, so in exec form a hook that can't start
// (no node on PATH, a missing script) is a non-blocking error: "Without `onFailure` set, the same
// missing script is a non-blocking error and `ls` runs" (docs, "Block the action when a hook
// fails"). Exec form: "path placeholders ... are substituted into `command` and into each `args`
// element as plain strings" (docs, "Exec form and shell form").
//
// Hook contract (official docs, https://code.claude.com/docs/en/hooks, read 2026-11-04):
// "Exit with code 2 to block the action ... a `PreToolUse` hook blocks the tool call";
// "The message that comes with the block is your hook's stderr"; exit 0 lets the call go ahead
// and applies JSON on stdout, where `systemMessage` is a "Warning message shown to the user".
//
// Known gaps (not a security boundary; it guards against an honest session using the wrong
// login): wrappers that take their own options (`timeout 60 git push`, `nice -n 5`, `sudo -u x`,
// `xargs`, and `cmd /c` from Bash), `pwsh -EncodedCommand` and `pwsh -File`, in PowerShell a
// program or arguments held in a variable or built by an expression (`& $gh pr create`, splatting
// `gh @a`, `iex ('git ' + 'push')`, `[scriptblock]::Create(...)`, a string piped into
// Invoke-Expression), scripts or npm scripts that push, merge or review,
// `gh api` calls that create PRs, `gh api` whose endpoint or method comes from a shell variable or a
// file (`gh api "$URL"`, `--input` bodies are matched by the flag, not their content), `gh api`
// reached through an alias or `gh -R x api` with other global options, a GraphQL mutation read from
// a file (`-F query=@mutation.graphql`), `curl` or SDK calls to
// api.github.com with a token, and tools other than Bash and PowerShell (GitHub MCP tools:
// .claude/settings.json denies the ones whose names were checked; its `Bash(...)` deny rules don't
// apply to the PowerShell tool, where this hook's review and merge block is the layer that holds). A process running as
// Blue's Windows user can still use his stored logins, which is why he removes them after
// checklist step 35 (BLUE-CHECKLIST.md step 49). Review and merge calls are guarded only as far as
// this hook sees them: the real gate is that `main` needs Blue's approval, and the merge audit
// (.github/workflows/merge-audit.yml) alerts when an agent approved a PR that Blue authored.

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const BLOCKED_LOGIN = 'ABlueAI';
const GH_TIMEOUT_MS = 10000;

const BLOCK_MESSAGE = [
  `Blocked by Mako's account guard (.claude/hooks/account-guard.js): this session's GitHub CLI login is ${BLOCKED_LOGIN}.`,
  `Blue can't approve a PR that ${BLOCKED_LOGIN} opened or last pushed to, so a session under his login never opens a PR,`,
  'pushes to a PR branch or marks a PR ready (AGENTS.md, "No PR work under ABlueAI\'s login").',
  'Do not retry or work around this. Hand the work to a cloud session (claude.ai/code, which runs as ABlueAgent) or a',
  'Mako agent pane (which runs as the GitHub App, mako-agents[bot], or as ABlueAgent), and tell Blue which one to start and what to give it.',
].join('\n');

// Printed for a review or merge command, whatever the login (no `gh` call is made).
const NEVER_MESSAGE = [
  "Blocked by Mako's account guard (.claude/hooks/account-guard.js): agent sessions never approve, review through the API or merge.",
  'Agents never approve or merge (Blue, 2026-11-11): Blue approves and merges every PR himself, in the GitHub web UI.',
  'To report on a PR, post a PR comment (a plain comment, not a review). Do not retry or work around this;',
  'if the PR is ready, say READY TO MERGE in your summary and stop.',
].join('\n');

// Commands blocked under any login. Everything else the guard finds is blocked only under ABlueAI.
const ALWAYS_BLOCKED = new Set(['gh pr review', 'gh pr merge', 'gh api review', 'gh api merge']);

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

// Heredocs (`cat <<'EOF'` ... `EOF`): their bodies are data, not commands, and may hold unbalanced
// quotes (a commit message's "don't"), so their text is never parsed as commands. With an unquoted
// delimiter (`<<EOF`), bash still runs the body's `$(...)` and backticks, so those are checked.
// readHeredoc: at `<<` (index i), returns { delim, stripTabs, quoted, end } or null. `end` is the
// index just after the delimiter word; `quoted` is true when any part of it was quoted or escaped.
function readHeredoc(s, i) {
  if (s[i] !== '<' || s[i + 1] !== '<' || s[i + 2] === '<') return null;
  let j = i + 2;
  const stripTabs = s[j] === '-';
  if (stripTabs) j++;
  while (s[j] === ' ' || s[j] === '\t') j++;
  let delim = '';
  let quoted = false;
  while (j < s.length && !/[\s;&|<>()]/.test(s[j])) {
    const c = s[j];
    if (c === "'" || c === '"') {
      const close = s.indexOf(c, j + 1);
      if (close === -1) return null;
      delim += s.slice(j + 1, close);
      quoted = true;
      j = close + 1;
      continue;
    }
    if (c === '\\') { delim += s[j + 1] || ''; quoted = true; j += 2; continue; }
    delim += c;
    j++;
  }
  return delim ? { delim, stripTabs, quoted, end: j } : null;
}

// skipHeredocBodies: `nl` is the index of the newline that ends the heredocs' command line. Returns
// the index of the newline after the last closing delimiter line. A delimiter that never appears
// (or a `<<` that was really an arithmetic shift, `(( x << 3 ))`) marks ctx.unbalanced, so the
// caller's plain text scan still sees whatever followed. `onBody(text)` is called with the body of
// each heredoc whose delimiter was unquoted, so its substitutions can be checked.
function skipHeredocBodies(s, nl, pending, ctx, onBody) {
  let end = nl;
  for (const h of pending) {
    const bodyStart = end + 1;
    let pos = bodyStart;
    let found = false;
    while (pos <= s.length) {
      const next = s.indexOf('\n', pos);
      const lineEnd = next === -1 ? s.length : next;
      let line = s.slice(pos, lineEnd).replace(/\r$/, '');
      if (h.stripTabs) line = line.replace(/^\t+/, '');
      if (line === h.delim) {
        if (!h.quoted && onBody) onBody(s.slice(bodyStart, pos));
        end = lineEnd;
        found = true;
        break;
      }
      if (next === -1) break;
      pos = next + 1;
    }
    if (!found) { if (ctx) ctx.unbalanced = true; return s.length; }
  }
  return end;
}

// The command substitutions bash runs inside an unquoted heredoc body: `$(...)` and backticks.
// Everything else in the body, quotes included, is literal text.
function bodySubstitutions(body, ctx) {
  const found = [];
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (c === '\\') { i++; continue; }
    if (c === '$' && body[i + 1] === '(') {
      const close = matchParen(body, i + 2, ctx);
      found.push(body.slice(i + 2, close));
      i = close;
    } else if (c === '`') {
      const close = body.indexOf('`', i + 1);
      if (close === -1) { if (ctx) ctx.unbalanced = true; found.push(body.slice(i + 1)); break; }
      found.push(body.slice(i + 1, close));
      i = close;
    }
  }
  return found;
}

// Find the index of the `)` closing a `$(` that starts at `open` (the index after `$(`).
// Returns s.length, and marks ctx.unbalanced, if there is none.
function matchParen(s, open, ctx) {
  let depth = 1;
  let quote = null;
  let pending = [];
  for (let i = open; i < s.length; i++) {
    const c = s[i];
    if (quote) {
      if (c === '\\' && quote === '"') { i++; continue; }
      if (c === quote) quote = null;
      continue;
    }
    if (c === '\\') { i++; continue; }
    if (c === '"' || c === "'") { quote = c; continue; }
    if (c === '<') {
      if (s[i + 1] === '<' && s[i + 2] === '<') { i += 2; continue; } // here-string, not a heredoc
      const h = readHeredoc(s, i);
      if (h) { pending.push(h); i = h.end - 1; continue; }
    }
    if (c === '\n' && pending.length) {
      const p = skipHeredocBodies(s, i, pending, ctx);
      pending = [];
      i = p - 1;
      continue;
    }
    if (c === '(') depth++;
    else if (c === ')' && --depth === 0) return i;
  }
  if (ctx) ctx.unbalanced = true;
  return s.length;
}

// Split a shell command line into simple commands (arrays of words). Quote-aware, so text inside
// quotes (a commit message, an echo) is never mistaken for a command; command substitutions
// (`$(...)`, backticks) are split out as commands of their own, since the shell runs them.
// ctx.unbalanced is set when a quote, `$(` or backtick never closes, or a heredoc delimiter never
// appears; the caller then falls back to a plain text scan, so a parsing gap can't hide a guarded
// command.
function splitCommands(input, depth = 0, ctx = { unbalanced: false }) {
  const commands = [];
  if (typeof input !== 'string' || depth > 8) return commands;
  let pending = []; // heredocs whose bodies start after the next newline
  let words = [];
  let word = null; // null = no word started
  const endWord = () => { if (word !== null) { words.push(word); word = null; } };
  const endCommand = () => { endWord(); if (words.length) commands.push(words); words = []; };
  const sub = (text) => { for (const c of splitCommands(text, depth + 1, ctx)) commands.push(c); };

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
      if (end === -1) ctx.unbalanced = true;
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
          const close = matchParen(s, j + 2, ctx);
          sub(s.slice(j + 2, close));
          j = close;
          continue;
        }
        if (s[j] === '`') {
          const close = s.indexOf('`', j + 1);
          if (close === -1) ctx.unbalanced = true;
          const stop = close === -1 ? s.length : close;
          sub(s.slice(j + 1, stop));
          j = stop;
          continue;
        }
        text += s[j];
      }
      if (j >= s.length) ctx.unbalanced = true;
      word = (word || '') + text;
      i = j;
      continue;
    }
    if (c === '$' && s[i + 1] === '(') {
      const close = matchParen(s, i + 2, ctx);
      sub(s.slice(i + 2, close));
      word = (word || '') + '$()';
      i = close;
      continue;
    }
    if (c === '`') {
      const close = s.indexOf('`', i + 1);
      if (close === -1) ctx.unbalanced = true;
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
    if (c === '\n' && pending.length) { // skip the heredoc bodies that start on the next line
      endCommand();
      const p = skipHeredocBodies(s, i, pending, ctx, (body) => {
        for (const text of bodySubstitutions(body, ctx)) sub(text);
      });
      pending = [];
      i = p - 1;
      continue;
    }
    if (SEPARATORS.has(c)) { endCommand(); continue; }
    if (c === ' ' || c === '\t') { endWord(); continue; }
    if (c === '<') {
      endWord();
      if (s[i + 1] === '<' && s[i + 2] === '<') { i += 2; continue; } // here-string, not a heredoc
      const h = readHeredoc(s, i);
      if (h) { pending.push(h); i = h.end - 1; }
      continue;
    }
    if (c === '>') { endWord(); continue; }
    word = (word || '') + c;
  }
  endCommand();
  return commands;
}

// ---------------------------------------------------------------------------------------------
// PowerShell (Claude Code's PowerShell tool, and `pwsh -Command` scripts)
//
// PowerShell's syntax is not Bash's, so its commands get their own splitter, with the same output:
// simple commands as arrays of words, with every nested command (a `$(...)`, `@(...)` or `(...)`
// group, a `{ ... }` script block) split out as a command of its own. The differences that matter:
// the backtick is the escape and line-continuation character (not command substitution); `'...'`
// doubles a quote to escape it; `"..."` runs its `$(...)` groups; `@'...'@` and `@"..."@` are
// here-strings (data; the `@"` kind still runs its `$(...)`); `#` and `<# ... #>` are comments; `&`
// is also the call operator (`& gh pr create`), which splitting on `&` handles; `{ }` script blocks
// run their contents (`if (...) { git push }`, `& { ... }`, `ForEach-Object { ... }`), so their
// contents are always checked; and PowerShell takes the typographic quotes as quotes too.
// Language reference: about_Quoting_Rules, about_Special_Characters, about_Parsing, about_Comments
// (learn.microsoft.com, PowerShell 7). Anything it can't close falls back to the text scan below.

const PS_SINGLE = "'‘’‚‛";
const PS_DOUBLE = '"“”„';
const PS_SEPARATORS = new Set([';', '&', '|', '\n', '\r', '{', '}', ')']);
// True when `ch` is one character of `chars` (a bare `includes` would also accept '' or undefined).
const isOneOf = (chars, ch) => typeof ch === 'string' && ch.length === 1 && chars.includes(ch);

// At a quote (index i), returns the index of its closing quote; a doubled quote is an escaped one.
// In a double-quoted string the backtick escapes the next character and `$(...)` runs (onSub gets
// its text). Returns s.length, and marks ctx.unbalanced, if the string never closes.
function psStringEnd(s, i, ctx, onSub) {
  const single = isOneOf(PS_SINGLE, s[i]);
  const quotes = single ? PS_SINGLE : PS_DOUBLE;
  for (let j = i + 1; j < s.length; j++) {
    const c = s[j];
    if (!single && c === '`') { j++; continue; }
    if (!single && c === '$' && s[j + 1] === '(') {
      const close = psParenEnd(s, j + 2, ctx);
      if (onSub) onSub(s.slice(j + 2, close));
      j = close;
      continue;
    }
    if (isOneOf(quotes, c)) {
      if (isOneOf(quotes, s[j + 1])) { j++; continue; }
      return j;
    }
  }
  ctx.unbalanced = true;
  return s.length;
}

// At `@` followed by a quote and the end of the line (index i), returns { body, end, expandable }
// for a here-string, where `end` is the index of the closing `@`; null if this is not a here-string.
// The closing quote and `@` start a line (leading spaces are allowed here, which can only make the
// guard see more commands, never fewer). A here-string that never closes marks ctx.unbalanced.
function psHereString(s, i, ctx) {
  if (s[i] !== '@' || !isOneOf(PS_SINGLE + PS_DOUBLE, s[i + 1])) return null;
  const m = /^[ \t]*\r?\n/.exec(s.slice(i + 2));
  if (!m) return null;
  const expandable = isOneOf(PS_DOUBLE, s[i + 1]);
  const quotes = expandable ? PS_DOUBLE : PS_SINGLE;
  const bodyStart = i + 2 + m[0].length;
  let pos = bodyStart;
  for (;;) {
    const lineStart = pos;
    let k = lineStart;
    while (s[k] === ' ' || s[k] === '\t') k++;
    if (isOneOf(quotes, s[k]) && s[k + 1] === '@') {
      const body = s.slice(bodyStart, Math.max(bodyStart, lineStart - 1)).replace(/\r$/, '');
      return { body, end: k + 1, expandable };
    }
    const next = s.indexOf('\n', pos);
    if (next === -1) break;
    pos = next + 1;
  }
  ctx.unbalanced = true;
  return { body: s.slice(bodyStart), end: s.length, expandable };
}

// The `$(...)` groups an expandable here-string body runs (a backtick escapes the `$`).
function psBodySubstitutions(body, ctx) {
  const found = [];
  for (let i = 0; i < body.length; i++) {
    if (body[i] === '`') { i++; continue; }
    if (body[i] === '$' && body[i + 1] === '(') {
      const close = psParenEnd(body, i + 2, ctx);
      found.push(body.slice(i + 2, close));
      i = close;
    }
  }
  return found;
}

// Index of the `)` that closes a group whose text starts at `open` (just after the `(`), skipping
// strings, here-strings, comments and escapes. Returns s.length, and marks ctx.unbalanced, if none.
// Groups nested in strings recurse (`"$("$(...)")"`), so past PS_MAX_NEST levels it gives up the same
// way (the text scan then runs) instead of running out of stack, which would fail open.
const PS_MAX_NEST = 64;
function psParenEnd(s, open, ctx) {
  ctx.nest = (ctx.nest || 0) + 1;
  try {
    if (ctx.nest > PS_MAX_NEST) { ctx.unbalanced = true; return s.length; }
    return psParenEndInner(s, open, ctx);
  } finally {
    ctx.nest--;
  }
}
function psParenEndInner(s, open, ctx) {
  let depth = 1;
  for (let i = open; i < s.length; i++) {
    const c = s[i];
    if (c === '`') { i++; continue; }
    if (isOneOf(PS_SINGLE + PS_DOUBLE, c)) { i = psStringEnd(s, i, ctx); continue; }
    if (c === '@') {
      const h = psHereString(s, i, ctx);
      if (h) { i = h.end; continue; }
    }
    if (c === '<' && s[i + 1] === '#') {
      const close = s.indexOf('#>', i + 2);
      if (close === -1) break;
      i = close + 1;
      continue;
    }
    if (c === '#' && (i === open || /[\s;(|&{]/.test(s[i - 1]))) {
      const nl = s.indexOf('\n', i);
      if (nl === -1) break;
      i = nl;
      continue;
    }
    if (c === '(') depth++;
    else if (c === ')' && --depth === 0) return i;
  }
  ctx.unbalanced = true;
  return s.length;
}

// Split a PowerShell script into simple commands (arrays of words), like splitCommands does for Bash.
// A group in argument position (`-ArgumentList @('pr','create')`) also stays in its word as raw text,
// so Start-Process and Invoke-Expression can read it; its commands are checked either way.
function splitPowerShell(input, depth = 0, ctx = { unbalanced: false }) {
  const commands = [];
  if (typeof input !== 'string') return commands;
  if (depth > 8) { ctx.unbalanced = true; return commands; } // too deep to split: the text scan runs
  let words = [];
  let word = null;
  const endWord = () => { if (word !== null) { words.push(word); word = null; } };
  const endCommand = () => { endWord(); if (words.length) commands.push(words); words = []; };
  const sub = (text) => { for (const c of splitPowerShell(text, depth + 1, ctx)) commands.push(c); };

  const s = input;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '`') { // escape; a backtick at the end of a line continues the command
      if (s[i + 1] === '\n') { i++; continue; }
      if (s[i + 1] === '\r' && s[i + 2] === '\n') { i += 2; continue; }
      word = (word || '') + (s[i + 1] || '');
      i++;
      continue;
    }
    if (isOneOf(PS_SINGLE, c)) {
      const end = psStringEnd(s, i, ctx);
      word = (word || '') + s.slice(i + 1, end).replace(/['‘’‚‛]{2}/g, "'");
      i = end;
      continue;
    }
    if (isOneOf(PS_DOUBLE, c)) {
      const end = psStringEnd(s, i, ctx, sub);
      word = (word || '') + s.slice(i + 1, end)
        .replace(/\$\([^]*\)/g, '$()')
        .replace(/`([^])/g, '$1')
        .replace(/["“”„]{2}/g, '"');
      i = end;
      continue;
    }
    if (c === '@') {
      const h = psHereString(s, i, ctx);
      if (h) {
        if (h.expandable) for (const text of psBodySubstitutions(h.body, ctx)) sub(text);
        word = (word || '') + h.body;
        i = h.end;
        continue;
      }
    }
    if (c === '(' || ((c === '$' || c === '@') && s[i + 1] === '(')) {
      const open = c === '(' ? i + 1 : i + 2;
      const close = psParenEnd(s, open, ctx);
      const inner = s.slice(open, close);
      sub(inner);
      if (word !== null || words.length) word = (word || '') + inner; // an argument: keep its text
      i = close;
      continue;
    }
    if (c === '$' && s[i + 1] === '{') { // ${name} is a variable, not a script block
      const close = s.indexOf('}', i + 2);
      if (close === -1) { ctx.unbalanced = true; break; }
      word = (word || '') + s.slice(i, close + 1);
      i = close;
      continue;
    }
    if (c === '<' && s[i + 1] === '#') { // block comment
      endWord();
      const close = s.indexOf('#>', i + 2);
      if (close === -1) { ctx.unbalanced = true; break; }
      i = close + 1;
      continue;
    }
    if (c === '#' && word === null) { // comment to end of line
      while (i + 1 < s.length && s[i + 1] !== '\n') i++;
      continue;
    }
    if (PS_SEPARATORS.has(c)) { endCommand(); continue; }
    if (c === ' ' || c === '\t') {
      if (word === '--%') { // stop-parsing token: the rest of the line goes to the program as is
        endWord();
        let end = i;
        while (end < s.length && s[end] !== '\n' && s[end] !== '|') end++;
        for (const w of s.slice(i, end).split(/\s+/)) if (w) words.push(w.replace(/"/g, ''));
        i = end - 1;
        continue;
      }
      endWord();
      continue;
    }
    if (c === '>' || c === '<') { endWord(); continue; }
    word = (word || '') + c;
  }
  endCommand();
  return commands;
}

// PowerShell assignment operators (`$x = gh pr create`): the command is what comes after.
const PS_ASSIGN = /^(?:[-+*/%]|\?\?)?=$/;
// Start-Process's switch parameters (no value); every other named parameter takes one.
const START_SWITCHES = ['wait', 'nonewwindow', 'passthru', 'usenewenvironment', 'loaduserprofile', 'whatif', 'confirm'];

// `Start-Process gh -ArgumentList 'pr create'` (or `-FilePath`, positional, `-Args`, `'pr','create'`,
// `@('pr', 'create')`): the program and its arguments as one simple command's words, or null.
function startProcessWords(args) {
  let file = null;
  let list = null;
  const positional = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (/^-[A-Za-z]/.test(a)) {
      const colon = a.indexOf(':');
      const name = (colon === -1 ? a.slice(1) : a.slice(1, colon)).toLowerCase();
      const isSwitch = START_SWITCHES.some((sw) => sw.startsWith(name));
      let value = colon === -1 ? undefined : a.slice(colon + 1);
      if (value === undefined && !isSwitch) value = args[++i];
      if (['filepath', 'path', 'pspath'].some((p) => p.startsWith(name))) file = value;
      else if (['argumentlist', 'args'].some((p) => p.startsWith(name))) list = value;
      continue;
    }
    positional.push(a);
  }
  if (file == null) file = positional.shift();
  if (list == null) list = positional.shift();
  if (file == null) return null;
  const argWords = String(list == null ? '' : list).split(/[\s,]+/)
    .map((w) => w.replace(/^['"‘’“”]+|['"‘’“”]+$/g, ''))
    .filter(Boolean);
  return [file, ...argWords];
}

// The PowerShell-only forms of a simple command: drops a leading `.` (dot-source) and assignments,
// and reads Invoke-Expression, Start-Process and `cmd /c`. Returns { words } to classify as usual,
// or { hit } when the command was one of the forms that run another command.
function powerShellForms(words, depth) {
  let w = words;
  for (;;) {
    if (w[0] === '.') { w = w.slice(1); continue; }
    if (/^(?:\[[^\]]*\])*\$/.test(w[0] || '')) { // `$x = ...`, `[string]$x = ...`, `$x=...`
      const m = /^[^=]*?=(?!=)([^]*)$/.exec(w[0]);
      if (m) { w = m[1] ? [m[1], ...w.slice(1)] : w.slice(1); continue; }
      if (PS_ASSIGN.test(w[1] || '')) { w = w.slice(2); continue; }
    }
    break;
  }
  if (!w.length) return { words: w };
  const prog = programName(w[0]);
  const rest = w.slice(1);
  if (prog === 'invoke-expression' || prog === 'iex') {
    let args = rest;
    if (args.length && /^-c(?:o(?:m(?:m(?:a(?:n(?:d)?)?)?)?)?)?(?::|$)/i.test(args[0])) { // -Command
      const attached = args[0].replace(/^-[a-z]+:?/i, '');
      args = attached ? [attached, ...args.slice(1)] : args.slice(1);
    }
    return { hit: findGuardedCommand(args.join(' '), depth + 1, 'ps') };
  }
  if (prog === 'start-process' || prog === 'saps' || prog === 'start') {
    const sp = startProcessWords(rest);
    return { hit: sp ? classifySimpleCommand(sp, depth + 1, 'ps') : null };
  }
  if (prog === 'cmd') {
    const k = rest.findIndex((a) => /^\/[ck]$/i.test(a));
    return { hit: k === -1 ? null : findGuardedCommand(rest.slice(k + 1).join(' '), depth + 1, 'bash') };
  }
  return { words: w };
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

// gh api: flags that take a separate value, and the ones that attach a request body (which makes
// gh POST when no method is given).
const API_VALUE_OPTS = new Set(['-X', '--method', '-H', '--header', '-f', '--raw-field', '-F', '--field', '-q', '--jq', '-t', '--template', '--hostname', '--cache', '-p', '--preview', '--input']);
const API_BODY_OPTS = new Set(['-f', '--raw-field', '-F', '--field', '--input']);
const GRAPHQL_REVIEW_MERGE = /\b(?:mergePullRequest|mergeBranch|enqueuePullRequest|enablePullRequestAutoMerge|addPullRequestReview|submitPullRequestReview)\b/;

// The arguments after `gh api`: 'gh api review' or 'gh api merge' for a write to a review or merge
// endpoint, else null. A GET with no body, and any other endpoint, is left alone.
function classifyGhApi(args) {
  let method = null;
  let body = false;
  let endpoint = null;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      const name = eq === -1 ? a : a.slice(0, eq);
      if (name === '--method') method = eq === -1 ? args[i + 1] : a.slice(eq + 1);
      if (API_BODY_OPTS.has(name)) body = true;
      if (eq === -1 && API_VALUE_OPTS.has(name)) i++;
    } else if (a.startsWith('-') && a.length > 1) {
      const flag = a.slice(0, 2);
      const attached = a.length > 2 ? a.slice(2) : null;
      if (flag === '-X') method = attached !== null ? attached.replace(/^=/, '') : args[i + 1];
      if (API_BODY_OPTS.has(flag)) body = true;
      if (attached === null && API_VALUE_OPTS.has(flag)) i++;
    } else if (endpoint === null) {
      endpoint = a;
    }
  }
  if (endpoint === null) return null;
  const verb = (method ? String(method) : body ? 'POST' : 'GET').toUpperCase();
  if (verb !== 'POST' && verb !== 'PUT') return null;
  const route = endpoint.replace(/^https?:\/\/[^/]+\//i, '').replace(/^\/+/, '').split(/[?#]/)[0].replace(/\/+$/, '').toLowerCase();
  if (route === 'graphql') {
    const m = GRAPHQL_REVIEW_MERGE.exec(args.join(' '));
    return m ? (/review/i.test(m[0]) ? 'gh api review' : 'gh api merge') : null;
  }
  if (/(^|\/)reviews(\/|$)/.test(route)) return 'gh api review';
  if (/(^|\/)pulls\/[^/]+\/merge$/.test(route) || /(^|\/)merges$/.test(route) || /(^|\/)ccr\/auto_merge$/.test(route)) return 'gh api merge';
  return null;
}

// What a simple command does, if it's one we guard: 'git push', 'gh pr create', 'gh pr ready',
// 'gh pr review', 'gh pr merge', 'gh api review', 'gh api merge'. `mode` is the shell that runs it:
// 'bash' (the Bash tool) or 'ps' (the PowerShell tool).
function classifySimpleCommand(words, depth, mode = 'bash') {
  if (depth > 8) return null;
  if (mode === 'ps') {
    const f = powerShellForms(words, depth);
    if (!f.words) return f.hit;
    words = f.words;
  }
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
    if (rest[j] === 'api') return classifyGhApi(rest.slice(j + 1));
    if (rest[j] !== 'pr') return null;
    j = skipOptions(rest, j + 1, GH_VALUE_OPTS);
    if (rest[j] === 'create' || rest[j] === 'new') return 'gh pr create';
    if (rest[j] === 'ready') return 'gh pr ready';
    if (rest[j] === 'review') return 'gh pr review';
    if (rest[j] === 'merge') return 'gh pr merge';
    return null;
  }
  // `bash -c "git push"`, `pwsh -Command "gh pr create"`: check the script they run. A PowerShell
  // script is read as PowerShell and, as before this parser existed, as Bash too: either finding counts.
  if (SHELLS.has(prog) || POWERSHELLS.has(prog)) {
    for (let k = 0; k < rest.length - 1; k++) {
      const flag = rest[k];
      const isCmdFlag = SHELLS.has(prog)
        ? /^-[a-z]*c[a-z]*$/.test(flag)
        : /^-(c|command|com|comm|comma|comman)$/i.test(flag);
      if (!isCmdFlag) continue;
      if (SHELLS.has(prog)) return findGuardedCommand(rest[k + 1], depth + 1, 'bash');
      const both = [findGuardedCommand(rest[k + 1], depth + 1, 'ps'), findGuardedCommand(rest[k + 1], depth + 1, 'bash')];
      return pickHit(both.filter(Boolean));
    }
  }
  return null;
}

// Plain text scan, used only when the parser met an unclosed quote, `$(` or backtick, or a heredoc
// delimiter that never appears: it may
// over-match, but never misses these spellings. A false hit on a login-dependent spelling (`git push`,
// `gh pr create`, `gh pr ready`) costs one `gh` call and blocks only under ABlueAI. A false hit on a
// review or merge spelling (`gh pr review`, `gh pr merge`, a `gh api` write to /reviews or /merge) blocks
// under EVERY login, with no `gh` call: a deliberate fail-closed trade-off for text the parser could not
// read, for example `git push && echo 'don't use gh pr merge`.
const RAW_PATTERNS = [
  [/\bgh(?:\.exe)?["']?\s[^\n;&|]*?\bpr\s+(?:create|new)\b/i, 'gh pr create'],
  [/\bgh(?:\.exe)?["']?\s[^\n;&|]*?\bpr\s+ready\b/i, 'gh pr ready'],
  [/\bgh(?:\.exe)?["']?\s[^\n;&|]*?\bpr\s+review\b/i, 'gh pr review'],
  [/\bgh(?:\.exe)?["']?\s[^\n;&|]*?\bpr\s+merge\b/i, 'gh pr merge'],
  [/\bgit(?:\.exe)?["']?\s[^\n;&|]*?\bpush\b/i, 'git push'],
];
// `gh api` writes in the raw scan: only when the same command line also shows a write (a POST or
// PUT method, or a body flag), so a read of /reviews is never blocked by a parsing gap.
const RAW_API = /\bgh(?:\.exe)?["']?\s[^\n;&|]*?\bapi\b[^\n;&|]*/gi;
const RAW_API_WRITE = /(?:-X|--method)[\s=]*["']?(?:POST|PUT)\b|\s(?:-f|-F|--field|--raw-field|--input)(?:[\s=]|\S)/i;
// Every guarded spelling the raw scan finds, in no particular order.
function rawScanAll(command) {
  const hits = [];
  for (const [re, name] of RAW_PATTERNS) if (re.test(command)) hits.push(name);
  for (const m of command.matchAll(RAW_API)) {
    const text = m[0];
    if (!RAW_API_WRITE.test(text)) continue;
    if (/\/reviews\b/i.test(text)) hits.push('gh api review');
    if (/\/(?:merge|merges|auto_merge)\b/i.test(text)) hits.push('gh api merge');
  }
  return hits;
}
// Several guarded commands can share one Bash call (`git push && gh pr merge 5`). A review or merge
// command wins over a login-dependent one, so an allowed `git push` under an agent login can never
// let a merge or review in the same call through; otherwise the first hit is returned.
function pickHit(hits) {
  return hits.find((h) => ALWAYS_BLOCKED.has(h)) || hits[0] || null;
}
function rawScan(command) {
  return pickHit(rawScanAll(command));
}

// The guarded command in a command line (a review or merge command first, else the first
// login-dependent one), or null. `mode` is 'bash' (the Bash tool) or 'ps' (the PowerShell tool).
// Never touches the network.
function findGuardedCommand(command, depth = 0, mode = 'bash') {
  if (depth > 8 || typeof command !== 'string') return null;
  const ctx = { unbalanced: false };
  const hits = [];
  const split = mode === 'ps' ? splitPowerShell : splitCommands;
  for (const words of split(command, depth, ctx)) {
    const hit = classifySimpleCommand(words, depth, mode);
    if (hit) hits.push(hit);
  }
  // When the parser met an unclosed quote the text scan also runs, even if the parse found a
  // login-dependent command, because a review or merge command may be hiding behind the quote.
  // For PowerShell, a backtick line continuation is joined first (`git `<newline>`push`).
  if (ctx.unbalanced) hits.push(...rawScanAll(mode === 'ps' ? command.replace(/`\r?\n/g, ' ') : command));
  return pickHit(hits);
}

// ---------------------------------------------------------------------------------------------
// Login check

// Finds gh in PATH's absolute entries only. A bare `gh` would make Windows look in the current
// directory first, so a gh.exe planted in a checkout could run; this never looks there.
function resolveGh(env = process.env) {
  const key = Object.keys(env).find((k) => k.toUpperCase() === 'PATH');
  const names = process.platform === 'win32' ? ['gh.exe'] : ['gh'];
  for (const entry of String((key && env[key]) || '').split(path.delimiter)) {
    const dir = entry.trim().replace(/^"(.*)"$/, '$1'); // Windows allows "C:\Program Files\..." entries
    if (!dir || !path.isAbsolute(dir)) continue;
    for (const name of names) {
      const full = path.join(dir, name);
      try { if (fs.statSync(full).isFile()) return full; } catch { /* not here */ }
    }
  }
  return null;
}

// Returns { login } or { error } (never throws). Runs gh with the session's own environment.
function readGhLogin() {
  const gh = resolveGh();
  if (!gh) return { error: 'gh is not installed or not on PATH' };
  try {
    const out = execFileSync(gh, ['api', 'user', '--jq', '.login'], {
      encoding: 'utf8',
      timeout: GH_TIMEOUT_MS,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const login = String(out).trim();
    if (!/^[A-Za-z0-9-]{1,39}(?:\[bot\])?$/.test(login)) return { error: 'gh returned no login' };
    return { login };
  } catch (err) {
    if (err && err.code === 'ENOENT') return { error: 'gh is not installed or not on PATH' };
    if (err && (err.code === 'ETIMEDOUT' || err.signal === 'SIGTERM')) {
      return { error: `gh did not answer within ${GH_TIMEOUT_MS / 1000} seconds` };
    }
    // An App installation token has no user: GET /user answers 403 "Resource not accessible by
    // integration". That is a known case (the token can't be ABlueAI's), not an unknown error.
    const detail = err && err.stderr ? String(err.stderr) : '';
    if (/resource not accessible by integration/i.test(detail)) {
      return { appToken: true, error: 'a GitHub App installation token has no user login' };
    }
    const status = err && typeof err.status === 'number' ? ` (exit ${err.status})` : '';
    return { error: `gh could not read the login${status}; it may not be logged in or offline` };
  }
}

// The tools whose commands are checked, and the shell each one runs them in. Both tools carry the
// script in tool_input.command (https://code.claude.com/docs/en/hooks, read 2026-11-23).
const TOOL_MODES = { Bash: 'bash', PowerShell: 'ps' };

// The verdict for one hook input. `getLogin` is injectable for tests.
// Returns { exitCode: 0 | 2, stderr?: string, systemMessage?: string, checked: boolean }.
function decide(input, getLogin = readGhLogin) {
  const toolName = input && input.tool_name;
  const command = input && input.tool_input && input.tool_input.command;
  const mode = TOOL_MODES[toolName];
  if (!mode || typeof command !== 'string') return { exitCode: 0, checked: false };

  const hit = findGuardedCommand(command, 0, mode);
  if (!hit) return { exitCode: 0, checked: false };

  // Review and merge commands are blocked under any login: no `gh` call, nothing to fail open on.
  if (ALWAYS_BLOCKED.has(hit)) {
    return { exitCode: 2, checked: false, stderr: `${NEVER_MESSAGE}\n(Command matched: ${hit}.)` };
  }

  const result = getLogin();
  if (result && result.appToken === true) {
    return {
      exitCode: 0,
      checked: true,
      systemMessage: `Account guard: this session uses a GitHub App installation token (no user login, so not ${BLOCKED_LOGIN}); \`${hit}\` allowed.`,
    };
  }
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

module.exports = {
  splitCommands, splitPowerShell, findGuardedCommand, rawScan, resolveGh, decide, readGhLogin,
  BLOCKED_LOGIN, BLOCK_MESSAGE, NEVER_MESSAGE, ALWAYS_BLOCKED,
};
