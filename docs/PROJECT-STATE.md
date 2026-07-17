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
  AI Studio key). Set the key through the Command Center's in-app secure key setup — it persists
  via Electron `safeStorage` (DPAPI ciphertext on disk, decrypted only in main-process memory,
  injected only into the PTYs that need it). NEVER persist it with `setx`: a user-scoped env var
  is inherited by every process and readable from any Bash step/hook (see AGENTS.md §8).
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

## Security posture (audited 2026-06-30; re-ranked after external review)
Good: no secrets in repo (scanned); sandboxed renderer; validated command builders; scoped
mic-only permission; local audio processing.

**Done in the pre-test hardening pass (2026-06-30):**
- **Fence now fails CLOSED.** Launching web-scout/operator first calls `verify-fence` (main),
  which confirms the deployed `~/.claude/agents/<role>.md` has a real PreToolUse hook pointing at
  an existing `fence-write.js` (no `__CC_HOOK__` left). If not, the launch is **refused** — no more
  false sense of containment. (Was backlog #4; promoted to #1 — a fence you *think* is on is worse
  than none.)
- **Video path is shell-free + scoped.** The pasted URL is validated (`validateVideoUrl`: http(s)
  only, host allowlist `VIDEO_HOSTS`, rejects localhost / private + 169.254 metadata IPs) and passed
  to PowerShell as a discrete `-File` arg — never spliced into a `-Command` string, so no shell
  parses user input. yt-dlp itself is capped in `feed-gemini.ps1` (`--no-playlist`, `--max-filesize`,
  duration `--match-filter`). (Old backlog #1 shell:true concern, on the path that actually meets
  untrusted input.)
- **`open-external` scheme-validated** (http/https only) in main. (Was backlog #2.)

**Remaining backlog** (low-risk, not active exposures):
1. `launch()` still uses `spawn` `shell:true` for the fixed `code`/`wt` launchers with quoted
   *repo paths* (not free text). Lower risk than the video path was; revisit (the `.cmd` shims are
   why it's `shell:true`).
2. CSP trusts jsdelivr (script) + broad `connect-src https:` for the audio runtime/model — tighten
   by **vendoring ORT WASM + model weights locally** (custom protocol) for true offline + a scoped
   CSP. (Test: kill the network after first run; if audio still reaches jsdelivr, that's the gap.)
3. **Cross-CLI fence gap:** the PreToolUse fence is Claude-Code-only. The Gemini video-scout isn't
   covered by it — it's contained instead by running in `media/` under cwd with capped, allowlisted
   downloads; if Gemini ever gets a broad write/file role, it needs OS-level sandboxing, not the hook.
4. Re-validate `new-agent` `task` in main (defense-in-depth; renderer already slugifies).
5. Dedup the two in-page transformers.js copies (kokoro bundles its own).

## Roadmap to "iron clad"
- Run the hard-test pass (`SMOKE-TEST.md`); fix what it surfaces.
- Work the security hardening backlog above.
- Auto-speak — **needs an arbitration policy, not just `cleanText`** (audio is one channel, N agents):
  single global speech queue, **only the focused pane auto-speaks**; background panes that finish get a
  short chime or a queued one-liner ("Builder finished"), never read full scrollback over live speech.
- **Voice-per-role** (Builder=`am_michael`, Reviewer=another deep male, …) so you hear *who* is speaking;
  low effort, pairs with the focus policy above.
- STT: `whisper-small` helps, but set expectations — STT is for **dictating intent** to an agent, not
  exact identifiers/flags/paths (type those). Only add a correction pass if prose-level errors annoy.
- Coordinator role + Agent Teams (deferred until multi-agent dispatch is a real chore).
- Optional: package with electron-builder (real installer), app icon, observability.
- Future separate project: a local CUDA inference server (Kokoro-FastAPI + faster-whisper) as a
  reusable GPU hub.

## Key environment notes
- Windows 11, RTX 5080 (+ 3060 Ti). **Changes load on FULL APP RESTART** (preload/main/modules).
- Native modules in Electron are painful (use prebuilt `@lydell/node-pty`). Audio avoids natives
  entirely (WASM/WebGPU).
- `GEMINI_API_KEY` lives in the Command Center's in-app secure key store (Electron `safeStorage`;
  ciphertext-only on disk, injected per-PTY). Do NOT persist it via `setx` — if an old user-scoped
  key exists from earlier setups, remove it with
  `[Environment]::SetEnvironmentVariable('GEMINI_API_KEY', $null, 'User')`
  and then FULLY restart the app and any terminals (an inherited environment variable survives in
  every already-running process until restart). Node TLS fixed (`NODE_EXTRA_CA_CERTS` for the 2026
  LE root).
- **`yt-dlp` on PATH is a HARD dependency of the video-scout, including the SDK/YouTube route.** That
  route sends the URL straight to the Gemini API and downloads nothing, but it still runs a metadata-
  only `yt-dlp` probe (duration + is_live) as its ONLY pre-flight duration guard. Missing yt-dlp =
  the run is REFUSED by design (fail-closed), not silently skipped. Install: `winget install
  yt-dlp.yt-dlp`, then restart the terminal so PATH refreshes.
- **Tests.** Node side: `npm test` in `app/`. PowerShell side: `powershell -NoProfile -ExecutionPolicy
  Bypass -File scripts\run-pester.ps1` runs every `*.Tests.ps1` under `scripts/` and exits non-zero on
  any failure (requires the Pester module).
