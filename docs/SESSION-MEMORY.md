# Session memory (S08, S09)

Mako keeps a record of each Claude pane it launches, so it can offer Resume
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
| `stopReason` | `exited` (the pane's shell exited; quitting Claude alone leaves the shell running, so the record stays open), `closed` (you closed the pane), `mako-closed` (Mako shut down with it open) or `unknown` (Mako found it still open at its next start, after a crash or a forced kill). |

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
  record may no longer resume. "Transcript retention" below says more.

## Resume or Start fresh (S09)

When Mako starts, it looks for the Claude panes that were still open when it last went away:
records stopped as `mako-closed` (you closed Mako) or `unknown` (Mako stopped unexpectedly). If
there are any, the top of the Terminals tab lists them, one row each, with the role, the folder and
when Mako closed:

- **Resume** opens the same role in the same folder and runs `claude --resume <sessionId>`, so the
  conversation continues where it was. The pane starts at the authority level picked now. At
  Maximum, Resume does nothing and says so in the Logs tab, because Maximum starts no local Claude
  pane.
- **Start fresh** opens the same role in the same folder with a new conversation.
- **Not now** (or **Dismiss**, on a row whose folder is gone) stops offering them.

Only the newest batch is offered: all the panes from the last time Mako closed with Claude panes
open. Older ones are not offered again. A resumed pane is recorded again under the same session ID
(Claude Code keeps it when resuming), so if it is still open the next time Mako closes, it is
offered again.

Main decides what may be offered (`app/session-resume.js`) and checks every Resume again before
starting anything. The pane must be the same kind (the same role, or a bare `claude` pane) in the
same folder as the record, with no opening prompt, and the session must not already be running in
another pane. The ID that reaches `--resume` is main's own copy from `session-memory.json`, never
the value the window sent. A refused Resume starts nothing and shows `Resume refused [<reason>]` in
the Logs tab and the error banner.

Fenced roles (web-scout, operator, source-scout) are never offered. They are one-shot research
panes with a new outputs folder each run, and resuming one would carry web content from an old run
into a new one.

The record file gains one optional field, `offered: true`, set when you choose Start fresh, Not now
or Dismiss, or when a newer batch replaces the record's. S08's copy of Mako ignores it.

## Transcript retention (`cleanupPeriodDays`)

Resume works only while Claude Code still has the conversation's transcript. Claude Code deletes
transcripts older than `cleanupPeriodDays`, a setting in `~/.claude/settings.json`; the default is
30 days. Mako doesn't read or change it. A row for a session that stopped more than 30 days ago
says the conversation may have been deleted. If it has, `claude --resume` says it can't find the
conversation and the pane is left at a PowerShell prompt in that folder; close it and use Start
fresh. To keep transcripts longer, raise `cleanupPeriodDays` in `~/.claude/settings.json`, for
example `"cleanupPeriodDays": 90`.

Transcripts live under `~/.claude/projects/`, in a folder named after the worktree's path, which
is why Resume must run in the same folder.
