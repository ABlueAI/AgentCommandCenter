# S20: OSS record for Pixel Agents (the aquarium's base)

2026-11-26, by the all-day runner building S20 (PR #322). The plan row and the design brief
([docs/DESIGN-BRIEF-1.1.md](../DESIGN-BRIEF-1.1.md), sections 6 and 10) name **Pixel Agents 1.6.0,
pinned exactly, watch-only (`--no-terminal`), after the pin-and-scan step** as the aquarium's base.
Blue named the project, so adopting or forking it is the default (AGENTS.md "Engineering rules").

## Verdict

**FORK (the engine core)**, 🤖 builder's default (D-090), which Blue's merge approves.

Mako takes Pixel Agents' small canvas engine into its own renderer, ported from TypeScript to plain
JavaScript, with the MIT notice: the sprite format, the per-zoom sprite cache, the selection
outline, the game loop and the blink clock, plus its permission bubble sprite
(`app/renderer/aquarium-engine.js`, `app/renderer/aquarium.js`; THIRD-PARTY-NOTICES.md, "Adapted
code"). The tank, the three fish species and the crew list are drawn on it from Mako's own pane
list and pane-status states. Nothing else from Pixel Agents runs in Mako.

Why not ADOPT (run `npx pixel-agents --no-terminal` and show its page in the tab), builder's
reading of the 1.6.0 package and its source:

- **It is a network listener.** The standalone CLI starts a Fastify web server with WebSockets and an
  access token in the URL (CHANGELOG 1.5.0, "Standalone access token"; `dependencies` in its
  `package.json`). Network listeners are a sensitive area (AGENTS.md), and the task authorized a
  base, not a listener.
- **It changes Blue's Claude Code setup.** It installs its own Claude Code hooks
  (`dist/hooks/claude-hook.js`) and can wrap the status line (CHANGELOG 1.6.0, "Usage bars"). Mako
  already has its own pane-status hooks (S06, S07), and two hook sets on one machine is a change to
  Blue's PC that the task didn't ask for.
- **It doesn't know Mako's panes.** It finds agents from Claude Code's own transcripts and its
  hooks, keyed by Claude sessions, not by Mako's pane ids, so "one creature per pane" and "a click
  opens the pane" (the row's done-when) would need a bridge from its sessions back to Mako's panes.
  Mako's renderer already has the pane list and each pane's state.
- **It draws an office, not a tank**, with a React and Vite front end; Mako's renderer has no build
  step.

If Blue wants the whole Pixel Agents app (its office, characters and launcher) inside Mako, that is
ADOPT with a listener and hooks: a 1.2 item and his call.

## Options

| Option | What it means here | Verdict |
|---|---|---|
| ADOPT | Run the 1.6.0 CLI watch-only and show its page in the aquarium tab | No: a listener plus hooks into `~/.claude`, and no link to Mako's panes (above) |
| **FORK** | Port its engine core into Mako's renderer, with the notice; draw Mako's own tank on it | **Yes** |
| PROTOTYPE | Try the CLI on Blue's PC first | Not needed for the MVP; Blue's look at the tab is checklist step 55 |
| PATTERN-MINE | Rebuild from its ideas, no code taken | No: Blue named it as the base, so its code is taken |
| BUILD FRESH | Ignore it | No (same reason) |

## Pin

| What | Value | Certainty |
|---|---|---|
| Package | `pixel-agents@1.6.0` on npm | verified (`npm view pixel-agents versions`: 1.6.0 is the latest) |
| npm integrity | `sha512-LcERM3gY70FPGU2VTew2I8kSElZawyQOUqmYbm56NhB1G9PJRJGotM0EhEIcZZnqIXrarUH6e9TnyulKNZMrhw==` | verified (`npm view pixel-agents@1.6.0 dist.integrity`, 2026-11-26) |
| Source | [pixel-agents-hq/pixel-agents](https://github.com/pixel-agents-hq/pixel-agents), tag `v1.6.0`, commit `4dd14d612fd37d89ffbbc977959f572395c4eec8` | verified (shallow clone of the tag, 2026-11-26) |
| Files taken (sha256, first 16 hex) | `webview-ui/src/office/sprites/spriteCache.ts` `fd615d74508e9dc3`; `webview-ui/src/office/engine/gameLoop.ts` `db41b31356f1a4ac`; `webview-ui/src/office/engine/blink.ts` `a3cec380e35bf7ca`; `webview-ui/src/office/sprites/bubble-permission.json` `c1c5843455f8a420`; constants from `webview-ui/src/constants.ts` `15aae4b39bd4ecc8` | verified (`sha256sum` on the clone) |

Nothing is installed: no npm package is added to `app/package.json`, and no Pixel Agents file is
vendored as is. A later re-pin compares these files at the new tag and ports what changed.

## Scan

- **Licence:** MIT, `LICENSE` at the tag, "Copyright (c) 2026 Pablo De Lucca"; the text is in
  `LICENSES/MIT-pixel-agents.txt`, and MIT is on the licence guardrail's permissive list
  (`app/licence-policy.js`). Verified (read at the tag; `app/third-party-notices.test.js` passes).
- **China-origin check (AGENTS.md "Engineering rules"):** pass. Pixel Agents calls no model
  itself; it watches Claude Code. A search of the whole v1.6.0 source tree for Qwen, DeepSeek,
  Doubao, Moonshot and Zhipu found nothing. A whole-word search for Kimi and GLM found nothing either. Verified (`grep -rli` and
  `grep -rliw` over the clone, 2026-11-26).
- **Tool-security scan:** the code taken is about 150 lines of drawing, timing and arithmetic. It
  was read in full: it makes no network, file, process or IPC call, loads nothing, and has no
  `eval`. Mako's port (`aquarium-engine.js`, `aquarium.js`) was searched for `fetch`, `require(`,
  `eval`, `Function(`, `XMLHttpRequest`, `WebSocket`, dynamic `import(` and `innerHTML`, with no
  match. Verified (`grep`, 2026-11-26). No scanner was run on the whole Pixel Agents package,
  because none of it is installed or run.
- **Runtime check:** `app/aquarium-app-integration.test.js` runs the tab in real Electron and
  checks that nothing reaches the network.

## What Blue checks

Checklist step 55 (H1 trial part 2, the aquarium): with a few live panes, one creature per pane in
the right colour within about 2 seconds, and a click opens the pane.
