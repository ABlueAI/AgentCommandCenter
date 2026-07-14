# Blue Helm — Master Status & Runbook
### ⭐ Open THIS file first. The two detailed briefs are deep reference only.

**What this is:** the single ordered to-do list across the whole project.
Numbered items below are in **execution order** — start at the lowest unchecked
number, finish it, move to the next. Done work is listed separately with no
numbers (nothing to do there).

**The two reference docs (open only when you need deep detail on a step):**
- Video-scout / Gemini SDK detail → `BLUE-HELM-VIDEO-SCOUT.md`
- Fence-security detail (WO-1…WO-7) → `BLUE-HELM-READ-FENCE-TEST-BRIEF.md`

**What we're building (one line):** a self-hosted "mission control" desktop app
that runs several AI coding agents in parallel — each sandboxed and supervised —
to build and operate the Starboard business. "Video-scout" is one of those
agents; it analyzes videos via Gemini.

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

**Fence-security**
- Fence audit (WO-1)
- cwd enforcement (WO-6) — built + independently reviewed (PASS)
- `claude.json` write-mutex (WO-7) — built + independently reviewed (PASS)
- Env scrub + `setx` GEMINI_API_KEY removal (WO-2) — done + machine restarted
  *(optional 10-sec verify: open a builder pane, `echo $env:GEMINI_API_KEY` → empty)*

---

## 🎯 ACTIVE — Video-scout (current focus, do in order)

> **1. ⬅ START HERE — merge the stale-transcript fix** (built and live-verified
> clean; merge-eligible). The SDK migration should also be merged if you haven't
> already — both are clean and independent.

> **2. Wire the section-select UI** — the transcript → pick a time range →
> deep-dive only that slice workflow (offset params already exist and are
> live-verified; this adds the modal range-picker). ~79–81% cheaper per dive,
> confirmed on live content. **This is the payoff step** — it turns everything
> verified this session into the tiered workflow you described wanting.

> **3. Budget guardrail** — using the real `usageMetadata` token numbers the SDK
> now returns (not estimates).

> **4. Add timestamps to transcript-mode output** — so the transcript pass can
> drive the section-picking in step 2.

---

## ⏸ PARKED — Fence-security cleanup (return after video-scout is solid)

> **5. Finish WO-6 live tests** — steps 2–4: missing-cwd refusal, wrong-directory
> refusal, builder-unaffected. (Step 1 happy-path already passed.)

> **6. Finish WO-7 live tests** — steps 2–3: concurrent launches (confirm one
> trust entry per sandbox), and the read-only error path. (Step 1 already passed.)

> **7. WO-4 — per-role env allowlist** — fenced roles still receive the full
> `process.env`; scope them down. (Not started.)

> **8. WO-3 — fail-closed guard** — refuse launch if a fenced role is ever given
> Bash/Glob/NotebookEdit. (Not started.)

> **9. WO-5 — git hygiene check** — confirm clean commit history across all the
> merged work. (Not started.)

> **10. Batch the non-blocking review follow-ups** (all small, do together):
> shared `realOrNearest` module · drop the root-equality branch · gate
> `videoScout` on role identity · dedupe the double log emit · clean up orphan
> `.tmp` files · document the cross-process `claude.json` race · assert
> `CLAUDE_CODE_SUBPROCESS_ENV_SCRUB` is honored at runtime.

---

## 🐛 KNOWN ISSUES — backlog, not blocking

> **11. Video download cleanup / auto-delete** — every run now creates a
> `run-<timestamp>-<PID>` subdir under `downloads\` that is never cleaned up (a
> side effect of the stale-file fix — correct tradeoff, but it raised the
> disk-growth rate). Add auto-delete after a successful Gemini analysis, and/or a
> retention sweep. Not urgent (files are small), but do it before the tool runs
> unattended for long stretches.

> **12. Clipboard copy-paste** — flaky in panes generally, and likely **never
> covered for the video-scout pane at all** (the original fix targeted the
> standard Claude pane path). Treat as "add coverage for the Gemini pane."

> **13. Usage/cost dashboard** — cross-vendor spend visibility. Partly obsoleted
> for video by the new `usageMetadata` logging (step 3), but still wanted for the
> Claude / Codex token pools.

---

*Update rule: when a numbered item is finished, move it up to the DONE section
(drop its number) so the lowest remaining number is always "what's next."*
