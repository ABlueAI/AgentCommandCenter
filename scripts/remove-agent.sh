#!/usr/bin/env bash
# Remove an agent's worktree once its work is merged.
# The branch agent/<task> is left intact; delete it manually when you're sure.
# Usage: ./remove-agent.sh <task-slug> [--force]
set -euo pipefail

task="${1:?Usage: ./remove-agent.sh <task-slug> [--force]}"
force="${2:-}"

repo_root="$(git rev-parse --show-toplevel 2>/dev/null || true)"
[ -n "$repo_root" ] || { echo "Not inside a git repository. cd into your project repo first." >&2; exit 1; }

repo_name="$(basename "$repo_root")"
worktree_path="$(dirname "$repo_root")/${repo_name}-${task}"

[ -e "$worktree_path" ] || { echo "No worktree found at: $worktree_path" >&2; exit 1; }

if [ "$force" = "--force" ]; then
  git worktree remove --force "$worktree_path"
else
  git worktree remove "$worktree_path"
fi

echo "Removed worktree: $worktree_path"
echo "Branch agent/$task still exists. When you're sure it's merged, delete it with:"
echo "  git branch -d agent/$task"
