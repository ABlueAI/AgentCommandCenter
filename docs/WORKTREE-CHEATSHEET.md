# Git Worktree Cheatsheet

## Mental model
One repo's history = **one library**. A worktree is a **private reading room**: a second
working folder checked out to its own branch, sharing the same underlying history.
Everyone reads from the same library; each agent works at its own desk; no one scribbles
on someone else's page.

- One repo, many working folders.
- Each worktree is pinned to **one branch** (you can't check out the same branch in two
  worktrees at once — that's the safety rail).
- Commits made in a worktree go onto that worktree's branch, in the shared history.

## The commands you actually use

```bash
# Create a worktree on a NEW branch (sibling folder)
git worktree add -b agent/search-bar ../myrepo-search-bar main

# See all worktrees and which branch each is on
git worktree list

# Remove a worktree when done (folder goes away; branch stays)
git worktree remove ../myrepo-search-bar

# If git complains the folder is "dirty" but you're sure:
git worktree remove --force ../myrepo-search-bar

# Tidy up stale bookkeeping after deleting a folder by hand
git worktree prune

# Delete the branch once its work is merged
git branch -d agent/search-bar
```

The helper scripts in `../scripts/` wrap the create/list/remove steps and name folders
and branches consistently (`<repo>-<task>` / `agent/<task>`).

## Merging an agent's work back
Worktrees isolate work; **you still have to merge it**. The reviewed path:

1. In the agent's worktree: commit the work on `agent/<task>`.
2. Push the branch: `git push -u origin agent/<task>`.
3. Open a PR on GitHub, review the **diff yourself**, run/confirm tests.
4. Merge the PR (human gate — never auto-merge auth/payments/data changes).
5. Back in the main folder: `git pull`, then `remove-agent` + delete the branch.

## Gotchas
- **Don't** create a worktree *inside* the repo folder — put it as a **sibling** (`../`),
  or you'll nest a repo inside itself.
- Each worktree has its own `node_modules` / build output. Run `npm install` in a new
  worktree before `npm run dev`.
- Two worktrees can't share one branch. Give each agent its own branch (the scripts do).
- Windows path friction is a known failure mode — if a tool chokes on `\` vs `/`, that's
  your cue to retry the step in WSL2.
