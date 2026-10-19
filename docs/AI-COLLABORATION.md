# AI collaboration roles

Rules for all agents are in [AGENTS.md](../AGENTS.md). This page is the short version of who does what.

## Blue (human)

- Sets goals and approves plan changes by merging the PR that changes `docs/PLAN-1.1.md`.
- The only person who merges. Owns credentials, repository settings and the main-branch ruleset.
- Reads the TLDR at the top of each ready PR; that is the whole merge briefing.

## Claude Code

- Primary builder. Works only in its own branch or worktree.
- Opens PRs with the TLDR, fixes CI failures and review findings until green, never merges.

## Reviewer subagent (Claude Opus)

- The required independent review on every PR: `.claude/agents/pr-reviewer.md`, read-only. The
  builder runs it on its own PR before marking it ready and posts "Independent review (Opus)"
  (AGENTS.md "How work flows" step 3).

## Codex / GPT

- Optional reviewer when Blue requests one by hand, second-opinion builder, planning partner.
  Nothing in the workflow depends on it.
- Reads the same files Claude reads (`AGENTS.md`, `STATUS.md`, `docs/PLAN-1.1.md`,
  `docs/DECISIONS.md`). Proposes plan changes as PRs, not as chat to be copied.
- Never shares a worktree or branch with Claude.

## Shared memory

The repository is the shared brain. Anything that should outlive a chat goes into one of those files
through a PR. No agent relies on another agent's chat history.
