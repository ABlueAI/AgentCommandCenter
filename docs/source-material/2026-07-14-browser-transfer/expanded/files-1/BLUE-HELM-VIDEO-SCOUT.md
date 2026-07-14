# Blue Helm — Video-Scout: Prompt Upgrade + Feature A Spec

> ⭐ **For current status and the ordered to-do list, open
> `BLUE-HELM-MASTER-STATUS.md` first.** This file is deep reference detail only —
> it is NOT the place to track what's done or what's next. Sections here may be
> superseded (the CLI Feature A plan is dead; see the SDK pivot section below).

*Deep reference for the video-scout workstream. Part 1 = the analysis prompt.
The SDK pivot section = the live plan. Part 2 (CLI Feature A) = superseded.*

---

## 📍 WHERE WE STAND & WHAT'S NEXT (read this first)

*Last updated this session. This is the single source of truth for next steps
across BOTH workstreams. Everything below it is reference detail.*

### 🔴 IMMEDIATE BLOCKER (updated) — video mode: Gemini receives no video

**Progress:** the `-p`/positional-argument error is FIXED. Root cause turned out
to be PowerShell 5.1's native-argument serialization not escaping interior `"`
in the prompt (not the cmd.exe shim as first theorized). Fixed by owning the
`& node gemini.js` call directly and applying `CommandLineToArgvW`-correct
escaping (`ConvertTo-NodeCliArg`) — prompt text reaches Gemini intact, no
mutation, and the whole class (`" % & ^ \`) is closed. 27/27 tests. Merged (or
merge-eligible on your read).

**New blocker (video mode only):** with parsing fixed, Gemini now responds — but
reports it received **no video to analyze** (text-only), with a telltale
`Ripgrep not available, falling back to GrepTool` line implying the prompt
arrived as plain text. **Hypothesis (verify, don't assume):** the `@<file>`
attachment reference, previously glued into the same `-p` string, may no longer
be delivered in the form the gemini CLI recognizes as "attach this media." A
diagnose-first work order for this is in the chat. Note the `@file`+`-p`
coexistence is delicate: a bare `@path` positional would re-trigger the
positional-vs-`-p` guard, so *how* it rides alongside `-p` matters.

**Likely NOT blocking transcript mode:** transcript mode does text analysis of
an `.srt` (no video attached), so it may work TODAY despite the video bug —
test it. Audio mode probably shares video's bug (`.mp3` needs the same
multimodal attachment).

### 🟡 VIDEO-SCOUT WORKSTREAM — current state

**Just built (pending your review/merge):** the `-Mode` toggle —
transcript/audio/video selectable in the modal, **defaults to transcript**
(cheapest, cost opt-in for video). Distinct field `analysisMode`, allowlisted,
27/27 tests, **zero main.js changes** (fence gate untouched by construction, no
Reviewer pass needed). Caveat: modal defaults to transcript, bare CLI still
defaults to video — different defaults per entry point, reconciles correctly.

**Next, in order:**
1. **Merge the `-Mode` toggle, then test transcript mode** — likely your first
   working end-to-end run, in the cheapest mode. If it works you have a usable
   tool today.
2. **Run the `@file` diagnostic** to fix video-mode attachment (for when visual
   analysis is actually needed).
3. **Capture `/stats`** on a real video-mode run once #2 is fixed — this is the
   still-missing real tokens-per-hour number that sizes everything below. (A
   transcript-mode `/stats` is cheap-by-definition and won't answer the video
   cost question.)
4. **`-Mode transcript` is now the triage foundation** for the chunking design
   (A3) — transcript-triage → review → selective visual pass.
5. **A2 estimate/cap → A3 chunking+triage → A4 resume** — the cost-control chain.
   (See Part 2; A2's partial-return only becomes real on top of A3's chunks.)
6. **Accepted-but-open:** the escaping fix closed `" % & ^ \`; no known
   special-char gap remains on the node-direct path.

### 🟢 FENCE-SECURITY WORKSTREAM — the original thread, still has loose ends

Design work is done (WO-6 + WO-7 built and independently reviewed, setx
cleared). What never got closed:
1. **Live-test steps** — WO-6 steps 2–4 (missing-cwd, wrong-dir,
   builder-unaffected); WO-7 steps 2–3 (concurrent, error-path). Cheap,
   worth doing once for real-world confirmation.
2. **Non-blocking follow-ups** from the three reviews — shared `realOrNearest`
   module, drop the root-equality branch, gate `videoScout` on role identity,
   dedupe the double log emit, orphan `.tmp` cleanup, document the cross-process
   race, assert `CLAUDE_CODE_SUBPROCESS_ENV_SCRUB` is honored.
3. **WO-4** — per-role env allowlist (fenced roles still get full `process.env`).
4. **WO-3** — fail-closed guard if a fenced role ever gains Bash.
5. **WO-5** — git hygiene check (cheap; confirm clean history).

### 🔵 CROSS-CUTTING / KNOWN ISSUES

- **Clipboard copy-paste** — broken/flaky in panes generally, and specifically
  **likely never covered for the video-scout pane at all** (the original
  `term.focus()` fix targeted the standard Claude PTY path; video-scout uses a
  separate launch path). Treat as "add coverage for the Gemini pane," not just
  "still broken." Backlog.
- **Usage/cost visibility** — the "spent 25K but can't tell which pool" mystery
  has no resolution without instrumentation. The backlog's usage/cost dashboard
  is the real fix; today's cost questions are an argument to prioritize it.

### Suggested single next action

**Run the diagnose-first work order for the video-scout error.** It's the one
thing actively blocking a working feature, and its outcome (local-merge gap vs.
new arg bug) determines the very next move. Everything else is
non-blocking and can follow.

---

## Part 1 — Upgraded analysis prompt (USE NOW)

**Where this goes:** the **video-scout pane input** — the same place you typed
the prompt for test #1. You are *not* editing `feed-gemini.ps1`; this is just
the instruction text handed to Gemini alongside the video. Paste it, then
provide the video the same way you did last time.

**Why it's structured this way:** true visual / on-screen-text / audio
separation can only happen while Gemini still has the actual multimodal file —
once it writes prose, the modality distinction is flattened and no downstream
agent can re-derive it. So the categorization has to be *requested in this
single pass*, not bolted on afterward. This prompt forces that.

```
Analyze this video comprehensively and thoroughly. Structure your response in
this EXACT order, using these exact section headers:

1. TL;DR
   2-3 sentences capturing the absolute essence of the video — what it is,
   what it claims or shows, and the single most important takeaway.

2. DETAILED SUMMARY
   Three explicitly separated subsections. Do not blend them:

   a. VISUAL — scenes, framing, camera work, graphics, imagery, transitions.
      Describe what is SHOWN, independent of any text or narration.

   b. ON-SCREEN TEXT / OVERLAYS — any text graphics, captions, UI, or
      overlays distinct from scene description. Quote verbatim where legible;
      note timestamps of key text.

   c. AUDIO / SPOKEN — narration, dialogue, tone, music, sound cues.
      Paraphrase the spoken content, but quote verbatim anything whose exact
      wording is significant (claims, numbers, names, calls to action).

3. COMPREHENSIVE TIMESTAMPED FINDINGS
   Everything you observe, in chronological order with timestamps. Tag each
   entry with which category it belongs to: [VISUAL], [TEXT], or [AUDIO].
   Be exhaustive — this is the raw evidence layer.

4. DISCREPANCIES & CROSS-CHECKS
   Explicitly call out any place where the visual, the on-screen text, and the
   spoken audio DISAGREE with each other (e.g. a number shown on screen that
   differs from a number spoken). Do not silently resolve conflicts by picking
   one — surface them. If a claim seems internally inconsistent or unverifiable
   from the video alone, say so.

5. SOURCE-CREDIBILITY NOTE
   Briefly assess what KIND of content this is (e.g. tutorial, marketing,
   leaked-info claim, hype/monetization funnel) based on framing, calls to
   action, and internal consistency. Flag if the content shows signs of being
   promotional or if claims cannot be verified from the video itself.
```

**Note on section 5:** added deliberately. Test #1's video had the shape of
hype/monetization content (dramatic "leaked" framing, face-anchor, "I'll send
the link directly" closer) *and* an internal contradiction video-scout caught
on its own (two different character counts). Baking a credibility pass into the
prompt makes the model surface that judgment every time instead of by luck.

**Watch the cost on this run.** You're going from a short clip to a larger file
with none of the Part 2 guardrails built yet, and you've hit a rate limit live
once before. Keep an eye on token/usage directly — nothing is stopping a large
file from being expensive by surprise until Feature A exists.

---

### Status log (running record — update as work lands)

- **PR #22** — persistent analysis prompt (`prompts/video-scout-analysis.md` +
  file-backed loader). Merged.
- **PR #23** — `-Model` / `-MediaResolution` script params on
  `feed-gemini.ps1`. Media-resolution confirmed **not enforceable on the
  Gemini CLI path** — logged/validated only, with an honest in-log warning.
  Merged.
- **PR #24** — wired `-Model`/`-MediaResolution` into the New-Agent modal
  (distinct field names `videoModel`/`mediaResolution` to avoid colliding
  with the Claude `model` field; server-side allowlists in `main.js`; fence
  gate confirmed untouched via pre-implementation Reviewer risk map). Merged.
- **PR #25** — fixed a real bug found on the first live end-to-end run: the
  Windows `gemini.cmd` shim truncates a quoted argument at any embedded
  newline (`cmd.exe`'s line-based `%*` substitution), which silently split
  the 49-line file-loaded prompt into a second bare positional token,
  colliding with `gemini`'s own "can't use both a positional prompt and `-p`"
  guard. Fixed via `Get-CliSafePrompt` — collapses whitespace/newlines to
  single spaces before the value becomes `-p`'s argument. Applies uniformly
  to both the file-loaded default and any `-Prompt` override. Verified via a
  stub-shim reproduction + 7 new Pester tests, zero real network/token spend.
  Awaiting merge.

**Known accepted limitation (not fixed, deliberately deferred):** other
`cmd.exe`-special characters in a prompt — literal `%`, `&`, `^`, `"` — could
still trigger a related batch-escaping break; only whitespace/newlines are
sanitized today. Low-priority backlog item; revisit if a future prompt edit
introduces any of those characters.

**Still not run:** a real Gemini response has not yet come back through the
fixed pipeline. Once PR #25 merges, the next video run is the actual
end-to-end confirmation — watch for: (1) the five-section format surviving
the flattened, newline-free prompt, (2) real token cost on this first genuine
call, (3) the resolution-warning text rendering as expected.

---

## 🧭 ARCHITECTURAL PIVOT — SDK path (supersedes the CLI-based Feature A below)

**Decision (this session):** stop building on the `gemini` CLI. It has a hard
~20MB inline-attachment cap — no full-length video can ever be attached through
its `@file` mechanism. The `@google/genai` SDK / REST `generateContent` path
does natively — and better — most of what the CLI-based Feature A (below) was
going to build from scratch. **Everything under "Feature A build spec (CLI —
SUPERSEDED)" is the OLD plan, kept only for reference. This section is the real
roadmap.**

**What the SDK path gives natively (verified against Google docs + cookbook):**
- **YouTube URL direct** — pass the URL as a video Part (`createPartFromUri`);
  no download, no 20MB cap. Covers every real use case so far (all YouTube).
- **Real resolution control** — `mediaResolution: LOW/MEDIUM/HIGH` in request
  config, actually enforced (the exact lever the CLI silently ignored).
- **Native section-scoping** — `VideoMetadata { startOffset, endOffset }` on the
  video Part analyzes only a time range. **THIS IS THE CHUNKING FEATURE — no
  ffmpeg clipping needed.** Confirmed working with a YouTube URL in the TS
  cookbook.
- **Native timestamps** — output can be "bullets with timestamps," and you can
  query specific MM:SS points. Solves the "transcript never said *when*" problem.
- **Files API** — the path for local / non-YouTube video; clears the 20MB
  ceiling (recommended for >100MB or reusing a file across requests).

**Caveats (real — don't ignore):** YouTube-URL input is in PREVIEW, free for
now, pricing/limits "likely to change." Hard cap: 8 hours of YouTube video per
day (far above the earlier ~2hr fear). Public YouTube only for the URL path.

**What survives / what's dead:**
- ALIVE: transcript mode (yt-dlp `.srt`, cheapest tier, no API video cost) —
  stays as the cheap first pass in the tiered workflow.
- DEAD: the CLI `@file` video path; the planned ffmpeg local-clipping for A3
  (replaced by `VideoMetadata` offsets).

**Re-scoped roadmap:**
1. **SPIKE (gate — do first).** Prove the SDK path on our AI Studio key and
   answer the two cost questions (spike work order is in chat):
   (A) does `mediaResolution: LOW` actually cut tokens, and by how much?
   (B) does a `VideoMetadata` offset actually reduce *billing* vs the whole
   video, or are we charged for the full video regardless? **B decides whether
   the transcript→pick-section→deep-dive workflow is nearly free or not.**
   The cookbook proves the capability WORKS; only the spike proves what it COSTS.
2. **Migrate video mode to `generateContent`** (YouTube-URL Part + Files API
   fallback), reusing the 5-section prompt. Resolution + timestamps come free
   with the call.
3. **Section-scoped deep-dive** = `VideoMetadata` offsets driven by the
   transcript pass's timestamps. The whole tiered workflow, mostly free once
   #2 lands.
4. **Budget guardrail** — now uses real `usageMetadata` token counts from the
   API response, not estimates.
5. **Transcript timestamps** — still worth adding to transcript mode so it can
   drive #3's section selection.

**OSS references to read before building (verified current, 2026):**
- **google-gemini/cookbook** (`github.com/google-gemini/cookbook`) — canonical
  source; has a Video_understanding quickstart. Clone and read the actual
  notebook, don't skim a blog summary of it.
- **TypeScript Gemini cookbook — Video_understanding** — MOST relevant, since
  the stack is Node/TS: shows `@google/genai` + `createPartFromUri` (YouTube
  URL) + `VideoMetadata` offsets + timestamped output — the exact pattern needed.
- **GoogleCloudPlatform/generative-ai** — `youtube_video_analysis.ipynb`:
  end-to-end YouTube analysis with structured JSON output via `response_schema`.
- **@google/genai SDK source** (`googleapis/js-genai`) — read the real
  `VideoMetadata`, `createPartFromUri`, `GenerateContentConfig` types, not
  approximations of them.
- Laurent Picard, "Unlocking Multimodal Video Transcription with Gemini"
  (Medium series) — practical, code-heavy walkthrough.

---

## Feature A build spec (CLI — SUPERSEDED, reference only)

*Kept for history. The CLI approach below is a dead end for full-length video
(20MB cap). Build against the SDK pivot section above instead.*

**Where this goes:** a **builder** Claude Code pane (builder is the role with
Bash + write access). This edits `feed-gemini.ps1` and the video-scout launch
path — real code, so it rides the same discipline as WO-6/WO-7: spec before
code, difficulty-scaled, **human merge gate, no auto-merge.**

**Scoping decision (why video-scout only, not all roles):** the other six roles
already have their cost lever solved via model/effort routing, and none of them
have a media-resolution or chunking concept. "Cost visibility across all roles"
is a genuinely different feature — it's the *usage/cost dashboard* already on
your backlog. Keep that separate; don't weld it into this. Bundling unrelated
concerns into one diff is exactly the review-difficulty problem WO-6/WO-7 hit.

### Recommended build order — NOT one pass

Four sub-parts, ascending in difficulty and dependency. Each is independently
testable and mergeable, which keeps the review precise and means a failure in
one doesn't obscure the others. Build and merge in this order:

**A1 — Model + resolution picker (do first; unblocks cost control immediately).** *Difficulty ~3.*
> Add two configurable parameters to the video-scout launch path
> (`feed-gemini.ps1` and wherever the renderer launches it): (1) Gemini model
> selection, defaulting to the cheap tier (Flash-Lite or current cheapest
> vision-capable model) with an option to escalate; (2) `mediaResolution`
> setting (LOW / MEDIUM / HIGH). Surface both as explicit choices at launch,
> not hardcoded. Document in a comment that `mediaResolution` drives token cost
> directly and is independent of the source file's download resolution. Log the
> chosen model + resolution at launch, visible in the Logs tab.

**A2 — Budget guardrail, partial-return style (do second; the actual cost/rate protection).** *Difficulty ~5.*
> Before dispatching, estimate token cost from duration/resolution/model and
> compare against a configurable ceiling (a $ budget and/or a token cap). Chosen
> behavior on exceed: **do NOT hard-refuse the whole job. Analyze up to the cap,
> then stop and return the partial result plus a clear boundary note** — e.g.
> "analyzed 0:00–1:45 of 3:00, stopped at budget cap X." A bounded answer beats
> nothing. Still surface the estimate up front in the Logs tab, and track
> cumulative session spend with a soft-limit warning. Fail-closed only in the
> sense that it never silently exceeds the cap — it stops and reports, it
> doesn't overspend.
>
> **Design note — the hard part is honest partial accounting.** "Return what was
> analyzed so far" only works cleanly if the pipeline processes in orderable
> units (see A3 chunking). For a single monolithic call, the API may not support
> "stop at N tokens and give me what you have" — so A2's partial-return is
> really only fully realizable *on top of* A3's chunk boundaries. Until A3
> exists, A2 should at minimum do the pre-flight estimate + hard-stop-with-
> warning (refuse before spending), and the true "partial result" behavior lands
> once chunking gives it natural stop points. Build A2's estimate/cap logic
> first; wire its partial-return to A3's boundaries when A3 lands.

**A3 — Chunking with transcript triage (do third; this is the real cost-saver).** *Difficulty ~7.*
> Two-stage design, chosen for cost control:
> 1. **Cheap triage pass:** run a transcript/audio-mode analysis over the whole
>    video first (dramatically cheaper than visual tokens) to produce a
>    segment map — which time ranges actually contain substantive content vs.
>    filler/noise.
> 2. **Selective expensive pass:** surface the suggested high-value chunks to
>    the user for **review/override** (auto-suggests, human confirms), then run
>    the expensive visual/Flash analysis ONLY on the confirmed chunks. Stitch
>    those results into the Part-1 five-section report, with the triage map
>    noting what was skipped and why.
>
> This is where the tab actually shrinks: you pay visual/Flash rates for the 25
> useful minutes of a 3-hour video, not the 180. Use the Files API for large
> uploads. Emit per-chunk progress + running cost to the Logs tab. The
> auto-suggest-then-confirm flow is a deliberate human-in-the-loop gate — the
> model triages cheaply, but the user decides what's worth the expensive pass.
>
> **Ordering caveat:** A3 makes A2's partial-return real (chunks are the natural
> stop points), and the transcript-triage stage depends on the `-Mode transcript`
> toggle existing as a clean, callable path. So the true build order is:
> `-Mode transcript` toggle → A2 estimate/cap → A3 (triage + selective + partial).

**A4 — Resume (do last; depends on A3's chunk boundaries).** *Difficulty ~6.*
> Persist per-chunk completion state so an interrupted multi-chunk analysis can
> resume from the last completed chunk instead of restarting — and re-billing —
> the whole video. Store resume state outside any fenced-role scrollback
> (consistent with the session-persistence security carve-outs already noted:
> don't persist sensitive scrollback, cap/expire cached state).

### Why not one pass

- **A2 (the guardrail) is the urgent one** — it's what actually stops the next
  expensive surprise. Building it first-or-second means you get protection
  before the harder chunking work, rather than after.
- **A3/A4 are the real engineering** (multi-chunk stitching + resumable state)
  and are where bugs will hide. Isolating them into their own diffs means when
  something breaks, you know which layer it's in.
- A one-pass build of all four would be a large diff spanning cost-estimation,
  API-upload mechanics, and stateful resume logic — hard to review precisely,
  hard to root-cause. Same lesson as the WO-6/WO-7 bundling.

### Suggested review posture

Not auth/secrets-boundary code, so it doesn't demand the full independent-Opus
Reviewer pass WO-6/WO-7 got. But A2 (budget logic) and A4 (resume state) are
the two worth a lighter review — A2 because a wrong comparison silently
disables the guardrail, A4 because bad resume state could double-bill or skip
content. A1/A3 are lower-stakes.
