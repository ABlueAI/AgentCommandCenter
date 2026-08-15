# Blue Helm 1.0 — Four-Day Release Plan

## 0. Authority, status, and purpose

Blue issued this exact authorization on 2026-08-14:

> AUTHORIZE RELEASE 1.0 SCOPE RESET AND BACKUP EVIDENCE RECORD

This document is the narrow release-scope reset that authorization permits. It
does not implement any feature, authorize a merge, waive an existing security
gate, or turn a calendar target into an acceptance result. Each code change
still needs its own branch, work order, tests, review, and explicit merge
authorization.

The plan deliberately replaces the earlier eleven-item 1.0 queue with seven
active release items. The earlier queue remains in `BLUE-HELM-MASTER-STATUS.md`
as labelled history; it is not deleted or reinterpreted.

## 1. Settled product identity

Blue Helm is an owned, self-hosted Windows desktop **agent supervisor and
command center**. It is not a model provider, an autonomous agent runtime, or a
replacement for Claude Code or Codex. It launches agents in isolated worktrees,
hosts their terminals, gives Blue a visual place to supervise parallel work,
and keeps review and merge authority with the human.

The 1.0 release is Blue's personal Windows daily driver. Portable family
distribution, public distribution, and a general-purpose installer are not 1.0
acceptance requirements. A clean-machine/VM exercise remains in 1.0 because it
tests hidden environmental dependencies even for a personal daily driver.

## 2. The seven active 1.0 items

### 2.1 Quick Links — 0.5 day

Deliver a small, visible set of configurable browser destinations. The 1.0
default seed set is pinned to exactly **Starboard Platform** and **Outlook Web**.
The storage format may support later additions, but GitHub or any other default
requires Blue to add it explicitly before the Quick Links work order begins;
“other approved daily destinations” is not implementation authority.

Blue's binding procurement ruling is:

> Quick Links is a bounded extension of the already-owned external-launcher
> boundary. No new dependency, provider, protocol, credential store, or
> embedded browser. The OSS procurement gate does NOT apply.

“Extension” means policy extension only. Quick Links must not reuse the current
`open-external` handler, whose case-insensitive prefix check has no structured
URL parse or trusted-sender check. Quick Links requires its own pure policy
module with:

- structured URL parsing;
- only `http:` and `https:` schemes;
- a trusted application window and main-frame sender;
- bounded input length;
- visible refusal;
- bounded, metadata-only logging; and
- tests for deceptive URLs, control characters, malformed configuration, and
  untrusted senders.

Refactoring the existing handler is a separate post-1.0 finding. Mixing that
repair into Quick Links would violate the branch invariant.

### 2.2 Pane-status production completion — 1.5–2 days

Finish the human-facing advisory status indicator using the already-tracked
`BUILD FRESH` verdict in `docs/OSS-PROCUREMENT-pane-status.md`. Official
provider interfaces may be consumed; provider hook systems are not rebuilt.

Production acceptance requires all five:

1. Blue sees the badge animate through real states.
2. Badge and pane identity survive a live Dockview move.
3. A second pane cannot receive or inherit another pane's status.
4. Status cannot trigger any consequential action.
5. An absent, removed, broken, or silent reporter becomes `unknown` within a
   documented bounded interval rather than remaining falsely active.

Before any further paid live provider run, the unexplained four-turn use under
a three-turn authorization must be explained or enforceable turn accounting
must bound the run independently of the hook being tested. Day 1 therefore
allows implementation and unit tests but **no live provider turns**.

#### Turn-accounting preflight — owner, evidence, and outcomes

**Owner:** Blue makes the disposition. A planning/review session that is not the
Claude pane or hook under test assembles the evidence; Claude may identify
implementation facts but cannot certify its own accounting.

**Method, without a new model turn:** reconcile the retained app/main logs,
hook events, PTY/session timestamps, provider usage evidence available to Blue,
and Blue's prompt recollection into a chronological table. Every observed
`UserPromptSubmit`/`Stop` cycle must have a named cause. The preflight records
which source independently supports each row and preserves ambiguity rather
than assigning the unexplained fourth turn by guess.

**Satisfactory outcome A — explained:** all four observed turns reconcile to
named actions and Blue signs the explanation. The next live experiment still
receives a written prompt/turn budget and an outside-the-hook observer.

**Satisfactory outcome B — mechanically bounded:** if the overrun remains
unexplained, a separate reviewed change implements a main-owned test admission
budget. For controlled live evidence runs, direct terminal prompt input is
disabled; the harness decrements the budget **before** it writes each authorized
prompt to the PTY and visibly refuses prompt N+1. Unit tests prove zero-budget,
N+1, restart, and failure paths without a provider session. Hook events may be
compared with the ledger but may not increment or certify it.

**Blocking outcome:** if neither A nor B is complete before Day 1, pane-status
may continue with code and unit tests but no live provider session occurs. The
release calendar moves rather than weakening this condition.

Review is intentionally mixed-tier:

- Full-class: provider-settings lifecycle, named-pipe/token boundary,
  dead-reporter expiry, version fail-closed, turn accounting, and proof that
  advisory status cannot cause consequential actions.
- Standard-class: badge presentation and Dockview identity/move behavior.

### 2.3 P1 fenced-role environment containment — 0.75–1 day

Make fenced-role PTY environments explicit and minimal at the environment
construction boundary at `app/main.js:1033`. Provider, business, credential-
shaped, and unrelated ambient values must not enter fenced PTYs. The Builder
role remains unaffected where the approved design requires it.

P1 integrates after Quick Links and pane status because both touch nearby
main-process and renderer surfaces. As a threat-model change, P1 can invalidate
earlier LOW findings or assumptions; those are rechecked after integration.

### 2.4 Fence completion — about 0.5 day if it passes

Complete the outstanding fence proof, not a shorthand version of it:

- WO-6: missing-cwd and outside-root refusals, with Builder unaffected;
- WO-7: concurrent launches and required read-only paths;
- the P4 fail-closed guard unless preflight proves an equivalent enforcement
  mechanism; and
- the adversarial Read/WebFetch matrix on a quiet system.

The fence is a hard gate before fenced roles operate on real work. A daily-
driver day is real work.

### 2.5 Full daily-driver day — 1 full day

Blue uses the app for a complete real workday while builders remain idle as
test operators. Record friction, visible failures, status usefulness, pane and
layout behavior, recovery needs, and any workflow that forces Blue outside the
app. Findings become work; the day is not a ceremonial checkbox.

### 2.6 Clean-machine/VM exercise — about 0.5 day

Prepare a clean Windows VM before Day 1, then on Day 4 test the documented
developer setup and a representative recovery path without relying on the
active machine. Include the measured Windows long-path risk around Codex turn-
diff references. This is environmental discovery, so its output may be a
blocker rather than a pass.

### 2.7 Release triage and gate — about 0.5 day plus fixes

Triage Day 3 findings, rerun required gates after fixes, classify every branch,
preserve evidence, and decide whether the result is 1.0 or a release candidate
with blockers. The release date never changes the definition of complete.

## 3. Controlling sequence

### Before Day 1

1. Review and land this scope reset and the backup evidence record.
2. Blue completes and signs the pane-status turn-accounting preflight in
   § 2.2, using outcome A or B; otherwise live pane-status runs remain blocked.
3. Prepare the clean Windows VM.
4. Issue exact, bounded Quick Links and pane-status work orders.

### Day 1 — parallel build, isolated worktrees

- Codex: Quick Links.
- Claude Code: pane-status implementation and unit tests, with no live provider
  session.

The split manages usage limits. It does not relax review class, tests, or
quality expectations.

### Day 2 — controlled integration and the security gate

1. Review and merge Quick Links.
2. Rebase pane status onto the new `main`.
3. Review the rebased pane-status tip; a verdict on the pre-rebase tip does not
   survive.
4. Integrate P1 after the PTY environment path is stable.
5. Run the fence test on a quiet system.

### Day 3 — full daily-driver day

Blue is the instrument and builders are idle. This occurs only if P1 and the
fence test have passed.

### Day 4 — findings, clean machine, release

1. Triage and fix blockers from Day 3.
2. Run the clean-machine/VM exercise.
3. Run the full release gate and human acceptance.
4. Classify branches and retain evidence.
5. Tag/release only if every blocking gate passes.

**Binding movement rule:** if P1 or the fence test has not passed by the end of
Day 2, the daily-driver day moves. The date does not override the security gate.

## 4. Integration and worktree rules

The functional tracks are not file-disjoint. Quick Links, pane status, and P1
all touch main-process or renderer shell surfaces. Their order is therefore
part of the safety plan:

1. Quick Links lands first.
2. Pane status rebases and receives a fresh review.
3. P1 lands last and triggers review of security assumptions affected by the
   changed PTY environment boundary.

Claude and Codex always use separate branches and worktrees. Neither agent
merges its own branch. Full-class security review comes from a fresh independent
session. Blue remains the final reviewer and sole merge authority.

## 5. Branch closeout policy

Every branch is assigned exactly one disposition:

- `LANDED` — its intended reviewed content is in `main`.
- `SUPERSEDED` — a later tracked change replaces its current effect while its
  history remains useful.
- `DEFERRED` — it contains deliberately retained future work or evidence.
- `ABANDONED` — it contains no work that must be preserved or reconciled.

Deletion happens only after required commits and artifacts are preserved and
the exact local worktree, local branch, and remote branch targets are verified.
There is no “delete all branches” step. The backup-specification branch remains
`DEFERRED` and must not be deleted during 1.0 cleanup.

## 6. Explicit 1.0 deferrals

### 6.1 Production backup automation and off-site recovery → 2.0

The August 14 manual restic drill provides a bounded local recovery copy and a
representative restore. It does not supply scheduling, off-site survival,
stale-backup detection, immutable retention, or independent recovery material.
Those residuals are accepted for Blue's personal 1.0 and recorded in
`docs/BACKUP-RECOVERY-EVIDENCE-2026-08-14.md`; they are not described as solved.

### 6.2 Quick Check and merge-evidence automation → 1.1

Useful governance work, but not needed to validate the personal daily-driver
workflow. Existing human review and merge-gate rules remain binding.

### 6.3 Session persistence and resume UX → 1.1

Valuable convenience and continuity, but not required to prove the core agent-
supervisor workflow during the daily-driver day.

### 6.4 Portable family distribution → 2.0

The 1.0 target is one owned Windows environment. The clean-machine exercise is
retained to expose hidden dependencies; a polished family installer and
supportable portable package are not.

### 6.5 Full environment/distribution audit → 2.0

The clean-machine exercise is the bounded 1.0 discovery gate. The broader EDA
becomes a post-1.0 hardening and distribution program.

### 6.6 Business-data MCP/native integration → 1.1+

Quick Links open approved browser destinations only. No embedded browser,
business credentials, native CRM/mail data, or agent access to those systems is
part of 1.0.

### 6.7 Windows Hello/passkey merge approval → not a 1.0 requirement

Presence authentication does not prove review quality or bind a verdict to the
reviewed diff. Reconsider only through its own threat model and Source-Scout
work; do not restore it as an assumed solution.

### 6.8 Observability and autonomous remediation → later

Sentry, PostHog, autonomous error-to-PR loops, and autonomous merge remain out
of scope. Human review and human merge authority stay intact.

## 7. 1.1 batch after a successful 1.0

The planned near-term batch is Quick Check/merge-evidence reconciliation,
session persistence/resume UX, and the first bounded business-tool integration
only after its own procurement and credential-boundary decisions. Findings from
the daily-driver and clean-machine exercises may reorder that batch.

## 8. Honest completion statement

The estimates describe known work. The fence test, daily-driver day, and clean-
machine exercise are discovery gates whose findings can create additional work.
Four calendar days therefore produce Blue Helm 1.0 only if those gates pass; if
they do not, the correct output is a reviewed release candidate and a specific
blocker list.
