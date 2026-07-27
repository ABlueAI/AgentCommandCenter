# Builder Handoff — V4 Bounded Multi-Slice

Branch: `feature/v4-bounded-multi-slice`
Fork-point SHA: `4c07db9a387191485b51cb99886d58d94573c1ad`
Pre-merge main SHA: `4c07db9a387191485b51cb99886d58d94573c1ad` (verified `main` == `origin/main` == this SHA before branching; re-verify at gate time)
Reviewed code tip: `f17b51fdbe2dbd2b6110257f2df459dd7edc04f0`
Branch tip: `f17b51fdbe2dbd2b6110257f2df459dd7edc04f0` (single commit; no handoff tail yet — this doc lands as the tail)
Merge commit SHA: Pending until merge

## Baseline correction (approved by Blue before any code)

The work order pinned `main == origin/main == a6bba64`. At planning time the real baseline was
**`4c07db9`** — five commits ahead (the accepted **P12 launcher-hardening** merge). Blue approved
rebaselining on `4c07db9`; all other work-order terms unchanged. Consequently the recorded baseline
gates are **app 1203/0, Pester 659/0/0** (the order's 1132/0 was the pre-P12 number).

Baseline gates re-measured in the fresh worktree at `4c07db9`: app **1203 passed / 0 failed**,
Pester **659 passed / 0 failed / 0 skipped**.

## Intended invariant (single)

Allow one explicit Video Scout submission to contain two to eight bounded video slices while
enforcing the fixed aggregate 1,800-second sliced-analysis cap **before any download, provider
submission, or other paid action**.

The submission remains: one Video Scout run · one main-issued run identity · one manifest · one
provider request body · one durable report · **one logical request under K5** · at most three
submitted attempts of the same byte-identical request body.

- **Zero** populated rows → existing whole-video behavior, unchanged.
- **One** populated row → existing single-slice SDK behavior and existing manifest v2, unchanged.
- **Two to eight** populated rows → V4 multi-slice behavior and manifest **schema v3**.

## Gate tier

**Full-class.** Blast-radius rationale: this branch changes what a paid provider request contains
and how the aggregate-duration cost cap is enforced before spend. A defect could multiply billed
video tokens or bypass the cap — cost-direction guards are an explicit Full-class trigger.

## Provider architecture (as decided in the work order) and its evidence boundary

ONE `generateContent` request containing **N ordered media parts** — each repeating the **same**
validated public YouTube URL through `fileData.fileUri`, each carrying **only its own**
`videoMetadata.startOffset`/`endOffset` — followed by **one** text part last. There is no media
upload on this route (the URL rides `fileData.fileUri`), so this is deliberately **not** described
or implemented as "one uploaded file".

Implemented exactly as specified: no N sequential requests, no upload/Files-API/Interactions-API
path, no silent slice reduction, no sorting/dedup/merge/normalization, and **no fallback** to
whole-video, CLI/download, or sequential calls if Gemini rejects the multipart body. A provider
rejection fails visibly and preserves an honest `outcome:'error'` manifest.

**Documented limitation (carried forward verbatim from the work order):** the official Gemini
documentation supports clipping through per-part `videoMetadata`, permits up to ten video inputs
for Gemini 2.5 and later, and recommends one video per prompt for optimal results. The repository
uses Gemini 2.5 model variants, so multiple clipped parts repeating one public YouTube URL is a
**documented-compatible architectural inference**, but the provider documentation does not
specifically demonstrate that exact repeated-URL shape. **Blue's exactly-one short paid acceptance
run after the Opus review is the real-provider confirmation.** No contradiction with current
repository facts was found before implementation began.

## Application limits (all enforced independently at three layers)

| Limit | Value |
|---|---|
| Minimum multi-slice count | 2 |
| Maximum slice count | 8 (deliberately below Gemini's documented 10-video maximum) |
| Maximum offset | 86,400 s |
| Maximum serialized slice-control payload | 2,048 UTF-16 units (bounds **only** the slice argument) |
| Fixed aggregate multi-slice duration cap | 1,800 s (**not** raisable by `-MaxDurationSeconds`) |

## Files changed (29 total: 26 modified, 3 added)

**Added**
- `scripts/lib/get-video-scout-slice-ranges.ps1` — the scoped pure helper Blue named. Parses/validates
  `-SliceRangesJson`, re-serializes canonical JSON, refuses an accompanying override
  (`Assert-MultiSliceOverrideAllowed`), and composes the deterministic scope instruction.
- `scripts/lib/get-video-scout-slice-ranges.Tests.ps1` — 50 tests (auto-discovered by the recursive
  Pester runner; the runner was **not** edited, per Blue's clarification).
- `scripts/test-fixtures/slice-json-echo.ps1` — test-only fixture for the real Windows argv roundtrip.

**Production modified**
- `app/renderer/video-range-ui.js` — slice-row decision logic (`classifySliceRows`,
  `computeSliceAggregate`, `detectStaleSliceRows`, `sliceRowState`, `parseTimeToSeconds` moved here).
- `app/renderer/app.js` — repeatable slice-row DOM, Add/Remove, live aggregate display, modal reset,
  clear-on-hide extended to the row set, `sliceRanges` in the `ptyStart` passthrough.
- `app/renderer/index.html`, `app/renderer/styles.css` — slice rows, Add Slice control, aggregate display.
- `app/video-scout-args.js` — the main-boundary `sliceRanges` contract → one discrete `-SliceRangesJson`.
- `scripts/feed-gemini.ps1` — `-SliceRangesJson` param, mutual exclusion, independent revalidation,
  route backstop, v3 manifest init, multi-slice guard call, `--slice-ranges-json` to node.
- `scripts/lib/get-duration-guard.ps1` — `MultiSliceAggregate = 1800` + the `slice-aggregate` gate and
  its request-shape/override refusals (new refusal reason `override-not-allowed`).
- `scripts/lib/invoke-duration-probe.ps1` — `Assert-DurationGuard` passes the multi-slice parameters through.
- `scripts/lib/video-scout-manifest-schema.ps1` — schema v3 + `Assert-VideoScoutSliceRangesValid`.
- `scripts/lib/write-video-scout-manifest.ps1` — `-SliceRanges` passthrough.
- `scripts/lib/video-scout-library-core.ps1` — derived `sliceCount` / `aggregateSliceSeconds`.
- `app/library-ipc.js` — forwards the two bounded numbers only.
- `app/renderer/library-view.js` — `N slices · Xs` / `requested N slices · Xs` labels.
- `scripts/gemini-video-sdk.js` — `--slice-ranges-json` parse + **full independent re-validation**
  (`resolveSliceRanges`), N-part `buildRequestBody`, `buildSliceScopeInstruction`, usage-line `slices=N`.

**Test files extended** (no new JS test files; `app/package.json` and `scripts/run-pester.ps1` untouched):
`app/video-scout-args.test.js`, `app/renderer/video-range-ui.test.js`, `app/renderer/library-view.test.js`,
`app/library-ipc.test.js`, `scripts/gemini-video-sdk.test.js`, `scripts/feed-gemini.Tests.ps1`,
`scripts/lib/get-duration-guard.Tests.ps1`, `scripts/lib/video-scout-manifest-schema.Tests.ps1`,
`scripts/lib/video-scout-library-core.Tests.ps1`, `scripts/lib/record-video-scout-media.Tests.ps1`,
`scripts/lib/cleanup-video-scout-media.Tests.ps1`, `scripts/lib/retention-sweep-video-scout-media.Tests.ps1`.

**Better than the work order expected:** `app/main.js` and `app/preload.js` required **zero hunks** —
`buildVideoScoutArgs(opts)` already receives the whole IPC payload inside the existing
`if (opts.videoScout)` branch, and preload is a generic passthrough.

## Security / cost-sensitive surfaces touched

Provider request **body composition** (the paid surface) · the **aggregate-duration cost guard** ·
the untrusted renderer→main IPC payload · the PS→node argument boundary · the manifest schema
(a new version) · the Library read projection. **Not touched:** the fence gate, PTY behavior,
credential storage/injection, K5 retry policy, report persistence, V3a focus, V3b follow-up, and
the three media ownership/deletion modules.

## Preservation evidence

**Git blob hashes, fork point vs reviewed tip — IDENTICAL for every one of these:**

| File | blob (both) |
|---|---|
| `app/main.js` | `c5198a5b68af` |
| `app/preload.js` | `97bb5d1c762f` |
| `scripts/lib/record-video-scout-media.ps1` | `826eb1d0d100` |
| `scripts/lib/cleanup-video-scout-media.ps1` | `582d5efd66b5` |
| `scripts/lib/retention-sweep-video-scout-media.ps1` | `afe3dc1d0ae7` |
| `prompts/video-scout-analysis.md` | `8e636203400b` |
| `prompts/transcript-analysis.md` | `e21e0c418ea9` |
| `app/package.json` | `f37d5ad9ab08` |
| `scripts/run-pester.ps1` | `929b0f21b08f` |

Because `app/main.js` is byte-identical, the fenced-role cwd block, `FENCED_ROLES`, `realOrNearest`,
`ptyEnv` construction, `CLAUDE_CODE_SUBPROCESS_ENV_SCRUB=1`, and the entire `pty-start` handler are
unchanged by construction — no hunk-level argument required.

**K5 segments inside the one modified SDK file — SHA-256 (first 16), base vs tip, all IDENTICAL:**
constants `84E1ABF55AE59453` · `resolveSliceOffsets` `91B4C5D10E1C6B4E` · `sanitizeUpstreamText`
`5C5AD8F5F1EC50FA` · `classifyHttpFailure` `D05E2A4DAD4007BB` · `retryDelayMs` `6CC33D680AAB903F` ·
`submitGeminiRequest` (the shared transport) `1D332818C705E2D5` · `runCliEntry` `BA22722EB7BD2779`.

## Commands run

1. `node --check` on all 11 changed `.js` files — all ok.
2. `PSParser::Tokenize` on all 13 changed `.ps1` files (+ the 3 new) — 0 parse errors.
3. `cd app; npm.cmd test` → **1297 passed / 0 failed** (exit 0). Re-run on the committed tree: identical.
4. `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\run-pester.ps1` →
   **802 passed / 0 failed / 0 skipped** (exit 0). Re-run on the committed tree: identical.
5. `git diff --check` → clean (exit 0).
6. Test reachability: 33 `*.Tests.ps1` discovered recursively, including the new
   `get-video-scout-slice-ranges.Tests.ps1`. No new JS test file was created, so `app/package.json`
   needed no wiring (and is byte-identical).

## Exact test results

| Suite | Result | Note |
|---|---|---|
| app aggregate | **1297 / 0** | baseline 1203 → +94 |
| Pester aggregate | **802 / 0 / 0** | baseline 659 → +143 |
| `get-video-scout-slice-ranges.Tests.ps1` | 50 / 0 | new file |
| `get-duration-guard.Tests.ps1` | 58 / 0 | +25 V4 |
| `video-scout-manifest-schema.Tests.ps1` | 96 / 0 | +29 V4 |
| `feed-gemini.Tests.ps1` | 47 / 0 | +21 V4 lifecycle |
| `video-scout-library-core.Tests.ps1` | 40 / 0 | +7 V4 |
| `cleanup-video-scout-media.Tests.ps1` | 31 / 0 | +6 v3 non-eligibility |
| `retention-sweep-video-scout-media.Tests.ps1` | 49 / 0 | +6 v3 non-eligibility |
| `record-video-scout-media.Tests.ps1` | 16 / 0 | +4 v3 refusal |
| `video-scout-args.test.js` | 162 / 0 | +~50 incl. the argv roundtrip |
| `video-range-ui.test.js` | 52 / 0 | +~40 row-set |
| `gemini-video-sdk.test.js` | 158 / 0 | 105 → +53 V4 |
| `library-view.test.js` | 36 / 0 | +11 V4 |
| `library-ipc.test.js` | 30 / 0 | +7 V4 |

### The load-bearing argv roundtrip (Blue's binding clarification)

`app/video-scout-args.test.js` spawns a **real** `powershell.exe -File` child against the repo-owned
fixture `scripts/test-fixtures/slice-json-echo.ps1`, passing the args as a **node-pty-style argument
array** exactly as `main.js` does, and compares the received `-SliceRangesJson` value **byte-for-byte**
(base64-encoded across the boundary to remove console-encoding ambiguity). Result: **69 units sent,
69 received, identical.** Non-network, no provider, no media.

### Node-tripwire evidence (refusal ordering)

`scripts/feed-gemini.Tests.ps1` runs the **real** `feed-gemini.ps1` with the probe subprocess and
`node` shadowed. `NodeReached` is asserted **false** for: malformed JSON · >2048-unit payload · bare
JSON object · 1-entry array · 9 slices · overlap · 1801 s aggregate · slices+scalar range ·
slices+`-MaxDurationSeconds` · slices without `-VideoScout` · non-YouTube (CLI route) · live source ·
undeterminable duration. **Positive control:** a valid 2-slice run *does* reach node, proving the
tripwire can fire, and passes `--slice-ranges-json` as one discrete argv element carrying the exact
canonical JSON with no `--start-offset`/`--end-offset` alongside.

## V4 × K5 attribution (as required)

- **Logical provider request count: 1**
- **Maximum submitted attempts: 3** (unchanged shared K5 transport)
- **Sequential per-slice request count: 0**

Automated tests count actual injected/loopback HTTP submissions and compare bodies: one fetch on
success; three byte-identical bodies across two bounded 1200/2200 ms delays on retries; no fourth
attempt; ambiguous network failure gets exactly one fetch; every refusal path performs **zero**
fetches. Source assertions pin exactly one attempt loop and exactly one `await submitGeminiRequest(`
call site. **No durable `requestCount`/`attemptCount` was added**, per the work order.

## Manifest v3 semantics and compatibility

`requestedSliceRanges` records the user's **normalized, guard-validated requested scope** — 2–8
exact-shape `{ startOffsetSeconds, endOffsetSeconds }` entries in user-visible chronological order.
Before terminal completion it is never described as analyzed or applied; on `outcome:'completed'`
the one successful provider request plus the durable report establish that the requested set was the
analyzed scope. Refused/error runs surface "**requested** N slices" in the Library. No
transport-attempt fields were added to resolve this distinction.

A v3 manifest **must** have `mediaArtifacts == []`, null scalar offsets, `route == 'sdk'`, and is
never a backfill. **v1 and v2 remain valid unchanged and reject the `requestedSliceRanges` key.**

### Retention / deletion non-expansion evidence

`record-video-scout-media.ps1`, `cleanup-video-scout-media.ps1`, and
`retention-sweep-video-scout-media.ps1` are **byte-identical** to the fork point (blob hashes above).
All three already gate on `schemaVersion == 2`, so v3 is excluded structurally. New tests pin it:
the recorder **throws** on v3 and claims no ownership; success cleanup is a no-op on a *completed
v3 run that has a durable report* (only the version excludes it) and leaves an unowned sibling,
report, manifest, and run directory intact; the retention sweep mutates nothing in **both** dry-run
and `-Apply` for an old errored v3 run. Implementation never required authorizing v3 in deletion code.

## Logging and privacy

V4 adds only bounded metadata: slice count, aggregate seconds, route, model, media resolution
(attempt/usage lines unchanged). The **serialized slice JSON never appears** in a note, log line, or
the Logs tab — asserted by test. No focus/prompt/report/response/media content or credential is
logged. **Honest scope note:** the application already emits the submitted video URL in existing
renderer/SDK operational output; V4 neither expanded nor refactored that. **V4 did not make Logs
URL-free**; removing existing URL logging requires a separate privacy work order.

## Known limitations

1. **End offsets beyond the probed source duration are an accepted V4 limitation** (Blue's binding
   clarification). Slice ends are not validated against the probed duration — matching existing
   single-slice behavior. Such a request may fail visibly at the provider, but it **cannot expand the
   authorized aggregate cost**, because the aggregate gate is computed purely from the requested
   offsets and capped at 1,800 s before any submission.
2. The repeated-same-URL multipart shape is a documented-compatible inference, not a
   documentation-demonstrated shape (see the evidence boundary above). Blue's single paid acceptance
   run is the confirmation.
3. Renderer row validation is immediate-feedback UX only; main, PowerShell, and the SDK are the
   enforcement boundaries (each re-validates the entire contract).
4. Two deliberate namings: `startOffset`/`endOffset` on the transport, `startOffsetSeconds`/
   `endOffsetSeconds` in the manifest — each matches its layer's existing field names. Flagged so the
   Reviewer does not read it as drift; a manifest-style key on the transport is refused by test.
5. The multi-slice run refuses `-MaxDurationSeconds` outright rather than ignoring it. This is
   stricter than the legacy single-slice behavior, which is preserved unchanged.

## Unexpected pre-existing findings

None introduced. One **pre-existing test assertion had to be updated as a direct consequence** of the
new schema version: `video-scout-manifest-schema.Tests.ps1` previously asserted that
`schemaVersion = 3` is rejected. It now asserts the supported set is `1, 2, 3` and uses `4` as the
genuinely unsupported version. This is disclosed rather than silently rewritten.

Process note (no code impact): PowerShell 5.1 reads BOM-less `.ps1` files as ANSI, so a UTF-8 em-dash
appended into a test file was misread as a curly quote and broke parsing. All V4-added PowerShell
content is ASCII-only with CRLF endings, matching the existing files.

## Manual acceptance checklist — reserved for Blue, exactly ONE paid logical request

Only after the Opus Full-class review returns a literal `VERDICT: PASS`.

1. Fully restart Electron, including the main process.
2. Choose one public YouTube video with two short, clearly distinct intervals.
3. Keep total selected duration small — preferably ≤ 60 s.
4. Enter two chronological, non-overlapping slices; record the chosen slices and expected aggregate.
5. Click **Create & Launch exactly once**.
6. Confirm the duration probe and aggregate guard complete **before** provider submission.
7. Confirm no yt-dlp download or local media ingestion occurs.
8. Confirm the operational output describes **one** logical multipart analysis.
9. Confirm the report distinguishes both slices and still begins with `## 1. TL;DR`.
10. Confirm the manifest is **schema v3**, records the exact requested slices, has empty
    `mediaArtifacts`, and reaches `outcome: completed`.
11. Confirm the Library shows the correct slice count/aggregate and opens the report.
12. Confirm V3b follow-up remains available — **do not submit one** (it is a second paid request).
13. Confirm Logs contain only the existing operational output plus bounded V4 metadata: no prompt,
    focus, report, response, media content, serialized JSON, or key.
14. Confirm no background request, continuation, download, new media artifact, or second report.
15. A retryable 503 may produce up to three submitted attempts — expected, still one logical request.
16. **Do not perform another paid V4 run.** Negative cases remain automated-only.
17. If the multipart body is rejected by the provider, record the visible failure as a V4
    compatibility finding. **Do not authorize a sequential fallback in the acceptance session.**

## Review diff

`git diff 4c07db9a387191485b51cb99886d58d94573c1ad...f17b51fdbe2dbd2b6110257f2df459dd7edc04f0 --output=.agent-review-v4-bounded-multi-slice.diff`

Pinned (gitignored, created with `--output`, never PowerShell redirection):
`.agent-review-v4-bounded-multi-slice.diff` — **204,586 bytes, 29 files**,
SHA-256 `A78C2832B3F52B6843284D93DE46E531E386853C740AB12A59DA0723D6D73DAE`.

## Recommended Opus Full-class review focus

1. Baseline SHAs, branch ancestry, this handoff, and byte-for-byte reproduction of the pinned diff.
2. Renderer row behavior and visible refusal (partial row, blank-among-populated, no pane on failure).
3. Renderer→main payload shape and the main-boundary validation (exact keys, types, count, order,
   overlap, aggregate, 2048-unit cap, mode/route gates, scalar mutual exclusion).
4. PowerShell JSON parsing incl. PS 5.1 object/singleton coercion, and **guard ordering**.
5. Proof that every refusal occurs **before** Node/provider reachability (tripwire + positive control).
6. Exact multipart body construction and prompt ordering (golden 2- and 8-slice JSON).
7. Actual submitted-fetch multiplicity and K5 byte-identical retries.
8. Manifest v3 requested-versus-applied truth.
9. v1/v2 and Library compatibility.
10. That v3 cannot become media ownership/deletion authority.
11. V3a focus, report persistence, V3b follow-up, and metadata-only V4 additions intact.
12. Fence/PTY preservation via the blob-hash evidence (`app/main.js` byte-identical).
13. Test reachability, and that no implementation test used a paid provider or real media.

Reviewer verdict: _pending_

Reviewer verdict source: _pending — Opus Full-class, whole-diff, read-only review_

## Review-diff rule

- Before merge: `git diff main...f17b51f` (equivalently the immutable `4c07db9...f17b51f`).
- After merge: reproduce with `git diff 4c07db9a387191485b51cb99886d58d94573c1ad...f17b51f`
  (`git diff main...<tip>` goes empty once the tip is an ancestor of `main`).
- Always use `--output`; never PowerShell `>`.
- Retain the literal `VERDICT: PASS|FAIL` line and identify the review that produced it.

Pinned `.agent-review-*.diff` files are local review artifacts and remain gitignored.
