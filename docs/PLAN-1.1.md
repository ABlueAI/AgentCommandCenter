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
- **Parallel work:** one session at a time on Claude Pro, until Blue upgrades to Max 5x on Wednesday
  2026-10-28 (BLUE-CHECKLIST.md step 8). After that, at most 2 sessions run at once on Max 5x, to stay
  under the weekly cap, once S04's runner supports parallel sessions. Raise to 3 or 4 on Max 20x.
- **Blue's day:** about 5 minutes in the morning to answer anything marked "needs Blue", and 10 to 20
  minutes in the evening reading TLDRs and merging.

### Status values

`READY` · `IN PROGRESS (#PR)` · `NEEDS BLUE (#PR)` · `HOLD (Blue)` · `DONE (#PR)` · `DROPPED (reason)`.
The session's PR updates its own row.

`HOLD (Blue)`: the runner skips the row (it only starts `READY` rows) until Blue says go. His "go" is
recorded, in his words, in docs/DECISIONS.md, and the same PR sets the row back to `READY`; merging that
PR releases it. A row whose Needs include a held session waits as well. S03's board and issue sync show
held rows as held (a Hold column or a `hold` label), never as Ready.

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
| S03 | **Plan to issues.** Labels (authority, lane, plan-change, needs-blue, sensitive, security-alert), task issue template, "1.1 Month 1" milestone, a GitHub Project board (Ready, Running, Needs Blue, Hold, Ready to merge, Done), and a workflow that keeps one issue per session in sync with this file. | Board mirrors this table automatically. | Max | cloud | S01 | READY |
| S04 | **Daily runner and digest.** A scheduled cloud session at **8:01 AM Blue's local time** (just after Claude's weekly usage reset) runs the next READY sessions; an evening digest lists ready PRs with TLDR links and open questions, sent as a notification. Each morning it first checks BLUE-CHECKLIST.md steps 1 and 7; until they are done it only sends a "waiting on step N" notice. | Two consecutive days run unattended and the digest arrives. | High | blue | S01, S03 | READY |
| S05 | **Needs-you alerts.** Windows notification when a Mako pane needs input or a turn ends; setup note for phone alerts through Claude Remote Control. | Toast appears on a real Claude pane; phone alert documented. | Medium | windows | S01 | READY |
| S06 | **Process cleanup and link hardening.** Kill the whole process tree when a pane or Mako closes (the node-pty limitation); route the old `open-external` handler through the Quick Links URL policy; move local agents on Blue's PC from his git login to the `ABlueAgent` account (Mako already injects per-pane credentials). Sensitive. | No leftover claude.exe or node.exe after close; link tests pass; a PR opened by a local agent shows `ABlueAgent` as its author. Needs an `ABlueAgent` token from Blue (checklist step 14). | High | windows | S01, checklist step 14 | READY |
| S07 | **Stable and dev copies of Mako.** A dev instance uses its own settings folder and never takes over Claude hooks, so agents can change Mako while Blue keeps using it. | Both run side by side without touching each other's state. | High | windows | S06 | READY |
| S08 | **Session memory 1.** Record each pane's Claude session ID, role and worktree when it starts and stops. | Records survive a restart; covered by tests. | Max | cloud | S07 | READY |
| S09 | **Session memory 2.** On relaunch, offer Resume per pane (`claude --resume <id>`) or Start fresh; document transcript retention (`cleanupPeriodDays`). | Closing and reopening Mako brings the conversation back. | High | windows | S08 | READY |
| S10 | **One-click authority.** Minimum, Medium, High and Maximum in Mako, mapped to Claude permission modes (plan, acceptEdits, auto); Maximum sends the task to a cloud session instead of granting full permissions locally. Sensitive. | Each level launches with the right mode; Maximum never runs unsandboxed. | High | windows | S07 | READY |
| S11 | **Usage panel.** 5-hour and weekly usage with reset countdown (Claude's `/usage` data or ccusage). Claude Code's built-in auto-continue does the resuming. | Panel matches `/usage` on Blue's account. | Medium | windows | S07 | READY |
| S12 | **Quick Links bundle.** Claude desktop, Codex app, GitHub PRs and Project board, Obsidian vault, Hexona, Hermes and Dodaios docs. | Links open; Blue confirms the Hexona URL. | Medium | blue | S01 | READY |
| S13 | **Obsidian Skills.** One-page OSS note quoting Blue's ADOPT; install kepano/obsidian-skills; private vault outside this public repo with an index that links to STATUS, PLAN and DECISIONS. | Agents can read and update the vault index. Blue installs the Obsidian app (2 minutes). | Medium | blue | S01 | READY |
| S14 | **Design tools and brief.** Install UI UX Pro Max; write the design brief, covering a main dashboard plus task-specific layouts Blue can switch between (for example coding, research and business; Blue chooses the final set); collect Blue's UI examples. | Brief plus Blue's examples in the repo. | Medium | blue | S01 | HOLD (Blue) |
| S15 | **Research capture.** "Send this page to Reviewer" flow; evaluate Claude in Chrome on Windows; research agents stay read-only. | Blue sends a Reddit thread to a reviewer without copy and paste. | Medium | windows | S10 | READY |
| S16 | **Composer research (includes the Dodaios trial).** Research for the Composer (one Mako pane that takes a large task, fans it out to several agents, and lets Blue compose and split sessions from it) and for workflow automation. Any hands-on trial, including the one-day Dodaios trial, runs only in a sandbox with no real credentials. Scope and what it must cover: "S16 details" below the table. | `docs/decisions/OSS-composer.md` exists in the AGENTS.md OSS shape: each option has a verdict proposal (ADOPT, FORK, PROTOTYPE, PATTERN-MINE or BUILD FRESH) and a blank for Blue's verdict, word for word, and it ends with an open-questions list for Blue. Blue's verdict is then recorded. | Minimum | blue | S01 | READY |
| S17 | **Design directions.** Two or three clickable concepts from Blue's examples. | Blue picks one. | Medium | blue | S14 | HOLD (Blue) |
| S18 | **New layout, part 1.** Navigation, pane area and toolbar in the chosen design, behind a setting so the old layout stays available. | Daily use works in the new layout. | High | windows | S17 | HOLD (Blue) |
| S19 | **New layout, part 2.** Pane and status visuals; "needs you" stands out. | Blue accepts the look. | High | windows | S18 | HOLD (Blue) |
| S20 | **New layout, part 3.** Library, Logs and settings restyled; old layout removed after Blue accepts. | One consistent design. | High | windows | S19 | HOLD (Blue) |
| S21 | **Logo readability.** "M" variants at 16 to 48 px; Blue picks; taskbar and shortcut icons updated. | Blue can read the M on the taskbar. | Medium | blue | S07 | READY |
| S22 | **Marina research brief.** Charlotte County independent marinas from public sources (no Google Maps scraping): basics, likely pain points, outreach angles. Output goes in a private repo. | Brief delivered privately. | Minimum | cloud | S01 | READY |
| S23 | **Client paperwork drafts.** Intake questionnaire, scope-of-work template, contract template, bucket-of-hours and retainer terms. Blue builds the form in Hexona. | Blue approves the drafts. | Medium | blue | S22 | READY |
| S24 | **HighLevel connection.** Blue authorizes the GoHighLevel connector in claude.ai with a read-only token; one read-only workflow, such as listing new inquiries. Sensitive. | Read-only workflow works; no writes possible. | High | blue | S23 | READY |
| S25 | **Month review.** What shipped, interruptions, fix rounds, usage against the plan; month two drafted as a plan-change PR. | Month-two plan PR open. | Medium | cloud | runs in the last week of month one, from 2026-11-14 | READY |

### S16 details: Composer research

Background: the Composer is not in this plan yet. Its ancestor is the deferred "Coordinator"
(docs/source-material/2026-07-14-browser-transfer/originals/BLUE-HELM-PROGRESS-MAP-7-1-2026.docx,
sections 4 and 5; the last line of agent-roles/operator.md; docs/PROJECT-STATE.md:101;
BLUE-HELM-MASTER-STATUS.md R15, around line 2842). The Operator role (agent-roles/operator.md) is not
a Composer shell: it is a fenced marketing role that can't start or read other panes, and S16 leaves it
unchanged.

**Options to cover:**

- **Dodaios** (https://github.com/Dodaios/Dodaios, formerly Personal Jarvis): the one-day sandboxed
  trial, with no real credentials. Cover its fan-out to several panes, the voice "person you talk to",
  persistent agents, summaries and updates, Windows install (from its docs; a hands-on Windows install
  runs only in a sandbox, such as the Codex Windows sandbox, with no real credentials), licence and
  telemetry. Blue named it, so
  ADOPT or FORK of the relevant piece is the default; narrowing that to "study and rebuild" needs his
  OK.
- **Claude desktop's linked sessions**, the pattern Blue named in his 2026-10-20 plan-review brief
  (the Composer fans work out to several agents the way linked sessions do), and **Claude Code Agent
  Teams and subagents**, also listed in that brief. The brief itself is not in the repo; Blue's words
  from that chat are in docs/DECISIONS.md, 2026-10-20.
- **Microsoft Conductor** (already in docs/research/RESEARCH-mako-1.1-2026-10-16.md, section J).
- **The R15 pattern mine:** parallel-code, crystal, Emdash.
- **Cloudroom** (davidondrej/cloudroom-core and cloudroom-gui): verify its Windows support on GitHub.
  As read on 2026-10-20 it is macOS plus a Linux alpha, which would make it pattern-mine only.
- **Workflow automation:** Gumloop as Blue's UX template. It is closed, paid SaaS, so no adoption
  without Blue's OK on spending. Also n8n (check its licence) and Activepieces as open-source options.

**Must cover:** how a Composer fits Mako's guardrails (authority levels, S10; the usage cap and
parallel cap, S04; Blue merging everything); that it would be a new, sensitive role, because it starts
panes and reads their output; and how its voice reuses Mako's existing whisper STT and Kokoro TTS.

**Open questions for Blue**, listed at the end of OSS-composer.md, plus any the research raises:

1. Does the Composer only split and dispatch work, or also review and merge-brief it? (Only Blue merges
   either way.)
2. Local panes, cloud sessions, or both?
3. Does it start agents itself, or propose a split that Blue approves?
4. How much usage can one Composer task spend?
5. Voice: always listening (wake word), or push to talk?
6. Updates: in the app only, on the phone, or spoken?
7. One persistent "chief of staff" with memory, or one Composer per task?
8. Are workflow automations part of the Composer, or a separate feature?

Composer build sessions are added by a later plan change, after Blue's verdict on S16 (see "Month two
and later").

### Blue's inputs this month

S01 GitHub clicks (about 20 minutes) · S06 `ABlueAgent` token for local agents (checklist step 14) · S04 time zone (given 2026-10-18: Eastern, 8:01 AM) · S12 Hexona URL · S13 install
Obsidian · say go on the UI (S14, S17–S20; checklist step 18) · S14 UI examples · S16 Composer verdict
(checklist step 19) · S17 pick a design · S21 pick a logo · S23 approve paperwork · S24 authorize
HighLevel · every merge.

## Month two and later (not scheduled yet)

Brother's separate Windows install and packaging (target April 2027; Smart App Control and code-signing
decision) · cost reporting beyond the usage panel · command palette · per-task setup scripts and ports ·
voice-addressed panes · Microsoft 365 through Claude's connector instead of a built-in mail panel ·
Hermes trial · Composer build sessions, added by a later plan change after Blue's verdict on S16 (target:
alongside or after S18–S20) · workflow automations (after S16) · any other work orders from the S16
verdict.

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
- 2026-10-20: the Max 5x upgrade moves from Wednesday 2026-10-21 to Wednesday 2026-10-28, so Blue can use his remaining Pro resets; the runner stays at one session at a time on Pro until then, and "Parallel work" now says so (Blue; docs/DECISIONS.md 2026-10-20).
- 2026-10-20 (proposed, pending Blue; PR #48): new status `HOLD (Blue)`; S14 and S17 to S20 (the UI sessions) set to `HOLD (Blue)` until Blue says go; S14's brief adds a main dashboard plus task-specific layouts; S16 widened from "Dodaios trial" into "Composer research (includes the Dodaios trial)", with "S16 details" below the table; S25's Needs change from S20 (now held) to "runs in the last week of month one, from 2026-11-14"; Blue's inputs gain "say go on the UI" and the S16 Composer verdict; "Month two and later" gains Composer build sessions and workflow automations, both after S16. S21 (logo) stays READY. S03's board and sync must show held rows as held, not Ready (S03's board gains a Hold column). Blue's words are in docs/DECISIONS.md, 2026-10-20.
