# Blue's checklist

Everything Blue needs to do, in order, with when and how long. Agents keep it current: every action for
Blue goes here instead of living only in a chat message. Agents tick a box only when they have verified
it, adding the date and how they checked. Blue can tick boxes himself, or tell any agent "step N done".

Permanent link: https://github.com/ABlueAI/AgentCommandCenter/blob/main/BLUE-CHECKLIST.md

Last updated 2026-10-18 by Claude (PC session: step 4).

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
- [ ] **5. Merge PR #33, then tag 1.0.** About 2 minutes, after step 4's smoke test passes.
  - The tag waits for PR #33, the Electron-binary fix (your decision, 2026-10-18). Merge PR #33 when
    its CI is green. PR #32 has to be merged first.
  - Then the PC session tags `v1.0.0` on that `main`. You already gave the OK in that decision.
  - *Done when:* tag `v1.0.0` exists on GitHub at a commit that includes PR #33. **Mako 1.0 is
    released.**
- [ ] **6. Bring GPT up to date.** About 2 minutes, any time.
  - Download https://github.com/ABlueAI/AgentCommandCenter/blob/main/docs/handoff/GPT-BRIEFING-2026-10-17.md
    (or the copy sent in the Claude chat) and upload it to ChatGPT with: "Read this; it is the current
    state of Mako. From now on we coordinate through the GitHub repo."

## Before the daily runner starts building

The runner is on since 2026-10-18 (8:01 AM Eastern). Each morning it first checks steps 1 and 7, and
does nothing except send you a "waiting on step N" notice until they are complete. After that it runs
on its own, one session at a time on Pro.

- [ ] **7. Guardrails, Part B: a separate GitHub account for agents.** About 15 minutes.
  - **a.** Create a free GitHub account, for example `ablueai-agent`, with its own email (a "+agent"
    alias of your email usually works). Turn on two-factor authentication.
  - **b.** Signed in as `ABlueAI`: repo > Settings > Collaborators > **Add people** > `ablueai-agent`.
    Repos on a personal account have no role picker; collaborators get write access, which is what
    we want. Then, signed in as the agent account, accept the invitation (from its email, or
    https://github.com/ABlueAI/AgentCommandCenter/invitations).
  - **c.** In a private browser window, sign in to GitHub as `ablueai-agent`, then open
    https://claude.ai/connect-github and connect. Claude's cloud sessions now act as the agent account;
    you keep using `ABlueAI` to approve and merge.
  - **d.** Do this only after c, and after merging any open PR Claude made before c. GitHub never
    lets a PR's author approve their own PR, and until c Claude's PRs are authored as `ABlueAI`, so
    they would be stuck. Settings > Rules > Rulesets > `protect-main` > Require a pull request:
    required approvals **1**; check **Dismiss stale pull request approvals when new commits are
    pushed**, **Require review from Code Owners**, and **Require approval of the most recent
    reviewable push**. Save.
  - **e. Give the runner the repository** (2 minutes, after c). Open https://claude.ai/code/routines,
    open **Mako daily runner**, add the repository `ABlueAI/AgentCommandCenter`, and save. Leave the
    schedule and prompt as they are. Without this the runner can check the gate but cannot open pull
    requests (seen on its first run, 2026-10-18). If the routine can't be edited, tell Claude and it
    will walk you through recreating it with the prompt in docs/RUNNER.md.
  - *Done when:* you say "Part B done". Claude opens a test PR as the agent account and confirms it
    cannot merge without your approval.
- [ ] **8. Upgrade Claude to Max 5x.** About 2 minutes, on **Wednesday 2026-10-21**, after Pro's weekly
  reset on Tuesday and before Pro renews on Thursday. claude.ai > Settings > Billing. Keep ChatGPT Plus.
  No longer blocks the runner; it builds one session at a time on Pro until then.
  - *Done when:* you say so. After S04, the runner then allows 2 sessions in parallel.

## Any time (not blocking)

- [ ] **9. Password manager.** About 45 minutes, any time. Recommended: **Bitwarden, free plan**
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
    Windows environment variables, or a chat with any AI, Claude included.
  - Once moved, turn off password saving in Chrome and Edge so there is one place.
  - Don't connect it to ChatGPT's **Passwords** setting or let any AI agent drive it.
  - *Done when:* you say so. It's yours, so Claude doesn't verify anything.
- [ ] **10. App settings review.** About 20 minutes, this week, after step 2.
  - Screenshot every page of: ChatGPT desktop app > Settings; claude.ai > Settings and the Claude
    desktop app's settings; github.com > Settings > Applications (Installed GitHub Apps and
    Authorized OAuth Apps). Send them to Claude in one message.
  - Claude replies with the exact toggles to change and writes the agreed setup into
    `docs/SETUP-APP-SETTINGS.md`, without personal details, so every agent knows it.
  - *Done when:* you've changed them and said so.
- [ ] **11. Close the false security alert, issue #35.** 1 minute, right after you merge the
  merge-audit PR (branch `claude/merge-audit-stacked-prs`).
  - Open https://github.com/ABlueAI/AgentCommandCenter/issues/35, comment "False alarm: commits
    arrived via PR #34 (37009eb), merged by ABlueAI; audit fixed in #PRNUM", then **Close issue**.
  - Agents never close security alerts themselves.
  - *Done when:* issue #35 shows Closed, and the merge audit run for that merge passed with no new
    alert. Claude checks both.

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
