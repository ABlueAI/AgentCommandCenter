# Session memory (S08)

Mako keeps a record of each Claude pane it launches, so S09 can offer Resume
(`claude --resume <id>`) when Mako opens again.

## What is recorded

When Mako starts a Claude pane (a role pane such as builder or reviewer, or a bare `claude` pane),
main makes a new session ID and starts Claude Code with `--session-id <that ID>`. Claude Code uses
it as the conversation's ID, so Mako knows it without reading Claude's hooks or transcripts. Codex,
Gemini, Video Scout and plain shell panes are not recorded.

Each record has:

| Field | Meaning |
|---|---|
| `sessionId` | The Claude session ID Mako passed with `--session-id`. |
| `paneId` | The pane's ID in this Mako run (it changes between runs). |
| `role` | The role (`builder`, `reviewer`, ...), or `null` for a bare `claude` pane. |
| `cli` | Always `claude` for now. |
| `worktree` | The folder the pane started in. |
| `startedAt`, `stoppedAt` | UTC times. `stoppedAt` is `null` while the pane runs. |
| `stopReason` | `exited` (the process ended), `closed` (you closed the pane), `mako-closed` (Mako shut down with it open) or `unknown` (Mako found it still open at its next start, after a crash or a forced kill). |

## Where it lives

`session-memory.json` in Mako's settings folder: `%APPDATA%\command-center` for the stable copy,
`%APPDATA%\command-center-dev` for the dev copy (S07), so each copy has its own. It keeps the newest
200 records. It holds folder paths and session IDs, never prompts, output or keys.

If the file can't be read (for example it was edited by hand and is no longer valid), Mako leaves it
exactly as it is, records nothing, and says so once in the Logs tab and the error banner. Panes still
start. Delete or fix the file to start recording again.

## Limits

- The record is the session Mako started. If you type `/clear` in the pane, or exit Claude and run
  `claude` again in the same pane's shell, Claude starts a new session that this record doesn't
  know about.
- Claude Code deletes old transcripts after `cleanupPeriodDays` (30 days by default), so an old
  record may no longer resume. S09 documents this.
