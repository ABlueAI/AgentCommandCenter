# Changing the agent harness: the eval method

Added 2026-11-24 by S40 (ECC PR 2). This is ECC's `harness-optimizer` agent's method, written as
text for Mako's builders instead of adopted as an agent (Blue's split, docs/DECISIONS.md 2026-11-16,
"ECC comes in as 3 PRs"). Source: ECC (https://github.com/affaan-m/ECC), `agents/harness-optimizer.md`
at commit `d2ef2680594f9a17526a6e1a2e18b3d242c5d17b`, MIT, Copyright (c) 2026 Affaan Mustafa
([LICENSES/MIT-ECC.txt](../LICENSES/MIT-ECC.txt)); record: docs/decisions/OSS-ecc.md. Mako takes the
method only: no agent, no Bash or Edit tools, no ECC scripts, and nothing applied or restored
automatically.

## When it applies

The method is available, not required: a builder uses it when Blue or the plan row asks for a
proof run (as S39 and S40 did), and may use it for any other PR that changes how agents behave
rather than what Mako does. This is the one list of those files: a file in `.claude/agents/`, a
hook in `.claude/hooks/`, `.claude/settings.json`, a role file in `agent-roles/`, the runner
prompt (docs/RUNNER.md), or the review rules in AGENTS.md. A PR touching `.claude/` or AGENTS.md
is also in a sensitive area, so it gets the second review AGENTS.md asks for.

## The method

1. **Write the eval set first, before changing anything.** Put it in the draft PR's depth check.
   - **Capability evals:** what the change should do better, each as a pass or fail check on fixed
     inputs. For a reviewer: real problems it must find on named, already-merged PRs. For a hook:
     the commands it must now block.
   - **Regression evals:** what must keep working: the tests that pin the file (for agents,
     `app/project-agents.test.js`; for the account guard, its Node and Pester tests), and for a
     reviewer, the real findings the old version already found on the same PRs.
   - Fix the inputs (PR numbers, commits, commands) before the first run, so the result can't be
     tuned to them afterwards.
2. **Run the evals on the current version.** That is the baseline. For a reviewer, the old
   version's posted findings on those PRs count as its baseline run.
3. **Make the smallest change** that serves the capability evals, and nothing else in the same
   PR (AGENTS.md "One scope per PR"). Git is the snapshot: work on the PR's branch, and undo with
   a new commit, never a force-push.
4. **Run the same evals on the new version**, with three kinds of grader:
   - **Code:** the tests' exit codes, on Windows CI.
   - **Model:** each finding or output checked against `main` by the builder, with file and line;
     only checked findings count. `agent-evaluator` may score a written output on demand.
   - **Human:** Blue. A change that widens tools or permissions, touches credentials, or weakens a
     guard is never "done" on the evals alone: it waits for Blue's merge like every sensitive PR.
5. **Repeat where chance matters.** A model-graded eval can pass by luck. Report pass@k (it passed
   in at least one of k runs) for capability evals and pass^k (it passed in all k runs) for a
   safety-critical regression, and say what k was. Deterministic tests need one run. When a repeat
   costs too much, say k = 1 and mark the result "not verified beyond one run".
6. **Record the results in the PR:** each eval, baseline versus new, pass or fail, the token cost
   per run, and anything that got worse. If a regression eval fails, fix it or take the change
   out before the PR is marked ready.

## What a result looks like

```
Eval report: <PR>
Capability evals: <eval>: baseline fail, new pass (k=1) ...
Regression evals: <eval>: baseline pass, new pass ...
Cost: about N tokens per run (baseline M)
Got worse: none / <what>
```

S40's own proof run (PR #256) is the first use: the changed `pr-reviewer` on the same 3 merged PRs
that S39 used.
