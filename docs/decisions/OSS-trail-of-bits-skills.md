# OSS record: Trail of Bits' security skills (S69)

Written 2026-11-26 by a Claude cloud session (agent account), recording Blue's verdict of
2026-11-25 from a desktop research session that surveyed recent open-source agents. Nothing was
installed, run or copied into Mako. Certainty labels are AGENTS.md's.

## Need

`.claude/agents/security-reviewer.md` (S39) reviews every PR that touches a sensitive area. Blue
wants it stronger on the kinds of mistake Trail of Bits' skills look for.

## Option

**Trail of Bits' public security skills** for Claude Code. Five of them are the ones Blue named:

| Skill | What it looks for (builder's reading from its name and the hand-off; S69 reads each at the pin) |
|---|---|
| `insecure-defaults` | settings and code paths that are unsafe unless someone changes them |
| `supply-chain-risk-auditor` | risky dependencies, unpinned sources and install-time scripts |
| `agentic-actions-auditor` | what an agent can be made to do from text it reads (tools, hooks, CI actions) |
| `fp-check` | whether a finding is a false positive before it is reported |
| `sharp-edges` | APIs and options that are easy to misuse |

- **Licence: CC-BY-SA-4.0** (share-alike). Verified 2026-11-26 by S69: the repository's `LICENSE`
  at the pin is "Attribution-ShareAlike 4.0 International" (sha256
  `7abe19ec9bb73b36141b999b861d24ad855e808bafe0f81e84cce28556f6c297`); the five `plugin.json` files
  name no licence of their own. Mako is MIT, so share-alike text can't be copied into it.
- **Repository and pin:** `trailofbits/skills` (github.com/trailofbits/skills), commit
  `149d7b21f4067765b82e67029730b42d228ef4b4` (2026-11-12; the repository's HEAD when S69 read it,
  2026-11-26, and no tag points at it). Verified by `git ls-remote` and a checkout at that commit.
  Plugin versions at the pin and the sha256 of the file each check was read from:

  | Skill (plugin version) | File read | sha256 |
  |---|---|---|
  | `insecure-defaults` (2.0.3; it has no `SKILL.md`) | `plugins/insecure-defaults/README.md` | `999d8d5fcb7153eedd3d31a0826f4f72183a427836f585a357a4cdf1f1ce254f` |
  | `sharp-edges` (1.1.3) | `plugins/sharp-edges/skills/sharp-edges/SKILL.md` | `3b69a709c2f8f0cfcf57d40a3186e166f307865cc8ed924be4098e549a121e9c` |
  | `agentic-actions-auditor` (1.3.2) | `plugins/agentic-actions-auditor/skills/agentic-actions-auditor/SKILL.md` | `b2bdb88d559bc37e6c2c8314e28e7a2eb47e7cdd9da51e77da347d3517326dc0` |
  | `supply-chain-risk-auditor` (2.0.4) | `plugins/supply-chain-risk-auditor/skills/supply-chain-risk-auditor/SKILL.md` | `a1254b7f8d3a1731a9a7e1f9cd6c67b59cf84ed6ef7c7fb455db9a14c528ceb4` |
  | `fp-check` (1.0.5) | `plugins/fp-check/skills/fp-check/SKILL.md` | `129223b79b8cb1e7c289c90cbe4ba288d9b210e318a0d1464f319e30329481b3` |

- **China-origin rule:** passed (verified 2026-11-26): a search of every file in the five plugins
  for GLM, Qwen, DeepSeek, Kimi, Doubao, Moonshot, Zhipu, Baichuan and MiniMax found nothing.
  Trail of Bits is a US company (builder's reading). Nothing from the skills runs in Mako anyway.
- **Pin-and-scan:** SkillSpector 2.12.0 (the pin on `main`, commit `c7958a3`), installed into a
  throwaway Python 3.12 virtual environment and run `--no-llm` on each plugin folder, with no
  provider credentials in its environment. Every report records `llm_requested: false` and an
  empty `inference_usage`. **Not a pass** (S68's scanner guard): four of the five scans were partial,
  and the scanner flagged many lines. Summary, verified from the JSON reports:

  | Plugin | Risk score, recommendation | Coverage | What it flagged |
  |---|---|---|---|
  | `insecure-defaults` | 50, CAUTION | partial, 85% (3 JavaScript files hit the parse limit) | 4 findings: words such as "Debug mode enabled" and "world-writable" in its own catalogue of bad settings |
  | `sharp-edges` | 100, DO_NOT_INSTALL | partial, 91% (2 files hit the parse limit) | 51 findings: the attack examples it teaches (`rm -rf /`, `/etc/passwd`, `shell=True`, a PHP `/e` regex) |
  | `agentic-actions-auditor` | 93, DO_NOT_INSTALL | partial, 82% | 10 findings: example payloads in its attack-vector notes, and "disable safety" read as hidden instructions |
  | `supply-chain-risk-auditor` | 100, DO_NOT_INSTALL | partial, 75% (lockfiles and fixtures errored) | 30 findings: deliberately old packages in its test fixtures, its own calls to osv.dev, npm, deps.dev, GitHub and Scorecard, and one `gh auth token` call |
  | `fp-check` | 22, CAUTION | complete | 5 findings: its bundled `Stop` and `SubagentStop` prompt hooks, and phrases like "without checking" |

  Builder's reading: these are the skills' subject matter (they teach attacks and bad settings)
  and the scripts and hooks Mako doesn't take, not instructions aimed at a reader. Mako installs
  and runs none of it: no file, script, hook or agent from the repository is in this PR, and the
  files were read as data in a scratch folder outside the repository. Blue decides whether that is
  enough (the PR's TLDR asks). The flagged lines checked by hand: `sharp-edges/SKILL.md:27` and
  `agentic-actions-auditor/README.md:3` are ordinary prose about the skills' own agents.

## Options considered

ECC's `agent-security-hardening` skill covered part of the same ground; Blue said no to it on
2026-11-25 because Trail of Bits' skills cover it (docs/decisions/OSS-ecc.md, step 82).

## Verdict

**PATTERN-MINE** the five skills into `security-reviewer`. Blue, word for word (2026-11-25, as the
desktop session's hand-off relayed it): "Yes: borrow ideas from Trail of Bits' security skills.
Five of them (insecure-defaults, supply-chain-risk-auditor, agentic-actions-auditor, fp-check,
sharp-edges) would strengthen security-reviewer".

## How Mako uses it

- S69 (docs/PLAN-1.1.md) writes each idea as a check in `security-reviewer.md`, in its own words.
  No sentence, list or example is copied from the skills; the PR says how it checked that.
- Which idea each check came from (attribution, not text; S69, 2026-11-26). The checks are in
  `.claude/agents/security-reviewer.md`, "Five deeper checks (S69)":

  | Check in security-reviewer | Skill | The idea taken (in Mako's words) |
  |---|---|---|
  | A. What happens when a value is missing | `insecure-defaults` | a setting read with a fallback is only safe if the fallback refuses; separate fallbacks that need a missing setting from values unsafe as written |
  | B. How easy it is to use wrongly | `sharp-edges` | probe edge values and swappable arguments, and judge an API by its easiest use, not its documentation |
  | C. Agents steered by text they read | `agentic-actions-auditor` | trace outside text into an agent's prompt by indirect routes, then weigh what the agent can do with it |
  | D. Dependencies and other outside code | `supply-chain-risk-auditor` | pins, install scripts and the real source; never state registry facts from memory; an unrun check is neither a finding nor a pass |
  | E. Test each finding before you report it | `fp-check` | restate the claim, find the guard, separate the main control from a second layer, and argue against the finding before keeping it |

- **How S69 checked that no text was copied** (verified 2026-11-26): the new section was split into
  every run of 5 and of 6 consecutive words (lower-cased, punctuation dropped) and compared with every
  Markdown, JSON, JavaScript, Python, YAML and TOML file under `plugins/` at the pin, all 47
  plugins, not only the five. Result: 0 shared 6-word runs and 0 shared 5-word runs (one shared
  5-word run, a quoted piece of workflow syntax, was reworded before the final count).
- A before-and-after run on a fixed set of past PR diffs (docs/HARNESS-CHANGES.md) shows the
  reviewer still finds what it found before.
