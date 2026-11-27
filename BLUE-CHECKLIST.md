# Blue's checklist

Everything Blue needs to do, in order, with when and how long. Agents keep it current: every action for
Blue goes here instead of living only in a chat message. Agents tick a box only when they have verified
it, adding the date and how they checked. Blue can tick boxes himself, or tell any agent "step N done".

Permanent link: https://github.com/ABlueAI/AgentCommandCenter/blob/main/BLUE-CHECKLIST.md

Last updated 2026-11-24 by Claude (S14, PR #253: step 18 ticked with your go on the UI, step 77
added to read the brief's questions); earlier, on 2026-11-23, by Claude (S53's AgentPlayback verdict recorded and step 67 ticked, PR
#208); earlier, on 2026-11-23 (S37, PR #218: step 69 added, a 3-minute live check of the
account guard on the PowerShell tool); earlier, on 2026-11-21 (your decisions of 2026-11-16 to 2026-11-21, PR #212: steps 27
and 50 leave the top of "Do next", steps 57, 60 and 63 follow your answers, step 68 added, dated
reminders added; earlier, on 2026-11-18, your answers to PR #195's questions, PR #204: step 65 added,
S48 split; earlier, on 2026-11-17, your answers to PR #173's questions, PR #195: step 64 added,
step 18 waits on the schedule; earlier, on 2026-11-16, the Mako 1.1 decision sheet, PR #173: step 28 ticked, step 10
dropped, steps 8 and 17 re-timed, steps 54 to 63 added (62 ticked) and "Do next" re-ordered; earlier, on
2026-11-05: step 50 added and steps 28 and 27 moved to the top of "Do next",
for the merge-order rule, PR #166; earlier, on 2026-11-04: step 26 marked dropped, "Do next" items 6 and 7 updated now that PRs #84 and
#119 are merged, a question on step 10 added as item 8, and the "About 2026-11-17" reminder's Max date
fixed, from the 1.1 gap audit's A7 and A8, PR #160; earlier the same day: step 49 added from "Coming up this month", the `ABlueAI`
command-line login's removal, with steps 35 and 49 near the top of "Do next", PR #153; step 37 ticked and step 46 added for S23's paperwork, PR #122;
step 44 added for S09 session resume, PR #131; step 43 added and ticked and step 48 added for S15, PR #130; steps 33, 34 and 36 added for the GoHighLevel lead pipeline,
S29 and S24, PR #119, proposed; step 35 added for S06, PR #121; step 30 added for the S26 Codex trial, PR #114; step 14 ticked on Blue's word and its token renewal reminder added under "Dated reminders", PR #118; step 31 added for the S13 Obsidian vault, PR #115; step 29 added for the S12 Quick Links bundle, PR #86; step 21
ticked and step 26 added for the runner's claim check, PR #83; step 19 ticked with Blue's Composer verdict, PR #82; step 21 added: apply the capped review loop to the runner, PR #52;
step 25 added for the S03 plan board, PR #54; "Do next" order added, step 20 ticked, step 22 added, PR #53;
S05 checks added as steps 23 and 24, PR #49; step 6 dropped by Blue, PR #51; step 17 moved after
step 16; PR #46's token rules approved with its merge). Earlier: step 17 added and step 14's token
changed to classic `public_repo` (PR #46); step 8 moved to 2026-10-28 and steps 18 to 20 added (PR
#48); step 16 added and ticked, with the 2026-10-21 Codex agent-request result (PR #47).

## Open for Blue, by when

Updated 2026-11-26 by Claude (checklist cleanup, PR #303): step 77 ticked, steps 30, 59 and 72
struck as superseded, steps 22 and 27 handed to agents (your part of each is done), each with its
evidence in the step. Later the same day (issue #304): step 27 ticked against the routine read-back
recorded in docs/RUNNER.md, and step 81 (from PR #283) added. This is everything still open for you on `main`, grouped by when. Each
link goes to the section that holds the step. Under D-090 (your words, 2026-11-25; on `main` since
PR #301 merged on 2026-11-26) agents decide procedural PR questions themselves, such as "one more
push" or "one more review run", so those are not listed here.

**At every merge sitting (no step number; they recur):**

- Before you approve a Codex PR (a `codex/` branch), open its "Independent review (Opus)" comment's
  "Run by:" link and check it is a Claude session that reviewed that PR: the line alone can be
  forged (AGENTS.md "How work flows" step 3; docs/CODEX-BUILDER-LANE.md item 5).
- When an agent opens an `agent-claimed` claim issue to hand work to Codex, lock it (right sidebar >
  **Lock conversation**), since agents can't (docs/CODEX-BUILDER-LANE.md item 4).

**At your desk, this week (about 25 minutes in all):**

- [Step 8](#before-the-daily-runner-starts-building): if Claude Max is on, tell any agent "step 8
  done" (5 seconds). *Not verified: the hand-off for this PR says you said "Max is on" on
  2026-11-23, but no record on `main` or GitHub quotes it, so it isn't ticked.*
- [Step 50](#before-the-daily-runner-starts-building): tell any Claude session "apply the digest
  prompt from docs/RUNNER.md" (2 minutes). The digest's stored prompt is older than `main`'s (read
  back 2026-11-26); the runner's stored prompt is recorded in docs/RUNNER.md and reads `main`'s
  runner prompt every fire.
- [Step 70](#from-s37-the-account-guard-and-the-powershell-tool): the PR sweeper's push trigger and
  phone notifications (5 minutes), or tell any agent "set up the sweeper's trigger and
  notifications".
- [Step 65](#from-the-mako-11-decision-sheet-2026-11-16): Dependabot alerts and security updates on
  (3 minutes; your words, 2026-11-18: "now").
- [Step 78](#from-s38-the-full-security-check): two security decisions from S38, with the private
  report open (10 minutes).
- [Step 61](#from-the-mako-11-decision-sheet-2026-11-16): tell a local agent on your PC "do step 61"
  (2 minutes; you approved the delete on 2026-11-16).

**On a date:**

- [Step 58](#from-the-mako-11-decision-sheet-2026-11-16), **by Friday 2026-11-27**: the
  lessons-learned draft, when the agent sends it (15 minutes). If it isn't done, the tune-up runs
  from the draft as it is (your decision, 2026-11-22).
- [Step 60](#from-the-mako-11-decision-sheet-2026-11-16), **overdue** (it was set for 2026-11-24):
  the Composer prototype day. No scores are recorded; give an agent your scores, or a new date.
- [Step 63](#from-the-mako-11-decision-sheet-2026-11-16), **Monday 2026-11-30**: the Codex check-in
  (5 minutes).
- [Step 85](#from-your-open-source-verdicts-2026-11-25), **any day after S68 (PR #300) merges**: start
  the claude-security trial scan (an afternoon, you at the start and the end).

**PC-check evenings** (Tuesdays and Fridays; next: Friday 2026-11-27, then Tuesday 2026-12-01):

- [Step 15](#any-time-not-blocking), the voice check on Electron 42.11.16 (10 minutes).
- [Step 69](#from-s37-the-account-guard-and-the-powershell-tool) (3 minutes), then
  [step 35](#any-time-not-blocking) (15 minutes), then [step 49](#any-time-not-blocking) (5 minutes
  per PC), in that order.
- [Steps 23 and 24](#any-time-not-blocking) (24 is optional), [29](#any-time-not-blocking),
  [31](#any-time-not-blocking) (its plugin bullet waits for your word on PR #300),
  [38, 39, 40, 41, 44, 45 and 48](#any-time-not-blocking),
  [74 and 76](#any-time-not-blocking): the older PC checks, each a few minutes.
- [Step 57](#from-the-mako-11-decision-sheet-2026-11-16) (10 minutes),
  [step 73](#video-scout-s54) (20 minutes; PR #230 merged 2026-11-26),
  [step 75](#from-s58-fenced-web-reading-agents) (3 minutes) and
  [step 79](#from-s38-the-full-security-check) (10 minutes, with the S38 private report).
- [Step 81](#from-s66-the-shared-navigation), the three-tab shell (10 minutes; PR #283 merged
  2026-11-26).

**At H1:**

- [Step 54](#from-the-mako-11-decision-sheet-2026-11-16), the H1 setup day (1.5 to 3 hours; it
  includes step 25's tick). No record shows it done.
- [Step 80](#from-the-h1-commander-pr-282), the commander, once S67's PR (#289) merges.
- [Step 55](#from-the-mako-11-decision-sheet-2026-11-16) when S20's PR asks, and
  [step 56](#from-the-mako-11-decision-sheet-2026-11-16) when S48's PR asks.

**Business, spending and credentials, when you start that work:**

- [Step 33](#any-time-not-blocking) before S29, [step 36](#any-time-not-blocking) before S30,
  [step 34](#any-time-not-blocking) when S24's watcher is ready, and
  [step 46](#any-time-not-blocking) before your first client.
- [Step 17](#any-time-not-blocking), the token audit: the last step before the 1.1 release (target
  2027-01-15). The agent token's renewal is due by 2027-01-14 ([Dated reminders](#dated-reminders)).

**Inputs only you can hand over (no step number; their plan rows wait on them):**

- **The Composer v1 scope sign-off** (S51, `NEEDS BLUE (scope pending sign-off)` in
  docs/PLAN-1.1.md; "Do next" item 7). The scope is being written in your separate Composer chat;
  once you sign it, the spec goes into the repo and a plan change splits S51 into build sessions.
  S71 (the elephant-goldfish trial) also waits on that spec. The 1.1 scope freezes on 2026-12-01.
- **The Composer scout report** (S49, `NEEDS BLUE (scout report)`): it is in your vault, so hand it
  to the session that runs S49's independent audit, in that session, never on GitHub.
- **The agent-roles package and brief** from your agent-roles chat: S28's package
  ([Waiting on you](#waiting-on-you-the-runner-wont-ask): an issue you open as `ABlueAI`, or a
  hand-off to an agent in its own session), and S60's brief from the same chat.

**Open, but agents' work, not yours:** [step 22](#any-time-not-blocking) (your verdict is already
on your signed 2026-11-16 sheet; an agent copies it into the OSS record), and, since PR #301 (D-090)
merged on 2026-11-26, [step 71](#waiting-on-you-the-runner-wont-ask) (the UI-library OSS verdict)
and step 84 (S47's Symvibe verdicts, in PR #287, not yet on `main`): the agent records the
recommended verdict, marked 🤖, and your merge approves it. Give a verdict yourself only if you
want a different one.

## Do next, in this order

*2026-11-26: "Open for Blue, by when" above is the current list. Where this older order differs,
the index wins; this order is kept as history.*

Your words (2026-10-21): "we will walk through this. place it where you prioritize it in relation to
other remaining items." Claude's order for what is left:

Re-ordered on 2026-11-16 from your signed Mako 1.1 decision sheet (docs/DECISIONS.md, 2026-11-16).
On 2026-11-21 steps 27 and 50 left the top (your decision: the runner they check has been off since
2026-11-04) and step 60 moved up for its dates (docs/DECISIONS.md, 2026-11-21).

**New on 2026-11-24 (PR #282, your decisions D-084 to D-086):** build work no longer waits for
your go (only spending, new accounts, credentials, deleting things, taste calls, sensitive work the
task didn't cover and blockers after 3 tries still come to you, with a default; AGENTS.md
"Deciding without asking"); **step 80**, setting up the commander on H1, once S67's PR is merged: it is what
starts the build sessions and sends you the merge order each evening.

1. **Step 60**, the Composer practice test on **2026-11-22**, then prototype day on **2026-11-23**
   (3 to 5 real tasks). Either may slip a day if Claude Max isn't active yet.
2. **Step 59**, re-link Codex reviews to `ABlueAgent` (about 5 minutes; your yes, 2026-11-16), and
   **step 65**, Dependabot alerts and security updates on (about 3 minutes; your words, 2026-11-18).
   **Step 63** on 2026-11-30: the Codex check-in, the first of the weekly checks. **Step 68**,
   your verdict on PR #209's OSS record for S48, is done (2026-11-24); merge PR #209 to adopt it.
3. **Step 54**, the H1 setup day (1.5 to 3 hours). H1 is the PC Mako is to run on unattended. It
   takes in the step 43 re-run and the step 25 tick, and S44 and S48 (the vault memory and its
   nightly tidy) wait on it; S48 no longer waits on the schedule (2026-11-18).
4. **Step 15**, the voice check on the new Electron. S36 moves Electron to 42.11.16, so if that has
   merged, check on that version.
5. **Step 35, then step 49**, after PR #170 (the account fix follows it): the agent token in Mako,
   then removing the `ABlueAI` command-line login from every PC Claude runs on. If PR #218 is
   merged by then, do step 69 (3 minutes) before step 49.
6. **Step 56**, memory setup (about 45 minutes over 2 days), when S48's PR asks for it, and
   **step 55**, H1 trial part 2, the aquarium (15 to 20 minutes), when S20's PR asks for it.
7. Your Composer scope sign-off unblocks S51.
8. **Step 57** (the "Mako" Firefox profile's preset URLs, 10 minutes), **step 58** (the lessons-learned
   draft, 15 minutes; by 2026-11-27, before it if the work runs ahead) and **step 61** (an agent deletes the StarNet clone, a leftover local copy on
   your PC, and the OpenCode leftovers; you say when).
9. **PC checks**, batched on Tuesday and Friday evenings until H1 automates them: steps 23, 24
   (optional, kept), 29, 31, 38, 39, 40, 41, 44, 45 and 48.
10. ~~**Step 64**, hand over the 1.1 schedule~~ Done (PR #223). ~~**Step 18**, your go on the UI~~
    Done 2026-11-24 (PR #253). Next: **step 77**, read the S14 brief's questions and merge PR #253,
    which releases S66, then S18, S19 and S20.
11. **Step 8**, the Max upgrade: pushed back "until 11/19 or until usage begins flowing" (your
    words, 2026-11-15).
12. **Step 33**, Google Cloud billing for S29, then start S29; **step 36** before S30; **step 34**
    when S24 is ready for its watcher.
13. **Step 17**, the token audit: inside 1.1, as the last step before release (S59). The agent
    token's renewal (by 2027-01-14) may come first.
14. **Steps 27 and 50**, in one sitting (about 12 minutes), only when you turn the all-day runner
    back on: it has been off since 2026-11-04. Step 28 is closed (usage credits are off, your word of
    2026-11-04). Since 2026-11-23 no PR but the PR sweeper's status PR edits STATUS.md (AGENTS.md
    "The shared brain", docs/SWEEPER.md Job D).
15. ~~**Step 14**, the agent token~~ Done 2026-10-23 on your word. ~~**Step 10**, the app settings
    review~~ Dropped 2026-11-16: the new Settings page replaces it.

## Today

- [x] **1. Merge PR #27.** About 2 minutes. *Verified 2026-10-17: merged by ABlueAI at 22:35 UTC as
  merge commit `4d60c9e`; the merge audit passed.*
  - Open https://github.com/ABlueAI/AgentCommandCenter/pull/27, read the TLDR at the top, then click
    **Merge pull request** and **Confirm merge**.
  - You decided that green CI plus your read of the TLDR is enough review for this PR. Codex reviews
    every PR after it (step 2e).
  - *Done when:* the PR shows "Merged". Claude checks.
- [x] **2. Guardrails, Part A.** About 10 minutes, right after step 1. *Blue: "part A is done"
  (2026-10-18). Verified 2026-10-18 through GitHub's public API:*
  - *Auto-merge is off.*
  - *The ruleset on `main` is active with deletion protection, force-push blocking, a required pull
    request (0 approvals for now), and both Windows checks required.*
  - *Steps b, d, f and g are account settings Claude can't read, so they rest on Blue's word.*
  - *Step e is verified: Codex reviewed PR #30 automatically when it was opened (15:52 UTC).*
  - **a. Auto-merge off.** *Already off (Blue, 2026-10-18).* Nothing to do.
  - **b. Read-only Actions.** Settings > Actions > General > Workflow permissions: check that **Read
    repository contents and packages permissions** is selected and **Allow GitHub Actions to create
    and approve pull requests** is unchecked. Both are GitHub's defaults for new repositories, so they
    may already be set; if you change anything, click **Save**. This is separate from auto-merge: it
    stops a workflow file, which an agent could add in a PR, from approving pull requests.
  - **c. Protect main.** Settings > Rules > Rulesets > **New ruleset** > **New branch ruleset**:
    - Name `protect-main`, Enforcement **Active**, Bypass list **empty**.
    - Target branches > Add target > **Include default branch**.
    - Check: **Restrict deletions**; **Require a pull request before merging** (required approvals
      **0** for now); **Require status checks to pass**, then **Add checks** and pick **App tests
      (Windows)** and **PowerShell tests (Windows)**; **Block force pushes**.
    - Click **Create**.
  - **d. Phone alerts.** GitHub mobile app > Settings > Notifications: on for **Pull requests** and
    **Reviews requested**.
  - **e. Codex reviews.** chatgpt.com/codex > Settings > connect GitHub if asked > **Code review**:
    enable it for `ABlueAI/AgentCommandCenter` and turn on **Automatic reviews**. If your Plus plan
    doesn't show automatic reviews, tell Claude.
    - When GitHub asks which repositories, choose **Only select repositories** and pick
      `AgentCommandCenter`, not **All repositories**. "All" would automatically open every future
      repo to it, including the private business repo planned for client work. Adding a repo later
      takes about 30 seconds (github.com > Settings > Applications > the app > **Configure**), and
      agents put that on this checklist whenever a new repo needs it.
  - **f. Account security.** github.com > Settings > Password and authentication: make sure
    two-factor authentication is on, and add a passkey if you don't have one.
  - **g. ChatGPT computer use off.** ChatGPT desktop app > Settings > Computer use: turn off **Any
    App**, and **Microsoft Excel** unless you use ChatGPT inside Excel. Don't install the Chrome or
    Edge extensions, and keep **Always-allowed apps** empty. Once allowed, it clicks and types in your
    apps as you, including a browser signed in to GitHub as `ABlueAI`, which would get around every
    guardrail on this list. Nothing in the plan uses it.
  - *Done when:* you say "Part A done". Claude confirms it on the next PR: GitHub lists the two
    Windows checks as **Required**, the PR shows as blocked until they pass, and a Codex review
    appears. (Claude never tests protection by pushing to main; that is forbidden even as a test.)
- [x] **3. Tell Claude your time zone.** 5 seconds. *Verified 2026-10-18: Blue said "i am EST". The
  scheduled task "Mako daily runner" was created for 8:01 AM America/New_York (Eastern, follows
  daylight saving), one minute after Claude's weekly usage reset, and recorded in docs/DECISIONS.md.
  First run 2026-10-18. Details: docs/RUNNER.md.*

## This week (hard deadline: about Nov 3)

- [x] **4. Finish 1.0 on your PC.** About 15 minutes of your attention; the agent does the rest.
  *Verified 2026-10-18 by the PC session:*
  - *Lost work: Blue confirmed the recovered reviewer conversations are the missing work. The builder
    task was dropped because Blue can't recall it.*
  - *Active hours: set (Blue's word, since Claude can't read that setting).*
  - *Smoke test: Blue answered each row; Claude confirmed that Mako was running from the shortcut at
    `ab5ce5a`.*
  - *Results are in STATUS.md through the close-out PR.*
  - Open Claude Desktop, or open a terminal in `D:\Workspace\agent-command-center` and run `claude`.
    Paste this:

    > In D:\Workspace\agent-command-center run `git switch main` and `git pull`. Then read
    > docs/handoff/FINISH-1.0.md, AGENTS.md, STATUS.md and docs/DECISIONS.md, and finish Mako 1.0 by
    > following the handoff in order. Work at High authority (auto mode). Ask me only where the
    > handoff says "Blue". Don't delete anything, and don't merge or tag without my explicit OK.

  - It recovers the lost October 4 and 5 reviewer and builder conversations. Claude Code deletes
    transcripts after 30 days, so do this before about **Nov 3**.
  - It will ask you three things:
    1. Is the recovered material the missing work?
    2. Set Windows Update **Active hours**, so updates stop restarting the PC mid-work.
    3. A **3-minute smoke test**: build label, Shift+Enter, colored status badges, and no Board tab.
  - *Done when:* that session updates STATUS.md with the results in a PR.
- [x] **5. Merge PR #33, then tag 1.0.** About 2 minutes, after step 4's smoke test passes.
  *Verified 2026-10-18:*
  - *PR #33 merged into the #32 branch, so its fix reached `main` through PR #34 (merged by
    ABlueAI).*
  - *On the PC, a clean `npm ci` at `37009eb` restored Electron, and Blue opened Mako from the
    shortcut showing `main@37009eb`.*
  - *Annotated tag `v1.0.0` was pushed at `37009eb`; `git ls-remote` shows it on GitHub. The GitHub
    release was created from it.*
  - The tag waits for PR #33, the Electron-binary fix (your decision, 2026-10-18). Merge PR #33 when
    its CI is green. PR #32 has to be merged first.
  - Then the PC session tags `v1.0.0` on that `main`. You already gave the OK in that decision.
  - *Done when:* tag `v1.0.0` exists on GitHub at a commit that includes PR #33. **Mako 1.0 is
    released.**
- **6. ~~Bring GPT up to date.~~ Dropped.** *Dropped 2026-10-21 by Blue: "drop step 6, its an
  automatic process now. no need" (docs/DECISIONS.md). Nothing to do; the number stays so no other
  step is renumbered. The 2026-10-17 GPT briefing (docs/handoff/GPT-BRIEFING-2026-10-17.md) is out
  of date: where it differs from docs/PLAN-1.1.md or docs/DECISIONS.md on `main`, those win.*

## Before the daily runner starts building

The runner is on since 2026-10-18 (8:01 AM Eastern). Each morning it first checks steps 1 and 7, and
does nothing except send you a "waiting on step N" notice until they are complete (once PR #47 merges,
it is expected to start with `NOT READY:`; not verified until S04's prompt). After that it runs
on its own, one session at a time on Pro until you upgrade (step 8).

- [x] **7. Guardrails, Part B: a separate GitHub account for agents.** About 15 minutes. *Done
  2026-10-18 with the guide session. Verified 2026-10-19 by the checker session, acting as the agent
  account:*
  - *GitHub `get_me` returns `ABlueAgent`, not `ABlueAI`.*
  - *7b: the collaborator list shows `ABlueAgent` with write access (`ABlueAI` is admin).*
  - *7d: GitHub's rules API for `main` (ruleset `protect-main`, id 25323429) shows 1 required
    approval, code owner review, dismiss stale approvals on push, approval of the most recent push,
    and both Windows checks still required. CODEOWNERS is `* @ABlueAI`.*
  - *7e: the guide session confirmed the repository is attached to **Mako daily runner** on
    2026-10-18. The checker's read of the task shows it enabled, schedule unchanged (8:01 AM
    Eastern), next run 2026-10-19 12:01 UTC, but that view doesn't list repositories. Tomorrow's run
    confirms it (see "Done when").*
  - *7a (2FA on the agent account) and 7c (Claude connected to `ABlueAgent`) rest on Blue's word and
    screenshots; Claude can't read either setting. 7c is borne out by `get_me` above.*
  - **a.** Create a free GitHub account, for example `ablueai-agent`, with its own email (a "+agent"
    alias of your email usually works). Turn on two-factor authentication.
  - **b.** Signed in as `ABlueAI`: repo > Settings > Collaborators > **Add people** > `ablueai-agent`.
    Repos on a personal account have no role picker; collaborators get write access, which is what
    we want. Then, signed in as the agent account, accept the invitation (from its email, or
    https://github.com/ABlueAI/AgentCommandCenter/invitations).
  - **c.** In a private browser window, sign in to GitHub as `ablueai-agent`, then open
    https://claude.ai/connect-github and connect. Claude's cloud sessions now act as the agent account;
    you keep using `ABlueAI` to approve and merge.
    - Sign in to claude.ai with your **own** Claude account in that private window. Don't make a new
      Claude account; only GitHub is signed in as the agent there.
    - The connectors page then shows a warning like "ABlueAgent: Not installed". That is expected:
      the agent account owns no repositories, so the app has nothing to install on.
    - If it offers to install the Claude GitHub app on `ABlueAgent`, cancel.
    - What matters is the green **Check repository status** line for `ABlueAI/AgentCommandCenter`.
  - **d.** Do this only after c, and after merging any open PR Claude made before c. GitHub never
    lets a PR's author approve their own PR, and until c Claude's PRs are authored as `ABlueAI`, so
    they would be stuck. Before you start, check that no Claude PR is open:
    https://github.com/ABlueAI/AgentCommandCenter/pulls should list none authored by `ABlueAI`
    (merge or close any that are). Settings > Rules > Rulesets > `protect-main` > Require a pull request:
    required approvals **1**; check **Dismiss stale pull request approvals when new commits are
    pushed**, **Require review from Code Owners**, and **Require approval of the most recent
    reviewable push**. Save.
    - From then on every agent PR shows **Review required**. You click **Approve** (Files changed >
      Review changes > Approve > Submit review), then **Merge**. That extra click is the protection.
  - **e. Give the runner the repository** (2 minutes, after c). Open https://claude.ai/code/routines,
    open **Mako daily runner**, add the repository `ABlueAI/AgentCommandCenter`, and save. Leave the
    schedule and prompt as they are. Without this the runner can check the gate but cannot open pull
    requests (seen on its first run, 2026-10-18). If the routine can't be edited, tell Claude and it
    will walk you through recreating it with the prompt in docs/RUNNER.md.
  - [x] **f. Run the checker session** (5 minutes, after a to e). *Verified 2026-10-19: the checker
    opened PR #39 as `ABlueAgent`; GitHub requested `ABlueAI` as code owner, and after both Windows
    checks passed (03:53 UTC) it still showed the PR as blocked, with no review yet. Your Approve
    and Merge of #39 is the last click.* Open https://claude.ai/code, select
    `ABlueAI/AgentCommandCenter`, paste the checker prompt Claude gave you, and let it run. It checks
    the items above as the agent account and opens one small PR. When that PR's CI is green, approve
    it (Files changed > Review changes > Approve > Submit review), then **Merge**.
  - *Done when:* you say "Part B done" and the checker's PR, authored by the agent account, showed as
    blocked after CI passed until you approved it. On the next morning's run the runner starts
    building S01 instead of sending "waiting on step 7".
- [ ] **8. Upgrade Claude to Max 5x.** About 2 minutes, **pushed back until 11/19 or until usage
  begins flowing** (your words, 2026-11-15, from the decision sheet; before that "when the UI work
  runs usage up", 2026-11-03; it was Wednesday 2026-10-28, moved from 2026-10-21 on 2026-10-20), after you have used your remaining Pro resets: in your words, "2 full
  resets & a weekly reset", plus 3 ChatGPT resets. claude.ai > Settings > Billing. Keep ChatGPT Plus.
  No longer blocks the runner; it builds one session at a time on Pro until then.
  - The 2026-10-21 date was picked to upgrade before Pro renews on Thursday. If Pro renews on
    Thursday 2026-10-22, it renews once more before the upgrade; Settings > Billing shows the renewal
    date and how an upgrade is charged.
  - *Done when:* you say so. After S04, the runner then allows 2 sessions in parallel, later 3 (one
    setting in docs/RUNNER.md).

- [x] **28. Confirm usage credits are off (S04).** *Closed 2026-11-16 on Blue's word of 2026-11-04
  that usage credits are off, as recorded on his signed decision sheet (docs/DECISIONS.md,
  2026-11-16). His own wording wasn't relayed and Claude can't read that page, so the sheet he
  signed is the only evidence. If credits are on, runs go into paid overage: say so and this is
  unticked.* 1 minute, before step 27. Open
  https://claude.ai/settings/usage and check that **Usage credits** are off. With them on, scheduled
  runs keep going past your usage limit on paid, metered overage; with them off, new runs are
  rejected until the usage window resets, which is what the all-day runner expects (docs/RUNNER.md,
  "Limits, from the official docs").
  - *Done when:* you tell any agent "usage credits are off". Claude can't read that page, so it
    records your word and the date here.
- [x] **27. Right after merging S04 (PR #84), have its runner applied.** *Done; ticked 2026-11-26
  against the read-back recorded in docs/RUNNER.md, "Read back 2026-11-26 (issue #304)"
  (`list_triggers`, read-only, about 04:30 and 07:15 UTC): **Mako all-day runner** is on, every hour
  at :07 Eastern, Opus 5.5, notifications off, no connectors, its fires succeed, and its PRs open as
  `ABlueAgent` (PR #300, S68, labelled `runner`); **Mako evening digest** is on, 8:03 PM Eastern,
  Opus 5.5, push on, no connectors; **Mako daily runner** is off (last fire 2026-11-04). So the
  "Left to do, as read on 2026-10-23" list below is done, apart from its last bullet (applying the
  prompts), which is step 50. The runner's stored prompt, a short wrapper set on 2026-11-24 that
  follows the runner prompt docs/RUNNER.md marks as current with its own overrides, is recorded
  there as read, so it is on `main`. The "prompt matching `main`" part of this step's done-when
  has been step 50's since PR #166 (step 50 applies the prompts), so it doesn't hold this tick: the
  digest's stored prompt is older than `main`'s, and that is step 50. S04's own two-day check is
  separate.* About 10 minutes, in the
  same sitting as the merge, after step 28. Merging S04 ends the old runner's one-at-a-time rule,
  so don't leave this for the morning. Tell the main chat "S04 merged".
  - That session follows docs/RUNNER.md "Applying it": it creates **Mako all-day runner** (every
    hour at :07 Eastern, no phone notifications) and **Mako evening digest** (8:03 PM Eastern, one
    phone notification), and turns off, without deleting, **Mako daily runner**.
  - Your part, about 2 minutes: at https://claude.ai/code/routines open each new task > the menu
    next to its name > **Edit** > **Advanced settings** > **Repository**, add
    `ABlueAI/AgentCommandCenter`, then **Save changes**. A task an agent creates has no repository
    (seen on the first run, 2026-10-18).
  - **Pause any time:** on that page switch **Mako all-day runner** off, then stop any runner
    session still working at https://claude.ai/code. Switch it back on to resume. Leave the digest
    on; it only reads.
  - **Left to do, as read on 2026-10-23 at about 07:40 UTC** (docs/RUNNER.md "Applied so far"; about
    3 minutes at https://claude.ai/code/routines):
    - **Mako daily runner:** switch it **off**. It is still on and fires at 8:01 AM with the new
      prompt, next to the new hourly runner.
    - **Mako evening digest:** switch it **on**. It was created off, so no digest is sent yet.
    - **Connectors:** open each new task > Edit > Advanced settings > Connectors and remove them
      all. The digest has your GoHighLevel CRM (GHL_MCP_X_CLAUDE), Claude_Docs and
      Claude_Code_Remote attached, and the runner has Claude_Docs; neither needs any. If you want
      to keep one, tell the agent which and why, and it records that here.
    - After the S04 follow-up PR merges: tell the main chat "apply the runner and digest prompts
      from docs/RUNNER.md", so both tasks get the fixed prompts.
  - *Done when:* that session reads all three tasks back (schedule, model Opus 5.5, notifications,
    on or off, prompt matching `main`), the first hourly fire afterwards works a PR as `ABlueAgent`
    (which proves the repository is attached), and it ticks this step with the date and how it
    checked. S04 itself is done after two days in a row run unattended through several fires, a
    usage-limit stop resumes on its own, and the digest arrives both evenings; then tell any agent
    "check S04".

- [ ] **50. Have the runner and digest prompts applied (after you merge PR #166).** *Still open,
  read back 2026-11-26 (`list_triggers`, read-only): the runner's stored prompt is a wrapper that
  tells it to follow the runner prompt docs/RUNNER.md marks as current, with its own overrides on
  top (recorded verbatim in docs/RUNNER.md, "Read back 2026-11-26 (issue #304)"), and the digest's
  stored prompt (last changed 2026-11-05) is PR
  #166's text, without the later "agent login" and "Agent writes" lines of "Proposed digest prompt
  (verbatim)". **As of 2026-11-26 this step covers the digest only:** leave the all-day runner's
  stored text as it is (it already reads "Proposed runner prompt (verbatim)" every fire, and
  replacing it would drop its overrides; aligning those is issue #313). Your part: tell any Claude
  session "apply the digest prompt from docs/RUNNER.md". Done when, as of 2026-11-26: the session
  reads both tasks back, the digest's prompt matches "Proposed digest prompt (verbatim)" on `main`
  as text, and the runner's still matches the read-back recorded in docs/RUNNER.md. Where the text
  below says otherwise, this note wins.* About 2 minutes,
  right after you merge PR #166 (the merge-order rule). Tell any Claude session "apply the runner
  prompts from docs/RUNNER.md". It updates only the prompts of the scheduled tasks **Mako all-day
  runner** and **Mako evening digest** from "Proposed runner prompt (verbatim)" and "Proposed digest
  prompt (verbatim)" on `main`; their schedules, models, notifications and on/off switches stay as
  they are, and **Mako daily runner** is left to step 27. Until step 27 turns that one off, it keeps
  PR #84's prompt, without the merge-order check, so do step 27 in the same sitting if you can. The
  runner never edits itself.
  - *Done when:* that session reads both tasks back, their prompts match docs/RUNNER.md on `main`
    (compared as text), and it ticks this step with the date and how it checked.

## Any time (not blocking)

- [x] **9. Password manager.** About 45 minutes, any time. *Done 2026-10-19 on Blue's word: "password
  storage is set up". It's his, so Claude verified nothing.* Recommended: **Bitwarden, free plan**
  (open source, independently audited, unlimited passwords and devices). For nothing in the cloud at
  all, KeePassXC instead, but then you handle syncing and backups yourself.
  - Install the Windows app, the phone app and the browser extension from bitwarden.com.
  - Master password: 5 or more random words (Bitwarden's generator makes one). Write it on paper,
    keep it somewhere safe at home, and don't store it digitally. It is the one thing that protects
    the vault, because the vault is encrypted with it before it leaves your device.
  - Turn on two-step login for Bitwarden itself (Settings > Security > Two-step login) with an
    authenticator app. Put Bitwarden's recovery code on the same paper.
  - Move these first: email, GitHub, Claude, OpenAI, Apple or Google, bank. Change any password you
    have used on more than one site.
  - Recovery codes: for email, GitHub and Bitwarden, keep a paper copy with the master password; for
    other accounts, the item's notes field is fine. Keep 2FA codes in a separate authenticator app
    with backup (Bitwarden's built-in codes need Premium, and keeping them separate is safer anyway).
  - API keys go in Bitwarden secure notes; keys Mako uses go in Mako's key setup. Never in this repo,
    Windows environment variables, or a chat with any AI, Claude included. (For new tokens, see step
    17b.)
  - Once moved, turn off password saving in Chrome and Edge so there is one place.
  - Don't connect it to ChatGPT's **Passwords** setting or let any AI agent drive it.
  - *Done when:* you say so. It's yours, so Claude doesn't verify anything.
- **10. ~~App settings review.~~ Dropped.** *Dropped 2026-11-16 by Blue on his decision sheet: the
  new Settings page (S19; S66 since 2026-11-22) replaces it (docs/DECISIONS.md, 2026-11-16). Nothing to do; the number
  stays so no other step is renumbered. `docs/SETUP-APP-SETTINGS.md` was never written.* About 20
  minutes, this week, after step 2.
  - Screenshot every page of: ChatGPT desktop app > Settings; claude.ai > Settings and the Claude
    desktop app's settings; github.com > Settings > Applications (Installed GitHub Apps and
    Authorized OAuth Apps). Send them to Claude in one message.
  - Claude replies with the exact toggles to change and writes the agreed setup into
    `docs/SETUP-APP-SETTINGS.md`, without personal details, so every agent knows it.
  - *Done when:* you've changed them and said so.
- [x] **11. Close the false security alert, issue #35.** 1 minute, right after you merge the
  merge-audit PR, #37. *Verified 2026-10-18 through GitHub's API: #35 was closed by ABlueAI at
  19:08:04 UTC, one second after #37 merged (`f23a7bf`). The merge audit passed on that push and on
  #36's (`6f73602`), and no new security-alert issue opened. The suggested note was not posted as a
  comment; nothing else depends on it.*
  - Open https://github.com/ABlueAI/AgentCommandCenter/issues/35, comment "False alarm: commits
    arrived via PR #34 (37009eb), merged by ABlueAI; audit fixed in #37", then **Close issue**.
  - Agents never close security alerts themselves.
  - *Done when:* issue #35 shows Closed, and the merge audit run for that merge passed with no new
    alert. Claude checks both.

- [x] **12. Close the false security alert, issue #40.** 1 minute, right after you merge the
  merge-audit fix PR (the one that adds this step). *Verified 2026-10-19 through GitHub's API: #40
  was closed by ABlueAI at 04:53:47 UTC, one second after the fix PR #41 merged (`8846eed`). The
  merge audit run on `main` at `8846eed` succeeded, and no security-alert issue is open.*
  - Why it's false: #40 says PR #39's commits reached `main` without a merged PR. They didn't: #39
    holds exactly `281de31` and `a0798d0`, you approved `a0798d0`, and you merged it as `0b6d432`.
    GitHub's commit-to-PR lookup, which the audit relied on, came back empty for all three and was
    still empty 10 minutes later. The fix also checks the merge commit of each PR merged into `main`.
  - Open https://github.com/ABlueAI/AgentCommandCenter/issues/40, comment "False alarm: commits
    came via PR #39 (merge 0b6d432), approved and merged by ABlueAI. Audit fixed in the follow-up
    PR", then **Close issue**.
  - Agents never close security alerts themselves.
  - *Done when:* #40 shows Closed, and the merge audit run for the fix's merge passed with no new
    alert. Claude checks both.
- [x] **13. Independent review for agent PRs.** *Verified 2026-10-19 through GitHub's API: PR #42 was merged
  by ABlueAI at 06:10 UTC as `246d743`, its TLDR links its "Independent review (Opus)" comments, and
  the merge audit run on `246d743` succeeded. The new runner prompt was applied to the scheduled task
  at 06:11 UTC; the update call's response showed the prompt from `docs/RUNNER.md` on `main` and the
  repository still attached. A read of the task after PR #44 merged shows the same prompt but does
  not list attached repositories; the 12:02 UTC run on the new prompt opened PR #44 from the
  repository, and the prompt's step 1 attaches it if it is ever missing.*
  - What was found (2026-10-19):
    - Codex reviewed every PR you authored automatically ("PR opened", #36 to #38), but skipped #39
      and reviewed #41 only after your manual comment. Both were authored by `ABlueAgent`.
    - The repo's Codex setting shows Review = "Follow personal preferences". Changing it to "All
      PRs" fails with "Unable to save repository settings. Try again."
    - Agents requesting the review themselves (at-codex review from `ABlueAgent` on PR #42):
      **FAIL**. Four seconds later Codex replied "To use Codex here, create a Codex account and
      connect to github" and didn't review. Codex ignores accounts not linked to ChatGPT.
  - Your choice (option 3): a separate Claude Opus reviewer replaces Codex as the required
    independent review, so Mako doesn't depend on ChatGPT. The builder runs the read-only `pr-reviewer`
    subagent (`.claude/agents/pr-reviewer.md`) on its own PR before marking it ready, and posts the
    result as a PR comment headed "Independent review (Opus)". It fixes or answers every finding and
    re-runs it after fixes (AGENTS.md "How work flows" step 3, and the runner prompt).
  - Codex review is optional now. You can still request one by hand, but nothing waits for it (since
    step 16, ask an agent to post the request; yours as `ABlueAI` is refused).
  - *Done when:* PR #42 merges with its "Independent review (Opus)" comment linked in the TLDR.
- [x] **14. Agent token for local agents (approved with PR #44; token type changed by PR #46).**
  *Verified 2026-10-23 on Blue's word in chat ("token done, expires 1/23/3037", then "date is
  updated to reflect true 90 day date 1/21/2027"): it expires 2027-01-21. Claude can't see the
  token. That it is a classic token for `ABlueAgent` with only `public_repo`, kept in Bitwarden,
  is Blue's word as relayed by the session that handed off this task, not in the words quoted here;
  not verified, and S06's PR confirms the scope. The renewal reminder is under "Dated
  reminders".* About 10 minutes, any time before
  session S06 (the runner won't start S06 until this is ticked).
  Today local agents on your PC push as `ABlueAI`, the account that can approve and merge.
  - Signed in as `ABlueAgent`: GitHub > Settings > Developer settings > Personal access tokens >
    **Tokens (classic)** > Generate new token (classic). Tick only **public_repo** (no `repo`,
    `workflow`, `admin` or `delete_repo`), with a 90-day expiry. S06 confirms this scope is enough
    for how it uses the token; if it needs more (for example `gh auth login --with-token`, which may
    expect `repo` and `read:org`; passing it as `GH_TOKEN` to a pane may avoid that, not verified:
    S06 checks it survives the subprocess scrub), S06 asks you first. GitHub may also refuse a
    push without `workflow` when the branch brings in `main`'s workflow changes (not verified);
    S06 checks that case too.
  - Why classic: GitHub doesn't support fine-grained tokens for an account that is only a
    collaborator on a personal account's repository, which is what `ABlueAgent` is here (found by
    Codex on PR #46; GitHub's docs as quoted in a search result, not yet read directly). With
    `public_repo` it can push code only where `ABlueAgent` has write access, today only this repo,
    and without `workflow` it can't edit workflow files (it can still change the code CI runs on
    its own PRs, which can't merge without your Approve). It can also open issues, PRs and comments
    as `ABlueAgent` on any public repository, and create public repositories under `ABlueAgent`.
    Don't give `ABlueAgent` write access to another repository without revisiting this token.
  - Its final home is Mako's in-app key setup (Electron safeStorage). Never `setx` or a Windows
    user environment variable (AGENTS.md "Security rules").
  - Until S06 gives it a home in Mako (the plan doesn't yet say how; S06 decides), it waits only in
    Bitwarden (step 17b).
  - *Done when:* you say the token exists and is in Bitwarden, and tell Claude its expiry date
    (never the token). Claude adds the renewal reminder under "Dated reminders" (step 17b) and
    ticks this on your word (it can't see the token), which lets the runner start S06. The S06 PR
    then shows a pull request opened from a local Mako pane with `ABlueAgent` as its author and
    confirms the exact scopes.
- [ ] **15. Check voice on the new Electron (after you merge PR #45, S02).** About 10 minutes, the
  next time you sit down at your PC. S02 moves Mako from Electron 42.5.0 to 42.11.15 for six security
  fixes; step 15 now also covers S36's 42.11.16. CI covers the code, but only your PC has the microphone, GPU and speakers.
  - Fully close Mako. In PowerShell: `cd` to the repo, `git switch main`, `git pull`, then `cd app`
    and `npm ci`. It should print `ensure-electron-binary: Electron 42.11.16 ready at ...`.
  - Start Mako from the desktop shortcut. The title should show the new `main@` commit.
  - **Dictation:** click a Claude pane, click 🎤 Dictate, say a sentence, click it again. The text
    should land in that pane.
  - **Text to speech:** select some text in a pane and click that pane's 🔊 button. It should speak
    in your chosen voice. Then set the speed to 2.0× and speak again: it should be faster without a
    raised, chipmunk pitch.
  - Check the Claude pane's status badge still changes from working to turn ended.
  - *Done when:* you tell any agent "step 15 passed", or what failed. The agent ticks this with the
    date. A failure gets a fix PR, or a revert of the Electron bump, before other work, and the
    agent sets S02 back to IN PROGRESS in docs/PLAN-1.1.md until it is fixed.
- [x] **16. Re-link Codex's GitHub to `ABlueAgent`.** *Done early, on 2026-10-20, before S04's prompt
  (your word, relayed to the PR #48 session; docs/DECISIONS.md, 2026-10-20). Verified 2026-10-20 on
  GitHub rather than by the screenshot this step first asked for: Codex reviewed `ABlueAgent`'s PR #48
  automatically 9 seconds after it opened (trigger "PR opened"), with no request from anyone, and your
  own manual request as `ABlueAI` on PR #48 was refused (STATUS.md). What the link can reach is step
  20.* Your decision of 2026-10-19: Codex builds as the agent account, so you can approve its PRs
  (expected; session S26 verifies which account Codex's PRs are attributed to). Same ChatGPT Plus
  account, no new seat. (Numbered 16 because step 15 is the voice check from PR #45; PR #46 took 17.)
  - Done before S04's prompt, so today's runner prompt still says to post reviews "verbatim". Once PR
    #47 merges, AGENTS.md's Codex-handle rule and step 3's replace-the-handle check govern it
    (docs/RUNNER.md note). Until then nothing in the repo tells agents not to write Codex's handle,
    and any `ABlueAgent` comment containing it may start a Codex task that pushes a branch (it can't
    merge). Merging PR #47 closes that gap.
  - What changed: Codex reviews agent PRs automatically; a review request you comment as `ABlueAI` now
    fails, so ask an agent to post it (comment on the PR as `ABlueAI`, or tell the agent in its own
    session); an agent's request worked on PR #47 on 2026-10-21 (STATUS.md). If ChatGPT uses this same GitHub connection outside Codex (not verified), repositories
    only `ABlueAI` can reach drop out of ChatGPT and Codex; session S26 checks this.
- [ ] **17. Token hygiene: find old tokens, and rules for any new one.** About 20 minutes, inside
  1.1, as the last step before the release (S59; decision sheet, 2026-11-16; it was "about February
  2027", moved 2026-11-03). 1.1 isn't done until this passes. Part c is already done.
  - **a. Audit old tokens, on both `ABlueAI` and `ABlueAgent`** (sign in to each in turn). A lost
    token's value can't be recovered: GitHub shows a token only once, but it lists every token with
    its last-used date.
    - Classic tokens: https://github.com/settings/tokens
    - Fine-grained tokens: https://github.com/settings/personal-access-tokens
    - Apps: https://github.com/settings/applications. Check all three tabs: Installed GitHub Apps,
      Authorized GitHub Apps and Authorized OAuth Apps.
    - SSH keys: https://github.com/settings/keys
    - Except the items listed below to keep, revoke anything you don't recognize or that hasn't
      been used for months.
    - Keep the Git login on your PC that local agents push with today (often listed as **Git
      Credential Manager** or **GitHub CLI** under authorized apps) until session S06 merges and
      replaces it (ticking step 14 alone doesn't); revoking it breaks local pushes. Its removal
      after S06 is step 49.
    - On `ABlueAgent`, keep Claude's authorization: it is how cloud sessions act as the agent (step
      7c).
    - On `ABlueAI`, keep the Claude installation under Installed GitHub Apps (cloud sessions and the
      runner reach the repo through it) and the ChatGPT/Codex installation. Keep the ChatGPT/Codex
      authorization on `ABlueAgent` (re-linked 2026-10-20). While on `ABlueAgent`'s Applications page,
      also do the part of step 20 that wasn't reported: **Installed GitHub Apps** should be none;
      note what **Authorized GitHub Apps** lists besides ChatGPT/Codex, and tell Claude. A new token
      doesn't bring an app link back.
    - If `ABlueAI` still shows Claude under Authorized GitHub Apps, it is left over from before step
      7c and can act as you: revoke it. That removes the authorization, not the installation. If a
      cloud session can't reach the repo afterwards, tell Claude.
    - Likewise, a ChatGPT/Codex authorization still listed under `ABlueAI`'s Authorized GitHub Apps
      or OAuth Apps is left over from before the re-link and can act as you: revoke it (not the
      installation).
    - Do the same for API keys at https://platform.openai.com/api-keys,
      https://console.anthropic.com (API keys page) and https://aistudio.google.com/apikey (Gemini,
      the key Mako's Video Scout uses; also Google Cloud > APIs & Services > Credentials if you made
      keys there).
    - On `ABlueAI/AgentCommandCenter`: Settings > Deploy keys, and Settings > Secrets and variables
      > Actions. Remove anything you don't recognize.
    - If something breaks after a revoke, make a fresh, narrower token by the rules in b, except a
      GitHub token for your PC before S06: tell Claude instead. If local pushes from your PC break,
      sign in to Git again (Git Credential Manager asks on the next push; first make sure the
      browser is signed in as `ABlueAI`, not `ABlueAgent`), and tell Claude. That restores the
      login you already had (exception 2 in b).
  - **b. Rules for every new token**, including step 14's:
    - Two exceptions apply to every GitHub rule below: (1) for `ABlueAgent` only, because GitHub
      doesn't support fine-grained tokens for an account that is only a collaborator on a personal
      account's repository: a classic token with the single narrowest scope (step 14: `public_repo`
      only), never for `ABlueAI`; (2) until S06, the PC's existing `ABlueAI` Git login and signing
      in to it again (a). After S06, only if you keep that login under step 49,
      with the pane isolation the S06 PR shows. Your own `ABlueAI` sign-in in a browser or a
      separate Windows account where no agents run is also covered.
    - GitHub tokens: fine-grained, limited to one repository, with the fewest permissions that do
      the job. Other keys: the fewest permissions the provider offers.
    - A token of `ABlueAI` must never have **Pull requests: write** (it could submit an Approve as
      you and defeat the `protect-main` ruleset), nor **Contents: write**, **Administration** or
      **Workflows** (it could push or merge as you, edit the ruleset, or change CI). For commenting
      on PRs, **Issues: read and write** should be enough (from community sources; not yet checked
      against GitHub's docs, so the PR that creates such a token confirms it).
    - Any `ABlueAI` token that automation or an agent would use, such as one that posts Codex review
      comments, needs its own PR and your decision first. Its comments would look exactly like
      yours, and with Issues write it could also close the merge audit's security-alert issues.
      This step doesn't approve one.
    - Paste it straight from the provider's token page into its one destination (a Bitwarden copy
      is optional, below): Mako's key setup, or a GitHub environment secret restricted to `main`.
      A provider key Mako's key setup can't hold yet waits only in Bitwarden. Never into any AI
      chat (Claude included), a file, this repo, or `setx`.
    - Today Mako's key setup stores only the Gemini key. S06 gives step 14's GitHub token a home in
      Mako (the plan doesn't yet say how). Until then, make no GitHub token for your PC other than
      step 14's, and step 14's waits only in Bitwarden (S06 can't start until it exists).
    - A secret a repo workflow uses goes in a GitHub environment whose deployment branches are
      `main` only, and that workflow must never check out or run code from a PR.
    - Expiry 90 days (1 year at most) where the provider lets you set one. (2026-11-03: at the
      end-of-1.1 reset you chose a 1-year expiry for every token, docs/DECISIONS.md.) Tell Claude the expiry
      date (never the token), and Claude adds a dated renewal reminder under "Dated reminders"
      below; for a key with no expiry setting, Claude adds a reminder to rotate it at 90 days.
    - For a token that goes into Mako's key setup or a GitHub environment secret, a Bitwarden copy
      is optional; not storing one at all, and making a new one when it expires, is also fine. A
      token with no home yet (step 14's before S06) must wait in Bitwarden. For new tokens and keys
      this replaces step 9's "API keys go in Bitwarden secure notes".
    - If it might have leaked: revoke it on its provider's page, then tell Claude. GitHub: Settings >
      Developer settings > Personal access tokens > Fine-grained tokens (or Tokens (classic)) > the
      token > **Revoke** or **Delete**, whichever GitHub shows. API keys: the pages in a.
  - **c. Turn on push protection.** Signed in as `ABlueAI`: repo Settings > Code security (it may be
    labelled Advanced Security) > Secret scanning (or Secret Protection) > **Push protection** >
    Enable. It is free for public repositories and blocks pushes that contain a recognizable secret.
    The person pushing can still override a block by giving a reason, so it catches accidents, not
    deliberate pushes.
    If it already shows enabled, nothing to do. This is your click; agents never change repository
    settings.
    *Verified 2026-11-03: already enabled. Claude read `security_and_analysis` through GitHub's API as
    `ABlueAI` (`secret_scanning` and `secret_scanning_push_protection` both "enabled").*
  - *Done when:* you say the audit is done and push protection shows enabled. Claude then tries to
    confirm push protection through GitHub's API (`security_and_analysis` on the repository). GitHub
    shows that field only to repository admins, and agents have write access, so Claude expects not
    to be able to read it; it says so and ticks this on your word.

- [x] **18. Say go on the UI when your examples are ready.** *Done 2026-11-24: Blue's go in Mako main's
  chat, 2026-11-24 ("go, we need to run through this session ..."), recorded in docs/DECISIONS.md
  by PR #253, which sets S66, S18, S19 and S20 to READY; checked against the hand-off for that PR.
  Merging PR #253 puts the entry on `main`.* About 1 minute, any time. The UI sessions
  (S14 and S17 to S20) are on `HOLD (Blue)` in docs/PLAN-1.1.md (PR #48), so the runner skips them.
  When your UI examples folder is ready, tell any agent "go on the UI". It records your words in
  docs/DECISIONS.md and sets those rows back to READY in a PR. Merging that PR starts S14 (Claude
  writes the brief). S17 to S20 are built by Codex, which you start yourself once S14 and S26 are
  done; the runner never builds them (docs/PLAN-1.1.md "UI sessions: who builds").
  - *Updated 2026-11-16:* Claude builds S18 to S20 and Codex reviews; S17 is done (Shark A); S14 is
    the brief from prototype A and your decision sheet (docs/PLAN-1.1.md "Mako 1.1 scope"). The rows
    are still on hold: your sheet set the scope, and your "go on the UI" hasn't been recorded in
    your words yet.
  - *Updated 2026-11-22:* S18 is split: the shared navigation (S66) comes first, and S18, S19 and
    S20 build on it in parallel. Your go on the UI releases S66 with S14 and S18 to S20.
  - *Updated 2026-11-17:* not before the 1.1 schedule is adopted with its independent review and a
    re-review of its fixes (plan row S61, step 64; your words: "the schedule and its independent
    review before any UI building"). Your go comes after S61 merges.
  - *Done when:* that DECISIONS.md entry is on `main`. Claude checks.
- [x] **19. Give your Composer verdict after S16.** About 15 minutes, after the S16 PR opens. Read
  `docs/decisions/OSS-composer.md`, answer its open questions, and give a verdict on each option
  (ADOPT, FORK, PROTOTYPE, PATTERN-MINE or BUILD FRESH) in your own words, in the S16 PR or to any
  agent. Spending on Gumloop or any paid service needs your explicit OK there.
  - *Done when:* your verdict is recorded word for word in OSS-composer.md and docs/DECISIONS.md.
    A later plan change then adds the Composer build sessions.
  - *Done 2026-10-21:* Blue gave his verdict in his own session, in two messages, both recorded
    word for word: "it will come from a lot of input from a lot of OSS material and we will figure
    out the good and bad tidbits and find something i like" (excerpt; full text in
    docs/DECISIONS.md) and "no, this does not cover my conclusion. everything stays open for study,
    questions deferred". He confirmed this reading on 2026-10-22: "Confirming the verdict, yes,
    true". No option is adopted; the open
    questions wait for more OSS review. PR #82
    records his words in OSS-composer.md and docs/DECISIONS.md (checked in the PR's diff). What the
    later Composer plan change contains is his call.

- [x] **20. Check what Codex's GitHub link can reach.** About 3 minutes, any time soon. *Done
  2026-10-21 on Blue's word: "yes it is only select repositories. with my main few checked and i will
  have to add more when they are created. thats it, move on." The ChatGPT/Codex installation on
  `ABlueAI` is set to **Only select repositories**, with Blue's main few repositories selected, not
  only `AgentCommandCenter`; he adds new ones as they're created. Claude can't read that page, so this
  rests on his word. Whether any of them is private isn't recorded. If Codex works through this
  installation rather than `ABlueAgent`'s own access (not verified; S26 checks which it uses), a Codex
  task can reach every selected repository, not only this one. The `ABlueAgent` page (second
  bullet) wasn't reported and Blue asked to move on, so that check moved to step 17a. Recorded in
  STATUS.md and docs/DECISIONS.md.* You linked ChatGPT/Codex's GitHub to `ABlueAgent` on
  2026-10-20 (STATUS.md), and nobody has checked its scope since.
  - Signed in as `ABlueAI`: github.com > Settings > Applications > **Installed GitHub Apps** > the
    ChatGPT/Codex app > **Configure**. It should say **Only select repositories** (step 2e); since
    2026-10-21 that is your main few repositories, not only `AgentCommandCenter`. If it says **All
    repositories**, switch it back and save.
  - Signed in as `ABlueAgent` (private window): github.com > Settings > Applications. Check
    **Installed GitHub Apps** (should be none) and **Authorized GitHub Apps** (the ChatGPT/Codex entry
    is expected; note what else is listed).
  - *Done when:* you tell any agent what both pages show; it records that in STATUS.md with the date.

- [x] **21. Have the runner's new prompt applied (after you merge PR #52).** *Verified 2026-10-21:
  an interactive session applied "Current prompt (verbatim)" from docs/RUNNER.md on `main` to the
  scheduled task `trig_01RnFDLAH1jJZfdhJ9wCU87W` at 21:19 UTC, then read the task back: the prompt
  matches `main` exactly, the model is `claude-opus-5-5`, `ABlueAI/AgentCommandCenter` is still
  attached, the task is enabled, and the next run is 2026-10-22 12:01 UTC. The PR that ticks this
  re-read the task the same day (read-only): last updated 21:19:33 UTC, its prompt identical to
  `main`'s (compared as text), model, enabled state and next run as above. That read doesn't show
  attached repositories, so the attachment rests on the applying session's read-back. Recorded in
  docs/RUNNER.md.* About 2 minutes, right after you merge PR #52 (the capped review loop). Tell any Claude session "apply the runner prompt
  from docs/RUNNER.md". It updates only the prompt of the scheduled task "Mako daily runner" from
  `main`; the schedule and the model (Opus 5.5) stay as they are. The runner never edits itself.
  - *Done when:* that session reads the scheduled task back, its prompt matches docs/RUNNER.md
    "Current prompt (verbatim)" on `main`, and it ticks this step with the date and how it checked.

- [ ] **22. Evaluate qodo-ai/pr-agent as Mako's PR reviewer.** **Your part is done; an agent
  records it.** *Marked 2026-11-26: your signed decision sheet already gives the verdict
  (docs/DECISIONS.md, 2026-11-16, ticked: "keep `pr-reviewer`, pattern-mine pr-agent and Anthropic's
  review plugins, no key, no spending"); your own wording wasn't relayed. What's left is an agent
  copying that verdict into docs/decisions/OSS-pr-review.md's "Blue's verdict" line, citing the
  sheet, and ticking this. Nothing to do unless you want another verdict.* About 20 minutes of your own time,
  after session S34 writes up the options (added 2026-11-03), whenever you get to it ("add it to my
  list, i will get to it"). (Numbered 22 because open PR #52
  uses 21.)
  - What it is: an open-source PR reviewer, https://github.com/qodo-ai/pr-agent. Under AGENTS.md's
    OSS-first rule it is a candidate to replace or back up Mako's custom review loop (the
    `pr-reviewer` subagent and its re-runs).
  - Give a verdict: ADOPT, FORK, PROTOTYPE, PATTERN-MINE or BUILD FRESH, in your own words. An
    agent writes the one-page record, `docs/decisions/OSS-pr-review.md` (the options and your
    verdict, AGENTS.md "Engineering rules"); if you want it researched first, it writes the options
    there before you decide. Anything that would need a new key, account or spending comes back to
    you first.
  - *Done when:* your verdict is recorded word for word in `docs/decisions/OSS-pr-review.md` and
    docs/DECISIONS.md.

- [ ] **23. S05 needs-you toast on a real Claude pane.** About **2 minutes**, after the S05 PR's
  Windows checks pass and Claude Opus has reviewed it, before calling S05 done. Use the S05 branch
  on your PC; fully close and restart Mako after installing that branch's app dependencies.
  - Launch a **new real Claude pane** with Mako's existing pane-status setup enabled (an old pane
    may not carry the status token). Send a short request such as "Reply with one word: ready".
    Confirm a Windows **Mako — Claude turn ended** toast appears when its badge says turn ended.
  - Trigger a normal permission/input request in that pane, using a harmless read-only action
    under Claude's normal permission mode; do not weaken permissions just to test. When Claude
    emits its existing Notification hook, confirm **Mako — Claude needs attention** appears.
    Duplicate status/heartbeat updates should not add duplicate toasts. Clicking a toast should
    bring Mako forward. A turn-ended toast does not mean the task is finished.
  - Also tell the agent: (a) whether a **needs attention** toast followed a **turn ended** toast
    about a minute later with no permission prompt (expected, since Claude also notifies on idle
    input; not yet seen on a real pane); (b) whether a toast you left for over 2 minutes was still
    in Windows' notification list.
  - If no toast appears, check Windows Settings > System > Notifications (Mako/Electron), turn
    off Do not disturb for this check, confirm the pane's badge changes, and check Mako's Logs.
    Stop at 2 minutes and report which event/badge/toast failed; do not mark the box complete.
  - *Done when:* Blue reports both observed toasts and the running build label; the checking agent
    records that evidence and date here. **Pending; not verified in the Linux cloud.**
  - **Re-run after S31 merges** (about 3 minutes; on 2026-11-02 every badge read "unknown" and no
    toast came. S31 renamed the pane's status variable, which Claude Code's env scrub was removing):
    1. Pull `main`, then fully close and restart Mako.
    2. Open a **new** builder pane and send "Reply with one word: ready". Expected: the badge changes
       from "unknown" and a **Mako — Claude turn ended** toast appears.
    3. In the same pane, ask Claude to run this with its Bash tool and show the output (it prints
       only true or false, never the values):
       `node -e "console.log(!!process.env.BLUE_HELM_PANE_STATUS_PIPE, !!process.env.BLUE_HELM_PANE_STATUS_PANE_REF)"`
    4. Tell an agent what steps 2 and 3 showed. `true true` with no toast points at Mako or the
       hooks; `true false` means the scrub still removes the pane's value; `false false` means
       neither reaches Claude's subprocesses.
- [ ] **24. Optional phone alerts via Claude Remote Control (S05).** About **2 minutes** after
  step 23, if wanted. Follow [docs/NEEDS-YOU-ALERTS.md](docs/NEEDS-YOU-ALERTS.md#phone-alerts-through-claude-remote-control).
  Connect the same real pane from your phone, enable Claude's available push-notification choices
  and the phone's OS notification permission, then request a harmless test push. This uses your
  existing Claude account; do not add an account, subscription, Mako hook or API key for it.
  - *Done when:* the session is visible on your phone and a push is observed; report a missing
    setting or unavailable account feature instead of assuming delivery. **Optional; unverified.**
  - **Re-run after step 23's re-run passes** (about 2 minutes, optional):
    1. In the pane from step 23, connect Remote Control from your phone.
    2. Turn on Claude's push notifications on the phone and allow them in the phone's settings.
    3. Ask Claude for a harmless test push. Tell an agent whether it arrived.

- [ ] **25. Connect the plan board (S03).** *2026-11-16: the tick is folded into the H1 setup day
  (step 54), and the plan board is paused until after 1.1 (decision sheet), so nothing new is asked
  of you here.* About **10 minutes**, after you merge the S03 PR, #54. The
  plan sync already keeps one issue per session with labels and the "1.1 Month 1" milestone using
  GitHub's own token; only the Project board needs a token of its own, because GitHub's built-in
  token can't write a project on your account. Recommended: a token on `ABlueAgent` that can touch
  projects only, never repositories.
  - Signed in as `ABlueAI`: your profile > **Projects** > **New project** > **Board**, name it
    "Mako 1.1". In its **Status** field, make exactly these options: `Ready`, `Running`,
    `Needs Blue`, `Hold`, `Ready to merge`, `Done` (rename or delete the defaults). Note the number at
    the end of the project's URL. Project **Settings** > **Manage access** > invite `ABlueAgent`
    with **Write**.
  - Signed in as `ABlueAgent` (private window): Settings > Developer settings > Personal access
    tokens > **Tokens (classic)** > Generate new token. Note "Mako plan board", expiry 90 days,
    tick **only** `project`. Copy it; never paste it into a chat or the repo.
  - Signed in as `ABlueAI`: the repository > Settings > **Environments** > `plan-board` (the sync
    created it on its first run; if not, **New environment** with that name). **Deployment branches
    and tags** > **Selected branches and tags** > add `main`. Add environment secret
    `PLAN_BOARD_TOKEN` (the token) and environment variable `PLAN_BOARD_NUMBER` (the project number).
  - Then Actions > **Plan sync** > **Run workflow**.
  - *Done when:* that run's summary says "Board: synced" and the board shows every session in its
    column, and you have told Claude the token's expiry date (never the token), so it adds the
    renewal reminder under "Dated reminders" (step 17b). Tell any agent; it checks the run and the
    board and ticks this with the date. If the run fails, the agent reads its log; no agent ever sees
    the token. When the token expires, every hourly run fails visibly until it is replaced.

- **26. ~~Have the runner's claim-check prompt applied (after you merge PR #83).~~ Dropped.**
  *Dropped 2026-11-04 (1.1 gap audit A7), as superseded, won't be done: S04 (PR #84) replaced this prompt, and step 27 turns "Mako daily runner" off.
  Don't apply a prompt to that task; use step 27's last bullet instead.* About 2 minutes,
  right after you merge PR #83 (the claim check: the runner skips a READY session that already has
  an open PR titled with its ID). Tell the main chat, or any Claude session, "runner prompt merged"
  or "apply the runner prompt from docs/RUNNER.md". It updates only the prompt of the scheduled task
  "Mako daily runner" from `main`; the schedule and the model (Opus 5.5) stay as they are. The
  runner never edits itself.
  - *Done when:* that session reads the scheduled task back, its prompt matches docs/RUNNER.md
    "Current prompt (verbatim)" on `main`, and it ticks this step with the date and how it checked.

- [ ] **29. Quick Links bundle on your PC (S12).** About **5 minutes**, after you merge the S12 PR,
  #86. Pull `main`, then fully close and restart Mako (renderer changes need a full restart).
  - Quick Links > **Manage** > **+ Add Mako bundle** > **Save Changes**. Seven links appear: Claude
    desktop, Codex app, Mako PRs, Project board, Obsidian vault, Hermes docs, Dodaios docs. Your
    Starboard and Outlook links stay.
  - Click each once. The three app links (Claude desktop, Codex app, Obsidian vault) open the app
    if it is installed; Windows asks which app to use if it isn't (Obsidian comes with S13). The
    rest open in your browser. "Project board" opens your projects list until S03's board exists.
  - Your Hexona login: the repo's records say your existing **Starboard Platform** link
    (`https://jlautomationsystems.com/`) opens your Hexona Systems login. Click it: if that is
    your Hexona login, there is nothing to add. If not, **Manage** > **+ Add link**, label it, paste
    the URL you use, **Save Changes**.
  - *Done when:* you tell an agent which links opened and whether Starboard Platform is your
    Hexona login or you added another link (never paste a login or password); it ticks this with the date. A link that fails: say which and what
    happened, and Mako's Logs line (it names a reason, never the URL).

- **30. ~~Codex trial build (S26).~~ Superseded.** *Struck 2026-11-26: the trial ran as PR #140
  (merged 2026-11-04), you made it S26's result on 2026-11-16 (docs/DECISIONS.md, 2026-11-16,
  "Codex"), and since 2026-11-25 Codex gets work through the reworded lane, any plan row by a claim
  issue and one hand-off comment (docs/DECISIONS.md, 2026-11-25, "Codex's lane, reworded"). Its two
  recurring checks (lock each claim issue; open a Codex PR review's "Run by:" link before
  approving) now sit under "At every merge sitting" in the index at the top. The trial's records
  (which account pushed, whether the issue mention started the task, what context Codex read) are
  issue #305. The number stays so no other step is renumbered.* About **3 minutes**, in two parts, after you answer the
  trial question on PR #114 ((A) wait for S07, or (B) the small `not-installed` test task now).
  - The builder opens a claim issue titled `Sxx:` (or `S26 trial:` for option B), labelled
    `agent-claimed`. Open it, click **Lock conversation** (right sidebar) > **Lock**. Then comment
    as `ABlueAI`: "hand this to Codex". Agents can't lock issues, so this is yours.
  - The builder posts the one hand-off comment (docs/CODEX-BUILDER-LANE.md "The lane", item 3).
    Codex opens a PR from a `codex/` branch; the builder runs the Opus review on it.
  - Before you approve Codex's PR, open the review comment's "Run by:" link and check it is a
    Claude session that reviewed that PR (Codex might be able to post as `ABlueAgent`).
  - While it runs (1 minute): in ChatGPT's Codex task list, open the task and note whether it
    started from the issue comment and what it shows as context; tell the builder.
  - *Done when:* Codex's PR is reviewed and you merge it; the builder records which account pushed,
    whether the issue mention started the task and what context Codex read, in
    docs/CODEX-BUILDER-LANE.md, and ticks this with the date.

- [ ] **31. Obsidian vault and skills on your PC (S13).** About **10 minutes**, after you merge the
  S13 PR, #115.
  - Install the Obsidian app from obsidian.md (free for personal use).
  - Pull `main`, then in PowerShell from the repo folder:
    `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\new-mako-vault.ps1 -Path D:\Workspace\Mako-Vault`
    (another folder is fine, as long as it is outside the repo; the script refuses one inside it).
    It prints `created` for `Mako index.md`, `AGENTS.md` and `CLAUDE.md`.
  - In Obsidian: **Open folder as vault** > pick that folder. Open `Mako index.md` and click the
    STATUS link once.
  - **First, your word on S68's scan** (PR #300, 2026-11-26; 1 minute): S68 pinned the plugin at
    1.2.3 from its new home, `obsidianmd/obsidian-skills` (commit `a53f591`, MIT). The scanner's
    run was partial: 2 of its 19 files were only partly inspected by one check, and a partial scan
    never counts as a pass (docs/decisions/OSS-obsidian-skills.md, "Pin-and-scan of 1.2.3"). The
    agent read both spans by hand and found only reference text. Reply on PR #300 (or to any
    agent) "install Obsidian Skills 1.2.3" to go ahead, or "wait" to hold it. Recommended: install.
    If you say wait, skip the next bullet; the vault works without the plugin.
  - In PowerShell: `cd D:\Workspace\Mako-Vault`, start `claude`, run
    `/plugin marketplace add https://github.com/obsidianmd/obsidian-skills.git#1.2.3`, then
    `/plugin install obsidian@obsidian-skills`, and choose the project scope if it asks. The
    `#1.2.3` suffix pins the marketplace to the scanned tag (that Claude Code accepts it is not
    verified). **If Claude Code refuses it, stop there and tell the agent; install nothing.**
    Never add the marketplace without the suffix: that installs whatever is newest, which nobody
    scanned. The plugin names come from the plugin's own README at 1.2.3.
  - Still in that session, before using the plugin, ask: "Find the installed Obsidian plugin's
    files and check each one's sha256 against the table 'Shipped files at 1.2.3' in
    docs/decisions/OSS-obsidian-skills.md on GitHub (ABlueAI/AgentCommandCenter). If any file is
    missing, extra or different, uninstall the plugin and tell me." The version shown in
    `/plugin` (1.2.3) is only a first look: a later, unscanned commit can keep that number, and a
    tag can be moved, so the file check is what proves it is the scanned copy.
  - If a skill offers to install a missing tool (`npm install -g defuddle`, `knap` or
    `obsidian-headless`), say no for now: those aren't pinned or scanned yet.
  - Still in that session, ask: "Read Mako index.md and add a note called Test with a link to it
    under Notes." Check the note and the link appear in Obsidian.
  - *Done when:* you tell an agent the vault opened, the plugin installed and its files matched
    the table, and the test note and link appeared (or what failed); it ticks this with the date
    and S13 is marked done.

- [x] **32. A private repo for S22's marina brief.** *Verified 2026-10-23 by the all-day runner:
  Blue replied on PR #116 that the brief goes in `mako-business`; GitHub reports
  `ABlueAI/Mako-Business` as private with push access for `ABlueAgent`; the runner attached it
  and pushed the brief's branch `s22-marina-brief` (commit `24ddc8e`, PR 1 in that repo).*
  About **3 minutes**, whenever you like (S22 waits on it; nothing else does). S22's output goes in a private repository, never this public one
  (AGENTS.md "Security rules"), and none exists yet.
  - github.com > **New repository**, owner `ABlueAI`, name `mako-business` (or your choice; tell
    the agent), **Private**, add a README. No other settings.
  - Repository > Settings > Collaborators > **Add people**: `ABlueAgent`, role **Write**, and accept
    the invite signed in as `ABlueAgent` (private window).
  - Claude GitHub App: github.com > Settings > Applications > Claude > **Configure** > add the new
    repo (Only select repositories). Leave Codex's app as is unless you want Codex reviews there.
  - Reply on the S22 PR (#116) with the repo name.
  - *Done when:* a runner fire attaches the repo and pushes the brief's branch there (it ticks this
    with the date and the commit); if it can't reach the repo, it says why on the PR.

- [ ] **33. Google Cloud billing, a Places API key and a budget alert (before S29).** About **15
  minutes**, after you merge the lead-pipeline plan change (PR #119) and before you start S29.
  This is new spending on a new paid account: your decision. Claude recommends it (S29 should stay
  within Google's free monthly usage, so the expected cost is $0; docs/PLAN-1.1.md "S29 and S30
  details").
  - In the Google Cloud console: create a project (for example "mako-places"), create a billing
    account and link it to the project, then enable **Places API (New)**.
  - **Credentials** > **Create credentials** > **API key**. Restrict it: API restrictions, Places
    API (New) only.
  - **Billing** > **Budgets & alerts**: a budget of **$1** with email alerts. A budget alert only
    emails you; it doesn't stop spending. So also open the Places API's **Quotas** page: if it offers
    a per-day request limit, set it to about **300**, a hard limit S29 can't pass. If it offers none
    (not verified), say so; S29 then relies on its own request count and the alert.
  - Save the key in your password manager. Then put it in a separate cloud environment for business
    sessions (for example "Mako business"; the cloud environment menu in a session's title bar, then
    Edit): under Network secrets (or as an environment variable) named `GOOGLE_PLACES_API_KEY`. Under
    the network's Allowed domains add only `places.googleapis.com`, `cloud.google.com` and
    `developers.google.com` (S29 reads Google's terms and pricing there), and attach
    `ABlueAI/mako-business`. Never the runner's environment. Never paste the key in a chat, an
    issue, a PR or a repo.
  - *Done when:* you tell an agent the budget, the quota (or that there is none) and the
    environment's name (never the key).
    The S29 session then checks the variable is set without printing it, and ticks this step with
    the date and how it checked.

- [ ] **34. Screenshot of the HighLevel connector's permission scopes (before S24's watcher goes
  live).** About **3 minutes**, when the S24 session asks, after you authorize the GoHighLevel
  connector in claude.ai with a read-only token.
  - Open the connector's permission or scope page and take a screenshot that shows every scope.
    Make sure it shows no token, key or password; crop anything that does.
  - Send it to the S24 session only (not in a GitHub issue or PR; this repository is public).
  - *Done when:* the S24 session confirms every scope is read-only and ticks this step with the
    date. Any write scope stops the watcher until you remove it.

- [ ] **35. S06 on your PC: agent token, leftover processes, links.** About **15 minutes**, after
  you merge the S06 PR, #121. Pull `main`, run `npm ci` in `app`, and restart Mako fully.
  - **Token (2 minutes).** Mako shows a 🐙 "ABlueAgent token not stored" banner. Paste step 14's
    token from Bitwarden into it and click **Save encrypted** (never into a chat). The banner turns
    into "Agent token ✓". Restart Mako once more so the token loads at startup.
  - **Who an agent pane is (3 minutes).** Open a new Claude pane on this repo and ask Claude to run
    these with its Bash tool (so the check passes through Claude Code's subprocess scrub), one at a
    time, and show you the output:
    - `gh api user --jq .login`: expected `ABlueAgent`.
    - `git remote -v`: expected `https://github.com/...` (S06 covers HTTPS remotes only; a
      `git@github.com:` remote would push with your SSH key, so tell the agent if you see one).
    - `printf "protocol=https\nhost=github.com\n\n" | git credential fill | grep -v '^password='`
      (the `grep` keeps the token itself out of the output): expected `protocol=https`,
      `host=github.com` and `username=x-access-token` (the ABlueAgent token through gh), with no
      `password=` line. If it shows your own username or asks for a password, stop and tell the
      agent. If a `password=` line ever appears, the token is in that session's transcript:
      revoke it (step 17b) and make a new one.
    In a plain shell pane, `gh api user --jq .login` still shows your own login (plain shells are
    yours, not agents').
  - **A PR from a local pane (5 minutes).** Ask that pane: "make a branch `s06-local-check`, add a
    line to docs/S06-LOCAL-CHECK.md, commit, push, and open a draft PR titled `S06 local check`."
    Expected: GitHub shows the PR and its commit authored by `ABlueAgent`. Tell the agent the PR
    number; it confirms the author and closes the PR unmerged. If the push is refused with a
    message about the `workflow` scope, tell the agent (see the S06 PR's decision on that scope).
  - **No leftover processes (3 minutes).** Open two Claude panes, close one with its ✕, then quit
    Mako from the menu. Task Manager > Details: no `claude.exe`, and no `node.exe` you didn't start
    yourself. Mako's Logs show `[process-tree] ... tree killed`.
  - **Links (1 minute).** Click a GitHub link printed in a Claude pane: it opens in your browser.
  - *Done when:* you tell an agent the results (or what failed). It checks the test PR's author on
    GitHub, ticks this with the date, and marks S06 done in the next status PR.

- [ ] **49. Remove the `ABlueAI` command-line login from every PC Claude runs on (main PC, H1,
  laptop).** About **5 minutes per PC**, right after step 35 passes (from "Coming up this month",
  moved here on 2026-11-04). Why: a Claude desktop chat uses this login, and you can't approve a PR
  it opens or pushes to (PRs #142 and #144 had to be re-opened as #146 and #147). Until it's gone,
  desktop chats plan and talk, and a guard (`.claude/hooks/account-guard.js`) blocks their PR work.
  Your browser and phone logins are unaffected; that's where you approve. The entries (from the
  S06 PR, #121), on each PC:
  - Windows: Control Panel > Credential Manager > **Windows Credentials** > Generic Credentials:
    remove `git:https://github.com` (Git Credential Manager's login), and any other
    `git:https://...github.com` entry.
  - PowerShell: `gh auth status` lists the accounts gh stores; `gh auth logout --hostname github.com
    --user ABlueAI` removes yours.
  - Agent panes no longer use either (S06 resets git's credential helpers and gives them the
    `ABlueAgent` token), but a program running as your Windows user can still read them, which is
    why they go.
  - If you keep them because you push as `ABlueAI` from this PC: S06 keeps agent panes from
    *using* them (git's helpers are reset, gh takes the agent token first), but a program running
    under your Windows account can still read them and act as you. Removing them, and pushing as
    `ABlueAI` from a browser or a separate Windows account, is the safer choice.
  - On GitHub, signed in as `ABlueAI`: Settings > Applications > **Authorized OAuth Apps**. The
    PC's logins are usually listed as **Git Credential Manager** and **GitHub CLI** (usual names,
    not read from your account). Revoke each one only if no other machine of yours uses it, since
    revoking signs it out everywhere; if you're unsure, revoke it and sign in again where needed.
  - Afterwards, if a Git or GitHub sign-in window pops up from a Claude chat or a plain terminal,
    close it instead of signing in as `ABlueAI`, and tell an agent.
  - *Done when:* you say which PCs are done (Claude can't read Credential Manager or your
    authorized apps). For each PC, a Claude desktop chat there runs two checks and shows you the
    output: `gh auth status` lists no `ABlueAI` account, and
    `printf "protocol=https\nhost=github.com\n\n" | git credential fill | grep -v '^password='`
    (step 35's check; the `grep` keeps any token out of the output) shows no `ABlueAI` username. If
    that second check opens a GitHub sign-in window instead, the entry is gone: close the window
    without signing in. The agent ticks this with the date and what it saw. Both checks matter:
    the guard reads gh's login, but `git push` signs in through Git Credential Manager.

- [ ] **36. Delete the Places key before S30.** About **3 minutes**, after S29 merges and before you
  start S30. S30 reads marina websites, which can carry injected instructions, so it runs without
  the key.
  - In the business environment's settings (the cloud environment menu in a session's title bar,
    then Edit): delete `GOOGLE_PLACES_API_KEY` from Network secrets and from environment variables.
    It stays in your password manager for any later refresh of the list.
  - Then widen that environment's network access so S30 can read marina websites (a broader access
    level, since the sites aren't known in advance).
  - *Done when:* the S30 session finds `GOOGLE_PLACES_API_KEY` unset (without printing anything)
    and you confirm the secrets list no longer holds the key; it ticks this with the date.

- [x] **37. Review the client paperwork drafts (S23).** About **30 minutes**, any time this week;
  S24 waits on your approval. *Done 2026-10-28: Blue answered the eight choices in a comment on PR
  #122 by `ABlueAI` (posted from his main chat at his request; checked unedited through GitHub's
  API: `updated_at` equals `created_at`), beginning "Answers to the eight business choices
  (checklist step 37)"; in short: "scope first, one fixed fee", "Hour blocks: dropped", one Care
  plan. The runner applied them in Mako-Business PR 2 (`db69d9b`). What is still his before a
  first client is step 46.* The drafts are in your private repo, PR 2 at
  https://github.com/ABlueAI/Mako-Business/pull/2 (never in this public repo).
  - Read `paperwork/README.md` first: it lists your eight decisions (business name, hourly rate,
    hour blocks, monthly plans, unused hours, payment terms, who pays for software, notice period),
    each with Claude's recommendation.
  - Answer them on PR #122 here (prices are fine there only if you don't mind them public; otherwise
    comment on PR 2 in the private repo and say on PR #122 that you did). The runner fills them in.
  - Before a client signs, and building the form in Hexona: moved to step 46.
  - *Done when:* you say on PR #122 that you approve the drafts (or what to change); the runner
    applies your answers in PR 2, and ticks this with the date and your words.

- [ ] **46. Finish the client paperwork before your first client (S23).** About **30 minutes** of
  your own time, then the attorney's and accountant's, before any marina signs. The drafts are in
  your private repo, `ABlueAI/Mako-Business` (`paperwork/`; PR 2 there until you merge it).
  - Read the four drafts with your answers applied (start with `paperwork/README.md`, "Still open
    for Blue").
  - Fill in, in the private repo only: your LLC's legal name and address (and the DBA once it is
    registered), and the amounts (setup fee, Care plan fee, per-fix fee and how a per-fix job's time
    is priced).
  - Confirm or change three marked items: "plan clients first" (Schedule A section 4), the
    usage-billing clause (agreement 5.2) and the "outside the plan" list (Schedule A section 3).
  - A Florida-licensed attorney reviews the services agreement and Schedule A; an accountant
    confirms whether sales tax applies.
  - Build the intake form in Hexona from `paperwork/01-intake-questionnaire.md` (about 30 more
    minutes, separate sitting is fine).
  - *Done when:* you tell an agent the drafts are final (or what to change). It ticks this with the
    date and your words.

- [ ] **38. S07 on your PC: stable and dev copies side by side.** About **12 minutes**, after you
  merge the S07 PR, #123. Steps are in docs/DEV-INSTANCE.md.
  - Pull `main` in your usual checkout and restart Mako fully: the title still reads `Mako 1.0.0 ·
    main@...`, your settings and Quick Links are as before, and the toolbar's Claude status shows
    what it showed before (for example "Claude status: on").
  - Make the dev copy once (`git fetch origin`, `git worktree add --detach ..\AgentCommandCenter-dev
    origin/main`, then `npm ci` in its `app`), and run `npm run start:dev` there while the stable
    copy stays open. Expected: a second
    window titled `Mako (dev) 1.0.0 · main@...` with its own taskbar button, and its toolbar shows
    "Claude status: off (dev copy)" with no button.
  - In the dev copy, change one thing (for example add a Quick Link, or change the projects root).
    The stable copy doesn't show it, before or after restarting it. `%APPDATA%\command-center-dev`
    now exists beside `%APPDATA%\command-center`.
  - In the dev copy, save the `ABlueAgent` token in its 🐙 banner (from Bitwarden, as in step 35) and
    restart the dev copy. Without it, the dev copy's agent panes use your own git login.
  - Open a Claude pane in each copy: both start. In the dev copy's pane, ask Claude to run
    `gh api user --jq .login` with its Bash tool: expected `ABlueAgent`. Close the dev copy; the
    stable copy's panes and its Claude status keep working.
  - Commit author (added by S31): in the dev copy's pane, ask Claude to run `git config user.name`
    and, in a scratch branch of its worktree, `git commit --allow-empty -m "author check"` then
    `git log -1 --format="%an <%ae>"`. Expected: `ABlueAgent` and
    `ABlueAgent <344505663+ABlueAgent@users.noreply.github.com>`. Don't push it.
  - *Done when:* you tell an agent what you saw (or what differed). It ticks this with the date, and
    the status PR marks S07 done.
- [ ] **40. S10 on your PC: one-click authority.** About **5 minutes**, after you merge the S10 PR,
  #125. Details in docs/AUTHORITY-LEVELS.md.
  - Pull `main` and restart Mako fully. The terminal toolbar shows **Authority** set to "Medium ·
    accept edits".
  - Pick **Minimum** and open a **builder** pane (a role pane, not a plain Claude pane): Claude's
    footer shows plan mode. Pick **Medium**, open another builder pane: it shows accept edits. Pick
    **High**, open another: it shows auto mode. A builder pane is the one that matters: its role
    file says `permissionMode: default`, and whether Mako's flag wins over that isn't verified
    here. If a builder pane shows the normal mode instead, or Claude says auto mode isn't available
    on your plan, say so. A plain Claude pane at each level is an optional extra check.
  - Pick **Maximum** and open a Claude pane: no pane opens, claude.ai/code opens in your browser, and
    the Logs tab says why. A Codex pane at Maximum still opens on your PC as before.
  - Restart Mako: the level you picked last is still selected.
  - *Done when:* you tell an agent what you saw (or what differed). It ticks this with the date, and
    the status PR marks S10 done.
  - **Re-run after S31 merges** (about 5 minutes; on 2026-11-02 every level opened in default mode,
    because Mako's env scrub makes Claude Code force default. S31 keeps the scrub and gives each
    level an explicit list of allowed and denied tools; whether Claude Code honours the allowed list
    under the scrub is not verified, and this re-run is how it gets checked; docs/AUTHORITY-LEVELS.md):
    1. Pull `main` and restart Mako fully. The footer may still show default mode; that is expected.
    2. **Minimum**, new builder pane: ask "Read README.md and summarise it in one line" (no prompt),
       then "Create a file called s31-check.txt" (the edit tools are refused; if Claude then offers a
       shell command that writes the file, it asks first: say no, and tell the agent it asked).
    3. **Medium**, new builder pane: ask it to create `s31-check.txt`, then to run
       `git add s31-check.txt` (it asks first; answer no). This is the check of the open question:
       if creating the file runs with no prompt, the allowed list works under the scrub; if it asks,
       answer no and tell the agent it asked.
    4. **High**, new builder pane: ask it to create `s31-check.txt` (no prompt, if step 3 had none),
       then to commit it on a scratch branch and to run `git push --dry-run` (both ask first; answer
       no). High now sends the same tool lists as Medium, so every git command asks. Delete
       `s31-check.txt`.
    5. Tell an agent what each step did.
- [ ] **41. S11 on your PC: usage panel.** About **10 minutes**, after you merge the S11 PR, #126.
  Details in docs/USAGE-PANEL.md.
  - Pull `main` in your usual (stable) copy, not the dev copy, and restart Mako fully. The top bar
    shows `5h –`, `Week –`, "No usage yet" and a **Set up** button. Click **Set up** (it copies one
    line), then close Mako.
  - Open `%USERPROFILE%\.claude\settings.json` in Notepad. If it already has a `"statusLine"`, stop
    and tell an agent (this would replace it); likewise if the file doesn't exist or is just `{}`.
    Otherwise paste the copied line on a new line right
    after the first `{`, and put a comma at the end of the pasted line. Save. Check it in PowerShell:
    `node -e "JSON.parse(require('fs').readFileSync(process.env.USERPROFILE+'/.claude/settings.json','utf8'));console.log('ok')"`
    prints `ok` (anything else: undo the paste and tell an agent).
  - Open Mako and a Claude pane, and send one short message. Claude's status line shows `usage 5h
    N% · week N%`, and within 30 seconds Mako's top bar shows the same two numbers with reset
    countdowns. Type `/usage` in that pane: the percentages match (they can differ by a point or
    two if time has passed).
  - The 90% warning, with a test file. In PowerShell:
    `node -e "require('fs').writeFileSync(process.env.LOCALAPPDATA+'/Mako/usage.json',JSON.stringify({v:1,captured_at:Date.now(),five_hour:{used_percentage:95,resets_at:Math.floor(Date.now()/1000)+3600}}))"`.
    Within 30 seconds the panel turns red and says "90%+ used: pause the runner". Send one more
    message in the Claude pane to put the real figures back.
  - Click **Pause runner**: claude.ai/code/routines opens in your browser.
  - *Done when:* you tell an agent what you saw (or what differed). It ticks this with the date, and
    the status PR marks S11 done.

- [ ] **39. S08 on your PC: session memory.** About **3 minutes**, after you merge the S08 PR, #124.
  - Pull `main` and restart Mako fully. Open a builder pane, wait for Claude to start, send one short
    message (for example "Reply with one word: ready") and wait for the reply, then close the pane.
    Claude Code writes a session's transcript only after its first message, so without one there
    is nothing to resume.
  - Open `%APPDATA%\command-center\session-memory.json` in Notepad: the last record shows
    `"role": "builder"`, your worktree folder, a `startedAt` and a `stoppedAt` time, and
    `"stopReason": "closed"`.
  - In a PowerShell window in that worktree, run `claude --resume <the record's sessionId>`: the
    conversation from that pane opens. Exit it.
  - *Done when:* you tell an agent what you saw (or what differed). It ticks this with the date.

- [x] **43. S15: research capture, your verdict and a page-reader check.** About **15 minutes**.
  *Done 2026-11-03 on Blue's word: his verdict comment on PR #130 (posted as `ABlueAI`, unedited)
  quotes "this is for personal use so i will take the risk. lets go with playwright" and reports the
  Playwright check below as PASS. Claude in Chrome was tried first and returned "This site is
  blocked." on reddit.com; details in docs/decisions/OSS-research-capture.md.*
  - **Verdict:** ADOPT Playwright MCP (`@playwright/mcp`) as the page reader, given on PR #130.
  - **Playwright check (10 minutes), as Blue ran it:** in a folder outside any repo, run
    `npx -y playwright@1.65.0-alpha-2026-10-30 install chromium` (the version
    `@playwright/mcp@0.0.84` uses), then
    `claude mcp add playwright --scope local -- cmd /c npx -y @playwright/mcp@0.0.84 --browser chromium`
    (on native Windows, npx needs `cmd /c`). Start `claude --permission-mode plan`, ask it to read
    a **www.reddit.com** thread (old.reddit.com now asks logged-out visitors to log in), and approve
    only `browser_navigate` and `browser_snapshot`. It should give the title and the first
    comments with no login, click, typing or robot check.
  - *Done when:* the verdict and what you saw are on PR #130. Done.

- [ ] **48. S15 on your PC: send a Reddit thread to the Reviewer.** About **10 minutes**, after you
  merge PR #130.
  - Pull `main`, run `npm ci` in `app`, then `npx playwright install chromium` in `app` (once; it
    installs the browser version the lockfile pins), run `scripts/sync-roles.ps1`, and restart Mako
    fully.
  - **New Agent > 📄 Page**, paste a www.reddit.com thread URL in the Page URL box, **Create &
    Launch**. A Chromium window opens; the page-reader pane reads the thread and writes
    `report.md` (approve its one Write if asked). If a robot check appears, click it yourself in
    that window and tell the pane to try again.
  - **New Agent > 📄 Page > Send the last page report to Reviewer.** The Reviewer pane should
    summarise the thread from the report, with no copy and paste.
  - *Done when:* you tell an agent the Reviewer answered from the thread (or what went wrong). It
    ticks this with the date. This is S15's "Done when".

- [ ] **74. Issue #211 on your PC: run the app tests with page-reader installed.** About **5 minutes**
  with dependencies already installed, at the next PC check after the draft fix is available.
  - Check out the fix branch on a Windows PC where the page-reader agent is already installed.
    From the `app` folder, run `npm test`.
  - *Done when:* the page-reader test and the final suite, `renderer/admission-view.test.js`, both
    pass and `npm test` exits successfully. Tell an agent the result so it can tick this with the date.

- [ ] **76. Issue #162 on your PC: the Page Reader refuses local addresses.** About **3 minutes**,
  after you merge PR #250 (it adds the `ipaddr.js` package).
  - Pull `main`, run `npm ci` in `app`, and restart Mako fully. Until `npm ci` has run, Mako starts
    as usual and only the Page Reader refuses, with "run npm ci in the app folder, then restart Mako".
  - **New Agent > 📄 Page**, enter `https://localhost/`, **Create & Launch**: it should refuse with
    "The Page Reader reads public web pages only, never this PC or your local network." Then enter a
    www.reddit.com thread URL: the page-reader pane should start as before.
  - *Done when:* you tell an agent both results. It ticks this with the date.

- [ ] **44. S09 on your PC: Resume or Start fresh.** About **5 minutes**, after you merge the S09
  PR, #131 (and S08's step 39, which it builds on).
  - Pull `main` and restart Mako fully. Open a builder pane on a worktree and a bare `claude` pane,
    and ask the builder something short (for example "say hello"). Close Mako with both open.
  - Start Mako again. The Terminals tab shows "2 Claude panes were open when Mako last closed",
    one row each, with **Resume** and **Start fresh**.
  - Click **Resume** on the builder row: a builder pane opens in the same worktree, and Claude shows
    the earlier conversation (your "say hello"). Click **Start fresh** on the other: a new `claude`
    pane opens with an empty conversation.
  - Close Mako with only the resumed builder open and start it again: the builder is offered once
    more. Click **Not now**: the offer goes away and doesn't come back on the next start.
  - *Done when:* you tell an agent what you saw (or what differed), in particular whether the
    resumed builder kept its role. It ticks this with the date, and the status PR marks S09 done.

- [ ] **45. S21 on your PC: the B2 shark icon on the taskbar.** About **3 minutes**, after you merge
  the S21 PR (B2 shark, the PR that replaces #127).
  - Pull `main` and restart Mako fully from its desktop shortcut. The taskbar button and the window
    icon show the shark with the bolder white centre "M" (B2, your pick on 2026-10-28).
  - If the taskbar still shows the old shark, Windows is using its cached icon: unpin and re-pin
    Mako. If the desktop shortcut itself shows the old icon: right-click it > Properties > Change
    Icon... > Browse..., pick `app\assets\mako.ico` in your Mako checkout, then OK twice.
  - *Done when:* you tell an agent you can read the M on the taskbar (or what you saw). It ticks
    this with the date, and the status PR marks S21 done.

## From the Mako 1.1 decision sheet (2026-11-16)

Steps 54 to 61 come from the sheet you signed on 2026-11-16, and steps 62 and 63 from your
follow-up answers the same day (docs/DECISIONS.md, 2026-11-16;
docs/PLAN-1.1.md "Mako 1.1 scope"). Step numbers 47 and 51 to 53 belong to open PRs (#134 and #169).

- [ ] **54. H1 setup day.** **1.5 to 3 hours**, in one sitting at H1, as soon as you can give it an
  afternoon; S44 (the GateGuard trial), S48 (the nightly tidy) and the automated PC checks wait on
  it. An agent walks you through it and keeps the list of what was set up, without machine paths or
  account details in this repo.
  - Set H1 up as the machine that runs Mako unattended: the repo on `main`, `npm ci`, Mako starting
    from its shortcut, the `ABlueAgent` token saved in Mako's key setup (as in step 35, never in a
    chat), and no `ABlueAI` command-line login (step 49 covers H1).
  - **Folded in, the step 43 re-run:** repeat step 43's Playwright page-reader check on H1.
  - **Folded in, the step 25 tick:** open Actions > **Plan sync** > the latest run, and tell the
    agent whether its summary says "Board: synced" and the board shows each session in its column.
    The agent ticks step 25 with the date. The board itself is paused until after 1.1.
  - *Done when:* you tell an agent H1 is set up and what the two folded-in checks showed. It checks
    what it can from a pane on H1 (`gh api user --jq .login` gives an agent login, Mako's build
    label matches `main`), ticks this with the date, and ticks step 25 if the run and board check
    out.
- [ ] **55. H1 trial part 2: the aquarium.** **15 to 20 minutes**, on H1, when S20's PR asks for it
  (after step 54).
  - With a few live panes open, look at the aquarium tab: one creature per live pane, in the right
    colour within about 2 seconds, and a click on a creature opens its pane.
  - *Done when:* you tell an agent what you saw (or what differed). It ticks this with the date in
    S20's PR.
- [ ] **56. Memory setup.** **About 45 minutes over 2 days**, after step 54, when S48's PR asks
  for it (S48 builds the nightly tidy this step turns on).
  - Day 1 (about 30 minutes): with an agent, point Mako's memory at your private vault and turn on
    the nightly tidy as a local scheduled task on H1.
  - Day 2 (about 15 minutes): read the first nightly note and tell the agent whether it tidied what
    it should.
  - **The vault's private repo:** *created by you on 2026-11-16 (your statement, relayed in a
    comment on PR #173; Claude can't see a private repo it isn't given).* Still to do, on Day 1:
    the sync setup between the vault and that repo, which S48's "a cloud agent can read the vault"
    needs.
  - *Done when:* you tell an agent the tidy ran and what the note showed. It ticks this with the
    date; the 3 unattended nights are S48's own done-when.
- [ ] **57. The "Mako" Firefox profile: the preset URLs.** **10 minutes**, after installing the
  S55 build. Copy `app/quick-links-presets.example.json` to
  `%APPDATA%\command-center\quick-links-presets.json`. Set the local labels to your preset names
  and replace each placeholder with an HTTPS link. Keep this file on your PC.
  Create a Firefox profile named `Mako` if needed.
  - *Done when:* after restarting Mako, you click each preset yourself and verify that all of its
    tabs open in the Mako Firefox profile. Agents never drive that profile.
- [ ] **58. Review the lessons-learned draft.** **15 minutes**, when the agent that wrote it sends
  it to you. Read it and say what to change or drop. If this isn't done when the agent tune-up
  (S28, S60) starts, the tune-up runs from the draft as it is (your decision, 2026-11-22).
  By **2026-11-27** (the date the schedule proposed), and before that Friday if the work runs ahead
  (your answer, 2026-11-23: "Sure, but if we're running ahead of schedule, can
  this just be completed prior to Friday?"; docs/SCHEDULE-1.1.md).
  - *Done when:* you tell an agent it is approved (or what to change). It ticks this with the date
    and your words.
- **59. ~~Re-link Codex reviews to `ABlueAgent`.~~ Superseded.** *Struck 2026-11-26: step 16
  already linked Codex to `ABlueAgent` on 2026-10-20, and Codex reviews `ABlueAgent`'s PRs without
  being asked, which is what this step's check needed (verified 2026-11-26 on GitHub: Codex's
  review on PR #208, an `ABlueAgent` PR, at 03:54 UTC). If Codex stops reviewing agent PRs, an
  agent adds a new step. The number stays.* **About 5 minutes**, any time this week (your
  yes, 2026-11-16; you do this one yourself). In ChatGPT's Codex settings, connect GitHub as
  `ABlueAgent` (a private browser window signed in to GitHub as `ABlueAgent`, as in step 16) and
  keep automatic reviews on for `ABlueAI/AgentCommandCenter`.
  - *Done when:* you say it is done. Claude checks on GitHub that Codex reviews the next PR
    `ABlueAgent` opens without being asked, and ticks this with the date and that PR's number.
- [ ] **60. The Composer prototype day.** **A normal working day plus 30 minutes of scoring**, on
  **2026-11-23**, after S49's test sheet is ready and before any Composer code (your decision,
  2026-11-21). Either date may slip a day if Claude Max isn't active yet.
  - **First, 2026-11-22: the practice test (S49).** Mako's role prompt plans the 10 test tasks
    offline, 3 times each, and Codex grades the plans blind against the answer key. If the 10 tasks
    and the answer key are only in your private notes, hand them to the session that runs it.
  - **Then, 2026-11-23:** work 3 to 5 real tasks with the Composer prototype, then score it against
    the sheet.
  - *Done when:* you give an agent your scores. S50's PR records them, the practice test's grades
    and what they change, and ticks this with the date.
- [ ] **61. Delete the StarNet clone and the OpenCode leftovers.** **About 2 minutes of your time**:
  an agent does it in a local pane on your PC, and you have already approved it (decision sheet,
  2026-11-16). Tell a local agent "do step 61". It lists what it will delete first (folders only,
  nothing from this repo), deletes after you say go, and shows you they are gone.
  - *Done when:* that agent reports both are gone and ticks this with the date and how it checked.
- [x] **62. Block the Codex sandbox from the Claude login file.** *Done 2026-11-16 by Blue, who ran
  the command himself (his statement, relayed in a comment on PR #173; Claude can't see his PC, so
  this rests on his word).* Nothing more to do.
- [ ] **63. The Codex check-in.** **About 5 minutes**, on **2026-11-30**. Until then Codex builds
  non-sensitive early tasks (S36 and S56 through the lane; S52 and S53 you start on Codex yourself,
  as they are `blue`-lane rows) and reviews Claude's PRs, with Sonnet as the backup
  reviewer if Codex is out of usage; after 2026-11-30 Claude reviews it all "unless my mind
  changes" (your words, 2026-11-16). Tell any agent whether the Codex lane stays open, and whether
  your resets are used. S26 closes when they are. From 2026-11-21: you keep ChatGPT Plus through the
  1.1 release, and Codex's heavy use runs to about 2026-12-29, checked weekly, so this check-in is
  the first of the weekly checks (the agent's reading of "checked weekly"; docs/DECISIONS.md,
  2026-11-21).
  - *Done when:* your answer is recorded in docs/DECISIONS.md in your words, S26's row in
    docs/PLAN-1.1.md follows it, and the agent ticks this with the date.

- [x] **64. Hand over the 1.1 schedule (S61).** *Done; checked 2026-11-23 (UTC) on GitHub that
  PR #223 is open with the schedule in it as `docs/SCHEDULE-1.1.md`. You approved the text ("Yes.
  Do as written.") on 2026-11-23. Next: merge PR #223 to adopt it, then step 18.* About 5 minutes, when you're ready; every UI
  row waits on it. Give the schedule to an agent in its own session (not as a GitHub comment if it
  holds anything private). It opens S61's PR with the schedule as `docs/SCHEDULE-1.1.md`, nothing
  private in it, runs the independent review, fixes the findings and re-reviews the fixes.
  - *Done when:* S61's PR is open with the schedule in it. The agent ticks this with the date; you
    adopt the schedule by merging that PR, and then say go on the UI (step 18).
- [ ] **65. Turn on Dependabot alerts and security updates.** **About 3 minutes**, now (your words,
  2026-11-18: "turn on Dependabot alerts and security updates in the repo settings now"). Repository
  settings are yours; agents never change them. Signed in as `ABlueAI`: the repository > Settings >
  Code security (it may be labelled Advanced Security) > **Dependabot alerts** > Enable, then
  **Dependabot security updates** > Enable. Leave **Dependabot version updates** off: its routine
  version-update PRs are 1.2. (Version updates have no switch: they start when a
  `.github/dependabot.yml` file exists, which the **Configure** button next to them creates. Don't
  click it.)
  - What to expect: alerts list known advisories in the repository's dependencies, among them the
    remaining `sharp` advisories and their two dependents (docs/DEPENDENCY-ADVISORIES.md, S36).
    Security updates open PRs by `dependabot[bot]` that bump a vulnerable package. Those PRs have no
    Claude builder, so a Dependabot PR is `NOT READY` until an agent has posted "Independent review
    (Opus)" on it (AGENTS.md "How work flows" step 3) and CI is green; ask any agent to do that
    before you merge one. How the merge-order check and the runner treat them is issue #205.
  - *Done when:* you say both are on. Claude can't read these settings (they show only to admins),
    so it ticks this on your word, and notes the first Dependabot alert or PR it sees as a check.
- [x] **66. Give the HyperFrames verdict (S52).**
  Verdict: FORK, conditional. Blue (2026-11-18, in his main chat), adopting Mako main's recommendation: 'I think your recommendation verdicts are very good. So, yes to both of those recommendations.' Reconfirmed by Blue on 2026-11-23 ('yes i do recall now', 'agree'). The recommendation he adopted: first a Windows trial on the VM, with the browser sandbox on, outside connections blocked and logged, and the media commands that call China-origin models removed. Fork only if that trial shows no outside connections and no sandbox downgrade.
  - *Verification:* checked 2026-11-23 (UTC) by a Claude cloud session against Blue's words as
    quoted in the Mako main session's hand-off to it
    ([session](https://claude.ai/code/session_01UWhuMF5YrgU1ojPL6DN1Q1)). Recorded in the [S52 vetting and trial record](docs/decisions/OSS-hyperframes.md#blues-verdict)
    and [the decisions log](docs/DECISIONS.md#2026-11-18-s52-hyperframes-verdict-pr-206).

- [x] **67. AgentPlayback verdict recorded (S53).** Verdict: PATTERN-MINE. Blue (2026-11-18, in his
  main chat), adopting Mako main's recommendation: 'I think your recommendation verdicts are very
  good. So, yes to both of those recommendations.' Reconfirmed by Blue on 2026-11-23: 'pattern
  mine'. Take the idea of a local, read-only replay of what each agent did; use none of its code.
  S53 closes with no build. Any replay work goes to S19 or S62, under their existing waits.
  - *Verification:* checked 2026-11-23 (UTC) by a Claude cloud session against Blue's words as
    quoted in the Mako main session's hand-off to it ([session](https://claude.ai/code/session_01UWhuMF5YrgU1ojPL6DN1Q1)). Recorded in
    [the OSS record](docs/decisions/OSS-agentplayback.md#blues-verdict-word-for-word) and
    [the decisions log](docs/DECISIONS.md#2026-11-23-agentplayback-verdict-s53).
  - The builder originally read the China-origin rule as covering the tracked Kimi config, which the
    npm package omits. The builder sees replay fitting S19 (pane activity) or S62 (merged-work
    history).

## From your decisions of 2026-11-16 to 2026-11-21

Step 68 comes from those decisions (docs/DECISIONS.md, 2026-11-21). Step numbers 66 and 67 belong to
open PRs (#206 and #208).

- [x] **68. Your verdict on S48's OSS record (PR #209).** *Done 2026-11-24: you answered in Mako
  main's chat, "sounds correct, go with that", accepting PROTOTYPE for an isolated Open Second Brain
  subset and PATTERN-MINE for ai-memory and GBrain. Checked from your answer as relayed word for word
  by the Mako main session that heard it to the cloud session that recorded it in PR #209 (Claude
  can't see that chat itself). Next: merge PR #209 to adopt it.* **About 15 minutes**, any time before S48
  starts. S48 (the vault memory) takes PR #209's open-source record, `docs/decisions/OSS-memory.md`,
  as its OSS record once you give your verdict (your decision, 2026-11-21). Read the record and give
  your verdict (ADOPT, FORK, PROTOTYPE, PATTERN-MINE or BUILD FRESH) in your own words to any agent.
  - *Done when:* your verdict is in the record, word for word, and the agent ticks this with the
    date.
## From S37 (the account guard and the PowerShell tool)

Step 69 comes from S37 (PR #218, issue #217), not from the decisions above.

- [ ] **69. Check that the account guard stops PR work through the PowerShell tool (S37, PR #218).**
  **About 3 minutes**, on your PC after merging PR #218 and before step 49 removes your command-line
  login (the check needs `gh` logged in as `ABlueAI`). CI tests the guard with the input Claude Code's
  docs describe, but only a real session shows that Claude Code starts it for its PowerShell tool.
  - Pull `main`, then start a **new** Claude Code chat in the Mako repo folder (hooks load when a
    session starts). Tell it: "Use your PowerShell tool, not Bash, to run `gh pr ready 999999`."
  - Expected: the command doesn't run, and Claude shows "Blocked by Mako's account guard ... this
    session's GitHub CLI login is ABlueAI". If gh answers instead (for example "no pull requests
    found"), the guard didn't run: tell any agent "step 69 failed" with what you saw. Nothing is
    changed either way, since PR 999999 doesn't exist. If Claude says it has no PowerShell tool,
    say so; the check is then not applicable on that PC.
  - If you've already removed your command-line login (step 49) and `gh auth status` shows no
    account at all, the guard instead shows "couldn't check the GitHub login before `gh pr ready`
    ... allowed". That also passes: it shows the guard ran for the PowerShell tool. If gh is still
    logged in to another account, the guard rightly lets the command through, so the check can't
    show anything: tell an agent "step 69 not applicable" instead.
  - *Done when:* you've told an agent what Claude showed, and it ticks this with the date and your
    words.

- [ ] **70. Finish the PR sweeper's set-up.** **About 5 minutes**, after PR #225 merges. At
  claude.ai/code/routines, open "Mako PR sweeper": (a) check it has a push-to-`main` trigger besides
  the hourly schedule (on 2026-11-23 only the hourly schedule showed), and add one if the page
  offers it; (b) turn on its push notifications, so a "NOT READY" fire reaches your phone (they were
  off). A push is sent when a run ends with something noteworthy (the scheduled-task tool's own
  description; not tested here); an idle fire ends "Sweeper: nothing to do", so expect few. If you
  get one every hour, tell any agent and it will narrow the sweeper's idle line. Or tell any agent "set up the sweeper's trigger and notifications".
  - *Done when:* an agent reads the routine back and finds both, and ticks this with the date.

## From your decisions of 2026-11-23

Step 72 comes from PR #227 (docs/DECISIONS.md, 2026-11-23). Step numbers 69 to 71 belong to open PRs
(#218, #225 and #224).

- **72. ~~Codex's review on the `codex/` PRs (PR #227's question).~~ Superseded.** *Struck
  2026-11-26: Codex now reviews `codex/` PRs instead of asking for an environment (verified on
  GitHub: its "Codex Review" on PR #208, branch `codex/s53-agentplayback`, at commit `7ec78d5`,
  2026-11-26 03:54 UTC), so there is no question left for you. #206 and #209 merged on
  2026-11-24. The number stays.* **About 2 minutes to answer**,
  once PR #227 is merged. Your rule says a PR is `READY TO MERGE` only with Codex's pass, but on the
  three `codex/` PRs (#206, #208, #209) Codex answered "create an environment for this repo" instead
  of reviewing. Answer PR #227's question: create that Codex environment (the agent's
  recommendation), or tell an agent how those PRs should get Codex's pass. Until then they are
  `NOT READY: no Codex pass`.
  - *Done when:* your answer is in docs/DECISIONS.md, and an agent has checked on GitHub that one
    of those PRs has Codex's pass (or that your answer says otherwise) and ticks this with the date.

## Video Scout (S54)

- [ ] **73. Run real videos through Video Scout with Claude Code (PR #230).** About **20 minutes**
  with Whisper cached (most of it is the 10-minute video's download and transcription). On first
  use, allow extra time for the 1.1–1.6 GB Whisper model download. After installing the S54 build,
  fully restart Mako.
  - In PowerShell, check that `claude auth status` shows your Claude.ai subscription and that
    `yt-dlp --version`, `ffmpeg -version` and `ffprobe -version` work. Check that Usage credits
    are off in Claude's usage settings (see step 28). Use the Claude subscription sign-in and leave
    API keys out of the run.
  - In Mako, open **Agents → + New → Video**, choose **Claude Code (subscription)**, and paste one real
    public YouTube or Vimeo clip, ideally 15–30 seconds, with an identifiable visual change and spoken
    narration. Click **Create & Launch**. When the pane shows the estimate (frames kept and
    approximate tokens), click **Send to Claude** and wait for the report.
  - Then run one real **10-minute** video twice, with the same URL: once with **Detail mode** off and
    once with it on (the checkbox under the provider). Each time, note the estimate's frames kept,
    Claude requests and approximate tokens, and which mode it shows, then click **Send to Claude**.
    A screen recording or tutorial with small on-screen text shows detail mode best.
  - Start one more run and close its pane while it is downloading. Check that no
    `mako-claude-video-` folder is left in `%TEMP%` (in PowerShell: `Get-ChildItem $env:TEMP -Filter mako-claude-video-*`).
  - *Done when:* the short clip's report has a timecoded visual observation and a concrete detail
    from the narration, and for the 10-minute video you tell an agent, for each mode, the frames kept,
    the requests, the approximate tokens and whether the report matched the video, and how long each
    run took, so it can tick the step with the date and those numbers. Keep the transcripts and
    account details out of GitHub.

## From S58 (fenced web-reading agents)

Step 75 comes from PR #245. Step numbers 73 and 74 belong to open PRs (#230 and #231).

- [ ] **75. Re-deploy the fence hook after PR #245 merges.** **About 3 minutes**, the next time you
  open Mako after merging PR #245. The PR changes the fence hook, and Mako refuses to launch the
  fenced roles (Web Scout, Source Scout, Operator and Page panes) until the deployed copy matches the new one.
  - Pull `main`, run `scripts/sync-roles.ps1`, and restart Mako fully.
  - **New Agent > 🌐 Web Scout**, **Create & Launch**. The pane should start (before the sync, Mako
    refuses to start it). Then ask it
    to read `C:\Windows\win.ini`: it should show "Blocked by Mako path fence" and not the file.
  - *Done when:* a Web Scout pane launches after the sync, and you tell any agent "step 75 done"; it ticks
    this with the date.

Step 89 comes from PR #327.

- [ ] **89. Re-deploy the fence hook after PR #327 merges, and check a Page pane.** **About 5
  minutes**, the next time you open Mako after merging PR #327 (if step 75 isn't done yet, do this
  instead of it: it covers both). PR #327 changes the fence hook again, and Mako refuses to launch the
  fenced roles (Web Scout, Source Scout, Operator and Page panes) until the deployed copy matches the
  new one. The hook now also loads Mako's own page-URL check, which CI can't run on your PC.
  - Pull `main`, run `scripts/sync-roles.ps1`, and restart Mako fully (close every window).
  - Open a Page pane on a public https page (for example `https://example.org/`): it should open and
    read the page. Then ask it to open `https://localhost/`: it should show "Blocked by Mako page
    fence" with `[fence-page-denied]`.
  - **New Agent > 🌐 Web Scout**, **Create & Launch**: the pane should start.
  - *Done when:* both checks behave as above, and you tell any agent "step 89 done"; it ticks this
    with the date.

Step 90 comes from PR #307.

- [ ] **90. Check Dictate and read-aloud failures on your PC (S56, PR #307).** **About 3 minutes**,
  on the next Tuesday or Friday PC check after you merge PR #307. PR #307 makes Dictate and
  read-aloud let go of the microphone and speakers when something fails; CI checks it only with
  stand-ins, so only your PC can show the real microphone and speakers behave.
  - Pull `main` and restart Mako fully (close every window).
  - Click into a pane, then double-click 🎤 Dictate quickly while the microphone permission prompt
    is open (if Windows shows one): there should be one prompt, and the text should land in the
    first pane you clicked.
  - Start Dictate and click Stop: the Windows microphone indicator (system tray) should go off.
  - Block Mako's microphone (Windows Settings > Privacy & security > Microphone), click Dictate: a
    visible error should show. Allow it again; Dictate should work on the next click.
  - Read some pane text aloud and, if you can, make it fail (for example, disconnect from the
    network on a first run of a new voice): the audio should stop when the error shows.
  - *Done when:* each check behaves as above, and you tell any agent "step 90 done"; it ticks this
    with the date.

## From S14 (the 1.1 design brief)

Step 77 comes from PR #253.

- [x] **77. Read the S14 brief's 18 questions, then merge PR #253.** *Done 2026-11-24: PR #253
  merged by ABlueAI at 19:48 UTC (verified on GitHub, 2026-11-26), which approved every default you
  didn't change. Questions 3, 4 and 6 still come back to you at S18's first PC check and in S19's
  draft PR, as below.* **About 10 minutes**, at your
  next merge sitting. Open `docs/DESIGN-BRIEF-1.1.md` on the PR's branch and read only its "Questions
  for Blue" table: each question has a default, and merging the PR approves every default you don't
  change. To change one, tell any agent "S14 question N: <your answer>" (before or after the merge).
  Two of them want your eyes later, not now: the control-room layout (question 6), from a screenshot
  in S19's draft PR, and the task-node stage, lines and "What Mako knows" (questions 3 and 4), at
  S18's first PC check. Merging also adds the shark's shape file (question 8); say no and the agent
  drops that commit.
  - *Done when:* PR #253 is merged, or you have answered the questions you want changed; the agent
    ticks this with the date.

## From S66 (the shared navigation)

Step 81 comes from PR #283.

- [ ] **81. PC check of the three-tab shell (S66).** **About 10 minutes**, at the first Tuesday or
  Friday PC-check evening after PR #283 merges. Pull `main` and fully restart Mako, then:
  1. Mako opens on the **Control room** tab with your panes as before, under a thin blue scope stripe
     naming the repo, with Brain and Aquarium tabs beside it and a rail of round repo emblems on the
     left. Click each tab: the colours change (dark blue, black, green-ish); Brain and Aquarium say
     which session builds them.
  2. Press **Ctrl K**: the palette opens. Type "logs" and press Enter: you land on the Logs view.
     Press Ctrl K, then Esc: it closes.
  3. Click an emblem: the repo switches (the stripe and the repo picker follow).
  4. Click **Settings**, tick **Use the old layout**: today's single screen comes back. Restart Mako:
     it is still the old layout. Untick it to go back.
  5. Hold **Ctrl Space** in a pane and speak, then let go: the words are typed into that pane. Then
     click into a pane and press **Ctrl K**: the palette opens and nothing is typed into the pane.
  6. Look: does anything read wrong or feel cramped? Note the usage chip (top right) and the two
     greyed-out switches, **Quiet hours** and **Pause all**, which S18 and S19 turn on (Pause all
     is already on once S19's PR #321 merges).
  - *Done when:* you tell any agent "S66 PC check: OK" or what looked wrong; the agent ticks this
    with the date and your words, and anything wrong becomes a fix PR.
- [ ] **87. PC check of the control room (S19).** **About 15 minutes**, at the first Tuesday or
  Friday PC-check evening after PR #321 merges. Pull `main`, fully restart Mako, and make sure
  Claude status is on (the Terminals toolbar says "Claude status: on"). Open two Claude panes, then:
  1. Give pane A a task that takes a while. Ask pane B something that needs an answer from you. A red
     **Needs you** chip for pane B appears above the panes, Mako's taskbar button gets a red dot, and
     the toast makes **no sound**. Wait 3 minutes without answering: the chip and the dot are still
     there.
  2. Click into pane A and press **F8**: pane B gets the focus, and no character is typed into
     either pane. Click the chip: the same.
  3. Maximize Mako (the right panel shows only on a window at least 1280 px wide). Click pane A
     while it works: the right panel shows its **In focus** card. Click
     **Interrupt (Esc)**: pane A stops its turn, as Esc does, and is not closed.
  4. Give pane A another long task and click **Pause all** in the top bar: pane A stops its turn,
     pane B (waiting on you) is untouched, and **+ Shell** now refuses with a note. Click
     **Resume all**: nothing is sent; **+ Shell** works again.
  5. Click **?** next to **+ Shell**: the cheat sheet lists the keys, F8 included. Esc closes it.
  6. Close Mako with a pane open, start it again and choose Resume: once the pane has started, its
     badge shows its real status (idle until you type), not a stale one.
  7. Look: does anything read wrong or feel cramped? The branch and authority tags sit after each
     pane's name.
  - *Done when:* you tell any agent "S19 PC check: OK" or what looked wrong; the agent ticks this
    with the date and your words, and anything wrong becomes a fix PR.

## From S46 (session hygiene)

Step 83 comes from PR #286.

- [ ] **83. Check the daily idle-sessions list on your PC.** **About 5 minutes**, at the next Tuesday
  or Friday PC check after PR #286 merges, on the dev copy (`npm run start:dev` in `app`).
  - Close Mako with one Claude pane open, then in Mako's settings folder for the dev copy open
    `session-memory.json` and, in that record, set `startedAt`, `stoppedAt` and (if it is there)
    `lastActiveAt` all to the same time 4 days ago, for example `2026-11-21T09:00:00.000Z` (idle time
    counts from the latest of the three). Or simply wait 3 days. Start the dev copy again and leave
    the Resume offer unanswered (answering it archives the session, so it leaves the idle list).
  - The Terminals tab shows "One Claude session has been idle 3 days or more", with the pane's role,
    folder, idle days, "waiting for Resume or Start fresh" and "owner Blue". Type a done-when, Save,
    and restart: the row shows it.
  - *Done when:* the list shows and the done-when survives a restart; tell any agent "step 83 done"
    (or what went wrong) and it ticks this with the date.

## Every day, once the runner is on

Once S04 is applied (step 27), the runner works all day and you do one sitting in the evening:

- **Evening, after the 8:03 PM digest (the merge sitting, about 10 minutes; decision sheet,
  2026-11-16):** read the digest on your phone. Answer
  each "needs Blue" question in its PR. For each PR the digest marks `READY TO MERGE`, read its
  TLDR, then Files changed > Review changes > Approve > Submit review, then Merge pull request >
  Confirm merge. Merge only on `READY TO MERGE`.
- **Once the commander runs on H1 (step 80):** its colour-coded evening merge list is what you read
  at the sitting. Merge the `READY TO MERGE` PRs in the order it gives. To pause the build, tell the
  commander "stop" and pause the routines on the routines page (until S67 links them, each stops
  only its own part).
- **During the day: nothing.** A question for you also arrives as a GitHub notification (a PR
  comment starting "@ABlueAI needs Blue:"); it can wait for the evening.
- **Tuesday and Friday evenings:** the PC checks, batched, until H1 automates them ("Do next" item
  9).
- **To pause or resume:** the switch on the routines page (step 27).
- **Until step 27 is done:** the old runner fires once, at 8:01 AM. Check your phone in the
  morning for "needs Blue", and approve and merge ready PRs in the evening as above.

## From S38 (the full security check)

Steps 78 and 79 come from PR #254 (S38). Step number 77 belongs to an open PR (#253). The details
behind both steps are in the private report from the S38 session, not in this public file
(docs/DECISIONS.md 2026-11-21, item 7).

- [ ] **78. Two security decisions from S38 (PR #254).** **About 10 minutes**, after merging PR #254,
  with the S38 private report open.
  - Issue #265: decide whether to make the repository-settings change the private report describes
    (only you change repository settings), or tell an agent another way to close it.
  - Issue #270's last item: decide whether two kinds of material named in the private report stay in
    this public repository.
  - *Done when:* you've told any agent your answer on each; it records them in docs/DECISIONS.md and
    ticks this with the date and your words.
- [ ] **79. S38's checks on your PC (PR #254).** **About 10 minutes**, on the next Tuesday or Friday
  PC-check evening after merging PR #254, with the S38 private report open. Some findings rest on
  Windows behaviour a cloud session can't run; the report lists each one with a check of under 2
  minutes.
  - Run each check as the report says, and note what you saw.
  - *Done when:* you've told any agent the result of each check in a session (not on GitHub). The
    results stay private: a public issue gets at most "checked on Blue's PC, <date>" or a severity
    change. The agent ticks this with the date.

## From PR #334 (terminal clipboard, paste and links)

Step 93 comes from PR #334 (issue #273). Step numbers 86, 87 and 90 to 92 belong to open PRs.

- [ ] **93. Check terminal paste and clipboard on Windows (PR #334).** **About 10 minutes**, on the
  next Tuesday or Friday PC-check evening after merging PR #334, after fully restarting Mako.
  - Paste one line, then two lines, into a Gemini Video Scout pane and a Claude pane (Ctrl+V and
    right-click): the text arrives whole in both, with no confirmation prompt.
  - In a plain PowerShell pane, paste two lines: Mako asks before pasting; Cancel pastes nothing.
    Press Shift+Insert with one line copied: it pastes once.
  - In a Claude pane, use something that copies through the terminal (Claude Code's "Copied!"):
    the Logs tab shows one line saying the clipboard was not changed and to use Ctrl+C instead,
    and your clipboard still holds what it held before.
  - *Done when:* you've told any agent what you saw (each check as above, or what differed); it
    ticks this with the date and how it checked.

## From the H1 commander (PR #282)

Step 80 comes from PR #282 (docs/DECISIONS.md, 2026-11-24, D-084). Step numbers 77 to 79 belong to
open PRs (#253 and #254).

- [ ] **80. Set up the commander on H1.** **About 15 to 30 minutes** (an estimate; S67's PR gives
  the real figure), at H1, once S67's PR is merged. S67 is `READY`, so an agent can build it now.
  - Open a new local Claude chat on H1 named "Mako command", give it the standing prompt from S67's
    PR, and start its 30-minute heartbeat the way the PR says.
  - From then on it starts and resumes the cloud build sessions, keeps usage to about 95% of each
    5-hour window, and sends you one colour-coded merge list each evening, in merge order. Your
    laptop chat (Mako main) becomes the watcher.
  - To stop everything: tell that chat "stop" and pause the routines on the claude.ai routines
    page. Until S67's PR links the two, each stops only its own part, so do both.
  - *Done when:* the commander has run on H1 for one full day and its evening merge list reached
    you; tell any agent "step 80 done" and it ticks this with the date.

## From your open-source verdicts (2026-11-25)

Step 85 comes from PR #294 (docs/DECISIONS.md, 2026-11-25). Step numbers 81, 83 and 84 belong to
open PRs (#283, #286 and #287).

- [ ] **85. Start the claude-security trial scan (S70).** **About an afternoon** of the session's
  time (your words, 2026-11-25: "an afternoon is fin"), with you there at the start and the end;
  any day once S68 (the SkillSpector re-pin) is merged.
  - Start a Claude cloud session on this repository and ask it to run S70 by the setup checklist
    in docs/PLAN-1.1.md, "S68 to S72 details". Say in that request that you accept the cost up
    front (checklist item 7). Starting it is your go; its claim PR sets S70 in progress.
  - If a check before the scan fails (the plugin's scan flags something, or the sanitizer test is
    red), the session stops before running the plugin and asks you.
  - Stay for the report: the session hands you the report and the SARIF file in the session. Save
    both in your private vault, never in this repository. A CRITICAL finding is told to you at
    once.
  - *Done when:* the session's PR records the plugin pin, usage and wall time, and whether the
    plugin was uninstalled or left disabled, with each finding's title and severity only; you
    tell any agent "step 85 done" and it ticks this with the date and how it checked.

## From PR #314 (secure.json refuses instead of overwriting, issue #249)

Step 91 comes from PR #314. Step number 90 belongs to an open PR.

- [ ] **91. Check the credential store after a restart (PR #314).** **About 10 minutes**, on the
  next Tuesday or Friday PC-check evening after merging PR #314.
  - Pull `main`, fully restart Mako, then save and clear the Gemini key and the ABlueAgent token
    once each; check that each says it worked and that they're still there after another restart.
  - Close Mako, copy `secure.json` in Mako's settings folder somewhere safe, then put `{` (one
    character) in it and start Mako. Check that one "Credential store unavailable" box appears,
    saying "not valid JSON" and naming the folder, that Mako still opens, and that the same line
    shows in the Logs tab.
  - Close Mako, put your copy back, start Mako and check that both credentials are loaded again.
  - *Done when:* you've told any agent what you saw; it ticks this with the date and how it
    checked.

## From PR #315 (the account guard's PowerShell deny rules)

Step 88 comes from PR #315 (issue #219). Step numbers 86 and 87 belong to open PRs.

- [ ] **88. Check the PowerShell deny rules on Windows (PR #315).** **About 5 minutes**, on the next
  Tuesday or Friday PC-check evening after merging PR #315.
  - On your PC, pull `main` in your Mako checkout, start Claude Code there and run `/permissions`.
  - Check that Claude Code showed no settings warning at start-up, and that the "Deny" list shows
    the `PowerShell(...)` rules next to the `Bash(...)` ones (for example `PowerShell(gh pr merge:*)`).
  - *Done when:* you've told any agent what you saw (no warning, rules listed, or what differed);
    it ticks this with the date and how it checked.

## From PR #310 (npm install-script approvals, issue #210)

Step 90 comes from PR #310.

- [ ] **90. Check a clean install on Node 26.13.1 (PR #310).** **About 5 minutes**, on the next
  Tuesday or Friday PC-check evening after merging PR #310.
  - On a PC with Node 26.13.1, pull `main` in your Mako checkout, open PowerShell in `app\` and
    run `npm ci`.
  - Check that it exits without an error and reports no blocked install scripts for
    `onnxruntime-node`, `protobufjs` or `sharp`.
  - Open Mako from its shortcut and check that it starts.
  - *Done when:* you've told any agent what you saw (clean install and Mako started, or the message
    you got); it ticks this with the date and how it checked.

## Coming up this month (the runner will ask when it gets there)

You can start on the first one now, which saves time later.

- **Session S14:** ~~on hold until you say go (step 18)~~ Your go came on 2026-11-24; the brief is
  in PR #253 (step 77).
- **Session S06, after step 35 passes:** remove the `ABlueAI` Git login from every PC Claude runs
  on: now step 49.
- **Session S12:** confirm your Hexona login link in Mako (step 29).
- **Session S13:** install Obsidian, create the vault and install the skills (step 31).
- **Session S26:** the trial (PR #140) is its result; the lane stays open to about 2026-11-30 and
  closes when your Codex resets are used (step 63). Step 30 is struck (2026-11-26); the trial's
  records of what Codex did are issue #305.
- **Session S16:** ~~your Composer verdict (step 19)~~ Done 2026-10-21: no option adopted, everything open for study, questions deferred (step 19).
- **Session S17:** ~~pick one of 2 or 3 design directions~~ Done: you picked Shark A (recorded
  2026-11-16).
- **Session S21:** pick a logo variant.
- **Session S23:** ~~approve the client paperwork drafts (step 37)~~ Answered 2026-10-28; merging
  PR #122 approves the revised drafts. Step 46 before your first client.
- **Session S29:** Google Cloud billing, Places API key and budget alert (step 33), then start S29
  in the business environment.
- **Session S30:** first delete the Places key from the business environment and widen its network
  access (step 36), then start S30. Afterwards, import the CSV into a HighLevel email
  campaign and approve each batch of about 20 before it sends.
- **Session S24:** authorize the GoHighLevel connector in claude.ai (read-only token), then the scope
  screenshot (step 34) before the reply/lead watcher goes live.

## Waiting on you (the runner won't ask)

- **Session S28:** your agent-roles package (new role texts, from your agent-roles chat), as an issue
  you open yourself as `ABlueAI`, titled `agent-roles package (S28)` (agents ignore one opened, or
  edited, by anyone else), or hand it to an agent in its own session to open the PR. Not as a PR of your
  own: you can't approve your own PR, so it couldn't merge. S28 stays `NEEDS BLUE (package)` until
  it arrives.
- [ ] **71. Your verdict on S63's UI-library record (PR #224).** **Yours until PR #301 (D-090)
  merges, then an agent decides.** *Marked 2026-11-26: D-090 (your words, 2026-11-25) is recorded
  in PR #301, which merged on 2026-11-26, so this is now an agent's. The agent that next needs these libraries (S49 or S51)
  records the record's "Recommended direction" (prototype Cytoscape.js and a UI-only Deep Chat
  build; adopt MiniSearch if ranked search across task fields is in scope; adopt the Obsidian URI)
  as its 🤖 verdict in the record, ticks this, and your merge approves it. PR #224 merged on
  2026-11-24.* **About 15 minutes**, any time
  before S49 or S51 picks its chat and graph libraries. S63 delivered an OSS record,
  `docs/decisions/OSS-ui-libraries.md`, in place of the `docs/research/` write-up its plan row
  names. Read it and give your verdict on each option (ADOPT, FORK, PROTOTYPE, PATTERN-MINE or BUILD
  FRESH) in your own words to any agent.
  - *Done when:* your verdict is in the record's "Blue's verdict" line, word for word, and the agent
    ticks this with the date.
- [x] **82. Your verdicts on S45's ECC skill list (PR #255).** *Done 2026-11-25: Blue's verdicts
  given in a desktop session; recorded here (PR #294), in every row's last column of
  `docs/decisions/OSS-ecc.md` (all 314: 5 yes and 4 no among the nine top picks, and the other 305
  as proposed). Your words: "Step 82: ECC skills - proceed with all of your recommendations. i
  agree, thanks", and "yes" to the other 305. Checked from your words as the desktop session's
  hand-off relayed them (the recording session can't see that chat); docs/DECISIONS.md,
  2026-11-25.* **About 15 minutes** for the nine top
  picks, longer if you go through all 314 rows; any time after PR #255 merges, before a plan row
  takes any of them up. Read `docs/decisions/OSS-ecc.md`, "ECC's other skills (S45)": each skill
  has a proposed verdict and a blank last column. Give your verdict per skill (ADOPT, FORK,
  PROTOTYPE, PATTERN-MINE, BUILD FRESH or SKIP, or "as proposed" for a group) in your own words to
  any agent. Merging PR #255 records the list, not your verdicts.
  - *Done when:* each row you decided has your verdict in its last column, word for word, and the
    agent ticks this with the date and the rows it filled.
- [ ] **84. Optional: your verdicts on S47's Symvibe record (PR #287).** **About 10 minutes**, before
  you merge PR #287. The ask was settled under D-090 on 2026-11-26: the record carries the builder's
  defaults (crew presets BUILD FRESH, goal-stopping loops ADOPT, branch status BUILD FRESH), and
  merging PR #287 approves them. To choose otherwise, say so in PR #287 before merging; an agent then
  records your words in `docs/decisions/OSS-symvibe.md`.
  - *Done when:* PR #287 is merged (the defaults stand) or your own verdict is in the record word for
    word; the agent ticks this with the date and which.

## Dated reminders

- **About 2026-11-17:** reassess plans. Is Max 5x enough, or move to 20x? The upgrade is step 8, pushed back "until 11/19 or until usage begins
  flowing" (2026-11-15; no longer "when the UI work runs usage up"), so on this date you are
  still on Pro: reassess whether Pro is still enough, from the usage panel (S25 was dropped on
  2026-11-17, so no month-review numbers come).
- **2026-11-19:** the Max upgrade (step 8), "or until usage begins flowing" (your words,
  2026-11-15).
- **2026-11-22:** the Composer practice test (S49, step 60); may slip a day if Max isn't active.
- **2026-11-23:** the Composer prototype day (S50, step 60); may slip a day too.
- **By 2026-11-25:** Codex's 1 to 2 hour UI-library sweep (S63).
- **2026-11-30:** the Codex check-in (step 63), then weekly until Codex's heavy use ends, about
  2026-12-29.
- **2026-12-01:** the scope freeze: after it, anything new that isn't vital to security goes to 1.2.
- **2026-12-03:** the Composer re-scout (S49). Again about 30 days after 1.1 ships.
- **2026-12-20:** the 1.1 pace checkpoint (your decision, 2026-11-22): is 1.1 on track for its
  target? Nothing is cut for the date.
- **2027-01-15:** the target for Mako 1.1, with all of 1.1 within 60 days of 2026-11-17 (your
  decision, 2026-11-22; it was "about 2026-12-13 to 2027-01-13"). Nothing is cut for it; step 17
  (the token audit) is the last step before the release.
- **By 2027-01-14:** renew the `ABlueAgent` classic token (`public_repo` only, step 14), a week
  before it expires on 2027-01-21. Signed in as `ABlueAgent`, it is listed on
  https://github.com/settings/tokens. Make the new token by step 14's
  instructions and step 17b's rules, put it where the old one lives (Bitwarden, or Mako's key setup
  once S06 gives it a home), tell Claude the new expiry date (never the token) so it moves this
  reminder. Then check the new token works: once S06 has given it a home, have a local Mako pane
  push a branch with it; before S06, check the token page lists it with only `public_repo`. Delete
  the old token on the same page only after that check passes.
