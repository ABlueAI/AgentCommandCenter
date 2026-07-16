# Work Order - TTS Agent-Pane Selection Retention

## Goal

Make explicit TTS selection work in Claude/agent xterm panes as reliably as it
already works in a PowerShell pane. The same Kokoro engine remains unchanged;
this branch repairs only the selection handoff into that engine.

## Tier and blast radius

**Standard-class.** One invariant: a non-empty selection observed inside one
terminal pane remains available to that pane's Speak button even if the agent
TUI or focus transition clears xterm's live selection before `click`.

**Blast radius:** renderer-only selection memory and its focused unit tests.
Worst-case failure is a recoverable Speak control that still refuses. No model,
audio playback, permission, credential, cost, IPC, or main-process surface is
touched.

## Evidence

- Kokoro speaks selected PowerShell text in intelligible English, proving model
  loading, voice selection, synthesis, and Web Audio playback work.
- The same control produces no speech from agent panes.
- Agent panes run interactive TUIs in xterm; their selection can be cleared by
  mouse/focus handling before the header button's final `click` reads it.
- The existing tests cover the resolver only. They do not retain a selection
  observed earlier through xterm's `onSelectionChange` lifecycle.

## Required scope

- Add a small per-pane selection memory to the existing shared
  `tts-selection.js` module.
- Remember only non-empty text; never log or persist the text.
- Feed the memory from xterm `onSelectionChange` and pane mouse selection.
- Clear it when a new selection gesture begins and after every Speak attempt,
  so one pane cannot replay stale text indefinitely.
- Prefer a current pointer/click selection over remembered text.
- Log only pane, role, character count, and whether the source was current or
  remembered.
- Dispose xterm selection listeners when the pane closes.

## Explicitly out of scope

- Kokoro model, dtype, playback, automatic speech, queues, paragraph checkboxes,
  STT accuracy, microphone capture, or permissions.

## Acceptance

- Focused tests prove current selection precedence, remembered fallback,
  pane-local consumption, clearing, whitespace refusal, and log privacy.
- Full app and Pester gates remain green.
- One scoped Reviewer pass over the memory and app wiring before merge.

