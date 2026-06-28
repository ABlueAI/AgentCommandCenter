# Agent Command Center

A $0, dependency-light setup for running **multiple Claude Code agents in parallel**,
each isolated in its own git worktree, with a plan → review → test → **human-merge**
discipline. It mirrors the workflow of a paid "vibe coding" agent platform without the
platform — you bring your own Claude Code (and optionally Codex) and keep full control.

This repo is your **home base**: the conventions, the worktree helper scripts, the
task-brief template, and the setup docs all live here. You point its agents at your
*other* project repos.

## The core idea (one library, several reading rooms)
One repo's history = one library. A **worktree** is a private reading room: a second
working folder checked out to its own branch, sharing the same underlying history. Agent A
works in folder/branch `agent/a`, Agent B in `agent/b` — they never scribble on each
other's page. You review each one's diff and merge on your terms.

## Quick start (Windows / PowerShell)
```powershell
# 1. From inside ANY repo you want to run agents against:
git worktree --help        # sanity check git is recent enough

# 2. Spin up an isolated agent worktree (creates ..\<repo>-search-bar on branch agent/search-bar)
..\agent-command-center\scripts\new-agent.ps1 -Task search-bar

# 3. Open that folder in a new terminal and launch Claude Code
cd ..\<repo>-search-bar
claude

# 4. When done: review the diff, open a PR, merge on GitHub, then clean up
..\agent-command-center\scripts\remove-agent.ps1 -Task search-bar
```

(WSL2 / bash equivalents: `scripts/new-agent.sh`, `scripts/list-agents.sh`,
`scripts/remove-agent.sh`.)

## Full walkthrough
See **`docs/SETUP-WINDOWS.md`** — the complete 6-phase setup, step by step.
See **`docs/WORKTREE-CHEATSHEET.md`** for the mental model and the commands you'll reuse.
See **`prompts/TASK-BRIEF-TEMPLATE.md`** for how to write a card/prompt that gets good output.

## What this deliberately does NOT do (yet)
- No autonomous "fix prod → auto-PR → auto-merge" loops.
- No full observability wiring (Sentry/PostHog).
A human merge gate stays on anything touching auth, payments, or user data. See `CLAUDE.md`.
