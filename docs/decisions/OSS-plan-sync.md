# S03: plan to issues and board

2026-10-21. Proposed choice: **BUILD FRESH**, a small script run by GitHub's official
`actions/github-script` (already adopted for the merge audit), with GitHub's own Projects board as the
board. Blue's verdict, word for word: _pending; merging PR #54 approves BUILD FRESH._

What S03 needs: docs/PLAN-1.1.md stays the source of truth, and one issue per session, its labels,
the milestone and a board column follow every change to the table automatically, touching only
issues the sync itself opened.

Options considered (from the builder's knowledge of these tools; not re-checked on the web today):

| Option | Fit | Proposed verdict |
|---|---|---|
| GitHub Projects built-in workflows (auto-add, "item closed" sets Done) | Free and maintained by GitHub, but they can't read a markdown table, open issues, or move an item to Hold, Needs Blue or Ready to merge. | PATTERN-MINE (Blue may still turn on auto-archive for Done) |
| `actions/add-to-project` (GitHub's official action) | Adds issues to a project by label, but can't create or update issues or set the Status field, and needs the same project token. | Not needed |
| Markdown-to-issues actions (one-shot issue creators from a file or template) | Create issues, but don't keep them in sync with later edits, close DONE rows, or respect "only issues we opened". | Not needed |
| Small script on `actions/github-script` + GitHub REST/GraphQL | Does exactly the mapping above in about 250 lines with fixture tests; no new dependency; same pinned actions as the merge audit. | BUILD FRESH (proposed) |

The decision logic is `.github/scripts/plan-sync.js`, its tests are
`.github/scripts/plan-sync.test.js`, and the workflow is `.github/workflows/plan-sync.yml`.
