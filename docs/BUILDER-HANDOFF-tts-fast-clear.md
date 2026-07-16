# Builder Handoff — TTS Fast Clear

Branch: `feature/tts-fast-clear` (independent of `feature/transcript-timestamps`; both
fork from the same main — neither is stacked on the other)
Fork-point SHA: `d8d0931`
Pre-merge main SHA: `d8d0931` (local == origin/main, verified before branching)
Tip SHA: implementation `286a21e`; this docs-only handoff commit sits on top
Merge commit SHA: Pending human live acceptance and merge

Intended invariant: the selected speed represents LISTENING speed, not Kokoro synthesis
speed. Kokoro always generates fully articulated speech at natural speed 1.0; the
browser performs pitch-preserving accelerated playback.

Tier: Standard-class — local TTS playback + failure visibility only. No security,
credentials, destructive operations, cost direction, microphone permission, or provider
calls.

Feasibility probe (approved correction #1, run BEFORE replacing the working Web Audio
path; probe deleted before the implementation commit): a bounded in-worktree Electron
42.5.0 run proved, with a tiny generated sine WAV and no model download:
- unprefixed `preservesPitch` supported; default `true`; `webkitPreservesPitch` NOT
  present (the prefixed set is therefore conditional and inert on this Chromium);
- a click-initiated request (trusted `sendInputEvent` click) followed by a 1.5 s
  synthesis-representative delay still resolves `play()`; the no-gesture variant also
  resolves (Electron's default autoplay policy);
- 0.5 s of audio at `playbackRate = 2` ended in ~329 ms — real native pitch-preserving
  time compression. No external audio library needed.

Files changed (implementation commit `286a21e`):

- `app/renderer/wav-encode.js` (NEW) — dependency-free Float32 PCM → 16-bit PCM mono
  RIFF/WAVE bytes. Transport formatting only (no resampling/stretching); clamps
  out-of-range samples, refuses malformed input.
- `app/renderer/tts-playback-queue.js` (NEW) — the sequential media-element queue,
  dependency-injected (`createAudio`/`createObjectUrl`/`revokeObjectUrl`/
  `getPlaybackRate`/`onError`) so the EXACT production implementation is unit-tested in
  plain Node. Contract (each item test-proven): strict chunk order; one active element
  (overlap impossible); next ready chunk starts on `ended` with no artificial gap;
  `getPlaybackRate()` read when each chunk STARTS (approved correction #5 — a
  mid-speech speed change applies from the next chunk); rate clamped 0.5–2 with
  malformed → 1; `preservesPitch = true` on every element (+ prefixed alias only when
  the element exposes it); `done` promise settles exactly once — `completed` only
  after `end()` and the final chunk finishing, `stopped` on stop/replacement (never a
  hang), `failed` on playback failure reported once through the single `onError` path
  (correction #2); idempotent finalization — racing `ended`/`error`/play-rejection/
  stop cannot double-revoke a URL, resurrect playback, or produce a second terminal
  outcome (correction #3); every object URL revoked exactly once on completion, stop,
  replacement, failure, and stale-enqueue-after-finish; a throwing onError/revoke sink
  cannot hang the queue or hide the outcome.
- `app/renderer/tts.js` — `tts.generate(chunk, { voice, speed: 1.0 })` ALWAYS; the Web
  Audio scheduler (`AudioContext`/`createBufferSource`/`nextStart`/`scheduled[]`) is
  replaced by one playback queue per `speak()` request; `speak()` awaits `queue.done`
  and reports `idle` ONLY after a completed drain — a playback failure sets a visible
  error that no later `idle` overwrites, and `stop()` reports idle itself; `requestId`
  latest-request-wins, `cleanText`, sentence chunking, `ensureModel` (WebGPU/WASM
  bootstrap), voice handling, and the 0.5–2 `setSpeed` clamp are unchanged;
  `window.ccTTS` API surface unchanged. `stop()` disposes the active queue (immediate
  pause + full URL revocation).
- `app/renderer/wav-encode.test.js` (NEW, 26 assertions) — header fields, sizes,
  little-endian PCM payload, clipping (no wraparound), NaN → silence, refusals.
- `app/renderer/tts-playback-queue.test.js` (NEW, 37 assertions) — exercises the
  actual exported `createPlaybackQueue` (correction #4: no reconstruction) across the
  full contract above, including the racing-terminal-events idempotence matrix and
  bounded no-content diagnostics.
- `app/renderer/tts.test.js` — 19 → 36 assertions; every pre-existing assertion
  preserved on the media-element path (harness now fakes `Audio` and spies on Node's
  REAL object-URL lifecycle; captured WAV blobs are parsed back to prove the waveform
  and 24 kHz rate reach playback unchanged) plus: Kokoro always receives speed 1.0
  with the selected voice; the selected 2x reaches every element's playbackRate with
  preservesPitch; speed clamps; idle-only-after-drain; visible, non-overwritten,
  content-free play() rejection; URL revocation on success and failure paths.
- `app/package.json` — the two new suites added to the gate.
- `app/renderer/app.js` / `index.html` — marker `TTS FAST CLEAR ACCEPTANCE
  2026-07-16.6` (window title, control strip, startup Logs).

Explicitly untouched (scope discipline): TTS selection capture, mouse-mode terminal
selection, text-cleaning semantics, voice list, Kokoro/ONNX internals, STT/Whisper,
the K8 media-permission policy, pane targeting, audio permissions, TTS control layout.

Security-sensitive surfaces touched: none.

Commands run and exact results (this tree, `286a21e`):

- `npm.cmd test` in `app/` (untracked node_modules junction):
  **609 passed, 0 failed** across 19 suites — baseline 529 + 80 new (wav-encode 26,
  tts-playback-queue 37, tts.js 19→36 = +17). Per-suite: nav-guard 26, launchers 13,
  video-scout-args 103, task-name 53, media-permission-policy 106, agent-dom 38,
  tts-selection 27, audio-module-health 9, tts-device-config 3, tts-audio-contract 9,
  tts-bootstrap 16, wav-encode 26, tts-playback-queue 37, tts 36, stt-env-config 14,
  stt-bootstrap 47, stt-audio-quality 16, stt-target-lock 11, stt 19. No existing
  assertion disappeared (the old tts 19 are a preserved subset of the new 36).
- `powershell -ExecutionPolicy Bypass -File scripts/run-pester.ps1`:
  **216 passed, 0 failed, 0 skipped (of 216)** — unchanged (scripts side untouched;
  the 9c Pester additions live on the independent `feature/transcript-timestamps`
  branch).

Live paths actually tested versus mocked:

- REAL: the Electron feasibility probe above (real renderer, real media element, real
  2x pitch-preserving playback); the real tracked Kokoro bundle import through the
  real tts.js; Node's real Blob/object-URL lifecycle in the adapted tts suite.
- MOCKED (deliberately — tests must not load the model or play audio): Kokoro
  generation (delegating stub), the HTMLAudioElement in Node suites (auto-`ended`
  fake), WebGPU adapters.
- NOT yet proven: real Kokoro audio through the new path at 2x on this machine's
  speakers — exactly the human acceptance this build is launched for.

Known limitations:

- Chunk boundaries are element swaps now; the queue starts the next chunk on `ended`
  with no artificial delay, but a sub-frame element-start latency at each sentence
  boundary is possible (the probe measured ~80 ms pipeline start on a cold element;
  warm swaps are smaller). Human acceptance judges whether this reads as natural.
- A mid-speech speed change applies from the NEXT chunk (explicit queue contract),
  same user-visible granularity as before.
- At 1x, output is bit-identical PCM to the old path's buffer (same samples, same
  rate) played at rate 1.0 — pitch and pacing unchanged by construction.

Unexpected pre-existing findings: none.

Recommended review focus (Standard-class, scoped): natural-speed generation
(`speed: 1.0` hunk) · pitch-preserving playback-rate wiring (queue element setup) ·
queue/cancellation behavior incl. latest-request-wins and stop · blob URL lifecycle
(revoke-exactly-once idempotence) · visible playback failure (single onError path,
never overwritten by idle) · absence of unrelated audio or permission changes.

Review diff:
`git diff d8d0931...HEAD --output=.agent-review-tts-fast-clear.diff` (pinned,
gitignored)

Reviewer verdict: `VERDICT: PASS`

Reviewer verdict source: scoped read-only Standard-class Reviewer pass (fresh subagent),
July 16, 2026, over the pinned `.agent-review-tts-fast-clear.diff` (`d8d0931...1a86801`)
plus worktree source. All six scoped areas verified by reading (natural-speed
generation · rate-at-chunk-start + preservesPitch wiring · queue/cancellation incl.
latest-request-wins and settle-exactly-once · revoke-exactly-once URL lifecycle under
racing terminal events · single visible bounded failure path · no unrelated surface).
Test integrity confirmed: the queue suite imports the ACTUAL exported module, and all
19 pre-existing tts.test.js assertions are a preserved subset of the new 36. Two LOW
non-blocking observations recorded verbatim:
(1) tts.js:165-170 — if enqueue() ever hit the queue's SYNCHRONOUS
'element-setup-failed' branch, the firstAudio block would immediately overwrite the
error status with 'speaking' and nothing corrects it; the realistic failures (async
play() rejection, media error event) fire later and survive, and in production
createAudio is `new Audio(url)` + two property sets which do not throw in Electron, so
the branch is effectively unreachable. Suggested minimal fix if ever touched: gate the
firstAudio status on `!queue.isFinished()`.
(2) tts.js:158-171 — after a mid-stream playback failure the synthesis loop keeps
generating remaining chunks that the finished queue discards (wasted inference, no
correctness impact). Suggested minimal fix: also break the loop on
`queue.isFinished()`.
Gate execution (app 609/0, Pester 216/0/0, Electron feasibility probe) accepted from
the Builder's record; the Reviewer has no shell.

## Review-diff rule

- Before merge, the reviewed delta is `git diff d8d0931...<tip>`.
- After merge, reproduce it with `git diff d8d0931...<tip>` (recorded pre-merge main).
- Always use `--output`; never PowerShell `>` for pinned review diffs.
- Retain the literal `VERDICT: PASS|FAIL` line and identify the review that produced it.
