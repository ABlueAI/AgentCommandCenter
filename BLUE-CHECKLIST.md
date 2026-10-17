# Blue's checklist

Everything Blue needs to do, in order, with when and how long. Agents keep it current: every action for
Blue goes here instead of living only in a chat message. Agents tick a box only when they have verified
it, adding the date and how they checked. Blue can tick boxes himself, or tell any agent "step N done".

Permanent link: https://github.com/ABlueAI/AgentCommandCenter/blob/main/BLUE-CHECKLIST.md

Last updated 2026-10-17 by Claude.

## Today

- [x] **1. Merge PR #27.** About 2 minutes. *Verified 2026-10-17: merged by ABlueAI at 22:35 UTC as
  merge commit `4d60c9e`; the merge audit passed.*
  - Open https://github.com/ABlueAI/AgentCommandCenter/pull/27, read the TLDR at the top, then click
    **Merge pull request** and **Confirm merge**.
  - You decided that green CI plus your read of the TLDR is enough review for this PR. Codex reviews
    every PR after it (step 2e).
  - *Done when:* the PR shows "Merged". Claude checks.
- [ ] **2. Guardrails, Part A.** About 10 minutes, right after step 1.
  - **a. Auto-merge off.** Repo > Settings > General > Pull Requests: uncheck **Allow auto-merge**.
  - **b. Read-only Actions.** Settings > Actions > General > Workflow permissions: choose **Read
    repository contents and packages permissions**, uncheck **Allow GitHub Actions to create and
    approve pull requests**, and click **Save**.
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
  - **f. Account security.** github.com > Settings > Password and authentication: make sure
    two-factor authentication is on, and add a passkey if you don't have one.
  - *Done when:* you say "Part A done". Claude confirms it on the next PR: GitHub lists the two
    Windows checks as **Required**, the PR shows as blocked until they pass, and a Codex review
    appears. (Claude never tests protection by pushing to main; that is forbidden even as a test.)
- [ ] **3. Tell Claude your time zone.** 5 seconds. The daily runner starts at **8:01 AM your local
  time**, one minute after Claude's weekly usage reset. Reply with your time zone (for example
  "Eastern").
  - *Done when:* Claude creates the runner's schedule and records it in docs/DECISIONS.md.

## This week (hard deadline: about Nov 3)

- [ ] **4. Finish 1.0 on your PC.** About 15 minutes of your attention; the agent does the rest.
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
- [ ] **5. Say "tag 1.0".** About 1 minute, after step 4's smoke test passes. Say it in the PC session.
  - *Done when:* tag `v1.0.0` exists on GitHub. **Mako 1.0 is released.**
- [ ] **6. Bring GPT up to date.** About 2 minutes, any time.
  - Download https://github.com/ABlueAI/AgentCommandCenter/blob/main/docs/handoff/GPT-BRIEFING-2026-10-17.md
    (or the copy sent in the Claude chat) and upload it to ChatGPT with: "Read this; it is the current
    state of Mako. From now on we coordinate through the GitHub repo."

## Before the daily runner starts building

The runner can be switched on as soon as step 3 is done. Each morning it first checks steps 1, 7 and 8,
and does nothing except send you a "waiting on step N" notice until they are complete. After that it
runs on its own.

- [ ] **7. Guardrails, Part B: a separate GitHub account for agents.** About 15 minutes.
  - **a.** Create a free GitHub account, for example `ablueai-agent`, with its own email (a "+agent"
    alias of your email usually works). Turn on two-factor authentication.
  - **b.** Repo > Settings > Collaborators > **Add people** > `ablueai-agent` > role **Write**. Accept
    the invitation while signed in as the agent account.
  - **c.** In a private browser window, sign in to GitHub as `ablueai-agent`, then open
    https://claude.ai/connect-github and connect. Claude's cloud sessions now act as the agent account;
    you keep using `ABlueAI` to approve and merge.
  - **d.** Settings > Rules > Rulesets > `protect-main` > Require a pull request: required approvals
    **1**; check **Dismiss stale pull request approvals when new commits are pushed**, **Require
    review from Code Owners**, and **Require approval of the most recent reviewable push**. Save.
  - *Done when:* you say "Part B done". Claude opens a test PR as the agent account and confirms it
    cannot merge without your approval.
- [ ] **8. Upgrade Claude to Max 5x.** About 2 minutes. claude.ai > Settings > Billing. Keep ChatGPT Plus.
  - *Done when:* you say so. The runner then allows 2 sessions in parallel.

## Every day, once the runner is on

- **Morning (about 5 minutes):** check your phone. Answer anything marked "needs Blue".
- **Evening (10 to 20 minutes):** read the TLDR on each PR marked ready, and merge.

## Coming up this month (the runner will ask when it gets there)

You can start on the first one now, which saves time later.

- **Session S14:** UI examples. Screenshots or links of designs you like. **Start a folder now.**
- **Session S12:** your Hexona login URL.
- **Session S13:** install the Obsidian app (2 minutes).
- **Session S16:** your verdict on the Dodaios trial report.
- **Session S17:** pick one of 2 or 3 design directions.
- **Session S21:** pick a logo variant.
- **Session S23:** approve the client paperwork drafts.
- **Session S24:** authorize the GoHighLevel connector in claude.ai (read-only token).

## Dated reminders

- **About 2026-11-17:** reassess plans. Is Max 5x enough, or move to 20x? The month review (S25)
  brings the numbers.
