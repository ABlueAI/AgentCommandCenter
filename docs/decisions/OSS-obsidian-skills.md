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
  inside the repository and never overwrites an existing index, `AGENTS.md` or `CLAUDE.md` (which
  imports `AGENTS.md`, so Claude Code loads the vault's rules).
- The index links to the shared brain on GitHub instead of copying it, so nothing private flows
  into the repository and nothing in the vault goes stale.
- The plugin is installed in Claude Code from the vault folder (BLUE-CHECKLIST.md step 31), so it
  is used where vault work happens.
- Not covered: cloud sessions can't reach a folder on Blue's PC, so only local agents read and
  update the vault. A private GitHub repository for the vault would change that; it isn't part of
  S13.

## Update: version 1.2.3 and the new source (2026-11-25)

Blue, word for word (2026-11-25, in a desktop research session; quoted as that session's hand-off
relayed it): "Update Obsidian Skills to 1.2.3".

- **Version:** 1.2.3.
- **Source:** the project moved from `kepano/obsidian-skills` to `obsidianmd/obsidian-skills`
  (from the hand-off; S68 confirmed it, below). The install path above
  (`/plugin marketplace add kepano/obsidian-skills`) becomes the new source's once S68 confirms it.
- **The ADOPT verdict stands;** only the version and source change (docs/DECISIONS.md,
  2026-11-25).
- **Before it is installed:** S68 (docs/PLAN-1.1.md) runs the pin-and-scan step on 1.2.3: tag,
  commit, licence (still MIT?), the China-origin check, a static SkillSpector run (`--no-llm`), and
  a read of every file the plugin ships. It records the result here. If anything fails, nothing is
  installed from the new source (an existing install stays) and Blue is told. Blue then installs
  or re-installs the plugin in his vault from the new source at the new pin (checklist step 31,
  which S68 updates, or a new step it adds).

## Pin-and-scan of 1.2.3 (S68, 2026-11-26)

Run by the all-day runner's cloud session building S68 (PR #300). Files read as data in a scratch
folder; nothing from them was run or installed.

- **Source move, confirmed** (verified 2026-11-26): `git ls-remote` on
  `https://github.com/kepano/obsidian-skills` and on `https://github.com/obsidianmd/obsidian-skills`
  returns the same refs, byte for byte (GitHub serves a moved repository's old address from the new
  one). The project's own history says the same: commit `3fce00b`, "Plugin: Point repository and
  install commands at obsidianmd/obsidian-skills", and at 1.2.3 its `README.md`, both marketplace
  files and `plugin.json` name `obsidianmd/obsidian-skills`, with "Obsidian" (obsidian.md) as the
  owner. The README also lists it as an official plugin in Claude's plugin directory.
- **Pin** (verified, same calls and a clone checked out at the tag): tag `1.2.3`, commit
  `a53f5910cd68e7bad88ea52f2f4eb95b9aa40800` (a lightweight tag on a commit). The S13 record pinned
  no commit, so there is no old commit to compare against.
- **Licence:** still MIT (`LICENSE` and `plugins/obsidian/LICENSE` at the tag, "Copyright (c) 2026
  Steph Ango (@kepano)"; `plugin.json` says `"license": "MIT"`).
- **What it ships:** the Claude Code plugin is `plugins/obsidian` (the marketplace's
  `"source": "./plugins/obsidian"`): 20 files, 7 skills. Five are the ones S13 listed
  (`obsidian-markdown`, `obsidian-bases`, `json-canvas`, `obsidian-cli`, `defuddle`); two are new,
  `obsidian-headless` (Obsidian Sync and Publish from the command line, which needs a paid Obsidian
  subscription and the user's own login) and `knap` (templates from JSON or CSV). Its README says
  "skills only, with no MCP server, hooks, or background processes", and the files agree: no
  `hooks`, no `mcpServers`, no scripts inside the plugin folder (the repository's two release
  scripts sit outside it and aren't installed). The sha256 of each shipped file is in "Shipped files at
  1.2.3" below.
- **Read as data** (all 20 files, about 2,300 lines): no hidden instructions, no request for keys
  or passwords (`obsidian-headless` says to let the user type their own password and never pass
  it on the command line), no links outside Obsidian's, the tools' own and the agent platforms'
  pages. Three skills tell the agent to *offer* an unpinned global install when a tool is missing:
  `npm install -g defuddle`, `npm install -g knap` (or `npx knap`) and
  `npm install -g obsidian-headless`. Those packages are not part of this pin; installing any of
  them is a separate pin-and-scan step, so an agent in the vault says no to that offer until it is
  done (BLUE-CHECKLIST.md step 31 says so).
- **China-origin check:** a search of every file in the repository at the tag for GLM, Qwen,
  DeepSeek, Kimi, Doubao, Moonshot, Zhipu, ERNIE, MiniMax, Hunyuan and Baichuan finds nothing. The
  plugin calls no model; it runs in whatever Claude Code session loads it.
- **SkillSpector 2.13.7, static** (`--no-llm`, no provider credentials; the scanner's pin and guard
  are in docs/decisions/OSS-ecc.md, "Scanner re-pinned"): on `plugins/obsidian`, 2 findings, both
  MEDIUM, risk score 14/100, "CAUTION":
  - RP1 "MCP Rug Pull", `skills/knap/SKILL.md` line 10: the unpinned `npx knap` above. Real, and
    handled by the "say no to the install offer" rule above.
  - P4 "Behavior Manipulation", `skills/json-canvas/SKILL.md` line 95: the text "always use a JSON
    serializer rather than" (building JSON by hand). A false positive: it is formatting advice, not
    steering.
  - **Coverage: partial**, 17 of 19 files fully inspected, 2 partly: one analyzer
    (`static_patterns_tool_misuse`) couldn't resolve an expression's boundary in
    `skills/obsidian-bases/SKILL.md` line 523 and in
    `skills/obsidian-bases/references/FUNCTIONS_REFERENCE.md` lines 68 to 173. Every other
    analyzer covered those files. The icon (`assets/icon.png`) is out of scope as binary. A manual
    read of both spans found Markdown about Bases' YAML quoting and formula functions, with no
    command, URL or instruction to the agent.
  - The report's metadata: `llm_requested: false`, empty `inference_usage`; the repeat run under
    `strace` made no network connection.

**Result: not a pass, by the scanner rule.** Nothing failed (no CRITICAL or HIGH finding, both
MEDIUM findings are explained above, the licence and source check out), but the scan was partial,
and docs/PLAN-1.1.md ("S68 to S72 details") says a partial scan "is reported to Blue and never
counted as a pass". So the install waits for Blue's word on the two partly inspected spans:
BLUE-CHECKLIST.md step 31 asks for it before the plugin bullet. Recommendation: accept, because the
two spans are reference text that a manual read cleared and every other analyzer covered them.
Until then nothing is installed from the new source.

### Shipped files at 1.2.3

sha256 of each file in `plugins/obsidian` at commit `a53f591`, so a later install can be checked
against what was scanned.

| File | sha256 |
|---|---|
| `.antigravity-plugin/plugin.json` | `6c74bb5004bd9433fd28efb3710faaa0c0e178cb4e6931cc456a470a6c63c473` |
| `.claude-plugin/plugin.json` | `387f5f6fc7a1b64df546388138cccccc18317b198a9e1df26398b1f7c51b3674` |
| `.cursor-plugin/plugin.json` | `2460fa752b0fe73e13d86c5e9b3316a0de1dad8450c948309a12b10f808cbb71` |
| `LICENSE` | `64c64d48361edfe8610016441bf593256ea9b67f133b00f47c55aa29ee878567` |
| `README.md` | `86c87593705baa7247eafd23898a2acb02610813451d1fd5dd88002fdbdda1c4` |
| `assets/icon.png` | `3740a42d19b2b757048621683472c5e47e162d4f449241944faeb37ae7551a2e` |
| `gemini-extension.json` | `458e99422a8adcbbfa30f48955a9df5bf22143171d643796f0a42e0b887081e3` |
| `plugin.json` | `4375beaac1cfb858290b189dd77a94b58d231284f4eb3f23562202ef6bb88920` |
| `skills/defuddle/SKILL.md` | `03f6b519e691cc79290369f05305c1608c0d9f2cfd82e1a8ca430d339b9f862f` |
| `skills/json-canvas/SKILL.md` | `4db4e69eea910b598c249e41bcdda85a70856348adaf11c35371198e258d50a6` |
| `skills/json-canvas/references/EXAMPLES.md` | `f5ce15a4b74643122396265e8c37c828874a4005794de2aee7030662968768eb` |
| `skills/knap/SKILL.md` | `252d2146d9acc76e1b184bd75e4212a3eae3a8b2a77ad8c578b1d8d6a813e22a` |
| `skills/obsidian-bases/SKILL.md` | `7a1659e2c00e7b74c8767002213dd977967ddd30dd15a7f33b693e783a4546e9` |
| `skills/obsidian-bases/references/FUNCTIONS_REFERENCE.md` | `208fd63aead9bca1975626fea52605e6ab9434dc0529d923feb36b18b8877d3b` |
| `skills/obsidian-cli/SKILL.md` | `28f66289b1cf1d245807766d4dafb6f5f76eadc986fe4a7f224da51f50aa7524` |
| `skills/obsidian-headless/SKILL.md` | `8359512f18a6891436941774059cca390e9ed0b4bc754cd00826fd2d9c47f5c7` |
| `skills/obsidian-markdown/SKILL.md` | `f1c4ff5257d3f9743af797d755cabeef129f553704d5ff67ebf1239f9569f081` |
| `skills/obsidian-markdown/references/CALLOUTS.md` | `9912ec2e3f8711f65b8ceb82cc19cbffc5e6f8ccf2ab627e18926c522c383d8b` |
| `skills/obsidian-markdown/references/EMBEDS.md` | `63b6205507e28fb58cf200bc348a2b139e50ae739743e2e6316732148973cb7a` |
| `skills/obsidian-markdown/references/PROPERTIES.md` | `f2d01b096a1c981a675e86b6a8c46bab271b278497646d465467b8120043b87c` |
