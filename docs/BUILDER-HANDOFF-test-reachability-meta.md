# Builder Handoff — Test-Runner Reachability Meta-Test

Branch: `feature/test-reachability-meta` — STACKED on `feature/k5-sdk-503-recovery`
(tip `3c5c949`), per the work order's ordering note: on plain `main` (`d8d0931`) the
meta-test correctly reports `scripts/gemini-video-sdk.test.js` unreachable until K5's
Pester wrapper merges — that is the test working, not a bug. Merge K5 first; this
branch then merges clean.
Fork-point vs main: `d8d0931` (via the K5 chain)
Base (K5 tip): `3c5c949`
Pre-merge main SHA: `d8d0931`
Tip SHA: implementation `992744f`; this docs-only handoff commit sits on top
Merge commit SHA: Pending human approval (after K5)

Tier: Standard-class, chore-adjacent — test tooling only; worst case is a false gate
failure. No runtime code.

Intended invariant: every `*.test.js` and `*.Tests.ps1` in the repo is executed by a
standing runner, and any unreachable test file fails the gate BY NAME.

## Instances 4 and 5, found immediately

Building this branch, the meta-test's first honest run surfaced two MORE orphans
beyond the three known incidents: `app/renderer/pty-parser.test.js` (100 assertions)
and `app/renderer/video-range-ui.test.js` (14 assertions) existed on disk but were
absent from `app/package.json`'s test script. Both were executed stand-alone FIRST
and run green (100/0, 14/0), then wired into the gate as the minimal fix the
meta-test forces. No test content was modified.

## Files changed (implementation commit `992744f`)

- `app/test-reachability.test.js` (NEW) — Node meta-test, listed FIRST in the npm
  gate. Manual repo walk (never descends excluded names, never follows links);
  exclusion list: `node_modules`, `.git`, `.worktrees`, `vendor`, `dist`,
  `source-material`. Reachability rule for `*.test.js`: app-relative path present in
  `app/package.json` `"test"` OR basename referenced by a `*.Tests.ps1` under
  `scripts/` (the K5 wrapper pattern — hence the SDK suite passes without being
  added to package.json, exactly as the work order requires). Failure output NAMES
  the unreachable files. Discovery floors (≥20 js, ≥14 ps1) prevent a broken walker
  from passing silently. Watches that the Pester meta-suite exists; asserts its own
  wiring.
- `scripts/test-reachability.Tests.ps1` (NEW) — Pester 3.4 meta-suite, auto-discovered
  by `run-pester.ps1` (self-wiring). Same walk; asserts every `*.Tests.ps1` sits
  under `scripts\` (run-pester's only search root), NAMING strays; asserts
  run-pester still discovers recursively; asserts the Node meta-test is wired in
  package.json. The two meta-tests are mutual anti-orphan watchdogs — neither can
  become the next orphan without the other failing.
- `app/package.json` — `"test"` gains `test-reachability.test.js` (first),
  `renderer/pty-parser.test.js`, `renderer/video-range-ui.test.js`.
  ⚠ MERGE NOTE: Track B (`feature/tts-fast-clear`) also edits this same `"test"`
  line; whichever merges second will hit a one-line textual conflict — resolution is
  the union of both suite lists.

## Deliberate-orphan proof (scratch files: created, proven, deleted — never committed)

- `app/renderer/zz-orphan-demo.test.js` → node meta-test FAILED:
  `✗ FAIL: UNREACHABLE *.test.js — no runner executes: app/renderer/zz-orphan-demo.test.js`
  (exit 1).
- `orphan-demo.Tests.ps1` at the repo ROOT (outside `scripts/`) → Pester meta-suite
  FAILED naming the full path
  (`...\test-reachability-meta\orphan-demo.Tests.ps1`).
Both scratch files were deleted; `git status` clean afterwards.

## Unexpected finding fixed on the K5 branch (not here)

This branch's fresh worktree materialized CRLF checkouts, which exposed a
line-ending bug in K5's `no-process.exit` source check
(`split('\n')` left `\r` on lines; JS `$` will not match before `\r`; the comment
strip no-oped and the contract COMMENTS tripped the regex). K5's suite would have
failed on ANY fresh checkout, including post-merge main. Fixed on
`feature/k5-sdk-503-recovery` as `3c5c949` (`split(/\r?\n/)`), verified on both an
LF working copy and a CRLF checkout, K5's full diff re-pinned, corrective delta
pinned separately as `.agent-review-k5-crlf-delta.diff` (awaiting its delta review
per the Full-class rule).

## Commands run and exact results (this tree, `992744f`)

- `npm.cmd test` in `app/`: **649 passed, 0 failed** — 529 baseline + 6 meta +
  100 pty-parser + 14 video-range-ui. Meta-test runs first.
- `powershell -ExecutionPolicy Bypass -File scripts/run-pester.ps1`:
  **224 passed, 0 failed, 0 skipped (of 224)** — 216 baseline + 4 K5 wrapper +
  4 meta. No existing assertion disappeared.

Security-sensitive surfaces touched: none. No runtime code, no deps.

Known limitations:

- package.json matching is EXACT-TOKEN (the "test" script is tokenized into its
  `node <path>` invocations) and wrapper matching is a boundary-guarded basename
  match with the watchdog Pester meta-suite excluded from the wrapper corpus — both
  hardened from substring matching after the Reviewer's MEDIUM (a wired
  `renderer/tts.test.js` could previously mask a future root-level `tts.test.js`
  orphan; the fix was proven against exactly that scratch scenario). Remaining
  accepted gap: a wrapper that names a suite in a boundary-clean position without
  executing it would still satisfy the check — the realistic failure mode is
  forgetting wiring entirely, not writing a decoy wrapper.
- The exclusion list is name-based at any depth; a future legitimate test living in
  a directory named e.g. `vendor` would be skipped (and should not live there).

Recommended review focus (Standard-class, scoped): the reachability rule +
exclusion list · failure output naming files · self/mutual wiring (neither meta-test
orphanable) · the two rediscovered orphans being wired-not-modified · proportionality.

Review diff (stacked delta vs the K5 base):
`git diff 3c5c949...HEAD --output=.agent-review-test-reachability-meta.diff` (pinned,
gitignored). The full-vs-main delta is `d8d0931...HEAD` and includes the K5 branch;
review K5 through its own handoff/diff, not this one.

Reviewer verdict: `VERDICT: PASS` (initial scoped pass) and `VERDICT: PASS` (delta pass)

Reviewer verdict source: two read-only Reviewer passes (fresh subagents), July 17, 2026.
(1) Initial scoped Standard-class pass over `.agent-review-test-reachability-meta.diff`
(`3c5c949...3686963`): PASS with one MEDIUM — substring matching could mask a future
root-level orphan by name-collision (e.g. wired `renderer/tts.test.js` shadowing a new
`app/tts.test.js`) — plus two LOWs (watchdog suite's own filename mentions counted as
wrapper reachability; handoff omission). All three corrected in `587442b`: exact-token
package.json matching, boundary-guarded wrapper basenames, watchdog excluded from the
wrapper corpus, limitation documented; the fix was proven against the exact collision
scenario (scratch `app/tts.test.js` FAILED by name, deleted after).
(2) Delta pass over `.agent-review-meta-token-delta.diff` (`992744f..587442b`): PASS
with one LOW — the trailing regex guard omitted `.` (asymmetric with the leading
guard), so a `tts.test.js.bak` decoy could still match; the Reviewer prescribed the
functional fix in words. Applied as the follow-up commit under the chore-class
criteria (zero runtime code · content prescribed verbatim by a Reviewer verdict ·
verified by execution: clean 6/0 plus a five-case regex proof — .bak decoy,
path-prefix, dash-prefix all false; quoted and space-bounded legit references true).
Gate execution (app 649/0, Pester 224/0/0, re-run after each fix) is the Builder's
record; Reviewers have no shell.

## Review-diff rule

- This branch stacks on K5: the meta-only reviewed delta is `git diff 3c5c949...<tip>`;
  the full delta vs main is `git diff d8d0931...<tip>`.
- Always use `--output`; never PowerShell `>` for pinned review diffs.
- Retain the literal `VERDICT: PASS|FAIL` line and identify the review that produced it.
