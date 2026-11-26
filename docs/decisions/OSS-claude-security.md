# OSS record: Anthropic's claude-security plugin (S70)

Written 2026-11-26 by a Claude cloud session (agent account), recording Blue's verdict of
2026-11-25 from a desktop research session that surveyed recent open-source agents. Nothing was
installed or run. Certainty labels are AGENTS.md's.

## Need

One whole-project security scan of Mako by a dedicated tool, alongside the read-only checks of S38
(done) and S65 (before the release).

## Option

**claude-security**, a Claude Code plugin from Anthropic.

- **Licence: proprietary (Anthropic).** Not open source, so nothing from it is copied into Mako; it
  is used as a tool only. From the hand-off; not verified here.
- **Pin: v0.13.1, pinned 2026-11-25** by the desktop session (from the hand-off). S70 records the
  plugin marketplace's commit when it installs it.
- **China-origin rule:** Anthropic is a US company and the plugin runs Claude (builder's reading).
  S70 reads the plugin's files before running it and checks that it calls no other model.
- **Cost:** it runs inside a Claude Code session on Blue's own plan (Max 5x). If it needs API
  credits, a key or a paid service, S70 stops and asks Blue (AGENTS.md: no API credits, ever; new
  spending stops for Blue). Not verified.
- **Pin-and-scan:** not run yet. S70's setup checklist (docs/PLAN-1.1.md, "S68 to S72 details",
  item 3) reads the plugin's hooks and scripts and scans them with SkillSpector `--no-llm` before
  it runs.

## Verdict

**PROTOTYPE: one trial run** on all of Mako, in a cloud session. Blue, word for word (2026-11-25,
as the desktop session's hand-off relayed it):

- "Yes, as one trial: run Anthropic's claude-security plugin once on all of Mako, in a cloud
  session."
- "an afternoon is fin ... use the best model for the task between opus and sonnet ... its
  necessary, nothing more to say"
- "ensure the process we choose to do this security scan is properly setup when the time comes"

## How Mako uses it

- S70 runs it once, by the 11-step setup checklist in docs/PLAN-1.1.md, "S68 to S72 details".
  Blue starts that cloud session (BLUE-CHECKLIST.md step 85).
- Security findings stay private (hard rule 6): the report and the SARIF output go to Blue in the
  session, for his private vault, and never into this repository, an issue or a PR. Public text
  gives each finding's title and severity only. A CRITICAL finding is told to Blue at once.
- After the run, this record gains: the plugin version and marketplace commit, usage and wall
  time before and after, and whether the plugin was uninstalled or left pinned and disabled. Any
  further use needs a new verdict from Blue.
