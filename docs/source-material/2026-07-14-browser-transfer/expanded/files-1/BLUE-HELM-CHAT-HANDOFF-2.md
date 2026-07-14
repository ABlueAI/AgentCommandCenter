# Blue Helm — Session Handoff (paste into a fresh chat to continue)

Paste this whole document into a new conversation, then say what you want to do
next (a starter line is at the very bottom). Companion files to upload alongside
it are listed in the "Files to bring" section.

---

## How to use this handoff
This captures the CHAT side — decisions, reasoning, working style, and open
threads. The authoritative, always-current status lives in
**`BLUE-HELM-MASTER-STATUS.md`** (upload it). When this handoff and the master
status disagree, the master status wins (it's updated as work lands).

---

## What Blue Helm is
A self-hosted "mission control" desktop app (Electron, Windows 11) that runs
several AI coding agents in parallel — Claude Code, Codex, Gemini — each in its
own git worktree or fenced sandbox, all human-supervised. It's the workspace for
building and operating **Starboard** (a marine-services SaaS). Repo:
`ABlueAI/AgentCommandCenter`. Two machines: an RTX 5080 laptop (primary, also
Blue's personal daily driver — real secrets live on it) and an RTX 3060 Ti
desktop. *(Blue plans to rename "Blue Helm" eventually — he's not attached to the
name.)*

Six tool-ENFORCED roles: Builder (read-write + shell), Reviewer (read-only,
independent-model code review), Codebase-Scout (read-only), Web-Scout &
Source-Scout (web research, sandboxed, no shell), Operator (growth-ops). Plus
**video-scout**, which is NOT a Claude Code agent — it has its own launch path
(`feed-gemini.ps1`) and runs Gemini for video analysis.

## How Blue wants to be worked with (read before responding)
- **Calibrated confidence, always.** Distinguish verified fact vs. recommendation
  vs. uncertain. Never deliver a guess in a confident tone. He's been burned by
  confidently-wrong answers and explicitly asked for this.
- **Verify, don't assert.** Search the web / read actual source for anything
  current (APIs, pricing, versions) rather than answering from memory. This
  repeatedly mattered this session.
- **Diagnose before fixing.** Do not write a fix on a hypothesis. Confirm the
  real cause with evidence (read the file, dump the argv, check the git state)
  first. This caught multiple wrong hypotheses before they cost build cycles.
- **Check for existing/OSS solutions before building from scratch.** His own
  project rule — "clone and read real source, don't approximate." Honor it.
- **Bold/highlight the actual answers** so he can skim. Keep docs skimmable; one
  master runbook, not sprawling status buried across files.
- **One question at a time** when eliciting; offer tappable options where useful.
- Don't frame him as a "cheaper" resource — he drives because judgment is his to
  own.

## The operating pattern that worked this session
1. Claude (chat) drafts a **paste-ready work order** for a specific role
   (usually builder), scoped single-purpose, with explicit "don't touch X"
   constraints and "report evidence, don't assume."
2. Blue runs it through Claude Code, pastes the result back.
3. Claude (chat) **reviews the result** honestly (owns its own wrong calls),
   updates `BLUE-HELM-MASTER-STATUS.md`, and drafts the next work order.
4. **Human merge gate is sacred** — nothing auto-merges. Security/fence-adjacent
   or auth-touching code gets an independent **Reviewer** pass (Opus, different
   model than built it) before merge. Isolated non-security changes can merge on
   Blue's read-through.
5. "Failures must surface visibly" is a hard convention — silent fallbacks/
   wrong-answers are bugs even when nothing crashes.

## Current state (summary — see master status for the ordered list)
**Two workstreams.** Video-scout is the active focus; fence-security is parked
with loose ends.

**Video-scout — the big arc this session:** discovered the Gemini *CLI* has a
hard ~20MB inline-attachment cap, so it can never analyze full-length video.
Pivoted to the **Gemini SDK / REST `generateContent` path**, which:
- ingests a **YouTube URL directly** (no download, no size cap) via a
  `fileData/fileUri` video Part;
- **enforces `mediaResolution`** LOW/MED/HIGH (the CLI silently ignored it);
- supports **`VideoMetadata` start/end offsets** to analyze only a time slice;
- returns **native timestamps** and per-modality **`usageMetadata`** token counts.

This is BUILT, LIVE-VERIFIED, and merge-eligible (as is a stale-transcript bug
fix found during testing). Transcript mode (cheap, yt-dlp `.srt`) works and is
the default. The CLI path survives only as fallback for local/non-YouTube files.

**Cost findings (measured on live runs, not estimates):**
- LOW resolution cuts ~65% of tokens overall (~73% of video tokens), BUT audio
  tokens are unaffected by resolution and grow as a share on long videos.
- **Section-scoping bills proportionally to slice length** — a 2-min slice of a
  10-min video billed 18.9% of tokens, ~79–81% savings. Confirmed the content
  matched the slice. **This is the real cost lever, not resolution.**
- Cost is ~pennies per video (a 10-min video ≈ $0.007 at LOW on flash-lite;
  a 3-hr projects to ~$0.10).

**Caveats to respect:** YouTube-URL input is in PREVIEW — free now, pricing/limits
"likely to change," 8 hours of YouTube/day cap, public videos only.

**Fence-security (parked):** WO-1 audit, WO-6 cwd enforcement, WO-7 claude.json
mutex, WO-2 env scrub + setx removal — all done + reviewed. WO-3/WO-4/WO-5, the
remaining WO-6/WO-7 live-test steps, and a batch of non-blocking follow-ups are
not started. Key finding: fenced roles have no Bash, so the real risk was cwd
enforcement (fixed), not a Bash escape.

## Immediate next step
**Step 2 in the master status: wire the section-select UI** (Start/End time
inputs in the video-scout modal → the already-plumbed `-StartOffset`/`-EndOffset`
params → a scoped SDK run). This is the payoff — it turns the verified pieces
into the tiered "read the cheap transcript, then deep-dive only the good stretch"
workflow. A paste-ready work order for it was drafted in the prior chat; if it
wasn't carried over, ask Claude to regenerate it (it should: video-mode-only
Start/End inputs, both-or-neither + end>start validation server-side, distinct
field names, offsets already exist so this is UI+plumbing only, don't touch the
fence gate / CLI path / SDK core; note main.js likely needs a validation entry
so confirm the fence block is untouched).

## Gotchas (hard-won)
- **Changes load only on a FULL Electron process restart** (kill the process,
  not just the window). This has repeatedly masqueraded as "the fix didn't work."
- **"Merged on GitHub" ≠ "running locally."** Confirm the executing checkout has
  the commit before concluding a fix failed. This bit us more than once.
- **The Gemini CLI is a `.cmd`/`.ps1` shim** — PowerShell 5.1's native-arg
  serialization doesn't escape interior quotes, which broke prompts with `"`.
  Fixed by calling `node gemini.js` directly with `CommandLineToArgvW`-correct
  escaping. Don't reintroduce shim-based invocation for the CLI path.
- **The video API key** reaches the SDK path via the PTY's safeStorage-injected
  `process.env` (inherited by the child node process). Never a plaintext key
  file, never on argv. Keep it that way.
- **Copy-paste in panes is flaky**, and likely never worked for the video-scout
  pane at all — a known backlog item.

## Files to bring (upload these with this handoff)
- **`BLUE-HELM-MASTER-STATUS.md`** — THE runbook / source of truth. Open first.
- `BLUE-HELM-VIDEO-SCOUT.md` — video-scout deep reference (SDK pivot section is
  the live plan; the "CLI Feature A" section is superseded).
- `BLUE-HELM-READ-FENCE-TEST-BRIEF.md` — fence-security deep reference (WO-1…7).
- `BLUE-HELM-PROGRESS-SUMMARY.md` — business-facing summary for the Starboard
  chat (separate purpose; bring only if relevant to that conversation).

## First message to send in the new chat
Paste this whole document + the files above, then:
"Picking up Blue Helm from here. Open BLUE-HELM-MASTER-STATUS.md — I want to
work on [step 2, the section-select UI / or whatever's next]. Give me the work
order to feed Claude Code."
