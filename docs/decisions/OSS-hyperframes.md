# S52 — HyperFrames vetting and trial

2026-11-17 Eastern (2026-11-18 UTC), PR #206. **Builder’s recommendation — FORK a renderer-only subset.**
The local render worked. The upstream distribution fails Blue’s China-origin rule because it
offers MiniMax/Qwen models through its media commands. A future fork would need a fresh pin and
vetting before any Mako integration. This session covers research and the sandbox trial.

## Blue’s verdict

Verdict: FORK, conditional. Blue (2026-11-18, in his main chat), adopting Mako main's recommendation: 'I think your recommendation verdicts are very good. So, yes to both of those recommendations.' Reconfirmed by Blue on 2026-11-23 ('yes i do recall now', 'agree'). The recommendation he adopted: first a Windows trial on the VM, with the browser sandbox on, outside connections blocked and logged, and the media commands that call China-origin models removed. Fork only if that trial shows no outside connections and no sandbox downgrade.

Source: Blue's words as quoted in the Mako main session's hand-off to the Claude cloud session that
pushed the review fixes ([session](https://claude.ai/code/session_01UWhuMF5YrgU1ojPL6DN1Q1)). The
quoted parts are Blue's words; the rest describes the recommendation he adopted. This replaces the
third-person summary that the [2026-11-22 fix
request](https://github.com/ABlueAI/AgentCommandCenter/pull/206#issuecomment-7075022787) gave, which
did not quote him.

## Identity, licence and maintenance

| Check | Evidence |
|---|---|
| Official project and owner | HyperFrames is HeyGen’s HTML-to-video framework, owned on GitHub by `heygen-com`. HeyGen’s help center identifies the project, the Apache notice names HeyGen, Inc., and the npm provenance names the same repository. HeyGen Technology Inc. identifies itself as a Delaware corporation with its legal contact in Los Angeles, California. [HeyGen Help Center][identity] · [GitHub repository][repo] · [licence][licence] · [HeyGen agreement][company] |
| Licence | Apache-2.0 at the pin and in the npm manifest. Preserve the licence and applicable notices, and mark modified files if distributing a fork. Bundled third-party code and assets would need their own licence review before redistribution. [Pinned licence][licence] · [npm manifest][npm] |
| Version and commit | `hyperframes@0.9.65`, tag `v0.9.65`, commit `32ff8b332323cfcff29be3ede278fc7810b6f5a5`. The npm SLSA statement names that same commit. The downloaded tarball’s SHA-512 matched the attestation subject and npm integrity. [Release][release] · [commit][pin] · [npm manifest][npm] · [npm attestation][attestation] |
| Last release | `v0.9.65` was GitHub’s latest release at the check, published 2026-11-17 at 7:05 p.m. Eastern (2026-11-18 00:05 UTC). npm’s `latest` pointed to `0.9.65`, published at 7:19 p.m. Eastern (00:19 UTC). [GitHub latest][latest] · [npm publication metadata][npm-times] |
| Commit activity and contributors | `main` at `e6cee094b18e64133afdfbf046d3bbf1125a4d6a` showed 7,506 reachable commits, including 487 in the seven days ending 2026-11-17 at 10:07 p.m. Eastern. The most recent commit was on 2026-11-17 at 9:02 p.m. Eastern. That week had 29 distinct Git author identities, and the reachable history had 165, counted by mailmap-aware author email. These are Git identities, including automation and possible aliases. [Main history][history] · [main head at check][history-head] · [GitHub contributors][contributors] |

## Install and runtime

| Path | What runs or contacts the network |
|---|---|
| npm install | The published CLI has no `preinstall`, `install`, `postinstall` or `prepare` script. In the resolved Linux trial tree, `esbuild@0.28.2` was the only package with an install lifecycle script (`postinstall: node install.js`). It selects and validates the platform binary and can fall back to npm install or a registry tarball if the optional platform package is missing. The trial used `--ignore-scripts` and resolved dependencies from npm. This evidence covers the Linux dependency tree resolved for the trial. The source workspace’s separate `prepare` hook installs Lefthook in a Git checkout. [npm manifest][npm] · [esbuild installer][esbuild] · [source workspace manifest][workspace] |
| Local render | Node runs the CLI, Chromium captures frames from a loopback composition server and FFmpeg encodes them. FFmpeg and ffprobe are looked up locally, with installation guidance if missing. Browser setup can fetch a pinned Chrome Headless Shell from Google’s Chrome for Testing storage on a cache miss. This trial supplied system binaries. HTML and media can reference remote resources, so a self-contained scene is needed to avoid asset fetching. [Render preflight][preflight] · [browser setup][browser] · [Puppeteer download URL][puppeteer] · [FFmpeg setup][ffmpeg] · [render pipeline][pipeline] · [browser network handling][browser-network] |
| Default background activity | Telemetry is enabled by default and sends command and render diagnostics to PostHog. Events use an anonymous install ID before sign-in and are linked to a HeyGen account after sign-in. `HYPERFRAMES_NO_TELEMETRY=1` disables it. Ordinary commands can trigger a detached npm version and GitHub skill-manifest check. In attended runs, a cached eligible update can trigger an automatic install. `HYPERFRAMES_NO_UPDATE_CHECK=1`, `HYPERFRAMES_NO_AUTO_INSTALL=1` and `HYPERFRAMES_SKIP_SKILLS=1` were set for the trial. [Telemetry fields][telemetry-fields] · [telemetry policy][telemetry-policy] · [defaults][telemetry-defaults] · [transport][telemetry-transport] · [background checks][background] · [npm check][update] · [skill check][skills-update] · [auto-install][auto-update] |
| Optional online commands | Registry operations can fetch from GitHub or an explicitly configured registry. Login, cloud rendering and hosted media commands contact HeyGen. Media tooling can also invoke local model setup and download weights. The trial used the local render command with no credentials or external scene assets. [Registry client][registry] · [HeyGen API base][heygen-api] · [OAuth endpoints][oauth] · [media commands][media] · [local model catalogue][models] |

## China-origin rule

**Fails for the pinned upstream distribution.** It offers MiniMax/Qwen models through its media
commands. The npm payload offers `minimax-h3-image` and `minimax-h3-image-4k` from MiniMax
(Shanghai), and its local model catalogue offers `Qwen/Qwen-Image` from Alibaba Cloud. The
repository also names Qwen, DeepSeek, Kimi and GLM in its agent guide and Seedance in its Studio
docs. The claim that “the rule covers names as well as use” was the builder’s interpretation of the
task brief. Blue later [clarified][clarified] that the rule covers what Mako runs, installs or calls.
A model named only in an upstream file Mako doesn’t ship is not a fail. The trial invoked no model.
[Mako decision][rule] · [CLI model options][model-options] ·
[local model catalogue][models] · [MiniMax contacts][minimax] · [Qwen publisher][qwen] ·
[agent guide][agent-guide] · [Studio guide][studio-guide]

## Static scan

SkillSpector `2.12.0` (`v2.12.0`, `c7958a3268d9498644b22edb75d0f051bbc8cbfc`) ran against the pinned
source with `--no-llm` and no provider credentials. Its build defaults to the China-origin GLM
analyzer when LLM analysis is enabled. The reports record `llm_requested: false` and an empty
`inference_usage` array. The scanner’s static SC4 check can still look up dependency coordinates
via OSV.dev and use its bundled fallback if unreachable. [Scanner release][scanner] ·
[default analyzer][scanner-default] · [static mode and OSV][scanner-osv]

The repository-root run (`skillspector scan "$PINNED_SOURCE" --no-llm --recursive --format json`)
fell back to a bounded scan when automatic skill discovery reached a limit. It reported **partial**
coverage: 0 fully inspected, 6,316 partially inspected and 2,173 uninspected components. All
5,745 high flags were SC9 (concealed or incompletely inspected executable artifacts). The scan
also reported 1,011 medium and 1 low flags. The flags and coverage gaps need human triage.

Each of the 29 directories containing `SKILL.md` was also passed directly to
`skillspector scan "$SKILL_DIR" --no-llm --format json`. All returned reports, 28 partial and one
complete. Taken per directory, including mirrored skills, they reported **213 high, 881 medium,
and 32 low flags**, with zero critical flags. The nine top-level skill directories include
`skills/hyperframes` (56 high flags, including prompt-injection flags in example HTML) and
`skills/media-use` (90 high flags, including privilege-escalation flags in media tooling).
Missing references, parse and runtime limits, and opaque or obfuscated content reduced coverage.
These are automated rule matches. Their review belongs with any proposed fork, whose shipped
files can be rescanned as a smaller scope.

## Sandbox render

An original, self-contained HTML/CSS composition used a ten-second `640×360` stage with a title and
a circle animated horizontally. The root declared `data-duration="10"` and `data-no-timeline`.
The versioned npm tarball was installed into a temporary directory with `--ignore-scripts --no-save
--package-lock=false`. Node `24.19.0`, Chromium `154.0.8037.57` and FFmpeg `7.1.5` were already present
on the Debian sandbox. With `scene-final/index.html` and `runtime/node_modules` under the trial
directory, the measured command was:

```bash
TIMEFORMAT='wall_seconds=%3R'
time env -i PATH="$PATH" HOME="$PWD/run-home" TMPDIR="$PWD/run-tmp" \
  HYPERFRAMES_NO_TELEMETRY=1 HYPERFRAMES_NO_UPDATE_CHECK=1 \
  HYPERFRAMES_NO_AUTO_INSTALL=1 HYPERFRAMES_SKIP_SKILLS=1 \
  HYPERFRAMES_BROWSER_PATH=/usr/bin/chromium HYPERFRAMES_FFMPEG_PATH=/usr/bin/ffmpeg \
  HYPERFRAMES_FFPROBE_PATH=/usr/bin/ffprobe \
  strace -f -qq -e trace=connect,bind,sendto -o final.network \
  runtime/node_modules/.bin/hyperframes render scene-final --output hyperframes-trial.mp4 \
  --fps 24 --quality draft --workers 1 --strict
```

- **Result.** Exit 0. HyperFrames reported **65.9 s** render time and Bash measured **77.163 s**
  wall time including startup, tracing and teardown. `ffprobe` measured **53,401 bytes**, **10.000 s**,
  H.264, 640×360, 24 fps, 240 frames, silent. `ffmpeg` decoded the full file without errors.
  Pixel samples at 0.5, 5 and 9.5 s confirmed motion. The MP4 stayed in the sandbox.
- **Errors and fallbacks.** The first pass reported a missing timeline registration and a missing
  `data-no-timeline` marker. Adding the marker cleared the lint gate for the strict run. Chromium’s
  own sandbox could not start in the cloud host, so HyperFrames automatically retried without the
  browser’s sandbox, still within the Codex sandbox. It used software GPU and screenshot capture.
  The browser logged one non-blocking resource 404 without identifying the resource. The trace
  showed loopback traffic, DNS activity, and failed off-host IPv6 port-443 attempts with all
  four opt-outs set. The off-host destination, initiating process, and DNS lookups were not identified.
  No successful off-host HTTP connection was observed in that trace. Windows was outside this
  trial. [Browser launch fallback][browser-fallback] · [Render troubleshooting][rendering]

## Options for Blue

| Verdict | Fit |
|---|---|
| ADOPT | The upstream CLI works for a simple local scene. Its media commands offer MiniMax/Qwen models, so adopting it unchanged would require Blue’s exception to the China-origin rule. |
| **FORK (conditional)** | Preserve the Apache-licensed HTML/CSS capture and encode path. Remove the media commands that call China-origin models and disallowed model and service references from the candidate’s shipped code and docs. Exclude hosted media and remote skills. The fork must refuse to render with a visible error if Chromium’s sandbox can’t start. Remove the automatic unsandboxed retry. The fork must block or explain the off-host DNS and IPv6 port-443 attempts seen in the Linux trial (Sandbox render section). First run a Windows VM trial with Chromium’s sandbox on and outside connections blocked and logged. Fork only if the trial shows no outside connections and no sandbox downgrade. Pin and scan the resulting distribution before considering integration. This carries an ongoing upstream maintenance cost. |
| PROTOTYPE | The Linux trial already establishes basic render feasibility. A separate Windows-only prototype of a compliant candidate can answer packaging, sandbox and performance questions. |
| PATTERN-MINE | Study deterministic frame seeking, Chromium capture and FFmpeg assembly without taking a dependency. This trades upstream maintenance for Mako implementation work. |
| BUILD FRESH | Own the full pipeline if a compliant fork proves impractical. This carries the largest delivery and testing cost. |

[identity]: https://help.heygen.com/en/articles/15001510-hyperframes-x-heygen
[repo]: https://github.com/heygen-com/hyperframes
[company]: https://www.heygen.com/master-saas-agreement
[licence]: https://github.com/heygen-com/hyperframes/blob/32ff8b332323cfcff29be3ede278fc7810b6f5a5/LICENSE
[release]: https://github.com/heygen-com/hyperframes/releases/tag/v0.9.65
[latest]: https://github.com/heygen-com/hyperframes/releases/latest
[pin]: https://github.com/heygen-com/hyperframes/commit/32ff8b332323cfcff29be3ede278fc7810b6f5a5
[npm]: https://registry.npmjs.org/hyperframes/0.9.65
[npm-times]: https://registry.npmjs.org/hyperframes
[attestation]: https://registry.npmjs.org/-/npm/v1/attestations/hyperframes@0.9.65
[history]: https://github.com/heygen-com/hyperframes/commits/e6cee094b18e64133afdfbf046d3bbf1125a4d6a/
[history-head]: https://github.com/heygen-com/hyperframes/commit/e6cee094b18e64133afdfbf046d3bbf1125a4d6a
[contributors]: https://github.com/heygen-com/hyperframes/graphs/contributors
[esbuild]: https://registry.npmjs.org/esbuild/-/esbuild-0.28.2.tgz
[workspace]: https://github.com/heygen-com/hyperframes/blob/32ff8b332323cfcff29be3ede278fc7810b6f5a5/package.json#L69
[preflight]: https://github.com/heygen-com/hyperframes/blob/32ff8b332323cfcff29be3ede278fc7810b6f5a5/packages/cli/src/browser/preflight.ts
[browser]: https://github.com/heygen-com/hyperframes/blob/32ff8b332323cfcff29be3ede278fc7810b6f5a5/packages/cli/src/browser/manager.ts
[puppeteer]: https://registry.npmjs.org/@puppeteer/browsers/3.2.7
[ffmpeg]: https://github.com/heygen-com/hyperframes/blob/32ff8b332323cfcff29be3ede278fc7810b6f5a5/packages/cli/src/browser/ffmpeg.ts
[pipeline]: https://github.com/heygen-com/hyperframes/blob/32ff8b332323cfcff29be3ede278fc7810b6f5a5/packages/producer/src/services/renderOrchestrator.ts
[browser-network]: https://github.com/heygen-com/hyperframes/blob/32ff8b332323cfcff29be3ede278fc7810b6f5a5/packages/engine/src/services/publicNetwork/captureProxy.ts
[telemetry-fields]: https://github.com/heygen-com/hyperframes/blob/32ff8b332323cfcff29be3ede278fc7810b6f5a5/docs/packages/cli.mdx#L2494-L2536
[telemetry-policy]: https://github.com/heygen-com/hyperframes/blob/32ff8b332323cfcff29be3ede278fc7810b6f5a5/packages/cli/src/telemetry/policy.ts
[telemetry-defaults]: https://github.com/heygen-com/hyperframes/blob/32ff8b332323cfcff29be3ede278fc7810b6f5a5/packages/cli/src/telemetry/config.ts#L624
[telemetry-transport]: https://github.com/heygen-com/hyperframes/blob/32ff8b332323cfcff29be3ede278fc7810b6f5a5/packages/cli/src/telemetry/transport.ts
[background]: https://github.com/heygen-com/hyperframes/blob/32ff8b332323cfcff29be3ede278fc7810b6f5a5/packages/cli/src/cli.ts#L302-L349
[update]: https://github.com/heygen-com/hyperframes/blob/32ff8b332323cfcff29be3ede278fc7810b6f5a5/packages/cli/src/utils/updateCheck.ts
[skills-update]: https://github.com/heygen-com/hyperframes/blob/32ff8b332323cfcff29be3ede278fc7810b6f5a5/packages/cli/src/utils/skillsUpdateCheck.ts
[auto-update]: https://github.com/heygen-com/hyperframes/blob/32ff8b332323cfcff29be3ede278fc7810b6f5a5/packages/cli/src/utils/autoUpdate.ts
[registry]: https://github.com/heygen-com/hyperframes/blob/32ff8b332323cfcff29be3ede278fc7810b6f5a5/packages/cli/src/registry/remote.ts
[heygen-api]: https://github.com/heygen-com/hyperframes/blob/32ff8b332323cfcff29be3ede278fc7810b6f5a5/packages/cli/src/auth/client.ts
[oauth]: https://github.com/heygen-com/hyperframes/blob/32ff8b332323cfcff29be3ede278fc7810b6f5a5/packages/cli/src/auth/config.ts
[media]: https://github.com/heygen-com/hyperframes/blob/32ff8b332323cfcff29be3ede278fc7810b6f5a5/skills/media-use/references/heygen.md
[models]: https://github.com/heygen-com/hyperframes/blob/32ff8b332323cfcff29be3ede278fc7810b6f5a5/packages/cli/src/media-use/lib/local-models.mjs#L194-L207
[model-options]: https://github.com/heygen-com/hyperframes/blob/32ff8b332323cfcff29be3ede278fc7810b6f5a5/packages/cli/src/heygen/generate.ts#L166-L190
[minimax]: https://ir.minimax.io/investor-resources/ir-contacts
[qwen]: https://huggingface.co/Qwen/Qwen-Image
[agent-guide]: https://github.com/heygen-com/hyperframes/blob/32ff8b332323cfcff29be3ede278fc7810b6f5a5/docs/guides/free-agents.mdx#L12-L25
[studio-guide]: https://github.com/heygen-com/hyperframes/blob/32ff8b332323cfcff29be3ede278fc7810b6f5a5/docs/studio-app/video-clips.mdx#L40-L45
[rule]: ../DECISIONS.md#2026-11-16-the-mako-11-decision-sheet
[clarified]: ../DECISIONS.md#2026-11-21-blues-decisions-of-2026-11-16-to-2026-11-21
[scanner]: https://github.com/NVIDIA/SkillSpector/tree/c7958a3268d9498644b22edb75d0f051bbc8cbfc
[scanner-default]: https://github.com/NVIDIA/SkillSpector/blob/c7958a3268d9498644b22edb75d0f051bbc8cbfc/src/skillspector/providers/nv_build/provider.py#L52
[scanner-osv]: https://github.com/NVIDIA/SkillSpector/blob/c7958a3268d9498644b22edb75d0f051bbc8cbfc/README.md#L824-L825
[browser-fallback]: https://github.com/heygen-com/hyperframes/blob/32ff8b332323cfcff29be3ede278fc7810b6f5a5/packages/cli/src/browser/launch.ts
[rendering]: https://github.com/heygen-com/hyperframes/blob/32ff8b332323cfcff29be3ede278fc7810b6f5a5/docs/guides/rendering.mdx
