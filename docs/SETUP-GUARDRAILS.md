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
5. **Codex reviews.** chatgpt.com/codex > Settings > Code review: enable it for
   `ABlueAI/AgentCommandCenter` and turn on **Automatic reviews**. If your Plus plan does not offer
   automatic reviews, tell Claude; the fallback is a reviewer agent in CI. When GitHub asks which
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
2. **Give it Write access only.** Repo > Settings > Collaborators > Add people > `ablueai-agent` >
   role **Write** (not Maintain, not Admin). Accept the invite from the agent account.
3. **Point Claude at it.** In a private browser window, sign in to GitHub as `ablueai-agent`, then go
   to claude.ai/connect-github and connect. Claude's cloud sessions now act as the agent account. You
   keep using `ABlueAI` on github.com and the GitHub app to approve and merge. If Codex will open PRs,
   connect Codex's GitHub to the agent account the same way.
4. **Require your approval.** Edit `protect-main` > Require a pull request: required approvals **1**;
   check **Dismiss stale pull request approvals when new commits are pushed**, **Require review from
   Code Owners**, and **Require approval of the most recent reviewable push**. Save.
5. **Tell Claude it's done.** Session S01 opens a test PR from the agent account and confirms it cannot
   merge without you.

## Who can merge after Part B

| Actor | Can push to main | Can merge a PR |
|---|---|---|
| Claude, Codex, any agent (agent account, Write role) | No | No: needs Blue's approval, and the agent cannot approve as Blue |
| A GitHub Actions workflow | No | No: read-only token, cannot approve |
| Someone opening a PR from a fork | No | No |
| Blue (ABlueAI) | No (PR required for everyone) | Yes, after CI passes, approving the agent's PR |

The merge audit workflow opens a `security-alert` issue if anything reaches main any other way.

## What is still not covered

- **Your own account.** Anyone who gets into ABlueAI can approve and merge. A passkey is the defense.
- **Local agents on your PC** push with your git login until S01 moves them to the agent account
  (Mako already injects per-pane credentials, so it can supply the agent's token). Until then, local
  agents only verify; they don't open PRs.
- **Rulesets themselves.** Only repo admins can edit them, and agents are not admins.
- **AI that drives your own screen or browser.** ChatGPT computer use, browser agents and extensions
  (including Claude in Chrome, which S15 evaluates) act as you in every account you are signed in to,
  so GitHub would see Blue clicking Merge. Use them only in a separate browser profile that is not
  signed in to GitHub, email or banking, and keep them off otherwise.
