# Mako 1.0 release notes

Status: **release candidate** (PR #27). Becomes final when Blue merges PR #27 and approves the `v1.0.0`
tag.

## What Mako 1.0 is

Blue's personal Windows command center for running Claude Code, Codex and Gemini agents in parallel,
each in its own git worktree, on his existing primary workstation.

## What's in it

- **Agents in-app:** terminal panes (ConPTY) for Claude, Codex, Gemini and shells, in a dockable,
  resizable layout (Dockview), with fixed agent roles (Builder, Reviewer, Scouts, Operator) and fenced
  read access for read-only roles.
- **Pane status:** a colored badge per Claude pane (working, needs you, turn ended, failed, exited,
  unknown). Works on Claude Code 2.1.228 and later 2.x releases; versions newer than the tested ones are
  marked unverified in the "Claude status" tooltip.
- **Voice:** dictation into the focused pane (Whisper) and read-aloud (Kokoro TTS).
- **Video Scout:** Gemini video analysis with reports, follow-up questions and a Library.
- **Quick Links:** one-click links to daily business tools.
- **Credentials:** API keys stored with Electron safeStorage and injected only into the panes that
  need them. Claude panes run with subprocess environment scrubbing.
- **Identity:** Mako name, icon, taskbar identity and desktop shortcut.

## New in the release candidate

- Pane status colors now appear on current Claude Code versions (previously only two exact versions
  from August were accepted, so every badge showed "unknown").
- **Shift+Enter** inserts a newline in Claude panes. Plain Enter still sends.
- The toolbar and window title show the real build (for example "Mako 1.0.0 · main@abc1234"), plus
  "+ local edits" when the checkout has uncommitted changes. This replaces the static July label.
- The Vibe Kanban board is removed (its maker shut down in April 2026). Mako opens on Agents.
- Windows CI runs the app and PowerShell test suites on every pull request.

## Known limitations

- **Leftover processes:** closing a pane or Mako can occasionally leave claude.exe or node.exe running
  in the background. If you notice it, end them in Task Manager > Details. Fix planned in 1.1 (S06).
- **No session restore:** reopening Mako does not reopen previous conversations. Use `claude --resume`
  in the worktree folder. Built-in resume is planned in 1.1 (S08, S09).
- **Claude Code deletes transcripts after 30 days by default** (`cleanupPeriodDays`).
- **Pane status covers Claude only**, not Codex or Gemini.
- **Personal workstation only:** no claim that Mako installs cleanly on a new machine. Newcomer
  install, restore testing and Blue's brother's install are 1.1 or later work.
- **Unsigned build:** Windows Smart App Control must be off to run it (Defender stays on).
- **Backups are manual** (the August restic drill); no scheduled or off-site backup.
- **Dependency advisories:** `npm audit` reports 11 (5 moderate, 6 high), mostly in the speech stack's
  dependencies (`tar`, `sharp`/libvips). Mako does not process untrusted archives or images through
  them. Fix planned in 1.1 (S02) with voice regression checks.
- **Electron test flake history:** one Electron-launch test suite has failed intermittently on some
  machines (docs/AUDIT-app-gate-reliability.md). CI results are the reference.

## Upgrading

Fully close Mako (not just the window), pull `main`, run `npm ci` in `app/` if dependencies changed,
then start it from the desktop shortcut. The toolbar shows which commit is running.
