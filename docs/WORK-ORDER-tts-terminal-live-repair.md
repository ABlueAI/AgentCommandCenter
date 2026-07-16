# Work Order - TTS Terminal Live Repair

## Goal

Make the existing explicit-selection Speak control work in every terminal pane
and use the valid Kokoro model settings for intelligible English speech. The
control speaks only text the user selected; it never auto-speaks a pane.

## Tier and blast radius

**Standard-class.** One invariant on `feature/tts-terminal-live-repair`:
selection reaches the existing TTS action reliably, an audio module startup
failure refuses visibly, and the selected Kokoro backend receives its
supported dtype.

**Blast radius:** renderer-side event handling, local model configuration, and
diagnostic Logs. A failure remains a recoverable nonfunctional TTS control. No
credential, permission, provider, cost, destructive, or security boundary is
touched.

## Human evidence

- TTS bootstrapped successfully in a PowerShell pane, but WebGPU output sounded
  garbled/non-English despite the selected American English voice.
- In Builder, Reviewer, and Web Scout terminal panes, visibly selected terminal
  text was lost before Speak read it and Logs reported no selection.
- The user is using the control correctly. Do not substitute a different
  selection workflow or blame the operator.
- The July 16 screenshot contains main's old `[tts] select some text...` log
  rather than this branch's pane/role diagnostic, proving the failed test was
  still running `main`. Main also still requests `q8` on WebGPU; this branch
  uses Kokoro's documented `fp32` WebGPU configuration.

## Required scope

- Capture any visible selection within the initiating pane before the
  speaker-button interaction can trigger the pane focus handler; use that
  capture for the existing Speak action. Xterm selection remains preferred,
  with a same-pane DOM selection fallback for rendered content.
- Log only pane identity, role, and selected-character count. Never log selected
  text. Preserve a visible no-selection refusal.
- If either deferred browser audio module never announces readiness, surface an
  honest unavailable status and an explanatory Logs entry. Dictate must never
  be a silent button, even though the missing Whisper package is repaired on
  its own STT branch.
- Load Kokoro with `fp32` on WebGPU and `q8` on WASM.
- Distinguish model synthesis from actual playback, report the selected English
  voice/backend/dtype, and validate the generated Float32 waveform before
  Web Audio receives it.
- Display an unmistakable acceptance-build marker in both the window title and
  control strip so an old main build cannot be mistaken for this branch again.
- Add focused tests for selection handoff/refusal and per-device model settings.

## Explicitly out of scope

- STT/Whisper bootstrap, microphone permission, Voice Console, docking,
  transcript targeting, quick-speak UI, queueing, cloud TTS, and engine internals.
- K8 audio permission hardening.

## Acceptance

- [ ] Selecting text in PowerShell and at least two agent panes reaches Speak.
- [ ] Logs identify the initiating pane/role and character count without text.
- [ ] WebGPU and WASM use the correct model dtype.
- [ ] App and Pester gates pass.
- [ ] A full Electron restart precedes human proof of intelligible English,
      voice selection, speed, Stop, and WebGPU/WASM behavior.

## Gate

One scoped review of selection handoff, diagnostic privacy, and backend config.
Do not merge or push before the human live proof passes.
