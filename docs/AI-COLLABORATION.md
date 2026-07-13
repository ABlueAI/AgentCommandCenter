# Roles

Human
- Owns merge authorization and credentials.
- Reads Reviewer verdicts verbatim.
- Controls main.

Claude Code
- Primary builder.
- Works only in assigned feature worktrees.
- Never merges its own branch.

ChatGPT
- Planning, architecture, research, review and project-state maintenance.
- Uses current repository state when connected.
- Does not assume tests passed without pasted or repository-visible evidence.

Codex
- Optional secondary builder or verifier.
- Never shares a worktree with Claude.

# Required branch handoff

- Branch name
- Base SHA
- Tip SHA
- Intended invariant
- Files changed
- Commands run
- Exact test results
- Known failures or skipped checks
- Three-dot diff path
- Reviewer VERDICT line
