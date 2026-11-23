# OSS decision: AgentPlayback (S53)

2026-11-18 · S53 vetting. The builder sees potential uses for the control room (S19) and merged-work history (S62).

## Project and pin

- **Identity.** [S53](../PLAN-1.1.md) names AgentPlayback. Jerry Liu and Dayflow publish the exact-name Claude Code and Codex timeline as `agentplayback`. The plan and signed decision sheet separately name Entelligence AI's `agentplay` as a design reference for the control room. [Pinned AgentPlayback README][readme], [npm package record][npm], [Mako decision sheet](../DECISIONS.md#2026-11-16), [Entelligence-AI/agentplay](https://github.com/Entelligence-AI/agentplay).
- **Licence and pin.** MIT, copyright 2026 Dayflow. Vetting pin: `agentplayback@1.2.1`, tag `v1.2.1`, commit [`bb7f9e987030284f1bc252c70f2d2fefb6beec94`][pin]. The GitHub tag and npm `gitHead` resolve to that SHA. The downloaded tarball matches npm's SHA-512 integrity and its CLI and scanner files match the source bytes. [Licence](https://github.com/JerryZLiu/AgentPlayback/blob/bb7f9e987030284f1bc252c70f2d2fefb6beec94/LICENSE), [release][release], [npm package record][npm].
- **Maintenance, checked 2026-11-18.** Latest GitHub and npm release: 2026-10-02. The latest main commit on 2026-11-17 refreshed pricing. All 42 commits since the release were automated pricing refreshes. Git history at that head has one human author (Jerry Liu, 87 commits) and the GitHub Actions bot (63 commits, including 21 before or at the release). [Release][release], [npm publish history](https://registry.npmjs.org/agentplayback), [main history at the observed head](https://github.com/JerryZLiu/AgentPlayback/commits/7b2179475fe12b4a3a86fb0b32558a989770ec2b/).

## Install, runtime and session data

| Area | What the pinned code does |
|---|---|
| Install | The registry package includes prebuilt browser assets and a Node 20+ CLI, with zero npm runtime dependencies and no install lifecycle hook. npm needs registry access for an uncached fetch. A verified tarball can be staged offline with lifecycle scripts disabled. Source setup fetches npm workspace packages, including esbuild 0.25.12, whose postinstall provisions its native binary. npm's `--ignore-scripts` skips lifecycle hooks. An explicit source build runs TypeScript and Vite. The publisher's `prepublishOnly` runs that build. [npm tarball metadata][npm], [root manifest][manifest], [UI manifest][uim], [lockfile][lock], [esbuild manifest](https://registry.npmjs.org/esbuild/0.25.12), [publish workflow][publish]. |
| Local runtime | The CLI runs a Node child to scan today, serves dashboard assets and derived JSON over HTTP on `127.0.0.1`, and normally opens the browser. The page requests a history backfill and periodic scans for today. The listener has no authentication. `--no-open` suppresses the browser launch. Stopping the CLI stops the listener. [CLI startup and server][cli], [dashboard refresh][refresh]. |
| Outbound access | The scanner fetches a mutable OpenAI/Anthropic price table from GitHub's `main` on a cold or stale cache (one-hour TTL by default). It sends a price request without session fields and falls back to cached rates or omits prices. There is no offline flag. Point `DAYFLOW_PRICE_URL` at a pinned local mirror, or block outbound access and preseed the price cache for offline estimates. The upstream CI price updater separately reads the public LiteLLM rates. [Pricing loader][prices], [upstream update script][priceci]. |
| Sign-up and telemetry | Source inspection found no required account, telemetry collector or transcript upload in the npm runtime. After an eligible dashboard is visible for about a minute, the star prompt checks local `gh` authentication and may query GitHub as the signed-in user. Starring writes to GitHub only on click, with a browser fallback. The Dayflow link carries referral parameters on click. To suppress credentialed calls, run without `gh` on the tool's PATH and without GitHub credentials. Keep the browser and process offline for an egress guarantee. [Star prompt][star], [GitHub handlers][gh], [Dayflow link][referral]. |
| Session inputs and outputs | Reads Claude Code project and subagent JSONL, plus Codex live and archived rollouts and its session-title index. Scope the roots with `CLAUDE_CONFIG_DIR` and `CODEX_HOME`. It extracts timestamps, inferred activity and wait intervals, working directories, session and parent identifiers, models, token usage, turns, and counts of added or removed lines. Cached records can contain the first Claude user prompt, the first line of a Codex prompt and the last Codex agent message. The local cache and day JSON under `AGENTPLAYBACK_HOME` can expose project labels, session titles and prompt or response excerpts. The dashboard shows derived activity and can display a local aggregate share preview with project names. [Log roots][roots], [Claude parser][claude], [Codex parser][codex], [per-file cache][cache], [day JSON fields][days], [share preview][share]. |

## China-origin rule and static scan

The README credits Dayflow, whose public company profile places it in San Francisco. The tracked `opencode.json` names `openrouter/moonshotai/kimi-k3` and contains a prompt that tries to override agent instructions. Moonshot AI lists a Beijing address. This config is outside the npm tarball and the inspected Node CLI has no inference path. The builder originally read the China-origin rule as covering tracked development configs. Blue later clarified that the rule excludes model names that appear only in upstream files Mako doesn't ship. Blue can confirm how that applies to this pin in step 67. [Pinned README][readme], [Dayflow company profile](https://www.ycombinator.com/companies/dayflow), [pinned model field][config], [Moonshot AI company page](https://www.moonshot.cn/about/), [package file list][manifest], [Blue's clarification, item 13](https://github.com/ABlueAI/AgentCommandCenter/blob/main/docs/DECISIONS.md#2026-11-21-blues-decisions-of-2026-11-16-to-2026-11-21).

**SkillSpector 2.12.0, static only (2026-11-18).** Ran `skillspector scan <pinned-source-directory> --no-llm --format json` on a Git archive of the pinned tree. The report has `llm_requested: false` and no inference calls. The default China-origin analyzer was disabled. The scan completed with 22 findings (1 critical, 8 high, 4 medium, 9 low), risk 100/100, and `DO_NOT_INSTALL`. The critical prompt-injection and six high anti-refusal findings point to the OpenCode prompt. Another high finding matches a routine `.env` ignore rule. The high YARA image match is unverified. Coverage was partial: 27 of 45 eligible files fully inspected, 18 partial, and 20 binary files outside the text scan. Limits include bounded parsing, obfuscated instruction text and dependency checking. The live OSV check failed (reason not reported). The fallback checked npm dependency names and versions from the manifests and lockfile against a bundled list of nine packages and found no matches. No upstream code or package scripts ran. [SkillSpector v2.12.0](https://github.com/NVIDIA/SkillSpector/tree/c7958a3268d9498644b22edb75d0f051bbc8cbfc), [static mode and OSV behavior](https://github.com/NVIDIA/SkillSpector/blob/c7958a3268d9498644b22edb75d0f051bbc8cbfc/README.md#trust-model-and-data-egress).

## Fit and options

In the builder's reading, a per-pane activity timeline could fit the **control room** (S19), showing which agent ran, when work overlapped, where it waited, and how much changed. **Merged-work history** (S62) could correlate selected events with Mako's own session, worktree and PR or merge identifiers. AgentPlayback provides a timeline of past activity. Full command or diff playback and attribution to a specific merge would require Mako data. [S19 and S62](../PLAN-1.1.md), [upstream output model][days].

| Option | Assessment |
|---|---|
| ADOPT | The existing dashboard gives immediate activity history. Ask Blue to confirm how the China-origin rule applies to the unshipped config. The CLI adds transcript discovery, a loopback service and credentialed GitHub access. |
| FORK | A fork could remove the flagged config and external integrations. It would need Blue to decide whether a derivative is eligible, a fresh vet, and ongoing parser maintenance. |
| PROTOTYPE | A small synthetic-data trial could validate the timeline design. Confirm how the China-origin rule applies with Blue before running the pinned upstream. |
| PATTERN-MINE | Study the timeline and wait indicators as design ideas without importing code, assets or agent configs. Mako would still need its own event and merge correlation. |
| **BUILD FRESH (recommended)** | A BUILD FRESH verdict, like any verdict that builds nothing in S53, closes S53. Any approved replay work goes to S19 (pane activity) or S62 (merged-work history) under their existing waits. A local, read-only replay could use Mako-owned pane events and merge records, starting with timestamps, role, state changes and merge links. This avoids upstream broad transcript reads and credentialed `gh` calls. |

**Blue's verdict (word for word):** ____________________

[pin]: https://github.com/JerryZLiu/AgentPlayback/tree/bb7f9e987030284f1bc252c70f2d2fefb6beec94
[release]: https://github.com/JerryZLiu/AgentPlayback/releases/tag/v1.2.1
[npm]: https://registry.npmjs.org/agentplayback/1.2.1
[readme]: https://github.com/JerryZLiu/AgentPlayback/blob/bb7f9e987030284f1bc252c70f2d2fefb6beec94/README.md
[manifest]: https://github.com/JerryZLiu/AgentPlayback/blob/bb7f9e987030284f1bc252c70f2d2fefb6beec94/package.json
[uim]: https://github.com/JerryZLiu/AgentPlayback/blob/bb7f9e987030284f1bc252c70f2d2fefb6beec94/ui/package.json
[lock]: https://github.com/JerryZLiu/AgentPlayback/blob/bb7f9e987030284f1bc252c70f2d2fefb6beec94/package-lock.json#L119-L130
[publish]: https://github.com/JerryZLiu/AgentPlayback/blob/bb7f9e987030284f1bc252c70f2d2fefb6beec94/.github/workflows/publish-npm.yml
[cli]: https://github.com/JerryZLiu/AgentPlayback/blob/bb7f9e987030284f1bc252c70f2d2fefb6beec94/bin/cli.js
[refresh]: https://github.com/JerryZLiu/AgentPlayback/blob/bb7f9e987030284f1bc252c70f2d2fefb6beec94/ui/src/main.ts#L920-L983
[prices]: https://github.com/JerryZLiu/AgentPlayback/blob/bb7f9e987030284f1bc252c70f2d2fefb6beec94/scripts/scan-day.mjs#L77-L121
[priceci]: https://github.com/JerryZLiu/AgentPlayback/blob/bb7f9e987030284f1bc252c70f2d2fefb6beec94/scripts/update-model-prices.mjs
[star]: https://github.com/JerryZLiu/AgentPlayback/blob/bb7f9e987030284f1bc252c70f2d2fefb6beec94/ui/src/star-prompt.ts
[gh]: https://github.com/JerryZLiu/AgentPlayback/blob/bb7f9e987030284f1bc252c70f2d2fefb6beec94/bin/cli.js#L253-L330
[referral]: https://github.com/JerryZLiu/AgentPlayback/blob/bb7f9e987030284f1bc252c70f2d2fefb6beec94/ui/src/overlay.ts#L413-L425
[roots]: https://github.com/JerryZLiu/AgentPlayback/blob/bb7f9e987030284f1bc252c70f2d2fefb6beec94/scripts/lib/roots.mjs
[claude]: https://github.com/JerryZLiu/AgentPlayback/blob/bb7f9e987030284f1bc252c70f2d2fefb6beec94/scripts/providers/claude.mjs
[codex]: https://github.com/JerryZLiu/AgentPlayback/blob/bb7f9e987030284f1bc252c70f2d2fefb6beec94/scripts/providers/codex.mjs
[cache]: https://github.com/JerryZLiu/AgentPlayback/blob/bb7f9e987030284f1bc252c70f2d2fefb6beec94/scripts/lib/fastscan.mjs#L73-L136
[days]: https://github.com/JerryZLiu/AgentPlayback/blob/bb7f9e987030284f1bc252c70f2d2fefb6beec94/scripts/scan-day.mjs#L250-L435
[share]: https://github.com/JerryZLiu/AgentPlayback/blob/bb7f9e987030284f1bc252c70f2d2fefb6beec94/ui/src/share.ts
[config]: https://github.com/JerryZLiu/AgentPlayback/blob/bb7f9e987030284f1bc252c70f2d2fefb6beec94/opencode.json#L3-L7
