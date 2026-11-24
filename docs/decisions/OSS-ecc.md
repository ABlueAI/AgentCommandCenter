# OSS record: ECC agents (pre-ready reviewers)

Written 2026-11-17 by the Claude cloud session building S39 (ECC PR 1, PR #174), in the AGENTS.md
OSS shape. S45 (PR #255) adds the list of ECC's other skills: "ECC's other skills (S45)" below.

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
| ECC's other skills | Listed with proposed verdicts in S45: "ECC's other skills (S45)" below |
| Hooks, GateGuard, everything else | Not adopted here |

## ECC's other skills (S45)

Written 2026-11-24 by the Claude cloud session building S45 (PR #255). Research only: nothing was
installed, run or copied into Mako. Each row is a proposal; Blue's verdict goes in the last column,
and a skill joins Mako only through a later plan row (1.2, or 1.1 only if it passes the 1.1 test
and Blue says so).

**Source.** The same ECC pin as above: commit `d2ef2680594f9a17526a6e1a2e18b3d242c5d17b`, whose
`skills/` folder (git tree `e82cd2aff4e5df1e9871416275ffcb345c594ebb`) holds 314 skills, each a
folder with a `SKILL.md`; 42 also ship other files (scripts, references, assets). Fetched into a
scratch folder in the cloud session and read as data; no instruction inside them was followed.

**What S39 to S44 already take.** S39, S40, S41 and S43 take ECC *agents* (and S41 the sanitizer
patterns), not skills, so every skill is listed here. The one skill another row takes is
`gateguard` (S44's trial); it is listed but not judged again.

**How each was judged** (builder's reading unless marked). Each verdict rests on the skill's
frontmatter (name, description, licence, origin), its file list, and searches of every skill
folder for China-origin model names, upstream attributions and licence lines (verified: the
searches ran on all 314). For the eight top picks, the headings and the passages that decide the
verdict were read too, and their `SKILL.md` sha256 is below. The other bodies were not read in
full, so their rows are the builder's reading from the description; a later plan row re-reads the
skill before it builds anything. The fit test is Mako's: a Windows Electron app in plain
JavaScript (no React, Vue or Vite; verified from `app/package.json`) that runs Claude Code and
Codex panes on Blue's plans, with no API credits, no new paid service without Blue, and the 1.2
queue in docs/PLAN-1.1.md "Month two and later".

**Verdicts proposed:** 1 FORK, 4 PROTOTYPE, 22 PATTERN-MINE, 286 SKIP, and `gateguard` left to
S44. Most SKIPs are language or framework packs Mako doesn't use (94) and business or other
domains (51).

**Sensitive areas.** Installing any skill puts it in `.claude/skills/`, a sensitive area, so any
FORK or PROTOTYPE that installs is a sensitive PR with a second review. The Sensitive column flags
what a skill would touch beyond that: credentials, process control, payments, client data, network
listeners, CI, or `.claude/` hooks and settings.

**China-origin rule** (verified by search). Skills that would call a China-origin model:
`deepseek-harness-setup` (DeepSeek), `fal-ai-media`, `taste-application` and `taste-distillation`
(ByteDance's Seedance and Kuaishou's Kling through fal.ai); all four are SKIP. Skills that only
name one: `configure-ecc` and `ito-inference` (Kimi), `dmux-workflows` and `ecc-guide` (Qwen's
CLI or folder), `taste` (Kling); a name in a file Mako doesn't ship is not a fail, and none is a
pick. No top pick names one.

**Licence.** ECC's repository licence is MIT (Copyright (c) 2026 Affaan Mustafa, already in
[LICENSES/MIT-ECC.txt](../../LICENSES/MIT-ECC.txt)). The Licence column gives that unless the
skill says otherwise: 8 supply-chain skills say Apache-2.0 in their header, 10 others say MIT,
`context-and-decisions` has its own MIT file under another holder, and `osint-investigation` is
CC-BY-SA-4.0 (share-alike). Many skills name an origin other than ECC ("community", a person or
another project); the column shows it. Builder's reading: contributions to an MIT repository come
under its licence unless they say otherwise; a FORK or PROTOTYPE re-checks its skill's origin
before copying any text.

**Pin-and-scan.** Not run: nothing was installed or adopted. Each FORK or PROTOTYPE runs the
pin-and-scan step (SkillSpector static only, the China-origin check included) on its pinned files
before it is used.

### Top picks

1. **`mcp-dependency-review`, FORK.** A static, read-only check of MCP configs for unpinned
   package references, without running them. It fits the pin-and-scan step for MCP servers (Mako
   ships the Playwright MCP). Copy into `.claude/skills/` with Mako's edits (no Bash).
2. **`click-path-audit`, PROTOTYPE.** Traces each button through its state changes to find flows
   that undo each other. One read-only trial on the renderer once the new tabs exist, as S43 did
   with spec-miner.
3. **`e2e-testing`, PROTOTYPE.** Playwright end-to-end patterns. Mako has no end-to-end tests;
   Playwright has an Electron API (not verified on Mako), which could move some of Blue's PC
   checks into CI. Touches CI.
4. **`skill-comply`, PROTOTYPE.** Measures whether agents follow skills and rules by running
   scenarios through `claude -p` on Blue's plan. It could measure AGENTS.md compliance. Its usage
   example uses Haiku to generate scenarios (verified in its `SKILL.md`), so Mako would pass Opus
   or Sonnet; run in a cloud session.
5. **`team-agent-orchestration`, PATTERN-MINE.** Its control-pane list (owner, branch, worktree,
   heartbeat, blockers, merge readiness by gate) matches what the control room and 1.2's queue
   tracker show.
6. **`loop-design-check`, PATTERN-MINE.** A review checklist for the runner, the PR sweeper and
   the Composer, all of which are loops.
7. **`agent-security-hardening`, PATTERN-MINE.** A checklist for agents that read untrusted
   content, for 1.2's daily security upkeep and the fenced web readers.
8. **`operator-approval-loop`, PATTERN-MINE.** The draft, decide and receipt shape fits approvals
   (A2); its time-boxed auto-approval stays out, because Blue approves.

sha256 of the top picks' `SKILL.md` at the pin:

| Skill | sha256 |
|---|---|
| `mcp-dependency-review` | `766536baa981710a85c8f761675f6a57f58600fff42b23ccf6171606180f4c12` |
| `click-path-audit` | `662fc5d02483bcd8ff799d6d3109a38da673182341cfc14445e9076fcd920162` |
| `e2e-testing` | `b0e00e7e17cb259101139900816c5528aed18dd10bcf5f9cb42cfc35baf8a755` |
| `skill-comply` | `e26cbbc30a32ea8c76c56d09ba9a3a921e82ad6e2360f825ec63d3f8df6b1f5a` |
| `team-agent-orchestration` | `a64dbdf4b6df857c044d6b38cf23324fcd7d2c139ba1cfcd39535e8c928c49a3` |
| `loop-design-check` | `d48c239c8b9ff253d103d7de7b9839c5bf9dbd3c90eddef7c4ac612b28d71bbd` |
| `agent-security-hardening` | `0e0895ada90aa8fa085e4257961ebe15f2dff43b843785b1533d4c731186ad81` |
| `operator-approval-loop` | `6f79952c1498c2748ea13d74ca665c7508ae72068e014e848dee0754e3d650e5` |

### Every skill, by group

Blue's verdict: write ADOPT, FORK, PROTOTYPE, PATTERN-MINE, BUILD FRESH or SKIP in the last
column (or "as proposed").

#### Agents, orchestration and loops (40)

| Skill | What it does | Fits Mako 1.2? Why | Proposed | Licence | Sensitive | Blue's verdict |
|---|---|---|---|---|---|---|
| `agent-architecture-audit` | Audits an agent app's 12-layer stack for regressions, memory pollution and hidden repair loops | Low: could audit the Composer once built; overlaps S65 | **PATTERN-MINE** | MIT (ECC repo); origin: oh-my-agent-check | no |  |
| `agent-eval` | Head-to-head comparison of coding agents on custom tasks (pass rate, cost, time) | Yes for 1.2's racing lanes and Codex as a builder target; S40 takes the agent-evaluator agent, this is the skill | **PATTERN-MINE** | MIT (skill's own header) | no |  |
| `agent-harness-construction` | Designing agent tool sets, action spaces and observation formats | Partly: input for the Composer's tool design; text only | **PATTERN-MINE** | MIT (ECC repo) | no |  |
| `agent-introspection-debugging` | Structured self-debugging after an agent failure: capture, diagnose, contained recovery, report | Yes: a shape for the runner's failure notes and 1.2's daily upkeep; text only | **PATTERN-MINE** | MIT (ECC repo) | no |  |
| `agent-runtime-gateway-smoke-test` | Checks a local agent API, a gateway tunnel and a sandbox callback | No: Mako opens no tunnels | SKIP | MIT (ECC repo) | network listeners |  |
| `agent-self-evaluation` | The agent rates its own output on five axes (ships a Python script) | No: Mako relies on independent review, not self-rating | SKIP | MIT (ECC repo) | no |  |
| `agentic-engineering` | Eval-first execution, decomposition and model routing for agent work | No: AGENTS.md already sets the model rule and the flow | SKIP | MIT (ECC repo) | no |  |
| `agentic-os` | Persistent multi-agent operating system on Claude Code with scheduled automation | No: overlaps Mako itself and the runner | SKIP | MIT (ECC repo) | process control |  |
| `ai-first-engineering` | Team process for code mostly written by agents | No: AGENTS.md is Mako's process | SKIP | MIT (ECC repo) | no |  |
| `autonomous-agent-harness` | Turns Claude Code into an autonomous agent with memory, schedules, computer use and queues | No: autonomous loops are out of scope without guardrails Blue approves | SKIP | MIT (ECC repo) | process control, credentials |  |
| `autonomous-loops` | Patterns for autonomous Claude Code loops up to multi-agent DAGs (kept for compatibility) | No: same out-of-scope rule; upstream marks it legacy | SKIP | MIT (ECC repo) | process control |  |
| `blueprint` | Turns a one-line goal into one-PR-sized steps with context briefs and a dependency graph | Partly: close to what the Composer hands its panes; S40's planner takes planning | **PATTERN-MINE** | MIT (ECC repo); origin: community | no |  |
| `claude-devfleet` | Dispatches parallel coding agents in worktrees through the Claude DevFleet service | No: Mako is this; it needs an outside service | SKIP | MIT (ECC repo); origin: community | credentials |  |
| `continuous-agent-loop` | Continuous agent loops with quality gates and recovery | No: same out-of-scope rule | SKIP | MIT (ECC repo) | process control |  |
| `council` | Four-voice council for ambiguous decisions | Low: Blue decides; the depth check covers pre-build thinking | SKIP | MIT (ECC repo) | no |  |
| `council-multi-model` | Adds one Codex critique after a council draft | No: Codex is already the required second reviewer | SKIP | MIT (ECC repo) | credentials (sends to OpenAI) |  |
| `dev-team` | Simulated PM, architect, developer and QA personas in one session | No: role-play, not independent review | SKIP | MIT (ECC repo); origin: community | no |  |
| `dmux-workflows` | Multi-agent work in tmux panes across harnesses | Low: Mako does this natively on Windows; tmux is Unix. Names Qwen's CLI as a harness (not shipped, so not a China-origin fail) | SKIP | MIT (ECC repo) | process control |  |
| `dynamic-workflow-mode` | Task-local harnesses and eval gates for adaptive agent workflows | Low: overlaps eval-harness | SKIP | MIT (ECC repo) | no |  |
| `enterprise-agent-ops` | Operating controls for long-lived agents: start, pause, stop, restart, observability, kill switches | Partly: its kill-switch and pause rules can check S19's "pause all" and 1.2's ghost mode; the rest is cloud-ops | **PATTERN-MINE** | MIT (ECC repo) | process control |  |
| `eval-harness` | Eval-driven development: define capability and regression evals first, grade, track pass@k | Partly: a method for the Composer's test sheet and later Composer versions | **PATTERN-MINE** | MIT (ECC repo) | no |  |
| `gan-style-harness` | Generator and evaluator agents that build an app autonomously | No: autonomous build loop | SKIP | MIT (ECC repo); origin: ECC-community | process control |  |
| `iterative-retrieval` | Refines a subagent's context over several passes | Low: Claude Code handles this | SKIP | MIT (ECC repo) | no |  |
| `loop-design-check` | Checklist to design or review an agent loop: machine-decidable goal, damping, staged rollout, five failure modes | Yes: a review lens for the runner, the PR sweeper and the Composer, all loops; text only | **PATTERN-MINE** | MIT (ECC repo) | no |  |
| `nanoclaw-repl` | ECC's own session-aware REPL | No: a separate tool | SKIP | MIT (ECC repo) | no |  |
| `nasiko-control-plane` | Installs and checks the experimental Nasiko CLI | No: an outside experimental tool | SKIP | MIT (ECC repo) | process control |  |
| `operator-approval-loop` | Approval contract for agent-drafted outbound messages: hashed drafts, decisions, delivery receipts | Partly: the draft, decide and receipt shape fits approvals (A2); its time-boxed auto-approval must not come over, since Blue approves | **PATTERN-MINE** | MIT (ECC repo) | client data (outbound messages) |  |
| `orch-add-feature` | orch-pipeline for a new feature | No: as orch-pipeline | SKIP | MIT (ECC repo) | no |  |
| `orch-build-mvp` | orch-pipeline for an MVP from a spec | No: as orch-pipeline | SKIP | MIT (ECC repo) | no |  |
| `orch-change-feature` | orch-pipeline for changing a working feature | No: as orch-pipeline | SKIP | MIT (ECC repo) | no |  |
| `orch-fix-defect` | orch-pipeline for a bug fix | No: as orch-pipeline | SKIP | MIT (ECC repo) | no |  |
| `orch-pipeline` | ECC's research, plan, TDD, review and commit pipeline behind the orch-* skills | No: relies on ECC's agents and commands; Mako has its own flow | SKIP | MIT (ECC repo) | no |  |
| `orch-refine-code` | orch-pipeline for a refactor | No: as orch-pipeline | SKIP | MIT (ECC repo) | no |  |
| `parallel-execution-optimizer` | Turns a task into a dependency graph of parallel lanes with isolated write surfaces and a final check | Yes for 1.2's racing lanes; text only | **PATTERN-MINE** | MIT (skill's own header) | no |  |
| `plan-orchestrate` | Turns a plan into ECC slash commands per step | No: emits ECC commands Mako doesn't have | SKIP | MIT (ECC repo) | no |  |
| `ralphinho-rfc-pipeline` | Splits an RFC into a multi-agent DAG and merges through a queue | No: merge queues conflict with "Blue alone merges" | SKIP | MIT (ECC repo) | no |  |
| `recursive-decision-ledger` | Repeated rollouts with an append-only decision ledger | No: no Mako need | SKIP | MIT (skill's own header) | no |  |
| `team-agent-orchestration` | Work items with owners, an agent Kanban, branch isolation, a control pane and merge gates for agent squads | Yes: its control-pane list (owner, branch, worktree, heartbeat, blockers, merge readiness by gate) is close to what S19's control room and 1.2's queue tracker show | **PATTERN-MINE** | MIT (ECC repo) | no |  |
| `team-builder` | Picker that dispatches up to five agent personas in parallel on one task | No: Mako's roles and the Composer cover it | SKIP | MIT (ECC repo); origin: community | no |  |
| `terminal-opener` | Opens a program and its argument array in a visible terminal, shell-free (ships a Node script) | Partly: its argv-array, no-shell launch matches Mako's launcher rules; Mako's PTY code stays its own (no loose code in PTY paths) | **PATTERN-MINE** | MIT (ECC repo) | process control |  |

#### Review, testing and verification (20)

| Skill | What it does | Fits Mako 1.2? Why | Proposed | Licence | Sensitive | Blue's verdict |
|---|---|---|---|---|---|---|
| `ai-regression-testing` | Regression tests aimed at blind spots of AI-written code | Low: pr-test-analyzer covers test gaps | SKIP | MIT (ECC repo) | no |  |
| `benchmark` | Performance baselines for web vitals, API latency and build times | Low: web-app metrics; Mako's start time could use it later | SKIP | MIT (skill's own header) | no |  |
| `benchmark-optimization-loop` | Bounded measure-and-improve loop for speed requests | Low: no current speed work | SKIP | MIT (skill's own header) | no |  |
| `browser-qa` | Post-deploy UI checks through a browser automation MCP | No: Mako isn't deployed to the web, and agents never drive the Mako Firefox profile | SKIP | MIT (ECC repo) | no |  |
| `canary-watch` | Watches a deployed URL after releases | No: no web deploys | SKIP | MIT (ECC repo) | no |  |
| `change-impact` | Impact analysis before a change, then planned against actual diff afterwards | Partly: input for S40's "what the diff should have touched" check after it merges | **PATTERN-MINE** | MIT (ECC repo) | no |  |
| `click-path-audit` | Traces each button through its state changes to find flows that cancel each other out | Yes: a read-only trial on the renderer, as S43 did with spec-miner, would test the new tabs | **PROTOTYPE** | MIT (ECC repo); origin: community | no |  |
| `codehealth-mcp` | Code-health scores through CodeScene's MCP | No: a paid outside service | SKIP | MIT (ECC repo); origin: community | credentials |  |
| `conventional-commit-review` | Drafts Conventional Commits messages | No: Mako doesn't use that format | SKIP | MIT (ECC repo); origin: personal | no |  |
| `e2e-testing` | Playwright end-to-end tests: page objects, config, flaky-test handling, artifacts | Yes: Mako has no end-to-end tests; Playwright can drive Electron, which would move some PC checks into CI | **PROTOTYPE** | MIT (ECC repo) | CI workflows |  |
| `issue-review` | Reviews a GitHub issue against the code, finds duplicates, scores it | Partly: a shape for triaging issue #164's pick-up list; any gh writes would follow agent-account pacing | **PATTERN-MINE** | MIT (ECC repo) | no |  |
| `module-regression` | A REGRESSION.md ledger of each module's consumers and acceptance command | Low: Mako's single test script runs everything | SKIP | MIT (ECC repo) | no |  |
| `plankton-code-quality` | Formats, lints and has Claude auto-fix on every edit through hooks | No: hooks on every edit, and auto-fix spends usage | SKIP | MIT (ECC repo); origin: community | .claude/ hooks |  |
| `production-audit` | Local-evidence production-readiness audit | Low: S59 and S65 cover the release | SKIP | MIT (ECC repo); origin: community | no |  |
| `santa-method` | Two independent reviewers must both pass before output ships | No: Mako already needs Claude's and Codex's passes | SKIP | MIT (ECC repo); origin: Ronald Skelton - Founder, RapportScore.ai | no |  |
| `skill-comply` | Measures whether skills and rules are followed by running scenarios through `claude -p` (ships Python) | Yes: could measure how well agents follow AGENTS.md. Its default generator model is Haiku, so Mako would set Opus or Sonnet; cloud only | **PROTOTYPE** | MIT (ECC repo) | no |  |
| `tdd-workflow` | Test-first workflow with an 80% coverage target | No: Mako has no coverage tool and its own test gate | SKIP | MIT (ECC repo) | no |  |
| `test-collaboration` | Links requirements and risks to stable test IDs | Low: heavier than Mako's plain test files need | SKIP | MIT (ECC repo) | no |  |
| `verification-loop` | Build, types, lint, tests, security grep and diff review, then PASS or FAIL | No: CI and pr-reviewer cover it | SKIP | MIT (skill's own header) | no |  |
| `windows-desktop-e2e` | End-to-end tests for native Windows apps (WPF, WinForms, Qt) with pywinauto | Low: Mako's UI is Chromium inside Electron, which Playwright tests better | SKIP | MIT (ECC repo) | no |  |

#### Security (9)

| Skill | What it does | Fits Mako 1.2? Why | Proposed | Licence | Sensitive | Blue's verdict |
|---|---|---|---|---|---|---|
| `agent-security-hardening` | Hardening for agents that read untrusted content: trust boundaries, path containment, credentials, tool output | Yes: a checklist for 1.2's daily security upkeep and the fenced web readers | **PATTERN-MINE** | MIT (ECC repo) | credentials |  |
| `hermes-imports` | Turns local Hermes workflows into sanitized ECC skills | No: only if the Hermes trial (Month two) happens | SKIP | MIT (ECC repo) | credentials |  |
| `mcp-dependency-review` | Static review of MCP configs for unpinned package references, without running them | Yes: fits the pin-and-scan step for MCP servers (Mako ships the Playwright MCP); read-only | **FORK** | MIT (ECC repo) | no |  |
| `opensource-pipeline` | Forks, sanitizes and packages a private project for public release | No: S41's sanitizer test guards the public repo | SKIP | MIT (ECC repo) | no |  |
| `repo-scan` | Pointer that installs an outside repo-scan skill from a pinned commit | No: installs a second outside skill | SKIP | MIT (ECC repo); origin: community | no |  |
| `safety-guard` | Asks the agent to confirm destructive commands or stay in one folder (instructions, not enforced) | No: Mako's settings.json deny list, the account guard and S44's GateGuard trial enforce more | SKIP | MIT (ECC repo) | no |  |
| `security-bounty-hunter` | Hunts for remotely reachable, bounty-grade bugs in a repo | No: S38 and S65 do Mako's security checks | SKIP | MIT (ECC repo); origin: ECC direct-port adaptation | no |  |
| `security-review` | Security checklist for auth, input, secrets, endpoints and payments | No: S39's security-reviewer agent covers it | SKIP | MIT (ECC repo) | no |  |
| `security-scan` | Scans `.claude/` (CLAUDE.md, settings, hooks, MCP, agents) with the AgentShield npm tool | Partly: useful for daily security upkeep, but it runs an unpinned `npx` package by the same author; pinned and scanned first, cloud only | **PROTOTYPE** | MIT (ECC repo) | .claude/ |  |

#### Plans, docs and decisions (25)

| Skill | What it does | Fits Mako 1.2? Why | Proposed | Licence | Sensitive | Blue's verdict |
|---|---|---|---|---|---|---|
| `api-connector-builder` | Adds an integration that matches the repo's existing pattern | Low: general advice | SKIP | MIT (ECC repo); origin: ECC direct-port adaptation | no |  |
| `api-design` | REST API design patterns | No: Mako has no REST API | SKIP | MIT (ECC repo) | no |  |
| `architecture-decision-records` | Numbered ADR files in docs/adr/ | No: docs/DECISIONS.md and the OSS records cover it | SKIP | MIT (ECC repo) | no |  |
| `brownfield-retrospective` | Runs ECC's process backwards over an existing project | No: ECC-specific | SKIP | MIT (ECC repo) | no |  |
| `code-tour` | Writes CodeTour walkthrough files for VS Code | Low: S64's guidebook is for users, not code | SKIP | MIT (ECC repo) | no |  |
| `codebase-onboarding` | Onboarding guide and a starter CLAUDE.md for a new codebase | No: Mako's CLAUDE.md is sensitive and hand-kept | SKIP | MIT (ECC repo) | no |  |
| `coding-standards` | Cross-project coding conventions | No: overlaps AGENTS.md; S39 removed this kind of file-size rule | SKIP | MIT (ECC repo) | no |  |
| `context-and-decisions` | A scoped CONTEXT.md plus routing to ADRs | No: as above | SKIP | MIT (own LICENSE file, Copyright (c) 2026 Matt Pocock) | no |  |
| `contract-first` | One machine-checked contract (OpenAPI, JSON Schema) between services | Low: Mako's IPC is internal | SKIP | MIT (ECC repo) | no |  |
| `docs-governance` | Read-only audit of doc roles, links and ADR indexes (ships Python) | Low: routes to ECC skills | SKIP | MIT (ECC repo) | no |  |
| `error-handling` | Typed errors, retries and circuit breakers in TS, Python and Go | Low: silent-failure-hunter covers Mako's error paths | SKIP | MIT (ECC repo) | no |  |
| `git-workflow` | Branching, rebase, history tidying and conflict patterns | No: its rebase and history-rewrite advice conflicts with Mako's no force-push rule | SKIP | MIT (ECC repo) | no |  |
| `github-ops` | Issue, PR, CI and release work with the gh CLI | No: AGENTS.md and agent-account pacing govern this | SKIP | MIT (ECC repo) | CI workflows, repo settings |  |
| `growth-log` | Lessons entries as root cause, rule and signal | Partly: a format for the lessons file that feeds S28 and S60 | **PATTERN-MINE** | MIT (ECC repo) | no |  |
| `hexagonal-architecture` | Ports and adapters design | No: no need | SKIP | MIT (ECC repo) | no |  |
| `inherit-legacy-style` | Writes a style-rules file from a legacy codebase | No: AGENTS.md has the rules | SKIP | MIT (ECC repo); origin: community | no |  |
| `intent-driven-development` | Turns vague changes into acceptance criteria | Low: the plan's "done when" column does this | SKIP | MIT (ECC repo) | no |  |
| `jira-integration` | Jira tickets through MCP or REST | No: no Jira | SKIP | MIT (ECC repo) | credentials |  |
| `living-docs-governance` | Gives project docs constitution, map, status and history roles and points the agent at them | Low: Mako's shared brain already does this | SKIP | MIT (ECC repo) | no |  |
| `module-governance` | Per-module agent instructions | No: Mako is one app | SKIP | MIT (ECC repo) | no |  |
| `plan-canvas` | Opens plans in a local browser canvas for comments and approval | No: it runs a local server on a fixed port; Mako is the UI | SKIP | MIT (ECC repo) | network listeners |  |
| `product-capability` | Turns a PRD into a capability plan | Low: as above | SKIP | MIT (ECC repo) | no |  |
| `product-lens` | YC-style product diagnostic and go or no-go brief | No: a business question | SKIP | MIT (ECC repo) | no |  |
| `project-flow-ops` | Triage across GitHub and Linear | No: Mako doesn't use Linear | SKIP | MIT (ECC repo) | credentials |  |
| `story-lifecycle` | File-based epics, stories and sprints | No: the plan and issues cover it | SKIP | MIT (ECC repo); origin: community | no |  |

#### UI, design and accessibility (15)

| Skill | What it does | Fits Mako 1.2? Why | Proposed | Licence | Sensitive | Blue's verdict |
|---|---|---|---|---|---|---|
| `accessibility` | Designs and audits UI to WCAG 2.2 AA (web, iOS, Android) | Yes: a checklist for the three tabs and 1.2's aquarium | **PATTERN-MINE** | MIT (ECC repo) | no |  |
| `design-system` | Extracts or audits design tokens | No: S14 chose UI UX Pro Max for this | SKIP | MIT (ECC repo) | no |  |
| `frontend-a11y` | Accessibility for React and Next.js | No: Mako has no React; see accessibility | SKIP | MIT (ECC repo); origin: community | no |  |
| `frontend-design-direction` | ECC's own UI design direction (ships a script) | No: S14's brief sets Mako's look | SKIP | MIT (ECC repo); origin: community | no |  |
| `frontend-patterns` | React and Next.js patterns | No: no React | SKIP | MIT (ECC repo) | no |  |
| `frontend-slides` | HTML slide decks with animation (ships scripts) | No: no need | SKIP | MIT (ECC repo) | no |  |
| `i18n-sync` | Syncs JSON locale files | No: Mako is English only | SKIP | MIT (ECC repo); origin: community | no |  |
| `ios-icon-gen` | iOS app icon sets (ships shell and Swift) | No: iOS | SKIP | MIT (ECC repo); origin: community | no |  |
| `liquid-glass-design` | iOS 26 Liquid Glass UI | No: iOS | SKIP | MIT (ECC repo) | no |  |
| `make-interfaces-feel-better` | Concrete polish details: spacing, type, borders, motion, hit areas | Partly: polish checklist for 1.2 UI work; S14's design brief leads | **PATTERN-MINE** | MIT (ECC repo); origin: community | no |  |
| `motion-advanced` | Advanced gestures and drag for React's motion library | No: no React | SKIP | MIT (ECC repo) | no |  |
| `motion-foundations` | Motion tokens for React's motion library | No: no React | SKIP | MIT (ECC repo) | no |  |
| `motion-patterns` | Animation patterns for React's motion library | No: no React | SKIP | MIT (ECC repo) | no |  |
| `ui-demo` | Records UI demo videos with Playwright | Low: S52's HyperFrames covers video; could later film the guidebook | SKIP | MIT (ECC repo) | no |  |
| `ui-to-vue` | Screenshots to Vue 3 components | No: no Vue | SKIP | MIT (ECC repo); origin: community | no |  |

#### Video, media and research (24)

| Skill | What it does | Fits Mako 1.2? Why | Proposed | Licence | Sensitive | Blue's verdict |
|---|---|---|---|---|---|---|
| `content-hash-cache-pattern` | Caches file-processing results by content hash | Partly: could stop Video Scout re-analysing the same file (not verified that it does) | **PATTERN-MINE** | MIT (ECC repo) | no |  |
| `data-scraper-agent` | Scheduled scraper that enriches data with Gemini Flash | No: scheduled web reading outside the fence | SKIP | MIT (ECC repo); origin: community | credentials |  |
| `deep-research` | Cited research reports through the firecrawl and exa MCPs | No: paid outside services; web readers run fenced (S58) | SKIP | MIT (ECC repo) | credentials |  |
| `documentation-lookup` | Current library docs through the Context7 MCP | Low: an outside MCP service for what web fetch does | SKIP | MIT (ECC repo) | no |  |
| `exa-search` | Neural web search through Exa's MCP | No: a paid outside service | SKIP | MIT (ECC repo) | credentials |  |
| `fal-ai-media` | Image, video and audio generation through fal.ai | No: paid service, and it names ByteDance's Seedance and Kuaishou's Kling models (China-origin rule) | SKIP | MIT (ECC repo) | credentials |  |
| `manim-video` | Animated explainers with Manim | No: HyperFrames covers it | SKIP | MIT (ECC repo) | no |  |
| `nutrient-document-processing` | Document OCR, conversion and signing through the Nutrient API | No: paid service | SKIP | MIT (ECC repo) | credentials, client data |  |
| `osint-investigation` | Sparse-clue OSINT method | No: not Mako; CC-BY-SA-4.0 would need share-alike | SKIP | CC-BY-SA-4.0 (own LICENSE.txt; share-alike) | client data |  |
| `regex-vs-llm-structured-text` | Regex first, model second, for parsing structured text | Low: no current need | SKIP | MIT (ECC repo) | no |  |
| `remotion-video-creation` | Rules for video in React with Remotion | No: HyperFrames (S52) was chosen | SKIP | MIT (ECC repo) | no |  |
| `research-ops` | ECC's evidence-first research workflow | Low: AGENTS.md's certainty labels cover the evidence rule | SKIP | MIT (ECC repo) | no |  |
| `scientific-db-pubmed-database` | PubMed literature search | No: not Mako | SKIP | MIT (ECC repo); origin: community | no |  |
| `scientific-db-uspto-database` | USPTO patent and trademark lookup | No: not Mako | SKIP | MIT (ECC repo); origin: community | no |  |
| `scientific-pkg-gget` | Genomics database queries | No: not Mako | SKIP | MIT (ECC repo); origin: community | no |  |
| `scientific-thinking-literature-review` | Systematic literature reviews | No: not Mako | SKIP | MIT (ECC repo); origin: community | no |  |
| `scientific-thinking-scholar-evaluation` | Evaluates scholarly papers | No: not Mako | SKIP | MIT (ECC repo); origin: community | no |  |
| `taste` | Creative direction for music videos | No: not Mako; part of the taste set below | SKIP | MIT (ECC repo) | no |  |
| `taste-application` | Generates video on fal against a style pack (ships 61 Python files) | No: generates with Kling and Seedance (China-origin rule) | SKIP | MIT (ECC repo; scripts/LICENSE, same holder) | credentials |  |
| `taste-distillation` | Measures reference videos into a style pack (ships Python) | No: feeds taste-application; names China-origin models | SKIP | MIT (ECC repo) | no |  |
| `tasteforge-video` | File-driven media discovery and style-pack workflows | No: part of the taste set | SKIP | MIT (ECC repo) | no |  |
| `video-editing` | AI video editing with FFmpeg, Remotion, ElevenLabs, fal.ai and Descript | No: paid services; HyperFrames is Mako's video tool | SKIP | MIT (ECC repo) | credentials |  |
| `videodb` | Indexes and edits video and audio with the hosted VideoDB service | No: a new paid service that uploads video; S54 keeps analysis on Blue's plan | SKIP | MIT (ECC repo) | credentials, client data |  |
| `visa-doc-translate` | OCRs and translates visa documents into a PDF | No: personal documents | SKIP | MIT (ECC repo) | client data |  |

#### Usage, cost and context (8)

| Skill | What it does | Fits Mako 1.2? Why | Proposed | Licence | Sensitive | Blue's verdict |
|---|---|---|---|---|---|---|
| `context-budget` | Routes context checks to Claude Code's and Codex's own meters | Partly: the usage panel could show both meters the same way | **PATTERN-MINE** | MIT (ECC repo) | no |  |
| `cost-aware-llm-pipeline` | Model routing and budgets for LLM API use | No: no API credits | SKIP | MIT (ECC repo) | no |  |
| `cost-tracking` | Reports Claude Code usage and spend from ECC's cost log | Partly: 1.2's cost reporting beyond the usage panel; it reads a log written by an ECC hook Mako doesn't run, so only the report shape | **PATTERN-MINE** | MIT (ECC repo); origin: community | no |  |
| `prompt-caching-strategy` | Raises prompt-cache hit rates to cut API cost | No: Mako uses no API credits | SKIP | MIT (ECC repo); origin: community | no |  |
| `prompt-optimizer` | Rewrites draft prompts against ECC's commands | No: ECC-specific | SKIP | MIT (ECC repo); origin: community | no |  |
| `strategic-compact` | Suggests manual compaction at task boundaries | Low: S46 session hygiene and Claude Code's own compaction | SKIP | MIT (ECC repo) | no |  |
| `token-budget-advisor` | Offers 25 to 100% answer depth with token estimates | No: no need | SKIP | MIT (ECC repo); origin: community | no |  |
| `token-card` | Renders a usage card from local session logs and commits it to the repo | No: committing usage numbers to a public repo | SKIP | MIT (ECC repo); origin: community | no |  |

#### Hooks, memory and harness add-ons (15)

| Skill | What it does | Fits Mako 1.2? Why | Proposed | Licence | Sensitive | Blue's verdict |
|---|---|---|---|---|---|---|
| `automation-audit-ops` | Inventories live jobs, hooks and connectors for ECC | No: ECC-centric | SKIP | MIT (ECC repo) | no |  |
| `ck` | Per-project memory with /ck commands and a SessionStart hook (ships Node) | No: S48 chose Open Second Brain (PROTOTYPE) | SKIP | MIT (ECC repo); origin: community | .claude/ hooks |  |
| `config-gc` | Cleans up ~/.claude skills, memory, hooks and permissions | No: touches Blue's user-level Claude config | SKIP | MIT (ECC repo) | .claude/, credentials |  |
| `continuous-learning` | Deprecated v1 of the above | No: deprecated upstream | SKIP | MIT (ECC repo) | .claude/ hooks |  |
| `continuous-learning-v2` | Hooks watch every session and turn patterns into instincts, skills and agents (ships shell and Python) | No: hooks over all sessions; S28's lessons and S48's memory cover learning | SKIP | MIT (ECC repo) | .claude/ hooks |  |
| `delivery-gate` | Stop hook that blocks finishing until checks pass (ships Python) | Low: S44's GateGuard trial tests the same idea | SKIP | MIT (ECC repo) | .claude/ hooks |  |
| `flox-environments` | Nix-based dev environments for macOS and Linux | No: Mako is Windows | SKIP | MIT (ECC repo); origin: Flox | no |  |
| `generating-python-installer` | Windows installers for Python apps with Nuitka and Inno Setup | No: Mako is Electron | SKIP | MIT (ECC repo) | no |  |
| `hookify-rules` | Writes hookify rule files that warn or block | No: hooks are sensitive and Mako writes its own | SKIP | MIT (ECC repo) | .claude/ hooks |  |
| `knowledge-ops` | Knowledge base ingestion and sync across stores | No: S48 covers memory | SKIP | MIT (ECC repo) | no |  |
| `mcp-server-patterns` | Building MCP servers in Node or TypeScript | Low: no Mako MCP server is planned | SKIP | MIT (ECC repo) | network listeners |  |
| `terminal-ops` | ECC's evidence-first command and CI-fix workflow | No: AGENTS.md covers it | SKIP | MIT (ECC repo) | no |  |
| `unified-memory` | Shared memory vault across Claude, Codex and other agents | No: S48 covers memory | SKIP | MIT (ECC repo) | no |  |
| `unified-notifications-ops` | One flow for alerts across GitHub, Linear, desktop and chat | Partly: 1.2's phone updates from Mako; dedupe and escalation rules | **PATTERN-MINE** | MIT (ECC repo) | credentials |  |
| `workspace-surface-audit` | Audits repo, MCP, plugins and env and recommends ECC skills | No: ECC-centric | SKIP | MIT (ECC repo) | credentials |  |

#### ECC's own tooling (12)

| Skill | What it does | Fits Mako 1.2? Why | Proposed | Licence | Sensitive | Blue's verdict |
|---|---|---|---|---|---|---|
| `agent-sort` | Sorts ECC's parts into daily and library buckets for a repo | No: ECC install tooling | SKIP | MIT (ECC repo) | no |  |
| `configure-ecc` | ECC's setup wizard (names Kimi's CLI) | No: ECC install tooling | SKIP | MIT (ECC repo) | .claude/ |  |
| `deepseek-harness-setup` | Installs ECC on the DeepSeek Harness | No: China-origin (DeepSeek); fails the rule | SKIP | MIT (ECC repo); origin: community | no |  |
| `ecc-guide` | Answers questions about ECC from its repo | No: ECC-specific | SKIP | MIT (ECC repo); origin: community | no |  |
| `ecc-recipes` | Maps a workflow to ECC command groups | No: ECC-specific | SKIP | MIT (ECC repo); origin: community | no |  |
| `ecc-tools-cost-audit` | Audits ECC Tools' GitHub App costs | No: ECC-specific | SKIP | MIT (ECC repo) | no |  |
| `openclaw-persona-forge` | Builds a persona for an OpenClaw agent (written in Chinese) | No: not Mako | SKIP | MIT (ECC repo); origin: community | no |  |
| `rules-distill` | Distils repeated skill principles into rule files (ships shell) | No: rules live in AGENTS.md | SKIP | MIT (ECC repo) | no |  |
| `search-first` | Searches packages, MCPs and GitHub before writing code | Low: the OSS-first rule and depth check cover it | SKIP | MIT (ECC repo) | no |  |
| `skill-host-compat` | Lints ECC skills for Codex and Cursor | No: ECC-specific | SKIP | MIT (ECC repo) | no |  |
| `skill-scout` | Searches for an existing skill before writing one | Low: AGENTS.md's OSS-first rule covers it | SKIP | MIT (ECC repo); origin: community | no |  |
| `skill-stocktake` | Audits skills and commands for quality (ships shell) | Low: Mako has few skills | SKIP | MIT (ECC repo) | no |  |

#### Languages, frameworks and infrastructure Mako doesn't use (94)

| Skill | What it does | Fits Mako 1.2? Why | Proposed | Licence | Sensitive | Blue's verdict |
|---|---|---|---|---|---|---|
| `android-clean-architecture` | Android clean architecture | No: Mako doesn't use it | SKIP | MIT (ECC repo) | no |  |
| `angular-developer` | Angular code and guidance | No: Mako doesn't use it | SKIP | MIT (ECC repo) | no |  |
| `backend-patterns` | Node, Express and Next.js backend patterns | No: Mako doesn't use it | SKIP | MIT (ECC repo) | no |  |
| `bengali-nlp` | Bengali text processing | No: Mako doesn't use it | SKIP | MIT (ECC repo) | no |  |
| `blender-motion-state-inspection` | Inspects Blender rigs and animation | No: Mako doesn't use it | SKIP | MIT (ECC repo) | no |  |
| `bun-runtime` | Bun runtime | No: Mako doesn't use it | SKIP | MIT (ECC repo) | no |  |
| `cisco-ios-patterns` | Cisco IOS config review | No: Mako doesn't use it | SKIP | MIT (ECC repo); origin: community | no |  |
| `clickhouse-io` | ClickHouse queries | No: Mako doesn't use it | SKIP | MIT (ECC repo) | no |  |
| `compose-multiplatform-patterns` | Compose Multiplatform UI | No: Mako doesn't use it | SKIP | MIT (ECC repo) | no |  |
| `cpp-coding-standards` | C++ standards | No: Mako doesn't use it | SKIP | MIT (ECC repo) | no |  |
| `cpp-testing` | C++ tests | No: Mako doesn't use it | SKIP | MIT (ECC repo) | no |  |
| `csharp-testing` | C# tests | No: Mako doesn't use it | SKIP | MIT (ECC repo) | no |  |
| `dart-flutter-patterns` | Dart and Flutter | No: Mako doesn't use it | SKIP | MIT (ECC repo) | no |  |
| `dashboard-builder` | Grafana-style dashboards | No: Mako doesn't use it | SKIP | MIT (ECC repo); origin: ECC direct-port adaptation | no |  |
| `data-throughput-accelerator` | Speeding up bulk data movement | No: Mako doesn't use it | SKIP | MIT (skill's own header) | no |  |
| `database-migrations` | Database migrations | No: Mako doesn't use it | SKIP | MIT (ECC repo) | no |  |
| `deployment-patterns` | Web deploys and CI/CD | No: Mako doesn't use it | SKIP | MIT (ECC repo) | no |  |
| `django-celery` | Django and Celery | No: Mako doesn't use it | SKIP | MIT (ECC repo) | no |  |
| `django-patterns` | Django patterns | No: Mako doesn't use it | SKIP | MIT (ECC repo) | no |  |
| `django-security` | Django security | No: Mako doesn't use it | SKIP | MIT (ECC repo) | no |  |
| `django-tdd` | Django tests | No: Mako doesn't use it | SKIP | MIT (ECC repo) | no |  |
| `django-verification` | Django verification | No: Mako doesn't use it | SKIP | MIT (ECC repo) | no |  |
| `docker-patterns` | Docker and Compose | No: Mako doesn't use it | SKIP | MIT (ECC repo) | no |  |
| `dotnet-patterns` | .NET patterns | No: Mako doesn't use it | SKIP | MIT (ECC repo) | no |  |
| `fastapi-patterns` | FastAPI | No: Mako doesn't use it | SKIP | MIT (ECC repo) | no |  |
| `flutter-dart-code-review` | Flutter review | No: Mako doesn't use it | SKIP | MIT (ECC repo) | no |  |
| `foundation-models-on-device` | Apple on-device models | No: Mako doesn't use it | SKIP | MIT (ECC repo) | no |  |
| `fsharp-testing` | F# tests | No: Mako doesn't use it | SKIP | MIT (ECC repo) | no |  |
| `golang-patterns` | Go patterns | No: Mako doesn't use it | SKIP | MIT (ECC repo) | no |  |
| `golang-testing` | Go tests | No: Mako doesn't use it | SKIP | MIT (ECC repo) | no |  |
| `homelab-network-readiness` | Homelab network checklist | No: Mako doesn't use it | SKIP | MIT (ECC repo); origin: community | no |  |
| `homelab-network-setup` | Homelab network planning | No: Mako doesn't use it | SKIP | MIT (ECC repo); origin: community | no |  |
| `homelab-pihole-dns` | Pi-hole DNS | No: Mako doesn't use it | SKIP | MIT (ECC repo); origin: community | no |  |
| `homelab-vlan-segmentation` | Homelab VLANs | No: Mako doesn't use it | SKIP | MIT (ECC repo); origin: community | no |  |
| `homelab-wireguard-vpn` | WireGuard VPN | No: Mako doesn't use it | SKIP | MIT (ECC repo); origin: community | no |  |
| `java-coding-standards` | Java standards | No: Mako doesn't use it | SKIP | MIT (ECC repo) | no |  |
| `jpa-patterns` | JPA and Hibernate | No: Mako doesn't use it | SKIP | MIT (ECC repo) | no |  |
| `kotlin-coroutines-flows` | Kotlin coroutines | No: Mako doesn't use it | SKIP | MIT (ECC repo) | no |  |
| `kotlin-exposed-patterns` | Kotlin Exposed ORM | No: Mako doesn't use it | SKIP | MIT (ECC repo) | no |  |
| `kotlin-ktor-patterns` | Ktor servers | No: Mako doesn't use it | SKIP | MIT (ECC repo) | no |  |
| `kotlin-patterns` | Kotlin patterns | No: Mako doesn't use it | SKIP | MIT (ECC repo) | no |  |
| `kotlin-testing` | Kotlin tests | No: Mako doesn't use it | SKIP | MIT (ECC repo) | no |  |
| `kubernetes-patterns` | Kubernetes | No: Mako doesn't use it | SKIP | MIT (ECC repo) | no |  |
| `laravel-patterns` | Laravel | No: Mako doesn't use it | SKIP | MIT (ECC repo) | no |  |
| `laravel-plugin-discovery` | Laravel package search | No: Mako doesn't use it | SKIP | MIT (ECC repo) | no |  |
| `laravel-security` | Laravel security | No: Mako doesn't use it | SKIP | MIT (ECC repo) | no |  |
| `laravel-tdd` | Laravel tests | No: Mako doesn't use it | SKIP | MIT (ECC repo) | no |  |
| `laravel-verification` | Laravel verification | No: Mako doesn't use it | SKIP | MIT (ECC repo) | no |  |
| `latency-critical-systems` | Latency tuning for live systems | No: Mako doesn't use it | SKIP | MIT (skill's own header) | no |  |
| `ml-adoption-playbook` | Adding ML to a codebase | No: Mako doesn't use it | SKIP | MIT (ECC repo) | no |  |
| `mle-workflow` | Production ML engineering | No: Mako doesn't use it | SKIP | MIT (skill's own header) | no |  |
| `mybatis-patterns` | MyBatis | No: Mako doesn't use it | SKIP | MIT (ECC repo) | no |  |
| `mysql-patterns` | MySQL | No: Mako doesn't use it | SKIP | MIT (ECC repo) | no |  |
| `nestjs-patterns` | NestJS | No: Mako doesn't use it | SKIP | MIT (ECC repo) | no |  |
| `netmiko-ssh-automation` | Netmiko SSH automation | No: Mako doesn't use it | SKIP | MIT (ECC repo); origin: community | no |  |
| `network-bgp-diagnostics` | BGP diagnostics | No: Mako doesn't use it | SKIP | MIT (ECC repo); origin: community | no |  |
| `network-config-validation` | Router config checks | No: Mako doesn't use it | SKIP | MIT (ECC repo); origin: community | no |  |
| `network-interface-health` | Interface error diagnosis | No: Mako doesn't use it | SKIP | MIT (ECC repo); origin: community | no |  |
| `nextjs-turbopack` | Next.js and Turbopack | No: Mako doesn't use it | SKIP | MIT (ECC repo) | no |  |
| `nuxt4-patterns` | Nuxt 4 | No: Mako doesn't use it | SKIP | MIT (ECC repo) | no |  |
| `perl-patterns` | Perl patterns | No: Mako doesn't use it | SKIP | MIT (ECC repo) | no |  |
| `perl-security` | Perl security | No: Mako doesn't use it | SKIP | MIT (ECC repo) | no |  |
| `perl-testing` | Perl tests | No: Mako doesn't use it | SKIP | MIT (ECC repo) | no |  |
| `postgres-patterns` | PostgreSQL | No: Mako doesn't use it | SKIP | MIT (ECC repo) | no |  |
| `prisma-patterns` | Prisma ORM | No: Mako doesn't use it | SKIP | MIT (ECC repo) | no |  |
| `python-patterns` | Python patterns | No: Mako doesn't use it | SKIP | MIT (ECC repo) | no |  |
| `python-testing` | Python tests | No: Mako doesn't use it | SKIP | MIT (ECC repo) | no |  |
| `pytorch-patterns` | PyTorch | No: Mako doesn't use it | SKIP | MIT (ECC repo) | no |  |
| `quarkus-patterns` | Quarkus | No: Mako doesn't use it | SKIP | MIT (ECC repo) | no |  |
| `quarkus-security` | Quarkus security | No: Mako doesn't use it | SKIP | MIT (ECC repo) | no |  |
| `quarkus-tdd` | Quarkus tests | No: Mako doesn't use it | SKIP | MIT (ECC repo) | no |  |
| `quarkus-verification` | Quarkus verification | No: Mako doesn't use it | SKIP | MIT (ECC repo) | no |  |
| `rails-patterns` | Rails | No: Mako doesn't use it | SKIP | MIT (ECC repo); origin: community | no |  |
| `react-native-patterns` | React Native | No: Mako doesn't use it | SKIP | MIT (ECC repo) | no |  |
| `react-patterns` | React | No: Mako doesn't use it | SKIP | MIT (ECC repo) | no |  |
| `react-performance` | React performance | No: Mako doesn't use it | SKIP | MIT (ECC repo); says it adapts Vercel Labs' react-best-practices, MIT by its own note (not verified) | no |  |
| `react-testing` | React tests | No: Mako doesn't use it | SKIP | MIT (ECC repo) | no |  |
| `recsys-pipeline-architect` | Recommendation pipelines | No: Mako doesn't use it | SKIP | MIT (ECC repo); origin: community | no |  |
| `redis-patterns` | Redis | No: Mako doesn't use it | SKIP | MIT (ECC repo) | no |  |
| `rust-patterns` | Rust patterns | No: Mako doesn't use it | SKIP | MIT (ECC repo) | no |  |
| `rust-testing` | Rust tests | No: Mako doesn't use it | SKIP | MIT (ECC repo) | no |  |
| `springboot-patterns` | Spring Boot | No: Mako doesn't use it | SKIP | MIT (ECC repo) | no |  |
| `springboot-security` | Spring Security | No: Mako doesn't use it | SKIP | MIT (ECC repo) | no |  |
| `springboot-tdd` | Spring Boot tests | No: Mako doesn't use it | SKIP | MIT (ECC repo) | no |  |
| `springboot-verification` | Spring Boot verification | No: Mako doesn't use it | SKIP | MIT (ECC repo) | no |  |
| `swift-actor-persistence` | Swift actors | No: Mako doesn't use it | SKIP | MIT (ECC repo) | no |  |
| `swift-concurrency-6-2` | Swift concurrency | No: Mako doesn't use it | SKIP | MIT (ECC repo) | no |  |
| `swift-protocol-di-testing` | Swift testing | No: Mako doesn't use it | SKIP | MIT (ECC repo) | no |  |
| `swiftui-patterns` | SwiftUI | No: Mako doesn't use it | SKIP | MIT (ECC repo) | no |  |
| `tinystruct-patterns` | tinystruct Java framework | No: Mako doesn't use it | SKIP | MIT (ECC repo) | no |  |
| `typescript-patterns` | TypeScript patterns (Mako is plain JS; S39's typescript-reviewer covers it) | No: Mako doesn't use it | SKIP | MIT (ECC repo) | no |  |
| `uncloud` | Uncloud clusters | No: Mako doesn't use it | SKIP | MIT (ECC repo) | no |  |
| `vite-patterns` | Vite | No: Mako doesn't use it | SKIP | MIT (ECC repo) | no |  |
| `vue-patterns` | Vue | No: Mako doesn't use it | SKIP | MIT (ECC repo) | no |  |

#### Business, outreach and other domains (51)

| Skill | What it does | Fits Mako 1.2? Why | Proposed | Licence | Sensitive | Blue's verdict |
|---|---|---|---|---|---|---|
| `agent-payment-x402` | Payments from agents through x402 wallets | No: business or domain work, not Mako; business work belongs in a private repo | SKIP | MIT (ECC repo); origin: community | payments, credentials |  |
| `article-writing` | Long-form articles in a given voice | No: business or domain work, not Mako; business work belongs in a private repo | SKIP | MIT (ECC repo) | no |  |
| `benchmark-methodology` | Scores competitors on nine dimensions | No: business or domain work, not Mako; business work belongs in a private repo | SKIP | MIT (skill's own header) | no |  |
| `brand-discovery` | Brand identity interview | No: business or domain work, not Mako; business work belongs in a private repo | SKIP | MIT (ECC repo) | no |  |
| `brand-voice` | Writing-style profile from real posts | No: business or domain work, not Mako; business work belongs in a private repo | SKIP | MIT (ECC repo) | no |  |
| `carrier-relationship-management` | Freight carrier management | No: business or domain work, not Mako; business work belongs in a private repo | SKIP | Apache-2.0 (skill's own header) | no |  |
| `competitive-platform-analysis` | Scopes a competitor set | No: business or domain work, not Mako; business work belongs in a private repo | SKIP | MIT (ECC repo) | no |  |
| `competitive-report-structure` | Competitor report layout | No: business or domain work, not Mako; business work belongs in a private repo | SKIP | MIT (ECC repo) | no |  |
| `connections-optimizer` | Prunes and grows X and LinkedIn networks | No: business or domain work, not Mako; business work belongs in a private repo | SKIP | MIT (ECC repo) | credentials |  |
| `content-engine` | Social and video content systems | No: business or domain work, not Mako; business work belongs in a private repo | SKIP | MIT (ECC repo) | no |  |
| `counterparty-channel-discipline` | Agents in shared channels with outside parties | No: business or domain work, not Mako; business work belongs in a private repo | SKIP | MIT (ECC repo) | client data |  |
| `crosspost` | Posts across X, LinkedIn, Threads, Bluesky | No: business or domain work, not Mako; business work belongs in a private repo | SKIP | MIT (ECC repo) | credentials |  |
| `customer-billing-ops` | Customer billing through Stripe and similar | No: business or domain work, not Mako; business work belongs in a private repo | SKIP | MIT (ECC repo) | payments, client data |  |
| `customs-trade-compliance` | Customs and tariff classification | No: business or domain work, not Mako; business work belongs in a private repo | SKIP | Apache-2.0 (skill's own header) | no |  |
| `defi-amm-security` | Solidity AMM security | No: business or domain work, not Mako; business work belongs in a private repo | SKIP | MIT (ECC repo); origin: ECC direct-port adaptation | no |  |
| `email-ops` | Mailbox triage and sending | No: business or domain work, not Mako; business work belongs in a private repo | SKIP | MIT (ECC repo) | credentials, client data |  |
| `energy-procurement` | Electricity and gas procurement | No: business or domain work, not Mako; business work belongs in a private repo | SKIP | Apache-2.0 (skill's own header) | no |  |
| `esign-field-placement` | Places e-signature fields through browser automation | No: business or domain work, not Mako; business work belongs in a private repo | SKIP | MIT (ECC repo) | client data |  |
| `evm-token-decimals` | EVM token decimals | No: business or domain work, not Mako; business work belongs in a private repo | SKIP | MIT (ECC repo); origin: ECC direct-port adaptation | no |  |
| `finance-billing-ops` | Revenue, pricing and refund checks | No: business or domain work, not Mako; business work belongs in a private repo | SKIP | MIT (ECC repo) | payments |  |
| `google-workspace-ops` | Google Drive, Docs and Sheets work | No: business or domain work, not Mako; business work belongs in a private repo | SKIP | MIT (ECC repo) | credentials, client data |  |
| `healthcare-cdss-patterns` | Clinical decision support | No: business or domain work, not Mako; business work belongs in a private repo | SKIP | MIT (ECC repo); origin: Health1 Super Speciality Hospitals — contributed by Dr. Keyur Patel | client data |  |
| `healthcare-emr-patterns` | EMR/EHR apps | No: business or domain work, not Mako; business work belongs in a private repo | SKIP | MIT (ECC repo); origin: Health1 Super Speciality Hospitals — contributed by Dr. Keyur Patel | client data |  |
| `healthcare-eval-harness` | Patient-safety test harness | No: business or domain work, not Mako; business work belongs in a private repo | SKIP | MIT (ECC repo); origin: Health1 Super Speciality Hospitals — contributed by Dr. Keyur Patel | client data |  |
| `healthcare-phi-compliance` | PHI compliance | No: business or domain work, not Mako; business work belongs in a private repo | SKIP | MIT (ECC repo); origin: Health1 Super Speciality Hospitals — contributed by Dr. Keyur Patel | client data |  |
| `hipaa-compliance` | HIPAA entry point | No: business or domain work, not Mako; business work belongs in a private repo | SKIP | MIT (ECC repo); origin: ECC direct-port adaptation | client data |  |
| `inventory-demand-planning` | Retail demand planning | No: business or domain work, not Mako; business work belongs in a private repo | SKIP | Apache-2.0 (skill's own header) | no |  |
| `investor-materials` | Pitch decks and investor memos | No: business or domain work, not Mako; business work belongs in a private repo | SKIP | MIT (ECC repo) | no |  |
| `investor-outreach` | Investor emails | No: business or domain work, not Mako; business work belongs in a private repo | SKIP | MIT (ECC repo) | no |  |
| `ito-baskets` | Itô basket market data | No: business or domain work, not Mako; business work belongs in a private repo | SKIP | MIT (ECC repo) | no |  |
| `ito-compute` | Rents GPUs through Itô | No: business or domain work, not Mako; business work belongs in a private repo | SKIP | MIT (ECC repo) | payments, credentials |  |
| `ito-inference` | Model serving on Itô compute (names Kimi) | No: business or domain work, not Mako; business work belongs in a private repo | SKIP | MIT (ECC repo) | payments |  |
| `ito-training` | Training on Itô compute | No: business or domain work, not Mako; business work belongs in a private repo | SKIP | MIT (ECC repo) | payments |  |
| `lead-intelligence` | Lead scoring and outreach | No: business or domain work, not Mako; business work belongs in a private repo | SKIP | MIT (ECC repo) | client data |  |
| `llm-trading-agent-security` | Trading-agent security | No: business or domain work, not Mako; business work belongs in a private repo | SKIP | MIT (ECC repo); origin: ECC direct-port adaptation | payments, credentials |  |
| `logistics-exception-management` | Freight exceptions and claims | No: business or domain work, not Mako; business work belongs in a private repo | SKIP | Apache-2.0 (skill's own header) | no |  |
| `mailtrap-email-integration` | Transactional email through Mailtrap | No: business or domain work, not Mako; business work belongs in a private repo | SKIP | MIT (ECC repo) | credentials |  |
| `market-research` | Market and competitor research | No: business or domain work, not Mako; business work belongs in a private repo | SKIP | MIT (ECC repo) | no |  |
| `marketing-campaign` | Marketing campaign planning | No: business or domain work, not Mako; business work belongs in a private repo | SKIP | MIT (ECC repo) | no |  |
| `master-agreement-generator` | Drafts master agreements from a template | No: business or domain work, not Mako; business work belongs in a private repo | SKIP | MIT (ECC repo) | client data |  |
| `messages-ops` | Reads texts and DMs, including one-time codes | No: business or domain work, not Mako; business work belongs in a private repo | SKIP | MIT (ECC repo) | credentials, client data |  |
| `nodejs-keccak256` | Ethereum hashing in JS | No: business or domain work, not Mako; business work belongs in a private repo | SKIP | MIT (ECC repo); origin: ECC direct-port adaptation | no |  |
| `prediction-market-oracle-research` | Prediction markets as data | No: business or domain work, not Mako; business work belongs in a private repo | SKIP | MIT (ECC repo) | no |  |
| `prediction-market-risk-review` | Prediction-market risk review | No: business or domain work, not Mako; business work belongs in a private repo | SKIP | MIT (ECC repo) | payments |  |
| `production-scheduling` | Manufacturing scheduling | No: business or domain work, not Mako; business work belongs in a private repo | SKIP | Apache-2.0 (skill's own header) | no |  |
| `quality-nonconformance` | Manufacturing quality and CAPA | No: business or domain work, not Mako; business work belongs in a private repo | SKIP | Apache-2.0 (skill's own header) | no |  |
| `returns-reverse-logistics` | Returns processing | No: business or domain work, not Mako; business work belongs in a private repo | SKIP | Apache-2.0 (skill's own header) | no |  |
| `seo` | SEO audits | No: business or domain work, not Mako; business work belongs in a private repo | SKIP | MIT (ECC repo) | no |  |
| `social-graph-ranker` | Ranks warm-intro paths | No: business or domain work, not Mako; business work belongs in a private repo | SKIP | MIT (ECC repo) | client data |  |
| `social-publisher` | Schedules posts on 13 platforms through SocialClaw | No: business or domain work, not Mako; business work belongs in a private repo | SKIP | MIT (ECC repo); origin: community | credentials |  |
| `x-api` | X/Twitter API | No: business or domain work, not Mako; business work belongs in a private repo | SKIP | MIT (ECC repo) | credentials |  |

#### Taken by another row (1)

| Skill | What it does | Fits Mako 1.2? Why | Proposed | Licence | Sensitive | Blue's verdict |
|---|---|---|---|---|---|---|
| `gateguard` | Edit gate that denies the first edit until the agent states facts | Taken by S44 (GateGuard trial on H1 builder panes); not re-judged here | (S44) | MIT (ECC repo); origin: community | .claude/ hooks |  |

## Blue's words

- "Yes, 3 PRs" (2026-11-12): the ECC agents are adopted in 3 PRs.
- "Yes, fold it" (2026-11-12): code-reviewer is folded into pr-reviewer (ECC PR 2).
- "Yes, take it" (2026-11-15): he took an independent review's split, which adopts these four
  reviewers now (plus planner in ECC PR 2).

Blue's verdict on this record is his merge of the PR that adds it.
