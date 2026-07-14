# Blue Helm — Execution Checklist

Work down in this order. The sequence is locked and batched by theme (not by P-number).
Each item has **what/why**, **how to do it**, and **done when**. The standing rule at the
end is a policy, not a step. Re-run the relevant hard-test items after each; batch 1 and 2
in one sitting (same mental model).

---

## 1. Read-fence for web-scout & operator  — HARD GATE
**Do this before either role runs on anything real.**

**What/why:** The write-fence blocks writes *into* repos but not reads *out* of them.
web-scout and operator have `Read` + web access, so a prompt-injection in fetched content
could make them read a repo secret (e.g. `starboard\.env`) and emit it. Close the read side.

**How:**
1. Extend the PreToolUse hook to also gate **read** tools (`Read`, plus any path-taking
   grep/glob) for **web-scout and operator only**. Builder / Reviewer / Codebase-Scout keep
   full read.
2. Deny any read whose target resolves **outside the role's sandbox dir**.
3. **Resolve the real path first** — use `fs.realpathSync` to collapse `..\` traversal and
   symlinks, *then* check containment. A textual `path.resolve` is bypassable; this is the gotcha.
4. Apply the same realpath upgrade to the **existing write path** in one pass — it currently
   uses textual `path.resolve` with no symlink resolution, so it has the same gap. One change
   hardens both read and write.
5. **Write-path gotcha:** `realpathSync` throws if the target file doesn't exist yet (writes
   often create new files). So for writes, resolve the **parent directory** (which exists) and
   check containment of the final path against it — otherwise a valid first-time write in the
   sandbox throws and the fence fails-closed on legitimate files. Reads don't need this.
6. For operator's declared inputs: **stage them into the sandbox** so it reads them there
   instead of reaching into a repo.

**Done when:** a web-scout asked to read a file outside its sandbox is denied via **(a)** an
absolute path AND **(b)** a `..\` traversal, surfaced in Logs, no crash. Then prove it
adversarially — prompt a web-scout to read a repo `.env` and confirm it's denied, not just
that a path test fails. **That Logs-tab denial under a real injection-style prompt is the
result to bring back.**

---

## 2. Per-role filtered env for PTYs
**Same blast-radius theme — do right after #1 while the context is fresh.**

**What/why:** `pty-start` passes `env: process.env` to every pane. Correct for a CLI launcher,
but it means every pane (including a fenced web-scout) can read every secret via `$env:`.
Narrow it.

**How:**
1. Pass a **filtered env per role** — each PTY gets only the env vars its CLI needs.
2. Only the **video-scout (Gemini)** pane carries `GEMINI_API_KEY`. Builder (Claude) and
   web-scout get the minimum; neither needs the Gemini key.
3. Keep the key confined to main + the children that need it (unchanged) — this just narrows
   *which* children.

**Done when:** `$env:GEMINI_API_KEY` is present in a video-scout pane and absent in a
Builder / web-scout pane.

---

## 3. Targeted cleanup
**Auto-delete raw video on success; manual housekeeping for the rest.**

**What/why:** Raw yt-dlp videos in `media/` are large, pure intermediate (Gemini already
extracted the text), no reuse value. Everything else (diffs, Gemini output, notes) may be
wanted — don't auto-delete those.

**Pre-confirmed (no need to re-verify):** `media/` and `.agent-review.diff` are gitignored
(won't commit) and accumulate; `media/` lands under the PTY cwd while the fence sandbox is
separate, so they don't collide. `.agent-review.diff` is overwritten per review and dies with
the worktree on remove-agent.

**How:**
1. **Auto-delete the raw video file** from `media/` as soon as the Gemini analysis call
   returns successfully. Only the video file.
2. Add a manual **"Clean outputs/media"** action for everything else (old diffs, stale sandbox
   outputs). User-triggered, never automatic.

**Done when:** analyzing a video leaves no leftover video on success; the manual clean action
exists and touches only intermediates, never source/notes.

---

## 4. Feature A — Video-scout cost/tier controls in the UI
**Quick, high daily value — and it clears the thing that stopped you last night.**

**What/why:** Model + resolution are buried in code, so one click can hit the rate limit (last
night: a 20-min video on the **free API tier** blew the ~250K tokens/min cap — a *rate* limit,
not a spend limit). **Correction baked in:** AI Plus / AI Pro consumer subscriptions do NOT
apply — they cover the Gemini *app*, not the *API*. The video-scout uses `GEMINI_API_KEY`
(API, per-token). The fix is API-side controls + enabling pay-as-you-go billing, not a
subscription.

**How — surface as first-class controls in the Video-scout flow:**
1. **Model picker:** Flash-Lite / Flash / Pro. Default **Flash-Lite** (cheapest, still native
   video). Show a rough cost estimate for the pasted video's length before running.
2. **Resolution picker:** LOW / MEDIUM / HIGH. Default **MEDIUM**. Inline note: HIGH only for
   reading on-screen code/text.
3. **Chunking:** split into ~5-min segments so each call stays under the 200K-token surcharge
   line and the per-minute rate limit. Show per-chunk progress; a failed chunk **RESUMES**
   rather than restarting the whole job. (This also fixes last night's "stopped halfway.")
4. **Guardrail:** a max-duration / max-estimated-cost cap that asks for confirmation before an
   expensive run (the URL is user-pasted).

**Cost reference [Verify against first real bill]:** Flash-Lite + MEDIUM + chunked ≈
$0.08–$0.12 per 20-min video. Pro at default ≈ $0.70–$1.50 and crosses the 200K surcharge.
Solid lessons: Flash ≈ 8× cheaper than Pro; LOW/MEDIUM ≪ HIGH; chunk to dodge the 200K cliff.
Treat any single minute-count as an estimate.

**Done when:** user picks model + resolution, sees an estimate, runs chunked with resume, and a
long/expensive video prompts for confirmation.

---

## 5. Feature B — Chat-style interface over the PTYs (Option 1 only)

**What/why:** Agents are real CLIs in PTYs — terminal output is *how they communicate*, not a
skin. So "chat-like" is a presentation layer, not a rewrite.

**How (Option 1):**
1. Keep the PTY underneath. Render a conversational view on top: your turns as right-aligned
   bubbles, agent responses as left-aligned message blocks.
2. Collapse the raw terminal behind a **"show terminal"** toggle.
3. Reuse the existing `cleanText()` (built for TTS) to drive the view.
4. **Keep per-pane role identity in the chat view** — orange Builder badge, green Reviewer
   lock, cyan Scout, etc. Each pane = a labeled, color-coded chat thread. This is what makes
   multi-agent chat readable; a generic chat UI loses it.
5. All existing terminal hardening (clipboard/OSC52, web-links, ResizeObserver fit, WebGL)
   keeps working under the toggle.

**Do NOT start Option 2 yet** (a true structured chat client). Before ever committing to it
**[Verify]:** confirm which of Claude Code / Codex / Gemini support a clean structured/streaming
output mode. If any don't, Option 2 means maintaining two rendering systems — not worth it.
Stay on Option 1 until verified.

**Done when:** agent panes render as chat threads with role badges, terminal one toggle away,
all terminal features intact.

---

## 6. Make audio truly offline (test → vendor → tighten CSP)

**What/why:** `connect-src` is broad (`'self' https:`), and the "local" audio still fetches ORT
WASM from jsdelivr (and maybe weights) on first run. Closing this makes the tool genuinely
offline AND tightens CSP in one move — which is the whole point of the project. (Reframed from
"CSP hardening" to "make audio truly offline.")

**How (in this order):**
1. **Network-off test FIRST:** after a normal first run (models cached), disable the network
   and launch audio. Record exactly what still reaches out (likely ORT WASM from jsdelivr;
   check for a model fetch). That's your precise vendoring list.
2. Vendor the ORT WASM + model weights locally; serve via a **custom protocol**.
3. Drop the jsdelivr and broad `https:` grants from `connect-src`; scope to `'self'` + whatever
   genuinely remains.

**Done when:** with the network off (post-cache), TTS + STT work end to end, and CSP no longer
grants broad `https:`.

---

## Standing rule (not a step) — OS-sandbox gate for any future Gemini file-write

The Gemini video-scout is **not** hook-protected (the fence is Claude-Code-only). Today it's
contained by only ever analyzing a downloaded file + the yt-dlp host/size/playlist caps —
acceptable. But if the video-scout is ever given a broad write/file capability, the hook won't
catch it and it needs **OS-level sandboxing**. Keep this a **BLOCKING** gate on any such future
feature — never silently skipped.
