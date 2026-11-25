# Merged-work history and tree (S62)

`app/merge-history.js` keeps one record per pull request merged into a repository's `main`, and
builds the tree the brain tab's history and Ctrl+F read (docs/DESIGN-BRIEF-1.1.md: finished work
"stays in the history and in Ctrl+F"). It is data only: no IPC, no UI, and it starts no process.

## Where it lives

`merge-history.json` in Mako's settings folder (Electron userData, so the S07 dev copy keeps its
own file), next to `session-memory.json`. Written atomically (temp file, flush, one rename), so a
crash leaves the old file or the new one, never half of either.

## What a record holds

| Field | Meaning |
|---|---|
| `repo` | `owner/name` |
| `number` | the PR number |
| `mergeSha` | the merge commit on `main` |
| `mergedAt` | when it merged (UTC) |
| `title` | the PR title, or `null` until a caller supplies it |
| `branch` | the PR's head branch, or `null` |
| `session` | the plan session (`S62`) from a title that starts `Sxx:`, or `null` |
| `recordedAt` | when Mako recorded it |

## The rules

- **Once.** One record per repository and PR number (letter case in the repository name ignored).
  Recording the same merge again changes nothing and writes nothing.
- **Never overwritten.** The same PR number with a different merge commit is refused
  (`merge-history-conflicting-merge`), and the whole batch with it.
- **A title once.** A merge recorded without a title gets one the first time a caller gives it;
  after that the title never changes.
- **Refuse, never repair.** A file that is malformed, too large (over 4 MiB), a link or a folder is
  refused and left exactly as it was; nothing is written over it.
- **Cap.** 5,000 merges; the oldest drop off first, and the call says how many dropped.

## Where merges come from

`parseGitMergeLog(repo, text)` reads the output of

```text
git log --first-parent --merges --format=%H%x09%cI%x09%s origin/main
```

from a local clone and keeps the lines GitHub writes as "Merge pull request #N from owner/branch".
Other merges (a local `main` merge, for instance) are skipped and counted; a line in another format is
refused. No GitHub token or network call is needed. Running git, and when to do it, is left to the
caller: the brain tab's history (S18) wires it.

## The tree

`tree()` returns repositories, then plan sessions (merges with no `Sxx:` title go under `other`),
then merges, newest first at every level. Each repository and session node carries its merge count
and newest merge time, so a folded node still says how much is under it.
