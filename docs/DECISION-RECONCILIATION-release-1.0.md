# Decision Reconciliation — Blue Helm Release 1.0

Date: **2026-08-12**
Branch: `feature/release-1.0-decision-reconciliation`
Base `main`: `4e6787f6dbafb482138ac4623654aa6bb63e997c` (subject `Merge pane status Prototype A closeout`)
Scope: **documentation only.** This record authorizes no implementation.

## 0. Why this record exists

Blue Helm has been running a disciplined branch-and-gate process, and that process worked for the
things that reached `main`. What it did **not** have was a control that noticed when an approved
decision *stopped* on a branch. Several genuine Release 1.0 commitments — including one verbatim Blue
OSS procurement verdict — have been sitting on unmerged local branches while the roadmap on `main`
carried no trace of them.

This record is the audit that found them, the classification of each, and the standing control that
prevents a repeat.

**It reconciles decisions. It does not merge branches, and it does not authorize the work it
describes.**

## 1. Audit method

Read-only, performed against the repository at base `main` `4e6787f6…`:

1. **Enumerate.** `git branch --no-merged main` — the complete set of local branches whose tips are
   not ancestors of `main`. The set was **exactly four**; no branch was selected by judgement or
   sampled.
2. **Pin each tip.** `git rev-parse <branch>` against the tip SHA declared in the work order. All four
   matched before any inspection began.
3. **Locate the true divergence point.** `git merge-base main <branch>` for each, so each branch is
   read against the `main` it actually forked from rather than against today's `main`.
4. **Read the whole delta.** `git diff <merge-base>..<tip>` in full, plus `git log` metadata (author,
   date, message) for provenance.
5. **Test each decision against current `main`.** For every commitment found on a branch, check
   whether an equivalent — or a corrected superseding version — is already tracked on `main`.
6. **Classify** as `LANDED`, `SUPERSEDED`, `DEFERRED`, or `ABANDONED`, and record the reason.

**Nothing was merged, cherry-picked, rebased, rewritten, or deleted.** Every branch remains exactly as
found, at its recorded tip.

## 2. Classification summary

| Branch | Tip | Date | Classification | Disposition |
| --- | --- | --- | --- | --- |
| `codex/release-1.0-auth-backup-blockers` | `cc440d444b9574c52532c2dac60ee676e09e654e` | 2026-08-08 | **DEFERRED** | Genuine 1.0 safeguards; commitments reconciled into current roadmap language on `main`. Branch not merged. |
| `codex/docs-quick-check-roadmap` | `5eb697f39963bee1e568ce9770c413b587071b9e` | 2026-07-30 | **DEFERRED** | Genuine earlier decision incl. a verbatim Blue verdict; requires reconciliation under the current procurement gate before implementation. Branch not merged. |
| `codex/chat-handoff-5` | `1ef274b8cf192c3249c6cccf3485c7e2ecc5d383` | 2026-08-08 | **SUPERSEDED** | Historical chat handoff overtaken by later project state. Not a current release commitment. |
| `codex/oss-first-procurement-gate` | `7e6045a006901b4bf20e0fd5bb514866b889e2f9` | 2026-07-31 | **SUPERSEDED** | Corrected governance already present on `main`. Not an orphaned current decision. |

No branch was classified `LANDED` (none of the four is an ancestor of `main`) and none was classified
`ABANDONED`.

## 3. `codex/release-1.0-auth-backup-blockers` — DEFERRED, commitments carried forward

**Facts.** One commit, `cc440d44`, authored 2026-08-08, forked at `d23e2c28` (the Dockview merge).
Changes `BLUE-HELM-MASTER-STATUS.md` only, **+33 / −2**.

**What it contains.** Two new blocking Release 1.0 roadmap items inserted ahead of the release gate,
with the release gate and daily-driver day renumbered behind them:

* **Red-merge human authorization** — its own Source-Scout evaluation and tracked Blue verdict; a
  Full-class-reviewed Red-risk merge path requiring fresh out-of-band authorization bound to the exact
  repository, base and tip SHAs, predicted merge tree, pinned-diff SHA-256, risk class, expiry, and a
  one-use challenge; no agent, builder, reviewer, automation identity, or already-authenticated
  unattended session may manufacture or replay approval; no reusable secret in chat, repository
  content, terminal arguments, environment variables, standard input, logs, or handoffs; a stated
  preference for a hardware-backed passkey or Windows Hello gesture; and proof that changed-artifact,
  expired, replayed, unavailable, and wrong-human attempts refuse visibly.
* **Independent backup and recovery** — its own Source-Scout evaluation and tracked Blue verdict; at
  least three recoverable copies across two storage forms with one off-site; versioned repository
  snapshots independent of live GitHub state; separately inventoried and encrypted non-Git application
  state; provider secrets excluded with an independent recovery path documented; retention, integrity
  verification, failure visibility, and recovery ownership defined; completion requiring recorded
  SHA-256 verification plus a clean isolated restore drill that does not depend on the active
  workspace or GitHub.

**These are genuine promised 1.0 safeguards that never reached `main`.** The roadmap on `main` has
been carrying neither of them since 2026-08-08.

**Disposition.**

* **Independent backup and recovery is reconciled into `BLUE-HELM-MASTER-STATUS.md` as a blocking 1.0
  prerequisite and the next implementation area** after this documentation branch lands. Its
  requirements are restated there in current roadmap language.
* **Red-risk merge protection is reconciled, but deliberately reframed** rather than copied. The
  branch's language assumed the answer — a passkey or Windows Hello gesture — before the failure modes
  were stated. `BLUE-HELM-MASTER-STATUS.md` now records the observed failure modes and makes
  **evidence binding** the primary control; biometric or passkey authorization remains a
  defence-in-depth candidate that would need its own Source-Scout work and threat-model decision, and
  is **not** automatically a separate 1.0 implementation requirement.
* **The branch is not merged.** Its text is superseded by the reconciled roadmap language, and it is
  retained as the provenance of the commitment.

## 4. `codex/docs-quick-check-roadmap` — DEFERRED, requires procurement reconciliation

**Facts.** One commit, `5eb697f3`, authored 2026-07-30, forked at `4c07db9a` (the P12 merge). Changes
`BLUE-HELM-MASTER-STATUS.md` only, **+39 / −8**.

**What it contains.** A "Quick Check / work-order decision preflight" roadmap item — a canonical
JSON Schema 2020-12 work-order manifest validated by Ajv, deterministic work-order linting, an
allowlisted read-only factual preflight, a SHA-256-bound review bundle containing the original human
directive plus the generated work order plus factual results, and an independent semantic review
before high-impact work is sent; driven by a visible composer / **Run Quick Check** action rather than
by intercepting raw PTY keystrokes, failing closed for high-impact decisions unless Blue explicitly
overrides.

**It also contains a verbatim Blue OSS procurement verdict dated July 30, 2026** covering
JSON Schema 2020-12 and Ajv (ADOPT), fast-check as a development-only dependency (ADOPT), Promptfoo as
an offline/synthetic-only evaluation harness (PROTOTYPE), Spectral and OPA (PATTERN-MINE), and only
the Blue Helm-specific checks, bundle generator, and orchestration glue (BUILD FRESH).

**This is the single most consequential finding of the audit: a real Blue verdict that never became
tracked state on `main`.**

**Disposition — and the boundary is exact.**

* The Quick Check proposal is recorded on `main` as a **potentially useful answer to the
  merge-evidence problem**, queued as **Quick Check / merge-evidence reconciliation**.
* **The stale branch text is not treated as current authorization.** Under the procurement gate now on
  `main` (`AGENTS.md` § *OSS-FIRST PROCUREMENT GATE — HARD INVARIANT*, item 6), a verdict must live in
  a **tracked Markdown procurement decision record under `docs/`, named for the subsystem**. This
  verdict lives in `BLUE-HELM-MASTER-STATUS.md` on an unmerged branch. It therefore **does not satisfy
  the current gate as it stands**, regardless of the fact that Blue really did issue it.
* **Reconciliation, not re-decision.** The July 30 verdict is genuine and must not be silently
  discarded or quietly re-run as though Blue had never spoken. Reconciling it means bringing it onto
  `main` in the form the current gate requires — its own tracked record, with the candidates,
  evidence, and Blue's verbatim line — and confirming with Blue that the verdict still stands. That is
  its own work order.
* **No Quick Check implementation is authorized**, and **the branch is not merged**.

## 5. `codex/chat-handoff-5` — SUPERSEDED

**Facts.** One commit, `1ef274b8`, authored 2026-08-08, forked at `1dce24c1`. Adds
`BLUE-HELM-CHAT-HANDOFF-5.md`, **+266**, and changes nothing else.

**Why it is superseded.** It is a chat-transfer document whose stated baseline is
`main == origin/main == 1dce24c1`, and it records that "Main has not received Dockview" and "No
pane-status implementation has begun." `main` has since advanced through the Dockview merge
(`d23e2c28`), the pane-status procurement merge (`045be879`), the Experiment A merge (`7afd9453`), and
the Experiment A closeout (`4e6787f6`). Every baseline claim in it is now historical.

**Disposition.** Historical handoff, **not a current release commitment**. Its still-binding
control-plane rules — Blue as sole merge authority, feature branches only, separate builder and
reviewer sessions, literal `VERDICT:` lines, pinned artifacts via `git diff --output`, fail-visibly,
no `setx` credentials, the procurement gate as a hard invariant — are **already tracked on `main`** in
`AGENTS.md` and `docs/AI-COLLABORATION.md`, so nothing is lost by leaving it unmerged. Not merged, not
deleted.

## 6. `codex/oss-first-procurement-gate` — SUPERSEDED

**Facts.** Four commits, tip `7e6045a0`, authored through 2026-07-31, forked at `4c07db9a`. Changes
`AGENTS.md` and `BLUE-HELM-MASTER-STATUS.md` and adds
`docs/BUILDER-HANDOFF-oss-first-procurement-gate.md`.

**Why it is superseded.** Corrected governance covering the same ground is already on `main`, and
`main`'s version is strictly the later and more precise one:

* `main`'s `AGENTS.md` gate carries **ten** numbered items to this branch's nine, having split "record
  the verdict" from "restate it in every work order and handoff."
* `main`'s item 10 states exactly what `scripts/merge-gate.ps1` does and does not validate — including
  that it accepts a plan-declared `handoffDoc` and checks that document's handoff-tail commit shape
  and blob identity — where this branch's item 9 predates that behaviour.
* `main` already tracks `docs/BUILDER-HANDOFF-oss-first-procurement-gate.md`.
* The five-term verdict set (`ADOPT · FORK · PROTOTYPE · PATTERN-MINE · BUILD FRESH`) and the
  candidate-versus-subsystem distinction are on `main` in both `AGENTS.md` and
  `BLUE-HELM-MASTER-STATUS.md`.

The sibling branch `codex/oss-first-procurement-gate-v2` **is** merged into `main`, which is how the
corrected governance arrived.

**Disposition.** **Not an orphaned current decision** — nothing on this branch is a commitment `main`
is missing. Not merged, not deleted; retained as the provenance of the governance that did land.

## 7. The process finding

> Blue Helm had no systematic reconciliation control ensuring that an approved decision became durable
> tracked state on `main`. A chat decision or feature-branch document was being treated as durable
> before it landed.

Two observations that make the finding concrete rather than abstract:

* The failure was **silent by construction**. Nothing in the branch-and-gate process ever asks "which
  approved decisions have *not* landed?", so an unmerged decision produced no signal at all — no
  failing gate, no stale marker, no review finding.
* The failure was **selective in the worst way**. It hit decisions that were *recorded* rather than
  *implemented*. Implementation work announces itself when the code is missing; a roadmap commitment
  or a procurement verdict simply looks like it was never made.

## 8. Standing control — branch reconciliation

Adopted as a durable process control:

1. **At every roadmap checkpoint, and before declaring Release 1.0 complete, enumerate every local
   branch not merged into `main`** — `git branch --no-merged main`, the complete set, not a sample.
2. **Classify each branch** as exactly one of:
   * **`LANDED`** — its content is on `main`, whether by merge or by an equivalent later change.
   * **`SUPERSEDED`** — overtaken by later tracked state; nothing on it is a commitment `main` is
     missing.
   * **`DEFERRED`** — it holds a real commitment or decision that has not landed; the commitment is
     carried forward in tracked language on `main`, and what still needs authorization is named.
   * **`ABANDONED`** — deliberately dropped, with the reason recorded.
3. **Record the classification on `main`** — in this record or its successor. A classification that
   exists only in a chat, a memory, or a branch has reproduced the exact failure this control exists to
   prevent.
4. **A decision is not a current release commitment or implementation authorization until its
   controlling tracked record has landed on `main`.** Approval in chat, a work order, or a feature
   branch is provenance, not authorization.
5. **Never delete an unmerged branch merely because it appears stale.** Reconcile it first — read the
   full delta, classify it, and record the classification. Only then may deletion be considered, and
   the reconciliation record must already name what the branch contained.

## 9. What this record does not do

* **It does not merge, cherry-pick, rebase, rewrite, or delete any branch.** All four remain at their
  recorded tips.
* **It does not authorize implementation** of backup and recovery, Quick Check, merge-evidence
  binding, biometric or passkey merge authorization, or pane-status production work.
* **It does not re-decide the July 30 Quick Check verdict** — it records that the verdict exists, that
  it never became tracked state on `main`, and that reconciling it under the current gate is its own
  work order.
* **It runs no new research sweep.** Every fact here comes from repository history and from evidence
  already reviewed and merged.
