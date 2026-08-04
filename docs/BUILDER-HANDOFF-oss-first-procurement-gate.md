# Builder Handoff — OSS-First Procurement Governance Gate (Revision 2)

Branch: `codex/oss-first-procurement-gate-v2`
Fork-point SHA: `c58ddfa9a3a3b0558e9fd4dc61474255a8b90aae` — current `main`, which is also the pre-merge `main` SHA (re-verify at gate time)
Pre-merge `main` SHA: `c58ddfa9a3a3b0558e9fd4dc61474255a8b90aae` (`main == origin/main` at branch creation)
Reviewed tip: **`9db3fdf5600cda03738a7e8f9dda96d416537869`** — the single implementation commit on this branch (`docs(governance): reconcile OSS verdict contract on current main`), and the endpoint of both the reviewed range and the pinned artifact.
Branch tip: the second of two documentation-only **handoff-tail** commits above the reviewed tip, each modifying only this file. Its exact SHA is recorded externally and pinned in the merge plan; it is deliberately not written here, because a commit cannot contain its own SHA and a placeholder would re-create the defect the previous revision had to correct.
Merge commit SHA: Pending until merge

Branch shape: `c58ddfa9 → 9db3fdf → two documentation-only handoff-tail commits`

## Intended invariant

> Every Blue Helm subsystem procurement instruction must distinguish candidate
> disposition from Blue's final subsystem verdict, and must use exactly these
> five final verdicts: **ADOPT · FORK · PROTOTYPE · PATTERN-MINE · BUILD FRESH**.
> `REJECT` may describe rejection of an individual candidate; it is never a final
> subsystem verdict.

## Why this is a replacement branch

The superseded branch `codex/oss-first-procurement-gate` (reviewed range
`4c07db9a387191485b51cb99886d58d94573c1ad...b4854e3d5b5c22db2dbc1376bd28d22bc5aecec9`,
branch tip `7e6045a006901b4bf20e0fd5bb514866b889e2f9`) forked at `4c07db9`, which
predates the V4 closeout. It corrected the four-term verdict set in the OSS
procurement protocol section, but a *second* four-term set had landed on `main`
after that fork — in commit `ea09af7` ("docs(v4): record merged release and
reconcile roadmap"), under **§ Next-feature direction — Blue, July 30**. That
second set survived the predicted advanced-main composition unreconciled, and it
governs exactly the two subsystems the gate exists to guard.

An independent read-only review of that composition returned, verbatim:

```
VERDICT: FAIL — advanced-main composition (c58ddfa9 + 7e6045a) leaves BLUE-HELM-MASTER-STATUS.md carrying two conflicting verdict sets: the new five-term set at line 131 and an unreconciled, unlabelled four-term set "ADOPT, PROTOTYPE, PATTERN-MINE, or REJECT" at line 326 in the July-30 "Next-feature direction" section, which governs Dockview and cross-provider pane-status, omits FORK and BUILD FRESH, and presents candidate REJECT as the final subsystem verdict term — violating review requirements 1 and 2.
```

**Source:** fresh independent Claude Opus 5, Very High effort, read-only
Standard-class review, 2026-08-04, of branch `codex/oss-first-procurement-gate`
— reviewed range `4c07db9a...b4854e3d`, handoff tail `b4854e3d..7e6045a`, and the
advanced-main composition of `c58ddfa9` with `7e6045a`. That verdict belongs to
the **superseded** branch. It is recorded here as historical evidence, not as a
verdict on this branch; this branch's verdict is **Pending**.

Rather than rewrite history on the reviewed branch, this revision rebuilds the
same governance invariant directly on current `main`, where both four-term
passages are visible and can be reconciled together. The superseded branch, its
commits (`ce67fc8`, `b4854e3`, `4d894e0`, `7e6045a`), its worktree, and its pinned
artifact `.agent-review-oss-first-procurement-gate.diff` (15,816 bytes, SHA-256
`56061A445D6B0A2748E56E11A842AB77375B55D35C2E93C765387D2ECDAC1B47`) are
**preserved unchanged and untouched**. They remain the audit record of the first
attempt and are **superseded for merge purposes only**.

## What changed

### `AGENTS.md` — the gate itself

Adds § *OSS-FIRST PROCUREMENT GATE — HARD INVARIANT* with ten numbered
requirements: Source-Scout evaluation before specification, prototyping, or
implementation · per-candidate license, maintenance, telemetry/network behavior,
security surface, Windows support, and adoption-versus-build effort · one explicit
Blue verdict from the five terms, with candidate disposition named as a separate
lower level · ADOPT/FORK as the default reading when Blue names an OSS base ·
PATTERN-MINE does not authorize rebuilding · a tracked `docs/` procurement record
holding the verdict verbatim · that record's path and verdict restated in every
related work order and handoff · visible stop and renewed approval on deviation ·
documented search evidence before "no suitable OSS exists" · and no merge
authorization without the record.

### `BLUE-HELM-MASTER-STATUS.md` — both verdict passages reconciled

Two edits, both on current `main`'s content:

1. **OSS procurement protocol (July 23 section).** The candidate card no longer
   ends in a verdict set; a new block states the two verdict levels, quotes the
   five terms, names `AGENTS.md` as the authority, requires the tracked record,
   states that enforcement is procedural, and records that Dockview and
   cross-provider pane-status are separate subsystems each needing their own
   record and verdict.
2. **§ Next-feature direction — Blue, July 30.** The paragraph that ended
   "exactly one verdict term: **ADOPT, PROTOTYPE, PATTERN-MINE, or REJECT**" now
   separates candidate disposition from the subsystem verdict and ends in the
   five-term set. A labelled `CORRECTED` block records the previous wording as
   stale rather than deleting it silently, and the closing paragraph is widened
   from "begin implementation" to "begin specification, prototyping, or
   implementation."

The disclosure in edit 1 names **both** corrected passages, so the file discloses
its own correction history at the point a reader meets the contract.

### `docs/BUILDER-HANDOFF-oss-first-procurement-gate.md`

This handoff, rewritten for the replacement branch. It replaces the superseded
branch's handoff at the same path; that branch's own copy remains intact on its
own branch and in its worktree.

## Verdict-vocabulary proof

Searched the complete post-edit `BLUE-HELM-MASTER-STATUS.md` and `AGENTS.md` for
`ADOPT`, `FORK`, `PROTOTYPE`, `PATTERN-MINE`, `BUILD FRESH`, `REJECT`, and
`verdict`. Result:

- **Five-term set** — `BLUE-HELM-MASTER-STATUS.md` (protocol block, Next-feature
  direction) and `AGENTS.md` item 3. All three agree exactly.
- **Four-term string** — survives only inside the two explicit stale-wording
  disclosures that quote it in order to retire it. No active instruction carries
  it.
- **Other `reject` occurrences** are ordinary-language or schema rejections
  (manifest schema v1 rejecting `mediaArtifacts`, protocol/URL rejection, bind
  rejection, IPC rejection, quality rejection). Per the work order these are out
  of scope and were **not** altered.
- **Other `verdict` occurrences** are Reviewer gate verdicts (`VERDICT: PASS`
  records). These are a different contract from procurement verdicts and were not
  touched.
- **`PATTERN-MINE` / "pattern mine"** elsewhere in the roadmap describes study
  strategy, not verdicts, and was left as-is.

## Preserved on current main — verified, not assumed

- The July 30 **BASELINE ADVANCED** block, the **V4/V4Q merge record** at
  `22592b7` (reviewed range `4c07db9...0e412e0`, branch tip `7eecb1c`, Opus 5
  Full-class `VERDICT: PASS`, app exit `0` / Pester 955/0/0), and the V4 × K5
  retry-attribution decision are unchanged.
- The **eleven-item remaining-work sequence** and its `STALE WORDING CORRECTED`
  and `P12 is retained explicitly` notes are unchanged, including item order.
- The R4 promotion note in the Tier-1 roadmap (`TRIGGER FIRED — July 30`) is
  unchanged; it already required an OSS procurement record first and remains
  consistent with the corrected contract.

## Files changed

Cumulative against `c58ddfa9` — exactly 3 tracked paths:

| File | Change |
|---|---|
| `AGENTS.md` | adds the OSS-FIRST PROCUREMENT GATE section (10 requirements) |
| `BLUE-HELM-MASTER-STATUS.md` | both verdict passages reconciled; V4 closeout preserved |
| `docs/BUILDER-HANDOFF-oss-first-procurement-gate.md` | this handoff |

No other tracked file changed. Runtime code, tests, package files, lockfiles,
scripts (including `scripts/merge-gate.ps1`), prompts, agent roles, project
configuration, and every other handoff are byte-identical to `c58ddfa9`.

## Security / cost-sensitive surfaces touched

**None.** Documentation only: no runtime, package, dependency, provider,
credential, destructive, or cost-direction behavior changes. No dependency was
installed and no lockfile changed.

## Commands run

`git` inspection and history-safe operations only — `rev-parse`, `log`, `show`,
`diff`, `merge-base`, `status`, `ls-files`, `check-ignore`, `cat-file`,
`worktree add`, `worktree list`, `add`, `commit` — plus `git diff --check`,
`git diff --output` for the pinned artifact, and SHA-256 hashing. No merge, no
push, no fetch, no reset, no amend, no rebase.

## Exact test results

**No application or Pester gates were run, and none are claimed.** This branch is
Markdown-only; the reviewed delta contains no executable file. Running them would
prove nothing about this change.

## Manual verification

Deferred to the Reviewer and to Blue. Nothing here requires a running application.

## Known limitations

1. **Enforcement remains procedural.** The gate depends on Blue refusing merge
   authorization. `scripts/merge-gate.ps1` validates the plan-declared
   `handoffDoc` path, the handoff-tail commit shape, and that document's
   regular-blob identity — but it does not read work-order text, handoff prose, or
   procurement-record contents, and it enforces no OSS verdict. This branch does
   not change that. Automating it is a separate, separately reviewed branch.
2. **No procurement record exists yet for any subsystem.** This branch defines the
   requirement and the record's shape; it creates no record and supplies no
   verdict.
3. The `docs/` naming requirement is a convention stated in prose. Nothing
   mechanically validates a record's filename, location, or contents.
4. This revision reconciles the two verdict passages that exist on `c58ddfa9`. If
   `main` advances again before merge, re-run the vocabulary search against the
   new composition rather than assuming this branch still covers it — that
   assumption is precisely what failed the first time.

## Unexpected pre-existing findings

- **`agent-roles/source-scout.md:24`** ends the scout's report with
  "FORK IT / READ IT AS REFERENCE / NOTHING FITS, BUILD FRESH". That is the
  scout's *recommendation* vocabulary, not Blue's verdict set, so it does not
  contradict the gate — but it is a third vocabulary in the same decision path.
  The independent reviewer raised it as explicitly non-blocking and outside this
  three-file scope. **Deferred, not fixed; that file is unmodified.**
- `BLUE-HELM-CHAT-HANDOFF-4.md` carries an older, informal July-14 OSS policy with
  no verdict vocabulary. Left untouched as historical evidence; it is not the
  authority.

## Authorization status

**Dockview and cross-provider pane-status indicators remain UNAUTHORIZED.**
Neither subsystem has a tracked procurement record or a Blue verdict, and this
handoff creates neither. This branch authorizes no subsystem work, no dependency
installation, no prototype, no specification, no merge, and no push. If Blue
supplies a verdict later, it must be quoted verbatim into a tracked `docs/`
record before any work order for that subsystem is written.

## Review diff

Pinned artifact `.agent-review-oss-first-procurement-gate-v2.diff`, range
`c58ddfa9a3a3b0558e9fd4dc61474255a8b90aae...9db3fdf5600cda03738a7e8f9dda96d416537869`,
created with `git diff --output` (never PowerShell `>`), gitignored, untracked,
unstaged, an ordinary file with no reparse point, and verified to regenerate
byte-for-byte into a separate temporary file.

**Fixed identity — do not regenerate or replace:**

| Item | Value |
|---|---|
| Range | `c58ddfa9a3a3b0558e9fd4dc61474255a8b90aae...9db3fdf5600cda03738a7e8f9dda96d416537869` |
| Bytes | `22,558` |
| SHA-256 | `A90856CB30540AB00A02B21EB63DF655A682E0E9A1B95467E5A2E1D2CDD6F41F` |
| Inventory | 3 files — 2 modified, 1 added, 0 deleted |
| Lines | `+318 / −8` |
| Per file | `AGENTS.md` +15/−0 · `BLUE-HELM-MASTER-STATUS.md` +59/−8 · `docs/BUILDER-HANDOFF-oss-first-procurement-gate.md` +244/−0 |

The artifact endpoint stays at `9db3fdf`. The handoff-tail commits above it
deliberately do **not** move the reviewed range, so the artifact is not
regenerated when the tail lands.

The superseded artifact `.agent-review-oss-first-procurement-gate.diff` is a
different file at a different path and is **not** deleted, overwritten, or
regenerated.

## Review-diff rule

- Before merge:
  `git diff c58ddfa9a3a3b0558e9fd4dc61474255a8b90aae...9db3fdf5600cda03738a7e8f9dda96d416537869`.
  Note the endpoint is the reviewed tip `9db3fdf`, not the branch tip — the
  handoff tail above it is outside the reviewed range. `main` is the fork point
  for this branch, so `git diff main...<tip>` is equivalent **only while `main`
  remains `c58ddfa9`**; if `main` advances, use the recorded fork-point SHA
  explicitly.
- After merge: reproduce with the same immutable three-dot range against the
  recorded fork point.
- Always use `--output`; never PowerShell `>`.
- Retain the literal `VERDICT: PASS|FAIL` line and identify the review that
  produced it. A paraphrase or an implied verdict is not a merge-gate verdict.

Pinned `.agent-review-*.diff` files are local review artifacts and remain
gitignored.

## Reviewer verdict

`VERDICT: PASS`

## Reviewer verdict source

Fresh independent Claude Opus 5, Very High effort, read-only Standard-class
review on 2026-08-04 of reviewed range
`c58ddfa9a3a3b0558e9fd4dc61474255a8b90aae...9db3fdf5600cda03738a7e8f9dda96d416537869`,
handoff tail
`9db3fdf5600cda03738a7e8f9dda96d416537869..a78467631c838fd478edd1a1678e2c1efb6bd606`,
the pinned artifact, and composition with synchronized `main`. The review
opened with a literal independence PASS, regenerated the artifact
byte-for-byte, verified all 17 review requirements, made no file changes, and
ended with the literal verdict above. The full report is retained externally.
