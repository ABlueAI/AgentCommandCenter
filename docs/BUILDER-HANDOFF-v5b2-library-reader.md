# Builder Handoff — V5b2 Analysis Library and In-App Report Reader

Branch: `feature/v5b2-library-reader`
Fork-point / pre-merge base SHA: `92cacb3` (the reviewed V5b1 content-corrected tip — this branch
STACKS on V5b1, it does NOT branch from main). Baseline gates on that tip: app 899/0, Pester 347/0/0.
Tip SHA: implementation checkpoint `2fb9518`; marker/docs commit sits on top.
Merge commit SHA: `20f200074a8a0e5b3ea3a18496f2a8c458c3eb06` (MERGED 2026-07-22, `--no-ff`; recorded
pre-merge `main` `0d708c1258c69438b214bb677710915e634c0956` = the V5b1 merge commit; reviewed tip
`2abd716`; human live-accepted 2026-07-22). Merge order: V5b1 first, then V5b2.

### V5 stack content-acceptance correction — restacked onto corrected V5b1 (2026-07-21)

To inherit the V5b1 `update_topic` policy correction (Gemini CLI tool-deny), this branch was RESTACKED
(`git rebase --onto`) onto the corrected V5b1, not re-implemented.
- Base moved: old V5b1 tip `92cacb3` → corrected V5b1 tip `2e8ec32` (fix `c28123f` + V5b1 docs).
- This branch's tip moved: pre-correction reviewed tip `f2cbb1c` → new restacked tip `731b7d3`.
- Scoped delta confirmation: the inherited change (`git diff f2cbb1c 731b7d3`) is EXACTLY the V5b1
  correction; and this branch's OWN reviewed three-dot delta is byte-for-byte IDENTICAL before and
  after the restack (`git diff 92cacb3...f2cbb1c` == `git diff 2e8ec32...731b7d3`), so the V5b2
  invariant is untouched.
- Refreshed pinned diff: `.agent-review-v5b2-library-reader.diff` now `2e8ec32...731b7d3`.
- Gates after restack: app **PASS (0 failed)**, Pester **397/0/0** (375 + 22 inherited from the V5b1
  correction). No V5b2 code changed; the delta is inherited only.

Tier: **FULL-CLASS** — this creates a renderer→filesystem READ boundary. It receives a whole-diff
security review and a delta pass after any failed verdict.

## One invariant

The renderer can LIST and READ only bounded, schema-valid Video Scout records and reports selected
through MAIN-OWNED identities. It never supplies or receives filesystem paths, and untrusted
manifest/report content is rendered only as inert plain text.

## Stacking

V5b2 stacks on the reviewed V5b1 tip `92cacb3`. If V5b1 changes after its live retest, carry the
correction into V5b2, rerun both gates, refresh the pinned diff, and obtain the V5b2 delta review.
Review + pin the V5b2-only delta as `92cacb3...<V5b2 tip>`.

## What shipped

- **`app/trusted-ipc-sender.js` (new, pure)** — the SINGLE shared fail-closed sender gate
  (`createTrustedSenderGate`). Trust order, unchanged from the V1a clipboard gate it was lifted from:
  (1) trusted window exists + not destroyed → `no-trusted-window`; (2) event sender IS that window's
  own webContents → `untrusted-sender`; (3) sender frame IS the main frame → `not-main-frame`;
  (4) frame URL equals the exact canonical `ENTRY_URL` → `untrusted-document`. Torn-down
  frames/webContents refuse (guarded getters), never throw. Subframes, wrong documents, wrong
  webContents, and destroyed windows fail closed. **`clipboard-ipc.js` now uses this gate** (no second
  copy); all 21 clipboard tests stay green (byte-for-byte behavior + reason constants preserved).
- **`scripts/video-scout-library.ps1` (new)** — the ONE library entry point, two actions
  (`List`, `Read`), invoked shell-free via `execFile` with a discrete `-RunRoot` (main-owned) and, for
  Read, a main-issued `-RunId`. Guarantees **JSON-only stdout** (exactly one document, always — even
  on internal error, a bounded `{ok:false,reason:'internal-error'}`). Loads
  `video-scout-manifest-schema.ps1` — **the sole manifest validator; there is NO manifest validation
  in JavaScript.** Never emits report text or manifest-derived strings to stderr/Logs.
- **`scripts/lib/video-scout-library-core.ps1` (new)** — the bounded, fail-closed List/Read logic:
  - **List**: lazily enumerates DIRECT child run directories under the fixed root
    (`[IO.Directory]::EnumerateDirectories`, never a materialized array), capped at **5,000**
    (`capExceeded` surfaced visibly). Per candidate: run-id shape (accepts BOTH historical dir-name
    generations — pre-P10 without the hex suffix, post-P10 with it — so legacy backfills stay
    visible), reparse-point refusal, direct-child `manifest.json` within the **256 KiB** cap, JSON
    parse, `Assert-VideoScoutManifestValid`, `manifest.runId == directory leaf`. Invalid candidates
    are EXCLUDED from entries but COUNTED with **bounded reason constants** and a safe run label —
    never silently omitted, never echoing hostile content. Projects only bounded UI fields: date +
    date-kind, honest title, mode, route, outcome (incl. null), total tokens or null, offsets, report
    status, bounded display run label. **No paths, no raw manifest, no raw reason/provider body.**
  - **Read**: re-validates EVERYTHING independently of List (TOCTOU — files may change in between):
    run-id shape, direct-child containment (via `[IO.Path]` full-path parent check — the real
    boundary), reparse refusal, manifest size+schema+`runId==leaf`, `outcome == 'completed'`,
    non-null `reportFile` passing the shared validator, report is a direct-child ordinary `.txt`
    inside the run dir, not a reparse point, exists, **≤ 4 MiB**, **strict UTF-8** decode
    (`UTF8Encoding($false, $true)` — a non-UTF-8 report is refused, not mojibaked), decoded length
    **≤ 1,000,000 UTF-16 units**. Returns structured success/refusal + bounded metadata; plain report
    text ONLY on `available`. Never logs report content.
- **`app/library-ipc.js` (new, pure)** — main-side boundary (`createLibraryIpc`): owns the shared
  gate, the **opaque handle table** (`lib_<hex>`, encoding nothing — no path/run-id/filename), the
  path-free renderer projection, and the pane→report resolution. On every successful List refresh the
  handle table is **replaced wholesale**, so any handle from a stale list can never resolve
  (`unknown-handle`). Read is requested only by handle (library) or by pane ID (Open Report). Open
  Report resolves the pane's run through **V5b1's internal pane→runId registry** (injected) — the
  renderer sends only the pane ID; a run ID or path from the pane is never accepted, terminal output
  is never parsed. Subprocess failure fails closed (`library-subprocess-failed`).
- **`app/main.js`** — `VIDEO_SCOUT_RUN_ROOT = D:\Gemini_Video_Review\downloads` (the ONE main-owned
  root; equals feed-gemini's own default OutDir, now passed explicitly as `-OutDir` on the
  video-scout `pty-start` so launch and read can never diverge). `runLibraryAction` = the shell-free
  `execFile` wrapper (fixed 30 s timeout, 32 MiB bounded buffer, `windowsHide`, buffer-decoded UTF-8,
  JSON-parsed). Three `ipcMain.handle`s (`library-list`/`library-read`/`library-open-report`) wired to
  the pure module, with the same trust anchors + visible bounded refusals as K8/clipboard.
- **`app/preload.js`** — three invoke-only bridges (`libraryList`/`libraryRead(handle)`/
  `libraryOpenReport(paneId)`). No path crosses the bridge in either direction.
- **`app/renderer/library-view.js` (new, IIFE-wrapped, pure)** — filtering (title/mode/route/outcome/
  date-kind), sorting (date newest/oldest, tokens high/low, title — **unknown-date entries always
  grouped last** for date sorts, null-token entries last for token sorts), date formatting
  (exact/approximate/unknown), the **exact** report-status messages (incl. `No report was persisted
  for this run.` and `Report is not available yet.`), and inert DOM builders that place every
  manifest-derived value with the shared safe `el` (textContent-only; refuses URL/handler attrs) —
  never `innerHTML`, HTML parsing, Markdown, or a URL-bearing attribute.
- **`app/renderer/index.html` / `app.js` / `styles.css` / `agent-dom.js`** — a `Library` tab (list on
  the left, metadata + report reader on the right), Refresh + title search + mode/route/outcome/
  date-kind filters + sort, an in-app report reader (`<pre>.textContent`, scrollable/wrapping), **Copy
  Report** (reuses V1a's clipboard consumer + copy bound — 1,000,000 units, success only after the
  clipboard IPC resolves, metadata-only Logs) and **Maximize** (reuses the V1a pane-maximize
  controller; Escape restores; leaving the Library tab cannot strand maximize state). **Open Report**
  is added ONLY to Video Scout panes (via `agent-dom.js buildTermPane`), sends only the pane ID, and
  opens the report in the in-app reader — **never an OS file open** (no `shell.openPath`).

## Historical metadata-only rule

A historical/backfilled run with a null `reportFile` is `not-persisted` and its reader message is
EXACTLY `No report was persisted for this run.` — never implying failure, never attempting
reconstruction. The Library does NOT parse terminal output, logs, paths, or PTY history to synthesize
a report (that would recreate the P9 parser). Report reconstruction is out of scope.

## Date contract (exact / approximate / unknown)

- **Live** manifests use canonical UTC `startedAt` → marked **exact**.
- **Backfills** keep `startedAt` null and use the strictly-parsed, explicitly-approximate
  `backfill.startedAtFromDirNameLocal` (LOCAL `yyyy-MM-ddTHH:mm:ss.fff`, no `Z`) → marked
  **Approximate**. It is never converted into a fabricated UTC.
- Missing/invalid provenance → an explicit **Unknown date** bucket; never null-sorted into
  invisibility. Default sort: exact + approximate newest first, unknown grouped last.

## Non-goals honored (not delivered)

No OS file opening / `shell.openPath`, no HTML or Markdown rendering, no full-text cross-report
search, no retention/deletion, no follow-up questions or paid requests, no terminal-output parsing,
no report reconstruction, and no V5c/V5d.

## Tests (real exported production boundaries; wired into the meta-tests)

- `app/trusted-ipc-sender.test.js` (10) — accept trusted main frame; deny wrong webContents /
  subframe / wrong ENTRY_URL / destroyed / null window / missing event; torn-down frame + torn-down
  webContents refuse without throwing; constructor validation.
- `app/library-ipc.test.js` (23) — sender gate on every handler; path-free List projection with
  opaque handles (no raw `runId` field, no path anywhere in the payload); handle→run mapping;
  unknown/non-string/STALE handle refusal (staleness after a List refresh); Read passthrough
  (available/not-persisted/incomplete/PS-refusal, no text unless available); Open Report resolves via
  the injected V5b1 registry (uses the registry's run ID, not the pane's); no-run/empty-pane refusal;
  subprocess failure fails closed.
- `app/renderer/library-view.test.js` (25) — filters; sort ordering incl. unknown-date-last; date
  formatting; the exact status messages; and **DOM inertness** against the REAL `agent-dom` `el` +
  a parsing DOM stub (a hostile `<img onerror>/<script>` title/run-label/reason renders as inert
  text, injects NO element, sets no handler/URL attribute; a meta-test proves the stub would flag
  `innerHTML`).
- `scripts/lib/video-scout-library-core.Tests.ps1` (28) — indexer (direct valid live + backfill,
  missing/oversized/malformed/schema-invalid manifest, runId/leaf mismatch, run-id-shape, reparse
  directory via junction, enumeration cap with a lowered bound, invalid count visible, no hostile
  content in diagnostics); dates (exact UTC, approximate local, invalid/missing → unknown, unknown
  stays visible); report read (valid completed → text; null → not-persisted; incomplete/refused/error;
  missing file; oversized bytes; invalid UTF-8; decoded-char limit with a lowered bound; File replaced
  between List and Read → missing/refused; traversal/rooted run-id → unsafe; run root missing).
- Reachability: the three JS suites are wired into `app/package.json`'s test script; the Pester suite
  is auto-discovered by `run-pester.ps1` and covered by the reachability meta-test.

## Commands run and exact results (this tree)

- Baseline (V5b1 tip `92cacb3`): app 899/0, Pester 347/0/0 — as the work order expected.
- After implementation: app **0 failed** (new: trusted-ipc-sender 10, library-ipc 23, library-view 25;
  pane-maximize 37, video-scout-run-id 24 after the `-OutDir` wiring update); Pester **375/0/0**
  (347 + 28 new).
- Real-renderer boot: the app launches to the marker title with zero uncaught/CSP/Reference/Type/
  Syntax errors and the new `library-view.js` loaded.
- **Read-only List dry-run against the real root** (`D:\Gemini_Video_Review\downloads`, no writes, no
  reports opened externally, no Gemini request, no download): total **25**, valid **25**, invalid
  **0**, capExceeded false. reportStatus: available **1**, not-persisted **3**, incomplete **21**.
  outcome: completed 4, refused 2, error 7, null/incomplete 12. dateKind: exact **13**, approximate
  **12**, unknown **0**. A Read of the available run returned its report text; a not-persisted run
  returned no text with status `not-persisted`; a `..\..\evil` run-id was refused `unsafe/run-id-shape`.

## Known limitations / honest notes

- The Library List report status is manifest-only (available/not-persisted/incomplete); the Read
  action is the disk authority (it can additionally return `missing`/`unsafe`). This is deliberate —
  List must not read every report file, and Read re-validates against disk (TOCTOU) anyway.
- `app/node_modules` in this worktree is a junction to the V5b1 worktree's `node_modules` (gitignored)
  so Electron/tests run without a second install; it is not part of the diff.

## Live acceptance procedure (human-initiated; marker `V5B2 LIBRARY ACCEPTANCE 2026-07-18.11`)

One short captioned transcript run in the V5b2 build may satisfy BOTH pending gates (the V5b1
duration-refusal already passed and need not repeat). Verify the process command line points at
`.worktrees\v5b2-library-reader\app`, then run one short captioned video in transcript mode.

V5b1 content checks: report begins with `## 1. TL;DR`; the TL;DR includes an honest caption-derived
timestamp; en/em dashes render correctly; the manifest stays `completed` + `analysis-output.txt`.

V5b2 checks: the Library lists the run; **Open Report** from the live Video Scout pane opens the same
report in-app; the report is readable, copyable, scrollable, and maximizable; historical null-report
entries show `No report was persisted for this run.`; backfills show `Approximate`; unknown dates
remain visible; filters and sorting work; no report content appears in Logs; no OS application opens.

## Review-diff rule

- Pinned diff: `git diff --output=.agent-review-v5b2-library-reader.diff 92cacb3...<tip>` (three-dot
  from the V5b1 base; `--output`, never PowerShell `>`; gitignored).
- Retain the literal `VERDICT: PASS|FAIL` line and identify the review that produced it.

Reviewer verdict: `VERDICT: PASS`

Reviewer verdict source: Full-class whole-diff read-only review (fresh subagent), July 18, 2026, over
the pinned diff `.agent-review-v5b2-library-reader.diff` (`92cacb3...4fe9dc8`) plus worktree source.
All eleven mandated focus areas confirmed by reading: the single shared trusted-IPC sender gate (both
clipboard + library use it, reason constants byte-for-byte preserved, torn-down frames refuse); the
renderer supplies/receives no path or actionable run ID (opaque handles replaced per List refresh;
Read/Open-Report never return a path; Open Report resolves via the V5b1 pane→runId registry, never
terminal parsing); PowerShell as the sole manifest validator (no JS schema; JSON-only stdout; hostile
schema/JSON messages swallowed to bounded constants); fixed-root direct-child containment + reparse
refusal; every bound (5,000 dirs / 256 KiB manifest / 4 MiB report / 1e6 decoded units / strict UTF-8
/ 30 s execFile timeout + 32 MiB buffer / 1e6 clipboard); List/Read TOCTOU re-validation; plain-text-
only DOM (inertness tested against the real `el`); no content leakage (metadata-only Logs); pane→run
mapping from V5b1 state; clipboard/K8/navigation unchanged (`-OutDir` equals feed-gemini's own
default); and V5c/V5d absent. Two non-blocking LOW findings.

LOW-1 (a benign FileInfo.Length→ReadAllBytes check→read TOCTOU on the 4 MiB report bound) — FIXED in
`014d8f1` (re-check `$bytes.Length` against the same bound immediately after ReadAllBytes, before the
strict-UTF-8 decode) and confirmed by a scoped delta review, `VERDICT: PASS`, no regression
(library-core Pester 28/0 unchanged). LOW-2 (the entry point invokes bare `powershell` via PATH) —
INFORMATIONAL, matching the app's existing `execFile('powershell')` posture (new-agent / remove-agent
/ pty), not a V5b2 regression; left as-is for consistency. Final tip after the LOW-1 fix: `014d8f1`.
