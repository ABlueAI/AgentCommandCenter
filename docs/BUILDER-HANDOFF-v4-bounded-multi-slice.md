# Builder Handoff — V4 Bounded Multi-Slice

Branch: `feature/v4-bounded-multi-slice`
Fork-point SHA: `4c07db9a387191485b51cb99886d58d94573c1ad`
Pre-merge main SHA: `4c07db9a387191485b51cb99886d58d94573c1ad` (verified `main` == `origin/main` == this SHA before branching; re-verify at gate time)
Reviewed code tip: **`83b50e776e4c24f7a685424bc2c99f526b22afdf`** (V4Q final — supersedes `32393f5`, `5b5e30a`, and `f17b51f`)
Superseded reviewed code tips: `5b5e30a102e92a02151ee4b4876a379e6fa7069b` (V4R) and `f17b51fdbe2dbd2b6110257f2df459dd7edc04f0` (original V4) — both passed review, then FAILED human acceptance
Merge commit SHA: Pending until merge

Pinned diff: `.agent-review-v4-bounded-multi-slice.diff` — **662,462 bytes, 43 files**
(32 modified, 11 added, 0 deleted), SHA-256
`26F37F0A73611B3AFFC82F9B0627261B89A2A3FB5E8822D5868582F5B506A92D`.
Gitignored, created with `git diff --output`, verified to regenerate byte-for-byte.

---

## MERGE-GATE HANDOFF TAIL — final reviewed tip and pinned diff

**Authoritative review range:**
`4c07db9a387191485b51cb99886d58d94573c1ad...83b50e776e4c24f7a685424bc2c99f526b22afdf`

| Item | Value |
|---|---|
| Final reviewed tip | `83b50e776e4c24f7a685424bc2c99f526b22afdf` |
| Review base (pre-merge `main`) | `4c07db9a387191485b51cb99886d58d94573c1ad` |
| Branch | `feature/v4-bounded-multi-slice` |
| Merge commit | Pending until merge |

> **Superseded reviewed tip:** `32393f5f023d84dd7aff9b2f197408b969591dc4`, whose pinned artifact was
> 656,095 bytes / SHA-256 `1D5A4BCE6972A9878B244A05CE216A581400DAFE8B3D9548EAB255695085ED50`. It was
> replaced by a two-document truth correction (superseded-review labelling and billing language).
> `32393f5` and the former tail commit `f339564` are now **inside** the reviewed range, not the
> handoff tail. That artifact identity is historical and must not be used for the merge gate.

**Pinned diff.** `.agent-review-v4-bounded-multi-slice.diff` — **662,462 bytes**, SHA-256
`26F37F0A73611B3AFFC82F9B0627261B89A2A3FB5E8822D5868582F5B506A92D`, **43 files**
(32 modified, 11 added, 0 deleted), **+8,985 / −204**. Created with `git diff --output` (never
PowerShell redirection), regenerated to a separate temporary file and compared **byte-for-byte
identical**; the temporary file was removed. Gitignored via `.gitignore:33` (`.agent-review*.diff`),
a regular file inside the registered worktree, with no reparse point on any path component. Never
staged, never committed.

Reproduce with:

```
git diff 4c07db9a387191485b51cb99886d58d94573c1ad...83b50e776e4c24f7a685424bc2c99f526b22afdf --output=.agent-review-v4-bounded-multi-slice.diff
```

**Final gate totals** (measured at `32393f5`; the only commits since are documentation-only, and
every production and test blob is byte-identical to that tree, so these totals still hold — the
Full-class reviewer will independently re-run both gates).

| Gate | Result |
|---|---|
| app | **1340 passed / 0 failed** |
| Pester | **955 passed / 0 failed / 0 skipped** |
| `video-model-policy.test.js` | 398 / 0 |
| `gemini-video-sdk.test.js` | 839 / 0 |
| `video-scout-args.test.js` | 205 / 0 |
| `video-range-ui.test.js` | 52 / 0 |
| `launcher-fence-invariant` / `launcher-authz` | 6 / 0 · 18 / 0 |
| reachability | Node 6 / 0 · PowerShell 4 / 0 |

16 JavaScript files syntax-checked, 22 PowerShell files parsed, zero failures. `git diff --check`
clean. `app/package.json` **byte-identical to the review base**. `app/main.js` and `app/preload.js`
are also byte-identical to the base — the whole branch never touched the IPC boundary.

**Accepted checkpoint verdicts.** `CHECKPOINT REVIEW: PASS` on the cumulative backend range
`ad14423e...4e77046`, on the Phase B correction `72c632e...810f257`, and on the cumulative V4Q range
`ad14423e...810f257`.

> **The final Full-class whole-diff verdict is still PENDING.** No verdict exists for
> `4c07db9...83b50e7`. A checkpoint PASS never authorized merge, push, a provider probe, or an
> acceptance run, and neither does this tail.

**Zero provider activity.** No provider request, prompt-compliance probe, credential use, network
media, acceptance run, merge, or push occurred at any point during V4Q or Phase B. The preserved
run-directory count remained **31** throughout, with `run-20260727-001226-817-10472-c46bea78` — the
failed-acceptance evidence — still the newest and untouched.

### Reviewer instructions

Read-only. Do not edit files, run a provider probe, perform manual acceptance, merge, or push.

1. Verify base, reviewed tip, branch tip, ancestry, clean state, and the one-commit handoff tail.
2. Reproduce and byte-compare the pinned three-dot diff.
3. Review the renderer's repeatable 1–8 slice UX, validation, ordering, overlap policy, and visible
   refusal paths.
4. Confirm aggregate duration and request-size guards execute **before** download or provider
   reachability.
5. Confirm one request body contains N ordered media parts plus one final text part — never N
   sequential provider requests.
6. Confirm K5 remains one logical request with at most three byte-identical eligible attempts.
7. Recheck the Windows PowerShell 5.1 native-argument transport repair using the real `node.exe`
   negative and positive controls.
8. Review effective-model resolution, Pro-only thinking configuration, output-token ceilings,
   explicit-model precedence, and renderer/backend agreement.
9. Review the real selector event wiring — same-value activation, keyboard operation,
   tab-without-activation, invalid values, and modal reset.
10. Review the quality gate's structural checks, canonical-field format/content precedence, bounded
    lexical productions, false-positive controls, and documented limitations.
11. Review rejected-response preservation, schema-v4 truth, usage retention, content-free
    reasons/Logs, and Library/retention non-exposure.
12. Verify preservation of the fenced-role cwd gate, unrelated PTY behavior, credential isolation,
    V3a focus, V3b follow-up, manifest truth, reports, Library, retention ownership, and media
    deletion boundaries.
13. Independently run the app and Pester gates, confirm test reachability and zero provider activity.

End with exactly `VERDICT: PASS` or `VERDICT: FAIL — <bounded reasons>`.

`docs/BUILDER-HANDOFF-v4-bounded-multi-slice.md` is present as a regular `100644` blob at the
reviewed tip, so any commit above it can only ever be a **modification** — which is exactly the
handoff-tail shape `scripts/merge-gate.ps1` requires.

> **Release status: STALE. Neither the original V4 verdict nor the V4R verdict authorizes release
> any more.** Both are historical evidence only.
>
> The V4R review below returned a literal `VERDICT: PASS` for `4c07db9...5b5e30a`, and that text is
> still recorded verbatim under [Reviewer verdicts](#reviewer-verdicts) — but the wording there
> claiming it "authorizes the merge and the single paid acceptance run" **no longer holds**. A
> second human acceptance pass failed on *content quality*: the response was transported correctly
> and cost real money, then proved unusable — it invented a source duration it could not see and
> asserted synthetic origin it had no evidence for. Correct transport is not a correct report.
>
> That failure opened **V4Q**, which adds a deterministic report-quality gate on top of everything
> V4R proved. V4Q's contract, its deliberate limitations, and what it explicitly does NOT protect
> are documented in
> [`BUILDER-HANDOFF-v4q-video-scout-quality.md`](BUILDER-HANDOFF-v4q-video-scout-quality.md).
>
> Release now requires a NEW Opus 5 Full-class whole-diff review of the branch including V4Q,
> ending in a literal `VERDICT: PASS`. Read the V4R material below as an accurate record of the
> transport repair — not as a live release authorization.

---

# Release-candidate summary — what this branch actually ships

This section is the current, release-facing truth for the whole branch. Where it disagrees with the
V4 or V4R material further down, **this section wins**; the older sections are preserved unchanged
as historical evidence of what was reviewed and what was learned.

**The final review base is still `4c07db9a387191485b51cb99886d58d94573c1ad`.** The reviewed range is
`4c07db9...<FINAL_REVIEWED_TIP>`, covering V4 + V4R + V4Q in one whole-diff pass.

### What changed since the V4R verdict

| Area | V4R state | Release-candidate state |
|---|---|---|
| Manifest schema | v3 for live sliced runs | **v4** for every new live SDK run (v1/v2/v3 remain readable) |
| Sliced model selection | Flash-Lite everywhere | **Pro automatically** for video mode, unless the user pins another allowlisted model |
| Report acceptance | any transported response became a report | a response must pass a **deterministic quality gate** first |
| Rejected responses | not preserved | preserved as `rejected-response.txt`, `outcome: error`, `reportFile: null` |
| Whole-video analysis | same path as sliced | **not covered** by the sliced-response quality gate |

### The model policy, stated plainly

Within one New Agent modal session, Video Scout automatically selects Flash-Lite for transcript and
audio and **Pro for video**. A manual selection wins for the rest of that session and survives every
analysis-mode change — including **deliberate same-value selector activation**, because a `<select>`
emits no `change` event when the user picks the option already shown. Closing and reopening the
modal resets to transcript + automatic Flash-Lite. Nothing is persisted to disk.

### The quality gate is part of the release candidate

The deterministic gate, its two canonical Video Profile fields, durable rejected-response
diagnostics, and Library/media-inventory non-exposure of rejected content are all in scope for the
final review. See
[`BUILDER-HANDOFF-v4q-video-scout-quality.md`](BUILDER-HANDOFF-v4q-video-scout-quality.md) for the
complete contract.

> **"Quality gate passed" does not mean the analysis is factually true.** The gate is a structural
> and lexical filter. It does not interpret arbitrary semantics, euphemism, or unlisted paraphrase,
> and a convincing false claim can pass it. Human acceptance must read the report and judge factual
> accuracy. Never represent a gate pass as a truth claim.

> **Whole-video analysis does not receive the complete sliced-response quality gate.** The canonical
> duration and synthetic-origin fields and their lexical enforcement apply only to bounded sliced
> SDK analysis. Whole-video responses keep prompt-level discipline but no equivalent deterministic
> gate. Extending it requires a separate reviewed scope decision.

> **Cost language.** A provider request may fall inside a free tier or be billable depending on the
> user's own Gemini project and account. This repository cannot determine which, and must not
> describe a request as necessarily "paid" or promise that one is free.

**Final acceptance still requires human factual review.** No automated gate in this branch replaces
a person reading the report.

## Release sequence (supersedes the V4R acceptance checklist)

Strictly ordered. Each step requires its own explicit authorization from Blue; none of them is
authorized by this handoff.

1. **Full-class whole-diff review** of `4c07db9...<FINAL_REVIEWED_TIP>`, ending in a literal
   `VERDICT: PASS`.
2. **Separate Blue authorization** for one approximately 15-second, single-slice Pro
   **prompt-compliance probe** — testing only whether the model obeys the instruction not to restate
   the synthetic-origin conclusion outside its canonical field.
3. **If the probe is rejected or restates the forbidden conclusion: stop for Blue's ruling.** Preserve
   the diagnostic, inspect it, and fix the prompt through a reviewed code change.
4. **Only after a successful probe**, separate authorization for exactly **one** deliberately short
   final provider acceptance run.
5. **No automatic re-probe, repair, continuation, fallback, or additional run** at any point. K5's
   bounded 503 recovery — at most three byte-identical attempts on eligible transport failures — is
   the only retry that may occur, and it is unchanged.

---

# V4R — Repair: Windows multi-slice transport

## The failed human acceptance attempt

| | |
|---|---|
| Run ID | `run-20260726-220716-094-6964-162bf359` |
| Evidence (preserved unchanged) | `D:\Gemini_Video_Review\Downloads\run-20260726-220716-094-6964-162bf359` |
| Provider submissions | **0** |
| Paid attempts consumed | **0** |
| Manifest outcome | `error`, `usage: null`, `reportFile: null` |
| Requested scope recorded | schema v3, `60-90s` + `240-270s` (60s aggregate) — exactly what was asked |

Everything upstream of the transport worked: the renderer collected two slices, the main boundary
validated and serialized them, PowerShell re-validated them, the probe ran, and the duration guard
passed a 60-second aggregate. **No provider request was made, so no spend occurred and the guard
was never at risk.** The old manifest reason nevertheless read
`"...exited with code 1 (upstream API/network error; see the run output above)."`, which was false
and actively misdirected diagnosis.

## Root cause (reproduced locally, no network)

`feed-gemini.ps1` appended the canonical slice JSON to `$sdkArgs` **raw**. Windows PowerShell 5.1
has no `PSNativeCommandArgumentPassing`, so it does not escape a native argument's own interior
double quotes; node's `CommandLineToArgvW` parsing then treats each `"` as a quote toggle and strips
it. Verified directly against real `node.exe` under PS `5.1.26100.8875`:

```text
sent (raw canonical) : [{"startOffset":60,"endOffset":90},{"startOffset":240,"endOffset":270}]
node process.argv    : [{startOffset:60,endOffset:90},{startOffset:240,endOffset:270}]   <- not JSON
```

`resolveSliceRanges` then refused — correctly, and **before** any provider submission. The
fail-closed design worked exactly as intended; the transport was the defect.

**Why the reviewed suite missed it:** every V4 test asserted against a PowerShell `function
global:node` shadow. A PowerShell function receives the argument array **verbatim** and never
crosses `CommandLineToArgvW`, so a mock physically cannot observe quote stripping. Only a real
native process can. That gap is now closed by a mandatory real-`node.exe` test with a negative
control.

## The correction

**`scripts/feed-gemini.ps1`**

- The canonical JSON is built **after** all PowerShell validation succeeds, then
  `ConvertTo-NodeCliArg` (the repository's existing `CommandLineToArgvW`-correct helper, already
  used for `--prompt-text`) is applied **exactly once**, at the final `& node` boundary.
- Validation, the duration guard, and the manifest all continue to operate on the **canonical**
  value. The escaped form is a delivery-layer representation only: never validated, never logged,
  never persisted. The SDK receives the original canonical JSON byte for byte.
- The nonzero-exit manifest reason is now attribution-neutral:
  `"gemini-video-sdk.js exited with code <n>; see the run output above."` A nonzero exit also covers
  the SDK refusing **locally**, which the PowerShell parent cannot distinguish — so it no longer
  asserts an upstream failure it cannot prove. This matches the CLI path's existing wording.

**`scripts/lib/get-node-cli-arg.Tests.ps1`** — 12 new tests running the **actual `node.exe`
application** (asserted to be a real `.exe`, never a function/alias/mock/shim) against a repo-owned
fixture, comparing `process.argv` to the canonical JSON base64-byte-for-byte: two ordinary slices,
boundary offsets `0` and `86400`, the maximum eight slices, compact whitespace-free JSON, exactly
one argv element, no retained backslashes, a **double-escaping** detector, and a **negative control**
proving the unescaped value loses its quotes. `JSON.parse` acceptance is reported by the node
process itself — PowerShell 5.1's `ConvertFrom-Json` is lenient about unquoted keys and would have
called the mangled payload valid, hiding the defect.

**`scripts/test-fixtures/node-argv-echo.js`** (new) — inert echo fixture: no `require`, no network,
no filesystem, no credentials.

**`scripts/feed-gemini.Tests.ps1`**

- The shadow-node assertion now expects the **transport-escaped** representation, with new tests
  proving the escaping is applied **exactly once** (no `\\"`, no bare `"`, not double-escaped) and
  that it is derived from the **canonical validated** JSON, not any caller string. `--slice-ranges-json`
  and its value remain one discrete pair; scalar offsets remain absent.
- New `Describe` for a valid multi-slice run whose SDK exits nonzero: node reached, `outcome: error`,
  `usage`/`reportFile` null, reason bounded and payload-free, and an explicit assertion that the
  reason does **not** say "upstream" or "API/network".
- Every zero-node refusal test and its positive control are preserved unchanged.

### Two test defects repaired

1. **Portability (the defect flagged in the prior review).** `$e2eDir` — which holds the
   repository-created `yt-dlp.cmd` stub — was deleted *before* the V4 lifecycle blocks, so those
   tests silently depended on a **machine-installed** `yt-dlp` (green here, `yt-dlp not found on
   PATH` on a clean machine). Cleanup now runs once at the very end of the file. Additionally every
   V4 run strips any PATH entry that actually contains a `yt-dlp` launcher, so the stub is the only
   thing resolvable, and a tripwire `Describe` asserts the resolved path is the stub inside
   `$e2eDir`. The suite now behaves identically with or without a global `yt-dlp`.

2. **A latent harness landmine, found and disarmed.** The harness publishes stub state as global
   sentinels and cleans them up with `Remove-Item Variable:\<name>`. PowerShell variable names are
   **case-insensitive**, so the global `E2EMarker` and the file's script-scope `$e2eMarker` are the
   same name. The moment *any* `.ps1` is dot-sourced at file scope, that cleanup stops resolving to
   the global and destroys `$e2eMarker` instead — collapsing 27 previously passing tests with
   `Cannot bind argument to parameter 'LiteralPath' because it is null`. Confirmed with a minimal
   two-file repro differing only in the presence of a dot-source. The sentinel is renamed
   `E2EMarkerPath`, which collides with nothing. This was pre-existing and merely triggered by V4R's
   need to dot-source the production helpers.

## What V4R deliberately did NOT change

`app/main.js`, `app/preload.js`, renderer slice behavior, `buildRequestBody`, K5 retry, the fence/cwd
gate, PTY environment, credentials, V3a focus, V3b follow-up, report persistence, Library behavior,
the media ownership/cleanup/retention modules, prompts, existing URL logging, and the stale
`2026-07-21.14` acceptance badge (which needs its own build-identity work order). No dependency was
added, no request architecture changed, and no unrelated dead code was touched.

---

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

## Files changed — V4R correction (4: 3 modified, 1 added)

- `scripts/feed-gemini.ps1` — apply `ConvertTo-NodeCliArg` once at the `& node` boundary;
  attribution-neutral nonzero-exit manifest reason.
- `scripts/lib/get-node-cli-arg.Tests.ps1` — +12 real `node.exe` argv round-trip tests with a
  negative control.
- `scripts/feed-gemini.Tests.ps1` — escaped-value + escaped-exactly-once assertions; nonzero-SDK
  manifest-truth `Describe`; `yt-dlp` stub portability repair + tripwire; `E2EMarkerPath` rename.
- `scripts/test-fixtures/node-argv-echo.js` **(new)** — inert argv echo fixture.

Cumulative branch total in the reviewed range `4c07db9...5b5e30a`: **32 files** (27 modified,
5 added — the 5 added are this handoff doc, the two slice-ranges helper/test files, and the two
test fixtures).

`scripts/lib/get-node-cli-arg.ps1` — the escaping helper itself — is **byte-identical to the fork
point**. V4R only *calls* it; the transport logic it implements was already reviewed and in
production use for `--prompt-text`.

## Files changed — original V4 (29 total: 26 modified, 3 added)

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

## Exact test results — V4R (corrected tree, re-measured)

| Suite | V4 | V4R | Note |
|---|---|---|---|
| app aggregate | 1297 / 0 | **1297 passed / 0 failed** | unchanged: V4R touches PowerShell + a test fixture only |
| Pester aggregate | 802 / 0 / 0 | **827 passed / 0 failed / 0 skipped** | +25 V4R tests |
| `get-node-cli-arg.Tests.ps1` | 9 / 0 | **21 / 0** | +12 real `node.exe` round-trip tests |
| `feed-gemini.Tests.ps1` | 47 / 0 | **60 / 0** | +13 V4R (escaping, manifest truth, `yt-dlp` tripwire) |

Both gates were run with a clean working tree at `5b5e30a` (`git status --porcelain` empty), so the
measured tree is the committed tree. Also green: `git diff --check` on `4c07db9...5b5e30a` (exit 0),
`node --check` on the added JS fixture, and `PSParser::Tokenize` on all three changed `.ps1` files
(0 parse errors). All V4R-added content is ASCII-only with CRLF endings; the only non-ASCII bytes in
the changed files are pre-existing em-dashes, unchanged in count from the fork point.

### Zero-provider attestation

No test in this branch performs a provider request. V4R tests spawn only short-lived local
`node.exe` processes against inert repository-owned fixtures. They make no network/provider request,
access no credentials or media, and never execute the `yt-dlp` stub (the probe subprocess is
shadowed at the `Start-Job`/`Receive-Job` layer, so the stub is only ever *resolved*, never run).
The fixture itself has no `require`, no network, no filesystem access, and no environment access.
Existing SDK tests remain loopback-only (`127.0.0.1`) or use an injected `fetchImpl`.

## Exact test results — original V4 (historical)

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

## Manual acceptance checklist — SUPERSEDED (historical evidence only)

> **STALE. Do not follow this checklist.** It was written for the V4R verdict and predates V4Q. It
> is preserved verbatim because it records what was checked at that time, and because step 10 is the
> reason the schema-version drift is worth calling out. Two things in it are now factually wrong:
> the manifest is **schema v4**, not v3, for every new live SDK run; and a transported response is
> no longer automatically a report — it must pass the deterministic quality gate first.
>
> It also predates the V4Q ordering: a probe now precedes any acceptance run. **Use the
> [Release sequence](#release-sequence-supersedes-the-v4r-acceptance-checklist) near the top of this
> document instead.**

Only after the **new (V4R)** Opus Full-class review returns a literal `VERDICT: PASS`. The failed
`run-20260726-220716-094-6964-162bf359` attempt does **not** count against this budget: it made zero
provider submissions and consumed zero paid attempts.

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

## Review diff — SUPERSEDED identities (historical evidence only)

> **Neither artifact below is the authoritative one any more.** The current pinned artifact covers
> `4c07db9...<FINAL_REVIEWED_TIP>` and its exact identity is recorded in the handoff tail commit.
> Do **not** regenerate or merge against the ranges or hashes in this section.

**V4R (superseded).** Range `4c07db9a387191485b51cb99886d58d94573c1ad...5b5e30a102e92a02151ee4b4876a379e6fa7069b`
— 262,691 bytes, 32 files (27 modified, 5 added),
SHA-256 `B64D084DD2ECA9F900A67FC4806E1A86E75D145C9C1A070DD84361C221340038`.

**Original V4 (superseded).** Range `4c07db9...f17b51f` — 204,586 bytes, 29 files,
SHA-256 `A78C2832B3F52B6843284D93DE46E531E386853C740AB12A59DA0723D6D73DAE`.

Both were created with `git diff --output` (never PowerShell redirection) and verified to regenerate
byte-for-byte at the time. They remain accurate records of what each review actually read.

## Recommended Opus Full-class review focus — V4R (review these FIRST)

The original V4 review is superseded for release purposes. Start here:

1. Reproduce the raw PS 5.1 -> `node.exe` quotation loss locally (no network), then confirm the
   corrected path applies `ConvertTo-NodeCliArg` **exactly once**, at the native boundary only.
2. Confirm validation, the duration guard, and the manifest all operate on the **canonical** value,
   and that the escaped form is never validated, logged, or persisted.
3. Run the real `node.exe` argv round-trip and inspect BOTH its positive and negative controls.
4. Confirm the manifest reason is attribution-neutral and that a local SDK refusal is never blamed
   on the provider.
5. Confirm the V4 Pester tests cannot resolve a machine-installed `yt-dlp`.
6. Confirm no paid or live-provider traffic exists in any test.

## Recommended Opus Full-class review focus — original V4 surface (re-verify)

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

## Reviewer verdicts

### Superseded — V4R (historical evidence only)

Reviewer verdict:

```text
VERDICT: PASS
```

Reviewer verdict source: Opus 5 Full-class, whole-diff, read-only review of
`4c07db9a387191485b51cb99886d58d94573c1ad...5b5e30a102e92a02151ee4b4876a379e6fa7069b` (the corrected
tree).

Gates independently measured by that review: app **1297 / 0**; Pester **827 / 0 / 0**.

> **This verdict authorizes no present action.** It superseded the original V4 verdict *at the
> time*, and it remains an accurate record of what that review read and established. It has since
> been superseded twice over: by the failed human acceptance that followed it, and by V4Q. It does
> **not** authorize a merge, a push, a provider probe, or an acceptance run, and it is **invalid for
> the merge-gate plan**. The gate totals above are historical measurements of the `5b5e30a` tree,
> not of the current branch.

What that review independently established, beyond the gates: the raw PS 5.1 -> real `node.exe`
quotation loss was reproduced and then shown fixed end-to-end through the *actual* SDK validator
(`resolveSliceRanges` refuses the unescaped payload, accepts the escaped one byte-for-byte as a
single argv element with no retained backslashes); `ConvertTo-NodeCliArg` is applied exactly once,
strictly after all validation/guarding/manifest creation; double escaping fails closed; the fixed
1,800 s aggregate cap still refuses 1,801 s *after* transport; the V4 suite passes 60/0 with
`yt-dlp` removed from PATH entirely while the pre-V4R suite fails 6 tests under the identical
condition; no global sentinel aliases any script-scope variable; and the 27 files not touched by
V4R are byte-identical to the previously reviewed V4 tip (zero drift).

### Superseded — original V4 (historical evidence only)

Reviewer verdict:

```text
VERDICT: PASS
```

Reviewer verdict source: Opus 5 Full-class, whole-diff, read-only review of
`4c07db9a387191485b51cb99886d58d94573c1ad...f17b51fdbe2dbd2b6110257f2df459dd7edc04f0`.

Retained as the honest record of what was reviewed and when. **It is NOT sufficient to release this
branch** and authorizes no present action: human acceptance afterwards exposed a real production
transport defect that the reviewed test suite structurally could not detect, because every V4 slice
test asserted against a PowerShell `node` function shadow, which never crosses `CommandLineToArgvW`.

> **Both verdicts above are historical and invalid for the merge-gate plan.** Their literal
> `VERDICT: PASS` lines, ranges, gate numbers, and pinned-diff hashes are preserved verbatim as
> evidence of what each review actually read. Neither may be cited as authorization for the current
> branch. **No verdict exists for the current review range.**

## Review-diff rule

**The only current review range is `4c07db9a387191485b51cb99886d58d94573c1ad...<FINAL_REVIEWED_TIP>`,
where `<FINAL_REVIEWED_TIP>` is the SHA recorded in the merge-gate handoff tail near the top of this
document.** That tail also records the authoritative pinned-diff bytes, SHA-256, and file counts.

- Before merge: `git diff 4c07db9a387191485b51cb99886d58d94573c1ad...<FINAL_REVIEWED_TIP>`
  (equivalently `git diff main...<FINAL_REVIEWED_TIP>` while the tip is not yet an ancestor of `main`).
- After merge: reproduce with the same immutable three-dot range — `git diff main...<tip>` goes empty
  once the tip is an ancestor of `main`.
- Always use `--output`; never PowerShell `>`.
- Retain the literal `VERDICT: PASS|FAIL` line and identify the review that produced it.
- **The `5b5e30a` and `f17b51f` ranges are historical only and must never be used for a merge-gate
  plan.** Do not regenerate against them and do not cite their hashes as current.

Pinned `.agent-review-*.diff` files are local review artifacts and remain gitignored.
