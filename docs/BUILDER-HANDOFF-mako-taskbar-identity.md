# Builder Handoff: Mako Windows taskbar identity

Branch: `codex/mako-taskbar-identity`

Fork-point SHA: `ba558ecd352f6dc2ecca54194a74a4f8ffb2c4ec`

Pre-merge main SHA: `ba558ecd352f6dc2ecca54194a74a4f8ffb2c4ec`

Tested application SHA: `64bb8086e552dc4f898f3860ce30a564b70cbf02` (C2, tree
`fa1bf087a73274f462621732a792ad03591419b8`)

Review endpoint SHA (documentation only): the C3 commit that adds the "C3" section below; its
SHA and the artifacts ending at it are reported outside this document.

Independent review: Pending (Full class). The builder validation below is not that verdict.

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

## C3: validation and smoke record (documentation only)

This section changes only this handoff. The tested implementation is C2
`64bb8086e552dc4f898f3860ce30a564b70cbf02` (tree `fa1bf087a73274f462621732a792ad03591419b8`,
parent C1 `1e8323b913f544881ecc847d28d50acb2fc200a7`). Everything above this section is the C1
pre-registration and is retained unchanged, except the header status fields.

### Scope held

Exactly the eight capped paths differ from `ba558ec`. C2 changes seven paths
(`79` insertions, `4` deletions):

| Path | Change |
| --- | --- |
| `app/main.js` | +10: the comment, the constant `MAKO_APP_USER_MODEL_ID = 'ABlueAI.Mako'`, and one `process.platform === 'win32'`-guarded `app.setAppUserModelId(MAKO_APP_USER_MODEL_ID)`, placed after the last `require` and before the layout-engine section |
| `app/admission-main-startup.test.js` | Recording stub (`setAppUserModelId`, `whenReadyCalls`), updated stub-surface comment, new section (8) |
| `app/pty-start-authority-main.test.js` | No-op `setAppUserModelId() {}` |
| `app/ensure-output-dir-lock.test.js` | No-op `setAppUserModelId() {}` |
| `app/ensure-output-dir-uniqueness.test.js` | No-op `setAppUserModelId() {}` |
| `app/pane-status/pane-status-disclosure-route.test.js` | No-op `setAppUserModelId() {}` |
| `app/mako-branding.test.js` | 11 new assertions (below) |

No `setAppDetails`, `setName`, `productName`, method-existence skip, notification, jump-list,
relaunch, or packaging behavior was added. `app/package.json`, `app/package-lock.json`,
`app/assets/`, `scripts/` (including the hook) and `agent-roles/` are byte-unchanged from
`ba558ec`. `package.json` still has `name: "command-center"` and no `productName`.

### Baseline (at C1, before any source edit)

- Full app chain: **97 suites**, i.e. 95 `N passed, M failed` summaries (7,375 passed) plus the
  two assertion-only suites (`audio-module-health`, `tts-audio-contract`, 9 each), for
  **7,393 passed, 0 failed**, exit 0. The discovered count equals the 97 `node` entries in
  `scripts.test`.
- Pester: **984 passed, 0 failed, 0 skipped**, exit 0 (109.84 s). The first Pester invocation
  never ran: a shell-quoting error dropped the path separator, and PowerShell reported that
  `scriptsrun-pester.ps1` does not exist (exit 127, no test executed). Its 250-byte log is retained;
  the corrected invocation is `baseline-pester-run2.log`.
- Relevant focused baselines: branding 52/0, admission-main-startup 101/0,
  launcher-fence-invariant 32/0, pty-start-authority-main 414/0, ensure-output-dir-lock 16/0,
  ensure-output-dir-uniqueness 17/0, pane-status-disclosure-route 156/0,
  dockview-default-path 380/0.
- No failure had to be excused. The `ensure-output-dir-lock` suite prints its established
  `.claude.json write FAILED (best-effort ...)` EPERM/EISDIR diagnostics (4 lines) from its
  deliberate failure-path cases in both baseline and post-change runs; they are not failures.

### Predicted failure confirmed, then corrected

With only `app/main.js` edited, the unpatched harnesses failed exactly as fact 8 predicted:
`ensure-output-dir-lock` threw `TypeError: app.setAppUserModelId is not a function`, and
`admission-main-startup` reported `main.js evaluates without throwing (threw:
app.setAppUserModelId is not a function)`. This is why the five stubs are in the cap.

### New assertions

`admission-main-startup` section (8) boots the real `main.js` under ABSENT, VALID and
MALFORMED (`allowance 300`) admission configurations. For each one it asserts: evaluation does not
throw; exactly one call per evaluation; the value is exactly `ABlueAI.Mako`; at the moment of the
call `app.whenReady()` had been invoked zero times and zero `BrowserWindow`s existed; readiness
and the single window still follow. That is 18 assertions (the platform branch runs on Windows;
off Windows the suite asserts zero calls).

`mako-branding` adds 11 assertions:

- the ICO SHA-256 is still
  `6411c345aff620ce4394b26294b1d9d9a5c30d7f7054f80d65416f14d4146154`;
- the Mako ICO `icon:` wiring occurs exactly once;
- the constant is declared once;
- exactly one `setAppUserModelId(` occurs, and it is the exact guarded call;
- the call is an unindented module-scope statement;
- the declaration precedes the call;
- the call precedes the first `app.whenReady().then(`, the first `function createWindow(`, and
  the first `new BrowserWindow(` (three assertions);
- there is no `setAppDetails`, `app.setName(` or `typeof app.setAppUserModelId`;
- there is no `productName` in `package.json`.

**Mutation check (not committed).** A temporary mutant moved the call into readiness after
`createWindow()`. It was killed by both suites: admission-main-startup failed its six ordering
assertions (104/15), and branding failed four (59/4). `app/main.js` was restored from a saved
copy and verified byte-identical (SHA-256 before and after) before any further test run.

### Validation after C2 (before commit)

- `node --check`: all seven changed JavaScript files pass.
- Focused: branding **63/0** (+11), admission-main-startup **119/0** (+18),
  launcher-fence-invariant **32/0**, ensure-output-dir-lock 16/0, ensure-output-dir-uniqueness
  17/0, pane-status-disclosure-route 156/0, pty-start-authority-main 414/0,
  dockview-default-path 380/0.
- Full app chain: 97 suites, 95 summaries at 7,404 plus 18, for **7,422 passed, 0 failed**, exit
  0. That is exactly the baseline plus 29 new assertions. A per-suite comparison of every summary
  line differs from the baseline only in `admission-main-startup` and `mako-branding`.
- Pester: **984 passed, 0 failed, 0 skipped**, exit 0 (identical to the baseline).
- **Launcher-fence pins: unchanged.** All three regions match their pinned length and SHA-256
  (the table in the pre-registration). No re-pin was needed or made.
- `git diff --check`: clean. Line endings: every changed source/test file is `i/lf w/crlf` with
  uniform CRLF and zero bare LF (for example, `app/main.js` has 1,664 CRLF and 1,664 LF). This
  handoff was authored with LF only (uniform) and is stored LF.
- The user-scope invariants (ledger, hook, six roles, `settings.json`, shortcut) were
  byte-, size- and mtime-identical across the baseline and post-C2 test runs.

### Zero-prompt worktree smoke: **PASS** at `64bb808`

- Test infrastructure: `app\node_modules` is a directory junction to
  `D:\Workspace\agent-command-center\app\node_modules` (gitignored by `app/.gitignore`; worktree
  status stayed empty). No install was performed. The junction is left in place for the
  reviewer's reruns.
- Pre-launch (enforced by the controller; it would have refused to launch on any mismatch):
  - main = origin/main = `ls-remote` = `ba558ec`, main status exactly `?? .worktrees/`;
  - worktree HEAD `64bb808` on `codex/mako-taskbar-identity`, status empty;
  - zero `electron.exe` processes, no Process/User/Machine `BLUE_HELM_ADMISSION_*`, no ledger lock;
  - exact SHA-256 required for the ledger (`1998F3AA…F9CA`), installed hook (`E21F28D5…5B09`), the
    six roles, `settings.json` (`064E3AB3…2440`), and `Command Center.lnk` (`98C8304E…F247`).
- Launched **once** at 2026-09-30T23:30Z (PID 20400):
  `<worktree>\app\node_modules\electron\dist\electron.exe .` with working directory
  `<worktree>\app`, `shortcutUsed: false`. Shell-only variables (including `ELECTRON_RUN_AS_NODE`
  and the Claude/VS Code variables) were stripped, and PATH came from the registry. No admission
  variable was set, no agent pane was opened, nothing was typed, and no provider prompt was sent.
- **Taskbar (primary check): the button shows the Mako shark** (black rounded square, cobalt
  shark, white fin/M accent) with the active indicator. The Electron atom is gone. This is
  confirmed by visual inspection of `smoke-taskbar-mako-button-zoom6x.png` and
  `smoke-taskbar-screen.png`.
- **AutomationId: `Appid: ABlueAI.Mako`** on the one new taskbar button (28 buttons before
  launch, 29 after; identified by an accessibility diff). This confirms H-D and that the explicit
  identity reached the shell.
- Colour census of the button (informative only): 4,752 pixels, 17 cobalt, 0 pale-cyan
  atom-like. The census is small because the icon occupies a fraction of the button at this DPI;
  the visual inspection is the verdict.
- Carried forward, all correct: the final title is `Mako — V5 STACK CONTENT ACCEPTANCE
  2026-07-21.14` (DPI 144). The restored header shows the shark and outlined wordmark. The window
  big icon (48×48) is the shark; its 8× crop is byte-identical to the previously passing
  `1010ECE5…3F0`.
- Shutdown: WM_CLOSE, main exit code 0. All four launch-tree processes (20400, 20128, 54388,
  31916) exited, with no survivors.
- Post-launch invariants all true: ledger (bytes, SHA-256, mtime), hook, six roles,
  `settings.json` and shortcut unchanged; no ledger lock; shortcut still present; main
  refs/status unchanged; worktree HEAD/status unchanged; no Electron remaining; no admission
  environment.
- Stderr is byte-identical to the prior smoke (`9BCF35BC…AD42`): only the three established
  audio-permission denial diagnostics. Stdout shows startup, worktree listing and Quick Links
  only; no pane, PTY or admission activity.

H-A is therefore **confirmed** for a direct launch. H-B (`setAppDetails`) was not needed and was
not attempted. H-C, launching through a shortcut, remains **untested by design**.

### Residuals

- **Taskbar display name.** The button's accessible/hover name is `Electron - 1 running window`.
  With no shortcut carrying `ABlueAI.Mako`, Windows takes the display name from `electron.exe`'s
  file description. This is not part of the pass criterion (icon) and needs no source change on
  this branch. It belongs to the separately authorized shortcut work order (a shortcut with
  `System.AppUserModel.ID = ABlueAI.Mako` supplies name and icon) or to packaging, neither of
  which is authorized here.
- **Launch through `Command Center.lnk`** (icon `electron.exe,0`, no AUMID) is not verified (H-C).
  It is to be covered by the shortcut work order's own verification.
- **Shared userData.** The smoke ran against the real `%APPDATA%\command-center` userData, as the
  prior smokes did. The ledger was proven unchanged.

### Evidence

Directory: `D:\Workspace\agent-command-center\outputs\mako-taskbar-identity-20260930\`

| Evidence | Bytes | SHA-256 |
| --- | ---: | --- |
| `baseline-npm-test.log` | 527,161 | `19576D850526F9CD03CC0E97E516DF69B456E1ABA4765BD1F77CA53D88064EE4` |
| `baseline-pester.log` (quoting error, no tests ran) | 250 | `D1359DB29F7FA3D81920734863FC6F30A23297C7D487C2AEB2269A7A57BC3AC0` |
| `baseline-pester-run2.log` | 150,115 | `3E586FE2F0CCA87F5B572FE247E7D930A9271A1B8B93B78BAB299D1B4464EB27` |
| `c2-focused.log` | 126,715 | `47E2E038FF349769A71BCB105A2BDCD48268A6247ED74C8E065901462EB8C71D` |
| `c2-npm-test.log` | 529,667 | `F9C747F28BEF6C366E7905523E227F42E4C2B9833B0BF81F3F9C1A8338CAFCB7` |
| `c2-pester.log` | 149,905 | `7541424919077A2B30C2336B3BC67C9BBE11D61A4EC99154CA420D07232A07FB` |
| `snapshot.ps1` | 2,407 | `9ED2978347F1F9C3A85EC881C1D1231DD2790A80B84548F888F411F9389E8570` |
| `snapshot-pre-baseline.json` | 4,428 | `FB20FDD528D52C8AC7A0A22D8C3E8F3B50A56C7B516F4084C5070F66E751E1B7` |
| `snapshot-post-baseline.json` | 4,429 | `E51C48594787E02F9D3B909055FADB9237F9950C7317EC18B8D5D754B167DE81` |
| `snapshot-post-c2-tests.json` | 4,903 | `B7D4385E46AE297F8D3A82D49A936E4EF1F5E8001CBE11504F48BFC99F170C4F` |
| `smoke.ps1` | 20,826 | `18420944F7A964AE2CEE1D288D8B3579F84EF905A915EC9F162A1688F827CFE7` |
| `smoke-result.json` | 22,784 | `8F2B8E42FB40C6789A94B25724AA94D81F186C3E2244CD257952E6AE05D1BFA4` |
| `smoke-prelaunch-snapshot.json` | 4,339 | `8A66995186AE2CEE9AC55C740F43E7DBB05EFFD4DEF8616FD1CB20987E81F624` |
| `smoke-taskbar-screen.png` | 105,605 | `A25E2AF1067D25E975E50F2434E759E8A5D9B83B8711628F858A60DF7CEAD0BE` |
| `smoke-taskbar-mako-button-zoom6x.png` | 23,782 | `643DF08A66D021D7EC671107CCE60DD25B5ED3D5DF7E5178A437DB96A31A27EC` |
| `smoke-taskbar-buttons.json` | 23,283 | `8F423393943AFA52465987C3011450D5B24FD8C56A2D8ECD7C5DA12F5C68075E` |
| `smoke-restored-window.png` | 113,312 | `5506A4E2BF311A45E84BC5871B32D663B6C0A9F31F616676CDEE67F5A0E25BFA` |
| `smoke-restored-header-zoom3x.png` | 43,661 | `13050EF7BAD2304CB61BAE7A6F27B867D4DB7648CB8872D3478B1303BEFD8EE5` |
| `smoke-restored-logo-zoom6x.png` | 24,473 | `E6B00561D211E2A4EBFFF333788EFA1E3596954FD787B89E4B0A241E0BBA0810` |
| `smoke-window-icon-big-zoom8x.png` | 9,834 | `1010ECE5AEA8D292EF800E306F70EDDAD3F9C1D98435334BC950EDB38D5D23F0` |
| `smoke-window-icon-small-zoom8x.png` | 3,722 | `A19AABC438DFB5548B15DA98E8B04372F3BB6241A495CCEBC07B23B2A27B08E6` |
| `smoke-electron-stdout.log` | 290 | `1E005B895C8C129A98BD212DAD734B3B34A595AD6AED5A29841C3BAA8B2B639F` |
| `smoke-electron-stderr.log` | 174 | `9BCF35BC732729CB4E353267459D7B74A8DD639CCBC2558B168A76924996AD42` |

`smoke-taskbar-buttons.json` records the accessible names of the other taskbar buttons present
at the time (read-only).

### Status

| Item | Status |
| --- | --- |
| Independent Full-class review | **Pending**; work order issued outside this document |
| C4 | Not created |
| `setAppDetails`, packaging, temporary/B-leg shortcut | Not authorized; not performed |
| Shortcut mutation or rename | Not authorized; `Command Center.lnk` unchanged (`98C8304E…F247`) |
| Deployment, merge, push, rebase | Not authorized; not performed |
| Ledger | Unchanged (`1998F3AA…F9CA`, 1,477 bytes, mtime `2026-09-29T05:06:09.7112180Z`) |
| H1 and the controlled live fence qualification | Complete; **not reopened** and not rerun |
| `main` | Unchanged at `ba558ecd352f6dc2ecca54194a74a4f8ffb2c4ec` |
