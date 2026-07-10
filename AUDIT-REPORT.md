# Blue Helm Deep Audit — Agent Command Center

- **Scope:** every file under `app/` and `scripts/`, read-only, evidence-based.
- **Repo state at audit start:** `main` @ `fad5ebc`, working tree clean (verified: `git status --short` empty, `git log` HEAD = fad5ebc). ✔ meets the "main + clean" precondition.
- **Method:** static read of all sources; ran all local test suites (276/276 green); `npm audit` (0 vulns); `npx @doyensec/electronegativity`. No live/paid API calls made.
- **Auditor stance:** auditing, not fixing. No source file was edited. This report is the only artifact written.

---

## Executive summary — top 5 risks

**1. Renderer XSS via unescaped git branch / worktree names, escalating to arbitrary command execution (HIGH).**
The agent list and grid render `wt.branch` and `wt.path` straight into `innerHTML` template strings (`app/renderer/app.js:371`, `:390`, `:109`). `git check-ref-format` permits `< > & " '` in branch names, so a branch such as `agent/x<img src=q onerror=...>` is a *valid* ref that executes JavaScript in the renderer the moment Command Center lists it. Because the compromised renderer keeps its full `window.cc` bridge, it can call `cc.ptyStart({id, cwd})` (a plain PowerShell PTY needs no role and passes no gate) and then `cc.ptyWrite(id, 'command\r')` — i.e. XSS turns into local command execution. The vector is realistic: cloning a hostile repo or checking out a hostile PR branch is enough to plant the payload. contextIsolation limits the blast radius to the `cc` API surface, but that surface already includes an unfenced shell.

**2. Full `process.env` is injected into every PTY, including internet-capable fenced roles (HIGH, known WO-4).**
`app/main.js:528-532` builds the PTY env as `{ ...process.env, ... }` for *all* panes. `CLAUDE_CODE_SUBPROCESS_ENV_SCRUB=1` only stops Claude Code from forwarding secrets to *its own* subprocesses — it does nothing about what the agent itself can read from its environment. A `web-scout`/`operator`/`source-scout` (which hold `WebFetch`) can read any secret-shaped variable in the inherited environment (a `setx`-persisted `GEMINI_API_KEY`, cloud SDK creds, tokens) and POST it out. This is the documented open item; it remains true.

**3. No navigation or window-open restrictions on the BrowserWindow (MEDIUM; electronegativity rates the class HIGH).**
There is no `setWindowOpenHandler`, `will-navigate`, or `will-redirect` handler anywhere. If the renderer is ever pushed to navigate (a stray anchor, a compromised in-page script, a middle-click), Electron will happily load a remote origin into the main window with the preload bridge attached. Cheap to close, and it caps the damage of risk #1.

**4. The main process trusts the renderer-supplied `task` string without re-validating it (MEDIUM).**
`new-agent`/`remove-agent` (`app/main.js:272`, `:297`) take `task` and feed it into `path.join(dirname(repo), \`${base}-${task}\`)` and into `new-agent.ps1 -Task`. Sanitization to `[a-z0-9-]` happens only in the renderer (`app/renderer/app.js:789`). `execFile` blocks shell injection, but a bypassed/compromised renderer can still pass `..`-laden or HTML-laden task values to place a worktree outside the intended sibling location and create an arbitrary branch name — which is also how risk #1's payload branch would be planted from inside the app.

**5. An invalid/dropped `analysisMode` silently defaults to the most expensive `video` pass (MEDIUM, known).**
`feed-gemini.ps1:87` (`if (-not ContainsKey('Mode')) { $Mode = 'video' }`) plus `video-scout-args.js` dropping an out-of-allowlist mode means a garbage or lost mode value bills the full forensic visual pass rather than the cheap `transcript` default the UI advertises. The *offset* refuse-don't-downgrade invariant is airtight; this is the cost-direction gap that the same philosophy has not yet closed.

---

## Findings table (severity-sorted)

| # | Sev | File:line | Issue |
|---|-----|-----------|-------|
| 1 | HIGH | app/renderer/app.js:371, :390, :109 | Unescaped `wt.branch`/`wt.path` in `innerHTML` → renderer XSS → `cc.ptyStart`+`ptyWrite` command execution |
| 2 | HIGH | app/main.js:528-532 | Full `process.env` spread into every PTY incl. `WebFetch`-capable fenced roles (WO-4) |
| 3 | MEDIUM | app/main.js:127-138 | No `setWindowOpenHandler`/`will-navigate`; renderer can navigate to remote origins (electronegativity: LIMIT_NAVIGATION HIGH, AUXCLICK, SANDBOX) |
| 4 | MEDIUM | app/main.js:272, :297 | Renderer `task` used unvalidated in worktree path + branch name (traversal / arbitrary ref) |
| 5 | MEDIUM | scripts/feed-gemini.ps1:87; app/video-scout-args.js:100 | Invalid/dropped `analysisMode` silently becomes the costliest `video` pass |
| 6 | LOW | app/renderer/index.html:6 | CSP `style-src 'unsafe-inline'`, broad `connect-src https:`, dead `frame-src http://localhost:*` (board no longer embedded) |
| 7 | LOW | app/main.js:165 | `launch()` uses `spawn(..., { shell:true })` with interpolated paths (mitigated by Windows filename rules + quoting) |
| 8 | LOW | scripts/hooks/fence-write.js:51-54 | Fence fails OPEN on malformed input and only matches file-path tools; nothing asserts a fenced role lacks a shell tool |
| 9 | LOW | app/main.js:363-365 | `.claude.json` best-effort write can orphan a `*.tmp` if write/rename throws |
| 10 | INFO | app/video-scout-args.js:53 vs scripts/lib/get-video-source-route.ps1 | Route logic duplicated JS/PS (drift risk) — money path backstopped, prediction can still drift cosmetically |
| 11 | INFO | app/package.json | Electron 42.5.0 newer than electronegativity's knowledge (v22) — can't auto-assess; `npm audit` clean |
| 12 | INFO | app/main.js:383 (verify-fence) | Tool *restriction* relies on the deployed `--agent` role file, not a spawn-time check (cwd sandbox IS enforced main-side) |

---

## Phase 0 — Map

### File inventory

**`app/` (Electron):**
- `main.js` — main process; owns the window, all `ipcMain` handlers, PTY spawns, safeStorage key, fence gate, `.claude.json` pre-trust.
- `preload.js` — the entire renderer↔main bridge (`window.cc`); 1:1 map to IPC handlers.
- `video-scout-args.js` — pure, dependency-free builder/validator for feed-gemini launch args (untrusted-IPC posture); refuse-don't-downgrade for offsets.
- `video-scout-args.test.js` — 75 plain-node tests for the above.
- `renderer/index.html` — UI markup + CSP + script includes + New-Agent modal.
- `renderer/app.js` — all renderer logic: terminals (xterm), modal, agent list/grid, key banner, video-range validation.
- `renderer/pty-parser.js` + `.test.js` — line-buffered ANSI-stripping PTY→chat-event parser (100 tests).
- `renderer/video-range-ui.js` + `.test.js` — clear-on-hide range UI logic, dual browser/CJS (14 tests).
- `renderer/styles.css` — theme + layout.
- `renderer/tts.js` / `stt.js` — Kokoro TTS / Whisper STT (WebGPU, ES modules).
- `package.json` / `package-lock.json` / `.gitignore` / `README.md` — app metadata.

**`scripts/` (PowerShell + Node helpers):**
- `feed-gemini.ps1` — video-scout orchestrator + standalone entry point; route resolution, offset refusal, yt-dlp download, node-direct gemini/SDK invocation.
- `feed-gemini.Tests.ps1` — 8 Pester tests (offset refusal + exit codes).
- `gemini-video-sdk.js` + `.test.js` — REST `generateContent` caller for YouTube URLs (32 tests); key from env only.
- `hooks/fence-write.js` — PreToolUse path fence (Read/Write/Edit) for fenced roles.
- `lib/get-cli-safe-prompt.ps1` — newline-flatten a prompt for the CLI arg boundary (+7 tests).
- `lib/get-node-cli-arg.ps1` — CommandLineToArgvW-correct escaping for PS→node (+9 tests).
- `lib/get-gemini-launch-config.ps1` — model/media-resolution log line + warning (+7 tests).
- `lib/get-video-source-route.ps1` — SDK-vs-CLI routing authority (+11 tests).
- `lib/get-video-scout-run-dir.ps1` / `get-run-output-file.ps1` — per-run dir isolation (+5/+4 tests).
- `lib/get-video-scout-prompt.ps1` — loads the forensic brief (+4 tests).
- `new-agent.ps1` / `.sh`, `list-agents.ps1` / `.sh`, `remove-agent.ps1` / `.sh` — worktree lifecycle.
- `sync-roles.ps1` — deploy `agent-roles/*.md` into `~/.claude/agents/` with the `__CC_HOOK__` fence path substituted.

### Process / trust diagram

- **Main process** (full Node/OS): window, IPC handlers, PTY spawns, safeStorage, git/execFile, settings/secure JSON. The security boundary.
- **Renderer** (contextIsolation:true, nodeIntegration:false): pure UI, no Node; reaches main only via `window.cc`. **Treat as untrusted** for the purposes of main-side validation.
- **PTY children** (PowerShell → claude/codex/gemini/yt-dlp/node): inherit the PTY env; the agent's own tools (Bash/WebFetch/etc.) run here.
- **Hook child** (`fence-write.js`): spawned by Claude Code per file-tool call for fenced roles; stdin JSON, exit 2 = block.

### IPC channels (all via `ipcMain`, bridged in preload) and who validates

| Channel | Input | Main-side validation |
|---|---|---|
| get-settings / save-settings | partial settings obj | none (local settings only) |
| pick-folder / list-repos / list-worktrees / repo-github-url | repo path | path used read-only via git/fs |
| new-agent / remove-agent | `{repo, task}` | **task NOT re-validated (finding #4)**; execFile (no shell) |
| ensure-output-dir | `{role}` | role stripped to `[a-z0-9-]`; mutex + atomic write |
| verify-fence | `{role}` | VALID_ROLES check; verifies deployed fence + Read matcher |
| review-diff | `{worktree, base}` | existsSync check; git execFile |
| open-vscode / open-terminal | path | **shell:true interpolation (finding #7)** |
| open-external | url | `^https?://` only ✔ |
| set/clear/get-gemini-key | key string | non-empty + safeStorage; plaintext never returned to renderer ✔ |
| pty-start | full opts | fenced-role cwd sandbox ✔; videoScout URL allowlist ✔; offset refusal ✔ |
| pty-write / pty-resize / pty-kill | `{id,...}` | id lookup in `ptys` map |
| open-board / pick-board-app | — / path | dialog-gated |

### Dependencies (from `app/package.json`, `npm ls`)

- **prod:** `@lydell/node-pty@1.2.0-beta.12`, `@xterm/xterm@6.0.0` + addons (fit 0.11, unicode11 0.9, web-links 0.12, webgl 0.19), `kokoro-js@1.2.1`.
- **dev:** `electron@42.5.0`.
- `npm audit`: **0 vulnerabilities**. No test framework dep (suites are hand-rolled plain-node + Pester 3.4.0).

---

## Phase 1 — Electron attack surface

- **webPreferences (`app/main.js:133-137`):** `contextIsolation:true`, `nodeIntegration:false`, `preload` set. `sandbox`/`webSecurity`/`allowRunningInsecureContent` not set → secure defaults (sandbox defaults on since Electron 20; webSecurity on). electronegativity flags SANDBOX (MEDIUM/FIRM) because it isn't explicit — recommend setting `sandbox:true` explicitly to document intent. **No deviation from hardened defaults found.**
- **preload surface (`app/preload.js`):** 27 functions, all thin `ipcRenderer.invoke/on` wrappers — reviewed each. The only abusable-by-a-compromised-renderer members are `ptyStart`+`ptyWrite` (spawn a shell PTY and type into it) and `openExternal` (http/https only). These are validated main-side *for their own inputs* but a shell PTY is inherently powerful — this is what makes finding #1 an RCE rather than a defacement. No secret is ever returned across the bridge (key stays in main; `get-gemini-key-status` returns only booleans ✔).
- **Injection sinks:** `grep` for `innerHTML|insertAdjacentHTML|outerHTML|document.write|eval|new Function` across `app/`. **No `eval`/`Function`/`document.write` in app code.** `innerHTML` appears 14× — most are static or numeric/role-controlled, but three render git-derived `wt.branch`/`wt.path` (**finding #1**). **Critically, PTY/agent output is NOT an innerHTML sink:** terminal bytes go through `term.write()` (xterm, safe) and chat bubbles use `inner.textContent` (`app/renderer/app.js:28`). The most-worried-about untrusted channel is handled correctly.
- **CSP (`index.html:6`):** present and mostly tight — `script-src 'self' 'wasm-unsafe-eval' https://cdn.jsdelivr.net` (jsdelivr + wasm-eval needed for the on-device ML models). Weak spots: `style-src 'unsafe-inline'` and `connect-src 'self' https:` (any HTTPS), plus a **dead `frame-src http://localhost:*`** left from the retired embedded board (**finding #6**). No `will-navigate`/`setWindowOpenHandler` (**finding #3**).
- **electronegativity (triaged):**
  - `LIMIT_NAVIGATION` HIGH → **real** (finding #3).
  - `AUXCLICK` / `SANDBOX` MEDIUM → **real-but-partial** (same navigation gap; sandbox is on-by-default but not explicit) — fold into finding #3.
  - `CSP_GLOBAL_CHECK` LOW → **real** (finding #6).
  - `PRELOAD` / `OPEN_EXTERNAL` (×3) "review" → **manually reviewed, all guarded** (openExternal is http/https-gated at main.js:432, app.js:121, app.js:474). False-positive after triage.
  - `DANGEROUS_FUNCTIONS` in `vendor/kokoro.web.js` → **false positive** (vendored ML library, not app code; CSP + no user-content path).
  - `AVAILABLE_SECURITY_FIXES` INFO → **dated tool** (knows only ≤ v22; can't assess 42.5). Keep Electron patched.
- **`npm audit`:** 0 vulnerabilities.

---

## Phase 2 — Fence & trust boundaries

- **Fence gate (`app/main.js:448-474`):** for `role ∈ {web-scout, operator, source-scout}` and not videoScout, the declared `cwd` is realpath-resolved (symlink-safe, case-folded on win32, same logic as the hook) and must be inside `<projectsRoot>/.command-center/outputs`. Refuses with a visible error otherwise. **Enforced in main, not by renderer discipline** — bypass-proof. I traced every path to `pty.spawn` (line 537): the only branches are (a) videoScout, (b) fenced role (gated here), (c) everything else. The recently-added offset-refusal block (`:506-509`) sits *before* `args.push(...geminiArgs)` and returns early — ordering cannot skip it. No path reaches `pty.spawn` around the fence.
- **Tool enforcement per role:** `agent-roles/*.md` `tools:` lines — builder `Read,Edit,Write,Grep,Glob,Bash`; reviewer/codebase-scout `Read,Grep,Glob`; web-scout/source-scout `WebSearch,WebFetch,Read,Write`; operator `Read,WebSearch,WebFetch,Write`. The three fenced roles have **no Bash/shell**, so the file-path fence hook is sufficient *today*. But enforcement lives in the deployed `--agent` role file, not a spawn-time check (**finding #12, INFO**); nothing stops a future edit from adding Bash to a fenced role and slipping past the file-only fence.
- **ENV leakage (WO-4):** confirmed still open (**finding #2, HIGH**). Every PTY receives full `process.env`. Enumerated: whatever the OS session holds — `PATH`, `USERPROFILE`, `APPDATA`, `LOCALAPPDATA`, plus any user/global vars including secret-shaped ones (`*_API_KEY`, `*_TOKEN`, cloud creds). Video-scout additionally gets the decrypted `GEMINI_API_KEY` (intended).
- **API key trace:** `safeStorage.decryptString` → `geminiKey` (main memory) → injected only into the videoScout PTY env (`:531`). Never on argv, never written to disk in plaintext (`secure.json` is DPAPI ciphertext), never returned across IPC, never logged (only its *presence* is logged, `:534`). `gemini-video-sdk.js:110` reads `process.env.GEMINI_API_KEY` exclusively. **Clean.**
- **PowerShell arg passing:** all JS→PS calls use `execFile('powershell', ['-File', script, '-Param', value])` — discrete argv, no shell string. The URL reaches `feed-gemini.ps1` as a bound `[string]$Url` (validated by `validateVideoUrl`, `:67` — allowlist hosts, rejects file:/localhost/link-local/RFC1918/metadata). The PS→node boundary is handled with `ConvertTo-NodeCliArg` (CommandLineToArgvW escaping). The one gap is `task` (**finding #4**) — safe from shell injection but not from traversal/arbitrary-ref.
- **Path handling:** worktree paths come from `git worktree list`; cwd guards use `realOrNearest` + case-fold (shared with the hook) so symlink/case tricks can't split "inside sandbox." `ensure-output-dir` writes atomically (unique temp + rename) under a Promise-chain mutex — race-correct.

---

## Phase 3 — Invariants & correctness

- **Refuse-don't-downgrade (offsets):** enumerated every failure path and all refuse *visibly*:
  - `video-scout-args.js:141-176` — mode-gate, both-or-neither, type/range (`isValidOffset`), end≤start, and CLI-route → sets `error`; `main.js:506` returns `{ok:false}` + `main-error`.
  - `feed-gemini.ps1:60-70,105-107` — lone/mis-ordered offsets, offsets-without-VideoScout, and the **route backstop** (offsets on a non-sdk resolved route) all `throw`.
  - `gemini-video-sdk.js:62-82` — `resolveSliceOffsets`: both-or-neither, missing value, strict `^\d+$` (no coercion), strict order; `main()` exits non-zero.
  - renderer `app.js:734-767` — blocks submission, keeps modal open, no whole-video fallback; clear-on-hide empties hidden inputs.
  This invariant is enforced at all three layers with tests at each. **Solid.**
- **Remaining silent fallbacks (the bug class this repo cares about):** the only silent downgrade I found is **finding #5** — invalid `analysisMode` → costliest `video` mode (opposite of the advertised cheapest-default). Allowlist misses on `videoModel`/`mediaResolution` fall back to the *script's* default, which is documented and low-surprise (acceptable). No other silent fallbacks in `app/` or `scripts/`.
- **Known-issues verification:**
  - stale `analysisMode` → `video`: **still true** (finding #5).
  - cross-process `.claude.json` race: **mitigated in-process** by the mutex (`main.js:337-372`); across *separate* app instances the atomic temp+rename limits corruption but last-writer-wins on trust entries remains theoretically possible (INFO).
  - orphan `.tmp`: **possible** on write/rename throw (finding #9).
  - double log emit: video-scout usage line is intentionally surfaced to Logs (`app.js:217`) in addition to the pane — by design, not a defect.
  - predictVideoRoute vs Resolve-VideoSourceRoute drift: **runtime backstop landed** (`feed-gemini.ps1:105`) so the money path is safe; prediction can still drift cosmetically (finding #10).
- **Error handling:** no empty `catch` hides a security decision — the swallowed catches are cleanup (`p.kill()`), best-effort trust-write (logged), and addon load fallbacks. `uncaughtException` is handled and surfaced (`main.js:122`). `fence-write.js` fails **open** by design on malformed input (finding #8) — a deliberate availability-over-strictness tradeoff worth revisiting.
- **Resource lifecycle:** PTYs killed on pane close (`app.js:223-228`, disconnects ResizeObserver + cancels RAF) and on `window-all-closed` (`main.js:152-156`); worktrees torn down via `remove-agent`. No obvious listener leak.

---

## Phase 4 — Quality, tests, drift

- **Test coverage:** strong and green. `gemini-video-sdk` 32, `video-scout-args` 75, `pty-parser` 100, `video-range-ui` 14, `feed-gemini` 8 (Pester), `lib/*` 47 (Pester) = **276/276**.
  - **3 most dangerous untested areas:** (1) `app/main.js` — the entire IPC/fence/PTY/env layer has **no automated tests** (the security boundary itself); (2) `app/renderer/app.js` non-extracted logic — the `innerHTML` rendering (finding #1) and `createAgent` flow; (3) `scripts/hooks/fence-write.js` — the path fence has no test asserting symlink-escape / traversal / fail-open behavior.
- **Comment/doc drift:** the two previously-fixed stale comments are clean. Remaining: dead `frame-src http://localhost:*` CSP entry (board is now a launched desktop app, `main.js:558-575`); `feed-gemini.ps1` help still leads with `transcript (default)` while the `-VideoScout` path forces `video` when `-Mode` is omitted (minor).
- **Dead code / TODO / logging:** `grep TODO|FIXME|HACK|XXX` → **none**. `tlog()` timing lines are dev diagnostics forwarded to the Logs tab and self-labelled "remove once root cause confirmed" (`main.js:167`) — candidates for cleanup, non-sensitive. **No secret is logged** (verified: only key *presence* strings).
- **package.json:** deps all used; no phantom deps; only script is `start`. `secure.json`/`settings.json` correctly live in Electron `userData`, not the repo; `.gitignore` covers `.env*`, `.agent-review.diff`, `media/`, the large vendored ML bundle.

---

## Suggested fix order (dependencies noted)

1. **Finding #1 (HIGH) — escape branch/path rendering.** Replace the three `innerHTML` templates that interpolate `wt.branch`/`wt.path` with `textContent`/`createElement`. Standalone, highest impact, smallest diff.
2. **Finding #4 (MEDIUM) — re-validate `task` in main.** Apply the `[^a-z0-9-]`→`-` sanitize + non-empty check in `new-agent`/`remove-agent`. *Do this alongside #1* — it also removes the in-app path to plant a malicious branch name.
3. **Finding #3 (MEDIUM) — navigation lockdown.** Add `setWindowOpenHandler(() => ({action:'deny'}))` + a `will-navigate` guard that only allows the local file. Standalone, small; caps residual risk from #1.
4. **Finding #2 (HIGH) — per-role env allowlist.** Depends on the CLAUDE.md prerequisite (remove any `setx`-persisted keys first) and on confirming no PTY relies on an inherited secret. Build an explicit allowlist (`PATH`, `USERPROFILE`, `APPDATA`, `LOCALAPPDATA`, `SystemRoot`, `TEMP`, …) + the per-video-scout `GEMINI_API_KEY`, instead of spreading `process.env`.
5. **Finding #5 (MEDIUM) — safe analysisMode default.** Make a dropped/invalid mode resolve to `transcript` (cheapest) or refuse, matching the offset invariant's philosophy.
6. **Findings #6/#7/#8/#9 (LOW) — hardening pass.** Drop the dead `frame-src`; tighten `connect-src`; switch `launch()` to `shell:false` with discrete args; assert fenced roles carry no shell tool at `verify-fence`; clean up the temp file on write failure.

---

## Three things this codebase does unusually well (don't refactor these away)

1. **Defense-in-depth on the refuse-don't-downgrade invariant.** The "a user who asked for a slice is never silently billed for the whole video" rule is enforced independently at the renderer (UX), the main process (bypass-proof), *and* the token-spending PS/SDK layer — each with its own tests. The route-backstop (`feed-gemini.ps1:105`) specifically closes the JS/PS drift hole at the layer that actually spends money. This is textbook layered enforcement.
2. **Untrusted agent/PTY output is rendered safely.** Terminal bytes go through xterm's `term.write`, and chat bubbles use `textContent`, never `innerHTML`. The single most dangerous channel in an agent UI — model/tool output — was correctly kept out of every HTML sink. (The XSS in finding #1 is git metadata, not agent output — a narrower vector precisely because the obvious one was closed.)
3. **Concurrency-correct, fail-closed trust plumbing.** The `.claude.json` mutex acquires synchronously (no interleaving), writes to a unique temp then renames (atomic, collision-proof), and never deadlocks (release in `finally`). The `verify-fence` check goes beyond "file exists" to confirm the hook path resolves *and* the matcher actually includes `Read` — refusing to launch on a false sense of containment. Both show unusually careful boundary thinking.

---

*Audit complete. No files were modified other than this report. All 276 local tests pass; `npm audit` clean; electronegativity findings triaged inline (Phase 1).*
