# Blue Helm — Work Order (2026-07-01 session)

Single source of truth for the next build session. Your check-list and the brainstorm work
order matched 1:1 — this is the merged, ordered version. Work top to bottom.

Confidence tags: **[Confident]** act on it · **[Recommendation]** agreed design choice ·
**[Verify]** confirm against the repo before/while building.

## Context recap
Agent Command Center (role system **Blue Helm**) — Electron/Windows 11 app running Claude Code /
Codex / Gemini agents in parallel, one PTY per worktree. `main.js` owns shell-outs + PTYs behind
IPC; `preload.js` exposes `window.cc`; renderer is pure UI. **Human merge gate is sacred — no role
auto-merges.** Five roles: builder, reviewer, codebase-scout, web-scout, operator. The write-fence
(`scripts/hooks/fence-write.js`) is a Claude Code PreToolUse hook; sandbox lives at
`D:\Workspace\.command-center\outputs\<role>-<timestamp>` (under projects root, not a repo).

**Already shipped (PR #21, on `main`):** fence fails *closed* at launch (`verify-fence`); video path
is shell-free + host-allowlisted + SSRF-guarded; yt-dlp capped (`--no-playlist`/`--max-filesize`/
duration); `open-external` scheme-validated. Smoke-test gained write-denial / merge-gate / SSRF tests.

## Execution order
1. **P1 — Read-fence** (HARD GATE — do before web-scout/operator run on anything real)
2. **P2 — Per-role filtered env** (same "shrink blast radius" theme as P1)
3. **P3 — Targeted disk cleanup**
4. **Feature A — Video-scout cost/tier controls** (quick, high daily value)
5. **Feature B — Chat-style UI, Option 1 only**
6. **P4 — Audio truly offline** (its own focused chunk: test → vendor → tighten CSP)
- **P5 is a standing rule, not a task** — see bottom.

Re-run the relevant `SMOKE-TEST.md` items after each.

---

## P1 — Read-fence for web-scout & operator  (HARD GATE) [Confident]
**Why:** the fence matches `Write|Edit|MultiEdit` only — it contains *writes, not reads*. Both web
roles have `Read` + web access (`WebFetch` + a legit output write). Exfil path: prompt-injection in
fetched content tells the agent to read a repo secret (e.g. `D:\Workspace\starboard\.env`) and emit
it in its output. A prompt constraint is not an enforcement boundary — enforce in the hook.

**Do:**
- Extend the PreToolUse hook to also gate file-**read** tools (`Read`, and any read/grep/glob that
  takes a path) **for web-scout and operator only**. Deny reads resolving outside the sandbox.
- Builder / Reviewer / Codebase-Scout keep full read — read-deny applies ONLY to the two web roles.
- Stage operator's declared input files *into the sandbox* so it reads them there, not from a repo.
- **Critical:** gate on the **resolved absolute path** — resolve `..\` traversal **and symlinks**
  (`fs.realpathSync`) FIRST, then check containment. A string match is bypassable with `..\`.
  *(Note: the existing write-fence is textual `path.resolve` — apply the realpath upgrade to both
  the read and write paths while you're in here.)*

**Done when:** a web-scout asked to read a file outside its sandbox — by absolute path AND via `..\`
traversal — is denied in both cases, surfaced in Logs, no crash. Add as a test beside write-fence
tests E (13/14).

## P2 — Per-role filtered env for PTYs [Recommendation]
**Why:** `pty-start` passes `env: process.env` to every PTY. Correct for a launcher and NOT a
renderer leak, but every pane (incl. a fenced web-scout) can read every secret via `$env:`. Pairs
with P1 — both shrink what a misbehaving agent reaches.

**Do:**
- Pass a **filtered env per role** — each PTY gets only the vars its CLI needs.
- Only the **video-scout (Gemini)** pane carries `GEMINI_API_KEY`. A Builder (Claude) pane has no
  reason to hold it; a fenced web-scout carries the minimum.
- `GEMINI_API_KEY` stays confined to main + the children that need it (unchanged) — just narrow
  *which* children.

**Done when:** `$env:GEMINI_API_KEY` is readable in a video-scout pane and **absent** in a
Builder/web-scout pane.

## P3 — Disk cleanup (targeted auto-delete + manual housekeeping) [Recommendation]
**Why:** raw yt-dlp videos in `media/` are large, pure intermediate (Gemini already extracted the
text), no reuse value. Everything else (diffs, Gemini text output, notes) may still be wanted — must
NOT be auto-deleted.

**Do:**
- **Auto-delete the raw video file** from `media/` as soon as the Gemini analysis call returns
  successfully. Only the video — nothing else.
- Add a manual **"Clean outputs/media"** action for the rest (old diffs, stale sandbox outputs).
  User-triggered, never automatic.
- Keep `media/` **outside all worktrees and outside the write-fence sandbox**. [Verify] — current
  state: `media/` and `.agent-review.diff` are gitignored (won't commit) but accumulate on disk;
  `media/` lands under the PTY cwd (repo or `~`), the sandbox is separate, so they don't collide.

**Done when:** analyzing a video leaves no leftover video on success; the manual clean action exists
and touches only intermediates, never source/notes.

## Feature A — Video-scout cost/tier controls in the UI [Recommendation]
**Why:** model + resolution are buried in code, so one click can hit the **rate** limit (a 20-min
video on the **free API tier** blew the ~250K tokens/min cap). **Correction baked in:** AI Plus /
AI Pro consumer subscriptions **do NOT apply** — they cover the Gemini *app*, not the API. The
video-scout bills per-token via `GEMINI_API_KEY`. The fix is **API-side controls, not a
subscription** — don't chase a plan that wouldn't help.

**Do — first-class controls in the Video-scout flow:**
- **Model picker:** Flash-Lite / Flash / Pro. Default **Flash-Lite** (cheapest, still native video).
  Show a rough cost estimate for the pasted video's length before running.
- **Resolution picker:** LOW / MEDIUM / HIGH. Default **MEDIUM**. Note: HIGH only for reading
  on-screen code/text.
- **Chunking:** split into ~5-min segments so each call stays under the 200K-token surcharge line
  and the per-minute rate limit. Per-chunk progress; a failed chunk **resumes**, not restart-all
  (also fixes "stopped halfway").
- **Guardrail:** max-duration / max-estimated-cost cap that asks for confirmation before an
  expensive run (URL is user-pasted).

**Cost reference (modeled, [Verify] vs. first real bill):** Flash-Lite @ MEDIUM, chunked ≈ **$0.08–
$0.12** per 20-min video. Pro @ default res ≈ **$0.70–$1.50** and crosses the 200K surcharge. Solid
lessons: Flash ≈ 8× cheaper than Pro; LOW/MEDIUM ≪ HIGH; chunk to dodge the 200K cliff. Treat any
single minute-count as an estimate.

**Done when:** user picks model + resolution, sees an estimate, runs chunked with resume, and a
long/expensive video prompts for confirmation.

## Feature B — Chat-style interface over the PTYs (Option 1 first) [Recommendation]
**Why:** the agents are real CLIs in PTYs — terminal output is how they communicate, not a skin to
remove. "Make it chat-like" is a presentation layer, not a rewrite.

**Option 1 — chat surface over the PTY (do this):**
- Keep the PTY underneath; render a conversational view on top — user turns as right-aligned
  bubbles, agent responses as left-aligned blocks.
- Collapse the raw terminal behind a **"show terminal"** toggle.
- Reuse the existing `cleanText()` (built for TTS) to drive the view.
- **Keep per-pane role identity** — orange Builder badge, green Reviewer 🔎, cyan Scout, etc. Each
  pane = a labeled, color-coded chat thread. This is what makes multi-agent chat readable.
- Preserves all terminal hardening (clipboard/OSC52, web-links, ResizeObserver fit, WebGL) under the
  toggle.

**Option 2 — true structured chat client (LATER, do NOT start) [Verify]:** consume each CLI's
structured/streaming output, render as real chat. Cleaner end state, real rebuild, differs per CLI.
Before ever committing: **confirm which of Claude Code / Codex / Gemini support a clean structured/
streaming output mode.** If any don't, Option 2 = two rendering systems. Stay on Option 1 until
verified.

**Done when:** Option 1 renders panes as chat threads with role badges, terminal one toggle away,
all existing terminal features intact.

## P4 — Make audio truly offline (= the CSP tightening) [Recommendation]
**Why:** `connect-src` is broad (`'self' https:`) and "local" audio still fetches ORT WASM from
jsdelivr (and possibly weights) on first run. Closing that makes the tool genuinely offline AND
tightens CSP in one move — the actual reason this project exists. Reframe the backlog item from "CSP
hardening" to "make audio truly offline."

**Do — in order:**
1. **Network-off test FIRST:** after a normal first run (models cached), disable the network and
   launch audio. Record exactly what still reaches out (likely ORT WASM from jsdelivr; check for any
   model fetch). This produces the precise vendoring list.
2. Vendor ORT WASM + model weights locally; serve via a custom protocol.
3. Drop the jsdelivr + broad `https:` grants from `connect-src`; scope to `'self'` + whatever (if
   anything) genuinely remains.

**Done when:** network off (post-cache), TTS + STT work end to end, and CSP no longer grants broad
`https:`.

## P5 — Backlog #3 stays a BLOCKING gate (standing rule) [Recommendation]
The Gemini video-scout is **not** hook-protected (the fence is Claude-Code-only). Contained today by
only analyzing a downloaded file + the yt-dlp host/size/playlist caps — acceptable now. But if the
video-scout is ever given a broad write/file capability, the hook won't catch it and it needs
**OS-level sandboxing**. Keep this a **blocking** gate on any future "let the video-scout write
files" feature — never silently skipped.
