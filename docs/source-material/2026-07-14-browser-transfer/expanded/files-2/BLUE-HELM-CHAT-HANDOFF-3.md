# Blue Helm — Chat Handoff #3
*Written to move context to a fresh chat. Read this, then open `BLUE-HELM-MASTER-STATUS.md` (the updated one in this same output set) as the source of truth for what to do next.*

---

## What Blue Helm is (one paragraph)
A self-hosted Electron "mission control" desktop app (repo: `ABlueAI/AgentCommandCenter`, working dir `D:\Workspace\agent-command-center`) that runs several AI coding agents in parallel — each in its own git worktree + PTY, each fenced/sandboxed and supervised — to build and operate the Starboard business. "Video-scout" is one agent role: it analyzes YouTube/video content via Gemini (transcript / audio / video modes), with a section-slice feature that bills only a chosen time range. Weekend goal: add the business-command-center layer (whiteboard, quick widgets, CRM).

## How we work (the standing rules — these are load-bearing)
- **Feature branches always; `main` is merge-only.** One invariant per branch.
- **Reviewer verdicts are read verbatim at the merge gate — never summarized.** (A summarized verdict already let one bad merge through — `bf93993`.)
- **Failure paths refuse visibly — never silently downgrade, drop, or truncate.** This is the single most important convention in the project.
- **Fence gate is sacred:** business-widget credentials live main-process-side via `safeStorage`, never enter any PTY env, never reach the renderer beyond display data. No agent role gets email/CRM access by default.
- **Full Electron process restart** (not reload) to load renderer/main changes.
- **Reference OSS is read and re-implemented, never pasted** (this app holds keys).
- Generate review diffs with **three dots** (`git diff main...<sha>`), never two (two-dot renders post-branch `main` commits as spurious deletions — this blocked a review once).
- **Never ask a fenced read-only role (Reviewer) to run git/Bash** — it has no shell by design. Human runs pre-flight and pastes output into the brief, or the diff is pinned by content + stated SHA.
- Distinguish stated facts from inferences; surface load-bearing assumptions; flag security/privacy risks proactively.

## THE recurring lesson (has paid out 6× in one week)
**When you find a bug at one layer, the same bug usually exists — worse — at the layer that actually performs the dangerous operation** (spends the money, runs the command, touches the disk). Fix it where the consequence lands, not where you noticed it. Instances this week: PS lone-offset downgrade beneath the JS offset-refusal; argv-undefined edge beneath that; the remove-path `git worktree remove --force` sink beneath the XSS render fix; the `shell:true` LOW re-rated once the threat model changed; the yt-dlp guard failing open on unknown duration; and the SDK/YouTube path being entirely uncapped while the cheap paths were guarded. **Always ask: which layer does the dangerous thing, and is the guard there?**

---

## Current git state
- `main` @ `fad5ebc` (video-scout range-invariant hotfix) + a docs commit `5316280` (AUDIT-REPORT.md).
- **`feature/sec-escape-validate`** — 3 commits (`9a65601`, `154a818`, `075d909`), pushed. Day-0 security fix (XSS→RCE + task validation + device-name rejection). **Awaiting a delta Reviewer pass, then merge.**
- **`feature/duration-guard-by-mode`** — just built, **not yet committed**. Duration guard rework. Gate verdict: merge-eligible; commit+push, then full Reviewer pass.

---

## WHERE WE ARE in the plan
Working a **Fri→Sun ship plan** (target: shippable Monday). See `BLUE-HELM-MASTER-STATUS.md` for the full ordered list. High level:

**DAY 0 (security gate — must finish before feature work):**
1. XSS→RCE fix — BUILT on `feature/sec-escape-validate`, needs delta review + merge. A hostile git branch/worktree name rendered via `innerHTML` could reach `ptyStart`/`ptyWrite` = command execution. Fixed via a DOM-builder module (`agent-dom.js`, uses `textContent`/`setAttribute`) + main-side `task` validation (`task-name.js`) on BOTH new-agent and remove-agent handlers + Windows reserved-device-name rejection (`con`/`nul`/`aux`/`prn`/`com0-9`/`lpt0-9`) on both paths.
2. Window-open / navigation lockdown (`setWindowOpenHandler` + `will-navigate`) — NOT STARTED.
2b. `launch()` `spawn(...,{shell:true})` with git-derived path — re-rated from audit LOW to do-before-Saturday (WSL2 fallback makes `$()`/backticks in dir names dangerous). NOT STARTED.

**DAY 1 (Friday — finish video-scout + baseline):**
- Items 4–8: FULL restart, then LIVE TESTS A–D (still not run — need real small spend):
  - **A** valid slice 2:00–4:00 → `usageMetadata` ~20% of whole-video baseline (script path measured 18.9%).
  - **B** invalid range (4:00–2:00) → visible inline refusal, modal stays open, zero spend.
  - **C** lone offset via direct CLI → throws <1s, non-zero exit, zero spend.
  - **D** range in video mode → switch to transcript → launch → NO `BUG:` line, NO offsets in argv, fields empty on return to video.
- 9. analysisMode fail-closed (invalid mode currently defaults to costliest video pass).
- 9b. **Duration guard — JUST BUILT on `feature/duration-guard-by-mode`, awaiting commit+review.** Unified pre-flight probe (`yt-dlp --simulate` for duration+is_live) guarding BOTH routes in one place. Fixed a LIVE HOLE: the SDK/YouTube path was completely uncapped. Per-mode limits (transcript/audio 4h, video-no-range 90min, video+range gates on slice length cap 30min), `-MaxDurationSeconds` override, accurate refusal messages, `--match-filter` retained as subordinate backstop. 79 Pester green.
- 9c. Timestamps in transcript output (pulled up from parked — it's the missing link that lets you pick a slice from a cheap transcript pass).

**DAY 2 (Saturday — heavy build, 3 parallel panes):** links panel, calculator widget, Excalidraw whiteboard (esbuild bundle route decided). All security-scoped.

**DAY 3 (Sunday — CRM + cleanup + ship-check):** Hexona CRM via LeadConnector MCP (route TBD — zero-code-agent vs in-app-panel, decided by env-leakage findings), merge Saturday panes, audit-LOW batch, final ship-check (#16, non-negotiable).

**PARKED (post-ship):** per-role env allowlist (audit HIGH #2 — becomes a MUST if CRM takes the zero-code-agent route), WO-6/WO-7 live tests, fail-closed tool guard, path-based worktree removal redesign (P9), run-dir collision (P10), reviewer follow-ups batch (P11), budget guardrail.

**NEXT WEEK:** Outlook via Graph API (MSAL-node), usage/cost dashboard.

---

## Immediate next actions
1. Commit + push `feature/duration-guard-by-mode`; verify the "duration<N rejects missing duration" claim (contradicts an earlier report — resolve which is true).
2. Delta Reviewer pass on `feature/sec-escape-validate` (three-dot diff, paste pre-flight); verbatim verdict → merge → the `con`/null-propagation questions were already answered clean.
3. Reviewer pass on the duration branch.
4. Merge both, do #2 and #2b, then Day 0 is down and Friday opens with tests A–D.

## Open reference docs (in the project, deep detail only)
- `BLUE-HELM-MASTER-STATUS.md` — THE ordered to-do (source of truth).
- `BLUE-HELM-VIDEO-SCOUT.md` — video-scout / Gemini SDK internals.
- `BLUE-HELM-READ-FENCE-TEST-BRIEF.md` — fence-security (WO-1…WO-7).
- `AUDIT-REPORT.md` (in-repo @ `fad5ebc`) — full audit findings.
