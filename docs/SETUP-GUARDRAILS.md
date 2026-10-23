# Guardrail setup: Blue's clicks

About 25 minutes in total, done once. Agents cannot do this part: by design they cannot change
repository settings.

## Why this matters

Today, Claude's GitHub access acts as Blue's own account (`ABlueAI`), so GitHub cannot tell an agent
from Blue. The repo files in PR #27 stop agents at the tool level, but the real wall has to be on
GitHub's side. Part A builds it; Part B gives agents their own identity so the wall can require Blue's
personal approval.

## Part A: right after PR #27 merges (10 minutes)

1. **Turn off auto-merge.** Repo > Settings > General > Pull Requests: uncheck **Allow auto-merge**.
   (Already off on this repo, per Blue on 2026-10-18.)
2. **Read-only Actions.** Settings > Actions > General > Workflow permissions: choose **Read repository
   contents and packages permissions**, and uncheck **Allow GitHub Actions to create and approve pull
   requests**. Both are GitHub's defaults for new repositories, so check rather than assume. This is
   separate from auto-merge: a workflow file is something an agent can add in a PR, and this setting
   stops any workflow from approving PRs, while a workflow file can't turn it back on.
3. **Protect main.** Settings > Rules > Rulesets > New ruleset > New branch ruleset:
   - Name `protect-main`, Enforcement **Active**, **Bypass list: leave empty** (not even admins).
   - Target branches: **Include default branch**.
   - Check: **Restrict deletions**; **Require a pull request before merging** (required approvals
     **0** for now; Part B raises it); **Require status checks to pass**, adding **App tests
     (Windows)** and **PowerShell tests (Windows)**; **Block force pushes**.
   - Save.
4. **Phone alerts.** GitHub mobile app > Settings > Notifications: on for **Pull requests** and
   **Reviews requested**. Optional: a filter for issues labelled `security-alert`.
5. **Codex reviews (optional since 2026-10-19).** The required independent review is now the
   `pr-reviewer` subagent the builder runs on its own PR (AGENTS.md "How work flows" step 3,
   `.claude/agents/pr-reviewer.md`). Codex reviewed your PRs automatically but not the agent's
   (#39, #41), so it's an extra you can request by hand. After BLUE-CHECKLIST.md step 16, ask an agent
   to post the request (AGENTS.md step 3; this worked on PR #47 on 2026-10-21, STATUS.md). If you keep it: chatgpt.com/codex > Settings > Code review, enable it for
   `ABlueAI/AgentCommandCenter`. When GitHub asks which
   repositories the app may access, choose **Only select repositories**, not all: every repository an
   AI app can reach is one a prompt injection can reach, and future private business repos should be
   opted in one at a time.
6. **Your account.** Make sure ABlueAI has two-factor authentication, ideally a passkey.
7. **ChatGPT computer use off.** ChatGPT desktop app > Settings > Computer use: turn off **Any App**
   (and app add-ins you don't use), install no browser extensions, keep **Always-allowed apps** empty.

After Part A: nobody can push to main, force-push it or delete it; every change needs a PR with green
CI; auto-merge cannot be switched on by an agent. **Remaining gap:** an agent acting as your account
could still press Merge on a green PR. Part B closes that.

## Part B: before the daily runner starts (15 minutes)

1. **Create the agent account.** A free GitHub account such as `ablueai-agent`, with its own email
   address (a "+agent" alias usually works). GitHub's terms allow one machine account per person.
   Turn on two-factor authentication for it.
2. **Give it collaborator access.** Repo > Settings > Collaborators > Add people > `ablueai-agent`.
   Personal-account repos have no role picker: collaborators can push branches and open PRs but can't
   change settings. Accept the invite from the agent account.
3. **Point Claude at it.** In a private browser window, sign in to GitHub as `ablueai-agent`, then go
   to claude.ai/connect-github and connect. Claude's cloud sessions now act as the agent account. You
   keep using `ABlueAI` on github.com and the GitHub app to approve and merge. Codex was linked to
   `ABlueAI` until Blue re-linked it to the agent account on 2026-10-20 (BLUE-CHECKLIST.md step 16;
   see "Codex is linked to the agent account" below).
4. **Require your approval.** Edit `protect-main` > Require a pull request: required approvals **1**;
   check **Dismiss stale pull request approvals when new commits are pushed**, **Require review from
   Code Owners**, and **Require approval of the most recent reviewable push**. Save.
5. **Tell Claude it's done.** Session S01 opens a test PR from the agent account and confirms it cannot
   merge without you.

## Who can merge after Part B

| Actor | Can push to main | Can merge a PR |
|---|---|---|
| Claude or any agent (agent account, Write role) | No | No: needs Blue's approval, and the agent cannot approve as Blue |
| Codex (linked to the agent account) | No | No: its PRs are opened as the agent account, its reviews come from `chatgpt-codex-connector[bot]` as comments, and neither can give the code owner's approval (docs/CODEX-BUILDER-LANE.md) |
| A GitHub Actions workflow | No | No: read-only token, cannot approve |
| Someone opening a PR from a fork | No | No |
| Blue (ABlueAI) | No (PR required for everyone) | Yes, after CI passes, approving the agent's PR |

The merge audit workflow opens a `security-alert` issue if anything reaches main any other way.

## What is still not covered

- **Your own account.** Anyone who gets into ABlueAI can approve and merge. A passkey is the defense.
- **Local agents on your PC** push with your git login. Session S06 moves them to the
  agent account (approved with PR #44). Today the only provider key Mako injects is the Gemini key,
  for Video Scout panes (it also passes a per-pane pane-status token through `buildPtyEnv`); how it
  will store and pass the agent's token is part of S06 (docs/PLAN-1.1.md).
  Until then, local agents only verify; they don't open PRs.
- **Rulesets themselves.** Only repo admins can edit them, and agents are not admins.
- **Codex is linked to the agent account (since 2026-10-20).** Blue re-linked Codex's GitHub to
  `ABlueAgent` on 2026-10-20 (BLUE-CHECKLIST.md step 16; docs/DECISIONS.md, 2026-10-20). Codex now
  reviews agent PRs automatically, and a review request from `ABlueAI` is refused (STATUS.md). The
  re-link is expected to give Codex's OAuth grant the agent's write access instead of Blue's. Not
  verified: Codex may push through the ChatGPT/Codex app installed on the repo (step 2e) rather than
  the linked user's token, so S26 checks which one it uses, and checklist step 20 checks what the app
  and the link can reach. Any `ABlueAgent` comment containing Codex's handle may start a Codex task
  that can push a branch. AGENTS.md (once PR #47 merges) forbids agents to write the handle unless
  Blue asks (a comment by `ABlueAI` on that PR or issue, unedited by anyone else, or his own message
  to the agent; the full rule is in AGENTS.md "Security rules"); S26 (PR #114) adds the Codex-lane
  hand-off and fix request as narrow exceptions. That is a rule, not a control: a mistaken or injected agent comment could
  still start such a task. Merging still needs Blue's approval. S26 adds Codex to the table above and
  answers what it can below (docs/CODEX-BUILDER-LANE.md). Its review comments
  appear as `chatgpt-codex-connector[bot]` (seen on PR #42).
  Checked in S26 (docs/CODEX-BUILDER-LANE.md, 2026-10-23): Codex's PR #49 was opened as
  `ABlueAgent`, and a Codex review can't count as an approval. Still not verified: which token
  Codex pushes with, and whether it can comment as `ABlueAgent`; S26's trial checks them.
- **AI that drives your own screen or browser.** ChatGPT computer use, browser agents and extensions
  (including Claude in Chrome, which S15 evaluates) act as you in every account you are signed in to,
  so GitHub would see Blue clicking Merge. Use them only in a separate browser profile that is not
  signed in to GitHub, email or banking, and keep them off otherwise.
