# Mako status

Updated 2026-10-17 by Claude (PR #27). Every PR that changes the state updates this file.

## Right now

- **Release:** Mako 1.0 release candidate in PR #27 (version 1.0.0). Not yet merged or tagged.
- **Plan:** 1.1 month-one plan drafted in [docs/PLAN-1.1.md](docs/PLAN-1.1.md) (25 sessions).
- **Guardrails:** repo-side files are in PR #27. The GitHub settings in
  [docs/SETUP-GUARDRAILS.md](docs/SETUP-GUARDRAILS.md) still need Blue's clicks.

## 1.0: done

Quick Links · pane status (now works on current Claude Code) · P1 environment containment · H1
acceptance · fence stack and deterministic roles · Mako branding, taskbar identity and shortcut ·
daily-driver workday · Shift+Enter newline · real build label · Vibe Kanban removed · Windows CI.

## 1.0: left

1. ~~Windows CI green on PR #27~~ Done: app tests and PowerShell tests (983 passed, 0 failed) pass on
   GitHub's Windows runner.
2. On Blue's PC: recover the lost reviewer and builder conversations before about **2026-11-03**,
   when Claude Code deletes 30-day-old transcripts; short smoke test. Steps:
   [docs/handoff/FINISH-1.0.md](docs/handoff/FINISH-1.0.md).
3. Blue merges PR #27 and approves the `v1.0.0` tag.

Known limitations shipping with 1.0 are in [docs/RELEASE-NOTES-1.0.md](docs/RELEASE-NOTES-1.0.md).

## Next

1.1 session S01 (finish guardrails, then the daily runner). See the plan.
