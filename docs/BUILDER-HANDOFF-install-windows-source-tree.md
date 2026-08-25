# Builder Handoff — Windows Source-Tree Installation Guide

## 0. Status

**STOPPED FOR INDEPENDENT STANDARD-CLASS DOCUMENTATION REVIEW.** Documentation
only. Nothing merged, nothing pushed, no VM started, no dependency installed, no
provider session opened.

## 1. Authority and invariant

Work order: **CM-1 — SOURCE-TREE WINDOWS INSTALLATION GUIDE**.

Branch invariant: **replace the Smart App Control note at
`docs/INSTALL-WINDOWS.md` with a complete Windows source-tree installation
procedure, retain its trust/signing material as troubleshooting, and change
nothing else.**

This order prepares release item 6 (clean-machine/VM exercise). It does not
execute item 6 and earns no release-progress percentage.

## 2. OSS procurement disposition

**The OSS-first procurement gate does not reopen on this branch.** This documents
installation of the existing application. No new subsystem, dependency, script,
package, installer, or packaging route is introduced, and none was needed to
complete the guide. `app/package.json` and `app/package-lock.json` are unchanged
and were not executed against.

## 3. Git shape

| Field | Value |
|---|---|
| Branch | `docs/install-windows-source-tree` |
| Worktree | `.worktrees/docs-install-windows-source-tree` |
| Fork point | `d64192ba680d932623e5557793a159076e26d8d6` |
| Pre-merge `main` at branch creation | `d64192ba680d932623e5557793a159076e26d8d6` |
| Local `main` == `origin/main` at branch creation | verified equal, both `d64192ba680d932623e5557793a159076e26d8d6` |
| Tip | the single commit introducing these two documents; exact SHA accompanies the review request |
| Merge commit | Pending until merge |

The P1 worktree (`.worktrees/p1-fenced-role-env-containment`,
`codex/p1-fenced-role-env-containment`) was **not** entered, inspected, modified,
rebased, or depended upon. This branch forks from pushed `main` only.

## 4. Files changed — exact two-path census

```
docs/BUILDER-HANDOFF-install-windows-source-tree.md   (new)
docs/INSTALL-WINDOWS.md                               (rewritten)
```

Two paths. Both Markdown. No other tracked change is present or authorized.

## 5. Security-sensitive surfaces touched

**None.** No executable code, settings schema, installation script, dependency,
credential mechanism, security boundary, or machine policy is changed or
directed by this branch. The guide *describes* existing boundaries (the
write-fence deployment gate, `safeStorage` credential handling, the process-local
execution-policy form) and adds prohibitions; it changes none of them.

Review class therefore remains **Standard documentation review**. Nothing on this
branch meets the escalation condition for Full class.

## 6. What the new guide contains

`docs/INSTALL-WINDOWS.md` is restructured from a Smart App Control note into an
eleven-section installation procedure:

| § | Section | Purpose |
|---|---|---|
| 1 | Scope and honesty | Source-tree install only; not a packaged/MSIX workflow; not a clean-machine acceptance result; supported target named |
| 2 | Prerequisites | Classified table (Launch / Feature / Optional) with per-row evidence |
| 3 | Clone the repository | PowerShell clone; `app/` is the only `package.json`; `scripts/` must stay its sibling |
| 4 | Install dependencies | `npm ci` from `app\`, with the reproducibility rationale |
| 5 | Deploy roles and the write-fence hook | `scripts/sync-roles.ps1`, process-local execution policy, fail-closed explanation |
| 6 | First launch | `npm start`, expected behavior, projects-root correction, machine-specific assumptions |
| 7 | Provider setup | Claude owned by Claude Code; Gemini via in-app UI + `safeStorage`; explicit `setx` and secret-copy prohibitions |
| 8 | First-launch verification | Bounded 8-step sequence, zero provider turns, cross-referenced to `SMOKE-TEST.md` |
| 9 | Known limitations | Nine recorded limitations |
| 10 | Troubleshooting | Retained Smart App Control / SmartScreen / Code Integrity / Event Viewer material, plus safety prohibitions and current distribution status |
| 11 | Related documents | Cross-links |

### Installation flow, end to end

1. Confirm prerequisites (§ 2).
2. `git clone` the repository (§ 3).
3. `npm ci` inside `app\` (§ 4).
4. `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\sync-roles.ps1`
   from the repo root (§ 5).
5. `npm start` inside `app\` (§ 6).
6. Correct the projects root with the **📁** control before creating any agent
   (§ 6).
7. Configure providers only if the relevant feature is wanted (§ 7).
8. Run the bounded first-launch verification (§ 8).

## 7. Prerequisite evidence sources

Every prerequisite is derived from a tracked repository file. Nothing is invented
and no version requirement is asserted without a source.

| Prerequisite | Class | Source |
|---|---|---|
| Windows 11, x64 | Launch | `docs/SMART-APP-CONTROL-AND-DISTRIBUTION.md` § Bounded upstream-binary investigation (`electron-v42.5.0-win32-x64.zip`); `docs/BUILDER-HANDOFF-backup-recovery-source-scout.md` § 3 ("Windows 11 Home" host); `app/package-lock.json` (`@lydell/node-pty-win32-x64` / `-win32-arm64` platform packages) |
| Windows PowerShell 5.1 | Launch | `app/main.js:1343` (`pty.spawn('powershell.exe', …)`), `app/main.js:205`, `app/main.js:946`, `app/main.js:990` (`execFile('powershell', …)`), `scripts/run-pester.ps1:1` (`#Requires -Version 5.1`) |
| Git on `PATH` | Launch | `app/main.js:803-806` (`execFile('git', …)`), `app/main.js:1105`, `scripts/new-agent.ps1` |
| Node.js ≥ 22.12.0 | Launch | `app/package-lock.json:902-919` — `"node_modules/electron"` → `"engines": { "node": ">= 22.12.0" }`. This is the **strictest** `engines.node` floor in the tracked lockfile; the next-highest are `>=22.12.0` (`@electron/get`, `@electron-internal/extract-zip`) and `>=20.18.1`. |
| npm — the one bundled with that Node | Launch | `app/package-lock.json:4` (`"lockfileVersion": 3`). No separate npm version is asserted. |
| Network to npm registry / Electron download host | Launch | `app/package-lock.json` — `node_modules/electron` depends on `@electron/get`. Marked in the guide as tracked-dependency fact plus an explicit inference about *when* the binary is fetched. |
| Claude Code CLI, authenticated | Launch (agent panes) | `app/main.js:216` (`AGENT_CMD`), `app/main.js:232-247` (`buildAgentCommand` → `claude --agent <role>`), `app/renderer/index.html:247-254`, `AGENTS.md` § Environment |
| Codex CLI | Optional | `app/main.js:216` (`AGENT_CMD.codex`); reachable only from the Plain sub-picker (`docs/SMOKE-TEST.md` § B) |
| Gemini CLI | Feature (Video Scout, CLI route) | `scripts/feed-gemini.ps1:477-481` (PATH lookup + `%APPDATA%\npm\gemini.cmd` fallback), `scripts/feed-gemini.ps1:646` (not-found behavior), `scripts/gemini-video-sdk.js:1-15` (SDK route uses no CLI) |
| `GEMINI_API_KEY` | Feature (Video Scout) | `app/main.js:1234-1237` (launch refused without a stored key), `app/renderer/index.html:45-48` (key banner) |
| `yt-dlp` | Feature (Video Scout, CLI route) | `scripts/lib/invoke-duration-probe.ps1:21-25` — the repository's own error text names `winget install yt-dlp.yt-dlp` |
| `ffmpeg` | Feature (Video Scout `audio`/`video`) | `scripts/feed-gemini.ps1:546` (`-x --audio-format mp3`), `:550-552` (`--merge-output-format mp4`). The flags are tracked; the ffmpeg requirement is labelled in the guide as yt-dlp's documented behavior, **not** as something verified here. |
| VS Code | Feature (**🖥️ Open in VSCode** button) | `app/launchers.js:65-79` (`resolveVscodeExe` candidate list), `app/main.js:1169`, `app/renderer/index.html:56` |
| Windows Terminal | Feature (**▶️ Open Terminal** button) | `app/launchers.js:88-97` (`resolveTerminalExe`), `app/main.js:1163`, `app/renderer/index.html:58` |
| Vibe Kanban | Optional | `app/main.js:1442-1449` (`open-board`, `pick-board-app`), `app/renderer/index.html:63,109-110`, `docs/SETUP-WINDOWS.md` Phase 3 |
| Pester 3.x/4.x | Optional (developer suite) | `scripts/run-pester.ps1:19-23` |

**`restic` is explicitly excluded** from the prerequisite table and the guide
says so in a labelled note: it belongs to the separate restore exercise
(`docs/BACKUP-RECOVERY-EVIDENCE-2026-08-14.md`), not to installing the
application.

**Documentation conflict recorded, not silently resolved.**
`docs/SETUP-WINDOWS.md` still says "Node.js 18+", which the current lockfile
contradicts. The guide states the conflict, states which value governs for
`app/`, and notes that reconciling `SETUP-WINDOWS.md` is separate work. That file
is outside the two-path cap and was not touched.

## 8. Commands documented, with their tracked source

| Command | Where it appears | Tracked source |
|---|---|---|
| `git clone …` / `cd …` | § 3 | Standard Git; the repository is a Git repo |
| `npm ci` (run from `app\`) | § 4 | `app/package-lock.json` is tracked (`git ls-files`) at `lockfileVersion: 3`; `app/package.json` is the only manifest |
| `npm start` | § 6 | `app/package.json` → `"start": "electron ."` |
| `npm run start:classic` | § 6 | `app/package.json` → `"start:classic": "electron . --classic-layout"` |
| `npm test` | § 8 (optional) | `app/package.json` → `"test"` |
| `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\sync-roles.ps1` | § 5 | `scripts/sync-roles.ps1` exists; the bounded process-local form matches `scripts/run-pester.ps1:12` and the app's own internal usage (`app/main.js:205`, `app/main.js:1232`) |
| `powershell -NoProfile -ExecutionPolicy Bypass -File …\scripts\run-pester.ps1` | § 8 (optional) | `scripts/run-pester.ps1:12` — the script's own documented example |
| `Get-AuthenticodeSignature …\electron.exe` | § 10.1 | Read-only verification the guide asks the reader to perform instead of assuming; mirrors the evidence method in `docs/SMART-APP-CONTROL-AND-DISTRIBUTION.md` § Local launch evidence |
| `Get-Item …\electron.exe -Stream *` | § 10.1, § 10.5 | Same record: streams were inspected there (`only :$DATA; no Zone.Identifier`) |
| `Get-Process electron -ErrorAction SilentlyContinue` | § 10.6 | Retained from the previous revision of `docs/INSTALL-WINDOWS.md` |
| `[Environment]::SetEnvironmentVariable('GEMINI_API_KEY', $null, 'User')` | § 7 | `AGENTS.md` § How I work, item 8 — the repository's own prescribed removal method |

Every command names a tracked file or script that exists on this branch. **No
command was executed** as part of this order.

## 9. Retained Smart App Control / troubleshooting scope

All Smart App Control material from the previous revision is retained, moved
under § 10 "Troubleshooting", and re-anchored to evidence:

- the Smart App Control block message and why Blue Helm cannot catch it;
- no per-app exception exists; the Microsoft FAQ link;
- the security decision belongs to the user, must never be automated, and is
  **not** the default remedy;
- update Windows first; read Windows Security, not the registry;
- the human-only steps for turning it off;
- SmartScreen / Mark of the Web is a *different* mechanism; do not run
  `Unblock-File` blindly;
- the Code Integrity / Event Viewer 3033 / 3077 diagnostic path, S mode,
  WDAC/AppLocker, Defender history;
- the "do not do these" prohibition list.

Three corrections were required for technical coherence:

1. **Unsigned-binary claims are now stratified.** § 10.1 separates *observed*
   (the July 25–26 2026 measurements on the development machine, and the bounded
   official-prebuilt comparison, both from
   `docs/SMART-APP-CONTROL-AND-DISTRIBUTION.md`), *Electron distribution
   practice*, and *inference* (that a fresh `npm ci` elsewhere yields an equally
   unsigned executable — likely, **not** verified on the reader's machine). The
   guide gives the two read-only commands to check rather than assume.
2. **The stale packaging promise is removed.** The previous revision said
   "Blue Helm 1.0 will time-box a Microsoft Store MSIX prototype" and listed
   packaged distribution as a 1.0 release-gate requirement. `RELEASE-1.0-FOUR-DAY-PLAN.md`
   § 6.4 / § 6.5 defers portable distribution and the environment/distribution
   audit to 2.0. § 10.8 now states the current position: MSIX is an
   un-prototyped **candidate**, and packaged runtimes are separately untested for
   pane status.
3. **The launch-verification section no longer assumes a desktop shortcut.** The
   source-tree start command is `npm start`; the machine-specific shortcut is
   named as one machine's convenience in § 6.

Two prohibitions were added to satisfy the order's § 10 safety list: **do not
disable VBS or Memory Integrity**, and **do not enable autonomous merge or
autonomous provider actions** (`AGENTS.md` § How I work, item 2). Existing
prohibitions on globally weakening execution policy, disabling Defender/
SmartScreen/firewall, registry bypasses, mirror downloads, and copying
credentials are retained; `setx` persistence is now stated explicitly in both
§ 7 and § 10.7.

## 10. Known limitations recorded in the guide

`docs/INSTALL-WINDOWS.md` § 9 records nine:

1. no packaged installer in 1.0 (`RELEASE-1.0-FOUR-DAY-PLAN.md` § 6.4, § 6.5);
2. the clean-machine/VM exercise is still pending (release plan § 2.6);
3. Video Scout's machine-specific storage — `VIDEO_SCOUT_RUN_ROOT` hard-coded to
   `D:\Gemini_Video_Review\downloads` (`app/main.js:192`), the known `D:` path
   issue;
4. the clean VM is a Windows **Enterprise evaluation** image while the
   daily-driver host is Windows 11 **Home**;
5. Windows long-path behavior is a required clean-machine finding — 253
   characters at source, projected 266 under a representative restore prefix,
   `\\?\` handling needed during cleanup
   (`docs/BACKUP-RECOVERY-EVIDENCE-2026-08-14.md` § 6; release plan § 2.6);
6. Smart App Control behavior may differ by Windows edition;
7. provider credentials must be configured separately in the guest;
8. restore testing has a separately unresolved transfer-channel decision, and is
   not part of this procedure (release plan § 6.1);
9. reconciliation debt — `SETUP-WINDOWS.md`'s "Node.js 18+" line.

**Sourcing caveat on item 4.** The Home daily-driver host is corroborated by
`docs/BUILDER-HANDOFF-backup-recovery-source-scout.md` § 3. The **Enterprise
evaluation** edition of the prepared VM is stated by the CM-1 work order and is
**not** recorded in any tracked file in this repository. The guide labels it that
way in place rather than implying a repository source. If Blue wants that fact
tracked, it belongs in the clean-machine exercise record, not here.

## 11. Claim audit

Performed before commit, against the order's checklist.

| Check | Result |
|---|---|
| Every command points to a tracked file or script that exists | **PASS** — see § 8; each verified present on this branch |
| Every prerequisite is sourced | **PASS** — see § 7; every row cites a tracked file, and every cited line number was re-read after writing |
| Optional features are not described as core requirements | **PASS** — three explicit classes (Launch / Feature / Optional); Codex, Vibe Kanban and Pester are Optional; Gemini CLI, `GEMINI_API_KEY`, yt-dlp, ffmpeg, VS Code and Windows Terminal are Feature-scoped to the exact button or route that uses them |
| No packaged-build claim appears | **PASS** — § 1 and § 10.8 state the opposite; the previous revision's MSIX promise and packaged 1.0 gate list are removed |
| No secret value is read, recorded, or requested | **PASS** — no credential was read, printed, or solicited; `secure.json` and DPAPI ciphertext are named only as things never to copy |
| No instruction contradicts `AGENTS.md` | **PASS** — the `setx` prohibition, `safeStorage` path, human merge gate, and Windows-native PowerShell default all match `AGENTS.md`; the guide adds no autonomy |
| Every "required", "only", and "supported" claim has evidence | **PASS** — the Node floor is the strictest lockfile `engines` value; "only `app/package.json`" is verified absent at root; "supported target" is § 1 with two cited sources; unverified statements (arm64, ffmpeg's role, install-time binary fetch, the VM edition) are labelled unverified/inference in place |
| The retained Smart App Control section is still technically coherent | **PASS** — with the three corrections in § 9; observed/practice/inference are separated, SmartScreen is still distinguished from Code Integrity, and the diagnostic ladder is intact |
| Links and headings resolve | **PASS** — every relative link target exists (`SETUP-WINDOWS.md`, `SMOKE-TEST.md`, `SMART-APP-CONTROL-AND-DISTRIBUTION.md`, `RELEASE-1.0-FOUR-DAY-PLAN.md`, `BACKUP-RECOVERY-EVIDENCE-2026-08-14.md`, `BUILDER-HANDOFF-backup-recovery-source-scout.md`, `WORKTREE-CHEATSHEET.md`, `../AGENTS.md`, `../CLAUDE.md`); cross-references use section numbers and named section titles rather than generated anchors, so no fragile `#anchor` can rot |
| `git diff --check` clean | **PASS** |
| Changed-path census is exactly the two authorized Markdown files | **PASS** — see § 4 |

## 12. Restrictions honored

Not done, as required by the order:

- VM not started; no checkpoint created or restored;
- no software installed;
- `npm install` / `npm ci` not run;
- Electron not launched;
- no provider session opened; no paid turn consumed;
- no change to settings, registry, policy, environment variables, credentials, or
  `userData`;
- `app/package.json` and both dependency manifests untouched;
- the P1 worktree untouched.

All validation was read-only inspection of tracked files at
`d64192ba680d932623e5557793a159076e26d8d6`.

## 13. Recommended review focus

1. **§ 2 of the guide — the prerequisite classification.** Is anything marked
   Feature that is genuinely required for first launch, or vice versa? The
   riskiest rows are the Claude Code CLI (Launch *for agent panes*, not for the
   Electron shell) and Windows Terminal (a button, not the in-app panes).
2. **§ 4 — `npm ci` vs `npm install`.** The reasoning is stated; confirm it
   matches how Blue actually wants a fresh clone provisioned.
3. **§ 5 — the process-local execution-policy form.** Confirm it reads as bounded
   and cannot be mistaken for `Set-ExecutionPolicy` guidance.
4. **§ 8 — the verification sequence.** Confirm step 5 (builder pane, stop at the
   ready prompt) genuinely consumes no provider turn in Blue's judgement, since
   that is the one step that touches a provider CLI at all.
5. **§ 10.1 — the observed/practice/inference split.** This is the order's
   sharpest honesty requirement.
6. **§ 9 item 4** — the un-tracked provenance of the VM edition, flagged in § 10
   above.

## 14. Unexpected pre-existing findings

1. **`docs/SETUP-WINDOWS.md` states "Node.js 18+"**, which the current
   `app/package-lock.json` contradicts (`electron@42.5.0` requires `>= 22.12.0`).
   Recorded in the guide as a conflict; **not fixed** — `SETUP-WINDOWS.md` is
   outside the two-path cap.
2. **The previous `docs/INSTALL-WINDOWS.md` carried a stale 1.0 packaging
   commitment** that `RELEASE-1.0-FOUR-DAY-PLAN.md` § 6.4 / § 6.5 has since
   deferred to 2.0. Corrected inside the rewritten file.
3. **`VIDEO_SCOUT_RUN_ROOT` (`app/main.js:192`) is hard-coded with no UI
   override**, unlike `projectsRoot`. Recorded as a known limitation; no code
   change is authorized here.

## 15. Review artifact

```
git diff --output=.agent-review-install-windows-source-tree.diff main...HEAD
```

Artifact size, SHA-256, and independent-twin byte identity accompany the review
request. The artifact is gitignored (`.agent-review*.diff`) and must never be
committed.

## 16. Review class and verdict

**Review class:** Standard documentation review.

Escalation to Full class is **not** triggered: this branch changes and directs no
security boundary, credential mechanism, executable code, settings schema,
installation script, dependency, or machine policy. None of those is authorized
under CM-1.

Reviewer verdict:

Reviewer verdict source:

## Review-diff rule

- Before merge, use `git diff main...<tip>`.
- After merge, reproduce the reviewed delta with
  `git diff d64192ba680d932623e5557793a159076e26d8d6...<tip>`.
- `git diff main...<tip>` may be empty after merge because the branch tip is
  already an ancestor of `main`.
- Always use `--output`; do not use PowerShell `>` for pinned review diffs.
- Retain the literal `VERDICT: PASS|FAIL` line and identify the review that
  produced it. A paraphrase or implied verdict is not a merge-gate verdict.
