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

- **Licence: CC-BY-SA-4.0** (share-alike). From the desktop session's hand-off; not verified here,
  and S69 confirms it at the pin. Mako is MIT, so share-alike text can't be copied into it.
- **Repository and pin:** not relayed. S69 records the repository, the commit it read and each
  `SKILL.md`'s sha256.
- **China-origin rule:** Trail of Bits is a US company (builder's reading). S69 searches the five
  skills' files for China-origin model names at the pin, as S45 did for ECC.
- **Pin-and-scan:** not run (nothing is installed). S69 reads the files as data in a scratch folder
  and runs SkillSpector `--no-llm` on them before reading them in full.

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
- This record gains a table: each new check, and the skill idea it came from (attribution, not
  text).
- A before-and-after run on a fixed set of past PR diffs (docs/HARNESS-CHANGES.md) shows the
  reviewer still finds what it found before.
