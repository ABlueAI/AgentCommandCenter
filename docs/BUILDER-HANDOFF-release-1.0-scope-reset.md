# Builder Handoff — Release 1.0 Scope Reset and Backup Evidence

## 0. Status

**STOPPED FOR INDEPENDENT STANDARD-CLASS REVIEW.** Documentation only. Nothing
merged or pushed.

## 1. Authority and invariant

Blue's exact authorization:

> AUTHORIZE RELEASE 1.0 SCOPE RESET AND BACKUP EVIDENCE RECORD

Branch invariant: make the corrected four-day 1.0 scope, model routing,
security-gated sequence, branch policy, and measured manual-backup evidence
durable without implementing or authorizing any product feature.

## 2. Git shape

| Field | Value |
|---|---|
| Branch | `codex/release-1.0-scope-reset` |
| Worktree | `.worktrees/release-1.0-scope-reset` |
| Pre-merge `main` | `bd07da5678ea604da32fee692120cf9bbc6a3c43` |
| Live `origin/main` after fetch | `bd07da5678ea604da32fee692120cf9bbc6a3c43` |
| Reviewed content tip | `6884b6047357289e7d8d8276b7bc654c53030b23` |
| Handoff-only tail / branch tip | this document's finalization commit; exact SHA accompanies the review request |

Before branch creation, a real `git fetch --prune origin` completed and local
`main`, `origin/main`, and the checked-out base were verified equal with zero
ahead/behind count.

## 3. Tracked files

- `AGENTS.md`
- `BLUE-HELM-MASTER-STATUS.md`
- `docs/AI-COLLABORATION.md`
- `docs/RELEASE-1.0-FOUR-DAY-PLAN.md` (new)
- `docs/BACKUP-RECOVERY-EVIDENCE-2026-08-14.md` (new)
- `docs/BUILDER-HANDOFF-release-1.0-scope-reset.md` (new)

No application code, test, dependency, package manifest, script, GitHub
configuration, merge-gate plan, or provider setting is changed.

## 4. Scope reset

The active 1.0 scope is now seven items: Quick Links, pane-status completion,
P1 environment containment, fence completion, a full daily-driver day, a clean-
machine/VM exercise, and release triage/gating. The earlier eleven-item queue is
retained and labelled superseded history.

The controlling sequence is recorded exactly as Blue accepted it, including
the hard rule that the daily-driver day moves if P1 or the fence test has not
passed by the end of Day 2. The date cannot override the security gate.

The correction also records:

- Quick Links first, pane-status rebase and re-review second, P1 last;
- mixed-tier pane-status review;
- no pane-status live provider turn before independent accounting exists;
- a dedicated structured Quick Links URL policy rather than reuse of the weak
  existing handler;
- the 1.0 Quick Links default seed set pinned to exactly Starboard Platform and
  Outlook Web;
- `app/main.js:1033` as the corrected P1 environment-boundary reference;
- **Starboard Platform** as the corrected product label;
- active Codex/Claude load-sharing in separate worktrees; and
- branch dispositions `LANDED`, `SUPERSEDED`, `DEFERRED`, or `ABANDONED`, with
  deletion only after preservation and exact target verification.

## 5. Quick Links procurement ruling

Blue ruled Quick Links a bounded policy extension of the already-owned external
launcher boundary: no new dependency, provider, protocol, credential store, or
embedded browser. The OSS procurement gate does not apply.

This is not permission to reuse `open-external`. The release plan records a
separate pure URL-policy boundary and defers repair of the existing handler to
post-1.0. No Quick Links code is written here.

## 6. Backup evidence

The new evidence record separates independently reproduced facts from facts
carried from the completed human/Claude drill. It records:

- restic 0.19.1;
- source `D:\Workspace`;
- repository `C:\blue-helm-backup`;
- distinct physical disks for source and repository;
- 9 data packs totaling 103,963,207 bytes and 2 snapshot blobs;
- first-snapshot `.env` capture followed by second snapshot `9b7f3cfe`, which
  added `.env` exclusions and produced a clean restored-tree scan;
- the corrected `D:\restore-test\D\Workspace\...` restore path;
- equal recursive counts of 2,725 source and restored files plus the
  representative read of `BLUE-HELM-MASTER-STATUS.md`;
- why the corrected extension denylist still is not a production secret policy;
- the Codex long-path result (253 current / 266 projected under restore); and
- every major unproven protection: off-site, schedule, staleness, independent
  recovery material, complete exclusion, integrity, VSS, and clean-machine
  restore.

The record does not expose a secret and does not claim the production backup
roadmap item complete.

## 6.1 Pre-review accuracy correction — 2026-08-15

Blue identified four improvements before independent review; this is not a
reviewer verdict. The evidence record now distinguishes the first snapshot that
captured `.env` from second snapshot `9b7f3cfe`, records the clean second-restore
scan and equal 2,725-file counts, and corrects the restic drive-letter nesting
in the restore path. The release plan now assigns the turn-accounting preflight
to Blue, defines evidence and pass/block outcomes, supplies a hook-independent
admission-budget fallback, and pins Quick Links defaults to Starboard Platform
and Outlook Web. No runtime command or new provider turn was used for these
documentation corrections.

## 7. Verification and gates

Documentation-only verification:

- reviewed range:
  `bd07da5678ea604da32fee692120cf9bbc6a3c43...6884b6047357289e7d8d8276b7bc654c53030b23`;
- shortstat: 6 files, 707 insertions, 22 deletions;
- exact census: three modified Markdown/control-plane documents and three new
  Markdown documents, exactly as listed in § 3;
- `git diff --check`: clean on the reviewed range;
- pinned artifact: `.agent-review-release-1.0-scope-reset.diff`;
- artifact size: 40,338 bytes;
- artifact SHA-256:
  `701eb5403ae4b71b632b281f857449466c7d6fa56d2b93900e7b134809b0439e`;
- artifact created with `git diff --output`, regenerated to a distinct temporary
  file, and proven byte-identical before the temporary was removed;
- artifact ignored by the tracked `.gitignore:33` rule; and
- local `main` and `origin/main` remained equal to the recorded base after the
  content commit.

The final review request must additionally verify that the branch tip is one
commit above the reviewed content tip, that it touches only this handoff, that
the full range passes `git diff --check`, and that tracked state is clean.

App and Pester gates are not run because this branch changes documentation and
collaboration policy only. No production/runtime surface changes.

## 8. Runtime and external-state boundary

Performed: read-only fetch/status/ref checks, restic version identification,
repository metadata inspection, physical-disk mapping, redacted history review,
and path-length measurement.

Not performed: application launch, Electron launch, provider/model session,
backup, restore, repository integrity scan, account/key creation, upload,
secret read, settings edit, merge, push, or branch deletion.

## 9. Review focus

The reviewer should verify:

1. the seven active items and deferrals match Blue's authorization;
2. the Day 1–4 order and fence-before-daily-driver rule are unambiguous;
3. the old scope is preserved and clearly non-controlling;
4. Quick Links is exempted only as a bounded existing-boundary extension and
   is explicitly forbidden from reusing the weak handler;
5. backup claims do not exceed the measured evidence;
6. the `.env` and long-path findings are retained as negatives;
7. Codex routing does not weaken worktree, test, review, or merge rules; and
8. no code/config/runtime change entered the range.

## 10. Authorization boundary

This branch authorizes no feature implementation, merge, push, branch deletion,
live provider run, backup job, or release tag. After PASS and landing, the next
separate actions are turn-accounting preflight and VM preparation, followed by
the exact Quick Links work order.
