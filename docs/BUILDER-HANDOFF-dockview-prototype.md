# Builder Handoff — Dockview Bounded Prototype

Branch: `feature/dockview-prototype`
Worktree: `D:\Workspace\agent-command-center\.worktrees\dockview-prototype`
Fork-point / pre-merge `main` SHA: `1dce24c141e929c04122e8b2998277d4c2d0c728` (`main == origin/main` at branch creation)
Procurement-record commit: `a0c8551` — `docs/OSS-PROCUREMENT-dockview.md` only
Round-1 reviewed tip: `6315354` — **review returned `VERDICT: FAIL`**
Round-2 tip (fixes): `588ed85` — **awaiting a second review; no PASS exists yet**
Branch tip: this documentation-only handoff-tail commit above `588ed85`
Merge commit SHA: **not applicable — merge and push are NOT authorized**

Branch shape: `1dce24c1 → a0c8551 → 6315354 → e04fa4d → 588ed85 → (this handoff tail)`

> **STATUS: NOT REVIEW-CLEAN.** The independent Full-class review of `6315354` returned
> `VERDICT: FAIL`. Its blocking findings were verified and fixed in `588ed85`, but that fix commit
> **has not itself been reviewed**. This branch must not be treated as carrying a passing review.

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
| App (`npm test`) | **1362 passed / 0 failed**, 37 suites, exit 0 | **1759 passed / 0 failed**, 43 suites, exit 0 | +397 / +6 suites |
| Pester (`scripts\run-pester.ps1`) | **955 passed / 0 failed / 0 skipped** | **955 passed / 0 failed / 0 skipped** | unchanged |

(At the round-1 tip `6315354` the app gate was 1706/0 across 42 suites; the round-2 fixes added the
behavioural adapter suite and further assertions.)

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
- `app/renderer/index.html` is **unmodified**. Prototype scripts and the vendor bundle are injected
  dynamically, only after `window.ccDockview.enabled !== true` fails to return early.

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
| 8 | Move/tab breaks clipboard, Copy Output, TTS, Dictate, focus, PTY output, close, or Open Report | **Not yet observable** live; panes are reparented not recreated, and the adapter cannot reach `cc.*` at all |
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
now the honest reading of the persistence and close criteria too until § 14 is performed against
`588ed85`.

## 9. Pinned review artifact

Both artifacts are gitignored and local. Both were generated with `git diff --output=` (never
PowerShell redirection) and regenerated into a separate file and **byte-compared identical**.

**Round 1 — reviewed, `VERDICT: FAIL`**
`.agent-review-dockview-prototype.diff`

- Range: `1dce24c141e929c04122e8b2998277d4c2d0c728...6315354`
- Size: **172,014 bytes** · SHA-256 **`138F7BE022F660BFA634A40CD8E439E853ACE458E24FCF3BCBD19A3B03E79F21`**
- 20 files · 3,139 insertions · 3 deletions

**Round 2 — awaiting review**
`.agent-review-dockview-prototype-r2.diff`

- Range: `1dce24c141e929c04122e8b2998277d4c2d0c728...588ed85`
- Size: **216,125 bytes** · SHA-256 **`45F238F765308662AC00A3558D89186C60990B9243267F315A506D59E1932778`**
- 22 files · 3,843 insertions · 3 deletions
- Fix-only delta for a focused re-review: `git diff 6315354 588ed85` — 9 files, 731 insertions,
  27 deletions.
