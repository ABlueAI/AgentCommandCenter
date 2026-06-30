# Agent Command Center — Project State (2026-06-30)

> Portable snapshot to brief a fresh chat / pick up the build. Keep it current.

## What it is
A self-hosted, dark "mission control" Electron desktop app (Windows 11) that runs multiple AI
coding agents (Claude Code, Codex, Gemini) in parallel, each in its own git worktree, inside one
window. Built from owned tools — no paid agent platform. The agent role system is codenamed
**Blue Helm**. Repo: github.com/ABlueAI/AgentCommandCenter, local `D:\Workspace\agent-command-center`.

## Architecture (no build step; vanilla JS + vendored libs)
- **app/main.js** — Electron main: owns the window, all shell-outs, and the node-pty
  (`@lydell/node-pty`, ConPTY) terminal sessions, behind IPC handlers. Validates every shell
  command against allowlists.
- **app/preload.js** — the only renderer surface: a small `window.cc` bridge (`contextIsolation`
  on, `nodeIntegration` off).
- **app/renderer/** — pure UI: `index.html`, `styles.css`, `app.js` (xterm + UI), `tts.js` +
  `stt.js` (ES-module audio engines), `vendor/` (xterm + addons, `kokoro.web.js`,
  `transformers.web.min.js`).
- **scripts/** — worktree helpers (new/list/remove-agent), `feed-gemini.ps1`, `sync-roles.ps1`,
  `hooks/fence-write.js`.
- **agent-roles/** — the 5 role `.md` definitions (canonical source), deployed by `sync-roles.ps1`
  to `~/.claude/agents/` (user scope = available in every project).
- **One agent = one PTY = one worktree + `agent/<task>` branch.** Discipline: plan → review →
  test → **HUMAN MERGE GATE**; no role auto-merges.

## Built & merged (PRs #1–#19, all on main)
- **Roles (Blue Helm):** builder, reviewer, codebase-scout, web-scout, operator. Launched via
  `claude --agent <role>`; frontmatter = identity (tools allowlist, color, model/effort), launch
  flags = per-task routing (builder "Hard task" → opus/xhigh). Read-only enforced by the tools
  allowlist. Picker in the New-Agent modal + Review/Scout buttons on agent cards.
- **Reviewer diff-injection:** launcher runs `git diff main`, writes `.agent-review.diff`, points
  the read-only reviewer at it.
- **Video-scout (🎥):** yt-dlp downloads a video → Gemini analyzes (visual+spoken). Gemini is the
  only model with native video. Uses `GEMINI_API_KEY` (Google killed the free CLI sign-in; use an
  AI Studio key via `setx`).
- **Write-fencing:** web-scout/operator run in a dedicated sandbox dir and a PreToolUse hook
  (`fence-write.js`) HARD-DENIES any write outside it. Enforced only after `sync-roles.ps1` runs.
- **Terminal hardening:** real clipboard (Ctrl+C smart copy / Ctrl+V paste / right-click / OSC 52),
  ResizeObserver fit (panes tile correctly), web-links (clickable URLs), unicode11, WebGL renderer.
  Mirrors VS Code / Wave behavior. Crash fix (Win err 267 on worktree reuse).
- **Audio (in-app, WebGPU on the RTX 5080, NO Python/server):**
  - **TTS** = Kokoro-82M via `kokoro-js` — select text → 🔊 speak; voice picker (deep males,
    default `am_michael`), speed; `cleanText()` strips terminal noise.
  - **STT** = `whisper-base.en` via transformers.js — 🎤 push-to-talk types the transcript straight
    into the focused pane via `ptyWrite` (the app owns the channel; no Win+H needed).
  - All processing is **local**; only the public models download once from HF (then cached). ORT
    WASM is fetched from jsdelivr at runtime.

## Status
Feature-complete through the planned roadmap. Everything testable headlessly is verified (command
builders, fence logic, `cleanText`, all syntax). The audio (WebGPU/mic/playback) and the live
agent flows need a human test pass — see `SMOKE-TEST.md`.

## Security posture (audited 2026-06-30)
Good: no secrets in repo (scanned); sandboxed renderer; validated command builders; scoped
mic-only permission; local audio processing. **Hardening backlog** (low-risk, not active exposures):
1. `launch()` uses `spawn` `shell:true` with quoted paths (open-vscode/open-terminal) — drop `shell:true`.
2. `open-external` should scheme-validate (http/https) in main (the web-links caller already does).
3. CSP trusts jsdelivr (script) + `connect-src https:` for the audio runtime/model — future: serve
   vendored ORT WASM via a custom protocol for full offline + tighter CSP.
4. Write-fence fails **open** if `sync-roles.ps1` wasn't run — make it verify / fail-closed.
5. Re-validate `new-agent` `task` in main (defense-in-depth; renderer already slugifies).
6. Dedup the two in-page transformers.js copies (kokoro bundles its own).

## Roadmap to "iron clad"
- Run the hard-test pass (`SMOKE-TEST.md`); fix what it surfaces.
- Work the security hardening backlog above.
- Auto-speak (read new scrollback lines through `cleanText`) once speak-selection is tuned.
- STT accuracy: `whisper-small` for code identifiers; maybe a custom-vocab/correction pass.
- Coordinator role + Agent Teams (deferred until multi-agent dispatch is a real chore).
- Optional: package with electron-builder (real installer), app icon, observability.
- Future separate project: a local CUDA inference server (Kokoro-FastAPI + faster-whisper) as a
  reusable GPU hub.

## Key environment notes
- Windows 11, RTX 5080 (+ 3060 Ti). **Changes load on FULL APP RESTART** (preload/main/modules).
- Native modules in Electron are painful (use prebuilt `@lydell/node-pty`). Audio avoids natives
  entirely (WASM/WebGPU).
- `GEMINI_API_KEY` set via `setx`. Node TLS fixed (`NODE_EXTRA_CA_CERTS` for the 2026 LE root).
