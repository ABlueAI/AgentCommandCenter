# Builder Handoff — Test-Runner Wiring Audit Correction

Branch: `codex/audit-test-runner-wiring-correction`

Fork point and pre-merge `main`: `8c6bfce6c36bbe0adda8dda46f6bab728e6ae38f`

Original audit commits:

- Initial audit: `55ec2d9186799e10fdc625a5efeb14ee53cb312a`
- Original reviewed audit tip: `47f2eb9be999258e63fe59e84ed8af0661b3cdcb`

First corrected audit-only tip: `41ee4b434420a61bf5459557e2bf2d5f135c6793`

Invalid attempted handoff tail: `0a60c81771a1a119f9a342d9f3eedf4659a80acf`

Current corrected review target: the content commit containing this section. Its exact SHA is
recorded in the external review packet because a commit cannot contain its own identity.

Merge commit: pending; nothing merged or pushed.

## Classification and invariant

**Standard-class.** The current corrected content commit modifies two existing Markdown files: the
audit and this handoff. No code, configuration, dependency, runner, test, credential, or runtime
behavior is changed. Accuracy, queue authority, and merge-gate topology are load-bearing because the
audit and handoff are intended to be durable project records.

Intended invariant: the audit must keep unlike test-counting units separate, must not present an
unsupported aggregate or coverage percentage, must not imply that summary normalization supplies an
aggregation contract, and must not reprioritize the controlling release queue.

This is a documentation correction, not a new subsystem. The correction itself does not require an
OSS procurement evaluation.

## Files

First corrected audit-only commit `41ee4b4`:

- `docs/AUDIT-test-runner-wiring.md`

Invalid attempted handoff tail `0a60c817`:

- `docs/BUILDER-HANDOFF-test-runner-wiring-audit.md`

Current corrective content commit:

- `docs/AUDIT-test-runner-wiring.md`
- `docs/BUILDER-HANDOFF-test-runner-wiring-audit.md`

No other tracked file is authorized on this branch.

## Original independent review result — preserved verbatim

The independent Standard-class review of original audit tip `47f2eb9` returned:

```text
VERDICT: FAIL
CLASS: Standard
INDEPENDENCE: CONFIRMED
```

The blocking findings were:

1. The audit added 4,888 Node assertions, 955 passed Pester `It` test cases, and 3,988 wrapped Node
   assertions to claim 9,831 executed assertions and an approximately 40% understatement. Pester's
   `PassedCount` does not measure executed `Should` assertions, so that arithmetic mixed units; 5,843
   was not a valid executed-assertion total either.
2. The audit treated F5 summary normalization as an enabler and required predecessor for F1, then
   promoted F5 to “do next.” Normalizing log lines does not make the top-level summaries include
   wrapper-executed Node counts, and the audit had no authority to replace the release queue.
3. The Pester location split was recorded as 12 direct and 23 under `scripts/lib/`; the enumerated
   list itself demonstrates the correct split is 11 direct and 24 under `scripts/lib/`.

This handoff records the FAIL as historical review evidence. At that stage no corrective PASS
existed. The later correction-v2 PASS recorded below does not erase or reinterpret this FAIL.

## Correction made at `41ee4b4`

- Replaced the invalid 9,831/5,843 arithmetic and unsupported percentage with three separately
  labeled measurements:
  - 4,888 app-chain Node assertions;
  - 955 passed Pester `It` test cases, explicitly not a count of `Should` assertions;
  - 3,988 wrapped Node assertions absent from both headline gate summaries.
- Stated that no aggregate is valid until actual Pester assertion executions are measured under a
  defined reporting contract that prevents wrapper double-counting.
- Separated F5 from F1. F5 is a log-format/readability/parser concern; it does not cause top-level
  summaries to include wrapper-executed Node totals and is not an F1 prerequisite.
- Replaced every F5 “do next” claim with a recommendation pending Blue's priority decision, a bounded
  specification/work order, and a determination whether a proposed runner or aggregator is a new
  subsystem subject to the OSS procurement gate.
- Explicitly deferred to `BLUE-HELM-MASTER-STATUS.md` as the controlling release order.
- Corrected the Pester location split to 11 direct and 24 under `scripts/lib/`.

## Second independent review result — preserved verbatim

The independent Standard-class review of `41ee4b4` plus attempted tail `0a60c817` returned:

```text
VERDICT: FAIL
CLASS: Standard
INDEPENDENCE: CONFIRMED
```

The blocking findings were:

1. Two broad current-voice phrases survived: “executed-but-uncounted” in the headline and “counted
   nowhere” in F1. The honest scope is that the 3,988 wrapped Node assertions are **absent from both
   headline gate summaries**; the Pester headline still counts the wrapper `It` cases.
2. Commit `0a60c817` first added this handoff after reviewed content tip `41ee4b4`. It therefore was
   not a mechanically valid handoff-only tail: merge-gate requires the declared handoff path to be a
   regular blob at both `reviewedTip` and `branchTip`.

The earlier claim that `0a60c817` was a valid handoff-only tail is withdrawn. Commit `080cbf0` is a
new corrective **content** commit containing both the audit wording fix and an already-existing,
modified handoff blob. At that reviewed content tip no post-PASS tail or corrective PASS existed.
The later PASS and permitted handoff-only tail are recorded below without changing that history.

## Superseded first-correction artifact and checks

The first-correction artifact is preserved for provenance but is not the controlling artifact for
the current review target:

```text
.agent-review-test-runner-wiring-audit-correction-cumulative.diff
Range: 8c6bfce6c36bbe0adda8dda46f6bab728e6ae38f...41ee4b434420a61bf5459557e2bf2d5f135c6793
Size: 25,255 bytes
SHA-256: bfe69af8155317163012a5e3e91ead37768d33fd3d26832a3cb03cbb81272c49
```

That artifact was generated with `git diff --output`. A second independently named verification diff
was generated from the same range; its size and SHA-256 were identical. Only after that identity was
proved was the verification file removed. Existing review artifacts were not altered.

Checks at corrected content tip `41ee4b4`:

- `git diff --check 47f2eb9...41ee4b4`: exit 0.
- `git diff --check 8c6bfce...41ee4b4`: exit 0.
- Focused correction: 1 file changed, 37 insertions, 22 deletions.
- Cumulative content range: 1 file changed, 400 insertions.
- Cumulative changed path: only `docs/AUDIT-test-runner-wiring.md`.

The controlling review packet for the current corrected content tip must use these new artifacts,
generated after the current commit exists:

```text
.agent-review-test-runner-wiring-audit-correction-v2-cumulative.diff
Range: 8c6bfce6c36bbe0adda8dda46f6bab728e6ae38f...<current-corrected-content-tip>

.agent-review-test-runner-wiring-audit-correction-v2-focused.diff
Range: 0a60c81771a1a119f9a342d9f3eedf4659a80acf...<current-corrected-content-tip>
```

Their exact tip, sizes, SHA-256 identities, reproduction checks, and diff statistics were supplied in
the external review packet and are stamped below in this later handoff-only commit after the
independent PASS.

## Final independent correction-v2 review result — preserved verbatim

```text
VERDICT: PASS
CLASS: Standard
INDEPENDENCE: CONFIRMED
```

Source: fresh independent correction-v2 review of reviewed content tip
`080cbf0e844fd33820a3f9f112bae9fa93e5d600`.

Reviewed artifacts:

```text
.agent-review-test-runner-wiring-audit-correction-v2-cumulative.diff
Range: 8c6bfce6c36bbe0adda8dda46f6bab728e6ae38f...080cbf0e844fd33820a3f9f112bae9fa93e5d600
Size: 36,500 bytes
SHA-256: 181b5243562c7109f669943208242e72d2bf5916a73bcdc375084553f215760b

.agent-review-test-runner-wiring-audit-correction-v2-focused.diff
Range: 0a60c81771a1a119f9a342d9f3eedf4659a80acf...080cbf0e844fd33820a3f9f112bae9fa93e5d600
Size: 14,802 bytes
SHA-256: 501cf40e8e5ea5f18c46fc942b5d5e60803123e58f8ba43d0d762da7f5041851
```

The reviewer regenerated both artifacts byte-identically, confirmed both ranges pass
`git diff --check`, and reported no findings. This PASS applies specifically to corrected content tip
`080cbf0`; it does not erase or reinterpret either prior independent FAIL.

Runtime gates were not run because the correction is documentation-only and changes no executable
surface. The audit's previously recorded runtime measurements are historical evidence, not gates run
by this correction branch.

## Known limitations

- The audit describes the repository at `8c6bfce`; it is not a measurement of future trees.
- Actual Pester `Should` assertion executions remain unmeasured. No aggregate executed-assertion total
  is claimed.
- F1 and F5 remain findings/recommendations only. This branch specifies or implements neither.
- R1 on `fix/pester-reachability-exact-match` is owned by a separate workstream and is not modified,
  reviewed, authorized, merged, or pushed here.
- The audit records `.worktrees/` and loose review-artifact hygiene observations but does not fix them.

## Authorization boundary

This branch authorizes only the two documentation files listed above. It does not authorize:

- F1 aggregation/reporting implementation;
- F5 suite-summary normalization;
- test-runner or aggregator design or implementation;
- a change to `BLUE-HELM-MASTER-STATUS.md` or its release order;
- any new subsystem before the OSS procurement gate is satisfied;
- changes to R1, runtime tests, application code, Pester code, configuration, or dependencies;
- merge or push without Blue's authorization after an independent PASS.

## Independent correction-v2 review focus — completed

1. Confirm the reviewer did not author the correction and is independent of this handoff.
2. Reproduce both v2 artifacts named above and verify their supplied sizes and SHA-256 identities
   byte-identically. Do not use the superseded first-correction artifact as the controlling input.
3. Search the entire corrected audit for every 9,831, 5,843, and percentage claim; each number may
   appear only to state explicitly that it is **not** a valid executed-assertion total.
4. Confirm 4,888 Node assertions, 955 passed Pester `It` cases, and 3,988 wrapped Node assertions stay
   separate and that actual Pester `Should` executions are identified as unmeasured.
5. Confirm F5 is separated from F1 and no wording says F5 enables, precedes, or closes F1.
6. Confirm no “F5 do next” authority survives and the controlling release order remains with
   `BLUE-HELM-MASTER-STATUS.md`.
7. Confirm the 11-direct/24-library split matches the enumerated 35 Pester files.
8. Confirm both independent FAIL results are retained verbatim and any later PASS is scoped only to
   the corrected content it reviewed.
9. Confirm no executable or unrelated tracked path changed.

## Handoff-tail policy

`0a60c817` is explicitly **not** a valid handoff-only tail because this handoff did not exist at
reviewed tip `41ee4b4`. Corrective content commit `080cbf0` fixes the topology: this handoff is a
regular blob in its reviewed content tree.

The commit containing the final PASS section above is the permitted handoff-only tail. It modifies
only this already-existing handoff to retain the literal verdict and final artifact identities. The
merge-gate plan must set `reviewedTip` to `080cbf0e844fd33820a3f9f112bae9fa93e5d600` and `branchTip`
to the exact SHA of this handoff-only commit supplied in the merge packet. Any later content change
invalidates the artifacts and requires a new cumulative artifact and review.

Always use three-dot diffs and `git diff --output`; never use PowerShell `>` for pinned artifacts.
Pinned `.agent-review-*.diff` files remain gitignored local review artifacts.
