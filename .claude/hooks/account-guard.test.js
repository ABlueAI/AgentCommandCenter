'use strict';
// Run: node .claude/hooks/account-guard.test.js
// Standing gate: scripts/account-guard-node.Tests.ps1 (run-pester.ps1, Windows CI) runs this file.
//
// Covers the account guard (.claude/hooks/account-guard.js):
//   1. command matching: `gh pr create` / `gh pr new`, `gh pr ready`, `git push`, also when chained
//      or nested, and never for text inside quotes or for other commands;
//   2. the three login cases through decide(): ABlueAI blocks (exit 2), ABlueAgent allows,
//      gh missing / not logged in allows with a one-line notice;
//   3. non-matching commands never call gh (no network);
//   4. the same cases end to end: the real script as Claude Code runs it (JSON on stdin), with a
//      fake `gh` on PATH (a copy of node that runs a stub `api.js`, so it works on Windows too);
//   5. .claude/settings.json: the hook is wired as the docs say, the deny rules are the expected
//      list, and their syntax follows the permissions docs;
//   6. review and merge commands (`gh pr review`, `gh pr merge`, `gh api` writes to /reviews,
//      /merge, /merges and the cloud auto_merge route, GraphQL review and merge mutations) are
//      blocked under ANY login without asking gh; reads are left alone;
//   7. App identities: a `[bot]` login is accepted, and an installation token (gh api user answers
//      403 "Resource not accessible by integration") is allowed with a notice, not an unknown error;
//   8. the PowerShell tool (S37, issue #217): the same PR work run through Claude Code's PowerShell
//      tool is found and blocked the same way (PowerShell syntax: `&`, `.`, backtick continuations,
//      script blocks, here-strings, assignments, Invoke-Expression, Start-Process, `cmd /c`, arrays
//      given to a program, a command after `return` or `throw`), and, fail-closed (Blue, 2026-11-24,
//      "Yes, run 8 fail-closed"), a PowerShell script that names a guarded command's words anywhere
//      (quoted, in an array, a comment or a here-string, after any keyword, across lines or behind
//      backticks) gets the login check; an array of strings is read as a command even when printed.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');
const guard = require('./account-guard.js');
const { AGENT_LOGINS } = require('../../.github/scripts/agent-logins.js');

let passed = 0, failed = 0;
function assert(cond, label) {
  if (cond) { process.stdout.write(`  ✓ ${label}\n`); passed++; }
  else { process.stderr.write(`  ✗ FAIL: ${label}\n`); failed++; }
}

const HOOK = path.join(__dirname, 'account-guard.js');
const REPO_ROOT = path.resolve(__dirname, '..', '..');

// ---------------------------------------------------------------------------------------------
process.stdout.write('\ncommand matching: guarded commands\n');
const GUARDED = [
  ['gh pr create --fill', 'gh pr create'],
  ['gh pr new --title x', 'gh pr create'],
  ['gh pr ready 152', 'gh pr ready'],
  ['gh pr ready --undo 152', 'gh pr ready'],
  ['gh -R ABlueAI/AgentCommandCenter pr create', 'gh pr create'],
  ['gh pr --repo ABlueAI/AgentCommandCenter create', 'gh pr create'],
  ['gh.exe pr create', 'gh pr create'],
  ['"C:\\Program Files\\GitHub CLI\\gh.exe" pr ready 1', 'gh pr ready'],
  ['git push', 'git push'],
  ['git push -u origin feature', 'git push'],
  ['git -C ../wt push origin HEAD', 'git push'],
  ['git -c credential.helper= push', 'git push'],
  ['git --no-pager push', 'git push'],
  ['/usr/bin/git push', 'git push'],
  ['git.exe push', 'git push'],
  ['"git" "push"', 'git push'],
  ['git add -A && git commit -m "wip" && git push', 'git push'],
  ['npm test; git push', 'git push'],
  ['false || git push', 'git push'],
  ['git push 2>&1 | tail -5', 'git push'],
  ['cd app\ngit push origin x', 'git push'],
  ['(cd app && git push)', 'git push'],
  ['echo $(git push)', 'git push'],
  ['echo "result: $(gh pr create --fill)"', 'gh pr create'],
  ['echo `git push`', 'git push'],
  ['bash -c "git push origin x"', 'git push'],
  ['bash -lc \'gh pr create --fill\'', 'gh pr create'],
  ['pwsh -Command "gh pr ready 3"', 'gh pr ready'],
  ['powershell -NoProfile -Command "git push"', 'git push'],
  ['GIT_TRACE=1 git push', 'git push'],
  ['env GH_DEBUG=1 gh pr create', 'gh pr create'],
  ['sudo git push', 'git push'],
  ['if true; then git push; fi', 'git push'],
  ['git commit -m x \\\n  && git push', 'git push'],
  // Claude Code's usual commit form: a heredoc whose body has an apostrophe, then a push.
  ["git commit -m \"$(cat <<'EOF'\nDon't break Blue's build\nEOF\n)\" && git push", 'git push'],
  ["git commit -F- <<'EOF'\nit's done\nEOF\ngit push", 'git push'],
  ['git commit -F- <<EOF && git push\nbody with a " quote\nEOF', 'git push'],
  ["cat <<-'EOF' > f\n\tdon't\n\tEOF\ngh pr create --fill", 'gh pr create'],
  // An unquoted heredoc body still runs its command substitutions (Codex's finding on PR #153).
  ['cat <<EOF\n$(git push)\nEOF', 'git push'],
  ['cat <<EOF\nresult: `gh pr create --fill`\nEOF', 'gh pr create'],
  ["cat <<-EOF > out.txt\n\tdon't stop: $(echo x; gh pr ready 7)\n\tEOF", 'gh pr ready'],
  ['git commit -F- <<EOF\nmsg $(git push origin x)\nEOF', 'git push'],
  // A here-string or an arithmetic shift is not a heredoc, and never hides what follows.
  ['read a b <<< "$line"\ngit push', 'git push'],
  ["grep -q x <<< \"$out\"\ngh pr create --fill", 'gh pr create'],
  ['cat <<< "x"\ngit push', 'git push'],
  ['(( n <<= 1 ))\ngit push', 'git push'],
  ['(( x = 1 << 3 ))\ngit push', 'git push'],
  ['cat <<EOF\nno closing line\ngit push', 'git push'],
  // Unclosed quotes fall back to a text scan rather than hide what follows.
  ["echo 'unclosed && git push", 'git push'],
  ['echo "$(unclosed && gh pr ready 3', 'gh pr ready'],
  // Review and merge commands (blocked under any login).
  ['gh pr review 5 --approve', 'gh pr review'],
  ['gh pr review --comment -b "looks fine" 5', 'gh pr review'],
  ['gh pr merge 5 --squash', 'gh pr merge'],
  ['gh pr merge --auto 5', 'gh pr merge'],
  ['gh -R ABlueAI/AgentCommandCenter pr merge 5', 'gh pr merge'],
  ['gh pr --repo ABlueAI/AgentCommandCenter review 5 -a', 'gh pr review'],
  ['gh.exe pr merge 5', 'gh pr merge'],
  ['npm test && gh pr merge 5 --admin', 'gh pr merge'],
  ['bash -c "gh pr review 5 --approve"', 'gh pr review'],
  ['echo $(gh pr merge 5)', 'gh pr merge'],
  ["echo 'unclosed && gh pr merge 5", 'gh pr merge'],
  ["echo 'unclosed && gh pr review 5 -a", 'gh pr review'],
  ['gh api repos/ABlueAI/AgentCommandCenter/pulls/5/reviews -f event=APPROVE', 'gh api review'],
  ['gh api repos/o/r/pulls/5/reviews -X POST -f event=COMMENT -f body=x', 'gh api review'],
  ['gh api -X POST /repos/o/r/pulls/5/reviews', 'gh api review'],
  ['gh api --method POST repos/o/r/pulls/5/reviews', 'gh api review'],
  ['gh api --method=post repos/o/r/pulls/5/reviews', 'gh api review'],
  ['gh api -XPOST repos/o/r/pulls/5/reviews', 'gh api review'],
  ['gh api -H "Accept: application/vnd.github+json" repos/o/r/pulls/5/reviews --input review.json', 'gh api review'],
  ['gh api repos/o/r/pulls/5/reviews -F body=@review.md', 'gh api review'],
  ['gh api repos/o/r/pulls/5/reviews --field event=APPROVE', 'gh api review'],
  ['gh api repos/o/r/pulls/5/reviews/77/events -X POST -f event=APPROVE', 'gh api review'],
  ['gh api repos/o/r/pulls/5/reviews/77 -X PUT -f body=x', 'gh api review'],
  ['gh api repos/o/r/pulls/5/reviews/77/dismissals -X PUT -f message=x', 'gh api review'],
  ['gh api https://api.github.com/repos/o/r/pulls/5/reviews?per_page=1 -X POST', 'gh api review'],
  ['gh api repos/o/r/pulls/5/merge -X PUT -f merge_method=squash', 'gh api merge'],
  ['gh api --method PUT repos/o/r/pulls/5/merge', 'gh api merge'],
  ['gh api repos/o/r/pulls/5/merge -f merge_method=squash', 'gh api merge'],
  ['gh api repos/o/r/pulls/$(gh pr view --json number -q .number)/merge -X PUT', 'gh api merge'],
  ['gh api repos/o/r/merges -f base=main -f head=topic', 'gh api merge'],
  ['gh api -X PUT repos/o/r/pulls/5/ccr/auto_merge', 'gh api merge'],
  ['gh api -X POST repos/o/r/pulls/5/ccr/auto_merge', 'gh api merge'],
  ["gh api graphql -f query='mutation { mergePullRequest(input: {pullRequestId: \"x\"}) { clientMutationId } }'", 'gh api merge'],
  ["gh api graphql -f query='mutation { enablePullRequestAutoMerge(input: {pullRequestId: \"x\"}) { clientMutationId } }'", 'gh api merge'],
  ["gh api graphql -f query='mutation { addPullRequestReview(input: {pullRequestId: \"x\", event: APPROVE}) { clientMutationId } }'", 'gh api review'],
  ["gh api graphql -f query='mutation { submitPullRequestReview(input: {event: APPROVE}) { clientMutationId } }'", 'gh api review'],
  ["echo 'unclosed && gh api repos/o/r/pulls/5/reviews -f event=APPROVE", 'gh api review'],
  ["echo 'unclosed && gh api -X PUT repos/o/r/pulls/5/merge", 'gh api merge'],
  // A login-dependent command first must never hide a review or merge command later in the same
  // call (review run 1 of PR #171): the review or merge command wins.
  ['git push && gh -R ABlueAI/AgentCommandCenter pr merge 5', 'gh pr merge'],
  ['git push; gh pr review 5 --approve', 'gh pr review'],
  ['gh pr ready 5 && gh pr merge 5 --squash', 'gh pr merge'],
  ['git push\ngh api -X POST repos/o/r/pulls/5/reviews -f event=APPROVE', 'gh api review'],
  ['bash -c "git push; gh api -X PUT repos/o/r/pulls/5/merge"', 'gh api merge'],
  ['bash -c "git push" && gh pr merge 5', 'gh pr merge'],
  ['echo $(git push) && gh pr merge 5', 'gh pr merge'],
  ["echo 'x && gh pr ready 5 && gh pr review 5 --approve", 'gh pr review'],
  ["git push && echo 'unclosed && gh api repos/o/r/pulls/5/merge -X PUT", 'gh api merge'],
  ["gh api graphql -f query='mutation { mergeBranch(input: {}) { clientMutationId } }'", 'gh api merge'],
  ["gh api graphql -f query='mutation { enqueuePullRequest(input: {}) { clientMutationId } }'", 'gh api merge'],
];
// The other direction: a review or merge command first, then a login-dependent one, is still a merge.
assert(guard.findGuardedCommand('gh pr merge 5 && git push') === 'gh pr merge', 'a review or merge command before a push is still reported');
assert(guard.findGuardedCommand('git push && gh pr ready 5') === 'git push', 'two login-dependent commands: the first is reported');
for (const [cmd, want] of GUARDED) {
  assert(guard.findGuardedCommand(cmd) === want, `${JSON.stringify(cmd)} -> ${want}`);
}

process.stdout.write('\ncommand matching: everything else is left alone\n');
const NOT_GUARDED = [
  'git status',
  'git commit -m "then git push later"',
  'git commit -m "fix; git push; gh pr create"',
  "echo 'gh pr create'",
  'echo git push',
  'grep -rn "git push" docs',
  'git log --grep=push',
  'git push-notes', // not the push subcommand
  'git stash push -m wip', // `push` is stash's subcommand, not git's
  'gh pr view 152',
  'gh pr list --state open',
  'gh pr checks 152',
  'gh pr comment 152 --body "gh pr ready"',
  'gh pr comment 152 --body "gh pr merge 5 and gh pr review 5 are blocked"',
  'gh pr diff 152',
  'gh api user --jq .login',
  // Reads of review and merge endpoints, and writes to other endpoints, are not the guarded commands.
  'gh api repos/o/r/pulls/5/reviews',
  'gh api repos/o/r/pulls/5/reviews --paginate --jq ".[].state"',
  'gh api -X GET repos/o/r/pulls/5/reviews',
  'gh api --method GET repos/o/r/pulls/5/merge',
  'gh api repos/o/r/pulls/5/merge',
  'gh api repos/o/r/pulls/5/comments',
  'gh api repos/o/r/pulls/5/reviews/77/comments',
  'gh api -X POST repos/o/r/issues/5/comments -f body="a note about reviews and merge"',
  'gh api repos/o/r/issues/5/comments -F body=@note.md',
  'gh api -X POST repos/o/r/issues/5/labels -f "labels[]=runner"',
  'gh api repos/o/r/pulls/5/files',
  'gh api -X DELETE repos/o/r/pulls/5/ccr/auto_merge',
  'gh api repos/o/r/pulls/5/ccr/ready_for_review -X POST',
  "gh api graphql -f query='query { viewer { login } }'",
  'gh api repos/o/r/branches/main',
  'gh api repos/o/r/compare/main...topic',
  'gh api',
  'gh api -X PUT',
  "echo 'unclosed && gh api repos/o/r/pulls/5/reviews",
  'gh auth status',
  'npm test',
  'ls -la # git push',
  'cat .claude/hooks/account-guard.js',
  'node -e "console.log(1)"',
  "git commit -F- <<'EOF'\ngit push and gh pr create in a commit message\nEOF",
  "cat <<EOF > notes.md\nthen run git push\nEOF\nnpm test",
  // A quoted delimiter turns substitutions off, so these are only text.
  "cat <<'EOF'\n$(git push)\nEOF",
  'cat <<"EOF"\n`gh pr create`\nEOF',
  'cat <<\\EOF\n$(git push)\nEOF',
  // In an unquoted body, an escaped substitution is text too, and other substitutions are fine.
  'cat <<EOF\n\\$(git push) costs $(date)\nEOF',
  '',
];
for (const cmd of NOT_GUARDED) {
  assert(guard.findGuardedCommand(cmd) === null, `${JSON.stringify(cmd)} -> not guarded`);
}

// ---------------------------------------------------------------------------------------------
process.stdout.write('\ndecide(): the three login cases\n');
// Claude Code's hook input carries the session's cwd; the git-alias lookup reads it (issue #337).
const bash = (command) => ({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command }, cwd: REPO_ROOT });

const withPushSources = {
  git: (args) => {
    if (args.includes('config')) return 'push.default\ncurrent\0';
    if (args.includes('symbolic-ref')) return 'topic\n';
    if (args.includes('get-url')) return 'https://github.com/o/r.git\n';
    throw new Error('unexpected Git call');
  },
  openPulls: () => [],
};

{
  const v = guard.decide(bash('gh pr create --fill'), () => ({ login: 'ABlueAI' }));
  assert(v.exitCode === 2, 'ABlueAI + gh pr create: exit 2 (blocked)');
  assert(/ABlueAI/.test(v.stderr) && /cloud session/.test(v.stderr) && /Mako agent pane/.test(v.stderr),
    'the block message names the login and says to hand the work to a cloud session or a Mako agent pane');
  assert(/gh pr create/.test(v.stderr), 'the block message names the matched command');
}
assert(guard.decide(bash('git push'), () => ({ login: 'ablueai' })).exitCode === 2,
  'ablueai (any case) + git push: exit 2 (GitHub logins are case-insensitive)');
assert(guard.decide(bash('gh pr ready 1'), () => ({ login: 'ABlueAI' })).exitCode === 2,
  'ABlueAI + gh pr ready: exit 2');
{
  const v = guard.decide(bash('git push -u origin x'), () => ({ login: 'ABlueAgent' }), withPushSources);
  assert(v.exitCode === 0 && !v.stderr && !v.systemMessage, 'ABlueAgent + git push: exit 0, silent');
}
assert(guard.decide(bash('gh pr create'), () => ({ login: 'someone-else' })).exitCode === 0,
  'any other login: exit 0');
{
  const v = guard.decide(bash('gh pr create'), () => ({ error: 'gh is not installed or not on PATH' }));
  assert(v.exitCode === 0, 'gh not installed: exit 0 (allowed)');
  assert(/couldn't check/.test(v.systemMessage) && !/\n/.test(v.systemMessage),
    'gh not installed: a one-line notice that the account could not be checked');
}
{
  const v = guard.decide(bash('git push'), () => ({ error: 'gh could not read the login (exit 4)' }), withPushSources);
  assert(v.exitCode === 0 && /couldn't check/.test(v.systemMessage), 'gh not logged in: exit 0 with the notice');
}
assert(guard.decide(bash('git push'), () => undefined, withPushSources).exitCode === 0, 'a login reader that returns nothing: exit 0');

process.stdout.write('\ndecide(): non-matching input never calls gh\n');
let calls = 0;
const counting = () => { calls++; return { login: 'ABlueAI' }; };
for (const cmd of NOT_GUARDED) guard.decide(bash(cmd), counting);
guard.decide({ tool_name: 'Read', tool_input: { file_path: 'x' } }, counting);
guard.decide({ tool_name: 'PowerShell', tool_input: { command: "Write-Host 'git status'" } }, counting);
guard.decide({ tool_name: 'PowerShell', tool_input: {} }, counting);
guard.decide({ tool_name: 'Bash', tool_input: {} }, counting);
guard.decide(null, counting);
assert(calls === 0, `no gh call for any non-matching command or other tool (${calls} calls)`);
assert(guard.decide(bash('git status'), counting).exitCode === 0, 'non-matching command under ABlueAI: exit 0');

// ---------------------------------------------------------------------------------------------
process.stdout.write('\ndecide(): review and merge commands are blocked under any login, without asking gh\n');
{
  let asked = 0;
  const never = () => { asked++; return { login: 'ABlueAgent' }; };
  const REVIEW_MERGE = GUARDED.filter(([, want]) => guard.ALWAYS_BLOCKED.has(want)).map(([cmd]) => cmd);
  assert(REVIEW_MERGE.length >= 35, `the review and merge cases are all run (${REVIEW_MERGE.length})`);
  let blocked = 0;
  for (const cmd of REVIEW_MERGE) if (guard.decide(bash(cmd), never).exitCode === 2) blocked++;
  assert(blocked === REVIEW_MERGE.length, `every review and merge command exits 2 under ABlueAgent (${blocked} of ${REVIEW_MERGE.length})`);
  assert(asked === 0, 'a review or merge command is blocked without a gh call');
  for (const login of [...AGENT_LOGINS, 'ABlueAI', 'someone-else']) {
    const v = guard.decide(bash('gh pr review 5 --approve'), () => ({ login }));
    assert(v.exitCode === 2, `gh pr review under ${login}: exit 2`);
  }
  const v = guard.decide(bash('gh pr merge 5 --squash'), () => ({ error: 'gh is not installed or not on PATH' }));
  assert(v.exitCode === 2 && /gh pr merge/.test(v.stderr), 'gh pr merge is blocked even when gh cannot be read');
  assert(/Agents never approve or merge/.test(v.stderr) && /PR comment/.test(v.stderr) && /web UI/.test(v.stderr),
    'the message says agents never approve or merge, that Blue merges in the web UI, and to post a comment instead');
  assert(!/cloud session|ABlueAI opened/.test(v.stderr), 'the message is not the ABlueAI-login message');
  const g = guard.decide(bash('git push'), () => ({ login: 'ABlueAgent' }), withPushSources);
  assert(g.exitCode === 0, 'git push under ABlueAgent is still allowed');
  for (const cmd of ['git push && gh -R ABlueAI/AgentCommandCenter pr merge 5', 'bash -c "git push; gh api -X PUT repos/o/r/pulls/5/merge"',
    "echo 'x && gh pr ready 5 && gh pr review 5 --approve"]) {
    for (const login of ['ABlueAgent', 'mako-agents[bot]']) {
      assert(guard.decide(bash(cmd), () => ({ login })).exitCode === 2, `${login}: a merge or review behind a push is blocked (${cmd})`);
    }
    assert(guard.decide(bash(cmd), () => ({ appToken: true })).exitCode === 2, `App token: a merge or review behind a push is blocked (${cmd})`);
  }
}

process.stdout.write('\ndecide(): App identities (mako-agents[bot])\n');
{
  const v = guard.decide(bash('git push -u origin x'), () => ({ login: 'mako-agents[bot]' }), withPushSources);
  assert(v.exitCode === 0 && !v.stderr && !v.systemMessage, 'mako-agents[bot] + git push: exit 0, silent');
  assert(guard.decide(bash('gh pr create --fill'), () => ({ login: 'Some-App[BOT]' })).exitCode === 0, 'any [bot] login passes');
  const t = guard.decide(bash('gh pr ready 5'), () => ({ appToken: true, error: 'a GitHub App installation token has no user login' }));
  assert(t.exitCode === 0 && /installation token/.test(t.systemMessage) && /gh pr ready/.test(t.systemMessage) && !/\n/.test(t.systemMessage),
    'an installation token: exit 0 with a one-line notice that names the token kind and the command');
  assert(!/couldn't check/.test(t.systemMessage), 'an installation token is not reported as an unknown error');
  const u = guard.decide(bash('git push'), () => ({ error: 'gh could not read the login (exit 1); it may not be logged in or offline' }), withPushSources);
  assert(/couldn't check/.test(u.systemMessage), 'any other failure is still the unknown-error notice');
}

// ---------------------------------------------------------------------------------------------
// The PowerShell tool (S37, issue #217). Before S37 the hook ran only for the Bash tool and decide()
// allowed every other tool, so all of these ran unchecked through Claude Code's PowerShell tool.
process.stdout.write('\ncommand matching: the PowerShell tool\n');
const ps = (cmd) => guard.findGuardedCommand(cmd, 0, 'ps');
const GUARDED_PS = [
  // The program, however it is named or called.
  ['gh pr create --fill', 'gh pr create'],
  ['gh pr new --title x', 'gh pr create'],
  ['gh pr ready 5', 'gh pr ready'],
  ['gh.exe pr create --fill', 'gh pr create'],
  ['GH.EXE pr new', 'gh pr create'],
  ['& gh pr create --fill', 'gh pr create'],
  ['& gh.exe pr ready 5', 'gh pr ready'],
  ['&gh pr ready 5', 'gh pr ready'],
  ["& 'C:\\Program Files\\GitHub CLI\\gh.exe' pr create", 'gh pr create'],
  ['& "$env:ProgramFiles\\GitHub CLI\\gh.exe" pr ready 5', 'gh pr ready'],
  ['& "C:\\Program Files\\Git\\cmd\\git.exe" push', 'git push'],
  ['. gh pr create', 'gh pr create'],
  ['.\\gh.exe pr create', 'gh pr create'],
  ['gh -R ABlueAI/AgentCommandCenter pr create', 'gh pr create'],
  ['git push', 'git push'],
  ['git.exe push -u origin x', 'git push'],
  ['git -C ..\\wt push', 'git push'],
  ['git -C "C:\\work\\wt" push origin HEAD', 'git push'],
  ['git -c credential.helper= push', 'git push'],
  // Chains, pipelines, line continuations (the backtick) and CRLF line ends.
  ['git add -A; git commit -m "wip"; git push', 'git push'],
  ['npm test && git push', 'git push'],
  ['npm test || git push', 'git push'],
  ['git push | Out-Null', 'git push'],
  ['git push 2>&1 | Out-String', 'git push'],
  ['git `\n  push origin x', 'git push'],
  ['gh pr create `\r\n  --title x', 'gh pr create'],
  ['gh `\n pr `\n ready 5', 'gh pr ready'],
  ['git commit -m "x" `\n; git push', 'git push'],
  ['cd app\r\ngit push origin x', 'git push'],
  // Script blocks, groups and subexpressions run their contents.
  ['if ($LASTEXITCODE -eq 0) { git push }', 'git push'],
  ['& { gh pr create --fill }', 'gh pr create'],
  ['Invoke-Command -ScriptBlock { git push }', 'git push'],
  ['1..2 | ForEach-Object { git push }', 'git push'],
  ['try { git push } catch { Write-Host $_ }', 'git push'],
  ['[void](git push)', 'git push'],
  ['$x = $(gh pr create)', 'gh pr create'],
  ['Write-Output "url: $(gh pr create --fill)"', 'gh pr create'],
  ['"$(gh pr create --fill)"', 'gh pr create'],
  ['@"\n$(git push)\n"@', 'git push'],
  ['Write-Output ("x" + (git push))', 'git push'],
  ['gh pr create --title "a (b)" --body "c)"', 'gh pr create'],
  ['git commit -m (Get-Content msg.txt -Raw); git push', 'git push'],
  // Assignments: the command is what comes after the `=`.
  ['$out = gh pr create --fill', 'gh pr create'],
  ['$out=git push', 'git push'],
  ['$r = & gh.exe pr ready 5', 'gh pr ready'],
  ['$null = git push 2>&1', 'git push'],
  ['[string]$u = gh pr create --fill', 'gh pr create'],
  ['$env:GH_DEBUG = 1; gh pr create', 'gh pr create'],
  // Commands that run another command.
  ['Invoke-Expression "git push"', 'git push'],
  ["iex 'gh pr create --fill'", 'gh pr create'],
  ["Invoke-Expression -Command 'gh pr ready 5'", 'gh pr ready'],
  ["Invoke-Expression -Command:'git push'", 'git push'],
  ["Start-Process gh -ArgumentList 'pr create --fill' -Wait", 'gh pr create'],
  ['Start-Process -FilePath git -ArgumentList push -NoNewWindow -Wait', 'git push'],
  ["Start-Process gh 'pr','ready','5'", 'gh pr ready'],
  ["Start-Process -FilePath 'C:\\Program Files\\GitHub CLI\\gh.exe' -ArgumentList @('pr', 'create', '--fill')", 'gh pr create'],
  ['saps git push', 'git push'],
  ['cmd /c "git push"', 'git push'],
  ['cmd.exe /c gh pr create --fill', 'gh pr create'],
  ['pwsh -Command "gh pr create --fill"', 'gh pr create'],
  ['powershell -NoProfile -Command { git push }', 'git push'],
  ["bash -c 'git push'", 'git push'],
  ['gh --% pr create --fill', 'gh pr create'],
  // Claude's usual PowerShell commit: a here-string message (with an apostrophe), then a push.
  ["git add -A\ngit commit -m @'\nFix: don't break it\n\ngh pr merge 5 is never run here\n'@\ngit push -u origin x", 'git push'],
  ["$m = @'\ndon't\n'@\ngit commit -m $m; git push", 'git push'],
  ["gh pr create --draft --title 'S37: x' --body @'\n## TLDR\nnever gh pr merge 5; git push later\n'@", 'gh pr create'],
  ["git commit -m 'it''s'; git push", 'git push'],
  ['gh pr create --title \u201cFix\u201d --body x', 'gh pr create'],
  // Unclosed quotes fall back to the text scan, as for Bash.
  ["Write-Host 'unclosed; git push", 'git push'],
  // Review and merge commands (blocked under any login).
  ['gh pr merge 5 --squash', 'gh pr merge'],
  ['& gh.exe pr review 5 --approve', 'gh pr review'],
  ['git push; gh pr merge 5', 'gh pr merge'],
  ['gh pr ready 5 && gh pr merge 5 --squash', 'gh pr merge'],
  ['gh api repos/o/r/pulls/5/reviews -f event=APPROVE', 'gh api review'],
  ['gh api -X PUT repos/o/r/pulls/5/merge', 'gh api merge'],
  ["gh api graphql -f query=@'\nmutation { mergePullRequest(input: {pullRequestId: \"x\"}) { clientMutationId } }\n'@", 'gh api merge'],
  ['gh api graphql -f query="mutation { addPullRequestReview(input: {pullRequestId: `"x`"}) { clientMutationId } }"', 'gh api review'],
  ["Start-Process gh 'pr merge 5'", 'gh pr merge'],
  ["Start-Process -Wait -FilePath gh -ArgumentList 'pr','merge','5'", 'gh pr merge'],
  ["iex 'gh pr review 5 -a'", 'gh pr review'],
  ['cmd /c "gh pr merge 5"', 'gh pr merge'],
  ['Write-Host "unclosed; gh pr merge 5', 'gh pr merge'],
  ['git `\n  push; Write-Host "unclosed', 'git push'],
  // Review run 1 (S37): an array argument written with spaces or across lines after the commas.
  ["Start-Process gh -ArgumentList 'pr', 'merge', '5'", 'gh pr merge'],
  ["Start-Process gh 'pr', 'create', '--fill'", 'gh pr create'],
  ["Start-Process gh -ArgumentList 'pr' , 'ready' ,'5'", 'gh pr ready'],
  ["Start-Process gh -ArgumentList 'pr',\n  'merge', '5' -Wait", 'gh pr merge'],
  ["Start-Process gh -ArgumentList 'pr', `\n   'review', '5', '-a'", 'gh pr review'],
  // Review run 1: a here-string ends only at a closing marker that starts its line; an indented one
  // is body text, and the commands after the real end are still seen.
  ["git commit -m @'\nDocs:\n    @'\n    x\n    '@\n'@\ngit push\ngh pr comment 5 --body @'\nPushed; don't merge yet.\n'@", 'git push'],
  ["$m = @'\n  '@ <#\n'@\ngh pr merge 5\n#>", 'gh pr merge'],
  // Review run 1: PowerShell's -Command takes every argument after it as the command.
  ['pwsh -NoProfile -Command git push origin x', 'git push'],
  ['powershell -c gh pr merge 5', 'gh pr merge'],
  // Review run 2: a comma after a parameter name, or before a word, starts an array argument, and a
  // native program gets an array's elements as separate arguments; comments may follow a comma.
  ["Start-Process gh -ArgumentList ,'pr merge 5'", 'gh pr merge'],
  ['git push ,origin', 'git push'],
  ['gh pr merge ,5', 'gh pr merge'],
  ["Start-Process gh -ArgumentList 'pr', # why\n'merge', '5'", 'gh pr merge'],
  ["Start-Process gh -ArgumentList 'pr', <# why #> 'merge', '5'", 'gh pr merge'],
  ['$a, $b = gh pr create --fill', 'gh pr create'],
  ["git -c 'x=a,b' push", 'git push'],
  // Review run 3: an attached parameter value (`-Name:value`) keeps the array that follows it.
  ["Start-Process gh -ArgumentList:'pr' , 'merge', '5'", 'gh pr merge'],
  ["Start-Process -FilePath:gh -ArgumentList:'pr', 'create'", 'gh pr create'],
  // Codex review on 004b8cd: an array given to the call operator or to a program is its arguments, and
  // an array of strings is a command wherever it appears (assigned for later, `-join`, iex, `& $x`,
  // `& (...)`, and since review run 8 also when only printed, which fails closed).
  ["& 'gh' @('pr','merge')", 'gh pr merge'],
  ['& "gh" @("pr", "merge", "5")', 'gh pr merge'],
  ["& 'gh' 'pr','merge'", 'gh pr merge'],
  ["& gh 'pr', 'merge'", 'gh pr merge'],
  ["gh @('pr','create','--fill')", 'gh pr create'],
  ["gh.exe pr @('ready', '5')", 'gh pr ready'],
  ["git @('push','origin','x')", 'git push'],
  ["& 'gh','pr','merge'", 'gh pr merge'],
  ["& ('gh','pr','merge')", 'gh pr merge'],
  ["$c = 'gh','pr','merge'; & $c[0] $c[1..2]", 'gh pr merge'],
  ["$c = @('git', 'push')", 'git push'],
  ["('gh','pr','merge' -join ' ') | iex", 'gh pr merge'],
  ["Write-Output @('gh','pr','merge') -join ' '", 'gh pr merge'],
  ["'gh','pr','merge' | Invoke-Expression", 'gh pr merge'],
  ["Write-Output @(gh, 'pr', 'merge')", 'gh pr merge'], // a bare first element: kept as a command
  ["Write-Output @('gh', 'pr', 'merge'); gh pr merge 5", 'gh pr merge'],
  ["iex ('gh pr merge 5')", 'gh pr merge'],
  ["Start-Process gh -ArgumentList ('pr merge 5')", 'gh pr merge'],
  // Cases from review run 5 (6901edc, whose printed-array skip was later removed): an array joined into
  // a string and handed to a shell, piped, in a script block or nested is a command.
  ["cmd /c \"$('gh','pr','merge','5')\"", 'gh pr merge'],
  ["pwsh -c \"$('gh','pr','merge')\"", 'gh pr merge'],
  ["bash -c \"$('git','push')\"", 'git push'],
  ["cmd /c ([string]('gh','pr','merge','5'))", 'gh pr merge'],
  ["cmd /c \"$(Write-Output @('gh','pr','merge','5'))\"", 'gh pr merge'],
  ["'gh','pr','merge','5' | Join-String -Separator ' ' | cmd", 'gh pr merge'],
  ["[string]::Join(' ', ('gh','pr','merge','5')) | cmd", 'gh pr merge'],
  ["Write-Output @('gh','pr','merge','5') | Join-String -Separator ' ' | cmd", 'gh pr merge'],
  ["Invoke-Ex`pression \"$('gh','pr','merge','5')\"", 'gh pr merge'],
  ["Microsoft.PowerShell.Utility\\Invoke-Expression \"$('gh','pr','merge','5')\"", 'gh pr merge'],
  ["@\"\n$('gh','pr','merge','5')\n\"@ | cmd", 'gh pr merge'],
  ["$r = & 'gh','pr','merge'", 'gh pr merge'],
  ["return & 'gh','pr','merge'", 'gh pr merge'],
  ["Write-Output @('gh','pr','merge') -OutVariable a", 'gh pr merge'],
  ["Write-Output @('gh','pr','merge') > cmd.txt", 'gh pr merge'],
  ["Set-Alias echo iex; echo @('gh','pr','merge')", 'gh pr merge'],
  ["function Write-Output { cmd /c \"$args\" }; Write-Output @('gh','pr','merge')", 'gh pr merge'],
  ["Write-Output @('gh','pr','merge') && git push", 'gh pr merge'],
  ["@('gh','pr','merge') | ForEach-Object { $_ }", 'gh pr merge'],
  ["& { 'gh', 'pr', 'merge' } | Join-String -Separator ' ' | cmd", 'gh pr merge'],
  ["& { 'gh', 'pr', 'merge' }", 'gh pr merge'],
  ["Write-Output @('gh', 'pr', 'merge') | Out-File start.txt", 'gh pr merge'],
  ["if ($true) { Write-Output @('gh','pr','merge') }", 'gh pr merge'],
  ["iex \"Write-Output @('gh','pr','merge')\"", 'gh pr merge'],
  ["Write-Output @('gh','pr','merge','5')\n| Join-String -Separator ' ' | cmd", 'gh pr merge'],
  ["'gh','pr','merge','5'\r\n  # joined\n  | Join-String -Separator ' ' | cmd", 'gh pr merge'],
  // Cases from review run 6 (e863784, whose print-only skip was later removed): a script block's
  // argument, a line-continued assignment, a brace inside `${...}` and an alias loaded from a file are
  // all commands.
  ["& { cmd /c \"$($args[0])\" } 'gh','pr','merge','5'", 'gh pr merge'],
  [". { cmd /c \"$args\" } 'gh','pr','merge'", 'gh pr merge'],
  ["& { cmd /c \"$($args[0])\" } Write-Output @('gh','pr','merge','5')", 'gh pr merge'],
  ["$c =\n'gh','pr','merge','5'\ncmd /c \"$c\"", 'gh pr merge'],
  ["$env:X =\n'gh','pr','merge'\ncmd /c \"%X%\"", 'gh pr merge'],
  ["$c = '{0} {1} {2} {3}' -f\n'gh','pr','merge','5'\ncmd /c \"$c\"", 'gh pr merge'],
  ["${a`}b} = 1\n$c = & {\n'gh','pr','merge','5'\n}\ncmd /c \"$c\"", 'gh pr merge'],
  ["Set-Content a.csv '\"echo\",\"iex\",\"\",\"AllScope\"'; Import-Alias ./a.csv -Force; echo @('gh','pr','merge','5')", 'gh pr merge'],
  ["Write-Output @('gh', 'pr', 'merge'); git status", 'gh pr merge'],
  ["git status\nWrite-Output @('gh', 'pr', 'merge') # the array\nWrite-Output done", 'gh pr merge'],
  ["Write-Output $('gh', 'pr', 'merge')", 'gh pr merge'],
];
// Nesting deeper than the splitter follows falls back to the text scan, never to "allowed", and
// nesting in strings deep enough to exhaust the stack is caught the same way, without throwing.
GUARDED_PS.push(['('.repeat(12) + 'git push' + ')'.repeat(12), 'git push']);
GUARDED_PS.push(['"$('.repeat(5000) + 'git push', 'git push']);
for (const [cmd, want] of GUARDED_PS) {
  assert(ps(cmd) === want, `PowerShell ${JSON.stringify(cmd)} -> ${want}`);
}
// Review run 8 (Blue, 2026-11-24: "Yes, run 8 fail-closed"). Codex's review of b047805: a command after
// `return`, `throw` or `exit` wasn't checked. Those keywords are now dropped before the statement is
// classified (review run 9: once, not by a second pass from a later word), so a review or merge there
// is still blocked under every login. An array of strings is a command even when it is only printed
// (Codex's review of 004b8cd; this over-blocks on purpose, failing closed).
const runEightStart = GUARDED_PS.length; // the loop below checks every case pushed here (review run 9)
GUARDED_PS.push(
  ['& { return git push origin HEAD }', 'git push'], // Codex's case on b047805
  ['return git push', 'git push'],
  ['throw git push', 'git push'],
  ['exit git push', 'git push'],
  ['return `\n  git push', 'git push'],
  ['& { return gh pr merge 5 }', 'gh pr merge'],
  ['throw gh pr merge 5', 'gh pr merge'],
  ['return gh.exe pr review 5 -a', 'gh pr review'],
  ['RETURN gh pr merge 5', 'gh pr merge'], // keywords are case-insensitive
  ['exit gh pr ready 5', 'gh pr ready'],
  ['return return git push', 'git push'],
  ['if ($ok) { return gh pr create --fill } else { throw "no" }', 'gh pr create'],
  ['function F { return gh pr ready 5 }; F', 'gh pr ready'],
  ['return iex "gh pr merge 5"', 'gh pr merge'],
  ['return Start-Process gh -ArgumentList "pr merge 5"', 'gh pr merge'],
  ['throw `\n  gh api -X PUT repos/o/r/pulls/5/merge', 'gh api merge'],
  ["Write-Output @('gh', 'pr', 'merge')", 'gh pr merge'], // Codex's case on 004b8cd: checked again
  ['Write-Output @("gh", "pr", "merge", "5")', 'gh pr merge'],
  ["Write-Output ('gh','pr','merge')", 'gh pr merge'],
  ["Write-Output @(\n  'gh',\n  'pr',\n  'merge'\n)", 'gh pr merge'],
  ["Write-Output @('git', 'push')", 'git push'],
  ["'gh', 'pr', 'merge'", 'gh pr merge'],
  ["Write-Output 'Merging with:'; Write-Output @('gh', 'pr', 'merge')\nWrite-Host done", 'gh pr merge'],
  ["Write-Host @('gh', 'pr', 'merge')", 'gh pr merge'],
  ["echo @('gh', 'pr', 'merge')", 'gh pr merge'],
);
const runEightCases = GUARDED_PS.slice(runEightStart);
assert(runEightCases.length === 25 && runEightCases[0][0] === '& { return git push origin HEAD }',
  `every review run 8 case is checked, Codex's b047805 case first (${runEightCases.length})`);
for (const [cmd, want] of runEightCases) {
  assert(ps(cmd) === want, `PowerShell ${JSON.stringify(cmd)} -> ${want} (review run 8)`);
}
// The word scan: wherever the words of a guarded command appear in a PowerShell script, the login is
// checked (blocked only under ABlueAI). Text that only mentions them, a variable or an array that
// holds them, an escape or a line ending the splitter reads differently: all get the same check.
const W = (name) => name + guard.PS_WORDS_NOTE;
const WORDS_PS = [
  // Text that was left alone before review run 8.
  ['git stash push -m wip', W('git push')],
  ['git log --grep=push', W('git push')],
  ['git commit -m "then git push later"', W('git push')],
  ["Write-Host 'gh pr create'", W('gh pr create')],
  ['"git push"', W('git push')],
  ['$msg = "gh pr ready"', W('gh pr ready')],
  ['gh pr comment 5 --body "gh pr merge 5 is blocked"', W('gh pr merge')],
  ["gh pr comment 5 --body @'\nnever gh pr merge 5\n'@", W('gh pr merge')],
  ["gh pr comment 5 --body 'Independent review (Opus)'", W('gh pr review')],
  ["git commit -m @'\ngit push and gh pr merge 5 in a message\n'@", W('git push')],
  ["$body = @'\nRun gh pr create, then git push.\n'@", W('git push')],
  ['@"\n$(Get-Date) git push\n"@', W('git push')],
  ['Write-Host "$(Get-Date): git push done"', W('git push')],
  ['Write-Host "use `$(git push) later"', W('git push')],
  ['Write-Output "a `"quoted`" git push"', W('git push')],
  ["Write-Output 'it''s git push'", W('git push')],
  ['# git push', W('git push')],
  ['<# gh pr merge 5 #> git status', W('gh pr merge')],
  ["Get-Content notes.md | Select-String 'git push'", W('git push')],
  ['Where-Object { $_ -match "git push" }', W('git push')],
  ["Start-Process notepad -ArgumentList 'git push'", W('git push')],
  ["Write-Host 'gh', 'pr', 'merge'", W('gh pr merge')],
  ['Write-Output a, b, c # git push', W('git push')],
  ['GIT.EXE log; Write-Host PUSH', W('git push')],
  ['& git.exe... log; Write-Host push', W('git push')],
  // Commands the splitter can't follow (the header's Known gaps before run 8).
  ["$p = 'push'; git $p", W('git push')],
  ["$a = 'pr','merge'; gh @a", W('gh pr merge')],
  ["$c = 'gh pr create --fill'; iex $c", W('gh pr create')],
  ["& $gh pr create # $gh = 'gh'", W('gh pr create')],
  ['"x`ngh pr create" | iex', W('gh pr create')],
  ['"`u{67}h pr ready 5" | iex', W('gh pr ready')],
  ['"g`u{0069}t push" | iex', W('git push')],
  ['cmd /c "g^it pu^sh"', W('git push')],
  ['"g\\it push" | bash', W('git push')],
  ["& 'C:\\Program Files\\Git\\mingw64\\libexec\\git-core\\git-push.exe' origin x", W('git push')],
  ["$m = 'PUT'; gh api repos/o/r/pulls/5/merge -X $m", W('gh api merge')],
  ["$e = 'repos/o/r/pulls/5/reviews'; gh api $e -f event=APPROVE", W('gh api review')],
  ['gh api graphql -F query=@q.graphql # mergePullRequest', W('gh api merge')],
  ["gh api -XPOST ('repos/o/r/pulls/5/' + 'reviews')", W('gh api review')],
  // Other separator characters still get the word scan.
  ['Write-Host x # note\u0085git push origin x', W('git push')],
  ['Write-Host x # note\u2028git push origin x', W('git push')],
  ['Write-Host x # note\u2029gh pr ready 5', W('gh pr ready')],
];
for (const [cmd, want] of WORDS_PS) {
  assert(ps(cmd) === want, `PowerShell ${JSON.stringify(cmd)} -> ${want}`);
}
const NOT_GUARDED_PS = [
  'git status',
  'npm test',
  'gh pr view 5',
  'gh pr checks 5',
  'gh pr view 5 --json mergeable,mergeStateStatus',
  'gh pr list --search "review-requested:@me"',
  "gh pr comment 5 --body 'LGTM, CI is green'",
  'git log --oneline -5; git fetch origin',
  'Write-Host "pushed"; git status',
  'gh api repos/o/r/pulls/5/reviews',
  'gh api repos/o/r/pulls/5/merge',
  "gh api graphql -f query='{ viewer { login } }'",
  '',
];
for (const cmd of NOT_GUARDED_PS) {
  assert(ps(cmd) === null, `PowerShell ${JSON.stringify(cmd)} -> not guarded`);
}

process.stdout.write('\nPowerShell line endings\n');
const PS_LINE_ENDINGS = [['LF', '\n'], ['CRLF', '\r\n'], ['CR', '\r']];
for (const [label, lines] of [
  ['statement separator', ['Write-Output first', 'Write-Output second']],
  ['line continuation', ['Write-Output `', '  message']],
  ['line comment', ['Write-Output first # note', 'Write-Output second']],
  ['comment in a group', ['Write-Output $(# note', 'Write-Output message', ')']],
  ['array across lines', ["Write-Output 'first', `", '# note', "'second'"]],
  ['stop-parsing token', ['example --% literal text', 'Write-Output message']],
  ['literal here-string', ["Write-Output @'", 'first', 'second', "'@", 'Write-Output done']],
  ['expandable here-string', ['Write-Output @"', 'first', '$(Write-Output message)', '"@', 'Write-Output done']],
]) {
  const expected = JSON.stringify(guard.splitPowerShell(lines.join('\n')));
  for (const [name, eol] of PS_LINE_ENDINGS) {
    const ctx = { unbalanced: false };
    const words = guard.splitPowerShell(lines.join(eol), 0, ctx);
    assert(!ctx.unbalanced && JSON.stringify(words) === expected, `${label} with ${name}: same PowerShell tokens as LF`);
  }
}

for (const [cmd, want] of [
  ['git push', 'git push'],
  ['gh pr create', 'gh pr create'],
  ['gh pr new', 'gh pr create'],
  ['gh pr ready 5', 'gh pr ready'],
  ['gh pr review 5 --approve', 'gh pr review'],
  ['gh pr merge 5', 'gh pr merge'],
  ['gh api -X POST repos/o/r/pulls/5/reviews', 'gh api review'],
  ['gh api -X PUT repos/o/r/pulls/5/merge', 'gh api merge'],
]) {
  for (const [name, eol] of PS_LINE_ENDINGS) {
    const statements = ['Write-Output start;', cmd, 'Write-Output done'].join(eol);
    assert(ps(statements) === want, `${want} across statement separators with ${name}: parsed command`);
    for (const quote of ["'", '"']) {
      const hereString = [`Write-Output @${quote}`, 'Example command', cmd, `${quote}@`].join(eol);
      assert(ps(hereString) === W(want), `${want} in ${quote}@ here-string text with ${name}: word scan`);
    }
  }
}

// A comment ended by a lone CR or a CRLF can't hide the next line: it is read as a command (issue #229).
for (const eol of ['\r', '\r\n']) {
  assert(ps(`Write-Host x # note${eol}git push origin x`) === 'git push', `comment ended by ${JSON.stringify(eol)} -> git push`);
  assert(ps(`Write-Host x # note${eol}gh pr merge 5`) === 'gh pr merge', `comment ended by ${JSON.stringify(eol)} -> gh pr merge`);
}
// The LF baseline of the line-ending matrix is not empty, so the comparison above can't pass vacuously.
assert(guard.splitPowerShell('Write-Output first\nWrite-Output second').length === 2, 'LF baseline splits into 2 commands');

process.stdout.write('\nthe same PR work through the Bash tool and the PowerShell tool\n');
// Every command that is the same text in both shells gives the same answer in both.
for (const cmd of ['gh pr create --fill', 'gh pr new', 'gh pr ready 5', 'git push -u origin x', 'git -C ../wt push',
  'gh.exe pr create', 'git.exe push', 'npm test && git push', 'gh pr review 5 --approve', 'gh pr merge 5 --squash',
  'gh api repos/o/r/pulls/5/reviews -f event=APPROVE', 'gh api --method PUT repos/o/r/pulls/5/merge',
  'git status', 'gh pr view 5']) {
  assert(ps(cmd) === guard.findGuardedCommand(cmd), `${JSON.stringify(cmd)}: Bash and PowerShell agree (${guard.findGuardedCommand(cmd)})`);
}
// Review run 8: where the words appear only as text, PowerShell is stricter (the login check); Bash isn't.
assert(guard.findGuardedCommand('git commit -m "then git push later"') === null && ps('git commit -m "then git push later"') === W('git push'),
  'git commit -m "then git push later": Bash leaves it alone, PowerShell checks the login (fail-closed)');
// The Bash tool's answers don't change: the default mode is Bash, and a PowerShell-only form means
// nothing new to it, except where Bash runs PowerShell (`pwsh -Command`), which now also reads the
// script as PowerShell.
assert(guard.findGuardedCommand("pwsh -Command 'git `\n push'") === 'git push', 'Bash running pwsh -Command: the script is read as PowerShell too');
assert(guard.findGuardedCommand('pwsh -Command "Start-Process gh \'pr merge 5\'"') === 'gh pr merge', 'Bash running pwsh -Command: Start-Process inside it is found');
assert(guard.findGuardedCommand('pwsh -NoProfile -Command git push origin x') === 'git push', 'Bash running pwsh -Command with an unquoted script: every word after -Command is the script');
assert(guard.findGuardedCommand('pwsh -Command "gh pr comment 5 --body \'never gh pr merge 5\'"') === W('gh pr merge'),
  'Bash running pwsh -Command: guarded words inside the script\'s quotes get the login check (the word scan; review run 8)');
assert(guard.findGuardedCommand('pwsh -c "& { return git push }"') === 'git push', 'Bash running pwsh -c with a return before git push: found');
assert(guard.findGuardedCommand('powershell -Command "& { return gh pr merge 5 }"') === 'gh pr merge', 'Bash running powershell -Command with a return before gh pr merge: found');

process.stdout.write('\ndecide(): the PowerShell tool\n');
const pwsh = (command) => ({ hook_event_name: 'PreToolUse', tool_name: 'PowerShell', tool_input: { command } });

process.stdout.write('\nremaining account guard regressions\n');
{
  const merge = 'gh pr merge 5';
  const mutation = "gh api graphql -f query='mutation { mergePullRequest(input: {}) { clientMutationId } }'";
  const dismissal = "gh api graphql -f query='mutation { dismissPullRequestReview(input: {}) { clientMutationId } }'";
  for (const [label, command, want] of [
    ['GraphQL after a parse gap', '(( x = 1 << 3 ))\n' + mutation, 'gh api merge'],
    ['grouped short method flag', 'gh api -iX PUT repos/o/r/pulls/5/merge', 'gh api merge'],
    ['grouped attached method flag', 'gh api -iXPUT repos/o/r/pulls/5/merge', 'gh api merge'],
    ['GraphQL review dismissal', dismissal, 'gh api review'],
    ['eval', `eval 'gh 'pr' merge 5'`, 'gh pr merge'],
    ['sh command with concatenated words', `sh -c 'g'"h pr m"'erge 5'`, 'gh pr merge'],
    ['Bash grouped command flag', `bash -lc 'g'"h pr m"'erge 5'`, 'gh pr merge'],
    ['xargs with options', `printf '5' | xargs -n 1 gh pr merge`, 'gh pr merge'],
    ['env with a value-taking option', 'env -u GH_DEBUG command -- gh pr merge 5', 'gh pr merge'],
    ['env with a literal argument string', `env -S 'gh pr merge 5'`, 'gh pr merge'],
    ['command prefix option', 'command -p gh pr merge 5', 'gh pr merge'],
    ['backticks around a wrapper', 'echo `eval "gh pr merge 5"`', 'gh pr merge'],
    ['substitution around a wrapper', 'echo "$(env -u GH_DEBUG gh pr merge 5)"', 'gh pr merge'],
    ['literal empty substitution', 'echo $( )', null],
    ['WSL through Bash', 'wsl gh pr merge 5', 'gh pr merge'],
  ]) assert(guard.findGuardedCommand(command) === want, label);

  for (const [label, command] of [
    ['Start-Process launches a shell', `Start-Process bash -ArgumentList '-c "${merge}"'`],
    ['Start-Process trailing colon', `Start-Process -FilePath: gh -ArgumentList: 'pr merge 5'`],
    ['PowerShell start alias', "start gh 'pr merge 5'"],
    ['cmd keep-open switch', `cmd /k "${merge}"`],
    ['Start-Process Args alias', "Start-Process -FilePath gh -Args 'pr merge 5'"],
    ['Start-Process attached FilePath', "Start-Process -FilePath:gh -ArgumentList 'pr merge 5'"],
    ['CRLF here-string', `iex @'\r\n${merge}\r\n'@`],
    ['Invoke-Expression with a common switch', `iex -Verbose -Command '${merge}'`],
    ['Invoke-Expression pipeline literal', `'${merge}' | Invoke-Expression`],
    ['PowerShell assignment to a member', `$result.Value+=gh pr merge 5`],
    ['PowerShell assignment with a preceding space', `$result =gh pr merge 5`],
    ['native PowerShell launch form', `pwsh -CommandWithArgs '${merge}' value`],
    ['native CMD joined command switch', `cmd /d /k"${merge}"`],
    ['PowerShell statement trap', `trap { ${merge} }`],
    ['PowerShell clean block', `function Run-Check { clean { ${merge} } }`],
    ['WSL through PowerShell', 'wsl.exe gh pr merge 5'],
  ]) assert(ps(command) === 'gh pr merge', label);

  assert(guard.findGuardedCommand('command -v gh pr merge') === null, 'command lookup stays read-only');
  assert(guard.findGuardedCommand('(( x = 1 << 3 ))\n' + mutation.replace('-f', '-iX GET -f')) === null,
    'an explicit GraphQL GET stays read-only after a parse gap');
  assert(guard.findGuardedCommand('echo "literal: $(echo gh pr merge)"') === null,
    'substitution output that only mentions a command stays unguarded');
  assert(guard.decide({ ...bash(merge), tool_name: 'constructor' }, counting).exitCode === 0,
    'an inherited tool name is not routed to Bash');
  const depth = guard.decide(pwsh('pwsh -c '.repeat(10) + merge), counting);
  assert(depth.exitCode === 2 && !depth.checked && /nesting/.test(depth.stderr || ''),
    'command-running depth exhaustion blocks visibly before checking login');
  const slowCommand = 'pwsh -c '.repeat(8) + 'Write-Output ' + 'a'.repeat(100000);
  const slow = guard.decide(pwsh(slowCommand), counting);
  assert(slow.exitCode === 2 && !slow.checked && /work budget/.test(slow.stderr || ''),
    'sibling PowerShell and Bash parses share one work budget');
}

{
  const git = (args) => {
    if (args.includes('config')) {
      const override = args.find((arg) => arg.startsWith('push.default='));
      return 'push.default\n' + (override?.split('=')[1] || 'current') + '\0branch.topic.merge\nrefs/heads/upstream\0branch.topic.remote\norigin\0';
    }
    if (args.includes('symbolic-ref')) return 'topic\n';
    if (args.includes('get-url')) return 'https://github.com/o/r.git\n';
    throw new Error('unexpected Git call');
  };
  const repo = { full_name: 'o/r' };
  const pull = (login, head, base = 'main', headRepo = repo) => ({ user: { login }, head: { ref: head, repo: headRepo }, base: { ref: base, repo } });
  const pulls = [pull('other', 'shared'), pull('Other', 'another', 'shared-base'), pull('ABlueAgent', 'mine'), pull('other', 'topic', 'main', { full_name: 'fork/r' })];
  const sources = { git, openPulls: () => pulls };
  const agent = () => ({ login: 'ABlueAgent' });
  const verdict = (cmd, deps = sources) => guard.decide(bash(cmd), agent, deps);
  for (const cmd of [
    'git push origin HEAD:main', 'git push origin HEAD:refs/heads/main', 'git push origin +branch', 'git push origin :branch',
    'git push origin -f topic', 'git push -uf origin topic', 'git push origin --force topic',
    'git push --force-with-lease=topic origin topic', 'git push --force-if-includes origin topic',
    'git push --mirror', 'git push --all', 'git push --branches', 'git push origin --delete topic',
    'git push --repo=origin HEAD:main', 'git -c push.default=matching push',
    'git push origin topic:shared', 'git push origin refs/heads/shared', 'git push origin shared-base',
    'git push origin mine shared', 'git push origin mine; git push origin shared',
    '(( x = 1 << 3 ))\ngit push origin HEAD:main',
  ]) {
    const v = verdict(cmd);
    assert(v.exitCode === 2 && /push/.test(v.stderr || ''), `refuse ${cmd}`);
  }
  assert(verdict('git push origin mine').exitCode === 0, 'an agent can update its own PR branch');
  assert(verdict('git push').exitCode === 0, 'push.default=current uses the current branch and ignores a fork PR with the same name');
  assert(verdict('git -c push.default=upstream push', { ...sources, openPulls: () => [pull('other', 'upstream')] }).exitCode === 2,
    'push.default=upstream checks the configured upstream branch');
  assert(verdict('git push origin HEAD', { ...sources, openPulls: () => [pull('other', 'topic')] }).exitCode === 2,
    'a HEAD refspec checks the current branch');
  assert(verdict('git push origin topic', { ...sources, openPulls: () => { throw new Error('offline'); } }).exitCode === 2,
    'a failed PR lookup visibly refuses a push');
  const broken = guard.decide(bash('gh pr ready 5'), () => { throw new Error('internal fixture error'); });
  assert(broken.exitCode === 2 && /internal error/.test(broken.stderr || ''), 'an internal hook error refuses visibly');
}

// Review run 1 on #324: the push destination checks.
process.stdout.write('\npush destinations (review run 1 on #324)\n');
{
  const { PushRefusal } = require('./account-guard-push.js');
  const repo = { full_name: 'o/r' };
  const pull = (login, head, base = 'main', headRepo = repo) => ({ user: { login }, head: { ref: head, repo: headRepo }, base: { ref: base, repo } });
  // A fake git: `config` lists the entries, `symbolic-ref` names the branch (null: detached HEAD),
  // `remote get-url` lists each remote's push URLs. Every call is recorded with its directory.
  const fakeGit = ({ config = [['push.default', 'current']], branch = 'topic', urls = { origin: ['https://github.com/o/r.git'] }, calls = [] } = {}) => (args, cwd) => {
    calls.push({ args, cwd });
    if (args.includes('config')) return config.map(([k, v]) => `${k}\n${v}\0`).join('');
    if (args.includes('symbolic-ref')) return branch === null ? '' : `${branch}\n`;
    if (args.includes('get-url')) {
      const name = args[args.length - 1];
      if (!urls[name]) { const e = new Error('no such remote'); e.status = 2; throw e; }
      return urls[name].join('\n') + '\n';
    }
    throw new Error('unexpected Git call');
  };
  const agent = () => ({ login: 'ABlueAgent' });
  const sharedPulls = [pull('other', 'shared'), pull('ABlueAgent', 'mine')];
  const run = (cmd, { git = fakeGit(), pulls = sharedPulls, login = agent, tool = 'Bash', cwd, repos } = {}) => {
    const input = { hook_event_name: 'PreToolUse', tool_name: tool, tool_input: { command: cmd } };
    if (cwd) input.cwd = cwd;
    return guard.decide(input, login, { git, openPulls: (r) => { repos?.push(r); return pulls; } });
  };
  const refused = (v, re) => v.exitCode === 2 && re.test(v.stderr || '');

  // HIGH 1: redirection words are not push arguments.
  const words = (cmd) => JSON.stringify(guard.splitCommands(cmd));
  assert(words('git push origin topic > out.log 2>&1') === JSON.stringify([['git', 'push', 'origin', 'topic']]),
    'Bash: `> out.log 2>&1` is not part of the push arguments');
  assert(words('git push origin topic &>/dev/null') === JSON.stringify([['git', 'push', 'origin', 'topic']]), 'Bash: `&>/dev/null` is a redirection');
  assert(words('git push origin topic >>log 2>err <in 3<>rw >|clob') === JSON.stringify([['git', 'push', 'origin', 'topic']]),
    'Bash: `>>`, `2>`, `<`, `<>` and `>|` targets are dropped');
  assert(words('git push origin top2>x') === JSON.stringify([['git', 'push', 'origin', 'top2']]), 'Bash: digits inside a word are not a file descriptor');
  assert(words('git push origin topic 2 >x') === JSON.stringify([['git', 'push', 'origin', 'topic', '2']]), 'Bash: a separate `2` is an argument');
  assert(guard.findGuardedCommand('>out.log git push origin x') === 'git push', 'Bash: a redirection before the program no longer hides it');
  assert(guard.findGuardedCommand('diff <(git push) x') === 'git push', 'Bash: a process substitution is still split out');
  assert(guard.findGuardedCommand('cat <<< "$(git push)"') === 'git push', "Bash: a here-string's substitution is still checked");
  assert(JSON.stringify(guard.splitPowerShell('git push origin topic 2>&1 | Out-String')[0]) === JSON.stringify(['git', 'push', 'origin', 'topic']),
    'PowerShell: `2>&1` is a stream merge, not an argument');
  assert(JSON.stringify(guard.splitPowerShell('git push origin topic *> $null')[0]) === JSON.stringify(['git', 'push', 'origin', 'topic']),
    'PowerShell: `*> $null` is a redirection');
  assert(JSON.stringify(guard.splitPowerShell('git push origin topic >> out.txt')[0]) === JSON.stringify(['git', 'push', 'origin', 'topic']),
    'PowerShell: `>> out.txt` is a redirection');
  for (const cmd of ['git push origin topic 2>shared', 'git push origin topic >main', 'git push origin topic > shared 2>&1',
    'git push origin topic 2>&1 | tail -5', 'git push origin topic <shared', 'git push origin topic &>> main']) {
    const v = run(cmd);
    assert(v.exitCode === 0, `${cmd}: the redirection target is not a destination (exit ${v.exitCode}: ${v.stderr || ''})`);
  }
  for (const cmd of ['git push origin topic 2>&1 | Out-String', 'git push origin topic *> $null', 'git push origin topic > main']) {
    assert(run(cmd, { tool: 'PowerShell' }).exitCode === 0, `PowerShell ${cmd}: the redirection target is not a destination`);
  }
  {
    const calls = [];
    const v = run('git push 2>/dev/null origin shared', { git: fakeGit({ calls }) });
    assert(refused(v, /another open pull request/) && calls.some((c) => c.args.includes('get-url') && c.args.at(-1) === 'origin'),
      'git push 2>/dev/null origin shared: origin is the remote and shared is still checked');
  }

  // HIGH 2: argument and environment combinations that change the repository.
  for (const cmd of ['git push --repo=/tmp/local https://github.com/o/r.git shared', 'git push --repo=origin git@github.com:o/r.git shared',
    'git push --repo origin origin shared']) {
    assert(refused(run(cmd), /two possible repositories/), `${cmd}: refused, --repo with a positional repository`);
  }
  for (const cmd of ['GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=remote.origin.pushurl GIT_CONFIG_VALUE_0=https://github.com/o/r.git git push origin shared2',
    'GIT_DIR=/tmp/other/.git git push origin topic', 'env HOME=/tmp/h git push origin topic',
    'export GIT_CONFIG_GLOBAL=/tmp/c; git push origin topic', 'git --config-env=remote.origin.pushurl=URL push origin topic']) {
    assert(refused(run(cmd), /environment variables/), `${cmd}: refused, it changes what git reads`);
  }
  for (const cmd of ["$env:GIT_DIR = 'C:\\x\\.git'; git push origin topic", "[Environment]::SetEnvironmentVariable('GIT_CONFIG_GLOBAL', 'x'); git push origin topic"]) {
    assert(refused(run(cmd, { tool: 'PowerShell' }), /environment variables/), `PowerShell ${cmd}: refused`);
  }
  assert(run('GIT_TRACE=1 GIT_TERMINAL_PROMPT=0 git push origin topic').exitCode === 0, 'GIT_TRACE and GIT_TERMINAL_PROMPT on a push: allowed');
  assert(run('git push -C x origin topic 2>&1; echo "$HOME"').exitCode === 2, 'an unknown push option still refuses');
  assert(run('git push origin topic; echo "$HOME"').exitCode === 0, 'reading $HOME is not setting it');

  // HIGH 3: destination spellings git expands.
  for (const cmd of ['git push origin heads/main', 'git push origin HEAD:heads/main', 'git push origin refs/heads/main',
    'git push origin HEAD:refs/heads/main', 'git push origin @:main', 'git push origin HEAD:main', 'git push origin topic:heads/main',
    'git push origin main', 'git push origin topic main']) {
    assert(refused(run(cmd), /pushes to main are blocked/), `${cmd}: refused as a push to main`);
  }
  assert(refused(run('git push origin @', { git: fakeGit({ branch: 'main' }) }), /pushes to main/), 'git push origin @ on main: refused (@ is HEAD)');
  assert(refused(run('git push origin +main'), /force/), 'git push origin +main: refused as a force push');
  assert(refused(run('git push origin :main'), /deletion/), 'git push origin :main: refused as a deletion');
  for (const cmd of ['git push origin heads/shared', 'git push origin HEAD:heads/shared', 'git push origin refs/heads/shared', 'git push origin topic:shared']) {
    assert(refused(run(cmd), /another open pull request/), `${cmd}: refused, another author's PR branch`);
  }
  assert(refused(run('git push origin @', { git: fakeGit({ branch: 'shared' }) }), /another open pull request/), "git push origin @ on another author's PR branch: refused");
  for (const cmd of ['git push origin topic:HEAD', 'git push origin @{u}', 'git push origin FETCH_HEAD', 'git push origin topic:refs/heads/../main',
    'git push origin topic:refs/heads//main', 'git push origin topic:main.lock', 'git push origin ^topic']) {
    assert(refused(run(cmd), /could not be verified|blocked/), `${cmd}: refused, the destination can't be read`);
  }
  assert(run('git push origin tag v1', { pulls: [pull('other', 'tag'), pull('other', 'v1')] }).exitCode === 0, '`tag <name>` pushes a tag, not branches named tag or v1');
  assert(run('git push origin heads/mine').exitCode === 0, "git push origin heads/mine: the agent's own PR branch is allowed");

  // MEDIUM: configured push mappings, applied as git applies them.
  const origin = [['remote.origin.url', 'https://github.com/o/r.git']];
  assert(refused(run('git push origin topic', { git: fakeGit({ config: [...origin, ['remote.origin.push', 'refs/heads/topic:refs/heads/shared']] }) }), /another open pull request/),
    'remote.origin.push maps an explicit source-only refspec (topic -> shared)');
  assert(refused(run('git push origin topic', { git: fakeGit({ config: [...origin, ['remote.origin.push', 'refs/heads/*:refs/heads/team/*']] }), pulls: [pull('other', 'team/topic')] }), /another open pull request/),
    'remote.origin.push patterns map an explicit refspec (topic -> team/topic)');
  assert(refused(run('git push origin topic', { git: fakeGit({ config: [...origin, ['remote.origin.push', '+refs/heads/*:refs/heads/*']] }) }), /force/),
    'a forcing remote.origin.push mapping is refused');
  assert(refused(run('git push origin topic', { git: fakeGit({ config: [...origin, ['remote.origin.push', 'refs/heads/topic:refs/heads/main']] }) }), /pushes to main/),
    'a mapping to main is refused');
  assert(refused(run('git push', { git: fakeGit({ config: [...origin, ['remote.origin.push', 'refs/heads/*:refs/heads/*']] }) }), /could not be verified/),
    'a configured pattern with no refspec on the command line (a bulk push) is refused');
  const upstream = [['push.default', 'upstream'], ['branch.topic.remote', 'origin'], ['branch.topic.merge', 'refs/heads/shared']];
  assert(refused(run('git push origin topic', { git: fakeGit({ config: upstream }) }), /another open pull request/),
    'push.default=upstream maps an explicit branch to its upstream (topic -> shared)');
  assert(refused(run('git push', { git: fakeGit({ config: upstream }) }), /another open pull request/), 'push.default=upstream with no refspec: the upstream is checked');
  assert(run('git push origin topic', { git: fakeGit({ config: [['push.default', 'current'], ['branch.topic.merge', 'refs/heads/shared']] }) }).exitCode === 0,
    'push.default=current: branch.<name>.merge does not map an explicit refspec');

  // HIGH 4: a push found only by the word scan or the text scan is refused visibly, under every login.
  for (const cmd of ["$p = 'push'; git $p origin HEAD:main", "git push origin topic; $p = 'push'; git $p origin HEAD:main",
    "$c = 'git push origin HEAD:main'; iex $c", "& 'C:\\Program Files\\Git\\mingw64\\libexec\\git-core\\git-push.exe' origin main"]) {
    assert(refused(run(cmd, { tool: 'PowerShell' }), /form the guard cannot read/), `PowerShell ${cmd}: refused visibly`);
    assert(refused(run(cmd, { tool: 'PowerShell', login: () => ({ appToken: true }) }), /form the guard cannot read/), `PowerShell ${cmd}: refused under an App token too`);
    const blue = run(cmd, { tool: 'PowerShell', login: () => ({ login: 'ABlueAI' }) });
    assert(blue.exitCode === 2 && blue.stderr.includes(guard.BLOCK_MESSAGE), `PowerShell ${cmd}: ABlueAI still gets the login block`);
  }
  assert(run('git push origin topic', { tool: 'PowerShell' }).exitCode === 0, 'PowerShell: a plain push is checked and allowed');
  assert(refused(run('echo "unclosed && git commit -m push'), /form the guard cannot read/), 'Bash: a push found only by the text scan is refused visibly');
  assert(run("echo 'unclosed && git push origin topic").exitCode === 0, 'Bash: a push the text scan can read is checked and allowed');

  // HIGH 5: a directory change before the push.
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'account-guard-cd-'));
  const sub = path.join(base, 'sub');
  fs.mkdirSync(path.join(sub, 'deeper'), { recursive: true });
  const dirsOf = (cmd, opts = {}) => {
    const calls = [];
    const v = run(cmd, { git: fakeGit({ calls }), cwd: base, ...opts });
    return { v, dirs: [...new Set(calls.map((c) => c.cwd))] };
  };
  for (const [cmd, want, tool] of [
    ['git push origin topic', base], ['cd sub && git push origin topic', sub], [`cd '${sub}' && git push origin topic`, sub],
    ['cd sub; cd deeper\ngit push origin topic', path.join(sub, 'deeper')], ["cd 'sub' && git push origin topic", sub],
    ['Set-Location sub; git push origin topic', sub, 'PowerShell'], ['cd -Path sub; git push origin topic', sub, 'PowerShell'],
    ["Set-Location -LiteralPath 'sub'\ngit push origin topic", sub, 'PowerShell'],
    [`cd "${sub}${path.sep === '\\' ? '\\' : '/'}deeper" && git push origin topic`, path.join(sub, 'deeper')]]) {
    const { v, dirs } = dirsOf(cmd, { tool: tool || 'Bash' });
    assert(v.exitCode === 0 && dirs.length === 1 && dirs[0] === want, `${tool || 'Bash'} ${JSON.stringify(cmd)}: git runs in ${path.relative(base, want) || 'the session directory'} (${dirs})`);
  }
  for (const [cmd, tool] of [['git add -A && cd sub && git push origin topic'], ['(cd sub) && git push origin topic'], ['cd "$D" && git push origin topic'],
    ['cd missing && git push origin topic'], ['cd sub/* && git push origin topic'], ['cd ~someone && git push origin topic'],
    ['bash -c "cd sub && git push origin topic"'], ['env -C sub git push origin topic'], ['pushd sub && git push origin topic && popd'],
    ['cd sub && git push origin topic; cd ..'], ['for d in a b; do cd $d; git push origin topic; done'],
    ['Push-Location sub; git push origin topic; Pop-Location', 'PowerShell'], ['Set-Location $dir; git push origin topic', 'PowerShell'],
    ["if ($x) { Set-Location sub }; git push origin topic", 'PowerShell']]) {
    const { v } = dirsOf(cmd, { tool: tool || 'Bash' });
    assert(refused(v, /directory change the guard could not follow/), `${tool || 'Bash'} ${JSON.stringify(cmd)}: refused visibly`);
  }
  assert(dirsOf('cd sub && npm test').v.exitCode === 0, 'a directory change with no push is not checked');
  fs.rmSync(base, { recursive: true, force: true });

  // Remote URL classification (it decides whether the PR check runs at all).
  for (const [url, want] of [['https://github.com/o/r.git', 'o/r'], ['https://github.com/o/r', 'o/r'], ['git@github.com:o/r.git', 'o/r'],
    ['ssh://git@github.com/o/r.git', 'o/r'], ['ssh://git@ssh.github.com:443/o/r.git', 'o/r'], ['HTTPS://GitHub.com/O/R.git', 'O/R']]) {
    const repos = [];
    const v = run(`git push ${url} topic`, { repos });
    assert(v.exitCode === 0 && repos.length === 1 && repos[0].toLowerCase() === want.toLowerCase(), `explicit URL ${url}: the PR check runs for ${want} (${repos})`);
  }
  for (const url of ['https://gitlab.com/o/r.git', 'git@example.com:o/r.git', 'github.com:o/r', 'https://github.com.evil.example/o/r.git']) {
    assert(refused(run(`git push ${url} topic`), /GitHub repository or local path/), `${url}: refused, not a GitHub repository or local path`);
  }
  for (const url of ['../other', '/tmp/other', 'file:///tmp/other', "'C:\\work\\other'", '.']) {
    const repos = [];
    const v = run(`git push ${url} shared`, { repos });
    assert(v.exitCode === 0 && repos.length === 0, `local path ${url}: no PR check`);
  }
  {
    const repos = [];
    const config = [['url.https://github.com/.insteadof', 'gh:'], ['push.default', 'current']];
    assert(refused(run('git push gh:o/r shared', { git: fakeGit({ config }), repos }), /another open pull request/) && repos[0] === 'o/r',
      'url.<base>.insteadOf rewrites an explicit URL before it is classified');
    const local = [['url./tmp/local/.pushinsteadof', 'https://github.com/'], ['url.https://example.com/.insteadof', 'https://github.com/']];
    const localRepos = [];
    assert(run('git push https://github.com/o/r.git shared', { git: fakeGit({ config: local }), repos: localRepos }).exitCode === 0 && localRepos.length === 0,
      'url.<base>.pushInsteadOf wins over insteadOf for a push');
    const multi = [];
    const both = fakeGit({ urls: { origin: ['https://github.com/o/r.git', 'git@github.com:o/r2.git'] } });
    assert(run('git push origin topic', { git: both, repos: multi }).exitCode === 0 && JSON.stringify(multi) === JSON.stringify(['o/r', 'o/r2']),
      'every push URL of a remote gets the PR check');
    assert(refused(run('git push origin shared', { git: fakeGit({ urls: { origin: ['/tmp/mirror', 'https://github.com/o/r.git'] } }) }), /another open pull request/),
      'a local push URL next to a GitHub one does not skip the GitHub check');
    assert(refused(run('git push origin topic', { git: fakeGit({ urls: { origin: ['https://github.com/o/r.git', 'https://gitlab.com/o/r.git'] } }) }), /GitHub repository/),
      'a non-GitHub push URL next to a GitHub one is refused');
  }

  // Logins: unknown, case, and App ([bot]) authors.
  const topicPulls = [pull('ABlueAgent', 'topic')];
  for (const [label, login] of [['gh error', () => ({ error: 'gh could not read the login (exit 1)' })], ['App token', () => ({ appToken: true })]]) {
    const v = run('git push origin topic', { login, pulls: topicPulls });
    assert(refused(v, /could not check who owns the PR branch/) && !/another open pull request/.test(v.stderr), `${label}: its own reason, not "another author's PR"`);
    assert(run('git push origin free', { login, pulls: topicPulls }).exitCode === 0, `${label}: a branch no PR uses is still allowed`);
  }
  assert(run('git push origin topic', { login: () => ({ login: 'ablueagent' }), pulls: topicPulls }).exitCode === 0, 'the PR author matches the login in any case');
  assert(run('git push origin topic', { login: () => ({ login: 'mako-agents[bot]' }), pulls: [pull('mako-agents[bot]', 'topic')] }).exitCode === 0,
    'a [bot] author owns its own PR branch');
  assert(refused(run('git push origin topic', { login: () => ({ login: 'mako-agents[bot]' }), pulls: [pull('other-app[bot]', 'topic')] }), /another open pull request/),
    "another [bot]'s PR branch is refused");

  // The other refusal branches.
  for (const [cfg, re, label] of [[['push.recursesubmodules', 'on-demand'], /submodule/, 'push.recurseSubmodules'],
    [['push.followtags', 'true'], /bulk tag/, 'push.followTags'], [['remote.origin.mirror', 'true'], /mirror/, 'remote.origin.mirror']]) {
    assert(refused(run('git push origin topic', { git: fakeGit({ config: [['push.default', 'current'], cfg] }) }), re), `${label} in the config: refused`);
  }
  for (const flag of ['--tags', '--follow-tags', '--prune', '--all', '--mirror']) {
    assert(refused(run(`git push ${flag} origin topic`), /bulk push options are blocked/), `${flag}: refused`);
  }
  assert(refused(run('git push --recurse-submodules=on-demand origin topic'), /submodule/), '--recurse-submodules=on-demand: refused');
  assert(run('git push --recurse-submodules check origin topic').exitCode === 0, '--recurse-submodules check: its value is consumed, allowed');
  assert(run('git push -o ci.skip origin topic').exitCode === 0, '-o takes the next word as its value, not the remote');
  assert(run('git push -uo ci.skip origin topic').exitCode === 0, '-o last in a short group takes the next word');
  assert(refused(run('git push origin topic -o'), /missing its value/), '-o with no value: refused');
  assert(refused(run('git push', { git: fakeGit({ branch: null }) }), /current branch could not be verified/), 'detached HEAD: refused with its own reason');
  assert(refused(run('git push origin HEAD', { git: fakeGit({ branch: null }) }), /current branch could not be verified/), 'detached HEAD with a HEAD refspec: refused');
  {
    const thrown = run('git push origin topic', { git: () => { throw new PushRefusal('the fixture refused'); } });
    assert(refused(thrown, /git push refused because the fixture refused\./), 'a PushRefusal raised by a check keeps its own text');
  }

  // The catch-all keeps a sanitized cause.
  const broken = guard.decide(bash('gh pr ready 5'), () => { const e = new TypeError('secret /home/x/token ghp_abc'); e.code = 'ERR_FIXTURE'; throw e; });
  assert(refused(broken, /internal error while checking the tool command \(TypeError, ERR_FIXTURE\)\./) && !/secret|home|ghp_/.test(broken.stderr),
    "an internal error names the error's class and code, never its message");

  // A large legitimate commit followed by a push still behaves as a normal push.
  const big = 'x'.repeat(200 * 1024);
  const heredoc = run(`git commit -F- <<'EOF'\n${big}\nEOF\ngit push origin topic`);
  assert(heredoc.exitCode === 0 && !heredoc.stderr, `Bash: a 200 KB heredoc commit then git push: allowed as a normal push (${heredoc.stderr || ''})`);
  assert(refused(run(`git commit -F- <<'EOF'\n${big}\nEOF\ngit push origin shared`), /another open pull request/), 'Bash: ... and its destination is still checked');
  const hereString = run(`git commit -m @'\n${big}\n'@\ngit push origin topic`, { tool: 'PowerShell' });
  assert(hereString.exitCode === 0 && !hereString.stderr, `PowerShell: a 200 KB here-string commit then git push: allowed as a normal push (${hereString.stderr || ''})`);
  assert(guard.findGuardedCommand(`git commit -m @'\n${big}\n'@\ngit push`, 0, 'ps') === 'git push', 'PowerShell: the 200 KB here-string scan finishes (not the scan limit)');
}

{
  const v = guard.decide(pwsh('& gh.exe pr create --fill'), () => ({ login: 'ABlueAI' }));
  assert(v.exitCode === 2 && /ABlueAI/.test(v.stderr) && /gh pr create/.test(v.stderr), 'ABlueAI + PowerShell & gh.exe pr create: exit 2 with the block message');
  for (const cmd of ['git push', 'gh pr ready 5', 'git -C ..\\wt push', "git commit -m @'\nmsg\n'@\ngit push"]) {
    assert(guard.decide(pwsh(cmd), () => ({ login: 'ABlueAI' })).exitCode === 2, `ABlueAI + PowerShell ${JSON.stringify(cmd)}: exit 2`);
  }
  const ok = guard.decide(pwsh('git push -u origin x'), () => ({ login: 'ABlueAgent' }), withPushSources);
  assert(ok.exitCode === 0 && !ok.stderr && !ok.systemMessage, 'ABlueAgent + PowerShell git push: exit 0, silent');
  const off = guard.decide(pwsh('gh pr create'), () => ({ error: 'gh is not installed or not on PATH' }));
  assert(off.exitCode === 0 && /couldn't check/.test(off.systemMessage), 'PowerShell, gh not installed: exit 0 with the notice (fails open, as for Bash)');
  let asked = 0;
  const never = () => { asked++; return { login: 'ABlueAgent' }; };
  const REVIEW_MERGE_PS = GUARDED_PS.filter(([, want]) => guard.ALWAYS_BLOCKED.has(want)).map(([cmd]) => cmd);
  let blocked = 0;
  for (const cmd of REVIEW_MERGE_PS) if (guard.decide(pwsh(cmd), never).exitCode === 2) blocked++;
  assert(REVIEW_MERGE_PS.length >= 12 && blocked === REVIEW_MERGE_PS.length,
    `every PowerShell review and merge command exits 2 under ABlueAgent (${blocked} of ${REVIEW_MERGE_PS.length})`);
  assert(asked === 0, 'a PowerShell review or merge command is blocked without a gh call');
  let psCalls = 0;
  for (const cmd of NOT_GUARDED_PS) guard.decide(pwsh(cmd), () => { psCalls++; return { login: 'ABlueAI' }; });
  assert(psCalls === 0, `no gh call for any non-matching PowerShell command (${psCalls} calls)`);
  // Review run 1: a PowerShell call with no command says so instead of allowing in silence.
  const missing = guard.decide({ tool_name: 'PowerShell', tool_input: {} }, () => ({ login: 'ABlueAI' }));
  assert(missing.exitCode === 0 && /couldn't read the PowerShell tool's command/.test(missing.systemMessage) && !/\n/.test(missing.systemMessage),
    'PowerShell with no tool_input.command: exit 0 with a one-line notice');
  // Codex's review of 004b8cd: printing an array that spells a merge is checked again and, as a merge
  // command, blocked under any login without a gh call (fails closed; Blue, 2026-11-24). Giving one to
  // the call operator is blocked the same way.
  let arrayAsked = 0;
  const arrayLogin = () => { arrayAsked++; return { login: 'ABlueAgent' }; };
  const printed = guard.decide(pwsh("Write-Output @('gh', 'pr', 'merge')"), arrayLogin);
  assert(printed.exitCode === 2 && /Agents never approve or merge/.test(printed.stderr) && arrayAsked === 0,
    "PowerShell Write-Output @('gh', 'pr', 'merge'): exit 2 under any login, no gh call (fails closed)");
  const called = guard.decide(pwsh("& 'gh' @('pr','merge')"), arrayLogin);
  assert(called.exitCode === 2 && /Agents never approve or merge/.test(called.stderr) && arrayAsked === 0,
    "PowerShell & 'gh' @('pr','merge'): exit 2 under any login, no gh call");
  assert(guard.findGuardedCommand("pwsh -Command \"Write-Output @('gh','pr','merge')\"") === 'gh pr merge',
    'Bash running pwsh -Command that prints an array: guarded');
  // Codex's review of b047805: a command after `return` is checked. A push gets the login check; a
  // review or merge is blocked under any login without a gh call.
  for (const cmd of ['& { return git push origin HEAD }', 'throw git push']) {
    let n = 0;
    const blue = guard.decide(pwsh(cmd), () => { n++; return { login: 'ABlueAI' }; });
    assert(blue.exitCode === 2 && blue.checked === true && /git push/.test(blue.stderr) && n === 1, `ABlueAI + PowerShell ${JSON.stringify(cmd)}: exit 2 after one login check`);
    const agentOk = guard.decide(pwsh(cmd), () => ({ login: 'ABlueAgent' }), withPushSources);
    assert(agentOk.exitCode === 0 && !agentOk.stderr && !agentOk.systemMessage, `ABlueAgent + PowerShell ${JSON.stringify(cmd)}: exit 0, silent`);
  }
  for (const cmd of ['& { return gh pr merge 5 }', 'throw gh pr merge 5', 'return gh pr review 5 -a']) {
    let n = 0;
    const v = guard.decide(pwsh(cmd), () => { n++; return { login: 'ABlueAgent' }; });
    assert(v.exitCode === 2 && /Agents never approve or merge/.test(v.stderr) && n === 0, `ABlueAgent + PowerShell ${JSON.stringify(cmd)}: exit 2, no gh call`);
  }
  // The word scan: one login check; blocked under ABlueAI with the block message, allowed silently under
  // ABlueAgent, and the "couldn't check" notice when gh can't answer, as for any login-dependent command.
  let wordsBlue = 0, wordsAgent = 0, wordsAsked = 0;
  for (const [cmd, want] of WORDS_PS) {
    const blue = guard.decide(pwsh(cmd), () => { wordsAsked++; return { login: 'ABlueAI' }; });
    if (blue.exitCode === 2 && blue.checked === true && /Blocked by Mako's account guard/.test(blue.stderr) && blue.stderr.includes(guard.PS_WORDS_NOTE)) wordsBlue++;
    const agentV = guard.decide(pwsh(cmd), () => { wordsAsked++; return { login: 'ABlueAgent' }; });
    // Review run 1 on #324 (deliberate change): a push found only by the word scan can't have its
    // destination checked. Next to a form that runs text or a program (iex, &, Start-Process, ...) it is
    // refused visibly; otherwise (an honest `git stash push`, or a message that mentions a push) it is
    // allowed with a visible notice. The other word-scan hits still get only the login check.
    const wordPushOk = (v) => (v.exitCode === 2 && /form the guard cannot read/.test(v.stderr || ''))
      || (v.exitCode === 0 && /no push destination was checked/.test(v.systemMessage || ''));
    if (want === W('git push')
      ? wordPushOk(agentV)
      : agentV.exitCode === 0 && !agentV.stderr && !agentV.systemMessage) wordsAgent++;
  }
  assert(wordsBlue === WORDS_PS.length, `every word-scan case exits 2 under ABlueAI with the block message (${wordsBlue} of ${WORDS_PS.length})`);
  assert(wordsAgent === WORDS_PS.length && WORDS_PS.some(([, want]) => want === W('git push')) && WORDS_PS.some(([, want]) => want !== W('git push')),
    `under ABlueAgent, every word-scan push is refused or noticed visibly and every other word-scan case exits 0, silent (${wordsAgent} of ${WORDS_PS.length})`);
  {
    const agentLogin = () => ({ login: 'ABlueAgent' });
    for (const cmd of ['git stash push -m wip', 'git log --grep=push', 'git commit -m "Fix git push refusal"']) {
      const v = guard.decide(pwsh(cmd), agentLogin);
      assert(v.exitCode === 0 && /no push destination was checked/.test(v.systemMessage || '') && !v.stderr,
        `ABlueAgent + PowerShell ${JSON.stringify(cmd)}: exit 0 with the visible word-scan notice`);
    }
    // A push run as text is refused: by the word-scan rule when the parser can't read it, or by the
    // destination check when it can.
    for (const cmd of ["$c = 'git push origin main'; iex $c", "Invoke-Expression 'git push origin main'",
      "Start-Process git 'push origin main'", "powershell -c 'git push origin main'"]) {
      const v = guard.decide(pwsh(cmd), agentLogin);
      assert(v.exitCode === 2 && /Blocked by Mako's account guard/.test(v.stderr || '') && !v.systemMessage,
        `ABlueAgent + PowerShell ${JSON.stringify(cmd)}: a push to main run as text is refused visibly`);
    }
    // Review run 2 on #324: trigger words inside strings, file names or other cmdlets don't count.
    for (const cmd of ['git stash push -- scripts/check.sh', 'git stash push; Start-Sleep 2; git stash pop',
      'git commit -m "Fix git push refusal"', 'git add .; git commit -m "x"; git push -u origin x']) {
      // The push sources are injected, so the real push case doesn't reach git or the live GitHub API.
      const v = guard.decide(pwsh(cmd), agentLogin, withPushSources);
      assert(v.exitCode === 0 && !v.stderr, `ABlueAgent + PowerShell ${JSON.stringify(cmd)}: not refused (exit ${v.exitCode})`);
    }
    // Review run 3 on #324: the test reads the raw text, strings included, so a shell's name next to
    // "git push" in a message is refused (fail-closed by design), with advice to reword.
    for (const cmd of ['git commit -m "Refuse git push from PowerShell"', "git commit -m 'run git push in bash or cmd'"]) {
      const v = guard.decide(pwsh(cmd), agentLogin);
      assert(v.exitCode === 2 && /form the guard cannot read/.test(v.stderr || '') && /reword/.test(v.stderr || ''),
        `ABlueAgent + PowerShell ${JSON.stringify(cmd)}: refused with advice to reword (by design)`);
    }
    // Review run 3 on #324: a subexpression inside a string, a backtick-escaped quote, git's own git-push
    // program by bare path, and a nested cmd.exe are all refused, alone and next to a readable push.
    for (const cmd of ["git push origin topic; $c = 'git push origin shared'; Write-Output \"$(iex $c)\"",
      "$c = 'git push origin main'; Write-Output \"$(iex $c)\"",
      "$c = 'git push origin shared'; git push origin topic; Write-Output @\"\n$(iex $c)\n\"@",
      "git push origin topic; $c = 'git push origin shared'; echo `'; iex $c; echo `'",
      'C:\\Git\\libexec\\git-core\\git-push.exe origin main',
      'git push origin topic; C:\\Git\\libexec\\git-core\\git-push.exe origin shared',
      'C:\\Windows\\System32\\cmd.exe /c git push origin shared']) {
      const v = guard.decide(pwsh(cmd), agentLogin);
      assert(v.exitCode === 2 && /form the guard cannot read/.test(v.stderr || ''),
        `ABlueAgent + PowerShell ${JSON.stringify(cmd)}: a push run as text or by git-push is refused`);
    }
    // Review run 2 on #324: a push run as text is refused even next to a readable push.
    for (const cmd of ["git push origin topic; $c = 'git push origin shared'; iex $c",
      "git push origin topic; Start-Process git 'push origin shared'",
      "git push origin topic; & 'C:\\Git\\libexec\\git-core\\git-push.exe' origin shared"]) {
      const v = guard.decide(pwsh(cmd), agentLogin);
      assert(v.exitCode === 2 && /form the guard cannot read/.test(v.stderr || ''),
        `ABlueAgent + PowerShell ${JSON.stringify(cmd)}: refused although a readable push is also present`);
    }
    // Review run 4 on #324: backtick-escaped names, a block comment after the call operator, and the
    // .NET script runners are refused next to a readable push too.
    for (const cmd of ["git push origin topic; $c = 'git push origin shared'; i`ex $c",
      'C:\\Git\\libexec\\git-core\\git-pu`sh.exe origin shared',
      "$g = 'git'; git push origin topic; &<##>$g push origin shared",
      "$g = 'git'; git push origin topic; . <# x #> $g push origin shared",
      "git push origin topic; $ExecutionContext.InvokeCommand.InvokeScript('git push origin shared')"]) {
      const v = guard.decide(pwsh(cmd), agentLogin);
      assert(v.exitCode === 2 && /form the guard cannot read/.test(v.stderr || ''),
        `ABlueAgent + PowerShell ${JSON.stringify(cmd)}: an escaped or commented run-as-text push is refused`);
    }
    // Review run 4 on #324: an honest commit and push in one call, whose message names a listed word, is
    // refused with a message that names the word and says to push in a separate tool call.
    {
      const v = guard.decide(pwsh('git add -A; git commit -m "Start the sweeper"; git push -u origin x'), agentLogin);
      assert(v.exitCode === 2 && /contains "Start"/.test(v.stderr || '') && /separate tool call/.test(v.stderr || ''),
        'ABlueAgent + PowerShell commit-then-push with a listed word: the refusal names the word and the way out');
      const pushAlone = guard.decide(pwsh('git push -u origin x'), agentLogin, withPushSources);
      assert(pushAlone.exitCode === 0 && !pushAlone.stderr, 'ABlueAgent + PowerShell: the same push alone in its own call passes');
      const started = Date.now();
      const long = guard.decide(pwsh("git push origin topic; $null = '" + '<#'.repeat(150000) + "'"), agentLogin, withPushSources);
      assert(Date.now() - started < 5000 && typeof long.exitCode === 'number',
        `a long unclosed block-comment run is scanned in linear time (${Date.now() - started} ms)`);
    }
    for (const cmd of ['cd..; git push origin topic', 'cd sub; cd..; git push origin topic']) {
      const v = guard.decide(pwsh(cmd), agentLogin);
      assert(v.exitCode === 2 && /directory change/.test(v.stderr || ''),
        `ABlueAgent + PowerShell ${JSON.stringify(cmd)}: a push after cd.. is refused`);
    }
    const unread = guard.decide(pwsh("$c = 'git push origin x'; iex $c"), agentLogin);
    assert(unread.exitCode === 2 && /form the guard cannot read/.test(unread.stderr || ''),
      'ABlueAgent + PowerShell iex of a variable holding a push: refused as unreadable');
  }
  assert(wordsAsked === 2 * WORDS_PS.length, `one gh login check per word-scan decision (${wordsAsked} for ${2 * WORDS_PS.length})`);
  const wordsOff = guard.decide(pwsh("Write-Host 'gh pr create'"), () => ({ error: 'gh is not installed or not on PATH' }));
  assert(wordsOff.exitCode === 0 && /couldn't check/.test(wordsOff.systemMessage), 'word scan, gh not installed: exit 0 with the notice (fails open, as before)');
  const pushWordsOff = guard.decide(pwsh("Write-Host 'git push'"), () => ({ error: 'gh is not installed or not on PATH' }));
  assert(pushWordsOff.exitCode === 0 && /no push destination was checked/.test(pushWordsOff.systemMessage || ''),
    'word-scan push, gh not installed: exit 0 with the visible word-scan notice (review run 1 on #324)');
  const pushWordsOffRun = guard.decide(pwsh("$c = 'git push origin x'; iex $c"), () => ({ error: 'gh is not installed or not on PATH' }));
  assert(pushWordsOffRun.exitCode === 2 && /form the guard cannot read/.test(pushWordsOffRun.stderr || ''),
    'word-scan push run as text, gh not installed: refused visibly');
  // A review or merge command the splitter finds still wins over the word scan's login check.
  assert(ps("Write-Host 'git push'; gh pr merge 5") === 'gh pr merge', 'a parsed merge wins over a word-scan push');
  assert(ps("git push; Write-Host 'gh pr merge'") === 'git push', 'a parsed push comes before a word-scan merge (both get the login check)');
  // Review run 9: only `return`, `throw` and `exit` start a command later in the statement. Any other
  // first word (Write-Host, echo, cmd without /c) isn't read as running what follows, so the words of a
  // guarded command there get the word scan's login check, not the every-login block.
  for (const cmd of ['Write-Host gh pr merge 5', 'Write-Output return git push', 'cmd /c echo git push']) {
    const hit = ps(cmd);
    assert(typeof hit === 'string' && hit.endsWith(guard.PS_WORDS_NOTE) && !guard.ALWAYS_BLOCKED.has(hit),
      `PowerShell ${JSON.stringify(cmd)}: the word scan's login check only (${hit})`);
  }
  // Review run 9: a guarded statement next to a long nested chain that holds no guarded command is
  // classified in about the same time as on b047805. The second pass from a later word (review run 8)
  // doubled the work at every nesting level and ran past the hook's 30-second timeout (fails open).
  for (const [label, cmd, limit] of [
    ['git push; 10 nested pwsh -c, 10 KB', 'git push; ' + 'pwsh -c '.repeat(10) + 'x '.repeat(5000), 4000],
    ['git push; 10 nested iex, 100 KB', 'git push; ' + 'iex '.repeat(10) + 'x '.repeat(50000), 4000],
    ['git push; return and 10 nested pwsh -c, 10 KB', 'git push; return ' + 'pwsh -c '.repeat(10) + 'x '.repeat(5000), 4000],
    ['git push; 10 x (return pwsh -c), 10 KB', 'git push; ' + 'return pwsh -c '.repeat(10) + 'x '.repeat(5000), 4000]]) {
    const t0 = Date.now();
    const verdict = guard.decide(pwsh(cmd), counting);
    const ms = Date.now() - t0;
    assert(verdict.exitCode === 2 && /nesting|work budget/.test(verdict.stderr || '') && ms < limit,
      `PowerShell ${label}: scan limit blocked in ${ms} ms (under ${limit})`);
  }
  // Review run 6: no input makes the splitter backtrack. Long comment lines and many block comments
  // after line breaks finish quickly (a pattern that backtracked took seconds at about 30 characters).
  for (const [label, cmd] of [['a line of 200 #', 'Write-Output a\n' + '#'.repeat(200) + '\nGet-Thing'],
    ['200 block comments', 'Write-Output a\n' + '<#x#>'.repeat(200) + '\nGet-Thing'],
    ['2,000 lines of #', ('Write-Output a\n' + '#'.repeat(40) + '\n').repeat(2000)]]) {
    const t0 = Date.now();
    const r = guard.findGuardedCommand(cmd, 0, 'ps');
    const ms = Date.now() - t0;
    assert(ms < 2000 && r !== 'command scan limit', `PowerShell ${label}: classified in ${ms} ms (under 2,000), a finished scan (${r})`);
  }
  // Review run 8: the word scan and the after-a-keyword check stay linear on long and odd inputs.
  for (const [label, cmd, expect] of [['50,000 gh pr merge', 'gh pr merge 5 '.repeat(50000)],
    ['100,000 backticks', '`'.repeat(100000) + 'git push'],
    ['50,000 unfinished `u{', '`u{'.repeat(50000) + '67'],
    ['50,000 `u{67}', '`u{67}'.repeat(50000)],
    ['100,000 quotes', "'".repeat(100000)],
    ['20,000 returns', 'return '.repeat(20000) + 'git push'],
    ['20,000 gits on one line', 'Write-Host ' + 'git '.repeat(20000)],
    ['20,000 iex', 'iex '.repeat(20000) + 'git push', 'limit'],
    ['30,000 short statements', 'return gh pr view 5; '.repeat(30000), 'limit'],
    ['100,000 dots', '.'.repeat(100000) + 'a'],
    ['100,000 a.', 'a.'.repeat(100000)],
    ['100,000 dashes', '-'.repeat(100000) + 'x']]) {
    // `limit`: the input is built to exhaust the nesting or work budget, so the scan stops there (a
    // visible refusal in decide); every other input finishes its scan.
    const t0 = Date.now();
    let r;
    const threw = (() => { try { r = guard.findGuardedCommand(cmd, 0, 'ps'); return false; } catch { return true; } })();
    const ms = Date.now() - t0;
    const finished = expect === 'limit' ? r === 'command scan limit' : r !== 'command scan limit';
    assert(!threw && ms < 2000 && finished, `PowerShell ${label}: classified in ${ms} ms (under 2,000), no throw, ${expect === 'limit' ? 'stopped at the budget' : 'a finished scan'} (${r})`);
  }
  // A seeded fuzz: random PowerShell-ish scripts never throw, finish quickly, and any script that holds
  // `git` and `push` as words (with random text between, after and around them) is always guarded.
  let seed = 218;
  const rand = (n) => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
  const PIECES = ['git', 'push', 'gh', 'pr', 'merge', 'return', 'throw', '&', '.', '|', ';', '{', '}', '(', ')', '@(', '$(', '$x', '=', ',',
    "'", '"', '`', '`n', '`u{67}', '#', '<#', '#>', '@\'\n', '\n\'@', '\n', '\r', '\r\n', ' ', '\t', 'iex', 'cmd /c', 'Start-Process', '--%', '^', '\\', '\u2028', '\u0085'];
  let fuzzThrew = 0, fuzzSlow = 0, fuzzMissed = 0, fuzzWorst = 0, fuzzLimited = 0;
  for (let n = 0; n < 3000; n++) {
    let text = '';
    for (let k = rand(40); k > 0; k--) text += PIECES[rand(PIECES.length)];
    const sep = [' ', '\n', ';', ',', "' '", '`\n', ' # ', '\r'][rand(8)];
    const guardedText = text + ' git' + sep + 'push ' + text;
    for (const t of [text, guardedText]) {
      const t0 = Date.now();
      let r;
      try { r = guard.findGuardedCommand(t, 0, 'ps'); } catch { fuzzThrew++; }
      const ms = Date.now() - t0;
      fuzzWorst = Math.max(fuzzWorst, ms);
      if (ms > 500) fuzzSlow++;
      if (r === 'command scan limit') fuzzLimited++;
      if (t === guardedText && !r) fuzzMissed++;
    }
  }
  assert(fuzzThrew === 0 && fuzzSlow === 0, `fuzz: 6,000 PowerShell inputs, no throw, none over 500 ms (slowest ${fuzzWorst} ms)`);
  assert(fuzzMissed === 0, `fuzz: every input holding the words git and push is guarded (${fuzzMissed} missed)`);
  assert(fuzzLimited === 0, `fuzz: every input finishes its scan, none stops at the work budget (${fuzzLimited} stopped)`);
  const bashMissing = guard.decide({ tool_name: 'Bash', tool_input: {} }, () => ({ login: 'ABlueAI' }));
  assert(bashMissing.exitCode === 0 && !bashMissing.systemMessage, 'Bash with no command: unchanged (exit 0, silent)');
  // Only the two tools' exact names are checked (the names hooks see: docs, tools reference).
  assert(guard.decide({ tool_name: 'Read', tool_input: { command: 'git push' } }, () => ({ login: 'ABlueAI' })).exitCode === 0,
    'a tool other than Bash or PowerShell is not checked');
}

// ---------------------------------------------------------------------------------------------
process.stdout.write('\nend to end: the real script with a fake gh on PATH\n');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'account-guard-'));
const binDir = path.join(tmp, 'bin');
const emptyDir = path.join(tmp, 'empty');
const workDir = path.join(tmp, 'work');
const logFile = path.join(tmp, 'gh-calls.log');
for (const d of [binDir, emptyDir, workDir]) fs.mkdirSync(d);
const testGit = (args) => execFileSync('git', ['-C', workDir, ...args], { stdio: 'pipe' });
testGit(['init', '--initial-branch=topic']);
testGit(['remote', 'add', 'origin', 'https://github.com/o/r.git']);

// A fake `gh`: a copy of node. `gh api user --jq .login` then runs `node api user --jq .login`,
// which loads ./api.js from the hook's working directory: the stub below.
const ghPath = path.join(binDir, process.platform === 'win32' ? 'gh.exe' : 'gh');
try { fs.linkSync(process.execPath, ghPath); } catch { fs.copyFileSync(process.execPath, ghPath); }
fs.chmodSync(ghPath, 0o755);
fs.writeFileSync(path.join(workDir, 'api.js'), `
const fs = require('fs');
fs.appendFileSync(process.env.FAKE_GH_LOG, process.argv.slice(2).join(' ') + '\\n');
const mode = process.env.FAKE_GH_MODE;
if (process.argv.slice(2).some((arg) => arg.startsWith('repos/o/r/pulls?'))) {
  if (mode === 'pulls-offline') { process.stderr.write('error connecting to api.github.com\\n'); process.exit(1); }
  if (mode === 'pulls-object') { process.stdout.write('{}\\n'); process.exit(0); }
  process.stdout.write(JSON.stringify([{ user: { login: 'AnotherAgent' }, head: { ref: 'shared', repo: { full_name: 'o/r' } }, base: { ref: 'main', repo: { full_name: 'o/r' } } }]) + '\\n');
  process.exit(0);
}
if (mode === 'notloggedin') {
  process.stderr.write('To get started with GitHub CLI, please run:  gh auth login\\n');
  process.exit(4);
}
if (mode === 'apptoken') {
  process.stderr.write('gh: Resource not accessible by integration (HTTP 403)\\n');
  process.exit(1);
}
process.stdout.write(mode + '\\n');
`);

function runHook(command, { mode, pathDir = binDir, toolName = 'Bash' } = {}) {
  const env = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (!/^path$/i.test(k) && !/^(GH_|GITHUB_)/i.test(k)) env[k] = v;
  }
  const systemPath = Object.entries(process.env).find(([key]) => /^path$/i.test(key))?.[1];
  env.PATH = pathDir === binDir && systemPath ? binDir + path.delimiter + systemPath : pathDir;
  env.FAKE_GH_MODE = mode || 'ABlueAgent';
  env.FAKE_GH_LOG = logFile;
  const input = JSON.stringify({
    session_id: 'test', cwd: workDir, hook_event_name: 'PreToolUse',
    tool_name: toolName, tool_input: { command, description: 'test' }, tool_use_id: 'toolu_test',
  });
  return spawnSync(process.execPath, [HOOK], { cwd: workDir, env, input, encoding: 'utf8', timeout: 30000 });
}
const ghCalls = () => (fs.existsSync(logFile) ? fs.readFileSync(logFile, 'utf8').trim().split('\n').filter(Boolean) : []);

{
  const r = runHook('git add -A && git push -u origin x', { mode: 'ABlueAI' });
  assert(r.status === 2, `ABlueAI + chained git push: exit 2 (got ${r.status})`);
  assert(/Blocked by Mako's account guard/.test(r.stderr) && /cloud session/.test(r.stderr),
    'ABlueAI: stderr says why and where to hand the work');
  assert(ghCalls().pop() === 'user --jq .login', 'the fake gh was asked `api user --jq .login`');
}
{
  const r = runHook('gh pr create --fill', { mode: 'ABlueAgent' });
  assert(r.status === 0, `ABlueAgent + gh pr create: exit 0 (got ${r.status})`);
  assert(r.stdout.trim() === '' && r.stderr.trim() === '', 'ABlueAgent: nothing printed');
}
{
  const r = runHook('gh pr ready 5', { mode: 'notloggedin' });
  assert(r.status === 0, `gh not logged in + gh pr ready: exit 0 (got ${r.status})`);
  let msg = null;
  try { msg = JSON.parse(r.stdout).systemMessage; } catch { /* asserted below */ }
  assert(typeof msg === 'string' && /couldn't check/.test(msg), 'not logged in: systemMessage notice in JSON on stdout');
}
{
  const r = runHook('gh pr create', { pathDir: emptyDir });
  assert(r.status === 0, `gh not installed + gh pr create: exit 0 (got ${r.status})`);
  let msg = null;
  try { msg = JSON.parse(r.stdout).systemMessage; } catch { /* asserted below */ }
  assert(typeof msg === 'string' && /not installed/.test(msg), 'gh not installed: the notice says gh is missing');
}
{
  const before = ghCalls().length;
  for (const cmd of ['git status', 'npm test', 'gh pr view 1', 'git commit -m "git push"']) {
    const r = runHook(cmd, { mode: 'ABlueAI' });
    assert(r.status === 0 && r.stdout === '' && r.stderr === '', `ABlueAI + ${JSON.stringify(cmd)}: exit 0, silent`);
  }
  const r = runHook('git push', { mode: 'ABlueAI', toolName: 'Read' });
  assert(r.status === 0, 'another tool: exit 0');
  assert(ghCalls().length === before, 'non-matching commands never started gh');
}
{
  // A gh planted in the working directory (a checkout) is never run: gh comes from PATH's absolute
  // entries only (Windows would otherwise look in the current directory first).
  const planted = path.join(workDir, process.platform === 'win32' ? 'gh.exe' : 'gh');
  fs.copyFileSync(ghPath, planted);
  fs.chmodSync(planted, 0o755);
  const before = ghCalls().length;
  const r = runHook('gh pr create', { mode: 'ABlueAI', pathDir: emptyDir });
  assert(r.status === 0 && /not installed/.test(r.stdout), 'a gh in the working directory is ignored when PATH has none');
  assert(ghCalls().length === before, 'the planted gh never ran');
  assert(guard.resolveGh({ PATH: ['.', '', 'relative/dir'].join(path.delimiter) }) === null,
    'relative and empty PATH entries are skipped');
  assert(guard.resolveGh({ PATH: binDir }) === ghPath, 'gh is found in an absolute PATH entry');
  assert(guard.resolveGh({ PATH: '"' + binDir + '"' }) === ghPath, 'a double-quoted PATH entry is read without its quotes');
  fs.unlinkSync(planted);
}
{
  const env = { ...process.env, PATH: binDir, FAKE_GH_MODE: 'ABlueAI', FAKE_GH_LOG: logFile };
  const r = spawnSync(process.execPath, [HOOK], { cwd: workDir, env, input: 'not json', encoding: 'utf8' });
  assert(r.status === 0 && /couldn't read the hook input/.test(r.stdout), 'unreadable input: exit 0 with a notice');
}
{
  // App identities, end to end.
  const bot = runHook('git push -u origin x', { mode: 'mako-agents[bot]' });
  assert(bot.status === 0 && bot.stdout.trim() === '' && bot.stderr.trim() === '', 'mako-agents[bot] + git push: exit 0, nothing printed');
  const app = runHook('git push -u origin x', { mode: 'apptoken' });
  assert(app.status === 0, `installation token (gh api user answers 403) + git push: exit 0 (got ${app.status})`);
  let msg = null;
  try { msg = JSON.parse(app.stdout).systemMessage; } catch { /* asserted below */ }
  assert(typeof msg === 'string' && /installation token/.test(msg) && !/couldn't check/.test(msg),
    'installation token: the notice says why, and is not the unknown-error notice');
}
{
  const before = ghCalls().length;
  const budget = runHook('pwsh -c '.repeat(8) + 'Write-Output ' + 'a'.repeat(100000), { toolName: 'PowerShell' });
  assert(budget.status === 2 && /work budget/.test(budget.stderr) && ghCalls().length === before,
    'nested shell work is visibly refused by the hook process without a gh call');
  const shared = runHook('git push origin HEAD:shared');
  assert(shared.status === 2 && /in use by another open pull request/.test(shared.stderr),
    'shared push destination is refused by the hook process');
  testGit(['config', 'remote.origin.push', 'refs/heads/topic:refs/heads/shared']);
  const configured = runHook('git push');
  assert(configured.status === 2 && /in use by another open pull request/.test(configured.stderr),
    'a configured remote push refspec is resolved and checked by the hook process');
  testGit(['config', '--unset', 'remote.origin.push']);
  const unavailable = runHook('git push origin topic', { mode: 'pulls-offline' });
  assert(unavailable.status === 2 && /GitHub could not verify/.test(unavailable.stderr),
    'an unavailable PR check refuses visibly in the hook process');
  const missing = runHook('git push origin topic', { pathDir: emptyDir });
  assert(missing.status === 2 && /could not verify|not installed/.test(missing.stderr),
    'missing push verification tools visibly refuse the push');
  // Review run 1 on #324: each failure names its cause; a refusal raised inside keeps its own text.
  assert(/\(gh api pulls: exit 1: error connecting to api\.github\.com\)/.test(unavailable.stderr),
    `the PR check failure names the operation, exit status and stderr's first line (${unavailable.stderr.trim()})`);
  const objectPage = runHook('git push origin topic', { mode: 'pulls-object' });
  assert(objectPage.status === 2 && /git push refused because GitHub returned an unreadable pull request list\./.test(objectPage.stderr),
    `a refusal raised inside the PR lookup is not reworded (${objectPage.stderr.trim()})`);
  // A push after a directory change runs git in that directory: another checkout on another
  // author's PR branch is refused, the session's own checkout is allowed.
  const other = path.join(tmp, 'other-checkout');
  fs.mkdirSync(other);
  execFileSync('git', ['-C', other, 'init', '--initial-branch=shared'], { stdio: 'pipe' });
  execFileSync('git', ['-C', other, 'remote', 'add', 'origin', 'https://github.com/o/r.git'], { stdio: 'pipe' });
  const elsewhere = runHook(`cd '${other}' && git push`);
  assert(elsewhere.status === 2 && /in use by another open pull request/.test(elsewhere.stderr),
    `cd <other checkout> && git push: checked in that checkout and refused (${elsewhere.stderr.trim()})`);
  const here = runHook('git push');
  assert(here.status === 0, `git push in the session's own checkout: allowed (${here.stderr.trim()})`);
  const psElsewhere = runHook(`Set-Location '${other}'; git push`, { toolName: 'PowerShell' });
  assert(psElsewhere.status === 2 && /in use by another open pull request/.test(psElsewhere.stderr), 'PowerShell Set-Location <other checkout>; git push: refused');
  const unfollowed = runHook(`git status && cd '${other}' && git push`);
  assert(unfollowed.status === 2 && /directory change the guard could not follow/.test(unfollowed.stderr), 'a directory change the hook cannot follow: refused visibly');
  const noRemote = runHook(`cd '${emptyDir}' && git push origin topic`);
  assert(noRemote.status === 2 && /Git could not verify the push destination \(git (?:remote|config): exit \d+/.test(noRemote.stderr),
    `a failed git check names the operation and exit status (${noRemote.stderr.trim()})`);
  execFileSync('git', ['-C', other, 'commit', '--allow-empty', '-m', 'x', '-q'], { stdio: 'pipe', env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@invalid', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@invalid' } });
  execFileSync('git', ['-C', other, 'checkout', '-q', '--detach'], { stdio: 'pipe' });
  const detached = runHook(`cd '${other}' && git push`);
  assert(detached.status === 2 && /the current branch could not be verified\./.test(detached.stderr), `detached HEAD: its own refusal text end to end (${detached.stderr.trim()})`);
}
{
  // Review and merge commands: blocked under every login and even with no gh at all.
  const before = ghCalls().length;
  for (const mode of ['ABlueAgent', 'ABlueAI', 'mako-agents[bot]', 'apptoken', 'notloggedin']) {
    const r = runHook('gh pr review 7 --approve', { mode });
    assert(r.status === 2 && /Agents never approve or merge/.test(r.stderr), `gh pr review under ${mode}: exit 2 with the never-approve message`);
  }
  const behind = runHook('git push -u origin x && gh pr merge 7 --squash', { mode: 'ABlueAgent' });
  assert(behind.status === 2 && /gh pr merge/.test(behind.stderr), 'a merge behind a push under ABlueAgent: exit 2 end to end');
  const noGh = runHook('gh api repos/o/r/pulls/7/merge -X PUT', { pathDir: emptyDir });
  assert(noGh.status === 2 && /gh api merge/.test(noGh.stderr), 'gh api PUT .../merge with no gh on PATH: still exit 2');
  assert(ghCalls().length === before, 'blocking a review or merge command never started gh');
  const read = runHook('gh api repos/o/r/pulls/7/reviews --jq ".[].state"', { mode: 'ABlueAI' });
  assert(read.status === 0 && read.stdout === '' && read.stderr === '', 'a read of /reviews is not blocked and starts no gh');
}
{
  // The PowerShell tool, end to end: the same input Claude Code sends, with tool_name "PowerShell".
  const callsBefore = ghCalls().length;
  const r = runHook('& gh.exe pr create --fill', { mode: 'ABlueAI', toolName: 'PowerShell' });
  assert(r.status === 2 && /Blocked by Mako's account guard/.test(r.stderr) && /gh pr create/.test(r.stderr),
    `ABlueAI + PowerShell & gh.exe pr create: exit 2 end to end (got ${r.status})`);
  const newCalls = ghCalls().slice(callsBefore);
  assert(newCalls.length === 1 && newCalls[0] === 'user --jq .login', 'PowerShell: this run asked the fake gh `api user --jq .login` once');
  const push = runHook('git -C ..\\wt push `\n  origin x', { mode: 'ABlueAI', toolName: 'PowerShell' });
  assert(push.status === 2 && /git push/.test(push.stderr), `ABlueAI + PowerShell git -C <dir> push with a line continuation: exit 2 (got ${push.status})`);
  const agent = runHook('git push -u origin x', { mode: 'ABlueAgent', toolName: 'PowerShell' });
  assert(agent.status === 0 && agent.stdout.trim() === '' && agent.stderr.trim() === '', 'ABlueAgent + PowerShell git push: exit 0, nothing printed');
  const before = ghCalls().length;
  const merge = runHook("Start-Process gh 'pr merge 5'", { mode: 'ABlueAgent', toolName: 'PowerShell' });
  assert(merge.status === 2 && /Agents never approve or merge/.test(merge.stderr), 'ABlueAgent + PowerShell Start-Process gh pr merge: exit 2 end to end');
  const quiet = runHook('git status', { mode: 'ABlueAI', toolName: 'PowerShell' });
  assert(quiet.status === 0 && quiet.stdout === '' && quiet.stderr === '', 'ABlueAI + PowerShell git status: exit 0, silent');
  assert(ghCalls().length === before, 'PowerShell: a review or merge block and a non-matching command never started gh');
  // Review run 8: words in a here-string now get the login check, end to end.
  const words = runHook("git commit -m @'\ngit push later\n'@", { mode: 'ABlueAI', toolName: 'PowerShell' });
  assert(words.status === 2 && words.stderr.includes(guard.PS_WORDS_NOTE), `ABlueAI + PowerShell commit with "git push" in its here-string: exit 2 (got ${words.status})`);
  const wordsAgentRun = runHook("git commit -m @'\ngit push later\n'@", { mode: 'ABlueAgent', toolName: 'PowerShell' });
  // Review run 1 on #324: with no readable push and nothing run as text, the commit goes ahead with a
  // visible notice that no push destination was checked.
  assert(wordsAgentRun.status === 0 && /no push destination was checked/.test(wordsAgentRun.stdout + wordsAgentRun.stderr),
    `ABlueAgent + the same commit: exit 0 with the visible word-scan notice (got ${wordsAgentRun.status})`);
  const commitAndPush = runHook("git commit -m @'\ngit push later\n'@\ngit push origin topic", { mode: 'ABlueAgent', toolName: 'PowerShell' });
  assert(commitAndPush.status === 0 && commitAndPush.stderr.trim() === '', `ABlueAgent + that commit followed by a plain push: exit 0, the push is checked (got ${commitAndPush.status}: ${commitAndPush.stderr.trim()})`);
  const returned = runHook('& { return git push origin HEAD }', { mode: 'ABlueAI', toolName: 'PowerShell' });
  assert(returned.status === 2 && /git push/.test(returned.stderr), `ABlueAI + PowerShell & { return git push origin HEAD }: exit 2 end to end (got ${returned.status})`);
}
try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* temp cleanup is best effort */ }

// ---------------------------------------------------------------------------------------------
process.stdout.write('\ngit aliases (issue #337)\n');
{
  const find = (c, mode = 'bash') => guard.findGuardedCommand(c, 0, mode);
  const NOTE = guard.GIT_ALIAS_NOTE;
  const noted = (hit) => typeof hit === 'string' && hit.startsWith('git push' + NOTE + ': ');
  // An alias defined on the command itself.
  assert(find('git -c alias.p=push p origin x') === 'git push', '`-c alias.NAME=push` then `git NAME` is a push');
  assert(find('git -c alias.P=push p') === 'git push', 'alias names are case-insensitive, as in git');
  assert(find("git -c 'alias.sync=push --force-with-lease' sync") === 'git push', 'an alias whose value is push with options');
  assert(find('git -c alias.a=b -c alias.b=push a') === 'git push', 'an alias of an alias');
  assert(find("git -c 'alias.p=!git push' p") === 'git push', 'a shell alias (`!...`) is checked as Bash');
  assert(find("git -c 'alias.m=!gh pr merge 5' m") === 'gh pr merge', 'a shell alias that merges is a merge (blocked under any login)');
  assert(find('git -c alias.p=status p') === null, 'an alias to another command is not a push');
  assert(find('git -c alias.status=push status') === null, 'git ignores an alias that hides its own command, and so does the guard');
  assert(noted(find('git -c alias.a=a a')), 'an alias loop gets the login check (fail-closed)');
  assert(noted(find('git --config-env=alias.p=VAR p')) && noted(find('git --config-env alias.p=VAR p')), '`--config-env alias.NAME=VAR` (both spellings): value unknown, login check');
  assert(find('GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=alias.p GIT_CONFIG_VALUE_0=push git p') === 'git push', 'GIT_CONFIG_KEY_n/VALUE_n on the command');
  assert(noted(find("GIT_CONFIG_PARAMETERS=\"'alias.p'='push'\" git p")), 'GIT_CONFIG_PARAMETERS naming the alias: login check');
  assert(noted(find('git config alias.p push && git p')), 'an alias set by `git config` in the same call gets the login check');
  assert(noted(find('git config --global alias.p push; git p origin')), '... with --global');
  assert(find('bash -c "git -c alias.p=push p"') === 'git push', 'inside `bash -c`');
  assert(find('git -c alias.p=push p', 'ps') === 'git push', 'the PowerShell tool');
  // Review run 1 fixes.
  assert(find("git -c 'alias.g=!git' g push origin x") === 'git push', "a shell alias gets the call's remaining words, as git passes them");
  assert(find("git -c 'alias.g=!git' g status") === null, '... and they are only words: `git status` through it is not a push');
  assert(noted(find(`git -c 'alias.run=!f() { git "$@"; }; f' run push`)), 'a shell alias that reads its arguments, given some: login check');
  assert(find(`git -c 'alias.run=!f() { git "$@"; }; f' run`) === null, '... and given none, its own text is checked');
  assert(noted(find(`git -c "alias.g=!sh -c 'git $0'" g push`)), 'a nested `sh -c` reading $0, given arguments: login check');
  assert(noted(find("git -c 'alias.p=!git q' -c alias.q=push p")), "aliases the outer call defines stay known inside a shell alias");
  assert(find("git -c 'alias.p=push --push-option=$(x) origin HEAD' p") === 'git push', 'a plain alias value is split like git does: `$(...)` is just text');
  assert(find(`git -c 'alias.p=push "a b"' p`) === 'git push', 'quoted words in a plain alias value');
  assert(find(`git -c 'alias.p=push "a' p`) === null, 'git refuses an alias value with an unclosed quote');
  assert(noted(find('export GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=alias.p GIT_CONFIG_VALUE_0=push; git p')), 'an alias exported earlier in the same call (Bash): login check');
  assert(noted(find("$env:GIT_CONFIG_COUNT=1; $env:GIT_CONFIG_KEY_0='alias.p'; $env:GIT_CONFIG_VALUE_0='push'; git p", 'ps')), '... and through $env: (PowerShell)');
  assert(find('git -c alias.subtree=push subtree') === 'git push', "a script's name (git subtree) is not a built-in, so the alias is read");
  assert(find('git lfs pull') === null && find('git p') === null, 'without a lookup, an unknown subcommand is not a push');
  assert(guard.GIT_COMMANDS.has('push') && guard.GIT_COMMANDS.has('status') && !guard.GIT_COMMANDS.has('lfs'), "the list of git's own commands");

  // Configured aliases, through decide()'s lookup.
  const ablue = () => ({ login: 'ABlueAI' });
  const lookups = [];
  const aliases = (map) => ({ ...withPushSources, gitAlias: (name, opts, cwd) => { lookups.push({ name, opts, cwd }); return name in map ? { value: map[name] } : { none: true }; } });
  const failing = (error) => ({ ...withPushSources, gitAlias: () => ({ error }) });
  assert(guard.decide(bash('git p origin x'), ablue, aliases({ p: 'push' })).exitCode === 2, 'a configured `alias.p = push`: `git p` is blocked under ABlueAI');
  assert(guard.decide(bash('git pf'), ablue, aliases({ pf: '!git push --force-with-lease' })).exitCode === 2, 'a configured shell alias that pushes is blocked under ABlueAI');
  assert(guard.decide(bash('git p'), () => ({ login: 'ABlueAgent' }), aliases({ p: 'push' })).exitCode === 0, 'the same alias is allowed under an agent login');
  lookups.length = 0;
  assert(guard.decide(bash('git lfs pull'), ablue, aliases({})).exitCode === 0 && lookups.length === 1 && lookups[0].name === 'lfs',
    'an unknown subcommand that is no alias: allowed, after one lookup');
  lookups.length = 0;
  assert(guard.decide(bash('git status && git log'), ablue, aliases({})).exitCode === 0 && lookups.length === 0, "git's own commands are never looked up");
  lookups.length = 0;
  guard.decide({ ...bash('git -C ../wt -c x=y p'), cwd: REPO_ROOT }, ablue, aliases({}));
  assert(lookups.length === 1 && lookups[0].cwd === REPO_ROOT && lookups[0].opts.includes('-C'), "the lookup gets the hook input's cwd and git's options");
  const v = guard.decide(bash('git p'), ablue, failing('ETIMEDOUT'));
  assert(v.exitCode === 2 && v.stderr.includes(NOTE + ': ETIMEDOUT)'), 'a lookup that fails gets the login check, with its reason');
  lookups.length = 0;
  const noCwd = guard.decide({ ...bash('git p'), cwd: 'rel/dir' }, ablue, aliases({}));
  assert(lookups.length === 0 && noCwd.exitCode === 2 && noCwd.stderr.includes('no usable cwd'), 'a hook input without a usable cwd: no lookup, login check, with the reason');
  const missingCwd = guard.decide({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'git p' } }, ablue, aliases({}));
  assert(missingCwd.exitCode === 2, '... and with no cwd at all');
  lookups.length = 0;
  const lfs = guard.decide(bash('git lfs install && git lfs fetch && git lfs checkout && git lfs prune && git lfs ls-files'), ablue, aliases({}));
  assert(lfs.exitCode === 0 && lookups.length === 1, 'the same name is looked up once per call, so repeats never use up the budget');
  lookups.length = 0;
  const many = guard.decide(bash('git a; git b; git c; git d; git e'), ablue, aliases({}));
  assert(lookups.length === 4 && many.exitCode === 2 && many.stderr.includes('more than 4 aliases'), 'at most 4 lookups per call; past that, the login check, with the reason');
  assert(guard.decide(bash('git p'), () => ({ login: 'ABlueAgent' }), aliases({ p: '!gh pr merge 1' })).exitCode === 2,
    'a configured shell alias that merges is blocked under any login');

  // On main's push checks (#324): a push through an alias gets them, and an unreadable alias is refused.
  const agentLogin = () => ({ login: 'ABlueAgent' });
  {
    const r = guard.decide(bash('git -c alias.p=push p origin HEAD:main'), agentLogin, withPushSources);
    assert(r.exitCode === 2 && /git push refused/.test(r.stderr || ''), 'a push to main through an alias is refused under an agent login (push checks)');
    const f = guard.decide(bash('git p origin x'), agentLogin, aliases({ p: 'push --force' }));
    assert(f.exitCode === 2 && /git push refused/.test(f.stderr || ''), 'a configured alias that force-pushes is refused under an agent login');
    const u = guard.decide(bash('git p'), agentLogin, failing('ETIMEDOUT'));
    assert(u.exitCode === 2 && /git alias whose value could not be read \(ETIMEDOUT\)/.test(u.stderr || ''), 'an alias whose value could not be read is refused under an agent login, with the reason');
    const a = guard.decide(bash(`git -c 'alias.run=!f() { git "$@"; }; f' run push`), agentLogin, withPushSources);
    assert(a.exitCode === 2 && /reads its arguments/.test(a.stderr || ''), 'a shell alias that reads its arguments, given some, is refused under an agent login');
    assert(guard.decide(bash('git lfs pull'), agentLogin, aliases({})).exitCode === 0, 'an unknown subcommand that is no alias is allowed under an agent login');
    // Review run 4: a shell alias's push loses the outer call's -C and -c options, so it is refused.
    for (const cmd of [
      `git -C ${REPO_ROOT} -c 'alias.p=!git push origin x' p`,
      "git -c remote.origin.pushurl=https://example.invalid/o/r.git -c 'alias.p=!git push origin x' p",
      "git --git-dir=.git -c 'alias.p=!git push origin x' p",
    ]) {
      const r = guard.decide(bash(cmd), agentLogin, withPushSources);
      assert(r.exitCode === 2 && /git options that change where it pushes/.test(r.stderr || ''), `refuse a shell alias's push run with git options: ${cmd}`);
    }
    assert(guard.decide(bash("git -c 'alias.p=!git push origin x' p"), agentLogin, withPushSources).exitCode === 0,
      'a shell alias defined by `-c alias.*` alone keeps its push checks and is allowed when they pass');
    assert(guard.decide(bash("git -C . -c 'alias.s=!git status' s"), agentLogin, withPushSources).exitCode === 0,
      'a shell alias with git options that runs no push is allowed');
    {
      const r = guard.decide(bash('git -C . p origin x'), agentLogin, aliases({ p: 'push' }));
      assert(r.exitCode === 0, 'a plain alias keeps -C on the expanded push, so it is checked, not refused');
    }
    let budget = 0;
    const slow = guard.decide(bash('git p'), agentLogin, { ...withPushSources, gitAlias: () => { budget++; return { none: true }; } });
    assert(slow.exitCode === 0 && budget === 1, 'the injected lookup runs once for one alias');
  }

  // The real lookup, against a throwaway repository.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'guard-alias-'));
  const gitRun = (args) => spawnSync('git', args, { cwd: dir, encoding: 'utf8' });
  if (gitRun(['init', '-q']).status === 0 && gitRun(['config', 'alias.pp', 'push origin HEAD']).status === 0) {
    const r = guard.readGitAlias('pp', [], dir);
    assert(r.value === 'push origin HEAD', 'readGitAlias reads a configured alias');
    assert(guard.readGitAlias('nosuchalias', [], dir).none === true, 'readGitAlias: an unset alias is { none: true }');
    const e2e = guard.decide({ ...bash('git pp'), cwd: dir }, ablue);
    assert(e2e.exitCode === 2 && !e2e.stderr.includes(NOTE), 'end to end through the real lookup: blocked under ABlueAI, the alias read (no note)');
    assert(guard.readGitAlias('pp', ['-C', dir], os.tmpdir()).value === 'push origin HEAD', 'readGitAlias passes -C to git');
    assert(guard.readGitAlias('pp', ['--git-dir=' + path.join(dir, '.git')], os.tmpdir()).value === 'push origin HEAD', 'readGitAlias passes --git-dir= to git');
    for (const unc of [['-C', '\\\\no-such-host\\share'], ['--git-dir=//no-such-host/x'], ['--work-tree', '\\\\h\\s']]) {
      const r2 = guard.readGitAlias('pp', unc, dir);
      assert(r2.error === 'the command names a network path', `readGitAlias never opens a network path (${unc.join(' ')})`);
    }
    const noGit = guard.readGitAlias('pp', [], dir, undefined, { PATH: path.join(dir, 'no-such-bin') });
    assert(typeof noGit.error === 'string' && /not installed|not on PATH/.test(noGit.error), 'readGitAlias with no git on PATH: an error, not "no alias"');
  } else {
    assert(false, 'git is available to set up the alias test repository');
  }
  fs.rmSync(dir, { recursive: true, force: true });
}

process.stdout.write('\n.claude/settings.json\n');
const settings = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, '.claude', 'settings.json'), 'utf8'));
// Every Bash deny rule (push, merge and review) has a PowerShell counterpart (issue #219).
// PowerShell rules take the same shape as Bash rules, `:*` suffix included: verified 2026-11-27 against
// https://code.claude.com/docs/en/permissions, "PowerShell" section ("PowerShell permission rules use
// the same shape as Bash rules").
const isBashDeny = (rule) => /^Bash\(/.test(rule);
const powerShellDenyFor = (rule) => rule.replace(/^Bash\(/, 'PowerShell(');
for (const rule of settings.permissions.deny.filter(isBashDeny)) {
  const counterpart = powerShellDenyFor(rule);
  assert(settings.permissions.deny.includes(counterpart), `${rule}: deny also includes ${counterpart}`);
}
const DENY = [
  'mcp__github__merge_pull_request',
  'mcp__github__enable_pr_auto_merge',
  'Bash(gh pr merge:*)',
  'Bash(git push origin main:*)',
  'Bash(git push origin HEAD:main:*)',
  'Bash(git push origin +main:*)',
  'Bash(git push --force:*)',
  'Bash(git push -f:*)',
  'Bash(git push --force-with-lease origin main:*)',
  // Review and merge variants, added 2026-11-11 (see "Verified" below).
  'mcp__github__pull_request_review_write',
  'Bash(gh pr review:*)',
  'Bash(gh api repos/*/pulls/*/reviews*)',
  'Bash(gh api /repos/*/pulls/*/reviews*)',
  'Bash(gh api repos/*/pulls/*/merge*)',
  'Bash(gh api /repos/*/pulls/*/merge*)',
  'Bash(gh api repos/*/merges*)',
  'Bash(gh api /repos/*/merges*)',
  'Bash(gh api repos/*/pulls/*/ccr/auto_merge*)',
  'Bash(gh api /repos/*/pulls/*/ccr/auto_merge*)',
];
const expectedDeny = [...DENY, ...DENY.filter(isBashDeny).map(powerShellDenyFor)];
assert(JSON.stringify(settings.permissions && settings.permissions.deny) === JSON.stringify(expectedDeny),
  'the deny rules are the expected list, including a PowerShell counterpart for every Bash rule');
// Verified 2026-11-11 against https://code.claude.com/docs/en/permissions (read that day):
//   * a Bash rule's `*` may stand anywhere and spans any text; `Bash(cmd:*)` is the same as `Bash(cmd *)`
//     but only at the end of a pattern; deny rules are checked first and a PreToolUse hook can't undo one;
//   * a rule matches the command text Claude writes: not `gh -R x api ...` or other forms, and a pattern
//     that constrains arguments is fragile (so the guard hook, which parses the command, is the stronger
//     layer, and these patterns are best effort);
//   * an `mcp__` rule with parentheses is skipped (its parameters can't be matched), so MCP rules are
//     bare tool names or `mcp__server__*`.
// Verified in a live cloud session the same day: after the entry was added to this file, the harness
// removed `mcp__github__pull_request_review_write` from the session's tools (denied by a permission
// rule), so that name is a real tool and the deny applies. The GitHub MCP server's merge tool names in
// the two older entries were not listed in that session, so they are unchanged and unverified here.
for (const rule of settings.permissions.deny) {
  assert(!/^mcp__.*\(/.test(rule), `${rule}: an MCP rule has no parentheses (Claude Code skips it otherwise)`);
  assert(!/^(Bash|PowerShell)\(command:/.test(rule), `${rule}: no \`command:\` form (Claude Code ignores it)`);
  assert(!/^(Bash|PowerShell)\(.*:\*.+\)$/.test(rule), `${rule}: \`:*\` appears only at the end of a pattern`);
}
assert(!settings.permissions.deny.some((r) => /^(Bash|PowerShell)\(gh api \*/.test(r)),
  'a gh api deny starts with the endpoint, so a comment body that merely says "reviews" or "merge" is not matched by a leading wildcard');
const groups = (settings.hooks && settings.hooks.PreToolUse) || [];
const entry = groups.find((g) => g.matcher === 'Bash|PowerShell');
const hook = entry && (entry.hooks || []).find((h) => /account-guard\.js$/.test((h.args || [])[0] || ''));
assert(!!hook, 'a PreToolUse hook with matcher "Bash|PowerShell" runs account-guard.js (the docs: "The matcher `Bash|PowerShell` covers the PowerShell tool as well as Bash")');
assert(hook && hook.type === 'command' && hook.command === 'node', 'exec form: command "node"');
assert(hook && JSON.stringify(hook.args) === JSON.stringify(['${CLAUDE_PROJECT_DIR}/.claude/hooks/account-guard.js']),
  'args point at the script through ${CLAUDE_PROJECT_DIR}');
assert(hook && !('onFailure' in hook), 'onFailure unset: in exec form a hook that fails to run never blocks (docs default)');
assert(hook && !('shell' in hook), 'no shell field (ignored in exec form anyway)');
assert(hook && typeof hook.timeout === 'number' && hook.timeout * 1000 > 10000,
  'timeout is longer than the 10-second gh call');
assert(fs.existsSync(path.join(REPO_ROOT, '.claude', 'hooks', 'account-guard.js')), 'the script exists at that path');
{
  const header = fs.readFileSync(path.join(REPO_ROOT, '.claude', 'hooks', 'account-guard.js'), 'utf8').split('\n').filter((l) => l.startsWith('//')).join('\n');
  for (const login of AGENT_LOGINS) assert(header.includes(login), `the hook's header names the agent login ${login} (shared list: .github/scripts/agent-logins.js)`);
  assert(/Known gaps/.test(header) && /gh api/.test(header.slice(header.indexOf('Known gaps'))), "the header's known-gaps list covers the gh api review and merge cases");
  assert(/Bash\|PowerShell/.test(header) && !/tools other than Bash \(Claude Code's PowerShell tool/.test(header),
    "the header says the hook runs for the PowerShell tool and no longer lists it as a gap (S37)");
}

process.stdout.write(`\naccount-guard: ${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
