# OSS record: ECC agents (pre-ready reviewers)

Written 2026-11-17 by the Claude cloud session building S39 (ECC PR 1, PR #174), in the AGENTS.md
OSS shape. S45 later adds the list of ECC's other skills to this file.

## Need

Mako's one required review is `.claude/agents/pr-reviewer.md` (Claude Opus, read-only). It is a
generalist. Blue asked for specialist reviewers that look harder at four things a generalist skims:
security in an Electron app, silent failures (AGENTS.md "Failures refuse visibly"), JavaScript
mistakes in Node and Electron, and whether the tests cover the change.

## Sources (pinned)

- **ECC** ([affaan-m/ECC](https://github.com/affaan-m/ECC)), v2.2.3, at commit
  [`d2ef2680594f9a17526a6e1a2e18b3d242c5d17b`](https://github.com/affaan-m/ECC/tree/d2ef2680594f9a17526a6e1a2e18b3d242c5d17b).
  MIT, Copyright (c) 2026 Affaan Mustafa; full text in [LICENSES/MIT-ECC.txt](../../LICENSES/MIT-ECC.txt).
  A large collection of Claude Code agents, skills, hooks and rules.
- **Anthropic's `pr-review-toolkit`** plugin, in Anthropic's official Claude Code plugin
  marketplace ([anthropics/claude-plugins-official](https://github.com/anthropics/claude-plugins-official)),
  `plugins/pr-review-toolkit/agents/`, at commit
  [`b5b01ac4f889fec0c4c6bb89f27ca7c8574473f6`](https://github.com/anthropics/claude-plugins-official/tree/b5b01ac4f889fec0c4c6bb89f27ca7c8574473f6/plugins/pr-review-toolkit)
  (plugin version 1.0.1). Apache-2.0: the plugin folder's `LICENSE` and the repository's are the
  same text as [LICENSES/Apache-2.0.txt](../../LICENSES/Apache-2.0.txt) (compared 2026-11-16). No
  `NOTICE` file and no copyright line. (docs/decisions/OSS-pr-review.md, S34, calls this plugin MIT;
  the licence file at this commit says Apache-2.0.)

Both were read as data only; nothing from them was run. sha256 of the files read:

| Upstream file | sha256 |
|---|---|
| ECC `agents/security-reviewer.md` | `813e4062bed5f42ab25dd02a0070f682058ffe9508198fcfdbb2c31296f93b7b` |
| ECC `agents/typescript-reviewer.md` | `33753b05487c1aae4235fbff901cceb646735316015f79401569958d1507d2e4` |
| ECC `agents/silent-failure-hunter.md` | `e5e2094c6f50cc515a77376331c78e4955d5ff16c7a0e5d8f6edec692b7ebd8d` |
| ECC `agents/pr-test-analyzer.md` | `5432aaf7e5fcb0813ac21828382971cc00f17d56ee95eac6d0ce180fc5d58016` |
| ECC `LICENSE` | `326146379f01bb137c0a5d3c54770c1aa31076705c8b88a7f6b26a460f6221b2` |
| pr-review-toolkit `agents/silent-failure-hunter.md` | `fa9b0daec5a267e7e66435cc48b3328301fc9f70c3af259fe248881327a1babc` |
| pr-review-toolkit `agents/pr-test-analyzer.md` | `fcb1cde9ba7b21694b508766a8d6a79bc91bed9982f828f816210059934f46b4` |

**Which version each Mako agent starts from.** ECC's silent-failure-hunter (59 lines) and
pr-test-analyzer (54 lines) are short checklists. Anthropic's are fuller: a per-handler question
list (logging, user feedback, catch specificity, fallbacks, propagation) and a gap-rating scale with
worked criteria. So those two start from Anthropic's text and carry its Apache-2.0 notice;
security-reviewer and typescript-reviewer start from ECC's and carry its MIT notice. Each file's
header comment lists what Mako changed (Apache-2.0 section 4(b) asks for that on modified files).
The upstream projects' own logging functions, error-ID file and error-tracking service are removed
from the two Anthropic-based files, in favour of Mako's own error paths.

## Pin-and-scan

Scanner: [NVIDIA/SkillSpector](https://github.com/NVIDIA/SkillSpector) 2.12.0 (tag `v2.12.0`, commit
`c7958a3268d9498644b22edb75d0f051bbc8cbfc`, Apache-2.0), installed from that tag into a throwaway
virtual environment in the cloud session and run on 2026-11-17 with `--no-llm` (static analysis
only), as Blue asked: its default analyzer model is `z-ai/glm-5.2` (Zhipu, China-based; the default
provider is `nv_build`), so no LLM stage may run. Each report's metadata confirms
`llm_requested: false` and no inference calls.

| Target | Result | Coverage |
|---|---|---|
| ECC `d2ef268`, the four upstream agent files | 1 finding, MEDIUM, "MCP Rug Pull" (RP1): `security-reviewer.md` line 34, `npx eslint . --plugin security` runs an unpinned package. **Removed:** Mako's copy has no command blocks and no Bash. Risk score 7/100. | Partial: 3 files fully inspected; in `typescript-reviewer.md` one analyzer (`static_patterns_tool_misuse`) hit its parse limit, the others ran |
| pr-review-toolkit `b5b01ac`, the two upstream agent files | No findings. Risk score 0/100, "SAFE". | Complete |
| Mako's four files in this PR (`.claude/agents/`) | No findings. Risk score 0/100, "SAFE". | Complete |

This agrees with Blue's own static scans (2026-11-12): ECC `d2ef268` `agents/` had 1 finding among
these four, the unpinned `npx eslint`, and the toolkit (an installed copy, commit not recorded) had
none.

**China-origin rule (docs/DECISIONS.md, 2026-11-16).** Neither source uses or names a model from a
China-based company. The six upstream files name only `model: sonnet` (ECC) and `model: inherit`
(the toolkit); a search of them for GLM, Qwen, DeepSeek, Kimi, Doubao, Moonshot, Zhipu, ERNIE,
MiniMax, Hunyuan and Baichuan finds nothing. Mako's four run on `model: opus` inside Claude Code on
Blue's plan. The only China-origin model in this work is SkillSpector's default analyzer, which was
not used (static mode).

## Options considered

| Option | What it means | Verdict |
|---|---|---|
| Install the whole of ECC (plugin or copy) | Every ECC agent, skill, hook and rule, as shipped | Not chosen: most of it overlaps Mako's own rules, many agents get Bash, and several start themselves ("PROACTIVELY", "MUST BE USED") |
| Hand-pick and edit | Copy a few agents into `.claude/agents/`, cut to Mako's rules | **Chosen**, in 3 PRs |
| Build fresh | Write the four reviewers from scratch | Not chosen: the upstream prompts are a sound start and both licences allow edits |

## Verdicts

**ADOPT after edits** (S39, ECC PR 1): `security-reviewer`, `silent-failure-hunter`,
`typescript-reviewer`, `pr-test-analyzer`, as project agents in `.claude/agents/`, less any the
proof rule drops (below). The edits common to all four:

- tools cut to `Read, Grep, Glob` (no Bash, because reviewers read untrusted PR content), and every
  command block removed;
- `model: opus`, and a description that says the builder runs it before marking a PR ready and
  never on its own;
- one shared Mako block, identical in all four: run 1 only, read-only, report only, Mako's high,
  medium and low (S40 changes the scale later), review whatever CI says, no file-size rule, and key
  advice pointed at Mako's key setup.

When they run (AGENTS.md "How work flows" step 3): on review run 1 only, alongside `pr-reviewer`;
`security-reviewer` only when a sensitive area is touched, `typescript-reviewer` only when JS or TS
changes. On a Codex PR, the Claude session or runner fire that runs `pr-reviewer` runs them. The
runner prompt's review step (docs/RUNNER.md) is not changed here; that is a follow-up.

**Proof rule** (Blue, 2026-11-16 and 2026-11-17): run the four on 3 recently merged PRs and drop any
that finds nothing real. Results: in PR #174's TLDR.

The rest of ECC, as Blue's split set it:

| ECC piece | Where it goes |
|---|---|
| `planner` | ECC PR 2 (S40) |
| `code-reviewer` | Folded into `pr-reviewer` in ECC PR 2 (S40) |
| `agent-evaluator`, `harness-optimizer` | Ideas for ECC PR 2 (S40): agent-evaluator on demand, harness-optimizer's method as text |
| The sanitizer patterns (the "Prompt Defense Baseline" checks) | A CI test in ECC PR 3 (S41) |
| `spec-miner` | A one-off trial (S43) |
| ECC's other skills | Listed with proposed verdicts in S45 |
| Hooks, GateGuard, everything else | Not adopted here |

## Blue's words

- "Yes, 3 PRs" (2026-11-12): the ECC agents are adopted in 3 PRs.
- "Yes, fold it" (2026-11-12): code-reviewer is folded into pr-reviewer (ECC PR 2).
- "Yes, take it" (2026-11-15): he took an independent review's split, which adopts these four
  reviewers now (plus planner in ECC PR 2).

Blue's verdict on this record is his merge of the PR that adds it.
