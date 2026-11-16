# OSS record: ECC agents (pre-ready reviewers)

Written 2026-11-16 by a Claude cloud session for ECC PR 1, in the AGENTS.md OSS shape.

## Need

Mako's one required review is `.claude/agents/pr-reviewer.md` (Claude Opus, read-only). It is a
generalist. Blue asked for specialist reviewers that look harder at four things a generalist skims:
security in an Electron app, silent failures (AGENTS.md "Failures refuse visibly"), JavaScript
mistakes in Node and Electron, and whether the tests cover the change.

## Source

- **ECC** ([affaan-m/ECC](https://github.com/affaan-m/ECC)), v2.2.3, at commit
  [`d2ef2680594f9a17526a6e1a2e18b3d242c5d17b`](https://github.com/affaan-m/ECC/tree/d2ef2680594f9a17526a6e1a2e18b3d242c5d17b).
  MIT, Copyright (c) 2026 Affaan Mustafa; full text in [LICENSES/MIT-ECC.txt](../../LICENSES/MIT-ECC.txt).
  A large collection of Claude Code agents, skills, hooks and rules.
- **Anthropic's `pr-review-toolkit`** plugin, in Anthropic's official plugin marketplace
  ([anthropics/claude-plugins-official](https://github.com/anthropics/claude-plugins-official)),
  `plugins/pr-review-toolkit/agents/`, at commit
  [`b5b01ac4f889fec0c4c6bb89f27ca7c8574473f6`](https://github.com/anthropics/claude-plugins-official/tree/b5b01ac4f889fec0c4c6bb89f27ca7c8574473f6/plugins/pr-review-toolkit)
  (plugin version 1.0.1). Apache-2.0: the plugin folder's `LICENSE` and the repository's are the
  same text as [LICENSES/Apache-2.0.txt](../../LICENSES/Apache-2.0.txt) (compared 2026-11-16). No
  `NOTICE` file and no copyright line. (docs/decisions/OSS-pr-review.md, S34, called this plugin MIT;
  the licence file at this commit says Apache-2.0.)

Both were read as data only; nothing from them was run. File hashes (sha256) of the copies read:

| Upstream file | sha256 |
|---|---|
| ECC `agents/security-reviewer.md` | `813e4062bed5f42ab25dd02a0070f682058ffe9508198fcfdbb2c31296f93b7b` |
| ECC `agents/typescript-reviewer.md` | `33753b05487c1aae4235fbff901cceb646735316015f79401569958d1507d2e4` |
| ECC `agents/silent-failure-hunter.md` | `e5e2094c6f50cc515a77376331c78e4955d5ff16c7a0e5d8f6edec692b7ebd8d` |
| ECC `agents/pr-test-analyzer.md` | `5432aaf7e5fcb0813ac21828382971cc00f17d56ee95eac6d0ce180fc5d58016` |
| pr-review-toolkit `agents/silent-failure-hunter.md` | `fa9b0daec5a267e7e66435cc48b3328301fc9f70c3af259fe248881327a1babc` |
| pr-review-toolkit `agents/pr-test-analyzer.md` | `fcb1cde9ba7b21694b508766a8d6a79bc91bed9982f828f816210059934f46b4` |

**Which version each Mako agent starts from.** ECC's silent-failure-hunter (59 lines) and
pr-test-analyzer (54 lines) are short checklists. Anthropic's are fuller: a per-handler question
list (logging, user feedback, catch specificity, fallbacks, propagation) and a gap-rating scale with
worked criteria. So those two start from Anthropic's text and carry its Apache-2.0 notice;
security-reviewer and typescript-reviewer start from ECC's and carry its MIT notice. Each file's
header comment lists what Mako changed.

## Options considered

| Option | What it means | Verdict |
|---|---|---|
| Install the whole of ECC (plugin or copy) | Every ECC agent, skill, hook and rule, as shipped | Not chosen: most of it overlaps Mako's own rules, many agents get Bash, and several start themselves ("PROACTIVELY", "MUST BE USED") |
| Hand-pick and edit | Copy a few agents into `.claude/agents/`, cut to Mako's rules | **Chosen**, in 3 PRs |
| Build fresh | Write the four reviewers from scratch | Not chosen: the upstream prompts are a sound start and both licences allow edits |

## Verdicts

**ADOPT after edits** (this PR, ECC PR 1): `security-reviewer`, `silent-failure-hunter`,
`typescript-reviewer`, `pr-test-analyzer`, as project agents in `.claude/agents/`. The edits common
to all four: tools cut to `Read, Grep, Glob` (no Bash, because reviewers read untrusted PR content),
every command block removed, `model: opus`, a description that says the builder runs it before
marking a PR ready and never on its own, Mako's high/medium/low severities, review whatever CI
says, no file-size rule, report only, and key advice pointed at Mako's key setup. Run on review run
1 only, alongside `pr-reviewer` (AGENTS.md "How work flows" step 3).

The rest of ECC, as Blue's split set it:

| ECC piece | Where it goes |
|---|---|
| `planner` | ECC PR 2 |
| `code-reviewer` | Folded into `pr-reviewer` in ECC PR 2 |
| `agent-evaluator`, `harness-optimizer` | Ideas for ECC PR 2, no adoption yet |
| The sanitizer patterns (the "Prompt Defense Baseline" checks) | A CI test in ECC PR 3 |
| `spec-miner` | A trial, later |
| Hooks, GateGuard, everything else | Not adopted |

## Blue's words

- "Yes, 3 PRs" (2026-11-12): the ECC agents are adopted in 3 PRs.
- "Yes, fold it" (2026-11-12): code-reviewer is folded into pr-reviewer (ECC PR 2).
- "Yes, take it" (2026-11-15): he took an independent review's split, which adopts these four
  reviewers now (plus planner in ECC PR 2).

Blue's verdict on this record is his merge of the PR that adds it.
