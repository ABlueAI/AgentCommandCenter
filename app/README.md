# Command Center (desktop app)

A one-click **dark launcher** that ties your agentic dev tools into a single window:
parallel **Claude / Codex / Gemini** agents running in **embedded terminals**, the
**Vibe Kanban** board, **VSCode**, and **GitHub** — each agent isolated in its own
git worktree. A BridgeSpace-style ADE built on proven tools.

## Run it
```powershell
cd D:\Workspace\agent-command-center\app
npm install      # first time only (pulls Electron + node-pty + xterm)
npm start
```
(Or double-click the **Command Center** desktop shortcut.)

## What it does
- **Repo picker** — scans your projects root (default `D:\Workspace`, change with 📁) for git repos.
- **Embedded terminals** — agents run *inside* the app: "+ New" creates an `agent/<task>`
  worktree (via `../scripts/new-agent.ps1`) and opens a real ConPTY terminal running your
  chosen CLI. The **Terminals** tab tiles them in a multi-pane grid (`+ Shell` for a plain shell).
  Agent cards also re-open a terminal, open VSCode, or remove the worktree.
- **Themes** — 5 dark themes (Obsidian, Void, Dracula, Nord, Synthwave) via the top-bar
  switcher; persists and re-themes live terminals.
- **Vibe Kanban** — the board button launches the installed standalone desktop app
  (resolved via saved path / Start Menu shortcut / common dirs, with a Locate fallback).
  *Not* embedded: vibe-kanban's hosted download server shut down with Bloop in 2026.
- **Quick launchers** — open the active repo in VSCode, its GitHub page, or a terminal.

## Architecture
- `main.js` — Electron main; **all** shelling-out + the `node-pty` ConPTY sessions live here
  behind IPC handlers (`pty-start/write/resize/kill`, `pty-data/exit`).
- `preload.js` — exposes a tidy `window.cc` API; renderer has **no** Node access (contextIsolation on).
- `renderer/` — `index.html` + `styles.css` (theme variable sets) + `app.js` (pure UI + xterm)
  + `vendor/` (vendored xterm.js / addon-fit / xterm.css).

## Terminal stack notes
- Uses **`@lydell/node-pty`** (prebuilt N-API ConPTY) — no native compile, loads in Electron.
  Stock `node-pty` fails to build on Windows (winpty `GetCommitHash.bat` bug).
- Agents launch via `powershell -ExecutionPolicy Bypass -Command <agent>` so npm `.ps1`
  shims always run. Each agent needs a one-time first-run login (`claude`, `codex`, `gemini`).

## Roadmap (remaining)
1. **Agent roles** — builder/reviewer/scout tags that pre-shape each agent's brief.
2. **Command-blocks** — Warp-style input/output blocks per agent.
3. **Agent coordination** — shared "mailbox" between agents.

> Git worktrees already give us BridgeSpace's "exclusive file ownership"
> (no two agents touch the same files) for free.
