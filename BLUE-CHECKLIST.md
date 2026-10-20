# Blue's checklist

Everything Blue needs to do, in order, with when and how long. Agents keep it current: every action for
Blue goes here instead of living only in a chat message. Agents tick a box only when they have verified
it, adding the date and how they checked. Blue can tick boxes himself, or tell any agent "step N done".

Permanent link: https://github.com/ABlueAI/AgentCommandCenter/blob/main/BLUE-CHECKLIST.md

Last updated 2026-10-20 by Claude (step 17 added: token hygiene; step 14's token changed to classic `public_repo`; step 16 is taken by open PR #47).

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
- [ ] **6. Bring GPT up to date.** About 2 minutes, any time.
  - Download https://github.com/ABlueAI/AgentCommandCenter/blob/main/docs/handoff/GPT-BRIEFING-2026-10-17.md
    (or the copy sent in the Claude chat) and upload it to ChatGPT with: "Read this; it is the current
    state of Mako. From now on we coordinate through the GitHub repo."

## Before the daily runner starts building

The runner is on since 2026-10-18 (8:01 AM Eastern). Each morning it first checks steps 1 and 7, and
does nothing except send you a "waiting on step N" notice until they are complete. After that it runs
on its own, one session at a time on Pro.

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
- [ ] **8. Upgrade Claude to Max 5x.** About 2 minutes, on **Wednesday 2026-10-21**, after Pro's weekly
  reset on Tuesday and before Pro renews on Thursday. claude.ai > Settings > Billing. Keep ChatGPT Plus.
  No longer blocks the runner; it builds one session at a time on Pro until then.
  - *Done when:* you say so. After S04, the runner then allows 2 sessions in parallel.

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
- [ ] **13. Independent review for agent PRs.** Nothing more to do: done when you merge PR #42.
  - What was found (2026-10-19):
    - Codex reviewed every PR you authored automatically ("PR opened", #36 to #38), but skipped #39
      and reviewed #41 only after your manual comment. Both were authored by `ABlueAgent`.
    - The repo's Codex setting shows Review = "Follow personal preferences". Changing it to "All
      PRs" fails with "Unable to save repository settings. Try again."
    - Agents requesting the review themselves (`@codex review` from `ABlueAgent` on PR #42):
      **FAIL**. Four seconds later Codex replied "To use Codex here, create a Codex account and
      connect to github" and didn't review. Codex ignores accounts not linked to ChatGPT.
  - Your choice (option 3): a separate Claude Opus reviewer replaces Codex as the required
    independent review, so Mako doesn't depend on ChatGPT. The builder runs the read-only `pr-reviewer`
    subagent (`.claude/agents/pr-reviewer.md`) on its own PR before marking it ready, and posts the
    result as a PR comment headed "Independent review (Opus)". It fixes or answers every finding and
    re-runs it after fixes (AGENTS.md "How work flows" step 3, and the runner prompt).
  - Codex review is optional now. You can still request one by hand, but nothing waits for it.
  - *Done when:* PR #42 merges with its "Independent review (Opus)" comment linked in the TLDR.
- [ ] **14. Agent token for local agents (approved with PR #44; token type changed by PR #46).**
  About 10 minutes, any time before session S06 (the runner won't start S06 until this is ticked).
  Today local agents on your PC push as `ABlueAI`, the account that can approve and merge.
  - Signed in as `ABlueAgent`: GitHub > Settings > Developer settings > Personal access tokens >
    **Tokens (classic)** > Generate new token (classic). Tick only **public_repo** (no `repo`,
    `workflow`, `admin` or `delete_repo`), with a 90-day expiry. S06 confirms this scope is enough
    for how it uses the token; if it needs more (for example `gh auth login --with-token`, which may
    expect `repo` and `read:org`; passing it as `GH_TOKEN` to a pane may avoid that, not verified:
    S06 checks it survives the subprocess scrub), S06 asks you first.
  - Why classic: GitHub doesn't support fine-grained tokens for an account that is only a
    collaborator on a personal account's repository, which is what `ABlueAgent` is here (found by
    Codex on PR #46; GitHub's docs as quoted in a search result, not yet read directly). With
    `public_repo` it can push code only where `ABlueAgent` has write access, today only this repo,
    and without `workflow` it can't change CI. It can also open issues, PRs and comments as
    `ABlueAgent` on any public repository, and create public repositories under `ABlueAgent`. Don't
    give `ABlueAgent` write access to another repository without revisiting this token.
  - Its final home is Mako's in-app key setup (Electron safeStorage). Never `setx` or a Windows
    environment variable (AGENTS.md "Security rules").
  - Until S06 gives it a home in Mako (the plan doesn't yet say how; S06 decides), it waits only in
    Bitwarden (step 17b).
  - *Done when:* you say the token exists and is in Bitwarden, and tell Claude its expiry date
    (never the token). Claude adds the renewal reminder under "Dated reminders" (step 17b) and
    ticks this on your word (it can't see the token), which lets the runner start S06. The S06 PR then shows a pull request
    opened from a local Mako pane with `ABlueAgent` as its author and confirms the exact scopes.
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
- [ ] **17. Token hygiene: find old tokens, and rules for any new one.** About 20 minutes, this week.
  - **a. Audit old tokens, on both `ABlueAI` and `ABlueAgent`** (sign in to each in turn). A lost
    token's value can't be recovered: GitHub shows a token only once, but it lists every token with
    its last-used date.
    - Classic tokens: https://github.com/settings/tokens
    - Fine-grained tokens: https://github.com/settings/personal-access-tokens
    - Apps: https://github.com/settings/applications. Check all three tabs: Installed GitHub Apps,
      Authorized GitHub Apps and Authorized OAuth Apps.
    - SSH keys: https://github.com/settings/keys
    - Revoke anything you don't recognize or that hasn't been used for months.
    - Keep the Git login on your PC that local agents push with today (often listed as **Git
      Credential Manager** or **GitHub CLI** under authorized apps) until step 14 (session S06)
      replaces it; revoking it breaks local pushes. Its removal after S06 is under "Coming up this
      month".
    - On `ABlueAgent`, keep Claude's authorization: it is how cloud sessions act as the agent (step
      7c).
    - On `ABlueAI`, keep the Claude installation under Installed GitHub Apps (cloud sessions and the
      runner reach the repo through it) and the ChatGPT/Codex authorization and installation (Codex
      review, step 2e). A new token doesn't bring an app link back.
    - If `ABlueAI` still shows Claude under Authorized GitHub Apps, it is left over from before step
      7c and can act as you: revoke it. That removes the authorization, not the installation. If a
      cloud session can't reach the repo afterwards, tell Claude.
    - Do the same for API keys at https://platform.openai.com/api-keys,
      https://console.anthropic.com (API keys page) and https://aistudio.google.com/apikey (Gemini,
      the key Mako's Video Scout uses; also Google Cloud > APIs & Services > Credentials if you made
      keys there).
    - On `ABlueAI/AgentCommandCenter`: Settings > Deploy keys, and Settings > Secrets and variables
      > Actions. Remove anything you don't recognize.
    - If something breaks after a revoke, make a fresh, narrower token by the rules in b, except a
      GitHub token for your PC before S06: tell Claude instead. If local pushes from your PC break, sign in to Git
      again (Git Credential Manager asks on the next push), and tell Claude. That restores the login
      you already had (exception 2 in b).
  - **b. Rules for every new token**, including step 14's:
    - Two exceptions apply to every GitHub rule below: (1) for `ABlueAgent` only, because GitHub
      doesn't support fine-grained tokens for an account that is only a collaborator on a personal
      account's repository: a classic token with the single narrowest scope (step 14: `public_repo`
      only), never for `ABlueAI`; (2) until S06, the PC's existing `ABlueAI` Git login and signing
      in to it again (a). After S06, only if you keep that login under "Coming up this month",
      with the pane isolation the S06 PR shows.
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
      step 14's. If you make it before S06 asks for it, it waits only in Bitwarden.
    - A secret a repo workflow uses goes in a GitHub environment whose deployment branches are
      `main` only, and that workflow must never check out or run code from a PR.
    - Expiry 90 days (1 year at most) where the provider lets you set one. Tell Claude the expiry
      date (never the token), and Claude adds a dated renewal reminder under "Dated reminders"
      below; for a key with no expiry setting, Claude adds a reminder to rotate it at 90 days.
    - Saving a copy in Bitwarden is optional for these tokens. Not storing one at all, and making a
      new one when it expires, is also fine. For new tokens and keys this replaces step 9's "API
      keys go in Bitwarden secure notes".
    - If it might have leaked: revoke it on its provider's page, then tell Claude. GitHub: Settings >
      Developer settings > Personal access tokens > Fine-grained tokens (or Tokens (classic)) > the
      token > **Revoke** or **Delete**, whichever GitHub shows. API keys: the pages in a.
  - **c. Turn on push protection.** Signed in as `ABlueAI`: repo Settings > Code security (it may be
    labelled Advanced Security) > Secret scanning (or Secret Protection) > **Push protection** >
    Enable. It is free for public repositories and blocks pushes that contain a recognizable secret.
    If it already shows enabled, nothing to do. This is your click; agents never change repository
    settings.
  - *Done when:* you say the audit is done and push protection shows enabled. Claude then tries to
    confirm push protection through GitHub's API (`security_and_analysis` on the repository). GitHub
    shows that field only to repository admins, and agents have write access, so Claude expects not
    to be able to read it; it says so and ticks this on your word.

## Every day, once the runner is on

- **Morning (about 5 minutes):** check your phone. Answer anything marked "needs Blue".
- **Evening (10 to 20 minutes):** read the TLDR on each PR marked ready, then **Approve** it and
  **Merge**. Since step 7d every agent PR needs your Approve before Merge.

## Coming up this month (the runner will ask when it gets there)

You can start on the first one now, which saves time later.

- **Session S14:** UI examples. Screenshots or links of designs you like. **Start a folder now.**
- **Session S06, after its PR merges:** remove the `ABlueAI` Git login from your PC (about 5
  minutes). The S06 PR names exactly which entries.
  - On the PC: delete the Credential Manager entry and the `gh` login. If you keep them because
    you push as `ABlueAI` from this PC, local agents running under your Windows account can still
    read them and act as you, so the S06 PR must show how panes are kept from them; otherwise push
    as `ABlueAI` from a browser or a separate Windows account instead.
  - On GitHub: revoke the matching app under Authorized OAuth Apps only if you push as `ABlueAI`
    from no machine, since that signs it out everywhere.
  - *Done when:* you say so (Claude can't read Credential Manager or your authorized apps).
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
