# Blue Helm — Master Status & Runbook
### ⭐ Open THIS file first. The other briefs are deep reference only.

**What this is:** the current project-state source of truth plus the historical
Fri→Sun execution plan that produced the present baseline. Use the July 14
checkpoint and the latest handoff for current ordering. The dated Day 0–3
sections remain as provenance and are not an active calendar promise.

**⏱ CURRENT SHIP GOAL:** rebaseline the minimum daily-driver scope with Blue,
then finish that scope over the next few days. Do not treat the expired Monday
target in the historical plan as a current commitment.

**The reference docs (open only when you need deep detail on a step):**
- Historical Video-scout / Gemini SDK detail →
  `docs/source-material/2026-07-14-browser-transfer/expanded/files-1/BLUE-HELM-VIDEO-SCOUT.md`
- Historical fence-security detail (WO-1…WO-7) →
  `docs/source-material/2026-07-14-browser-transfer/expanded/files-1/BLUE-HELM-READ-FENCE-TEST-BRIEF.md`
- Full audit findings → `AUDIT-REPORT.md` (in-repo, @ `fad5ebc`)

**What we're building (one line):** a self-hosted "mission control" desktop app
that runs several AI coding agents in parallel — each sandboxed and supervised —
to build and operate the Starboard business. "Video-scout" is one of those
agents; it analyzes videos via Gemini. Weekend adds the business-command-center
layer: whiteboard, quick widgets, and CRM data.

**Standing rules (do not violate even under time pressure):**
- Feature branches always; `main` is merge-only. One invariant per branch.
- Reviewer verdicts are read **verbatim** at the merge gate — never summarized.
- Failure paths must **refuse visibly** — never silently downgrade/drop.
- The fence gate is sacred: business-widget credentials live main-process-side
  via `safeStorage`, never enter any PTY env, never reach the renderer beyond
  display data. No agent role gets email/CRM access by default.
- Full Electron **process restart** to load renderer/main changes (not reload).
- **OSS POLICY (Blue, July 10 — two layers):**
  **(1) Orchestrator/agent layer — MINE, DON'T ADOPT.** Peer orchestrators are
  a pattern mine (session lifecycle, diff-review UX, kanban states, status
  detection): study, then re-implement behind our fence. Never import their
  code, never adopt one, never switch. Security model + business integration
  stay proprietary.
  **(2) Utility libraries — adopt as whole, vetted deps** instead of building
  from scratch (Excalidraw/esbuild is the model; dockview-core, DOMPurify,
  ripgrep qualify). Vetting gate per dep: permissive license (MIT/Apache/BSD;
  flag GPL/AGPL) · `npm audit` clean · active maintenance + real adoption ·
  pinned in lockfile · telemetry/phone-home checked and disabled · transitive
  weight sanity-checked.
  Across both layers: **never paste code fragments** into security-sensitive
  paths (IPC handlers, PTY plumbing, credential handling, validators) — those
  are always read-and-re-implemented. Whole audited libraries in, loose
  snippets out, peer-orchestrator code never.

## Current checkpoint — July 14 platform transfer

- **Repository baseline:** `main` @ `5e0b923`. The only active work is the
  documentation-only `docs/project-control-plane-sync` branch; no runtime code
  is being changed in this synchronization pass.
- **Live Test D: COMPLETE.** Transcript launch contained no
  `--start-offset` or `--end-offset`, no stale-range `BUG:` line, and reopened
  video fields were empty. The later Gemini 503 is tracked separately under K5
  and does not invalidate the stale-range result.
- **Audio status corrected from “built, needs testing” to “implemented but
  nonfunctional on current main.”** A read-only code scout verified two startup
  blockers: TTS dereferences a Kokoro bundle API that its tracked browser bundle
  does not export, while STT imports a browser module with unresolved bare ONNX
  imports; that STT runtime file is also gitignored and absent from `HEAD`.
  Kokoro, Whisper, Transformers.js, and ONNX Runtime remain the intended OSS
  engines. Repair the integration and packaging; do not rebuild the engines.
- **Routing decision:** ChatGPT desktop with GPT-5.6 is the primary planning,
  architecture, research, review, and project-state layer. Claude Code remains
  the primary coding surface. Codex CLI/IDE remains an optional, separate
  verifier and is deferred for now.
- **Source recovery:** browser-era project files are retained under
  `docs/source-material/2026-07-14-browser-transfer/`, with untouched originals,
  expanded archive contents, hashes, and provenance.

---

## ✅ DAY 0 — SECURITY GATE — **COMPLETE (July 10)**

> **`main` @ `91ca3b7`. Both live HIGHs are closed and merged.** Full detail in
> the DONE section below. Marked complete per Blue; the Day-0 restart + live
> checks are assumed done — **if the full restart (tray too) or the live checks
> (external link → OS browser + `[nav-guard]` refusal line in Logs; agent
> launch works; grid renders clean) have NOT actually been run, do them as
> Day-1 item 4 before spending anything on tests A–D.**

> **PROCESS FIXES (learned the hard way on Day 0's branches — apply to ALL
> future gates):**
> - Generate review diffs with **three dots** (`git diff main...<sha>`), never
>   two. Two-dot diffs compare tip-to-tip and render commits that landed on
>   `main` after branch creation as spurious DELETIONS in the branch's diff.
>   This blocked a clean review once already.
> - **Never ask a fenced read-only role to run pre-flight git commands** — it
>   has no Bash by design. The human runs pre-flight and pastes the output into
>   the brief, or the diff is pinned by content + stated sha (pasting the diff
>   inline failed TWICE on Day 0 — pin a `.agent-review*.diff` file instead;
>   it's gitignored).
> - **A verdict is not a verdict until the literal `VERDICT:` line is read.**
>   A findings list that implies PASS is not PASS. Also: builder sessions will
>   offer courtesy merges of other branches — always decline; every branch
>   waits for its own gate.
> - **Chore-class direct-to-`main` commits are allowed ONLY when all three
>   hold:** zero runtime-code changes · content prescribed verbatim by a
>   Reviewer verdict · verified by execution before push. Anything touching
>   app behavior — however small — goes through a branch and gate.

---

## ✅ DONE — no action needed

**Security**
- **9b — Mode-aware duration guard MERGED to `main` @ `4da1572`** (`--no-ff`,
  three-way, zero conflicts, scripts/+docs only; post-merge verified: all four
  hardening modules + tests present, npm test 205 green, run-pester 105 green,
  zero `shell: true` in app source). Gate history: full review on `cec0473` →
  FAIL (blocking: unproven SDK-route enforcement, false assertion count) → fix
  commit `6074565` (8 findings addressed; probe/guard extracted to
  `scripts/lib/invoke-duration-probe.ps1`; E2E proves `& node` unreachable on
  refusal; `run-pester.ps1` aggregate gate; 0-duration fail-open killed;
  `-MaxDurationSeconds 0` rejected at bind; MediaResolution honest logging;
  `--` before URLs; yt-dlp SDK-route hard-dep documented) → delta review PASS
  (5 non-blocking findings + residuals → P13). Also in-branch: **P10 run-dir
  collision FIXED** (GUID suffix — and P10's open question answered the BAD
  way: it collided rather than threw; real bug, silent-collision class, not a
  flake). Process note: P10 fix landed without stop-and-report — pre-existing
  bugs found mid-gate are report-first. What the guard now holds: ONE
  fail-closed pre-flight probe (duration + is_live) gating BOTH routes before
  any paid call; per-mode caps transcript/audio 14400s · video 5400s ·
  range-slice 1800s; backstop strictly weaker; refusals name
  duration/limit/mode/override.
- **Day-0 #2 + #2b — navigation lockdown + `shell:false` launchers MERGED to
  `main` @ `91ca3b7`** (`--no-ff` merge of `feature/sec-nav-shell`; history:
  `ab5c1c5` security work → `4570e37` chore (main) → `11720b8` review fixes →
  `91ca3b7` merge). What landed: `nav-guard.js` — `setWindowOpenHandler`
  default-DENY with anchored http(s)-only forward-to-OS-browser,
  `will-navigate` AND `will-redirect` fail-closed to exact entry URL, on the
  repo's only BrowserWindow site; `launchers.js` — `shell:false` discrete-argv
  specs, `%`-path refuse-visibly; visible nav-refusal logging through the
  existing `main-error` channel (sanitized: C0-stripped, 200-char cap, into a
  `textContent` sink). Gate history: first Reviewer verdict FAIL (blocking:
  orphaned tests — the P11 rot pattern recurring); fix commit `11720b8`; delta
  review PASS (6 findings, all non-blocking). 114 tests green on the merged
  tree pre-push. **Residuals promoted to P12 (HIGH)** — see PARKED.
- **Test runner fully wired (chore, direct-to-`main` per chore rule):**
  `npm test` now runs all FIVE node suites — nav-guard (26), launchers (13),
  video-scout-args (75), task-name (53), agent-dom (38) = 205 green, non-zero
  exit on any failure. Closes the delta-review's new finding 2 AND the P11
  "tests not wired into any runner" item. Friday's #9 branch stays
  single-invariant — no rider needed.
- **Day-0 #1 — XSS→RCE fix MERGED to `main` @ `25e72ad`.** The live chain
  (hostile git branch/worktree name → `innerHTML` → `ptyStart`/`ptyWrite`) is
  closed: DOM-builder module `agent-dom.js` (`textContent`/`setAttribute`, no
  string-concat HTML for git-derived values), main-side `task` validation via
  `task-name.js` on BOTH new-agent and remove-agent handlers (allowlist charset,
  no separators/`..`/control chars, length cap, Windows reserved-device-name
  rejection), refuse visibly. Remove-path validates independently of create
  (pre-existing hostile artifacts on disk are refused, not `--force`-removed —
  accepted residual documented in P9). Reviewer follow-ups batched in P11.

**Video-scout**
- Persistent analysis prompt (PR #22, merged)
- Model + resolution parameters and modal UI (PR #23, #24, merged)
- CLI argument-escaping bugs fixed (PR #25 + node-direct `ConvertTo-NodeCliArg`, merged)
- Transcript / audio / video mode toggle (merged; **transcript mode confirmed
  working** on a real 12-min video)
- Diagnosed the CLI's hard 20MB video wall → **SDK spike proved the fix and
  answered both cost questions** (LOW res cuts ~65%; section-scoping cuts ~81% of
  billing — both confirmed real)
- **SDK migration merged AND live-verified:** 9-section brief
  verified over SDK; YouTube→SDK routing with CLI fallback byte-for-byte
  unchanged; API key confirmed env-only (no key-file in merged code); per-run
  `usageMetadata` cost logging; `mediaResolution` enforced; section-offset params
  plumbed. **Live tests passed:** whole-video + a 2-min slice that billed exactly
  18.9% of tokens (proportional to duration) with content matching the slice;
  determinism confirmed (numbers reproduced exactly across two runs). 155 tests.
- **Stale-transcript bug fixed, merged, and live-verified:** the CLI transcript/
  audio path used to silently feed Gemini a leftover file from an unrelated prior
  run when a download produced nothing. Fixed by per-run subdirectory isolation
  (stale files structurally unreachable, not just timestamp-skipped); fix sits at
  the single point all three modes converge, so audio is covered too. Live-fired
  against the exact original trigger — now exits cleanly instead of substituting
  stale data. 202 assertions incl. a repro test.
- **Section-select UI built and merged (July 9):** Start/End range inputs in
  the video-scout modal (video mode only, hidden otherwise, cleared on modal
  open), accepting MM:SS / H:MM:SS / bare seconds → integer-seconds
  `-StartOffset`/`-EndOffset`. **Refusal-based validation, two independent
  layers:** renderer blocks with visible inline error; main process
  (`buildVideoScoutArgs` inside the `pty-start` handler, proven main-process via
  require chain + contextIsolation) refuses launch (`{ok:false}` before
  `pty.spawn`) on mode-gate / both-or-neither / type-range / end≤start /
  CLI-route-with-range — never silently falls back to whole-video. Builder
  independently caught + fixed a mode-gate bypass gap. main.js diff: one
  additive ~4-line refusal block, shown verbatim. 75/75 tests + regressions
  green; dry-run proved all five failure classes refuse and valid paths spawn.
  **MERGED July 9** as `bf93993`. A post-merge Reviewer verdict (read verbatim)
  found the refuse-don't-downgrade invariant held only in the JS layer.
- **Range-invariant hotfix built, committed `fad5ebc`, and live-verified:** `feed-gemini.ps1` now
  throws on lone/mis-ordered offsets and wrong-route/non-VideoScout ranges (was
  warn-and-continue); `gemini-video-sdk.js` exits non-zero on lone flag / missing
  value / non-integer / bad order; renderer clears range inputs on leaving video
  mode + resets stale error state + logs any stale-range that slips through. The
  invariant now holds at EVERY spending layer. Tests green across 6 suites
  (276/276). **Live verification A–E is complete.** Two process
  lessons captured as standing rules: verbatim Reviewer reads at the gate;
  feature-branches-always.
- **Deep read-only audit complete (`AUDIT-REPORT.md` @ `fad5ebc`):** 276/276
  suites green, `npm audit` 0 vulns, electronegativity triaged. Surfaced the
  live XSS→RCE chain (Day-0 #1), full-env-to-PTY (P1/#2), missing window-open
  handler (Day-0 #2), task-not-revalidated (Day-0 #1 pair), analysisMode cost gap
  (Fri #9), + 4 LOW/3 INFO. Praised: offset invariant depth, agent output kept
  out of HTML sinks, `.claude.json` mutex + fail-closed verify-fence.
- Fence audit (WO-1)
- cwd enforcement (WO-6) — built + independently reviewed (PASS)
- `claude.json` write-mutex (WO-7) — built + independently reviewed (PASS)
- Env scrub + `setx` GEMINI_API_KEY removal (WO-2) — done + machine restarted
  *(optional 10-sec verify: open a builder pane, `echo $env:GEMINI_API_KEY` → empty)*

---

## 🟠 DAY 1 (FRIDAY) — finish video-scout + establish clean baseline

> **LIVE TEST RESULTS (July 12):** **A ✅** (whole-video + slice both correct;
> slice billed at LOW ≈71 tok/s vs full run's ≈262 tok/s default — empirically
> confirms the SDK-route mediaResolution enforcement AND the old
> logged-but-not-applied trap) · **B ✅** (refused before launch, visible
> message, modal stays open) · **C ✅** (lone `-StartOffset` → pairing check
> at `feed-gemini.ps1:70` throws BEFORE route/probe/yt-dlp/node/Gemini;
> exit 1; refusal explicitly states whole-video is NOT a fallback; $0) · **D ✅**
> (transcript launch contained no `--start-offset` or `--end-offset`, no stale
> range `BUG:` line, and reopened video fields were empty; later Gemini 503 is
> tracked separately under K5) · **E ✅** (90+min video refused: measured=6873 limit=5400,
> honest message, $0, no node launch — probe arg line now live-proven).
> **NEW BUGS from testing → KNOWN ISSUES:** libuv assertion crash on the 503
> error path; no 503 retry/backoff; raw PS exception dump after the honest
> CLI refusal.

> **Note on the range-invariant hotfix:** built + committed `fad5ebc` on
> `main` (parts 1–3 landed: `feed-gemini.ps1` throws on lone/mis-ordered/
> wrong-route offsets; `gemini-video-sdk.js` exits non-zero on bad argv;
> renderer clears range on leaving video mode + resets stale error state).
> The invariant now holds at every spending layer. Live verification A–E was
> subsequently completed; the procedures below are retained as the historical
> test record, not pending work.

> **4. HISTORICAL PREREQUISITE — full Electron restart (completed).**
> `main` moved to `91ca3b7` + the test-runner chore; nothing below is valid
> against a stale process. Quit fully incl. tray; confirm no lingering Electron
> process (`Get-Process electron`); relaunch. Quick live checks if not yet run:
> external link → OS browser + `[nav-guard]` line in Logs · agent launch works
> · agent grid renders clean (whitespace-node cosmetic). Then tests A–D.

> **5. LIVE TEST A — valid slice → proportional billing.** New Agent → role
> video-scout → mode video → range Start `2:00` End `4:00` → 10-min test video
> URL, flash-lite model, LOW res → Create & Launch. Logs tab: launch argv shows
> `--start-offset 120 --end-offset 240`; on response, `usageMetadata` prompt
> tokens land ~20% of the whole-video baseline (script-path measured 18.9%).
> PASS = proportional tokens + content only references 2:00–4:00.

> **6. LIVE TEST B — invalid range → visible refusal.** Modal, video mode,
> Start `4:00` End `2:00` → Create & Launch. PASS = red inline error, red
> borders, modal STAYS OPEN, no pane created, zero spend. Bonus: fix/blank the
> fields, close + reopen modal → fields empty AND no leftover red error
> (confirms the openModal cosmetic fix).

> **7. LIVE TEST C — lone offset via direct CLI → throws, zero spend.** PowerShell
> in repo root, invoke `feed-gemini.ps1` as in a known-good direct run but with
> ONLY `-StartOffset 120` (no `-EndOffset`); then `echo $LASTEXITCODE`. PASS =
> throws immediately (<1s, before any node/network), non-zero exit, no
> `usageMetadata` anywhere. Optional extras (each throws fast, $0): backwards
> `-StartOffset 240 -EndOffset 120`; offsets without `-VideoScout`.

> **8. ✅ LIVE TEST D COMPLETE — stale range cleared on mode switch.** Transcript
> launch contained no `--start-offset` or `--end-offset`, no stale-range `BUG:`
> line, and reopened video fields were empty. The run later encountered Gemini
> 503 throttling; tracked separately under K5 and not a failure of the
> stale-range invariant.

> **8b. LIVE TEST E (NEW, from the 9b merge) — duration guard in anger.**
> (1) Over-limit refusal: video mode, NO range, a video >90min → PASS = refusal
> naming measured duration, the 5400s limit, the mode, and the override flag;
> zero spend; no node launch. (2) The allowed runs in tests A/D double as the
> live proof of the literal yt-dlp probe arg line (verified by inspection only
> until a real probe executes — PASS = probe succeeds, run proceeds).

> **9. FIX audit #5 (MEDIUM) — the last cost-direction gap.** `feed-gemini.ps1:87`:
> invalid `analysisMode` silently defaults to the costliest `video` pass. Branch
> `feature/analysismode-failclosed`. Fail closed (throw) or fall back to the
> cheap transcript mode — decide which, refuse visibly either way. Small; closes
> the one remaining silent-overspend path. Tests for invalid/absent mode.

> **9b. ✅ DONE — Mode-aware duration guard MERGED to `main` @ `4da1572`**
> (see DONE section). Both routes now gated by one fail-closed pre-flight
> probe; per-mode caps 4h/90min/30min-slice; honest refusals; 105 Pester +
> 205 node assertions green on the merged tree. Follow-ups → P13.

> **9c. P8 PULLED UP — timestamps in transcript-mode output.** Was parked; it's
> actually the missing link in the tiered workflow. A transcript without
> timestamps tells you *what* was said but not *where*, so you still can't pick
> the slice for the range picker. Cheap pass → timestamped transcript → pick
> range → expensive video pass on that slice only. Do after #9.

> **✅ RESOLVED (rode with 9b as scoped):** the `MediaResolution='MEDIUM'`
> logged-but-never-sent trap — `Resolve-MediaResolutionLog` now logs APPLIED
> on the SDK route and "requested … NOT APPLIED" on the CLI route. Log what
> happened, not what was requested.

> **After Friday:** video-scout is DONE and verified; the two live HIGHs from the
> audit are fixed and merged; baseline is clean for weekend feature work.

---

## 🟡 DAY 2 (SATURDAY) — heavy build: command-center features (3 parallel panes)

> **How to run Saturday:** three independent feature branches in three builder
> panes — this is Blue Helm building its own command center (dogfood the
> orchestrator). All three run unattended (Pane C's route is pre-decided:
> esbuild). All add renderer UI, so expect small `index.html`/`styles.css`
> friction — merge in size order A→B→C on Sunday and let later branches rebase.
> **Prereq:** Day 0 + Day 1 complete and merged to `main`.

> **10. PANE A — Quick Links panel.** Branch `feature/links-panel`. Config-driven
> business links opened in the system browser. **The security validator IS the
> deliverable:** one main-process IPC handler validates before
> `shell.openExternal` — http/https allowlist ONLY (reject `file:`,
> `javascript:`, protocol-relative `//`, uppercase variants), URL parses clean,
> else visible error. Renderer never calls shell APIs. Links in JSON in userData,
> tiny add/edit/remove UI. Seed: **Starboard Platform** (never the vendor name),
> Stripe, Microsoft 365, GitHub repo, AI Studio. Tests: protocol rejection
> (incl. sneaky cases), config round-trip, malformed config → visible error not
> crash. No new deps; new IPC follows existing allowlist pattern.

> **11. PANE B — Calculator widget.** Branch `feature/calc-widget`. Pure renderer,
> zero IPC, zero deps. **HARD: no eval / no new Function** (audit greps for
> exactly these). Small expression evaluator (shunting-yard/recursive descent):
> `+ - * / %`, parens, decimal, unary minus; divide-by-zero → visible error.
> Keyboard + buttons, session history, copy-result. Extract evaluator to its own
> file (video-range-ui.js dual global/CJS pattern) for node tests. Tests:
> precedence, parens, unary minus, div-by-zero, malformed refuses visibly (never
> silent NaN), input cap. Smallest WO of the day — if it balloons, stop + report.

> **12. PANE C — Whiteboard (Excalidraw, MIT).** Branch `feature/whiteboard`.
> The deep one. **ROUTE DECIDED — no Phase 0 checkpoint needed:** one-shot
> **esbuild** bundle of react + react-dom + @excalidraw/excalidraw → a single
> local `whiteboard.bundle.js`, built by an npm script (`npm run build:whiteboard`),
> loaded via a plain `<script>` tag like the existing renderer files. esbuild is
> a devDependency only; the bundle is committed or built on install — builder
> states which and why. No bundler is introduced for the rest of the app.
> Build: React island mounted into ONE whiteboard div (React stays contained —
> zero React elsewhere). OFFLINE — copy Excalidraw fonts/assets from
> `node_modules/@excalidraw/excalidraw/dist/prod/fonts` into the app's asset dir,
> set `window.EXCALIDRAW_ASSET_PATH` to that local path; acceptance = works with
> networking fully disabled (no CDN fetches at runtime).
> Persistence via new allowlisted IPC (main-process fs only): save/load, path
> FIXED under `userData/whiteboards/` (no renderer-supplied paths), scene JSON
> validated (is-JSON, ~10MB cap), atomic write (tmp+rename), debounced autosave +
> manual save. Errors surface visibly (never silently drop a scene). v1 = single
> board "default". Agents get NO access to whiteboard IPC/files. Deps limited to
> react, react-dom, @excalidraw/excalidraw (+ esbuild devDep). Tests: IPC
> validator (size cap, non-JSON, path fixed), atomic write, load-missing → clean
> empty board. Manual: draw → quit → relaunch → intact, offline.

> **Saturday stretch (only if all three panes are clean early):** start the
> Sunday CRM Phase 0 (item 15) so Sunday is pure execution.

---

## 🟢 DAY 3 (SUNDAY) — CRM integration + cleanup + merge + ship-check

> **Sunday is deliberately lighter on new build.** One integration, then merges,
> then verification. Do NOT start new features Sunday afternoon — protect the
> ship.

> **13. Merge Saturday's panes** (size order A→B→C, each rebased). Per branch:
> verbatim Reviewer read → your read-through → merge → note in DONE. After all
> three: FULL Electron restart, confirm links/calc/whiteboard all work together.

> **14. Fix any CRITICAL/HIGH the audit surfaced** that isn't already handled
> (Day 0 took #1/#3/#4). Then knock out remaining audit LOWs as a batch:
> CSP dead `frame-src`, `shell:true` in `launch()`, fence fail-open/file-only
> matcher, orphan `.tmp`. Branch `feature/audit-lows-cleanup`.

> **15. CRM (Hexona) data — MCP route.** DECIDE THE ROUTE FIRST (audit Phase 2
> env-leakage findings inform this):
> - **Zero-code (fastest):** give a designated agent role the LeadConnector MCP
>   endpoint `https://services.leadconnectorhq.com/mcp/anthropic/v2` (OAuth or
>   PIT, scoped per sub-account). Config not code — BUT an agent then touches CRM
>   data, so the fence question comes first: which role, what scopes, confirmed
>   against the env-allowlist work.
> - **In-app panel (cleaner boundary, more build):** main-process client calls
>   the MCP/API with a PIT in `safeStorage`; renderer shows read-only display
>   data only. No agent access.
> Either way: **client-facing label is "Starboard Platform" / "third-party
> infrastructure" — never Hexona/GoHighLevel.** v1 scope = read-only (contacts
> or pipeline count), not writes. Note: the `GHL_MCP_X_CLAUDE` connector needs
> authorization first (claude.ai connector settings / `claude mcp`).

> **16. SHIP CHECK (Sunday night).** All green before calling it shippable:
> full test suite green (all node + Pester suites) · `npm audit` clean ·
> re-run electronegativity, no new HIGH · FULL restart + smoke test every
> surface (agent launch, video-scout slice, links, calc, whiteboard persist,
> CRM read) · `main` clean, all weekend branches merged + local branches
> deleted · AUDIT-REPORT top-5 all resolved or consciously deferred with a note.

---

## ⏸ PARKED — Fence-security cleanup (post-ship unless time permits Sunday)

> **P1. WO-4 — per-role env allowlist** (AUDIT #2, HIGH). Fenced roles still get
> full `process.env` incl. WebFetch-capable roles that can exfiltrate secret-
> shaped vars (`app/main.js:528-532`). Scope env per role. **If CRM route in #15
> is the zero-code agent path, this becomes a Sunday must-do, not parked** —
> giving an agent CRM access while it can also see all env is the exact risk.

> **P2. Finish WO-6 live tests** — steps 2–4: missing-cwd refusal, wrong-directory
> refusal, builder-unaffected. (Step 1 happy-path already passed.)

> **P3. Finish WO-7 live tests** — steps 2–3: concurrent launches (one trust
> entry per sandbox), read-only error path. (Step 1 already passed.)

> **P4. WO-3 — fail-closed guard** — refuse launch if a fenced role is ever given
> Bash/Glob/NotebookEdit. (Not started.)

> **P5. WO-5 — git hygiene check** — confirm clean commit history across merges.

> **P6. Batch the non-blocking review follow-ups** (all small): shared
> `realOrNearest` module · drop the root-equality branch · gate `videoScout` on
> role identity · dedupe the double log emit · document the cross-process
> `claude.json` race · assert `CLAUDE_CODE_SUBPROCESS_ENV_SCRUB` honored at
> runtime · runtime backstop for route drift (assert in `feed-gemini.ps1`:
> refuse if offsets present && route == CLI) · delete merged local branch
> `feature/section-select-ui` · quiet the `[nav-guard] forwarded` line on
> NORMAL link clicks if Logs gets noisy (blocked-case logging stays — only the
> forwarded case is a candidate; refuse-visibly is not negotiable) · drop the
> now-redundant literal `.agent-review.diff` line in `.gitignore` (wildcard
> covers it).

> **P9. Path-based worktree removal (design change, own Reviewer pass).** Today
> `remove-agent` reconstructs the worktree path from a name read back out of
> persistent state (`taskOf` → `Join-Path parent "$repoName-$Task"` →
> `git worktree remove --force`). The Day-0 fix validates that name main-side
> and refuses bad ones, which closes the hole. The cleaner design removes by the
> **known path from `git worktree list`** (existence-checked), eliminating the
> name round-trip entirely. NOTE: this introduces a new untrusted-input parser
> (`git worktree list` output) — that parser is exactly how this bug class gets
> reintroduced in a new location, so it needs its own Reviewer pass, not a
> fold-in. **Known accepted residual until then:** a worktree whose `taskOf()`
> yields a name outside `[A-Za-z0-9_-]` (e.g. the `wt.branch` fallback
> `agent/foo`, or a hand-created odd name) is now REFUSED by the Remove button
> and must be cleaned up via `git worktree remove` at the CLI. Correct direction
> (refuse rather than run `--force` on a weird path), but it means the app will
> not clean up a hostile artifact planted before the fix.

> **P11. Reviewer follow-ups from the Day-0 security branch** (non-blocking,
> batch them): `repo` remains unvalidated in BOTH new-agent and remove-agent
> handlers (`main.js:287/293/337`) — a bypassed renderer can point `cwd` at any
> directory, and `path.dirname(undefined)` throws an unhandled IPC rejection;
> validate it's a non-empty string + an existing dir inside `projectsRoot`. (The
> fix commit validated one of the two untrusted fields of the same IPC payload
> and left the other — worth naming so it doesn't read as "this handler is now
> validated.") · `JSON.stringify` in the remove refusal escapes C0 controls but
> NOT U+202E (RTL override) or U+2028/9 — cosmetic log-line spoof only,
> reachable via the `taskOf` fallback; strip/escape non-ASCII or document bidi
> as out of scope · `updateModalHint()` (`app.js:608-616`) is the last
> string-concatenated `innerHTML` in the renderer — not exploitable today (values
> come from static dataset attrs) but it's the one pattern a future edit could
> point at a git-derived value · ~~`agent-dom.test.js` and `task-name.test.js`
> not wired into any runner~~ **RESOLVED July 10** — `npm test` now runs all 5
> suites (chore commit on `main`) · NEW from the sec-nav-shell delta review:
> the `webContents.send('main-error', …)` refusal emit is asserted by contract
> only, not end-to-end — add an E2E assertion when this batch runs.

> **P12. (HIGH — from the sec-nav-shell delta-review residuals) cmd.exe
> argument re-parsing on the VS Code-open path is NOT closed by `shell:false`,
> and the in-code comment overstates the guarantee.** `launchers.js:31-35`
> routes open-vscode through `cmd.exe /c code <path>`; Node/libuv only quotes
> an argv element containing whitespace/tab/quote, so a directory path with
> `& | ^ < > ( )` and NO spaces reaches cmd.exe verbatim and is re-parsed into
> a second command — **code execution, not path-confusion**, i.e. exactly the
> threat `launchers.js:5-8` claims to defeat; the `%`-only refusal does not
> cover it. **7th instance of the recurring lesson: the guard (`%` refusal)
> sits where the bug was noticed; the dangerous operation (cmd.exe re-parse)
> happens one layer down.** Exposure today: pre-existing hostile artifacts
> only (post-`25e72ad`, task validation blocks such names at create) + trusted
> renderer — same accepted-residual class as P9, which is why this is parked
> not Day-blocking. FIX AS ONE BRANCH, ONE GATE: (a) refuse-visibly any dir
> containing cmd metacharacters `& | ^ < > ( )` — same posture as `%`;
> (b) spawn the resolved `code.cmd`/`Code.exe` directly with `shell:false` +
> explicit quoting control (no cmd.exe intermediary); (c) correct the
> overstated comment at `launchers.js:20-25` — log what's true, not what was
> intended; (d) close the companion residual TOGETHER: `open-vscode` /
> `open-terminal` accept an arbitrary dir with no path validation
> (`main.js:499-504`, `preload.js:25-26`) — post-fix it's an "open arbitrary
> folder" primitive, but it's what makes the metachar bug reachable from a
> compromised renderer, so the two multiply and merge as one fix;
> (e) fold in the deferred Finding 3: a Windows-guarded end-to-end test that
> spawns the ACTUAL cmd.exe spec against a harmless `&`/`|` path (the current
> "proof" test spawns node, and its META string contains spaces so it would be
> quoted regardless — it cannot detect this class).

> **P10. ✅ RESOLVED (in the 9b branch, `6074565`).** `New-VideoScoutRunDir`
> same-millisecond collision was REAL (it collided under the aggregate Pester
> runner — answered the open question the bad way: reuse, not throw). Fixed
> with an 8-char GUID suffix; uniqueness is now structural; no consumer parses
> the run-dir name (verified by the Reviewer).

> **P13. Duration-guard follow-up batch (from the PASS verdict's findings +
> residuals — none blocking, none load-bearing today).**
> **Chore-class, do FIRST (both qualify under the chore rule once verified by
> execution):** (a) **Pester version pin in `run-pester.ps1`** — currently
> imports highest-installed with no pin while every suite is Pester 3.4
> syntax, and its own remediation hint (`Install-Module Pester`) would install
> Pester 5 and break the entire gate; pin `-MaximumVersion 4.99.99` and fix
> the hint. The gate must not carry its own self-destruct instruction.
> (b) **`docs/PROJECT-STATE.md` still documents `GEMINI_API_KEY` via `setx`**
> — the exact PTY-env key-exposure pattern CLAUDE.md §8 forbids; point at the
> in-app secure entry + add the `setx` removal command.
> **Batch (one branch, one gate):** positive-control test for the E2E node
> tripwire (one allow-case asserting `NodeReached = $true` — turns the proof
> from reasoned-correct to observed-correct) · step-0 slice refusal in
> `Resolve-DurationGuard` (`HasRange -and EndOffset -le StartOffset` ⇒ refuse
> — same fail-open shape as the `<=0` duration seam 9b killed, currently
> shielded only by upstream validation) · `try/finally` around the lib suite's
> global job-cmdlet stubs (stub leakage into the E2E suite would hollow out
> the one test that must run real code) · surface the swallowed probe-fault
> exception (`Write-Host` the message before returning null — refusal stays,
> operator learns the cause) · anchor `Resolve-NoFileMessage`'s
> `'does not pass filter'` match to yt-dlp's line shape (title-influenceable
> substring drives a message branch) · make `$ProbeTimeoutSec` /
> `$MaxDurationSeconds` explicit parameters of `Assert-DurationGuard` (both
> ambient-scope reads fail closed by ACCIDENT today, not construction) ·
> DECIDE the `-MaxDurationSeconds` ceiling (86400 lets one logged flag lift
> the video cap 16×/slice cap 48× — lower to 14400, or gate above-default
> overrides behind a second explicit flag) · ONE manual live probe run against
> a real over-limit video (the literal yt-dlp arg line is verified by
> inspection only — see also LIVE TEST E) · latent: `Resolve-DurationGuard`
> callable with transcript/audio + HasRange applies the slice cap
> (unreachable from feed-gemini.ps1; add a refusal or ValidateScript).

> **P7. Budget guardrail** — using real `usageMetadata` token numbers (not
> estimates). Better built next week with a week of real data accumulated.

> **P8. (PULLED UP → Day 1 item 9c)** Timestamps in transcript-mode output.

---

## 🐛 KNOWN ISSUES — backlog, not blocking

> **K5 (NEW, July 12 live testing). SDK-route 503 path crashes node** —
> flash-lite 503 (high demand) was followed by
> `Assertion failed: !(handle->flags & UV_HANDLE_CLOSING), src\win\async.c:94`
> — a native libuv crash instead of a clean non-zero exit. Refuse visibly,
> never segfault: make the error path close handles once and exit cleanly with
> the upstream message. PAIR WITH: retry-with-backoff for 503/UNAVAILABLE
> (2–3 attempts, jittered) — flash-lite demand spikes make this a daily
> annoyance otherwise.

> **K6 (NEW, July 12). Direct-CLI refusal dumps raw PS exception scaffolding**
> after the honest message (`CategoryInfo`/`FullyQualifiedErrorId` noise from
> the `throw` at `invoke-duration-probe.ps1:86`). Message-first is correct;
> suppress or soften the stack dump on the standalone path (cosmetic).

> **K7 (VERIFIED, July 14). TTS and STT controls are visible but both engines
> fail during module startup.** TTS assumes `env.backends.onnx` exists on the
> Kokoro browser bundle even though that bundle exports only `env.wasmPaths`.
> STT's local Transformers browser file begins with unresolved bare imports for
> `onnxruntime-common` and `onnxruntime-web`; the file is also gitignored and
> absent from `HEAD`, so fresh clones cannot load it at all. Fix on separate
> `feature/tts-bootstrap-fix` and `feature/stt-bootstrap-fix` branches with
> fail-visible initialization and bootstrap contract tests. Do not vendor or
> rewrite model internals as part of these repairs.

> **K8 (VERIFIED, July 14). Audio integration hardening follows bootstrap.**
> Dictation currently targets whichever pane is active when transcription
> finishes rather than the pane where recording began. The Electron permission
> handler allows the broad `media` permission class without proving audio-only
> scope or checking the requesting origin. Repair separately after K7 so
> functionality and permission changes receive distinct Reviewer gates.

> **K1. Video download cleanup / auto-delete** — every run now creates a
> `run-<timestamp>-<PID>` subdir under `downloads\` that is never cleaned up (a
> side effect of the stale-file fix — correct tradeoff, but it raised the
> disk-growth rate). Add auto-delete after a successful Gemini analysis, and/or a
> retention sweep. Not urgent (files are small), but do it before the tool runs
> unattended for long stretches. **Durable resolution is V5(c); K1 remains open
> until manifest-scoped retention and media cleanup are implemented and gated.**

> **K2. Clipboard copy-paste** — flaky in panes generally, and likely **never
> covered for the video-scout pane at all** (the original fix targeted the
> standard Claude pane path). Treat as "add coverage for the Gemini pane."

---

## 📆 NEXT WEEK — deferred weekend features (ranked out of this weekend's scope)

> **N1. Outlook email via Graph API** — official path is MSAL-node (NOT
> msal-browser) + auth-code-flow-with-PKCE in Electron; sample repo
> `Azure-Samples/ms-identity-javascript-nodejs-desktop`. Needs Entra app
> registration + `Mail.Read` scope beyond default. Heaviest lift; dovetails with
> the in-flight Google→M365 migration. Tokens live main-side via safeStorage,
> never in PTY env.

> **N2. Usage/cost dashboard** — cross-vendor spend visibility (Claude/Codex/
> Gemini). Deliberately deferred: better with a week of real `usageMetadata`
> accumulated to design against. Partly overlaps P7 budget guardrail.

---

## 🚀 DAILY-DRIVER ROADMAP (v1.x, post-ship) — mine patterns, adopt utilities

**Blue's directive (July 10): this app is the daily driver. Stop building from
scratch where proven OSS exists; adopt and integrate.** The parallel-agent
orchestrator space matured fast — a dozen-plus open tools now do worktree-based
parallel agents, and their common feature set is effectively the daily-driver
spec. Roadmap below maps each goal to the OSS that provides it or proves it.

**⚖️ STRATEGY — DECIDED by Blue, July 10: MINE, DON'T ADOPT.** Blue Helm's core
stays Blue Helm's. The OSS orchestrators (`parallel-code`, `crystal`, Emdash,
Claudette, Composio AO…) are treated as a **pattern mine**: study their session
lifecycles, diff-review UX, kanban states, status-detection heuristics — then
re-implement the good ones behind our own fence. **Never import their code,
never adopt one, never switch.** The agent layer converges toward the field by
learning; the security model and the Starboard business integration stay
proprietary. (Scope note — Claude's interpretation, flagged as such: "never
import" applies to the orchestrator layer. Neutral utility libraries —
Excalidraw, dockview-core, DOMPurify, ripgrep — remain adoptable as whole,
vetted deps per the standing rule; that's what "don't reinvent the wheel"
buys us without ever pulling peer-orchestrator code into a key-holding app.)

**SCOPE — DECIDED: daily driver = coding/agent orchestration + business ops
(CRM, email, cost).** Personal productivity (notes, personal tasks, life
planning) is OUT of scope — that stays in existing tools. This confirms N1
(Outlook/Graph), R6 (cost dashboard), and the CRM panel as first-class roadmap
citizens, and frames R5's kanban as work management, not a life organizer.

**🎯 V-SERIES — REQUIRED FOR DAILY-DRIVER FUNCTIONALITY (Blue, July 12, from
live testing — these are NEEDS, not wants; V1 blocks the tool's whole point):**

> **V1. Pane output must be fully readable and copyable.** Today: no
> horizontal scroll, no pane maximize/fullscreen, text runs off-screen,
> selection/copy unreliable (K2) — the analysis is effectively trapped in the
> viewport. Fix as a bundle: pane maximize (fullscreen a single pane and
> back) · proper wrap/scrollback so nothing is unreachable · reliable
> select/copy in ALL panes incl. video-scout (closes K2) · a "Copy output" /
> "Open report" button on video-scout panes that opens the run-dir report
> file directly. INTERIM (works today): every run's full output is already on
> disk in its `run-<timestamp>-<PID>` dir — open the report file; the pane is
> only a viewport.

> **V2. TLDR in the analysis output.** Prompt-template change: lead the
> report with a TLDR block, and give each major section its own one-line
> TLDR. (The nine-section Gem prompt had this shape; the video-scout template
> apparently doesn't — port it.) Cheap, high value, can land as a
> scripts-only branch anytime.

> **V3. Pre-analysis direction + post-analysis follow-up Q&A.** Two halves:
> (a) BEFORE: an optional "focus/instructions" free-text field in the New
> Agent modal, injected into the analysis prompt (validated/escaped — it
> crosses into a paid prompt). (b) AFTER: the pane is a PTY, so freeform
> questions have nowhere to go today. Design options, in effort order:
> open-report button + "ask any LLM" workflow (V1 delivers this) · a
> follow-up input on the video-scout pane that re-invokes the SDK with
> report+question as context (no re-ingest of the video = cheap) ·
> full chat-continuation mode. Start with the first, spec the second.

> **V4. Multi-slice in one run.** e.g. `3:00–5:30` AND `7:10–9:00` in one
> pass on one agent. Design constraints: per-slice validation (each end >
> start) · guard gates on TOTAL sliced seconds vs the 1800s cap (N slices
> must not multiply cost past the cap) · SDK `videoMetadata` takes ONE
> offset pair per part, so multi-slice = multiple content parts or
> sequential calls aggregated into ONE report with per-slice sections (each
> with its V2 TLDR) · UI: repeatable range rows in the modal. Spec first —
> this touches the guard, so it gets a full gate.

> **V5. ANALYSIS LIBRARY — in-app history of all video-scout runs.** Today runs
> live as `run-<timestamp>-<PID>-<guid>` directories, are identifiable only by
> folder name, and are viewable only through Explorer.
>
> **(a) Per-run manifest.** Write a versioned JSON manifest inside each new run
> directory containing: run ID, source URL, video title, mode, route, model,
> media resolution as actually APPLIED, slice offsets when present, start/end
> timestamps, `usageMetadata` token counts, report filename, and terminal
> outcome (`completed`, `refused` with reason, or `error` with sanitized reason).
> Create it when an accepted launch creates the run directory and update it
> atomically. Renderer-only validation failures that never launch are not
> library runs. Provide a one-shot best-effort backfill script for existing run
> directories.
>
> **(b) Library pane.** Add a sortable/filterable in-app list by date, title,
> mode, route, outcome, and tokens. Selecting an entry opens its report in-app
> using V1's readable, copyable, maximizable report reader. Cross-report
> full-text search can ride R8 later. **V1 is a prerequisite for this reader.**
>
> **(c) Retention.** Keep manifests and reports indefinitely because they are
> the durable asset. Automatically delete downloaded media after successful
> analysis, and provide a retention sweep for abandoned/error media. Never
> delete a file merely because it happens to be inside a run-like directory;
> cleanup deletes only media recorded as belonging to that run.
>
> **(d) V3 hook.** “Ask a follow-up” from a library entry reuses the stored
> report as context without re-ingesting the video.
>
> **Security constraints.** Manifest writing is scripts-side and receives its
> own normal branch and Reviewer gate. The library pane is app-side and receives
> a separate branch and gate after V1. Video titles, URLs, error text, and all
> other run-derived strings are untrusted. Build DOM with `textContent`/safe
> attributes, never `innerHTML`. Renderer code never supplies arbitrary
> filesystem paths; main-process IPC resolves fixed run-root paths, validates
> manifest/report size and schema, and refuses malformed or escaping paths
> visibly.

**TIER 1 — Blue's ranked order (July 10):**

> **R1. In-app diff viewer + merge-gate UI. ← RANKED #1.** Render the three-dot
> diff in-app (`diff2html` MIT, or Monaco's diff editor), with the Reviewer
> verdict pasted verbatim alongside and a merge button that is DISABLED until a
> verdict is attached. Turns three standing rules (three-dot diffs, verbatim
> verdicts, merge-only `main`) from discipline into mechanism. Pattern-mine:
> Orca / `parallel-code` diff-and-merge UX — studied, then built our way.

> **R2. Session persistence / restore. ← RANKED #2.** Relaunch reopens the pane
> grid, worktrees, roles, and (where the CLI supports it) resumes sessions
> (`claude --resume`). Pattern-mine: Claudette, Composio AO, clideck session
> lifecycles.

> **R3. Dockable / resizable pane layout. ← RANKED #3.** `dockview-core` (MIT,
> vanilla-JS — no React needed outside the Excalidraw island): drag, split,
> tab, persist layouts. Replaces hand-rolled grid CSS as panes multiply
> (links, calc, whiteboard, CRM, video-scout…). This one IS a utility-dep
> adoption, not a pattern-mine.

> **R4. Agent status detection + notifications. ← RANKED #4.** Detect idle /
> awaiting-input / done from PTY output; Windows toast + tray badge + optional
> sound. The app should interrupt Blue, not require polling it. Pattern-mine:
> `parallel-code` status heuristics + CI-settle notifications.

**TIER 2 — daily-driver comfort:**

> **R5. Kanban board bound to branches/worktrees.** Cards = tasks; columns =
> building / gate / merged; card actions spawn agents. Pattern-mine: Vibe Kanban,
> nimbalyst, multica. Could subsume this very status doc.

> **R6. Per-pane token/cost meter + cross-vendor dashboard.** Absorbs N2 + P7.
> Claudette's segmented context meter (streamed usage events, per-turn
> input/output/cache breakdown) is the design to study.

> **R7. Command palette + keyboard-first shortcuts.** Every action reachable
> without the mouse; per-role presets (`parallel-code` pattern).

> **R8. Log/output search.** Bundle `ripgrep` (via `vscode-ripgrep`) across
> pane logs and video-scout run dirs.

**TIER 3 — polish and reach:**

> **R9. Per-task setup/teardown scripts + port injection.** Emdash's
> `$EMDASH_PORT` pattern — each worktree task gets a unique injected port, so
> parallel dev servers never collide. Adopt the pattern (config-file-driven).

> **R10. Remote/mobile monitoring.** `parallel-code` does QR-code phone access
> over Tailscale. HIGH fence implications (a network listener on the box that
> holds keys) — if pursued, it gets its own audit-grade review, not a fold-in.

> **R11. Themes / dark-mode polish.** Cheap goodwill; CSS variables already
> made this easy.

> **R12. Auto-update + crash reporting.** `electron-updater`; crash reports
> local-only unless explicitly opted in.

> **R13. Markdown + Mermaid rendering of agent output/plans.** `marked` +
> `DOMPurify` MANDATORY (we just spent Day 0 killing an `innerHTML` RCE — no
> rendered HTML from agent output without sanitization, ever), `mermaid` for
> plan diagrams. Claudette renders plans/reviews this way.

> **R14. PR/CI status watcher.** Poll GitHub checks for pushed branches →
> R2 notification when they settle.

**THE PATTERN MINE (study only — their code never enters this repo):**
`johannesjo/parallel-code` (MIT; Electron; the closest feature-set match),
`stravu/crystal`, Emdash (YC W26, open source; strongest worktree
setup/teardown story), Claudette (MIT, Tauri/Rust — architecture + UX ideas,
not code-compatible), `ComposioHQ/agent-orchestrator` (Apache-2.0; note: ships
PostHog session-recording telemetry ON by default — exactly why the vetting
gate checks telemetry), `andyrewlee/awesome-agent-orchestrators` (the index).

---

*Historical July 10 update rule: completed items moved to DONE and the Day 0–3
plan ran top-to-bottom without skipping security or verification gates. The old
Sunday/Monday deadline is no longer active. Current work follows the July 14
checkpoint and latest handoff; security, testing, and human merge gates remain
non-negotiable regardless of the rebaselined ship date.*

---

## 🗺 HISTORICAL SHIP PLAN AT A GLANCE — NOT THE CURRENT QUEUE

This block preserves the July 10 plan. Use the July 14 checkpoint and
`BLUE-HELM-CHAT-HANDOFF-4.md` for current execution order.
- **Day 0:** ✅ **COMPLETE** — `main` @ `91ca3b7`; both HIGHs merged; 205 tests wired + green.
- **Day 1 (Fri):** live tests A–E ✅ → next: #9 analysisMode fail-closed → V2 TLDR → 9c timestamps. (9b ✅ merged @ `4da1572`.)
- **Day 2 (Sat):** heavy build — 3 parallel panes: links, calculator, whiteboard.
- **Day 3 (Sun):** CRM (MCP) + merge Sat panes + audit-LOW cleanup + ship-check.
- **Monday:** ship, if #16 is all green.
