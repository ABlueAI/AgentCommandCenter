#!/usr/bin/env bash
# Create an isolated git worktree + branch for a parallel agent.
# Run from inside the repo you want to work on.
# Usage: ./new-agent.sh <task-slug> [base-branch]
#   ./new-agent.sh search-bar
#   ./new-agent.sh hotfix-login develop
set -euo pipefail

task="${1:?Usage: ./new-agent.sh <task-slug> [base-branch]}"
base="${2:-main}"

repo_root="$(git rev-parse --show-toplevel 2>/dev/null || true)"
[ -n "$repo_root" ] || { echo "Not inside a git repository. cd into your project repo first." >&2; exit 1; }

repo_name="$(basename "$repo_root")"
branch="agent/$task"
worktree_path="$(dirname "$repo_root")/${repo_name}-${task}"

[ -e "$worktree_path" ] && { echo "Worktree path already exists: $worktree_path" >&2; exit 1; }

git worktree add -b "$branch" "$worktree_path" "$base"

echo
echo "Agent worktree ready:"
echo "  Folder: $worktree_path"
echo "  Branch: $branch  (off $base)"
echo
echo "Next:"
echo "  cd \"$worktree_path\""
echo "  claude"
