# Mako status

Updated 2026-10-22 by Claude. Every PR that changes the state updates this file.

## Right now

- **Your next steps:** [BLUE-CHECKLIST.md](BLUE-CHECKLIST.md), starting with its "Do next" box.

- **Release: Mako 1.0.0 is released.**
  - Tag `v1.0.0` was created on 2026-10-18 at `main` commit `37009eb`, which includes the
    Electron-binary fix (PR #33, landed on `main` through PR #34).
  - Before tagging, on Blue's PC: `npm ci` restored Electron's binary by itself, and Mako opened from
    the desktop shortcut showing `Mako 1.0.0 · main@37009eb`.
  - The GitHub release is "Mako 1.0.0", from docs/RELEASE-NOTES-1.0.md.
- **Plan:** 1.1 month-one plan approved with that merge: [docs/PLAN-1.1.md](docs/PLAN-1.1.md).
  - **UI sessions on hold, Composer research planned (approved with the PR #48 merge):** S14
    and S17 to S20 are `HOLD (Blue)` until Blue says go (checklist step 18). S16 becomes "Composer
    research (includes the Dodaios trial)", ending in `docs/decisions/OSS-composer.md` and Blue's
    verdict (step 19); Composer build sessions and workflow automations come in a later plan change.
    S21 (logo) stays READY.
- **Claude plan:** Blue upgrades to Max 5x on Wednesday 2026-10-28 (moved from 2026-10-21 on
  2026-10-20; checklist step 8). Until then the runner builds one session at a time on Pro.
- **CI and dependencies (S02, done in PR #45):** every GitHub Action is pinned to a commit SHA, and both
  Windows checks were confirmed as required on `main` (ruleset `protect-main`, read 2026-10-19).
  `npm audit` is down from 11 advisories to 7: Electron 42.11.15, `undici`, `tar` and `protobufjs`
  are patched. The 7 left are in the speech stack's Node-side packages, which Mako's renderer never
  loads; each is explained in [docs/DEPENDENCY-ADVISORIES.md](docs/DEPENDENCY-ADVISORIES.md).
  Dictation and TTS on the new Electron still need a check on Blue's PC (checklist step 15).
- **Composer research (S16, PR #82):** [docs/decisions/OSS-composer.md](docs/decisions/OSS-composer.md)
  covers Dodaios (sandboxed trial without any model or key), Claude Code's parallel-agent features
  and Projects, Microsoft Conductor, the R15 pattern mine, Cloudroom (no Windows build) and workflow
  automation, each with a proposed verdict. Blue's verdict (2026-10-21, checklist step 19; his words in
  docs/DECISIONS.md): no option adopted, everything stays open for study, questions deferred; the
  Composer's design is to come from more OSS review.
  No Composer build session is planned yet.
- **Needs-you alerts (S05, PR #49 merged 2026-10-21, still IN PROGRESS):** Mako observes the
  existing pane-status views and uses Electron's native Windows notifications for attention and
  turn-ended transitions. The phone setup note is [docs/NEEDS-YOU-ALERTS.md](docs/NEEDS-YOU-ALERTS.md).
  S05 is done once Blue's real-pane toast check passes (checklist step 23); no Windows toast or phone
  delivery has been verified yet.
- **Quick Links bundle (S12, PR #86, in progress):** Quick Links' editor gets "+ Add Mako
  bundle", which adds seven links (Claude desktop, Codex app, Mako PRs, Project board, Obsidian
  vault, Hermes docs, Dodaios docs) without touching existing ones. The URL policy now also accepts
  exactly three app links (`claude://claude.ai/new`, `codex://threads/new`, `obsidian://open`) and
  nothing else outside http(s). Blue checks the links on his PC and confirms whether his existing
  "Starboard Platform" link is his Hexona login (checklist step 29).
- **Plan to issues (S03, PR #54, in progress):** a workflow keeps one `Sxx: <title>` issue per plan
  session, with status, authority, lane and sensitive labels and the "1.1 Month 1" milestone, in step
  with docs/PLAN-1.1.md on `main`. The Project board joins once Blue connects it (checklist step 25).
- **Marina research brief (S22, PR #116, needs Blue):** S22's brief must go in a private
  repository, and none exists yet. Blue creates one and gives `ABlueAgent` write access (checklist
  step 32); a later runner fire then does the research and pushes the brief there.
- **All-day runner (S04, PR #84, in progress, pending Blue):** proposed in docs/RUNNER.md "S04: the
  all-day runner": hourly fires at :07 Eastern, a parallel cap of 1 on Pro counted from expiring
  locks, a clean stop and resume at usage limits, no phone notification per fire, and one evening
  digest at 8:03 PM. Researched from the official docs on 2026-10-21: the minimum interval is one
  hour, no daily run cap is stated, and no documented way lets a cloud session read plan usage, so
  the 90% warning moves to S11. Nothing is applied until Blue merges it; then steps 28 and 27 in
  the same sitting.
- **Guardrails:**
  - The repo-side files are live on `main`, and the merge audit has passed on every merge.
  - Part A (checklist step 2) is done and verified on 2026-10-18. `main` now requires a pull request
    and both Windows checks, and blocks force-pushes and deletion.
  - Part B (step 7, the agent account) is done: set up 2026-10-18, verified 2026-10-19 by the
    checker session. Cloud agents now act as `ABlueAgent` (write access, no admin). `main` needs 1
    approval from a code owner (`ABlueAI`), approval of the latest push, and both Windows checks, so
    no agent PR merges without Blue's Approve. Local agents on Blue's PC still use his git login until
    S06 moves them (approved with PR #44; see docs/SETUP-GUARDRAILS.md, "What is still not covered").
  - The merge audit raised a false alert on 2026-10-18 (issue #35): PR #33 was stacked on #32's
    branch, and its commits reached `main` through PR #34. The audit now counts every commit of a PR
    merged into `main`, and AGENTS.md forbids stacked PRs. Fixed in PR #37, merged 2026-10-18;
    the audit passed on that merge and Blue closed #35 (checklist step 11, verified).
  - A second false alert on 2026-10-19 (issue #40): on PR #39, the first PR authored by
    `ABlueAgent`, GitHub's commit-to-PR lookup returned no PR for any of its commits, even 10 minutes
    after Blue approved and merged it. The audit now also finds a PR merged into `main` by its merge
    commit when that lookup comes back empty; everything else still alerts. A replay against GitHub's
    live data for the #39 push gives the three #40 alerts with the old audit and none with the fix.
    The fix merged as PR #41 (`8846eed`), the audit passed on that merge, and Blue closed #40
    (checklist step 12, verified 2026-10-19).
  - Independent review: Codex reviewed Blue's PRs automatically but not the agent's (#39 skipped,
    #41 only on request), its "All PRs" setting won't save, and, before the 2026-10-20 re-link, it ignored review
    requests from `ABlueAgent` (PR #42; they work now, see below). Blue chose a separate Claude
    Opus reviewer instead (checklist step 13). Builders run the read-only `pr-reviewer` subagent on
    their own PR and post "Independent review (Opus)" before marking it ready. Codex is optional.
  - Codex auto-review test (2026-10-20): **PASS**. Blue says he linked ChatGPT/Codex's GitHub to
    `ABlueAgent` on 2026-10-20. On PR #48, authored by `ABlueAgent`, Codex started a review 9 seconds
    after the PR opened, with no `@codex review` comment (its summary's "Review trigger" reads "PR
    opened"), and completed it on `cc58b93` at 15:16 UTC with no findings. The result is recorded
    here and in BLUE-CHECKLIST.md step 16 (added and ticked in PR #47). The Opus review stays the required one; Codex adds a second opinion.
  - Manual Codex requests from `ABlueAI` now fail: Blue's `@codex review` on PR #48 (16:13 UTC) got
    "To use Codex here, create a Codex account and connect to github" and no review. Likely cause, not
    verified: Codex's GitHub link moved to `ABlueAgent`, so `ABlueAI` is no longer a linked account.
    Automatic reviews on PR open still work. A manual request from `ABlueAgent` works: an agent's
    review request on PR #47 (03:43 UTC, 2026-10-21) got a Codex review of `1544d35` 3 minutes later,
    with no findings.
  - Scope of the re-link (checklist step 20, done 2026-10-21 on Blue's word): the ChatGPT/Codex
    installation on `ABlueAI` is set to "Only select repositories", with Blue's main few repositories
    selected, not only `AgentCommandCenter`; he adds new ones as they're created. What the link
    authorizes on `ABlueAgent` (step 20's second page) wasn't reported, and Blue asked to move on.
- **Daily runner:** scheduled for 8:01 AM Eastern from 2026-10-18 ([docs/RUNNER.md](docs/RUNNER.md)).
  The repository was attached on 2026-10-18 (step 7e), and its gate (steps 1 and 7) now passes, so
  the 2026-10-19 run started and opened PR #44, the first proof it can open PRs.
  Its prompt includes the `pr-reviewer` step since 2026-10-19 (applied after PR #42 merged), and
  the capped review loop since 2026-10-21 (PR #52's prompt, applied 21:19 UTC and read back the same
  day; checklist step 21). Proposed in PR #83 (pending Blue): every builder skips a plan session
  that already has an open PR titled with its ID (`Sxx:`) and opens its own PR early, so two
  builders don't start the same session (a runner fire still treats every open `ABlueAgent` PR as
  its own until S04's `runner` label); the runner prompt is applied after the merge (checklist
  step 26).
  It runs on Opus 5.5 since 2026-10-21, changed by an interactive session at Blue's request (read
  back from the scheduled task the same day; docs/RUNNER.md).
- **Review loop (adopted: PR #52 merged 2026-10-21, applied to the runner the same day):** every PR gets one complete first review ranked
  high, medium and low; high and medium findings are fixed in one batch, low ones go to Follow-ups;
  later runs check only the fixes; at most 5 runs, then "needs Blue" with questions for Blue; one
  scope per PR; no pushes after a PR is marked ready except for CI, a conflict or Blue asking
  (AGENTS.md "The review loop"). It applies to every PR; the runner's prompt carries it since
  2026-10-21 (checklist step 21). Why: PR #46 took 37 commits and 31 review runs, none with a high
  finding.

## 1.0: done

Quick Links · pane status (now works on current Claude Code) · P1 environment containment · H1
acceptance · fence stack and deterministic roles · Mako branding, taskbar identity and shortcut ·
daily-driver workday · Shift+Enter newline · real build label · Vibe Kanban removed · Windows CI ·
lost-work recovery · PC smoke test · Electron binary installed by `npm ci` · `v1.0.0` tag.

## 1.0: left

1. ~~Windows CI green on PR #27~~ Done: app tests and PowerShell tests (983 passed, 0 failed) pass on
   GitHub's Windows runner.
2. ~~On Blue's PC: recover the lost conversations; smoke test~~ Done 2026-10-18 (results below).
3. ~~Blue merges PR #27~~ Done 2026-10-17.
4. ~~Tag `v1.0.0`~~ Done 2026-10-18 at `37009eb`, after PR #33's fix reached `main` (PR #34).

Nothing is left for 1.0.

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
  downloads and checks the binary, and `npm test` now fails first if it is missing. On `main` since
  PR #34; it was verified on the PC with a clean `npm ci` at `37009eb`.
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

Token hygiene (PR #46, merged 2026-10-21): checklist step 17 has Blue audit old GitHub tokens on
both accounts and API keys with each provider, sets the rules for every new token, and has Blue turn
on push protection. Step 14's `ABlueAgent` token is now a classic `public_repo` token, because
GitHub doesn't support fine-grained tokens for an account that is only a collaborator on a personal
account's repository (found by Codex on PR #46; GitHub's docs not yet read directly, step 14). Step
14 is ticked when Blue says the token exists and is in Bitwarden and gives its expiry date. S06
decides how Mako stores and passes it.

1.1 session S01 (finish guardrails) is DONE: PR #44 merged 2026-10-19, with its evidence in the plan's change log. S02 (CI and dependency hygiene) is DONE (#45); S03 is next. The UI sessions (S14, S17 to S20) are on hold until Blue says go, and S16 becomes the Composer research (approved with the PR #48 merge). S06 also moves local agents off Blue's git login (plan change approved with that merge). See the plan.

Plan change proposed in PR #47 (pending Blue): S04 becomes an all-day runner with an evening digest
and needs only S01, so it can run right after S03; new session S26 adds Codex as a second builder
(Codex's GitHub is already linked to `ABlueAgent`: checklist step 16, done 2026-10-20). Also proposed
there: READY TO MERGE / NOT READY at the start of every session-end notice, documented pausing and a
usage alert (S04), a Pause button in Mako where it can be done safely (S11), and new session S28
agent profile refresh. S27 (Composer) from the same PR is dropped, because PR #48 folded the Composer
into S16. Today's runner prompt and schedule stay as they are until S04 is merged and applied; the
checklist-numbering, Codex-handle, READY TO MERGE and Codex-PR review rules apply from this PR's
merge, the STATUS.md and plan-row rule once S04 is merged and applied.
