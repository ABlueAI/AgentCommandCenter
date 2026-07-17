# Builder Handoff — 9c Timestamped Transcript Output

Branch: `feature/transcript-timestamps`
Fork-point SHA: `d8d0931`
Pre-merge main SHA: `d8d0931` (local == origin/main, verified before branching)
Tip SHA: implementation `4afaa92`; this docs-only handoff commit sits on top
Merge commit SHA: Pending human live acceptance and merge

Intended invariant: a default transcript-mode analysis turns the timestamped SRT source
into an actionable summary whose substantive claims and recommended video ranges are tied
to caption-derived timestamps; timestamps are never invented.

Tier: Standard-class — transcript-mode report formatting only. No security, credential,
destructive-operation, duration-guard, routing, or cost-direction code changed.

Files changed (implementation commit `4afaa92`):

- `prompts/transcript-analysis.md` (NEW) — the default transcript brief: (1) KEY POINTS
  with [HH:MM:SS] / [HH:MM:SS–HH:MM:SS] citations on every substantive point; (2) a
  chronological TIMESTAMP MAP (`[HH:MM:SS–HH:MM:SS] — topic/event`, repetitive
  auto-caption cues merged); (3) RECOMMENDED RANGES — one to three, each with exact
  whole-second integer `Start: N` / `End: N` values for the range fields, a short why,
  context padding, and an honest "none worth recommending" escape; plus overriding
  honesty rules (SRT-cue timestamps only, never estimated/extrapolated, explicit
  statement when reliable timestamps cannot be extracted, caption timing declared
  approximate subtitle timing). Contains no double quotes (the PS→gemini CLI argument
  boundary would break on them).
- `scripts/lib/get-transcript-prompt.ps1` (NEW) — `Get-TranscriptPrompt` loader,
  mirroring `get-video-scout-prompt.ps1` (UTF-8 read for the BOM-less file, clear throw
  when missing).
- `scripts/feed-gemini.ps1` — only the `'transcript'` case of the existing
  `if (-not $Prompt)` default-briefs switch changed: it now dot-sources the helper,
  prints ONE bounded line (`Timestamped transcript brief requested (default prompt)`,
  no content), and uses `Get-TranscriptPrompt`. An explicit `-Prompt` never enters that
  branch (complete caller override, proven behaviorally below). Audio/video defaults,
  yt-dlp arguments (incl. the existing `--write-auto-subs --write-subs
  --convert-subs srt`), duration guards, routes, offsets, manifests, models, and the
  Gemini invocation are untouched.
- `scripts/lib/get-transcript-prompt.Tests.ps1` (NEW, 15 assertions) — prompt contract +
  loader behavior, including survival of `Get-CliSafePrompt` flattening.
- `scripts/feed-gemini-transcript-prompt.Tests.ps1` (NEW, 13 assertions) — BEHAVIORAL
  wiring proof per the approved correction (source-text checks are not the sole proof):
  runs the real `feed-gemini.ps1` down the transcript CLI path with `-NoFeed`, zero
  network, zero paid calls. Harness: a stub `yt-dlp.ps1` prepended to PATH
  (`Get-YtDlpPath` resolves it via `Get-Command`; a .ps1 stub runs in-process so the
  `%(title)s` output template is never cmd.exe-mangled) writes a fake `.srt` into the
  real run directory; the duration probe's `Start-Job`/`Receive-Job` layer is shadowed
  with globals (the same seam `feed-gemini.Tests.ps1` already uses) returning `100|NA`.
  Proven: the printed deferred gemini command carries the timestamp contract and the
  `@Fake_Test_Video.en.srt` attachment on one flattened line; the bounded announcement
  line appears; a custom `-Prompt` reaches the deferred command verbatim with the
  default helper never invoked; the `.srt` remains in the run dir; the `-NoFeed`
  manifest finalizes truthfully as `completed` with `appliedMode: transcript`.
  Audio/video default strings and the SRT flag lines are additionally pinned at source
  scope (exercising those modes for real would drag in mp3/mp4 plumbing this
  prompt-only branch does not touch).

Security-sensitive surfaces touched: none.

Commands run and exact results (this tree, `4afaa92`):

- `powershell -ExecutionPolicy Bypass -File scripts/run-pester.ps1`:
  **244 passed, 0 failed, 0 skipped (of 244)** — baseline 216 + 28 new (15 contract +
  13 behavioral wiring). No existing assertion disappeared.
- `npm.cmd test` in `app/` (untracked node_modules junction):
  **529 passed, 0 failed** — unchanged, as expected (no app-side file touched).

Manual verification: the behavioral suite output was inspected once by eye — the full
flattened brief is visible in the deferred `gemini -m gemini-2.5-flash-lite -p "…"` line
followed by the srt attachment. No real Gemini request was made by the Builder anywhere
on this branch (paid use stays human-initiated).

Known limitations:

- The brief instructs; it cannot force. Gemini could still disobey (e.g., fabricate a
  timestamp) — the honesty rules are prompt-level, and the human acceptance step
  (plausibility of timestamps against the source captions) is the check for that.
- Auto-captions themselves may be wrong or badly timed; the prompt makes Gemini present
  cue timing as approximate rather than pretending precision.
- The behavioral harness pins the CLI (`-NoFeed`) path. Transcript mode always takes
  the CLI route today (the SDK route is video-only), so that is the whole surface.

Unexpected pre-existing findings: none.

Recommended review focus (Standard-class, scoped): timestamp honesty in
`prompts/transcript-analysis.md` · transcript-only wiring in the `feed-gemini.ps1`
default switch · custom-prompt preservation (behavioral test) · absence of changes to
download/routing/guard/manifest/paid-call behavior · proportionality of the tests.

Review diff:
`git diff d8d0931...HEAD --output=.agent-review-transcript-timestamps.diff` (pinned,
gitignored)

Reviewer verdict: `VERDICT: PASS`

Reviewer verdict source: scoped read-only Standard-class Reviewer pass (fresh subagent),
July 16, 2026, over the pinned `.agent-review-transcript-timestamps.diff`
(`d8d0931...ac408f9`) plus worktree source. All five scoped areas verified by reading
(timestamp honesty · transcript-only wiring, incl. confirming transcript can never take
the SDK route around the default switch · behavioral custom-prompt preservation · no
download/routing/guard/manifest/paid-call changes · proportional tests with sound
harness stubbing and cleanup). Zero findings at any severity. Gate execution (Pester
244/0/0, app 529/0) accepted from the Builder's record; the Reviewer has no shell.

## Review-diff rule

- Before merge, the reviewed delta is `git diff d8d0931...<tip>`.
- After merge, reproduce it with `git diff d8d0931...<tip>` (recorded pre-merge main).
- Always use `--output`; never PowerShell `>` for pinned review diffs.
- Retain the literal `VERDICT: PASS|FAIL` line and identify the review that produced it.
