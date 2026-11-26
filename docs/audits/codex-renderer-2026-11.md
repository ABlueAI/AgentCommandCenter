# Renderer audit · November 2026

Reviewed `app/renderer/` on `main` at `1136f88a8f470a45c5065f1eeacde25bfd62243e`.

| Severity | Finding | File and line | User impact | Fix idea |
| --- | --- | --- | --- | --- |
| low | The command palette can focus the wrong agent | `app/renderer/app.js:1431` | If the worktree list refreshes while the palette is open, an agent command still shows the old name but can focus a different card at the old position. | Resolve the selected worktree by its stable identity when the command runs and show a notice if it was removed. |
