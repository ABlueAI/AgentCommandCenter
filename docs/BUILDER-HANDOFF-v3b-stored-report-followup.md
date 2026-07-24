# Builder Handoff — V3b Stored-Report Follow-up Q&A

Branch: `feature/v3b-stored-report-followup`
Fork-point SHA: `147fb74bb8431a0881bce22101252ab5b470bee8` (`main` == `origin/main` at build start)
Pre-merge main SHA: `147fb74bb8431a0881bce22101252ab5b470bee8` (re-verify at gate time)
Tip SHA: this commit — a file cannot contain its own SHA; recorded verbatim in the merge-gate report
Merge commit SHA: Pending until merge

## Intended invariant (single)

One explicit user submission may ask one question using an already-persisted, main-validated
report as text context, without re-ingesting video, modifying the stored run, or triggering an
automatic/background provider request.

## Files changed

New:
- `scripts/gemini-followup.js` — text-only follow-up child (stdin JSON in, one JSON out, fixed
  `gemini-2.5-flash-lite`, `maxOutputTokens: 4096` on this body only, K5 shutdown contract).
- `scripts/gemini-followup.test.js` — 96 assertions (body/text-only, payload validation, shared
  K5 transport behavior, golden video equivalence, 127.0.0.1 child fixtures).
- `scripts/gemini-followup-node.Tests.ps1` — Pester anti-orphan wrapper (K5 pattern).
- `scripts/test-fixtures/gemini-followup-child.js` — test-only child harness (real entry adapter,
  fixture-server fetch injection).
- `app/followup-ipc.js` — main trust/cost boundary (sender gate, discriminated library/pane
  identity, PS-backed re-read, 200k context cap, global single-flight, code allowlist, bounded logs).
- `app/followup-ipc.test.js` — 63 assertions, incl. integration against the REAL library-ipc
  handle table (superseded-List handle ⇒ refusal, zero provider calls).
- `app/followup-child.js` — child runner (spawn `process.execPath`, `shell:false`, hidden,
  child-only `ELECTRON_RUN_AS_NODE=1`, env allowlist, stdin-only content transport,
  2 MiB / 64 KiB / 180 s bounds, settle-once).
- `app/followup-child.test.js` — 32 assertions, incl. one REAL `process.execPath` child round
  trip that refuses invalid input with zero network use.
- `app/renderer/report-followup.js` — follow-up UI controller (epoch suppression, explicit-only
  submission, inert rendering) + `openPaneReportOrdered` (the Open Report ordering algorithm).
- `app/renderer/report-followup.test.js` — 40 assertions (real agent-dom `el` + throwing-innerHTML
  DOM stub).

Modified:
- `scripts/gemini-video-sdk.js` — K5 submitted-attempt loop extracted into the ONE shared
  `submitGeminiRequest` (exported); the video path now calls it with identical presentation.
  Everything else byte-identical (evidence below).
- `app/library-ipc.js` — adds main-internal `resolveHandle` (reads the same wholesale-replaced
  table; handle lifetime unchanged; never IPC-exposed).
- `app/main.js` — two hunks only: the two requires (top) and the follow-up wiring inside
  `app.whenReady` after the library boundary. Entirely outside the fence gate.
- `app/preload.js` — adds invoke-only `libraryFollowup(req)`.
- `app/package.json` — wires the three new app suites into the `test` script.
- `app/renderer/app.js` — follow-up controller creation/mounting; epoch-guarded
  `selectLibraryEntry` / `refreshLibrary`; `openReportForPane` now delegates to the unit-tested
  `openPaneReportOrdered` (awaited initial scan; late refresh cannot clear the pane report).
- `app/renderer/index.html` — `#libFollowupHost` in the reader + the `report-followup.js` script tag.
- `app/renderer/styles.css` — `.lib-followup*` styles.

## Security-sensitive surfaces touched

Paid provider request (new child, shared K5 transport) · Gemini credential injection (allowlist
child env only) · renderer→main IPC (new `library-followup` channel behind the shared trusted-
sender gate) · opaque Library identities (read-only consultation via `resolveHandle`; lifetime
rule unchanged) · the existing K5 retry implementation (loop extracted; policy untouched).

Not touched: the fence gate, PTY credential handling, `manifest.json`/reports/run dirs/media/
retention (this path performs no writes anywhere), push/merge machinery.

## Commands run and exact gate results (from this worktree)

1. Syntax: `node --check` on all 14 changed/new JS files — all pass; PSParser tokenize on
   `gemini-followup-node.Tests.ps1` — pass.
2. `cd app; npm test` → **1132 passed, 0 failed** (exit 0). Base main was 997; V3b adds
   63 (followup-ipc) + 32 (followup-child) + 40 (report-followup) = 135.
3. `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\run-pester.ps1` →
   **659 passed, 0 failed, 0 skipped** (exit 0). Base main was 655; V3b adds 4 (the wrapper,
   which itself executes the 96-assertion Node suite).
4. `git diff --check` → clean (exit 0).
5. Source-invariant byte comparisons → **ALL SEGMENTS BYTE-IDENTICAL** (sha256 pairs below).
6. Zero failed tests everywhere.

## Credential and cost boundary

- The decrypted `GEMINI_API_KEY` continues to come from Electron safeStorage into main memory
  (`geminiKey`). It is injected ONLY into the follow-up child's environment (built from scratch:
  `ELECTRON_RUN_AS_NODE=1`, the key, and `SystemRoot`/`WINDIR` when present — never a
  `process.env` spread, never TEMP/TMP). It never enters renderer state, argv, stdout, stderr,
  or Logs, and is never persisted with `setx`. Tests pin the exact env key set and that parent
  secrets (including setx residue) are structurally absent.
- One logical provider request per explicit Ask click. Main enforces ONE global follow-up in
  flight across both identity types; a concurrent submission refuses `follow-up-in-progress` and
  is never queued; the in-flight flag clears in `finally` on every path (tested incl. a throwing
  runner). No request occurs on: invalid question, invalid/stale identity, pane without a run,
  unavailable report, report over 200k units, missing key, or another request running (each has a
  zero-provider-calls test).
- K5 preserved: within that one logical request, the SHARED transport may submit up to three
  attempts for retryable 503/UNAVAILABLE, with two bounded sleeps, byte-identical bodies
  (serialized once), ambiguous-network never retried, terminal statuses never retried. No second
  retry loop exists in main, IPC, renderer, or the child (source-scanned by test).
- Output bounds: `maxOutputTokens: 4096` (follow-up body only — a test asserts the video body has
  none), child stdout 2 MiB, stderr 64 KiB, hard timeout 180 s, stdin cap 8 MiB in the child.

## Identity design and stale-handle proof

- Library source: the CURRENT opaque handle only. `library-ipc.js` gained `resolveHandle` reading
  the SAME `handleMap` that every List refresh replaces wholesale — no new namespace, no retained
  stale handles, no minting for Open Report. The pre-existing stale-handle test in
  `library-ipc.test.js` is untouched; `followup-ipc.test.js` adds the integration proof: a handle
  from a superseded List refuses `unknown-handle` with ZERO provider calls.
- Pane source: the existing pane ID → V5b1 registry route, resolved at submission time in main.
  A closed/unknown pane refuses before provider invocation. The renderer never sends (and the
  discriminated shape structurally rejects) run IDs, paths, report text, URLs, models, or keys.
- The report is re-read through the PowerShell Library Read authority at submission time; the
  200k provider-context bound applies to the returned `text.length` (UTF-16 units) and fails
  closed with a visible refusal (never truncation). Grounding note (2026-07-23, read-only): the
  three real reports max at 4,729 chars — supporting headroom, not a guarantee.

## Shared retry extraction and behavioral-equivalence evidence

- `submitGeminiRequest` is the ONE submitted-attempt implementation (cap, classification via the
  untouched `classifyHttpFailure`, backoff via the untouched `retryDelayMs`, ambiguous-network
  refusal, terminal handling). The video path calls it with an `onRetryScheduled` logger; all
  presentation (log lines, exit codes) stayed in the caller.
- Byte-for-byte (sha256, base vs worktree, EOL-normalized): fence-gate block
  `e71ff7c0…`, `FENCED_ROLES` region `e73951cf…`, `realOrNearest` `22f9175b…`, `ptyEnv`
  construction `d6221c84…`, ENTIRE `pty-start` handler `477d3e86…`; SDK `parseArgs` `685dc583…`,
  `resolveSliceOffsets` `85634fa7…`, `buildRequestBody` `cad5ab9a…`, `formatUsageLine`
  `01f77755…`, `sanitizeUpstreamText` `8ad9401b…`, `classifyHttpFailure` `c21827ed…`,
  `retryDelayMs` `22f75e04…`, `runCliEntry` `81693877…`, K5 constants block `2536ae65…`, slice
  guards (validation prologue → `bodyJson` serialization) `e10071f7…`. Every pair MATCH.
- Behavioral equivalence: the entire pre-existing 105-assertion K5/Video Scout suite runs green
  UNMODIFIED against the extracted transport (including deterministic 1200/2200 ms delays,
  byte-identical retry bodies, exact log-line regexes, and the real child-process fixtures).
  `gemini-followup.test.js` additionally pins a golden video request-body JSON string (sliced and
  whole-video) and the observable attempt trace (request → 1200 ms → request → 2200 ms → request,
  two retry lines in the pre-extraction format, usage exactly once).
- `git diff 147fb74 -- app/main.js` contains exactly two hunks (`@@ -43,6 +43,16 @@` requires,
  `@@ -290,6 +300,33 @@` whenReady wiring); neither intersects the fence gate.

## No media/video path; stored files unchanged

The follow-up body builder emits text parts + `generationConfig.maxOutputTokens` only; tests
assert the absence of `fileData`/`fileUri`/`videoMetadata`/`mediaResolution`/`tools`/
`functionDeclarations`/`toolConfig`. Nothing in the new code writes to any run directory,
manifest, report, media artifact, or retention state — the only filesystem access on the whole
path is the existing read-only PowerShell Library Read. Manual acceptance re-verifies with hashes.

## Argv note (deliberate, spec-visible deviation)

The work order permits "non-sensitive mode/model information" on argv. There is exactly one mode
and one fixed model, so the child takes NO argv beyond the script path — strictly tighter than
allowed; tests pin argv emptiness. Flagging it here so the Reviewer sees it was a choice.

## Known limitations

- The answer is ephemeral renderer memory: changing reports or restarting discards it (by design).
- One follow-up globally, no queue: a second pane/report must wait for the active one (by design).
- Renderer-held pane sources survive until the pane closes; if the pane closed mid-flight the
  submission refuses `no-run-for-pane` (visible, no cost).
- The child re-validates report/question bounds; a future bound change must be made in BOTH
  `followup-ipc.js` and `gemini-followup.js` (constants are named identically to make drift
  visible; tests pin both).
- `FOLLOWUP_MODEL` is pinned independently of the SDK's `DEFAULT_MODEL`; a test states they are
  equal today so a future divergence is a visible, deliberate decision.

## Manual acceptance checklist (reserved for Blue — one paid logical request)

1. Fully restart Electron (renderer + main changed).
2. Library tab → Refresh → open a completed stored report.
3. Confirm selecting/opening made NO provider request (Logs show only library metadata lines).
4. Record `manifest.json` + `analysis-output.txt` hashes and timestamps for that run
   (`Get-FileHash`, `Get-Item …\LastWriteTime`).
5. Type one short, harmless, distinctive follow-up (e.g. "In one sentence, what is Section 1's
   TL;DR?") and click Ask — this is the ONE reserved paid logical request. (A retryable 503 may
   produce up to three transport attempts under K5 — expected, still one logical request.)
6. Confirm the answer is plain text and clearly derives from the stored report.
7. Confirm no video download/re-ingestion occurred (no yt-dlp window, no new files under
   `D:\Gemini_Video_Review\downloads`).
8. Confirm Logs contain ONLY the bounded `[followup] completed model=… questionChars=…
   reportChars=… attempts=… prompt=… output=… total=…` line — no question/report/answer text.
9. Re-hash the files from step 4 — identical, timestamps unchanged.
10. Confirm no new run directory or media artifact appeared.
11. Double-click Ask rapidly / try a second submission while one runs — locally disabled, and a
    bypassed second request refuses `follow-up-in-progress`.
12. Click Refresh, then Ask again on the OLD selection if reachable — the stale handle refuses
    visibly (`unknown-handle` message); re-selecting works.
13. Launch a Video Scout run, let it complete, click its 📄 Open Report — the reader shows the
    report and the follow-up section works from the pane source (uses the run from the pane
    registry; costs a second paid request ONLY if you choose to test it — optional).

## Review request

Requesting an Opus **Full-class, whole-diff, read-only** review focused on: paid-request
multiplicity · K5 behavior preservation · credential isolation · IPC trust + both identity routes
· superseded-list-handle invalidation · process/shell injection · sensitive-content leakage ·
bounds/timeout behavior · no media re-ingestion · stored-run immutability · fence-gate
preservation. The verdict will be read and reported verbatim.

Review diff (pinned with `git diff --output`, never PowerShell redirection):
`git diff 147fb74bb8431a0881bce22101252ab5b470bee8...<tip> --output=.agent-review-v3b-stored-report-followup.diff`

Reviewer verdict: `VERDICT: PASS`
Reviewer verdict source: Opus Full-class, whole-diff, read-only review (2026-07-24).

## Review-diff rule

- Before merge: `git diff main...<tip>`.
- After merge: `git diff 147fb74bb8431a0881bce22101252ab5b470bee8...<tip>` (three-dot from the
  recorded pre-merge main; plain `main...<tip>` goes empty once the tip is an ancestor).
- Pinned `.agent-review-*.diff` files are local review artifacts and remain gitignored.

## Opus review record (2026-07-24)

- **Review class:** Full-class, whole-diff, read-only.
- **Reviewed range:** `147fb74bb8431a0881bce22101252ab5b470bee8...90fc3387a4e1bb8acbdfc3de1d44538f782b46c9`.
- **Pinned diff** `.agent-review-v3b-stored-report-followup.diff` was independently reproduced
  byte-for-byte (SHA-256 `8e2730c59a6bdddd6d6cf381630c30e7722a5f3340c34aa4255cf955f791f95b`,
  154,203 bytes, 19 files).
- **Non-paid gates independently rerun by the Reviewer:** app suite exit 0 (incl. followup-ipc
  63/0, followup-child 32/0, report-followup 40/0); legacy K5/Video Scout suite 105/0 against the
  refactored shared transport; new follow-up suite 96/0; loopback-only fixtures.
- **Verbatim verdict:**

`VERDICT: PASS`

- No CRITICAL, HIGH, or MEDIUM findings. Three non-blocking informational observations, none a
  code defect requiring a delta:
  1. The minimal Windows child environment supports the current fetch path — empirically confirmed
     by the successful real acceptance request below.
  2. No per-fetch timeout exists inside the shared transport; the child-level 180-second wall clock
     remains the fail-closed bound and matches the existing Video Scout posture.
  3. Successful metadata currently surfaces through the `main-error` channel, producing two safe
     metadata lines — a cosmetic semantic mismatch only.

## Human acceptance (Blue, 2026-07-24) — PASS

Observed run: `run-20260721-155847-246-51452-31da8fe7`.

- Opening/selecting the completed report caused **no** provider request.
- One explicit follow-up submitted: `In one sentence, what is Section 1's TL;DR?`
- A relevant, inert plain-text answer was returned.
- Provider metadata: model `gemini-2.5-flash-lite`; questionChars 43; reportChars 2769;
  attempts 1; prompt 1098; output 52; total 1150.
- Logs contained only safe metadata (no question/report/answer/key/path/transcript/media):
  - `[main error] [followup] completed model=gemini-2.5-flash-lite questionChars=43 reportChars=2769 attempts=1 prompt=1098 output=52 total=1150`
  - `[followup] answered: questionChars=43 attempts=1 prompt=1098 output=52 total=1150`
- Stored-run immutability verified (before == after):
  - Manifest SHA-256 `252CCB5F7797A4275B8F423E0F92F41E988037EED78DB6801AB8129802599C86` — unchanged, timestamp unchanged.
  - Report SHA-256 `65AF8F6E9843B638434C52F0ECF14ED6F3ED321F4E0B0F71D9FA0028DA0DC486` — unchanged, timestamp unchanged.
  - Run-directory count remained 27; new files 0; no video download/yt-dlp/media/new run.
- Rapid duplicate submission was locally blocked; Refresh cleared the prior selection/follow-up state.

Honest omission: the optional live-pane **Open Report** follow-up was **not** manually exercised
(it would require a second paid request). That route remains covered by the automated identity,
ordering, and renderer tests, and the omission does not weaken acceptance of the primary V3b
invariant.
