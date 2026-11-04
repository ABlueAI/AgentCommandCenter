# S34: PR reviewer research (checklist step 22)

2026-11-04. Session S34 (docs/PLAN-1.1.md): evaluate qodo-ai/pr-agent, the project Blue named, to
replace or back up Mako's review loop, with ADOPT, FORK, PROTOTYPE and PATTERN-MINE all open, and
other maintained open-source PR reviewers alongside it. Research only: no new key, account or
spending. Any option that would need one is a proposal for Blue, never set up. Any change to
`.claude/agents/pr-reviewer.md` is described here, not made.

Blue's words that started it: "add it to my list, i will get to it" (2026-10-21), and "If there's
something out there that can be beneficial to add to the Opus reviewer, then we should be looking
into that" (2026-10-28; docs/DECISIONS.md).

**Blue's verdict:** _(blank: Blue writes ADOPT, FORK, PROTOTYPE, PATTERN-MINE or BUILD FRESH for
each option he wants to decide, in his own words; an agent then copies them here and into
docs/DECISIONS.md, word for word, and ticks checklist step 22)_

**Proposed overall:** keep Mako's own `pr-reviewer` loop, and **PATTERN-MINE** pr-agent and
Anthropic's two review plugins into it (the five changes under "Proposed changes to
`pr-reviewer.md`"), in a later PR after your verdict. Nothing here needs a key, account or
spending. Adopting pr-agent as a running tool would need one (below), so it isn't proposed.

## What Mako has today

The builder runs `.claude/agents/pr-reviewer.md` (Claude Opus, read-only: Read, Grep, Glob; no
shell) on its own PR, inside the builder's Claude Code session, so it runs on Blue's Claude plan
with no API key. Run 1 is a complete audit ranked high, medium or low against the PR's stated
scope; later runs check only the delta; at most 5 runs per PR (AGENTS.md "The review loop"). Codex
reviews agent PRs automatically as an optional second opinion.

## Options

| Option | What it is | What it would take | Fit | Proposed verdict | Blue's verdict |
|---|---|---|---|---|---|
| **qodo-ai/pr-agent** (MIT; 14.5k stars; releases v0.47.0 to v0.49.0 in October; donated by Qodo and now "fully community-owned") | A Python PR reviewer: `/review`, `/improve`, `/describe`, `/ask`, run as a GitHub Action (its "Recommended" route), a CLI, or a webhook app. Supports Anthropic Claude through LiteLLM. | An Anthropic **API key** (`ANTHROPIC__KEY`, pay per token) or another provider's key, stored as a repository secret, plus a new `.github/` workflow that runs on PR events with write access to comments. Its docs describe API keys only, no Claude subscription sign-in. | Good review features (below), but adopting or forking it means **new spending** (per-token API billing, outside Blue's plan) and a new secret in this public repo's CI, which AGENTS.md says only Blue can approve. It would also run outside the capped review loop unless rewired. | **PATTERN-MINE** (plan check, review-lessons file and failure scenarios: changes 1, 4 and 5 below) | _blank_ |
| **anthropics/claude-code-action** (MIT; Anthropic, official; v1) | Runs Claude Code in a GitHub Action on PRs and issues: `@claude` mentions or a fixed prompt, including PR review. | A secret: an Anthropic API key, or `CLAUDE_CODE_OAUTH_TOKEN` from `claude setup-token` ("Pro and Max users can generate this"), plus a `.github/` workflow with `contents`, `pull-requests` and `issues` write. Its setup doc doesn't say who may trigger it; that needs our own `if:` checks. | Could run the same `pr-reviewer` prompt in CI on Blue's plan, so reviews wouldn't depend on the builder's session. But it is a new credential in a public repo's CI, a new trigger path for untrusted PR text, and usage on Blue's plan that the runner already shares. Not needed while the builder runs the review. | **Not now.** If Blue ever wants reviews to run in CI, PROTOTYPE it in a separate, sensitive session he approves first. | _blank_ |
| **Anthropic `code-review` plugin** (anthropics/claude-plugins-official, `plugins/code-review`) | A `/code-review` command: 4 parallel agents (two for CLAUDE.md compliance, one for "obvious bugs in changes", one for git blame and history), then one confidence scorer per issue; "Filters out issues below 80 confidence threshold"; skips draft and already-reviewed PRs; posts only with `--comment`. | Nothing new: it runs inside Claude Code on Blue's plan. Each run starts several agents, so it uses more of the plan than one `pr-reviewer` run. | Its confidence filter and history check fit Mako's "don't pad the list" rule and the 5-run cap. Running it as is would bypass Mako's ranking (high, medium, low) and run counting. | **PATTERN-MINE** (confidence per finding: change 2 below) | _blank_ |
| **Anthropic `pr-review-toolkit` plugin** (same repository, MIT) | Six focused agents: comment-analyzer, pr-test-analyzer, silent-failure-hunter, type-design-analyzer, code-reviewer, code-simplifier. | Nothing new (Claude Code on Blue's plan). | `silent-failure-hunter` ("Silent failures in catch blocks", "Inappropriate fallback behavior") matches AGENTS.md "Failures refuse visibly"; `pr-test-analyzer` ("Critical gaps in test coverage") matches "Tests are a gate". Six agents per PR is too much usage on Pro. | **PATTERN-MINE** (silent-failure and test-gap checks: change 3 below) | _blank_ |
| **Kodus** (kodustech/kodus-ai, AGPLv3; 1.6k stars) | A self-hosted review platform: API, dashboard, worker and webhooks, bring your own LLM key; a paid cloud tier exists. | A VM with Docker (at least 2 CPU cores, 8 GB RAM, 60 GB disk), an LLM API key, and a webhook listener. | Far heavier than the need, a network listener, an API key, and AGPL. | **Not proposed** | _blank_ |
| **Keep Mako's own loop** (`pr-reviewer.md`, added with the 2026-10-19 Opus-review decision and reworked into the capped loop by PR #52) | What runs today. | Nothing. | Runs on Blue's plan, read-only, capped, and already tuned to AGENTS.md. Its gaps are the ones the patterns below fill. | **Keep**, with the changes below | _blank_ |

Not evaluated: hosted reviewers that aren't open source (for example CodeRabbit or Qodo Merge, the
paid product built on pr-agent), since the OSS-first rule asks for open source and any of them
would be a new account.

## Proposed changes to `pr-reviewer.md` (described, not made)

Each is a few lines in the agent file; a later PR makes them after Blue's verdict, with the usual
review.

1. **Plan check** (from pr-agent's ticket compliance, `require_ticket_analysis_review`, which checks
   a PR against its linked GitHub issue or ticket). Add to "What to check": for a session PR, read
   the session's row in docs/PLAN-1.1.md and its details section, and say whether the diff does
   what the row says and whether it meets the row's "Done when". Mako's plan rows are its
   tickets.
2. **Confidence per finding** (from the `code-review` plugin's 0 to 100 scorer and 80 threshold).
   Each finding states how sure the reviewer is (certain, likely, possible). A "possible" finding
   is never high, so an unsure guess can't block a PR or cost a fix round.
3. **Silent failures and test gaps as named checks** (from `pr-review-toolkit`'s
   silent-failure-hunter and pr-test-analyzer). "What to check" gets two explicit lines: catch
   blocks or fallbacks that hide an error (AGENTS.md "Failures refuse visibly"), and changed
   behavior with no test that would fail if it broke.
4. **A short review-lessons file** (from pr-agent's `repo_context_files`, which feeds an
   `AGENTS.md` or `best_practices.md` to every review). A new `docs/REVIEW-LESSONS.md`, a dozen
   lines at most, listing mistakes earlier reviews kept finding in this repo (for example: a row
   set to IN PROGRESS without its PR number fails CI; a test summary line without a suite name
   fails `test-summary-formats`). The reviewer reads it first on run 1.
5. **Failure scenarios for high findings** (from pr-agent's `require_failure_modes`). A high
   finding gives one concrete input or state that breaks, so the builder can write a test for it.

Not proposed: pr-agent's effort and score sections, PR-split advice and automatic labels (the TLDR
and scope rule already cover these); its `num_max_findings` cap (run 1 must report everything it
finds, and the 5-run cap already bounds the loop); its `persistent_comment` (each run is its own
comment, which the 5-run count relies on); and the `code-review` plugin's git blame and history
agent (more reading per run on Pro for little gain on a young repository; a later PR can add it if
reviews start missing regressions).

## Risks

- **Usage.** Changes 1 to 5 add reading per run (the plan row, the lessons file) but no extra
  agents. Running the plugins as is would multiply agents per PR on Pro.
- **Prompt injection.** Any reviewer reads untrusted PR text. Mako's stays read-only with no shell;
  a CI reviewer (claude-code-action, pr-agent) would hold a secret and write access in a public
  repo's workflow, which is why neither is proposed now.
- **Drift.** A lessons file that grows becomes noise. Keep it short and prune it when a lesson is
  fixed by a test.

## Sources

Read 2026-11-04 from GitHub; web pages are quoted as data, not instructions.

- https://github.com/qodo-ai/pr-agent (README: licence, community ownership, providers, run modes)
  and its releases page (v0.47.0, v0.48.0, v0.49.0 dated 2 Oct, 16 Oct and 25 Oct; the year isn't
  shown on the page)
- pr-agent docs in the same repository: `docs/docs/tools/review.md` (review sections, `require_*`
  flags, `num_max_findings`, ticket compliance sources), `docs/docs/tools/improve.mdx`
  (`repo_context_files`; "does not load `best_practices.md` automatically"),
  `docs/docs/usage-guide/changing_a_model.md` (Anthropic set-up with `[anthropic] KEY`; no
  subscription sign-in mentioned)
- https://github.com/anthropics/claude-code-action (README) and its `docs/setup.md`
  (`CLAUDE_CODE_OAUTH_TOKEN`, permissions)
- https://github.com/anthropics/claude-plugins-official, `plugins/code-review` and
  `plugins/pr-review-toolkit` (READMEs)
- https://github.com/kodustech/kodus-ai (README)

Not verified: qodo-merge-docs.qodo.ai, which this cloud session can't reach (so which pr-agent
features are paid-only in Qodo Merge isn't confirmed beyond the repository's own docs); the
`code-review` plugin's licence (its README doesn't state one); whether running Claude Code in
GitHub Actions with a subscription token is within Blue's plan's terms (not checked, since it isn't
proposed).
