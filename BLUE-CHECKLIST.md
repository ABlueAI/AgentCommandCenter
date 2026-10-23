# Blue's checklist

Everything Blue needs to do, in order, with when and how long. Agents keep it current: every action for
Blue goes here instead of living only in a chat message. Agents tick a box only when they have verified
it, adding the date and how they checked. Blue can tick boxes himself, or tell any agent "step N done".

Permanent link: https://github.com/ABlueAI/AgentCommandCenter/blob/main/BLUE-CHECKLIST.md

Last updated 2026-10-22 by Claude (step 29 added for the S12 Quick Links bundle, PR #86; step 21
ticked and step 26 added for the runner's claim check, PR #83; step 19 ticked with Blue's Composer verdict, PR #82; step 21 added: apply the capped review loop to the runner, PR #52;
step 25 added for the S03 plan board, PR #54; "Do next" order added, step 20 ticked, step 22 added, PR #53;
S05 checks added as steps 23 and 24, PR #49; step 6 dropped by Blue, PR #51; step 17 moved after
step 16; PR #46's token rules approved with its merge). Earlier: step 17 added and step 14's token
changed to classic `public_repo` (PR #46); step 8 moved to 2026-10-28 and steps 18 to 20 added (PR
#48); step 16 added and ticked, with the 2026-10-21 Codex agent-request result (PR #47).

## Do next, in this order

Your words (2026-10-21): "we will walk through this. place it where you prioritize it in relation to
other remaining items." Claude's order for what is left:

1. **Step 15**, the voice check on the new Electron, first: a failure means a fix or a revert of the
   Electron bump before other work.
2. **Step 14**, the agent token, walked through with an agent (tell any agent "walk me through step
   14"). It unblocks S06 and everything after it (S07 to S11, S21), and Codex's next build (from the
   hand-off for this order; the plan doesn't name that dependency yet).
3. **Step 17**, the token audit and push protection.
4. **Wednesday 2026-10-28: step 8**, the Max upgrade.
5. **When you merge S04 (PR #84): step 28, then step 27**, in the same sitting.

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
on its own, one session at a time on Pro until you upgrade (step 8, 2026-10-28).

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
- [ ] **8. Upgrade Claude to Max 5x.** About 2 minutes, on **Wednesday 2026-10-28** (moved from
  2026-10-21 on 2026-10-20), after you have used your remaining Pro resets: in your words, "2 full
  resets & a weekly reset", plus 3 ChatGPT resets. claude.ai > Settings > Billing. Keep ChatGPT Plus.
  No longer blocks the runner; it builds one session at a time on Pro until then.
  - The 2026-10-21 date was picked to upgrade before Pro renews on Thursday. If Pro renews on
    Thursday 2026-10-22, it renews once more before the upgrade; Settings > Billing shows the renewal
    date and how an upgrade is charged.
  - *Done when:* you say so. After S04, the runner then allows 2 sessions in parallel, later 3 (one
    setting in docs/RUNNER.md).

- [ ] **28. Confirm usage credits are off (S04).** 1 minute, before step 27. Open
  https://claude.ai/settings/usage and check that **Usage credits** are off. With them on, scheduled
  runs keep going past your usage limit on paid, metered overage; with them off, new runs are
  rejected until the usage window resets, which is what the all-day runner expects (docs/RUNNER.md,
  "Limits, from the official docs").
  - *Done when:* you tell any agent "usage credits are off". Claude can't read that page, so it
    records your word and the date here.
- [ ] **27. Right after merging S04 (PR #84), have its runner applied.** About 10 minutes, in the
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
  - *Done when:* that session reads all three tasks back (schedule, model Opus 5.5, notifications,
    on or off, prompt matching `main`), the first hourly fire afterwards works a PR as `ABlueAgent`
    (which proves the repository is attached), and it ticks this step with the date and how it
    checked. S04 itself is done after two days in a row run unattended through several fires, a
    usage-limit stop resumes on its own, and the digest arrives both evenings; then tell any agent
    "check S04".

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
- [ ] **10. App settings review.** About 20 minutes, this week, after step 2.
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
- [ ] **14. Agent token for local agents (approved with PR #44; token type changed by PR #46).**
  About 10 minutes, any time before session S06 (the runner won't start S06 until this is ticked).
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
  fixes. CI covers the code, but only your PC has the microphone, GPU and speakers.
  - Fully close Mako. In PowerShell: `cd` to the repo, `git switch main`, `git pull`, then `cd app`
    and `npm ci`. It should print `ensure-electron-binary: Electron 42.11.15 ready at ...`.
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
- [ ] **17. Token hygiene: find old tokens, and rules for any new one.** About 20 minutes, this week.
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
      after S06 is under "Coming up this month".
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
      in to it again (a). After S06, only if you keep that login under "Coming up this month",
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
    - Expiry 90 days (1 year at most) where the provider lets you set one. Tell Claude the expiry
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
  - *Done when:* you say the audit is done and push protection shows enabled. Claude then tries to
    confirm push protection through GitHub's API (`security_and_analysis` on the repository). GitHub
    shows that field only to repository admins, and agents have write access, so Claude expects not
    to be able to read it; it says so and ticks this on your word.

- [ ] **18. Say go on the UI when your examples are ready.** About 1 minute, any time. The UI sessions
  (S14 and S17 to S20) are on `HOLD (Blue)` in docs/PLAN-1.1.md (PR #48), so the runner skips them.
  When your UI examples folder is ready, tell any agent "go on the UI". It records your words in
  docs/DECISIONS.md and sets those rows back to READY in a PR. Merging that PR starts S14 (Claude
  writes the brief). S17 to S20 are built by Codex, which you start yourself once S14 and S26 are
  done; the runner never builds them (docs/PLAN-1.1.md "UI sessions: who builds").
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

- [ ] **22. Evaluate qodo-ai/pr-agent as Mako's PR reviewer.** About 20 minutes of your own time,
  whenever you get to it ("add it to my list, i will get to it"). (Numbered 22 because open PR #52
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
- [ ] **24. Optional phone alerts via Claude Remote Control (S05).** About **2 minutes** after
  step 23, if wanted. Follow [docs/NEEDS-YOU-ALERTS.md](docs/NEEDS-YOU-ALERTS.md#phone-alerts-through-claude-remote-control).
  Connect the same real pane from your phone, enable Claude's available push-notification choices
  and the phone's OS notification permission, then request a harmless test push. This uses your
  existing Claude account; do not add an account, subscription, Mako hook or API key for it.
  - *Done when:* the session is visible on your phone and a push is observed; report a missing
    setting or unavailable account feature instead of assuming delivery. **Optional; unverified.**

- [ ] **25. Connect the plan board (S03).** About **10 minutes**, after you merge the S03 PR, #54. The
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

- [ ] **26. Have the runner's claim-check prompt applied (after you merge PR #83).** About 2 minutes,
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

## Every day, once the runner is on

Once S04 is applied (step 27), the runner works all day and you do one sitting in the evening:

- **Evening, after the 8:03 PM digest (10 to 20 minutes):** read the digest on your phone. Answer
  each "needs Blue" question in its PR. For each PR the digest marks `READY TO MERGE`, read its
  TLDR, then Files changed > Review changes > Approve > Submit review, then Merge pull request >
  Confirm merge. Merge only on `READY TO MERGE`.
- **During the day: nothing.** A question for you also arrives as a GitHub notification (a PR
  comment starting "@ABlueAI needs Blue:"); it can wait for the evening.
- **To pause or resume:** the switch on the routines page (step 27).
- **Until step 27 is done:** the old runner fires once, at 8:01 AM. Check your phone in the
  morning for "needs Blue", and approve and merge ready PRs in the evening as above.

## Coming up this month (the runner will ask when it gets there)

You can start on the first one now, which saves time later.

- **Session S14 (on hold until you say go, step 18):** UI examples. Screenshots or links of designs
  you like, including dashboards for different tasks (coding, research, business). **Start a folder
  now.**
- **Session S06, after its PR merges:** remove the `ABlueAI` Git login from your PC (about 5
  minutes). The S06 PR names exactly which entries.
  - On the PC: delete the Credential Manager entry and the `gh` login. If you keep them because
    you push as `ABlueAI` from this PC, local agents running under your Windows account can still
    read them and act as you, so the S06 PR must show how panes are kept from them; otherwise push
    as `ABlueAI` from a browser or a separate Windows account instead.
  - On GitHub: revoke the matching app under Authorized OAuth Apps only if you push as `ABlueAI`
    from no machine, since that signs it out everywhere.
  - *Done when:* you say so (Claude can't read Credential Manager or your authorized apps).
- **Session S12:** confirm your Hexona login link in Mako (step 29).
- **Session S13:** install the Obsidian app (2 minutes).
- **Session S26:** comment as `ABlueAI` on its claim issue to start Codex's trial build (the session
  tells you when and what to write).
- **Session S16:** ~~your Composer verdict (step 19)~~ Done 2026-10-21: no option adopted, everything open for study, questions deferred (step 19).
- **Session S17 (on hold with S14):** pick one of 2 or 3 design directions.
- **Session S21:** pick a logo variant.
- **Session S23:** approve the client paperwork drafts.
- **Session S24:** authorize the GoHighLevel connector in claude.ai (read-only token).

## Waiting on you (the runner won't ask)

- **Session S28:** your agent-roles package (new role texts, from your agent-roles chat), as an issue
  you open yourself as `ABlueAI`, titled `agent-roles package (S28)` (agents ignore one opened, or
  edited, by anyone else), or hand it to an agent in its own session to open the PR. Not as a PR of your
  own: you can't approve your own PR, so it couldn't merge. S28 stays `NEEDS BLUE (package)` until
  it arrives.

## Dated reminders

- **About 2026-11-17:** reassess plans. Is Max 5x enough, or move to 20x? The month review (S25)
  brings the numbers. With the upgrade on 2026-10-28, that covers about 3 weeks of Max 5x use.
