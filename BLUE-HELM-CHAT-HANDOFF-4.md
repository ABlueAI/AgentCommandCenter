# BLUE HELM — CHAT HANDOFF #4 (July 12, 2026)
## Platform-transfer edition — Blue is moving orchestration chat to another platform; Claude continues as the CODING layer (Claude Code)

**Read this + `BLUE-HELM-MASTER-STATUS.md` (source of truth) + repo `AGENTS.md`
and `CLAUDE.md`. Those documents are the complete operational context. Prior chat
transcripts are NOT required — everything decision-relevant was distilled
into these files at each handoff.**

---

## What Blue Helm is
Self-hosted Electron "mission control" for orchestrating AI coding agents in
parallel PTYs across git worktrees, plus Starboard Automation business ops
(CRM, email, cost tracking). Repo: `D:\Workspace\agent-command-center`.
Scope decided: coding/agent orchestration + business ops. Personal
productivity OUT of scope.

## Current state (verified through July 14)
- **`main` @ `5e0b923`.** Runtime baseline remains `4da1572`; the later commit
  adds collaboration documentation only. Active branch:
  `docs/project-control-plane-sync` (documentation only; not merged).
- **Day 0 security gate: COMPLETE.** The audit's live XSS→RCE chain
  (`25e72ad`), navigation lockdown + `shell:false` launchers (`91ca3b7`),
  and the mode-aware duration guard (`4da1572`) are all on `main`.
- **Test gates, both green on the merged tree:** `npm test` in `app/` =
  205 assertions across 5 node suites; `scripts/run-pester.ps1` = 105
  Pester assertions across all PowerShell suites. Run BOTH before any push
  that touches their respective sides.
- **Local branches:** all merged feature branches deleted.
- **Live Test D: ✅ COMPLETE.** Transcript launch contained no
  `--start-offset` or `--end-offset`, no stale-range `BUG:` line, and reopened
  video fields were empty. The later Gemini 503 is unrelated and tracked in K5.
- **Audio code truth:** TTS and STT controls exist but neither engine can start
  on current `main`. TTS assumes a Kokoro bundle export that is not present;
  STT relies on unresolved bare ONNX imports and a required runtime file that is
  gitignored and absent from `HEAD`. Repair the open-source integration; do not
  rebuild Kokoro, Whisper, Transformers.js, or ONNX Runtime.
- **Platform routing:** ChatGPT desktop with GPT-5.6 is the primary planning,
  research, review, and project-state layer. Claude Code remains the primary
  coding layer. Codex CLI/IDE is deferred and separate.
- **Restart rule retained:** fully restart Electron after any future renderer or
  main-process change before live validation. Tests A–E are already complete;
  this handoff contains no remaining live-test procedure.

## Immediate work queue (in order)
1. **#9 — analysisMode fail-closed** (`feed-gemini.ps1:87`): invalid
   `analysisMode` silently defaults to the costliest `video` pass. Branch
   `feature/analysismode-failclosed`, small, fail-closed + visible refusal +
   tests. Last silent-overspend path.
2. **TTS bootstrap repair** on `feature/tts-bootstrap-fix`: fix the Kokoro
   environment contract, make initialization failures visible, add bootstrap
   tests, and live-test voice/speed/stop on WebGPU and WASM.
3. **STT bootstrap repair** on `feature/stt-bootstrap-fix`: make the
   Transformers/ONNX browser dependency graph reproducible, restore a tracked
   runtime path, pin dictation to the pane where recording started, add tests,
   and prove visible recording/transcribing states plus focused-pane insertion.
4. **Audio permission hardening** after both engines work: enforce trusted
   origin + audio-only media permission and surface module-level errors in Logs.
5. **V2 — TLDR in analysis output** (scripts-only prompt-template change;
   cheap, Blue wants it now). Keep it on its own one-invariant branch at this
   queue position.
6. **9c — timestamps in transcript output** (enables cheap-pass → pick range
   → expensive-slice).
7. **P13 chores**: Pester version pin in `run-pester.ps1` + `PROJECT-STATE.md`
   `setx` doc fix. **K5**: fix the libuv crash on the SDK 503 path + add
   503 retry/backoff (new bug from live testing — daily annoyance).
8. **V1 — pane output readable/copyable** (maximize, scroll/wrap, reliable
   copy, open-report button). Blue rates this REQUIRED for functionality —
   the analysis is currently trapped in the viewport. Interim: run-dir report
   files on disk have the full text.
9. **V5 — Analysis Library.** Add per-run manifests, an in-app run list,
   report retention, manifest-scoped media cleanup, and the V3 follow-up hook.
   **V1 is a prerequisite for V5's in-app report reader.**
10. **V3 — pre-analysis direction + follow-up Q&A.**
11. **V4 — multi-slice in one run** (spec first; touches the guard).
12. **Day 2/3 work** per `BLUE-HELM-MASTER-STATUS.md`, then ship-check and R15's
    time-boxed orchestrator fork/replacement evaluation.

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
**V-series (updated July 14, REQUIRED):** V1 pane output readable/copyable/maximize · V2 TLDR in analysis · V3 pre-analysis direction + follow-up Q&A · V4 multi-slice single run · V5 Analysis Library (V1 reader prerequisite). Then Tier 1:
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
