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
const { spawnSync } = require('child_process');
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
const bash = (command) => ({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command } });

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
  const v = guard.decide(bash('git push -u origin x'), () => ({ login: 'ABlueAgent' }));
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
  const v = guard.decide(bash('git push'), () => ({ error: 'gh could not read the login (exit 4)' }));
  assert(v.exitCode === 0 && /couldn't check/.test(v.systemMessage), 'gh not logged in: exit 0 with the notice');
}
assert(guard.decide(bash('git push'), () => undefined).exitCode === 0, 'a login reader that returns nothing: exit 0');

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
  const g = guard.decide(bash('git push'), () => ({ login: 'ABlueAgent' }));
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
  const v = guard.decide(bash('git push -u origin x'), () => ({ login: 'mako-agents[bot]' }));
  assert(v.exitCode === 0 && !v.stderr && !v.systemMessage, 'mako-agents[bot] + git push: exit 0, silent');
  assert(guard.decide(bash('gh pr create --fill'), () => ({ login: 'Some-App[BOT]' })).exitCode === 0, 'any [bot] login passes');
  const t = guard.decide(bash('gh pr ready 5'), () => ({ appToken: true, error: 'a GitHub App installation token has no user login' }));
  assert(t.exitCode === 0 && /installation token/.test(t.systemMessage) && /gh pr ready/.test(t.systemMessage) && !/\n/.test(t.systemMessage),
    'an installation token: exit 0 with a one-line notice that names the token kind and the command');
  assert(!/couldn't check/.test(t.systemMessage), 'an installation token is not reported as an unknown error');
  const u = guard.decide(bash('git push'), () => ({ error: 'gh could not read the login (exit 1); it may not be logged in or offline' }));
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
{
  const v = guard.decide(pwsh('& gh.exe pr create --fill'), () => ({ login: 'ABlueAI' }));
  assert(v.exitCode === 2 && /ABlueAI/.test(v.stderr) && /gh pr create/.test(v.stderr), 'ABlueAI + PowerShell & gh.exe pr create: exit 2 with the block message');
  for (const cmd of ['git push', 'gh pr ready 5', 'git -C ..\\wt push', "git commit -m @'\nmsg\n'@\ngit push"]) {
    assert(guard.decide(pwsh(cmd), () => ({ login: 'ABlueAI' })).exitCode === 2, `ABlueAI + PowerShell ${JSON.stringify(cmd)}: exit 2`);
  }
  const ok = guard.decide(pwsh('git push -u origin x'), () => ({ login: 'ABlueAgent' }));
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
  for (const toolName of ['Bash', 'PowerShell']) {
    const missing = guard.decide({ tool_name: toolName, tool_input: {} }, never);
    assert(missing.exitCode === 2 && missing.stderr?.includes(`couldn't read the ${toolName} tool's command`) && !/\n/.test(missing.stderr),
      `${toolName} with no tool_input.command: exit 2 with a one-line refusal`);
  }
  assert(asked === 0, 'an unreadable shell command never starts gh');
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
    const agentOk = guard.decide(pwsh(cmd), () => ({ login: 'ABlueAgent' }));
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
  for (const [cmd] of WORDS_PS) {
    const blue = guard.decide(pwsh(cmd), () => { wordsAsked++; return { login: 'ABlueAI' }; });
    if (blue.exitCode === 2 && blue.checked === true && /Blocked by Mako's account guard/.test(blue.stderr) && blue.stderr.includes(guard.PS_WORDS_NOTE)) wordsBlue++;
    const agentV = guard.decide(pwsh(cmd), () => { wordsAsked++; return { login: 'ABlueAgent' }; });
    if (agentV.exitCode === 0 && !agentV.stderr && !agentV.systemMessage) wordsAgent++;
  }
  assert(wordsBlue === WORDS_PS.length, `every word-scan case exits 2 under ABlueAI with the block message (${wordsBlue} of ${WORDS_PS.length})`);
  assert(wordsAgent === WORDS_PS.length, `every word-scan case exits 0, silent, under ABlueAgent (${wordsAgent} of ${WORDS_PS.length})`);
  assert(wordsAsked === 2 * WORDS_PS.length, `one gh login check per word-scan decision (${wordsAsked} for ${2 * WORDS_PS.length})`);
  const wordsOff = guard.decide(pwsh("Write-Host 'git push'"), () => ({ error: 'gh is not installed or not on PATH' }));
  assert(wordsOff.exitCode === 0 && /couldn't check/.test(wordsOff.systemMessage), 'word scan, gh not installed: exit 0 with the notice (fails open, as before)');
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
    const hit = guard.findGuardedCommand(cmd, 0, 'ps');
    const ms = Date.now() - t0;
    assert(hit === 'git push' && ms < limit, `PowerShell ${label}: git push found in ${ms} ms (under ${limit})`);
  }
  // Review run 6: no input makes the splitter backtrack. Long comment lines and many block comments
  // after line breaks finish quickly (a pattern that backtracked took seconds at about 30 characters).
  for (const [label, cmd] of [['a line of 200 #', 'Write-Output a\n' + '#'.repeat(200) + '\nGet-Thing'],
    ['200 block comments', 'Write-Output a\n' + '<#x#>'.repeat(200) + '\nGet-Thing'],
    ['2,000 lines of #', ('Write-Output a\n' + '#'.repeat(40) + '\n').repeat(2000)]]) {
    const t0 = Date.now();
    guard.findGuardedCommand(cmd, 0, 'ps');
    const ms = Date.now() - t0;
    assert(ms < 2000, `PowerShell ${label}: classified in ${ms} ms (under 2,000)`);
  }
  // Review run 8: the word scan and the after-a-keyword check stay linear on long and odd inputs.
  for (const [label, cmd] of [['50,000 gh pr merge', 'gh pr merge 5 '.repeat(50000)],
    ['100,000 backticks', '`'.repeat(100000) + 'git push'],
    ['50,000 unfinished `u{', '`u{'.repeat(50000) + '67'],
    ['50,000 `u{67}', '`u{67}'.repeat(50000)],
    ['100,000 quotes', "'".repeat(100000)],
    ['20,000 returns', 'return '.repeat(20000) + 'git push'],
    ['20,000 gits on one line', 'Write-Host ' + 'git '.repeat(20000)],
    ['20,000 iex', 'iex '.repeat(20000) + 'git push'],
    ['30,000 short statements', 'return gh pr view 5; '.repeat(30000)],
    ['100,000 dots', '.'.repeat(100000) + 'a'],
    ['100,000 a.', 'a.'.repeat(100000)],
    ['100,000 dashes', '-'.repeat(100000) + 'x']]) {
    const t0 = Date.now();
    const threw = (() => { try { guard.findGuardedCommand(cmd, 0, 'ps'); return false; } catch { return true; } })();
    const ms = Date.now() - t0;
    assert(!threw && ms < 2000, `PowerShell ${label}: classified in ${ms} ms (under 2,000), no throw`);
  }
  // A seeded fuzz: random PowerShell-ish scripts never throw, finish quickly, and any script that holds
  // `git` and `push` as words (with random text between, after and around them) is always guarded.
  let seed = 218;
  const rand = (n) => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
  const PIECES = ['git', 'push', 'gh', 'pr', 'merge', 'return', 'throw', '&', '.', '|', ';', '{', '}', '(', ')', '@(', '$(', '$x', '=', ',',
    "'", '"', '`', '`n', '`u{67}', '#', '<#', '#>', '@\'\n', '\n\'@', '\n', '\r', '\r\n', ' ', '\t', 'iex', 'cmd /c', 'Start-Process', '--%', '^', '\\', '\u2028', '\u0085'];
  let fuzzThrew = 0, fuzzSlow = 0, fuzzMissed = 0, fuzzWorst = 0;
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
      if (t === guardedText && !r) fuzzMissed++;
    }
  }
  assert(fuzzThrew === 0 && fuzzSlow === 0, `fuzz: 6,000 PowerShell inputs, no throw, none over 500 ms (slowest ${fuzzWorst} ms)`);
  assert(fuzzMissed === 0, `fuzz: every input holding the words git and push is guarded (${fuzzMissed} missed)`);
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

// A fake `gh`: a copy of node. `gh api user --jq .login` then runs `node api user --jq .login`,
// which loads ./api.js from the hook's working directory: the stub below.
const ghPath = path.join(binDir, process.platform === 'win32' ? 'gh.exe' : 'gh');
try { fs.linkSync(process.execPath, ghPath); } catch { fs.copyFileSync(process.execPath, ghPath); }
fs.chmodSync(ghPath, 0o755);
fs.writeFileSync(path.join(workDir, 'api.js'), `
const fs = require('fs');
fs.appendFileSync(process.env.FAKE_GH_LOG, process.argv.slice(2).join(' ') + '\\n');
const mode = process.env.FAKE_GH_MODE;
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
  env.PATH = pathDir;
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
  const r = runHook('git push', { pathDir: emptyDir });
  assert(r.status === 0, `gh not installed + git push: exit 0 (got ${r.status})`);
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
  const r = runHook('git push', { mode: 'ABlueAI', pathDir: emptyDir });
  assert(r.status === 0 && /not installed/.test(r.stdout), 'a gh in the working directory is ignored when PATH has none');
  assert(ghCalls().length === before, 'the planted gh never ran');
  assert(guard.resolveGh({ PATH: ['.', '', 'relative/dir'].join(path.delimiter) }) === null,
    'relative and empty PATH entries are skipped');
  assert(guard.resolveGh({ PATH: binDir }) === ghPath, 'gh is found in an absolute PATH entry');
  assert(guard.resolveGh({ PATH: '"' + binDir + '"' }) === ghPath, 'a double-quoted PATH entry is read without its quotes');
  fs.unlinkSync(planted);
}
{
  for (const [input, label] of [['not json', 'invalid JSON'], ['', 'empty stdin'], ['{}', 'missing tool name'], ['null', 'null hook input']]) {
    const r = spawnSync(process.execPath, [HOOK], { cwd: workDir, input, encoding: 'utf8' });
    assert(r.status === 2 && r.stdout === '' && /couldn't read the hook input/.test(r.stderr),
      `${label}: exit 2 with a refusal on stderr`);
  }
  for (const toolName of ['Bash', 'PowerShell']) {
    const r = runHook(42, { toolName });
    assert(r.status === 2 && r.stdout === '' && r.stderr.includes(`couldn't read the ${toolName} tool's command`),
      `${toolName} with a non-string command: exit 2 with a refusal on stderr`);
  }
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
  assert(wordsAgentRun.status === 0 && wordsAgentRun.stdout.trim() === '' && wordsAgentRun.stderr.trim() === '', 'ABlueAgent + the same commit: exit 0, nothing printed');
  const returned = runHook('& { return git push origin HEAD }', { mode: 'ABlueAI', toolName: 'PowerShell' });
  assert(returned.status === 2 && /git push/.test(returned.stderr), `ABlueAI + PowerShell & { return git push origin HEAD }: exit 2 end to end (got ${returned.status})`);
}
try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* temp cleanup is best effort */ }

// ---------------------------------------------------------------------------------------------
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
assert(hook && hook.onFailure === 'block', 'onFailure blocks shell calls if the guard crashes, times out or cannot start');
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
