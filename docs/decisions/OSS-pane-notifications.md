# S05: pane notifications

2026-10-20. Choice: **ADOPT** Electron's built-in main-process `Notification` API.

Blue's direction, verbatim:

> Before adding any notification library, follow AGENTS.md "OSS first": prefer Electron's built-in Notification API, and record the choice.

This implements that preference; it is not a claim that Blue has approved the PR.

Options considered:

| Option | Fit | Choice |
|---|---|---|
| Electron `Notification` | Already maintained with our pinned Electron; native Windows toast, support check, delivery-failure event, click event. | ADOPT |
| `node-notifier` | Maintained open-source wrapper, but adds a dependency and platform helper executables for an API Electron already supplies. | Not needed |
| PowerShell/WinRT toast helper | Adds another executable path and packaging/quoting work to the status-event path. | Not needed |

Use the existing validated pane-status views in main. Add no Claude hook, wire field,
renderer notification command, terminal-output parser, external service or credential.
Notification text is fixed: no transcript, task name, repository path or provider payload.
Repeated views/heartbeats produce no extra toast; leaving an alert state dismisses it.
Clicking a toast only restores/focuses Mako. OS delivery failure is reported in Logs.
Windows settings and Do not disturb may suppress delivery; Blue's real-pane acceptance
check remains required. Phone delivery belongs to Claude Remote Control, documented separately.

References: [Electron Notification API](https://www.electronjs.org/docs/latest/api/notification),
[Windows notification prerequisites](https://www.electronjs.org/docs/latest/tutorial/notifications#windows).
Implementation checked against the pinned [Electron 42.11.15 API documentation](https://github.com/electron/electron/blob/v42.11.15/docs/api/notification.md).

Windows registration is delegated to the adopted API: the pinned runtime's
[toast activator](https://github.com/electron/electron/blob/v42.11.15/shell/browser/notifications/win/windows_toast_activator.cc)
registers its per-user Start Menu shortcut and COM activator for unpackaged applications.
Flag that native OS integration for the independent review; add no custom registration code.
