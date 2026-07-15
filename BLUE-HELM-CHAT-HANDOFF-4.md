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

## Current state (verified through July 15)
- **`main` @ `58b7792`, pushed to `origin/main`.** `analysisMode` fail-closed,
  V5a live manifests, the legacy backfill utility, and a test-harness
  portability repair are merged.
- **Day 0 security gate: COMPLETE.** The audit's live XSS→RCE chain
  (`25e72ad`), navigation lockdown + `shell:false` launchers (`91ca3b7`),
  and the mode-aware duration guard (`4da1572`) are all on `main`.
- **Test gates, both green on the merged tree:** `npm.cmd test` in `app/` =
  233 assertions across 5 node suites; `scripts/run-pester.ps1` = 214 Pester
  assertions across all PowerShell suites. Run BOTH before any push that
  touches their respective sides.
- **V5a + one-shot legacy backfill: COMPLETE.** The authorized `-Apply` sweep
  created 12 manifests under `D:\Gemini_Video_Review\downloads`, with 0
  skipped, unsafe, or failed directories. All 12 were schema-validated:
  `route:"cli"` carries code-control-flow provenance pinned to
  `efd76f8bf8c86548c1479cd3e2852d49cce36317`; canonical `startedAt` is null;
  the directory-name stamp is retained only as explicit approximate provenance.
- **V2 report TL;DRs: COMPLETE.** The prompt keeps the report-leading Section
  1 TL;DR and now requires an evidence-grounded one-line Section TL;DR in
  Sections 2–9. Standard-class review passed; Pester is 216/216.
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
1. **TTS bootstrap repair (Standard-class)** on `feature/tts-bootstrap-fix`:
   recoverable initialization/failure-visibility work only; one scoped review.
   Fix the Kokoro
   environment contract, make initialization failures visible, add bootstrap
   tests, and live-test voice/speed/stop on WebGPU and WASM.
2. **STT bootstrap repair** on `feature/stt-bootstrap-fix`: make the
   Transformers/ONNX browser dependency graph reproducible, restore a tracked
   runtime path, pin dictation to the pane where recording started, add tests,
   and prove visible recording/transcribing states plus focused-pane insertion.
3. **K8 audio permission hardening (Full-class)** after both engines work:
   enforce trusted origin + audio-only media permission and surface module-level
   errors in Logs. This touches Electron's broad `media` permission boundary,
   so it requires whole-diff review and a delta pass after any FAIL; never fold
   it into K7 bootstrap work.
4. **9c — timestamps in transcript output** (enables cheap-pass → pick range
   → expensive-slice).
5. **P13 chores**: Pester version pin in `run-pester.ps1` + `PROJECT-STATE.md`
   `setx` doc fix. **K5**: fix the libuv crash on the SDK 503 path + add
   503 retry/backoff (new bug from live testing — daily annoyance).
6. **V1 — pane output readable/copyable** (maximize, scroll/wrap, reliable
   copy, open-report button). Blue rates this REQUIRED for functionality —
   the analysis is currently trapped in the viewport. Interim: run-dir report
   files on disk have the full text.
7. **V5(b–d) — Analysis Library (V5a complete).** Add the in-app run
    list, report retention, manifest-scoped media cleanup, and the V3 follow-up
    hook. **V1 is a prerequisite for V5's in-app report reader.**
8. **V3 — pre-analysis direction + follow-up Q&A.**
9. **V4 — multi-slice in one run** (spec first; touches the guard).
10. **Day 2/3 work** per `BLUE-HELM-MASTER-STATUS.md`, then ship-check and R15's
    time-boxed orchestrator fork/replacement evaluation.

## The process rules (non-negotiable — each one exists because it failed once)
- **Feature branches always; merge only to `main`; every branch gets its own
  Reviewer gate.** Builder sessions offering courtesy merges: always decline.
- **Declare the gate tier in the work order, with a one-line blast-radius
  rationale.** **Standard-class:** one-invariant branch → ONE Reviewer pass
  scoped to the named load-bearing hunks → merge; use it when worst-case failure
  is recoverable and non-destructive. **Full-class:** multi-round review,
  whole-diff read, and delta pass; reserve it for security boundaries,
  credentials, destructive operations, or cost-direction guards. Full ceremony
  on Standard-class work is cost without risk reduction. Mixed work names the
  Full-class hunks explicitly; the rest is reviewed at Standard scope.
- **Diff size is a scoping signal.** A one-shot or small-surface work order
  that generates a large diff was incorrectly scoped before review began. Cap
  the brief: tests prove the safety contract, not the entire adjacent surface.
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
- **Error/exception paths must exit cleanly with a visible message** — never
  crash, segfault, or emit a native assertion (see K5: libuv
  `UV_HANDLE_CLOSING` on the 503 path). This is the refuse-visibly rule applied
  to failure paths, not just guard paths.
- **Diff transport for gates:** always pin the diff to a gitignored
  `.agent-review*.diff` via `git diff main...<sha> --output=` — inline paste has
  failed on every gate attempted (3×+). Until R1 (in-app diff+merge-gate UI)
  exists, treat R1 not as post-ship polish but as the standing fix for the
  project's most reliable recurring failure mode.
- **Reviewer network preflight:** launch the read-only Reviewer through the
  workspace's approved network-enabled route on the first attempt. A sandboxed
  `ConnectionRefused` produces no review and is runner configuration failure,
  not a counted gate.
- **Log what happened, not what was requested.**
- **Never `setx` API keys** (PTY env inheritance); `AGENTS.md` and
  `CLAUDE.md` §8.
- **Recurring lesson (7 instances):** a finding's severity is a function of
  the threat model in force when written; the guard tends to live one layer
  away from the consequence. Re-check LOWs after any threat-model change.

## OSS policy (updated by Blue, July 14)
- **Orchestrator/agent layer: own through the core build.** Peer orchestrators
  (`parallel-code`, `crystal`, Emdash, Claudette, Composio AO) remain a pattern
  mine while the Handoff #4 and Day 1–3 queues are completed. R15 then performs
  a one-working-day fork/replacement evaluation. No peer code enters the
  production branch and no migration starts without Blue's separate approval.
- **Utility libraries: adopt as whole, vetted deps** (Excalidraw/esbuild is
  the model; dockview-core, DOMPurify, ripgrep class qualify). Vet: license ·
  `npm audit` · maintenance · pinned · telemetry checked/disabled.
- **Never paste snippets into security-sensitive paths** (IPC, PTY,
  credentials, validators) — read and re-implement.

## Daily-driver roadmap (post-ship; Blue's Tier-1 ranking)
**V-series (updated July 14, REQUIRED):** V1 pane output readable/copyable/maximize · V2 TLDR in analysis · V3 pre-analysis direction + follow-up Q&A · V4 multi-slice single run · V5 Analysis Library (V1 reader prerequisite). Then Tier 1:
1. In-app diff viewer + merge-gate UI (mechanizes the gate; merge button
   disabled until a verdict is attached; the backfill again showed that this is
   the standing fix for recurring diff-transport cost, not post-ship polish) ·
   2. Session restore on relaunch ·
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
