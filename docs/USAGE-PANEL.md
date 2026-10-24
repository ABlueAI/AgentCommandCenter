# Usage panel (S11)

Mako's top bar shows how much of the Claude plan's two usage limits is used, the 5-hour window and
the weekly window, each with a countdown to its reset. At 90% of either it turns red and says to
pause the runner. **Pause runner** opens https://claude.ai/code/routines, where the runner routine
is switched off and on (docs/RUNNER.md).

## Where the figures come from

Claude Code passes plan usage to its **status line** command: `rate_limits.five_hour` and
`rate_limits.seven_day`, each with `used_percentage` (0 to 100) and `resets_at` (Unix epoch
seconds). They appear "only for claude.ai Pro and Max subscribers ... and only after the first API
response in the session" (https://code.claude.com/docs/en/statusline). These are the same figures
`/usage` shows.

1. Blue sets `statusLine` in `%USERPROFILE%\.claude\settings.json` once (BLUE-CHECKLIST.md step 41)
   to run `node "<Mako>/app/usage/usage-statusline.js"`. The panel's **Set up** button copies the
   exact line, with this copy's path.
2. After each Claude reply, in any local Claude Code session (in Mako or not), Claude Code runs that
   script. It reads the two windows and nothing else from the session data (no session ID, folder,
   transcript path, model or cost), and writes them to `%LOCALAPPDATA%\Mako\usage.json` with an
   atomic replace. It prints a short line, for example `usage 5h 42% · week 18%`, which becomes that
   session's status line. A failure prints a reason code there instead, such as
   `usage: not saved (EPERM)`.
3. Mako's main process reads that file (at most 4 KB, validated numbers only) on the `usage-read`
   channel, behind the same trusted-sender check as the other privileged channels. The panel polls it
   every 30 seconds.

One file per Windows user: usage belongs to the claude.ai account, so the stable and dev copies
(S07) show the same figures.

## What the panel shows

- `5h 42% · 1h 12m` and `Week 18% · 2d 4h`: used, and time to reset.
- `reset`: the window's reset time has passed; new figures come with the next Claude reply.
- `as of 40m ago`: the newest figures are more than 15 minutes old (no Claude reply since).
- `Not set up`: no usage file yet. Click **Set up** and follow step 41.
- `Usage unavailable (<reason>)`: the file couldn't be read or isn't valid; the Logs tab has the
  reason once.
- Red with `⚠ 90%+ used: pause the runner`: either window is at 90% or more. The Logs tab records it
  once per window.

## Choices and limits

- **No claude.ai login in Mako.** The plan says Pause and Resume may toggle the routine only "if
  that can be done safely (no claude.ai login stored in Mako without its own sensitive review)".
  Toggling a routine needs Blue's claude.ai session, so the button opens the routines page instead.
  No cookie, token or login is read or stored.
- **Why not ccusage.** ccusage (https://github.com/ryoppippi/ccusage) adds up token counts from the
  local transcript files. It estimates usage from those counts rather than reading the plan's own
  percentages, so it can't be relied on to match `/usage`, and it reads transcript files, which hold the
  conversation. Claude Code's own status-line fields need neither.
- **No new subsystem dependency.** This uses Claude Code's documented status line and Node, which
  Mako already needs; no OSS record was written (AGENTS.md "OSS first" covers new subsystems).
- **Your own status line.** `statusLine` is one setting, so this replaces any status line you
  already have. If you have one you want to keep, ask an agent to combine the two in one script.
- **Figures lag by up to one reply.** They update when a Claude session gets a reply; with no Claude
  session running, the panel shows the last figures and their age.
- **Cloud sessions** (the runner) don't update it: they run on Anthropic's machines, not Blue's PC.
  Their usage still counts, and shows the next time a local session replies.
- If `disableAllHooks` is set, or managed settings allow only managed hooks, Claude Code runs no
  custom status line and the panel stays at its last figures (same docs page, "Troubleshooting").
