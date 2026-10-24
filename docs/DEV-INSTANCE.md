# Stable and dev copies of Mako (S07)

Blue keeps using the **stable** copy while agents change Mako and try their changes in a **dev**
copy. The two run side by side on the same Windows account without touching each other's state.

## Starting each copy

- **Stable:** as today, `npm start` in `app` (or the desktop shortcut). Nothing about it changed.
- **Dev:** from a second checkout of this repository (a git worktree is enough), `npm ci` in its
  `app` folder once, then `npm run start:dev` there (the same as `npm start -- --dev-instance`).

```powershell
# once, from your stable checkout (pick any folder for the dev copy). --detach because main is
# already checked out in your stable checkout, and git won't check out one branch twice.
git fetch origin
git worktree add --detach ..\AgentCommandCenter-dev origin/main
cd ..\AgentCommandCenter-dev\app
npm ci
# every time
npm run start:dev
```

To try an agent's branch in the dev copy: `git fetch origin`, then in the dev folder
`git switch --detach origin/<branch>`, `npm ci` in `app` if `package-lock.json` changed, and
restart the dev copy.

The dev window's title and build badge read `Mako (dev) 1.0.0 · <branch>@<commit>`, and Windows
gives it its own taskbar button.

## What the dev copy keeps separate

The flag is read once, in the main process, from its own command line (`app/instance-profile.js`).
Nothing the renderer or a saved setting does can change which copy a window is.

| State | Stable | Dev |
|---|---|---|
| Settings folder (Electron `userData`): `settings.json`, the encrypted keys in `secure.json`, Quick Links, the pane layout, pane-status records, the admission ledger | `%APPDATA%\command-center` (unchanged) | `%APPDATA%\command-center-dev` |
| Windows taskbar identity (AppUserModelID) | `ABlueAI.Mako` (unchanged) | `ABlueAI.Mako.Dev` |
| Claude Code hooks (pane status in `%USERPROFILE%\.claude\settings.json`) | set up and removed from the Terminals toolbar, as today | **never** installed, removed or changed: the toolbar shows "Claude status: off (dev copy)" with no button, no status listener opens, and panes show no status |

Because the settings folder is separate, the dev copy starts with defaults: the default projects
root (`D:\Workspace`, the same as the stable copy's default; change it in the dev copy if you want
them apart), no Quick Links edits, and no stored Gemini key or `ABlueAgent` token. The stable copy's
keys are never read by the dev copy.

**Save the `ABlueAgent` token in the dev copy too** (its 🐙 banner, as in checklist step 35).
Without it, agent panes in the dev copy use **your own** git and gh login, which S06 exists to
avoid: an agent running as `ABlueAI` could approve its own PRs. Store a Gemini key there only if the
change you are testing needs it.

## What the two copies still share

These are outside Mako's settings folder, so both copies use them.

- **Your Windows git and gh logins** (Credential Manager, `gh auth`): any pane that isn't an agent
  pane with the `ABlueAgent` token uses them, in either copy (see above).
- **The Claude Code hooks the stable copy installs** in `%USERPROFILE%\.claude\settings.json`. They
  fire for Claude in dev-copy panes too, but do nothing there: the reporter exits at once in a pane
  without the pane-status environment, which only the stable copy gives its panes.
- **Your repositories and the projects root folder** (both start on `D:\Workspace`),
  including fenced roles' `<projectsRoot>\.command-center\outputs` sandboxes. Two panes working on
  the same worktree at once can still step on each other, as two panes in one copy can.
- **`%USERPROFILE%\.claude.json`**: both copies pre-trust new sandbox folders there. Each copy
  serialises its own writes, but the two copies don't coordinate, so two sandbox launches at the
  same instant could drop one trust entry. The launch still goes on; the cost is one Claude Code
  "trust this folder?" prompt.
- **The deployed fence hook** `%USERPROFILE%\.claude\hooks\fence-write.js` and role files: both
  copies only read them (`scripts/sync-roles.ps1` deploys them, not Mako).
- **Video Scout's run root** (`D:\Gemini_Video_Review\downloads`, docs/INSTALL-WINDOWS.md).

## Checks

- `app/instance-profile.test.js`: flag selection, both profiles, the inert pane-status controller,
  and that `main.js` moves the settings folder before anything reads it and builds the real
  pane-status controller only for the stable copy.
- `app/build-info.test.js`: the `(dev)` label. `app/mako-branding.test.js`: the stable taskbar ID is
  still `ABlueAI.Mako`.
- On Blue's PC: BLUE-CHECKLIST.md step 38 (both copies open at once, separate settings, hooks
  untouched, the dev copy's agent panes on `ABlueAgent`).
