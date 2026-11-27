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
// #137). Review and merge calls are blocked under every login. Git pushes also check the
// destination and whether another author's open pull request uses the branch.
//
// What it does, in order:
//   1. Reads the hook input (JSON on stdin) and looks, anywhere in the command (chained
//      commands, subshells, command substitution and `bash -c "..."` included; for the PowerShell
//      tool, PowerShell's own syntax: `&` and `.` calls, backtick line continuations, script
//      blocks, `$(...)` groups, here-strings, `$x = ...` assignments, Invoke-Expression,
//      Start-Process and `cmd /c`; a command after `return`, `throw` or `exit`; and, on
//      top, the PowerShell word scan: a PowerShell script that names a guarded command's words
//      anywhere, in any order or case, gets the login check, fail-closed; see psWordScan), for
//        commands that require the login check: `gh pr create` (and its alias
//          `gh pr new`), `gh pr ready` and `git push`;
//        review and merge commands (blocked under any login, without asking gh who you are):
//          `gh pr review`, `gh pr merge`, and a `gh api` call that writes (an explicit
//          `-X`/`--method` POST or PUT, or any body flag `-f -F --field --raw-field --input`, which
//          make gh POST) to a `.../reviews` endpoint, to `.../pulls/N/merge`, to `.../merges` (the
//          branch-merge API) or to the cloud sessions' `.../ccr/auto_merge` route (auto-merge), or
//          a `gh api graphql` call that names a review or merge mutation. A read of those
//          endpoints is not matched here (.claude/settings.json denies `gh api` to them whatever
//          the method, which is stricter).
//      Anything else exits 0 straight away, without starting `gh` or touching the network.
//   2. For a login-dependent command only, runs `gh api user --jq .login` (same environment as the
//      session, so a Mako agent pane's GH_TOKEN and a cloud session's login are what it sees).
//      The login check uses gh's identity. Git can use a separate credential, so both logins
//      must be removed from Blue's PCs (checklist step 49).
//   3. Login `ABlueAI` (GitHub logins are case-insensitive): exit 2 with a message on stderr.
//      Claude Code blocks the tool call and shows Claude that message.
//      Any other login (`ABlueAgent` in cloud sessions, `mako-agents[bot]`, the GitHub App, in
//      local panes; any login ending in `[bot]` is accepted) passes the login check.
//      An App installation token has no user, so `gh api user` answers 403 "Resource not
//      accessible by integration" for it: that is not an unknown error. The token can't be
//      ABlueAI's, so it passes the login check with a one-line notice.
//      `gh` missing, not logged in, offline or slow: the existing login-only checks allow with a
//      one-line notice (`systemMessage` in JSON on stdout).
//   4. A review or merge command (above) exits 2 with its own message, whatever the login.
//
//   5. Pushes to main, force, deletion and bulk pushes, and pushes to branches used by another
//      author's open PR in the destination repository exit 2. Unverifiable push checks also exit 2,
//      under every login (account-guard-push.js), and so does a push the hook can't read: one found
//      only by the text scan, a git call whose subcommand is a variable, or a PowerShell word-scan push
//      next to a form that runs text or a program (iex, Start-Process, a nested shell, the call
//      operator on a string or variable); a word-scan push with none of those is allowed with a notice;
//      a push after a directory change other than a leading `cd <dir> &&` (or `Set-Location <dir>;`),
//      which the hook follows; and a push whose command sets environment variables that change what
//      git reads (GIT_DIR, GIT_CONFIG_*, HOME and so on). A destination is checked under every name
//      git could give it (`heads/main`, `@`, a remote.<name>.push or push.default=upstream mapping).
//      Redirections (`> file`, `2>&1`) are never read as push arguments.
//   6. One work budget covers input, nested parsing and subprocess checks. Exhaustion or an internal
//      error exits 2 with a reason on stderr.
//
// settings.json leaves `onFailure` unset, so in exec form a hook that can't start
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
// login): scripts that build commands from output, wrappers that take unrecognized options
// (`timeout 60 git push` hides the push), a Bash `git $x` whose subcommand is a variable (PowerShell's
// word scan refuses that form),
// `pwsh -EncodedCommand`, `pwsh -File` and a script piped into
// pwsh's standard input, in PowerShell a guarded command whose words appear only as fragments
// (`'g' + 'it'`, `[char]103`, base64; whole words held in a variable or an array, as in `gh @a`,
// are found by the word scan, but get only the login check, so a review or merge command found
// that way alone is not blocked under an agent login), scripts or npm scripts that push, merge or review,
// `gh api` calls that create PRs, `gh api` whose endpoint or method comes from a shell variable or a
// file (`gh api "$URL"`, `--input` bodies are matched by the flag, not their content), `gh api`
// reached through an alias or `gh -R x api` with other global options, a GraphQL mutation read from
// a file (`-F query=@mutation.graphql`), `curl` or SDK calls to
// api.github.com with a token, and tools other than Bash and PowerShell (GitHub MCP tools:
// .claude/settings.json denies the ones whose names were checked; its deny rules are written for
// the Bash tool, issue #219). A process running as
// Blue's Windows user can still use his stored logins, which is why he removes them after
// checklist step 35 (BLUE-CHECKLIST.md step 49). Review and merge calls are guarded only as far as
// this hook sees them: the real gate is that `main` needs Blue's approval, and the merge audit
// (.github/workflows/merge-audit.yml) alerts when an agent approved a PR that Blue authored.

const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { checkPushes, PushRefusal } = require('./account-guard-push.js');

const BLOCKED_LOGIN = 'ABlueAI';
const GH_TIMEOUT_MS = 10000;
const HOOK_WORK_MS = 20000;
const MAX_INPUT_BYTES = 2 * 1024 * 1024;
const MAX_DEPTH = 8;
const MAX_WORK = 1500000;
const BLOCK_PREFIX = "Blocked by Mako's account guard (.claude/hooks/account-guard.js):";

class ScanLimit extends Error {}

function scanWork() {
  return {
    remaining: MAX_WORK, deadline: performance.now() + HOOK_WORK_MS,
    depths: new WeakMap(), pipelineInputs: new WeakMap(), pushes: [],
    // Push facts decide() checks after the login: directory changes seen anywhere in the command; a
    // push found only by the text or word scan, or a git call whose subcommand is a variable; a push
    // whose own environment assignments could change what git reads.
    dirChanges: 0, unreadPush: false, wordScanPush: false, dynamicGit: false, pushEnv: false,
  };
}

function charge(work, size = 1) {
  work.remaining -= size;
  if (work.remaining < 0 || performance.now() >= work.deadline) {
    throw new ScanLimit('the hook reached its work budget');
  }
}

function scanContext(work = scanWork()) {
  return { work, unbalanced: false };
}

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
  'sudo', 'builtin', 'nohup', 'time', 'nice', 'then', 'do', 'else', 'elif',
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
      charge(ctx.work, lineEnd - pos + 1);
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
  charge(ctx.work, body.length);
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
  let nextCharge = open;
  for (let i = open; i < s.length; i++) {
    if (i >= nextCharge) { charge(ctx.work, 256); nextCharge = i + 256; }
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
function splitCommands(input, depth = 0, ctx = scanContext()) {
  const commands = [];
  if (typeof input !== 'string') return commands;
  if (depth > MAX_DEPTH) { ctx.unbalanced = true; return commands; }
  charge(ctx.work, input.length + 1);
  let pending = []; // heredocs whose bodies start after the next newline
  let words = [];
  let word = null; // null = no word started
  // The next word is a redirection's target (`> out.log`, `2>&1`, `<<< "$x"`): a file name, a file
  // descriptor or data, never an argument of the command (a push's destination included).
  let dropNext = false;
  const endWord = () => {
    if (word === null) return;
    if (dropNext) dropNext = false;
    else words.push(word);
    word = null;
  };
  const endCommand = () => {
    endWord();
    dropNext = false;
    if (words.length) { ctx.work.depths.set(words, depth); commands.push(words); }
    words = [];
  };
  // At a redirection operator (index at): a file descriptor number written right before it (`2>`) is
  // part of the operator. Returns the index of the operator's last character.
  const redirect = (at) => {
    if (word !== null && /^\d+$/.test(word)) word = null;
    else endWord();
    let j = at;
    if (s[j] === '&') j++; // &> and &>>
    const op = s[j++];
    if (op === '>' && (s[j] === '>' || s[j] === '|' || s[j] === '&')) j++; // >> >| >&
    else if (op === '<' && (s[j] === '>' || s[j] === '&')) j++; // <> <&
    dropNext = true;
    return j - 1;
  };
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
    if (c === '<' || c === '>' || (c === '&' && s[i + 1] === '>')) {
      if (c === '<' && s[i + 1] === '<') {
        if (s[i + 2] === '<') { endWord(); dropNext = true; i += 2; continue; } // here-string: its word is data
        const h = readHeredoc(s, i);
        if (h) { endWord(); pending.push(h); i = h.end - 1; continue; }
      }
      if (c !== '&' && s[i + 1] === '(') { endWord(); continue; } // process substitution: `(` splits it out
      i = redirect(i);
      continue;
    }
    if (SEPARATORS.has(c)) { endCommand(); continue; }
    if (c === ' ' || c === '\t') { endWord(); continue; }
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
// Separates the elements of an array argument (`'pr', 'merge'`) inside one word. PowerShell passes
// each element to a native program as an argument of its own, so classifySimpleCommand splits on it.
const PS_ARRAY_SEP = '\u001F';
const flattenArrays = (words) => words.flatMap((w) => (w.includes(PS_ARRAY_SEP) ? w.split(PS_ARRAY_SEP).filter(Boolean) : [w]));
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
// The closing quote and `@` must start a line, as in PowerShell (about_Quoting_Rules): an indented
// one is body text. An indented one still marks ctx.unbalanced, so the text scan also runs in case
// a PowerShell version reads it differently. A here-string that never closes marks ctx.unbalanced.
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
    if (isOneOf(quotes, s[lineStart]) && s[lineStart + 1] === '@') {
      const body = s.slice(bodyStart, Math.max(bodyStart, lineStart - 1)).replace(/\r$/, '');
      return { body, end: lineStart + 1, expandable };
    }
    let k = lineStart;
    while (s[k] === ' ' || s[k] === '\t') k++;
    if (k > lineStart && isOneOf(quotes, s[k]) && s[k + 1] === '@') ctx.unbalanced = true;
    const next = s.indexOf('\n', pos);
    charge(ctx.work, (next === -1 ? s.length : next + 1) - pos);
    if (next === -1) break;
    pos = next + 1;
  }
  ctx.unbalanced = true;
  return { body: s.slice(bodyStart), end: s.length, expandable };
}

// The `$(...)` groups an expandable here-string body runs (a backtick escapes the `$`).
function psBodySubstitutions(body, ctx) {
  charge(ctx.work, body.length);
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
  let nextCharge = open;
  for (let i = open; i < s.length; i++) {
    if (i >= nextCharge) { charge(ctx.work, 256); nextCharge = i + 256; }
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
// A group in argument position (`-ArgumentList @('pr','create')`, `& 'gh' @('pr','merge')`) also stays
// in its word, so Start-Process, Invoke-Expression and the program it is passed to can read it: as the
// group's one word when it holds a single value (an array's elements kept apart by PS_ARRAY_SEP, so a
// native program gets them as separate arguments), else as raw text. Its commands are checked either way.
// An array of strings is read as a command wherever it appears (`Write-Output @('gh', 'pr', 'merge')`
// included): the splitter doesn't try to tell a printed value from a run one (fails closed).
function splitPowerShell(input, depth = 0, ctx = scanContext()) {
  const commands = [];
  if (typeof input !== 'string') return commands;
  if (depth > MAX_DEPTH) { ctx.unbalanced = true; return commands; }
  charge(ctx.work, input.length + 1);
  let words = [];
  let word = null;
  let pipeInput = null;
  let startsWithLiteral = false;
  let dropNext = false; // the next word is a redirection's file (`> out.txt`, `2> $null`), not an argument
  const endWord = () => {
    if (word === null) return;
    if (dropNext) dropNext = false;
    else words.push(word);
    word = null;
  };
  const endCommand = (separator) => {
    endWord();
    dropNext = false;
    if (words.length) {
      ctx.work.depths.set(words, depth);
      if (pipeInput !== null) ctx.work.pipelineInputs.set(words, pipeInput);
      commands.push(words);
    }
    if (separator === '|' && words.length === 1 && startsWithLiteral) pipeInput = words[0];
    else if (separator === '|' && words.length === 2 && /^write-output$/i.test(words[0])) pipeInput = words[1];
    else if (words.length || (separator !== '\n' && separator !== '\r')) pipeInput = null;
    startsWithLiteral = false;
    words = [];
  };
  const split = (text) => splitPowerShell(text, depth + 1, ctx);
  const sub = (text) => { for (const c of split(text)) commands.push(c); };

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
      if (!words.length && word === null) startsWithLiteral = true;
      const end = psStringEnd(s, i, ctx);
      word = (word || '') + s.slice(i + 1, end).replace(/['‘’‚‛]{2}/g, "'");
      i = end;
      continue;
    }
    if (isOneOf(PS_DOUBLE, c)) {
      if (!words.length && word === null) startsWithLiteral = true;
      const end = psStringEnd(s, i, ctx, sub);
      let value = s.slice(i + 1, end);
      const firstSub = value.indexOf('$(');
      const lastClose = value.lastIndexOf(')');
      if (firstSub !== -1 && lastClose > firstSub) value = value.slice(0, firstSub) + '$()' + value.slice(lastClose + 1);
      word = (word || '') + value
        .replace(/`([^])/g, '$1')
        .replace(/["“”„]{2}/g, '"');
      i = end;
      continue;
    }
    if (c === '@') {
      const h = psHereString(s, i, ctx);
      if (h) {
        if (!words.length && word === null) startsWithLiteral = true;
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
      const innerCommands = split(inner);
      for (const cmd of innerCommands) commands.push(cmd);
      if (word !== null || words.length) { // an argument: keep its value, or else its text
        const single = innerCommands.length === 1 && innerCommands[0].length === 1;
        word = (word || '') + (single ? innerCommands[0][0] : inner);
      }
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
    if (c === ',') {
      // `'pr', 'merge', '5'` is one array argument, even across spaces, lines and comments; its
      // elements are kept apart by PS_ARRAY_SEP. After a bare parameter name (`-ArgumentList ,'x'`,
      // not `-ArgumentList:'x' , 'y'`, whose value is attached) or with nothing before it, the comma
      // is the unary array operator and starts a new argument.
      if (word !== null) word += PS_ARRAY_SEP;
      else if (words.length && !/^-[A-Za-z][^:]*$/.test(words[words.length - 1])) word = words.pop() + PS_ARRAY_SEP;
      else word = PS_ARRAY_SEP;
      for (;;) { // skip spaces, line breaks, backtick line continuations and comments after it
        const j = i + 1;
        const ws = /^(?:\s+|`\r?\n)/.exec(s.slice(j, j + 66));
        if (ws) { i += ws[0].length; continue; }
        if (s[j] === '#') { const nl = s.indexOf('\n', j); i = (nl === -1 ? s.length : nl) - 1; continue; }
        if (s[j] === '<' && s[j + 1] === '#') {
          const close = s.indexOf('#>', j + 2);
          if (close === -1) { ctx.unbalanced = true; i = s.length - 1; break; }
          i = close + 1;
          continue;
        }
        break;
      }
      continue;
    }
    if (PS_SEPARATORS.has(c)) { endCommand(c); continue; }
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
    if (c === '>') { // redirection (about_Redirection): `>`, `>>`, `2>`, `*>`, and `2>&1`, which has no file
      if (word !== null && /^[1-6*]$/.test(word)) word = null;
      else endWord();
      let j = i + 1;
      if (s[j] === '>') j++;
      if (s[j] === '&' && /^[1-6]$/.test(s[j + 1] || '')) { i = j + 1; continue; }
      dropNext = true;
      i = j - 1;
      continue;
    }
    if (c === '<') { endWord(); continue; }
    word = (word || '') + c;
  }
  endCommand();
  return commands;
}

// PowerShell statement keywords that take a pipeline: the command is what follows them.
const PS_STATEMENT_KEYWORDS = new Set(['return', 'throw', 'exit']);
// PowerShell assignment operators (`$x = gh pr create`): the command is what comes after.
const PS_VARIABLE = /^(?:\[[^\]]*\])*\$/;
const PS_ASSIGN = /^(?:[-+*/%]|\?\?)?=(?!=)([^]*)$/;
// Common parameters accepted by Invoke-Expression in addition to its Command parameter.
const IEX_VALUE_OPTS = new Set(['erroraction', 'ea', 'warningaction', 'wa', 'informationaction', 'infa',
  'progressaction', 'proga', 'errorvariable', 'ev', 'warningvariable', 'wv', 'informationvariable',
  'iv', 'outvariable', 'ov', 'outbuffer', 'ob', 'pipelinevariable', 'pv']);
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
      if (!value && !isSwitch) value = args[++i];
      if (['filepath', 'path', 'pspath'].some((p) => p.startsWith(name))) file = value;
      else if (['argumentlist', 'args'].some((p) => p.startsWith(name))) list = value;
      continue;
    }
    positional.push(a);
  }
  if (file == null) file = positional.shift();
  if (list == null) list = positional.shift();
  if (file == null) return null;
  // Start-Process joins its argument list into a native argument string. Double quotes in that
  // string keep a shell's script together as one argument. PowerShell array elements join with spaces.
  return [file, ...nativeArguments(list || '')];
}

function nativeArguments(line) {
  const words = [];
  let value = null;
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (!quoted && /[\s\u001F]/.test(c)) {
      if (value !== null) words.push(value);
      value = null;
      continue;
    }
    value ??= '';
    if (c === '\\') {
      let end = i + 1;
      while (line[end] === '\\') end++;
      const count = end - i;
      if (line[end] === '"') {
        value += '\\'.repeat(Math.floor(count / 2));
        if (count % 2) { value += '"'; end++; }
      } else value += '\\'.repeat(count);
      i = end - 1;
    } else if (c === '"') quoted = !quoted;
    else value += c === PS_ARRAY_SEP ? ' ' : c;
  }
  if (value !== null) words.push(value);
  return words;
}

function expressionScript(args, pipeline) {
  for (let i = 0; i < args.length; i++) {
    const m = /^-([a-z]+)(?::([^]*))?$/i.exec(args[i]);
    if (!m) return flattenArrays(args.slice(i)).join(' ');
    const name = m[1].toLowerCase();
    if ('command'.startsWith(name)) return m[2] || flattenArrays(args.slice(i + 1)).join(' ');
    if (m[2] === undefined && IEX_VALUE_OPTS.has(name)) i++;
  }
  return pipeline || '';
}

// The PowerShell-only forms of a simple command: drops a leading `.` (dot-source) and assignments,
// and reads Invoke-Expression, Start-Process and `cmd /c`. Returns { words } to classify as usual,
// or { hit } when the command was one of the forms that run another command.
function powerShellForms(words, depth, work) {
  let i = 0;
  let attached = '';
  for (; i < words.length; i++) {
    if (words[i] === '.') continue;
    // `return git push`, `throw gh pr merge 5`, `exit git push`: these keywords take a pipeline, so
    // the command starts after them. They are dropped here, like `.`, so each statement is still
    // classified once: classifying it a second time from a later word (review run 8) doubled the
    // nested work at every level of `pwsh -c` or iex and could run the hook past its timeout.
    if (PS_STATEMENT_KEYWORDS.has(words[i].toLowerCase())) continue;
    if (PS_VARIABLE.test(words[i])) {
      const assignment = /^[^=]*=(?!=)([^]*)$/.exec(words[i]);
      const separate = assignment ? null : PS_ASSIGN.exec(words[i + 1] || '');
      if (assignment || separate) {
        if (separate) i++;
        attached = (assignment || separate)[1];
        if (!attached) continue;
        i++;
      }
    }
    break;
  }
  const w = attached ? [attached, ...words.slice(i)] : words.slice(i);
  if (!w.length) return { words: w };
  const prog = programName(w[0]);
  const rest = w.slice(1);
  if (prog === 'invoke-expression' || prog === 'iex') {
    const script = expressionScript(rest, work.pipelineInputs.get(words));
    return { hit: script ? scanCommand(script, depth + 1, 'ps', work) : null };
  }
  if (prog === 'start-process' || prog === 'saps' || prog === 'start') {
    const sp = startProcessWords(rest);
    return { hit: sp ? classifySimpleCommand(sp, depth + 1, 'ps', work) : null };
  }
  if (prog === 'cmd') {
    const k = rest.findIndex((a) => /^\/[ck]/i.test(a));
    if (k === -1) return { hit: null };
    const script = [rest[k].slice(2), ...flattenArrays(rest.slice(k + 1))].join(' ').trimStart();
    return { hit: script ? scanCommand(script, depth + 1, 'bash', work) : null };
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
const GRAPHQL_MUTATIONS = ['mergePullRequest', 'mergeBranch', 'enqueuePullRequest', 'enablePullRequestAutoMerge',
  'addPullRequestReview', 'submitPullRequestReview', 'dismissPullRequestReview'];
const GRAPHQL_REVIEW_MERGE = new RegExp(`\\b(?:${GRAPHQL_MUTATIONS.join('|')})\\b`);

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
      for (let j = 1; j < a.length; j++) {
        const flag = `-${a[j]}`;
        if (!API_VALUE_OPTS.has(flag)) continue;
        const value = j + 1 === a.length ? args[++i] : a.slice(j + 1).replace(/^=/, '');
        if (flag === '-X') method = value;
        if (API_BODY_OPTS.has(flag)) body = true;
        break; // the first value-taking short flag consumes the rest of the group
      }
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
const ENV_VALUE_OPTS = new Set(['-u', '--unset', '-C', '--chdir', '-a', '--argv0', '-S', '--split-string']);
const XARGS_VALUE_OPTS = new Set(['-a', '-d', '-E', '-I', '-L', '-n', '-P', '-s', '--arg-file', '--delimiter',
  '--eof', '--replace', '--max-lines', '--max-args', '--max-procs', '--max-chars', '--process-slot-var']);
const WSL_VALUE_OPTS = new Set(['-d', '--distribution', '-u', '--user', '--cd']);
// Commands that change the working directory (Bash, cmd and PowerShell, aliases included).
// `cd..`, `cd\` and `cd~` are PowerShell's built-in shortcut functions for a directory change.
const DIR_COMMANDS = new Set(['cd', 'cd..', 'cd\\', 'cd~', 'chdir', 'pushd', 'popd', 'set-location', 'sl',
  'push-location', 'pop-location']);
// Environment assignments on a push's own command that can't change which repository, config or
// remote git reads. Any other one (GIT_DIR, GIT_CONFIG_*, HOME and so on) makes decide refuse.
const SAFE_PUSH_ENV = /^(?:GIT_TRACE\w*|GIT_TERMINAL_PROMPT|GIT_PROGRESS_DELAY|GIT_REDACT_COOKIES|GIT_CURL_VERBOSE|GIT_SSH_COMMAND|GIT_SSH|GIT_ASKPASS|GH_\w+|LANG|LC_\w+)$/;

function wrappedCommand(words, start, valueOptions, onValue) {
  let i = start;
  for (; i < words.length; i++) {
    const word = words[i];
    if (word === '--') return i + 1;
    if (word === '-' && valueOptions === ENV_VALUE_OPTS) continue;
    if (!word.startsWith('-') || word === '-') break;
    if (word.startsWith('--')) {
      const eq = word.indexOf('=');
      const flag = eq < 0 ? word : word.slice(0, eq);
      if (valueOptions.has(flag)) {
        const value = eq < 0 ? words[++i] : word.slice(eq + 1);
        onValue?.(flag, value);
      }
    } else {
      // A value-taking flag can also appear last in a short option group.
      for (let j = 1; j < word.length; j++) {
        const flag = `-${word[j]}`;
        if (!valueOptions.has(flag)) continue;
        const value = j === word.length - 1 ? words[++i] : word.slice(j + 1);
        onValue?.(flag, value);
        break;
      }
    }
  }
  return i;
}

function classifySimpleCommand(words, depth, mode, work) {
  if (depth > MAX_DEPTH) throw new ScanLimit('the command exceeded the supported shell nesting depth');
  charge(work, words.length + 1);
  if (mode === 'ps') {
    const f = powerShellForms(words, depth, work);
    if (!f.words) return f.hit;
    words = flattenArrays(f.words);
  }
  let i = 0;
  const assigned = [];
  // Leading `VAR=value` assignments, wrappers like sudo, and `env [-opts] [VAR=value]`.
  for (;;) {
    if (i >= words.length) return null;
    const w = words[i];
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(w)) { assigned.push(w.slice(0, w.indexOf('='))); i++; continue; }
    if (PREFIX_WORDS.has(w)) { i++; continue; }
    const prog = programName(w);
    if (prog === 'env' || prog === 'xargs') {
      let splitString;
      i = wrappedCommand(words, i + 1, prog === 'env' ? ENV_VALUE_OPTS : XARGS_VALUE_OPTS, (flag, value) => {
        if (flag === '-S' || flag === '--split-string') splitString = value;
        if (prog === 'env' && (flag === '-C' || flag === '--chdir')) work.dirChanges++;
      });
      if (splitString) {
        const ctx = scanContext(work);
        const [args] = splitCommands(splitString, depth + 1, ctx);
        if (args) return classifySimpleCommand([...args, ...words.slice(i)], depth + 1, 'bash', work);
      }
      continue;
    }
    if (prog === 'command' || prog === 'exec') {
      i++;
      for (; i < words.length && words[i].startsWith('-'); i++) {
        if (words[i] === '--') { i++; break; }
        if (prog === 'command' && /^-[pvV]*[vV]/.test(words[i])) return null;
        if (prog === 'exec' && /^-[cl]*a$/.test(words[i])) i++;
      }
      continue;
    }
    break;
  }
  const prog = programName(words[i]);
  const rest = words.slice(i + 1);

  // A directory change: a push later in the same command may run somewhere else (decide checks it).
  if (DIR_COMMANDS.has(prog)) { work.dirChanges++; return null; }
  if (prog === 'wsl') {
    let j = 0;
    while (j < rest.length && rest[j].startsWith('-')) {
      if (['--', '-e', '--exec'].includes(rest[j])) { j++; break; }
      const flag = rest[j];
      if (!WSL_VALUE_OPTS.has(flag.split('=')[0])) return null;
      j += flag.includes('=') ? 1 : 2;
    }
    return classifySimpleCommand(rest.slice(j), depth + 1, 'bash', work);
  }
  if (prog === 'eval' && mode === 'bash') {
    const script = rest.slice(rest[0] === '--' ? 1 : 0).join(' ');
    return scanCommand(script, depth + 1, 'bash', work);
  }
  if (prog === 'cmd' && mode === 'bash') {
    const k = rest.findIndex((arg) => /^\/[ck]/i.test(arg));
    if (k === -1) return null;
    return scanCommand([rest[k].slice(2), ...rest.slice(k + 1)].join(' ').trimStart(), depth + 1, 'bash', work);
  }
  if (prog === 'git') {
    const j = skipOptions(rest, 0, GIT_VALUE_OPTS);
    if (j < rest.length && /[$@`]/.test(rest[j])) work.dynamicGit = true;
    if (rest[j] !== 'push') return null;
    const globalArgs = rest.slice(0, j);
    if (assigned.some((name) => !SAFE_PUSH_ENV.test(name)) || globalArgs.some((a) => a.startsWith('--config-env'))) work.pushEnv = true;
    work.pushes.push({ globalArgs, args: rest.slice(j + 1) });
    return 'git push';
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
  // `bash -c "git push"`, `pwsh -Command "gh pr create"`: check the script they run. PowerShell's
  // -Command takes every argument after it as the command (`pwsh -c git push origin x`), and the
  // script is read as PowerShell and, as before this parser existed, as Bash too: either finding counts.
  if (SHELLS.has(prog) || POWERSHELLS.has(prog)) {
    for (let k = 0; k < rest.length - 1; k++) {
      const flag = rest[k];
      const withArgs = POWERSHELLS.has(prog) && /^-(?:cwa|commandwithargs)$/i.test(flag);
      const isCmdFlag = SHELLS.has(prog)
        ? /^-[a-z]*c[a-z]*$/.test(flag)
        : withArgs || /^-(c|command|co|com|comm|comma|comman)$/i.test(flag);
      if (!isCmdFlag) continue;
      if (SHELLS.has(prog)) return scanCommand(rest[k + 1], depth + 1, 'bash', work);
      const script = withArgs ? rest[k + 1] : rest.slice(k + 1).join(' ');
      const psHit = scanCommand(script, depth + 1, 'ps', work);
      if (ALWAYS_BLOCKED.has(psHit)) return psHit;
      return pickHit([psHit, scanCommand(script, depth + 1, 'bash', work)].filter(Boolean));
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
// Every guarded spelling the raw scan finds, in no particular order.
function rawScanAll(command, work) {
  charge(work, command.length);
  const hits = [];
  for (const segment of command.split(/[\r\n;&|]/)) {
    for (const match of segment.matchAll(/\b(gh|git)(?:\.exe)?["']?[ \t]+/gi)) {
      const start = match.index + match[0].length;
      charge(work, segment.length - start + 1);
      const args = segment.slice(start);
      if (match[1].toLowerCase() === 'git') {
        if (/\bpush\b/i.test(args)) {
          const before = work.pushes.length;
          const [rawWords] = splitCommands(args, 0, scanContext(work));
          if (rawWords) classifySimpleCommand(['git', ...rawWords], 0, 'bash', work);
          if (work.pushes.length === before) work.unreadPush = true;
          hits.push('git push');
        }
        continue;
      }
      for (const pr of args.matchAll(/\bpr\s+(create|new|ready|review|merge)\b/gi)) {
        const sub = pr[1].toLowerCase();
        hits.push(`gh pr ${sub === 'new' ? 'create' : sub}`);
      }
      const api = /\bapi\s+/i.exec(args);
      if (api) {
        const [apiArgs] = splitCommands(args.slice(api.index + api[0].length), 0, scanContext(work));
        const hit = apiArgs && classifyGhApi(apiArgs);
        if (hit) hits.push(hit);
      }
    }
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
  return pickHit(rawScanAll(command, scanWork()));
}

// ---------------------------------------------------------------------------------------------
// The PowerShell word scan (Blue, 2026-11-24: "Yes, run 8 fail-closed")
//
// PowerShell can run a command from more places than a splitter can follow (after a keyword other
// than `return`, `throw` or `exit`, from an array, a variable or a string handed to Invoke-Expression, past a line
// ending the splitter reads differently). So a PowerShell script that names a guarded command's words
// anywhere, in any order and any case, gets the login check: quoted or not, in an array, a comment, a
// here-string or a script block, across lines or behind backticks. The scan doesn't try to work out
// what the script runs. Under ABlueAI that blocks; under any other login gh answers and the script
// runs. Its hits are named apart (PS_WORDS_NOTE), so even a review or merge command's words only get
// the login check; a review or merge command the splitter itself finds is still blocked under every
// login without asking gh.
//
// A word is a run of letters, digits, `_`, `.` and `-`, lower-cased, with trailing dots and `.exe`
// dropped (paths split at `\`, `/` and `:`, so `C:\x\gh.exe` holds `gh`). The text is read twice, so
// that neither escapes nor quotes can split or join a word unseen: (1) every backtick escape (and
// `` `u{...} ``) is a break, so `"x`ngh"` holds `gh`; (2) `` `u{...} `` is decoded and backticks,
// quotes, `^` and `\` are removed, so ``g`it``, `g''it`, `g^it` (cmd) and `g\it` (bash) are `git`.
// Every pattern is a single character class or a fixed escape, so the scan is linear in the text.
const PS_WORDS_NOTE = ' (its words appear in the PowerShell script)';
const PS_WORD = /[A-Za-z0-9_.-]+/g;
const PS_ESCAPE = /`(?:u\{[0-9A-Fa-f]{1,6}\}|[^])/g;
const PS_UNICODE_ESCAPE = /`u\{([0-9A-Fa-f]{1,6})\}/g;
const PS_JOINERS = /[`'"‘’‚‛“”„^\\]/g;
const GRAPHQL_REVIEW_MERGE_WORDS = GRAPHQL_MUTATIONS.map((name) => name.toLowerCase());
// Lower-cased, trailing dots and then `.exe` dropped. The dots are dropped by a loop, not a regex: an
// anchored `\.+$` retries from every dot and took seconds on a long run of them (review run 8).
function psWordName(token) {
  let end = token.length;
  while (end > 0 && token[end - 1] === '.') end--;
  return token.slice(0, end).toLowerCase().replace(/\.exe$/, '');
}
function psWords(text) {
  const words = new Set();
  const add = (t) => { for (const m of t.matchAll(PS_WORD)) words.add(psWordName(m[0])); };
  add(text.replace(PS_ESCAPE, ' '));
  // PowerShell drops a backtick inside a bare word (`git-pu\`sh`), so the words are also read without them.
  add(text.replace(/`/g, ''));
  add(text.replace(PS_UNICODE_ESCAPE, (m, hex) => {
    const n = parseInt(hex, 16);
    return n <= 0x10ffff ? String.fromCodePoint(n) : ' ';
  }).replace(PS_JOINERS, ''));
  return words;
}
// The guarded commands whose words a PowerShell script names, each with PS_WORDS_NOTE.
function psWordScan(text) {
  const w = psWords(text);
  const hits = [];
  // `git-push` is git's own push program (Git for Windows ships it under libexec\git-core).
  if ((w.has('git') && w.has('push')) || w.has('git-push')) hits.push('git push');
  if (w.has('gh') && w.has('pr')) {
    if (w.has('create') || w.has('new')) hits.push('gh pr create');
    if (w.has('ready')) hits.push('gh pr ready');
    if (w.has('review')) hits.push('gh pr review');
    if (w.has('merge')) hits.push('gh pr merge');
  }
  // `gh api` writes (a POST or PUT, or a body flag, including attached forms such as `-XPOST` and
  // `-fevent=x`) to a review or merge endpoint or with a review or merge mutation; a plain read is left alone.
  if (w.has('gh') && w.has('api')) {
    const write = [...w].some((x) => x === 'post' || x === 'put' || /^-(?:f|xpost$|xput$)|^--(?:field|raw-field|input)$/.test(x));
    const mutation = GRAPHQL_REVIEW_MERGE_WORDS.filter((m) => w.has(m));
    if (write && (w.has('reviews') || mutation.some((m) => m.includes('review')))) hits.push('gh api review');
    if (write && (w.has('merge') || w.has('merges') || w.has('auto_merge') || mutation.some((m) => !m.includes('review')))) hits.push('gh api merge');
  }
  return hits.map((h) => h + PS_WORDS_NOTE);
}

// The guarded command in a command line (a review or merge command first, else the first
// login-dependent one), or null. `mode` is 'bash' (the Bash tool) or 'ps' (the PowerShell tool).
// Never touches the network.
function scanCommand(command, depth, mode, work) {
  if (typeof command !== 'string') return null;
  if (depth > MAX_DEPTH) throw new ScanLimit('the command exceeded the supported shell nesting depth');
  const ctx = scanContext(work);
  const hits = [];
  const split = mode === 'ps' ? splitPowerShell : splitCommands;
  for (const words of split(command, depth, ctx)) {
    const hit = classifySimpleCommand(words, work.depths.get(words), mode, work);
    if (hit) hits.push(hit);
    if (ALWAYS_BLOCKED.has(hit)) return hit;
  }
  // When the parser met an unclosed quote the text scan also runs, even if the parse found a
  // login-dependent command, because a review or merge command may be hiding behind the quote.
  // For PowerShell, a backtick line continuation is joined first (`git `<newline>`push`).
  if (ctx.unbalanced) {
    for (const hit of rawScanAll(mode === 'ps' ? command.replace(/`\r?\n/g, ' ') : command, work)) hits.push(hit);
  }
  // PowerShell, fail-closed: the words of a guarded command anywhere in the script (psWordScan) get the
  // login check, after every hit above, so a review or merge command found above still wins.
  if (mode === 'ps') {
    charge(work, 2 * command.length);
    const words = psWordScan(command);
    if (words.includes('git push' + PS_WORDS_NOTE)) work.wordScanPush = true;
    hits.push(...words);
  }
  return pickHit(hits);
}

function findGuardedCommand(command, depth = 0, mode = 'bash') {
  try {
    return scanCommand(command, depth, mode, scanWork());
  } catch (err) {
    if (err instanceof ScanLimit) return 'command scan limit';
    throw err;
  }
}

// ---------------------------------------------------------------------------------------------
// Login check

// Finds gh in PATH's absolute entries only. A bare `gh` would make Windows look in the current
// directory first, so a gh.exe planted in a checkout could run; this never looks there.
function resolveProgram(program, env) {
  const key = Object.keys(env).find((k) => k.toUpperCase() === 'PATH');
  const name = process.platform === 'win32' ? `${program}.exe` : program;
  for (const entry of String((key && env[key]) || '').split(path.delimiter)) {
    const dir = entry.trim().replace(/^"(.*)"$/, '$1'); // Windows allows "C:\Program Files\..." entries
    if (!dir || !path.isAbsolute(dir)) continue;
    const full = path.join(dir, name);
    try {
      if (fs.statSync(full).isFile()) return full;
    } catch (err) {
      if (err.code !== 'ENOENT' && err.code !== 'ENOTDIR') throw err;
    }
  }
  return null;
}

function resolveGh(env = process.env) {
  return resolveProgram('gh', env);
}

function runCheck(executable, args, work, cwd) {
  charge(work);
  const timeout = Math.max(1, Math.min(GH_TIMEOUT_MS, Math.floor(work.deadline - performance.now())));
  try {
    return execFileSync(executable, args, {
      cwd, encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
      timeout, killSignal: 'SIGKILL', maxBuffer: MAX_INPUT_BYTES,
    });
  } catch (err) {
    if (err && typeof err === 'object') err.timeoutMs = timeout;
    throw err;
  }
}

const timedOut = (err) => Boolean(err && (err.code === 'ETIMEDOUT' || err.signal === 'SIGKILL'));
const seconds = (ms) => `${Math.round((ms ?? GH_TIMEOUT_MS) / 100) / 10} seconds`;

// One line of a subprocess's stderr, safe to show: token-like strings and URL credentials masked,
// non-printing characters replaced, at most 120 characters.
function stderrLine(text) {
  const line = String(text || '').split(/\r?\n/).find((l) => l.trim()) || '';
  return line
    .replace(/\b(?:gh[pousr]_|github_pat_)[A-Za-z0-9_]+/g, '[token]')
    .replace(/(:\/\/)[^\s/@]+@/g, '$1[credentials]@')
    .replace(/[^\x20-\x7e]/g, '?')
    .trim()
    .slice(0, 120);
}

// The PushRefusal for a failed check: a PushRefusal raised inside is kept as it is; anything else names
// the operation and what went wrong (timeout, exit status or error code, and stderr's first line).
function checkFailure(what, operation, err) {
  if (err instanceof PushRefusal) return err;
  let cause;
  if (timedOut(err)) cause = `timed out after ${seconds(err.timeoutMs)}`;
  else if (err instanceof SyntaxError) cause = 'unreadable response';
  else if (typeof err?.status === 'number') cause = `exit ${err.status}`;
  else if (typeof err?.code === 'string' && /^[A-Z0-9_]{1,40}$/.test(err.code)) cause = err.code;
  else cause = 'failed';
  const detail = stderrLine(err?.stderr);
  return new PushRefusal(`${what} (${operation}: ${cause}${detail ? `: ${detail}` : ''})`);
}

// Returns { login } or { error } (never throws). Runs gh with the session's own environment.
function readGhLogin(work = scanWork()) {
  try {
    const gh = resolveGh();
    if (!gh) return { error: 'gh is not installed or not on PATH' };
    const out = runCheck(gh, ['api', 'user', '--jq', '.login'], work);
    const login = String(out).trim();
    if (!/^[A-Za-z0-9-]{1,39}(?:\[bot\])?$/.test(login)) return { error: 'gh returned no login' };
    return { login };
  } catch (err) {
    if (err && err.code === 'ENOENT') return { error: 'gh is not installed or not on PATH' };
    if (err instanceof ScanLimit) throw err;
    if (timedOut(err)) {
      charge(work);
      return { error: `gh did not answer within ${seconds(err.timeoutMs)}` };
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

function readOpenPulls(repo, work, cwd) {
  const gh = resolveGh();
  if (!gh) throw new PushRefusal('gh is not installed or not on PATH');
  try {
    const raw = runCheck(gh, ['api', '--hostname', 'github.com', '--paginate',
      `repos/${repo}/pulls?state=open&per_page=100`, '--jq',
      'map({user: {login: .user.login}, head: {ref: .head.ref, repo: {full_name: .head.repo.full_name}}, base: {ref: .base.ref, repo: {full_name: .base.repo.full_name}}}) | @json'], work, cwd);
    charge(work, raw.length);
    const pages = raw.trim().split(/\r?\n/).map((line) => JSON.parse(line));
    if (pages.some((page) => !Array.isArray(page))) throw new PushRefusal('GitHub returned an unreadable pull request list');
    return pages.flat();
  } catch (err) {
    if (err instanceof ScanLimit) throw err;
    throw checkFailure('GitHub could not verify the open pull requests for the destination repository', 'gh api pulls', err);
  }
}

function readGit(args, work, cwd) {
  const git = resolveProgram('git', process.env);
  if (!git) throw new PushRefusal('git is not installed or not on PATH');
  const operation = `git ${args.find((a) => ['config', 'symbolic-ref', 'remote'].includes(a)) || 'call'}`;
  try {
    return runCheck(git, args, work, cwd);
  } catch (err) {
    if (err instanceof ScanLimit) throw err;
    // `symbolic-ref --quiet` exits 1, silently, when HEAD is detached: no branch, not a failure.
    if (operation === 'git symbolic-ref' && err?.status === 1 && !String(err.stderr || '').trim()) return '';
    throw checkFailure('Git could not verify the push destination', operation, err);
  }
}

// A command that starts with a plain directory change (`cd <dir> &&`, `Set-Location <dir>;`), the
// only directory change the hook follows. A path with a variable, a glob, `~user` or anything else
// the hook can't read doesn't match, and decide refuses the push.
const LEADING_CD = {
  bash: /^\s*(?:cd|pushd|chdir)[ \t]+(?:--[ \t]+)?([^\s;&|()<>$`'"\\*?[\]{}#]+|'[^'\n]*'|"(?:[^"\n$`\\]|\\(?![\\"$`\n]))*")[ \t]*(?:&&|;|\r?\n)/,
  ps: /^\s*(?:cd|chdir|sl|set-location|pushd|push-location)[ \t]+(?:-(?:path|literalpath|lp|pspath)(?::|[ \t]+))?([^\s;&|(){}<>$`'"@,*?[\]#]+|'[^'\n*?[\]]*'|"[^"\n$`*?[\]]*")[ \t]*(?:&&|;|\r?\n)/i,
};
const DIR_REFUSAL = 'it follows a directory change the guard could not follow; start the command with `cd <dir> &&` and no other directory change, or use `git -C <dir> push`';

// The directory a push runs in: the session's, or the one the command's leading directory changes
// lead to. Throws a PushRefusal when the command changes directory in any other way, or to a path
// that isn't an existing directory.
function pushDirectory(command, mode, cwd, work) {
  if (!work.dirChanges) return cwd;
  let dir = cwd || process.cwd();
  let rest = command;
  let followed = 0;
  for (let m = LEADING_CD[mode].exec(rest); m; m = LEADING_CD[mode].exec(rest)) {
    let target = m[1];
    const quoted = /^['"]/.test(target);
    if (quoted) target = target.slice(1, -1);
    if (!target) throw new PushRefusal(DIR_REFUSAL);
    if (/^~(?:$|[\\/])/.test(target) && (mode === 'ps' || !quoted)) target = path.join(os.homedir(), target.slice(1));
    else if (target.startsWith('~') && !quoted) throw new PushRefusal(DIR_REFUSAL);
    if (mode === 'bash' && process.platform === 'win32' && /^\/[a-zA-Z](?:\/|$)/.test(target)) {
      target = `${target[1]}:\\${target.slice(3)}`; // Git Bash's /c/... path
    }
    if (mode === 'bash' && process.env.CDPATH && !/^(?:\.{0,2}[\\/]|\.{1,2}$|[a-zA-Z]:)/.test(target) && !path.isAbsolute(target)) {
      throw new PushRefusal(DIR_REFUSAL); // CDPATH could send `cd` elsewhere
    }
    dir = path.resolve(dir, target);
    let isDir = false;
    try { isDir = fs.statSync(dir).isDirectory(); } catch { /* refused below */ }
    if (!isDir) throw new PushRefusal(DIR_REFUSAL);
    followed++;
    rest = rest.slice(m[0].length);
  }
  if (followed !== work.dirChanges) throw new PushRefusal(DIR_REFUSAL);
  return dir;
}

const UNREAD_PUSH = 'the command names git push in a form the guard cannot read (a variable, a string, a comment or text it could not parse), so its destination cannot be checked. If it pushes, run the push as a plain `git push ...` command; if it does not, reword it so the words git and push do not both appear (in PowerShell, a commit message included)';

// An environment assignment anywhere in the command that could change which repository, config or
// remote git reads (`export GIT_DIR=...`, `$env:GIT_CONFIG_GLOBAL = ...`, `set HOME=...`).
const PUSH_ENV_TEXT = /(?:^|[^A-Za-z0-9_$])(?:GIT_(?:DIR|WORK_TREE|CONFIG\w*|NAMESPACE|COMMON_DIR|CEILING_DIRECTORIES|DISCOVERY_ACROSS_FILESYSTEM|EXEC_PATH)|XDG_CONFIG_HOME|HOME|USERPROFILE)['"]?\s*[=,]|env:(?:GIT_|XDG_CONFIG_HOME|HOME|USERPROFILE)/i;

// The tools whose commands are checked, and the shell each one runs them in. Both tools carry the
// script in tool_input.command (https://code.claude.com/docs/en/hooks, read 2026-11-23).
const TOOL_MODES = { Bash: 'bash', PowerShell: 'ps' };

// The verdict for one hook input. `getLogin` is injectable for tests.
// Returns { exitCode: 0 | 2, stderr?: string, systemMessage?: string, checked: boolean }.
// PowerShell forms that run text or a program the parser can't read as a plain git call: Invoke-Expression
// and its aliases, Invoke-Command, Start-Process, a job, a nested shell, the call or dot-source operator on
// a string, variable, expression or array, a script block object, an encoded command, or git's own
// git-push program. A word-scan push next to any of them is refused, even beside a readable push. The test
// runs on the raw command text, strings and comments included: blanking them would let a subexpression
// inside a string (or a quoting trick) hide one. Names count only as whole words, so `Start-Sleep` or
// `check.sh` don't match; a word such as `PowerShell` in a commit message next to "git push" does, and that
// command is refused with advice to reword (fail-closed by design).
const PS_DYNAMIC_NAMES =
  /(?<![\w.\-$])(?:iex|invoke-expression|invoke-command|icm|start-process|saps|start|start-job|sajb|pwsh|powershell|cmd|bash|sh|wsl)(?:\.exe)?(?![\w.\-\/\\])/i;
// (A script block run in place, `& { ... }`, is left out: the parser reads its commands.)
const PS_CALL_OPERATOR = /(?:^|[\s;|{(`])[&.]\s*["'$(@\u2018-\u201e]/;
const PS_OTHER_DYNAMIC = /\[scriptblock\]|\.(?:invokescript|addscript)\s*\(|(?<![\w-])-enc(?:odedcommand)?(?![\w-])|git-push(?:\.exe)?(?![\w.\-])/i;

// The text is also read with PowerShell's backtick escapes removed and with block comments turned into a
// space, as PowerShell reads a command name (`i\`ex`) or the gap after `&` (`&<# #>$g`). Each extra copy
// can only add a match. Returns the matched word or form, or null.
function runsTextOrProgram(command) {
  const unticked = command.replace(/`/g, '');
  const variants = [command, unticked, command.replace(/<#[\s\S]*?#>/g, ' '), unticked.replace(/<#[\s\S]*?#>/g, ' ')];
  for (const text of variants) {
    for (const re of [PS_DYNAMIC_NAMES, PS_CALL_OPERATOR, PS_OTHER_DYNAMIC]) {
      const m = re.exec(text);
      if (m) return m[0].trim().slice(0, 40) || 'the call operator';
    }
  }
  return null;
}

// Its own message: the push may be an ordinary one, so it names what matched and the way out.
function runAsTextRefusal(match) {
  return `the same PowerShell command contains "${match}", which can run text or a program, so a push in it is ` +
    'in a form the guard cannot read. Run the push on its own, as a plain `git push <remote> <branch>` in a ' +
    'separate tool call (put a commit whose message names such a word in an earlier call, or reword it)';
}

const WORD_SCAN_PUSH_NOTICE =
  'Account guard: this PowerShell command contains the words "git" and "push" but no push the guard could ' +
  'read, so no push destination was checked. If it pushes, write the push as a plain `git push <remote> <branch>` ' +
  'so the guard can check it.';

function decide(input, getLogin = readGhLogin, sources = {}, work = scanWork()) {
  const toolName = input && input.tool_name;
  const command = input && input.tool_input && input.tool_input.command;
  if (typeof toolName !== 'string' || !Object.hasOwn(TOOL_MODES, toolName)) return { exitCode: 0, checked: false };
  const mode = TOOL_MODES[toolName];
  if (typeof command !== 'string') {
    // The PowerShell tool's input shape comes from the docs, not from a live call: if it ever
    // carries no `command`, say so instead of allowing in silence. (Bash keeps its silent exit.)
    return mode === 'ps'
      ? { exitCode: 0, checked: false, systemMessage: `Account guard: couldn't read the ${toolName} tool's command (no tool_input.command); allowed.` }
      : { exitCode: 0, checked: false };
  }

  let checked = false;
  try {
    const hit = scanCommand(command, 0, mode, work);
    if (!hit) return { exitCode: 0, checked: false };

    // Review and merge commands are blocked under any login, without calling gh.
    if (ALWAYS_BLOCKED.has(hit)) {
      return { exitCode: 2, checked: false, stderr: `${NEVER_MESSAGE}\n(Command matched: ${hit}.)` };
    }

    checked = true;
    const result = getLogin(work);
    charge(work);
    const login = typeof result?.login === 'string' ? result.login : null;
    if (login?.toLowerCase() === BLOCKED_LOGIN.toLowerCase()) {
      return { exitCode: 2, checked, stderr: `${BLOCK_MESSAGE}\n(Command matched: ${hit}.)` };
    }
    // A push the scan saw but couldn't read (found only by the text scan, or next to a git call whose
    // subcommand is a variable) can't have its destination checked: refused visibly.
    if (work.unreadPush || (work.wordScanPush && work.dynamicGit)) {
      throw new PushRefusal(UNREAD_PUSH);
    }
    // The PowerShell word scan alone (the words "git" and "push" anywhere, with no push the parser could
    // read) also matches honest commands such as `git stash push` or a commit message that mentions a
    // push, so under a login other than the blocked one it allows with a visible notice rather than
    // refusing every such command (the login block above is unchanged).
    // Next to a form that runs text or a program, the words may be a push the parser can't read, so the
    // command is refused even when it also holds a readable push.
    const runsText = work.wordScanPush ? runsTextOrProgram(command) : null;
    if (runsText) throw new PushRefusal(runAsTextRefusal(runsText));
    if (work.wordScanPush && !work.pushes.length) {
      return { exitCode: 0, checked, systemMessage: WORD_SCAN_PUSH_NOTICE };
    }
    if (work.pushes.length) {
      if (work.pushEnv || PUSH_ENV_TEXT.test(command)) {
        throw new PushRefusal('the command sets environment variables that change what git reads; run the push without them');
      }
      const sessionCwd = typeof input.cwd === 'string' && path.isAbsolute(input.cwd) ? input.cwd : undefined;
      const cwd = pushDirectory(command, mode, sessionCwd, work);
      for (const push of work.pushes) push.cwd = cwd;
      checkPushes(work.pushes, {
        login,
        git: sources.git ?? ((args, dir) => readGit(args, work, dir)),
        openPulls: sources.openPulls ?? ((repo) => readOpenPulls(repo, work, sessionCwd)),
        charge: (size) => charge(work, size),
      });
      charge(work);
    }
    if (result?.appToken === true) {
      return {
        exitCode: 0, checked,
        systemMessage: `Account guard: this session uses a GitHub App installation token (no user login, so not ${BLOCKED_LOGIN}); \`${hit}\` allowed.`,
      };
    }
    if (login) return { exitCode: 0, checked };
    const why = result?.error || 'unknown error';
    return {
      exitCode: 0, checked,
      systemMessage: `Account guard: couldn't check the GitHub login before \`${hit}\` (${why}); allowed.`,
    };
  } catch (err) {
    if (err instanceof ScanLimit) return { exitCode: 2, checked, stderr: `${BLOCK_PREFIX} ${err.message}. Use a shorter or simpler command.` };
    if (err instanceof PushRefusal) return { exitCode: 2, checked, stderr: `${BLOCK_PREFIX} git push refused because ${err.message}.` };
    // Only the error's class name and code: its message could hold a path or part of the command.
    const cause = [err?.name, err?.code].filter((x) => typeof x === 'string' && /^[A-Za-z0-9_]{1,40}$/.test(x)).join(', ');
    return { exitCode: 2, checked, stderr: `${BLOCK_PREFIX} internal error while checking the tool command${cause ? ` (${cause})` : ''}.` };
  }
}

function readStdin(work) {
  return new Promise((resolve, reject) => {
    let data = '';
    let bytes = 0;
    const finish = (error) => {
      clearTimeout(timer);
      if (error) process.stdin.destroy();
      if (error) reject(error);
      else resolve(data);
    };
    const timer = setTimeout(() => finish(new ScanLimit('the hook reached its work budget while reading input')),
      Math.max(1, work.deadline - performance.now()));
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      bytes += Buffer.byteLength(chunk);
      if (bytes > MAX_INPUT_BYTES) finish(new ScanLimit('the hook input exceeded its size budget'));
      else data += chunk;
    });
    process.stdin.on('end', () => finish());
    process.stdin.on('error', finish);
  });
}

async function main() {
  let verdict;
  const work = scanWork();
  try {
    const raw = await readStdin(work);
    let input;
    try { input = JSON.parse(raw); } catch {
      verdict = { exitCode: 0, systemMessage: "Account guard: couldn't read the hook input; allowed." };
    }
    if (!verdict) verdict = decide(input, readGhLogin, {}, work);
  } catch (err) {
    const reason = err instanceof ScanLimit ? err.message : 'the hook could not read its input';
    verdict = { exitCode: 2, stderr: `${BLOCK_PREFIX} ${reason}.` };
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
  splitCommands, splitPowerShell, findGuardedCommand, rawScan, psWordScan, resolveGh, decide, readGhLogin,
  BLOCKED_LOGIN, BLOCK_MESSAGE, NEVER_MESSAGE, ALWAYS_BLOCKED, PS_WORDS_NOTE,
};
