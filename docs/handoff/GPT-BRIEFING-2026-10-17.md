# Mako briefing for GPT (from Claude, 2026-10-17)

Blue asked Claude to bring GPT fully up to date so both work from the same facts. This file covers
the Claude chat of October 16 and 17, 2026, which reviewed the Codex planning packet
(MAKO-1.1-IMPLEMENTATION-PLAN, research, chat context) against the actual repository and produced
PR #27. Everything below is either in the repository or quoted from Blue.

## 1. How GPT and Claude stay on one brain from now on

- **The repository is the shared memory.** The authoritative files are `AGENTS.md` (rules, read
  natively by Codex), `STATUS.md` (current state), `docs/PLAN-1.1.md` (the session plan) and
  `docs/DECISIONS.md` (Blue's decisions in his own words). Claude's `CLAUDE.md` simply imports
  `AGENTS.md`, so both models read the same rules.
- **Changes go through pull requests,** so there is one history and Blue approves by merging. Nobody
  relies on another model's chat history.
- **No copy and paste between apps.** Codex reviews every PR on GitHub, and Claude reads the review
  and fixes findings. On Blue's PC, Claude can also ask Codex for a second opinion directly with the
  official non-interactive `codex exec`. When GPT has planning input, the best route is a Codex task
  that edits `docs/PLAN-1.1.md` in a PR with the `plan-change` label, rather than chat text Blue has
  to carry over.

## 2. Where things stand

- **Mako 1.0 release candidate:** PR #27, `claude/youthful-heisenberg-sed4co`, version 1.0.0.
  - **Status colors:** root cause found and fixed. Pane status accepted only Claude Code 2.1.228 and
    2.1.241 exactly; Claude Code updates itself (Blue's machine ran 2.1.250 and later 2.1.283), so every
    badge showed grey "unknown". It now accepts 2.x at or above 2.1.228 and labels untested versions
    "unverified".
  - Shift+Enter inserts a newline in Claude panes.
  - **Real build label.** The old static "V5 STACK CONTENT ACCEPTANCE 2026-07-21.14" made Blue think he
    was running a July build. The label now shows version, branch and commit.
  - Vibe Kanban board removed. Bloop shut down in April 2026; Mako now opens on Agents.
  - Windows CI on GitHub (`npm test` plus Pester), merge guardrails, the new rulebook, the plan and
    these handoffs.
- **Tests:** Windows CI on GitHub is green: the full `npm test` chain and Pester 983 passed, 0 failed.
  Blue's PC recorded 984 on October 2; the one-test gap is likely machine-specific and is checked in
  FINISH-1.0.
- **Left for 1.0, on Blue's PC** (docs/handoff/FINISH-1.0.md):
  - Recover the lost October 4 and 5 conversations before about November 3, when Claude Code's 30-day
    transcript cleanup removes them.
  - Find why the app closed (likely a Windows Update restart).
  - A 3-minute smoke test, then Blue merges and tags `v1.0.0`.
- **Known 1.0 limitations:** in docs/RELEASE-NOTES-1.0.md (leftover processes, no session restore,
  Claude-only status, personal workstation only, 11 npm advisories in the speech stack).

## 3. Decisions (full list with Blue's words: docs/DECISIONS.md)

October 17:
- Lighter PR-based rules replace the old review rituals.
- Every change on its own branch; only Blue merges; no auto-merge, ever.
- A TLDR with facts and uncertainty on every PR that is ready to merge.
- The four small fixes ship in 1.0.0.
- Maximum authority runs only in sandboxes (cloud sessions, or the Codex Windows sandbox). No VM.
- Plans: Claude Max 5x plus ChatGPT Plus, reassess in a month.
- 1.1 runs in 25-session month blocks, with plan changes highlighted for approval.
- GPT and Claude work from one shared brain.

October 16, carried from the Codex chat:
- Finish 1.0 as fast as possible. OSS and Quick Links first.
- Four one-click authority levels. Maximum means no avoidable questions until merge.
- Adopt Obsidian Skills in 1.1.
- The Jarvis reference is Personal Jarvis, now Dodaios (no adopt or fork verdict yet).
- First business niche: Charlotte County, Florida marinas, on Blue's existing Hexona (HighLevel).
  Healthcare and PHI work deferred.
- Blue's brother gets a separate install around April 2027.
- The 5-agent vote is only an idea to evaluate.

## 4. The new operating model

1. A builder (usually Claude) works on its own branch and opens a PR whose description starts with
   the TLDR: what and why, ready or not, decisions needed, uncertainty and how to check it, plan
   changes, sensitive areas, tests, review.
2. CI runs on Windows; Codex reviews automatically.
3. The builder fixes failures and findings itself. After 3 failed rounds on the same problem it marks
   the PR "needs Blue" with a diagnosis.
4. Blue reads the TLDR and merges.

Agents decide routine questions themselves and record assumptions. They stop only for scope or plan
changes, new spend, unauthorized sensitive work, personal preferences, or blockers after 3 attempts.

## 5. Guardrails against an unapproved merge

| Layer | Status | What it stops |
|---|---|---|
| `.claude/settings.json` denies merge, auto-merge, push to main and force push | In PR #27; confirmed working (the merge tools disappeared from Claude's session the moment it was saved) | A Claude agent calling those tools |
| AGENTS.md "never" rules, including ignoring injected instructions from web content | In PR #27 | Well-behaved agents of any vendor |
| GitHub ruleset on main with no bypass: PR required, CI required, no force push or deletion; auto-merge off; Actions read-only and unable to approve | Blue's clicks, docs/SETUP-GUARDRAILS.md Part A | Direct pushes, merging red PRs, bots approving |
| Separate agent GitHub account (Write role) plus required code-owner approval from Blue | Blue's clicks, Part B | Agents merging at all. **Today agents act as Blue's own account (verified with GitHub `get_me`), so GitHub cannot tell them apart until this is done.** |
| Merge-audit workflow | In PR #27 | Detects anything that reaches main another way and opens a security-alert issue |

Still not covered: someone taking over Blue's own GitHub account (defense: a passkey).

## 6. The 1.1 plan in short (details: docs/PLAN-1.1.md)

| Week | Sessions |
|---|---|
| 1, automation spine | S01 guardrails (Blue's clicks) · S02 CI and dependency fixes · S03 plan-to-issues board · S04 daily runner plus evening digest · S05 needs-you notifications · S06 process cleanup and link hardening |
| 2, continuity and control | S07 stable/dev Mako split · S08–S09 session memory and resume · S10 one-click authority levels · S11 usage panel · S12 Quick Links bundle |
| 3, knowledge, research, design input | S13 Obsidian Skills · S14 UI UX Pro Max and design brief · S15 research capture · S16 Dodaios sandboxed trial |
| 4, UI overhaul | S17 design directions · S18–S20 new layout in three slices · S21 logo readability |
| Business (parallel, private repo) | S22 marina research brief · S23 client paperwork drafts · S24 read-only HighLevel connection |
| End of month | S25 review and month-two plan |

The daily runner reads the plan from `main`. A merged plan change steers the next sessions; an
unmerged one steers nothing.

## 7. Claude's assessment that shaped this

### First-party tools that change the 1.1 scope (verified October 2026)

- **Claude Code desktop on Windows** runs parallel sessions in git worktrees with diff review.
- **The Codex app on Windows** (since March 2026) runs parallel agents in worktrees, with approval
  notifications, Automations and a native Windows sandbox.
- **Claude Code auto-continues after a usage-limit reset** (since v2.1.234, on by default for
  subscribers in the terminal; it won't wait more than 24 hours or with the terminal closed). Most of
  the planned "quota countdown and resume" already exists.
- **Claude Code permission modes** map onto the four authority levels: plan (Minimum), acceptEdits
  (Medium), auto (High), and full permissions only inside a sandbox (Maximum). Claude's own sandbox
  does not run on native Windows, only WSL2.
- **Codex reviews GitHub PRs automatically** and can fix findings (at-codex fix it). Claude's managed
  Code Review is Team/Enterprise only.
- **Claude Routines** run scheduled or GitHub-triggered cloud sessions (research preview, with usage
  limits; see docs/PLAN-1.1.md S04 item 1 for the limits read on 2026-10-19). Claude Remote Control and the open-source Happy app give phone check-ins and alerts.
- **Usage visibility:** `/usage` in Claude Code, or ccusage.
- **Conclusion:** don't rebuild orchestration inside Electron. Mako becomes the local cockpit (voice,
  Video Scout, Quick Links, local panes, status) and connects to these tools.

### The 31 Codex backlog items, by verdict

| Verdict | Items |
|---|---|
| Build in Mako | Session resume (01) · authority presets mapped to existing modes (06) · notifications (03) · stable/dev split (31) · UI redesign (08) · logo (19) · brother install (20, month two or later) |
| Done in 1.0 | Version label (02) · status fix (03) · Shift+Enter (18) · Vibe Kanban removed (09) |
| Already exists, show it or configure it | Quota resume (07: auto-continue) · usage dashboard (23: `/usage` or ccusage) · removing copy and paste (05: PRs plus Codex review) |
| Redundant, GitHub or Obsidian already does it | Diff viewer (22) · PR and CI watcher (27) · log search (25) · Markdown and Mermaid rendering (26) · task board (29) |
| Adopt | Obsidian Skills and UI UX Pro Max (12) |
| Evaluate later | Dodaios (sandboxed one-day trial) and Hermes (link only) (13) |
| Drop | Jev (paid classifier with nothing to solve) · claude-mem (telemetry on by default, reads Claude credentials, overlaps built-in memory) · Quick Check (PR review plus CI replaces it) · the 5-agent vote for code (tests and a reviewer decide correctness) |
| Business, not Mako code | Marina research without a Google Maps scraper (15: Charlotte County's marina list is small) · intake, contract and retainer as Hexona setup plus drafted documents (16, 17) · webhooks only when a real flow needs them (14) |
| Later | Command palette (24) · setup/teardown and ports (28) · crash diagnostics (30) |

### Items the Codex plan missed

- The 30-day transcript deletion.
- The exact version pin colliding with Claude Code's auto-update.
- Windows Update restarts.
- GitHub as the task and review system.
- The first-party desktop apps.
- A GoHighLevel MCP connector already configured in Blue's claude.ai account but not yet authorized.
- The old `open-external` IPC handler still lacking a trusted-sender check.
- The repository is public, so client data must go in a private repo.
- Smart App Control matters for the brother's install.
- npm advisories.

### Estimates (planning ranges, not promises)

- **1.0:** about one day of agent work plus about an hour of Blue's time once PR #27 is green.
- **1.1 on Max 5x:** the automation working end to end in about 3–4 weeks; all of month one including
  the UI overhaul and the first marina workflow in about 6–10 weeks.
- **On Max 20x:** roughly 20–30% faster (about 2.5–3 weeks and 5–8 weeks). Usage stops being a limit,
  but Blue's review time, Windows-only checks, design feedback and outside calendars remain the
  bottlenecks.

## 8. What would help from GPT

- **Review PR #27** through Codex code review, especially AGENTS.md (the rulebook),
  docs/SETUP-GUARDRAILS.md (are there merge loopholes Claude missed?) and docs/PLAN-1.1.md (order,
  dependencies, anything missing).
- **Second opinions welcome:**
  - Is 2 parallel sessions a sensible start on Max 5x?
  - Should Codex open any PRs itself, or stay reviewer only? If it opens PRs, its GitHub connection must
    use the agent account (Part B).
  - Anything in the dropped list worth keeping?
- **Put disagreements in the repo:** a PR comment or a `plan-change` PR, so Claude and Blue see them in
  the same place.

## 9. Files

`AGENTS.md` · `CLAUDE.md` · `STATUS.md` · `BLUE-CHECKLIST.md` (Blue's steps, in order) · `docs/DECISIONS.md` · `docs/PLAN-1.1.md` ·
`docs/SETUP-GUARDRAILS.md` · `docs/RELEASE-NOTES-1.0.md` · `docs/handoff/FINISH-1.0.md` ·
`docs/OSS-PROCUREMENT-pane-status.md` § 14 · `.github/pull_request_template.md` ·
`.github/workflows/ci.yml` · `.github/workflows/merge-audit.yml` · `.claude/settings.json` ·
PR #27: https://github.com/ABlueAI/AgentCommandCenter/pull/27
