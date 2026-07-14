# Builder Handoff

Branch:
Fork-point SHA:
Pre-merge main SHA:
Tip SHA:
Merge commit SHA: Pending until merge

Intended invariant:

Files changed:

Security-sensitive surfaces touched:

Commands run:

Exact test results:

Manual verification:

Known limitations:

Unexpected pre-existing findings:

Recommended review focus:

Review diff:
`git diff main...<tip-sha> --output=.agent-review-<branch>.diff`

Reviewer verdict:

Reviewer verdict source:

## Review-diff rule

- Before merge, use `git diff main...<tip>`.
- After merge, reproduce the reviewed delta with
  `git diff <recorded-pre-merge-main>...<tip>`.
- `git diff main...<tip>` may be empty after merge because the branch tip is
  already an ancestor of `main`.
- Always use `--output`; do not use PowerShell `>` for pinned review diffs.
- Retain the literal `VERDICT: PASS|FAIL` line and identify the review that
  produced it. A paraphrase or implied verdict is not a merge-gate verdict.

Pinned `.agent-review-*.diff` files are local review artifacts and must remain
gitignored.
