# Builder Handoff — Dockview Bounded Prototype

Branch: `feature/dockview-prototype`
Worktree: `D:\Workspace\agent-command-center\.worktrees\dockview-prototype`
Fork-point / pre-merge `main` SHA: `1dce24c141e929c04122e8b2998277d4c2d0c728` (`main == origin/main` at branch creation)
Procurement-record commit: `a0c8551` — `docs/OSS-PROCUREMENT-dockview.md` only
Round-1 reviewed tip: `6315354` — **review returned `VERDICT: FAIL`**
Round-2 reviewed tip: `588ed85` — **review returned `VERDICT: FAIL`**
Round-3 tip (fixes): `8663467d19678e321fd3c136e6cf8bdbd32ab5b5` — **review returned `VERDICT: PASS`**
Round-4 reviewed code tip: `35da2e3f2a4551cee26fc48585fa4274c1f6af36` — **review returned `VERDICT: PASS`**
Round-5 implementation: `bebe1bf` — its pinned artifact was **superseded**, see § 12
Round-5 reviewed code tip: `3e338d9686114604036b0572a14f3f3866bc9617` — **review returned `VERDICT: PASS`**
Round-6 reviewed code tip: `be4422d84bab4727d3bd11772f30d9a010069ed5` — **awaiting review**
Artifact to review: `.agent-review-dockview-prototype-r6.diff` (**not** any earlier artifact)
Branch tip: this documentation-only handoff-tail commit above `be4422d`
Merge commit SHA: **not applicable — merge and push are NOT authorized**

Branch shape:
`1dce24c1 → a0c8551 → 6315354 → e04fa4d → 588ed85 → 26ed85e → 8663467 → 1b23799 → 35da2e3 → 23b8361 → bebe1bf → 1dd2bf5 → 3e338d9 → e23499a → be4422d → (this handoff tail)`

> # STATUS: ROUND 3 PASSED CODE REVIEW, THEN FAILED HUMAN ACCEPTANCE AT STARTUP
>
> Round 1 (`6315354`) returned `VERDICT: FAIL`.
> Round 2 (`588ed85`) returned `VERDICT: FAIL`.
> Round 3 (`8663467`) returned **`VERDICT: PASS`** — and that verdict **remains truthful** for the
> restore-ownership correction it reviewed. It is **not** human acceptance, and it did not prove
> that the browser script chain could initialize, because nothing in the automated suite executed
> that chain in a browser.
>
> **Stage A human acceptance was then performed and FAILED immediately at prototype startup.**
> Normal `npm start` passed; `npm run prototype:dockview` produced a **full-screen blank overlay**
> with no banner and no controls. Evidence and root cause are in § 11.
>
> **Round 4 (`35da2e3`) corrects that separately observed runtime defect.**
>
> ---
>
> # ROUND 5 — SECOND HUMAN-ACCEPTANCE FAILURE, NOW CORRECTED
>
> **Round 4 (`35da2e3`) received an independent `VERDICT: PASS`.** That verdict stands and is not
> retracted here: review and human acceptance are separate evidence, and Round 4's correction (the
> browser bootstrap) genuinely worked.
>
> **Human acceptance was resumed and FAILED again, for unrelated reasons:**
>
> 1. **Add Library silently did nothing.** No panel, no status, no log line, no visible effect.
> 2. **The layout controls were confusing and multiplied terminals.**
>
> Both are corrected in Round 5 (`bebe1bf`). Root causes, in the code:
>
> * `#libraryPanel` **exists nowhere in the DOM.** It appeared only in two `app/renderer/app.js`
>   call sites, both of which resolved to `null`, so `addPane` was never reached and the click was
>   discarded. The real surface is the `section.tabpane[data-pane="library"]` in `index.html`,
>   which had no id.
> * `useDefaultLayout` had **no emptiness guard**, so every press of the old "Use Default" created
>   two more live PTYs.
> * The restore-failure branch **called that same creator**, so a refused restore spawned terminals
>   as a side effect.
>
> A third defect was found *during* Round 5 by the real-Electron harness and never reached
> acceptance: the first cut of `undockLibraryElement` re-queried the document, but the adapter
> detaches a pane **before** releasing it, so the lookup returned `null` and the Library singleton
> would have been stranded outside the DOM permanently. Undock now prefers a held reference. This is
> recorded because it is the clearest evidence that the Node suites alone could not have caught it.

> ---
>
> # ROUND 6 — ROUND 5 PASSED REVIEW, THEN HUMAN ACCEPTANCE FOUND DICTATE UNREACHABLE
>
> **Round 5 (`3e338d9`) received an independent Full-class `VERDICT: PASS`.** That verdict stands.
>
> **Human acceptance was then performed against it and passed nearly everything** — the normal
> renderer path; Add Library, duplicate focus/refusal, and close/re-add; restore with no saved
> layout creating nothing; Create Default Workspace idempotency; save/rearrange/restore;
> split and window resize with terminal interactivity; terminal close convergence; Clear Saved
> Layout semantics; and Copy Output in both moved and unmoved panes, including controlled-selection
> and whole-buffer tests. **Copy Output is not a defect and is unchanged by Round 6.**
>
> **It failed on one thing: Dictate was unreachable in prototype mode.** The app-owned
> `.tts-controls` surface — `#audioBuild`, `#sttStatus`, `#sttMic`, `#ttsStatus`, `#ttsStop`,
> `#ttsVoice`, `#ttsSpeed` — stayed in the Terminals toolbar while `.dockview-prototype-root`
> (`position: fixed; inset: 0; z-index: 9000`, opaque) covered it. The controls were present in the
> DOM and impossible to click. That is the predeclared kill criterion covering TTS and Dictate after
> docking (§ 5.8).
>
> **Round 6 (`be4422d`) corrects it** by reparenting that exact element into a dedicated, visible
> prototype audio slot. See § 13.

> **Round 6 (`be4422d`) has NOT been reviewed and has NOT passed human acceptance.** Round 5's
> `VERDICT: PASS` belongs to `3e338d9` and says nothing about the Round 6 correction. Nothing here
> may be read as a passing review of Round 6, as human acceptance, or as an adoption verdict, and
> the branch remains unauthorized for merge or push.

Procurement record: **`docs/OSS-PROCUREMENT-dockview.md`** (required by `AGENTS.md` § OSS-FIRST
PROCUREMENT GATE item 6; its path and Blue's verbatim verdict are restated below per item 7).

## Blue's binding verdict — verbatim

> PROTOTYPE — Dockview: evaluate the MIT dockview package at an exact verified version using real
> terminal and Library panes. Exclude popouts. Preserve main-owned IPC, PTY, filesystem, and
> credential authority. Persist only versioned layout metadata. Production integration requires
> separate human acceptance.

Scope clarification, verbatim:

> That authorizes a bounded prototype only, not production adoption, and does not authorize merge,
> push, or any change to the production renderer path.

**No human adoption verdict is implied by anything in this branch.** Blue selects one of ADOPT ·
FORK · PROTOTYPE · PATTERN-MINE · BUILD FRESH after § 14 human acceptance.

---

## 1. Gate totals

| Gate | Baseline at `1dce24c1` | After implementation | Delta |
| --- | --- | --- | --- |
| App (`npm test`) | **1362 passed / 0 failed**, 37 suites, exit 0 | **2287 passed / 0 failed**, 44 suites, exit 0 | +925 / +7 suites |
| Pester (`scripts\run-pester.ps1`) | **955 passed / 0 failed / 0 skipped** | **955 passed / 0 failed / 0 skipped** | unchanged |

Per-round app gate: `6315354` = 1706/0 (42 suites) · `588ed85` = 1759/0 (43) · `8663467` = 1850/0
(43) · `35da2e3`/`23b8361` = **1974/0 (44)** · `bebe1bf`/`3e338d9` = **2099/0 (44)** ·
`be4422d` = **2287/0 (44)**.

The round-6 delta reconciles exactly: **+188**, and only three suites moved —
`dockview-default-path` 152 → 209 (**+57**), `dockview-bootstrap` 111 → 205 (**+94**), and
`dockview-adapter-lifecycle` 171 → 208 (**+37**). No other suite's count changed and **no suite was
added**, so `app/package.json` needed no reachability entry and is byte-identical to `e23499a`.

The round-5 delta reconciles exactly: **+125**, and only three suites moved —
`dockview-default-path` 103 → 152 (**+49**), `dockview-bootstrap` 87 → 111 (**+24**), and
`dockview-adapter-lifecycle` 119 → 171 (**+52**). No other suite's count changed, and **no suite was
added**: every Round-5 proof landed in an existing suite, so no `app/package.json` reachability entry
was required.

The round-3 delta reconciles exactly: **+91**, which is precisely
`app/renderer/dockview-adapter-lifecycle.test.js` going from **28 to 119** assertions. No other
suite's count changed, and no suite was added or removed.

The app delta reconciles exactly: 47 (package-identity) + 111 (layout-store) + 54 (default-path) +
59 (fit-policy) + 71 (panel-policy) = 342 new, plus 2 added to `pane-maximize.test.js` = **344**.

### Recorded baseline discrepancy — disclosed, not silently accepted

The work order § 2 expected an app baseline of **1298** passed. Measured at the exact required base
SHA, with `main == origin/main == 1dce24c1` and the Pester gate matching its expected 955/0/0
exactly, the app gate summed to **1362** passed / 0 failed across 37 suites (one summary line per
suite; no double counting). The only commits between the previously recorded `main` (`c58ddfa9`) and
this base are documentation-only, so no test-count change exists in the tree, and neither "1298" nor
"1362" appears in any repo file. **Blue ruled on 2026-08-04: use 1362 as the measured baseline.**

## 2. What was built

### Isolation — the default path is untouched

- `npm start` is byte-for-byte the same launch as before: `electron .`, no flag.
- `npm run prototype:dockview` → `electron . --dockview-prototype` is the only way in.
- `app/main.js` reads the flag from **its own** `process.argv`, once, at startup, and forwards the
  decision through `webPreferences.additionalArguments` (a distinct token, `--cc-dockview-prototype`).
  It is not a setting, not an env var, and not anything the renderer can write.
- `app/preload.js` exposes `window.ccDockview` as an `Object.freeze`d bridge carrying a boolean plus
  three bounded layout operations. There is no member that could turn the prototype on, and none
  accepts a path.
- The three layout IPC channels are registered **inside** `if (dockviewPrototypeEnabled)`. In default
  `npm start` they do not exist at all, so an invoke rejects with "no handler registered".
- `app/renderer/index.html` carries exactly **one** Round-5 change: an inert `id="libraryPane"` on
  the pre-existing Library `<section>`, plus a comment explaining it. No CSS rule and no production
  script reads that id, so default appearance and behaviour are unchanged — and
  `dockview-default-path.test.js` asserts index.html still loads no Dockview script, no Dockview
  stylesheet, and carries no Dockview markup or class. Prototype scripts and the vendor bundle are
  still injected dynamically, only after `window.ccDockview.enabled !== true` fails to return
  early.

### Layout trust boundary — `app/dockview-layout-store.js`

Main owns the file. The renderer supplies no path, ever.

Pre-parse: `lstat` (not `stat`) regular-file check · reparse-point/symlink refusal before any read ·
256 KiB cap checked before and after read · strict `fatal: true` UTF-8 decode.

Post-parse: **strict allowlist** — every object refuses unknown keys, which is what excludes
`params`, `floatingGroups`, `popoutGroups`, and `edgeGroups` without enumerating them as threats.
Plus exact envelope keys · `schemaVersion === 1` · exact package and version · round-tripped UTC
ISO-8601 `savedAt` · depth ≤ 20 · ≤ 64 panels · ≤ 64 groups · bounded arrays/keys/strings/finite
numbers · `__proto__`/`prototype`/`constructor` refused at every depth · no duplicate pane IDs · only
known prototype pane IDs (`library` or `pty<n>`) · only `terminal`/`library` component kinds · a
grid↔panels cross-reference so neither an orphan panel nor a dangling view can restore · and refusal
of any string shaped like a path, URL, traversal, control character, or credential.

Validated **before writing**, **after reading before crossing IPC**, and **again before `fromJSON`**.
Atomic replace on save. An invalid file is left byte-for-byte intact for diagnosis — never repaired,
deleted, or overwritten. Refusals are a bounded reason constant and never echo contents.

**The allowlist was derived, not guessed.** `app/dockview-tripwire.js` captured a real
`dockview@7.0.4` `toJSON()` from a workspace containing a split, a tab group, and both component
kinds; that fixture is committed at `app/test-fixtures/dockview-7.0.4-layout.json` and asserted
against the validator, so a future serialization change fails loudly instead of the validator
drifting permissive.

### xterm/PTY contract — `app/renderer/dockview-fit-policy.js` (pure)

Never fits a hidden or zero-sized panel; visibility is re-checked **inside** the frame and fails
closed if the check throws. Coalesces event storms into one bounded animation frame. No polling, no
retry loop — becoming visible is itself the event that schedules the next fit. Refuses zero,
negative, non-integer, and non-finite geometry rather than forwarding it to the PTY, and suppresses
duplicate resizes. Exactly one controller — and therefore one `ResizeObserver` — per pane, so a move
cannot create a second observer. `dispose()` is idempotent and cancels pending frames.

### Single idempotent close path

The close handler's body is now the named `closeThisPane`, guarded on `terms.has(id)`. A Dockview
panel-removal event and the ✕ button converge on it, so `ptyKill`, xterm disposal, observer
disconnect, map deletion, and DOM cleanup each happen **exactly once**. Ordering is unchanged.

### Pane hosting

Panels **reparent** the pane element the existing code already built. The live xterm, its PTY, its
clipboard/OSC-52 handlers, selection listeners, and Video Scout pane identity all survive a move.
Nothing is recreated. Dockview is told exactly three things per pane — opaque ID, allowlisted kind,
display-safe title — and the title is derived from the pane ID alone, so no worktree-derived string
can reach it.

## 3. Network and telemetry evidence — three independent checks

1. **Static source inspection.** The UMD bundle and all 417 `dockview-core` dist files contain zero
   occurrences of `fetch(`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `sendBeacon`,
   `importScripts`, `new Worker`, `eval(`, `new Function`, `localStorage`, `sessionStorage`,
   `indexedDB`, or `document.cookie`. Every URL literal is the SVG namespace or a doc comment.
   Pinned as a test in `app/dockview-package-identity.test.js`.
2. **Isolated harness** (`npm run prototype:dockview:tripwire`). Own session partition; every request
   recorded metadata-only (scheme, host, resource type, count) and every non-`file://` request
   **cancelled**. Result, reproduced twice:

   ```
   ok: true   dockviewVersion: 7.0.4   loadedUnderStrictCsp: true   remoteRequestCount: 0
   requests:  file/mainFrame x1,  file/script x1
   ```

   Dockview loaded and built a real split/tab layout under `contextIsolation: true`,
   `sandbox: true`, `nodeIntegration: false`, and a CSP **stricter** than the app's
   (`default-src 'none'; connect-src 'none'`). The fixture reproduced byte-identically on re-run.
3. **Live prototype comparison** — see § 6: this is part of human acceptance and has **not** been
   performed. Existing audio-model traffic is deliberately not attributed to Dockview; check 2 is the
   isolated evidence that establishes package behaviour on its own.

## 4. Kill-criteria assessment (work order § 5)

Assessed honestly. Criteria 1, 2, and 8 depend on live human interaction and are marked as such —
they are **not** claimed as passed.

| # | Criterion | Status |
| --- | --- | --- |
| 1 | Terminal fails to refit after mount/drag/split/tab/group/window resize | **Not yet observable** — contract implemented and unit-proven; requires § 14 human acceptance |
| 2 | PTY cols/rows stale, zero, oscillating, or divergent | **Not yet observable** live; refusal of zero/non-finite geometry and duplicate suppression are unit-proven |
| 3 | Any telemetry or network request | **Did not fire** — `remoteRequestCount: 0`, twice |
| 4 | Requires React, remote assets, `nodeIntegration`, unsafe IPC, weaker isolation/CSP, or popout permissions | **Did not fire** — no React anywhere; loads under stricter-than-app CSP with sandbox and no node integration; `disableFloatingGroups: true`; no popout API is ever called |
| 5 | Saved state cannot be strictly schema-validated and bounded | **Did not fire** — the real fixture is small and closed; the strict allowlist is honest, not over-fit |
| 6 | Corrupt/oversized/unsupported/hand-edited state reaches `fromJSON` | **Did not fire** — validated three times; `fromJSON` is unreachable for invalid state |
| 7 | Invalid state crashes the renderer, drops panes silently, or overwrites the file | **Did not fire** — bounded visible refusal; orphan/dangling panes refused rather than dropped; invalid file preserved |
| 8 | Move/tab breaks clipboard, Copy Output, TTS, Dictate, focus, PTY output, close, or Open Report | **DID FIRE at `3e338d9`, corrected in `be4422d`** — Copy Output, clipboard, focus, PTY output and close all passed human acceptance, but **Dictate was unreachable**: the app-owned `.tts-controls` surface stayed behind the full-screen prototype overlay. See § 13. Re-verification requires § 14 human acceptance against `be4422d` |
| 9 | Dockview receives contents, paths, prompts, credentials, keys, or authority | **Did not fire** — three allowlisted fields only; asserted in tests |
| 10 | Default `npm start` imports/initializes Dockview, creates a layout file, or changes the grid | **Did not fire** — 54 assertions in `dockview-default-path.test.js` |
| 11 | Requires an architectural refactor not removable by deleting the branch | **Did not fire** — every change is additive or fenced; deleting the branch removes all of it |

## 5. Disclosures

1. **Files added beyond § 12's literal list**, all justified by obligations elsewhere in the order:
   `app/dockview-tripwire.js` + `.html` (§ 10 check 2 and the § 9 fixture derivation),
   `app/dockview-package-identity.test.js` (§ 13 package-identity/no-React gate),
   `app/dockview-default-path.test.js` (§ 13 default/opt-in matrix),
   `app/test-fixtures/dockview-7.0.4-layout.json` (the controlled fixture § 9 requires).
2. **`app/renderer/pane-maximize.test.js` was modified.** A concrete failing test proved necessity:
   it located the close handler by the source anchor `pane.querySelector('.x').onclick`, which moved
   when the handler body was extracted into the named idempotent `closeThisPane` that § 7 requires.
   The ordering assertion is **unchanged**; the anchor follows it, and two assertions were **added**
   pinning the new idempotency invariant. Coverage increased, not decreased.
3. **UMD rather than the published ESM entry**, approved by Blue on 2026-08-04. The ESM entry
   (`dist/package/main.esm.mjs`) imports the bare specifier `dockview-core`, which a `file://`
   renderer cannot resolve without an inline `<script type="importmap">` that the app CSP blocks.
   The self-contained UMD bundle in the same package at the same version needs no bundler, import
   map, Node integration, or CSP change. Pinned by a test so a future self-contained ESM bundle can
   be adopted deliberately rather than by drift.
4. **`ELECTRON_RUN_AS_NODE` hazard.** If that variable is set in the environment, `electron` runs as
   plain Node and `app.whenReady` is undefined — the tripwire and the app both fail with a confusing
   stack. Clear it before running `npm run prototype:dockview` or the tripwire.
5. **Pre-existing untracked `.worktrees/`.** `git status` at the base reports `?? .worktrees/`;
   `.gitignore` has no entry for it (line 36 is `.merge-gate/`). Pre-existing, unrelated to this
   work, and disclosed rather than fixed.

## 6. NOT done — human acceptance is outstanding

**§ 14 human acceptance has not been performed.** It is a human procedure by definition and no part
of it may be inferred from the automated gates. Outstanding, in order: normal `npm start` and proof
the grid is unchanged with no layout file created · relaunch under `npm run prototype:dockview` ·
banner confirmation · explicit creation of two real PowerShell PTYs and the Library pane · drag,
split, tab, group resize, window resize, hidden-tab activation · rows/columns and live output
verified after **every** transition · clipboard, Copy Output, TTS, Dictate destination locking ·
Library list/read/copy/maximize/follow-up and Open Report with **no** provider request · save,
full Electron restart, explicit restore, topology verification · unsupported-version, corrupt, and
oversized layout copies each refusing visibly without overwriting evidence · the Dockview-only
tripwire · and a final normal `npm start` reconfirming the existing grid.

**No merge. No push. No provider request was made at any point.**

## 7. One item this branch could not durably deliver

Blue's audit ruling required the six pre-existing advisories to be registered as a **named item on
the Blue Helm 1.0 release-gate list**, owned by **EDA-1**
(`docs/AUDIT-SCOPE-environment-deployment.md`), each triaged individually.

The **triage is complete** and recorded in `docs/OSS-PROCUREMENT-dockview.md` § 15 — including the
finding that `undici` (high) is **not reachable via production dependencies at all** and is not in
the shipped app, a materially different posture from the three ML runtime dependencies, and that
`tar` and `protobufjs` are likewise not ML-specific.

The **registration** was not performed here. The release-gate list lives in
`BLUE-HELM-MASTER-STATUS.md`, which this work order's § 12 marks *Expected unchanged*, and this
branch is not authorized to merge or push and must remain removable by deletion — so an entry written
here would vanish with the branch, recreating the exact "exists in one handoff and nowhere else"
failure Blue warned against. It needs a separate, small, independently-authorized change against
`main`. **Recommended next work order.**

## 7b. Round 5 — Library integration and layout-control semantics

### What was corrected

| Symptom (human acceptance) | Root cause, in code | Correction |
| --- | --- | --- |
| Add Library silently did nothing | `#libraryPanel` exists **nowhere** in the DOM; the two `app.js` call sites resolved to `null`, so `addPane` was never reached | Bound to the real `section.tabpane[data-pane="library"]`, now carrying an inert `id="libraryPane"` |
| Controls multiplied terminals | `useDefaultLayout` had **no emptiness guard** — each press created two more live PTYs | Preflights an empty workspace **before** the first terminal; refuses `workspace-not-empty` creating zero panes and zero PTYs |
| A refused restore spawned terminals | the restore-failure branch **called** the default-workspace creator | Restore failure is a full stop; it never calls that creator |
| "Use Default" / "Reset" were misleading | labels implied a view toggle and a live reset | Renamed **Create Default Workspace** / **Clear Saved Layout**; the latter states that live panes were unchanged |

### Library docking contract

The Library is a **singleton** carrying every listener `library-view.js` and `report-followup.js`
bound to it, so it is **moved, never cloned**. A placeholder comment records its exact original
position, so closing returns it to the same **index**, not merely the same parent.

Docking is **transactional**: an existing panel is detected **before** `hostedPanes` or the DOM is
touched; descriptor validation precedes any DOM move; and a throwing `addPanel` rolls back **both**
the provisional ownership and the DOM. A duplicate Add focuses the existing panel through
dockview 7.0.4's verified public `panel.api.setActive()` (`dockviewPanelApi.d.ts:75`) and reports
`library-already-open`. A missing surface refuses `library-dom-missing` with a content-free log
reason. The undock lives in **permanent release only**, so a restore-driven rebuild remains a mount
transition and does not send the Library home mid-restore.

### A defect the Node suites could not have caught

The first cut of `undockLibraryElement` re-queried `document.querySelector('#libraryPane')`. The
adapter **detaches** a pane before releasing it, so that lookup returned `null`, the placeholder
branch bailed out, and the Library singleton would have been stranded outside the DOM permanently —
unrecoverable without a restart. The real-Electron bootstrap harness caught it on its first run.
Undock now prefers a **held reference**. This is recorded because it is the clearest evidence on this
branch that a real-renderer harness earns its keep.

### Proof strategy, and the one honest gap

The bootstrap harness **extracts the Library section from `app/renderer/index.html` at run time** and
hard-fails if it is missing, duplicated, nested, or short any of the fifteen canonical controls
(`libRefresh`, `libSearch`, `libMode`, `libRoute`, `libOutcome`, `libDateKind`, `libSort`,
`libStatus`, `libList`, `libReader`, `libCopy`, `libMax`, `libMetaHost`, `libReportText`,
`libFollowupHost`). There is **no copied fixture** to drift out of sync. It then drives add →
duplicate → close → re-add against that genuine markup in a real sandboxed renderer, checking element
identity, original index, control survival, and visibility while **no tab is active**.

**The gap, stated plainly:** the harness page cannot load `styles.css` (it is a separate page with a
stricter CSP), so it carries a copy of the two real `.tabpane` rules plus the docked rule. That copy
is what makes the visibility assertion meaningful rather than vacuous — without
`.tabpane{display:none}` present, a visible Library would prove nothing. To stop the copy drifting,
`dockview-default-path.test.js` separately asserts that `styles.css` still contains a docked-Library
rule at `(0,3,0)` specificity and still contains the `.tabpane{display:none}` default it must beat.
Production CSS and the harness copy are therefore pinned to each other by test, not by discipline.

### Terminal identity

`termSeq` remains monotonic and is **never reset** (asserted: it is initialised exactly once). A
label like **Terminal 17 does not mean seventeen live terminals** — it means seventeen have been
created since launch. `instance.diagnostics()` reports `liveTerminals`, `ownedPanes`,
`fitControllers`, and `libraryDocked` so the two can never be confused while reading the screen, and
a test proves all three counts return to zero after every terminal is closed.


## 8. Independent review — round 1 returned FAIL; what it found and what changed

The Full-class review of `6315354` returned `VERDICT: FAIL`. Every blocking finding was
independently verified against the vendor bundle and a live Electron probe **before** being
accepted. All were real. This section exists so the failure is part of the record, not a footnote.

| # | Finding | Verified how | Fixed in `588ed85` |
| --- | --- | --- | --- |
| B1 | Panel-removal convergence was **dead code**: dockview fires the panel itself, not `{panel}`, so `event.panel.id` was always undefined and closing a tab would orphan the PTY | `dockview.js:18526` — `_onDidRemovePanel.fire(event.panel)` | Reads the ID off the payload; an unresolvable ID is now a **visible refusal**, not a silent return |
| B2 | The test guarding B1 asserted on **source text** and passed anyway | Read the assertion | Replaced by a behavioural suite using the vendor's real payload shapes |
| B3 | With B1 fixed, Restore would `ptyKill` **every live terminal**, because `fromJSON` clears first | `dockview.js:17049` `reuseExistingPanels`, `_doFromJSON` | Re-entrancy guard around `fromJSON` and dispose |
| B4 | **Save was refused by its own validator.** `toJSON()` emits 10 own keys/panel, 7 undefined; the fixture showed 3 because `executeJavaScript` drops undefined-valued keys | Live Electron probe reading `Object.getOwnPropertyNames` | Optional keys tolerated **only when `undefined`**; a populated `params`/`renderer`/size hint is still refused |
| B5 | The fit policy was **additive**: the app's own ungated `ResizeObserver` stayed attached, so hosted terminals had two observers and two resize senders | Read `app.js:504-509` | Adapter suspends the app's observer for panes it hosts |
| H1 | The ✕ button left a **ghost panel** and leaked the controller/observer | Read the close path | Inverse convergence hook `onAppPaneClosed` |
| H2 | Restore mounted **empty panel shells** when no live pane matched a saved ID | Read `restoreLayout` | Refuses visibly, names the missing panes, changes nothing |
| M1 | `window.ccDockview` was exposed **unconditionally**, so the default renderer's global surface was not unchanged | Read `preload.js` | Exposed only inside the prototype-mode guard |
| M2 | The test comment stripper **deleted code**: in `/^https?:\/\//i` it read the regex-closing slash as a comment | Traced by hand, then pinned | Consumes backslash escapes globally, plus self-tests |

**One reviewer claim was not accepted as written.** It implied `event.panel.id` was wrong throughout.
It is wrong for `onDidRemovePanel` but **correct** for `onDidActivePanelChange`, which genuinely
fires `{ panel, origin }` (`dockview.js:17916`). The two events have different shapes; the tests now
assert per-handler rather than over the whole file, which is stricter than either reading.

**What this failure says about the kill-criteria table in § 4.** The round-1 table was too generous.
B1 and B4 mean the close path and the save path were **not** exercised end-to-end before that table
was written. The table above still marks criteria 1, 2, and 8 as *not yet observable*, and that is
now the honest reading of the persistence and close criteria too until § 14 is performed against the
current tip. Round 2 then proved the same point a second time — see § 9 — so the § 4 table should be
read as **not yet established** for criteria 1, 2, 5, 6, 7 and 8 until a review returns PASS and the
§ 6 human acceptance is actually performed.

## 9. Independent review — round 2 ALSO returned FAIL, and what changed in `8663467`

The round-2 Full-class review of `588ed85` confirmed every round-1 correction (B1, B3, B4, B5, H1,
H2, M1, M2 each independently re-derived and verified), reproduced the pinned artifact byte-for-byte,
and ran every gate green — and still failed the branch on one blocking defect. **Its literal verdict
line, verbatim:**

> VERDICT: FAIL — Restore silently orphans live terminals: releasePane runs before the re-entrancy
> guard, so fromJSON's clear empties hostedPanes and the rebuild half cannot reparent, leaving empty
> panel shells and detached xterms with live PTYs (criterion 6, § 5.7); and the round-2 lifecycle
> fake omits fromJSON's createComponent/init() rebuild, so its post-restore assertion passes on that
> empty shell and conceals the defect.

### The cause, verified against the vendor bundle

The removal handler performed a **permanent** release before deciding what kind of removal it was:

```js
releasePane(paneId);              // deletes the hostedPanes entry
if (suppressCloseConvergence) return;
```

`dockview@7.0.4`'s `_doFromJSON` calls `this.clear()` first (`dockview.js:17080` → `_doClear` →
`doRemoveGroup:17721` → `removePanel` per panel), and each of those surfaces on the public removal
event. The rebuild that follows (`dockview.js:17120` → `DockviewPanelModel` constructor →
`createComponent:12519` → `panel.init` → `content.init`) then found **no ownership entry**, so it
mounted an empty shell while the live xterm and its PTY stayed attached to a discarded host.

Fixing B1 in round 2 is what made this path live at all; the B3 guard sat exactly one line too late
to cover it. **The round-1 table in § 4 was too generous a second time**: the persistence and close
criteria were still not exercised end-to-end when it was written.

### The correction

| Concern | Round-2 shape | `8663467` |
| --- | --- | --- |
| Removal classification | released permanently, then checked the guard | **classifies first**: a mount transition unmounts and returns; anything else releases and converges once |
| Ownership vs. mount | one operation conflated both | two operations: `unmountPane` (transient — controller, observer, pending frame) and `releasePane` (adds ownership) |
| Guard scope | a bare boolean, reset in one `finally` | `inMountTransition(fn)` restores the **previous** mode, so nesting and a genuine later user close both behave |
| Restore success | assumed once `fromJSON` returned | `paneIsMounted()` verifies **by object identity** that every restored pane is parented to the host just built for it |
| Apply failure | `useDefaultLayout()` — which spawns replacement terminals | deterministic rollback to the captured topology using the **original** live elements; no PTY created or killed |
| Failure reporting | echoed `e.message` | bounded `restore-apply-failed` / `restore-apply-incomplete`; the exception is never echoed (its messages interpolate panel IDs and layout fragments) |
| Teardown | released only panes carrying a fit controller | releases every **owned** pane, so the Library pane no longer survives `dispose()`; `api.dispose()` runs inside a mount transition |

Rollback is two ordered strategies, not a retry: re-apply the layout Dockview itself serialized
moments earlier, and failing that, clear and rebuild the captured panes through the same `addPanel`
primitive that created them. The saved file is never written, deleted, or overwritten on any path.

### Test fidelity — the second half of the finding

The round-2 fake performed `fromJSON`'s clear but rebuilt with a bare `panels.set(id, {id})`, never
invoking the component factory or the renderer's `init()`. Its post-restore assertion was
`getPanel('pty1') !== null`, which passes over an empty shell. That is why the defect survived a
review that was otherwise thorough.

The fake now performs **both halves**, and the stub `appendChild` **moves** nodes as the real DOM
does. Assertions inspect DOM ownership by object identity and panel-host child counts;
`getPanel(id) !== null` is no longer treated as proof of anything.

**Regression proof.** The round-3 restore assertions were run against both tips using an identical
harness: **9 of 11 fail against `588ed85`** (every "original pane element is a child of the rebuilt
host", "not an empty shell", and "no longer on the discarded host" assertion) and **11 of 11 pass
against `8663467`** — with no PTY killed or created in either case. The committed suite itself also
fails against `588ed85`.

New behavioural coverage: successful restore of two terminals plus a Library pane · controller and
observer disposal during the clear · exactly one new controller and observer per restored terminal ·
three leak-free restore cycles (controllers, observers, frames, pane entries) · close convergence in
both directions **after** a restore · the missing-live-pane refusal leaving the current topology
untouched · apply failure after the clear · apply failure mid-rebuild · teardown release.

### Round-3 disclosures

1. **`useDefaultLayout()` on the LOAD-failure branch is unchanged.** When `loadLayout` itself refuses
   (no saved layout, corrupt file), the adapter still calls `useDefaultLayout()`, which creates two
   terminals and a Library pane. If panes are already open, that **adds** to them rather than
   replacing them. The work order scopes round 3 to the *apply* path, so this was deliberately not
   touched. Disclosed rather than silently fixed or silently ignored — it needs its own authorization.
2. **Two ungated resize senders remain**, as the round-2 review noted: xterm's own `term.onResize`
   (`app.js:440`) and the maximize path (`app.js:150`). Both carry the same post-fit geometry as the
   gated controller, so they are duplicative rather than divergent, and both are pre-existing
   production wiring. `app.js` is outside this work order's file scope.
3. **`ownedPaneIds()` was added to the adapter's returned surface** — a read-only list of pane IDs
   the adapter owns, used by the leak assertions. It exposes no element, no handle, and no authority.

## 10. Pinned review artifacts

All three artifacts are gitignored and local. Each was generated with `git diff --output=` (never
PowerShell redirection), regenerated into a separate file, and **byte-compared identical**. The
round-1 and round-2 artifacts are **preserved unchanged as historical failed-review evidence**.

**Round 1 — reviewed, `VERDICT: FAIL`**
`.agent-review-dockview-prototype.diff`

- Range: `1dce24c141e929c04122e8b2998277d4c2d0c728...6315354`
- Size: **172,014 bytes** · SHA-256 **`138F7BE022F660BFA634A40CD8E439E853ACE458E24FCF3BCBD19A3B03E79F21`**
- 20 files · 3,139 insertions · 3 deletions

**Round 2 — reviewed, `VERDICT: FAIL`**
`.agent-review-dockview-prototype-r2.diff`

- Range: `1dce24c141e929c04122e8b2998277d4c2d0c728...588ed85`
- Size: **216,125 bytes** · SHA-256 **`45F238F765308662AC00A3558D89186C60990B9243267F315A506D59E1932778`**
- 22 files · 3,843 insertions · 3 deletions

**Round 3 — reviewed, `VERDICT: PASS`** (then failed human acceptance — see § 11)
`.agent-review-dockview-prototype-r3.diff`

- Range: `1dce24c141e929c04122e8b2998277d4c2d0c728...8663467d19678e321fd3c136e6cf8bdbd32ab5b5`
- Size: **241,892 bytes** · SHA-256 **`D3043843A532BF17A1BCC6F51212B10CD3A9595977DACF3C325A510FE22ACB91`**
- 22 files · 4,257 insertions · 3 deletions
- Reviewed code tip: `8663467d19678e321fd3c136e6cf8bdbd32ab5b5`
- Fix-only delta for a focused re-review: `git diff 588ed85 8663467` — **2 files**,
  457 insertions, 90 deletions (`app/renderer/dockview-prototype.js` and
  `app/renderer/dockview-adapter-lifecycle.test.js` only).

**Round 4 — awaiting review**
`.agent-review-dockview-prototype-r4.diff`

- Range: `1dce24c141e929c04122e8b2998277d4c2d0c728...35da2e3f2a4551cee26fc48585fa4274c1f6af36`
- Size: **298,409 bytes** · SHA-256 **`E87DCF94ABB0D76783D36CEDD48660A089B21B2AF052C55998968481284E0AC8`**
- 25 files · 5,264 insertions · 3 deletions
- Reviewed code tip: `35da2e3f2a4551cee26fc48585fa4274c1f6af36`
- Fix-only delta for a focused re-review: `git diff 1b23799 35da2e3` — **9 files**.
  Read it with **`git diff -w 1b23799 35da2e3`** first: whitespace-insensitive it is
  **884 insertions / 17 deletions**, because the two policy modules are dominated by mechanical
  re-indentation from being wrapped in an IIFE (semantically **+9 lines each**).

**Round 5 — SUPERSEDED, never reviewed. Do not review from this artifact.**
`.agent-review-dockview-prototype-r5.diff`

- Range: `1dce24c141e929c04122e8b2998277d4c2d0c728...bebe1bf`
- Size: **328,171 bytes** · SHA-256 **`F5691350719FB5603283BA36234CF474BE38A8CDDB28E854872A18C0D8882A7B`**
- 26 files · 5,791 insertions · 4 deletions
- Isolated Round-5 correction: `git diff 23b8361 bebe1bf` — 9 files, 749 insertions, 34 deletions.
- **Why superseded:** this artifact is materially incomplete. It records
  `app/dockview-default-path.test.js` as a single line —
  `Binary files /dev/null and b/app/dockview-default-path.test.js differ` — because that file then
  contained one literal NUL byte. The hidden file is the proof of predeclared kill criterion § 5.10
  (default `npm start` never touches Dockview), so the artifact concealed exactly the evidence a
  reviewer most needs. See § 12.
- **Preserved unchanged** as superseded reviewability evidence; its SHA-256 above was re-verified
  after the correction and is byte-identical.

**Round 5 FINAL — reviewed, `VERDICT: PASS`** (then human acceptance found Dictate unreachable —
see § 13)
`.agent-review-dockview-prototype-r5-final.diff`

- Range: `1dce24c141e929c04122e8b2998277d4c2d0c728...3e338d9686114604036b0572a14f3f3866bc9617`
- Size: **372,008 bytes** · SHA-256 **`1289587909EC104ACAA4B3E52B5C7794991F11C205A5F5A12ACD7B284716A4B1`**
- 26 files · 6,446 insertions · 4 deletions
- Reviewed code tip: `3e338d9686114604036b0572a14f3f3866bc9617`
- Generated with `git diff --output=` only, regenerated into a separate file, and **byte-compared
  identical**.
- **Zero `Binary files … differ` markers.** All 26 files carry textual hunks; all **8** JavaScript
  test suites are fully readable. `app/dockview-default-path.test.js` now appears as **539
  insertions** where the superseded artifact showed one marker line.
- Verification note for whoever re-checks this: the file now legitimately contains the *phrase*
  "Binary files … differ" twice, in explanatory comments. Those appear as `+`-prefixed added lines.
  A real Git marker is unprefixed at column 0, so anchor the check on **`^Binary files`** — a bare
  substring grep returns 2 false positives.
- R1–R4 artifacts preserved unchanged (172,014 / 216,125 / 241,892 / 298,409 bytes).

**Round 6 — awaiting review. THIS IS THE ARTIFACT TO REVIEW.**
`.agent-review-dockview-prototype-r6.diff`

- Range: `1dce24c141e929c04122e8b2998277d4c2d0c728...be4422d84bab4727d3bd11772f30d9a010069ed5`
- Size: **437,855 bytes** · SHA-256 **`577F33DA510A7B176DD79F1D225734243A1AF3E7382BA5FCDEB7F6A5D7603C0D`**
- 26 files · 7,565 insertions · 4 deletions
- Reviewed code tip: `be4422d84bab4727d3bd11772f30d9a010069ed5`
- Generated with `git diff --output=` only, regenerated into a separate file, and **byte-compared
  identical**. Zero `^Binary files` markers and **zero NUL bytes**; all 26 files carry textual hunks.
- Isolated Round-6 correction: `git diff e23499a be4422d` — **8 files**, 983 insertions,
  5 deletions.
- All six earlier artifacts preserved unchanged and re-verified by SHA-256 after this round
  (172,014 / 216,125 / 241,892 / 298,409 / 328,171 / 372,008 bytes).


### Round-3 file scope — proven, not asserted

Every other file in the branch is **byte-identical to `588ed85`**, verified by blob hash:
`app/main.js` · `app/preload.js` · `app/package.json` · `app/package-lock.json` ·
`app/dockview-layout-store.js` · `app/renderer/app.js` · `app/renderer/index.html` ·
`app/renderer/styles.css` · `app/renderer/dockview-fit-policy.js` ·
`app/renderer/dockview-panel-policy.js` · `app/renderer/pane-maximize.test.js` ·
`app/dockview-default-path.test.js` · `app/dockview-layout-store.test.js` ·
`app/dockview-package-identity.test.js` · `app/dockview-tripwire.js` · `app/dockview-tripwire.html` ·
`app/test-fixtures/dockview-7.0.4-layout.json` · `docs/OSS-PROCUREMENT-dockview.md` ·
`BLUE-HELM-MASTER-STATUS.md` · `scripts/merge-gate.ps1`.

No dependency changed; `package.json` and `package-lock.json` are untouched, so `dockview@7.0.4`
remains the exact pinned version and no `npm audit fix` was run.

### Round-3 gates, as run

| Gate | Result |
| --- | --- |
| Focused lifecycle suite | **119 passed / 0 failed** (was 28) |
| App (`npm test`) | **1850 passed / 0 failed**, 43 suites, **exit 0** |
| Pester | **955 passed / 0 failed / 0 skipped**, exit 0 |
| Reachability | 6/6 Node · Pester family green |
| Node `--check` on both changed files | clean |
| `git diff --check` | clean |
| Dockview network tripwire | `ok: true` · `dockviewVersion: 7.0.4` · `loadedUnderStrictCsp: true` · **`remoteRequestCount: 0`** |

**No human acceptance was performed. No provider request was made. Not merged. Not pushed.**
§ 6 of this document still lists the outstanding human acceptance procedure in full, and it must now
be performed against `8663467` rather than `588ed85` — after a review returns PASS, not before.

## 11. Round 3 PASSED review — then human acceptance FAILED at startup, and what round 4 changed

### The review verdict stands; it was never the missing evidence

The independent Full-class review of `8663467` returned, literally:

> VERDICT: PASS

That verdict **remains truthful for what it reviewed**: the restore-ownership correction. It is
**not** human acceptance, and it did not establish that the browser script chain could initialize —
because no test on this branch executed that chain in a browser. Round 3 is not being rewritten as a
FAIL. It answered its question correctly; the runtime question was simply never asked.

### Stage A human acceptance — observed result

| Step | Result |
| --- | --- |
| Normal `npm start` | **PASS** — existing grid unchanged, no banner, no controls, no layout file |
| `npm run prototype:dockview` | **FAIL** — full-screen blank overlay |
| Expected banner and six controls | **Absent** |
| Layout file | Absent (nothing was created) |
| Provider activity | None |
| Failed Electron instance | Closed |

Evidence retained:

- Screenshot: `C:\Users\levij\AppData\Local\Temp\codex-clipboard-ec243511-a1b4-4bc0-a17e-2eba6ae87e61.png`
- Renderer log: `C:\Users\levij\AppData\Local\Temp\dockview-prototype-renderer.log`
  — **11,967 bytes**, SHA-256 `84947AF434E783073A08C6743F3AFB00E8E30414B1BF7AB9048842DCC32DCAC4`
  (both re-verified at the start of round 4; the log identity matched exactly)

The four reproduced errors, verbatim from that log:

```text
dockview-fit-policy.js:    Uncaught SyntaxError: Identifier 'api' has already been declared
dockview-panel-policy.js:  Uncaught SyntaxError: Identifier 'api' has already been declared
dockview-prototype.js:     Uncaught ReferenceError: require is not defined
app.js:733                 TypeError: Cannot read properties of undefined (reading 'activate')
```

### Root cause — Blue Helm's browser integration, not the vendor bundle

`dockview@7.0.4` loaded successfully (the log shows its bundle fetched immediately before the first
error). The defect is entirely ours, and it is a Node-versus-browser scoping difference:

1. `app/renderer/agent-dom.js:158` already declares a top-level `const api`, and the renderer log
   confirms it loads at line 26 — **before** the Dockview scripts at lines 51-55.
2. Both policy modules also declared a top-level `const api`.
3. Classic browser scripts share **one** global lexical environment, so the second and third
   `const api` are redeclarations that fail at **parse** time. Neither policy module ran a single
   statement, and neither published its global.
4. Node/CommonJS never saw this: `require` gives every file its own module scope. That is why
   1,850 assertions passed over code that could not start.
5. `dockview-prototype.js` used the short-circuit fallback to `require`. With the globals missing,
   it **evaluated `require`**, which is intentionally absent under `nodeIntegration: false`.
6. Script-element `onload` fires on **fetch**, not on successful parse and publication — so
   `app.js` believed the chain had loaded.
7. `app.js` created `.dockview-prototype-root` (`position: fixed; inset: 0; z-index: 9000;` opaque
   background) **before** confirming activation, so a dead prototype covered a working application.

### The correction

| Concern | Round-3 shape | `35da2e3` |
| --- | --- | --- |
| Policy-module scope | top-level `const api` in the shared global environment | **whole module enclosed in an IIFE** — nothing reaches global scope, so a future top-level name cannot collide either |
| Environment selection | short-circuit fallback that reached `require` | `module` is tested **first** and short-circuits; the browser path never names or evaluates `require` |
| Dependency timing | resolved at module load; a miss killed the script | resolved inside `activate()`; a miss is a bounded `policy-modules-missing` refusal |
| Load proof | script `onload` treated as success | every required export **verified by member**, in both `app.js` and `bootstrap()` |
| Overlay lifecycle | root created, then activation attempted | verify, then create root, then activate in an error boundary, then publish only on `ok === true`; any failure removes the root it created |
| Failure reporting | echoed the exception message | one bounded, content-free reason; no exception text, path, source, or state |
| Floating promise | bare call | `.catch(...)` — no unhandled rejection can survive |

### The gate that would have caught it — and demonstrably does

`app/dockview-bootstrap.test.js` drives `app/dockview-bootstrap-harness.js` + `.html`: a real
Electron renderer with `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, its own
session partition, every non-`file://` request cancelled, and a CSP stricter than the app's
(`default-src 'none'; connect-src 'none'`). It loads the **real** files as **real classic scripts**
in the **real order**, with `renderer/agent-dom.js` **first** — without that pre-existing
`const api` the collision does not occur and the gate would prove nothing. It installs
`window.onerror` / `unhandledrejection` capture and a **`require` tripwire** before any chain script,
then drives the **real** `bootstrap()` through six failure paths and the success path.

**Negative control, run both ways with an identical harness:**

| Tree | Result |
| --- | --- |
| `8663467` (round-3 code) | **57 passed / 30 failed, exit 1** — reproduces `Identifier 'api' has already been declared` (x2), `require is not defined`, all four missing exports, no banner, **0 of 6** controls |
| `35da2e3` (round 4) | **87 passed / 0 failed, exit 0** |

The three reverted files were restored from the commit and re-verified by SHA-256 afterwards; the
worktree is clean.

### The vendor-only tripwire is untouched

`app/dockview-tripwire.js` and `.html` are **byte-identical** to `1b23799`. They still load only the
vendor bundle, so network behaviour remains attributable to Dockview rather than to our integration
code. The new bootstrap harness is deliberately a **separate** entry point, page, and session
partition, and is reachable from neither `main.js` nor `index.html`.

### Round-4 file scope

Production (4): `app/renderer/dockview-fit-policy.js` · `app/renderer/dockview-panel-policy.js` ·
`app/renderer/dockview-prototype.js` · `app/renderer/app.js`.
Tests/harness (4): `app/dockview-bootstrap-harness.js` · `app/dockview-bootstrap-harness.html` ·
`app/dockview-bootstrap.test.js` · `app/dockview-default-path.test.js`.
Build (1): `app/package.json` — the `test` script only, so the new gate is reached by `npm test`.

`app/dockview-default-path.test.js` was modified on a **concrete failing test**, as § 12 requires:
its assertion `boot() calls the dormant seam exactly once` matched a literal bare call, which the
mandatory `.catch` changes. The assertion was **tightened**, not relaxed — it now requires the
`.catch` — and 37 assertions were added.

Verified **byte-identical to `1b23799`** by blob hash: `app/main.js` · `app/preload.js` ·
`app/package-lock.json` · `app/dockview-layout-store.js` · `app/dockview-tripwire.js` ·
`app/dockview-tripwire.html` · `app/renderer/index.html` · `app/renderer/styles.css` ·
`docs/OSS-PROCUREMENT-dockview.md` · `BLUE-HELM-MASTER-STATUS.md` · `scripts/merge-gate.ps1`.
No dependency changed, no `npm audit fix` was run, and no vendor file was touched.

### Round-4 gates, as run

| Gate | Result |
| --- | --- |
| **New real-browser bootstrap gate** | **87 passed / 0 failed** (fails 30 against `8663467`) |
| Focused policy tests | fit-policy **59/0** · panel-policy **71/0** |
| Focused lifecycle suite | **119 passed / 0 failed** |
| Default-path suite | **103 passed / 0 failed** (was 66) |
| App (`npm test`) | **1974 passed / 0 failed**, **44 suites**, **exit 0** |
| Pester | **955 passed / 0 failed / 0 skipped**, exit 0 |
| Vendor-only tripwire | `ok: true` · `dockviewVersion: 7.0.4` · `loadedUnderStrictCsp: true` · **`remoteRequestCount: 0`** |
| Test reachability | 6/6 Node · Pester family green · the new gate is an exact wired token, not an orphan |
| Node `--check` | clean on all 7 touched/added JS files |
| PowerShell parse | 71 files, 0 errors |
| `git diff --check` | clean |
| Package-lock | byte-identical |
| Prototype layout file | **absent before and after** every automated gate |
| Provider activity | none |

**App-gate reconciliation, exactly:** 1850 to 1974 = **+124**, being **+87** for the new
`dockview-bootstrap` suite and **+37** for `dockview-default-path` (66 to 103). Suites 43 to 44 = the
one new suite. No other suite's count changed.

### Round-4 disclosures

1. **The two policy-module diffs are dominated by re-indentation.** Wrapping each module in an IIFE
   indents its whole body, so the raw diff looks like a rewrite. It is not: `git diff -w` shows
   **+9 lines each** (the explanatory comment plus the wrapper), and the Node suites for both
   modules pass unchanged at 59/0 and 71/0. Review these two files with `-w`.
2. **`app.js` verifies the exports and `bootstrap()` verifies them again.** This is deliberate
   defence in depth, not an oversight: the `app.js` check catches a chain that published no adapter
   at all, and the `bootstrap()` check catches a partially-published one and is what the browser
   gate can drive directly. Both are tested.
3. **The three residuals disclosed in § 9 are unchanged and still open** — the `useDefaultLayout()`
   load-failure branch, the two pre-existing ungated resize senders in `app.js`, and
   `ownedPaneIds()` as a read-only diagnostic. Round 4 was scoped to the browser bootstrap and did
   not touch them.
4. **`window.ccDockviewPrototypeInstance` remains a renderer global** (`app.js`), unchanged from
   round 3. Round 4 additionally guarantees it is **never** published on a failed bootstrap.

**§ 6 human acceptance must now be re-run from the beginning, against `35da2e3`, starting from the
normal `npm start` control — and only after a review of round 4 returns PASS.**

**No human acceptance. No adoption verdict. No provider request. Not merged. Not pushed.**

---

## 12. Round-5 reviewability correction — `3e338d9`

Round 5's implementation (`bebe1bf`) was complete and its gates were green, but the artifact pinned
for review was **not a faithful record of it**. This section exists so that fact is not lost.

### The defect

`app/dockview-default-path.test.js` contained **exactly one literal NUL byte**, at byte offset
6,231, in the fallback of the Library-section lookup:

```js
const libStart = indexSrc.indexOf(libraryOpenTags[0] || '<NUL>');
```

The *intent* was sound. If the `#libraryPane` open tag were ever missing, the fallback had to be a
string that can never occur in HTML, so `libStart` would be `-1`, `librarySection` would be empty,
and all 15 canonical-control assertions would **fail** rather than silently pass. NUL has that
property structurally.

The *encoding* was not sound. A single NUL byte makes Git classify the entire file as binary, so
`git diff` refuses to show content and emits one line instead:

```
Binary files /dev/null and b/app/dockview-default-path.test.js differ
```

The file Git was hiding is the one that pins **predeclared kill criterion § 5.10** — that a default
`npm start` never imports, initializes, or is affected by Dockview. The artifact therefore concealed
precisely the evidence a reviewer most needs, while looking complete: 25 of 26 files rendered
normally and the single marker was easy to scroll past.

**This was invisible to every gate on the branch.** The suite passed 152/0 the whole time, because
`readFileSync(path, 'utf8')` decodes the NUL into an ordinary-looking string. Nothing in the test
run inspects the bytes Git actually sees. The defect was only ever observable in the artifact.

### The correction

Test-only, one file.

1. **Printable sentinel.** The NUL is replaced by `'__missing_library_open_tag__'`. A printable
   sentinel is not *structurally* impossible in HTML the way NUL is, so the never-matches property
   is now **proven rather than assumed**: a guard aborts if that string ever appears in
   `index.html`. The guarantee is preserved at equal strength, not weakened.

2. **A byte-level self-check.** The suite reads its **own file as raw bytes** via `__filename` and
   aborts, naming the offset, if any NUL is present. Reading bytes is the entire point — decoding is
   what masked the defect. A companion check proves the detection is not vacuous by running the
   identical test against a buffer built from **numeric byte values** (`[0x61, 0x00, 0x62]`), so the
   file needs no escape sequence and cannot reintroduce the byte it is checking for.

**Both new checks are fail-fast guards, not counted assertions.** Two reasons. A reviewability
violation should abort before printing results the artifact cannot display anyway. And it keeps the
suite total pinned, so the count remains usable as a regression control — which is what let the
`2099/0` reconciliation below be exact rather than approximate.

No behavioural assertion was weakened, deleted, or reworded. No production code, dependency,
package, IPC, PTY, layout-store, provider, or runtime behaviour changed.

### Proof

| Check | Result |
|---|---|
| NUL bytes in the file | **0** (was 1, at offset 6,231) |
| Git classification | **textual** — `git diff --numstat` reports `539  0`, not `-  -` |
| Hunks in the artifact | complete; **539 insertions** shown |
| `node --check` | passes |
| Guard negative control | a NUL-injected copy aborts **exit 1**, reporting offset 60 |
| `dockview-default-path` | **152 passed, 0 failed** — unchanged |
| App gate | **2099 passed, 0 failed, 44 suites** — unchanged |
| Pester | **955 passed, 0 failed, 0 skipped** — unchanged |
| Reachability | `test-reachability` 6/0, clean |
| `git diff --check` | clean |
| Artifact regeneration | byte-identical |

**App-gate reconciliation.** Summing the 44 suites gives 2081, not 2099, because **two suites report
in a different format** — `renderer/audio-module-health.test.js` and
`renderer/tts-audio-contract.test.js` each print `9 assertions passed` rather than
`N passed, M failed`. 2081 + 9 + 9 = **2099**. Anyone re-running this gate with a naïve
`N passed, M failed` parser will get 2081/42 and should not read that as a regression.

### One thing this correction cannot fix

`git diff 1dd2bf5 3e338d9` — the **isolated** fix commit — still renders as
`Bin 32307 -> 35438 bytes`. That is unavoidable and correct: Git falls back to binary output when
*either* side is binary, and the pre-fix blob is the binary one. That blob is the defect.

The consequence is that **the isolated correction commit cannot be reviewed from its own diff.**
Review it from `.agent-review-dockview-prototype-r5-final.diff`, where the file appears in full
because it does not exist at the `1dce24c1` base. To see the change alone, compare the blobs
directly:

```
git show 1dd2bf5:app/dockview-default-path.test.js > old.js
git show 3e338d9:app/dockview-default-path.test.js > new.js
diff -u old.js new.js
```

That yields 494 lines to 540 lines — **39 lines added, 1 removed** (the sentinel line).

### Status of round 5

- Reviewed code tip: **`3e338d9686114604036b0572a14f3f3866bc9617`**
- Artifact reviewed: **`.agent-review-dockview-prototype-r5-final.diff`**
- **Round 5 returned `VERDICT: PASS`** from an independent Full-class review. Human acceptance was
  then performed against it and found one defect — see § 13.

---

## 13. Round 6 — the audio-toolbar reachability correction, `be4422d`

### The human-acceptance result, in full

Round 5's independent Full-class review returned, literally:

> VERDICT: PASS

Human acceptance was then performed against `3e338d9`. **Everything below passed:** the normal
renderer path · Add Library, duplicate focus/refusal, close/re-add · restore with no saved layout
creating nothing · Create Default Workspace idempotency · save, rearrange, restore · split and
window resize with terminal interactivity · terminal close convergence · Clear Saved Layout
semantics · and **Copy Output in both moved and unmoved panes**, including controlled-selection and
whole-buffer tests. **Copy Output is not a defect and Round 6 does not touch it** — its source and
its test suite are byte-identical to `e23499a`.

**One thing failed: Dictate was unreachable in prototype mode.**

The app-owned `.tts-controls` surface — carrying `#audioBuild`, `#sttStatus`, `#sttMic`,
`#ttsStatus`, `#ttsStop`, `#ttsVoice`, and `#ttsSpeed` — stayed in the Terminals `.term-bar`, while
`.dockview-prototype-root` (`position: fixed; inset: 0; z-index: 9000`, opaque background) covered
the whole viewport. The controls were present in the DOM and impossible to click. That is the
predeclared kill criterion covering TTS and Dictate after docking (§ 5.8), and § 4's row 8 is
updated accordingly: it **did fire**, and is now corrected rather than still unobserved.

### The correction

The prototype **reparents that exact element** into a dedicated audio slot inside its own root.

**Moved by object identity — never cloned, proxied, or reimplemented.** A clone would carry none of
the handlers `setupSTTControls`/`setupTTSControls` and the `ccSTT`/`ccTTS` modules bind, and a proxy
button would be a *second* Dictate implementation whose destination locking could diverge from the
real one. `dockview-default-path.test.js` asserts the seam contains no `cloneNode`, no
`dispatchEvent`, no synthesized `.click()`, and no reference to `ccSTT`/`ccTTS` at all — the adapter
never learns what the element is, only that it is one opaque node to borrow and give back.

| Concern | Shape |
| --- | --- |
| Slot placement | a **sibling** of the Dockview surface, never a panel and never inside one — so splitting, grouping, tabbing, hiding, moving, and restoring panes cannot affect reachability |
| Original position | a placeholder comment records the exact **index** among `.term-bar`'s children (`#newTermShell` follows the controls, so the parent alone is not enough) |
| Restoration handle | a **held element reference**, not a document query — the element is detached from its query-able position while docked |
| Preflight | the surface is counted **before any DOM mutation**; `audio-controls-missing` / `audio-controls-duplicated` refuse having built nothing and moved nothing |
| Attach ordering | the **final** activation step, after `createDockview` and all four event subscriptions, so no remaining initialization can throw while the controls sit inside a root the bootstrap is about to delete |
| Failed attach | rolls back, disposes the Dockview instance this activation created, refuses `audio-controls-dock-failed` |
| Disposal | undocks **first**, before anything else |
| Bootstrap refusal | `refuse()` returns the controls **before** removing the root — the ordering is the whole point |

Duplication is refused rather than tolerated because a second `.tts-controls` means duplicate
element IDs, and `$('#sttMic')` would then wire whichever copy came first.

**Dictation destination locking is untouched.** The lock keys off `activeTermId`, which is renderer
state, not DOM position, so moving the controls cannot redirect a transcript. The finalized
transcript still resolves against the pane locked at recording **start** through the existing
`window.ccSttTargetLock.resolveTranscriptDelivery` policy. `renderer/stt-target-lock.test.js` passes
**11/11 unchanged**, alongside `stt-bootstrap` 47/47, `tts-selection` 27/27, `audio-module-health`
9/9, `tts` 36/36, and `stt` 19/19 — all unmodified.

### `index.html` required no production change

The work order expected this and it held: `.tts-controls` and its seven IDs were already a unique,
stable anchor, so unlike the Library seam this one needed no added id. `app/renderer/index.html` is
**byte-identical to `e23499a`**, and the default-path suite asserts the surface still carries no
prototype-only id and no Dockview attribute.

### The live negative control

The real-Electron harness **reproduces the observed failure before proving the fix**. With a
full-screen `.dockview-prototype-root` present and the controls left in the toolbar — the exact
pre-correction geometry — `#sttMic` is measurably unreachable: `elementFromPoint` at the button's
own centre returns the overlay, not the button. Only then does the corrected path run, and the
genuine button becomes the topmost element at its own centre.

Without that step, "the button is reachable after the fix" would prove nothing about the bug. The
harness drives `.tts-controls` **extracted from `app/renderer/index.html` at run time** and
hard-fails if it is missing, duplicated, or short any of the seven controls — there is no copied
fixture. The same disclosure as the Library applies: the harness page carries a copy of the real
`.tts-controls`, `.term-bar`, `.dockview-prototype-root`, and `.dockview-prototype-audio` CSS
(a separate page cannot load `styles.css` under its stricter CSP), and
`dockview-default-path.test.js` pins production and harness to each other so they cannot drift.

Also proven in a real renderer: a listener bound **before** the move fires exactly once after it;
every control stays findable by `getElementById` so late `ccSTT`/`ccTTS` initialization still wires
it; status text, the recording class, Stop visibility, voice, and speed all survive; disposal
returns the identical object to its exact original index; and every failure path leaves exactly one
connected surface in the toolbar with no orphan placeholder.

### Round-6 file scope

Production (3): `app/renderer/app.js` · `app/renderer/dockview-prototype.js` ·
`app/renderer/styles.css`.
Tests/harness (5): `app/dockview-bootstrap-harness.js` · `app/dockview-bootstrap-harness.html` ·
`app/dockview-bootstrap.test.js` · `app/dockview-default-path.test.js` ·
`app/renderer/dockview-adapter-lifecycle.test.js`.

Verified **byte-identical to `e23499a`** by blob hash: `app/main.js` · `app/preload.js` ·
`app/package.json` · `app/package-lock.json` · `app/dockview-layout-store.js` ·
`app/renderer/index.html` · `app/renderer/term-copy.js` · `app/renderer/term-copy.test.js` ·
`app/renderer/stt-target-lock.js` · `app/renderer/stt-target-lock.test.js` ·
`app/dockview-tripwire.js` · `app/dockview-tripwire.html` · `docs/OSS-PROCUREMENT-dockview.md` ·
`BLUE-HELM-MASTER-STATUS.md` · `scripts/merge-gate.ps1`.

No dependency changed, no `npm audit fix` was run, no vendor file was touched, and no IPC, PTY,
clipboard, Library, credential, provider, microphone-permission, STT/TTS engine, model, or
worker/bootstrap code changed.

### Round-6 gates, as run against the committed tree `be4422d`

| Gate | Result |
| --- | --- |
| Focused bootstrap suite | **205 passed / 0 failed** (was 111) |
| Focused lifecycle suite | **208 passed / 0 failed** (was 171) |
| Default-path suite | **209 passed / 0 failed** (was 152) |
| Existing audio suites | stt-target-lock **11/11** · stt-bootstrap **47/47** · tts-selection **27/27** · audio-module-health **9/9** · tts **36/36** · stt **19/19** — all unmodified |
| Copy Output / maximize | term-copy **53/53** · pane-maximize **39/39** — both unmodified |
| App (`npm test`) | **2287 passed / 0 failed**, **44 suites**, **exit 0** |
| Pester | **955 passed / 0 failed / 0 skipped**, exit 0 |
| Reachability | `test-reachability` **6/0** |
| Node `--check` | clean on all 6 touched JS files |
| PowerShell parse | 71 files, 0 errors |
| `git diff --check` | clean |
| Dockview vendor tripwire | `ok: true` · `dockviewVersion: 7.0.4` · `loadedUnderStrictCsp: true` · **`remoteRequestCount: 0`** |
| Saved-layout acceptance evidence | **byte-identical** — 1,653 bytes, SHA-256 `D49D616FEE7F1569611C7F0C9631EEEE50AE70AF3E0AC85DF6B43D640DDBD477`, schema 1, `dockview` 7.0.4 |
| Provider activity | none |

**App-gate reconciliation, exactly:** 2099 to 2287 = **+188**, being **+94** for
`dockview-bootstrap`, **+57** for `dockview-default-path`, and **+37** for
`dockview-adapter-lifecycle`. Suites remain **44** — no suite was added, so no `app/package.json`
reachability entry was needed. As recorded in § 12, a naïve `N passed, M failed` parser will read
2269/42 because `renderer/audio-module-health.test.js` and `renderer/tts-audio-contract.test.js`
each print `9 assertions passed` instead; 2269 + 9 + 9 = **2287**.

### Round-6 disclosures

1. **The lifecycle and bootstrap fake hosts gained the audio contract**, because activation now
   preflights it and would otherwise refuse in every existing scenario. This is a fail-closed
   preflight by design: a host that does not implement `audioControlsCount` counts as zero and
   refuses. The pre-existing lifecycle assertions were re-run unchanged at **171/0** before the new
   Round-6 blocks were added, so the correction demonstrably did not alter existing behaviour.
2. **`undockAudioControlsElement` has a last-resort branch.** If the placeholder is ever detached,
   the exact index is unrecoverable, and it re-attaches to the remembered parent instead and says so
   in the Logs tab. Losing the exact position is strictly better than losing Dictate, TTS status,
   Stop, voice, and speed entirely. It is not reachable on any path in this branch; it exists so
   that no failure mode ends with the controls detached.
3. **The audio slot carries a static label** (`App audio (live controls)`). It is inert text in the
   prototype's own chrome and reads nothing from the app.
4. **The three residuals disclosed in § 9 are unchanged and still open** — the `useDefaultLayout()`
   load-failure branch, the two pre-existing ungated resize senders in `app.js`, and
   `ownedPaneIds()` as a read-only diagnostic. Round 6 was scoped to audio reachability.
5. **The § 7 registration item is still outstanding** — the six pre-existing advisories still need
   their own independently-authorized change against `main`. Unchanged by Round 6.

### Status of round 6

- Reviewed code tip: **`be4422d84bab4727d3bd11772f30d9a010069ed5`**
- Artifact to review: **`.agent-review-dockview-prototype-r6.diff`**
- All 14 prior commits (`a0c8551` … `e23499a`) verified still ancestors — no amend, reset, rebase,
  squash, or history rewrite. All six earlier artifacts preserved unchanged.
- `main == origin/main == 1dce24c141e929c04122e8b2998277d4c2d0c728`, untouched. Branch has **no
  upstream ref — never pushed.**

**Round 6 is UNREVIEWED.** The Round 5 PASS belongs to `3e338d9` and says nothing about Round 6.

### § 14 human acceptance must be re-run after a review returns PASS

Fully restart Electron, then: the normal-path control · prototype audio-control visibility ·
Dictate destination locking **before and after** pane movement and tab activation · TTS
selection/Stop/voice/speed · the Copy Output control · saved-layout restart and restore · and a
final normal-path control.

**No human acceptance. No adoption verdict. No provider request. Not merged. Not pushed.**
