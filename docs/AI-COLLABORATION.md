# AI collaboration roles

## Human

- Owns merge authorization and credentials.
- Reads Reviewer verdicts verbatim.
- Controls `main`.

## Claude Code

- Primary coding builder.
- Works only in its assigned feature worktree.
- Never merges its own branch.

## ChatGPT desktop

- Primary planning, architecture, research, review, and project-state layer.
- Uses GPT-5.6 for the majority of this work unless Blue chooses a different
  route for a specific task.
- Uses current repository state and retained project sources when available.
- Does not assume tests passed without repository-visible or pasted evidence.

## Codex CLI / IDE

- Active secondary builder or verifier for bounded work assigned by Blue.
- Never shares a worktree with Claude Code.
- Does not replace Claude Code as the primary coding surface unless Blue makes
  that decision explicitly.
- During the four-day 1.0 release push, work may be split between Claude and
  Codex to manage usage limits. The same worktree isolation, review tier, test
  gates, and human merge authority apply to both.

## Required branch handoff

Use [`docs/BUILDER-HANDOFF-TEMPLATE.md`](BUILDER-HANDOFF-TEMPLATE.md) for every
builder handoff. The retained Git record is:

- fork-point SHA;
- pre-merge `main` SHA;
- branch tip SHA; and
- merge commit SHA.

Before merge, review the three-dot delta with `git diff main...<tip>`. After
merge, reproduce the same reviewed delta with
`git diff <recorded-pre-merge-main>...<tip>`. Retain the literal
`VERDICT: PASS|FAIL` line and its source; a summary is not a verdict.

Claude Code never merges its own work. ChatGPT or Codex may review or verify,
but Blue remains the final reviewer and the only merge authority.
