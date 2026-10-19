# Mako 1.1: month-one plan (25 sessions)

Drafted 2026-10-17 by Claude for Blue. Approved when the PR that adds it is merged. Changes only through
`plan-change` PRs (rules below).

## How this plan runs

- **One session = one pull request.** Each session has a goal, a "done when", an authority level, a
  lane and its dependencies.
- **Lanes:** `cloud` runs without Blue's PC; `windows` needs a Windows check (CI, Blue's PC or the
  Codex Windows sandbox); `blue` needs Blue's input before it can finish.
- **The daily runner** (built in S04) starts each morning on `main`, picks the next `READY` sessions
  whose dependencies are merged, and runs them. A session that needs Blue posts its question in the PR
  and the runner moves on to the next one, so nothing waits idle.
- **Parallel work:** at most 2 sessions run at once on the Claude Max 5x plan, to stay under the weekly
  cap. Raise to 3 or 4 on Max 20x.
- **Blue's day:** about 5 minutes in the morning to answer anything marked "needs Blue", and 10 to 20
  minutes in the evening reading TLDRs and merging.

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
| S04 | **Daily runner and digest.** A scheduled cloud session at **8:01 AM Blue's local time** (just after Claude's weekly usage reset) runs the next READY sessions; an evening digest lists ready PRs with TLDR links and open questions, sent as a notification. Each morning it first checks BLUE-CHECKLIST.md steps 1 and 7; until they are done it only sends a "waiting on step N" notice. | Two consecutive days run unattended and the digest arrives. | High | blue | S01, S03 | READY |
| S05 | **Needs-you alerts.** Windows notification when a Mako pane needs input or a turn ends; setup note for phone alerts through Claude Remote Control. | Toast appears on a real Claude pane; phone alert documented. | Medium | windows | S01 | READY |
| S06 | **Process cleanup and link hardening.** Kill the whole process tree when a pane or Mako closes (the node-pty limitation); route the old `open-external` handler through the Quick Links URL policy. Sensitive. | No leftover claude.exe or node.exe after close; link tests pass. | High | windows | S01 | READY |
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

### Blue's inputs this month

S01 GitHub clicks (about 20 minutes) · S04 time zone (given 2026-10-18: Eastern, 8:01 AM) · S12 Hexona URL · S13 install
Obsidian · S14 UI examples · S16 Dodaios verdict · S17 pick a design · S21 pick a logo · S23 approve
paperwork · S24 authorize HighLevel · every merge.

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
- 2026-10-19: S01 marked DONE (#44). Evidence: agent PR #39 stayed blocked until Blue approved it (checklist 7f); the merge audit passed on the #41 merge (`8846eed`, checklist 12). Moving local agents to the agent account was not in S01's done-when and has no owning session yet (see STATUS.md).
