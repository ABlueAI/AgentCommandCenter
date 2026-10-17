# Handoff: finish Mako 1.0 on Blue's PC

Written 2026-10-17 by the cloud session that built PR #27. Everything here needs Blue's Windows PC
(his files, his Claude transcripts, the real app), so it runs in a Claude Code session on that PC:
Claude Desktop, or `claude` in a terminal opened in `D:\Workspace\agent-command-center`.

## Paste this to start the session

> Read docs/handoff/FINISH-1.0.md, AGENTS.md, STATUS.md and docs/DECISIONS.md in
> D:\Workspace\agent-command-center and finish Mako 1.0 by following the handoff in order. Work at
> High authority (auto mode). Do step A now even if PR #27 is not merged yet. Ask me only where the
> handoff says "Blue". Don't delete anything, and don't merge or tag without my explicit OK.

## State when this was written

- PR #27 (`claude/youthful-heisenberg-sed4co`) holds the 1.0 release candidate: four fixes (status
  colors on current Claude Code, Shift+Enter, real build label and version 1.0.0, Vibe Kanban
  removed), Windows CI, merge guardrails, the new rulebook, the 1.1 plan and these docs.
- Windows CI on PR #27 is green: the full `npm test` chain and `run-pester.ps1` (983 passed, 0 failed).
  The October 2 taskbar record shows 984 on Blue's PC. Run `scripts\run-pester.ps1` once here and
  note the count; a one-test difference is expected to be machine-specific (none of PR #27 touches
  `scripts/`).
- Never rerun H1 or the timed shortcut scripts (see docs/DECISIONS.md).

## A. Recover the lost conversations (urgent: before about 2026-11-03)

Claude Code deletes transcripts 30 days after their last activity. The missing reviewer and builder
work is from the October 4 and 5 workday (possibly also October 16).

1. List candidate transcripts:
   ```powershell
   Get-ChildItem "$env:USERPROFILE\.claude\projects" -Recurse -Filter *.jsonl |
     Where-Object { $_.LastWriteTime -ge '2026-10-03' -and $_.LastWriteTime -lt '2026-10-08' } |
     Sort-Object LastWriteTime | Select-Object LastWriteTime, Length, FullName
   ```
   Repeat with `2026-10-15` to `2026-10-18`. For Codex: `Get-ChildItem "$env:USERPROFILE\.codex\sessions\2026\10" -Recurse`.
2. For each candidate, open it with `claude --resume` from the matching worktree folder, or read the
   JSONL directly. Find the reviewer findings and the builder task Blue described.
3. Save a short summary of what was recovered (task, findings, where it left off) to
   `outputs\recovered-2026-10\SUMMARY.md`. `outputs/` is not committed, which keeps it private.
4. **Blue:** confirm whether this is the missing work. If it was a task, it becomes an issue or a plan
   session.
5. Keep transcripts longer. Add `"cleanupPeriodDays": 365` to `%USERPROFILE%\.claude\settings.json`.
   Tell Blue the trade-off in one line: transcripts may contain whatever was typed into Claude.
6. Find why the app closed:
   ```powershell
   Get-WinEvent -FilterHashtable @{ LogName='System'; Id=1074,6008,41; StartTime='2026-10-03' } |
     Select-Object TimeCreated, Id, Message | Format-List
   ```
   Event 1074 with TrustedInstaller or "Operating System: Service pack" means a Windows Update restart;
   6008 or 41 means an unexpected shutdown. Report what you find.
7. **Blue (1 minute):** Settings > Windows Update > Advanced options > Active hours: set to your
   working hours, and turn on "Notify me when a restart is required".

## B. Run the release candidate (after Blue merges PR #27)

1. Fully close Mako: quit the app, not just the window.
2. ```powershell
   cd D:\Workspace\agent-command-center
   git switch main; git pull
   cd app; npm ci
   ```
3. Start Mako from the desktop shortcut.

## C. Three-minute smoke test (Blue, with the agent watching)

| Check | Expected |
|---|---|
| Toolbar label (Terminals tab) and window title | `Mako 1.0.0 · main@<commit>`, matching `git rev-parse --short HEAD` |
| First screen | Agents tab; no Board tab; no "Open Vibe Kanban" button |
| Open a Builder (Claude) pane; type text, press Shift+Enter, type more | A new line, not a send |
| Press Enter | The prompt sends |
| "Claude status" button in the Terminals toolbar | "on". If it says "off", click it once and choose Set up. |
| While Claude works, then finishes | Badge shows working, then turn ended (colored, not grey "unknown") |
| `claude --version` | Record it; above 2.1.241 means the tooltip says "unverified", which is expected |

If anything fails, open a fix PR before tagging. Don't patch `main` directly.

## D. Close out

1. Classify branches without deleting any. List them with `git branch -a` and `git worktree list`, and
   write `docs/BRANCHES-2026-10.md` with one line each: LANDED, SUPERSEDED, DEFERRED or ABANDONED.
   Known so far:
   - `codex/mako-personal-1.0-scope`: SUPERSEDED by STATUS.md and docs/RELEASE-NOTES-1.0.md.
   - `codex/mako-1.1-implementation-plan`: SUPERSEDED by docs/PLAN-1.1.md. Copy its
     `docs/RESEARCH-mako-1.1-2026-10-16.md` into `docs/research/`, because its tool cards are still
     useful.
   - `codex/docs-quick-check-roadmap`, `docs/release-2.0-game-plan`, `codex/chat-handoff-5`,
     `codex/chat-handoff-6`: DEFERRED (historical reference).
2. Update STATUS.md with the smoke result, the recovered-work result and the closure cause, in one PR
   with the TLDR.
3. **Blue:** say "tag 1.0". Then:
   ```powershell
   git tag -a v1.0.0 -m "Mako 1.0.0" <merged main commit>
   git push origin v1.0.0
   ```
   Optionally create a GitHub release from the tag using docs/RELEASE-NOTES-1.0.md.

## E. Then start 1.1

**Blue:** do docs/SETUP-GUARDRAILS.md Part A right after PR #27 merges, and Part B before the daily
runner starts. Then session S01 in docs/PLAN-1.1.md picks up from there.
