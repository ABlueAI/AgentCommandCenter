# Work Order — Agent-pane TTS mouse-selection repair

Branch: `feature/tts-agent-mouse-selection`

Tier: **Standard-class**. Blast radius: renderer-only terminal selection routing.
Worst-case failure is a recoverable selection that still does not reach TTS. No
security boundary, credentials, destructive operation, or cost-direction guard is
touched.

## One invariant

An ordinary text drag in an agent terminal must create a real xterm selection that
the pane speaker can read, even while the agent TUI has enabled mouse tracking. A
same-cell click must remain a normal TUI interaction, and PowerShell/native xterm
selection behavior must remain unchanged.

## Evidence that drives the repair

- Human acceptance passed Dictate and PowerShell TTS in build `.3`.
- Agent-pane Speak repeatedly logged `selection missing` from the new selection
  resolver, proving the current/remembered inputs were both empty.
- xterm 6 exposes `term.modes.mouseTrackingMode` and documents that mouse tracking
  disables normal selection unless Windows users hold Shift.
- Use xterm's public `term.select()` API after a completed drag; do not patch or
  vendor xterm internals.

## Acceptance

- Agent mouse mode: ordinary forward and reverse drags become selections.
- Same-cell click: no synthetic selection.
- Mouse mode `none`: native selection remains authoritative.
- Pane-local memory receives the resulting selected text.
- A successful fallback logs pane/role/character count only, never selected text.
- Speak Logs name pane/role/character count only, never selected content.
- App and Pester gates green.
- Live shortcut build title and control strip show
  `AUDIO ACCEPTANCE 2026-07-16.4` before human retest.
