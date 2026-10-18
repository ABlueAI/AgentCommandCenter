# Branches and worktrees, October 2026

Classified on 2026-10-18 for the 1.0 close-out (docs/handoff/FINISH-1.0.md, step D1). **Nothing was
deleted.** This file is a record only. Deleting any branch or worktree is Blue's call, made separately.

Method: `git branch -a`, `git worktree list`, `git branch --merged main` and
`git rev-list --count main..<branch>`, run against `main` at `ab5ce5a`. A branch counts as LANDED when
its tip is already in `main`, so every commit on it shipped.

| Label | Meaning |
|---|---|
| LANDED | All its commits are in `main`. |
| SUPERSEDED | Not merged, and a later file or decision on `main` replaces it. |
| DEFERRED | Not merged. Kept as historical reference or for later work. |
| ABANDONED | Not merged, no longer wanted, nothing replaces it. (None found.) |

## Not merged into main (11 branches)

- `codex/mako-personal-1.0-scope` (`e1fdeea`, 1 commit ahead): SUPERSEDED by STATUS.md and
  docs/RELEASE-NOTES-1.0.md.
- `codex/oss-first-procurement-gate` (`7e6045a`, 4 ahead): SUPERSEDED by `codex/oss-first-procurement-gate-v2`,
  which landed, and by the OSS-first rule in AGENTS.md.
- `codex/release-1.0-auth-backup-blockers` (`cc440d4`, 1 ahead): SUPERSEDED. Its one edit made merge
  authorization and recovery 1.0 blockers in BLUE-HELM-MASTER-STATUS.md. The later scope reset
  (`codex/release-1.0-scope-reset`, landed) and Blue's 2026-10-02 decision moved restore testing to 1.1.
- `codex/chat-handoff-5` (`1ef274b`, 1 ahead): DEFERRED (historical reference).
- `codex/chat-handoff-6` (`f2fd8c0`, 2 ahead): DEFERRED (historical reference).
- `codex/docs-quick-check-roadmap` (`5eb697f`, 1 ahead): DEFERRED (historical reference).
- `docs/release-2.0-game-plan` (`5125714`, 2 ahead): DEFERRED (historical reference).
- `feature/backup-recovery-prototype-spec` (`093ecce`, 10 ahead): DEFERRED. Backup and restore spec
  (docs/SPEC-backup-recovery-prototype.md), not on `main`. Restore work is 1.1 or later; this is its
  starting point.
- `codex/h1-host-qualification` (`8bcc68e`, 124 ahead): DEFERRED (historical reference). The H1
  qualification tooling and record behind "H1 application gate passed once for `aa1640c`. Never
  rerun it" (docs/DECISIONS.md). It contains the two branches below. It also holds
  docs/RISK-node-pty-pid-cleanup.md, which is not on `main` and is useful input for 1.1 session S06.
  Never merge it to run H1 again.
- `codex/h1-physical-gate-preflight` (`797df6c`, 86 ahead): DEFERRED (historical reference). Contained
  in `codex/h1-host-qualification`.
- `codex/electron-harness-startup-reliability` (`09d93bb`, 28 ahead): DEFERRED (historical reference).
  Electron test-harness investigation. Contained in both H1 branches. Its audit doc
  (docs/AUDIT-app-gate-reliability.md) already landed through `docs/audit-app-gate-reliability`.

## Merged into main, with a note

- `codex/mako-1.1-implementation-plan` (`9d15789`, no commits of its own): SUPERSEDED by
  docs/PLAN-1.1.md. Its drafts were never committed; they exist only as untracked files in its
  worktree. The tool cards in its research file are copied to
  docs/research/RESEARCH-mako-1.1-2026-10-16.md.
- `agent/business-model-review` (`9d15789`, no commits of its own): LANDED. It is a branch only: its
  worktree folder `D:\Workspace\agent-command-center-business-model-review` is gone, and git no longer
  lists it. The Oct 7 reviewer conversation recovered in step A ran there; its transcript survives in
  Claude Code's own folder.

## Merged into main (local branches)

- `agent/1` (`2191bb6`, 2026-07-06): LANDED.
- `agent/12` (`47e083c`, 2026-07-06): LANDED.
- `agent/3` (`3ff96bd`, 2026-08-11): LANDED.
- `agent/bob` (`ebca4cb`, 2026-06-29): LANDED.
- `agent/bob-the-builder` (`f7c4a19`, 2026-06-29): LANDED.
- `agent/g` (`ab2a454`, 2026-07-01): LANDED.
- `agent/gemini-editor` (`51e4768`, 2026-07-06): LANDED.
- `agent/j` (`efa5207`, 2026-06-30): LANDED.
- `agent/k` (`83cacf9`, 2026-08-22): LANDED.
- `agent/l` (`83cacf9`, 2026-08-22): LANDED.
- `agent/smith` (`fc392a7`, 2026-06-29): LANDED.
- `agent/watcher` (`764adb3`, 2026-06-29): LANDED.
- `audit/test-runner-wiring` (`47f2eb9`, 2026-08-19): LANDED.
- `codex/audit-test-runner-wiring-correction` (`119aa21`, 2026-08-20): LANDED.
- `codex/docs-v1-portable-distribution` (`c2a0593`, 2026-07-26): LANDED.
- `codex/fence-live-admission-refresh` (`75e3b41`, 2026-09-29): LANDED.
- `codex/fix-pester-path-env-portability` (`da5249d`, 2026-07-15): LANDED.
- `codex/gate-reliability-measurement` (`34af8bf`, 2026-08-20): LANDED.
- `codex/mako-taskbar-identity` (`04fc9cd`, 2026-10-02): LANDED.
- `codex/mako-visible-rename` (`988c3ff`, 2026-09-30): LANDED.
- `codex/oss-first-procurement-gate-v2` (`9eb82a1`, 2026-08-04): LANDED.
- `codex/pane-status-admission-closeout` (`3316568`, 2026-08-19): LANDED.
- `codex/pane-status-admission-fail-closed-cas` (`57dfee5`, 2026-08-17): LANDED.
- `codex/pane-status-admission-protective-state-machine` (`7794151`, 2026-08-18): LANDED.
- `codex/quick-links` (`0bb3533`, 2026-08-16): LANDED.
- `codex/release-1.0-scope-reset` (`76e6a3d`, 2026-08-15): LANDED.
- `codex/sync-roles-deterministic-deploy` (`ecf6af4`, 2026-09-29): LANDED.
- `docs/audit-app-gate-reliability` (`1a84920`, 2026-08-21): LANDED.
- `docs/install-windows-source-tree` (`8a77f58`, 2026-08-25): LANDED.
- `docs/mark-v2-complete` (`9156b3a`, 2026-07-15): LANDED.
- `docs/process-tiering-and-backfill-complete` (`4aceb1e`, 2026-07-15): LANDED.
- `docs/project-control-plane-sync` (`89ca16f`, 2026-07-14): LANDED.
- `docs/record-v1-scope-and-oss-procurement` (`00f0ab5`, 2026-07-23): LANDED.
- `docs/record-v5-stack-acceptance` (`de4b31e`, 2026-07-22): LANDED.
- `docs/tts-work-order-and-k8-tier` (`111ccf8`, 2026-07-15): LANDED.
- `docs/v2-tldr-work-order` (`6cb5431`, 2026-07-15): LANDED.
- `docs/v4-post-merge-closeout` (`b11775a`, 2026-07-30): LANDED.
- `feature/analysismode-failclosed` (`8b62bff`, 2026-07-14): LANDED.
- `feature/backup-recovery-source-scout` (`3000250`, 2026-08-13): LANDED.
- `feature/backup-recovery-verdict-finalization` (`4722cbe`, 2026-08-13): LANDED.
- `feature/dockview-post-merge-closeout` (`4ed1b60`, 2026-08-08): LANDED.
- `feature/dockview-production-integration` (`cddd633`, 2026-08-08): LANDED.
- `feature/dockview-prototype` (`a78a3e4`, 2026-08-07): LANDED.
- `feature/fence-completion-pty-start-authority` (`1efcc99`, 2026-08-28): LANDED.
- `feature/k5-sdk-503-recovery` (`b60bb1b`, 2026-07-17): LANDED.
- `feature/k8-audio-permission-hardening` (`e1fdd1f`, 2026-07-16): LANDED.
- `feature/merge-gate` (`0c9ecb5`, 2026-07-23): LANDED.
- `feature/p12-launcher-hardening` (`8addb64`, 2026-07-26): LANDED.
- `feature/p13-duration-guard-hardening` (`e9275c8`, 2026-07-17): LANDED.
- `feature/pane-status-admission-budget` (`9c07602`, 2026-08-17): LANDED.
- `feature/pane-status-production-claude` (`60df4de`, 2026-08-25): LANDED.
- `feature/pane-status-prototype-a-claude` (`5764ce6`, 2026-08-12): LANDED.
- `feature/pane-status-prototype-a-closeout` (`93d7f79`, 2026-08-12): LANDED.
- `feature/pane-status-source-scout` (`258f44d`, 2026-08-10): LANDED.
- `feature/pane-status-source-scout-closeout` (`721fe2a`, 2026-08-11): LANDED.
- `feature/range-invariant-hotfix` (`fad5ebc`, 2026-07-09): LANDED.
- `feature/release-1.0-decision-reconciliation` (`2a0eb55`, 2026-08-12): LANDED.
- `feature/sec-escape-validate` (`075d909`, 2026-07-10): LANDED.
- `feature/sec-nav-shell` (`11720b8`, 2026-07-12): LANDED.
- `feature/section-select-ui` (`bf93993`, 2026-07-09): LANDED.
- `feature/stt-accuracy-upgrade` (`1de2187`, 2026-07-16): LANDED.
- `feature/stt-bootstrap-fix` (`564bfae`, 2026-07-16): LANDED.
- `feature/test-reachability-meta` (`c5e4610`, 2026-07-17): LANDED.
- `feature/transcript-timestamps` (`0dd0c40`, 2026-07-16): LANDED.
- `feature/tts-agent-mouse-selection` (`7700128`, 2026-07-16): LANDED.
- `feature/tts-agent-pane-selection` (`ae7d2b2`, 2026-07-16): LANDED.
- `feature/tts-bootstrap-fix` (`3d0b8ba`, 2026-07-15): LANDED.
- `feature/tts-fast-clear` (`03461d3`, 2026-07-16): LANDED.
- `feature/tts-terminal-live-repair` (`ae66043`, 2026-07-15): LANDED.
- `feature/v1-pane-readability` (`cce5302`, 2026-07-18): LANDED.
- `feature/v2-section-tldrs` (`fbb63ac`, 2026-07-15): LANDED.
- `feature/v3a-pre-analysis-focus` (`f5b93e6`, 2026-07-23): LANDED.
- `feature/v3b-stored-report-followup` (`403a8ab`, 2026-07-24): LANDED.
- `feature/v4-bounded-multi-slice` (`7eecb1c`, 2026-07-30): LANDED.
- `feature/v5b1-report-artifacts` (`2e8ec32`, 2026-07-21): LANDED.
- `feature/v5b2-library-reader` (`2abd716`, 2026-07-21): LANDED.
- `feature/v5c1-media-inventory` (`5f8415a`, 2026-07-21): LANDED.
- `feature/v5c2a-success-media-cleanup` (`ffa27b0`, 2026-07-21): LANDED.
- `feature/v5c2b-retention-reconciliation` (`7f0a1f0`, 2026-07-22): LANDED.
- `feature/video-scout-manifest-backfill` (`7d64eb3`, 2026-07-15): LANDED.
- `feature/video-scout-run-manifest` (`f138185`, 2026-07-14): LANDED.
- `fix/dockview-maximize-gate` (`249af9a`, 2026-08-21): LANDED.
- `fix/pester-reachability-exact-match` (`4cbca5b`, 2026-08-20): LANDED.

## Merged into main (branches only on GitHub)

- `origin/ABlueAI-GPT-Addition` (`20b6dbe`, 2026-07-13): LANDED.
- `origin/agent/1`, `origin/agent/12`, `origin/agent/gemini-editor`: LANDED (same tips as the local
  branches above).
- `origin/claude/youthful-heisenberg-sed4co` (`7fed5a8`, 2026-10-18): LANDED through PRs #27 and #31.
- `origin/feature/duration-guard-by-mode` (`6074565`, 2026-07-12): LANDED.
- `origin/feature/sec-escape-validate`, `origin/feature/sec-nav-shell`: LANDED (same tips as local).

## Worktrees

Each worktree takes the label of the branch it has checked out (above). Worktrees for LANDED branches
are safe to remove later with `git worktree remove`, which keeps the branch. Blue decides when.

- `D:\Workspace\agent-command-center`: `main`.
- `D:\Workspace\agent-command-center\.worktrees\` holds 52 worktrees, including this close-out branch's, one per branch and named after it:
  - DEFERRED or SUPERSEDED: `chat-handoff-5`, `chat-handoff-6`, `docs-quick-check-roadmap`,
    `release-2.0-game-plan`, `backup-recovery-prototype-spec`, `electron-harness-startup-reliability`,
    `h1-physical-gate-preflight`, `h1-host-qualification`, `mako-personal-1.0-scope`,
    `oss-first-procurement-gate`, `mako-1.1-implementation-plan`.
  - `mako-1.1-implementation-plan` also holds five untracked planning drafts (see above); removing it
    would delete them, so copy them out first if they are wanted.
  - `finish-1.0-closeout` is this close-out branch.
  - All the others are on LANDED branches.
- `D:\Workspace\agent-command-center-1`: `agent/1`, LANDED. Used on Oct 16.
- Codex worktrees under `%USERPROFILE%\.codex\worktrees\`:
  - `3f71` (`codex/pane-status-admission-protective-state-machine`), `91ad` (`codex/quick-links`) and
    `mako-visible-rename` (`codex/mako-visible-rename`): all LANDED.
  - `a80f` is a detached HEAD at `bd07da5` ("Merge backup and recovery ADOPT verdict"), which is
    already in `main`.
- Other sibling folders in `D:\Workspace` (`agent-command-center-bob-the-builder`, `-evidence`, `-g`,
  `-j`, `-tts-terminal-live-repair`) are no longer registered worktrees. They are left alone.
