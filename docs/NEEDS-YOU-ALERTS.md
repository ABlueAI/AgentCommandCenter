# Needs-you alerts (S05)

Mako uses Electron's built-in Windows notifications. No extra package or Claude hook is installed.
Its existing pane-status setup must be enabled, and the Claude pane must have been launched after
setup so it carries the existing status binding. The toolbar/badge is the source of status; a
toast is an advisory reminder to look at the pane.

| Existing Claude hook | Badge | Windows toast |
|---|---|---|
| `Notification` | attention | Mako — Claude needs attention |
| `Stop` | turn ended | Mako — Claude turn ended |

`Notification` means Claude reported attention, which can include input/permission requests.
The existing privacy-preserving status protocol does not carry the notification's reason or text,
so Mako does not distinguish permission prompts from other Claude notifications. A turn ending
does not prove a task, subagent or process is finished. Failed/exited/unknown panes do not toast.

Expect two toasts for one turn sometimes (not yet verified on a real pane): Claude Code also sends
`Notification` when its input has been idle for about a minute, so a "turn ended" toast can be
followed about a minute later by a "needs attention" toast for the same pane. Mako keeps both,
because hiding the second one would also hide a real permission prompt after a turn ends.

Repeated state views and heartbeat updates do not repeat a toast. A new working/idle state re-arms
it for the next attention/turn-ended transition. Each pane deduplicates independently. State
changes, pane closure, hook removal and shutdown dismiss the retained toast. A status going stale
(about 2 minutes without a new hook event) leaves the toast in place, so it is still there when you
come back; it becoming fresh again does not replay it. Clicking a current toast restores/focuses Mako; inspect the pane
status badges to find the pane. Toasts contain only fixed text, never paths, task names or output.

Windows must allow notifications for Mako (or Electron when running from the source checkout).
Do not disturb can suppress banners. Mako already sets the Windows AppUserModelID
`ABlueAI.Mako` before opening a window; use the existing Mako shortcut. The pinned Electron
42.11.15 native notification presenter handles its per-user Start Menu shortcut and COM toast
activator registration for unpackaged apps; Mako adds no registration helper. OS support/delivery
failures appear in Mako's Logs. Electron's support check alone does not prove a toast appeared.
Linux/macOS notification delivery is outside this Windows feature's scope.

The **2-minute real-Claude-pane check** is [BLUE-CHECKLIST.md step 23](../BLUE-CHECKLIST.md).
Windows CI tests the notification boundary with a fake native API; it cannot verify the toast on
Blue's PC. That acceptance check is pending until Blue reports the build label and observed toasts.

## Phone alerts through Claude Remote Control

Phone alerts are provided by Claude Remote Control and Claude's mobile app, independently of
Mako's local Windows toasts. Mako does not forward terminal output, install another hook or hold
phone credentials. These instructions use your existing Claude account; availability and labels
depend on the installed Claude Code version and account. A displayed session is not proof of push
delivery.

1. On your phone, install/open the official Claude app and sign in to the same Claude account used
   in the Mako pane. Allow Claude notifications in the phone's OS settings.
2. In that **existing Claude conversation** inside Mako, run `/remote-control`. Open its displayed
   session link on the phone, or use its QR code if offered. Keep the PC awake, Mako running and
   the pane open. Remote Control runs the session on your PC; it does not move it to the cloud.
3. In Claude Code, open `/config` and enable **Push when Claude decides** for proactive reminders,
   **Push when actions required** for permission prompts/questions, or both. These are the two
   toggles documented in the official Remote Control guide; there is no per-event configuration.
   This does not promise a phone push for every Mako badge or Windows toast. Do not relax Claude's
   permissions to make a push appear.
4. Confirm the same conversation is visible on the phone. Ask Claude for a harmless test push,
   then background the mobile app and move focus away from the connected PC terminal: Claude
   suppresses pushes while that terminal is focused or you are typing in it. Check that the push
   arrives. If `/config` says **No mobile registered**, open the mobile app to refresh its token
   and reconnect Remote Control. Phone Focus modes/notification summaries and Android battery
   optimization can delay delivery. If a command, preference or delivery is unavailable, report
   that result and consult the current official setup/troubleshooting guide.
   Stop after about 2 minutes; do not buy or connect a new service for this check.

Phone connection/push delivery is **not verified** by the cloud tests. Checklist step 24 is
optional; S05's documentation obligation is this setup note, while the real Windows toast remains
an acceptance gate.

Sources: [official Remote Control guide](https://code.claude.com/docs/en/remote-control),
[official Claude Code changelog](https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md)
(documents `/remote-control`, mobile push notifications and the quoted preference), and
[Electron notifications](https://www.electronjs.org/docs/latest/tutorial/notifications).
