# BLUE HELM — CHAT HANDOFF #4 (July 12, 2026)
## Platform-transfer edition — Blue is moving orchestration chat to another platform; Claude continues as the CODING layer (Claude Code)

**Read this + `BLUE-HELM-MASTER-STATUS.md` (source of truth) + repo `CLAUDE.md`.
Those three documents are the complete operational context. Prior chat
transcripts are NOT required — everything decision-relevant was distilled
into these files at each handoff.**

---

## What Blue Helm is
Self-hosted Electron "mission control" for orchestrating AI coding agents in
parallel PTYs across git worktrees, plus Starboard Automation business ops
(CRM, email, cost tracking). Repo: `D:\Workspace\agent-command-center`.
Scope decided: coding/agent orchestration + business ops. Personal
productivity OUT of scope.

## Current state (verified, July 12)
- **`main` @ `4da1572`.** Everything reviewed is merged; NO branches pending.
- **Day 0 security gate: COMPLETE.** The audit's live XSS→RCE chain
  (`25e72ad`), navigation lockdown + `shell:false` launchers (`91ca3b7`),
  and the mode-aware duration guard (`4da1572`) are all on `main`.
- **Test gates, both green on the merged tree:** `npm test` in `app/` =
  205 assertions across 5 node suites; `scripts/run-pester.ps1` = 105
  Pester assertions across all PowerShell suites. Run BOTH before any push
  that touches their respective sides.
- **Local branches:** all merged feature branches deleted.
- ⚠ **The Electron app process may still be running PRE-merge code.** A full
  restart (quit incl. tray, verify no lingering process, relaunch) is
  REQUIRED before the live tests below.

## Immediate work queue (in order)
1. ~~Restart + live tests~~ **DONE (July 12) except one: A ✅ B ✅ C ✅ E ✅.**
   REMAINING: **Test D's launch half** (enter range → switch to
   transcript → LAUNCH → argv must contain NO `--start-offset` and no `BUG:`
   line; reopened video-mode fields empty).
2. **#9 — analysisMode fail-closed** (`feed-gemini.ps1:87`): invalid
   `analysisMode` silently defaults to the costliest `video` pass. Branch
   `feature/analysismode-failclosed`, small, fail-closed + visible refusal +
   tests. Last silent-overspend path.
3. **V2 — TLDR in analysis output** (scripts-only prompt-template change;
   cheap, Blue wants it now) — can pair with #9's branch window.
4. **9c — timestamps in transcript output** (enables cheap-pass → pick range
   → expensive-slice).
5. **P13 chores**: Pester version pin in `run-pester.ps1` + `PROJECT-STATE.md`
   `setx` doc fix. **K5**: fix the libuv crash on the SDK 503 path + add
   503 retry/backoff (new bug from live testing — daily annoyance).
6. **V1 — pane output readable/copyable** (maximize, scroll/wrap, reliable
   copy, open-report button). Blue rates this REQUIRED for functionality —
   the analysis is currently trapped in the viewport. Interim: run-dir report
   files on disk have the full text.
7. Then V3 (pre-analysis direction + follow-up Q&A), V4 (multi-slice one
   run — spec first, touches the guard), Day 2/3 per MASTER-STATUS, ship.

## The process rules (non-negotiable — each one exists because it failed once)
- **Feature branches always; merge only to `main`; every branch gets its own
  Reviewer gate.** Builder sessions offering courtesy merges: always decline.
- **Reviewer gate:** read-only Reviewer role (no shell by design). Human runs
  pre-flight, pins the diff to a file (`git diff main...<sha>
  --output=.agent-review-*.diff` — gitignored; use `--output`, NOT
  PowerShell `>` which writes UTF-16). Inline paste has failed 3× — always
  pin.
- **Three-dot diffs only** (`main...sha`). Two-dot renders post-branch `main`
  commits as fake deletions — this produced a false CRITICAL report once.
- **A verdict is not a verdict until the literal `VERDICT: PASS|FAIL` line is
  read verbatim.** Findings lists that imply PASS are not PASS.
- **FAIL = fix on the same branch, delta review, then merge.** Pre-existing
  bugs discovered mid-gate: REPORT FIRST, fix after approval (violated once,
  P10 — fix was accepted, process wasn't).
- **Merges are real three-way `--no-ff`.** Never squash/tree-apply a stale
  branch over `main` — a branch cut before the security merges would delete
  the hardening modules. Post-merge: verify the four security files +
  `npm test` script survive, run both gates on the merged tree, then push.
- **Chore-class direct-to-`main`** only if ALL THREE: zero runtime code ·
  content prescribed verbatim by a Reviewer verdict · verified by execution.
- **Full Electron process restart** to load renderer/main changes.
- **Refuse visibly, never silently.** No warn-and-continue, no silent
  downgrade, no guard that permits what it cannot evaluate.
- **Log what happened, not what was requested.**
- **Never `setx` API keys** (PTY env inheritance); CLAUDE.md §8.
- **Recurring lesson (7 instances):** a finding's severity is a function of
  the threat model in force when written; the guard tends to live one layer
  away from the consequence. Re-check LOWs after any threat-model change.

## OSS policy (Blue's decision, July 10)
- **Orchestrator/agent layer: MINE, DON'T ADOPT.** Peer orchestrators
  (`parallel-code`, `crystal`, Emdash, Claudette, Composio AO) are a pattern
  mine — study session lifecycle / diff-review UX / kanban states / status
  detection, re-implement behind our fence. Never import their code, never
  adopt, never switch.
- **Utility libraries: adopt as whole, vetted deps** (Excalidraw/esbuild is
  the model; dockview-core, DOMPurify, ripgrep class qualify). Vet: license ·
  `npm audit` · maintenance · pinned · telemetry checked/disabled.
- **Never paste snippets into security-sensitive paths** (IPC, PTY,
  credentials, validators) — read and re-implement.

## Daily-driver roadmap (post-ship; Blue's Tier-1 ranking)
**V-series (July 12, REQUIRED):** V1 pane output readable/copyable/maximize · V2 TLDR in analysis · V3 pre-analysis direction + follow-up Q&A · V4 multi-slice single run. Then Tier 1:
1. In-app diff viewer + merge-gate UI (mechanizes the gate; merge button
   disabled until a verdict is attached) · 2. Session restore on relaunch ·
3. Dockable pane layout (dockview-core) · 4. Status detection +
   notifications. Full R1–R14 in MASTER-STATUS.

## Open risk register (pointers — detail in MASTER-STATUS)
- **P12 (HIGH, parked):** cmd.exe metachar re-parse on the VS Code-open path
  (`shell:false` did NOT close it — Node only quotes argv with whitespace);
  fix bundled with the unvalidated-dir `open-vscode`/`open-terminal`
  primitive + a real end-to-end cmd.exe test. Exposure today: pre-existing
  hostile artifacts only.
- **P13:** duration-guard follow-up batch (slice step-0 refusal, tripwire
  positive control, stub try/finally, probe-fault surfacing, message-match
  anchoring, explicit params, override-ceiling decision, one manual live
  probe run) + the two chores above.
- **P9/P11 + others:** see MASTER-STATUS PARKED section.
- Known accepted residuals: worktrees with hostile pre-fix names must be
  removed at the CLI (app refuses — by design); yt-dlp is now a hard dep of
  the SDK route (probe-only; missing = refusal by design).

## Working with Blue
Senior-engineering-partner mode: minimal filler, direct, proactively flag
risk/flawed thinking/wasted effort. Complex tasks: summarize → clarify →
parallel chunks → checkpoints. Simple tasks: execute, correct after. ADHD:
positive reinforcement lands; structured re-engagement helps; the app should
interrupt him, not require polling. Distinguish stated facts from inference
explicitly (he holds reviews to this standard — so hold chat to it too).
