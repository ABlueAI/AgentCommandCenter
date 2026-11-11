# Mako status

Updated 2026-11-05 by the all-day runner's status PR for 2026-11-05, for the one PR merged since
the 2026-11-04 status PR (#165): #166 (merge order). Before that, the 2026-11-04 status PR (#165)
covered #130 (S15), #146, #147, #140, #155 (S33), #152 (S31), #153, #157 (S34) and #154 (S32);
#158 to #160 merged just before it (2026-11-05 00:00 to 00:02 UTC).
Every PR that changes the state updates this file.

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
    S21 (logo) is IN PROGRESS: PR #133 (B2 shark, picked 2026-10-28) merged 2026-10-29; S21 is
    done once Blue checks the taskbar icon (checklist step 45).
- **GoHighLevel lead pipeline (plan change merged in PR #119 on 2026-10-24):** new S29 ranks
  every Florida marina from the official Google Places API (a new paid Google Cloud account, Blue's
  to confirm; checklist step 33), new S30 writes a personal email opener for each, and Blue sends
  them from HighLevel in approved batches of about 20; S24's read-only workflow becomes a reply/lead
  watcher (a separate scheduled task, 7:30 AM to 8:00 PM Eastern, notifying only on news; step 34
  first). Marina and lead data stay in the private repo `ABlueAI/mako-business`. S29 and S30 are
  `HOLD (Blue)` until he starts them; S29 also waits on step 33, and the watcher on step 34.
- **Runner work added (plan change merged in PR #147 on 2026-11-04):** after S15, nothing on the
  plan was `READY` for the runner, so a plan change adds S31 (PC-check fixes), S32 (1.1 gap audit),
  S33 (Plan sync guard) and S34 (PR reviewer research). All four merged on 2026-11-04: S31 (#152),
  S32 (#154), S33 (#155) and S34 (#157); PR #153 added the account guard the same day (Guardrails
  below). Blue moved step 17's token audit to the
  end of 1.1 (push protection is already on) and stays on Pro until the UI work runs usage up
  (docs/DECISIONS.md, 2026-11-03).
- **Claude plan:** Pro. Blue upgrades to Max 5x when the UI work runs usage up (his call on
  2026-11-03, docs/DECISIONS.md; checklist step 8, not ticked on `main` as of 2026-11-04). Until
  then, the runner builds one session at a time (`parallel_cap: 1`).
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
- **Quick Links bundle (S12, PR #86 merged 2026-10-22, in progress):** Quick Links' editor gets "+ Add Mako
  bundle", which adds seven links (Claude desktop, Codex app, Mako PRs, Project board, Obsidian
  vault, Hermes docs, Dodaios docs) without touching existing ones. The URL policy now also accepts
  exactly three app links (`claude://claude.ai/new`, `codex://threads/new`, `obsidian://open`) and
  nothing else outside http(s). Blue checks the links on his PC and confirms whether his existing
  "Starboard Platform" link is his Hexona login (checklist step 29).
- **Plan to issues (S03, PR #54 merged 2026-10-21, in progress):** a workflow keeps one `Sxx: <title>` issue per plan
  session, with status, authority, lane and sensitive labels and the "1.1 Month 1" milestone, in step
  with docs/PLAN-1.1.md on `main`. The Project board joins once Blue connects it (checklist step 25).
  Blue connected it on 2026-11-02, but the first run (41501308744) crashed on a workflow bug
  (`getOctokit is not defined`), and every hourly run until 2026-11-04 failed before the issue sync too. The
  fix, PR #146 (merged 2026-11-04 07:08 UTC), builds the board client from github-script's own
  Octokit class; every Plan sync run since has passed (run 41790199214 first). Step 25 is still
  unticked: its re-run checks the board on GitHub. S33 (PR #155, merged 2026-11-04, DONE) makes the
  sync refuse and create nothing when its listing misses every existing sync issue, the cause of the
  2026-10-22 duplicates; a listing that misses only some of them is issue #156.
- **Research capture (S15, PR #130 merged 2026-11-04, in progress):** Blue's verdict (2026-11-03): ADOPT
  Playwright MCP as the page reader. Claude in Chrome was rejected: on his PC it returned "This site
  is blocked." on reddit.com, while Playwright MCP read a www.reddit.com thread with no login
  (checklist step 43, ticked). The build in PR #130: a "📄 Page" choice in New Agent that takes a
  URL, a fenced `page-reader` pane allowed only to navigate, snapshot and write its own report, and
  the Reviewer reading that report (docs/decisions/OSS-research-capture.md); step 48 checks it on
  his PC, and S15 is done once it passes.
- **Obsidian Skills (S13, PR #115 merged 2026-10-23, in progress):** `scripts/new-mako-vault.ps1` creates Blue's
  private vault outside this repo, with `Mako index.md` (links to STATUS, PLAN, DECISIONS and the
  checklist on GitHub) an `AGENTS.md` and a `CLAUDE.md`; the kepano/obsidian-skills plugin is to be installed in
  Claude Code from the vault (ADOPT recorded in docs/decisions/OSS-obsidian-skills.md). Blue sets it up
  on his PC (checklist step 31). Only local agents can reach the vault.
- **Marina research brief (S22, PR #116 merged 2026-10-23, in progress):** the brief is in Blue's private repo
  `ABlueAI/Mako-Business` (PR 1 there, commit `24ddc8e`; checklist step 32 ticked). The cloud session
  couldn't open web pages, so its facts come from search extracts of public pages and need a check
  on each source before outreach. No marina data is in this repo.
- **Client paperwork drafts (S23, PR #122 merged 2026-10-28, done):** an intake questionnaire laid out for a
  Hexona form, a scope-of-work template, a services agreement and its Care plan schedule, in Blue's
  private repo `ABlueAI/Mako-Business` (PR 2 there). Blue's answers of 2026-10-28 are applied
  (checklist step 37): scope first with one fixed fee, one Care plan, no hour blocks or hourly rate
  shown. Blue approved the revised drafts by merging PR #122 on 2026-10-28 (the row's "Done
  when"); amounts, the legal name, an attorney's and an
  accountant's review and the Hexona form are step 46. No client data or prices are in this repo.
- **Codex builder lane (S26, PR #114 merged 2026-10-23, needs Blue):** docs/CODEX-BUILDER-LANE.md
  records what is known (Codex's PRs are opened as `ABlueAgent`; its reviews can't approve) and
  proposes the lane: hand-off on a locked `agent-claimed` issue, Codex fixes its own PRs, Blue
  checks the "Run by:" link of the Opus review before approving a Codex PR. The trial ran as PR
  #140 (issue #139), merged 2026-11-04. Whether it meets S26's "Done when", and step 30's records
  of what Codex did, are still to be checked (docs/1.1-GAP-AUDIT.md, A4).
- **Stable and dev copies (S07, PR #123 merged 2026-10-24, in progress):** `npm run start:dev` starts a dev copy of
  Mako with its own settings folder (`%APPDATA%\command-center-dev`), its own taskbar button and a
  `Mako (dev)` title, and it never installs or changes Claude Code hooks. The stable copy is
  unchanged. How to run it and what the two still share: [docs/DEV-INSTANCE.md](docs/DEV-INSTANCE.md).
  Blue checks both side by side on his PC (checklist step 38).
- **Session memory 1 (S08, PR #124 merged 2026-10-27, in progress):** every Claude pane Mako starts gets a session ID
  that Mako picks and passes with `--session-id`, and `session-memory.json` in Mako's settings folder
  records it with the pane's role, worktree and start and stop times; the records survive a restart.
  Nothing is resumed yet (that's S09). How it works: [docs/SESSION-MEMORY.md](docs/SESSION-MEMORY.md).
  Blue checks it on his PC (checklist step 39).
- **Session memory 2 (S09, PR #131 merged 2026-10-27, in progress):** when Mako opens after closing (or stopping
  unexpectedly) with Claude panes open, the Terminals tab offers **Resume** (the same role in the
  same folder, with `claude --resume <id>`) or **Start fresh** for each one. Main checks every
  Resume against its own records; fenced roles are never resumed. Claude Code deletes transcripts
  after `cleanupPeriodDays` (30 days by default). Details: [docs/SESSION-MEMORY.md](docs/SESSION-MEMORY.md).
  Blue checks it on his PC (checklist step 44).
- **Process cleanup and link hardening (S06, PR #121 merged 2026-10-23, in progress):** closing a
  pane or Mako ends its whole process tree, the old `open-external` handler goes through the Quick
  Links URL policy, and Mako can store the `ABlueAgent` token in its key setup (safeStorage) and
  give it only to unfenced agent panes once Blue saves it there. Blue checks it on his PC (checklist
  step 35).
- **One-click authority (S10, PR #125 merged 2026-10-24, in progress):** the terminal toolbar's
  **Authority** selector starts new Claude panes at Minimum (`plan`), Medium (`acceptEdits`, the
  default) or High (`auto`); Maximum opens claude.ai/code instead of a local pane. Mako never
  launches `bypassPermissions`. Details: [docs/AUTHORITY-LEVELS.md](docs/AUTHORITY-LEVELS.md). Blue
  checks it on his PC (checklist step 40); whether Mako's flag wins over a role file's
  `permissionMode: default` isn't verified yet.
- **Usage panel (S11, PR #126 merged 2026-10-24, in progress):** Mako's top bar shows the 5-hour
  and weekly usage with reset countdowns, read from Claude Code's status line data once Blue sets
  the `statusLine` line; it turns red at 90% and **Pause runner** opens claude.ai/code/routines.
  Details: [docs/USAGE-PANEL.md](docs/USAGE-PANEL.md). Blue checks it on his PC (checklist step 41).
- **Logo (S21, PR #133 merged 2026-10-29, in progress):** the app icon stays the Mako shark, with its white centre "M"
  drawn bolder and the fins tapered to their original tips (B2a: Blue picked B2 on 2026-10-28 and
  its redraw B2a on 2026-10-29; PR #127's new "M" icon was rejected and closed). PR #133 regenerated
  `app/assets/mako.ico` with `scripts/logo/render-shark-b2.py` and gave the top bar's
  `mako-mark.svg` the same bolder M. Blue checks the taskbar on his PC
  (checklist step 45).
- **PC-check fixes (S31, PR #152 merged 2026-11-04, in progress):** fixes for what Blue's PC checks
  of 2026-10-29 to 2026-11-02 found: each authority level passes its own allowed-tools list (the
  env scrub forces default mode); the pane-status variable is renamed so the scrub no longer drops
  it; Ctrl+V pastes once; the token box strips invisible characters and says why it refuses;
  routine lines show as "[main]"; agent panes' `git config` says ABlueAgent; read-aloud keeps its
  selection after a speed change. S31 is done once Blue's re-runs of checklist steps 23, 24 and 40
  pass on his PC (step 38 gains a commit-author check).
- **1.1 gap audit (S32, PR #154 merged 2026-11-04, done):** [docs/1.1-GAP-AUDIT.md](docs/1.1-GAP-AUDIT.md)
  checks every month-one row, every merged 1.1 PR and every unticked step; 11 items need attention
  (A1 to A11), each with a proposed fix. PRs #158, #159 and #160 (merged 2026-11-05 UTC) took A3 and A6 to A9.
- **PR reviewer research (S34, PR #157 merged 2026-11-04, in progress):**
  [docs/decisions/OSS-pr-review.md](docs/decisions/OSS-pr-review.md) compares qodo-ai/pr-agent,
  claude-code-action, Anthropic's `code-review` and `pr-review-toolkit` plugins, Kodus and Mako's
  own loop, each with a proposed verdict. Blue's verdict, word for word, is checklist step 22; any
  reviewer change comes in a later PR.
- **All-day runner (S04, PR #84 merged 2026-10-23, partly applied):** the hourly runner
  (`trig_01LPKxs49xvwN7mcuGLGwyN8`, :07 Eastern, no push) is on and fired at 07:09 UTC. As read
  on 2026-10-23 at about 07:40 UTC, the evening digest (`trig_0166nBynncK2BWPaarALAq8q`) is off,
  the old daily runner is still on with the new prompt, and both new tasks have connectors the plan
  didn't call for (the digest has the GoHighLevel CRM). Blue's clicks are in checklist step 27;
  steps 27 and 28 aren't ticked. The S04 follow-up fixed the prompts' open follow-ups and
  recorded this read-back (PR #117, merged 2026-10-24; docs/RUNNER.md "Applied so far").
- **Guardrails:**
  - The repo-side files are live on `main`, and the merge audit has passed on every merge.
  - Part A (checklist step 2) is done and verified on 2026-10-18. `main` now requires a pull request
    and both Windows checks, and blocks force-pushes and deletion.
  - Part B (step 7, the agent account) is done: set up 2026-10-18, verified 2026-10-19 by the
    checker session. Cloud agents now act as `ABlueAgent` (write access, no admin). `main` needs 1
    approval from a code owner (`ABlueAI`), approval of the latest push, and both Windows checks, so
    no agent PR merges without Blue's Approve. Local agents on Blue's PC still use his git login until
    he saves the `ABlueAgent` token in Mako (S06, PR #121, merged 2026-10-23) and checklist step 35 passes;
    until then they only verify and don't open PRs (docs/SETUP-GUARDRAILS.md, "What is still not
    covered"). The token exists (checklist step 14, ticked 2026-10-23 on Blue's word; expires
    2027-01-21, renew by 2027-01-14).
  - No PR work under Blue's own login (decided 2026-11-04, PR #153): PRs #142 and #144, opened from Claude desktop chats as `ABlueAI`, couldn't be
    approved and were re-opened as #146 and #147. Desktop chats now only plan and talk (AGENTS.md
    "No PR work under ABlueAI's login"), and the `PreToolUse` hook `.claude/hooks/account-guard.js`
    blocks `gh pr create`, `gh pr ready` and `git push` only when `gh` is logged in as `ABlueAI`.
    Blue removes that login from every PC Claude runs on after step 35 (checklist step 49).
  - Agent identity (PR #171, a plan change; Blue's decisions of 2026-11-10 and 2026-11-11): the GitHub App
    `mako-agents[bot]` becomes the primary agent identity for local panes and the local runner, `ABlueAgent`
    stays for cloud sessions, and agents never approve or merge. The merge audit and the runner and
    digest prompts read one list of agent logins (`.github/scripts/agent-logins.js`, `agent_logins` in
    docs/RUNNER.md); the audit alerts when an agent approved a PR that `ABlueAI` authored (the PR #133 pattern,
    issue #137); `.claude/settings.json` and the account guard block review and merge calls, and the guard
    does so under any login. The `agent-running` label is gone from the runner design. The live scheduled
    tasks keep their older prompt text until a checklist step applies the new prompts (docs/RUNNER.md).
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
- **Old daily runner (replaced by S04):** "Mako daily runner" is set to fire once a day at 8:01 AM Eastern
  from 2026-10-18; its 2026-10-19 run opened the first runner PR, #44. It ran with the
  `pr-reviewer` step, then PR #52's capped review loop, on Opus 5.5. PR #83's claim-check prompt
  (step 26, now dropped) was never applied to it: since 05:48 UTC on 2026-10-23 it runs PR #84's
  runner prompt ([docs/RUNNER.md](docs/RUNNER.md) "Applied so far"). S04's hourly all-day runner
  replaces it (S04 bullet above). Turning it off is part of checklist step 27; as read on
  2026-10-23 it was still on, and no read since is recorded.
- **Review loop (adopted: PR #52 merged 2026-10-21, applied to the runner the same day):** every PR gets one complete first review ranked
  high, medium and low; high and medium findings are fixed in one batch, low ones go to Follow-ups;
  later runs check only the fixes; at most 5 runs, then "needs Blue" with questions for Blue; one
  scope per PR; no pushes after a PR is marked ready except for CI, a conflict or Blue asking
  (AGENTS.md "The review loop"). It applies to every PR; the runner's prompt carries it since
  2026-10-21 (checklist step 21). Why: PR #46 took 37 commits and 31 review runs, none with a high
  finding.
- **Merge order (PR #166, merged 2026-11-05 00:51 UTC; adopted):** a PR is marked ready only when
  it test-merges cleanly with `main` plus every other ready PR; otherwise it stays a draft labelled
  `waits-for-merge` until its blocker merges, and every summary listing several PRs ends with a
  "Merge order:" line (AGENTS.md "Merge order"). Why: on 2026-11-04 PRs #145, #154, #157 and #165
  each conflicted after another merged, and each fix push dismissed Blue's approval. The runner and
  digest follow it once their prompts are applied (checklist step 50, not ticked on `main` as of
  2026-11-05).
- **Licence notices (found 2026-11-07, fixed by PR #168):** a GPT planning review flagged, and
  Claude checked, that the read-aloud bundle `app/renderer/vendor/kokoro.web.js` (in the repo
  since `d2b2eea`, PR #19) contains the eSpeak NG speech engine and its data, which are
  GPL-3.0-or-later, while npm declares the bundle's packages Apache-2.0 only; the repo had no
  third-party notices, and the vendored xterm.js files lacked their MIT notice. PR #168 adds
  [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md) (every vendored file with its upstream, version,
  licence, copyright and pinned source; the bundle's components one by one), the licence texts in
  `LICENSES/`, a README pointer and a test that fails if a tracked vendor file has no row. No
  vendored code changed, so voice needs no new PC check. This is notice compliance, not legal
  advice. Replacing the GPL phonemizer, a licence check in review or CI, and installer notices are
  separate follow-ups.

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
14 was ticked on 2026-10-23 on Blue's word (PR #118; see Guardrails above). S06 (PR #121) stores
it in Mako's key setup (safeStorage) and gives it only to unfenced agent panes.

Month one's runner sessions S31 to S34 merged on 2026-11-04. The next `READY` row is S25, the
month review, from 2026-11-14 (S24 is `READY` but held as draft PR #134 by Blue's choice of
2026-11-03). The UI sessions (S14, S17 to S20) wait for Blue's go (checklist step 18), and S29 and
S30 wait for Blue to start them. Most other sessions are merged and wait on a check on Blue's PC
(BLUE-CHECKLIST.md "Do next"). The 1.1 gap audit ([docs/1.1-GAP-AUDIT.md](docs/1.1-GAP-AUDIT.md))
lists what is still open; A1, A2, A4 and A5 (d) need Blue. See the plan.

Plan change merged in PR #47 (2026-10-21): S04 becomes an all-day runner with an evening digest
and needs only S01, so it can run right after S03; new session S26 adds Codex as a second builder
(Codex's GitHub is already linked to `ABlueAgent`: checklist step 16, done 2026-10-20). Also in
it: READY TO MERGE / NOT READY at the start of every session-end notice, documented pausing and a
usage alert (S04), a Pause button in Mako where it can be done safely (S11), and new session S28
agent profile refresh. S27 (Composer) from the same PR is dropped, because PR #48 folded the Composer
into S16. S04 merged as PR #84 and is partly applied (see the S04 bullet above); the
checklist-numbering, Codex-handle, READY TO MERGE and Codex-PR review rules apply from this PR's
merge, the STATUS.md and plan-row rule once S04 is merged and applied.
