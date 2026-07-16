# Builder Handoff - TTS Terminal Live Repair

Branch: `feature/tts-terminal-live-repair`
Fork-point SHA: `ef3e26a`
Pre-merge main SHA: `ef3e26a`
Reviewed implementation tip: Pending corrective-delta review
Merge commit SHA: Pending human live proof and merge

Intended invariant: an explicit terminal selection reaches the existing Speak
action in every pane without exposing selected text in Logs; an unavailable
audio module refuses visibly; Kokoro uses fp32 on WebGPU and q8 on WASM.

Files changed:

- `app/renderer/app.js`, `app/renderer/index.html`, and
  `app/renderer/tts-selection.js` preserve the selection through the speaker
  interaction and log only pane metadata plus character count.
- `app/renderer/tts.js` and `tts-device-config.js` use device-specific Kokoro
  options.
- Focused selection/config tests are wired into `npm.cmd test`.
- `audio-module-health.js` catches an audio ES-module failure or a missing
  ready event and makes the unavailable engine explicit in both the control
  strip and Logs. Dictate receives a refusal handler rather than remaining a
  hollow button. This does not package or repair Whisper itself.
- The master status and work order truthfully retain audio as incomplete.

Security-sensitive surfaces touched: none. No main-process, IPC, permission,
credential, microphone, provider, or cost-control code changed.

Commands run:

- `npm.cmd test` in `app/`
- `powershell -ExecutionPolicy Bypass -File scripts/run-pester.ps1`

Exact test results:

- App: 281 passed, 0 failed.
- Pester: 216 passed, 0 failed.

Manual verification still required:

1. Fully quit Electron, including the tray instance.
2. Start the branch build and open a PowerShell pane plus Builder and Reviewer
   agent panes.
3. In each pane, select terminal text and click that pane's Speak button.
   Logs must report pane/role/character count, never selected text.
4. Confirm intelligible English speech on WebGPU, voice selection, speed, and
   Stop. Confirm the WASM fallback path separately.

Known limitations:

- No STT/Whisper repair, Voice Console, target lock, queue, or permission
  hardening is included.
- A cancelled pointer press can leave a transient selection snapshot until the
  next pointer press; Reviewer classified this as non-material.

Recommended review focus: same-pane selection capture and the audio-module
failure path (including the Dictate fallback); human proof remains the merge
gate.

Review diff:
Recreate after the corrective-delta commit with:
`git diff main...HEAD --output=.agent-review-tts-terminal-live-repair.diff`

Prior reviewer verdict: `VERDICT: PASS` for `368fdfa`; corrective delta needs
one new scoped Standard-class review before merge.

Reviewer verdict source: scoped read-only review of the pinned diff, July 16,
2026. The Reviewer could not execute tests; the Builder/Codex app and Pester
gate results above are the execution record.
