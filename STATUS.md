# Mako status

Updated 2026-10-18 by Claude. Every PR that changes the state updates this file.

## Right now

- **Your next steps:** [BLUE-CHECKLIST.md](BLUE-CHECKLIST.md), in order.

- **Release:** Mako 1.0 release candidate merged to `main` on 2026-10-17 (PR #27, merge commit
  `4d60c9e`, version 1.0.0). The PC smoke test passed on 2026-10-18 (below). Not yet tagged: the
  `v1.0.0` tag waits until Blue merges PR #33 (the Electron-binary fix), then goes on that `main`
  (Blue's decision, 2026-10-18; checklist step 5).
- **Plan:** 1.1 month-one plan approved with that merge: [docs/PLAN-1.1.md](docs/PLAN-1.1.md).
- **Guardrails:**
  - The repo-side files are live on `main`, and the merge audit has passed on every merge.
  - Part A (checklist step 2) is done and verified on 2026-10-18. `main` now requires a pull request
    and both Windows checks, and blocks force-pushes and deletion.
  - Part B (step 7, the agent account) is next. Until it is done, agents still act as `ABlueAI`.
  - The merge audit raised a false alert on 2026-10-18 (issue #35): PR #33 was stacked on #32's
    branch, and its commits reached `main` through PR #34. The audit now counts every commit of a PR
    merged into `main`, and AGENTS.md forbids stacked PRs. Fixed in PR #37; Blue closes
    #35 after merging it (checklist step 11).
- **Daily runner:** scheduled for 8:01 AM Eastern from 2026-10-18 ([docs/RUNNER.md](docs/RUNNER.md)).
  Until checklist step 7 is done it only sends a "waiting on step N" notice.

## 1.0: done

Quick Links · pane status (now works on current Claude Code) · P1 environment containment · H1
acceptance · fence stack and deterministic roles · Mako branding, taskbar identity and shortcut ·
daily-driver workday · Shift+Enter newline · real build label · Vibe Kanban removed · Windows CI ·
lost-work recovery · PC smoke test.

## 1.0: left

1. ~~Windows CI green on PR #27~~ Done: app tests and PowerShell tests (983 passed, 0 failed) pass on
   GitHub's Windows runner.
2. ~~On Blue's PC: recover the lost conversations; smoke test~~ Done 2026-10-18 (results below).
3. ~~Blue merges PR #27~~ Done 2026-10-17. The `v1.0.0` tag follows once PR #33 is merged (checklist step 5).

Known limitations shipping with 1.0 are in [docs/RELEASE-NOTES-1.0.md](docs/RELEASE-NOTES-1.0.md).

## 1.0 close-out on Blue's PC (2026-10-18)

- **Smoke test: passed** on `main` at `ab5ce5a`, started from the desktop shortcut. Blue checked each
  row and Claude confirmed the running process:
  - The toolbar and window title read `Mako 1.0.0 · main@ab5ce5a`.
  - Mako opens on Agents, with no Board tab and no Vibe Kanban button.
  - Shift+Enter inserts a newline and Enter sends.
  - Claude status is on, and the badge went from working to turn ended in color.
  - Claude Code is 2.1.302, so the "unverified" tooltip is expected.
- **Tests on this PC:** `scripts\run-pester.ps1` gave 984 passed, 0 failed. CI's 983 is the expected
  one-test machine difference, the same 984 as the October 2 record. `npm test` in `app/` passed.
- **Install note:** `npm ci` did not download Electron 42's binary, and the desktop shortcut runs
  `app\node_modules\electron\dist\electron.exe` directly, so it took a manual
  `node node_modules\electron\install.js`. The cause is Electron 42 itself: it has no install script
  and downloads lazily on the first `npm start`. Fixed in PR #33: an `app/package.json` postinstall
  downloads and checks the binary, and `npm test` now fails first if it is missing. Until PR #33 is
  merged, the manual step still applies.
- **Recovered work:** the missing reviewer work was found intact. It is two Claude Code conversations
  Mako had open on Oct 6 and 7 (business research). Blue confirmed it is the missing work. Mako
  doesn't reopen panes after a restart, so it looked lost; both can be resumed with `claude --resume`.
  No builder transcript exists for that period. Blue can't recall the task, so it is dropped. The
  private summary is kept off-repo in `outputs\recovered-2026-10\`.
- **Why the app closed:** a Windows Update restart. At 06:36 on Oct 15 Windows restarted the PC
  unattended (System log event 1074, `MoUsoCoreWorker.exe`, "Service pack (Planned)"). Both open
  transcripts stopped at that second. There were no crash events (6008 or 41). Blue has set Windows
  Update active hours and restart notifications.
- **Transcript retention:** Blue chose to keep Claude Code's 30-day default (`cleanupPeriodDays` not
  changed).
- **Branches:** classified, nothing deleted: [docs/BRANCHES-2026-10.md](docs/BRANCHES-2026-10.md).

## Next

1. Blue merges PR #33. Then the PC session tags `v1.0.0` on that `main` (checklist step 5).
2. Then 1.1 session S01 (finish guardrails, then the daily runner). See the plan.
