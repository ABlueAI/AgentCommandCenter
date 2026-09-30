# Builder Handoff: Mako Windows taskbar identity

Branch: `codex/mako-taskbar-identity`

Fork-point SHA: `ba558ecd352f6dc2ecca54194a74a4f8ffb2c4ec`

Pre-merge main SHA: `ba558ecd352f6dc2ecca54194a74a4f8ffb2c4ec`

Tested application SHA: Pending (C2)

Review endpoint SHA (documentation only): Pending (C3)

Independent review: Pending (Full class)

Merge commit SHA: Pending until merge

## Status of this document

This is the **C1 pre-registration**. It commits no source change. It records the defect,
the confirmed facts, the hypotheses, the approved identity, the fixed eight-path cap, the
expected code shape and tests, the integrity pins predicted to stay unchanged, the smoke
procedure, and the stop conditions, all before any source edit.

This is branding maintenance, not a new subsystem. The OSS-first procurement gate is not
triggered: no dependency, SDK, service, or subsystem is introduced. H1 and the completed
controlled live fence qualification (`fence-live-d919942-20260929-e`) are complete and
**not reopened**.

## Defect

The zero-prompt branding smoke of merged main `ba558ec` (2026-09-30) failed on one surface.
The running unpackaged app's **Windows taskbar button shows the default Electron atom**.
The window/title-bar icon, header shark and wordmark, title, and restored/maximized layout
were all correct.

Evidence directory: `D:\Workspace\agent-command-center\outputs\mako-branding-smoke-20260930\`
(authenticated read-only at pre-registration):

| Evidence | SHA-256 |
| --- | --- |
| `smoke-result.json` | `EBB00875ECA850095AAEBEB214F30193AB39ECBB9E2D1DE7DC44A01527F85424` |
| `smoke-taskbar-screen.png` | `C4E7E1E3BF359D807D718CF5C133439CC4A8198D9647A74F68CAFDBA426DEF98` |
| `smoke-taskbar-active-button-zoom6x.png` (defect: atom) | `7A794330380BC2ED9A2EDBECB31DBCCFD7575C5FE1299EEC0DC5B419259D426A` |
| `smoke-window-icon-big-zoom8x.png` (passing: shark) | `1010ECE5AEA8D292EF800E306F70EDDAD3F9C1D98435334BC950EDB38D5D23F0` |

That smoke launched `app\node_modules\electron\dist\electron.exe .` directly with working
directory `app\` (`shortcutUsed: false`).

## Confirmed facts (read-only investigation at `ba558ec`)

1. `app/main.js` never calls `app.setAppUserModelId` or `win.setAppDetails`. Readiness is the
   unconditional `app.whenReady().then(` block; `createWindow()` is called only inside it, and
   `createWindow()` holds the app's only `new BrowserWindow(` construction.
2. `BrowserWindow` receives `icon: path.join(__dirname, 'assets', 'mako.ico')`, pinned by
   `app/mako-branding.test.js` together with the ICO's seven PNG frames.
3. Electron is 42.5.0 (installed). `app/package.json` has `name: "command-center"`, no
   `productName`, and `author: "ABlueAI"`. The app name determines `userData`
   (`%APPDATA%\command-center`, which holds the admission ledger). Neither may change.
4. Electron's `app.setAppUserModelId(id)` stores the ID and calls Windows
   `SetCurrentProcessExplicitAppUserModelID`. It does not rename the app or move `userData`.
   Without it, Electron derives `electron.app.<name>` lazily. The app uses no notifications,
   jump lists, recent documents, or overlay icons, which are the other AUMID consumers.
5. Microsoft's AppUserModelID guidance: a process-level ID must be set during the startup
   routine, before any UI is presented. A window-level ID overrides the process-level ID. An
   app using an explicit ID should apply the same ID to its shortcuts. The format is
   `CompanyName.ProductName[.SubProduct][.VersionInformation]`, no spaces, at most 128
   characters.
6. `C:\Users\levij\OneDrive\Desktop\Command Center.lnk` (1,496 bytes, SHA-256
   `98C8304EF53DE4B5C4DCD90A808981319D6DDCC36016F368D4B28CC52C3DF247`, mtime
   `2026-07-18T04:49:21.2450554Z`; unchanged by the read): target
   `D:\Workspace\agent-command-center\app\node_modules\electron\dist\electron.exe`, arguments
   `"D:\Workspace\agent-command-center\app"`, working directory
   `D:\Workspace\agent-command-center\app`, icon `...\electron.exe,0`, description
   `Blue Helm audio acceptance build 2026-07-16.2`, window style 1, no hotkey, and empty
   `System.AppUserModel.ID` / `RelaunchCommand` / `RelaunchIconResource` / `PreventPinning`.
7. No tracked script creates shortcuts. No Start Menu or pinned-taskbar shortcut exists for
   Electron, Command Center, or Mako.
8. Five suites evaluate the real `app/main.js` against a stubbed `electron.app` that lacks
   `setAppUserModelId`: `admission-main-startup`, `pty-start-authority-main`,
   `ensure-output-dir-lock`, `ensure-output-dir-uniqueness`, and
   `pane-status/pane-status-disclosure-route`. An unconditional new call throws `TypeError`
   in each of them unless its stub gains the method.
9. `launcher-fence-invariant.test.js` locates its three pinned regions by content anchors,
   after normalizing the source to LF. `admission-main-startup.test.js` requires the literal
   `^app\.whenReady\(\)\.then\(` startup shape.

## Hypotheses (unproven until the smoke)

- **H-A (primary).** An explicit process-level AppUserModelID set before any window makes
  Windows 11 stop resolving the window to `electron.exe`'s implicit identity. The taskbar then
  shows the window's own icon (the Mako shark) for a direct launch.
- **H-B (not authorized).** The taskbar additionally needs window-level relaunch details
  through `win.setAppDetails`.
- **H-C (future shortcut order).** A launch through the existing `Command Center.lnk`
  (icon `electron.exe,0`, no AUMID) may still show the shortcut's icon until that shortcut
  carries `ABlueAI.Mako` and the Mako icon.
- **H-D.** Windows 11 exposes the taskbar button's AppUserModelID in its UI Automation
  AutomationId (form `Appid: <id>`). This is recorded if present. The smoke does not fail
  solely because it is absent.

## Approved identity

`ABlueAI.Mako`, approved by Blue. It has no version segment, so upgrades keep the same
identity. It is independent of the `command-center` compatibility identity.

## Approved fixed eight-path cap

No ninth path may be edited. Work stops before touching one.

1. `app/main.js`
2. `app/admission-main-startup.test.js`
3. `app/pty-start-authority-main.test.js`
4. `app/ensure-output-dir-lock.test.js`
5. `app/ensure-output-dir-uniqueness.test.js`
6. `app/pane-status/pane-status-disclosure-route.test.js`
7. `app/mako-branding.test.js`
8. `docs/BUILDER-HANDOFF-mako-taskbar-identity.md`

Explicitly unchanged: the hook, roles, admission modules and behavior, PTY behavior,
role-fence behavior, ledger handling, `app/package.json`, `app/package-lock.json`, artwork,
the ICO, `.gitattributes`, the launcher-fence pins, and every shortcut.

## Expected code shape (C2)

Immediately after the last module `require` in `app/main.js` (the Quick Links policy import)
and before the layout-engine selection section, add a short comment and exactly:

```js
const MAKO_APP_USER_MODEL_ID = 'ABlueAI.Mako';
if (process.platform === 'win32') app.setAppUserModelId(MAKO_APP_USER_MODEL_ID);
```

The code has exactly one constant, one `process.platform === 'win32'` guard, and one call,
executed during module evaluation. That is before `app.whenReady()`, before `createWindow()`,
and before every `BrowserWindow` construction. It has no method-existence check. It adds no
`setAppDetails`, `setName`, `productName`, notification, jump-list, relaunch, or packaging
behavior.

Test stubs: `admission-main-startup` gains a recording `setAppUserModelId`. The other four
stubs gain a no-op `setAppUserModelId() {}` and nothing else.

## Expected tests (C2)

- **Exact value.** Source: exactly one `const MAKO_APP_USER_MODEL_ID = 'ABlueAI.Mako';`, and
  exactly one `setAppUserModelId(` call, whose argument is that constant. Evaluated:
  `admission-main-startup` records exactly `['ABlueAI.Mako']` per boot.
- **Uniqueness.** Exactly one call per module evaluation; exactly one `process.platform ===
  'win32'` guard around it.
- **Ordering.** Evaluated: at the moment of the call, the stubbed `app.whenReady()` has not
  been invoked and zero `BrowserWindow`s exist. Source: the call's offset precedes
  `app.whenReady().then(`, `function createWindow(`, and `new BrowserWindow(`.
- **Unchanged ICO.** The existing `icon: path.join(__dirname, 'assets', 'mako.ico')` and ICO
  frame assertions still pass.
- **Nothing else added.** No `setAppDetails`, `app.setName`, or `productName`; `package.json`
  `name` stays `command-center`.
- **Admission, role-fence, and PTY unchanged.** The full app chain and Pester match the
  measured pre-edit baseline with zero unexpected failures.

## Integrity pins predicted unchanged

`app/launcher-fence-invariant.test.js` pins at `ba558ec`. These are UTF-16 code-unit lengths
over LF-normalized source, with SHA-256 over UTF-8:

| Region | Length | SHA-256 |
| --- | ---: | --- |
| fenced-role cwd gate | 2,183 | `080893bcf88208575975d6cea67703c646b944e9495e625cf82d71520d7b93dc` |
| ptyEnv block | 217 | `8227036cb1ce84d0c32fd38ff4999c6db71a9625dc6beba26b9a85dd6bec5f08` |
| pty-start handler | 15,987 | `b47bba25ac869e5b9acf87d7bd6158f799df4a8f9cd2df5d8365ae7e07dc3d2c` |

Prediction: none moves. If any pin changes, work stops before any re-pin and reports it.

## Validation plan

1. **Baseline, before any source edit** (at C1): focused suites, the full `npm test` chain,
   and Pester. Record the actual discovered suite and assertion counts. Stop if the baseline
   is not green, unless the failure is a known, documented environment-dependent condition,
   explicitly distinguished.
2. **After C2:** `node --check` on every changed JavaScript file, then the affected focused
   suites, the full app chain, and Pester, compared with the baseline. Confirm zero unexpected
   failures, all launcher-fence pins unchanged, `package.json` unchanged (`name:
   "command-center"`, no `productName`), `userData` compatibility identity unchanged, no mixed
   line endings, and `git diff --check`.
3. **C2 is committed before the smoke.**

## Zero-prompt worktree smoke procedure

- Test infrastructure only: a gitignored `app\node_modules` directory junction to main's
  unchanged dependency tree, verified untracked.
- Pre-launch, authenticate the installed hook, the six roles, the ledger, `settings.json`,
  the existing shortcut, and the refs/status. Require zero `electron.exe` processes and no
  Process/User/Machine `BLUE_HELM_ADMISSION_*` value.
- Launch **once**, directly from this worktree with `electron.exe .` and working directory
  `<worktree>\app`, not through any shortcut. Strip only the shell-inherited Electron/IDE
  variables, as in the prior smoke. Set no admission variable, open no agent pane, and submit
  no provider prompt.
- **Require the taskbar button to display the Mako shark instead of the Electron atom.**
  Capture the full taskbar and a clearly labeled zoomed crop of the Mako button. Record the
  taskbar AutomationId if exposed.
- Carry forward the title, header, wordmark, and window-icon checks.
- Close normally (WM_CLOSE). Require every Electron process from the launch to exit.
- Post-launch, require the ledger, installed files, settings, shortcut, and repository
  invariants to be unchanged.

## Stop conditions

- The baseline is not green (other than a documented environment-dependent condition).
- Any launcher-fence pin changes: stop before re-pinning.
- A ninth path would be touched.
- **Mandatory smoke stop.** If the Electron atom still appears, record `FAIL — STOPPED`. Do not
  add `setAppDetails`, create a temporary shortcut, package the application, retry, or
  relaunch.

## Not authorized

`setAppDetails` (H-B); any shortcut mutation or rename; any temporary or scratch shortcut
(the optional B-leg); packaging; C4; performing the independent review; deployment; merge;
push; rebase; ledger alteration; opening an agent pane; provider prompts; cleaning evidence;
deleting a branch; rerunning H1.

## Later, separately authorized: shortcut work order (not part of this branch)

After this fix passes review and is merged, a separate order may rename
`Command Center.lnk` to `Mako.lnk`. It must preserve the target, arguments, working directory,
and window style. It would set the icon to `app\assets\mako.ico,0` and
`System.AppUserModel.ID = ABlueAI.Mako`, with a byte backup, a rollback, and a
launch-through-shortcut verification.

## Review class

**Full-class independent review.** The change is small, but it adds module-scope startup code
to `app/main.js` ahead of admission initialization, and it edits five harnesses that evaluate
`main.js` for admission, PTY-authority, and pane-status behavior.
