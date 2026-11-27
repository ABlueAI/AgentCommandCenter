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
//      Start-Process and `cmd /c`; a command after `return`, `throw` or `exit`; and, on
//      top, the PowerShell word scan: a PowerShell script that names a guarded command's words
//      anywhere, in any order or case, gets the login check, fail-closed; see psWordScan), for
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
//      Anything else exits 0 straight away, without starting `gh` or touching the network; the
//      one process it may start is a local `git config --get alias.NAME` for a git subcommand that
//      isn't one of git's built-ins (the git-alias notes below).
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
// login): a git alias defined in a way the guard doesn't read (an `include.path` or a
// GIT_CONFIG_GLOBAL file named on the same command, or a repository's own alias after a `cd`
// earlier in the same call or with GIT_DIR set on the command, since the lookup reads the hook
// input's cwd and the hook's own environment; the lookup still reads a network path that the
// repository's own `.git` file or `include.path` names; see the git-alias notes
// below for what it does read), wrappers that take their own options (`timeout 60 git push`, `nice -n 5`, `sudo -u x`,
// `xargs`, and `cmd /c` from Bash), `pwsh -EncodedCommand`, `pwsh -File` and a script piped into
// pwsh's standard input, in PowerShell a guarded command whose words appear only as fragments
// (`'g' + 'it'`, `[char]103`, base64; whole words held in a variable or an array, as in `gh @a`,
// are found by the word scan, but get only the login check, so a review or merge command found
// that way alone is not blocked under an agent login), scripts or npm scripts that push, merge or review,
// `gh api` calls that create PRs, `gh api` whose endpoint or method comes from a shell variable or a
// file (`gh api "$URL"`, `--input` bodies are matched by the flag, not their content), `gh api`
// reached through an alias or `gh -R x api` with other global options, a GraphQL mutation read from
// a file (`-F query=@mutation.graphql`), `curl` or SDK calls to
// api.github.com with a token, and tools other than Bash and PowerShell (GitHub MCP tools:
// .claude/settings.json denies the ones whose names were checked; every Bash deny rule there has a
// PowerShell counterpart, issue #219). A process running as
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
// git aliases (issue #337). git runs an alias when the subcommand is not one of its own commands, so
// `git p` can be a push. The guard reads an alias from, in order: `-c alias.NAME=VALUE` before the
// subcommand; `GIT_CONFIG_KEY_n=alias.NAME` with `GIT_CONFIG_VALUE_n` (or GIT_CONFIG_PARAMETERS) set on
// the same command; a `git config ... alias.NAME` in the same tool call (its value isn't read, so that
// alias gets the login check); and, when decide() runs, the configured value (`git config --get
// alias.NAME`, a local read with no network, at most GIT_ALIAS_LOOKUPS per tool call). A value starting
// with `!` is a shell command and is checked as Bash; any other value is expanded like git does and
// checked again. An alias whose value can't be read (`--config-env`, a lookup that fails or runs past
// its budget, a hook input with no usable cwd) gets the login check, with GIT_ALIAS_NOTE and the
// reason in the matched name.
// git's built-in commands (`git --list-cmds=builtins`, git 2.43): git runs these before any alias, so an
// alias with one of these names is ignored and never looked up. Scripts and newer commands are left out
// on purpose: git runs an alias of that name when the script or command isn't installed, so it is looked up.
const GIT_COMMANDS = new Set((
  'add am annotate apply archive bisect blame branch bugreport bundle cat-file check-attr '
  + 'check-ignore check-mailmap check-ref-format checkout checkout--worker checkout-index cherry '
  + 'cherry-pick clean clone column commit commit-graph commit-tree config count-objects credential '
  + 'credential-cache credential-cache--daemon credential-store describe diagnose diff diff-files '
  + 'diff-index diff-tree difftool fast-export fast-import fetch fetch-pack fmt-merge-msg '
  + 'for-each-ref for-each-repo format-patch fsck fsck-objects fsmonitor--daemon gc '
  + 'get-tar-commit-id grep hash-object help hook index-pack init init-db interpret-trailers log '
  + 'ls-files ls-remote ls-tree mailinfo mailsplit maintenance merge merge-base merge-file '
  + 'merge-index merge-ours merge-recursive merge-recursive-ours merge-recursive-theirs '
  + 'merge-subtree merge-tree mktag mktree multi-pack-index mv name-rev notes pack-objects '
  + 'pack-redundant pack-refs patch-id pickaxe prune prune-packed pull push range-diff read-tree '
  + 'rebase receive-pack reflog remote remote-ext remote-fd repack replace rerere reset restore '
  + 'rev-list rev-parse revert rm send-pack shortlog show show-branch show-index show-ref '
  + 'sparse-checkout stage stash status stripspace submodule--helper switch symbolic-ref tag '
  + 'unpack-file unpack-objects update-index update-ref update-server-info upload-archive '
  + 'upload-archive--writer upload-pack var verify-commit verify-pack verify-tag version whatchanged '
  + 'worktree write-tree'
).split(' '));
const GIT_ALIAS_NAME = /^[A-Za-z0-9][A-Za-z0-9-]*$/;
// The note on a push through an alias whose value couldn't be read; the reason follows it.
const GIT_ALIAS_NOTE = ' (through a git alias whose value could not be read';
const aliasNote = (why) => `${GIT_ALIAS_NOTE}: ${why})`;
const GIT_ALIAS_LOOKUPS = 4;
const GIT_TIMEOUT_MS = 3000;
// Per tool call (set by findGuardedCommand at depth 0 and by decide): the alias names a `git config`
// in the same call defines, and the configured-alias lookup with its remaining budget.
let aliasState = { scriptNames: new Set(), lookup: null, budget: 0, cache: new Map() };

// `git config [opts] [set] alias.NAME VALUE`, or GIT_CONFIG_KEY_n / GIT_CONFIG_PARAMETERS naming
// `alias.NAME` (`export ...` in Bash, `$env:...` in PowerShell), anywhere in the tool call's text.
const GIT_CONFIG_ALIAS = /\bgit(?:\.exe)?["']?\s[^\n;&|]*?\bconfig\b[^\n;&|]*?\balias\.([A-Za-z0-9][A-Za-z0-9-]*)\b/gi;
const GIT_CONFIG_ENV_ALIAS = /\bGIT_CONFIG_(?:KEY_\d+|PARAMETERS)\b[^\n;&|]*?\balias\.([A-Za-z0-9][A-Za-z0-9-]*)\b/gi;
function scriptAliasNames(text) {
  const names = new Set();
  for (const re of [GIT_CONFIG_ALIAS, GIT_CONFIG_ENV_ALIAS]) {
    for (const m of String(text).matchAll(re)) names.add(m[1].toLowerCase());
  }
  return names;
}

// The alias names that git's options before the subcommand (`-c`, `--config-env`) and the
// assignments before `git` (GIT_CONFIG_KEY_n, GIT_CONFIG_PARAMETERS) define. git hands these to the
// programs a shell alias starts, so they stay known inside one.
function definedAliasNames(gitOpts, assigns) {
  const names = new Set();
  const add = (v) => {
    const m = /^alias\.([A-Za-z0-9][A-Za-z0-9-]*)(?:=|$)/i.exec(String(v));
    if (m) names.add(m[1].toLowerCase());
  };
  for (let k = 0; k < gitOpts.length; k++) {
    const o = gitOpts[k];
    if (o === '-c' || o === '--config-env') add(gitOpts[++k]);
    else if (o.startsWith('--config-env=')) add(o.slice('--config-env='.length));
  }
  for (const a of assigns) {
    const m = /^GIT_CONFIG_(?:KEY_\d+=(.*)|PARAMETERS=(.*))$/.exec(a);
    if (!m) continue;
    if (m[1] !== undefined) add(m[1]);
    else for (const x of m[2].matchAll(/alias\.([A-Za-z0-9][A-Za-z0-9-]*)/gi)) names.add(x[1].toLowerCase());
  }
  return names;
}

// The alias `name`, as { value } or { unknown: true }, or null when it isn't an alias.
// `gitOpts` are git's options before the subcommand; `assigns` the words before `git` (`VAR=value`).
function resolveGitAlias(name, gitOpts, assigns) {
  const key = `alias.${name}`.toLowerCase();
  let found = null;
  for (let k = 0; k < gitOpts.length; k++) {
    const o = gitOpts[k];
    let v = null;
    if (o === '-c' || o === '--config-env') v = gitOpts[++k];
    else if (o.startsWith('--config-env=')) v = o.slice('--config-env='.length);
    else continue;
    if (typeof v !== 'string') continue;
    const eq = v.indexOf('=');
    if ((eq === -1 ? v : v.slice(0, eq)).toLowerCase() !== key) continue;
    found = o === '-c' ? (eq === -1 ? null : { value: v.slice(eq + 1) }) : { unknown: true, why: 'its value comes from --config-env' };
  }
  if (found) return found;
  const env = {};
  for (const a of assigns) {
    const eq = a.indexOf('=');
    if (eq > 0) env[a.slice(0, eq)] = a.slice(eq + 1);
  }
  for (const [k, v] of Object.entries(env)) {
    const m = /^GIT_CONFIG_KEY_(\d+)$/.exec(k);
    if (m && v.toLowerCase() === key) {
      const value = env[`GIT_CONFIG_VALUE_${m[1]}`];
      return typeof value === 'string' ? { value } : { unknown: true, why: `GIT_CONFIG_VALUE_${m[1]} is not on the command` };
    }
  }
  if (typeof env.GIT_CONFIG_PARAMETERS === 'string' && env.GIT_CONFIG_PARAMETERS.toLowerCase().includes(key)) return { unknown: true, why: 'set in GIT_CONFIG_PARAMETERS' };
  if (aliasState.scriptNames.has(name.toLowerCase())) return { unknown: true, why: 'set in the same command' };
  if (!aliasState.lookup) return null;
  // One lookup per name and set of git options in a tool call (`git lfs ... && git lfs ...`).
  const cacheKey = JSON.stringify([name.toLowerCase(), ...gitOpts]);
  let r = aliasState.cache.get(cacheKey);
  if (r === undefined) {
    if (aliasState.budget <= 0) return { unknown: true, why: `more than ${GIT_ALIAS_LOOKUPS} aliases to look up` };
    aliasState.budget--;
    r = aliasState.lookup(name, gitOpts) || null;
    aliasState.cache.set(cacheKey, r);
  }
  if (r && typeof r.value === 'string') return { value: r.value };
  if (r && r.none === true) return null;
  return { unknown: true, why: (r && typeof r.error === 'string' && r.error) || 'the lookup gave no answer' };
}

// A plain alias value split into words the way git does (split_cmdline: quotes and backslashes, no
// `$(...)`, globs or other shell syntax). An unclosed quote, which git refuses, gives null.
function splitAliasValue(value) {
  const words = [];
  let cur = null;
  let quote = null;
  for (let k = 0; k < value.length; k++) {
    const c = value[k];
    if (quote === null && /\s/.test(c)) { if (cur !== null) { words.push(cur); cur = null; } continue; }
    if (cur === null) cur = '';
    if (c === '\\' && quote !== "'" && k + 1 < value.length) { cur += value[++k]; continue; }
    if (quote === null && (c === '"' || c === "'")) { quote = c; continue; }
    if (quote !== null && c === quote) { quote = null; continue; }
    cur += c;
  }
  if (quote !== null) return null;
  if (cur !== null) words.push(cur);
  return words;
}
const shellQuote = (w) => `'${String(w).replace(/'/g, `'\\''`)}'`;
// A shell alias that reads its arguments (`$@`, `$*`, `$0` to `$9`, `${...}` of one of them; `$0`
// because a nested `sh -c '...'` reads its first argument there).
const SHELL_ARGS_REF = /\$(?:[@*0-9]|\{[@*0-9])/;

// `git` with the words after it (`rest`) and before it (`before`): 'git push' for a push, a push through
// an alias, or whatever guarded command a shell alias runs; else null.
function classifyGit(rest, before, depth) {
  const j = skipOptions(rest, 0, GIT_VALUE_OPTS);
  const sub = rest[j];
  if (sub === 'push') return 'git push';
  if (typeof sub !== 'string' || GIT_COMMANDS.has(sub) || !GIT_ALIAS_NAME.test(sub)) return null;
  if (depth >= 8) return 'git push' + aliasNote('an alias loop, or nesting too deep'); // past the parser's limit
  const alias = resolveGitAlias(sub, rest.slice(0, j), before);
  if (!alias) return null;
  if (alias.unknown) return 'git push' + aliasNote(alias.why);
  const value = alias.value.trim();
  const args = rest.slice(j + 1);
  if (value.startsWith('!')) {
    // A shell alias: git runs it with the call's remaining words as its arguments (`sh -c '<value>
    // "$@"'`). They are appended, as git does; a script that reads them itself gets the login check,
    // since what it does with them can't be read. The aliases this git call defines stay known inside.
    const script = value.slice(1);
    if (args.length && SHELL_ARGS_REF.test(script)) return 'git push' + aliasNote('a shell alias that reads its arguments');
    const saved = aliasState;
    const scriptNames = new Set([...saved.scriptNames, ...definedAliasNames(rest.slice(0, j), before)]);
    aliasState = { ...saved, scriptNames };
    try {
      return findGuardedCommand([script, ...args.map(shellQuote)].join(' '), depth + 1, 'bash');
    } finally {
      aliasState = { ...aliasState, scriptNames: saved.scriptNames };
    }
  }
  const expansion = splitAliasValue(value);
  if (expansion === null) return null; // git refuses an alias with an unclosed quote
  return classifySimpleCommand([...before, 'git', ...rest.slice(0, j), ...expansion, ...args], depth + 1, 'bash');
}

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
const PS_SEPARATORS = new Set([';', '&', '|', '\n', '{', '}', ')']);
const normalizePowerShellLineEndings = (text) => text.replace(/\r\n?/g, '\n');
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
  const m = /^[ \t]*\n/.exec(s.slice(i + 2));
  if (!m) return null;
  const expandable = isOneOf(PS_DOUBLE, s[i + 1]);
  const quotes = expandable ? PS_DOUBLE : PS_SINGLE;
  const bodyStart = i + 2 + m[0].length;
  let pos = bodyStart;
  for (;;) {
    const lineStart = pos;
    if (isOneOf(quotes, s[lineStart]) && s[lineStart + 1] === '@') {
      const body = s.slice(bodyStart, Math.max(bodyStart, lineStart - 1));
      return { body, end: lineStart + 1, expandable };
    }
    let k = lineStart;
    while (s[k] === ' ' || s[k] === '\t') k++;
    if (k > lineStart && isOneOf(quotes, s[k]) && s[k + 1] === '@') ctx.unbalanced = true;
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
// A group in argument position (`-ArgumentList @('pr','create')`, `& 'gh' @('pr','merge')`) also stays
// in its word, so Start-Process, Invoke-Expression and the program it is passed to can read it: as the
// group's one word when it holds a single value (an array's elements kept apart by PS_ARRAY_SEP, so a
// native program gets them as separate arguments), else as raw text. Its commands are checked either way.
// An array of strings is read as a command wherever it appears (`Write-Output @('gh', 'pr', 'merge')`
// included): the splitter doesn't try to tell a printed value from a run one (fails closed).
function splitPowerShell(input, depth = 0, ctx = { unbalanced: false }) {
  if (typeof input !== 'string') return [];
  return splitPowerShellScript(normalizePowerShellLineEndings(input), depth, ctx);
}

// The splitter and its helpers use LF throughout. Recursion works on slices of that same text.
function splitPowerShellScript(s, depth, ctx) {
  const commands = [];
  if (depth > 8) { ctx.unbalanced = true; return commands; } // too deep to split: the text scan runs
  let words = [];
  let word = null;
  const endWord = () => { if (word !== null) { words.push(word); word = null; } };
  const endCommand = () => { endWord(); if (words.length) commands.push(words); words = []; };
  const split = (text) => splitPowerShellScript(text, depth + 1, ctx);
  const sub = (text) => { for (const c of split(text)) commands.push(c); };

  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '`') { // escape; a backtick at the end of a line continues the command
      if (s[i + 1] === '\n') { i++; continue; }
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
        const ws = /^(?:\s+|`\n)/.exec(s.slice(j, j + 66));
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

// PowerShell statement keywords that take a pipeline: the command is what follows them.
const PS_STATEMENT_KEYWORDS = new Set(['return', 'throw', 'exit']);
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
  const argWords = String(list == null ? '' : list).split(/[\s,\u001F]+/)
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
    // `return git push`, `throw gh pr merge 5`, `exit git push`: these keywords take a pipeline, so
    // the command starts after them. They are dropped here, like `.`, so each statement is still
    // classified once: classifying it a second time from a later word (review run 8) doubled the
    // nested work at every level of `pwsh -c` or iex and could run the hook past its timeout.
    if (PS_STATEMENT_KEYWORDS.has(String(w[0]).toLowerCase())) { w = w.slice(1); continue; }
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
    return { hit: findGuardedCommand(flattenArrays(args).join(' '), depth + 1, 'ps') };
  }
  if (prog === 'start-process' || prog === 'saps' || prog === 'start') {
    const sp = startProcessWords(rest);
    return { hit: sp ? classifySimpleCommand(sp, depth + 1, 'ps') : null };
  }
  if (prog === 'cmd') {
    const k = rest.findIndex((a) => /^\/[ck]$/i.test(a));
    return { hit: k === -1 ? null : findGuardedCommand(flattenArrays(rest.slice(k + 1)).join(' '), depth + 1, 'bash') };
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
    words = flattenArrays(f.words);
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

  if (prog === 'git') return classifyGit(rest, words.slice(0, i), depth);
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
      const isCmdFlag = SHELLS.has(prog)
        ? /^-[a-z]*c[a-z]*$/.test(flag)
        : /^-(c|command|com|comm|comma|comman)$/i.test(flag);
      if (!isCmdFlag) continue;
      if (SHELLS.has(prog)) return findGuardedCommand(rest[k + 1], depth + 1, 'bash');
      const script = normalizePowerShellLineEndings(rest.slice(k + 1).join(' '));
      const both = [findGuardedCommand(script, depth + 1, 'ps'), findGuardedCommand(script, depth + 1, 'bash')];
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
const GRAPHQL_REVIEW_MERGE_WORDS = ['mergepullrequest', 'mergebranch', 'enqueuepullrequest', 'enablepullrequestautomerge', 'addpullrequestreview', 'submitpullrequestreview'];
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
// Never touches the network; when decide() sets the alias lookup, it may start a local
// `git config --get`, which refuses a network path named on the command (readGitAlias).
function findGuardedCommand(command, depth = 0, mode = 'bash') {
  if (depth > 8 || typeof command !== 'string') return null;
  const script = mode === 'ps' ? normalizePowerShellLineEndings(command) : command;
  if (depth !== 0) return findInScript(script, depth, mode);
  const saved = aliasState;
  aliasState = { ...saved, scriptNames: scriptAliasNames(script) };
  try { return findInScript(script, depth, mode); } finally { aliasState = saved; }
}
function findInScript(script, depth, mode) {
  const ctx = { unbalanced: false };
  const hits = [];
  const split = mode === 'ps' ? splitPowerShellScript : splitCommands;
  for (const words of split(script, depth, ctx)) {
    const hit = classifySimpleCommand(words, depth, mode);
    if (hit) hits.push(hit);
  }
  // When the parser met an unclosed quote the text scan also runs, even if the parse found a
  // login-dependent command, because a review or merge command may be hiding behind the quote.
  // For PowerShell, a backtick line continuation is joined first (`git `<newline>`push`).
  if (ctx.unbalanced) hits.push(...rawScanAll(mode === 'ps' ? script.replace(/`\n/g, ' ') : script));
  // PowerShell, fail-closed: the words of a guarded command anywhere in the script (psWordScan) get the
  // login check, after every hit above, so a review or merge command found above still wins.
  if (mode === 'ps') hits.push(...psWordScan(script));
  return pickHit(hits);
}

// ---------------------------------------------------------------------------------------------
// Login check

// Finds gh in PATH's absolute entries only. A bare `gh` would make Windows look in the current
// directory first, so a gh.exe planted in a checkout could run; this never looks there.
function resolveGh(env = process.env) {
  return resolveProgram('gh', env);
}
function resolveProgram(program, env = process.env) {
  const key = Object.keys(env).find((k) => k.toUpperCase() === 'PATH');
  const names = process.platform === 'win32' ? [`${program}.exe`] : [program];
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

// A configured git alias: { value }, { none: true } when it isn't set, or { error } (never throws).
// Runs `git [-C dir] [--git-dir x] [--work-tree x] config --get alias.NAME` in `cwd`, a local read.
function readGitAlias(name, gitOpts = [], cwd = undefined, env = process.env) {
  const git = resolveProgram('git', env);
  if (!git) return { error: 'git is not installed or not on PATH' };
  const args = [];
  for (let k = 0; k < gitOpts.length; k++) {
    const o = gitOpts[k];
    if (o === '-C' || o === '--git-dir' || o === '--work-tree') {
      if (typeof gitOpts[k + 1] === 'string') args.push(o, gitOpts[k + 1]);
      k++;
    } else if (/^--(?:git-dir|work-tree)=/.test(o)) {
      args.push(o);
    }
  }
  // The hook runs before the command is approved: it never opens a network path the command names
  // (`\\host\share`, `//host/x`); such an alias gets the login check instead.
  const values = args.filter((a) => !a.startsWith('-') || /=/.test(a)).map((a) => (a.startsWith('--') ? a.slice(a.indexOf('=') + 1) : a));
  if (values.some((v) => /^[\\/]{2}/.test(v))) return { error: 'the command names a network path' };
  try {
    const out = execFileSync(git, [...args, 'config', '--get', `alias.${name}`], {
      encoding: 'utf8',
      cwd,
      timeout: GIT_TIMEOUT_MS,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { value: String(out).replace(/\r?\n$/, '') };
  } catch (err) {
    if (err && err.status === 1) return { none: true }; // `git config --get`: exit 1 means not set
    return { error: (err && (err.code || (typeof err.status === 'number' && `exit ${err.status}`))) || 'unknown error' };
  }
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
function decide(input, getLogin = readGhLogin, getGitAlias = readGitAlias) {
  const toolName = input && input.tool_name;
  const command = input && input.tool_input && input.tool_input.command;
  const mode = TOOL_MODES[toolName];
  if (!mode) return { exitCode: 0, checked: false };
  if (typeof command !== 'string') {
    // The PowerShell tool's input shape comes from the docs, not from a live call: if it ever
    // carries no `command`, say so instead of allowing in silence. (Bash keeps its silent exit.)
    return mode === 'ps'
      ? { exitCode: 0, checked: false, systemMessage: `Account guard: couldn't read the ${toolName} tool's command (no tool_input.command); allowed.` }
      : { exitCode: 0, checked: false };
  }

  // The alias lookup reads the session's folder (the hook input's cwd); without a usable one it
  // answers with an error, so an alias there gets the login check instead of passing unread.
  const cwd = input && typeof input.cwd === 'string' && path.isAbsolute(input.cwd) && fs.existsSync(input.cwd) ? input.cwd : null;
  const lookup = cwd
    ? (name, gitOpts) => getGitAlias(name, gitOpts, cwd)
    : () => ({ error: 'the hook input has no usable cwd' });
  const saved = aliasState;
  aliasState = { ...saved, lookup, budget: GIT_ALIAS_LOOKUPS, cache: new Map() };
  let hit;
  try { hit = findGuardedCommand(command, 0, mode); } finally { aliasState = saved; }
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
  splitCommands, splitPowerShell, findGuardedCommand, rawScan, psWordScan, resolveGh, decide, readGhLogin, readGitAlias,
  GIT_COMMANDS, GIT_ALIAS_NOTE,
  BLOCKED_LOGIN, BLOCK_MESSAGE, NEVER_MESSAGE, ALWAYS_BLOCKED, PS_WORDS_NOTE,
};
