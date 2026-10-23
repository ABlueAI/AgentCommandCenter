# OSS record: Obsidian Skills (S13)

Written 2026-10-23 by a scheduled Claude runner session (S13, PR #115), in the AGENTS.md OSS shape.

## Need

Agents (Claude Code on Blue's PC) read and update a private Obsidian vault whose index links to the
project's shared brain (STATUS, PLAN, DECISIONS, the checklist), and write notes in Obsidian's own
formats without breaking them.

## Option

**kepano/obsidian-skills** (Steph Ango, Obsidian's CEO). Agent Skills for Obsidian Flavored
Markdown (`obsidian-markdown`), Bases (`obsidian-bases`), JSON Canvas (`json-canvas`), the Obsidian
CLI (`obsidian-cli`) and `defuddle`, installed as one Claude Code plugin. MIT licence.

From search-result extracts on 2026-10-23, not the repository itself (this session reads only
Blue's repository): the skill list, the MIT licence and the install path
(`/plugin marketplace add kepano/obsidian-skills`). Star counts in third-party listings disagree
and aren't recorded here.

Blue named this project, so adopting it is the default (AGENTS.md "Engineering rules"). No other
option was searched for.

## Verdict

**ADOPT.** Blue's verdict, word for word (docs/DECISIONS.md, "Adopt Obsidian Skills
(kepano/obsidian-skills) in 1.1."): "yes i would like to use Obsidian Skills moving past 1.0 into
1.1."

## How Mako uses it

- The vault is a plain folder on Blue's PC, outside this public repository, created by
  `scripts/new-mako-vault.ps1` (default `D:\Workspace\Mako-Vault`). The script refuses any folder
  inside the repository and never overwrites an existing index or `AGENTS.md`.
- The index links to the shared brain on GitHub instead of copying it, so nothing private flows
  into the repository and nothing in the vault goes stale.
- The plugin is installed in Claude Code from the vault folder (BLUE-CHECKLIST.md step 31), so it
  is used where vault work happens.
- Not covered: cloud sessions can't reach a folder on Blue's PC, so only local agents read and
  update the vault. A private GitHub repository for the vault would change that; it isn't part of
  S13.
