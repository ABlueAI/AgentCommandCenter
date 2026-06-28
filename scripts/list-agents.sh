#!/usr/bin/env bash
# List every worktree (i.e. every parallel agent) for the current repo.
# Usage: ./list-agents.sh
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel 2>/dev/null || true)"
[ -n "$repo_root" ] || { echo "Not inside a git repository. cd into your project repo first." >&2; exit 1; }

echo "Worktrees for $(basename "$repo_root"):"
git worktree list
