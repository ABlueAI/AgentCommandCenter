# Blue Helm — Master Status & Runbook
### ⭐ Open THIS file first. The other briefs are deep reference only.

**What this is:** the single ordered to-do list across the whole project,
organized into a **Fri→Sun ship plan** (target: shippable by Monday). Inside
each day, do items top-to-bottom. Done work is listed at the bottom with no
numbers.

**⏱ SHIP GOAL:** everything green by end of Sunday → ship Monday. Heavy
build Fri–Sat; Sunday is cleanup, merges, and final verification only.

**The reference docs (open only when you need deep detail on a step):**
- Video-scout / Gemini SDK detail → `BLUE-HELM-VIDEO-SCOUT.md`
- Fence-security detail (WO-1…WO-7) → `BLUE-HELM-READ-FENCE-TEST-BRIEF.md`
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
- Reference OSS gets **read and re-implemented**, never pasted (this app holds keys).

---

## 🔴 DAY 0 (TONIGHT / FRIDAY AM) — SECURITY GATE, do before anything else

> **The audit found a live XSS→RCE chain on `main`. No feature work until #1–#2
> are merged.** A hostile git branch/worktree name renders unescaped into the UI
> and can reach `ptyStart`/`ptyWrite` = command execution. This is not a
> someday-HIGH; it is shippable-blocker #1.

> **1. ⬅ START HERE — FIX #1 + #4 together (XSS→RCE).** Branch
> `feature/sec-escape-validate`.
> - `app/renderer/app.js:371 / :390 / :109` — git branch/worktree names rendered
>   via `innerHTML` unescaped. Git allows `<>&"'` in ref names → renderer XSS →
>   `cc.ptyStart`+`cc.ptyWrite` → local command execution. Fix: escape all three
>   sites (use `textContent`, or a single escape helper — match how untrusted
>   PTY output is already safely handled elsewhere).
> - PAIR WITH audit #4: `task` from the renderer flows into worktree paths /
>   branch names with no main-side re-validation (traversal / arbitrary ref).
>   Add main-process validation: allowlist charset, reject path separators /
>   `..` / control chars, length cap, refuse visibly.
> - **DISCOVERED DURING PHASE 0 (second sink, worse than #4 as written):** the
>   REMOVE path reads a git-derived name back out of persistent state
>   (`taskOf` → `execFile powershell -Task` → `Join-Path parent "$repoName-$Task"`
>   → `git worktree remove --force`). Not render-only: it is a path +
>   destructive-command sink. `execFile` closes shell injection, but NOT path
>   injection (`..` / `../../other-repo` resolves outside the intended location,
>   then `--force` removes even dirty worktrees). "git produced it so it's safe"
>   fails twice: `taskOf` returns a sliced folder basename or `wt.branch`
>   fallback (neither restricted to safe charset; `check-ref-format` permits
>   `< > & " ' ( ) ! $ @ { }`), AND a create-time gate cannot retroactively
>   sanitize names already on disk from before the fix. Remove therefore
>   validates INDEPENDENTLY of create. Follow-up redesign → P9.
> - Tests: hostile ref-name renders inert (assert no HTML execution); `task`
>   with `../`, separators, control chars, over-length all refused main-side.
> - GATE: verbatim Reviewer read on the diff (renderer + main both touched).

> **2. FIX #3 — window-open / navigation lockdown.** Same branch or a fast
> follow. Add `setWindowOpenHandler` (deny or allowlist) and a `will-navigate`
> handler on every BrowserWindow. Electronegativity rates this class HIGH.
> Tests/manual: external links can't hijack the app window.

> **2b. RE-RATED from audit LOW → do before Saturday: `launch()` uses
> `spawn(..., {shell:true})` with a git-derived path.** `main.js:463-464` →
> `launch()` `:168`. `wt.path` comes straight from `git worktree list` and is
> only double-quote-wrapped. The audit rated this LOW assuming nobody controls
> `wt.path`. **The Day-0 fix's entire premise is that an attacker CAN control
> branch/worktree names** (hostile repo, PR, or pre-existing artifact). On
> Windows the quote-wrap holds; under the WSL2 fallback `CLAUDE.md` sanctions,
> `sh -c` gives `$(…)` and backticks inside double quotes — and those chars are
> legal in directory names. Fix: `shell:false`, pass the path as a discrete
> argv element, drop the manual quotes (what `execFile` already does everywhere
> else in this file). Own branch, own gate.
> **LESSON (recurring, 4th instance): a finding's severity is a function of the
> threat model in force when it was written. Fixing an upstream bug can silently
> invalidate every downstream severity rating. Re-check LOWs after any threat-
> model change.**

> **3. Live-verify the security fixes, then FULL restart.** Quit fully (tray
> too), relaunch, confirm normal operation. These merge to `main` first so all
> weekend branches build on a safe base. Also eyeball the agent list/grid —
> the DOM-builder rewrite omits whitespace text nodes (claimed invisible under
> `display:flex; gap:`); confirm visually.

> **PROCESS FIXES (learned the hard way on this branch, apply to all gates):**
> - Generate review diffs with **three dots** (`git diff main...<sha>`), never
>   two. Two-dot diffs compare tip-to-tip and render commits that landed on
>   `main` after branch creation as spurious DELETIONS in the branch's diff.
>   This blocked a clean review once already.
> - **Never ask a fenced read-only role to run pre-flight git commands** — it
>   has no Bash by design. The human runs pre-flight and pastes the output into
>   the brief, or the diff is pinned by content + stated sha.

---

## ✅ DONE — no action needed

**Video-scout**
- Persistent analysis prompt (PR #22, merged)
- Model + resolution parameters and modal UI (PR #23, #24, merged)
- CLI argument-escaping bugs fixed (PR #25 + node-direct `ConvertTo-NodeCliArg`, merged)
- Transcript / audio / video mode toggle (merged; **transcript mode confirmed
  working** on a real 12-min video)
- Diagnosed the CLI's hard 20MB video wall → **SDK spike proved the fix and
  answered both cost questions** (LOW res cuts ~65%; section-scoping cuts ~81% of
  billing — both confirmed real)
- **SDK migration built AND live-verified (merge-eligible):** 9-section brief
  verified over SDK; YouTube→SDK routing with CLI fallback byte-for-byte
  unchanged; API key confirmed env-only (no key-file in merged code); per-run
  `usageMetadata` cost logging; `mediaResolution` enforced; section-offset params
  plumbed. **Live tests passed:** whole-video + a 2-min slice that billed exactly
  18.9% of tokens (proportional to duration) with content matching the slice;
  determinism confirmed (numbers reproduced exactly across two runs). 155 tests.
- **Stale-transcript bug fixed (built, merge-eligible):** the CLI transcript/
  audio path used to silently feed Gemini a leftover file from an unrelated prior
  run when a download produced nothing. Fixed by per-run subdirectory isolation
  (stale files structurally unreachable, not just timestamp-skipped); fix sits at
  the single point all three modes converge, so audio is covered too. Live-fired
  against the exact original trigger — now exits cleanly instead of substituting
  stale data. 202 assertions incl. a repro test.
- **Section-select UI built (merge-eligible, July 8):** Start/End range inputs in
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
- **Range-invariant hotfix built + committed `fad5ebc`:** `feed-gemini.ps1` now
  throws on lone/mis-ordered offsets and wrong-route/non-VideoScout ranges (was
  warn-and-continue); `gemini-video-sdk.js` exits non-zero on lone flag / missing
  value / non-integer / bad order; renderer clears range inputs on leaving video
  mode + resets stale error state + logs any stale-range that slips through. The
  invariant now holds at EVERY spending layer. Tests green across 6 suites
  (276/276). **Live verification (tests A–D) = Friday, items 5–8.** Two process
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

> **Note on the range-invariant hotfix:** built + committed `fad5ebc` on
> `main` (parts 1–3 landed: `feed-gemini.ps1` throws on lone/mis-ordered/
> wrong-route offsets; `gemini-video-sdk.js` exits non-zero on bad argv;
> renderer clears range on leaving video mode + resets stale error state).
> The invariant now holds at every spending layer. What's LEFT is live
> verification — tests A–D below — which needs real (small) spend and a full
> restart, so it was deferred to here.

> **4. FULL Electron restart FIRST** (renderer + main + scripts all changed
> since the app last launched). Quit fully incl. tray; confirm no lingering
> Electron process; relaunch. Everything below tests the NEW code only after
> this. Also confirm `main` is at the post-security-fix commit (Day 0 merged).

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

> **8. LIVE TEST D — stale range cleared on mode switch.** Modal, video mode,
> enter `2:00`/`4:00` → switch mode to transcript (fields hide) → Create &
> Launch (real transcript run, cheap, expected). Logs for that launch: NO line
> containing `BUG:`, and NO `--start-offset`/`--end-offset` in argv. Then reopen
> modal → video mode → fields come back EMPTY. PASS = both clean + empty fields.
> ⚠ If offsets appear in a transcript argv, STOP and report — do not continue.

> **9. FIX audit #5 (MEDIUM) — the last cost-direction gap.** `feed-gemini.ps1:87`:
> invalid `analysisMode` silently defaults to the costliest `video` pass. Branch
> `feature/analysismode-failclosed`. Fail closed (throw) or fall back to the
> cheap transcript mode — decide which, refuse visibly either way. Small; closes
> the one remaining silent-overspend path. Tests for invalid/absent mode.

> **9b. Mode-aware duration guard + FAIL-CLOSED yt-dlp filters.** Branch
> `feature/duration-guard-by-mode`. **⚠ LIVE HOLE FOUND WHILE SCOPING: the
> SDK/YouTube route never touches yt-dlp/`$ytCommon` and is therefore
> COMPLETELY UNCAPPED today.** A 5-hour YouTube video in video mode goes
> straight to Gemini with no duration limit. The existing 90-min guard protects
> only the cheap paths (transcript/audio/non-YouTube video). *Sixth instance of
> the pattern: the guard lives where the consequence doesn't.*
> **DECIDED: unified pre-flight probe** (one `yt-dlp --simulate` for duration +
> `is_live`, enforcing ALL caps for BOTH routes in ONE place) — rejected the
> "two mechanisms" option because two enforcement points encoding one policy is
> exactly the `predictVideoRoute`/`Resolve-VideoSourceRoute` drift class (P6).
> The hardened `--match-filter` is retained as a strictly-weaker BACKSTOP that
> may only reject what the probe allowed, never permit what it would refuse.
> Probe failure/timeout/unknown-duration/is_live ⇒ REFUSE (never proceed on an
> unprobed input). Offsets validated before the probe reads them. Three problems,
> WO in chat:
> **(A) the guard fails open** — `--match-filter "duration < 5400"` PASSES when
> duration metadata is absent/unknown (live streams, some extractors), and
> `--max-filesize 600M` can't backstop a live stream (no known size). Unbounded
> input reaches a paid API call. *Same family as the lone-offset downgrade and
> the fail-open fence matcher: a guard that permits what it cannot evaluate.*
> **(B) one global cap can't express the tiered workflow** — per-mode limits:
> transcript/audio 4h; video-no-range 90min; video-WITH-range gates on RANGE
> LENGTH not source duration (a 5h source sliced to 10min is cheap). Plus an
> explicit `-MaxDurationSeconds` override, logged, never silent.
> **(C) the refusal message is false** — on filter rejection it says "yt-dlp's
> download failed upstream"; nothing failed upstream, our own guard declined.
> Accurate message naming duration, limit, mode, override flag.

> **9c. P8 PULLED UP — timestamps in transcript-mode output.** Was parked; it's
> actually the missing link in the tiered workflow. A transcript without
> timestamps tells you *what* was said but not *where*, so you still can't pick
> the slice for the range picker. Cheap pass → timestamped transcript → pick
> range → expensive video pass on that slice only. Do after 9b.

> **ALSO NOTED (not blocking):** `MediaResolution='MEDIUM'` is recorded in the
> run log but never sent (the CLI has no such flag; it warns visibly — good).
> But logging it as though it applied is a trap: future cost analysis will read
> the log and believe MEDIUM was in force. **Log what happened, not what was
> requested.** Fix alongside 9b.

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
> `feature/section-select-ui`.

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
> point at a git-derived value · **`agent-dom.test.js` and `task-name.test.js`
> are not wired into any runner script** (`app/package.json` has only `start`) —
> they run only when invoked by hand, so they will rot silently despite "tests
> are a gate" in CLAUDE.md. Wire them up.

> **P10. `New-VideoScoutRunDir` same-millisecond collision.** Surfaced as a
> Pester flake during the Day-0 work (`get-video-scout-run-dir` failed once in a
> batched run: run-dir name already exists; isolated re-runs 5/5 × 3; empty
> `scripts/` diff proves it pre-exists the security branch). **Same silent-
> collision class as the billing bugs.** FIRST QUESTION TO ANSWER: on collision,
> does it THROW (safe — refuses) or reuse/overwrite the dir (unsafe — two runs
> could mix output, which would resurrect the stale-file bug the run-dir
> isolation was built to kill)? If the latter, this is a real bug, not a flake.
> Fix: add PID/counter/random suffix or retry-on-exists.

> **P7. Budget guardrail** — using real `usageMetadata` token numbers (not
> estimates). Better built next week with a week of real data accumulated.

> **P8. (PULLED UP → Day 1 item 9c)** Timestamps in transcript-mode output.

---

## 🐛 KNOWN ISSUES — backlog, not blocking

> **K1. Video download cleanup / auto-delete** — every run now creates a
> `run-<timestamp>-<PID>` subdir under `downloads\` that is never cleaned up (a
> side effect of the stale-file fix — correct tradeoff, but it raised the
> disk-growth rate). Add auto-delete after a successful Gemini analysis, and/or a
> retention sweep. Not urgent (files are small), but do it before the tool runs
> unattended for long stretches.

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

*Update rule: when an item is finished, move it to the DONE section (drop its
number). Work the days in order; within a day, top-to-bottom. If a day runs
long, push the lightest remaining item forward rather than skipping the security
or verification gates — those are the ship-blockers. The Day-0 security gate and
the Sunday ship-check (#16) are non-negotiable for a Monday ship.*

---

## 🗺 SHIP PLAN AT A GLANCE
- **Day 0 (tonight/Fri AM):** security gate — XSS→RCE fix, nav lockdown, restart. Blocks all else.
- **Day 1 (Fri):** finish video-scout — restart + live tests A–D, analysisMode fail-closed.
- **Day 2 (Sat):** heavy build — 3 parallel panes: links, calculator, whiteboard.
- **Day 3 (Sun):** CRM (MCP) + merge Sat panes + audit-LOW cleanup + ship-check.
- **Monday:** ship, if #16 is all green.
