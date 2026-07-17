# Builder Handoff — P13 Duration-Guard Hardening

Branch: `feature/p13-duration-guard-hardening` — STACKED on the reviewed 9c branch
`feature/transcript-timestamps` per the work order, making merge order structural:
merge 9c first, then P13.
Fork-point SHA (recorded before implementation): `0dd0c40` (== the 9c tip)
Pre-merge main SHA: `d8d0931` (main is behind this stack by 9c; the P13-only reviewed
delta is `0dd0c40...<tip>`)
Tip SHA: implementation `5f300ac`; this docs-only handoff commit sits on top
Merge commit SHA: Pending human approval (after 9c)

Tier: FULL-CLASS — changes a cost-direction guard and its maximum user override.

Intended invariant: every duration-guard decision receives explicit, valid inputs and
fails closed before a Gemini submission; when the duration probe itself fails, the
user receives a bounded explanation without a raw stack trace.

## Work-order items → what shipped

1. **Decision-layer range validation** — `Resolve-DurationGuard` now runs a step-0
   request-shape check before any probe-result handling: `HasRange` outside video
   mode → `range-not-supported-for-mode`; equal/reversed/negative boundaries →
   `invalid-range` (both bounded deterministic constants). Params are `[int]`-typed,
   so "malformed" at this layer means shape violations; string-level garbage is
   already refused upstream, and the decision no longer relies on that. Valid video
   ranges behave byte-for-byte as before (regression-tested).
2. **No ambient caller-scope reads** — `Assert-DurationGuard` takes `-ProbeTimeoutSec`
   (default 60) and `-MaxDurationSeconds` (default 0 = unset) as declared parameters;
   a declared local always exists, so PowerShell dynamic scoping structurally cannot
   fall through to same-named caller variables. Both `feed-gemini.ps1` call sites
   (SDK route + CLI route) pass them explicitly. The poison test sets the pre-P13
   ambient names ($ProbeTimeoutSec=999, $MaxDurationSeconds=7200) in caller scope,
   calls WITHOUT the params, and proves the probe saw 60 and no override applied.
3. **Override ceiling 86400 → 14400** — `[ValidateRange(1, 14400)]`; 14400 accepted,
   14401 and the old 86400 rejected at BIND time (proven pre-probe with zero network
   via the offset-refusal staging trick); explicit 0 still rejected (pre-existing
   test); unset default still binds and uses per-mode defaults.
4. **Probe-fault diagnostic** — `Invoke-DurationProbe`'s catch now writes ONE bounded
   line ("the duration probe itself failed (refusing fail-closed): <reason>") before
   the unchanged fail-closed return: control characters collapsed (no forged log
   lines), 200-char cap with a truncation marker, exception MESSAGE only — never a
   stack trace, command line, environment, credential, or response body. The
   downstream guard still refuses (tested end-to-end through Assert).
5. **Anchored yt-dlp backstop match** — `Resolve-NoFileMessage` matches
   `(?m)^\[tag\] … does not pass filter ( …duration… ), skipping` instead of the bare
   phrase. A representative rejection line is recognized; plain titles, mid-line
   phrases, and non-duration parenthesized text are ignored (all tested). Accepted
   residual, message-only blast radius: a title byte-replicating the ENTIRE
   structured diagnostic could still spoof the explanation string — never the
   allow/deny, which is decided independently by the probe guard.
6. **Self-cleaning test stubs** — the whole `invoke-duration-probe.Tests.ps1` body
   now runs in `try/finally`; the global job-cmdlet shadows and stub variables are
   removed even if an assertion or setup throws. A trailing stub-hygiene Describe
   proves `Start-Job` resolves back to the real Cmdlet after the file.
7. **Node tripwire positive control — AUDITED, already satisfied.** feed-gemini's
   success-path test (`a successful SDK run finalizes completed…`) asserts
   `NodeReached | Should Be $true`, which proves the stubbed node path is reachable
   and the tripwire is a live positive control. No duplicate assertion added.
8. **PROJECT-STATE.md credential instructions** — both `setx` recommendations
   replaced: in-app secure key setup, Electron `safeStorage` persistence, the
   `[Environment]::SetEnvironmentVariable('GEMINI_API_KEY', $null, 'User')` cleanup
   command, and the full app/terminal restart note. The working credential
   implementation is untouched.

## Exclusions honored

No TTS/STT/renderer/app-package.json changes (app gate byte-identical), no K6
formatting work, no K5 retry changes (`gemini-video-sdk.js` untouched on this
branch), no merges/pushes/shortcut/worktree changes, no paid or network acceptance
run tonight, no Pester-pin rework, no validation framework.

## Commands run and exact results (this tree, `5f300ac`)

- Focused suites (`get-duration-guard.Tests.ps1` + `invoke-duration-probe.Tests.ps1`
  + `feed-gemini.Tests.ps1`): **84 passed, 0 failed**.
- Full Pester gate: **267 passed, 0 failed, 0 skipped (of 267)** — 244 baseline on
  the 9c stack + 23 new P13 assertions. No existing assertion disappeared.
- Full app gate: **529 passed, 0 failed** — functionally unchanged, as required.

## Known limitations

- The anchored-filter residual described in item 5 (message-only).
- `Assert-DurationGuard`'s parameter defaults (60/0) exist so a hypothetical caller
  omitting them still gets safe behavior; both production call sites pass explicitly,
  and the poison test pins the no-ambient-fallback contract.
- The two Windows PSScriptAnalyzer warnings on the poison test ("variable assigned
  but never used") are the deliberate point of that test: the variables exist to be
  ignored.

Unexpected pre-existing findings: none. (Two in-flight test-harness bugs of my own —
Pester's Describe-default `Assert-MockCalled` scope and `Remove-Item`'s nonexistent
`-Scope` parameter — were caught by the focused run and fixed before commit.)

Recommended whole-diff review focus (per the work order): range validation and mode
restrictions · explicit parameter wiring · the 14,400-second ceiling · fail-closed
exception handling with the bounded diagnostic · the anchored yt-dlp match.

Review diff (P13-only delta vs the 9c base):
`git diff 0dd0c40...HEAD --output=.agent-review-p13-duration-guard-hardening.diff`
(pinned, gitignored)

Reviewer verdict: Pending

Reviewer verdict source: Pending

## Morning acceptance procedure (human-initiated; NOT run by the Builder)

Launch the P13 worktree build directly
(`.worktrees\p13-duration-guard-hardening\app` — verify the process command line;
renderer markers are unchanged on this branch) or run `scripts\feed-gemini.ps1` from
the P13 worktree in a terminal. Then:

1. **Over-limit refusal (free — refused before any paid call):** pick a real YouTube
   video longer than 90 minutes and run it in full VIDEO mode
   (`-Mode video`, no offsets, no override). Expect: the probe line, then
   `Duration guard: mode=video gate=source measured=<N> limit=5400s -> REFUSED` and
   the "exceeds the 5400s limit" message; no download, no Gemini call; manifest
   outcome `refused`. Optionally retry with `-MaxDurationSeconds 14401` and confirm
   the parameter binder rejects it immediately.
2. **Valid short video (paid, cheapest):** run a short (<5 min) captioned video in
   transcript mode on `gemini-2.5-flash-lite` (this doubles as the pending 9c
   acceptance since P13 stacks on it). Expect: guard `-> OK`, the timestamped
   transcript brief announcement, a normal analysis, manifest `completed`, and no
   guard noise beyond the two normal probe lines.

## Review-diff rule

- This branch stacks on 9c: the P13-only reviewed delta is `git diff 0dd0c40...<tip>`;
  the full delta vs main is `d8d0931...<tip>` and includes 9c (review 9c through its
  own handoff/diff).
- Always use `--output`; never PowerShell `>` for pinned review diffs.
- Retain the literal `VERDICT: PASS|FAIL` line and identify the review that produced it.
