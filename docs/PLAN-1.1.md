# Mako 1.1: month-one plan (26 sessions)

Drafted 2026-10-17 by Claude for Blue. Approved when the PR that adds it is merged. Changes only through
`plan-change` PRs (rules below).

**Latest change (2026-10-19, proposed, pending Blue):** S04 becomes an all-day runner that fires
through the day, works sessions in parallel up to a cap and sends one evening digest; S04 now needs
only S01; new session S26 adds Codex as a second builder. Details below the session table and in
the change log.

## How this plan runs

- **One session = one pull request.** Each session has a goal, a "done when", an authority level, a
  lane and its dependencies.
- **Lanes:** `cloud` runs without Blue's PC; `windows` needs a Windows check (CI, Blue's PC or the
  Codex Windows sandbox); `blue` needs Blue's input before it can finish.
- **The all-day runner** (built in S04) fires many times a day on `main`. Each fire first fixes its own
  open PRs, then starts every `READY` session whose dependencies are merged and that nobody has
  claimed, up to the parallel cap. A session that needs Blue posts its question in the PR and the
  runner moves on, so nothing waits idle. Until S04 is merged and applied, today's runner (docs/RUNNER.md) fires
  once a day at 8:01 AM Eastern and runs one session at a time.
- **Parallel work:** the cap is one setting (S04 puts it in docs/RUNNER.md): 1 on Claude Pro, 2 to 3 on
  Max 5x after Blue's upgrade on 2026-10-21, to stay under the weekly cap; 3 or 4 on Max 20x.
- **Blue's day:** once S04 is merged, one sitting in the evening, 10 to 20 minutes: read the digest,
  answer anything marked "needs Blue", then approve and merge every PR that is ready.

### Status values

`READY` · `IN PROGRESS (#PR)` · `NEEDS BLUE (#PR)` · `DONE (#PR)` · `DROPPED (reason)`. The session's PR
updates its own row.

### When the plan changes

1. The agent edits this file in its PR: the affected rows, plus a line under "Change log" below.
2. It adds the `plan-change` label and makes the change the first line of the TLDR.
3. It appends the reason to `docs/DECISIONS.md` as "proposed, pending Blue".
4. **Merging is approval.** The runner only reads `main`, so an unmerged plan change steers nothing.

## Month one

| # | Session | Done when | Auth | Lane | Needs | Status |
|---|---|---|---|---|---|---|
| S01 | **Finish guardrails.** Blue does the clicks in docs/SETUP-GUARDRAILS.md; Claude then opens a test PR from the agent account and confirms it cannot merge without Blue's approval. | Test PR blocked without approval; merge audit quiet on a proper merge. | High | blue | PR #27 merged | DONE (#44) |
| S02 | **CI and dependency hygiene.** Pin GitHub Actions to commit SHAs; make CI a required check; `npm audit fix` for the 11 advisories with dictation and TTS regression checks. | CI green and required; advisories fixed or each one explained. | High | windows | S01 | READY |
| S03 | **Plan to issues.** Labels (authority, lane, plan-change, needs-blue, sensitive, security-alert), task issue template, "1.1 Month 1" milestone, a GitHub Project board (Ready, Running, Needs Blue, Ready to merge, Done), and a workflow that keeps one issue per session in sync with this file. | Board mirrors this table automatically. | Max | cloud | S01 | READY |
| S04 | **All-day runner and digest.** The runner fires through the day: it fixes its own open PRs, then starts every unclaimed READY session up to a parallel cap, stops cleanly at a usage limit and resumes on a later fire, and sends one evening digest. Details below the table. | Two consecutive days run unattended through multiple fires; a usage-limit stop resumes on its own on a later fire; the digest arrives both evenings. | High | blue | S01 | READY |
| S26 | **Codex builder lane.** Codex, linked to `ABlueAgent`, builds sessions as a second builder: it claims a session before starting, so Claude and Codex never take the same one, follows AGENTS.md, and gets the same Opus review plus Codex's automatic review. Details below the table. | One session built end to end by Codex: a PR authored by `ABlueAgent` from a `codex/` branch with no Claude builder on it, an Opus review and a Codex automatic review, merged by Blue. | High | cloud | S04, checklist step 16 (Codex re-linked to `ABlueAgent`) | READY |
| S05 | **Needs-you alerts.** Windows notification when a Mako pane needs input or a turn ends; setup note for phone alerts through Claude Remote Control. | Toast appears on a real Claude pane; phone alert documented. | Medium | windows | S01 | READY |
| S06 | **Process cleanup and link hardening.** Kill the whole process tree when a pane or Mako closes (the node-pty limitation); route the old `open-external` handler through the Quick Links URL policy; move local agents on Blue's PC from his git login to the `ABlueAgent` account (Mako already injects per-pane credentials). Sensitive. | No leftover claude.exe or node.exe after close; link tests pass; a PR opened by a local agent shows `ABlueAgent` as its author. Needs an `ABlueAgent` token from Blue (checklist step 14). | High | windows | S01, checklist step 14 | READY |
| S07 | **Stable and dev copies of Mako.** A dev instance uses its own settings folder and never takes over Claude hooks, so agents can change Mako while Blue keeps using it. | Both run side by side without touching each other's state. | High | windows | S06 | READY |
| S08 | **Session memory 1.** Record each pane's Claude session ID, role and worktree when it starts and stops. | Records survive a restart; covered by tests. | Max | cloud | S07 | READY |
| S09 | **Session memory 2.** On relaunch, offer Resume per pane (`claude --resume <id>`) or Start fresh; document transcript retention (`cleanupPeriodDays`). | Closing and reopening Mako brings the conversation back. | High | windows | S08 | READY |
| S10 | **One-click authority.** Minimum, Medium, High and Maximum in Mako, mapped to Claude permission modes (plan, acceptEdits, auto); Maximum sends the task to a cloud session instead of granting full permissions locally. Sensitive. | Each level launches with the right mode; Maximum never runs unsandboxed. | High | windows | S07 | READY |
| S11 | **Usage panel.** 5-hour and weekly usage with reset countdown (Claude's `/usage` data or ccusage). Claude Code's built-in auto-continue does the resuming. | Panel matches `/usage` on Blue's account. | Medium | windows | S07 | READY |
| S12 | **Quick Links bundle.** Claude desktop, Codex app, GitHub PRs and Project board, Obsidian vault, Hexona, Hermes and Dodaios docs. | Links open; Blue confirms the Hexona URL. | Medium | blue | S01 | READY |
| S13 | **Obsidian Skills.** One-page OSS note quoting Blue's ADOPT; install kepano/obsidian-skills; private vault outside this public repo with an index that links to STATUS, PLAN and DECISIONS. | Agents can read and update the vault index. Blue installs the Obsidian app (2 minutes). | Medium | blue | S01 | READY |
| S14 | **Design tools and brief.** Install UI UX Pro Max; write the design brief; collect Blue's UI examples. | Brief plus Blue's examples in the repo. | Medium | blue | S01 | READY |
| S15 | **Research capture.** "Send this page to Reviewer" flow; evaluate Claude in Chrome on Windows; research agents stay read-only. | Blue sends a Reddit thread to a reviewer without copy and paste. | Medium | windows | S10 | READY |
| S16 | **Dodaios trial.** One-day sandboxed evaluation with no real credentials; report recommending keep Mako, adopt a piece, or fork. | Report and Blue's verdict recorded. | Minimum | blue | S01 | READY |
| S17 | **Design directions.** Two or three clickable concepts from Blue's examples. | Blue picks one. | Medium | blue | S14 | READY |
| S18 | **New layout, part 1.** Navigation, pane area and toolbar in the chosen design, behind a setting so the old layout stays available. | Daily use works in the new layout. | High | windows | S17 | READY |
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
   - scheduled runs are capped at 100 per hour per account; the page states no daily cap (S04
     re-checks for one, since an hourly schedule depends on it);
   - at the subscription usage limit, new runs are rejected until the usage window resets, unless
     usage credits (paid, metered overage) are turned on;
   - a run set exactly on the hour can start several minutes late.

   Proposed: every hour at :07, around the clock (`CRON_TZ=America/New_York 7 * * * *`), so work
   resumes soon after any usage reset, overnight too. A fire with nothing to do ends after a quick
   check. If day one shows idle fires costing real usage, drop to every 2 hours.
2. **Each fire.** It runs today's gate, then fixes the open PRs authored by its login on `claude/`
   branches, then starts every READY session whose Needs are met and that nobody has claimed, up to
   the parallel cap. A claim is an open PR titled with the session number (`Sxx:`), or an open issue
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
   - session PRs change only their own row in this table, and add only the checklist steps and
     decisions they need;
   - the runner's status PR marks merged sessions DONE, replacing today's "update the row in your
     next PR" (S04's new prompt drops that line);
   - STATUS.md is updated by one status PR that the runner keeps open and refreshes, and by PRs that
     change the state outside a session (plan changes, guardrails, releases);
   - a new checklist step takes the next number not used on `main` or by an open PR. If two PRs still
     end up with the same number, the one that merges second renumbers by merging `main`, never by
     force-pushing.
7. **Evening digest.** One phone notification at a set time (default 8 PM Eastern, one setting): PRs
   ready to merge with TLDR links, needs-Blue questions, and blocked items. Other fires notify only
   when Blue has something to answer.
8. **Applying it.** The S04 PR proposes the new prompt and schedule in docs/RUNNER.md. The prompt
   carries AGENTS.md's Codex-handle rule into every comment, review post and summary it writes. An interactive
   session applies them to the scheduled task after Blue merges it. The runner never edits itself.

### S26 details: Codex builder lane

1. **Claims.** Codex takes a READY session only through a claim the runner's check sees (S04 item 2):
   an open issue labeled `agent-claimed`, which the runner opens when it hands Codex a session, then
   Codex's own PR titled `Sxx:`, which sets its own row to IN PROGRESS.
2. **Rules.** Codex follows AGENTS.md (it reads that file directly). It opens PRs as `ABlueAgent` from
   its own `codex/` branches, never Claude's. It gets the same "Independent review (Opus)", run and
   posted by the runner, plus Codex's automatic review. The runner's "fix own PRs" step leaves Codex's
   PRs to Codex. AGENTS.md "How work flows" step 3 has the builder run `pr-reviewer` itself, which
   Codex can't, so the S26 PR changes that step for Codex-built PRs (sensitive). Once Codex is linked
   to `ABlueAgent`, any comment by that account that mentions Codex by its handle may start a Codex
   task. AGENTS.md "Security rules" forbids writing it except when Blue asks in his own message or,
   once S26 is merged, for the runner's claim-issue hand-off (this plan change), so Codex builds
   nothing before S26 unless Blue asks. S26 re-checks how Codex reads mentions.
3. **How Codex starts.** Options, from official OpenAI docs read on 2026-10-19
   (developers.openai.com/codex; S26 re-checks them, plus which account Codex's PRs are attributed to
   and whether a Codex review could ever count as an approval, and then adds Codex to the "who can
   merge" table in docs/SETUP-GUARDRAILS.md):
   - (a) **Codex app scheduled tasks** run on Blue's PC only while it is on and the app is open, in
     the Windows sandbox. They push with the PC's git login, which is Blue's until S06 moves it.
   - (b) **An at-codex task comment** (the handle followed by the task) from the linked account starts a Codex cloud task (Linux) that
     can push to the branch. The docs call this path a "legacy cloud chat", so it may change.
   - (c) **The Codex GitHub Action** needs a paid OpenAI API key: new spending, rejected.
   - (d) **ChatGPT's event-triggered tasks** run on the web; not verified for coding work.

   Pick: (b). The runner posts the at-codex task comment as `ABlueAgent` on the claim issue, so Codex
   works while Blue's PC is off. Add (a) for work that needs a real Windows check once S06 has moved
   local agents to `ABlueAgent`.
4. **Default split.** Codex takes windows-lane sessions it can verify on the Windows CI checks (path
   b), or in its Windows sandbox (path a, only after S06). Claude takes the rest.
5. **No dependency on it.** Codex usage stays within ChatGPT Plus, with no credits bought. Nothing
   waits on Codex: if Blue drops ChatGPT, Claude takes every session.

### Blue's inputs this month

S01 GitHub clicks (about 20 minutes) · S06 `ABlueAgent` token for local agents (proposed) · S04 time zone (given 2026-10-18: Eastern) and digest time (default 8 PM) · S12 Hexona URL · S13 install
Obsidian · S14 UI examples · S16 Dodaios verdict · S17 pick a design · S21 pick a logo · S23 approve
paperwork · S24 authorize HighLevel · S26 re-link Codex to `ABlueAgent` (checklist step 16, proposed) · every
merge.

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
- 2026-10-19 (proposed, pending Blue): S04 rewritten from "Daily runner and digest" into "All-day runner and digest", after Blue asked for a runner that works all day while he reviews and merges once in the evening (docs/DECISIONS.md, 2026-10-19). S04's Needs change from "S01, S03" to "S01": the runner reads this table and open PRs and issues on GitHub, not S03's board, which only mirrors them, so S04 can run next and S03 in parallel. "How this plan runs" now describes the all-day runner and the evening sitting. New session S26 "Codex builder lane" (needs S04 and checklist step 16, Blue's Codex re-link), so this month now has 26 sessions instead of 25. The parallel cap on Max 5x goes from "at most 2" to 2, then 3 after a week of usage shows room. AGENTS.md: once S04 is merged, session PRs stop editing STATUS.md, to avoid conflicts between parallel PRs; on merge, a checklist-numbering rule and a rule against writing Codex's handle in GitHub text.
