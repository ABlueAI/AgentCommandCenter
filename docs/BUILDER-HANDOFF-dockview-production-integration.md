# Builder Handoff — Dockview Production Integration (Phase B)

Branch: `feature/dockview-production-integration`
Fork-point SHA: `1dce24c141e929c04122e8b2998277d4c2d0c728`
Pre-merge main SHA: `1dce24c141e929c04122e8b2998277d4c2d0c728`
Tip SHA: the docs commit that immediately follows `97394588c2017ea57b5f394b17edb773dc618106` (see § 3)
Merge commit SHA: Pending until merge

**Status: PHASE B GREEN — FINAL FULL-CLASS REVIEW NOT YET REQUESTED**

---

## 1. OSS procurement record and verdict

Tracked record: **`docs/OSS-PROCUREMENT-dockview.md`**

Blue's binding verdict, verbatim:

> ADOPT — Dockview: adopt dockview@7.0.4 as Blue Helm 1.0's production pane-layout engine using the
> reviewed prototype architecture. Preserve main-owned IPC, PTY, filesystem, credential, clipboard,
> Library, audio, and persistence authority; exclude popouts; persist only strictly validated
> versioned layout metadata; and keep pane-status indicators separate.

This branch implements only that verdict. It authorises implementation; it does not authorise
merge, push, human acceptance, or persistence (Phase C).

---

## 2. The incomplete `3ab0a23` checkpoint — recorded honestly

This branch already carried three commits when this continuation began:

| SHA | Subject |
| --- | --- |
| `f5a0e54` | docs(dockview): record Blue's ADOPT verdict and close out the prototype branch |
| `3a61e56` | feat(dockview-production): invert the layout flag in main, preload and the store |
| `3ab0a23` | feat(dockview-production): embed the layout engine and make the renderer coherent |

**`3ab0a23` was an incomplete checkpoint, and it was red.** It is retained unchanged as an ancestor
rather than rewritten, so the review history stays reproducible. What was actually wrong with it:

1. **The app gate did not pass.** `dockview-default-path` was 160/49, `dockview-bootstrap` was
   177/28, and `dockview-adapter-lifecycle` did not finish at all — it threw
   `TypeError: Cannot read properties of undefined (reading 'children')` at line 792, in an R6
   audio-slot assertion for a seam that commit had already deleted. Three suites still pinned
   prototype behaviour that the commit itself had superseded.
2. **Maximize routing was never wired.** The `.max` click handler still called
   `paneMaximizer.toggle(id, pane)` unconditionally, so clicking ⛶ on a Dockview-hosted pane ran
   the classic grid maximizer against a grid that was hidden. The adapter's `maximizePane` existed
   and was unreachable.
3. **Library navigation was never wired.** The Library tab still ran `switchTab('library')`, which
   activates a tabpane whose element is docked inside the (now hidden) Terminals workspace.
4. **The new-terminal transaction raced.** `cc.ptyStart(...)` was invoked BEFORE the Dockview
   adoption attempt, and a failed dock then called the full close path, which issues `cc.ptyKill`.
   `ptyStart` is asynchronous IPC, so the kill can be sent while main is still inside `pty.spawn`;
   main resolves `pty-kill` against its `ptys` map, and a handle not yet in that map cannot be
   killed. That ordering can leave an orphan ConPTY nothing in the app owns.
5. **Adoption rollback left panes with no resize owner.** Adoption calls
   `host.suspendAppResizeObserver(paneId)`, which disconnects the pane's app-owned
   `ResizeObserver`. The rollback disposed the adapter's fit controller and reparented the pane back
   to the grid, but never reconnected that observer — so a rolled-back pane looked correct and then
   silently stopped resizing forever.

Defects 4 and 5 are the two additional defects this continuation fixes; both are recorded again,
with their measurements, in § 6.

---

## 3. This continuation

Implementation commit: `97394588c2017ea57b5f394b17edb773dc618106`

This continuation is TWO commits, because a commit cannot contain its own SHA:

1. `97394588c2017ea57b5f394b17edb773dc618106` — all of the Phase-B code and tests below.
2. the immediately following `docs(dockview-production)` commit — this handoff, carrying that SHA.
   It is the branch tip and touches nothing but this file.

Intended invariant: **Dockview is the production pane-layout engine on the default launch, and
every ownership boundary it creates — resize, maximize, Library, PTY lifecycle — has exactly one
owner at every moment, with a visible, bounded refusal on every failure path.**

### File inventory

New:

| Path | What it is |
| --- | --- |
| `app/dockview-app-harness.js` | Real-Electron APPLICATION harness. Loads the real `renderer/index.html` through the real `preload.js` and drives the real `app.js`; only main is replaced, with counting IPC stubs. Ten scenarios. |
| `app/dockview-app-integration.test.js` | The production-truth gate. Consumes that harness's JSON report. **180 assertions.** |

Modified:

| Path | Change |
| --- | --- |
| `app/renderer/app.js` | Maximize routing by ownership (`maximizeDockedPane`, `refreshDockedMaximizeGlyphs`); Library navigation (`openLibraryInDock`, `focusLibrarySurface`, tab handler, `openReportForPane`); the pre-PTY launch transaction (`rollbackLocalPane`, dock-then-start ordering, `onStartFailed`); resize ownership (`resumeAppResizeObserver`, `paneData.roConnected`, `returnAllPanesToGrid`, the `suspend`/`resume` host ops); `resizeOwners()` on the read-only diagnostic. |
| `app/renderer/dockview-prototype.js` | `maximizePane` now refits through the owning path (`registry.scheduleAll()`); new read-only `isPaneMaximized`; corrected the `suspendAppResizeObserver` comment, which claimed panes never leave the adapter alive. |
| `app/main.js` | Comment only: named the two suites that actually prove the default path (it pointed at `dockview-production-path.test.js`, which does not exist). |
| `app/package.json` | Wired `dockview-app-integration.test.js` into the `test` script. |
| `app/dockview-default-path.test.js` | Rewritten to production truth. 209 → **295** assertions. |
| `app/dockview-bootstrap-harness.js` | Audio flow deleted with the seam; container is now the embedded `#terminalDock`; new `dock-container-missing` scenario; per-scenario overlay/fixed-position/audio-position census. |
| `app/dockview-bootstrap-harness.html` | Page rebuilt to mirror production: a real toolbar with `.tts-controls` above an embedded `#terminalDock`. The `position:fixed; inset:0; z-index:9000` overlay rule is gone. |
| `app/dockview-bootstrap.test.js` | Rewritten for the embedded surface. 205 → **182** assertions. |
| `app/renderer/dockview-adapter-lifecycle.test.js` | Three R6 audio sections removed; four new sections added. Was crashing; now **203** assertions. |
| `app/renderer/pane-maximize.test.js` | One assertion added: the ⛶ control reaches the grid controller ONLY for a pane the layout engine does not own. 39 → **40**. |

Nothing else in the repository was touched. No PowerShell changed, so the Pester total is unchanged.

### Security-sensitive surfaces touched

* **PTY lifecycle** — the ordering of `pty-start` relative to Dockview adoption changed, and a
  failed start now converges on the existing single close path. `cc.ptyStart` and `cc.ptyKill` each
  still appear **exactly once** in `app.js`; there is no second terminal implementation.
* **No new IPC channel, no new preload member, no new main-process handler.** The adapter still
  cannot reach `cc.*` at all — pinned in `dockview-default-path.test.js`.
* **No credential, path, prompt, or report content** crosses into Dockview. Panel payloads remain
  the three allowlisted fields.

---

## 4. Exact gate results

### Focused suites

| Suite | Result |
| --- | --- |
| `node app/test-reachability.test.js` | 6 passed, 0 failed |
| `node app/dockview-package-identity.test.js` | 47 passed, 0 failed |
| `node app/dockview-layout-store.test.js` | 124 passed, 0 failed |
| `node app/dockview-default-path.test.js` | **295 passed, 0 failed** |
| `node app/dockview-bootstrap.test.js` | **182 passed, 0 failed** |
| `node app/dockview-app-integration.test.js` | **180 passed, 0 failed** |
| `node app/renderer/dockview-fit-policy.test.js` | 59 passed, 0 failed |
| `node app/renderer/dockview-panel-policy.test.js` | 71 passed, 0 failed |
| `node app/renderer/dockview-adapter-lifecycle.test.js` | **203 passed, 0 failed** |
| `node app/renderer/pane-maximize.test.js` | **40 passed, 0 failed** |
| `node app/renderer/library-view.test.js` | 36 passed, 0 failed |
| `node app/renderer/report-followup.test.js` | 40 passed, 0 failed |
| `node app/renderer/term-copy.test.js` (Copy Output) | 53 passed, 0 failed |
| `node app/renderer/clipboard-consumer.test.js` | 30 passed, 0 failed |
| `node app/library-ipc.test.js` | 30 passed, 0 failed |
| `node app/renderer/stt-target-lock.test.js` (STT lock) | 16 passed, 0 failed |
| `node app/renderer/stt.test.js` | 19 passed, 0 failed |
| `node app/renderer/tts.test.js` | 47 passed, 0 failed |

### Full gates

| Gate | Command | Result |
| --- | --- | --- |
| App gate | `npm test` (in `app/`) | **GREEN — 2,508 assertions, 0 failed**, across 43 suites |
| Pester gate | `scripts/run-pester.ps1` | **GREEN — 955 passed, 0 failed, 0 skipped**, 35 suites, 154.91s |
| Reachability | `node app/test-reachability.test.js` + `scripts/test-reachability.Tests.ps1` | GREEN — the new suite is wired into `app/package.json`'s `test` script |
| Node syntax | `node --check` on all 19 changed/new `.js` files | GREEN |
| PowerShell parsing | `[Parser]::ParseFile` over every tracked `.ps1`/`.psm1` | **0 parse errors** |
| Whitespace | `git diff --check` and `git diff 1dce24c1...HEAD --check` | clean |
| Package identity | `node app/dockview-package-identity.test.js` | 47 passed, 0 failed; `dockview` pinned to exactly `7.0.4` |
| No-React | `dockview-package-identity.test.js` | GREEN — the vendored bundle is the framework-free build; no React dependency is introduced |
| Dockview network tripwire | `npm run dockview:tripwire` | **`remoteRequestCount: 0`** — only `file:` mainFrame ×1 and script ×1 |
| Application-harness network census | `dockview-app-integration.test.js` | **`remoteRequestCount: 0`** across all ten scenarios (375 `file:` requests, 0 remote) |

### Assertion-count reconciliation

The app gate was RED at `3ab0a23`, so the baseline is the sum of what each suite reported before
`npm test` aborted, plus the downstream suites' unchanged totals.

| Suite | `3ab0a23` | now | Δ | Why |
| --- | --- | --- | --- | --- |
| `dockview-default-path` | 209 (160✓/49✗) | 295 | **+86** | Prototype-era claims replaced with production truth; new sections for the launch transaction, resize ownership, maximize routing, Library navigation, and the audio/overlay/flag negative controls. |
| `dockview-bootstrap` | 205 (177✓/28✗) | 182 | **−23** | The entire R6 audio borrow/restore flow (61 assertions) is deleted with the seam. Added: the `dock-container-missing` scenario, a per-scenario no-overlay census, a per-scenario audio-never-moves census, and the embedded-success assertions. |
| `dockview-adapter-lifecycle` | 176 executed (173✓/3✗), then crashed | 203 | **+27** | Three R6 audio sections removed; four added — no-audio-contract, maximize via the verified panel API, maximize refusal, one-way ownership transfer. |
| `dockview-app-integration` | — | 180 | **+180** | New suite. |
| `pane-maximize` | 39 | 40 | **+1** | The ownership-routing half of the ⛶ contract. |
| all other suites | 1,301 | 1,301 | 0 | Untouched. |
| **Total** | **2,237** (80 failing) | **2,508** (0 failing) | **+271** | Sum of the deltas above: 86 − 23 + 27 + 180 + 1 = **+271**. ✔ |

---

## 5. Negative controls

Each control was run by checking out the implementation that actually had the defect into a
throwaway detached worktree, copying the new suites in, and running them. Both worktrees were
removed afterwards; `git worktree list` is back to its prior 24 entries.

| # | Negative control | Prior implementation | Result — the control DOES fail against it |
| --- | --- | --- | --- |
| 1 | **Old flag polarity** | `a78a3e4` (prototype tip) | `dockview-default-path` **185✓/110✗**. Named failures: main.js and preload.js still know `--dockview-prototype`, `--cc-dockview-prototype` and `dockviewPrototypeEnabled`; "none of the prototype-era opt-in identifiers survive in app.js". |
| 2 | **Fixed / full-screen overlay** | `a78a3e4` | Source: "no renderer code creates or looks for a `.dockview-prototype-root`", "index.html has EXACTLY ONE `#terminalDock` (found 0)", "styles.css lays the dock out as an in-flow flex child". Real renderer: `dockview-bootstrap` **145✓/31✗** — "the Dockview surface is built INSIDE #terminalDock" fails. |
| 3 | **Audio reparenting** | `a78a3e4` | Source: 11 named failures on `AUDIO_CONTROLS_SELECTOR`, `dockAudioControls`, `undockAudioControls`, `audioControlsCount`, `isAudioControlsDocked`, `audioDockedElement`. Behavioural: `dockview-adapter-lifecycle` fails at its first assertion, "the adapter activates" — the prototype adapter refuses with `activation-refused:audio-controls-missing` against a host that implements no audio contract, which is exactly the point. |
| 4 | **Dual resize ownership** | `a78a3e4` | "the global grid fitter SKIPS docked panes — otherwise a hosted pane would have two fitters" fails: the prototype's `fitAllTerms` fits every pane unconditionally. |
| 5 | **Adoption rollback without grid-observer restoration** | `3ab0a23` | **Behavioural.** In the `adoptionRollback` scenario a real geometry change after the rollback produced **1** `pty-resize` for **2** panes (correct: 2 — one per pane). One rolled-back pane had no resize owner at all. Plus 7 named source failures: `resumeAppResizeObserver` absent, `ro.observe()` count 1 instead of 2, no hand-back in `returnAllPanesToGrid`. |
| 6 | **`ptyStart` before successful Dockview adoption** | `3ab0a23` | **Behavioural**, under 400 ms delayed `pty-start` IPC: `ptyStart: ["pty1","pty2"]` (correct: `["pty1"]`). Source: "THE ORDERING: adoption is attempted BEFORE ptyStart" fails. |
| 7 | **Non-transactional adoption failure** | `3ab0a23` | **Behavioural**, same run: `ptyKill: ["pty2"]` (correct: `[]`). The refused pane was started and then killed — the exact race. Source: 7 failures for the missing bounded pre-PTY rollback. |

Aggregate against `3ab0a23`: `dockview-default-path` **259✓/36✗**; `pane-maximize` **39✓/1✗**;
`dockview-adapter-lifecycle` aborts with `TypeError: instance.isPaneMaximized is not a function`;
`dockview-app-integration` fails at the `library` scenario (`Cannot read properties of undefined
(reading 'group')`) because the Library tab never docks there.

---

## 6. The two additional defects fixed

### 6.1 The pre-PTY docking transaction

**Before (`3ab0a23`):** `cc.ptyStart(...)` → attempt `layoutInstance.addPane(id,'terminal')` → on
failure call `closeThisPane()`, which issues `cc.ptyKill(id)`. `ptyStart` is asynchronous IPC, so
the kill can be sent while main is still inside `pty.spawn`; main resolves `pty-kill` against its
`ptys` map (`const p = ptys.get(id); if (p) …`), and a handle not yet in that map is silently not
killed. The result is an orphan ConPTY the app cannot see, reach, or close.

**After:** the renderer-owned pane is built and registered, adoption is attempted, and only then is
`ptyStart` invoked — exactly once. A failed adoption runs `rollbackLocalPane`, a bounded local undo
that disposes the xterm, removes the element, deletes the `terms` entry, disconnects the pane's
observer, and invokes **neither** `ptyStart` **nor** `ptyKill`, because nothing was ever started.
A `ptyStart` that rejects or returns `{ ok: false }` converges on the single close path, removing
the Dockview panel with it.

**Measured** (`newPaneTransaction` scenario, `pty-start` delayed 400 ms — the exact race window):
zero `ptyStart`, zero `ptyKill`, zero live panes, zero Dockview panels for the refused pane; no
pane parked in the hidden grid and no empty panel shell.

### 6.2 Grid-observer restoration after rollback

**Before (`3ab0a23`):** adoption calls `host.suspendAppResizeObserver(paneId)`, which disconnects
the pane's app-owned `ResizeObserver`. On rollback the adapter's fit controller is disposed and the
pane is reparented into `#terminalGrid` — with no owner left. The pane looks correct and never
resizes again.

**After:** `resumeAppResizeObserver(paneId)` is a narrowly scoped host operation that reconnects
the **existing** observer (`t.ro.observe(body)`), never a second one, guarded by `t.roConnected` so
it cannot subscribe twice, and refusing visibly if the terminal body is missing.
`returnAllPanesToGrid` now reparents **and** hands ownership back for every pane, then performs one
bounded refit for the whole transition. The adapter never calls resume itself — handing ownership
back is the app's decision, taken only on rollback.

**Measured** (`adoptionRollback` scenario, the full `grid owner → Dockview owner → failed
multi-pane adoption → grid owner` transition): stage 1 (grid) produced 2 `pty-resize` for 2 panes;
after the rollback a real geometry change again produced **2** for 2 panes — one per pane, not zero
(no owner) and not four (two owners). The log confirms stage 2 really happened: `rolling back 1
adopted pane(s)`.

### A note on how far the ownership claim is measured

Ownership at the *grid* stages is proven behaviourally: one geometry change, one `pty-resize` per
pane, with zero and two both being distinguishable failures. Ownership at the *hosted* stage is
reported by `ccDockviewDiagnostics.resizeOwners()` and pinned structurally — `ro.disconnect()`
appears in exactly three places, `ro.observe()` in exactly two, `new ResizeObserver` exactly once
per pane, and `fitAllTerms` skips docked panes. A purely behavioural discriminator does not exist
at that stage: with two owners attached the first fit changes the geometry and the second finds it
already correct, so the message count is identical either way. This is stated rather than papered
over.

---

## 7. Retained prototype-era internal names

Deliberately unchanged on this branch, and recorded here for a later mechanical cleanup:

* `app/renderer/dockview-prototype.js` — the adapter's filename.
* `window.ccDockviewPrototype` — the adapter's browser export.
* The CSS class family `.dockview-prototype-surface`, `.dockview-prototype-pane-host`,
  `.dockview-prototype-controls`, `.dockview-prototype-status`.
* The placeholder comment text `dockview-prototype: Library home`.

None of these are user-visible. Renaming them would add a large mechanical diff on top of an
already-large semantic change and make the review harder, not easier. The class names are pinned by
tests, so a rename is a single coordinated change whenever it is scheduled.

---

## 8. Manual verification

None performed. **Human acceptance has not been launched and is not requested by this handoff.**
The application harness drives the real renderer, but it is an automated gate, not acceptance.

---

## 9. Known limitations

* **Phase C (layout persistence) is not implemented.** The three persistence controls render
  DISABLED with an explicit reason and `data-phase="c"`. `saveLayout` / `restoreLayout` /
  `resetLayout` exist in the adapter and are exercised by tests, but nothing in the production UI
  can reach them. Starting the app performs zero layout save, load, or reset.
* **A second terminal added to the same group becomes a TAB**, and dockview detaches an inactive
  tab's content from the document. The pane, its xterm and its PTY stay alive and owned; only the
  element is parked. Counting `.term-pane` elements is therefore not a liveness signal under
  Dockview — the harness reads the app's own live-terminal count instead.
* **Escape does not exit a Dockview maximize.** `paneMaximizer.handleEscape()` is the classic grid's
  state machine and returns false for a hosted pane, so the key flows to the terminal as usual. The
  ⛶/🗗 button is the only maximize control for a hosted pane, and its title says so.
* **`switchTab` does not clear a Dockview maximize** when leaving the Terminals view, unlike the
  grid maximizer. A hosted maximize persists across tab switches, which is arguably correct but is
  a behavioural difference worth a reviewer's eye.
* **The application harness shows its windows.** Chromium suspends `ResizeObserver` delivery and
  `requestAnimationFrame` for a window that is never shown, and both resize owners are driven by
  that lifecycle — a hidden window reports zero resizes regardless of which owner is attached, so
  the measurement would be vacuous. Two windows appear briefly during the gate.
* **`BrowserWindow.destroy()` immediately after loading this document wedges the next window's
  navigation** (`ERR_FAILED`, reproduced in isolation). The harness therefore keeps two long-lived
  windows and reloads them between scenarios, which produces an equally fresh document.

## 10. Unexpected pre-existing findings

* `app/main.js` referenced `dockview-production-path.test.js`, a file that has never existed.
  Corrected to name the two suites that actually prove the default path.
* A hosted pane's single resize owner emits **two** `pty-resize` messages for one geometry change:
  xterm's own `onResize` plus the fit controller's post-fit `sendResize`. Harmless (main's resize is
  idempotent) and pre-existing, so it is pinned as a regression control rather than changed here.
* `app/renderer/styles.css` carries a pre-existing `position: fixed` rule for `.modal-backdrop`
  (the New Agent modal). The no-overlay negative control is scoped to the Dockview CSS block for
  that reason, rather than excusing the rule by name.

## 11. Recommended review focus

1. `openInAppTerminal`'s launch transaction ordering and `rollbackLocalPane`'s bounds — the highest
   consequence change, since it moves `ptyStart`.
2. `resumeAppResizeObserver` and `returnAllPanesToGrid` — whether `roConnected` can ever drift from
   the real subscription state.
3. `maximizeDockedPane` — that no path reaches `paneMaximizer` for a hosted pane, and that a
   refusal is a full stop.
4. `openLibraryInDock` and `focusLibrarySurface` — the `firstLoadRefresh: false` suppression, which
   exists to protect V3b's ordered Open Report algorithm.
5. `dockview-app-harness.js` — whether its two fault-injection seams (the session request filter
   and the `createDockview` wrapper) leave the application code genuinely untouched.

## 12. Review diff

`git diff main...<tip-sha> --output=.agent-review-dockview-production-integration.diff`

Reviewer verdict: Not yet requested.

Reviewer verdict source: n/a

## Review-diff rule

- Before merge, use `git diff main...<tip>`.
- After merge, reproduce the reviewed delta with
  `git diff <recorded-pre-merge-main>...<tip>`.
- `git diff main...<tip>` may be empty after merge because the branch tip is
  already an ancestor of `main`.
- Always use `--output`; do not use PowerShell `>` for pinned review diffs.
- Retain the literal `VERDICT: PASS|FAIL` line and identify the review that
  produced it. A paraphrase or implied verdict is not a merge-gate verdict.

Pinned `.agent-review-*.diff` files are local review artifacts and must remain gitignored.

---

**STATUS: PHASE B GREEN — FINAL FULL-CLASS REVIEW NOT YET REQUESTED**

Not started, and not authorised by this handoff: persistence Phase C, final review artifacts,
review request, human acceptance, merge, push.
