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

**Result: 35 files, all `*.Tests.ps1`, zero `*.Spec.ps1`.** All 35 live under `scripts/` — 12 directly
and 23 under `scripts/lib/` — therefore all fall inside the runner's recursive root and all are
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

Three Node suites are reached only through Pester wrappers. Each wrapper contributes a handful of
Pester assertions (exit code 0, no `FAIL` lines, zero failed in its own summary) while the wrapped
suite's real assertions are counted nowhere:

| Node suite | Wrapper | Its own assertions | Counted in 4,888? | Counted in 955? |
| --- | --- | ---: | :---: | :---: |
| `app/renderer/video-model-policy.test.js` | `scripts/video-model-policy-node.Tests.ps1` | 398 | No | No (4 wrapper assertions only) |
| `scripts/gemini-video-sdk.test.js` | `scripts/gemini-video-sdk-node.Tests.ps1` | 3,491 | No | No |
| `scripts/gemini-followup.test.js` | `scripts/gemini-followup-node.Tests.ps1` | 99 | No | No |

**Total executed but uncounted: 3,988.** The repository's true executed assertion count on `8c6bfce`
is therefore **9,831** (4,888 + 955 + 3,988), not the 5,843 the two headline gate figures imply — the
recorded numbers understate coverage by roughly 40%.

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

Read-only audit. No runner, test file, or configuration was modified. No repair is proposed here;
F1–F4 await Blue's authorization before any change.
