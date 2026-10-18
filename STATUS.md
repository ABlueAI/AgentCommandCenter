# Mako status

Updated 2026-10-18 by Claude. Every PR that changes the state updates this file.

## Right now

- **Your next steps:** [BLUE-CHECKLIST.md](BLUE-CHECKLIST.md), in order.

- **Release:** Mako 1.0 release candidate merged to `main` on 2026-10-17 (PR #27, merge commit
  `4d60c9e`, version 1.0.0). Not yet tagged: the PC smoke test comes first (checklist steps 4 and 5).
- **Plan:** 1.1 month-one plan approved with that merge: [docs/PLAN-1.1.md](docs/PLAN-1.1.md).
- **Guardrails:**
  - The repo-side files are live on `main`, and the merge audit has passed on every merge.
  - Part A (checklist step 2) is done and verified on 2026-10-18. `main` now requires a pull request
    and both Windows checks, and blocks force-pushes and deletion.
  - Part B (step 7, the agent account) is next. Until it is done, agents still act as `ABlueAI`.
- **Daily runner:** scheduled for 8:01 AM Eastern from 2026-10-18 ([docs/RUNNER.md](docs/RUNNER.md)).
  Until checklist steps 7 and 8 are done it only sends a "waiting on step N" notice.

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
3. ~~Blue merges PR #27~~ Done 2026-10-17. Then Blue approves the `v1.0.0` tag (checklist step 5).

Known limitations shipping with 1.0 are in [docs/RELEASE-NOTES-1.0.md](docs/RELEASE-NOTES-1.0.md).

## Next

1.1 session S01 (finish guardrails, then the daily runner). See the plan.
