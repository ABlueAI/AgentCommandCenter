# Builder Handoff — Dockview Production Integration (Phases B and C)

Branch: `feature/dockview-production-integration`
Fork-point SHA: `1dce24c141e929c04122e8b2998277d4c2d0c728`
Pre-merge main SHA: `1dce24c141e929c04122e8b2998277d4c2d0c728`
Phase-B implementation: `97394588c2017ea57b5f394b17edb773dc618106`
Phase-C implementation: `3ffb28e857aab5ae614cd05e418aa331a10f4b08`
Phase-C fail-closed correction: `d203b631b566c1cdb6ba2d645b4494f793aa9fab`
First Full-class reviewed-code tip: `fba57dc44b746b403ce870bd5496a30392b3a7df` — `VERDICT: FAIL`
Full-class corrective implementation: `9d1efb839a1f5312626c9445d35f3fa3b88d8d41`
Corrective reviewed-code tip SHA: pending the corrective finalization commit described in § C14
Branch tip: pending the immediately following handoff-only artifact tail
Merge commit SHA: Pending until merge

**Status: FULL-CLASS FAIL CORRECTED — FOCUSED FULL-CLASS DELTA REVIEW NOT YET REQUESTED**

This document has two parts. **PART ONE** (§§ 1–12) is the Phase-B record, preserved as written;
where Phase C superseded a Phase-B fact it is marked there and corrected in PART TWO.
**PART TWO** (§§ C1–C14) is Phase C, both corrective rounds, and finalization.

---

# PART ONE — PHASE B

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

---

# PART TWO — PHASE C: TRUSTED LAYOUT PERSISTENCE

## C1. What this phase is, and its commits

**Phase-C invariant: four honest production layout operations, and no layout operation can create,
close, restart, resume, or silently strand a PTY.** All state stays main-owned, bounded, versioned,
schema-validated, and content-free in logs. Nothing runs automatically at startup.

Same binding verdict as PART ONE § 1 — `docs/OSS-PROCUREMENT-dockview.md`, ADOPT dockview@7.0.4.

The original Phase-C delivery was two commits, because a commit cannot contain its own SHA:

1. `3ffb28e857aab5ae614cd05e418aa331a10f4b08` — all of the Phase-C code and tests below.
2. the immediately following `docs(dockview-production)` commit — this handoff, carrying that SHA.
   It touched nothing but this file.

Finalization then found one real fail-open verification gap. The corrective sequence is:

3. `d203b631b566c1cdb6ba2d645b4494f793aa9fab` — fail closed when the live Dockview panel list
   cannot be enumerated, with lifecycle tests for transient and persistent faults.
4. `fba57dc44b746b403ce870bd5496a30392b3a7df` — the reviewed-code finalization commit: this
   handoff plus `BLUE-HELM-MASTER-STATUS.md`, after all final Dockview/app gates pass and with the
   Pester environment limitation recorded exactly.
5. exactly one immediately following handoff-only tail commit — exact reviewed-tip SHA and the two
   pinned review-artifact ranges, sizes, and SHA-256 identities. This final commit is not part of
   either reviewed diff.
6. `83b8cfa1206ab21d07befcf0664c584eea64a379` — that handoff-only artifact tail.
7. Fresh independent read-only Full-class review of the cumulative artifact — literal
   `VERDICT: FAIL`; two MEDIUM findings and one LOW, recorded verbatim in § C14.
8. `9d1efb839a1f5312626c9445d35f3fa3b88d8d41` — the approved bounded correction for all three
   findings, with no unrelated production change.
9. the corrective reviewed-code finalization commit — this handoff plus
   `BLUE-HELM-MASTER-STATUS.md` after the final gates.
10. exactly one following handoff-only tail — refreshed artifact ranges, sizes, and SHA-256
    identities. The focused delta review must review item 8 through item 9, not either handoff tail.

Starting checkpoint, verified before any edit: branch tip `79829f3982232f052e564ee1db023246aa3080de`,
Phase-B implementation `9739458` present, `f5a0e54` / `3a61e56` / `3ab0a23` unchanged ancestors,
worktree clean, `main == origin/main == 1dce24c1`, no Electron process running, app baseline
**2,508/0** re-measured, Pester baseline **955/0/0**.

## C2. Shared-policy architecture

Phase B validated saved layout state in MAIN only. The renderer then handed main's output straight
to `fromJSON`. That is the gap Phase C closes — and the only honest way to close it is with the
SAME code on both sides, not a second implementation that can drift.

```
             app/dockview-layout-policy.js          <- THE one schema authority
             pure · no fs · no path · no Electron · no DOM · nothing at top level
                    |                                        |
        require()   |                                        |  <script src>
                    v                                        v
   app/dockview-layout-store.js                  window.ccDockviewLayoutPolicy
   (FILE boundary only: fixed path, byte                     |
    bound, lstat, reparse refusal, strict                    v
    UTF-8, atomic write) ------ main IPC ----->  app/renderer/dockview-prototype.js
                                                 validates immediately before EVERY fromJSON
```

* **One validator, proven by object identity.** `dockview-layout-store.js` re-exports the policy's
  actual function objects, and `dockview-layout-policy.test.js` asserts
  `store.validateLayout === policy.validateLayout` for all seven shared functions plus the reason
  set. It also evaluates the same source file in a bare VM with a `window` and no `module` — the
  renderer's exact environment — and checks that instance agrees with the CommonJS one on the real
  fixture and on a deliberately broken one.
* **Exactly one module defines the schema.** `dockview-default-path.test.js` scans all eight
  candidate files for `function validateLayout(` and asserts the list is exactly
  `["dockview-layout-policy.js"]`.
* **Bounded pure operations provided:** `validateLayout`, `validateEnvelope`, `buildEnvelope`,
  `paneIdsFromLayout` (validates first, then returns grid-ordered + sorted IDs from the SAME
  traversal), `comparePaneSets`, `canonicalPaneOrder`, `buildDefaultArrangement`, plus the closed
  `REASON` set, `REASON_CODES`, and every bound.
* **The renderer validates immediately before EVERY `fromJSON`.** `api.fromJSON(` appears exactly
  ONCE in the adapter, inside `applyValidatedLayout`, which validates first and returns a bounded
  reason instead of applying. That single call site serves all four apply paths: saved-layout
  restore, rollback to the pre-operation snapshot, Reset, and rollback after a failed reset.
* **A missing or unparsed policy is a refusal, not a degraded mode.** `ccDockviewLayoutPolicy` is a
  REQUIRED browser export, the script list loads it before the adapter, and the bootstrap harness
  drives a `missing-layout-policy` scenario that lands on the usable classic grid.

## C3. The four operation contracts

| Operation | Control id | Reads file | Writes file | Calls `fromJSON` | Can create/kill a PTY |
| --- | --- | --- | --- | --- | --- |
| Save Arrangement | `dvSaveArrangement` | no | yes | no | **no** |
| Restore Saved Arrangement | `dvRestoreArrangement` | yes | no | once (+ once on rollback) | **no** |
| Reset Current Arrangement | `dvResetArrangement` | **no** | **no** | once (+ once on rollback) | **no** |
| Clear Saved Arrangement | `dvClearSaved` | no | deletes only | **no** | **no** |

**Save** — `api.toJSON()` → validate through the shared policy → pane-ID set must exactly equal the
adapter's owned set → every owned pane must be mounted → only then main, which validates again
before writing. A refusal at any step never reaches the IPC, so a previously saved VALID arrangement
cannot be replaced by an incoherent one.

**Restore** — busy state → load → validate the WHOLE envelope again in the renderer → exact set
comparison → capture live pane records by object identity, the current layout, and the active pane →
validate the captured rollback layout (and refuse if it is unusable, because applying a change we
cannot undo is worse than not applying it) → ONE `fromJSON` → verify four things (every expected
pane mounted, no unexpected panel, every element the ORIGINAL object, terminal/Library ownership
counts unchanged) → refit through the Dockview owner → report. No retry, repair, fallback layout,
terminal creation, or continuation.

**Reset Current Arrangement** — the same transactional machinery applied to a layout computed from
the LIVE ownership map. No file is read, written, or deleted.

**Clear Saved Arrangement** — main's reset only. An already-absent file is a visible SUCCESSFUL
no-op, distinguished in the status by main's `existed` flag.

### The deterministic default arrangement (documented, and pinned in tests)

**A single horizontal row of groups, one pane per group, in canonical order, first pane active,
every node `size: 100`.**

* Canonical order: terminals by ASCENDING NUMERIC pane ID (so `pty2` precedes `pty10`, which a plain
  string sort gets wrong — pinned as its own negative control), then the Library singleton last.
* One pane per group, not one tabbed group: every live pane stays VISIBLE. A single tab group would
  be equally deterministic and would hide every pane but one, which reads as "the panes vanished".
* `size: 100` everywhere because dockview@7.0.4 lays out proportionally and re-normalises through
  `gridview.layout(width, height)` immediately after deserializing. The committed fixture confirms
  sizes need not sum to `width`: it carries two leaves of `size: 100` under a `width: 100` grid.
* `buildDefaultArrangement` is a pure function of the panes it is handed and self-checks its own
  output against the shared validator, so it cannot produce state the policy would then refuse.

**`useDefaultLayout()` is GONE, not disabled.** The prototype's control created two terminals and
the Library every time it ran. The identifier appears nowhere in the adapter, it is absent from the
instance surface, and the adapter never calls the host's terminal creator at all.

## C4. Exact live-pane equality (the § 3 matrix)

The two lists are derived INDEPENDENTLY — saved from the validated saved layout via
`paneIdsFromLayout`, live from the adapter's own `hostedPanes` ownership map via `ownedIds()`.
Deriving both from the saved layout would make the comparison a tautology.

| Saved | Live | Result | Reason code |
| --- | --- | --- | --- |
| `pty1,pty2,library` | `library,pty2,pty1` | **allowed** | — order alone is never a mismatch |
| `[]` | `[]` | **allowed** | — |
| `pty1,pty2` | `pty1` | refused | `saved-panes-not-live` |
| `pty1` | `pty1,pty2` | refused | `live-panes-not-saved` |
| `pty1,pty3` | `pty1,pty2` | refused | `pane-set-mismatch` (equal counts, different IDs) |
| `pty1,pty1` | `pty1` | refused | `duplicate-pane-id` |
| non-array / bad ID / oversize | any | refused | `pane-set-invalid` |

The UI reports COUNTS and a bounded code. It never echoes a pane ID — asserted by regex on every
refusal result and on every status string, in both the pure suite and the real-app harness.

## C5. Transactional failure and rollback evidence

Proven in `dockview-adapter-lifecycle.test.js` against a fake that reproduces the vendor's real
`fromJSON` lifecycle (clear, then rebuild through `createComponent` + `init()`), with a
TRANSIENT-vs-PERSISTENT fault distinction — a transient fault is a saved layout the vendor chokes on
while the snapshot Dockview itself serialized still applies; a persistent fault breaks the
rollback's own `fromJSON` too.

| Fault | Detected as | Rollback | PTYs created / killed |
| --- | --- | --- | --- |
| throw after `clear()` | `layout-apply-threw` | `restored` | 0 / 0 |
| throw mid-rebuild | `layout-apply-threw` | `restored` | 0 / 0 |
| a pane SILENTLY dropped (no throw) | `layout-apply-incomplete` | `restored` | 0 / 0 |
| an UNEXPECTED extra panel | `unexpected-panel-after-apply` | `restored` | 0 / 0 |
| panel enumeration throws once | `layout-apply-incomplete` | `restored`, original identities intact | 0 / 0 |
| otherwise-valid apply leaves one owning group hidden | `layout-apply-incomplete` | `restored`, original identities intact | 0 / 0 |
| persistent fault — rollback fails too | `layout-apply-incomplete` | **`incomplete`, and said so** | 0 / 0 |
| panel enumeration stays unavailable or non-array | `layout-apply-incomplete` | **`incomplete`, never falsely restored** | 0 / 0 |
| unusable rollback snapshot | `rollback-snapshot-invalid` | never applied at all | 0 / 0 |
| Reset: throw after `clear()` | `layout-apply-threw` | `restored`, identities intact | 0 / 0 |

There is deliberately **no second rollback strategy**. The prototype fell back to clearing and
re-adding every pane through `addPane`, which changes the topology and re-docks the Library — a
REPAIR, not a rollback. An honest "the previous arrangement could not be fully put back" beats a
quiet substitution, so an incomplete rollback is reported and pinned.

**Element identity across a real `fromJSON`** is proven in the application harness, not just the
fake: each live `.term-pane` is stamped with a random tag while the panes are in separate groups,
and the same tags are present after Restore and after Reset.

## C6. Honest UI and concurrency

Four ENABLED controls with stable ids replace Phase B's three disabled placeholders; the
`data-phase="c"` marker is gone and its absence is a negative control. Status text distinguishes:
saved · restored · current arrangement reset · saved arrangement cleared · refused with a bounded
reason · rollback succeeded · rollback incomplete · an operation already running.

Exclusivity has **two independent lines of defence**, and both are measured in the real app:

1. **The DOM.** All four controls are disabled for the duration and the status names the running
   operation. Twelve further clicks during a 600 ms held IPC fire no handler at all.
2. **The adapter.** The harness then forces the buttons enabled and clicks again, so the handlers
   really do run mid-flight — `runExclusive` refuses each with `layout-operation-in-progress`
   (4 bounded refusals logged) and the status says which operation holds the layout.

Across that burst, main saw exactly **six** loads — the five malformed restores plus the one real
one — and **zero** extra resets. The busy flag is released in `finally`, proven by a bridge that
throws: the operation propagates, `busyOperation()` returns to null, and the next operation is
accepted.

## C7. Exact files

New:

| Path | What it is |
| --- | --- |
| `app/dockview-layout-policy.js` | THE shared schema authority. Pure, dependency-free, IIFE-enclosed, dual-exported (CommonJS + `window.ccDockviewLayoutPolicy`). |
| `app/dockview-layout-policy.test.js` | Its pure suite. **182 assertions.** The corrective delta rejects hidden pane-bearing nodes while retaining explicit `visible:true`. |

Modified:

| Path | Change |
| --- | --- |
| `app/dockview-layout-store.js` | Reduced to the FILE boundary; every schema decision delegated to the policy and re-exported. `reset()` reports `existed`. The corrective delta uses one atomic rename without deleting the canonical file first, and maps only `ENOENT` to absence. |
| `app/renderer/dockview-prototype.js` | The four operations, `runExclusive`, the single `applyValidatedLayout` call site, `captureWorkspace` / `verifyApplied` / `rollbackWorkspace` / `applyAsTransaction`, the four enabled controls; `useDefaultLayout` deleted; `ccDockviewLayoutPolicy` added to the required exports. Enumeration failures fail closed; post-apply verification now also requires each panel's owning group to be connected and non-zero while permitting an inactive tab body to be hidden. |
| `app/renderer/app.js` | `../dockview-layout-policy.js` added to `DOCKVIEW_SCRIPTS`, before the adapter. |
| `app/main.js` | `dockview-layout-load` returns the WHOLE envelope so the renderer can validate schema version, package identity and timestamp too; `dockview-layout-reset` returns `existed`. |
| `app/package.json` | Wired `dockview-layout-policy.test.js` into the `test` script. |
| `app/dockview-default-path.test.js` | Phase-C structure: one-validator, prototype-file ban, the four contracts, single `fromJSON` site, exclusivity, controls. 295 → **371**. |
| `app/dockview-bootstrap-harness.js` / `.test.js` | Six-script chain, `missing-layout-policy` scenario, four-enabled-control expectations. 182 → **203**. |
| `app/dockview-app-harness.js` / `dockview-app-integration.test.js` | Four Phase-C scenarios driving the real controls against an in-memory store running the real validators, including a real-control hidden-group corruption. 180 → **291**. |
| `app/renderer/dockview-adapter-lifecycle.test.js` | Real layout shapes throughout, the set matrix, malformed state, the transaction/rollback table, the four operations, exclusivity, fail-closed panel enumeration, group reachability, and honest file-inspection refusal. 203 → **376**. |

No PowerShell changed, so the Pester total is unchanged.

## C8. Exact gate results

| Suite | Result |
| --- | --- |
| `dockview-layout-policy` (shared policy) | **182 passed, 0 failed** |
| `dockview-layout-store` | **134 passed, 0 failed** |
| `dockview-default-path` | **371 passed, 0 failed** |
| `dockview-app-integration` (application harness) | **291 passed, 0 failed** |
| `dockview-bootstrap` | **203 passed, 0 failed** |
| `dockview-adapter-lifecycle` | **376 passed, 0 failed** |
| `dockview-package-identity` | 47 passed, 0 failed |
| `dockview-fit-policy` / `dockview-panel-policy` | 59 / 71 passed, 0 failed |
| `test-reachability` | 6 passed, 0 failed |
| terminal / Library / Copy Output / audio focused suites | `pane-maximize` 40, `library-view` 36, `library-ipc` 30, `report-followup` 40, `term-copy` 53, `clipboard-consumer` 30, `stt-target-lock` 16, `stt` 19, `tts` 47 — all 0 failed |

| Gate | Result |
| --- | --- |
| **Full app gate** (`npm test`, 44 suites) | **GREEN — 3,081 assertions, 0 failed** after `9d1efb8` |
| **Full Pester gate** (`scripts/run-pester.ps1`, 35 suites) | Phase-C delivery evidence: **GREEN — 955 passed, 0 failed, 0 skipped**. Corrective-tip Codex rerun: 954 assertions passed and the one installed-Gemini-CLI policy-load check failed before its assertion because Codex's credential-scrubbed process has no `GEMINI_API_KEY`. See the reproducibility note below. |
| Reachability | GREEN — the new suite is wired into `app/package.json` |
| Node syntax | `node --check` on all 21 changed/new `.js` files in the cumulative range — GREEN |
| PowerShell parsing | `[Parser]::ParseFile` over all 71 tracked `.ps1`/`.psm1` files — **0 parse errors** |
| Whitespace | `git diff --check` — clean |
| Package identity / no-React | 47 passed, 0 failed; `dockview` pinned to exactly `7.0.4` |
| Dockview tripwire | `remoteRequestCount: 0` (file mainFrame ×1, script ×1) |
| Application-harness network census | `remoteRequestCount: 0` across all fourteen scenarios |

### Assertion-count reconciliation from 2,508/0

| Suite | Phase B | Phase C | Δ | Why |
| --- | --- | --- | --- | --- |
| `dockview-layout-policy` | — | 182 | **+182** | Shared identity, purity/enclosure, closed reasons, ID extraction, set matrix, canonical order, default arrangement, and hidden-node refusal. |
| `dockview-layout-store` | 124 | 134 | **+10** | ENOENT discrimination, real Windows overwrite, failed-replacement byte preservation, temp cleanup, and the no-canonical-delete interruption tripwire. |
| `dockview-default-path` | 295 | 371 | **+76** | One-validator scan, prototype-file ban, store-boundary guards, the four contracts, single `fromJSON` site, exclusivity, control ids; the `useDefaultLayout` / placeholder assertions became negative controls. |
| `dockview-bootstrap` | 182 | 203 | **+21** | Six-script chain, the `missing-layout-policy` scenario, four-enabled-control expectations. |
| `dockview-app-integration` | 180 | 291 | **+111** | Four Phase-C scenarios plus the real-control hidden-group corruption; exact-set, malformed-state, and concurrency coverage. |
| `dockview-adapter-lifecycle` | 203 | 376 | **+173** | Transactions, exact sets, operations, enumeration faults, hidden-group rollback, inactive-tab allowance, and read-failure UI honesty. |
| all other suites | 1,524 | 1,524 | 0 | Untouched. |
| **Total** | **2,508** | **3,081** | **+573** | 182 + 10 + 76 + 21 + 111 + 173 = **+573**. ✔ |

### Corrected-tip Pester reproducibility note

Both corrective rounds change only app JavaScript and Node/Electron tests; no PowerShell source,
Pester suite, Gemini policy, or CLI configuration changed. The Phase-C delivery's full Pester gate
was 955/0/0. On the corrective-tip finalization run, all 954 repository assertions completed green, but the one
machine-installed CLI check invoked `gemini --policy <tracked-file> --list-extensions` and the
currently installed CLI refused before the assertion because Codex correctly has no provider key
in its process environment. A process-local non-secret placeholder was attempted once; the CLI
hung at the same check until the 240-second bound, so that run is explicitly discarded rather than
misrepresented as evidence. No key was read, requested, logged, or persisted. A merge gate must
reproduce the literal 955/0/0 result in Blue's authorized environment; the prior green result and
the current 954 passing assertions do not waive that gate.

### The prototype evidence file

`%APPDATA%\command-center\dockview-prototype-layout.json` — size 1,653 bytes, mtime **2026-08-07
12:32**, MD5 `12b7911f2cf1fe9cb548dfe5fc1416f2`, unchanged by every gate in this phase. The
production file `dockview-layout.json` **was never created** in userData: the application harness
owns an in-memory store, so a gate run cannot touch the real path.

## C9. Negative controls (against the pre-Phase-C tip `79829f3`)

Run by checking `79829f3` into a throwaway detached worktree, copying the new suites in, and running
them. The worktree was removed afterwards and `git worktree list` is back to its prior contents.

| # | Control | Result — it DOES fail against `79829f3` |
| --- | --- | --- |
| 1 | **Missing exact-set comparison** | `dockview-default-path` **314✓/57✗**: "Restore validates the WHOLE envelope again in the renderer", "and before capturing the rollback target", "the LIVE set comes from the adapter's own ownership map" all fail. `dockview-layout-policy` **169✓/9✗**: the store re-exports none of the shared functions, including `comparePaneSets`. |
| 2 | **Renderer calling `fromJSON` without immediate validation** | `api.fromJSON appears exactly ONCE in the adapter (saw 2)` fails, as do "it lives inside applyValidatedLayout", "which validates through the SHARED policy IMMEDIATELY BEFORE applying", and "a validation failure returns the bounded reason and never reaches fromJSON". |
| 3 | **Reset creating terminals** | "NEGATIVE CONTROL: `useDefaultLayout` appears nowhere in the adapter code" fails, as do its refusal-reason and `createTerminalPane()` counterparts; `dockview-adapter-lifecycle` asserts `instance.useDefaultLayout === undefined`. |
| 4 | **Enabled overlapping operations** | All four "runs under runExclusive" assertions fail. In the real app the harness reads three controls with **no ids, all three disabled**, and no Reset control at all — every Phase-C click returns `control-missing`. |
| 5 | **Restore with extra live panes** | **Behavioural probe** against the `79829f3` adapter: two live panes, a saved layout naming one. Result `{"ok":true}` — the restore reported SUCCESS while leaving `pty2` owned with **no panel** (`panels after: ["pty1"]`, `mounted: ["pty1"]`): a live terminal stranded and invisible. Phase C refuses this as `live-panes-not-saved` before `fromJSON`. |
| 6 | **Content-bearing refusal text** | **Behavioural probe**: the `79829f3` refusal reads `"Restore refused: 1 saved pane(s) are not open (pty2). Open them first…"` — a pane ID in the UI. Phase C's equivalent reads `"Restore refused (saved-panes-not-live): 1 saved pane(s) are not open. Open them first…"`, and every refusal string is regex-checked for `pty\d`. |

Aggregate against `79829f3`: `dockview-bootstrap` **187✓/14✗**; `dockview-adapter-lifecycle` aborts
with `TypeError: instance.restoreArrangement is not a function`; `dockview-app-integration` aborts
because the pre-Phase-C controls cannot save anything for the malformed scenario to corrupt.

## C10. Deviations and limitations

* **One deliberate contract change beyond the letter of the work order:** `dockview-layout-load` now
  returns the WHOLE envelope instead of `{ layout, savedAt }`. The order requires the renderer to
  validate before `fromJSON`, and validating the ENVELOPE (not just the layout) also checks the
  schema version, package identity and timestamp — which unwrapping in main would silently discard.
  `dockview-layout-reset` likewise now returns `existed`, which is what lets Clear distinguish a
  deletion from an equally successful no-op.
* **`Reset Current Arrangement` collapses splits into an even row.** That is what "reset" means here,
  and it is stated in the button's own tooltip and in the status text. It is not a no-op for a user
  who liked their arrangement — but it is deterministic, reversible by Restore if they saved one,
  and it never closes anything.
* **Escape still does not exit a Dockview maximize**, and **`switchTab` still does not clear one**
  (both carried over from Phase B, § 9).
* **The application harness owns an in-memory saved-layout store.** It runs the real
  `dockview-layout-store` validators on both sides of that store, so the renderer is proven to be
  talking to a validating boundary — but the real `userData` file path itself is exercised only by
  `dockview-layout-store.test.js` (which uses temp directories), never by a gate run.
* **Phase-C additions to the closed reason set** (`pane-set-invalid`, `saved-panes-not-live`,
  `live-panes-not-saved`, `pane-set-mismatch`, `no-live-panes`, `pane-not-mounted`,
  `layout-apply-threw`, `layout-apply-incomplete`, `unexpected-panel-after-apply`,
  `pane-element-identity-changed`, `ownership-count-mismatch`, `rollback-snapshot-invalid`,
  `layout-operation-in-progress`) are new codes, not new content: each is asserted to be a short
  kebab-case string inside `REASON_CODES`.
* **Retained prototype-era internal names** are unchanged from PART ONE § 7 —
  `renderer/dockview-prototype.js`, `window.ccDockviewPrototype`, the
  `.dockview-prototype-*` CSS class family, and the `dockview-prototype: Library home` placeholder
  comment. The new module deliberately does NOT inherit that prefix: it is
  `dockview-layout-policy.js` / `ccDockviewLayoutPolicy`.
* **No human acceptance was performed**, and none is requested by this handoff.

## C11. Recommended review focus for Phase C

1. `applyValidatedLayout` being the only `fromJSON` call site, and whether any future path could
   bypass it.
2. `comparePaneSets` and its two independent input sources — the tautology this exists to prevent.
3. `rollbackWorkspace`: one attempt, no repair, and the honesty of `restored` vs `incomplete`.
4. `buildDefaultArrangement`: that it can only ever describe panes it was handed.
5. `runExclusive`'s `finally` release, and the two defence lines against overlapping operations.
6. The `dockview-layout-load` envelope contract change in `main.js`.
7. `verifyApplied` refusing every panel-enumeration failure as `layout-apply-incomplete`, while
   retaining `unexpected-panel-after-apply` only for a successfully enumerated mismatch.

## C12. Corrective finalization — panel enumeration must fail closed

Independent review of the original Phase-C tip found a real fail-open branch at
`app/renderer/dockview-prototype.js`: if reading `api.panels` threw, the verifier converted the
result to `null` and silently skipped the unexpected-panel check. That tip was therefore not
approved for final review.

Correction `d203b631b566c1cdb6ba2d645b4494f793aa9fab` removes the nullable bypass. Reading
`api.panels` must succeed and return an array before verification can continue. A throwing getter,
an unavailable value, or a non-array value refuses as the existing bounded reason
`layout-apply-incomplete`. Only an array that can be enumerated and contains an unexpected panel
uses `unexpected-panel-after-apply`.

The lifecycle fake now exposes three explicit enumeration faults. A transient throwing getter
proves bounded refusal, successful rollback, every original pane-element identity restored, and
zero PTY creation or closure. Persistent unavailable and non-array values prove that both the
attempt and its one rollback verification refuse, so rollback is reported `incomplete` rather than
falsely `restored`; PTY creation and closure remain zero. The focused lifecycle suite moved from
338 to **359 assertions**, all green.

This correction authorizes only the finalization route. It does not constitute a review of the
cumulative production diff. That remains the purpose of the fresh Full-class review after the two
pinned artifacts are recorded. That review subsequently returned FAIL; § C14 supersedes this
pre-review status while preserving it as the exact chronology.

## C13. Final pinned review artifacts

The reviewed-code tip is **`fba57dc44b746b403ce870bd5496a30392b3a7df`**. Both artifacts were
created with `git diff --output`, remain gitignored local review evidence, and were independently
regenerated from the stated range. Each regeneration matched the pinned file in both byte count and
SHA-256 identity.

| Purpose | Exact three-dot range | Pinned file | Exact size | SHA-256 | Diff shortstat |
| --- | --- | --- | ---: | --- | --- |
| Isolated production adoption after the accepted prototype | `a78a3e424f8fa763ca6d98525fdf3aae85e12fda...fba57dc44b746b403ce870bd5496a30392b3a7df` | `.agent-review-dockview-production-adoption.diff` | **622,269 bytes** | `426f645e94bdef9cfc249116e9bae3fc866371feba48ccdfc49f80c1d6a3661d` | 22 files; 6,794 insertions; 2,169 deletions |
| Cumulative merge delta and merge-gate artifact | `1dce24c141e929c04122e8b2998277d4c2d0c728...fba57dc44b746b403ce870bd5496a30392b3a7df` | `.agent-review-dockview-production-integration.diff` | **737,780 bytes** | `6670c2c044f48ee0e5e01b500a0fe7c8b341950f869af3d637f8615b49e77a24` | 32 files; 12,436 insertions; 39 deletions |

The isolated artifact is the production-adoption review surface. The cumulative artifact is the
reproducible delta from recorded pre-merge `main` and is the artifact a later merge-gate plan must
name. This handoff-only tail is intentionally excluded from both artifacts. At the time they were
pinned, no Full-class verdict, human acceptance, merge, or push existed; § C14 records the later
FAIL verdict. Acceptance, merge, and push still do not exist.

## C14. First cumulative Full-class review — FAIL, then bounded correction

### Reviewer verdict and source

Source: fresh independent read-only Full-class Reviewer subprocess, August 8, 2026, over cumulative
reviewed-code tip `fba57dc44b746b403ce870bd5496a30392b3a7df`. The Reviewer independently
verified both § C13 artifact byte counts and SHA-256 identities, reviewed the cumulative production
boundary, and returned two MEDIUM findings plus one LOW. The Pester credential-environment caveat
was explicitly not a basis for its code verdict.

> VERDICT: FAIL

| Severity | Finding | Corrective disposition in `9d1efb839a1f5312626c9445d35f3fa3b88d8d41` |
| --- | --- | --- |
| MEDIUM | `dockview-layout-store.js` removed the canonical file before retrying a Windows replacement, so a second failure or interruption could erase the previous valid arrangement while the UI promised it was unchanged. | Save now performs exactly one atomic temp-to-canonical rename. A failed rename cleans only its unique temp file. Real Windows overwrite, injected replacement failure, byte preservation, and a source tripwire proving Save never removes `layoutPath` are green. |
| MEDIUM | The policy accepted `visible:false`, and post-apply verification proved mounting/IDs/identity/counts but not whether the owning group remained reachable. Restore could therefore report success with a live PTY in a hidden group. | The shared validator refuses `visible:false` before `fromJSON`. Post-apply verification independently requires every panel's owning group to be connected and non-zero. The check is group-based so an inactive tab body remains valid and recoverable through its visible tab strip. A transient hidden-group fault proves bounded refusal, rollback, original identities, and zero PTY creation/closure. |
| LOW | Every `lstatSync` error was reported as `no-saved-layout`, including access denial and I/O failure. | Only `ENOENT` maps to `no-saved-layout`; all other inspection errors map to bounded `read-failed`. Store tests cover `ENOENT`, `EACCES`, and `EIO`, and lifecycle coverage proves the UI no longer claims absence. |

### Corrective gates

* Focused non-Electron set: **1,069 passed, 0 failed** — reachability 6, policy 182, store 134,
  default path 371, lifecycle 376.
* Real application harness: **291 passed, 0 failed**, including six malformed saved-state controls
  and `remoteRequestCount: 0` across all fourteen scenarios.
* Full app gate: **3,081 assertions, 0 failed**, 44 suites.
* Dockview tripwire: `remoteRequestCount: 0` under strict CSP.
* Full Pester attempt at the corrective commit: **954 passed, 1 environment-dependent failure, 0
  skipped** — solely the installed Gemini CLI requiring `GEMINI_API_KEY` before its no-request
  `--list-extensions` assertion. No PowerShell or Gemini surface changed; § C8's merge-time 955/0/0
  requirement remains unwaived.

The correction is built and gated, not reviewed or accepted. The next review scope is the exact
corrective delta from prior handoff-only tip `83b8cfa1206ab21d07befcf0664c584eea64a379` to the new
corrective reviewed-code tip. A fresh focused Full-class delta review must return its own literal
verdict. No prior PASS exists to inherit, and the original cumulative verdict remains FAIL.

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

Not started, and not authorised by this handoff: focused Full-class delta review, human acceptance,
merge, push, pane-status (R4) work, unrelated cleanup.

**FULL-CLASS FAIL CORRECTED — FOCUSED FULL-CLASS DELTA REVIEW NOT YET REQUESTED**
