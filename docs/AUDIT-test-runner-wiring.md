# AUDIT — test runner wiring

Read-only audit of how this repository's test suites reach a standing runner, and whether the
runners have drifted from the files present on disk.

Audited commit: `8c6bfce6c36bbe0adda8dda46f6bab728e6ae38f` (main).
Branch: `audit/test-runner-wiring`. Documentation only; nothing was modified, added, or repaired.
Date: 2026-08-19.

## Headline

**No drift.** The 67-entry chain matches the 67 executed suites exactly, the Y-rows sum to 4,888,
there are no broken chain entries and no zero-assertion suites. The one `app/` test file outside the
chain is deliberately reached by a Pester wrapper, not an orphan.

Two real findings remain, neither a correctness hole: an **assertion accounting gap** of 3,988
executed-but-uncounted Node assertions (F1), and a **latent discovery gap** for `*.Spec.ps1` (F2).
Two weaker observations (F3, F4) follow.

## 1. How `npm test` resolves its 67 suites

**Mechanism: a hardcoded, `&&`-chained list of explicit `node <file>` invocations.** No glob, no
directory walk, no chained requires.

Defined in a single place: the `scripts.test` string of `app/package.json`.

Properties measured on the audited commit:

| Property | Value |
| --- | --- |
| Chain entries | 67 |
| Non-`node` commands in the chain | none |
| Duplicate entries | none |
| Entries pointing at a missing file | none |

Because the entries are `&&`-chained, the first non-zero exit stops the run — a chain entry naming a
deleted file would fail loudly (`node` exits 1), so that inverse failure is self-guarding rather than
silent.

**The hardcoded list is nonetheless guarded against drift**, by `app/test-reachability.test.js`
(chain entry #1). It walks the repository, excluding `node_modules`, `.git`, `.worktrees`, `vendor`,
`dist`, and `source-material`, and asserts every `*.test.js` is reachable — either its app-relative
path appears in the `scripts.test` string, or its basename is referenced by a `*.Tests.ps1` wrapper
under `scripts/`. Its header records the history that motivated it: five files across three separate
incidents shipped green while nothing executed them. It also asserts that its Pester-side sibling
exists, so the two meta-tests watch each other and neither can become the next orphan.

## 2. Every test file in `app/` (excluding `node_modules`)

68 files on disk; 67 in the chain. Assertion counts for the Y-rows are attributed from the merged-main
gate log by execution order — a mapping validated three ways: the chain length and the summary-line
count are both 67, the attributed total equals the reported 4,888 exactly, and 51 of the summary lines
carry their own suite name, all 51 matching the file they were mapped to. The remaining 16 lines carry
no usable name — 10 lead with a count phrase (`100 tests: 100 passed, 0 failed`) and 6 are bare
(`26 passed, 0 failed`) — so they can be positionally attributed but not independently name-checked.

| # | file | in the 67-chain | assertions |
| ---: | --- | :---: | ---: |
| 1 | `test-reachability.test.js` | Y | 6 |
| 2 | `admission-main-startup.test.js` | Y | 60 |
| 3 | `admission-pty-boundary.test.js` | Y | 23 |
| 4 | `admission-protective-state.test.js` | Y | 53 |
| 5 | `quick-links-policy.test.js` | Y | 58 |
| 6 | `quick-links-store.test.js` | Y | 30 |
| 7 | `quick-links-ipc.test.js` | Y | 38 |
| 8 | `quick-links-integration.test.js` | Y | 43 |
| 9 | `renderer/quick-links-view.test.js` | Y | 38 |
| 10 | `dockview-package-identity.test.js` | Y | 47 |
| 11 | `dockview-layout-policy.test.js` | Y | 182 |
| 12 | `dockview-layout-store.test.js` | Y | 134 |
| 13 | `dockview-default-path.test.js` | Y | 380 |
| 14 | `dockview-bootstrap.test.js` | Y | 203 |
| 15 | `dockview-app-integration.test.js` | Y | 291 |
| 16 | `renderer/dockview-fit-policy.test.js` | Y | 59 |
| 17 | `renderer/dockview-panel-policy.test.js` | Y | 71 |
| 18 | `renderer/dockview-adapter-lifecycle.test.js` | Y | 376 |
| 19 | `nav-guard.test.js` | Y | 26 |
| 20 | `launchers.test.js` | Y | 40 |
| 21 | `launcher-authz.test.js` | Y | 18 |
| 22 | `launcher-ipc.test.js` | Y | 20 |
| 23 | `launcher-fence-invariant.test.js` | Y | 21 |
| 24 | `video-scout-args.test.js` | Y | 205 |
| 25 | `task-name.test.js` | Y | 53 |
| 26 | `media-permission-policy.test.js` | Y | 106 |
| 27 | `clipboard-ipc.test.js` | Y | 21 |
| 28 | `trusted-ipc-sender.test.js` | Y | 10 |
| 29 | `library-ipc.test.js` | Y | 30 |
| 30 | `followup-ipc.test.js` | Y | 63 |
| 31 | `followup-child.test.js` | Y | 32 |
| 32 | `video-scout-run-id.test.js` | Y | 24 |
| 33 | `renderer/agent-dom.test.js` | Y | 43 |
| 34 | `renderer/library-view.test.js` | Y | 36 |
| 35 | `renderer/report-followup.test.js` | Y | 40 |
| 36 | `renderer/term-copy.test.js` | Y | 53 |
| 37 | `renderer/pane-maximize.test.js` | Y | 40 |
| 38 | `renderer/clipboard-consumer.test.js` | Y | 30 |
| 39 | `renderer/pty-parser.test.js` | Y | 100 |
| 40 | `renderer/video-range-ui.test.js` | Y | 56 |
| 41 | `renderer/analysis-focus.test.js` | Y | 37 |
| 42 | `renderer/tts-selection.test.js` | Y | 27 |
| 43 | `renderer/audio-module-health.test.js` | Y | 9 |
| 44 | `renderer/tts-device-config.test.js` | Y | 3 |
| 45 | `renderer/tts-audio-contract.test.js` | Y | 9 |
| 46 | `renderer/tts-bootstrap.test.js` | Y | 16 |
| 47 | `renderer/wav-encode.test.js` | Y | 26 |
| 48 | `renderer/tts-playback-queue.test.js` | Y | 37 |
| 49 | `renderer/tts.test.js` | Y | 36 |
| 50 | `renderer/stt-env-config.test.js` | Y | 14 |
| 51 | `renderer/stt-bootstrap.test.js` | Y | 47 |
| 52 | `renderer/stt-audio-quality.test.js` | Y | 16 |
| 53 | `renderer/stt-target-lock.test.js` | Y | 11 |
| 54 | `renderer/stt.test.js` | Y | 19 |
| 55 | `prototype-pane-status/pane-status-boundary.test.js` | Y | 157 |
| 56 | `prototype-pane-status/pane-status-reporter.test.js` | Y | 106 |
| 57 | `prototype-pane-status/pane-status-version.test.js` | Y | 105 |
| 58 | `prototype-pane-status/pane-status-integration.test.js` | Y | 78 |
| 59 | `prototype-pane-status/pane-status-runner.test.js` | Y | 72 |
| 60 | `renderer/pane-status-badge.test.js` | Y | 45 |
| 61 | `admission-budget-config.test.js` | Y | 83 |
| 62 | `admission-budget.test.js` | Y | 243 |
| 63 | `admission-budget-store.test.js` | Y | 81 |
| 64 | `admission-ipc.test.js` | Y | 135 |
| 65 | `admission-ui-integration.test.js` | Y | 167 |
| 66 | `admission-process-cas.test.js` | Y | 16 |
| 67 | `renderer/admission-view.test.js` | Y | 134 |
| — | `renderer/video-model-policy.test.js` | **N** | 398 |

**Y-rows: 67 files, 4,888 assertions.** Both required identities hold, so there is no discrepancy of
the kind the work order named as the primary finding.

**The single N-row is not an orphan.** `renderer/video-model-policy.test.js` is executed by
`scripts/video-model-policy-node.Tests.ps1`, which resolves the suite path
(`app\renderer\video-model-policy.test.js`), runs it via `cmd /c "node …"`, and asserts exit code 0,
zero failed assertions in its own summary, and no `FAIL` lines. Run standalone it reports
**398 passed, 0 failed**, and its own assertions verify that this wrapper exists and uses the exact
spelling the reachability watchdog recognises. This is the repo's documented "K5 pattern".

## 3. Pester suites, repo-wide (excluding `.worktrees/`)

**A Pester gate exists.**

- **Runner:** `scripts/run-pester.ps1` (41 lines). Discovery is
  `Get-ChildItem -Path $root -Recurse -Filter '*.Tests.ps1'`, where `$root` is the script's own
  directory (`scripts/`), followed by a single `Invoke-Pester -Path $root -PassThru` pass. This is a
  **recursive glob, not a hardcoded list** — so `*.Tests.ps1` drift is structurally impossible.
- **What invokes it:** `scripts/merge-gate.ps1`, function `Invoke-MergeGatePesterGate` (line 637),
  which shells `powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\run-pester.ps1` and
  returns its exit code as the `pester` gate result. It is also run directly by hand, and its
  existence is asserted by both meta-tests.
- **Measured result on this commit:** 955 passed / 0 failed / 0 skipped, exit 0, 160.49s.

**Paths searched:** the entire repository tree rooted at `D:\Workspace\agent-command-center`,
pruning only `.worktrees/` and `node_modules/`, matching both `*.Tests.ps1` and `*.Spec.ps1`.

**Result: 35 files, all `*.Tests.ps1`, zero `*.Spec.ps1`.** All 35 live under `scripts/` — 11 directly
and 24 under `scripts/lib/` — therefore all fall inside the runner's recursive root and all are
reached.

<details>
<summary>The 35 discovered Pester suites</summary>

`scripts/`: `feed-gemini-analysis-focus`, `feed-gemini-media-inventory-lifecycle`,
`feed-gemini-policy-wiring`, `feed-gemini-report-lifecycle`, `feed-gemini-transcript-prompt`,
`feed-gemini`, `gemini-followup-node`, `gemini-video-sdk-node`, `merge-gate`, `test-reachability`,
`video-model-policy-node` (11) — plus `scripts/lib/`: `cleanup-video-scout-media`,
`get-analysis-focus`, `get-bounded-report`, `get-cli-safe-prompt`, `get-duration-guard`,
`get-gemini-launch-config`, `get-node-cli-arg`, `get-run-output-file`, `get-transcript-prompt`,
`get-video-scout-backfill`, `get-video-scout-diagnostic-artifact`, `get-video-scout-gemini-policy`,
`get-video-scout-prompt`, `get-video-scout-run-dir`, `get-video-scout-slice-ranges`,
`get-video-source-route`, `invoke-duration-probe`, `native-output-encoding`,
`record-video-scout-media`, `retention-sweep-video-scout-media`, `video-scout-library-core`,
`video-scout-manifest-schema`, `write-video-scout-manifest`, `write-video-scout-report` (24).

</details>

## 4. Findings

### F1 — Assertion accounting gap: 3,988 executed assertions appear in neither headline number

Three Node suites are reached only through Pester wrappers. Each wrapper contributes one or more
Pester `It` test cases that check properties such as exit code 0, no `FAIL` lines, and zero failures
in the Node summary, while the wrapped suite's own Node assertions are counted nowhere:

| Node suite | Wrapper | Its own assertions | Counted in 4,888? | Counted in 955? |
| --- | --- | ---: | :---: | :---: |
| `app/renderer/video-model-policy.test.js` | `scripts/video-model-policy-node.Tests.ps1` | 398 | No | No (wrapper `It` cases only) |
| `scripts/gemini-video-sdk.test.js` | `scripts/gemini-video-sdk-node.Tests.ps1` | 3,491 | No | No |
| `scripts/gemini-followup.test.js` | `scripts/gemini-followup-node.Tests.ps1` | 99 | No | No |

**Total wrapped Node assertions absent from both headline summaries: 3,988.** The three available
figures use two different units and must remain separate: the app gate reports 4,888 Node assertions;
the Pester gate reports 955 passed `It` test cases, not executed `Should` assertions; and the wrapped
Node suites report 3,988 Node assertions that appear in neither headline. Therefore neither 5,843 nor
9,831 is a valid executed-assertion total, and no percentage understatement can be derived from these
figures. An aggregate requires actual Pester assertion executions to be measured under a defined
reporting contract that also prevents double-counting wrapper-executed Node suites.

This is an accounting defect, not a correctness hole: a failure inside any wrapped suite still fails
its wrapper on exit code and propagates to the gate. But every merge record in this repo cites
"app 67/4,888/0, Pester 955/0/0" as if it were the full picture, and it is not.

### F2 — `*.Spec.ps1` would be silently invisible to every runner (latent)

`run-pester.ps1` filters on `*.Tests.ps1` only, and Pester's own discovery under `Invoke-Pester -Path`
uses the same convention. The Node-side meta-test's reachability contract likewise covers only
`*.test.js` and `*.Tests.ps1`.

There are **zero `*.Spec.ps1` files today**, so nothing is currently orphaned. But a suite added under
that name would be executed by nothing and flagged by nothing — passing green exactly as the five
historical orphans did. The naming convention is load-bearing and enforced only by convention.

### F3 — The Pester discovery floor has drifted far below actual

`app/test-reachability.test.js` asserts `testPs.length >= 14`, and its Pester sibling asserts the same
floor. The actual count is **35**. Twenty-one suites could be deleted before either watchdog objected.
The floor was presumably set when 14 was near the true count; it has not tracked growth.

### F4 — Reachability walk excludes three directory names

The meta-test never descends into `vendor`, `dist`, or `source-material` (alongside the expected
`node_modules`, `.git`, `.worktrees`). The exclusions are documented and deliberate — `source-material`
holds archived snapshots containing historical copies of repo files, which would otherwise produce
false orphan reports. Recorded for completeness: a genuine suite placed under those paths would not be
audited by the watchdog.

### Inverse failures checked, none found

- **Chain entries pointing at a missing file:** none (67/67 resolve).
- **Duplicate chain entries:** none.
- **Zero-assertion suites:** none. The smallest is `renderer/tts-device-config.test.js` at 3
  assertions; the full distribution runs 3 → 380. No suite registers 0 and passes green.

## Method

- Chain parsed programmatically from `app/package.json` `scripts.test`, split on `&&`.
- On-disk enumeration by `find` over `app/`, pruning `node_modules`, matching `*.test.js`,
  `*.spec.js`, `*.test.mjs`, `*.test.cjs`, `*Tests.js`. Only `*.test.js` matched.
- Assertion counts attributed from the merged-main gate log by execution order, validated as described
  in § 2. Counting must match three distinct summary formats the suites emit — `name: N passed,
  M failed`, bare `N passed, M failed`, and `file.test.js: N assertions passed`. A single-pattern
  regex undercounts to 59 suites / 4,447 assertions and looks like a shortfall; it is not one.
- The three wrapper-reached Node suites were run standalone for their counts.
- Pester enumeration by `find` over the whole repo, pruning `.worktrees/` and `node_modules/`.
- Pester tooling note: only Pester **3.4.0** is installed (Windows PowerShell 5.1; no `pwsh` on this
  host), so Pester-5 parameters such as `-Show` fail. Always invoke via `scripts\run-pester.ps1`.

## Status

Read-only audit. No runner, test file, or configuration was modified. The register below carries the
disposition of every item; R1 is the only one with work committed.

## Findings register

Self-contained by design: a reader arriving here needs no prior session. Reference commits —
`8c6bfce` is main at audit time, `55ec2d9` is the audit commit on `audit/test-runner-wiring`,
`cf6c1a8` is the R1 fix on `fix/pester-reachability-exact-match`.

| ID | Item | Disposition |
| --- | --- | --- |
| **R1** | Pester guard used substring, not exact match | **Fix committed, awaiting review** (`cf6c1a8`) |
| **F5** | Three summary output formats across suites | **Open — recommendation pending Blue priority and a bounded specification** |
| **F1** | 3,988 wrapped Node assertions absent from both headline summaries | **Open — requires a defined aggregation/reporting contract** |
| **F2** | `*.Spec.ps1` invisible to runner and contract | **Open** (latent; zero instances) |
| **F3** | Discovery floor `>= 14` against 35 actual | **Open — expect deletion, not a bump** (likely redundant after F2) |
| **F4** | Walk skips `vendor`, `dist`, `source-material` | **Closed — no action** |
| **R2** | Coordinated double-removal is silent | **Won't fix — recorded so it is not rediscovered** |

### R1 — Pester reachability guard used a substring test — FIX COMMITTED, AWAITING REVIEW

`scripts/test-reachability.Tests.ps1` asserted its sibling's wiring with
`$pkg.scripts.test.Contains('test-reachability.test.js')` — a substring test against the whole script
string. It caught **removal** but not **neutering**: changing the chain entry to
`node test-reachability.test.js || exit 0` leaves the filename present, so `Contains()` still passed
while the Node-side meta-test's failures stopped failing the chain. A disarmed watchdog was
indistinguishable from a working one — and this is the guard protecting all 67 suites.

The Node side had already solved this and recorded why: `app/test-reachability.test.js` tokenizes on
`&&` and compares each `node <path>` for equality, commenting that a substring false-negative would be
self-defeating. That reasoning had never been applied to the assertion guarding the Node side itself.

Fixed on `fix/pester-reachability-exact-match` (`cf6c1a8`) by **porting** the Node logic rather than
writing new matching, so the two sides stay symmetric. Proven in both directions with
`app/package.json` temporarily neutered, then reverted byte-identical: before the fix 4 passed /
0 failed (defect green), after the fix 3 passed / 1 failed (caught), after revert 4 passed / 0 failed
(no false positive). Branch gates matched main exactly: app 67/4,888/0, Pester 955/0/0. Not merged.

### F5 — Suites emit three different summary formats — OPEN, PRIORITY NOT AUTHORIZED

Suite summaries appear in three shapes: `name: N passed, M failed`, bare `N passed, M failed`, and
`file.test.js: N assertions passed`. Any single-pattern regex over the gate log therefore undercounts
to **59 suites / 4,447 assertions** — a shortfall plausible enough to look like real gate erosion.

This is the **root cause of the log-parsing trap**, and its cost is documented rather than hypothetical:
it produced a mid-audit false positive in the audit that found it, and two work orders were opened
against gate shrinkage that had never occurred. Normalizing these summaries would improve readability
and make one parser shape sufficient for the 67-entry app chain. It would **not** make the top-level
app or Pester summaries include the wrapper-executed Node totals, and it is not an enabler or
prerequisite for F1.

This audit recommends considering F5 only after Blue makes a priority decision and issues a bounded
specification/work order. `BLUE-HELM-MASTER-STATUS.md` remains the controlling release order; this
audit does not reprioritize it. Before any runner or aggregator is specified or built, the work order
must also determine whether the proposal extends existing test tooling or creates a new subsystem
subject to the OSS procurement gate.

### F1 — 3,988 wrapped Node assertions appear in neither headline — OPEN, CONTRACT REQUIRED

Three Node suites run only inside Pester wrappers. The wrappers contribute Pester `It` cases that
check properties such as exit code 0, no `FAIL` lines, and zero failures in the Node summary, while
the wrapped suites' own Node counts disappear from both headline summaries:

| Node suite | Wrapper | Assertions |
| --- | --- | ---: |
| `app/renderer/video-model-policy.test.js` | `scripts/video-model-policy-node.Tests.ps1` | 398 |
| `scripts/gemini-video-sdk.test.js` | `scripts/gemini-video-sdk-node.Tests.ps1` | 3,491 |
| `scripts/gemini-followup.test.js` | `scripts/gemini-followup-node.Tests.ps1` | 99 |

The measurements on `8c6bfce` are 4,888 app-chain Node assertions, 955 passed Pester `It` test cases,
and 3,988 wrapped Node assertions absent from both headlines. The 955 Pester result is not a count of
executed `Should` assertions, so adding it to either Node figure would mix units. F1 needs a specified
aggregation/reporting contract that measures actual Pester assertion executions, represents the
wrapper-executed Node suites, and prevents double-counting. Summary normalization under F5 neither
defines nor supplies that contract.

Not a coverage hole — failures propagate by exit code, so a broken wrapped suite still fails the gate.
The defect is that **the cited ceiling is decorative rather than load-bearing**: a quiet erosion inside
a wrapped suite cannot move the number anyone reads. The figure looks like a coverage measure and is
not one.

### F2 — `*.Spec.ps1` is invisible to every runner — OPEN, LATENT

`run-pester.ps1` filters `*.Tests.ps1` only; Pester's own discovery uses the same convention; and the
Node meta-test's reachability contract covers only `*.test.js` and `*.Tests.ps1`. A suite added as
`*.Spec.ps1` would be executed by nothing and flagged by nothing — passing green exactly as the five
historical orphans did. Zero such files exist today, so nothing is currently unreachable.

**Fix at the contract layer, not the glob.** Widening the runner's filter alone leaves the meta-test
contract enumerating extensions, and the class simply regenerates under the next unlisted extension.
The contract should define what counts as a test file and require that every such file be reachable.

### F3 — Discovery floor asserts `>= 14` against 35 actual — OPEN, EXPECT DELETION

Both meta-tests assert a floor of 14 Pester suites while 35 exist; 21 could be deleted before either
objects. More fundamentally a floor only ever catches **mass deletion**, never the single-file
disappearance that is the failure mode this repo has actually experienced five times.

**Do not bump the number** — a floor that tracks growth is still blind to the real case. Expect this
assertion to become redundant once F2 extends the contract to cover every test file by identity
rather than by count, at which point delete it.

### F4 — Reachability walk skips three directory names — CLOSED, NO ACTION

The walk never descends into `vendor`, `dist`, or `source-material` (alongside `node_modules`, `.git`,
`.worktrees`). Documented and deliberate: `source-material` holds archived snapshots containing
historical copies of repo files, which would otherwise generate false orphan reports. Recorded for
completeness only — a genuine suite placed under those paths would not be audited.

### R2 — Coordinated double-removal is silent — WON'T FIX

Deleting `scripts/test-reachability.Tests.ps1` **and** unhooking the Node entry from the chain in a
single change is undetectable: the app gate runs 66 green suites (the assertion that would have caught
the missing sibling left with it), and Pester runs 34 green suites with the `>= 14` floor still
satisfied. Neither watchdog survives to name the other.

**Deliberately not fixed.** Every mutual-guard loop has this property, and adding a third guard merely
relocates it — that guard is then itself unguarded. This class terminates in commit review, not in
automation. Recorded here so a future audit recognizes it as an accepted structural limit rather than
rediscovering it as a new gap.

### Corrected premise — the shrinkage never existed

The audit was opened on a suspected collapse of the app gate. There was none. `npm test` on `8c6bfce`
reports **67 suites / 4,888 assertions / 0 failures**.

The two figures that prompted it were misread: **205** was a single suite's own summary line
(`video-scout-args.test.js`), and **134** was the last line of a 5,279-line log
(`renderer/admission-view.test.js`), each taken for a total. The wiring is sound — 68 test files, 67
chained, Y-rows summing to exactly 4,888 across exactly 67 files, no duplicates, no entry naming a
missing file, and no zero-assertion suite. The one unchained file is reached by a Pester wrapper.

Recorded because the misreading was itself caused by F5, and because a future reader encountering
"205" or "134" in the history should not re-open this investigation.

### Hygiene — unrelated to test wiring, non-blocking

**H1 — `.worktrees/` is untracked but not ignored.** Verified: `git check-ignore` matches no rule for
it, and `git status` reports it as `?? .worktrees/`. It currently holds **35** worktree directories.
A single `git add .` at the repo root would stage all of them. Every other local-only artifact class
in this repo is ignored explicitly — `.merge-gate/`, `.agent-review*.diff`, `media/`, `node_modules/`.
`.worktrees/` is the omission. Adding it to `.gitignore` is a one-line change, deliberately not made
here because this branch is documentation-only.

**H2 — 15 loose `.agent-review-*.diff` files at the repo root.** Note the correction to the figure
this was reported with: there are **15**, not 16, and they **are** already ignored, by
`.gitignore:33` (`.agent-review*.diff`). So they cannot be committed by accident — that half of the
concern does not apply. The exposure runs the other way: because they are ignored, `git clean -xdf`
or `-Xdf` deletes them, and being ignored is precisely what puts them in range. They are review
evidence pinned by SHA-256 in handoff documents, so their loss would break the reproduction path
those documents describe. No action proposed; the durable fix is to stop treating a gitignored
working-directory file as an archival artifact.
