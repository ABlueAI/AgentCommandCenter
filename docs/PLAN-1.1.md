# Mako 1.1: month-one plan (28 sessions)

Drafted 2026-10-17 by Claude for Blue. Approved when the PR that adds it is merged. Changes only through
`plan-change` PRs (rules below).

**Latest change (2026-10-19, proposed, pending Blue):** S04 becomes an all-day runner that fires
through the day, works sessions in parallel up to a cap and sends one evening digest; S04 now needs
only S01; new session S26 adds Codex as a second builder; new sessions S27 (Composer) and S28 (agent
profile refresh); session-end notices start with READY TO MERGE or NOT READY; S04 documents pausing
through the claude.ai routines page and adds a usage alert, and S11 adds a Pause button in Mako where
it can be done safely. Details below the session table and in the change log. Merging PR #47 approves
all of this; a dedicated follow-up PR (or the runner's status PR, once S04 is applied) drops the
"proposed" wording in this note, STATUS, the checklist and SETUP-GUARDRAILS, and appends an
"approved: Blue merged PR #47" change-log entry (earlier change-log entries stay as they are).

## How this plan runs

- **One session = one pull request.** Each session has a goal, a "done when", an authority level, a
  lane and its dependencies.
- **Lanes:** `cloud` runs without Blue's PC; `windows` needs a Windows check (CI, Blue's PC or the
  Codex Windows sandbox); `blue` needs Blue's input before it can finish.
- **The all-day runner** (built in S04) fires many times a day on `main`. Each fire first fixes its own
  open PRs, then starts every `READY` session whose dependencies are merged and that nobody has
  claimed, up to the parallel cap. A session that needs Blue posts its question in the PR and the
  runner moves on, so nothing waits idle. Until S04's prompt is applied to the scheduled task (the ticked checklist
  step S04 adds), today's runner (docs/RUNNER.md) fires once a day at 8:01 AM Eastern and runs one
  session at a time, even after S04 merges (expected, not verified: its own prompt drops that limit
  at S04's merge); S04's prompt is applied in the same sitting as its merge
  (S04 item 8).
- **Parallel work:** the cap is one setting (S04 puts it in docs/RUNNER.md): 1 on Claude Pro, 2 to 3 on
  Max 5x after Blue's upgrade on 2026-10-21, to stay under the weekly cap; 3 or 4 on Max 20x.
- **Blue's day:** once S04 is merged and applied, one sitting in the evening, 10 to 20 minutes: read the digest,
  answer anything marked "needs Blue", then approve and merge every PR that is ready.

### Status values

`READY` · `IN PROGRESS (#PR)` · `NEEDS BLUE (#PR)` (or `NEEDS BLUE (reason)` before any PR exists) ·
`DONE (#PR)` · `DROPPED (reason)`. The session's PR updates its own row (after S04 is applied, the
runner's status PR marks merged sessions DONE; S04 item 6).

### When the plan changes

1. The agent edits this file in its PR: the affected rows, plus a line under "Change log" below.
2. It adds the `plan-change` label and makes the change the first line of the TLDR.
3. It appends the reason to `docs/DECISIONS.md` as "proposed, pending Blue".
4. **Merging is approval.** The runner only reads `main`, so an unmerged plan change steers nothing.

## Month one

| # | Session | Done when | Auth | Lane | Needs | Status |
|---|---|---|---|---|---|---|
| S01 | **Finish guardrails.** Blue does the clicks in docs/SETUP-GUARDRAILS.md; Claude then opens a test PR from the agent account and confirms it cannot merge without Blue's approval. | Test PR blocked without approval; merge audit quiet on a proper merge. | High | blue | PR #27 merged | DONE (#44) |
| S02 | **CI and dependency hygiene.** Pin GitHub Actions to commit SHAs; make CI a required check; `npm audit fix` for the 11 advisories with dictation and TTS regression checks. | CI green and required; advisories fixed or each one explained. | High | windows | S01 | DONE (#45) |
| S03 | **Plan to issues.** Labels (authority, lane, plan-change, needs-blue, sensitive, security-alert), task issue template, "1.1 Month 1" milestone, a GitHub Project board (Ready, Running, Needs Blue, Ready to merge, Done), and a workflow that keeps one issue per session in sync with this file. Sync issues are titled `Sxx: <title>`, and the sync matches only that prefix on issues it created itself. | Board mirrors this table automatically. | Max | cloud | S01 | READY |
| S04 | **All-day runner and digest.** The runner fires through the day: it fixes its own open PRs, then starts every unclaimed READY session up to a parallel cap, stops cleanly at a usage limit and resumes on a later fire, and sends one evening digest. Details below the table. | Two consecutive days run unattended through multiple fires; a usage-limit stop resumes on its own on a later fire; the digest arrives both evenings. | High | blue | S01 | READY |
| S26 | **Codex builder lane.** Codex, linked to `ABlueAgent`, builds sessions as a second builder: it claims a session before starting, so Claude and Codex never take the same one, follows AGENTS.md, and gets the same Opus review plus Codex's automatic review. Sensitive. Details below the table. | One session built end to end by Codex: a PR authored by `ABlueAgent` from a `codex/` branch with no Claude builder on it, an Opus review, and a Codex automatic review if one arrives (recorded either way), merged by Blue. | High | cloud | S04, checklist step 16 (Codex re-linked to `ABlueAgent`) | READY |
| S28 | **Agent profile refresh.** Update agent-roles/*.md from Blue's package (details from his agent-roles chat): the bodies, and any frontmatter changes the package asks for. The whole change is sensitive: role bodies set what each role is told, and frontmatter sets its tools and permissions. Run the role tests, then deploy with scripts/sync-roles.ps1. The package arrives one of two ways. (1) An issue titled `agent-roles package (S28)` (not starting with `Sxx:`, so S03's per-session issue sync never matches it), opened by `ABlueAI` and edited by no one else: an issue by anyone else, or one someone else has edited, never counts; the runner checks the author and the edit history before using it, and if it can't check them, the issue doesn't count; only the issue body counts, never its comments; and the session locks the issue's conversation to collaborators. (2) Blue hands it to an agent in its own session, which opens the PR as `ABlueAgent` (a PR Blue opens himself couldn't get the code-owner approval it needs). Until then the row stays `NEEDS BLUE (package)`. Before S04 is applied, an interactive session (on Blue's request) checks the issue's author and edit history and sets the row to READY in a PR; after that, the runner's status PR does it, with the same check in S04's prompt. The runner starts S28 once Blue merges that PR. | Role tests pass in CI (app/role-frontmatter.test.js, app/role-fence-policy.test.js, scripts/sync-roles.Tests.ps1); scripts/sync-roles.ps1 deploys on Blue's PC and Blue confirms the roles launch. | High | blue | S01, Blue's agent-roles package | NEEDS BLUE (package) |
| S05 | **Needs-you alerts.** Windows notification when a Mako pane needs input or a turn ends; setup note for phone alerts through Claude Remote Control. | Toast appears on a real Claude pane; phone alert documented. | Medium | windows | S01 | READY |
| S06 | **Process cleanup and link hardening.** Kill the whole process tree when a pane or Mako closes (the node-pty limitation); route the old `open-external` handler through the Quick Links URL policy; move local agents on Blue's PC from his git login to the `ABlueAgent` account (Mako already injects per-pane credentials). Sensitive. | No leftover claude.exe or node.exe after close; link tests pass; a PR opened by a local agent shows `ABlueAgent` as its author. Needs an `ABlueAgent` token from Blue (checklist step 14). | High | windows | S01, checklist step 14 | READY |
| S07 | **Stable and dev copies of Mako.** A dev instance uses its own settings folder and never takes over Claude hooks, so agents can change Mako while Blue keeps using it. | Both run side by side without touching each other's state. | High | windows | S06 | READY |
| S08 | **Session memory 1.** Record each pane's Claude session ID, role and worktree when it starts and stops. | Records survive a restart; covered by tests. | Max | cloud | S07 | READY |
| S09 | **Session memory 2.** On relaunch, offer Resume per pane (`claude --resume <id>`) or Start fresh; document transcript retention (`cleanupPeriodDays`). | Closing and reopening Mako brings the conversation back. | High | windows | S08 | READY |
| S10 | **One-click authority.** Minimum, Medium, High and Maximum in Mako, mapped to Claude permission modes (plan, acceptEdits, auto); Maximum sends the task to a cloud session instead of granting full permissions locally. Sensitive. | Each level launches with the right mode; Maximum never runs unsandboxed. | High | windows | S07 | READY |
| S11 | **Usage panel.** 5-hour and weekly usage with reset countdown (Claude's `/usage` data or ccusage). Claude Code's built-in auto-continue does the resuming. A warning at about 90% of either limit, and Pause and Resume buttons that turn the runner routine off and on, if that can be done safely (no claude.ai login stored in Mako without its own sensitive review); otherwise the button opens claude.ai/code/routines. Sensitive if it stores or uses a claude.ai login or token. | Panel matches `/usage` on Blue's account; the 90% warning shows; Pause stops the runner, or opens the routines page. | Medium | windows | S07 | READY |
| S12 | **Quick Links bundle.** Claude desktop, Codex app, GitHub PRs and Project board, Obsidian vault, Hexona, Hermes and Dodaios docs. | Links open; Blue confirms the Hexona URL. | Medium | blue | S01 | READY |
| S13 | **Obsidian Skills.** One-page OSS note quoting Blue's ADOPT; install kepano/obsidian-skills; private vault outside this public repo with an index that links to STATUS, PLAN and DECISIONS. | Agents can read and update the vault index. Blue installs the Obsidian app (2 minutes). | Medium | blue | S01 | READY |
| S14 | **Design tools and brief.** Install UI UX Pro Max; write the design brief; collect Blue's UI examples. | Brief plus Blue's examples in the repo. | Medium | blue | S01 | READY |
| S15 | **Research capture.** "Send this page to Reviewer" flow; evaluate Claude in Chrome on Windows; research agents stay read-only. | Blue sends a Reddit thread to a reviewer without copy and paste. | Medium | windows | S10 | READY |
| S16 | **Dodaios trial.** One-day sandboxed evaluation with no real credentials; report recommending keep Mako, adopt a piece, or fork. | Report and Blue's verdict recorded. | Minimum | blue | S01 | READY |
| S17 | **Design directions.** Two or three clickable concepts from Blue's examples. | Blue picks one. | Medium | blue | S14 | READY |
| S18 | **New layout, part 1.** Navigation, pane area and toolbar in the chosen design, behind a setting so the old layout stays available. | Daily use works in the new layout. | High | windows | S17 | READY |
| S27 | **Composer.** One Mako pane takes a large task and fans it out to several agents, and can split and compose sessions. A must-have early in 1.1 (Blue). Listed after S18 as Blue asked; its dependencies, final placement and details come from his separate plan-review chat. | Set by Blue's research. | High | windows | Blue's research | NEEDS BLUE (Blue's research) |
| S19 | **New layout, part 2.** Pane and status visuals; "needs you" stands out. | Blue accepts the look. | High | windows | S18 | READY |
| S20 | **New layout, part 3.** Library, Logs and settings restyled; old layout removed after Blue accepts. | One consistent design. | High | windows | S19 | READY |
| S21 | **Logo readability.** "M" variants at 16 to 48 px; Blue picks; taskbar and shortcut icons updated. | Blue can read the M on the taskbar. | Medium | blue | S07 | READY |
| S22 | **Marina research brief.** Charlotte County independent marinas from public sources (no Google Maps scraping): basics, likely pain points, outreach angles. Output goes in a private repo. | Brief delivered privately. | Minimum | cloud | S01 | READY |
| S23 | **Client paperwork drafts.** Intake questionnaire, scope-of-work template, contract template, bucket-of-hours and retainer terms. Blue builds the form in Hexona. | Blue approves the drafts. | Medium | blue | S22 | READY |
| S24 | **HighLevel connection.** Blue authorizes the GoHighLevel connector in claude.ai with a read-only token; one read-only workflow, such as listing new inquiries. Sensitive. | Read-only workflow works; no writes possible. | High | blue | S23 | READY |
| S25 | **Month review.** What shipped, interruptions, fix rounds, usage against the plan; month two drafted as a plan-change PR. | Month-two plan PR open. | Medium | cloud | S20 | READY |

### S04 details: all-day runner and digest

1. **Limits first.** From official docs only, record the claude.ai routine limits in docs/RUNNER.md
   and pick the interval from them. Read on 2026-10-19 at https://code.claude.com/docs/en/routines
   (routines are a research preview, so S04 re-checks):
   - the minimum interval is one hour; more frequent cron expressions are rejected;
   - scheduled runs are capped at 100 per hour per account; the page states no daily cap. An
     earlier note in this repo (docs/handoff/GPT-BRIEFING-2026-10-17.md) said routines had daily
     caps, so S04 confirms the daily limit before applying any schedule more frequent than daily;
   - at the subscription usage limit, new runs are rejected until the usage window resets, unless
     usage credits (paid, metered overage) are turned on;
   - a run set exactly on the hour can start several minutes late.
   - not yet researched: whether a cloud session can read plan usage (S04 item 9).

   Proposed: every hour at :07, around the clock (`CRON_TZ=America/New_York 7 * * * *`), so work
   resumes soon after any usage reset, overnight too. A fire with nothing to do ends after a quick
   check. If day one shows idle fires costing real usage, drop to every 2 hours.
2. **Each fire.** It runs today's gate, then fixes the open PRs the runner itself opened (marked
   with a `runner` label; interactive sessions also open PRs as `ABlueAgent` from `claude/` branches,
   and the runner leaves those alone; when S04 is applied, it labels today's runner's open PRs),
   then runs `pr-reviewer` on any open Codex PR that has no "Independent review (Opus)" for its
   latest head and posts it (AGENTS.md step 3); a Codex PR is one from a `codex/` branch in this
   repo, authored by `ABlueAgent`, with a matching `agent-claimed` issue (a fork PR, or one by
   anyone else, never counts), then starts every READY session
   whose Needs are met and that nobody has claimed, up to
   the parallel cap. A claim is an open PR by `ABlueAgent` or `ABlueAI` titled with the session number
   (`Sxx:`; a fork PR from anyone else never counts), or an open issue
   with the `agent-claimed` label (how Codex claims, S26). S03's per-session sync issues are not
   claims, whatever their titles. S04 creates the label if S03 hasn't. A builder opens its PR as a draft first; that is the claim. No two fires work on the same PR or session at once: a build can outlast
   the hour, so S04 defines a lock a later fire can see (for example an `agent-running` label with a
   start time that expires after a set number of hours) and a separate marker for "paused at a usage
   limit", since draft alone can't tell the two apart.
3. **Parallel cap.** One setting in docs/RUNNER.md, read each fire: 1 on Pro; 2 after Blue's Max 5x
   upgrade on 2026-10-21; 3 once a week of usage shows there is room. It counts every session being
   built across overlapping fires, not sessions per fire.
4. **Usage limits.** Builders commit and push after every meaningful step, because a session at the
   limit can't act. If it still can, it marks the PR draft with a one-line status and ends. A later
   fire resumes after the reset. Never paid extra usage: S04 adds a checklist step for Blue to
   confirm usage credits are off.
5. **Dependencies.** A session whose Needs include an unmerged PR waits for Blue's merge (no stacked
   PRs, AGENTS.md). Independent sessions never wait.
6. **Fewer merge conflicts between parallel PRs** (AGENTS.md rule, changed with this plan change):
   - session PRs change only their own row in this table (unless they carry a plan change with the
     `plan-change` label, AGENTS.md), and add only the checklist steps and decisions they need;
   - the runner's status PR marks merged sessions DONE, replacing today's "update the row in your
     next PR" (S04's new prompt drops that line);
   - STATUS.md is updated by one status PR that the runner keeps open and refreshes, and by PRs that
     change the state outside a session (plan changes, guardrails, releases);
   - a new checklist step takes the next number not used on `main` or by an open PR. If two PRs still
     end up with the same number, the one that merges second renumbers by merging `main`, never by
     force-pushing;
   - this reduces conflicts but doesn't remove them: git also flags edits to adjacent rows. The PR
     that hits one merges `main` and resolves it, never force-pushing.
7. **Evening digest.** One phone notification at a set time (default 8 PM Eastern, one setting): PRs
   ready to merge with TLDR links, needs-Blue questions, and blocked items. Other fires notify only
   when Blue has something to answer; S04 confirms that hourly fires don't each send a phone
   notification, and sets the routine's notifications so they don't. Each PR's line in the digest,
   and every other session-end notice, starts with `READY TO MERGE` (CI green, review done with every finding
   fixed or answered, PR marked ready) or `NOT READY: <reason>` (AGENTS.md "How work flows" step 5); Blue merges only on
   `READY TO MERGE`.
8. **Applying it.** The S04 PR proposes the new prompt and schedule in docs/RUNNER.md. The prompt
   carries AGENTS.md's Codex-handle rule into every comment, review post and summary it writes. An
   interactive session applies them to the scheduled task in the same sitting as Blue's merge,
   because the old prompt's one-at-a-time limit ends when S04 merges; the S04 PR adds that as a
   checklist step ("right after merging S04, start a session to apply its prompt") and rewrites the
   checklist's "Every day, once the runner is on" section to the one evening sitting. The runner never edits
   itself.
9. **Pause button and usage alert** (Blue: "really more of a pause button here and or on Mako ... so
   i can still use claude as needed without burning through all usage"). No automatic stop at a
   fixed percentage. S04:
   - documents the stop button in docs/RUNNER.md and the checklist: turn the routine off at
     claude.ai/code/routines and stop any running cloud sessions; turn it back on to resume;
   - researches, from official docs, whether a cloud session can read plan usage. If it can, the
     runner sends Blue one phone notice once usage passes about 90% of the 5-hour or weekly limit;
   - the runner never starts a new session late in a usage window (S04 sets the threshold from what
     it can read; if it can read nothing, it says so and relies on the clean stop in item 4). This
     only holds back new starts; it never stops a running session.
   - S11 adds the same 90% warning and Pause and Resume buttons in Mako.

### S26 details: Codex builder lane

1. **Claims.** Codex takes a READY session only through a claim the runner's check sees (S04 item 2):
   an open issue labeled `agent-claimed`, which the runner opens when it hands Codex a session, then
   Codex's own PR titled `Sxx:`, which sets its own row to IN PROGRESS. The trial build in S26's
   done-when happens before S26 is merged, so the runner can't hand it over yet. Instead, the S26
   builder (a Claude session) opens the claim issue and locks its conversation to collaborators, as
   item 2 requires; Blue comments on it as `ABlueAI` asking that
   session to hand Codex the task (allowed by AGENTS.md); the session posts the hand-off, then runs
   `pr-reviewer` on Codex's PR and posts "Independent review (Opus)" for it.
2. **Rules.** Codex follows AGENTS.md (it reads that file directly). The claim issue is on a public
   repo, so the runner locks its conversation to collaborators and its hand-off tells Codex to act
   only on that comment; S26 checks what context Codex reads from the thread. It opens PRs as `ABlueAgent` from
   its own `codex/` branches, never Claude's. It gets the same "Independent review (Opus)", run and
   posted by the Claude session that handed it the task, or the next runner fire if that session
   has ended (AGENTS.md step 3), plus Codex's automatic review. The runner's "fix own PRs" step leaves Codex's
   PRs to Codex; the S26 PR defines who fixes CI failures and review findings on Codex's PRs (a
   fix-request exception scoped to Codex's own PR, or Claude takes the fixes), and until then each
   request needs a comment by `ABlueAI`. AGENTS.md "How work flows" step 3 lets the Claude session that handed Codex the task
   (or the next runner fire) run `pr-reviewer` on Codex's PR, because Codex can't (added by this plan change, so the trial build
   below follows the current rules); the S26 PR refines it if needed and updates the "builder runs
   it" wording in `.claude/agents/pr-reviewer.md` to match (sensitive, `.claude/`). Once Codex is linked
   to `ABlueAgent`, any comment by that account that mentions Codex by its handle may start a Codex
   task. AGENTS.md "Security rules" forbids writing it unless a comment by `ABlueAI` or Blue's own
   message to the agent asks (this plan change). The S26 PR adds the runner's claim-issue hand-off
   as an exception in AGENTS.md, together with the safeguards above (locked issue, a hand-off that
   tells Codex to act only on that comment, the fix path). Nothing enforces that technically, so S26 treats it as a rule, not a control. S26 re-checks how Codex reads mentions.
3. **How Codex starts.** Options, from search-result extracts of developers.openai.com (the site was
   blocked from the session that wrote this, 2026-10-19; S26 reads the pages themselves, plus which account Codex's PRs are attributed to
   and whether a Codex review could ever count as an approval, which token Codex pushes with (the
   linked user's OAuth or the app installation), and then adds Codex to the "who can
   merge" table in docs/SETUP-GUARDRAILS.md):
   - (a) **Codex app scheduled tasks** run on Blue's PC only while it is on and the app is open, in
     the Windows sandbox. They push with the PC's git login, which is Blue's until S06 moves it.
   - (b) **An at-codex task comment** (the handle followed by the task) from the linked account starts a Codex cloud task (Linux) that
     can push to the branch. The docs call this path a "legacy cloud chat", so it may change.
   - (c) **The Codex GitHub Action** needs a paid OpenAI API key: new spending, rejected.
   - (d) **ChatGPT's event-triggered tasks** run on the web; not verified for coding work.

   Not verified: whether a mention on an issue, as opposed to a PR, starts a task; if it doesn't,
   the runner opens a draft claim PR instead of an issue.

   Pick: (b). The runner posts the at-codex task comment as `ABlueAgent` on the claim issue, so Codex
   works while Blue's PC is off. Add (a) for work that needs a real Windows check once S06 has moved
   local agents to `ABlueAgent`.
4. **Default split.** Codex takes windows-lane sessions it can verify on the Windows CI checks (path
   b), or in its Windows sandbox (path a, only after S06). Claude takes the rest.
5. **No dependency on it.** Codex usage stays within ChatGPT Plus, with no credits bought. Nothing
   waits on Codex: if Blue drops ChatGPT, Claude takes every session.

### Blue's inputs this month

S01 GitHub clicks (about 20 minutes) · S06 `ABlueAgent` token for local agents (checklist step 14) · S04 time zone (given 2026-10-18: Eastern) and digest time (default 8 PM) · S12 Hexona URL · S13 install
Obsidian · S14 UI examples · S16 Dodaios verdict · S17 pick a design · S21 pick a logo · S23 approve
paperwork · S24 authorize HighLevel · S26 re-link Codex to `ABlueAgent` (checklist step 16, proposed) · S27
Composer research · S28 agent-roles package · every merge.

## Month two and later (not scheduled yet)

Brother's separate Windows install and packaging (target April 2027; Smart App Control and code-signing
decision) · cost reporting beyond the usage panel · command palette · per-task setup scripts and ports ·
voice-addressed panes · Microsoft 365 through Claude's connector instead of a built-in mail panel ·
Hermes trial · any work orders from the Dodaios verdict.

Dropped, with reasons in docs/DECISIONS.md once Blue confirms: Jev (paid classifier, nothing to
solve) · claude-mem (telemetry on by default, reads Claude credentials, overlaps built-in memory and
Obsidian) · Quick Check (replaced by PR review and CI) · in-app diff viewer and PR watcher (GitHub
does both) · Vibe Kanban (removed in 1.0).

## Change log

- 2026-10-17: plan created (PR #27).
- 2026-10-17: S04 start time set to 8:01 AM local, with the prerequisite check (Blue).
- 2026-10-18: step 8 (Max 5x) dropped from the runner's gate; it builds on Pro, one session at a time, until Blue upgrades on 2026-10-21 (Blue).
- 2026-10-19: S06 gains the local-agent account move (proposed, pending Blue; PR #44).
- 2026-10-19: S01 marked DONE (#44). Evidence: agent PR #39 stayed blocked until Blue approved it (checklist 7f); the merge audit passed on the #41 merge (`8846eed`, checklist 12). Moving local agents to the agent account was not in S01's done-when, so it is added to S06 (plan change, pending Blue).
- 2026-10-19: the S06 local-agent account move and checklist step 14 approved: Blue merged PR #44 (`80a8dac`, 13:58 UTC).
- 2026-10-19 (proposed, pending Blue): S04 rewritten from "Daily runner and digest" into "All-day runner and digest", after Blue asked for a runner that works all day while he reviews and merges once in the evening (docs/DECISIONS.md, 2026-10-19). S04's Needs change from "S01, S03" to "S01": the runner reads this table and open PRs and issues on GitHub, not S03's board, which only mirrors them, so the runner takes S04 right after S03 (S02 is done). S03's row now says its sync issues are titled `Sxx: <title>` and that the sync matches only that prefix on issues it created itself, so Blue's S28 package issue is never touched. "How this plan runs" now describes the all-day runner and the evening sitting. New session S26 "Codex builder lane" (needs S04 and checklist step 16, Blue's Codex re-link). Because the runner works in table order, S26 comes ahead of S05 to S25 once S04 is merged and step 16 is ticked; that is intended, so Codex starts building early and in parallel. The parallel cap on Max 5x goes from "at most 2" to 2, then 3 after a week of usage shows room. AGENTS.md: once S04 is merged and applied, session PRs stop editing STATUS.md, to avoid conflicts between parallel PRs; on merge, a checklist-numbering rule, a rule against writing Codex's handle in GitHub text, and a step 3 rule that a Claude session (or the next runner fire) reviews Codex's PRs.
- 2026-10-19 (proposed, pending Blue; same PR, Blue's additions): every session-end message and phone notification starts with "READY TO MERGE" or "NOT READY: <reason>" (AGENTS.md "How work flows" step 5, S04 item 7). Pause button and usage alert instead of an automatic stop: S04 item 9 documents the stop button, researches whether a cloud session can read plan usage for a 90% notice, and never starts a session late in a usage window; S11 gains a 90% warning and Pause and Resume buttons. New S27 "Composer" (a must-have early in 1.1, listed after S18, NEEDS BLUE for Blue's research) and S28 "Agent profile refresh" (after S26, needs S01 and Blue's agent-roles package; once his package arrives the runner takes it ahead of S05 to S25, which is intended, because it applies material Blue has just handed over). The month now has 28 sessions.
