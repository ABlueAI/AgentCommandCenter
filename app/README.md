# Command Center (desktop app)

A one-click **dark launcher** that ties your agentic dev tools into a single window:
the **Vibe Kanban** board (embedded), **VSCode**, **GitHub**, and parallel
**Claude / Codex / Gemini** agents — each isolated in its own git worktree.

This is the **v1 "layered hub"** (Electron chassis that orchestrates proven tools).
It's deliberately built to grow into the full BridgeSpace-style ADE (see Roadmap).

## Run it
```powershell
cd D:\Workspace\agent-command-center\app
npm install      # first time only (pulls Electron)
npm start
```

## What v1 does
- **Repo picker** — scans your projects root (default `D:\Workspace`, change with 📁) for git repos.
- **Quick launchers** — open the active repo in VSCode, its GitHub page, or a terminal.
- **Vibe Kanban, embedded** — "Start Vibe Kanban" runs it locally and loads the board *inside* the app (auto-detects the localhost URL; manual URL box as fallback).
- **Agents** — "+ New" creates a `agent/<task>` worktree (via `../scripts/new-agent.ps1`) and launches your chosen CLI (Claude/Codex/Gemini) in its own Windows Terminal tab. Each agent card can re-open a terminal, VSCode, or be removed.

## Architecture (so the next session can extend cleanly)
- `main.js` — Electron main; **all** shelling-out (git, wt, code, npx, browser) lives here behind IPC handlers.
- `preload.js` — exposes a tidy `window.cc` API; renderer has **no** Node access (contextIsolation on).
- `renderer/` — `index.html` + `styles.css` (dark theme, tunable `--accent`) + `app.js` (pure UI).

## Roadmap → full-custom (next session)
The gap to BridgeSpace, in priority order:
1. **Embedded terminals** — replace the external Windows Terminal launch with in-app
   panes via `xterm.js` + `node-pty` (needs `electron-rebuild`; the one Windows-native risk).
2. **Multi-pane grid** — tile N agent terminals in one window (their "up to 16" feel).
3. **Command-blocks** — Warp-style input/output blocks per agent.
4. **Agent coordination** — shared "mailbox" + roles (builder/reviewer/scout).
5. **Theme engine** — multiple dark themes beyond the single Obsidian-teal default.

> Note: git worktrees already give us BridgeSpace's "exclusive file ownership"
> (no two agents touch the same files) for free.
