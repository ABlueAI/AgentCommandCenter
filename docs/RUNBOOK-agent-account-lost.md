# Runbook: the agent account is gone

Use this when `ABlueAgent` (the agent account that cloud sessions act as) is suspended, locked or
deleted. This repository is public: this file names logins only, never secrets, keys or IDs.

Background: GitHub suspended `ABlueAgent` around 2026-11-08 (cause unknown) and restored it after one
appeal. Blue's decisions of 2026-11-10 and 2026-11-11 (docs/DECISIONS.md) made the GitHub App
`mako-agents` the primary identity for local work and kept `ABlueAgent` for cloud sessions. The rules
are in AGENTS.md "Agent account safety". **The App is planned until BLUE-CHECKLIST.md step 51 is
ticked**; until then, the parts below marked "planned until the App is wired" describe what will be
true, not what is.

## The rules this runbook never bends

- **Do not create a replacement user account.** Blue's words (2026-11-11): "I'm not making another
  account." GitHub's terms allow one machine account per person; a second one is the pattern that
  gets accounts suspended.
- **Do not open a second Support ticket.** One ticket only. A duplicate can slow or lose the first.
- **Do not change anything on the account** (email, password, 2FA, tokens) while the ticket is open
  (AGENTS.md "Agent account safety", R2).
- **Never merge, never approve as an agent.** Blue approves and merges, as `ABlueAI`.

## Steps

1. **Confirm it is gone.** Either of these is enough:
   - `gh api users/ABlueAgent` returns `404`, or
   - Blue sees GitHub's suspended-account page when he opens the account's sign-in page (a private
     browser window or a separate browser profile, never his everyday profile; R2).

   A `200` means the account exists: the failure is something else (a token, a rate limit; see R6),
   so stop and report instead of following this runbook.
2. **Stop what depends on it.** Pause the cloud runner and the evening digest (the scheduled tasks
   **Mako all-day runner**, **Mako daily runner** and **Mako evening digest**; docs/RUNNER.md) and
   stop any cloud session that acts as `ABlueAgent`. A cloud session left running keeps failing
   against GitHub and can trip rate limits on whatever it still reaches.
3. **Use the one ticket.** If a Support ticket about `ABlueAgent` is already open, reply in that
   ticket. If none exists, Blue files the single appeal from the account's sign-in page or GitHub
   Support, once, and records the ticket's date in docs/DECISIONS.md (not the ticket's ID or
   contents). Blue does this, not an agent.
4. **Local work needs no switch (planned until the App is wired).** Mako panes, local Claude sessions
   and the local runner already use the App `mako-agents` (bot login `mako-agents[bot]`, once the
   App is created), so nothing moves. Until the App is wired (checklist steps 51 and 52), local
   agents only verify; they open no PRs (docs/SETUP-GUARDRAILS.md, "What is still not covered").
5. **Re-open lost PRs.** An open PR whose author was `ABlueAgent` stays open and its branch stays,
   but the account can no longer act on it. For each, in order of plan session:
   - with the bot (planned until the App is wired), open a new PR from the existing branch, with the
     same title (starting `Sxx:` for a plan session, so the claim rule in AGENTS.md "How work flows"
     still holds), and say "replaces #N (opened by the lost agent account)" in its TLDR;
   - close the old PR with a comment that points to the new one, if GitHub lets the bot; otherwise
     leave it for Blue to close;
   - re-run the independent review on the new PR (a review by the suspended account no longer counts
     as posted by a live account).
6. **The first bot PR is reviewed by Blue, closely.** It is the first PR from a new identity: Blue
   checks the author, the commit's pusher and the review comment's author on the PR page, approves
   and merges it as `ABlueAI`. An agent never marks it merge-ready on its own word.
7. **Record it.** Update STATUS.md (what is down and since when) and append a dated entry to
   docs/DECISIONS.md with Blue's words about what he decided. Add any new step Blue must do to
   BLUE-CHECKLIST.md.

## What stays down until the account is reinstated

- **Cloud PR work:** a cloud session cannot use the App, so no cloud session opens or updates a PR.
- **The cloud runner and its digest:** paused in step 2. (The digest reports "AGENT ACCOUNT LOST, see
  runbook"; AGENTS.md R9.)
- **Codex builds:** Codex is linked to `ABlueAgent` (BLUE-CHECKLIST.md step 16), so it cannot open
  PRs, and its automatic reviews of agent PRs stop.

Local Mako panes, local Claude sessions and the local runner keep working once the App is wired.
Plan sessions the cloud runner would have taken wait, or Blue starts them by hand in a local pane.

## When the account is reinstated

1. Blue changes nothing until the ticket is closed.
2. Check that `gh api users/ABlueAgent` returns `200` and that the sign-in page from step 1 no
   longer shows a suspension.
3. Resume the paused cloud scheduled tasks one at a time, runner last, and watch the first fire
   against the pacing budget in AGENTS.md "Agent account safety" (R5).
4. Record the date in STATUS.md and docs/DECISIONS.md.
