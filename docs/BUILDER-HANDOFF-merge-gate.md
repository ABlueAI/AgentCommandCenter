# Builder Handoff — Merge Gate v1

Branch: `feature/merge-gate`
Fork-point SHA: `1407e1f51ac2e033401a6e7778ff3d5aaae55722`
Pre-merge main SHA: `1407e1f51ac2e033401a6e7778ff3d5aaae55722` (verified `main` == `origin/main` == this SHA before branching)
Tip SHA: the single implementation commit on `feature/merge-gate` (implementation + tests + docs +
this handoff committed together, per the work order; no commits ride above the reviewed tip, so
reviewedTip == branchTip)
Merge commit SHA: Pending until merge

Intended invariant:
`scripts/merge-gate.ps1` may perform exactly ONE local `git merge --no-ff` of a named local branch
tip into the exact synchronized main named by the human, only when the reviewed delta still
byte-matches its pinned diff, the branch/handoff tail still match their accepted SHAs and policy,
git predicts a conflict-free deterministic merge tree, all state is unchanged after the typed
interactive confirmation (complete re-preflight under a repository mutex), and the applied merge
is then PROVEN to be that prediction (two parents = pre-merge main + branchTip; actual merge tree
== preflighted merge-tree OID). It automates evidence checking and the fixed gates only — it does
not decide acceptance, review, push, fetch, or repair, and it contains no push path. Any
discrepancy refuses visibly and exits non-zero.

Gate tier: **Standard-class overall, with the plan validator, confirmation, and `-Apply` path
explicitly Full-class hunks** (per the work order). Blast-radius rationale: default invocation is
read-only (verified by test against refs/HEAD/index/worktree/object database); the single mutation
is one local `--no-ff` merge behind an interactive plan-hash-bound confirmation, and every failure
mode either makes no merge or retains it visibly with `STOP — DO NOT PUSH`.

Files changed (6; nothing under `app/` — Electron/renderer/preload/provider/credential/Video
Scout/manifest/retention/fencing code untouched):
- `scripts/merge-gate.ps1` (NEW) — the driver: repository/worktree identity, exact-SHA state,
  branch + handoff-tail policy, pinned-diff byte comparison, predicted merge tree via
  `git merge-tree --write-tree` under a guarded temp `GIT_OBJECT_DIRECTORY`, `Local\` mutex,
  interactive plan-hash-bound confirmation, full TOCTOU re-preflight, the one `--no-ff` merge,
  parent/tree verification, fixed gates, guarded conflict `--abort`, retained-merge stop banners.
- `scripts/lib/merge-gate-plan.ps1` (NEW) — pure PSD1 plan loading + strict validation
  (`Import-PowerShellDataFile` only; exact key set; native types; SHA/branch/path/message/gates
  policy) + `Get-MergeGateFileSha256`.
- `scripts/merge-gate.Tests.ps1` (NEW, 84) — real-git integration tests in disposable
  `%TEMP%\bh-merge-gate-test-*` repositories plus pure lib and source-invariant suites.
- `.gitignore` — added `.merge-gate/` (plans are local authorizations, never committable).
- `docs/MERGE-GATE.md` (NEW) — usage, plan schema, verified invariants, failure behavior,
  human-controlled recovery, copyable `bh-merge-gate-accept-*` acceptance demo, forbidden-ops.
- `docs/BUILDER-HANDOFF-merge-gate.md` (NEW) — this handoff.

Security-sensitive surfaces touched:
- **The merge boundary itself.** The tool executes exactly one history mutation:
  `git merge --no-ff -m <validated-message> -- <validated-local-branch>`, always as a literal
  argument array (no command strings, no `cmd.exe`, no `Invoke-Expression` — pinned by
  source-invariant tests, which also allow-list every git verb the script can invoke and forbid
  push/fetch/pull/reset/clean/stash/add/commit/checkout/switch/branch/worktree-mutation).
- **No bypass surface:** parameters are exactly `-PlanPath` and `-Apply`; no `-Yes`/`-Force`; the
  only environment variables touched are `GIT_OBJECT_DIRECTORY`/`GIT_ALTERNATE_OBJECT_DIRECTORIES`
  (scoped tightly around merge-tree, restored in `finally`); redirected/noninteractive stdin
  refuses `-Apply`. The confirmation seam (`Read-MergeGateConfirmation` +
  `Assert-MergeGateInteractiveConsole`) is testable only by dot-sourcing + Pester mocks.
- **Recursive deletion:** exactly one path — the temp object directory — guarded by canonical
  parent == `%TEMP%`, leaf prefix `bh-merge-gate-objects-`, non-reparse, and no overlap with the
  repository root / git dir / common dir / objects dir / any registered worktree; guard failure
  skips deletion visibly instead of deleting.
- **Plan file:** restricted data language (cannot execute), duplicate keys rejected at parse,
  strict types (string-'false' and numeric-SHA coercion traps refused by type), SHA-256-pinned
  across the confirmation gap.

Commands run:
- `cd app && npm ci && npm test` (feature worktree) → **exit 0; suite totals sum to 997 passed /
  0 failed** (baseline unchanged — no app file touched; `npm ci` needed once because a fresh
  worktree has no `node_modules`).
- `powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\run-pester.ps1` →
  **655 passed / 0 failed / 0 skipped** (571 baseline + 84 new merge-gate tests; the new suite is
  discovered automatically by the recursive runner).
- `git diff --check` (staged) → clean.

Exact test results (the 84 new tests):
- PSD1 lib (23): valid-plan parse + SHA lowercasing; duplicate key (exact + case-variant) refused
  at Import; unknown/missing key; string schemaVersion / schemaVersion 2; string
  documentationOnly; numeric SHA; 39-char SHA; desynchronized main/origin; unsupported gate;
  wrong order/duplicate gates; empty gates without documentationOnly; docs-only empty gates
  accepted; quote/backtick/newline/overlong message; whitespace/option-shaped branch; handoffDoc
  traversal/absolute/off-pattern; pinnedDiff wrong leaf/backslash; executable psd1 content.
- Source invariants (8): git verb allow-list; `worktree` only as `list`; `merge` only as
  `--no-ff` (once) + `--abort` (once); forbidden verbs absent; no Invoke-Expression/cmd.exe; only
  `-PlanPath`/`-Apply` params, no bypass, no `MERGE_GATE_*` env; only `GIT_*` env touched;
  run-pester reachability.
- Read-only preflight (8): child `-File` run passes on a synchronized fixture; refs/HEAD
  unchanged; index/worktree unchanged; real object database unchanged; temp object dirs cleaned;
  printed predicted tree == independent `git merge-tree`; mutex contention refuses (child while
  the test holds the `Local\` mutex); `-Apply` with redirected stdin refuses with no merge.
- State refusals (18): control pass; `.worktrees/` untracked exception tolerated; subdirectory
  cwd; linked-worktree cwd (refs/heads/main worktree elsewhere); non-main branch checked out;
  detached HEAD; HEAD != expectedMainSha; stale origin/main tracking ref; dirty tracked; staged;
  unexpected untracked; MERGE_HEAD in progress; stale branch ref; branchTip already ancestor of
  main; pinned diff missing; pinned diff byte-mismatch; pinned diff via junction (reparse);
  fixture-integrity control pass after restorations.
- Gitignore requirements (3): unignored plan refuses; unignored pinned diff refuses; ignored
  pinned diff inside `.worktrees/` accepted.
- Handoff-tail policy (8): no-tail; 1-commit tail; 3-commit boundary; 4-commit refusal; code in
  tail; second Markdown file; handoff-doc deletion; handoff-doc mode change (100755) refusal.
- Advanced-main/merge-base (3): K5/Fast Clear-shaped composition passes; merge-base != reviewedBase
  refuses; predicted textual conflict refuses AND its temp objects are cleaned (failure cleanup).
- Documentation-only (2): all-Markdown range with `gates = @()` passes; non-Markdown range with
  empty gates refuses.
- Apply confirmation/TOCTOU (5): wrong typed confirmation (no merge); plan-file change,
  branch-ref move, pinned-diff change, and HEAD move between confirmation and apply all refuse
  with no merge (mock confirmation performs the mutation, proving the recheck ordering).
- Apply success (2): synchronized merge — two parents (pre-merge main, branchTip), actual tree ==
  predicted tree, metacharacter-shaped `mergeMessage` (`$x ; | &`) preserved literally in
  `git log %s`; advanced-main merge — parent1 = advanced main, merge tree differs from BOTH sides'
  trees (true 3-way composition).
- Gate failures (2): app-gate and pester-gate failure each RETAIN the merge commit and print
  `GATE FAILED` + `DO NOT PUSH` with exit 1.
- Conflict stop (2): a real conflicted merge is aborted only because MERGE_HEAD exists (state
  restored, clean status, `DO NOT PUSH`); with no MERGE_HEAD nothing is aborted.

Manual verification: NOT run by the builder — reserved for Blue. `docs/MERGE-GATE.md` contains the
copyable disposable `%TEMP%\bh-merge-gate-accept-*` demonstration (advanced-main fixture with a
local bare origin and working stub gates: preflight no-mutation proof → `-Apply` with the typed
confirmation → parent/tree verification → origin-untouched proof → guarded cleanup). Do not run
`-Apply` against the real repository while this branch is under review.

Known limitations:
- The "pinned diff outside a registered worktree" negative is structurally unreachable through a
  validated plan: the lib forbids absolute paths, `..`, and backslashes, so every resolved pinned
  path stays under the repository root, which is itself a registered worktree. The containment
  check remains as defense-in-depth (it would matter if path validation ever regressed); the
  reachable negatives (missing, unignored, reparse-point) are tested.
- The `Local\` mutex serializes merge-gate invocations in the current session only; concurrent
  human git commands are inherently uncontrollable, which is why the complete preflight re-runs
  under the mutex after confirmation (TOCTOU tests prove plan/HEAD/branch-ref/pinned-diff drift is
  caught at that boundary).
- Gate totals in the final summary are exit codes; the gates' own totals stream to the console
  during the run (run-pester prints its `passed/failed/skipped` line itself).
- `documentationOnly = $true` with `gates = @('app','pester')` is allowed (gates simply run);
  only the empty-gates shortcut requires the all-Markdown proof.
- The interactive check is `[Console]::IsInputRedirected` + `[Environment]::UserInteractive`;
  the redirected-stdin refusal is the tested path.
- Preflight temp-cleanup guard failures WARN and skip deletion (leaving a temp directory is safe;
  deleting a wrong path is not) — surfaced visibly, never silent.

Unexpected pre-existing findings: none. No existing file other than `.gitignore` was modified.

Recommended review focus (per the work order):
- PSD1 parsing and strict types (`scripts/lib/merge-gate-plan.ps1` — Full-class).
- Process argument construction: every git call is a literal array through `Invoke-Git`.
- Reviewed-tip/branch-tip handoff-tail policy (`Invoke-MergeGatePreflightCore` tail block).
- Porcelain worktree record parsing and canonical-path comparison (`Get-MergeGateWorktreeRecords`,
  `Resolve-MergeGateRepository`).
- Pinned-diff regeneration + buffered byte comparison (`Assert-MergeGatePinnedDiff`,
  `Test-MergeGateFilesEqual`).
- Temp object-directory containment and cleanup (`Get-MergeGatePredictedTree`,
  `Remove-MergeGateTempObjectDirectory`).
- Merge-base and predicted-tree semantics (advanced-main invariant; predicted == actual binding).
- TOCTOU rechecks + mutex lifecycle (`Invoke-MergeGateApply` — Full-class).
- Interactive confirmation (`Invoke-MergeGateMain` — Full-class; no bypass).
- Conflict/gate-failure states (guarded `--abort`; retained merge; `STOP — DO NOT PUSH`).
- Proof that no push or arbitrary-command path exists (source-invariant suite).

Review diff:
`git diff 1407e1f5...<branch-tip> --output=.agent-review-merge-gate.diff`

## Review-diff rule

- Before merge, use `git diff main...<tip>` (equivalently the immutable `1407e1f5...<tip>`).
- After merge, reproduce the reviewed delta with `git diff <recorded-pre-merge-main>...<tip>`
  (`git diff main...<tip>` may be empty once the tip is an ancestor of `main`).
- Always use `--output`; do not use PowerShell `>` for pinned review diffs.
- Retain the literal `VERDICT: PASS|FAIL` line and identify the review that produced it.

Pinned `.agent-review-*.diff` files are local review artifacts and must remain gitignored.
