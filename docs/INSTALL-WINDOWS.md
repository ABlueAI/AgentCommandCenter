# Blue Helm — Windows Source-Tree Installation Guide

## 1. Scope and honesty

This guide installs and runs **Blue Helm from a Git checkout of this repository**.
You clone the repo, install `app/` dependencies from the tracked lockfile, deploy
the agent roles and the write-fence hook, and start the Electron application with
its tracked `start` script.

What this guide is **not**:

- It is **not** a packaged-installer, MSIX, or portable-distribution procedure.
  There is no build, package, or installer script in this repository —
  `app/package.json` defines only `start`, `start:classic`, `dockview:tripwire`,
  and `test`. Packaging is deferred; see
  [RELEASE-1.0-FOUR-DAY-PLAN.md](RELEASE-1.0-FOUR-DAY-PLAN.md) § 6.4 and § 6.5.
- It is **not** a clean-machine acceptance result. The clean-machine/VM exercise
  is release item 6 and has **not** run. This document is preparation for that
  exercise, and the exercise may return findings that change it.
- It is **not** the restore/recovery drill. That is separate work with its own
  evidence record.

**Supported 1.0 target:** Blue's owned Windows environment — Windows 11 on x64.
The daily-driver host is Windows 11 **Home**
([BUILDER-HANDOFF-backup-recovery-source-scout.md](BUILDER-HANDOFF-backup-recovery-source-scout.md)
§ 3), and the runtime that was measured and documented is the unpackaged,
developer-installed Electron application run from this repository
(`BLUE-HELM-MASTER-STATUS.md` → "Pane status — packaged-runtime compatibility").
Portable family distribution and public distribution are 2.0 items.

Provider accounts are yours. Blue Helm is not a model provider; Claude Code and
the Gemini API are reached with **your own** credentials, configured on **this**
machine. Never transfer another machine's credentials here.

---

## 2. Prerequisites

Every row is classified as one of:

- **Launch** — required before the application starts or its core flow works.
- **Feature** — required only for a specific optional feature.
- **Optional** — not required for core startup.

| Prerequisite | Class | Why / what breaks without it | Evidence |
|---|---|---|---|
| Windows 11, x64 | Launch | The documented and measured target. `x64` is the architecture of the runtime actually inspected on the development host. `@lydell/node-pty` also ships a `win32-arm64` prebuilt, but arm64 is **unverified** here. | `docs/SMART-APP-CONTROL-AND-DISTRIBUTION.md` § Bounded upstream-binary investigation (`electron-v42.5.0-win32-x64.zip`); `app/package-lock.json` (`@lydell/node-pty-win32-x64`, `@lydell/node-pty-win32-arm64`) |
| Windows PowerShell 5.1 | Launch | Every terminal pane and every helper invocation is `powershell.exe`. Panes: `pty.spawn('powershell.exe', …)`. Helpers: `execFile('powershell', …)`. `scripts/run-pester.ps1` declares `#Requires -Version 5.1`. | `app/main.js:1343`, `app/main.js:205`, `app/main.js:946`, `scripts/run-pester.ps1:1` |
| Git (on `PATH`) | Launch | The repo is obtained with `git clone`, and the app shells out to `git` for repo discovery, worktree listing, the origin remote, and review diffs. `scripts/new-agent.ps1` is pure `git`. | `app/main.js:803-806`, `app/main.js:1105`, `scripts/new-agent.ps1` |
| Node.js **≥ 22.12.0** + its bundled npm | Launch | Strictest `engines.node` floor in the tracked lockfile, from `electron@42.5.0`. Use the npm that ships with that Node install; the lockfile is `lockfileVersion: 3`. | `app/package-lock.json:902-919` (`"node_modules/electron"` → `"engines": { "node": ">= 22.12.0" }`), `app/package-lock.json:4` |
| Network access to the npm registry | Launch | `npm ci` fetches the locked dependency tree. `electron` depends on `@electron/get`, which retrieves the Electron runtime binary — so the install also needs Electron's download host reachable. *(The dependency is tracked fact; exactly when the binary is fetched is an inference, not verified in this order.)* | `app/package-lock.json` (`node_modules/electron` → `dependencies["@electron/get"]`) |
| Claude Code CLI, installed and authenticated | Launch (for agent panes) | Every role pane runs `claude --agent <role>`; the Plain picker can also launch a bare `claude`. Blue Helm never authenticates for you — sign in through Claude Code itself. The Electron shell starts without it, but no builder/reviewer/scout pane can work. | `app/main.js:216`, `app/main.js:232-247` (`AGENT_CMD.claude`, `buildAgentCommand`), `app/renderer/index.html:247-254`, `AGENTS.md` § Environment |
| Codex CLI (`codex` on `PATH`) | Optional | Only reachable from the **Plain** role's CLI sub-picker. Nothing in startup, roles, fences, or Video Scout depends on it. | `app/main.js:216` (`AGENT_CMD.codex`), `docs/SMOKE-TEST.md` § B |
| Gemini CLI (`gemini` on `PATH`) | Feature — Video Scout, CLI route only | `feed-gemini.ps1` resolves `gemini` from `PATH`, falling back to `%APPDATA%\npm\gemini.cmd`. Absent, the script saves the download and reports that it was never analyzed. The **SDK route** (public YouTube URL, video mode) does not use the CLI at all. Also reachable from the Plain picker. | `scripts/feed-gemini.ps1:477-481`, `scripts/feed-gemini.ps1:646`, `scripts/gemini-video-sdk.js:1-15` |
| `GEMINI_API_KEY` | Feature — Video Scout | A Video Scout pane is **refused** without a stored key. Set it only through the in-app key banner (§ 7). | `app/main.js:1234-1237`, `app/renderer/index.html:45-48` |
| `yt-dlp` (on `PATH`) | Feature — Video Scout, CLI route only | `Get-YtDlpPath` throws `"yt-dlp not found on PATH…"` and names the install command itself. Not used by the SDK route. | `scripts/lib/invoke-duration-probe.ps1:21-25` |
| `ffmpeg` (on `PATH`) | Feature — Video Scout `audio` / `video` modes | Those modes pass `-x --audio-format mp3` and `--merge-output-format mp4` to yt-dlp. The flags are tracked fact; that yt-dlp needs ffmpeg to perform that post-processing is **yt-dlp's documented behavior**, not something verified in this order. `transcript` mode (the default) does not post-process. | `scripts/feed-gemini.ps1:546`, `scripts/feed-gemini.ps1:550-552` |
| VS Code (stable, standard install location) | Feature — the **🖥️ Open in VSCode** button | `resolveVscodeExe` probes `%LOCALAPPDATA%\Programs\Microsoft VS Code\Code.exe`, then `%ProgramFiles%`, then `%ProgramFiles(x86)%`. Not found ⇒ `vscode-not-found`, a visible refusal. Nothing else uses it. | `app/launchers.js:65-79`, `app/main.js:1169`, `app/renderer/index.html:56` |
| Windows Terminal (`wt.exe`) | Feature — the **▶️ Open Terminal** button | `resolveTerminalExe` prefers the App Execution Alias at `%LOCALAPPDATA%\Microsoft\WindowsApps\wt.exe`, else the bare `wt` name; a missing `wt` surfaces as a visible spawn error. In-app panes do **not** use it. | `app/launchers.js:88-97`, `app/main.js:1163`, `app/renderer/index.html:58` |
| Vibe Kanban desktop app | Optional | Only the **🗂️ Open Vibe Kanban** button and the Board tab. If it is not found the app offers a "Locate app…" picker. Community-maintained; do not make anything depend on it. | `app/main.js:1442-1449`, `app/renderer/index.html:63,109-110`, `docs/SETUP-WINDOWS.md` Phase 3 |
| Pester 3.x / 4.x | Optional (developer test suite) | Only `scripts/run-pester.ps1`. It refuses and prints its own install line if an incompatible version is present. Nothing at runtime touches Pester. | `scripts/run-pester.ps1:19-23` |

**`restic` is deliberately absent from this table.** It belongs to the separate
backup/restore exercise
([BACKUP-RECOVERY-EVIDENCE-2026-08-14.md](BACKUP-RECOVERY-EVIDENCE-2026-08-14.md)),
not to installing or launching Blue Helm. Do not install it as part of this
procedure.

> **Known documentation conflict.** [SETUP-WINDOWS.md](SETUP-WINDOWS.md) still
> says "Node.js 18+". That predates the current `app/` dependency tree. **The
> lockfile floor above (≥ 22.12.0) is the one to follow** for running the
> application. Reconciling SETUP-WINDOWS.md is separate work; it is not changed
> by this guide.

**Compiler toolchain — what the tracked files actually show.** The tracked
dependency graph uses platform/prebuilt packages: `@lydell/node-pty` resolves to
a per-platform prebuilt (`@lydell/node-pty-win32-x64`), and the lockfile contains
**no observed `node-gyp`, `prebuild-install`, or `node-addon-api` dependency**.
Three packages do declare install scripts — `onnxruntime-node`, `protobufjs`, and
`sharp`. That is **lockfile structure, not an observed clean install**: it is
consistent with needing no compiler, but it does not prove that none of those
install scripts falls back to building from source on a machine without
prebuilts. **The clean-machine run must confirm that no compiler fallback is
required** and record the result.

---

## 3. Clone the repository

Windows-native PowerShell. The clone target is a **path under your user
profile**, so these commands run unchanged on a machine that has only a `C:`
drive — including the prepared clean VM.

```powershell
$RepoRoot = Join-Path $env:USERPROFILE 'source\AgentCommandCenter'
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $RepoRoot) | Out-Null
git clone https://github.com/ABlueAI/AgentCommandCenter.git $RepoRoot
Set-Location $RepoRoot
```

`https://github.com/ABlueAI/AgentCommandCenter.git` is this repository's actual
`origin` remote, corroborated by [PROJECT-STATE.md](PROJECT-STATE.md) ("Repo:
github.com/ABlueAI/AgentCommandCenter"). Note that the **remote repository name
and the local folder name differ** in Blue's own checkout (`AgentCommandCenter`
vs `agent-command-center`); neither name is load-bearing, because every later
command derives its path from `$RepoRoot`.

> **`$RepoRoot` is a PowerShell session variable.** Sections 4, 5, 6, 8 and 10.1
> reuse it. If you open a new PowerShell window, set it again with the first line
> above — or substitute your own absolute path. Nothing in the application reads
> this variable; it exists only to keep this guide's commands portable.

Put the checkout anywhere you own. `D:\Workspace` appears later in this guide
**only** as the application's current default *projects root* (§ 6) — a separate
setting, a machine-specific default, and not a requirement that any `D:` drive
exist.

The application source lives under **`app\`**, and **`app\package.json` is the
only `package.json` in the repository — there is no root-level `package.json` and
no root-level lockfile.** `scripts\` must stay a sibling of `app\`: `app/main.js`
resolves helper scripts as `path.join(__dirname, '..', 'scripts')`
(`app/main.js:187`). Do not relocate `app\` on its own.

---

## 4. Install dependencies

```powershell
Set-Location (Join-Path $RepoRoot 'app')
npm ci
```

**Why `npm ci`, not `npm install`.** `app/package-lock.json` is tracked in git
(`git ls-files` lists it) at `lockfileVersion: 3`. `npm ci` installs exactly the
locked tree and fails loudly if `package.json` and the lockfile disagree; it does
not rewrite the lockfile. `npm install` may resolve newer versions inside the
declared ranges and update the lockfile — that silently changes what you are
running and produces an unreviewed diff. For a reproducible install from a
tracked lockfile, `npm ci` is the correct command.

`npm ci` deletes any existing `app\node_modules` before installing. That is
expected and safe on a fresh clone.

> This documentation order did **not** run `npm ci`, `npm install`, or any
> dependency update, and changed neither `app/package.json` nor
> `app/package-lock.json`. The command above is documented from the tracked
> files, not from an observed run on this branch.

---

## 5. Deploy roles and the write-fence hook

**Required before any fenced role can be treated as installed.**

```powershell
Set-Location $RepoRoot
powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $RepoRoot 'scripts\sync-roles.ps1')
```

That invocation is **process-local**: `-ExecutionPolicy Bypass` on a single
`powershell` process applies to that process only. It does not call
`Set-ExecutionPolicy` and does not change machine or user policy. The same
bounded form is what `scripts/run-pester.ps1` documents for itself
(`scripts/run-pester.ps1:12`), and it is the form the application uses internally
(`app/main.js:205`, `app/main.js:1232`). **Never** run `Set-ExecutionPolicy` to
make this work.

What the script deploys (`scripts/sync-roles.ps1`):

- Copies every role definition in `agent-roles\*.md` (all except `README.md`) to
  **user scope**, `%USERPROFILE%\.claude\agents\`, so the roles are visible from
  every repository the command center drives. `-ProjectDir <path>` additionally
  deploys to that project's `.claude\agents\`.
- Copies `scripts\hooks\fence-write.js` to `%USERPROFILE%\.claude\hooks\`.
- Substitutes the `__CC_HOOK__` placeholder in each deployed role file with the
  hook's absolute path, so the committed source stays portable while the deployed
  copies are machine-correct.

It deploys **role definitions and a hook script only**. It reads no credential,
writes no credential, and asks for none.

**It overwrites same-named files** in `%USERPROFILE%\.claude\agents\` and
`%USERPROFILE%\.claude\hooks\`. If you keep personal agent files with these
names — `builder`, `reviewer`, `codebase-scout`, `web-scout`, `operator`,
`source-scout` — back them up first.

Why this is a gate, not a nicety: the three fenced roles (`web-scout`,
`operator`, `source-scout`) **fail closed**. Before launching one, the app calls
`verify-fence`, which checks that the role file exists, that `__CC_HOOK__` was
substituted, that a `PreToolUse` fence is wired, that the hook file is present on
disk, and that the matcher includes `Read`. Any failure blocks the launch with
"write-fence not active" rather than starting an unconfined agent
(`app/main.js:1073-1097`, `app/renderer/app.js:2158-2168`).

Non-fenced roles (`builder`, `reviewer`, `codebase-scout`) launch
`claude --agent <role>`, which requires the deployed role file to exist — that is
the stated purpose of the script (`scripts/sync-roles.ps1` synopsis) — but the
application performs **no** independent deployment check for them. Run the script
before using any role.

---

## 6. First launch

```powershell
Set-Location (Join-Path $RepoRoot 'app')
npm start
```

`start` is `electron .` (`app/package.json` → `scripts.start`), which loads
`app/main.js`. `npm start` puts `app\node_modules\.bin` on `PATH`, so the
Electron binary installed in step 4 is the one that runs. `npm run start:classic`
starts the same application with `--classic-layout`.

**Expected first-launch behavior**

- The Electron window opens with the Board / Agents / Terminals / Library / Logs
  tabs.
- The **Logs** tab is where failures surface. Startup, refusals, and launch
  decisions are written there instead of crashing the app.
- The repo dropdown lists immediate sub-folders of the configured **projects
  root** that contain a `.git` entry. If the root does not exist, the list is
  simply **empty** — `list-repos` swallows the error and returns no repos
  (`app/main.js:897-905`). An empty dropdown on a new machine almost always means
  the projects root is wrong, not that the app is broken.
- The **Quick Links** group renders its seeded destinations, exactly
  **Starboard Platform** and **Outlook Web** (`app/quick-links-policy.js:14`).
- If `GEMINI_API_KEY` has never been stored, the key banner is available for
  Video Scout. Ignore it unless you use that feature.

### Set or correct the projects root — do this before creating any agent

The first-run default is the literal string **`D:\Workspace`**
(`app/main.js:186`, `DEFAULT_PROJECTS_ROOT`). **This is a machine-specific
assumption, not a requirement — `D:\Workspace` does not exist on every machine,
and nothing creates it.**

To correct it:

1. Click the **📁** button beside the repo dropdown (title: "Change projects root
   folder").
2. Pick your repositories folder in the native directory dialog.
3. The choice is saved to `settings.json` under Electron's `userData` directory
   and the repo list refreshes immediately
   (`app/renderer/app.js:1642-1645`, `app/main.js:279-284`, `app/main.js:860-864`).

The projects root is load-bearing beyond the dropdown: fenced roles run inside
`<projectsRoot>\.command-center\outputs\…`, and a fenced pane whose cwd resolves
outside that sandbox is refused (`app/main.js:1000-1004`, `app/main.js:1213`,
`app/main.js:1200-1225`). Set it correctly before creating agents.

### Machine-specific assumptions still present in 1.0

State these plainly rather than discovering them on a new machine:

- **Projects root** defaults to `D:\Workspace` — configurable in the UI, as above.
- **Video Scout run root** is the hard-coded constant
  `D:\Gemini_Video_Review\downloads` (`app/main.js:192`,
  `VIDEO_SCOUT_RUN_ROOT`), reused as the download directory, the Library listing
  root, and the report-resolution root. It is **not** configurable from the UI.
  On a machine without a `D:` drive, Video Scout and the Library are affected.
  This is a known 1.0 limitation (§ 9).
- **The desktop shortcut** recorded in
  [SMART-APP-CONTROL-AND-DISTRIBUTION.md](SMART-APP-CONTROL-AND-DISTRIBUTION.md)
  points at one specific machine's `app\node_modules\electron\dist\electron.exe`.
  It is that machine's convenience, not part of this procedure. `npm start` is
  the documented source-tree start command.

---

## 7. Provider setup

**Claude authentication is owned by Claude Code.** Install and sign in to Claude
Code through its own flow, in a normal terminal. Blue Helm launches the `claude`
CLI; it never collects, stores, proxies, or refreshes a Claude credential.

**Gemini credentials are configured inside Blue Helm.** Use the in-app key
banner:

1. Paste the key into the key field in the header banner
   (`app/renderer/index.html:45-48`).
2. Click **Save encrypted**.

The key is encrypted with Electron `safeStorage` (DPAPI on Windows) and written
as ciphertext to `secure.json` in the app's `userData` directory. The plaintext
is decrypted into main-process memory and injected only into the specific
Video Scout PTY that needs it; it never crosses IPC back to the renderer
(`app/main.js:286-306`, `app/main.js:871-889`, `app/main.js:1336`). If
`safeStorage` reports encryption unavailable, saving is refused visibly rather
than falling back to plaintext.

**Rules, not suggestions:**

- **Never** use `setx` — or any persistent Windows user/machine environment
  variable — for a provider credential. A value persisted that way is present in
  the **application's own ambient environment** and is spread into **at least the
  unfenced PTYs** — plain shells, Plain-CLI panes, and Video Scout — because
  `pty-start` builds each PTY environment from `process.env`
  (`app/main.js:1276-1340`). Among the six deployed roles, only **Builder** is
  granted the `Bash` tool (`agent-roles/builder.md`); the three fenced roles hold
  `WebSearch, WebFetch, Read, Write` and Reviewer and Codebase Scout hold
  `Read, Grep, Glob`, so today there is no fenced-role Bash step to read it. That
  narrows the blast radius; it does **not** make `setx` acceptable — the value is
  still ambient, still persistent, and still outside `safeStorage`. Blue Helm
  sets `CLAUDE_CODE_SUBPROCESS_ENV_SCRUB=1` on every PTY to limit what Claude
  Code forwards into subprocesses it spawns itself (`app/main.js:1276-1340`;
  `AGENTS.md` § How I work, item 8), and P1 fenced-role environment containment
  (release plan § 2.3) is separately tightening what fenced PTYs inherit —
  **neither is a reason to persist a secret in the environment.** If a key was
  previously set with `setx`, remove it: System Properties → Environment
  Variables → User variables → delete the entry, or
  `[Environment]::SetEnvironmentVariable('GEMINI_API_KEY', $null, 'User')`.
- **Never** copy `secure.json`, DPAPI ciphertext, or any key material between
  machines. The ciphertext is bound to the OS user and machine; a copied file is
  at best unreadable and at worst a leaked secret. Configure each machine
  separately through the UI.
- Codex and Gemini setup is **feature-specific**. Neither is required to launch
  Blue Helm or to run a Claude builder pane.

---

## 8. First-launch verification

A bounded sequence for a fresh install. It costs **no** provider turn. The full
manual pass is [SMOKE-TEST.md](SMOKE-TEST.md); this is the narrower "did the
install work" subset, and its items map to that checklist's sections where noted.

Before starting, fully **quit and reopen** the app if you changed anything under
`app\` — stale `main.js` / `preload.js` state is the most common false failure
(SMOKE-TEST.md preamble).

1. **The application starts.** `npm start` from `app\` opens the window and
   reaches the normal startup Logs. *(SMOKE-TEST.md § A, first item.)*
2. **The Logs tab surfaces visible refusals.** Confirm the Logs tab renders
   startup lines. Then provoke one harmless refusal and confirm it appears there
   rather than vanishing — for example, click **🖥️ Open in VSCode** with no VS
   Code installed, or attempt a fenced role before running `sync-roles.ps1`; both
   refuse visibly.
3. **The projects root is valid.** The repo dropdown lists your repositories. An
   empty list means the root is wrong — fix it with **📁** (§ 6) before going
   further. *(SMOKE-TEST.md § A.)*
4. **An ordinary terminal pane starts.** Terminals tab → **+ Shell**. A
   PowerShell pane opens and accepts input. This exercises the PTY layer,
   `@lydell/node-pty`, and xterm rendering **without any provider**.
5. **One builder pane starts — only if Claude Code is authenticated.** Agents →
   **+ New** → **🔨 Builder** → a kebab-case task name. A worktree is created,
   the pane shows the orange 🔨 badge, and `claude --agent builder` starts.
   **Stop at the CLI's ready prompt — do not submit a prompt.** Reaching the
   prompt proves launch, wiring, and role deployment; submitting one would
   consume provider usage. *(SMOKE-TEST.md § B, second item.)*
6. **Fenced roles are not tested until `sync-roles.ps1` has completed.** Do not
   attempt Web Scout, Operator, or Source Scout before § 5. If you do, the
   correct result is a **BLOCK** with "write-fence not active" — that is the
   fail-closed guard working, not an installation defect. The adversarial fence
   proof (SMOKE-TEST.md § E and the formal matrix) is **not** part of this guide;
   it belongs to release item 4.
7. **Quick Links and pane status are present.** The Quick Links group renders
   **Starboard Platform** and **Outlook Web** with a **Manage** control, and the
   pane-status control is mounted in the Terminals header. Both are merged
   features; confirm presence only.
8. **No paid provider turn was required.** Nothing in steps 1–7 submits a prompt
   or launches Video Scout. Establishing application startup must never require
   spending money.

Optional developer checks, once dependencies are installed — neither is required
for the application to run:

```powershell
Set-Location (Join-Path $RepoRoot 'app')
npm test
```

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $RepoRoot 'scripts\run-pester.ps1')
```

Video Scout verification is deliberately excluded here: it downloads media and
makes a **paid** provider call. Use SMOKE-TEST.md § D when you actually want to
exercise it.

---

## 9. Known limitations

Recorded so a clean-machine run does not rediscover them as surprises:

1. **No packaged installer in 1.0.** No MSIX, no installer, no packaged runtime,
   no build command. Source-tree only. Packaging is deferred
   ([RELEASE-1.0-FOUR-DAY-PLAN.md](RELEASE-1.0-FOUR-DAY-PLAN.md) § 6.4, § 6.5).
2. **The clean-machine/VM exercise is still pending.** It is release item 6
   (release plan § 2.6). This guide has not been executed on a clean machine. Its
   output may be a blocker rather than a pass.
3. **Video Scout relies on machine-specific storage.** `VIDEO_SCOUT_RUN_ROOT` is
   hard-coded to `D:\Gemini_Video_Review\downloads` (`app/main.js:192`) and is
   not exposed in the UI — the known **`D:` path issue**. A machine without that
   drive has an unresolved Video Scout and Library storage path.
4. **The clean VM and the daily-driver host are different Windows editions.** The
   VM prepared for the exercise is a Windows **Enterprise evaluation** image
   while the daily-driver host is Windows 11 **Home**. Behavior that differs by
   edition — policy surfaces, Smart App Control, WDAC/AppLocker availability —
   will not transfer cleanly in either direction. *(Recorded from the release
   preflight; the Home host is corroborated by
   [BUILDER-HANDOFF-backup-recovery-source-scout.md](BUILDER-HANDOFF-backup-recovery-source-scout.md)
   § 3, while the VM edition is not stated in any tracked file here.)*
5. **Windows long-path behavior is a required clean-machine finding.** Codex
   turn-diff reference paths under `.git\refs\codex\turn-diffs\checkpoints`
   already measure 253 characters at source and a projected 266 characters under
   a representative restore prefix, crossing the traditional `MAX_PATH` boundary;
   extended-length (`\\?\`) handling was needed during cleanup. The clean-machine
   test must verify long-path behavior rather than assume it
   ([BACKUP-RECOVERY-EVIDENCE-2026-08-14.md](BACKUP-RECOVERY-EVIDENCE-2026-08-14.md)
   § 6; release plan § 2.6).
6. **Smart App Control behavior may differ by Windows edition and by how the
   files arrived.** See § 10; do not generalize one machine's outcome.
7. **Provider credentials must be configured separately in the guest.** Nothing
   is inherited, copied, or migrated. Claude Code signs in on its own; the Gemini
   key is entered through the in-app UI on that machine (§ 7).
8. **Restore testing has a separately unresolved transfer-channel decision** —
   how backup material is moved to a second machine for a restore is not settled,
   and it is **not** part of this installation procedure. Backup residuals
   (scheduling, off-site survival, stale-backup detection, immutable retention)
   are explicitly deferred to 2.0 (release plan § 6.1;
   [BACKUP-RECOVERY-EVIDENCE-2026-08-14.md](BACKUP-RECOVERY-EVIDENCE-2026-08-14.md)).
9. **Reconciliation debt.** [SETUP-WINDOWS.md](SETUP-WINDOWS.md) still states
   "Node.js 18+", which the current lockfile contradicts (§ 2). That file is not
   changed by this guide.

---

## 10. Troubleshooting: Windows trust, Smart App Control, and Code Integrity

This section is the retained Smart App Control material. It is **troubleshooting
for a launch that Windows refuses**, not part of the normal source-tree install
above. A routine `npm ci` + `npm start` on your own machine usually does not
encounter it.

### 10.1 What is actually known about the unsigned executable

Keep three different kinds of statement apart.

**Observed** — on Blue's development machine, July 25–26 2026, and recorded in
[SMART-APP-CONTROL-AND-DISTRIBUTION.md](SMART-APP-CONTROL-AND-DISTRIBUTION.md):

- The installed `app\node_modules\electron\dist\electron.exe` (Electron 42.5.0)
  reported Authenticode status **`NotSigned`**, and carried only a `:$DATA`
  stream — **no** `Zone.Identifier`.
- Code Integrity events **3033** and **3077** recorded `explorer.exe` attempting
  to load that exact executable and being refused for Enterprise signing-level /
  policy requirements.
- In a separate bounded read-only investigation, the official
  `electron-v42.5.0-win32-x64.zip` release asset was downloaded, its reported
  SHA-256 matched the release `SHASUMS256.txt`, and the extracted `electron.exe`
  was **also** `NotSigned`. The scratch download was deleted and `node_modules`
  was not modified.

**Electron distribution practice** — the Electron project publishes Windows
prebuilts without an Authenticode signature of its own; code signing is the
responsibility of whoever packages and distributes an application built on it.

**Inference** — that a fresh `npm ci` on *your* machine also yields an unsigned
`electron.exe` follows from the above and is very likely, **but the file on your
machine has not been inspected.** Do not state it as a fact about your specific
executable until you have checked it:

```powershell
$ElectronExe = Join-Path $RepoRoot 'app\node_modules\electron\dist\electron.exe'
Get-AuthenticodeSignature $ElectronExe | Format-List Status, SignerCertificate
Get-Item $ElectronExe -Stream *
```

Report what those two commands actually return, rather than assuming the
development machine's result.

### 10.2 The Smart App Control message

Windows 11 may display:

> Smart App Control blocked an app that may be unsafe
> Windows can't tell who created this app.

The app does not start. Windows refuses to load the unsigned Electron executable
**before any Blue Helm code runs**, so Blue Helm cannot catch, log, or override
it.

This message is primarily about publisher identity and reputation. It is not by
itself a malware verdict — and it is not proof that an unsigned application is
safe.

### 10.3 There is no per-app exception

Microsoft currently documents no Smart App Control exception for one particular
application. The supported choices are to run a trusted/signed build or to turn
Smart App Control off.

- [Smart App Control FAQ](https://support.microsoft.com/en-us/windows/security/threat-malware-protection/smart-app-control-frequently-asked-questions)

### 10.4 The security decision belongs to the user

Turning Smart App Control off removes a preventive layer that blocks unknown or
unsigned executables. It does not disable Microsoft Defender or other independent
protections, but it is a real reduction in defense. **Blue Helm must never change
this setting automatically, and turning it off is not the default remedy.** If
you do not accept that trade-off, stop and use a trusted distribution route
instead — which, for 1.0, means this does not get solved by repackaging
(§ 10.8).

Microsoft states that recent Windows updates allow Smart App Control to be
re-enabled without reinstalling Windows; older versions documented a
reset/reinstall requirement. Install pending Windows updates and review the
current Microsoft FAQ **before** changing anything. Do not treat a registry value
as the authority — read the state shown in Windows Security.

If you knowingly accept the trade-off, these steps are **human-only**:

1. Open **Windows Security**.
2. Select **App & browser control**.
3. Open **Smart App Control settings**.
4. Set Smart App Control to **Off** and confirm the Windows prompt.
5. Restart only if Windows requests it.
6. Reopen Windows Security and confirm the displayed state.
7. Launch Blue Helm again.

Do not automate these steps, edit the registry, or install a policy bypass.

### 10.5 SmartScreen is a different thing

A file downloaded through a browser or transferred over the internet may carry
Mark of the Web. SmartScreen can then show a separate **Windows protected your
PC** reputation prompt, sometimes with **More info → Run anyway**.

That prompt is **not** the Smart App Control block; Smart App Control has no
per-app "Run anyway".

Do not run `Unblock-File` blindly. First confirm that a `Zone.Identifier`
alternate data stream actually exists (`Get-Item <file> -Stream *`) and that
SmartScreen — not Code Integrity — is the active blocker. A `git clone` +
`npm ci` install generally produces no Mark of the Web at all; the development
machine's executable had none.

### 10.6 Diagnosing a refused launch

1. Reopen Windows Security and confirm the visible Smart App Control state.
2. Check whether Windows requested a restart.
3. Open Event Viewer:
   **Applications and Services Logs → Microsoft → Windows → CodeIntegrity →
   Operational**.
4. Look for events **3033** or **3077** at the failed-launch time.
5. Check whether Windows is in S mode.
6. Check for separately managed WDAC or AppLocker policy — plausible on an
   Enterprise image, less likely on Home (§ 9, item 4).
7. Check Defender Protection History and any third-party security product.
8. Run `npm start` from an interactive PowerShell window in `app\` to distinguish
   an executable-policy block from a broken shortcut. Confirm no stale process is
   holding the app:

   ```powershell
   Get-Process electron -ErrorAction SilentlyContinue
   ```

If Code Integrity no longer blocks the executable but Electron starts and exits,
collect the startup output and the Logs tab text. That is an application-startup
problem, not a trust problem, and it deserves its own diagnostic work order.

### 10.7 Never do these

- Do not disable Defender, SmartScreen, the firewall, or real-time protection.
- Do not disable VBS or Memory Integrity.
- Do not use registry hacks to bypass Smart App Control.
- Do not weaken PowerShell execution policy globally (`Set-ExecutionPolicy`) —
  use the bounded process-local form in § 5.
- Do not install a self-signed certificate and describe it as equivalent to a
  publicly trusted publisher signature.
- Do not download Electron or Blue Helm components from unofficial mirrors.
- Do not copy provider credentials, `secure.json`, or DPAPI ciphertext between
  machines.
- Do not persist provider credentials in environment variables (`setx`).
- Do not enable autonomous merge or autonomous provider actions. The human merge
  gate stays on (`AGENTS.md` § How I work, item 2).
- Do not claim that repackaging the same unsigned Electron binary alone solves
  Smart App Control.

### 10.8 Where distribution actually stands

Packaged distribution is **not** a 1.0 item. Portable family distribution and the
full environment/distribution audit are deferred to 2.0
([RELEASE-1.0-FOUR-DAY-PLAN.md](RELEASE-1.0-FOUR-DAY-PLAN.md) § 6.4, § 6.5); the
1.0 target is one owned Windows environment, with the clean-machine exercise
retained only to expose hidden dependencies.

The bounded investigation is closed for Electron 42.5.0: there is no same-version
officially Authenticode-signed Electron prebuilt to swap in, and repackaging the
same unsigned runtime without adding a trust mechanism does not by itself address
Smart App Control. A Microsoft Store MSIX remains the leading **candidate** for a
zero-recurring-cost signed route and has **not** been prototyped — and packaged
runtimes are separately untested for pane status
(`BLUE-HELM-MASTER-STATUS.md` → "Pane status — packaged-runtime compatibility").
The full record is
[SMART-APP-CONTROL-AND-DISTRIBUTION.md](SMART-APP-CONTROL-AND-DISTRIBUTION.md).

- [Choose a Windows distribution path](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/choose-distribution-path)
- [Open a Microsoft Store developer account](https://learn.microsoft.com/en-us/windows/apps/publish/partner-center/open-a-developer-account)
- [Electron packaging](https://www.electronjs.org/docs/latest/tutorial/tutorial-packaging)

---

## 11. Related documents

- [SETUP-WINDOWS.md](SETUP-WINDOWS.md) — the six-phase parallel-agent workflow
  setup (worktrees, Vibe Kanban, model routing). Complementary to this guide; its
  "Node.js 18+" line is superseded for `app/` (§ 2).
- [SMOKE-TEST.md](SMOKE-TEST.md) — the full manual hard-test checklist.
- [SMART-APP-CONTROL-AND-DISTRIBUTION.md](SMART-APP-CONTROL-AND-DISTRIBUTION.md)
  — the signing/distribution investigation record.
- [RELEASE-1.0-FOUR-DAY-PLAN.md](RELEASE-1.0-FOUR-DAY-PLAN.md) — 1.0 scope,
  including the clean-machine exercise and the packaging deferrals.
- [WORKTREE-CHEATSHEET.md](WORKTREE-CHEATSHEET.md) — the worktree mental model.
- [../AGENTS.md](../AGENTS.md) and [../CLAUDE.md](../CLAUDE.md) — the binding
  conventions, including the credential rules referenced in § 7.
