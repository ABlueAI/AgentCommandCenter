# OSS record for vault memory (S48)

Research dated 2026-11-18. **Verdicts (Blue, 2026-11-24):** PROTOTYPE a narrow Open Second Brain
trial, PATTERN-MINE ai-memory and GBrain, as proposed. Keep the existing plan's Markdown-first scope
and use fresh, small local glue where a vetted upstream piece does not fit. His words are in
[Blue's verdict](#blues-verdict-word-for-word).

## Need

After the H1 setup day (checklist step 54), S48 needs one Markdown note per finished task, read
access for a cloud agent, and a nightly tidy that runs as a local H1 scheduled task for three
unattended nights. Meaning-based search waits for actual misses reported by the nightly note. Vault
notes, their indexes, and their contents stay private. S13's vault is local. Checklist step 56
sets up the sync to the private repository. Verifying cloud-agent read access through that path is
part of S48's done-when. [S48](../PLAN-1.1.md#month-one), [H1 and memory setup](../../BLUE-CHECKLIST.md), [S13
record](OSS-obsidian-skills.md), [main's decision log](../DECISIONS.md#2026-11-18).

The 2026-11-18 research evaluates Open Second Brain, ai-memory and GBrain. Who picked the shortlist,
when they picked it, and whether any candidate fell under Blue's 2026-11-16 sign-off dropping
"the memory tools not chosen" remain unconfirmed. That sign-off still applies. S48 takes this as
its OSS record once Blue gives his verdict, per the 2026-11-21 entry, item 21, on `main` (PR #212).
[2026-11-16 sign-off](../DECISIONS.md#2026-11-16-the-mako-11-decision-sheet), [2026-11-21 decision on
main](https://github.com/ABlueAI/AgentCommandCenter/blob/main/docs/DECISIONS.md#2026-11-21-blues-decisions-of-2026-11-16-to-2026-11-21).

## Sources and maintenance

Pins are the latest non-prerelease GitHub releases observed on 2026-11-18. GBrain also had a newer
[v0.60.740.0 prerelease](https://github.com/garrytan/gbrain/releases/tag/v0.60.740.0) on Nov 18. The
observed GBrain `stable` tag peeled to the same commit as this pin, and `latest-stable` pointed to
the newer prerelease. Use the commit pin for reproduction because those channel tags move. Activity
counts all reachable commits dated October 19 through November 18 in Blue's time zone, including
merges and bots. The observed tips have commit dates of Nov 17 for Open Second Brain and Nov 18 for
ai-memory and GBrain in the same time zone. Contributor counts are distinct Git author names from
`git shortlog -ns` on the observed default-branch head. Aliases and automation make these counts
imperfect. Bus factor is a maintenance inference from concentration, not a count of people with
release access. [GBrain distribution
channels](https://github.com/garrytan/gbrain/blob/5c48d799803d815b6fca730fd8e8f12324abb8f2/README.md),
[stable promotion tag](https://github.com/garrytan/gbrain/tree/stable-v0.60.739.0).

| Project | Pinned version and licence | Maintenance and bus factor |
|---|---|---|
| itechmeat/open-second-brain | [v1.98.0](https://github.com/itechmeat/open-second-brain/releases/tag/v1.98.0), released Nov 3. [`d21cdb75f27799c9d7666054070213c782049d6f`](https://github.com/itechmeat/open-second-brain/tree/d21cdb75f27799c9d7666054070213c782049d6f/). [MIT](https://github.com/itechmeat/open-second-brain/blob/d21cdb75f27799c9d7666054070213c782049d6f/LICENSE). | 37 recent commits and 19 author names over 285 commits. Serg Eroshe authored 24 of the recent 37, and Sol Aitken has 176 historically. Two names dominate different periods. Recent maintenance may depend on one person. [Observed main](https://github.com/itechmeat/open-second-brain/commits/5e0aba2889ea23411fb742159212d93c18a2f2f0/). |
| akitaonrails/ai-memory | [v3.5.0](https://github.com/akitaonrails/ai-memory/releases/tag/v3.5.0), released Nov 17 local time (Nov 18 UTC). [`bc7faa7d847dd387e634ba8420d115b9dd4ecebe`](https://github.com/akitaonrails/ai-memory/tree/bc7faa7d847dd387e634ba8420d115b9dd4ecebe/). [MIT](https://github.com/akitaonrails/ai-memory/blob/bc7faa7d847dd387e634ba8420d115b9dd4ecebe/LICENSE). | 2,589 recent commits and 232 author names over 6,660 commits. AkitaOnRails and Fabio Akita account for 1,349 of those recent commits together. João Matheus, Samir Hanna Verza and Vinícius DS Andrade each authored at least 180. There is meaningful contributor depth alongside a heavily concentrated lead. Release succession is unverified. [Observed main](https://github.com/akitaonrails/ai-memory/commits/411d90d1ede070d874b1d5039b0ba0a08764eb49/). |
| garrytan/gbrain | [v0.60.739.0](https://github.com/garrytan/gbrain/releases/tag/v0.60.739.0), released Nov 18. [`5c48d799803d815b6fca730fd8e8f12324abb8f2`](https://github.com/garrytan/gbrain/tree/5c48d799803d815b6fca730fd8e8f12324abb8f2/). [MIT](https://github.com/garrytan/gbrain/blob/5c48d799803d815b6fca730fd8e8f12324abb8f2/LICENSE). | 7,258 recent commits and 146 author names over 16,134 commits. The `garrytan` and Garry Tan names account for 6,771 recent commits, and `capy-ai[bot]` for 460. Maintenance is active and very concentrated, suggesting a bus factor close to one. [Observed master](https://github.com/garrytan/gbrain/commits/e50f3919b7f34d63ca20cc60b1f643ad1e7ae08a/). |

## Pin-and-scan

SkillSpector [2.12.0](https://github.com/NVIDIA/SkillSpector/releases/tag/v2.12.0) at
[`c7958a3268d9498644b22edb75d0f051bbc8cbfc`](https://github.com/NVIDIA/SkillSpector/tree/c7958a3268d9498644b22edb75d0f051bbc8cbfc)
was installed in a throwaway environment using its locked dependencies. The table lists the input
for each reported directory scan. The command was
`skillspector scan <input> --no-llm --format json --output <report>`, with no upstream baseline
enabled. The default analyzer `z-ai/glm-5.2` (Zhipu) was disabled. The static supply-chain
check can send public dependency names and versions to OSV.dev. Upstream installers, hooks, and
products were inspected as text. Static coverage is bounded and cannot establish what dependencies
or runtime paths do on H1. [Scanner flags and data
handling](https://github.com/NVIDIA/SkillSpector/blob/c7958a3268d9498644b22edb75d0f051bbc8cbfc/README.md),
[analyzer
default](https://github.com/NVIDIA/SkillSpector/blob/c7958a3268d9498644b22edb75d0f051bbc8cbfc/src/skillspector/providers/nv_build/provider.py#L52).

| Project and repository scan input | Repository scan | Targeted skill-file reports |
|---|---|---|
| Open Second Brain (pinned checkout) | 100/100, DO_NOT_INSTALL. 319 flags (172 high, 139 medium, 8 low). 4,196 components partially inspected. Artifact-integrity flags include hidden development playbook scripts. | [Open Second Brain](https://github.com/itechmeat/open-second-brain/blob/d21cdb75f27799c9d7666054070213c782049d6f/skills/open-second-brain/SKILL.md) and [Brain Memory](https://github.com/itechmeat/open-second-brain/blob/d21cdb75f27799c9d7666054070213c782049d6f/skills/brain-memory/SKILL.md) both scored 0 with zero findings. Partial coverage due to unresolved references and a manifest parse error on Brain Memory. |
| ai-memory (pinned checkout) | 100/100, DO_NOT_INSTALL. 325 flags (2 critical, 63 high, 259 medium, 1 low). 1,459 components partially inspected. | [Codex handoff](https://github.com/akitaonrails/ai-memory/blob/bc7faa7d847dd387e634ba8420d115b9dd4ecebe/plugins/codex/skills/ai-memory-handoff/SKILL.md) and [Claude Code retrieval](https://github.com/akitaonrails/ai-memory/blob/bc7faa7d847dd387e634ba8420d115b9dd4ecebe/plugins/claude-code/skills/ai-memory-retrieval/SKILL.md) both scored 0 with zero findings. Partial coverage due to unresolved references. |
| GBrain (`git archive` export of the pin) | 100/100, DO_NOT_INSTALL. 4,193 surfaced flags (3,931 high, 261 medium, 1 low). 7,332 components partially inspected and 53 uninspected out of 7,385 discovered. | [Company Brainify](https://github.com/garrytan/gbrain/blob/5c48d799803d815b6fca730fd8e8f12324abb8f2/skills/company-brainify/SKILL.md) scored 100/100 with nine high flags (AR2, MP3 and TM1) and four medium flags (PE2 and AS3), with missing references and static parse limits. The skill covers sensitive source handling, local context inspection and history rewriting, well outside S48. [Citation Graph Ingest](https://github.com/garrytan/gbrain/blob/5c48d799803d815b6fca730fd8e8f12324abb8f2/skills/citation-graph-ingest/SKILL.md) scored 0 with zero findings and unresolved references. |

All repository and targeted reports recorded `llm_requested: false` and an empty inference-usage
list. Zero findings on a single file with partial coverage gives no clearance for the package. These
are scanner flags. The two ai-memory critical flags are network paths in the same optional [Jev
reranker
example](https://github.com/akitaonrails/ai-memory/blob/bc7faa7d847dd387e634ba8420d115b9dd4ecebe/docs/examples/jev-reranker-adapter/jev_rerank_shim_choice.py#L162),
which forwards requests to configured endpoints and binds to loopback by default. The proposed reuse
excludes that example, GBrain’s company-brain skill, and Open Second Brain’s flagged development
playbooks. The repository runs returned exit code 1 and wrote reports with successful execution and
partial coverage. Each reached static analysis limits and reported zero fully inspected components.
GBrain also reached discovery limits. Its `git archive` export excluded the local Git metadata
picked up in the first checkout scan. Most GBrain flags were artifact-integrity classifications
(SC9). Scan an actual adoption subset and resolve its findings before any trial.

## 1. Open Second Brain

**Install and runtime.** Bun 1.1+ is the documented prerequisite. Claude Code fetches the
marketplace plugin and enables lifecycle hooks. Codex fetches the marketplace repository and uses
the separate CLI launcher. `install-cli` can bootstrap dependencies with `bun install
--frozen-lockfile`. The root package has no `postinstall` and its `prepare` executes Bun code that
sets the checkout's Git hooks path to `.githooks`. Bun downloads registry dependencies, including
optional `@node-rs/jieba`, `tiny-segmenter` and `sqlite-vec`. Bun itself is a separate download from
its documented installer. The Codex adapter can edit MCP and instructions, and the hook manifests
invoke the CLI on matching lifecycle events. MCP uses stdio by default. Optional Streamable HTTP
defaults to `127.0.0.1:0` (an available port), with credentials required for a non-loopback bind.
The live explorer also binds to `127.0.0.1`.
[Prerequisites](https://github.com/itechmeat/open-second-brain/blob/d21cdb75f27799c9d7666054070213c782049d6f/install/prerequisites.md),
[Claude
Code](https://github.com/itechmeat/open-second-brain/blob/d21cdb75f27799c9d7666054070213c782049d6f/install/claudecode.md),
[Codex](https://github.com/itechmeat/open-second-brain/blob/d21cdb75f27799c9d7666054070213c782049d6f/install/codex.md),
[manifest](https://github.com/itechmeat/open-second-brain/blob/d21cdb75f27799c9d7666054070213c782049d6f/package.json),
[prepare](https://github.com/itechmeat/open-second-brain/blob/d21cdb75f27799c9d7666054070213c782049d6f/scripts/prepare.ts),
[MCP](https://github.com/itechmeat/open-second-brain/blob/d21cdb75f27799c9d7666054070213c782049d6f/docs/mcp.md),
[explorer](https://github.com/itechmeat/open-second-brain/blob/d21cdb75f27799c9d7666054070213c782049d6f/src/core/brain/explorer.ts).

**Outbound and telemetry.** The basic vault and dream loop work locally. Semantic embedding and
reranking can send text to configured OpenAI-compatible endpoints or the supported ZeroEntropy
embedding service. Separately enabled decision models send bounded judgment inputs to their
configured endpoint. Optional external research fetches URLs, and optional Telegram capture polls
and replies through the Telegram API. The recall telemetry reviewed here is an opt-in local ledger
and activation access events are recorded locally by default. The reviewed default paths showed no
remote analytics sender. [Workflow and
search](https://github.com/itechmeat/open-second-brain/blob/d21cdb75f27799c9d7666054070213c782049d6f/docs/how-it-works.md),
[MCP search and
telemetry](https://github.com/itechmeat/open-second-brain/blob/d21cdb75f27799c9d7666054070213c782049d6f/docs/mcp.md),
[decision
models](https://github.com/itechmeat/open-second-brain/blob/d21cdb75f27799c9d7666054070213c782049d6f/docs/decision-models.md),
[external
fetch](https://github.com/itechmeat/open-second-brain/blob/d21cdb75f27799c9d7666054070213c782049d6f/src/core/brain/research/external-fetch.ts),
[Telegram](https://github.com/itechmeat/open-second-brain/blob/d21cdb75f27799c9d7666054070213c782049d6f/src/core/brain/capture/telegram-capture.ts).

**Data and deletion.** `Brain/` holds Markdown inbox signals, preferences, retired items, daily
logs, snapshots, and JSONL ledgers including claims under `Brain/truth/`.
`.open-second-brain/brain.sqlite` is a rebuildable vault index. Config and install receipts live
outside the notes, with MCP token hashes under the vault's hidden state directory. Target uninstall
reverses its managed wiring and preserves the vault. The operator can remove owned local files and
rebuild the index. Default config is under the user's Local AppData on Windows. `forget-source`
removes source-linked material in its documented scope and snapshots the Brain first, so snapshot,
index backup and sync copies matter for erasure. [Vault layout and
ledger](https://github.com/itechmeat/open-second-brain/blob/d21cdb75f27799c9d7666054070213c782049d6f/docs/how-it-works.md),
[MCP token
store](https://github.com/itechmeat/open-second-brain/blob/d21cdb75f27799c9d7666054070213c782049d6f/docs/mcp.md),
[uninstall](https://github.com/itechmeat/open-second-brain/blob/d21cdb75f27799c9d7666054070213c782049d6f/install.md#uninstall),
[Windows config
location](https://github.com/itechmeat/open-second-brain/blob/d21cdb75f27799c9d7666054070213c782049d6f/install/windows.md),
[forget-source](https://github.com/itechmeat/open-second-brain/blob/d21cdb75f27799c9d7666054070213c782049d6f/docs/cli-reference.md).

**Native Windows.** Upstream documents x64 Windows 10/11, Bun and `.cmd` launchers. Claude Code
plugin hooks require Git for Windows. Codex uses the native launcher and requires hook trust. The
Windows guide gives a manual Task Scheduler equivalent for POSIX cron recipes and documents lock
behavior during index swaps. The pinned workflow defines 10 Windows shards for the CLI, hooks,
SQLite and launcher behavior. End-to-end H1 use is unverified. [Windows
guide](https://github.com/itechmeat/open-second-brain/blob/d21cdb75f27799c9d7666054070213c782049d6f/install/windows.md),
[prerequisites](https://github.com/itechmeat/open-second-brain/blob/d21cdb75f27799c9d7666054070213c782049d6f/install/prerequisites.md),
[Windows
CI](https://github.com/itechmeat/open-second-brain/blob/d21cdb75f27799c9d7666054070213c782049d6f/.github/workflows/ci.yml),
[10 successful pinned
shards](https://github.com/itechmeat/open-second-brain/actions/runs/41627201313).

| Piece to take | Upstream size and S48 fit |
|---|---|
| Dream pass | [`dream.ts`](https://github.com/itechmeat/open-second-brain/blob/d21cdb75f27799c9d7666054070213c782049d6f/src/core/brain/dream.ts) (740 lines), with 6,134 lines across 16 `dream*.ts` core files including [planning](https://github.com/itechmeat/open-second-brain/blob/d21cdb75f27799c9d7666054070213c782049d6f/src/core/brain/dream-plan-topics.ts), [confidence refresh](https://github.com/itechmeat/open-second-brain/blob/d21cdb75f27799c9d7666054070213c782049d6f/src/core/brain/dream-refresh.ts) and [application](https://github.com/itechmeat/open-second-brain/blob/d21cdb75f27799c9d7666054070213c782049d6f/src/core/brain/dream-apply.ts). Three same-sign signals within the configured window can yield an unconfirmed preference at defaults. Later applications and violations refresh a 0–1 confidence score with freshness decay, and subsequent evidence can confirm or retire the preference. The [dream CLI](https://github.com/itechmeat/open-second-brain/blob/d21cdb75f27799c9d7666054070213c782049d6f/src/cli/brain/verbs/dream.ts) is 581 lines. Applying a lesson to managed agent instructions has a separate approval step. Good fit as a single deterministic nightly review of the task notes, with attributed correction counts, candidate/confirmed/retired states and a reviewable report. Treat notes as evidence and keep agent instruction writes behind approval. A second run on unchanged inputs is a no-op upstream, a useful property for retries on H1. [Workflow and confidence](https://github.com/itechmeat/open-second-brain/blob/d21cdb75f27799c9d7666054070213c782049d6f/docs/how-it-works.md#numeric-confidence_value), [v1.98.0 behavior](https://github.com/itechmeat/open-second-brain/blob/d21cdb75f27799c9d7666054070213c782049d6f/README.md). |
| Claims and corrections | [`truth/store.ts`](https://github.com/itechmeat/open-second-brain/blob/d21cdb75f27799c9d7666054070213c782049d6f/src/core/brain/truth/store.ts) (791 lines), [`stated-claims.ts`](https://github.com/itechmeat/open-second-brain/blob/d21cdb75f27799c9d7666054070213c782049d6f/src/core/brain/truth/stated-claims.ts) (256), [`claim-graph.ts`](https://github.com/itechmeat/open-second-brain/blob/d21cdb75f27799c9d7666054070213c782049d6f/src/core/brain/claim-graph.ts) (302) and [`lifecycle/correction.ts`](https://github.com/itechmeat/open-second-brain/blob/d21cdb75f27799c9d7666054070213c782049d6f/src/core/brain/lifecycle/correction.ts) (674). Borrow dated source links and explicit replacement or contest history, with a Markdown rendering of current claims. The full sharded JSONL ledger and graph are optional for S48. |
| Vault and adapters | [Claude hook manifest](https://github.com/itechmeat/open-second-brain/blob/d21cdb75f27799c9d7666054070213c782049d6f/hooks/hooks.json) (237 lines), [Codex hook manifest](https://github.com/itechmeat/open-second-brain/blob/d21cdb75f27799c9d7666054070213c782049d6f/plugins/codex/hooks/hooks.json) (263) and [Codex adapter](https://github.com/itechmeat/open-second-brain/blob/d21cdb75f27799c9d7666054070213c782049d6f/src/core/install/adapters/codex.ts) (595). Use the folder and per-agent entry-point patterns. One successful task should yield one scoped Markdown write, independent of the number of tool calls or retry events. Stdio is a candidate for a local boundary and does not establish cloud-agent access. |

## 2. ai-memory

**Install and runtime.** The native installer is a shell or PowerShell script rather than a package
lifecycle hook. PowerShell downloads an x64 release ZIP and checksum, verifies it, runs the
downloaded binary to check it works, publishes the files and can add the directory to user PATH.
Optional `setup` can start the daemon, register Windows sign-in startup and wire agent settings,
hooks, skills or instruction blocks. The server listens on `127.0.0.1:49374` by default for hooks,
MCP and web UI, with configurable non-loopback binds. The optional stdio bridge proxies to the HTTP
server. Browser OAuth flows can start a short-lived loopback callback.
[Installer](https://github.com/akitaonrails/ai-memory/blob/bc7faa7d847dd387e634ba8420d115b9dd4ecebe/install.ps1),
[install and
topology](https://github.com/akitaonrails/ai-memory/blob/bc7faa7d847dd387e634ba8420d115b9dd4ecebe/docs/install.md),
[default
bind](https://github.com/akitaonrails/ai-memory/blob/bc7faa7d847dd387e634ba8420d115b9dd4ecebe/crates/ai-memory-cli/src/config.rs).

**Outbound and telemetry.** Upstream documents no built-in analytics, crash reporting or background
update checks. The default in-process embeddings still fetch around 87 MB of SHA-256-pinned
all-MiniLM-L6-v2 assets from Hugging Face on a cold start. Select `none` to avoid the model
download. Opt-in external embeddings can send the entire indexed corpus. Optional LLM
consolidation/reranking send observations, page or query text and may use vendor services directly
or through their CLI and login. Admission webhooks send write content. Remote hooks and relays send
captured events to the configured service, OAuth talks to the issuer and explicit upgrades contact
GitHub. [Data
handling](https://github.com/akitaonrails/ai-memory/blob/bc7faa7d847dd387e634ba8420d115b9dd4ecebe/DATA_HANDLING.md),
[security](https://github.com/akitaonrails/ai-memory/blob/bc7faa7d847dd387e634ba8420d115b9dd4ecebe/SECURITY.md),
[providers](https://github.com/akitaonrails/ai-memory/blob/bc7faa7d847dd387e634ba8420d115b9dd4ecebe/docs/llm-providers.md).

**Data and deletion.** Data lives under a configurable data directory, the ai-memory folder in the
user's Local AppData by default on Windows. The git-backed `wiki/` is Markdown source of truth.
`db/memory.sqlite` holds the index, observations, session state and handoffs. There are also
sanitized managed transcript segments, spools, local model files, and logs. Assistant final-turn
capture is double opt-in. Project purge and TTL/decay are available, and deleting the data directory
deletes its local stores. Default raw-observation retention is indefinite. Erasure outside the live
store must account for wiki Git history, backups and any forwarded data. [Storage
layout](https://github.com/akitaonrails/ai-memory/blob/bc7faa7d847dd387e634ba8420d115b9dd4ecebe/docs/ARCHITECTURE.md),
[Windows data
directory](https://github.com/akitaonrails/ai-memory/blob/bc7faa7d847dd387e634ba8420d115b9dd4ecebe/docs/windows.md?plain=1#L253),
[retention and
purge](https://github.com/akitaonrails/ai-memory/blob/bc7faa7d847dd387e634ba8420d115b9dd4ecebe/DATA_HANDLING.md),
[wiki
history](https://github.com/akitaonrails/ai-memory/blob/bc7faa7d847dd387e634ba8420d115b9dd4ecebe/docs/usage.md).

**Native Windows.** Explicitly experimental upstream, with a native PowerShell installer, x64 binary
and native hooks, alongside supported WSL2. ARM uses x64 emulation. The workflow has
`windows-latest` native Rust tests and hook-bundle checks, with path filters and manual override.
The release workflow builds the x64 Windows asset. Claude marketplace hooks use Git Bash, while
native setup can install direct exe hooks. [Support
matrix](https://github.com/akitaonrails/ai-memory/blob/bc7faa7d847dd387e634ba8420d115b9dd4ecebe/README.md),
[Windows
guide](https://github.com/akitaonrails/ai-memory/blob/bc7faa7d847dd387e634ba8420d115b9dd4ecebe/docs/windows.md),
[Windows
CI](https://github.com/akitaonrails/ai-memory/blob/bc7faa7d847dd387e634ba8420d115b9dd4ecebe/.github/workflows/windows.yml),
[release
workflow](https://github.com/akitaonrails/ai-memory/blob/bc7faa7d847dd387e634ba8420d115b9dd4ecebe/.github/workflows/release.yml),
[successful pinned Windows run](https://github.com/akitaonrails/ai-memory/actions/runs/44220855287),
[v3.5.0 assets](https://github.com/akitaonrails/ai-memory/releases/tag/v3.5.0).

| Piece to take | Upstream size and S48 fit |
|---|---|
| Capture | [`hook_capture.rs`](https://github.com/akitaonrails/ai-memory/blob/bc7faa7d847dd387e634ba8420d115b9dd4ecebe/crates/ai-memory-cli/src/commands/hook_capture.rs) (3,042 lines), [`transcript_capture.rs`](https://github.com/akitaonrails/ai-memory/blob/bc7faa7d847dd387e634ba8420d115b9dd4ecebe/crates/ai-memory-cli/src/commands/transcript_capture.rs) (1,263) and [`capture_policy.rs`](https://github.com/akitaonrails/ai-memory/blob/bc7faa7d847dd387e634ba8420d115b9dd4ecebe/crates/ai-memory-hooks/src/capture_policy.rs) (9,728). Borrow normalization, scoped capture and deduplication. S48 only needs one concise, explicit outcome per finished task. Broad tool, prompt and transcript capture exceeds that need. |
| Consolidate and recall | [`consolidator.rs`](https://github.com/akitaonrails/ai-memory/blob/bc7faa7d847dd387e634ba8420d115b9dd4ecebe/crates/ai-memory-consolidate/src/consolidator.rs) (7,557 lines), [`dream.rs`](https://github.com/akitaonrails/ai-memory/blob/bc7faa7d847dd387e634ba8420d115b9dd4ecebe/crates/ai-memory-consolidate/src/dream.rs) (1,007) and [`memory_query` handler](https://github.com/akitaonrails/ai-memory/blob/bc7faa7d847dd387e634ba8420d115b9dd4ecebe/crates/ai-memory-mcp/src/server.rs#L3481) in a 29,665-line server file. Borrow observations-to-summary and newest-valid-note selection with source links. Use deterministic consolidation in the H1 nightly task and keyword recall first. Hybrid recall and the opt-in model-assisted dream exceed initial S48. [Architecture](https://github.com/akitaonrails/ai-memory/blob/bc7faa7d847dd387e634ba8420d115b9dd4ecebe/docs/ARCHITECTURE.md). |
| Handoff | [`handoff.rs`](https://github.com/akitaonrails/ai-memory/blob/bc7faa7d847dd387e634ba8420d115b9dd4ecebe/crates/ai-memory-core/src/handoff.rs) (208 lines), [`handoffs.rs`](https://github.com/akitaonrails/ai-memory/blob/bc7faa7d847dd387e634ba8420d115b9dd4ecebe/crates/ai-memory-cli/src/commands/handoffs.rs) (337), [handoff skill](https://github.com/akitaonrails/ai-memory/blob/bc7faa7d847dd387e634ba8420d115b9dd4ecebe/crates/ai-memory-core/src/routing_skills/ai-memory-handoff/SKILL.md) (59). Borrow a dated baton with scope, next action, acceptance and expiry. Claude Code and Codex can read the same private Markdown note. The daemon, transcript relay and automatic injection are optional architecture, with a larger privacy footprint. [Support matrix](https://github.com/akitaonrails/ai-memory/blob/bc7faa7d847dd387e634ba8420d115b9dd4ecebe/docs/support-matrix.md). |

## 3. GBrain

**Install and runtime.** The self-hosted route fetches source from GitHub and dependencies via Bun
1.4.4+, or downloads a compiled GitHub release binary. The root has no `postinstall` and lists
`@electric-sql/pglite` as trusted for Bun dependency lifecycle policy. The registry manifest for the
pinned 0.4.3 dependency declares no install lifecycle scripts. First command can apply schema
changes. `setup` can wire MCP, a launcher, per-turn instructions and optional capture hooks. Local
PGLite with `--no-embedding` needs no separate DB service. `gbrain serve` defaults to stdio. Current
OAuth HTTP uses `127.0.0.1:3131` by default and can explicitly bind another interface. OAuth helper
callbacks use loopback. The superseded bearer HTTP module omits a hostname in `Bun.serve` and the
current CLI does not dispatch to it. Local Unix sockets or Windows IPC can also be created by
persistence and CLI helpers, independently of MCP HTTP.
[Install](https://github.com/garrytan/gbrain/blob/5c48d799803d815b6fca730fd8e8f12324abb8f2/docs/INSTALL.md),
[manifest](https://github.com/garrytan/gbrain/blob/5c48d799803d815b6fca730fd8e8f12324abb8f2/package.json),
[dependency
lock](https://github.com/garrytan/gbrain/blob/5c48d799803d815b6fca730fd8e8f12324abb8f2/bun.lock),
[PGLite metadata](https://registry.npmjs.org/@electric-sql%2fpglite/0.4.3),
[setup](https://github.com/garrytan/gbrain/blob/5c48d799803d815b6fca730fd8e8f12324abb8f2/docs/guides/setup.md),
[serve
dispatch](https://github.com/garrytan/gbrain/blob/5c48d799803d815b6fca730fd8e8f12324abb8f2/src/commands/serve.ts),
[HTTP
bind](https://github.com/garrytan/gbrain/blob/5c48d799803d815b6fca730fd8e8f12324abb8f2/src/commands/serve-http.ts),
[legacy
transport](https://github.com/garrytan/gbrain/blob/5c48d799803d815b6fca730fd8e8f12324abb8f2/src/mcp/http-transport.ts),
[OAuth
helper](https://github.com/garrytan/gbrain/blob/5c48d799803d815b6fca730fd8e8f12324abb8f2/src/core/creds/redirect.ts),
[CLI
IPC](https://github.com/garrytan/gbrain/blob/5c48d799803d815b6fca730fd8e8f12324abb8f2/src/core/cli-socket/server.ts).

**Outbound and telemetry.** The keyless local setup supports keyword search. Configured model routes
can send chunks, search text and cited evidence to embedding, rerank and synthesis services.
Optional sync, connectors and hosted MCP contact their configured Git, content, database or hosted
services. Explicit update checks read GitHub's release ref and optional cron can schedule them.
Search telemetry rolls up into the brain database, including when that DB is remote. The reviewed
default path showed no separate analytics collector. The optional hosted service has a distinct data
boundary.
[Install](https://github.com/garrytan/gbrain/blob/5c48d799803d815b6fca730fd8e8f12324abb8f2/docs/INSTALL.md),
[memory
boundaries](https://github.com/garrytan/gbrain/blob/5c48d799803d815b6fca730fd8e8f12324abb8f2/docs/guides/memory-boundaries.md),
[search telemetry
writer](https://github.com/garrytan/gbrain/blob/5c48d799803d815b6fca730fd8e8f12324abb8f2/src/core/search/telemetry.ts),
[update
checker](https://github.com/garrytan/gbrain/blob/5c48d799803d815b6fca730fd8e8f12324abb8f2/src/commands/check-update.ts),
[update
guide](https://github.com/garrytan/gbrain/blob/5c48d799803d815b6fca730fd8e8f12324abb8f2/docs/guides/upgrades-auto-update.md).

**Data and deletion.** A Markdown source may be a vault or repository. Indexed text, chunks,
vectors, provenance, facts, links and other state live in `~/.gbrain/brain.pglite` by default or in
configured PostgreSQL. Local configuration and purge receipts live under the GBrain config
directory. Depending on the mode, Markdown is a source or a file mirror and not the only stored
copy. Owner-side page/fact purge removes live content and writes a replay tombstone. Git history,
old backups, provider-side retention, other prose that repeats a fact and disk/DB remnants can
survive. Unwiring a harness and purging data are different operations.
[Init](https://github.com/garrytan/gbrain/blob/5c48d799803d815b6fca730fd8e8f12324abb8f2/src/commands/init.ts),
[schema](https://github.com/garrytan/gbrain/blob/5c48d799803d815b6fca730fd8e8f12324abb8f2/src/schema.sql),
[memory boundaries and
purge](https://github.com/garrytan/gbrain/blob/5c48d799803d815b6fca730fd8e8f12324abb8f2/docs/guides/memory-boundaries.md#expire-versus-purge),
[setup](https://github.com/garrytan/gbrain/blob/5c48d799803d815b6fca730fd8e8f12324abb8f2/docs/guides/setup.md).

**Native Windows.** The hosted shell installer is documented for macOS and Linux and the release
workflow builds those two targets. The pin also has native Windows tests in its cross-platform Bun
job and Windows-only backup/ACL probes, so parts are supported from source. The maintenance guide
points Windows users to manual Task Scheduler setup. Native Windows end-to-end install, shared vault
and unattended upkeep together are unverified.
[Install](https://github.com/garrytan/gbrain/blob/5c48d799803d815b6fca730fd8e8f12324abb8f2/docs/INSTALL.md),
[release
workflow](https://github.com/garrytan/gbrain/blob/5c48d799803d815b6fca730fd8e8f12324abb8f2/.github/workflows/release.yml),
[test
matrix](https://github.com/garrytan/gbrain/blob/5c48d799803d815b6fca730fd8e8f12324abb8f2/.github/workflows/test.yml#L329),
[successful pinned Windows security-regression
job](https://github.com/garrytan/gbrain/actions/runs/44262515611), [Windows
probes](https://github.com/garrytan/gbrain/blob/5c48d799803d815b6fca730fd8e8f12324abb8f2/.github/workflows/native-locks.yml#L265),
[scheduler
behavior](https://github.com/garrytan/gbrain/blob/5c48d799803d815b6fca730fd8e8f12324abb8f2/docs/guides/error-codes.md?plain=1#L4951).

| Piece to take | Upstream size and S48 fit |
|---|---|
| facts.md and decisions.md | [README recipe](https://github.com/garrytan/gbrain/blob/5c48d799803d815b6fca730fd8e8f12324abb8f2/README.md#add-your-notes-and-your-companys-docs) (section at lines 83–96) and the two [sample decision notes](https://github.com/garrytan/gbrain/tree/5c48d799803d815b6fca730fd8e8f12324abb8f2/src/core/company-brain/sample/decisions/) (34 lines total). These are conventions, alongside a structured fact store in [the schema](https://github.com/garrytan/gbrain/blob/5c48d799803d815b6fca730fd8e8f12324abb8f2/src/schema.sql). Borrow dated, attributed facts and decision notes with original evidence links inside the vault. S48 can keep one note per task and link to it from these rollups. |
| Source tiers | [`trust/tier.ts`](https://github.com/garrytan/gbrain/blob/5c48d799803d815b6fca730fd8e8f12324abb8f2/src/core/trust/tier.ts) (200 lines), [`hybrid.ts`](https://github.com/garrytan/gbrain/blob/5c48d799803d815b6fca730fd8e8f12324abb8f2/src/core/search/hybrid.ts) (1,556), and [capabilities](https://github.com/garrytan/gbrain/blob/5c48d799803d815b6fca730fd8e8f12324abb8f2/docs/guides/capabilities.md). Upstream exposes trust tiers and separately boosts compiled truth in rank fusion. Borrow a clear precedence rule for user-confirmed decisions, task evidence and model inferences, keeping lower-authority material attributable. |
| Hybrid retrieval and cited answers | [`hybrid.ts`](https://github.com/garrytan/gbrain/blob/5c48d799803d815b6fca730fd8e8f12324abb8f2/src/core/search/hybrid.ts) (1,556 lines), [`evidence-delivery.ts`](https://github.com/garrytan/gbrain/blob/5c48d799803d815b6fca730fd8e8f12324abb8f2/src/core/search/evidence-delivery.ts) (1,759), [`think/index.ts`](https://github.com/garrytan/gbrain/blob/5c48d799803d815b6fca730fd8e8f12324abb8f2/src/core/think/index.ts) (1,439) and [`cite-render.ts`](https://github.com/garrytan/gbrain/blob/5c48d799803d815b6fca730fd8e8f12324abb8f2/src/core/think/cite-render.ts) (153). Borrow source anchors and explicit gaps for keyword answers now. Consider semantic ranking only after logged misses. Shared storage can serve several agents, but GBrain's database, ingestion and synthesis are larger than S48 needs. [Search and think](https://github.com/garrytan/gbrain/blob/5c48d799803d815b6fca730fd8e8f12324abb8f2/README.md). |

## China-origin inventory

Apply Blue's clarification to whatever Mako would run, install or call, including local models and
models reached through a gateway. PR #212 recorded the clarification on `main` in the 2026-11-21
entry, item 13, of `docs/DECISIONS.md`. The inventory covers named choices plus fixtures or comments
that could travel with copied files. An upstream-only reference in a file Mako does not ship is
not a fail (item 13). Remove such references from any code Mako
takes. All examples and tested adapters below are findings about the upstream pins. The proposed
record ships zero upstream files. [2026-11-21 clarification on
main](https://github.com/ABlueAI/AgentCommandCenter/blob/main/docs/DECISIONS.md#2026-11-21-blues-decisions-of-2026-11-16-to-2026-11-21),
[Main's underlying model rule](../DECISIONS.md#2026-11-16-the-mako-11-decision-sheet), [S39
static-scan precedent](OSS-ecc.md#pin-and-scan).

- **Open Second Brain.** The runtime embedding preset catalogue offers BAAI `bge-m3` and
  `bge-small-zh-v1.5`, and Alibaba NLP `gte-multilingual-base`. Zhipu's ZCode is an optional manual
  MCP/marketplace client and a verify-only bootstrap target. Other references include DeepSeek
  schema comments/tests, Qwen context tests (`qwen3-235b-1m`, `qwen3-32b-1m`), `kimi-k2` context
  tests, a MiniMax-shaped negative fixture, and a TencentDB agent-memory attribution. These do not
  make the dream pass call those models. Leave out the presets, target and references from any
  reused code.
  [Presets](https://github.com/itechmeat/open-second-brain/blob/d21cdb75f27799c9d7666054070213c782049d6f/src/core/search/embeddings/presets.ts),
  [BAAI model card](https://huggingface.co/BAAI/bge-m3), [Alibaba NLP model
  card](https://huggingface.co/Alibaba-NLP/gte-multilingual-base), [ZCode
  guide](https://github.com/itechmeat/open-second-brain/blob/d21cdb75f27799c9d7666054070213c782049d6f/install/zcode.md),
  [bootstrap
  targets](https://github.com/itechmeat/open-second-brain/blob/d21cdb75f27799c9d7666054070213c782049d6f/src/cli/bootstrap/targets.ts),
  [Hermes
  provider](https://github.com/itechmeat/open-second-brain/blob/d21cdb75f27799c9d7666054070213c782049d6f/plugins/hermes/provider.py),
  [context presets
  tests](https://github.com/itechmeat/open-second-brain/blob/d21cdb75f27799c9d7666054070213c782049d6f/tests/core/brain/context-presets.test.ts),
  [window
  tests](https://github.com/itechmeat/open-second-brain/blob/d21cdb75f27799c9d7666054070213c782049d6f/tests/core/brain/model-window.test.ts),
  [Tencent
  attribution](https://github.com/itechmeat/open-second-brain/blob/d21cdb75f27799c9d7666054070213c782049d6f/src/core/brain/present-time.ts).
- **ai-memory.** Optional harness integrations include Alibaba Qwen Code and Qoder, Moonshot Kimi
  Code, Zhipu ZCode, DeepSeek Harness and its two DeepSeek MCP/hook bridges, and Tencent WorkBuddy
  and CodeBuddy Code. Selecting the OpenCode provider selects Xiaomi `mimo-v2.6-flash` unless
  overridden. Other OpenCode examples/routing include `mimo-v2.5` and `mimo-v2.5-free`,
  `glm-5.3-flash`, `minimax-m3`, `minimax-m2.7`, Qwen `3.8-max`, `3.8-flash`, `3.7-max`, `3.7-plus`,
  `3.6-plus`, `3.5-plus`, and DeepSeek `deepseek-chat` and `deepseek-v4-flash`. OpenAI-compatible
  examples and fixtures also name Qwen `qwen2.5-coder:14b`, `qwen3.5-flash`, `qwen3.8-27b`,
  Qwen3-Embedding (including 0.6B), BAAI `bge-m3`, `moonshotai/kimi-k2.6`, and DeepSeek V4 Flash or
  Chat via gateways or direct API. Moonshot's API and Z.AI's coding endpoint occur in
  adapter/compatibility sources. Hook fixtures also name `deepseek-v4.1-flash`, `qwen3-coder-plus`,
  `zai/glm-5.1` and `kimi-k2`. The provider comparison names DeepSeek-R1, Qwen3-Thinking and MiniMax
  M2, and the reranker comparison tests Qwen3.6-35B-A3B. The upstream landscape notes name BGE-base
  and BGE-small-en-v1.5 for other products. The baseline LLM pipeline is off. For S48, omit the
  adapters and model wiring and use keyword-only recall.
  [Harnesses](https://github.com/akitaonrails/ai-memory/blob/bc7faa7d847dd387e634ba8420d115b9dd4ecebe/docs/support-matrix.md),
  [provider defaults and
  examples](https://github.com/akitaonrails/ai-memory/blob/bc7faa7d847dd387e634ba8420d115b9dd4ecebe/docs/llm-providers.md),
  [Xiaomi MiMo model card](https://huggingface.co/XiaomiMiMo/MiMo-V2.6-Flash-RL), [gateway
  recipes](https://github.com/akitaonrails/ai-memory/blob/bc7faa7d847dd387e634ba8420d115b9dd4ecebe/docs/install.md#openai-compatible-providers-ollama--vllm--lm-studio--hosted-apis),
  [fallback
  example](https://github.com/akitaonrails/ai-memory/blob/bc7faa7d847dd387e634ba8420d115b9dd4ecebe/docs/llm-provider-fallback.md),
  [OpenCode
  routing](https://github.com/akitaonrails/ai-memory/blob/bc7faa7d847dd387e634ba8420d115b9dd4ecebe/crates/ai-memory-llm/src/opencode.rs),
  [DeepSeek direct
  example](https://github.com/akitaonrails/ai-memory/blob/bc7faa7d847dd387e634ba8420d115b9dd4ecebe/docs/cookbook.md),
  [hook
  fixtures](https://github.com/akitaonrails/ai-memory/blob/bc7faa7d847dd387e634ba8420d115b9dd4ecebe/crates/ai-memory-cli/src/commands/install_hooks.rs),
  [provider
  comparison](https://github.com/akitaonrails/ai-memory/blob/bc7faa7d847dd387e634ba8420d115b9dd4ecebe/docs/llm-provider-comparison.md),
  [reranker
  comparison](https://github.com/akitaonrails/ai-memory/blob/bc7faa7d847dd387e634ba8420d115b9dd4ecebe/docs/jev-reranker-adapter.md),
  [landscape](https://github.com/akitaonrails/ai-memory/blob/bc7faa7d847dd387e634ba8420d115b9dd4ecebe/docs/research-2026-landscape.md),
  [Basic Memory
  study](https://github.com/akitaonrails/ai-memory/blob/bc7faa7d847dd387e634ba8420d115b9dd4ecebe/docs/research-basic-memory.md),
  [Z.AI
  route](https://github.com/akitaonrails/ai-memory/blob/bc7faa7d847dd387e634ba8420d115b9dd4ecebe/crates/ai-memory-llm/src/openai.rs).
- **GBrain.** Runtime recipes include Alibaba DashScope and DashScope rerank (international or China
  endpoints, `text-embedding-v1/v2/v3`, `qwen3-rerank`, with `gte-rerank-v2` named for the native
  API), DeepSeek (`deepseek-flash` / V4.1 Flash, `deepseek-v4-flash`, `deepseek-v4-pro`, legacy
  Chat/Reasoner), MiniMax (`embo-01`, M3, M2.7, M2.5, M2.1 and M2, including listed highspeed
  variants), Moonshot (`kimi-k2.7-code`, `kimi-k2.7-code-highspeed`, `kimi-k2.6`, `kimi-k2.5`), and
  Zhipu (`glm-5.3`, `glm-5.3-flash`, `glm-5.1`, `glm-4.6`, `glm-4.5`, older GLM IDs in comments, and
  `embedding-2/3`). OpenRouter routes include DeepSeek and Z.AI/GLM (including GLM-5.2 in
  model/pricing material), Qwen3-Embedding 8B and BAAI BGE-M3. Pricing also lists
  `deepseek/deepseek-v4-flash-0731`, `qwen/qwen3.7-flash` and `qwen/qwen3.6-plus`. Together lists
  Qwen2.5-72B-Instruct-Turbo and DeepSeek-V3. The hosted NaN recipe uses Qwen3-Reranker-8B behind
  the alias `rerank`. Local configurations include Qwen2.5 Coder 14B, Qwen3/3.8, Qwen3-Embedding
  (0.6B, 4B and 8B across local recipes), Qwen3 rerankers (0.6B, 4B and 8B), BGE-M3 and GLM/DeepSeek
  reasoning families. Source comments also name SiliconFlow for Qwen3-Embedding 4B, Tencent Hunyuan
  as an unpriced custom-provider example, and BGE-large in a dimension hint. Bundled routing
  guidance recommends DeepSeek and Qwen for research and fallback, with DeepSeek-R1 named for deep
  reasoning. The search guide also names BGE v1.5. Leave out the provider catalogue and its
  gateway/local routes from any reused piece. [Recipe
  registry](https://github.com/garrytan/gbrain/blob/5c48d799803d815b6fca730fd8e8f12324abb8f2/src/core/ai/recipes/index.ts),
  [DashScope](https://github.com/garrytan/gbrain/blob/5c48d799803d815b6fca730fd8e8f12324abb8f2/src/core/ai/recipes/dashscope.ts),
  [DashScope
  rerank](https://github.com/garrytan/gbrain/blob/5c48d799803d815b6fca730fd8e8f12324abb8f2/src/core/ai/recipes/dashscope-rerank.ts),
  [DeepSeek](https://github.com/garrytan/gbrain/blob/5c48d799803d815b6fca730fd8e8f12324abb8f2/src/core/ai/recipes/deepseek.ts),
  [MiniMax](https://github.com/garrytan/gbrain/blob/5c48d799803d815b6fca730fd8e8f12324abb8f2/src/core/ai/recipes/minimax.ts),
  [Moonshot](https://github.com/garrytan/gbrain/blob/5c48d799803d815b6fca730fd8e8f12324abb8f2/src/core/ai/recipes/moonshot.ts),
  [Zhipu](https://github.com/garrytan/gbrain/blob/5c48d799803d815b6fca730fd8e8f12324abb8f2/src/core/ai/recipes/zhipu.ts),
  [OpenRouter](https://github.com/garrytan/gbrain/blob/5c48d799803d815b6fca730fd8e8f12324abb8f2/src/core/ai/recipes/openrouter.ts),
  [Together](https://github.com/garrytan/gbrain/blob/5c48d799803d815b6fca730fd8e8f12324abb8f2/src/core/ai/recipes/together.ts),
  [NaN
  recipe](https://github.com/garrytan/gbrain/blob/5c48d799803d815b6fca730fd8e8f12324abb8f2/src/core/ai/recipes/nan.ts),
  [NaN model mapping](https://nan.builders/docs/api),
  [Ollama](https://github.com/garrytan/gbrain/blob/5c48d799803d815b6fca730fd8e8f12324abb8f2/src/core/ai/recipes/ollama.ts),
  [local
  reranker](https://github.com/garrytan/gbrain/blob/5c48d799803d815b6fca730fd8e8f12324abb8f2/src/core/ai/recipes/llama-server-reranker.ts),
  [embedding
  dimensions](https://github.com/garrytan/gbrain/blob/5c48d799803d815b6fca730fd8e8f12324abb8f2/src/core/ai/dims.ts),
  [model
  pricing](https://github.com/garrytan/gbrain/blob/5c48d799803d815b6fca730fd8e8f12324abb8f2/src/core/model-pricing.ts),
  [embedding
  pricing](https://github.com/garrytan/gbrain/blob/5c48d799803d815b6fca730fd8e8f12324abb8f2/src/core/embedding-pricing.ts),
  [dimension
  hint](https://github.com/garrytan/gbrain/blob/5c48d799803d815b6fca730fd8e8f12324abb8f2/src/core/init-embed-check.ts),
  [bundled model
  routing](https://github.com/garrytan/gbrain/blob/5c48d799803d815b6fca730fd8e8f12324abb8f2/skills/conventions/model-routing.md),
  [subagent
  routes](https://github.com/garrytan/gbrain/blob/5c48d799803d815b6fca730fd8e8f12324abb8f2/docs/guides/sub-agent-routing.md),
  [embedding
  examples](https://github.com/garrytan/gbrain/blob/5c48d799803d815b6fca730fd8e8f12324abb8f2/docs/guides/search-modes.md).

## Options considered

These options are research proposals for Blue's step 68 verdict. If a candidate was previously
dropped, the S48 builder must wait for Blue to explicitly revisit that decision before pursuing it.

| Option | Open Second Brain | ai-memory | GBrain |
|---|---|---|---|
| ADOPT | Closest fit. Existing vault, native Windows, deterministic dream and keyword search justify testing a subset before taking the whole plugin and hook surface. Cloud read path still needs proof. | Native daemon, hook capture and default model download exceed the first vault build. | Markdown import is useful, but a database plus sharing and provider machinery adds a second store to govern. |
| FORK | Possible under MIT if a proven subset needs changes. Carrying the plugin, scheduler, and provider inventory would add ongoing upkeep. | Maintaining the Rust service and harness compatibility costs more than extracting the workflow. | Maintaining the DB engines, migrations and provider recipes is disproportionate. |
| PROTOTYPE | **Recommended.** First isolate and re-scan the proposed files and resolve findings. Then run a pinned, keyword-only local trial on a synthetic vault: one completion note, one correction trail and one nightly report. Check native Windows and the three nightly runs on H1. Prove scoped cloud access via the private-repo sync from step 56 before using a private corpus. | A separate throwaway two-agent trial could test handoff fidelity if the concept proves insufficient. | A synthetic comparison is warranted only if S48's nightly reports show real retrieval misses. |
| PATTERN-MINE | Fall back to the dream and claim formats if the trial cannot isolate the needed functionality. | **Recommended.** Use the capture → consolidate → recall → handoff sequence with explicit project scope and minimal Markdown. | **Recommended.** Use facts and decisions files, source precedence and explicit citations. Keep semantic retrieval out of the first build. |
| BUILD FRESH | Use small Mako-specific glue for deduplicated completion notes and local scheduling while keeping the upstream format ideas. | A small Markdown handoff is enough for initial S48. | Source links and a missing-evidence note work in a plain vault before a hybrid engine is justified. |

A prototype is a decision for the S48 builder after H1 setup and Blue's verdict. If code is later
taken, preserve the applicable MIT notice and pin and scan the actual files after removing the
China-origin references. The proof is one note per finished task, a cloud agent reading only the
permitted private material, and three unattended tidy runs whose nightly note reports any retrieval
misses. Blue must be visibly notified of every failed, skipped or missing nightly run and every
failed per-task note write, and a missing nightly report also counts as a failure. Source sizes
above count entire upstream files unless a section or file set is specified. [S48 and
acceptance criteria](../PLAN-1.1.md#month-one).

## Blue's verdict (word for word)

2026-11-24, in Mako main's chat, answering checklist step 68 with this record's recommendation in
front of him:

> "sounds correct, go with that"

The recommendation he accepted:

- **PROTOTYPE** for an isolated Open Second Brain subset;
- **PATTERN-MINE** for ai-memory and GBrain.

Whether any of the three candidates was among the memory tools dropped on 2026-11-16: not answered.
His verdict doesn't address it, and nothing on `main` names any of the three as dropped
([2026-11-16 sign-off](../DECISIONS.md#2026-11-16-the-mako-11-decision-sheet)). The rule under
"Options considered" still applies: if one turns out to have been dropped, the S48 builder waits
for Blue to revisit it.
